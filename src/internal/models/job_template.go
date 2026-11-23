package models

import (
	"context"
	"encoding/json"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/db"
)

// JobTemplate is a main_jobtemplate row joined with its
// main_unifiedjobtemplate parent.
type JobTemplate struct {
	// unified job template columns
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

	// job template columns
	JobType                         string
	Playbook                        string
	Forks                           int64
	Limit                           string
	Verbosity                       int64
	ExtraVars                       string
	JobTags                         string
	ForceHandlers                   bool
	SkipTags                        string
	StartAtTask                     string
	BecomeEnabled                   bool
	HostConfigKey                   string
	AskVariablesOnLaunch            bool
	SurveyEnabled                   bool
	SurveySpec                      json.RawMessage
	InventoryID                     *int64
	ProjectID                       *int64
	AskLimitOnLaunch                bool
	AskInventoryOnLaunch            bool
	AskCredentialOnLaunch           bool
	AskJobTypeOnLaunch              bool
	AskTagsOnLaunch                 bool
	AllowSimultaneous               bool
	AskSkipTagsOnLaunch             bool
	Timeout                         int64
	UseFactCache                    bool
	AskVerbosityOnLaunch            bool
	AskDiffModeOnLaunch             bool
	DiffMode                        bool
	JobSliceCount                   int64
	AskSCMBranchOnLaunch            bool
	SCMBranch                       string
	WebhookCredentialID             *int64
	WebhookKey                      string
	WebhookService                  string
	AskExecutionEnvironmentOnLaunch bool
	AskForksOnLaunch                bool
	AskInstanceGroupsOnLaunch       bool
	AskJobSliceCountOnLaunch        bool
	AskLabelsOnLaunch               bool
	AskTimeoutOnLaunch              bool
	PreventInstanceGroupFallback    bool
	JobSlicePinnedHosts             string
	PreventRelaunch                 bool

	AdminRoleID, ExecuteRoleID, ReadRoleID *int64
}

// JobTemplateRoleFields in declaration order.
var JobTemplateRoleFields = []string{"admin_role", "execute_role", "read_role"}

// JobTemplateColumns selects with aliases ujt (main_unifiedjobtemplate) and jt (main_jobtemplate).
const JobTemplateColumns = `ujt.id, ujt.created, ujt.modified, ujt.name, ujt.description, ujt.last_job_failed, ujt.last_job_run, ujt.next_job_run, ujt.status,
	ujt.created_by_id, ujt.modified_by_id, ujt.current_job_id, ujt.last_job_id, ujt.next_schedule_id, ujt.organization_id, ujt.execution_environment_id,
	jt.job_type, jt.playbook, jt.forks, jt."limit", jt.verbosity, jt.extra_vars, jt.job_tags, jt.force_handlers, jt.skip_tags, jt.start_at_task, jt.become_enabled,
	jt.host_config_key, jt.ask_variables_on_launch, jt.survey_enabled, jt.survey_spec, jt.inventory_id, jt.project_id, jt.ask_limit_on_launch, jt.ask_inventory_on_launch,
	jt.ask_credential_on_launch, jt.ask_job_type_on_launch, jt.ask_tags_on_launch, jt.allow_simultaneous, jt.ask_skip_tags_on_launch, jt.timeout, jt.use_fact_cache,
	jt.ask_verbosity_on_launch, jt.ask_diff_mode_on_launch, jt.diff_mode, jt.job_slice_count, jt.ask_scm_branch_on_launch, jt.scm_branch, jt.webhook_credential_id,
	jt.webhook_key, jt.webhook_service, jt.ask_execution_environment_on_launch, jt.ask_forks_on_launch, jt.ask_instance_groups_on_launch, jt.ask_job_slice_count_on_launch,
	jt.ask_labels_on_launch, jt.ask_timeout_on_launch, jt.prevent_instance_group_fallback, jt.job_slice_pinned_hosts, jt.prevent_relaunch,
	jt.admin_role_id, jt.execute_role_id, jt.read_role_id`

