// Package api serves the REST API at /api/, matching the old application's
// URLs, request handling and JSON shapes so existing clients, the ascender
// command line tool and the Ansible collection keep working unchanged.
package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"

	"github.com/ctrliq/ascender/internal/activity"
	"github.com/ctrliq/ascender/internal/auth"
	"github.com/ctrliq/ascender/internal/config"
	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/models"
	"github.com/ctrliq/ascender/internal/settings"
	"github.com/jackc/pgx/v5"
	"runtime/debug"
)

// Server holds what every handler needs.
type Server struct {
	Cfg      *config.Config
	DB       *db.DB
	Settings *settings.Store
	CT       *models.ContentTypes
	Roles    models.RoleFactory
	Cascade  *models.Cascader
	Activity *activity.Recorder
	Log      *slog.Logger

	// routes is the API handler, built once: the UI's in-process calls
	// reach the API through it on every page.
	routesOnce sync.Once
	routes     http.Handler

	// bg is the detached work requests started (Background).
	bg background

	// trustedOrigins is the CSRF_TRUSTED_ORIGINS value last applied
	// (syncTrustedOrigins).
	trustedOrigins atomic.Pointer[string]
}

// syncTrustedOrigins applies CSRF_TRUSTED_ORIGINS, the setting, with the
// environment's ASCENDER_CSRF_TRUSTED_ORIGINS, whenever the setting's
// value changes (the settings store is cached, so this is a map read).
func (s *Server) syncTrustedOrigins(ctx context.Context) {
	if s.Settings == nil {
		return
	}
	list := s.Settings.List(ctx, "CSRF_TRUSTED_ORIGINS")
	key := fmt.Sprint(list)
	if last := s.trustedOrigins.Load(); last != nil && *last == key {
		return
	}
	all := []string{}
	if s.Cfg != nil {
		all = append(all, s.Cfg.CSRFTrustedOrigins...)
	}
	for _, v := range list {
		if o, ok := v.(string); ok {
			all = append(all, o)
		}
	}
	if err := auth.SetTrustedOrigins(all); err != nil {
		// The setting is validated when written; one that still fails
		// leaves the environment's origins alone in force.
		s.Log.WarnContext(ctx, "CSRF_TRUSTED_ORIGINS not applied", "err", err)
		if s.Cfg != nil {
			_ = auth.SetTrustedOrigins(s.Cfg.CSRFTrustedOrigins)
		}
	}
	s.trustedOrigins.Store(&key)
}

// HandlerFunc is a handler that reports failures as errors; h converts them.
type HandlerFunc func(w http.ResponseWriter, r *http.Request) error

// h adapts a HandlerFunc, rendering errors in the API's format.
func (s *Server) h(fn HandlerFunc) http.HandlerFunc { return s.handle(fn, false) }

// handle is h; with logErrors the responses of status 400 and more are
// logged as the old API views (APIView.finalize_response) logged them.
func (s *Server) handle(fn HandlerFunc, logErrors bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		defer s.recoverPanic(w, r)
		var sw *statusWriter
		if logErrors {
			sw = &statusWriter{ResponseWriter: w}
			w = sw
		}
		r = r.WithContext(s.WithInputLookups(r.Context()))
		// The response's language, also for a writer the request was
		// handed on to (the browsable page's buffer).
		if lang := LanguageFrom(r.Context()); lang != "" {
			w.Header().Set("Content-Language", lang)
		}
		if err := fn(w, r); err != nil {
			var ae *APIError
			if namedURLRewritten(r.Context()) && errors.As(err, &ae) {
				// api_exception_handler: a refusal of a request whose
				// named URL was rewritten is a 404, which (finalize_response)
				// carries no Allow header.
				if ae.Status == http.StatusForbidden {
					err = ErrNotFound
				}
				if errors.As(err, &ae) && ae.Status == http.StatusNotFound {
					w.Header().Del("Allow")
				}
			}
			if !errors.As(err, &ae) {
				if db.IsNoRows(err) {
					// A lookup that found nothing and was not turned into
					// its model's 404 at the lookup: still a 404, as
					// get_object_or_404 would have answered, but logged,
					// since it can also be a query that should have found
					// a row.
					s.Log.WarnContext(r.Context(), "unconverted no-rows error answered 404", "method", r.Method, "path", r.URL.Path, "err", err)
					WriteError(w, ErrNotFound)
					return
				}
				s.Log.ErrorContext(r.Context(), "request failed", "method", r.Method, "path", r.URL.Path, "err", err)
				// An unhandled exception: Django's 500, which the
				// view's error log never saw.
				WriteError(w, err)
				return
			}
			WriteError(w, err)
		}
		// finalize_response returned a rewritten named URL's 404 before
		// it logged.
		if sw != nil && !(sw.status == http.StatusNotFound && namedURLRewritten(r.Context())) {
			s.logAPIError(r, sw.status, sw.body)
		}
	}
}

