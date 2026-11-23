package web

import (
	"bytes"
	"encoding/json"

	"errors"
	"fmt"
	"html/template"
	"net/http"
	"net/url"
	"strings"

	"github.com/ctrliq/ascender/internal/api"
	"github.com/ctrliq/ascender/internal/i18n"
)

// errEventSummary stands for the TypeErrors the old description builder
// caught: reading a summary field the entry did not carry.
var errEventSummary = errors.New("event summary not available")

// asDesc ports ActivityStreamDescription, keeping where it threw: an error
// inside buildAnchor fell back to the object's plain name, an error outside
// it (or in that fallback) to "Event summary not available".
type asDesc struct {
	loc     *i18n.Locale
	a       map[string]any
	summary map[string]any
	changes map[string]any
}

// list is activity.summary_fields[key]; nil stands for undefined.
func (d *asDesc) list(key string) ([]any, bool) {
	v, ok := d.summary[key]
	if !ok || v == nil {
		return nil, false
	}
	l, _ := v.([]any)
	return l, true
}

// at is activity.summary_fields[key][index], which threw when the key was
// missing and gave undefined (nil) past the end.
func (d *asDesc) at(key string, index int) (map[string]any, error) {
	l, ok := d.list(key)
	if !ok {
		return nil, errEventSummary
	}
	if index >= len(l) {
		return nil, nil
	}
	m, _ := l[index].(map[string]any)
	return m, nil
}

// named is the guarded named(): undefined when absent.
func (d *asDesc) named(key string, index int) map[string]any {
	l, _ := d.list(key)
	if index >= len(l) {
		return nil
	}
	m, _ := l[index].(map[string]any)
	return m
}

func jsTruthy(v any) bool {
	switch t := v.(type) {
	case nil, jsUnset:
		return false
	case string:
		return t != ""
	case bool:
		return t
	case float64:
		return t != 0
	case json.Number:
		f, _ := t.Float64()
		return f != 0
	}
	return true
}

func jsStr(v any) string {
	switch t := v.(type) {
	case nil:
		return ""
	case string:
		return t
	case json.Number:
		return t.String()
	case float64:
		if t == float64(int64(t)) {
			return fmt.Sprintf("%d", int64(t))
		}
		return fmt.Sprint(t)
	case bool:
		if t {
			return "true"
		}
		return "false"
	}
	return fmt.Sprint(v)
}

func jsOr(vals ...any) any {
	for _, v := range vals {
		if jsTruthy(v) {
			return v
		}
	}
	return vals[len(vals)-1]
}

