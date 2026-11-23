package api

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/ctrliq/ascender/internal/auth"
)

// scratchWebhookTemplate makes a webhook notification template in the
// organization that posts to url, and returns its id.
func scratchWebhookTemplate(t *testing.T, d *dbServer, org int64, name, url string) int64 {
	t.Helper()
	st, body := d.do("POST", "/api/v2/notification_templates/", map[string]any{"name": name, "organization": org, "notification_type": "webhook",
		"notification_configuration": map[string]any{"url": url, "http_method": "POST", "headers": map[string]any{}, "disable_ssl_verification": false, "username": "", "password": ""}})
	d.expect(st, body, http.StatusCreated, "")
	return d.id(body)
}

func scratchAttach(t *testing.T, d *dbServer, table, col string, owner, nt int64) {
	t.Helper()
	if _, err := d.Q().Exec(context.Background(), `INSERT INTO `+table+` (`+col+`, notificationtemplate_id) VALUES ($1, $2)`, owner, nt); err != nil {
		t.Fatal(err)
	}
}

// A system job sends its template's started, success and error
// notifications (SystemJobTemplate.notification_templates), with the
// message context of any unified job. An organization's templates are not
// among them.
func TestSystemJobNotifications(t *testing.T) {
	d, database := newScratchServer(t, "zz-system-job-notify-test")
	ctx := context.Background()
	_, org := scratchInventory(t, d, "zz-sysnotify", nil)
	sink, orgSink := newCapture(t, nil), newCapture(t, nil)
	nt := scratchWebhookTemplate(t, d, org, "zz-sysnotify-nt", sink.srv.URL+"/sys")
	orgNT := scratchWebhookTemplate(t, d, org, "zz-sysnotify-org", orgSink.srv.URL+"/org")
	sjt := scratchInsert(t, database, "main_unifiedjobtemplate", map[string]any{"polymorphic_ctype_id": d.CT.ID("main.systemjobtemplate"), "name": "zz-cleanup", "status": "ok",
		"organization_id": org})
	scratchInsert(t, database, "main_systemjobtemplate", map[string]any{"unifiedjobtemplate_ptr_id": sjt, "job_type": "cleanup_jobs"})
	for _, ev := range []string{"started", "success", "error"} {
		scratchAttach(t, d, "main_unifiedjobtemplate_notification_templates_"+ev, "unifiedjobtemplate_id", sjt, nt)
		scratchAttach(t, d, "main_organization_notification_templates_"+ev, "organization_id", org, orgNT)
	}
	now := time.Now()
	job := scratchUnifiedJob(t, d, database, "main.systemjob", "main_systemjob", map[string]any{"system_job_template_id": sjt, "job_type": "cleanup_jobs"}, "successful", &now, 0)
	if _, err := d.Q().Exec(ctx, `UPDATE main_unifiedjob SET unified_job_template_id = $1, started = $2 WHERE id = $3`, sjt, now.Add(-time.Second), job); err != nil {
		t.Fatal(err)
	}
	for _, status := range []string{"running", "succeeded", "failed", "changed"} {
		d.SendJobNotifications(ctx, job, status)
	}
	reqs := sink.got()
	if len(reqs) != 3 {
		t.Fatalf("system job template notifications: %d, want 3 (%+v)", len(reqs), reqs)
	}
	for _, r := range reqs {
		if !strings.Contains(r.body, fmt.Sprintf(`"id": %d`, job)) || !strings.Contains(r.body, fmt.Sprintf(`/#/jobs/system/%d`, job)) || !strings.Contains(r.body, `"name": "zz-main_systemjob"`) {
			t.Errorf("body %s", r.body)
		}
	}
	if n := len(orgSink.got()); n != 0 {
		t.Errorf("the organization's templates sent %d", n)
	}
	var linked int
	if err := d.Q().QueryRow(ctx, `SELECT count(*) FROM main_unifiedjob_notifications un JOIN main_notification n ON n.id = un.notification_id
		WHERE un.unifiedjob_id = $1 AND n.status = 'successful'`, job).Scan(&linked); err != nil || linked != 3 {
		t.Errorf("notifications of the job: %d, %v", linked, err)
	}
}

