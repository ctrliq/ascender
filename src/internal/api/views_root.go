package api

import (
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/auth"
	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/models"
	"github.com/ctrliq/ascender/internal/sso"
)

// becomeMethods mirrors PRIVILEGE_ESCALATION_METHODS.
var becomeMethods = [][2]string{
	{"sudo", "Sudo"}, {"su", "Su"}, {"pbrun", "Pbrun"}, {"pfexec", "Pfexec"}, {"dzdo", "DZDO"}, {"pmrun", "Pmrun"},
	{"runas", "Runas"}, {"enable", "Enable"}, {"doas", "Doas"}, {"ksu", "Ksu"}, {"machinectl", "Machinectl"}, {"sesu", "Sesu"},
}

func (s *Server) apiRoot(w http.ResponseWriter, r *http.Request) error {
	auth.EnsureCSRFCookie(w, r, s.Cfg.SessionCookieSecure)
	ctx := r.Context()
	o := NewOMap()
	o.Set("description", "Ascender REST API")
	o.Set("current_version", "/api/v2/")
	o.Set("available_versions", NewOMap().Set("v2", "/api/v2/"))
	o.Set("oauth2", "/api/o/")
	o.Set("custom_logo", s.Settings.String(ctx, "CUSTOM_LOGO"))
	o.Set("custom_header_logo", s.Settings.String(ctx, "CUSTOM_HEADER_LOGO"))
	o.Set("custom_login_info", s.Settings.String(ctx, "CUSTOM_LOGIN_INFO"))
	o.Set("custom_title", s.Settings.String(ctx, "CUSTOM_TITLE"))
	o.Set("login_redirect_override", s.Settings.String(ctx, "LOGIN_REDIRECT_OVERRIDE"))
	if s.Cfg.Mode == "development" {
		o.Set("swagger", "/api/swagger/")
	}
	Allow(w, "GET", "HEAD", "OPTIONS")
	WriteJSON(w, 200, o)
	return nil
}

var v2Resources = [][2]string{
	{"ping", "ping"}, {"instances", "instances"}, {"instance_groups", "instance_groups"}, {"receptor_addresses", "receptor_addresses"},
	{"config", "config"}, {"settings", "settings"}, {"me", "me"}, {"dashboard", "dashboard"}, {"organizations", "organizations"},
	{"users", "users"}, {"execution_environments", "execution_environments"}, {"projects", "projects"}, {"project_updates", "project_updates"},
	{"teams", "teams"}, {"credentials", "credentials"}, {"credential_types", "credential_types"}, {"credential_input_sources", "credential_input_sources"},
	{"applications", "applications"}, {"tokens", "tokens"}, {"metrics", "metrics"}, {"inventory", "inventories"},
	{"constructed_inventory", "constructed_inventories"}, {"inventory_sources", "inventory_sources"}, {"inventory_updates", "inventory_updates"},
	{"groups", "groups"}, {"hosts", "hosts"}, {"host_metrics", "host_metrics"}, {"host_metric_summary_monthly", "host_metric_summary_monthly"},
	{"job_templates", "job_templates"}, {"jobs", "jobs"}, {"ad_hoc_commands", "ad_hoc_commands"}, {"system_job_templates", "system_job_templates"},
	{"system_jobs", "system_jobs"}, {"schedules", "schedules"}, {"roles", "roles"}, {"notification_templates", "notification_templates"},
	{"notifications", "notifications"}, {"labels", "labels"}, {"unified_job_templates", "unified_job_templates"}, {"unified_jobs", "unified_jobs"},
	{"activity_stream", "activity_stream"}, {"workflow_job_templates", "workflow_job_templates"}, {"workflow_jobs", "workflow_jobs"},
	{"workflow_approvals", "workflow_approvals"}, {"workflow_approval_votes", "workflow_approval_votes"}, {"workflow_job_template_nodes", "workflow_job_template_nodes"},
	{"workflow_job_nodes", "workflow_job_nodes"}, {"mesh_visualizer", "mesh_visualizer"}, {"bulk", "bulk"},
}

// apiV2Root lists the v2 resources with their keys in alphabetical order
// (the old API listed them in URL registration order).
func (s *Server) apiV2Root(w http.ResponseWriter, r *http.Request) error {
	resources := append([][2]string(nil), v2Resources...)
	sort.Slice(resources, func(i, j int) bool { return resources[i][0] < resources[j][0] })
	o := NewOMap()
	for _, res := range resources {
		o.Set(res[0], "/api/v2/"+res[1]+"/")
	}
	Allow(w, "GET", "HEAD", "OPTIONS")
	WriteJSON(w, 200, o)
	return nil
}

