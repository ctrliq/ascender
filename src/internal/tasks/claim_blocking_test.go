package tasks

import (
	"context"
	"fmt"
	"testing"
	"time"
)

// blockRig makes tasks of every kind the claim takes on a claim rig's
// scratch database.
type blockRig struct {
	*claimRig
	t   *testing.T
	ctx context.Context
	n   int
}

func newBlockRig(t *testing.T) *blockRig {
	return &blockRig{claimRig: newClaimRig(t), t: t, ctx: context.Background()}
}

func (b *blockRig) ujt(ctype string) int64 {
	b.n++
	return insertRow(b.t, b.db, "main_unifiedjobtemplate", map[string]any{"name": fmt.Sprintf("zz-block-%d", b.n), "status": "never updated",
		"polymorphic_ctype_id": b.ct.ID(ctype)})
}

func (b *blockRig) inventory(allowWhileSyncing bool) int64 {
	b.n++
	return insertRow(b.t, b.db, "main_inventory", map[string]any{"name": fmt.Sprintf("zz-block-%d", b.n), "variables": "", "host_filter": "",
		"allow_jobs_while_syncing": allowWhileSyncing, "created": time.Now(), "modified": time.Now()})
}

func (b *blockRig) project() int64 {
	id := b.ujt("main.project")
	insertRow(b.t, b.db, "main_project", map[string]any{"unifiedjobtemplate_ptr_id": id})
	return id
}

func (b *blockRig) source(inventory int64) int64 {
	id := b.ujt("main.inventorysource")
	insertRow(b.t, b.db, "main_inventorysource", map[string]any{"unifiedjobtemplate_ptr_id": id, "inventory_id": inventory})
	return id
}

func (b *blockRig) jobTemplate() int64 {
	id := b.ujt("main.jobtemplate")
	insertRow(b.t, b.db, "main_jobtemplate", map[string]any{"unifiedjobtemplate_ptr_id": id, "survey_spec": "{}"})
	return id
}

// task adds a unified job of the content type in the status, created age
// ago, with the columns of its own table.
func (b *blockRig) task(ctype, status, launchType string, age time.Duration, ujt int64, own map[string]any) int64 {
	set := map[string]any{"name": "zz-block", "status": status, "launch_type": launchType, "task_impact": 1,
		"polymorphic_ctype_id": b.ct.ID(ctype), "preferred_instance_groups_cache": "[]", "created": time.Now().Add(-age)}
	if ujt != 0 {
		set["unified_job_template_id"] = ujt
	}
	id := insertRow(b.t, b.db, "main_unifiedjob", set)
	table := map[string]string{"main.job": "main_job", "main.adhoccommand": "main_adhoccommand", "main.inventoryupdate": "main_inventoryupdate",
		"main.projectupdate": "main_projectupdate", "main.systemjob": "main_systemjob", "main.workflowjob": "main_workflowjob"}[ctype]
	cols := map[string]any{"unifiedjob_ptr_id": id}
	switch ctype {
	case "main.job":
		cols["job_type"], cols["forks"] = "run", 1
	case "main.systemjob":
		cols["job_type"] = "cleanup_jobs"
	case "main.adhoccommand":
		cols["job_type"], cols["module_name"] = "run", "command"
	case "main.projectupdate":
		cols["job_type"] = "check"
	}
	for k, v := range own {
		cols[k] = v
	}
	insertRow(b.t, b.db, table, cols)
	return id
}

// claims reports whether the next claim takes the task, then puts it back
// to pending and finishes every other active task, for the next case.
func (b *blockRig) claims(id int64) bool {
	b.t.Helper()
	got, _, outcome := b.d[0].claimLocked(b.ctx, []int64{})
	if outcome != claimNone && got != id {
		b.t.Fatalf("claimed %d, want %d or none", got, id)
	}
	return outcome != claimNone
}

func (b *blockRig) reset() {
	if _, err := b.db.Pool.Exec(b.ctx, `UPDATE main_unifiedjob SET status = 'successful' WHERE status IN ('pending', 'waiting', 'running')`); err != nil {
		b.t.Fatal(err)
	}
}

