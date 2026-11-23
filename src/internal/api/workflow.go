package api

import (
	"encoding/json"
	"net/http"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/auth"
	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/models"
)

// Workflow job templates and workflow jobs are read-only in this
// implementation: the lists, details and nodes the UI shows are served, the
// editor and the workflow engine are not ported yet.

func workflowJobTemplateFieldsAlias(ujt, wt string) *FieldSet {
	return &FieldSet{
		Model: "WorkflowJobTemplate",
		Fields: map[string]Field{
			"id": {SQL: ujt + ".id", Kind: KindInt}, "name": {SQL: ujt + ".name"}, "description": {SQL: ujt + ".description"},
			"created": {SQL: ujt + ".created", Kind: KindDateTime}, "modified": {SQL: ujt + ".modified", Kind: KindDateTime},
			"last_job_failed": {SQL: ujt + ".last_job_failed", Kind: KindBool}, "last_job_run": {SQL: ujt + ".last_job_run", Kind: KindDateTime},
			"next_job_run": {SQL: ujt + ".next_job_run", Kind: KindDateTime}, "status": {SQL: ujt + ".status"},
			"extra_vars": {SQL: wt + ".extra_vars", NoFilter: true}, "survey_enabled": {SQL: wt + ".survey_enabled", Kind: KindBool}, "allow_simultaneous": {SQL: wt + ".allow_simultaneous", Kind: KindBool},
			"ask_variables_on_launch": {SQL: wt + ".ask_variables_on_launch", Kind: KindBool}, "ask_inventory_on_launch": {SQL: wt + ".ask_inventory_on_launch", Kind: KindBool},
			"ask_limit_on_launch": {SQL: wt + ".ask_limit_on_launch", Kind: KindBool}, "ask_scm_branch_on_launch": {SQL: wt + ".ask_scm_branch_on_launch", Kind: KindBool},
			"ask_labels_on_launch": {SQL: wt + ".ask_labels_on_launch", Kind: KindBool}, "ask_skip_tags_on_launch": {SQL: wt + ".ask_skip_tags_on_launch", Kind: KindBool},
			"ask_tags_on_launch": {SQL: wt + ".ask_tags_on_launch", Kind: KindBool}, "webhook_service": {SQL: wt + ".webhook_service"}, "webhook_key": {SQL: wt + ".webhook_key", NoFilter: true},
			"allow_overwrite_flow_vars_on_relaunch": {SQL: wt + ".allow_overwrite_flow_vars_on_relaunch", Kind: KindBool},
			"allow_force_node_success_on_relaunch":  {SQL: wt + ".allow_force_node_success_on_relaunch", Kind: KindBool},
			"organization":                          {SQL: ujt + ".organization_id", Kind: KindFK, Rel: &Relation{Alias: "o", Join: "LEFT JOIN main_organization o ON o.id = " + ujt + ".organization_id", Target: func() *FieldSet { return organizationFields }}},
			"inventory":                             {SQL: wt + ".inventory_id", Kind: KindFK, Rel: &Relation{Alias: "winv", Join: "LEFT JOIN main_inventory winv ON winv.id = " + wt + ".inventory_id", Target: func() *FieldSet { return inventoryFieldsAlias("winv") }}},
			"created_by":                            {SQL: ujt + ".created_by_id", Kind: KindFK, Rel: &Relation{Alias: "cb", Join: "LEFT JOIN auth_user cb ON cb.id = " + ujt + ".created_by_id", Target: func() *FieldSet { return userFieldsAlias("cb") }}},
			"modified_by":                           {SQL: ujt + ".modified_by_id", Kind: KindFK, Rel: &Relation{Alias: "mb", Join: "LEFT JOIN auth_user mb ON mb.id = " + ujt + ".modified_by_id", Target: func() *FieldSet { return userFieldsAlias("mb") }}},
			"last_job":                              {SQL: ujt + ".last_job_id", Kind: KindFK, Rel: &Relation{Alias: "lj", Join: "LEFT JOIN main_unifiedjob lj ON lj.id = " + ujt + ".last_job_id", Target: func() *FieldSet { return unifiedJobFieldsAlias("lj") }}},
			"webhook_credential":                    {SQL: wt + ".webhook_credential_id", Kind: KindFK},
			"labels":                                {SQL: "wtl.label_id", Kind: KindFK, Rel: &Relation{Alias: "wtl", Join: "LEFT JOIN main_unifiedjobtemplate_labels wtl ON wtl.unifiedjobtemplate_id = " + ujt + ".id LEFT JOIN main_label wtlabel ON wtlabel.id = wtl.label_id", Target: func() *FieldSet { return labelFieldSet("wtlabel") }, Many: true}},
			"polymorphic_ctype":                     {SQL: ujt + ".polymorphic_ctype_id", Kind: KindFK},
		},
		SearchFields: []string{"description", "name"},
	}
}

