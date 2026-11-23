package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/ctrliq/ascender/internal/activity"
	"github.com/ctrliq/ascender/internal/rbac"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/auth"
	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/models"
)

// team is a main_team row. Teams get their own phase; this is what
// credential ownership and lookups need.
type team struct {
	ID                                    int64
	Created                               time.Time
	Modified                              time.Time
	Description                           string
	Name                                  string
	CreatedByID                           *int64
	ModifiedByID                          *int64
	OrganizationID                        *int64
	AdminRoleID, MemberRoleID, ReadRoleID *int64
}

const teamColumns = `t.id, t.created, t.modified, t.description, t.name, t.created_by_id, t.modified_by_id, t.organization_id, t.admin_role_id, t.member_role_id, t.read_role_id`

func scanTeam(rows pgx.Rows) (any, error) {
	t := &team{}
	err := rows.Scan(&t.ID, &t.Created, &t.Modified, &t.Description, &t.Name, &t.CreatedByID, &t.ModifiedByID, &t.OrganizationID, &t.AdminRoleID, &t.MemberRoleID, &t.ReadRoleID)
	return t, err
}

var teamRoleFields = []string{"admin_role", "member_role", "read_role"}

func (t *team) roleID(field string) *int64 {
	switch field {
	case "admin_role":
		return t.AdminRoleID
	case "member_role":
		return t.MemberRoleID
	case "read_role":
		return t.ReadRoleID
	}
	return nil
}

var teamFields *FieldSet

func teamFieldSet(a string) *FieldSet {
	return &FieldSet{Model: "Team", Fields: map[string]Field{
		"id": {SQL: a + ".id", Kind: KindInt}, "name": {SQL: a + ".name"}, "description": {SQL: a + ".description"},
		"created": {SQL: a + ".created", Kind: KindDateTime}, "modified": {SQL: a + ".modified", Kind: KindDateTime},
		"organization": {SQL: a + ".organization_id", Kind: KindFK, Rel: &Relation{Alias: "o", Join: "LEFT JOIN main_organization o ON o.id = " + a + ".organization_id", Target: func() *FieldSet { return organizationFields }}},
		"created_by":   {SQL: a + ".created_by_id", Kind: KindFK, Rel: &Relation{Alias: a + "cb", Join: "LEFT JOIN auth_user " + a + "cb ON " + a + "cb.id = " + a + ".created_by_id", Target: func() *FieldSet { return userFieldsAlias(a + "cb") }}},
		"modified_by":  {SQL: a + ".modified_by_id", Kind: KindFK, Rel: &Relation{Alias: a + "mb", Join: "LEFT JOIN auth_user " + a + "mb ON " + a + "mb.id = " + a + ".modified_by_id", Target: func() *FieldSet { return userFieldsAlias(a + "mb") }}},
	}, SearchFields: []string{"name", "description"}}
}

func init() {
	teamFields = teamFieldSet("t")
	resourceRegistrars = append(resourceRegistrars, func(s *Server, mux *http.ServeMux) {
		s.route(mux, "/api/v2/teams/{$}", methodMap{"GET": s.teamList, "POST": s.teamCreate}, s.optionsFor("teams"))
		s.route(mux, "/api/v2/teams/{id}/{$}", methodMap{"GET": s.teamDetail, "PUT": s.teamUpdate, "PATCH": s.teamUpdate, "DELETE": s.teamDelete}, s.optionsFor("teams"))
		s.route(mux, "/api/v2/teams/{id}/users/{$}", methodMap{"GET": s.teamUsers, "POST": s.teamUsersAttach}, s.optionsFor("users"))
		s.route(mux, "/api/v2/teams/{id}/roles/{$}", methodMap{"GET": s.teamRoles, "POST": s.teamRolesAttach}, s.optionsFor("roles"))
		s.route(mux, "/api/v2/teams/{id}/object_roles/{$}", methodMap{"GET": s.objectRolesRoute("main.team", teamObj.parentCheck(s))}, s.optionsFor("roles"))
		s.route(mux, "/api/v2/teams/{id}/projects/{$}", methodMap{"GET": s.teamProjects}, s.optionsFor("projects"))
		s.route(mux, "/api/v2/teams/{id}/credentials/{$}", methodMap{"GET": s.teamCredentials, "POST": s.credentialSubCreate(credentialsOfTeam)}, s.optionsFor("credentials"))
		s.route(mux, "/api/v2/teams/{id}/access_list/{$}", methodMap{"GET": s.accessListRoute("main.team", teamObj.parentCheck(s))}, s.optionsFor("users"))
	})
}