// JobTemplateFrom is the FROM clause matching JobTemplateColumns.
const JobTemplateFrom = `main_jobtemplate jt JOIN main_unifiedjobtemplate ujt ON ujt.id = jt.unifiedjobtemplate_ptr_id`

// ScanJobTemplate reads a row produced with JobTemplateColumns.
func ScanJobTemplate(r pgx.Row) (*JobTemplate, error) {
	t := &JobTemplate{}
	err := r.Scan(&t.ID, &t.Created, &t.Modified, &t.Name, &t.Description, &t.LastJobFailed, &t.LastJobRun, &t.NextJobRun, &t.Status,
		&t.CreatedByID, &t.ModifiedByID, &t.CurrentJobID, &t.LastJobID, &t.NextScheduleID, &t.OrganizationID, &t.ExecutionEnvironmentID,
		&t.JobType, &t.Playbook, &t.Forks, &t.Limit, &t.Verbosity, &t.ExtraVars, &t.JobTags, &t.ForceHandlers, &t.SkipTags, &t.StartAtTask, &t.BecomeEnabled,
		&t.HostConfigKey, &t.AskVariablesOnLaunch, &t.SurveyEnabled, &t.SurveySpec, &t.InventoryID, &t.ProjectID, &t.AskLimitOnLaunch, &t.AskInventoryOnLaunch,
		&t.AskCredentialOnLaunch, &t.AskJobTypeOnLaunch, &t.AskTagsOnLaunch, &t.AllowSimultaneous, &t.AskSkipTagsOnLaunch, &t.Timeout, &t.UseFactCache,
		&t.AskVerbosityOnLaunch, &t.AskDiffModeOnLaunch, &t.DiffMode, &t.JobSliceCount, &t.AskSCMBranchOnLaunch, &t.SCMBranch, &t.WebhookCredentialID,
		&t.WebhookKey, &t.WebhookService, &t.AskExecutionEnvironmentOnLaunch, &t.AskForksOnLaunch, &t.AskInstanceGroupsOnLaunch, &t.AskJobSliceCountOnLaunch,
		&t.AskLabelsOnLaunch, &t.AskTimeoutOnLaunch, &t.PreventInstanceGroupFallback, &t.JobSlicePinnedHosts, &t.PreventRelaunch,
		&t.AdminRoleID, &t.ExecuteRoleID, &t.ReadRoleID)
	if err != nil {
		return nil, err
	}
	if len(t.SurveySpec) == 0 {
		t.SurveySpec = json.RawMessage("{}")
	}
	return t, nil
}

// RoleID returns a role id by field name.
func (t *JobTemplate) RoleID(field string) *int64 {
	switch field {
	case "admin_role":
		return t.AdminRoleID
	case "execute_role":
		return t.ExecuteRoleID
	case "read_role":
		return t.ReadRoleID
	}
	return nil
}

// Roles maps role field to id for the roles that exist.
func (t *JobTemplate) Roles() map[string]int64 {
	m := map[string]int64{}
	for _, f := range JobTemplateRoleFields {
		if id := t.RoleID(f); id != nil {
			m[f] = *id
		}
	}
	return m
}

// SurveySpecMap decodes the survey spec; an empty spec is an empty map.
func (t *JobTemplate) SurveySpecMap() map[string]any {
	m := map[string]any{}
	if len(t.SurveySpec) > 0 {
		_ = json.Unmarshal(t.SurveySpec, &m)
	}
	if m == nil {
		m = map[string]any{}
	}
	return m
}

// SurveyElements returns the spec entries of a survey, if any.
func (t *JobTemplate) SurveyElements() []map[string]any {
	spec, _ := t.SurveySpecMap()["spec"].([]any)
	var out []map[string]any
	for _, e := range spec {
		if m, ok := e.(map[string]any); ok {
			out = append(out, m)
		}
	}
	return out
}

// HasSurvey reports whether the survey is enabled and has a spec, which is
// what the launch view reported as survey_enabled.
func (t *JobTemplate) HasSurvey() bool {
	if !t.SurveyEnabled {
		return false
	}
	_, ok := t.SurveySpecMap()["spec"]
	return ok
}