func workflowJobFieldsAlias(uj, wj string) *FieldSet {
	return &FieldSet{
		Model: "WorkflowJob",
		Fields: map[string]Field{
			"id": {SQL: uj + ".id", Kind: KindInt}, "name": {SQL: uj + ".name"}, "description": {SQL: uj + ".description"},
			"created": {SQL: uj + ".created", Kind: KindDateTime}, "modified": {SQL: uj + ".modified", Kind: KindDateTime},
			"launch_type": {SQL: uj + ".launch_type"}, "status": {SQL: uj + ".status"}, "failed": {SQL: uj + ".failed", Kind: KindBool},
			"started": {SQL: uj + ".started", Kind: KindDateTime}, "finished": {SQL: uj + ".finished", Kind: KindDateTime},
			"canceled_on": {SQL: uj + ".canceled_on", Kind: KindDateTime}, "elapsed": {SQL: uj + ".elapsed", Kind: KindInt},
			"job_explanation": {SQL: uj + ".job_explanation"}, "work_unit_id": {SQL: uj + ".work_unit_id"},
			"extra_vars": {SQL: wj + ".extra_vars", NoFilter: true}, "allow_simultaneous": {SQL: wj + ".allow_simultaneous", Kind: KindBool},
			"is_sliced_job": {SQL: wj + ".is_sliced_job", Kind: KindBool}, "webhook_service": {SQL: wj + ".webhook_service"}, "webhook_guid": {SQL: wj + ".webhook_guid"},
			"workflow_job_template": {SQL: wj + ".workflow_job_template_id", Kind: KindFK, Rel: &Relation{Alias: "wjt", Join: "LEFT JOIN main_workflowjobtemplate wjt ON wjt.unifiedjobtemplate_ptr_id = " + wj + ".workflow_job_template_id LEFT JOIN main_unifiedjobtemplate wjujt ON wjujt.id = wjt.unifiedjobtemplate_ptr_id", Target: func() *FieldSet { return workflowJobTemplateFieldsAlias("wjujt", "wjt") }}},
			"job_template":          {SQL: wj + ".job_template_id", Kind: KindFK},
			"inventory":             {SQL: wj + ".inventory_id", Kind: KindFK, Rel: &Relation{Alias: "winv", Join: "LEFT JOIN main_inventory winv ON winv.id = " + wj + ".inventory_id", Target: func() *FieldSet { return inventoryFieldsAlias("winv") }}},
			"unified_job_template":  {SQL: uj + ".unified_job_template_id", Kind: KindFK, Rel: &Relation{Alias: "ujt2", Join: "LEFT JOIN main_unifiedjobtemplate ujt2 ON ujt2.id = " + uj + ".unified_job_template_id", Target: func() *FieldSet { return unifiedJobTemplateFieldsAlias("ujt2") }}},
			"organization":          {SQL: uj + ".organization_id", Kind: KindFK, Rel: &Relation{Alias: "o", Join: "LEFT JOIN main_organization o ON o.id = " + uj + ".organization_id", Target: func() *FieldSet { return organizationFields }}},
			"created_by":            {SQL: uj + ".created_by_id", Kind: KindFK, Rel: &Relation{Alias: "cb", Join: "LEFT JOIN auth_user cb ON cb.id = " + uj + ".created_by_id", Target: func() *FieldSet { return userFieldsAlias("cb") }}},
			"modified_by":           {SQL: uj + ".modified_by_id", Kind: KindFK, Rel: &Relation{Alias: "mb", Join: "LEFT JOIN auth_user mb ON mb.id = " + uj + ".modified_by_id", Target: func() *FieldSet { return userFieldsAlias("mb") }}},
			"schedule":              {SQL: uj + ".schedule_id", Kind: KindFK},
			"labels":                {SQL: "wjl.label_id", Kind: KindFK, Rel: &Relation{Alias: "wjl", Join: "LEFT JOIN main_unifiedjob_labels wjl ON wjl.unifiedjob_id = " + uj + ".id LEFT JOIN main_label wjlabel ON wjlabel.id = wjl.label_id", Target: func() *FieldSet { return labelFieldSet("wjlabel") }, Many: true}},
			"polymorphic_ctype":     {SQL: uj + ".polymorphic_ctype_id", Kind: KindFK},
		},
		SearchFields: []string{"description", "name"},
	}
}

var workflowJobTemplateFields, workflowJobFields *FieldSet

func init() {
	workflowJobTemplateFields = workflowJobTemplateFieldsAlias("ujt", "wt")
	workflowJobFields = workflowJobFieldsAlias("uj", "wj")
	resourceRegistrars = append(resourceRegistrars, (*Server).registerWorkflows)
}

