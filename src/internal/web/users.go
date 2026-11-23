package web

import (
	"encoding/json"
	"net/http"
	"net/url"
	"strings"

	"github.com/ctrliq/ascender/internal/i18n"
)

func (u *UI) registerUsers(mux *http.ServeMux) {
	mux.HandleFunc("/users", u.protected(u.userList))
	mux.HandleFunc("/users/{$}", u.protected(u.userList))
	mux.HandleFunc("/users/add", u.protected(u.userAdd))
	mux.HandleFunc("/users/{id}", u.protected(toDetails))
	mux.HandleFunc("/users/{id}/details", u.protected(u.userTab))
	mux.HandleFunc("/users/{id}/edit", u.protected(u.userEdit))
	for _, tab := range []string{"organizations", "teams", "roles", "tokens"} {
		mux.HandleFunc("/users/{id}/"+tab, u.protected(u.userTab))
	}
	mux.HandleFunc("/teams", u.protected(u.teamList))
	mux.HandleFunc("/teams/{$}", u.protected(u.teamList))
	mux.HandleFunc("/teams/add", u.protected(u.teamAdd))
	mux.HandleFunc("/teams/{id}", u.protected(toDetails))
	mux.HandleFunc("/teams/{id}/edit", u.protected(u.teamEdit))
	for _, tab := range []string{"details", "access", "roles"} {
		mux.HandleFunc("/teams/{id}/"+tab, u.protected(u.teamTab))
	}
}

var userSearchKeys = []map[string]string{
	{"name": "Email", "key": "email__icontains"},
	{"name": "Username", "key": "username__icontains"},
	{"name": "First Name", "key": "first_name__icontains"},
	{"name": "Last Name", "key": "last_name__icontains"},
}

var userFilterLabels = searchLabels(userSearchKeys)

var teamSearchKeys = []map[string]string{
	{"name": "Name", "key": "name__icontains"},
	{"name": "Description", "key": "description__icontains"},
	{"name": "Organization Name", "key": "organization__name__icontains"},
	{"name": "Created By (Username)", "key": "created_by__username__icontains"},
	{"name": "Modified By (Username)", "key": "modified_by__username__icontains"},
}

var teamFilterLabels = searchLabels(teamSearchKeys)

// userType is the label UserListItem and UserDetail showed.
func userType(user map[string]any) string {
	switch {
	case user["is_superuser"] == true:
		return "System Administrator"
	case user["is_system_auditor"] == true:
		return "System Auditor"
	}
	return "Normal User"
}

// languageNames are the UI's languages as code, name pairs, in the old
// i18nLoader's order. The names are not translated (they were not in the
// old UI either).
var languageNames = func() [][2]string {
	out := make([][2]string, len(i18n.Languages))
	for i, l := range i18n.Languages {
		out[i] = [2]string{l.Code, l.Name}
	}
	return out
}()

func languageName(loc *i18n.Locale, code string) string {
	for _, l := range languageNames {
		if l[0] == code {
			return l[1]
		}
	}
	return loc.T("Browser default")
}

func (u *UI) userList(w http.ResponseWriter, r *http.Request, uc *userContext) {
	p := u.newPage(r, uc, "Users")
	p.Nav = navigation(uc, "/users")
	if err := u.listPage(r, p, "user", "/api/v2/users/", url.Values{"order_by": {"username"}}, userFilterLabels); err != nil {
		u.api.Log.ErrorContext(r.Context(), "user list", "err", err)
	}
	p.Data["searchKeys"] = userSearchKeys
	p.Data["canAdd"] = uc.User.IsSuperuser || uc.IsOrgAdmin
	u.render(w, r, "users_list", p)
}

// loadUserPage loads the user of the path, or answers 404.
func (u *UI) loadUserPage(w http.ResponseWriter, r *http.Request, uc *userContext) (map[string]any, bool) {
	return u.loadObject(w, r, uc, "/api/v2/users/"+r.PathValue("id")+"/")
}

func userTabs(user map[string]any, uc *userContext) []map[string]string {
	id := str(user["id"])
	tabs := []map[string]string{
		{"key": "details", "href": "/users/" + id + "/details", "label": "Details"},
		{"key": "organizations", "href": "/users/" + id + "/organizations", "label": "Organizations"},
		{"key": "teams", "href": "/users/" + id + "/teams", "label": "Teams"},
		{"key": "roles", "href": "/users/" + id + "/roles", "label": "Roles"},
	}
	if str(uc.User.ID) == id {
		tabs = append(tabs, map[string]string{"key": "tokens", "href": "/users/" + id + "/tokens", "label": "Tokens"})
	}
	return tabs
}

