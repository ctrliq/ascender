package web

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
)

// Schedule screens: the global list, the schedule tabs of templates,
// projects, management jobs and inventory sources, and each schedule's
// detail and form pages. A schedule page always hangs off the thing it
// runs, as the old UI's routes did.

// scheduleOwner is the template a schedule page belongs to.
type scheduleOwner struct {
	Kind       string // job_template, workflow_job_template, project, system_job_template, inventory_source
	ID         string
	Name       string
	Base       string // the owner's UI path the schedule pages hang off
	API        string // the API sub-list schedules are created on
	Stream     string
	Resource   map[string]any
	Launch     map[string]any // the template's launch configuration
	Survey     map[string]any
	Creds      []any // a job template's credentials
	Crumbs     []map[string]any
	Back       map[string]any
	Tabs       []map[string]any
	DaysToKeep bool
	IsTemplate bool
	Page       string // the page template that draws the owner's tab bar
}

// scheduleOwnerRoutes maps the owner path patterns to their kinds.
var scheduleOwnerRoutes = [][2]string{
	{"/templates/job_template/{id}", "job_template"},
	{"/templates/workflow_job_template/{id}", "workflow_job_template"},
	{"/projects/{id}", "project"},
	{"/management_jobs/{id}", "system_job_template"},
	{"/inventories/inventory/{id}/sources/{srcid}", "inventory_source"},
}

func (u *UI) registerSchedules(mux *http.ServeMux) {
	mux.HandleFunc("/schedules", u.protected(u.scheduleGlobalList))
	mux.HandleFunc("/schedules/{$}", u.protected(u.scheduleGlobalList))
	mux.HandleFunc("/schedules/{sid}", u.protected(u.scheduleRedirect))
	mux.HandleFunc("/schedules/{sid}/{page}", u.protected(u.scheduleRedirect))
	for _, o := range scheduleOwnerRoutes {
		kind := o[1]
		with := func(fn func(http.ResponseWriter, *http.Request, *userContext, *scheduleOwner)) http.HandlerFunc {
			return u.protected(func(w http.ResponseWriter, r *http.Request, uc *userContext) {
				owner, ok := u.loadScheduleOwner(w, r, uc, kind)
				if !ok {
					return
				}
				fn(w, r, uc, owner)
			})
		}
		mux.HandleFunc(o[0]+"/schedules", with(u.scheduleOwnerList))
		mux.HandleFunc(o[0]+"/schedules/{$}", with(u.scheduleOwnerList))
		mux.HandleFunc(o[0]+"/schedules/add", with(u.scheduleForm))
		mux.HandleFunc(o[0]+"/schedules/{sid}", with(func(w http.ResponseWriter, r *http.Request, uc *userContext, o *scheduleOwner) {
			http.Redirect(w, r, o.Base+"/schedules/"+r.PathValue("sid")+"/details", http.StatusFound)
		}))
		mux.HandleFunc(o[0]+"/schedules/{sid}/details", with(u.scheduleDetail))
		mux.HandleFunc(o[0]+"/schedules/{sid}/edit", with(u.scheduleForm))
	}
	mux.HandleFunc("/management_jobs/{id}", u.protected(func(w http.ResponseWriter, r *http.Request, uc *userContext) {
		if !canSeeManagementJobs(uc) {
			u.notFound(w, r, uc)
			return
		}
		http.Redirect(w, r, "/management_jobs/"+r.PathValue("id")+"/schedules", http.StatusFound)
	}))
}

