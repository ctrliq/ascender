package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/models"
)

// parityRig is a scratch server with an organization, an inventory and a
// project, for templates that pass resources_needed_to_start.
type parityRig struct {
	d        *dbServer
	db       *db.DB
	inv, org int64
	project  int64
}

func newParityRig(t *testing.T, name string) *parityRig {
	t.Helper()
	d, database := newScratchServer(t, name)
	inv, org := scratchInventory(t, d, name, nil)
	r := &parityRig{d: d, db: database, inv: inv, org: org}
	r.project = scratchInsert(t, database, "main_unifiedjobtemplate", map[string]any{"name": name + "-project", "status": "successful",
		"polymorphic_ctype_id": d.CT.ID("main.project"), "organization_id": org})
	scratchInsert(t, database, "main_project", map[string]any{"unifiedjobtemplate_ptr_id": r.project, "scm_type": "git", "scm_url": "https://example.invalid/zz.git",
		"local_path": "_zz", "scm_update_cache_timeout": 0, "timeout": 0})
	return r
}

const paritySurvey = `{"name": "", "description": "", "spec": [
	{"variable": "q1", "type": "text", "required": true, "question_name": "Q1", "min": 2, "max": 10},
	{"variable": "pw", "type": "password", "required": false, "question_name": "PW", "default": "$encrypted$zz", "min": 3},
	{"variable": "pw2", "type": "password", "required": false, "question_name": "PW2"}]}`

// jobTemplate inserts a job template on the rig's project and inventory.
func (r *parityRig) jobTemplate(t *testing.T, name string, set map[string]any) int64 {
	t.Helper()
	ujt := scratchInsert(t, r.db, "main_unifiedjobtemplate", map[string]any{"name": name, "status": "never updated",
		"polymorphic_ctype_id": r.d.CT.ID("main.jobtemplate"), "organization_id": r.org})
	row := map[string]any{"unifiedjobtemplate_ptr_id": ujt, "inventory_id": r.inv, "project_id": r.project, "job_type": "run", "playbook": "hello.yml",
		"survey_spec": "{}", "job_slice_count": 1, "forks": 0, "verbosity": 0, "timeout": 0}
	for k, v := range set {
		row[k] = v
	}
	scratchInsert(t, r.db, "main_jobtemplate", row)
	return ujt
}

// schedule inserts an enabled schedule of the template.
func (r *parityRig) schedule(t *testing.T, ujt int64, name, chars, extra string) int64 {
	t.Helper()
	return scratchInsert(t, r.db, "main_schedule", map[string]any{"name": name, "enabled": true, "rrule": "DTSTART:20261001T100000Z RRULE:FREQ=DAILY;INTERVAL=1",
		"unified_job_template_id": ujt, "extra_data": extra, "char_prompts": chars, "survey_passwords": "{}"})
}

// sameJSON checks a body against the JSON wanted, ignoring key order.
func sameJSON(t *testing.T, status int, body string, wantStatus int, want string) {
	t.Helper()
	var got, exp any
	if err := json.Unmarshal([]byte(body), &got); err != nil {
		t.Fatalf("got %d %s: %v", status, body, err)
	}
	if err := json.Unmarshal([]byte(want), &exp); err != nil {
		t.Fatal(err)
	}
	g, _ := json.Marshal(got)
	e, _ := json.Marshal(exp)
	if status != wantStatus || string(g) != string(e) {
		t.Fatalf("got %d %s, want %d %s", status, body, wantStatus, want)
	}
}

