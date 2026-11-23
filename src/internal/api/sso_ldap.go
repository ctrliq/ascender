package api

import (
	"context"
	"fmt"
	"maps"
	"strings"
	"sync"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/activity"
	"github.com/ctrliq/ascender/internal/auth"
	"github.com/ctrliq/ascender/internal/crypto"
	"github.com/ctrliq/ascender/internal/sso"
)

// Password logins: django.contrib.auth.authenticate over the backends the
// old application listed, LDAP servers first, then local accounts.

// ldapBackend is one of the six LDAP backends and its settings prefix.
type ldapBackend struct{ Name, Prefix string }

var ldapBackends = []ldapBackend{
	{"LDAPBackend", "AUTH_LDAP_"},
	{"LDAPBackend1", "AUTH_LDAP_1_"},
	{"LDAPBackend2", "AUTH_LDAP_2_"},
	{"LDAPBackend3", "AUTH_LDAP_3_"},
	{"LDAPBackend4", "AUTH_LDAP_4_"},
	{"LDAPBackend5", "AUTH_LDAP_5_"},
}

// localBackendPath is the local backend's dotted path.
const localBackendPath = "ascender.main.backends.AWXModelBackend"

// authenticatePassword is authenticate(username=, password=): the user
// the first backend accepts and that backend's dotted path, or nil. Like
// Django it does not look at is_active for an LDAP user; local accounts
// must be active.
func (s *Server) authenticatePassword(ctx context.Context, username, password string) (*auth.User, string) {
	for _, b := range ldapBackends {
		if u := s.ldapAuthenticate(ctx, b, username, password); u != nil {
			return u, "ascender.sso.backends." + b.Name
		}
	}
	if s.Settings.Bool(ctx, "DISABLE_LOCAL_AUTH") {
		s.ssoLog("ascender.main.backends").Warn(fmt.Sprintf("User '%s' attempted login through the disabled local authentication system.", username))
		return nil, ""
	}
	// ModelBackend.authenticate: the password is checked before
	// is_active, and a missing user (or one with no usable password)
	// costs a hash of a dummy, so how long a login takes does not tell
	// which usernames exist.
	u, err := auth.UserByUsername(ctx, s.Q(), username)
	if err != nil || !crypto.IsUsablePassword(u.PasswordHash()) {
		crypto.CheckPassword(password, dummyPasswordHash())
		return nil, ""
	}
	ok := crypto.CheckPassword(password, u.PasswordHash())
	crypto.HardenRuntime(password, u.PasswordHash())
	if !ok || !u.IsActive {
		return nil, ""
	}
	// check_password's setter: a hash from an older work factor is
	// replaced now that the password is known. Only if it is unchanged:
	// a password changed meanwhile wins.
	if crypto.PasswordNeedsUpdate(u.PasswordHash()) {
		if h, err := crypto.MakePassword(password); err == nil {
			if tag, err := s.Q().Exec(ctx, `UPDATE auth_user SET password = $1 WHERE id = $2 AND password = $3`, h, u.ID, u.PasswordHash()); err == nil && tag.RowsAffected() == 1 {
				if fresh, err := auth.UserByID(ctx, s.Q(), u.ID); err == nil {
					u = fresh
				}
			}
		}
	}
	return u, localBackendPath
}

// dummyPasswordHash is a hash at the current iteration count that no
// password matches in practice, made once.
var dummyPasswordHash = sync.OnceValue(func() string {
	h, _ := crypto.MakePassword(auth.NewCSRFToken())
	return h
})

// ldapConfig reads one backend's settings.
func (s *Server) ldapConfig(ctx context.Context, b ldapBackend) (*sso.LDAPConfig, error) {
	return s.ldapConfigFrom(b, func(name string) any {
		v, _ := s.Settings.Get(ctx, b.Prefix+name)
		return v
	})
}

