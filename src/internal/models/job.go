package models

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/extlog"
)

// Job is a main_job row with its unified job parent.
type Job struct {
	UnifiedJob
	JobType             string
	Playbook            string
	Forks               int64
	Limit               string
	Verbosity           int64
	ExtraVars           string
	JobTags             string
	ForceHandlers       bool
	SkipTags            string
	StartAtTask         string
	BecomeEnabled       bool
	InventoryID         *int64
	JobTemplateID       *int64
	ProjectID           *int64
	AllowSimultaneous   bool
	Artifacts           string
	Timeout             int64
	SCMRevision         string
	ProjectUpdateID     *int64
	UseFactCache        bool
	DiffMode            bool
	JobSliceCount       int64
	JobSliceNumber      int64
	SCMBranch           string
	WebhookCredentialID *int64
	WebhookGUID         string
	WebhookService      string
	SurveyPasswords     json.RawMessage
	JobSlicePinnedHosts string
	PreventRelaunch     bool
}

// JobColumns selects with aliases uj and j.
const JobColumns = UnifiedJobColumns + `, j.job_type, j.playbook, j.forks, j."limit", j.verbosity, j.extra_vars, j.job_tags, j.force_handlers, j.skip_tags, j.start_at_task,
	j.become_enabled, j.inventory_id, j.job_template_id, j.project_id, j.allow_simultaneous, j.artifacts, j.timeout, j.scm_revision, j.project_update_id, j.use_fact_cache,
	j.diff_mode, j.job_slice_count, j.job_slice_number, j.scm_branch, j.webhook_credential_id, j.webhook_guid, j.webhook_service, j.survey_passwords, j.job_slice_pinned_hosts, j.prevent_relaunch`

// JobFrom is the FROM clause matching JobColumns.
const JobFrom = `main_job j JOIN main_unifiedjob uj ON uj.id = j.unifiedjob_ptr_id`

// ScanJob reads a row produced with JobColumns.
func ScanJob(r pgx.Row) (*Job, error) {
	jb := &Job{}
	j := &jb.UnifiedJob
	err := r.Scan(&j.ID, &j.Created, &j.Modified, &j.Name, &j.Description, &j.LaunchType, &j.CancelFlag, &j.Status, &j.Failed, &j.Started, &j.Finished, &j.Elapsed,
		&j.JobArgs, &j.JobCwd, &j.JobExplanation, &j.StartArgs, &j.ResultTraceback, &j.CeleryTaskID,
		&j.CreatedByID, &j.ModifiedByID, &j.PolymorphicCtypeID, &j.ScheduleID, &j.UnifiedJobTemplateID, &j.ExecutionNode, &j.InstanceGroupID,
		&j.EmittedEvents, &j.ControllerNode, &j.CanceledOn, &j.DependenciesProcessed, &j.OrganizationID, &j.ExecutionEnvironmentID,
		&j.InstalledCollections, &j.AnsibleVersion, &j.WorkUnitID, &j.HostStatusCounts, &j.TaskImpact, &j.JobEnv,
		&jb.JobType, &jb.Playbook, &jb.Forks, &jb.Limit, &jb.Verbosity, &jb.ExtraVars, &jb.JobTags, &jb.ForceHandlers, &jb.SkipTags, &jb.StartAtTask,
		&jb.BecomeEnabled, &jb.InventoryID, &jb.JobTemplateID, &jb.ProjectID, &jb.AllowSimultaneous, &jb.Artifacts, &jb.Timeout, &jb.SCMRevision, &jb.ProjectUpdateID, &jb.UseFactCache,
		&jb.DiffMode, &jb.JobSliceCount, &jb.JobSliceNumber, &jb.SCMBranch, &jb.WebhookCredentialID, &jb.WebhookGUID, &jb.WebhookService, &jb.SurveyPasswords, &jb.JobSlicePinnedHosts, &jb.PreventRelaunch)
	if err != nil {
		return nil, err
	}
	return jb, nil
}

// GetJob loads one job.
func GetJob(ctx context.Context, q db.Querier, id int64) (*Job, error) {
	return ScanJob(q.QueryRow(ctx, `SELECT `+JobColumns+` FROM `+JobFrom+` WHERE uj.id = $1`, id))
}

// SurveyPasswordsMap decodes the survey password redactions.
func (j *Job) SurveyPasswordsMap() map[string]any {
	m := map[string]any{}
	if len(j.SurveyPasswords) > 0 {
		_ = json.Unmarshal(j.SurveyPasswords, &m)
	}
	if m == nil {
		m = map[string]any{}
	}
	return m
}