// An ad hoc command that changed a host sends its organizations' changed
// notifications besides those for how it ended (AdHocCommand.has_changes).
func TestAdHocCommandChangedNotifications(t *testing.T) {
	d, database := newScratchServer(t, "zz-adhoc-notify-test")
	ctx := context.Background()
	inv, org := scratchInventory(t, d, "zz-adhocnotify", nil)
	host := scratchHost(t, d, inv, "zz-adhoc-host")
	success, changed := newCapture(t, nil), newCapture(t, nil)
	scratchAttach(t, d, "main_organization_notification_templates_success", "organization_id", org, scratchWebhookTemplate(t, d, org, "zz-adhoc-success", success.srv.URL))
	scratchAttach(t, d, "main_organization_notification_templates_changed", "organization_id", org, scratchWebhookTemplate(t, d, org, "zz-adhoc-changed", changed.srv.URL))
	now := time.Now()
	cmd := scratchJob(t, d, database, "adhoccommand", inv, "successful", &now, 1)
	ev := scratchEvent(t, d, database, "main_adhoccommandevent", "ad_hoc_command_id", cmd, map[string]any{"host_id": host, "host_name": "zz-adhoc-host",
		"event": "runner_on_ok", "changed": true, "uuid": "zz-1"})
	d.SendJobNotifications(ctx, cmd, "succeeded")
	if s, c := len(success.got()), len(changed.got()); s != 1 || c != 1 {
		t.Fatalf("with a change: success %d, changed %d", s, c)
	}
	if !strings.Contains(changed.got()[0].body, "/#/jobs/command/") {
		t.Errorf("changed body %s", changed.got()[0].body)
	}
	if _, err := d.Q().Exec(ctx, `UPDATE main_adhoccommandevent SET changed = false WHERE id = $1`, ev); err != nil {
		t.Fatal(err)
	}
	d.SendJobNotifications(ctx, cmd, "succeeded")
	if s, c := len(success.got()), len(changed.got()); s != 2 || c != 1 {
		t.Errorf("without a change: success %d, changed %d", s, c)
	}
}

// A user who may see a notification template but not delete it got an
// empty 404 (NotificationTemplateDetail.delete).
func TestNotificationTemplateDeleteRefusedIs404(t *testing.T) {
	d, _ := newScratchServer(t, "zz-nt-delete-test")
	ctx := context.Background()
	_, org := scratchInventory(t, d, "zz-ntdelete", nil)
	nt := scratchWebhookTemplate(t, d, org, "zz-ntdelete-nt", "https://hooks.example.invalid/")
	var auditor int64
	if err := d.Q().QueryRow(ctx, `SELECT auditor_role_id FROM main_organization WHERE id = $1`, org).Scan(&auditor); err != nil {
		t.Fatal(err)
	}
	if _, err := d.Q().Exec(ctx, `INSERT INTO main_rbac_roles_members (role_id, user_id) VALUES ($1, $2)`, auditor, d.user.ID); err != nil {
		t.Fatal(err)
	}
	d.user.IsSuperuser = false
	defer func() { d.user.IsSuperuser = true }()
	path := fmt.Sprintf("/api/v2/notification_templates/%d/", nt)
	if st, body := d.do("GET", path, nil); st != http.StatusOK {
		t.Fatalf("auditor GET: %d %s", st, body)
	}
	r := httptest.NewRequest("DELETE", path, nil).WithContext(auth.WithUser(ctx, d.user))
	r.Header.Set("Accept", "application/json")
	w := httptest.NewRecorder()
	d.Routes().ServeHTTP(w, r)
	if w.Code != http.StatusNotFound || w.Body.Len() != 0 || w.Header().Get("Content-Type") != "" {
		t.Errorf("auditor DELETE: %d %q %v", w.Code, w.Body.String(), w.Header())
	}
	d.user.IsSuperuser = true
	if st, body := d.do("GET", path, nil); st != http.StatusOK {
		t.Errorf("template gone: %d %s", st, body)
	}
}
