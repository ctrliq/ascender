package models

import (
	"context"
	"encoding/json"
	"sort"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/rbac"
)

// RoleFactory creates the implicit roles for a new object and rebuilds the
// ancestor closure for them, reproducing what the old ImplicitRoleField did
// on save. ParentRoleIDs resolves "fk.role_field" parents to concrete role
// ids for the object being created; the caller supplies a lookup for the
// related objects it knows about (for a project, its organization).
type RoleFactory struct {
	CT *ContentTypes
}

// ParentLookup resolves a parent spec such as "organization.project_admin_role"
// to a role id, or nil when the related object is absent.
type ParentLookup func(spec string) *int64

// CreateRoles inserts one main_rbac_roles row per field, links parents and
// rebuilds ancestors. model is the lower-case Django model name.
func (f RoleFactory) CreateRoles(ctx context.Context, tx pgx.Tx, model string, ctID, objectID int64, fields []string, lookup ParentLookup) (map[string]int64, error) {
	roles := map[string]int64{}
	for _, field := range fields {
		var id int64
		if err := tx.QueryRow(ctx, `INSERT INTO main_rbac_roles (role_field, singleton_name, implicit_parents, content_type_id, object_id) VALUES ($1, NULL, '[]', $2, $3) RETURNING id`,
			field, ctID, objectID).Scan(&id); err != nil {
			return nil, err
		}
		roles[field] = id
	}
	// Parents: same-object roles, related-object roles and singletons.
	// implicit_parents records the resolved parent ids, sorted, as the old
	// ImplicitRoleField wrote them (json.dumps of a sorted id list).
	for _, field := range fields {
		child := roles[field]
		var resolved []int64
		for _, p := range rbac.ImplicitParents[model+"."+field] {
			var parent *int64
			switch {
			case strings.HasPrefix(p, "singleton:"):
				id, err := rbac.SingletonRoleID(ctx, tx, strings.TrimPrefix(p, "singleton:"))
				if err == nil {
					parent = &id
				}
			case !strings.Contains(p, "."):
				if id, ok := roles[p]; ok {
					parent = &id
				}
			default:
				if lookup != nil {
					parent = lookup(p)
				}
			}
			if parent == nil {
				continue
			}
			resolved = append(resolved, *parent)
			if _, err := tx.Exec(ctx, `INSERT INTO main_rbac_roles_parents (from_role_id, to_role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, child, *parent); err != nil {
				return nil, err
			}
		}
		if _, err := tx.Exec(ctx, `UPDATE main_rbac_roles SET implicit_parents = $2 WHERE id = $1`, child, implicitParentsJSON(resolved)); err != nil {
			return nil, err
		}
	}
	ids := make([]int64, 0, len(roles))
	for _, id := range roles {
		ids = append(ids, id)
	}
	if err := RebuildRoleAncestors(ctx, tx, ids); err != nil {
		return nil, err
	}
	return roles, nil
}

// RebuildRoleAncestors recomputes main_rbac_role_ancestors for the given
// roles (and their descendants). Every role is its own ancestor; the rest is
// the transitive closure over main_rbac_roles_parents.
func RebuildRoleAncestors(ctx context.Context, tx pgx.Tx, roleIDs []int64) error {
	if len(roleIDs) == 0 {
		return nil
	}
	// One rebuild at a time, held to commit. Without it two transactions
	// changing the parents of one role (a grant and a revoke) could each
	// rebuild from the parents as they saw them, and the one that saw the
	// other's old rows could leave them in the closure after both commit:
	// access kept after a revoke. With the lock, the later rebuild runs
	// after the earlier commits and reads every committed parent.
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock($1)`, db.AdvisoryLockKey("rbac_role_ancestors")); err != nil {
		return err
	}
	// Collect the affected set: the roles and everything beneath them.
	rows, err := tx.Query(ctx, `WITH RECURSIVE down AS (
		SELECT id FROM main_rbac_roles WHERE id = ANY($1)
		UNION
		SELECT p.from_role_id FROM main_rbac_roles_parents p JOIN down d ON p.to_role_id = d.id
	) SELECT id FROM down`, roleIDs)
	if err != nil {
		return err
	}
	var affected []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return err
		}
		affected = append(affected, id)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `DELETE FROM main_rbac_role_ancestors WHERE descendent_id = ANY($1)`, affected); err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `WITH RECURSIVE up AS (
		SELECT r.id AS descendent_id, r.id AS ancestor_id FROM main_rbac_roles r WHERE r.id = ANY($1)
		UNION
		SELECT u.descendent_id, p.to_role_id FROM main_rbac_roles_parents p JOIN up u ON p.from_role_id = u.ancestor_id
	)
	INSERT INTO main_rbac_role_ancestors (role_field, content_type_id, object_id, ancestor_id, descendent_id)
	SELECT d.role_field, COALESCE(d.content_type_id, 0), COALESCE(d.object_id, 0), u.ancestor_id, u.descendent_id
	FROM up u JOIN main_rbac_roles d ON d.id = u.descendent_id`, affected)
	return err
}