func (s *Server) registerWorkflows(mux *http.ServeMux) {
	s.route(mux, "/api/v2/workflow_job_templates/{$}", methodMap{"GET": s.workflowJobTemplateList, "POST": s.workflowJobTemplateCreate}, s.optionsFor("workflow_job_templates"))
	s.route(mux, "/api/v2/workflow_job_templates/{id}/{$}", methodMap{"GET": s.workflowJobTemplateDetail, "PUT": s.workflowJobTemplateUpdate, "PATCH": s.workflowJobTemplateUpdate, "DELETE": s.workflowJobTemplateDelete}, s.optionsFor("workflow_job_templates"))
	s.registerWorkflowTemplateWrites(mux)
	s.registerWorkflowNodes(mux)
	s.registerWorkflowApprovals(mux)
	s.route(mux, "/api/v2/workflow_job_templates/{id}/workflow_jobs/{$}", methodMap{"GET": s.workflowJobTemplateJobs}, s.optionsFor("workflow_jobs"))
	s.route(mux, "/api/v2/workflow_job_templates/{id}/labels/{$}", methodMap{"GET": s.workflowJobTemplateLabels, "POST": s.workflowJobTemplateLabelsAttach}, nil)
	s.route(mux, "/api/v2/workflow_job_templates/{id}/object_roles/{$}", methodMap{"GET": s.objectRolesRoute("main.workflowjobtemplate", workflowJobTemplateObj.parentCheck(s))}, nil)
	s.route(mux, "/api/v2/workflow_job_templates/{id}/schedules/{$}", methodMap{"GET": s.workflowJobTemplateSchedules, "POST": s.workflowJobTemplateScheduleCreate}, s.optionsFor("schedules"))
	s.route(mux, "/api/v2/workflow_jobs/{$}", methodMap{"GET": s.workflowJobList}, s.optionsFor("workflow_jobs"))
	s.route(mux, "/api/v2/workflow_jobs/{id}/{$}", methodMap{"GET": s.workflowJobDetail, "DELETE": s.workflowJobDelete}, s.optionsFor("workflow_jobs"))
	s.route(mux, "/api/v2/workflow_jobs/{id}/workflow_nodes/{$}", methodMap{"GET": s.workflowJobNodes}, nil)
	s.route(mux, "/api/v2/workflow_jobs/{id}/labels/{$}", methodMap{"GET": s.workflowJobLabels}, nil)
	s.route(mux, "/api/v2/workflow_jobs/{id}/cancel/{$}", methodMap{"GET": s.workflowJobCancelView, "POST": s.workflowJobCancel}, nil)
	s.route(mux, "/api/v2/workflow_jobs/{id}/relaunch/{$}", methodMap{"GET": s.workflowJobRelaunchView, "POST": s.workflowJobRelaunch}, s.optionsExact("workflow_job_relaunch"))
	s.route(mux, "/api/v2/organizations/{id}/workflow_job_templates/{$}", methodMap{"GET": s.organizationWorkflowJobTemplates}, s.optionsFor("workflow_job_templates"))
}

// --- workflow job templates --------------------------------------------------

func (s *Server) workflowJobTemplateAccess(q *Query, u *auth.User) {
	s.AccessibleFilter(q, u, "ujt.id", "main.workflowjobtemplate", "read_role")
}

func (s *Server) workflowJobTemplateList(w http.ResponseWriter, r *http.Request) error {
	return s.workflowJobTemplateListWith(w, r, nil)
}

func (s *Server) organizationWorkflowJobTemplates(w http.ResponseWriter, r *http.Request) error {
	_, o, err := organizationObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	return s.workflowJobTemplateListWith(w, r, func(q *Query) { q.And("ujt.organization_id = " + q.Arg(o.ID)) })
}

func (s *Server) workflowJobTemplateListWith(w http.ResponseWriter, r *http.Request, extra func(q *Query)) error {
	spec := ListSpec{Model: "WorkflowJobTemplate", From: models.WorkflowJobTemplateFrom, Columns: models.WorkflowJobTemplateColumns, PK: "ujt.id", Fields: workflowJobTemplateFields, DefaultOrder: []string{"name"}, Access: s.workflowJobTemplateAccess}
	spec.RoleLevel = "main.workflowjobtemplate"
	ts, count, page, err := runListOf(s, r, spec, extra, models.ScanWorkflowJobTemplate)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, false)
	results, err := s.serializeWorkflowJobTemplates(c, ts)
	if err != nil {
		return err
	}
	WriteJSON(w, 200, Paginate(r, page, count, results))
	return nil
}

// workflowJobTemplateObj is a workflow job template.
var workflowJobTemplateObj = &pathObject[*models.WorkflowJobTemplate]{
	model:    "WorkflowJobTemplate",
	get:      models.GetWorkflowJobTemplate,
	readable: func(c *SerCtx, v *models.WorkflowJobTemplate) bool { return c.HasRole(v.ReadRoleID) },
}

func (s *Server) workflowJobTemplateDetail(w http.ResponseWriter, r *http.Request) error {
	_, t, err := workflowJobTemplateObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	results, err := s.serializeWorkflowJobTemplates(c, []*models.WorkflowJobTemplate{t})
	if err != nil {
		return err
	}
	WriteJSON(w, 200, results[0])
	return nil
}

