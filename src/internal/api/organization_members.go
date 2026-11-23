package api

import (
	"net/http"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/auth"
	"github.com/ctrliq/ascender/internal/models"
)

func init() {
	resourceRegistrars = append(resourceRegistrars, func(s *Server, mux *http.ServeMux) {
		s.route(mux, "/api/v2/organizations/{id}/users/{$}", methodMap{"GET": s.organizationUsers, "POST": s.organizationUsersAttach}, s.optionsFor("users"))
		s.route(mux, "/api/v2/organizations/{id}/admins/{$}", methodMap{"GET": s.organizationAdmins, "POST": s.organizationAdminsAttach}, s.optionsFor("users"))
		s.route(mux, "/api/v2/organizations/{id}/teams/{$}", methodMap{"GET": s.organizationTeams, "POST": s.organizationTeamsAttach}, s.optionsFor("teams"))
		s.route(mux, "/api/v2/organizations/{id}/object_roles/{$}", methodMap{"GET": s.objectRolesRoute("main.organization", organizationObj.parentCheck(s))}, s.optionsFor("roles"))
		s.route(mux, "/api/v2/organizations/{id}/access_list/{$}", methodMap{"GET": s.accessListRoute("main.organization", organizationObj.parentCheck(s))}, s.optionsFor("users"))
		s.route(mux, "/api/v2/projects/{id}/access_list/{$}", methodMap{"GET": s.accessListRoute("main.project", projectObj.parentCheck(s))}, s.optionsFor("users"))
		s.route(mux, "/api/v2/job_templates/{id}/access_list/{$}", methodMap{"GET": s.accessListRoute("main.jobtemplate", jobTemplateObj.parentCheck(s))}, s.optionsFor("users"))
		s.route(mux, "/api/v2/workflow_job_templates/{id}/access_list/{$}", methodMap{"GET": s.accessListRoute("main.workflowjobtemplate", workflowJobTemplateObj.parentCheck(s))}, s.optionsFor("users"))
		s.route(mux, "/api/v2/inventories/{id}/access_list/{$}", methodMap{"GET": s.accessListRoute("main.inventory", inventoryObj.parentCheck(s))}, s.optionsFor("users"))
		s.route(mux, "/api/v2/credentials/{id}/access_list/{$}", methodMap{"GET": s.accessListRoute("main.credential", credentialObj.parentCheck(s))}, s.optionsFor("users"))
		s.route(mux, "/api/v2/projects/{id}/object_roles/{$}", methodMap{"GET": s.objectRolesRoute("main.project", projectObj.parentCheck(s))}, s.optionsFor("roles"))
		s.route(mux, "/api/v2/instance_groups/{id}/object_roles/{$}", methodMap{"GET": s.objectRolesRoute("main.instancegroup", instanceGroupObj.parentCheck(s))}, s.optionsFor("roles"))
		s.route(mux, "/api/v2/instance_groups/{id}/access_list/{$}", methodMap{"GET": s.accessListRoute("main.instancegroup", instanceGroupObj.parentCheck(s))}, s.optionsFor("users"))
	})
}

func (s *Server) organizationUsers(w http.ResponseWriter, r *http.Request) error {
	return s.orgMembersList(w, r, func(o *models.Organization) *int64 { return o.MemberRoleID })
}

func (s *Server) organizationAdmins(w http.ResponseWriter, r *http.Request) error {
	return s.orgMembersList(w, r, func(o *models.Organization) *int64 { return o.AdminRoleID })
}

func (s *Server) orgMembersList(w http.ResponseWriter, r *http.Request, role func(o *models.Organization) *int64) error {
	_, o, err := organizationObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	return s.userListWith(w, r, func(q *Query) {
		q.And("u.id IN (SELECT m.user_id FROM main_rbac_roles_members m WHERE m.role_id = " + q.Arg(ptrOr(role(o))) + ")")
	}, true)
}

func (s *Server) organizationUsersAttach(w http.ResponseWriter, r *http.Request) error {
	return s.orgMembersAttach(w, r, func(o *models.Organization) *int64 { return o.MemberRoleID })
}

func (s *Server) organizationAdminsAttach(w http.ResponseWriter, r *http.Request) error {
	return s.orgMembersAttach(w, r, func(o *models.Organization) *int64 { return o.AdminRoleID })
}

// orgMembersAttach is BaseUsersList.post on an organization role.
func (s *Server) orgMembersAttach(w http.ResponseWriter, r *http.Request, role func(o *models.Organization) *int64) error {
	u, o, err := organizationObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	if err := RequireWriteScope(u); err != nil {
		return err
	}
	ctx := r.Context()
	rr, err := s.loadRole(ctx, ptrOr(role(o)))
	if err != nil || rr == nil {
		return NotFoundFor("Organization")
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	return s.membershipAttach(w, r, u, rr, body, func(userID int64, created bool) bool {
		return s.canUnattachRole(ctx, u, rr, roleSub{UserID: userID, New: created}, false)
	})
}

func (s *Server) organizationTeams(w http.ResponseWriter, r *http.Request) error {
	_, o, err := organizationObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	return s.teamListWith(w, r, func(q *Query) {
		q.And("t.organization_id = " + q.Arg(o.ID))
	})
}

// organizationTeamsAttach creates a team in the organization; an existing
// team can only be named when it already belongs here, and detaching one
// deletes it (the relation is the team's organization).
func (s *Server) organizationTeamsAttach(w http.ResponseWriter, r *http.Request) error {
	u, o, err := organizationObj.fromPath(s, r, false)
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
	raw, _ := body.Get("id")
	if raw == nil && !detach {
		body.Set("organization", o.ID)
		return s.createTeamFromBody(w, r, u, body)
	}
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
	if t.OrganizationID == nil || *t.OrganizationID != o.ID {
		return Detail(http.StatusForbidden, "Unable to change organization on a team.")
	}
	if !s.canChangeTeam(r.Context(), u, t) {
		return ErrForbidden
	}
	if detach {
		ctx := r.Context()
		if err := s.DB.Tx(ctx, func(tx pgx.Tx) error { return models.DeleteTeam(ctx, tx, t.ID, s.CT, s.Cascade) }); err != nil {
			return err
		}
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// objectRolesRoute serves /<coll>/{id}/object_roles/: the object's own roles.
func (s *Server) objectRolesRoute(ctKey string, load func(r *http.Request, u *auth.User, id int64) error) HandlerFunc {
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
		return s.roleListWith(w, r, func(q *Query) {
			q.And("r.content_type_id = " + q.Arg(s.CT.ID(ctKey)) + " AND r.object_id = " + q.Arg(id))
		}, nil)
	}
}
