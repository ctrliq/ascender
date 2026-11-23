package sso

import (
	"errors"
	"os"
	"reflect"
	"testing"

	"github.com/go-ldap/ldap/v3"
)

// These run against a directory seeded with the zz test entries (see
// docs/ARCHITECTURE.md, "LDAP"): ASCENDER_TEST_LDAP_URI=ldap://127.0.0.1:13389.
func testLDAP(t *testing.T) *LDAPConfig {
	uri := os.Getenv("ASCENDER_TEST_LDAP_URI")
	if uri == "" {
		t.Skip("ASCENDER_TEST_LDAP_URI not set")
	}
	return &LDAPConfig{
		Name:         "LDAPBackend",
		ServerURI:    uri,
		BindDN:       "cn=admin,dc=zz,dc=test",
		BindPassword: "zzAdminPw1",
		Options:      map[string]any{"OPT_REFERRALS": float64(0), "OPT_NETWORK_TIMEOUT": float64(5)},
		UserSearch:   []LDAPSearch{{BaseDN: "ou=people,dc=zz,dc=test", Scope: ldap.ScopeWholeSubtree, Filter: "(uid=%(user)s)"}},
		GroupSearch:  &LDAPSearch{BaseDN: "ou=groups,dc=zz,dc=test", Scope: ldap.ScopeWholeSubtree, Filter: "(objectClass=groupOfNames)"},
		GroupType:    "GroupOfNamesType",
	}
}

func TestLDAPAuthenticate(t *testing.T) {
	c := testLDAP(t)
	u, err := c.AuthenticateLDAP(" zzalice ", "AlicePass1")
	if err != nil || u == nil {
		t.Fatalf("login: %v %v", u, err)
	}
	defer u.Close()
	if u.DN != "uid=zzalice,ou=people,dc=zz,dc=test" || u.Username != "zzalice" {
		t.Errorf("user %q %q", u.DN, u.Username)
	}
	if v, _ := u.Attrs.First("MAIL"); v != "zzalice@zz.test" {
		t.Errorf("attrs are looked up without case: %q", v)
	}
	groups, err := u.GroupDNs()
	want := []string{"cn=zz-admins,ou=groups,dc=zz,dc=test", "cn=zz-ascender-users,ou=groups,dc=zz,dc=test"}
	if err != nil || !reflect.DeepEqual(groups, want) {
		t.Errorf("groups %v %v", groups, err)
	}
	for _, bad := range [][2]string{{"zzalice", "nope"}, {"zzalice", ""}, {"zznobody", "x"}, {"", "x"}} {
		if u, err := c.AuthenticateLDAP(bad[0], bad[1]); u != nil || err != nil {
			t.Errorf("%v: %v %v", bad, u, err)
		}
	}
}

func TestLDAPGroupTypes(t *testing.T) {
	c := testLDAP(t)
	c.UserSearch = nil
	c.UserDNTemplate = "uid=%(user)s,ou=people,dc=zz,dc=test"
	// Carol is in zz-ascender-users only through zz-nested.
	u, err := c.AuthenticateLDAP("zzcarol", "CarolPass1")
	if err != nil || u == nil {
		t.Fatalf("login: %v", err)
	}
	if m, _ := u.IsMemberOf("CN=zz-ascender-users,ou=groups,dc=zz,dc=test"); m {
		t.Error("plain group type sees nesting")
	}
	u.Close()
	c.GroupType = "NestedGroupOfNamesType"
	u, _ = c.AuthenticateLDAP("zzcarol", "CarolPass1")
	defer u.Close()
	if m, _ := u.IsMemberOf("CN=zz-ascender-users,ou=groups,dc=zz,dc=test"); !m {
		t.Error("nested group type misses nesting")
	}
	c.GroupType = "MemberDNGroupType"
	c.GroupParams = map[string]any{"member_attr": "member", "name_attr": "cn"}
	b, _ := c.AuthenticateLDAP("zzbob", "BobPass1")
	defer b.Close()
	if m, err := b.QueryMember([]any{"cn=zz-admins,ou=groups,dc=zz,dc=test", "cn=zz-auditors,ou=groups,dc=zz,dc=test"}); !m || err != nil {
		t.Errorf("flags query %v %v", m, err)
	}
	if st, _ := b.GroupsExpression("cn=zz-admins,ou=groups,dc=zz,dc=test", true); st == nil || *st {
		t.Errorf("expression %v", st)
	}
	if st, _ := b.GroupsExpression(nil, true); st != nil {
		t.Errorf("None expression %v", st)
	}
}

