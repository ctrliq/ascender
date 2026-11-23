package web

import (
	"net/http"
	"net/url"
	"strconv"
	"strings"
)

// Workflow job template pages (form, detail tabs) and workflow approvals,
// ported from screens/Template/WorkflowJobTemplate* and
// screens/WorkflowApproval. The visualizer tab lives in
// workflow_visualizer.go.

func (u *UI) registerWorkflows(mux *http.ServeMux) {
	mux.HandleFunc("/templates/workflow_job_template/add", u.protected(u.workflowTemplateAdd))
	mux.HandleFunc("/templates/workflow_job_template/add/{$}", u.protected(u.workflowTemplateAdd))
	mux.HandleFunc("/templates/workflow_job_template/{id}", u.protected(toDetails))
	mux.HandleFunc("/templates/workflow_job_template/{id}/details", u.protected(u.workflowTemplateDetail))
	mux.HandleFunc("/templates/workflow_job_template/{id}/edit", u.protected(u.workflowTemplateEdit))
	for _, tab := range []string{"access", "notifications", "jobs", "survey"} {
		mux.HandleFunc("/templates/workflow_job_template/{id}/"+tab, u.protected(u.workflowTemplateTab))
	}
	mux.HandleFunc("/templates/workflow_job_template/{id}/survey/add", u.protected(u.surveyQuestionForm))
	mux.HandleFunc("/templates/workflow_job_template/{id}/survey/edit", u.protected(u.surveyQuestionForm))

	mux.HandleFunc("/workflow_approvals", u.protected(u.approvalList))
	mux.HandleFunc("/workflow_approvals/{$}", u.protected(u.approvalList))
	mux.HandleFunc("/workflow_approvals/{id}", u.protected(toDetails))
	mux.HandleFunc("/workflow_approvals/{id}/details", u.protected(u.approvalDetail))
}

// workflowTemplateTabs lists the tabs of a workflow job template in the
// order WorkflowJobTemplate.js built them: notifications only for
// notification admins and system auditors, and "View Survey" for those who
// cannot change the survey.
func workflowTemplateTabs(id string, notifications, canEditSurvey bool) []map[string]any {
	base := "/templates/workflow_job_template/" + id
	survey := "Survey"
	if !canEditSurvey {
		survey = "View Survey"
	}
	var out []map[string]any
	for _, t := range [][2]string{{"details", "Details"}, {"access", "Access"}, {"notifications", "Notifications"}, {"schedules", "Schedules"}, {"visualizer", "Visualizer"}, {"jobs", "Jobs"}, {"survey", survey}} {
		if t[0] == "notifications" && !notifications {
			continue
		}
		out = append(out, map[string]any{"key": t[0], "href": base + "/" + t[0], "label": t[1]})
	}
	return out
}

// workflowCanEditSurvey is canAddAndEditSurvey: edit or delete rights.
func workflowCanEditSurvey(t map[string]any) bool {
	return dig(t, "summary_fields", "user_capabilities", "edit") == true || dig(t, "summary_fields", "user_capabilities", "delete") == true
}

func (u *UI) loadWorkflowTemplate(w http.ResponseWriter, r *http.Request, uc *userContext) (map[string]any, bool) {
	t, ok := u.loadObject(w, r, uc, "/api/v2/workflow_job_templates/"+r.PathValue("id")+"/")
	if !ok {
		return nil, false
	}
	// The webhook key is only in the template for those who may change it,
	// and only once a webhook service is set.
	if dig(t, "summary_fields", "user_capabilities", "edit") == true && has(t["webhook_service"]) && has(dig(t, "related", "webhook_key")) {
		if kres, err := u.apiCall(r, "GET", "/api/v2/workflow_job_templates/"+str(t["id"])+"/webhook_key/", nil); err == nil && kres.Status == 200 {
			t["webhook_key"] = kres.Data["webhook_key"]
		}
	}
	return t, true
}

func (u *UI) workflowTemplatePage(r *http.Request, uc *userContext, t map[string]any, title, tab string) *page {
	p := u.newPage(r, uc, title)
	p.Nav = navigation(uc, "/templates")
	p.Data["wfjt"] = t
	p.Data["tab"] = tab
	if tab == "access" {
		u.accessTab(r, p, "/api/v2/workflow_job_templates/"+str(t["id"])+"/", t)
	}
	p.Data["tabs"] = workflowTemplateTabs(str(t["id"]), uc.User.IsSystemAuditor || u.isNotificationAdmin(r), workflowCanEditSurvey(t))
	return p
}

