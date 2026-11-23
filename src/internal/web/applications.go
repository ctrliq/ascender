package web

import (
	"net/http"
	"net/url"
	"strings"

	"github.com/ctrliq/ascender/internal/api"
)

func (u *UI) registerApplications(mux *http.ServeMux) {
	mux.HandleFunc("/applications", u.protected(u.appList))
	mux.HandleFunc("/applications/{$}", u.protected(u.appList))
	mux.HandleFunc("/applications/add", u.protected(u.appAdd))
	mux.HandleFunc("/applications/{id}", u.protected(toDetails))
	mux.HandleFunc("/applications/{id}/details", u.protected(u.appTab))
	mux.HandleFunc("/applications/{id}/edit", u.protected(u.appEdit))
	mux.HandleFunc("/applications/{id}/tokens", u.protected(u.appTab))
	// Application routed "tokens/*" to the list, so a token's link from
	// the list lands back on it.
	mux.HandleFunc("/applications/{id}/tokens/{rest...}", u.protected(u.appTab))
	mux.HandleFunc("/users/{id}/tokens/add", u.protected(u.userTokenAdd))
	mux.HandleFunc("/users/{id}/tokens/{tokenId}", u.protected(toDetails))
	mux.HandleFunc("/users/{id}/tokens/{tokenId}/details", u.protected(u.userTokenDetail))
}

var appSearchKeys = []map[string]string{{"name": "Name", "key": "name__icontains"}, {"name": "Description", "key": "description__icontains"}}

var appFilterLabels = searchLabels(appSearchKeys)

var appTokenSearchKeys = []map[string]string{{"name": "Name", "key": "user__username__icontains"}}

// appChoiceLabels are the choices of the OPTIONS document the screens
// name values with.
var appGrantLabels = map[string]string{"authorization-code": "Authorization code", "password": "Resource owner password-based"}
var appClientLabels = map[string]string{"confidential": "Confidential", "public": "Public"}

func (u *UI) appList(w http.ResponseWriter, r *http.Request, uc *userContext) {
	p := u.newPage(r, uc, "Applications")
	p.Nav = navigation(uc, "/applications")
	if err := u.listPage(r, p, "applications", "/api/v2/applications/", url.Values{"order_by": {"name"}}, appFilterLabels); err != nil {
		u.api.Log.ErrorContext(r.Context(), "application list", "err", err)
	}
	p.Data["searchKeys"] = appSearchKeys
	p.Data["canAdd"] = u.optionsAllow(r, "/api/v2/applications/", "POST")
	u.render(w, r, "applications_list", p)
}

// optionsAllow reports whether the OPTIONS document of an API path offers
// a method, which is how the old screens decided to show Add.
func (u *UI) optionsAllow(r *http.Request, path, method string) bool {
	res, err := u.apiCall(r, "OPTIONS", path, nil)
	if err != nil || res.Status != 200 {
		return false
	}
	actions, _ := res.Data["actions"].(map[string]any)
	_, ok := actions[method]
	return ok
}

func appTabs(id string) []map[string]string {
	return []map[string]string{
		{"key": "details", "href": "/applications/" + id + "/details", "label": "Details"},
		{"key": "tokens", "href": "/applications/" + id + "/tokens", "label": "Tokens"},
	}
}

func (u *UI) appTab(w http.ResponseWriter, r *http.Request, uc *userContext) {
	app, ok := u.loadObject(w, r, uc, "/api/v2/applications/"+r.PathValue("id")+"/")
	if !ok {
		return
	}
	u.renderAppTab(w, r, uc, app, nil)
}

