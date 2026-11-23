// Package rbac answers "may this user see or change this object" using the
// role tables the old application maintains: main_rbac_roles (one row per
// role on an object, plus the two system singletons), main_rbac_roles_members
// (users holding a role directly) and main_rbac_role_ancestors (the
// transitive closure of role inheritance, which is how an organization admin
// implicitly holds every role on every project in the organization).
//
// A user holds role R when any role they are a direct member of is an
// ancestor of R. The old accessible_pk_qs asked the ancestors table for every
// object of a content type on which the user holds a given role field, and
// that is what AccessibleSQL renders.
package rbac

import (
	"context"
	"fmt"
	"strings"

	"github.com/ctrliq/ascender/internal/db"
)

// Singleton role names.
const (
	SystemAdministrator = "system_administrator"
	SystemAuditor       = "system_auditor"
)

// RoleNames mirrors role_names in the old models.
var RoleNames = map[string]string{
	"system_administrator":             "System Administrator",
	"system_auditor":                   "System Auditor",
	"adhoc_role":                       "Ad Hoc",
	"admin_role":                       "Admin",
	"project_admin_role":               "Project Admin",
	"inventory_admin_role":             "Inventory Admin",
	"credential_admin_role":            "Credential Admin",
	"job_template_admin_role":          "Job Template Admin",
	"execution_environment_admin_role": "Execution Environment Admin",
	"workflow_admin_role":              "Workflow Admin",
	"notification_admin_role":          "Notification Admin",
	"auditor_role":                     "Auditor",
	"execute_role":                     "Execute",
	"member_role":                      "Member",
	"read_role":                        "Read",
	"update_role":                      "Update",
	"use_role":                         "Use",
	"approval_role":                    "Approve",
}

var roleDescriptions = map[string]string{
	"system_administrator":             "Can manage all aspects of the system",
	"system_auditor":                   "Can view all aspects of the system",
	"adhoc_role":                       "May run ad hoc commands on the %s",
	"admin_role":                       "Can manage all aspects of the %s",
	"project_admin_role":               "Can manage all projects of the %s",
	"inventory_admin_role":             "Can manage all inventories of the %s",
	"credential_admin_role":            "Can manage all credentials of the %s",
	"job_template_admin_role":          "Can manage all job templates of the %s",
	"execution_environment_admin_role": "Can manage all execution environments of the %s",
	"workflow_admin_role":              "Can manage all workflows of the %s",
	"notification_admin_role":          "Can manage all notifications of the %s",
	"auditor_role":                     "Can view all aspects of the %s",
	"execute_role":                     "May run the %s",
	"member_role":                      "User is a member of the %s",
	"read_role":                        "May view settings for the %s",
	"update_role":                      "May update the %s",
	"use_role":                         "Can use the %s in a job template",
	"approval_role":                    "Can approve or deny a workflow approval node",
}

// RoleDescription renders the description for a role on a model, where
// modelName is the spaced lower-case model name ("job template").
func RoleDescription(roleField, modelName string) string {
	if roleField == "execute_role" && modelName == "organization" {
		return "May run any executable resources in the organization"
	}
	d, ok := roleDescriptions[roleField]
	if !ok {
		return ""
	}
	if strings.Contains(d, "%s") {
		return fmt.Sprintf(d, modelName)
	}
	return d
}

// UserHasRole reports whether the user holds the role with id roleID,
// directly or through inheritance.
func UserHasRole(ctx context.Context, q db.Querier, userID, roleID int64) (bool, error) {
	var ok bool
	err := q.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM main_rbac_role_ancestors a JOIN main_rbac_roles_members m ON m.role_id = a.ancestor_id WHERE a.descendent_id = $1 AND m.user_id = $2)`, roleID, userID).Scan(&ok)
	return ok, err
}

// UserHasRoleOn reports whether the user holds roleField on the object.
func UserHasRoleOn(ctx context.Context, q db.Querier, userID, ctID, objectID int64, roleField string) (bool, error) {
	var ok bool
	err := q.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM main_rbac_role_ancestors a JOIN main_rbac_roles_members m ON m.role_id = a.ancestor_id WHERE a.content_type_id = $1 AND a.object_id = $2 AND a.role_field = $3 AND m.user_id = $4)`, ctID, objectID, roleField, userID).Scan(&ok)
	return ok, err
}

// Held is the set of roles a user holds, directly or by inheritance: what
// UserHasRole and UserHasRoleOn ask, answered from memory.
type Held struct {
	ids map[int64]struct{}
	on  map[heldKey]struct{}
}

type heldKey struct {
	ct, object int64
	field      string
}

// Has reports whether the role with id roleID is held.
func (h *Held) Has(roleID int64) bool {
	_, ok := h.ids[roleID]
	return ok
}

// HasOn reports whether roleField is held on the object.
func (h *Held) HasOn(ctID, objectID int64, roleField string) bool {
	_, ok := h.on[heldKey{ctID, objectID, roleField}]
	return ok
}

