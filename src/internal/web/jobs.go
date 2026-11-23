package web

import (
	"fmt"
	"html"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/ctrliq/ascender/internal/i18n"
)

func (u *UI) registerJobs(mux *http.ServeMux) {
	mux.HandleFunc("/jobs", u.protected(u.jobList))
	mux.HandleFunc("/jobs/{$}", u.protected(u.jobList))
	// JobTypeRedirect: /jobs/<id> finds the job's type and opens its output.
	mux.HandleFunc("/jobs/{id}", u.protected(func(w http.ResponseWriter, r *http.Request, uc *userContext) {
		res, err := u.apiCall(r, "GET", "/api/v2/unified_jobs/?id="+url.QueryEscape(r.PathValue("id")), nil)
		if err == nil && res.Status == 200 {
			if list, ok := res.Data["results"].([]any); ok && len(list) > 0 {
				if j, ok := list[0].(map[string]any); ok {
					http.Redirect(w, r, "/jobs/"+jobTypeSegment(str(j["type"]))+"/"+str(j["id"])+"/output", http.StatusFound)
					return
				}
			}
		}
		u.notFound(w, r, uc)
	}))
	mux.HandleFunc("/jobs/{type}/{id}", u.protected(func(w http.ResponseWriter, r *http.Request, uc *userContext) {
		http.Redirect(w, r, "/jobs/"+r.PathValue("type")+"/"+r.PathValue("id")+"/output", http.StatusFound)
	}))
	mux.HandleFunc("/jobs/{type}/{id}/output", u.protected(u.jobOutput))
	mux.HandleFunc("/jobs/{type}/{id}/output/live", u.protected(u.jobOutputLive))
	mux.HandleFunc("/jobs/{type}/{id}/details", u.protected(u.jobDetails))
}

var jobSearchKeys = []map[string]string{
	{"name": "Name", "key": "name__icontains"},
	{"name": "ID", "key": "id"},
	{"name": "Label Name", "key": "labels__name__icontains"},
	{"name": "Job Type", "key": "or__type", "options": "job_type"},
	{"name": "Launched By (Username)", "key": "created_by__username__icontains"},
	{"name": "Status", "key": "or__status", "options": "job_status"},
	{"name": "Limit", "key": "job__limit"},
	{"name": "Created", "key": "created", "date": "true"},
	{"name": "Finished", "key": "finished", "date": "true"},
}

var jobFilterLabels = searchLabels(jobSearchKeys, "status__in", "Status", "type__in", "Job Type", "limit", "Limit")

// jobTypeLabel is the type column of the jobs list.
func jobTypeLabel(j map[string]any) string {
	if str(j["type"]) == "job" {
		if str(j["job_type"]) == "check" {
			return "Playbook Check"
		}
		return "Playbook Run"
	}
	if str(j["type"]) == "ad_hoc_command" {
		return "Command"
	}
	return jobTypeLabels[str(j["type"])]
}

func (u *UI) jobList(w http.ResponseWriter, r *http.Request, uc *userContext) {
	p := u.newPage(r, uc, "Jobs")
	if err := u.listPage(r, p, "job", "/api/v2/unified_jobs/", url.Values{"order_by": {"-finished"}, "not__launch_type": {"sync"}}, jobFilterLabels); err != nil {
		u.api.Log.ErrorContext(r.Context(), "job list", "err", err)
	}
	p.Data["searchKeys"] = jobSearchKeys
	p.Data["showType"] = true
	p.Data["editor"] = true
	u.render(w, r, "jobs_list", p)
}

// jobAPIPath maps the UI job type segment to the API collection.
func jobAPIPath(typ string) string {
	switch typ {
	case "project":
		return "project_updates"
	case "playbook":
		return "jobs"
	case "inventory":
		return "inventory_updates"
	case "command":
		return "ad_hoc_commands"
	case "management":
		return "system_jobs"
	case "workflow":
		return "workflow_jobs"
	}
	return ""
}

var jobTypeLabels = map[string]string{"project_update": "Source Control Update", "inventory_update": "Inventory Sync", "job": "Playbook Run", "ad_hoc_command": "Run Command", "system_job": "Management Job", "workflow_job": "Workflow Job"}

