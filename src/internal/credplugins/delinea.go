package credplugins

import (
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"
)

// dsvProcess is SecretsVault.process: 4xx answers carry a message.
func dsvProcess(resp *response) error {
	switch {
	case resp.status >= 200 && resp.status < 300:
		return nil
	case resp.status >= 400 && resp.status < 500:
		j, err := resp.json()
		if err != nil {
			return err
		}
		msg, err := index(j, "message")
		if err != nil {
			return err
		}
		return exc("SecretsVaultAccessError", "%s", PyStr(msg))
	}
	return exc("SecretsVaultError", "<Response [%d]>", resp.status)
}

// dsvBackend is dsv_backend: Delinea (Thycotic) DevOps Secrets Vault.
func dsvBackend(ctx context.Context, env Env, kw Kwargs) (any, error) {
	tenant, err := kw.need("tenant")
	if err != nil {
		return nil, err
	}
	tld := kw.get("tld", "com")
	template := kw.get("url_template", "https://{}.secretsvaultcloud.{}")
	clientID, err := kw.need("client_id")
	if err != nil {
		return nil, err
	}
	clientSecret, err := kw.need("client_secret")
	if err != nil {
		return nil, err
	}
	path, err := kw.need("path")
	if err != nil {
		return nil, err
	}
	field, err := kw.need("secret_field")
	if err != nil {
		return nil, err
	}
	decoding := kw.get("secret_decoding", "No Decoding")
	tenantURL := strings.Replace(strings.Replace(template, "{}", tenant, 1), "{}", strings.Trim(tld, "."), 1)
	base := strings.TrimRight(tenantURL, "/")
	s, err := newSession(env, httpOpts{})
	if err != nil {
		return nil, err
	}
	// PasswordGrantAuthorizer._get_access_grant
	resp, err := s.do(ctx, "POST", base+"/v1/token", nil, map[string]any{"client_id": clientID, "client_secret": clientSecret, "grant_type": "client_credentials"})
	if err != nil {
		return nil, err
	}
	if err := dsvProcess(resp); err != nil {
		if classOf(err) == "JSONDecodeError" {
			return nil, exc("SecretsVaultError", "<Response [%d]>", resp.status)
		}
		return nil, err
	}
	grant, err := resp.json()
	if err != nil {
		return nil, exc("SecretsVaultError", "<Response [%d]>", resp.status)
	}
	token, err := index(grant, "accessToken")
	if err != nil {
		return nil, err
	}
	resp, err = s.do(ctx, "GET", base+"/v1/secrets/"+strings.TrimLeft(path, "/"), http.Header{"Authorization": {"Bearer " + PyStr(token)}}, nil)
	if err != nil {
		return nil, err
	}
	if err := dsvProcess(resp); err != nil {
		return nil, err
	}
	secret, err := resp.json()
	if err != nil {
		// Not the body: the server is whatever the credential names, and
		// its reply is not to be read back through the error.
		return nil, exc("SecretsVaultError", "The response from %s is not JSON (HTTP %d).", resp.url, resp.status)
	}
	v, err := dig(secret, "data", field)
	if err != nil {
		return nil, err
	}
	if decoding == "Decode Base64" {
		return b64decodeText(PyStr(v))
	}
	return v, nil
}

var notBase64 = regexp.MustCompile(`[^A-Za-z0-9+/=]`)

// b64decodeText is b64decode(s).decode(): characters outside the alphabet
// are dropped, as binascii did without validate.
func b64decodeText(s string) (string, error) {
	s = notBase64.ReplaceAllString(s, "")
	if i := strings.IndexByte(s, '='); i >= 0 {
		s = s[:i]
	}
	b, err := base64.RawStdEncoding.DecodeString(s)
	if err != nil {
		return "", exc("Error", "Incorrect padding")
	}
	if !utf8.Valid(b) {
		return "", exc("UnicodeDecodeError", "'utf-8' codec can't decode bytes")
	}
	return string(b), nil
}

// tssProcess is SecretServer.process.
func tssProcess(resp *response) error {
	switch {
	case resp.status >= 200 && resp.status < 300:
		return nil
	case resp.status >= 400 && resp.status < 500:
		j, err := resp.json()
		if err != nil {
			return exc("SecretServerClientError", "Expecting value")
		}
		m, _ := j.(map[string]any)
		if v, ok := m["message"]; ok {
			return exc("SecretServerClientError", "%s", PyStr(v))
		}
		if v, ok := m["error"].(string); ok {
			return exc("SecretServerClientError", "%s", v)
		}
		if m == nil {
			return exc("TypeError", "argument of type is not iterable")
		}
		return exc("UnboundLocalError", "cannot access local variable 'message' where it is not associated with a value")
	}
	return exc("SecretServerServiceError", "<Response [%d]>", resp.status)
}

// tssHealthy is _validate_health_endpoint.
func tssHealthy(ctx context.Context, s *session, u string) bool {
	resp, err := s.do(ctx, "GET", u, nil, nil)
	if err != nil {
		return false
	}
	if j, err := resp.json(); err == nil {
		if m, ok := j.(map[string]any); ok {
			return truthy(m["Healthy"])
		}
	}
	return bytes.Contains(resp.body, []byte("Healthy")) || bytes.Contains(resp.body, []byte("healthy"))
}

