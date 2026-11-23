package api

import (
	"context"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/activity"
	"github.com/ctrliq/ascender/internal/auth"
	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/models"
	"github.com/ctrliq/ascender/internal/rbac"
)

// roleKind describes a model that holds roles: its API type and display
// name, its collection, the verbose name role descriptions use, the class
// path the activity stream records and how to read its name.
type roleKind struct {
	Type, Display, Coll, Verbose, Class, NameSQL string
	// Resource is ResourceMixin: an admin of the object may grant its roles.
	Resource bool
}

// model is the Django model class name, which the old 404s carried.
func (k roleKind) model() string { return k.Class[strings.LastIndex(k.Class, ".")+1:] }

const ujtNameSQL = `SELECT name FROM main_unifiedjobtemplate WHERE id = $1`

var roleKinds = map[string]roleKind{
	"main.organization":        {"organization", "Organization", "organizations", "organization", "ascender.main.models.organization.Organization", `SELECT name FROM main_organization WHERE id = $1`, true},
	"main.team":                {"team", "Team", "teams", "team", "ascender.main.models.organization.Team", `SELECT name FROM main_team WHERE id = $1`, true},
	"main.project":             {"project", "Project", "projects", "project", "ascender.main.models.projects.Project", ujtNameSQL, true},
	"main.inventory":           {"inventory", "Inventory", "inventories", "inventory", "ascender.main.models.inventory.Inventory", `SELECT name FROM main_inventory WHERE id = $1`, true},
	"main.credential":          {"credential", "Credential", "credentials", "credential", "ascender.main.models.credential.Credential", `SELECT name FROM main_credential WHERE id = $1`, true},
	"main.jobtemplate":         {"job_template", "Job Template", "job_templates", "job template", "ascender.main.models.jobs.JobTemplate", ujtNameSQL, true},
	"main.workflowjobtemplate": {"workflow_job_template", "Workflow Job Template", "workflow_job_templates", "workflow job template", "ascender.main.models.workflow.WorkflowJobTemplate", ujtNameSQL, true},
	"main.instancegroup":       {"instance_group", "Instance Group", "instance_groups", "instance group", "ascender.main.models.ha.InstanceGroup", `SELECT name FROM main_instancegroup WHERE id = $1`, true},
	"auth.user":                {"user", "User", "users", "user", "django.contrib.auth.models.User", `SELECT username FROM auth_user WHERE id = $1`, false},
}

// roleRow is a main_rbac_roles row.
type roleRow struct {
	ID            int64
	RoleField     string
	SingletonName *string
	ContentTypeID *int64
	ObjectID      *int64
}

const roleColumns = `r.id, r.role_field, r.singleton_name, r.content_type_id, r.object_id`

func scanRole(rows pgx.Rows) (any, error) {
	rr := &roleRow{}
	err := rows.Scan(&rr.ID, &rr.RoleField, &rr.SingletonName, &rr.ContentTypeID, &rr.ObjectID)
	return rr, err
}

func (rr *roleRow) isSingleton() bool {
	return rr.SingletonName != nil && (*rr.SingletonName == "system_administrator" || *rr.SingletonName == "system_auditor")
}

