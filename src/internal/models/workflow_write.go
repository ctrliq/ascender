package models

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/db"
)

// --- workflow job templates ---------------------------------------------------

func workflowJobTemplateParentLookup(t *WorkflowJobTemplate, orgLookup func(int64) *Organization) ParentLookup {
	return func(spec string) *int64 {
		if !strings.HasPrefix(spec, "organization.") || t.OrganizationID == nil {
			return nil
		}
		org := orgLookup(*t.OrganizationID)
		if org == nil {
			return nil
		}
		return org.RoleID(strings.TrimPrefix(spec, "organization."))
	}
}

// Roles maps the template's role fields to their ids.
func (t *WorkflowJobTemplate) Roles() map[string]int64 {
	out := map[string]int64{}
	for _, f := range WorkflowJobTemplateRoleFields {
		if id := t.RoleID(f); id != nil {
			out[f] = *id
		}
	}
	return out
}

// InsertWorkflowJobTemplate creates the unified job template row, the
// workflow job template row and the four roles.
func InsertWorkflowJobTemplate(ctx context.Context, tx pgx.Tx, t *WorkflowJobTemplate, cts *ContentTypes, factory RoleFactory, orgLookup func(int64) *Organization) error {
	ct := cts.ID("main.workflowjobtemplate")
	if t.Status == "" {
		t.Status = "never updated"
	}
	if len(t.SurveySpec) == 0 {
		t.SurveySpec = json.RawMessage("{}")
	}
	if len(t.CharPrompts) == 0 {
		t.CharPrompts = json.RawMessage("{}")
	}
	err := tx.QueryRow(ctx, `INSERT INTO main_unifiedjobtemplate (created, modified, description, name, old_pk, last_job_failed, last_job_run, next_job_run, status,
		created_by_id, current_job_id, last_job_id, modified_by_id, next_schedule_id, polymorphic_ctype_id, organization_id, execution_environment_id)
		VALUES (now(), now(), $1, $2, NULL, false, NULL, NULL, $3, $4, NULL, NULL, $5, NULL, $6, $7, NULL) RETURNING id, created, modified`,
		t.Description, t.Name, t.Status, t.CreatedByID, t.ModifiedByID, ct, t.OrganizationID).Scan(&t.ID, &t.Created, &t.Modified)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `INSERT INTO main_workflowjobtemplate (unifiedjobtemplate_ptr_id, extra_vars, admin_role_id, execute_role_id, read_role_id, approval_role_id, survey_enabled,
		survey_spec, allow_simultaneous, ask_variables_on_launch, ask_inventory_on_launch, inventory_id, ask_limit_on_launch, ask_scm_branch_on_launch, char_prompts,
		webhook_credential_id, webhook_key, webhook_service, ask_labels_on_launch, ask_skip_tags_on_launch, ask_tags_on_launch, allow_overwrite_flow_vars_on_relaunch,
		allow_force_node_success_on_relaunch)
		VALUES ($1, $2, NULL, NULL, NULL, NULL, $3, $4::jsonb, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, $14, $15, $16, $17, $18, $19)`,
		t.ID, t.ExtraVars, t.SurveyEnabled, string(t.SurveySpec), t.AllowSimultaneous, t.AskVariablesOnLaunch, t.AskInventoryOnLaunch, t.InventoryID, t.AskLimitOnLaunch,
		t.AskSCMBranchOnLaunch, string(t.CharPrompts), t.WebhookCredentialID, t.WebhookKey, t.WebhookService, t.AskLabelsOnLaunch, t.AskSkipTagsOnLaunch, t.AskTagsOnLaunch,
		t.AllowOverwriteFlowVarsOnRelaunch, t.AllowForceNodeSuccessOnRelaunch)
	if err != nil {
		return err
	}
	roles, err := factory.CreateRoles(ctx, tx, "workflowjobtemplate", ct, t.ID, WorkflowJobTemplateRoleFields, workflowJobTemplateParentLookup(t, orgLookup))
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `UPDATE main_workflowjobtemplate SET admin_role_id = $2, execute_role_id = $3, read_role_id = $4, approval_role_id = $5 WHERE unifiedjobtemplate_ptr_id = $1`,
		t.ID, roles["admin_role"], roles["execute_role"], roles["read_role"], roles["approval_role"])
	if err != nil {
		return err
	}
	a, e, r, ap := roles["admin_role"], roles["execute_role"], roles["read_role"], roles["approval_role"]
	t.AdminRoleID, t.ExecuteRoleID, t.ReadRoleID, t.ApprovalRoleID = &a, &e, &r, &ap
	return nil
}

