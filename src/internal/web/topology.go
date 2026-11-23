package web

import (
	"bytes"
	"encoding/json"
	"html/template"
	"net/http"
)

// Topology view: TopologyView with its header controls, legend, the
// loading screen the force layout reports into, and the details panel of
// the selected node, which the page fetches as a fragment rendered from the
// instance partials.

func (u *UI) registerTopology(mux *http.ServeMux) {
	mux.HandleFunc("/topology_view", u.protected(u.topologyView))
	mux.HandleFunc("/topology_view/{$}", u.protected(u.topologyView))
	mux.HandleFunc("/topology_view/node/{id}", u.protected(u.topologyNode))
}

func (u *UI) topologyView(w http.ResponseWriter, r *http.Request, uc *userContext) {
	p := u.newPage(r, uc, "Topology View")
	p.Nav = navigation(uc, "/topology_view")
	res, err := u.apiCall(r, "GET", "/api/v2/mesh_visualizer/", nil)
	if err != nil || res.Status != 200 {
		// ContentError: the old screen showed the request's failure.
		p.Data["error"] = true
		if res != nil {
			p.Data["status"] = res.Status
		}
	} else {
		// The endpoint's JSON goes into the page's data script with <, >
		// and & escaped (json.HTMLEscape): the API leaves them as they are,
		// and a "</script>" in any value would end the script block.
		var buf bytes.Buffer
		json.HTMLEscape(&buf, res.Raw)
		p.Data["mesh"] = template.JS(buf.String())
	}
	p.Data["d3"] = true
	u.render(w, r, "topology_view", p)
}

// topologyNode renders the details panel of one node (MeshGraph's
// Tooltip with a node selected).
func (u *UI) topologyNode(w http.ResponseWriter, r *http.Request, uc *userContext) {
	id := r.PathValue("id")
	res, err := u.apiCall(r, "GET", "/api/v2/instances/"+id+"/", nil)
	if err != nil || res.Status != 200 {
		status := http.StatusNotFound
		if res != nil && res.Status != 0 {
			status = res.Status
		}
		http.Error(w, "Failed to get instance.", status)
		return
	}
	p := u.newPage(r, uc, "")
	p.Data["instance"] = res.Data
	p.Data["groups"] = u.listResults(r, "/api/v2/instances/"+id+"/instance_groups/")
	p.Data["forks"] = instanceForkCount(res.Data)
	p.Data["superuser"] = uc.User.IsSuperuser
	u.renderFragment(w, r, "topology_view", "topology_tooltip", p)
}
