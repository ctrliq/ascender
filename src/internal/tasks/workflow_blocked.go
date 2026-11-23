package tasks

import (
	"context"

	"github.com/ctrliq/ascender/internal/db"
)

// explainBlockedWorkflow is the task manager's explanation for a pending
// workflow job that startWorkflowJob left blocked (workflow_job_blocked_by):
// "waiting for <model_name>-<id> to finish", naming the oldest workflow job
// of its template or, for a sliced job, else the oldest job of its job
// template, once the workflow job is 30 seconds old and when it changed.
func explainBlockedWorkflow(ctx context.Context, q db.Querier, id, workflowJobType int64) error {
	_, err := q.Exec(ctx, `UPDATE main_unifiedjob t SET job_explanation = b.explanation
		FROM (SELECT 'waiting for ' || COALESCE(
			(SELECT 'workflowjob-' || o.id FROM main_unifiedjob o WHERE o.polymorphic_ctype_id = $2 AND o.unified_job_template_id = uj.unified_job_template_id
				AND o.status IN ('waiting', 'running') AND o.launch_type <> 'sync' ORDER BY o.created, o.id LIMIT 1),
			CASE WHEN w.workflow_job_template_id IS NULL THEN (SELECT 'job-' || o.id FROM main_job oj JOIN main_unifiedjob o ON o.id = oj.unifiedjob_ptr_id
				WHERE oj.job_template_id = uj.unified_job_template_id AND o.status IN ('waiting', 'running') AND o.launch_type <> 'sync' ORDER BY o.created, o.id LIMIT 1) END
			) || ' to finish' AS explanation
			FROM main_unifiedjob uj JOIN main_workflowjob w ON w.unifiedjob_ptr_id = uj.id
			WHERE uj.id = $1 AND NOT w.allow_simultaneous AND uj.unified_job_template_id IS NOT NULL) b
		WHERE t.id = $1 AND t.status = 'pending' AND t.created < now() - interval '30 seconds' AND b.explanation IS NOT NULL AND t.job_explanation <> b.explanation`, id, workflowJobType)
	return err
}
