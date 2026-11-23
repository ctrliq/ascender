package web

import (
	"encoding/json"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/ctrliq/ascender/internal/i18n"
)

// inventoryTypeSegment maps an inventory kind to the URL segment the old UI
// used (/inventories/<segment>/<id>/...).
func inventoryTypeSegment(kind string) string {
	switch kind {
	case "smart":
		return "smart_inventory"
	case "constructed":
		return "constructed_inventory"
	case "federated":
		return "federated_inventory"
	}
	return "inventory"
}

func kindFromSegment(seg string) string {
	switch seg {
	case "smart_inventory":
		return "smart"
	case "constructed_inventory":
		return "constructed"
	case "federated_inventory":
		return "federated"
	}
	return ""
}

// inventoryKindLabel is InventoryListItem's typeLabel.
func inventoryKindLabel(loc *i18n.Locale, kind string) string {
	switch kind {
	case "":
		return loc.T("Inventory")
	case "smart":
		return loc.T("Smart Inventory")
	case "constructed":
		return loc.T("Constructed Inventory")
	case "federated":
		return loc.T("Federated Inventory")
	}
	return ""
}

var inventorySegments = []string{"inventory", "smart_inventory", "constructed_inventory", "federated_inventory"}

func (u *UI) registerInventories(mux *http.ServeMux) {
	mux.HandleFunc("/inventories", u.protected(u.inventoryList))
	mux.HandleFunc("/inventories/{$}", u.protected(u.inventoryList))
	for _, seg := range inventorySegments {
		b := "/inventories/" + seg
		mux.HandleFunc(b+"/add", u.protected(u.inventoryAdd))
		mux.HandleFunc(b+"/{id}", u.protected(toDetails))
		mux.HandleFunc(b+"/{id}/details", u.protected(u.inventoryDetail))
		mux.HandleFunc(b+"/{id}/edit", u.protected(u.inventoryEdit))
		mux.HandleFunc(b+"/{id}/hosts", u.protected(u.inventoryHosts))
		mux.HandleFunc(b+"/{id}/hosts/add", u.protected(u.inventoryHostAdd))
		mux.HandleFunc(b+"/{id}/hosts/{hid}", u.protected(toDetails))
		for _, tab := range []string{"details", "facts", "groups", "jobs"} {
			mux.HandleFunc(b+"/{id}/hosts/{hid}/"+tab, u.protected(u.inventoryHostDetail))
		}
		mux.HandleFunc(b+"/{id}/hosts/{hid}/edit", u.protected(u.inventoryHostEdit))
		mux.HandleFunc(b+"/{id}/groups", u.protected(u.inventoryGroups))
		mux.HandleFunc(b+"/{id}/groups/add", u.protected(u.inventoryGroupAdd))
		mux.HandleFunc(b+"/{id}/groups/{gid}", u.protected(toDetails))
		for _, tab := range []string{"details", "nested_hosts", "nested_groups"} {
			mux.HandleFunc(b+"/{id}/groups/{gid}/"+tab, u.protected(u.inventoryGroupDetail))
		}
		mux.HandleFunc(b+"/{id}/groups/{gid}/edit", u.protected(u.inventoryGroupEdit))
		for _, tab := range []string{"access", "sources", "jobs", "job_templates"} {
			mux.HandleFunc(b+"/{id}/"+tab, u.protected(u.inventoryTab))
		}
	}
}

var inventorySearchKeys = []map[string]string{
	{"name": "Name", "key": "name__icontains"},
	{"name": "Inventory Type", "key": "or__kind", "options": "inventory_kind"},
	{"name": "Organization", "key": "organization__name"},
	{"name": "Description", "key": "description__icontains"},
	{"name": "Created By (Username)", "key": "created_by__username__icontains"},
	{"name": "Modified By (Username)", "key": "modified_by__username__icontains"},
}

var inventoryFilterLabels = searchLabels(inventorySearchKeys, "kind", "Inventory Type", "inventory_sources_with_failures__gt", "Inventory sources with failures")

var sourceSearchKeys = []map[string]string{
	{"name": "Name", "key": "name__icontains"},
	{"name": "Source", "key": "or__source"},
	{"name": "Created By (Username)", "key": "created_by__username__icontains"},
	{"name": "Modified By (Username)", "key": "modified_by__username__icontains"},
}

var sourceFilterLabels = searchLabels(sourceSearchKeys)

var sourceTypeLabels = map[string]string{
	"file": "File, Directory or Script", "constructed": "Template additional groups and hostvars at runtime", "scm": "Sourced from a Project", "ec2": "Amazon EC2",
	"gce": "Google Compute Engine", "azure_rm": "Microsoft Azure Resource Manager", "vmware": "VMware vCenter", "satellite6": "Red Hat Satellite 6",
	"openstack": "OpenStack", "terraform": "Terraform State", "ascender": "CIQ Ascender Automation Platform",
}

