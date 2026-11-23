package models

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/db"
)

// AdHocCommand is main_adhoccommand with the unified job columns the
// runner and the API read.
type AdHocCommand struct {
	ID                     int64
	Created                time.Time
	Modified               time.Time
	Name                   string
	LaunchType             string
	Status                 string
	Failed                 bool
	CancelFlag             bool
	StartArgs              string
	CreatedByID            *int64
	ModifiedByID           *int64
	ExecutionEnvironmentID *int64
	OrganizationID         *int64
	TaskImpact             int64

	JobType       string
	InventoryID   *int64
	Limit         string
	CredentialID  *int64
	ModuleName    string
	ModuleArgs    string
	Forks         int64
	Verbosity     int64
	ExtraVars     string
	BecomeEnabled bool
	DiffMode      bool

	PreferredInstanceGroups []int64
}

const adHocColumns = `u.id, u.created, u.modified, u.name, u.launch_type, u.status, u.failed, u.cancel_flag, u.start_args, u.created_by_id, u.modified_by_id,
	u.execution_environment_id, u.organization_id, u.task_impact,
	a.job_type, a.inventory_id, a.limit, a.credential_id, a.module_name, a.module_args, a.forks, a.verbosity, a.extra_vars, a.become_enabled, a.diff_mode`

// GetAdHocCommand reads one ad hoc command.
func GetAdHocCommand(ctx context.Context, q db.Querier, id int64) (*AdHocCommand, error) {
	a := &AdHocCommand{}
	err := q.QueryRow(ctx, `SELECT `+adHocColumns+` FROM main_unifiedjob u JOIN main_adhoccommand a ON a.unifiedjob_ptr_id = u.id WHERE u.id = $1`, id).Scan(
		&a.ID, &a.Created, &a.Modified, &a.Name, &a.LaunchType, &a.Status, &a.Failed, &a.CancelFlag, &a.StartArgs, &a.CreatedByID, &a.ModifiedByID,
		&a.ExecutionEnvironmentID, &a.OrganizationID, &a.TaskImpact,
		&a.JobType, &a.InventoryID, &a.Limit, &a.CredentialID, &a.ModuleName, &a.ModuleArgs, &a.Forks, &a.Verbosity, &a.ExtraVars, &a.BecomeEnabled, &a.DiffMode)
	return a, err
}

// AdHocCommandName is the name save() gave a command: the module and its
// arguments joined, cut at 512 characters with an ellipsis.
func AdHocCommandName(module, args string) string {
	var parts []string
	for _, p := range []string{module, args} {
		if p != "" {
			parts = append(parts, p)
		}
	}
	name := strings.Join(parts, ": ")
	if r := []rune(name); len(r) > 512 {
		name = string(r[:511]) + "…"
	}
	return name
}

// InsertAdHocCommand creates a pending ad hoc command with its launch
// instance groups (in order) and start arguments.
func InsertAdHocCommand(ctx context.Context, tx pgx.Tx, a *AdHocCommand, cts *ContentTypes, instanceGroups []int64) error {
	ct := cts.ID("main.adhoccommand")
	if a.Name == "" {
		a.Name = AdHocCommandName(a.ModuleName, a.ModuleArgs)
	}
	if a.LaunchType == "" {
		a.LaunchType = "manual"
	}
	cache, _ := json.Marshal(a.PreferredInstanceGroups)
	if a.PreferredInstanceGroups == nil {
		cache = []byte("[]")
	}
	err := tx.QueryRow(ctx, `INSERT INTO main_unifiedjob (created, modified, description, name, old_pk, launch_type, cancel_flag, status, failed, started, finished, elapsed,
		job_args, job_cwd, job_explanation, start_args, result_stdout_text, result_traceback, celery_task_id, created_by_id, modified_by_id, polymorphic_ctype_id, schedule_id,
		unified_job_template_id, execution_node, instance_group_id, emitted_events, controller_node, canceled_on, dependencies_processed, organization_id, execution_environment_id,
		installed_collections, ansible_version, work_unit_id, host_status_counts, preferred_instance_groups_cache, task_impact, job_env)
		VALUES (now(), now(), '', $1, NULL, $2, false, 'pending', false, NULL, NULL, 0, '', '', '', '', '', '', '', $3, $4, $5, NULL,
		NULL, '', NULL, 0, '', NULL, false, $6, $7, '{}'::jsonb, '', '', NULL, $8::jsonb, $9, '{}'::jsonb) RETURNING id, created, modified`,
		a.Name, a.LaunchType, a.CreatedByID, a.ModifiedByID, ct, a.OrganizationID, a.ExecutionEnvironmentID, string(cache), a.TaskImpact).Scan(&a.ID, &a.Created, &a.Modified)
	if err != nil {
		return err
	}
	a.Status = "pending"
	if _, err := tx.Exec(ctx, `INSERT INTO main_adhoccommand (unifiedjob_ptr_id, job_type, inventory_id, "limit", credential_id, module_name, module_args, forks, verbosity, extra_vars, become_enabled, diff_mode)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
		a.ID, a.JobType, a.InventoryID, a.Limit, a.CredentialID, a.ModuleName, a.ModuleArgs, a.Forks, a.Verbosity, a.ExtraVars, a.BecomeEnabled, a.DiffMode); err != nil {
		return err
	}
	for i, ig := range instanceGroups {
		if _, err := tx.Exec(ctx, `INSERT INTO main_adhoccommandinstancegroupmembership (position, adhoccommand_id, instancegroup_id) VALUES ($1, $2, $3)`, i, a.ID, ig); err != nil {
			return err
		}
	}
	return nil
}

// AdHocTaskImpact is _get_task_impact: the hosts it may run at once, plus
// one for the control process.
func AdHocTaskImpact(totalHosts *int64, forks int64) int64 {
	n := int64(5)
	if totalHosts != nil {
		n = *totalHosts
	}
	f := forks
	if f == 0 {
		f = 5
	}
	if f < n {
		n = f
	}
	return n + 1
}
