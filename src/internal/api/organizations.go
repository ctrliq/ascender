package api

import (
	"net/http"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/activity"
	"github.com/ctrliq/ascender/internal/auth"
	"github.com/ctrliq/ascender/internal/models"
)

var organizationFields *FieldSet

func init() {
	organizationFields = &FieldSet{
		Model: "Organization",
		Fields: map[string]Field{
			"id": {SQL: "o.id", Kind: KindInt}, "name": {SQL: "o.name"}, "description": {SQL: "o.description"},
			"created": {SQL: "o.created", Kind: KindDateTime}, "modified": {SQL: "o.modified", Kind: KindDateTime},
			"max_hosts":           {SQL: "o.max_hosts", Kind: KindInt},
			"default_environment": {SQL: "o.default_environment_id", Kind: KindFK, Rel: &Relation{Alias: "ee", Join: "LEFT JOIN main_executionenvironment ee ON ee.id = o.default_environment_id", Target: func() *FieldSet { return executionEnvironmentFields }}},
			"created_by":          {SQL: "o.created_by_id", Kind: KindFK, Rel: &Relation{Alias: "cb", Join: "LEFT JOIN auth_user cb ON cb.id = o.created_by_id", Target: func() *FieldSet { return userFieldsAlias("cb") }}},
			"modified_by":         {SQL: "o.modified_by_id", Kind: KindFK, Rel: &Relation{Alias: "mb", Join: "LEFT JOIN auth_user mb ON mb.id = o.modified_by_id", Target: func() *FieldSet { return userFieldsAlias("mb") }}},
			"projects":            {SQL: "op.unifiedjobtemplate_ptr_id", Kind: KindFK, Rel: &Relation{Alias: "op", Join: "LEFT JOIN main_unifiedjobtemplate oujt ON oujt.organization_id = o.id LEFT JOIN main_project op ON op.unifiedjobtemplate_ptr_id = oujt.id", Many: true, Target: func() *FieldSet { return projectFieldsAlias("oujt", "op") }}},
			"inventories":         {SQL: "oi.id", Kind: KindFK, Rel: &Relation{Alias: "oi", Join: "LEFT JOIN main_inventory oi ON oi.organization_id = o.id", Many: true, Target: func() *FieldSet { return inventoryFieldsAlias("oi") }}},
			"teams":               {SQL: "ot.id", Kind: KindFK, Rel: &Relation{Alias: "ot", Join: "LEFT JOIN main_team ot ON ot.organization_id = o.id", Many: true, Target: func() *FieldSet { return teamFieldsAlias("ot") }}},
			"member_role":         {SQL: "o.member_role_id", Kind: KindFK, Rel: &Relation{Alias: "omr", Join: "LEFT JOIN main_rbac_roles omr ON omr.id = o.member_role_id", Target: func() *FieldSet { return roleFieldsAlias("omr") }}},
			"admin_role":          {SQL: "o.admin_role_id", Kind: KindFK, Rel: &Relation{Alias: "oar", Join: "LEFT JOIN main_rbac_roles oar ON oar.id = o.admin_role_id", Target: func() *FieldSet { return roleFieldsAlias("oar") }}},
		},
		SearchFields: []string{"name", "description"},
	}
}

func userFieldsAlias(a string) *FieldSet {
	return &FieldSet{Model: "User", Fields: map[string]Field{
		"id": {SQL: a + ".id", Kind: KindInt}, "username": {SQL: a + ".username"}, "first_name": {SQL: a + ".first_name"},
		"last_name": {SQL: a + ".last_name"}, "email": {SQL: a + ".email"}, "is_superuser": {SQL: a + ".is_superuser", Kind: KindBool},
		"is_active": {SQL: a + ".is_active", Kind: KindBool}, "last_login": {SQL: a + ".last_login", Kind: KindDateTime},
		"date_joined": {SQL: a + ".date_joined", Kind: KindDateTime}, "created": {SQL: a + ".date_joined", Kind: KindDateTime},
		"password": {SQL: a + ".password", NoFilter: true},
		// roles is User.roles, the reverse of Role.members.
		"roles": {SQL: a + "rm.role_id", Kind: KindFK, Rel: &Relation{Alias: a + "rm", Join: "LEFT JOIN main_rbac_roles_members " + a + "rm ON " + a + "rm.user_id = " + a + ".id", Many: true, Target: func() *FieldSet { return roleFieldSet(a + "rr") }}},
	}, SearchFields: []string{"username", "first_name", "last_name", "email"}}
}

