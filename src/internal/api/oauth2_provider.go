package api

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"fmt"
	"html/template"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/activity"
	"github.com/ctrliq/ascender/internal/auth"
	"github.com/ctrliq/ascender/internal/crypto"
	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/models"
)

// The OAuth2 provider endpoints under /api/o/: django-oauth-toolkit's
// AuthorizationView, TokenView and RevokeTokenView over oauthlib's Server,
// with Ascender's TokenView (refresh token expiry, inactive users refused)
// and its token model (external users refused). Errors are oauthlib's:
// {"error": ..., "error_description": ...} with its status codes.

// oauthScopes are OAUTH2_PROVIDER's SCOPES (the toolkit's defaults), in
// order; DEFAULT_SCOPES is "__all__", so a request without a scope gets
// them all.
var oauthScopes = []struct{ name, description string }{{"read", "Reading scope"}, {"write", "Writing scope"}}

func oauthScopeNames() []string {
	out := make([]string, len(oauthScopes))
	for i, s := range oauthScopes {
		out[i] = s.name
	}
	return out
}

// oauthErr is oauthlib's OAuth2Error. fatal marks a FatalClientError,
// which the authorization endpoint shows instead of redirecting.
type oauthErr struct {
	code, desc, state, redirectURI string
	status                         int
	fatal                          bool
}

func (e *oauthErr) Error() string { return "(" + e.code + ") " + e.desc }

func oauthError(code, desc string) *oauthErr { return &oauthErr{code: code, desc: desc, status: 400} }

func oauthFatal(desc string) *oauthErr {
	return &oauthErr{code: "invalid_request", desc: desc, status: 400, fatal: true}
}

func oauthInvalidClient() *oauthErr {
	return &oauthErr{code: "invalid_client", status: 401, fatal: true}
}

func (e *oauthErr) tuples() [][2]string {
	out := [][2]string{{"error", e.code}}
	if e.desc != "" {
		out = append(out, [2]string{"error_description", e.desc})
	}
	if e.state != "" {
		out = append(out, [2]string{"state", e.state})
	}
	return out
}

// json is OAuth2Error.json: json.dumps of the two-tuples.
func (e *oauthErr) json() string {
	o := NewOMap()
	for _, t := range e.tuples() {
		o.Set(t[0], t[1])
	}
	return string(pyJSONDumps(o, true))
}

// headers is OAuth2Error.headers: a 401 says why in WWW-Authenticate.
func (e *oauthErr) headers() map[string]string {
	if e.status != 401 {
		return map[string]string{}
	}
	vals := []string{fmt.Sprintf(`error="%s"`, e.code)}
	if e.desc != "" {
		vals = append(vals, fmt.Sprintf(`error_description="%s"`, e.desc))
	}
	return map[string]string{"WWW-Authenticate": "Bearer " + strings.Join(vals, ", ")}
}

// pyURLEncode is urllib's urlencode of ordered pairs (quote_plus).
func pyURLEncode(pairs [][2]string) string {
	parts := make([]string, len(pairs))
	for i, p := range pairs {
		parts[i] = url.QueryEscape(p[0]) + "=" + url.QueryEscape(p[1])
	}
	return strings.Join(parts, "&")
}

// oauthDefaultHeaders are the grant types' _get_default_headers.
func oauthDefaultHeaders() map[string]string {
	return map[string]string{"Content-Type": "application/json", "Cache-Control": "no-store", "Pragma": "no-cache"}
}

// oauthReq is the oauthlib Request: the parameters (one value each, as the
// toolkit passed request.POST's last values), the Authorization header, and
// what validation found.
type oauthReq struct {
	params      map[string]string
	queryDup    map[string]bool
	authz       string
	client      *models.OAuth2Application
	user        *auth.User
	scopes      []string
	rt          *oauthRefresh
	redirectURI *string
}

func (q *oauthReq) v(k string) string { return q.params[k] }

func (q *oauthReq) has(k string) bool { _, ok := q.params[k]; return ok }

// scopeToList is utils.scope_to_list for a string.
func scopeToList(s string, present bool) []string {
	if !present {
		return nil
	}
	return strings.Split(strings.TrimSpace(s), " ")
}

func (s *Server) oauthAppByClientID(ctx context.Context, clientID string) *models.OAuth2Application {
	if clientID == "" {
		return nil
	}
	a, err := models.ScanOAuth2Application(s.Q().QueryRow(ctx, `SELECT `+models.OAuth2ApplicationColumns+` FROM main_oauth2application app WHERE app.client_id = $1`, clientID))
	if err != nil {
		return nil
	}
	return a
}

// loadClient is _load_application: the request's client when it is the
// one named, else the application with that client_id.
func (s *Server) loadClient(ctx context.Context, q *oauthReq, clientID string) *models.OAuth2Application {
	if q.client != nil && q.client.ClientID == clientID {
		return q.client
	}
	q.client = s.oauthAppByClientID(ctx, clientID)
	return q.client
}

// checkSecret is _check_secret: the stored secret (decrypted, never
// hashed here) against the one given.
func (s *Server) checkSecret(provided string, a *models.OAuth2Application) bool {
	stored, err := crypto.DecryptField(s.Cfg.SecretKey, "value", nil, a.ClientSecret)
	if err != nil {
		// A secret stored in clear (a row from before secrets were
		// encrypted) compares as it is; one that is encrypted but will
		// not decrypt matches nothing, its ciphertext above all.
		if crypto.IsEncrypted(a.ClientSecret) {
			return false
		}
		stored = a.ClientSecret
	}
	return subtle.ConstantTimeCompare([]byte(provided), []byte(stored)) == 1
}

func (q *oauthReq) basicAuth() string {
	typ, val, ok := strings.Cut(q.authz, " ")
	if !ok || typ != "Basic" || val == "" {
		return ""
	}
	return val
}