// LaunchConfigurationBaseSerializer.validate re-checks the prompts only
// for the prompt fields a request carries (all of them when it sets
// unified_job_template): renaming a schedule of a template with a required
// survey question is not refused, a prompt field brings the survey check
// along, and a PUT, which must name the template, sets the char prompts it
// leaves out back to null.
func TestScheduleUpdateValidatesOnlyPromptFields(t *testing.T) {
	r := newParityRig(t, "zz-sched-fields")
	d := r.d
	jt := r.jobTemplate(t, "zz-sched-fields-jt", map[string]any{"survey_enabled": true, "survey_spec": paritySurvey, "ask_limit_on_launch": true})
	sc := r.schedule(t, jt, "zz-sched-fields", `{"limit": "old"}`, "{}")
	path := fmt.Sprintf("/api/v2/schedules/%d/", sc)

	st, body := d.do("PATCH", path, map[string]any{"name": "zz-sched-renamed"})
	d.expect(st, body, http.StatusOK, "")
	st, body = d.do("PATCH", path, map[string]any{"description": "x", "enabled": false})
	d.expect(st, body, http.StatusOK, "")
	st, body = d.do("PATCH", path, map[string]any{"limit": "web"})
	sameJSON(t, st, body, http.StatusBadRequest, `{"variables_needed_to_start": ["'q1' value missing"]}`)
	st, body = d.do("PATCH", path, map[string]any{"extra_data": map[string]any{"q1": "x"}})
	sameJSON(t, st, body, http.StatusBadRequest, `{"variables_needed_to_start": ["'q1' value x is too small (length is 1 must be at least 2)."]}`)
	st, body = d.do("PATCH", path, map[string]any{"extra_data": map[string]any{"q1": "fine"}, "limit": "web"})
	d.expect(st, body, http.StatusOK, "")
	// The template switch re-validates what is stored.
	st, body = d.do("PATCH", path, map[string]any{"unified_job_template": jt})
	d.expect(st, body, http.StatusOK, "")

	put := map[string]any{"name": "zz-sched-put", "rrule": "DTSTART:20261001T100000Z RRULE:FREQ=DAILY;INTERVAL=1"}
	st, body = d.do("PUT", path, put)
	sameJSON(t, st, body, http.StatusBadRequest, `{"unified_job_template": ["This field is required."]}`)
	put["unified_job_template"] = jt
	st, body = d.do("PUT", path, put)
	d.expect(st, body, http.StatusOK, "")
	var chars string
	if err := d.Q().QueryRow(context.Background(), `SELECT char_prompts::text FROM main_schedule WHERE id = $1`, sc).Scan(&chars); err != nil {
		t.Fatal(err)
	}
	if chars != "{}" {
		t.Errorf("char_prompts after PUT: %s, want {}", chars)
	}
}

// $encrypted$ for a password answer with nothing stored is accepted when
// the question has a default (the key is dropped and the default
// applies), and refused otherwise; an encrypted stored answer is checked
// decrypted.
func TestSchedulePasswordPlaceholderDefault(t *testing.T) {
	r := newParityRig(t, "zz-sched-pw")
	d := r.d
	jt := r.jobTemplate(t, "zz-sched-pw-jt", map[string]any{"survey_enabled": true, "survey_spec": paritySurvey})
	sc := r.schedule(t, jt, "zz-sched-pw", "{}", "{}")
	path := fmt.Sprintf("/api/v2/schedules/%d/", sc)

	st, body := d.do("PATCH", path, map[string]any{"extra_data": map[string]any{"q1": "fine", "pw": "$encrypted$"}})
	d.expect(st, body, http.StatusOK, "")
	var extra, passwords string
	if err := d.Q().QueryRow(context.Background(), `SELECT extra_data, survey_passwords::text FROM main_schedule WHERE id = $1`, sc).Scan(&extra, &passwords); err != nil {
		t.Fatal(err)
	}
	if extra != `{"q1":"fine"}` || passwords != "{}" {
		t.Errorf("stored extra_data %s survey_passwords %s", extra, passwords)
	}
	st, body = d.do("PATCH", path, map[string]any{"extra_data": map[string]any{"q1": "fine", "pw2": "$encrypted$"}})
	sameJSON(t, st, body, http.StatusBadRequest, `{"extra_data": ["Provided variable pw2 has no database value to replace with."]}`)
	// A new answer is encrypted, validated as given, and kept by a later
	// placeholder.
	st, body = d.do("PATCH", path, map[string]any{"extra_data": map[string]any{"q1": "fine", "pw": "ab"}})
	sameJSON(t, st, body, http.StatusBadRequest, `{"variables_needed_to_start": ["'pw' value ab is too small (length is 2 must be at least 3)."]}`)
	st, body = d.do("PATCH", path, map[string]any{"extra_data": map[string]any{"q1": "fine", "pw": "abcd"}})
	d.expect(st, body, http.StatusOK, "")
	st, body = d.do("PATCH", path, map[string]any{"extra_data": map[string]any{"q1": "other", "pw": "$encrypted$"}})
	d.expect(st, body, http.StatusOK, "")
	var stored map[string]any
	if err := d.Q().QueryRow(context.Background(), `SELECT extra_data::jsonb FROM main_schedule WHERE id = $1`, sc).Scan(&stored); err != nil {
		t.Fatal(err)
	}
	pw, _ := stored["pw"].(string)
	if dec, err := d.decryptSurveyDefault(pw); err != nil || dec != "abcd" {
		t.Errorf("stored pw %q decrypts to %q, %v", pw, dec, err)
	}
}

