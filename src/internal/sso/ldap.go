// Package sso holds the protocols of the external logins the old
// application offered through django-auth-ldap, python-social-auth and
// python3-saml: LDAP, OAuth2 and OpenID Connect providers, and SAML. What
// a login does with the user it finds (accounts, organizations, teams) is
// the API's.
package sso

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/url"
	"os"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/go-ldap/ldap/v3"
)

// LDAP: what django-auth-ldap's LDAPBackend did with one server's
// AUTH_LDAP_* settings.

// LDAPSearch is one [base DN, scope, filter] of a search setting.
type LDAPSearch struct {
	BaseDN string
	Scope  int
	Filter string
}

// LDAPConfig is one LDAP server's settings.
type LDAPConfig struct {
	// Name is the backend's name for logs (LDAPBackend, LDAPBackend1...).
	Name         string
	ServerURI    string
	BindDN       string
	BindPassword string
	StartTLS     bool
	// CACert is AUTH_LDAP_CA_CERT: PEM certificates trusted for this
	// server beside the system's.
	CACert         string
	Options        map[string]any
	UserSearch     []LDAPSearch
	UserDNTemplate string
	UserAttrMap    map[string]string
	GroupSearch    *LDAPSearch
	GroupType      string
	GroupParams    map[string]any
	RequireGroup   string
	DenyGroup      string
	Log            *slog.Logger
	// Trace, when set, records how far AuthenticateLDAP got (the settings
	// form's test login).
	Trace *LDAPTrace
}

// ErrLDAPMisconfigured is ImproperlyConfigured.
var ErrLDAPMisconfigured = errors.New("improperly configured")

var scopes = map[string]int{"SCOPE_BASE": ldap.ScopeBaseObject, "SCOPE_ONELEVEL": ldap.ScopeSingleLevel, "SCOPE_SUBTREE": ldap.ScopeWholeSubtree}

// ParseLDAPSearch reads a search setting's stored form: [base, scope,
// filter].
func ParseLDAPSearch(v any) (*LDAPSearch, error) {
	l, ok := v.([]any)
	if !ok || len(l) == 0 {
		return nil, nil
	}
	if len(l) != 3 {
		return nil, fmt.Errorf("expected a list of three items but got %d", len(l))
	}
	base, _ := l[0].(string)
	scope, _ := l[1].(string)
	filter, _ := l[2].(string)
	sc, ok := scopes[scope]
	if !ok {
		return nil, fmt.Errorf("invalid scope %q", scope)
	}
	return &LDAPSearch{BaseDN: base, Scope: sc, Filter: filter}, nil
}

// ParseLDAPSearchUnion reads AUTH_LDAP_USER_SEARCH: one search, or a list
// of them (LDAPSearchUnion).
func ParseLDAPSearchUnion(v any) ([]LDAPSearch, error) {
	l, ok := v.([]any)
	if !ok || len(l) == 0 {
		return nil, nil
	}
	if _, isStr := l[0].(string); isStr && len(l) == 3 {
		s, err := ParseLDAPSearch(l)
		if err != nil || s == nil {
			return nil, err
		}
		return []LDAPSearch{*s}, nil
	}
	var out []LDAPSearch
	for _, item := range l {
		s, err := ParseLDAPSearch(item)
		if err != nil {
			return nil, err
		}
		if s != nil {
			out = append(out, *s)
		}
	}
	return out, nil
}

// Attrs are an entry's attributes, looked up without regard to case as
// python-ldap's cidict did.
type Attrs struct {
	names map[string]string // lower case -> name as the directory gave it
	vals  map[string][]string
}

func newAttrs(e *ldap.Entry) Attrs {
	a := Attrs{names: map[string]string{}, vals: map[string][]string{}}
	if e == nil {
		return a
	}
	for _, at := range e.Attributes {
		k := strings.ToLower(at.Name)
		a.names[k] = at.Name
		a.vals[k] = append(a.vals[k], at.Values...)
	}
	return a
}

