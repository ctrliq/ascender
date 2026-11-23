package api

import (
	"crypto/tls"
	"net/http/httptest"
	"testing"
)

// Behind a TLS-terminating proxy, SSO builds https URLs, as the settings
// page shows them.
func TestRequestScheme(t *testing.T) {
	for _, tc := range []struct {
		proto string
		tls   bool
		want  string
	}{
		{"", false, "http"}, {"https", false, "https"}, {"HTTPS ", false, "https"}, {"http", false, "http"}, {"", true, "https"},
	} {
		r := httptest.NewRequest("GET", "/sso/login/oidc/", nil)
		r.Host = "ascender.example.com"
		if tc.proto != "" {
			r.Header.Set("X-Forwarded-Proto", tc.proto)
		}
		if tc.tls {
			r.TLS = &tls.ConnectionState{}
		}
		if got := RequestScheme(r); got != tc.want {
			t.Errorf("proto %q tls %v: %s", tc.proto, tc.tls, got)
		}
		if got, want := absoluteURI(r, "/sso/complete/oidc/"), tc.want+"://ascender.example.com/sso/complete/oidc/"; got != want {
			t.Errorf("absoluteURI = %s, want %s", got, want)
		}
		if got := requestURLBase(r); got != tc.want+"://ascender.example.com" {
			t.Errorf("requestURLBase = %s", got)
		}
	}
}
