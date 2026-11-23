package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/activity"
	"github.com/ctrliq/ascender/internal/auth"
	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/models"
	"github.com/ctrliq/ascender/internal/rbac"
)

// jobTemplateFieldsAlias builds the filterable surface for a job template
// reached through aliases ujt (main_unifiedjobtemplate) and jt (main_jobtemplate).
func jobTemplateFieldsAlias(ujt, jt string) *FieldSet {
	f := map[string]Field{
		"id": {SQL: ujt + ".id", Kind: KindInt}, "name": {SQL: ujt + ".name"}, "description": {SQL: ujt + ".description"},
		"created": {SQL: ujt + ".created", Kind: KindDateTime}, "modified": {SQL: ujt + ".modified", Kind: KindDateTime},
		"last_job_failed": {SQL: ujt + ".last_job_failed", Kind: KindBool}, "last_job_run": {SQL: ujt + ".last_job_run", Kind: KindDateTime},
		"next_job_run": {SQL: ujt + ".next_job_run", Kind: KindDateTime}, "status": {SQL: ujt + ".status"},
		"job_type": {SQL: jt + ".job_type"}, "playbook": {SQL: jt + ".playbook"}, "scm_branch": {SQL: jt + ".scm_branch"},
		"forks": {SQL: jt + ".forks", Kind: KindInt}, "limit": {SQL: jt + `."limit"`}, "job_slice_pinned_hosts": {SQL: jt + ".job_slice_pinned_hosts"},
		"verbosity": {SQL: jt + ".verbosity", Kind: KindInt}, "extra_vars": {SQL: jt + ".extra_vars", NoFilter: true}, "job_tags": {SQL: jt + ".job_tags"},
		"force_handlers": {SQL: jt + ".force_handlers", Kind: KindBool}, "skip_tags": {SQL: jt + ".skip_tags"}, "start_at_task": {SQL: jt + ".start_at_task"},
		"timeout": {SQL: jt + ".timeout", Kind: KindInt}, "use_fact_cache": {SQL: jt + ".use_fact_cache", Kind: KindBool},
		"host_config_key": {SQL: jt + ".host_config_key", NoFilter: true}, "survey_spec": {SQL: jt + ".survey_spec", NoFilter: true},
		"survey_enabled": {SQL: jt + ".survey_enabled", Kind: KindBool}, "become_enabled": {SQL: jt + ".become_enabled", Kind: KindBool},
		"diff_mode": {SQL: jt + ".diff_mode", Kind: KindBool}, "allow_simultaneous": {SQL: jt + ".allow_simultaneous", Kind: KindBool},
		"job_slice_count": {SQL: jt + ".job_slice_count", Kind: KindInt}, "webhook_service": {SQL: jt + ".webhook_service"},
		"webhook_key": {SQL: jt + ".webhook_key", NoFilter: true}, "prevent_instance_group_fallback": {SQL: jt + ".prevent_instance_group_fallback", Kind: KindBool},
		"prevent_relaunch":      {SQL: jt + ".prevent_relaunch", Kind: KindBool},
		"organization":          {SQL: ujt + ".organization_id", Kind: KindFK, Rel: &Relation{Alias: "o", Join: "LEFT JOIN main_organization o ON o.id = " + ujt + ".organization_id", Target: func() *FieldSet { return organizationFields }}},
		"inventory":             {SQL: jt + ".inventory_id", Kind: KindFK, Rel: &Relation{Alias: "jinv", Join: "LEFT JOIN main_inventory jinv ON jinv.id = " + jt + ".inventory_id", Target: func() *FieldSet { return inventoryFieldsAlias("jinv") }}},
		"project":               {SQL: jt + ".project_id", Kind: KindFK, Rel: &Relation{Alias: "pp", Join: "LEFT JOIN main_project pp ON pp.unifiedjobtemplate_ptr_id = " + jt + ".project_id LEFT JOIN main_unifiedjobtemplate pujt ON pujt.id = pp.unifiedjobtemplate_ptr_id", Target: func() *FieldSet { return projectFieldsAlias("pujt", "pp") }}},
		"execution_environment": {SQL: ujt + ".execution_environment_id", Kind: KindFK, Rel: &Relation{Alias: "ee", Join: "LEFT JOIN main_executionenvironment ee ON ee.id = " + ujt + ".execution_environment_id", Target: func() *FieldSet { return executionEnvironmentFields }}},
		"webhook_credential":    {SQL: jt + ".webhook_credential_id", Kind: KindFK, Rel: &Relation{Alias: "wc", Join: "LEFT JOIN main_credential wc ON wc.id = " + jt + ".webhook_credential_id", Target: func() *FieldSet { return credentialFieldsAlias("wc") }}},
		"created_by":            {SQL: ujt + ".created_by_id", Kind: KindFK, Rel: &Relation{Alias: "cb", Join: "LEFT JOIN auth_user cb ON cb.id = " + ujt + ".created_by_id", Target: func() *FieldSet { return userFieldsAlias("cb") }}},
		"modified_by":           {SQL: ujt + ".modified_by_id", Kind: KindFK, Rel: &Relation{Alias: "mb", Join: "LEFT JOIN auth_user mb ON mb.id = " + ujt + ".modified_by_id", Target: func() *FieldSet { return userFieldsAlias("mb") }}},
		"last_job":              {SQL: ujt + ".last_job_id", Kind: KindFK, Rel: &Relation{Alias: "lj", Join: "LEFT JOIN main_unifiedjob lj ON lj.id = " + ujt + ".last_job_id", Target: func() *FieldSet { return unifiedJobFieldsAlias("lj") }}},
		"current_job":           {SQL: ujt + ".current_job_id", Kind: KindFK, Rel: &Relation{Alias: "cj", Join: "LEFT JOIN main_unifiedjob cj ON cj.id = " + ujt + ".current_job_id", Target: func() *FieldSet { return unifiedJobFieldsAlias("cj") }}},
		"labels":                {SQL: "jtl.label_id", Kind: KindFK, Rel: &Relation{Alias: "jtl", Join: "LEFT JOIN main_unifiedjobtemplate_labels jtl ON jtl.unifiedjobtemplate_id = " + ujt + ".id LEFT JOIN main_label jtlabel ON jtlabel.id = jtl.label_id", Target: func() *FieldSet { return labelFieldSet("jtlabel") }, Many: true}},
		"credentials":           {SQL: "jtc.credential_id", Kind: KindFK, Rel: &Relation{Alias: "jtc", Join: "LEFT JOIN main_unifiedjobtemplate_credentials jtc ON jtc.unifiedjobtemplate_id = " + ujt + ".id LEFT JOIN main_credential jtcred ON jtcred.id = jtc.credential_id", Target: func() *FieldSet { return credentialFieldsAlias("jtcred") }, Many: true}},
		"polymorphic_ctype":     {SQL: ujt + ".polymorphic_ctype_id", Kind: KindFK},
	}
	for _, ask := range askFields {
		f[ask] = Field{SQL: jt + "." + ask, Kind: KindBool}
	}
	return &FieldSet{Model: "JobTemplate", Fields: f, SearchFields: []string{"description", "name"}}
}

// askFields are the prompt-on-launch flags in the order the API lists them.
var askFields = []string{
	"ask_scm_branch_on_launch", "ask_diff_mode_on_launch", "ask_variables_on_launch", "ask_limit_on_launch", "ask_tags_on_launch", "ask_skip_tags_on_launch",
	"ask_job_type_on_launch", "ask_verbosity_on_launch", "ask_inventory_on_launch", "ask_credential_on_launch", "ask_execution_environment_on_launch",
	"ask_labels_on_launch", "ask_forks_on_launch", "ask_job_slice_count_on_launch", "ask_timeout_on_launch", "ask_instance_groups_on_launch",
}

var jobTemplateFields *FieldSet

func jobTemplateSpec() ListSpec {
	return ListSpec{Model: "JobTemplate", From: models.JobTemplateFrom, Columns: models.JobTemplateColumns, PK: "ujt.id", Fields: jobTemplateFields, DefaultOrder: []string{"name"}}
}

func init() {
	jobTemplateFields = jobTemplateFieldsAlias("ujt", "jt")
	resourceRegistrars = append(resourceRegistrars, (*Server).registerJobTemplates)
}