// anchor is buildAnchor. obj nil is undefined: the fallback then threw too.
func (d *asDesc) anchor(obj map[string]any, resource string) (string, error) {
	fallback := func() (string, error) {
		if obj == nil {
			return "", errEventSummary
		}
		return "<span>" + template.HTMLEscapeString(jsStr(jsOr(obj["name"], obj["username"], ""))) + "</span>", nil
	}
	if _, ok := d.list(resource); !ok {
		return fallback()
	}
	var link string
	hasURL := true
	var name any
	id := func() (string, bool) {
		if obj == nil {
			return "", false
		}
		return jsStr(obj["id"]), true
	}
	switch resource {
	case "custom_inventory_script":
		v, ok := id()
		if !ok {
			return fallback()
		}
		link = "/inventory_scripts/" + v
	case "group":
		op := jsStr(d.a["operation"])
		if op == "create" || op == "delete" {
			inv, ok := d.changes["inventory"].(string)
			if !ok {
				return fallback()
			}
			parts := strings.Split(inv, "-")
			link = "/inventories/inventory/" + parts[len(parts)-1] + "/groups/" + jsStr(d.changes["id"]) + "/details"
		} else {
			inv, err := d.at("inventory", 0)
			if err != nil || inv == nil {
				return fallback()
			}
			link = "/inventories/inventory/" + jsStr(inv["id"]) + "/groups/" + jsStr(jsOr(d.changes["id"], d.changes["object1_pk"])) + "/details"
		}
	case "host", "job":
		v, ok := id()
		if !ok {
			return fallback()
		}
		link = "/" + resource + "s/" + v
	case "inventory":
		v, ok := id()
		if !ok {
			return fallback()
		}
		if obj["kind"] == "smart" {
			link = "/inventories/smart_inventory/" + v
		} else {
			link = "/inventories/inventory/" + v
		}
	case "schedule":
		v, ok := id()
		if !ok {
			return fallback()
		}
		parent := func(key string) (map[string]any, bool) {
			p, err := d.at(key, 0)
			return p, err == nil && p != nil
		}
		switch {
		case d.summary["job_template"] != nil:
			p, ok := parent("job_template")
			if !ok {
				return fallback()
			}
			link = "/templates/job_template/" + jsStr(p["id"]) + "/schedules/" + v
		case d.summary["workflow_job_template"] != nil:
			p, ok := parent("workflow_job_template")
			if !ok {
				return fallback()
			}
			link = "/templates/workflow_job_template/" + jsStr(p["id"]) + "/schedules/" + v
		case d.summary["project"] != nil:
			p, ok := parent("project")
			if !ok {
				return fallback()
			}
			link = "/projects/" + jsStr(p["id"]) + "/schedules/" + v
		case d.summary["system_job_template"] != nil:
			hasURL = false
		case d.summary["inventory_source"] != nil:
			p, ok := parent("inventory_source")
			if !ok {
				return fallback()
			}
			if jsTruthy(p["inventory_id"]) {
				link = "/inventories/inventory/" + jsStr(p["inventory_id"]) + "/sources/" + jsStr(p["id"]) + "/schedules/" + v
			} else {
				hasURL = false
			}
		default:
			return fallback()
		}
	case "setting":
		link = "/settings"
	case "notification_template":
		v, ok := id()
		if !ok {
			return fallback()
		}
		link = "/notification_templates/" + v
	case "role":
		return fallback()
	case "job_template", "workflow_job_template":
		v, ok := id()
		if !ok {
			return fallback()
		}
		link = "/templates/" + resource + "/" + v
	case "workflow_job_template_node":
		p, err := d.at("workflow_job_template", 0)
		if err != nil || p == nil {
			return fallback()
		}
		link = "/templates/workflow_job_template/" + jsStr(p["id"])
		name = p["name"]
	case "workflow_job":
		v, ok := id()
		if !ok {
			return fallback()
		}
		link = "/jobs/workflow/" + v
	case "label":
		hasURL = false
	case "inventory_source":
		v, ok := id()
		if !ok {
			return fallback()
		}
		parts := strings.Split(jsStr(obj["inventory"]), "-")
		link = "/inventories/inventory/" + parts[len(parts)-1] + "/sources/" + v + "/details"
	case "o_auth2_application":
		v, ok := id()
		if !ok {
			return fallback()
		}
		link = "/applications/" + v
	case "workflow_approval":
		wj, err := d.at("workflow_job", 0)
		if err != nil || wj == nil {
			return fallback()
		}
		wa, err := d.at("workflow_approval", 0)
		if err != nil || wa == nil {
			return fallback()
		}
		link = "/jobs/workflow/" + jsStr(wj["id"]) + "/output"
		name = jsStr(wj["name"]) + " | " + jsStr(wa["name"])
	case "workflow_approval_template":
		wf, err := d.at("workflow_job_template", 0)
		if err != nil || wf == nil {
			return fallback()
		}
		wt, err := d.at("workflow_approval_template", 0)
		if err != nil || wt == nil {
			return fallback()
		}
		link = "/templates/workflow_job_template/" + jsStr(wf["id"]) + "/visualizer"
		name = jsStr(wf["name"]) + " | " + jsStr(wt["name"])
	default:
		v, ok := id()
		if !ok {
			return fallback()
		}
		link = "/" + resource + "s/" + v
	}
	if obj == nil {
		// name || obj.name threw, and so did the fallback
		if !jsTruthy(name) {
			return "", errEventSummary
		}
	} else {
		name = jsOr(name, obj["name"], obj["username"])
	}
	text := ""
	if jsTruthy(name) {
		text = template.HTMLEscapeString(jsStr(name))
	}
	if hasURL {
		return `<a href="` + template.HTMLEscapeString(link) + `">` + text + `</a>`, nil
	}
	return "<span>" + text + "</span>", nil
}

func pastTense(s string) string {
	if strings.HasSuffix(s, "e") {
		return s + "d"
	}
	return s + "ed"
}

// describe is ActivityStreamDescription's sentence, as HTML. As there,
// only the approval outcomes and the fallback are translated.
func describeActivity(a map[string]any, loc *i18n.Locale) template.HTML {
	d := &asDesc{a: a, loc: loc}
	d.summary, _ = a["summary_fields"].(map[string]any)
	if d.summary == nil {
		d.summary = map[string]any{}
	}
	d.changes, _ = a["changes"].(map[string]any)
	if d.changes == nil {
		d.changes = map[string]any{}
	}
	out, err := d.sentence()
	if err != nil {
		return template.HTML("<span>" + template.HTMLEscapeString(loc.T("Event summary not available")) + "</span>")
	}
	return template.HTML("<span>" + out + "</span>")
}