func (s *Server) ping(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	o := NewOMap()
	var instanceCount int
	_ = db.Tolerant(s.Q()).QueryRow(ctx, `SELECT count(*) FROM main_instance`).Scan(&instanceCount)
	o.Set("ha", instanceCount > 1)
	o.Set("version", s.Cfg.Version)
	o.Set("active_node", s.Cfg.ClusterHostID)
	o.Set("install_uuid", s.Settings.String(ctx, "INSTALL_UUID"))
	instances := []any{}
	rows, err := s.Q().Query(ctx, `SELECT hostname, node_type, uuid, last_seen, capacity, version FROM main_instance WHERE node_type <> 'hop' ORDER BY hostname`)
	if err != nil {
		return err
	}
	for rows.Next() {
		var hostname, nodeType, uuid, version string
		var lastSeen *time.Time
		var capacity int64
		if err := rows.Scan(&hostname, &nodeType, &uuid, &lastSeen, &capacity, &version); err != nil {
			rows.Close()
			return err
		}
		instances = append(instances, NewOMap().Set("node", hostname).Set("node_type", nodeType).Set("uuid", uuid).Set("heartbeat", models.FormatTimePtr(lastSeen)).Set("capacity", capacity).Set("version", version))
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	o.Set("instances", instances)
	groups := []any{}
	grows, err := s.Q().Query(ctx, `SELECT g.name, COALESCE((SELECT sum(i.capacity) FROM main_instancegroup_instances gi JOIN main_instance i ON i.id = gi.instance_id WHERE gi.instancegroup_id = g.id AND i.enabled), 0),
		COALESCE((SELECT array_agg(i.hostname ORDER BY i.hostname) FROM main_instancegroup_instances gi JOIN main_instance i ON i.id = gi.instance_id WHERE gi.instancegroup_id = g.id), '{}')
		FROM main_instancegroup g ORDER BY lower(g.name)`)
	if err != nil {
		return err
	}
	for grows.Next() {
		var name string
		var capacity int64
		var hosts []string
		if err := grows.Scan(&name, &capacity, &hosts); err != nil {
			grows.Close()
			return err
		}
		if hosts == nil {
			hosts = []string{}
		}
		groups = append(groups, NewOMap().Set("name", name).Set("capacity", capacity).Set("instances", hosts))
	}
	grows.Close()
	if err := grows.Err(); err != nil {
		return err
	}
	o.Set("instance_groups", groups)
	Allow(w, "GET", "HEAD", "OPTIONS")
	WriteJSON(w, 200, o)
	return nil
}

// MaxLoginBody bounds what an unauthenticated form may send: a login, an
// SSO callback or SAML response, the OAuth authorization form. The server's
// own cap (64 MiB) also lifts net/http's 10 MB form limit, so these set
// their own.
const MaxLoginBody = 2 << 20

func (s *Server) configView(w http.ResponseWriter, r *http.Request) error {
	u, err := RequireUser(r)
	if err != nil {
		return err
	}
	ctx := r.Context()
	o := NewOMap()
	o.Set("time_zone", "UTC")
	o.Set("version", s.Cfg.Version)
	bm := make([]any, 0, len(becomeMethods))
	for _, m := range becomeMethods {
		bm = append(bm, []string{m[0], Tr(r, m[1])})
	}
	o.Set("become_methods", bm)
	if s.Settings.String(ctx, "AUTH_LDAP_SERVER_URI") != "" {
		o.Set("user_ldap_fields", []string{"username", "password", "email", "last_name", "first_name"})
	}
	// The projects directory and its checkouts, for those who may manage
	// projects or audit an organization (ApiV2ConfigView.get).
	if u.IsSuperuser || u.IsSystemAuditor || len(s.orgsWithRole(ctx, u.ID, "admin_role")) > 0 ||
		len(s.orgsWithRole(ctx, u.ID, "auditor_role")) > 0 || len(s.orgsWithRole(ctx, u.ID, "project_admin_role")) > 0 {
		o.Set("project_base_dir", s.Cfg.ProjectsRoot)
		paths, err := models.LocalPathChoices(ctx, s.Q(), s.Cfg.ProjectsRoot)
		if err != nil {
			return err
		}
		o.Set("project_local_paths", paths)
	}
	WriteJSON(w, 200, o)
	return nil
}

// authView is AuthView: the enabled single sign-on backends, with the
// error of the last failed attempt.
func (s *Server) authView(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	var errBackend, errMessage string
	if c, err := r.Cookie(s.Cfg.SessionCookieName); err == nil && c.Value != "" {
		if sess, err := auth.GetSession(ctx, s.Q(), c.Value); err == nil {
			if sess.UserID != 0 {
				// The middleware dropped the error once someone signed in.
				if _, ok := sess.Data["social_auth_error"]; ok {
					delete(sess.Data, "social_auth_error")
					delete(sess.Data, "social_auth_last_backend")
					if err := auth.SaveSessionData(ctx, s.Q(), sess); err != nil {
						s.Log.ErrorContext(r.Context(), "saving session", "err", err)
					}
				}
			} else if l, ok := sess.Data["social_auth_error"].([]any); ok && len(l) == 2 {
				errBackend, _ = l[0].(string)
				errMessage, _ = l[1].(string)
			}
		}
	}
	data := NewOMap()
	for _, name := range s.enabledSocialBackends(ctx) {
		loginURL := "/sso/login/" + name + "/"
		completeURL := absoluteURI(r, "/sso/complete/"+name+"/")
		if name == sso.SAML {
			idps := mapOf(s.settingOrAbsent(ctx, "SOCIAL_AUTH_SAML_ENABLED_IDPS"))
			keys := make([]string, 0, len(idps))
			for k := range idps {
				keys = append(keys, k)
			}
			sort.Strings(keys)
			for _, idp := range keys {
				o := NewOMap().Set("login_url", loginURL+"?idp="+idp).Set("complete_url", completeURL).Set("metadata_url", "/sso/metadata/saml/")
				if label := mapOf(idps[idp])["label"]; pyTruthy(label) {
					o.Set("label", label)
				}
				full := name + ":" + idp
				if (errBackend == full || errBackend == name) && errMessage != "" {
					o.Set("error", errMessage)
				}
				data.Set(full, o)
			}
			continue
		}
		o := NewOMap().Set("login_url", loginURL).Set("complete_url", completeURL)
		if errBackend == name && errMessage != "" {
			o.Set("error", errMessage)
		}
		data.Set(name, o)
	}
	WriteJSON(w, 200, data)
	return nil
}

func (s *Server) meView(w http.ResponseWriter, r *http.Request) error {
	u, err := RequireUser(r)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, false)
	obj, err := s.serializeUserWith(c, u, u, true)
	if err != nil {
		return err
	}
	Allow(w, "GET", "HEAD", "OPTIONS")
	WriteJSON(w, 200, ListResponse{Count: 1, Results: []any{obj}})
	return nil
}