func (s *Server) registerJobTemplates(mux *http.ServeMux) {
	s.route(mux, "/api/v2/job_templates/{$}", methodMap{"GET": s.jobTemplateList, "POST": s.jobTemplateCreate}, s.optionsFor("job_templates"))
	s.route(mux, "/api/v2/job_templates/{id}/{$}", methodMap{"GET": s.jobTemplateDetail, "PUT": s.jobTemplateUpdate, "PATCH": s.jobTemplateUpdate, "DELETE": s.jobTemplateDelete}, s.optionsFor("job_templates"))
	s.route(mux, "/api/v2/job_templates/{id}/launch/{$}", methodMap{"GET": s.jobTemplateLaunchView, "POST": s.jobTemplateLaunch}, nil)
	s.route(mux, "/api/v2/job_templates/{id}/callback/{$}", methodMap{"GET": s.jobTemplateCallbackGet, "POST": s.jobTemplateCallbackPost}, s.optionsFor("job_templates"))
	s.route(mux, "/api/v2/job_templates/{id}/jobs/{$}", methodMap{"GET": s.jobTemplateJobs}, s.optionsFor("jobs"))
	s.route(mux, "/api/v2/job_templates/{id}/slice_workflow_jobs/{$}", methodMap{"GET": s.jobTemplateSliceWorkflowJobs}, nil)
	s.route(mux, "/api/v2/job_templates/{id}/credentials/{$}", methodMap{"GET": s.jobTemplateCredentials, "POST": s.jobTemplateCredentialsAttach}, s.optionsFor("credentials"))
	s.route(mux, "/api/v2/job_templates/{id}/labels/{$}", methodMap{"GET": s.jobTemplateLabels, "POST": s.jobTemplateLabelsAttach}, nil)
	s.route(mux, "/api/v2/job_templates/{id}/instance_groups/{$}", methodMap{"GET": s.jobTemplateInstanceGroups, "POST": s.jobTemplateInstanceGroupsAttach}, nil)
	s.route(mux, "/api/v2/job_templates/{id}/object_roles/{$}", methodMap{"GET": s.objectRolesRoute("main.jobtemplate", jobTemplateObj.parentCheck(s))}, nil)
	s.route(mux, "/api/v2/job_templates/{id}/survey_spec/{$}", methodMap{"GET": s.jobTemplateSurveySpec, "POST": s.jobTemplateSurveySpecSave, "DELETE": s.jobTemplateSurveySpecDelete}, nil)
	s.route(mux, "/api/v2/job_templates/{id}/copy/{$}", methodMap{"GET": s.jobTemplateCopyView, "POST": s.jobTemplateCopy}, nil)
	s.route(mux, "/api/v2/job_templates/{id}/webhook_key/{$}", methodMap{"GET": s.jobTemplateWebhookKey, "POST": s.jobTemplateWebhookKey}, nil)
	s.route(mux, "/api/v2/job_templates/{id}/schedules/{$}", methodMap{"GET": s.jobTemplateSchedules, "POST": s.jobTemplateScheduleCreate}, s.optionsFor("schedules"))
	for _, kind := range []string{"started", "success", "error", "changed"} {
		kind := kind
		s.route(mux, "/api/v2/job_templates/{id}/notification_templates_"+kind+"/{$}", methodMap{"GET": func(w http.ResponseWriter, r *http.Request) error {
			return s.jobTemplateNotificationTemplates(w, r, kind)
		}, "POST": func(w http.ResponseWriter, r *http.Request) error {
			return s.jobTemplateNotificationTemplatesAttach(w, r, kind)
		}}, s.optionsFor("notification_templates"))
	}
	s.route(mux, "/api/v2/organizations/{id}/job_templates/{$}", methodMap{"GET": s.organizationJobTemplates}, s.optionsFor("job_templates"))
	s.route(mux, "/api/v2/inventories/{id}/job_templates/{$}", methodMap{"GET": s.inventoryJobTemplates}, s.optionsFor("job_templates"))
}

func (s *Server) jobTemplateAccess(q *Query, u *auth.User) {
	s.AccessibleFilter(q, u, "ujt.id", "main.jobtemplate", "read_role")
}

func (s *Server) jobTemplateList(w http.ResponseWriter, r *http.Request) error {
	return s.jobTemplateListWith(w, r, nil)
}

func (s *Server) organizationJobTemplates(w http.ResponseWriter, r *http.Request) error {
	_, o, err := organizationObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	return s.jobTemplateListWith(w, r, func(q *Query) { q.And("ujt.organization_id = " + q.Arg(o.ID)) })
}

func (s *Server) inventoryJobTemplates(w http.ResponseWriter, r *http.Request) error {
	_, inv, err := inventoryObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	return s.jobTemplateListWith(w, r, func(q *Query) { q.And("jt.inventory_id = " + q.Arg(inv.ID)) })
}

func (s *Server) jobTemplateListWith(w http.ResponseWriter, r *http.Request, extra func(q *Query)) error {
	spec := jobTemplateSpec()
	spec.Access = s.jobTemplateAccess
	spec.RoleLevel = "main.jobtemplate"
	jts, count, page, err := runListOf(s, r, spec, extra, models.ScanJobTemplate)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, false)
	results, err := s.serializeJobTemplates(c, jts)
	if err != nil {
		return err
	}
	WriteJSON(w, 200, Paginate(r, page, count, results))
	return nil
}

// projectBrief is the project block of summary_fields.
type projectBrief struct {
	ID            int64
	Name          string
	Description   string
	Status        string
	SCMType       string
	AllowOverride bool
	OrgID         *int64
}

func (s *Server) loadProjectBriefs(c *SerCtx, ids []int64) (map[int64]projectBrief, error) {
	out := map[int64]projectBrief{}
	if len(ids) == 0 {
		return out, nil
	}
	rows, err := c.S.Q().Query(c.Ctx(), `SELECT ujt.id, ujt.name, ujt.description, ujt.status, p.scm_type, p.allow_override, ujt.organization_id FROM main_project p JOIN main_unifiedjobtemplate ujt ON ujt.id = p.unifiedjobtemplate_ptr_id WHERE ujt.id = ANY($1)`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var p projectBrief
		if err := rows.Scan(&p.ID, &p.Name, &p.Description, &p.Status, &p.SCMType, &p.AllowOverride, &p.OrgID); err != nil {
			return nil, err
		}
		out[p.ID] = p
	}
	return out, rows.Err()
}

func projectBriefMap(p projectBrief) *OMap {
	return NewOMap().Set("id", p.ID).Set("name", p.Name).Set("description", p.Description).Set("status", p.Status).Set("scm_type", p.SCMType).Set("allow_override", p.AllowOverride)
}

// jobTemplateContext carries the batch-loaded relations of a page of
// templates.
type jobTemplateContext struct {
	invs     map[int64]models.InventorySummary
	projects map[int64]projectBrief
	labels   map[int64][]models.NameSummary
	creds    map[int64][]models.CredentialBrief
	recent   map[int64][]models.RecentTemplateJob
	resolved map[int64]*int64
}

