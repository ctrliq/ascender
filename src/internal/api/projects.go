package api

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/activity"
	"github.com/ctrliq/ascender/internal/auth"
	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/models"
)

// projectFieldsAlias builds the filterable surface for a project reached
// through aliases ujt (main_unifiedjobtemplate) and p (main_project).
func projectFieldsAlias(ujt, p string) *FieldSet {
	return &FieldSet{
		Model: "Project",
		Fields: map[string]Field{
			"id": {SQL: ujt + ".id", Kind: KindInt}, "name": {SQL: ujt + ".name"}, "description": {SQL: ujt + ".description"},
			"created": {SQL: ujt + ".created", Kind: KindDateTime}, "modified": {SQL: ujt + ".modified", Kind: KindDateTime},
			"last_job_failed": {SQL: ujt + ".last_job_failed", Kind: KindBool}, "last_job_run": {SQL: ujt + ".last_job_run", Kind: KindDateTime},
			"next_job_run": {SQL: ujt + ".next_job_run", Kind: KindDateTime}, "status": {SQL: ujt + ".status"},
			"local_path": {SQL: p + ".local_path"}, "scm_type": {SQL: p + ".scm_type"}, "scm_url": {SQL: p + ".scm_url"},
			"scm_branch": {SQL: p + ".scm_branch"}, "scm_refspec": {SQL: p + ".scm_refspec"}, "scm_clean": {SQL: p + ".scm_clean", Kind: KindBool},
			"scm_track_submodules": {SQL: p + ".scm_track_submodules", Kind: KindBool}, "scm_delete_on_update": {SQL: p + ".scm_delete_on_update", Kind: KindBool},
			"scm_update_on_launch": {SQL: p + ".scm_update_on_launch", Kind: KindBool}, "scm_update_cache_timeout": {SQL: p + ".scm_update_cache_timeout", Kind: KindInt},
			"timeout": {SQL: p + ".timeout", Kind: KindInt}, "scm_revision": {SQL: p + ".scm_revision"}, "allow_override": {SQL: p + ".allow_override", Kind: KindBool},
			"reuse_requirements": {SQL: p + ".reuse_requirements", Kind: KindBool}, "webhook_service": {SQL: p + ".webhook_service"}, "webhook_ref_filter": {SQL: p + ".webhook_ref_filter"},
			"webhook_key":                     {SQL: p + ".webhook_key", NoFilter: true},
			"organization":                    {SQL: ujt + ".organization_id", Kind: KindFK, Rel: &Relation{Alias: "o", Join: "LEFT JOIN main_organization o ON o.id = " + ujt + ".organization_id", Target: func() *FieldSet { return organizationFields }}},
			"credential":                      {SQL: p + ".credential_id", Kind: KindFK, Rel: &Relation{Alias: "pc", Join: "LEFT JOIN main_credential pc ON pc.id = " + p + ".credential_id", Target: func() *FieldSet { return credentialFieldsAlias("pc") }}},
			"credentials":                     {SQL: "pjc.credential_id", Kind: KindFK, Rel: &Relation{Alias: "pjc", Join: "LEFT JOIN main_unifiedjobtemplate_credentials pjc ON pjc.unifiedjobtemplate_id = " + ujt + ".id LEFT JOIN main_credential pjcred ON pjcred.id = pjc.credential_id", Target: func() *FieldSet { return credentialFieldsAlias("pjcred") }, Many: true}},
			"default_environment":             {SQL: p + ".default_environment_id", Kind: KindFK, Rel: &Relation{Alias: "ee", Join: "LEFT JOIN main_executionenvironment ee ON ee.id = " + p + ".default_environment_id", Target: func() *FieldSet { return executionEnvironmentFields }}},
			"signature_validation_credential": {SQL: p + ".signature_validation_credential_id", Kind: KindFK},
			"created_by":                      {SQL: ujt + ".created_by_id", Kind: KindFK, Rel: &Relation{Alias: "cb", Join: "LEFT JOIN auth_user cb ON cb.id = " + ujt + ".created_by_id", Target: func() *FieldSet { return userFieldsAlias("cb") }}},
			"modified_by":                     {SQL: ujt + ".modified_by_id", Kind: KindFK, Rel: &Relation{Alias: "mb", Join: "LEFT JOIN auth_user mb ON mb.id = " + ujt + ".modified_by_id", Target: func() *FieldSet { return userFieldsAlias("mb") }}},
			"last_job":                        {SQL: ujt + ".last_job_id", Kind: KindFK, Rel: &Relation{Alias: "lj", Join: "LEFT JOIN main_unifiedjob lj ON lj.id = " + ujt + ".last_job_id", Target: func() *FieldSet { return unifiedJobFieldsAlias("lj") }}},
			"current_job":                     {SQL: ujt + ".current_job_id", Kind: KindFK, Rel: &Relation{Alias: "cj", Join: "LEFT JOIN main_unifiedjob cj ON cj.id = " + ujt + ".current_job_id", Target: func() *FieldSet { return unifiedJobFieldsAlias("cj") }}},
			"polymorphic_ctype":               {SQL: ujt + ".polymorphic_ctype_id", Kind: KindFK},
		},
		SearchFields: []string{"name", "description"},
	}
}