// decorateInventory adds the derived values the templates use, in the
// page's language.
func decorateInventory(inv map[string]any, loc *i18n.Locale) {
	kind := str(inv["kind"])
	inv["_segment"] = inventoryTypeSegment(kind)
	inv["_kind_label"] = inventoryKindLabel(loc, kind)
	inv["_base"] = "/inventories/" + inventoryTypeSegment(kind) + "/" + str(inv["id"])
	status, tip := "disabled", loc.T("Not configured for inventory sync.")
	if inv["has_inventory_sources"] == true {
		if n := num(inv["inventory_sources_with_failures"]); n > 0 {
			status = "error"
			tip = loc.T("{0, plural, one {# source with sync failures.} other {# sources with sync failures.}}", "0", n)
		} else {
			status, tip = "success", loc.T("No inventory sync failures.")
		}
	}
	inv["_sync_status"] = status
	inv["_sync_tooltip"] = tip
}

// inventoryTabs lists the routed tabs of an inventory, which depend on its kind.
func inventoryTabs(inv map[string]any) []map[string]string {
	base := str(inv["_base"])
	mk := func(key, label string) map[string]string {
		return map[string]string{"key": key, "href": base + "/" + key, "label": label}
	}
	switch str(inv["kind"]) {
	case "smart":
		return []map[string]string{mk("details", "Details"), mk("access", "Access"), mk("hosts", "Hosts"), mk("jobs", "Jobs"), mk("job_templates", "Job Templates")}
	case "constructed", "federated":
		return []map[string]string{mk("details", "Details"), mk("access", "Access"), mk("hosts", "Hosts"), mk("groups", "Groups"), mk("jobs", "Jobs"), mk("job_templates", "Job Templates")}
	}
	return []map[string]string{mk("details", "Details"), mk("access", "Access"), mk("groups", "Groups"), mk("hosts", "Hosts"), mk("sources", "Sources"), mk("jobs", "Jobs"), mk("job_templates", "Job Templates")}
}

func (u *UI) inventoryList(w http.ResponseWriter, r *http.Request, uc *userContext) {
	p := u.newPage(r, uc, "Inventories")
	if err := u.listPage(r, p, "inventory", "/api/v2/inventories/", url.Values{"order_by": {"name"}}, inventoryFilterLabels); err != nil {
		u.api.Log.ErrorContext(r.Context(), "inventory list", "err", err)
	}
	p.Data["searchKeys"] = inventorySearchKeys
	if results, ok := p.Data["results"].([]any); ok {
		for _, it := range results {
			if inv, ok := it.(map[string]any); ok {
				decorateInventory(inv, p.Loc)
			}
		}
	}
	u.render(w, r, "inventories_list", p)
}

func (u *UI) loadInventory(w http.ResponseWriter, r *http.Request, uc *userContext) (map[string]any, bool) {
	inv, ok := u.loadObject(w, r, uc, "/api/v2/inventories/"+r.PathValue("id")+"/")
	if !ok {
		return nil, false
	}
	decorateInventory(inv, u.locale(r, uc))
	// An inventory opened under another kind's URL goes to its own details
	// page, as Inventory, SmartInventory and ConstructedInventory did.
	if parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/"); len(parts) > 1 && parts[1] != inventoryTypeSegment(str(inv["kind"])) {
		http.Redirect(w, r, str(inv["_base"])+"/details", http.StatusFound)
		return nil, false
	}
	return inv, true
}

func (u *UI) inventoryPage(r *http.Request, uc *userContext, inv map[string]any, tab, title string) *page {
	p := u.newPage(r, uc, title)
	p.Nav = navigation(uc, "/inventories")
	p.Data["inventory"] = inv
	p.Data["tab"] = tab
	p.Data["tabs"] = inventoryTabs(inv)
	if tab == "access" {
		u.accessTab(r, p, "/api/v2/inventories/"+str(inv["id"])+"/", inv)
	}
	return p
}

// inventoryRelations loads the instance groups and input inventories shown
// on detail pages and edit forms. Every member is read: the edit form's
// save replaces the ordered relations with what it shows, so it says
// (ok false, with the status) when they could not all be read.
func (u *UI) inventoryRelations(r *http.Request, inv map[string]any) (int, bool) {
	id := str(inv["id"])
	kind := str(inv["kind"])
	if kind != "federated" {
		igs, status, ok := u.listAll(r, "/api/v2/inventories/"+id+"/instance_groups/")
		if !ok {
			return status, false
		}
		for _, ig := range igs {
			if m, ok := ig.(map[string]any); ok {
				href := "/instance_groups/"
				if m["is_container_group"] == true {
					href += "container_group/"
				}
				m["_href"] = href + str(m["id"]) + "/details"
			}
		}
		inv["_instance_groups"] = igs
	}
	if kind == "constructed" || kind == "federated" {
		ins, status, ok := u.listAll(r, "/api/v2/inventories/"+id+"/input_inventories/")
		if !ok {
			return status, false
		}
		for _, in := range ins {
			if m, ok := in.(map[string]any); ok {
				m["_href"] = "/inventories/inventory/" + str(m["id"]) + "/details"
			}
		}
		inv["_input_inventories"] = ins
	}
	if kind == "constructed" {
		if res, err := u.apiCall(r, "GET", "/api/v2/constructed_inventories/"+id+"/", nil); err == nil && res.Status == 200 {
			for _, k := range []string{"source_vars", "limit", "update_cache_timeout", "verbosity"} {
				inv[k] = res.Data[k]
			}
		}
		if srcs := u.listResults(r, "/api/v2/inventories/"+id+"/inventory_sources/?page_size=1"); len(srcs) > 0 {
			inv["_source"] = srcs[0]
		}
	}
	return 0, true
}

