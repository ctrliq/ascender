package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/activity"
	"github.com/ctrliq/ascender/internal/auth"
	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/models"
)

var credentialFields *FieldSet

func credentialFieldSet(a string) *FieldSet {
	return &FieldSet{
		Model: "Credential",
		Fields: map[string]Field{
			"id": {SQL: a + ".id", Kind: KindInt}, "name": {SQL: a + ".name"}, "description": {SQL: a + ".description"},
			"created": {SQL: a + ".created", Kind: KindDateTime}, "modified": {SQL: a + ".modified", Kind: KindDateTime},
			"inputs": {SQL: a + ".inputs", Kind: KindJSON, NoFilter: true}, "managed": {SQL: a + ".managed", Kind: KindBool},
			"organization":    {SQL: a + ".organization_id", Kind: KindFK, Rel: &Relation{Alias: "o", Join: "LEFT JOIN main_organization o ON o.id = " + a + ".organization_id", Target: func() *FieldSet { return organizationFields }}},
			"credential_type": {SQL: a + ".credential_type_id", Kind: KindFK, Rel: &Relation{Alias: a + "ct", Join: "LEFT JOIN main_credentialtype " + a + "ct ON " + a + "ct.id = " + a + ".credential_type_id", Target: func() *FieldSet { return credentialTypeFieldSet(a + "ct") }}},
			"created_by":      {SQL: a + ".created_by_id", Kind: KindFK, Rel: &Relation{Alias: a + "cb", Join: "LEFT JOIN auth_user " + a + "cb ON " + a + "cb.id = " + a + ".created_by_id", Target: func() *FieldSet { return userFieldsAlias(a + "cb") }}},
			"modified_by":     {SQL: a + ".modified_by_id", Kind: KindFK, Rel: &Relation{Alias: a + "mb", Join: "LEFT JOIN auth_user " + a + "mb ON " + a + "mb.id = " + a + ".modified_by_id", Target: func() *FieldSet { return userFieldsAlias(a + "mb") }}},
		},
		SearchFields: []string{"name", "description"},
	}
}

func init() {
	credentialFields = credentialFieldSet("c")
	resourceRegistrars = append(resourceRegistrars, func(s *Server, mux *http.ServeMux) {
		s.route(mux, "/api/v2/credentials/{$}", methodMap{"GET": s.credentialList, "POST": s.credentialCreate}, s.optionsFor("credentials"))
		s.route(mux, "/api/v2/credentials/{id}/{$}", methodMap{"GET": s.credentialDetail, "PUT": s.credentialUpdate, "PATCH": s.credentialUpdate, "DELETE": s.credentialDelete}, s.optionsFor("credentials"))
		s.route(mux, "/api/v2/credentials/{id}/object_roles/{$}", methodMap{"GET": s.objectRolesRoute("main.credential", credentialObj.parentCheck(s))}, nil)
		s.route(mux, "/api/v2/credentials/{id}/owner_users/{$}", methodMap{"GET": s.credentialOwnerUsers}, nil)
		s.route(mux, "/api/v2/credentials/{id}/owner_teams/{$}", methodMap{"GET": s.credentialOwnerTeams}, nil)
		s.route(mux, "/api/v2/credentials/{id}/input_sources/{$}", methodMap{"GET": s.credentialInputSources, "POST": s.inputSourceSubCreate}, s.optionsFor("credential_input_sources"))
		s.route(mux, "/api/v2/credentials/{id}/copy/{$}", methodMap{"GET": s.credentialCanCopy, "POST": s.credentialCopy}, nil)
		s.route(mux, "/api/v2/credentials/{id}/test/{$}", methodMap{"GET": s.credentialExternalTest, "POST": s.credentialExternalTest}, s.optionsFor("credentials"))
		s.route(mux, "/api/v2/organizations/{id}/credentials/{$}", methodMap{"GET": s.organizationCredentials, "POST": s.credentialSubCreate(credentialsOfOrg)}, s.optionsFor("credentials"))
		s.route(mux, "/api/v2/credential_input_sources/{$}", methodMap{"GET": s.credentialInputSourceList, "POST": s.inputSourceListCreate}, s.optionsFor("credential_input_sources"))
		s.route(mux, "/api/v2/credential_input_sources/{id}/{$}", methodMap{"GET": s.credentialInputSourceDetail, "PUT": s.inputSourceUpdate, "PATCH": s.inputSourceUpdate, "DELETE": s.inputSourceDelete}, s.optionsFor("credential_input_sources"))
	})
}

func (s *Server) credentialAccess(q *Query, u *auth.User) {
	q.And("c.id IN (" + accessibleSQL(q, u.ID, s.CT.ID("main.credential"), "read_role") + ")")
}

func (s *Server) credentialSpec() ListSpec {
	return ListSpec{Model: "Credential", From: "main_credential c", Columns: models.CredentialColumns, PK: "c.id", Fields: credentialFields, DefaultOrder: []string{"name"}, Access: s.credentialAccess}
}

func (s *Server) credentialList(w http.ResponseWriter, r *http.Request) error {
	return s.credentialListWith(w, r, nil)
}

func (s *Server) credentialListWith(w http.ResponseWriter, r *http.Request, extra func(q *Query)) error {
	return s.credentialListWithSpec(w, r, s.credentialSpec(), extra)
}

