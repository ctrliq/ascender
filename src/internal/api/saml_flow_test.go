package api

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/beevik/etree"
	dsig "github.com/russellhaering/goxmldsig"

	"github.com/ctrliq/ascender/internal/auth"
	"github.com/ctrliq/ascender/internal/config"
	"github.com/ctrliq/ascender/internal/crypto"
	"github.com/ctrliq/ascender/internal/sso"
)

// A RelayState bound to a browser restores its session only where that
// browser's flow cookie comes back with the response.
func TestSAMLRelayStateIsBoundToItsBrowser(t *testing.T) {
	s := &Server{Cfg: &config.Config{SecretKey: "zz-secret", SessionCookieName: "zz_sessionid"}}
	sealed, err := crypto.Seal(s.Cfg.SecretKey, samlRelayPurpose, "sessionkey\n"+samlFlowHash("the-nonce"))
	if err != nil {
		t.Fatal(err)
	}
	for name, cookie := range map[string]*http.Cookie{
		"no cookie":    nil,
		"wrong cookie": {Name: s.samlFlowCookie(), Value: "another-nonce"},
		"other name":   {Name: "zz_sessionid", Value: "the-nonce"},
	} {
		r := httptest.NewRequest("POST", "/sso/complete/saml/", nil)
		if cookie != nil {
			r.AddCookie(cookie)
		}
		if _, err := s.restoreSession(r, sealed); !errors.Is(err, errSAMLOtherBrowser) {
			t.Errorf("%s: restoreSession = %v", name, err)
		}
	}
	// A seal that does not open restores nothing, without error (the
	// InResponseTo check then refuses the response).
	r := httptest.NewRequest("POST", "/sso/complete/saml/", nil)
	if ss, err := s.restoreSession(r, "garbage"); err != nil || ss.UserID != 0 {
		t.Errorf("unopenable seal: %v %v", ss, err)
	}
}

// A RelayState sealed by this server but older than samlRelayLifetime
// restores nothing and says it expired; one that does not open at all
// (garbage, another key) restores nothing as before.
func TestSAMLRelayStateExpiry(t *testing.T) {
	s := &Server{Cfg: &config.Config{SecretKey: "zz-secret", SessionCookieName: "zz_sessionid"}}
	sealed, err := crypto.Seal(s.Cfg.SecretKey, samlRelayPurpose, "sessionkey\n")
	if err != nil {
		t.Fatal(err)
	}
	other, err := crypto.Seal("another-secret", samlRelayPurpose, "sessionkey\n")
	if err != nil {
		t.Fatal(err)
	}
	withLifetime(t, -time.Nanosecond)
	r := httptest.NewRequest("POST", "/sso/complete/saml/", nil)
	if ss, err := s.restoreSession(r, sealed); !errors.Is(err, errSAMLExpired) || ss == nil || ss.UserID != 0 || len(ss.Data) != 0 {
		t.Errorf("expired seal: %v %v", ss, err)
	}
	for _, seal := range []string{"garbage", other} {
		if ss, err := s.restoreSession(r, seal); err != nil || ss.UserID != 0 {
			t.Errorf("unopenable seal: %v %v", ss, err)
		}
	}
	if got := ssoMessage(errSAMLExpired); got != "Authentication failed: SAML login failed: the login took too long and has expired; please sign in again." {
		t.Errorf("message %q", got)
	}
}

func withLifetime(t *testing.T, d time.Duration) {
	old := samlRelayLifetime
	samlRelayLifetime = d
	t.Cleanup(func() { samlRelayLifetime = old })
}

// samlTestIdP signs responses for samlComplete.
type samlTestIdP struct {
	ks   dsig.X509KeyStore
	cert string
}

func newSAMLTestIdP(t *testing.T) *samlTestIdP {
	ks := dsig.RandomKeyStoreForTest()
	_, der, err := ks.GetKeyPair()
	if err != nil {
		t.Fatal(err)
	}
	return &samlTestIdP{ks: ks, cert: base64.StdEncoding.EncodeToString(der)}
}

