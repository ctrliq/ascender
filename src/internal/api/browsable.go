package api

import (
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	_ "embed"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/http/httptest"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/ctrliq/ascender/internal/auth"
)

// The browsable API (DRF's BrowsableAPIRenderer with Ascender's
// rest_framework/api.html): a browser asking for HTML gets the response
// wrapped in a page with the view's name and description, breadcrumbs,
// the request and response, and raw data forms for the methods the user
// may use. Handlers keep writing JSON; the page is built around what they
// wrote.

//go:embed metadata/browsable_code_style.css
var browsableCodeStyle string

// browsableInternalHTML marks a body that is already HTML for the page's
// content block (the stdout view's fragment, marked safe in the old view).
const browsableInternalHTML = "X-Ascender-Browsable-Html"

// browsableNoView marks a response from no view (the API's catch-all 404).
const browsableNoView = "X-Ascender-No-View"

// descriptionsGz is metadata/render_descriptions.py's output.
//
//go:embed metadata/descriptions_html.json.gz
var descriptionsGz []byte

var descriptionsHTML = sync.OnceValue(func() map[string]string {
	out := map[string]string{}
	zr, err := gzip.NewReader(bytes.NewReader(descriptionsGz))
	if err != nil {
		return out
	}
	b, err := io.ReadAll(zr)
	if err != nil {
		return out
	}
	_ = json.Unmarshal(b, &out)
	return out
})

// descriptionHTML is apply_markdown of a view description: rendered by the
// old app's Markdown for every captured description, else by a fallback.
func descriptionHTML(text string) string {
	sum := sha256.Sum256([]byte(text))
	if h, ok := descriptionsHTML()[hex.EncodeToString(sum[:])]; ok {
		return h
	}
	return markdownFallback(text)
}

type mediaRange struct {
	main, sub string
	params    map[string]string
}

func (m mediaRange) precedence() int {
	switch {
	case m.main == "*":
		return 0
	case m.sub == "*":
		return 1
	}
	for k := range m.params {
		if k != "q" {
			return 3
		}
	}
	return 2
}

func parseAccept(h string) []mediaRange {
	var out []mediaRange
	for _, part := range strings.Split(h, ",") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		fields := strings.Split(part, ";")
		mt := strings.TrimSpace(fields[0])
		main, sub, _ := strings.Cut(mt, "/")
		m := mediaRange{main: strings.TrimSpace(main), sub: strings.TrimSpace(sub), params: map[string]string{}}
		if m.sub == "" {
			m.sub = "*"
		}
		for _, p := range fields[1:] {
			k, v, _ := strings.Cut(p, "=")
			m.params[strings.TrimSpace(k)] = strings.TrimSpace(v)
		}
		out = append(out, m)
	}
	return out
}

func (m mediaRange) matches(mediaType string) bool {
	main, sub, _ := strings.Cut(mediaType, "/")
	return (m.main == "*" || m.main == main) && (m.sub == "*" || m.sub == sub)
}

// negotiate is DRF's DefaultContentNegotiation over renderers given by
// media type, in the view's order: the most specific accepted media types
// are tried first, q values ignored.
func negotiate(accept string, renderers []string) int {
	ranges := parseAccept(accept)
	if len(ranges) == 0 {
		return 0
	}
	for prec := 3; prec >= 0; prec-- {
		for i, rt := range renderers {
			for _, m := range ranges {
				if m.precedence() == prec && m.matches(rt) {
					return i
				}
			}
		}
	}
	return -1
}

// browsableExcluded are the paths under /api/ that are not REST framework
// views or render HTML of their own.
func browsableExcluded(path string) bool {
	switch path {
	case "/api/login/", "/api/logout/", "/api/o/token/", "/api/o/revoke_token/", "/api/o/authorize/", "/api/schema/", "/api/swagger/", "/api/redoc/":
		return true
	}
	return !strings.HasPrefix(path, "/api/") || webhookReceiverPath.MatchString(path)
}

// viewRenders are the media types of a view's renderers in order: the
// captured OPTIONS document's renders, else JSON then the browsable API.
func (s *Server) viewRenders(next http.Handler, path string) []string {
	if isStdoutPath(path) {
		return stdoutMediaTypes
	}
	if doc := capturedDoc(next, path); doc != nil {
		if v, ok := doc.Get("renders"); ok {
			if l, ok := v.([]any); ok && len(l) > 0 {
				out := make([]string, 0, len(l))
				for _, x := range l {
					out = append(out, fmt.Sprint(x))
				}
				return out
			}
		}
	}
	return []string{"application/json", "text/html"}
}

// viewParses are the media types of a view's parsers, from its document.
func viewParses(doc *OMap) []string {
	if doc != nil {
		if v, ok := doc.Get("parses"); ok {
			if l, ok := v.([]any); ok && len(l) > 0 {
				out := make([]string, 0, len(l))
				for _, x := range l {
					out = append(out, fmt.Sprint(x))
				}
				return out
			}
		}
	}
	return []string{"application/json"}
}

// renderFormats are the formats of a view's renderers, in order.
func renderFormats(renders []string, path string) []string {
	if isStdoutPath(path) {
		return stdoutFormats
	}
	out := make([]string, 0, len(renders))
	html := false
	for _, m := range renders {
		switch m {
		case "application/json":
			out = append(out, "json")
		case "text/html":
			if !html {
				out = append(out, "api")
				html = true
			} else {
				out = append(out, "html")
			}
		case "text/plain":
			out = append(out, "txt")
		case "application/yaml":
			out = append(out, "yaml")
		}
	}
	return out
}

// wantsBrowsable reports whether the request negotiates the browsable API
// renderer: ?format=api, or an Accept header that picks the view's first
// text/html renderer.
func (s *Server) wantsBrowsable(r *http.Request, next http.Handler) bool {
	if r.Method == http.MethodHead || browsableExcluded(r.URL.Path) {
		return false
	}
	renders := s.viewRenders(next, r.URL.Path)
	if f := r.URL.Query().Get("format"); f != "" {
		return f == "api" && contains(renders, "text/html")
	}
	accept := r.Header.Get("Accept")
	i := negotiate(accept, renders)
	if i < 0 {
		return false
	}
	for j, m := range renders {
		if m == "text/html" {
			return i == j
		}
	}
	return false
}

// capturedDoc is the OPTIONS document captured for a path's route.
func capturedDoc(next http.Handler, path string) *OMap {
	mux, ok := next.(*http.ServeMux)
	if !ok {
		return nil
	}
	probe, err := http.NewRequest(http.MethodOptions, path, nil)
	if err != nil {
		return nil
	}
	_, pattern := mux.Handler(probe)
	if pattern == "" || pattern == "/api/" {
		return nil
	}
	key := routeMetadataKey(pattern)
	for _, name := range []string{"metadata/routes/" + key + ".json", "metadata/" + key + ".json"} {
		if b, err := metadataFS.ReadFile(name); err == nil {
			var doc OMap
			if json.Unmarshal(b, &doc) == nil {
				return &doc
			}
		}
	}
	return nil
}