func (s *Server) clientAuthRequired(ctx context.Context, q *oauthReq) bool {
	if q.basicAuth() != "" {
		return true
	}
	if q.v("client_id") != "" && q.v("client_secret") != "" {
		return true
	}
	if a := s.loadClient(ctx, q, q.v("client_id")); a != nil {
		return a.ClientType == "confidential"
	}
	return true
}

// authenticateClient is the toolkit's: HTTP Basic, else the body.
func (s *Server) authenticateClient(ctx context.Context, q *oauthReq) bool {
	if b := q.basicAuth(); b != "" {
		if raw, err := base64.StdEncoding.DecodeString(b); err == nil {
			if id, secret, ok := strings.Cut(string(raw), ":"); ok {
				id, _ = url.QueryUnescape(id)
				secret, _ = url.QueryUnescape(secret)
				if a := s.loadClient(ctx, q, id); a != nil && a.ClientID == id && s.checkSecret(secret, a) {
					return true
				}
			}
		}
	}
	a := s.loadClient(ctx, q, q.v("client_id"))
	return a != nil && s.checkSecret(q.v("client_secret"), a)
}

func (s *Server) authenticateClientID(ctx context.Context, q *oauthReq) bool {
	a := s.loadClient(ctx, q, q.v("client_id"))
	return a != nil && a.ClientType != "confidential"
}

// validateClientAuthentication is GrantTypeBase's: confidential clients
// authenticate, public ones are named.
func (s *Server) validateClientAuthentication(ctx context.Context, q *oauthReq) *oauthErr {
	if s.clientAuthRequired(ctx, q) {
		if !s.authenticateClient(ctx, q) {
			return oauthInvalidClient()
		}
	} else if !s.authenticateClientID(ctx, q) {
		return oauthInvalidClient()
	}
	if q.v("client_id") == "" {
		q.params["client_id"] = q.client.ClientID
	} else if q.v("client_id") != q.client.ClientID {
		return oauthError("server_error", "Discrepency found between client identifier")
	}
	return nil
}

// validateScopes is GrantTypeBase.validate_scopes over the toolkit's scopes.
func (q *oauthReq) validateScopes() *oauthErr {
	if len(q.scopes) == 0 {
		q.scopes = scopeToList(q.v("scope"), q.has("scope"))
		if len(q.scopes) == 0 {
			q.scopes = oauthScopeNames()
		}
	}
	for _, sc := range q.scopes {
		ok := false
		for _, n := range oauthScopeNames() {
			if sc == n {
				ok = true
			}
		}
		if !ok {
			return oauthError("invalid_scope", "")
		}
	}
	return nil
}

// oauthUser is validate_user: Django's authenticate, active users only.
func (s *Server) oauthUser(ctx context.Context, username, password string) *auth.User {
	u, _ := s.authenticatePassword(ctx, username, password)
	if u == nil || !u.IsActive {
		return nil
	}
	return u
}

// oauthSetting reads one key of OAUTH2_PROVIDER.
func (s *Server) oauthSetting(ctx context.Context, key string, def int64) int64 {
	v, _ := s.Settings.Get(ctx, "OAUTH2_PROVIDER")
	if m, ok := v.(map[string]any); ok {
		if n, ok := intOf(m[key]); ok {
			return n
		}
	}
	return def
}

func intOf(v any) (int64, bool) {
	switch n := v.(type) {
	case float64:
		return int64(n), true
	case int64:
		return n, true
	case int:
		return int64(n), true
	}
	if n, ok := integerOf(v); ok {
		return n, true
	}
	return 0, false
}

// ---------------------------------------------------------------- the views

// oauthPlainResponse writes what a Django HttpResponse built from oauthlib's
// (headers, body, status) looked like: its headers, else text/html.
func oauthPlainResponse(w http.ResponseWriter, headers map[string]string, body string, status int) {
	if _, ok := headers["Content-Type"]; !ok {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
	}
	for k, v := range headers {
		// As Django sent them (WWW-Authenticate keeps its case).
		w.Header()[k] = []string{v}
	}
	w.WriteHeader(status)
	_, _ = w.Write([]byte(body))
}

