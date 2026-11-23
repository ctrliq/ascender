package sso

import (
	"encoding/base64"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/beevik/etree"
	dsig "github.com/russellhaering/goxmldsig"
)

const testACS = "http://sp.test/sso/complete/saml/"

// samlFixture signs responses as an IdP would.
type samlFixture struct {
	ks   dsig.X509KeyStore
	cert string
}

func newSAMLFixture(t *testing.T) *samlFixture {
	ks := dsig.RandomKeyStoreForTest()
	_, der, err := ks.GetKeyPair()
	if err != nil {
		t.Fatal(err)
	}
	return &samlFixture{ks: ks, cert: base64.StdEncoding.EncodeToString(der)}
}

func (f *samlFixture) settings() *SAMLSettings {
	return &SAMLSettings{
		SPEntityID: "http://sp.test",
		OrgInfo:    []OrgLang{{Lang: "en-US", Name: "example", DisplayName: "Example Inc.", URL: "http://example.com"}},
		Technical:  map[string]any{"givenName": "Tech Gal", "emailAddress": "technical@example.com"},
		Support:    map[string]any{"givenName": "Support Guy", "emailAddress": "support@example.com"},
		Security:   map[string]any{"metadataValidUntil": "", "metadataCacheDuration": "P10D", "requestedAuthnContext": false},
		SPExtra:    map[string]any{},
		ACSURL:     testACS,
		IdPName:    "okta",
		IdP:        map[string]any{"entity_id": "https://idp.test", "url": "https://idp.test/sso/saml", "x509cert": f.cert},
	}
}

type respOpts struct {
	irt, dest   string
	notOnOrAfer time.Time
	signAssert  bool
	tamper      bool
	dupAttr     bool
}

func (f *samlFixture) response(t *testing.T, o respOpts) string {
	now := time.Now().UTC()
	ts := func(t time.Time) string { return t.UTC().Format("2006-01-02T15:04:05Z") }
	if o.notOnOrAfer.IsZero() {
		o.notOnOrAfer = now.Add(5 * time.Minute)
	}
	irt := ""
	if o.irt != "" {
		irt = ` InResponseTo="` + o.irt + `"`
	}
	dest := ""
	if o.dest != "" {
		dest = ` Destination="` + o.dest + `"`
	}
	dup := ""
	if o.dupAttr {
		dup = `<saml:Attribute Name="email"><saml:AttributeValue>x</saml:AttributeValue></saml:Attribute>`
	}
	assertion := `<saml:Assertion xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="A1" Version="2.0" IssueInstant="` + ts(now) + `">` +
		`<saml:Issuer>https://idp.test</saml:Issuer>` +
		`<saml:Subject><saml:NameID>jdoe</saml:NameID><saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer"><saml:SubjectConfirmationData NotOnOrAfter="` + ts(o.notOnOrAfer) + `" Recipient="` + testACS + `"` + irt + `/></saml:SubjectConfirmation></saml:Subject>` +
		`<saml:Conditions NotBefore="` + ts(now.Add(-time.Minute)) + `" NotOnOrAfter="` + ts(o.notOnOrAfer) + `"><saml:AudienceRestriction><saml:Audience>http://sp.test</saml:Audience></saml:AudienceRestriction></saml:Conditions>` +
		`<saml:AuthnStatement AuthnInstant="` + ts(now) + `" SessionIndex="S1"/>` +
		`<saml:AttributeStatement><saml:Attribute Name="email"><saml:AttributeValue>jdoe@x.test</saml:AttributeValue></saml:Attribute>` + dup +
		`<saml:Attribute Name="groups"><saml:AttributeValue>a</saml:AttributeValue><saml:AttributeValue>  </saml:AttributeValue><saml:AttributeValue> b </saml:AttributeValue></saml:Attribute></saml:AttributeStatement>` +
		`</saml:Assertion>`
	doc := etree.NewDocument()
	if err := doc.ReadFromString(`<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="R1" Version="2.0" IssueInstant="` + ts(now) + `"` + dest + irt + `>` +
		`<saml:Issuer>https://idp.test</saml:Issuer><samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status>` + assertion + `</samlp:Response>`); err != nil {
		t.Fatal(err)
	}
	if o.signAssert {
		a := doc.Root().SelectElement("saml:Assertion")
		sc := dsig.NewDefaultSigningContext(f.ks)
		// IdPs sign with exclusive c14n.
		sc.Canonicalizer = dsig.MakeC14N10ExclusiveCanonicalizerWithPrefixList("")
		signed, err := sc.SignEnveloped(a)
		if err != nil {
			t.Fatal(err)
		}
		idx := a.Index()
		doc.Root().RemoveChildAt(idx)
		doc.Root().InsertChildAt(idx, signed)
	}
	if o.tamper {
		for _, v := range doc.Root().FindElements("//saml:AttributeValue") {
			if v.Text() == "jdoe@x.test" {
				v.SetText("evil@x.test")
			}
		}
	}
	s, err := doc.WriteToString()
	if err != nil {
		t.Fatal(err)
	}
	return base64.StdEncoding.EncodeToString([]byte(s))
}

