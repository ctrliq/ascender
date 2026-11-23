package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"slices"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/activity"
	"github.com/ctrliq/ascender/internal/auth"
	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/models"
)

// Execution environments: ExecutionEnvironmentList/Detail, their copy and
// unified_job_templates views, with ExecutionEnvironmentAccess.

// executionEnvironmentFields are the fields a relation to an execution
// environment filters on.
var executionEnvironmentFields = &FieldSet{Model: "ExecutionEnvironment", Fields: map[string]Field{
	"id": {SQL: "ee.id", Kind: KindInt}, "name": {SQL: "ee.name"}, "description": {SQL: "ee.description"}, "image": {SQL: "ee.image"},
	"managed": {SQL: "ee.managed", Kind: KindBool}, "organization": {SQL: "ee.organization_id", Kind: KindFK, Rel: &Relation{Alias: "eeo", Join: "LEFT JOIN main_organization eeo ON eeo.id = ee.organization_id", Target: func() *FieldSet { return orgFieldsAlias("eeo") }}}, "pull": {SQL: "ee.pull"},
	"credential": {SQL: "ee.credential_id", Kind: KindFK, Rel: &Relation{Alias: "eec", Join: "LEFT JOIN main_credential eec ON eec.id = ee.credential_id", Target: func() *FieldSet { return credentialFieldsAlias("eec") }}},
	"created":    {SQL: "ee.created", Kind: KindDateTime}, "modified": {SQL: "ee.modified", Kind: KindDateTime},
}, SearchFields: []string{"name", "description"}}

func init() {
	resourceRegistrars = append(resourceRegistrars, func(s *Server, mux *http.ServeMux) {
		eeOptions := s.optionsFiltered("execution_environments", s.eeOptionsAllow)
		s.route(mux, "/api/v2/execution_environments/{$}", methodMap{"GET": s.executionEnvironmentList, "POST": s.executionEnvironmentCreate}, eeOptions)
		s.route(mux, "/api/v2/execution_environments/{id}/{$}", methodMap{"GET": s.executionEnvironmentDetail, "PUT": s.executionEnvironmentUpdate, "PATCH": s.executionEnvironmentUpdate, "DELETE": s.executionEnvironmentDelete}, eeOptions)
		s.route(mux, "/api/v2/execution_environments/{id}/copy/{$}", methodMap{"GET": s.executionEnvironmentCanCopy, "POST": s.executionEnvironmentCopy}, s.optionsExact("execution_environment_copy"))
		s.route(mux, "/api/v2/execution_environments/{id}/unified_job_templates/{$}", methodMap{"GET": s.executionEnvironmentTemplates}, s.optionsFor("unified_job_templates"))
		s.route(mux, "/api/v2/organizations/{id}/execution_environments/{$}", methodMap{"GET": s.organizationExecutionEnvironments}, s.optionsFor("execution_environments"))
	})
}

// executionEnvironmentAccess: global environments, plus those of
// organizations the user can read.
func (s *Server) executionEnvironmentAccess(q *Query, u *auth.User) {
	q.And("(ee.organization_id IS NULL OR ee.organization_id IN (" + accessibleSQL(q, u.ID, s.CT.ID("main.organization"), "read_role") + "))")
}

func (s *Server) executionEnvironmentList(w http.ResponseWriter, r *http.Request) error {
	return s.executionEnvironmentListWith(w, r, nil)
}

func (s *Server) organizationExecutionEnvironments(w http.ResponseWriter, r *http.Request) error {
	_, o, err := organizationObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	return s.executionEnvironmentListWith(w, r, func(q *Query) { q.And("ee.organization_id = " + q.Arg(o.ID)) })
}

func (s *Server) executionEnvironmentListWith(w http.ResponseWriter, r *http.Request, extra func(q *Query)) error {
	spec := ListSpec{Model: "ExecutionEnvironment", From: "main_executionenvironment ee", Columns: models.ExecutionEnvironmentColumns, PK: "ee.id", Fields: executionEnvironmentFields, DefaultOrder: []string{"-created"}, Access: s.executionEnvironmentAccess}
	ees, count, page, err := runListOf(s, r, spec, extra, models.ScanExecutionEnvironment)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, false)
	results := make([]any, 0, len(ees))
	for _, ee := range ees {
		results = append(results, s.serializeExecutionEnvironment(c, ee))
	}
	WriteJSON(w, 200, Paginate(r, page, count, results))
	return nil
}

