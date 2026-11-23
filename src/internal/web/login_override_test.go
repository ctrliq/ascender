package web

import (
	"net/http/httptest"
	"testing"
)

// LOGIN_REDIRECT_OVERRIDE sends a signed-out visitor to an http(s) or
// relative URL, never to one the browser would run, and never from the
// login page; an SSO login URL on this site is posted to, not followed.
func TestLoginRedirectOverride(t *testing.T) {
	r := httptest.NewRequest("GET", "https://ascender.example.com/templates", nil)
	for value, want := range map[string]string{
		"":                              "",
		"   ":                           "",
		"https://portal.example.com/":   "https://portal.example.com/",
		"/sso/login/saml/?idp=corp":     "/sso/login/saml/?idp=corp",
		" HTTP://portal.example.com/x ": "HTTP://portal.example.com/x",
		"javascript:alert(1)":           "",
		"data:text/html,<b>x</b>":       "",
		"vbscript:msgbox":               "",
		"%zz":                           "",
	} {
		if got := overrideTarget(r, value); got != want {
			t.Errorf("overrideTarget(%q) = %q, want %q", value, got, want)
		}
	}
	if got := overrideTarget(httptest.NewRequest("GET", "/login?next=/home", nil), "https://portal.example.com/"); got != "" {
		t.Errorf("the login page itself followed the override to %q", got)
	}

	for to, want := range map[string]bool{
		"/sso/login/saml/?idp=corp":                    true,
		"https://ascender.example.com/sso/login/saml/": true,
		"https://ASCENDER.example.com/sso/login/oidc/": true,
		"/ascender/sso/login/saml/":                    true,
		"https://idp.example.com/sso/login/saml/":      false,
		"/sso/complete/saml/":                          false,
		"https://portal.example.com/":                  false,
	} {
		if got := sameOriginSSOLogin(r, to); got != want {
			t.Errorf("sameOriginSSOLogin(%q) = %v, want %v", to, got, want)
		}
	}
}