// loadScheduleOwner reads the owner named by the request path.
func (u *UI) loadScheduleOwner(w http.ResponseWriter, r *http.Request, uc *userContext, kind string) (*scheduleOwner, bool) {
	id := r.PathValue("id")
	o := &scheduleOwner{Kind: kind, ID: id, Page: "schedules_tab"}
	T := u.locale(r, uc).T
	get := func(path string) map[string]any {
		res, err := u.apiCall(r, "GET", path, nil)
		if err != nil || res.Status != 200 {
			return nil
		}
		return res.Data
	}
	switch kind {
	case "job_template", "workflow_job_template":
		coll := "job_templates"
		if kind == "workflow_job_template" {
			coll = "workflow_job_templates"
		}
		o.Resource = get("/api/v2/" + coll + "/" + id + "/")
		if o.Resource == nil {
			u.notFound(w, r, uc)
			return nil, false
		}
		o.IsTemplate = true
		o.Base = "/templates/" + kind + "/" + id
		o.API = "/api/v2/" + coll + "/" + id + "/schedules/"
		o.Stream = "job_template,workflow_job_template,workflow_job_template_node"
		o.Launch = get("/api/v2/" + coll + "/" + id + "/launch/")
		if o.Launch != nil && o.Launch["survey_enabled"] == true {
			o.Survey = get("/api/v2/" + coll + "/" + id + "/survey_spec/")
		}
		if kind == "job_template" {
			o.Creds = u.listResults(r, "/api/v2/job_templates/"+id+"/credentials/?page_size=200")
			o.Page = "job_templates_detail"
		}
		o.Crumbs = []map[string]any{{"href": "/templates", "title": T("Templates")}, {"href": o.Base, "title": str(o.Resource["name"])}}
		o.Back = map[string]any{"href": "/templates", "label": "Back to Templates"}
		if kind == "workflow_job_template" {
			o.Tabs = workflowTemplateTabs(id, uc.User.IsSystemAuditor || u.isNotificationAdmin(r), workflowCanEditSurvey(o.Resource))
		}
	case "project":
		o.Resource = get("/api/v2/projects/" + id + "/")
		if o.Resource == nil {
			u.notFound(w, r, uc)
			return nil, false
		}
		o.Base = "/projects/" + id
		o.API = "/api/v2/projects/" + id + "/schedules/"
		o.Stream = "project"
		o.Page = "projects_detail"
		if str(o.Resource["scm_type"]) == "" {
			// A manual project has no schedules: the project's frame with
			// ContentError's Not Found.
			p := u.newPage(r, uc, "Schedules")
			p.Nav = navigation(uc, "/projects")
			p.Data["project"] = o.Resource
			p.Data["tab"] = "schedules"
			p.Data["projectTabs"] = projectTabs(id, o.Resource, uc.User.IsSystemAuditor || u.isNotificationAdmin(r))
			p.Data["notFound"] = map[string]any{"href": "/projects/" + id + "/details", "text": p.Loc.T("View Project Details")}
			u.render(w, r, "projects_detail", p)
			return nil, false
		}
		o.Tabs = projectTabs(id, o.Resource, uc.User.IsSystemAuditor || u.isNotificationAdmin(r))
		o.Crumbs = []map[string]any{{"href": "/projects", "title": T("Projects")}, {"href": o.Base + "/details", "title": str(o.Resource["name"])}}
		o.Back = map[string]any{"href": "/projects", "label": "Back to Projects"}
	case "system_job_template":
		if !canSeeManagementJobs(uc) {
			u.notFound(w, r, uc)
			return nil, false
		}
		o.Resource = get("/api/v2/system_job_templates/" + id + "/")
		if o.Resource == nil {
			u.notFound(w, r, uc)
			return nil, false
		}
		o.Base = "/management_jobs/" + id
		o.API = "/api/v2/system_job_templates/" + id + "/schedules/"
		jobType := str(o.Resource["job_type"])
		o.DaysToKeep = jobType == "cleanup_activitystream" || jobType == "cleanup_jobs"
		o.Crumbs = []map[string]any{{"href": "/management_jobs", "title": T("Management job")}, {"href": o.Base, "title": str(o.Resource["name"])}}
		o.Back = map[string]any{"href": "/management_jobs", "label": "Back to management jobs"}
		o.Tabs = []map[string]any{{"key": "schedules", "href": o.Base + "/schedules", "label": "Schedules"}}
		if uc.User.IsSystemAuditor || u.isNotificationAdmin(r) {
			o.Tabs = append(o.Tabs, map[string]any{"key": "notifications", "href": o.Base + "/notifications", "label": "Notifications"})
		}
	case "inventory_source":
		srcID := r.PathValue("srcid")
		o.ID = srcID
		o.Resource = get("/api/v2/inventory_sources/" + srcID + "/")
		inv := get("/api/v2/inventories/" + id + "/")
		if o.Resource == nil || inv == nil || str(o.Resource["inventory"]) != id {
			u.notFound(w, r, uc)
			return nil, false
		}
		o.Base = "/inventories/inventory/" + id + "/sources/" + srcID
		o.API = "/api/v2/inventory_sources/" + srcID + "/schedules/"
		o.Stream = "inventory,inventory_source"
		o.Crumbs = []map[string]any{{"href": "/inventories", "title": T("Inventories")}, {"href": "/inventories/inventory/" + id + "/details", "title": str(inv["name"])}, {"href": "/inventories/inventory/" + id + "/sources", "title": T("Sources")}, {"href": o.Base + "/details", "title": str(o.Resource["name"])}}
		o.Back = map[string]any{"href": "/inventories/inventory/" + id + "/sources", "label": "Back to Sources"}
		o.Tabs = sourceTabs(o.Base, uc.User.IsSystemAuditor || u.isNotificationAdmin(r))
	}
	o.Name = str(o.Resource["name"])
	return o, true
}

// ownerPage starts a page under an owner, with the owner's tab bar data.
func (u *UI) ownerPage(r *http.Request, uc *userContext, o *scheduleOwner, title string) *page {
	var p *page
	switch o.Kind {
	case "job_template":
		p = u.jobTemplatePage(r, uc, o.Resource, title, "schedules")
	case "project":
		p = u.newPage(r, uc, title)
		p.Data["project"] = o.Resource
		p.Data["tab"] = "schedules"
	default:
		p = u.newPage(r, uc, title)
		p.Data["tab"] = "schedules"
	}
	switch o.Kind {
	case "job_template", "workflow_job_template":
		p.Nav = navigation(uc, "/templates")
	case "project":
		p.Nav = navigation(uc, "/projects")
	case "system_job_template":
		p.Nav = navigation(uc, "/management_jobs")
	case "inventory_source":
		p.Nav = navigation(uc, "/inventories")
	}
	p.Data["owner"] = o
	return p
}