// UpdateWorkflowJobTemplate writes the editable columns and re-links the
// organization role parents when the organization changed.
func UpdateWorkflowJobTemplate(ctx context.Context, tx pgx.Tx, t *WorkflowJobTemplate, orgLookup func(int64) *Organization, orgChanged bool) error {
	if err := tx.QueryRow(ctx, `UPDATE main_unifiedjobtemplate SET modified = now(), description = $2, name = $3, modified_by_id = $4, organization_id = $5 WHERE id = $1 RETURNING modified`,
		t.ID, t.Description, t.Name, t.ModifiedByID, t.OrganizationID).Scan(&t.Modified); err != nil {
		return err
	}
	if len(t.SurveySpec) == 0 {
		t.SurveySpec = json.RawMessage("{}")
	}
	if len(t.CharPrompts) == 0 {
		t.CharPrompts = json.RawMessage("{}")
	}
	_, err := tx.Exec(ctx, `UPDATE main_workflowjobtemplate SET extra_vars = $2, survey_enabled = $3, survey_spec = $4::jsonb, allow_simultaneous = $5, ask_variables_on_launch = $6,
		ask_inventory_on_launch = $7, inventory_id = $8, ask_limit_on_launch = $9, ask_scm_branch_on_launch = $10, char_prompts = $11::jsonb, webhook_credential_id = $12,
		webhook_key = $13, webhook_service = $14, ask_labels_on_launch = $15, ask_skip_tags_on_launch = $16, ask_tags_on_launch = $17,
		allow_overwrite_flow_vars_on_relaunch = $18, allow_force_node_success_on_relaunch = $19 WHERE unifiedjobtemplate_ptr_id = $1`,
		t.ID, t.ExtraVars, t.SurveyEnabled, string(t.SurveySpec), t.AllowSimultaneous, t.AskVariablesOnLaunch, t.AskInventoryOnLaunch, t.InventoryID, t.AskLimitOnLaunch,
		t.AskSCMBranchOnLaunch, string(t.CharPrompts), t.WebhookCredentialID, t.WebhookKey, t.WebhookService, t.AskLabelsOnLaunch, t.AskSkipTagsOnLaunch, t.AskTagsOnLaunch,
		t.AllowOverwriteFlowVarsOnRelaunch, t.AllowForceNodeSuccessOnRelaunch)
	if err != nil {
		return err
	}
	if orgChanged {
		return RelinkParentRole(ctx, tx, "workflowjobtemplate", t.Roles(), "organization", workflowJobTemplateParentLookup(t, orgLookup))
	}
	return nil
}

// UpdateWorkflowJobTemplateSurvey writes only the survey spec.
func UpdateWorkflowJobTemplateSurvey(ctx context.Context, q db.Querier, id int64, spec json.RawMessage) error {
	if len(spec) == 0 {
		spec = json.RawMessage("{}")
	}
	if _, err := q.Exec(ctx, `UPDATE main_workflowjobtemplate SET survey_spec = $2 WHERE unifiedjobtemplate_ptr_id = $1`, id, string(spec)); err != nil {
		return err
	}
	_, err := q.Exec(ctx, `UPDATE main_unifiedjobtemplate SET modified = now() WHERE id = $1`, id)
	return err
}

// DeleteWorkflowJobTemplate removes a workflow job template, its roles,
// its nodes and the approval templates only its nodes used.
func DeleteWorkflowJobTemplate(ctx context.Context, tx pgx.Tx, t *WorkflowJobTemplate, cts *ContentTypes, cascader *Cascader) error {
	if err := DeleteRolesFor(ctx, tx, cts.ID("main.workflowjobtemplate"), t.ID); err != nil {
		return err
	}
	approvals, err := ScanIDs(ctx, tx, `SELECT n.unified_job_template_id FROM main_workflowjobtemplatenode n JOIN main_workflowapprovaltemplate a ON a.unifiedjobtemplate_ptr_id = n.unified_job_template_id WHERE n.workflow_job_template_id = $1`, t.ID)
	if err != nil {
		return err
	}
	if err := cascader.Delete(ctx, tx, "main_unifiedjobtemplate", "id", []int64{t.ID}); err != nil {
		return err
	}
	return DeleteOrphanApprovalTemplates(ctx, tx, cascader, approvals)
}