func (d *asDesc) sentence() (string, error) {
	var links []string
	add := func(label, anchor string) {
		links = append(links, "<span>"+template.HTMLEscapeString(label)+" "+anchor+"</span>")
	}
	op := jsStr(d.a["operation"])
	obj1, obj2 := jsStr(d.a["object1"]), jsStr(d.a["object2"])
	groupPair := func() bool {
		l, _ := d.list("group")
		return obj1 == "group" && obj2 == "group" && len(l) > 1
	}
	// first(key) is summary_fields[key][0], read unguarded.
	first := func(key string) (map[string]any, error) { return d.at(key, 0) }
	roleField := func() (string, error) {
		r := d.named("role", 0)
		if r == nil {
			return "", errEventSummary
		}
		return jsStr(r["role_field"]), nil
	}
	// pair renders "<verb> <anchor(a)>" and "<joiner> <anchor(b)>" with the
	// given summary objects and resources.
	pair := func(l1 string, o1 map[string]any, r1 string, l2 string, o2 map[string]any, r2 string) error {
		a1, err := d.anchor(o1, r1)
		if err != nil {
			return err
		}
		add(l1, a1)
		a2, err := d.anchor(o2, r2)
		if err != nil {
			return err
		}
		add(l2, a2)
		return nil
	}
	switch jsStr(d.a["object_association"]) {
	case "role":
		o1, o2 := obj1, obj2
		if jsStr(d.a["object_type"]) == o1 {
			o1, o2 = obj2, obj1
		}
		joiner := map[string]string{"disassociate": "from", "associate": "to"}[op]
		if joiner == "" {
			break
		}
		if groupPair() {
			rf, err := roleField()
			// the label is built before buildAnchor runs
			a1, aerr := d.anchor(d.named("group", 1), o2)
			if aerr != nil {
				return "", aerr
			}
			add(pastTense(op), a1)
			if err != nil {
				return "", err
			}
			a2, aerr := d.anchor(d.named("group", 0), o1)
			if aerr != nil {
				return "", aerr
			}
			add(rf+" "+joiner, a2)
			break
		}
		s2, err := first(o2)
		if err != nil {
			return "", err
		}
		a1, err := d.anchor(s2, o2)
		if err != nil {
			return "", err
		}
		add(pastTense(op), a1)
		rf, err := roleField()
		if err != nil {
			return "", err
		}
		s1, err := first(o1)
		if err != nil {
			return "", err
		}
		a2, err := d.anchor(s1, o1)
		if err != nil {
			return "", err
		}
		add(rf+" "+joiner, a2)
	case "parents":
		switch op {
		case "disassociate":
			if groupPair() {
				if err := pair(pastTense(op)+" "+obj2, d.named("group", 1), obj2, "from "+obj1, d.named("group", 0), obj1); err != nil {
					return "", err
				}
				break
			}
			s2, err := first(obj2)
			if err != nil {
				return "", err
			}
			a1, err := d.anchor(s2, obj2)
			if err != nil {
				return "", err
			}
			add(pastTense(op), a1)
			rf, err := roleField()
			if err != nil {
				return "", err
			}
			s1, err := first(obj1)
			if err != nil {
				return "", err
			}
			a2, err := d.anchor(s1, obj1)
			if err != nil {
				return "", err
			}
			add(rf+" from", a2)
		case "associate":
			if groupPair() {
				if err := pair(pastTense(op)+" "+obj1, d.named("group", 0), obj1, "to "+obj2, d.named("group", 1), obj2); err != nil {
					return "", err
				}
				break
			}
			s2, err := first(obj2)
			if err != nil {
				return "", err
			}
			a1, err := d.anchor(s2, obj2)
			if err != nil {
				return "", err
			}
			add(pastTense(op), a1)
			rf, err := roleField()
			if err != nil {
				return "", err
			}
			s1, err := first(obj1)
			if err != nil {
				return "", err
			}
			a2, err := d.anchor(s1, obj1)
			if err != nil {
				return "", err
			}
			add(rf+" to", a2)
		}
	default:
		nodes := obj1 == "workflow_job_template_node" && obj2 == "workflow_job_template_node"
		switch op {
		case "disassociate", "associate":
			if groupPair() {
				var err error
				if op == "disassociate" {
					err = pair(pastTense(op)+" "+obj2, d.named("group", 1), obj2, "from "+obj1, d.named("group", 0), obj1)
				} else {
					err = pair(pastTense(op)+" "+obj1, d.named("group", 0), obj1, "to "+obj2, d.named("group", 1), obj2)
				}
				if err != nil {
					return "", err
				}
				break
			}
			if nodes {
				s1, err := first(obj1)
				if err != nil {
					return "", err
				}
				a, err := d.anchor(s1, obj1)
				if err != nil {
					return "", err
				}
				add(pastTense(op)+" two nodes on workflow", a)
				break
			}
			if op == "disassociate" {
				s2, err := first(obj2)
				if err != nil {
					return "", err
				}
				s1 := map[string]any(nil)
				a1, err := d.anchor(s2, obj2)
				if err != nil {
					return "", err
				}
				add(pastTense(op)+" "+obj2, a1)
				if s1, err = first(obj1); err != nil {
					return "", err
				}
				a2, err := d.anchor(s1, obj1)
				if err != nil {
					return "", err
				}
				add("from "+obj1, a2)
			} else {
				s1, err := first(obj1)
				if err != nil {
					return "", err
				}
				a1, err := d.anchor(s1, obj1)
				if err != nil {
					return "", err
				}
				add(pastTense(op)+" "+obj1, a1)
				s2, err := first(obj2)
				if err != nil {
					return "", err
				}
				a2, err := d.anchor(s2, obj2)
				if err != nil {
					return "", err
				}
				add("to "+obj2, a2)
			}
		case "delete", "create":
			a, err := d.anchor(d.changes, obj1)
			if err != nil {
				return "", err
			}
			add(pastTense(op)+" "+obj1, a)
		case "update":
			status, _ := d.changes["status"].([]any)
			if obj1 == "workflow_approval" && len(status) == 2 {
				loc := d.loc
				text := loc.T("updated")
				switch status[1] {
				case "successful":
					text = loc.T("approved")
				case "failed":
					timedOut, _ := d.changes["timed_out"].([]any)
					if len(timedOut) > 1 && timedOut[1] == true {
						text = loc.T("timed out")
					} else {
						text = loc.T("denied")
					}
				}
				s1, err := first(obj1)
				if err != nil {
					return "", err
				}
				a, err := d.anchor(s1, obj1)
				if err != nil {
					return "", err
				}
				add(text+" "+obj1, a)
				break
			}
			s1, err := first(obj1)
			if err != nil {
				return "", err
			}
			a, err := d.anchor(s1, obj1)
			if err != nil {
				return "", err
			}
			add(pastTense(op)+" "+obj1, a)
		}
	}
	return strings.Join(links, " "), nil
}