// Get is the attribute's values.
func (a Attrs) Get(name string) ([]string, bool) {
	v, ok := a.vals[strings.ToLower(name)]
	return v, ok
}

// First is the attribute's first value.
func (a Attrs) First(name string) (string, bool) {
	v, ok := a.Get(name)
	if !ok || len(v) == 0 {
		return "", false
	}
	return v[0], true
}

// Map is the attributes as name -> values, with the directory's names.
func (a Attrs) Map() map[string][]string {
	out := make(map[string][]string, len(a.vals))
	for k, v := range a.vals {
		out[a.names[k]] = v
	}
	return out
}

// LDAPUser is _LDAPUser: an authenticated directory user.
type LDAPUser struct {
	Username string
	// DN is in its normal form, lower case.
	DN    string
	Attrs Attrs
	cfg   *LDAPConfig
	conn  *ldap.Conn
	// bound: the connection is bound as AUTH_LDAP_BIND_DN.
	bound     bool
	groupDNs  map[string]bool
	groupList []string
}

// Close unbinds.
func (u *LDAPUser) Close() {
	if u != nil && u.conn != nil {
		u.conn.Close()
		u.conn = nil
	}
}

func (c *LDAPConfig) logf(level slog.Level, msg string, args ...any) {
	if c.Log != nil {
		c.Log.Log(context.Background(), level, fmt.Sprintf("%s: ", c.Name)+msg, args...)
	}
}

// networkTimeout is OPT_NETWORK_TIMEOUT (30 seconds unless set).
func (c *LDAPConfig) networkTimeout() time.Duration {
	if v, ok := c.Options["OPT_NETWORK_TIMEOUT"]; ok {
		if f, ok := toFloat(v); ok && f > 0 {
			return time.Duration(f * float64(time.Second))
		}
	}
	return 30 * time.Second
}

func toFloat(v any) (float64, bool) {
	switch t := v.(type) {
	case float64:
		return t, true
	case int:
		return float64(t), true
	case int64:
		return float64(t), true
	case string:
		f, err := strconv.ParseFloat(t, 64)
		return f, err == nil
	}
	return 0, false
}

// tlsConfig is libldap's TLS: the system's trust store, or what
// OPT_X_TLS_REQUIRE_CERT and OPT_X_TLS_CACERTFILE say, and the
// certificates of AUTH_LDAP_CA_CERT beside either.
func (c *LDAPConfig) tlsConfig(host string) (*tls.Config, error) {
	conf := &tls.Config{ServerName: host, MinVersion: tls.VersionTLS12}
	if v, ok := c.Options["OPT_X_TLS_REQUIRE_CERT"]; ok {
		// OPT_X_TLS_NEVER (0) and OPT_X_TLS_ALLOW (3) do not check the
		// certificate; demand, hard and try (2, 1, 4) do.
		if f, ok := toFloat(v); ok && (f == 0 || f == 3) {
			conf.InsecureSkipVerify = true
		}
		if b, ok := v.(bool); ok && !b {
			conf.InsecureSkipVerify = true
		}
	}
	if v, ok := c.Options["OPT_X_TLS_CACERTFILE"].(string); ok && v != "" {
		pem, err := os.ReadFile(v)
		if err != nil {
			return nil, err
		}
		pool := x509.NewCertPool()
		pool.AppendCertsFromPEM(pem)
		conf.RootCAs = pool
	}
	if strings.TrimSpace(c.CACert) != "" {
		pool := conf.RootCAs
		if pool == nil {
			// SystemCertPool hands out a copy, so adding to it leaves
			// other connections alone.
			if sys, err := x509.SystemCertPool(); err == nil {
				pool = sys
			} else {
				pool = x509.NewCertPool()
			}
		}
		if !pool.AppendCertsFromPEM([]byte(c.CACert)) {
			return nil, fmt.Errorf("%w: CA_CERT holds no PEM certificate", ErrLDAPMisconfigured)
		}
		conf.RootCAs = pool
	}
	return conf, nil
}

var uriSep = regexp.MustCompile(`[, ]+`)