func (s *Server) teamSpec() ListSpec {
	return ListSpec{Model: "Team", From: "main_team t", Columns: teamColumns, PK: "t.id", Fields: teamFields, DefaultOrder: []string{"organization__name", "name"}}
}

func (s *Server) teamListWith(w http.ResponseWriter, r *http.Request, extra func(q *Query)) error {
	return s.teamListWithAccess(w, r, extra, true)
}

// teamListWithAccess lists teams; filterAccess applies
// TeamAccess.filtered_queryset (sub-lists whose view replaced the queryset
// pass false).
func (s *Server) teamListWithAccess(w http.ResponseWriter, r *http.Request, extra func(q *Query), filterAccess bool) error {
	spec := s.teamSpec()
	ctx := r.Context()
	if filterAccess {
		spec.Access = func(q *Query, u *auth.User) {
			if c := s.teamVisibleClause(ctx, q, u); c != "" {
				q.And(c)
			}
		}
	}
	rows, count, page, err := s.RunList(r, spec, extra, scanTeam)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, false)
	results := make([]any, 0, len(rows))
	for _, row := range rows {
		results = append(results, s.serializeTeam(c, row.(*team)))
	}
	WriteJSON(w, 200, Paginate(r, page, count, results))
	return nil
}

func (s *Server) teamList(w http.ResponseWriter, r *http.Request) error {
	return s.teamListWith(w, r, nil)
}

func (s *Server) loadTeam(r *http.Request, id int64) (*team, error) {
	return s.loadTeamCtx(r.Context(), id)
}

func (s *Server) loadTeamCtx(ctx context.Context, id int64) (*team, error) {
	t, err := teamObj.get(ctx, s.Q(), id)
	if db.IsNoRows(err) {
		return nil, nil
	}
	return t, err
}

// teamObj is a team (TeamAccess.can_read).
var teamObj = &pathObject[*team]{
	model: "Team",
	get: func(ctx context.Context, q db.Querier, id int64) (*team, error) {
		return scanFirst[*team](ctx, q, `SELECT `+teamColumns+` FROM main_team t WHERE t.id = $1`, []any{id}, scanTeam)
	},
	readable: func(c *SerCtx, t *team) bool { return c.S.canReadTeam(c.Ctx(), c.User, t) },
}

func (s *Server) teamDetail(w http.ResponseWriter, r *http.Request) error {
	_, t, err := teamObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	WriteJSON(w, 200, s.serializeTeam(s.NewSerCtx(r, true), t))
	return nil
}

func (s *Server) serializeTeam(c *SerCtx, t *team) *OMap {
	related := NewOMap()
	if c.Detail {
		orgName := ""
		if t.OrganizationID != nil {
			if o := c.OrgSummary(t.OrganizationID); o != nil {
				n, _ := o.Get("name")
				orgName = str(n)
			}
		}
		related.Set("named_url", "/api/v2/teams/"+namedURLEscape(t.Name)+"++"+namedURLEscape(orgName)+"/")
	}
	setURL(related, "created_by", "users", t.CreatedByID)
	setURL(related, "modified_by", "users", t.ModifiedByID)
	base := URLFor("teams", t.ID)
	for _, sub := range []string{"projects", "users", "credentials", "roles", "object_roles", "activity_stream", "access_list"} {
		related.Set(sub, base+sub+"/")
	}
	setURL(related, "organization", "organizations", t.OrganizationID)
	summary := NewOMap()
	c.putSummary(summary, "organization", c.OrgSummary, t.OrganizationID)
	c.putSummary(summary, "created_by", c.UserSummary, t.CreatedByID)
	c.putSummary(summary, "modified_by", c.UserSummary, t.ModifiedByID)
	if c.WantSummary("object_roles") {
		summary.Set("object_roles", c.RolesSummary("team", teamRoleFields, t.roleID))
	}
	if c.WantSummary("user_capabilities") && !c.NoCaps {
		edit := s.canChangeTeam(c.Ctx(), c.User, t)
		summary.Set("user_capabilities", NewOMap().Set("edit", edit).Set("delete", edit))
	}
	o := Base(NewOMap(), t.ID, "team", base, related, summary, t.Created, t.Modified, t.Name, t.Description)
	o.Set("organization", models.NullableID(t.OrganizationID))
	return o
}

