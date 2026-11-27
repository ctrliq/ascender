// Package web renders the user interface with Go templates. The pages
// reproduce the PatternFly markup of the old React application so the
// stylesheets it shipped apply unchanged, and every page is built from the
// same REST API the old UI consumed, called in-process.
package web

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"html/template"
	"io/fs"
	"math"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"runtime/debug"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"
	"unicode/utf8"

	"github.com/microcosm-cc/bluemonday"

	"github.com/ctrliq/ascender/internal/api"
	"github.com/ctrliq/ascender/internal/auth"
	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/i18n"
	"github.com/ctrliq/ascender/internal/icons"
	"github.com/ctrliq/ascender/internal/models"
	"github.com/ctrliq/ascender/internal/tmplws"
)

// UI is the web interface.
type UI struct {
	api *api.Server

	// mu serialises parsing; pages holds the parsed set, read without
	// the lock.
	mu    sync.Mutex
	pages atomic.Pointer[map[string]*template.Template]
	// templateDir, when set, reloads templates from disk whenever a file
	// under it changes.
	templateDir string
	// templateStamp is the newest modification time and file count seen
	// under templateDir when pages were last parsed.
	templateStamp string
	templateFS    fs.FS
	// staticFS is the static directory in development, served as it
	// changes; static is the embedded copy otherwise, with its ETags
	// computed once.
	staticFS http.FileSystem
	static   *staticFiles
	// staticTree is the embedded static tree, read for files the pages
	// use as data (media/default.strings.json).
	staticTree fs.FS
	// localized holds the pages' per-language clones.
	localized localizedPages
	// docs is the documentation site, nil when ASCENDER_DOCS_DIR is not
	// set.
	docs *docs
}

// New builds the UI. Static assets come from the directory in the config
// (development) or the copy embedded in the binary.
func New(s *api.Server, static fs.FS, templates fs.FS) (*UI, error) {
	u := &UI{api: s, templateDir: s.Cfg.TemplateDir, templateFS: templates, staticTree: static}
	if s.Cfg.StaticDir != "" {
		u.staticFS = http.Dir(s.Cfg.StaticDir)
	} else {
		files, err := newStaticFiles(static)
		if err != nil {
			return nil, err
		}
		u.static = files
	}
	if _, err := u.templates(); err != nil {
		return nil, err
	}
	if s.Cfg.DocsDir != "" {
		u.docs = newDocs(u, s.Cfg.DocsDir)
	}
	return u, nil
}

func (u *UI) funcs() template.FuncMap {
	fm := u.baseFuncs()
	// English until localizedPage binds a page's language.
	for k, v := range localeFuncs(i18n.New(i18n.Default)) {
		fm[k] = v
	}
	return fm
}

// aboutBrand is the About modal's product name: BRAND_NAME of
// static/media/default.strings.json, which the old About read
// (useBrandName) and an installation may replace.
func (u *UI) aboutBrand() string {
	var b []byte
	var err error
	if u.api.Cfg.StaticDir != "" {
		b, err = os.ReadFile(filepath.Join(u.api.Cfg.StaticDir, "media", "default.strings.json"))
	} else if u.staticTree != nil {
		b, err = fs.ReadFile(u.staticTree, "media/default.strings.json")
	}
	if err != nil || b == nil {
		return ""
	}
	var v struct {
		BrandName string `json:"BRAND_NAME"`
	}
	if json.Unmarshal(b, &v) != nil {
		return ""
	}
	return v.BrandName
}

// aboutText is the About modal's cow, saying the product and its version
// in a speech bubble, as About's createSpeechBubble drew it: a brand other
// than Ascender's is the subscription product, called Controller.
func aboutText(brand, version string) string {
	text := ""
	if brand != "" {
		if strings.Contains(brand, "Ascender") {
			text = brand + " " + version
		} else {
			text = brand + " Controller " + version
		}
	}
	n := utf8.RuneCountInString(text)
	bubble := " __" + strings.Repeat("_", n) + "__ \n" + "<  " + text + "  >\n" + " --" + strings.Repeat("-", n) + "-- "
	return bubble + "\n          \\\n          \\   ^__^\n              (oo)\\_______\n              (__)      A )\\\n                  ||----w |\n                  ||     ||\n                    "
}

