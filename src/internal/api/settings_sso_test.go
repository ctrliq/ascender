package api

import (
	"context"
	"encoding/json"
	"testing"
)

// Results of python-ldap's ldap.dn.str2dn for the same strings.
func TestParseLDAPDN(t *testing.T) {
	cases := map[string]bool{
		"": true, "DC=example,DC=com": true, "CN=Domain Users,CN=Users,DC=example,DC=com": true, "not a dn": false,
		"cn=a+sn=b,dc=x": true, "cn=a;dc=b": true, "cn = a , dc = b": true, "cn=a,": false, ",cn=a": false, "cn=": true,
		`cn="quoted, value",dc=x`: true, `cn=a\,b,dc=x`: true, "cn=#4142": true, "cn=#414": false, "OID.2.5.4.3=x": false,
		"2.5.4.3=x": true, "cn=a<b": false, "cn=a=b": true, "c-n=x": true, "1cn=x": false, `cn=x\zz`: false, `cn=x\41`: true,
		"cn= leading": true, "cn=trailing ": true, `cn=a"b`: false, "cn=a#b": true, "uid=USER,ou=People,dc=example,dc=com": true,
		"cn=a,,dc=b": false, "cn=a+": false, "=a": false, "cn": false, "cn=a b c": true, "CN=Jürgen,DC=x": true, "cn=a;": false, "cn=a>b": false,
	}
	for dn, want := range cases {
		if got := parseLDAPDN(dn); got != want {
			t.Errorf("%q: got %v want %v", dn, got, want)
		}
	}
}

func decodeOM(t *testing.T, s string) any {
	t.Helper()
	v, err := DecodeOrdered(s)
	if err != nil {
		t.Fatal(err)
	}
	return v
}

func jsonOf(v any) string {
	b, _ := json.Marshal(v)
	return string(b)
}

