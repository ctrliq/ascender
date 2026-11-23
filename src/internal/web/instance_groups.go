package web

import (
	"encoding/json"
	"html/template"
	"net/http"
	"net/url"
	"reflect"
	"strconv"
	"strings"
	"time"

	"gopkg.in/yaml.v3"

	"github.com/ctrliq/ascender/internal/api"
	"github.com/ctrliq/ascender/internal/models"
)

// Instance groups and instances: InstanceGroupList, the instance and
// container group forms, details, Instances and Jobs tabs, and the
// Instances screens.

func (u *UI) registerInstanceGroups(mux *http.ServeMux) {
	mux.HandleFunc("/instance_groups", u.protected(u.igList))
	mux.HandleFunc("/instance_groups/{$}", u.protected(u.igList))
	mux.HandleFunc("/instance_groups/add", u.protected(u.igAdd))
	mux.HandleFunc("/instance_groups/container_group/add", u.protected(u.igAdd))
	// The routes below share their shape with the container group ones,
	// so they are dispatched here rather than by the mux.
	mux.HandleFunc("/instance_groups/", u.protected(u.igRoute))
	mux.HandleFunc("/instances", u.protected(u.instanceList))
	mux.HandleFunc("/instances/{$}", u.protected(u.instanceList))
	mux.HandleFunc("/instances/{id}", u.protected(toDetails))
	mux.HandleFunc("/instances/{id}/details", u.protected(func(w http.ResponseWriter, r *http.Request, uc *userContext) {
		u.instanceDetail(w, r, uc, r.PathValue("id"), nil)
	}))
	u.registerK8sInstances(mux)
}

func (u *UI) igRoute(w http.ResponseWriter, r *http.Request, uc *userContext) {
	parts := strings.Split(strings.Trim(strings.TrimPrefix(r.URL.Path, "/instance_groups/"), "/"), "/")
	container := false
	if parts[0] == "container_group" {
		container = true
		parts = parts[1:]
	}
	if len(parts) == 0 || parts[0] == "" {
		u.notFound(w, r, uc)
		return
	}
	if _, err := strconv.Atoi(parts[0]); err != nil {
		u.notFound(w, r, uc)
		return
	}
	base := igBase(container) + parts[0]
	switch {
	case len(parts) == 1:
		http.Redirect(w, r, base+"/details", http.StatusFound)
	case len(parts) == 2 && parts[1] == "edit":
		u.igEdit(w, r, uc, parts[0], container)
	case len(parts) == 2 && (parts[1] == "details" || parts[1] == "jobs" || (parts[1] == "instances" && !container)):
		u.igTab(w, r, uc, parts[0], parts[1], container)
	case !container && len(parts) == 3 && parts[1] == "instances":
		http.Redirect(w, r, base+"/instances/"+parts[2]+"/details", http.StatusFound)
	case !container && len(parts) == 4 && parts[1] == "instances" && parts[3] == "details":
		g, ok := u.loadObject(w, r, uc, "/api/v2/instance_groups/"+parts[0]+"/")
		if !ok {
			return
		}
		u.instanceDetail(w, r, uc, parts[2], g)
	default:
		u.notFound(w, r, uc)
	}
}

var igSearchKeys = []map[string]string{{"name": "Name", "key": "name__icontains"}}

func (u *UI) igList(w http.ResponseWriter, r *http.Request, uc *userContext) {
	p := u.newPage(r, uc, "Instance Groups")
	p.Nav = navigation(uc, "/instance_groups")
	if err := u.listPage(r, p, "instance-group", "/api/v2/instance_groups/", url.Values{}, searchLabels(igSearchKeys)); err != nil {
		u.api.Log.ErrorContext(r.Context(), "instance group list", "err", err)
	}
	// HeaderRow showed the name column as the sorted one when the query
	// named no order.
	if p.Data["order_by"] == "" {
		p.Data["order_by"] = "name"
	}
	p.Data["searchKeys"] = igSearchKeys
	if u.optionsAllow(r, "/api/v2/instance_groups/", "POST") {
		p.Data["addMenu"] = []map[string]any{
			{"label": p.Loc.T("Add container group"), "href": "/instance_groups/container_group/add"},
			{"label": p.Loc.T("Add instance group"), "href": "/instance_groups/add"},
		}
	}
	u.render(w, r, "instance_groups_list", p)
}