// JobSlicePinnedHostsList splits the pinned host names.
func (t *JobTemplate) JobSlicePinnedHostsList() []string {
	var out []string
	for _, n := range strings.Split(t.JobSlicePinnedHosts, ",") {
		if n = strings.TrimSpace(n); n != "" {
			out = append(out, n)
		}
	}
	return out
}

// GetJobTemplate loads one job template.
func GetJobTemplate(ctx context.Context, q db.Querier, id int64) (*JobTemplate, error) {
	return ScanJobTemplate(q.QueryRow(ctx, `SELECT `+JobTemplateColumns+` FROM `+JobTemplateFrom+` WHERE ujt.id = $1`, id))
}

// jobTemplateParentLookup resolves "organization.<role>" and
// "inventory.organization.<role>" parent specs for a job template.
func jobTemplateParentLookup(t *JobTemplate, orgLookup func(int64) *Organization, invOrg func(int64) *int64) ParentLookup {
	return func(spec string) *int64 {
		var orgID *int64
		switch {
		case strings.HasPrefix(spec, "organization."):
			orgID = t.OrganizationID
			spec = strings.TrimPrefix(spec, "organization.")
		case strings.HasPrefix(spec, "inventory.organization."):
			if t.InventoryID == nil {
				return nil
			}
			orgID = invOrg(*t.InventoryID)
			spec = strings.TrimPrefix(spec, "inventory.organization.")
		default:
			return nil
		}
		if orgID == nil {
			return nil
		}
		org := orgLookup(*orgID)
		if org == nil {
			return nil
		}
		return org.RoleID(spec)
	}
}

// InsertJobTemplate creates the unified job template row, the job template
// row and the roles.
func InsertJobTemplate(ctx context.Context, tx pgx.Tx, t *JobTemplate, cts *ContentTypes, factory RoleFactory, orgLookup func(int64) *Organization, invOrg func(int64) *int64) error {
	ct := cts.ID("main.jobtemplate")
	if t.Status == "" {
		t.Status = "never updated"
	}
	if len(t.SurveySpec) == 0 {
		t.SurveySpec = json.RawMessage("{}")
	}
	err := tx.QueryRow(ctx, `INSERT INTO main_unifiedjobtemplate (created, modified, description, name, old_pk, last_job_failed, last_job_run, next_job_run, status,
		created_by_id, current_job_id, last_job_id, modified_by_id, next_schedule_id, polymorphic_ctype_id, organization_id, execution_environment_id)
		VALUES (now(), now(), $1, $2, NULL, false, NULL, NULL, $3, $4, NULL, NULL, $5, NULL, $6, $7, $8) RETURNING id, created, modified`,
		t.Description, t.Name, t.Status, t.CreatedByID, t.ModifiedByID, ct, t.OrganizationID, t.ExecutionEnvironmentID).Scan(&t.ID, &t.Created, &t.Modified)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `INSERT INTO main_jobtemplate (unifiedjobtemplate_ptr_id, job_type, playbook, forks, "limit", verbosity, extra_vars, job_tags, force_handlers, skip_tags,
		start_at_task, become_enabled, host_config_key, ask_variables_on_launch, survey_enabled, survey_spec, inventory_id, project_id, admin_role_id, execute_role_id, read_role_id,
		ask_limit_on_launch, ask_inventory_on_launch, ask_credential_on_launch, ask_job_type_on_launch, ask_tags_on_launch, allow_simultaneous, ask_skip_tags_on_launch, timeout,
		use_fact_cache, ask_verbosity_on_launch, ask_diff_mode_on_launch, diff_mode, job_slice_count, ask_scm_branch_on_launch, scm_branch, webhook_credential_id, webhook_key,
		webhook_service, ask_execution_environment_on_launch, ask_forks_on_launch, ask_instance_groups_on_launch, ask_job_slice_count_on_launch, ask_labels_on_launch,
		ask_timeout_on_launch, prevent_instance_group_fallback, job_slice_pinned_hosts, prevent_relaunch)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NULL, NULL, NULL, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31,
		$32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44, $45)`,
		t.ID, t.JobType, t.Playbook, t.Forks, t.Limit, t.Verbosity, t.ExtraVars, t.JobTags, t.ForceHandlers, t.SkipTags,
		t.StartAtTask, t.BecomeEnabled, t.HostConfigKey, t.AskVariablesOnLaunch, t.SurveyEnabled, string(t.SurveySpec), t.InventoryID, t.ProjectID,
		t.AskLimitOnLaunch, t.AskInventoryOnLaunch, t.AskCredentialOnLaunch, t.AskJobTypeOnLaunch, t.AskTagsOnLaunch, t.AllowSimultaneous, t.AskSkipTagsOnLaunch, t.Timeout,
		t.UseFactCache, t.AskVerbosityOnLaunch, t.AskDiffModeOnLaunch, t.DiffMode, t.JobSliceCount, t.AskSCMBranchOnLaunch, t.SCMBranch, t.WebhookCredentialID, t.WebhookKey,
		t.WebhookService, t.AskExecutionEnvironmentOnLaunch, t.AskForksOnLaunch, t.AskInstanceGroupsOnLaunch, t.AskJobSliceCountOnLaunch, t.AskLabelsOnLaunch,
		t.AskTimeoutOnLaunch, t.PreventInstanceGroupFallback, t.JobSlicePinnedHosts, t.PreventRelaunch)
	if err != nil {
		return err
	}
	roles, err := factory.CreateRoles(ctx, tx, "jobtemplate", ct, t.ID, JobTemplateRoleFields, jobTemplateParentLookup(t, orgLookup, invOrg))
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `UPDATE main_jobtemplate SET admin_role_id = $2, execute_role_id = $3, read_role_id = $4 WHERE unifiedjobtemplate_ptr_id = $1`,
		t.ID, roles["admin_role"], roles["execute_role"], roles["read_role"])
	if err != nil {
		return err
	}
	a, e, r := roles["admin_role"], roles["execute_role"], roles["read_role"]
	t.AdminRoleID, t.ExecuteRoleID, t.ReadRoleID = &a, &e, &r
	return nil
}

