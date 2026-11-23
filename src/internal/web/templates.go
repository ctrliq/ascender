package web

import (
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/ctrliq/ascender/internal/api"
)

func (u *UI) registerTemplates(mux *http.ServeMux) {
	mux.HandleFunc("/templates", u.protected(u.templateList))
	mux.HandleFunc("/templates/{$}", u.protected(u.templateList))
	mux.HandleFunc("/templates/job_template/add", u.protected(u.jobTemplateAdd))
	mux.HandleFunc("/templates/job_template/add/{$}", u.protected(u.jobTemplateAdd))
	mux.HandleFunc("/templates/job_template/{id}", u.protected(toDetails))
	mux.HandleFunc("/templates/job_template/{id}/details", u.protected(u.jobTemplateDetail))
	mux.HandleFunc("/templates/job_template/{id}/edit", u.protected(u.jobTemplateEdit))
	for _, tab := range []string{"access", "notifications", "jobs", "survey"} {
		mux.HandleFunc("/templates/job_template/{id}/"+tab, u.protected(u.jobTemplateTab))
	}
	mux.HandleFunc("/templates/job_template/{id}/survey/add", u.protected(u.surveyQuestionForm))
	mux.HandleFunc("/templates/job_template/{id}/survey/edit", u.protected(u.surveyQuestionForm))
}

var templateSearchKeys = []map[string]string{
	{"name": "Name", "key": "name__icontains"},
	{"name": "Description", "key": "description__icontains"},
	{"name": "Type", "key": "or__type", "options": "template_type"},
	{"name": "Playbook name", "key": "job_template__playbook__icontains"},
	{"name": "Created By (Username)", "key": "created_by__username__icontains"},
	{"name": "Modified By (Username)", "key": "modified_by__username__icontains"},
	{"name": "Label", "key": "labels__name__icontains"},
}

var templateFilterLabels = searchLabels(templateSearchKeys)

func (u *UI) templateList(w http.ResponseWriter, r *http.Request, uc *userContext) {
	p := u.newPage(r, uc, "Templates")
	if err := u.listPage(r, p, "template", "/api/v2/unified_job_templates/", url.Values{"order_by": {"name"}, "type": {"job_template,workflow_job_template"}}, templateFilterLabels); err != nil {
		u.api.Log.ErrorContext(r.Context(), "template list", "err", err)
	}
	p.Data["searchKeys"] = templateSearchKeys
	p.Data["editor"] = true
	p.Data["addMenu"] = []map[string]any{
		{"label": p.Loc.T("Add job template"), "href": "/templates/job_template/add"},
		{"label": p.Loc.T("Add workflow template"), "href": "/templates/workflow_job_template/add"},
	}
	u.render(w, r, "templates_list", p)
}

// jobTemplateTabs lists the tabs of a job template. The notifications tab
// is only offered to notification admins and system auditors, as Template.js
// did.
func jobTemplateTabs(id string, notifications bool) []map[string]any {
	base := "/templates/job_template/" + id
	var out []map[string]any
	for _, t := range [][2]string{{"details", "Details"}, {"access", "Access"}, {"notifications", "Notifications"}, {"schedules", "Schedules"}, {"jobs", "Jobs"}, {"survey", "Survey"}} {
		if t[0] == "notifications" && !notifications {
			continue
		}
		out = append(out, map[string]any{"key": t[0], "href": base + "/" + t[0], "label": t[1]})
	}
	return out
}

var notificationSearchKeys = []map[string]string{
	{"name": "Name", "key": "name__icontains"},
	{"name": "Description", "key": "description__icontains"},
	{"name": "Notification type", "key": "or__notification_type", "options": "notification_type"},
	{"name": "Created By (Username)", "key": "created_by__username__icontains"},
	{"name": "Modified By (Username)", "key": "modified_by__username__icontains"},
}

var notificationFilterLabels = searchLabels(notificationSearchKeys)

// notificationTypeLabels are the notification_type choices of the API.
var notificationTypeLabels = map[string]string{
	"email": "Email", "grafana": "Grafana", "irc": "IRC", "matrix": "Matrix", "mattermost": "Mattermost",
	"pagerduty": "Pagerduty", "rocketchat": "Rocket.Chat", "slack": "Slack", "twilio": "Twilio", "webhook": "Webhook",
}

var notificationSwitchLabels = map[string]string{"approvals": "Approval", "started": "Start", "success": "Success", "error": "Failure", "changed": "Changed"}
var notificationToggleLabels = map[string]string{"approvals": "approvals", "started": "start", "success": "success", "error": "failure", "changed": "changed"}