func TestSAMLResponse(t *testing.T) {
	f := newSAMLFixture(t)
	c := f.settings()
	now := time.Now()
	res, err := c.ProcessResponse(f.response(t, respOpts{irt: "ONELOGIN_x", dest: testACS, signAssert: true}), "ONELOGIN_x", testACS, now)
	if err != nil {
		t.Fatal(err)
	}
	if fmt.Sprint(res.Attributes["groups"]) != "[a b]" || fmt.Sprint(res.Attributes["email"]) != "[jdoe@x.test]" || res.NameID != "jdoe" || res.SessionIndex != "S1" {
		t.Errorf("result %+v", res)
	}
	cases := []struct {
		opts      respOpts
		requestID string
		url       string
		want      string
	}{
		{respOpts{irt: "ONELOGIN_x", signAssert: true}, "other", testACS, "The InResponseTo of the Response: ONELOGIN_x, does not match the ID of the AuthNRequest sent by the SP: other"},
		{respOpts{signAssert: true, tamper: true}, "", testACS, "Signature validation failed. SAML Response rejected"},
		{respOpts{}, "", testACS, "No Signature found. SAML Response rejected"},
		{respOpts{signAssert: true, notOnOrAfer: now.Add(-301 * time.Second)}, "", testACS, "Could not validate timestamp: expired. Check system clock."},
		{respOpts{dest: testACS, signAssert: true}, "", "https://sp.test/sso/complete/saml/", "The response was received at https://sp.test/sso/complete/saml/ instead of " + testACS},
	}
	for _, cs := range cases {
		_, err := c.ProcessResponse(f.response(t, cs.opts), cs.requestID, cs.url, now)
		want := "Authentication failed: SAML login failed: ['invalid_response'] (" + cs.want + ")"
		if err == nil || err.Error() != want {
			t.Errorf("%+v:\n got  %v\n want %s", cs.opts, err, want)
		}
	}
	// Within the 300 second skew is still valid.
	if _, err := c.ProcessResponse(f.response(t, respOpts{signAssert: true, notOnOrAfer: now.Add(-299 * time.Second)}), "", testACS, now); err != nil {
		t.Errorf("within skew: %v", err)
	}
	// Duplicated attribute names escape the AuthFailed wrapper.
	if _, err := c.ProcessResponse(f.response(t, respOpts{signAssert: true, dupAttr: true}), "", testACS, now); err == nil || err.Error() != "Found an Attribute element with duplicated Name" {
		t.Errorf("duplicate: %v", err)
	}
	c.Security["allowRepeatAttributeName"] = true
	if res, err := c.ProcessResponse(f.response(t, respOpts{signAssert: true, dupAttr: true}), "", testACS, now); err != nil || fmt.Sprint(res.Attributes["email"]) != "[jdoe@x.test x]" {
		t.Errorf("repeat allowed: %v %v", res, err)
	}
	if v := ResponseInResponseTo(f.response(t, respOpts{irt: "ONELOGIN_y"})); v != "ONELOGIN_y" {
		t.Errorf("InResponseTo %q", v)
	}
}