func (u *UI) inventoryDetail(w http.ResponseWriter, r *http.Request, uc *userContext) {
	inv, ok := u.loadInventory(w, r, uc)
	if !ok {
		return
	}
	p := u.inventoryPage(r, uc, inv, "details", "Details")
	u.inventoryRelations(r, inv)
	p.Data["editor"] = true
	u.render(w, r, "inventories_detail", p)
}

var inventoryTabTitles = map[string]string{"access": "Access", "sources": "Sources", "jobs": "Jobs", "job_templates": "Job Templates", "hosts": "Hosts", "groups": "Groups"}

func lastPathSegment(r *http.Request) string {
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	return parts[len(parts)-1]
}

func (u *UI) inventoryTab(w http.ResponseWriter, r *http.Request, uc *userContext) {
	inv, ok := u.loadInventory(w, r, uc)
	if !ok {
		return
	}
	tab := lastPathSegment(r)
	p := u.inventoryPage(r, uc, inv, tab, inventoryTabTitles[tab])
	id := str(inv["id"])
	switch tab {
	case "jobs":
		// JobList's defaultParams; a federated inventory has no sources.
		params := url.Values{"or__job__inventory": {id}, "or__adhoccommand__inventory": {id}, "or__workflowjob__inventory": {id}}
		if str(inv["kind"]) != "federated" {
			params["or__inventoryupdate__inventory_source__inventory"] = []string{id}
		}
		u.relatedJobsTab(r, p, params)
	case "job_templates":
		var resource map[string]string
		if str(inv["kind"]) == "" {
			// Only a plain inventory's tab passed itself to the Add link.
			resource = map[string]string{"resource_id": id, "resource_name": str(inv["name"]), "resource_type": "inventory"}
		}
		u.relatedTemplatesTab(r, p, url.Values{"inventory__id": {id}}, resource)
	}
	if tab == "sources" {
		if err := u.listPage(r, p, "inventory_source", "/api/v2/inventories/"+str(inv["id"])+"/inventory_sources/", url.Values{"order_by": {"name"}}, sourceFilterLabels); err != nil {
			u.api.Log.ErrorContext(r.Context(), "sources list", "err", err)
		}
		p.Data["searchKeys"] = sourceSearchKeys
		if results, ok := p.Data["results"].([]any); ok {
			for _, it := range results {
				if src, ok := it.(map[string]any); ok {
					src["_type_label"] = sourceTypeLabels[str(src["source"])]
					if job := dig(src, "summary_fields", "current_job"); job != nil {
						src["_job"] = job
					} else {
						src["_job"] = dig(src, "summary_fields", "last_job")
					}
				}
			}
		}
	}
	u.render(w, r, "inventories_detail", p)
}

func (u *UI) inventoryHosts(w http.ResponseWriter, r *http.Request, uc *userContext) {
	inv, ok := u.loadInventory(w, r, uc)
	if !ok {
		return
	}
	p := u.inventoryPage(r, uc, inv, "hosts", "Hosts")
	if kind := str(inv["kind"]); kind != "" {
		// AdvancedInventoryHostList: smart, constructed and federated
		// inventories list hosts with their recent jobs and own inventory.
		if err := u.listPage(r, p, "host", "/api/v2/inventories/"+str(inv["id"])+"/hosts/", url.Values{"order_by": {"name"}}, advHostFilterLabels); err != nil {
			u.api.Log.ErrorContext(r.Context(), "inventory hosts", "err", err)
		}
		p.Data["searchKeys"] = advHostSearchKeys
		p.Data["segment"] = strings.Split(strings.Trim(r.URL.Path, "/"), "/")[1]
		if dig(inv, "summary_fields", "user_capabilities", "adhoc") == true {
			u.withAdHoc(r, p, inv)
		}
		u.render(w, r, "inventories_adv_hosts", p)
		return
	}
	if err := u.listPage(r, p, "host", "/api/v2/inventories/"+str(inv["id"])+"/hosts/", url.Values{"order_by": {"name"}}, hostFilterLabels); err != nil {
		u.api.Log.ErrorContext(r.Context(), "inventory hosts", "err", err)
	}
	p.Data["searchKeys"] = hostSearchKeys
	p.Data["readonly"] = str(inv["kind"]) != ""
	u.withAdHoc(r, p, inv)
	u.render(w, r, "inventories_hosts", p)
}

// adHocCommands is what the Run Command button needs: shown when the
// inventory's ad_hoc_commands OPTIONS offer POST (readAdHocOptions), with
// the module choices, and disabled while the list is empty.
func (u *UI) adHocCommands(r *http.Request, inv map[string]any, count any) map[string]any {
	res, err := u.apiCall(r, "OPTIONS", "/api/v2/inventories/"+str(inv["id"])+"/ad_hoc_commands/", nil)
	if err != nil || res.Status != 200 || dig(res.Data, "actions", "POST") == nil {
		return nil
	}
	var modules []string
	if choices, ok := dig(res.Data, "actions", "GET", "module_name", "choices").([]any); ok {
		for _, c := range choices {
			if pair, ok := c.([]any); ok && len(pair) > 0 {
				modules = append(modules, str(pair[0]))
			}
		}
	}
	mods, _ := json.Marshal(modules)
	return map[string]any{"inventory": str(inv["id"]), "modules": string(mods), "hasItems": num(count) > 0}
}