// tssBackend is tss_backend: Delinea (Thycotic) Secret Server, on premises
// or on the Delinea Platform.
func tssBackend(ctx context.Context, env Env, kw Kwargs) (any, error) {
	serverURL, err := kw.need("server_url")
	if err != nil {
		return nil, err
	}
	username, err := kw.need("username")
	if err != nil {
		return nil, err
	}
	password, err := kw.need("password")
	if err != nil {
		return nil, err
	}
	secretID, err := kw.need("secret_id")
	if err != nil {
		return nil, err
	}
	base := strings.TrimRight(serverURL, "/")
	s, err := newSession(env, timeouts(60, 60))
	if err != nil {
		return nil, err
	}
	// _perform_server_detection
	serverType := ""
	switch {
	case tssHealthy(ctx, s, base+"/api/v1/healthcheck"):
		serverType = "secret_server"
	case tssHealthy(ctx, s, base+"/health"):
		serverType = "platform"
	default:
		return nil, exc("SecretServerError", "Unable to detect server type via health check endpoints.")
	}
	if ctx.Err() != nil {
		return nil, ctx.Err()
	}
	form := url.Values{}
	tokenURL := base + "/oauth2/token"
	if serverType == "secret_server" {
		form.Set("username", username)
		form.Set("password", password)
		form.Set("grant_type", "password")
		if kw.truthy("domain") {
			form.Set("domain", PyStr(kw["domain"]))
		}
	} else {
		tokenURL = base + "/identity/api/oauth2/token/xpmplatform"
		form.Set("client_id", username)
		form.Set("client_secret", password)
		form.Set("grant_type", "client_credentials")
		form.Set("scope", "xpmheadless")
	}
	resp, err := s.do(ctx, "POST", tokenURL, nil, form)
	if err != nil {
		return nil, err
	}
	if err := tssProcess(resp); err != nil {
		return nil, err
	}
	grant, err := resp.json()
	if err != nil {
		return nil, exc("SecretServerError", "<Response [%d]>", resp.status)
	}
	token, err := index(grant, "access_token")
	if err != nil {
		return nil, err
	}
	auth := http.Header{"Authorization": {"Bearer " + PyStr(token)}}
	if serverType == "platform" {
		// ensure_vault_url: the platform names the vault to read from.
		resp, err := s.do(ctx, "GET", base+"/vaultbroker/api/vaults", auth, nil)
		if err != nil {
			return nil, err
		}
		if resp.status != 200 {
			return nil, exc("SecretServerError", "Failed to fetch vault details: HTTP %d", resp.status)
		}
		j, err := resp.json()
		if err != nil {
			return nil, exc("SecretServerError", "Failed to parse vault details: %v", err)
		}
		found := false
		m, _ := j.(map[string]any)
		vaults, _ := m["vaults"].([]any)
		for _, v := range vaults {
			vm, _ := v.(map[string]any)
			if !truthy(vm["isDefault"]) || !truthy(vm["isActive"]) {
				continue
			}
			conn, _ := vm["connection"].(map[string]any)
			if truthy(conn["url"]) {
				base, found = strings.TrimRight(PyStr(conn["url"]), "/"), true
				break
			}
		}
		if !found {
			return nil, exc("SecretServerError", "No configured default and active vault found in vault details.")
		}
	}
	api := base + "/api/v1"
	if resp, err = s.do(ctx, "GET", api+"/secrets/"+secretID, auth, nil); err != nil {
		return nil, err
	}
	if err := tssProcess(resp); err != nil {
		return nil, err
	}
	secret, err := resp.json()
	if err != nil {
		return nil, exc("SecretServerError", "The response from %s is not JSON (HTTP %d).", resp.url, resp.status)
	}
	items, err := index(secret, "items")
	if err != nil {
		return nil, err
	}
	list, _ := items.([]any)
	field := kw.get("secret_field", "")
	if !kw.has("secret_field") {
		return nil, keyError("secret_field")
	}
	var match map[string]any
	for _, it := range list {
		im, _ := it.(map[string]any)
		slug, err := index(im, "slug")
		if err != nil {
			return nil, err
		}
		att, err := index(im, "fileAttachmentId")
		if err != nil {
			return nil, err
		}
		if truthy(att) {
			// A file field's value is read on its own.
			r, err := s.do(ctx, "GET", fmt.Sprintf("%s/secrets/%s/fields/%s", api, secretID, PyStr(slug)), auth, nil)
			if err != nil {
				return nil, err
			}
			if err := tssProcess(r); err != nil {
				return nil, err
			}
			im["itemValue"] = &response{body: r.body}
		}
		if PyStr(slug) == field {
			match = im
		}
	}
	// ServerSecret(**secret): the heartbeat dates have to parse.
	if m, ok := secret.(map[string]any); ok {
		for _, k := range []string{"lastHeartBeatCheck", "lastPasswordChangeAttempt"} {
			if v, ok := m[k]; ok {
				sv, isStr := v.(string)
				if !isStr {
					return nil, exc("TypeError", "expected string or bytes-like object, got %s", pyTypeName(v))
				}
				if _, err := time.Parse("2006-01-02T15:04:05", fractional.ReplaceAllString(sv, "")); err != nil {
					return nil, exc("ValueError", "time data %s does not match format '%%Y-%%m-%%dT%%H:%%M:%%S'", pyRepr(sv))
				}
			}
		}
	}
	if match == nil {
		return nil, keyError(field)
	}
	v, ok := match["itemValue"]
	if !ok {
		return nil, exc("AttributeError", "'Field' object has no attribute 'value'")
	}
	switch x := v.(type) {
	case string:
		return x, nil
	case *response:
		return x.text(), nil
	}
	return nil, exc("AttributeError", "%s object has no attribute 'text'", pyRepr(pyTypeName(v)))
}

var fractional = regexp.MustCompile(`\.[0-9]+$`)

func pyTypeName(v any) string {
	switch v.(type) {
	case nil:
		return "NoneType"
	case bool:
		return "bool"
	case string:
		return "str"
	case []any:
		return "list"
	case map[string]any:
		return "dict"
	}
	return "int"
}