// The templates without prompts refuse every field with their own words:
// UnifiedJobTemplate's "Field is not allowed on launch." and the system
// job template's variable rules; a workflow job template ignores the
// prompts it has no ask flag for.
func TestScheduleTemplateKindsPromptErrors(t *testing.T) {
	r := newParityRig(t, "zz-sched-kinds")
	d := r.d
	psc := r.schedule(t, r.project, "zz-sched-kinds-project", "{}", "{}")
	st, body := d.do("PATCH", fmt.Sprintf("/api/v2/schedules/%d/", psc), map[string]any{"limit": "web", "extra_data": map[string]any{"a": 1}})
	sameJSON(t, st, body, http.StatusBadRequest, `{"limit": ["Field is not allowed on launch."], "extra_data": ["Field is not allowed on launch."]}`)

	sjt := scratchInsert(t, r.db, "main_unifiedjobtemplate", map[string]any{"name": "zz-sched-kinds-sjt", "status": "never updated", "polymorphic_ctype_id": d.CT.ID("main.systemjobtemplate")})
	scratchInsert(t, r.db, "main_systemjobtemplate", map[string]any{"unifiedjobtemplate_ptr_id": sjt, "job_type": "cleanup_jobs"})
	ssc := r.schedule(t, sjt, "zz-sched-kinds-sjt", "{}", "{}")
	spath := fmt.Sprintf("/api/v2/schedules/%d/", ssc)
	st, body = d.do("PATCH", spath, map[string]any{"extra_data": map[string]any{"days": "x", "bogus": 1}})
	sameJSON(t, st, body, http.StatusBadRequest, `{"extra_data": ["Variables bogus are not allowed for system jobs.", "days must be a positive integer."]}`)
	for _, days := range []any{30, "30", 1.0} {
		st, body = d.do("PATCH", spath, map[string]any{"extra_data": map[string]any{"days": days}})
		d.expect(st, body, http.StatusOK, "")
	}
	for _, days := range []any{-1, "1.5", true, 2.5} {
		st, body = d.do("PATCH", spath, map[string]any{"extra_data": map[string]any{"days": days}})
		sameJSON(t, st, body, http.StatusBadRequest, `{"extra_data": ["days must be a positive integer."]}`)
	}
	st, body = d.do("PATCH", spath, map[string]any{"verbosity": 1})
	sameJSON(t, st, body, http.StatusBadRequest, `{"verbosity": ["Field is not allowed on launch."]}`)

	wfjt := scratchInsert(t, r.db, "main_unifiedjobtemplate", map[string]any{"name": "zz-sched-kinds-wfjt", "status": "never updated",
		"polymorphic_ctype_id": d.CT.ID("main.workflowjobtemplate"), "organization_id": r.org})
	scratchInsert(t, r.db, "main_workflowjobtemplate", map[string]any{"unifiedjobtemplate_ptr_id": wfjt, "survey_spec": "{}", "char_prompts": "{}"})
	wsc := r.schedule(t, wfjt, "zz-sched-kinds-wfjt", "{}", "{}")
	st, body = d.do("PATCH", fmt.Sprintf("/api/v2/schedules/%d/", wsc), map[string]any{"job_type": "check"})
	d.expect(st, body, http.StatusOK, "")
	st, body = d.do("PATCH", fmt.Sprintf("/api/v2/schedules/%d/", wsc), map[string]any{"limit": "x"})
	sameJSON(t, st, body, http.StatusBadRequest, `{"limit": ["Field is not configured to prompt on launch."]}`)
}

// A workflow node's update re-checks only the prompt fields it carries,
// leaving out missing required answers the workflow may provide.
func TestWorkflowNodeUpdateValidatesOnlyPromptFields(t *testing.T) {
	r := newParityRig(t, "zz-node-fields")
	d := r.d
	jt := r.jobTemplate(t, "zz-node-fields-jt", map[string]any{"survey_enabled": true, "survey_spec": paritySurvey})
	st, body := d.do("POST", "/api/v2/workflow_job_templates/", map[string]any{"name": "zz-node-fields-wf", "organization": r.org})
	d.expect(st, body, http.StatusCreated, "")
	wf := d.id(body)
	st, body = d.do("POST", fmt.Sprintf("/api/v2/workflow_job_templates/%d/workflow_nodes/", wf), map[string]any{"unified_job_template": jt})
	d.expect(st, body, http.StatusCreated, "")
	node := d.id(body)
	path := fmt.Sprintf("/api/v2/workflow_job_template_nodes/%d/", node)
	st, body = d.do("PATCH", path, map[string]any{"identifier": "zz-renamed"})
	d.expect(st, body, http.StatusOK, "")
	st, body = d.do("PATCH", path, map[string]any{"limit": "web"})
	sameJSON(t, st, body, http.StatusBadRequest, `{"limit": ["Field is not configured to prompt on launch."]}`)
	st, body = d.do("PATCH", path, map[string]any{"extra_data": map[string]any{"q1": "x"}})
	sameJSON(t, st, body, http.StatusBadRequest, `{"variables_needed_to_start": ["'q1' value x is too small (length is 1 must be at least 2)."]}`)
	st, body = d.do("PATCH", path, map[string]any{"extra_data": map[string]any{"pw": "$encrypted$"}})
	d.expect(st, body, http.StatusOK, "")
}