// withAdHoc adds the Run Command data for a list page already loaded by
// listPage, along with the scripts its wizard uses.
func (u *UI) withAdHoc(r *http.Request, p *page, inv map[string]any) {
	if ah := u.adHocCommands(r, inv, p.Data["count"]); ah != nil {
		p.Data["adHoc"] = ah
		p.Data["editor"] = true
	}
}

func (u *UI) inventoryGroups(w http.ResponseWriter, r *http.Request, uc *userContext) {
	inv, ok := u.loadInventory(w, r, uc)
	if !ok {
		return
	}
	p := u.inventoryPage(r, uc, inv, "groups", "Groups")
	if err := u.listPage(r, p, "group", "/api/v2/inventories/"+str(inv["id"])+"/groups/", url.Values{"order_by": {"name"}}, groupFilterLabels); err != nil {
		u.api.Log.ErrorContext(r.Context(), "inventory groups", "err", err)
	}
	p.Data["searchKeys"] = inventoryGroupSearchKeys
	p.Data["readonly"] = str(inv["kind"]) != ""
	u.withAdHoc(r, p, inv)
	u.render(w, r, "inventories_groups", p)
}

// --- inventory form ---------------------------------------------------------

// formText reads a textarea value, normalising the CRLF line endings that
// form submission produces to the LF the old UI stored.
func formText(f url.Values, key string) string {
	return strings.ReplaceAll(f.Get(key), "\r\n", "\n")
}

// refList turns a list of API objects (or summary refs) into id/name pairs.
func refList(v any) []map[string]any {
	out := []map[string]any{}
	items, _ := v.([]any)
	for _, it := range items {
		if m, ok := it.(map[string]any); ok {
			out = append(out, map[string]any{"id": str(m["id"]), "name": str(m["name"])})
		}
	}
	return out
}

func inventoryFormValues(data map[string]any) map[string]any {
	v := map[string]any{
		"name": str(data["name"]), "description": str(data["description"]), "variables": str(data["variables"]), "host_filter": str(data["host_filter"]),
		"source_vars": str(data["source_vars"]), "limit": str(data["limit"]), "update_cache_timeout": str(data["update_cache_timeout"]), "verbosity": str(data["verbosity"]),
		"prevent_instance_group_fallback": data["prevent_instance_group_fallback"] == true,
		"allow_deletes_while_in_use":      data["allow_deletes_while_in_use"] == true,
		"allow_jobs_while_syncing":        data["allow_jobs_while_syncing"] == true,
		"organization":                    refValue(data, "organization"),
		"instance_groups":                 refList(data["_instance_groups"]),
		"input_inventories":               refList(data["_input_inventories"]),
		"labels":                          refList(dig(data, "summary_fields", "labels", "results")),
	}
	if v["update_cache_timeout"] == "" {
		v["update_cache_timeout"] = "0"
	}
	if v["verbosity"] == "" {
		v["verbosity"] = "0"
	}
	return v
}

// inventoryFormDefaults fills what the old forms showed for an empty field
// when they opened: InventoryForm and SmartInventoryForm's "---" variables,
// ConstructedInventoryForm's starter source vars.
func inventoryFormDefaults(v map[string]any) map[string]any {
	if v["variables"] == "" {
		v["variables"] = "---"
	}
	if v["source_vars"] == "" {
		v["source_vars"] = "---\nplugin: constructed\nstrict: true"
	}
	return v
}

// multiRefs reads the id/name pairs a multi-lookup posted.
func multiRefs(f url.Values, key string) []map[string]any {
	ids, names := f[key], f[key+"_name"]
	out := []map[string]any{}
	for i, id := range ids {
		id = strings.TrimSpace(id)
		name := ""
		if i < len(names) {
			name = strings.TrimSpace(names[i])
		}
		if id == "" && name == "" {
			continue
		}
		out = append(out, map[string]any{"id": id, "name": name})
	}
	return out
}

// failedCall is the result to report for a failed in-process call: the
// API's answer, or, when the call could not be made, one the form shows as
// an unexpected error rather than none, which would read as success.
func failedCall(res *apiResult, err error) *apiResult {
	if err != nil || res == nil {
		return &apiResult{Status: http.StatusInternalServerError}
	}
	return res
}

func refIDs(refs []map[string]any) []int64 {
	out := []int64{}
	for _, r := range refs {
		if n, err := strconv.ParseInt(str(r["id"]), 10, 64); err == nil {
			out = append(out, n)
		}
	}
	return out
}