var scheduleSearchKeys = []map[string]string{
	{"name": "Name", "key": "name__icontains"},
	{"name": "Description", "key": "description__icontains"},
	{"name": "Created By (Username)", "key": "created_by__username__icontains"},
	{"name": "Modified By (Username)", "key": "modified_by__username__icontains"},
}

var scheduleTypeLabels = map[string]string{"inventory_update": "Inventory Sync", "job": "Playbook Run", "project_update": "Source Control Update", "system_job": "Management Job", "workflow_job": "Workflow Job"}

// scheduleRow is what the list shows for one schedule.
type scheduleRow struct {
	S        map[string]any
	Base     string
	Related  string
	Type     string
	NextRun  string
	Enabled  bool
	CanEdit  bool
	Disabled bool
	Warnings []string
}

// scheduleBase is the UI path of a schedule's pages, from its template.
func scheduleBase(s map[string]any) (base, related string) {
	t, _ := dig(s, "summary_fields", "unified_job_template").(map[string]any)
	id := str(s["id"])
	tid := str(t["id"])
	switch str(t["unified_job_type"]) {
	case "inventory_update":
		inv := str(dig(s, "summary_fields", "inventory", "id"))
		if inv == "" {
			return "/schedules/" + id, "/inventories"
		}
		return "/inventories/inventory/" + inv + "/sources/" + tid + "/schedules/" + id, "/inventories/inventory/" + inv + "/sources/" + tid + "/details"
	case "job":
		return "/templates/job_template/" + tid + "/schedules/" + id, "/templates/job_template/" + tid + "/details"
	case "project_update":
		return "/projects/" + tid + "/schedules/" + id, "/projects/" + tid + "/details"
	case "system_job":
		return "/management_jobs/" + tid + "/schedules/" + id, "/management_jobs"
	case "workflow_job":
		return "/templates/workflow_job_template/" + tid + "/schedules/" + id, "/templates/workflow_job_template/" + tid + "/details"
	}
	return "/schedules/" + id, ""
}

// scheduleWarnings are the reasons a template's schedule cannot run:
// a missing inventory or unanswered required survey questions.
func scheduleWarnings(o *scheduleOwner, s map[string]any) []string {
	if o == nil || !o.IsTemplate || o.Launch == nil {
		return nil
	}
	var out []string
	if o.Launch["inventory_needed_to_start"] == true && dig(s, "summary_fields", "inventory", "id") == nil {
		out = append(out, "This schedule is missing an Inventory")
	}
	if o.Launch["survey_enabled"] == true && surveyValuesMissing(o.Survey, s) {
		out = append(out, "This schedule is missing required survey values")
	}
	return out
}

// surveyValuesMissing ports the old hasMissingSurveyValue check.
func surveyValuesMissing(survey, s map[string]any) bool {
	if survey == nil {
		return false
	}
	spec, _ := survey["spec"].([]any)
	extra, _ := s["extra_data"].(map[string]any)
	missing := false
	for _, q := range spec {
		qm, _ := q.(map[string]any)
		if qm["required"] != true || has(qm["default"]) {
			continue
		}
		_, hasKey := extra[str(qm["variable"])]
		for _, v := range extra {
			if !has(v) || !hasKey {
				missing = true
			} else {
				missing = false
			}
		}
		if len(extra) == 0 {
			missing = true
		}
	}
	return missing
}

// scheduleListData fills a page with a list of schedules.
func (u *UI) scheduleListData(r *http.Request, p *page, o *scheduleOwner, api string) {
	if err := u.listPage(r, p, "schedule", api, map[string][]string{"order_by": {"name"}}, nil); err != nil {
		u.api.Log.ErrorContext(r.Context(), "schedule list", "err", err)
	}
	results, _ := p.Data["results"].([]any)
	rows := make([]scheduleRow, 0, len(results))
	for _, it := range results {
		s, _ := it.(map[string]any)
		if s == nil {
			continue
		}
		row := scheduleRow{S: s, Enabled: s["enabled"] == true, CanEdit: dig(s, "summary_fields", "user_capabilities", "edit") == true}
		row.Base, row.Related = scheduleBase(s)
		row.Type = p.Loc.T(scheduleTypeLabels[str(dig(s, "summary_fields", "unified_job_template", "unified_job_type"))])
		row.NextRun = formatInZone(str(s["next_run"]), str(s["timezone"]))
		row.Warnings = scheduleWarnings(o, s)
		for i, w := range row.Warnings {
			row.Warnings[i] = p.Loc.T(w)
		}
		row.Disabled = len(row.Warnings) > 0 || !row.CanEdit
		rows = append(rows, row)
	}
	p.Data["rows"] = rows
	p.Data["searchKeys"] = scheduleSearchKeys
	if o != nil {
		p.Data["addHref"] = o.Base + "/schedules/add"
		p.Data["emptyBody"] = p.Loc.T("Please add a Schedule to populate this list.")
	} else {
		p.Data["emptyBody"] = p.Loc.T("Please add a Schedule to populate this list.  Schedules can be added to a Template, Project, or Inventory Source.")
	}
}