func (u *UI) baseFuncs() template.FuncMap {
	return template.FuncMap{
		"aboutBrand": u.aboutBrand,
		"aboutText":  aboutText,
		"thisYear":   func() int { return time.Now().Year() },
		"icon":       iconHTML,
		"iconStyled": iconStyledHTML,
		"chipGroups": chipGroups,
		"iconClassed": func(name, cls string) template.HTML {
			return template.HTML(strings.Replace(string(iconHTML(name)), `class="pf-v6-svg"`, `class="pf-v6-svg `+template.HTMLEscapeString(cls)+`"`, 1))
		},
		// safeCSS passes a literal style from a template.
		"safeCSS": func(s string) template.CSS { return template.CSS(s) },
		// safeAttr passes a literal attribute string from a template.
		"safeAttr": func(s string) template.HTMLAttr { return template.HTMLAttr(s) },
		// safeURL lets an image data URL (a custom logo) through as an src.
		"safeURL": func(s string) template.URL {
			if strings.HasPrefix(s, "data:image/") || strings.HasPrefix(s, "/") || strings.HasPrefix(s, "https://") || strings.HasPrefix(s, "http://") {
				return template.URL(s)
			}
			return template.URL("#")
		},
		// nodeSymbol is NODE_TYPE_SYMBOL_KEY.
		"nodeSymbol": func(t string) string {
			return map[string]string{"hop": "h", "execution": "Ex", "hybrid": "Hy", "control": "C"}[t]
		},
		"dig": dig,
		"str": str,
		"num": num,
		"has": has,
		// hasKey reports whether an API object carries a field at all, empty or not.
		"hasKey":   func(m map[string]any, k string) bool { _, ok := m[k]; return ok },
		"add":      func(a, b int) int { return a + b },
		"sub":      func(a, b int) int { return a - b },
		"userType": func(u any) string { m, _ := u.(map[string]any); return userType(m) },
		// userIsSysAdmin is the System Administrator check of the roles tabs.
		"userIsSysAdmin": func(results any) bool {
			list, _ := results.([]any)
			for _, it := range list {
				if m, ok := it.(map[string]any); ok && str(m["name"]) == "System Administrator" {
					return true
				}
			}
			return false
		},
		// roleResourceHref is UserRolesList's detailUrl for a role's object.
		"roleResourceHref": func(sf any) string {
			t, id := str(dig(sf, "resource_type")), str(dig(sf, "resource_id"))
			switch {
			case strings.Contains(t, "template"):
				return "/templates/" + t + "/" + id + "/details"
			case strings.Contains(t, "inventory"):
				return "/inventories/" + t + "/" + id + "/details"
			}
			return "/" + t + "s/" + id + "/details"
		},
		"lower": strings.ToLower,
		"json": func(v any) template.JS {
			b, _ := json.Marshal(v)
			return template.JS(b)
		},
		"attr": func(s string) template.HTMLAttr { return template.HTMLAttr(s) },
		"safe": func(s string) template.HTML { return template.HTML(s) },
		// esc escapes a value placed inside markup that safe then trusts.
		"esc":       func(v any) string { return template.HTMLEscapeString(str(v)) },
		"titleCase": toTitleCase,
		"eePull":    eePullLabel,
		// sliderPct is Slider's --pf-v6-c-slider--value for a 0..1 value:
		// ((value - min) * 100) / (max - min), printed as JavaScript does.
		"sliderPct": func(v any) string {
			f, _ := strconv.ParseFloat(str(v), 64)
			return strconv.FormatFloat(f*100/1, 'f', -1, 64)
		},
		// jsNum prints a decimal string as a JavaScript Number would.
		"jsNum": func(v any) string {
			f, _ := strconv.ParseFloat(str(v), 64)
			return strconv.FormatFloat(f, 'f', -1, 64)
		},
		// usedPct is Math.round(100 - percent_capacity_remaining).
		"usedPct": func(v any) int {
			f, _ := strconv.ParseFloat(str(v), 64)
			return int(math.Floor(100 - f + 0.5))
		},
		"query":    setQuery,
		"queryset": setQueries,
		"pick": func(c bool, a, b any) any {
			if c {
				return a
			}
			return b
		},
		"cond": func(c bool, a, b string) string {
			if c {
				return a
			}
			return b
		},
		"dt":             formatDateTime,
		"frequencies":    func() []string { return scheduleFrequencies },
		"frequencyLabel": func(f string) string { return frequencyLabels[f] },
		"weekdays":       func() []string { return weekdayCodes },
		"weekdayShort":   func(c string) string { return weekdayShort[c] },
		"weekdayLabel":   func(c string) string { return weekdayLabels[c] },
		"months":         func() [][2]string { return monthChoices },
		"occurrences":    func() [][2]string { return occurrenceChoices },
		"runOnDays":      func() [][2]string { return runOnDays },
		"statusLabel":    statusLabel,
		"statusIcon":     statusIconHTML,
		"statusIconSVG":  statusIconSVG,
		"jobSegment":     jobTypeSegment,
		"jobCollection": func(t string) string {
			if c := jobAPIPath(jobTypeSegment(t)); c != "" {
				return c
			}
			return "unified_jobs"
		},
		"jobTypeLabel":  jobTypeLabel,
		"jobName":       jobDisplayName,
		"credKindLabel": credKindLabel,
		// credKindIsMessage: the credKindLabel results CredentialChip
		// translated ("Cloud", "GPG Public Key"); the rest are not.
		"credKindIsMessage": func(label string) bool { return label == "Cloud" || label == "GPG Public Key" },
		"credLinks": func(v any) []map[string]any {
			items, _ := v.([]any)
			out := make([]map[string]any, 0, len(items))
			for _, it := range items {
				if m, ok := it.(map[string]any); ok {
					c := map[string]any{}
					for k, val := range m {
						c[k] = val
					}
					c["_href"] = "/credentials/" + str(m["id"]) + "/details"
					out = append(out, c)
				}
			}
			return out
		},
		"igLinks": func(v any) []map[string]any {
			items, _ := v.([]any)
			out := make([]map[string]any, 0, len(items))
			for _, it := range items {
				if m, ok := it.(map[string]any); ok {
					seg := "instance_groups"
					if m["is_container_group"] == true {
						seg = "instance_groups/container_group"
					}
					out = append(out, map[string]any{"id": m["id"], "name": m["name"], "_href": "/" + seg + "/" + str(m["id"]) + "/details"})
				}
			}
			return out
		},
		"launchedByHref": func(lb map[string]any) string {
			id := str(lb["id"])
			switch str(lb["type"]) {
			case "user":
				return "/users/" + id + "/details"
			case "schedule":
				return "/schedules/" + id + "/details"
			case "job_template":
				return "/templates/job_template/" + id + "/details"
			case "workflow_job_template":
				return "/templates/workflow_job_template/" + id + "/details"
			case "project":
				return "/projects/" + id + "/details"
			case "inventory":
				return "/inventories/inventory/" + id + "/details"
			}
			return "#"
		},
		"isJSON":   isJSONObjectString,
		"upper":    strings.ToUpper,
		"scmLabel": scmLabel,
		"pluralize": func(n int, one, many string) string {
			if n == 1 {
				return one
			}
			return many
		},
		"list":   func(items ...any) []any { return items },
		"append": func(l []any, v any) []any { return append(l, v) },
		"dict": func(kv ...any) map[string]any {
			m := map[string]any{}
			for i := 0; i+1 < len(kv); i += 2 {
				m[fmt.Sprint(kv[i])] = kv[i+1]
			}
			return m
		},
		// searchOptions is a search key's option list; queryHas says whether
		// the page's query has the value for a list's search key.
		"searchOptions": func(name string) [][2]string { return searchOptions[name] },
		"queryHas": func(q url.Values, ns, key, value string) bool {
			if ns != "" {
				key = ns + "." + key
			}
			for _, v := range q[key] {
				if v == value {
					return true
				}
			}
			return false
		},
		"hasPrefix":   strings.HasPrefix,
		"trimPrefix":  strings.TrimPrefix,
		"replaceOnce": func(s, old, new string) string { return strings.Replace(s, old, new, 1) },
		"join":        strings.Join,
		"split":       strings.Split,
		"urlquery":    url.QueryEscape,
	}
}

// templates parses the layouts, partials and pages. Each page gets its own
// template set cloned from the shared layouts so every page can define
// "content" without clashing. The embedded set is parsed once; a set read
// from templateDir is checked for changes on every call.
func (u *UI) templates() (map[string]*template.Template, error) {
	if pages := u.pages.Load(); pages != nil && u.templateDir == "" {
		return *pages, nil
	}
	u.mu.Lock()
	defer u.mu.Unlock()
	var root fs.FS = u.templateFS
	stamp := ""
	if u.templateDir != "" {
		root = os.DirFS(u.templateDir)
		// Parsing every page takes about half a second: do it only when
		// a template was edited, added or removed.
		stamp = templateStamp(root)
		if pages := u.pages.Load(); pages != nil && stamp == u.templateStamp {
			return *pages, nil
		}
	} else if pages := u.pages.Load(); pages != nil {
		return *pages, nil
	}
	base := template.New("").Funcs(u.funcs())
	base, err := parseTemplates(base, root, "layouts/base.html", "partials/*.html")
	if err != nil {
		return nil, fmt.Errorf("parse layouts: %w", err)
	}
	pages := map[string]*template.Template{}
	entries, err := fs.ReadDir(root, "pages")
	if err != nil {
		return nil, fmt.Errorf("read pages: %w", err)
	}
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".html") {
			continue
		}
		name := strings.TrimSuffix(e.Name(), ".html")
		t, err := base.Clone()
		if err != nil {
			return nil, err
		}
		files := []string{"pages/" + e.Name()}
		if name != "login" {
			files = append([]string{"layouts/app.html"}, files...)
		}
		if t, err = parseTemplates(t, root, files...); err != nil {
			return nil, fmt.Errorf("parse page %s: %w", name, err)
		}
		pages[name] = t
	}
	u.templateStamp = stamp
	u.pages.Store(&pages)
	return pages, nil
}

// parseTemplates is template.ParseFS with JSX's whitespace rule applied to
// each file (see package tmplws), so markup may be split over indented lines.
func parseTemplates(t *template.Template, root fs.FS, patterns ...string) (*template.Template, error) {
	for _, pattern := range patterns {
		names, err := fs.Glob(root, pattern)
		if err != nil {
			return nil, err
		}
		if len(names) == 0 {
			return nil, fmt.Errorf("template: pattern matches no files: %#q", pattern)
		}
		for _, name := range names {
			b, err := fs.ReadFile(root, name)
			if err != nil {
				return nil, err
			}
			if _, err := t.New(path.Base(name)).Parse(tmplws.Collapse(string(b))); err != nil {
				return nil, err
			}
		}
	}
	return t, nil
}