// None of the launch fields allows null, on a job template launch, a
// workflow launch (which reads only its own fields), a job relaunch
// (whose hosts may be null) or an ad hoc command.
func TestLaunchRefusesNull(t *testing.T) {
	r := newParityRig(t, "zz-launch-null")
	d := r.d
	jt := r.jobTemplate(t, "zz-launch-null-jt", nil)
	st, body := d.do("POST", fmt.Sprintf("/api/v2/job_templates/%d/launch/", jt), map[string]any{"limit": nil, "scm_branch": nil, "job_tags": nil, "skip_tags": nil,
		"extra_vars": nil, "inventory": nil, "execution_environment": nil, "credentials": nil, "labels": nil, "instance_groups": nil, "job_type": nil,
		"verbosity": nil, "diff_mode": nil, "forks": nil, "job_slice_count": nil, "timeout": nil, "credential_passwords": nil, "bogus": nil})
	null := `["This field may not be null."]`
	sameJSON(t, st, body, http.StatusBadRequest, `{"limit": `+null+`, "scm_branch": `+null+`, "job_tags": `+null+`, "skip_tags": `+null+`, "extra_vars": `+null+
		`, "inventory": `+null+`, "execution_environment": `+null+`, "credentials": `+null+`, "labels": `+null+`, "instance_groups": `+null+`, "job_type": `+null+
		`, "verbosity": `+null+`, "diff_mode": `+null+`, "forks": `+null+`, "job_slice_count": `+null+`, "timeout": `+null+`, "credential_passwords": `+null+`}`)
	st, body = d.do("POST", fmt.Sprintf("/api/v2/job_templates/%d/launch/", jt), map[string]any{"inventory_id": nil})
	sameJSON(t, st, body, http.StatusBadRequest, `{"inventory": `+null+`}`)

	st, body = d.do("POST", "/api/v2/workflow_job_templates/", map[string]any{"name": "zz-launch-null-wf", "organization": r.org})
	d.expect(st, body, http.StatusCreated, "")
	wf := d.id(body)
	st, body = d.do("POST", fmt.Sprintf("/api/v2/workflow_job_templates/%d/launch/", wf), map[string]any{"limit": nil, "job_type": nil, "verbosity": "bogus"})
	sameJSON(t, st, body, http.StatusBadRequest, `{"limit": `+null+`}`)

	st, body = d.do("POST", "/api/v2/ad_hoc_commands/", map[string]any{"inventory": r.inv, "module_name": "ping", "limit": nil, "module_args": nil, "extra_vars": nil, "verbosity": nil, "instance_groups": nil})
	sameJSON(t, st, body, http.StatusBadRequest, `{"limit": `+null+`, "module_args": `+null+`, "extra_vars": `+null+`, "verbosity": `+null+`, "instance_groups": `+null+`}`)
}

// Relaunch by host status answers {"hosts": "..."} (a string, not a
// list); null hosts relaunch as "all"; credential_passwords may not be
// null.
func TestJobRelaunchHostsShapes(t *testing.T) {
	r := newParityRig(t, "zz-relaunch-hosts")
	d := r.d
	job := scratchJob(t, d, r.db, "job", r.inv, "successful", nil, 0)
	if _, err := d.Q().Exec(context.Background(), `UPDATE main_job SET project_id = $1 WHERE unifiedjob_ptr_id = $2`, r.project, job); err != nil {
		t.Fatal(err)
	}
	path := fmt.Sprintf("/api/v2/jobs/%d/relaunch/", job)
	st, body := d.do("POST", path, map[string]any{"hosts": "failed"})
	d.expect(st, body, http.StatusBadRequest, `{"hosts":"Cannot retry on failed hosts, playbook stats not available."}`)
	st, body = d.do("POST", path, map[string]any{"credential_passwords": nil})
	sameJSON(t, st, body, http.StatusBadRequest, `{"credential_passwords": ["This field may not be null."]}`)
	if _, err := d.Q().Exec(context.Background(), `UPDATE main_unifiedjob SET status = 'running' WHERE id = $1`, job); err != nil {
		t.Fatal(err)
	}
	st, body = d.do("POST", path, map[string]any{"hosts": "failed"})
	d.expect(st, body, http.StatusBadRequest, `{"hosts":"Wait until job finishes before retrying on failed hosts."}`)
	st, body = d.do("POST", path, map[string]any{"hosts": nil})
	d.expect(st, body, http.StatusCreated, "")
}

