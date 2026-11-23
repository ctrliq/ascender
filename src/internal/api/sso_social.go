package api

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"golang.org/x/text/unicode/norm"

	"github.com/ctrliq/ascender/internal/auth"
	"github.com/ctrliq/ascender/internal/crypto"
	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/extlog"
	"github.com/ctrliq/ascender/internal/sso"
)

// Social logins: the python-social-auth flow under /sso/ and the pipeline
// Ascender ran on it (SOCIAL_AUTH_PIPELINE).

// ssoFileDefaults are the social settings the old settings file set that
// were never in the database.
var ssoFileDefaults = map[string]any{
	"SOCIAL_AUTH_GOOGLE_OAUTH2_SCOPE":                  []any{"profile"},
	"SOCIAL_AUTH_GITHUB_SCOPE":                         []any{"user:email", "read:org"},
	"SOCIAL_AUTH_GITHUB_ORG_SCOPE":                     []any{"user:email", "read:org"},
	"SOCIAL_AUTH_GITHUB_TEAM_SCOPE":                    []any{"user:email", "read:org"},
	"SOCIAL_AUTH_GITHUB_ENTERPRISE_SCOPE":              []any{"user:email", "read:org"},
	"SOCIAL_AUTH_GITHUB_ENTERPRISE_ORG_SCOPE":          []any{"user:email", "read:org"},
	"SOCIAL_AUTH_GITHUB_ENTERPRISE_TEAM_SCOPE":         []any{"user:email", "read:org"},
	"SOCIAL_AUTH_AZUREAD_OAUTH2_AUTHORITY_HOST":        nil,
	"SOCIAL_AUTH_AZUREAD_TENANT_OAUTH2_AUTHORITY_HOST": nil,
}

// settingOrAbsent is a setting's value; nil when unknown or None, which
// the old settings wrapper treated as absent.
func (s *Server) settingOrAbsent(ctx context.Context, key string) any {
	if _, ok := s.Settings.Registry.Field(key); ok {
		v, _ := s.Settings.Get(ctx, key)
		return v
	}
	return ssoFileDefaults[key]
}

// socialSetting is backend.setting(NAME): SOCIAL_AUTH_<B>_<NAME>, then
// SOCIAL_AUTH_<NAME>.
func (s *Server) socialSetting(ctx context.Context, backend, name string) any {
	if v := s.settingOrAbsent(ctx, sso.SettingPrefix(backend)+name); v != nil {
		return v
	}
	return s.settingOrAbsent(ctx, "SOCIAL_AUTH_"+name)
}

// requiredBackendSettings is REQUIRED_BACKEND_SETTINGS for the social
// backends.
var requiredBackendSettings = map[string][]string{
	sso.Google:               {"KEY", "SECRET"},
	sso.GitHub:               {"KEY", "SECRET"},
	sso.GitHubOrg:            {"KEY", "SECRET", "NAME"},
	sso.GitHubTeam:           {"KEY", "SECRET", "ID"},
	sso.GitHubEnterprise:     {"URL", "API_URL", "KEY", "SECRET"},
	sso.GitHubEnterpriseOrg:  {"URL", "API_URL", "KEY", "SECRET", "NAME"},
	sso.GitHubEnterpriseTeam: {"URL", "API_URL", "KEY", "SECRET", "ID"},
	sso.OIDC:                 {"KEY", "SECRET", "OIDC_ENDPOINT"},
	sso.AzureAD:              {"KEY", "SECRET"},
	sso.AzureADTenant:        {"KEY", "SECRET", "TENANT_ID"},
	sso.EntraID:              {"KEY", "SECRET", "TENANT_ID"},
	sso.SAML:                 {"SP_ENTITY_ID", "SP_PUBLIC_CERT", "SP_PRIVATE_KEY", "ORG_INFO", "TECHNICAL_CONTACT", "SUPPORT_CONTACT", "ENABLED_IDPS"},
}

func fileExists(p string) bool {
	if p == "" {
		return false
	}
	st, err := os.Stat(p)
	return err == nil && st.Mode().IsRegular()
}

// clientAssertionAvailable: the Azure family may go without a secret.
func (s *Server) clientAssertionAvailable(ctx context.Context, backend string) bool {
	env := os.Getenv("OAUTH2_FEDERATED_TOKEN_FILE")
	if env == "" {
		env = os.Getenv("AZURE_FEDERATED_TOKEN_FILE")
	}
	if fileExists(env) {
		return true
	}
	p := sso.SettingPrefix(backend)
	if pyTruthy(s.settingOrAbsent(ctx, p+"CLIENT_ASSERTION")) {
		return true
	}
	f, _ := s.settingOrAbsent(ctx, p+"FEDERATED_TOKEN_FILE").(string)
	return fileExists(f)
}

// backendEnabled is whether AUTHENTICATION_BACKENDS lists the backend.
func (s *Server) backendEnabled(ctx context.Context, name string) bool {
	req, ok := requiredBackendSettings[name]
	if !ok {
		return false
	}
	p := sso.SettingPrefix(name)
	for _, k := range req {
		if pyTruthy(s.settingOrAbsent(ctx, p+k)) {
			continue
		}
		if k == "SECRET" && (name == sso.AzureAD || name == sso.AzureADTenant || name == sso.EntraID) && s.clientAssertionAvailable(ctx, name) {
			continue
		}
		return false
	}
	return true
}

// enabledSocialBackends are the social backends in the order
// /api/v2/auth/ lists them: google-oauth2 as "g", then by name.
func (s *Server) enabledSocialBackends(ctx context.Context) []string {
	var out []string
	for _, n := range append(append([]string{}, sso.OAuthBackends...), sso.SAML) {
		if s.backendEnabled(ctx, n) {
			out = append(out, n)
		}
	}
	key := func(n string) string {
		if n == sso.Google {
			return "g"
		}
		return n
	}
	for i := 1; i < len(out); i++ {
		for j := i; j > 0 && key(out[j]) < key(out[j-1]); j-- {
			out[j], out[j-1] = out[j-1], out[j]
		}
	}
	return out
}

// requestHost is request.get_host(): the Host header as sent.
func requestHost(r *http.Request) string { return r.Host }

func requestScheme(r *http.Request) string { return RequestScheme(r) }

// RequestScheme is the scheme the browser used: https over TLS, or when a
// TLS-terminating proxy in front says so (X-Forwarded-Proto: https, which
// the operator's edge-terminated routes and most ingresses send). SSO
// builds its redirect_uri, ACS URL and Destination from it, and an
// identity provider refuses an http one; the settings page, the browsable
// API and the UI show the same.
func RequestScheme(r *http.Request) string {
	if r.TLS != nil || strings.EqualFold(strings.TrimSpace(r.Header.Get("X-Forwarded-Proto")), "https") {
		return "https"
	}
	return "http"
}

// absoluteURI is build_absolute_uri(path).
func absoluteURI(r *http.Request, path string) string {
	return requestScheme(r) + "://" + requestHost(r) + path
}

// newBackend builds the backend for a request.
func (s *Server) newBackend(r *http.Request, name string) *sso.Backend {
	ctx := r.Context()
	return &sso.Backend{
		Name:        name,
		RedirectURI: absoluteURI(r, "/sso/complete/"+name+"/"),
		Setting:     func(n string) any { return s.socialSetting(ctx, name, n) },
		Nonces:      &nonceStore{s: s},
		Log:         s.Log,
	}
}