// templateStamp summarises a template tree: its file count and newest
// modification time.
func templateStamp(root fs.FS) string {
	var n int
	var newest time.Time
	_ = fs.WalkDir(root, ".", func(_ string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		if info, err := d.Info(); err == nil {
			n++
			if info.ModTime().After(newest) {
				newest = info.ModTime()
			}
		}
		return nil
	})
	return fmt.Sprintf("%d/%d", n, newest.UnixNano())
}

// iconHTML renders an icon exactly as @patternfly/react-icons did.
func iconHTML(name string) template.HTML { return icons.HTML(name, "", "") }

// iconClassHTML is iconHTML with another class on the svg, as an icon given
// a className has.
func iconClassHTML(name, class string) template.HTML { return icons.HTML(name, class, "") }

// iconStyledHTML is iconHTML with an inline style on the svg, for icons
// given a style prop (the topology legend's).
func iconStyledHTML(name, style string) template.HTML { return icons.HTML(name, "", style) }

// dig walks nested maps safely, returning nil when any step is missing.
func dig(v any, keys ...string) any {
	for _, k := range keys {
		m, ok := v.(map[string]any)
		if !ok {
			return nil
		}
		v, ok = m[k]
		if !ok {
			return nil
		}
	}
	return v
}

func str(v any) string {
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
		return fmt.Sprintf("%v", t)
	case bool:
		if t {
			return "true"
		}
		return "false"
	}
	return fmt.Sprint(v)
}

func num(v any) int {
	switch t := v.(type) {
	case float64:
		return int(t)
	case int:
		return t
	case int64:
		return int(t)
	case json.Number:
		i, _ := t.Int64()
		return int(i)
	}
	return 0
}

func has(v any) bool {
	switch t := v.(type) {
	case nil:
		return false
	case string:
		return t != ""
	case bool:
		return t
	case float64:
		return true
	case []any:
		return len(t) > 0
	case map[string]any:
		return len(t) > 0
	}
	return true
}

// setQuery returns the current query string with one parameter replaced.
func setQuery(q url.Values, key, value string) string {
	c := url.Values{}
	for k, v := range q {
		c[k] = v
	}
	if value == "" {
		c.Del(key)
	} else {
		c.Set(key, value)
	}
	if len(c) == 0 {
		return ""
	}
	return "?" + c.Encode()
}

// setQueries applies several key/value replacements; an empty value deletes.
func setQueries(q url.Values, kv ...string) string {
	c := url.Values{}
	for k, v := range q {
		c[k] = v
	}
	for i := 0; i+1 < len(kv); i += 2 {
		if kv[i+1] == "" {
			c.Del(kv[i])
		} else {
			c.Set(kv[i], kv[i+1])
		}
	}
	if len(c) == 0 {
		return ""
	}
	return "?" + c.Encode()
}

// formatDateTime renders a timestamp for the browser to localise.
func formatDateTime(v any) template.HTML {
	s := str(v)
	if s == "" {
		return ""
	}
	t, err := time.Parse(time.RFC3339Nano, s)
	if err != nil {
		return template.HTML(template.HTMLEscapeString(s))
	}
	return template.HTML(fmt.Sprintf(`<span class="ascender-datetime" data-datetime="%s">%s</span>`, template.HTMLEscapeString(s), template.HTMLEscapeString(t.UTC().Format("1/2/2006, 3:04:05 PM"))))
}

// statusLabel maps a job/template status to its label colour and text.
func statusLabel(status string) map[string]string {
	m := map[string]map[string]string{
		"successful":    {"color": "green", "text": "Successful", "icon": "check-circle"},
		"ok":            {"color": "green", "text": "OK", "icon": "check-circle"},
		"failed":        {"color": "red", "text": "Failed", "icon": "exclamation-circle"},
		"error":         {"color": "red", "text": "Error", "icon": "exclamation-circle"},
		"canceled":      {"color": "orange", "text": "Canceled", "icon": "exclamation-triangle"},
		"changed":       {"color": "orange", "text": "Changed", "icon": "exclamation-triangle"},
		"skipped":       {"color": "blue", "text": "Skipped", "icon": "minus-circle"},
		"running":       {"color": "blue", "text": "Running", "icon": "sync-alt"},
		"pending":       {"color": "blue", "text": "Pending", "icon": "clock"},
		"waiting":       {"color": "grey", "text": "Waiting", "icon": "clock"},
		"new":           {"color": "grey", "text": "New", "icon": "clock"},
		"never updated": {"color": "grey", "text": "Never updated", "icon": "minus-circle"},
		"missing":       {"color": "red", "text": "Missing", "icon": "exclamation-circle"},
		"disabled":      {"color": "grey", "text": "Disabled", "icon": "minus-circle"},
		"success":       {"color": "green", "text": "Success", "icon": "check-circle"},
		"syncing":       {"color": "blue", "text": "Syncing", "icon": "sync-alt"},
		"unreachable":   {"color": "red", "text": "Unreachable", "icon": "exclamation-circle"},
		// Workflow approvals (WorkflowApprovalUtils.getStatus).
		"approved": {"color": "green", "text": "Approved", "icon": "check-circle"},
		"denied":   {"color": "red", "text": "Denied", "icon": "info-circle"},
		"timedOut": {"color": "red", "text": "Timed out", "icon": ""},
		// Instance node states.
		"ready":            {"color": "green", "text": "Ready", "icon": "check-circle"},
		"installed":        {"color": "blue", "text": "Installed", "icon": "clock"},
		"provisioning":     {"color": "grey", "text": "Provisioning", "icon": "plus-circle"},
		"deprovisioning":   {"color": "grey", "text": "Deprovisioning", "icon": "minus-circle"},
		"unavailable":      {"color": "red", "text": "Unavailable", "icon": "exclamation-circle"},
		"provision-fail":   {"color": "red", "text": "Provisioning fail", "icon": "exclamation-circle"},
		"deprovision-fail": {"color": "red", "text": "Deprovisioning fail", "icon": "exclamation-circle"},
	}
	if l, ok := m[status]; ok {
		return l
	}
	return map[string]string{"color": "grey", "text": api.Title(status), "icon": "clock"}
}

// jobTypeSegment maps a unified job type to the segment of its UI route.
func jobTypeSegment(t string) string {
	switch t {
	case "job":
		return "playbook"
	case "ad_hoc_command":
		return "command"
	case "project_update":
		return "project"
	case "inventory_update":
		return "inventory"
	case "workflow_job":
		return "workflow"
	case "system_job":
		return "management"
	}
	return t
}

var statusIconColors = map[string]string{
	"success": "--pf-t--global--color--status--success--default", "successful": "--pf-t--global--color--status--success--default", "healthy": "--pf-t--global--color--status--success--default", "ok": "--pf-t--global--color--status--success--default",
	"failed": "--pf-t--global--color--status--danger--default", "error": "--pf-t--global--color--status--danger--default", "unreachable": "--pf-t--global--color--status--danger--default",
	"running": "--ascender-status-running-color", "pending": "--pf-t--global--color--brand--default", "skipped": "--pf-t--global--color--brand--default",
	"waiting": "--pf-t--global--text--color--300", "disabled": "--pf-t--global--text--color--300", "canceled": "--ascender-status-canceled-color", "changed": "--ascender-status-canceled-color",
}

