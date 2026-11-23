package sso

import (
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"
)

// fakeProvider answers every provider host the backends call.
type fakeProvider struct {
	srv    *httptest.Server
	routes map[string]func(w http.ResponseWriter, r *http.Request)
	seen   []string
}

func newFake(t *testing.T) *fakeProvider {
	f := &fakeProvider{routes: map[string]func(http.ResponseWriter, *http.Request){}}
	f.srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		key := r.Host + r.URL.Path
		f.seen = append(f.seen, r.Method+" "+key)
		if h, ok := f.routes[key]; ok {
			h(w, r)
			return
		}
		http.NotFound(w, r)
	}))
	t.Cleanup(f.srv.Close)
	return f
}

// client sends every request to the fake server, keeping its Host.
func (f *fakeProvider) client() *Client {
	target, _ := url.Parse(f.srv.URL)
	return &Client{HTTP: &http.Client{Transport: roundTripper(func(r *http.Request) (*http.Response, error) {
		r2 := r.Clone(r.Context())
		r2.URL.Scheme, r2.URL.Host = target.Scheme, target.Host
		r2.Host = r.URL.Host
		return http.DefaultTransport.RoundTrip(r2)
	})}}
}

type roundTripper func(*http.Request) (*http.Response, error)

func (f roundTripper) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func jsonReply(v any) func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(v)
	}
}

func backend(name string, settings map[string]any, f *fakeProvider) *Backend {
	b := &Backend{
		Name:        name,
		RedirectURI: "http://myapp.com/sso/complete/" + name + "/",
		Setting:     func(n string) any { return settings[n] },
	}
	if f != nil {
		b.client = f.client()
	}
	return b
}

func params(m map[string]string) func(string) (string, bool) {
	return func(k string) (string, bool) { v, ok := m[k]; return v, ok }
}

func TestAuthorizationURLs(t *testing.T) {
	ctx := context.Background()
	cases := []struct {
		name     string
		settings map[string]any
		want     string
	}{
		{Google, map[string]any{"KEY": "gkey", "SCOPE": []any{"profile"}, "AUTH_EXTRA_ARGUMENTS": map[string]any{"hd": "example.com"}},
			"https://accounts.google.com/o/oauth2/auth?client_id=gkey&redirect_uri=http://myapp.com/sso/complete/google-oauth2/&state=S&response_type=code&scope=profile+openid+email+profile&hd=example.com"},
		{GitHub, map[string]any{"KEY": "ghkey", "SCOPE": []any{"user:email", "read:org"}},
			"https://github.com/login/oauth/authorize?client_id=ghkey&redirect_uri=http://myapp.com/sso/complete/github/&state=S&response_type=code&scope=user:email,read:org"},
		{GitHubEnterpriseOrg, map[string]any{"KEY": "k", "URL": "https://ghe.example.com/sub", "SCOPE": []any{"user:email", "read:org"}},
			"https://ghe.example.com/sub/login/oauth/authorize?client_id=k&redirect_uri=http://myapp.com/sso/complete/github-enterprise-org/&state=S&response_type=code&scope=user:email,read:org,read:org"},
		{AzureAD, map[string]any{"KEY": "akey"},
			"https://login.microsoftonline.com/common/oauth2/authorize?client_id=akey&redirect_uri=http://myapp.com/sso/complete/azuread-oauth2/&state=S&response_type=code&scope=openid+profile+user_impersonation+email"},
		{EntraID, map[string]any{"KEY": "ekey", "TENANT_ID": "TENANT", "GROUPS_FROM_GRAPH": true},
			"https://login.microsoftonline.com/TENANT/oauth2/v2.0/authorize?client_id=ekey&redirect_uri=http://myapp.com/sso/complete/entra-id/&state=S&response_type=code&scope=openid+profile+email+https://graph.microsoft.com/GroupMember.Read.All"},
	}
	for _, c := range cases {
		got, err := backend(c.name, c.settings, nil).AuthURL(ctx, "S")
		if err != nil || got != c.want {
			t.Errorf("%s:\n got  %s %v\n want %s", c.name, got, err, c.want)
		}
	}
	if _, err := backend(EntraID, map[string]any{"KEY": "k", "TENANT_ID": "common"}, nil).AuthURL(ctx, "S"); err == nil || err.Error() != "Missing needed parameter TENANT_ID" {
		t.Errorf("multi-tenant entra: %v", err)
	}
	if _, err := backend(GitHubEnterprise, map[string]any{"KEY": "k"}, nil).AuthURL(ctx, "S"); err == nil || err.Error() != "Missing needed parameter URL" {
		t.Errorf("enterprise without URL: %v", err)
	}
}