// nonceStore keeps OIDC nonces in social_auth_association.
type nonceStore struct{ s *Server }

func (n *nonceStore) Save(ctx context.Context, serverURL, nonce, state string) error {
	_, err := n.s.Q().Exec(ctx, `INSERT INTO social_auth_association (server_url, handle, secret, issued, lifetime, assoc_type) VALUES ($1, $2, '', 0, 0, $3)
		ON CONFLICT (server_url, handle) DO UPDATE SET secret = '', issued = 0, lifetime = 0, assoc_type = EXCLUDED.assoc_type`, truncateRunes(serverURL, 255), nonce, truncateRunes(state, 64))
	return err
}

func (n *nonceStore) Take(ctx context.Context, serverURL, nonce string) (bool, error) {
	tag, err := n.s.Q().Exec(ctx, `DELETE FROM social_auth_association WHERE id = (SELECT id FROM social_auth_association WHERE server_url = $1 AND handle = $2 ORDER BY id LIMIT 1)`, truncateRunes(serverURL, 255), nonce)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

// ---------------------------------------------------------------- session

// ssoSession is the request's Django session, anonymous or not.
type ssoSession struct {
	*auth.Session
	changed bool
	// newCookie: the session's row exists but its cookie is not out yet.
	newCookie bool
}

func (ss *ssoSession) str(k string) string {
	v, _ := ss.Data[k].(string)
	return v
}

func (ss *ssoSession) set(k string, v any) {
	ss.Data[k] = v
	ss.changed = true
}

func (ss *ssoSession) pop(k string) {
	if _, ok := ss.Data[k]; ok {
		delete(ss.Data, k)
		ss.changed = true
	}
}

// loadSSOSession reads the session cookie's session, or starts an empty
// one that is saved only once something is put in it.
func (s *Server) loadSSOSession(r *http.Request) *ssoSession {
	if c, err := r.Cookie(s.Cfg.SessionCookieName); err == nil && c.Value != "" {
		if sess, err := auth.GetSession(r.Context(), s.Q(), c.Value); err == nil {
			return &ssoSession{Session: sess}
		}
	}
	return &ssoSession{Session: &auth.Session{Data: map[string]any{}}}
}

// saveSSOSession writes a changed session, creating the anonymous one and
// its cookie when there was none.
func (s *Server) saveSSOSession(w http.ResponseWriter, r *http.Request, ss *ssoSession) error {
	ctx := r.Context()
	life := s.sessionLifetime(r)
	if ss.changed {
		if ss.Key == "" {
			sess, err := auth.CreateSessionData(ctx, s.Q(), ss.UserID, life, ss.Data)
			if err != nil {
				return err
			}
			ss.Session = sess
			ss.newCookie = true
		} else if err := auth.SaveSessionData(ctx, s.Q(), ss.Session); err != nil {
			return err
		}
		ss.changed = false
	}
	if ss.newCookie {
		s.setSessionCookie(w, ss.Key, int(life/time.Second))
		ss.newCookie = false
	}
	return nil
}

// ---------------------------------------------------------------- errors

// ssoUserError is one of the pipeline errors whose message the login page
// shows (AuthInactive, AuthNotFound, ExternalLoginCollision).
type ssoUserError struct{ msg string }

func (e *ssoUserError) Error() string { return e.msg }

func errAuthInactive() error { return &ssoUserError{"Your account is inactive"} }

func errAuthNotFound(what string) error {
	return &ssoUserError{"An account cannot be found for " + what}
}

// ssoMessage is get_message: the text with a full stop.
func ssoMessage(err error) string {
	msg := err.Error()
	if msg != "" && !strings.ContainsAny(msg[len(msg)-1:], ".?!") {
		msg += "."
	}
	return msg
}

// ssoFail is SocialAuthMiddleware.process_exception: log, remember the
// message for the login page, and send the browser back.
func (s *Server) ssoFail(w http.ResponseWriter, r *http.Request, ss *ssoSession, backend string, err error) {
	message := ssoMessage(err)
	name := backend
	if name == "" {
		name = "unknown-backend"
	}
	if last := ss.str("social_auth_last_backend"); last != name {
		name = last
		if d := r.URL.Query().Get("error_description"); d != "" {
			message = d
		}
	}
	full := name
	if rs, ok := requestData(r, "RelayState"); ok {
		full = name + ":" + rs
	}
	s.Log.ErrorContext(r.Context(), message, extlog.LoggerAttr, "social")
	display := "Sign-in could not be completed. Please try again."
	var ue *ssoUserError
	if errors.As(err, &ue) {
		display = ssoMessage(ue)
	}
	ss.set("social_auth_error", []any{full, display})
	// next may come from a RelayState the IdP-initiated response carried:
	// checked as the success path checks it.
	target := sanitizeRedirect([]string{requestHost(r)}, ss.str("next"))
	if target == "" {
		target = "/sso/error/"
	}
	_ = s.saveSSOSession(w, r, ss)
	neverCache(w)
	http.Redirect(w, r, target, http.StatusFound)
}

// requestData is the merged GET and POST data, POST winning.
func requestData(r *http.Request, k string) (string, bool) {
	_ = r.ParseForm()
	if vs, ok := r.PostForm[k]; ok && len(vs) > 0 {
		return vs[len(vs)-1], true
	}
	if vs, ok := r.URL.Query()[k]; ok && len(vs) > 0 {
		return vs[len(vs)-1], true
	}
	return "", false
}

// neverCache is Django's never_cache.
func neverCache(w http.ResponseWriter) {
	h := w.Header()
	if h.Get("Expires") == "" {
		h.Set("Expires", time.Now().UTC().Format(http.TimeFormat))
	}
	h.Set("Cache-Control", "max-age=0, no-cache, no-store, must-revalidate, private")
}

// ---------------------------------------------------------------- redirects

// sanitizeRedirect is social_core's sanitize_redirect.
func sanitizeRedirect(hosts []string, to string) string {
	if to == "" || strings.HasPrefix(to, "///") || strings.Contains(to, `\`) || hasURLControl(to) {
		return ""
	}
	p := strings.TrimLeft(to, "\x00\x01\x02\x03\x04\x05\x06\x07\x08\t\n\x0b\x0c\r\x0e\x0f\x10\x11\x12\x13\x14\x15\x16\x17\x18\x19\x1a\x1b\x1c\x1d\x1e\x1f ")
	scheme := ""
	if i := strings.Index(p, ":"); i > 0 && isSchemeStart(p[0]) && strings.Trim(p[:i], "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+.-") == "" {
		scheme = strings.ToLower(p[:i])
		p = p[i+1:]
	}
	netloc := ""
	if strings.HasPrefix(p, "//") {
		rest := p[2:]
		end := strings.IndexAny(rest, "/?#")
		if end < 0 {
			end = len(rest)
		}
		netloc = rest[:end]
	}
	if scheme != "" {
		if scheme != "http" && scheme != "https" {
			return ""
		}
		if netloc == "" {
			return ""
		}
	}
	if netloc == "" {
		netloc = hosts[0]
	}
	for _, h := range hosts {
		if h == netloc {
			return to
		}
	}
	return ""
}

func isSchemeStart(c byte) bool { return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') }

// urlLike is setting_url's test for a value used as it is.
func urlLike(v string) bool {
	return strings.HasPrefix(v, "http://") || strings.HasPrefix(v, "https://") || strings.HasPrefix(v, "/")
}

// completeRedirect is do_complete's choice of where to go after a login.
func (s *Server) completeRedirect(r *http.Request, ss *ssoSession, isNew bool) string {
	redirectValue := ss.str("next")
	if redirectValue == "" {
		redirectValue, _ = requestData(r, "next")
	}
	target := "/sso/complete/"
	if redirectValue != "" && urlLike(redirectValue) {
		target = redirectValue
	}
	if redirectValue != "" && redirectValue != target {
		sep := "?"
		if strings.Contains(target, "?") {
			sep = "&"
		}
		target += sep + "next=" + pyQuoteSlash(redirectValue)
	}
	if t := sanitizeRedirect([]string{requestHost(r)}, target); t != "" {
		return t
	}
	return "/sso/complete/"
}

// pyQuoteSlash is urllib.parse.quote with "/" safe.
func pyQuoteSlash(s string) string {
	var b strings.Builder
	for _, c := range []byte(s) {
		if (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || strings.IndexByte("_.-~/", c) >= 0 {
			b.WriteByte(c)
		} else {
			fmt.Fprintf(&b, "%%%02X", c)
		}
	}
	return b.String()
}

// ---------------------------------------------------------------- views

// SSORoutes serves /sso/.
func (s *Server) SSORoutes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/sso/login/{backend}/{$}", s.ssoLogin)
	mux.HandleFunc("/sso/complete/{backend}/{$}", s.ssoComplete)
	mux.HandleFunc("/sso/complete/{$}", s.ssoCompleteView)
	mux.HandleFunc("/sso/error/{$}", s.ssoBaseRedirect)
	mux.HandleFunc("/sso/inactive/{$}", s.ssoBaseRedirect)
	mux.HandleFunc("/sso/metadata/saml/{$}", s.samlMetadataView)
	return LanguageHandler(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// No one is signed in yet: a form here (a SAML response, an OAuth
		// callback, an LDAP login) is small, and parsing 64 MiB of one per
		// unauthenticated request would exhaust memory.
		r.Body = http.MaxBytesReader(w, r.Body, MaxLoginBody)
		requestID := newRequestID()
		w.Header().Set("X-API-Request-Id", requestID)
		ctx := extlog.WithGUID(r.Context(), requestID)
		if u := s.sessionUser(r); u != nil {
			u.AuthMethod = "session"
			ctx = auth.WithUser(ctx, u)
		}
		mux.ServeHTTP(w, r.WithContext(ctx))
	}))
}

// ssoBaseRedirect is BaseRedirectView: a permanent redirect to the UI,
// back to the page the browser was on.
func (s *Server) ssoBaseRedirect(w http.ResponseWriter, r *http.Request) {
	http.Redirect(w, r, ssoUIURL(r), http.StatusMovedPermanently)
}

func ssoUIURL(r *http.Request) string {
	u := "/"
	if c, err := r.Cookie("lastPath"); err == nil && c.Value != "" {
		v, _ := url.PathUnescape(c.Value)
		v = strings.Trim(v, `"`)
		if v != "" {
			return u + "#" + pyQuoteSlash(v)
		}
	}
	return u
}

// ssoCompleteView is CompleteView: the redirect, plus the UI's cookie
// once the login has happened.
func (s *Server) ssoCompleteView(w http.ResponseWriter, r *http.Request) {
	if u := auth.UserFrom(r.Context()); u != nil {
		s.Log.InfoContext(r.Context(), fmt.Sprintf("User %s logged in", u.Username), extlog.LoggerAttr, "ascender.sso.views")
		http.SetCookie(w, &http.Cookie{Name: s.Cfg.LoggedInCookieName, Value: "true", Path: "/", Secure: s.Cfg.SessionCookieSecure, SameSite: http.SameSiteLaxMode})
		if w.Header().Get("X-API-Session-Cookie-Name") == "" {
			w.Header().Set("X-API-Session-Cookie-Name", s.Cfg.SessionCookieName)
		}
	}
	s.ssoBaseRedirect(w, r)
}

// ssoLogin is social:begin.
func (s *Server) ssoLogin(w http.ResponseWriter, r *http.Request) {
	neverCache(w)
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST")
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	_ = r.ParseForm()
	if !auth.CSRFOK(r) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.WriteHeader(http.StatusForbidden)
		fmt.Fprint(w, "<h1>Forbidden (403)</h1><p>CSRF verification failed. Request aborted.</p>")
		return
	}
	name := r.PathValue("backend")
	ss := s.loadSSOSession(r)
	ss.set("social_auth_last_backend", name)
	ctx := r.Context()
	if !s.backendEnabled(ctx, name) {
		s.ssoFail(w, r, ss, "", errors.New("Backend not found"))
		return
	}
	// do_auth: next from the POST body alone.
	if vs, ok := r.PostForm["next"]; ok {
		v := ""
		if len(vs) > 0 {
			v = vs[len(vs)-1]
		}
		v = sanitizeRedirect([]string{requestHost(r)}, v)
		if v == "" {
			v = "/sso/complete/"
		}
		ss.set("next", v)
	}
	var target string
	var err error
	if name == sso.SAML {
		target, err = s.samlBegin(w, r, ss)
	} else {
		b := s.newBackend(r, name)
		// A state per login, consumed by its callback: one kept for the
		// session's life (and carried into the signed-in session) would
		// let a leaked callback URL's state link an attacker's identity to
		// whoever is signed in.
		state := sso.RandomString(32)
		ss.set(name+"_state", state)
		target, err = b.AuthURL(ctx, state)
	}
	if err != nil {
		s.ssoFail(w, r, ss, name, err)
		return
	}
	if err := s.saveSSOSession(w, r, ss); err != nil {
		s.ssoFail(w, r, ss, name, err)
		return
	}
	w.Header().Set("Location", target)
	w.WriteHeader(http.StatusFound)
}

