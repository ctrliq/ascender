package web

import (
	"net/http"
	"net/url"
	"strings"

	"github.com/ctrliq/ascender/internal/api"
)

func (u *UI) registerProjects(mux *http.ServeMux) {
	mux.HandleFunc("/projects", u.protected(u.projectList))
	mux.HandleFunc("/projects/{$}", u.protected(u.projectList))
	mux.HandleFunc("/projects/add", u.protected(u.projectAdd))
	mux.HandleFunc("/projects/{id}", u.protected(toDetails))
	mux.HandleFunc("/projects/{id}/details", u.protected(u.projectDetail))
	mux.HandleFunc("/projects/{id}/edit", u.protected(u.projectEdit))
	for _, tab := range []string{"access", "job_templates", "notifications"} {
		mux.HandleFunc("/projects/{id}/"+tab, u.protected(u.projectTab))
	}
}

var projectSearchKeys = []map[string]string{
	{"name": "Name", "key": "name__icontains"},
	{"name": "Description", "key": "description__icontains"},
	{"name": "Type", "key": "or__scm_type", "options": "project_scm_type"},
	{"name": "Source Control URL", "key": "scm_url__icontains"},
	{"name": "Modified By (Username)", "key": "modified_by__username__icontains"},
	{"name": "Created By (Username)", "key": "created_by__username__icontains"},
}

var projectFilterLabels = searchLabels(projectSearchKeys, "status__in", "Status", "last_job_failed", "Last job failed")

func (u *UI) projectList(w http.ResponseWriter, r *http.Request, uc *userContext) {
	p := u.newPage(r, uc, "Projects")
	if err := u.listPage(r, p, "project", "/api/v2/projects/", url.Values{"order_by": {"name"}}, projectFilterLabels); err != nil {
		u.api.Log.ErrorContext(r.Context(), "project list", "err", err)
	}
	p.Data["searchKeys"] = projectSearchKeys
	u.render(w, r, "projects_list", p)
}

func (u *UI) projectDetail(w http.ResponseWriter, r *http.Request, uc *userContext) {
	id := r.PathValue("id")
	project, ok := u.loadObject(w, r, uc, "/api/v2/projects/"+id+"/")
	if !ok {
		return
	}
	p := u.newPage(r, uc, "Details")
	p.Data["project"] = project
	p.Data["tab"] = "details"
	p.Data["projectTabs"] = projectTabs(id, project, uc.User.IsSystemAuditor || u.isNotificationAdmin(r))
	p.Data["project_base_dir"] = u.api.Cfg.ProjectsRoot
	u.render(w, r, "projects_detail", p)
}

var projectTabTitles = map[string]string{"access": "Access", "job_templates": "Job Templates", "notifications": "Notifications", "schedules": "Schedules"}

func (u *UI) projectTab(w http.ResponseWriter, r *http.Request, uc *userContext) {
	id := r.PathValue("id")
	project, ok := u.loadObject(w, r, uc, "/api/v2/projects/"+id+"/")
	if !ok {
		return
	}
	tab := strings.TrimPrefix(r.URL.Path, "/projects/"+id+"/")
	p := u.newPage(r, uc, projectTabTitles[tab])
	p.Data["project"] = project
	p.Data["tab"] = tab
	notif := uc.User.IsSystemAuditor || u.isNotificationAdmin(r)
	p.Data["projectTabs"] = projectTabs(id, project, notif)
	if tab == "notifications" && !notif {
		u.notFound(w, r, uc)
		return
	}
	if tab == "access" {
		u.accessTab(r, p, "/api/v2/projects/"+id+"/", project)
	}
	if tab == "notifications" {
		u.notificationsTab(r, p, "/api/v2/projects/"+id+"/", []string{"started", "success", "error"}, u.isNotificationAdmin(r))
	}
	if tab == "job_templates" {
		u.relatedTemplatesTab(r, p, url.Values{"project__id": {id}}, map[string]string{"resource_id": id, "resource_name": str(project["name"]), "resource_type": "project"})
	}
	u.render(w, r, "projects_detail", p)
}

// projectFormValues is the form's state: either the posted values or the
// existing project, shaped the way the template reads them.
func projectFormValues(data map[string]any) map[string]any {
	v := map[string]any{}
	for _, k := range []string{"name", "description", "scm_type", "scm_url", "scm_branch", "scm_refspec", "local_path", "webhook_service", "webhook_ref_filter", "webhook_key"} {
		v[k] = str(data[k])
	}
	for _, k := range []string{"scm_clean", "scm_delete_on_update", "scm_track_submodules", "scm_update_on_launch", "allow_override", "reuse_requirements"} {
		v[k] = data[k] == true
	}
	v["scm_update_cache_timeout"] = str(data["scm_update_cache_timeout"])
	v["timeout"] = str(data["timeout"])
	for _, k := range []string{"organization", "default_environment", "credential", "signature_validation_credential"} {
		v[k] = refValue(data, k)
	}
	return v
}

