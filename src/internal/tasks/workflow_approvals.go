package tasks

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/api"
	"github.com/ctrliq/ascender/internal/extlog"
	"github.com/ctrliq/ascender/internal/jinjarun"
	"github.com/ctrliq/ascender/internal/models"
	"github.com/ctrliq/ascender/internal/pystr"
)

// Approval nodes and nested workflows in the workflow manager.

// spawnApproval creates the approval an approval node waits on
// (WorkflowApprovalTemplate.create_unified_job and signal_start): it is
// pending until enough people approve, someone denies or it times out.
func (d *Dispatcher) spawnApproval(ctx context.Context, wj *models.WorkflowJob, n *wfNode) (int64, error) {
	a, err := models.GetWorkflowApprovalTemplate(ctx, d.DB.Pool, *n.UJTID)
	if err != nil {
		return 0, fmt.Errorf("node %d: approval template %d: %w", n.ID, *n.UJTID, err)
	}
	var id int64
	err = d.DB.Tx(ctx, func(tx pgx.Tx) error {
		var created time.Time
		if err := tx.QueryRow(ctx, `INSERT INTO main_unifiedjob (created, modified, description, name, old_pk, launch_type, cancel_flag, status, failed, started, finished, elapsed,
			job_args, job_cwd, job_explanation, start_args, result_stdout_text, result_traceback, celery_task_id, created_by_id, modified_by_id, polymorphic_ctype_id, schedule_id,
			unified_job_template_id, execution_node, instance_group_id, emitted_events, controller_node, canceled_on, dependencies_processed, organization_id, execution_environment_id,
			installed_collections, ansible_version, work_unit_id, host_status_counts, preferred_instance_groups_cache, task_impact, job_env)
			VALUES (now(), now(), $1, $2, NULL, 'workflow', false, 'pending', false, now(), NULL, 0, '', '', '', '', '', '', '', $3, $3, $4, NULL,
			$5, '', NULL, 0, '', NULL, true, NULL, NULL, '{}'::jsonb, '', NULL, NULL, '[]'::jsonb, 0, '{}'::jsonb) RETURNING id, created`,
			a.Description, a.Name, wj.CreatedByID, d.CT.ID("main.workflowapproval"), a.ID).Scan(&id, &created); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE main_unifiedjob SET started = created WHERE id = $1`, id); err != nil {
			return err
		}
		var expires *time.Time
		if a.Timeout != 0 {
			e := created.Add(time.Duration(a.Timeout) * time.Second)
			expires = &e
		}
		if _, err := tx.Exec(ctx, `INSERT INTO main_workflowapproval (unifiedjob_ptr_id, workflow_approval_template_id, timeout, timed_out, approved_or_denied_by_id, expires, context_message, on_timeout, required_approvals)
			VALUES ($1, $2, $3, false, NULL, $4, '', $5, $6)`, id, a.ID, a.Timeout, expires, a.OnTimeout, a.RequiredApprovals); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `UPDATE main_unifiedjobtemplate SET current_job_id = $2, status = 'pending' WHERE id = $1`, a.ID, id)
		return err
	})
	if err != nil {
		return 0, err
	}
	extlog.Default().LogLifecycle(ctx, extlog.Lifecycle{Type: "workflowapproval", TaskID: id, State: "created", TaskName: a.Name})
	if strings.TrimSpace(a.ContextTemplate) != "" {
		msg, err := renderContextTemplate(ctx, a.ContextTemplate, n.AncestorArtifacts)
		if err != nil {
			d.Log.WarnContext(ctx, "failed to render context_template for approval", "approval", id, "err", err)
		} else if pystr.TrimSpace(msg) != "" {
			_, _ = d.DB.Pool.Exec(ctx, `UPDATE main_workflowapproval SET context_message = $2 WHERE unifiedjob_ptr_id = $1`, id, msg)
		}
	}
	return id, nil
}

const contextTemplateTimeout = 10 * time.Second
const contextMessageMaxLength = 65536

// renderContextTemplate renders an approval's context template in the
// immutable sandbox against its ancestors' artifacts, as the old forked
// renderer did (see jinjarun.Context).
func renderContextTemplate(ctx context.Context, tmpl string, vars map[string]any) (string, error) {
	if vars == nil {
		vars = map[string]any{}
	}
	cctx, cancel := context.WithTimeout(ctx, contextTemplateTimeout)
	defer cancel()
	var res struct {
		OK    *string `json:"ok"`
		Error string  `json:"error"`
	}
	if err := jinjarun.Run(cctx, "context", map[string]any{"template": tmpl, "vars": vars}, &res); err != nil {
		if cctx.Err() != nil {
			return "", fmt.Errorf("rendering did not finish within %s", contextTemplateTimeout)
		}
		return "", err
	}
	if res.OK == nil {
		return "", fmt.Errorf("%s", res.Error)
	}
	return truncateContextMessage(*res.OK), nil
}

// truncateContextMessage keeps the first CONTEXT_MESSAGE_MAX_LENGTH
// characters (Python code points, not bytes) of a rendered message.
func truncateContextMessage(msg string) string {
	if len(msg) <= contextMessageMaxLength {
		return msg
	}
	n := 0
	for i := range msg {
		if n == contextMessageMaxLength {
			return msg[:i]
		}
		n++
	}
	return msg
}

// timeoutApprovals settles pending approvals past their expiry
// (TaskManager.timeout_approval_node).
func (d *Dispatcher) timeoutApprovals(ctx context.Context) {
	rows, err := d.DB.Pool.Query(ctx, `SELECT u.id, u.name, u.unified_job_template_id, a.timeout, a.on_timeout FROM main_workflowapproval a JOIN main_unifiedjob u ON u.id = a.unifiedjob_ptr_id
		WHERE u.status = 'pending' AND a.timeout <> 0 AND a.expires < now() ORDER BY u.id`)
	if err != nil {
		d.Log.ErrorContext(ctx, "expired approvals", "err", err)
		return
	}
	type expired struct {
		id      int64
		name    string
		tmpl    *int64
		timeout int64
		onTO    string
	}
	var list []expired
	for rows.Next() {
		var e expired
		if err := rows.Scan(&e.id, &e.name, &e.tmpl, &e.timeout, &e.onTO); err == nil {
			list = append(list, e)
		}
	}
	rows.Close()
	for _, e := range list {
		status := "failed"
		msg := fmt.Sprintf("The approval node %s (%d) has expired after %d seconds.", e.name, e.id, e.timeout)
		if e.onTO == "approve" {
			status = "successful"
			msg = fmt.Sprintf("The approval node %s (%d) was automatically approved after %d seconds.", e.name, e.id, e.timeout)
		}
		err := d.DB.Tx(ctx, func(tx pgx.Tx) error { return api.FinishApproval(ctx, tx, e.id, e.tmpl, status, nil, msg, true) })
		switch {
		case errors.Is(err, api.ErrApprovalDecided):
			// A vote decided it while the timeout was on its way.
		case err != nil:
			d.Log.ErrorContext(ctx, "approval timeout", "approval", e.id, "err", err)
		default:
			d.Log.WarnContext(ctx, msg)
			d.background(func(ctx context.Context) { d.API.SendApprovalNotifications(ctx, e.id, "timed_out") })
		}
	}
}

// spawnNestedWorkflow creates the workflow job of a node that runs a
// workflow job template, refusing recursion the way the workflow manager
// did: the job is created and failed with the spawn order.
func (d *Dispatcher) spawnNestedWorkflow(ctx context.Context, wj *models.WorkflowJob, dag *wfDAG, n *wfNode) (int64, bool, error) {
	t, err := models.GetWorkflowJobTemplate(ctx, d.DB.Pool, *n.UJTID)
	if err != nil {
		return 0, false, fmt.Errorf("node %d: workflow job template %d: %w", n.ID, *n.UJTID, err)
	}
	spec := &api.WorkflowNodeSpec{ID: n.ID, InventoryID: n.InventoryID, CharPrompts: n.CharPrompts, SurveyPasswords: n.SurveyPasswords, AncestorArtifacts: n.AncestorArtifacts,
		IsRoot: len(n.parents) == 0, NodeCount: int64(len(dag.nodes))}
	if n.ExtraData != "" {
		spec.ExtraData, _ = parseVars(n.ExtraData)
	}
	ancestors, names, err := d.API.WorkflowAncestorTemplates(ctx, wj.ID)
	if err != nil {
		return 0, false, err
	}
	child, err := d.API.SpawnWorkflowNodeWorkflow(ctx, wj, t, spec)
	if err != nil {
		return 0, false, err
	}
	for _, a := range ancestors {
		if a == t.ID {
			display := append([]string{fmt.Sprintf("%s-%d", t.Name, t.ID)}, names...)
			for i := range display {
				display[i] = "<" + display[i] + ">"
			}
			msg := "Workflow Job spawned from workflow could not start because it would result in recursion (spawn order, most recent first: " + strings.Join(display, ", ") + ")"
			d.Log.InfoContext(ctx, "refusing to start recursive workflow-in-workflow", "workflow_job", child.ID, "template", t.ID)
			if _, err := d.DB.Pool.Exec(ctx, `UPDATE main_unifiedjob SET status = 'failed', failed = true, job_explanation = $2, finished = now(), modified = now() WHERE id = $1`, child.ID, msg); err != nil {
				return 0, false, err
			}
			// The caller exhausts the node's retries and sends the failure.
			return child.ID, true, nil
		}
	}
	return child.ID, false, nil
}
