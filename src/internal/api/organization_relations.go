package api

import (
	"fmt"
	"net/http"

	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/models"
)

// The organization's ordered relations: instance_groups/
// (OrganizationInstanceGroupsList) and galaxy_credentials/
// (OrganizationGalaxyCredentialsList). Both are OrderedManyToManyFields,
// listed by their membership position, with filter_read_permission off:
// whoever can see the organization sees every member.

func init() {
	resourceRegistrars = append(resourceRegistrars, func(s *Server, mux *http.ServeMux) {
		s.route(mux, "/api/v2/organizations/{id}/instance_groups/{$}", methodMap{"GET": s.organizationInstanceGroups, "POST": s.organizationInstanceGroupsAttach}, s.optionsFor("instance_groups"))
		s.route(mux, "/api/v2/organizations/{id}/galaxy_credentials/{$}", methodMap{"GET": s.organizationGalaxyCredentials, "POST": s.organizationGalaxyCredentialsAttach}, s.optionsFor("credentials"))
	})
}

func (s *Server) organizationInstanceGroups(w http.ResponseWriter, r *http.Request) error {
	_, o, err := organizationObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	return s.orderedInstanceGroups(w, r, "main_organizationinstancegroupmembership", "organization_id", o.ID, false, "id")
}

func (s *Server) organizationGalaxyCredentials(w http.ResponseWriter, r *http.Request) error {
	_, o, err := organizationObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	spec := s.credentialSpec()
	// The membership join names the owner itself: a filter through a
	// to-many relation selects ids in a subquery and reads the rows from
	// spec.From again, where a member of several owners would otherwise
	// come once per owner, in another owner's position.
	spec.From = "main_credential c JOIN main_organizationgalaxycredentialmembership m ON m.credential_id = c.id AND m.organization_id = " + itoa(o.ID)
	spec.Access = nil
	spec.Fields = credentialFields.With(map[string]Field{"position": {SQL: "m.position", Kind: KindInt}})
	spec.DefaultOrder = []string{"position", "id"}
	return s.credentialListWithSpec(w, r, spec, nil)
}

// canChangeOrganization is OrganizationAccess.can_change without data.
func (s *Server) canChangeOrganization(r *http.Request, o *models.Organization) bool {
	return s.NewSerCtx(r, true).HasRole(o.AdminRoleID)
}

// organizationInstanceGroupsAttach: OrganizationAccess.can_attach (and
// can_unattach, which defers to it) takes the organization's admin role and
// use of the instance group.
func (s *Server) organizationInstanceGroupsAttach(w http.ResponseWriter, r *http.Request) error {
	u, o, err := organizationObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	detach := isDetach(body)
	gid, aerr := attachID(body, "Instance Group", detach)
	if aerr != nil {
		return aerr
	}
	g, err := s.loadInstanceGroup(r, gid)
	if err != nil {
		return err
	}
	if g == nil {
		return BadRequest("InstanceGroup matching query does not exist.")
	}
	if c := s.NewSerCtx(r, true); !c.HasRole(o.AdminRoleID) || !c.HasRole(g.UseRoleID) {
		return ErrForbidden
	}
	err = s.changeOrderedLink(r.Context(), u, orderedLink{Table: "main_organizationinstancegroupmembership", OwnerCol: "organization_id", MemberCol: "instancegroup_id",
		Owner: o.ID, Member: g.ID, Object1: "organization", Object2: "instance_group", Relationship: orgInstanceGroupRel}, detach)
	if err != nil {
		return err
	}
	if detach {
		// The mixin saved the organization after the removal.
		if _, err := s.Q().Exec(r.Context(), `UPDATE main_organization SET modified = now() WHERE id = $1`, o.ID); err != nil {
			return err
		}
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// organizationGalaxyCredentialsAttach needs the organization's admin and
// read access to the credential (BaseAccess.can_attach, which can_unattach
// also used for this relation), which must be a Galaxy credential. Read is
// enough, as it was: the token is sent only to the server the credential
// itself names, and is hidden from the project update's job_env.
func (s *Server) organizationGalaxyCredentialsAttach(w http.ResponseWriter, r *http.Request) error {
	u, o, err := organizationObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	detach := isDetach(body)
	cid, aerr := attachID(body, "Credential", detach)
	if aerr != nil {
		return aerr
	}
	cr, err := models.GetCredential(r.Context(), s.Q(), cid)
	if err != nil {
		if db.IsNoRows(err) {
			return BadRequest("Credential matching query does not exist.")
		}
		return err
	}
	c := s.NewSerCtx(r, true)
	if !s.canChangeOrganization(r, o) || !(u.IsSystemAuditor || c.HasRole(cr.ReadRoleID)) {
		return ErrForbidden
	}
	if !detach {
		ct, err := models.GetCredentialType(r.Context(), s.Q(), cr.CredentialTypeID)
		if err != nil {
			return err
		}
		if ct.Namespace == nil || *ct.Namespace != "galaxy_api_token" {
			return &APIError{Status: http.StatusBadRequest, Body: map[string]any{"msg": fmt.Sprintf("Credential must be a Galaxy credential, not %s.", ct.Name)}}
		}
	}
	err = s.changeOrderedLink(r.Context(), u, orderedLink{Table: "main_organizationgalaxycredentialmembership", OwnerCol: "organization_id", MemberCol: "credential_id",
		Owner: o.ID, Member: cr.ID, Object1: "organization", Object2: "credential", Relationship: orgGalaxyRel}, detach)
	if err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}
