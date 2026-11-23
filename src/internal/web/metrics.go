package web

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
)

// Metrics (Metrics, LineChart): a subsystem metric of one control node, or
// of all of them, charted from a reading every three seconds.

func (u *UI) registerMetrics(mux *http.ServeMux) {
	mux.HandleFunc("/metrics", u.protected(u.metricsPage))
	mux.HandleFunc("/metrics/{$}", u.protected(u.metricsPage))
}

func (u *UI) metricsPage(w http.ResponseWriter, r *http.Request, uc *userContext) {
	p := u.newPage(r, uc, "Metrics")
	p.Nav = navigation(uc, "/metrics")
	// Every node but the execution nodes, on every page: InstancesAPI.read()
	// took only the first page, which on a larger mesh can leave control
	// nodes out of the selector and the All chart, or hold none of them.
	var results []any
	var inst *apiResult
	var err error
	for page := 1; page < 100; page++ {
		inst, err = u.apiCall(r, "GET", fmt.Sprintf("/api/v2/instances/?not__node_type=execution&page_size=200&page=%d", page), nil)
		if err != nil || inst.Status != 200 {
			break
		}
		more, _ := inst.Data["results"].([]any)
		results = append(results, more...)
		if inst.Data["next"] == nil {
			break
		}
	}
	mets, err2 := u.apiCall(r, "GET", "/api/v2/metrics/?subsystemonly=1&format=json", nil)
	if err != nil || err2 != nil || inst.Status != 200 || mets.Status != 200 {
		status := 500
		if inst != nil && inst.Status != 200 {
			status = inst.Status
		} else if mets != nil && mets.Status != 200 {
			status = mets.Status
		}
		p.Data["error"] = status
		u.render(w, r, "metrics", p)
		return
	}
	var names []string
	for _, x := range results {
		if m, ok := x.(map[string]any); ok && str(m["node_type"]) != "execution" {
			names = append(names, str(m["hostname"]))
		}
	}
	if len(names) > 1 {
		names = append(names, "All")
		// The last option, "All", is shown translated.
		p.Data["hasAll"] = true
	}
	p.Data["instances"] = names
	p.Data["metrics"] = orderedKeys(mets.Raw)
	p.Data["d3"] = true
	p.Data["metricsPage"] = true
	u.render(w, r, "metrics", p)
}

// orderedKeys is Object.keys of a JSON object, in the order sent.
func orderedKeys(raw []byte) []string {
	dec := json.NewDecoder(bytes.NewReader(raw))
	if t, err := dec.Token(); err != nil || t != json.Delim('{') {
		return nil
	}
	var out []string
	for dec.More() {
		t, err := dec.Token()
		if err != nil {
			return out
		}
		k, _ := t.(string)
		out = append(out, k)
		var skip json.RawMessage
		if err := dec.Decode(&skip); err != nil {
			return out
		}
	}
	return out
}