func (s *Server) executionEnvironmentDetail(w http.ResponseWriter, r *http.Request) error {
	_, ee, err := eeObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	WriteJSON(w, 200, s.serializeExecutionEnvironment(s.NewSerCtx(r, true), ee))
	return nil
}

func (s *Server) serializeExecutionEnvironment(c *SerCtx, ee *models.ExecutionEnvironment) *OMap {
	related := NewOMap()
	if c.Detail {
		related.Set("named_url", "/api/v2/execution_environments/"+namedURLEscape(ee.Name)+"/")
	}
	setURL(related, "created_by", "users", ee.CreatedByID)
	setURL(related, "modified_by", "users", ee.ModifiedByID)
	related.Set("activity_stream", SubURL("execution_environments", ee.ID, "activity_stream"))
	related.Set("unified_job_templates", SubURL("execution_environments", ee.ID, "unified_job_templates"))
	related.Set("copy", SubURL("execution_environments", ee.ID, "copy"))
	setURL(related, "organization", "organizations", ee.OrganizationID)
	setURL(related, "credential", "credentials", ee.CredentialID)
	summary := NewOMap()
	c.putSummary(summary, "organization", c.OrgSummary, ee.OrganizationID)
	c.putSummary(summary, "credential", c.CredentialSummary, ee.CredentialID)
	c.putSummary(summary, "created_by", c.UserSummary, ee.CreatedByID)
	c.putSummary(summary, "modified_by", c.UserSummary, ee.ModifiedByID)
	if c.WantSummary("user_capabilities") {
		edit := c.User != nil && c.User.CanWrite() && c.User.IsSuperuser
		if !edit && c.User != nil && c.User.CanWrite() && ee.OrganizationID != nil {
			edit = c.HasRoleOn("main.organization", *ee.OrganizationID, "execution_environment_admin_role")
		}
		summary.Set("user_capabilities", Caps("edit", edit, "delete", edit && !ee.Managed, "copy", edit))
	}
	o := Base(NewOMap(), ee.ID, "execution_environment", URLFor("execution_environments", ee.ID), related, summary, ee.Created, ee.Modified, ee.Name, ee.Description)
	o.Set("organization", models.NullableID(ee.OrganizationID)).Set("image", ee.Image).Set("managed", ee.Managed).Set("credential", models.NullableID(ee.CredentialID)).Set("pull", ee.Pull)
	return o
}

// eeAdmin reports execution_environment_admin_role on an organization.
func (s *Server) eeAdmin(ctx context.Context, u *auth.User, orgID *int64) bool {
	return orgID != nil && s.userHasRoleOn(ctx, u.ID, "main.organization", *orgID, "execution_environment_admin_role")
}

// eeCanAdd is ExecutionEnvironmentAccess.can_add: an execution
// environment administrator of the (mandatory) organization.
func (s *Server) eeCanAdd(ctx context.Context, u *auth.User, orgID *int64) bool {
	return u.IsSuperuser || s.eeAdmin(ctx, u, orgID)
}

// eeCanChange is can_change without data: global environments are the
// superuser's, the others their organization's environment admins'.
func (s *Server) eeCanChange(ctx context.Context, u *auth.User, ee *models.ExecutionEnvironment) bool {
	return u.IsSuperuser || s.eeAdmin(ctx, u, ee.OrganizationID)
}

func (s *Server) eeOptionsAllow(r *http.Request, u *auth.User, method string) bool {
	if !u.CanWrite() {
		return false
	}
	ctx := r.Context()
	if method == "POST" {
		if u.IsSuperuser {
			return true
		}
		q := NewQuery()
		var ok bool
		_ = db.Tolerant(s.Q()).QueryRow(ctx, "SELECT EXISTS ("+accessibleSQL(q, u.ID, s.CT.ID("main.organization"), "execution_environment_admin_role")+")", q.Args...).Scan(&ok)
		return ok
	}
	_, ee, err := eeObj.fromPath(s, r, false)
	return err == nil && s.eeCanChange(ctx, u, ee)
}

// eeObj is an execution environment: a global one, or one of an
// organization the user reads.
var eeObj = &pathObject[*models.ExecutionEnvironment]{
	model: "ExecutionEnvironment",
	get:   models.GetExecutionEnvironment,
	readable: func(c *SerCtx, ee *models.ExecutionEnvironment) bool {
		return ee.OrganizationID == nil || c.S.userHasRoleOn(c.Ctx(), c.User.ID, "main.organization", *ee.OrganizationID, "read_role")
	},
}