var igInstanceSearchKeys = []map[string]string{{"name": "Name", "key": "hostname__icontains"}, {"name": "Node Type", "key": "or__node_type", "options": "ig_node_type"}}

var instanceFilterLabels = searchLabels(instanceSearchKeys)

func (u *UI) igTab(w http.ResponseWriter, r *http.Request, uc *userContext, id, tab string, container bool) {
	g, ok := u.loadObject(w, r, uc, "/api/v2/instance_groups/"+id+"/")
	if !ok {
		return
	}
	titles := map[string]string{"details": "Details", "instances": "Instances", "jobs": "Jobs"}
	p := u.newPage(r, uc, titles[tab])
	p.Nav = navigation(uc, "/instance_groups")
	base := "/instance_groups/" + id
	if container {
		base = "/instance_groups/container_group/" + id
	}
	p.Data["ig"] = g
	p.Data["tab"] = tab
	p.Data["container"] = container
	p.Data["base"] = base
	tabs := []map[string]string{{"key": "details", "href": base + "/details", "label": "Details"}}
	if !container {
		tabs = append(tabs, map[string]string{"key": "instances", "href": base + "/instances", "label": "Instances"})
	}
	p.Data["tabs"] = append(tabs, map[string]string{"key": "jobs", "href": base + "/jobs", "label": "Jobs"})
	switch tab {
	case "details":
		if container {
			p.Data["editor"] = true
		}
	case "instances":
		if err := u.listPage(r, p, "instance", "/api/v2/instance_groups/"+id+"/instances/", url.Values{"order_by": {"hostname"}}, instanceFilterLabels); err != nil {
			u.api.Log.ErrorContext(r.Context(), "instance group instances", "err", err)
		}
		p.Data["searchKeys"] = igInstanceSearchKeys
		p.Data["canAssociate"] = u.optionsAllow(r, "/api/v2/instance_groups/"+id+"/instances/", "POST")
		if p.Data["canAssociate"] == true {
			// ToolbarAddButton labelled Associate, opening AssociateModal on the
			// instances outside the group that are neither hop nor control nodes.
			p.Data["associateButton"] = template.HTML(`<div class="pf-v6-c-toolbar__item"><div style="display: contents;"><button class="pf-v6-c-button pf-m-primary" type="button" data-associate data-resource="instances" data-filter="not__rampart_groups__id=` + template.HTMLEscapeString(id) + `&amp;not__node_type=hop&amp;not__node_type=control" data-display-key="hostname" data-columns="` + template.HTMLEscapeString(p.Loc.T("Name")+":hostname,"+p.Loc.T("Node Type")+":node_type") + `" data-title="` + template.HTMLEscapeString(p.Loc.T("Select Instances")) + `" data-api="/api/v2/instance_groups/` + template.HTMLEscapeString(id) + `/instances/"><span class="pf-v6-c-button__text">` + template.HTMLEscapeString(p.Loc.T("Associate")) + `</span></button></div></div>`)
		}
		p.Data["pending"] = anyPending(p.Data["results"])
		p.Data["superuser"] = uc.User.IsSuperuser
		p.Data["forks"] = instanceForks(p.Data["results"])
	case "jobs":
		// JobList with defaultParams instance_group.
		if err := u.listPage(r, p, "job", "/api/v2/unified_jobs/", url.Values{"order_by": {"-finished"}, "not__launch_type": {"sync"}, "instance_group": {id}}, jobFilterLabels); err != nil {
			u.api.Log.ErrorContext(r.Context(), "instance group jobs", "err", err)
		}
		p.Data["searchKeys"] = jobSearchKeys
		p.Data["editor"] = true
	}
	u.render(w, r, "instance_groups_detail", p)
}

// anyPending reports a health check in progress on any listed instance.
func anyPending(results any) bool {
	list, _ := results.([]any)
	for _, it := range list {
		if m, ok := it.(map[string]any); ok && m["health_check_pending"] == true {
			return true
		}
	}
	return false
}

// computeForks is util/computeForks.
func computeForks(mem, cpu int, adjustment float64) int {
	lo, hi := mem, cpu
	if lo > hi {
		lo, hi = hi, lo
	}
	return int(float64(lo) + float64(hi-lo)*adjustment)
}