var userTabTitles = map[string]string{"details": "Details", "organizations": "Organizations", "teams": "Teams", "roles": "Roles", "tokens": "Tokens"}

func (u *UI) userTab(w http.ResponseWriter, r *http.Request, uc *userContext) {
	user, ok := u.loadUserPage(w, r, uc)
	if !ok {
		return
	}
	id := str(user["id"])
	tab := strings.TrimPrefix(r.URL.Path, "/users/"+id+"/")
	p := u.newPage(r, uc, userTabTitles[tab])
	p.Nav = navigation(uc, "/users")
	p.Data["user"] = user
	p.Data["tab"] = tab
	p.Data["tabs"] = userTabs(user, uc)
	p.Data["userType"] = userType(user)
	p.Data["language"] = languageName(p.Loc, str(user["preferred_language"]))
	p.Data["isMe"] = str(uc.User.ID) == id
	if p.Data["isMe"] == true {
		theme := str(user["preferred_theme"])
		name := p.Loc.T("Default")
		for _, t := range Themes {
			if t.ID == theme {
				name = t.Name
			}
		}
		p.Data["themeName"] = name
	}
	base := "/api/v2/users/" + id + "/"
	switch tab {
	case "organizations":
		if err := u.listPage(r, p, "organizations", base+"organizations/", url.Values{"order_by": {"name"}}, map[string]string{"name__icontains": "Name"}); err != nil {
			u.api.Log.ErrorContext(r.Context(), "user organizations", "err", err)
		}
		p.Data["searchKeys"] = []map[string]string{{"name": "Name", "key": "name__icontains"}}
	case "teams":
		if err := u.listPage(r, p, "teams", base+"teams/", url.Values{"order_by": {"name"}}, map[string]string{"name__icontains": "Name", "organization__name__icontains": "Organization"}); err != nil {
			u.api.Log.ErrorContext(r.Context(), "user teams", "err", err)
		}
		p.Data["searchKeys"] = []map[string]string{{"name": "Name", "key": "name__icontains"}, {"name": "Organization", "key": "organization__name__icontains"}}
		// UserTeamList offered Associate and Disassociate to whoever may add
		// users (a POST in the users list's OPTIONS).
		if res, err := u.apiCall(r, "OPTIONS", "/api/v2/users/", nil); err == nil && res.Status == 200 {
			p.Data["canAssociate"] = dig(res.Data, "actions", "POST") != nil
		}
	case "tokens":
		// UserTokenList; the route answers for any user, the tab is only
		// offered on one's own page.
		if err := u.listPage(r, p, "user", base+"tokens/", url.Values{"order_by": {"application__name"}}, map[string]string{"application__name__icontains": "Application name", "description__icontains": "Description"}); err != nil {
			u.api.Log.ErrorContext(r.Context(), "user tokens", "err", err)
		}
		p.Data["searchKeys"] = []map[string]string{{"name": "Application name", "key": "application__name__icontains"}, {"name": "Description", "key": "description__icontains"}}
	case "roles":
		if err := u.listPage(r, p, "roles", base+"roles/", url.Values{"order_by": {"id"}}, map[string]string{"role_field__icontains": "Role"}); err != nil {
			u.api.Log.ErrorContext(r.Context(), "user roles", "err", err)
		}
		p.Data["searchKeys"] = []map[string]string{{"name": "Role", "key": "role_field__icontains"}}
		// UserRolesList: system administrators and auditors get every
		// permission already, so roles are not added to them.
		p.Data["canAddRoles"] = dig(user, "summary_fields", "user_capabilities", "edit") == true && user["is_superuser"] != true && user["is_system_auditor"] != true
	}
	u.render(w, r, "users_detail", p)
}

func userFormValues(user map[string]any) map[string]any {
	t := "normal"
	if user["is_superuser"] == true {
		t = "administrator"
	} else if user["is_system_auditor"] == true {
		t = "auditor"
	}
	return map[string]any{
		"first_name": str(user["first_name"]), "last_name": str(user["last_name"]), "email": str(user["email"]), "username": str(user["username"]),
		"user_type": t, "preferred_language": str(user["preferred_language"]), "preferred_theme": str(user["preferred_theme"]),
		"ldap": str(user["ldap_dn"]) != "", "external": user["external_account"] != nil,
	}
}