// JobPrompts are the launch-time values a job was created with; nil
// pointers mean "not provided".
type JobPrompts struct {
	ExtraVars            map[string]any
	InventoryID          *int64
	SCMBranch            *string
	Limit                *string
	JobTags              *string
	SkipTags             *string
	JobType              *string
	Verbosity            *int64
	DiffMode             *bool
	Forks                *int64
	JobSliceCount        *int64
	Timeout              *int64
	ExecutionEnvironment *int64
	Credentials          []int64
	Labels               []int64
	InstanceGroups       []int64
	SurveyPasswords      map[string]any
}

// CharPrompts renders the scalar prompts as the char_prompts JSON object.
func (p *JobPrompts) CharPrompts() map[string]any {
	out := map[string]any{}
	if p.SCMBranch != nil {
		out["scm_branch"] = *p.SCMBranch
	}
	if p.Limit != nil {
		out["limit"] = *p.Limit
	}
	if p.JobTags != nil {
		out["job_tags"] = *p.JobTags
	}
	if p.SkipTags != nil {
		out["skip_tags"] = *p.SkipTags
	}
	if p.JobType != nil {
		out["job_type"] = *p.JobType
	}
	if p.Verbosity != nil {
		out["verbosity"] = *p.Verbosity
	}
	if p.DiffMode != nil {
		out["diff_mode"] = *p.DiffMode
	}
	if p.Forks != nil {
		out["forks"] = *p.Forks
	}
	if p.JobSliceCount != nil {
		out["job_slice_count"] = *p.JobSliceCount
	}
	if p.Timeout != nil {
		out["timeout"] = *p.Timeout
	}
	return out
}

// InsertJob writes a job in the given status, its credentials and labels,
// the launch configuration and the template's current_job pointer.
// credentials and labels are the full lists the job runs with; cfg holds the
// prompts that differed from the template and go into the launch config.
func InsertJob(ctx context.Context, tx pgx.Tx, jb *Job, cts *ContentTypes, credentials, labels []int64, cfg *JobPrompts, cfgCredentials, cfgLabels []int64) error {
	if jb.Status == "" {
		jb.Status = "new"
	}
	if jb.Artifacts == "" {
		jb.Artifacts = "{}"
	}
	if len(jb.SurveyPasswords) == 0 {
		jb.SurveyPasswords = json.RawMessage("{}")
	}
	if len(jb.InstalledCollections) == 0 {
		jb.InstalledCollections = json.RawMessage("{}")
	}
	if len(jb.JobEnv) == 0 {
		jb.JobEnv = json.RawMessage("{}")
	}
	cache := "[]"
	if jb.PreferredInstanceGroups != nil {
		b, _ := json.Marshal(jb.PreferredInstanceGroups)
		cache = string(b)
	}
	err := tx.QueryRow(ctx, `INSERT INTO main_unifiedjob (created, modified, description, name, old_pk, launch_type, cancel_flag, status, failed, started, finished, elapsed,
		job_args, job_cwd, job_explanation, start_args, result_stdout_text, result_traceback, celery_task_id, created_by_id, modified_by_id, polymorphic_ctype_id, schedule_id,
		unified_job_template_id, execution_node, instance_group_id, emitted_events, controller_node, canceled_on, dependencies_processed, organization_id, execution_environment_id,
		installed_collections, ansible_version, work_unit_id, host_status_counts, preferred_instance_groups_cache, task_impact, job_env)
		VALUES (now(), now(), $1, $2, NULL, $3, false, $4, false, NULL, NULL, 0, '', '', '', $5, '', '', '', $6, $7, $8, $9,
		$10, '', NULL, 0, '', NULL, $11, $12, $13, $14::jsonb, '', NULL, NULL, $15::jsonb, $16, $17::jsonb) RETURNING id, created, modified`,
		jb.Description, jb.Name, jb.LaunchType, jb.Status, jb.StartArgs, jb.CreatedByID, jb.ModifiedByID, cts.ID("main.job"), jb.ScheduleID,
		jb.UnifiedJobTemplateID, jb.DependenciesProcessed, jb.OrganizationID, jb.ExecutionEnvironmentID,
		string(jb.InstalledCollections), cache, jb.TaskImpact, string(jb.JobEnv)).Scan(&jb.ID, &jb.Created, &jb.Modified)
	if err != nil {
		return err
	}
	extlog.Default().LogLifecycle(ctx, extlog.Lifecycle{Type: "job", TaskID: jb.ID, State: "created", TaskName: jb.Name, OrganizationID: jb.OrganizationID})
	jb.PolymorphicCtypeID = cts.ID("main.job")
	_, err = tx.Exec(ctx, `INSERT INTO main_job (unifiedjob_ptr_id, job_type, playbook, forks, "limit", verbosity, extra_vars, job_tags, force_handlers, skip_tags, start_at_task,
		become_enabled, inventory_id, job_template_id, project_id, allow_simultaneous, artifacts, timeout, scm_revision, project_update_id, use_fact_cache, diff_mode,
		job_slice_count, job_slice_number, scm_branch, webhook_credential_id, webhook_guid, webhook_service, survey_passwords, job_slice_pinned_hosts, prevent_relaunch)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, '', NULL, $19, $20, $21, $22, $23, $24, $25, $26, $27::jsonb, $28, false)`,
		jb.ID, jb.JobType, jb.Playbook, jb.Forks, jb.Limit, jb.Verbosity, jb.ExtraVars, jb.JobTags, jb.ForceHandlers, jb.SkipTags, jb.StartAtTask,
		jb.BecomeEnabled, jb.InventoryID, jb.JobTemplateID, jb.ProjectID, jb.AllowSimultaneous, jb.Artifacts, jb.Timeout, jb.UseFactCache, jb.DiffMode,
		jb.JobSliceCount, jb.JobSliceNumber, jb.SCMBranch, jb.WebhookCredentialID, jb.WebhookGUID, jb.WebhookService, string(jb.SurveyPasswords), jb.JobSlicePinnedHosts)
	if err != nil {
		return err
	}
	for _, c := range credentials {
		if _, err := tx.Exec(ctx, `INSERT INTO main_unifiedjob_credentials (unifiedjob_id, credential_id) VALUES ($1, $2)`, jb.ID, c); err != nil {
			return err
		}
	}
	for _, l := range labels {
		if _, err := tx.Exec(ctx, `INSERT INTO main_unifiedjob_labels (unifiedjob_id, label_id) VALUES ($1, $2)`, jb.ID, l); err != nil {
			return err
		}
	}
	if cfg != nil {
		if err := InsertLaunchConfig(ctx, tx, jb.ID, cfg, cfgCredentials, cfgLabels); err != nil {
			return err
		}
	}
	if jb.UnifiedJobTemplateID != nil && ActiveStatuses[jb.Status] && jb.Status != "new" {
		if _, err := tx.Exec(ctx, `UPDATE main_unifiedjobtemplate SET current_job_id = $2, status = $3, modified = now() WHERE id = $1`, *jb.UnifiedJobTemplateID, jb.ID, jb.Status); err != nil {
			return err
		}
	}
	return nil
}