// renderAppTab renders an application's Details or Tokens tab. created is
// the create response, whose client secret the details page shows once.
func (u *UI) renderAppTab(w http.ResponseWriter, r *http.Request, uc *userContext, app map[string]any, created map[string]any) {
	id := str(app["id"])
	tab := "details"
	if strings.HasPrefix(r.URL.Path, "/applications/"+id+"/tokens") {
		tab = "tokens"
	}
	title := "Details"
	if tab == "tokens" {
		title = "Tokens"
	}
	p := u.newPage(r, uc, title)
	p.Nav = navigation(uc, "/applications")
	p.Data["app"] = app
	p.Data["tab"] = tab
	p.Data["tabs"] = appTabs(id)
	// The old details showed the OPTIONS document's choice names.
	p.Data["grantLabel"] = api.OptionsText(p.Loc.Lang, "choice", appGrantLabels[str(app["authorization_grant_type"])])
	p.Data["clientLabel"] = api.OptionsText(p.Loc.Lang, "choice", appClientLabels[str(app["client_type"])])
	if created != nil {
		p.Data["created"] = created
	}
	if tab == "tokens" {
		if err := u.listPage(r, p, "applications", "/api/v2/applications/"+id+"/tokens/", url.Values{"order_by": {"user__username"}}, searchLabels(appTokenSearchKeys)); err != nil {
			u.api.Log.ErrorContext(r.Context(), "application tokens", "err", err)
		}
		p.Data["searchKeys"] = appTokenSearchKeys
	}
	u.render(w, r, "applications_detail", p)
}

// appFormPost reads ApplicationForm's fields: the payload it sent and the
// values to show again when the save fails.
func appFormPost(r *http.Request, editing bool) (map[string]any, map[string]any) {
	f := r.PostForm
	values := map[string]any{
		"name": f.Get("name"), "description": f.Get("description"), "authorization_grant_type": f.Get("authorization_grant_type"),
		"redirect_uris": f.Get("redirect_uris"), "client_type": f.Get("client_type"),
		"organization": map[string]any{"id": f.Get("organization"), "name": f.Get("organization_name")},
	}
	payload := map[string]any{
		"name": f.Get("name"), "description": f.Get("description"), "redirect_uris": f.Get("redirect_uris"), "client_type": f.Get("client_type"),
		"authorization_grant_type": f.Get("authorization_grant_type"),
	}
	if id := f.Get("organization"); id != "" {
		payload["organization"] = atoiDefault(id, 0)
	} else {
		payload["organization"] = nil
	}
	return payload, values
}

func (u *UI) appFormPage(r *http.Request, uc *userContext, title string) *page {
	p := u.newPage(r, uc, title)
	p.Nav = navigation(uc, "/applications")
	p.Data["grantChoices"] = [][2]string{{"authorization-code", "Authorization code"}, {"password", "Resource owner password-based"}}
	p.Data["clientChoices"] = [][2]string{{"confidential", "Confidential"}, {"public", "Public"}}
	return p
}

func (u *UI) appAdd(w http.ResponseWriter, r *http.Request, uc *userContext) {
	p := u.appFormPage(r, uc, "Create New Application")
	if r.Method == http.MethodPost {
		payload, values := appFormPost(r, false)
		res, err := u.apiCall(r, "POST", "/api/v2/applications/", payload)
		if err == nil && res.Status == 201 {
			// The client secret is shown once, over the new application's
			// details; the page replaces this URL with the details URL.
			app, err := u.apiCall(r, "GET", "/api/v2/applications/"+str(res.Data["id"])+"/", nil)
			if err == nil && app.Status == 200 {
				r.URL.Path = "/applications/" + str(res.Data["id"]) + "/details"
				u.renderAppTab(w, r, uc, app.Data, res.Data)
				return
			}
			http.Redirect(w, r, "/applications/"+str(res.Data["id"])+"/details", http.StatusFound)
			return
		}
		p.Errors = apiErrors(res)
		p.Data["values"] = values
		u.render(w, r, "applications_form", p)
		return
	}
	p.Data["values"] = map[string]any{"organization": u.autoOrganization(r, "")}
	u.render(w, r, "applications_form", p)
}