// UpdateJobTemplate writes the editable columns of both tables and re-links
// the organization and inventory role parents when those changed.
func UpdateJobTemplate(ctx context.Context, tx pgx.Tx, t *JobTemplate, orgLookup func(int64) *Organization, invOrg func(int64) *int64, orgChanged, invChanged bool) error {
	err := tx.QueryRow(ctx, `UPDATE main_unifiedjobtemplate SET modified = now(), description = $2, name = $3, modified_by_id = $4, organization_id = $5, execution_environment_id = $6 WHERE id = $1 RETURNING modified`,
		t.ID, t.Description, t.Name, t.ModifiedByID, t.OrganizationID, t.ExecutionEnvironmentID).Scan(&t.Modified)
	if err != nil {
		return err
	}
	if len(t.SurveySpec) == 0 {
		t.SurveySpec = json.RawMessage("{}")
	}
	_, err = tx.Exec(ctx, `UPDATE main_jobtemplate SET job_type = $2, playbook = $3, forks = $4, "limit" = $5, verbosity = $6, extra_vars = $7, job_tags = $8, force_handlers = $9, skip_tags = $10,
		start_at_task = $11, become_enabled = $12, host_config_key = $13, ask_variables_on_launch = $14, survey_enabled = $15, survey_spec = $16, inventory_id = $17, project_id = $18,
		ask_limit_on_launch = $19, ask_inventory_on_launch = $20, ask_credential_on_launch = $21, ask_job_type_on_launch = $22, ask_tags_on_launch = $23, allow_simultaneous = $24,
		ask_skip_tags_on_launch = $25, timeout = $26, use_fact_cache = $27, ask_verbosity_on_launch = $28, ask_diff_mode_on_launch = $29, diff_mode = $30, job_slice_count = $31,
		ask_scm_branch_on_launch = $32, scm_branch = $33, webhook_credential_id = $34, webhook_key = $35, webhook_service = $36, ask_execution_environment_on_launch = $37,
		ask_forks_on_launch = $38, ask_instance_groups_on_launch = $39, ask_job_slice_count_on_launch = $40, ask_labels_on_launch = $41, ask_timeout_on_launch = $42,
		prevent_instance_group_fallback = $43, job_slice_pinned_hosts = $44, prevent_relaunch = $45 WHERE unifiedjobtemplate_ptr_id = $1`,
		t.ID, t.JobType, t.Playbook, t.Forks, t.Limit, t.Verbosity, t.ExtraVars, t.JobTags, t.ForceHandlers, t.SkipTags,
		t.StartAtTask, t.BecomeEnabled, t.HostConfigKey, t.AskVariablesOnLaunch, t.SurveyEnabled, string(t.SurveySpec), t.InventoryID, t.ProjectID,
		t.AskLimitOnLaunch, t.AskInventoryOnLaunch, t.AskCredentialOnLaunch, t.AskJobTypeOnLaunch, t.AskTagsOnLaunch, t.AllowSimultaneous,
		t.AskSkipTagsOnLaunch, t.Timeout, t.UseFactCache, t.AskVerbosityOnLaunch, t.AskDiffModeOnLaunch, t.DiffMode, t.JobSliceCount,
		t.AskSCMBranchOnLaunch, t.SCMBranch, t.WebhookCredentialID, t.WebhookKey, t.WebhookService, t.AskExecutionEnvironmentOnLaunch,
		t.AskForksOnLaunch, t.AskInstanceGroupsOnLaunch, t.AskJobSliceCountOnLaunch, t.AskLabelsOnLaunch, t.AskTimeoutOnLaunch,
		t.PreventInstanceGroupFallback, t.JobSlicePinnedHosts, t.PreventRelaunch)
	if err != nil {
		return err
	}
	lookup := jobTemplateParentLookup(t, orgLookup, invOrg)
	if orgChanged {
		if err := RelinkParentRole(ctx, tx, "jobtemplate", t.Roles(), "organization", lookup); err != nil {
			return err
		}
	}
	if invChanged {
		if err := RelinkParentRole(ctx, tx, "jobtemplate", t.Roles(), "inventory", lookup); err != nil {
			return err
		}
	}
	return nil
}

