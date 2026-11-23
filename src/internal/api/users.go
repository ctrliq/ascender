package api

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"unicode"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/activity"
	"github.com/ctrliq/ascender/internal/auth"
	"github.com/ctrliq/ascender/internal/crypto"
	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/models"
	"github.com/ctrliq/ascender/internal/rbac"
)

var userFields = userFieldsAlias("u")

func init() {
	resourceRegistrars = append(resourceRegistrars, func(s *Server, mux *http.ServeMux) {
		s.route(mux, "/api/v2/users/{$}", methodMap{"GET": s.userList, "POST": s.userCreate}, s.optionsFor("users"))
		s.route(mux, "/api/v2/users/{id}/{$}", methodMap{"GET": s.userDetail, "PUT": s.userUpdate, "PATCH": s.userUpdate, "DELETE": s.userDelete}, s.optionsFor("users"))
		s.route(mux, "/api/v2/users/{id}/teams/{$}", methodMap{"GET": s.userTeams}, s.optionsFor("teams"))
		s.route(mux, "/api/v2/users/{id}/organizations/{$}", methodMap{"GET": s.userOrganizations}, s.optionsFor("organizations"))
		s.route(mux, "/api/v2/users/{id}/admin_of_organizations/{$}", methodMap{"GET": s.userAdminOfOrganizations}, s.optionsFor("organizations"))
		s.route(mux, "/api/v2/users/{id}/projects/{$}", methodMap{"GET": s.userProjects}, s.optionsFor("projects"))
		s.route(mux, "/api/v2/users/{id}/credentials/{$}", methodMap{"GET": s.userCredentials, "POST": s.credentialSubCreate(credentialsOfUser)}, s.optionsFor("credentials"))
		s.route(mux, "/api/v2/users/{id}/roles/{$}", methodMap{"GET": s.userRoles, "POST": s.userRolesAttach}, s.optionsFor("roles"))
		s.route(mux, "/api/v2/users/{id}/access_list/{$}", methodMap{"GET": s.accessListRoute("auth.user", userObj.parentCheck(s))}, s.optionsFor("users"))
		s.route(mux, "/api/v2/roles/{$}", methodMap{"GET": s.roleList}, s.optionsFor("roles"))
		s.route(mux, "/api/v2/roles/{id}/{$}", methodMap{"GET": s.roleDetail}, s.optionsFor("roles"))
		s.route(mux, "/api/v2/roles/{id}/users/{$}", methodMap{"GET": s.roleUsers, "POST": s.roleUsersAttach}, s.optionsFor("users"))
		s.route(mux, "/api/v2/roles/{id}/teams/{$}", methodMap{"GET": s.roleTeams, "POST": s.roleTeamsAttach}, s.optionsFor("teams"))
		s.route(mux, "/api/v2/roles/{id}/parents/{$}", methodMap{"GET": s.roleParents}, s.optionsFor("roles"))
		s.route(mux, "/api/v2/roles/{id}/children/{$}", methodMap{"GET": s.roleChildren}, s.optionsFor("roles"))
	})
}

func scanUserRow(rows pgx.Rows) (any, error) { return auth.ScanUser(rows) }

func (s *Server) userSpec(access func(q *Query, u *auth.User)) ListSpec {
	return ListSpec{Model: "User", From: "auth_user u", Columns: auth.UserColumns, PK: "u.id", Fields: userFields, DefaultOrder: []string{"username"}, Access: access}
}

// ---------------------------------------------------------------- access

// orgRoleIDs returns the organizations on which a user holds roleField.
// The result is shared within a read-only request: callers must not change
// it.
func (s *Server) orgsWithRole(ctx context.Context, userID int64, roleField string) map[int64]bool {
	return memoized(ctx, "orgsWithRole/"+itoa(userID)+"/"+roleField, func() map[int64]bool { return s.loadOrgsWithRole(ctx, userID, roleField) })
}

// preloadOrgsWithRole reads orgsWithRole for several users in one
// statement, for a read-only request's memo.
func (s *Server) preloadOrgsWithRole(ctx context.Context, userIDs []int64, roleField string) {
	if !hasReadMemo(ctx) || len(userIDs) == 0 {
		return
	}
	out := map[int64]map[int64]bool{}
	for _, id := range userIDs {
		out[id] = map[int64]bool{}
	}
	rows, err := s.Q().Query(ctx, `SELECT DISTINCT m.user_id, a.object_id FROM main_rbac_role_ancestors a JOIN main_rbac_roles_members m ON m.role_id = a.ancestor_id
		WHERE m.user_id = ANY($1) AND a.content_type_id = $2 AND a.role_field = $3`, userIDs, s.CT.ID("main.organization"), roleField)
	if err != nil {
		return
	}
	defer rows.Close()
	for rows.Next() {
		var uid, oid int64
		if rows.Scan(&uid, &oid) != nil {
			return
		}
		out[uid][oid] = true
	}
	if rows.Err() != nil {
		return
	}
	for id, m := range out {
		remember(ctx, "orgsWithRole/"+itoa(id)+"/"+roleField, m)
	}
}