// serializeUser renders a user as UserSerializer did. target is the user
// being rendered, viewer the requester (for capabilities).
func (s *Server) serializeUser(c *SerCtx, target *auth.User, viewer *auth.User) (*OMap, error) {
	o := NewOMap()
	related := NewOMap()
	if c.Detail {
		related.Set("named_url", "/api/v2/users/"+namedURLEscape(target.Username)+"/")
	}
	for _, sub := range []string{"teams", "organizations", "admin_of_organizations", "projects", "credentials", "roles", "activity_stream", "access_list", "tokens", "authorized_tokens", "personal_tokens"} {
		related.Set(sub, SubURL("users", target.ID, sub))
	}
	// user_capabilities are added by serializeUserWith.
	summary := NewOMap()
	o.Set("id", target.ID).Set("type", "user").Set("url", URLFor("users", target.ID)).Set("related", related).Set("summary_fields", summary)
	o.Set("created", models.FormatTime(target.DateJoined))
	if target.LastLogin != nil {
		o.Set("modified", models.FormatTime(*target.LastLogin))
	} else {
		o.Set("modified", nil)
	}
	extra, err := c.userExtra(target.ID)
	if err != nil {
		return nil, err
	}
	profile := extra.profile
	o.Set("username", target.Username).Set("first_name", target.FirstName).Set("last_name", target.LastName).Set("email", target.Email)
	o.Set("is_superuser", target.IsSuperuser).Set("is_system_auditor", target.IsSystemAuditor)
	// An external account has no password field.
	kind := extra.external
	if kind == "" {
		o.Set("password", "$encrypted$")
	}
	o.Set("ldap_dn", profile.LDAPDN)
	o.Set("preferred_language", profile.Language).Set("preferred_theme", profile.Theme)
	o.Set("last_login", models.FormatTimePtr(target.LastLogin))
	var external any
	if kind != "" {
		external = kind
	}
	o.Set("external_account", external)
	o.Set("auth", extra.social)
	return o, nil
}