// UpdateJobTemplateSurvey writes only the survey spec.
func UpdateJobTemplateSurvey(ctx context.Context, q db.Querier, id int64, spec json.RawMessage) error {
	if len(spec) == 0 {
		spec = json.RawMessage("{}")
	}
	_, err := q.Exec(ctx, `UPDATE main_jobtemplate SET survey_spec = $2 WHERE unifiedjobtemplate_ptr_id = $1`, id, string(spec))
	if err != nil {
		return err
	}
	_, err = q.Exec(ctx, `UPDATE main_unifiedjobtemplate SET modified = now() WHERE id = $1`, id)
	return err
}

// DeleteJobTemplate removes a job template, its roles and everything that
// depended on it. Jobs keep their rows with job_template set to NULL, as the
// old SET_NULL rule arranged; those of a template that prevented relaunch
// keep that protection.
func DeleteJobTemplate(ctx context.Context, tx pgx.Tx, t *JobTemplate, cts *ContentTypes, cascader *Cascader) error {
	if t.PreventRelaunch {
		if _, err := tx.Exec(ctx, `UPDATE main_job SET prevent_relaunch = true WHERE job_template_id = $1`, t.ID); err != nil {
			return err
		}
	}
	if err := DeleteRolesFor(ctx, tx, cts.ID("main.jobtemplate"), t.ID); err != nil {
		return err
	}
	return cascader.Delete(ctx, tx, "main_unifiedjobtemplate", "id", []int64{t.ID})
}

// TemplateLabels lists the labels attached to unified job templates, by
// label name as the old prefetch ordered them.
func TemplateLabels(ctx context.Context, q db.Querier, ids []int64) (map[int64][]NameSummary, error) {
	out := map[int64][]NameSummary{}
	if len(ids) == 0 {
		return out, nil
	}
	rows, err := q.Query(ctx, `SELECT tl.unifiedjobtemplate_id, l.id, l.name FROM main_unifiedjobtemplate_labels tl JOIN main_label l ON l.id = tl.label_id WHERE tl.unifiedjobtemplate_id = ANY($1) ORDER BY l.name, l.id`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var t int64
		var l NameSummary
		if err := rows.Scan(&t, &l.ID, &l.Name); err != nil {
			return nil, err
		}
		out[t] = append(out[t], l)
	}
	return out, rows.Err()
}