// userPayload builds what UserForm posted.
func userPayload(r *http.Request, editing, isMe bool) (map[string]any, map[string]any) {
	f := r.PostForm
	values := map[string]any{
		"first_name": f.Get("first_name"), "last_name": f.Get("last_name"), "email": f.Get("email"), "username": f.Get("username"),
		"user_type": f.Get("user_type"), "preferred_language": f.Get("preferred_language"), "preferred_theme": f.Get("preferred_theme"),
		"organization": map[string]any{"id": f.Get("organization"), "name": f.Get("organization_name")},
	}
	if values["user_type"] == "" {
		values["user_type"] = "normal"
	}
	payload := map[string]any{
		"first_name": f.Get("first_name"), "last_name": f.Get("last_name"), "email": f.Get("email"), "username": f.Get("username"),
		"preferred_language": f.Get("preferred_language"),
	}
	if _, ok := f["user_type"]; ok {
		payload["is_superuser"] = f.Get("user_type") == "administrator"
		payload["is_system_auditor"] = f.Get("user_type") == "auditor"
	}
	if pw := f.Get("password"); pw != "" {
		payload["password"] = pw
	}
	if editing && isMe {
		payload["preferred_theme"] = f.Get("preferred_theme")
	}
	return payload, values
}

func (u *UI) userFormPage(r *http.Request, uc *userContext, title string) *page {
	p := u.newPage(r, uc, title)
	p.Nav = navigation(uc, "/users")
	p.Data["languages"] = languageNames
	p.Data["themes"] = Themes
	return p
}

func (u *UI) userAdd(w http.ResponseWriter, r *http.Request, uc *userContext) {
	p := u.userFormPage(r, uc, "Create New User")
	if r.Method == http.MethodPost {
		payload, values := userPayload(r, false, false)
		errs := map[string][]string{}
		if r.PostForm.Get("password") != r.PostForm.Get("confirm_password") {
			errs["confirm_password"] = []string{p.Loc.T("This value does not match the password you entered previously. Please confirm that password.")}
		}
		org := r.PostForm.Get("organization")
		if org == "" {
			errs["organization"] = []string{p.Loc.T("Select a value for this field")}
		}
		if len(errs) > 0 {
			u.renderForm(w, r, p, "users_form", values, errs)
			return
		}
		u.submitForm(w, r, p, "users_form", "POST", "/api/v2/organizations/"+org+"/users/", payload, values, "/users/{id}/details")
		return
	}
	values := userFormValues(map[string]any{})
	values["organization"] = u.autoOrganization(r, "admin_role")
	p.Data["values"] = values
	u.render(w, r, "users_form", p)
}

func (u *UI) userEdit(w http.ResponseWriter, r *http.Request, uc *userContext) {
	user, ok := u.loadUserPage(w, r, uc)
	if !ok {
		return
	}
	id := str(user["id"])
	isMe := str(uc.User.ID) == id
	p := u.userFormPage(r, uc, "Edit Details")
	p.Data["user"] = user
	p.Data["isMe"] = isMe
	p.Data["editing"] = true
	if r.Method == http.MethodPost {
		payload, values := userPayload(r, true, isMe)
		values["ldap"] = str(user["ldap_dn"]) != ""
		values["external"] = user["external_account"] != nil
		if !uc.User.IsSuperuser {
			delete(payload, "is_superuser")
			delete(payload, "is_system_auditor")
		}
		if r.PostForm.Get("password") != r.PostForm.Get("confirm_password") {
			u.renderForm(w, r, p, "users_form", values, map[string][]string{"confirm_password": {p.Loc.T("This value does not match the password you entered previously. Please confirm that password.")}})
			return
		}
		u.submitForm(w, r, p, "users_form", "PATCH", "/api/v2/users/"+id+"/", payload, values, "/users/"+id+"/details")
		return
	}
	p.Data["values"] = userFormValues(user)
	u.render(w, r, "users_form", p)
}

// ---------------------------------------------------------------- teams

