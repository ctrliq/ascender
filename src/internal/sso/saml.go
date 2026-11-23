package sso

import (
	"bytes"
	"compress/flate"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha1"
	_ "crypto/sha256" // the hashes crypto.Hash names
	_ "crypto/sha512"
	"crypto/tls"
	"crypto/x509"
	"encoding/base64"
	"encoding/hex"
	"encoding/pem"
	"encoding/xml"
	"errors"
	"fmt"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/beevik/etree"
	samltypes "github.com/russellhaering/gosaml2/types"
	dsig "github.com/russellhaering/goxmldsig"
	"github.com/russellhaering/goxmldsig/etreeutils"
)

// SAML as social_core's SAMLAuth drove python3-saml 1.16.

const (
	nsSAMLP = "urn:oasis:names:tc:SAML:2.0:protocol"
	nsSAML  = "urn:oasis:names:tc:SAML:2.0:assertion"
	nsDS    = "http://www.w3.org/2000/09/xmldsig#"
	nsXENC  = "http://www.w3.org/2001/04/xmlenc#"

	bindingPOST     = "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
	bindingRedirect = "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"
	nameIDUnspec    = "urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified"
	nameIDEncrypted = "urn:oasis:names:tc:SAML:2.0:nameid-format:encrypted"
	statusSuccess   = "urn:oasis:names:tc:SAML:2.0:status:Success"
	cmBearer        = "urn:oasis:names:tc:SAML:2.0:cm:bearer"
	clockDrift      = 300
)

// OrgLang is one language of SOCIAL_AUTH_SAML_ORG_INFO.
type OrgLang struct{ Lang, Name, DisplayName, URL string }

// SAMLSettings is generate_saml_config's dict for one request.
type SAMLSettings struct {
	SPEntityID string
	SPCert     string
	SPKey      string
	OrgInfo    []OrgLang
	Technical  map[string]any
	Support    map[string]any
	// Security is SECURITY_CONFIG laid over social_core's two keys.
	Security map[string]any
	SPExtra  map[string]any
	// ACSURL is the request's /sso/complete/saml/.
	ACSURL string
	// IdPName and IdP are the ENABLED_IDPS entry (nil for metadata).
	IdPName string
	IdP     map[string]any
}

var securityDefaults = map[string]any{
	"requestedAuthnContext": true, "requestedAuthnContextComparison": "exact", "failOnAuthnContextMismatch": false,
	"authnRequestsSigned": false, "logoutRequestSigned": false, "logoutResponseSigned": false, "signMetadata": false,
	"wantMessagesSigned": false, "wantAssertionsSigned": false, "wantAssertionsEncrypted": false, "wantNameIdEncrypted": false,
	"nameIdEncrypted": false, "wantNameId": true, "wantAttributeStatement": true, "allowRepeatAttributeName": false,
	"signatureAlgorithm": "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256", "digestAlgorithm": "http://www.w3.org/2001/04/xmlenc#sha256",
	"allowSingleLabelDomains": false, "rejectDeprecatedAlgorithm": false,
}

// deprecatedAlgorithms are python3-saml's: SHA-1 signatures and digests,
// refused when SECURITY_CONFIG's rejectDeprecatedAlgorithm is true.
var deprecatedAlgorithms = map[string]bool{
	"http://www.w3.org/2000/09/xmldsig#rsa-sha1": true,
	"http://www.w3.org/2000/09/xmldsig#dsa-sha1": true,
	"http://www.w3.org/2000/09/xmldsig#sha1":     true,
}

func (c *SAMLSettings) sec(k string) any {
	if v, ok := c.Security[k]; ok {
		return v
	}
	return securityDefaults[k]
}

func (c *SAMLSettings) secBool(k string) bool { return truthy(c.sec(k)) }

func (c *SAMLSettings) acs() (string, string) {
	u, b := c.ACSURL, bindingPOST
	if m, ok := c.SPExtra["assertionConsumerService"].(map[string]any); ok {
		u = str(m, "url")
		if s := str(m, "binding"); s != "" {
			b = s
		}
	}
	return u, b
}

func (c *SAMLSettings) nameIDFormat() string {
	if s := str(c.SPExtra, "NameIDFormat"); s != "" {
		return s
	}
	return nameIDUnspec
}

func (c *SAMLSettings) idpStr(k string) string { return str(c.IdP, k) }

var samlURLRe = regexp.MustCompile(`(?i)^(?:[a-z0-9.\-]*)://(?:(?:[A-Z0-9_](?:[A-Z0-9_\-]{0,61}[A-Z0-9_])?\.)+(?:[A-Z]{2,6}\.?|[A-Z0-9\-]{2,}\.?)|localhost|\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}|\[?[A-F0-9]*:[A-F0-9:]+\]?)(?::\d+)?(?:/?|[/?]\S+)$`)
var samlURLSingleRe = regexp.MustCompile(`(?i)^(?:[a-z0-9.\-]*)://(?:(?:[A-Z0-9_](?:[A-Z0-9_\-]{0,61}[A-Z0-9_])?\.)+(?:[A-Z]{2,6}\.?|[A-Z0-9\-]{2,}\.?)|(?:[A-Z0-9_](?:[A-Z0-9_\-]{0,61}[A-Z0-9_]))|localhost|\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}|\[?[A-F0-9]*:[A-F0-9:]+\]?)(?::\d+)?(?:/?|[/?]\S+)$`)

// validURL is OneLogin_Saml2_Settings' validate_url.
func validURL(u string, single bool) bool {
	scheme, _, _ := strings.Cut(u, "://")
	switch strings.ToLower(scheme) {
	case "http", "https", "ftp", "ftps":
	default:
		return false
	}
	if single {
		return samlURLSingleRe.MatchString(u)
	}
	return samlURLRe.MatchString(u)
}

