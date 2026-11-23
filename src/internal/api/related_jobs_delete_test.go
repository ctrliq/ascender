package api

import (
	"context"
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/models"
)

// scratchUnifiedJob inserts a unified job of the content type given and
// its child row, with the status, finish time and emitted event count
// given, and returns its id.
func scratchUnifiedJob(t *testing.T, d *dbServer, database *db.DB, model, table string, child map[string]any, status string, finished *time.Time, emitted int) int64 {
	t.Helper()
	uj := map[string]any{"polymorphic_ctype_id": d.CT.ID(model), "status": status, "emitted_events": emitted, "name": "zz-" + table, "launch_type": "manual"}
	if finished != nil {
		uj["finished"] = *finished
	}
	id := scratchInsert(t, database, "main_unifiedjob", uj)
	row := map[string]any{"unifiedjob_ptr_id": id}
	for k, v := range child {
		row[k] = v
	}
	scratchInsert(t, database, table, row)
	return id
}

// ProjectDetail and OrganizationDetail used RelatedJobsPreventDeleteMixin:
// a 409 that lists the active related jobs (a project's jobs and project
// updates; the unified jobs of an organization), then a 403 for a related
// job that finished in the last minute without all of its events saved.
func TestProjectOrganizationDeleteRelatedJobs(t *testing.T) {
	d, database := newScratchServer(t, "zz-project-org-delete-test")
	ctx := context.Background()
	inv, org := scratchInventory(t, d, "zz-projdel", nil)
	project := func(name string) *models.Project {
		p := &models.Project{Name: name, OrganizationID: &org}
		if err := d.DB.Tx(ctx, func(tx pgx.Tx) error {
			return models.InsertProject(ctx, tx, p, d.CT, d.Roles, func(id int64) *models.Organization {
				o, _ := models.GetOrganization(ctx, tx, id)
				return o
			})
		}); err != nil {
			t.Fatal(err)
		}
		return p
	}
	p, other := project("zz-projdel-project"), project("zz-projdel-other")
	job := scratchJob(t, d, database, "job", inv, "running", nil, 0)
	if _, err := d.Q().Exec(ctx, `UPDATE main_job SET project_id = $1 WHERE unifiedjob_ptr_id = $2`, p.ID, job); err != nil {
		t.Fatal(err)
	}
	upd := scratchUnifiedJob(t, d, database, "main.projectupdate", "main_projectupdate", map[string]any{"project_id": p.ID, "job_type": "check"}, "pending", nil, 0)
	// Another project's update is not related.
	scratchUnifiedJob(t, d, database, "main.projectupdate", "main_projectupdate", map[string]any{"project_id": other.ID, "job_type": "check"}, "running", nil, 0)

	path := fmt.Sprintf("/api/v2/projects/%d/", p.ID)
	st, body := d.do("DELETE", path, nil)
	d.expect(st, body, http.StatusConflict, fmt.Sprintf(`{"error":"Resource is being used by running jobs.","active_jobs":[{"id":%d,"type":"job"},{"id":%d,"type":"project_update"}]}`, job, upd))
	if _, err := d.Q().Exec(ctx, `UPDATE main_unifiedjob SET status = 'successful', finished = now() WHERE id = ANY($1)`, []int64{job, upd}); err != nil {
		t.Fatal(err)
	}
	if _, err := d.Q().Exec(ctx, `UPDATE main_unifiedjob SET emitted_events = 2 WHERE id = $1`, upd); err != nil {
		t.Fatal(err)
	}
	st, body = d.do("DELETE", path, nil)
	d.expect(st, body, http.StatusForbidden, fmt.Sprintf(`{"detail":"Related job project_update %d (successful) is still processing events."}`, upd))

	// The organization: every unified job that names it, whatever its kind.
	if _, err := d.Q().Exec(ctx, `UPDATE main_unifiedjob SET organization_id = $1 WHERE id = ANY($2)`, org, []int64{job, upd}); err != nil {
		t.Fatal(err)
	}
	if _, err := d.Q().Exec(ctx, `UPDATE main_unifiedjob SET status = 'waiting', finished = NULL WHERE id = $1`, job); err != nil {
		t.Fatal(err)
	}
	orgPath := fmt.Sprintf("/api/v2/organizations/%d/", org)
	st, body = d.do("DELETE", orgPath, nil)
	d.expect(st, body, http.StatusConflict, fmt.Sprintf(`{"error":"Resource is being used by running jobs.","active_jobs":[{"id":%d,"type":"job"}]}`, job))
	if _, err := d.Q().Exec(ctx, `UPDATE main_unifiedjob SET status = 'failed', finished = now() WHERE id = $1`, job); err != nil {
		t.Fatal(err)
	}
	st, body = d.do("DELETE", orgPath, nil)
	d.expect(st, body, http.StatusForbidden, fmt.Sprintf(`{"detail":"Related job project_update %d (successful) is still processing events."}`, upd))

	// Older than a minute, the project and then the organization go.
	if _, err := d.Q().Exec(ctx, `UPDATE main_unifiedjob SET finished = now() - interval '2 minutes' WHERE id = ANY($1)`, []int64{job, upd}); err != nil {
		t.Fatal(err)
	}
	st, body = d.do("DELETE", path, nil)
	d.expect(st, body, http.StatusNoContent, "")
	st, body = d.do("DELETE", orgPath, nil)
	d.expect(st, body, http.StatusNoContent, "")
}

