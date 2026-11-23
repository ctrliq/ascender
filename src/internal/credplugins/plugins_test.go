package credplugins

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/rsa"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"io"
	"math/big"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/ctrliq/ascender/internal/netguard"
)

// Expected values were produced by Python's urllib.parse.
func TestURLJoin(t *testing.T) {
	for _, c := range [][3]string{
		{"http://h:8200", "v1", "http://h:8200/v1"},
		{"http://h:8200/", "v1", "http://h:8200/v1"},
		{"http://h:8200/vault", "v1", "http://h:8200/v1"},
		{"http://h:8200/vault/", "v1", "http://h:8200/vault/v1"},
		{"http://h:8200", "v1/secret//zz", "http://h:8200/v1/secret/zz"},
		{"http://h:8200/", "v1/secret/data/a/b", "http://h:8200/v1/secret/data/a/b"},
		{"https://h/x/y/", "v1/kv/../z", "https://h/x/y/v1/z"},
		{"http://h:8200/", "v1/secret/", "http://h:8200/v1/secret/"},
		{"https://ccp/", "AIMWebService/api/Accounts", "https://ccp/AIMWebService/api/Accounts"},
		{"https://ccp", "/Redrock/query", "https://ccp/Redrock/query"},
		{"https://ccp/a/b", "/oauth2/token/awx", "https://ccp/oauth2/token/awx"},
		{"http://h", "v1/./x/.", "http://h/v1/x/"},
		{"http://h/a?q=1", "", "http://h/a?q=1"},
		{"http://h/a?q=1", "b", "http://h/b"},
		{"http://h", "//other/x", "http://other/x"},
		{"http://h", "https://o/p", "https://o/p"},
		{"vault:8200", "v1", "v1"},
		{"http://h/a/", "authn/acc%2F/u/authenticate", "http://h/a/authn/acc%2F/u/authenticate"},
		{"http://h", "v1/a b", "http://h/v1/a b"},
		{"http://h", "v1/x?y=1#f", "http://h/v1/x?y=1#f"},
	} {
		if got := urljoin(c[0], c[1]); got != c[2] {
			t.Errorf("urljoin(%q, %q) = %q, want %q", c[0], c[1], got, c[2])
		}
	}
	for _, c := range [][3]string{{"a b/c", "", "a%20b%2Fc"}, {"a b/c", "/", "a%20b/c"}, {"é~_.-", "", "%C3%A9~_.-"}, {"x=1&y", "", "x%3D1%26y"}} {
		if got := quote(c[0], c[1]); got != c[2] {
			t.Errorf("quote(%q, %q) = %q, want %q", c[0], c[1], got, c[2])
		}
	}
	for _, c := range [][2]string{{"http://h/a b", "http://h/a%20b"}, {"http://h/a%2Fb", "http://h/a%2Fb"}, {"http://h/%7Euser", "http://h/~user"},
		{"http://h/%zz", "http://h/%25zz"}, {"http://h/é", "http://h/%C3%A9"}} {
		if got := requoteURI(c[0]); got != c[1] {
			t.Errorf("requoteURI(%q) = %q, want %q", c[0], got, c[1])
		}
	}
}

func TestPrepareURL(t *testing.T) {
	for raw, class := range map[string]string{"vault.example.com": "MissingSchema", "vault:8200": "InvalidSchema", "http://": "InvalidURL", "ftp://h/x": "InvalidSchema"} {
		if _, err := prepareURL(raw); classOf(err) != class {
			t.Errorf("prepareURL(%q) = %v, want %s", raw, err, class)
		}
	}
}

func lookup(t *testing.T, ns string, env Env, kw Kwargs) (any, error) {
	t.Helper()
	return Lookup(context.Background(), ns, env, kw)
}

func wantValue(t *testing.T, name string, got any, err error, want any) {
	t.Helper()
	if err != nil || got != want {
		t.Errorf("%s: got %#v, %v; want %#v", name, got, err, want)
	}
}