// credentialSubView names the sub-list a credential is listed or created
// through: users/<pk>/credentials/ and teams/<pk>/credentials/ used
// UserCredentialSerializerCreate and TeamCredentialSerializerCreate, which
// leave the organization field out; organizations/<pk>/credentials/ kept it.
type credentialSubView string

const (
	credentialsOfUser credentialSubView = "user"
	credentialsOfTeam credentialSubView = "team"
	credentialsOfOrg  credentialSubView = "organization"
	// credentialsOfJobTemplate is job_templates/<pk>/credentials/, which
	// created with CredentialSerializer: no user or team field, so the
	// organization is the only owner it takes and it may be left out,
	// and nothing of the parent goes into the data.
	credentialsOfJobTemplate credentialSubView = "job_template"
	// credentialsOfCredentialType is credential_types/<pk>/credentials/,
	// CredentialTypeCredentialList: CredentialSerializer with no
	// parent_key, so the credential type comes from the body, as on
	// job_templates/<pk>/credentials/, and the URL's type is only looked
	// up (for anyone but a superuser) by the permission check.
	credentialsOfCredentialType credentialSubView = "credential_type"
)

// plainSerializer reports whether the view created with
// CredentialSerializer rather than CredentialSerializerCreate: no user or
// team field and no owner required, nothing of the parent in the data.
func (v credentialSubView) plainSerializer() bool {
	return v == credentialsOfJobTemplate || v == credentialsOfCredentialType
}

// omitsOrganization reports whether the view's serializer has no
// organization field.
func (v credentialSubView) omitsOrganization() bool {
	return v == credentialsOfUser || v == credentialsOfTeam
}

// stripCredentialFields drops what the view's serializer did not have.
func stripCredentialFields(results []any, view credentialSubView) {
	if !view.omitsOrganization() {
		return
	}
	for _, r := range results {
		if o, ok := r.(*OMap); ok {
			o.Delete("organization")
		}
	}
}

// credentialSubCreate is SubListCreateAPIView.create for a credential
// sub-list: the parent's key goes into the data (for the views that have
// one), and the fields the view's serializer excludes are ignored.
func (s *Server) credentialSubCreate(view credentialSubView) HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) error {
		return s.credentialCreateVia(w, r, view)
	}
}

// credentialListWithSpec serves credentials through a list spec of the
// caller's, such as a relation's join and order.
func (s *Server) credentialListWithSpec(w http.ResponseWriter, r *http.Request, spec ListSpec, extra func(q *Query)) error {
	return s.credentialListView(w, r, spec, extra, "")
}

func (s *Server) credentialListView(w http.ResponseWriter, r *http.Request, spec ListSpec, extra func(q *Query), view credentialSubView) error {
	spec.RoleLevel = "main.credential"
	creds, count, page, err := runListOf(s, r, spec, extra, models.ScanCredential)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, false)
	results, err := s.serializeCredentials(c, creds)
	if err != nil {
		return err
	}
	stripCredentialFields(results, view)
	WriteJSON(w, 200, Paginate(r, page, count, results))
	return nil
}

func (s *Server) organizationCredentials(w http.ResponseWriter, r *http.Request) error {
	_, o, err := organizationObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	return s.credentialListWith(w, r, func(q *Query) { q.And("c.organization_id = " + q.Arg(o.ID)) })
}

// credentialOwner describes one entry of summary_fields.owners.
type credentialOwner struct {
	ID          int64
	Type        string
	Name        string
	Description string
	URL         string
}

// loadCredentialOwners reads the admin role members and parent roles that
// own each credential, keyed by credential id.
func (s *Server) loadCredentialOwners(c *SerCtx, creds []*models.Credential) (map[int64][]credentialOwner, map[int64]credentialOwner, error) {
	owners := map[int64][]credentialOwner{}
	parentLink := map[int64]credentialOwner{}
	var roleIDs []int64
	byRole := map[int64]int64{}
	for _, cr := range creds {
		if cr.AdminRoleID != nil {
			roleIDs = append(roleIDs, *cr.AdminRoleID)
			byRole[*cr.AdminRoleID] = cr.ID
		}
	}
	if len(roleIDs) == 0 {
		return owners, parentLink, nil
	}
	ctx := c.Ctx()
	rows, err := c.S.Q().Query(ctx, `SELECT m.role_id, u.id, u.username, u.first_name, u.last_name FROM main_rbac_roles_members m JOIN auth_user u ON u.id = m.user_id WHERE m.role_id = ANY($1) ORDER BY u.id`, roleIDs)
	if err != nil {
		return nil, nil, err
	}
	for rows.Next() {
		var roleID, uid int64
		var username, first, last string
		if err := rows.Scan(&roleID, &uid, &username, &first, &last); err != nil {
			rows.Close()
			return nil, nil, err
		}
		cid := byRole[roleID]
		owners[cid] = append(owners[cid], credentialOwner{ID: uid, Type: "user", Name: username, Description: first + " " + last, URL: URLFor("users", uid)})
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, nil, err
	}
	rows, err = c.S.Q().Query(ctx, `SELECT p.from_role_id, r.content_type_id, r.object_id,
		COALESCE(o.name, t.name, ''), COALESCE(o.description, t.description, '')
		FROM main_rbac_roles_parents p JOIN main_rbac_roles r ON r.id = p.to_role_id
		LEFT JOIN main_organization o ON r.content_type_id = $2 AND o.id = r.object_id
		LEFT JOIN main_team t ON r.content_type_id = $3 AND t.id = r.object_id
		WHERE p.from_role_id = ANY($1) AND r.object_id IS NOT NULL ORDER BY r.id`, roleIDs, s.CT.ID("main.organization"), s.CT.ID("main.team"))
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var roleID, ctID, objectID int64
		var name, description string
		if err := rows.Scan(&roleID, &ctID, &objectID, &name, &description); err != nil {
			return nil, nil, err
		}
		cid := byRole[roleID]
		model := s.CT.Model(ctID)
		typ := strings.TrimPrefix(model, "main.")
		coll := typ + "s"
		o := credentialOwner{ID: objectID, Type: typ, Name: name, Description: description, URL: URLFor(coll, objectID)}
		owners[cid] = append(owners[cid], o)
		if _, seen := parentLink[cid]; !seen {
			parentLink[cid] = o
		}
	}
	return owners, parentLink, rows.Err()
}