// isNotificationAdmin reports whether the user administers notifications in
// any organization, which is what lets them see and toggle them.
func (u *UI) isNotificationAdmin(r *http.Request) bool {
	res, err := u.apiCall(r, "GET", "/api/v2/organizations/?role_level=notification_admin_role&page_size=1", nil)
	return err == nil && res.Status == 200 && num(res.Data["count"]) > 0
}

// credRefList keeps, besides id and name, the kind label a credential chip
// shows ("SSH: name").
func credRefList(v any) []map[string]any {
	out := []map[string]any{}
	items, _ := v.([]any)
	for _, it := range items {
		if m, ok := it.(map[string]any); ok {
			out = append(out, map[string]any{"id": str(m["id"]), "name": str(m["name"]), "kind_label": credKindLabel(m)})
		}
	}
	return out
}

func (u *UI) loadJobTemplate(w http.ResponseWriter, r *http.Request, uc *userContext) (map[string]any, bool) {
	jt, ok := u.loadObject(w, r, uc, "/api/v2/job_templates/"+r.PathValue("id")+"/")
	if !ok {
		return nil, false
	}
	// As Template.tsx did: the key comes from its own endpoint, which only
	// those who may change the template can read, once a service is set.
	if dig(jt, "summary_fields", "user_capabilities", "edit") == true && has(jt["webhook_service"]) && has(dig(jt, "related", "webhook_key")) {
		if kres, err := u.apiCall(r, "GET", "/api/v2/job_templates/"+str(jt["id"])+"/webhook_key/", nil); err == nil && kres.Status == 200 {
			jt["webhook_key"] = kres.Data["webhook_key"]
		}
	}
	return jt, true
}

var verbosityLabels = map[string]string{"0": "0 (Normal)", "1": "1 (Verbose)", "2": "2 (More Verbose)", "3": "3 (Debug)", "4": "4 (Connection Debug)", "5": "5 (WinRM Debug)"}

func (u *UI) jobTemplatePage(r *http.Request, uc *userContext, jt map[string]any, title, tab string) *page {
	p := u.newPage(r, uc, title)
	p.Nav = navigation(uc, "/templates")
	p.Data["jt"] = jt
	p.Data["tab"] = tab
	p.Data["tabs"] = jobTemplateTabs(str(jt["id"]), uc.User.IsSystemAuditor || u.isNotificationAdmin(r))
	if tab == "access" {
		u.accessTab(r, p, "/api/v2/job_templates/"+str(jt["id"])+"/", jt)
	}
	return p
}

func (u *UI) jobTemplateDetail(w http.ResponseWriter, r *http.Request, uc *userContext) {
	jt, ok := u.loadJobTemplate(w, r, uc)
	if !ok {
		return
	}
	p := u.jobTemplatePage(r, uc, jt, "Details", "details")
	p.Data["verbosity"] = p.Loc.T(verbosityLabels[str(jt["verbosity"])])
	p.Data["instance_groups"] = u.listResults(r, "/api/v2/job_templates/"+str(jt["id"])+"/instance_groups/?page_size=200")
	p.Data["origin"] = requestOrigin(r)
	// Enabled options, in the order the old detail listed them.
	var opts []string
	if jt["become_enabled"] == true {
		opts = append(opts, "Privilege Escalation")
	}
	if has(jt["host_config_key"]) {
		opts = append(opts, "Provisioning Callbacks")
	}
	if jt["allow_simultaneous"] == true {
		opts = append(opts, "Concurrent Jobs")
	}
	if jt["use_fact_cache"] == true {
		opts = append(opts, "Fact Storage")
	}
	if has(jt["webhook_service"]) {
		opts = append(opts, "Webhooks")
	}
	if jt["prevent_instance_group_fallback"] == true {
		opts = append(opts, "Prevent Instance Group Fallback")
	}
	if jt["prevent_relaunch"] == true {
		opts = append(opts, "Prevent Relaunch")
	}
	for i, o := range opts {
		opts[i] = p.Loc.T(o)
	}
	p.Data["options"] = opts
	p.Data["editor"] = true
	u.render(w, r, "job_templates_detail", p)
}

func requestOrigin(r *http.Request) string {
	return api.RequestScheme(r) + "://" + r.Host
}

var jobTemplateTabTitles = map[string]string{"access": "Access", "notifications": "Notifications", "schedules": "Schedules", "jobs": "Jobs", "survey": "Survey"}

