package tasks

import (
	"context"
	"strconv"
	"testing"
	"time"

	"github.com/ctrliq/ascender/internal/models"
)

// A pending dependency is placed in its own preferred groups as the
// dispatcher would place it. When it does not fit, it takes the place of
// the run that depends on it if that run's group is one it prefers, and
// otherwise goes back to pending.
func TestClaimPlacedDependency(t *testing.T) {
	r := newClaimRig(t)
	ctx := context.Background()
	d := r.d[0] // zz-a
	var cp int64
	if err := r.db.Pool.QueryRow(ctx, `SELECT id FROM main_instancegroup WHERE name = 'controlplane'`).Scan(&cp); err != nil {
		t.Fatal(err)
	}
	other := insertRow(t, r.db, "main_instancegroup", map[string]any{"name": "zz-other", "policy_instance_list": "[]"})
	parent := r.pending(t, "main.job", 0, "[]")
	if _, err := r.db.Pool.Exec(ctx, `UPDATE main_unifiedjob SET status = 'waiting', instance_group_id = $2, execution_node = 'zz-a', controller_node = 'zz-a' WHERE id = $1`, parent, cp); err != nil {
		t.Fatal(err)
	}
	ctype := r.ct.ID("main.inventoryupdate")
	dependency := func(impact int64, groups string) int64 {
		return insertRow(t, r.db, "main_unifiedjob", map[string]any{"name": "zz-dep", "status": "pending", "launch_type": "dependency",
			"polymorphic_ctype_id": ctype, "task_impact": impact, "preferred_instance_groups_cache": groups, "created": time.Now()})
	}
	placement := func(id int64) (status string, group *int64, exec string) {
		t.Helper()
		if err := r.db.Pool.QueryRow(ctx, `SELECT status, instance_group_id, execution_node FROM main_unifiedjob WHERE id = $1`, id).Scan(&status, &group, &exec); err != nil {
			t.Fatal(err)
		}
		return
	}

	fits := dependency(1, "["+itoa(cp)+"]")
	if !d.claimPlacedDependency(ctx, fits, ctype, parent) {
		t.Fatal("a dependency that fits was not claimed")
	}
	if st, g, exec := placement(fits); st != "waiting" || g == nil || *g != cp || exec != "zz-a" {
		t.Errorf("a dependency that fits: %s in %v on %q", st, g, exec)
	}

	lent := dependency(100000, "["+itoa(cp)+"]")
	if !d.claimPlacedDependency(ctx, lent, ctype, parent) {
		t.Fatal("a dependency in its run's group did not take the run's place")
	}
	if st, g, exec := placement(lent); st != "waiting" || g == nil || *g != cp || exec != "zz-a" {
		t.Errorf("a dependency taking its run's place: %s in %v on %q", st, g, exec)
	}

	refused := dependency(100000, "["+itoa(other)+"]")
	if d.claimPlacedDependency(ctx, refused, ctype, parent) {
		t.Error("a dependency that fits nowhere and prefers other groups was claimed")
	}
	if st, _, _ := placement(refused); st != "pending" {
		t.Errorf("a dependency that fits nowhere is %s, not pending", st)
	}
}