// dialURI connects to the first server of AUTH_LDAP_SERVER_URI that
// answers, starting TLS when asked, and says which one it was.
func (c *LDAPConfig) dialURI() (*ldap.Conn, string, error) {
	var lastErr error
	for _, uri := range uriSep.Split(strings.TrimSpace(c.ServerURI), -1) {
		if uri == "" {
			continue
		}
		u, err := url.Parse(uri)
		if err != nil || u.Host == "" {
			lastErr = fmt.Errorf("invalid server URI %q", uri)
			continue
		}
		host := u.Hostname()
		tconf, err := c.tlsConfig(host)
		if err != nil {
			return nil, "", err
		}
		dialer := &net.Dialer{Timeout: c.networkTimeout()}
		conn, err := ldap.DialURL(uri, ldap.DialWithDialer(dialer), ldap.DialWithTLSConfig(tconf))
		if err != nil {
			lastErr = err
			continue
		}
		if c.StartTLS && u.Scheme == "ldap" {
			if err := conn.StartTLS(tconf); err != nil {
				conn.Close()
				lastErr = err
				continue
			}
		}
		if v, ok := c.Options["OPT_TIMEOUT"]; ok {
			if f, ok := toFloat(v); ok && f > 0 {
				conn.SetTimeout(time.Duration(f * float64(time.Second)))
			}
		}
		return conn, uri, nil
	}
	if lastErr == nil {
		lastErr = errors.New("no server URI")
	}
	return nil, "", lastErr
}

// bindService binds as AUTH_LDAP_BIND_DN (anonymously when empty).
func (u *LDAPUser) bindService() error {
	if u.bound {
		return nil
	}
	var err error
	if u.cfg.BindDN == "" && u.cfg.BindPassword == "" {
		err = u.conn.UnauthenticatedBind("")
	} else {
		err = u.conn.Bind(u.cfg.BindDN, u.cfg.BindPassword)
	}
	if err != nil {
		return err
	}
	u.bound = true
	return nil
}

// escapeDN is ldap.dn.escape_dn_chars.
func escapeDN(s string) string {
	var b strings.Builder
	for i, r := range s {
		switch {
		case strings.ContainsRune(`\,+"<>;=`, r):
			b.WriteByte('\\')
			b.WriteRune(r)
		case r == 0:
			b.WriteString(`\00`)
		case (r == '#' || r == ' ') && i == 0:
			b.WriteByte('\\')
			b.WriteRune(r)
		case r == ' ' && i == len(s)-1:
			b.WriteString(`\ `)
		default:
			b.WriteRune(r)
		}
	}
	return b.String()
}

// pyFormat is the filter or DN template's "%(user)s" expansion.
func pyFormat(tmpl, user string) string {
	r := strings.NewReplacer("%(user)s", user, "%%", "%")
	return r.Replace(tmpl)
}

// search runs one search, returning entries with their DNs lower case.
func (u *LDAPUser) search(s LDAPSearch, filter string, attrs []string) ([]*ldap.Entry, error) {
	if err := u.bindService(); err != nil {
		return nil, err
	}
	res, err := u.conn.Search(ldap.NewSearchRequest(s.BaseDN, s.Scope, ldap.NeverDerefAliases, 0, 0, false, filter, attrs, nil))
	if err != nil {
		return nil, err
	}
	for _, e := range res.Entries {
		e.DN = strings.ToLower(e.DN)
	}
	return res.Entries, nil
}

// AuthenticateLDAP is LDAPBackend.authenticate: the user's DN (from the
// template or the search), a bind with their password, and the group
// requirements. A failed login is (nil, nil); a directory error is an
// error. The returned user's connection is bound as the service account.
// dnSource says how a login finds the user's DN, for the logs: from
// USER_DN_TEMPLATE, which wins when set, or USER_SEARCH.
func dnSource(c *LDAPConfig) string {
	if c.UserDNTemplate != "" {
		return "USER_DN_TEMPLATE"
	}
	return "USER_SEARCH"
}