func (u *UI) scheduleGlobalList(w http.ResponseWriter, r *http.Request, uc *userContext) {
	p := u.newPage(r, uc, "Schedules")
	u.scheduleListData(r, p, nil, "/api/v2/schedules/")
	u.render(w, r, "schedules_list", p)
}

// scheduleRedirect sends a bare schedule link to the page under its owner.
func (u *UI) scheduleRedirect(w http.ResponseWriter, r *http.Request, uc *userContext) {
	sched, ok := u.loadObject(w, r, uc, "/api/v2/schedules/"+r.PathValue("sid")+"/")
	if !ok {
		return
	}
	base, _ := scheduleBase(sched)
	page := r.PathValue("page")
	if page == "" || strings.HasPrefix(base, "/schedules/") {
		page = "details"
	}
	if strings.HasPrefix(base, "/schedules/") {
		u.notFound(w, r, uc)
		return
	}
	http.Redirect(w, r, base+"/"+page, http.StatusFound)
}

func (u *UI) scheduleOwnerList(w http.ResponseWriter, r *http.Request, uc *userContext, o *scheduleOwner) {
	p := u.ownerPage(r, uc, o, "Schedules")
	u.scheduleListData(r, p, o, o.API)
	u.render(w, r, o.Page, p)
}

// loadSchedule reads a schedule that belongs to the owner.
func (u *UI) loadSchedule(w http.ResponseWriter, r *http.Request, uc *userContext, o *scheduleOwner) (map[string]any, bool) {
	res, err := u.apiCall(r, "GET", "/api/v2/schedules/"+r.PathValue("sid")+"/", nil)
	if err != nil || res.Status != 200 || str(dig(res.Data, "summary_fields", "unified_job_template", "id")) != o.ID {
		u.notFound(w, r, uc)
		return nil, false
	}
	return res.Data, true
}

// schedulePage starts a page for one schedule: the owner's crumbs, then
// Schedules and the schedule's name.
func (u *UI) schedulePage(r *http.Request, uc *userContext, o *scheduleOwner, s map[string]any, title string) *page {
	p := u.ownerPage(r, uc, o, title)
	crumbs := append(append([]map[string]any{}, o.Crumbs...), map[string]any{"href": o.Base + "/schedules", "title": p.Loc.T("Schedules")})
	if s != nil {
		crumbs = append(crumbs, map[string]any{"href": o.Base + "/schedules/" + str(s["id"]), "title": str(s["name"])})
	}
	p.Data["crumbs"] = crumbs
	p.Data["schedule"] = s
	return p
}

// promptDetail is one prompted value the detail page lists.
type promptDetail struct {
	Label, Value, Cy string
	Chips            []map[string]any
	Link             string
	FullWidth        bool
	Variables        string
}