func (s *Server) loadRole(ctx context.Context, id int64) (*roleRow, error) {
	rows, err := s.Q().Query(ctx, `SELECT `+roleColumns+` FROM main_rbac_roles r WHERE r.id = $1`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	if !rows.Next() {
		return nil, rows.Err()
	}
	v, err := scanRole(rows)
	if err != nil {
		return nil, err
	}
	return v.(*roleRow), nil
}

// roleKindOf returns the content type key and kind of a role's object.
func (s *Server) roleKindOf(rr *roleRow) (string, roleKind, bool) {
	if rr.ContentTypeID == nil || rr.ObjectID == nil {
		return "", roleKind{}, false
	}
	key := s.CT.Model(*rr.ContentTypeID)
	k, ok := roleKinds[key]
	return key, k, ok
}

func (s *Server) roleResourceName(ctx context.Context, rr *roleRow) string {
	_, k, ok := s.roleKindOf(rr)
	if !ok {
		return ""
	}
	var name string
	_ = db.Tolerant(s.Q()).QueryRow(ctx, k.NameSQL, *rr.ObjectID).Scan(&name)
	return name
}

var roleFields = roleFieldSet("r")

func roleFieldSet(a string) *FieldSet {
	return &FieldSet{Model: "Role", Fields: map[string]Field{
		"id": {SQL: a + ".id", Kind: KindInt}, "role_field": {SQL: a + ".role_field"}, "singleton_name": {SQL: a + ".singleton_name"},
		"object_id": {SQL: a + ".object_id", Kind: KindInt},
		// content_type_id orders as Django's ("content_type", ...) did.
		"content_type_id": {SQL: a + ".content_type_id", Kind: KindInt},
		"content_type": {SQL: a + ".content_type_id", Kind: KindFK, Rel: &Relation{Alias: a + "ct", Join: "LEFT JOIN django_content_type " + a + "ct ON " + a + "ct.id = " + a + ".content_type_id", Target: func() *FieldSet {
			return &FieldSet{Model: "ContentType", Fields: map[string]Field{
				"id": {SQL: a + "ct.id", Kind: KindInt}, "model": {SQL: a + "ct.model"}, "app_label": {SQL: a + "ct.app_label"},
			}}
		}}},
		"members": {SQL: a + "m.user_id", Kind: KindFK, Rel: &Relation{Alias: a + "m", Join: "LEFT JOIN main_rbac_roles_members " + a + "m ON " + a + "m.role_id = " + a + ".id", Many: true, Target: func() *FieldSet { return userFieldsAlias(a + "mu") }}},
	}, SearchFields: []string{"role_field", "content_type__model"}}
}

// visibleRolesClause is Role.filter_visible_roles: the ancestors of every
// role that descends from one of the user's roles. System administrators
// and auditors see all roles (check_singleton); "" means no restriction.
func visibleRolesClause(q *Query, u *auth.User, col string) string {
	if u.IsSuperuser || u.IsSystemAuditor {
		return ""
	}
	return col + ` IN (SELECT va.ancestor_id FROM main_rbac_role_ancestors va WHERE va.descendent_id IN (SELECT vb.descendent_id FROM main_rbac_role_ancestors vb WHERE vb.ancestor_id IN (SELECT vm.role_id FROM main_rbac_roles_members vm WHERE vm.user_id = ` + q.Arg(u.ID) + `)))`
}

func (s *Server) roleSpec() ListSpec {
	return ListSpec{Model: "Role", From: "main_rbac_roles r", Columns: roleColumns, PK: "r.id", Fields: roleFields, DefaultOrder: []string{"content_type_id", "object_id", "id"}}
}

// roleCapsFunc computes the user_capabilities of a role in a list, or nil
// when the serializer shows none.
type roleCapsFunc func(rr *roleRow) *OMap

func (s *Server) roleListWith(w http.ResponseWriter, r *http.Request, extra func(q *Query), caps roleCapsFunc) error {
	rows, count, page, err := s.RunList(r, s.roleSpec(), extra, scanRole)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, false)
	results := make([]any, 0, len(rows))
	for _, row := range rows {
		rr := row.(*roleRow)
		var cp *OMap
		if caps != nil {
			cp = caps(rr)
		}
		results = append(results, s.serializeRoleRow(c, rr, cp))
	}
	WriteJSON(w, 200, Paginate(r, page, count, results))
	return nil
}

// serializeRoleRow renders a role as RoleSerializer did; caps is set for
// RoleSerializerWithParentAccess.
func (s *Server) serializeRoleRow(c *SerCtx, rr *roleRow, caps *OMap) *OMap {
	o := NewOMap().Set("id", rr.ID).Set("type", "role").Set("url", URLFor("roles", rr.ID))
	related := NewOMap().Set("users", SubURL("roles", rr.ID, "users")).Set("teams", SubURL("roles", rr.ID, "teams"))
	summary := NewOMap()
	if caps != nil {
		summary.Set("user_capabilities", caps)
	}
	verbose := ""
	if _, k, ok := s.roleKindOf(rr); ok {
		related.Set(k.Type, URLFor(k.Coll, *rr.ObjectID))
		summary.Set("resource_name", s.roleResourceName(c.Ctx(), rr)).Set("resource_type", k.Type).Set("resource_type_display_name", k.Display).Set("resource_id", *rr.ObjectID)
		verbose = k.Verbose
	}
	o.Set("related", related).Set("summary_fields", summary)
	return o.Set("name", rbacRoleName(c.Loc(), rr.RoleField)).Set("description", rbacRoleDescription(c.Loc(), rr.RoleField, verbose))
}

// roleVisible reports whether a user may read a role (RoleAccess).
func (s *Server) roleVisible(ctx context.Context, u *auth.User, roleID int64) bool {
	q := NewQuery()
	clause := visibleRolesClause(q, u, "r.id")
	if clause == "" {
		return true
	}
	var ok bool
	args := append(q.Args, roleID)
	_ = db.Tolerant(s.Q()).QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM main_rbac_roles r WHERE `+clause+` AND r.id = $`+itoa(int64(len(args)))+`)`, args...).Scan(&ok)
	if ok {
		return true
	}
	// An orphaned user that is neither administrator nor auditor still sees
	// the two system roles (RoleAccess.filtered_queryset).
	rr, err := s.loadRole(ctx, roleID)
	if err != nil || rr == nil || !rr.isSingleton() {
		return false
	}
	return !s.userHasOrganizations(ctx, u.ID)
}

// userHasOrganizations is user.organizations.exists(): membership of any
// organization's member role, directly or through an ancestor role.
func (s *Server) userHasOrganizations(ctx context.Context, userID int64) bool {
	var ok bool
	_ = db.Tolerant(s.Q()).QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM main_rbac_role_ancestors a JOIN main_rbac_roles_members m ON m.role_id = a.ancestor_id
		WHERE m.user_id = $1 AND a.content_type_id = $2 AND a.role_field = 'member_role')`, userID, s.CT.ID("main.organization")).Scan(&ok)
	return ok
}

