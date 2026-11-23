package web

import "bytes"

// pageScripts are the scripts base.html loads only on the pages that use
// them. Each starts, when it loads, from elements the page was rendered
// with, so a page needs it when its body carries one of the markers: the
// data attributes the script looks for (and its delegated listeners
// match). needs names the scripts it calls into: templates.js's
// promptWizard for the schedule form and the workflow visualizer,
// advanced-search.js's search group for the host filter, instances.js's
// bindInstanceControls for the topology's node details.
//
// A script that gains an entry point must list its attribute here, or the
// pages with it go without the script.
var pageScripts = map[string]struct{ markers, needs []string }{
	"advanced-search":    {markers: []string{"data-search-form"}},
	"host-filter":        {markers: []string{"data-host-filter"}, needs: []string{"advanced-search"}},
	"credential-plugins": {markers: []string{"data-credential-form"}},
	"instances-k8s":      {markers: []string{"data-instance-remove", "data-instance-remove-selected", "data-peer-associate", "data-peer-disassociate"}},
	"templates": {markers: []string{"data-cancel-job", "data-cancel-selected", "data-relaunch", "data-launch", "data-output-scroll-container",
		"data-job-template-form", "data-tag-select", "data-survey-toolbar", "data-survey-question-form", "data-wf-nav", "data-notification-toggle", "data-schedule-prompt"}},
	"schedules":           {markers: []string{"data-schedule-toggle", "data-occurrence-toggle", "data-schedule-form"}},
	"workflow-visualizer": {markers: []string{"data-wf-visualizer", "data-wf-output", "data-workflow-relaunch"}, needs: []string{"templates"}},
	"workflows":           {markers: []string{"data-dt-title", "data-workflow-template-form", "data-approval-vote", "data-approval-bulk", "data-cancel-workflow"}},
	"inventory-sources":   {markers: []string{"data-delete-source", "data-source-form"}},
	"access": {markers: []string{"data-access-remove", "data-role-disassociate", "data-chip-overflow", "data-user-teams-associate",
		"data-user-teams-disassociate", "data-access-add", "data-roles-add", "data-user-form"}},
	"oauth":           {markers: []string{"data-clipboard-toggle", "data-open-on-load", "data-replace-url", "data-application-form"}},
	"activity-stream": {markers: []string{"data-activity-detail"}},
	"instances": {markers: []string{"data-capacity-slider", "data-instance-toggle", "data-health-check", "data-health-check-selected",
		"data-disassociate-instance", "data-container-group-form", "data-topology-chart"}},
	"host-metrics":           {markers: []string{"data-host-metrics-delete"}},
	"settings":               {markers: []string{"data-settings-form"}},
	"notification-templates": {markers: []string{"data-nt-test", "data-nt-form"}},
}

// scriptMarkers maps each marker attribute to the scripts it loads.
var scriptMarkers = func() map[string][]string {
	m := map[string][]string{}
	for name, s := range pageScripts {
		for _, a := range s.markers {
			m[a] = append(m[a], name)
		}
	}
	return m
}()

// scriptsFor reads the data attributes off a rendered body, in one pass,
// and returns the page scripts they call for with the scripts those need.
func scriptsFor(body []byte) map[string]bool {
	out := map[string]bool{}
	var add func(string)
	add = func(name string) {
		if out[name] {
			return
		}
		out[name] = true
		for _, n := range pageScripts[name].needs {
			add(n)
		}
	}
	prefix := []byte("data-")
	for rest := body; ; {
		i := bytes.Index(rest, prefix)
		if i < 0 {
			break
		}
		// An attribute name starts after a space (or a quote or a bracket
		// when the attribute is a selector in a script).
		start := i == 0 || !isAttrByte(rest[i-1])
		j := i + len(prefix)
		for j < len(rest) && isAttrByte(rest[j]) {
			j++
		}
		if start {
			for _, name := range scriptMarkers[string(rest[i:j])] {
				add(name)
			}
		}
		rest = rest[j:]
	}
	return out
}

func isAttrByte(c byte) bool {
	return c == '-' || c == '_' || c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9'
}

// Loads reports whether the page loads the named script of pageScripts.
func (p *page) Loads(name string) bool { return p.scripts[name] }