// DeleteOrphanApprovalTemplates deletes approval templates no node uses any
// more (the old WorkflowJobTemplateNode post_delete signal).
func DeleteOrphanApprovalTemplates(ctx context.Context, tx pgx.Tx, cascader *Cascader, ids []int64) error {
	for _, id := range ids {
		var used bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM main_workflowjobtemplatenode WHERE unified_job_template_id = $1)`, id).Scan(&used); err != nil {
			return err
		}
		if used {
			continue
		}
		if err := cascader.Delete(ctx, tx, "main_unifiedjobtemplate", "id", []int64{id}); err != nil {
			return err
		}
	}
	return nil
}

// --- workflow job template nodes ------------------------------------------------

// WorkflowNode is a workflow job template node or a workflow job node; the
// job node columns are zero for template nodes.
type WorkflowNode struct {
	ID                     int64
	Created, Modified      time.Time
	WorkflowID             int64 // workflow_job_template_id or workflow_job_id
	UnifiedJobTemplateID   *int64
	InventoryID            *int64
	ExecutionEnvironmentID *int64
	ExtraData              string
	CharPrompts            map[string]any
	SurveyPasswords        map[string]any
	AllParentsMustConverge bool
	Identifier             string
	MaxRetries             int64
	// job nodes
	JobID               *int64
	AncestorArtifacts   string
	DoNotRun            bool
	PriorRunSucceeded   bool
	PriorRunElapsed     *float64
	RetryAttempts       int64
	ForcedSuccess       bool
	ForcedSuccessByID   *int64
	ForcedSuccessJobID  *int64
	ForcedSuccessReason string
}

// NodeTables names the tables of template nodes or job nodes.
type NodeTables struct {
	Node, Parent, ParentCol, LinkPrefix, LinkCol, Condition, Credentials, Labels, IGs, NodeCol string
}

// TemplateNodeTables and JobNodeTables are the two node families.
var (
	TemplateNodeTables = NodeTables{Node: "main_workflowjobtemplatenode", ParentCol: "workflow_job_template_id", LinkPrefix: "main_workflowjobtemplatenode_", LinkCol: "workflowjobtemplatenode",
		Condition: "main_workflowjobtemplatenodeconditionlink", Credentials: "main_workflowjobtemplatenode_credentials", Labels: "main_workflowjobtemplatenode_labels",
		IGs: "main_workflowjobtemplatenodebaseinstancegroupmembership", NodeCol: "workflowjobtemplatenode_id"}
	JobNodeTables = NodeTables{Node: "main_workflowjobnode", ParentCol: "workflow_job_id", LinkPrefix: "main_workflowjobnode_", LinkCol: "workflowjobnode",
		Condition: "main_workflowjobnodeconditionlink", Credentials: "main_workflowjobnode_credentials", Labels: "main_workflowjobnode_labels",
		IGs: "main_workflowjobnodebaseinstancegroupmembership", NodeCol: "workflowjobnode_id"}
)

// TemplateNodeColumns selects a template node with alias n.
const TemplateNodeColumns = `n.id, n.created, n.modified, n.workflow_job_template_id, n.unified_job_template_id, n.inventory_id, n.execution_environment_id,
	COALESCE(n.extra_data, ''), COALESCE(n.char_prompts::text, '{}'), COALESCE(n.survey_passwords::text, '{}'), n.all_parents_must_converge, n.identifier, n.max_retries`

// JobNodeColumns selects a job node with alias n.
const JobNodeColumns = `n.id, n.created, n.modified, n.workflow_job_id, n.unified_job_template_id, n.inventory_id, n.execution_environment_id,
	COALESCE(n.extra_data, ''), COALESCE(n.char_prompts::text, '{}'), COALESCE(n.survey_passwords::text, '{}'), n.all_parents_must_converge, n.identifier, n.max_retries,
	n.job_id, COALESCE(n.ancestor_artifacts, '{}'), n.do_not_run, n.prior_run_succeeded, n.prior_run_elapsed, n.retry_attempts, n.forced_success, n.forced_success_by_id,
	n.forced_success_job_id, COALESCE(n.forced_success_reason, '')`

func decodeObject(s string) map[string]any {
	m := map[string]any{}
	if s != "" {
		_ = json.Unmarshal([]byte(s), &m)
	}
	if m == nil {
		m = map[string]any{}
	}
	return m
}

// ScanTemplateNode reads a row selected with TemplateNodeColumns.
func ScanTemplateNode(r pgx.Row) (*WorkflowNode, error) {
	n := &WorkflowNode{}
	var wf *int64
	var chars, pw string
	if err := r.Scan(&n.ID, &n.Created, &n.Modified, &wf, &n.UnifiedJobTemplateID, &n.InventoryID, &n.ExecutionEnvironmentID, &n.ExtraData, &chars, &pw,
		&n.AllParentsMustConverge, &n.Identifier, &n.MaxRetries); err != nil {
		return nil, err
	}
	if wf != nil {
		n.WorkflowID = *wf
	}
	n.CharPrompts, n.SurveyPasswords = decodeObject(chars), decodeObject(pw)
	return n, nil
}

// ScanJobNode reads a row selected with JobNodeColumns.
func ScanJobNode(r pgx.Row) (*WorkflowNode, error) {
	n := &WorkflowNode{}
	var wf *int64
	var chars, pw string
	if err := r.Scan(&n.ID, &n.Created, &n.Modified, &wf, &n.UnifiedJobTemplateID, &n.InventoryID, &n.ExecutionEnvironmentID, &n.ExtraData, &chars, &pw,
		&n.AllParentsMustConverge, &n.Identifier, &n.MaxRetries, &n.JobID, &n.AncestorArtifacts, &n.DoNotRun, &n.PriorRunSucceeded, &n.PriorRunElapsed, &n.RetryAttempts,
		&n.ForcedSuccess, &n.ForcedSuccessByID, &n.ForcedSuccessJobID, &n.ForcedSuccessReason); err != nil {
		return nil, err
	}
	if wf != nil {
		n.WorkflowID = *wf
	}
	n.CharPrompts, n.SurveyPasswords = decodeObject(chars), decodeObject(pw)
	return n, nil
}

// GetTemplateNode loads one template node.
func GetTemplateNode(ctx context.Context, q db.Querier, id int64) (*WorkflowNode, error) {
	return ScanTemplateNode(q.QueryRow(ctx, `SELECT `+TemplateNodeColumns+` FROM main_workflowjobtemplatenode n WHERE n.id = $1`, id))
}

// GetJobNode loads one workflow job node.
func GetJobNode(ctx context.Context, q db.Querier, id int64) (*WorkflowNode, error) {
	return ScanJobNode(q.QueryRow(ctx, `SELECT `+JobNodeColumns+` FROM main_workflowjobnode n WHERE n.id = $1`, id))
}

func nodeJSON(m map[string]any) string {
	if m == nil {
		return "{}"
	}
	b, _ := json.Marshal(m)
	return string(b)
}

// InsertTemplateNode creates a template node; an empty identifier gets a
// new uuid as the model's default did.
func InsertTemplateNode(ctx context.Context, q db.Querier, n *WorkflowNode) error {
	if n.ExtraData == "" {
		n.ExtraData = "{}"
	}
	return q.QueryRow(ctx, `INSERT INTO main_workflowjobtemplatenode (created, modified, unified_job_template_id, workflow_job_template_id, char_prompts, inventory_id, extra_data,
		survey_passwords, all_parents_must_converge, identifier, execution_environment_id, max_retries)
		VALUES (now(), now(), $1, $2, $3::jsonb, $4, $5, $6::jsonb, $7, CASE WHEN $8 = '' THEN gen_random_uuid()::text ELSE $8 END, $9, $10) RETURNING id, created, modified, identifier`,
		n.UnifiedJobTemplateID, n.WorkflowID, nodeJSON(n.CharPrompts), n.InventoryID, n.ExtraData, nodeJSON(n.SurveyPasswords), n.AllParentsMustConverge, n.Identifier,
		n.ExecutionEnvironmentID, n.MaxRetries).Scan(&n.ID, &n.Created, &n.Modified, &n.Identifier)
}

// UpdateTemplateNode writes a template node's editable columns.
func UpdateTemplateNode(ctx context.Context, q db.Querier, n *WorkflowNode) error {
	if n.ExtraData == "" {
		n.ExtraData = "{}"
	}
	return q.QueryRow(ctx, `UPDATE main_workflowjobtemplatenode SET modified = now(), unified_job_template_id = $2, char_prompts = $3::jsonb, inventory_id = $4, extra_data = $5,
		survey_passwords = $6::jsonb, all_parents_must_converge = $7, identifier = $8, execution_environment_id = $9, max_retries = $10 WHERE id = $1 RETURNING modified`,
		n.ID, n.UnifiedJobTemplateID, nodeJSON(n.CharPrompts), n.InventoryID, n.ExtraData, nodeJSON(n.SurveyPasswords), n.AllParentsMustConverge, n.Identifier,
		n.ExecutionEnvironmentID, n.MaxRetries).Scan(&n.Modified)
}

// NodeEdges are a node's children by edge type, with the condition data of
// its conditional edges.
type NodeEdges struct {
	Success, Failure, Always, Condition []int64
	Conditions                          []NodeCondition
}

// NodeCondition is one conditional edge out of a node.
type NodeCondition struct {
	To                                       int64
	Trigger, ArtifactKey, Operator, Expected string
}

// LoadNodeEdges reads the outgoing edges of a set of nodes.
func LoadNodeEdges(ctx context.Context, q db.Querier, t NodeTables, ids []int64) (map[int64]*NodeEdges, error) {
	out := map[int64]*NodeEdges{}
	for _, id := range ids {
		out[id] = &NodeEdges{Success: []int64{}, Failure: []int64{}, Always: []int64{}, Condition: []int64{}, Conditions: []NodeCondition{}}
	}
	if len(ids) == 0 {
		return out, nil
	}
	for _, kind := range []string{"success", "failure", "always"} {
		rows, err := q.Query(ctx, `SELECT from_`+t.LinkCol+`_id, to_`+t.LinkCol+`_id FROM `+t.LinkPrefix+kind+`_nodes WHERE from_`+t.LinkCol+`_id = ANY($1) ORDER BY to_`+t.LinkCol+`_id`, ids)
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			var from, to int64
			if err := rows.Scan(&from, &to); err != nil {
				rows.Close()
				return nil, err
			}
			e := out[from]
			switch kind {
			case "success":
				e.Success = append(e.Success, to)
			case "failure":
				e.Failure = append(e.Failure, to)
			default:
				e.Always = append(e.Always, to)
			}
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return nil, err
		}
	}
	rows, err := q.Query(ctx, `SELECT from_node_id, to_node_id, trigger, artifact_key, operator, expected_value FROM `+t.Condition+` WHERE from_node_id = ANY($1) ORDER BY id`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var from int64
		var c NodeCondition
		if err := rows.Scan(&from, &c.To, &c.Trigger, &c.ArtifactKey, &c.Operator, &c.Expected); err != nil {
			return nil, err
		}
		e := out[from]
		e.Condition = append(e.Condition, c.To)
		e.Conditions = append(e.Conditions, c)
	}
	for _, e := range out {
		sortInt64(e.Condition)
	}
	return out, rows.Err()
}

func sortInt64(ids []int64) {
	for i := 1; i < len(ids); i++ {
		for j := i; j > 0 && ids[j] < ids[j-1]; j-- {
			ids[j], ids[j-1] = ids[j-1], ids[j]
		}
	}
}

// --- approval templates ----------------------------------------------------------

// WorkflowApprovalTemplate is an approval node's template.
type WorkflowApprovalTemplate struct {
	ID                                  int64
	Created, Modified                   time.Time
	Name, Description, Status           string
	LastJobFailed                       bool
	LastJobRun, NextJobRun              *time.Time
	CreatedByID, ModifiedByID           *int64
	CurrentJobID, LastJobID             *int64
	NextScheduleID, ExecutionEnvID      *int64
	Timeout, RequiredApprovals          int64
	OnTimeout, ContextTemplate          string
	OrganizationID                      *int64
	WorkflowJobTemplateID               *int64 // through the node that uses it
	WorkflowJobTemplateOrganizationID   *int64
	WorkflowJobTemplateAdminRoleID      *int64
	WorkflowJobTemplateExecuteRoleID    *int64
	WorkflowJobTemplateReadRoleID       *int64
	WorkflowJobTemplateApprovalRoleID   *int64
	WorkflowJobTemplateName             string
	WorkflowJobTemplateDescription      string
	WorkflowJobTemplateAllowForceSucces bool
}

// GetWorkflowApprovalTemplate loads an approval template with the workflow
// job template of the first node that uses it.
func GetWorkflowApprovalTemplate(ctx context.Context, q db.Querier, id int64) (*WorkflowApprovalTemplate, error) {
	a := &WorkflowApprovalTemplate{}
	err := q.QueryRow(ctx, `SELECT u.id, u.created, u.modified, u.name, u.description, u.status, u.last_job_failed, u.last_job_run, u.next_job_run, u.created_by_id, u.modified_by_id,
		u.current_job_id, u.last_job_id, u.next_schedule_id, u.execution_environment_id, u.organization_id, a.timeout, a.required_approvals, a.on_timeout, a.context_template,
		w.unifiedjobtemplate_ptr_id, wu.organization_id, w.admin_role_id, w.execute_role_id, w.read_role_id, w.approval_role_id, COALESCE(wu.name, ''), COALESCE(wu.description, ''),
		COALESCE(w.allow_force_node_success_on_relaunch, false)
		FROM main_workflowapprovaltemplate a JOIN main_unifiedjobtemplate u ON u.id = a.unifiedjobtemplate_ptr_id
		LEFT JOIN LATERAL (SELECT workflow_job_template_id FROM main_workflowjobtemplatenode WHERE unified_job_template_id = a.unifiedjobtemplate_ptr_id ORDER BY id LIMIT 1) n ON true
		LEFT JOIN main_workflowjobtemplate w ON w.unifiedjobtemplate_ptr_id = n.workflow_job_template_id
		LEFT JOIN main_unifiedjobtemplate wu ON wu.id = w.unifiedjobtemplate_ptr_id
		WHERE a.unifiedjobtemplate_ptr_id = $1`, id).Scan(&a.ID, &a.Created, &a.Modified, &a.Name, &a.Description, &a.Status, &a.LastJobFailed, &a.LastJobRun, &a.NextJobRun,
		&a.CreatedByID, &a.ModifiedByID, &a.CurrentJobID, &a.LastJobID, &a.NextScheduleID, &a.ExecutionEnvID, &a.OrganizationID, &a.Timeout, &a.RequiredApprovals, &a.OnTimeout,
		&a.ContextTemplate, &a.WorkflowJobTemplateID, &a.WorkflowJobTemplateOrganizationID, &a.WorkflowJobTemplateAdminRoleID, &a.WorkflowJobTemplateExecuteRoleID,
		&a.WorkflowJobTemplateReadRoleID, &a.WorkflowJobTemplateApprovalRoleID, &a.WorkflowJobTemplateName, &a.WorkflowJobTemplateDescription, &a.WorkflowJobTemplateAllowForceSucces)
	if err != nil {
		return nil, err
	}
	return a, nil
}

// InsertWorkflowApprovalTemplate creates an approval template.
func InsertWorkflowApprovalTemplate(ctx context.Context, q db.Querier, a *WorkflowApprovalTemplate, cts *ContentTypes) error {
	if a.Status == "" {
		a.Status = "never updated"
	}
	if err := q.QueryRow(ctx, `INSERT INTO main_unifiedjobtemplate (created, modified, description, name, old_pk, last_job_failed, last_job_run, next_job_run, status,
		created_by_id, current_job_id, last_job_id, modified_by_id, next_schedule_id, polymorphic_ctype_id, organization_id, execution_environment_id)
		VALUES (now(), now(), $1, $2, NULL, false, NULL, NULL, $3, $4, NULL, NULL, $5, NULL, $6, NULL, NULL) RETURNING id, created, modified`,
		a.Description, a.Name, a.Status, a.CreatedByID, a.ModifiedByID, cts.ID("main.workflowapprovaltemplate")).Scan(&a.ID, &a.Created, &a.Modified); err != nil {
		return err
	}
	_, err := q.Exec(ctx, `INSERT INTO main_workflowapprovaltemplate (unifiedjobtemplate_ptr_id, timeout, context_template, on_timeout, required_approvals) VALUES ($1, $2, $3, $4, $5)`,
		a.ID, a.Timeout, a.ContextTemplate, a.OnTimeout, a.RequiredApprovals)
	return err
}

// UpdateWorkflowApprovalTemplate writes an approval template's fields.
func UpdateWorkflowApprovalTemplate(ctx context.Context, q db.Querier, a *WorkflowApprovalTemplate) error {
	if err := q.QueryRow(ctx, `UPDATE main_unifiedjobtemplate SET modified = now(), name = $2, description = $3, modified_by_id = $4 WHERE id = $1 RETURNING modified`,
		a.ID, a.Name, a.Description, a.ModifiedByID).Scan(&a.Modified); err != nil {
		return err
	}
	_, err := q.Exec(ctx, `UPDATE main_workflowapprovaltemplate SET timeout = $2, context_template = $3, on_timeout = $4, required_approvals = $5 WHERE unifiedjobtemplate_ptr_id = $1`,
		a.ID, a.Timeout, a.ContextTemplate, a.OnTimeout, a.RequiredApprovals)
	return err
}