func wantClass(t *testing.T, name string, err error, class string) {
	t.Helper()
	if classOf(err) != class {
		t.Errorf("%s: got %v (%s), want %s", name, err, classOf(err), class)
	}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func TestHashivault(t *testing.T) {
	var revoked, preconditions atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tok := r.Header.Get("X-Vault-Token")
		switch {
		case r.URL.Path == "/v1/auth/approle/login":
			var b map[string]string
			_ = json.NewDecoder(r.Body).Decode(&b)
			if b["role_id"] != "rid" || b["secret_id"] != "sid" {
				writeJSON(w, 400, map[string]any{"errors": []string{"invalid role or secret ID"}})
				return
			}
			writeJSON(w, 200, map[string]any{"auth": map[string]any{"client_token": "approle-token"}})
		case r.URL.Path == "/v1/auth/userpass/login/bob":
			writeJSON(w, 200, map[string]any{"auth": map[string]any{"client_token": "userpass-token"}})
		case r.URL.Path == "/v1/auth/jwt/login":
			var b map[string]string
			_ = json.NewDecoder(r.Body).Decode(&b)
			if b["role"] != "ascender" || b["jwt"] != "signed.jwt.token" {
				writeJSON(w, 400, map[string]any{"errors": []string{`error validating claims: claim "ascender_job_template_id" does not match any associated bound claim values`}})
				return
			}
			writeJSON(w, 200, map[string]any{"auth": map[string]any{"client_token": "jwt-token"}})
		case r.URL.Path == "/v1/auth/token/revoke-self":
			revoked.Add(1)
			w.WriteHeader(204)
		case tok == "":
			writeJSON(w, 403, map[string]any{"errors": []string{"permission denied"}})
		case r.URL.Path == "/v1/secret/data/team/app" && r.Method == "GET":
			if r.URL.Query().Get("version") != "" && r.URL.Query().Get("version") != "2" {
				writeJSON(w, 404, map[string]any{})
				return
			}
			writeJSON(w, 200, map[string]any{"data": map[string]any{"data": map[string]any{"password": "s3cret", "port": 5432}, "metadata": map[string]any{}}})
		case r.URL.Path == "/v1/kv1/legacy":
			writeJSON(w, 200, map[string]any{"data": map[string]any{"password": "old"}})
		case r.URL.Path == "/v1/kv1/flaky":
			if preconditions.Add(1) == 1 {
				w.WriteHeader(412)
				return
			}
			writeJSON(w, 200, map[string]any{"data": map[string]any{"password": "eventually"}})
		case r.URL.Path == "/v1/ssh-client-signer/sign/admins" && r.Method == "POST":
			var b map[string]string
			_ = json.NewDecoder(r.Body).Decode(&b)
			writeJSON(w, 200, map[string]any{"data": map[string]any{"signed_key": "ssh-rsa-cert-v01 " + b["public_key"] + " " + b["valid_principals"]}})
		default:
			writeJSON(w, 404, map[string]any{"errors": []string{}})
		}
	}))
	defer srv.Close()
	env := Env{}
	kv := Kwargs{"url": srv.URL, "token": "root", "api_version": "v2", "secret_backend": "secret", "secret_path": "team/app", "secret_key": "password"}
	v, err := lookup(t, "hashivault_kv", env, kv)
	wantValue(t, "kv v2", v, err, "s3cret")
	v, err = lookup(t, "hashivault_kv", env, kv.with("secret_backend", "").with("secret_path", "/secret/team/app").with("secret_key", "port").with("secret_version", "2"))
	if err != nil || PyStr(v) != "5432" {
		t.Errorf("kv v2 from the path with a version: %#v, %v", v, err)
	}
	_, err = lookup(t, "hashivault_kv", env, kv.with("secret_key", "nope"))
	wantClass(t, "missing key", err, "RuntimeError")
	_, err = lookup(t, "hashivault_kv", env, kv.with("token", "").with("role_id", "rid").with("secret_id", "bad").with("default_auth_path", "approle"))
	if he, ok := err.(*HTTPError); !ok || he.StatusCode != 400 || TestMessage(err, false) != "HTTP 400" {
		t.Errorf("approle refused: %v", err)
	}
	v, err = lookup(t, "hashivault_kv", env, kv.with("token", "").with("role_id", "rid").with("secret_id", "sid").with("default_auth_path", "approle"))
	wantValue(t, "approle", v, err, "s3cret")
	_, err = lookup(t, "hashivault_kv", env, kv.with("token", "").with("username", "bob").with("password", "pw"))
	wantClass(t, "userpass without default_auth_path", err, "KeyError")
	v, err = lookup(t, "hashivault_kv", env, kv.with("token", "").with("username", "bob").with("password", "pw").with("auth_path", "userpass"))
	wantValue(t, "userpass", v, err, "s3cret")
	_, err = lookup(t, "hashivault_kv", env, kv.with("token", ""))
	wantClass(t, "no auth", err, "Exception")
	v, err = lookup(t, "hashivault_kv", env, Kwargs{"url": srv.URL + "/", "token": "t", "api_version": "v1", "secret_backend": "kv1", "secret_path": "legacy", "secret_key": "password"})
	wantValue(t, "kv v1", v, err, "old")
	v, err = lookup(t, "hashivault_kv", env, Kwargs{"url": srv.URL, "token": "t", "api_version": "v1", "secret_path": "kv1/flaky", "secret_key": "password"})
	wantValue(t, "412 retried", v, err, "eventually")
	_, err = lookup(t, "hashivault_kv", env, Kwargs{"url": srv.URL, "api_version": "v1", "secret_path": "kv1/legacy", "secret_key": "password", "token": "t", "cacert": "not a pem"})
	wantClass(t, "bad cacert", err, "SSLError")
	v, err = lookup(t, "hashivault_ssh", env, Kwargs{"url": srv.URL, "token": "t", "secret_path": "ssh-client-signer", "role": "admins", "public_key": "AAAA", "valid_principals": "root"})
	wantValue(t, "ssh", v, err, "ssh-rsa-cert-v01 AAAA root")

	oidc := Kwargs{"url": srv.URL, "api_version": "v2", "jwt_role": "ascender", TokenField: "signed.jwt.token", "secret_backend": "secret", "secret_path": "team/app", "secret_key": "password"}
	v, err = lookup(t, "hashivault_kv_oidc", env, oidc)
	wantValue(t, "oidc", v, err, "s3cret")
	if revoked.Load() != 1 {
		t.Errorf("oidc token revoked %d times", revoked.Load())
	}
	_, err = lookup(t, "hashivault_kv_oidc", env, oidc.with(TokenField, "other"))
	if msg := TestMessage(err, true); msg != `Vault turned down the workload identity login with role ascender: HTTP 400, error validating claims: claim "ascender_job_template_id" does not match any associated bound claim values` {
		t.Errorf("oidc refusal message: %q", msg)
	}
	_, err = lookup(t, "hashivault_kv_oidc", env, oidc.with(TokenField, ""))
	wantClass(t, "oidc without a token", err, "ValueError")

	_, err = lookup(t, "hashivault_kv", env, kv.with("url", "http://127.0.0.1:1"))
	wantClass(t, "refused", err, "ConnectionError")
	_, err = lookup(t, "hashivault_kv", env, kv.with("url", "http://127.0.0.1:1").with("token", "").with("role_id", "r").with("secret_id", "s").with("default_auth_path", "approle"))
	wantClass(t, "connection refused", err, "ConnectionError")
	_, err = lookup(t, "hashivault_kv", env, kv.with("url", "vault.example.com"))
	wantClass(t, "missing schema", err, "MissingSchema")
}