// response is a signed-assertion response to acs, in response to irt
// ("" for an IdP-initiated one).
func (idp *samlTestIdP) response(t *testing.T, acs, audience, irt string) string {
	now := time.Now().UTC()
	ts := func(t time.Time) string { return t.UTC().Format("2006-01-02T15:04:05Z") }
	attr := ""
	if irt != "" {
		attr = ` InResponseTo="` + irt + `"`
	}
	id := "_zz" + sso.RandomString(24)
	doc := etree.NewDocument()
	if err := doc.ReadFromString(`<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="R` + id + `" Version="2.0" IssueInstant="` + ts(now) + `"` + attr + `>` +
		`<saml:Issuer>https://idp.zz.test</saml:Issuer><samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status>` +
		`<saml:Assertion xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="` + id + `" Version="2.0" IssueInstant="` + ts(now) + `">` +
		`<saml:Issuer>https://idp.zz.test</saml:Issuer>` +
		`<saml:Subject><saml:NameID>zz-user</saml:NameID><saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer"><saml:SubjectConfirmationData NotOnOrAfter="` + ts(now.Add(5*time.Minute)) + `" Recipient="` + acs + `"` + attr + `/></saml:SubjectConfirmation></saml:Subject>` +
		`<saml:Conditions NotBefore="` + ts(now.Add(-time.Minute)) + `" NotOnOrAfter="` + ts(now.Add(5*time.Minute)) + `"><saml:AudienceRestriction><saml:Audience>` + audience + `</saml:Audience></saml:AudienceRestriction></saml:Conditions>` +
		`<saml:AuthnStatement AuthnInstant="` + ts(now) + `" SessionIndex="S1"/>` +
		`<saml:AttributeStatement><saml:Attribute Name="email"><saml:AttributeValue>zz@zz.test</saml:AttributeValue></saml:Attribute></saml:AttributeStatement>` +
		`</saml:Assertion></samlp:Response>`); err != nil {
		t.Fatal(err)
	}
	a := doc.Root().SelectElement("saml:Assertion")
	sc := dsig.NewDefaultSigningContext(idp.ks)
	sc.Canonicalizer = dsig.MakeC14N10ExclusiveCanonicalizerWithPrefixList("")
	signed, err := sc.SignEnveloped(a)
	if err != nil {
		t.Fatal(err)
	}
	idx := a.Index()
	doc.Root().RemoveChildAt(idx)
	doc.Root().InsertChildAt(idx, signed)
	out, err := doc.WriteToString()
	if err != nil {
		t.Fatal(err)
	}
	return base64.StdEncoding.EncodeToString([]byte(out))
}