func (s *Server) serializeCredentials(c *SerCtx, creds []*models.Credential) ([]any, error) {
	types, err := models.LoadCredentialTypes(c.Ctx(), c.S.Q())
	if err != nil {
		return nil, err
	}
	var orgIDs, userIDs []int64
	for _, cr := range creds {
		if cr.OrganizationID != nil {
			orgIDs = append(orgIDs, *cr.OrganizationID)
		}
		if cr.CreatedByID != nil {
			userIDs = append(userIDs, *cr.CreatedByID)
		}
		if cr.ModifiedByID != nil {
			userIDs = append(userIDs, *cr.ModifiedByID)
		}
	}
	c.PreloadOrgs(orgIDs)
	c.PreloadUsers(userIDs)
	owners, parentLink, err := s.loadCredentialOwners(c, creds)
	if err != nil {
		return nil, err
	}
	out := make([]any, 0, len(creds))
	for _, cr := range creds {
		out = append(out, s.serializeCredential(c, cr, types[cr.CredentialTypeID], owners[cr.ID], parentLink))
	}
	return out, nil
}

func (s *Server) serializeCredential(c *SerCtx, cr *models.Credential, ct *models.CredentialType, owners []credentialOwner, parentLink map[int64]credentialOwner) *OMap {
	related := NewOMap()
	if c.Detail && ct != nil {
		orgName := ""
		if cr.OrganizationID != nil {
			if o := c.OrgSummary(cr.OrganizationID); o != nil {
				n, _ := o.Get("name")
				orgName = str(n)
			}
		}
		related.Set("named_url", "/api/v2/credentials/"+namedURLEscape(cr.Name)+"++"+namedURLEscape(ct.Name)+"+"+namedURLEscape(ct.Kind)+"++"+namedURLEscape(orgName)+"/")
	}
	setURL(related, "created_by", "users", cr.CreatedByID)
	setURL(related, "modified_by", "users", cr.ModifiedByID)
	setURL(related, "organization", "organizations", cr.OrganizationID)
	base := URLFor("credentials", cr.ID)
	for _, sub := range []string{"activity_stream", "access_list", "object_roles", "owner_users", "owner_teams", "copy", "input_sources"} {
		related.Set(sub, base+sub+"/")
	}
	related.Set("credential_type", URLFor("credential_types", cr.CredentialTypeID))
	if p, ok := parentLink[cr.ID]; ok {
		related.Set(p.Type, p.URL)
	} else {
		for _, o := range owners {
			if o.Type == "user" {
				related.Set("user", o.URL)
				break
			}
		}
	}
	summary := NewOMap()
	c.putSummary(summary, "organization", c.OrgSummary, cr.OrganizationID)
	if c.WantSummary("credential_type") && ct != nil {
		summary.Set("credential_type", NewOMap().Set("id", ct.ID).Set("name", ct.Name).Set("description", ct.Description))
	}
	c.putSummary(summary, "created_by", c.UserSummary, cr.CreatedByID)
	c.putSummary(summary, "modified_by", c.UserSummary, cr.ModifiedByID)
	if c.WantSummary("object_roles") {
		summary.Set("object_roles", c.RolesSummary("credential", models.CredentialRoleFields, cr.RoleID))
	}
	if c.WantSummary("user_capabilities") && !c.NoCaps {
		admin := c.HasRole(cr.AdminRoleID)
		caps := NewOMap().Set("edit", admin && !cr.Managed).Set("delete", admin && !cr.Managed).Set("copy", s.canCopyCredential(c, cr)).Set("use", c.HasRole(cr.UseRoleID))
		summary.Set("user_capabilities", caps)
	}
	if c.WantSummary("owners") {
		list := make([]any, 0, len(owners))
		for _, o := range owners {
			list = append(list, NewOMap().Set("id", o.ID).Set("type", o.Type).Set("name", o.Name).Set("description", o.Description).Set("url", o.URL))
		}
		summary.Set("owners", list)
	}
	o := Base(NewOMap(), cr.ID, "credential", base, related, summary, cr.Created, cr.Modified, cr.Name, cr.Description)
	o.Set("organization", models.NullableID(cr.OrganizationID)).Set("credential_type", cr.CredentialTypeID).Set("managed", cr.Managed).Set("inputs", displayInputs(cr))
	var kind any
	cloud, kube := false, false
	if ct != nil {
		if ct.Namespace != nil {
			kind = *ct.Namespace
		}
		cloud = ct.Kind == "cloud"
		kube = ct.Kind == "kubernetes"
	}
	o.Set("kind", kind).Set("cloud", cloud).Set("kubernetes", kube)
	return o
}