func (u *UI) loadJob(w http.ResponseWriter, r *http.Request, uc *userContext) (map[string]any, string, bool) {
	coll := jobAPIPath(r.PathValue("type"))
	if coll == "" {
		u.notFound(w, r, uc)
		return nil, "", false
	}
	job, ok := u.loadObject(w, r, uc, "/api/v2/"+coll+"/"+r.PathValue("id")+"/")
	return job, coll, ok
}

func (u *UI) jobPage(r *http.Request, uc *userContext, job map[string]any, coll, tab string) *page {
	title := "Output"
	if tab == "details" {
		title = "Details"
	}
	p := u.newPage(r, uc, title)
	p.Nav = navigation(uc, "/jobs")
	p.Data["job"] = job
	p.Data["coll"] = coll
	p.Data["tab"] = tab
	p.Data["typeSeg"] = r.PathValue("type")
	p.Data["typeLabel"] = p.Loc.T(jobTypeLabel(job))
	if str(job["type"]) == "ad_hoc_command" {
		// The jobs list calls it a Command; JobDetail a Run Command.
		p.Data["typeLabel"] = p.Loc.T(jobTypeLabels["ad_hoc_command"])
	}
	p.Data["sourceLabel"] = sourceChoiceLabels[str(job["source"])]
	p.Data["elapsed"] = formatElapsed(job["elapsed"])
	p.Data["verbosity"] = p.Loc.T(verbosityLabels[str(job["verbosity"])])
	p.Data["editor"] = true
	if wf, ok := dig(job, "summary_fields", "source_workflow_job").(map[string]any); ok {
		p.Data["wfNav"] = u.workflowNavigation(r, p.Loc, str(job["id"]), str(wf["id"]))
	}
	if str(job["type"]) == "job" {
		// The relaunch options depend on whether the run had failed hosts.
		if res, err := u.apiCall(r, "GET", "/api/v2/jobs/"+str(job["id"])+"/relaunch/", nil); err == nil && res.Status == 200 {
			p.Data["relaunch"] = res.Data
			if rc, ok := res.Data["retry_counts"].(map[string]any); ok {
				p.Data["failedHosts"] = num(rc["failed"])
			}
		}
	}
	return p
}

func formatElapsed(v any) string {
	var secs float64
	switch t := v.(type) {
	case float64:
		secs = t
	}
	d := time.Duration(secs * float64(time.Second))
	h := int(d.Hours())
	m := int(d.Minutes()) % 60
	s := int(d.Seconds()) % 60
	return fmt.Sprintf("%02d:%02d:%02d", h, m, s)
}

func (u *UI) jobDetails(w http.ResponseWriter, r *http.Request, uc *userContext) {
	job, coll, ok := u.loadJob(w, r, uc)
	if !ok {
		return
	}
	p := u.jobPage(r, uc, job, coll, "details")
	u.render(w, r, "job_detail", p)
}

// outputLine is one rendered line of the output pane.
type outputLine struct {
	Number int
	HTML   string
	// Time is the event's HH:MM:SS in UTC and TimeISO its full timestamp,
	// which the browser reformats into its own zone.
	Time    string
	TimeISO string
	Event   string
	// Toggle marks the line that heads a play or task section; Level is
	// the nesting (1 play, 2 task, 3 host event) for collapsing.
	Toggle bool
	Level  int
	UUID   string
	Parent string
	// Counter is the event counter, Host the host the event belongs to.
	Counter int
	Host    bool
}

func (u *UI) jobOutput(w http.ResponseWriter, r *http.Request, uc *userContext) {
	job, coll, ok := u.loadJob(w, r, uc)
	if !ok {
		return
	}
	p := u.jobPage(r, uc, job, coll, "output")
	if coll == "workflow_jobs" {
		// Workflow jobs have no events; their output is the node graph.
		u.workflowOutput(w, r, p)
		return
	}
	u.outputData(r, p, job, coll, -1)
	u.render(w, r, "job_output", p)
}

