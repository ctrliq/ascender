package sso

import (
	"context"
	"crypto/hmac"
	"encoding/base64"
	"errors"
	"fmt"
	"log/slog"
	"maps"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

// The python-social-auth backends Ascender listed, by name.
const (
	Google               = "google-oauth2"
	GitHub               = "github"
	GitHubOrg            = "github-org"
	GitHubTeam           = "github-team"
	GitHubEnterprise     = "github-enterprise"
	GitHubEnterpriseOrg  = "github-enterprise-org"
	GitHubEnterpriseTeam = "github-enterprise-team"
	OIDC                 = "oidc"
	AzureAD              = "azuread-oauth2"
	AzureADTenant        = "azuread-tenant-oauth2"
	EntraID              = "entra-id"
	SAML                 = "saml"
)

// BackendPaths are the dotted class paths a session's _auth_user_backend
// named, in AUTHENTICATION_BACKENDS order.
var BackendPaths = map[string]string{
	Google:               "social_core.backends.google.GoogleOAuth2",
	GitHub:               "social_core.backends.github.GithubOAuth2",
	GitHubOrg:            "social_core.backends.github.GithubOrganizationOAuth2",
	GitHubTeam:           "social_core.backends.github.GithubTeamOAuth2",
	GitHubEnterprise:     "social_core.backends.github_enterprise.GithubEnterpriseOAuth2",
	GitHubEnterpriseOrg:  "social_core.backends.github_enterprise.GithubEnterpriseOrganizationOAuth2",
	GitHubEnterpriseTeam: "social_core.backends.github_enterprise.GithubEnterpriseTeamOAuth2",
	OIDC:                 "social_core.backends.open_id_connect.OpenIdConnectAuth",
	AzureAD:              "social_core.backends.azuread.AzureADOAuth2",
	AzureADTenant:        "social_core.backends.azuread_tenant.AzureADTenantOAuth2",
	EntraID:              "ascender.sso.entra.EntraIDOAuth2",
	SAML:                 "ascender.sso.backends.SAMLAuth",
}

// OAuthBackends are the OAuth2 backends in AUTHENTICATION_BACKENDS order.
var OAuthBackends = []string{Google, GitHub, GitHubOrg, GitHubTeam, GitHubEnterprise, GitHubEnterpriseOrg, GitHubEnterpriseTeam, OIDC, AzureAD, AzureADTenant, EntraID}

// SettingPrefix is SOCIAL_AUTH_<BACKEND>_.
func SettingPrefix(name string) string {
	return "SOCIAL_AUTH_" + strings.ToUpper(strings.ReplaceAll(name, "-", "_")) + "_"
}

// NonceStore keeps OIDC nonces (social_auth_association).
type NonceStore interface {
	Save(ctx context.Context, serverURL, nonce, state string) error
	// Take removes the nonce, reporting whether it was there.
	Take(ctx context.Context, serverURL, nonce string) (bool, error)
}

// Backend is one OAuth2 backend serving one request.
type Backend struct {
	Name string
	// RedirectURI is the absolute /sso/complete/<name>/ of the request.
	RedirectURI string
	// Setting is backend.setting(NAME): nil when absent.
	Setting func(name string) any
	Nonces  NonceStore
	Log     *slog.Logger
	// IDToken is the validated ID token of an OIDC login.
	IDToken map[string]any
	client  *Client
}

func (b *Backend) setting(name string) any { return b.Setting(name) }

func (b *Backend) str(name string) string {
	v := b.setting(name)
	if v == nil {
		return ""
	}
	if s, ok := v.(string); ok {
		return s
	}
	return PyStr(v)
}

func (b *Backend) list(name string) []string {
	l, _ := b.setting(name).([]any)
	out := make([]string, 0, len(l))
	for _, x := range l {
		out = append(out, PyStr(x))
	}
	return out
}

// Client is the backend's HTTP client: OIDC alone can skip TLS checks.
func (b *Backend) Client() *Client {
	if b.client == nil {
		verify := true
		if b.Name == OIDC {
			if v, ok := b.setting("VERIFY_SSL").(bool); ok {
				verify = v
			}
		}
		b.client = NewClient(verify)
	}
	return b.client
}

func (b *Backend) isGitHub() bool { return strings.HasPrefix(b.Name, "github") }
func (b *Backend) isEnterprise() bool {
	return strings.HasPrefix(b.Name, "github-enterprise")
}
func (b *Backend) isAzure() bool {
	return b.Name == AzureAD || b.Name == AzureADTenant || b.Name == EntraID
}

// appendSlash and urljoin are social_core's helpers.
func appendSlash(u string) string {
	if strings.HasSuffix(u, "/") {
		return u
	}
	return u + "/"
}

func urljoin(base, ref string) string {
	bu, err := url.Parse(base)
	if err != nil {
		return base + ref
	}
	ru, err := url.Parse(ref)
	if err != nil {
		return base + ref
	}
	return bu.ResolveReference(ru).String()
}

func (b *Backend) enterpriseURL(name string) (string, error) {
	u := b.str(name)
	if u == "" {
		return "", AuthMissingParameter(name)
	}
	return appendSlash(u), nil
}

// apiURL is the GitHub API base.
func (b *Backend) apiURL() (string, error) {
	if b.isEnterprise() {
		return b.enterpriseURL("API_URL")
	}
	return "https://api.github.com/", nil
}

// Azure family.

func (b *Backend) authorityHost() string {
	if h := b.str("AUTHORITY_HOST"); h != "" {
		return h
	}
	return "login.microsoftonline.com"
}

func (b *Backend) tenantID() (string, error) {
	switch b.Name {
	case AzureAD:
		return "common", nil
	case AzureADTenant:
		if v := b.setting("TENANT_ID"); v != nil {
			return PyStr(v), nil
		}
		return "common", nil
	}
	t := strings.TrimSpace(b.str("TENANT_ID"))
	switch strings.ToLower(t) {
	case "", "common", "organizations", "consumers":
		return "", AuthMissingParameter("TENANT_ID")
	}
	return t, nil
}

func (b *Backend) azureBase() (string, error) {
	t, err := b.tenantID()
	if err != nil {
		return "", err
	}
	return "https://" + b.authorityHost() + "/" + t, nil
}

var graphHosts = map[string]string{
	"login.microsoftonline.com":        "graph.microsoft.com",
	"login.microsoftonline.us":         "graph.microsoft.us",
	"login.partner.microsoftonline.cn": "microsoftgraph.chinacloudapi.cn",
}

func (b *Backend) graphHost() string {
	if h := b.str("GRAPH_HOST"); h != "" {
		return h
	}
	if h, ok := graphHosts[strings.ToLower(b.authorityHost())]; ok {
		return h
	}
	return "graph.microsoft.com"
}

func (b *Backend) groupsFromGraph() bool {
	return b.Name == EntraID && truthy(b.setting("GROUPS_FROM_GRAPH"))
}

// OpenIDConfiguration is the provider's discovery document (OIDC and the
// Azure family).
func (b *Backend) OpenIDConfiguration(ctx context.Context) (map[string]any, error) {
	var u string
	switch b.Name {
	case OIDC:
		u = b.str("OIDC_ENDPOINT") + "/.well-known/openid-configuration"
	case AzureAD:
		base, _ := b.azureBase()
		u = base + "/.well-known/openid-configuration"
	case AzureADTenant:
		base, err := b.azureBase()
		if err != nil {
			return nil, err
		}
		u = base + "/.well-known/openid-configuration"
		if v := b.setting("KEY"); v != nil {
			u += "?appid=" + PyStr(v)
		}
	case EntraID:
		base, err := b.azureBase()
		if err != nil {
			return nil, err
		}
		u = base + "/v2.0/.well-known/openid-configuration"
		if v := b.setting("KEY"); v != nil {
			u += "?appid=" + PyStr(v)
		}
	default:
		return nil, fmt.Errorf("%s has no OpenID configuration", b.Name)
	}
	return Discovery(ctx, b.Client(), u)
}

// oidcEndpoint is an endpoint from the setting or discovery.
func (b *Backend) oidcEndpoint(ctx context.Context, setting, key string) (string, error) {
	if v := b.str(setting); v != "" {
		return v, nil
	}
	conf, err := b.OpenIDConfiguration(ctx)
	if err != nil {
		return "", err
	}
	s, ok := conf[key].(string)
	if !ok {
		return "", AuthMissingParameter(setting)
	}
	return s, nil
}

// AuthorizationURL is the provider's authorization endpoint.
func (b *Backend) AuthorizationURL(ctx context.Context) (string, error) {
	switch {
	case b.Name == Google:
		return "https://accounts.google.com/o/oauth2/auth", nil
	case b.isEnterprise():
		u, err := b.enterpriseURL("URL")
		if err != nil {
			return "", err
		}
		return urljoin(u, "login/oauth/authorize"), nil
	case b.isGitHub():
		return "https://github.com/login/oauth/authorize", nil
	case b.Name == OIDC:
		return b.oidcEndpoint(ctx, "AUTHORIZATION_URL", "authorization_endpoint")
	case b.Name == EntraID:
		base, err := b.azureBase()
		return base + "/oauth2/v2.0/authorize", err
	case b.isAzure():
		base, err := b.azureBase()
		return base + "/oauth2/authorize", err
	}
	return "", fmt.Errorf("unknown backend %s", b.Name)
}

func (b *Backend) accessTokenURL(ctx context.Context) (string, error) {
	switch {
	case b.Name == Google:
		return "https://accounts.google.com/o/oauth2/token", nil
	case b.isEnterprise():
		u, err := b.enterpriseURL("URL")
		if err != nil {
			return "", err
		}
		return urljoin(u, "login/oauth/access_token"), nil
	case b.isGitHub():
		return "https://github.com/login/oauth/access_token", nil
	case b.Name == OIDC:
		return b.oidcEndpoint(ctx, "ACCESS_TOKEN_URL", "token_endpoint")
	case b.Name == EntraID:
		base, err := b.azureBase()
		return base + "/oauth2/v2.0/token", err
	case b.isAzure():
		base, err := b.azureBase()
		return base + "/oauth2/token", err
	}
	return "", fmt.Errorf("unknown backend %s", b.Name)
}

// Scope is get_scope: the setting first, then the default, duplicates kept.
func (b *Backend) Scope() ([]string, string) {
	scope := b.list("SCOPE")
	sep := " "
	switch {
	case b.Name == Google:
		scope = append(scope, "openid", "email", "profile")
	case b.isGitHub():
		sep = ","
		if b.Name == GitHubEnterpriseOrg || b.Name == GitHubEnterpriseTeam {
			scope = append(scope, "read:org")
		}
	case b.Name == OIDC, b.Name == EntraID:
		scope = append(scope, "openid", "profile", "email")
		if b.groupsFromGraph() {
			scope = append(scope, "https://"+b.graphHost()+"/GroupMember.Read.All")
		}
	case b.isAzure():
		scope = append(scope, "openid", "profile", "user_impersonation", "email")
	}
	return scope, sep
}

// AuthURL is auth_url() for a state.
func (b *Backend) AuthURL(ctx context.Context, state string) (string, error) {
	authURL, err := b.AuthorizationURL(ctx)
	if err != nil {
		return "", err
	}
	params := Params{{"client_id", b.str("KEY")}, {"redirect_uri", b.RedirectURI}, {"state", state}, {"response_type", "code"}}
	if b.Name == OIDC {
		nonce := RandomString(64)
		if b.Nonces != nil {
			if err := b.Nonces.Save(ctx, authURL, nonce, state); err != nil {
				return "", err
			}
		}
		params.Set("nonce", nonce)
	}
	if scope, sep := b.Scope(); len(scope) > 0 {
		params.Set("scope", strings.Join(scope, sep))
	}
	if extra, ok := b.setting("AUTH_EXTRA_ARGUMENTS").(map[string]any); ok {
		for _, k := range sortedKeys(extra) {
			params.Set(k, PyStr(extra[k]))
		}
	}
	return URLAddParameters(authURL, params, true), nil
}

// useBasicAuth is OIDC's choice of client authentication.
func (b *Backend) useBasicAuth(ctx context.Context) bool {
	if b.Name != OIDC {
		return false
	}
	if m := b.str("TOKEN_ENDPOINT_AUTH_METHOD"); m != "" {
		return m == "client_secret_basic"
	}
	conf, err := b.OpenIDConfiguration(ctx)
	if err != nil {
		return true
	}
	l, _ := conf["token_endpoint_auth_methods_supported"].([]any)
	if len(l) == 0 {
		return true
	}
	for _, x := range l {
		if x == "client_secret_basic" {
			return true
		}
	}
	return false
}

// clientAssertion is the Azure family's workload identity token.
func (b *Backend) clientAssertion() (string, error) {
	if v := b.str("CLIENT_ASSERTION"); v != "" {
		return v, nil
	}
	path := os.Getenv("OAUTH2_FEDERATED_TOKEN_FILE")
	if path == "" {
		path = os.Getenv("AZURE_FEDERATED_TOKEN_FILE")
	}
	if path == "" {
		path = b.str("FEDERATED_TOKEN_FILE")
	}
	if path == "" {
		return "", AuthMissingParameter("client_assertion")
	}
	data, err := os.ReadFile(path)
	if err != nil || strings.TrimSpace(string(data)) == "" {
		return "", AuthMissingParameter("client_assertion")
	}
	return strings.TrimSpace(string(data)), nil
}

// Complete is auth_complete then do_auth's user data: the response the
// pipeline runs on. get reads the callback's parameters.
func (b *Backend) Complete(ctx context.Context, get func(string) (string, bool), sessionState string) (map[string]any, error) {
	if err := ProcessError(get); err != nil {
		return nil, err
	}
	reqState, _ := get("state")
	if reqState == "" {
		reqState, _ = get("redirect_state")
	}
	if reqState == "" {
		return nil, AuthMissingParameter("state")
	}
	if sessionState == "" {
		return nil, ErrStateMissing
	}
	if !hmac.Equal([]byte(reqState), []byte(sessionState)) {
		return nil, ErrStateForbidden
	}
	tokenURL, err := b.accessTokenURL(ctx)
	if err != nil {
		return nil, err
	}
	code, _ := get("code")
	form := Params{{"grant_type", "authorization_code"}, {"code", code}, {"redirect_uri", b.RedirectURI}}
	req := &TokenRequest{URL: tokenURL, Client: b.Client()}
	if b.useBasicAuth(ctx) {
		req.Basic = &[2]string{b.str("KEY"), b.str("SECRET")}
	} else {
		form = append(form, Param{"client_id", b.str("KEY")}, Param{"client_secret", b.str("SECRET")})
		if b.isAzure() && b.str("SECRET") == "" {
			a, err := b.clientAssertion()
			if err != nil {
				return nil, err
			}
			typ := b.str("CLIENT_ASSERTION_TYPE")
			if typ == "" {
				typ = "urn:ietf:params:oauth:client-assertion-type:jwt-bearer"
			}
			form = append(form, Param{"client_assertion_type", typ}, Param{"client_assertion", a})
		}
	}
	req.Form = form
	tok, err := req.Exchange(ctx)
	if err != nil {
		return nil, err
	}
	if b.Name == OIDC {
		idt, ok := tok["id_token"].(string)
		if !ok || idt == "" {
			return nil, AuthTokenError("Missing id_token in OpenID Connect token response")
		}
		at, ok := tok["access_token"].(string)
		if !ok || at == "" {
			return nil, AuthTokenError("Missing access_token in OpenID Connect token response")
		}
		if err := b.validateOIDCToken(ctx, idt, at); err != nil {
			return nil, err
		}
	}
	atv, ok := tok["access_token"]
	if !ok {
		return nil, errors.New("KeyError: 'access_token'")
	}
	access := PyStr(atv)
	data, err := b.userData(ctx, access, tok)
	if err != nil {
		return nil, HTTPStatusError(err)
	}
	for k, v := range data {
		tok[k] = v
	}
	if _, ok := tok["access_token"]; !ok {
		tok["access_token"] = access
	}
	return tok, nil
}

// userData is user_data for each backend.
func (b *Backend) userData(ctx context.Context, access string, tok map[string]any) (map[string]any, error) {
	switch {
	case b.Name == Google:
		v, err := b.Client().GetJSON(ctx, "https://www.googleapis.com/oauth2/v3/userinfo", map[string]string{"Authorization": "Bearer " + access})
		if err != nil {
			return nil, err
		}
		m, _ := v.(map[string]any)
		return m, nil
	case b.isGitHub():
		return b.githubUserData(ctx, access)
	case b.Name == OIDC:
		u, err := b.oidcEndpoint(ctx, "USERINFO_URL", "userinfo_endpoint")
		if err != nil {
			return nil, err
		}
		v, err := b.Client().GetJSON(ctx, u, map[string]string{"Authorization": "Bearer " + access})
		if err != nil {
			return nil, err
		}
		m, _ := v.(map[string]any)
		if sub, ok := m["sub"]; ok && sub != nil && PyStr(sub) != PyStr(b.IDToken["sub"]) {
			return nil, AuthTokenError("Invalid UserInfo sub")
		}
		return m, nil
	case b.isAzure():
		idt, _ := tok["id_token"].(string)
		if idt == "" {
			idt = access
		}
		claims, err := b.validateAzureToken(ctx, idt)
		if err != nil {
			return nil, err
		}
		if claims != nil && b.groupsFromGraph() {
			claims = b.withGraphGroups(ctx, claims, access)
		}
		return claims, nil
	}
	return nil, nil
}

func (b *Backend) githubUserData(ctx context.Context, access string) (map[string]any, error) {
	api, err := b.apiURL()
	if err != nil {
		return nil, err
	}
	headers := map[string]string{"Authorization": "token " + access}
	v, err := b.Client().GetJSON(ctx, urljoin(api, "user"), headers)
	if err != nil {
		return nil, err
	}
	data, _ := v.(map[string]any)
	if data == nil {
		data = map[string]any{}
	}
	scope, _ := b.Scope()
	wantEmails := !truthy(data["email"])
	for _, s := range scope {
		if s == "user:email" {
			wantEmails = true
		}
	}
	if wantEmails {
		if ev, err := b.Client().GetJSON(ctx, urljoin(api, "user/emails"), headers); err == nil {
			if emails, ok := ev.([]any); ok {
				data["emails"] = emails
				if len(emails) > 0 {
					chosen := emails[0]
					for _, e := range emails {
						m, isMap := e.(map[string]any)
						if !isMap || truthy(m["primary"]) {
							chosen = e
							break
						}
					}
					// Only an address GitHub verified: an unverified one is
					// whatever the account holder typed, and email decides
					// account linking and organization maps.
					if m, ok := chosen.(map[string]any); ok && truthy(m["verified"]) {
						data["email"] = m["email"]
					}
				}
			}
		} else {
			var he *HTTPError
			var ae *Error
			if !errors.As(err, &he) && errors.As(err, &ae) {
				return nil, err
			}
		}
	}
	var member string
	login := PyStr(data["login"])
	switch b.Name {
	case GitHubOrg, GitHubEnterpriseOrg:
		member = urljoin(api, "orgs/"+b.str("NAME")+"/members/"+login)
	case GitHubTeam, GitHubEnterpriseTeam:
		member = urljoin(api, "teams/"+b.str("ID")+"/members/"+login)
	}
	if member != "" {
		if _, _, err := b.Client().Do(ctx, http.MethodGet, member, headers, nil); err != nil {
			var he *HTTPError
			if errors.As(err, &he) {
				return nil, AuthFailed("User doesn't belong to the organization")
			}
			return nil, err
		}
	}
	return data, nil
}

// withGraphGroups replaces the token's groups with Microsoft Graph's.
func (b *Backend) withGraphGroups(ctx context.Context, claims map[string]any, access string) map[string]any {
	out := make(map[string]any, len(claims))
	for k, v := range claims {
		if k != "groups" {
			out[k] = v
		}
	}
	if cn, ok := out["_claim_names"].(map[string]any); ok {
		if _, has := cn["groups"]; has {
			n := map[string]any{}
			for k, v := range cn {
				if k != "groups" {
					n[k] = v
				}
			}
			out["_claim_names"] = n
		}
	}
	groups, err := b.graphGroups(ctx, access)
	if err != nil {
		if b.Log != nil {
			b.Log.ErrorContext(ctx, fmt.Sprintf("Could not read the groups of %s from Microsoft Graph, rules on groups will not apply to this login: %v", PyStr(claims["oid"]), err), "logger", "ascender.sso.entra")
		}
		return out
	}
	out["groups"] = groups
	return out
}

func (b *Backend) graphGroups(ctx context.Context, access string) ([]any, error) {
	host := b.graphHost()
	u := "https://" + host + "/v1.0/me/transitiveMemberOf/microsoft.graph.group?$count=true&$select=id&$top=999"
	headers := map[string]string{"Authorization": "Bearer " + access, "Accept": "application/json", "ConsistencyLevel": "eventual"}
	seen := map[string]bool{}
	var groups []any
	for i := 0; i < 50; i++ {
		v, err := b.Client().GetJSON(ctx, u, headers)
		if err != nil {
			return nil, err
		}
		page, _ := v.(map[string]any)
		list, ok := page["value"].([]any)
		if page == nil || !ok {
			return nil, errors.New("Microsoft Graph answered with no list of groups")
		}
		for _, g := range list {
			m, _ := g.(map[string]any)
			id, _ := m["id"].(string)
			if id == "" {
				return nil, errors.New("Microsoft Graph listed a group with no ID")
			}
			if !seen[id] {
				seen[id] = true
				groups = append(groups, id)
			}
		}
		next, _ := page["@odata.nextLink"].(string)
		if next == "" {
			if groups == nil {
				groups = []any{}
			}
			return groups, nil
		}
		nu, err := url.Parse(next)
		if err != nil || nu.Scheme != "https" || nu.Hostname() != strings.ToLower(host) {
			h := ""
			if nu != nil {
				h = nu.Hostname()
			}
			return nil, fmt.Errorf("Microsoft Graph pointed the next page at %s", h)
		}
		u = next
	}
	return nil, errors.New("more than 50 pages of groups")
}

// validateOIDCToken is OpenIdConnectAuth.validate_and_return_id_token.
func (b *Backend) validateOIDCToken(ctx context.Context, idToken, accessToken string) error {
	t, err := ParseJWT(idToken)
	if err != nil {
		return AuthTokenError(err.Error())
	}
	jwksURI, err := b.oidcEndpoint(ctx, "JWKS_URI", "jwks_uri")
	if err != nil {
		return err
	}
	kid, hasKid := t.Header["kid"]
	kv, err := JWKS(ctx, b.Client(), jwksURI, false)
	if err != nil {
		return err
	}
	keys := keysOf(kv)
	match := func(keys []JWK) []JWK {
		if !hasKid || kid == nil {
			return keys
		}
		var out []JWK
		for _, k := range keys {
			if k["kid"] == kid {
				out = append(out, k)
			}
		}
		return out
	}
	candidates := match(keys)
	if hasKid && kid != nil && len(candidates) == 0 {
		if kv, err = JWKS(ctx, b.Client(), jwksURI, true); err != nil {
			return err
		}
		candidates = match(keysOf(kv))
	}
	var key JWK
	for _, k := range candidates {
		alg := str(k, "alg")
		if alg == "" {
			// A copy: k is the JWKS cache's own map, which concurrent
			// logins read.
			k = maps.Clone(k)
			alg = "RS256"
			k["alg"] = alg
		}
		if t.Verify(k, alg) {
			key = k
			break
		}
	}
	if key == nil {
		return AuthTokenError("Signature verification failed")
	}
	issuer, err := b.oidcEndpoint(ctx, "ID_TOKEN_ISSUER", "issuer")
	if err != nil {
		return err
	}
	clientID := b.str("KEY")
	if err := t.Decode(key, ClaimChecks{Audience: clientID, Issuer: issuer, Leeway: 1}); err != nil {
		var ae *AudienceError
		var ee *ExpiredError
		switch {
		case errors.As(err, &ee):
			return AuthTokenError("Signature has expired")
		case errors.As(err, &ae) && !ae.Missing:
			return AuthTokenError("Token error: Invalid audience")
		}
		return AuthTokenError(err.Error())
	}
	claims := t.Claims
	// aud and azp.
	switch aud := claims["aud"].(type) {
	case string:
	case []any:
		for _, a := range aud {
			if _, ok := a.(string); !ok {
				return AuthTokenError("Incorrect id_token: aud")
			}
		}
		if _, ok := claims["azp"]; len(aud) > 1 && !ok {
			return AuthTokenError("Incorrect id_token: azp")
		}
	default:
		return AuthTokenError("Incorrect id_token: aud")
	}
	if azp, ok := claims["azp"]; ok && PyStr(azp) != clientID {
		return AuthTokenError("Incorrect id_token: azp")
	}
	// at_hash.
	if ah, ok := claims["at_hash"]; ok {
		_, newHash, ok := hashFor(str(key, "alg"))
		if ok {
			d := newHash()
			d.Write([]byte(accessToken))
			sum := d.Sum(nil)
			want := base64.RawURLEncoding.EncodeToString(sum[:len(sum)/2])
			if PyStr(ah) != want {
				return AuthTokenError("Invalid access token")
			}
		}
	}
	now := float64(time.Now().Unix())
	if v, ok := claims["nbf"]; ok {
		if nbf, ok := pyInt(v); ok && now < nbf {
			return AuthTokenError("Incorrect id_token: nbf")
		}
	}
	iat, ok := pyInt(claims["iat"])
	if _, has := claims["iat"]; !has || !ok || now > iat+600 {
		return AuthTokenError("Incorrect id_token: iat")
	}
	nonce, ok := claims["nonce"].(string)
	if !ok || nonce == "" {
		return AuthTokenError("Incorrect id_token: nonce")
	}
	authURL, err := b.AuthorizationURL(ctx)
	if err != nil {
		return err
	}
	if b.Nonces != nil {
		found, err := b.Nonces.Take(ctx, authURL, nonce)
		if err != nil {
			return err
		}
		if !found {
			return AuthTokenError("Incorrect id_token: nonce")
		}
	}
	b.IDToken = claims
	return nil
}

var uuidRe = strings.NewReplacer("-", "", "{", "", "}", "", "urn:uuid:", "")

// parseUUID is Python's UUID(): hyphens, braces and the urn prefix aside,
// 32 hex digits.
func parseUUID(s string) (string, bool) {
	t := strings.ToLower(strings.TrimSpace(s))
	t = uuidRe.Replace(t)
	if len(t) != 32 {
		return "", false
	}
	for i := 0; i < len(t); i++ {
		if !isHex(t[i]) {
			return "", false
		}
	}
	return t, true
}

// validateAzureToken is AzureADOAuth2.validate_and_return_id_token.
func (b *Backend) validateAzureToken(ctx context.Context, token string) (map[string]any, error) {
	t, err := ParseJWT(token)
	if err != nil {
		return nil, AuthTokenError(err.Error())
	}
	kid := PyStr(t.Header["kid"])
	if t.Header["kid"] == nil || kid == "" {
		return nil, AuthMissingParameter("kid")
	}
	conf, err := b.OpenIDConfiguration(ctx)
	if err != nil {
		return nil, err
	}
	jwksURI := b.str("JWKS_URI")
	if jwksURI == "" {
		s, ok := conf["jwks_uri"].(string)
		if !ok {
			return nil, AuthMissingParameter("jwks_uri")
		}
		jwksURI = s
	}
	find := func(refresh bool) (JWK, error) {
		kv, err := JWKS(ctx, b.Client(), jwksURI, refresh)
		if err != nil {
			return nil, err
		}
		if _, ok := kv.([]any); !ok {
			return nil, AuthMissingParameter("keys")
		}
		for _, k := range keysOf(kv) {
			if PyStr(k["kid"]) == kid {
				return k, nil
			}
		}
		return nil, nil
	}
	key, err := find(false)
	if err == nil && key == nil {
		key, err = find(true)
	}
	if err != nil {
		return nil, err
	}
	if key == nil {
		return nil, AuthTokenError("Signature key not found")
	}
	tid := func() (string, error) {
		s, ok := t.Claims["tid"].(string)
		if !ok || s == "" {
			return "", AuthMissingParameter("tid")
		}
		return s, nil
	}
	fill := func(s string) (string, error) {
		if !strings.Contains(s, "{tenantid}") && !strings.Contains(s, "{tenantId}") {
			return s, nil
		}
		id, err := tid()
		if err != nil {
			return "", err
		}
		return strings.NewReplacer("{tenantid}", id, "{tenantId}", id).Replace(s), nil
	}
	if ki, ok := key["issuer"].(string); ok {
		want, err := fill(ki)
		if err != nil {
			return nil, err
		}
		if want != PyStr(t.Claims["iss"]) {
			return nil, AuthTokenError("Token issuer does not match signing key issuer")
		}
	}
	k := JWK{}
	for kk, v := range key {
		k[kk] = v
	}
	if str(k, "alg") == "" {
		k["alg"] = "RS256"
	}
	audience := b.str("KEY")
	if b.Name != AzureAD {
		configured, _ := b.tenantID()
		if want, ok := parseUUID(configured); ok {
			id, err := tid()
			if err != nil {
				return nil, err
			}
			got, ok := parseUUID(id)
			if !ok || got != want {
				return nil, AuthTokenError("Token tenant does not match configured tenant")
			}
		}
	}
	iss, ok := conf["issuer"].(string)
	if !ok {
		return nil, AuthMissingParameter("issuer")
	}
	issuer, err := fill(iss)
	if err != nil {
		return nil, err
	}
	if err := t.Decode(k, ClaimChecks{Audience: audience, Issuer: issuer}); err != nil {
		return nil, AuthTokenError(err.Error())
	}
	return t.Claims, nil
}

// UserID is get_user_id, as str() made it.
func (b *Backend) UserID(details, response map[string]any) (string, error) {
	switch {
	case b.Name == Google:
		return PyStr(details["email"]), nil
	case b.Name == OIDC:
		v, ok := b.IDToken["sub"]
		if !ok {
			return "", errors.New("KeyError: 'sub'")
		}
		return PyStr(v), nil
	case b.Name == AzureAD:
		v, ok := response["upn"]
		if !ok {
			return "", AuthMissingParameter("upn")
		}
		return PyStr(v), nil
	case b.Name == AzureADTenant:
		return PyStr(response["sub"]), nil
	case b.Name == EntraID:
		if !truthy(response["oid"]) {
			return "", AuthMissingParameter("oid")
		}
		return PyStr(response["oid"]), nil
	}
	if truthy(details["id"]) {
		return PyStr(details["id"]), nil
	}
	return PyStr(response["id"]), nil
}

func getDefault(m map[string]any, k string, def any) any {
	if v, ok := m[k]; ok {
		return v
	}
	return def
}

func strOrEmpty(v any) string {
	if v == nil {
		return ""
	}
	return PyStr(v)
}

// UserDetails is get_user_details. Values may be nil (OIDC).
func (b *Backend) UserDetails(response map[string]any) map[string]any {
	switch {
	case b.Name == Google:
		email := strOrEmpty(getDefault(response, "email", ""))
		user, _, _ := strings.Cut(email, "@")
		full, first, last := GetUserNames(strOrEmpty(response["name"]), strOrEmpty(response["given_name"]), strOrEmpty(response["family_name"]))
		return map[string]any{"username": user, "email": email, "fullname": full, "first_name": first, "last_name": last}
	case b.isGitHub():
		full, first, last := GetUserNames(strOrEmpty(response["name"]), "", "")
		email := ""
		if truthy(response["email"]) {
			email = PyStr(response["email"])
		}
		return map[string]any{"username": response["login"], "email": email, "fullname": full, "first_name": first, "last_name": last}
	case b.Name == OIDC:
		key := b.str("USERNAME_KEY")
		if b.setting("USERNAME_KEY") == nil {
			key = "preferred_username"
		}
		val := func(k string) any {
			if v, ok := response[k]; ok {
				return v
			}
			return b.IDToken[k]
		}
		return map[string]any{"username": val(key), "email": val("email"), "fullname": val("name"), "first_name": val("given_name"), "last_name": val("family_name")}
	case b.Name == EntraID:
		pu := response["preferred_username"]
		key := b.str("USERNAME_KEY")
		if key == "" {
			key = "preferred_username"
		}
		username := response[key]
		if !truthy(username) {
			username = pu
		}
		var email any = response["email"]
		if !truthy(email) {
			if s, ok := pu.(string); ok && strings.Contains(s, "@") {
				email = s
			} else {
				email = ""
			}
		}
		return map[string]any{"username": username, "email": email, "fullname": getDefault(response, "name", ""),
			"first_name": getDefault(response, "given_name", ""), "last_name": getDefault(response, "family_name", "")}
	case b.isAzure():
		return map[string]any{"username": getDefault(response, "name", ""), "email": getDefault(response, "email", response["upn"]),
			"fullname": getDefault(response, "name", ""), "first_name": getDefault(response, "given_name", ""), "last_name": getDefault(response, "family_name", "")}
	}
	return map[string]any{}
}

type extraItem struct {
	name, alias string
	discard     bool
}

func (b *Backend) extraItems() []extraItem {
	switch {
	case b.Name == Google:
		return []extraItem{{"refresh_token", "refresh_token", true}, {"expires_in", "expires_in", false}, {"token_type", "token_type", true}}
	case b.isGitHub():
		return []extraItem{{"id", "id", false}, {"expires_in", "expires_in", false}, {"login", "login", false}, {"refresh_token", "refresh_token", false}}
	case b.Name == OIDC:
		return []extraItem{{"id_token", "id_token", false}, {"refresh_token", "refresh_token", false}, {"sub", "id", false}}
	case b.isAzure():
		return []extraItem{{"access_token", "access_token", false}, {"id_token", "id_token", false}, {"refresh_token", "refresh_token", false},
			{"expires_in", "expires_in", false}, {"expires_on", "expires_on", false}, {"not_before", "not_before", false},
			{"given_name", "first_name", false}, {"family_name", "last_name", false}, {"token_type", "token_type", false}}
	}
	return nil
}

// ExtraData is extra_data(): what the social auth row keeps.
func (b *Backend) ExtraData(response, details map[string]any) (map[string]any, error) {
	data := map[string]any{"auth_time": time.Now().Unix()}
	for _, it := range b.extraItems() {
		v, ok := response[it.name]
		if !ok {
			if dv, ok := details[it.name]; ok {
				v = dv
			} else {
				v = details[it.alias]
			}
		}
		if it.discard && !truthy(v) {
			continue
		}
		data[it.alias] = v
	}
	if v := response["access_token"]; truthy(v) {
		data["access_token"] = v
	} else {
		data["access_token"] = nil
	}
	if v := response["token_type"]; truthy(v) {
		data["token_type"] = v
	} else {
		data["token_type"] = nil
	}
	if b.isAzure() {
		data["resource"] = b.setting("RESOURCE")
	}
	if b.Name == OIDC {
		if _, has := response["id_token"]; has && b.IDToken == nil {
			return nil, AuthTokenError("ID token was not validated")
		}
		if b.IDToken != nil {
			c := map[string]any{}
			for _, k := range []string{"iss", "sub", "aud"} {
				v, ok := b.IDToken[k]
				if !ok {
					return nil, AuthTokenError("Incorrect id_token: " + k)
				}
				c[k] = v
			}
			for _, k := range []string{"auth_time", "nonce", "azp"} {
				if v, ok := b.IDToken[k]; ok {
					c[k] = v
				}
			}
			data["_oidc_id_token_context"] = c
		}
	}
	return data, nil
}

// AuthAllowed is auth_allowed: the email and domain whitelists.
func (b *Backend) AuthAllowed(details map[string]any) bool {
	var emails, domains []string
	for _, e := range b.list("WHITELISTED_EMAILS") {
		emails = append(emails, strings.ToLower(e))
	}
	for _, d := range b.list("WHITELISTED_DOMAINS") {
		domains = append(domains, strings.ToLower(d))
	}
	email, _ := details["email"].(string)
	if len(emails) == 0 && len(domains) == 0 {
		return true
	}
	// A list restricts who may sign in: a login that brings no email
	// cannot show it is on it (auth_allowed let it through).
	if email == "" {
		return false
	}
	email = strings.ToLower(email)
	_, domain, ok := strings.Cut(email, "@")
	if !ok {
		return false
	}
	for _, e := range emails {
		if e == email {
			return true
		}
	}
	for _, d := range domains {
		if d == domain {
			return true
		}
	}
	return false
}