// Validate is the settings check: "Invalid dict settings: <codes>".
func (c *SAMLSettings) Validate(spOnly bool) error {
	var errs []string
	single := c.secBool("allowSingleLabelDomains")
	if !spOnly {
		if len(c.IdP) == 0 {
			errs = append(errs, "idp_not_found")
		} else {
			if c.idpStr("entity_id") == "" {
				errs = append(errs, "idp_entityId_not_found")
			}
			if u := c.idpStr("url"); u == "" {
				errs = append(errs, "idp_sso_not_found")
			} else if !validURL(u, single) {
				errs = append(errs, "idp_sso_url_invalid")
			}
			if u := c.idpStr("slo_url"); u != "" && !validURL(u, single) {
				errs = append(errs, "idp_slo_url_invalid")
			}
			hasCert := c.idpStr("x509cert") != "" || truthy(c.IdP["x509certMulti"])
			if (c.secBool("wantAssertionsSigned") || c.secBool("wantMessagesSigned")) && !hasCert {
				errs = append(errs, "idp_cert_or_fingerprint_not_found_and_required")
			}
			if c.secBool("nameIdEncrypted") && !hasCert {
				errs = append(errs, "idp_cert_not_found_and_required")
			}
		}
	}
	if c.SPEntityID == "" {
		errs = append(errs, "sp_entityId_not_found")
	}
	if u, _ := c.acs(); u == "" {
		errs = append(errs, "sp_acs_not_found")
	} else if !validURL(u, single) {
		errs = append(errs, "sp_acs_url_invalid")
	}
	errs = append(errs, attributeConsumingServiceErrors(c.SPExtra["attributeConsumingService"])...)
	needCert := c.secBool("authnRequestsSigned") || c.secBool("logoutRequestSigned") || c.secBool("logoutResponseSigned") || c.secBool("wantAssertionsEncrypted") || c.secBool("wantNameIdEncrypted")
	if needCert && (strings.TrimSpace(c.SPCert) == "" || strings.TrimSpace(c.SPKey) == "") {
		errs = append(errs, "sp_cert_not_found_and_required")
	}
	for _, ct := range []map[string]any{c.Technical, c.Support} {
		if str(ct, "givenName") == "" || str(ct, "emailAddress") == "" {
			errs = append(errs, "contact_not_enought_data")
			break
		}
	}
	for _, o := range c.OrgInfo {
		if o.Name == "" || o.DisplayName == "" || o.URL == "" {
			errs = append(errs, "organization_not_enought_data")
			break
		}
	}
	if len(errs) > 0 {
		return errors.New("Invalid dict settings: " + strings.Join(errs, ","))
	}
	return nil
}

// certBody is format_cert without headers: the base64 on one line.
func certBody(cert string) string {
	s := strings.NewReplacer("\r", "", "\n", "", " ", "").Replace(cert)
	s = strings.ReplaceAll(s, "-----BEGINCERTIFICATE-----", "")
	s = strings.ReplaceAll(s, "-----ENDCERTIFICATE-----", "")
	return s
}

func parseCert(cert string) (*x509.Certificate, error) {
	der, err := base64.StdEncoding.DecodeString(certBody(cert))
	if err != nil {
		return nil, err
	}
	return x509.ParseCertificate(der)
}

func parseKey(key string) (*rsa.PrivateKey, error) {
	block, _ := pem.Decode([]byte(key))
	var der []byte
	if block != nil {
		der = block.Bytes
	} else {
		s := strings.NewReplacer("\r", "", "\n", "", " ", "").Replace(key)
		for _, h := range []string{"-----BEGINRSAPRIVATEKEY-----", "-----ENDRSAPRIVATEKEY-----", "-----BEGINPRIVATEKEY-----", "-----ENDPRIVATEKEY-----"} {
			s = strings.ReplaceAll(s, h, "")
		}
		var err error
		if der, err = base64.StdEncoding.DecodeString(s); err != nil {
			return nil, err
		}
	}
	if k, err := x509.ParsePKCS1PrivateKey(der); err == nil {
		return k, nil
	}
	k, err := x509.ParsePKCS8PrivateKey(der)
	if err != nil {
		return nil, err
	}
	rk, ok := k.(*rsa.PrivateKey)
	if !ok {
		return nil, errors.New("the SP private key is not an RSA key")
	}
	return rk, nil
}

// UniqueID is generate_unique_id.
func UniqueID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	sum := sha1.Sum([]byte(hex.EncodeToString(b)))
	return "ONELOGIN_" + hex.EncodeToString(sum[:])
}

func samlTime(t time.Time) string { return t.UTC().Format("2006-01-02T15:04:05Z") }

// providerName is the en-US (else first) display name.
func (c *SAMLSettings) providerName() string {
	if len(c.OrgInfo) == 0 {
		return ""
	}
	pick := c.OrgInfo[0]
	langs := make([]OrgLang, len(c.OrgInfo))
	copy(langs, c.OrgInfo)
	sort.Slice(langs, func(i, j int) bool { return langs[i].Lang < langs[j].Lang })
	pick = langs[0]
	for _, o := range c.OrgInfo {
		if o.Lang == "en-US" {
			pick = o
		}
	}
	return pick.DisplayName
}

// AuthnRequest is the request XML and its ID.
func (c *SAMLSettings) AuthnRequest(now time.Time) (string, string) {
	id := UniqueID()
	provider := ""
	if pn := c.providerName(); pn != "" {
		provider = "\n" + `    ProviderName="` + pn + `"`
	}
	acsURL, acsBinding := c.acs()
	attrCS := ""
	if m, ok := c.SPExtra["attributeConsumingService"].(map[string]any); ok && len(m) > 0 {
		idx := "1"
		if v, ok := m["index"]; ok {
			idx = PyStr(v)
		}
		attrCS = "\n" + `    AttributeConsumingServiceIndex="` + idx + `"`
	}
	format := c.nameIDFormat()
	if c.secBool("wantNameIdEncrypted") {
		format = nameIDEncrypted
	}
	policy := "\n    <samlp:NameIDPolicy\n        Format=\"" + format + "\"\n        AllowCreate=\"true\" />"
	rac := ""
	switch v := c.sec("requestedAuthnContext").(type) {
	case bool:
		if v {
			rac = "    <samlp:RequestedAuthnContext Comparison=\"" + PyStr(c.sec("requestedAuthnContextComparison")) + "\">\n        <saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml:AuthnContextClassRef>\n    </samlp:RequestedAuthnContext>"
		}
	case []any:
		rac = `     <samlp:RequestedAuthnContext Comparison="` + PyStr(c.sec("requestedAuthnContextComparison")) + `">`
		for _, x := range v {
			rac += "<saml:AuthnContextClassRef>" + PyStr(x) + "</saml:AuthnContextClassRef>"
		}
		rac += "    </samlp:RequestedAuthnContext>"
	default:
		if v != nil {
			rac = "    <samlp:RequestedAuthnContext Comparison=\"" + PyStr(c.sec("requestedAuthnContextComparison")) + "\">\n        <saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml:AuthnContextClassRef>\n    </samlp:RequestedAuthnContext>"
		}
	}
	x := "<samlp:AuthnRequest\n" +
		"  xmlns:samlp=\"urn:oasis:names:tc:SAML:2.0:protocol\"\n" +
		"  xmlns:saml=\"urn:oasis:names:tc:SAML:2.0:assertion\"\n" +
		"  ID=\"" + id + "\"\n" +
		"  Version=\"2.0\"" + provider + "\n" +
		"  IssueInstant=\"" + samlTime(now) + "\"\n" +
		"  Destination=\"" + c.idpStr("url") + "\"\n" +
		"  ProtocolBinding=\"" + acsBinding + "\"\n" +
		"  AssertionConsumerServiceURL=\"" + acsURL + "\"" + attrCS + ">\n" +
		"    <saml:Issuer>" + c.SPEntityID + "</saml:Issuer>" + policy + "\n" +
		rac + "\n" +
		"</samlp:AuthnRequest>"
	return x, id
}

var redirectRe = regexp.MustCompile(`(?i)^https?://`)

var sigAlgs = map[string]crypto.Hash{
	"http://www.w3.org/2000/09/xmldsig#rsa-sha1":        crypto.SHA1,
	"http://www.w3.org/2001/04/xmldsig-more#rsa-sha256": crypto.SHA256,
	"http://www.w3.org/2001/04/xmldsig-more#rsa-sha384": crypto.SHA384,
	"http://www.w3.org/2001/04/xmldsig-more#rsa-sha512": crypto.SHA512,
}