var statusIconNames = map[string]string{
	"success": "check-circle", "successful": "check-circle", "healthy": "check-circle", "ok": "check-circle", "approved": "check-circle",
	"failed": "exclamation-circle", "error": "exclamation-circle", "unreachable": "exclamation-circle", "denied": "info-circle",
	"running": "sync-alt", "pending": "clock", "waiting": "clock", "disabled": "minus-circle", "skipped": "minus-circle", "canceled": "exclamation-triangle", "changed": "exclamation-triangle",
}

// statusIconSVG is the icon of a status: RunningIcon, for running, is the
// sync-alt icon with the class that turns it.
func statusIconSVG(status, name string) template.HTML {
	if status == "running" {
		return iconClassHTML(name, "ascender-running-icon")
	}
	return iconHTML(name)
}

// statusIconHTML renders the StatusIcon component of the old UI.
func statusIconHTML(status string) template.HTML {
	color, ok := statusIconColors[status]
	if !ok {
		color = "--pf-v6-chart-global--Fill--Color--500"
	}
	inner := ""
	if name := statusIconNames[status]; name != "" {
		inner = fmt.Sprintf(`<div style="color: var(%s);">%s</div>`, color, statusIconSVG(status, name))
	}
	e := template.HTMLEscapeString(status)
	return template.HTML(fmt.Sprintf(`<div data-job-status="%s" aria-label="%s">%s<span class="pf-v6-screen-reader"> %s </span></div>`, e, e, inner, e))
}

// isJSONObjectString reports whether a variables value is a JSON object, which
// is what decides the editor's initial mode.
func isJSONObjectString(v any) bool {
	var out any
	if err := json.Unmarshal([]byte(str(v)), &out); err != nil {
		return false
	}
	_, ok := out.(map[string]any)
	return ok
}

func scmLabel(t string) string {
	switch t {
	case "git":
		return "Git"
	case "svn":
		return "Subversion"
	case "archive":
		return "Remote Archive"
	case "insights":
		return "Red Hat Insights"
	case "":
		return "Manual"
	}
	return t
}

// apiResult is the decoded response of an in-process API call.
type apiResult struct {
	Status int
	Data   map[string]any
	List   []any
	Raw    []byte
}

// notFoundResult is the API's answer for an object that does not exist.
func notFoundResult() *apiResult {
	raw := []byte(`{"detail":"Not found."}`)
	return &apiResult{Status: http.StatusNotFound, Data: map[string]any{"detail": "Not found."}, Raw: raw}
}

// apiCall performs a request against the API in-process as the signed-in
// user, so the UI sees exactly what an API client sees.
func (u *UI) apiCall(r *http.Request, method, path string, body any) (*apiResult, error) {
	// Handlers build the path from the page's own path values, which the
	// router has unescaped: a space, CR or LF in one would make the
	// request line say more than the path (headers of its own, an
	// Authorization among them), and a stray % would not parse. Such a
	// path is no object: the API's 404.
	if strings.IndexFunc(path, func(c rune) bool { return c <= ' ' || c == 0x7f }) >= 0 {
		return notFoundResult(), nil
	}
	if _, err := url.ParseRequestURI(path); err != nil || !strings.HasPrefix(path, "/") {
		return notFoundResult(), nil
	}
	var reader *bytes.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		reader = bytes.NewReader(b)
	} else {
		reader = bytes.NewReader(nil)
	}
	req := httptest.NewRequest(method, path, reader)
	req = req.WithContext(r.Context())
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Host = r.Host
	rec := httptest.NewRecorder()
	u.api.Routes().ServeHTTP(rec, req)
	res := &apiResult{Status: rec.Code, Raw: rec.Body.Bytes()}
	if len(res.Raw) > 0 && strings.HasPrefix(rec.Header().Get("Content-Type"), "application/json") {
		dec := json.NewDecoder(bytes.NewReader(res.Raw))
		var v any
		if err := dec.Decode(&v); err == nil {
			switch t := v.(type) {
			case map[string]any:
				res.Data = t
			case []any:
				res.List = t
			}
		}
	}
	return res, nil
}

// userContext is what every page knows about the signed-in user.
type userContext struct {
	User                *auth.User
	Me                  map[string]any
	IsOrgAdmin          bool
	IsNotificationAdmin bool
	IsExecEnvAdmin      bool
	Theme               string
}

func (u *UI) loadUserContext(r *http.Request, user *auth.User) *userContext {
	ctx := r.Context()
	uc := &userContext{User: user}
	if res, err := u.apiCall(r, "GET", "/api/v2/me/", nil); err == nil && res.Status == 200 {
		if results, ok := res.Data["results"].([]any); ok && len(results) > 0 {
			uc.Me, _ = results[0].(map[string]any)
		}
	}
	if uc.Me != nil {
		uc.Theme = str(uc.Me["preferred_theme"])
	}
	if user.IsSuperuser || user.IsSystemAuditor {
		uc.IsOrgAdmin, uc.IsNotificationAdmin, uc.IsExecEnvAdmin = true, true, true
		return uc
	}
	orgCT := u.api.CT.ID("main.organization")
	if ids, err := models.OrganizationsAdministered(ctx, u.api.Q(), user.ID, orgCT); err == nil && len(ids) > 0 {
		uc.IsOrgAdmin = true
	}
	// Both flags in one query; on an error both stay false (they only
	// decide which UI controls show).
	var notif, ee int
	_ = u.api.Q().QueryRow(ctx, `SELECT count(*) FILTER (WHERE a.role_field = 'notification_admin_role'), count(*) FILTER (WHERE a.role_field = 'execution_environment_admin_role')
		FROM main_rbac_role_ancestors a JOIN main_rbac_roles_members m ON m.role_id = a.ancestor_id
		WHERE m.user_id = $1 AND a.content_type_id = $2 AND a.role_field IN ('notification_admin_role', 'execution_environment_admin_role')`, user.ID, orgCT).Scan(&notif, &ee)
	uc.IsNotificationAdmin = notif > 0
	uc.IsExecEnvAdmin = ee > 0
	return uc
}

// page is the data every template receives.
type page struct {
	Title       string
	BrandName   string
	CustomTitle string
	HeaderLogo  string
	Path        string
	Query       url.Values
	CSRF        string
	// Nonce marks the page's inline scripts for its content security
	// policy.
	Nonce   string
	Version string
	UC      *userContext
	// Loc is the page's language.
	Loc *i18n.Locale
	Nav []navGroup
	// Screen-specific data.
	Data map[string]any
	// Errors from a failed form post, keyed by field.
	Errors map[string][]string
	// Flash is a one-line message shown at the top of the page.
	Flash string
	// SessionTimeout is the idle timeout in seconds for the warning modal.
	SessionTimeout int
	// Status, when set, is the response's status (a 404 or 401 page).
	// render writes it after the headers and the CSRF cookie.
	Status int
	// Body is the rendered "body" template, which base.html lays out;
	// scripts are the page scripts it calls for (scriptsFor).
	Body    template.HTML
	scripts map[string]bool
}

// Themes lists the shipped stylesheets for the theme menu, in display order.
var Themes = []struct {
	ID, Name string
	Dark     bool
}{
	{"awx", "Classic", false}, {"dark", "Dark", true}, {"default", "Default", true}, {"light", "Light", false},
}