// LoadHeld reads every role the user holds. The ancestors table carries
// each descendant role's content type, object and field, so one pass
// answers both kinds of question. More than limit roles returns nil and no
// error: the caller asks per role instead.
func LoadHeld(ctx context.Context, q db.Querier, userID int64, limit int) (*Held, error) {
	rows, err := q.Query(ctx, `SELECT DISTINCT a.descendent_id, a.content_type_id, a.object_id, a.role_field FROM main_rbac_role_ancestors a
		WHERE a.ancestor_id IN (SELECT m.role_id FROM main_rbac_roles_members m WHERE m.user_id = $1) LIMIT $2`, userID, limit+1)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	h := &Held{ids: map[int64]struct{}{}, on: map[heldKey]struct{}{}}
	n := 0
	for rows.Next() {
		var id, ct, obj int64
		var field string
		if err := rows.Scan(&id, &ct, &obj, &field); err != nil {
			return nil, err
		}
		if n++; n > limit {
			return nil, nil
		}
		h.ids[id] = struct{}{}
		h.on[heldKey{ct, obj, field}] = struct{}{}
	}
	return h, rows.Err()
}

// Role is a main_rbac_roles row.
type Role struct {
	ID            int64
	RoleField     string
	SingletonName *string
	ContentTypeID *int64
	ObjectID      *int64
}

// SingletonRoleID returns the id of a singleton role.
func SingletonRoleID(ctx context.Context, q db.Querier, name string) (int64, error) {
	var id int64
	err := q.QueryRow(ctx, `SELECT id FROM main_rbac_roles WHERE singleton_name = $1`, name).Scan(&id)
	return id, err
}

// AddMember grants a role to a user directly.
func AddMember(ctx context.Context, q db.Querier, roleID, userID int64) error {
	_, err := q.Exec(ctx, `INSERT INTO main_rbac_roles_members (role_id, user_id) SELECT $1, $2 WHERE NOT EXISTS (SELECT 1 FROM main_rbac_roles_members WHERE role_id = $1 AND user_id = $2)`, roleID, userID)
	return err
}

// ImplicitParents is the inheritance each role field declares on each
// model, written as "<field on parent object>" where the parent is reached
// through the named foreign key. It is what the old ImplicitRoleField
// parent_role arguments said, and it is used when creating roles for a new
// object so the ancestor closure comes out the same as the old application's.
//
// The map key is "model.role_field"; each entry lists parents as
// "fk.role_field" (role on the related object), "role_field" (a role on the
// same object), or "singleton:<name>".
var ImplicitParents = map[string][]string{
	"organization.admin_role":                       {"singleton:system_administrator"},
	"instancegroup.admin_role":                      {"singleton:system_administrator"},
	"instancegroup.use_role":                        {"admin_role"},
	"instancegroup.read_role":                       {"singleton:system_auditor", "use_role", "admin_role"},
	"organization.execute_role":                     {"admin_role"},
	"organization.project_admin_role":               {"admin_role"},
	"organization.inventory_admin_role":             {"admin_role"},
	"organization.credential_admin_role":            {"admin_role"},
	"organization.workflow_admin_role":              {"admin_role"},
	"organization.notification_admin_role":          {"admin_role"},
	"organization.job_template_admin_role":          {"admin_role"},
	"organization.execution_environment_admin_role": {"admin_role"},
	"organization.auditor_role":                     {"singleton:system_auditor"},
	"organization.member_role":                      {"admin_role"},
	"organization.read_role":                        {"member_role", "auditor_role", "execute_role", "project_admin_role", "inventory_admin_role", "workflow_admin_role", "notification_admin_role", "credential_admin_role", "job_template_admin_role", "execution_environment_admin_role", "approval_role"},
	"organization.approval_role":                    {"admin_role"},
	"team.admin_role":                               {"organization.admin_role"},
	"team.member_role":                              {"admin_role"},
	"team.read_role":                                {"organization.auditor_role", "member_role"},
	"project.admin_role":                            {"organization.project_admin_role", "singleton:system_administrator"},
	"project.use_role":                              {"admin_role"},
	"project.update_role":                           {"admin_role"},
	"project.read_role":                             {"organization.auditor_role", "singleton:system_auditor", "use_role", "update_role"},
	"inventory.admin_role":                          {"organization.inventory_admin_role"},
	"inventory.update_role":                         {"admin_role"},
	"inventory.adhoc_role":                          {"admin_role"},
	"inventory.use_role":                            {"adhoc_role"},
	"inventory.read_role":                           {"organization.auditor_role", "update_role", "use_role", "admin_role"},
	"credential.admin_role":                         {"organization.credential_admin_role", "singleton:system_administrator"},
	"credential.use_role":                           {"admin_role"},
	"credential.read_role":                          {"singleton:system_auditor", "organization.auditor_role", "use_role", "admin_role"},
	"jobtemplate.admin_role":                        {"organization.job_template_admin_role"},
	"jobtemplate.execute_role":                      {"admin_role", "organization.execute_role"},
	"jobtemplate.read_role":                         {"organization.auditor_role", "inventory.organization.auditor_role", "execute_role", "admin_role"},
	"workflowjobtemplate.admin_role":                {"singleton:system_administrator", "organization.workflow_admin_role"},
	"workflowjobtemplate.execute_role":              {"admin_role", "organization.execute_role"},
	"workflowjobtemplate.approval_role":             {"organization.approval_role", "admin_role"},
	"workflowjobtemplate.read_role":                 {"singleton:system_auditor", "organization.auditor_role", "execute_role", "admin_role", "approval_role"},
}