// LoginURL is OneLogin_Saml2_Auth.login: the IdP URL with the deflated
// request and the RelayState, signed when authnRequestsSigned is on.
func (c *SAMLSettings) LoginURL(relayState string, now time.Time) (string, string, error) {
	req, id := c.AuthnRequest(now)
	var buf bytes.Buffer
	w, _ := flate.NewWriter(&buf, 6)
	w.Write([]byte(req))
	w.Close()
	samlReq := base64.StdEncoding.EncodeToString(buf.Bytes())
	q := "SAMLRequest=" + quotePlus(samlReq) + "&RelayState=" + quotePlus(relayState)
	if c.secBool("authnRequestsSigned") {
		alg := PyStr(c.sec("signatureAlgorithm"))
		key, err := parseKey(c.SPKey)
		if err != nil || strings.TrimSpace(c.SPKey) == "" {
			return "", "", errors.New("Trying to sign the SAMLRequest but can't load the SP private key.")
		}
		h, ok := sigAlgs[alg]
		if !ok {
			h = crypto.SHA256
		}
		signed := q + "&SigAlg=" + quotePlus(alg)
		d := h.New()
		d.Write([]byte(signed))
		sig, err := rsa.SignPKCS1v15(rand.Reader, key, h, d.Sum(nil))
		if err != nil {
			return "", "", err
		}
		q += "&Signature=" + quotePlus(base64.StdEncoding.EncodeToString(sig)) + "&SigAlg=" + quotePlus(alg)
	}
	target := c.idpStr("url")
	if !redirectRe.MatchString(target) {
		return "", "", fmt.Errorf("Redirect to invalid URL: %s", target)
	}
	sep := "?"
	if strings.Contains(target, "?") {
		sep = "&"
	}
	return target + sep + q, id, nil
}

// Metadata is the SP metadata, as lxml printed it.
func (c *SAMLSettings) Metadata(now time.Time) (string, error) {
	if err := c.Validate(true); err != nil {
		return "", err
	}
	if c.secBool("signMetadata") {
		return "", errors.New("signing the SP metadata is not supported")
	}
	attrs := ""
	switch v := c.sec("metadataValidUntil").(type) {
	case nil:
		attrs += ` validUntil="` + samlTime(now.Add(172800*time.Second)) + `"`
	case string:
		if v != "" {
			attrs += ` validUntil="` + v + `"`
		}
	}
	cache := "P10D"
	switch v := c.sec("metadataCacheDuration").(type) {
	case nil:
		cache = "PT604800S"
	case string:
		cache = v
	}
	if cache != "" {
		attrs += ` cacheDuration="` + cache + `"`
	}
	if v, ok := c.sec("metadataValidUntil").(string); ok && v != "" {
		if t, err := parseSAMLTime(v); err == nil && t < now.Unix() {
			return "", errors.New("['expired_xml']")
		}
	}
	acsURL, acsBinding := c.acs()
	var b strings.Builder
	b.WriteString(`<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata"` + attrs + ` entityID="` + c.SPEntityID + `">` + "\n")
	b.WriteString(`    <md:SPSSODescriptor AuthnRequestsSigned="` + pyBoolLower(c.secBool("authnRequestsSigned")) + `" WantAssertionsSigned="` + pyBoolLower(c.secBool("wantAssertionsSigned")) + `" protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">` + "\n        ")
	if body := certBody(c.SPCert); body != "" {
		kd := func(use string) string {
			return `<md:KeyDescriptor use="` + use + `"><ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><ds:X509Data><ds:X509Certificate>` + body + `</ds:X509Certificate></ds:X509Data></ds:KeyInfo></md:KeyDescriptor>`
		}
		b.WriteString(kd("signing"))
		if c.secBool("wantNameIdEncrypted") || c.secBool("wantAssertionsEncrypted") {
			b.WriteString(kd("encryption"))
		}
	}
	b.WriteString(`<md:NameIDFormat>` + c.nameIDFormat() + `</md:NameIDFormat>` + "\n")
	b.WriteString(`        <md:AssertionConsumerService Binding="` + acsBinding + `" Location="` + acsURL + `" index="1"/>` + "\n")
	b.WriteString(c.attributeConsumingService())
	b.WriteString("    </md:SPSSODescriptor>\n")
	if len(c.OrgInfo) > 0 {
		b.WriteString("    <md:Organization>\n")
		var lines []string
		for _, o := range c.OrgInfo {
			lines = append(lines, `        <md:OrganizationName xml:lang="`+o.Lang+`">`+o.Name+`</md:OrganizationName>`)
		}
		for _, o := range c.OrgInfo {
			lines = append(lines, `        <md:OrganizationDisplayName xml:lang="`+o.Lang+`">`+o.DisplayName+`</md:OrganizationDisplayName>`)
		}
		for _, o := range c.OrgInfo {
			lines = append(lines, `        <md:OrganizationURL xml:lang="`+o.Lang+`">`+o.URL+`</md:OrganizationURL>`)
		}
		b.WriteString(strings.Join(lines, "\n") + "\n    </md:Organization>\n")
	} else {
		b.WriteString("\n")
	}
	var contacts []string
	for _, ct := range []struct {
		typ string
		m   map[string]any
	}{{"technical", c.Technical}, {"support", c.Support}} {
		contacts = append(contacts, `    <md:ContactPerson contactType="`+ct.typ+`">`+"\n        <md:GivenName>"+str(ct.m, "givenName")+"</md:GivenName>\n        <md:EmailAddress>"+str(ct.m, "emailAddress")+"</md:EmailAddress>\n    </md:ContactPerson>")
	}
	b.WriteString(strings.Join(contacts, "\n") + "\n</md:EntityDescriptor>")
	return b.String(), nil
}

// attributeConsumingService is SP_EXTRA's attributeConsumingService as
// OneLogin_Saml2_Metadata.builder wrote it into the SPSSODescriptor, after
// the AssertionConsumerService, and lxml printed it ("" when there is
// none). Validate has checked its shape.
func (c *SAMLSettings) attributeConsumingService() string {
	m, ok := c.SPExtra["attributeConsumingService"].(map[string]any)
	if !ok || len(m) == 0 {
		return ""
	}
	desc := ""
	if v, ok := m["serviceDescription"]; ok {
		desc = `            <md:ServiceDescription xml:lang="en">` + PyStr(v) + "</md:ServiceDescription>\n"
	}
	list, _ := m["requestedAttributes"].([]any)
	reqs := make([]string, 0, len(list))
	for _, x := range list {
		ra, _ := x.(map[string]any)
		s := `            <md:RequestedAttribute Name="` + PyStr(ra["name"]) + `"`
		if truthy(ra["nameFormat"]) {
			s += ` NameFormat="` + PyStr(ra["nameFormat"]) + `"`
		}
		if truthy(ra["friendlyName"]) {
			s += ` FriendlyName="` + PyStr(ra["friendlyName"]) + `"`
		}
		if truthy(ra["isRequired"]) {
			s += ` isRequired="true"`
		}
		if vals, _ := ra["attributeValue"].([]any); len(vals) > 0 {
			s += ">"
			for _, v := range vals {
				s += "\n" + `                <saml:AttributeValue xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">` + PyStr(v) + "</saml:AttributeValue>"
			}
			s += "\n            </md:RequestedAttribute>"
		} else {
			s += "/>"
		}
		reqs = append(reqs, s)
	}
	idx := "1"
	if v, ok := m["index"]; ok {
		idx = PyStr(v)
	}
	return `        <md:AttributeConsumingService index="` + idx + `">` + "\n" +
		`            <md:ServiceName xml:lang="en">` + PyStr(m["serviceName"]) + "</md:ServiceName>\n" +
		desc + strings.Join(reqs, "\n") + "\n        </md:AttributeConsumingService>\n"
}

