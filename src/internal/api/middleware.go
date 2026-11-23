package api

import (
	"bufio"
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/ctrliq/ascender/internal/auth"
	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/extlog"
	"github.com/ctrliq/ascender/internal/models"
)

// sessionTouchSlack is how stale a session's expiry may be before a
// request extends it.
const sessionTouchSlack = 10 * time.Second

// setSessionCookie sends the session cookie, to last maxAge seconds.
func (s *Server) setSessionCookie(w http.ResponseWriter, key string, maxAge int) {
	http.SetCookie(w, &http.Cookie{Name: s.Cfg.SessionCookieName, Value: key, Path: "/", HttpOnly: true, Secure: s.Cfg.SessionCookieSecure, SameSite: http.SameSiteLaxMode, MaxAge: maxAge})
}

// sessionLifetime is SESSION_COOKIE_AGE from the database, else the config.
func (s *Server) sessionLifetime(r *http.Request) time.Duration {
	if n := s.Settings.Int(r.Context(), "SESSION_COOKIE_AGE"); n > 0 {
		return time.Duration(n) * time.Second
	}
	return s.Cfg.SessionCookieAge
}

// authenticate resolves the request's user. It returns an error only for
// credentials that were presented and rejected; absent credentials yield an
// anonymous request, which handlers turn into a 401 where needed.
func (s *Server) Authenticate(w http.ResponseWriter, r *http.Request) (*auth.User, error) {
	ctx := r.Context()
	s.syncTrustedOrigins(ctx)
	h := r.Header.Get("Authorization")
	// 1. OAuth2 bearer token, before the session, as DRF's
	// authentication classes ran: a request carrying both acts with the
	// token's scope. A token that is unknown or expired is no credential,
	// and the session is tried next.
	if strings.HasPrefix(strings.ToLower(h), "bearer ") {
		u, scopes, err := s.userForToken(r, strings.TrimSpace(h[7:]))
		if err != nil {
			return nil, err
		}
		if u != nil {
			u.AuthMethod = "token"
			u.OAuthScopes = scopes
			return u, nil
		}
	}
	// 2. Session cookie.
	if c, err := r.Cookie(s.Cfg.SessionCookieName); err == nil && c.Value != "" {
		sess, err := auth.GetSession(ctx, s.Q(), c.Value)
		if err == nil && sess.UserID != 0 && s.sessionBackendOK(ctx, sess) {
			u, err := auth.UserByID(ctx, s.Q(), sess.UserID)
			if err == nil && u.IsActive && s.sessionHashOK(ctx, sess, u) && s.localAuthRefused(ctx, u.ID) {
				// DisableLocalAuthMiddleware: a local-only user's session
				// ends once local logins are disabled.
				if err := auth.DeleteSession(ctx, s.Q(), sess.Key); err != nil {
					s.Log.ErrorContext(r.Context(), "ending a local user's session", "err", err)
				}
			} else if err == nil && u.IsActive && s.sessionHashOK(ctx, sess, u) {
				u.AuthMethod = "session"
				u.SessionKey = sess.Key
				if r.Header.Get("X-WS-Session-Quiet") == "" {
					life := s.sessionLifetime(r)
					expires := sess.Expires
					// SESSION_SAVE_EVERY_REQUEST, except within
					// sessionTouchSlack of the last save: a page and the
					// requests it sets off would each write the row.
					if time.Until(expires) < life-sessionTouchSlack {
						if err := auth.TouchSession(ctx, s.Q(), sess.Key, life); err != nil {
							s.Log.ErrorContext(r.Context(), "touching session", "err", err)
						} else {
							expires = time.Now().Add(life)
						}
					}
					// The cookie follows the session, as Django's
					// SessionMiddleware sent it again once
					// SessionTimeoutMiddleware had called set_expiry: set
					// only at login, it would end the session that long
					// after logging in however busy the user was. The
					// timeout the UI counts down is what is left of it.
					left := max(int(time.Until(expires)/time.Second), 1)
					s.setSessionCookie(w, sess.Key, left)
					w.Header().Set("Session-Timeout", itoa(int64(left)))
				}
				return u, nil
			}
		}
	}
	// 3. HTTP Basic.
	switch {
	case strings.HasPrefix(strings.ToLower(h), "basic "):
		if !s.Settings.Bool(ctx, "AUTH_BASIC_ENABLED") {
			return nil, nil
		}
		raw, err := base64.StdEncoding.DecodeString(strings.TrimSpace(h[6:]))
		if err != nil {
			return nil, Detail(http.StatusUnauthorized, "Invalid basic header. Credentials not correctly base64 encoded.")
		}
		username, password, ok := strings.Cut(string(raw), ":")
		if !ok {
			return nil, Detail(http.StatusUnauthorized, "Invalid basic header. Credentials not correctly base64 encoded.")
		}
		u, _ := s.authenticatePassword(ctx, username, password)
		if u == nil {
			return nil, Detail(http.StatusUnauthorized, "Invalid username/password.")
		}
		if !u.IsActive {
			return nil, Detail(http.StatusUnauthorized, "User inactive or deleted.")
		}
		u.AuthMethod = "basic"
		s.Log.InfoContext(r.Context(), "basic auth", "user", u.Username, "method", r.Method, "path", r.URL.Path)
		return u, nil
	}
	return nil, nil
}

