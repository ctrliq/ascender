package models

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/db"
)

// Organization is a main_organization row.
type Organization struct {
	ID                   int64
	Created              time.Time
	Modified             time.Time
	Name                 string
	Description          string
	CreatedByID          *int64
	ModifiedByID         *int64
	MaxHosts             int64
	DefaultEnvironmentID *int64

	// Role ids, in the order the old model declared them.
	AdminRoleID, ExecuteRoleID, ProjectAdminRoleID, InventoryAdminRoleID, CredentialAdminRoleID,
	WorkflowAdminRoleID, NotificationAdminRoleID, JobTemplateAdminRoleID, ExecutionEnvironmentAdminRoleID,
	AuditorRoleID, MemberRoleID, ReadRoleID, ApprovalRoleID *int64
}

// OrganizationRoleFields lists the role fields in declaration order.
var OrganizationRoleFields = []string{
	"admin_role", "execute_role", "project_admin_role", "inventory_admin_role", "credential_admin_role",
	"workflow_admin_role", "notification_admin_role", "job_template_admin_role", "execution_environment_admin_role",
	"auditor_role", "member_role", "read_role", "approval_role",
}

// OrganizationColumns is the select list for the alias "o".
const OrganizationColumns = `o.id, o.created, o.modified, o.name, o.description, o.created_by_id, o.modified_by_id, o.max_hosts, o.default_environment_id,
	o.admin_role_id, o.execute_role_id, o.project_admin_role_id, o.inventory_admin_role_id, o.credential_admin_role_id,
	o.workflow_admin_role_id, o.notification_admin_role_id, o.job_template_admin_role_id, o.execution_environment_admin_role_id,
	o.auditor_role_id, o.member_role_id, o.read_role_id, o.approval_role_id`

// ScanOrganization reads a row produced with OrganizationColumns.
func ScanOrganization(r pgx.Row) (*Organization, error) {
	o := &Organization{}
	err := r.Scan(&o.ID, &o.Created, &o.Modified, &o.Name, &o.Description, &o.CreatedByID, &o.ModifiedByID, &o.MaxHosts, &o.DefaultEnvironmentID,
		&o.AdminRoleID, &o.ExecuteRoleID, &o.ProjectAdminRoleID, &o.InventoryAdminRoleID, &o.CredentialAdminRoleID,
		&o.WorkflowAdminRoleID, &o.NotificationAdminRoleID, &o.JobTemplateAdminRoleID, &o.ExecutionEnvironmentAdminRoleID,
		&o.AuditorRoleID, &o.MemberRoleID, &o.ReadRoleID, &o.ApprovalRoleID)
	if err != nil {
		return nil, err
	}
	return o, nil
}

// RoleID returns the role id for a role field name.
func (o *Organization) RoleID(field string) *int64 {
	switch field {
	case "admin_role":
		return o.AdminRoleID
	case "execute_role":
		return o.ExecuteRoleID
	case "project_admin_role":
		return o.ProjectAdminRoleID
	case "inventory_admin_role":
		return o.InventoryAdminRoleID
	case "credential_admin_role":
		return o.CredentialAdminRoleID
	case "workflow_admin_role":
		return o.WorkflowAdminRoleID
	case "notification_admin_role":
		return o.NotificationAdminRoleID
	case "job_template_admin_role":
		return o.JobTemplateAdminRoleID
	case "execution_environment_admin_role":
		return o.ExecutionEnvironmentAdminRoleID
	case "auditor_role":
		return o.AuditorRoleID
	case "member_role":
		return o.MemberRoleID
	case "read_role":
		return o.ReadRoleID
	case "approval_role":
		return o.ApprovalRoleID
	}
	return nil
}

// GetOrganization loads one organization.
func GetOrganization(ctx context.Context, q db.Querier, id int64) (*Organization, error) {
	return ScanOrganization(q.QueryRow(ctx, `SELECT `+OrganizationColumns+` FROM main_organization o WHERE o.id = $1`, id))
}

// LoadOrganizationSummaries returns {id,name,description} for ids.
func LoadOrganizationSummaries(ctx context.Context, q db.Querier, ids []int64) (map[int64]NameSummary, error) {
	return loadNameSummaries(ctx, q, `SELECT id, name, description FROM main_organization WHERE id = ANY($1)`, ids)
}

func loadNameSummaries(ctx context.Context, q db.Querier, sql string, ids []int64) (map[int64]NameSummary, error) {
	out := map[int64]NameSummary{}
	if len(ids) == 0 {
		return out, nil
	}
	rows, err := q.Query(ctx, sql, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var s NameSummary
		if err := rows.Scan(&s.ID, &s.Name, &s.Description); err != nil {
			return nil, err
		}
		out[s.ID] = s
	}
	return out, rows.Err()
}

// OrganizationCounts is summary_fields.related_field_counts.
type OrganizationCounts struct {
	Users, Admins, Inventories, Teams, Projects, JobTemplates, Hosts int64
}