func (u *UI) scheduleDetail(w http.ResponseWriter, r *http.Request, uc *userContext, o *scheduleOwner) {
	s, ok := u.loadSchedule(w, r, uc, o)
	if !ok {
		return
	}
	p := u.schedulePage(r, uc, o, s, "Details")
	id := str(s["id"])
	tz := str(s["timezone"])
	now := time.Now()
	values := scheduleValuesFromAPI(s, now)
	p.Data["values"] = values
	p.Data["sbase"] = o.Base + "/schedules/" + id
	p.Data["firstRun"] = formatInZone(str(s["dtstart"]), tz)
	p.Data["nextRun"] = formatInZone(str(s["next_run"]), tz)
	p.Data["lastRun"] = formatInZone(str(s["dtend"]), tz)
	p.Data["repeat"] = repeatFrequencyLabel(p.Loc.T, values.Frequency)
	p.Data["exceptionRepeat"] = repeatFrequencyLabel(p.Loc.T, values.ExceptionFrequency)
	p.Data["frequencyDetails"] = frequencyDetails(p.Loc.T, values.Frequency, values.FrequencyOptions, tz, false)
	p.Data["exceptionDetails"] = frequencyDetails(p.Loc.T, values.ExceptionFrequency, values.ExceptionOptions, tz, true)
	p.Data["rules"] = strings.Join(strings.Fields(str(s["rrule"])), "\n")
	if o.DaysToKeep {
		if extra, ok := s["extra_data"].(map[string]any); ok {
			p.Data["daysToKeep"] = str(extra["days"])
		}
	}
	warnings := scheduleWarnings(o, s)
	p.Data["toggleDisabled"] = len(warnings) > 0 || dig(s, "summary_fields", "user_capabilities", "edit") != true
	// occurrences
	if res, err := u.apiCall(r, "POST", "/api/v2/schedules/preview/", map[string]any{"rrule": s["rrule"]}); err == nil && res.Status == 200 {
		local, _ := res.Data["local"].([]any)
		utc, _ := res.Data["utc"].([]any)
		if len(local) >= 2 {
			var localOut, utcOut []string
			for _, v := range local {
				localOut = append(localOut, formatInZone(str(v), tz))
			}
			for _, v := range utc {
				utcOut = append(utcOut, formatInZone(str(v), "UTC"))
			}
			p.Data["occurrencesLocal"] = localOut
			p.Data["occurrencesUTC"] = utcOut
		}
	}
	// prompted values
	if o.IsTemplate && o.Launch != nil {
		var prompts []promptDetail
		l := o.Launch
		sf, _ := s["summary_fields"].(map[string]any)
		add := func(d promptDetail) { prompts = append(prompts, d) }
		if l["ask_job_type_on_launch"] == true {
			add(promptDetail{Label: "Job Type", Value: str(s["job_type"]), Cy: "shedule-job-type"})
		}
		if inv, ok := sf["inventory"].(map[string]any); ok && l["ask_inventory_on_launch"] == true {
			kind := "inventory"
			if str(inv["kind"]) == "smart" {
				kind = "smart_inventory"
			}
			add(promptDetail{Label: "Inventory", Value: str(inv["name"]), Link: "/inventories/" + kind + "/" + str(inv["id"]) + "/details", Cy: "schedule-inventory"})
		}
		if ee, ok := sf["execution_environment"].(map[string]any); ok && l["ask_execution_environment_on_launch"] == true {
			add(promptDetail{Label: "Execution Environment", Value: str(ee["name"]), Link: "/execution_environments/" + str(ee["id"]) + "/details"})
		}
		if l["ask_scm_branch_on_launch"] == true {
			add(promptDetail{Label: "Source Control Branch", Value: str(s["scm_branch"]), Cy: "schedule-scm-branch"})
		}
		if l["ask_limit_on_launch"] == true {
			add(promptDetail{Label: "Limit", Value: str(s["limit"]), Cy: "schedule-limit"})
		}
		if l["ask_forks_on_launch"] == true {
			add(promptDetail{Label: "Forks", Value: str(s["forks"])})
		}
		if l["ask_verbosity_on_launch"] == true {
			add(promptDetail{Label: "Verbosity", Value: p.Loc.T(verbosityLabels[str(s["verbosity"])]), Cy: "schedule-verbosity"})
		}
		if l["ask_timeout_on_launch"] == true {
			add(promptDetail{Label: "Timeout", Value: str(s["timeout"])})
		}
		if dm, ok := s["diff_mode"].(bool); ok && l["ask_diff_mode_on_launch"] == true {
			v := p.Loc.T("Off")
			if dm {
				v = p.Loc.T("On")
			}
			add(promptDetail{Label: "Show Changes", Value: v, Cy: "schedule-show-changes"})
		}
		if l["ask_job_slice_count_on_launch"] == true {
			add(promptDetail{Label: "Job Slicing", Value: str(s["job_slice_count"])})
		}
		if l["ask_instance_groups_on_launch"] == true && o.Kind == "job_template" {
			if igs := u.listResults(r, "/api/v2/schedules/"+id+"/instance_groups/?page_size=200"); len(igs) > 0 {
				add(promptDetail{Label: "Instance Groups", FullWidth: true, Chips: chipRefs(igs, "/instance_groups/%s/details")})
			}
		}
		if l["ask_credential_on_launch"] == true {
			if creds := u.listResults(r, "/api/v2/schedules/"+id+"/credentials/?page_size=200"); len(creds) > 0 {
				add(promptDetail{Label: "Credentials", FullWidth: true, Chips: chipRefs(creds, "/credentials/%s/details"), Cy: "schedule-credentials"})
			}
		}
		if l["ask_labels_on_launch"] == true {
			if labels := u.listResults(r, "/api/v2/schedules/"+id+"/labels/?page_size=200"); len(labels) > 0 {
				add(promptDetail{Label: "Labels", FullWidth: true, Chips: chipRefs(labels, "")})
			}
		}
		if tags := str(s["job_tags"]); tags != "" && l["ask_tags_on_launch"] == true {
			add(promptDetail{Label: "Job Tags", FullWidth: true, Chips: chipNames(strings.Split(tags, ",")), Cy: "schedule-job-tags"})
		}
		if tags := str(s["skip_tags"]); tags != "" && l["ask_skip_tags_on_launch"] == true {
			add(promptDetail{Label: "Skip Tags", FullWidth: true, Chips: chipNames(strings.Split(tags, ",")), Cy: "schedule-skip-tags"})
		}
		if extra, ok := s["extra_data"].(map[string]any); ok && len(extra) > 0 && (l["ask_variables_on_launch"] == true || l["survey_enabled"] == true) {
			add(promptDetail{Label: "Variables", Variables: toYAML(extra)})
		}
		// the old detail only listed values that were set
		var shown []promptDetail
		for _, d := range prompts {
			d.Label = p.Loc.T(d.Label)
			if d.Value != "" || len(d.Chips) > 0 || d.Variables != "" {
				shown = append(shown, d)
			}
		}
		p.Data["prompts"] = shown
	}
	u.render(w, r, "schedules_detail", p)
}