// A run update (a job's own sync) leaves its project's status and last
// job alone, unless it is the project's first update; a check update
// always updates them.
func TestRunSyncLeavesProject(t *testing.T) {
	r := newClaimRig(t)
	ctx := context.Background()
	d := r.d[0]
	project := func(status string) int64 {
		id := insertRow(t, r.db, "main_unifiedjobtemplate", map[string]any{"name": "zz-project", "status": status, "polymorphic_ctype_id": r.ct.ID("main.project")})
		insertRow(t, r.db, "main_project", map[string]any{"unifiedjobtemplate_ptr_id": id})
		return id
	}
	update := func(ujt int64, jobType string) int64 {
		id := insertRow(t, r.db, "main_unifiedjob", map[string]any{"name": "zz-update", "status": "running", "launch_type": "sync",
			"polymorphic_ctype_id": r.ct.ID("main.projectupdate"), "unified_job_template_id": ujt, "created": time.Now()})
		insertRow(t, r.db, "main_projectupdate", map[string]any{"unifiedjob_ptr_id": id, "job_type": jobType, "project_id": ujt})
		return id
	}
	state := func(ujt int64) (status string, last, current *int64) {
		t.Helper()
		if err := r.db.Pool.QueryRow(ctx, `SELECT status, last_job_id, current_job_id FROM main_unifiedjobtemplate WHERE id = $1`, ujt).Scan(&status, &last, &current); err != nil {
			t.Fatal(err)
		}
		return
	}
	run := func(ujt, id int64, status string) {
		t.Helper()
		d.templateRunning(ctx, r.db.Pool, ujt, id)
		if err := d.templateFinished(ctx, r.db.Pool, ujt, status, id, status != "successful", time.Now()); err != nil {
			t.Fatal(err)
		}
	}

	updated := project("successful")
	run(updated, update(updated, "run"), "failed")
	if st, last, cur := state(updated); st != "successful" || last != nil || cur != nil {
		t.Errorf("a run update changed an updated project: %s, last %v, current %v", st, last, cur)
	}
	check := update(updated, "check")
	run(updated, check, "failed")
	if st, last, _ := state(updated); st != "failed" || last == nil || *last != check {
		t.Errorf("a check update: %s, last %v", st, last)
	}

	fresh := project("never updated")
	first := update(fresh, "run")
	run(fresh, first, "successful")
	if st, last, cur := state(fresh); st != "successful" || last == nil || *last != first || cur != nil {
		t.Errorf("a first run update: %s, last %v, current %v", st, last, cur)
	}
	if got := models.ProjectUpdateTaskImpact("check"); got != 1 {
		t.Errorf("check update impact %d", got)
	}
	if got := models.ProjectUpdateTaskImpact("run"); got != 0 {
		t.Errorf("run update impact %d", got)
	}
}

// The global groups follow the queue name settings, the execution queue
// first; on Kubernetes only the execution queue.
func TestGlobalInstanceGroupsFollowQueueNames(t *testing.T) {
	r := newClaimRig(t)
	ctx := context.Background()
	exec := insertRow(t, r.db, "main_instancegroup", map[string]any{"name": "zz-exec", "policy_instance_list": "[]"})
	cp := insertRow(t, r.db, "main_instancegroup", map[string]any{"name": "zz-cp", "policy_instance_list": "[]"})
	got, err := models.PreferredInstanceGroups(ctx, r.db.Pool, nil, nil, nil, models.GlobalInstanceGroupNames("zz-exec", "zz-cp", false))
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 || got[0] != exec || got[1] != cp {
		t.Errorf("outside Kubernetes: %v, want [%d %d]", got, exec, cp)
	}
	got, err = models.PreferredInstanceGroups(ctx, r.db.Pool, nil, nil, nil, models.GlobalInstanceGroupNames("zz-exec", "zz-cp", true))
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0] != exec {
		t.Errorf("on Kubernetes: %v, want [%d]", got, exec)
	}
	if e, c := models.QueueNames("", ""); e != "default" || c != "controlplane" {
		t.Errorf("default queue names %q %q", e, c)
	}
}

// The default execution environment is the newest global unmanaged one
// with an image of GLOBAL_JOB_EXECUTION_ENVIRONMENTS, else the newest
// global unmanaged one; the control plane's is the newest managed one.
func TestDefaultExecutionEnvironmentOrder(t *testing.T) {
	r := newClaimRig(t)
	ctx := context.Background()
	now := time.Now()
	ee := func(image string, managed bool, age time.Duration) int64 {
		return insertRow(t, r.db, "main_executionenvironment", map[string]any{"name": image, "image": image, "managed": managed,
			"pull": "", "created": now.Add(-age), "modified": now.Add(-age)})
	}
	listed := ee("zz/listed", false, 3*time.Hour)
	ee("zz/older", false, 4*time.Hour)
	newest := ee("zz/newest", false, time.Hour)
	ee("zz/cp-old", true, 3*time.Hour)
	cpNew := ee("zz/cp-new", true, 2*time.Hour)
	if got := models.DefaultExecutionEnvironmentID(ctx, r.db.Pool, []string{"zz/listed", "zz/missing"}); got == nil || *got != listed {
		t.Errorf("with a listed image: %v, want %d", got, listed)
	}
	if got := models.DefaultExecutionEnvironmentID(ctx, r.db.Pool, []string{"zz/missing"}); got == nil || *got != newest {
		t.Errorf("without a listed image: %v, want %d", got, newest)
	}
	if got := models.ControlPlaneExecutionEnvironmentID(ctx, r.db.Pool); got == nil || *got != cpNew {
		t.Errorf("control plane: %v, want %d", got, cpNew)
	}
}

func itoa(n int64) string { return strconv.FormatInt(n, 10) }