var templateJobSearchKeys = []map[string]string{
	{"name": "Name", "key": "name__icontains"},
	{"name": "ID", "key": "id"},
	{"name": "Label Name", "key": "labels__name__icontains"},
	{"name": "Launched By (Username)", "key": "created_by__username__icontains"},
	{"name": "Status", "key": "or__status"},
	{"name": "Limit", "key": "limit"},
}

func (u *UI) jobTemplateTab(w http.ResponseWriter, r *http.Request, uc *userContext) {
	jt, ok := u.loadJobTemplate(w, r, uc)
	if !ok {
		return
	}
	id := str(jt["id"])
	tab := lastPathSegment(r)
	p := u.jobTemplatePage(r, uc, jt, jobTemplateTabTitles[tab], tab)
	switch tab {
	case "jobs":
		if err := u.listPage(r, p, "job", "/api/v2/job_templates/"+id+"/jobs/", url.Values{"order_by": {"-finished"}}, jobFilterLabels); err != nil {
			u.api.Log.ErrorContext(r.Context(), "template jobs", "err", err)
		}
		p.Data["searchKeys"] = templateJobSearchKeys
	case "survey":
		res, err := u.apiCall(r, "GET", "/api/v2/job_templates/"+id+"/survey_spec/", nil)
		if err == nil && res.Status == 200 {
			p.Data["survey"] = res.Data
			p.Data["questions"] = surveyQuestions(res.Data)
		}
	case "schedules":
		if err := u.listPage(r, p, "schedule", "/api/v2/job_templates/"+id+"/schedules/", url.Values{"order_by": {"name"}}, nil); err != nil {
			u.api.Log.ErrorContext(r.Context(), "template schedules", "err", err)
		}
	case "notifications":
		if err := u.listPage(r, p, "notification", "/api/v2/notification_templates/", url.Values{"order_by": {"name"}, "page_size": {"5"}}, notificationFilterLabels); err != nil {
			u.api.Log.ErrorContext(r.Context(), "notification templates", "err", err)
		}
		for _, k := range []string{"started", "success", "error", "changed"} {
			p.Data[k] = idSet(u.listResults(r, "/api/v2/job_templates/"+id+"/notification_templates_"+k+"/?page_size=200"))
		}
		p.Data["searchKeys"] = notificationSearchKeys
		p.Data["typeLabels"] = notificationTypeLabels
		p.Data["switchLabels"] = translatedLabels(p, notificationSwitchLabels)
		p.Data["toggleLabels"] = notificationToggleLabels
		p.Data["canToggle"] = u.isNotificationAdmin(r)
		p.Data["notifyApi"] = "/api/v2/job_templates/" + id + "/"
	}
	u.render(w, r, "job_templates_detail", p)
}

// idSet maps the ids of a list of API objects to true.
func idSet(items []any) map[string]bool {
	out := map[string]bool{}
	for _, it := range items {
		if m, ok := it.(map[string]any); ok {
			out[str(m["id"])] = true
		}
	}
	return out
}

// surveyQuestions returns the survey questions with the display fields the
// survey list shows.
func surveyQuestions(spec map[string]any) []map[string]any {
	items, _ := spec["spec"].([]any)
	var out []map[string]any
	for _, it := range items {
		q, ok := it.(map[string]any)
		if !ok {
			continue
		}
		d := map[string]any{}
		for k, v := range q {
			d[k] = v
		}
		def := ""
		switch v := q["default"].(type) {
		case string:
			def = v
		case nil:
		default:
			def = str(v)
		}
		d["_default"] = def
		if str(q["type"]) == "multiselect" && def != "" {
			var chips []map[string]any
			for _, c := range strings.Split(def, "\n") {
				chips = append(chips, map[string]any{"name": c})
			}
			d["_default_chips"] = chips
		}
		out = append(out, d)
	}
	return out
}

// --- job template form ---------------------------------------------------------