func roleFieldsAlias(a string) *FieldSet {
	return &FieldSet{Model: "Role", Fields: map[string]Field{
		"id": {SQL: a + ".id", Kind: KindInt}, "role_field": {SQL: a + ".role_field"}, "singleton_name": {SQL: a + ".singleton_name"},
		"members": {SQL: a + "m.user_id", Kind: KindFK, Rel: &Relation{Alias: a + "m", Join: "LEFT JOIN main_rbac_roles_members " + a + "m ON " + a + "m.role_id = " + a + ".id", Many: true, Target: func() *FieldSet { return userFieldsAlias(a + "mu") }}},
	}}
}

func teamFieldsAlias(a string) *FieldSet {
	return &FieldSet{Model: "Team", Fields: map[string]Field{
		"id": {SQL: a + ".id", Kind: KindInt}, "name": {SQL: a + ".name"}, "description": {SQL: a + ".description"},
		"created": {SQL: a + ".created", Kind: KindDateTime}, "modified": {SQL: a + ".modified", Kind: KindDateTime},
		"organization": {SQL: a + ".organization_id", Kind: KindFK},
	}, SearchFields: []string{"name", "description"}}
}

func organizationSpec() ListSpec {
	return ListSpec{
		Model: "Organization", From: "main_organization o", Columns: models.OrganizationColumns, PK: "o.id",
		Fields: organizationFields, DefaultOrder: []string{"name"},
	}
}

func (s *Server) registerOrganizations(mux *http.ServeMux) {
	s.route(mux, "/api/v2/organizations/{$}", methodMap{"GET": s.organizationList, "POST": s.organizationCreate}, s.optionsFor("organizations"))
	s.route(mux, "/api/v2/organizations/{id}/{$}", methodMap{"GET": s.organizationDetail, "PUT": s.organizationUpdate, "PATCH": s.organizationUpdate, "DELETE": s.organizationDelete}, s.optionsFor("organizations"))
}

func (s *Server) organizationAccess(q *Query, u *auth.User) {
	s.AccessibleFilter(q, u, "o.id", "main.organization", "read_role")
}

func (s *Server) organizationList(w http.ResponseWriter, r *http.Request) error {
	return s.organizationListWith(w, r, nil)
}

// organizationListWith lists the organizations the user can read, with
// extra restrictions for sub-lists.
func (s *Server) organizationListWith(w http.ResponseWriter, r *http.Request, extra func(q *Query)) error {
	spec := organizationSpec()
	spec.Access = s.organizationAccess
	orgs, count, page, err := runListOf(s, r, spec, extra, models.ScanOrganization)
	if err != nil {
		return err
	}
	results, err := s.serializeOrganizations(s.NewSerCtx(r, false), orgs)
	if err != nil {
		return err
	}
	WriteJSON(w, 200, Paginate(r, page, count, results))
	return nil
}

func (s *Server) serializeOrganizations(c *SerCtx, orgs []*models.Organization) ([]any, error) {
	var userIDs, eeIDs []int64
	for _, o := range orgs {
		userIDs = append(userIDs, uniqueIDs(o.CreatedByID, o.ModifiedByID)...)
		eeIDs = append(eeIDs, uniqueIDs(o.DefaultEnvironmentID)...)
	}
	if err := c.PreloadUsers(userIDs); err != nil {
		return nil, err
	}
	if err := c.PreloadEEs(eeIDs); err != nil {
		return nil, err
	}
	var scope *models.CountScope
	if c.User != nil && !c.User.IsSuperuser && !c.User.IsSystemAuditor {
		scope = &models.CountScope{UserID: c.User.ID, CT: c.S.CT}
	}
	counts, err := models.LoadOrganizationCounts(c.Ctx(), c.S.Q(), orgs, scope, c.Detail)
	if err != nil {
		return nil, err
	}
	out := make([]any, 0, len(orgs))
	for _, o := range orgs {
		out = append(out, s.serializeOrganization(c, o, counts[o.ID]))
	}
	return out, nil
}