// inventoryFormFromPost builds the API payload and the values to re-render.
func inventoryFormFromPost(r *http.Request, kind string, editing bool) (map[string]any, map[string]any) {
	f := r.PostForm
	payload := map[string]any{"name": f.Get("name"), "description": f.Get("description")}
	if !editing {
		payload["kind"] = kind
	}
	if id := strings.TrimSpace(f.Get("organization")); id != "" {
		payload["organization"] = atoiDefault(id, 0)
	} else {
		payload["organization"] = nil
	}
	switch kind {
	case "smart":
		payload["host_filter"] = f.Get("host_filter")
		payload["variables"] = formText(f, "variables")
	case "constructed":
		payload["source_vars"] = formText(f, "source_vars")
		payload["limit"] = f.Get("limit")
		payload["update_cache_timeout"] = atoiDefault(f.Get("update_cache_timeout"), 0)
		payload["verbosity"] = atoiDefault(f.Get("verbosity"), 0)
		payload["allow_jobs_while_syncing"] = f.Get("allow_jobs_while_syncing") == "on"
	case "federated":
	default:
		payload["variables"] = formText(f, "variables")
		payload["prevent_instance_group_fallback"] = f.Get("prevent_instance_group_fallback") == "on"
		payload["allow_deletes_while_in_use"] = f.Get("allow_deletes_while_in_use") == "on"
		payload["allow_jobs_while_syncing"] = f.Get("allow_jobs_while_syncing") == "on"
	}
	values := inventoryFormValues(map[string]any{
		"name": f.Get("name"), "description": f.Get("description"), "variables": formText(f, "variables"), "host_filter": f.Get("host_filter"),
		"source_vars": formText(f, "source_vars"), "limit": f.Get("limit"), "update_cache_timeout": f.Get("update_cache_timeout"), "verbosity": f.Get("verbosity"),
		"prevent_instance_group_fallback": f.Get("prevent_instance_group_fallback") == "on", "allow_deletes_while_in_use": f.Get("allow_deletes_while_in_use") == "on", "allow_jobs_while_syncing": f.Get("allow_jobs_while_syncing") == "on",
	})
	values["organization"] = map[string]any{"id": f.Get("organization"), "name": f.Get("organization_name")}
	values["instance_groups"] = multiRefs(f, "instance_groups")
	values["input_inventories"] = multiRefs(f, "input_inventories")
	values["labels"] = multiRefs(f, "labels")
	return payload, values
}

// syncRelation attaches and detaches sub-objects so the relation holds
// exactly wanted. It returns the first API error, if any.
func (u *UI) syncRelation(r *http.Request, apiPath string, wanted []int64) *apiResult {
	current := map[int64]bool{}
	for _, it := range u.listResults(r, apiPath+"?page_size=200") {
		if m, ok := it.(map[string]any); ok {
			current[int64(num(m["id"]))] = true
		}
	}
	want := map[int64]bool{}
	for _, id := range wanted {
		want[id] = true
	}
	for id := range current {
		if !want[id] {
			if res, err := u.apiCall(r, "POST", apiPath, map[string]any{"id": id, "disassociate": true}); err != nil || res.Status >= 400 {
				return failedCall(res, err)
			}
		}
	}
	for _, id := range wanted {
		if !current[id] {
			if res, err := u.apiCall(r, "POST", apiPath, map[string]any{"id": id}); err != nil || res.Status >= 400 {
				return failedCall(res, err)
			}
		}
	}
	return nil
}

// saveInventoryRelations stores the multi-valued fields of the form.
func (u *UI) saveInventoryRelations(r *http.Request, id string, kind string, values map[string]any, orgID int64) *apiResult {
	base := "/api/v2/inventories/" + id + "/"
	if kind != "federated" {
		if res := u.orderInstanceGroups(r, base+"instance_groups/", values["instance_groups"].([]map[string]any)); res != nil {
			return res
		}
	}
	if kind == "constructed" || kind == "federated" {
		// Input inventories keep the order of their draggable list too.
		if res := u.orderInstanceGroups(r, base+"input_inventories/", values["input_inventories"].([]map[string]any)); res != nil {
			return res
		}
	}
	if kind == "" {
		if res := u.syncLabels(r, base+"labels/", values["labels"].([]map[string]any), orgID); res != nil {
			return res
		}
	}
	return nil
}

// syncLabels attaches existing labels by id, creates the ones typed by name
// (the API reuses a label of that name in the organization) and detaches the
// rest.
func (u *UI) syncLabels(r *http.Request, apiPath string, refs []map[string]any, orgID int64) *apiResult {
	current := map[int64]string{}
	for _, it := range u.listResults(r, apiPath+"?page_size=200") {
		if m, ok := it.(map[string]any); ok {
			current[int64(num(m["id"]))] = str(m["name"])
		}
	}
	wantIDs := map[int64]bool{}
	wantNames := map[string]bool{}
	for _, ref := range refs {
		if n, err := strconv.ParseInt(str(ref["id"]), 10, 64); err == nil {
			wantIDs[n] = true
		} else {
			wantNames[str(ref["name"])] = true
		}
	}
	for id, name := range current {
		if !wantIDs[id] && !wantNames[name] {
			if res, err := u.apiCall(r, "POST", apiPath, map[string]any{"id": id, "disassociate": true}); err != nil || res.Status >= 400 {
				return failedCall(res, err)
			}
		}
	}
	for id := range wantIDs {
		if _, ok := current[id]; !ok {
			if res, err := u.apiCall(r, "POST", apiPath, map[string]any{"id": id}); err != nil || res.Status >= 400 {
				return failedCall(res, err)
			}
		}
	}
	for name := range wantNames {
		exists := false
		for _, n := range current {
			if n == name {
				exists = true
			}
		}
		if !exists {
			if res, err := u.apiCall(r, "POST", apiPath, map[string]any{"name": name, "organization": orgID}); err != nil || res.Status >= 400 {
				return failedCall(res, err)
			}
		}
	}
	return nil
}

