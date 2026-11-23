package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

// A refusal the middleware writes itself (a read-only token writing, a
// failed CSRF check) is a 404 without Allow when a named URL was
// rewritten, and stays a 403 otherwise.
func TestMiddlewareRefusalUnderNamedURL(t *testing.T) {
	for _, named := range []bool{false, true} {
		r := httptest.NewRequest("PATCH", "/api/v2/projects/1/", nil)
		if named {
			r = r.WithContext(context.WithValue(r.Context(), namedURLRewrittenKey{}, true))
		}
		w := httptest.NewRecorder()
		w.Header().Set("Allow", "GET, PATCH")
		writeRefusal(w, r, Detail(http.StatusForbidden, "CSRF Failed: CSRF token missing."))
		switch {
		case named && (w.Code != http.StatusNotFound || w.Header().Get("Allow") != "" || w.Body.String() != `{"detail":"Not found."}`):
			t.Errorf("named URL: %d %q Allow=%q", w.Code, w.Body.String(), w.Header().Get("Allow"))
		case !named && w.Code != http.StatusForbidden:
			t.Errorf("plain URL: %d %q", w.Code, w.Body.String())
		}
	}
}