// attributeConsumingServiceErrors is check_sp_settings' check of SP_EXTRA's
// attributeConsumingService, its slips included: requestedAttributes that
// is not a list reports serviceName_type_invalid, and an error repeats for
// each attribute that has it.
func attributeConsumingServiceErrors(v any) []string {
	if !truthy(v) {
		return nil
	}
	const p = "sp_attributeConsumingService_"
	m, _ := v.(map[string]any)
	var errs []string
	if sn, ok := m["serviceName"]; !ok {
		errs = append(errs, p+"serviceName_not_found")
	} else if _, ok := sn.(string); !ok {
		errs = append(errs, p+"serviceName_type_invalid")
	}
	if ra, ok := m["requestedAttributes"]; !ok {
		errs = append(errs, p+"requestedAttributes_not_found")
	} else if list, ok := ra.([]any); !ok {
		errs = append(errs, p+"serviceName_type_invalid")
	} else {
		for _, x := range list {
			a, _ := x.(map[string]any)
			name, hasName := a["name"]
			if !hasName {
				errs = append(errs, p+"requestedAttributes_name_not_found")
			} else if s, ok := name.(string); ok && strings.TrimSpace(s) == "" {
				errs = append(errs, p+"requestedAttributes_name_invalid")
			}
			if av, ok := a["attributeValue"]; ok {
				if _, isList := av.([]any); !isList {
					errs = append(errs, p+"requestedAttributes_attributeValue_type_invalid")
				}
			}
			if ir, ok := a["isRequired"]; ok {
				if _, isBool := ir.(bool); !isBool {
					errs = append(errs, p+"requestedAttributes_isRequired_type_invalid")
				}
			}
		}
	}
	if sd, ok := m["serviceDescription"]; ok {
		if _, ok := sd.(string); !ok {
			errs = append(errs, p+"serviceDescription_type_invalid")
		}
	}
	return errs
}

func pyBoolLower(b bool) string {
	if b {
		return "true"
	}
	return "false"
}

var samlTimeRe = regexp.MustCompile(`^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(\.\d+)?Z?$`)

// parseSAMLTime is parse_SAML_to_time, in whole seconds.
func parseSAMLTime(s string) (int64, error) {
	m := samlTimeRe.FindStringSubmatch(s)
	if m == nil {
		return 0, fmt.Errorf("time data '%s' does not match format '%%Y-%%m-%%dT%%H:%%M:%%SZ'", s)
	}
	t, err := time.Parse("2006-01-02T15:04:05", m[1])
	if err != nil {
		return 0, fmt.Errorf("time data '%s' does not match format '%%Y-%%m-%%dT%%H:%%M:%%SZ'", s)
	}
	return t.Unix(), nil
}

// ---------------------------------------------------------------- responses

// SAMLResult is what a valid response gave.
type SAMLResult struct {
	// Attributes are by Name, values in order ({"NameID": ...} for nested
	// NameIDs), plus "name_id".
	Attributes     map[string][]any
	AttributeOrder []string
	NameID         any
	SessionIndex   any
	InResponseTo   string
	// SolicitedSigned reports that InResponseTo is covered by a signature:
	// the Response is signed, or a bearer SubjectConfirmationData of the
	// signed assertion names the same request. With only the assertion
	// signed, the Response's InResponseTo is anyone's to add.
	SolicitedSigned bool
	// AssertionID and ValidUntil (Unix seconds, clock drift included)
	// let the caller refuse an assertion it has already accepted.
	AssertionID string
	ValidUntil  int64
}