// djangoMethodGate answers OPTIONS and refused methods as a Django View
// with only post() did.
func djangoMethodGate(w http.ResponseWriter, r *http.Request, allow string) bool {
	switch r.Method {
	case http.MethodPost:
		return true
	case http.MethodOptions:
		w.Header().Set("Allow", allow)
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Content-Length", "0")
		w.WriteHeader(http.StatusOK)
	default:
		w.Header().Set("Allow", allow)
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
	return false
}

// oauthParams reads the form body (request.POST's last values).
func oauthParams(r *http.Request) map[string]string {
	out := map[string]string{}
	// The token and revoke endpoints take anyone's request: a form of a
	// few fields, never a file. Bounded, and parsed in memory only.
	r.Body = http.MaxBytesReader(nil, r.Body, 1<<20)
	_ = r.ParseMultipartForm(1 << 20)
	if r.PostForm == nil {
		_ = r.ParseForm()
	}
	for k, vals := range r.PostForm {
		if len(vals) > 0 {
			out[k] = vals[len(vals)-1]
		}
	}
	return out
}

// oauthRootView is ApiOAuthAuthorizationRootView.
func (s *Server) oauthRootView(w http.ResponseWriter, r *http.Request) error {
	WriteJSON(w, 200, NewOMap().Set("authorize", "/api/o/authorize/").Set("token", "/api/o/token/").Set("revoke_token", "/api/o/revoke_token/"))
	return nil
}

// oauthTokenView is Ascender's TokenView.
func (s *Server) oauthTokenView(w http.ResponseWriter, r *http.Request) {
	if !djangoMethodGate(w, r, "POST, OPTIONS") {
		return
	}
	ctx := r.Context()
	q := &oauthReq{params: oauthParams(r), authz: r.Header.Get("Authorization")}
	grant := q.v("grant_type")
	if grant == "urn:ietf:params:oauth:grant-type:device_code" {
		// No device grants are ever made.
		if !q.has("device_code") {
			oauthPlainResponse(w, nil, "<h1>Server Error (500)</h1>", 500)
			return
		}
		oauthPlainResponse(w, nil, `{"error": "device_not_found"}`, 404)
		return
	}
	// The refresh token's own expiry, which the toolkit never enforced.
	if grant == "refresh_token" && q.has("refresh_token") {
		var created time.Time
		// Looked up as validateRefreshGrant looks it up: by checksum.
		err := s.Q().QueryRow(ctx, `SELECT created FROM main_oauth2refreshtoken WHERE token_checksum = $1 ORDER BY revoked DESC NULLS FIRST LIMIT 1`,
			models.TokenChecksum(q.v("refresh_token"))).Scan(&created)
		if err == nil && created.Add(time.Duration(s.oauthSetting(ctx, "REFRESH_TOKEN_EXPIRE_SECONDS", 2628000))*time.Second).Before(time.Now()) {
			oauthPlainResponse(w, nil, "The refresh token has expired.", 403)
			return
		}
	}
	if r.URL.RawQuery != "" {
		e := oauthError("invalid_request", "URL query parameters are not allowed")
		oauthPlainResponse(w, e.headers(), e.json(), e.status)
		return
	}
	q.scopes = scopeToList(q.v("scope"), q.has("scope"))
	var verr *oauthErr
	switch grant {
	case "password":
		verr = s.validatePasswordGrant(ctx, q)
	case "refresh_token":
		verr = s.validateRefreshGrant(ctx, q)
	case "client_credentials":
		verr = s.validateClientCredentialsGrant(ctx, q)
	default:
		verr = s.validateCodeGrant(ctx, q)
	}
	headers := oauthDefaultHeaders()
	if verr != nil {
		for k, v := range verr.headers() {
			headers[k] = v
		}
		oauthPlainResponse(w, headers, verr.json(), verr.status)
		return
	}
	// invalidate_authorization_code, before any token exists: of two
	// requests racing with one code, the one whose delete removes nothing
	// gets invalid_grant and no tokens (issuing first left the loser's
	// tokens in the table, never handed out but valid).
	if grant != "password" && grant != "refresh_token" && grant != "client_credentials" {
		tag, err := s.Q().Exec(ctx, `DELETE FROM oauth2_provider_grant WHERE code = $1 AND application_id = $2`, q.v("code"), q.client.ID)
		if err != nil || tag.RowsAffected() == 0 {
			e := oauthError("invalid_grant", "")
			oauthPlainResponse(w, headers, e.json(), e.status)
			return
		}
	}
	token, raised := s.issueBearerToken(ctx, q, grant)
	if raised != nil {
		oauthPlainResponse(w, raised.headers(), raised.json(), raised.status)
		return
	}
	oauthPlainResponse(w, headers, string(pyJSONDumps(token, true)), 200)
}

func (s *Server) validatePasswordGrant(ctx context.Context, q *oauthReq) *oauthErr {
	for _, p := range []string{"grant_type", "username", "password"} {
		if q.v(p) == "" {
			return oauthError("invalid_request", "Request is missing "+p+" parameter.")
		}
	}
	if e := s.validateClientAuthentication(ctx, q); e != nil {
		return e
	}
	if q.user = s.oauthUser(ctx, q.v("username"), q.v("password")); q.user == nil {
		return oauthError("invalid_grant", "Invalid credentials given.")
	}
	if q.client.GrantType != "password" {
		return oauthError("unauthorized_client", "")
	}
	return q.validateScopes()
}

func (s *Server) validateClientCredentialsGrant(ctx context.Context, q *oauthReq) *oauthErr {
	if !s.authenticateClient(ctx, q) {
		return oauthInvalidClient()
	}
	// No Ascender application has the client credentials grant type.
	return oauthError("unauthorized_client", "")
}

// oauthGrantRow is an oauth2_provider_grant row.
type oauthGrantRow struct {
	id                                        int64
	userID                                    int64
	expires                                   time.Time
	redirectURI, scope, challenge, challengeM string
}

func (s *Server) validateCodeGrant(ctx context.Context, q *oauthReq) *oauthErr {
	if g := q.v("grant_type"); g != "authorization_code" && g != "openid" {
		return oauthError("unsupported_grant_type", "")
	}
	if !q.has("code") {
		return oauthError("invalid_request", "Missing code parameter.")
	}
	if e := s.validateClientAuthentication(ctx, q); e != nil {
		return e
	}
	if q.client.GrantType != "authorization-code" {
		return oauthError("unauthorized_client", "")
	}
	var g oauthGrantRow
	err := s.Q().QueryRow(ctx, `SELECT id, user_id, expires, redirect_uri, scope, code_challenge, code_challenge_method FROM oauth2_provider_grant WHERE code = $1 AND application_id = $2`,
		q.v("code"), q.client.ID).Scan(&g.id, &g.userID, &g.expires, &g.redirectURI, &g.scope, &g.challenge, &g.challengeM)
	if err != nil || !time.Now().Before(g.expires) {
		return oauthError("invalid_grant", "")
	}
	q.scopes = strings.Split(g.scope, " ")
	if u, err := auth.UserByID(ctx, s.Q(), g.userID); err == nil && u.IsActive {
		q.user = u
	} else {
		return oauthError("invalid_grant", "")
	}
	if g.challenge != "" {
		if !q.has("code_verifier") {
			return oauthError("invalid_request", "Code verifier required.")
		}
		if g.challengeM == "" {
			return oauthError("invalid_grant", "Challenge method not found")
		}
		var ok bool
		switch g.challengeM {
		case "plain":
			ok = subtle.ConstantTimeCompare([]byte(q.v("code_verifier")), []byte(g.challenge)) == 1
		case "S256":
			sum := sha256.Sum256([]byte(q.v("code_verifier")))
			ok = subtle.ConstantTimeCompare([]byte(base64.RawURLEncoding.EncodeToString(sum[:])), []byte(g.challenge)) == 1
		default:
			return oauthError("server_error", fmt.Sprintf("code_challenge_method %s is not supported.", g.challengeM))
		}
		if !ok {
			return oauthError("invalid_grant", "")
		}
	} else {
		// PKCE_REQUIRED is the toolkit's default.
		if !q.has("code_verifier") {
			return oauthError("invalid_request", "Code verifier required.")
		}
		return oauthError("invalid_grant", "Challenge not found")
	}
	redirect := q.v("redirect_uri")
	if !q.has("redirect_uri") {
		uris := strings.Fields(q.client.RedirectURIs)
		if len(uris) != 1 {
			return oauthFatal("Missing redirect URI.")
		}
		redirect = uris[0]
	}
	if redirect != g.redirectURI {
		return oauthFatal("Mismatching redirect URI.")
	}
	return nil
}

// oauthRefresh is the refresh token a refresh grant presents.
type oauthRefresh struct {
	id            int64
	accessTokenID *int64
	family        *string
	userID        int64
	appID         int64
	revoked       *time.Time
}

func (s *Server) validateRefreshGrant(ctx context.Context, q *oauthReq) *oauthErr {
	if !q.has("refresh_token") {
		return oauthError("invalid_request", "Missing refresh token parameter.")
	}
	if e := s.validateClientAuthentication(ctx, q); e != nil {
		return e
	}
	switch q.client.GrantType {
	case "authorization-code", "password", "client-credentials", "urn:ietf:params:oauth:grant-type:device_code", "openid-hybrid":
	default:
		return oauthError("unauthorized_client", "")
	}
	// validate_refresh_token, and Ascender's active-user check.
	rt := &oauthRefresh{}
	err := s.Q().QueryRow(ctx, `SELECT id, access_token_id, token_family::text, user_id, application_id, revoked FROM main_oauth2refreshtoken
		WHERE token_checksum = $1 ORDER BY revoked DESC NULLS FIRST LIMIT 1`, models.TokenChecksum(q.v("refresh_token"))).Scan(&rt.id, &rt.accessTokenID, &rt.family, &rt.userID, &rt.appID, &rt.revoked)
	if err != nil || rt.revoked != nil || rt.accessTokenID == nil {
		return oauthError("invalid_grant", "")
	}
	var expires time.Time
	var scope string
	if err := s.Q().QueryRow(ctx, `SELECT expires, scope FROM main_oauth2accesstoken WHERE id = $1`, *rt.accessTokenID).Scan(&expires, &scope); err != nil {
		return oauthError("invalid_grant", "")
	}
	if d := s.oauthSetting(ctx, "REFRESH_TOKEN_EXPIRE_SECONDS", 2628000); d > 0 && !expires.Add(time.Duration(d)*time.Second).After(time.Now()) {
		return oauthError("invalid_grant", "")
	}
	u, err := auth.UserByID(ctx, s.Q(), rt.userID)
	if err != nil || !u.IsActive || rt.appID != q.client.ID {
		return oauthError("invalid_grant", "")
	}
	q.user, q.rt = u, rt
	original := strings.Split(scope, " ")
	if q.has("scope") && q.v("scope") != "" {
		q.scopes = scopeToList(q.v("scope"), true)
		for _, sc := range q.scopes {
			found := false
			for _, o := range original {
				if o == sc {
					found = true
				}
			}
			if !found {
				return oauthError("invalid_scope", "")
			}
		}
	} else {
		q.scopes = original
	}
	return nil
}

func newTokenFamily() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}