func TestSAMLRequestAndMetadata(t *testing.T) {
	f := newSAMLFixture(t)
	c := f.settings()
	c.SPEntityID, c.ACSURL = "https://ascender.example.com", "https://ascender.example.com/sso/complete/saml/"
	c.IdP["url"] = "https://idp.example.com/sso/saml"
	c.SPCert = "-----BEGIN CERTIFICATE-----\nCERT\n-----END CERTIFICATE-----"
	at := time.Date(2026, 11, 15, 15, 43, 22, 0, time.UTC)
	x, id := c.AuthnRequest(at)
	want := `<samlp:AuthnRequest
  xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
  xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
  ID="` + id + `"
  Version="2.0"
    ProviderName="Example Inc."
  IssueInstant="2026-11-15T15:43:22Z"
  Destination="https://idp.example.com/sso/saml"
  ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
  AssertionConsumerServiceURL="https://ascender.example.com/sso/complete/saml/">
    <saml:Issuer>https://ascender.example.com</saml:Issuer>
    <samlp:NameIDPolicy
        Format="urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified"
        AllowCreate="true" />

</samlp:AuthnRequest>`
	if x != want || !strings.HasPrefix(id, "ONELOGIN_") || len(id) != 49 {
		t.Errorf("AuthnRequest:\n%s", x)
	}
	md, err := c.Metadata(at)
	if err != nil {
		t.Fatal(err)
	}
	wantMD := `<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" cacheDuration="P10D" entityID="https://ascender.example.com">
    <md:SPSSODescriptor AuthnRequestsSigned="false" WantAssertionsSigned="false" protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
        <md:KeyDescriptor use="signing"><ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><ds:X509Data><ds:X509Certificate>CERT</ds:X509Certificate></ds:X509Data></ds:KeyInfo></md:KeyDescriptor><md:NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified</md:NameIDFormat>
        <md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://ascender.example.com/sso/complete/saml/" index="1"/>
    </md:SPSSODescriptor>
    <md:Organization>
        <md:OrganizationName xml:lang="en-US">example</md:OrganizationName>
        <md:OrganizationDisplayName xml:lang="en-US">Example Inc.</md:OrganizationDisplayName>
        <md:OrganizationURL xml:lang="en-US">http://example.com</md:OrganizationURL>
    </md:Organization>
    <md:ContactPerson contactType="technical">
        <md:GivenName>Tech Gal</md:GivenName>
        <md:EmailAddress>technical@example.com</md:EmailAddress>
    </md:ContactPerson>
    <md:ContactPerson contactType="support">
        <md:GivenName>Support Guy</md:GivenName>
        <md:EmailAddress>support@example.com</md:EmailAddress>
    </md:ContactPerson>
</md:EntityDescriptor>`
	if md != wantMD {
		t.Errorf("metadata:\n%s", md)
	}
	// A single-label host is no valid ACS URL.
	c.ACSURL = "http://ascender:8052/sso/complete/saml/"
	if err := c.Validate(false); err == nil || err.Error() != "Invalid dict settings: sp_acs_url_invalid" {
		t.Errorf("single label: %v", err)
	}
	u, _, err := (&SAMLSettings{IdP: map[string]any{"url": "ftp://x"}}).LoginURL("r", at)
	if err == nil || err.Error() != "Redirect to invalid URL: ftp://x" {
		t.Errorf("redirect check: %v %v", u, err)
	}
}