func (s *Server) serializeWorkflowJobTemplates(c *SerCtx, ts []*models.WorkflowJobTemplate) ([]any, error) {
	var userIDs, orgIDs, jobIDs, invIDs, ids []int64
	for _, t := range ts {
		ids = append(ids, t.ID)
		userIDs = append(userIDs, uniqueIDs(t.CreatedByID, t.ModifiedByID)...)
		orgIDs = append(orgIDs, uniqueIDs(t.OrganizationID)...)
		jobIDs = append(jobIDs, uniqueIDs(t.LastJobID, t.CurrentJobID)...)
		invIDs = append(invIDs, uniqueIDs(t.InventoryID)...)
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
	invs, err := models.LoadInventorySummaries(c.Ctx(), c.S.Q(), invIDs)
	if err != nil {
		return nil, err
	}
	labels, err := models.TemplateLabels(c.Ctx(), c.S.Q(), ids)
	if err != nil {
		return nil, err
	}
	recent, err := models.LoadRecentTemplateJobs(c.Ctx(), c.S.Q(), c.S.CT, ids)
	if err != nil {
		return nil, err
	}
	out := make([]any, 0, len(ts))
	for _, t := range ts {
		out = append(out, s.serializeWorkflowJobTemplate(c, t, invs, labels[t.ID], recent[t.ID]))
	}
	return out, nil
}

func (s *Server) workflowJobTemplateNamedURL(c *SerCtx, t *models.WorkflowJobTemplate) string {
	org := ""
	if o := c.OrgSummary(t.OrganizationID); o != nil {
		v, _ := o.Get("name")
		org, _ = v.(string)
	}
	return "/api/v2/workflow_job_templates/" + namedURLEscape(t.Name) + "++" + namedURLEscape(org) + "/"
}

func nullableString(m map[string]any, key string) any {
	if v, ok := m[key]; ok && v != nil {
		return v
	}
	return nil
}

func (s *Server) serializeWorkflowJobTemplate(c *SerCtx, t *models.WorkflowJobTemplate, invs map[int64]models.InventorySummary, labels []models.NameSummary, recent []models.RecentTemplateJob) *OMap {
	related := NewOMap()
	if c.Detail {
		related.Set("named_url", s.workflowJobTemplateNamedURL(c, t))
	}
	setURL(related, "created_by", "users", t.CreatedByID)
	setURL(related, "modified_by", "users", t.ModifiedByID)
	setURL(related, "current_job", "workflow_jobs", t.CurrentJobID)
	setURL(related, "last_job", "workflow_jobs", t.LastJobID)
	setURL(related, "next_schedule", "schedules", t.NextScheduleID)
	related.Set("workflow_jobs", SubURL("workflow_job_templates", t.ID, "workflow_jobs"))
	related.Set("schedules", SubURL("workflow_job_templates", t.ID, "schedules"))
	related.Set("launch", SubURL("workflow_job_templates", t.ID, "launch"))
	related.Set("webhook_key", SubURL("workflow_job_templates", t.ID, "webhook_key"))
	if t.WebhookService != "" {
		related.Set("webhook_receiver", "/api/v2/workflow_job_templates/"+itoa(t.ID)+"/"+t.WebhookService+"/")
	} else {
		related.Set("webhook_receiver", "")
	}
	related.Set("workflow_nodes", SubURL("workflow_job_templates", t.ID, "workflow_nodes"))
	related.Set("labels", SubURL("workflow_job_templates", t.ID, "labels"))
	related.Set("activity_stream", SubURL("workflow_job_templates", t.ID, "activity_stream"))
	for _, k := range []string{"started", "success", "error", "approvals"} {
		related.Set("notification_templates_"+k, SubURL("workflow_job_templates", t.ID, "notification_templates_"+k))
	}
	related.Set("access_list", SubURL("workflow_job_templates", t.ID, "access_list"))
	related.Set("object_roles", SubURL("workflow_job_templates", t.ID, "object_roles"))
	related.Set("survey_spec", SubURL("workflow_job_templates", t.ID, "survey_spec"))
	related.Set("copy", SubURL("workflow_job_templates", t.ID, "copy"))
	setURL(related, "organization", "organizations", t.OrganizationID)
	setURL(related, "webhook_credential", "credentials", t.WebhookCredentialID)
	setURL(related, "inventory", "inventories", t.InventoryID)

	summary := NewOMap()
	c.putSummary(summary, "organization", c.OrgSummary, t.OrganizationID)
	if c.WantSummary("inventory") && t.InventoryID != nil {
		if inv, ok := invs[*t.InventoryID]; ok {
			summary.Set("inventory", inventorySummaryMap(inv))
		}
	}
	c.putSummary(summary, "last_job", c.LastJobSummary, t.LastJobID)
	c.putSummary(summary, "last_update", c.UpdateSummary, t.LastJobID)
	c.putSummary(summary, "current_update", c.UpdateSummary, t.CurrentJobID)
	c.putSummary(summary, "current_job", c.UpdateSummary, t.CurrentJobID)
	c.putSummary(summary, "created_by", c.UserSummary, t.CreatedByID)
	c.putSummary(summary, "modified_by", c.UserSummary, t.ModifiedByID)
	if c.WantSummary("object_roles") {
		summary.Set("object_roles", c.RolesSummary("workflow job template", models.WorkflowJobTemplateRoleFields, t.RoleID))
	}
	if c.WantSummary("user_capabilities") {
		edit := c.HasRole(t.AdminRoleID)
		start := c.HasRole(t.ExecuteRoleID)
		copyOK := c.User != nil && c.User.IsSuperuser
		if !copyOK && t.OrganizationID != nil {
			copyOK = c.HasRoleOn("main.organization", *t.OrganizationID, "workflow_admin_role")
		}
		summary.Set("user_capabilities", Caps("edit", edit, "delete", edit, "start", start, "schedule", start, "copy", copyOK))
	}
	if c.WantSummary("labels") {
		summary.Set("labels", labelsSummary(labels))
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
		list := make([]any, 0, len(recent))
		for _, j := range recent {
			list = append(list, NewOMap().Set("id", j.ID).Set("status", j.Status).Set("finished", models.FormatTimePtr(j.Finished)).Set("canceled_on", models.FormatTimePtr(j.CanceledOn)).Set("type", j.Type))
		}
		summary.Set("recent_jobs", list)
	}

	chars := t.CharPromptsMap()
	o := Base(NewOMap(), t.ID, "workflow_job_template", URLFor("workflow_job_templates", t.ID), related, summary, t.Created, t.Modified, t.Name, t.Description)
	o.Set("last_job_run", models.FormatTimePtr(t.LastJobRun)).Set("last_job_failed", t.LastJobFailed).Set("next_job_run", models.FormatTimePtr(t.NextJobRun)).Set("status", t.Status)
	o.Set("extra_vars", t.ExtraVars).Set("organization", models.NullableID(t.OrganizationID)).Set("survey_enabled", t.SurveyEnabled).Set("allow_simultaneous", t.AllowSimultaneous)
	o.Set("allow_overwrite_flow_vars_on_relaunch", t.AllowOverwriteFlowVarsOnRelaunch).Set("allow_force_node_success_on_relaunch", t.AllowForceNodeSuccessOnRelaunch)
	o.Set("ask_variables_on_launch", t.AskVariablesOnLaunch).Set("inventory", models.NullableID(t.InventoryID)).Set("limit", nullableString(chars, "limit")).Set("scm_branch", nullableString(chars, "scm_branch"))
	o.Set("ask_inventory_on_launch", t.AskInventoryOnLaunch).Set("ask_scm_branch_on_launch", t.AskSCMBranchOnLaunch).Set("ask_limit_on_launch", t.AskLimitOnLaunch)
	o.Set("webhook_service", t.WebhookService).Set("webhook_credential", models.NullableID(t.WebhookCredentialID)).Set("ask_labels_on_launch", t.AskLabelsOnLaunch)
	o.Set("ask_skip_tags_on_launch", t.AskSkipTagsOnLaunch).Set("ask_tags_on_launch", t.AskTagsOnLaunch).Set("skip_tags", nullableString(chars, "skip_tags")).Set("job_tags", nullableString(chars, "job_tags"))
	return o
}

func (s *Server) workflowJobTemplateJobs(w http.ResponseWriter, r *http.Request) error {
	_, t, err := workflowJobTemplateObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	return s.workflowJobListWith(w, r, func(q *Query) { q.And("wj.workflow_job_template_id = " + q.Arg(t.ID)) })
}

func (s *Server) workflowJobTemplateLabels(w http.ResponseWriter, r *http.Request) error {
	_, t, err := workflowJobTemplateObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	return s.labelListWith(w, r, func(q *Query) {
		q.AddJoin("JOIN main_unifiedjobtemplate_labels tll ON tll.label_id = l.id")
		q.And("tll.unifiedjobtemplate_id = " + q.Arg(t.ID))
	})
}

func (s *Server) workflowJobTemplateSchedules(w http.ResponseWriter, r *http.Request) error {
	_, t, err := workflowJobTemplateObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	return s.scheduleListWith(w, r, func(q *Query) { q.And("sc.unified_job_template_id = " + q.Arg(t.ID)) })
}

// --- workflow jobs -----------------------------------------------------------

// workflowJobAccess is WorkflowJobAccess.filtered_queryset: workflow jobs
// of readable workflow templates and of readable job templates (sliced
// runs), and the bulk jobs of organizations the user administers directly.
func (s *Server) workflowJobAccess(q *Query, u *auth.User) {
	q.And("(wj.workflow_job_template_id IN (" + accessibleSQL(q, u.ID, s.CT.ID("main.workflowjobtemplate"), "read_role") + ") OR wj.job_template_id IN (" +
		accessibleSQL(q, u.ID, s.CT.ID("main.jobtemplate"), "read_role") + `) OR (wj.is_bulk_job AND uj.organization_id IN (
		SELECT o.id FROM main_organization o JOIN main_rbac_roles_members m ON m.role_id = o.admin_role_id WHERE m.user_id = ` + q.Arg(u.ID) + ")))")
}

func (s *Server) workflowJobList(w http.ResponseWriter, r *http.Request) error {
	return s.workflowJobListWith(w, r, nil)
}

func (s *Server) workflowJobListWith(w http.ResponseWriter, r *http.Request, extra func(q *Query)) error {
	spec := ListSpec{Model: "WorkflowJob", From: models.WorkflowJobFrom, Columns: models.WorkflowJobColumns, PK: "uj.id", Fields: workflowJobFields, DefaultOrder: []string{"id"}, Access: s.workflowJobAccess}
	ws, count, page, err := runListOf(s, r, spec, extra, models.ScanWorkflowJob)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, false)
	results, err := s.serializeWorkflowJobs(c, ws, false)
	if err != nil {
		return err
	}
	WriteJSON(w, 200, Paginate(r, page, count, results))
	return nil
}