// canAddCredential decides whether the user may create a credential owned
// by the organization (or by themselves when it has none).
func (s *Server) canAddCredential(c *SerCtx, orgID *int64) bool {
	if c.User.IsSuperuser {
		return true
	}
	if orgID == nil {
		return true
	}
	return c.HasRoleOn("main.organization", *orgID, "admin_role") || c.HasRoleOn("main.organization", *orgID, "credential_admin_role")
}

// credentialObj is a credential.
var credentialObj = &pathObject[*models.Credential]{
	model:    "Credential",
	get:      models.GetCredential,
	readable: func(c *SerCtx, v *models.Credential) bool { return c.HasRole(v.ReadRoleID) },
}

func (s *Server) credentialDetail(w http.ResponseWriter, r *http.Request) error {
	_, cr, err := credentialObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	results, err := s.serializeCredentials(c, []*models.Credential{cr})
	if err != nil {
		return err
	}
	WriteJSON(w, 200, results[0])
	return nil
}

func (s *Server) credentialChanges(c *SerCtx, cr *models.Credential, ct *models.CredentialType) map[string]any {
	var org any
	if cr.OrganizationID != nil {
		if o := c.OrgSummary(cr.OrganizationID); o != nil {
			n, _ := o.Get("name")
			org = activity.Ref(str(n), *cr.OrganizationID)
		}
	}
	var typ any
	if ct != nil {
		typ = activity.Ref(ct.Name, ct.ID)
	}
	return map[string]any{"name": cr.Name, "description": cr.Description, "organization": org, "credential_type": typ, "managed": cr.Managed, "inputs": "hidden", "id": cr.ID}
}

func (s *Server) credentialNameTaken(r *http.Request, name string, orgID *int64, typeID, exclude int64) (bool, error) {
	var n int
	if err := s.Q().QueryRow(r.Context(), `SELECT count(*) FROM main_credential WHERE name = $1 AND credential_type_id = $2 AND id <> $3 AND ((organization_id IS NULL AND $4::bigint IS NULL) OR organization_id = $4)`, name, typeID, exclude, orgID).Scan(&n); err != nil {
		return false, err
	}
	return n > 0, nil
}

var credentialUniqueError = "Credential with this (organization, name, credential_type) combination already exists."

func (s *Server) credentialCreate(w http.ResponseWriter, r *http.Request) error {
	return s.credentialCreateVia(w, r, "")
}