func (s *Server) roleList(w http.ResponseWriter, r *http.Request) error {
	u, err := RequireUser(r)
	if err != nil {
		return err
	}
	ctx := r.Context()
	orphan := !u.IsSuperuser && !u.IsSystemAuditor && !s.userHasOrganizations(ctx, u.ID)
	return s.roleListWith(w, r, func(q *Query) {
		clause := visibleRolesClause(q, u, "r.id")
		if clause == "" {
			return
		}
		if orphan {
			clause = "(" + clause + " OR r.singleton_name IN ('system_administrator', 'system_auditor'))"
		}
		q.And(clause)
	}, nil)
}

// parentRole loads the role of a /roles/{id}/... request, 404 when absent.
func (s *Server) parentRole(r *http.Request) (*auth.User, *roleRow, error) {
	u, err := RequireUser(r)
	if err != nil {
		return nil, nil, err
	}
	id, err := PathID(r)
	if err != nil {
		return nil, nil, NotFoundFor("Role")
	}
	rr, err := s.loadRole(r.Context(), id)
	if err != nil {
		return nil, nil, err
	}
	if rr == nil {
		return nil, nil, NotFoundFor("Role")
	}
	return u, rr, nil
}

func (s *Server) roleDetail(w http.ResponseWriter, r *http.Request) error {
	u, rr, err := s.parentRole(r)
	if err != nil {
		return err
	}
	if !s.roleVisible(r.Context(), u, rr.ID) {
		return ErrForbidden
	}
	WriteJSON(w, 200, s.serializeRoleRow(s.NewSerCtx(r, true), rr, nil))
	return nil
}

func (s *Server) roleUsers(w http.ResponseWriter, r *http.Request) error {
	u, rr, err := s.parentRole(r)
	if err != nil {
		return err
	}
	if !s.roleVisible(r.Context(), u, rr.ID) {
		return ErrForbidden
	}
	return s.userListWith(w, r, func(q *Query) {
		q.And("u.id IN (SELECT m.user_id FROM main_rbac_roles_members m WHERE m.role_id = " + q.Arg(rr.ID) + ")")
	}, false)
}

func (s *Server) roleTeams(w http.ResponseWriter, r *http.Request) error {
	u, rr, err := s.parentRole(r)
	if err != nil {
		return err
	}
	if !s.roleVisible(r.Context(), u, rr.ID) {
		return ErrForbidden
	}
	return s.teamListWithAccess(w, r, func(q *Query) {
		q.And("t.member_role_id IN (SELECT p.to_role_id FROM main_rbac_roles_parents p WHERE p.from_role_id = " + q.Arg(rr.ID) + ")")
	}, false)
}

func (s *Server) roleParents(w http.ResponseWriter, r *http.Request) error {
	u, rr, err := s.parentRole(r)
	if err != nil {
		return err
	}
	// ModelAccessPermission's parent check: the role must be visible.
	if !s.roleVisible(r.Context(), u, rr.ID) {
		return ErrForbidden
	}
	return s.roleListWith(w, r, func(q *Query) {
		q.And("r.id IN (SELECT p.to_role_id FROM main_rbac_roles_parents p WHERE p.from_role_id = " + q.Arg(rr.ID) + ")")
		if c := visibleRolesClause(q, u, "r.id"); c != "" {
			q.And(c)
		}
	}, nil)
}

func (s *Server) roleChildren(w http.ResponseWriter, r *http.Request) error {
	u, rr, err := s.parentRole(r)
	if err != nil {
		return err
	}
	// ModelAccessPermission's parent check: the role must be visible.
	if !s.roleVisible(r.Context(), u, rr.ID) {
		return ErrForbidden
	}
	return s.roleListWith(w, r, func(q *Query) {
		q.And("r.id IN (SELECT p.from_role_id FROM main_rbac_roles_parents p WHERE p.to_role_id = " + q.Arg(rr.ID) + ")")
		if c := visibleRolesClause(q, u, "r.id"); c != "" {
			q.And(c)
		}
	}, nil)
}