func unifiedJobFieldsAlias(a string) *FieldSet {
	return &FieldSet{Model: "UnifiedJob", Fields: map[string]Field{
		"id": {SQL: a + ".id", Kind: KindInt}, "name": {SQL: a + ".name"}, "description": {SQL: a + ".description"},
		"status": {SQL: a + ".status"}, "failed": {SQL: a + ".failed", Kind: KindBool}, "started": {SQL: a + ".started", Kind: KindDateTime},
		"finished": {SQL: a + ".finished", Kind: KindDateTime}, "created": {SQL: a + ".created", Kind: KindDateTime},
		"modified": {SQL: a + ".modified", Kind: KindDateTime}, "elapsed": {SQL: a + ".elapsed", Kind: KindInt}, "launch_type": {SQL: a + ".launch_type"},
	}, SearchFields: []string{"name", "description"}}
}

func credentialFieldsAlias(a string) *FieldSet {
	return &FieldSet{Model: "Credential", Fields: map[string]Field{
		"id": {SQL: a + ".id", Kind: KindInt}, "name": {SQL: a + ".name"}, "description": {SQL: a + ".description"},
		"created": {SQL: a + ".created", Kind: KindDateTime}, "modified": {SQL: a + ".modified", Kind: KindDateTime},
		"organization": {SQL: a + ".organization_id", Kind: KindFK}, "credential_type": {SQL: a + ".credential_type_id", Kind: KindFK},
		"managed": {SQL: a + ".managed", Kind: KindBool}, "inputs": {SQL: a + ".inputs", NoFilter: true},
	}, SearchFields: []string{"name", "description"}}
}

var projectFields *FieldSet

func projectSpec() ListSpec {
	return ListSpec{
		Model: "Project", From: models.ProjectFrom, Columns: models.ProjectColumns, PK: "ujt.id",
		Fields: projectFields, DefaultOrder: []string{"id"},
	}
}

func init() {
	projectFields = projectFieldsAlias("ujt", "p")
	resourceRegistrars = append(resourceRegistrars, (*Server).registerProjects)
}

func (s *Server) registerProjects(mux *http.ServeMux) {
	s.route(mux, "/api/v2/projects/{$}", methodMap{"GET": s.projectList, "POST": s.projectCreate}, s.optionsFor("projects"))
	s.route(mux, "/api/v2/projects/{id}/{$}", methodMap{"GET": s.projectDetail, "PUT": s.projectUpdate, "PATCH": s.projectUpdate, "DELETE": s.projectDelete}, s.optionsFor("projects"))
	s.route(mux, "/api/v2/projects/{id}/playbooks/{$}", methodMap{"GET": s.projectPlaybooks}, nil)
	s.route(mux, "/api/v2/projects/{id}/inventories/{$}", methodMap{"GET": s.projectInventories}, nil)
	s.route(mux, "/api/v2/projects/{id}/webhook_key/{$}", methodMap{"GET": s.projectWebhookKey, "POST": s.projectWebhookKey}, nil)
	s.route(mux, "/api/v2/organizations/{id}/projects/{$}", methodMap{"GET": s.organizationProjects, "POST": s.projectCreate}, s.optionsFor("projects"))
}

func (s *Server) projectAccess(q *Query, u *auth.User) {
	s.AccessibleFilter(q, u, "ujt.id", "main.project", "read_role")
}

func (s *Server) projectList(w http.ResponseWriter, r *http.Request) error {
	return s.projectListWith(w, r, nil)
}

func (s *Server) organizationProjects(w http.ResponseWriter, r *http.Request) error {
	_, o, err := organizationObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	return s.projectListWith(w, r, func(q *Query) { q.And("ujt.organization_id = " + q.Arg(o.ID)) })
}

func (s *Server) projectListWith(w http.ResponseWriter, r *http.Request, extra func(q *Query)) error {
	spec := projectSpec()
	spec.Access = s.projectAccess
	spec.RoleLevel = "main.project"
	projects, count, page, err := runListOf(s, r, spec, extra, models.ScanProject)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, false)
	results, err := s.serializeProjects(c, projects)
	if err != nil {
		return err
	}
	WriteJSON(w, 200, Paginate(r, page, count, results))
	return nil
}