func (b *blockRig) explanation(id int64) string {
	var s string
	if err := b.db.Pool.QueryRow(b.ctx, `SELECT job_explanation FROM main_unifiedjob WHERE id = $1`, id).Scan(&s); err != nil {
		b.t.Fatal(err)
	}
	return s
}

// The claim applies every rule of the old task manager's dependency graph
// (dependency_graph.py): ad hoc commands block jobs and ad hoc commands on
// their inventory, a sync blocks both unless the inventory allows jobs
// while syncing, any system job blocks the others, and project syncs
// block nothing.
func TestClaimBlockingRules(t *testing.T) {
	b := newBlockRig(t)
	x, y := b.inventory(false), b.inventory(false)
	allow := b.inventory(true)
	srcX, srcAllow := b.source(x), b.source(allow)
	proj := b.project()
	jt := b.jobTemplate()
	old := time.Minute

	for _, c := range []struct {
		name    string
		blocker func() int64 // makes the active task, 0 for none
		pending func() int64
		blocked bool
	}{
		{"ad hoc command blocks a job on its inventory",
			func() int64 {
				return b.task("main.adhoccommand", "running", "manual", old, 0, map[string]any{"inventory_id": x})
			},
			func() int64 { return b.task("main.job", "pending", "manual", 0, 0, map[string]any{"inventory_id": x}) }, true},
		{"ad hoc command does not block a job on another inventory",
			func() int64 {
				return b.task("main.adhoccommand", "running", "manual", old, 0, map[string]any{"inventory_id": x})
			},
			func() int64 { return b.task("main.job", "pending", "manual", 0, 0, map[string]any{"inventory_id": y}) }, false},
		{"ad hoc command blocks an ad hoc command on its inventory",
			func() int64 {
				return b.task("main.adhoccommand", "waiting", "manual", old, 0, map[string]any{"inventory_id": x})
			},
			func() int64 {
				return b.task("main.adhoccommand", "pending", "manual", 0, 0, map[string]any{"inventory_id": x})
			}, true},
		{"ad hoc command blocks a job even when the inventory allows jobs while syncing",
			func() int64 {
				return b.task("main.adhoccommand", "running", "manual", old, 0, map[string]any{"inventory_id": allow})
			},
			func() int64 {
				return b.task("main.job", "pending", "manual", 0, 0, map[string]any{"inventory_id": allow})
			}, true},
		{"sync blocks an ad hoc command",
			func() int64 {
				return b.task("main.inventoryupdate", "running", "manual", old, srcX, map[string]any{"inventory_source_id": srcX, "inventory_id": x})
			},
			func() int64 {
				return b.task("main.adhoccommand", "pending", "manual", 0, 0, map[string]any{"inventory_id": x})
			}, true},
		{"sync of an update without its own inventory blocks through its source",
			func() int64 {
				return b.task("main.inventoryupdate", "running", "manual", old, srcX, map[string]any{"inventory_source_id": srcX})
			},
			func() int64 { return b.task("main.job", "pending", "manual", 0, 0, map[string]any{"inventory_id": x}) }, true},
		{"sync does not block an ad hoc command when the inventory allows jobs while syncing",
			func() int64 {
				return b.task("main.inventoryupdate", "running", "manual", old, srcAllow, map[string]any{"inventory_source_id": srcAllow, "inventory_id": allow})
			},
			func() int64 {
				return b.task("main.adhoccommand", "pending", "manual", 0, 0, map[string]any{"inventory_id": allow})
			}, false},
		{"system job blocks a system job of another template",
			func() int64 {
				return b.task("main.systemjob", "running", "manual", old, b.ujt("main.systemjobtemplate"), nil)
			},
			func() int64 {
				return b.task("main.systemjob", "pending", "manual", 0, b.ujt("main.systemjobtemplate"), nil)
			}, true},
		{"job of the template blocks a job",
			func() int64 {
				return b.task("main.job", "running", "manual", old, jt, map[string]any{"job_template_id": jt})
			},
			func() int64 {
				return b.task("main.job", "pending", "manual", 0, jt, map[string]any{"job_template_id": jt})
			}, true},
		{"job of the template does not block a job allowing simultaneous runs",
			func() int64 {
				return b.task("main.job", "running", "manual", old, jt, map[string]any{"job_template_id": jt})
			},
			func() int64 {
				return b.task("main.job", "pending", "manual", 0, jt, map[string]any{"job_template_id": jt, "allow_simultaneous": true})
			}, false},
		{"sliced workflow job of the template does not block a job",
			func() int64 {
				return b.task("main.workflowjob", "running", "manual", old, jt, map[string]any{"is_sliced_job": true})
			},
			func() int64 {
				return b.task("main.job", "pending", "manual", 0, jt, map[string]any{"job_template_id": jt})
			}, false},
		{"project update blocks a job of the project",
			func() int64 {
				return b.task("main.projectupdate", "running", "manual", old, proj, map[string]any{"project_id": proj})
			},
			func() int64 { return b.task("main.job", "pending", "manual", 0, 0, map[string]any{"project_id": proj}) }, true},
		{"project sync blocks no project update",
			func() int64 {
				return b.task("main.projectupdate", "running", "sync", old, proj, map[string]any{"project_id": proj})
			},
			func() int64 {
				return b.task("main.projectupdate", "pending", "manual", 0, proj, map[string]any{"project_id": proj})
			}, false},
		{"project update blocks a project update",
			func() int64 {
				return b.task("main.projectupdate", "running", "manual", old, proj, map[string]any{"project_id": proj})
			},
			func() int64 {
				return b.task("main.projectupdate", "pending", "manual", 0, proj, map[string]any{"project_id": proj})
			}, true},
		{"inventory update blocks an update of its source",
			func() int64 {
				return b.task("main.inventoryupdate", "running", "manual", old, srcX, map[string]any{"inventory_source_id": srcX, "inventory_id": x})
			},
			func() int64 {
				return b.task("main.inventoryupdate", "pending", "manual", 0, srcX, map[string]any{"inventory_source_id": srcX, "inventory_id": x})
			}, true},
	} {
		b.reset()
		c.blocker()
		id := c.pending()
		if got := !b.claims(id); got != c.blocked {
			t.Errorf("%s: blocked %v, want %v", c.name, got, c.blocked)
		}
	}
}