func TestCyberArkAndCentrify(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.EscapedPath() {
		case "/AIMWebService/api/Accounts":
			q := r.URL.Query()
			if q.Get("AppId") != "app 1" || q.Get("Query") != "Safe=s;Object=o" || q.Get("QueryFormat") != "Exact" {
				writeJSON(w, 403, map[string]any{"ErrorMsg": "denied"})
				return
			}
			writeJSON(w, 200, map[string]any{"Content": "ccp-pass", "UserName": "ccp-user", "Address": "10.0.0.1"})
		case "/authn/acct/host%2Fapp/authenticate":
			w.WriteHeader(404)
		case "/api/authn/acct/host%2Fapp/authenticate":
			b, _ := io.ReadAll(r.Body)
			if string(b) != "the-key" {
				w.WriteHeader(401)
				return
			}
			_, _ = w.Write([]byte(`{"protected":"x"}`))
		case "/secrets/acct/variable/prod%2Fdb%2Fpassword", "/api/secrets/acct/variable/prod%2Fdb%2Fpassword":
			want := `Token token="` + base64.StdEncoding.EncodeToString([]byte(`{"protected":"x"}`)) + `"`
			if r.Header.Get("Authorization") != want {
				w.WriteHeader(401)
				return
			}
			if strings.HasPrefix(r.URL.EscapedPath(), "/secrets/") {
				w.WriteHeader(404)
				return
			}
			_, _ = w.Write([]byte("conjur-secret"))
		case "/oauth2/token/awx":
			id, pw, _ := r.BasicAuth()
			if id != "cid" || pw != "cpw" || r.FormValue("scope") != "awx" {
				w.WriteHeader(401)
				return
			}
			writeJSON(w, 200, map[string]any{"access_token": "pas-token"})
		case "/Redrock/query":
			var b map[string]string
			_ = json.NewDecoder(r.Body).Decode(&b)
			if b["Script"] != "Select ID from VaultAccount where  Name='sys1' and User='acct1'" {
				writeJSON(w, 200, map[string]any{"Result": map[string]any{"Results": []any{}}})
				return
			}
			writeJSON(w, 200, map[string]any{"Result": map[string]any{"Results": []any{map[string]any{"Row": map[string]any{"ID": "acc-42"}}}}})
		case "/ServerManage/CheckoutPassword":
			writeJSON(w, 200, map[string]any{"Result": map[string]any{"Password": "pas-secret"}})
		default:
			w.WriteHeader(404)
		}
	}))
	defer srv.Close()
	env := Env{}
	aim := Kwargs{"url": srv.URL, "app_id": "app 1", "object_query": "Safe=s;Object=o", "object_query_format": "Exact", "verify": true}
	v, err := lookup(t, "aim", env, aim)
	wantValue(t, "aim content", v, err, "ccp-pass")
	v, err = lookup(t, "aim", env, aim.with("object_property", "username"))
	wantValue(t, "aim username", v, err, "ccp-user")
	_, err = lookup(t, "aim", env, aim.with("object_property", "other"))
	wantClass(t, "aim other property", err, "KeyError")
	_, err = lookup(t, "aim", env, aim.with("app_id", "x"))
	if TestMessage(err, false) != "HTTP 403" {
		t.Errorf("aim refused: %v", err)
	}
	v, err = lookup(t, "conjur", env, Kwargs{"url": srv.URL, "api_key": "the-key", "account": "acct", "username": "host/app", "secret_path": "prod/db/password"})
	wantValue(t, "conjur cloud", v, err, "conjur-secret")
	v, err = lookup(t, "centrify_vault_kv", env, Kwargs{"url": srv.URL, "client_id": "cid", "client_password": "cpw", "account-name": "acct1", "system-name": "sys1"})
	wantValue(t, "centrify", v, err, "pas-secret")
	_, err = lookup(t, "centrify_vault_kv", env, Kwargs{"url": srv.URL, "client_id": "cid", "client_password": "cpw", "account-name": "x", "system-name": "y"})
	wantClass(t, "centrify no account", err, "RuntimeError")
}