func chipRefs(items []any, hrefFmt string) []map[string]any {
	out := make([]map[string]any, 0, len(items))
	for _, it := range items {
		m, _ := it.(map[string]any)
		if m == nil {
			continue
		}
		c := map[string]any{"id": m["id"], "name": m["name"], "kind": m["kind"], "credential_type": m["credential_type"]}
		if hrefFmt != "" {
			c["href"] = fmt.Sprintf(hrefFmt, str(m["id"]))
		}
		out = append(out, c)
	}
	return out
}

func chipNames(names []string) []map[string]any {
	out := make([]map[string]any, 0, len(names))
	for _, n := range names {
		if n = strings.TrimSpace(n); n != "" {
			out = append(out, map[string]any{"name": n})
		}
	}
	return out
}

// toYAML renders a map as YAML for the variables detail.
func toYAML(v any) string {
	b, err := yaml.Marshal(v)
	if err != nil {
		return ""
	}
	return "---\n" + string(b)
}

// --- the form ----------------------------------------------------------------

// scheduleForm adds or edits a schedule. The rrule is built from the
// frequency fields; the prompt wizard's values arrive as JSON.
func (u *UI) scheduleForm(w http.ResponseWriter, r *http.Request, uc *userContext, o *scheduleOwner) {
	editing := r.PathValue("sid") != ""
	var s map[string]any
	if editing {
		var ok bool
		if s, ok = u.loadSchedule(w, r, uc, o); !ok {
			return
		}
	}
	title := "Create New Schedule"
	if editing {
		title = "Edit Details"
	}
	p := u.schedulePage(r, uc, o, s, title)
	p.Data["editing"] = editing
	now := time.Now()
	zones, links := u.zoneInfo(r)
	p.Data["zones"] = zones
	p.Data["zoneLinks"] = links
	p.Data["launch"] = o.Launch
	p.Data["survey"] = o.Survey
	p.Data["templateCreds"] = o.Creds
	p.Data["showPrompt"] = o.IsTemplate && launchPrompts(o.Launch)
	var values *scheduleValues
	if editing {
		values = scheduleValuesFromAPI(s, now)
		p.Data["promptInitial"] = u.schedulePromptInitial(r, o, s)
		if values.Unsupported {
			p.Data["values"] = values
			p.Data["rules"] = strings.Join(strings.Fields(str(s["rrule"])), "\n")
			u.render(w, r, "schedules_form", p)
			return
		}
		if o.DaysToKeep {
			if extra, ok := s["extra_data"].(map[string]any); ok {
				values.DaysToKeep = str(extra["days"])
			}
		}
	} else {
		values = newScheduleValues(now)
		if o.DaysToKeep {
			values.DaysToKeep = "30"
		}
		p.Data["fresh"] = true
	}
	p.Data["saveDisabled"] = !editing && o.IsTemplate && scheduleNeedsPrompt(o)
	if r.Method == http.MethodPost {
		values = scheduleValuesFromPost(r, now)
		p.Data["fresh"] = false
		errs := validateScheduleValues(values, o.DaysToKeep)
		for _, msgs := range errs {
			for i, m := range msgs {
				msgs[i] = p.Loc.T(m)
			}
		}
		if len(errs) == 0 {
			if redirect, apiErrs := u.saveSchedule(r, p.Loc.T, o, s, values); apiErrs == nil {
				http.Redirect(w, r, redirect, http.StatusFound)
				return
			} else {
				errs = apiErrs
			}
		}
		p.Errors = errs
		p.Data["saveDisabled"] = false
	}
	p.Data["values"] = values
	u.render(w, r, "schedules_form", p)
}

// launchPrompts reports whether the launch configuration asks anything,
// which is when the form offered the Prompt button.
func launchPrompts(l map[string]any) bool {
	if l == nil {
		return false
	}
	for _, k := range []string{"ask_inventory_on_launch", "ask_variables_on_launch", "ask_job_type_on_launch", "ask_limit_on_launch", "ask_credential_on_launch", "ask_scm_branch_on_launch", "ask_tags_on_launch", "ask_skip_tags_on_launch", "ask_execution_environment_on_launch", "ask_labels_on_launch", "ask_forks_on_launch", "ask_job_slice_count_on_launch", "ask_timeout_on_launch", "ask_instance_groups_on_launch", "survey_enabled", "inventory_needed_to_start"} {
		if l[k] == true {
			return true
		}
	}
	if vars, ok := l["variables_needed_to_start"].([]any); ok && len(vars) > 0 {
		return true
	}
	return false
}

