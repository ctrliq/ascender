package web

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

// A path built from the page's unescaped path values never reaches the
// API as more than a path: whitespace, control characters or a stray %
// make it a 404, not a panic or extra request headers.
func TestAPICallRefusesMalformedPaths(t *testing.T) {
	u := &UI{}
	r := httptest.NewRequest("GET", "/projects/1/details", nil)
	for _, p := range []string{
		"/api/v2/projects/1 x/",
		"/api/v2/jobs/5/ HTTP/1.0\r\nAuthorization: Bearer stolen\r\n\r\n",
		"/api/v2/jobs/5\n/",
		"/api/v2/jobs/%zz/",
		"api/v2/jobs/",
	} {
		res, err := u.apiCall(r, "GET", p, nil)
		if err != nil || res == nil || res.Status != http.StatusNotFound {
			t.Errorf("%q: %v %v", p, res, err)
		}
	}
}