// saveInventoryRelationsLogged saves a saved inventory's relations. The
// inventory form went on to the details page even when these failed, so a
// failure is only logged.
func (u *UI) saveInventoryRelationsLogged(r *http.Request, id, kind string, values, saved map[string]any) {
	if rel := u.saveInventoryRelations(r, id, kind, values, int64(num(saved["organization"]))); rel != nil {
		u.api.Log.WarnContext(r.Context(), "inventory relations", "err", rel.Raw)
	}
}

func (u *UI) inventoryAdd(w http.ResponseWriter, r *http.Request, uc *userContext) {
	seg := strings.Split(strings.Trim(r.URL.Path, "/"), "/")[1]
	kind := kindFromSegment(seg)
	title := map[string]string{"": "Create new inventory", "smart": "Create new smart inventory", "constructed": "Create new constructed inventory", "federated": "Create new federated inventory"}[kind]
	p := u.newPage(r, uc, title)
	p.Nav = navigation(uc, "/inventories")
	p.Data["kind"] = kind
	p.Data["segment"] = seg
	p.Data["editor"] = true
	if r.Method == http.MethodPost {
		payload, values := inventoryFormFromPost(r, kind, false)
		coll := "inventories"
		if kind == "constructed" {
			coll = "constructed_inventories"
			delete(payload, "kind")
		}
		u.submitForm(w, r, p, "inventories_form", "POST", "/api/v2/"+coll+"/", payload, values, "/inventories/"+seg+"/{id}/details", func(saved map[string]any) *apiResult {
			u.saveInventoryRelationsLogged(r, str(saved["id"]), kind, values, saved)
			return nil
		})
		return
	}
	values := inventoryFormDefaults(inventoryFormValues(map[string]any{}))
	// OrganizationLookup autoPopulate, on every kind's form.
	values["organization"] = u.autoOrganization(r, "")
	if kind == "smart" {
		// The Hosts list's Smart Inventory button passes its search here;
		// host-filter.js turns it into the field's host filter.
		values["host_filter_param"] = r.URL.Query().Get("host_filter")
	}
	p.Data["values"] = values
	u.render(w, r, "inventories_form", p)
}

func (u *UI) inventoryEdit(w http.ResponseWriter, r *http.Request, uc *userContext) {
	inv, ok := u.loadInventory(w, r, uc)
	if !ok {
		return
	}
	kind := str(inv["kind"])
	p := u.inventoryPage(r, uc, inv, "details", "Edit details")
	p.Data["kind"] = kind
	p.Data["segment"] = str(inv["_segment"])
	p.Data["editor"] = true
	if r.Method == http.MethodPost {
		payload, values := inventoryFormFromPost(r, kind, true)
		coll := "inventories"
		if kind == "constructed" {
			coll = "constructed_inventories"
		}
		u.submitForm(w, r, p, "inventories_form", "PATCH", "/api/v2/"+coll+"/"+str(inv["id"])+"/", payload, values, str(inv["_base"])+"/details", func(saved map[string]any) *apiResult {
			u.saveInventoryRelationsLogged(r, str(inv["id"]), kind, values, saved)
			return nil
		})
		return
	}
	// A form that could not load every member is not shown: saving it
	// would drop the members it lacked.
	if status, ok := u.inventoryRelations(r, inv); !ok {
		p.Data["loadError"] = status
		u.render(w, r, "inventories_form", p)
		return
	}
	p.Data["values"] = inventoryFormDefaults(inventoryFormValues(inv))
	u.render(w, r, "inventories_form", p)
}

// --- hosts inside an inventory ---------------------------------------------

func hostFormValues(data map[string]any) map[string]any {
	return map[string]any{"name": str(data["name"]), "description": str(data["description"]), "variables": str(data["variables"]), "enabled": data["enabled"] != false}
}

func hostFormFromPost(r *http.Request) (map[string]any, map[string]any) {
	f := r.PostForm
	payload := map[string]any{"name": f.Get("name"), "description": f.Get("description"), "variables": formText(f, "variables")}
	return payload, hostFormValues(map[string]any{"name": f.Get("name"), "description": f.Get("description"), "variables": formText(f, "variables"), "enabled": true})
}

