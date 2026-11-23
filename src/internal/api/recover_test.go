package api

import (
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
)

// A panicking handler answers handler500's body, not a dropped connection.
func TestHandlerPanicAnswers500(t *testing.T) {
	s := &Server{Log: slog.New(slog.DiscardHandler)}
	h := s.h(func(w http.ResponseWriter, r *http.Request) error { panic("boom") })
	w := httptest.NewRecorder()
	h(w, httptest.NewRequest("GET", "/api/v2/x/", nil))
	if w.Code != http.StatusInternalServerError || w.Body.String() != `{"detail":"A server error has occurred."}` {
		t.Fatalf("got %d %s", w.Code, w.Body.String())
	}
}
