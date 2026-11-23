package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/ctrliq/ascender/internal/auth"
)

func TestCORSOriginMatching(t *testing.T) {
	allowed := []string{"https://ui.example.com", "http://127.0.0.1:9000", "null"}
	for origin, want := range map[string]bool{
		"https://ui.example.com":      true,
		"HTTPS://ui.example.com":      true, // urlsplit lowercases the scheme only
		"https://UI.example.com":      false,
		"http://ui.example.com":       false,
		"https://ui.example.com:8443": false,
		"http://127.0.0.1:9000":       true,
		"null":                        true,
		"https://evil.example.com":    false,
		"https://[::1":                false,
	} {
		if got := corsOriginAllowed(allowed, origin); got != want {
			t.Errorf("%s: %v, want %v", origin, got, want)
		}
	}
	if corsOriginAllowed(nil, "https://ui.example.com") || corsOriginAllowed([]string{"https://ui.example.com"}, "null") {
		t.Error("allowed without being listed")
	}
}

// CorsMiddleware with the old settings: the Access-Control headers for a
// listed origin, an empty 200 for any preflight, the API's metadata for an
// ordinary OPTIONS, and nothing for an origin not listed.
func TestCORSHeaders(t *testing.T) {
	d := newDBServer(t, "zz-cors-test")
	send := func(method, path, origin string, preflight bool) *httptest.ResponseRecorder {
		t.Helper()
		r := httptest.NewRequest(method, path, nil)
		r.Header.Set("Accept", "application/json")
		if origin != "" {
			r.Header.Set("Origin", origin)
		}
		if preflight {
			r.Header.Set("Access-Control-Request-Method", "POST")
			r.Header.Set("Access-Control-Request-Headers", "authorization, content-type")
		}
		w := httptest.NewRecorder()
		d.Routes().ServeHTTP(w, r)
		return w
	}
	acHeaders := []string{"Access-Control-Allow-Origin", "Access-Control-Allow-Headers", "Access-Control-Allow-Methods", "Access-Control-Max-Age", "Access-Control-Allow-Credentials"}
	noAC := func(what string, w *httptest.ResponseRecorder) {
		t.Helper()
		for _, h := range acHeaders {
			if v := w.Header().Get(h); v != "" {
				t.Errorf("%s: %s: %s", what, h, v)
			}
		}
	}

	// No origins listed (the default): a preflight is still answered, and
	// the browser refuses the request for want of the headers.
	w := send("OPTIONS", "/api/v2/organizations/", "https://ui.example.com", true)
	if w.Code != http.StatusOK || w.Body.Len() != 0 || w.Header().Get("Vary") != "origin" || w.Header().Get("Content-Length") != "0" {
		t.Errorf("preflight, nothing listed: %d %q %v", w.Code, w.Body.String(), w.Header())
	}
	noAC("preflight, nothing listed", w)
	if v := w.Header().Get("Access-Control-Expose-Headers"); v != "X-API-Request-Id" {
		t.Errorf("Access-Control-Expose-Headers %q", v)
	}

	d.Cfg.CORSAllowedOrigins = []string{"https://ui.example.com"}
	w = send("OPTIONS", "/api/v2/organizations/", "https://ui.example.com", true)
	want := map[string]string{"Access-Control-Allow-Origin": "https://ui.example.com", "Access-Control-Allow-Headers": corsAllowHeaders,
		"Access-Control-Allow-Methods": "DELETE, GET, OPTIONS, PATCH, POST, PUT", "Access-Control-Max-Age": "86400", "Access-Control-Allow-Credentials": ""}
	if w.Code != http.StatusOK || w.Body.Len() != 0 {
		t.Errorf("preflight: %d %q", w.Code, w.Body.String())
	}
	for h, v := range want {
		if got := w.Header().Get(h); got != v {
			t.Errorf("preflight %s = %q, want %q", h, got, v)
		}
	}
	// Answered before authentication: a bad token does not fail it.
	r := httptest.NewRequest("OPTIONS", "/api/v2/organizations/", nil)
	r.Header.Set("Origin", "https://ui.example.com")
	r.Header.Set("Access-Control-Request-Method", "GET")
	r.Header.Set("Authorization", "Basic !!!")
	rec := httptest.NewRecorder()
	d.Routes().ServeHTTP(rec, r)
	if rec.Code != http.StatusOK {
		t.Errorf("preflight with bad credentials: %d", rec.Code)
	}

	w = send("OPTIONS", "/api/v2/organizations/", "https://evil.example.com", true)
	if w.Code != http.StatusOK || w.Body.Len() != 0 {
		t.Errorf("preflight, other origin: %d", w.Code)
	}
	noAC("preflight, other origin", w)

	// An ordinary OPTIONS keeps its metadata, with the headers.
	w = send("OPTIONS", "/api/v2/ping/", "https://ui.example.com", false)
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"name"`) || w.Header().Get("Access-Control-Allow-Methods") == "" ||
		w.Header().Get("Access-Control-Allow-Origin") != "https://ui.example.com" {
		t.Errorf("OPTIONS: %d %.200s %v", w.Code, w.Body.String(), w.Header())
	}
	// Other methods get the origin, not the preflight's headers.
	w = send("GET", "/api/v2/ping/", "https://ui.example.com", false)
	if w.Code != http.StatusOK || w.Header().Get("Access-Control-Allow-Origin") != "https://ui.example.com" || w.Header().Get("Access-Control-Allow-Methods") != "" {
		t.Errorf("GET: %d %v", w.Code, w.Header())
	}
	if v := w.Header().Values("Vary"); !strings.Contains(strings.Join(v, ","), "origin") {
		t.Errorf("Vary %v", v)
	}
	// Errors carry them too, so the page can read why.
	w = send("GET", "/api/v2/organizations/", "https://ui.example.com", false)
	if w.Code != http.StatusUnauthorized || w.Header().Get("Access-Control-Allow-Origin") != "https://ui.example.com" {
		t.Errorf("401: %d %v", w.Code, w.Header())
	}
	noAC("GET, other origin", send("GET", "/api/v2/ping/", "https://evil.example.com", false))
	noAC("GET, no origin", send("GET", "/api/v2/ping/", "", false))
}

// An allowed CORS origin is not a trusted CSRF origin: a cross-site request
// acting with a session still needs its origin in CSRF_TRUSTED_ORIGINS and
// the CSRF token.
func TestCORSDoesNotBypassCSRF(t *testing.T) {
	d := newDBServer(t, "zz-cors-csrf-test")
	ctx := context.Background()
	defer func() { _ = auth.SetTrustedOrigins(nil) }()
	const origin = "https://ui.example.com"
	d.Cfg.CORSAllowedOrigins = []string{origin}
	sess, err := auth.CreateSessionData(ctx, d.DB.Pool, d.user.ID, time.Hour, map[string]any{auth.SessionHashKey: auth.SessionAuthHash(d.Cfg.SecretKey, d.user)})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { auth.DeleteSession(ctx, d.DB.Pool, sess.Key) })
	token := auth.NewCSRFToken()
	post := func() *httptest.ResponseRecorder {
		r := httptest.NewRequest("POST", "/api/v2/organizations/", strings.NewReader(`{}`))
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("Accept", "application/json")
		r.Header.Set("Origin", origin)
		r.Header.Set("Sec-Fetch-Site", "cross-site")
		r.Header.Set(auth.CSRFHeaderName, token)
		r.AddCookie(&http.Cookie{Name: d.Cfg.SessionCookieName, Value: sess.Key})
		r.AddCookie(&http.Cookie{Name: auth.CSRFCookieName, Value: token})
		w := httptest.NewRecorder()
		d.Routes().ServeHTTP(w, r)
		return w
	}
	w := post()
	if w.Code != http.StatusForbidden || !strings.Contains(w.Body.String(), "CSRF Failed: Origin checking failed - https://ui.example.com does not match any trusted origins.") {
		t.Errorf("not a trusted origin: %d %s", w.Code, w.Body.String())
	}
	if w.Header().Get("Access-Control-Allow-Origin") != origin {
		t.Errorf("CSRF failure without the CORS headers: %v", w.Header())
	}
	d.Cfg.CSRFTrustedOrigins = []string{origin}
	d.trustedOrigins.Store(nil)
	if w := post(); w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), `"name"`) {
		t.Errorf("trusted origin: %d %s", w.Code, w.Body.String())
	}
}