// sessionHashOK is the session-verification half of get_user: the
// session must carry the hash of the user's current password. A session
// from before the hash was kept gets it now; one carrying another hash
// (the password changed since it logged in) is ended.
// localAuthRefused reports whether DISABLE_LOCAL_AUTH is on and the user
// is local only: no LDAP DN, social login or enterprise login, the test
// DisableLocalAuthMiddleware made. A lookup that fails refuses.
func (s *Server) localAuthRefused(ctx context.Context, userID int64) bool {
	if !s.Settings.Bool(ctx, "DISABLE_LOCAL_AUTH") {
		return false
	}
	var external bool
	err := s.Q().QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM sso_userenterpriseauth WHERE user_id = $1)
		OR EXISTS (SELECT 1 FROM social_auth_usersocialauth WHERE user_id = $1)
		OR COALESCE((SELECT ldap_dn FROM main_profile WHERE user_id = $1), '') <> ''`, userID).Scan(&external)
	return err != nil || !external
}

func (s *Server) sessionHashOK(ctx context.Context, sess *auth.Session, u *auth.User) bool {
	ok, present := auth.SessionHashOK(s.Cfg.SecretKey, sess, u)
	if ok {
		return true
	}
	if !present {
		sess.Data[auth.SessionHashKey] = auth.SessionAuthHash(s.Cfg.SecretKey, u)
		if err := auth.SaveSessionData(ctx, s.Q(), sess); err != nil {
			s.Log.ErrorContext(ctx, "saving session", "err", err)
		}
		return true
	}
	if err := auth.DeleteSession(ctx, s.Q(), sess.Key); err != nil {
		s.Log.ErrorContext(ctx, "deleting session", "err", err)
	}
	return false
}

// userForToken resolves an OAuth2 access token from main_oauth2accesstoken
// by its checksum, as django-oauth-toolkit looks tokens up. A token that is
// unknown or expired leaves the request anonymous (the toolkit's
// OAuth2Authentication returned None), so views that need a user answer 401.
func (s *Server) userForToken(r *http.Request, token string) (*auth.User, []string, error) {
	ctx := r.Context()
	var userID *int64
	var scope string
	var expires time.Time
	var id int64
	err := s.Q().QueryRow(ctx, `SELECT id, user_id, scope, expires FROM main_oauth2accesstoken WHERE token_checksum = $1`, models.TokenChecksum(token)).Scan(&id, &userID, &scope, &expires)
	if err != nil {
		if db.IsNoRows(err) {
			return nil, nil, nil
		}
		return nil, nil, err
	}
	if !time.Now().Before(expires) || userID == nil {
		return nil, nil, nil
	}
	u, err := auth.UserByID(ctx, s.Q(), *userID)
	if err != nil {
		return nil, nil, err
	}
	if !u.IsActive {
		return nil, nil, Detail(http.StatusUnauthorized, "User inactive or deleted.")
	}
	// The old application revoked local users' tokens when local logins
	// were disabled (conf/signals.py disable_local_auth); none works while
	// they are.
	if s.localAuthRefused(ctx, u.ID) {
		return nil, nil, nil
	}
	if _, err := s.Q().Exec(ctx, `UPDATE main_oauth2accesstoken SET last_used = now() WHERE id = $1`, id); err != nil {
		// Bookkeeping: the request goes on.
		s.Log.WarnContext(r.Context(), "token last_used", "token", id, "err", err)
	}
	s.Log.InfoContext(r.Context(), "token auth", "user", u.Username, "method", r.Method, "path", r.URL.Path, "token", id)
	return u, strings.Fields(scope), nil
}

// apiHeaderWriter adds the headers the old view's finalize_response and
// middleware set as the response starts: the time taken, and the
// authentication challenge on every 401.
type apiHeaderWriter struct {
	http.ResponseWriter
	start time.Time
	wrote bool
	// stats, with SQL debugging on, are reported as the response starts.
	stats *db.QueryStats
}

func (a *apiHeaderWriter) WriteHeader(code int) {
	if !a.wrote {
		a.wrote = true
		h := a.Header()
		h.Del(browsableNoView)
		h.Del(browsableInternalHTML)
		took := fmt.Sprintf("%0.3fs", time.Since(a.start).Seconds())
		if h.Get("X-API-Time") == "" {
			h.Set("X-API-Time", took)
		}
		h.Set("X-API-Total-Time", took)
		if a.stats != nil {
			h.Set("X-API-Query-Count", strconv.FormatInt(a.stats.Count(), 10))
			h.Set("X-API-Query-Time", fmt.Sprintf("%0.3fs", a.stats.Duration().Seconds()))
		}
		if code == http.StatusUnauthorized && h.Get("WWW-Authenticate") == "" {
			h.Set("WWW-Authenticate", `Bearer realm=api authorization_url=/api/o/authorize/`)
		}
	}
	a.ResponseWriter.WriteHeader(code)
}

func (a *apiHeaderWriter) Write(p []byte) (int, error) {
	if !a.wrote {
		a.WriteHeader(http.StatusOK)
	}
	return a.ResponseWriter.Write(p)
}

func (a *apiHeaderWriter) Flush() {
	if f, ok := a.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

func (a *apiHeaderWriter) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	if h, ok := a.ResponseWriter.(http.Hijacker); ok {
		return h.Hijack()
	}
	return nil, nil, fmt.Errorf("hijacking not supported")
}

func (a *apiHeaderWriter) Unwrap() http.ResponseWriter { return a.ResponseWriter }

func newRequestID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// Middleware authenticates, enforces CSRF for session users, adds the
// response headers the old API carried, and renders the browsable API for
// browsers.
func (s *Server) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer s.recoverPanic(w, r)
		start := time.Now()
		h := w.Header()
		h.Set("X-API-Product-Name", "Ascender")
		h.Set("X-API-Node", s.Cfg.ClusterHostID)
		requestID := newRequestID()
		h.Set("X-API-Request-Id", requestID)
		// django_guid's correlation id: the records this request makes
		// carry it.
		r = r.WithContext(extlog.WithGUID(r.Context(), requestID))
		h.Set("Access-Control-Expose-Headers", "X-API-Request-Id")
		h.Set("X-Frame-Options", "DENY")
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Referrer-Policy", "same-origin")
		h.Set("Cross-Origin-Opener-Policy", "same-origin")
		h.Set("Content-Security-Policy", ContentSecurityPolicy(""))
		if s.Cfg.SessionCookieSecure {
			h.Set("Strict-Transport-Security", "max-age=31536000")
		}
		h.Add("Vary", "Accept, Accept-Language, origin, Cookie")
		hw := &apiHeaderWriter{ResponseWriter: w, start: start}
		if s.Cfg.SQLDebug > 0 {
			var ctx context.Context
			ctx, hw.stats = s.WithQueryStats(r.Context(), requestID)
			r = r.WithContext(ctx)
		}
		w = hw
		// TimingMiddleware's performance record, once the response is out.
		defer func() { s.logPerformance(r, w.Header()) }()
		// CorsMiddleware ran before authentication and CSRF: a preflight
		// is answered here, whoever sends it.
		if s.cors(w, r) {
			return
		}

		// The webhook receivers authenticate nobody (authentication_classes
		// = (), csrf_exempt): the payload's signature is their check.
		if webhookReceiverPath.MatchString(r.URL.Path) {
			next.ServeHTTP(w, r)
			return
		}
		// The OAuth2 provider's token, revoke and authorize views are plain
		// Django views: the first two authenticate the client themselves
		// (csrf_exempt), the last reads the session.
		switch r.URL.Path {
		case "/api/o/token/", "/api/o/revoke_token/", "/api/o/authorize/":
			next.ServeHTTP(w, r)
			return
		}
		handler := next
		var u *auth.User
		var err error
		// Ping authenticates nobody (ApiV2PingView.authentication_classes
		// = ()): it is public and leaves the session alone.
		if r.URL.Path != "/api/v2/ping/" {
			u, err = s.Authenticate(w, r)
		}
		switch {
		case err != nil:
			handler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { WriteError(w, err) })
		case u != nil && u.AuthMethod == "token" && !safeMethod(r.Method) && !u.CanWrite() && r.URL.Path != "/api/login/" && r.URL.Path != "/api/logout/":
			// APIView.check_permissions: a token without the write scope
			// reads only, whatever view it reaches. Handlers check it
			// too; this is the check none of them can forget.
			handler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { writeRefusal(w, r, ErrForbidden) })
		case u != nil && u.AuthMethod == "session" && !safeMethod(r.Method) && !auth.CSRFOK(r):
			reason := auth.CSRFError(r)
			handler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				writeRefusal(w, r, Detail(http.StatusForbidden, "CSRF Failed: "+reason))
			})
		}
		if safeMethod(r.Method) {
			r = r.WithContext(WithReadMemo(r.Context()))
		} else {
			r = r.WithContext(withoutReadMemo(r.Context()))
		}
		if err == nil && u != nil {
			// finalize_response named the version to authenticated users only.
			h.Set("X-API-Product-Version", s.Cfg.Version)
			r = r.WithContext(auth.WithUser(r.Context(), u))
		}
		if s.wantsBrowsable(r, next) {
			tok := auth.EnsureCSRFCookie(w, r, s.Cfg.SessionCookieSecure)
			r = r.WithContext(withCSRFToken(r.Context(), tok))
			s.browsable(w, r, handler, next, start)
			return
		}
		handler.ServeHTTP(w, r)
	})
}

// The CORS headers django-cors-headers sent with the old settings, which
// left everything but CORS_ALLOWED_ORIGINS at its default: no credentials,
// its default headers and methods, a day's preflight cache.
const (
	corsAllowHeaders = "accept, authorization, content-type, user-agent, x-csrftoken, x-requested-with"
	corsAllowMethods = "DELETE, GET, OPTIONS, PATCH, POST, PUT"
	corsMaxAge       = "86400"
)

// cors is CorsMiddleware: the Access-Control headers for an origin in
// CORS_ALLOWED_ORIGINS (ASCENDER_CORS_ALLOWED_ORIGINS), and the empty 200
// that answers every preflight, an OPTIONS carrying
// Access-Control-Request-Method, allowed origin or not (the browser then
// refuses what lacks the headers). It reports whether it answered. An
// ordinary OPTIONS still gets the API's metadata.
func (s *Server) cors(w http.ResponseWriter, r *http.Request) bool {
	h := w.Header()
	if origin := r.Header.Get("Origin"); origin != "" && corsOriginAllowed(s.Cfg.CORSAllowedOrigins, origin) {
		h.Set("Access-Control-Allow-Origin", origin)
		if r.Method == http.MethodOptions {
			h.Set("Access-Control-Allow-Headers", corsAllowHeaders)
			h.Set("Access-Control-Allow-Methods", corsAllowMethods)
			h.Set("Access-Control-Max-Age", corsMaxAge)
		}
	}
	if _, preflight := r.Header["Access-Control-Request-Method"]; !preflight || r.Method != http.MethodOptions {
		return false
	}
	// The response came from the middleware, before the views and the
	// locale middleware that vary it on Accept and Accept-Language.
	h.Set("Vary", "origin")
	h.Set("Content-Type", "text/html; charset=utf-8")
	h.Set("Content-Length", "0")
	w.WriteHeader(http.StatusOK)
	return true
}

// corsOriginAllowed is origin_found_in_white_lists: "null" when listed, or
// an origin whose scheme and host[:port] are a listed origin's, as
// urlsplit splits them.
func corsOriginAllowed(allowed []string, origin string) bool {
	if len(allowed) == 0 {
		return false
	}
	scheme, netloc, ok := urlsplitOrigin(origin)
	if !ok {
		return false
	}
	for _, a := range allowed {
		if a == "null" && origin == "null" {
			return true
		}
		if as, an, ok := urlsplitOrigin(a); ok && as == scheme && an == netloc {
			return true
		}
	}
	return false
}

// urlsplitOrigin is the scheme (lowercased) and netloc of urlsplit, and
// false where it raised ValueError (an unclosed IPv6 bracket).
func urlsplitOrigin(raw string) (string, string, bool) {
	raw = strings.TrimLeft(raw, "\x00\x01\x02\x03\x04\x05\x06\x07\x08\t\n\x0b\x0c\r\x0e\x0f\x10\x11\x12\x13\x14\x15\x16\x17\x18\x19\x1a\x1b\x1c\x1d\x1e\x1f ")
	raw = strings.NewReplacer("\t", "", "\r", "", "\n", "").Replace(raw)
	scheme, rest := "", raw
	if i := strings.Index(raw, ":"); i > 0 && (raw[0] >= 'a' && raw[0] <= 'z' || raw[0] >= 'A' && raw[0] <= 'Z') {
		valid := true
		for _, c := range raw[:i] {
			if !(c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c == '+' || c == '-' || c == '.') {
				valid = false
				break
			}
		}
		if valid {
			scheme, rest = strings.ToLower(raw[:i]), raw[i+1:]
		}
	}
	netloc := ""
	if strings.HasPrefix(rest, "//") {
		netloc = rest[2:]
		if i := strings.IndexAny(netloc, "/?#"); i >= 0 {
			netloc = netloc[:i]
		}
	}
	if strings.Contains(netloc, "[") != strings.Contains(netloc, "]") {
		return "", "", false
	}
	return scheme, netloc, true
}

// ContentSecurityPolicy is the policy every HTML page is served with:
// scripts only from this server, plus the inline blocks carrying nonce
// (none for the API's pages), so markup that slips into a page cannot run
// script; no plugins, no <base> rewriting, no framing. Inline styles stay
// allowed: the PatternFly markup sets them throughout.
func ContentSecurityPolicy(nonce string) string {
	script := "script-src 'self'"
	if nonce != "" {
		script += " 'nonce-" + nonce + "'"
	}
	// form-action: default-src does not cover form submissions, so markup
	// slipped into a page could otherwise post (a password) anywhere.
	return "default-src 'self'; " + script + "; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
}

// AllowFormTargets widens the response's form-action to sources besides
// 'self', for a page whose own form ends in a redirect elsewhere (browsers
// apply form-action to the redirects too): the login page's SSO buttons,
// the OAuth authorization form's redirect_uri.
func AllowFormTargets(w http.ResponseWriter, sources ...string) {
	h := w.Header()
	csp := h.Get("Content-Security-Policy")
	if csp == "" || len(sources) == 0 {
		return
	}
	h.Set("Content-Security-Policy", strings.Replace(csp, "form-action 'self'", "form-action 'self' "+strings.Join(sources, " "), 1))
}

func safeMethod(m string) bool {
	return m == http.MethodGet || m == http.MethodHead || m == http.MethodOptions || m == http.MethodTrace
}

// WithQueryStats attaches SQL statement counting to ctx (keeping any
// already there, so in-process sub-requests add to their parent's).
func (s *Server) WithQueryStats(ctx context.Context, requestID string) (context.Context, *db.QueryStats) {
	return db.WithQueryStats(ctx, func() *db.QueryStats {
		st := &db.QueryStats{ID: requestID}
		if s.Cfg.SQLDebug > 1 {
			st.Log = s.Log
		}
		return st
	})
}

// writeRefusal writes a 403 the middleware decides itself. As
// api_exception_handler did for every refusal, one of a request whose
// named URL was rewritten is a 404 "Not found." without an Allow header,
// so a named URL never confirms that the object exists.
func writeRefusal(w http.ResponseWriter, r *http.Request, err error) {
	if namedURLRewritten(r.Context()) {
		w.Header().Del("Allow")
		WriteError(w, ErrNotFound)
		return
	}
	WriteError(w, err)
}