// jobTemplateFormValues shapes a template (or a posted form) for the form.
func jobTemplateFormValues(data map[string]any) map[string]any {
	v := map[string]any{}
	for _, k := range []string{"name", "description", "job_type", "playbook", "scm_branch", "limit", "job_tags", "skip_tags", "host_config_key", "webhook_service", "webhook_key", "job_slice_pinned_hosts", "extra_vars"} {
		v[k] = str(data[k])
	}
	if v["job_type"] == "" {
		v["job_type"] = "run"
	}
	if v["extra_vars"] == "" {
		v["extra_vars"] = "---\n"
	}
	for _, k := range []string{"forks", "verbosity", "job_slice_count", "timeout"} {
		v[k] = str(data[k])
	}
	if v["forks"] == "" {
		v["forks"] = "0"
	}
	if v["verbosity"] == "" {
		v["verbosity"] = "0"
	}
	if v["job_slice_count"] == "" {
		v["job_slice_count"] = "1"
	}
	if v["timeout"] == "" {
		v["timeout"] = "0"
	}
	// The saved key, which the form puts back when the service is set to
	// the saved one again and which enables the refresh button.
	v["initial_webhook_key"] = str(data["webhook_key"])
	if s, ok := data["initial_webhook_key"].(string); ok {
		v["initial_webhook_key"] = s
	}
	for _, k := range []string{"ask_job_type_on_launch", "ask_inventory_on_launch", "ask_execution_environment_on_launch", "ask_credential_on_launch", "ask_labels_on_launch", "ask_variables_on_launch",
		"ask_forks_on_launch", "ask_limit_on_launch", "ask_verbosity_on_launch", "ask_job_slice_count_on_launch", "ask_timeout_on_launch", "ask_diff_mode_on_launch",
		"ask_instance_groups_on_launch", "ask_tags_on_launch", "ask_skip_tags_on_launch", "ask_scm_branch_on_launch",
		"diff_mode", "become_enabled", "allow_simultaneous", "use_fact_cache", "prevent_instance_group_fallback", "prevent_relaunch"} {
		v[k] = data[k] == true
	}
	for _, k := range []string{"inventory", "project", "execution_environment", "webhook_credential"} {
		v[k] = refValue(data, k)
	}
	v["project_allow_override"] = false
	if sf := dig(data, "summary_fields", "project"); sf != nil {
		if m, ok := sf.(map[string]any); ok {
			v["project_allow_override"] = m["allow_override"] == true
		}
	}
	if ao, ok := data["project_allow_override"].(bool); ok {
		v["project_allow_override"] = ao
	}
	v["credentials"] = credRefList(dig(data, "summary_fields", "credentials"))
	if c, ok := data["credentials"].([]map[string]any); ok {
		v["credentials"] = c
	}
	v["labels"] = refList(dig(data, "summary_fields", "labels", "results"))
	if l, ok := data["labels"].([]map[string]any); ok {
		v["labels"] = l
	}
	v["instance_groups"] = []map[string]any{}
	if ig, ok := data["instance_groups"].([]map[string]any); ok {
		v["instance_groups"] = ig
	}
	v["enable_callbacks"] = has(data["host_config_key"])
	if b, ok := data["enable_callbacks"].(bool); ok {
		v["enable_callbacks"] = b
	}
	v["enable_webhook"] = has(data["webhook_service"])
	if b, ok := data["enable_webhook"].(bool); ok {
		v["enable_webhook"] = b
	}
	return v
}