func (s *Server) loadOrgsWithRole(ctx context.Context, userID int64, roleField string) map[int64]bool {
	out := map[int64]bool{}
	rows, err := s.Q().Query(ctx, `SELECT DISTINCT a.object_id FROM main_rbac_role_ancestors a JOIN main_rbac_roles_members m ON m.role_id = a.ancestor_id
		WHERE m.user_id = $1 AND a.content_type_id = $2 AND a.role_field = $3`, userID, s.CT.ID("main.organization"), roleField)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var id int64
		if rows.Scan(&id) == nil {
			out[id] = true
		}
	}
	s.logRowsErr(ctx, "loadOrgsWithRole", rows)
	return out
}

// seesAllUsers is ORG_ADMINS_CAN_SEE_ALL_USERS for an organization admin
// or auditor.
func (s *Server) seesAllUsers(ctx context.Context, u *auth.User) bool {
	if !s.Settings.Bool(ctx, "ORG_ADMINS_CAN_SEE_ALL_USERS") {
		return false
	}
	return len(s.orgsWithRole(ctx, u.ID, "admin_role")) > 0 || len(s.orgsWithRole(ctx, u.ID, "auditor_role")) > 0
}

// userVisibleClause is UserAccess.filtered_queryset; "" means all users.
func (s *Server) userVisibleClause(ctx context.Context, q *Query, u *auth.User, col string) string {
	if u.IsSuperuser || u.IsSystemAuditor || s.seesAllUsers(ctx, u) {
		return ""
	}
	v := q.Arg(u.ID)
	return `(` + col + ` = ` + v + ` OR ` + col + ` IN (SELECT um.user_id FROM main_rbac_roles_members um JOIN main_organization uo ON uo.member_role_id = um.role_id
		WHERE uo.id IN (` + accessibleSQL(q, u.ID, s.CT.ID("main.organization"), "read_role") + `))
		OR ` + col + ` IN (SELECT sm.user_id FROM main_rbac_roles_members sm JOIN main_rbac_roles sr ON sr.id = sm.role_id WHERE sr.singleton_name IN ('system_administrator', 'system_auditor')))`
}

func (s *Server) canReadUser(ctx context.Context, viewer *auth.User, targetID int64) bool {
	q := NewQuery()
	clause := s.userVisibleClause(ctx, q, viewer, "u.id")
	if clause == "" {
		return true
	}
	args := append(q.Args, targetID)
	var ok bool
	_ = db.Tolerant(s.Q()).QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM auth_user u WHERE `+clause+` AND u.id = $`+itoa(int64(len(args)))+`)`, args...).Scan(&ok)
	return ok
}

// canReadTeam is TeamAccess.can_read.
func (s *Server) canReadTeam(ctx context.Context, viewer *auth.User, t *team) bool {
	if viewer.IsSuperuser || viewer.IsSystemAuditor || s.seesAllUsers(ctx, viewer) {
		return true
	}
	if t.OrganizationID != nil && s.orgsWithRole(ctx, viewer.ID, "member_role")[*t.OrganizationID] {
		return true
	}
	return s.userHasRoleOn(ctx, viewer.ID, "main.team", t.ID, "read_role")
}

// teamVisibleClause is TeamAccess.filtered_queryset; "" means all teams.
func (s *Server) teamVisibleClause(ctx context.Context, q *Query, u *auth.User) string {
	if u.IsSuperuser || u.IsSystemAuditor || s.seesAllUsers(ctx, u) {
		return ""
	}
	return `(t.organization_id IN (` + accessibleSQL(q, u.ID, s.CT.ID("main.organization"), "member_role") + `) OR t.id IN (` + accessibleSQL(q, u.ID, s.CT.ID("main.team"), "read_role") + `))`
}

// canAdminUser is UserAccess.can_admin.
func (s *Server) canAdminUser(ctx context.Context, viewer *auth.User, targetID int64, allowOrphans bool) bool {
	if viewer.IsSuperuser {
		return true
	}
	if !s.Settings.Bool(ctx, "MANAGE_ORGANIZATION_AUTH") {
		return false
	}
	target, err := auth.UserByID(ctx, s.Q(), targetID)
	if err != nil {
		return false
	}
	return s.canAdminUserObj(ctx, viewer, target, allowOrphans)
}

// canAdminUserObj is canAdminUser for a target already loaded.
func (s *Server) canAdminUserObj(ctx context.Context, viewer, target *auth.User, allowOrphans bool) bool {
	if viewer.IsSuperuser {
		return true
	}
	if !s.Settings.Bool(ctx, "MANAGE_ORGANIZATION_AUTH") {
		return false
	}
	targetID := target.ID
	if target.IsSuperuser || target.IsSystemAuditor {
		return false
	}
	member := s.orgsWithRole(ctx, targetID, "member_role")
	if len(member) == 0 {
		if !allowOrphans {
			return false
		}
		// Every role of the user must descend from one of the admin's.
		// A failed lookup refuses, as a stray role would.
		var stray bool
		if err := s.Q().QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM main_rbac_roles_members m WHERE m.user_id = $1 AND NOT EXISTS (
			SELECT 1 FROM main_rbac_role_ancestors a WHERE a.descendent_id = m.role_id AND a.ancestor_id IN (SELECT role_id FROM main_rbac_roles_members WHERE user_id = $2)))`, targetID, viewer.ID).Scan(&stray); err != nil {
			return false
		}
		return !stray
	}
	admin := s.orgsWithRole(ctx, viewer.ID, "admin_role")
	for id := range member {
		if !admin[id] {
			return false
		}
	}
	return true
}

