package web

import (
	"encoding/json"
	"html/template"
	"net/http"
	"net/url"
	"strconv"
	"strings"
)

// Instances on Kubernetes (IS_K8S): the add and edit forms, and the
// Listener Addresses and Peers tabs of an instance. Off Kubernetes the old
// UI showed none of them.

func (u *UI) isK8s(r *http.Request) bool { return u.api.Settings.Bool(r.Context(), "IS_K8S") }

func (u *UI) registerK8sInstances(mux *http.ServeMux) {
	mux.HandleFunc("/instances/add", u.protected(func(w http.ResponseWriter, r *http.Request, uc *userContext) { u.instanceForm(w, r, uc, nil) }))
	mux.HandleFunc("/instances/{id}/edit", u.protected(func(w http.ResponseWriter, r *http.Request, uc *userContext) {
		inst, ok := u.loadObject(w, r, uc, "/api/v2/instances/"+r.PathValue("id")+"/")
		if !ok {
			return
		}
		u.instanceForm(w, r, uc, inst)
	}))
	mux.HandleFunc("/instances/{id}/listener_addresses", u.protected(func(w http.ResponseWriter, r *http.Request, uc *userContext) { u.instanceAddresses(w, r, uc, false) }))
	mux.HandleFunc("/instances/{id}/peers", u.protected(func(w http.ResponseWriter, r *http.Request, uc *userContext) { u.instanceAddresses(w, r, uc, true) }))
}

// instanceTabs are the instance's tabs: Details, and on Kubernetes its
// Listener Addresses and Peers.
func (u *UI) instanceTabs(r *http.Request, id string) []map[string]string {
	tabs := []map[string]string{{"key": "details", "href": "/instances/" + id + "/details", "label": "Details"}}
	if u.isK8s(r) {
		tabs = append(tabs, map[string]string{"key": "listener_addresses", "href": "/instances/" + id + "/listener_addresses", "label": "Listener Addresses"},
			map[string]string{"key": "peers", "href": "/instances/" + id + "/peers", "label": "Peers"})
	}
	return tabs
}

// instanceForm is InstanceAdd and InstanceEdit.
func (u *UI) instanceForm(w http.ResponseWriter, r *http.Request, uc *userContext, inst map[string]any) {
	if !u.isK8s(r) || !uc.User.IsSuperuser {
		u.notFound(w, r, uc)
		return
	}
	title := "Create new Instance"
	if inst != nil {
		title = "Edit Instance"
	}
	p := u.newPage(r, uc, title)
	p.Nav = navigation(uc, "/instances")
	p.Data["instance"] = inst
	values := map[string]any{"hostname": "", "description": "", "node_state": "installed", "listener_port": "", "node_type": "execution", "enabled": true, "managed_by_policy": true, "peers_from_control_nodes": false}
	if inst != nil {
		values = map[string]any{"hostname": str(inst["hostname"]), "description": "", "node_state": str(inst["node_state"]), "listener_port": str(inst["listener_port"]), "node_type": str(inst["node_type"]),
			"enabled": inst["enabled"] == true, "managed_by_policy": inst["managed_by_policy"] == true, "peers_from_control_nodes": inst["peers_from_control_nodes"] == true}
		if inst["listener_port"] == nil {
			values["listener_port"] = ""
		}
	}
	if r.Method == http.MethodPost {
		f := r.PostForm
		payload := map[string]any{"enabled": f.Get("enabled") == "on", "managed_by_policy": f.Get("managed_by_policy") == "on", "peers_from_control_nodes": f.Get("peers_from_control_nodes") == "on"}
		if port := strings.TrimSpace(f.Get("listener_port")); port != "" {
			n, err := strconv.ParseInt(port, 10, 64)
			if err != nil {
				payload["listener_port"] = port
			} else {
				payload["listener_port"] = n
			}
		} else {
			payload["listener_port"] = nil
		}
		values["listener_port"] = f.Get("listener_port")
		values["enabled"], values["managed_by_policy"], values["peers_from_control_nodes"] = payload["enabled"], payload["managed_by_policy"], payload["peers_from_control_nodes"]
		values["description"] = f.Get("description")
		if inst == nil {
			payload["hostname"], payload["node_type"], payload["node_state"] = f.Get("hostname"), f.Get("node_type"), "installed"
			values["hostname"], values["node_type"] = f.Get("hostname"), f.Get("node_type")
			payload["peers"] = []any{}
			u.submitForm(w, r, p, "instances_form", "POST", "/api/v2/instances/", payload, values, "/instances/{id}/details")
			return
		}
		payload["peers"] = inst["peers"]
		u.submitForm(w, r, p, "instances_form", "PATCH", "/api/v2/instances/"+str(inst["id"])+"/", payload, values, "/instances/"+str(inst["id"])+"/details")
		return
	}
	p.Data["values"] = values
	u.render(w, r, "instances_form", p)
}