// jobOutputLive serves what changed on a running job's output page: the
// status, counts and host bar, and the lines of the events after the given
// counter. The page polls it in place of the old websocket stream.
func (u *UI) jobOutputLive(w http.ResponseWriter, r *http.Request, uc *userContext) {
	job, coll, ok := u.loadJob(w, r, uc)
	if !ok {
		return
	}
	if coll == "workflow_jobs" {
		http.NotFound(w, r)
		return
	}
	after, err := strconv.Atoi(r.URL.Query().Get("after"))
	if err != nil || after < 0 {
		after = 0
	}
	p := u.newPage(r, uc, "Output")
	p.Data["job"] = job
	p.Data["coll"] = coll
	p.Data["typeSeg"] = r.PathValue("type")
	p.Data["elapsed"] = formatElapsed(job["elapsed"])
	u.outputData(r, p, job, coll, after)
	u.renderFragment(w, r, "job_output", "job_output_live", p)
}

// outputData loads the output lines (all of them, or those of the events
// after a counter) and the toolbar counts into the page.
func (u *UI) outputData(r *http.Request, p *page, job map[string]any, coll string, after int) {
	var lines []outputLine
	firstEvent := false
	maxCounter := after
	if maxCounter < 0 {
		maxCounter = 0
	}
	eventsPath := "events"
	if coll == "jobs" {
		eventsPath = "job_events"
	}
	query := "order_by=start_line"
	if after >= 0 {
		query = fmt.Sprintf("counter__gt=%d&order_by=counter", after)
	}
	// JobOutputSearch's filters (job_output.*) go to the events request,
	// and the matching events show flat, in counter order (isFlatMode).
	search := listParams(r.URL.Query(), "job_output", nil)
	for k := range pagingKeys {
		search.Del(k)
	}
	search.Del("after")
	flat := len(search) > 0
	if flat {
		search.Set("order_by", "counter")
		if after >= 0 {
			search.Set("counter__gt", strconv.Itoa(after))
		}
		query = search.Encode()
	}
	p.Data["flat"] = flat
	p.Data["searchKeys"] = jobOutputSearchKeys(str(job["type"]))
	p.Data["filters"] = activeFilters(r.URL.Query(), "job_output", searchLabels(jobOutputSearchKeys(str(job["type"]))))
	p.Data["eventsAPI"] = fmt.Sprintf("/api/v2/%s/%s/%s/", coll, str(job["id"]), eventsPath)
	for page := 1; page < 200; page++ {
		res, err := u.apiCall(r, "GET", fmt.Sprintf("/api/v2/%s/%s/%s/?%s&page_size=200&page=%d", coll, str(job["id"]), eventsPath, query, page), nil)
		if err != nil || res.Status != 200 {
			break
		}
		results, _ := res.Data["results"].([]any)
		for _, ev := range results {
			e, _ := ev.(map[string]any)
			if c := num(e["counter"]); c > maxCounter {
				maxCounter = c
			}
			if num(e["counter"]) == 1 {
				firstEvent = true
			}
			evLines := eventLines(e)
			if flat {
				for i := range evLines {
					evLines[i].Toggle = false
				}
			}
			lines = append(lines, evLines...)
		}
		if res.Data["next"] == nil {
			break
		}
	}
	// prependTraceback: with no first event the traceback is a line of its
	// own at line 0. The old page also wrote it over the first event's first
	// line, but then reloaded the visible rows without it, so a job with a
	// first event showed that event's own lines.
	if tb := str(job["result_traceback"]); after < 0 && tb != "" && !firstEvent {
		var tbLines []outputLine
		for i, part := range strings.Split(tb, "\r\n") {
			tbLines = append(tbLines, outputLine{Number: i, HTML: ansiToHTML(part), Counter: 1})
		}
		lines = append(tbLines, lines...)
	}
	p.Data["lines"] = lines
	p.Data["maxCounter"] = maxCounter
	p.Data["running"] = jobRunning(str(job["status"]))
	counts, _ := job["host_status_counts"].(map[string]any)
	p.Data["bar"] = hostStatusBar(counts)
	// The toolbar counts come from host_status_counts, as OutputToolbar
	// summed them; some job types never show counts.
	hosts := 0
	for _, v := range counts {
		hosts += num(v)
	}
	p.Data["hosts"] = hosts
	p.Data["dark"] = num(counts["dark"])
	p.Data["failures"] = num(counts["failures"])
	p.Data["showCounts"] = !outputNoCountTypes[str(job["type"])]
}