// The reasons a login is refused are logged at INFO (django-auth-ldap
// logged them at DEBUG, which left a failed login with no reason in the
// logs).
func (c *LDAPConfig) AuthenticateLDAP(username, password string) (*LDAPUser, error) {
	username = strings.TrimSpace(username)
	if username == "" {
		return nil, nil
	}
	if password == "" {
		c.logf(slog.LevelDebug, "Rejecting empty password for "+username)
		return nil, nil
	}
	if c.GroupSearch == nil {
		return nil, fmt.Errorf("%w: GROUP_SEARCH must be an LDAPSearch instance.", ErrLDAPMisconfigured)
	}
	if c.GroupType == "" {
		return nil, fmt.Errorf("%w: GROUP_TYPE must be an LDAPGroupType instance.", ErrLDAPMisconfigured)
	}
	if attr, _, ok := c.memberAttr(); ok && attr == "" {
		return nil, fmt.Errorf("%w: %s needs member_attr in GROUP_TYPE_PARAMS", ErrLDAPMisconfigured, c.GroupType)
	} else if _, posix := c.posixUserAttr(); !ok && !posix {
		return nil, fmt.Errorf("%w: unknown GROUP_TYPE %s", ErrLDAPMisconfigured, c.GroupType)
	}
	conn, uri, err := c.dialURI()
	if err != nil {
		c.Trace.stop(LDAPTestConnect, "")
		return nil, err
	}
	c.Trace.set(func(t *LDAPTrace) { t.ServerURI = uri; t.DNFrom = dnSource(c) })
	u := &LDAPUser{Username: username, cfg: c, conn: conn}
	ok := false
	defer func() {
		if !ok {
			u.Close()
		}
	}()
	// The DN.
	if c.UserDNTemplate != "" {
		u.DN = strings.ToLower(pyFormat(c.UserDNTemplate, escapeDN(username)))
	} else {
		if len(c.UserSearch) == 0 {
			return nil, fmt.Errorf("%w: USER_SEARCH must be an LDAPSearch instance.", ErrLDAPMisconfigured)
		}
		found := map[string]*ldap.Entry{}
		var order []string
		for _, s := range c.UserSearch {
			entries, err := u.search(s, pyFormat(s.Filter, ldap.EscapeFilter(username)), nil)
			if err != nil {
				// _report_error: logged, the user is not found.
				c.logf(slog.LevelWarn, fmt.Sprintf("search_for_user_dn raised %v", err))
				c.Trace.set(func(t *LDAPTrace) { t.SearchErrors = append(t.SearchErrors, err.Error()) })
				continue
			}
			for _, e := range entries {
				if _, seen := found[e.DN]; !seen {
					order = append(order, e.DN)
				}
				found[e.DN] = e
			}
		}
		c.Trace.set(func(t *LDAPTrace) { t.Matches = len(found) })
		if len(found) != 1 {
			c.Trace.stop(LDAPTestSearch, "failed to map the username to a DN.")
			c.logf(slog.LevelInfo, fmt.Sprintf("Authentication failed for %s: failed to map the username to a DN.", username), "matches", len(found))
			return nil, nil
		}
		u.DN = order[0]
		u.Attrs = newAttrs(found[u.DN])
	}
	c.Trace.set(func(t *LDAPTrace) { t.DN = u.DN })
	// The user's own bind; afterwards the connection is the service
	// account's again (BIND_AS_AUTHENTICATING_USER is off).
	if err := conn.Bind(u.DN, password); err != nil {
		c.Trace.stop(LDAPTestUserBind, "")
		if ldap.IsErrorWithCode(err, ldap.LDAPResultInvalidCredentials) {
			c.Trace.stop(LDAPTestUserBind, "user DN/password rejected by LDAP server.")
			c.logf(slog.LevelInfo, fmt.Sprintf("Authentication failed for %s: user DN/password rejected by LDAP server.", username), "dn", u.DN, "dn_from", dnSource(c))
			return nil, nil
		}
		return nil, err
	}
	u.bound = false
	if u.Attrs.vals == nil {
		entries, err := u.search(LDAPSearch{BaseDN: u.DN, Scope: ldap.ScopeBaseObject, Filter: "(objectClass=*)"}, "(objectClass=*)", nil)
		if err != nil {
			return nil, err
		}
		if len(entries) > 0 {
			u.Attrs = newAttrs(entries[0])
		} else {
			u.Attrs = newAttrs(nil)
		}
	}
	// _check_requirements.
	if c.RequireGroup != "" {
		member, err := u.IsMemberOf(c.RequireGroup)
		if err != nil {
			c.Trace.stop(LDAPTestRequireGroup, "")
			return nil, err
		}
		if !member {
			c.Trace.stop(LDAPTestRequireGroup, "user does not satisfy AUTH_LDAP_REQUIRE_GROUP")
			u.traceGroups()
			c.logf(slog.LevelInfo, fmt.Sprintf("Authentication failed for %s: user does not satisfy AUTH_LDAP_REQUIRE_GROUP", username), "dn", u.DN)
			return nil, nil
		}
	}
	if c.DenyGroup != "" {
		member, err := u.IsMemberOf(c.DenyGroup)
		if err != nil {
			c.Trace.stop(LDAPTestDenyGroup, "")
			return nil, err
		}
		if member {
			c.Trace.stop(LDAPTestDenyGroup, "user does not satisfy AUTH_LDAP_DENY_GROUP")
			u.traceGroups()
			c.logf(slog.LevelInfo, fmt.Sprintf("Authentication failed for %s: user does not satisfy AUTH_LDAP_DENY_GROUP", username), "dn", u.DN)
			return nil, nil
		}
	}
	ok = true
	return u, nil
}