// projectFormFromPost reads the posted form into the API payload.
func projectFormFromPost(r *http.Request) (map[string]any, map[string]any) {
	f := r.PostForm
	payload := map[string]any{
		"name":                     f.Get("name"),
		"description":              f.Get("description"),
		"scm_type":                 f.Get("scm_type"),
		"scm_url":                  f.Get("scm_url"),
		"scm_branch":               f.Get("scm_branch"),
		"scm_refspec":              f.Get("scm_refspec"),
		"scm_clean":                f.Get("scm_clean") == "on",
		"scm_delete_on_update":     f.Get("scm_delete_on_update") == "on",
		"scm_track_submodules":     f.Get("scm_track_submodules") == "on",
		"scm_update_on_launch":     f.Get("scm_update_on_launch") == "on",
		"allow_override":           f.Get("allow_override") == "on",
		"reuse_requirements":       f.Get("reuse_requirements") == "on",
		"scm_update_cache_timeout": atoiDefault(f.Get("scm_update_cache_timeout"), 0),
		"webhook_service":          f.Get("webhook_service"),
		"webhook_ref_filter":       f.Get("webhook_ref_filter"),
	}
	if f.Get("enable_webhook") != "on" {
		payload["webhook_service"] = ""
		payload["webhook_ref_filter"] = ""
	} else if k := strings.TrimSpace(f.Get("webhook_key")); k != "" {
		payload["webhook_key"] = k
	}
	if payload["scm_type"] == "manual" {
		payload["scm_type"] = ""
	}
	if payload["scm_type"] == "" {
		payload["local_path"] = f.Get("local_path")
		// The old form only sent these for SCM projects.
		for _, k := range []string{"scm_clean", "scm_delete_on_update", "scm_track_submodules", "scm_update_on_launch", "allow_override"} {
			payload[k] = false
		}
	}
	if payload["scm_type"] != "git" {
		payload["scm_refspec"] = ""
		payload["scm_track_submodules"] = false
	}
	if payload["scm_type"] == "archive" {
		payload["scm_branch"] = ""
	}
	if !f.Has("reuse_requirements") && payload["scm_type"] == "" {
		payload["reuse_requirements"] = true
	}
	for _, k := range []string{"organization", "default_environment", "credential", "signature_validation_credential"} {
		if id := strings.TrimSpace(f.Get(k)); id != "" {
			payload[k] = atoiDefault(id, 0)
		} else {
			payload[k] = nil
		}
	}
	// Values for re-rendering the form, including the names of the chosen
	// related objects which travel in hidden fields.
	values := map[string]any{}
	for k, v := range payload {
		values[k] = v
	}
	for _, k := range []string{"organization", "default_environment", "credential", "signature_validation_credential"} {
		values[k] = map[string]any{"id": f.Get(k), "name": f.Get(k + "_name")}
	}
	if values["scm_type"] == "" {
		values["local_path"] = f.Get("local_path")
	}
	return payload, projectFormValues(values)
}

func (u *UI) projectFormCommon(r *http.Request, p *page) {
	p.Data["origin"] = api.RequestScheme(r) + "://" + r.Host
	p.Data["scmTypes"] = []map[string]string{{"value": "manual", "label": "Manual"}, {"value": "git", "label": "Git"}, {"value": "svn", "label": "Subversion"}, {"value": "archive", "label": "Remote Archive"}}
	p.Data["project_base_dir"] = u.api.Cfg.ProjectsRoot
	if res, err := u.apiCall(r, "GET", "/api/v2/config/", nil); err == nil && res.Status == 200 {
		p.Data["local_paths"] = res.Data["project_local_paths"]
	}
}

func (u *UI) projectAdd(w http.ResponseWriter, r *http.Request, uc *userContext) {
	p := u.newPage(r, uc, "Create New Project")
	u.projectFormCommon(r, p)
	if r.Method == http.MethodPost {
		payload, values := projectFormFromPost(r)
		u.submitForm(w, r, p, "projects_form", "POST", "/api/v2/projects/", payload, values, "/projects/{id}/details")
		return
	}
	p.Data["values"] = projectFormValues(map[string]any{"reuse_requirements": true, "scm_type": ""})
	p.Data["values"].(map[string]any)["scm_type"] = ""
	// OrganizationLookup autoPopulate: the only organization is chosen.
	p.Data["values"].(map[string]any)["organization"] = u.autoOrganization(r, "")
	u.render(w, r, "projects_form", p)
}

func (u *UI) projectEdit(w http.ResponseWriter, r *http.Request, uc *userContext) {
	id := r.PathValue("id")
	project, ok := u.loadObject(w, r, uc, "/api/v2/projects/"+id+"/")
	if !ok {
		return
	}
	p := u.newPage(r, uc, "Edit Details")
	p.Data["project"] = project
	u.projectFormCommon(r, p)
	if r.Method == http.MethodPost {
		payload, values := projectFormFromPost(r)
		if payload["scm_type"] != "" {
			delete(payload, "local_path")
		}
		u.submitForm(w, r, p, "projects_form", "PATCH", "/api/v2/projects/"+id+"/", payload, values, "/projects/"+id+"/details")
		return
	}
	p.Data["values"] = projectFormValues(project)
	u.render(w, r, "projects_form", p)
}

// projectTabs are Project.tsx's tabs: Notifications for system auditors and
// notification admins, Schedules for projects under source control.
func projectTabs(id string, project map[string]any, notifications bool) []map[string]any {
	base := "/projects/" + id
	tabs := []map[string]any{{"key": "details", "href": base + "/details", "label": "Details"}, {"key": "access", "href": base + "/access", "label": "Access"},
		{"key": "job_templates", "href": base + "/job_templates", "label": "Job Templates"}}
	if notifications {
		tabs = append(tabs, map[string]any{"key": "notifications", "href": base + "/notifications", "label": "Notifications"})
	}
	if str(project["scm_type"]) != "" {
		tabs = append(tabs, map[string]any{"key": "schedules", "href": base + "/schedules", "label": "Schedules"})
	}
	return tabs
}