// jobOutputSearchKeys are JobOutputSearch's columns: Stdout, and Event for
// the job types whose events have one.
func jobOutputSearchKeys(jobType string) []map[string]string {
	keys := []map[string]string{{"name": "Stdout", "key": "stdout__icontains"}}
	if jobType != "system_job" && jobType != "inventory_update" {
		keys = append(keys, map[string]string{"name": "Event", "key": "or__event", "options": "job_event"})
	}
	return keys
}

// jobRunning is isJobRunning: the statuses whose output can still grow.
func jobRunning(status string) bool {
	switch status {
	case "new", "pending", "waiting", "running":
		return true
	}
	return false
}

type barSegment struct {
	Color string
	Grow  int
}

func hostStatusBar(counts map[string]any) []barSegment {
	order := []struct{ key, color string }{{"ok", "#12a66f"}, {"skipped", "#73BCF7"}, {"changed", "#F0AB00"}, {"failures", "#f04438"}, {"dark", "#8F4700"}}
	if len(counts) == 0 {
		return []barSegment{{Color: "inherit", Grow: 1}}
	}
	var out []barSegment
	for _, o := range order {
		out = append(out, barSegment{Color: o.color, Grow: num(counts[o.key])})
	}
	return out
}

// hiddenPasswordPrompts are the prompt lines JobEvent never drew.
var hiddenPasswordPrompts = map[string]bool{"SSH password: ": true, "BECOME password[defaults to SSH password]: ": true}

// outputNoCountTypes are the job types whose output toolbar shows no counts.
var outputNoCountTypes = map[string]bool{"ad_hoc_command": true, "system_job": true, "inventory_update": true}

// wfNavNode is one entry of the workflow navigation menu on a job spawned by
// a workflow; wfNav is the menu itself, as WorkflowOutputNavigation built it.
type wfNavNode struct {
	Label, Href, Status string
	Current             bool
}

type wfNav struct {
	Label                     string
	Total, Failed, Successful int
	Nodes                     []wfNavNode
}

var jobURLSegments = map[string]string{"job": "playbook", "project_update": "project", "system_job": "management", "inventory_update": "inventory", "ad_hoc_command": "command", "workflow_job": "workflow"}

var uuidRe = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

// workflowNavigation builds the "Workflow Job n/m" menu from the nodes of
// the workflow job that spawned this job. Nodes that ran no job (approval
// nodes, nodes never reached) have no output to navigate to.
func (u *UI) workflowNavigation(r *http.Request, loc *i18n.Locale, jobID, workflowJobID string) *wfNav {
	type ranNode struct{ node, job map[string]any }
	var ran []ranNode
	for _, n := range u.listResults(r, "/api/v2/workflow_jobs/"+workflowJobID+"/workflow_nodes/?page_size=200") {
		m, _ := n.(map[string]any)
		j, _ := dig(m, "summary_fields", "job").(map[string]any)
		if m == nil || m["job"] == nil || j == nil || str(j["type"]) == "workflow_approval" {
			continue
		}
		ran = append(ran, ranNode{m, j})
	}
	if len(ran) == 0 {
		return nil
	}
	nav := &wfNav{Total: len(ran)}
	position := func(i int) string {
		return loc.T("Workflow Job {currentPosition}/{total}", "currentPosition", i+1, "total", nav.Total)
	}
	for i, x := range ran {
		// Sliced-job and federated-inventory workflows create their nodes
		// directly, so their identifier is blank; label those by position.
		label := position(i)
		if ident := str(x.node["identifier"]); uuidRe.MatchString(ident) {
			label = str(x.job["name"])
		} else if ident != "" {
			label = ident
		}
		status := str(x.job["status"])
		switch status {
		case "failed":
			nav.Failed++
		case "successful":
			nav.Successful++
		}
		current := str(x.job["id"]) == jobID
		if current {
			nav.Label = position(i)
		}
		nav.Nodes = append(nav.Nodes, wfNavNode{Label: label, Href: fmt.Sprintf("/jobs/%s/%s/output", jobURLSegments[str(x.job["type"])], str(x.job["id"])), Status: status, Current: current})
	}
	if nav.Label == "" {
		nav.Label = loc.T("Workflow Jobs ({total})", "total", nav.Total)
	}
	return nav
}