// DeleteNouns is the translated noun, one and many, that search_toolbar's
// delete button names its items with (data-delete-noun and -nouns, for
// app.js's "Delete {pluralizedItemName}?" and permission tooltip). kind is
// the template's English noun ("Host"); plural, when given, its plural,
// otherwise made by English rules. A language without the singular uses
// its plural for both, as the old UI only ever named the plural.
func (p *page) DeleteNouns(kind, plural string) [2]string {
	if plural == "" {
		plural = englishPlural(kind)
	}
	one, many := p.Loc.T(kind), p.Loc.T(plural)
	if p.Loc != nil && p.Loc.Lang != i18n.Default && !p.Loc.Has(kind) && p.Loc.Has(plural) {
		one = many
	}
	return [2]string{one, many}
}

// englishPlural is the plural app.js made of a kind: "Inventory" to
// "Inventories", "Host" to "Hosts"; a kind already plural stays.
func englishPlural(kind string) string {
	switch {
	case kind == "" || strings.HasSuffix(kind, "s"):
		return kind
	case strings.HasSuffix(kind, "y") && !strings.HasSuffix(kind, "ay") && !strings.HasSuffix(kind, "ey"):
		return kind[:len(kind)-1] + "ies"
	}
	return kind + "s"
}

// ThemeList exposes the themes to templates.
func (p *page) ThemeList() []struct {
	ID, Name string
	Dark     bool
} {
	return Themes
}

type navGroup struct {
	ID     string
	Title  string
	Routes []navRoute
	// Current is set when one of the routes matches the page.
	Current bool
}

type navRoute struct {
	Title   string
	Path    string
	Current bool
}

// navigation reproduces routeConfig.tsx, including which entries each
// kind of user sees.
func navigation(uc *userContext, current string) []navGroup {
	groups := []navGroup{
		{ID: "views_group", Title: "Views", Routes: []navRoute{{"Dashboard", "/home", false}, {"Jobs", "/jobs", false}, {"Schedules", "/schedules", false}, {"Activity Stream", "/activity_stream", false}, {"Workflow Approvals", "/workflow_approvals", false}, {"Host Metrics", "/host_metrics", false}}},
		{ID: "resources_group", Title: "Resources", Routes: []navRoute{{"Labels", "/labels", false}, {"Templates", "/templates", false}, {"Credentials", "/credentials", false}, {"Projects", "/projects", false}, {"Inventories", "/inventories", false}, {"Hosts", "/hosts", false}}},
		{ID: "access_group", Title: "Access", Routes: []navRoute{{"Organizations", "/organizations", false}, {"Users", "/users", false}, {"Teams", "/teams", false}}},
		{ID: "administration_group", Title: "Administration", Routes: []navRoute{{"Credential Types", "/credential_types", false}, {"Notifications", "/notification_templates", false}, {"Management Jobs", "/management_jobs", false}, {"Instance Groups", "/instance_groups", false}, {"Instances", "/instances", false}, {"Applications", "/applications", false}, {"Execution Environments", "/execution_environments", false}, {"Topology View", "/topology_view", false}}},
		{ID: "settings", Title: "Settings", Routes: []navRoute{{"Settings", "/settings", false}}},
	}
	drop := func(name string) {
		for gi := range groups {
			var keep []navRoute
			for _, rt := range groups[gi].Routes {
				if !strings.Contains(rt.Path, name) {
					keep = append(keep, rt)
				}
			}
			groups[gi].Routes = keep
		}
	}
	dropGroup := func(id string) {
		var keep []navGroup
		for _, g := range groups {
			if !strings.Contains(g.ID, id) {
				keep = append(keep, g)
			}
		}
		groups = keep
	}
	if !(uc.User.IsSuperuser || uc.User.IsSystemAuditor) {
		drop("host_metrics")
		dropGroup("settings")
		drop("management_jobs")
		drop("topology_view")
		drop("instances")
		if !uc.IsOrgAdmin && !uc.IsNotificationAdmin {
			drop("notification_templates")
		}
	}
	var out []navGroup
	for _, g := range groups {
		if len(g.Routes) == 0 {
			continue
		}
		for i := range g.Routes {
			p := g.Routes[i].Path
			if current == p || strings.HasPrefix(current, p+"/") {
				g.Routes[i].Current = true
				g.Current = true
			}
		}
		out = append(out, g)
	}
	return out
}

func (u *UI) newPage(r *http.Request, uc *userContext, title string) *page {
	ctx := r.Context()
	brand := "Ascender"
	custom := u.api.Settings.String(ctx, "CUSTOM_TITLE")
	loc := u.locale(r, uc)
	p := &page{
		Title:       loc.T(title),
		Loc:         loc,
		BrandName:   brand,
		CustomTitle: custom,
		HeaderLogo:  u.api.Settings.String(ctx, "CUSTOM_HEADER_LOGO"),
		Path:        r.URL.Path,
		Query:       r.URL.Query(),
		Version:     u.api.Cfg.Version,
		UC:          uc,
		Data:        map[string]any{},
	}
	if uc != nil {
		p.Nav = navigation(uc, r.URL.Path)
	}
	return p
}

// renderFragment executes one template defined by a page, without the
// layout, for pages that update part of themselves.
func (u *UI) renderFragment(w http.ResponseWriter, r *http.Request, pageName, tmpl string, p *page) {
	if p.Loc == nil {
		p.Loc = u.locale(r, p.UC)
	}
	t, err := u.localizedPage(pageName, p.Loc)
	if err != nil {
		u.api.Log.ErrorContext(r.Context(), "templates", "err", err)
		http.Error(w, "Internal Server Error", 500)
		return
	}
	if t == nil {
		u.api.Log.ErrorContext(r.Context(), "no such page", "page", pageName)
		http.Error(w, "Internal Server Error", 500)
		return
	}
	var buf bytes.Buffer
	if err := t.ExecuteTemplate(&buf, tmpl, p); err != nil {
		u.api.Log.ErrorContext(r.Context(), "render", "template", tmpl, "err", err)
		http.Error(w, "Internal Server Error", 500)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	_, _ = w.Write(buf.Bytes())
}

// render executes a page template inside the layout.
func (u *UI) render(w http.ResponseWriter, r *http.Request, name string, p *page) {
	if p.Loc == nil {
		p.Loc = u.locale(r, p.UC)
	}
	t, err := u.localizedPage(name, p.Loc)
	if err != nil {
		u.api.Log.ErrorContext(r.Context(), "templates", "err", err)
		http.Error(w, "Internal Server Error", 500)
		return
	}
	if t == nil {
		u.api.Log.ErrorContext(r.Context(), "no such page", "page", name)
		http.Error(w, "Internal Server Error", 500)
		return
	}
	rememberLanguage(w, r, p.Loc.Lang)
	localizeErrors(p)
	p.CSRF = auth.EnsureCSRFCookie(w, r, u.api.Cfg.SessionCookieSecure)
	p.Nonce = scriptNonce(r)
	// What is left of the session, which authenticating the page has just
	// extended and reported.
	if n, err := strconv.Atoi(w.Header().Get("Session-Timeout")); err == nil && n > 0 && p.SessionTimeout == 0 {
		p.SessionTimeout = n
	}
	if p.SessionTimeout == 0 {
		p.SessionTimeout = int(u.api.Cfg.SessionCookieAge.Seconds())
		if n := u.api.Settings.Int(r.Context(), "SESSION_COOKIE_AGE"); n > 0 {
			p.SessionTimeout = int(n)
		}
	}
	// The body first: which scripts the layout loads depends on it.
	var body bytes.Buffer
	if err := t.ExecuteTemplate(&body, "body", p); err != nil {
		u.api.Log.ErrorContext(r.Context(), "render", "template", name, "err", err)
		http.Error(w, "Internal Server Error", 500)
		return
	}
	p.scripts = scriptsFor(body.Bytes())
	p.Body = template.HTML(body.String())
	var buf bytes.Buffer
	if err := t.ExecuteTemplate(&buf, "base", p); err != nil {
		u.api.Log.ErrorContext(r.Context(), "render", "template", name, "err", err)
		http.Error(w, "Internal Server Error", 500)
		return
	}
	// securityHeaders has set the framing and sniffing headers.
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	// Every page holds the signed-in user's data and a CSRF token (and
	// one with a new token or client secret holds that too): none is kept
	// in the browser's cache, where history would show it after logout.
	w.Header().Set("Cache-Control", "no-store")
	if p.Status != 0 {
		w.WriteHeader(p.Status)
	}
	_, _ = w.Write(buf.Bytes())
}

// protected wraps a handler that needs a signed-in user, sending browsers
// to the login page otherwise.
func (u *UI) protected(fn func(w http.ResponseWriter, r *http.Request, uc *userContext)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user, err := u.api.Authenticate(w, r)
		if err != nil || user == nil {
			next := r.URL.RequestURI()
			if to := u.loginRedirectOverride(r); to != "" {
				if sameOriginSSOLogin(r, to) {
					u.ssoAutoLogin(w, r, to, next)
				} else {
					http.Redirect(w, r, to, http.StatusFound)
				}
				return
			}
			http.Redirect(w, r, "/login?next="+url.QueryEscape(next), http.StatusFound)
			return
		}
		if !api.IsSafeMethod(r.Method) {
			if err := parseForm(r); err != nil {
				http.Error(w, "Bad Request", http.StatusBadRequest)
				return
			}
			if !auth.CSRFOK(r) {
				http.Error(w, "CSRF verification failed.", http.StatusForbidden)
				return
			}
		}
		r = r.WithContext(auth.WithUser(r.Context(), user))
		uc := u.loadUserContext(r, user)
		// The page's API calls answer in the page's language, as the old
		// UI's did through the django_language cookie it kept in step.
		r = r.WithContext(api.WithLanguage(r.Context(), u.locale(r, uc).Lang))
		fn(w, r, uc)
	}
}

