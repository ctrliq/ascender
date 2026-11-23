package models

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/extlog"
)

// UnifiedJob is a main_unifiedjob row: the parent of every job type.
type UnifiedJob struct {
	ID                     int64
	Created                time.Time
	Modified               time.Time
	Name                   string
	Description            string
	LaunchType             string
	CancelFlag             bool
	Status                 string
	Failed                 bool
	Started                *time.Time
	Finished               *time.Time
	Elapsed                float64
	JobArgs                string
	JobCwd                 string
	JobExplanation         string
	StartArgs              string
	ResultTraceback        string
	CeleryTaskID           string
	CreatedByID            *int64
	ModifiedByID           *int64
	PolymorphicCtypeID     int64
	ScheduleID             *int64
	UnifiedJobTemplateID   *int64
	ExecutionNode          string
	InstanceGroupID        *int64
	EmittedEvents          int64
	ControllerNode         string
	CanceledOn             *time.Time
	DependenciesProcessed  bool
	OrganizationID         *int64
	ExecutionEnvironmentID *int64
	InstalledCollections   json.RawMessage
	AnsibleVersion         string
	WorkUnitID             string
	HostStatusCounts       json.RawMessage
	TaskImpact             int64
	JobEnv                 json.RawMessage
	// PreferredInstanceGroups is the preferred_instance_groups_cache written
	// when a job is created; it is not read back.
	PreferredInstanceGroups []int64
}

// ActiveStatuses are the states of a job that has not finished.
var ActiveStatuses = map[string]bool{"new": true, "pending": true, "waiting": true, "running": true}

// UnifiedJobColumns selects with alias "uj".
const UnifiedJobColumns = `uj.id, uj.created, uj.modified, uj.name, uj.description, uj.launch_type, uj.cancel_flag, uj.status, uj.failed, uj.started, uj.finished, uj.elapsed,
	COALESCE(uj.job_args, ''), COALESCE(uj.job_cwd, ''), COALESCE(uj.job_explanation, ''), COALESCE(uj.start_args, ''), COALESCE(uj.result_traceback, ''), COALESCE(uj.celery_task_id, ''),
	uj.created_by_id, uj.modified_by_id, uj.polymorphic_ctype_id, uj.schedule_id, uj.unified_job_template_id, COALESCE(uj.execution_node, ''), uj.instance_group_id,
	COALESCE(uj.emitted_events, 0), COALESCE(uj.controller_node, ''), uj.canceled_on, uj.dependencies_processed, uj.organization_id, uj.execution_environment_id,
	uj.installed_collections, COALESCE(uj.ansible_version, ''), COALESCE(uj.work_unit_id, ''), uj.host_status_counts, COALESCE(uj.task_impact, 0), uj.job_env`

// ScanUnifiedJob reads a row produced with UnifiedJobColumns.
func ScanUnifiedJob(r pgx.Row) (*UnifiedJob, error) {
	j := &UnifiedJob{}
	err := r.Scan(&j.ID, &j.Created, &j.Modified, &j.Name, &j.Description, &j.LaunchType, &j.CancelFlag, &j.Status, &j.Failed, &j.Started, &j.Finished, &j.Elapsed,
		&j.JobArgs, &j.JobCwd, &j.JobExplanation, &j.StartArgs, &j.ResultTraceback, &j.CeleryTaskID,
		&j.CreatedByID, &j.ModifiedByID, &j.PolymorphicCtypeID, &j.ScheduleID, &j.UnifiedJobTemplateID, &j.ExecutionNode, &j.InstanceGroupID,
		&j.EmittedEvents, &j.ControllerNode, &j.CanceledOn, &j.DependenciesProcessed, &j.OrganizationID, &j.ExecutionEnvironmentID,
		&j.InstalledCollections, &j.AnsibleVersion, &j.WorkUnitID, &j.HostStatusCounts, &j.TaskImpact, &j.JobEnv)
	if err != nil {
		return nil, err
	}
	return j, nil
}

// ProjectUpdate is a main_projectupdate row with its unified job parent.
type ProjectUpdate struct {
	UnifiedJob
	LocalPath          string
	SCMType            string
	SCMURL             string
	SCMBranch          string
	SCMClean           bool
	SCMDeleteOnUpdate  bool
	CredentialID       *int64
	ProjectID          *int64
	Timeout            int64
	JobType            string
	SCMRefspec         string
	SCMRevision        string
	JobTags            string
	SCMTrackSubmodules bool
	WebhookGUID        string
	WebhookService     string
}

// ProjectUpdateColumns selects with aliases uj and pu.
const ProjectUpdateColumns = UnifiedJobColumns + `, pu.local_path, pu.scm_type, pu.scm_url, pu.scm_branch, pu.scm_clean, pu.scm_delete_on_update, pu.credential_id, pu.project_id,
	pu.timeout, pu.job_type, pu.scm_refspec, pu.scm_revision, pu.job_tags, pu.scm_track_submodules, pu.webhook_guid, pu.webhook_service`