func (s *Server) serializeProjects(c *SerCtx, projects []*models.Project) ([]any, error) {
	var userIDs, orgIDs, eeIDs, jobIDs, credIDs []int64
	for _, p := range projects {
		userIDs = append(userIDs, uniqueIDs(p.CreatedByID, p.ModifiedByID)...)
		orgIDs = append(orgIDs, uniqueIDs(p.OrganizationID)...)
		eeIDs = append(eeIDs, uniqueIDs(p.DefaultEnvironmentID, p.ExecutionEnvironmentID)...)
		jobIDs = append(jobIDs, uniqueIDs(p.LastJobID, p.CurrentJobID)...)
		credIDs = append(credIDs, uniqueIDs(p.CredentialID, p.SignatureValidationCredentialID)...)
	}
	if err := c.PreloadUsers(userIDs); err != nil {
		return nil, err
	}
	if err := c.PreloadOrgs(orgIDs); err != nil {
		return nil, err
	}
	if err := c.PreloadJobs(jobIDs); err != nil {
		return nil, err
	}
	if err := c.PreloadCredentials(credIDs); err != nil {
		return nil, err
	}
	// Project.resolve_execution_environment: the control plane's, which
	// the project's updates run in (its default environment is for the
	// jobs that use it). Only a detail view shows it.
	var resolved *int64
	if c.IsDetailView {
		if resolved = s.ControlPlaneExecutionEnvironmentID(c.Ctx()); resolved != nil {
			eeIDs = append(eeIDs, *resolved)
		}
	}
	if err := c.PreloadEEs(eeIDs); err != nil {
		return nil, err
	}
	out := make([]any, 0, len(projects))
	for _, p := range projects {
		out = append(out, s.serializeProject(c, p, resolved))
	}
	return out, nil
}

func (s *Server) projectNamedURL(c *SerCtx, p *models.Project) string {
	org := ""
	if p.OrganizationID != nil {
		if o := c.OrgSummary(p.OrganizationID); o != nil {
			v, _ := o.Get("name")
			org, _ = v.(string)
		}
	}
	return "/api/v2/projects/" + namedURLEscape(p.Name) + "++" + namedURLEscape(org) + "/"
}