// DeleteRolesFor removes an object's roles, memberships and closure rows.
func DeleteRolesFor(ctx context.Context, tx pgx.Tx, ctID, objectID int64) error {
	if _, err := tx.Exec(ctx, `DELETE FROM main_rbac_role_ancestors WHERE descendent_id IN (SELECT id FROM main_rbac_roles WHERE content_type_id = $1 AND object_id = $2) OR ancestor_id IN (SELECT id FROM main_rbac_roles WHERE content_type_id = $1 AND object_id = $2)`, ctID, objectID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `DELETE FROM main_activitystream_role WHERE role_id IN (SELECT id FROM main_rbac_roles WHERE content_type_id = $1 AND object_id = $2)`, ctID, objectID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `DELETE FROM main_rbac_roles_members WHERE role_id IN (SELECT id FROM main_rbac_roles WHERE content_type_id = $1 AND object_id = $2)`, ctID, objectID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `DELETE FROM main_rbac_roles_parents WHERE from_role_id IN (SELECT id FROM main_rbac_roles WHERE content_type_id = $1 AND object_id = $2) OR to_role_id IN (SELECT id FROM main_rbac_roles WHERE content_type_id = $1 AND object_id = $2)`, ctID, objectID); err != nil {
		return err
	}
	_, err := tx.Exec(ctx, `DELETE FROM main_rbac_roles WHERE content_type_id = $1 AND object_id = $2`, ctID, objectID)
	return err
}

// RelinkParentRole replaces the related-object parents of an object's roles
// when a foreign key such as a project's organization changes.
//
// Every related-object parent rule of the models that relink ends at an
// organization role: organization.<field>, or for job templates also
// inventory.organization.<field>. Two rules can name the same field of
// different organizations (a template's organization and its inventory's),
// so the parents are not replaced rule by rule: for each role a rule of the
// changed key reaches, the organization roles its rules name now (lookup)
// replace every organization role parent with one of those fields. Other
// parents (same-object roles, singletons, the member roles of teams granted
// the role) are left alone.
func RelinkParentRole(ctx context.Context, tx pgx.Tx, model string, roles map[string]int64, fkName string, lookup ParentLookup) error {
	for field, roleID := range roles {
		var related []string
		touched := false
		for _, p := range rbac.ImplicitParents[model+"."+field] {
			if strings.HasPrefix(p, "singleton:") || !strings.Contains(p, ".") {
				continue
			}
			related = append(related, p)
			if strings.HasPrefix(p, fkName+".") {
				touched = true
			}
		}
		if !touched {
			continue
		}
		var raw string
		if err := tx.QueryRow(ctx, `SELECT implicit_parents FROM main_rbac_roles WHERE id = $1`, roleID).Scan(&raw); err != nil {
			return err
		}
		implicit := map[int64]bool{}
		var cur []int64
		if json.Unmarshal([]byte(raw), &cur) == nil {
			for _, id := range cur {
				implicit[id] = true
			}
		}
		want := map[int64]bool{}
		var fields []string
		for _, p := range related {
			fields = append(fields, p[strings.LastIndex(p, ".")+1:])
			if lookup != nil {
				if parent := lookup(p); parent != nil {
					want[*parent] = true
				}
			}
		}
		wantIDs := make([]int64, 0, len(want))
		for id := range want {
			wantIDs = append(wantIDs, id)
		}
		rows, err := tx.Query(ctx, `DELETE FROM main_rbac_roles_parents WHERE from_role_id = $1 AND to_role_id IN (
				SELECT r.id FROM main_rbac_roles r WHERE r.singleton_name IS NULL AND r.role_field = ANY($2)
				AND r.content_type_id = (SELECT id FROM django_content_type WHERE app_label = 'main' AND model = 'organization'))
			AND NOT to_role_id = ANY($3) RETURNING to_role_id`, roleID, fields, wantIDs)
		if err != nil {
			return err
		}
		for rows.Next() {
			var id int64
			if err := rows.Scan(&id); err != nil {
				rows.Close()
				return err
			}
			delete(implicit, id)
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return err
		}
		for _, id := range wantIDs {
			implicit[id] = true
			if _, err := tx.Exec(ctx, `INSERT INTO main_rbac_roles_parents (from_role_id, to_role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, roleID, id); err != nil {
				return err
			}
		}
		ids := make([]int64, 0, len(implicit))
		for id := range implicit {
			ids = append(ids, id)
		}
		if _, err := tx.Exec(ctx, `UPDATE main_rbac_roles SET implicit_parents = $2 WHERE id = $1`, roleID, implicitParentsJSON(ids)); err != nil {
			return err
		}
	}
	ids := make([]int64, 0, len(roles))
	for _, id := range roles {
		ids = append(ids, id)
	}
	return RebuildRoleAncestors(ctx, tx, ids)
}

// implicitParentsJSON renders parent role ids as json.dumps of the sorted
// list did: "[1, 15, 1000]".
func implicitParentsJSON(ids []int64) string {
	sorted := append([]int64(nil), ids...)
	sort.Slice(sorted, func(a, b int) bool { return sorted[a] < sorted[b] })
	parts := make([]string, 0, len(sorted))
	seen := map[int64]bool{}
	for _, id := range sorted {
		if seen[id] {
			continue
		}
		seen[id] = true
		parts = append(parts, strconv.FormatInt(id, 10))
	}
	return "[" + strings.Join(parts, ", ") + "]"
}