// workflowJobObj is a workflow job (WorkflowJobAccess.can_read): readable
// through its workflow (or, for a sliced job, job) template; a bulk job
// also by a direct admin of its organization and by the user who made it.
var workflowJobObj = &pathObject[*models.WorkflowJob]{
	model: "WorkflowJob",
	get:   models.GetWorkflowJob,
	readable: func(c *SerCtx, v *models.WorkflowJob) bool {
		if v.IsBulkJob && v.CreatedByID != nil && *v.CreatedByID == c.User.ID {
			return true
		}
		return (v.WorkflowJobTemplateID != nil && c.HasRoleOn("main.workflowjobtemplate", *v.WorkflowJobTemplateID, "read_role")) ||
			(v.JobTemplateID != nil && c.HasRoleOn("main.jobtemplate", *v.JobTemplateID, "read_role")) || (v.IsBulkJob && orgDirectAdmin(c, v.OrganizationID))
	},
}

// orgDirectAdmin: c's user is a direct member of organization id's admin
// role (admin_role__members).
func orgDirectAdmin(c *SerCtx, id *int64) bool {
	if id == nil {
		return false
	}
	var direct bool
	_ = db.Tolerant(c.Q()).QueryRow(c.Ctx(), `SELECT EXISTS (SELECT 1 FROM main_organization o JOIN main_rbac_roles_members m ON m.role_id = o.admin_role_id WHERE o.id = $1 AND m.user_id = $2)`, *id, c.User.ID).Scan(&direct)
	return direct
}