func (s *Server) serializeProject(c *SerCtx, p *models.Project, resolvedEE *int64) *OMap {
	related := NewOMap()
	if c.Detail {
		related.Set("named_url", s.projectNamedURL(c, p))
	}
	setURL(related, "created_by", "users", p.CreatedByID)
	setURL(related, "modified_by", "users", p.ModifiedByID)
	setURL(related, "credential", "credentials", p.CredentialID)
	setURL(related, "current_job", "project_updates", p.CurrentJobID)
	setURL(related, "last_job", "project_updates", p.LastJobID)
	setURL(related, "next_schedule", "schedules", p.NextScheduleID)
	setURL(related, "execution_environment", "execution_environments", p.ExecutionEnvironmentID)
	related.Set("teams", SubURL("projects", p.ID, "teams"))
	related.Set("playbooks", SubURL("projects", p.ID, "playbooks"))
	related.Set("inventory_files", SubURL("projects", p.ID, "inventories"))
	related.Set("update", SubURL("projects", p.ID, "update"))
	related.Set("project_updates", SubURL("projects", p.ID, "project_updates"))
	related.Set("scm_inventory_sources", SubURL("projects", p.ID, "scm_inventory_sources"))
	related.Set("schedules", SubURL("projects", p.ID, "schedules"))
	related.Set("activity_stream", SubURL("projects", p.ID, "activity_stream"))
	related.Set("notification_templates_started", SubURL("projects", p.ID, "notification_templates_started"))
	related.Set("notification_templates_success", SubURL("projects", p.ID, "notification_templates_success"))
	related.Set("notification_templates_error", SubURL("projects", p.ID, "notification_templates_error"))
	related.Set("access_list", SubURL("projects", p.ID, "access_list"))
	related.Set("object_roles", SubURL("projects", p.ID, "object_roles"))
	related.Set("copy", SubURL("projects", p.ID, "copy"))
	related.Set("webhook_key", SubURL("projects", p.ID, "webhook_key"))
	if p.WebhookService != "" {
		related.Set("webhook_receiver", "/api/v2/projects/"+itoa(p.ID)+"/"+p.WebhookService+"/")
	} else {
		related.Set("webhook_receiver", "")
	}
	setURL(related, "organization", "organizations", p.OrganizationID)
	setURL(related, "default_environment", "execution_environments", p.DefaultEnvironmentID)
	setURL(related, "current_update", "project_updates", p.CurrentJobID)
	setURL(related, "last_update", "project_updates", p.LastJobID)

	summary := NewOMap()
	c.putSummary(summary, "organization", c.OrgSummary, p.OrganizationID)
	c.putSummary(summary, "default_environment", c.EESummary, p.DefaultEnvironmentID)
	c.putSummary(summary, "execution_environment", c.EESummary, p.ExecutionEnvironmentID)
	c.putSummary(summary, "credential", c.CredentialSummary, p.CredentialID)
	if c.WantSummary("signature_validation_credential") {
		if cr := c.CredentialSummary(p.SignatureValidationCredentialID); cr != nil {
			cr.Delete("cloud")
			cr.Delete("kubernetes")
			summary.Set("signature_validation_credential", cr)
		}
	}
	c.putSummary(summary, "last_job", c.LastJobSummary, p.LastJobID)
	c.putSummary(summary, "last_update", c.UpdateSummary, p.LastJobID)
	c.putSummary(summary, "current_update", c.UpdateSummary, p.CurrentJobID)
	c.putSummary(summary, "current_job", c.UpdateSummary, p.CurrentJobID)
	c.putSummary(summary, "created_by", c.UserSummary, p.CreatedByID)
	c.putSummary(summary, "modified_by", c.UserSummary, p.ModifiedByID)
	if c.WantSummary("object_roles") {
		summary.Set("object_roles", c.RolesSummary("project", models.ProjectRoleFields, p.RoleID))
	}
	if c.WantSummary("user_capabilities") {
		summary.Set("user_capabilities", s.projectCapabilities(c, p))
	}
	if c.IsDetailView && c.WantSummary("resolved_environment") {
		if e := c.EESummary(resolvedEE); e != nil {
			summary.Set("resolved_environment", e)
		}
	}

	o := Base(NewOMap(), p.ID, "project", URLFor("projects", p.ID), related, summary, p.Created, p.Modified, p.Name, p.Description)
	o.Set("local_path", p.LocalPath).Set("scm_type", p.SCMType).Set("scm_url", p.SCMURL).Set("scm_branch", p.SCMBranch).Set("scm_refspec", p.SCMRefspec)
	o.Set("scm_clean", p.SCMClean).Set("scm_track_submodules", p.SCMTrackSubmodules).Set("scm_delete_on_update", p.SCMDeleteOnUpdate)
	o.Set("credential", models.NullableID(p.CredentialID)).Set("timeout", p.Timeout).Set("scm_revision", p.SCMRevision)
	o.Set("last_job_run", models.FormatTimePtr(p.LastJobRun)).Set("last_job_failed", p.LastJobFailed).Set("next_job_run", models.FormatTimePtr(p.NextJobRun))
	o.Set("status", p.Status).Set("organization", models.NullableID(p.OrganizationID))
	o.Set("scm_update_on_launch", p.SCMUpdateOnLaunch).Set("scm_update_cache_timeout", p.SCMUpdateCacheTimeout)
	o.Set("allow_override", p.AllowOverride).Set("reuse_requirements", p.ReuseRequirements)
	o.Set("default_environment", models.NullableID(p.DefaultEnvironmentID)).Set("signature_validation_credential", models.NullableID(p.SignatureValidationCredentialID))
	o.Set("webhook_service", p.WebhookService).Set("webhook_ref_filter", p.WebhookRefFilter)
	o.Set("last_update_failed", p.LastJobFailed).Set("last_updated", models.FormatTimePtr(p.LastJobRun))
	return o
}

// projectCapabilities mirrors ProjectAccess for the UI: edit/delete need
// admin_role, start/schedule need update_role on an SCM project, copy needs
// project_admin on the organization.
func (s *Server) projectCapabilities(c *SerCtx, p *models.Project) *OMap {
	edit := c.HasRole(p.AdminRoleID)
	start := p.SCMType != "" && c.HasRole(p.UpdateRoleID)
	copyOK := false
	if p.SCMType != "" {
		if c.User != nil && c.User.IsSuperuser {
			copyOK = true
		} else if p.OrganizationID != nil {
			copyOK = c.HasRoleOn("main.organization", *p.OrganizationID, "project_admin_role")
		}
	}
	return Caps("edit", edit, "delete", edit, "start", start, "schedule", start, "copy", copyOK)
}

// projectObj is a project.
var projectObj = &pathObject[*models.Project]{
	model:    "Project",
	get:      models.GetProject,
	readable: func(c *SerCtx, v *models.Project) bool { return c.HasRole(v.ReadRoleID) },
}

func (s *Server) projectDetail(w http.ResponseWriter, r *http.Request) error {
	_, p, err := projectObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	results, err := s.serializeProjects(c, []*models.Project{p})
	if err != nil {
		return err
	}
	WriteJSON(w, 200, results[0])
	return nil
}

// projectSCMChoices are the SCM types the API offers.
var projectSCMChoices = [][2]string{{"", "Manual"}, {"git", "Git"}, {"svn", "Subversion"}, {"archive", "Remote Archive"}}