// InsertLaunchConfig records the prompts a job was launched with, as
// create_config_from_prompts did.
func InsertLaunchConfig(ctx context.Context, tx pgx.Tx, jobID int64, cfg *JobPrompts, credentials, labels []int64) error {
	extra := "{}"
	if cfg.ExtraVars != nil {
		b, err := json.Marshal(cfg.ExtraVars)
		if err != nil {
			return err
		}
		extra = string(b)
	}
	chars, _ := json.Marshal(cfg.CharPrompts())
	passwords := "{}"
	if cfg.SurveyPasswords != nil {
		b, _ := json.Marshal(cfg.SurveyPasswords)
		passwords = string(b)
	}
	var id int64
	if err := tx.QueryRow(ctx, `INSERT INTO main_joblaunchconfig (extra_data, inventory_id, job_id, execution_environment_id, char_prompts, survey_passwords) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb) RETURNING id`,
		extra, cfg.InventoryID, jobID, cfg.ExecutionEnvironment, string(chars), passwords).Scan(&id); err != nil {
		return err
	}
	for _, c := range credentials {
		if _, err := tx.Exec(ctx, `INSERT INTO main_joblaunchconfig_credentials (joblaunchconfig_id, credential_id) VALUES ($1, $2)`, id, c); err != nil {
			return err
		}
	}
	for _, l := range labels {
		if _, err := tx.Exec(ctx, `INSERT INTO main_joblaunchconfig_labels (joblaunchconfig_id, label_id) VALUES ($1, $2)`, id, l); err != nil {
			return err
		}
	}
	for i, g := range cfg.InstanceGroups {
		if _, err := tx.Exec(ctx, `INSERT INTO main_joblaunchconfiginstancegroupmembership (position, instancegroup_id, joblaunchconfig_id) VALUES ($1, $2, $3)`, i, g, id); err != nil {
			return err
		}
	}
	return nil
}

// LaunchConfig is a saved main_joblaunchconfig row.
type LaunchConfig struct {
	ID                     int64
	JobID                  int64
	ExtraData              map[string]any
	InventoryID            *int64
	ExecutionEnvironmentID *int64
	CharPrompts            map[string]any
	SurveyPasswords        map[string]any
	Credentials            []int64
	Labels                 []int64
	InstanceGroups         []int64
}