// ssoComplete is social:complete.
func (s *Server) ssoComplete(w http.ResponseWriter, r *http.Request) {
	neverCache(w)
	ctx := r.Context()
	name := r.PathValue("backend")
	_ = r.ParseForm()
	if name == sso.SAML {
		s.samlComplete(w, r)
		return
	}
	ss := s.loadSSOSession(r)
	if !s.backendEnabled(ctx, name) {
		s.ssoFail(w, r, ss, "", errors.New("Backend not found"))
		return
	}
	if tok, _ := requestData(r, "partial_token"); tok != "" {
		target := sanitizeRedirect([]string{requestHost(r)}, "/sso/error/")
		http.Redirect(w, r, target, http.StatusFound)
		return
	}
	b := s.newBackend(r, name)
	state := ss.str(name + "_state")
	ss.pop(name + "_state")
	response, err := b.Complete(ctx, func(k string) (string, bool) { return requestData(r, k) }, state)
	if err != nil {
		s.ssoFail(w, r, ss, name, err)
		return
	}
	current := auth.UserFrom(ctx)
	p := &socialPipeline{s: s, ctx: ctx, b: b, name: name, response: response, current: current}
	u, err := p.run()
	if err != nil {
		s.ssoFail(w, r, ss, name, err)
		return
	}
	if current != nil {
		// Already signed in: the account is linked, nobody logs in.
		_ = s.saveSSOSession(w, r, ss)
		http.Redirect(w, r, s.completeRedirect(r, ss, false), http.StatusFound)
		return
	}
	target := s.completeRedirect(r, ss, p.isNew)
	if err := s.ssoStartSession(w, r, ss, u, sso.BackendPaths[name], name); err != nil {
		s.ssoFail(w, r, ss, name, err)
		return
	}
	http.Redirect(w, r, target, http.StatusFound)
}