var webhookServiceChoices = [][2]string{{"", "---------"}, {"github", "GitHub"}, {"gitlab", "GitLab"}, {"bitbucket_dc", "BitBucket DataCenter"}}

func (s *Server) credentialKind(r *http.Request, id int64) (string, bool) {
	var kind string
	err := s.Q().QueryRow(r.Context(), `SELECT ct.kind FROM main_credential c JOIN main_credentialtype ct ON ct.id = c.credential_type_id WHERE c.id = $1`, id).Scan(&kind)
	return kind, err == nil
}

// projectFromForm applies and validates the request body onto p.
func (s *Server) projectFromForm(r *http.Request, f *Form, p *models.Project, isNew bool) {
	initialService, initialKey := p.WebhookService, p.WebhookKey
	p.Name = f.String("name", true, 512, p.Name)
	p.Description = f.String("description", false, 0, p.Description)
	p.SCMType = f.Choice("scm_type", p.SCMType, projectSCMChoices, false)
	p.SCMURL = f.String("scm_url", false, 1024, p.SCMURL)
	p.SCMBranch = f.String("scm_branch", false, 256, p.SCMBranch)
	p.SCMRefspec = f.String("scm_refspec", false, 1024, p.SCMRefspec)
	p.SCMClean = f.Bool("scm_clean", p.SCMClean)
	p.SCMTrackSubmodules = f.Bool("scm_track_submodules", p.SCMTrackSubmodules)
	p.SCMDeleteOnUpdate = f.Bool("scm_delete_on_update", p.SCMDeleteOnUpdate)
	p.SCMUpdateOnLaunch = f.Bool("scm_update_on_launch", p.SCMUpdateOnLaunch)
	zero := int64(0)
	p.SCMUpdateCacheTimeout = f.Int("scm_update_cache_timeout", p.SCMUpdateCacheTimeout, &zero, nil)
	p.Timeout = f.Int("timeout", p.Timeout, nil, nil)
	p.AllowOverride = f.Bool("allow_override", p.AllowOverride)
	p.ReuseRequirements = f.Bool("reuse_requirements", p.ReuseRequirements)
	p.WebhookService = f.Choice("webhook_service", p.WebhookService, webhookServiceChoices, false)
	p.WebhookRefFilter = f.String("webhook_ref_filter", false, 1024, p.WebhookRefFilter)
	if f.Has("webhook_key") {
		p.WebhookKey = f.String("webhook_key", false, 64, p.WebhookKey)
	}
	if id, set := f.ID("organization", p.OrganizationID, false, s.existsIn(r.Context(), "main_organization")); set {
		// Project.clean_organization: job templates take their
		// organization from the project, so it stays while any use it.
		if !isNew && !sameID(id, p.OrganizationID) {
			if used, err := db.Exists(r.Context(), s.Q(), `SELECT 1 FROM main_jobtemplate WHERE project_id = $1`, p.ID); err == nil && used {
				f.Errs.Add("organization", "Organization cannot be changed when in use by job templates.")
			}
		}
		p.OrganizationID = id
	}
	if id, set := f.ID("credential", p.CredentialID, false, func(id int64) bool { _, ok := s.credentialKind(r, id); return ok }); set {
		if id != nil {
			if kind, _ := s.credentialKind(r, *id); kind != "scm" {
				f.Errs.Add("credential", "Credential kind must be 'scm'.")
			}
		}
		p.CredentialID = id
	}
	// Any credential, as the old serializer took it: only a GPG Public Key
	// credential's type (namespace gpg_public_key) turns on the
	// validation_gpg_public_key step its key is used in; with another
	// kind the update runs the checksum check alone and sends nothing.
	if id, set := f.ID("signature_validation_credential", p.SignatureValidationCredentialID, false, func(id int64) bool { _, ok := s.credentialKind(r, id); return ok }); set {
		p.SignatureValidationCredentialID = id
	}
	if id, set := f.ID("default_environment", p.DefaultEnvironmentID, false, s.eeChoiceOK(r.Context(), p.DefaultEnvironmentID)); set {
		p.DefaultEnvironmentID = id
	}
	// local_path rules from ProjectOptionsSerializer.validate.
	if f.Has("local_path") {
		lp := f.String("local_path", false, 1024, p.LocalPath)
		if p.SCMType == "" {
			choices, _ := models.LocalPathChoices(r.Context(), s.Q(), s.Cfg.ProjectsRoot)
			valid := lp == "" || (!isNew && lp == p.LocalPath)
			for _, c := range choices {
				if c == lp {
					valid = true
				}
			}
			if !valid {
				f.Errs.Add("local_path", "This path is already being used by another manual project.")
			} else {
				p.LocalPath = lp
			}
		} else if !isNew && lp != p.LocalPath {
			f.Errs.Add("local_path", fmt.Sprintf("Cannot change local_path for %s-based projects", p.SCMType))
		}
	}
	if p.SCMType != "" && strings.TrimSpace(p.SCMURL) == "" {
		f.Errs.Add("scm_url", "SCM URL is required.")
	}
	if p.SCMType == "" {
		for _, fd := range [][2]any{{"scm_update_on_launch", p.SCMUpdateOnLaunch}, {"scm_delete_on_update", p.SCMDeleteOnUpdate}, {"scm_track_submodules", p.SCMTrackSubmodules}, {"scm_clean", p.SCMClean}} {
			if fd[1].(bool) {
				f.Errs.Add(fd[0].(string), "Update options must be set to false for manual projects.")
				break
			}
		}
		if p.WebhookService != "" {
			f.Errs.Add("webhook_service", "Webhooks are not supported for manual projects.")
		}
	}
	if f.Has("webhook_key") && p.WebhookKey != "" && p.WebhookService == "" {
		f.Errs.Add("webhook_key", "Cannot set a webhook key without a webhook service.")
	}
	if p.SCMBranch != "" && p.SCMType == "archive" {
		f.Errs.Add("scm_branch", "SCM branch cannot be used with archive projects.")
	}
	if p.SCMRefspec != "" && p.SCMType != "git" {
		f.Errs.Add("scm_refspec", "SCM refspec can only be used with git projects.")
	}
	if p.SCMTrackSubmodules && p.SCMType != "git" {
		f.Errs.Add("scm_track_submodules", "SCM track_submodules can only be used with git projects.")
	}
	p.WebhookKey = webhookKeyOnSave(isNew, initialService, initialKey, p.WebhookService, p.WebhookKey)
}

