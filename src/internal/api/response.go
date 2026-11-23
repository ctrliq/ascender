package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
)

// APIError is an error with an HTTP status and a DRF-shaped body.
type APIError struct {
	Status int
	Body   any
}

func (e *APIError) Error() string {
	if b, err := json.Marshal(e.Body); err == nil {
		return fmt.Sprintf("api error %d: %s", e.Status, b)
	}
	return fmt.Sprintf("api error %d", e.Status)
}

// Detail builds the {"detail": msg} error DRF used for most failures.
func Detail(status int, msg string) *APIError {
	return &APIError{Status: status, Body: map[string]any{"detail": msg}}
}

// Common errors, worded as the old API worded them.
var (
	ErrNotAuthenticated = Detail(http.StatusUnauthorized, "Authentication credentials were not provided.")
	ErrForbidden        = Detail(http.StatusForbidden, "You do not have permission to perform this action.")
	ErrNotFound         = Detail(http.StatusNotFound, "Not found.")
)

// MethodNotAllowed matches DRF's wording.
func MethodNotAllowed(method string) *APIError {
	return Detail(http.StatusMethodNotAllowed, fmt.Sprintf("Method \"%s\" not allowed.", method))
}

// FieldErrors is a 400 whose body maps field names to message lists, which
// is what serializers raised on validation failure.
type FieldErrors map[string][]string

// Add appends a message for a field.
func (f FieldErrors) Add(field, msg string) { f[field] = append(f[field], msg) }

// Has reports whether a field already has an error.
func (f FieldErrors) Has(field string) bool { _, ok := f[field]; return ok }

// Err returns nil when empty, otherwise a 400 APIError.
func (f FieldErrors) Err() error {
	if len(f) == 0 {
		return nil
	}
	return &APIError{Status: http.StatusBadRequest, Body: f}
}

// BadRequest is a 400 with a detail message (what ParseError produced).
func BadRequest(msg string) *APIError { return Detail(http.StatusBadRequest, msg) }

// WriteJSON writes v with the headers the old API set on every response.
func WriteJSON(w http.ResponseWriter, status int, v any) {
	bp := jsonBufs.Get().(*[]byte)
	defer func() {
		// Buffers grown by an unusually large response are dropped.
		if cap(*bp) <= 1<<20 {
			jsonBufs.Put(bp)
		}
	}()
	if status >= 400 {
		// Error bodies' messages, in the request's language.
		if l := responseLocale(w); l != nil {
			v = translateBody(l, v)
		}
	}
	b, err := appendJSON((*bp)[:0], v)
	if err != nil {
		http.Error(w, `{"detail":"internal serialization error"}`, http.StatusInternalServerError)
		return
	}
	*bp = b
	h := w.Header()
	h.Set("Content-Type", "application/json")
	h.Set("Content-Length", strconv.Itoa(len(b)))
	w.WriteHeader(status)
	if status != http.StatusNoContent {
		_, _ = w.Write(b)
	}
}

// WriteError renders any error as the API would. Unknown errors become 500s
// with a generic body; the real error is logged by the caller.
// serverErrorDetail is handle_500's message: an unhandled exception in a
// view reached Django's handler500 (ascender.main.views.handle_500), which
// answered under /api/ with {"detail": "A server error has occurred."}.
const serverErrorDetail = "A server error has occurred."

func WriteError(w http.ResponseWriter, err error) {
	var ae *APIError
	if errors.As(err, &ae) {
		WriteJSON(w, ae.Status, ae.Body)
		return
	}
	WriteJSON(w, http.StatusInternalServerError, map[string]any{"detail": serverErrorDetail})
}

// writeEmpty is a DRF Response(status=...) without data: no body, and no
// Content-Type (DRF removed it when the rendered content was empty).
func writeEmpty(w http.ResponseWriter, status int) {
	w.Header().Del("Content-Type")
	w.Header().Set("Content-Length", "0")
	w.WriteHeader(status)
}

// Allow sets the Allow header DRF emitted on every response.
func Allow(w http.ResponseWriter, methods ...string) {
	w.Header().Set("Allow", strings.Join(methods, ", "))
}