// GetLaunchConfig loads the launch configuration of a job, or nil when the
// job was created without one.
func GetLaunchConfig(ctx context.Context, q db.Querier, jobID int64) (*LaunchConfig, error) {
	c := &LaunchConfig{JobID: jobID}
	var extra, chars, passwords string
	err := q.QueryRow(ctx, `SELECT id, COALESCE(extra_data, ''), inventory_id, execution_environment_id, COALESCE(char_prompts::text, '{}'), COALESCE(survey_passwords::text, '{}') FROM main_joblaunchconfig WHERE job_id = $1`, jobID).
		Scan(&c.ID, &extra, &c.InventoryID, &c.ExecutionEnvironmentID, &chars, &passwords)
	if err != nil {
		if db.IsNoRows(err) {
			return nil, nil
		}
		return nil, err
	}
	c.ExtraData = map[string]any{}
	if extra != "" {
		_ = json.Unmarshal([]byte(extra), &c.ExtraData)
	}
	c.CharPrompts = map[string]any{}
	_ = json.Unmarshal([]byte(chars), &c.CharPrompts)
	c.SurveyPasswords = map[string]any{}
	_ = json.Unmarshal([]byte(passwords), &c.SurveyPasswords)
	c.Credentials, err = scanIDs(ctx, q, `SELECT credential_id FROM main_joblaunchconfig_credentials WHERE joblaunchconfig_id = $1 ORDER BY id`, c.ID)
	if err != nil {
		return nil, err
	}
	c.Labels, err = scanIDs(ctx, q, `SELECT label_id FROM main_joblaunchconfig_labels WHERE joblaunchconfig_id = $1 ORDER BY id`, c.ID)
	if err != nil {
		return nil, err
	}
	c.InstanceGroups, err = scanIDs(ctx, q, `SELECT instancegroup_id FROM main_joblaunchconfiginstancegroupmembership WHERE joblaunchconfig_id = $1 ORDER BY position, id`, c.ID)
	if err != nil {
		return nil, err
	}
	return c, nil
}

func scanIDs(ctx context.Context, q db.Querier, sql string, args ...any) ([]int64, error) {
	rows, err := q.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}

// ScanIDs runs a query returning a single integer column.
func ScanIDs(ctx context.Context, q db.Querier, sql string, args ...any) ([]int64, error) {
	return scanIDs(ctx, q, sql, args...)
}

// Prompts converts a saved launch config back into the prompt set, as
// prompts_dict did: an empty list is treated as "not provided".
func (c *LaunchConfig) Prompts() *JobPrompts {
	p := &JobPrompts{InventoryID: c.InventoryID, ExecutionEnvironment: c.ExecutionEnvironmentID}
	if len(c.ExtraData) > 0 {
		p.ExtraVars = c.ExtraData
	}
	if len(c.SurveyPasswords) > 0 {
		p.SurveyPasswords = c.SurveyPasswords
	}
	str := func(k string) *string {
		if v, ok := c.CharPrompts[k]; ok && v != nil {
			s := fmt.Sprint(v)
			return &s
		}
		return nil
	}
	num := func(k string) *int64 {
		if v, ok := c.CharPrompts[k]; ok && v != nil {
			switch t := v.(type) {
			case float64:
				n := int64(t)
				return &n
			case int64:
				return &t
			case json.Number:
				n, _ := t.Int64()
				return &n
			}
		}
		return nil
	}
	p.SCMBranch = str("scm_branch")
	p.Limit = str("limit")
	p.JobTags = str("job_tags")
	p.SkipTags = str("skip_tags")
	p.JobType = str("job_type")
	p.Verbosity = num("verbosity")
	p.Forks = num("forks")
	p.JobSliceCount = num("job_slice_count")
	p.Timeout = num("timeout")
	if v, ok := c.CharPrompts["diff_mode"]; ok && v != nil {
		if b, ok := v.(bool); ok {
			p.DiffMode = &b
		}
	}
	if len(c.Credentials) > 0 {
		p.Credentials = c.Credentials
	}
	if len(c.Labels) > 0 {
		p.Labels = c.Labels
	}
	if len(c.InstanceGroups) > 0 {
		p.InstanceGroups = c.InstanceGroups
	}
	return p
}

// JobHostSummary is a main_jobhostsummary row.
type JobHostSummary struct {
	ID                int64
	Created, Modified time.Time
	HostName          string
	Changed           int64
	Dark              int64
	Failures          int64
	OK                int64
	Processed         int64
	Skipped           int64
	Failed            bool
	HostID            *int64
	JobID             int64
	Ignored           int64
	Rescued           int64
	ConstructedHostID *int64
}

// JobHostSummaryColumns selects with alias hs.
const JobHostSummaryColumns = `hs.id, hs.created, hs.modified, hs.host_name, hs.changed, hs.dark, hs.failures, hs.ok, hs.processed, hs.skipped, hs.failed, hs.host_id, hs.job_id, hs.ignored, hs.rescued, hs.constructed_host_id`