func (s *Server) serializeJobTemplates(c *SerCtx, jts []*models.JobTemplate) ([]any, error) {
	var userIDs, orgIDs, eeIDs, jobIDs, credIDs, invIDs, projIDs, ids []int64
	for _, t := range jts {
		ids = append(ids, t.ID)
		userIDs = append(userIDs, uniqueIDs(t.CreatedByID, t.ModifiedByID)...)
		orgIDs = append(orgIDs, uniqueIDs(t.OrganizationID)...)
		eeIDs = append(eeIDs, uniqueIDs(t.ExecutionEnvironmentID)...)
		jobIDs = append(jobIDs, uniqueIDs(t.LastJobID, t.CurrentJobID)...)
		credIDs = append(credIDs, uniqueIDs(t.WebhookCredentialID)...)
		invIDs = append(invIDs, uniqueIDs(t.InventoryID)...)
		projIDs = append(projIDs, uniqueIDs(t.ProjectID)...)
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
	ctx := &jobTemplateContext{}
	var err error
	if ctx.invs, err = models.LoadInventorySummaries(c.Ctx(), c.S.Q(), invIDs); err != nil {
		return nil, err
	}
	if ctx.projects, err = s.loadProjectBriefs(c, projIDs); err != nil {
		return nil, err
	}
	if ctx.labels, err = models.TemplateLabels(c.Ctx(), c.S.Q(), ids); err != nil {
		return nil, err
	}
	if ctx.creds, err = models.TemplateCredentials(c.Ctx(), c.S.Q(), ids); err != nil {
		return nil, err
	}
	if ctx.recent, err = models.LoadRecentTemplateJobs(c.Ctx(), c.S.Q(), c.S.CT, ids); err != nil {
		return nil, err
	}
	if c.IsDetailView {
		ctx.resolved = map[int64]*int64{}
		for _, t := range jts {
			ee := s.resolvedJobEnvironment(c.R, t)
			ctx.resolved[t.ID] = ee
			if ee != nil {
				eeIDs = append(eeIDs, *ee)
			}
		}
	}
	if err := c.PreloadEEs(eeIDs); err != nil {
		return nil, err
	}
	out := make([]any, 0, len(jts))
	for _, t := range jts {
		out = append(out, s.serializeJobTemplate(c, t, ctx))
	}
	return out, nil
}

// resolvedJobEnvironment picks the execution environment a job of the
// template runs in: the template's, then the project's default, then the
// organization's, then the global default.
func (s *Server) resolvedJobEnvironment(r *http.Request, t *models.JobTemplate) *int64 {
	if t.ExecutionEnvironmentID != nil {
		return t.ExecutionEnvironmentID
	}
	// Templates of a page share their projects and organizations: each
	// default is read once per read-only request.
	ctx := r.Context()
	if t.ProjectID != nil {
		if ee := memoized(ctx, "projectDefaultEE/"+itoa(*t.ProjectID), func() *int64 {
			var ee *int64
			_ = db.Tolerant(s.Q()).QueryRow(ctx, `SELECT default_environment_id FROM main_project WHERE unifiedjobtemplate_ptr_id = $1`, *t.ProjectID).Scan(&ee)
			return ee
		}); ee != nil {
			return ee
		}
	}
	if t.OrganizationID != nil {
		if ee := memoized(ctx, "orgDefaultEE/"+itoa(*t.OrganizationID), func() *int64 {
			ee := colOf[*int64](ctx, s.Q(), "main_organization", "default_environment_id", *t.OrganizationID)
			return ee
		}); ee != nil {
			return ee
		}
	}
	return s.DefaultExecutionEnvironmentID(ctx)
}

func (s *Server) jobTemplateNamedURL(c *SerCtx, t *models.JobTemplate) string {
	org := ""
	if o := c.OrgSummary(t.OrganizationID); o != nil {
		v, _ := o.Get("name")
		org, _ = v.(string)
	}
	return "/api/v2/job_templates/" + namedURLEscape(t.Name) + "++" + namedURLEscape(org) + "/"
}

func labelsSummary(labels []models.NameSummary) *OMap {
	results := make([]any, 0, len(labels))
	for _, l := range labels {
		results = append(results, NewOMap().Set("id", l.ID).Set("name", l.Name))
	}
	return NewOMap().Set("count", len(labels)).Set("results", results)
}

func credentialsSummary(creds []models.CredentialBrief) []any {
	out := make([]any, 0, len(creds))
	for _, cr := range creds {
		out = append(out, NewOMap().Set("id", cr.ID).Set("name", cr.Name).Set("description", cr.Description).Set("kind", cr.Kind).Set("cloud", cr.Cloud))
	}
	return out
}

func (s *Server) serializeJobTemplate(c *SerCtx, t *models.JobTemplate, ctx *jobTemplateContext) *OMap {
	related := NewOMap()
	if c.Detail {
		related.Set("named_url", s.jobTemplateNamedURL(c, t))
	}
	setURL(related, "created_by", "users", t.CreatedByID)
	setURL(related, "modified_by", "users", t.ModifiedByID)
	related.Set("labels", SubURL("job_templates", t.ID, "labels"))
	setURL(related, "inventory", "inventories", t.InventoryID)
	setURL(related, "project", "projects", t.ProjectID)
	setURL(related, "organization", "organizations", t.OrganizationID)
	related.Set("credentials", SubURL("job_templates", t.ID, "credentials"))
	if t.CurrentJobID != nil {
		if j, ok := c.Job(t.CurrentJobID); ok {
			related.Set("current_job", models.JobDetailURL(j.Type, j.ID))
		}
	}
	if t.LastJobID != nil {
		if j, ok := c.Job(t.LastJobID); ok {
			related.Set("last_job", models.JobDetailURL(j.Type, j.ID))
		}
	}
	setURL(related, "next_schedule", "schedules", t.NextScheduleID)
	setURL(related, "execution_environment", "execution_environments", t.ExecutionEnvironmentID)
	related.Set("jobs", SubURL("job_templates", t.ID, "jobs"))
	related.Set("schedules", SubURL("job_templates", t.ID, "schedules"))
	related.Set("activity_stream", SubURL("job_templates", t.ID, "activity_stream"))
	related.Set("launch", SubURL("job_templates", t.ID, "launch"))
	related.Set("webhook_key", SubURL("job_templates", t.ID, "webhook_key"))
	if t.WebhookService != "" {
		related.Set("webhook_receiver", "/api/v2/job_templates/"+itoa(t.ID)+"/"+t.WebhookService+"/")
	} else {
		related.Set("webhook_receiver", "")
	}
	for _, k := range []string{"started", "success", "error", "changed"} {
		related.Set("notification_templates_"+k, SubURL("job_templates", t.ID, "notification_templates_"+k))
	}
	related.Set("access_list", SubURL("job_templates", t.ID, "access_list"))
	related.Set("survey_spec", SubURL("job_templates", t.ID, "survey_spec"))
	related.Set("object_roles", SubURL("job_templates", t.ID, "object_roles"))
	related.Set("instance_groups", SubURL("job_templates", t.ID, "instance_groups"))
	related.Set("slice_workflow_jobs", SubURL("job_templates", t.ID, "slice_workflow_jobs"))
	related.Set("copy", SubURL("job_templates", t.ID, "copy"))
	if t.HostConfigKey != "" {
		related.Set("callback", SubURL("job_templates", t.ID, "callback"))
	}
	setURL(related, "webhook_credential", "credentials", t.WebhookCredentialID)

	summary := NewOMap()
	c.putSummary(summary, "organization", c.OrgSummary, t.OrganizationID)
	if c.WantSummary("inventory") && t.InventoryID != nil {
		if inv, ok := ctx.invs[*t.InventoryID]; ok {
			summary.Set("inventory", inventorySummaryMap(inv))
		}
	}
	c.putSummary(summary, "execution_environment", c.EESummary, t.ExecutionEnvironmentID)
	if c.WantSummary("project") && t.ProjectID != nil {
		if p, ok := ctx.projects[*t.ProjectID]; ok {
			summary.Set("project", projectBriefMap(p))
		}
	}
	c.putSummary(summary, "last_job", c.LastJobSummary, t.LastJobID)
	c.putSummary(summary, "last_update", c.UpdateSummary, t.LastJobID)
	c.putSummary(summary, "current_update", c.UpdateSummary, t.CurrentJobID)
	c.putSummary(summary, "current_job", c.UpdateSummary, t.CurrentJobID)
	if c.WantSummary("webhook_credential") {
		if cr := c.CredentialSummary(t.WebhookCredentialID); cr != nil {
			cr.Delete("kubernetes")
			summary.Set("webhook_credential", cr)
		}
	}
	c.putSummary(summary, "created_by", c.UserSummary, t.CreatedByID)
	c.putSummary(summary, "modified_by", c.UserSummary, t.ModifiedByID)
	if c.WantSummary("object_roles") {
		summary.Set("object_roles", c.RolesSummary("job template", models.JobTemplateRoleFields, t.RoleID))
	}
	if c.WantSummary("user_capabilities") {
		summary.Set("user_capabilities", s.jobTemplateCapabilities(c, t, ctx))
	}
	if c.WantSummary("labels") {
		summary.Set("labels", labelsSummary(ctx.labels[t.ID]))
	}
	if c.IsDetailView && c.WantSummary("resolved_environment") && ctx.resolved != nil {
		if e := c.EESummary(ctx.resolved[t.ID]); e != nil {
			summary.Set("resolved_environment", e)
		}
	}
	if c.WantSummary("survey") {
		spec := t.SurveySpecMap()
		name, hasName := spec["name"]
		desc, hasDesc := spec["description"]
		if hasName && hasDesc {
			summary.Set("survey", NewOMap().Set("title", name).Set("description", desc))
		}
	}
	if c.WantSummary("recent_jobs") {
		recent := make([]any, 0, len(ctx.recent[t.ID]))
		for _, j := range ctx.recent[t.ID] {
			recent = append(recent, NewOMap().Set("id", j.ID).Set("status", j.Status).Set("finished", models.FormatTimePtr(j.Finished)).Set("canceled_on", models.FormatTimePtr(j.CanceledOn)).Set("type", j.Type))
		}
		summary.Set("recent_jobs", recent)
	}
	if c.WantSummary("credentials") {
		summary.Set("credentials", credentialsSummary(ctx.creds[t.ID]))
	}

	o := Base(NewOMap(), t.ID, "job_template", URLFor("job_templates", t.ID), related, summary, t.Created, t.Modified, t.Name, t.Description)
	o.Set("job_type", t.JobType).Set("inventory", models.NullableID(t.InventoryID)).Set("project", models.NullableID(t.ProjectID))
	playbook := t.Playbook
	if t.ProjectID == nil {
		playbook = ""
	}
	o.Set("playbook", playbook).Set("scm_branch", t.SCMBranch).Set("forks", t.Forks).Set("limit", t.Limit).Set("job_slice_pinned_hosts", t.JobSlicePinnedHosts)
	o.Set("verbosity", t.Verbosity).Set("extra_vars", t.ExtraVars).Set("job_tags", t.JobTags).Set("force_handlers", t.ForceHandlers).Set("skip_tags", t.SkipTags)
	o.Set("start_at_task", t.StartAtTask).Set("timeout", t.Timeout).Set("use_fact_cache", t.UseFactCache).Set("organization", models.NullableID(t.OrganizationID))
	o.Set("last_job_run", models.FormatTimePtr(t.LastJobRun)).Set("last_job_failed", t.LastJobFailed).Set("next_job_run", models.FormatTimePtr(t.NextJobRun))
	o.Set("status", t.Status).Set("execution_environment", models.NullableID(t.ExecutionEnvironmentID)).Set("host_config_key", t.HostConfigKey)
	o.Set("ask_scm_branch_on_launch", t.AskSCMBranchOnLaunch).Set("ask_diff_mode_on_launch", t.AskDiffModeOnLaunch).Set("ask_variables_on_launch", t.AskVariablesOnLaunch)
	o.Set("ask_limit_on_launch", t.AskLimitOnLaunch).Set("ask_tags_on_launch", t.AskTagsOnLaunch).Set("ask_skip_tags_on_launch", t.AskSkipTagsOnLaunch)
	o.Set("ask_job_type_on_launch", t.AskJobTypeOnLaunch).Set("ask_verbosity_on_launch", t.AskVerbosityOnLaunch).Set("ask_inventory_on_launch", t.AskInventoryOnLaunch)
	o.Set("ask_credential_on_launch", t.AskCredentialOnLaunch).Set("ask_execution_environment_on_launch", t.AskExecutionEnvironmentOnLaunch).Set("ask_labels_on_launch", t.AskLabelsOnLaunch)
	o.Set("ask_forks_on_launch", t.AskForksOnLaunch).Set("ask_job_slice_count_on_launch", t.AskJobSliceCountOnLaunch).Set("ask_timeout_on_launch", t.AskTimeoutOnLaunch)
	o.Set("ask_instance_groups_on_launch", t.AskInstanceGroupsOnLaunch).Set("survey_enabled", t.SurveyEnabled).Set("become_enabled", t.BecomeEnabled)
	o.Set("diff_mode", t.DiffMode).Set("allow_simultaneous", t.AllowSimultaneous).Set("job_slice_count", t.JobSliceCount)
	o.Set("webhook_service", t.WebhookService).Set("webhook_credential", models.NullableID(t.WebhookCredentialID))
	o.Set("prevent_instance_group_fallback", t.PreventInstanceGroupFallback).Set("prevent_relaunch", t.PreventRelaunch)
	return o
}

// jobTemplateCanCopy mirrors JobTemplateAccess.can_add with the template as
// reference object plus can_copy_related: use on the inventory and the
// project, read on the execution environment, and use on every credential.
func (s *Server) jobTemplateCanCopy(c *SerCtx, t *models.JobTemplate, creds []models.CredentialBrief) bool {
	return s.jobTemplateCanAddCopy(c, t) && s.jobTemplateCanCopyCredentials(c, creds)
}

// jobTemplateCanAddCopy is JobTemplateAccess.can_add for the copy's
// fields: use on the inventory, read on the execution environment
// (check_related), use on the project.
func (s *Server) jobTemplateCanAddCopy(c *SerCtx, t *models.JobTemplate) bool {
	if c.User == nil {
		return false
	}
	if c.User.IsSuperuser {
		return true
	}
	if t.InventoryID != nil && !c.HasRoleOn("main.inventory", *t.InventoryID, "use_role") {
		return false
	}
	if t.ExecutionEnvironmentID != nil && !s.eeReadable(c, *t.ExecutionEnvironmentID) {
		return false
	}
	return t.ProjectID != nil && c.HasRoleOn("main.project", *t.ProjectID, "use_role")
}

// jobTemplateCanCopyCredentials is JobTemplateAccess.can_copy_related: use
// on every credential of the template.
func (s *Server) jobTemplateCanCopyCredentials(c *SerCtx, creds []models.CredentialBrief) bool {
	if c.User == nil {
		return false
	}
	if c.User.IsSuperuser {
		return true
	}
	for _, cr := range creds {
		if !c.HasRoleOn("main.credential", cr.ID, "use_role") {
			return false
		}
	}
	return true
}

func (s *Server) jobTemplateCapabilities(c *SerCtx, t *models.JobTemplate, ctx *jobTemplateContext) *OMap {
	edit := c.HasRole(t.AdminRoleID)
	start := c.HasRole(t.ExecuteRoleID)
	return Caps("edit", edit, "delete", edit, "start", start, "schedule", start, "copy", s.jobTemplateCanCopy(c, t, ctx.creds[t.ID]))
}

// jobTemplateObj is a job template.
var jobTemplateObj = &pathObject[*models.JobTemplate]{
	model:    "JobTemplate",
	get:      models.GetJobTemplate,
	readable: func(c *SerCtx, v *models.JobTemplate) bool { return c.HasRole(v.ReadRoleID) },
}

func (s *Server) jobTemplateDetail(w http.ResponseWriter, r *http.Request) error {
	_, t, err := jobTemplateObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	results, err := s.serializeJobTemplates(c, []*models.JobTemplate{t})
	if err != nil {
		return err
	}
	WriteJSON(w, 200, results[0])
	return nil
}

var jobTypeChoices = [][2]string{{"run", "Run"}, {"check", "Check"}}

// surveyVariableRe is a survey question's variable: an Ansible variable name.
var surveyVariableRe = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*$`)

var verbosityChoices = [][2]string{{"0", "0 (Normal)"}, {"1", "1 (Verbose)"}, {"2", "2 (More Verbose)"}, {"3", "3 (Debug)"}, {"4", "4 (Connection Debug)"}, {"5", "5 (WinRM Debug)"}}

// intChoice reads an integer field restricted to choices.
func (f *Form) intChoice(key string, current int64, choices [][2]string) int64 {
	v, ok := f.Body.Get(key)
	if !ok {
		return current
	}
	var sv string
	switch t := v.(type) {
	case json.Number:
		sv = t.String()
	case string:
		sv = t
	case float64:
		sv = fmt.Sprint(int64(t))
	case nil:
		f.Errs.Add(key, "This field may not be null.")
		return current
	default:
		f.Errs.Add(key, fmt.Sprintf("\"%v\" is not a valid choice.", v))
		return current
	}
	for _, ch := range choices {
		if ch[0] == sv {
			n := f.Int(key, current, nil, nil)
			return n
		}
	}
	f.Errs.Add(key, fmt.Sprintf("\"%s\" is not a valid choice.", sv))
	return current
}

func (s *Server) credentialExists(r *http.Request) func(int64) bool {
	return func(id int64) bool {
		_, ok := s.credentialKind(r, id)
		return ok
	}
}

// credentialChoiceOK validates a field that names a credential the
// object will put to work (a webhook token, a registry or cluster login):
// the credential must exist and, for a non-superuser choosing a new one,
// be one they may use, since its secret then goes wherever the object
// sends it. One the user may not use reads as one that does not exist, so
// ids cannot be probed. The credential already set stays acceptable, so
// editing other fields works for whoever may edit the object.
func (s *Server) credentialChoiceOK(ctx context.Context, current *int64) func(int64) bool {
	return func(id int64) bool {
		if !s.existsIn(ctx, "main_credential")(id) {
			return false
		}
		if current != nil && *current == id {
			return true
		}
		u := auth.UserFrom(ctx)
		if u == nil {
			return false
		}
		if u.IsSuperuser {
			return true
		}
		ok, err := rbac.UserHasRoleOn(ctx, s.Q(), u.ID, s.CT.ID("main.credential"), id, "use_role")
		return err == nil && ok
	}
}

// eeChoiceOK validates a field naming an execution environment: it must
// exist and, for a non-superuser choosing a new one, be one they can see
// (global, or in an organization they read), as check_related's
// read_role did. One they cannot see reads as one that does not exist.
// The one already set stays acceptable.
func (s *Server) eeChoiceOK(ctx context.Context, current *int64) func(int64) bool {
	return func(id int64) bool {
		var orgID *int64
		if err := s.Q().QueryRow(ctx, `SELECT organization_id FROM main_executionenvironment WHERE id = $1`, id).Scan(&orgID); err != nil {
			return false
		}
		if (current != nil && *current == id) || orgID == nil {
			return true
		}
		u := auth.UserFrom(ctx)
		if u == nil {
			return false
		}
		if u.IsSuperuser || u.IsSystemAuditor {
			return true
		}
		ok, err := rbac.UserHasRoleOn(ctx, s.Q(), u.ID, s.CT.ID("main.organization"), *orgID, "read_role")
		return err == nil && ok
	}
}

// projectPlaybookNames lists the playbooks of a project: the stored list for
// SCM projects, the checkout contents for manual ones (following links to
// directories when ASCENDER_SHOW_PLAYBOOK_LINKS is on).
func (s *Server) projectPlaybookNames(ctx context.Context, p *models.Project) []string {
	if p.SCMType != "" {
		return p.PlaybookFiles
	}
	return models.ProjectPlaybooks(models.ProjectPath(s.Cfg.ProjectsRoot, p.LocalPath), s.Settings.Bool(ctx, "ASCENDER_SHOW_PLAYBOOK_LINKS"))
}

// jobTemplateFromForm applies and validates the request body onto t, as
// JobTemplateSerializer, JobOptionsSerializer and JobTemplateMixin did.
func (s *Server) jobTemplateFromForm(r *http.Request, f *Form, t *models.JobTemplate, isNew bool) {
	initialService, initialKey := t.WebhookService, t.WebhookKey
	t.Name = f.String("name", true, 512, t.Name)
	t.Description = f.String("description", false, 0, t.Description)
	t.JobType = f.Choice("job_type", t.JobType, jobTypeChoices, false)
	t.Playbook = f.String("playbook", false, 1024, t.Playbook)
	t.SCMBranch = f.String("scm_branch", false, 1024, t.SCMBranch)
	zero := int64(0)
	t.Forks = f.Int("forks", t.Forks, &zero, nil)
	t.Limit = f.String("limit", false, 0, t.Limit)
	t.JobSlicePinnedHosts = f.String("job_slice_pinned_hosts", false, 0, t.JobSlicePinnedHosts)
	t.Verbosity = f.intChoice("verbosity", t.Verbosity, verbosityChoices)
	if f.Has("extra_vars") {
		ev := f.String("extra_vars", false, 0, t.ExtraVars)
		if err := ValidateVars(ev); err != nil {
			f.Errs.Add("extra_vars", err.Error())
		} else if m, _ := ParseVars(ev); refusesCiphertext(auth.UserFrom(r.Context()), m) {
			f.Errs.Add("extra_vars", encryptedValueMsg)
		} else {
			t.ExtraVars = ev
		}
	}
	t.JobTags = f.String("job_tags", false, 0, t.JobTags)
	t.ForceHandlers = f.Bool("force_handlers", t.ForceHandlers)
	t.SkipTags = f.String("skip_tags", false, 0, t.SkipTags)
	t.StartAtTask = f.String("start_at_task", false, 1024, t.StartAtTask)
	t.Timeout = f.Int("timeout", t.Timeout, nil, nil)
	t.UseFactCache = f.Bool("use_fact_cache", t.UseFactCache)
	t.HostConfigKey = f.String("host_config_key", false, 1024, t.HostConfigKey)
	t.AskSCMBranchOnLaunch = f.Bool("ask_scm_branch_on_launch", t.AskSCMBranchOnLaunch)
	t.AskDiffModeOnLaunch = f.Bool("ask_diff_mode_on_launch", t.AskDiffModeOnLaunch)
	t.AskVariablesOnLaunch = f.Bool("ask_variables_on_launch", t.AskVariablesOnLaunch)
	t.AskLimitOnLaunch = f.Bool("ask_limit_on_launch", t.AskLimitOnLaunch)
	t.AskTagsOnLaunch = f.Bool("ask_tags_on_launch", t.AskTagsOnLaunch)
	t.AskSkipTagsOnLaunch = f.Bool("ask_skip_tags_on_launch", t.AskSkipTagsOnLaunch)
	t.AskJobTypeOnLaunch = f.Bool("ask_job_type_on_launch", t.AskJobTypeOnLaunch)
	t.AskVerbosityOnLaunch = f.Bool("ask_verbosity_on_launch", t.AskVerbosityOnLaunch)
	t.AskInventoryOnLaunch = f.Bool("ask_inventory_on_launch", t.AskInventoryOnLaunch)
	t.AskCredentialOnLaunch = f.Bool("ask_credential_on_launch", t.AskCredentialOnLaunch)
	t.AskExecutionEnvironmentOnLaunch = f.Bool("ask_execution_environment_on_launch", t.AskExecutionEnvironmentOnLaunch)
	t.AskLabelsOnLaunch = f.Bool("ask_labels_on_launch", t.AskLabelsOnLaunch)
	t.AskForksOnLaunch = f.Bool("ask_forks_on_launch", t.AskForksOnLaunch)
	t.AskJobSliceCountOnLaunch = f.Bool("ask_job_slice_count_on_launch", t.AskJobSliceCountOnLaunch)
	t.AskTimeoutOnLaunch = f.Bool("ask_timeout_on_launch", t.AskTimeoutOnLaunch)
	t.AskInstanceGroupsOnLaunch = f.Bool("ask_instance_groups_on_launch", t.AskInstanceGroupsOnLaunch)
	t.SurveyEnabled = f.Bool("survey_enabled", t.SurveyEnabled)
	t.BecomeEnabled = f.Bool("become_enabled", t.BecomeEnabled)
	t.DiffMode = f.Bool("diff_mode", t.DiffMode)
	t.AllowSimultaneous = f.Bool("allow_simultaneous", t.AllowSimultaneous)
	t.JobSliceCount = f.Int("job_slice_count", t.JobSliceCount, &zero, nil)
	t.WebhookService = f.Choice("webhook_service", t.WebhookService, webhookServiceChoices, false)
	if f.Has("webhook_key") {
		t.WebhookKey = f.String("webhook_key", false, 64, t.WebhookKey)
	}
	t.PreventInstanceGroupFallback = f.Bool("prevent_instance_group_fallback", t.PreventInstanceGroupFallback)
	t.PreventRelaunch = f.Bool("prevent_relaunch", t.PreventRelaunch)
	if id, set := f.ID("inventory", t.InventoryID, false, s.existsIn(r.Context(), "main_inventory")); set {
		t.InventoryID = id
	}
	if id, set := f.ID("project", t.ProjectID, false, s.existsBy(r.Context(), "main_project", "unifiedjobtemplate_ptr_id")); set {
		t.ProjectID = id
	}
	if id, set := f.ID("execution_environment", t.ExecutionEnvironmentID, false, s.existsIn(r.Context(), "main_executionenvironment")); set {
		t.ExecutionEnvironmentID = id
	}
	if id, set := f.ID("webhook_credential", t.WebhookCredentialID, false, s.credentialChoiceOK(r.Context(), t.WebhookCredentialID)); set {
		t.WebhookCredentialID = id
	}
	if len(f.Errs) > 0 {
		return
	}
	// JobTemplateSerializer.validate
	if t.HostConfigKey != "" && t.InventoryID == nil {
		f.Errs.Add("host_config_key", "Cannot enable provisioning callback without an inventory set.")
		return
	}
	if t.ProjectID == nil {
		f.Errs.Add("project", "Job Templates must have a project assigned.")
		return
	}
	if t.InventoryID == nil && !t.AskInventoryOnLaunch {
		f.Errs.Add("inventory", "You must either set a default value or ask to prompt on launch.")
		return
	}
	// JobTemplateMixin.validate
	if f.Has("webhook_key") && t.WebhookKey != "" && t.WebhookService == "" {
		f.Errs.Add("webhook_key", "Cannot set a webhook key without a webhook service.")
		return
	}
	if t.WebhookCredentialID != nil {
		var kind, namespace string
		_ = db.Tolerant(s.Q()).QueryRow(r.Context(), `SELECT ct.kind, ct.namespace FROM main_credential c JOIN main_credentialtype ct ON ct.id = c.credential_type_id WHERE c.id = $1`, *t.WebhookCredentialID).Scan(&kind, &namespace)
		if kind != "token" {
			f.Errs.Add("webhook_credential", "Must be a Personal Access Token.")
			return
		}
		if t.WebhookService == "" || namespace != t.WebhookService+"_token" {
			f.Errs.Add("webhook_credential", "Must match the selected webhook service.")
			return
		}
	}
	// JobOptionsSerializer.validate
	p, err := models.GetProject(r.Context(), s.Q(), *t.ProjectID)
	if err != nil {
		f.Errs.Add("project", "Job Templates must have a project assigned.")
		return
	}
	if t.Playbook != "" {
		known := false
		for _, pb := range s.projectPlaybookNames(r.Context(), p) {
			if pb == t.Playbook {
				known = true
				break
			}
		}
		if !known && (p.SCMType == "" || !p.AllowOverride) {
			f.Errs.Add("playbook", "Playbook not found for project.")
			return
		}
	}
	if t.Playbook == "" {
		f.Errs.Add("playbook", "Must select playbook for project.")
		return
	}
	if t.SCMBranch != "" && !p.AllowOverride {
		f.Errs.Add("scm_branch", "Project does not allow overriding branch.")
		return
	}
	if t.AskSCMBranchOnLaunch && !p.AllowOverride {
		f.Errs.Add("ask_scm_branch_on_launch", "Project does not allow overriding branch.")
		return
	}
	// Model clean_forks.
	if max := s.Settings.Int(r.Context(), "MAX_FORKS"); max > 0 && t.Forks > max {
		f.Errs.Add("forks", fmt.Sprintf("Maximum number of forks (%d) exceeded.", max))
		return
	}
	// The organization follows the project.
	t.OrganizationID = p.OrganizationID
	t.WebhookKey = webhookKeyOnSave(isNew, initialService, initialKey, t.WebhookService, t.WebhookKey)
}

func (s *Server) jobTemplateNameTaken(r *http.Request, name string, org *int64, excludeID int64) (bool, error) {
	var ok bool
	if org == nil {
		if err := s.Q().QueryRow(r.Context(), `SELECT EXISTS (SELECT 1 FROM main_unifiedjobtemplate u JOIN main_jobtemplate t ON t.unifiedjobtemplate_ptr_id = u.id WHERE u.name = $1 AND u.organization_id IS NULL AND u.id <> $2)`, name, excludeID).Scan(&ok); err != nil {
			return false, err
		}
	} else {
		if err := s.Q().QueryRow(r.Context(), `SELECT EXISTS (SELECT 1 FROM main_unifiedjobtemplate u JOIN main_jobtemplate t ON t.unifiedjobtemplate_ptr_id = u.id WHERE u.name = $1 AND u.organization_id = $2 AND u.id <> $3)`, name, *org, excludeID).Scan(&ok); err != nil {
			return false, err
		}
	}
	return ok, nil
}

// nameRef renders the "<name>-<id>" reference of a related object the
// activity stream recorded, loading the name with sql.
// The changes are built inside the writer's transaction, so q is that
// transaction: a second pool connection there can deadlock the pool. A
// failed query aborts the transaction and the write with it; a row that
// is gone renders as "-<id>".
func (s *Server) nameRef(r *http.Request, q db.Querier, sql string, id *int64) any {
	return s.nameRefCtx(r.Context(), q, sql, id)
}

func (s *Server) nameRefCtx(ctx context.Context, q db.Querier, sql string, id *int64) any {
	if id == nil {
		return nil
	}
	var name string
	if err := q.QueryRow(ctx, sql, *id).Scan(&name); err != nil && !db.IsNoRows(err) {
		s.Log.ErrorContext(ctx, "activity stream name lookup", "id", *id, "err", err)
	}
	return activity.Ref(name, *id)
}

func (s *Server) jobTemplateChanges(r *http.Request, q db.Querier, t *models.JobTemplate) map[string]any {
	return map[string]any{
		"name": t.Name, "description": t.Description, "job_type": t.JobType,
		"inventory":                s.nameRef(r, q, `SELECT name FROM main_inventory WHERE id = $1`, t.InventoryID),
		"project":                  s.nameRef(r, q, `SELECT name FROM main_unifiedjobtemplate WHERE id = $1`, t.ProjectID),
		"playbook":                 t.Playbook,
		"scm_branch":               t.SCMBranch,
		"forks":                    t.Forks,
		"limit":                    t.Limit,
		"job_slice_pinned_hosts":   t.JobSlicePinnedHosts,
		"verbosity":                t.Verbosity,
		"extra_vars":               t.ExtraVars,
		"job_tags":                 t.JobTags,
		"force_handlers":           t.ForceHandlers,
		"skip_tags":                t.SkipTags,
		"start_at_task":            t.StartAtTask,
		"timeout":                  t.Timeout,
		"use_fact_cache":           t.UseFactCache,
		"organization":             s.nameRef(r, q, `SELECT name FROM main_organization WHERE id = $1`, t.OrganizationID),
		"execution_environment":    s.nameRef(r, q, `SELECT name FROM main_executionenvironment WHERE id = $1`, t.ExecutionEnvironmentID),
		"host_config_key":          t.HostConfigKey,
		"ask_scm_branch_on_launch": t.AskSCMBranchOnLaunch, "ask_diff_mode_on_launch": t.AskDiffModeOnLaunch, "ask_variables_on_launch": t.AskVariablesOnLaunch,
		"ask_limit_on_launch": t.AskLimitOnLaunch, "ask_tags_on_launch": t.AskTagsOnLaunch, "ask_skip_tags_on_launch": t.AskSkipTagsOnLaunch,
		"ask_job_type_on_launch": t.AskJobTypeOnLaunch, "ask_verbosity_on_launch": t.AskVerbosityOnLaunch, "ask_inventory_on_launch": t.AskInventoryOnLaunch,
		"ask_credential_on_launch": t.AskCredentialOnLaunch, "ask_execution_environment_on_launch": t.AskExecutionEnvironmentOnLaunch, "ask_labels_on_launch": t.AskLabelsOnLaunch,
		"ask_forks_on_launch": t.AskForksOnLaunch, "ask_job_slice_count_on_launch": t.AskJobSliceCountOnLaunch, "ask_timeout_on_launch": t.AskTimeoutOnLaunch,
		"ask_instance_groups_on_launch": t.AskInstanceGroupsOnLaunch, "survey_enabled": t.SurveyEnabled, "become_enabled": t.BecomeEnabled,
		"diff_mode": t.DiffMode, "allow_simultaneous": t.AllowSimultaneous, "job_slice_count": t.JobSliceCount, "webhook_service": t.WebhookService,
		"webhook_credential":              s.nameRef(r, q, `SELECT name FROM main_credential WHERE id = $1`, t.WebhookCredentialID),
		"prevent_instance_group_fallback": t.PreventInstanceGroupFallback, "prevent_relaunch": t.PreventRelaunch, "id": t.ID,
	}
}

// jobTemplateChangeAllowed mirrors JobTemplateAccess.can_change: admins may
// always change the non-sensitive fields; changing resources needs use
// access to the inventory and project and read access to the environment.
// jtNonSensitiveFields are changes_are_non_sensitive's allowed_fields:
// what a job template admin may change without access to the template's
// inventory and project. The ask_*_on_launch flags are non-sensitive too.
var jtNonSensitiveFields = map[string]bool{
	"name": true, "description": true, "forks": true, "limit": true, "verbosity": true, "extra_vars": true,
	"job_tags": true, "force_handlers": true, "skip_tags": true, "survey_enabled": true, "diff_mode": true,
	"timeout": true, "job_slice_count": true, "id": true,
}

// jobTemplateChangeAllowed is JobTemplateAccess.can_change past the admin
// check. A change to anything that decides what runs and where (the
// playbook, the branch, become, the callback key, ...) takes use of the
// template's inventory and project, current and new, as check_related
// with mandatory=True did: being made admin of a template does not hand
// over its inventory's hosts and credentials to run something else.
func (s *Server) jobTemplateChangeAllowed(c *SerCtx, before, after *models.JobTemplate, beforeChanges, afterChanges map[string]any) bool {
	if c.User.IsSuperuser {
		return true
	}
	same := func(a, b *int64) bool { return (a == nil && b == nil) || (a != nil && b != nil && *a == *b) }
	if !same(before.WebhookCredentialID, after.WebhookCredentialID) && after.WebhookCredentialID != nil && !c.HasRoleOn("main.credential", *after.WebhookCredentialID, "use_role") {
		return false
	}
	sensitive := !same(before.InventoryID, after.InventoryID) || !same(before.ProjectID, after.ProjectID) || !same(before.ExecutionEnvironmentID, after.ExecutionEnvironmentID)
	for k, v := range afterChanges {
		if jtNonSensitiveFields[k] || strings.HasPrefix(k, "ask_") {
			continue
		}
		if fmt.Sprint(beforeChanges[k]) != fmt.Sprint(v) {
			sensitive = true
			break
		}
	}
	if !sensitive {
		return true
	}
	// check_related('execution_environment', read_role): new and current
	// when it changes.
	if !same(before.ExecutionEnvironmentID, after.ExecutionEnvironmentID) {
		for _, id := range []*int64{before.ExecutionEnvironmentID, after.ExecutionEnvironmentID} {
			if id != nil && !s.eeReadable(c, *id) {
				return false
			}
		}
	}
	// check_related(inventory/project, use_role, mandatory when set): the
	// current one always, the new one when it changes.
	for _, pair := range []struct {
		ct            string
		before, after *int64
	}{{"main.inventory", before.InventoryID, after.InventoryID}, {"main.project", before.ProjectID, after.ProjectID}} {
		if pair.before != nil && !c.HasRoleOn(pair.ct, *pair.before, "use_role") {
			return false
		}
		if !same(pair.before, pair.after) && pair.after != nil && !c.HasRoleOn(pair.ct, *pair.after, "use_role") {
			return false
		}
	}
	return true
}

func (s *Server) jobTemplateCreate(w http.ResponseWriter, r *http.Request) error {
	u, err := RequireWrite(r)
	if err != nil {
		return err
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	f := NewForm(body, false)
	t := &models.JobTemplate{CreatedByID: &u.ID, ModifiedByID: &u.ID, JobType: "run", JobSliceCount: 1, SurveySpec: json.RawMessage("{}")}
	s.jobTemplateFromForm(r, f, t, true)
	if err := f.Err(); err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	if !u.IsSuperuser {
		if t.InventoryID != nil && !c.HasRoleOn("main.inventory", *t.InventoryID, "use_role") {
			return ErrForbidden
		}
		if t.ExecutionEnvironmentID != nil && !s.eeReadable(c, *t.ExecutionEnvironmentID) {
			return ErrForbidden
		}
		if t.ProjectID == nil || !c.HasRoleOn("main.project", *t.ProjectID, "use_role") {
			return ErrForbidden
		}
	}
	if v, err := s.jobTemplateNameTaken(r, t.Name, t.OrganizationID, 0); err != nil {
		return err
	} else if v {
		return FieldErrors{"__all__": {"JobTemplate with this (name, organization) combination already exists."}}.Err()
	}
	ctx := r.Context()
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if err := models.InsertJobTemplate(ctx, tx, t, s.CT, s.Roles, s.orgLookup(r, tx), s.inventoryOrgLookup(r, tx)); err != nil {
			return err
		}
		if err := s.Activity.Record(ctx, tx, activity.Entry{Operation: "create", Object1: "job_template", Changes: s.jobTemplateChanges(r, tx, t), ActorID: &u.ID, Links: map[string]int64{"job_template": t.ID, "unified_job_template": t.ID}}); err != nil {
			return err
		}
		// The creator gets admin on the template, as JobTemplateList.post did.
		return s.addAdminMember(ctx, tx, u, *t.AdminRoleID, u.ID)
	})
	if err != nil {
		return err
	}
	results, err := s.serializeJobTemplates(c, []*models.JobTemplate{t})
	if err != nil {
		return err
	}
	w.Header().Set("Location", URLFor("job_templates", t.ID))
	WriteJSON(w, http.StatusCreated, results[0])
	return nil
}

// inventoryOrgLookup resolves an inventory's organization for role parents.
func (s *Server) inventoryOrgLookup(r *http.Request, q db.Querier) func(int64) *int64 {
	return func(id int64) *int64 {
		var org *int64
		if err := q.QueryRow(r.Context(), `SELECT organization_id FROM main_inventory WHERE id = $1`, id).Scan(&org); err != nil {
			return nil
		}
		return org
	}
}

func (s *Server) jobTemplateUpdate(w http.ResponseWriter, r *http.Request) error {
	u, t, err := jobTemplateObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	if !c.HasRole(t.AdminRoleID) {
		return ErrForbidden
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	before := *t
	beforeChanges := s.jobTemplateChanges(r, s.Q(), t)
	f := NewForm(body, r.Method == http.MethodPatch)
	s.jobTemplateFromForm(r, f, t, false)
	if err := f.Err(); err != nil {
		return err
	}
	if !s.jobTemplateChangeAllowed(c, &before, t, beforeChanges, s.jobTemplateChanges(r, s.Q(), t)) {
		return ErrForbidden
	}
	if v, err := s.jobTemplateNameTaken(r, t.Name, t.OrganizationID, t.ID); err != nil {
		return err
	} else if v {
		return FieldErrors{"__all__": {"JobTemplate with this (name, organization) combination already exists."}}.Err()
	}
	t.ModifiedByID = &u.ID
	same := func(a, b *int64) bool { return (a == nil && b == nil) || (a != nil && b != nil && *a == *b) }
	ctx := r.Context()
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if err := models.UpdateJobTemplate(ctx, tx, t, s.orgLookup(r, tx), s.inventoryOrgLookup(r, tx), !same(before.OrganizationID, t.OrganizationID), !same(before.InventoryID, t.InventoryID)); err != nil {
			return err
		}
		changes := diffChanges(beforeChanges, s.jobTemplateChanges(r, tx, t))
		if len(changes) == 0 {
			return nil
		}
		return s.Activity.Record(ctx, tx, activity.Entry{Operation: "update", Object1: "job_template", Changes: changes, ActorID: &u.ID, Links: map[string]int64{"job_template": t.ID, "unified_job_template": t.ID}})
	})
	if err != nil {
		return err
	}
	results, err := s.serializeJobTemplates(c, []*models.JobTemplate{t})
	if err != nil {
		return err
	}
	WriteJSON(w, 200, results[0])
	return nil
}

func (s *Server) jobTemplateDelete(w http.ResponseWriter, r *http.Request) error {
	u, t, err := jobTemplateObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	if !c.HasRole(t.AdminRoleID) {
		return ErrForbidden
	}
	ctx := r.Context()
	// RelatedJobsPreventDeleteMixin
	if err := s.checkRelatedActiveJobs(ctx, templateJobsCond, t.ID); err != nil {
		return err
	}
	changes := s.jobTemplateChanges(r, s.Q(), t)
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if err := s.Activity.Record(ctx, tx, activity.Entry{Operation: "delete", Object1: "job_template", Changes: changes, ActorID: &u.ID}); err != nil {
			return err
		}
		return models.DeleteJobTemplate(ctx, tx, t, s.CT, s.Cascade)
	})
	if err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// --- copy ------------------------------------------------------------------

// errJobTemplateCopyCredentials is can_copy_related's refusal.
var errJobTemplateCopyCredentials = Detail(http.StatusForbidden, "Insufficient access to Job Template credentials.")

// jobTemplateForCopy loads the template with CopyAPIView's checks: nil when
// the copy is allowed, otherwise the refusal POST answers with (can_add's
// generic one, then can_copy_related's).
func (s *Server) jobTemplateForCopy(r *http.Request) (*models.JobTemplate, *SerCtx, *APIError, error) {
	_, t, err := jobTemplateObj.fromPath(s, r, false)
	if err != nil {
		return nil, nil, nil, err
	}
	c := s.NewSerCtx(r, true)
	if !s.jobTemplateCanAddCopy(c, t) {
		return t, c, ErrForbidden, nil
	}
	creds, err := models.TemplateCredentials(r.Context(), s.Q(), []int64{t.ID})
	if err != nil {
		return nil, nil, nil, err
	}
	if !s.jobTemplateCanCopyCredentials(c, creds[t.ID]) {
		return t, c, errJobTemplateCopyCredentials, nil
	}
	return t, c, nil, nil
}

func (s *Server) jobTemplateCopyView(w http.ResponseWriter, r *http.Request) error {
	_, _, refused, err := s.jobTemplateForCopy(r)
	if err != nil {
		return err
	}
	WriteJSON(w, 200, NewOMap().Set("can_copy", refused == nil))
	return nil
}

func (s *Server) jobTemplateCopy(w http.ResponseWriter, r *http.Request) error {
	if _, err := RequireWrite(r); err != nil {
		return err
	}
	t, c, refused, err := s.jobTemplateForCopy(r)
	if err != nil {
		return err
	}
	if refused != nil {
		return refused
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	name, err := copyName(body, t.Name)
	if err != nil {
		return err
	}
	u := c.User
	n := *t
	n.Name = name
	n.CreatedByID = &u.ID
	n.ModifiedByID = &u.ID
	// webhook_key is discarded at copy, and WebhookTemplateMixin.save gave
	// a new template with a service a key of its own.
	n.WebhookKey = ""
	if n.WebhookService != "" {
		n.WebhookKey = newWebhookKey()
	}
	// The copier becomes the copy's admin, may read and rotate its webhook
	// key and so sign a delivery naming any status URL, where the webhook
	// credential's token is then posted: it goes with the copy only for a
	// user who may use it, as setting it on a template requires. (The old
	// application copied it unconditionally.)
	if n.WebhookCredentialID != nil && !u.IsSuperuser && !c.HasRoleOn("main.credential", *n.WebhookCredentialID, "use_role") {
		n.WebhookCredentialID = nil
	}
	n.LastJobID, n.CurrentJobID, n.NextScheduleID = nil, nil, nil
	n.LastJobRun, n.NextJobRun = nil, nil
	n.LastJobFailed = false
	n.Status = "never updated"
	n.AdminRoleID, n.ExecuteRoleID, n.ReadRoleID = nil, nil, nil
	ctx := r.Context()
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if err := models.InsertJobTemplate(ctx, tx, &n, s.CT, s.Roles, s.orgLookup(r, tx), s.inventoryOrgLookup(r, tx)); err != nil {
			return err
		}
		for _, sql := range []string{
			`INSERT INTO main_unifiedjobtemplate_labels (unifiedjobtemplate_id, label_id) SELECT $2, label_id FROM main_unifiedjobtemplate_labels WHERE unifiedjobtemplate_id = $1 ORDER BY id`,
			`INSERT INTO main_unifiedjobtemplate_credentials (unifiedjobtemplate_id, credential_id) SELECT $2, credential_id FROM main_unifiedjobtemplate_credentials WHERE unifiedjobtemplate_id = $1 ORDER BY id`,
			`INSERT INTO main_unifiedjobtemplateinstancegroupmembership (position, instancegroup_id, unifiedjobtemplate_id) SELECT position, instancegroup_id, $2 FROM main_unifiedjobtemplateinstancegroupmembership WHERE unifiedjobtemplate_id = $1 ORDER BY position`,
		} {
			if _, err := tx.Exec(ctx, sql, t.ID, n.ID); err != nil {
				return err
			}
		}
		if err := s.Activity.Record(ctx, tx, activity.Entry{Operation: "create", Object1: "job_template", Changes: s.jobTemplateChanges(r, tx, &n), ActorID: &u.ID, Links: map[string]int64{"job_template": n.ID, "unified_job_template": n.ID}}); err != nil {
			return err
		}
		return s.addAdminMember(ctx, tx, u, *n.AdminRoleID, u.ID)
	})
	if err != nil {
		return err
	}
	results, err := s.serializeJobTemplates(c, []*models.JobTemplate{&n})
	if err != nil {
		return err
	}
	w.Header().Set("Location", URLFor("job_templates", n.ID))
	WriteJSON(w, http.StatusCreated, results[0])
	return nil
}

// --- webhook key -------------------------------------------------------------

func (s *Server) jobTemplateWebhookKey(w http.ResponseWriter, r *http.Request) error {
	_, t, err := jobTemplateObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	if !c.HasRole(t.AdminRoleID) {
		return ErrForbidden
	}
	if r.Method == http.MethodPost {
		if _, err := RequireWrite(r); err != nil {
			return err
		}
		t.WebhookKey = newWebhookKey()
		if _, err := s.Q().Exec(r.Context(), `UPDATE main_jobtemplate SET webhook_key = $2 WHERE unifiedjobtemplate_ptr_id = $1`, t.ID, t.WebhookKey); err != nil {
			return err
		}
		WriteJSON(w, http.StatusCreated, NewOMap().Set("webhook_key", t.WebhookKey))
		return nil
	}
	WriteJSON(w, 200, NewOMap().Set("webhook_key", t.WebhookKey))
	return nil
}

// --- survey spec -------------------------------------------------------------

func (s *Server) jobTemplateSurveySpec(w http.ResponseWriter, r *http.Request) error {
	_, t, err := jobTemplateObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	spec := NewOMap()
	if err := spec.UnmarshalJSON(t.SurveySpec); err != nil || spec.Len() == 0 {
		WriteJSON(w, 200, map[string]any{})
		return nil
	}
	// Order is the stored order; only password defaults are masked.
	if items, ok := spec.Get("spec"); ok {
		if list, ok := items.([]any); ok {
			for _, it := range list {
				if m, ok := it.(*OMap); ok {
					if tv, _ := m.Get("type"); tv == "password" {
						if d, ok := m.Get("default"); ok && d != nil && d != "" {
							m.Set("default", "$encrypted$")
						}
					}
				}
			}
		}
	}
	WriteJSON(w, 200, spec)
	return nil
}

var surveyTypeLabels = []string{"text", "textarea", "password", "multiplechoice", "multiselect", "integer", "float"}

func surveyErr(msg string) error {
	return &APIError{Status: http.StatusBadRequest, Body: map[string]any{"error": msg}}
}

func isInt(v any) bool {
	switch t := v.(type) {
	case json.Number:
		_, err := t.Int64()
		return err == nil
	case float64:
		return t == float64(int64(t))
	case int64, int:
		return true
	}
	return false
}

func isNumber(v any) bool {
	switch v.(type) {
	case json.Number, float64, int64, int:
		return true
	}
	return false
}

// validateSurveySpec reproduces JobTemplateSurveySpec._validate_spec_data,
// rewriting the spec in place (choices/default normalisation, encrypted
// defaults) and returning the first error.
func (s *Server) validateSurveySpec(newSpec *OMap, old map[string]any) error {
	for _, chk := range []struct{ field, label string }{{"name", "string"}, {"description", "string"}, {"spec", "list of items"}} {
		v, ok := newSpec.Get(chk.field)
		if !ok {
			return surveyErr(fmt.Sprintf("Field '%s' is missing from survey spec.", chk.field))
		}
		bad := false
		if chk.field == "spec" {
			_, isList := v.([]any)
			bad = !isList
		} else {
			_, isStr := v.(string)
			bad = !isStr
		}
		if bad {
			return surveyErr(fmt.Sprintf("Expected %s for field '%s', received %s type.", chk.label, chk.field, pyTypeName(v)))
		}
	}
	items, _ := newSpec.Get("spec")
	list, _ := items.([]any)
	if len(list) < 1 {
		return surveyErr("'spec' doesn't contain any items.")
	}
	oldPivot := map[string]map[string]any{}
	if oldItems, ok := old["spec"].([]any); ok {
		for _, it := range oldItems {
			if m, ok := it.(map[string]any); ok {
				if v, ok := m["variable"].(string); ok {
					oldPivot[v] = m
				}
			}
		}
	}
	seen := map[string]bool{}
	for idx, it := range list {
		item, ok := it.(*OMap)
		if !ok {
			return surveyErr(fmt.Sprintf("Survey question %d is not a json object.", idx))
		}
		for _, fn := range []string{"type", "question_name", "variable", "required"} {
			v, ok := item.Get(fn)
			if !ok {
				return surveyErr(fmt.Sprintf("'%s' missing from survey question %d", fn, idx))
			}
			if fn == "required" {
				if _, ok := v.(bool); !ok {
					return surveyErr(fmt.Sprintf("'%s' in survey question %d expected to be boolean.", fn, idx))
				}
			} else if _, ok := v.(string); !ok {
				return surveyErr(fmt.Sprintf("'%s' in survey question %d expected to be string.", fn, idx))
			}
		}
		variable, _ := item.Get("variable")
		vs := variable.(string)
		// The answer becomes an extra var of that name, and the name is
		// also written into pages (survey forms, job details): only a name
		// Ansible could use as a variable.
		if !surveyVariableRe.MatchString(vs) {
			return surveyErr(fmt.Sprintf("'variable' '%s' in survey question %d is not a valid variable name: use letters, digits and underscores, not starting with a digit.", vs, idx))
		}
		if seen[vs] {
			return surveyErr(fmt.Sprintf("'variable' '%s' duplicated in survey question %d.", vs, idx))
		}
		seen[vs] = true
		qtRaw, _ := item.Get("type")
		qtype := qtRaw.(string)
		known := false
		for _, t := range surveyTypeLabels {
			if t == qtype {
				known = true
			}
		}
		if !known {
			return surveyErr(fmt.Sprintf("'%s' in survey question %d is not one of '%s' allowed question types.", qtype, idx, strings.Join(surveyTypeLabels, ", ")))
		}
		if d, ok := item.Get("default"); ok && d != "" {
			typeOK := false
			switch qtype {
			case "integer":
				typeOK = isInt(d)
			case "float":
				typeOK = isNumber(d)
			default:
				_, typeOK = d.(string)
			}
			if !typeOK {
				label := "string"
				if qtype == "integer" || qtype == "float" {
					label = qtype
				}
				return surveyErr(fmt.Sprintf("Default value %s in survey question %d expected to be %s.", pyRepr(plainValue(d)), idx, label))
			}
		}
		for _, key := range []string{"min", "max"} {
			if v, ok := item.Get(key); ok && v != nil && !isInt(v) {
				return surveyErr(fmt.Sprintf("The %s limit in survey question %d expected to be integer.", key, idx))
			}
		}
		if qtype == "multiselect" || qtype == "multiplechoice" {
			choicesRaw, ok := item.Get("choices")
			if !ok {
				return surveyErr(fmt.Sprintf("Survey question %d of type %s must specify choices.", idx, qtype))
			}
			var choiceList []string
			switch ch := choicesRaw.(type) {
			case string:
				for _, line := range strings.Split(ch, "\n") {
					if strings.TrimSpace(line) != "" {
						choiceList = append(choiceList, line)
					}
				}
				item.Set("choices", strings.Join(choiceList, "\n"))
			case []any:
				for _, x := range ch {
					choiceList = append(choiceList, fmt.Sprint(x))
				}
			}
			if d, ok := item.Get("default"); ok {
				var defaults []string
				switch dv := d.(type) {
				case string:
					var kept []string
					for _, line := range strings.Split(dv, "\n") {
						if strings.TrimSpace(line) != "" {
							kept = append(kept, line)
						}
					}
					item.Set("default", strings.Join(kept, "\n"))
					defaults = kept
				case []any:
					for _, x := range dv {
						defaults = append(defaults, fmt.Sprint(x))
					}
				}
				if qtype == "multiplechoice" && len(defaults) > 1 {
					return surveyErr("Multiple Choice (Single Select) can only have one default value.")
				}
				for _, dflt := range defaults {
					found := false
					for _, ch := range choiceList {
						if ch == dflt {
							found = true
						}
					}
					if !found {
						return surveyErr("Default choice must be answered from the choices listed.")
					}
				}
			}
		}
		if d, ok := item.Get("default"); ok {
			if ds, isStr := d.(string); isStr && strings.HasPrefix(ds, "$encrypted$") {
				if qtype != "password" {
					return surveyErr(fmt.Sprintf("$encrypted$ is a reserved keyword for password question defaults, survey question %d is type %s.", idx, qtype))
				}
				oldElement := oldPivot[vs]
				existing := false
				if oldDefault, ok := oldElement["default"]; ok {
					if od, isStr := oldDefault.(string); isStr && (strings.HasPrefix(od, "$encrypted$") || od == "") {
						existing = true
					}
				}
				if !existing {
					return surveyErr(fmt.Sprintf("$encrypted$ is a reserved keyword, may not be used for new default in position %d.", idx))
				}
				item.Set("default", oldElement["default"])
			} else if qtype == "password" {
				if ds, isStr := d.(string); isStr {
					enc, err := s.encryptSurveyDefault(ds)
					if err != nil {
						return err
					}
					item.Set("default", enc)
				}
			}
		}
	}
	return nil
}

func (s *Server) jobTemplateSurveySpecSave(w http.ResponseWriter, r *http.Request) error {
	_, t, err := jobTemplateObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	if !c.HasRole(t.AdminRoleID) {
		return ErrForbidden
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	if err := s.validateSurveySpec(body, t.SurveySpecMap()); err != nil {
		return err
	}
	raw, err := json.Marshal(body)
	if err != nil {
		return err
	}
	if err := models.UpdateJobTemplateSurvey(r.Context(), s.Q(), t.ID, raw); err != nil {
		return err
	}
	WriteJSON(w, 200, nil)
	return nil
}

func (s *Server) jobTemplateSurveySpecDelete(w http.ResponseWriter, r *http.Request) error {
	_, t, err := jobTemplateObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	if !c.HasRole(t.AdminRoleID) {
		return ErrForbidden
	}
	if err := models.UpdateJobTemplateSurvey(r.Context(), s.Q(), t.ID, json.RawMessage("{}")); err != nil {
		return err
	}
	WriteJSON(w, 200, nil)
	return nil
}

// relaunchPrevented reports whether the template behind a job turned
// relaunch off; orphaned jobs keep the protection they had.
func (s *Server) relaunchPrevented(r *http.Request, jb *models.Job) bool {
	if jb.JobTemplateID != nil {
		var prevent bool
		if err := s.Q().QueryRow(r.Context(), `SELECT prevent_relaunch FROM main_jobtemplate WHERE unifiedjobtemplate_ptr_id = $1`, *jb.JobTemplateID).Scan(&prevent); err == nil {
			return prevent
		}
	}
	return jb.PreventRelaunch
}

// elapsedNow is the running elapsed time the old serializer computed for
// unfinished jobs.
func elapsedNow(j *models.UnifiedJob) float64 {
	if j.Started != nil && j.Finished == nil {
		return float64(time.Since(*j.Started).Microseconds()) / 1e6
	}
	return j.Elapsed
}