// issueBearerToken is BearerToken.create_token and the toolkit's
// save_bearer_token: an access token, a rotated refresh token (the one
// presented is revoked) and the activity stream entries the model signals
// wrote. An error here (the external user check) is raised past the grant
// handler, so it carries no default headers.
func (s *Server) issueBearerToken(ctx context.Context, q *oauthReq, grant string) (*OMap, *oauthErr) {
	expiresIn := s.accessTokenLifetime(ctx)
	scope := strings.Join(q.scopes, " ")
	token := NewOMap().Set("access_token", models.GenerateToken(30)).Set("expires_in", expiresIn).Set("token_type", "Bearer").Set("scope", scope)
	refresh := grant != "client_credentials"
	refreshCode := ""
	if refresh {
		refreshCode = models.GenerateToken(30)
		token.Set("refresh_token", refreshCode)
	}
	owner := q.user
	if !s.Settings.Bool(ctx, "ALLOW_OAUTH2_FOR_EXTERNAL_USERS") && owner != nil {
		kind, err := s.externalAccount(ctx, s.Q(), owner.ID)
		if err != nil {
			s.Log.ErrorContext(ctx, "oauth2 token: external account lookup", "err", err)
			return nil, &oauthErr{code: "server_error", desc: "The account could not be checked.", status: 500}
		}
		if kind != "" {
			return nil, &oauthErr{code: "access_denied", desc: fmt.Sprintf("OAuth2 Tokens cannot be created by users associated with an external authentication provider (%s)", kind), status: 400}
		}
	}
	now := time.Now()
	expires := time.Unix(now.Unix()+expiresIn, int64(now.Nanosecond())).UTC()
	access, _ := token.Get("access_token")
	var userID *int64
	if owner != nil {
		userID = &owner.ID
	}
	err := s.DB.Tx(ctx, func(tx pgx.Tx) error {
		var source *int64
		var family *string
		if q.rt != nil {
			// The presented refresh token is revoked: its access token goes
			// (a delete in the activity stream) and it is marked revoked.
			source, family = &q.rt.id, q.rt.family
			if q.rt.accessTokenID != nil {
				if err := s.deleteAccessTokenLogged(ctx, tx, *q.rt.accessTokenID); err != nil {
					return err
				}
			}
			if _, err := tx.Exec(ctx, `UPDATE main_oauth2refreshtoken SET access_token_id = NULL, revoked = now(), updated = now() WHERE id = $1`, q.rt.id); err != nil {
				return err
			}
		} else if refresh {
			f := newTokenFamily()
			family = &f
		}
		t := &models.OAuth2AccessToken{Token: access.(string), Expires: expires, Scope: scope, ApplicationID: &q.client.ID, UserID: userID}
		if err := tx.QueryRow(ctx, `INSERT INTO main_oauth2accesstoken (token, expires, scope, created, updated, description, last_used, application_id, user_id,
			source_refresh_token_id, modified, id_token_id, token_checksum, resource)
			VALUES ($1, $2, $3, now(), now(), '', NULL, $4, $5, $6, now(), NULL, $7, '[]'::jsonb) RETURNING id, created, updated, modified`,
			t.Token, t.Expires, t.Scope, t.ApplicationID, t.UserID, source, models.TokenChecksum(t.Token)).Scan(&t.ID, &t.Created, &t.Updated, &t.Modified); err != nil {
			return err
		}
		if refresh {
			if _, err := tx.Exec(ctx, `INSERT INTO main_oauth2refreshtoken (token, token_checksum, token_family, resource, created, updated, revoked, access_token_id, application_id, user_id)
				VALUES ($1, $2, $3::uuid, '[]'::jsonb, now(), now(), NULL, $4, $5, $6)`, refreshCode, models.TokenChecksum(refreshCode), family, t.ID, q.client.ID, userID); err != nil {
				return err
			}
		}
		// activity_stream_create: no request user, so the owner is named.
		changes := s.tokenChanges(ctx, tx, t)
		links := map[string]int64{"o_auth2_access_token": t.ID}
		if owner != nil {
			changes["user"] = fmt.Sprintf("%s (%d)", owner.Username, owner.ID)
			links["user"] = owner.ID
		}
		return s.Activity.Record(ctx, tx, activity.Entry{Operation: "create", Object1: "o_auth2_access_token", Changes: changes, Links: links})
	})
	if err != nil {
		s.Log.ErrorContext(ctx, "oauth2 token", "err", err)
		return nil, oauthError("server_error", "")
	}
	return token, nil
}