// jobTemplateFromPost reads the posted form into the API payload and the
// values for re-rendering.
func jobTemplateFromPost(r *http.Request) (map[string]any, map[string]any) {
	f := r.PostForm
	payload := map[string]any{
		"name": f.Get("name"), "description": f.Get("description"), "job_type": f.Get("job_type"), "playbook": f.Get("playbook"),
		"scm_branch": f.Get("scm_branch"), "limit": f.Get("limit"), "job_tags": f.Get("job_tags"), "skip_tags": f.Get("skip_tags"),
		"job_slice_pinned_hosts": f.Get("job_slice_pinned_hosts"), "extra_vars": formText(f, "extra_vars"),
		"forks": atoiDefault(f.Get("forks"), 0), "verbosity": atoiDefault(f.Get("verbosity"), 0), "job_slice_count": atoiDefault(f.Get("job_slice_count"), 1), "timeout": atoiDefault(f.Get("timeout"), 0),
	}
	for _, k := range []string{"ask_job_type_on_launch", "ask_inventory_on_launch", "ask_execution_environment_on_launch", "ask_credential_on_launch", "ask_labels_on_launch", "ask_variables_on_launch",
		"ask_forks_on_launch", "ask_limit_on_launch", "ask_verbosity_on_launch", "ask_job_slice_count_on_launch", "ask_timeout_on_launch", "ask_diff_mode_on_launch",
		"ask_instance_groups_on_launch", "ask_tags_on_launch", "ask_skip_tags_on_launch", "ask_scm_branch_on_launch",
		"diff_mode", "become_enabled", "allow_simultaneous", "use_fact_cache", "prevent_instance_group_fallback", "prevent_relaunch"} {
		payload[k] = f.Get(k) == "on"
	}
	for _, k := range []string{"inventory", "project", "execution_environment", "webhook_credential"} {
		if id := strings.TrimSpace(f.Get(k)); id != "" {
			payload[k] = atoiDefault(id, 0)
		} else {
			payload[k] = nil
		}
	}
	if f.Get("enable_callbacks") == "on" {
		payload["host_config_key"] = f.Get("host_config_key")
	} else {
		payload["host_config_key"] = ""
	}
	if f.Get("enable_webhook") == "on" {
		payload["webhook_service"] = f.Get("webhook_service")
		if k := strings.TrimSpace(f.Get("webhook_key")); k != "" {
			payload["webhook_key"] = k
		}
	} else {
		payload["webhook_service"] = ""
		payload["webhook_credential"] = nil
	}
	values := map[string]any{}
	for k, v := range payload {
		values[k] = v
	}
	for _, k := range []string{"inventory", "project", "execution_environment", "webhook_credential"} {
		values[k] = map[string]any{"id": f.Get(k), "name": f.Get(k + "_name")}
	}
	values["credentials"] = multiRefs(f, "credentials")
	for i, c := range values["credentials"].([]map[string]any) {
		c["kind_label"] = ""
		if labels := f["credentials_kind_label"]; i < len(labels) {
			c["kind_label"] = labels[i]
		}
	}
	values["labels"] = multiRefs(f, "labels")
	values["instance_groups"] = multiRefs(f, "instance_groups")
	values["enable_callbacks"] = f.Get("enable_callbacks") == "on"
	values["enable_webhook"] = f.Get("enable_webhook") == "on"
	values["host_config_key"] = f.Get("host_config_key")
	values["webhook_service"] = f.Get("webhook_service")
	values["webhook_key"] = f.Get("webhook_key")
	values["initial_webhook_key"] = f.Get("initial_webhook_key")
	values["project_allow_override"] = f.Get("project_allow_override") == "true"
	return payload, jobTemplateFormValues(values)
}

func (u *UI) jobTemplateFormCommon(r *http.Request, p *page) {
	p.Data["origin"] = requestOrigin(r)
	p.Data["editor"] = true
	T := p.Loc.T
	p.Data["jobTypes"] = []map[string]string{{"value": "run", "label": T("Run")}, {"value": "check", "label": T("Check")}}
	p.Data["verbosities"] = []map[string]string{{"value": "0", "label": T("0 (Normal)")}, {"value": "1", "label": T("1 (Verbose)")}, {"value": "2", "label": T("2 (More Verbose)")}, {"value": "3", "label": T("3 (Debug)")}, {"value": "4", "label": T("4 (Connection Debug)")}, {"value": "5", "label": T("5 (WinRM Debug)")}}
	p.Data["webhookServices"] = []map[string]string{{"value": "github", "label": T("GitHub")}, {"value": "gitlab", "label": T("GitLab")}, {"value": "bitbucket_dc", "label": T("Bitbucket Data Center")}}
}

// saveJobTemplateRelations attaches the credentials, labels and instance
// groups of the form to a saved template.
func (u *UI) saveJobTemplateRelations(r *http.Request, id string, values map[string]any, orgID int64) *apiResult {
	base := "/api/v2/job_templates/" + id + "/"
	if res := u.syncRelation(r, base+"credentials/", refIDs(values["credentials"].([]map[string]any))); res != nil {
		return res
	}
	if res := u.orderInstanceGroups(r, base+"instance_groups/", values["instance_groups"].([]map[string]any)); res != nil {
		return res
	}
	return u.syncLabels(r, base+"labels/", values["labels"].([]map[string]any), orgID)
}