func instanceForkCount(i map[string]any) int {
	adj, _ := strconv.ParseFloat(str(i["capacity_adjustment"]), 64)
	return computeForks(num(i["mem_capacity"]), num(i["cpu_capacity"]), adj)
}

// instanceRemovable reports whether a superuser may remove the instance
// (deprovision it, for the task process to delete): on Kubernetes the hop
// and execution nodes added there (RemoveInstanceButton), and on any
// platform an instance of any type that the heartbeat lost.
func instanceRemovable(i map[string]any, k8s bool, now time.Time) bool {
	t := str(i["node_type"])
	if k8s && i["managed"] != true && (t == "hop" || t == "execution") {
		return true
	}
	var seen *time.Time
	if ts, err := time.Parse(time.RFC3339Nano, str(i["last_seen"])); err == nil {
		seen = &ts
	}
	return models.LostAndUnavailable(str(i["node_state"]), seen, t, now)
}

// removableInstances maps the ids of the listed instances a superuser may
// remove to true; nothing for anyone else.
func removableInstances(results any, superuser, k8s bool) map[string]bool {
	out := map[string]bool{}
	if !superuser {
		return out
	}
	list, _ := results.([]any)
	now := time.Now()
	for _, it := range list {
		if m, ok := it.(map[string]any); ok && instanceRemovable(m, k8s, now) {
			out[str(m["id"])] = true
		}
	}
	return out
}

// instanceForks maps instance ids to their fork counts.
func instanceForks(results any) map[string]int {
	out := map[string]int{}
	list, _ := results.([]any)
	for _, it := range list {
		if m, ok := it.(map[string]any); ok {
			out[str(m["id"])] = instanceForkCount(m)
		}
	}
	return out
}

// --- forms ------------------------------------------------------------------

func igFormPost(r *http.Request, container bool) (map[string]any, map[string]any) {
	f := r.PostForm
	n := func(k string) any {
		v := strings.TrimSpace(f.Get(k))
		if v == "" {
			return 0
		}
		if i, err := strconv.Atoi(v); err == nil {
			return i
		}
		return v
	}
	values := map[string]any{"name": f.Get("name"), "policy_instance_minimum": f.Get("policy_instance_minimum"), "policy_instance_percentage": f.Get("policy_instance_percentage"),
		"max_concurrent_jobs": f.Get("max_concurrent_jobs"), "max_forks": f.Get("max_forks")}
	payload := map[string]any{"name": f.Get("name"), "max_concurrent_jobs": n("max_concurrent_jobs"), "max_forks": n("max_forks")}
	if !container {
		payload["policy_instance_minimum"] = n("policy_instance_minimum")
		payload["policy_instance_percentage"] = n("policy_instance_percentage")
		return payload, values
	}
	override := f.Get("override") != ""
	values["override"] = override
	// Browsers post textarea newlines as CRLF; the editor held LF.
	values["pod_spec_override"] = strings.ReplaceAll(f.Get("pod_spec_override"), "\r\n", "\n")
	values["credential"] = map[string]any{"id": f.Get("credential"), "name": f.Get("credential_name")}
	values["mesh_node"] = map[string]any{"id": f.Get("mesh_node"), "name": f.Get("mesh_node_name")}
	payload["is_container_group"] = true
	if m := f.Get("mesh_node"); m != "" {
		payload["mesh_node"] = atoiDefault(m, 0)
		payload["credential"] = nil
	} else {
		payload["mesh_node"] = nil
		if c := f.Get("credential"); c != "" {
			payload["credential"] = atoiDefault(c, 0)
		} else {
			payload["credential"] = nil
		}
	}
	payload["pod_spec_override"] = nil
	if override {
		payload["pod_spec_override"] = values["pod_spec_override"]
	}
	return payload, values
}

// defaultPodSpec is the pod_spec_override default the OPTIONS document
// carried, as JSON text in its key order; the editor turns it into YAML
// with js-yaml as jsonToYaml did.
func (u *UI) defaultPodSpec(r *http.Request) string {
	res, err := u.apiCall(r, "OPTIONS", "/api/v2/instance_groups/", nil)
	if err != nil || res.Status != 200 {
		return "{}"
	}
	doc, err := api.DecodeOrdered(string(res.Raw))
	if err != nil {
		return "{}"
	}
	var cur any = doc
	for _, k := range []string{"actions", "POST", "pod_spec_override", "default"} {
		m, ok := cur.(*api.OMap)
		if !ok {
			return "{}"
		}
		cur, _ = m.Get(k)
	}
	if cur == nil {
		return "{}"
	}
	b, err := json.Marshal(cur)
	if err != nil {
		return "{}"
	}
	return string(b)
}