func (s *Server) credentialCreateVia(w http.ResponseWriter, r *http.Request, view credentialSubView) error {
	u, err := RequireWrite(r)
	if err != nil {
		return err
	}
	if view == credentialsOfCredentialType && !u.IsSuperuser {
		// ModelAccessPermission.check_post_permissions: the parent is
		// fetched (404) and read (any user may) before the body is parsed;
		// a superuser skips it, so the type in the URL need not exist.
		if _, err := s.loadCredentialType(r); err != nil {
			return err
		}
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	cr, result, err := s.createCredential(r, u, body, view)
	if err != nil {
		return err
	}
	w.Header().Set("Location", URLFor("credentials", cr.ID))
	WriteJSON(w, http.StatusCreated, result)
	return nil
}

// createCredential is the create of the credential list or sub-list view
// names: the serializer's validation, CredentialAccess.can_add and the
// save, with the activity stream entry. It returns the credential and its
// serialization, the body of the 201.
func (s *Server) createCredential(r *http.Request, u *auth.User, body *OMap, view credentialSubView) (*models.Credential, any, error) {
	if view.plainSerializer() {
		body.Delete("user")
		body.Delete("team")
	} else if view != "" {
		// data[parent_key] = pk; the serializer has no field for the
		// other two owners.
		for _, k := range []string{"user", "team", "organization"} {
			if k != string(view) {
				body.Delete(k)
			}
		}
		body.Set(string(view), r.PathValue("id"))
	}
	f := NewForm(body, false)
	cr := &models.Credential{CreatedByID: &u.ID, ModifiedByID: &u.ID}
	cr.Name = f.String("name", true, 512, "")
	cr.Description = f.String("description", false, 0, "")
	ctx := r.Context()
	typeID, _ := f.ID("credential_type", nil, true, func(id int64) bool {
		_, err := models.GetCredentialType(ctx, s.Q(), id)
		return err == nil
	})
	orgID, _ := f.ID("organization", nil, false, func(id int64) bool {
		_, err := models.GetOrganization(ctx, s.Q(), id)
		return err == nil
	})
	userID, _ := f.ID("user", nil, false, func(id int64) bool {
		_, err := auth.UserByID(ctx, s.Q(), id)
		return err == nil
	})
	teamID, _ := f.ID("team", nil, false, func(id int64) bool {
		t, err := s.loadTeam(r, id)
		return err == nil && t != nil
	})
	if err := f.Err(); err != nil {
		return nil, nil, err
	}
	var ownerFields []string
	if orgID != nil {
		ownerFields = append(ownerFields, "organization")
	}
	if teamID != nil {
		ownerFields = append(ownerFields, "team")
	}
	if userID != nil {
		ownerFields = append(ownerFields, "user")
	}
	if !view.plainSerializer() {
		if len(ownerFields) == 0 {
			return nil, nil, FieldErrors{"detail": {"Missing 'user', 'team', or 'organization'."}}.Err()
		}
		if len(ownerFields) > 1 {
			return nil, nil, FieldErrors{"detail": {fmt.Sprintf("Only one of 'user', 'team', or 'organization' should be provided, received %s fields.", strings.Join(ownerFields, ", "))}}.Err()
		}
	}
	var tm *team
	if teamID != nil {
		tm, _ = s.loadTeam(r, *teamID)
		orgID = tm.OrganizationID
	}
	cr.OrganizationID = orgID
	cr.CredentialTypeID = *typeID
	ct, err := models.GetCredentialType(ctx, s.Q(), cr.CredentialTypeID)
	if err != nil {
		return nil, nil, err
	}
	c := s.NewSerCtx(r, true)
	// Permission: the owner decides, as CredentialAccess.can_add did.
	if !u.IsSuperuser {
		switch {
		case orgID == nil && userID == nil && teamID == nil:
			// Only a superuser creates a credential with no owner
			// (can_add wants one owner field), which CredentialSerializer
			// lets through.
			return nil, nil, ErrForbidden
		case userID != nil && *userID != u.ID:
			return nil, nil, ErrForbidden
		case tm != nil && !s.canChangeTeam(ctx, u, tm):
			// check_user_access(Team, 'change'): admin of the team, and
			// MANAGE_ORGANIZATION_AUTH on.
			return nil, nil, ErrForbidden
		case tm == nil && orgID != nil && !c.HasRoleOn("main.organization", *orgID, "admin_role") && !c.HasRoleOn("main.organization", *orgID, "credential_admin_role"):
			return nil, nil, ErrForbidden
		}
	}
	rawInputs, _ := f.Raw("inputs")
	inputs, err := s.validateCredentialInputs(ct, rawInputs, nil, nil)
	if err != nil {
		return nil, nil, err
	}
	if v, err := s.credentialNameTaken(r, cr.Name, cr.OrganizationID, cr.CredentialTypeID, 0); err != nil {
		return nil, nil, err
	} else if v {
		return nil, nil, FieldErrors{"__all__": {credentialUniqueError}}.Err()
	}
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if err := models.InsertCredential(ctx, tx, cr, s.CT, s.Roles, s.orgLookup(r, tx)); err != nil {
			return err
		}
		enc, err := s.encryptInputs(ct, cr.ID, inputs)
		if err != nil {
			return err
		}
		cr.Inputs = enc
		if err := models.UpdateCredentialInputs(ctx, tx, cr.ID, enc); err != nil {
			return err
		}
		if err := s.Activity.Record(ctx, tx, activity.Entry{Operation: "create", Object1: "credential", Changes: s.credentialChanges(c.InTx(tx), cr, ct), ActorID: &u.ID, Links: map[string]int64{"credential": cr.ID}}); err != nil {
			return err
		}
		// After the create entry, as the serializer added the team once
		// the credential was saved.
		if tm != nil {
			if tm.AdminRoleID != nil {
				if err := s.addTeamRoleParent(ctx, tx, u, *cr.AdminRoleID, *tm.AdminRoleID, "credential", cr.ID); err != nil {
					return err
				}
			}
			if tm.MemberRoleID != nil {
				if err := s.addTeamRoleParent(ctx, tx, u, *cr.UseRoleID, *tm.MemberRoleID, "credential", cr.ID); err != nil {
					return err
				}
			}
		}
		if userID != nil {
			return s.addAdminMember(ctx, tx, u, *cr.AdminRoleID, *userID)
		}
		return nil
	})
	if err != nil {
		return nil, nil, err
	}
	results, err := s.serializeCredentials(c, []*models.Credential{cr})
	if err != nil {
		return nil, nil, err
	}
	stripCredentialFields(results, view)
	return cr, results[0], nil
}

// credentialInUse reports whether jobs, templates or projects reference it,
// which blocks changing its type.
func (s *Server) credentialInUse(r *http.Request, id int64) (bool, error) {
	var n int
	if err := s.Q().QueryRow(r.Context(), `SELECT (SELECT count(*) FROM main_unifiedjobtemplate_credentials WHERE credential_id = $1) + (SELECT count(*) FROM main_unifiedjob_credentials WHERE credential_id = $1)
		+ (SELECT count(*) FROM main_project WHERE credential_id = $1 OR signature_validation_credential_id = $1) + (SELECT count(*) FROM main_projectupdate WHERE credential_id = $1)
		+ (SELECT count(*) FROM main_adhoccommand WHERE credential_id = $1) + (SELECT count(*) FROM main_workflowjobnode_credentials WHERE credential_id = $1)`, id).Scan(&n); err != nil {
		return false, err
	}
	return n > 0, nil
}