// deleteAccessTokenLogged deletes an access token with the activity
// stream's delete entry (token censored, no actor).
func (s *Server) deleteAccessTokenLogged(ctx context.Context, tx pgx.Tx, id int64) error {
	toks, err := s.loadTokens(ctx, tx, "tok.id = $1", id)
	if err != nil || len(toks) == 0 {
		return err
	}
	changes := s.tokenChanges(ctx, tx, toks[0])
	if err := s.Cascade.Delete(ctx, tx, "main_oauth2accesstoken", "id", []int64{id}); err != nil {
		return err
	}
	return s.Activity.Record(ctx, tx, activity.Entry{Operation: "delete", Object1: "o_auth2_access_token", Changes: changes})
}

// oauthRevokeView is RevokeTokenView.
func (s *Server) oauthRevokeView(w http.ResponseWriter, r *http.Request) {
	if !djangoMethodGate(w, r, "POST, OPTIONS") {
		return
	}
	ctx := r.Context()
	q := &oauthReq{params: oauthParams(r), authz: r.Header.Get("Authorization")}
	fail := func(e *oauthErr) {
		h := oauthDefaultHeaders()
		for k, v := range e.headers() {
			h[k] = v
		}
		oauthPlainResponse(w, h, e.json(), e.status)
	}
	if r.URL.RawQuery != "" {
		fail(oauthError("invalid_request", "URL query parameters are not allowed"))
		return
	}
	if q.v("token") == "" {
		fail(oauthError("invalid_request", "Missing token parameter."))
		return
	}
	if s.clientAuthRequired(ctx, q) {
		if !s.authenticateClient(ctx, q) {
			fail(oauthInvalidClient())
			return
		}
	} else if !s.authenticateClientID(ctx, q) {
		fail(oauthInvalidClient())
		return
	}
	if err := s.revokeOAuthToken(ctx, q); err != nil {
		s.Log.ErrorContext(r.Context(), "oauth2 revoke", "err", err)
	}
	oauthPlainResponse(w, nil, "", 200)
}

// revokeOAuthToken is the toolkit's revoke_token: the hinted kind first,
// then the other; an access token goes with its refresh token revoked.
func (s *Server) revokeOAuthToken(ctx context.Context, q *oauthReq) error {
	sum := models.TokenChecksum(q.v("token"))
	refreshFirst := q.v("token_type_hint") == "refresh_token"
	var accessIDs, refreshIDs []int64
	collect := func(table string) ([]int64, error) {
		rows, err := s.Q().Query(ctx, `SELECT id FROM `+table+` WHERE token_checksum = $1 AND application_id = $2`, sum, q.client.ID)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		var ids []int64
		for rows.Next() {
			var id int64
			if err := rows.Scan(&id); err != nil {
				return nil, err
			}
			ids = append(ids, id)
		}
		return ids, rows.Err()
	}
	var err error
	if refreshFirst {
		if refreshIDs, err = collect("main_oauth2refreshtoken"); err != nil {
			return err
		}
		if len(refreshIDs) == 0 {
			if accessIDs, err = collect("main_oauth2accesstoken"); err != nil {
				return err
			}
		}
	} else {
		if accessIDs, err = collect("main_oauth2accesstoken"); err != nil {
			return err
		}
		if len(accessIDs) == 0 {
			if refreshIDs, err = collect("main_oauth2refreshtoken"); err != nil {
				return err
			}
		}
	}
	return s.DB.Tx(ctx, func(tx pgx.Tx) error {
		for _, id := range accessIDs {
			// revoke_access_token: through its refresh token when it has one.
			var rid int64
			if err := tx.QueryRow(ctx, `SELECT id FROM main_oauth2refreshtoken WHERE access_token_id = $1 ORDER BY id LIMIT 1`, id).Scan(&rid); err == nil {
				refreshIDs = append(refreshIDs, rid)
				continue
			} else if !db.IsNoRows(err) {
				return err
			}
			if err := s.deleteAccessTokenLogged(ctx, tx, id); err != nil {
				return err
			}
		}
		for _, rid := range refreshIDs {
			// RefreshToken.revoke: once, taking its access token along.
			var access *int64
			err := tx.QueryRow(ctx, `SELECT access_token_id FROM main_oauth2refreshtoken WHERE id = $1 AND revoked IS NULL FOR UPDATE`, rid).Scan(&access)
			if db.IsNoRows(err) {
				continue
			}
			if err != nil {
				return err
			}
			if access != nil {
				if err := s.deleteAccessTokenLogged(ctx, tx, *access); err != nil {
					return err
				}
			}
			if _, err := tx.Exec(ctx, `UPDATE main_oauth2refreshtoken SET access_token_id = NULL, revoked = now(), updated = now() WHERE id = $1`, rid); err != nil {
				return err
			}
		}
		return nil
	})
}