// toTitleCase is util/strings toTitleCase: words split on underscores,
// each capitalised.
func toTitleCase(s string) string {
	words := strings.Split(strings.ToLower(s), "_")
	for i, w := range words {
		if w != "" {
			words[i] = strings.ToUpper(w[:1]) + w[1:]
		}
	}
	return strings.Join(words, " ")
}

// typedJobs marks recent jobs with their type, which the sparkline links by.
func typedJobs(v any, typ string) []any {
	items, _ := v.([]any)
	out := make([]any, 0, len(items))
	for _, it := range items {
		if m, ok := it.(map[string]any); ok {
			c := map[string]any{}
			for k, val := range m {
				c[k] = val
			}
			if _, ok := c["type"]; !ok {
				c["type"] = typ
			}
			out = append(out, c)
		}
	}
	return out
}

func (u *UI) workflowTemplateDetail(w http.ResponseWriter, r *http.Request, uc *userContext) {
	t, ok := u.loadWorkflowTemplate(w, r, uc)
	if !ok {
		return
	}
	p := u.workflowTemplatePage(r, uc, t, "Details", "details")
	p.Data["recent_jobs"] = typedJobs(dig(t, "summary_fields", "recent_jobs"), "workflow_job")
	p.Data["origin"] = requestOrigin(r)
	p.Data["job_type"] = toTitleCase(str(t["type"]))
	p.Data["webhook_service"] = toTitleCase(str(t["webhook_service"]))
	var opts []string
	if t["allow_simultaneous"] == true {
		opts = append(opts, "Concurrent Jobs")
	}
	if t["allow_overwrite_flow_vars_on_relaunch"] == true {
		opts = append(opts, "Overwriting Variables on Relaunch")
	}
	if t["allow_force_node_success_on_relaunch"] == true {
		opts = append(opts, "Forcing Failed Nodes as Successful on Relaunch")
	}
	if has(t["webhook_service"]) {
		opts = append(opts, "Webhooks")
	}
	for i, o := range opts {
		opts[i] = p.Loc.T(o)
	}
	p.Data["options"] = opts
	p.Data["editor"] = true
	u.render(w, r, "workflow_job_templates_detail", p)
}

var workflowTemplateTabTitles = map[string]string{"access": "Access", "notifications": "Notifications", "jobs": "Jobs", "survey": "Survey"}

func (u *UI) workflowTemplateTab(w http.ResponseWriter, r *http.Request, uc *userContext) {
	t, ok := u.loadWorkflowTemplate(w, r, uc)
	if !ok {
		return
	}
	id := str(t["id"])
	tab := lastPathSegment(r)
	p := u.workflowTemplatePage(r, uc, t, workflowTemplateTabTitles[tab], tab)
	switch tab {
	case "jobs":
		// JobList with defaultParams workflow_job__workflow_job_template.
		if err := u.listPage(r, p, "job", "/api/v2/unified_jobs/", url.Values{"order_by": {"-finished"}, "not__launch_type": {"sync"}, "workflow_job__workflow_job_template": {id}}, jobFilterLabels); err != nil {
			u.api.Log.ErrorContext(r.Context(), "workflow template jobs", "err", err)
		}
		p.Data["searchKeys"] = templateJobSearchKeys
	case "survey":
		res, err := u.apiCall(r, "GET", "/api/v2/workflow_job_templates/"+id+"/survey_spec/", nil)
		if err == nil && res.Status == 200 {
			p.Data["survey"] = res.Data
			p.Data["questions"] = surveyQuestions(res.Data)
		}
	case "notifications":
		if !uc.User.IsSystemAuditor && !u.isNotificationAdmin(r) {
			u.notFound(w, r, uc)
			return
		}
		if err := u.listPage(r, p, "notification", "/api/v2/notification_templates/", url.Values{"order_by": {"name"}}, notificationFilterLabels); err != nil {
			u.api.Log.ErrorContext(r.Context(), "notification templates", "err", err)
		}
		for _, k := range []string{"approvals", "started", "success", "error"} {
			p.Data[k] = idSet(u.listResults(r, "/api/v2/workflow_job_templates/"+id+"/notification_templates_"+k+"/?page_size=200"))
		}
		p.Data["searchKeys"] = notificationSearchKeys
		p.Data["typeLabels"] = notificationTypeLabels
		p.Data["switchLabels"] = translatedLabels(p, notificationSwitchLabels)
		p.Data["toggleLabels"] = notificationToggleLabels
		p.Data["canToggle"] = u.isNotificationAdmin(r)
		p.Data["notifyApi"] = "/api/v2/workflow_job_templates/" + id + "/"
	}
	u.render(w, r, "workflow_job_templates_detail", p)
}