// SP_EXTRA's attributeConsumingService goes into the metadata and the
// request as python3-saml 1.16 put it (the expected texts are its output,
// the certificate shortened).
func TestSAMLAttributeConsumingService(t *testing.T) {
	f := newSAMLFixture(t)
	c := f.settings()
	c.SPEntityID, c.ACSURL = "https://ascender.example.com", "https://ascender.example.com/sso/complete/saml/"
	c.IdP["url"] = "https://idp.example.com/sso/saml"
	c.SPCert = "-----BEGIN CERTIFICATE-----\nCERT\n-----END CERTIFICATE-----"
	at := time.Date(2026, 11, 15, 15, 43, 22, 0, time.UTC)
	head := `<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" cacheDuration="P10D" entityID="https://ascender.example.com">
    <md:SPSSODescriptor AuthnRequestsSigned="false" WantAssertionsSigned="false" protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
        <md:KeyDescriptor use="signing"><ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><ds:X509Data><ds:X509Certificate>CERT</ds:X509Certificate></ds:X509Data></ds:KeyInfo></md:KeyDescriptor><md:NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified</md:NameIDFormat>
        <md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://ascender.example.com/sso/complete/saml/" index="1"/>
`
	tail := `    </md:SPSSODescriptor>
    <md:Organization>
        <md:OrganizationName xml:lang="en-US">example</md:OrganizationName>
        <md:OrganizationDisplayName xml:lang="en-US">Example Inc.</md:OrganizationDisplayName>
        <md:OrganizationURL xml:lang="en-US">http://example.com</md:OrganizationURL>
    </md:Organization>
    <md:ContactPerson contactType="technical">
        <md:GivenName>Tech Gal</md:GivenName>
        <md:EmailAddress>technical@example.com</md:EmailAddress>
    </md:ContactPerson>
    <md:ContactPerson contactType="support">
        <md:GivenName>Support Guy</md:GivenName>
        <md:EmailAddress>support@example.com</md:EmailAddress>
    </md:ContactPerson>
</md:EntityDescriptor>`
	cases := []struct {
		name string
		acs  map[string]any
		want string
	}{
		{"full", map[string]any{"index": float64(2), "serviceName": "Ascender", "serviceDescription": "Ascender SP", "requestedAttributes": []any{
			map[string]any{"name": "email", "nameFormat": "urn:oasis:names:tc:SAML:2.0:attrname-format:basic", "friendlyName": "Email", "isRequired": true, "attributeValue": []any{"a", "b"}},
			map[string]any{"name": "uid"},
			map[string]any{"name": "groups", "isRequired": false, "nameFormat": "", "friendlyName": nil, "attributeValue": []any{}},
		}}, `        <md:AttributeConsumingService index="2">
            <md:ServiceName xml:lang="en">Ascender</md:ServiceName>
            <md:ServiceDescription xml:lang="en">Ascender SP</md:ServiceDescription>
            <md:RequestedAttribute Name="email" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:basic" FriendlyName="Email" isRequired="true">
                <saml:AttributeValue xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">a</saml:AttributeValue>
                <saml:AttributeValue xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">b</saml:AttributeValue>
            </md:RequestedAttribute>
            <md:RequestedAttribute Name="uid"/>
            <md:RequestedAttribute Name="groups"/>
        </md:AttributeConsumingService>
`},
		{"no attributes", map[string]any{"serviceName": "Ascender", "requestedAttributes": []any{}}, `        <md:AttributeConsumingService index="1">
            <md:ServiceName xml:lang="en">Ascender</md:ServiceName>

        </md:AttributeConsumingService>
`},
		{"one", map[string]any{"serviceName": "Ascender", "requestedAttributes": []any{map[string]any{"name": "x", "friendlyName": "X"}}}, `        <md:AttributeConsumingService index="1">
            <md:ServiceName xml:lang="en">Ascender</md:ServiceName>
            <md:RequestedAttribute Name="x" FriendlyName="X"/>
        </md:AttributeConsumingService>
`},
		{"empty", map[string]any{}, ""},
	}
	for _, cs := range cases {
		c.SPExtra = map[string]any{"attributeConsumingService": cs.acs}
		md, err := c.Metadata(at)
		if err != nil {
			t.Fatalf("%s: %v", cs.name, err)
		}
		if want := head + cs.want + tail; md != want {
			t.Errorf("%s metadata:\n%s\nwant:\n%s", cs.name, md, want)
		}
	}
	c.SPExtra = map[string]any{"attributeConsumingService": cases[0].acs}
	x, _ := c.AuthnRequest(at)
	if !strings.Contains(x, "  AssertionConsumerServiceURL=\"https://ascender.example.com/sso/complete/saml/\"\n    AttributeConsumingServiceIndex=\"2\">\n") {
		t.Errorf("AuthnRequest:\n%s", x)
	}

	// The settings check, for the metadata and the login alike.
	p := "sp_attributeConsumingService_"
	for _, cs := range []struct {
		acs  any
		want []string
	}{
		{map[string]any{"requestedAttributes": []any{}}, []string{"serviceName_not_found"}},
		{map[string]any{"serviceName": float64(5)}, []string{"serviceName_type_invalid", "requestedAttributes_not_found"}},
		{map[string]any{"serviceName": "x", "requestedAttributes": "email"}, []string{"serviceName_type_invalid"}},
		{map[string]any{"serviceName": "x", "serviceDescription": float64(3), "requestedAttributes": []any{
			map[string]any{"friendlyName": "a"}, map[string]any{"name": "  "}, map[string]any{"name": "a", "attributeValue": "v", "isRequired": float64(1)},
		}}, []string{"requestedAttributes_name_not_found", "requestedAttributes_name_invalid", "requestedAttributes_attributeValue_type_invalid", "requestedAttributes_isRequired_type_invalid", "serviceDescription_type_invalid"}},
		{map[string]any{"serviceName": "x", "requestedAttributes": []any{map[string]any{"name": "a", "isRequired": "true"}}}, []string{"requestedAttributes_isRequired_type_invalid"}},
	} {
		c.SPExtra = map[string]any{"attributeConsumingService": cs.acs}
		want := "Invalid dict settings: " + p + strings.Join(cs.want, ","+p)
		for _, spOnly := range []bool{true, false} {
			if err := c.Validate(spOnly); err == nil || err.Error() != want {
				t.Errorf("%v (sp only %v):\n got  %v\n want %s", cs.acs, spOnly, err, want)
			}
		}
		if _, err := c.Metadata(at); err == nil || err.Error() != want {
			t.Errorf("%v metadata: %v", cs.acs, err)
		}
	}
}