// ldapConfigFrom builds one backend's configuration from get, which gives
// a setting's value by its name without the backend's prefix.
func (s *Server) ldapConfigFrom(b ldapBackend, get func(name string) any) (*sso.LDAPConfig, error) {
	str := func(name string) string {
		v, _ := get(name).(string)
		return v
	}
	c := &sso.LDAPConfig{
		Name:           b.Name,
		ServerURI:      str("SERVER_URI"),
		BindDN:         str("BIND_DN"),
		BindPassword:   str("BIND_PASSWORD"),
		UserDNTemplate: str("USER_DN_TEMPLATE"),
		GroupType:      str("GROUP_TYPE"),
		RequireGroup:   str("REQUIRE_GROUP"),
		DenyGroup:      str("DENY_GROUP"),
		CACert:         str("CA_CERT"),
		Log:            s.ssoLog("ascender.sso.backends"),
	}
	c.StartTLS, _ = get("START_TLS").(bool)
	// Copies: the settings store hands out its cached maps, which every
	// login reads at once; the default added below must not write into it.
	opts, _ := get("CONNECTION_OPTIONS").(map[string]any)
	c.Options = maps.Clone(opts)
	if c.Options == nil {
		c.Options = map[string]any{}
	}
	if _, ok := c.Options["OPT_NETWORK_TIMEOUT"]; !ok {
		c.Options["OPT_NETWORK_TIMEOUT"] = float64(30)
	}
	params, _ := get("GROUP_TYPE_PARAMS").(map[string]any)
	c.GroupParams = maps.Clone(params)
	var err error
	if c.UserSearch, err = sso.ParseLDAPSearchUnion(get("USER_SEARCH")); err != nil {
		return nil, fmt.Errorf("%w: USER_SEARCH: %v", sso.ErrLDAPMisconfigured, err)
	}
	if c.GroupSearch, err = sso.ParseLDAPSearch(get("GROUP_SEARCH")); err != nil {
		return nil, fmt.Errorf("%w: GROUP_SEARCH: %v", sso.ErrLDAPMisconfigured, err)
	}
	if m, ok := get("USER_ATTR_MAP").(map[string]any); ok {
		c.UserAttrMap = map[string]string{}
		for k, v := range m {
			if a, ok := v.(string); ok {
				c.UserAttrMap[k] = a
			}
		}
	}
	return c, nil
}

// ldapAuthenticate is LDAPBackend.authenticate for one backend.
func (s *Server) ldapAuthenticate(ctx context.Context, b ldapBackend, username, password string) *auth.User {
	log := s.ssoLog("ascender.sso.backends")
	if s.Settings.String(ctx, b.Prefix+"SERVER_URI") == "" {
		return nil
	}
	// A local account is never handed to LDAP. The name is matched as
	// the login will match it (trimmed, any case), so "Admin " cannot
	// slip past the check and then bind the local admin; and a lookup
	// that fails refuses the login rather than letting it through.
	if local, err := s.ldapLocalAccount(ctx, strings.ToLower(strings.TrimSpace(username))); err != nil || local {
		if err != nil {
			log.Error("Encountered an error authenticating to LDAP", "error", err.Error())
		}
		return nil
	}
	cfg, err := s.ldapConfig(ctx, b)
	if err != nil {
		log.Error("Encountered an error authenticating to LDAP", "error", err.Error())
		return nil
	}
	lu, err := cfg.AuthenticateLDAP(username, password)
	if err != nil {
		log.Error("Encountered an error authenticating to LDAP", "error", err.Error())
		return nil
	}
	if lu == nil {
		return nil
	}
	defer lu.Close()
	u, err := s.ldapPopulate(ctx, b, cfg, lu)
	if err != nil {
		log.Error("Encountered an error authenticating to LDAP", "error", err.Error())
		return nil
	}
	return u
}