// A blocked task 30 seconds old is explained as the task manager did,
// naming the first blocker by the graph's precedence: for a job, its
// project's update, then an ad hoc command on its inventory, then a sync,
// then a job of its template; the oldest when several of a kind.
func TestBlockedTaskExplanation(t *testing.T) {
	b := newBlockRig(t)
	x := b.inventory(false)
	srcX := b.source(x)
	proj := b.project()
	jt := b.jobTemplate()
	young := b.task("main.job", "pending", "manual", 10*time.Second, jt, map[string]any{"inventory_id": x, "project_id": proj, "job_template_id": jt})
	job := b.task("main.job", "pending", "manual", time.Hour, jt, map[string]any{"inventory_id": x, "project_id": proj, "job_template_id": jt})
	adhoc := b.task("main.adhoccommand", "pending", "manual", time.Hour, 0, map[string]any{"inventory_id": x})
	explain := func(want map[int64]string) {
		t.Helper()
		b.d[0].explainBlocked(b.ctx)
		for id, w := range want {
			if got := b.explanation(id); got != w {
				t.Errorf("task %d: explanation %q, want %q", id, got, w)
			}
		}
	}
	running := b.task("main.job", "running", "manual", 2*time.Hour, jt, map[string]any{"job_template_id": jt})
	explain(map[int64]string{job: fmt.Sprintf("waiting for job-%d to finish", running), young: "", adhoc: ""})
	sync := b.task("main.inventoryupdate", "running", "manual", 2*time.Hour, srcX, map[string]any{"inventory_source_id": srcX, "inventory_id": x})
	explain(map[int64]string{job: fmt.Sprintf("waiting for inventoryupdate-%d to finish", sync), adhoc: fmt.Sprintf("waiting for inventoryupdate-%d to finish", sync)})
	older := b.task("main.adhoccommand", "running", "manual", 3*time.Hour, 0, map[string]any{"inventory_id": x})
	b.task("main.adhoccommand", "running", "manual", 2*time.Hour, 0, map[string]any{"inventory_id": x})
	explain(map[int64]string{job: fmt.Sprintf("waiting for adhoccommand-%d to finish", older), adhoc: fmt.Sprintf("waiting for adhoccommand-%d to finish", older)})
	pu := b.task("main.projectupdate", "running", "manual", time.Hour, proj, map[string]any{"project_id": proj})
	explain(map[int64]string{job: fmt.Sprintf("waiting for projectupdate-%d to finish", pu), young: ""})
	// Nothing is claimable: every pending task is blocked.
	if got, _, outcome := b.d[0].claimLocked(b.ctx, []int64{}); outcome != claimNone {
		t.Errorf("claimed %d", got)
	}
	// Once nothing blocks it, the job starts without the explanation of
	// why it waited (pre_start cleared it).
	if _, err := b.db.Pool.Exec(b.ctx, `UPDATE main_unifiedjob SET status = 'successful' WHERE id <> $1 AND status IN ('pending', 'waiting', 'running')`, job); err != nil {
		t.Fatal(err)
	}
	if _, err := b.db.Pool.Exec(b.ctx, `UPDATE main_unifiedjob SET preferred_instance_groups_cache = (SELECT jsonb_build_array(id) FROM main_instancegroup WHERE name = 'controlplane')
		WHERE id = $1`, job); err != nil {
		t.Fatal(err)
	}
	if got, _, outcome := b.d[0].claimLocked(b.ctx, []int64{}); outcome != claimPlaced || got != job {
		t.Fatalf("claimed %d (outcome %v), want job %d placed", got, outcome, job)
	}
	if got := b.explanation(job); got != "" {
		t.Errorf("started job kept its explanation %q", got)
	}
}

