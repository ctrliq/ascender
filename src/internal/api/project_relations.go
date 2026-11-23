package api

import (
	"net/http"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/activity"
	"github.com/ctrliq/ascender/internal/auth"
	"github.com/ctrliq/ascender/internal/models"
)

// A project's teams/ (ProjectTeamsList), scm_inventory_sources/
// (ProjectScmInventorySources) and copy/ (ProjectCopy).

func init() {
	resourceRegistrars = append(resourceRegistrars, func(s *Server, mux *http.ServeMux) {
		s.route(mux, "/api/v2/projects/{id}/teams/{$}", methodMap{"GET": s.projectTeams}, nil)
		s.route(mux, "/api/v2/projects/{id}/scm_inventory_sources/{$}", methodMap{"GET": s.projectSCMInventorySources}, nil)
		s.route(mux, "/api/v2/projects/{id}/copy/{$}", methodMap{"GET": s.projectCopyView, "POST": s.projectCopy}, nil)
	})
}

// projectTeams lists the teams holding a role on the project, among the
// teams the user can read.
func (s *Server) projectTeams(w http.ResponseWriter, r *http.Request) error {
	u, p, err := projectObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	return s.teamListWithAccess(w, r, func(q *Query) {
		q.And("t.id IN (SELECT r.object_id FROM main_rbac_roles r JOIN main_rbac_role_ancestors e ON e.ancestor_id = r.id WHERE e.content_type_id = " +
			q.Arg(s.CT.ID("main.project")) + " AND e.object_id = " + q.Arg(p.ID) + " AND r.content_type_id = " + q.Arg(s.CT.ID("main.team")) + ")")
		// Team.accessible_objects(user, 'read_role').
		if !u.IsSuperuser && !u.IsSystemAuditor {
			s.AccessibleFilter(q, u, "t.id", "main.team", "read_role")
		}
	}, false)
}

func (s *Server) projectSCMInventorySources(w http.ResponseWriter, r *http.Request) error {
	_, p, err := projectObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	return s.inventorySourceListWith(w, r, func(q *Query) { q.And(inventorySourceFields.Fields["source_project"].SQL + " = " + q.Arg(p.ID)) })
}

// projectCanAdd is ProjectAccess.can_add for the copy's fields: the
// organization's project admins, who may use its credential and read its
// default environment.
func (s *Server) projectCanAdd(r *http.Request, u *auth.User, p *models.Project) bool {
	if u.IsSuperuser {
		return true
	}
	c := s.NewSerCtx(r, true)
	if p.OrganizationID == nil || !c.HasRoleOn("main.organization", *p.OrganizationID, "project_admin_role") {
		return false
	}
	if p.CredentialID != nil && !c.HasRoleOn("main.credential", *p.CredentialID, "use_role") {
		return false
	}
	if p.DefaultEnvironmentID != nil && !s.eeReadable(c, *p.DefaultEnvironmentID) {
		return false
	}
	return true
}

func (s *Server) projectCopyView(w http.ResponseWriter, r *http.Request) error {
	u, p, err := projectObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	WriteJSON(w, http.StatusOK, NewOMap().Set("can_copy", s.projectCanAdd(r, u, p)))
	return nil
}

// projectCopy is CopyAPIView.post: every writable field of the project but
// its local path, webhook key and requirements generation, under the new
// name;
// the copier administers the copy, and an SCM copy syncs as a new project
// does.
func (s *Server) projectCopy(w http.ResponseWriter, r *http.Request) error {
	u, p, err := projectObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	if !s.projectCanAdd(r, u, p) {
		return ErrForbidden
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	name, err := copyName(body, p.Name)
	if err != nil {
		return err
	}
	n := *p
	n.ID = 0
	n.Name = name
	n.CreatedByID, n.ModifiedByID = &u.ID, &u.ID
	n.LocalPath, n.WebhookKey, n.RequirementsGeneration = "", "", 0
	// A new key for a copy with a webhook service, as
	// WebhookKeyTemplateMixin.save gave a new project.
	if n.WebhookService != "" {
		n.WebhookKey = newWebhookKey()
	}
	// Only the serializer's writable fields were copied: what updates
	// and jobs set (the revision, the playbook and inventory files, the
	// last and current jobs, the schedule) and the execution environment
	// the project serializer leaves out start empty.
	n.SCMRevision, n.PlaybookFiles, n.InventoryFiles = "", []string{}, []string{}
	n.LastJobID, n.CurrentJobID, n.NextScheduleID = nil, nil, nil
	n.LastJobRun, n.NextJobRun, n.LastJobFailed = nil, nil, false
	n.ExecutionEnvironmentID = nil
	n.AdminRoleID, n.UseRoleID, n.UpdateRoleID, n.ReadRoleID = nil, nil, nil, nil
	ctx := r.Context()
	c := s.NewSerCtx(r, true)
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if err := models.InsertProject(ctx, tx, &n, s.CT, s.Roles, s.orgLookup(r, tx)); err != nil {
			return err
		}
		if err := s.Activity.Record(ctx, tx, activity.Entry{Operation: "create", Object1: "project", Changes: s.projectChanges(c.InTx(tx), &n), ActorID: &u.ID, Links: map[string]int64{"project": n.ID}}); err != nil {
			return err
		}
		return s.addAdminMember(ctx, tx, u, *n.AdminRoleID, u.ID)
	})
	if err != nil {
		return err
	}
	if n.SCMType != "" {
		s.requestProjectUpdate(r, &n, u)
	}
	results, err := s.serializeProjects(c, []*models.Project{&n})
	if err != nil {
		return err
	}
	w.Header().Set("Location", URLFor("projects", n.ID))
	WriteJSON(w, http.StatusCreated, results[0])
	return nil
}