func isStdoutPath(path string) bool {
	return stdoutPathRe.MatchString(path)
}

// bufferWriter collects a handler's response.
type bufferWriter struct {
	header http.Header
	status int
	body   bytes.Buffer
}

func newBufferWriter() *bufferWriter { return &bufferWriter{header: http.Header{}} }

func (b *bufferWriter) Header() http.Header { return b.header }
func (b *bufferWriter) WriteHeader(code int) {
	if b.status == 0 {
		b.status = code
	}
}
func (b *bufferWriter) Write(p []byte) (int, error) {
	if b.status == 0 {
		b.status = http.StatusOK
	}
	return b.body.Write(p)
}

// passThrough copies a buffered response out unchanged.
func (b *bufferWriter) passThrough(w http.ResponseWriter) {
	for k, v := range b.header {
		if k == browsableNoView || k == browsableInternalHTML {
			continue
		}
		w.Header()[k] = v
	}
	status := b.status
	if status == 0 {
		status = http.StatusOK
	}
	w.WriteHeader(status)
	_, _ = w.Write(b.body.Bytes())
}

// browsable serves a request through next and, when the response is one
// the browsable renderer shows, wraps it in the page.
func (s *Server) browsable(w http.ResponseWriter, r *http.Request, handler, next http.Handler, start time.Time) {
	// The request body is read again for a rejected form's data.
	var reqBody []byte
	if r.Body != nil && (r.Method == http.MethodPost || r.Method == http.MethodPut || r.Method == http.MethodPatch) {
		// One byte past the limit, so readBody still sees an oversized
		// body as one.
		reqBody, _ = io.ReadAll(io.LimitReader(r.Body, maxRequestBody+1))
		r.Body = io.NopCloser(bytes.NewReader(reqBody))
	}
	bw := newBufferWriter()
	handler.ServeHTTP(bw, r)
	ct := bw.header.Get("Content-Type")
	switch {
	case bw.header.Get(browsableNoView) != "":
		bw.passThrough(w)
		return
	case bw.status >= 300 && bw.status < 400:
		bw.passThrough(w)
		return
	case strings.HasPrefix(ct, "application/json"), bw.header.Get(browsableInternalHTML) != "":
	case strings.HasPrefix(ct, "text/plain") && !strings.HasPrefix(bw.header.Get("Content-Disposition"), "attachment"):
	case ct == "" && bw.body.Len() == 0:
	default:
		bw.passThrough(w)
		return
	}
	if bw.status == http.StatusUnauthorized && bw.header.Get("WWW-Authenticate") == "" {
		bw.header.Set("WWW-Authenticate", `Bearer realm=api authorization_url=/api/o/authorize/`)
	}
	// The view's finalize_response headers are on the outer response.
	for _, k := range []string{"X-Api-Node", "X-Api-Product-Name", "X-Api-Product-Version"} {
		if v := w.Header().Get(k); v != "" && bw.header.Get(k) == "" {
			bw.header.Set(k, v)
		}
	}
	page := s.browsablePage(r, next, bw, reqBody, start)
	for k, v := range bw.header {
		switch k {
		case "Content-Type", "Content-Length", browsableNoView, browsableInternalHTML:
			continue
		}
		w.Header()[k] = v
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	status := bw.status
	// The page shows the deletion's 204 but is sent with 200 so it has a
	// body (BrowsableAPIRenderer munged the status the same way).
	if status == 0 || status == http.StatusNoContent {
		status = http.StatusOK
	}
	w.WriteHeader(status)
	_, _ = io.WriteString(w, page)
}

// viewDoc is the OPTIONS document a path's view describes itself with:
// the captured one for its route, else what OPTIONS answers for the user.
func (s *Server) viewDoc(r *http.Request, next http.Handler, path string) *OMap {
	mux, ok := next.(*http.ServeMux)
	if !ok {
		return nil
	}
	probe, err := http.NewRequest(http.MethodOptions, path, nil)
	if err != nil {
		return nil
	}
	if _, pattern := mux.Handler(probe); pattern == "" || pattern == "/api/" {
		return nil
	}
	if doc := capturedDoc(next, path); doc != nil {
		return doc
	}
	return s.internalOptions(r, next, path)
}

// internalOptions runs OPTIONS on a path as the requesting user.
func (s *Server) internalOptions(r *http.Request, next http.Handler, path string) *OMap {
	req, err := http.NewRequestWithContext(r.Context(), http.MethodOptions, path, nil)
	if err != nil {
		return nil
	}
	req.Host = r.Host
	req.Header.Set("Accept", "application/json")
	rec := httptest.NewRecorder()
	next.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		return nil
	}
	v, err := DecodeOrdered(rec.Body.String())
	if err != nil {
		return nil
	}
	doc, _ := v.(*OMap)
	return doc
}

func docString(doc *OMap, key string) string {
	if doc == nil {
		return ""
	}
	v, _ := doc.Get(key)
	s, _ := v.(string)
	return s
}

type crumb struct{ name, url string }

// breadcrumbs is get_breadcrumbs: every prefix of the path that is a view,
// named by the view.
func (s *Server) breadcrumbs(r *http.Request, next http.Handler) []crumb {
	path := r.URL.Path
	var out []crumb
	seen := map[string]bool{}
	for p := path; strings.HasPrefix(p, "/api/"); {
		if strings.HasSuffix(p, "/") {
			if doc := s.viewDoc(r, next, p); doc != nil {
				name := docString(doc, "name")
				if !seen[p] {
					u := p
					if f := r.URL.Query().Get("format"); f != "" {
						u += "?format=" + url.QueryEscape(f)
					}
					out = append([]crumb{{name, u}}, out...)
					seen[p] = true
				}
			}
			p = strings.TrimSuffix(p, "/")
			continue
		}
		p = p[:strings.LastIndexByte(p, '/')+1]
	}
	return out
}

// pyJSONIndent is json.dumps(v, indent=4, ensure_ascii=False,
// separators=(',', ': ')) as DRF's JSONRenderer wrote it for the page.
func pyJSONIndent(v any) string {
	var b strings.Builder
	writePyJSON(&b, v, 0)
	return strings.NewReplacer(" ", ` `, " ", ` `).Replace(b.String())
}

func writePyJSONString(b *strings.Builder, s string) {
	b.WriteByte('"')
	for _, r := range s {
		switch r {
		case '"':
			b.WriteString(`\"`)
		case '\\':
			b.WriteString(`\\`)
		case '\n':
			b.WriteString(`\n`)
		case '\r':
			b.WriteString(`\r`)
		case '\t':
			b.WriteString(`\t`)
		case '\b':
			b.WriteString(`\b`)
		case '\f':
			b.WriteString(`\f`)
		default:
			if r < 0x20 {
				fmt.Fprintf(b, `\u%04x`, r)
			} else {
				b.WriteRune(r)
			}
		}
	}
	b.WriteByte('"')
}