// JobLabels lists the labels attached to unified jobs.
func JobLabels(ctx context.Context, q db.Querier, ids []int64) (map[int64][]NameSummary, error) {
	out := map[int64][]NameSummary{}
	if len(ids) == 0 {
		return out, nil
	}
	rows, err := q.Query(ctx, `SELECT jl.unifiedjob_id, l.id, l.name FROM main_unifiedjob_labels jl JOIN main_label l ON l.id = jl.label_id WHERE jl.unifiedjob_id = ANY($1) ORDER BY l.name, l.id`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var j int64
		var l NameSummary
		if err := rows.Scan(&j, &l.ID, &l.Name); err != nil {
			return nil, err
		}
		out[j] = append(out[j], l)
	}
	return out, rows.Err()
}

// CredentialBrief is what the credentials summary of a template or job
// carries, plus what launch validation needs.
type CredentialBrief struct {
	ID          int64
	Name        string
	Description string
	// Kind is the credential type namespace (the old Credential.kind);
	// TypeKind is the type's kind (ssh, vault, cloud, ...).
	Kind             string
	TypeKind         string
	Cloud            bool
	CredentialTypeID int64
	TypeName         string
	Managed          bool
	Inputs           json.RawMessage
	// vaultIDSource is set for a vault credential whose vault_id an input
	// source fills: the lookup UniqueHash runs for it.
	vaultIDSource *dynamicInput
}

// InputLookup is Credential.get_input of a field an input source fills:
// the lookup, run there and then, and str() of its value.
type InputLookup func(ctx context.Context, credID int64, field string) (string, error)

type inputLookupKey struct{}

// WithInputLookup marks ctx with the lookup that credential briefs loaded
// with it run for a vault id an input source fills (see UniqueHash).
func WithInputLookup(ctx context.Context, fn InputLookup) context.Context {
	return context.WithValue(ctx, inputLookupKey{}, fn)
}

// dynamicInput is one looked-up field of a credential, looked up when it
// is first asked for and then kept for the brief.
type dynamicInput struct {
	once   sync.Once
	ctx    context.Context
	lookup InputLookup
	credID int64
	field  string
	value  string
	err    error
}

func (d *dynamicInput) get() (string, error) {
	d.once.Do(func() {
		if d.lookup == nil {
			d.err = errNoInputLookup
			return
		}
		d.value, d.err = d.lookup(d.ctx, d.credID, d.field)
	})
	return d.value, d.err
}

type noInputLookup struct{}

func (noInputLookup) Error() string { return "no lookup to run for a looked-up input here" }

var errNoInputLookup error = noInputLookup{}

// credentialBriefColumns are the columns scanCredentialBrief reads, with
// "c" the credential and "ct" its type.
const credentialBriefColumns = `c.id, c.name, c.description, COALESCE(ct.namespace, ct.kind), ct.kind, ct.id, ct.name, ct.managed, c.inputs,
	ct.kind = 'vault' AND EXISTS (SELECT 1 FROM main_credentialinputsource cis WHERE cis.target_credential_id = c.id AND cis.input_field_name = 'vault_id')`

// scanCredentialBrief reads credentialBriefColumns after the leading
// destinations given.
func scanCredentialBrief(ctx context.Context, rows pgx.Rows, lead ...any) (CredentialBrief, error) {
	var b CredentialBrief
	var vaultIDSource bool
	dest := append(lead, &b.ID, &b.Name, &b.Description, &b.Kind, &b.TypeKind, &b.CredentialTypeID, &b.TypeName, &b.Managed, &b.Inputs, &vaultIDSource)
	if err := rows.Scan(dest...); err != nil {
		return b, err
	}
	b.Cloud = b.TypeKind == "cloud"
	if vaultIDSource {
		fn, _ := ctx.Value(inputLookupKey{}).(InputLookup)
		b.vaultIDSource = &dynamicInput{ctx: ctx, lookup: fn, credID: b.ID, field: "vault_id"}
	}
	return b, nil
}