// --- workflow job template form ---------------------------------------------------

// workflowTemplateFormValues is mapPropsToValues of WorkflowJobTemplateForm.
func workflowTemplateFormValues(data map[string]any, origin string) map[string]any {
	v := map[string]any{}
	for _, k := range []string{"name", "description", "limit", "scm_branch", "skip_tags", "job_tags", "webhook_service", "webhook_key", "extra_vars"} {
		v[k] = str(data[k])
	}
	if v["extra_vars"] == "" {
		v["extra_vars"] = "---"
	}
	for _, k := range []string{"allow_simultaneous", "allow_overwrite_flow_vars_on_relaunch", "allow_force_node_success_on_relaunch",
		"ask_labels_on_launch", "ask_limit_on_launch", "ask_inventory_on_launch", "ask_variables_on_launch", "ask_scm_branch_on_launch", "ask_skip_tags_on_launch", "ask_tags_on_launch"} {
		v[k] = data[k] == true
	}
	for _, k := range []string{"inventory", "organization", "webhook_credential"} {
		v[k] = refValue(data, k)
	}
	v["labels"] = refList(dig(data, "summary_fields", "labels", "results"))
	if l, ok := data["labels"].([]map[string]any); ok {
		v["labels"] = l
	}
	v["webhook_url"] = ""
	if wr := str(dig(data, "related", "webhook_receiver")); wr != "" {
		v["webhook_url"] = origin + wr
	}
	if s, ok := data["webhook_url"].(string); ok {
		v["webhook_url"] = s
	}
	v["enable_webhook"] = has(data["webhook_service"])
	if b, ok := data["enable_webhook"].(bool); ok {
		v["enable_webhook"] = b
	}
	v["initial_webhook_key"] = str(data["webhook_key"])
	if s, ok := data["initial_webhook_key"].(string); ok {
		v["initial_webhook_key"] = s
	}
	return v
}

// workflowTemplateFromPost reads the posted form into the payload the old
// handleSubmit sent and the values for re-rendering. Empty prompt strings
// are sent as null, and a webhook key only when one is typed.
func workflowTemplateFromPost(r *http.Request, editing bool) (map[string]any, map[string]any) {
	f := r.PostForm
	payload := map[string]any{
		"name": f.Get("name"), "description": f.Get("description"), "extra_vars": formText(f, "extra_vars"),
	}
	for _, k := range []string{"allow_simultaneous", "allow_overwrite_flow_vars_on_relaunch", "allow_force_node_success_on_relaunch",
		"ask_labels_on_launch", "ask_limit_on_launch", "ask_inventory_on_launch", "ask_variables_on_launch", "ask_scm_branch_on_launch", "ask_skip_tags_on_launch", "ask_tags_on_launch"} {
		payload[k] = f.Get(k) == "on"
	}
	for _, k := range []string{"limit", "job_tags", "skip_tags", "scm_branch"} {
		if s := f.Get(k); s != "" {
			payload[k] = s
		} else {
			payload[k] = nil
		}
	}
	enabled := f.Get("enable_webhook") == "on"
	for _, k := range []string{"inventory", "organization", "webhook_credential"} {
		id := strings.TrimSpace(f.Get(k))
		if k == "webhook_credential" && !enabled {
			id = ""
		}
		if n, err := strconv.ParseInt(id, 10, 64); err == nil && n > 0 {
			payload[k] = n
		} else if editing {
			payload[k] = nil
		}
	}
	payload["webhook_service"] = ""
	if enabled {
		payload["webhook_service"] = f.Get("webhook_service")
		if key := strings.TrimSpace(f.Get("webhook_key")); key != "" {
			payload["webhook_key"] = key
		}
	}
	values := map[string]any{}
	for k, v := range payload {
		values[k] = v
	}
	for _, k := range []string{"limit", "job_tags", "skip_tags", "scm_branch"} {
		values[k] = f.Get(k)
	}
	for _, k := range []string{"inventory", "organization", "webhook_credential"} {
		values[k] = map[string]any{"id": f.Get(k), "name": f.Get(k + "_name")}
	}
	values["labels"] = multiRefs(f, "labels")
	values["enable_webhook"] = enabled
	values["webhook_service"] = f.Get("webhook_service")
	values["webhook_key"] = f.Get("webhook_key")
	values["webhook_url"] = f.Get("webhook_url")
	values["initial_webhook_key"] = f.Get("initial_webhook_key")
	return payload, workflowTemplateFormValues(values, "")
}

