package web

import (
	"html/template"
	"net/http"
	"net/url"
	"sort"
	"strings"

	"github.com/ctrliq/ascender/internal/i18n"
)

var hostSearchKeys = []map[string]string{
	{"name": "Name", "key": "name__icontains"},
	{"name": "Description", "key": "description__icontains"},
	{"name": "Created By (Username)", "key": "created_by__username__icontains"},
	{"name": "Modified By (Username)", "key": "modified_by__username__icontains"},
}

var hostFilterLabels = searchLabels(hostSearchKeys, "last_job_host_summary__failed", "Last job host summary failed")

// advHostSearchKeys are AdvancedInventoryHostList's search columns.
var advHostSearchKeys = []map[string]string{
	{"name": "Name", "key": "name__icontains"},
	{"name": "Created by (username)", "key": "created_by__username"},
	{"name": "Modified by (username)", "key": "modified_by__username"},
}

var advHostFilterLabels = searchLabels(advHostSearchKeys)

// groupSearchKeys are the host groups' and nested groups' search keys;
// inventoryGroupSearchKeys add InventoryGroupsList's Group type.
var groupSearchKeys = []map[string]string{
	{"name": "Name", "key": "name__icontains"},
	{"name": "Created By (Username)", "key": "created_by__username__icontains"},
	{"name": "Modified By (Username)", "key": "modified_by__username__icontains"},
}

var inventoryGroupSearchKeys = []map[string]string{
	{"name": "Name", "key": "name__icontains"},
	{"name": "Group type", "key": "parents__isnull", "options": "root_groups"},
	{"name": "Created By (Username)", "key": "created_by__username__icontains"},
	{"name": "Modified By (Username)", "key": "modified_by__username__icontains"},
}

var groupFilterLabels = searchLabels(inventoryGroupSearchKeys)

func (u *UI) registerHosts(mux *http.ServeMux) {
	mux.HandleFunc("/hosts", u.protected(u.hostList))
	mux.HandleFunc("/hosts/{$}", u.protected(u.hostList))
	mux.HandleFunc("/hosts/add", u.protected(u.hostAdd))
	mux.HandleFunc("/hosts/{hid}", u.protected(toDetails))
	for _, tab := range []string{"details", "facts", "groups", "jobs"} {
		mux.HandleFunc("/hosts/{hid}/"+tab, u.protected(u.hostDetail))
	}
	mux.HandleFunc("/hosts/{hid}/edit", u.protected(u.hostEdit))
}

func (u *UI) hostList(w http.ResponseWriter, r *http.Request, uc *userContext) {
	p := u.newPage(r, uc, "Hosts")
	// HostList left out the hosts of smart, constructed and federated
	// inventories (theirs are listed under those inventories).
	if err := u.listPage(r, p, "host", "/api/v2/hosts/", url.Values{"order_by": {"name"}, "not__inventory__kind__in": {"smart,constructed,federated"}}, hostFilterLabels); err != nil {
		u.api.Log.ErrorContext(r.Context(), "host list", "err", err)
	}
	p.Data["searchKeys"] = hostSearchKeys
	p.Data["smartInventoryButton"] = smartInventoryButton(p.Loc, r.URL.Query())
	u.render(w, r, "hosts_list", p)
}

// smartInventoryButton is HostList's SmartInventoryButton. It is enabled
// once a search filter is applied, unless the filter uses a not__ or
// __search modifier or an ansible_facts value (a smart inventory's host
// filter cannot hold those), and opens the smart inventory form with the
// filter, encoded as encodeQueryString did, in its host_filter parameter.
func smartInventoryButton(loc *i18n.Locale, q url.Values) template.HTML {
	params := map[string][]string{}
	for k, vals := range q {
		key := k
		if i := strings.Index(k, "."); i > 0 {
			if k[:i] != "host" {
				continue
			}
			key = k[i+1:]
		}
		if !pagingKeys[key] {
			params[key] = append(params[key], vals...)
		}
	}
	keys := make([]string, 0, len(params))
	invalid, facts := false, false
	for k, vals := range params {
		keys = append(keys, k)
		if strings.HasPrefix(k, "not__") || strings.HasSuffix(k, "__search") {
			invalid = true
		}
		for _, v := range vals {
			if strings.Contains(v, "ansible_facts") {
				facts = true
			}
		}
	}
	sort.Strings(keys)
	var tooltip, action string
	switch {
	case invalid:
		tooltip = loc.T("Some search modifiers like not__ and __search are not supported in Smart Inventory host filters.  Remove these to create a new Smart Inventory with this filter.")
	case facts:
		tooltip = loc.T("To create a smart inventory using ansible facts, go to the smart inventory screen.")
	case len(keys) == 0:
		tooltip = loc.T("Enter at least one search filter to create a new Smart Inventory")
	default:
		tooltip = loc.T("Create a new Smart Inventory with the applied filter")
		var pairs []string
		for _, k := range keys {
			for _, v := range params[k] {
				pairs = append(pairs, encodeURIComponent(k)+"="+encodeURIComponent(v))
			}
		}
		action = ` data-href="` + template.HTMLEscapeString("/inventories/smart_inventory/add?host_filter="+encodeURIComponent(strings.Join(pairs, "&"))) + `"`
	}
	if action == "" {
		action = " disabled"
	}
	return template.HTML(`<div class="pf-v6-c-toolbar__item"><div style="display: contents;" data-tooltip="` + template.HTMLEscapeString(tooltip) + `" data-tooltip-pos="top"><div><button aria-label="` + template.HTMLEscapeString(loc.T("Smart Inventory")) + `" class="pf-v6-c-button pf-m-secondary"` + action + ` type="button"><span class="pf-v6-c-button__text">` + template.HTMLEscapeString(loc.T("Smart Inventory")) + `</span></button></div></div></div>`)
}

