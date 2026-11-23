package credplugins

import (
	"context"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
)

// TokenField is the input a lookup that logs in as the job is handed its
// token in (workload_identity.TOKEN_FIELD).
const TokenField = "workload_identity_token"

// kubernetesTokenFile is the service account token Kubernetes auth sends.
var kubernetesTokenFile = "/var/run/secrets/kubernetes.io/serviceaccount/token"

func vaultSession(env Env, kw Kwargs, o httpOpts) (*session, error) {
	o.cacert = kw.opt("cacert")
	s, err := newSession(env, o)
	if err != nil {
		return nil, err
	}
	if kw.truthy("namespace") {
		s.header.Set("X-Vault-Namespace", PyStr(kw["namespace"]))
	}
	return s, nil
}

// hashiHandleAuth is handle_auth: a stored token, or one a login method
// gives back.
func hashiHandleAuth(ctx context.Context, env Env, kw Kwargs) (string, error) {
	switch {
	case kw.truthy("token"):
		return PyStr(kw["token"]), nil
	case kw.truthy("username") && kw.truthy("password"):
		return methodAuth(ctx, env, kw, map[string]any{"username": kw["username"], "password": kw["password"]})
	case kw.truthy("role_id") && kw.truthy("secret_id"):
		return methodAuth(ctx, env, kw, map[string]any{"role_id": kw["role_id"], "secret_id": kw["secret_id"]})
	case kw.truthy("kubernetes_role"):
		b, err := os.ReadFile(kubernetesTokenFile)
		if err != nil {
			return "", exc("FileNotFoundError", "[Errno 2] No such file or directory: %s", pyRepr(kubernetesTokenFile))
		}
		return methodAuth(ctx, env, kw, map[string]any{"role": kw["kubernetes_role"], "jwt": strings.TrimRight(string(b), " \t\r\n\x0b\x0c")})
	case kw.truthy("client_cert_public") && kw.truthy("client_cert_private"):
		return methodAuth(ctx, env, kw, map[string]any{"name": kw["client_cert_role"]})
	}
	return "", exc("Exception", "Token, Username/Password, AppRole, Kubernetes, or TLS authentication parameters must be set")
}

// methodAuth is method_auth: log in at <url>/v1/auth/<path>/login.
func methodAuth(ctx context.Context, env Env, kw Kwargs, authParam map[string]any) (string, error) {
	authPath := kw.opt("auth_path")
	if authPath == "" {
		var err error
		if authPath, err = kw.need("default_auth_path"); err != nil {
			return "", err
		}
	}
	base, err := kw.need("url")
	if err != nil {
		return "", err
	}
	o := timeouts(30, 30)
	o.retries = 5
	if kw.truthy("client_cert_public") && kw.truthy("client_cert_private") {
		o.certPEM, o.keyPEM = PyStr(kw["client_cert_public"]), PyStr(kw["client_cert_private"])
	}
	s, err := vaultSession(env, kw, o)
	if err != nil {
		return "", err
	}
	reqURL := strings.TrimRight(strings.Join([]string{urljoin(base, "v1"), "auth", authPath, "login"}, "/"), "/")
	if truthy(authParam["username"]) {
		reqURL += "/" + PyStr(kw["username"])
	}
	resp, err := s.do(ctx, "POST", reqURL, nil, authParam)
	if err != nil {
		return "", err
	}
	if err := resp.raiseForStatus(); err != nil {
		return "", err
	}
	j, err := resp.json()
	if err != nil {
		return "", err
	}
	tok, err := dig(j, "auth", "client_token")
	if err != nil {
		return "", err
	}
	return PyStr(tok), nil
}

// vaultRetrying sends a request again while Vault answers 412, which an
// Enterprise performance standby gives until it has caught up.
func vaultRetrying(ctx context.Context, s *session, method, u string, body any) (*response, error) {
	var resp *response
	for retries := 0; retries < 5; {
		var err error
		if resp, err = s.do(ctx, method, u, nil, body); err != nil {
			return nil, err
		}
		if resp.status != http.StatusPreconditionFailed {
			break
		}
		retries++
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(time.Second):
		}
	}
	return resp, nil
}

func vaultTokenSession(env Env, kw Kwargs, token string) (*session, error) {
	o := timeouts(30, 30)
	o.retries = 5
	o.noRedirects = true
	s, err := vaultSession(env, kw, o)
	if err != nil {
		return nil, err
	}
	s.header.Set("Authorization", "Bearer "+token)
	// Compatibility header for older installs of Vault.
	s.header.Set("X-Vault-Token", token)
	return s, nil
}