// roleUsersAttach is RoleUsersList.post: grant or revoke a user's
// membership of the role.
func (s *Server) roleUsersAttach(w http.ResponseWriter, r *http.Request) error {
	u, rr, err := s.parentRole(r)
	if err != nil {
		return err
	}
	if err := RequireWriteScope(u); err != nil {
		return err
	}
	if !s.roleVisible(r.Context(), u, rr.ID) {
		return ErrForbidden
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	detach := isDetach(body)
	uid, apiErr := attachID(body, "User", detach)
	if apiErr != nil {
		return apiErr
	}
	target, err := auth.UserByID(r.Context(), s.Q(), uid)
	if err != nil {
		return NotFound400()
	}
	if e := s.credentialRoleGrantError(r.Context(), u, rr, target.ID, detach); e != nil {
		return e
	}
	if !s.canUnattachRole(r.Context(), u, rr, roleSub{UserID: target.ID}, false) {
		return ErrForbidden
	}
	if err := s.setRoleMember(r.Context(), u, rr, target.ID, !detach, false); err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// roleTeamsAttach is RoleTeamsList.post: make the team's member role a
// parent of the role, or remove it.
func (s *Server) roleTeamsAttach(w http.ResponseWriter, r *http.Request) error {
	u, rr, err := s.parentRole(r)
	if err != nil {
		return err
	}
	if err := RequireWriteScope(u); err != nil {
		return err
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	detach := isDetach(body)
	tid, apiErr := attachID(body, "Team", detach)
	if apiErr != nil {
		return apiErr
	}
	t, err := s.loadTeam(r, tid)
	if err != nil {
		return err
	}
	if t == nil {
		return NotFound400()
	}
	if e := s.teamRoleGrantError(r.Context(), rr, t, detach); e != nil {
		return e
	}
	if !s.canUnattachRole(r.Context(), u, rr, roleSub{Team: t}, false) {
		return ErrForbidden
	}
	if err := s.setTeamRole(r.Context(), u, t, rr, !detach, false); err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// NotFound400 is get_object_or_400's answer for a missing sub-object.
func NotFound400() *APIError {
	return Detail(http.StatusBadRequest, "Not found.")
}

// RequireWriteScope refuses read-only OAuth tokens.
func RequireWriteScope(u *auth.User) error {
	if !u.CanWrite() {
		return ErrForbidden
	}
	return nil
}

// credentialRoleGrantError reproduces the credential checks of
// UserRolesList and RoleUsersList.
func (s *Server) credentialRoleGrantError(ctx context.Context, viewer *auth.User, rr *roleRow, userID int64, detach bool) error {
	key, _, ok := s.roleKindOf(rr)
	if !ok || key != "main.credential" {
		return nil
	}
	var orgID *int64
	if err := s.Q().QueryRow(ctx, `SELECT organization_id FROM main_credential WHERE id = $1`, *rr.ObjectID).Scan(&orgID); err != nil {
		return err
	}
	if !detach && orgID != nil && !s.userHasRoleOn(ctx, userID, "main.organization", *orgID, "member_role") {
		return &APIError{Status: http.StatusBadRequest, Body: map[string]any{"msg": "You cannot grant credential access to a user not in the credentials' organization"}}
	}
	if orgID == nil && !viewer.IsSuperuser {
		return &APIError{Status: http.StatusBadRequest, Body: map[string]any{"msg": "You cannot grant private credential access to another user"}}
	}
	return nil
}

// teamRoleGrantError reproduces the checks of TeamRolesList and
// RoleTeamsList.
func (s *Server) teamRoleGrantError(ctx context.Context, rr *roleRow, t *team, detach bool) error {
	key, _, _ := s.roleKindOf(rr)
	if key == "main.organization" && (rr.RoleField == "member_role" || rr.RoleField == "admin_role") {
		return &APIError{Status: http.StatusBadRequest, Body: map[string]any{"msg": "You cannot assign an Organization participation role as a child role for a Team."}}
	}
	if key == "main.credential" {
		var orgID *int64
		if err := s.Q().QueryRow(ctx, `SELECT organization_id FROM main_credential WHERE id = $1`, *rr.ObjectID).Scan(&orgID); err != nil {
			return err
		}
		if orgID == nil || t.OrganizationID == nil || *orgID != *t.OrganizationID {
			return &APIError{Status: http.StatusBadRequest, Body: map[string]any{"msg": "You cannot grant credential access to a team when the Organization field isn't set, or belongs to a different organization"}}
		}
	}
	if rr.isSingleton() && !detach {
		return &APIError{Status: http.StatusBadRequest, Body: map[string]any{"msg": "You cannot grant system-level permissions to a team."}}
	}
	return nil
}

// userHasRoleOn reports whether a user holds roleField on an object.
func (s *Server) userHasRoleOn(ctx context.Context, userID int64, ctKey string, objectID int64, roleField string) bool {
	if hasReadMemo(ctx) {
		if h := s.heldRoles(ctx, userID); h != nil {
			return h.HasOn(s.CT.ID(ctKey), objectID, roleField)
		}
	}
	ok, err := rbac.UserHasRoleOn(ctx, s.Q(), userID, s.CT.ID(ctKey), objectID, roleField)
	return err == nil && ok
}

// roleSub is what a role is attached to: a user (members) or a team (the
// team's member role becomes a parent).
type roleSub struct {
	UserID int64
	Team   *team
	// New marks a user created by this request.
	New bool
}

// canUnattachRole is RoleAccess.can_unattach (and can_attach, which defers
// to it).
func (s *Server) canUnattachRole(ctx context.Context, viewer *auth.User, rr *roleRow, sub roleSub, skipRead bool) bool {
	if viewer.IsSuperuser {
		return true
	}
	if !skipRead && !sub.New {
		if sub.Team != nil {
			if !s.canReadTeam(ctx, viewer, sub.Team) {
				return false
			}
		} else if !s.canReadUser(ctx, viewer, sub.UserID) {
			return false
		}
	}
	key, k, ok := s.roleKindOf(rr)
	if key == "main.organization" && (rr.RoleField == "admin_role" || rr.RoleField == "member_role") {
		if sub.Team != nil {
			return false
		}
		if !s.Settings.Bool(ctx, "MANAGE_ORGANIZATION_AUTH") {
			return false
		}
		if !sub.New && !s.canAdminUser(ctx, viewer, sub.UserID, true) {
			return false
		}
	}
	if key == "main.team" && (rr.RoleField == "admin_role" || rr.RoleField == "member_role") {
		if !s.Settings.Bool(ctx, "MANAGE_ORGANIZATION_AUTH") {
			return false
		}
	}
	if ok && k.Resource && s.userHasRoleOn(ctx, viewer.ID, key, *rr.ObjectID, "admin_role") {
		return true
	}
	return false
}

// setRoleMember adds or removes a user from a role's members and records
// it as the m2m signal did. fromUser marks a change made from the user's
// side (user.roles), which the activity stream records the other way round.
//
// The attach views added only a user who was not a member, but removed
// whether or not they were (relationship.remove), and remove() sent its
// signals for every id it was given: a removal records its entry either
// way. The System Administrator singleton is is_superuser
// (sync_rbac_to_superuser_status): a change to its members sets or clears
// the flag. From the role's side that was a queryset update, without an
// activity entry (and the role's own entry was skipped: "the user
// serializer covers it"); from the user's side it was user.save, which
// recorded the user's update after the association.
func (s *Server) setRoleMember(ctx context.Context, actor *auth.User, rr *roleRow, userID int64, add, fromUser bool) error {
	sysAdmin := rr.SingletonName != nil && *rr.SingletonName == rbac.SystemAdministrator
	return s.DB.Tx(ctx, func(tx pgx.Tx) error {
		var exists bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM main_rbac_roles_members WHERE role_id = $1 AND user_id = $2)`, rr.ID, userID).Scan(&exists); err != nil {
			return err
		}
		if add && exists {
			return nil
		}
		if add {
			if _, err := tx.Exec(ctx, `INSERT INTO main_rbac_roles_members (role_id, user_id) VALUES ($1, $2)`, rr.ID, userID); err != nil {
				return err
			}
		} else if exists {
			if _, err := tx.Exec(ctx, `DELETE FROM main_rbac_roles_members WHERE role_id = $1 AND user_id = $2`, rr.ID, userID); err != nil {
				return err
			}
		}
		if !sysAdmin || fromUser {
			if err := s.recordRoleChange(ctx, tx, actor, rr, "user", userID, add, fromUser, "ascender.main.models.rbac.Role_members"); err != nil {
				return err
			}
		}
		if !sysAdmin {
			return nil
		}
		var was bool
		if err := tx.QueryRow(ctx, `SELECT is_superuser FROM auth_user WHERE id = $1 FOR UPDATE`, userID).Scan(&was); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE auth_user SET is_superuser = $2 WHERE id = $1`, userID, add); err != nil {
			return err
		}
		if !fromUser || was == add {
			return nil
		}
		e := activity.Entry{Operation: "update", Object1: "user", Changes: map[string]any{"is_superuser": []any{was, add}}, Links: map[string]int64{"user": userID}}
		if actor != nil {
			e.ActorID = &actor.ID
		}
		return s.Activity.Record(ctx, tx, e)
	})
}

// setTeamRole makes a team's member role a parent of the role (or removes
// it) and rebuilds the ancestors.
func (s *Server) setTeamRole(ctx context.Context, actor *auth.User, t *team, rr *roleRow, add, fromTeam bool) error {
	if t.MemberRoleID == nil {
		return nil
	}
	return s.DB.Tx(ctx, func(tx pgx.Tx) error {
		var exists bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM main_rbac_roles_parents WHERE from_role_id = $1 AND to_role_id = $2)`, rr.ID, *t.MemberRoleID).Scan(&exists); err != nil {
			return err
		}
		if add == exists {
			return nil
		}
		if add {
			if _, err := tx.Exec(ctx, `INSERT INTO main_rbac_roles_parents (from_role_id, to_role_id) VALUES ($1, $2)`, rr.ID, *t.MemberRoleID); err != nil {
				return err
			}
		} else if _, err := tx.Exec(ctx, `DELETE FROM main_rbac_roles_parents WHERE from_role_id = $1 AND to_role_id = $2`, rr.ID, *t.MemberRoleID); err != nil {
			return err
		}
		if err := models.RebuildRoleAncestors(ctx, tx, []int64{rr.ID}); err != nil {
			return err
		}
		return s.recordRoleChange(ctx, tx, actor, rr, "team", t.ID, add, fromTeam, "ascender.main.models.rbac.Role_parents")
	})
}

// addAdminMember is admin_role.members.add(user) on an object just made
// (JobTemplateList.post, CredentialSerializer.create's user owner,
// CopyAPIView.post): the membership, and the entry rbac_activity_stream
// wrote for it when the user was not a member already.
func (s *Server) addAdminMember(ctx context.Context, tx pgx.Tx, actor *auth.User, roleID, userID int64) error {
	tag, err := tx.Exec(ctx, `INSERT INTO main_rbac_roles_members (role_id, user_id) SELECT $1, $2
		WHERE NOT EXISTS (SELECT 1 FROM main_rbac_roles_members WHERE role_id = $1 AND user_id = $2)`, roleID, userID)
	if err != nil || tag.RowsAffected() == 0 {
		return err
	}
	rr, err := loadRoleRow(ctx, tx, roleID)
	if err != nil || rr == nil {
		return err
	}
	return s.recordRoleChange(ctx, tx, actor, rr, "user", userID, true, false, "ascender.main.models.rbac.Role_members")
}

// addTeamRoleParent is role.parents.add(team_role) on an object just made
// (CredentialSerializerCreate.create's team owner): the parent, the
// ancestors rebuilt, and the entry rbac_activity_stream wrote when the
// role was not a parent already. The object is object1 and the team
// object2, with the team role's pk in the changes, under the team role's
// relationship (organization.Team.admin_role or member_role).
func (s *Server) addTeamRoleParent(ctx context.Context, tx pgx.Tx, actor *auth.User, childRoleID, teamRoleID int64, objModel string, objID int64) error {
	tag, err := tx.Exec(ctx, `INSERT INTO main_rbac_roles_parents (from_role_id, to_role_id) SELECT $1, $2
		WHERE NOT EXISTS (SELECT 1 FROM main_rbac_roles_parents WHERE from_role_id = $1 AND to_role_id = $2)`, childRoleID, teamRoleID)
	if err != nil || tag.RowsAffected() == 0 {
		return err
	}
	if err := models.RebuildRoleAncestors(ctx, tx, []int64{childRoleID}); err != nil {
		return err
	}
	rr, err := loadRoleRow(ctx, tx, teamRoleID)
	if err != nil || rr == nil {
		return err
	}
	return s.recordRoleChange(ctx, tx, actor, rr, objModel, objID, true, true, "ascender.main.models.rbac.Role_parents")
}

// loadRoleRow reads one role; nil when there is none.
func loadRoleRow(ctx context.Context, q db.Querier, id int64) (*roleRow, error) {
	rows, err := q.Query(ctx, `SELECT `+roleColumns+` FROM main_rbac_roles r WHERE r.id = $1`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	if !rows.Next() {
		return nil, rows.Err()
	}
	v, err := scanRole(rows)
	if err != nil {
		return nil, err
	}
	return v.(*roleRow), nil
}

// recordRoleChange writes the associate/disassociate entry the old
// rbac_activity_stream signal wrote for a role membership change.
func (s *Server) recordRoleChange(ctx context.Context, tx pgx.Tx, actor *auth.User, rr *roleRow, otherModel string, otherID int64, add, fromOther bool, through string) error {
	action := "disassociate"
	if add {
		action = "associate"
	}
	_, k, ok := s.roleKindOf(rr)
	roleModel, roleObj := "role", rr.ID
	rel := through
	if ok {
		roleModel, roleObj = k.Type, *rr.ObjectID
		rel = k.Class + "." + rr.RoleField
	}
	var e activity.Entry
	links := map[string]int64{"role": rr.ID}
	if fromOther {
		// user.roles.add(role): the user is object1 and the role's object
		// object2, whose pk in the changes is the role's.
		e = activity.Entry{Operation: action, Object1: otherModel, Object2: roleModel, Relationship: rel,
			ChangesValue: assocChanges(action, through, otherModel, otherID, roleModel, rr.ID)}
	} else {
		e = activity.Entry{Operation: action, Object1: roleModel, Object2: otherModel, Relationship: rel,
			ChangesValue: assocChanges(action, through, roleModel, roleObj, otherModel, otherID)}
	}
	links[otherModel] = otherID
	if roleModel != "role" {
		links[roleModel] = roleObj
	}
	if actor != nil {
		e.ActorID = &actor.ID
	}
	e.Links = links
	return s.Activity.Record(ctx, tx, e)
}

// ---------------------------------------------------------------- access list

// accessList is ResourceAccessList: every user holding a role that is an
// ancestor of one of the object's roles, with the direct and indirect
// access each has.
func (s *Server) accessList(w http.ResponseWriter, r *http.Request, ctKey string, objectID int64) error {
	viewer, err := RequireUser(r)
	if err != nil {
		return err
	}
	ctx := r.Context()
	ctID := s.CT.ID(ctKey)
	hide := s.Settings.Bool(ctx, "ASCENDER_HIDE_SYSTEM_ROLES_FROM_ACCESS")
	rows, count, page, err := s.RunList(r, s.userSpec(nil), func(q *Query) {
		inner := `SELECT a.ancestor_id FROM main_rbac_role_ancestors a JOIN main_rbac_roles orl ON orl.id = a.descendent_id WHERE orl.content_type_id = ` + q.Arg(ctID) + ` AND orl.object_id = ` + q.Arg(objectID)
		if hide {
			inner += ` AND a.ancestor_id NOT IN (SELECT id FROM main_rbac_roles WHERE singleton_name IN ('system_administrator', 'system_auditor'))`
		}
		q.And(`u.id IN (SELECT m.user_id FROM main_rbac_roles_members m WHERE m.role_id IN (` + inner + `))`)
	}, scanUserRow)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, false)
	al := &accessListCtx{s: s, ctx: ctx, viewer: viewer, ctKey: ctKey, ctID: ctID, objectID: objectID, hide: hide}
	if err := al.load(); err != nil {
		return err
	}
	results := make([]any, 0, len(rows))
	for _, row := range rows {
		target := row.(*auth.User)
		o, err := s.serializeUserWith(c, target, nil, false)
		if err != nil {
			return err
		}
		direct, indirect, err := al.forUser(target.ID)
		if err != nil {
			return err
		}
		o.Set("summary_fields", NewOMap().Set("direct_access", direct).Set("indirect_access", indirect))
		o.Delete("auth")
		results = append(results, o)
	}
	WriteJSON(w, 200, Paginate(r, page, count, results))
	return nil
}

// accessListCtx holds what ResourceAccessListElementSerializer computed
// once per object.
type accessListCtx struct {
	s        *Server
	ctx      context.Context
	viewer   *auth.User
	ctKey    string
	ctID     int64
	objectID int64
	hide     bool
	// direct are the object's own roles, all their ancestors too.
	direct, all map[int64]bool
}

func (al *accessListCtx) load() error {
	al.direct, al.all = map[int64]bool{}, map[int64]bool{}
	rows, err := al.s.Q().Query(al.ctx, `SELECT r.id, a.ancestor_id FROM main_rbac_roles r JOIN main_rbac_role_ancestors a ON a.descendent_id = r.id WHERE r.content_type_id = $1 AND r.object_id = $2`, al.ctID, al.objectID)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var id, anc int64
		if err := rows.Scan(&id, &anc); err != nil {
			return err
		}
		al.direct[id] = true
		al.all[anc] = true
	}
	return rows.Err()
}

func setIDs(m map[int64]bool) []int64 {
	out := make([]int64, 0, len(m))
	for id := range m {
		out = append(out, id)
	}
	return out
}

// rolesOnResource is get_roles_on_resource: the role fields a role grants
// on the object.
func (al *accessListCtx) rolesOnResource(roleID int64) []string {
	rows, err := al.s.Q().Query(al.ctx, `SELECT DISTINCT role_field FROM main_rbac_role_ancestors WHERE ancestor_id = $1 AND content_type_id = $2 AND object_id = $3 ORDER BY role_field`, roleID, al.ctID, al.objectID)
	if err != nil {
		return []string{}
	}
	defer rows.Close()
	out := []string{}
	for rows.Next() {
		var f string
		if rows.Scan(&f) == nil {
			out = append(out, f)
		}
	}
	al.s.logRowsErr(al.ctx, "rolesOnResource", rows)
	return out
}

func (al *accessListCtx) loadRoles(sql string, args ...any) ([]*roleRow, error) {
	rows, err := al.s.Q().Query(al.ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*roleRow
	for rows.Next() {
		v, err := scanRole(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, v.(*roleRow))
	}
	return out, rows.Err()
}

// formatRolePerm is format_role_perm for a role the user holds.
func (al *accessListCtx) formatRolePerm(rr *roleRow, userID int64) *OMap {
	d := NewOMap().Set("id", rr.ID).Set("name", rbacRoleName(locCtx(al.ctx), rr.RoleField))
	key, k, ok := al.s.roleKindOf(rr)
	verbose := ""
	if ok {
		verbose = k.Verbose
	}
	d.Set("description", rbacRoleDescription(locCtx(al.ctx), rr.RoleField, verbose))
	if ok {
		d.Set("resource_name", al.s.roleResourceName(al.ctx, rr)).Set("resource_type", k.Type).Set("related", NewOMap().Set(k.Type, URLFor(k.Coll, *rr.ObjectID)))
	}
	unattach := false
	if rr.ContentTypeID != nil {
		_ = key
		unattach = al.s.canUnattachRole(al.ctx, al.viewer, rr, roleSub{UserID: userID}, false)
	}
	d.Set("user_capabilities", NewOMap().Set("unattach", unattach))
	return NewOMap().Set("role", d).Set("descendant_roles", al.rolesOnResource(rr.ID))
}

// formatTeamRolePerm is format_team_role_perm: the roles a team the user
// belongs to was given on the object.
func (al *accessListCtx) formatTeamRolePerm(teamRole *roleRow, permissive map[int64]bool) ([]any, error) {
	if teamRole.RoleField == "admin_role" && teamRole.ObjectID != nil {
		var mr int64
		if err := al.s.Q().QueryRow(al.ctx, `SELECT member_role_id FROM main_team WHERE id = $1`, *teamRole.ObjectID).Scan(&mr); err == nil {
			if r2, err := al.s.loadRole(al.ctx, mr); err == nil && r2 != nil {
				teamRole = r2
			}
		}
	}
	var teamName, orgName string
	_ = db.Tolerant(al.s.Q()).QueryRow(al.ctx, `SELECT t.name, COALESCE(o.name, '') FROM main_team t LEFT JOIN main_organization o ON o.id = t.organization_id WHERE t.id = $1`, *teamRole.ObjectID).Scan(&teamName, &orgName)
	children, err := al.loadRoles(`SELECT `+roleColumns+` FROM main_rbac_roles r JOIN main_rbac_roles_parents p ON p.from_role_id = r.id WHERE p.to_role_id = $1 AND r.id = ANY($2) ORDER BY r.content_type_id, r.object_id, r.id`, teamRole.ID, setIDs(permissive))
	if err != nil {
		return nil, err
	}
	t, _ := al.s.loadTeamCtx(al.ctx, *teamRole.ObjectID)
	var out []any
	for _, role := range children {
		d := NewOMap().Set("id", role.ID).Set("name", rbacRoleName(locCtx(al.ctx), role.RoleField))
		_, k, ok := al.s.roleKindOf(role)
		verbose := ""
		if ok {
			verbose = k.Verbose
		}
		d.Set("description", rbacRoleDescription(locCtx(al.ctx), role.RoleField, verbose)).Set("team_id", *teamRole.ObjectID).Set("team_name", teamName).Set("team_organization_name", orgName)
		if role.ContentTypeID != nil && ok {
			unattach := false
			if t != nil {
				unattach = al.s.canUnattachRole(al.ctx, al.viewer, role, roleSub{Team: t}, false)
			}
			d.Set("resource_name", al.s.roleResourceName(al.ctx, role)).Set("resource_type", k.Type).Set("related", NewOMap().Set(k.Type, URLFor(k.Coll, *role.ObjectID))).Set("user_capabilities", NewOMap().Set("unattach", unattach))
		} else {
			d.Set("user_capabilities", NewOMap().Set("unattach", false))
		}
		out = append(out, NewOMap().Set("role", d).Set("descendant_roles", al.rolesOnResource(teamRole.ID)))
	}
	return out, nil
}

// forUser computes the direct and indirect access lists of one user.
func (al *accessListCtx) forUser(userID int64) ([]any, []any, error) {
	directIDs, allIDs := setIDs(al.direct), setIDs(al.all)
	teamCT := al.s.CT.ID("main.team")
	direct, err := al.loadRoles(`SELECT `+roleColumns+` FROM main_rbac_roles r JOIN main_rbac_roles_members m ON m.role_id = r.id WHERE m.user_id = $1 AND r.id = ANY($2) ORDER BY r.content_type_id, r.object_id, r.id`, userID, directIDs)
	if err != nil {
		return nil, nil, err
	}
	teamExclude := ""
	args := []any{teamCT, userID, directIDs}
	if al.ctKey == "main.team" {
		teamExclude = ` AND NOT EXISTS (SELECT 1 FROM main_rbac_roles_parents p2 JOIN main_rbac_roles c2 ON c2.id = p2.from_role_id WHERE p2.to_role_id = r.id AND c2.content_type_id = $1 AND c2.object_id = $4)`
		args = append(args, al.objectID)
	}
	directTeam, err := al.loadRoles(`SELECT `+roleColumns+` FROM main_rbac_roles r WHERE r.content_type_id = $1 AND r.id IN (SELECT role_id FROM main_rbac_roles_members WHERE user_id = $2)
		AND EXISTS (SELECT 1 FROM main_rbac_roles_parents p WHERE p.to_role_id = r.id AND p.from_role_id = ANY($3))`+teamExclude+` ORDER BY r.content_type_id, r.object_id, r.id`, args...)
	if err != nil {
		return nil, nil, err
	}
	directTeamIDs := map[int64]bool{}
	for _, t := range directTeam {
		directTeamIDs[t.ID] = true
	}
	indirectTeam, err := al.loadRoles(`SELECT `+roleColumns+` FROM main_rbac_roles r WHERE r.content_type_id = $1 AND r.id IN (SELECT role_id FROM main_rbac_roles_members WHERE user_id = $2)
		AND EXISTS (SELECT 1 FROM main_rbac_roles_parents p WHERE p.to_role_id = r.id AND p.from_role_id = ANY($3)) AND NOT (r.id = ANY($4)) ORDER BY r.content_type_id, r.object_id, r.id`, teamCT, userID, allIDs, setIDs(directTeamIDs))
	if err != nil {
		return nil, nil, err
	}
	exclude := directIDs
	for id := range directTeamIDs {
		exclude = append(exclude, id)
	}
	for _, t := range indirectTeam {
		exclude = append(exclude, t.ID)
	}
	hideSQL := ""
	if al.hide {
		hideSQL = ` AND (r.singleton_name IS NULL OR r.singleton_name NOT IN ('system_administrator', 'system_auditor'))`
	}
	indirect, err := al.loadRoles(`SELECT `+roleColumns+` FROM main_rbac_roles r JOIN main_rbac_roles_members m ON m.role_id = r.id WHERE m.user_id = $1 AND r.id = ANY($2) AND NOT (r.id = ANY($3))`+hideSQL+` ORDER BY r.content_type_id, r.object_id, r.id`, userID, allIDs, exclude)
	if err != nil {
		return nil, nil, err
	}
	directOut := []any{}
	for _, rr := range direct {
		directOut = append(directOut, al.formatRolePerm(rr, userID))
	}
	for _, tr := range directTeam {
		items, err := al.formatTeamRolePerm(tr, al.direct)
		if err != nil {
			return nil, nil, err
		}
		directOut = append(directOut, items...)
	}
	for _, tr := range indirectTeam {
		items, err := al.formatTeamRolePerm(tr, al.all)
		if err != nil {
			return nil, nil, err
		}
		directOut = append(directOut, items...)
	}
	indirectOut := []any{}
	for _, rr := range indirect {
		indirectOut = append(indirectOut, al.formatRolePerm(rr, userID))
	}
	return directOut, indirectOut, nil
}

// accessListRoute serves /<coll>/{id}/access_list/ for a model whose
// objects are read through load (which reports 404/403 itself).
func (s *Server) accessListRoute(ctKey string, load func(r *http.Request, u *auth.User, id int64) error) HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) error {
		u, err := RequireUser(r)
		if err != nil {
			return err
		}
		id, err := PathID(r)
		if err != nil {
			return NotFoundFor(roleKinds[ctKey].model())
		}
		if err := load(r, u, id); err != nil {
			return err
		}
		return s.accessList(w, r, ctKey, id)
	}
}