// The other detail views with RelatedJobsPreventDeleteMixin gained its 403
// for a related job still saving its events, over the related jobs their
// models defined: a job template's jobs, an inventory source's updates, an
// instance group's jobs and a workflow job template's workflow jobs (which
// have no events, so never wait for them).
func TestTemplateDeleteRelatedJobs(t *testing.T) {
	d, database := newScratchServer(t, "zz-template-delete-test")
	ctx := context.Background()
	inv, _ := scratchInventory(t, d, "zz-tpldel", nil)
	now := time.Now()

	jt := zzJobTemplate(t, d, "zz-tpldel-jt")
	job := scratchJob(t, d, database, "job", inv, "running", nil, 0)
	if _, err := d.Q().Exec(ctx, `UPDATE main_unifiedjob SET unified_job_template_id = $1 WHERE id = $2`, jt.ID, job); err != nil {
		t.Fatal(err)
	}
	jtPath := fmt.Sprintf("/api/v2/job_templates/%d/", jt.ID)
	st, body := d.do("DELETE", jtPath, nil)
	d.expect(st, body, http.StatusConflict, fmt.Sprintf(`{"error":"Resource is being used by running jobs.","active_jobs":[{"id":%d,"type":"job"}]}`, job))
	if _, err := d.Q().Exec(ctx, `UPDATE main_unifiedjob SET status = 'successful', finished = now(), emitted_events = 1 WHERE id = $1`, job); err != nil {
		t.Fatal(err)
	}
	st, body = d.do("DELETE", jtPath, nil)
	d.expect(st, body, http.StatusForbidden, fmt.Sprintf(`{"detail":"Related job job %d (successful) is still processing events."}`, job))
	scratchEvent(t, d, database, "main_jobevent", "job_id", job, map[string]any{"event": "runner_on_ok", "counter": 1, "event_data": "{}"})
	st, body = d.do("DELETE", jtPath, nil)
	d.expect(st, body, http.StatusNoContent, "")

	upd := scratchJob(t, d, database, "inventoryupdate", inv, "successful", &now, 4)
	var src int64
	if err := d.Q().QueryRow(ctx, `SELECT inventory_source_id FROM main_inventoryupdate WHERE unifiedjob_ptr_id = $1`, upd).Scan(&src); err != nil {
		t.Fatal(err)
	}
	st, body = d.do("DELETE", fmt.Sprintf("/api/v2/inventory_sources/%d/", src), nil)
	d.expect(st, body, http.StatusForbidden, fmt.Sprintf(`{"detail":"Related job inventory_update %d (successful) is still processing events."}`, upd))

	st, body = d.do("POST", "/api/v2/instance_groups/", map[string]any{"name": "zz-tpldel-ig"})
	d.expect(st, body, http.StatusCreated, "")
	ig := d.id(body)
	igJob := scratchJob(t, d, database, "job", inv, "error", &now, 1)
	if _, err := d.Q().Exec(ctx, `UPDATE main_unifiedjob SET instance_group_id = $1 WHERE id = $2`, ig, igJob); err != nil {
		t.Fatal(err)
	}
	st, body = d.do("DELETE", fmt.Sprintf("/api/v2/instance_groups/%d/", ig), nil)
	d.expect(st, body, http.StatusForbidden, fmt.Sprintf(`{"detail":"Related job job %d (error) is still processing events."}`, igJob))

	st, body = d.do("POST", "/api/v2/workflow_job_templates/", map[string]any{"name": "zz-tpldel-wfjt"})
	d.expect(st, body, http.StatusCreated, "")
	wfjt := d.id(body)
	wj := scratchUnifiedJob(t, d, database, "main.workflowjob", "main_workflowjob", map[string]any{"workflow_job_template_id": wfjt}, "running", nil, 0)
	wfPath := fmt.Sprintf("/api/v2/workflow_job_templates/%d/", wfjt)
	st, body = d.do("DELETE", wfPath, nil)
	d.expect(st, body, http.StatusConflict, fmt.Sprintf(`{"error":"Resource is being used by running jobs.","active_jobs":[{"id":%d,"type":"workflow_job"}]}`, wj))
	if _, err := d.Q().Exec(ctx, `UPDATE main_unifiedjob SET status = 'successful', finished = now(), emitted_events = 3 WHERE id = $1`, wj); err != nil {
		t.Fatal(err)
	}
	st, body = d.do("DELETE", wfPath, nil)
	d.expect(st, body, http.StatusNoContent, "")
}
