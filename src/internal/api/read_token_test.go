package api

import (
	"net/http"
	"testing"
)

// A token without the write scope may only read, on any route
// (APIView.check_permissions), before the view looks at the object or the
// method.
func TestReadTokenCannotWrite(t *testing.T) {
	d := newDBServer(t, "zz-read-token-test")
	d.user.AuthMethod = "token"
	d.user.OAuthScopes = []string{"read"}
	st, body := d.do("GET", "/api/v2/labels/", nil)
	d.expect(st, body, http.StatusOK, "")
	forbidden := `{"detail":"You do not have permission to perform this action."}`
	for _, c := range []struct{ method, path string }{
		{"POST", "/api/v2/labels/"},
		{"POST", "/api/v2/job_templates/999999999/notification_templates_success/"},
		{"POST", "/api/v2/schedules/preview/"},
		{"DELETE", "/api/v2/inventories/999999999/"},
		{"POST", "/api/v2/ping/"},
	} {
		st, body := d.do(c.method, c.path, map[string]any{})
		if st != http.StatusForbidden || body != forbidden {
			t.Errorf("%s %s: got %d %s, want 403", c.method, c.path, st, body)
		}
	}
	d.user.OAuthScopes = []string{"write"}
	st, body = d.do("POST", "/api/v2/ping/", map[string]any{})
	if st != http.StatusMethodNotAllowed {
		t.Errorf("write token POST /ping/: got %d %s, want 405", st, body)
	}
}
