package api

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/ctrliq/ascender/internal/models"
)

// inventoryJobsCond selects, from main_unifiedjob, Inventory._get_related_jobs
// of the inventory in $1: its jobs, inventory updates and ad hoc commands.
const inventoryJobsCond = `id IN (SELECT unifiedjob_ptr_id FROM main_job WHERE inventory_id = $1
	UNION ALL SELECT unifiedjob_ptr_id FROM main_inventoryupdate WHERE inventory_id = $1
	UNION ALL SELECT unifiedjob_ptr_id FROM main_adhoccommand WHERE inventory_id = $1)`

// The _get_related_jobs of the other models whose detail views used
// RelatedJobsPreventDeleteMixin, each over the object in $1.
const (
	// Project: its jobs and project updates.
	projectJobsCond = `id IN (SELECT unifiedjob_ptr_id FROM main_job WHERE project_id = $1
	UNION ALL SELECT unifiedjob_ptr_id FROM main_projectupdate WHERE project_id = $1)`
	// Organization: the unified jobs that name it.
	organizationJobsCond = `organization_id = $1`
	// JobTemplate and WorkflowApprovalTemplate: the jobs made from them.
	templateJobsCond = `unified_job_template_id = $1`
	// WorkflowJobTemplate: its workflow jobs.
	workflowTemplateJobsCond = `id IN (SELECT unifiedjob_ptr_id FROM main_workflowjob WHERE workflow_job_template_id = $1)`
	// InventorySource: its inventory updates.
	inventorySourceJobsCond = `id IN (SELECT unifiedjob_ptr_id FROM main_inventoryupdate WHERE inventory_source_id = $1)`
	// InstanceGroup: the unified jobs that ran (or will run) in it.
	instanceGroupJobsCond = `instance_group_id = $1`
)

// eventTables are the event table and its parent column of each kind of
// unified job that has events (get_event_queryset).
var eventTables = map[string][2]string{
	"main.job":             {"main_jobevent", "job_id"},
	"main.inventoryupdate": {"main_inventoryupdateevent", "inventory_update_id"},
	"main.adhoccommand":    {"main_adhoccommandevent", "ad_hoc_command_id"},
	"main.projectupdate":   {"main_projectupdateevent", "project_update_id"},
	"main.systemjob":       {"main_systemjobevent", "system_job_id"},
}

// checkRelatedActiveJobs is RelatedJobsPreventDeleteMixin.check_related_active_jobs
// over the unified jobs cond selects: a 409 listing the active ones, then
// a 403 for the first job that finished within the last minute and has
// not saved all of its events yet.
func (s *Server) checkRelatedActiveJobs(ctx context.Context, cond string, args ...any) error {
	active, err := s.activeJobsWhere(ctx, cond, args...)
	if err != nil {
		return err
	}
	if len(active) > 0 {
		return &APIError{Status: http.StatusConflict, Body: NewOMap().Set("error", "Resource is being used by running jobs.").Set("active_jobs", active)}
	}
	type recent struct {
		id, ct, emitted int64
		status          string
		created         time.Time
	}
	rows, err := s.Q().Query(ctx, `SELECT id, polymorphic_ctype_id, status, created, emitted_events FROM main_unifiedjob
		WHERE `+cond+` AND finished >= now() - interval '1 minute' ORDER BY id`, args...)
	if err != nil {
		return err
	}
	var jobs []recent
	for rows.Next() {
		var j recent
		if err := rows.Scan(&j.id, &j.ct, &j.status, &j.created, &j.emitted); err != nil {
			rows.Close()
			return err
		}
		jobs = append(jobs, j)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	for _, j := range jobs {
		// event_processing_finished: an active job never has (and was
		// refused above); a kind without events always has.
		finished := !models.ActiveStatuses[j.status]
		if t, ok := eventTables[s.CT.Model(j.ct)]; ok && finished {
			var n int64
			if err := s.Q().QueryRow(ctx, `SELECT count(*) FROM `+t[0]+` WHERE `+t[1]+` = $1 AND job_created = $2`, j.id, j.created).Scan(&n); err != nil {
				return err
			}
			finished = n == j.emitted
		}
		if !finished {
			// unified_job.log_format
			return Detail(http.StatusForbidden, fmt.Sprintf("Related job %s %d (%s) is still processing events.", models.JobTypeForContentType(s.CT, j.ct), j.id, j.status))
		}
	}
	return nil
}
