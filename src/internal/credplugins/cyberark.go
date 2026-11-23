package credplugins

import (
	"context"
	"encoding/base64"
	"fmt"
	"net/http"
	"net/url"
	"strings"
)

// aimBackend is aim_backend: CyberArk Central Credential Provider.
func aimBackend(ctx context.Context, env Env, kw Kwargs) (any, error) {
	base, err := kw.need("url")
	if err != nil {
		return nil, err
	}
	verify, ok := kw["verify"]
	if !ok {
		return nil, keyError("verify")
	}
	webserviceID := kw.get("webservice_id", "")
	appID, err := kw.need("app_id")
	if err != nil {
		return nil, err
	}
	query, err := kw.need("object_query")
	if err != nil {
		return nil, err
	}
	format, err := kw.need("object_query_format")
	if err != nil {
		return nil, err
	}
	property := kw.get("object_property", "")
	if webserviceID == "" {
		webserviceID = "AIMWebService"
	}
	qs := "?AppId=" + quote(appID, "") + "&Query=" + quote(query, "") + "&QueryFormat=" + quote(format, "")
	if kw.truthy("reason") {
		qs += "&reason=" + quote(PyStr(kw["reason"]), "")
	}
	reqURL := urljoin(base, strings.Join([]string{webserviceID, "api", "Accounts"}, "/"))
	o := timeouts(30, 30)
	o.noRedirects = true
	if b, isBool := verify.(bool); isBool && !b {
		o.insecure = true
	}
	if kw.truthy("client_cert") {
		o.certPEM = PyStr(kw["client_cert"])
		o.keyPEM = kw.opt("client_key")
	}
	s, err := newSession(env, o)
	if err != nil {
		return nil, err
	}
	resp, err := s.do(ctx, "GET", reqURL+qs, nil, nil)
	if err != nil {
		return nil, err
	}
	if err := resp.pluginRaiseForStatus(); err != nil {
		return nil, err
	}
	// CCP capitalizes the property names; the user name is camel case.
	switch {
	case property == "":
		property = "Content"
	case strings.ToLower(property) == "username":
		property = "UserName"
	case strings.ToLower(property) == "password":
		property = "Content"
	case strings.ToLower(property) == "address":
		property = "Address"
	default:
		return nil, exc("KeyError", "'Property %s not found in object, available properties: Username, Password and Address'", property)
	}
	j, err := resp.json()
	if err != nil {
		return nil, err
	}
	return index(j, property)
}

// isBase64 is conjur's _is_base64: the text decodes and encodes back to
// itself.
func isBase64(s string) bool {
	b, err := base64.StdEncoding.DecodeString(s)
	return err == nil && base64.StdEncoding.EncodeToString(b) == s
}

// conjurBackend is conjur_backend: CyberArk Conjur, self-hosted or cloud.
func conjurBackend(ctx context.Context, env Env, kw Kwargs) (any, error) {
	base, err := kw.need("url")
	if err != nil {
		return nil, err
	}
	apiKey, err := kw.need("api_key")
	if err != nil {
		return nil, err
	}
	account, err := kw.need("account")
	if err != nil {
		return nil, err
	}
	username, err := kw.need("username")
	if err != nil {
		return nil, err
	}
	secretPath, err := kw.need("secret_path")
	if err != nil {
		return nil, err
	}
	account, username, secretPath = quote(account, ""), quote(username, ""), quote(secretPath, "")
	s, err := newSession(env, httpOpts{cacert: kw.opt("cacert"), noRedirects: true})
	if err != nil {
		return nil, err
	}
	authHeader := http.Header{"Content-Type": {"text/plain"}, "Accept-Encoding": {"base64"}}
	resp, err := s.do(ctx, "POST", urljoin(base, strings.Join([]string{"authn", account, username, "authenticate"}, "/")), authHeader, apiKey)
	if err != nil {
		return nil, err
	}
	if resp.raiseForStatus() != nil {
		// Conjur Cloud serves the API under /api.
		if resp, err = s.do(ctx, "POST", urljoin(base, strings.Join([]string{"api", "authn", account, username, "authenticate"}, "/")), authHeader, apiKey); err != nil {
			return nil, err
		}
	}
	if err := resp.pluginRaiseForStatus(); err != nil {
		return nil, err
	}
	token := string(resp.body)
	if !isBase64(token) {
		token = base64.StdEncoding.EncodeToString(resp.body)
	}
	path := urljoin(base, strings.Join([]string{"secrets", account, "variable", secretPath}, "/"))
	cloudPath := urljoin(base, strings.Join([]string{"api", "secrets", account, "variable", secretPath}, "/"))
	if kw.truthy("secret_version") {
		v := "version=" + PyStr(kw["secret_version"])
		path, cloudPath = path+"?"+v, cloudPath+"?"+v
	}
	ls, err := newSession(env, httpOpts{cacert: kw.opt("cacert"), noRedirects: true, connectTimeout: secs(30), readTimeout: secs(30)})
	if err != nil {
		return nil, err
	}
	lookupHeader := http.Header{"Authorization": {`Token token="` + token + `"`}}
	if resp, err = ls.do(ctx, "GET", path, lookupHeader, nil); err != nil {
		return nil, err
	}
	if resp.raiseForStatus() != nil {
		if resp, err = ls.do(ctx, "GET", cloudPath, lookupHeader, nil); err != nil {
			return nil, err
		}
	}
	if err := resp.pluginRaiseForStatus(); err != nil {
		return nil, err
	}
	return resp.text(), nil
}