// scheduleNeedsPrompt reports whether a new schedule cannot be saved
// before the prompt wizard supplies what the template needs.
func scheduleNeedsPrompt(o *scheduleOwner) bool {
	l := o.Launch
	if l == nil {
		return false
	}
	if l["inventory_needed_to_start"] == true {
		return true
	}
	if l["survey_enabled"] == true && o.Survey != nil {
		spec, _ := o.Survey["spec"].([]any)
		for _, q := range spec {
			qm, _ := q.(map[string]any)
			if qm["required"] == true && !has(qm["default"]) {
				return true
			}
		}
	}
	if l["ask_credential_on_launch"] == true {
		defaults, _ := dig(l, "defaults", "credentials").([]any)
		for _, c := range defaults {
			if needed, _ := dig(c, "passwords_needed").([]any); len(needed) > 0 {
				return true
			}
		}
	}
	return false
}

// zoneInfo reads the zone list and the links among them.
func (u *UI) zoneInfo(r *http.Request) ([]string, map[string]string) {
	res, err := u.apiCall(r, "GET", "/api/v2/schedules/zoneinfo/", nil)
	if err != nil || res.Status != 200 {
		return []string{"UTC"}, nil
	}
	var zones []string
	for _, z := range toList(res.Data["zones"]) {
		zones = append(zones, str(z))
	}
	links := map[string]string{}
	if m, ok := res.Data["links"].(map[string]any); ok {
		for k, v := range m {
			links[k] = str(v)
		}
	}
	return zones, links
}

// schedulePromptInitial is what the prompt wizard starts from when a
// schedule is edited: its own prompts over the template's defaults.
func (u *UI) schedulePromptInitial(r *http.Request, o *scheduleOwner, s map[string]any) map[string]any {
	if !o.IsTemplate || o.Launch == nil {
		return nil
	}
	id := str(s["id"])
	out := map[string]any{}
	sf, _ := s["summary_fields"].(map[string]any)
	if inv, ok := sf["inventory"].(map[string]any); ok {
		out["inventory"] = map[string]any{"id": inv["id"], "name": inv["name"]}
	}
	if ee, ok := sf["execution_environment"].(map[string]any); ok {
		out["execution_environment"] = map[string]any{"id": ee["id"], "name": ee["name"]}
	}
	for _, k := range []string{"job_type", "scm_branch", "limit", "verbosity", "forks", "job_slice_count", "timeout", "diff_mode", "job_tags", "skip_tags"} {
		if v := s[k]; v != nil {
			out[k] = v
		}
	}
	if o.Launch["ask_credential_on_launch"] == true && o.Kind == "job_template" {
		// the schedule's credentials override the template's of the same type
		merged := append([]any{}, o.Creds...)
		for _, c := range u.listResults(r, "/api/v2/schedules/"+id+"/credentials/?page_size=200") {
			cm, _ := c.(map[string]any)
			kept := merged[:0]
			for _, d := range merged {
				if dm, _ := d.(map[string]any); dm != nil && str(dm["credential_type"]) == str(cm["credential_type"]) && str(dig(dm, "inputs", "vault_id")) == str(dig(cm, "inputs", "vault_id")) {
					continue
				}
				kept = append(kept, d)
			}
			merged = append(kept, c)
		}
		out["credentials"] = merged
	}
	if o.Launch["ask_labels_on_launch"] == true {
		out["labels"] = u.listResults(r, "/api/v2/schedules/"+id+"/labels/?page_size=200")
	}
	if o.Launch["ask_instance_groups_on_launch"] == true && o.Kind == "job_template" {
		out["instance_groups"] = u.listResults(r, "/api/v2/schedules/"+id+"/instance_groups/?page_size=200")
	}
	extra, _ := s["extra_data"].(map[string]any)
	survey := map[string]any{}
	rest := map[string]any{}
	vars := map[string]bool{}
	if o.Survey != nil {
		for _, q := range toList(o.Survey["spec"]) {
			if qm, _ := q.(map[string]any); qm != nil {
				vars[str(qm["variable"])] = true
			}
		}
	}
	for k, v := range extra {
		if vars[k] {
			survey[k] = v
		} else {
			rest[k] = v
		}
	}
	out["survey"] = survey
	if len(rest) > 0 {
		out["extra_vars"] = toYAML(rest)
	}
	return out
}

