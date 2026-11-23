package web

import (
	"net/http"
	"net/url"
	"path"
	"slices"
	"strconv"
	"strings"

	"github.com/ctrliq/ascender/internal/api"
	"github.com/ctrliq/ascender/internal/i18n"
)

func (u *UI) registerOrganizations(mux *http.ServeMux) {
	mux.HandleFunc("/organizations", u.protected(u.organizationList))
	mux.HandleFunc("/organizations/{$}", u.protected(u.organizationList))
	mux.HandleFunc("/organizations/add", u.protected(u.organizationAdd))
	mux.HandleFunc("/organizations/{id}", u.protected(toDetails))
	mux.HandleFunc("/organizations/{id}/details", u.protected(u.organizationDetail))
	mux.HandleFunc("/organizations/{id}/edit", u.protected(u.organizationEdit))
	for _, tab := range []string{"access", "teams", "notifications", "execution_environments"} {
		mux.HandleFunc("/organizations/{id}/"+tab, u.protected(u.organizationTab))
	}
}

var organizationSearchKeys = []map[string]string{
	{"name": "Name", "key": "name__icontains"},
	{"name": "Description", "key": "description__icontains"},
	{"name": "Created By (Username)", "key": "created_by__username__icontains"},
	{"name": "Modified By (Username)", "key": "modified_by__username__icontains"},
}

var organizationFilterLabels = searchLabels(organizationSearchKeys)

func (u *UI) organizationList(w http.ResponseWriter, r *http.Request, uc *userContext) {
	p := u.newPage(r, uc, "Organizations")
	if err := u.listPage(r, p, "organization", "/api/v2/organizations/", url.Values{"order_by": {"name"}}, organizationFilterLabels); err != nil {
		u.api.Log.ErrorContext(r.Context(), "organization list", "err", err)
	}
	p.Data["searchKeys"] = organizationSearchKeys
	u.render(w, r, "organizations_list", p)
}

func (u *UI) organizationDetail(w http.ResponseWriter, r *http.Request, uc *userContext) {
	id := r.PathValue("id")
	org, ok := u.loadObject(w, r, uc, "/api/v2/organizations/"+id+"/")
	if !ok {
		return
	}
	p := u.newPage(r, uc, "Details")
	p.Data["organization"] = org
	p.Data["tab"] = "details"
	// OrganizationDetail read the instance groups, and Organization the
	// galaxy credentials, each a default page of its relation.
	p.Data["instance_groups"] = u.listResults(r, "/api/v2/organizations/"+id+"/instance_groups/")
	p.Data["galaxy_credentials"] = u.listResults(r, "/api/v2/organizations/"+id+"/galaxy_credentials/")
	u.render(w, r, "organizations_detail", p)
}

var organizationTabTitles = map[string]string{"access": "Access", "teams": "Teams", "notifications": "Notifications", "execution_environments": "Execution Environments"}

func (u *UI) organizationTab(w http.ResponseWriter, r *http.Request, uc *userContext) {
	id := r.PathValue("id")
	org, ok := u.loadObject(w, r, uc, "/api/v2/organizations/"+id+"/")
	if !ok {
		return
	}
	tab := strings.TrimPrefix(r.URL.Path, "/organizations/"+id+"/")
	p := u.newPage(r, uc, organizationTabTitles[tab])
	p.Data["organization"] = org
	p.Data["tab"] = tab
	if tab == "access" {
		u.accessTab(r, p, "/api/v2/organizations/"+id+"/", org)
	}
	if tab == "notifications" {
		edit := uc.User.IsSuperuser || uc.User.IsSystemAuditor || dig(org, "summary_fields", "user_capabilities", "edit") == true
		u.notificationsTab(r, p, "/api/v2/organizations/"+id+"/", []string{"approvals", "started", "success", "error", "changed"}, u.isNotificationAdmin(r) && edit)
	}
	if tab == "teams" {
		if err := u.listPage(r, p, "team", "/api/v2/organizations/"+id+"/teams/", url.Values{"order_by": {"name"}, "page_size": {"5"}}, map[string]string{"name__icontains": "Name", "created_by__username__icontains": "Created By (Username)", "modified_by__username__icontains": "Modified By (Username)"}); err != nil {
			u.api.Log.ErrorContext(r.Context(), "organization teams", "err", err)
		}
		p.Data["searchKeys"] = []map[string]string{{"name": "Name", "key": "name__icontains"}, {"name": "Created By (Username)", "key": "created_by__username__icontains"}, {"name": "Modified By (Username)", "key": "modified_by__username__icontains"}}
	}
	u.render(w, r, "organizations_detail", p)
}