// parseForm reads a posted form, URL-encoded or multipart, up front. A
// form that doesn't parse is refused: read anyway, its fields would come
// out empty and a handler would save them as blanks.
func parseForm(r *http.Request) error {
	if err := r.ParseForm(); err != nil {
		return err
	}
	if err := r.ParseMultipartForm(32 << 20); err != nil && err != http.ErrNotMultipart {
		return err
	}
	return nil
}

// Routes returns the UI handler.
func (u *UI) Routes() http.Handler {
	mux := http.NewServeMux()
	if u.static != nil {
		mux.Handle("/static/", http.StripPrefix("/static/", cacheControl(u.static)))
		mux.HandleFunc("/favicon.ico", func(w http.ResponseWriter, r *http.Request) {
			u.static.serveFile(w, r, "media/favicon.ico")
		})
	} else {
		mux.Handle("/static/", http.StripPrefix("/static/", cacheControl(http.FileServer(noDirs{u.staticFS}))))
		mux.HandleFunc("/favicon.ico", func(w http.ResponseWriter, r *http.Request) {
			r.URL.Path = "/media/favicon.ico"
			http.FileServer(u.staticFS).ServeHTTP(w, r)
		})
	}
	mux.HandleFunc("/{$}", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/home", http.StatusFound)
	})
	if u.docs != nil {
		mux.Handle(docsBase, u.docs)
	}
	mux.HandleFunc("GET /i18n/{file}", u.serveCatalog)
	mux.HandleFunc("/login", u.login)
	mux.HandleFunc("/logout", u.logout)
	mux.HandleFunc("/home", u.protected(u.dashboard))
	u.registerProjects(mux)
	u.registerOrganizations(mux)
	u.registerJobs(mux)
	u.registerInventories(mux)
	u.registerHosts(mux)
	u.registerCredentials(mux)
	u.registerTemplates(mux)
	u.registerSchedules(mux)
	u.registerWorkflowVisualizer(mux)
	u.registerWorkflows(mux)
	u.registerInventorySources(mux)
	u.registerUsers(mux)
	u.registerApplications(mux)
	u.registerActivityStream(mux)
	u.registerExecutionEnvironments(mux)
	u.registerInstanceGroups(mux)
	u.registerTopology(mux)
	u.registerLabelsAndHostMetrics(mux)
	u.registerSettings(mux)
	u.registerNotificationTemplates(mux)
	u.registerManagementJobs(mux)
	u.registerMetrics(mux)
	mux.HandleFunc("/", u.protected(u.notFound))
	return u.securityHeaders(u.recoverPanics(mux))
}

// recoverPanics turns a handler's panic into a logged stack and a 500,
// rather than a dropped connection.
func (u *UI) recoverPanics(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			v := recover()
			if v == nil {
				return
			}
			if v == http.ErrAbortHandler {
				panic(v)
			}
			u.api.Log.ErrorContext(r.Context(), "panic", "path", r.URL.Path, "err", v, "stack", string(debug.Stack()))
			http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		}()
		next.ServeHTTP(w, r)
	})
}

// noDirs serves the static files and nothing about the directories that
// hold them: a directory reads as not found, never as a listing.
type noDirs struct{ fs http.FileSystem }

func (n noDirs) Open(name string) (http.File, error) {
	f, err := n.fs.Open(name)
	if err != nil {
		return nil, err
	}
	if st, err := f.Stat(); err != nil || st.IsDir() {
		f.Close()
		return nil, os.ErrNotExist
	}
	return f, nil
}

type nonceKey struct{}

// securityHeaders sets what every UI response carries: the content
// security policy with this request's script nonce, no framing, no
// sniffing, no referrer to other sites, and HSTS once cookies are
// marked Secure (the deployment is served over HTTPS).
func (u *UI) securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b := make([]byte, 18)
		_, _ = rand.Read(b)
		nonce := base64.RawURLEncoding.EncodeToString(b)
		h := w.Header()
		h.Set("Content-Security-Policy", api.ContentSecurityPolicy(nonce))
		h.Set("X-Frame-Options", "DENY")
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Referrer-Policy", "same-origin")
		h.Set("Cross-Origin-Opener-Policy", "same-origin")
		if u.api.Cfg.SessionCookieSecure {
			h.Set("Strict-Transport-Security", "max-age=31536000")
		}
		ctx := context.WithValue(r.Context(), nonceKey{}, nonce)
		if r.Method == http.MethodGet || r.Method == http.MethodHead {
			// A page's in-process API calls share one read memo.
			ctx = api.WithReadMemo(ctx)
		}
		if u.api.Cfg.SQLDebug > 0 && !strings.HasPrefix(r.URL.Path, "/static/") {
			var stats *db.QueryStats
			ctx, stats = u.api.WithQueryStats(ctx, r.URL.Path)
			w = &statsWriter{ResponseWriter: w, stats: stats, start: time.Now()}
		}
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// statsWriter reports a page's SQL statement count and time (every API
// call it made included) as its response starts, with SQL debugging on.
type statsWriter struct {
	http.ResponseWriter
	stats *db.QueryStats
	start time.Time
	wrote bool
}