// ScanJobHostSummary reads a row produced with JobHostSummaryColumns.
func ScanJobHostSummary(r pgx.Row) (*JobHostSummary, error) {
	s := &JobHostSummary{}
	err := r.Scan(&s.ID, &s.Created, &s.Modified, &s.HostName, &s.Changed, &s.Dark, &s.Failures, &s.OK, &s.Processed, &s.Skipped, &s.Failed, &s.HostID, &s.JobID, &s.Ignored, &s.Rescued, &s.ConstructedHostID)
	if err != nil {
		return nil, err
	}
	return s, nil
}

// InstanceGroupBrief is the {id, name, is_container_group} block.
type InstanceGroupBrief struct {
	ID               int64
	Name             string
	IsContainerGroup bool
}

// LoadInstanceGroupBriefs returns briefs for ids.
func LoadInstanceGroupBriefs(ctx context.Context, q db.Querier, ids []int64) (map[int64]InstanceGroupBrief, error) {
	out := map[int64]InstanceGroupBrief{}
	if len(ids) == 0 {
		return out, nil
	}
	rows, err := q.Query(ctx, `SELECT id, name, is_container_group FROM main_instancegroup WHERE id = ANY($1)`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var b InstanceGroupBrief
		if err := rows.Scan(&b.ID, &b.Name, &b.IsContainerGroup); err != nil {
			return nil, err
		}
		out[b.ID] = b
	}
	return out, rows.Err()
}