func (u *UI) jobTemplateAdd(w http.ResponseWriter, r *http.Request, uc *userContext) {
	p := u.newPage(r, uc, "Create New Job Template")
	p.Nav = navigation(uc, "/templates")
	u.jobTemplateFormCommon(r, p)
	if r.Method == http.MethodPost {
		payload, values := jobTemplateFromPost(r)
		u.submitForm(w, r, p, "job_templates_form", "POST", "/api/v2/job_templates/", payload, values, "/templates/job_template/{id}/details", func(jt map[string]any) *apiResult {
			return u.saveJobTemplateRelations(r, str(jt["id"]), values, u.labelOrganization(r, jt))
		})
		return
	}
	seed := map[string]any{"job_type": "run", "use_fact_cache": false}
	// Reached from a project's, inventory's or credential's Job Templates
	// tab, the form starts with that resource filled in.
	q := r.URL.RawQuery
	if strings.Contains(q, "resource_id") && strings.Contains(q, "resource_name") {
		v := r.URL.Query()
		id, name, typ, kind := v.Get("resource_id"), v.Get("resource_name"), v.Get("resource_type"), v.Get("resource_kind")
		if n, err := strconv.Atoi(id); err == nil && typ != "" {
			sf := map[string]any{}
			if typ == "credentials" {
				sf["credentials"] = []any{map[string]any{"id": n, "name": name, "kind": kind}}
			} else {
				sf[typ] = map[string]any{"id": n, "name": name}
			}
			seed["summary_fields"] = sf
		}
	}
	// ProjectLookup autoPopulate, unless the form came with a project.
	if sf, _ := seed["summary_fields"].(map[string]any); sf == nil || sf["project"] == nil {
		if ref, proj := u.autoLookup(r, "/api/v2/projects/", "role_level=use_role&order_by=name"); proj != nil {
			if sf == nil {
				sf = map[string]any{}
				seed["summary_fields"] = sf
			}
			sf["project"] = map[string]any{"id": ref["id"], "name": ref["name"], "allow_override": proj["allow_override"] == true}
		}
	}
	p.Data["values"] = jobTemplateFormValues(seed)
	u.render(w, r, "job_templates_form", p)
}

func (u *UI) jobTemplateEdit(w http.ResponseWriter, r *http.Request, uc *userContext) {
	jt, ok := u.loadJobTemplate(w, r, uc)
	if !ok {
		return
	}
	id := str(jt["id"])
	p := u.jobTemplatePage(r, uc, jt, "Edit Details", "details")
	u.jobTemplateFormCommon(r, p)
	if r.Method == http.MethodPost {
		payload, values := jobTemplateFromPost(r)
		u.submitForm(w, r, p, "job_templates_form", "PATCH", "/api/v2/job_templates/"+id+"/", payload, values, "/templates/job_template/"+id+"/details", func(saved map[string]any) *apiResult {
			return u.saveJobTemplateRelations(r, id, values, u.labelOrganization(r, saved))
		})
		return
	}
	// Every instance group, which the save puts in order: a form that
	// could not load them all is not shown.
	igs, status, ok := u.listAll(r, "/api/v2/job_templates/"+id+"/instance_groups/")
	if !ok {
		p.Data["loadError"] = status
		u.render(w, r, "job_templates_form", p)
		return
	}
	jt["instance_groups"] = refList(igs)
	jt["credentials"] = credRefList(u.listResults(r, "/api/v2/job_templates/"+id+"/credentials/?page_size=200"))
	jt["labels"] = refList(u.listResults(r, "/api/v2/job_templates/"+id+"/labels/?page_size=200"))
	p.Data["values"] = jobTemplateFormValues(jt)
	u.render(w, r, "job_templates_form", p)
}

// --- survey questions --------------------------------------------------------------

var surveyTypes = []map[string]string{
	{"value": "text", "label": "Text"}, {"value": "textarea", "label": "Textarea"}, {"value": "password", "label": "Password"},
	{"value": "multiplechoice", "label": "Multiple Choice (single select)"}, {"value": "multiselect", "label": "Multiple Choice (multiple select)"},
	{"value": "integer", "label": "Integer"}, {"value": "float", "label": "Float"},
}

// surveyQuestionValues shapes a question for the form.
func surveyQuestionValues(q map[string]any) map[string]any {
	v := map[string]any{"question_name": str(q["question_name"]), "question_description": str(q["question_description"]), "variable": str(q["variable"]), "type": str(q["type"])}
	if v["type"] == "" {
		v["type"] = "text"
	}
	v["required"] = q["required"] == true
	if _, ok := q["required"]; !ok {
		v["required"] = true
	}
	v["min"] = str(q["min"])
	if v["min"] == "" {
		v["min"] = "0"
	}
	v["max"] = str(q["max"])
	if v["max"] == "" {
		v["max"] = "1024"
	}
	def := ""
	switch d := q["default"].(type) {
	case string:
		def = d
	case nil:
	default:
		def = str(d)
	}
	v["default"] = def
	// Choices with their default flags, for the multiple choice editor.
	var choices []string
	switch c := q["choices"].(type) {
	case string:
		for _, line := range strings.Split(c, "\n") {
			if strings.TrimSpace(line) != "" {
				choices = append(choices, line)
			}
		}
	case []any:
		for _, x := range c {
			choices = append(choices, str(x))
		}
	}
	defaults := map[string]bool{}
	for _, line := range strings.Split(def, "\n") {
		defaults[line] = true
	}
	var rows []map[string]any
	for _, c := range choices {
		rows = append(rows, map[string]any{"choice": c, "isDefault": defaults[c]})
	}
	if len(rows) == 0 {
		rows = append(rows, map[string]any{"choice": "", "isDefault": false})
	}
	v["choices"] = rows
	return v
}