func str(v any) string {
	s, _ := v.(string)
	return s
}

// canChangeTeam is TeamAccess.can_change without an organization change.
func (s *Server) canChangeTeam(ctx context.Context, u *auth.User, t *team) bool {
	if u == nil {
		return false
	}
	if !s.Settings.Bool(ctx, "MANAGE_ORGANIZATION_AUTH") {
		return u.IsSuperuser
	}
	if u.IsSuperuser {
		return true
	}
	if !u.CanWrite() {
		return false
	}
	return t.AdminRoleID != nil && s.userHasRole(ctx, u.ID, *t.AdminRoleID)
}

func (s *Server) userHasRole(ctx context.Context, userID, roleID int64) bool {
	ok, err := rbac.UserHasRole(ctx, s.Q(), userID, roleID)
	return err == nil && ok
}

func teamChanges(t *models.TeamWrite) map[string]any {
	return map[string]any{"name": t.Name, "description": t.Description, "organization": t.OrganizationID, "id": t.ID}
}

// teamFromForm validates the TeamSerializer fields.
func (s *Server) teamFromForm(r *http.Request, f *Form, v *models.TeamWrite, current *team) {
	v.Name = f.String("name", true, 512, v.Name)
	v.Description = f.String("description", false, 0, v.Description)
	var cur *int64
	if current != nil {
		cur = current.OrganizationID
	}
	// A missing organization is reported as required by f.ID.
	if id, set := f.ID("organization", cur, true, s.existsIn(r.Context(), "main_organization")); set && id != nil {
		v.OrganizationID = *id
	}
}