// encodeURIComponent escapes s as JavaScript's encodeURIComponent would for
// decodeURIComponent to read back: spaces as %20, not +.
func encodeURIComponent(s string) string {
	return strings.ReplaceAll(url.QueryEscape(s), "+", "%20")
}

// hostTabData loads what the facts and groups tabs show.
func (u *UI) hostTabData(r *http.Request, p *page, host map[string]any, tab string) {
	switch tab {
	case "jobs":
		u.relatedJobsTab(r, p, url.Values{"job__hosts": {str(host["id"])}})
	case "facts":
		p.Data["facts"] = "{}"
		if res, err := u.apiCall(r, "GET", "/api/v2/hosts/"+str(host["id"])+"/ansible_facts/", nil); err == nil && res.Status == 200 {
			if b, err := jsonIndent(res.Data); err == nil {
				p.Data["facts"] = b
			}
		}
	case "groups":
		if err := u.listPage(r, p, "group", "/api/v2/hosts/"+str(host["id"])+"/groups/", url.Values{"order_by": {"name"}}, groupFilterLabels); err != nil {
			u.api.Log.ErrorContext(r.Context(), "host groups", "err", err)
		}
		p.Data["searchKeys"] = groupSearchKeys
	}
}

func (u *UI) hostDetail(w http.ResponseWriter, r *http.Request, uc *userContext) {
	host, ok := u.loadHostIn(w, r, uc, nil)
	if !ok {
		return
	}
	tab := lastPathSegment(r)
	p := u.newPage(r, uc, hostTabTitles[tab])
	p.Nav = navigation(uc, "/hosts")
	p.Data["host"] = host
	p.Data["hostTab"] = tab
	p.Data["hostBase"] = "/hosts/" + str(host["id"])
	p.Data["editor"] = true
	u.hostTabData(r, p, host, tab)
	u.render(w, r, "hosts_detail", p)
}

func (u *UI) hostAdd(w http.ResponseWriter, r *http.Request, uc *userContext) {
	p := u.newPage(r, uc, "Create New Host")
	p.Nav = navigation(uc, "/hosts")
	p.Data["standalone"] = true
	p.Data["editor"] = true
	if r.Method == http.MethodPost {
		payload, values := hostFormFromPost(r)
		if id := r.PostForm.Get("inventory"); id != "" {
			payload["inventory"] = atoiDefault(id, 0)
		}
		values["inventory"] = map[string]any{"id": r.PostForm.Get("inventory"), "name": r.PostForm.Get("inventory_name")}
		u.submitForm(w, r, p, "hosts_form", "POST", "/api/v2/hosts/", payload, values, "/hosts/{id}/details")
		return
	}
	v := hostFormValues(map[string]any{"variables": "---\n", "enabled": true})
	// InventoryLookup autoPopulate with hideAdvancedInventories.
	v["inventory"], _ = u.autoLookup(r, "/api/v2/inventories/", "role_level=use_role&order_by=name&not__kind=smart&not__kind=constructed&not__kind=federated")
	p.Data["values"] = v
	u.render(w, r, "hosts_form", p)
}

func (u *UI) hostEdit(w http.ResponseWriter, r *http.Request, uc *userContext) {
	host, ok := u.loadHostIn(w, r, uc, nil)
	if !ok {
		return
	}
	p := u.newPage(r, uc, "Edit Details")
	p.Nav = navigation(uc, "/hosts")
	p.Data["host"] = host
	p.Data["hostBase"] = "/hosts/" + str(host["id"])
	p.Data["standalone"] = true
	p.Data["editor"] = true
	if r.Method == http.MethodPost {
		payload, values := hostFormFromPost(r)
		u.submitForm(w, r, p, "hosts_form", "PATCH", "/api/v2/hosts/"+str(host["id"])+"/", payload, values, "/hosts/"+str(host["id"])+"/details")
		return
	}
	v := hostFormValues(host)
	v["inventory"] = refValue(host, "inventory")
	p.Data["values"] = v
	u.render(w, r, "hosts_form", p)
}
