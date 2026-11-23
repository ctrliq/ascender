package models

import (
	"context"
	"encoding/json"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/extlog"
)

// InventoryUpdate is a main_inventoryupdate row with its unified job parent.
type InventoryUpdate struct {
	UnifiedJob
	Source                string
	SourcePath            string
	SourceVars            string
	Overwrite             bool
	OverwriteVars         bool
	LicenseError          bool
	InventorySourceID     *int64
	Timeout               int64
	SourceProjectUpdateID *int64
	Verbosity             int64
	InventoryID           *int64
	OrgHostLimitError     bool
	EnabledValue          string
	EnabledVar            string
	HostFilter            string
	SCMRevision           string
	SCMBranch             string
	Limit                 string
	// PreferredInstanceGroups is the cache the update is placed by.
	PreferredInstanceGroups []int64
}

// InventoryUpdatePreferredInstanceGroups is
// InventoryUpdate.preferred_instance_groups: the source's groups, the
// inventory's, then (unless the inventory prevents fallback) its
// organization's; the global groups when there are none.
func InventoryUpdatePreferredInstanceGroups(ctx context.Context, q db.Querier, sourceID, inventoryID *int64, global []string) ([]int64, error) {
	var selected []int64
	if sourceID != nil {
		ids, err := scanIDs(ctx, q, `SELECT instancegroup_id FROM main_unifiedjobtemplateinstancegroupmembership WHERE unifiedjobtemplate_id = $1 ORDER BY position, id`, *sourceID)
		if err != nil {
			return nil, err
		}
		selected = append(selected, ids...)
	}
	if inventoryID != nil {
		ids, err := scanIDs(ctx, q, `SELECT instancegroup_id FROM main_inventoryinstancegroupmembership WHERE inventory_id = $1 ORDER BY position, id`, *inventoryID)
		if err != nil {
			return nil, err
		}
		selected = append(selected, ids...)
		var prevent bool
		var org *int64
		if err := q.QueryRow(ctx, `SELECT prevent_instance_group_fallback, organization_id FROM main_inventory WHERE id = $1`, *inventoryID).Scan(&prevent, &org); err == nil && !prevent && org != nil {
			ids, err := scanIDs(ctx, q, `SELECT instancegroup_id FROM main_organizationinstancegroupmembership WHERE organization_id = $1 ORDER BY position, id`, *org)
			if err != nil {
				return nil, err
			}
			selected = append(selected, ids...)
		}
	}
	if len(selected) > 0 {
		return selected, nil
	}
	return PreferredInstanceGroups(ctx, q, nil, nil, nil, global)
}

// InventoryUpdateColumns selects with aliases uj and iu.
const InventoryUpdateColumns = UnifiedJobColumns + `, iu.source, iu.source_path, iu.source_vars, iu.overwrite, iu.overwrite_vars, iu.license_error, iu.inventory_source_id,
	iu.timeout, iu.source_project_update_id, iu.verbosity, iu.inventory_id, iu.org_host_limit_error, iu.enabled_value, iu.enabled_var, iu.host_filter,
	iu.scm_revision, iu.scm_branch, iu."limit"`

// InventoryUpdateFrom is the FROM clause matching InventoryUpdateColumns.
const InventoryUpdateFrom = `main_inventoryupdate iu JOIN main_unifiedjob uj ON uj.id = iu.unifiedjob_ptr_id`

// ScanInventoryUpdate reads a row produced with InventoryUpdateColumns.
func ScanInventoryUpdate(r pgx.Row) (*InventoryUpdate, error) {
	u := &InventoryUpdate{}
	j := &u.UnifiedJob
	err := r.Scan(&j.ID, &j.Created, &j.Modified, &j.Name, &j.Description, &j.LaunchType, &j.CancelFlag, &j.Status, &j.Failed, &j.Started, &j.Finished, &j.Elapsed,
		&j.JobArgs, &j.JobCwd, &j.JobExplanation, &j.StartArgs, &j.ResultTraceback, &j.CeleryTaskID,
		&j.CreatedByID, &j.ModifiedByID, &j.PolymorphicCtypeID, &j.ScheduleID, &j.UnifiedJobTemplateID, &j.ExecutionNode, &j.InstanceGroupID,
		&j.EmittedEvents, &j.ControllerNode, &j.CanceledOn, &j.DependenciesProcessed, &j.OrganizationID, &j.ExecutionEnvironmentID,
		&j.InstalledCollections, &j.AnsibleVersion, &j.WorkUnitID, &j.HostStatusCounts, &j.TaskImpact, &j.JobEnv,
		&u.Source, &u.SourcePath, &u.SourceVars, &u.Overwrite, &u.OverwriteVars, &u.LicenseError, &u.InventorySourceID,
		&u.Timeout, &u.SourceProjectUpdateID, &u.Verbosity, &u.InventoryID, &u.OrgHostLimitError, &u.EnabledValue, &u.EnabledVar, &u.HostFilter,
		&u.SCMRevision, &u.SCMBranch, &u.Limit)
	if err != nil {
		return nil, err
	}
	return u, nil
}

