package tasks

import (
	"context"
	"testing"
	"time"
)

// A workflow job that does not allow simultaneous runs stays pending while
// another job of its template is waiting or running, and starts once that
// one finishes; one that allows them starts at once. A sliced workflow job
// is blocked by a job of its job template as well.
func TestStartWorkflowJobBlocking(t *testing.T) {
	r := newClaimRig(t)
	ctx := context.Background()
	template := func(ctype string) int64 {
		return insertRow(t, r.db, "main_unifiedjobtemplate", map[string]any{"name": "zz-wf-block", "status": "never updated",
			"polymorphic_ctype_id": r.ct.ID(ctype)})
	}
	workflowJob := func(ujt int64, status string, simultaneous bool) int64 {
		id := insertRow(t, r.db, "main_unifiedjob", map[string]any{"name": "zz-wf-block", "status": status, "launch_type": "manual",
			"polymorphic_ctype_id": r.ct.ID("main.workflowjob"), "unified_job_template_id": ujt, "created": time.Now()})
		insertRow(t, r.db, "main_workflowjob", map[string]any{"unifiedjob_ptr_id": id, "extra_vars": "{}", "allow_simultaneous": simultaneous,
			"is_sliced_job": false, "webhook_guid": "", "webhook_service": "", "is_bulk_job": false, "char_prompts": "{}", "survey_passwords": "{}",
			"allow_overwrite_flow_vars_on_relaunch": false, "allow_force_node_success_on_relaunch": false})
		return id
	}
	start := func(id int64) bool {
		t.Helper()
		ok, err := startWorkflowJob(ctx, r.db.Pool, id)
		if err != nil {
			t.Fatal(err)
		}
		return ok
	}
	setStatus := func(id int64, status string) {
		t.Helper()
		if _, err := r.db.Pool.Exec(ctx, `UPDATE main_unifiedjob SET status = $2 WHERE id = $1`, id, status); err != nil {
			t.Fatal(err)
		}
	}

	wfjt := template("main.workflowjobtemplate")
	running := workflowJob(wfjt, "running", false)
	blocked := workflowJob(wfjt, "pending", false)
	if start(blocked) {
		t.Error("a workflow job started while another of its template was running")
	}
	allowed := workflowJob(wfjt, "pending", true)
	if !start(allowed) {
		t.Error("a workflow job that allows simultaneous runs did not start")
	}
	setStatus(running, "successful")
	setStatus(allowed, "successful")
	if !start(blocked) {
		t.Error("the blocked workflow job did not start once the others finished")
	}
	if start(blocked) {
		t.Error("a running workflow job was started again")
	}

	jt := template("main.jobtemplate")
	job := r.pending(t, "main.job", jt, "[]")
	setStatus(job, "waiting")
	sliced := workflowJob(jt, "pending", false)
	if start(sliced) {
		t.Error("a sliced workflow job started while a job of its template was waiting")
	}
	setStatus(job, "failed")
	if !start(sliced) {
		t.Error("the sliced workflow job did not start once the job finished")
	}
}