// saveSchedule creates or updates the schedule and its prompted
// relations, returning where to go next or the form's errors.
func (u *UI) saveSchedule(r *http.Request, T tr, o *scheduleOwner, s map[string]any, v *scheduleValues) (string, map[string][]string) {
	text, err := buildRRule(v)
	if err != nil {
		return "", map[string][]string{"__all__": {err.Error()}}
	}
	payload := map[string]any{"name": v.Name, "description": v.Description, "rrule": text}
	var prompt map[string]any
	if strings.TrimSpace(v.PromptValues) != "" {
		if err := json.Unmarshal([]byte(v.PromptValues), &prompt); err != nil {
			return "", map[string][]string{"__all__": {T("The prompted values could not be read.")}}
		}
	}
	var extra map[string]any
	if prompt != nil {
		for _, k := range []string{"inventory", "execution_environment", "job_type", "scm_branch", "limit", "verbosity", "forks", "job_slice_count", "timeout", "diff_mode", "job_tags", "skip_tags"} {
			if val, ok := prompt[k]; ok {
				payload[k] = val
			}
		}
		if ev, ok := prompt["extra_vars"].(map[string]any); ok {
			extra = ev
		} else if ok {
			extra = map[string]any{}
		}
	}
	if o.DaysToKeep {
		if extra == nil {
			extra = map[string]any{}
			if cur, ok := s["extra_data"].(map[string]any); ok {
				for k, val := range cur {
					extra[k] = val
				}
			}
		}
		extra["days"] = v.DaysToKeep
	}
	if extra != nil {
		payload["extra_data"] = extra
	}
	var res *apiResult
	if s == nil {
		res, err = u.apiCall(r, "POST", o.API, payload)
	} else {
		res, err = u.apiCall(r, "PATCH", "/api/v2/schedules/"+str(s["id"])+"/", payload)
	}
	if err != nil || (res.Status != 201 && res.Status != 200) {
		errs := apiErrors(res)
		// rrule and prompt errors are shown with the form's own alert
		var all []string
		for k, msgs := range errs {
			if k != "name" && k != "description" && k != "__all__" {
				for _, m := range msgs {
					all = append(all, k+": "+m)
				}
				delete(errs, k)
			}
		}
		if len(all) > 0 {
			sort.Strings(all)
			errs["__all__"] = append(errs["__all__"], all...)
		}
		return "", errs
	}
	id := str(res.Data["id"])
	base := "/api/v2/schedules/" + id + "/"
	if prompt != nil && o.Launch != nil {
		l := o.Launch
		if l["ask_credential_on_launch"] == true && o.Kind == "job_template" {
			if rres := u.syncScheduleCredentials(r, base, o, prompt["credentials"]); rres != nil {
				return "", apiErrors(rres)
			}
		}
		if l["ask_labels_on_launch"] == true {
			orgID, _ := strconv.ParseInt(str(o.Resource["organization"]), 10, 64)
			if orgID == 0 {
				if orgs := u.listResults(r, "/api/v2/organizations/?page_size=1"); len(orgs) > 0 {
					orgID = int64(num(dig(orgs[0], "id")))
				}
			}
			var refs []map[string]any
			for _, lid := range toList(prompt["labels"]) {
				refs = append(refs, map[string]any{"id": str(lid)})
			}
			if rres := u.syncLabels(r, base+"labels/", refs, orgID); rres != nil {
				return "", apiErrors(rres)
			}
		}
		if l["ask_instance_groups_on_launch"] == true && o.Kind == "job_template" {
			var ids []int64
			for _, g := range toList(prompt["instance_groups"]) {
				ids = append(ids, int64(num(g)))
			}
			if rres := u.orderScheduleInstanceGroups(r, base+"instance_groups/", ids); rres != nil {
				return "", apiErrors(rres)
			}
		}
	}
	return o.Base + "/schedules/" + id + "/details", nil
}

// syncScheduleCredentials saves the prompted credentials: those the
// template already carries are not attached to the schedule.
func (u *UI) syncScheduleCredentials(r *http.Request, base string, o *scheduleOwner, wanted any) *apiResult {
	templateIDs := map[string]bool{}
	for _, c := range o.Creds {
		templateIDs[str(dig(c, "id"))] = true
	}
	current := map[string]bool{}
	for _, c := range u.listResults(r, base+"credentials/?page_size=200") {
		current[str(dig(c, "id"))] = true
	}
	want := map[string]bool{}
	for _, id := range toList(wanted) {
		want[str(id)] = true
	}
	for id := range current {
		if !want[id] {
			if res, err := u.apiCall(r, "POST", base+"credentials/", map[string]any{"id": atoiDefault(id, 0), "disassociate": true}); err != nil || res.Status >= 400 {
				return res
			}
		}
	}
	for _, id := range toList(wanted) {
		sid := str(id)
		if !current[sid] && !templateIDs[sid] {
			if res, err := u.apiCall(r, "POST", base+"credentials/", map[string]any{"id": atoiDefault(sid, 0)}); err != nil || res.Status >= 400 {
				return res
			}
		}
	}
	return nil
}

// orderScheduleInstanceGroups replaces the schedule's instance groups so
// they come in the prompted order.
func (u *UI) orderScheduleInstanceGroups(r *http.Request, api string, ids []int64) *apiResult {
	for _, it := range u.listResults(r, api+"?page_size=200") {
		if res, err := u.apiCall(r, "POST", api, map[string]any{"id": int64(num(dig(it, "id"))), "disassociate": true}); err != nil || res.Status >= 400 {
			return res
		}
	}
	for _, id := range ids {
		if res, err := u.apiCall(r, "POST", api, map[string]any{"id": id}); err != nil || res.Status >= 400 {
			return res
		}
	}
	return nil
}