func (s *Server) serializeOrganization(c *SerCtx, o *models.Organization, counts models.OrganizationCounts) *OMap {
	related := NewOMap()
	if c.Detail {
		related.Set("named_url", "/api/v2/organizations/"+namedURLEscape(o.Name)+"/")
	}
	setURL(related, "created_by", "users", o.CreatedByID)
	setURL(related, "modified_by", "users", o.ModifiedByID)
	for _, sub := range []string{"execution_environments", "projects", "inventories", "job_templates", "workflow_job_templates", "users", "admins", "teams", "credentials", "applications", "activity_stream", "notification_templates", "notification_templates_started", "notification_templates_success", "notification_templates_error", "notification_templates_approvals", "notification_templates_changed", "object_roles", "access_list", "instance_groups", "galaxy_credentials"} {
		related.Set(sub, SubURL("organizations", o.ID, sub))
	}
	setURL(related, "default_environment", "execution_environments", o.DefaultEnvironmentID)
	summary := NewOMap()
	c.putSummary(summary, "default_environment", c.EESummary, o.DefaultEnvironmentID)
	c.putSummary(summary, "created_by", c.UserSummary, o.CreatedByID)
	c.putSummary(summary, "modified_by", c.UserSummary, o.ModifiedByID)
	if c.WantSummary("object_roles") {
		roles := c.RolesSummary("organization", models.OrganizationRoleFields, o.RoleID)
		for _, key := range []string{"admin_role", "member_role"} {
			if v, ok := roles.Get(key); ok {
				v.(*OMap).Set("user_only", true)
			}
		}
		summary.Set("object_roles", roles)
	}
	if c.WantSummary("user_capabilities") {
		edit := c.HasRole(o.AdminRoleID)
		summary.Set("user_capabilities", Caps("edit", edit, "delete", edit))
	}
	if c.WantSummary("related_field_counts") {
		if c.Detail {
			summary.Set("related_field_counts", NewOMap().Set("users", counts.Users).Set("admins", counts.Admins).Set("inventories", counts.Inventories).Set("teams", counts.Teams).Set("projects", counts.Projects).Set("job_templates", counts.JobTemplates).Set("hosts", counts.Hosts))
		} else {
			summary.Set("related_field_counts", NewOMap().Set("inventories", counts.Inventories).Set("teams", counts.Teams).Set("users", counts.Users).Set("job_templates", counts.JobTemplates).Set("admins", counts.Admins).Set("projects", counts.Projects))
		}
	}
	obj := Base(NewOMap(), o.ID, "organization", URLFor("organizations", o.ID), related, summary, o.Created, o.Modified, o.Name, o.Description)
	obj.Set("max_hosts", o.MaxHosts)
	obj.Set("default_environment", models.NullableID(o.DefaultEnvironmentID))
	return obj
}

// organizationObj is an organization.
var organizationObj = &pathObject[*models.Organization]{
	model:    "Organization",
	get:      models.GetOrganization,
	readable: func(c *SerCtx, v *models.Organization) bool { return c.HasRole(v.ReadRoleID) },
}

func (s *Server) organizationDetail(w http.ResponseWriter, r *http.Request) error {
	_, o, err := organizationObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	results, err := s.serializeOrganizations(c, []*models.Organization{o})
	if err != nil {
		return err
	}
	WriteJSON(w, 200, results[0])
	return nil
}

func (s *Server) organizationFromForm(r *http.Request, f *Form, o *models.Organization) {
	o.Name = f.String("name", true, 512, o.Name)
	o.Description = f.String("description", false, 0, o.Description)
	zero := int64(0)
	o.MaxHosts = f.Int("max_hosts", o.MaxHosts, &zero, nil)
	if id, set := f.ID("default_environment", o.DefaultEnvironmentID, false, s.eeChoiceOK(r.Context(), o.DefaultEnvironmentID)); set {
		o.DefaultEnvironmentID = id
	}
}

func (s *Server) organizationNameTaken(r *http.Request, name string, excludeID int64) (bool, error) {
	var ok bool
	if err := s.Q().QueryRow(r.Context(), `SELECT EXISTS (SELECT 1 FROM main_organization WHERE name = $1 AND id <> $2)`, name, excludeID).Scan(&ok); err != nil {
		return false, err
	}
	return ok, nil
}

func (s *Server) organizationChanges(o *models.Organization) map[string]any {
	var de any
	if o.DefaultEnvironmentID != nil {
		de = *o.DefaultEnvironmentID
	}
	return map[string]any{"name": o.Name, "description": o.Description, "max_hosts": o.MaxHosts, "default_environment": de, "id": o.ID}
}