// isOrgAdmin is what the old form asked users/{id}/admin_of_organizations
// for: whether the user is directly an organization admin, which makes the
// organization required.
func (u *UI) isOrgAdmin(r *http.Request, uc *userContext) bool {
	if uc.User.IsSuperuser {
		return false
	}
	res, err := u.apiCall(r, "GET", "/api/v2/organizations/?role_level=admin_role&page_size=1", nil)
	return err == nil && res.Status == 200 && num(res.Data["count"]) > 0
}

// labelOrganization picks the organization new labels are created in: the
// template's, its inventory's, or the first one the user can see.
func (u *UI) labelOrganization(r *http.Request, t map[string]any) int64 {
	if n := int64(num(t["organization"])); n > 0 {
		return n
	}
	if n := int64(num(dig(t, "summary_fields", "inventory", "organization_id"))); n > 0 {
		return n
	}
	for _, it := range u.listResults(r, "/api/v2/organizations/?page_size=1") {
		if m, ok := it.(map[string]any); ok {
			return int64(num(m["id"]))
		}
	}
	return 0
}

func (u *UI) workflowTemplateFormCommon(r *http.Request, uc *userContext, p *page) {
	p.Data["origin"] = requestOrigin(r)
	p.Data["editor"] = true
	p.Data["isOrgAdmin"] = u.isOrgAdmin(r, uc)
	p.Data["webhookServices"] = []map[string]string{{"value": "github", "label": p.Loc.T("GitHub")}, {"value": "gitlab", "label": p.Loc.T("GitLab")}, {"value": "bitbucket_dc", "label": p.Loc.T("Bitbucket Data Center")}}
}

func (u *UI) workflowTemplateAdd(w http.ResponseWriter, r *http.Request, uc *userContext) {
	p := u.newPage(r, uc, "Create New Workflow Template")
	p.Nav = navigation(uc, "/templates")
	u.workflowTemplateFormCommon(r, uc, p)
	if r.Method == http.MethodPost {
		payload, values := workflowTemplateFromPost(r, false)
		res, err := u.apiCall(r, "POST", "/api/v2/workflow_job_templates/", payload)
		if err == nil && res.Status == 201 {
			id := str(res.Data["id"])
			if lres := u.syncLabels(r, "/api/v2/workflow_job_templates/"+id+"/labels/", values["labels"].([]map[string]any), u.labelOrganization(r, res.Data)); lres != nil {
				// The template exists; its edit form shows what is left to fix.
				http.Redirect(w, r, "/templates/workflow_job_template/"+id+"/edit", http.StatusFound)
				return
			}
			http.Redirect(w, r, "/templates/workflow_job_template/"+id+"/visualizer", http.StatusFound)
			return
		}
		p.Data["values"] = values
		p.Errors = apiErrors(res)
		u.render(w, r, "workflow_job_templates_form", p)
		return
	}
	p.Data["values"] = workflowTemplateFormValues(map[string]any{}, "")
	// OrganizationLookup autoPopulate={isOrgAdmin}.
	if p.Data["isOrgAdmin"] == true {
		p.Data["values"].(map[string]any)["organization"] = u.autoOrganization(r, "")
	}
	u.render(w, r, "workflow_job_templates_form", p)
}

func (u *UI) workflowTemplateEdit(w http.ResponseWriter, r *http.Request, uc *userContext) {
	t, ok := u.loadWorkflowTemplate(w, r, uc)
	if !ok {
		return
	}
	id := str(t["id"])
	p := u.workflowTemplatePage(r, uc, t, "Edit Details", "details")
	u.workflowTemplateFormCommon(r, uc, p)
	// The inventory can only be changed by those who may use the current one.
	p.Data["inventoryDisabled"] = false
	if inv := str(t["inventory"]); inv != "" && inv != "<nil>" {
		res, err := u.apiCall(r, "GET", "/api/v2/inventories/?role_level=use_role&id="+url.QueryEscape(inv)+"&page_size=1", nil)
		p.Data["inventoryDisabled"] = err != nil || res.Status != 200 || num(res.Data["count"]) == 0
	}
	if r.Method == http.MethodPost {
		payload, values := workflowTemplateFromPost(r, true)
		formOrg := int64(num(payload["organization"]))
		orgID := formOrg
		if orgID == 0 {
			orgID = u.labelOrganization(r, t)
		}
		// Labels first, then the template, as the old edit did.
		if lres := u.syncLabels(r, "/api/v2/workflow_job_templates/"+id+"/labels/", values["labels"].([]map[string]any), orgID); lres != nil {
			p.Data["values"] = values
			p.Errors = apiErrors(lres)
			u.render(w, r, "workflow_job_templates_form", p)
			return
		}
		u.submitForm(w, r, p, "workflow_job_templates_form", "PATCH", "/api/v2/workflow_job_templates/"+id+"/", payload, values, "/templates/workflow_job_template/"+id+"/details")
		return
	}
	p.Data["values"] = workflowTemplateFormValues(t, requestOrigin(r))
	u.render(w, r, "workflow_job_templates_form", p)
}

