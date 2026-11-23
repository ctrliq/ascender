package api

import (
	"bytes"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestReadBodyTooLarge(t *testing.T) {
	big := `{"name": "` + strings.Repeat("a", maxRequestBody) + `"}`
	r := httptest.NewRequest("POST", "/api/v2/organizations/", strings.NewReader(big))
	r.Header.Set("Content-Type", "application/json")
	_, err := readBody(r)
	var ae *APIError
	if !errors.As(err, &ae) || ae.Status != http.StatusRequestEntityTooLarge {
		t.Fatalf("oversized JSON body: %v", err)
	}
	r = httptest.NewRequest("POST", "/api/v2/organizations/", bytes.NewReader([]byte("name="+strings.Repeat("a", maxRequestBody))))
	r.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	if _, err := readBody(r); !errors.As(err, &ae) || ae.Status != http.StatusRequestEntityTooLarge {
		t.Fatalf("oversized form body: %v", err)
	}
	ok := `{"name": "` + strings.Repeat("a", maxRequestBody-20) + `"}`
	r = httptest.NewRequest("POST", "/api/v2/organizations/", strings.NewReader(ok))
	r.Header.Set("Content-Type", "application/json")
	if _, err := readBody(r); err != nil {
		t.Fatalf("body under the limit: %v", err)
	}
}