// GetInventoryUpdate loads one inventory update.
func GetInventoryUpdate(ctx context.Context, q db.Querier, id int64) (*InventoryUpdate, error) {
	return ScanInventoryUpdate(q.QueryRow(ctx, `SELECT `+InventoryUpdateColumns+` FROM `+InventoryUpdateFrom+` WHERE uj.id = $1`, id))
}

// NewInventoryUpdate builds the pending update of a source, copying the
// source options (_get_unified_job_field_names) and naming it
// "<inventory> - <source>" as InventorySource.create_unified_job did.
func NewInventoryUpdate(src *InventorySource, inventoryName, launchType string, userID *int64, resolvedEE *int64) *InventoryUpdate {
	u := &InventoryUpdate{
		Source: src.Source, SourcePath: src.SourcePath, SourceVars: src.SourceVars, Overwrite: src.Overwrite, OverwriteVars: src.OverwriteVars,
		InventorySourceID: &src.ID, Timeout: src.Timeout, Verbosity: src.Verbosity, InventoryID: src.InventoryID,
		EnabledValue: src.EnabledValue, EnabledVar: src.EnabledVar, HostFilter: src.HostFilter, SCMBranch: src.SCMBranch, Limit: src.Limit,
	}
	name := src.Name
	if src.InventoryID != nil {
		name = inventoryName + " - " + src.Name
	}
	if r := []rune(name); len(r) > 512 {
		name = string(r[:512])
	}
	u.Name = name
	u.Description = src.Description
	u.LaunchType = launchType
	u.Status = "pending"
	u.CreatedByID = userID
	u.UnifiedJobTemplateID = &src.ID
	u.OrganizationID = src.OrganizationID
	u.ExecutionEnvironmentID = resolvedEE
	return u
}

// InsertInventoryUpdate writes the pending update, copies the source's
// credentials and marks the source as updating (current_job).
func InsertInventoryUpdate(ctx context.Context, tx pgx.Tx, u *InventoryUpdate, cts *ContentTypes) error {
	err := tx.QueryRow(ctx, `INSERT INTO main_unifiedjob (created, modified, description, name, old_pk, launch_type, cancel_flag, status, failed, started, finished, elapsed,
		job_args, job_cwd, job_explanation, start_args, result_stdout_text, result_traceback, celery_task_id, created_by_id, modified_by_id, polymorphic_ctype_id, schedule_id,
		unified_job_template_id, execution_node, instance_group_id, emitted_events, controller_node, canceled_on, dependencies_processed, organization_id, execution_environment_id,
		installed_collections, ansible_version, work_unit_id, host_status_counts, preferred_instance_groups_cache, task_impact, job_env)
		VALUES (now(), now(), $1, $2, NULL, $3, false, 'pending', false, NULL, NULL, 0, '', '', '', '', '', '', '', $4, $5, $6, $10,
		$7, '', NULL, 0, '', NULL, false, $8, $9, '{}'::jsonb, '', '', NULL, $11::jsonb, 1, '{}'::jsonb) RETURNING id, created, modified`,
		u.Description, u.Name, u.LaunchType, u.CreatedByID, u.ModifiedByID, cts.ID("main.inventoryupdate"),
		u.UnifiedJobTemplateID, u.OrganizationID, u.ExecutionEnvironmentID, u.ScheduleID, preferredCache(u.PreferredInstanceGroups)).Scan(&u.ID, &u.Created, &u.Modified)
	if err != nil {
		return err
	}
	extlog.Default().LogLifecycle(ctx, extlog.Lifecycle{Type: "inventoryupdate", TaskID: u.ID, State: "created", TaskName: u.Name, OrganizationID: u.OrganizationID})
	u.PolymorphicCtypeID = cts.ID("main.inventoryupdate")
	_, err = tx.Exec(ctx, `INSERT INTO main_inventoryupdate (unifiedjob_ptr_id, source, source_path, source_vars, overwrite, overwrite_vars, license_error, inventory_source_id,
		timeout, source_project_update_id, verbosity, inventory_id, org_host_limit_error, enabled_value, enabled_var, host_filter, scm_revision, scm_branch, "limit")
		VALUES ($1, $2, $3, $4, $5, $6, false, $7, $8, NULL, $9, $10, false, $11, $12, $13, '', $14, $15)`,
		u.ID, u.Source, u.SourcePath, u.SourceVars, u.Overwrite, u.OverwriteVars, u.InventorySourceID,
		u.Timeout, u.Verbosity, u.InventoryID, u.EnabledValue, u.EnabledVar, u.HostFilter, u.SCMBranch, u.Limit)
	if err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO main_unifiedjob_credentials (unifiedjob_id, credential_id)
		SELECT $1, credential_id FROM main_unifiedjobtemplate_credentials WHERE unifiedjobtemplate_id = $2 ORDER BY id`, u.ID, u.UnifiedJobTemplateID); err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `UPDATE main_unifiedjobtemplate SET current_job_id = $2, status = 'pending', modified = now() WHERE id = $1`, u.UnifiedJobTemplateID, u.ID)
	return err
}

// preferredCache is the preferred_instance_groups_cache value: the ids, or
// null when they were not worked out.
func preferredCache(ids []int64) *string {
	if ids == nil {
		return nil
	}
	b, _ := json.Marshal(ids)
	v := string(b)
	return &v
}