func (u *UI) teamList(w http.ResponseWriter, r *http.Request, uc *userContext) {
	p := u.newPage(r, uc, "Teams")
	p.Nav = navigation(uc, "/teams")
	if err := u.listPage(r, p, "team", "/api/v2/teams/", url.Values{"order_by": {"name"}}, teamFilterLabels); err != nil {
		u.api.Log.ErrorContext(r.Context(), "team list", "err", err)
	}
	p.Data["searchKeys"] = teamSearchKeys
	p.Data["canAdd"] = uc.User.IsSuperuser || uc.IsOrgAdmin
	u.render(w, r, "teams_list", p)
}

func (u *UI) loadTeamPage(w http.ResponseWriter, r *http.Request, uc *userContext) (map[string]any, bool) {
	return u.loadObject(w, r, uc, "/api/v2/teams/"+r.PathValue("id")+"/")
}

var teamTabTitles = map[string]string{"details": "Details", "access": "Access", "roles": "Roles"}

func (u *UI) teamTab(w http.ResponseWriter, r *http.Request, uc *userContext) {
	team, ok := u.loadTeamPage(w, r, uc)
	if !ok {
		return
	}
	id := str(team["id"])
	tab := strings.TrimPrefix(r.URL.Path, "/teams/"+id+"/")
	p := u.newPage(r, uc, teamTabTitles[tab])
	p.Nav = navigation(uc, "/teams")
	p.Data["team"] = team
	p.Data["tab"] = tab
	p.Data["tabs"] = []map[string]string{
		{"key": "details", "href": "/teams/" + id + "/details", "label": "Details"},
		{"key": "access", "href": "/teams/" + id + "/access", "label": "Access"},
		{"key": "roles", "href": "/teams/" + id + "/roles", "label": "Roles"},
	}
	switch tab {
	case "access":
		u.accessTab(r, p, "/api/v2/teams/"+id+"/", team)
	case "roles":
		if err := u.listPage(r, p, "roles", "/api/v2/teams/"+id+"/roles/", url.Values{"order_by": {"id"}}, map[string]string{"role_field__icontains": "Role"}); err != nil {
			u.api.Log.ErrorContext(r.Context(), "team roles", "err", err)
		}
		p.Data["searchKeys"] = []map[string]string{{"name": "Role", "key": "role_field__icontains"}}
		p.Data["canAddRoles"] = dig(team, "summary_fields", "user_capabilities", "edit") == true
	}
	u.render(w, r, "teams_detail", p)
}

func (u *UI) teamFormPost(r *http.Request) (map[string]any, map[string]any) {
	f := r.PostForm
	payload := map[string]any{"name": f.Get("name"), "description": f.Get("description")}
	if id := f.Get("organization"); id != "" {
		payload["organization"] = atoiDefault(id, 0)
	} else {
		payload["organization"] = nil
	}
	values := map[string]any{"name": f.Get("name"), "description": f.Get("description"), "organization": map[string]any{"id": f.Get("organization"), "name": f.Get("organization_name")}}
	return payload, values
}

func (u *UI) teamAdd(w http.ResponseWriter, r *http.Request, uc *userContext) {
	p := u.newPage(r, uc, "Create New Team")
	p.Nav = navigation(uc, "/teams")
	if r.Method == http.MethodPost {
		payload, values := u.teamFormPost(r)
		u.submitForm(w, r, p, "teams_form", "POST", "/api/v2/teams/", payload, values, "/teams/{id}/details")
		return
	}
	p.Data["values"] = map[string]any{"organization": u.autoOrganization(r, "")}
	u.render(w, r, "teams_form", p)
}

func (u *UI) teamEdit(w http.ResponseWriter, r *http.Request, uc *userContext) {
	team, ok := u.loadTeamPage(w, r, uc)
	if !ok {
		return
	}
	id := str(team["id"])
	p := u.newPage(r, uc, "Edit Details")
	p.Nav = navigation(uc, "/teams")
	p.Data["team"] = team
	p.Data["editing"] = true
	if r.Method == http.MethodPost {
		payload, values := u.teamFormPost(r)
		u.submitForm(w, r, p, "teams_form", "PATCH", "/api/v2/teams/"+id+"/", payload, values, "/teams/"+id+"/details")
		return
	}
	p.Data["values"] = map[string]any{"name": str(team["name"]), "description": str(team["description"]), "organization": refValue(team, "organization")}
	u.render(w, r, "teams_form", p)
}

// ---------------------------------------------------------------- access