// ---------------------------------------------------------------- authorize

var absoluteURIRe = regexp.MustCompile(`^.+://.+$`)

// redirectAllowed is check_redirect_to_uri_allowed against the
// application's registered URIs.
func redirectAllowed(uri string, allowed []string) bool {
	if strings.Contains(uri, "#") {
		return false
	}
	p, err := url.Parse(uri)
	if err != nil || strings.Contains(p.Host, "@") || p.User != nil {
		return false
	}
	for _, a := range allowed {
		if strings.Contains(a, "#") {
			continue
		}
		ap, err := url.Parse(a)
		if err != nil || ap.User != nil {
			continue
		}
		if ap.Scheme != p.Scheme || !strings.EqualFold(ap.Hostname(), p.Hostname()) {
			continue
		}
		loopback := ap.Scheme == "http" && (ap.Hostname() == "127.0.0.1" || ap.Hostname() == "::1")
		if !loopback && ap.Port() != p.Port() {
			continue
		}
		if ap.EscapedPath() != p.EscapedPath() {
			continue
		}
		if strings.Contains(a, "?") != strings.Contains(uri, "?") || ap.RawQuery != p.RawQuery {
			continue
		}
		return true
	}
	return false
}

// validateAuthorizationRequest is AuthorizationCodeGrant's, for the
// parameters of the authorize page (query or form).
func (s *Server) validateAuthorizationRequest(ctx context.Context, q *oauthReq) *oauthErr {
	for _, p := range []string{"client_id", "response_type", "redirect_uri", "scope", "state"} {
		if q.queryDup[p] {
			return oauthFatal("Duplicate " + p + " parameter.")
		}
	}
	state := q.v("state")
	if q.v("client_id") == "" {
		return oauthFatal("Missing client_id parameter.")
	}
	if s.loadClient(ctx, q, q.v("client_id")) == nil {
		return oauthFatal("Invalid client_id parameter value.")
	}
	// _handle_redirects
	if q.has("redirect_uri") {
		uri := q.v("redirect_uri")
		if !absoluteURIRe.MatchString(uri) {
			return oauthFatal("Invalid redirect URI.")
		}
		if !redirectAllowed(uri, strings.Fields(q.client.RedirectURIs)) {
			return oauthFatal("Mismatching redirect URI.")
		}
		q.redirectURI = &uri
	} else {
		uris := strings.Fields(q.client.RedirectURIs)
		if len(uris) != 1 {
			return oauthFatal("Missing redirect URI.")
		}
		if !absoluteURIRe.MatchString(uris[0]) {
			return oauthFatal("Invalid redirect URI.")
		}
		q.redirectURI = &uris[0]
	}
	nonFatal := func(code, desc string) *oauthErr {
		return &oauthErr{code: code, desc: desc, state: state, redirectURI: *q.redirectURI, status: 400}
	}
	rt, hasRT := q.params["response_type"]
	switch {
	case !hasRT:
		return nonFatal("invalid_request", "Missing response_type parameter.")
	case !strings.Contains(rt, "code") && rt != "none":
		return nonFatal("unsupported_response_type", "")
	}
	if rt != "code" || q.client.GrantType != "authorization-code" {
		return nonFatal("unauthorized_client", "")
	}
	if !q.has("code_challenge") {
		return nonFatal("invalid_request", "Code challenge required.")
	}
	if !q.has("code_challenge_method") {
		q.params["code_challenge_method"] = "plain"
	}
	if m := q.v("code_challenge_method"); m != "plain" && m != "S256" {
		return nonFatal("invalid_request", "Transform algorithm not supported.")
	}
	if e := q.validateScopes(); e != nil {
		e.state, e.redirectURI = state, *q.redirectURI
		return e
	}
	return nil
}

// djangoLoginRedirect is redirect_to_login: the full path, quoted with "/"
// left alone.
func djangoLoginRedirect(w http.ResponseWriter, r *http.Request) {
	next := r.URL.Path
	if r.URL.RawQuery != "" {
		next += "?" + r.URL.RawQuery
	}
	esc := strings.ReplaceAll(url.QueryEscape(next), "%2F", "/")
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Location", "/api/login/?next="+esc)
	w.WriteHeader(http.StatusFound)
}

// oauthRedirect is OAuth2ResponseRedirect: only http and https.
func oauthRedirect(w http.ResponseWriter, to string) {
	p, err := url.Parse(to)
	if err != nil || (p.Scheme != "http" && p.Scheme != "https") {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte("<h1>Bad Request (400)</h1>"))
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Location", to)
	w.WriteHeader(http.StatusFound)
}

// addParamsToURI is add_params_to_uri for the query.
func addParamsToURI(uri string, pairs [][2]string) string {
	p, err := url.Parse(uri)
	if err != nil {
		return uri
	}
	var existing [][2]string
	if p.RawQuery != "" {
		for _, kv := range strings.Split(p.RawQuery, "&") {
			k, v, _ := strings.Cut(kv, "=")
			k, _ = url.QueryUnescape(k)
			v, _ = url.QueryUnescape(v)
			existing = append(existing, [2]string{k, v})
		}
	}
	p.RawQuery = pyURLEncode(append(existing, pairs...))
	return p.String()
}