// ssoStartSession is login(): the anonymous session's data carried into a
// new session for the user, with the backend that signed them in.
func (s *Server) ssoStartSession(w http.ResponseWriter, r *http.Request, ss *ssoSession, u *auth.User, backendPath, provider string) error {
	data := map[string]any{}
	if ss.Key == "" || ss.UserID == 0 || ss.UserID == u.ID {
		for k, v := range ss.Data {
			data[k] = v
		}
	}
	// A login's OAuth state belongs to that login alone.
	for k := range data {
		if strings.HasSuffix(k, "_state") {
			delete(data, k)
		}
	}
	// The middleware dropped these on the first request after the login.
	delete(data, "social_auth_error")
	delete(data, "social_auth_last_backend")
	delete(data, "_session_expiry")
	data["_auth_user_backend"] = backendPath
	data["social_auth_last_login_backend"] = provider
	if ss.Key != "" {
		if err := auth.DeleteSession(r.Context(), s.Q(), ss.Key); err != nil {
			return err
		}
	}
	if _, err := s.startSession(w, r, u, data); err != nil {
		return err
	}
	return nil
}

// ---------------------------------------------------------------- pipeline

// socialRow is a social_auth_usersocialauth row.
type socialRow struct {
	ID        int64
	UserID    int64
	ExtraData map[string]any
}

// socialPipeline is one run of SOCIAL_AUTH_PIPELINE.
type socialPipeline struct {
	s        *Server
	ctx      context.Context
	b        *sso.Backend
	name     string
	response map[string]any
	current  *auth.User

	details  map[string]any
	uid      string
	user     *auth.User
	social   *socialRow
	isNew    bool
	username *string

	// saml carries what the SAML backend knows (attributes, IdP).
	saml *samlLogin
}

func (s *Server) socialByUID(ctx context.Context, q db.Querier, provider, uid string) (*socialRow, error) {
	var row socialRow
	var extra []byte
	err := q.QueryRow(ctx, `SELECT id, user_id, extra_data FROM social_auth_usersocialauth WHERE provider = $1 AND uid = $2`, provider, uid).Scan(&row.ID, &row.UserID, &extra)
	if err != nil {
		if db.IsNoRows(err) {
			return nil, nil
		}
		return nil, err
	}
	row.ExtraData = map[string]any{}
	if len(extra) > 0 {
		if v, err := sso.DecodeJSON(extra); err == nil {
			if m, ok := v.(map[string]any); ok {
				row.ExtraData = m
			}
		}
	}
	return &row, nil
}

func (p *socialPipeline) setting(name string) any { return p.s.socialSetting(p.ctx, p.name, name) }

// userFields is USER_FIELDS (["username", "email"] unless set).
func (p *socialPipeline) userFields() []string {
	v := p.setting("USER_FIELDS")
	l, ok := v.([]any)
	if !ok {
		return []string{"username", "email"}
	}
	out := []string{}
	for _, x := range l {
		out = append(out, sso.PyStr(x))
	}
	return out
}

var nonASCII = regexp.MustCompile(`[^\x00-\x7F]+`)
var notUsernameChars = regexp.MustCompile(`[^\w.@+_-]+`)

// cleanUsername is storage.user.clean_username.
func cleanUsername(v string) string {
	return notUsernameChars.ReplaceAllString(nonASCII.ReplaceAllString(v, ""), "")
}

func firstRunes(s string, n int) string { return truncateRunes(s, n) }

func uuidHex() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return hex.EncodeToString(b)
}

// desiredUsername is _desired_username.
func (p *socialPipeline) desiredUsername() string {
	if !contains(p.userFields(), "username") {
		return ""
	}
	var username string
	if email, ok := p.details["email"].(string); ok && email != "" && pyTruthy(p.setting("USERNAME_IS_FULL_EMAIL")) {
		username = email
	} else {
		u, ok := p.details["username"].(string)
		if !ok || u == "" {
			return ""
		}
		username = u
	}
	return cleanUsername(firstRunes(username, 150))
}

// The match ignores case, as the LDAP backend's local-account guard does:
// an SSO login creating "Alice" beside an LDAP "alice" would lock the LDAP
// user out (every login of theirs refused as a local account's).
func (p *socialPipeline) usernameTaken(name string) (int64, bool) {
	var id int64
	err := p.s.Q().QueryRow(p.ctx, `SELECT id FROM auth_user WHERE lower(username) = lower($1) ORDER BY id LIMIT 1`, name).Scan(&id)
	return id, err == nil
}

// collision is _collision: logged, refused with a request ID.
func (p *socialPipeline) collision(reason string, blockers []int64) error {
	requestID := fmt.Sprint(extlog.GUID(p.ctx))
	if requestID == "" || requestID == "<nil>" {
		requestID = uuidHex()
	}
	msg := "Sign-in could not be completed because your username is already in use by another Ascender account."
	if reason == "ambiguous_email" {
		msg = "Sign-in could not be completed because more than one Ascender account uses your email address."
	}
	var bl []string
	for _, id := range blockers {
		name := colOf[string](p.ctx, p.s.Q(), "auth_user", "username", id)
		bl = append(bl, fmt.Sprintf("%d:%s", id, sanitizeLogValue(name)))
	}
	p.s.ssoLog("ascender.sso.social_base_pipeline").Warn(fmt.Sprintf("External login collision action=deny provider=%s uid=%s username=%s email=%s reason=%s request_id=%s blockers=%s",
		sanitizeLogValue(p.name), sanitizeLogValue(p.uid), sanitizeLogValue(sso.PyStr(p.details["username"])), sanitizeLogValue(sso.PyStr(p.details["email"])), reason, sanitizeLogValue(requestID), strings.Join(bl, ",")))
	return &ssoUserError{msg + " Contact your system administrator and reference request ID " + requestID + "."}
}

// sanitizeLogValue keeps a value on one log line.
func sanitizeLogValue(v string) string {
	return strings.NewReplacer("\r", "\\r", "\n", "\\n", "\t", "\\t").Replace(v)
}

func (p *socialPipeline) usersByEmail(email string) ([]int64, error) {
	if email == "" {
		return nil, nil
	}
	rows, err := p.s.Q().Query(p.ctx, `SELECT id FROM auth_user WHERE UPPER(email::text) = UPPER($1) AND is_active ORDER BY id`, email)
	if err != nil {
		return nil, err
	}
	return db.Collect(rows, func(r pgx.Rows) (int64, error) {
		var id int64
		err := r.Scan(&id)
		return id, err
	})
}