func (u *UI) inventoryHostAdd(w http.ResponseWriter, r *http.Request, uc *userContext) {
	inv, ok := u.loadInventory(w, r, uc)
	if !ok {
		return
	}
	p := u.inventoryPage(r, uc, inv, "hosts", "Create new host")
	p.Data["editor"] = true
	group := r.URL.Query().Get("group")
	p.Data["group"] = group
	if r.Method == http.MethodPost {
		payload, values := hostFormFromPost(r)
		target := "/api/v2/inventories/" + str(inv["id"]) + "/hosts/"
		if group != "" {
			target = "/api/v2/groups/" + group + "/hosts/"
			payload["inventory"] = atoiDefault(str(inv["id"]), 0)
		}
		u.submitForm(w, r, p, "hosts_form", "POST", target, payload, values, str(inv["_base"])+"/hosts/{id}/details")
		return
	}
	p.Data["values"] = hostFormValues(map[string]any{"variables": "---\n", "enabled": true})
	u.render(w, r, "hosts_form", p)
}

func (u *UI) loadHostIn(w http.ResponseWriter, r *http.Request, uc *userContext, inv map[string]any) (map[string]any, bool) {
	res, err := u.apiCall(r, "GET", "/api/v2/hosts/"+r.PathValue("hid")+"/", nil)
	if err != nil || res.Status != 200 || (inv != nil && str(res.Data["inventory"]) != str(inv["id"])) {
		u.notFound(w, r, uc)
		return nil, false
	}
	return res.Data, true
}

var hostTabTitles = map[string]string{"details": "Details", "facts": "Facts", "groups": "Groups", "jobs": "Jobs"}

// advHostTitles are the screen titles of a host page under a smart,
// constructed or federated inventory (Inventories' breadcrumb config).
var advHostTitles = map[string]string{"details": "Host details", "facts": "Facts", "groups": "Groups", "jobs": "Jobs", "edit": "Edit details"}

// advInventoryHost is AdvancedInventoryHost: the host read through the
// inventory's own host list (so only hosts the inventory holds), a Details
// tab, and any other tab a not-found with the way back to it.
func (u *UI) advInventoryHost(w http.ResponseWriter, r *http.Request, uc *userContext, inv map[string]any) {
	tab := lastPathSegment(r)
	p := u.inventoryPage(r, uc, inv, "hosts", advHostTitles[tab])
	p.Data["hostTab"] = tab
	p.Data["hostBase"] = str(inv["_base"]) + "/hosts/" + r.PathValue("hid")
	p.Data["segment"] = strings.Split(strings.Trim(r.URL.Path, "/"), "/")[1]
	p.Data["editor"] = true
	res, err := u.apiCall(r, "GET", "/api/v2/inventories/"+str(inv["id"])+"/hosts/?id="+url.QueryEscape(r.PathValue("hid")), nil)
	if err == nil && res.Status == 200 {
		if results, ok := res.Data["results"].([]any); ok && len(results) > 0 {
			p.Data["host"] = results[0]
		}
	}
	u.render(w, r, "inventories_adv_host", p)
}

func (u *UI) inventoryHostDetail(w http.ResponseWriter, r *http.Request, uc *userContext) {
	inv, ok := u.loadInventory(w, r, uc)
	if !ok {
		return
	}
	if str(inv["kind"]) != "" {
		u.advInventoryHost(w, r, uc, inv)
		return
	}
	host, ok := u.loadHostIn(w, r, uc, inv)
	if !ok {
		return
	}
	tab := lastPathSegment(r)
	// Under an inventory the details screen is "Host details".
	p := u.inventoryPage(r, uc, inv, "hosts", advHostTitles[tab])
	p.Data["host"] = host
	p.Data["hostTab"] = tab
	p.Data["hostBase"] = str(inv["_base"]) + "/hosts/" + str(host["id"])
	p.Data["editor"] = true
	u.hostTabData(r, p, host, tab)
	if tab == "groups" {
		u.withAdHoc(r, p, inv)
	}
	u.render(w, r, "hosts_detail", p)
}

func (u *UI) inventoryHostEdit(w http.ResponseWriter, r *http.Request, uc *userContext) {
	inv, ok := u.loadInventory(w, r, uc)
	if !ok {
		return
	}
	if str(inv["kind"]) != "" {
		u.advInventoryHost(w, r, uc, inv)
		return
	}
	host, ok := u.loadHostIn(w, r, uc, inv)
	if !ok {
		return
	}
	p := u.inventoryPage(r, uc, inv, "hosts", "Edit details")
	p.Data["host"] = host
	p.Data["hostBase"] = str(inv["_base"]) + "/hosts/" + str(host["id"])
	p.Data["editor"] = true
	if r.Method == http.MethodPost {
		payload, values := hostFormFromPost(r)
		u.submitForm(w, r, p, "hosts_form", "PATCH", "/api/v2/hosts/"+str(host["id"])+"/", payload, values, str(inv["_base"])+"/hosts/"+str(host["id"])+"/details")
		return
	}
	p.Data["values"] = hostFormValues(host)
	u.render(w, r, "hosts_form", p)
}

// --- groups inside an inventory --------------------------------------------

func groupFormValues(data map[string]any) map[string]any {
	return map[string]any{"name": str(data["name"]), "description": str(data["description"]), "variables": str(data["variables"])}
}

func groupFormFromPost(r *http.Request) (map[string]any, map[string]any) {
	f := r.PostForm
	payload := map[string]any{"name": f.Get("name"), "description": f.Get("description"), "variables": formText(f, "variables")}
	return payload, groupFormValues(payload)
}