func (s *Server) organizationCreate(w http.ResponseWriter, r *http.Request) error {
	u, err := RequireWrite(r)
	if err != nil {
		return err
	}
	if !u.IsSuperuser {
		return ErrForbidden
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	f := NewForm(body, false)
	o := &models.Organization{CreatedByID: &u.ID, ModifiedByID: &u.ID}
	s.organizationFromForm(r, f, o)
	if err := f.Err(); err != nil {
		return err
	}
	if v, err := s.organizationNameTaken(r, o.Name, 0); err != nil {
		return err
	} else if v {
		return FieldErrors{"name": {"Organization with this Name already exists."}}.Err()
	}
	ctx := r.Context()
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if err := models.InsertOrganization(ctx, tx, o, s.CT.ID("main.organization"), s.Roles); err != nil {
			return err
		}
		return s.Activity.Record(ctx, tx, activity.Entry{Operation: "create", Object1: "organization", Changes: s.organizationChanges(o), ActorID: &u.ID, Links: map[string]int64{"organization": o.ID}})
	})
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	results, err := s.serializeOrganizations(c, []*models.Organization{o})
	if err != nil {
		return err
	}
	w.Header().Set("Location", URLFor("organizations", o.ID))
	WriteJSON(w, http.StatusCreated, results[0])
	return nil
}

func (s *Server) organizationUpdate(w http.ResponseWriter, r *http.Request) error {
	u, o, err := organizationObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	if !c.HasRole(o.AdminRoleID) {
		return ErrForbidden
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	before := s.organizationChanges(o)
	prevMaxHosts := o.MaxHosts
	f := NewForm(body, r.Method == http.MethodPatch)
	s.organizationFromForm(r, f, o)
	if err := f.Err(); err != nil {
		return err
	}
	// OrganizationSerializer.validate: the host limit is the superuser's
	// to set, not the organization admin's it limits.
	if !u.IsSuperuser && f.Has("max_hosts") && o.MaxHosts != prevMaxHosts {
		return FieldErrors{"__all__": {"Cannot change max_hosts."}}.Err()
	}
	if v, err := s.organizationNameTaken(r, o.Name, o.ID); err != nil {
		return err
	} else if v {
		return FieldErrors{"name": {"Organization with this Name already exists."}}.Err()
	}
	o.ModifiedByID = &u.ID
	ctx := r.Context()
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if err := models.UpdateOrganization(ctx, tx, o); err != nil {
			return err
		}
		after := s.organizationChanges(o)
		changes := diffChanges(before, after)
		if len(changes) == 0 {
			return nil
		}
		return s.Activity.Record(ctx, tx, activity.Entry{Operation: "update", Object1: "organization", Changes: changes, ActorID: &u.ID, Links: map[string]int64{"organization": o.ID}})
	})
	if err != nil {
		return err
	}
	results, err := s.serializeOrganizations(c, []*models.Organization{o})
	if err != nil {
		return err
	}
	WriteJSON(w, 200, results[0])
	return nil
}

func (s *Server) organizationDelete(w http.ResponseWriter, r *http.Request) error {
	u, o, err := organizationObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	if !c.HasRole(o.AdminRoleID) {
		return ErrForbidden
	}
	ctx := r.Context()
	// RelatedJobsPreventDeleteMixin
	if err := s.checkRelatedActiveJobs(ctx, organizationJobsCond, o.ID); err != nil {
		return err
	}
	// The organization's execution environments go with it.
	var eeImages []string
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if err := s.Activity.Record(ctx, tx, activity.Entry{Operation: "delete", Object1: "organization", Changes: s.organizationChanges(o), ActorID: &u.ID}); err != nil {
			return err
		}
		rows, err := tx.Query(ctx, `SELECT image FROM main_executionenvironment WHERE organization_id = $1`, o.ID)
		if err != nil {
			return err
		}
		if eeImages, err = pgx.CollectRows(rows, pgx.RowTo[string]); err != nil {
			return err
		}
		return models.DeleteOrganization(ctx, tx, o.ID, s.CT, s.Cascade)
	})
	if err != nil {
		return err
	}
	s.AnnounceRemovedImages(ctx, eeImages)
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// diffChanges renders {field: [old, new]} for changed keys.
func diffChanges(before, after map[string]any) map[string]any {
	out := map[string]any{}
	for k, nv := range after {
		if k == "id" {
			continue
		}
		ov := before[k]
		if !equalJSON(ov, nv) {
			out[k] = []any{ov, nv}
		}
	}
	return out
}

func equalJSON(a, b any) bool {
	switch x := a.(type) {
	case nil:
		return b == nil
	case string:
		y, ok := b.(string)
		return ok && x == y
	case bool:
		y, ok := b.(bool)
		return ok && x == y
	case int64:
		switch y := b.(type) {
		case int64:
			return x == y
		case int:
			return x == int64(y)
		case float64:
			return float64(x) == y
		}
		return false
	case float64:
		y, ok := b.(float64)
		return ok && x == y
	}
	return false
}