func TestStateChecks(t *testing.T) {
	b := backend(GitHub, map[string]any{"KEY": "k"}, nil)
	ctx := context.Background()
	for _, c := range []struct {
		data    map[string]string
		session string
		want    string
	}{
		{map[string]string{"error": "access_denied", "error_description": "nope"}, "S", "Authentication process canceled: nope"},
		{map[string]string{"error": "server_error"}, "S", "Authentication failed: server_error"},
		{map[string]string{"code": "c"}, "S", "Missing needed parameter state"},
		{map[string]string{"code": "c", "state": "S"}, "", "Session value state missing."},
		{map[string]string{"code": "c", "state": "X"}, "S", "Wrong state parameter given."},
	} {
		_, err := b.Complete(ctx, params(c.data), c.session)
		if err == nil || err.Error() != c.want {
			t.Errorf("%v: %v want %s", c.data, err, c.want)
		}
	}
}

func TestGitHubFlow(t *testing.T) {
	f := newFake(t)
	var form url.Values
	f.routes["github.com/login/oauth/access_token"] = func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		form = r.PostForm
		if r.Header.Get("User-Agent") != UserAgent || r.Header.Get("Accept") != "application/json" {
			t.Errorf("token headers %v", r.Header)
		}
		jsonReply(map[string]any{"access_token": "AT", "token_type": "bearer"})(w, r)
	}
	f.routes["api.github.com/user"] = func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "token AT" {
			t.Errorf("auth header %q", r.Header.Get("Authorization"))
		}
		w.Write([]byte(`{"id": 12345678901234567, "login": "octo", "name": "Octo Cat Jr", "email": null}`))
	}
	f.routes["api.github.com/user/emails"] = jsonReply([]any{
		map[string]any{"email": "first@x.test", "primary": false, "verified": true},
		map[string]any{"email": "primary@x.test", "primary": true, "verified": false},
	})
	f.routes["api.github.com/orgs/acme/members/octo"] = func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(204) }
	b := backend(GitHubOrg, map[string]any{"KEY": "k", "SECRET": "s", "NAME": "acme", "SCOPE": []any{"user:email", "read:org"}}, f)
	resp, err := b.Complete(context.Background(), params(map[string]string{"state": "S", "code": "C"}), "S")
	if err != nil {
		t.Fatal(err)
	}
	if form.Get("grant_type") != "authorization_code" || form.Get("code") != "C" || form.Get("client_secret") != "s" || form.Get("redirect_uri") != "http://myapp.com/sso/complete/github-org/" {
		t.Errorf("token form %v", form)
	}
	details := b.UserDetails(resp)
	uid, _ := b.UserID(details, resp)
	// The primary address is unverified, so it is not used (social-core
	// took it): email links accounts and drives organization maps.
	if uid != "12345678901234567" || details["username"] != "octo" || details["email"] != "" || details["first_name"] != "Octo" || details["last_name"] != "Cat Jr" {
		t.Errorf("uid %s details %v", uid, details)
	}
	extra, _ := b.ExtraData(resp, details)
	for _, k := range []string{"auth_time", "id", "expires_in", "login", "refresh_token", "access_token", "token_type"} {
		if _, ok := extra[k]; !ok {
			t.Errorf("extra data lacks %s: %v", k, extra)
		}
	}
	// Not a member.
	f.routes["api.github.com/orgs/acme/members/octo"] = func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(404) }
	if _, err := b.Complete(context.Background(), params(map[string]string{"state": "S", "code": "C"}), "S"); err == nil || err.Error() != "Authentication failed: User doesn't belong to the organization" {
		t.Errorf("non member: %v", err)
	}
	// GitHub's errors come back as 200 JSON.
	f.routes["github.com/login/oauth/access_token"] = jsonReply(map[string]any{"error": "bad_verification_code", "error_description": "The code passed is incorrect or expired."})
	if _, err := b.Complete(context.Background(), params(map[string]string{"state": "S", "code": "C"}), "S"); err == nil || err.Error() != "Authentication failed: The code passed is incorrect or expired." {
		t.Errorf("bad code: %v", err)
	}
	f.routes["github.com/login/oauth/access_token"] = func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(401) }
	if _, err := b.Complete(context.Background(), params(map[string]string{"state": "S", "code": "C"}), "S"); err == nil || err.Error() != "Token error: Invalid key/secret, perhaps expired" {
		t.Errorf("401: %v", err)
	}
}