func (s *statsWriter) WriteHeader(code int) {
	if !s.wrote {
		s.wrote = true
		h := s.Header()
		h.Set("X-API-Query-Count", strconv.FormatInt(s.stats.Count(), 10))
		h.Set("X-API-Query-Time", fmt.Sprintf("%0.3fs", s.stats.Duration().Seconds()))
		h.Set("X-API-Total-Time", fmt.Sprintf("%0.3fs", time.Since(s.start).Seconds()))
	}
	s.ResponseWriter.WriteHeader(code)
}

func (s *statsWriter) Write(p []byte) (int, error) {
	if !s.wrote {
		s.WriteHeader(http.StatusOK)
	}
	return s.ResponseWriter.Write(p)
}

func (s *statsWriter) Unwrap() http.ResponseWriter { return s.ResponseWriter }

// scriptNonce is the nonce the request's policy allows inline scripts by.
func scriptNonce(r *http.Request) string {
	n, _ := r.Context().Value(nonceKey{}).(string)
	return n
}

func cacheControl(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "public, max-age=3600")
		h.ServeHTTP(w, r)
	})
}

// pageTitle builds "<custom title> | <screen>" as the old UI did.
func (p *page) PageTitle() string {
	brand := p.CustomTitle
	if brand == "" {
		brand = p.BrandName
	}
	if p.Title == "" {
		return brand
	}
	return brand + " | " + p.Title
}

// --- login -----------------------------------------------------------------

// loginRedirectOverride is LOGIN_REDIRECT_OVERRIDE for a signed-out
// visitor of a page, as the old ProtectedRoute used it: set, an http(s)
// or relative URL (never one the browser would run, such as javascript:),
// and not for the login page itself. Only page loads (GET, HEAD) follow it.
func (u *UI) loginRedirectOverride(r *http.Request) string {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		return ""
	}
	return overrideTarget(r, u.api.Settings.String(r.Context(), "LOGIN_REDIRECT_OVERRIDE"))
}

// overrideTarget is where a signed-out visit to r goes for the override
// value, or "" for the login page.
func overrideTarget(r *http.Request, value string) string {
	to := strings.TrimSpace(value)
	if to == "" || strings.Contains(r.URL.Path, "/login") {
		return ""
	}
	t, err := url.Parse(to)
	if err != nil {
		return ""
	}
	switch strings.ToLower(t.Scheme) {
	case "", "http", "https":
		return to
	}
	return ""
}

// sameOriginSSOLogin is isSocialLoginUrl: the override is this site's
// /sso/login/<backend>/, which takes only a POST carrying the CSRF token.
func sameOriginSSOLogin(r *http.Request, to string) bool {
	t, err := url.Parse(to)
	if err != nil || !strings.Contains(t.Path, "/sso/login/") {
		return false
	}
	return t.Host == "" || strings.EqualFold(t.Host, r.Host)
}

// ssoAutoLogin is submitSocialLoginForm: the login page, posting its
// CSRF token (and where the visitor was going) to the SSO login URL as
// soon as it loads, so the visitor goes straight to the identity provider.
func (u *UI) ssoAutoLogin(w http.ResponseWriter, r *http.Request, to, next string) {
	api.AllowFormTargets(w, "https:")
	p := u.loginPage(r)
	p.Data["next"] = safeNext(next)
	p.Data["auto_sso"] = to
	u.render(w, r, "login", p)
}

// loginPage is the login page's data before any form is handled.
func (u *UI) loginPage(r *http.Request) *page {
	ctx := r.Context()
	p := &page{Title: "", Loc: u.locale(r, nil), BrandName: "Ascender", CustomTitle: u.api.Settings.String(ctx, "CUSTOM_TITLE"), Path: r.URL.Path, Query: r.URL.Query(), Data: map[string]any{}}
	p.Data["login_info"] = template.HTML(sanitizeLoginInfo(u.api.Settings.String(ctx, "CUSTOM_LOGIN_INFO")))
	p.Data["logo"] = u.api.Settings.String(ctx, "CUSTOM_LOGO")
	p.Data["next"] = safeNext(r.URL.Query().Get("next"))
	p.Data["expired"] = r.URL.Query().Get("expired") == "1"
	p.Data["sso"], p.Data["sso_error"] = u.ssoOptions(r, p.Loc)
	return p
}

func (u *UI) login(w http.ResponseWriter, r *http.Request) {
	// The SSO buttons post to /sso/login/, which redirects to whichever
	// identity provider is configured: any HTTPS origin.
	api.AllowFormTargets(w, "https:")
	// Already signed in: go on.
	if user, err := u.api.Authenticate(w, r); err == nil && user != nil && r.Method == http.MethodGet {
		http.Redirect(w, r, safeNext(r.URL.Query().Get("next")), http.StatusFound)
		return
	}
	p := u.loginPage(r)
	if r.Method == http.MethodPost {
		r.Body = http.MaxBytesReader(w, r.Body, api.MaxLoginBody)
		if err := r.ParseForm(); err == nil {
			p.Data["next"] = safeNext(r.PostFormValue("next"))
			if !auth.CSRFOK(r) {
				p.Data["error"] = p.Loc.T("There was a problem logging in. Please try again.")
			} else if _, err := u.api.Login(w, r, r.PostFormValue("username"), r.PostFormValue("password")); err != nil {
				if err == api.ErrBadLogin || err == api.ErrInactiveLogin {
					p.Data["error"] = p.Loc.T("Invalid username or password. Please try again.")
				} else {
					p.Data["error"] = p.Loc.T("There was a problem logging in. Please try again.")
				}
				p.Data["username"] = r.PostFormValue("username")
			} else {
				http.Redirect(w, r, str(p.Data["next"]), http.StatusFound)
				return
			}
		}
	}
	if p.Data["error"] != nil {
		p.Status = http.StatusUnauthorized
	}
	u.render(w, r, "login", p)
}

// ssoProviders are the login page's buttons per backend: data-cy, icon
// and label (a message, translated by ssoOptions).
var ssoProviders = map[string][3]string{
	"azuread-oauth2":         {"social-auth-azure", "azure", "Sign in with Azure AD"},
	"azuread-tenant-oauth2":  {"social-auth-azure-tenant", "azure", "Sign in with Azure AD Tenant"},
	"entra-id":               {"social-auth-entra-id", "azure", "Sign in with Microsoft Entra ID"},
	"github":                 {"social-auth-github", "github", "Sign in with GitHub"},
	"github-org":             {"social-auth-github-org", "github", "Sign in with GitHub Organizations"},
	"github-team":            {"social-auth-github-team", "github", "Sign in with GitHub Teams"},
	"github-enterprise":      {"social-auth-github-enterprise", "github", "Sign in with GitHub Enterprise"},
	"github-enterprise-org":  {"social-auth-github-enterprise-org", "github", "Sign in with GitHub Enterprise Organizations"},
	"github-enterprise-team": {"social-auth-github-enterprise-team", "github", "Sign in with GitHub Enterprise Teams"},
	"google-oauth2":          {"social-auth-google", "google", "Sign in with Google"},
	"oidc":                   {"social-auth-oidc", "user-circle", "Sign in with OIDC"},
}

// ssoOption is one single sign-on button.
type ssoOption struct {
	Key, LoginURL, DataCy, Icon, Label string
}