func TestDelinea(t *testing.T) {
	platform := false
	var srvURL string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v1/token":
			var b map[string]string
			_ = json.NewDecoder(r.Body).Decode(&b)
			if b["client_secret"] != "dsv-secret" {
				writeJSON(w, 401, map[string]any{"message": "unable to authenticate"})
				return
			}
			writeJSON(w, 200, map[string]any{"accessToken": "dsv-token", "expiresIn": 3600})
		case "/v1/secrets/apps/db":
			writeJSON(w, 200, map[string]any{"data": map[string]any{"password": "dsv-pass", "file": base64.StdEncoding.EncodeToString([]byte("decoded!"))}})
		case "/api/v1/healthcheck":
			if platform {
				w.WriteHeader(404)
				return
			}
			writeJSON(w, 200, map[string]any{"Healthy": true})
		case "/health":
			_, _ = w.Write([]byte("healthy"))
		case "/oauth2/token":
			if r.FormValue("grant_type") != "password" || r.FormValue("username") != "u" || r.FormValue("domain") != "CORP" {
				writeJSON(w, 400, map[string]any{"error": "invalid_grant"})
				return
			}
			writeJSON(w, 200, map[string]any{"access_token": "tss-token", "expires_in": 1200})
		case "/identity/api/oauth2/token/xpmplatform":
			if r.FormValue("scope") != "xpmheadless" || r.FormValue("client_id") != "u" {
				writeJSON(w, 400, map[string]any{"error": "invalid_client"})
				return
			}
			writeJSON(w, 200, map[string]any{"access_token": "platform-token", "expires_in": 1200})
		case "/vaultbroker/api/vaults":
			writeJSON(w, 200, map[string]any{"vaults": []any{map[string]any{"isDefault": true, "isActive": true, "connection": map[string]any{"url": srvURL + "/ss/"}}}})
		case "/api/v1/secrets/7", "/ss/api/v1/secrets/7":
			writeJSON(w, 200, map[string]any{"id": 7, "lastHeartBeatCheck": "2024-01-02T03:04:05.123", "items": []any{
				map[string]any{"slug": "password", "itemValue": "tss-pass", "fileAttachmentId": nil},
				map[string]any{"slug": "key", "itemValue": "*** Not Valid For Display ***", "fileAttachmentId": 9},
			}})
		case "/api/v1/secrets/7/fields/key", "/ss/api/v1/secrets/7/fields/key":
			_, _ = w.Write([]byte("-----BEGIN KEY-----"))
		default:
			w.WriteHeader(404)
		}
	}))
	defer srv.Close()
	srvURL = srv.URL
	env := Env{}
	// https://{tenant}.secretsvaultcloud.{tld}, pointed at the test server.
	dsv := Kwargs{"tenant": "", "tld": "", "url_template": "http://{}" + strings.TrimPrefix(srv.URL, "http://") + "{}", "client_id": "c", "client_secret": "dsv-secret",
		"path": "/apps/db", "secret_field": "password"}
	v, err := lookup(t, "thycotic_dsv", env, dsv)
	wantValue(t, "dsv", v, err, "dsv-pass")
	v, err = lookup(t, "thycotic_dsv", env, dsv.with("secret_field", "file").with("secret_decoding", "Decode Base64"))
	wantValue(t, "dsv base64", v, err, "decoded!")
	_, err = lookup(t, "thycotic_dsv", env, dsv.with("client_secret", "bad"))
	wantClass(t, "dsv refused", err, "SecretsVaultAccessError")

	tss := Kwargs{"server_url": srv.URL + "/", "username": "u", "password": "p", "domain": "CORP", "secret_id": "7", "secret_field": "password"}
	v, err = lookup(t, "thycotic_tss", env, tss)
	wantValue(t, "tss", v, err, "tss-pass")
	v, err = lookup(t, "thycotic_tss", env, tss.with("secret_field", "key"))
	wantValue(t, "tss attachment", v, err, "-----BEGIN KEY-----")
	_, err = lookup(t, "thycotic_tss", env, tss.with("domain", ""))
	wantClass(t, "tss refused", err, "SecretServerClientError")
	platform = true
	v, err = lookup(t, "thycotic_tss", env, tss)
	wantValue(t, "tss platform", v, err, "tss-pass")
}