func (s *Server) credentialUpdate(w http.ResponseWriter, r *http.Request) error {
	u, cr, err := credentialObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	if !c.HasRole(cr.AdminRoleID) {
		return ErrForbidden
	}
	if cr.Managed {
		return Detail(http.StatusForbidden, "Modifications not allowed for managed credentials")
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	ctx := r.Context()
	ct, err := models.GetCredentialType(ctx, s.Q(), cr.CredentialTypeID)
	if err != nil {
		return err
	}
	before := s.credentialChanges(c, cr, ct)
	prevOrg := cr.OrganizationID
	f := NewForm(body, r.Method == http.MethodPatch)
	cr.Name = f.String("name", true, 512, cr.Name)
	cr.Description = f.String("description", false, 0, cr.Description)
	typeID, _ := f.ID("credential_type", &cr.CredentialTypeID, true, func(id int64) bool {
		_, err := models.GetCredentialType(ctx, s.Q(), id)
		return err == nil
	})
	orgID, orgSet := f.ID("organization", cr.OrganizationID, false, func(id int64) bool {
		_, err := models.GetOrganization(ctx, s.Q(), id)
		return err == nil
	})
	if err := f.Err(); err != nil {
		return err
	}
	if typeID != nil && *typeID != cr.CredentialTypeID {
		if v, err := s.credentialInUse(r, cr.ID); err != nil {
			return err
		} else if v {
			return FieldErrors{"credential_type": {"You cannot change the credential type of the credential, as it may break the functionality of the resources using it."}}.Err()
		}
		cr.CredentialTypeID = *typeID
		if ct, err = models.GetCredentialType(ctx, s.Q(), cr.CredentialTypeID); err != nil {
			return err
		}
	}
	if orgSet {
		cr.OrganizationID = orgID
	}
	orgChanged := (prevOrg == nil) != (cr.OrganizationID == nil) || (prevOrg != nil && cr.OrganizationID != nil && *prevOrg != *cr.OrganizationID)
	// check_related('organization', credential_admin_role, obj=obj): a
	// move needs the role on the organization the credential leaves as
	// well as on the one it joins, so a user given admin on one
	// credential cannot take it out of its organization's reach (or make
	// it private) and keep its secret to themselves.
	if orgChanged && !u.IsSuperuser {
		if prevOrg != nil && !c.HasRoleOn("main.organization", *prevOrg, "credential_admin_role") {
			return ErrForbidden
		}
		if cr.OrganizationID != nil && !c.HasRoleOn("main.organization", *cr.OrganizationID, "credential_admin_role") {
			return ErrForbidden
		}
	}
	existing := cr.InputsMap()
	inputs := existing
	if raw, has := f.Raw("inputs"); has {
		if ct.Kind == "vault" {
			if m, ok := plainValue(raw).(map[string]any); ok {
				if nv, has := m["vault_id"]; has && fmt.Sprint(nv) != fmt.Sprint(existing["vault_id"]) {
					return FieldErrors{"inputs": {"Vault IDs cannot be changed once they have been created."}}.Err()
				}
			}
		}
		inputs, err = s.validateCredentialInputs(ct, raw, existing, &cr.ID)
		if err != nil {
			return err
		}
	}
	if v, err := s.credentialNameTaken(r, cr.Name, cr.OrganizationID, cr.CredentialTypeID, cr.ID); err != nil {
		return err
	} else if v {
		return FieldErrors{"__all__": {credentialUniqueError}}.Err()
	}
	enc, err := s.encryptInputs(ct, cr.ID, inputs)
	if err != nil {
		return err
	}
	cr.Inputs = enc
	cr.ModifiedByID = &u.ID
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if err := models.UpdateCredential(ctx, tx, cr, s.orgLookup(r, tx), orgChanged); err != nil {
			return err
		}
		changes := diffChanges(before, s.credentialChanges(c.InTx(tx), cr, ct))
		if len(changes) == 0 {
			return nil
		}
		return s.Activity.Record(ctx, tx, activity.Entry{Operation: "update", Object1: "credential", Changes: changes, ActorID: &u.ID, Links: map[string]int64{"credential": cr.ID}})
	})
	if err != nil {
		return err
	}
	results, err := s.serializeCredentials(c, []*models.Credential{cr})
	if err != nil {
		return err
	}
	WriteJSON(w, 200, results[0])
	return nil
}

func (s *Server) credentialDelete(w http.ResponseWriter, r *http.Request) error {
	u, cr, err := credentialObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	if !c.HasRole(cr.AdminRoleID) {
		return ErrForbidden
	}
	if cr.Managed {
		return Detail(http.StatusForbidden, "Deletion not allowed for managed credentials")
	}
	ctx := r.Context()
	ct, err := models.GetCredentialType(ctx, s.Q(), cr.CredentialTypeID)
	if err != nil {
		return err
	}
	if err := s.deleteCredential(c, u, cr, ct); err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// deleteCredential deletes a credential with its activity stream entry.
func (s *Server) deleteCredential(c *SerCtx, u *auth.User, cr *models.Credential, ct *models.CredentialType) error {
	ctx := c.Ctx()
	return s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if err := s.Activity.Record(ctx, tx, activity.Entry{Operation: "delete", Object1: "credential", Changes: s.credentialChanges(c.InTx(tx), cr, ct), ActorID: &u.ID}); err != nil {
			return err
		}
		return models.DeleteCredential(ctx, tx, cr.ID, s.CT, s.Cascade)
	})
}