// A relaunch's survey errors are the body itself, not under detail; a
// non-string, non-mapping extra_vars gets parse_yaml_or_json's message.
func TestWorkflowRelaunchVariableErrors(t *testing.T) {
	r := newParityRig(t, "zz-wf-relaunch-vars")
	d := r.d
	ctx := context.Background()
	wfjt := scratchInsert(t, r.db, "main_unifiedjobtemplate", map[string]any{"name": "zz-wf-relaunch-vars", "status": "never updated",
		"polymorphic_ctype_id": d.CT.ID("main.workflowjobtemplate"), "organization_id": r.org})
	scratchInsert(t, r.db, "main_workflowjobtemplate", map[string]any{"unifiedjobtemplate_ptr_id": wfjt, "survey_spec": paritySurvey, "survey_enabled": true, "char_prompts": "{}"})
	wj := &models.WorkflowJob{WorkflowJobTemplateID: &wfjt, AllowOverwriteFlowVarsOnRelaunch: true}
	body := NewOMap().Set("extra_vars", NewOMap().Set("q1", "x"))
	_, err := d.relaunchExtraVars(ctx, body, wj, true)
	var apiErr *APIError
	if !errors.As(err, &apiErr) || apiErr.Status != http.StatusBadRequest {
		t.Fatalf("got %v", err)
	}
	b, _ := json.Marshal(apiErr.Body)
	if string(b) != `{"variables_needed_to_start":["'q1' value x is too small (length is 1 must be at least 2)."]}` {
		t.Errorf("body %s", b)
	}
	for v, tn := range map[any]string{nil: "NoneType", true: "bool"} {
		_, err = d.relaunchExtraVars(ctx, NewOMap().Set("extra_vars", v), wj, true)
		if !errors.As(err, &apiErr) {
			t.Fatalf("got %v", err)
		}
		b, _ = json.Marshal(apiErr.Body)
		want := fmt.Sprintf(`{"detail":"Cannot parse as JSON (error: the JSON object must be str, bytes or bytearray, not %s) or YAML (error: '%s' object has no attribute 'read')."}`, tn, tn)
		if string(b) != want {
			t.Errorf("body %s, want %s", b, want)
		}
	}
}