func TestGitHubApp(t *testing.T) {
	key, _ := rsa.GenerateKey(rand.Reader, 2048)
	pemKey := string(pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(key)}))
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		auth := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		parts := strings.Split(auth, ".")
		if len(parts) != 3 {
			w.WriteHeader(401)
			return
		}
		body, _ := base64.RawURLEncoding.DecodeString(parts[1])
		var claims map[string]any
		_ = json.Unmarshal(body, &claims)
		if claims["iss"] != "1121547" || r.URL.Path != "/api/v3/app/installations/59980338/access_tokens" {
			writeJSON(w, 404, map[string]any{"message": "Not Found", "documentation_url": "https://docs.github.com/rest"})
			return
		}
		writeJSON(w, 201, map[string]any{"token": "ghs_installation", "expires_at": "2030-01-01T00:00:00Z"})
	}))
	defer srv.Close()
	kw := Kwargs{"github_api_url": srv.URL + "/api/v3", "app_or_client_id": "1121547", "install_id": "59980338", "private_rsa_key": pemKey}
	v, err := lookup(t, "github_app_lookup", Env{}, kw)
	wantValue(t, "github", v, err, "ghs_installation")
	_, err = lookup(t, "github_app_lookup", Env{}, kw.with("install_id", "1"))
	wantClass(t, "github not installed", err, "ValueError")
	// Only GitHub's message comes back, not the rest of the body.
	if err != nil && (!strings.Contains(err.Error(), `404 {"message": "Not Found"}`) || strings.Contains(err.Error(), "documentation_url")) {
		t.Errorf("github 404 detail: %v", err)
	}
	_, err = lookup(t, "github_app_lookup", Env{}, kw.with("install_id", "abc"))
	wantClass(t, "github bad install id", err, "ValueError")
}

