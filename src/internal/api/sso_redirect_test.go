package api

import (
	"net/http/httptest"
	"testing"

	"github.com/ctrliq/ascender/internal/auth"
)

// A deep link opened while logged out survives the provider round trip:
// the login page posts it to /sso/login/<backend>/ as next, the session
// keeps it (SAML: the RelayState), and the complete step goes back there.
// Without one (the login page leaves out "/home") the user lands on the
// UI's start page. Ascender PR #1206 fixed the same journey in the old UI.
func TestCompleteRedirectDeepLink(t *testing.T) {
	s := &Server{}
	for _, tc := range []struct{ next, form, want string }{
		{next: "/jobs/playbook/42/output?x=1", want: "/jobs/playbook/42/output?x=1"},
		{want: "/sso/complete/"},
		{form: "/templates/job_template/7/details", want: "/templates/job_template/7/details"},
		{next: "https://evil.example/", want: "/sso/complete/"},
		{next: "//evil.example/", want: "/sso/complete/"},
	} {
		target := "/sso/complete/oidc/"
		if tc.form != "" {
			target += "?next=" + tc.form
		}
		r := httptest.NewRequest("GET", target, nil)
		ss := &ssoSession{Session: &auth.Session{Data: map[string]any{}}}
		if tc.next != "" {
			ss.Data["next"] = tc.next
		}
		if got := s.completeRedirect(r, ss, false); got != tc.want {
			t.Errorf("next %q, form %q: completeRedirect = %q, want %q", tc.next, tc.form, got, tc.want)
		}
	}
}