// canChangeUser is UserAccess.can_change with the data checks.
func (s *Server) canChangeUser(ctx context.Context, viewer, target *auth.User, data *OMap) bool {
	if data != nil {
		if v, ok := data.Get("is_superuser"); ok && truthyValue(v) && !viewer.IsSuperuser {
			return false
		}
		if v, ok := data.Get("is_system_auditor"); ok && truthyValue(v) && !(viewer.IsSuperuser || viewer.ID == target.ID) {
			return false
		}
	}
	if !s.Settings.Bool(ctx, "MANAGE_ORGANIZATION_AUTH") && !viewer.IsSuperuser {
		return false
	}
	return viewer.ID == target.ID || s.canAdminUserObj(ctx, viewer, target, false)
}

// canDeleteUser is UserAccess.can_delete.
func (s *Server) canDeleteUser(ctx context.Context, viewer, target *auth.User) bool {
	if viewer.ID == target.ID {
		return false
	}
	if target.IsSuperuser {
		n := memoized(ctx, "superusers", func() int {
			var n int
			if err := s.Q().QueryRow(ctx, `SELECT count(*) FROM auth_user WHERE is_superuser`).Scan(&n); err != nil {
				// Unknown: guard the last superuser as if this were one.
				s.Log.ErrorContext(ctx, "counting superusers", "err", err)
				return 1
			}
			return n
		})
		if n == 1 {
			return false
		}
	}
	return s.canAdminUserObj(ctx, viewer, target, true)
}

// userCaps is the edit/delete pair UserSerializer showed.
func (s *Server) userCaps(ctx context.Context, viewer, target *auth.User) (bool, bool) {
	if !s.Settings.Bool(ctx, "MANAGE_ORGANIZATION_AUTH") {
		return viewer.IsSuperuser, viewer.IsSuperuser
	}
	if !viewer.CanWrite() {
		return false, false
	}
	return s.canChangeUser(ctx, viewer, target, nil), s.canDeleteUser(ctx, viewer, target)
}

// truthyValue is to_python_boolean for permission checks.
func truthyValue(v any) bool {
	switch t := v.(type) {
	case bool:
		return t
	case string:
		switch strings.ToLower(t) {
		case "true", "1", "yes", "on", "t", "y":
			return true
		}
	case json.Number:
		return t.String() != "0"
	case float64:
		return t != 0
	}
	return false
}

// ---------------------------------------------------------------- serialize

// serializeUserWith renders a user; caps adds user_capabilities for viewer.
func (s *Server) serializeUserWith(c *SerCtx, target *auth.User, viewer *auth.User, caps bool) (*OMap, error) {
	o, err := s.serializeUser(c, target, viewer)
	if err != nil {
		return nil, err
	}
	summary := NewOMap()
	if caps && viewer != nil && c.WantSummary("user_capabilities") {
		edit, del := s.userCaps(c.Ctx(), viewer, target)
		summary.Set("user_capabilities", Caps("edit", edit, "delete", del))
	}
	o.Set("summary_fields", summary)
	return o, nil
}

func (s *Server) userListWith(w http.ResponseWriter, r *http.Request, extra func(q *Query), filterAccess bool) error {
	viewer, err := RequireUser(r)
	if err != nil {
		return err
	}
	ctx := r.Context()
	var access func(q *Query, u *auth.User)
	if filterAccess {
		access = func(q *Query, u *auth.User) {
			if c := s.userVisibleClause(ctx, q, u, "u.id"); c != "" {
				q.And(c)
			}
		}
	}
	rows, count, page, err := s.RunList(r, s.userSpec(access), extra, scanUserRow)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, false)
	ids := make([]int64, len(rows))
	for i, row := range rows {
		ids[i] = row.(*auth.User).ID
	}
	if err := c.preloadUserExtras(ids); err != nil {
		return err
	}
	s.preloadOrgsWithRole(ctx, ids, "member_role")
	results := make([]any, 0, len(rows))
	for _, row := range rows {
		o, err := s.serializeUserWith(c, row.(*auth.User), viewer, true)
		if err != nil {
			return err
		}
		results = append(results, o)
	}
	WriteJSON(w, 200, Paginate(r, page, count, results))
	return nil
}