func TestAWSSecretsManager(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Amz-Target") != "secretsmanager.GetSecretValue" || !strings.HasPrefix(r.Header.Get("Authorization"), "AWS4-HMAC-SHA256 Credential=AKIDZZ/") ||
			!strings.Contains(r.Header.Get("Authorization"), "/us-east-1/secretsmanager/aws4_request, SignedHeaders=content-type;host;x-amz-date;x-amz-target, Signature=") {
			writeJSON(w, 403, map[string]any{"__type": "InvalidSignatureException", "message": "bad"})
			return
		}
		var b map[string]string
		_ = json.NewDecoder(r.Body).Decode(&b)
		switch b["SecretId"] {
		case "zz/db":
			writeJSON(w, 200, map[string]any{"Name": "zz/db", "SecretString": `{"password":"aws-pass"}`})
		case "zz/bin":
			writeJSON(w, 200, map[string]any{"Name": "zz/bin", "SecretBinary": base64.StdEncoding.EncodeToString([]byte("raw"))})
		default:
			writeJSON(w, 400, map[string]any{"__type": "com.amazonaws.secretsmanager#ResourceNotFoundException", "Message": "Secrets Manager can't find the specified secret."})
		}
	}))
	defer srv.Close()
	env := Env{TaskEnv: map[string]string{"AWS_ENDPOINT_URL": srv.URL, "AWS_ACCESS_KEY_ID": "AKIDZZ", "AWS_SECRET_ACCESS_KEY": "envsecret"}}
	kw := Kwargs{"aws_access_key": "AKIDZZ", "aws_secret_key": "sk", "region_name": "us-east-1", "secret_name": "zz/db"}
	v, err := lookup(t, "aws_secretsmanager_credential", env, kw)
	wantValue(t, "aws", v, err, `{"password":"aws-pass"}`)
	v, err = lookup(t, "aws_secretsmanager_credential", env, kw.with("secret_name", "zz/bin"))
	wantValue(t, "aws binary", v, err, "raw")
	_, err = lookup(t, "aws_secretsmanager_credential", env, kw.with("secret_name", "nope"))
	wantClass(t, "aws not found", err, "ClientError")
	_, err = lookup(t, "aws_secretsmanager_credential", env, kw.with("aws_secret_key", ""))
	wantClass(t, "aws partial", err, "PartialCredentialsError")
	_, err = lookup(t, "aws_secretsmanager_credential", env, kw.with("aws_secret_key", "").with("aws_access_key", ""))
	wantClass(t, "aws default refused", err, "DefaultCredentialsNotAllowed")
	env.AllowAWSDefaultCredentials = true
	v, err = lookup(t, "aws_secretsmanager_credential", env, kw.with("aws_secret_key", "").with("aws_access_key", ""))
	wantValue(t, "aws default from env", v, err, `{"password":"aws-pass"}`)
	_, err = lookup(t, "aws_secretsmanager_credential", env, kw.with("aws_secret_key", "").with("aws_access_key", "").with("secret_name", "nope"))
	if err == nil || err.Error() != "DefaultCredentialsLookupError: AWS Secrets Manager lookup with the controller's AWS identity failed: ResourceNotFoundException from GetSecretValue" {
		t.Errorf("aws default failure: %v", err)
	}
	_, err = lookup(t, "aws_secretsmanager_credential", env, kw.with("region_name", "us east"))
	wantClass(t, "aws region", err, "InvalidRegionError")
}