// hashivaultKV is kv_backend.
func hashivaultKV(ctx context.Context, env Env, kw Kwargs) (any, error) {
	token, err := hashiHandleAuth(ctx, env, kw)
	if err != nil {
		return nil, err
	}
	base, err := kw.need("url")
	if err != nil {
		return nil, err
	}
	secretPath, err := kw.need("secret_path")
	if err != nil {
		return nil, err
	}
	apiVersion, err := kw.need("api_version")
	if err != nil {
		return nil, err
	}
	backend := kw.opt("secret_backend")
	s, err := vaultTokenSession(env, kw, token)
	if err != nil {
		return nil, err
	}
	var segs []string
	query := ""
	if apiVersion == "v2" {
		if kw.truthy("secret_version") {
			query = "?version=" + quotePlus(PyStr(kw["secret_version"]))
		}
		if backend != "" {
			segs = []string{backend, "data", secretPath}
		} else {
			// mount_point, *path = pathlib.Path(secret_path.lstrip('/')).parts
			parts := pathParts(strings.TrimLeft(secretPath, "/"))
			if len(parts) == 0 {
				segs = []string{secretPath, "data"}
			} else {
				segs = append([]string{parts[0], "data"}, parts[1:]...)
			}
		}
	} else if backend != "" {
		segs = []string{backend, secretPath}
	} else {
		segs = []string{secretPath}
	}
	reqURL := strings.TrimRight(urljoin(base, strings.Join(append([]string{"v1"}, segs...), "/")), "/") + query
	resp, err := vaultRetrying(ctx, s, "GET", reqURL, nil)
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
	if apiVersion == "v2" {
		if j, err = index(j, "data"); err != nil {
			return nil, err
		}
	}
	if !kw.truthy("secret_key") {
		return index(j, "data")
	}
	key := PyStr(kw["secret_key"])
	data, err := index(j, "data")
	if err != nil {
		if classOf(err) == "KeyError" {
			return nil, exc("RuntimeError", "%s is not present at %s", key, secretPath)
		}
		return nil, err
	}
	if m, ok := data.(map[string]any); ok {
		if _, has := m[key]; key != "data" && !has {
			if _, nested := m["data"]; nested {
				v, err := dig(m, "data", key)
				if err != nil && classOf(err) == "KeyError" {
					return nil, exc("RuntimeError", "%s is not present at %s", key, secretPath)
				}
				return v, err
			}
		}
	}
	v, err := index(data, key)
	if err != nil && classOf(err) == "KeyError" {
		return nil, exc("RuntimeError", "%s is not present at %s", key, secretPath)
	}
	return v, err
}

// pathParts is pathlib.PurePosixPath(p).parts for a relative path.
func pathParts(p string) []string {
	var out []string
	for _, s := range strings.Split(p, "/") {
		if s != "" && s != "." {
			out = append(out, s)
		}
	}
	return out
}

// hashivaultSSH is ssh_backend: sign the public key with a role.
func hashivaultSSH(ctx context.Context, env Env, kw Kwargs) (any, error) {
	token, err := hashiHandleAuth(ctx, env, kw)
	if err != nil {
		return nil, err
	}
	base, err := kw.need("url")
	if err != nil {
		return nil, err
	}
	secretPath, err := kw.need("secret_path")
	if err != nil {
		return nil, err
	}
	role, err := kw.need("role")
	if err != nil {
		return nil, err
	}
	pub, ok := kw["public_key"]
	if !ok {
		return nil, keyError("public_key")
	}
	body := map[string]any{"public_key": pub}
	if kw.truthy("valid_principals") {
		body["valid_principals"] = kw["valid_principals"]
	}
	s, err := vaultTokenSession(env, kw, token)
	if err != nil {
		return nil, err
	}
	reqURL := strings.TrimRight(strings.Join([]string{urljoin(base, "v1"), secretPath, "sign", role}, "/"), "/")
	resp, err := vaultRetrying(ctx, s, "POST", reqURL, body)
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
	return dig(j, "data", "signed_key")
}

// withWorkloadIdentityLogin logs in to Vault's jwt auth method with the
// token the platform signed for the job, runs backend with the Vault token
// that comes back, and revokes that token afterwards.
func withWorkloadIdentityLogin(backend Backend) Backend {
	return func(ctx context.Context, env Env, kw Kwargs) (any, error) {
		if !kw.truthy(TokenField) {
			return nil, exc("ValueError", "No workload identity token was issued for this lookup")
		}
		// The form fills the default in; a credential made through the
		// API or a collection only has what was sent.
		if !kw.truthy("default_auth_path") {
			kw = kw.with("default_auth_path", "jwt")
		}
		token, err := methodAuth(ctx, env, kw, map[string]any{"role": kw["jwt_role"], "jwt": kw[TokenField]})
		if err != nil {
			if he, ok := err.(*HTTPError); ok {
				// Vault says why it turned the job down; keep that
				// rather than a bare 400.
				reason := ""
				if j, jerr := decodeJSON(he.body); jerr == nil {
					if m, ok := j.(map[string]any); ok {
						if list, ok := m["errors"].([]any); ok {
							parts := make([]string, len(list))
							for i, e := range list {
								parts[i] = PyStr(e)
							}
							reason = strings.Join(parts, "; ")
						}
					}
				}
				msg := "Vault turned down the workload identity login with role " + PyStr(kw["jwt_role"]) + ": HTTP " + strconv.Itoa(he.StatusCode)
				if reason != "" {
					msg += ", " + reason
				}
				return nil, &HTTPError{StatusCode: he.StatusCode, Msg: msg, body: he.body}
			}
			return nil, err
		}
		defer revokeSelf(env, kw, token)
		return backend(ctx, env, kw.with("token", token))
	}
}

// revokeSelf gives the Vault token back as soon as the lookup is done with
// it. Best effort: a batch token cannot be revoked and runs out on its own.
func revokeSelf(env Env, kw Kwargs, token string) {
	base, err := kw.need("url")
	if err != nil {
		return
	}
	s, err := vaultSession(env, kw, timeouts(30, 30))
	if err != nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	_, _ = s.do(ctx, "POST", urljoin(base, "v1/auth/token/revoke-self"), http.Header{"X-Vault-Token": {token}}, nil)
}