func TestSSOFields(t *testing.T) {
	s := &Server{}
	ctx := withSettingRequest(context.Background(), false, NewOMap())
	run := func(class string, allowNull bool, raw string) (string, string) {
		v, err, ok := s.validateSSOSetting(ctx, "AUTH_LDAP_X", &settingSpec{Class: class, AllowNull: allowNull}, decodeOM(t, raw))
		if !ok {
			t.Fatalf("%s not handled", class)
		}
		if err != nil {
			return "", jsonOf(err)
		}
		return jsonOf(v), ""
	}
	for _, c := range []struct{ class, in, out, err string }{
		{"LDAPSearchField", `["DC=example,DC=com", "SCOPE_SUBTREE", "(cn=x)"]`, `["DC=example,DC=com","SCOPE_SUBTREE","(cn=x)"]`, ""},
		{"LDAPSearchField", `[]`, `[]`, ""},
		{"LDAPSearchField", `["a", "b"]`, "", `["Expected a list of three items but got 2 instead."]`},
		{"LDAPSearchField", `"x"`, "", `["Expected a list of items but got type \"str\"."]`},
		{"LDAPSearchField", `["bad dn", "SCOPE_SUBTREE", "(cn=x)"]`, "", `["Invalid DN: bad dn"]`},
		{"LDAPSearchField", `["dc=x", "SCOPE_X", "(cn=x)"]`, "", `["\"SCOPE_X\" is not a valid choice."]`},
		{"LDAPSearchField", `["dc=x", "SCOPE_BASE", "cn=x"]`, "", `["Invalid filter: cn=x"]`},
		{"LDAPSearchUnionField", `["dc=x", "SCOPE_BASE", "(uid=%(user)s)"]`, `["dc=x","SCOPE_BASE","(uid=%(user)s)"]`, ""},
		{"LDAPSearchUnionField", `["dc=x", "SCOPE_BASE", "(uid=x)"]`, "", `["DN must include \"%(user)s\" placeholder for username: (uid=x)"]`},
		{"LDAPSearchUnionField", `[["dc=x", "SCOPE_BASE", "(uid=%(user)s)"], ["dc=y", "SCOPE_ONELEVEL", "(uid=%(user)s)"]]`, `[["dc=x","SCOPE_BASE","(uid=%(user)s)"],["dc=y","SCOPE_ONELEVEL","(uid=%(user)s)"]]`, ""},
		{"LDAPSearchUnionField", `[["dc=x", "SCOPE_BASE"], "z"]`, "", `["Error parsing LDAP Union element No. 1:","Expected a list of three items but got 2 instead."]`},
		{"LDAPSearchUnionField", `[["dc=x", "SCOPE_BASE", "(uid=%(user)s)"], "z"]`, "", `["In order to ultilize LDAP Union, input element No. 2 should be a search query array."]`},
		{"LDAPConnectionOptionsField", `{"OPT_REFERRALS": 0, "OPT_BOGUS": 1, "OPT_ALSO": 2}`, "", `["Invalid connection option(s): \"OPT_ALSO\", \"OPT_BOGUS\"."]`},
		{"LDAPUserAttrMapField", `{"first_name": "givenName", "nick": "x"}`, "", `["Invalid user attribute(s): \"nick\"."]`},
		{"LDAPUserAttrMapField", `{"first_name": 5}`, `{"first_name":"5"}`, ""},
		{"LDAPUserFlagsField", `{"is_superuser": "CN=Admins,DC=x"}`, `{"is_superuser":["CN=Admins,DC=x"]}`, ""},
		{"LDAPUserFlagsField", `{"is_superuser": ["nope"]}`, "", `{"is_superuser":["Invalid DN: nope"]}`},
		{"LDAPUserFlagsField", `{"is_root": []}`, "", `["Invalid user flag: \"is_root\"."]`},
		{"LDAPOrganizationMapField", `{"Default": {"users": true, "admins": "CN=Admins,DC=X", "remove_users": "yes"}}`, `{"Default":{"admins":"cn=admins,dc=x","users":true,"remove_users":true}}`, ""},
		{"LDAPOrganizationMapField", `{"Default": {"users": 5, "bogus": 1}}`, "", `{"Default":{"users":["Expected None, True, False, a string or list of strings but got \u003cclass 'int'\u003e instead."],"bogus":["Invalid field."]}}`},
		{"LDAPTeamMapField", `{"T": {"users": ["bad"]}}`, "", `{"T":{"organization":["This field is required."],"users":{"0":["Invalid DN: bad"]}}}`},
		{"SocialOrganizationMapField", `{"Default": {"users": ["/^a.*$/mi", "bob"], "admins": "True", "organization_alias": "1"}}`, `{"Default":{"admins":"True","users":["/^a.*$/im","bob"],"organization_alias":true}}`, ""},
		{"SocialOrganizationMapField", `{"Default": {"users": "/[a/"}}`, "", `{"Default":{"users":["unterminated character set at position 0: /[a/"]}}`},
		{"OIDCUserFlagsField", `{"is_superuser": ["a", " a", "b"]}`, `{"is_superuser":["a","b"]}`, ""},
		{"OIDCUserFlagsField", `{"is_superuser": ["a", 1]}`, "", `{"is_superuser":["Each username must be a string."]}`},
		{"TriggerRuleField", `{"groups": {"has_or": []}}`, "", `["triggers.groups.has_or: At least one group is required."]`},
		{"TriggerRuleField", `{"groups": {"has_or": ["a"]}, "always": {}}`, "", `["triggers: Only one of always, groups may be given."]`},
		{"TriggerRuleField", `{"bogus": {}}`, "", `["triggers.bogus: Invalid, can only be one of: always, never, groups, attributes"]`},
		{"TriggerRuleField", `{"attributes": {"join_condition": "xor", "email": {"matches": "(", "in": []}}}`, "",
			`["triggers.attributes.email: Only one of in, matches may be given.","triggers.attributes.email.in: An empty value matches either everyone or no one, so it cannot be used as a condition.","triggers.attributes.email.matches: Invalid regular expression: missing ), unterminated subpattern at position 0.","triggers.attributes.join_condition: Invalid, choices can only be one of: or, and"]`},
		{"SAMLOrgInfoField", `{"en-US": {"name": "x", "displayname": "X", "url": "https://x.example.com"}, "english": {"name": "x", "displayname": "X", "url": "https://x.example.com"}}`, "", `["Invalid language code(s) for org info: \"english\"."]`},
		{"SAMLOrgInfoField", `{"en": {"name": "x", "url": "nope"}}`, "", `{"en":{"displayname":["This field is required."],"url":["Enter a valid URL"]}}`},
		{"SAMLContactField", `{"givenName": "A", "emailAddress": "not-an-email"}`, "", `{"emailAddress":["Enter a valid email address."]}`},
		{"SAMLSecurityField", `{"requestedAuthnContext": "False", "wantNameId": "true"}`, `{"wantNameId":true,"requestedAuthnContext":false}`, ""},
		{"SAMLTeamAttrField", `{"team_org_map": [{"team": "t"}], "saml_attr": "x"}`, "", `{"team_org_map":{"0":{"organization":["This field is required."]}}}`},
		{"LDAPDNField", `"bad"`, "", `["Invalid DN: bad"]`},
		{"LDAPDNWithUserField", `"uid=x,dc=y"`, "", `["DN must include \"%(user)s\" placeholder for username: uid=x,dc=y"]`},
	} {
		out, err := run(c.class, true, c.in)
		if out != c.out || err != c.err {
			t.Errorf("%s %s:\n got  %s %s\n want %s %s", c.class, c.in, out, err, c.out, c.err)
		}
	}
}

func TestSettingValidators(t *testing.T) {
	for _, c := range []struct{ name, in, want string }{
		{"validate_ldap_bind_dn", `EXAMPLE\user`, ""},
		{"validate_ldap_bind_dn", "user@example.com", ""},
		{"validate_ldap_bind_dn", "nope", "Invalid DN: nope"},
		{"validate_entra_tenant_id", "common", "common lets in users from any directory. Give your own tenant ID or domain."},
		{"validate_entra_tenant_id", "contoso.onmicrosoft.com", ""},
		{"validate_entra_tenant_id", "not a tenant", "Expected a tenant ID such as 00000000-0000-0000-0000-000000000000 or a domain such as contoso.onmicrosoft.com."},
		{"validate_entra_host", "https://login.microsoftonline.com", "Expected a host name only, without https:// or a path."},
		{"validate_certificate", "garbage", "Invalid base64-encoded data"},
		{"validate_private_key", "-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----", "Exactly one private key is required."},
		{"validate_ca_certificate", "garbage", "At least one PEM certificate (-----BEGIN CERTIFICATE-----) is required."},
		{"validate_ca_certificate", "-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----", "Only certificates are allowed, found PRIVATE KEY."},
	} {
		if got := settingValidator(c.name, c.in); got != c.want {
			t.Errorf("%s %q: got %q want %q", c.name, c.in, got, c.want)
		}
	}
}