// groupType is the group type's attributes: what holds the members, and
// whether groups nest.
func (c *LDAPConfig) memberAttr() (string, bool, bool) {
	param := func(name, def string) string {
		if v, ok := c.GroupParams[name].(string); ok && v != "" {
			return v
		}
		return def
	}
	switch c.GroupType {
	case "MemberDNGroupType":
		return param("member_attr", ""), false, true
	case "NestedMemberDNGroupType":
		return param("member_attr", ""), true, true
	case "GroupOfNamesType", "ActiveDirectoryGroupType":
		return "member", false, true
	case "NestedGroupOfNamesType", "NestedActiveDirectoryGroupType":
		return "member", true, true
	case "GroupOfUniqueNamesType":
		return "uniqueMember", false, true
	case "NestedGroupOfUniqueNamesType":
		return "uniqueMember", true, true
	case "OrganizationalRoleGroupType":
		return "roleOccupant", false, true
	case "NestedOrganizationalRoleGroupType":
		return "roleOccupant", true, true
	}
	return "", false, false
}

// posixUserAttr is the user attribute posix groups list (uid, or
// PosixUIDGroupType's ldap_group_user_attr).
func (c *LDAPConfig) posixUserAttr() (string, bool) {
	switch c.GroupType {
	case "PosixGroupType":
		return "uid", true
	case "PosixUIDGroupType":
		if v, ok := c.GroupParams["ldap_group_user_attr"].(string); ok && v != "" {
			return v, true
		}
		return "uid", true
	}
	return "", false
}

// compare is compare_s, with a missing attribute meaning no. A group
// that does not exist is an error, as it was.
func (u *LDAPUser) compare(dn, attr, value string) (bool, error) {
	if err := u.bindService(); err != nil {
		return false, err
	}
	ok, err := u.conn.Compare(dn, attr, value)
	if err != nil {
		if ldap.IsErrorAnyOf(err, ldap.LDAPResultUndefinedAttributeType, ldap.LDAPResultNoSuchAttribute) {
			return false, nil
		}
		return false, err
	}
	return ok, nil
}

