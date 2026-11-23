package web

import (
	"net/http"
	"net/url"
	"strings"
)

func (u *UI) registerExecutionEnvironments(mux *http.ServeMux) {
	mux.HandleFunc("/execution_environments", u.protected(u.eeList))
	mux.HandleFunc("/execution_environments/{$}", u.protected(u.eeList))
	mux.HandleFunc("/execution_environments/add", u.protected(u.eeAdd))
	mux.HandleFunc("/execution_environments/{id}", u.protected(toDetails))
	mux.HandleFunc("/execution_environments/{id}/details", u.protected(u.eeTab))
	mux.HandleFunc("/execution_environments/{id}/templates", u.protected(u.eeTab))
	mux.HandleFunc("/execution_environments/{id}/edit", u.protected(u.eeEdit))
}

var eeSearchKeys = []map[string]string{{"name": "Name", "key": "name__icontains"}, {"name": "Image", "key": "image__icontains"}}

var eeFilterLabels = searchLabels(eeSearchKeys)

// eeTemplateSearchKeys are ExecutionEnvironmentTemplateList's search columns.
var eeTemplateSearchKeys = []map[string]string{{"name": "Name", "key": "name__icontains"}, {"name": "Type", "key": "or__type", "options": "template_type"},
	{"name": "Created By (Username)", "key": "created_by__username__icontains"}, {"name": "Modified By (Username)", "key": "modified_by__username__icontains"}}

// eePullLabel is ExecutionEnvironmentListItem's Pull column.
func eePullLabel(p string) string {
	switch p {
	case "always":
		return "Always"
	case "missing":
		return "Only if Missing"
	case "never":
		return "Never"
	}
	return "(Default)"
}

func (u *UI) eeList(w http.ResponseWriter, r *http.Request, uc *userContext) {
	p := u.newPage(r, uc, "Execution Environments")
	p.Nav = navigation(uc, "/execution_environments")
	if err := u.listPage(r, p, "execution_environments", "/api/v2/execution_environments/", url.Values{"order_by": {"name"}}, eeFilterLabels); err != nil {
		u.api.Log.ErrorContext(r.Context(), "execution environment list", "err", err)
	}
	p.Data["searchKeys"] = eeSearchKeys
	p.Data["canAdd"] = u.optionsAllow(r, "/api/v2/execution_environments/", "POST")
	u.render(w, r, "execution_environments_list", p)
}

func (u *UI) loadEEPage(w http.ResponseWriter, r *http.Request, uc *userContext) (map[string]any, bool) {
	return u.loadObject(w, r, uc, "/api/v2/execution_environments/"+r.PathValue("id")+"/")
}

func (u *UI) eeTab(w http.ResponseWriter, r *http.Request, uc *userContext) {
	ee, ok := u.loadEEPage(w, r, uc)
	if !ok {
		return
	}
	id := str(ee["id"])
	tab := strings.TrimPrefix(r.URL.Path, "/execution_environments/"+id+"/")
	title := "Details"
	if tab == "templates" {
		// the breadcrumbs named no templates page, so the heading was empty
		title = ""
	}
	p := u.newPage(r, uc, title)
	p.Nav = navigation(uc, "/execution_environments")
	p.Data["ee"] = ee
	p.Data["tab"] = tab
	p.Data["tabs"] = []map[string]string{
		{"key": "details", "href": "/execution_environments/" + id + "/details", "label": "Details"},
		{"key": "templates", "href": "/execution_environments/" + id + "/templates", "label": "Templates"},
	}
	switch tab {
	case "details":
		p.Data["pull"] = p.Loc.T("Missing")
		if pv := str(ee["pull"]); pv != "" {
			p.Data["pull"] = toTitleCase(pv)
		}
	case "templates":
		if err := u.listPage(r, p, "execution_environments", "/api/v2/execution_environments/"+id+"/unified_job_templates/",
			url.Values{"order_by": {"name"}, "type": {"job_template,workflow_job_template"}}, searchLabels(eeTemplateSearchKeys)); err != nil {
			u.api.Log.ErrorContext(r.Context(), "execution environment templates", "err", err)
		}
		p.Data["searchKeys"] = eeTemplateSearchKeys
	}
	u.render(w, r, "execution_environments_detail", p)
}

func eeFormPost(r *http.Request) (map[string]any, map[string]any) {
	f := r.PostForm
	values := map[string]any{
		"name": f.Get("name"), "image": f.Get("image"), "pull": f.Get("pull"), "description": f.Get("description"),
		"organization": map[string]any{"id": f.Get("organization"), "name": f.Get("organization_name")},
		"credential":   map[string]any{"id": f.Get("credential"), "name": f.Get("credential_name")},
	}
	payload := map[string]any{"name": f.Get("name"), "image": f.Get("image"), "pull": f.Get("pull"), "description": f.Get("description")}
	for _, k := range []string{"organization", "credential"} {
		if v := f.Get(k); v != "" {
			payload[k] = atoiDefault(v, 0)
		} else {
			payload[k] = nil
		}
	}
	return payload, values
}

func (u *UI) eeFormPage(r *http.Request, uc *userContext, title string) *page {
	p := u.newPage(r, uc, title)
	p.Nav = navigation(uc, "/execution_environments")
	p.Data["pullChoices"] = [][2]string{{"", "---------"}, {"always", "Always pull container before running."}, {"missing", "Only pull the image if not present before running."}, {"never", "Never pull container before running."}}
	return p
}

func (u *UI) eeAdd(w http.ResponseWriter, r *http.Request, uc *userContext) {
	p := u.eeFormPage(r, uc, "Create new execution environment")
	if r.Method == http.MethodPost {
		payload, values := eeFormPost(r)
		u.submitForm(w, r, p, "execution_environments_form", "POST", "/api/v2/execution_environments/", payload, values, "/execution_environments/{id}/details")
		return
	}
	values := map[string]any{"organization": map[string]any{"id": "", "name": ""}, "credential": map[string]any{"id": "", "name": ""}}
	if !uc.User.IsSuperuser {
		// OrganizationLookup autoPopulate for non-superusers
		values["organization"] = u.autoOrganization(r, "execution_environment_admin_role")
	}
	p.Data["values"] = values
	u.render(w, r, "execution_environments_form", p)
}

func (u *UI) eeEdit(w http.ResponseWriter, r *http.Request, uc *userContext) {
	ee, ok := u.loadEEPage(w, r, uc)
	if !ok {
		return
	}
	id := str(ee["id"])
	p := u.eeFormPage(r, uc, "Edit details")
	p.Data["ee"] = ee
	p.Data["editing"] = true
	p.Data["managed"] = ee["managed"] == true
	p.Data["globalEE"] = ee["organization"] == nil
	if r.Method == http.MethodPost {
		payload, values := eeFormPost(r)
		if ee["managed"] == true {
			// ExecutionEnvironmentEdit sent only pull for managed ones
			payload = map[string]any{"pull": payload["pull"]}
		} else if ee["organization"] == nil {
			// the lookup is disabled for a global environment
			payload["organization"] = nil
		}
		u.submitForm(w, r, p, "execution_environments_form", "PATCH", "/api/v2/execution_environments/"+id+"/", payload, values, "/execution_environments/"+id+"/details")
		return
	}
	p.Data["values"] = map[string]any{
		"name": str(ee["name"]), "image": str(ee["image"]), "pull": str(ee["pull"]), "description": str(ee["description"]),
		"organization": refValue(ee, "organization"),
		"credential":   refValue(ee, "credential"),
	}
	u.render(w, r, "execution_environments_form", p)
}