// surveyQuestionFromPost builds the question the API stores.
func surveyQuestionFromPost(f url.Values) (map[string]any, map[string]any) {
	q := map[string]any{
		"question_name": f.Get("question_name"), "question_description": f.Get("question_description"), "required": f.Get("required") == "on",
		"type": f.Get("type"), "variable": strings.TrimSpace(f.Get("variable")), "new_question": true,
	}
	typ := str(q["type"])
	values := map[string]any{}
	for k, v := range q {
		values[k] = v
	}
	values["min"], values["max"], values["default"] = f.Get("min"), f.Get("max"), f.Get("default")
	switch typ {
	case "text", "textarea", "password":
		q["min"] = atoiDefault(f.Get("min"), 0)
		q["max"] = atoiDefault(f.Get("max"), 1024)
		q["default"] = formText(f, "default")
	case "integer":
		q["min"] = atoiDefault(f.Get("min"), 0)
		q["max"] = atoiDefault(f.Get("max"), 1024)
		if d := strings.TrimSpace(f.Get("default")); d != "" {
			if n, err := strconv.ParseInt(d, 10, 64); err == nil {
				q["default"] = n
			} else {
				q["default"] = d
			}
		} else {
			q["default"] = ""
		}
	case "float":
		q["min"] = atoiDefault(f.Get("min"), 0)
		q["max"] = atoiDefault(f.Get("max"), 1024)
		if d := strings.TrimSpace(f.Get("default")); d != "" {
			if n, err := strconv.ParseFloat(d, 64); err == nil {
				q["default"] = n
			} else {
				q["default"] = d
			}
		} else {
			q["default"] = ""
		}
	case "multiplechoice", "multiselect":
		choices, defaults := f["choice"], f["choice_default"]
		var rows []map[string]any
		var kept, defs []string
		for i, c := range choices {
			c = strings.TrimSpace(c)
			if c == "" {
				continue
			}
			isDef := i < len(defaults) && defaults[i] == "on"
			rows = append(rows, map[string]any{"choice": c, "isDefault": isDef})
			kept = append(kept, c)
			if isDef {
				defs = append(defs, c)
			}
		}
		q["choices"] = strings.Join(kept, "\n")
		q["default"] = strings.Join(defs, "\n")
		q["min"] = 0
		q["max"] = 1024
		values["choices"] = rows
	}
	if typ != "multiplechoice" && typ != "multiselect" {
		values["choices"] = []map[string]any{{"choice": "", "isDefault": false}}
	}
	return q, values
}