// CountScope restricts related counts to what a user may read; nil means
// everything (superusers and auditors).
type CountScope struct {
	UserID int64
	CT     *ContentTypes
}

func accessibleClause(scope *CountScope, pk, ctKey string, arg int) string {
	if scope == nil {
		return ""
	}
	return fmt.Sprintf(" AND %s IN (SELECT a.object_id FROM main_rbac_role_ancestors a WHERE a.ancestor_id IN (SELECT m.role_id FROM main_rbac_roles_members m WHERE m.user_id = $%d) AND a.content_type_id = %d AND a.role_field = 'read_role')", pk, arg, scope.CT.ID(ctKey))
}

// LoadOrganizationCounts computes the related counts for a page of
// organizations. withHosts adds the distinct active host count the detail
// view carried.
func LoadOrganizationCounts(ctx context.Context, q db.Querier, orgs []*Organization, scope *CountScope, withHosts bool) (map[int64]OrganizationCounts, error) {
	out := map[int64]OrganizationCounts{}
	if len(orgs) == 0 {
		return out, nil
	}
	ids := make([]int64, len(orgs))
	for i, o := range orgs {
		ids[i] = o.ID
	}
	args := []any{ids}
	userArg := 0
	if scope != nil {
		args = append(args, scope.UserID)
		userArg = 2
	}
	// The distinct host count reads every host of the organization; only
	// the detail view shows it.
	hostsSQL := "-1"
	if withHosts {
		hostsSQL = `(SELECT count(DISTINCT h.name) FROM main_host h JOIN main_inventory i ON i.id = h.inventory_id WHERE i.organization_id = o.id AND i.kind <> 'constructed'
		     AND NOT EXISTS (SELECT 1 FROM main_host_inventory_sources his JOIN main_inventorysource src ON src.unifiedjobtemplate_ptr_id = his.inventorysource_id WHERE his.host_id = h.id AND src.source = 'ascender'))`
	}
	sql := `
		SELECT o.id,
		  (SELECT count(DISTINCT m.user_id) FROM main_rbac_roles_members m WHERE m.role_id = o.member_role_id),
		  (SELECT count(DISTINCT m.user_id) FROM main_rbac_roles_members m WHERE m.role_id = o.admin_role_id),
		  (SELECT count(*) FROM main_inventory i WHERE i.organization_id = o.id` + accessibleClause(scope, "i.id", "main.inventory", userArg) + `),
		  (SELECT count(*) FROM main_team t WHERE t.organization_id = o.id` + accessibleClause(scope, "t.id", "main.team", userArg) + `),
		  (SELECT count(*) FROM main_unifiedjobtemplate u JOIN main_project p ON p.unifiedjobtemplate_ptr_id = u.id WHERE u.organization_id = o.id` + accessibleClause(scope, "u.id", "main.project", userArg) + `),
		  (SELECT count(*) FROM main_unifiedjobtemplate u JOIN main_jobtemplate j ON j.unifiedjobtemplate_ptr_id = u.id WHERE u.organization_id = o.id` + accessibleClause(scope, "u.id", "main.jobtemplate", userArg) + `),
		  ` + hostsSQL + `
		FROM main_organization o WHERE o.id = ANY($1)`
	rows, err := q.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id int64
		var c OrganizationCounts
		if err := rows.Scan(&id, &c.Users, &c.Admins, &c.Inventories, &c.Teams, &c.Projects, &c.JobTemplates, &c.Hosts); err != nil {
			return nil, err
		}
		if !withHosts {
			c.Hosts = -1
		}
		out[id] = c
	}
	return out, rows.Err()
}