// emailLinkAllowed decides whether a first login may take over the
// existing account its email matches (associate_by_email). The email is
// only what the provider says, and some let users set it freely (a
// multi-tenant Entra tenant, a self-service IdP), so an account that
// holds more than that address is never handed over by it: a superuser
// or system auditor, or a local account with a usable password, has to
// sign in itself and link the provider from its own session. A provider
// that says the address is unverified links nothing.
//
// Nor is an account already bound to another identity (a social or
// enterprise login, or LDAP): those accounts have no usable password
// either, and the email alone would hand an LDAP admin or another
// provider's user to whoever can make some provider assert their address.
// What email linking is for, an account an administrator created for the
// person before their first login, has none of these.
func (p *socialPipeline) emailLinkAllowed(u *auth.User) bool {
	if u.IsSuperuser || u.IsSystemAuditor || crypto.IsUsablePassword(u.PasswordHash()) {
		return false
	}
	var bound bool
	if err := p.s.Q().QueryRow(p.ctx, `SELECT EXISTS (SELECT 1 FROM sso_userenterpriseauth WHERE user_id = $1)
		OR EXISTS (SELECT 1 FROM social_auth_usersocialauth WHERE user_id = $1)
		OR COALESCE((SELECT ldap_dn FROM main_profile WHERE user_id = $1), '') <> ''`, u.ID).Scan(&bound); err != nil || bound {
		return false
	}
	// email_verified as the userinfo or token response says it, or as the
	// validated ID token does: false in either refuses.
	verified := true
	sources := []map[string]any{p.response}
	if p.b != nil && p.b.IDToken != nil {
		sources = append(sources, p.b.IDToken)
	}
	for _, src := range sources {
		v, ok := src["email_verified"]
		if !ok {
			continue
		}
		switch t := v.(type) {
		case bool:
			verified = verified && t
		case string:
			verified = verified && strings.EqualFold(t, "true")
		default:
			verified = false
		}
	}
	return verified
}

// run is the pipeline; it returns the user to sign in.
func (p *socialPipeline) run() (*auth.User, error) {
	s, ctx := p.s, p.ctx
	// social_details, social_uid, auth_allowed.
	if p.saml != nil {
		p.details = p.saml.details
		p.uid = p.saml.uid
	} else {
		p.details = p.b.UserDetails(p.response)
		uid, err := p.b.UserID(p.details, p.response)
		if err != nil {
			return nil, err
		}
		p.uid = uid
		if !p.b.AuthAllowed(p.details) {
			return nil, sso.AuthForbidden()
		}
	}
	// oidc.check_login_allowed.
	if sso.IsOIDC(p.name) {
		if raw := p.setting("LOGIN_TRIGGERS"); pyTruthy(raw) {
			label := p.oidcLabel()
			who := sso.PyStr(firstTruthy(p.details["username"], p.details["email"], p.uid))
			switch loginTriggerState(raw, p.oidcIdentity(), label+" login") {
			case sso.TriggerUnusable:
				s.ssoLog("ascender.sso.oidc").Error(fmt.Sprintf("Refusing the %s login of %s because %sLOGIN_TRIGGERS cannot be evaluated", label, who, sso.SettingPrefix(p.name)))
				return nil, sso.AuthForbidden()
			case sso.TriggerAllow:
			default:
				s.ssoLog("ascender.sso.oidc").Info(fmt.Sprintf("Refusing the %s login of %s, who does not match %sLOGIN_TRIGGERS", label, who, sso.SettingPrefix(p.name)))
				return nil, sso.AuthForbidden()
			}
		}
		// oidc.strip_username_domain.
		if pyTruthy(p.setting("USERNAME_STRIP_DOMAIN")) {
			if u, ok := p.details["username"].(string); ok {
				if local, _, _ := strings.Cut(u, "@"); local != "" && local != u {
					p.details["username"] = local
				}
			}
		}
	}
	// social_user.
	social, err := s.socialByUID(ctx, s.Q(), p.name, p.uid)
	if err != nil {
		return nil, err
	}
	p.social = social
	if social != nil {
		if p.current != nil && p.current.ID != social.UserID {
			return nil, sso.ErrAlreadyInUse
		}
		if p.user, err = auth.UserByID(ctx, s.Q(), social.UserID); err != nil {
			return nil, err
		}
	} else if p.current != nil {
		p.user = p.current
	}
	p.isNew = p.user == nil
	prevent := s.settingBool(ctx, "SOCIAL_AUTH_PREVENT_USERNAME_COLLISIONS")
	// check_external_login_collision.
	if p.user == nil && prevent {
		skipName := false
		if p.name != sso.EntraID {
			email, _ := p.details["email"].(string)
			users, err := p.usersByEmail(email)
			if err != nil {
				return nil, err
			}
			if len(users) > 1 {
				return nil, p.collision("ambiguous_email", users)
			}
			skipName = len(users) == 1
		}
		if !skipName {
			if name := p.desiredUsername(); name != "" {
				if id, taken := p.usernameTaken(name); taken {
					return nil, p.collision("username", []int64{id})
				}
			}
		}
	}
	// get_username.
	if contains(p.userFields(), "username") {
		if p.user != nil {
			n := p.user.Username
			p.username = &n
		} else {
			n := p.generateUsername()
			p.username = &n
		}
	}
	// entra.associate_existing_account.
	if p.user == nil {
		if p.name != sso.EntraID {
			email, _ := p.details["email"].(string)
			if email != "" {
				users, err := p.usersByEmail(email)
				if err != nil {
					return nil, err
				}
				if len(users) > 1 {
					return nil, errors.New("The given email address is associated with another account")
				}
				if len(users) == 1 {
					u, err := auth.UserByID(ctx, s.Q(), users[0])
					if err != nil {
						return nil, err
					}
					if !p.emailLinkAllowed(u) {
						return nil, errors.New("The given email address is associated with another account")
					}
					p.user = u
					p.isNew = false
				}
			}
		} else if id, err := p.legacyAzureUser(); err != nil {
			return nil, err
		} else if id != 0 {
			if p.user, err = auth.UserByID(ctx, s.Q(), id); err != nil {
				return nil, err
			}
			p.isNew = false
		}
	}
	// check_final_username_collision.
	if p.user == nil && prevent && p.username != nil {
		if desired := p.desiredUsername(); desired != "" {
			if id, taken := p.usernameTaken(desired); taken {
				return nil, p.collision("username", []int64{id})
			}
		}
	}
	// create_user, check_user_found_or_created, associate_user,
	// load_extra_data, user_details: one transaction.
	if err := p.createAndAssociate(); err != nil {
		return nil, err
	}
	// prevent_inactive_login.
	if !p.user.IsActive {
		return nil, errAuthInactive()
	}
	if p.name == sso.SAML {
		if err := p.samlPopulateUser(); err != nil {
			return nil, err
		}
		if err := p.samlUpdateUserFlags(); err != nil {
			return nil, err
		}
	} else {
		if err := p.updateOrgTeamMappings(); err != nil {
			return nil, err
		}
		if err := p.updateUserFlags(); err != nil {
			return nil, err
		}
	}
	u, err := auth.UserByID(ctx, s.Q(), p.user.ID)
	if err != nil {
		return nil, err
	}
	if p.name == sso.SAML && p.isNew {
		// SAMLAuth.authenticate: a new user is an enterprise user.
		if err := s.decorateEnterpriseUser(ctx, u.ID, "saml"); err != nil {
			return nil, err
		}
	}
	return u, nil
}

func firstTruthy(vs ...any) any {
	for _, v := range vs {
		if pyTruthy(v) {
			return v
		}
	}
	return nil
}

func (s *Server) settingBool(ctx context.Context, key string) bool {
	return pyTruthy(s.settingOrAbsent(ctx, key))
}