// --- workflow approvals --------------------------------------------------------------

var approvalSearchKeys = []map[string]string{
	{"name": "Name", "key": "name__icontains"},
	{"name": "Description", "key": "description__icontains"},
}

var approvalFilterLabels = searchLabels(approvalSearchKeys, "status", "Status")

// approvalView adds what WorkflowApprovalUtils derive from an approval.
func approvalView(T tr, a map[string]any) map[string]any {
	v := map[string]any{}
	for k, val := range a {
		v[k] = val
	}
	status := str(a["status"])
	label := status
	switch {
	case a["timed_out"] == true:
		label = "timedOut"
	case has(a["canceled_on"]):
		label = "canceled"
	case status == "failed" && a["failed"] == true:
		label = "denied"
	case status == "successful":
		label = "approved"
	}
	v["_status"] = label
	// The tooltip names the date as {dt}, which the browser fills in with
	// its local time (data-dt-title).
	by := str(dig(a, "summary_fields", "approved_or_denied_by", "username"))
	tip := ""
	switch {
	case status == "successful" && by != "":
		tip = T("Approved by {0} - {1}", "0", by, "1", "{dt}")
	case status == "successful":
		tip = T("Approved - {0}.  See the Activity Stream for more information.", "0", "{dt}")
	case status == "failed" && a["failed"] == true && by != "":
		tip = T("Denied by {0} - {1}", "0", by, "1", "{dt}")
	case status == "failed" && a["failed"] == true:
		tip = T("Denied - {0}.  See the Activity Stream for more information.", "0", "{dt}")
	}
	v["_tooltip"] = tip
	// The list's row buttons are off once the approval has been settled.
	v["_acted_on"] = status == "successful" || status == "failed" || status == "canceled"
	// The approve and deny buttons themselves (WorkflowApprovalButton).
	sf, _ := dig(a, "summary_fields", "approved_or_denied_by").(map[string]any)
	v["_vote_done"] = len(sf) > 0 || status == "canceled" || a["user_has_voted"] == true
	return v
}

func (u *UI) approvalList(w http.ResponseWriter, r *http.Request, uc *userContext) {
	p := u.newPage(r, uc, "Workflow Approvals")
	if err := u.listPage(r, p, "workflow_approvals", "/api/v2/workflow_approvals/", url.Values{"order_by": {"-started"}}, approvalFilterLabels); err != nil {
		u.api.Log.ErrorContext(r.Context(), "workflow approvals", "err", err)
	}
	items, _ := p.Data["results"].([]any)
	rows := make([]any, 0, len(items))
	for _, it := range items {
		if m, ok := it.(map[string]any); ok {
			rows = append(rows, approvalView(p.Loc.T, m))
		}
	}
	p.Data["results"] = rows
	p.Data["searchKeys"] = approvalSearchKeys
	u.render(w, r, "workflow_approvals_list", p)
}

func (u *UI) approvalDetail(w http.ResponseWriter, r *http.Request, uc *userContext) {
	id := r.PathValue("id")
	approval, ok := u.loadObject(w, r, uc, "/api/v2/workflow_approvals/"+id+"/")
	if !ok {
		return
	}
	p := u.newPage(r, uc, "Details")
	a := approvalView(p.Loc.T, approval)
	p.Nav = navigation(uc, "/workflow_approvals")
	p.Data["approval"] = a
	p.Data["elapsed"] = formatElapsed(a["elapsed"])
	p.Data["votes"] = u.listResults(r, "/api/v2/workflow_approvals/"+id+"/votes/?page_size=200")
	if wj := str(dig(a, "summary_fields", "source_workflow_job", "id")); wj != "" {
		if jres, err := u.apiCall(r, "GET", "/api/v2/workflow_jobs/"+wj+"/", nil); err == nil && jres.Status == 200 {
			p.Data["workflow_job"] = jres.Data
		}
	}
	p.Data["editor"] = true
	u.render(w, r, "workflow_approvals_detail", p)
}