// A blocked workflow job is explained too: by the oldest workflow job of
// its template, or for a sliced job by a job of its job template.
func TestBlockedWorkflowJobExplanation(t *testing.T) {
	b := newBlockRig(t)
	wfType := b.ct.ID("main.workflowjob")
	wfjt := b.ujt("main.workflowjobtemplate")
	insertRow(t, b.db, "main_workflowjobtemplate", map[string]any{"unifiedjobtemplate_ptr_id": wfjt, "survey_spec": "{}", "extra_vars": "", "char_prompts": "{}"})
	jt := b.jobTemplate()
	wf := func(ujt int64, status string, age time.Duration, own map[string]any) int64 {
		cols := map[string]any{"extra_vars": "{}", "char_prompts": "{}", "survey_passwords": "{}"}
		for k, v := range own {
			cols[k] = v
		}
		return b.task("main.workflowjob", status, "manual", age, ujt, cols)
	}
	running := wf(wfjt, "running", 2*time.Hour, map[string]any{"workflow_job_template_id": wfjt})
	pending := wf(wfjt, "pending", time.Hour, map[string]any{"workflow_job_template_id": wfjt})
	young := wf(wfjt, "pending", time.Second, map[string]any{"workflow_job_template_id": wfjt})
	job := b.task("main.job", "running", "manual", 2*time.Hour, jt, map[string]any{"job_template_id": jt})
	sliced := wf(jt, "pending", time.Hour, map[string]any{"is_sliced_job": true})
	for _, id := range []int64{pending, young, sliced} {
		if err := explainBlockedWorkflow(b.ctx, b.db.Pool, id, wfType); err != nil {
			t.Fatal(err)
		}
	}
	for id, want := range map[int64]string{pending: fmt.Sprintf("waiting for workflowjob-%d to finish", running), young: "",
		sliced: fmt.Sprintf("waiting for job-%d to finish", job)} {
		if got := b.explanation(id); got != want {
			t.Errorf("workflow job %d: explanation %q, want %q", id, got, want)
		}
	}
	// Once the other run finishes, the blocked one starts without the
	// explanation of why it waited.
	if _, err := b.db.Pool.Exec(b.ctx, `UPDATE main_unifiedjob SET status = 'successful' WHERE id = $1`, running); err != nil {
		t.Fatal(err)
	}
	if ok, err := startWorkflowJob(b.ctx, b.db.Pool, pending); err != nil || !ok {
		t.Fatalf("blocked workflow job did not start: %v", err)
	}
	if got := b.explanation(pending); got != "" {
		t.Errorf("started workflow job kept its explanation %q", got)
	}
}