func (s *Server) userList(w http.ResponseWriter, r *http.Request) error {
	return s.userListWith(w, r, nil, true)
}

// userObj is a user (UserAccess.can_read).
var userObj = &pathObject[*auth.User]{
	model:    "User",
	get:      auth.UserByID,
	readable: func(c *SerCtx, v *auth.User) bool { return c.S.canReadUser(c.Ctx(), c.User, v.ID) },
}

func (s *Server) userDetail(w http.ResponseWriter, r *http.Request) error {
	viewer, target, err := userObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	o, err := s.serializeUserWith(s.NewSerCtx(r, true), target, viewer, true)
	if err != nil {
		return err
	}
	WriteJSON(w, 200, o)
	return nil
}

// ---------------------------------------------------------------- write

var usernameRe = regexp.MustCompile(`^[\w.@+-]+$`)

// emailRe approximates Django's EmailValidator.
var emailRe = regexp.MustCompile(`^(?i)[-!#$%&'*+/=?^_` + "`" + `{}|~0-9a-z]+(\.[-!#$%&'*+/=?^_` + "`" + `{}|~0-9a-z]+)*@((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}|localhost|\[[0-9a-f:.]+\])$`)

var supportedLocales = []string{"ar", "en", "es", "fr", "hi", "ja", "ko", "nl", "zh"}

var themeIDRe = regexp.MustCompile(`^[a-z0-9][a-z0-9_-]*$`)

// userWrite holds the writable fields of a user while it is validated.
type userWrite struct {
	Username, FirstName, LastName, Email string
	IsSuperuser                          bool
	IsSystemAuditor                      *bool
	Password                             *string
	Language, Theme                      *string
}

// ldapManagedFields is _validate_ldap_managed_field: an LDAP user's
// username and the fields LDAP sets cannot be changed by hand.
func (s *Server) ldapManagedFields(ctx context.Context, f *Form, v *userWrite, current *auth.User) {
	if current == nil || s.Settings.String(ctx, "AUTH_LDAP_SERVER_URI") == "" {
		return
	}
	p, err := models.LoadProfile(ctx, s.Q(), current.ID)
	if err != nil || p.LDAPDN == "" {
		return
	}
	managed := map[string]bool{"username": true}
	for _, key := range []string{"AUTH_LDAP_USER_ATTR_MAP", "AUTH_LDAP_USER_FLAGS_BY_GROUP"} {
		val, _ := s.Settings.Get(ctx, key)
		if m, ok := val.(map[string]any); ok {
			for k := range m {
				managed[k] = true
			}
		}
	}
	for _, c := range []struct {
		field   string
		changed bool
	}{
		{"username", v.Username != current.Username},
		{"first_name", v.FirstName != current.FirstName},
		{"last_name", v.LastName != current.LastName},
		{"email", v.Email != current.Email},
		{"is_superuser", v.IsSuperuser != current.IsSuperuser},
	} {
		if managed[c.field] && c.changed && f.Has(c.field) && !f.Errs.Has(c.field) {
			f.Errs.Add(c.field, "Unable to change "+c.field+" on user managed by LDAP.")
		}
	}
}

// superuserOnlyIdentity is _validate_superuser_only_identity: with
// RESTRICT_USER_IDENTITY_TO_SUPERUSERS on, only a superuser may set a new
// user's email or change any user's username or email, the viewer's own
// included. The SSO user flags trust usernames only then (oidc/entra
// USER_FLAGS username lists). A field already refused is not checked again.
func (s *Server) superuserOnlyIdentity(ctx context.Context, f *Form, v *userWrite, current, viewer *auth.User) {
	if viewer == nil || viewer.IsSuperuser || !s.Settings.Bool(ctx, "RESTRICT_USER_IDENTITY_TO_SUPERUSERS") {
		return
	}
	if current == nil {
		// A new user needs a username; the email is for a superuser to set.
		if f.Has("email") && v.Email != "" && !f.Errs.Has("email") {
			f.Errs.Add("email", "Only a superuser can set the email of a user.")
		}
		return
	}
	for _, c := range []struct {
		field   string
		changed bool
	}{
		{"username", v.Username != current.Username},
		{"email", v.Email != current.Email},
	} {
		if c.changed && f.Has(c.field) && !f.Errs.Has(c.field) {
			f.Errs.Add(c.field, "Only a superuser can change the "+c.field+" of a user.")
		}
	}
}