// loadCredentialBriefs returns briefs for a join table keyed by its owner
// column, in attachment order.
func loadCredentialBriefs(ctx context.Context, q db.Querier, table, ownerColumn string, ids []int64) (map[int64][]CredentialBrief, error) {
	out := map[int64][]CredentialBrief{}
	if len(ids) == 0 {
		return out, nil
	}
	rows, err := q.Query(ctx, `SELECT x.`+ownerColumn+`, `+credentialBriefColumns+` FROM `+table+` x
		JOIN main_credential c ON c.id = x.credential_id JOIN main_credentialtype ct ON ct.id = c.credential_type_id WHERE x.`+ownerColumn+` = ANY($1) ORDER BY x.id`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var owner int64
		b, err := scanCredentialBrief(ctx, rows, &owner)
		if err != nil {
			return nil, err
		}
		out[owner] = append(out[owner], b)
	}
	return out, rows.Err()
}

// TemplateCredentials returns the credential briefs of unified job templates.
func TemplateCredentials(ctx context.Context, q db.Querier, ids []int64) (map[int64][]CredentialBrief, error) {
	return loadCredentialBriefs(ctx, q, "main_unifiedjobtemplate_credentials", "unifiedjobtemplate_id", ids)
}

// JobCredentials returns the credential briefs of unified jobs.
func JobCredentials(ctx context.Context, q db.Querier, ids []int64) (map[int64][]CredentialBrief, error) {
	return loadCredentialBriefs(ctx, q, "main_unifiedjob_credentials", "unifiedjob_id", ids)
}

