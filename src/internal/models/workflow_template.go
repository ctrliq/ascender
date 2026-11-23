package models

import (
	"context"
	"encoding/json"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/db"
)

// WorkflowJobTemplate is a main_workflowjobtemplate row joined with its
// unified job template parent, read for the template lists.
type WorkflowJobTemplate struct {
	ID                     int64
	Created                time.Time
	Modified               time.Time
	Name                   string
	Description            string
	LastJobFailed          bool
	LastJobRun             *time.Time
	NextJobRun             *time.Time
	Status                 string
	CreatedByID            *int64
	ModifiedByID           *int64
	CurrentJobID           *int64
	LastJobID              *int64
	NextScheduleID         *int64
	OrganizationID         *int64
	ExecutionEnvironmentID *int64

	ExtraVars                        string
	SurveyEnabled                    bool
	SurveySpec                       json.RawMessage
	AllowSimultaneous                bool
	AskVariablesOnLaunch             bool
	AskInventoryOnLaunch             bool
	InventoryID                      *int64
	AskLimitOnLaunch                 bool
	AskSCMBranchOnLaunch             bool
	CharPrompts                      json.RawMessage
	WebhookCredentialID              *int64
	WebhookKey                       string
	WebhookService                   string
	AskLabelsOnLaunch                bool
	AskSkipTagsOnLaunch              bool
	AskTagsOnLaunch                  bool
	AllowOverwriteFlowVarsOnRelaunch bool
	AllowForceNodeSuccessOnRelaunch  bool

	AdminRoleID, ExecuteRoleID, ReadRoleID, ApprovalRoleID *int64
}

// WorkflowJobTemplateRoleFields in declaration order.
var WorkflowJobTemplateRoleFields = []string{"admin_role", "execute_role", "read_role", "approval_role"}

// WorkflowJobTemplateColumns selects with aliases ujt and wt.
const WorkflowJobTemplateColumns = `ujt.id, ujt.created, ujt.modified, ujt.name, ujt.description, ujt.last_job_failed, ujt.last_job_run, ujt.next_job_run, ujt.status,
	ujt.created_by_id, ujt.modified_by_id, ujt.current_job_id, ujt.last_job_id, ujt.next_schedule_id, ujt.organization_id, ujt.execution_environment_id,
	wt.extra_vars, wt.survey_enabled, wt.survey_spec, wt.allow_simultaneous, wt.ask_variables_on_launch, wt.ask_inventory_on_launch, wt.inventory_id, wt.ask_limit_on_launch,
	wt.ask_scm_branch_on_launch, wt.char_prompts, wt.webhook_credential_id, wt.webhook_key, wt.webhook_service, wt.ask_labels_on_launch, wt.ask_skip_tags_on_launch, wt.ask_tags_on_launch,
	wt.allow_overwrite_flow_vars_on_relaunch, wt.allow_force_node_success_on_relaunch, wt.admin_role_id, wt.execute_role_id, wt.read_role_id, wt.approval_role_id`

// WorkflowJobTemplateFrom is the FROM clause matching WorkflowJobTemplateColumns.
const WorkflowJobTemplateFrom = `main_workflowjobtemplate wt JOIN main_unifiedjobtemplate ujt ON ujt.id = wt.unifiedjobtemplate_ptr_id`

// ScanWorkflowJobTemplate reads a row produced with WorkflowJobTemplateColumns.
func ScanWorkflowJobTemplate(r pgx.Row) (*WorkflowJobTemplate, error) {
	t := &WorkflowJobTemplate{}
	err := r.Scan(&t.ID, &t.Created, &t.Modified, &t.Name, &t.Description, &t.LastJobFailed, &t.LastJobRun, &t.NextJobRun, &t.Status,
		&t.CreatedByID, &t.ModifiedByID, &t.CurrentJobID, &t.LastJobID, &t.NextScheduleID, &t.OrganizationID, &t.ExecutionEnvironmentID,
		&t.ExtraVars, &t.SurveyEnabled, &t.SurveySpec, &t.AllowSimultaneous, &t.AskVariablesOnLaunch, &t.AskInventoryOnLaunch, &t.InventoryID, &t.AskLimitOnLaunch,
		&t.AskSCMBranchOnLaunch, &t.CharPrompts, &t.WebhookCredentialID, &t.WebhookKey, &t.WebhookService, &t.AskLabelsOnLaunch, &t.AskSkipTagsOnLaunch, &t.AskTagsOnLaunch,
		&t.AllowOverwriteFlowVarsOnRelaunch, &t.AllowForceNodeSuccessOnRelaunch, &t.AdminRoleID, &t.ExecuteRoleID, &t.ReadRoleID, &t.ApprovalRoleID)
	if err != nil {
		return nil, err
	}
	return t, nil
}

// GetWorkflowJobTemplate loads one workflow job template.
func GetWorkflowJobTemplate(ctx context.Context, q db.Querier, id int64) (*WorkflowJobTemplate, error) {
	return ScanWorkflowJobTemplate(q.QueryRow(ctx, `SELECT `+WorkflowJobTemplateColumns+` FROM `+WorkflowJobTemplateFrom+` WHERE ujt.id = $1`, id))
}

// RoleID returns a role id by field name.
func (t *WorkflowJobTemplate) RoleID(field string) *int64 {
	switch field {
	case "admin_role":
		return t.AdminRoleID
	case "execute_role":
		return t.ExecuteRoleID
	case "read_role":
		return t.ReadRoleID
	case "approval_role":
		return t.ApprovalRoleID
	}
	return nil
}

// CharPromptsMap decodes the saved prompts.
func (t *WorkflowJobTemplate) CharPromptsMap() map[string]any {
	m := map[string]any{}
	if len(t.CharPrompts) > 0 {
		_ = json.Unmarshal(t.CharPrompts, &m)
	}
	if m == nil {
		m = map[string]any{}
	}
	return m
}

// SurveySpecMap decodes the survey spec.
func (t *WorkflowJobTemplate) SurveySpecMap() map[string]any {
	m := map[string]any{}
	if len(t.SurveySpec) > 0 {
		_ = json.Unmarshal(t.SurveySpec, &m)
	}
	if m == nil {
		m = map[string]any{}
	}
	return m
}

// SurveyElements lists the survey's questions.
func (t *WorkflowJobTemplate) SurveyElements() []map[string]any {
	spec, _ := t.SurveySpecMap()["spec"].([]any)
	var out []map[string]any
	for _, e := range spec {
		if m, ok := e.(map[string]any); ok {
			out = append(out, m)
		}
	}
	return out
}