func (u *UI) appEdit(w http.ResponseWriter, r *http.Request, uc *userContext) {
	app, ok := u.loadObject(w, r, uc, "/api/v2/applications/"+r.PathValue("id")+"/")
	if !ok {
		return
	}
	id := str(app["id"])
	p := u.appFormPage(r, uc, "Edit Details")
	p.Data["app"] = app
	p.Data["editing"] = true
	if r.Method == http.MethodPost {
		payload, values := appFormPost(r, true)
		values["authorization_grant_type"] = str(app["authorization_grant_type"])
		u.submitForm(w, r, p, "applications_form", "PATCH", "/api/v2/applications/"+id+"/", payload, values, "/applications/"+id+"/details")
		return
	}
	p.Data["values"] = map[string]any{
		"name": str(app["name"]), "description": str(app["description"]), "authorization_grant_type": str(app["authorization_grant_type"]),
		"redirect_uris": str(app["redirect_uris"]), "client_type": str(app["client_type"]),
		"organization": refValue(app, "organization"),
	}
	u.render(w, r, "applications_form", p)
}

// ---------------------------------------------------------------- user tokens

func (u *UI) userTokenPage(w http.ResponseWriter, r *http.Request, uc *userContext, title string) (*page, map[string]any, bool) {
	user, ok := u.loadUserPage(w, r, uc)
	if !ok {
		return nil, nil, false
	}
	p := u.newPage(r, uc, title)
	p.Nav = navigation(uc, "/users")
	p.Data["user"] = user
	return p, user, true
}

func (u *UI) userTokenAdd(w http.ResponseWriter, r *http.Request, uc *userContext) {
	p, user, ok := u.userTokenPage(w, r, uc, "Create user token")
	if !ok {
		return
	}
	id := str(user["id"])
	if r.Method == http.MethodPost {
		f := r.PostForm
		values := map[string]any{"description": f.Get("description"), "scope": f.Get("scope"),
			"application": map[string]any{"id": f.Get("application"), "name": f.Get("application_name")}}
		var res *apiResult
		var err error
		if f.Get("scope") == "" {
			p.Errors = map[string][]string{"scope": {p.Loc.T("Please enter a value.")}}
		} else if app := f.Get("application"); app != "" {
			// UserTokenAdd: an application token through the user's
			// authorized_tokens, a personal token through tokens/.
			res, err = u.apiCall(r, "POST", "/api/v2/users/"+id+"/authorized_tokens/", map[string]any{"description": f.Get("description"), "scope": f.Get("scope"), "application": atoiDefault(app, 0)})
		} else {
			res, err = u.apiCall(r, "POST", "/api/v2/tokens/", map[string]any{"description": f.Get("description"), "scope": f.Get("scope"), "application": nil})
		}
		if p.Errors == nil {
			if err == nil && res.Status == 201 {
				tok, terr := u.apiCall(r, "GET", "/api/v2/tokens/"+str(res.Data["id"])+"/", nil)
				if terr == nil && tok.Status == 200 {
					r.URL.Path = "/users/" + id + "/tokens/" + str(res.Data["id"]) + "/details"
					u.renderUserTokenDetail(w, r, uc, user, tok.Data, res.Data)
					return
				}
				http.Redirect(w, r, "/users/"+id+"/tokens/"+str(res.Data["id"])+"/details", http.StatusFound)
				return
			}
			p.Errors = apiErrors(res)
		}
		p.Data["values"] = values
		u.render(w, r, "user_token_form", p)
		return
	}
	p.Data["values"] = map[string]any{"application": map[string]any{"id": "", "name": ""}}
	u.render(w, r, "user_token_form", p)
}

func (u *UI) userTokenDetail(w http.ResponseWriter, r *http.Request, uc *userContext) {
	user, ok := u.loadUserPage(w, r, uc)
	if !ok {
		return
	}
	token, ok := u.loadObject(w, r, uc, "/api/v2/tokens/"+r.PathValue("tokenId")+"/")
	if !ok {
		return
	}
	u.renderUserTokenDetail(w, r, uc, user, token, nil)
}

func (u *UI) renderUserTokenDetail(w http.ResponseWriter, r *http.Request, uc *userContext, user, token, created map[string]any) {
	p := u.newPage(r, uc, "Details")
	p.Nav = navigation(uc, "/users")
	p.Data["user"] = user
	p.Data["token"] = token
	p.Data["scope"] = toTitleCase(str(token["scope"]))
	if created != nil {
		p.Data["created"] = created
	}
	u.render(w, r, "user_token_detail", p)
}