func writePyJSON(b *strings.Builder, v any, depth int) {
	pad := func(d int) { b.WriteString("\n" + strings.Repeat("    ", d)) }
	switch t := v.(type) {
	case *OMap:
		keys := t.Keys()
		if len(keys) == 0 {
			b.WriteString("{}")
			return
		}
		b.WriteByte('{')
		for i, k := range keys {
			if i > 0 {
				b.WriteByte(',')
			}
			pad(depth + 1)
			writePyJSONString(b, k)
			b.WriteString(": ")
			x, _ := t.Get(k)
			writePyJSON(b, x, depth+1)
		}
		pad(depth)
		b.WriteByte('}')
	case map[string]any:
		keys := make([]string, 0, len(t))
		for k := range t {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		o := NewOMap()
		for _, k := range keys {
			o.Set(k, t[k])
		}
		writePyJSON(b, o, depth)
	case []any:
		if len(t) == 0 {
			b.WriteString("[]")
			return
		}
		b.WriteByte('[')
		for i, x := range t {
			if i > 0 {
				b.WriteByte(',')
			}
			pad(depth + 1)
			writePyJSON(b, x, depth+1)
		}
		pad(depth)
		b.WriteByte(']')
	case string:
		writePyJSONString(b, t)
	case json.Number:
		b.WriteString(t.String())
	case bool:
		if t {
			b.WriteString("true")
		} else {
			b.WriteString("false")
		}
	case nil:
		b.WriteString("null")
	case float64:
		if t == math.Trunc(t) && math.Abs(t) < 1e15 {
			b.WriteString(strconv.FormatInt(int64(t), 10))
		} else {
			b.WriteString(strconv.FormatFloat(t, 'g', -1, 64))
		}
	case int, int64:
		fmt.Fprint(b, t)
	default:
		j, _ := json.Marshal(t)
		b.Write(j)
	}
}

// djangoEscape is django.utils.html.escape.
func djangoEscape(s string) string {
	return strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", `"`, "&quot;", "'", "&#x27;").Replace(s)
}

// statusText is Django's reason phrase for a status code.
func statusText(code int) string {
	if code == http.StatusRequestEntityTooLarge {
		return "Request Entity Too Large"
	}
	return http.StatusText(code)
}

// displayHeaderName spells a header as the old view set it.
func displayHeaderName(k string) string {
	switch {
	case strings.HasPrefix(k, "X-Api-"):
		return "X-API-" + k[len("X-Api-"):]
	case k == "Www-Authenticate":
		return "WWW-Authenticate"
	}
	return k
}

// pageHeaders are the response headers the page lists: those the view set
// (DRF listed response.items() at render time, before the middleware's),
// sorted, with the default renderer's content type.
func pageHeaders(h http.Header, contentType string, elapsed time.Duration, authenticated, timed bool) [][2]string {
	skip := map[string]bool{"Content-Length": true, "Date": true, "Set-Cookie": true, "Cross-Origin-Opener-Policy": true, "Referrer-Policy": true,
		"X-Content-Type-Options": true, "X-Frame-Options": true, "X-Api-Total-Time": true, "X-Api-Request-Id": true, "Access-Control-Expose-Headers": true,
		"Content-Language": true, "Strict-Transport-Security": true, "Session-Timeout": true, browsableNoView: true, browsableInternalHTML: true}
	m := map[string]string{}
	for k, v := range h {
		if skip[k] || len(v) == 0 {
			continue
		}
		m[displayHeaderName(k)] = strings.Join(v, ", ")
	}
	m["Vary"] = "Accept"
	m["Content-Type"] = contentType
	if !authenticated {
		delete(m, "X-API-Product-Version")
	}
	// MetricsView's response was rendered before the time was added.
	if timed {
		m["X-API-Time"] = fmt.Sprintf("%0.3fs", elapsed.Seconds())
	} else {
		delete(m, "X-API-Time")
	}
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	out := make([][2]string, 0, len(keys))
	for _, k := range keys {
		out = append(out, [2]string{k, m[k]})
	}
	return out
}

// rawInitial is a serializer field's initial value for the raw data form:
// the model default when there is one (Ascender's serializers set initial
// from it), else the field class's initial.
func rawInitial(field *OMap, useDefault bool) any {
	t := docString(field, "type")
	if useDefault {
		if d, ok := field.Get("default"); ok {
			return d
		}
	}
	switch t {
	case "string", "email", "url", "slug", "password":
		return ""
	case "boolean":
		return false
	case "list":
		return []any{}
	case "object", "nested object":
		return NewOMap()
	}
	return nil
}

// parentKeys are the fields a sublist under each parent sets itself
// (parent_key and enforce_parent_relationship of the sublist views).
var parentKeys = map[string]string{
	"organizations": "organization", "inventories": "inventory", "constructed_inventories": "inventory", "projects": "project",
	"job_templates": "job_template", "workflow_job_templates": "workflow_job_template", "credential_types": "credential_type",
	"inventory_sources": "inventory_source", "users": "user", "teams": "team", "hosts": "host", "groups": "inventory",
	"instance_groups": "instance_group", "execution_environments": "execution_environment", "applications": "application",
	"system_job_templates": "system_job_template", "workflow_job_template_nodes": "workflow_job_template", "credentials": "credential",
	"instances": "instance", "notification_templates": "notification_template", "workflow_approval_templates": "workflow_approval_template",
	"workflow_jobs": "workflow_job",
}

// sublistParentKey is the parent key of /api/v2/<parent>/<id>/<child>/.
func sublistParentKey(path string) (string, bool) {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) != 5 || parts[0] != "api" {
		return "", false
	}
	switch parts[4] {
	case "schedules", "notification_templates_any", "notification_templates_started", "notification_templates_success", "notification_templates_error":
		if parts[4] == "schedules" {
			return "unified_job_template", true
		}
	case "input_sources":
		return "target_credential", true
	case "scm_inventory_sources":
		return "source_project", true
	}
	return parentKeys[parts[2]], true
}

// rawFormData is the raw data form's object: the writable fields of the
// method's serializer (get_serializer under the raw data form marker),
// with the object's values for PUT when there is one.
func rawFormData(path string, fields *OMap, object *OMap, useDefaults bool) *OMap {
	out := NewOMap()
	if fields == nil {
		return out
	}
	keys := fields.Keys()
	for _, k := range keys {
		// SubListAttachDetachAPIView: only an id.
		if k == "disassociate" {
			return NewOMap().Set("id", nil)
		}
	}
	// Settings and the bulk views use declared fields: their initial is
	// the field class's, whatever the default.
	if strings.HasPrefix(path, "/api/v2/settings/") || strings.HasPrefix(path, "/api/v2/bulk/") {
		useDefaults = false
	}
	parentKey, isSublist := sublistParentKey(path)
	for _, k := range keys {
		x, _ := fields.Get(k)
		f, ok := x.(*OMap)
		if !ok {
			continue
		}
		if ro, _ := f.Get("read_only"); ro == true {
			continue
		}
		if isSublist && (k == "id" || (parentKey != "" && k == parentKey)) {
			continue
		}
		if object != nil {
			if v, ok := object.Get(k); ok {
				out.Set(k, v)
			}
			continue
		}
		v := rawInitial(f, useDefaults)
		// LaunchConfigurationBaseSerializer declares the prompted text
		// fields: their initial is CharField's '', not the null default.
		if v == nil && launchConfigPathRe.MatchString(path) && launchConfigCharFields[k] {
			v = ""
		}
		out.Set(k, v)
	}
	return out
}

var launchConfigPathRe = regexp.MustCompile(`/(schedules|workflow_nodes|workflow_job_template_nodes|workflow_job_nodes|success_nodes|failure_nodes|always_nodes)/`)

var launchConfigCharFields = map[string]bool{"scm_branch": true, "job_tags": true, "skip_tags": true, "limit": true}

var (
	jtLaunchPathRe   = regexp.MustCompile(`^/api/v2/job_templates/[^/]+/launch/$`)
	wfjtLaunchPathRe = regexp.MustCompile(`^/api/v2/workflow_job_templates/[^/]+/launch/$`)
	jobRelaunchRe    = regexp.MustCompile(`^/api/v2/jobs/[^/]+/relaunch/$`)
	hostGroupsRe     = regexp.MustCompile(`^/api/v2/(hosts/[^/]+/groups|groups/[^/]+/hosts)/$`)
	adHocUnderRe     = regexp.MustCompile(`^/api/v2/(hosts|groups)/[^/]+/ad_hoc_commands/$`)
	adHocListRe      = regexp.MustCompile(`^/api/v2/((hosts|groups|inventories)/[^/]+/)?ad_hoc_commands/$`)
	instanceDetailRe = regexp.MustCompile(`^/api/v2/instances/[^/]+/$`)
	igDetailRe       = regexp.MustCompile(`^/api/v2/instance_groups/[^/]+/$`)
	appDetailRe      = regexp.MustCompile(`^/api/v2/applications/[^/]+/$`)
	userDetailRe     = regexp.MustCompile(`^/api/v2/users/[^/]+/$`)
)

// jtAskMapping is JobTemplate.get_ask_mapping() without extra_vars.
var jtAskMapping = [][2]string{
	{"inventory", "ask_inventory_on_launch"}, {"limit", "ask_limit_on_launch"}, {"scm_branch", "ask_scm_branch_on_launch"},
	{"job_tags", "ask_tags_on_launch"}, {"skip_tags", "ask_skip_tags_on_launch"}, {"job_type", "ask_job_type_on_launch"},
	{"verbosity", "ask_verbosity_on_launch"}, {"diff_mode", "ask_diff_mode_on_launch"}, {"credentials", "ask_credential_on_launch"},
	{"execution_environment", "ask_execution_environment_on_launch"}, {"labels", "ask_labels_on_launch"}, {"forks", "ask_forks_on_launch"},
	{"job_slice_count", "ask_job_slice_count_on_launch"}, {"timeout", "ask_timeout_on_launch"}, {"instance_groups", "ask_instance_groups_on_launch"},
}

var wfjtAskMapping = [][2]string{
	{"inventory", "ask_inventory_on_launch"}, {"limit", "ask_limit_on_launch"}, {"scm_branch", "ask_scm_branch_on_launch"},
	{"labels", "ask_labels_on_launch"}, {"skip_tags", "ask_skip_tags_on_launch"}, {"job_tags", "ask_tags_on_launch"},
}

func omapGet(o *OMap, keys ...string) any {
	var cur any = o
	for _, k := range keys {
		m, ok := cur.(*OMap)
		if !ok || m == nil {
			return nil
		}
		cur, _ = m.Get(k)
	}
	return cur
}

func idsOf(v any) []any {
	out := []any{}
	if l, ok := v.([]any); ok {
		for _, x := range l {
			if m, ok := x.(*OMap); ok {
				id, _ := m.Get("id")
				out = append(out, id)
			}
		}
	}
	return out
}

// adjustRawData is the views' update_raw_data: what each view adds to or
// removes from its raw data form. page is the GET response of the view.
func adjustRawData(path string, data *OMap, page *OMap) *OMap {
	// The node identifier's default is a new uuid4 each time.
	if v, _ := data.Get("identifier"); v == "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" {
		data.Set("identifier", newUUID())
	}
	if path == "/api/v2/bulk/job_launch/" {
		// jobs is a many=True serializer.
		if _, ok := data.Get("jobs"); ok {
			data.Set("jobs", []any{})
		}
	}
	if adHocListRe.MatchString(path) {
		// module_name's initial is the model's default, not the choices'
		// default; instance_groups is a many-related field.
		if _, ok := data.Get("module_name"); ok {
			data.Set("module_name", "")
		}
		if _, ok := data.Get("instance_groups"); ok {
			data.Set("instance_groups", []any{})
		}
	}
	switch {
	case jtLaunchPathRe.MatchString(path), wfjtLaunchPathRe.MatchString(path):
		if page == nil {
			return data
		}
		extra := NewOMap()
		data.Delete("extra_vars")
		mapping := wfjtAskMapping
		if jtLaunchPathRe.MatchString(path) {
			mapping = jtAskMapping
			needed, _ := omapGet(page, "passwords_needed_to_start").([]any)
			if len(needed) > 0 {
				pw := NewOMap()
				for _, p := range needed {
					pw.Set(fmt.Sprint(p), "")
				}
				data.Set("credential_passwords", pw)
			} else {
				data.Delete("credential_passwords")
			}
		}
		if vars, ok := omapGet(page, "variables_needed_to_start").([]any); ok {
			for _, v := range vars {
				if _, has := extra.Get(fmt.Sprint(v)); !has {
					extra.Set(fmt.Sprint(v), "")
				}
			}
		}
		if extra.Len() > 0 {
			data.Set("extra_vars", extra)
		}
		defaults, _ := omapGet(page, "defaults").(*OMap)
		for _, m := range mapping {
			field, ask := m[0], m[1]
			if omapGet(page, ask) != true {
				data.Delete(field)
				continue
			}
			switch field {
			case "inventory", "execution_environment":
				data.Set(field, omapGet(defaults, field, "id"))
			case "credentials", "labels", "instance_groups":
				data.Set(field, idsOf(omapGet(defaults, field)))
			default:
				data.Set(field, omapGet(defaults, field))
			}
		}
	case jobRelaunchRe.MatchString(path):
		needed, _ := omapGet(page, "passwords_needed_to_start").([]any)
		if len(needed) > 0 {
			pw := NewOMap()
			for _, p := range needed {
				pw.Set(fmt.Sprint(p), "")
			}
			data.Set("credential_passwords", pw)
		} else {
			data.Delete("credential_passwords")
		}
	case hostGroupsRe.MatchString(path):
		data.Delete("inventory")
	case adHocUnderRe.MatchString(path):
		data.Delete("inventory")
		data.Delete("limit")
	case instanceDetailRe.MatchString(path):
		data.Delete("node_type")
		data.Delete("hostname")
		data.Delete("ip_address")
	case igDetailRe.MatchString(path):
		if omapGet(page, "is_container_group") == true {
			data.Delete("policy_instance_percentage")
			data.Delete("policy_instance_minimum")
			data.Delete("policy_instance_list")
		}
	case appDetailRe.MatchString(path):
		data.Delete("client_secret")
	case userDetailRe.MatchString(path):
		// UserSerializer.to_representation adds auth.
		if v := omapGet(page, "auth"); v != nil {
			data.Set("auth", v)
		}
	}
	return data
}

// paginationHTML is PageNumberPagination.to_html for a list response.
func paginationHTML(r *http.Request, data *OMap) string {
	countV, ok := data.Get("count")
	if !ok {
		return ""
	}
	if _, ok := data.Get("results"); !ok {
		return ""
	}
	count, _ := strconv.Atoi(fmt.Sprint(countV))
	pageSize := 25
	if v := r.URL.Query().Get("page_size"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			pageSize = n
			if pageSize > 200 {
				pageSize = 200
			}
		}
	}
	numPages := 1
	if count > 0 {
		numPages = (count + pageSize - 1) / pageSize
	}
	if numPages <= 1 {
		return ""
	}
	current := 1
	if v := r.URL.Query().Get("page"); v == "last" {
		current = numPages
	} else if n, err := strconv.Atoi(v); err == nil && n >= 1 {
		current = n
	}
	if current > numPages {
		current = numPages
	}
	base := RequestScheme(r) + "://" + r.Host + r.URL.RequestURI()
	pageURL := func(n int) string {
		u, _ := url.Parse(base)
		q := u.Query()
		if n == 1 {
			q.Del("page")
		} else {
			q.Set("page", strconv.Itoa(n))
		}
		u.RawQuery = sortedQuery(q)
		return u.String()
	}
	var b strings.Builder
	b.WriteString("<ul class=\"pagination\">\n  ")
	link := func(key, label string) {
		v, _ := data.Get(key)
		if u, ok := v.(string); ok && u != "" {
			fmt.Fprintf(&b, "\n    <li>\n      <a href=\"%s\" aria-label=\"%s\">\n        <span aria-hidden=\"true\">%s</span>\n      </a>\n    </li>\n  ", djangoEscape(u), label, map[string]string{"Previous": "&laquo;", "Next": "&raquo;"}[label])
		} else {
			fmt.Fprintf(&b, "\n    <li class=\"disabled\">\n      <a href=\"#\" aria-label=\"%s\">\n        <span aria-hidden=\"true\">%s</span>\n      </a>\n    </li>\n  ", label, map[string]string{"Previous": "&laquo;", "Next": "&raquo;"}[label])
		}
	}
	link("previous", "Previous")
	b.WriteString("\n\n  ")
	for _, n := range displayedPageNumbers(current, numPages) {
		switch {
		case n == 0:
			b.WriteString("\n    \n      <li class=\"disabled\">\n        <a href=\"#\"><span aria-hidden=\"true\">&hellip;</span></a>\n      </li>\n    \n  ")
		case n == current:
			fmt.Fprintf(&b, "\n    \n      \n        <li class=\"active\">\n          <a href=\"%s\">%d</a>\n        </li>\n      \n    \n  ", djangoEscape(pageURL(n)), n)
		default:
			fmt.Fprintf(&b, "\n    \n      \n        <li>\n          <a href=\"%s\">%d</a>\n        </li>\n      \n    \n  ", djangoEscape(pageURL(n)), n)
		}
	}
	b.WriteString("\n\n  ")
	link("next", "Next")
	b.WriteString("\n</ul>\n")
	return b.String()
}

// sortedQuery is urlencode(sorted(query_dict.items()), doseq=True).
func sortedQuery(q url.Values) string {
	keys := make([]string, 0, len(q))
	for k := range q {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	var parts []string
	for _, k := range keys {
		for _, v := range q[k] {
			parts = append(parts, url.QueryEscape(k)+"="+url.QueryEscape(v))
		}
	}
	return strings.Join(parts, "&")
}

// displayedPageNumbers is _get_displayed_page_numbers (0 is a break).
func displayedPageNumbers(current, final int) []int {
	if final <= 5 {
		out := make([]int, 0, final)
		for i := 1; i <= final; i++ {
			out = append(out, i)
		}
		return out
	}
	included := map[int]bool{1: true, current - 1: true, current: true, current + 1: true, final: true}
	if current <= 4 {
		included[2], included[3] = true, true
	}
	if current >= final-3 {
		included[final-1], included[final-2] = true, true
	}
	var nums []int
	for n := range included {
		if n > 0 && n <= final {
			nums = append(nums, n)
		}
	}
	sort.Ints(nums)
	if current > 4 {
		nums = append([]int{nums[0], 0}, nums[1:]...)
	}
	if current < final-3 {
		nums = append(nums[:len(nums)-1:len(nums)-1], 0, nums[len(nums)-1])
	}
	return nums
}

// noSuperuserBypass are the detail views with always_allow_superuser =
// False: superusers are checked like everyone else.
var noSuperuserBypass = regexp.MustCompile(`^/api/v2/(instance_groups|execution_environments|hosts)/[^/]+/$`)

// noSuperuserBypassList are the list views with always_allow_superuser =
// False.
var noSuperuserBypassList = regexp.MustCompile(`^/api/v2/(execution_environments|hosts|ad_hoc_commands|inventory_sources|workflow_job_templates|inventories/[^/]+/inventory_sources)/$`)

// canDelete is the DELETE permission check: superusers are always allowed
// (ModelAccessPermission.always_allow_superuser), others when the object
// reports it may be deleted.
func canDelete(u *auth.User, path string, object *OMap) bool {
	if u == nil {
		return false
	}
	if u.IsSuperuser && !noSuperuserBypass.MatchString(path) {
		return true
	}
	if object != nil {
		if sf, ok := object.Get("summary_fields"); ok {
			if sfm, ok := sf.(*OMap); ok {
				if uc, ok := sfm.Get("user_capabilities"); ok {
					if ucm, ok := uc.(*OMap); ok {
						if d, ok := ucm.Get("delete"); ok {
							return d == true
						}
					}
				}
			}
		}
	}
	return false
}

// browsablePage renders the page for a buffered response.
func (s *Server) browsablePage(r *http.Request, next http.Handler, bw *bufferWriter, reqBody []byte, start time.Time) string {
	u := auth.UserFrom(r.Context())
	status := bw.status
	if status == 0 {
		status = http.StatusOK
	}
	doc := s.viewDoc(r, next, r.URL.Path)
	name := docString(doc, "name")
	description := ""
	if status != http.StatusUnauthorized && status != http.StatusForbidden && doc != nil {
		description = `<div class="description">` + descriptionHTML(docString(doc, "description")) + "</div>"
	}
	allow := map[string]bool{}
	for _, m := range strings.Split(bw.header.Get("Allow"), ",") {
		allow[strings.TrimSpace(m)] = true
	}

	// The response content, as the default renderer wrote it.
	contentType := "application/json"
	var content string
	var data *OMap
	switch {
	case bw.header.Get(browsableInternalHTML) != "":
		contentType = "text/plain ;utf-8"
		content = bw.body.String()
	case strings.HasPrefix(bw.header.Get("Content-Type"), "text/plain"):
		contentType = "text/plain ;utf-8"
		content = djangoUrlize(bw.body.String())
	case bw.body.Len() > 0:
		if v, err := DecodeOrdered(bw.body.String()); err == nil {
			data, _ = v.(*OMap)
			content = djangoUrlize(pyJSONIndent(v))
		} else {
			content = djangoUrlize(bw.body.String())
		}
	}

	// Forms: what the user may do here (show_form_for_method).
	permitted := status != http.StatusUnauthorized && status != http.StatusForbidden
	optionsForm := allow["OPTIONS"] && permitted
	deleteForm := allow["DELETE"] && permitted && canDelete(u, r.URL.Path, data)
	var actions *OMap
	if u != nil && permitted && status != http.StatusForbidden && r.Method != http.MethodOptions && r.Method != http.MethodDelete && (allow["POST"] || allow["PUT"]) {
		if d := s.internalOptions(r, next, r.URL.Path); d != nil {
			if a, ok := d.Get("actions"); ok {
				actions, _ = a.(*OMap)
			}
		}
	}
	rejected := (r.Method == http.MethodPost || r.Method == http.MethodPut || r.Method == http.MethodPatch) && status >= 400 && status < 500
	rejectedContent := func() string {
		if v, err := DecodeOrdered(string(reqBody)); err == nil {
			return pyJSONIndent(v)
		}
		return string(reqBody)
	}
	var postForm, putForm string
	showPost, showPut := false, false
	var getData *OMap
	if r.Method == http.MethodGet && status >= 200 && status < 300 {
		getData = data
	}
	// show_form_for_method: superusers pass the permission check outside
	// the views with always_allow_superuser = False; others need the
	// action the view's OPTIONS grants them.
	bypass := u != nil && u.IsSuperuser && !noSuperuserBypass.MatchString(r.URL.Path) && !noSuperuserBypassList.MatchString(r.URL.Path)
	formFor := func(method string) (*OMap, bool) {
		if u == nil || !permitted || !allow[method] || r.Method == http.MethodOptions || r.Method == http.MethodDelete {
			return nil, false
		}
		var fields *OMap
		if actions != nil {
			if f, ok := actions.Get(method); ok {
				fields, _ = f.(*OMap)
			}
		}
		return fields, fields != nil || bypass
	}
	if fm, ok := formFor("POST"); ok {
		showPost = true
		if fm != nil {
			// Declared (not model) fields have no initial from a default.
			useDefaults := !jobRelaunchRe.MatchString(r.URL.Path)
			postForm = pyJSONIndent(adjustRawData(r.URL.Path, rawFormData(r.URL.Path, fm, nil, useDefaults), getData))
		}
		if rejected {
			postForm = rejectedContent()
		}
	}
	if fm, ok := formFor("PUT"); ok {
		showPut = true
		if fm != nil {
			putForm = pyJSONIndent(adjustRawData(r.URL.Path, rawFormData(r.URL.Path, fm, getData, true), getData))
		}
		if rejected {
			putForm = rejectedContent()
		}
	}

	formats := renderFormats(s.viewRenders(next, r.URL.Path), r.URL.Path)
	var paginator string
	if data != nil && r.Method == http.MethodGet && status == http.StatusOK {
		paginator = paginationHTML(r, data)
	}
	csrf := ""
	if w := r.Context().Value(csrfTokenKey{}); w != nil {
		csrf, _ = w.(string)
	}
	return renderBrowsable(browsableContext{
		Name: name, FullPath: r.URL.RequestURI(), Path: r.URL.Path, Crumbs: s.breadcrumbs(r, next), User: u,
		AllowGet: allow["GET"], Formats: formats, OptionsForm: optionsForm, DeleteForm: deleteForm,
		Description: description, Paginator: paginator, Method: r.Method, Status: status,
		Headers: pageHeaders(bw.header, contentType, time.Since(start), u != nil, r.URL.Path != "/api/v2/metrics/"), Content: content,
		Deprecated: bw.header.Get("Warning") == deprecatedWarning, Parses: viewParses(doc),
		EditForms: status != http.StatusForbidden, ShowPost: showPost, PostContent: postForm, ShowPut: showPut, PutContent: putForm,
		PutButton: allow["PUT"], PatchButton: allow["PATCH"], CSRF: csrf, Version: s.Cfg.Version,
	})
}

type csrfTokenKey struct{}

type browsableContext struct {
	Name, FullPath, Path string
	Crumbs               []crumb
	User                 *auth.User
	LoginContext         bool
	AllowGet             bool
	Formats              []string
	OptionsForm          bool
	DeleteForm           bool
	Description          string
	Paginator            string
	Method               string
	Status               int
	Headers              [][2]string
	Content              string
	EditForms            bool
	ShowPost, ShowPut    bool
	PostContent          string
	PutContent           string
	PutButton            bool
	PatchButton          bool
	CSRF                 string
	Version              string
	// Body replaces the content block (the login form).
	Body       string
	Deprecated bool
	// Parses are the media types of the view's parsers.
	Parses []string
}

// renderBrowsable is rest_framework/api.html over base.html.
func renderBrowsable(c browsableContext) string {
	e := djangoEscape
	var b strings.Builder
	v := e(c.Version)
	fmt.Fprintf(&b, `



<!DOCTYPE html>
<html>
  <head>



        <meta http-equiv="Content-Type" content="text/html; charset=utf-8"/>
        <meta name="robots" content="NONE,NOARCHIVE" />


      <title>%s &middot; ASCENDER REST API</title>


<link href="/static/media/favicon.ico?v=%s" rel="shortcut icon" />


  <link rel="stylesheet" type="text/css" href="/static/rest_framework/css/bootstrap.min.css" />
  <link rel="stylesheet" type="text/css" href="/static/api/api.css?v=%s" />


        <link rel="stylesheet" type="text/css" href="/static/rest_framework/css/prettify.css"/>
        <link rel="stylesheet" type="text/css" href="/static/rest_framework/css/default.css"/>
        `, e(c.Name), v, v)
	if c.Body == "" {
		b.WriteString("<style>" + browsableCodeStyle + "</style>")
	}
	fmt.Fprintf(&b, `




  </head>


  <body class="">

    <div class="wrapper">

  <div class="navbar navbar-fixed-top">
    <div class="container">
      <div class="navbar-header">
        <button type="button btn btn-primary" class="navbar-toggle collapsed" data-toggle="collapse" data-target="#navbar-collapse" aria-expanded="false">
          <span class="sr-only">Toggle navigation</span>
          <span class="icon-bar"></span>
          <span class="icon-bar"></span>
          <span class="icon-bar"></span>
        </button>
        <a class="navbar-brand" href="/api/">
          <img class="logo" src="/static/media/Ascender_logo.svg" width="20px">
          <span>REST API</span>
        </a>
        <a class="navbar-title" href="%s">
          <span>&nbsp;&mdash; %s</span>
        </a>
      </div>
      <div class="collapse navbar-collapse" id="navbar-collapse">
        <ul class="nav navbar-nav navbar-right">
          `, e(c.FullPath), e(c.Name))
	if c.User != nil && !c.LoginContext {
		full := strings.TrimSpace(c.User.FirstName + " " + c.User.LastName)
		title := "Logged in as " + c.User.Username
		visible := ""
		if full != "" {
			title += " (" + full + ")"
			visible = `<span class="visible-xs-inline"> (` + e(full) + `)</span>`
		}
		fmt.Fprintf(&b, `
          <li><a href="/api/v2/me/" data-toggle="tooltip" data-placement="bottom" data-delay="1000" title="%s"><span class="glyphicon glyphicon-user"></span> <span class="visible-xs-inline">Logged in as </span>%s%s</a></li>
          <li><form method="post" action="/api/logout/?next=/api/login/" style="display: inline;"><input type="hidden" name="csrfmiddlewaretoken" value="%s"><button type="submit" class="btn btn-link navbar-btn" style="padding: 15px; margin: 0; border: 0; color: inherit;" data-toggle="tooltip" data-placement="bottom" data-delay="1000" title="Log out"><span class="glyphicon glyphicon-log-out"></span>Log out</button></form></li>
          `, e(title), e(c.User.Username), visible, e(c.CSRF))
	} else {
		fmt.Fprintf(&b, `
          <li><a href="/api/login/?next=%s" data-toggle="tooltip" data-placement="bottom" data-delay="1000" title="Log in"><span class="glyphicon glyphicon-log-in"></span>Log in</a></li>
          `, e(c.FullPath))
	}
	b.WriteString(`
          <li><a href="/docs/user-guide/rest-api/" target="_blank" data-toggle="tooltip" data-placement="bottom" data-delay="1000" title="API Guide"><span class="glyphicon glyphicon-question-sign"></span><span class="visible-xs-inline">API Guide</span></a></li>
          <li><a href="/" data-toggle="tooltip" data-placement="bottom" data-delay="1000" title="Back to application"><span class="glyphicon glyphicon-circle-arrow-left"></span><span class="visible-xs-inline">Back to application</span></a></li>
          <li class="hidden-xs"><a href="#" class="resize" data-toggle="tooltip" data-placement="bottom" data-delay="1000" title="Resize"><span class="glyphicon glyphicon-resize-full"></span></a></li>
        </ul>
      </div>
    </div>
  </div>


      <div class="container">
        `)
	if c.Body != "" {
		b.WriteString("\n\n\n        <!-- Content -->\n        <div id=\"content\" role=\"main\" aria-label=\"content\">\n          ")
		b.WriteString(c.Body)
		b.WriteString("\n        </div><!-- /.content -->\n      </div><!-- /.container -->\n    </div><!-- ./wrapper -->\n\n    \n\n    ")
	} else {
		b.WriteString("\n          <ul class=\"breadcrumb\">\n            ")
		for i, cr := range c.Crumbs {
			if i == len(c.Crumbs)-1 {
				fmt.Fprintf(&b, "\n              \n                <li class=\"active\"><a href=\"%s\">%s</a></li>\n              \n            ", e(cr.url), e(cr.name))
			} else {
				fmt.Fprintf(&b, "\n              \n                <li><a href=\"%s\">%s</a></li>\n              \n            ", e(cr.url), e(cr.name))
			}
		}
		if len(c.Crumbs) == 0 {
			b.WriteString("&nbsp;")
		}
		b.WriteString("\n          </ul>\n        \n\n        <!-- Content -->\n        <div id=\"content\" role=\"main\" aria-label=\"content\">\n          \n  ")
		if c.Deprecated {
			b.WriteString("\n    <div class=\"breadcrumb\" style=\"background: #FCC;\">\n        <b>This resource has been deprecated and will be removed in a future release.</b>\n    </div>\n  ")
		}
		b.WriteString("\n\n\n          <div class=\"region\"  aria-label=\"request form\">\n          \n\n          ")
		renderRequestForms(&b, c)
		fmt.Fprintf(&b, `
          </div>

            <div class="content-main" role="main"  aria-label="main content">
              <div class="page-header">
                <h1>%s</h1>
              </div>
              <div class="pull-left">

                  %s

              </div>

              `, e(c.Name), c.Description)
		if c.Paginator != "" {
			b.WriteString("\n                <nav class=\"pull-right\">\n                  " + c.Paginator + "\n                </nav>\n              ")
		}
		fmt.Fprintf(&b, `

              <div class="request-info" aria-label="request info">
                <pre class="prettyprint"><b>%s</b> %s</pre>
              </div>

              <div class="response-info" aria-label="response info">
                <pre class="prettyprint"><span class="meta nocode"><b>HTTP %d %s</b>`, e(c.Method), e(c.FullPath), c.Status, e(statusText(c.Status)))
		for _, h := range c.Headers {
			fmt.Fprintf(&b, "\n<b>%s:</b> <span class=\"lit\">%s</span>", e(h[0]), djangoUrlize(h[1]))
		}
		b.WriteString("\n\n</span>" + c.Content + "</pre>\n              </div>\n            </div>\n\n            ")
		renderEditForms(&b, c)
		b.WriteString("\n          \n\n        </div><!-- /.content -->\n      </div><!-- /.container -->\n    </div><!-- ./wrapper -->\n\n    \n\n    ")
	}
	fmt.Fprintf(&b, `
<div id="footer">
  <div class="container">
    <div class="row">
      <div class="col-sm-6">
      </div>
      <div class="col-sm-6 footer-copyright">
        Copyright &copy; %d <a href="http://www.ciq.com" target="_blank">Ctrl IQ</a>, Inc. All Rights Reserved.<br>
        Copyright &copy; 2021 <a href="http://www.redhat.com" target="_blank">Red Hat</a>, Inc. All Rights Reserved.
      </div>
    </div>
  </div>
</div>
<div class="hidden">
  <a class="hide-description pull-right js-tooltip" href="#" title="Hide Description"><span class="glyphicon glyphicon-remove-sign"></span></a>
  <a class="toggle-description js-tooltip" href="#" title="Show/Hide Description"><span class="glyphicon glyphicon-question-sign"></span></a>
</div>

      <script type="application/json" id="drf_csrf">
        {
          "csrfHeaderName": "X-CSRFTOKEN",
          "csrfToken": "%s"
        }
      </script>
      <script src="/static/rest_framework/js/jquery-3.8.0.min.js"></script>
      <script src="/static/rest_framework/js/ajax-form.js"></script>
      <script src="/static/rest_framework/js/csrf.js"></script>
      <script src="/static/rest_framework/js/bootstrap.min.js"></script>
      <script src="/static/rest_framework/js/prettify-min.js"></script>
      <script src="/static/rest_framework/js/default.js"></script>
      <script src="/static/rest_framework/js/load-ajax-form.js"></script>

<script src="/static/api/api.js?v=%s"></script>


  </body>

</html>
`, time.Now().Year(), e(c.CSRF), v)
	return b.String()
}

func renderRequestForms(b *strings.Builder, c browsableContext) {
	e := djangoEscape
	if c.AllowGet {
		fmt.Fprintf(b, `
            <form id="get-form" class="pull-right">
              <fieldset>

                  <div class="btn-group format-selection">
                    <a class="btn btn-primary js-tooltip" href="%s" rel="nofollow" title="Make a GET request on the %s resource">GET</a>

                    <button class="btn btn-primary dropdown-toggle js-tooltip" data-toggle="dropdown" title="Specify a format for the GET request">
                      <span class="caret"></span>
                    </button>
                    <ul class="dropdown-menu">
                      `, e(c.FullPath), e(c.Name))
		for _, f := range c.Formats {
			fmt.Fprintf(b, `
                        <li>
                          <a class="js-tooltip format-option" href="%s" rel="nofollow" title="Make a GET request on the %s resource with the format set to `+"`%s`"+`">%s</a>
                        </li>
                      `, e(addQueryParam(c.FullPath, "format", f)), e(c.Name), e(f), e(f))
		}
		b.WriteString(`
                    </ul>
                  </div>

              </fieldset>
            </form>
          `)
	}
	b.WriteString("\n\n          ")
	if c.OptionsForm {
		fmt.Fprintf(b, `
            <form class="button-form" action="%s" data-method="OPTIONS">
              <button class="btn btn-primary js-tooltip" title="Make an OPTIONS request on the %s resource">OPTIONS</button>
            </form>
          `, e(c.FullPath), e(c.Name))
	}
	b.WriteString("\n\n          ")
	if c.DeleteForm {
		fmt.Fprintf(b, `
            <button class="btn btn-danger button-form js-tooltip" title="Make a DELETE request on the %s resource" data-toggle="modal" data-target="#deleteModal">DELETE</button>

            <!-- Delete Modal -->
            <div class="modal fade" id="deleteModal" tabindex="-1" role="dialog" aria-labelledby="myModalLabel" aria-hidden="true">
              <div class="modal-dialog">
                <div class="modal-content">
                  <div class="modal-body">
                    <h4 class="text-center">Are you sure you want to delete this %s?</h4>
                  </div>
                  <div class="modal-footer">
                    <button type="button" class="btn btn-default" data-dismiss="modal">Cancel</button>
                    <form class="button-form" action="%s" data-method="DELETE">
                      <button class="btn btn-danger">Delete</button>
                    </form>
                  </div>
                </div>
              </div>
            </div>
          `, e(c.Name), e(c.Name), e(c.FullPath))
	}
	b.WriteString("\n\n          \n\n          \n\n          ")
}

func rawDataForm(content string, parses []string) string {
	options := ""
	for i, m := range parses {
		sel := ""
		if i == 0 {
			sel = " selected"
		}
		options += `  <option value="` + djangoEscape(m) + `"` + sel + `>` + djangoEscape(m) + "</option>\n"
	}
	return `


  <div class="form-group">
    <label for="id__content_type" class="col-sm-2 control-label">Media type:</label>
    <div class="col-sm-10">
      <select name="_content_type" data-override="content-type" id="id__content_type" class="form-control">
` + options + `
</select>
      <span class="help-block"></span>
    </div>
  </div>

  <div class="form-group">
    <label for="id__content" class="col-sm-2 control-label">Content:</label>
    <div class="col-sm-10">
      <textarea name="_content" cols="40" rows="10" data-override="content" id="id__content" class="form-control">
` + djangoEscape(content) + `</textarea>
      <span class="help-block"></span>
    </div>
  </div>


`
}

func renderEditForms(b *strings.Builder, c browsableContext) {
	e := djangoEscape
	if !c.EditForms {
		return
	}
	b.WriteString("\n              ")
	if c.ShowPost {
		fmt.Fprintf(b, `
                <div >


                  <div class="well tab-content">


                    <div  id="post-generic-content-form">

                        <form action="%s" method="POST" class="form-horizontal">
                          <fieldset>
                            %s
                            <div class="form-actions">
                              <button class="btn btn-primary js-tooltip" title="Make a POST request on the %s resource">POST</button>
                            </div>
                          </fieldset>
                        </form>

                    </div>
                  </div>
                </div>
              `, e(c.FullPath), rawDataForm(c.PostContent, c.Parses), e(c.Name))
	}
	b.WriteString("\n\n              ")
	if c.ShowPut {
		buttons := ""
		if c.PutButton {
			buttons += fmt.Sprintf("\n                              \n                                <button class=\"btn btn-primary js-tooltip\" title=\"Make a PUT request on the %s resource\">PUT</button>\n                              ", e(c.Name))
		}
		if c.PatchButton {
			buttons += fmt.Sprintf("\n                              \n                              <button data-method=\"PATCH\" class=\"btn btn-primary js-tooltip\" title=\"Make a PATCH request on the %s resource\">PATCH</button>\n                                ", e(c.Name))
		}
		fmt.Fprintf(b, `
                <div >


                  <div class="well tab-content">


                    <div  id="put-generic-content-form">

                        <form action="%s" data-method="PUT" class="form-horizontal">
                          <fieldset>
                            %s
                            <div class="form-actions">%s
                            </div>
                          </fieldset>
                        </form>

                    </div>
                  </div>
                </div>
              `, e(c.FullPath), rawDataForm(c.PutContent, c.Parses), buttons)
	}
	b.WriteString("\n            ")
}

// addQueryParam is the add_query_param template tag: the full path with
// the parameter set, the query re-encoded in sorted order.
func addQueryParam(fullPath, key, val string) string {
	u, err := url.Parse(fullPath)
	if err != nil {
		return fullPath
	}
	q := u.Query()
	q.Set(key, val)
	u.RawQuery = sortedQuery(q)
	return u.RequestURI()
}

// withCSRFToken puts the page's CSRF token in the request context.
func withCSRFToken(ctx context.Context, tok string) context.Context {
	return context.WithValue(ctx, csrfTokenKey{}, tok)
}