// samePodSpec reports whether the edited spec (YAML or JSON) is the
// default, which getPodSpecValue left unsent.
func samePodSpec(edited, def string) bool {
	var a, b any
	if yaml.Unmarshal([]byte(edited), &a) != nil || json.Unmarshal([]byte(def), &b) != nil {
		return false
	}
	norm := func(v any) string { out, _ := json.Marshal(v); return string(out) }
	var a2, b2 any
	_ = json.Unmarshal([]byte(norm(a)), &a2)
	_ = json.Unmarshal([]byte(norm(b)), &b2)
	return reflect.DeepEqual(a2, b2)
}

func (u *UI) igFormPage(r *http.Request, uc *userContext, title string, container bool) *page {
	p := u.newPage(r, uc, title)
	p.Nav = navigation(uc, "/instance_groups")
	p.Data["container"] = container
	p.Data["editor"] = container
	return p
}

func (u *UI) igAdd(w http.ResponseWriter, r *http.Request, uc *userContext) {
	container := strings.HasPrefix(r.URL.Path, "/instance_groups/container_group/")
	title := "Create new instance group"
	if container {
		title = "Create new container group"
	}
	p := u.igFormPage(r, uc, title, container)
	if r.Method == http.MethodPost {
		payload, values := igFormPost(r, container)
		if container && values["override"] == true && samePodSpec(str(values["pod_spec_override"]), u.defaultPodSpec(r)) {
			// getPodSpecValue: the unchanged default is not sent.
			payload["pod_spec_override"] = nil
		}
		u.submitForm(w, r, p, "instance_groups_form", "POST", "/api/v2/instance_groups/", payload, values, igBase(container)+"{id}/details")
		return
	}
	values := map[string]any{"name": "", "policy_instance_minimum": 0, "policy_instance_percentage": 0, "max_concurrent_jobs": 0, "max_forks": 0}
	if container {
		values["override"] = false
		values["pod_spec_override"] = u.defaultPodSpec(r)
		p.Data["podSpecSource"] = "json"
		values["mesh_node"] = map[string]any{"id": "", "name": ""}
		// CredentialLookup autoPopulate: the only Kubernetes credential.
		values["credential"] = map[string]any{"id": "", "name": ""}
		if res, err := u.apiCall(r, "GET", "/api/v2/credentials/?credential_type__kind=kubernetes&page_size=2", nil); err == nil && res.Status == 200 && num(res.Data["count"]) == 1 {
			if list, ok := res.Data["results"].([]any); ok && len(list) == 1 {
				c, _ := list[0].(map[string]any)
				values["credential"] = map[string]any{"id": str(c["id"]), "name": str(c["name"])}
			}
		}
	}
	p.Data["values"] = values
	u.render(w, r, "instance_groups_form", p)
}

// igBase is the UI path instance groups of a kind live under.
func igBase(container bool) string {
	if container {
		return "/instance_groups/container_group/"
	}
	return "/instance_groups/"
}

func (u *UI) igEdit(w http.ResponseWriter, r *http.Request, uc *userContext, id string, container bool) {
	g, ok := u.loadObject(w, r, uc, "/api/v2/instance_groups/"+id+"/")
	if !ok {
		return
	}
	p := u.igFormPage(r, uc, "Edit details", container)
	p.Data["ig"] = g
	if r.Method == http.MethodPost {
		payload, values := igFormPost(r, container)
		u.submitForm(w, r, p, "instance_groups_form", "PATCH", "/api/v2/instance_groups/"+id+"/", payload, values, igBase(container)+id+"/details")
		return
	}
	values := map[string]any{"name": str(g["name"]), "policy_instance_minimum": num(g["policy_instance_minimum"]), "policy_instance_percentage": num(g["policy_instance_percentage"]),
		"max_concurrent_jobs": num(g["max_concurrent_jobs"]), "max_forks": num(g["max_forks"])}
	if container {
		spec := str(g["pod_spec_override"])
		values["override"] = spec != ""
		if spec == "" {
			spec = u.defaultPodSpec(r)
			p.Data["podSpecSource"] = "json"
		}
		values["pod_spec_override"] = spec
		values["credential"] = map[string]any{"id": str(dig(g, "summary_fields", "credential", "id")), "name": str(dig(g, "summary_fields", "credential", "name"))}
		values["mesh_node"] = map[string]any{"id": str(dig(g, "summary_fields", "mesh_node", "id")), "name": str(dig(g, "summary_fields", "mesh_node", "hostname"))}
	}
	p.Data["values"] = values
	u.render(w, r, "instance_groups_form", p)
}