// namedURLEscape is GraphNode._encode_uri: the reserved characters
// ;/?:@=&[] percent-encoded, then each + (the component separator) written
// [+], which parsing turns back into a literal + before splitting.
func namedURLEscape(s string) string {
	r := strings.NewReplacer("+", "[+]", ";", "%3B", "/", "%2F", "?", "%3F", ":", "%3A", "@", "%40", "=", "%3D", "&", "%26", "[", "%5B", "]", "%5D")
	return r.Replace(s)
}

// renderLogin is rest_framework/login.html (Ascender's copy of DRF's
// login_base.html inside the browsable API's page).
func renderLogin(w http.ResponseWriter, r *http.Request, version, csrf, next, username, errMsg string) {
	usernameValue := ""
	if username != "" {
		usernameValue = `value="` + djangoEscape(username) + `"`
	}
	errors := ""
	if errMsg != "" {
		errors = "\n        <div class=\"text-error\" style=\"border: none; color: red\">" + djangoEscape(errMsg) + "</div>\n      \n      "
	}
	body := `
<div class="well" style="width: 320px; margin-left: auto; margin-right: auto">
  <div class="row-fluid">

    <form action="/api/login/" method="post">
      <input type="hidden" name="csrfmiddlewaretoken" value="` + djangoEscape(csrf) + `">
      <input type="hidden" name="next" value="` + djangoEscape(next) + `" />
      <div class="clearfix control-group "
          id="div_id_username">
        <div class="form-group">
          <label for="id_username">Username:</label>
          <input type="text" name="username" maxlength="100"
              autocapitalize="off"
              autocorrect="off" class="form-control textinput textInput"
              id="id_username"  autocomplete="off" required autofocus
              ` + usernameValue + `>
            
        </div>
      </div>
      <div class="clearfix control-group "
          id="div_id_password">
        <div class="form-group">
          <label for="id_password">Password:</label>
          <input type="password" name="password" maxlength="100" autocapitalize="off"
              autocorrect="off" class="form-control textinput textInput" id="id_password"
              autocomplete="off" required>
            
        </div>
      </div>
      ` + errors + `
      <div class="form-actions-no-box">
        <button type="submit" class="btn btn-primary js-tooltip" title="Log in">LOG IN</button>
      </div>
    </form>

  </div><!-- /.row-fluid -->
</div><!-- /.well -->
`
	page := renderBrowsable(browsableContext{FullPath: r.URL.RequestURI(), LoginContext: true, CSRF: csrf, Version: version, Body: body})
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	// LoggedLoginView answered a failed login with 401.
	if errMsg != "" {
		w.WriteHeader(http.StatusUnauthorized)
	} else {
		w.WriteHeader(http.StatusOK)
	}
	_, _ = w.Write([]byte(page))
}

// loginNext is the form's next field: the query's, else the posted one,
// else the API root.
func loginNext(r *http.Request) string {
	if v := r.URL.Query().Get("next"); v != "" {
		return v
	}
	if v := r.PostFormValue("next"); v != "" {
		return v
	}
	return "/api/"
}

func safeNext(next string) string {
	if !IsLocalPath(next) {
		return "/api/"
	}
	return next
}