var timeEvents = map[string]bool{"playbook_on_task_start": true, "playbook_on_play_start": true, "playbook_on_stats": true}

// toggleEvents are the events whose lines open a collapsible section.
var toggleEvents = map[string]bool{"playbook_on_play_start": true, "playbook_on_task_start": true}

// eventLines splits an event's stdout into numbered, ANSI-rendered lines,
// as getLineTextHtml did.
func eventLines(e map[string]any) []outputLine {
	stdout := str(e["stdout"])
	start := num(e["start_line"])
	end := num(e["end_line"])
	if stdout == "" && end <= start {
		return nil
	}
	parts := strings.Split(strings.ReplaceAll(stdout, "\r\n", "\n"), "\n")
	if len(parts) > 0 && parts[len(parts)-1] == "" {
		parts = parts[:len(parts)-1]
	}
	stamp, iso := "", ""
	if timeEvents[str(e["event"])] {
		if t, err := time.Parse(time.RFC3339Nano, str(e["created"])); err == nil {
			stamp = t.Format("15:04:05")
			iso = str(e["created"])
		}
	}
	level := num(e["event_level"])
	var out []outputLine
	for i, part := range parts {
		if hiddenPasswordPrompts[part] {
			continue
		}
		l := outputLine{Number: start + i, HTML: ansiToHTML(part), Event: str(e["event"]), Level: level, UUID: str(e["uuid"]), Parent: str(e["parent_uuid"]), Counter: num(e["counter"]), Host: e["host"] != nil}
		// getLineTextHtml stamped the second line of a play, task or
		// stats event, which is the header line after its leading break.
		if stamp != "" && i == 1 {
			l.Time = stamp
			l.TimeISO = iso
		}
		if toggleEvents[l.Event] && i == len(parts)-1 && strings.TrimSpace(part) != "" {
			l.Toggle = true
		}
		out = append(out, l)
	}
	return out
}

// ansiColors mirrors the colour table the old UI gave ansi-to-html.
var ansiColors = map[int]string{
	0: "var(--ansi-color-0, #000)", 1: "#A30000", 2: "#068917", 3: "#be8f17", 4: "var(--ansi-color-4, #00A)", 5: "#A0A", 6: "#0c6899", 7: "#AAA",
	8: "#555", 9: "#F55", 10: "#5F5", 11: "#FF5", 12: "var(--ansi-color-12, #55F)", 13: "#F5F", 14: "#5FF", 15: "#FFF",
}

var ansiRe = regexp.MustCompile(`\x1b\[([0-9;]*)m`)

// ansiToHTML converts colour escapes the way ansi-to-html did for the old
// output: bold, italic and underline open <b>, <i> and <u>, colours open
// styled spans, and a reset closes everything still open. The old theme
// renders the <b> at normal weight, so the tags matter for the look.
func ansiToHTML(s string) string {
	var b strings.Builder
	var stack []string
	last := 0
	push := func(open, close string) {
		b.WriteString(open)
		stack = append(stack, close)
	}
	for _, m := range ansiRe.FindAllStringSubmatchIndex(s, -1) {
		b.WriteString(html.EscapeString(s[last:m[0]]))
		last = m[1]
		for _, c := range strings.Split(s[m[2]:m[3]], ";") {
			n, _ := strconv.Atoi(c)
			switch {
			case c == "" || n == 0:
				for len(stack) > 0 {
					b.WriteString(stack[len(stack)-1])
					stack = stack[:len(stack)-1]
				}
			case n == 1:
				push("<b>", "</b>")
			case n == 3:
				push("<i>", "</i>")
			case n == 4:
				push("<u>", "</u>")
			case n >= 30 && n <= 37:
				push(`<span style="color:`+ansiColors[n-30]+`">`, "</span>")
			case n >= 90 && n <= 97:
				push(`<span style="color:`+ansiColors[n-90+8]+`">`, "</span>")
			case n >= 40 && n <= 47:
				push(`<span style="background-color:`+ansiColors[n-40]+`">`, "</span>")
			}
		}
	}
	b.WriteString(html.EscapeString(s[last:]))
	for len(stack) > 0 {
		b.WriteString(stack[len(stack)-1])
		stack = stack[:len(stack)-1]
	}
	return b.String()
}