// activityActor is ActivityStreamListItem's "Initiated by".
func activityActor(a map[string]any, loc *i18n.Locale) template.HTML {
	actor, _ := dig(a, "summary_fields", "actor").(map[string]any)
	switch {
	case actor != nil && jsTruthy(actor["id"]):
		return template.HTML(`<a href="/users/` + template.HTMLEscapeString(jsStr(actor["id"])) + `/details">` + template.HTMLEscapeString(jsStr(actor["username"])) + `</a>`)
	case actor != nil:
		return template.HTML(template.HTMLEscapeString(loc.T("{0} (deleted)", "0", jsStr(actor["username"]))))
	}
	return template.HTML(template.HTMLEscapeString(loc.T("system")))
}

// activityTypeLabels are the type select's choices, in its groups.
var activityTypeGroups = []struct {
	Label   string
	Options [][2]string
}{
	{"Views", [][2]string{{"all", "Dashboard (all activity)"}, {"job", "Jobs"}, {"schedule", "Schedules"}, {"workflow_approval", "Workflow Approvals"}}},
	{"Resources", [][2]string{{"job_template,workflow_job_template,workflow_job_template_node", "Templates"}, {"credential", "Credentials"}, {"project", "Projects"}, {"inventory", "Inventories"}, {"host", "Hosts"}}},
	{"Access", [][2]string{{"organization", "Organizations"}, {"user", "Users"}, {"team", "Teams"}}},
	{"Administration", [][2]string{{"credential_type", "Credential Types"}, {"notification_template", "Notification Templates"}, {"instance", "Instances"}, {"instance_group", "Instance Groups"}, {"o_auth2_application,o_auth2_access_token", "Applications & Tokens"}, {"execution_environment", "Execution Environments"}}},
	{"Settings", [][2]string{{"setting", "Settings"}}},
}