// userFromForm validates the UserSerializer fields onto v, for viewer.
func (s *Server) userFromForm(ctx context.Context, f *Form, v *userWrite, current, viewer *auth.User) {
	name := f.String("username", true, 150, v.Username)
	if f.Has("username") && !f.Errs.Has("username") {
		if !usernameRe.MatchString(name) {
			f.Errs.Add("username", "Enter a valid username. This value may contain only letters, numbers, and @/./+/-/_ characters.")
		} else {
			var taken bool
			var exclude int64
			if current != nil {
				exclude = current.ID
			}
			_ = db.Tolerant(s.Q()).QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM auth_user WHERE username = $1 AND id <> $2)`, name, exclude).Scan(&taken)
			if taken {
				f.Errs.Add("username", "A user with that username already exists.")
			}
		}
	}
	v.Username = name
	v.FirstName = f.String("first_name", false, 150, v.FirstName)
	v.LastName = f.String("last_name", false, 150, v.LastName)
	email := f.String("email", false, 254, v.Email)
	if f.Has("email") && email != "" && !f.Errs.Has("email") && !emailRe.MatchString(email) {
		f.Errs.Add("email", "Enter a valid email address.")
	}
	v.Email = email
	v.IsSuperuser = f.Bool("is_superuser", v.IsSuperuser)
	s.ldapManagedFields(ctx, f, v, current)
	s.superuserOnlyIdentity(ctx, f, v, current, viewer)
	if f.Has("is_system_auditor") {
		b := f.Bool("is_system_auditor", false)
		v.IsSystemAuditor = &b
	}
	if f.Has("password") {
		p := f.String("password", false, 0, "")
		if !(current == nil && p == "") {
			if msg := s.passwordProblem(ctx, p); msg != "" {
				f.Errs.Add("password", msg)
			}
		}
		v.Password = &p
	}
	if f.Has("preferred_language") {
		l := f.String("preferred_language", false, 0, "")
		if l != "" && !contains(supportedLocales, l) {
			f.Errs.Add("preferred_language", "Unsupported language code. Must be one of: "+strings.Join(supportedLocales, ", ")+".")
		}
		v.Language = &l
	}
	if f.Has("preferred_theme") {
		t := f.String("preferred_theme", false, 32, "")
		if t != "" && !f.Errs.Has("preferred_theme") && !themeIDRe.MatchString(t) {
			f.Errs.Add("preferred_theme", "A theme id is lowercase letters, digits, hyphens and underscores.")
		}
		v.Theme = &t
	}
}

func contains(list []string, v string) bool {
	for _, x := range list {
		if x == v {
			return true
		}
	}
	return false
}

// passwordProblem is UserSerializer.validate_password.
func (s *Server) passwordProblem(ctx context.Context, p string) string {
	// Characters, as Python's len counted them, not bytes.
	if len([]rune(p)) > 128 {
		return "Password max length is 128"
	}
	if n := s.Settings.Int(ctx, "LOCAL_PASSWORD_MIN_LENGTH"); n > 0 && int64(len([]rune(p))) < n {
		return fmt.Sprintf("Password must be at least %d characters long.", n)
	}
	count := func(pred func(rune) bool) int64 {
		var c int64
		for _, r := range p {
			if pred(r) {
				c++
			}
		}
		return c
	}
	if n := s.Settings.Int(ctx, "LOCAL_PASSWORD_MIN_DIGITS"); n > 0 && count(unicode.IsDigit) < n {
		return fmt.Sprintf("Password must contain at least %d digits.", n)
	}
	if n := s.Settings.Int(ctx, "LOCAL_PASSWORD_MIN_UPPER"); n > 0 && count(unicode.IsUpper) < n {
		return fmt.Sprintf("Password must contain at least %d uppercase characters.", n)
	}
	if n := s.Settings.Int(ctx, "LOCAL_PASSWORD_MIN_SPECIAL"); n > 0 && count(func(r rune) bool { return !unicode.IsLetter(r) && !unicode.IsDigit(r) }) < n {
		return fmt.Sprintf("Password must contain at least %d special characters.", n)
	}
	return ""
}

// unusablePassword is Django's make_password(None).
func unusablePassword() string {
	const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	b := make([]byte, 40)
	_, _ = rand.Read(b)
	for i := range b {
		b[i] = chars[int(b[i])%len(chars)]
	}
	return "!" + string(b)
}

// userChanges is model_to_dict over the User fields the serializer has.
func userChanges(u *auth.User) map[string]any {
	return map[string]any{"id": u.ID, "password": "hidden", "last_login": models.FormatTimePtr(u.LastLogin), "is_superuser": u.IsSuperuser,
		"username": u.Username, "first_name": u.FirstName, "last_name": u.LastName, "email": u.Email}
}

// createUser inserts a validated user, its profile, its system auditor
// membership and the activity entry, inside tx.
func (s *Server) createUser(ctx context.Context, tx pgx.Tx, actor *auth.User, v *userWrite) (int64, error) {
	hash := unusablePassword()
	if v.Password != nil && *v.Password != "" && *v.Password != "$encrypted$" {
		h, err := crypto.MakePassword(*v.Password)
		if err != nil {
			return 0, err
		}
		hash = h
	}
	var id int64
	if err := tx.QueryRow(ctx, `INSERT INTO auth_user (password, last_login, is_superuser, username, first_name, last_name, email, is_staff, is_active, date_joined)
		VALUES ($1, NULL, $2, $3, $4, $5, $6, false, true, now()) RETURNING id`, hash, v.IsSuperuser, v.Username, v.FirstName, v.LastName, v.Email).Scan(&id); err != nil {
		return 0, err
	}
	lang, theme := "", ""
	if v.Language != nil {
		lang = *v.Language
	}
	if v.Theme != nil {
		theme = *v.Theme
	}
	if err := models.SaveProfile(ctx, tx, id, lang, theme); err != nil {
		return 0, err
	}
	if v.IsSuperuser {
		if err := s.setSingleton(ctx, tx, "system_administrator", id, true); err != nil {
			return 0, err
		}
	}
	if v.IsSystemAuditor != nil && *v.IsSystemAuditor {
		if err := s.setSingleton(ctx, tx, "system_auditor", id, true); err != nil {
			return 0, err
		}
	}
	if err := models.RegisterResource(ctx, tx, "shared.user", id, v.Username); err != nil {
		return 0, err
	}
	created, err := auth.UserByID(ctx, tx, id)
	if err != nil {
		return 0, err
	}
	e := activity.Entry{Operation: "create", Object1: "user", Changes: userChanges(created), Links: map[string]int64{"user": id}}
	if actor != nil {
		e.ActorID = &actor.ID
	}
	return id, s.Activity.Record(ctx, tx, e)
}

// setSingleton adds or removes a user from a system role.
func (s *Server) setSingleton(ctx context.Context, tx pgx.Tx, name string, userID int64, member bool) error {
	roleID, err := rbac.SingletonRoleID(ctx, tx, name)
	if err != nil {
		return err
	}
	if member {
		_, err = tx.Exec(ctx, `INSERT INTO main_rbac_roles_members (role_id, user_id) SELECT $1, $2 WHERE NOT EXISTS (SELECT 1 FROM main_rbac_roles_members WHERE role_id = $1 AND user_id = $2)`, roleID, userID)
	} else {
		_, err = tx.Exec(ctx, `DELETE FROM main_rbac_roles_members WHERE role_id = $1 AND user_id = $2`, roleID, userID)
	}
	return err
}

func (s *Server) userCreate(w http.ResponseWriter, r *http.Request) error {
	viewer, err := RequireWrite(r)
	if err != nil {
		return err
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	// UserPermission: only system administrators create users here.
	if !viewer.IsSuperuser {
		if len(body.Keys()) == 0 && len(s.orgsWithRole(r.Context(), viewer.ID, "admin_role")) > 0 {
			// The browsable API's empty form; validation answers it.
		} else {
			return ErrForbidden
		}
	}
	return s.createUserFromBody(w, r, viewer, body, nil)
}

// createUserFromBody validates and creates a user; after runs inside the
// transaction once the user exists (organization membership).
func (s *Server) createUserFromBody(w http.ResponseWriter, r *http.Request, viewer *auth.User, body *OMap, after func(ctx context.Context, tx pgx.Tx, id int64) error) error {
	ctx := r.Context()
	f := NewForm(body, false)
	v := &userWrite{}
	s.userFromForm(ctx, f, v, nil, viewer)
	if err := f.Err(); err != nil {
		return err
	}
	if !viewer.IsSuperuser {
		if v.IsSuperuser || (v.IsSystemAuditor != nil && *v.IsSystemAuditor) {
			return ErrForbidden
		}
		if !s.Settings.Bool(ctx, "MANAGE_ORGANIZATION_AUTH") || len(s.orgsWithRole(ctx, viewer.ID, "admin_role")) == 0 {
			return ErrForbidden
		}
	}
	var id int64
	err := s.DB.Tx(ctx, func(tx pgx.Tx) error {
		var err error
		if id, err = s.createUser(ctx, tx, viewer, v); err != nil {
			return err
		}
		if after != nil {
			return after(ctx, tx, id)
		}
		return nil
	})
	if err != nil {
		return err
	}
	created, err := auth.UserByID(ctx, s.Q(), id)
	if err != nil {
		return err
	}
	o, err := s.serializeUserWith(s.NewSerCtx(r, true), created, viewer, true)
	if err != nil {
		return err
	}
	w.Header().Set("Location", URLFor("users", id))
	WriteJSON(w, http.StatusCreated, o)
	return nil
}

func (s *Server) userUpdate(w http.ResponseWriter, r *http.Request) error {
	viewer, target, err := userObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	ctx := r.Context()
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	if !s.canChangeUser(ctx, viewer, target, body) {
		return ErrForbidden
	}
	// UserDetail.update_filter: fields only administrators may change.
	var check []string
	if !viewer.IsSuperuser {
		check = append(check, "is_superuser", "is_system_auditor")
	}
	if !s.canAdminUser(ctx, viewer, target.ID, false) {
		check = append(check, "username", "is_active")
	}
	current := map[string]any{"is_superuser": target.IsSuperuser, "is_system_auditor": target.IsSystemAuditor, "username": target.Username, "is_active": target.IsActive}
	var bad []string
	for _, k := range check {
		if v, ok := body.Get(k); ok && v != nil && !sameValue(current[k], v) {
			bad = append(bad, k)
		}
	}
	if len(bad) > 0 {
		return Detail(http.StatusForbidden, "Cannot change "+strings.Join(bad, ", ")+".")
	}
	f := NewForm(body, r.Method == http.MethodPatch)
	v := &userWrite{Username: target.Username, FirstName: target.FirstName, LastName: target.LastName, Email: target.Email, IsSuperuser: target.IsSuperuser}
	s.userFromForm(ctx, f, v, target, viewer)
	if err := f.Err(); err != nil {
		return err
	}
	before := userChanges(target)
	passwordChanged := false
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `UPDATE auth_user SET username = $2, first_name = $3, last_name = $4, email = $5, is_superuser = $6 WHERE id = $1`,
			target.ID, v.Username, v.FirstName, v.LastName, v.Email, v.IsSuperuser); err != nil {
			return err
		}
		// sync_superuser_status_to_rbac ran on every save of the user, not
		// only when is_superuser changed.
		if err := s.setSingleton(ctx, tx, "system_administrator", target.ID, v.IsSuperuser); err != nil {
			return err
		}
		profile, err := models.LoadProfile(ctx, tx, target.ID)
		if err != nil {
			return err
		}
		lang, theme := profile.Language, profile.Theme
		if v.Language != nil {
			lang = *v.Language
		}
		if v.Theme != nil {
			theme = *v.Theme
		}
		if err := models.SaveProfile(ctx, tx, target.ID, lang, theme); err != nil {
			return err
		}
		kind, err := s.externalAccount(ctx, tx, target.ID)
		if err != nil {
			return err
		}
		external := kind != ""
		if v.Password != nil && *v.Password != "" && *v.Password != "$encrypted$" && !external {
			h, err := crypto.MakePassword(*v.Password)
			if err != nil {
				return err
			}
			if _, err := tx.Exec(ctx, `UPDATE auth_user SET password = $2 WHERE id = $1`, target.ID, h); err != nil {
				return err
			}
			passwordChanged = true
		}
		if v.IsSystemAuditor != nil && *v.IsSystemAuditor != target.IsSystemAuditor {
			if err := s.setSingleton(ctx, tx, "system_auditor", target.ID, *v.IsSystemAuditor); err != nil {
				return err
			}
		}
		if v.Username != target.Username {
			if err := models.RenameResource(ctx, tx, "shared.user", target.ID, v.Username); err != nil {
				return err
			}
		}
		updated, err := auth.UserByID(ctx, tx, target.ID)
		if err != nil {
			return err
		}
		changes := diffChanges(before, userChanges(updated))
		if passwordChanged {
			changes["password"] = []any{"hidden", "hidden"}
		}
		if len(changes) == 0 {
			return nil
		}
		return s.Activity.Record(ctx, tx, activity.Entry{Operation: "update", Object1: "user", Changes: changes, ActorID: &viewer.ID, Links: map[string]int64{"user": target.ID}})
	})
	if err != nil {
		return err
	}
	if passwordChanged {
		// A new password signs the user out everywhere else, as the changed
		// session hash did; the requester's own session survives
		// (update_session_auth_hash).
		keep := ""
		if viewer.ID == target.ID {
			keep = viewer.SessionKey
		}
		if err := auth.DeleteUserSessionsExcept(ctx, s.Q(), target.ID, keep); err != nil {
			return err
		}
		if keep != "" {
			// update_session_auth_hash: the session that changed the
			// password carries the new one's hash.
			if sess, err := auth.GetSession(ctx, s.Q(), keep); err == nil {
				if fresh, err := auth.UserByID(ctx, s.Q(), target.ID); err == nil {
					sess.Data[auth.SessionHashKey] = auth.SessionAuthHash(s.Cfg.SecretKey, fresh)
					if err := auth.SaveSessionData(ctx, s.Q(), sess); err != nil {
						s.Log.ErrorContext(r.Context(), "saving session", "err", err)
					}
				}
			}
		}
	}
	updated, err := auth.UserByID(ctx, s.Q(), target.ID)
	if err != nil {
		return err
	}
	o, err := s.serializeUserWith(s.NewSerCtx(r, true), updated, viewer, true)
	if err != nil {
		return err
	}
	WriteJSON(w, 200, o)
	return nil
}

// sameValue compares a stored value with a submitted one the way the
// update filter's != did.
func sameValue(stored, submitted any) bool {
	switch t := submitted.(type) {
	case bool:
		b, ok := stored.(bool)
		return ok && b == t
	case string:
		sv, ok := stored.(string)
		return ok && sv == t
	}
	return false
}

func (s *Server) userDelete(w http.ResponseWriter, r *http.Request) error {
	viewer, target, err := userObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	ctx := r.Context()
	if !s.canDeleteUser(ctx, viewer, target) {
		return Detail(http.StatusForbidden, "Cannot delete user.")
	}
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if err := s.Activity.Record(ctx, tx, activity.Entry{Operation: "delete", Object1: "user", Changes: userChanges(target), ActorID: &viewer.ID}); err != nil {
			return err
		}
		if err := models.UnregisterResource(ctx, tx, "shared.user", target.ID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `DELETE FROM django_session WHERE session_key IN (SELECT session_id FROM main_usersessionmembership WHERE user_id = $1)`, target.ID); err != nil {
			return err
		}
		return s.Cascade.Delete(ctx, tx, "auth_user", "id", []int64{target.ID})
	})
	if err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// ---------------------------------------------------------------- sub-lists

func (s *Server) userTeams(w http.ResponseWriter, r *http.Request) error {
	_, target, err := userObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	return s.teamListWithAccess(w, r, func(q *Query) {
		q.And("t.id IN (SELECT ut.id FROM main_team ut JOIN main_rbac_roles_members um ON um.role_id IN (ut.member_role_id, ut.admin_role_id) WHERE um.user_id = " + q.Arg(target.ID) + ")")
	}, true)
}

func (s *Server) userOrganizations(w http.ResponseWriter, r *http.Request) error {
	return s.userOrgList(w, r, "member_role_id")
}

func (s *Server) userAdminOfOrganizations(w http.ResponseWriter, r *http.Request) error {
	return s.userOrgList(w, r, "admin_role_id")
}

func (s *Server) userOrgList(w http.ResponseWriter, r *http.Request, roleCol string) error {
	_, target, err := userObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	return s.organizationListWith(w, r, func(q *Query) {
		q.And("o." + roleCol + " IN (SELECT m.role_id FROM main_rbac_roles_members m WHERE m.user_id = " + q.Arg(target.ID) + ")")
	})
}

func (s *Server) userProjects(w http.ResponseWriter, r *http.Request) error {
	_, target, err := userObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	return s.projectListWith(w, r, func(q *Query) {
		q.And("ujt.id IN (" + accessibleSQL(q, target.ID, s.CT.ID("main.project"), "read_role") + ")")
	})
}

func (s *Server) userCredentials(w http.ResponseWriter, r *http.Request) error {
	_, target, err := userObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	return s.credentialListView(w, r, s.credentialSpec(), func(q *Query) {
		q.And("c.id IN (" + accessibleSQL(q, target.ID, s.CT.ID("main.credential"), "read_role") + ")")
	}, credentialsOfUser)
}

// userRoles is UserRolesList: the user's roles the viewer may see, apart
// from roles on the user itself.
func (s *Server) userRoles(w http.ResponseWriter, r *http.Request) error {
	viewer, target, err := userObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	userCT := s.CT.ID("auth.user")
	ctx := r.Context()
	return s.roleListWith(w, r, func(q *Query) {
		q.And("r.id IN (SELECT m.role_id FROM main_rbac_roles_members m WHERE m.user_id = " + q.Arg(target.ID) + ")")
		q.And("NOT (r.content_type_id IS NOT NULL AND r.content_type_id = " + q.Arg(userCT) + " AND r.object_id = " + q.Arg(target.ID) + ")")
		if c := visibleRolesClause(q, viewer, "r.id"); c != "" {
			q.And(c)
		}
	}, func(rr *roleRow) *OMap {
		return NewOMap().Set("unattach", viewer.CanWrite() && s.canUnattachRole(ctx, viewer, rr, roleSub{UserID: target.ID}, true))
	})
}

// userRolesAttach is UserRolesList.post.
func (s *Server) userRolesAttach(w http.ResponseWriter, r *http.Request) error {
	viewer, err := RequireWrite(r)
	if err != nil {
		return err
	}
	id, err := PathID(r)
	if err != nil {
		return NotFoundFor("User")
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	ctx := r.Context()
	detach := isDetach(body)
	rid, apiErr := attachID(body, "Role", detach)
	if apiErr != nil {
		return apiErr
	}
	target, err := auth.UserByID(ctx, s.Q(), id)
	if err != nil {
		return NotFound400()
	}
	rr, err := s.loadRole(ctx, rid)
	if err != nil {
		return err
	}
	if rr == nil {
		return NotFound400()
	}
	if e := s.credentialRoleGrantError(ctx, viewer, rr, target.ID, detach); e != nil {
		return e
	}
	if !s.canUnattachRole(ctx, viewer, rr, roleSub{UserID: target.ID}, false) {
		return ErrForbidden
	}
	if err := s.setRoleMember(ctx, viewer, rr, target.ID, !detach, true); err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}
