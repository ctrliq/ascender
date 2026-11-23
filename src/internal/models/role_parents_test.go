package models

import (
	"maps"
	"slices"
	"testing"

	"github.com/ctrliq/ascender/internal/rbac"
)

// Every implicit role parent the Go table declares is the old model's
// ImplicitRoleField parent_role, as a set (the order of the declaration
// never mattered: implicit_parents is the sorted id list).
func TestImplicitParentsMatchOldModels(t *testing.T) {
	old := map[string][]string{
		"organization.admin_role":                       {"singleton:system_administrator"},
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
		"organization.read_role":                        {"member_role", "auditor_role", "execute_role", "project_admin_role", "inventory_admin_role", "workflow_admin_role", "notification_admin_role", "credential_admin_role", "job_template_admin_role", "approval_role", "execution_environment_admin_role"},
		"organization.approval_role":                    {"admin_role"},
		"team.admin_role":                               {"organization.admin_role"},
		"team.member_role":                              {"admin_role"},
		"team.read_role":                                {"organization.auditor_role", "member_role"},
		"instancegroup.admin_role":                      {"singleton:system_administrator"},
		"instancegroup.use_role":                        {"admin_role"},
		"instancegroup.read_role":                       {"singleton:system_auditor", "use_role", "admin_role"},
		"project.admin_role":                            {"organization.project_admin_role", "singleton:system_administrator"},
		"project.use_role":                              {"admin_role"},
		"project.update_role":                           {"admin_role"},
		"project.read_role":                             {"organization.auditor_role", "singleton:system_auditor", "use_role", "update_role"},
		"inventory.admin_role":                          {"organization.inventory_admin_role"},
		"inventory.update_role":                         {"admin_role"},
		"inventory.adhoc_role":                          {"admin_role"},
		"inventory.use_role":                            {"adhoc_role"},
		"inventory.read_role":                           {"organization.auditor_role", "update_role", "use_role", "admin_role"},
		"credential.admin_role":                         {"singleton:system_administrator", "organization.credential_admin_role"},
		"credential.use_role":                           {"admin_role"},
		"credential.read_role":                          {"singleton:system_auditor", "organization.auditor_role", "use_role", "admin_role"},
		"jobtemplate.admin_role":                        {"organization.job_template_admin_role"},
		"jobtemplate.execute_role":                      {"admin_role", "organization.execute_role"},
		"jobtemplate.read_role":                         {"organization.auditor_role", "inventory.organization.auditor_role", "execute_role", "admin_role"},
		"workflowjobtemplate.admin_role":                {"singleton:system_administrator", "organization.workflow_admin_role"},
		"workflowjobtemplate.execute_role":              {"admin_role", "organization.execute_role"},
		"workflowjobtemplate.read_role":                 {"singleton:system_auditor", "organization.auditor_role", "execute_role", "admin_role", "approval_role"},
		"workflowjobtemplate.approval_role":             {"organization.approval_role", "admin_role"},
	}
	sorted := func(s []string) []string { s = slices.Clone(s); slices.Sort(s); return s }
	for _, k := range slices.Sorted(maps.Keys(old)) {
		if got, want := sorted(rbac.ImplicitParents[k]), sorted(old[k]); !slices.Equal(got, want) {
			t.Errorf("%s: parents %v, the old model declares %v", k, got, want)
		}
	}
	for k := range rbac.ImplicitParents {
		if _, ok := old[k]; !ok {
			t.Errorf("%s: declared here, not by the old models", k)
		}
	}
}