// An expired RelayState fails a solicited response on the login failure
// page with a log line saying so; an IdP-initiated response carrying one
// goes on as it always did, and so does a fresh one. Every response here
// stops at attr_user_permanent_id, which names an attribute the IdP does
// not send, so no user is created.
func TestSAMLExpiredRelayStateFlow(t *testing.T) {
	d := newDBServer(t, "zz-saml-expired-relay")
	ctx := context.Background()
	idp := newSAMLTestIdP(t)
	const entity, acs = "https://sp.zz.test", "http://example.com/sso/complete/saml/"
	loadTestSettingsFile(t, d, map[string]any{
		"SOCIAL_AUTH_SAML_SP_ENTITY_ID":      entity,
		"SOCIAL_AUTH_SAML_SP_PUBLIC_CERT":    "zz",
		"SOCIAL_AUTH_SAML_SP_PRIVATE_KEY":    "zz",
		"SOCIAL_AUTH_SAML_ORG_INFO":          map[string]any{"en-US": map[string]any{"name": "zz", "displayname": "ZZ", "url": "https://zz.test"}},
		"SOCIAL_AUTH_SAML_TECHNICAL_CONTACT": map[string]any{"givenName": "zz", "emailAddress": "zz@zz.test"},
		"SOCIAL_AUTH_SAML_SUPPORT_CONTACT":   map[string]any{"givenName": "zz", "emailAddress": "zz@zz.test"},
		"SOCIAL_AUTH_SAML_SP_EXTRA":          map[string]any{},
		"SOCIAL_AUTH_SAML_SECURITY_CONFIG":   map[string]any{"requestedAuthnContext": false},
		"SOCIAL_AUTH_SAML_ENABLED_IDPS": map[string]any{"zz": map[string]any{
			"entity_id": "https://idp.zz.test", "url": "https://idp.zz.test/sso", "x509cert": idp.cert, "attr_user_permanent_id": "zz_absent",
		}},
	})
	var logs bytes.Buffer
	d.Log = slog.New(slog.NewTextHandler(&logs, nil))

	// login is a session as samlBegin left it, with its sealed key.
	login := func(irt string) string {
		t.Helper()
		sess, err := auth.CreateSessionData(ctx, d.Q(), 0, time.Hour, map[string]any{"saml_zz_authn_request_id": irt})
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { _ = auth.DeleteSession(ctx, d.Q(), sess.Key) })
		sealed, err := crypto.Seal(d.Cfg.SecretKey, samlRelayPurpose, sess.Key+"\n")
		if err != nil {
			t.Fatal(err)
		}
		return sealed
	}
	// complete posts the response and returns where it went and the
	// error the login page gets.
	complete := func(sealed, irt string) (string, []any) {
		t.Helper()
		relay := `{"idp": "zz", "next": null, "psa_session_id": "` + sealed + `"}`
		form := url.Values{"SAMLResponse": {idp.response(t, acs, entity, irt)}, "RelayState": {relay}}
		r := httptest.NewRequest("POST", "/sso/complete/saml/", strings.NewReader(form.Encode()))
		r.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		w := httptest.NewRecorder()
		d.samlComplete(w, r)
		for _, c := range w.Result().Cookies() {
			if c.Name == d.Cfg.SessionCookieName && c.Value != "" {
				t.Cleanup(func() { _ = auth.DeleteSession(ctx, d.Q(), c.Value) })
				sess, err := auth.GetSession(ctx, d.Q(), c.Value)
				if err != nil {
					t.Fatal(err)
				}
				l, _ := sess.Data["social_auth_error"].([]any)
				return w.Header().Get("Location"), l
			}
		}
		t.Fatalf("no session cookie: %d %v", w.Code, w.Header())
		return "", nil
	}
	const generic = "Sign-in could not be completed. Please try again."
	const expired = "Authentication failed: SAML login failed: the login took too long and has expired; please sign in again."
	const later = "Invalid value for parameter attr_user_permanent_id."

	// Fresh: the solicited response gets past the session.
	irt := sso.UniqueID()
	if loc, e := complete(login(irt), irt); loc != "/sso/error/" || len(e) != 2 || e[1] != generic || !strings.Contains(logs.String(), later) {
		t.Fatalf("fresh: %s %v\n%s", loc, e, logs.String())
	}

	withLifetime(t, -time.Nanosecond)
	logs.Reset()
	irt = sso.UniqueID()
	if loc, e := complete(login(irt), irt); loc != "/sso/error/" || len(e) != 2 || e[1] != expired || !strings.Contains(logs.String(), expired) {
		t.Fatalf("expired: %s %v\n%s", loc, e, logs.String())
	}
	if strings.Contains(logs.String(), "missing AuthnRequest ID") {
		t.Errorf("expired reported as a missing request: %s", logs.String())
	}

	// IdP-initiated, with an expired RelayState: as before.
	logs.Reset()
	if loc, e := complete(login(""), ""); loc != "/sso/error/" || len(e) != 2 || e[1] != generic || !strings.Contains(logs.String(), later) {
		t.Fatalf("unsolicited: %s %v\n%s", loc, e, logs.String())
	}

	// A RelayState that is not this server's still ends in the missing
	// request.
	logs.Reset()
	irt = sso.UniqueID()
	if loc, e := complete("garbage", irt); loc != "/sso/error/" || len(e) != 2 || !strings.Contains(logs.String(), "missing AuthnRequest ID") {
		t.Fatalf("garbage: %s %v\n%s", loc, e, logs.String())
	}
}