// instanceAddresses is InstanceListenerAddressList, or with peers
// InstancePeerList: the addresses the instance listens on, or those it
// connects out to, with their instance's hostname and type.
func (u *UI) instanceAddresses(w http.ResponseWriter, r *http.Request, uc *userContext, peers bool) {
	id := r.PathValue("id")
	res, err := u.apiCall(r, "GET", "/api/v2/instances/"+id+"/", nil)
	if err != nil || res.Status != 200 || !u.isK8s(r) {
		u.notFound(w, r, uc)
		return
	}
	inst := res.Data
	tab, list := "listener_addresses", "/api/v2/instances/"+id+"/receptor_addresses/"
	if peers {
		tab, list = "peers", "/api/v2/instances/"+id+"/peers/"
	}
	title := "Listener Addresses"
	if peers {
		title = "Peers"
	}
	p := u.newPage(r, uc, title)
	p.Nav = navigation(uc, "/instances")
	p.Data["instance"] = inst
	p.Data["tab"] = tab
	p.Data["tabs"] = u.instanceTabs(r, id)
	p.Data["peers"] = peers
	if err := u.listPage(r, p, "peer", list, url.Values{}, map[string]string{"address__icontains": "Name", "hostname__icontains": "Name"}); err != nil {
		u.api.Log.ErrorContext(r.Context(), "instance addresses", "err", err)
	}
	p.Data["searchKeys"] = []map[string]string{{"name": "Name", "key": "address__icontains"}}
	if peers {
		p.Data["emptyName"] = p.Loc.T("Peers")
		p.Data["listLabel"] = p.Loc.T("{pluralizedItemName} List", "pluralizedItemName", p.Data["emptyName"])
		// The addresses' instances name them.
		results, _ := p.Data["results"].([]any)
		hosts := map[string]map[string]any{}
		for _, it := range u.listResults(r, "/api/v2/instances/?page_size=200") {
			if m, ok := it.(map[string]any); ok {
				hosts[str(m["id"])] = m
			}
		}
		for _, it := range results {
			if a, ok := it.(map[string]any); ok {
				if h := hosts[str(a["instance"])]; h != nil {
					for _, k := range []string{"hostname", "node_type", "jobs_running", "jobs_total", "managed_by_policy", "last_health_check", "health_check_pending"} {
						a[k] = h[k]
					}
				}
			}
		}
		if uc.User.IsSuperuser && inst["managed"] != true {
			current, _ := json.Marshal(inst["peers"])
			exclude := []string{"not__instance=" + id, "is_internal=false"}
			for _, rp := range toList(inst["reverse_peers"]) {
				exclude = append(exclude, "not__instance="+str(rp))
			}
			if ids := toList(inst["peers"]); len(ids) > 0 {
				var s []string
				for _, x := range ids {
					s = append(s, str(x))
				}
				exclude = append(exclude, "not__id__in="+strings.Join(s, ","))
			}
			associate, disassociate := template.HTMLEscapeString(p.Loc.T("Associate")), template.HTMLEscapeString(p.Loc.T("Disassociate"))
			p.Data["actions"] = template.HTML(`<div class="pf-v6-c-toolbar__item"><div style="display: contents;"><button aria-label="` + associate + `" class="pf-v6-c-button pf-m-primary" type="button" data-peer-associate="` + template.HTMLEscapeString(id) + `" data-peers="` + template.HTMLEscapeString(string(current)) + `" data-filter="` + template.HTMLEscapeString(strings.Join(exclude, "&")) + `" data-hostname="` + template.HTMLEscapeString(str(inst["hostname"])) + `"><span class="pf-v6-c-button__text">` + associate + `</span></button></div></div>` +
				`<div class="pf-v6-c-toolbar__item"><div style="display: contents;"><div><button aria-label="` + disassociate + `" class="pf-v6-c-button pf-m-secondary" disabled type="button" data-peer-disassociate="` + template.HTMLEscapeString(id) + `" data-peers="` + template.HTMLEscapeString(string(current)) + `" data-hostname="` + template.HTMLEscapeString(str(inst["hostname"])) + `"><span class="pf-v6-c-button__text">` + disassociate + `</span></button></div></div></div>`)
		}
	} else {
		p.Data["emptyName"] = p.Loc.T("Listener Addresses")
		p.Data["listLabel"] = p.Loc.T("{pluralizedItemName} List", "pluralizedItemName", p.Data["emptyName"])
	}
	u.render(w, r, "instance_addresses", p)
}