// generateUsername is get_username for a new user.
func (p *socialPipeline) generateUsername() string {
	var username string
	email, _ := p.details["email"].(string)
	if pyTruthy(p.setting("USERNAME_IS_FULL_EMAIL")) && email != "" {
		username = email
	} else if pyTruthy(p.details["username"]) {
		username = sso.PyStr(p.details["username"])
	} else {
		username = uuidHex()
	}
	short := firstRunes(username, 150-16)
	final := cleanUsername(firstRunes(username, 150))
	for {
		if final != "" {
			if _, taken := p.usernameTaken(final); !taken {
				return final
			}
		}
		username = short + uuidHex()[:16]
		final = cleanUsername(firstRunes(username, 150))
	}
}

// normalizeEmail is BaseUserManager.normalize_email.
func normalizeEmail(email string) string {
	t := strings.TrimSpace(email)
	i := strings.LastIndex(t, "@")
	if i < 0 {
		return email
	}
	return t[:i] + "@" + strings.ToLower(t[i+1:])
}

func (p *socialPipeline) createAndAssociate() error {
	s, ctx := p.s, p.ctx
	if p.user == nil {
		fields := p.userFields()
		if len(fields) == 0 {
			what := sso.PyStr(firstTruthy(p.details["email"], p.uid))
			if what == "" || what == "None" {
				what = "???"
			}
			return errAuthNotFound(what)
		}
		username := ""
		if p.username != nil {
			username = *p.username
		}
		username = norm.NFKC.String(username)
		if username == "" {
			return errors.New("The given username must be set")
		}
		email := ""
		if contains(fields, "email") {
			if e, ok := p.details["email"].(string); ok {
				email = normalizeEmail(e)
			}
		}
		v := &userWrite{Username: username, Email: email}
		err := s.DB.Tx(ctx, func(tx pgx.Tx) error {
			id, err := s.createUser(ctx, tx, nil, v)
			if err != nil {
				if db.IsUniqueViolation(err) {
					return sso.ErrAlreadyInUse
				}
				return err
			}
			if err := p.associate(tx, id); err != nil {
				return err
			}
			p.user, err = auth.UserByID(ctx, tx, id)
			return err
		})
		if err != nil {
			return err
		}
		p.isNew = true
	} else if p.social == nil {
		if err := s.DB.Tx(ctx, func(tx pgx.Tx) error { return p.associate(tx, p.user.ID) }); err != nil {
			return err
		}
	}
	// load_extra_data.
	if p.social != nil {
		extra, err := p.extraData()
		if err != nil {
			return err
		}
		if len(extra) > 0 {
			merged := extra
			if len(p.social.ExtraData) > 0 {
				merged = map[string]any{}
				for k, v := range p.social.ExtraData {
					merged[k] = v
				}
				for k, v := range extra {
					merged[k] = v
				}
			}
			b, err := json.Marshal(merged)
			if err != nil {
				return err
			}
			if _, err := s.Q().Exec(ctx, `UPDATE social_auth_usersocialauth SET extra_data = $2, modified = now() WHERE id = $1`, p.social.ID, b); err != nil {
				return err
			}
			p.social.ExtraData = merged
		}
	}
	// user_details: the names, every login.
	f := ssoUserFields{}
	for _, k := range []string{"first_name", "last_name"} {
		v, ok := p.details[k]
		if !ok || v == nil {
			continue
		}
		sv := sso.PyStr(v)
		if k == "first_name" {
			f.FirstName = &sv
		} else {
			f.LastName = &sv
		}
	}
	if err := s.ssoUpdateUser(ctx, p.user, f); err != nil {
		return err
	}
	u, err := auth.UserByID(ctx, s.Q(), p.user.ID)
	if err != nil {
		return err
	}
	p.user = u
	return nil
}

func (p *socialPipeline) extraData() (map[string]any, error) {
	if p.saml != nil {
		return p.saml.extraData(), nil
	}
	return p.b.ExtraData(p.response, p.details)
}

// associate is associate_user: the social auth row, or the one a
// concurrent login made.
func (p *socialPipeline) associate(tx pgx.Tx, userID int64) error {
	ctx := p.ctx
	if _, err := tx.Exec(ctx, `SAVEPOINT assoc`); err != nil {
		return err
	}
	var id int64
	err := tx.QueryRow(ctx, `INSERT INTO social_auth_usersocialauth (provider, uid, user_id, created, modified, extra_data) VALUES ($1, $2, $3, now(), now(), '{}') RETURNING id`,
		p.name, p.uid, userID).Scan(&id)
	if err != nil {
		if _, rerr := tx.Exec(ctx, `ROLLBACK TO SAVEPOINT assoc`); rerr != nil {
			return rerr
		}
		if db.IsUniqueViolation(err) {
			row, serr := p.s.socialByUID(ctx, tx, p.name, p.uid)
			if serr != nil {
				return serr
			}
			if row != nil {
				if row.UserID != userID {
					return sso.ErrAlreadyInUse
				}
				p.social = row
				return nil
			}
		}
		return err
	}
	p.social = &socialRow{ID: id, UserID: userID, ExtraData: map[string]any{}}
	return nil
}