func (s *Server) credentialOwnerUsers(w http.ResponseWriter, r *http.Request) error {
	u, cr, err := credentialObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	page, err := ParsePage(r)
	if err != nil {
		return err
	}
	var ids []int64
	if cr.AdminRoleID != nil {
		rows, err := s.Q().Query(r.Context(), `SELECT u.id FROM main_rbac_roles_members m JOIN auth_user u ON u.id = m.user_id WHERE m.role_id = $1 ORDER BY u.username`, *cr.AdminRoleID)
		if err != nil {
			return err
		}
		var all []int64
		for rows.Next() {
			var uid int64
			if err := rows.Scan(&uid); err != nil {
				rows.Close()
				return err
			}
			all = append(all, uid)
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return err
		}
		// filter_read_permission: only the owners the viewer may see.
		for _, uid := range all {
			if s.canReadUser(r.Context(), u, uid) {
				ids = append(ids, uid)
			}
		}
	}
	c := s.NewSerCtx(r, false)
	results := []any{}
	start, end := (page.Number-1)*page.Size, page.Number*page.Size
	for i, uid := range ids {
		if i < start || i >= end {
			continue
		}
		target, err := auth.UserByID(r.Context(), s.Q(), uid)
		if err != nil {
			return err
		}
		o, err := s.serializeUserWith(c, target, u, true)
		if err != nil {
			return err
		}
		results = append(results, o)
	}
	WriteJSON(w, 200, Paginate(r, page, len(ids), results))
	return nil
}

func (s *Server) credentialOwnerTeams(w http.ResponseWriter, r *http.Request) error {
	_, cr, err := credentialObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	adminRole := int64(0)
	if cr.AdminRoleID != nil {
		adminRole = *cr.AdminRoleID
	}
	return s.teamListWith(w, r, func(q *Query) {
		q.And("t.id IN (SELECT r.object_id FROM main_rbac_roles_parents p JOIN main_rbac_roles r ON r.id = p.to_role_id WHERE p.from_role_id = " + q.Arg(adminRole) + " AND r.content_type_id = " + q.Arg(s.CT.ID("main.team")) + ")")
	})
}

// --- copy --------------------------------------------------------------------

func (s *Server) credentialCanCopy(w http.ResponseWriter, r *http.Request) error {
	_, cr, err := credentialObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	WriteJSON(w, 200, NewOMap().Set("can_copy", s.canCopyCredential(c, cr)))
	return nil
}

// canCopyCredential is CopyAPIView's CredentialAccess.can_add with the
// copy's data: an organization's credential copies for whoever may add
// credentials to it. The copy carries no user or team, so one without an
// organization has no owner a non-superuser could add it for, and it is
// the superuser's alone: being able to read a private credential (a
// system auditor, a user granted use) must not hand over its secrets.
func (s *Server) canCopyCredential(c *SerCtx, cr *models.Credential) bool {
	if cr.OrganizationID == nil {
		return c.User.IsSuperuser
	}
	return s.canAddCredential(c, cr.OrganizationID)
}