func (u *UI) inventoryGroupAdd(w http.ResponseWriter, r *http.Request, uc *userContext) {
	inv, ok := u.loadInventory(w, r, uc)
	if !ok {
		return
	}
	p := u.inventoryPage(r, uc, inv, "groups", "Create new group")
	p.Data["editor"] = true
	parent := r.URL.Query().Get("parent")
	p.Data["parent"] = parent
	if r.Method == http.MethodPost {
		payload, values := groupFormFromPost(r)
		target := "/api/v2/inventories/" + str(inv["id"]) + "/groups/"
		if parent != "" {
			target = "/api/v2/groups/" + parent + "/children/"
			payload["inventory"] = atoiDefault(str(inv["id"]), 0)
		}
		u.submitForm(w, r, p, "groups_form", "POST", target, payload, values, str(inv["_base"])+"/groups/{id}/details")
		return
	}
	p.Data["values"] = groupFormValues(map[string]any{"variables": "---"})
	u.render(w, r, "groups_form", p)
}

// loadGroupIn reads the group through the inventory, as InventoryGroup did:
// the inventory's groups are what it presents (a federated inventory's are
// its input inventories'). A group it does not present is an in-page Not
// Found with the way back to the inventory's groups.
func (u *UI) loadGroupIn(w http.ResponseWriter, r *http.Request, uc *userContext, inv map[string]any) (map[string]any, bool) {
	list, ok := u.loadObject(w, r, uc, "/api/v2/inventories/"+str(inv["id"])+"/groups/?id="+url.QueryEscape(r.PathValue("gid")))
	if !ok {
		return nil, false
	}
	if results, ok := list["results"].([]any); ok && len(results) > 0 {
		if g, ok := results[0].(map[string]any); ok {
			return g, true
		}
	}
	p := u.inventoryPage(r, uc, inv, "groups", "")
	p.Data["groupMissing"] = true
	u.render(w, r, "groups_detail", p)
	return nil, false
}

// readOnlyInventory is isReadOnlyInventoryType: groups and hosts under a
// constructed or federated inventory are not edited there.
func readOnlyInventory(inv map[string]any) bool {
	k := str(inv["kind"])
	return k == "constructed" || k == "federated"
}

func (u *UI) inventoryGroupDetail(w http.ResponseWriter, r *http.Request, uc *userContext) {
	inv, ok := u.loadInventory(w, r, uc)
	if !ok {
		return
	}
	g, ok := u.loadGroupIn(w, r, uc, inv)
	if !ok {
		return
	}
	tab := lastPathSegment(r)
	titles := map[string]string{"details": "Group details", "nested_hosts": "Hosts", "nested_groups": "Related Groups"}
	p := u.inventoryPage(r, uc, inv, "groups", titles[tab])
	p.Data["group"] = g
	p.Data["groupTab"] = tab
	p.Data["groupBase"] = str(inv["_base"]) + "/groups/" + str(g["id"])
	p.Data["readonly"] = str(inv["kind"]) != ""
	switch tab {
	case "details":
		p.Data["editor"] = true
	case "nested_hosts":
		if err := u.listPage(r, p, "host", "/api/v2/groups/"+str(g["id"])+"/all_hosts/", url.Values{"order_by": {"name"}}, hostFilterLabels); err != nil {
			u.api.Log.ErrorContext(r.Context(), "group hosts", "err", err)
		}
		p.Data["searchKeys"] = hostSearchKeys
	case "nested_groups":
		if err := u.listPage(r, p, "group", "/api/v2/groups/"+str(g["id"])+"/children/", url.Values{"order_by": {"name"}}, groupFilterLabels); err != nil {
			u.api.Log.ErrorContext(r.Context(), "group children", "err", err)
		}
		p.Data["searchKeys"] = groupSearchKeys
	}
	if tab != "details" {
		u.withAdHoc(r, p, inv)
	}
	u.render(w, r, "groups_detail", p)
}

func (u *UI) inventoryGroupEdit(w http.ResponseWriter, r *http.Request, uc *userContext) {
	inv, ok := u.loadInventory(w, r, uc)
	if !ok {
		return
	}
	g, ok := u.loadGroupIn(w, r, uc, inv)
	if !ok {
		return
	}
	if readOnlyInventory(inv) {
		http.Redirect(w, r, str(inv["_base"])+"/groups/"+str(g["id"])+"/details", http.StatusFound)
		return
	}
	p := u.inventoryPage(r, uc, inv, "groups", "Edit details")
	p.Data["group"] = g
	p.Data["groupBase"] = str(inv["_base"]) + "/groups/" + str(g["id"])
	p.Data["editor"] = true
	if r.Method == http.MethodPost {
		payload, values := groupFormFromPost(r)
		u.submitForm(w, r, p, "groups_form", "PATCH", "/api/v2/groups/"+str(g["id"])+"/", payload, values, str(inv["_base"])+"/groups/"+str(g["id"])+"/details")
		return
	}
	p.Data["values"] = groupFormValues(g)
	u.render(w, r, "groups_form", p)
}