func TestAzureKeyVault(t *testing.T) {
	var tokens atomic.Int32
	srv := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Host == "login.microsoftonline.com" && r.URL.Path == "/tid-1/v2.0/.well-known/openid-configuration":
			writeJSON(w, 200, map[string]any{"token_endpoint": "https://login.microsoftonline.com/tid-1/oauth2/v2.0/token"})
		case r.Host == "login.microsoftonline.com" && r.URL.Path == "/tid-1/oauth2/v2.0/token":
			if r.FormValue("client_secret") != "app-secret" || r.FormValue("scope") != "https://vault.azure.net/.default" {
				writeJSON(w, 401, map[string]any{"error": "invalid_client", "error_description": "AADSTS7000215: Invalid client secret provided."})
				return
			}
			tokens.Add(1)
			writeJSON(w, 200, map[string]any{"access_token": "kv-token", "token_type": "Bearer", "expires_in": 3600})
		case r.Host == "zz.vault.azure.net":
			if r.URL.Query().Get("api-version") != azureKeyVaultAPIVersion {
				writeJSON(w, 400, map[string]any{})
				return
			}
			if r.Header.Get("Authorization") != "Bearer kv-token" {
				w.Header().Set("WWW-Authenticate", `Bearer authorization="https://login.microsoftonline.com/tid-1", resource="https://vault.azure.net"`)
				w.WriteHeader(401)
				return
			}
			if r.URL.EscapedPath() != "/secrets/db-password/" {
				writeJSON(w, 404, map[string]any{"error": map[string]any{"code": "SecretNotFound", "message": "A secret with (name/id) x was not found in this key vault."}})
				return
			}
			writeJSON(w, 200, map[string]any{"value": "kv-secret", "id": "https://zz.vault.azure.net/secrets/db-password/abc"})
		default:
			w.WriteHeader(418)
		}
	}))
	cert, pool := testCertificate(t, "zz.vault.azure.net", "login.microsoftonline.com")
	srv.TLS = &tls.Config{Certificates: []tls.Certificate{cert}}
	srv.StartTLS()
	defer srv.Close()
	addr := srv.Listener.Addr().String()
	testDial = func(ctx context.Context, network, _ string) (net.Conn, error) {
		return (&net.Dialer{}).DialContext(ctx, network, addr)
	}
	testRootCAs = pool
	defer func() { testDial, testRootCAs = nil, nil }()
	kw := Kwargs{"url": "https://zz.vault.azure.net/", "client": "cid", "secret": "app-secret", "tenant": "tid-1", "secret_field": "db-password"}
	v, err := lookup(t, "azure_kv", Env{}, kw)
	wantValue(t, "azure", v, err, "kv-secret")
	_, err = lookup(t, "azure_kv", Env{}, kw.with("secret_field", "other"))
	wantClass(t, "azure not found", err, "ResourceNotFoundError")
	_, err = lookup(t, "azure_kv", Env{}, kw.with("secret", "wrong"))
	wantClass(t, "azure bad secret", err, "ClientAuthenticationError")
	_, err = lookup(t, "azure_kv", Env{}, kw.with("tenant", "bad tenant!"))
	wantClass(t, "azure bad tenant", err, "ValueError")
	_, err = lookup(t, "azure_kv", Env{}, kw.with("url", "http://zz.vault.azure.net"))
	wantClass(t, "azure http", err, "ServiceRequestError")
	// A token per lookup: each makes its own credential.
	if tokens.Load() != 2 {
		t.Errorf("azure tokens issued: %d", tokens.Load())
	}
}

// testCertificate is a self-signed certificate for names.
func testCertificate(t *testing.T, names ...string) (tls.Certificate, *x509.CertPool) {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	tmpl := &x509.Certificate{SerialNumber: big.NewInt(1), Subject: pkix.Name{CommonName: names[0]}, DNSNames: names,
		NotBefore: time.Now().Add(-time.Hour), NotAfter: time.Now().Add(time.Hour), KeyUsage: x509.KeyUsageDigitalSignature | x509.KeyUsageCertSign,
		ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth}, BasicConstraintsValid: true, IsCA: true}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &key.PublicKey, key)
	if err != nil {
		t.Fatal(err)
	}
	parsed, _ := x509.ParseCertificate(der)
	pool := x509.NewCertPool()
	pool.AddCert(parsed)
	return tls.Certificate{Certificate: [][]byte{der}, PrivateKey: key}, pool
}

func TestTestMessage(t *testing.T) {
	timeout := &Exception{Class: "ConnectTimeout", Msg: "x", Reason: "Connection to 10.0.0.1 timed out. (connect timeout=30)"}
	for _, c := range []struct {
		err  error
		oidc bool
		want string
	}{
		{&HTTPError{StatusCode: 403, Msg: "403 Client Error: Forbidden for url: http://v/x"}, false, "HTTP 403"},
		{&HTTPError{StatusCode: 403, Msg: "403 Client Error: Forbidden for url: http://v/x"}, true, "403 Client Error: Forbidden for url: http://v/x"},
		{exc("KeyError", "'url'"), false, "KeyError"},
		{timeout, false, timeout.Reason},
		{fmt.Errorf("other"), false, "Exception"},
	} {
		if got := TestMessage(c.err, c.oidc); got != c.want {
			t.Errorf("TestMessage(%v) = %q, want %q", c.err, got, c.want)
		}
	}
}