func TestLDAPRequireDeny(t *testing.T) {
	c := testLDAP(t)
	c.RequireGroup = "cn=zz-ascender-users,ou=groups,dc=zz,dc=test"
	if u, _ := c.AuthenticateLDAP("zzcarol", "CarolPass1"); u != nil {
		t.Error("require group let a nested member in with a flat type")
	}
	if u, _ := c.AuthenticateLDAP("zzbob", "BobPass1"); u == nil {
		t.Error("require group kept a member out")
	}
	c.RequireGroup = ""
	c.DenyGroup = "cn=zz-denied,ou=groups,dc=zz,dc=test"
	if u, _ := c.AuthenticateLDAP("zzcarol", "CarolPass1"); u != nil {
		t.Error("deny group let a member in")
	}
	c.GroupSearch = nil
	if _, err := c.AuthenticateLDAP("zzbob", "BobPass1"); err == nil {
		t.Error("no group search is not an error")
	}
}

func TestLDAPTestBind(t *testing.T) {
	c := testLDAP(t)
	res, err := c.TestBind()
	if err != nil || res.BindDN != "cn=admin,dc=zz,dc=test" || res.TLS != "none" || res.ServerURI != c.ServerURI {
		t.Fatalf("bind: %+v %v", res, err)
	}
	c.BindPassword = "wrong"
	_, err = c.TestBind()
	var te *LDAPTestError
	if !errors.As(err, &te) || te.Stage != LDAPTestBind || !ldap.IsErrorWithCode(err, ldap.LDAPResultInvalidCredentials) {
		t.Errorf("wrong password: %v", err)
	}
	c.BindDN, c.BindPassword = "", ""
	if res, err := c.TestBind(); err != nil || res.BindDN != "" {
		t.Errorf("anonymous: %+v %v", res, err)
	}
}

func TestLDAPTrace(t *testing.T) {
	c := testLDAP(t)
	c.RequireGroup = "cn=zz-ascender-users,ou=groups,dc=zz,dc=test"
	try := func(user, pw string) (*LDAPTrace, *LDAPUser) {
		c.Trace = &LDAPTrace{}
		u, err := c.AuthenticateLDAP(user, pw)
		if err != nil {
			t.Fatalf("%s: %v", user, err)
		}
		if u != nil {
			u.Close()
		}
		return c.Trace, u
	}
	if tr, u := try("zzalice", "AlicePass1"); u == nil || tr.Stage != "" || tr.DNFrom != "USER_SEARCH" || tr.Matches != 1 || tr.DN != "uid=zzalice,ou=people,dc=zz,dc=test" || tr.ServerURI != c.ServerURI {
		t.Errorf("good login: %+v", tr)
	}
	if tr, _ := try("zzalice", "nope"); tr.Stage != LDAPTestUserBind || tr.Reason == "" {
		t.Errorf("wrong password: %+v", tr)
	}
	if tr, _ := try("zznobody", "x"); tr.Stage != LDAPTestSearch || tr.Matches != 0 || tr.DN != "" {
		t.Errorf("unknown user: %+v", tr)
	}
	// Carol is in the required group only through zz-nested: the trace
	// shows the groups the flat type sees.
	if tr, _ := try("zzcarol", "CarolPass1"); tr.Stage != LDAPTestRequireGroup ||
		!reflect.DeepEqual(tr.Groups, []string{"cn=zz-denied,ou=groups,dc=zz,dc=test", "cn=zz-nested,ou=groups,dc=zz,dc=test"}) || tr.GroupsError != "" {
		t.Errorf("require group: %+v", tr)
	}
	// The DN template wins over the search, as in the AD mistake it explains.
	c.UserDNTemplate = "cn=%(user)s,ou=people,dc=zz,dc=test"
	if tr, _ := try("zzalice", "AlicePass1"); tr.Stage != LDAPTestUserBind || tr.DNFrom != "USER_DN_TEMPLATE" || tr.DN != "cn=zzalice,ou=people,dc=zz,dc=test" {
		t.Errorf("template: %+v", tr)
	}
	c.UserDNTemplate = ""
	c.BindPassword = "wrong"
	if tr, _ := try("zzalice", "AlicePass1"); tr.Stage != LDAPTestSearch || len(tr.SearchErrors) != 1 {
		t.Errorf("service bind failing in the search: %+v", tr)
	}
}