func (s *Server) projectNameTaken(r *http.Request, name string, org *int64, excludeID int64) (bool, error) {
	var ok bool
	if org == nil {
		if err := s.Q().QueryRow(r.Context(), `SELECT EXISTS (SELECT 1 FROM main_unifiedjobtemplate u JOIN main_project p ON p.unifiedjobtemplate_ptr_id = u.id WHERE u.name = $1 AND u.organization_id IS NULL AND u.id <> $2)`, name, excludeID).Scan(&ok); err != nil {
			return false, err
		}
	} else {
		if err := s.Q().QueryRow(r.Context(), `SELECT EXISTS (SELECT 1 FROM main_unifiedjobtemplate u JOIN main_project p ON p.unifiedjobtemplate_ptr_id = u.id WHERE u.name = $1 AND u.organization_id = $2 AND u.id <> $3)`, name, *org, excludeID).Scan(&ok); err != nil {
			return false, err
		}
	}
	return ok, nil
}

func (s *Server) projectChanges(c *SerCtx, p *models.Project) map[string]any {
	ref := func(id *int64, name string) any {
		if id == nil {
			return nil
		}
		return activity.Ref(name, *id)
	}
	orgName := ""
	if p.OrganizationID != nil {
		if o := c.OrgSummary(p.OrganizationID); o != nil {
			v, _ := o.Get("name")
			orgName, _ = v.(string)
		}
	}
	var cred, de, svc any
	if p.CredentialID != nil {
		cs := c.CredentialSummary(p.CredentialID)
		n := ""
		if cs != nil {
			v, _ := cs.Get("name")
			n, _ = v.(string)
		}
		cred = ref(p.CredentialID, n)
	}
	if p.DefaultEnvironmentID != nil {
		es := c.EESummary(p.DefaultEnvironmentID)
		n := ""
		if es != nil {
			v, _ := es.Get("name")
			n, _ = v.(string)
		}
		de = ref(p.DefaultEnvironmentID, n)
	}
	if p.SignatureValidationCredentialID != nil {
		cs := c.CredentialSummary(p.SignatureValidationCredentialID)
		n := ""
		if cs != nil {
			v, _ := cs.Get("name")
			n, _ = v.(string)
		}
		svc = ref(p.SignatureValidationCredentialID, n)
	}
	return map[string]any{
		"name": p.Name, "description": p.Description, "local_path": p.LocalPath, "scm_type": p.SCMType, "scm_url": p.SCMURL,
		"scm_branch": p.SCMBranch, "scm_refspec": p.SCMRefspec, "scm_clean": p.SCMClean, "scm_track_submodules": p.SCMTrackSubmodules,
		"scm_delete_on_update": p.SCMDeleteOnUpdate, "credential": cred, "timeout": p.Timeout,
		"organization": ref(p.OrganizationID, orgName), "scm_update_on_launch": p.SCMUpdateOnLaunch,
		"scm_update_cache_timeout": p.SCMUpdateCacheTimeout, "allow_override": p.AllowOverride, "reuse_requirements": p.ReuseRequirements,
		"default_environment": de, "signature_validation_credential": svc, "webhook_service": p.WebhookService,
		"webhook_ref_filter": p.WebhookRefFilter, "id": p.ID,
	}
}