// A job (current or a retried attempt), project update, inventory update,
// workflow job or approval of a node of a running workflow is not deleted;
// the other UnifiedJobDeletionMixin checks apply to every kind.
func TestUnifiedJobDeleteWhileWorkflowRuns(t *testing.T) {
	r := newParityRig(t, "zz-wf-delete")
	d := r.d
	database := r.db
	ctx := context.Background()
	done := time.Now().Add(-time.Hour)
	wf := scratchUnifiedJob(t, d, database, "main.workflowjob", "main_workflowjob", map[string]any{"extra_vars": "{}", "char_prompts": "{}", "survey_passwords": "{}"}, "running", nil, 0)
	node := func(job int64) int64 {
		return scratchInsert(t, database, "main_workflowjobnode", map[string]any{"workflow_job_id": wf, "job_id": job, "ancestor_artifacts": "{}", "extra_data": "{}",
			"char_prompts": "{}", "survey_passwords": "{}", "identifier": fmt.Sprintf("zz-%d", job)})
	}
	job := scratchJob(t, d, database, "job", r.inv, "successful", &done, 0)
	retried := scratchJob(t, d, database, "job", r.inv, "failed", &done, 0)
	n := node(job)
	scratchInsert(t, database, "main_workflowjobnode_retried_jobs", map[string]any{"workflowjobnode_id": n, "unifiedjob_id": retried})
	pu := scratchUnifiedJob(t, d, database, "main.projectupdate", "main_projectupdate", map[string]any{"project_id": r.project, "job_type": "check"}, "successful", &done, 0)
	node(pu)
	iu := scratchJob(t, d, database, "inventoryupdate", r.inv, "successful", &done, 0)
	node(iu)
	inner := scratchUnifiedJob(t, d, database, "main.workflowjob", "main_workflowjob", map[string]any{"extra_vars": "{}", "char_prompts": "{}", "survey_passwords": "{}"}, "successful", &done, 0)
	node(inner)
	appr := scratchUnifiedJob(t, d, database, "main.workflowapproval", "main_workflowapproval", map[string]any{"context_message": "", "on_timeout": "deny", "required_approvals": 1}, "successful", &done, 0)
	node(appr)
	paths := []string{fmt.Sprintf("/api/v2/jobs/%d/", job), fmt.Sprintf("/api/v2/jobs/%d/", retried), fmt.Sprintf("/api/v2/project_updates/%d/", pu),
		fmt.Sprintf("/api/v2/inventory_updates/%d/", iu), fmt.Sprintf("/api/v2/workflow_jobs/%d/", inner), fmt.Sprintf("/api/v2/workflow_approvals/%d/", appr)}
	for _, p := range paths {
		st, body := d.do("DELETE", p, nil)
		d.expect(st, body, http.StatusForbidden, `{"detail":"Cannot delete job resource when associated workflow job is running."}`)
	}
	// A new project update may go; one that just finished without all of
	// its events may not.
	newPU := scratchUnifiedJob(t, d, database, "main.projectupdate", "main_projectupdate", map[string]any{"project_id": r.project, "job_type": "check"}, "new", nil, 0)
	st, body := d.do("DELETE", fmt.Sprintf("/api/v2/project_updates/%d/", newPU), nil)
	d.expect(st, body, http.StatusNoContent, "")
	now := time.Now()
	fresh := scratchUnifiedJob(t, d, database, "main.projectupdate", "main_projectupdate", map[string]any{"project_id": r.project, "job_type": "check"}, "successful", &now, 3)
	st, body = d.do("DELETE", fmt.Sprintf("/api/v2/project_updates/%d/", fresh), nil)
	d.expect(st, body, http.StatusBadRequest, `{"error":"Job has not finished processing events."}`)

	if _, err := d.Q().Exec(ctx, `UPDATE main_unifiedjob SET status = 'successful', finished = now() WHERE id = $1`, wf); err != nil {
		t.Fatal(err)
	}
	for _, p := range paths {
		st, body := d.do("DELETE", p, nil)
		d.expect(st, body, http.StatusNoContent, "")
	}
}

// Workflow labels do not reach the jobs of a workflow's nodes; a sliced
// job's launch config keeps its labels.
func TestWorkflowJobPromptsDropLabels(t *testing.T) {
	r := newParityRig(t, "zz-wf-labels")
	d := r.d
	ctx := context.Background()
	label := scratchInsert(t, r.db, "main_label", map[string]any{"name": "zz-wf-label", "organization_id": r.org})
	wf := scratchUnifiedJob(t, d, r.db, "main.workflowjob", "main_workflowjob", map[string]any{"extra_vars": "{}", "char_prompts": "{}", "survey_passwords": "{}"}, "running", nil, 0)
	scratchInsert(t, r.db, "main_unifiedjob_labels", map[string]any{"unifiedjob_id": wf, "label_id": label})
	wj, err := models.GetWorkflowJob(ctx, d.Q(), wf)
	if err != nil {
		t.Fatal(err)
	}
	p, err := d.workflowJobPrompts(ctx, wj)
	if err != nil {
		t.Fatal(err)
	}
	if p.Labels != nil {
		t.Errorf("workflow labels passed on: %v", p.Labels)
	}
}