// workflowJobCanDelete is WorkflowJobAccess.can_delete: a superuser, or a
// workflow admin of the organization of the job's workflow job template
// (a bulk or sliced job has none).
func (s *Server) workflowJobCanDelete(c *SerCtx, wj *models.WorkflowJob) bool {
	if c.User.IsSuperuser {
		return true
	}
	if wj.WorkflowJobTemplateID == nil {
		return false
	}
	var org *int64
	if err := db.Tolerant(s.Q()).QueryRow(c.Ctx(), `SELECT organization_id FROM main_unifiedjobtemplate WHERE id = $1`, *wj.WorkflowJobTemplateID).Scan(&org); err != nil || org == nil {
		return false
	}
	return c.HasRoleOn("main.organization", *org, "workflow_admin_role")
}

func (s *Server) workflowJobDetail(w http.ResponseWriter, r *http.Request) error {
	_, wj, err := workflowJobObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	results, err := s.serializeWorkflowJobs(c, []*models.WorkflowJob{wj}, true)
	if err != nil {
		return err
	}
	WriteJSON(w, 200, results[0])
	return nil
}

func (s *Server) workflowJobDelete(w http.ResponseWriter, r *http.Request) error {
	_, wj, err := workflowJobObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	if !s.workflowJobCanDelete(c, wj) {
		return ErrForbidden
	}
	if err := s.checkUnifiedJobDelete(r.Context(), wj.ID, "", ""); err != nil {
		return err
	}
	ctx := r.Context()
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		return s.Cascade.Delete(ctx, tx, "main_unifiedjob", "id", []int64{wj.ID})
	})
	if err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func (s *Server) serializeWorkflowJobs(c *SerCtx, ws []*models.WorkflowJob, detail bool) ([]any, error) {
	var userIDs, orgIDs, invIDs, tmplIDs, ids, schedIDs, wfIDs []int64
	for _, wj := range ws {
		ids = append(ids, wj.ID)
		userIDs = append(userIDs, uniqueIDs(wj.CreatedByID, wj.ModifiedByID)...)
		orgIDs = append(orgIDs, uniqueIDs(wj.OrganizationID)...)
		invIDs = append(invIDs, uniqueIDs(wj.InventoryID)...)
		tmplIDs = append(tmplIDs, uniqueIDs(wj.WorkflowJobTemplateID, wj.JobTemplateID, wj.UnifiedJobTemplateID)...)
		schedIDs = append(schedIDs, uniqueIDs(wj.ScheduleID)...)
		if wj.LaunchType == "workflow" {
			wfIDs = append(wfIDs, wj.ID)
		}
	}
	if err := c.PreloadUsers(userIDs); err != nil {
		return nil, err
	}
	if err := c.PreloadOrgs(orgIDs); err != nil {
		return nil, err
	}
	ctx := &jobContext{}
	var err error
	if ctx.invs, err = models.LoadInventorySummaries(c.Ctx(), c.S.Q(), invIDs); err != nil {
		return nil, err
	}
	if ctx.templates, err = s.loadTemplateBriefs(c, tmplIDs); err != nil {
		return nil, err
	}
	if ctx.labels, err = models.JobLabels(c.Ctx(), c.S.Q(), ids); err != nil {
		return nil, err
	}
	if ctx.schedules, err = s.loadScheduleBriefs(c, schedIDs); err != nil {
		return nil, err
	}
	if ctx.wfJobs, err = models.WorkflowJobIDForJob(c.Ctx(), c.S.Q(), wfIDs); err != nil {
		return nil, err
	}
	var parentIDs []int64
	for _, wf := range ctx.wfJobs {
		parentIDs = append(parentIDs, wf)
	}
	if ctx.briefs, err = models.LoadUnifiedJobBriefs(c.Ctx(), c.S.Q(), c.S.CT, parentIDs); err != nil {
		return nil, err
	}
	out := make([]any, 0, len(ws))
	for _, wj := range ws {
		o, err := s.serializeWorkflowJob(c, wj, ctx, detail)
		if err != nil {
			return nil, err
		}
		out = append(out, o)
	}
	return out, nil
}