func TestGoogleFlow(t *testing.T) {
	f := newFake(t)
	f.routes["accounts.google.com/o/oauth2/token"] = jsonReply(map[string]any{"access_token": "AT", "expires_in": 3599, "token_type": "Bearer", "id_token": "not validated"})
	f.routes["www.googleapis.com/oauth2/v3/userinfo"] = jsonReply(map[string]any{"sub": "1", "email": "Ann.Lee@Example.com", "name": "Ann Lee", "given_name": "Ann", "family_name": "Lee"})
	b := backend(Google, map[string]any{"KEY": "k", "SECRET": "s", "WHITELISTED_DOMAINS": []any{"Example.com"}}, f)
	resp, err := b.Complete(context.Background(), params(map[string]string{"state": "S", "code": "C"}), "S")
	if err != nil {
		t.Fatal(err)
	}
	details := b.UserDetails(resp)
	uid, _ := b.UserID(details, resp)
	if uid != "Ann.Lee@Example.com" || details["username"] != "Ann.Lee" || !b.AuthAllowed(details) {
		t.Errorf("uid %s details %v", uid, details)
	}
	// With a list set, no email is no way onto it.
	if b.AuthAllowed(map[string]any{"email": "a@sub.example.com"}) || b.AuthAllowed(map[string]any{"email": ""}) || b.AuthAllowed(map[string]any{"email": "noat"}) {
		t.Error("whitelist")
	}
	extra, _ := b.ExtraData(resp, details)
	if _, ok := extra["refresh_token"]; ok {
		t.Errorf("empty refresh token kept: %v", extra)
	}
}

// signer makes RS256 tokens and the key set that checks them.
type signer struct {
	key *rsa.PrivateKey
	kid string
}

func newSigner(t *testing.T) *signer {
	k, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	return &signer{key: k, kid: "kid1"}
}

func (s *signer) jwks(issuer string) map[string]any {
	k := map[string]any{"kty": "RSA", "kid": s.kid, "n": base64.RawURLEncoding.EncodeToString(s.key.N.Bytes()),
		"e": base64.RawURLEncoding.EncodeToString(big.NewInt(int64(s.key.E)).Bytes())}
	if issuer != "" {
		k["issuer"] = issuer
	}
	return map[string]any{"keys": []any{k}}
}

func (s *signer) token(claims map[string]any) string {
	h, _ := json.Marshal(map[string]any{"alg": "RS256", "typ": "JWT", "kid": s.kid})
	p, _ := json.Marshal(claims)
	in := base64.RawURLEncoding.EncodeToString(h) + "." + base64.RawURLEncoding.EncodeToString(p)
	d := sha256.Sum256([]byte(in))
	sig, _ := rsa.SignPKCS1v15(rand.Reader, s.key, crypto.SHA256, d[:])
	return in + "." + base64.RawURLEncoding.EncodeToString(sig)
}

func TestEntraFlow(t *testing.T) {
	tenant := "11111111-2222-3333-4444-555555555555"
	f := newFake(t)
	sg := newSigner(t)
	host := "login.microsoftonline.com"
	discovery := "https://" + host + "/" + tenant + "/v2.0/.well-known/openid-configuration?appid=ekey"
	_ = discovery
	f.routes[host+"/"+tenant+"/v2.0/.well-known/openid-configuration"] = jsonReply(map[string]any{
		"issuer": "https://" + host + "/{tenantid}/v2.0", "jwks_uri": "https://" + host + "/" + tenant + "/discovery/v2.0/keys"})
	f.routes[host+"/"+tenant+"/discovery/v2.0/keys"] = jsonReply(sg.jwks("https://" + host + "/{tenantid}/v2.0"))
	now := time.Now().Unix()
	claims := map[string]any{"aud": "ekey", "iss": "https://" + host + "/" + tenant + "/v2.0", "tid": tenant, "oid": "OID-1", "iat": now, "nbf": now, "exp": now + 3600,
		"preferred_username": "ann@corp.example", "name": "Ann Lee", "groups": []any{"from-token"}}
	f.routes[host+"/"+tenant+"/oauth2/v2.0/token"] = func(w http.ResponseWriter, r *http.Request) {
		jsonReply(map[string]any{"access_token": "AT", "token_type": "Bearer", "expires_in": 3599, "id_token": sg.token(claims)})(w, r)
	}
	page2 := "https://graph.microsoft.com/v1.0/me/next?page=2"
	f.routes["graph.microsoft.com/v1.0/me/transitiveMemberOf/microsoft.graph.group"] = jsonReply(map[string]any{"value": []any{map[string]any{"id": "g1"}, map[string]any{"id": "g2"}}, "@odata.nextLink": page2})
	f.routes["graph.microsoft.com/v1.0/me/next"] = jsonReply(map[string]any{"value": []any{map[string]any{"id": "g2"}, map[string]any{"id": "g3"}}})
	settings := map[string]any{"KEY": "ekey", "SECRET": "s", "TENANT_ID": tenant, "GROUPS_FROM_GRAPH": true}
	b := backend(EntraID, settings, f)
	resp, err := b.Complete(context.Background(), params(map[string]string{"state": "S", "code": "C"}), "S")
	if err != nil {
		t.Fatal(err)
	}
	details := b.UserDetails(resp)
	uid, _ := b.UserID(details, resp)
	if uid != "OID-1" || details["username"] != "ann@corp.example" || details["email"] != "ann@corp.example" {
		t.Errorf("uid %s details %v", uid, details)
	}
	if g, _ := OIDCGroups(OIDCClaims(nil, resp), "groups"); fmt.Sprint(g) != "[g1 g2 g3]" {
		t.Errorf("graph groups %v", g)
	}
	// Graph failing leaves the groups unknown.
	f.routes["graph.microsoft.com/v1.0/me/next"] = func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(500) }
	resp, err = backend(EntraID, settings, f).Complete(context.Background(), params(map[string]string{"state": "S", "code": "C"}), "S")
	if err != nil {
		t.Fatal(err)
	}
	if _, known := OIDCGroups(OIDCClaims(nil, resp), "groups"); known {
		t.Error("groups known after a Graph failure")
	}
	// Another tenant's token.
	claims["tid"] = "99999999-2222-3333-4444-555555555555"
	if _, err := backend(EntraID, settings, f).Complete(context.Background(), params(map[string]string{"state": "S", "code": "C"}), "S"); err == nil || err.Error() != "Token error: Token issuer does not match signing key issuer" {
		t.Errorf("other tenant: %v", err)
	}
	// Expired and wrong audience.
	claims["tid"] = tenant
	claims["exp"] = now - 10
	if _, err := backend(EntraID, settings, f).Complete(context.Background(), params(map[string]string{"state": "S", "code": "C"}), "S"); err == nil || err.Error() != "Token error: Signature has expired" {
		t.Errorf("expired: %v", err)
	}
	claims["exp"] = now + 3600
	claims["aud"] = "other"
	if _, err := backend(EntraID, settings, f).Complete(context.Background(), params(map[string]string{"state": "S", "code": "C"}), "S"); err == nil || err.Error() != "Token error: Audience doesn't match" {
		t.Errorf("audience: %v", err)
	}
}