// ldapLocalAccount reports whether an account the LDAP login for username
// would bind (username__iexact) exists without an LDAP DN, a local
// account LDAP must never take over.
func (s *Server) ldapLocalAccount(ctx context.Context, username string) (bool, error) {
	var local bool
	err := s.Q().QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM auth_user u LEFT JOIN main_profile p ON p.user_id = u.id
		WHERE UPPER(u.username::text) = UPPER($1) AND COALESCE(p.ldap_dn, '') = '')`, username).Scan(&local)
	return local, err
}

// ssoUserFields are what an external login sets on the account.
type ssoUserFields struct {
	FirstName, LastName, Email   *string
	IsSuperuser, IsSystemAuditor *bool
}

// truncateRunes cuts s to n characters.
func truncateRunes(s string, n int) string {
	r := []rune(s)
	if len(r) > n {
		return string(r[:n])
	}
	return s
}

// ldapPopulate is _get_or_create_user with ALWAYS_UPDATE_USER, the
// populate_user signal (on_populate_user) and the final save.
func (s *Server) ldapPopulate(ctx context.Context, b ldapBackend, cfg *sso.LDAPConfig, lu *sso.LDAPUser) (*auth.User, error) {
	log := s.ssoLog("ascender.sso.backends")
	username := strings.ToLower(lu.Username)
	// get_or_build_user: username__iexact.
	var ids []int64
	rows, err := s.Q().Query(ctx, `SELECT id FROM auth_user WHERE UPPER(username::text) = UPPER($1)`, username)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return nil, err
		}
		ids = append(ids, id)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(ids) > 1 {
		return nil, fmt.Errorf("get() returned more than one User -- it returned %d!", len(ids))
	}
	// The account found is the one bound: checked again here, on the name
	// the directory login produced, so no spelling of it reaches a local
	// account.
	if local, err := s.ldapLocalAccount(ctx, username); err != nil {
		return nil, err
	} else if local {
		return nil, fmt.Errorf("%s is a local account and cannot be authenticated by LDAP", username)
	}
	var f ssoUserFields
	// _populate_user_from_attributes.
	for _, field := range []string{"first_name", "last_name", "email"} {
		attr, ok := cfg.UserAttrMap[field]
		if !ok {
			continue
		}
		v, has := lu.Attrs.First(attr)
		if !has {
			log.Warn(fmt.Sprintf("%s does not have a value for the attribute %s", lu.DN, attr))
			continue
		}
		v2 := v
		switch field {
		case "first_name":
			f.FirstName = &v2
		case "last_name":
			f.LastName = &v2
		case "email":
			f.Email = &v2
		}
	}
	// _populate_user_from_group_memberships.
	flagsSetting, _ := s.Settings.Get(ctx, b.Prefix+"USER_FLAGS_BY_GROUP")
	if flags, ok := flagsSetting.(map[string]any); ok {
		for _, field := range []string{"is_superuser", "is_system_auditor"} {
			q, ok := flags[field]
			if !ok {
				continue
			}
			member, err := lu.QueryMember(q)
			if err != nil {
				return nil, err
			}
			m := member
			if field == "is_superuser" {
				f.IsSuperuser = &m
			} else {
				f.IsSystemAuditor = &m
			}
		}
	}
	// on_populate_user.
	groups, err := lu.GroupDNs()
	if err != nil {
		return nil, err
	}
	for _, p := range []**string{&f.FirstName, &f.LastName} {
		if *p != nil && len([]rune(**p)) > 150 {
			t := truncateRunes(**p, 150)
			*p = &t
			log.Warn(fmt.Sprintf("LDAP user %s has a name > max 150 characters", username))
		}
	}
	orgMap := s.ssoMapSetting(ctx, b.Prefix+"ORGANIZATION_MAP")
	teamMap := s.ssoMapSetting(ctx, b.Prefix+"TEAM_MAP")
	var orgNames []string
	for _, e := range orgMap {
		orgNames = append(orgNames, e.Name)
	}
	var teams []teamOrg
	for _, e := range teamMap {
		org, _ := e.Opts["organization"].(string)
		if !pyTruthy(e.Opts["organization"]) {
			log.Error(fmt.Sprintf("Team named %s in LDAP team map settings is invalid due to missing organization", e.Name))
			continue
		}
		teams = append(teams, teamOrg{Team: e.Name, Org: org})
	}
	if err := s.ssoCreateOrgsAndTeams(ctx, orgNames, teams, "LDAP", true); err != nil {
		return nil, err
	}
	attrs := lu.Attrs.Map()
	ident := s.ssoIdentity(func() ([]string, bool) { return groups, true }, func() map[string]any {
		out := make(map[string]any, len(attrs))
		for k, vs := range attrs {
			l := make([]any, len(vs))
			for i, v := range vs {
				l[i] = v
			}
			out[k] = l
		}
		return out
	}, true)
	var resolveErr error
	resolve := func(opts any, remove bool, rule map[string]any, mapID string) *bool {
		return ident.Resolve(ldapTriggers(rule), mapID, func() *bool {
			st, err := lu.GroupsExpression(opts, remove)
			if err != nil && resolveErr == nil {
				resolveErr = err
			}
			return st
		}, remove)
	}
	desiredOrgs := orgStates{}
	roles := []struct{ role, opt string }{{"admin_role", "admins"}, {"auditor_role", "auditors"}, {"member_role", "users"}}
	for _, e := range orgMap {
		orgRemove := pyBoolOf(e.Opts, "remove", true)
		states := map[string]bool{}
		for _, r := range roles {
			st := resolve(e.Opts[r.opt], pyBoolOf(e.Opts, "remove_"+r.opt, orgRemove), ruleOf(e.Opts["triggers_"+r.opt]), fmt.Sprintf("organization %s %s", e.Name, r.opt))
			if st != nil {
				states[r.role] = *st
			}
		}
		if len(states) > 0 {
			desiredOrgs[e.Name] = states
		}
	}
	desiredTeams := teamStates{}
	for _, e := range teamMap {
		if _, ok := e.Opts["organization"]; !ok {
			continue
		}
		st := resolve(e.Opts["users"], pyBoolOf(e.Opts, "remove", true), ruleOf(e.Opts["triggers"]), "team "+e.Name)
		if st != nil {
			org, _ := e.Opts["organization"].(string)
			desiredTeams.set(org, e.Name, "member_role", *st)
		}
	}
	if resolveErr != nil {
		return nil, resolveErr
	}
	var u *auth.User
	if len(ids) == 1 {
		if u, err = auth.UserByID(ctx, s.Q(), ids[0]); err != nil {
			return nil, err
		}
		if err := s.ssoUpdateUser(ctx, u, f); err != nil {
			return nil, err
		}
	} else {
		log.Info("Creating Django user " + username)
		if u, err = s.ssoCreateUser(ctx, username, f); err != nil {
			return nil, err
		}
	}
	if _, err := s.Q().Exec(ctx, `INSERT INTO main_profile (created, modified, ldap_dn, user_id, language, theme) VALUES (now(), now(), $2, $1, '', '')
		ON CONFLICT (user_id) DO UPDATE SET ldap_dn = EXCLUDED.ldap_dn, modified = now() WHERE main_profile.ldap_dn IS DISTINCT FROM EXCLUDED.ldap_dn`, u.ID, lu.DN); err != nil {
		return nil, err
	}
	if err := s.ssoReconcile(ctx, u, desiredOrgs, desiredTeams, "LDAP"); err != nil {
		return nil, err
	}
	return auth.UserByID(ctx, s.Q(), u.ID)
}

// ldapTriggers folds a rule's group DNs to lower case as is_member_of did.
func ldapTriggers(rule map[string]any) map[string]any {
	g, ok := rule["groups"].(map[string]any)
	if !ok {
		return rule
	}
	out := make(map[string]any, len(rule))
	for k, v := range rule {
		out[k] = v
	}
	folded := make(map[string]any, len(g))
	for op, dns := range g {
		l, ok := dns.([]any)
		if !ok {
			folded[op] = dns
			continue
		}
		nl := make([]any, len(l))
		for i, x := range l {
			if s, ok := x.(string); ok {
				nl[i] = strings.ToLower(s)
			} else {
				nl[i] = x
			}
		}
		folded[op] = nl
	}
	out["groups"] = folded
	return out
}

// ssoCreateUser creates an account for an external login: an unusable
// password, and the activity entry with no actor.
func (s *Server) ssoCreateUser(ctx context.Context, username string, f ssoUserFields) (*auth.User, error) {
	v := &userWrite{Username: username}
	if f.FirstName != nil {
		v.FirstName = *f.FirstName
	}
	if f.LastName != nil {
		v.LastName = *f.LastName
	}
	if f.Email != nil {
		v.Email = *f.Email
	}
	if f.IsSuperuser != nil {
		v.IsSuperuser = *f.IsSuperuser
	}
	v.IsSystemAuditor = f.IsSystemAuditor
	var id int64
	err := s.DB.Tx(ctx, func(tx pgx.Tx) error {
		var err error
		id, err = s.createUser(ctx, tx, nil, v)
		return err
	})
	if err != nil {
		return nil, err
	}
	return auth.UserByID(ctx, s.Q(), id)
}

// ssoUpdateUser writes what an external login changed on an existing
// account, recorded as user.save() did.
func (s *Server) ssoUpdateUser(ctx context.Context, u *auth.User, f ssoUserFields) error {
	next := *u
	if f.FirstName != nil {
		next.FirstName = *f.FirstName
	}
	if f.LastName != nil {
		next.LastName = *f.LastName
	}
	if f.Email != nil {
		next.Email = *f.Email
	}
	if f.IsSuperuser != nil {
		next.IsSuperuser = *f.IsSuperuser
	}
	auditorChanged := f.IsSystemAuditor != nil && *f.IsSystemAuditor != u.IsSystemAuditor
	if next.FirstName == u.FirstName && next.LastName == u.LastName && next.Email == u.Email && next.IsSuperuser == u.IsSuperuser && !auditorChanged {
		return nil
	}
	return s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if auditorChanged {
			if err := s.setSingleton(ctx, tx, "system_auditor", u.ID, *f.IsSystemAuditor); err != nil {
				return err
			}
		}
		if next.FirstName == u.FirstName && next.LastName == u.LastName && next.Email == u.Email && next.IsSuperuser == u.IsSuperuser {
			return nil
		}
		if _, err := tx.Exec(ctx, `UPDATE auth_user SET first_name = $2, last_name = $3, email = $4, is_superuser = $5 WHERE id = $1`,
			u.ID, next.FirstName, next.LastName, next.Email, next.IsSuperuser); err != nil {
			return err
		}
		// The save that stored the user synced the System Administrator
		// role to is_superuser (sync_superuser_status_to_rbac).
		if err := s.setSingleton(ctx, tx, "system_administrator", u.ID, next.IsSuperuser); err != nil {
			return err
		}
		changes := diffChanges(userChanges(u), userChanges(&next))
		if len(changes) == 0 {
			return nil
		}
		return s.Activity.Record(ctx, tx, activity.Entry{Operation: "update", Object1: "user", Changes: changes, Links: map[string]int64{"user": u.ID}})
	})
}