// ProjectUpdateFrom is the FROM clause matching ProjectUpdateColumns.
const ProjectUpdateFrom = `main_projectupdate pu JOIN main_unifiedjob uj ON uj.id = pu.unifiedjob_ptr_id`

// ScanProjectUpdate reads a row produced with ProjectUpdateColumns.
func ScanProjectUpdate(r pgx.Row) (*ProjectUpdate, error) {
	p := &ProjectUpdate{}
	j := &p.UnifiedJob
	err := r.Scan(&j.ID, &j.Created, &j.Modified, &j.Name, &j.Description, &j.LaunchType, &j.CancelFlag, &j.Status, &j.Failed, &j.Started, &j.Finished, &j.Elapsed,
		&j.JobArgs, &j.JobCwd, &j.JobExplanation, &j.StartArgs, &j.ResultTraceback, &j.CeleryTaskID,
		&j.CreatedByID, &j.ModifiedByID, &j.PolymorphicCtypeID, &j.ScheduleID, &j.UnifiedJobTemplateID, &j.ExecutionNode, &j.InstanceGroupID,
		&j.EmittedEvents, &j.ControllerNode, &j.CanceledOn, &j.DependenciesProcessed, &j.OrganizationID, &j.ExecutionEnvironmentID,
		&j.InstalledCollections, &j.AnsibleVersion, &j.WorkUnitID, &j.HostStatusCounts, &j.TaskImpact, &j.JobEnv,
		&p.LocalPath, &p.SCMType, &p.SCMURL, &p.SCMBranch, &p.SCMClean, &p.SCMDeleteOnUpdate, &p.CredentialID, &p.ProjectID,
		&p.Timeout, &p.JobType, &p.SCMRefspec, &p.SCMRevision, &p.JobTags, &p.SCMTrackSubmodules, &p.WebhookGUID, &p.WebhookService)
	if err != nil {
		return nil, err
	}
	return p, nil
}

// GetProjectUpdate loads one project update.
func GetProjectUpdate(ctx context.Context, q db.Querier, id int64) (*ProjectUpdate, error) {
	return ScanProjectUpdate(q.QueryRow(ctx, `SELECT `+ProjectUpdateColumns+` FROM `+ProjectUpdateFrom+` WHERE uj.id = $1`, id))
}

// NewProjectUpdate builds the pending update for a project, copying the
// SCM options the way the old create_unified_job did.
// NewProjectUpdate is create_project_update: the update has no execution
// environment until it runs (project updates use the control plane's).
func NewProjectUpdate(p *Project, launchType string, userID *int64, jobType string) *ProjectUpdate {
	tags := "update_" + p.SCMType + ",install_roles,install_collections"
	if p.SignatureValidationCredentialID != nil {
		tags += ",validation_checksum_manifest"
	}
	if p.SCMDeleteOnUpdate && jobType == "check" {
		tags += ",delete"
	}
	pu := &ProjectUpdate{
		LocalPath: p.LocalPath, SCMType: p.SCMType, SCMURL: p.SCMURL, SCMBranch: p.SCMBranch, SCMClean: p.SCMClean,
		SCMDeleteOnUpdate: p.SCMDeleteOnUpdate, CredentialID: p.CredentialID, ProjectID: &p.ID, Timeout: p.Timeout,
		JobType: jobType, SCMRefspec: p.SCMRefspec, JobTags: tags, SCMTrackSubmodules: p.SCMTrackSubmodules,
	}
	pu.Name = p.Name
	pu.Description = p.Description
	pu.LaunchType = launchType
	pu.Status = "pending"
	pu.CreatedByID = userID
	pu.UnifiedJobTemplateID = &p.ID
	pu.OrganizationID = p.OrganizationID
	return pu
}

// ProjectUpdateTaskImpact is ProjectUpdate._get_task_impact: a check
// update takes one unit of capacity; a run update, the sync inside a job's
// own run, takes none, as the job holds the capacity.
func ProjectUpdateTaskImpact(jobType string) int {
	if jobType == "run" {
		return 0
	}
	return 1
}