// InsertOrganization creates the row and its roles.
func InsertOrganization(ctx context.Context, tx pgx.Tx, o *Organization, orgCT int64, roleFactory RoleFactory) error {
	err := tx.QueryRow(ctx, `INSERT INTO main_organization (created, modified, description, name, created_by_id, modified_by_id, max_hosts, default_environment_id)
		VALUES (now(), now(), $1, $2, $3, $4, $5, $6) RETURNING id, created, modified`,
		o.Description, o.Name, o.CreatedByID, o.ModifiedByID, o.MaxHosts, o.DefaultEnvironmentID).Scan(&o.ID, &o.Created, &o.Modified)
	if err != nil {
		return err
	}
	roles, err := roleFactory.CreateRoles(ctx, tx, "organization", orgCT, o.ID, OrganizationRoleFields, nil)
	if err != nil {
		return err
	}
	if err := RegisterResource(ctx, tx, "shared.organization", o.ID, o.Name); err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `UPDATE main_organization SET admin_role_id=$2, execute_role_id=$3, project_admin_role_id=$4, inventory_admin_role_id=$5, credential_admin_role_id=$6,
		workflow_admin_role_id=$7, notification_admin_role_id=$8, job_template_admin_role_id=$9, execution_environment_admin_role_id=$10,
		auditor_role_id=$11, member_role_id=$12, read_role_id=$13, approval_role_id=$14 WHERE id=$1`,
		o.ID, roles["admin_role"], roles["execute_role"], roles["project_admin_role"], roles["inventory_admin_role"], roles["credential_admin_role"],
		roles["workflow_admin_role"], roles["notification_admin_role"], roles["job_template_admin_role"], roles["execution_environment_admin_role"],
		roles["auditor_role"], roles["member_role"], roles["read_role"], roles["approval_role"])
	if err != nil {
		return err
	}
	for f, id := range roles {
		v := id
		switch f {
		case "admin_role":
			o.AdminRoleID = &v
		case "execute_role":
			o.ExecuteRoleID = &v
		case "project_admin_role":
			o.ProjectAdminRoleID = &v
		case "inventory_admin_role":
			o.InventoryAdminRoleID = &v
		case "credential_admin_role":
			o.CredentialAdminRoleID = &v
		case "workflow_admin_role":
			o.WorkflowAdminRoleID = &v
		case "notification_admin_role":
			o.NotificationAdminRoleID = &v
		case "job_template_admin_role":
			o.JobTemplateAdminRoleID = &v
		case "execution_environment_admin_role":
			o.ExecutionEnvironmentAdminRoleID = &v
		case "auditor_role":
			o.AuditorRoleID = &v
		case "member_role":
			o.MemberRoleID = &v
		case "read_role":
			o.ReadRoleID = &v
		case "approval_role":
			o.ApprovalRoleID = &v
		}
	}
	return nil
}

// UpdateOrganization writes the editable columns.
func UpdateOrganization(ctx context.Context, q db.Querier, o *Organization) error {
	if err := q.QueryRow(ctx, `UPDATE main_organization SET modified = now(), description = $2, name = $3, modified_by_id = $4, max_hosts = $5, default_environment_id = $6 WHERE id = $1 RETURNING modified`,
		o.ID, o.Description, o.Name, o.ModifiedByID, o.MaxHosts, o.DefaultEnvironmentID).Scan(&o.Modified); err != nil {
		return err
	}
	return RenameResource(ctx, q, "shared.organization", o.ID, o.Name)
}

// DeleteOrganization removes the organization and everything that depended
// on it, following the old on_delete rules: teams and credentials go with
// it, while projects, inventories and templates are detached (their
// organization becomes NULL) and keep their own roles, minus the inheritance
// from the organization's roles.
func DeleteOrganization(ctx context.Context, tx pgx.Tx, id int64, cts *ContentTypes, cascader *Cascader) error {
	orgCT := cts.ID("main.organization")
	// Roles that inherit from this organization's roles but belong to objects
	// that survive need their ancestor closure rebuilt afterwards.
	rows, err := tx.Query(ctx, `SELECT DISTINCT a.descendent_id FROM main_rbac_role_ancestors a
		WHERE a.ancestor_id IN (SELECT id FROM main_rbac_roles WHERE content_type_id = $1 AND object_id = $2)
		AND a.descendent_id NOT IN (SELECT id FROM main_rbac_roles WHERE content_type_id = $1 AND object_id = $2)`, orgCT, id)
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

	// Objects that cascade away carry roles of their own.
	cascaded := map[string][]int64{}
	for _, sub := range []struct{ ct, sql string }{
		{"main.team", `SELECT id FROM main_team WHERE organization_id = $1`},
		{"main.credential", `SELECT id FROM main_credential WHERE organization_id = $1`},
	} {
		rows, err := tx.Query(ctx, sub.sql, id)
		if err != nil {
			return err
		}
		for rows.Next() {
			var oid int64
			if err := rows.Scan(&oid); err != nil {
				rows.Close()
				return err
			}
			cascaded[sub.ct] = append(cascaded[sub.ct], oid)
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return err
		}
	}
	if err := UnregisterResource(ctx, tx, "shared.organization", id); err != nil {
		return err
	}
	for _, teamID := range cascaded["main.team"] {
		if err := UnregisterResource(ctx, tx, "shared.team", teamID); err != nil {
			return err
		}
	}
	if err := cascader.Delete(ctx, tx, "main_organization", "id", []int64{id}); err != nil {
		return err
	}
	for ct, ids := range cascaded {
		for _, oid := range ids {
			if err := DeleteRolesFor(ctx, tx, cts.ID(ct), oid); err != nil {
				return err
			}
		}
	}
	if err := DeleteRolesFor(ctx, tx, orgCT, id); err != nil {
		return err
	}
	// Drop the dependants that were themselves deleted, then rebuild the rest.
	if len(dependants) > 0 {
		rows, err := tx.Query(ctx, `SELECT id FROM main_rbac_roles WHERE id = ANY($1)`, dependants)
		if err != nil {
			return err
		}
		var alive []int64
		for rows.Next() {
			var rid int64
			if err := rows.Scan(&rid); err != nil {
				rows.Close()
				return err
			}
			alive = append(alive, rid)
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return err
		}
		if err := RebuildRoleAncestors(ctx, tx, alive); err != nil {
			return err
		}
	}
	return nil
}