var accessSearchKeys = []map[string]string{
	{"name": "Username", "key": "username__icontains"},
	{"name": "First Name", "key": "first_name__icontains"},
	{"name": "Last Name", "key": "last_name__icontains"},
}

var accessFilterLabels = searchLabels(accessSearchKeys, "or__roles__in", "Roles")

// accessRow is one ResourceAccessListItem: the user and their roles split
// into the user's own and those that come through a team.
type accessRow struct {
	User                 map[string]any
	UserRoles, TeamRoles []map[string]any
}

// accessTab loads ResourceAccessList for a resource's Access tab.
func (u *UI) accessTab(r *http.Request, p *page, apiBase string, resource map[string]any) {
	if err := u.listPage(r, p, "access", apiBase+"access_list/", url.Values{"order_by": {"first_name"}, "page_size": {"5"}}, accessFilterLabels); err != nil {
		u.api.Log.ErrorContext(r.Context(), "access list", "err", err)
	}
	var rows []accessRow
	if list, ok := p.Data["results"].([]any); ok {
		for _, it := range list {
			m, _ := it.(map[string]any)
			row := accessRow{User: m}
			for _, key := range []string{"direct_access", "indirect_access"} {
				entries, _ := dig(m, "summary_fields", key).([]any)
				for _, e := range entries {
					role, _ := dig(e, "role").(map[string]any)
					if role == nil {
						continue
					}
					if _, isTeam := role["team_id"]; isTeam {
						row.TeamRoles = append(row.TeamRoles, role)
					} else {
						row.UserRoles = append(row.UserRoles, role)
					}
				}
			}
			rows = append(rows, row)
		}
	}
	p.Data["accessRows"] = rows
	keys := append([]map[string]string{}, accessSearchKeys...)
	if str(resource["type"]) == "organization" {
		keys = append(keys, map[string]string{"name": "Roles", "key": "or__roles__in"})
	}
	p.Data["searchKeys"] = keys
	canAdd := p.UC.User.IsSuperuser
	edit := dig(resource, "summary_fields", "user_capabilities", "edit") == true
	if str(resource["type"]) == "credential" {
		if edit && resource["organization"] != nil {
			canAdd = true
		}
	} else {
		canAdd = edit
	}
	p.Data["accessCanAdd"] = canAdd
	// The wizard offers the roles in the order the API lists them, so they
	// are taken from the raw response rather than a re-encoded map.
	p.Data["accessRoles"] = "{}"
	if res, err := u.apiCall(r, "GET", apiBase, nil); err == nil && res.Status == 200 {
		var raw struct {
			SummaryFields struct {
				ObjectRoles json.RawMessage `json:"object_roles"`
			} `json:"summary_fields"`
		}
		if json.Unmarshal(res.Raw, &raw) == nil && len(raw.SummaryFields.ObjectRoles) > 0 {
			p.Data["accessRoles"] = string(raw.SummaryFields.ObjectRoles)
		}
	}
	p.Data["accessResource"] = resource
	p.Data["accessNoTeams"] = str(resource["type"]) == "team" || (str(resource["type"]) == "credential" && resource["organization"] == nil)
}

// autoOrganization is OrganizationLookup's autoPopulate: when exactly one
// organization can be chosen it is preselected.
func (u *UI) autoOrganization(r *http.Request, roleLevel string) map[string]any {
	query := ""
	if roleLevel != "" {
		query = "role_level=" + roleLevel
	}
	ref, _ := u.autoLookup(r, "/api/v2/organizations/", query)
	return ref
}

// autoLookup is useAutoPopulateLookup: when the lookup's list (path with
// query, the lookup's own filters) holds exactly one item, it is chosen. The
// item comes back too, for what else the form takes from it; the ref is
// empty, and the item nil, otherwise.
func (u *UI) autoLookup(r *http.Request, path, query string) (map[string]any, map[string]any) {
	if query != "" {
		query += "&"
	}
	if res, err := u.apiCall(r, "GET", path+"?"+query+"page_size=2", nil); err == nil && res.Status == 200 && num(res.Data["count"]) == 1 {
		if list, ok := res.Data["results"].([]any); ok && len(list) == 1 {
			if o, ok := list[0].(map[string]any); ok {
				return map[string]any{"id": str(o["id"]), "name": str(o["name"])}, o
			}
		}
	}
	return map[string]any{"id": "", "name": ""}, nil
}