// authorizeError is the view's error_response: a fatal error is shown on
// the page, any other goes back to the client's redirect URI.
func (s *Server) authorizeError(w http.ResponseWriter, r *http.Request, e *oauthErr) {
	if e.fatal {
		s.renderAuthorize(w, r, nil, nil, e, e.status)
		return
	}
	sep := "?"
	if strings.Contains(e.redirectURI, "?") {
		sep = "&"
	}
	oauthRedirect(w, e.redirectURI+sep+pyURLEncode(e.tuples()))
}

// sessionUser is the Django session's user (the authorize page knows no
// other authentication).
func (s *Server) sessionUser(r *http.Request) *auth.User {
	c, err := r.Cookie(s.Cfg.SessionCookieName)
	if err != nil || c.Value == "" {
		return nil
	}
	sess, err := auth.GetSession(r.Context(), s.Q(), c.Value)
	if err != nil || sess.UserID == 0 || !s.sessionBackendOK(r.Context(), sess) {
		return nil
	}
	u, err := auth.UserByID(r.Context(), s.Q(), sess.UserID)
	// The same checks as Authenticate's: a session from before a password
	// change, or a local user's while local logins are disabled, cannot
	// mint a token here or link an identity through /sso/.
	if err != nil || !u.IsActive || !s.sessionHashOK(r.Context(), sess, u) || s.localAuthRefused(r.Context(), u.ID) {
		return nil
	}
	return u
}

// createAuthorizationCode saves the grant and redirects with its code
// (AuthorizationCodeGrant.create_authorization_response).
func (s *Server) createAuthorizationCode(w http.ResponseWriter, r *http.Request, q *oauthReq, u *auth.User) {
	if e := s.validateAuthorizationRequest(r.Context(), q); e != nil {
		s.authorizeError(w, r, e)
		return
	}
	code := models.GenerateToken(30)
	expires := time.Now().Add(time.Duration(s.oauthSetting(r.Context(), "AUTHORIZATION_CODE_EXPIRE_SECONDS", 600)) * time.Second)
	if _, err := s.Q().Exec(r.Context(), `INSERT INTO oauth2_provider_grant (code, expires, redirect_uri, scope, application_id, user_id, created, updated, code_challenge, code_challenge_method, nonce, claims, resource)
		VALUES ($1, $2, $3, $4, $5, $6, now(), now(), $7, $8, '', '{}', '[]'::jsonb)`,
		code, expires, *q.redirectURI, strings.Join(q.scopes, " "), q.client.ID, u.ID, q.v("code_challenge"), q.v("code_challenge_method")); err != nil {
		s.Log.ErrorContext(r.Context(), "oauth2 grant", "err", err)
		oauthPlainResponse(w, nil, "<h1>Server Error (500)</h1>", 500)
		return
	}
	pairs := [][2]string{{"code", code}}
	if st := q.v("state"); st != "" {
		pairs = append(pairs, [2]string{"state", st})
	}
	oauthRedirect(w, addParamsToURI(*q.redirectURI, pairs))
}

// oauthAuthorizeView is the toolkit's AuthorizationView.
func (s *Server) oauthAuthorizeView(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	query := r.URL.Query()
	q := &oauthReq{params: map[string]string{}, queryDup: map[string]bool{}}
	for k, vals := range query {
		q.params[k] = vals[len(vals)-1]
		q.queryDup[k] = len(vals) > 1
	}
	// LoginRequiredMixin comes before the method: anyone not signed in is
	// sent to the login page, whatever they asked.
	u := s.sessionUser(r)
	if u == nil {
		// handle_no_permission: prompt=none answers the client instead.
		if strings.Contains(" "+query.Get("prompt")+" ", " none ") {
			if e := s.validateAuthorizationRequest(ctx, q); e != nil {
				s.authorizeError(w, r, e)
				return
			}
			pairs := [][2]string{{"error", "login_required"}}
			if st := q.v("state"); st != "" {
				pairs = append(pairs, [2]string{"state", st})
			}
			sep := "?"
			if strings.Contains(*q.redirectURI, "?") {
				sep = "&"
			}
			oauthRedirect(w, *q.redirectURI+sep+pyURLEncode(pairs))
			return
		}
		djangoLoginRedirect(w, r)
		return
	}
	// A FormView: get, post, put (as post), head (as get), options.
	const allowed = "GET, POST, PUT, HEAD, OPTIONS"
	switch r.Method {
	case http.MethodGet, http.MethodHead, http.MethodPost, http.MethodPut:
	case http.MethodOptions:
		w.Header().Set("Allow", allowed)
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Content-Length", "0")
		w.WriteHeader(http.StatusOK)
		return
	default:
		w.Header().Set("Allow", allowed)
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	if r.Method == http.MethodPost || r.Method == http.MethodPut {
		s.authorizePost(w, r, u)
		return
	}
	if e := s.validateAuthorizationRequest(ctx, q); e != nil {
		s.authorizeError(w, r, e)
		return
	}
	if q.client.SkipAuthorization {
		s.createAuthorizationCode(w, r, q, u)
		return
	}
	if approval := query.Get("approval_prompt"); approval == "auto" {
		// A live token of this user for the application with the scopes.
		rows, err := s.Q().Query(ctx, `SELECT scope FROM main_oauth2accesstoken WHERE user_id = $1 AND application_id = $2 AND expires > now()`, u.ID, q.client.ID)
		if err == nil {
			found := false
			for rows.Next() {
				var scope string
				if rows.Scan(&scope) == nil && scopesWithin(q.scopes, strings.Split(scope, " ")) {
					found = true
				}
			}
			rows.Close()
			s.logRowsErr(ctx, "oauthAuthorizeView", rows)
			if found {
				s.createAuthorizationCode(w, r, q, u)
				return
			}
		}
	}
	s.renderAuthorize(w, r, q, nil, nil, 200)
}

func scopesWithin(want, have []string) bool {
	for _, w := range want {
		ok := false
		for _, h := range have {
			if w == h {
				ok = true
			}
		}
		if !ok {
			return false
		}
	}
	return true
}

// authorizePost is the form's submission: CSRF, the AllowForm, then the
// grant (Authorize) or access_denied (Cancel).
func (s *Server) authorizePost(w http.ResponseWriter, r *http.Request, u *auth.User) {
	r.Body = http.MaxBytesReader(w, r.Body, MaxLoginBody)
	_ = r.ParseForm()
	if !auth.CSRFOK(r) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.WriteHeader(http.StatusForbidden)
		_, _ = w.Write([]byte("<h1>Forbidden (403)</h1><p>CSRF verification failed. Request aborted.</p>"))
		return
	}
	form := map[string]string{}
	for _, f := range []string{"allow", "redirect_uri", "scope", "nonce", "client_id", "state", "response_type", "code_challenge", "code_challenge_method", "claims", "resource"} {
		form[f] = strings.TrimSpace(r.PostFormValue(f))
	}
	var missing []string
	for _, f := range []string{"redirect_uri", "scope", "client_id", "response_type"} {
		if form[f] == "" {
			missing = append(missing, f)
		}
	}
	if len(missing) > 0 {
		q := &oauthReq{params: form}
		s.loadClient(r.Context(), q, form["client_id"])
		s.renderAuthorize(w, r, q, missing, nil, 200)
		return
	}
	// The form's values become the request's.
	q := &oauthReq{params: map[string]string{"client_id": form["client_id"], "redirect_uri": form["redirect_uri"], "response_type": form["response_type"], "scope": form["scope"]}, queryDup: map[string]bool{}}
	if form["state"] != "" {
		q.params["state"] = form["state"]
	}
	if form["code_challenge"] != "" {
		q.params["code_challenge"] = form["code_challenge"]
	}
	if form["code_challenge_method"] != "" {
		q.params["code_challenge_method"] = form["code_challenge_method"]
	}
	q.scopes = scopeToList(form["scope"], true)
	allow := form["allow"] != "" && form["allow"] != "false" && form["allow"] != "0"
	if !allow {
		e := &oauthErr{code: "access_denied", state: form["state"], redirectURI: form["redirect_uri"], status: 400}
		s.authorizeError(w, r, e)
		return
	}
	s.createAuthorizationCode(w, r, q, u)
}