func (s *Server) credentialCopy(w http.ResponseWriter, r *http.Request) error {
	u, cr, err := credentialObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	if !s.canCopyCredential(c, cr) {
		return ErrForbidden
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	name, err := copyName(body, cr.Name)
	if err != nil {
		return err
	}
	ctx := r.Context()
	ct, err := models.GetCredentialType(ctx, s.Q(), cr.CredentialTypeID)
	if err != nil {
		return err
	}
	plain, err := s.decryptInputs(ct, cr)
	if err != nil {
		return err
	}
	nc := &models.Credential{Name: name, Description: cr.Description, OrganizationID: cr.OrganizationID, CredentialTypeID: cr.CredentialTypeID, CreatedByID: &u.ID, ModifiedByID: &u.ID}
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if err := models.InsertCredential(ctx, tx, nc, s.CT, s.Roles, s.orgLookup(r, tx)); err != nil {
			return err
		}
		enc, err := s.encryptInputs(ct, nc.ID, plain)
		if err != nil {
			return err
		}
		nc.Inputs = enc
		if err := models.UpdateCredentialInputs(ctx, tx, nc.ID, enc); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO main_credentialinputsource (created, modified, description, input_field_name, metadata, created_by_id, modified_by_id, source_credential_id, target_credential_id)
			SELECT now(), now(), description, input_field_name, metadata, $2, $2, source_credential_id, $3 FROM main_credentialinputsource WHERE target_credential_id = $1`, cr.ID, u.ID, nc.ID); err != nil {
			return err
		}
		if err := s.Activity.Record(ctx, tx, activity.Entry{Operation: "create", Object1: "credential", Changes: s.credentialChanges(c.InTx(tx), nc, ct), ActorID: &u.ID, Links: map[string]int64{"credential": nc.ID}}); err != nil {
			return err
		}
		return s.addAdminMember(ctx, tx, u, *nc.AdminRoleID, u.ID)
	})
	if err != nil {
		return err
	}
	results, err := s.serializeCredentials(c, []*models.Credential{nc})
	if err != nil {
		return err
	}
	w.Header().Set("Location", URLFor("credentials", nc.ID))
	WriteJSON(w, http.StatusCreated, results[0])
	return nil
}

// --- input sources -----------------------------------------------------------

var credentialInputSourceFields = &FieldSet{Model: "CredentialInputSource", Fields: map[string]Field{
	"id": {SQL: "cis.id", Kind: KindInt}, "description": {SQL: "cis.description"}, "input_field_name": {SQL: "cis.input_field_name"},
	"created": {SQL: "cis.created", Kind: KindDateTime}, "modified": {SQL: "cis.modified", Kind: KindDateTime}, "metadata": {SQL: "cis.metadata", Kind: KindJSON},
	"source_credential": {SQL: "cis.source_credential_id", Kind: KindFK, Rel: &Relation{Alias: "sc", Join: "LEFT JOIN main_credential sc ON sc.id = cis.source_credential_id", Target: func() *FieldSet { return credentialFieldSet("sc") }}},
	"target_credential": {SQL: "cis.target_credential_id", Kind: KindFK, Rel: &Relation{Alias: "tc", Join: "LEFT JOIN main_credential tc ON tc.id = cis.target_credential_id", Target: func() *FieldSet { return credentialFieldSet("tc") }}},
	"created_by":        {SQL: "cis.created_by_id", Kind: KindFK}, "modified_by": {SQL: "cis.modified_by_id", Kind: KindFK},
}, SearchFields: []string{"description", "input_field_name"}}

func (s *Server) credentialInputSourceAccess(q *Query, u *auth.User) {
	q.And("cis.target_credential_id IN (" + accessibleSQL(q, u.ID, s.CT.ID("main.credential"), "read_role") + ")")
}

func (s *Server) credentialInputSourceListWith(w http.ResponseWriter, r *http.Request, extra func(q *Query)) error {
	spec := ListSpec{Model: "CredentialInputSource", From: "main_credentialinputsource cis", Columns: models.CredentialInputSourceColumns, PK: "cis.id", Fields: credentialInputSourceFields, DefaultOrder: []string{"id"}, Access: s.credentialInputSourceAccess}
	srcs, count, page, err := runListOf(s, r, spec, extra, models.ScanCredentialInputSource)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, false)
	results := make([]any, 0, len(srcs))
	for _, src := range srcs {
		o, err := s.serializeCredentialInputSource(c, src)
		if err != nil {
			return err
		}
		results = append(results, o)
	}
	WriteJSON(w, 200, Paginate(r, page, count, results))
	return nil
}

func (s *Server) credentialInputSourceList(w http.ResponseWriter, r *http.Request) error {
	return s.credentialInputSourceListWith(w, r, nil)
}

func (s *Server) credentialInputSources(w http.ResponseWriter, r *http.Request) error {
	_, cr, err := credentialObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	return s.credentialInputSourceListWith(w, r, func(q *Query) { q.And("cis.target_credential_id = " + q.Arg(cr.ID)) })
}

func (s *Server) credentialInputSourceDetail(w http.ResponseWriter, r *http.Request) error {
	u, err := RequireUser(r)
	if err != nil {
		return err
	}
	id, err := PathID(r)
	if err != nil {
		return NotFoundFor("CredentialInputSource")
	}
	src, err := models.ScanCredentialInputSource(s.Q().QueryRow(r.Context(), `SELECT `+models.CredentialInputSourceColumns+` FROM main_credentialinputsource cis WHERE cis.id = $1`, id))
	if err != nil {
		if db.IsNoRows(err) {
			return NotFoundFor("CredentialInputSource")
		}
		return err
	}
	// CredentialInputSourceAccess.can_read: readers of the target.
	if _, err := credentialObj.load(s, r, u, src.TargetCredentialID); err != nil {
		return err
	}
	o, err := s.serializeCredentialInputSource(s.NewSerCtx(r, true), src)
	if err != nil {
		return err
	}
	WriteJSON(w, 200, o)
	return nil
}

func (s *Server) serializeCredentialInputSource(c *SerCtx, src *models.CredentialInputSource) (*OMap, error) {
	related := NewOMap()
	setURL(related, "created_by", "users", src.CreatedByID)
	setURL(related, "modified_by", "users", src.ModifiedByID)
	related.Set("source_credential", URLFor("credentials", src.SourceCredentialID)).Set("target_credential", URLFor("credentials", src.TargetCredentialID))
	summary := NewOMap()
	c.putSummary(summary, "created_by", c.UserSummary, src.CreatedByID)
	c.putSummary(summary, "modified_by", c.UserSummary, src.ModifiedByID)
	// The old summaries of input sources left out "kubernetes".
	for _, pair := range []struct {
		key string
		id  int64
	}{{"source_credential", src.SourceCredentialID}, {"target_credential", src.TargetCredentialID}} {
		if !c.WantSummary(pair.key) {
			continue
		}
		if cs := c.CredentialSummary(&pair.id); cs != nil {
			cs.Delete("kubernetes")
			summary.Set(pair.key, cs)
		}
	}
	if c.WantSummary("user_capabilities") && !c.NoCaps {
		summary.Set("user_capabilities", NewOMap().Set("delete", c.HasRoleOn("main.credential", src.TargetCredentialID, "admin_role")))
	}
	meta := json.RawMessage(src.Metadata)
	if len(meta) == 0 {
		meta = json.RawMessage("{}")
	}
	o := NewOMap().Set("id", src.ID).Set("type", "credential_input_source").Set("url", URLFor("credential_input_sources", src.ID)).Set("related", related).Set("summary_fields", summary)
	o.Set("created", models.FormatTime(src.Created)).Set("modified", models.FormatTime(src.Modified)).Set("description", src.Description)
	o.Set("input_field_name", src.InputFieldName).Set("metadata", meta).Set("target_credential", src.TargetCredentialID).Set("source_credential", src.SourceCredentialID)
	return o, nil
}