func (s *Server) projectCreate(w http.ResponseWriter, r *http.Request) error {
	u, err := RequireWrite(r)
	if err != nil {
		return err
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	// Posting to an organization's project list fixes the organization.
	if r.PathValue("id") != "" {
		id, err := PathID(r)
		if err != nil {
			return NotFoundFor("Organization")
		}
		if _, err := organizationObj.load(s, r, u, id); err != nil {
			return err
		}
		body.Set("organization", fmt.Sprint(id))
	}
	f := NewForm(body, false)
	p := &models.Project{CreatedByID: &u.ID, ModifiedByID: &u.ID, ReuseRequirements: true}
	s.projectFromForm(r, f, p, true)
	if err := f.Err(); err != nil {
		return err
	}
	if !u.IsSuperuser {
		if p.OrganizationID == nil || !s.NewSerCtx(r, true).HasRoleOn("main.organization", *p.OrganizationID, "project_admin_role") {
			return ErrForbidden
		}
		if p.CredentialID != nil && !s.NewSerCtx(r, true).HasRoleOn("main.credential", *p.CredentialID, "use_role") {
			return ErrForbidden
		}
	}
	if v, err := s.projectNameTaken(r, p.Name, p.OrganizationID, 0); err != nil {
		return err
	} else if v {
		return FieldErrors{"__all__": {"Project with this (name, organization) combination already exists."}}.Err()
	}
	ctx := r.Context()
	c := s.NewSerCtx(r, true)
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if err := models.InsertProject(ctx, tx, p, s.CT, s.Roles, s.orgLookup(r, tx)); err != nil {
			return err
		}
		return s.Activity.Record(ctx, tx, activity.Entry{Operation: "create", Object1: "project", Changes: s.projectChanges(c.InTx(tx), p), ActorID: &u.ID, Links: map[string]int64{"project": p.ID}})
	})
	if err != nil {
		return err
	}
	if p.SCMType != "" {
		s.requestProjectUpdate(r, p, u)
	}
	results, err := s.serializeProjects(c, []*models.Project{p})
	if err != nil {
		return err
	}
	w.Header().Set("Location", URLFor("projects", p.ID))
	WriteJSON(w, http.StatusCreated, results[0])
	return nil
}

// orgLookup loads an organization for role parents through q, the
// caller's transaction: a second pool connection inside it can deadlock
// the pool. A failed query there aborts the transaction, so the write
// fails rather than leaving roles without their parents.
func (s *Server) orgLookup(r *http.Request, q db.Querier) func(int64) *models.Organization {
	return func(id int64) *models.Organization {
		o, err := models.GetOrganization(r.Context(), q, id)
		if err != nil {
			return nil
		}
		return o
	}
}

// requestProjectUpdate starts the initial sync a new or changed SCM project
// gets, as the old save() did.
func (s *Server) requestProjectUpdate(r *http.Request, p *models.Project, u *auth.User) {
	if _, err := s.LaunchProjectUpdate(r, p, u, "manual"); err != nil {
		s.Log.WarnContext(r.Context(), "project update not launched", "project", p.ID, "err", err)
	}
}

