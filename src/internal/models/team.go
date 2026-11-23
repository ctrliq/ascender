package models

import (
	"context"

	"github.com/jackc/pgx/v5"
)

// TeamRoleFields are the implicit roles of a team.
var TeamRoleFields = []string{"admin_role", "member_role", "read_role"}

// TeamWrite is what creating or editing a team sets.
type TeamWrite struct {
	ID             int64
	Name           string
	Description    string
	OrganizationID int64
	ActorID        *int64
}

// InsertTeam creates a team with its implicit roles (whose parents are the
// organization's admin and auditor roles) and registers it.
func InsertTeam(ctx context.Context, tx pgx.Tx, t *TeamWrite, cts *ContentTypes, orgRole func(field string) *int64) error {
	if err := tx.QueryRow(ctx, `INSERT INTO main_team (created, modified, description, name, created_by_id, modified_by_id, organization_id)
		VALUES (now(), now(), $1, $2, $3, $3, $4) RETURNING id`, t.Description, t.Name, t.ActorID, t.OrganizationID).Scan(&t.ID); err != nil {
		return err
	}
	factory := RoleFactory{CT: cts}
	lookup := func(spec string) *int64 {
		if len(spec) > len("organization.") && spec[:len("organization.")] == "organization." {
			return orgRole(spec[len("organization."):])
		}
		return nil
	}
	roles, err := factory.CreateRoles(ctx, tx, "team", cts.ID("main.team"), t.ID, TeamRoleFields, lookup)
	if err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `UPDATE main_team SET admin_role_id = $2, member_role_id = $3, read_role_id = $4 WHERE id = $1`,
		t.ID, roles["admin_role"], roles["member_role"], roles["read_role"]); err != nil {
		return err
	}
	return RegisterResource(ctx, tx, "shared.team", t.ID, t.Name)
}

// UpdateTeam writes a team's name and description.
func UpdateTeam(ctx context.Context, tx pgx.Tx, t *TeamWrite) error {
	if _, err := tx.Exec(ctx, `UPDATE main_team SET name = $2, description = $3, modified = now(), modified_by_id = $4 WHERE id = $1`, t.ID, t.Name, t.Description, t.ActorID); err != nil {
		return err
	}
	return RenameResource(ctx, tx, "shared.team", t.ID, t.Name)
}

// DeleteTeam removes a team, its roles and its registry entry, and rebuilds
// the ancestors of roles that had inherited from the team (what the team
// was given).
func DeleteTeam(ctx context.Context, tx pgx.Tx, id int64, cts *ContentTypes, cascader *Cascader) error {
	teamCT := cts.ID("main.team")
	rows, err := tx.Query(ctx, `SELECT DISTINCT a.descendent_id FROM main_rbac_role_ancestors a
		WHERE a.ancestor_id IN (SELECT id FROM main_rbac_roles WHERE content_type_id = $1 AND object_id = $2)
		AND a.descendent_id NOT IN (SELECT id FROM main_rbac_roles WHERE content_type_id = $1 AND object_id = $2)`, teamCT, id)
	if err != nil {
		return err
	}
	var dependants []int64
	for rows.Next() {
		var rid int64
		if err := rows.Scan(&rid); err != nil {
			rows.Close()
			return err
		}
		dependants = append(dependants, rid)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	if err := UnregisterResource(ctx, tx, "shared.team", id); err != nil {
		return err
	}
	if err := cascader.Delete(ctx, tx, "main_team", "id", []int64{id}); err != nil {
		return err
	}
	if err := DeleteRolesFor(ctx, tx, teamCT, id); err != nil {
		return err
	}
	if len(dependants) > 0 {
		return RebuildRoleAncestors(ctx, tx, dependants)
	}
	return nil
}