// --- instances --------------------------------------------------------------

var instanceSearchKeys = []map[string]string{{"name": "Name", "key": "hostname__icontains"}, {"name": "Node Type", "key": "or__node_type", "options": "node_type"}}

func (u *UI) instanceList(w http.ResponseWriter, r *http.Request, uc *userContext) {
	p := u.newPage(r, uc, "Instances")
	p.Nav = navigation(uc, "/instances")
	if err := u.listPage(r, p, "instance", "/api/v2/instances/", url.Values{"order_by": {"hostname"}}, instanceFilterLabels); err != nil {
		u.api.Log.ErrorContext(r.Context(), "instance list", "err", err)
	}
	p.Data["searchKeys"] = instanceSearchKeys
	p.Data["pending"] = anyPending(p.Data["results"])
	p.Data["superuser"] = uc.User.IsSuperuser
	k8s := u.isK8s(r)
	p.Data["canAdd"] = uc.User.IsSuperuser && k8s
	// Remove deprovisions the selected rows: on Kubernetes the hop and
	// execution nodes added there, and anywhere the instances the heartbeat
	// lost (removable marks the rows it may take).
	p.Data["removable"] = removableInstances(p.Data["results"], uc.User.IsSuperuser, k8s)
	if uc.User.IsSuperuser {
		p.Data["removeButton"] = template.HTML(`<div class="pf-v6-c-toolbar__item"><div style="display: contents;" data-tooltip="` + template.HTMLEscapeString(p.Loc.T("Select a row to remove")) + `" data-tooltip-pos="top"><div><button class="pf-v6-c-button pf-m-secondary pf-m-progress" disabled type="button" data-instance-remove-selected><span class="pf-v6-c-button__text">` + template.HTMLEscapeString(p.Loc.T("Remove")) + `</span></button></div></div></div>`)
	}
	p.Data["forks"] = instanceForks(p.Data["results"])
	u.render(w, r, "instances_list", p)
}

// instanceDetail renders InstanceDetail: on its own (group nil) or as an
// instance group's Instances tab detail (InstanceGroup/InstanceDetails).
func (u *UI) instanceDetail(w http.ResponseWriter, r *http.Request, uc *userContext, id string, group map[string]any) {
	inst, ok := u.loadObject(w, r, uc, "/api/v2/instances/"+id+"/")
	if !ok {
		return
	}
	title := "Details"
	nav := "/instances"
	if group != nil {
		title = "Instance details"
		nav = "/instance_groups"
	}
	p := u.newPage(r, uc, title)
	p.Nav = navigation(uc, nav)
	p.Data["instance"] = inst
	p.Data["group"] = group
	p.Data["superuser"] = uc.User.IsSuperuser
	p.Data["forks"] = instanceForkCount(inst)
	p.Data["groups"] = u.listResults(r, "/api/v2/instances/"+id+"/instance_groups/")
	p.Data["tabs"] = u.instanceTabs(r, id)
	// On Kubernetes a superuser edits and removes the nodes it added.
	p.Data["k8sEdit"] = group == nil && uc.User.IsSuperuser && u.isK8s(r) && inst["managed"] != true
	p.Data["removable"] = group == nil && uc.User.IsSuperuser && instanceRemovable(inst, u.isK8s(r), time.Now())
	if str(inst["node_type"]) == "execution" {
		if hc, err := u.apiCall(r, "GET", "/api/v2/instances/"+id+"/health_check/", nil); err == nil && hc.Status == 200 {
			p.Data["healthErrors"] = str(hc.Data["errors"])
		}
	}
	u.render(w, r, "instance_detail", p)
}