// InsertProjectUpdate writes the pending job and marks the project as
// updating (current_job).
func InsertProjectUpdate(ctx context.Context, tx pgx.Tx, pu *ProjectUpdate, cts *ContentTypes) error {
	// The signature check is tagged by the validation credential's type
	// (validation_<namespace>, which a custom type without one printed as
	// validation_None), ahead of the checksum manifest check.
	if pu.ProjectID != nil && strings.Contains(","+pu.JobTags+",", ",validation_checksum_manifest,") {
		var ns *string
		if err := tx.QueryRow(ctx, `SELECT ct.namespace FROM main_project p JOIN main_credential c ON c.id = p.signature_validation_credential_id
			JOIN main_credentialtype ct ON ct.id = c.credential_type_id WHERE p.unifiedjobtemplate_ptr_id = $1`, *pu.ProjectID).Scan(&ns); err == nil {
			name := "None"
			if ns != nil {
				name = *ns
			}
			if !strings.Contains(","+pu.JobTags+",", ",validation_"+name+",") {
				pu.JobTags = strings.Replace(pu.JobTags, ",validation_checksum_manifest", ",validation_"+name+",validation_checksum_manifest", 1)
			}
		}
	}
	err := tx.QueryRow(ctx, `INSERT INTO main_unifiedjob (created, modified, description, name, old_pk, launch_type, cancel_flag, status, failed, started, finished, elapsed,
		job_args, job_cwd, job_explanation, start_args, result_stdout_text, result_traceback, celery_task_id, created_by_id, modified_by_id, polymorphic_ctype_id, schedule_id,
		unified_job_template_id, execution_node, instance_group_id, emitted_events, controller_node, canceled_on, dependencies_processed, organization_id, execution_environment_id,
		installed_collections, ansible_version, work_unit_id, host_status_counts, preferred_instance_groups_cache, task_impact, job_env)
		VALUES (now(), now(), $1, $2, NULL, $3, false, 'pending', false, NULL, NULL, 0, '', '', '', '', '', '', '', $4, $5, $6, $10,
		$7, '', NULL, 0, '', NULL, false, $8, $9, '{}'::jsonb, '', '', NULL, NULL, $11, '{}'::jsonb) RETURNING id, created, modified`,
		pu.Description, pu.Name, pu.LaunchType, pu.CreatedByID, pu.ModifiedByID, cts.ID("main.projectupdate"),
		pu.UnifiedJobTemplateID, pu.OrganizationID, pu.ExecutionEnvironmentID, pu.ScheduleID, ProjectUpdateTaskImpact(pu.JobType)).Scan(&pu.ID, &pu.Created, &pu.Modified)
	if err != nil {
		return err
	}
	extlog.Default().LogLifecycle(ctx, extlog.Lifecycle{Type: "projectupdate", TaskID: pu.ID, State: "created", TaskName: pu.Name, OrganizationID: pu.OrganizationID})
	pu.PolymorphicCtypeID = cts.ID("main.projectupdate")
	_, err = tx.Exec(ctx, `INSERT INTO main_projectupdate (unifiedjob_ptr_id, local_path, scm_type, scm_url, scm_branch, scm_clean, scm_delete_on_update, credential_id, project_id,
		timeout, job_type, scm_refspec, scm_revision, job_tags, scm_track_submodules, webhook_guid, webhook_service)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $17, $13, $14, $15, $16)`,
		pu.ID, pu.LocalPath, pu.SCMType, pu.SCMURL, pu.SCMBranch, pu.SCMClean, pu.SCMDeleteOnUpdate, pu.CredentialID, pu.ProjectID,
		pu.Timeout, pu.JobType, pu.SCMRefspec, pu.JobTags, pu.SCMTrackSubmodules, pu.WebhookGUID, pu.WebhookService, pu.SCMRevision)
	if err != nil {
		return err
	}
	// The template shows the job as current while it is active.
	_, err = tx.Exec(ctx, `UPDATE main_unifiedjobtemplate SET current_job_id = $2, status = 'pending', modified = now() WHERE id = $1`, pu.UnifiedJobTemplateID, pu.ID)
	return err
}

// EnsureEventPartition creates the hourly partition of an event table that
// covers t, as the old create_partition did before a job emitted events.
func EnsureEventPartition(ctx context.Context, q db.Querier, table string, t time.Time) error {
	start := t.UTC().Truncate(time.Hour)
	end := start.Add(time.Hour)
	name := fmt.Sprintf("%s_%s", table, start.Format("20060102_15"))
	_, err := q.Exec(ctx, fmt.Sprintf(`CREATE TABLE IF NOT EXISTS %s PARTITION OF %s FOR VALUES FROM ('%s') TO ('%s')`,
		name, table, start.Format("2006-01-02 15:04:05+00"), end.Format("2006-01-02 15:04:05+00")))
	// Two jobs starting in the same hour race to create the partition; the
	// loser gets duplicate_table despite IF NOT EXISTS, and the table exists.
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "42P07" {
		return nil
	}
	return err
}

// JobEvent is one row of an event table; the job column differs per table.
type JobEvent struct {
	ID        int64
	Created   time.Time
	Modified  time.Time
	Event     string
	EventData map[string]any
	// EventDataText is event_data as stored, which the API renders in its
	// own key order.
	EventDataText string
	Failed        bool
	Changed       bool
	UUID          string
	Playbook      string
	Play          string
	Role          string
	Task          string
	Counter       int64
	Stdout        string
	Verbosity     int64
	StartLine     int64
	EndLine       int64
	JobID         int64
	JobCreated    time.Time
	// Job-table only columns.
	HostID     *int64
	HostName   string
	ParentUUID string
}
