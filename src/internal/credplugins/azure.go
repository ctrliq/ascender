package credplugins

import (
	"context"
	"net/http"
	"net/url"
	"strings"
)

// azureAuthorityHosts are the Entra ID hosts of each cloud.
var azureAuthorityHosts = map[string]string{
	"AzureChinaCloud":   "login.chinacloudapi.cn",
	"AzureGermanCloud":  "login.microsoftonline.de",
	"AzureCloud":        "login.microsoftonline.com",
	"AzureUSGovernment": "login.microsoftonline.us",
}

const azureKeyVaultAPIVersion = "2025-07-01"

// azureKeyVaultBackend is azure_keyvault_backend: SecretClient.get_secret
// with a ClientSecretCredential.
func azureKeyVaultBackend(ctx context.Context, env Env, kw Kwargs) (any, error) {
	tenant, err := kw.need("tenant")
	if err != nil {
		return nil, err
	}
	client, err := kw.need("client")
	if err != nil {
		return nil, err
	}
	secret, err := kw.need("secret")
	if err != nil {
		return nil, err
	}
	authority, ok := azureAuthorityHosts[kw.get("cloud_name", "AzureCloud")]
	if !ok {
		authority = azureAuthorityHosts["AzureCloud"]
	}
	if client == "" {
		return nil, exc("ValueError", "client_id should be the id of a Microsoft Entra application")
	}
	if secret == "" {
		return nil, exc("ValueError", "secret should be a Microsoft Entra application's client secret")
	}
	if tenant == "" || strings.Trim(tenant, "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-.") != "" {
		return nil, exc("ValueError", "Invalid tenant ID provided. You can locate your tenant ID by following the instructions here: https://learn.microsoft.com/partner-center/find-ids-and-domain-names")
	}
	vault := strings.TrimRight(kw.get("url", ""), "/")
	if vault == "" {
		return nil, keyError("url")
	}
	name, err := kw.need("secret_field")
	if err != nil {
		return nil, err
	}
	version := kw.get("secret_version", "")
	reqURL := vault + "/secrets/" + quote(name, "") + "/" + quote(version, "") + "?api-version=" + azureKeyVaultAPIVersion
	if u, err := url.Parse(vault); err != nil || u.Scheme != "https" {
		return nil, exc("ServiceRequestError", "Bearer token authentication is not permitted for non-TLS protected (non-https) URLs.")
	}
	s, err := newSession(env, timeouts(300, 300))
	if err != nil {
		return nil, azureTransportError(err)
	}
	h := http.Header{"Accept": {"application/json"}}
	// The first request goes without a token, for the vault to say which
	// tenant and resource to get one for.
	resp, err := s.do(ctx, "GET", reqURL, h, nil)
	if err != nil {
		return nil, azureTransportError(err)
	}
	if resp.status == http.StatusUnauthorized {
		scope, challengeTenant, ok := azureChallenge(resp.header.Get("WWW-Authenticate"))
		if ok {
			su, _ := url.Parse(scope)
			if su == nil || su.Host == "" {
				return nil, exc("ValueError", "The challenge contains invalid scope '%s'.", scope)
			}
			vu, _ := url.Parse(reqURL)
			if !strings.HasSuffix(strings.ToLower(vu.Host), "."+strings.ToLower(su.Host)) {
				return nil, exc("ValueError", "The challenge resource '%s' does not match the requested domain. Pass `verify_challenge_resource=False` to your client's constructor to disable this verification. See https://aka.ms/azsdk/blog/vault-uri for more information.", su.Host)
			}
			if challengeTenant != "" && !strings.EqualFold(challengeTenant, tenant) && !strings.HasSuffix(strings.ToLower(challengeTenant), "adfs") && tenant != "adfs" {
				return nil, exc("ClientAuthenticationError", "The current credential is not configured to acquire tokens for tenant %s.", challengeTenant)
			}
			token, err := azureToken(ctx, s, authority, tenant, client, secret, scope)
			if err != nil {
				return nil, err
			}
			h.Set("Authorization", "Bearer "+token)
			if resp, err = s.do(ctx, "GET", reqURL, h, nil); err != nil {
				return nil, azureTransportError(err)
			}
		}
	}
	switch {
	case resp.status >= 200 && resp.status < 300:
	case resp.status == http.StatusUnauthorized:
		return nil, exc("ClientAuthenticationError", "Operation returned an invalid status '%s'", resp.reason)
	case resp.status == http.StatusNotFound:
		return nil, exc("ResourceNotFoundError", "%s", azureErrorMessage(resp))
	case resp.status == http.StatusConflict:
		return nil, exc("ResourceExistsError", "%s", azureErrorMessage(resp))
	case resp.status == http.StatusNotModified:
		return nil, exc("ResourceNotModifiedError", "%s", azureErrorMessage(resp))
	default:
		return nil, exc("HttpResponseError", "%s", azureErrorMessage(resp))
	}
	j, err := resp.json()
	if err != nil {
		return nil, exc("DecodeError", "JSON is invalid")
	}
	if m, ok := j.(map[string]any); ok {
		return m["value"], nil
	}
	return nil, nil
}