// SCHEDULE_MAX_JOBS holds back a job template schedule while that many of
// its jobs wait; a scheduled job that needs passwords is failed with the
// old explanation (its spaces included) and a finish time.
func TestScheduledJobLimitsAndFailure(t *testing.T) {
	r := newParityRig(t, "zz-sched-launch")
	d := r.d
	ctx := context.Background()
	jt := r.jobTemplate(t, "zz-sched-launch-jt", nil)
	sc := r.schedule(t, jt, "zz-sched-launch", "{}", "{}")
	tmpl, err := models.GetJobTemplate(ctx, d.Q(), jt)
	if err != nil {
		t.Fatal(err)
	}
	var schedRow *schedule
	rows, err := d.Q().Query(ctx, `SELECT `+scheduleColumns+` FROM main_schedule sc WHERE sc.id = $1`, sc)
	if err != nil {
		t.Fatal(err)
	}
	for rows.Next() {
		v, err := scanSchedule(rows)
		if err != nil {
			t.Fatal(err)
		}
		schedRow = v.(*schedule)
	}
	rows.Close()
	count := func() int64 {
		var n int64
		if err := d.Q().QueryRow(ctx, `SELECT count(*) FROM main_job WHERE job_template_id = $1`, jt).Scan(&n); err != nil {
			t.Fatal(err)
		}
		return n
	}
	for i := 0; i < 10; i++ {
		id := scratchJob(t, d, r.db, "job", r.inv, "pending", nil, 0)
		if _, err := d.Q().Exec(ctx, `UPDATE main_job SET job_template_id = $1 WHERE unifiedjob_ptr_id = $2`, jt, id); err != nil {
			t.Fatal(err)
		}
	}
	if err := d.launchScheduledJob(ctx, schedRow, tmpl); err != nil {
		t.Fatal(err)
	}
	if n := count(); n != 10 {
		t.Fatalf("%d jobs after a blocked schedule, want 10", n)
	}
	if _, err := d.Q().Exec(ctx, `UPDATE main_unifiedjob SET status = 'successful' WHERE id IN (SELECT unifiedjob_ptr_id FROM main_job WHERE job_template_id = $1)`, jt); err != nil {
		t.Fatal(err)
	}
	// A machine credential that asks for its password at launch.
	ctype := scratchInsert(t, r.db, "main_credentialtype", map[string]any{"name": "zz-machine", "kind": "ssh", "namespace": "ssh", "managed": true,
		"inputs": `{"fields": [{"id": "password", "label": "Password", "type": "string", "secret": true, "ask_at_runtime": true}]}`, "injectors": "{}"})
	cred := scratchInsert(t, r.db, "main_credential", map[string]any{"name": "zz-machine-cred", "credential_type_id": ctype, "inputs": `{"password": "ASK"}`, "organization_id": r.org})
	scratchInsert(t, r.db, "main_unifiedjobtemplate_credentials", map[string]any{"unifiedjobtemplate_id": jt, "credential_id": cred})
	if err := d.launchScheduledJob(ctx, schedRow, tmpl); err != nil {
		t.Fatal(err)
	}
	var status, explanation string
	var finished *time.Time
	if err := d.Q().QueryRow(ctx, `SELECT u.status, u.job_explanation, u.finished FROM main_unifiedjob u JOIN main_job j ON j.unifiedjob_ptr_id = u.id
		WHERE j.job_template_id = $1 ORDER BY u.id DESC LIMIT 1`, jt).Scan(&status, &explanation, &finished); err != nil {
		t.Fatal(err)
	}
	want := "Scheduled job could not start because it " + strings.Repeat(" ", 20) + "was not in the right state or required manual credentials"
	if status != "failed" || explanation != want || finished == nil {
		t.Errorf("got %s %q finished %v", status, explanation, finished)
	}
}