func TestOIDCClaimsHelpers(t *testing.T) {
	claims := OIDCClaims(map[string]any{"sub": "1", "groups": []any{"a"}, "realm_access": map[string]any{"roles": []any{"r1", nil}}, "email_verified": true},
		map[string]any{"access_token": "x", "groups": []any{"b", 3}})
	if g, ok := OIDCGroups(claims, "groups"); !ok || fmt.Sprint(g) != "[b]" {
		t.Errorf("groups %v", g)
	}
	if g, ok := OIDCGroups(claims, "realm_access.roles"); !ok || fmt.Sprint(g) != "[r1]" {
		t.Errorf("dotted groups %v %v", g, ok)
	}
	if _, ok := OIDCGroups(map[string]any{"_claim_names": map[string]any{"groups": "src1"}}, "groups"); ok {
		t.Error("overage claim counted as groups")
	}
	attrs := OIDCAttributes(claims)
	if attrs["email_verified"] != "true" || fmt.Sprint(attrs["realm_access.roles"]) != "[r1]" || attrs["access_token"] != nil {
		t.Errorf("attributes %v", attrs)
	}
	for _, c := range [][4]string{{"John Smith Jr", "", "", "John Smith Jr|John|Smith Jr"}, {"Cher", "", "", "Cher|Cher|"}, {" Lead Space", "", "", "Lead Space||Lead Space"}, {"", "Ann", "Lee", "Ann Lee|Ann|Lee"}} {
		a, b, cc := GetUserNames(c[0], c[1], c[2])
		if got := strings.Join([]string{a, b, cc}, "|"); got != c[3] {
			t.Errorf("names %q: %q", c[0], got)
		}
	}
}

// A verified primary address is the user's email.
func TestGitHubVerifiedPrimaryEmail(t *testing.T) {
	f := newFake(t)
	f.routes["github.com/login/oauth/access_token"] = jsonReply(map[string]any{"access_token": "AT", "token_type": "bearer"})
	f.routes["api.github.com/user"] = jsonReply(map[string]any{"id": 7, "login": "octo", "name": "Octo", "email": nil})
	f.routes["api.github.com/user/emails"] = jsonReply([]any{
		map[string]any{"email": "first@x.test", "primary": false, "verified": true},
		map[string]any{"email": "primary@x.test", "primary": true, "verified": true},
	})
	b := backend(GitHub, map[string]any{"KEY": "k", "SECRET": "s", "SCOPE": []any{"user:email"}}, f)
	resp, err := b.Complete(context.Background(), params(map[string]string{"state": "S", "code": "C"}), "S")
	if err != nil {
		t.Fatal(err)
	}
	if details := b.UserDetails(resp); details["email"] != "primary@x.test" {
		t.Errorf("details %v", details)
	}
}