// recoverPanic turns a handler's panic into the old 500 response (an
// unhandled exception reached handler500) instead of a dropped
// connection, logging the stack. Deferred by h and the API middleware.
func (s *Server) recoverPanic(w http.ResponseWriter, r *http.Request) {
	p := recover()
	if p == nil {
		return
	}
	if p == http.ErrAbortHandler {
		panic(p)
	}
	s.Log.ErrorContext(r.Context(), "request panicked", "method", r.Method, "path", r.URL.Path, "panic", fmt.Sprint(p), "stack", string(debug.Stack()))
	WriteError(w, fmt.Errorf("panic: %v", p))
}

// RequireUser returns the authenticated user or the 401 the old API sent.
func RequireUser(r *http.Request) (*auth.User, error) {
	u := auth.UserFrom(r.Context())
	if u == nil {
		return nil, Detail(http.StatusUnauthorized, "Authentication credentials were not provided. To establish a login session, visit /api/login/.")
	}
	return u, nil
}

// RequireWrite additionally refuses read-only tokens.
func RequireWrite(r *http.Request) (*auth.User, error) {
	u, err := RequireUser(r)
	if err != nil {
		return nil, err
	}
	if !u.CanWrite() {
		return nil, ErrForbidden
	}
	return u, nil
}

// PathID parses the {id} path value.
func PathID(r *http.Request) (int64, error) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		return 0, ErrNotFound
	}
	return id, nil
}

// ReadBody decodes the request body, which is JSON or a form, into an
// ordered map so "field present but null" is distinguishable from absent.
func ReadBody(r *http.Request) (*OMap, error) {
	body, err := readBody(r)
	if err != nil {
		return nil, err
	}
	// No read ever shows a stored encrypted value (they read
	// $encrypted$), so one in a request was taken from somewhere else:
	// sent as a survey answer or a variable it would be decrypted for the
	// job, another template's password among them.
	if u := auth.UserFrom(r.Context()); (u == nil || !u.IsSuperuser) && hasCiphertext(body) {
		return nil, BadRequest(encryptedValueMsg)
	}
	return body, nil
}

// maxRequestBody caps a JSON or form body the API parses. The old
// application had no cap of its own (DRF streams the body past Django's
// DATA_UPLOAD_MAX_MEMORY_SIZE); its nginx refused bodies over
// client_max_body_size with 413, the status given here. A body over the
// cap was once cut short and failed as a JSON parse error.
const maxRequestBody = 10 << 20

// errBodyTooLarge is the answer to an oversized body.
var errBodyTooLarge = Detail(http.StatusRequestEntityTooLarge, "Request body too large: the limit is 10 MiB.")

func readBody(r *http.Request) (*OMap, error) {
	ct := r.Header.Get("Content-Type")
	body := NewOMap()
	switch {
	case strings.HasPrefix(ct, "application/json"), ct == "":
		b, err := io.ReadAll(io.LimitReader(r.Body, maxRequestBody+1))
		if err != nil {
			var tooBig *http.MaxBytesError
			if errors.As(err, &tooBig) {
				return nil, errBodyTooLarge
			}
			return nil, BadRequest("Could not read request body.")
		}
		if len(b) > maxRequestBody {
			return nil, errBodyTooLarge
		}
		if len(strings.TrimSpace(string(b))) == 0 {
			return body, nil
		}
		if err := json.Unmarshal(b, body); err != nil {
			return nil, BadRequest("JSON parse error - " + err.Error())
		}
		return body, nil
	case strings.HasPrefix(ct, "application/x-www-form-urlencoded"), strings.HasPrefix(ct, "multipart/form-data"):
		r.Body = http.MaxBytesReader(nil, r.Body, maxRequestBody)
		// ParseMultipartForm drops ParseForm's error for a urlencoded
		// body, so that is parsed first. Its other errors (a bad escape)
		// leave the pairs that parsed, as Django's QueryDict did.
		var tooBig *http.MaxBytesError
		if err := r.ParseForm(); errors.As(err, &tooBig) {
			return nil, errBodyTooLarge
		}
		if err := r.ParseMultipartForm(maxRequestBody); err != nil && !errors.Is(err, http.ErrNotMultipart) {
			if errors.As(err, &tooBig) {
				return nil, errBodyTooLarge
			}
			return nil, BadRequest("Could not parse form.")
		}
		for k, v := range r.PostForm {
			if len(v) > 0 {
				body.Set(k, v[0])
			}
		}
		return body, nil
	}
	return nil, Detail(http.StatusUnsupportedMediaType, "You did not use correct Content-Type in your HTTP request. If you are using our REST API, the Content-Type must be application/json")
}

// Q returns the pool for reads.
func (s *Server) Q() db.Querier { return s.DB.Pool }

// NotFoundFor renders the 404 wording the old API used per model.
func NotFoundFor(model string) *APIError {
	return Detail(http.StatusNotFound, fmt.Sprintf("No %s matches the given query.", model))
}

// NoFieldError renders the filter error the old API used.
func NoFieldError(model, field string) *APIError {
	return BadRequest(fmt.Sprintf("%s has no field named '%s'", model, field))
}

// logRowsErr reports a row loop's failure where the caller has no error
// to return (a display summary, a notification's recipients): what was
// read is used, and the failure is logged rather than lost.
func (s *Server) logRowsErr(ctx context.Context, what string, rows pgx.Rows) {
	if err := rows.Err(); err != nil {
		s.Log.ErrorContext(ctx, "reading rows", "what", what, "err", err)
	}
}
