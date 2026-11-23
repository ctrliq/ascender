package auth

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func csrfRequest(site, origin string) *http.Request {
	r := httptest.NewRequest("POST", "https://ascender.example.com/api/v2/users/", strings.NewReader(""))
	tok := strings.Repeat("a", 32)
	r.AddCookie(&http.Cookie{Name: CSRFCookieName, Value: tok})
	r.Header.Set(CSRFHeaderName, tok)
	if site != "" {
		r.Header.Set("Sec-Fetch-Site", site)
	}
	if origin != "" {
		r.Header.Set("Origin", origin)
	}
	return r
}

// A matching token is not enough when the browser says the request came
// from another site: a sibling subdomain can plant the cookie.
func TestCSRFOrigin(t *testing.T) {
	defer SetTrustedOrigins(nil)
	cases := []struct {
		site, origin string
		ok           bool
	}{
		{"same-origin", "https://ascender.example.com", true},
		{"", "", true}, // a non-browser client
		{"same-site", "https://evil.example.com", false},
		{"cross-site", "https://evil.test", false},
		{"", "https://evil.test", false}, // an older browser: Origin against the host
		{"", "https://ascender.example.com", true},
	}
	for _, c := range cases {
		if got := CSRFOK(csrfRequest(c.site, c.origin)); got != c.ok {
			t.Errorf("site=%q origin=%q: CSRFOK=%v, want %v (%s)", c.site, c.origin, got, c.ok, CSRFError(csrfRequest(c.site, c.origin)))
		}
	}
	if err := SetTrustedOrigins([]string{"https://ui.example.com"}); err != nil {
		t.Fatal(err)
	}
	if !CSRFOK(csrfRequest("same-site", "https://ui.example.com")) {
		t.Error("trusted origin refused")
	}
	r := csrfRequest("same-origin", "")
	r.Header.Set(CSRFHeaderName, strings.Repeat("b", 32))
	if CSRFOK(r) {
		t.Error("mismatched token accepted")
	}
}

func TestSameOriginOKWebsocket(t *testing.T) {
	defer SetTrustedOrigins(nil)
	ws := func(site, origin string) *http.Request {
		r := httptest.NewRequest("GET", "https://ascender.example.com/websocket/", nil)
		if site != "" {
			r.Header.Set("Sec-Fetch-Site", site)
		}
		if origin != "" {
			r.Header.Set("Origin", origin)
		}
		return r
	}
	if !SameOriginOK(ws("same-origin", "https://ascender.example.com")) || !SameOriginOK(ws("", "")) {
		t.Error("same origin refused")
	}
	if SameOriginOK(ws("cross-site", "https://evil.test")) || SameOriginOK(ws("", "https://evil.test")) || SameOriginOK(ws("same-site", "https://evil.example.com")) {
		t.Error("other site accepted")
	}
}