// LoadCredentialBriefs returns briefs for arbitrary credential ids, in the
// order given.
func LoadCredentialBriefs(ctx context.Context, q db.Querier, ids []int64) ([]CredentialBrief, error) {
	if len(ids) == 0 {
		return nil, nil
	}
	rows, err := q.Query(ctx, `SELECT `+credentialBriefColumns+` FROM main_credential c JOIN main_credentialtype ct ON ct.id = c.credential_type_id WHERE c.id = ANY($1)`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	byID := map[int64]CredentialBrief{}
	for rows.Next() {
		b, err := scanCredentialBrief(ctx, rows)
		if err != nil {
			return nil, err
		}
		byID[b.ID] = b
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	out := make([]CredentialBrief, 0, len(ids))
	for _, id := range ids {
		if b, ok := byID[id]; ok {
			out = append(out, b)
		}
	}
	return out, nil
}

// InputString returns a string input of the credential, or "".
func (b CredentialBrief) InputString(key string) string {
	var m map[string]any
	if len(b.Inputs) > 0 {
		_ = json.Unmarshal(b.Inputs, &m)
	}
	s, _ := m[key].(string)
	return s
}

// vaultID is has_input('vault_id') and get_input('vault_id') of a vault
// credential. A vault id an input source fills always counts as given
// (has_input), and its value is the lookup's, run when it is asked for, as
// get_input ran it then. failed is a lookup that did not work, or that
// cannot run where the brief was loaded.
func (b CredentialBrief) vaultID() (v string, has, failed bool) {
	if b.TypeKind != "vault" {
		return "", false, false
	}
	if b.vaultIDSource != nil {
		v, err := b.vaultIDSource.get()
		if err != nil {
			return "", true, true
		}
		return v, true, false
	}
	v = b.InputString("vault_id")
	return v, v != "", false
}

// UniqueHash reproduces Credential.unique_hash: the type id, or for vault
// credentials with a vault id the type id and that id, looked up when an
// input source fills it.
//
// A lookup that fails raised out of unique_hash in the old code, a 500 for
// the request. Here the credential is told apart from every other one
// instead: it conflicts with none and replaces none, and the job that uses
// it fails on the same lookup with its traceback.
func (b CredentialBrief) UniqueHash() string {
	v, has, failed := b.vaultID()
	switch {
	case failed:
		return itoa(b.CredentialTypeID) + "_\x00" + itoa(b.ID)
	case has:
		return itoa(b.CredentialTypeID) + "_" + v
	}
	return itoa(b.CredentialTypeID)
}

// UniqueHashDisplay is the display form of UniqueHash.
func (b CredentialBrief) UniqueHashDisplay() string {
	if v, has, failed := b.vaultID(); has && !failed {
		return b.TypeName + " (id=" + v + ")"
	}
	return b.TypeName
}

// PasswordsNeeded reproduces Credential.passwords_needed: the inputs set to
// ASK, named the way the launch endpoints expect them.
func (b CredentialBrief) PasswordsNeeded() []string {
	var out []string
	if b.TypeKind == "ssh" {
		if b.InputString("password") == "ASK" {
			out = append(out, "ssh_password")
		}
		if b.InputString("become_password") == "ASK" {
			out = append(out, "become_password")
		}
		if b.InputString("ssh_key_unlock") == "ASK" {
			out = append(out, "ssh_key_unlock")
		}
	}
	if b.TypeKind == "vault" && b.InputString("vault_password") == "ASK" {
		if v := b.InputString("vault_id"); v != "" {
			out = append(out, "vault_password."+v)
		} else {
			out = append(out, "vault_password")
		}
	}
	if out == nil {
		out = []string{}
	}
	return out
}

// RecentJob is one entry of a template's recent_jobs summary.
type RecentTemplateJob struct {
	ID         int64
	Status     string
	Finished   *time.Time
	CanceledOn *time.Time
	Type       string
}

// LoadRecentTemplateJobs returns the ten most recent jobs of each template,
// excluding slice jobs, as JobTemplateMixin._recent_jobs did.
func LoadRecentTemplateJobs(ctx context.Context, q db.Querier, cts *ContentTypes, ids []int64) (map[int64][]RecentTemplateJob, error) {
	out := map[int64][]RecentTemplateJob{}
	if len(ids) == 0 {
		return out, nil
	}
	// Ten per template through LATERAL ... LIMIT: a window over every job
	// of the page's templates, joined to main_job, read the whole job
	// table.
	seen := map[int64]bool{}
	uniq := make([]int64, 0, len(ids))
	for _, id := range ids {
		if !seen[id] {
			seen[id] = true
			uniq = append(uniq, id)
		}
	}
	rows, err := q.Query(ctx, `SELECT t.id, x.id, x.status, x.finished, x.canceled_on, x.polymorphic_ctype_id
		FROM unnest($1::int[]) AS t(id) CROSS JOIN LATERAL (
			SELECT uj.id, uj.status, uj.finished, uj.canceled_on, uj.polymorphic_ctype_id, uj.created FROM main_unifiedjob uj
			WHERE uj.unified_job_template_id = t.id AND NOT EXISTS (SELECT 1 FROM main_job j WHERE j.unifiedjob_ptr_id = uj.id AND j.job_slice_count > 1)
			ORDER BY uj.created DESC, uj.id DESC LIMIT 10) x
		ORDER BY x.created DESC, x.id DESC`, uniq)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var tid, ct int64
		var j RecentTemplateJob
		if err := rows.Scan(&tid, &j.ID, &j.Status, &j.Finished, &j.CanceledOn, &ct); err != nil {
			return nil, err
		}
		j.Type = JobTypeForContentType(cts, ct)
		out[tid] = append(out[tid], j)
	}
	return out, rows.Err()
}

// TemplateInstanceGroupIDs lists a template's instance groups in order.
func TemplateInstanceGroupIDs(ctx context.Context, q db.Querier, id int64) ([]int64, error) {
	rows, err := q.Query(ctx, `SELECT instancegroup_id FROM main_unifiedjobtemplateinstancegroupmembership WHERE unifiedjobtemplate_id = $1 ORDER BY position, id`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []int64
	for rows.Next() {
		var g int64
		if err := rows.Scan(&g); err != nil {
			return nil, err
		}
		out = append(out, g)
	}
	return out, rows.Err()
}