// centrifyBackend is centrify_backend: Centrify Vault (PAS).
func centrifyBackend(ctx context.Context, env Env, kw Kwargs) (any, error) {
	base := kw.get("url", "None")
	accName := kw.get("account-name", "None")
	systemName := kw.get("system-name", "None")
	clientID := kw.get("client_id", "None")
	clientPassword := kw.get("client_password", "None")
	appID := kw.get("oauth_application_id", "awx")
	scope := kw.get("oauth_scope", "awx")
	s, err := newSession(env, timeouts(5, 30))
	if err != nil {
		return nil, err
	}
	// handle_auth: a bearer token for the client.
	auth := "Basic " + base64.StdEncoding.EncodeToString([]byte(clientID+":"+clientPassword))
	resp, err := s.do(ctx, "POST", urljoin(base, "/oauth2/token/"+appID), http.Header{"Authorization": {auth}}, url.Values{"grant_type": {"client_credentials"}, "scope": {scope}})
	if err != nil {
		return nil, err
	}
	if err := resp.pluginRaiseForStatus(); err != nil {
		return nil, err
	}
	j, err := resp.json()
	if err != nil {
		return nil, err
	}
	tok, err := index(j, "access_token")
	if err != nil {
		if classOf(err) == "KeyError" {
			return nil, exc("RuntimeError", "OAuth request to tenant was unsuccessful")
		}
		return nil, err
	}
	headers := http.Header{"Authorization": {"Bearer " + PyStr(tok)}, "X-Centrify-Native-Client": {"true"}}
	// get_ID: the account's ID by a RedRock query.
	q := fmt.Sprintf("Select ID from VaultAccount where  Name='%s' and User='%s'", systemName, accName)
	if resp, err = s.do(ctx, "POST", urljoin(base, "/Redrock/query"), headers, map[string]any{"Script": q}); err != nil {
		return nil, err
	}
	if err := resp.pluginRaiseForStatus(); err != nil {
		return nil, err
	}
	if j, err = resp.json(); err != nil {
		return nil, err
	}
	accID, err := dig(j, "Result", "Results", 0, "Row", "ID")
	if err != nil {
		if c := classOf(err); c == "KeyError" || c == "IndexError" {
			return nil, exc("RuntimeError", "Error Detected!! Check the Inputs")
		}
		return nil, err
	}
	// get_passwd: check the password out.
	if resp, err = s.do(ctx, "POST", urljoin(base, "/ServerManage/CheckoutPassword"), headers, map[string]any{"ID": accID}); err != nil {
		return nil, err
	}
	if err := resp.pluginRaiseForStatus(); err != nil {
		return nil, err
	}
	if j, err = resp.json(); err != nil {
		return nil, err
	}
	pw, err := dig(j, "Result", "Password")
	if err != nil && classOf(err) == "KeyError" {
		return nil, exc("RuntimeError", "Password Not Found")
	}
	return pw, err
}