// legacyAzureUser is entra.legacy_azure_ad_user.
func (p *socialPipeline) legacyAzureUser() (int64, error) {
	ctx, s := p.ctx, p.s
	oid, _ := p.response["oid"].(string)
	tid, _ := p.response["tid"].(string)
	if !pyTruthy(p.response["oid"]) || !pyTruthy(p.response["tid"]) {
		return 0, nil
	}
	seen := map[string]bool{}
	var names []string
	for _, k := range []string{"upn", "preferred_username", "email"} {
		if n, ok := p.response[k].(string); ok && n != "" && !seen[n] {
			seen[n] = true
			names = append(names, n)
		}
	}
	if len(names) == 0 {
		return 0, nil
	}
	rows, err := s.Q().Query(ctx, `SELECT s.user_id, s.extra_data FROM social_auth_usersocialauth s JOIN auth_user u ON u.id = s.user_id
		WHERE s.provider IN ('azuread-oauth2', 'azuread-tenant-oauth2') AND EXISTS (SELECT 1 FROM unnest($1::text[]) n WHERE UPPER(s.uid::text) = UPPER(n) OR UPPER(u.email::text) = UPPER(n))`, names)
	if err != nil {
		return 0, err
	}
	users := map[int64]bool{}
	for rows.Next() {
		var uid int64
		var extra []byte
		if err := rows.Scan(&uid, &extra); err != nil {
			rows.Close()
			return 0, err
		}
		var ed map[string]any
		_ = json.Unmarshal(extra, &ed)
		token, _ := ed["id_token"].(string)
		if token == "" {
			continue
		}
		t, err := sso.ParseJWT(token)
		if err != nil {
			continue
		}
		if t.Claims["oid"] == oid && t.Claims["tid"] == tid {
			users[uid] = true
		}
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, err
	}
	log := s.ssoLog("ascender.sso.entra")
	if len(users) != 1 {
		if len(users) > 0 {
			log.Warn(fmt.Sprintf("Not linking the Entra ID user %s to an account, %d legacy Azure AD accounts are theirs", oid, len(users)))
		}
		return 0, nil
	}
	var id int64
	for k := range users {
		id = k
	}
	var has bool
	if err := s.Q().QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM social_auth_usersocialauth WHERE user_id = $1 AND provider = 'entra-id')`, id).Scan(&has); err != nil {
		return 0, err
	}
	if has {
		name := colOf[string](ctx, s.Q(), "auth_user", "username", id)
		log.Warn(fmt.Sprintf("Not linking the Entra ID user %s to the account %s, it already has an Entra ID user", oid, name))
		return 0, nil
	}
	return id, nil
}

// ---------------------------------------------------------------- OIDC identity

func (p *socialPipeline) oidcLabel() string {
	if p.name == sso.EntraID {
		return "Entra ID"
	}
	return "OIDC"
}

// oidcIdentity is OIDCIdentity for the login.
func (p *socialPipeline) oidcIdentity() *sso.Identity {
	claims := sso.OIDCClaims(p.b.IDToken, p.response)
	groupsClaim := "groups"
	if v := p.setting("GROUPS_CLAIM"); v != nil {
		groupsClaim = sso.PyStr(v)
	}
	var attrs map[string]any
	return p.s.ssoIdentity(func() ([]string, bool) { return sso.OIDCGroups(claims, groupsClaim) }, func() map[string]any {
		if attrs == nil {
			attrs = sso.OIDCAttributes(claims)
		}
		return attrs
	}, false)
}

// backendMap is _backend_map: the backend's map, else the shared one.
func (p *socialPipeline) backendMap(name string) []ssoMapEntry {
	key := sso.SettingPrefix(p.name) + name
	if p.s.settingOrAbsent(p.ctx, key) == nil {
		key = "SOCIAL_AUTH_" + name
	}
	return p.s.ssoMapSetting(p.ctx, key)
}

// updateOrgTeamMappings is social_pipeline.update_user_org_team_mappings.
func (p *socialPipeline) updateOrgTeamMappings() error {
	orgMap := p.backendMap("ORGANIZATION_MAP")
	teamMap := p.backendMap("TEAM_MAP")
	var ident *sso.Identity
	if sso.IsOIDC(p.name) {
		ident = p.oidcIdentity()
	}
	u := p.user
	resolve := func(opts any, remove bool, rule map[string]any, mapID string) *bool {
		fallback := func() *bool { return sso.Expression(u.Username, u.Email, opts, remove) }
		if len(rule) == 0 || ident == nil {
			return fallback()
		}
		return ident.Resolve(rule, mapID, fallback, remove)
	}
	var orgs []string
	desiredOrgs := orgStates{}
	for _, e := range orgMap {
		orgName := e.Name
		if a, ok := e.Opts["organization_alias"]; ok && pyTruthy(a) {
			orgName = sso.PyStr(a)
		}
		orgs = append(orgs, orgName)
		remove := pyBoolOf(e.Opts, "remove", true)
		for _, r := range []struct{ role, opt string }{{"admin_role", "admins"}, {"member_role", "users"}} {
			st := resolve(e.Opts[r.opt], pyBoolOf(e.Opts, "remove_"+r.opt, remove), ruleOf(e.Opts["triggers_"+r.opt]), fmt.Sprintf("organization %s %s", e.Name, r.opt))
			if st != nil {
				if desiredOrgs[orgName] == nil {
					desiredOrgs[orgName] = map[string]bool{}
				}
				desiredOrgs[orgName][r.role] = *st
			}
		}
	}
	var teams []teamOrg
	desiredTeams := teamStates{}
	for _, e := range teamMap {
		if _, ok := e.Opts["organization"]; !ok {
			continue
		}
		org := ""
		if pyTruthy(e.Opts["organization"]) {
			org = sso.PyStr(e.Opts["organization"])
		}
		if org == "" {
			p.s.ssoLog("ascender.sso.social_pipeline").Error(fmt.Sprintf("Team named %s in social auth team map settings is invalid due to missing organization", e.Name))
			continue
		}
		teams = append(teams, teamOrg{Team: e.Name, Org: org})
		st := resolve(e.Opts["users"], pyBoolOf(e.Opts, "remove", true), ruleOf(e.Opts["triggers"]), "team "+e.Name)
		if st != nil {
			desiredTeams.set(org, e.Name, "member_role", *st)
		}
	}
	if err := p.s.ssoCreateOrgsAndTeams(p.ctx, orgs, teams, "Social Auth", true); err != nil {
		return err
	}
	return p.s.ssoReconcile(p.ctx, p.user, desiredOrgs, desiredTeams, "Social Auth")
}

// updateUserFlags is oidc.update_user_flags.
func (p *socialPipeline) updateUserFlags() error {
	if !sso.IsOIDC(p.name) {
		return nil
	}
	flags, ok := p.setting("USER_FLAGS").(map[string]any)
	if !ok || len(flags) == 0 {
		return nil
	}
	log := p.s.ssoLog("ascender.sso.oidc")
	ignoreLists := false
	if !p.s.settingBool(p.ctx, "RESTRICT_USER_IDENTITY_TO_SUPERUSERS") {
		var listed []string
		for _, a := range []string{"is_superuser", "is_system_auditor"} {
			if pyTruthy(flags[a]) {
				listed = append(listed, a)
			}
		}
		if len(listed) > 0 {
			log.Warn(fmt.Sprintf("Ignoring the username lists %s in %sUSER_FLAGS because RESTRICT_USER_IDENTITY_TO_SUPERUSERS is off; an organization administrator could otherwise rename or create an account to take a listed name",
				strings.Join(listed, ", "), sso.SettingPrefix(p.name)))
			ignoreLists = true
		}
	}
	ident := p.oidcIdentity()
	u := p.user
	var f ssoUserFields
	for _, fl := range []struct{ flag, attr string }{{"superuser", "is_superuser"}, {"system_auditor", "is_system_auditor"}} {
		rule := flags["triggers_"+fl.flag]
		var usernames any
		if !ignoreLists {
			usernames = flags[fl.attr]
		}
		ruleMap, _ := rule.(map[string]any)
		hasTriggers := rule != nil && !(ruleMap != nil && len(ruleMap) == 0)
		if !hasTriggers && usernames == nil {
			continue
		}
		remove := p.removeFlagSetting(flags, fl.flag)
		listRemove := remove && !hasTriggers
		fallback := func() *bool { return p.matchUsername(usernames, listRemove, fl.flag) }
		var st *bool
		if ruleMap == nil && hasTriggers {
			// A rule that is no object cannot be evaluated.
			st = ident.Resolve(map[string]any{"invalid": rule}, fmt.Sprintf("%s user flag %s", p.oidcLabel(), fl.flag), fallback, remove)
		} else {
			st = ident.Resolve(ruleMap, fmt.Sprintf("%s user flag %s", p.oidcLabel(), fl.flag), fallback, remove)
		}
		prev := u.IsSuperuser
		if fl.attr == "is_system_auditor" {
			prev = u.IsSystemAuditor
		}
		if st == nil || *st == prev {
			continue
		}
		action := "revoke"
		if *st {
			action = "grant"
		}
		log.Info(fmt.Sprintf("%s user flag changed action=%s flag=%s user=%s old=%s new=%s source=%sUSER_FLAGS", p.oidcLabel(), action, fl.flag, sanitizeLogValue(u.Username), pyBoolStr(prev), pyBoolStr(*st), sso.SettingPrefix(p.name)))
		v := *st
		if fl.attr == "is_superuser" {
			f.IsSuperuser = &v
		} else {
			f.IsSystemAuditor = &v
		}
	}
	return p.s.ssoUpdateUser(p.ctx, u, f)
}

// removeFlagSetting is _remove_flag_setting.
func (p *socialPipeline) removeFlagSetting(flags map[string]any, flag string) bool {
	key := "remove_" + flag + "s"
	v, ok := flags[key]
	if !ok {
		return true
	}
	switch t := v.(type) {
	case bool:
		return t
	case nil:
		return false
	case string:
		switch strings.ToLower(strings.TrimSpace(t)) {
		case "y", "yes", "t", "true", "on", "1":
			return true
		case "n", "no", "f", "false", "off", "0", "", "null", "none":
			return false
		}
	case json.Number:
		if t.String() == "1" {
			return true
		}
		if t.String() == "0" {
			return false
		}
	case float64:
		if t == 1 {
			return true
		}
		if t == 0 {
			return false
		}
	}
	p.s.ssoLog("ascender.sso.oidc").Warn(fmt.Sprintf("The OIDC user flags setting %s of %s is not a boolean, so the flag will not be removed", key, sanitizeLogValue(p.user.Username)))
	return false
}

// matchUsername is _match_username.
func (p *socialPipeline) matchUsername(usernames any, remove bool, flag string) *bool {
	if usernames == nil {
		return nil
	}
	log := p.s.ssoLog("ascender.sso.oidc")
	who := sanitizeLogValue(p.user.Username)
	l, ok := usernames.([]any)
	if !ok {
		log.Warn(fmt.Sprintf("The OIDC user flags username list for %s of %s will be ignored because it is not a list of usernames", flag, who))
		return nil
	}
	if len(l) == 0 {
		log.Warn(fmt.Sprintf(`The OIDC user flags username list for %s of %s will be ignored because it is empty; use a trigger rule such as {"never": {}} to revoke the flag from everyone`, flag, who))
		return nil
	}
	names := map[string]bool{}
	invalid := false
	for _, x := range l {
		s, ok := x.(string)
		if !ok || strings.TrimSpace(s) == "" {
			invalid = true
			continue
		}
		names[strings.TrimSpace(s)] = true
	}
	if invalid {
		if len(names) == 0 {
			log.Warn(fmt.Sprintf("The OIDC user flags username list for %s of %s will be ignored because it contains no usable usernames", flag, who))
			return nil
		}
		log.Warn(fmt.Sprintf("The OIDC user flags username list for %s of %s contains blank or non-string values that will be ignored", flag, who))
	}
	if names[p.user.Username] {
		return sso.Bool(true)
	}
	if !remove {
		return nil
	}
	return sso.Bool(false)
}

// decorateEnterpriseUser is _decorate_enterprise_user.
func (s *Server) decorateEnterpriseUser(ctx context.Context, userID int64, provider string) error {
	return s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `UPDATE auth_user SET password = $2 WHERE id = $1 AND password NOT LIKE '!%'`, userID, unusablePassword()); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `INSERT INTO sso_userenterpriseauth (user_id, provider) SELECT $1, $2 WHERE NOT EXISTS (SELECT 1 FROM sso_userenterpriseauth WHERE user_id = $1 AND provider = $2)`, userID, provider)
		return err
	})
}

// ---------------------------------------------------------------- sessions and logout

// sessionBackendOK is django.contrib.auth.get_user's test of the backend
// that made the session: one no longer configured signs nobody in.
func (s *Server) sessionBackendOK(ctx context.Context, sess *auth.Session) bool {
	path, _ := sess.Data["_auth_user_backend"].(string)
	switch {
	case path == "", path == localBackendPath, path == "django.contrib.auth.backends.ModelBackend":
		return true
	case strings.HasPrefix(path, "ascender.sso.backends.LDAPBackend"):
		name := strings.TrimPrefix(path, "ascender.sso.backends.")
		for _, b := range ldapBackends {
			if b.Name == name {
				return s.Settings.String(ctx, b.Prefix+"SERVER_URI") != ""
			}
		}
		return false
	}
	for name, p := range sso.BackendPaths {
		if p == path {
			return s.backendEnabled(ctx, name)
		}
	}
	return false
}

// idpLogoutURL is oidc.idp_logout_url: where to end the session at the
// OIDC or Entra ID provider too, or "".
func (s *Server) idpLogoutURL(r *http.Request, u *auth.User) string {
	ctx := r.Context()
	if u == nil || u.SessionKey == "" {
		return ""
	}
	sess, err := auth.GetSession(ctx, s.Q(), u.SessionKey)
	if err != nil {
		return ""
	}
	name, _ := sess.Data["social_auth_last_login_backend"].(string)
	if !sso.IsOIDC(name) {
		return ""
	}
	b := s.newBackend(r, name)
	if !pyTruthy(s.socialSetting(ctx, name, "LOGOUT_FROM_IDP")) {
		return ""
	}
	log := s.ssoLog("ascender.sso.oidc")
	conf, err := b.OpenIDConfiguration(ctx)
	if err != nil {
		log.Error(fmt.Sprintf("Could not read the %s provider configuration, %s is only logged out of Ascender", name, u.Username), "error", err.Error())
		return ""
	}
	end, _ := conf["end_session_endpoint"].(string)
	if !pyTruthy(conf["end_session_endpoint"]) {
		log.Warn(fmt.Sprintf("The %s provider does not advertise an end_session_endpoint, %s is only logged out of Ascender", name, u.Username))
		return ""
	}
	pu, err := url.Parse(end)
	if end == "" || err != nil || (pu.Scheme != "https" && pu.Scheme != "http") || pu.Host == "" {
		log.Warn(fmt.Sprintf("The %s provider's end_session_endpoint is not an http(s) URL, %s is only logged out of Ascender", name, u.Username))
		return ""
	}
	post := strOf(s.settingOrAbsent(ctx, sso.SettingPrefix(name)+"POST_LOGOUT_REDIRECT_URL"))
	if post == "" {
		base := strings.TrimRight(s.Settings.String(ctx, "ASCENDER_URL_BASE"), "/")
		if base == "" || base == urlBasePlaceholder {
			post = absoluteURI(r, "/")
		} else {
			post = base + "/"
		}
	}
	params := sso.Params{{Key: "client_id", Value: strOf(s.socialSetting(ctx, name, "KEY"))}, {Key: "post_logout_redirect_uri", Value: post}}
	var extra []byte
	if err := s.Q().QueryRow(ctx, `SELECT extra_data FROM social_auth_usersocialauth WHERE user_id = $1 AND provider = $2 ORDER BY modified DESC LIMIT 1`, u.ID, name).Scan(&extra); err == nil {
		var ed map[string]any
		if json.Unmarshal(extra, &ed) == nil {
			if t, ok := ed["id_token"].(string); ok && t != "" {
				params = append(params, sso.Param{Key: "id_token_hint", Value: t})
			}
		}
	}
	sep := "?"
	if strings.Contains(end, "?") {
		sep = "&"
	}
	return end + sep + params.Encode()
}

// loginTriggerState is check_login_allowed's evaluation of a LOGIN_TRIGGERS
// value that is set: a rule that is not an object cannot be evaluated, and
// so turns everyone away rather than letting everyone in.
func loginTriggerState(raw any, id *sso.Identity, mapID string) sso.Trigger {
	rule, ok := raw.(map[string]any)
	if !ok {
		return sso.TriggerUnusable
	}
	return id.Evaluate(rule, mapID)
}
