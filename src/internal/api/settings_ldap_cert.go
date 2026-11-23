package api

import (
	"context"
	"crypto/x509"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/go-ldap/ldap/v3"

	"github.com/ctrliq/ascender/internal/sso"
)

// LDAP server checks for the LDAP settings form, neither of which the old
// application had: POST /api/v2/settings/ldap/certificate/ reads the chain
// an LDAP server presents (for AUTH_LDAP_CA_CERT, also new), and POST
// /api/v2/settings/ldap/test/ connects and binds with a server's settings
// as the form holds them.

// ldapCertTimeout bounds the connection and TLS handshake.
const ldapCertTimeout = 10 * time.Second

func init() {
	resourceRegistrars = append(resourceRegistrars, func(s *Server, mux *http.ServeMux) {
		s.route(mux, "/api/v2/settings/ldap/certificate/{$}", methodMap{"POST": s.settingLDAPCertificate}, s.optionsExact("settings_ldap_certificate"))
		s.route(mux, "/api/v2/settings/ldap/test/{$}", methodMap{"POST": s.settingLDAPTest}, s.optionsExact("settings_ldap_test"))
	})
}

func (s *Server) settingLDAPCertificate(w http.ResponseWriter, r *http.Request) error {
	u, err := RequireUser(r)
	if err != nil {
		return err
	}
	// Only who may change the LDAP settings may have the server reach out
	// to an address of their choosing.
	if !u.IsSuperuser || !u.CanWrite() {
		return ErrForbidden
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	loadSettingSpecs()
	raw, _ := body.Get("server_uri")
	errs := FieldErrors{}
	var uri string
	if raw == nil {
		errs.Add("server_uri", "This field is required.")
	} else {
		v, ferr := s.validateField(r.Context(), settingSpecs["AUTH_LDAP_SERVER_URI"], raw)
		addFieldErrors(errs, "server_uri", ferr)
		if ferr == nil {
			if uri, _ = v.(string); uri == "" {
				errs.Add("server_uri", "This field may not be blank.")
			}
		}
	}
	if err := errs.Err(); err != nil {
		return err
	}
	res, err := sso.FetchLDAPServerCertificates(uri, ldapCertTimeout)
	if err != nil {
		WriteJSON(w, http.StatusBadRequest, NewOMap().Set("error", err.Error()))
		return nil
	}
	certs := make([]any, 0, len(res.Chain))
	for _, c := range res.Chain {
		certs = append(certs, NewOMap().
			Set("subject", c.Subject.String()).
			Set("issuer", c.Issuer.String()).
			Set("not_before", c.NotBefore.UTC().Format(time.RFC3339)).
			Set("not_after", c.NotAfter.UTC().Format(time.RFC3339)).
			Set("sha256_fingerprint", sso.CertFingerprint(c)).
			Set("is_ca", c.IsCA))
	}
	var verifyErr any
	if res.VerifyError != nil {
		verifyErr = res.VerifyError.Error()
	}
	WriteJSON(w, http.StatusOK, NewOMap().
		Set("server", res.Address).
		Set("trusted", res.VerifyError == nil).
		Set("verify_error", verifyErr).
		Set("leaf_only", res.LeafOnly()).
		Set("certificates", certs).
		Set("ca_cert", res.TrustPEM()))
	return nil
}

// addFieldErrors files a validateField result under a request field.
func addFieldErrors(errs FieldErrors, field string, ferr fieldError) {
	switch msgs := ferr.(type) {
	case nil:
	case []string:
		for _, m := range msgs {
			errs.Add(field, m)
		}
	default:
		errs.Add(field, "Enter a valid value.")
	}
}

// ldapTestFields are the settings the test takes from the request (the
// LDAP form's, less the organization and team maps); the server's other
// settings are the saved ones.
var ldapTestFields = []string{"SERVER_URI", "BIND_DN", "BIND_PASSWORD", "START_TLS", "CA_CERT", "USER_SEARCH", "USER_DN_TEMPLATE",
	"USER_ATTR_MAP", "GROUP_SEARCH", "GROUP_TYPE", "GROUP_TYPE_PARAMS", "REQUIRE_GROUP", "DENY_GROUP", "USER_FLAGS_BY_GROUP"}

func (s *Server) settingLDAPTest(w http.ResponseWriter, r *http.Request) error {
	u, err := RequireUser(r)
	if err != nil {
		return err
	}
	if !u.IsSuperuser || !u.CanWrite() {
		return ErrForbidden
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	ctx := r.Context()
	loadSettingSpecs()
	errs := FieldErrors{}
	server := "default"
	if v, ok := body.Get("server"); ok {
		server, _ = v.(string)
	}
	var b *ldapBackend
	for i := range ldapBackends {
		if (server == "default" && i == 0) || (i > 0 && ldapBackends[i].Prefix == "AUTH_LDAP_"+server+"_") {
			b = &ldapBackends[i]
		}
	}
	if b == nil {
		errs.Add("server", `Expected "default" or a server number from 1 to 5.`)
		return errs.Err()
	}
	// The test login: a username asks for one, which needs its password.
	var username, password string
	for _, k := range []string{"username", "password"} {
		v, ok := body.Get(k)
		if !ok || v == nil {
			continue
		}
		str, isStr := v.(string)
		if !isStr {
			errs.Add(k, "Not a valid string.")
		}
		if k == "username" {
			username = strings.TrimSpace(str)
		} else {
			password = str
		}
	}
	if username != "" && password == "" {
		errs.Add("password", "Enter the password to test a login with.")
	}
	saved := func(name string) any {
		v, _ := s.Settings.Get(ctx, b.Prefix+name)
		return v
	}
	savedURI, _ := saved("SERVER_URI").(string)
	over := map[string]any{}
	for _, k := range body.Keys() {
		if k == "server" || k == "username" || k == "password" {
			continue
		}
		name, ok := strings.CutPrefix(k, b.Prefix)
		if !ok || !contains(ldapTestFields, name) {
			errs.Add(k, "Not a setting of this LDAP server that the test takes.")
			continue
		}
		raw, _ := body.Get(k)
		v, skip, ferr := s.validateSetting(ctx, k, settingSpecs[k], raw)
		if ferr != nil {
			addFieldErrors(errs, k, ferr)
			continue
		}
		if !skip { // $encrypted$ is the saved password
			// Stored form, as a save would keep it (dictionaries plain).
			over[name] = toPlain(v)
		}
	}
	if err := errs.Err(); err != nil {
		return err
	}
	get := func(name string) any {
		if v, ok := over[name]; ok {
			return v
		}
		return saved(name)
	}
	cfg, err := s.ldapConfigFrom(*b, get)
	if err != nil {
		WriteJSON(w, http.StatusBadRequest, NewOMap().Set("stage", "configuration").Set("error", err.Error()))
		return nil
	}
	if strings.TrimSpace(cfg.ServerURI) == "" {
		errs.Add(b.Prefix+"SERVER_URI", "Enter an LDAP server URI to test.")
	}
	// The saved password goes only to the saved servers: sending it to
	// another URI would hand it to whoever answers there.
	if _, sent := over["BIND_PASSWORD"]; !sent && cfg.BindPassword != "" && cfg.ServerURI != savedURI {
		errs.Add(b.Prefix+"BIND_PASSWORD", "Enter the bind password to test a server URI other than the saved one.")
	}
	if err := errs.Err(); err != nil {
		return err
	}
	res, err := cfg.TestBind()
	if err != nil {
		stage := "connect"
		var te *sso.LDAPTestError
		if errors.As(err, &te) {
			stage = string(te.Stage)
		}
		WriteJSON(w, http.StatusBadRequest, NewOMap().Set("stage", stage).Set("error", err.Error()).Set("hint", ldapTestHint(err)))
		return nil
	}
	whoami := any(nil)
	if res.WhoAmI != "" {
		whoami = res.WhoAmI
	}
	out := NewOMap().
		Set("server_uri", res.ServerURI).
		Set("tls", res.TLS).
		Set("anonymous", res.BindDN == "").
		Set("bind_dn", res.BindDN).
		Set("whoami", whoami)
	if username != "" {
		out.Set("login", s.ldapTestLogin(ctx, cfg, get, username, password))
	}
	WriteJSON(w, http.StatusOK, out)
	return nil
}

// ldapTestLogin tries a login as AuthenticateLDAP would and reports each
// step; no account is created or changed.
func (s *Server) ldapTestLogin(ctx context.Context, cfg *sso.LDAPConfig, get func(string) any, username, password string) *OMap {
	o := NewOMap().Set("username", username)
	fail := func(stage, reason string, err error, hint string) *OMap {
		o.Set("ok", false).Set("stage", stage).Set("reason", nilIfEmpty(reason))
		if err != nil {
			o.Set("error", err.Error())
			if hint == "" {
				if h, ok := ldapTestHint(err).(string); ok {
					hint = h
				}
			}
		} else {
			o.Set("error", nil)
		}
		return o.Set("hint", nilIfEmpty(hint))
	}
	// A login never hands a local account to LDAP.
	if local, err := s.ldapLocalAccount(ctx, strings.ToLower(username)); err != nil {
		return fail("local_account", "", err, "")
	} else if local {
		return fail("local_account", "a local account has this username.", nil,
			"LDAP never signs in a local account. Test with the username of a directory user who has no local account here.")
	}
	trace := &sso.LDAPTrace{}
	cfg.Trace = trace
	lu, err := cfg.AuthenticateLDAP(username, password)
	cfg.Trace = nil
	o.Set("server_uri", nilIfEmpty(trace.ServerURI)).Set("dn_from", nilIfEmpty(trace.DNFrom)).Set("dn", nilIfEmpty(trace.DN))
	if trace.DNFrom == "USER_SEARCH" {
		o.Set("matches", trace.Matches)
	} else {
		o.Set("matches", nil)
	}
	searchErrs := make([]any, 0, len(trace.SearchErrors))
	for _, e := range trace.SearchErrors {
		searchErrs = append(searchErrs, e)
	}
	o.Set("search_errors", searchErrs)
	if trace.Stage == sso.LDAPTestRequireGroup || trace.Stage == sso.LDAPTestDenyGroup {
		o.Set("member_of", anyList(trace.MemberOf)).Set("groups", anyList(trace.Groups)).Set("groups_error", nilIfEmpty(trace.GroupsError))
	}
	if err != nil || lu == nil {
		stage := string(trace.Stage)
		if errors.Is(err, sso.ErrLDAPMisconfigured) {
			stage = "configuration"
		} else if stage == "" {
			stage = "login"
		}
		return fail(stage, trace.Reason, err, ldapLoginHint(trace, cfg))
	}
	defer lu.Close()
	attrs := NewOMap()
	for _, field := range []string{"first_name", "last_name", "email"} {
		attr, ok := cfg.UserAttrMap[field]
		if !ok {
			continue
		}
		v, has := lu.Attrs.First(attr)
		if has {
			attrs.Set(field, v)
		} else {
			attrs.Set(field, nil)
		}
	}
	groups, err := lu.GroupDNs()
	if err != nil {
		return fail("groups", "", err, "")
	}
	groupList := make([]any, 0, len(groups))
	for _, g := range groups {
		groupList = append(groupList, g)
	}
	flags := NewOMap()
	if fm, ok := get("USER_FLAGS_BY_GROUP").(map[string]any); ok {
		for _, field := range []string{"is_superuser", "is_system_auditor"} {
			q, ok := fm[field]
			if !ok {
				continue
			}
			member, err := lu.QueryMember(q)
			if err != nil {
				return fail("flags", "", err, "")
			}
			flags.Set(field, member)
		}
	}
	return o.Set("ok", true).Set("stage", nil).Set("reason", nil).Set("error", nil).Set("hint", nil).
		Set("attributes", attrs).Set("groups", groupList).Set("flags", flags)
}

// ldapLoginHint says what usually fixes a refused test login.
func ldapLoginHint(t *sso.LDAPTrace, cfg *sso.LDAPConfig) string {
	switch t.Stage {
	case sso.LDAPTestSearch:
		if len(t.SearchErrors) > 0 {
			return "The user search failed (see the errors). Check the bind DN and password, and the base DN of LDAP User Search."
		}
		if t.Matches > 1 {
			return "More than one entry matched LDAP User Search. Make its filter match a single user."
		}
		return "No entry matched LDAP User Search. Check its base DN and filter (Active Directory usernames are usually (sAMAccountName=%(user)s)), and enter the username alone, without a domain."
	case sso.LDAPTestUserBind:
		if t.Reason == "" {
			return ""
		}
		if t.DNFrom == "USER_DN_TEMPLATE" {
			return "The server refused the DN built from LDAP User DN Template, which is used instead of LDAP User Search while it is set. Check that the DN exists; in Active Directory, clear the template and use LDAP User Search."
		}
		return "The server refused the password for this user."
	case sso.LDAPTestRequireGroup:
		if t.Reason == "" {
			return ""
		}
		msg := "The directory does not list the user found (" + t.DN + ") as a member of LDAP Require Group (" + cfg.RequireGroup + ")."
		if !containsFold(t.MemberOf, cfg.RequireGroup) {
			msg += " The group is not among the user's memberOf groups below, which are direct memberships only: if the user belongs through another group, use a nested group type such as NestedMemberDNGroupType; otherwise check that this is the account that was added to the group."
		}
		return msg
	case sso.LDAPTestDenyGroup:
		if t.Reason != "" {
			return "The user is a member of LDAP Deny Group (" + cfg.DenyGroup + ")."
		}
	}
	return ""
}

// containsFold reports whether list holds s, ignoring case (DNs).
func containsFold(list []string, s string) bool {
	for _, x := range list {
		if strings.EqualFold(x, s) {
			return true
		}
	}
	return false
}

// anyList is a JSON list of strings, [] for none.
func anyList(l []string) []any {
	out := make([]any, 0, len(l))
	for _, x := range l {
		out = append(out, x)
	}
	return out
}

// nilIfEmpty is JSON null for an empty string.
func nilIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}

// ldapTestHint says what usually fixes a failed test, or nil.
func ldapTestHint(err error) any {
	var unknown x509.UnknownAuthorityError
	var host x509.HostnameError
	var invalid x509.CertificateInvalidError
	switch {
	case errors.As(err, &unknown):
		return "The server certificate is not trusted. Set LDAP CA Certificate to the authority that issued it (Fetch from server reads it from the server)."
	case errors.As(err, &host):
		return "The server certificate does not name the host in the server URI. Use a host name the certificate lists."
	case errors.As(err, &invalid):
		return "The server certificate is not valid (expired, or not for use by a server)."
	case ldap.IsErrorWithCode(err, ldap.LDAPResultInvalidCredentials):
		return "The server refused the bind DN and password."
	case ldap.IsErrorWithCode(err, ldap.LDAPResultConfidentialityRequired), ldap.IsErrorWithCode(err, ldap.LDAPResultStrongAuthRequired):
		return "The server requires an encrypted connection: use ldaps:// or turn on LDAP Start TLS."
	case ldap.IsErrorWithCode(err, ldap.ErrorNetwork):
		return "The server could not be reached. Check the host, the port and that this server can reach it."
	}
	return nil
}