// IsMemberOf is _LDAPUserGroups.is_member_of: the group type's compare
// shortcut while the user's groups are not loaded, else the loaded DNs.
func (u *LDAPUser) IsMemberOf(groupDN string) (bool, error) {
	groupDN = strings.ToLower(groupDN)
	if u.groupDNs == nil {
		if attr, nested, ok := u.cfg.memberAttr(); ok && !nested {
			return u.compare(groupDN, attr, u.DN)
		}
		if attr, ok := u.cfg.posixUserAttr(); ok {
			uid, has := u.Attrs.First(attr)
			if !has {
				return false, nil
			}
			member, err := u.compare(groupDN, "memberUid", uid)
			if err != nil || member {
				return member, err
			}
			gid, has := u.Attrs.First("gidNumber")
			if !has {
				return false, nil
			}
			return u.compare(groupDN, "gidNumber", gid)
		}
	}
	dns, err := u.GroupDNs()
	if err != nil {
		return false, err
	}
	for _, d := range dns {
		if d == groupDN {
			return true, nil
		}
	}
	return false, nil
}

// GroupDNs are the DNs of the user's groups, in lower case (user_groups
// of the group type).
func (u *LDAPUser) GroupDNs() ([]string, error) {
	if u.groupDNs != nil {
		return u.groupList, nil
	}
	gs := *u.cfg.GroupSearch
	found := map[string]bool{}
	add := func(entries []*ldap.Entry) []string {
		var fresh []string
		for _, e := range entries {
			if !found[e.DN] {
				found[e.DN] = true
				fresh = append(fresh, e.DN)
			}
		}
		return fresh
	}
	filterAnd := func(extra string) string { return "(&" + gs.Filter + extra + ")" }
	if attr, nested, ok := u.cfg.memberAttr(); ok {
		if !nested {
			entries, err := u.search(gs, filterAnd("("+attr+"="+ldap.EscapeFilter(u.DN)+")"), []string{"dn"})
			if err != nil {
				return nil, err
			}
			add(entries)
		} else {
			// Bottom up, each level's groups searched for as members, never
			// the same member twice.
			handled := map[string]bool{}
			next := []string{u.DN}
			for len(next) > 0 {
				var terms strings.Builder
				for _, dn := range next {
					handled[dn] = true
					terms.WriteString("(" + attr + "=" + ldap.EscapeFilter(dn) + ")")
				}
				entries, err := u.search(gs, filterAnd("(|"+terms.String()+")"), []string{"dn"})
				if err != nil {
					return nil, err
				}
				var level []string
				for _, dn := range add(entries) {
					if !handled[dn] {
						level = append(level, dn)
					}
				}
				next = level
			}
		}
	} else if attr, ok := u.cfg.posixUserAttr(); ok {
		if uid, has := u.Attrs.First(attr); has {
			filter := "(memberUid=" + ldap.EscapeFilter(uid) + ")"
			if gid, has := u.Attrs.First("gidNumber"); has {
				filter = "(|(gidNumber=" + ldap.EscapeFilter(gid) + ")(memberUid=" + ldap.EscapeFilter(uid) + "))"
			}
			entries, err := u.search(gs, filterAnd(filter), []string{"dn"})
			if err != nil {
				return nil, err
			}
			add(entries)
		}
	}
	u.groupDNs = found
	u.groupList = make([]string, 0, len(found))
	for dn := range found {
		u.groupList = append(u.groupList, dn)
	}
	sort.Strings(u.groupList)
	return u.groupList, nil
}

// QueryMember resolves a USER_FLAGS_BY_GROUP value: one DN, or a list
// joined with OR.
func (u *LDAPUser) QueryMember(v any) (bool, error) {
	switch t := v.(type) {
	case string:
		return u.IsMemberOf(t)
	case []any:
		if len(t) == 0 {
			return false, fmt.Errorf("%w: %v", ErrLDAPMisconfigured, t)
		}
		for _, x := range t {
			s, ok := x.(string)
			if !ok {
				return false, fmt.Errorf("%w: %v", ErrLDAPMisconfigured, t)
			}
			m, err := u.IsMemberOf(s)
			if err != nil || m {
				return m, err
			}
		}
		return false, nil
	}
	return false, fmt.Errorf("%w: %v", ErrLDAPMisconfigured, v)
}