var eePullChoices = [][2]string{{"", "---------"}, {"always", "Always pull container before running."}, {"missing", "Only pull the image if not present before running."}, {"never", "Never pull container before running."}}

// containerImageRe is validate_container_image_name's reference grammar.
var containerImageRe = regexp.MustCompile(`^((?:(?:[a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9])(?:(?:\.(?:[a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]))+)?(?::[0-9]+)?/)?[a-z0-9]+(?:(?:(?:[_.]|__|[-]*)[a-z0-9]+)+)?(?:(?:/[a-z0-9]+(?:(?:(?:[_.]|__|[-]*)[a-z0-9]+)+)?)+)?)(?::([\w][\w.-]{0,127}))?(?:@([A-Za-z][A-Za-z0-9]*(?:[-_+.][A-Za-z][A-Za-z0-9]*)*[:][0-9a-fA-F]{32,}))?$`)

// eeFromForm validates ExecutionEnvironmentSerializer's fields onto ee.
func (s *Server) eeFromForm(r *http.Request, f *Form, ee *models.ExecutionEnvironment, existing bool) {
	ctx := r.Context()
	ee.Name = f.String("name", true, 512, ee.Name)
	ee.Description = f.String("description", false, 0, ee.Description)
	if id, set := f.ID("organization", ee.OrganizationID, false, s.existsIn(r.Context(), "main_organization")); set {
		if existing && id != nil && (ee.OrganizationID == nil || *id != *ee.OrganizationID) {
			f.Errs.Add("organization", "Cannot change the organization of an execution environment")
		} else {
			ee.OrganizationID = id
		}
	}
	image := f.String("image", true, 1024, ee.Image)
	if f.Has("image") && !f.Errs.Has("image") && !containerImageRe.MatchString(image) {
		f.Errs.Add("image", fmt.Sprintf("The container image name %s is not valid", image))
	} else {
		ee.Image = image
	}
	// The registry login is sent to whatever registry the image names.
	if id, set := f.ID("credential", ee.CredentialID, false, s.credentialChoiceOK(ctx, ee.CredentialID)); set {
		if id != nil {
			var kind *string
			_ = db.Tolerant(s.Q()).QueryRow(ctx, `SELECT ct.namespace FROM main_credential c JOIN main_credentialtype ct ON ct.id = c.credential_type_id WHERE c.id = $1`, *id).Scan(&kind)
			if kind == nil || *kind != "registry" {
				f.Errs.Add("credential", "Only Container Registry credentials can be associated with an Execution Environment")
			}
		}
		ee.CredentialID = id
	}
	ee.Pull = f.Choice("pull", ee.Pull, eePullChoices, false)
}