// ssoOptions reads /api/v2/auth/ as the login screen did: the buttons in
// its order, and the first error any of them carries.
func (u *UI) ssoOptions(r *http.Request, loc *i18n.Locale) ([]ssoOption, string) {
	req := httptest.NewRequest(http.MethodGet, "/api/v2/auth/", nil)
	req = req.WithContext(api.WithLanguage(r.Context(), loc.Lang))
	req.Host = r.Host
	req.Header.Set("Accept", "application/json")
	if c := r.Header.Get("Cookie"); c != "" {
		req.Header.Set("Cookie", c)
	}
	rec := httptest.NewRecorder()
	u.api.Routes().ServeHTTP(rec, req)
	var m api.OMap
	if rec.Code != http.StatusOK || json.Unmarshal(rec.Body.Bytes(), &m) != nil {
		return nil, ""
	}
	var out []ssoOption
	ssoErr := ""
	for _, k := range m.Keys() {
		v, _ := m.Get(k)
		entry, _ := v.(*api.OMap)
		if entry == nil {
			continue
		}
		get := func(f string) string {
			x, _ := entry.Get(f)
			s, _ := x.(string)
			return s
		}
		if e := get("error"); e != "" && ssoErr == "" {
			ssoErr = e
		}
		var prov [3]string
		if strings.HasPrefix(k, "saml") {
			idp := ""
			if _, after, ok := strings.Cut(k, ":"); ok {
				idp = after
			}
			prov = [3]string{"social-auth-saml", "user-circle", loc.T("Sign in with SAML")}
			if idp != "" {
				prov[2] = loc.T("Sign in with SAML {samlIDP}", "samlIDP", idp)
			}
		} else if p, ok := ssoProviders[k]; ok {
			prov = p
			prov[2] = loc.T(p[2])
		} else {
			continue
		}
		if l := get("label"); l != "" {
			prov[2] = loc.T("Sign in with {label}", "label", l)
		}
		out = append(out, ssoOption{Key: k, LoginURL: get("login_url"), DataCy: prov[0], Icon: prov[1], Label: prov[2]})
	}
	return out, ssoErr
}

func (u *UI) logout(w http.ResponseWriter, r *http.Request) {
	// POST with the CSRF token only; the UI's menu posts to /api/logout/.
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST")
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}
	user, err := u.api.Authenticate(w, r)
	if err == nil && user != nil {
		if !auth.CSRFOK(r) {
			http.Error(w, "CSRF verification failed.", http.StatusForbidden)
			return
		}
		r = r.WithContext(auth.WithUser(r.Context(), user))
	}
	u.api.Logout(w, r)
	http.Redirect(w, r, "/login", http.StatusFound)
}

func safeNext(next string) string {
	if !api.IsLocalPath(next) {
		return "/home"
	}
	if parsed, err := url.Parse(next); err != nil || parsed.Path == "/login" || parsed.Path == "/logout" {
		return "/home"
	}
	return next
}

// loginInfoPolicy is the allowlist CUSTOM_LOGIN_INFO is cut down to, as
// DOMPurify cut it in the old UI: formatting, lists, tables and links,
// never script, event handlers, javascript: URLs, forms or <meta>. It is
// shown on the login page, to everyone, before they sign in.
var loginInfoPolicy = bluemonday.UGCPolicy()

// sanitizeLoginInfo keeps the HTML fragment an administrator may set to a
// safe subset.
func sanitizeLoginInfo(s string) string {
	return loginInfoPolicy.Sanitize(s)
}

// notFound renders the not found page with a 404.
func (u *UI) notFound(w http.ResponseWriter, r *http.Request, uc *userContext) {
	p := u.newPage(r, uc, "Not Found")
	p.Status = http.StatusNotFound
	u.render(w, r, "notfound", p)
}

// loadResult reads one object from the API. When the user can't read it,
// it renders the not found page and returns nil.
func (u *UI) loadResult(w http.ResponseWriter, r *http.Request, uc *userContext, apiPath string) *apiResult {
	res, err := u.apiCall(r, "GET", apiPath, nil)
	if err != nil || res.Status != http.StatusOK {
		u.notFound(w, r, uc)
		return nil
	}
	return res
}

// loadObject is loadResult's decoded object, and whether there was one.
func (u *UI) loadObject(w http.ResponseWriter, r *http.Request, uc *userContext, apiPath string) (map[string]any, bool) {
	res := u.loadResult(w, r, uc, apiPath)
	if res == nil {
		return nil, false
	}
	return res.Data, true
}

// toDetails sends an object's bare URL on to its details page.
func toDetails(w http.ResponseWriter, r *http.Request, _ *userContext) {
	http.Redirect(w, r, strings.TrimSuffix(r.URL.Path, "/")+"/details", http.StatusFound)
}

// --- dashboard -------------------------------------------------------------

func (u *UI) dashboard(w http.ResponseWriter, r *http.Request, uc *userContext) {
	p := u.newPage(r, uc, "Dashboard")
	res, err := u.apiCall(r, "GET", "/api/v2/dashboard/", nil)
	if err == nil && res.Status == 200 {
		p.Data["counts"] = res.Data
	}
	p.Data["d3"] = true
	p.Data["dashboard"] = true
	// The Recent Jobs and Recent Templates tabs are the job and template
	// lists five to a page. Only the open one is rendered: a list's own
	// parameters (or ?tab=, from a click on its tab) open it.
	tab := 0
	q := r.URL.Query()
	for k := range q {
		if strings.HasPrefix(k, "job.") {
			tab = 1
		} else if strings.HasPrefix(k, "template.") {
			tab = 2
		}
	}
	switch q.Get("tab") {
	case "jobs":
		tab = 1
	case "templates":
		tab = 2
	}
	p.Data["tab"] = tab
	if tab != 0 {
		lp := u.newPage(r, uc, "Dashboard")
		// tab is the dashboard's own parameter, not a filter of the list.
		lr := r.Clone(r.Context())
		lq := r.URL.Query()
		lq.Del("tab")
		lr.URL.RawQuery = lq.Encode()
		var err error
		if tab == 1 {
			err = u.listPage(lr, lp, "job", "/api/v2/unified_jobs/", url.Values{"order_by": {"-finished"}, "not__launch_type": {"sync"}, "page_size": {"5"}}, jobFilterLabels)
			lp.Data["searchKeys"] = jobSearchKeys
			// The dashboard's JobList left out the type column.
			lp.Data["showType"] = false
		} else {
			err = u.listPage(lr, lp, "template", "/api/v2/unified_job_templates/", url.Values{"order_by": {"name"}, "type": {"job_template,workflow_job_template"}, "page_size": {"5"}}, templateFilterLabels)
			lp.Data["searchKeys"] = templateSearchKeys
			lp.Data["addMenu"] = []map[string]any{
				{"label": lp.Loc.T("Add job template"), "href": "/templates/job_template/add"},
				{"label": lp.Loc.T("Add workflow template"), "href": "/templates/workflow_job_template/add"},
			}
		}
		if err != nil {
			u.api.Log.ErrorContext(r.Context(), "dashboard list", "err", err)
		}
		p.Data["listPage"] = lp
		p.Data["editor"] = true
	}
	u.render(w, r, "dashboard", p)
}

// jsonIndent pretty-prints a value for read-only JSON views.
func jsonIndent(v any) (string, error) {
	b, err := json.MarshalIndent(v, "", "  ")
	return string(b), err
}

// credKindLabel is the type prefix a credential chip carries ("SSH: name"),
// as CredentialChip computed it.
func credKindLabel(c map[string]any) string {
	kind := str(c["kind"])
	if c["cloud"] == true {
		return "Cloud"
	}
	switch kind {
	case "gpg_public_key":
		return "GPG Public Key"
	case "aws", "ssh":
		return strings.ToUpper(kind)
	}
	return api.Title(strings.ReplaceAll(kind, "_", " "))
}
