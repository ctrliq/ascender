package tasks

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"strings"
	"testing"
	"time"
	"unicode/utf8"

	"github.com/ctrliq/ascender/internal/activity"
	"github.com/ctrliq/ascender/internal/api"
	"github.com/ctrliq/ascender/internal/config"
	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/models"
	"github.com/ctrliq/ascender/internal/settings"
)

// wfRig is a scratch database with a dispatcher that has an API server.
type wfRig struct {
	db *db.DB
	ct *models.ContentTypes
	d  *Dispatcher
}

func newWFRig(t *testing.T) *wfRig {
	t.Helper()
	database := claimScratchDB(t)
	ctx := context.Background()
	cts, err := models.LoadContentTypes(ctx, database.Pool)
	if err != nil {
		t.Fatal(err)
	}
	cascader, err := models.LoadCascader(ctx, database.Pool)
	if err != nil {
		t.Fatal(err)
	}
	registry, err := settings.LoadRegistry()
	if err != nil {
		t.Fatal(err)
	}
	store := settings.NewStore(database, registry, "zz")
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	cfg := &config.Config{ClusterHostID: "zz-wf", NodeType: "hybrid", Version: "test", SecretKey: "zz"}
	srv := &api.Server{Cfg: cfg, DB: database, Settings: store, CT: cts, Roles: models.RoleFactory{CT: cts}, Cascade: cascader, Activity: activity.New("zz-wf"), Log: log}
	return &wfRig{db: database, ct: cts, d: &Dispatcher{Cfg: cfg, DB: database, CT: cts, Log: log, Settings: store, API: srv}}
}

func (r *wfRig) workflowJob(t *testing.T, status string, set map[string]any) int64 {
	t.Helper()
	uj := map[string]any{"name": "zz-wf", "status": status, "launch_type": "manual", "polymorphic_ctype_id": r.ct.ID("main.workflowjob"), "created": time.Now()}
	for k, v := range set {
		uj[k] = v
	}
	id := insertRow(t, r.db, "main_unifiedjob", uj)
	insertRow(t, r.db, "main_workflowjob", map[string]any{"unifiedjob_ptr_id": id, "extra_vars": "{}", "webhook_guid": "", "webhook_service": "",
		"char_prompts": "{}", "survey_passwords": "{}"})
	return id
}

func (r *wfRig) job(t *testing.T, status string, finished time.Time, artifacts string) int64 {
	t.Helper()
	id := insertRow(t, r.db, "main_unifiedjob", map[string]any{"name": "zz-job", "status": status, "launch_type": "workflow", "polymorphic_ctype_id": r.ct.ID("main.job"),
		"created": time.Now(), "finished": finished})
	insertRow(t, r.db, "main_job", map[string]any{"unifiedjob_ptr_id": id, "job_type": "run", "forks": 1, "artifacts": artifacts})
	return id
}

func (r *wfRig) node(t *testing.T, wf int64, job, ujt *int64) int64 {
	t.Helper()
	set := map[string]any{"workflow_job_id": wf, "ancestor_artifacts": "{}", "extra_data": "{}", "char_prompts": "{}", "survey_passwords": "{}", "identifier": ""}
	if job != nil {
		set["job_id"] = *job
	}
	if ujt != nil {
		set["unified_job_template_id"] = *ujt
	}
	return insertRow(t, r.db, "main_workflowjobnode", set)
}

