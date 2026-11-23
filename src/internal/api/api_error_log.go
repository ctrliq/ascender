package api

import (
	"bufio"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"strings"

	"github.com/ctrliq/ascender/internal/auth"
	"github.com/ctrliq/ascender/internal/extlog"
)

// The API's error log: APIView.finalize_response logged every response of
// status 400 or more that a view answered (not an unhandled exception,
// which never got that far) through the ascender.api.generics logger, in
// the words of API_400_ERROR_LOG_FORMAT: at INFO for a 401, WARNING
// otherwise.

// apiErrorLogger is the logger the records come from.
const apiErrorLogger = "ascender.api.generics"

// defaultAPIErrorFormat is API_400_ERROR_LOG_FORMAT's registered default.
const defaultAPIErrorFormat = "status {status_code} received by user {user_name} attempting to access {url_path} from {remote_addr}"

// errorLogBody bounds what is kept of an error response to read its
// "error" key from.
const errorLogBody = 64 << 10

// statusWriter notes a response's status and, for an error, the start of
// its body.
type statusWriter struct {
	http.ResponseWriter
	status int
	body   []byte
}

func (w *statusWriter) WriteHeader(code int) {
	if w.status == 0 {
		w.status = code
	}
	w.ResponseWriter.WriteHeader(code)
}

func (w *statusWriter) Write(p []byte) (int, error) {
	if w.status == 0 {
		w.status = http.StatusOK
	}
	if w.status >= 400 && len(w.body) < errorLogBody {
		w.body = append(w.body, p[:min(len(p), errorLogBody-len(w.body))]...)
	}
	return w.ResponseWriter.Write(p)
}

func (w *statusWriter) Flush() {
	if f, ok := w.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

func (w *statusWriter) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	if h, ok := w.ResponseWriter.(http.Hijacker); ok {
		return h.Hijack()
	}
	return nil, nil, fmt.Errorf("hijacking not supported")
}

func (w *statusWriter) Unwrap() http.ResponseWriter { return w.ResponseWriter }

// logAPIError writes the record of an error response.
func (s *Server) logAPIError(r *http.Request, status int, body []byte) {
	if status < 400 || s.Log == nil {
		return
	}
	ctx := r.Context()
	level := slog.LevelWarn
	if status == http.StatusUnauthorized {
		level = slog.LevelInfo
	}
	if !s.Log.Handler().Enabled(ctx, level) && !extlog.Default().Wants(apiErrorLogger, levelName(level)) {
		return
	}
	user := &pyObject{class: "AnonymousUser", str: "AnonymousUser", attrs: map[string]any{"id": nil, "pk": nil, "username": ""}}
	if u := auth.UserFrom(ctx); u != nil {
		user = &pyObject{class: "User", str: u.Username, attrs: map[string]any{"id": u.ID, "pk": u.ID, "username": u.Username,
			"email": u.Email, "first_name": u.FirstName, "last_name": u.LastName}}
	}
	var remote any
	if h := s.remoteHost(r); h != "" {
		remote = h
	}
	kwargs := map[string]any{"status_code": int64(status), "user_name": user, "url_path": r.URL.Path, "remote_addr": remote, "error": responseErrorText(status, body)}
	format := s.Settings.String(ctx, "API_400_ERROR_LOG_FORMAT")
	msg, perr := pyFormat(format, kwargs)
	if perr != "" {
		if format != "" {
			s.Log.ErrorContext(ctx, "Unable to format API_400_ERROR_LOG_FORMAT setting, defaulting log message: "+perr, extlog.LoggerAttr, apiErrorLogger)
		}
		msg, _ = pyFormat(defaultAPIErrorFormat, kwargs)
	}
	s.Log.Log(ctx, level, msg, extlog.LoggerAttr, apiErrorLogger)
}

func levelName(l slog.Level) string {
	if l == slog.LevelInfo {
		return "INFO"
	}
	return "WARNING"
}

// responseErrorText is the "error" the format may use: the response's
// own "error" key (each item's, joined, for a list), else its reason
// phrase.
func responseErrorText(status int, body []byte) any {
	phrase := statusText(status)
	v, err := DecodeOrdered(string(body))
	if err != nil {
		return phrase
	}
	pick := func(x any) any {
		if m, ok := x.(*OMap); ok {
			if e, ok := m.Get("error"); ok {
				if str, ok := e.(string); ok {
					return str
				}
				return pyRepr(e)
			}
		}
		return phrase
	}
	switch t := v.(type) {
	case *OMap:
		return pick(t)
	case []any:
		parts := make([]string, len(t))
		for i, x := range t {
			parts[i] = pyFmtStr(pick(x))
		}
		return strings.Join(parts, ", ")
	}
	return phrase
}

// clientHost is the address a login is logged with: remoteHost, as the
// old LoggedLoginView used, or the connection's own address when no
// header named in REMOTE_HOST_HEADERS gives one.
func (s *Server) clientHost(r *http.Request) string {
	if h := s.remoteHost(r); h != "" {
		return h
	}
	if h, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
		return h
	}
	return r.RemoteAddr
}

// remoteHost is get_remote_host: the first address among the
// REMOTE_HOST_HEADERS, the custom (HTTP_) ones only when the request came
// from one of the PROXY_IP_ALLOWED_LIST proxies or that list is empty.
func (s *Server) remoteHost(r *http.Request) string {
	ctx := r.Context()
	remoteAddr := r.RemoteAddr
	if h, _, err := net.SplitHostPort(remoteAddr); err == nil {
		remoteAddr = h
	}
	var headers []string
	if v, ok := s.Settings.Get(ctx, "REMOTE_HOST_HEADERS"); ok {
		for _, h := range toAnyList(v) {
			headers = append(headers, fmt.Sprint(h))
		}
	}
	trustCustom := true
	if v, ok := s.Settings.Get(ctx, "PROXY_IP_ALLOWED_LIST"); ok {
		allowed := toAnyList(v)
		if len(allowed) > 0 {
			trustCustom = false
			for _, a := range allowed {
				if fmt.Sprint(a) == remoteAddr {
					trustCustom = true
				}
			}
		}
	}
	for _, name := range headers {
		var value string
		switch {
		case name == "REMOTE_ADDR":
			value = remoteAddr
		case strings.HasPrefix(name, "HTTP_"):
			if !trustCustom {
				continue
			}
			value = r.Header.Get(strings.ReplaceAll(strings.TrimPrefix(name, "HTTP_"), "_", "-"))
		}
		for _, part := range strings.Split(value, ",") {
			if part = strings.TrimSpace(part); part != "" {
				return part
			}
		}
	}
	return ""
}