func azureErrorMessage(resp *response) string {
	var j map[string]any
	if v, err := decodeJSON(resp.body); err == nil {
		j, _ = v.(map[string]any)
	}
	if e, ok := j["error"].(map[string]any); ok {
		return "(" + PyStr(e["code"]) + ") " + PyStr(e["message"])
	}
	return "Operation returned an invalid status '" + resp.reason + "'"
}

// azureChallenge reads a Bearer challenge: the scope to ask for and the
// tenant in the authorization URI.
func azureChallenge(header string) (scope, tenant string, ok bool) {
	h := strings.TrimSpace(header)
	if !strings.HasPrefix(strings.ToLower(h), "bearer ") {
		return "", "", false
	}
	params := map[string]string{}
	for _, part := range strings.FieldsFunc(h[len("bearer "):], func(r rune) bool { return r == ',' || r == ' ' }) {
		if k, v, found := strings.Cut(part, "="); found {
			params[strings.ToLower(k)] = strings.Trim(v, `"`)
		}
	}
	auth := params["authorization"]
	if auth == "" {
		auth = params["authorization_uri"]
	}
	if auth == "" {
		return "", "", false
	}
	if u, err := url.Parse(auth); err == nil {
		segs := strings.Split(strings.Trim(u.Path, "/"), "/")
		tenant = segs[len(segs)-1]
	}
	scope = params["scope"]
	if scope == "" {
		scope = params["resource"]
		if scope == "" {
			return "", "", false
		}
		scope += "/.default"
	}
	return scope, tenant, true
}

// azureToken is ClientSecretCredential.get_token through MSAL: the
// tenant's OpenID configuration names the token endpoint.
func azureToken(ctx context.Context, s *session, authority, tenant, client, secret, scope string) (string, error) {
	authErr := func(msg string) error { return exc("ClientAuthenticationError", "%s", msg) }
	base := "https://" + authority + "/" + tenant
	resp, err := s.do(ctx, "GET", base+"/v2.0/.well-known/openid-configuration", nil, nil)
	if err != nil {
		return "", azureTransportError(err)
	}
	cfg, err := resp.json()
	if err != nil || resp.status != 200 {
		return "", authErr("Unable to get authority configuration for " + base + ".")
	}
	endpoint, _ := cfg.(map[string]any)["token_endpoint"].(string)
	if endpoint == "" {
		return "", authErr("Unable to get authority configuration for " + base + ".")
	}
	form := url.Values{"client_id": {client}, "client_secret": {secret}, "grant_type": {"client_credentials"}, "scope": {scope}}
	if resp, err = s.do(ctx, "POST", endpoint, nil, form); err != nil {
		return "", azureTransportError(err)
	}
	tok, err := resp.json()
	m, _ := tok.(map[string]any)
	if at, ok := m["access_token"].(string); err == nil && ok && at != "" {
		return at, nil
	}
	msg := "Authentication failed"
	if d, ok := m["error_description"].(string); ok {
		msg = "Authentication failed: " + d
	}
	return "", authErr(msg)
}

// azureTransportError renames a requests exception to azure-core's.
func azureTransportError(err error) error {
	e, ok := err.(*Exception)
	if !ok {
		return err
	}
	switch e.Class {
	case "ConnectionError", "ConnectTimeout", "SSLError", "ProxyError", "InvalidURL", "MissingSchema", "InvalidSchema":
		return &Exception{Class: "ServiceRequestError", Msg: e.Msg}
	case "ReadTimeout", "ChunkedEncodingError":
		return &Exception{Class: "ServiceResponseError", Msg: e.Msg}
	}
	return err
}