// PreferredInstanceGroups computes the instance groups a job of a template
// may run on, as Job.preferred_instance_groups did: the template's groups,
// then the inventory's, then the organization's, stopping where fallback is
// prevented; the global groups (GlobalInstanceGroupNames) when none are
// configured.
func PreferredInstanceGroups(ctx context.Context, q db.Querier, templateID, inventoryID, organizationID *int64, global []string) ([]int64, error) {
	var selected []int64
	type level struct {
		sql      string
		id       *int64
		fallback string
	}
	levels := []level{
		{`SELECT instancegroup_id FROM main_unifiedjobtemplateinstancegroupmembership WHERE unifiedjobtemplate_id = $1 ORDER BY position, id`, templateID, `SELECT prevent_instance_group_fallback FROM main_jobtemplate WHERE unifiedjobtemplate_ptr_id = $1`},
		{`SELECT instancegroup_id FROM main_inventoryinstancegroupmembership WHERE inventory_id = $1 ORDER BY position, id`, inventoryID, `SELECT prevent_instance_group_fallback FROM main_inventory WHERE id = $1`},
		{`SELECT instancegroup_id FROM main_organizationinstancegroupmembership WHERE organization_id = $1 ORDER BY position, id`, organizationID, ``},
	}
	for _, l := range levels {
		if l.id == nil {
			continue
		}
		ids, err := scanIDs(ctx, q, l.sql, *l.id)
		if err != nil {
			return nil, err
		}
		selected = append(selected, ids...)
		if l.fallback != "" {
			var prevent bool
			if err := q.QueryRow(ctx, l.fallback, *l.id).Scan(&prevent); err == nil && prevent {
				break
			}
		}
	}
	if len(selected) > 0 {
		return selected, nil
	}
	rows, err := q.Query(ctx, `SELECT id, name FROM main_instancegroup WHERE name = ANY($1) ORDER BY array_position($1, name)`, global)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []int64
	for rows.Next() {
		var id int64
		var name string
		if err := rows.Scan(&id, &name); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}

// DefaultExecutionQueue and DefaultControlPlaneQueue are the defaults of
// DEFAULT_EXECUTION_QUEUE_NAME and DEFAULT_CONTROL_PLANE_QUEUE_NAME.
const (
	DefaultExecutionQueue    = "default"
	DefaultControlPlaneQueue = "controlplane"
)

// QueueNames are DEFAULT_EXECUTION_QUEUE_NAME and
// DEFAULT_CONTROL_PLANE_QUEUE_NAME as set, their defaults when empty.
func QueueNames(execQueue, controlQueue string) (string, string) {
	if execQueue == "" {
		execQueue = DefaultExecutionQueue
	}
	if controlQueue == "" {
		controlQueue = DefaultControlPlaneQueue
	}
	return execQueue, controlQueue
}

// GlobalInstanceGroupNames is UnifiedJob.global_instance_groups: the
// execution queue, then (outside Kubernetes) the control plane queue.
func GlobalInstanceGroupNames(execQueue, controlQueue string, isK8s bool) []string {
	execQueue, controlQueue = QueueNames(execQueue, controlQueue)
	if isK8s {
		return []string{execQueue}
	}
	return []string{execQueue, controlQueue}
}

// JobTaskImpact reproduces Job._get_task_impact.
func JobTaskImpact(launchType string, hostCount *int64, forks, sliceCount, sliceNumber, pinned int64) int64 {
	var count int64
	effectiveForks := forks
	if effectiveForks == 0 {
		effectiveForks = 5
	}
	switch {
	case launchType == "callback":
		count = 2
	case hostCount != nil:
		count = *hostCount
		if sliceCount > 1 {
			count = count - pinned
			if count < 0 {
				count = 0
			}
			count = (count + sliceCount - sliceNumber) / sliceCount
			count += pinned
		}
	default:
		count = effectiveForks
	}
	if count > effectiveForks {
		count = effectiveForks
	}
	return count + 1
}

// WorkflowJob is a main_workflowjob row with its unified job parent, read
// for the lists and for the sliced and federated launches.
type WorkflowJob struct {
	UnifiedJob
	ExtraVars                        string
	WorkflowJobTemplateID            *int64
	AllowSimultaneous                bool
	IsSlicedJob                      bool
	JobTemplateID                    *int64
	InventoryID                      *int64
	WebhookCredentialID              *int64
	WebhookGUID                      string
	WebhookService                   string
	IsBulkJob                        bool
	CharPrompts                      json.RawMessage
	SurveyPasswords                  json.RawMessage
	AllowOverwriteFlowVarsOnRelaunch bool
	AllowForceNodeSuccessOnRelaunch  bool
}

// WorkflowJobColumns selects with aliases uj and wj.
const WorkflowJobColumns = UnifiedJobColumns + `, wj.extra_vars, wj.workflow_job_template_id, wj.allow_simultaneous, wj.is_sliced_job, wj.job_template_id, wj.inventory_id,
	wj.webhook_credential_id, wj.webhook_guid, wj.webhook_service, wj.is_bulk_job, wj.char_prompts, wj.survey_passwords, wj.allow_overwrite_flow_vars_on_relaunch, wj.allow_force_node_success_on_relaunch`

// WorkflowJobFrom is the FROM clause matching WorkflowJobColumns.
const WorkflowJobFrom = `main_workflowjob wj JOIN main_unifiedjob uj ON uj.id = wj.unifiedjob_ptr_id`

// ScanWorkflowJob reads a row produced with WorkflowJobColumns.
func ScanWorkflowJob(r pgx.Row) (*WorkflowJob, error) {
	w := &WorkflowJob{}
	j := &w.UnifiedJob
	err := r.Scan(&j.ID, &j.Created, &j.Modified, &j.Name, &j.Description, &j.LaunchType, &j.CancelFlag, &j.Status, &j.Failed, &j.Started, &j.Finished, &j.Elapsed,
		&j.JobArgs, &j.JobCwd, &j.JobExplanation, &j.StartArgs, &j.ResultTraceback, &j.CeleryTaskID,
		&j.CreatedByID, &j.ModifiedByID, &j.PolymorphicCtypeID, &j.ScheduleID, &j.UnifiedJobTemplateID, &j.ExecutionNode, &j.InstanceGroupID,
		&j.EmittedEvents, &j.ControllerNode, &j.CanceledOn, &j.DependenciesProcessed, &j.OrganizationID, &j.ExecutionEnvironmentID,
		&j.InstalledCollections, &j.AnsibleVersion, &j.WorkUnitID, &j.HostStatusCounts, &j.TaskImpact, &j.JobEnv,
		&w.ExtraVars, &w.WorkflowJobTemplateID, &w.AllowSimultaneous, &w.IsSlicedJob, &w.JobTemplateID, &w.InventoryID,
		&w.WebhookCredentialID, &w.WebhookGUID, &w.WebhookService, &w.IsBulkJob, &w.CharPrompts, &w.SurveyPasswords, &w.AllowOverwriteFlowVarsOnRelaunch, &w.AllowForceNodeSuccessOnRelaunch)
	if err != nil {
		return nil, err
	}
	return w, nil
}

// GetWorkflowJob loads one workflow job.
func GetWorkflowJob(ctx context.Context, q db.Querier, id int64) (*WorkflowJob, error) {
	return ScanWorkflowJob(q.QueryRow(ctx, `SELECT `+WorkflowJobColumns+` FROM `+WorkflowJobFrom+` WHERE uj.id = $1`, id))
}

// CharPromptsMap decodes the saved prompts.
func (w *WorkflowJob) CharPromptsMap() map[string]any {
	m := map[string]any{}
	if len(w.CharPrompts) > 0 {
		_ = json.Unmarshal(w.CharPrompts, &m)
	}
	if m == nil {
		m = map[string]any{}
	}
	return m
}

// InsertWorkflowJob writes a workflow job spawned by a sliced or federated
// job template, with one node per slice or source inventory.
func InsertWorkflowJob(ctx context.Context, tx pgx.Tx, w *WorkflowJob, cts *ContentTypes, nodes []map[string]any, credentials, labels []int64, cfg *JobPrompts, cfgCredentials, cfgLabels []int64) error {
	if w.Status == "" {
		w.Status = "new"
	}
	if len(w.CharPrompts) == 0 {
		w.CharPrompts = json.RawMessage("{}")
	}
	if len(w.SurveyPasswords) == 0 {
		w.SurveyPasswords = json.RawMessage("{}")
	}
	err := tx.QueryRow(ctx, `INSERT INTO main_unifiedjob (created, modified, description, name, old_pk, launch_type, cancel_flag, status, failed, started, finished, elapsed,
		job_args, job_cwd, job_explanation, start_args, result_stdout_text, result_traceback, celery_task_id, created_by_id, modified_by_id, polymorphic_ctype_id, schedule_id,
		unified_job_template_id, execution_node, instance_group_id, emitted_events, controller_node, canceled_on, dependencies_processed, organization_id, execution_environment_id,
		installed_collections, ansible_version, work_unit_id, host_status_counts, preferred_instance_groups_cache, task_impact, job_env)
		VALUES (now(), now(), $1, $2, NULL, $3, false, $4, false, NULL, NULL, 0, '', '', '', $5, '', '', '', $6, $7, $8, $9,
		$10, '', NULL, 0, '', NULL, true, $11, NULL, '{}'::jsonb, '', NULL, NULL, '[]'::jsonb, 0, '{}'::jsonb) RETURNING id, created, modified`,
		w.Description, w.Name, w.LaunchType, w.Status, w.StartArgs, w.CreatedByID, w.ModifiedByID, cts.ID("main.workflowjob"), w.ScheduleID,
		w.UnifiedJobTemplateID, w.OrganizationID).Scan(&w.ID, &w.Created, &w.Modified)
	if err != nil {
		return err
	}
	extlog.Default().LogLifecycle(ctx, extlog.Lifecycle{Type: "workflowjob", TaskID: w.ID, State: "created", TaskName: w.Name, OrganizationID: w.OrganizationID})
	w.PolymorphicCtypeID = cts.ID("main.workflowjob")
	_, err = tx.Exec(ctx, `INSERT INTO main_workflowjob (unifiedjob_ptr_id, extra_vars, workflow_job_template_id, allow_simultaneous, is_sliced_job, job_template_id, inventory_id,
		webhook_credential_id, webhook_guid, webhook_service, is_bulk_job, char_prompts, survey_passwords, allow_overwrite_flow_vars_on_relaunch, allow_force_node_success_on_relaunch)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, false, $11::jsonb, $12::jsonb, $13, $14)`,
		w.ID, w.ExtraVars, w.WorkflowJobTemplateID, w.AllowSimultaneous, w.IsSlicedJob, w.JobTemplateID, w.InventoryID,
		w.WebhookCredentialID, w.WebhookGUID, w.WebhookService, string(w.CharPrompts), string(w.SurveyPasswords), w.AllowOverwriteFlowVarsOnRelaunch, w.AllowForceNodeSuccessOnRelaunch)
	if err != nil {
		return err
	}
	for _, c := range credentials {
		if _, err := tx.Exec(ctx, `INSERT INTO main_unifiedjob_credentials (unifiedjob_id, credential_id) VALUES ($1, $2)`, w.ID, c); err != nil {
			return err
		}
	}
	for _, l := range labels {
		if _, err := tx.Exec(ctx, `INSERT INTO main_unifiedjob_labels (unifiedjob_id, label_id) VALUES ($1, $2)`, w.ID, l); err != nil {
			return err
		}
	}
	for _, artifacts := range nodes {
		b, _ := json.Marshal(artifacts)
		if _, err := tx.Exec(ctx, `INSERT INTO main_workflowjobnode (created, modified, job_id, unified_job_template_id, workflow_job_id, inventory_id, ancestor_artifacts, extra_data, do_not_run,
			all_parents_must_converge, identifier, execution_environment_id, char_prompts, survey_passwords, prior_run_elapsed, prior_run_succeeded, max_retries, retry_attempts, forced_success, forced_success_by_id, forced_success_job_id, forced_success_reason)
			VALUES (now(), now(), NULL, $1, $2, NULL, $3, '{}', false, false, gen_random_uuid()::text, NULL, '{}'::jsonb, '{}'::jsonb, NULL, false, 0, 0, false, NULL, NULL, '')`,
			w.UnifiedJobTemplateID, w.ID, string(b)); err != nil {
			return err
		}
	}
	if cfg != nil {
		if err := InsertLaunchConfig(ctx, tx, w.ID, cfg, cfgCredentials, cfgLabels); err != nil {
			return err
		}
	}
	if w.UnifiedJobTemplateID != nil && ActiveStatuses[w.Status] && w.Status != "new" {
		if _, err := tx.Exec(ctx, `UPDATE main_unifiedjobtemplate SET current_job_id = $2, status = $3, modified = now() WHERE id = $1`, *w.UnifiedJobTemplateID, w.ID, w.Status); err != nil {
			return err
		}
	}
	return nil
}

// WorkflowJobIDForJob maps jobs spawned by workflows to their workflow job,
// through the node that ran them.
func WorkflowJobIDForJob(ctx context.Context, q db.Querier, ids []int64) (map[int64]int64, error) {
	out := map[int64]int64{}
	if len(ids) == 0 {
		return out, nil
	}
	rows, err := q.Query(ctx, `SELECT job_id, workflow_job_id FROM main_workflowjobnode WHERE job_id = ANY($1)`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var j, w int64
		if err := rows.Scan(&j, &w); err != nil {
			return nil, err
		}
		out[j] = w
	}
	return out, rows.Err()
}

// UnifiedJobBrief is the job block of summary_fields (source_workflow_job,
// job of an event) and the launched_by data.
type UnifiedJobBrief struct {
	ID          int64
	Name        string
	Description string
	Status      string
	Failed      bool
	Started     *time.Time
	Finished    *time.Time
	Elapsed     float64
	CanceledOn  *time.Time
	LaunchType  string
	CreatedByID *int64
	ScheduleID  *int64
	TemplateID  *int64
	Type        string
}

// LoadUnifiedJobBriefs returns briefs for unified job ids.
func LoadUnifiedJobBriefs(ctx context.Context, q db.Querier, cts *ContentTypes, ids []int64) (map[int64]UnifiedJobBrief, error) {
	out := map[int64]UnifiedJobBrief{}
	if len(ids) == 0 {
		return out, nil
	}
	rows, err := q.Query(ctx, `SELECT id, name, description, status, failed, started, finished, elapsed, canceled_on, launch_type, created_by_id, schedule_id, unified_job_template_id, polymorphic_ctype_id FROM main_unifiedjob WHERE id = ANY($1)`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var b UnifiedJobBrief
		var ct int64
		if err := rows.Scan(&b.ID, &b.Name, &b.Description, &b.Status, &b.Failed, &b.Started, &b.Finished, &b.Elapsed, &b.CanceledOn, &b.LaunchType, &b.CreatedByID, &b.ScheduleID, &b.TemplateID, &ct); err != nil {
			return nil, err
		}
		b.Type = JobTypeForContentType(cts, ct)
		out[b.ID] = b
	}
	return out, rows.Err()
}

// AncestorJobID walks up the workflow that spawned a job, as ancestor_job
// did, returning the job itself when it was not spawned by a workflow.
func AncestorJobID(ctx context.Context, q db.Querier, id int64, launchType string) (int64, error) {
	if launchType != "workflow" {
		return id, nil
	}
	m, err := AncestorJobIDs(ctx, q, []int64{id})
	if err != nil {
		return 0, err
	}
	if a, ok := m[id]; ok {
		return a, nil
	}
	return id, nil
}

// AncestorJobIDs resolves the ancestor of each job in one statement: up
// through the workflow node that spawned it while the job was launched by a
// workflow, at most 20 levels, as ancestor_job did.
func AncestorJobIDs(ctx context.Context, q db.Querier, ids []int64) (map[int64]int64, error) {
	out := map[int64]int64{}
	if len(ids) == 0 {
		return out, nil
	}
	rows, err := q.Query(ctx, `WITH RECURSIVE up (start, cur, lt, depth) AS (
			SELECT u.id, u.id, u.launch_type, 0 FROM main_unifiedjob u WHERE u.id = ANY($1)
			UNION ALL
			SELECT up.start, p.id, p.launch_type, up.depth + 1 FROM up
			JOIN LATERAL (SELECT n.workflow_job_id FROM main_workflowjobnode n WHERE n.job_id = up.cur AND n.workflow_job_id IS NOT NULL LIMIT 1) n ON true
			JOIN main_unifiedjob p ON p.id = n.workflow_job_id
			WHERE up.lt = 'workflow' AND up.depth < 20
		) SELECT DISTINCT ON (start) start, cur FROM up ORDER BY start, depth DESC`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var start, cur int64
		if err := rows.Scan(&start, &cur); err != nil {
			return nil, err
		}
		out[start] = cur
	}
	return out, rows.Err()
}

// JobsInventoryHostCount returns an inventory's total_hosts.
func InventoryHostCount(ctx context.Context, q db.Querier, inventoryID int64) (int64, error) {
	var n int64
	err := q.QueryRow(ctx, `SELECT count(*) FROM main_host WHERE inventory_id = $1`, inventoryID).Scan(&n)
	return n, err
}