func (s *Server) projectUpdate(w http.ResponseWriter, r *http.Request) error {
	u, p, err := projectObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	if !c.HasRole(p.AdminRoleID) {
		return ErrForbidden
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	before := s.projectChanges(c, p)
	prevOrg := p.OrganizationID
	prevCred, prevURL := models.NullableID(p.CredentialID), p.SCMURL
	prevTrigger := fmt.Sprint(p.SCMType, p.SCMURL, p.SCMBranch, p.SCMRefspec, p.SCMClean, p.SCMDeleteOnUpdate, p.SCMTrackSubmodules, models.NullableID(p.CredentialID))
	f := NewForm(body, r.Method == http.MethodPatch)
	s.projectFromForm(r, f, p, false)
	if err := f.Err(); err != nil {
		return err
	}
	// ProjectAccess.can_change (check_related with obj): moving a project
	// takes project_admin on the organization it joins and on the one it
	// leaves, and only a superuser may take it out of every organization;
	// otherwise an object admin could take it from its organization's
	// admins and auditors.
	if !u.IsSuperuser && !sameID(prevOrg, p.OrganizationID) {
		projectAdmin := func(org *int64) bool {
			return org != nil && c.HasRoleOn("main.organization", *org, "project_admin_role")
		}
		if !projectAdmin(p.OrganizationID) || (prevOrg != nil && !projectAdmin(prevOrg)) {
			return ErrForbidden
		}
	}
	// The SCM credential's username and password go to whatever scm_url
	// names on the next update. Choosing the credential, or changing where
	// it is sent, takes use of it, as creating the project did: a project
	// admin must not be able to point another user's credential at a
	// server of their own.
	if !u.IsSuperuser && p.CredentialID != nil && (models.NullableID(p.CredentialID) != prevCred || p.SCMURL != prevURL) {
		if !c.HasRoleOn("main.credential", *p.CredentialID, "use_role") {
			return ErrForbidden
		}
	}
	if v, err := s.projectNameTaken(r, p.Name, p.OrganizationID, p.ID); err != nil {
		return err
	} else if v {
		return FieldErrors{"__all__": {"Project with this (name, organization) combination already exists."}}.Err()
	}
	p.ModifiedByID = &u.ID
	if p.SCMType == "" {
		if models.ProjectPath(s.Cfg.ProjectsRoot, p.LocalPath) == "" {
			p.Status = "missing"
		} else if p.Status == "missing" || p.Status == "never updated" {
			p.Status = "ok"
		}
	} else if p.Status == "ok" || p.Status == "missing" {
		p.Status = "never updated"
	}
	orgChanged := (prevOrg == nil) != (p.OrganizationID == nil) || (prevOrg != nil && p.OrganizationID != nil && *prevOrg != *p.OrganizationID)
	ctx := r.Context()
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if err := models.UpdateProject(ctx, tx, p, s.orgLookup(r, tx), orgChanged); err != nil {
			return err
		}
		changes := diffChanges(before, s.projectChanges(c.InTx(tx), p))
		if len(changes) == 0 {
			return nil
		}
		return s.Activity.Record(ctx, tx, activity.Entry{Operation: "update", Object1: "project", Changes: changes, ActorID: &u.ID, Links: map[string]int64{"project": p.ID}})
	})
	if err != nil {
		return err
	}
	newTrigger := fmt.Sprint(p.SCMType, p.SCMURL, p.SCMBranch, p.SCMRefspec, p.SCMClean, p.SCMDeleteOnUpdate, p.SCMTrackSubmodules, models.NullableID(p.CredentialID))
	if p.SCMType != "" && newTrigger != prevTrigger {
		s.requestProjectUpdate(r, p, u)
	}
	results, err := s.serializeProjects(c, []*models.Project{p})
	if err != nil {
		return err
	}
	WriteJSON(w, 200, results[0])
	return nil
}

func (s *Server) projectDelete(w http.ResponseWriter, r *http.Request) error {
	u, p, err := projectObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	if !c.HasRole(p.AdminRoleID) {
		return ErrForbidden
	}
	ctx := r.Context()
	// RelatedJobsPreventDeleteMixin
	if err := s.checkRelatedActiveJobs(ctx, projectJobsCond, p.ID); err != nil {
		return err
	}
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if err := s.Activity.Record(ctx, tx, activity.Entry{Operation: "delete", Object1: "project", Changes: s.projectChanges(c.InTx(tx), p), ActorID: &u.ID}); err != nil {
			return err
		}
		return models.DeleteProject(ctx, tx, p.ID, s.CT, s.Cascade)
	})
	if err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func (s *Server) projectPlaybooks(w http.ResponseWriter, r *http.Request) error {
	_, p, err := projectObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	// ProjectPlaybooksSerializer: a project under source control lists the
	// playbooks its last update found, which every web process can answer
	// (the checkout is on the node that synced it); a manual project's
	// directory is read.
	if p.SCMType != "" {
		files := p.PlaybookFiles
		if files == nil {
			files = []string{}
		}
		WriteJSON(w, 200, files)
		return nil
	}
	WriteJSON(w, 200, models.ProjectPlaybooks(models.ProjectPath(s.Cfg.ProjectsRoot, p.LocalPath), s.Settings.Bool(r.Context(), "ASCENDER_SHOW_PLAYBOOK_LINKS")))
	return nil
}

func (s *Server) projectInventories(w http.ResponseWriter, r *http.Request) error {
	_, p, err := projectObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	// ProjectInventoriesSerializer: the files the last update recorded.
	files := p.InventoryFiles
	if files == nil {
		files = []string{}
	}
	WriteJSON(w, 200, files)
	return nil
}

func (s *Server) projectWebhookKey(w http.ResponseWriter, r *http.Request) error {
	u, p, err := projectObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	if !c.HasRole(p.AdminRoleID) {
		return ErrForbidden
	}
	if r.Method == http.MethodPost {
		if !u.CanWrite() {
			return ErrForbidden
		}
		p.WebhookKey = newWebhookKey()
		if _, err := s.Q().Exec(r.Context(), `UPDATE main_project SET webhook_key = $2 WHERE unifiedjobtemplate_ptr_id = $1`, p.ID, p.WebhookKey); err != nil {
			return err
		}
	}
	WriteJSON(w, 200, NewOMap().Set("webhook_key", p.WebhookKey))
	return nil
}