// A finished nested (or sliced) workflow passes on the merged artifacts of
// its inner jobs that finished successful or failed, in the order they
// finished, nested workflows included (get_effective_artifacts); the
// automatic stats keys merge rather than replace.
func TestNestedWorkflowArtifacts(t *testing.T) {
	r := newWFRig(t)
	ctx := context.Background()
	t0 := time.Now().Add(-time.Hour)
	outer := r.workflowJob(t, "running", nil)
	inner := r.workflowJob(t, "successful", map[string]any{"finished": t0.Add(10 * time.Minute)})
	deep := r.workflowJob(t, "successful", map[string]any{"finished": t0.Add(5 * time.Minute)})
	// Inserted out of finish order.
	j2 := r.job(t, "failed", t0.Add(2*time.Minute), `{"a": 2, "ascender_stats_failed": false, "ascender_stats_failed_hosts": [], "ascender_stats_non_failed_hosts": ["h1", "h2"]}`)
	j1 := r.job(t, "successful", t0.Add(time.Minute), `{"a": 1, "x": "first", "ascender_stats_failed": true, "ascender_stats_failed_hosts": ["h1"], "ascender_stats_non_failed_hosts": ["h2"]}`)
	running := r.job(t, "running", t0, `{"zzz": 1}`)
	canceled := r.job(t, "canceled", t0.Add(3*time.Minute), `{"canceled": 1}`)
	j4 := r.job(t, "successful", t0.Add(4*time.Minute), `{"deep": "yes", "a": 4}`)
	for _, j := range []int64{j2, j1, running, canceled, deep} {
		j := j
		r.node(t, inner, &j, nil)
	}
	r.node(t, deep, &j4, nil)
	nA := r.node(t, outer, &inner, nil)

	dag, err := r.d.loadDAG(ctx, outer)
	if err != nil {
		t.Fatal(err)
	}
	got, _ := json.Marshal(dag.byID[nA].JobArtifacts)
	want := `{"a":4,"ascender_stats_failed":true,"ascender_stats_failed_hosts":["h1"],"ascender_stats_non_failed_hosts":["h2"],"deep":"yes","x":"first"}`
	if string(got) != want {
		t.Errorf("artifacts\ngot  %s\nwant %s", got, want)
	}
	// A running nested workflow passes nothing on yet.
	if _, err := r.db.Pool.Exec(ctx, `UPDATE main_unifiedjob SET status = 'running' WHERE id = $1`, inner); err != nil {
		t.Fatal(err)
	}
	if dag, err = r.d.loadDAG(ctx, outer); err != nil {
		t.Fatal(err)
	}
	if len(dag.byID[nA].JobArtifacts) != 0 {
		t.Errorf("running nested workflow artifacts %v", dag.byID[nA].JobArtifacts)
	}
}

// A system job template node spawns a system job, launched by the
// workflow and created by its creator, without the node's prompts.
func TestSystemJobTemplateNodeSpawns(t *testing.T) {
	r := newWFRig(t)
	ctx := context.Background()
	user := insertRow(t, r.db, "auth_user", map[string]any{"username": "zz-wf-sys", "password": "!", "is_active": true, "date_joined": time.Now()})
	sjt := insertRow(t, r.db, "main_unifiedjobtemplate", map[string]any{"name": "zz-cleanup", "status": "never updated", "polymorphic_ctype_id": r.ct.ID("main.systemjobtemplate")})
	insertRow(t, r.db, "main_systemjobtemplate", map[string]any{"unifiedjobtemplate_ptr_id": sjt, "job_type": "cleanup_jobs"})
	wf := r.workflowJob(t, "running", map[string]any{"created_by_id": user})
	n := r.node(t, wf, nil, &sjt)
	if _, err := r.db.Pool.Exec(ctx, `UPDATE main_workflowjobnode SET extra_data = '{"days": 3}' WHERE id = $1`, n); err != nil {
		t.Fatal(err)
	}
	wj, err := models.GetWorkflowJob(ctx, r.db.Pool, wf)
	if err != nil {
		t.Fatal(err)
	}
	dag, err := r.d.loadDAG(ctx, wf)
	if err != nil {
		t.Fatal(err)
	}
	if err := r.d.spawnNode(ctx, wj, dag, dag.byID[n]); err != nil {
		t.Fatal(err)
	}
	var jobType, extra, launch, status string
	var createdBy *int64
	if err := r.db.Pool.QueryRow(ctx, `SELECT s.job_type, s.extra_vars, u.launch_type, u.status, u.created_by_id FROM main_workflowjobnode n
		JOIN main_unifiedjob u ON u.id = n.job_id JOIN main_systemjob s ON s.unifiedjob_ptr_id = u.id WHERE n.id = $1`, n).Scan(&jobType, &extra, &launch, &status, &createdBy); err != nil {
		t.Fatal(err)
	}
	if jobType != "cleanup_jobs" || extra != "" || launch != "workflow" || status != "pending" || createdBy == nil || *createdBy != user {
		t.Errorf("system job %s %q %s %s %v", jobType, extra, launch, status, createdBy)
	}
}

// The context message keeps its first 65536 characters, not bytes.
func TestContextMessageTruncatedByCharacters(t *testing.T) {
	msg := truncateContextMessage(strings.Repeat("é", contextMessageMaxLength+10))
	if !utf8.ValidString(msg) || utf8.RuneCountInString(msg) != contextMessageMaxLength {
		t.Errorf("got %d characters, valid %v", utf8.RuneCountInString(msg), utf8.ValidString(msg))
	}
	mixed := "a" + strings.Repeat("€", contextMessageMaxLength)
	if got := truncateContextMessage(mixed); got != "a"+strings.Repeat("€", contextMessageMaxLength-1) {
		t.Errorf("mixed: %d characters", utf8.RuneCountInString(got))
	}
	short := strings.Repeat("x", contextMessageMaxLength)
	if truncateContextMessage(short) != short {
		t.Error("a message at the limit was cut")
	}
}