// lenientB64 is base64 decoding that drops what is not the alphabet.
func lenientB64(s string) ([]byte, error) {
	var b strings.Builder
	for _, r := range s {
		if (r >= 'A' && r <= 'Z') || (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '+' || r == '/' {
			b.WriteRune(r)
		}
	}
	t := b.String()
	for len(t)%4 != 0 {
		t += "="
	}
	return base64.StdEncoding.DecodeString(t)
}

func parseXML(b []byte) (*etree.Document, error) {
	low := bytes.ToLower(b)
	if bytes.Contains(low, []byte("<!doctype")) || bytes.Contains(low, []byte("<!entity")) {
		return nil, errors.New("Detected use of DTD/ENTITY in XML, disabled to prevent XXE/XEE attacks")
	}
	doc := etree.NewDocument()
	if err := doc.ReadFromBytes(b); err != nil {
		return nil, err
	}
	if doc.Root() == nil {
		return nil, errors.New("Document is empty, line 1, column 1 (<string>, line 1)")
	}
	return doc, nil
}

func is(el *etree.Element, ns, tag string) bool {
	return el != nil && el.Tag == tag && el.NamespaceURI() == ns
}

func children(el *etree.Element, ns, tag string) []*etree.Element {
	var out []*etree.Element
	if el == nil {
		return out
	}
	for _, c := range el.ChildElements() {
		if is(c, ns, tag) {
			out = append(out, c)
		}
	}
	return out
}

func child(el *etree.Element, ns, tag string) *etree.Element {
	l := children(el, ns, tag)
	if len(l) == 0 {
		return nil
	}
	return l[0]
}

// descendants is //ns:tag below (and including) el.
func descendants(el *etree.Element, ns, tag string) []*etree.Element {
	var out []*etree.Element
	var walk func(e *etree.Element)
	walk = func(e *etree.Element) {
		if is(e, ns, tag) {
			out = append(out, e)
		}
		for _, c := range e.ChildElements() {
			walk(c)
		}
	}
	if el != nil {
		walk(el)
	}
	return out
}

func attr(el *etree.Element, name string) (string, bool) {
	if el == nil {
		return "", false
	}
	a := el.SelectAttr(name)
	if a == nil || a.Space != "" {
		for _, x := range el.Attr {
			if x.Key == name && x.Space == "" {
				return x.Value, true
			}
		}
		return "", false
	}
	return a.Value, true
}

// elementText is element_text: the text before the first child, comments
// aside.
func elementText(el *etree.Element) (string, bool) {
	var b strings.Builder
	found := false
	for _, t := range el.Child {
		switch x := t.(type) {
		case *etree.CharData:
			b.WriteString(x.Data)
			found = true
		case *etree.Comment:
			continue
		default:
			return b.String(), found
		}
	}
	return b.String(), found
}

func lxmlTag(el *etree.Element) string { return "{" + el.NamespaceURI() + "}" + el.Tag }

// samlResponse is a parsed response.
type samlResponse struct {
	doc       *etree.Document // as received
	dec       *etree.Document // with the assertion decrypted (or doc)
	encrypted bool
	c         *SAMLSettings
	// responseSigned is set by isValid when the Response element itself
	// carries a verified signature (its InResponseTo is then signed).
	responseSigned bool
}

func (r *samlResponse) root() *etree.Element    { return r.doc.Root() }
func (r *samlResponse) decRoot() *etree.Element { return r.dec.Root() }

// ResponseInResponseTo reads InResponseTo before any validation ("" when
// the response cannot be read).
func ResponseInResponseTo(b64 string) string {
	b, err := lenientB64(b64)
	if err != nil {
		return ""
	}
	// Only the root element's attribute is wanted: read up to its start
	// tag rather than building the whole tree, which ProcessResponse then
	// builds once (an unauthenticated request must not pay for two).
	dec := xml.NewDecoder(bytes.NewReader(b))
	for {
		tok, err := dec.Token()
		if err != nil {
			return ""
		}
		if se, ok := tok.(xml.StartElement); ok {
			for _, a := range se.Attr {
				if a.Name.Local == "InResponseTo" && a.Name.Space == "" {
					return a.Value
				}
			}
			return ""
		}
	}
}

type encryptedData struct {
	XMLName          xml.Name
	EncryptionMethod samltypes.EncryptionMethod `xml:"EncryptedData>EncryptionMethod"`
	EncryptedKey     samltypes.EncryptedKey     `xml:"EncryptedData>KeyInfo>EncryptedKey"`
	DetEncryptedKey  samltypes.EncryptedKey     `xml:"EncryptedKey"`
	CipherValue      string                     `xml:"EncryptedData>CipherData>CipherValue"`
}

// decrypt decrypts an EncryptedAssertion or EncryptedID element.
func (c *SAMLSettings) decrypt(el *etree.Element) (*etree.Element, error) {
	key, err := parseKey(c.SPKey)
	if err != nil || strings.TrimSpace(c.SPKey) == "" {
		return nil, errors.New("No private key available to decrypt the assertion, check settings")
	}
	cert, err := parseCert(c.SPCert)
	if err != nil {
		return nil, err
	}
	d := etree.NewDocument()
	d.SetRoot(el.Copy())
	raw, err := d.WriteToBytes()
	if err != nil {
		return nil, err
	}
	var ed encryptedData
	if err := xml.Unmarshal(raw, &ed); err != nil {
		return nil, err
	}
	ea := &samltypes.EncryptedAssertion{EncryptionMethod: ed.EncryptionMethod, EncryptedKey: ed.EncryptedKey, DetEncryptedKey: ed.DetEncryptedKey, CipherValue: ed.CipherValue}
	plain, err := ea.DecryptBytes(&tls.Certificate{Certificate: [][]byte{cert.Raw}, PrivateKey: key})
	if err != nil {
		return nil, err
	}
	pd, err := parseXML(plain)
	if err != nil {
		return nil, err
	}
	return pd.Root(), nil
}

func newSAMLResponse(c *SAMLSettings, b64 string) (*samlResponse, error) {
	b, err := lenientB64(b64)
	if err != nil {
		return nil, err
	}
	doc, err := parseXML(b)
	if err != nil {
		return nil, err
	}
	r := &samlResponse{doc: doc, dec: doc, c: c}
	if encs := descendants(doc.Root(), nsSAML, "EncryptedAssertion"); len(encs) > 0 {
		r.encrypted = true
		dec := doc.Copy()
		ea := descendants(dec.Root(), nsSAML, "EncryptedAssertion")[0]
		plain, err := c.decrypt(ea)
		if err != nil {
			return nil, err
		}
		parent := ea.Parent()
		idx := ea.Index()
		parent.RemoveChildAt(idx)
		parent.InsertChildAt(idx, plain)
		r.dec = dec
	}
	return r, nil
}

// assertion is _query_assertion's target: the signed assertion, or the
// assertion of the signed response, or the one assertion.
func (r *samlResponse) assertion() *etree.Element {
	root := r.decRoot()
	if !is(root, nsSAMLP, "Response") {
		return nil
	}
	assertions := children(root, nsSAML, "Assertion")
	for _, a := range assertions {
		if ref := sigReference(child(a, nsDS, "Signature")); ref != nil {
			uri, _ := attr(ref, "URI")
			id := strings.TrimPrefix(uri, "#")
			if len(uri) > 0 {
				id = uri[1:]
			}
			for _, x := range assertions {
				if v, _ := attr(x, "ID"); v == id {
					return x
				}
			}
			return nil
		}
	}
	if ref := sigReference(child(root, nsDS, "Signature")); ref != nil {
		uri, _ := attr(ref, "URI")
		id := ""
		if len(uri) > 0 {
			id = uri[1:]
		}
		if v, _ := attr(root, "ID"); v != id {
			return nil
		}
	}
	if len(assertions) == 0 {
		return nil
	}
	return assertions[0]
}

func sigReference(sig *etree.Element) *etree.Element {
	return child(child(sig, nsDS, "SignedInfo"), nsDS, "Reference")
}

func (r *samlResponse) inAssertion(path ...string) []*etree.Element {
	cur := []*etree.Element{r.assertion()}
	if cur[0] == nil {
		return nil
	}
	for _, p := range path {
		var next []*etree.Element
		for _, e := range cur {
			next = append(next, children(e, nsSAML, p)...)
		}
		cur = next
	}
	return cur
}

func validationErr(msg string) error { return &samlValidationError{msg} }

type samlValidationError struct{ msg string }

func (e *samlValidationError) Error() string { return e.msg }

// processSignedElements is process_signed_elements.
func (r *samlResponse) processSignedElements() ([]string, error) {
	var signed, ids, seis []string
	for _, sig := range descendants(r.decRoot(), nsDS, "Signature") {
		parent := sig.Parent()
		tag := lxmlTag(parent)
		if !is(parent, nsSAMLP, "Response") && !is(parent, nsSAML, "Assertion") {
			return nil, validationErr(fmt.Sprintf("Invalid Signature Element %s SAML Response rejected", tag))
		}
		id, _ := attr(parent, "ID")
		if id == "" {
			return nil, validationErr("Signed Element must contain an ID. SAML Response rejected")
		}
		for _, x := range ids {
			if x == id {
				return nil, validationErr("Duplicated ID. SAML Response rejected")
			}
		}
		ids = append(ids, id)
		if refs := descendants(sig, nsDS, "Reference"); len(refs) > 0 {
			if uri, _ := attr(refs[0], "URI"); uri != "" {
				sei := uri[1:]
				if sei != id {
					return nil, validationErr("Found an invalid Signed Element. SAML Response rejected")
				}
				for _, x := range seis {
					if x == sei {
						return nil, validationErr("Duplicated Reference URI. SAML Response rejected")
					}
				}
				seis = append(seis, sei)
			}
		}
		signed = append(signed, tag)
	}
	if len(signed) > 0 {
		resp, asrt := "{"+nsSAMLP+"}Response", "{"+nsSAML+"}Assertion"
		count := func(t string) int {
			n := 0
			for _, s := range signed {
				if s == t {
					n++
				}
			}
			return n
		}
		ok := len(signed) <= 2 && count(resp) <= 1 && count(asrt) <= 1 && (count(resp) > 0 || count(asrt) > 0)
		if ok && count(resp) > 0 && len(children(r.root(), nsDS, "Signature")) != 1 {
			return nil, validationErr("Unexpected number of Response signatures found. SAML Response rejected.")
		}
		if ok && count(asrt) > 0 {
			n := 0
			for _, a := range children(r.decRoot(), nsSAML, "Assertion") {
				n += len(children(a, nsDS, "Signature"))
			}
			if n != 1 {
				return nil, validationErr("Unexpected number of Assertion signatures found. SAML Response rejected.")
			}
		}
		if !ok {
			return nil, validationErr("Found an unexpected Signature Element. SAML Response rejected")
		}
	}
	return signed, nil
}

// verifySignature checks el's enveloped signature against the IdP's
// certificate only, whatever KeyInfo says and whenever the certificate
// expires, as xmlsec did.
func (r *samlResponse) verifySignature(el *etree.Element) bool {
	// The IdP's signing certificates: x509cert, and every one listed under
	// x509certMulti's "signing" (a key rollover), as python3-saml took them.
	var certs []*x509.Certificate
	if c, err := parseCert(r.c.idpStr("x509cert")); err == nil {
		certs = append(certs, c)
	}
	if multi, ok := r.c.IdP["x509certMulti"].(map[string]any); ok {
		if list, ok := multi["signing"].([]any); ok {
			for _, v := range list {
				if pem, ok := v.(string); ok {
					if c, err := parseCert(pem); err == nil {
						certs = append(certs, c)
					}
				}
			}
		}
	}
	if len(certs) == 0 {
		return false
	}
	if r.c.secBool("rejectDeprecatedAlgorithm") {
		for _, sig := range children(el, nsDS, "Signature") {
			for _, si := range children(sig, nsDS, "SignedInfo") {
				for _, m := range children(si, nsDS, "SignatureMethod") {
					if a, _ := attr(m, "Algorithm"); deprecatedAlgorithms[a] {
						return false
					}
				}
				for _, ref := range children(si, nsDS, "Reference") {
					for _, d := range children(ref, nsDS, "DigestMethod") {
						if a, _ := attr(d, "Algorithm"); deprecatedAlgorithms[a] {
							return false
						}
					}
				}
			}
		}
	}
	for _, cert := range certs {
		if r.verifyWith(el, cert) {
			return true
		}
	}
	return false
}

// verifyWith checks el's signature against one pinned certificate.
func (r *samlResponse) verifyWith(el *etree.Element, cert *x509.Certificate) bool {
	// Detached with the namespaces it inherits, or the assertion's prefix
	// would canonicalize unbound.
	nsCtx, err := etreeutils.NSBuildParentContext(el)
	if err != nil {
		return false
	}
	if el, err = etreeutils.NSDetatch(nsCtx, el); err != nil {
		return false
	}
	for _, sig := range children(el, nsDS, "Signature") {
		for _, ki := range children(sig, nsDS, "KeyInfo") {
			sig.RemoveChild(ki)
		}
	}
	ctx := dsig.NewDefaultValidationContext(&dsig.MemoryX509CertificateStore{Roots: []*x509.Certificate{cert}})
	ctx.Clock = dsig.NewFakeClockAt(cert.NotBefore.Add(time.Second))
	_, err = ctx.Validate(el)
	return err == nil
}

func (r *samlResponse) isValid(requestID, currentURL string, now int64) error {
	root := r.root()
	if v, _ := attr(root, "Version"); v != "2.0" {
		return validationErr("Unsupported SAML version")
	}
	if _, ok := attr(root, "ID"); !ok {
		return validationErr("Missing ID attribute on SAML Response")
	}
	// check_status.
	status := child(root, nsSAMLP, "Status")
	if status == nil {
		return validationErr("Missing Status on response")
	}
	code := child(status, nsSAMLP, "StatusCode")
	if code == nil {
		return validationErr("Missing Status Code on response")
	}
	if cv, _ := attr(code, "Value"); cv != "" && cv != statusSuccess {
		parts := strings.Split(cv, ":")
		msg := "The status code of the Response was not Success, was " + parts[len(parts)-1]
		detail := ""
		if sm := child(status, nsSAMLP, "StatusMessage"); sm != nil {
			detail, _ = elementText(sm)
		} else if sub := child(code, nsSAMLP, "StatusCode"); sub != nil {
			detail, _ = attr(sub, "Value")
		}
		if detail != "" {
			msg += " -> " + detail
		}
		return validationErr(msg)
	}
	n := len(descendants(root, nsSAML, "EncryptedAssertion")) + len(descendants(root, nsSAML, "Assertion"))
	valid := n == 1
	if r.encrypted {
		valid = valid && len(descendants(r.decRoot(), nsSAML, "Assertion")) == 1
	}
	if !valid {
		return validationErr("SAML Response must contain 1 assertion")
	}
	signed, err := r.processSignedElements()
	if err != nil {
		return err
	}
	hasResp, hasAssert := false, false
	for _, s := range signed {
		if s == "{"+nsSAMLP+"}Response" {
			hasResp = true
		}
		if s == "{"+nsSAML+"}Assertion" {
			hasAssert = true
		}
	}
	r.responseSigned = hasResp
	irt, hasIRT := attr(root, "InResponseTo")
	if hasIRT && requestID != "" && irt != requestID {
		return validationErr(fmt.Sprintf("The InResponseTo of the Response: %s, does not match the ID of the AuthNRequest sent by the SP: %s", irt, requestID))
	}
	if !r.encrypted && r.c.secBool("wantAssertionsEncrypted") {
		return validationErr("The assertion of the Response is not encrypted and the SP require it")
	}
	if r.c.secBool("wantNameIdEncrypted") {
		ok := false
		for _, s := range r.inAssertion("Subject") {
			for _, e := range children(s, nsSAML, "EncryptedID") {
				if len(children(e, nsXENC, "EncryptedData")) == 1 {
					ok = true
				}
			}
		}
		if !ok {
			return validationErr("The NameID of the Response is not encrypted and the SP require it")
		}
	}
	conds := r.inAssertion("Conditions")
	if len(conds) != 1 {
		return validationErr("The Assertion must include a Conditions element")
	}
	for _, cn := range conds {
		if nb, ok := attr(cn, "NotBefore"); ok && nb != "" {
			t, err := parseSAMLTime(nb)
			if err != nil {
				return validationErr(err.Error())
			}
			if t > now+clockDrift {
				return validationErr("Could not validate timestamp: not yet valid. Check system clock.")
			}
		}
		if na, ok := attr(cn, "NotOnOrAfter"); ok && na != "" {
			t, err := parseSAMLTime(na)
			if err != nil {
				return validationErr(err.Error())
			}
			if t+clockDrift <= now {
				return validationErr("Could not validate timestamp: expired. Check system clock.")
			}
		}
	}
	authn := r.inAssertion("AuthnStatement")
	if len(authn) != 1 {
		return validationErr("The Assertion must include an AuthnStatement element")
	}
	if req, ok := r.c.sec("requestedAuthnContext").([]any); ok && len(req) > 0 && r.c.secBool("failOnAuthnContextMismatch") {
		want := map[string]bool{}
		var wl []string
		for _, x := range req {
			want[PyStr(x)] = true
			wl = append(wl, PyStr(x))
		}
		var bad []string
		for _, cr := range r.inAssertion("AuthnStatement", "AuthnContext", "AuthnContextClassRef") {
			t, _ := elementText(cr)
			if !want[t] {
				bad = append(bad, t)
			}
		}
		if len(bad) > 0 {
			return validationErr(fmt.Sprintf(`The AuthnContext "%s" was not a requested context "%s"`, strings.Join(bad, ", "), strings.Join(wl, ", ")))
		}
	}
	attrStatements := r.inAssertion("AttributeStatement")
	if r.c.secBool("wantAttributeStatement") && len(attrStatements) == 0 {
		return validationErr("There is no AttributeStatement on the Response")
	}
	if len(r.inAssertion("AttributeStatement", "EncryptedAttribute")) > 0 {
		return validationErr("There is an EncryptedAttribute in the Response and this SP not support them")
	}
	if dest, ok := attr(root, "Destination"); ok {
		if dest == "" {
			return validationErr("The response has an empty Destination value")
		}
		if !strings.HasPrefix(normalizeURL(dest), normalizeURL(currentURL)) {
			return validationErr(fmt.Sprintf("The response was received at %s instead of %s", currentURL, dest))
		}
	}
	var audiences []string
	for _, a := range r.inAssertion("Conditions", "AudienceRestriction", "Audience") {
		if t, ok := elementText(a); ok && t != "" {
			audiences = append(audiences, t)
		}
	}
	if len(audiences) > 0 {
		found := false
		for _, a := range audiences {
			if a == r.c.SPEntityID {
				found = true
			}
		}
		if !found {
			return validationErr(fmt.Sprintf("%s is not a valid audience for this Response", r.c.SPEntityID))
		}
	}
	// get_issuers.
	var issuers []string
	if mi := children(root, nsSAML, "Issuer"); len(mi) > 1 {
		return validationErr("Issuer of the Response is multiple.")
	} else if len(mi) == 1 {
		if t, _ := elementText(mi[0]); t != "" {
			issuers = append(issuers, t)
		}
	}
	ai := r.inAssertion("Issuer")
	if len(ai) != 1 {
		return validationErr("Issuer of the Assertion not found or multiple.")
	}
	if t, _ := elementText(ai[0]); t != "" {
		issuers = append(issuers, t)
	}
	idpEntity := r.c.idpStr("entity_id")
	for _, is := range issuers {
		if is != idpEntity {
			return validationErr(fmt.Sprintf("Invalid issuer in the Assertion/Response (expected %s, got %s)", idpEntity, is))
		}
	}
	for _, a := range authn {
		if v, ok := attr(a, "SessionNotOnOrAfter"); ok {
			t, err := parseSAMLTime(v)
			if err != nil {
				return validationErr(err.Error())
			}
			if t+clockDrift <= now {
				return validationErr("The attributes have expired, based on the SessionNotOnOrAfter of the AttributeStatement of this Response")
			}
			break
		}
	}
	anySC := false
	for _, sc := range r.inAssertion("Subject", "SubjectConfirmation") {
		if m, ok := attr(sc, "Method"); ok && m != "" && m != cmBearer {
			continue
		}
		scd := child(sc, nsSAML, "SubjectConfirmationData")
		if scd == nil {
			continue
		}
		if v, ok := attr(scd, "InResponseTo"); ok && v != "" && irt != "" && v != irt {
			continue
		}
		if v, ok := attr(scd, "Recipient"); ok && v != "" && !strings.Contains(v, currentURL) {
			continue
		}
		if v, ok := attr(scd, "NotOnOrAfter"); ok && v != "" {
			t, err := parseSAMLTime(v)
			if err != nil {
				return validationErr(err.Error())
			}
			if t+clockDrift <= now {
				continue
			}
		}
		if v, ok := attr(scd, "NotBefore"); ok && v != "" {
			t, err := parseSAMLTime(v)
			if err != nil {
				return validationErr(err.Error())
			}
			if t > now+clockDrift {
				continue
			}
		}
		anySC = true
		break
	}
	if !anySC {
		return validationErr("A valid SubjectConfirmation was not found on this Response")
	}
	if r.c.secBool("wantAssertionsSigned") && !hasAssert {
		return validationErr("The Assertion of the Response is not signed and the SP require it")
	}
	if r.c.secBool("wantMessagesSigned") && !hasResp {
		return validationErr("The Message of the Response is not signed and the SP require it")
	}
	if len(signed) == 0 || (!hasResp && !hasAssert) {
		return validationErr("No Signature found. SAML Response rejected")
	}
	if hasResp && !r.verifySignature(r.root()) {
		return validationErr("Signature validation failed. SAML Response rejected")
	}
	if hasAssert {
		var signedAssertion *etree.Element
		for _, a := range children(r.decRoot(), nsSAML, "Assertion") {
			if child(a, nsDS, "Signature") != nil {
				signedAssertion = a
			}
		}
		if signedAssertion == nil || !r.verifySignature(signedAssertion) {
			return validationErr("Signature validation failed. SAML Response rejected")
		}
	}
	return nil
}

// normalizeURL lower-cases the scheme and host.
func normalizeURL(u string) string {
	scheme, rest, ok := strings.Cut(u, "://")
	if !ok {
		return u
	}
	host, path, _ := strings.Cut(rest, "/")
	out := strings.ToLower(scheme) + "://" + strings.ToLower(host)
	if strings.Contains(rest, "/") {
		out += "/" + path
	}
	return out
}

// attributes is _get_attributes(by).
func (r *samlResponse) attributes(by string) (map[string][]any, []string, error) {
	out := map[string][]any{}
	var order []string
	for _, a := range r.inAssertion("AttributeStatement", "Attribute") {
		key, _ := attr(a, by)
		if key == "" {
			continue
		}
		if _, dup := out[key]; dup && !r.c.secBool("allowRepeatAttributeName") {
			return nil, nil, validationErr("Found an Attribute element with duplicated " + by)
		}
		values := []any{}
		for _, v := range children(a, nsSAML, "AttributeValue") {
			if t, ok := elementText(v); ok {
				if t = strings.TrimSpace(t); t != "" {
					values = append(values, t)
				}
			}
			for _, nid := range children(v, nsSAML, "NameID") {
				f, _ := attr(nid, "Format")
				nq, _ := attr(nid, "NameQualifier")
				val, _ := elementText(nid)
				values = append(values, map[string]any{"NameID": map[string]any{"Format": f, "NameQualifier": nq, "value": val}})
			}
		}
		if _, ok := out[key]; !ok {
			order = append(order, key)
		}
		out[key] = append(out[key], values...)
	}
	return out, order, nil
}

// nameID is get_nameid.
func (r *samlResponse) nameID() (any, error) {
	var nameid *etree.Element
	for _, s := range r.inAssertion("Subject") {
		if eid := child(s, nsSAML, "EncryptedID"); eid != nil {
			plain, err := r.c.decrypt(eid)
			if err != nil {
				return nil, err
			}
			nameid = plain
			break
		}
		if nid := child(s, nsSAML, "NameID"); nid != nil {
			nameid = nid
			break
		}
	}
	wantNameID := r.c.secBool("wantNameId")
	if nameid == nil {
		if wantNameID {
			return nil, validationErr("NameID not found in the assertion of the Response")
		}
		return nil, nil
	}
	text, _ := elementText(nameid)
	if wantNameID && text == "" {
		return nil, validationErr("An empty NameID value found")
	}
	if v, ok := attr(nameid, "SPNameQualifier"); ok && v != "" && v != r.c.SPEntityID {
		return nil, validationErr("The SPNameQualifier value mistmatch the SP entityID value.")
	}
	return text, nil
}

// ProcessResponse is process_response for a SAMLResponse: an AuthFailed
// for an invalid response; the extraction errors that escaped it as
// they were.
func (c *SAMLSettings) ProcessResponse(b64, requestID, currentURL string, now time.Time) (*SAMLResult, error) {
	if b64 == "" {
		return nil, AuthFailed("SAML login failed: SAML Response not found, Only supported HTTP_POST Binding")
	}
	r, err := newSAMLResponse(c, b64)
	if err != nil {
		return nil, err
	}
	if err := r.isValid(requestID, currentURL, now.Unix()); err != nil {
		return nil, AuthFailed(fmt.Sprintf("SAML login failed: ['invalid_response'] (%s)", err.Error()))
	}
	attrs, order, err := r.attributes("Name")
	if err != nil {
		return nil, err
	}
	if _, _, err := r.attributes("FriendlyName"); err != nil {
		return nil, err
	}
	nid, err := r.nameID()
	if err != nil {
		return nil, err
	}
	res := &SAMLResult{Attributes: attrs, AttributeOrder: order, NameID: nid}
	for _, a := range r.inAssertion("AuthnStatement") {
		if v, ok := attr(a, "SessionIndex"); ok {
			res.SessionIndex = v
			break
		}
	}
	res.InResponseTo, _ = attr(r.root(), "InResponseTo")
	if res.InResponseTo != "" {
		res.SolicitedSigned = r.responseSigned
		for _, sc := range r.inAssertion("Subject", "SubjectConfirmation") {
			if scd := child(sc, nsSAML, "SubjectConfirmationData"); scd != nil {
				if v, ok := attr(scd, "InResponseTo"); ok && v == res.InResponseTo {
					res.SolicitedSigned = true
				}
			}
		}
	}
	if a := r.assertion(); a != nil {
		res.AssertionID, _ = attr(a, "ID")
	}
	// The assertion is good until the earliest NotOnOrAfter it carries;
	// one that names none is remembered for a day.
	res.ValidUntil = now.Unix() + 24*3600
	var limits []*etree.Element
	limits = append(limits, r.inAssertion("Conditions")...)
	limits = append(limits, r.inAssertion("Subject", "SubjectConfirmation", "SubjectConfirmationData")...)
	for _, el := range limits {
		if v, ok := attr(el, "NotOnOrAfter"); ok && v != "" {
			if t, err := parseSAMLTime(v); err == nil && t+clockDrift < res.ValidUntil {
				res.ValidUntil = t + clockDrift
			}
		}
	}
	return res, nil
}

// ---------------------------------------------------------------- identity

var samlDefaultAttrs = map[string][]string{
	"attr_full_name":         {"urn:oid:2.5.4.3", "http://schemas.xmlsoap.org/claims/CommonName", "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/fullname", "http://schemas.microsoft.com/identity/claims/displayname", "full_name", "fullname", "fullName"},
	"attr_first_name":        {"urn:oid:2.5.4.42", "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname", "first_name", "firstname", "firstName", "given_name", "givenname", "givenName"},
	"attr_last_name":         {"urn:oid:2.5.4.4", "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname", "last_name", "lastname", "lastName", "surname"},
	"attr_username":          {"urn:oid:0.9.2342.19200300.100.1.1", "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name", "subjectNameID", "username"},
	"attr_email":             {"urn:oid:0.9.2342.19200300.100.1.3", "http://schemas.xmlsoap.org/claims/EmailAddress", "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress", "email", "mail"},
	"attr_user_permanent_id": {"urn:oid:0.9.2342.19200300.100.1.1", "name_id"},
}

// GetAttr is AscenderSAMLIdentityProvider.get_attr: nil when nothing
// usable.
func GetAttr(attrs map[string]any, idp map[string]any, idpName, confKey string, warn func(string)) any {
	var key string
	var found bool
	if v, ok := idp[confKey]; ok {
		if v == nil {
			return nil
		}
		key, found = PyStr(v), true
	} else {
		for _, cand := range samlDefaultAttrs[confKey] {
			if _, ok := attrs[cand]; ok {
				key, found = cand, true
				break
			}
		}
	}
	var value any
	if found {
		value = attrs[key]
	}
	if l, ok := value.([]any); ok {
		if len(l) > 0 {
			value = l[0]
		} else {
			value = nil
		}
	}
	if s, ok := value.(string); ok && strings.TrimSpace(s) == "" {
		value = nil
	}
	switch confKey {
	case "attr_first_name", "attr_last_name", "attr_username", "attr_email":
		if value == nil && warn != nil {
			name := key
			if !found {
				name = strings.Join(samlDefaultAttrs[confKey], ", ")
			}
			warn(fmt.Sprintf("Could not map user detail '%s' from SAML attribute '%s'; update SOCIAL_AUTH_SAML_ENABLED_IDPS['%s']['%s'] with the correct SAML attribute.", confKey[5:], name, idpName, confKey))
		}
	}
	if value == nil {
		return nil
	}
	if m, ok := value.(map[string]any); ok {
		return pyDictRepr(m)
	}
	return PyStr(value)
}

// pyDictRepr is str() of a nested NameID dict.
func pyDictRepr(m map[string]any) string {
	var parts []string
	for _, k := range []string{"NameID", "Format", "NameQualifier", "value"} {
		v, ok := m[k]
		if !ok {
			continue
		}
		var s string
		switch t := v.(type) {
		case map[string]any:
			s = pyDictRepr(t)
		case string:
			s = "'" + strings.ReplaceAll(t, "'", `\'`) + "'"
		case nil:
			s = "None"
		default:
			s = PyStr(t)
		}
		parts = append(parts, "'"+k+"': "+s)
	}
	return "{" + strings.Join(parts, ", ") + "}"
}