// surveyQuestionForm serves the survey question add and edit pages: the
// question is merged into the template's survey spec and saved.
func (u *UI) surveyQuestionForm(w http.ResponseWriter, r *http.Request, uc *userContext) {
	// Job templates and workflow job templates share the survey screens.
	kind, coll := "job_template", "job_templates"
	if strings.HasPrefix(r.URL.Path, "/templates/workflow_job_template/") {
		kind, coll = "workflow_job_template", "workflow_job_templates"
	}
	var jt map[string]any
	var ok bool
	if kind == "job_template" {
		jt, ok = u.loadJobTemplate(w, r, uc)
	} else {
		jt, ok = u.loadWorkflowTemplate(w, r, uc)
	}
	if !ok {
		return
	}
	id := str(jt["id"])
	editing := strings.HasSuffix(r.URL.Path, "/edit")
	res, err := u.apiCall(r, "GET", "/api/v2/"+coll+"/"+id+"/survey_spec/", nil)
	spec := map[string]any{"name": "", "description": "", "spec": []any{}}
	if err == nil && res.Status == 200 && len(res.Data) > 0 {
		spec = res.Data
	}
	questions, _ := spec["spec"].([]any)
	variable := r.URL.Query().Get("question_variable")
	var current map[string]any
	if editing {
		for _, it := range questions {
			if q, ok := it.(map[string]any); ok && str(q["variable"]) == variable {
				current = q
			}
		}
		if current == nil {
			u.notFound(w, r, uc)
			return
		}
	}
	title := "Add Question"
	if editing {
		title = "Edit Question"
	}
	var p *page
	if kind == "job_template" {
		p = u.jobTemplatePage(r, uc, jt, title, "survey")
	} else {
		p = u.workflowTemplatePage(r, uc, jt, title, "survey")
		p.Data["jt"] = jt
	}
	p.Data["kind"] = kind
	p.Data["editing"] = editing
	types := make([]map[string]string, len(surveyTypes))
	for i, st := range surveyTypes {
		types[i] = map[string]string{"value": st["value"], "label": p.Loc.T(st["label"])}
	}
	p.Data["surveyTypes"] = types
	p.Data["question"] = current
	if r.Method == http.MethodPost {
		q, values := surveyQuestionFromPost(r.PostForm)
		p.Data["values"] = values
		errs := map[string][]string{}
		if str(q["question_name"]) == "" {
			errs["question_name"] = []string{p.Loc.T("This field must not be blank")}
		}
		if str(q["variable"]) == "" {
			errs["variable"] = []string{p.Loc.T("This field must not be blank")}
		} else if strings.ContainsAny(str(q["variable"]), " \t") {
			errs["variable"] = []string{p.Loc.T("This field must not contain spaces")}
		}
		var newSpec []any
		dup := false
		for _, it := range questions {
			m, _ := it.(map[string]any)
			if editing && str(m["variable"]) == variable {
				newSpec = append(newSpec, q)
				continue
			}
			if str(m["variable"]) == str(q["variable"]) {
				dup = true
			}
			newSpec = append(newSpec, m)
		}
		if !editing {
			newSpec = append(newSpec, q)
		}
		if dup {
			errs["variable"] = []string{p.Loc.T("A question with this variable name already exists")}
		}
		if len(errs) == 0 {
			if editing && str(q["type"]) == "password" && str(q["default"]) == "$encrypted$" {
				// Keep the stored encrypted default.
				q["default"] = "$encrypted$"
			}
			body := map[string]any{"name": str(spec["name"]), "description": str(spec["description"]), "spec": newSpec}
			sres, err := u.apiCall(r, "POST", "/api/v2/"+coll+"/"+id+"/survey_spec/", body)
			if err == nil && sres.Status == 200 {
				http.Redirect(w, r, "/templates/"+kind+"/"+id+"/survey", http.StatusFound)
				return
			}
			errs = apiErrors(sres)
			if msg, ok := errs["error"]; ok {
				errs["__all__"] = msg
			}
		}
		p.Errors = errs
		u.render(w, r, "job_templates_survey_form", p)
		return
	}
	if editing {
		p.Data["values"] = surveyQuestionValues(current)
	} else {
		p.Data["values"] = surveyQuestionValues(map[string]any{})
	}
	u.render(w, r, "job_templates_survey_form", p)
}

// --- helpers ---------------------------------------------------------------------------

// notificationsTab fills the data of a Notifications tab (NotificationList):
// every notification template, with the ones the resource notifies on each
// kind switched on.
func (u *UI) notificationsTab(r *http.Request, p *page, apiBase string, kinds []string, canToggle bool) {
	if err := u.listPage(r, p, "notification", "/api/v2/notification_templates/", url.Values{"order_by": {"name"}, "page_size": {"5"}}, notificationFilterLabels); err != nil {
		u.api.Log.ErrorContext(r.Context(), "notification templates", "err", err)
	}
	for _, k := range kinds {
		p.Data[k] = idSet(u.listResults(r, apiBase+"notification_templates_"+k+"/?page_size=200"))
	}
	p.Data["searchKeys"] = notificationSearchKeys
	p.Data["typeLabels"] = notificationTypeLabels
	p.Data["switchLabels"] = translatedLabels(p, notificationSwitchLabels)
	p.Data["toggleLabels"] = notificationToggleLabels
	p.Data["canToggle"] = canToggle
	p.Data["notifyApi"] = apiBase
}

// translatedLabels returns labels in the page's language.
func translatedLabels(p *page, labels map[string]string) map[string]string {
	out := make(map[string]string, len(labels))
	for k, v := range labels {
		out[k] = p.Loc.T(v)
	}
	return out
}