func (s *Server) serializeWorkflowJob(c *SerCtx, wj *models.WorkflowJob, ctx *jobContext, detail bool) (*OMap, error) {
	related := NewOMap()
	setURL(related, "created_by", "users", wj.CreatedByID)
	setURL(related, "modified_by", "users", wj.ModifiedByID)
	if wj.UnifiedJobTemplateID != nil {
		if tb, ok := ctx.templates[*wj.UnifiedJobTemplateID]; ok {
			related.Set("unified_job_template", templateDetailURL(tb))
		}
	}
	setURL(related, "schedule", "schedules", wj.ScheduleID)
	wfID, spawned := ctx.wfJobs[wj.ID]
	if spawned {
		related.Set("source_workflow_job", URLFor("workflow_jobs", wfID))
	}
	if wj.WorkflowJobTemplateID != nil {
		related.Set("workflow_job_template", URLFor("workflow_job_templates", *wj.WorkflowJobTemplateID))
		related.Set("notifications", SubURL("workflow_jobs", wj.ID, "notifications"))
	}
	setURL(related, "job_template", "job_templates", wj.JobTemplateID)
	related.Set("workflow_nodes", SubURL("workflow_jobs", wj.ID, "workflow_nodes"))
	related.Set("labels", SubURL("workflow_jobs", wj.ID, "labels"))
	related.Set("activity_stream", SubURL("workflow_jobs", wj.ID, "activity_stream"))
	related.Set("relaunch", SubURL("workflow_jobs", wj.ID, "relaunch"))
	related.Set("cancel", SubURL("workflow_jobs", wj.ID, "cancel"))

	summary := NewOMap()
	c.putSummary(summary, "organization", c.OrgSummary, wj.OrganizationID)
	if c.WantSummary("inventory") && wj.InventoryID != nil {
		if inv, ok := ctx.invs[*wj.InventoryID]; ok {
			summary.Set("inventory", inventorySummaryMap(inv))
		}
	}
	if c.WantSummary("job_template") && wj.JobTemplateID != nil {
		if tb, ok := ctx.templates[*wj.JobTemplateID]; ok {
			summary.Set("job_template", NewOMap().Set("id", tb.ID).Set("name", tb.Name).Set("description", tb.Description).Set("prevent_relaunch", tb.PreventRelaunch))
		}
	}
	if c.WantSummary("workflow_job_template") && wj.WorkflowJobTemplateID != nil {
		if tb, ok := ctx.templates[*wj.WorkflowJobTemplateID]; ok {
			var force bool
			_ = db.Tolerant(s.Q()).QueryRow(c.Ctx(), `SELECT allow_force_node_success_on_relaunch FROM main_workflowjobtemplate WHERE unifiedjobtemplate_ptr_id = $1`, tb.ID).Scan(&force)
			summary.Set("workflow_job_template", NewOMap().Set("id", tb.ID).Set("name", tb.Name).Set("description", tb.Description).Set("allow_force_node_success_on_relaunch", force))
		}
	}
	if c.WantSummary("schedule") && wj.ScheduleID != nil {
		if sb, ok := ctx.schedules[*wj.ScheduleID]; ok {
			summary.Set("schedule", NewOMap().Set("id", sb.ID).Set("name", sb.Name).Set("description", sb.Description).Set("next_run", models.FormatTimePtr(sb.NextRun)))
		}
	}
	if c.WantSummary("unified_job_template") && wj.UnifiedJobTemplateID != nil {
		if tb, ok := ctx.templates[*wj.UnifiedJobTemplateID]; ok {
			summary.Set("unified_job_template", NewOMap().Set("id", tb.ID).Set("name", tb.Name).Set("description", tb.Description).Set("unified_job_type", tb.Type))
		}
	}
	c.putSummary(summary, "created_by", c.UserSummary, wj.CreatedByID)
	c.putSummary(summary, "modified_by", c.UserSummary, wj.ModifiedByID)
	if c.WantSummary("user_capabilities") {
		canDelete := c.User != nil && s.workflowJobCanDelete(c, wj)
		// get_method_capability('start'): never when the job template
		// prevents relaunch; without a workflow job template (a sliced or
		// bulk job) only for superusers; else execute on the template.
		start := false
		switch {
		case wj.JobTemplateID != nil && ctx.templates[*wj.JobTemplateID].PreventRelaunch:
		case wj.WorkflowJobTemplateID == nil:
			start = c.User != nil && c.User.IsSuperuser
		default:
			start = c.HasRoleOn("main.workflowjobtemplate", *wj.WorkflowJobTemplateID, "execute_role")
		}
		summary.Set("user_capabilities", Caps("delete", canDelete, "start", start))
	}
	if c.WantSummary("source_workflow_job") && wj.LaunchType == "workflow" {
		src := NewOMap()
		if spawned {
			if b, ok := ctx.briefs[wfID]; ok {
				src.Set("id", b.ID).Set("name", b.Name).Set("description", b.Description).Set("status", b.Status).Set("failed", b.Failed)
				if b.Started != nil {
					src.Set("started", models.FormatTime(*b.Started))
				}
				src.Set("elapsed", b.Elapsed)
				if b.CanceledOn != nil {
					src.Set("canceled_on", models.FormatTime(*b.CanceledOn))
				}
			}
		}
		summary.Set("source_workflow_job", src)
	}
	ancestor, err := s.ancestorBrief(c, &wj.UnifiedJob, ctx)
	if err != nil {
		return nil, err
	}
	if c.IsDetailView && c.WantSummary("ancestor_job") && ancestor.ID != wj.ID {
		summary.Set("ancestor_job", NewOMap().Set("id", ancestor.ID).Set("name", ancestor.Name).Set("type", ancestor.Type).Set("url", models.JobDetailURL(ancestor.Type, ancestor.ID)))
	}
	if c.WantSummary("labels") {
		summary.Set("labels", labelsSummary(ctx.labels[wj.ID]))
	}

	chars := wj.CharPromptsMap()
	o := Base(NewOMap(), wj.ID, "workflow_job", URLFor("workflow_jobs", wj.ID), related, summary, wj.Created, wj.Modified, wj.Name, wj.Description)
	o.Set("unified_job_template", models.NullableID(wj.UnifiedJobTemplateID)).Set("launch_type", wj.LaunchType).Set("status", wj.Status).Set("failed", wj.Failed)
	o.Set("started", models.FormatTimePtr(wj.Started)).Set("finished", models.FormatTimePtr(wj.Finished)).Set("canceled_on", models.FormatTimePtr(wj.CanceledOn))
	o.Set("elapsed", elapsedNow(&wj.UnifiedJob))
	if detail {
		o.Set("job_args", wj.JobArgs).Set("job_cwd", wj.JobCwd).Set("job_env", rawJSON(wj.JobEnv, map[string]any{}))
	}
	o.Set("job_explanation", c.Loc().Gettext(wj.JobExplanation))
	if detail {
		o.Set("result_traceback", wj.ResultTraceback)
	}
	o.Set("launched_by", s.launchedBy(c, ancestor, ctx)).Set("work_unit_id", nullIfEmpty(wj.WorkUnitID))
	o.Set("workflow_job_template", models.NullableID(wj.WorkflowJobTemplateID))
	if detail || includes(c.R, "extra_vars") {
		extra := wj.ExtraVars
		var passwords map[string]any
		if len(wj.SurveyPasswords) > 0 {
			_ = json.Unmarshal(wj.SurveyPasswords, &passwords)
		}
		if len(passwords) > 0 {
			if vars, err := ParseVars(extra); err == nil {
				for k, v := range passwords {
					if _, ok := vars[k]; ok {
						vars[k] = v
					}
				}
				b, _ := json.Marshal(vars)
				extra = string(b)
			}
		}
		o.Set("extra_vars", extra)
	}
	o.Set("allow_simultaneous", wj.AllowSimultaneous).Set("allow_overwrite_flow_vars_on_relaunch", wj.AllowOverwriteFlowVarsOnRelaunch)
	o.Set("allow_force_node_success_on_relaunch", wj.AllowForceNodeSuccessOnRelaunch).Set("job_template", models.NullableID(wj.JobTemplateID))
	o.Set("is_sliced_job", wj.IsSlicedJob).Set("inventory", models.NullableID(wj.InventoryID)).Set("limit", nullableString(chars, "limit")).Set("scm_branch", nullableString(chars, "scm_branch"))
	o.Set("webhook_service", wj.WebhookService).Set("webhook_credential", models.NullableID(wj.WebhookCredentialID)).Set("webhook_guid", wj.WebhookGUID)
	o.Set("skip_tags", nullableString(chars, "skip_tags")).Set("job_tags", nullableString(chars, "job_tags"))
	return o, nil
}