func organizationFormValues(data map[string]any) map[string]any {
	v := map[string]any{
		"name":        str(data["name"]),
		"description": str(data["description"]),
	}
	v["default_environment"] = refValue(data, "default_environment")
	return v
}

func organizationFormFromPost(r *http.Request) (map[string]any, map[string]any) {
	f := r.PostForm
	payload := map[string]any{
		"name":        f.Get("name"),
		"description": f.Get("description"),
	}
	if id := strings.TrimSpace(f.Get("default_environment")); id != "" {
		payload["default_environment"] = atoiDefault(id, 0)
	} else {
		payload["default_environment"] = nil
	}
	values := map[string]any{"name": f.Get("name"), "description": f.Get("description"),
		"default_environment": map[string]any{"id": f.Get("default_environment"), "name": f.Get("default_environment_name")},
		"instance_groups":     multiRefs(f, "instance_groups"), "galaxy_credentials": multiRefs(f, "galaxy_credentials")}
	return payload, values
}

// orderRelation saves an ordered relation (instance groups, galaxy
// credentials, input inventories) as the picks give it, touching only
// what it must: members dropped are detached and members added at the
// end attached, the rest left linked. Only a change of order takes, as
// orderInstanceGroups did, the detach of every member and the attach of
// the picks in their order; and as attaching needs rights detaching does
// not (use of an instance group, input inventory or galaxy credential),
// they are checked for every pick first, so a reorder the user could not
// finish never leaves a member detached.
func (u *UI) orderRelation(r *http.Request, loc *i18n.Locale, apiPath string, wanted []int64) *apiResult {
	all, status, ok := u.listAll(r, apiPath)
	if !ok {
		return &apiResult{Status: status, Data: map[string]any{"detail": loc.T("The current members could not be read.")}}
	}
	current := []int64{}
	for _, it := range all {
		current = append(current, int64(num(dig(it, "id"))))
	}
	if slices.Equal(current, wanted) {
		return nil
	}
	removed, added, reorder := orderPlan(current, wanted)
	attach := func(id int64, detach bool) *apiResult {
		body := map[string]any{"id": id}
		if detach {
			body["disassociate"] = true
		}
		if res, err := u.apiCall(r, "POST", apiPath, body); err != nil || res.Status >= 400 {
			return failedCall(res, err)
		}
		return nil
	}
	if !reorder {
		for _, id := range removed {
			if res := attach(id, true); res != nil {
				return res
			}
		}
		for _, id := range added {
			if res := attach(id, false); res != nil {
				return res
			}
		}
		return nil
	}
	if res := u.mayAttachAll(r, apiPath, wanted); res != nil {
		return res
	}
	for _, id := range current {
		if res := attach(id, true); res != nil {
			return res
		}
	}
	for _, id := range wanted {
		if res := attach(id, false); res != nil {
			return res
		}
	}
	return nil
}

// orderPlan compares an ordered relation's members with the picks: the
// members to detach and the picks to attach, unless the members kept
// change order among themselves or a pick goes anywhere but the end, which
// takes a reorder of the whole relation.
func orderPlan(current, wanted []int64) (removed, added []int64, reorder bool) {
	var kept []int64
	for _, id := range current {
		if slices.Contains(wanted, id) {
			kept = append(kept, id)
		} else {
			removed = append(removed, id)
		}
	}
	for _, id := range wanted {
		if !slices.Contains(current, id) {
			added = append(added, id)
		}
	}
	return removed, added, !slices.Equal(wanted, append(kept, added...))
}

// orderedRelationAttach is, for each ordered relation, the list of what
// may be attached to it and the role attaching takes.
var orderedRelationAttach = map[string][2]string{
	"instance_groups":    {"/api/v2/instance_groups/", "use_role"},
	"input_inventories":  {"/api/v2/inventories/", "use_role"},
	"galaxy_credentials": {"/api/v2/credentials/", "use_role"},
}