func (s *Server) eeNameTaken(ctx context.Context, name string, exclude int64) (bool, error) {
	var taken bool
	if err := s.Q().QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM main_executionenvironment WHERE name = $1 AND id <> $2)`, name, exclude).Scan(&taken); err != nil {
		return false, err
	}
	return taken, nil
}

// eeChanges is model_to_dict with the serializer's writable fields.
// q is the writer's transaction when there is one.
func (s *Server) eeChanges(ctx context.Context, q db.Querier, ee *models.ExecutionEnvironment) map[string]any {
	ref := func(table string, id *int64) any {
		return s.nameRefCtx(ctx, q, `SELECT name FROM `+table+` WHERE id = $1`, id)
	}
	return map[string]any{"name": ee.Name, "description": ee.Description, "organization": ref("main_organization", ee.OrganizationID), "image": ee.Image,
		"credential": ref("main_credential", ee.CredentialID), "pull": ee.Pull, "id": ee.ID}
}

func (s *Server) executionEnvironmentCreate(w http.ResponseWriter, r *http.Request) error {
	u, err := RequireWrite(r)
	if err != nil {
		return err
	}
	ctx := r.Context()
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	// can_add on the raw data, before validation.
	if !u.IsSuperuser {
		if body.Len() == 0 {
			if !s.eeOptionsAllow(r, u, "POST") {
				return ErrForbidden
			}
		} else {
			org, err := s.relatedFromData(ctx, body, "organization", "main_organization", "Organization")
			if err != nil {
				return err
			}
			if org == nil || !s.eeAdmin(ctx, u, org) {
				return ErrForbidden
			}
		}
	}
	ee := &models.ExecutionEnvironment{CreatedByID: &u.ID, ModifiedByID: &u.ID}
	f := NewForm(body, false)
	s.eeFromForm(r, f, ee, false)
	if err := f.Err(); err != nil {
		return err
	}
	if v, err := s.eeNameTaken(ctx, ee.Name, 0); err != nil {
		return err
	} else if v {
		return FieldErrors{"name": {"Execution environment with this Name already exists."}}.Err()
	}
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if err := models.InsertExecutionEnvironment(ctx, tx, ee); err != nil {
			return err
		}
		return s.Activity.Record(ctx, tx, activity.Entry{Operation: "create", Object1: "execution_environment", Changes: s.eeChanges(ctx, tx, ee), ActorID: &u.ID, Links: map[string]int64{"execution_environment": ee.ID}})
	})
	if err != nil {
		return err
	}
	w.Header().Set("Location", URLFor("execution_environments", ee.ID))
	WriteJSON(w, http.StatusCreated, s.serializeExecutionEnvironment(s.NewSerCtx(r, true), ee))
	return nil
}

func (s *Server) executionEnvironmentUpdate(w http.ResponseWriter, r *http.Request) error {
	u, ee, err := eeObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	ctx := r.Context()
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	partial := r.Method == http.MethodPatch
	if !u.IsSuperuser {
		// can_change raised PermissionDenied for a global environment and
		// for one whose organization the user does not administer, and
		// refused a move to an organization they do not administer.
		if !s.eeAdmin(ctx, u, ee.OrganizationID) {
			return ErrForbidden
		}
		if body.Len() > 0 && body.Has("organization") {
			org, err := s.relatedFromData(ctx, body, "organization", "main_organization", "Organization")
			if err != nil {
				return err
			}
			if org == nil || !s.eeAdmin(ctx, u, org) {
				return ErrForbidden
			}
		}
	}
	if ee.Managed {
		// ExecutionEnvironmentDetail.update: only pull may change.
		current := map[string]any{"name": ee.Name, "description": ee.Description, "organization": ee.OrganizationID, "image": ee.Image, "credential": ee.CredentialID}
		for _, field := range []string{"name", "description", "organization", "image", "credential"} {
			raw, ok := body.Get(field)
			if partial && !ok {
				continue
			}
			if !sameRequestValue(current[field], raw) {
				return Detail(http.StatusForbidden, "Only the 'pull' field can be edited for managed execution environments.")
			}
		}
	}
	before := s.eeChanges(ctx, s.Q(), ee)
	priorImage := ee.Image
	ee.ModifiedByID = &u.ID
	f := NewForm(body, partial)
	s.eeFromForm(r, f, ee, true)
	if err := f.Err(); err != nil {
		return err
	}
	if v, err := s.eeNameTaken(ctx, ee.Name, ee.ID); err != nil {
		return err
	} else if v {
		return FieldErrors{"name": {"Execution environment with this Name already exists."}}.Err()
	}
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if err := models.UpdateExecutionEnvironment(ctx, tx, ee); err != nil {
			return err
		}
		changes := diffChanges(before, s.eeChanges(ctx, tx, ee))
		if len(changes) == 0 {
			return nil
		}
		return s.Activity.Record(ctx, tx, activity.Entry{Operation: "update", Object1: "execution_environment", Changes: changes, ActorID: &u.ID, Links: map[string]int64{"execution_environment": ee.ID}})
	})
	if err != nil {
		return err
	}
	if priorImage != ee.Image {
		s.AnnounceRemovedImages(ctx, []string{priorImage})
	}
	WriteJSON(w, 200, s.serializeExecutionEnvironment(s.NewSerCtx(r, true), ee))
	return nil
}

// sameRequestValue compares a stored value with what a request sent, as
// the view's "left != right" did on the raw data.
func sameRequestValue(stored any, sent any) bool {
	switch v := stored.(type) {
	case *int64:
		if v == nil {
			return sent == nil
		}
		n, ok := integerOf(sent)
		return ok && n == *v
	case string:
		sv, ok := sent.(string)
		return ok && sv == v
	}
	return false
}

func (s *Server) executionEnvironmentDelete(w http.ResponseWriter, r *http.Request) error {
	u, ee, err := eeObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	ctx := r.Context()
	if ee.Managed || !s.eeCanChange(ctx, u, ee) {
		return ErrForbidden
	}
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if err := s.Activity.Record(ctx, tx, activity.Entry{Operation: "delete", Object1: "execution_environment", Changes: s.eeChanges(ctx, tx, ee), ActorID: &u.ID}); err != nil {
			return err
		}
		return s.Cascade.Delete(ctx, tx, "main_executionenvironment", "id", []int64{ee.ID})
	})
	if err != nil {
		return err
	}
	s.AnnounceRemovedImages(ctx, []string{ee.Image})
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// AnnounceRemovedImages is _handle_image_cleanup, once the deletion or the
// change of image is committed: each of these images that no execution
// environment names any more goes to every task process in a
// remove_images notice (handle_removed_image's broadcast), which untags it
// on that node and on the execution nodes. One notice per image keeps each
// under pg_notify's payload limit.
func (s *Server) AnnounceRemovedImages(ctx context.Context, images []string) {
	seen := map[string]bool{}
	for _, image := range images {
		if image == "" || seen[image] {
			continue
		}
		seen[image] = true
		// quay.io/x/ee and quay.io/x/ee:latest are one image to the runtime.
		ref := imageWithTag(image)
		// The prefix finds both spellings; the comparison below decides.
		rows, err := s.Q().Query(ctx, `SELECT image FROM main_executionenvironment WHERE image LIKE $1`, strings.TrimSuffix(ref, ":latest")+"%")
		if err != nil {
			s.Log.WarnContext(ctx, "checking a removed image", "image", image, "err", err)
			continue
		}
		names, err := pgx.CollectRows(rows, pgx.RowTo[string])
		if err != nil {
			s.Log.WarnContext(ctx, "checking a removed image", "image", image, "err", err)
			continue
		}
		if slices.ContainsFunc(names, func(n string) bool { return imageWithTag(n) == ref }) {
			continue
		}
		payload, _ := json.Marshal(map[string]any{"type": "remove_images", "images": []string{image}})
		s.Notify(ctx, string(payload))
	}
}

// imageWithTag is an image reference with the tag a runtime assumes when
// none is given: latest, unless it names a digest.
func imageWithTag(image string) string {
	if strings.Contains(image, "@") {
		return image
	}
	if strings.Contains(image[strings.LastIndex(image, "/")+1:], ":") {
		return image
	}
	return image + ":latest"
}

func (s *Server) executionEnvironmentCanCopy(w http.ResponseWriter, r *http.Request) error {
	u, ee, err := eeObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	WriteJSON(w, 200, NewOMap().Set("can_copy", u.CanWrite() && s.eeCanAdd(r.Context(), u, ee.OrganizationID)))
	return nil
}

func (s *Server) executionEnvironmentCopy(w http.ResponseWriter, r *http.Request) error {
	u, ee, err := eeObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	ctx := r.Context()
	if !s.eeCanAdd(ctx, u, ee.OrganizationID) {
		return ErrForbidden
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	name, err := copyName(body, ee.Name)
	if err != nil {
		return err
	}
	if v, err := s.eeNameTaken(ctx, name, 0); err != nil {
		return err
	} else if v {
		// The old copy hit the unique constraint and failed with a 500;
		// the field error says why.
		return FieldErrors{"name": {"Execution environment with this Name already exists."}}.Err()
	}
	cp := &models.ExecutionEnvironment{Name: name, Description: ee.Description, OrganizationID: ee.OrganizationID, Image: ee.Image, CredentialID: ee.CredentialID, Pull: ee.Pull, CreatedByID: &u.ID, ModifiedByID: &u.ID}
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if err := models.InsertExecutionEnvironment(ctx, tx, cp); err != nil {
			return err
		}
		return s.Activity.Record(ctx, tx, activity.Entry{Operation: "create", Object1: "execution_environment", Changes: s.eeChanges(ctx, tx, cp), ActorID: &u.ID, Links: map[string]int64{"execution_environment": cp.ID}})
	})
	if err != nil {
		return err
	}
	w.Header().Set("Location", URLFor("execution_environments", cp.ID))
	WriteJSON(w, http.StatusCreated, s.serializeExecutionEnvironment(s.NewSerCtx(r, true), cp))
	return nil
}

func (s *Server) executionEnvironmentTemplates(w http.ResponseWriter, r *http.Request) error {
	_, ee, err := eeObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	return s.unifiedJobTemplateListWith(w, r, func(q *Query) { q.And("ujt.execution_environment_id = " + q.Arg(ee.ID)) })
}