// IsLocalPath reports whether next is a path on this server that a
// redirect may send the browser to, as url_has_allowed_host_and_scheme
// allowed with no hosts: it starts with one "/", and nothing in it lets a
// browser read it as another host ("//evil", "/\evil", or a control
// character a browser strips before it gets there).
func IsLocalPath(next string) bool {
	if !strings.HasPrefix(next, "/") || strings.HasPrefix(next, "//") || strings.Contains(next, `\`) || hasURLControl(next) {
		return false
	}
	u, err := url.Parse(next)
	return err == nil && u.Scheme == "" && u.Host == "" && strings.HasPrefix(u.Path, "/") && !strings.HasPrefix(u.Path, "//")
}

// hasURLControl reports characters a browser drops or treats specially
// in a URL: controls, and invisible formatting characters.
func hasURLControl(s string) bool {
	for _, r := range s {
		if r < 0x20 || r == 0x7f || (r >= 0x80 && r < 0xa0) || r == 0xfeff || (r >= 0x200b && r <= 0x200f) || (r >= 0x202a && r <= 0x202e) || (r >= 0x2060 && r <= 0x2064) {
			return true
		}
	}
	return false
}

// loginView serves the browsable-API login form and processes it. The UI
// posts here too; on success the session cookie, the userLoggedIn marker
// and the X-API-Session-Cookie-Name header are set as before.
func (s *Server) loginView(w http.ResponseWriter, r *http.Request) error {
	csrf := auth.EnsureCSRFCookie(w, r, s.Cfg.SessionCookieSecure)
	switch r.Method {
	case http.MethodGet, http.MethodHead:
		accept := r.Header.Get("Accept")
		if accept != "" && !strings.Contains(accept, "text/html") && !strings.Contains(accept, "*/*") {
			w.Header().Set("Content-Type", "text/plain")
			w.WriteHeader(http.StatusNotAcceptable)
			return nil
		}
		renderLogin(w, r, s.Cfg.Version, csrf, loginNext(r), "", "")
		return nil
	case http.MethodPost:
		r.Body = http.MaxBytesReader(w, r.Body, MaxLoginBody)
		if err := r.ParseForm(); err != nil {
			return BadRequest("Could not parse form.")
		}
		if !auth.CSRFOK(r) {
			return Detail(http.StatusForbidden, "CSRF Failed: CSRF token missing or incorrect.")
		}
		username := r.PostFormValue("username")
		password := r.PostFormValue("password")
		next := safeNext(r.PostFormValue("next"))
		if _, err := s.Login(w, r, username, password); err != nil {
			msg := "Please enter a correct username and password. Note that both fields may be case-sensitive."
			if err == ErrInactiveLogin {
				msg = "This account is inactive."
			}
			renderLogin(w, r, s.Cfg.Version, csrf, loginNext(r), username, msg)
			return nil
		}
		http.Redirect(w, r, next, http.StatusFound)
		return nil
	}
	return MethodNotAllowed(r.Method)
}

// logoutView ends the session. GET is accepted for browsers as before.
func (s *Server) logoutView(w http.ResponseWriter, r *http.Request) error {
	// Django's LogoutView takes POST only (5.0 on): a GET from an <img> on
	// another site must not sign anyone out. The middleware checks the
	// CSRF token of a session's POST.
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return nil
		}
		return MethodNotAllowed(r.Method)
	}
	// Read before the session goes, which is where it comes from.
	idp := ""
	if r.Method == http.MethodPost {
		idp = s.idpLogoutURL(r, auth.UserFrom(r.Context()))
	}
	s.Logout(w, r)
	if idp != "" {
		// A browser posting a form goes on to the provider; a script is
		// handed the address.
		if strings.Contains(r.Header.Get("Accept"), "text/html") {
			http.Redirect(w, r, idp, http.StatusFound)
		} else {
			WriteJSON(w, http.StatusOK, NewOMap().Set("logout_url", idp))
		}
		return nil
	}
	next := r.URL.Query().Get("next")
	if v := r.PostFormValue("next"); v != "" {
		next = v
	}
	http.Redirect(w, r, safeNext(next), http.StatusFound)
	return nil
}

// ErrBadLogin is returned by Login for a wrong username or password.
var ErrBadLogin = Detail(http.StatusUnauthorized, "Invalid username or password.")

// ErrInactiveLogin is returned by Login when a backend that does not look
// at is_active (LDAP) accepted the credentials of an inactive account.
var ErrInactiveLogin = Detail(http.StatusUnauthorized, "This account is inactive.")

// Login verifies the credentials, creates a session and sets the cookies
// and headers the UI and API clients expect. Both the API login view and
// the web login page use it.
func (s *Server) Login(w http.ResponseWriter, r *http.Request, username, password string) (*auth.User, error) {
	ctx := r.Context()
	u, backend := s.authenticatePassword(ctx, username, password)
	if u == nil {
		s.Log.WarnContext(r.Context(), "login failed", "user", username, "remote", s.clientHost(r))
		return nil, ErrBadLogin
	}
	if !u.IsActive {
		s.Log.WarnContext(r.Context(), "login failed", "user", username, "remote", s.clientHost(r))
		return nil, ErrInactiveLogin
	}
	data := map[string]any{"_auth_user_backend": backend}
	// login() kept what an anonymous session held, and retired the old
	// session whoever it belonged to (cycle_key, or flush for another
	// user): logging in again, the natural answer to a session that may
	// have been taken, leaves the old key unusable.
	if c, err := r.Cookie(s.Cfg.SessionCookieName); err == nil && c.Value != "" {
		if old, err := auth.GetSession(ctx, s.Q(), c.Value); err == nil {
			if old.UserID == 0 {
				for k, v := range old.Data {
					if _, set := data[k]; !set && k != "social_auth_error" && k != "social_auth_last_backend" {
						data[k] = v
					}
				}
			}
			if err := auth.DeleteSession(ctx, s.Q(), old.Key); err != nil {
				return nil, err
			}
		}
	}
	return s.startSession(w, r, u, data)
}

// startSession creates the user's session with its data, sets the
// cookies and headers the UI and API clients expect, and records the
// login.
func (s *Server) startSession(w http.ResponseWriter, r *http.Request, u *auth.User, data map[string]any) (*auth.User, error) {
	ctx := r.Context()
	life := s.sessionLifetime(r)
	limit := int64(-1)
	if v, ok := s.Settings.Get(ctx, "SESSIONS_PER_USER"); ok && v != nil {
		limit = s.Settings.Int(ctx, "SESSIONS_PER_USER")
	}
	var sess *auth.Session
	expired := 0
	withHash := map[string]any{}
	for k, v := range data {
		withHash[k] = v
	}
	withHash[auth.SessionHashKey] = auth.SessionAuthHash(s.Cfg.SecretKey, u)
	err := s.DB.Tx(ctx, func(tx pgx.Tx) error {
		var err error
		sess, err = auth.CreateSessionData(ctx, tx, u.ID, life, withHash)
		if err != nil {
			return err
		}
		// SESSIONS_PER_USER: the oldest sessions past the limit end.
		if expired, err = auth.ExpireSessionsOverLimit(ctx, tx, u.ID, limit); err != nil {
			return err
		}
		return auth.TouchLastLogin(ctx, tx, u.ID)
	})
	if err != nil {
		return nil, err
	}
	if expired > 0 {
		s.emitChannel(ctx, "control-limit_reached_"+itoa(u.ID), NewOMap().Set("group_name", "control").Set("reason", "limit_reached"))
	}
	s.setSessionCookie(w, sess.Key, int(life/time.Second))
	http.SetCookie(w, &http.Cookie{Name: s.Cfg.LoggedInCookieName, Value: "true", Path: "/", Secure: s.Cfg.SessionCookieSecure, SameSite: http.SameSiteLaxMode})
	// login()'s rotate_token, for every way of logging in.
	auth.RotateCSRFCookie(w, s.Cfg.SessionCookieSecure)
	w.Header().Set("X-API-Session-Cookie-Name", s.Cfg.SessionCookieName)
	w.Header().Set("Session-Timeout", itoa(int64(life/time.Second)))
	s.Log.InfoContext(r.Context(), "login", "user", u.Username, "remote", s.clientHost(r))
	u.AuthMethod = "session"
	u.SessionKey = sess.Key
	return u, nil
}

// Logout ends the current session and clears the cookies.
func (s *Server) Logout(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	u := auth.UserFrom(ctx)
	if u != nil && u.SessionKey != "" {
		if err := auth.DeleteSession(ctx, s.Q(), u.SessionKey); err != nil {
			s.Log.ErrorContext(r.Context(), "logout: deleting session", "err", err)
		}
		s.Log.InfoContext(r.Context(), "logout", "user", u.Username)
	}
	http.SetCookie(w, &http.Cookie{Name: s.Cfg.SessionCookieName, Value: "", Path: "/", HttpOnly: true, MaxAge: -1, Secure: s.Cfg.SessionCookieSecure, SameSite: http.SameSiteLaxMode})
	http.SetCookie(w, &http.Cookie{Name: s.Cfg.LoggedInCookieName, Value: "false", Path: "/", Secure: s.Cfg.SessionCookieSecure, SameSite: http.SameSiteLaxMode})
}