// mayAttachAll checks, before a reorder detaches anything, that the user
// may attach every pick again, answering as the attach would have.
func (u *UI) mayAttachAll(r *http.Request, apiPath string, ids []int64) *apiResult {
	rel := path.Base(strings.TrimSuffix(apiPath, "/"))
	spec, ok := orderedRelationAttach[rel]
	if !ok || len(ids) == 0 {
		return nil
	}
	strs := make([]string, len(ids))
	for i, id := range ids {
		strs[i] = strconv.FormatInt(id, 10)
	}
	q := url.Values{"role_level": {spec[1]}, "id__in": {strings.Join(strs, ",")}}
	all, status, ok := u.listAll(r, spec[0]+"?"+q.Encode())
	if !ok {
		return &apiResult{Status: status}
	}
	granted := map[int64]bool{}
	for _, it := range all {
		granted[int64(num(dig(it, "id")))] = true
	}
	var missing []string
	for _, id := range ids {
		if !granted[id] {
			missing = append(missing, strconv.FormatInt(id, 10))
		}
	}
	// The managed public Galaxy credential takes only sight of it, which
	// the credentials list gives: the others need use.
	if len(missing) > 0 && rel == "galaxy_credentials" {
		q := url.Values{"managed": {"true"}, "id__in": {strings.Join(missing, ",")}}
		seen, status, ok := u.listAll(r, spec[0]+"?"+q.Encode())
		if !ok {
			return &apiResult{Status: status}
		}
		if len(seen) == len(missing) {
			missing = nil
		}
	}
	if len(missing) > 0 {
		return &apiResult{Status: http.StatusForbidden, Data: map[string]any{"detail": api.Tr(r, "You do not have permission to perform this action.")}}
	}
	return nil
}

// orderInstanceGroups saves a resource's instance groups (or a constructed
// inventory's input inventories) in the order the form's draggable list put
// them, as each form's orderInstanceGroups did.
func (u *UI) orderInstanceGroups(r *http.Request, apiPath string, refs []map[string]any) *apiResult {
	return u.orderRelation(r, i18n.New(api.LanguageFrom(r.Context())), apiPath, refIDs(refs))
}

// saveOrganizationRelations orders the instance groups, then the galaxy
// credentials, as OrganizationAdd and OrganizationEdit did after the save.
func (u *UI) saveOrganizationRelations(r *http.Request, loc *i18n.Locale, id string, values map[string]any) *apiResult {
	base := "/api/v2/organizations/" + id + "/"
	if res := u.orderRelation(r, loc, base+"instance_groups/", refIDs(values["instance_groups"].([]map[string]any))); res != nil {
		return res
	}
	return u.orderRelation(r, loc, base+"galaxy_credentials/", refIDs(values["galaxy_credentials"].([]map[string]any)))
}

func (u *UI) organizationAdd(w http.ResponseWriter, r *http.Request, uc *userContext) {
	p := u.newPage(r, uc, "Create New Organization")
	if r.Method == http.MethodPost {
		payload, values := organizationFormFromPost(r)
		u.submitForm(w, r, p, "organizations_form", "POST", "/api/v2/organizations/", payload, values, "/organizations/{id}/details", func(org map[string]any) *apiResult {
			return u.saveOrganizationRelations(r, p.Loc, str(org["id"]), values)
		})
		return
	}
	v := organizationFormValues(map[string]any{})
	v["instance_groups"] = []map[string]any{}
	// OrganizationAdd started the form with the managed Galaxy credential.
	v["galaxy_credentials"] = refList(firstOnly(u.listResults(r, "/api/v2/credentials/?credential_type__kind=galaxy&managed=true")))
	p.Data["values"] = v
	u.render(w, r, "organizations_form", p)
}

func firstOnly(items []any) []any {
	if len(items) > 1 {
		return items[:1]
	}
	return items
}

func (u *UI) organizationEdit(w http.ResponseWriter, r *http.Request, uc *userContext) {
	id := r.PathValue("id")
	org, ok := u.loadObject(w, r, uc, "/api/v2/organizations/"+id+"/")
	if !ok {
		return
	}
	p := u.newPage(r, uc, "Edit Details")
	p.Data["organization"] = org
	if r.Method == http.MethodPost {
		payload, values := organizationFormFromPost(r)
		u.submitForm(w, r, p, "organizations_form", "PATCH", "/api/v2/organizations/"+id+"/", payload, values, "/organizations/"+id+"/details", func(map[string]any) *apiResult {
			return u.saveOrganizationRelations(r, p.Loc, id, values)
		})
		return
	}
	v := organizationFormValues(org)
	// Saving replaces both relations with the form's lists, so they must
	// hold every member: a form that could not load them is not shown
	// (OrganizationForm showed its ContentError).
	igs, status, ok := u.listAll(r, "/api/v2/organizations/"+id+"/instance_groups/")
	creds, status2, ok2 := u.listAll(r, "/api/v2/organizations/"+id+"/galaxy_credentials/")
	if !ok || !ok2 {
		if ok {
			status = status2
		}
		p.Data["loadError"] = status
		u.render(w, r, "organizations_form", p)
		return
	}
	v["instance_groups"] = refList(igs)
	v["galaxy_credentials"] = refList(creds)
	p.Data["values"] = v
	u.render(w, r, "organizations_form", p)
}