// A lookup never connects to link-local addresses (the cloud metadata
// services), and a redirect to another host drops the lookup's headers.
func TestLookupSSRFGuards(t *testing.T) {
	if err := netguard.Control("tcp4", "169.254.169.254:80", nil); err == nil {
		t.Error("metadata address dialed")
	}
	if err := netguard.Control("tcp6", "[fd00:ec2::254]:80", nil); err == nil {
		t.Error("IPv6 metadata address dialed")
	}
	if err := netguard.Control("tcp4", "10.0.0.5:8200", nil); err != nil {
		t.Errorf("private address refused: %v", err)
	}
	got := make(chan string, 1)
	other := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got <- r.Header.Get("X-Vault-Token")
		writeJSON(w, 200, map[string]any{})
	}))
	defer other.Close()
	// Same host, other port: a different Host for the redirect check.
	first := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, other.URL+"/x", http.StatusFound)
	}))
	defer first.Close()
	s, err := newSession(Env{}, httpOpts{connectTimeout: 5 * time.Second, readTimeout: 5 * time.Second})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.do(context.Background(), "GET", first.URL+"/v1/secret", http.Header{"X-Vault-Token": {"hvs.secret"}}, nil); err != nil {
		t.Fatal(err)
	}
	if tok := <-got; tok != "" {
		t.Errorf("token followed the redirect: %q", tok)
	}
}

// A 307 or 308 to another host would resend the body (a Vault login, a
// Conjur API key): that redirect is not followed. On the same host it is.
func TestLookupCrossHostRedirectKeepsBody(t *testing.T) {
	var reached atomic.Int32
	other := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reached.Add(1)
		writeJSON(w, 200, map[string]any{})
	}))
	defer other.Close()
	first := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/same" {
			writeJSON(w, 200, map[string]any{})
			return
		}
		target := other.URL + "/x"
		if r.URL.Path == "/to-same" {
			target = "/same"
		}
		http.Redirect(w, r, target, http.StatusTemporaryRedirect)
	}))
	defer first.Close()
	s, err := newSession(Env{}, httpOpts{connectTimeout: 5 * time.Second, readTimeout: 5 * time.Second})
	if err != nil {
		t.Fatal(err)
	}
	resp, err := s.do(context.Background(), "POST", first.URL+"/v1/auth/login", nil, map[string]any{"password": "s3cret"})
	if err != nil {
		t.Fatal(err)
	}
	if resp.status != http.StatusTemporaryRedirect || reached.Load() != 0 {
		t.Errorf("cross-host 307 followed: status %d, reached %d", resp.status, reached.Load())
	}
	resp, err = s.do(context.Background(), "POST", first.URL+"/to-same", nil, map[string]any{"password": "s3cret"})
	if err != nil {
		t.Fatal(err)
	}
	if resp.status != 200 {
		t.Errorf("same-host 307: status %d", resp.status)
	}
}

// Through a proxy the target address is checked before the request goes.
func TestLookupProxyChecksTarget(t *testing.T) {
	var proxied atomic.Int32
	proxy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		proxied.Add(1)
		writeJSON(w, 200, map[string]any{})
	}))
	defer proxy.Close()
	env := Env{TaskEnv: map[string]string{"http_proxy": proxy.URL, "no_proxy": ""}}
	s, err := newSession(env, httpOpts{connectTimeout: 5 * time.Second, readTimeout: 5 * time.Second})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.do(context.Background(), "GET", "http://169.254.169.254/latest/meta-data/", nil, nil); err == nil || proxied.Load() != 0 {
		t.Errorf("metadata target through proxy: err %v, proxied %d", err, proxied.Load())
	}
	if _, err := s.do(context.Background(), "GET", "http://10.0.0.5:8200/v1/x", nil, nil); err != nil || proxied.Load() != 1 {
		t.Errorf("private target through proxy: err %v, proxied %d", err, proxied.Load())
	}
}