// authorizePage is oauth2_provider/authorize.html in its base.html.
var authorizePage = template.Must(template.New("authorize").Parse(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title></title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="">
    <meta name="author" content="">


        <link href="/static/oauth2_provider/css/oauth2_provider.css" rel="stylesheet">

</head>

<body>

<div class="container">

    <div class="block-center">
        {{if not .Error}}
            <form id="authorizationForm" method="post">
                <h3 class="block-center-heading">Authorize {{.AppName}}?</h3>
                <input type="hidden" name="csrfmiddlewaretoken" value="{{.CSRF}}">
{{range .Hidden}}
                        <input type="hidden" name="{{.Name}}"{{if .Set}} value="{{.Value}}"{{end}} id="id_{{.Name}}">
{{end}}
                <p>Application requires the following permissions</p>
                <ul>
                    {{range .Scopes}}
                        <li>{{.}}</li>
                    {{end}}
                </ul>

                {{if .Errors}}<ul class="errorlist">{{range .Errors}}<li>{{.}}<ul class="errorlist"><li>This field is required.</li></ul></li>{{end}}</ul>{{end}}


                <div class="control-group">
                    <div class="controls">
                        <input type="submit" class="btn btn-large" value="Cancel"/>
                        <input type="submit" class="btn btn-large btn-primary" name="allow" value="Authorize"/>
                    </div>
                </div>
            </form>

        {{else}}
            <h2>Error: {{.Error.Code}}</h2>
            <p>{{.Error.Desc}}</p>
        {{end}}
    </div>

</div>

</body>
</html>
`))

type authorizeHidden struct {
	Name, Value string
	Set         bool
}

func (s *Server) renderAuthorize(w http.ResponseWriter, r *http.Request, q *oauthReq, missing []string, e *oauthErr, status int) {
	csrf := auth.EnsureCSRFCookie(w, r, s.Cfg.SessionCookieSecure)
	data := map[string]any{"CSRF": csrf, "Errors": missing}
	if e != nil {
		data["Error"] = map[string]string{"Code": e.code, "Desc": e.desc}
	}
	if q != nil {
		if q.client != nil {
			data["AppName"] = q.client.Name
		}
		var descs []string
		for _, sc := range q.scopes {
			for _, o := range oauthScopes {
				if o.name == sc {
					descs = append(descs, o.description)
				}
			}
		}
		data["Scopes"] = descs
		redirect := q.v("redirect_uri")
		if q.redirectURI != nil {
			redirect = *q.redirectURI
		}
		vals := map[string]string{"redirect_uri": redirect, "scope": strings.Join(q.scopes, " "), "client_id": q.v("client_id"), "state": q.v("state"),
			"response_type": q.v("response_type"), "code_challenge": q.v("code_challenge"), "code_challenge_method": q.v("code_challenge_method")}
		var hidden []authorizeHidden
		for _, f := range []string{"redirect_uri", "scope", "nonce", "client_id", "state", "response_type", "code_challenge", "code_challenge_method", "claims", "resource"} {
			v, ok := vals[f]
			if f == "state" || f == "code_challenge" || f == "code_challenge_method" {
				ok = q.has(f)
			}
			hidden = append(hidden, authorizeHidden{Name: f, Value: v, Set: ok})
		}
		data["Hidden"] = hidden
	}
	// Authorizing redirects to the application's redirect_uri: the one
	// origin this page's form may lead to besides this server.
	if q != nil && q.redirectURI != nil {
		if u, err := url.Parse(*q.redirectURI); err == nil && u.Scheme != "" {
			src := u.Scheme + ":"
			if u.Host != "" && (u.Scheme == "http" || u.Scheme == "https") {
				src = u.Scheme + "://" + u.Host
			}
			AllowFormTargets(w, src)
		}
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(status)
	_ = authorizePage.Execute(w, data)
}