func activityTypeLabel(t string) string {
	for _, g := range activityTypeGroups {
		for _, o := range g.Options {
			if o[0] == t {
				return o[1]
			}
		}
	}
	return t
}

var activitySearchKeys = []map[string]string{
	{"name": "Keyword", "key": "search"},
	{"name": "Initiated by (username)", "key": "actor__username__icontains"},
	{"name": "Time", "key": "timestamp", "date": "true"},
}

var activityFilterLabels = searchLabels(activitySearchKeys)

type activityRowView struct {
	Item        map[string]any
	Actor       template.HTML
	Description template.HTML
	Changes     string
	Rows        int
	Setting     map[string]any
}

func (u *UI) registerActivityStream(mux *http.ServeMux) {
	mux.HandleFunc("/activity_stream", u.protected(u.activityStream))
	mux.HandleFunc("/activity_stream/{$}", u.protected(u.activityStream))
}

func (u *UI) activityStream(w http.ResponseWriter, r *http.Request, uc *userContext) {
	p := u.newPage(r, uc, "Activity Stream")
	p.Nav = navigation(uc, "/activity_stream")
	q := r.URL.Query()
	typ := q.Get("type")
	if typ == "" {
		typ = "all"
	}
	// type is the page's own parameter, outside the list's namespace: it
	// becomes the object1/object2 filter and is not a search chip.
	q.Del("type")
	r2 := r.Clone(r.Context())
	r2.URL.RawQuery = q.Encode()
	defaults := url.Values{"order_by": {"-timestamp"}}
	if typ != "all" {
		defaults.Set("or__object1__in", typ)
		defaults.Set("or__object2__in", typ)
	}
	if err := u.listPage(r2, p, "activity_stream", "/api/v2/activity_stream/", defaults, activityFilterLabels); err != nil {
		u.api.Log.ErrorContext(r.Context(), "activity stream", "err", err)
	}
	if typ != "all" {
		// removing a chip keeps the type, which is outside the namespace
		if chips, ok := p.Data["filters"].([]filterChip); ok {
			for i := range chips {
				rq, _ := url.ParseQuery(strings.TrimPrefix(chips[i].RemoveQuery, "?"))
				rq.Set("type", typ)
				chips[i].RemoveQuery = "?" + rq.Encode()
			}
		}
	}
	p.Data["searchKeys"] = activitySearchKeys
	p.Data["type"] = typ
	p.Data["typeLabel"] = activityTypeLabel(typ)
	p.Data["typeGroups"] = activityTypeGroups
	// The changes keep the API's key order for the detail modal, as
	// JSON.stringify did with the parsed response.
	var ordered []any
	if raw, ok := p.Data["raw"].([]byte); ok {
		if v, err := api.DecodeOrdered(string(raw)); err == nil {
			if o, ok := v.(*api.OMap); ok {
				if res, ok := o.Get("results"); ok {
					ordered, _ = res.([]any)
				}
			}
		}
	}
	var rows []activityRowView
	if list, ok := p.Data["results"].([]any); ok {
		for i, it := range list {
			m, _ := it.(map[string]any)
			v := activityRowView{Item: m, Actor: activityActor(m, p.Loc), Description: describeActivity(m, p.Loc)}
			if ch, ok := m["changes"]; ok && ch != nil {
				var b []byte
				if i < len(ordered) {
					if o, ok := ordered[i].(*api.OMap); ok {
						oc, _ := o.Get("changes")
						b = jsonNoEscape(oc)
					}
				}
				if b == nil {
					b = jsonNoEscape(ch)
				}
				v.Changes = string(b)
				if cm, ok := ch.(map[string]any); ok {
					v.Rows = len(cm) + 2
				} else {
					v.Rows = 2
				}
				if v.Rows < 6 {
					v.Rows = 6
				}
			}
			if s, ok := dig(m, "summary_fields", "setting").([]any); ok && len(s) > 0 {
				v.Setting, _ = s[0].(map[string]any)
			}
			rows = append(rows, v)
		}
	}
	p.Data["rows"] = rows
	// the detail modal's changes viewer
	p.Data["editor"] = true
	u.render(w, r, "activity_stream", p)
}

// jsonNoEscape is JSON.stringify: compact, with <, > and & left alone.
func jsonNoEscape(v any) []byte {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(v); err != nil {
		return nil
	}
	return bytes.TrimRight(buf.Bytes(), "\n")
}