func (s *Server) workflowJobLabels(w http.ResponseWriter, r *http.Request) error {
	_, wj, err := workflowJobObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	return s.labelListWith(w, r, func(q *Query) {
		q.AddJoin("JOIN main_unifiedjob_labels jll ON jll.label_id = l.id")
		q.And("jll.unifiedjob_id = " + q.Arg(wj.ID))
	})
}

func (s *Server) workflowJobCancelView(w http.ResponseWriter, r *http.Request) error {
	_, wj, err := workflowJobObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	WriteJSON(w, 200, NewOMap().Set("can_cancel", models.ActiveStatuses[wj.Status]))
	return nil
}

func (s *Server) workflowJobCancel(w http.ResponseWriter, r *http.Request) error {
	// The cancel permission (WorkflowJobAccess.can_cancel) is the only
	// object check: no read access is needed. It is refused for a job that
	// cannot be canceled; a superuser gets the 405 instead.
	u, err := RequireWrite(r)
	if err != nil {
		return err
	}
	id, err := PathID(r)
	if err != nil {
		return workflowJobObj.notFound()
	}
	wj, err := models.GetWorkflowJob(r.Context(), s.Q(), id)
	if err != nil {
		if db.IsNoRows(err) {
			return workflowJobObj.notFound()
		}
		return err
	}
	c := s.NewSerCtx(r, true)
	if !u.IsSuperuser {
		allowed := models.ActiveStatuses[wj.Status] && ((wj.CreatedByID != nil && *wj.CreatedByID == u.ID) || s.workflowJobCanDelete(c, wj) ||
			(wj.WorkflowJobTemplateID != nil && c.HasRoleOn("main.workflowjobtemplate", *wj.WorkflowJobTemplateID, "admin_role")))
		if !allowed {
			return ErrForbidden
		}
	}
	if !models.ActiveStatuses[wj.Status] {
		return MethodNotAllowed(r.Method)
	}
	if err := s.cancelUnifiedJob(r, &wj.UnifiedJob); err != nil {
		return err
	}
	w.WriteHeader(http.StatusAccepted)
	return nil
}

// --- workflow job nodes ------------------------------------------------------

// workflowJobNode is a main_workflowjobnode row.
func idList(ids []int64) []any {
	out := make([]any, 0, len(ids))
	for _, id := range ids {
		out = append(out, id)
	}
	return out
}