func (s *Server) teamNameTaken(ctx context.Context, name string, orgID, excludeID int64) (bool, error) {
	var taken bool
	if err := s.Q().QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM main_team WHERE name = $1 AND organization_id = $2 AND id <> $3)`, name, orgID, excludeID).Scan(&taken); err != nil {
		return false, err
	}
	return taken, nil
}

func (s *Server) teamCreate(w http.ResponseWriter, r *http.Request) error {
	u, err := RequireWrite(r)
	if err != nil {
		return err
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	return s.createTeamFromBody(w, r, u, body)
}

func (s *Server) createTeamFromBody(w http.ResponseWriter, r *http.Request, u *auth.User, body *OMap) error {
	ctx := r.Context()
	f := NewForm(body, false)
	v := &models.TeamWrite{ActorID: &u.ID}
	s.teamFromForm(r, f, v, nil)
	if err := f.Err(); err != nil {
		return err
	}
	if !u.IsSuperuser {
		if !s.Settings.Bool(ctx, "MANAGE_ORGANIZATION_AUTH") || !s.userHasRoleOn(ctx, u.ID, "main.organization", v.OrganizationID, "admin_role") {
			return ErrForbidden
		}
	}
	if v, err := s.teamNameTaken(ctx, v.Name, v.OrganizationID, 0); err != nil {
		return err
	} else if v {
		return FieldErrors{"__all__": {"Team with this Organization and Name already exists."}}.Err()
	}
	err := s.DB.Tx(ctx, func(tx pgx.Tx) error {
		orgs := s.orgLookup(r, tx)
		if err := models.InsertTeam(ctx, tx, v, s.CT, func(field string) *int64 {
			if o := orgs(v.OrganizationID); o != nil {
				return o.RoleID(field)
			}
			return nil
		}); err != nil {
			return err
		}
		return s.Activity.Record(ctx, tx, activity.Entry{Operation: "create", Object1: "team", Changes: teamChanges(v), ActorID: &u.ID, Links: map[string]int64{"team": v.ID}})
	})
	if err != nil {
		return err
	}
	t, err := s.loadTeam(r, v.ID)
	if err != nil {
		return err
	}
	w.Header().Set("Location", URLFor("teams", v.ID))
	WriteJSON(w, http.StatusCreated, s.serializeTeam(s.NewSerCtx(r, true), t))
	return nil
}

func (s *Server) teamUpdate(w http.ResponseWriter, r *http.Request) error {
	u, t, err := teamObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	ctx := r.Context()
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	if raw, ok := body.Get("organization"); ok && raw != nil && t.OrganizationID != nil {
		if id, ok := integerOf(raw); ok && id != *t.OrganizationID {
			return Detail(http.StatusForbidden, "Unable to change organization on a team.")
		} else if sv, isStr := raw.(string); isStr && sv != fmt.Sprint(*t.OrganizationID) && sv != "" {
			return Detail(http.StatusForbidden, "Unable to change organization on a team.")
		}
	}
	if !s.canChangeTeam(ctx, u, t) {
		return ErrForbidden
	}
	f := NewForm(body, r.Method == http.MethodPatch)
	v := &models.TeamWrite{ID: t.ID, Name: t.Name, Description: t.Description, ActorID: &u.ID}
	if t.OrganizationID != nil {
		v.OrganizationID = *t.OrganizationID
	}
	s.teamFromForm(r, f, v, t)
	if err := f.Err(); err != nil {
		return err
	}
	if v, err := s.teamNameTaken(ctx, v.Name, v.OrganizationID, t.ID); err != nil {
		return err
	} else if v {
		return FieldErrors{"__all__": {"Team with this Organization and Name already exists."}}.Err()
	}
	before := teamChanges(&models.TeamWrite{ID: t.ID, Name: t.Name, Description: t.Description, OrganizationID: v.OrganizationID})
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if err := models.UpdateTeam(ctx, tx, v); err != nil {
			return err
		}
		changes := diffChanges(before, teamChanges(v))
		if len(changes) == 0 {
			return nil
		}
		return s.Activity.Record(ctx, tx, activity.Entry{Operation: "update", Object1: "team", Changes: changes, ActorID: &u.ID, Links: map[string]int64{"team": t.ID}})
	})
	if err != nil {
		return err
	}
	t, err = s.loadTeam(r, t.ID)
	if err != nil {
		return err
	}
	WriteJSON(w, 200, s.serializeTeam(s.NewSerCtx(r, true), t))
	return nil
}

func (s *Server) teamDelete(w http.ResponseWriter, r *http.Request) error {
	u, t, err := teamObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	ctx := r.Context()
	if !s.canChangeTeam(ctx, u, t) {
		return ErrForbidden
	}
	var orgID int64
	if t.OrganizationID != nil {
		orgID = *t.OrganizationID
	}
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if err := s.Activity.Record(ctx, tx, activity.Entry{Operation: "delete", Object1: "team", Changes: teamChanges(&models.TeamWrite{ID: t.ID, Name: t.Name, Description: t.Description, OrganizationID: orgID}), ActorID: &u.ID}); err != nil {
			return err
		}
		return models.DeleteTeam(ctx, tx, t.ID, s.CT, s.Cascade)
	})
	if err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// teamUsers is TeamUsersList: the direct members of the team's member role.
func (s *Server) teamUsers(w http.ResponseWriter, r *http.Request) error {
	_, t, err := teamObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	return s.userListWith(w, r, func(q *Query) {
		q.And("u.id IN (SELECT m.user_id FROM main_rbac_roles_members m WHERE m.role_id = " + q.Arg(ptrOr(t.MemberRoleID)) + ")")
	}, true)
}

func ptrOr(p *int64) int64 {
	if p == nil {
		return 0
	}
	return *p
}

// teamUsersAttach is TeamUsersList.post: add or remove a member, or create
// a user and add it.
func (s *Server) teamUsersAttach(w http.ResponseWriter, r *http.Request) error {
	u, t, err := teamObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	if err := RequireWriteScope(u); err != nil {
		return err
	}
	ctx := r.Context()
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	rr, err := s.loadRole(ctx, ptrOr(t.MemberRoleID))
	if err != nil || rr == nil {
		return NotFoundFor("Team")
	}
	return s.membershipAttach(w, r, u, rr, body, func(userID int64, created bool) bool {
		return s.canUnattachRole(ctx, u, rr, roleSub{UserID: userID, New: created}, false)
	})
}

// membershipAttach is the attach/unattach (or create and attach) of a user
// to a membership role, as BaseUsersList did.
func (s *Server) membershipAttach(w http.ResponseWriter, r *http.Request, u *auth.User, rr *roleRow, body *OMap, allowed func(userID int64, created bool) bool) error {
	ctx := r.Context()
	detach := isDetach(body)
	if !detach {
		raw, _ := body.Get("id")
		if raw == nil || raw == false || raw == "" || raw == json.Number("0") || raw == float64(0) {
			// No id: create the user, then attach it.
			return s.createUserFromBody(w, r, u, body, func(ctx context.Context, tx pgx.Tx, id int64) error {
				if !allowed(id, true) {
					return ErrForbidden
				}
				if _, err := tx.Exec(ctx, `INSERT INTO main_rbac_roles_members (role_id, user_id) VALUES ($1, $2)`, rr.ID, id); err != nil {
					return err
				}
				return s.recordRoleChange(ctx, tx, u, rr, "user", id, true, false, "ascender.main.models.rbac.Role_members")
			})
		}
	}
	uid, apiErr := attachID(body, "User", detach)
	if apiErr != nil {
		return apiErr
	}
	if _, err := auth.UserByID(ctx, s.Q(), uid); err != nil {
		return NotFound400()
	}
	if !allowed(uid, false) {
		return ErrForbidden
	}
	if err := s.setRoleMember(ctx, u, rr, uid, !detach, false); err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// teamRoles is TeamRolesList: roles granted to the team, apart from its own
// read role.
func (s *Server) teamRoles(w http.ResponseWriter, r *http.Request) error {
	u, t, err := teamObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	ctx := r.Context()
	return s.roleListWith(w, r, func(q *Query) {
		q.And("r.id IN (SELECT p.from_role_id FROM main_rbac_roles_parents p WHERE p.to_role_id = " + q.Arg(ptrOr(t.MemberRoleID)) + ")")
		q.And("r.id <> " + q.Arg(ptrOr(t.ReadRoleID)))
		if c := visibleRolesClause(q, u, "r.id"); c != "" {
			q.And(c)
		}
	}, func(rr *roleRow) *OMap {
		return NewOMap().Set("unattach", u.CanWrite() && s.canUnattachRole(ctx, u, rr, roleSub{Team: t}, true))
	})
}

// teamRolesAttach is TeamRolesList.post.
func (s *Server) teamRolesAttach(w http.ResponseWriter, r *http.Request) error {
	u, t, err := teamObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	if err := RequireWriteScope(u); err != nil {
		return err
	}
	ctx := r.Context()
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	detach := isDetach(body)
	rid, apiErr := attachID(body, "Role", detach)
	if apiErr != nil {
		return apiErr
	}
	rr, err := s.loadRole(ctx, rid)
	if err != nil {
		return err
	}
	if rr == nil {
		return NotFound400()
	}
	if e := s.teamRoleGrantError(ctx, rr, t, detach); e != nil {
		return e
	}
	if !detach && rr.ContentTypeID == nil {
		return Detail(http.StatusForbidden, "The "+rbac.RoleNames[rr.RoleField]+" role cannot be assigned to a team")
	}
	if !s.canUnattachRole(ctx, u, rr, roleSub{Team: t}, false) {
		return ErrForbidden
	}
	if err := s.setTeamRole(ctx, u, t, rr, !detach, true); err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// teamProjects is TeamProjectsList: projects with a role the team's roles
// lead to.
func (s *Server) teamProjects(w http.ResponseWriter, r *http.Request) error {
	_, t, err := teamObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	return s.projectListWith(w, r, func(q *Query) {
		q.And("ujt.id IN (SELECT pr.object_id FROM main_rbac_roles pr JOIN main_rbac_role_ancestors pa ON pa.descendent_id = pr.id JOIN main_rbac_roles tr ON tr.id = pa.ancestor_id WHERE pr.content_type_id = " + q.Arg(s.CT.ID("main.project")) + " AND tr.content_type_id = " + q.Arg(s.CT.ID("main.team")) + " AND tr.object_id = " + q.Arg(t.ID) + ")")
	})
}

// teamCredentials is TeamCredentialsList: credentials whose use or admin
// role has the team's member role as a parent.
func (s *Server) teamCredentials(w http.ResponseWriter, r *http.Request) error {
	_, t, err := teamObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	return s.credentialListView(w, r, s.credentialSpec(), func(q *Query) {
		q.And("c.id IN (SELECT tc.id FROM main_credential tc JOIN main_rbac_roles_parents tp ON tp.from_role_id IN (tc.use_role_id, tc.admin_role_id) WHERE tp.to_role_id = " + q.Arg(ptrOr(t.MemberRoleID)) + ")")
	}, credentialsOfTeam)
}