// A bulk launch's workflow job is readable and cancelable by the user who
// made it; the workflow job list shows organization admins (direct ones
// only) the bulk jobs of their organization and nothing else of it, and
// only superusers may delete a job without a workflow job template.
func TestBulkWorkflowJobAccess(t *testing.T) {
	r := newParityRig(t, "zz-bulk-access")
	d := r.d
	ctx := context.Background()
	maker := zzPlainUser(t, d, "zz-bulk-maker")
	admin := zzPlainUser(t, d, "zz-bulk-admin")
	auditor := zzPlainUser(t, d, "zz-bulk-auditor")
	grantTo(t, d, admin.ID, `SELECT admin_role_id FROM main_organization WHERE id = $1`, r.org)
	grantTo(t, d, auditor.ID, `SELECT auditor_role_id FROM main_organization WHERE id = $1`, r.org)
	wjRow := map[string]any{"extra_vars": "{}", "char_prompts": "{}", "survey_passwords": "{}"}
	bulk := scratchUnifiedJob(t, d, r.db, "main.workflowjob", "main_workflowjob", wjRow, "running", nil, 0)
	orphan := scratchUnifiedJob(t, d, r.db, "main.workflowjob", "main_workflowjob", wjRow, "running", nil, 0)
	if _, err := d.Q().Exec(ctx, `UPDATE main_workflowjob SET is_bulk_job = true WHERE unifiedjob_ptr_id = $1`, bulk); err != nil {
		t.Fatal(err)
	}
	if _, err := d.Q().Exec(ctx, `UPDATE main_unifiedjob SET organization_id = $1, created_by_id = $2 WHERE id = ANY($3)`, r.org, maker.ID, []int64{bulk, orphan}); err != nil {
		t.Fatal(err)
	}
	listIDs := func() string {
		st, body := d.do("GET", "/api/v2/workflow_jobs/?order_by=id", nil)
		d.expect(st, body, http.StatusOK, "")
		var page struct {
			Results []struct {
				ID int64 `json:"id"`
			} `json:"results"`
		}
		_ = json.Unmarshal([]byte(body), &page)
		var ids []string
		for _, res := range page.Results {
			ids = append(ids, fmt.Sprint(res.ID))
		}
		return strings.Join(ids, ",")
	}
	detail := fmt.Sprintf("/api/v2/workflow_jobs/%d/", bulk)
	as(d, maker, func() {
		st, body := d.do("GET", detail, nil)
		d.expect(st, body, http.StatusOK, "")
		var o struct {
			SummaryFields struct {
				UserCapabilities map[string]bool `json:"user_capabilities"`
			} `json:"summary_fields"`
		}
		_ = json.Unmarshal([]byte(body), &o)
		if o.SummaryFields.UserCapabilities["start"] || o.SummaryFields.UserCapabilities["delete"] {
			t.Errorf("capabilities %v", o.SummaryFields.UserCapabilities)
		}
		if got := listIDs(); got != "" {
			t.Errorf("maker lists %q", got)
		}
		st, body = d.do("GET", fmt.Sprintf("/api/v2/workflow_jobs/%d/", orphan), nil)
		d.expect(st, body, http.StatusForbidden, "")
		st, body = d.do("POST", detail+"cancel/", nil)
		d.expect(st, body, http.StatusAccepted, "")
		// The creator may cancel without reading; a finished job is 403.
		st, body = d.do("POST", fmt.Sprintf("/api/v2/workflow_jobs/%d/cancel/", orphan), nil)
		d.expect(st, body, http.StatusAccepted, "")
	})
	as(d, admin, func() {
		if got := listIDs(); got != fmt.Sprint(bulk) {
			t.Errorf("admin lists %q, want %d", got, bulk)
		}
		st, body := d.do("DELETE", detail, nil)
		d.expect(st, body, http.StatusForbidden, "")
	})
	as(d, auditor, func() {
		if got := listIDs(); got != "" {
			t.Errorf("auditor lists %q", got)
		}
		st, body := d.do("GET", detail, nil)
		d.expect(st, body, http.StatusForbidden, "")
	})
	if _, err := d.Q().Exec(ctx, `UPDATE main_unifiedjob SET status = 'successful', cancel_flag = false WHERE id = $1`, bulk); err != nil {
		t.Fatal(err)
	}
	as(d, maker, func() {
		st, body := d.do("POST", detail+"cancel/", nil)
		d.expect(st, body, http.StatusForbidden, "")
	})
	st, body := d.do("POST", detail+"cancel/", nil)
	d.expect(st, body, http.StatusMethodNotAllowed, "")
}

// nodeCarriedState carries forward the merged artifacts of a nested
// workflow's jobs (get_effective_artifacts), not only main_job's.
func TestRelaunchCarriesNestedWorkflowArtifacts(t *testing.T) {
	r := newParityRig(t, "zz-carry-nested")
	d := r.d
	ctx := context.Background()
	wjRow := map[string]any{"extra_vars": "{}", "char_prompts": "{}", "survey_passwords": "{}"}
	outer := scratchUnifiedJob(t, d, r.db, "main.workflowjob", "main_workflowjob", wjRow, "failed", nil, 0)
	inner := scratchUnifiedJob(t, d, r.db, "main.workflowjob", "main_workflowjob", wjRow, "successful", nil, 0)
	nodeRow := func(wf, job int64) map[string]any {
		return map[string]any{"workflow_job_id": wf, "job_id": job, "ancestor_artifacts": `{"from": "parent"}`, "extra_data": "{}", "char_prompts": "{}", "survey_passwords": "{}"}
	}
	t0 := time.Now().Add(-time.Hour)
	for i, art := range []string{`{"a": 1, "x": "first"}`, `{"a": 2}`} {
		fin := t0.Add(time.Duration(i) * time.Minute)
		j := scratchJob(t, d, r.db, "job", r.inv, "successful", &fin, 0)
		if _, err := d.Q().Exec(ctx, `UPDATE main_job SET artifacts = $2 WHERE unifiedjob_ptr_id = $1`, j, art); err != nil {
			t.Fatal(err)
		}
		scratchInsert(t, r.db, "main_workflowjobnode", nodeRow(inner, j))
	}
	n := scratchInsert(t, r.db, "main_workflowjobnode", nodeRow(outer, inner))
	err := d.DB.Tx(ctx, func(tx pgx.Tx) error {
		st, err := nodeCarriedState(ctx, tx, n, nil, d.user.ID, "")
		if err != nil {
			return err
		}
		b, _ := json.Marshal(st.Artifacts)
		if string(b) != `{"a":2,"from":"parent","x":"first"}` {
			t.Errorf("carried %s", b)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}
