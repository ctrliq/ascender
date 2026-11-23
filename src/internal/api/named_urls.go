package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf8"
)

// Named URLs (URLModificationMiddleware): /api/v2/<resource>/<named>/...
// may name an object instead of giving its id, as NAMED_URL_FORMATS
// describes (<name>++<organization.name> for a job template). The path is
// rewritten to the id before routing. A name that parses but matches
// nothing becomes id 0, so the view answers as for a missing object (or
// 401 to an anonymous user). A request whose path was rewritten and that a
// view refuses with 403 is answered 404 "Not found." instead
// (api_exception_handler), so a named URL does not tell whether the object
// exists.

type namedURLNode struct {
	Fields  []string   `json:"fields"`
	AdjList [][]string `json:"adj_list"`
}

var namedURLGraph = func() map[string]namedURLNode {
	b, err := metadataFS.ReadFile("metadata/named_url_graph.json")
	if err != nil {
		panic(err)
	}
	var g map[string]namedURLNode
	if err := json.Unmarshal(b, &g); err != nil {
		panic(err)
	}
	return g
}()

// namedURLColumns maps each resource's lookup keys to SQL, with the FROM
// clause the keys need.
var namedURLColumns = map[string]struct {
	from string
	cols map[string]string
}{
	"execution_environments": {"main_executionenvironment x", map[string]string{"name": "x.name"}},
	"organizations":          {"main_organization x", map[string]string{"name": "x.name"}},
	"teams":                  {"main_team x LEFT JOIN main_organization o ON o.id = x.organization_id", map[string]string{"name": "x.name", "organization__name": "o.name"}},
	"credential_types":       {"main_credentialtype x", map[string]string{"name": "x.name", "kind": "x.kind"}},
	"credentials": {"main_credential x JOIN main_credentialtype ct ON ct.id = x.credential_type_id LEFT JOIN main_organization o ON o.id = x.organization_id",
		map[string]string{"name": "x.name", "credential_type__name": "ct.name", "credential_type__kind": "ct.kind", "organization__name": "o.name"}},
	"notification_templates": {"main_notificationtemplate x LEFT JOIN main_organization o ON o.id = x.organization_id", map[string]string{"name": "x.name", "organization__name": "o.name"}},
	"job_templates": {"main_jobtemplate jt JOIN main_unifiedjobtemplate x ON x.id = jt.unifiedjobtemplate_ptr_id LEFT JOIN main_organization o ON o.id = x.organization_id",
		map[string]string{"name": "x.name", "organization__name": "o.name"}},
	"projects": {"main_project p JOIN main_unifiedjobtemplate x ON x.id = p.unifiedjobtemplate_ptr_id LEFT JOIN main_organization o ON o.id = x.organization_id",
		map[string]string{"name": "x.name", "organization__name": "o.name"}},
	"inventories": {"main_inventory x LEFT JOIN main_organization o ON o.id = x.organization_id", map[string]string{"name": "x.name", "organization__name": "o.name"}},
	"hosts": {"main_host x JOIN main_inventory i ON i.id = x.inventory_id LEFT JOIN main_organization o ON o.id = i.organization_id",
		map[string]string{"name": "x.name", "inventory__name": "i.name", "inventory__organization__name": "o.name"}},
	"groups": {"main_group x JOIN main_inventory i ON i.id = x.inventory_id LEFT JOIN main_organization o ON o.id = i.organization_id",
		map[string]string{"name": "x.name", "inventory__name": "i.name", "inventory__organization__name": "o.name"}},
	"inventory_sources": {"main_inventorysource s JOIN main_unifiedjobtemplate x ON x.id = s.unifiedjobtemplate_ptr_id LEFT JOIN main_inventory i ON i.id = s.inventory_id LEFT JOIN main_organization o ON o.id = i.organization_id",
		map[string]string{"name": "x.name", "inventory__name": "i.name", "inventory__organization__name": "o.name"}},
	"instance_groups": {"main_instancegroup x", map[string]string{"name": "x.name"}},
	"workflow_job_templates": {"main_workflowjobtemplate w JOIN main_unifiedjobtemplate x ON x.id = w.unifiedjobtemplate_ptr_id LEFT JOIN main_organization o ON o.id = x.organization_id",
		map[string]string{"name": "x.name", "organization__name": "o.name"}},
	"workflow_job_template_nodes": {"main_workflowjobtemplatenode x LEFT JOIN main_unifiedjobtemplate w ON w.id = x.workflow_job_template_id LEFT JOIN main_organization o ON o.id = w.organization_id",
		map[string]string{"identifier": "x.identifier", "workflow_job_template__name": "w.name", "workflow_job_template__organization__name": "o.name"}},
	"labels":       {"main_label x LEFT JOIN main_organization o ON o.id = x.organization_id", map[string]string{"name": "x.name", "organization__name": "o.name"}},
	"applications": {"main_oauth2application x LEFT JOIN main_organization o ON o.id = x.organization_id", map[string]string{"name": "x.name", "organization__name": "o.name"}},
	"users":        {"auth_user x", map[string]string{"username": "x.username"}},
	"instances":    {"main_instance x", map[string]string{"hostname": "x.hostname"}},
}

// parseNamedURL is populate_named_url_query_kwargs: the lookups a named
// URL stands for, walking the resource's node and its foreign keys in
// order; an empty component skips a foreign key.
func parseNamedURL(resource, named string) (map[string]string, bool) {
	if pyPositiveDigits(named) {
		return nil, false
	}
	named = strings.ReplaceAll(named, "[+]", "%2B")
	names := strings.Split(named, "++")
	kwargs := map[string]string{}
	idx := 0
	var walk func(node string, prefix string) bool
	walk = func(node string, prefix string) bool {
		n, ok := namedURLGraph[node]
		if !ok {
			return false
		}
		if idx >= len(names) {
			return false
		}
		if names[idx] == "" {
			idx++
			return true
		}
		parts := strings.Split(names[idx], "+")
		if len(parts) != len(n.Fields) {
			return false
		}
		for i, f := range n.Fields {
			kwargs[prefix+f] = pyUnquote(parts[i])
		}
		idx++
		for _, adj := range n.AdjList {
			if len(adj) != 2 || !walk(adj[1], prefix+adj[0]+"__") {
				return false
			}
		}
		return true
	}
	if !walk(resource, "") {
		return kwargs, false
	}
	return kwargs, idx == len(names)
}

// namedURLLookup finds the first object the lookups match.
func (s *Server) namedURLLookup(ctx context.Context, resource string, kwargs map[string]string) (int64, bool) {
	spec, ok := namedURLColumns[resource]
	if !ok {
		return 0, false
	}
	var where []string
	var args []any
	for k, v := range kwargs {
		col, ok := spec.cols[k]
		if !ok {
			return 0, false
		}
		args = append(args, v)
		where = append(where, fmt.Sprintf("%s = $%d", col, len(args)))
	}
	idCol := "x.id"
	switch resource {
	case "job_templates":
		idCol = "jt.unifiedjobtemplate_ptr_id"
	case "projects":
		idCol = "p.unifiedjobtemplate_ptr_id"
	case "inventory_sources":
		idCol = "s.unifiedjobtemplate_ptr_id"
	case "workflow_job_templates":
		idCol = "w.unifiedjobtemplate_ptr_id"
	}
	q := "SELECT " + idCol + " FROM " + spec.from
	if len(where) > 0 {
		q += " WHERE " + strings.Join(where, " AND ")
	}
	var id int64
	if err := s.Q().QueryRow(ctx, q+" ORDER BY "+idCol+" LIMIT 1", args...).Scan(&id); err != nil {
		return 0, false
	}
	return id, true
}

// namedURLToID is _named_url_to_pk.
func (s *Server) namedURLToID(ctx context.Context, resource, named string) string {
	kwargs, ok := parseNamedURL(resource, named)
	if ok {
		if id, found := s.namedURLLookup(ctx, resource, kwargs); found {
			return strconv.FormatInt(id, 10)
		}
		return "0"
	}
	// A job template named without its organization, as before named
	// URLs: the first one by that (unquoted) name, unless int() would
	// take the name for a number.
	if resource == "job_templates" && !strings.Contains(named, "++") {
		if !pyIntParses(named) {
			var id int64
			if s.Q().QueryRow(ctx, `SELECT jt.unifiedjobtemplate_ptr_id FROM main_jobtemplate jt JOIN main_unifiedjobtemplate u ON u.id = jt.unifiedjobtemplate_ptr_id
				LEFT JOIN main_organization o ON o.id = u.organization_id WHERE u.name = $1 ORDER BY o.created NULLS LAST, u.id LIMIT 1`, pyUnquote(named)).Scan(&id) == nil {
				return strconv.FormatInt(id, 10)
			}
		}
	}
	return named
}

// namedURLRewrittenKey marks a request whose path a named URL rewrote
// (request.META['ascender.named_url_rewritten']).
type namedURLRewrittenKey struct{}

// namedURLRewritten reports whether the request's path was rewritten.
func namedURLRewritten(ctx context.Context) bool {
	v, _ := ctx.Value(namedURLRewrittenKey{}).(bool)
	return v
}

// pyPositiveDigits is named_url.isdigit() and int(named_url) > 0: every
// character a decimal digit (str.isdigit, of which int() takes the
// decimal ones), leading zeros and all, and not all zeros.
func pyPositiveDigits(s string) bool {
	if s == "" {
		return false
	}
	nonzero := false
	for _, r := range s {
		v, ok := decimalDigit(r)
		if !ok {
			return false
		}
		if v != 0 {
			nonzero = true
		}
	}
	return nonzero
}

// decimalDigit is a decimal digit's value (Unicode category Nd, whose
// digits come in runs of ten from zero).
func decimalDigit(r rune) (int, bool) {
	if r >= '0' && r <= '9' {
		return int(r - '0'), true
	}
	if !unicode.Is(unicode.Nd, r) {
		return 0, false
	}
	for _, rg := range unicode.Nd.R16 {
		if lo, hi := rune(rg.Lo), rune(rg.Hi); r >= lo && r <= hi {
			return int(r-lo) % 10, true
		}
	}
	for _, rg := range unicode.Nd.R32 {
		if lo, hi := rune(rg.Lo), rune(rg.Hi); r >= lo && r <= hi {
			return int(r-lo) % 10, true
		}
	}
	return 0, false
}

// pyIntParses reports whether Python's int() accepts s: surrounding
// whitespace, an optional sign, then decimal digits with single
// underscores between them.
func pyIntParses(s string) bool {
	s = strings.TrimFunc(s, func(r rune) bool {
		return unicode.IsSpace(r) || r == '\x1c' || r == '\x1d' || r == '\x1e' || r == '\x1f'
	})
	if s != "" && (s[0] == '+' || s[0] == '-') {
		s = s[1:]
	}
	if s == "" {
		return false
	}
	prevDigit := false
	for _, r := range s {
		if r == '_' {
			if !prevDigit {
				return false
			}
			prevDigit = false
			continue
		}
		if _, ok := decimalDigit(r); !ok {
			return false
		}
		prevDigit = true
	}
	return prevDigit
}

// pyUnquote is urllib.parse.unquote: each %XX run decoded to bytes, read
// as UTF-8 with invalid bytes replaced; anything else is kept as it is.
func pyUnquote(s string) string {
	if !strings.Contains(s, "%") {
		return s
	}
	var b strings.Builder
	var pending []byte
	flush := func() {
		for len(pending) > 0 {
			r, n := utf8.DecodeRune(pending)
			if r == utf8.RuneError && n <= 1 {
				b.WriteRune(utf8.RuneError)
				n = invalidUTF8Prefix(pending)
			} else {
				b.WriteRune(r)
			}
			pending = pending[n:]
		}
	}
	for i := 0; i < len(s); {
		if s[i] == '%' && i+2 < len(s) && isHexDigit(s[i+1]) && isHexDigit(s[i+2]) {
			pending = append(pending, unhex(s[i+1])<<4|unhex(s[i+2]))
			i += 3
			continue
		}
		flush()
		r, n := utf8.DecodeRuneInString(s[i:])
		if r == utf8.RuneError && n == 1 {
			b.WriteByte(s[i])
		} else {
			b.WriteString(s[i : i+n])
		}
		i += n
	}
	flush()
	return b.String()
}

// invalidUTF8Prefix is how many bytes of an invalid sequence Python's
// UTF-8 decoder replaces with one U+FFFD: a lead byte with the
// continuation bytes that were valid for it (the maximal subpart).
func invalidUTF8Prefix(p []byte) int {
	c := p[0]
	var need int
	lo, hi := byte(0x80), byte(0xBF)
	switch {
	case c >= 0xC2 && c <= 0xDF:
		need = 1
	case c == 0xE0:
		need, lo = 2, 0xA0
	case c == 0xED:
		need, hi = 2, 0x9F
	case c >= 0xE1 && c <= 0xEF:
		need = 2
	case c == 0xF0:
		need, lo = 3, 0x90
	case c == 0xF4:
		need, hi = 3, 0x8F
	case c >= 0xF1 && c <= 0xF3:
		need = 3
	default:
		return 1
	}
	n := 1
	for i := 1; i <= need && i < len(p); i++ {
		if p[i] < lo || p[i] > hi {
			break
		}
		lo, hi = 0x80, 0xBF
		n++
	}
	return n
}

func isHexDigit(c byte) bool {
	return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')
}

func unhex(c byte) byte {
	switch {
	case c >= 'a':
		return c - 'a' + 10
	case c >= 'A':
		return c - 'A' + 10
	}
	return c - '0'
}

// namedURLs rewrites a named URL's path to the object's id.
func (s *Server) namedURLs(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		units := strings.Split(r.URL.Path, "/")
		if len(units) >= 6 && units[1] == "api" && units[2] == "v2" && units[4] != "" {
			if _, ok := namedURLGraph[units[3]]; ok {
				if id := s.namedURLToID(r.Context(), units[3], units[4]); id != units[4] {
					units[4] = id
					r.URL.Path = strings.Join(units, "/")
					r.URL.RawPath = ""
					r = r.WithContext(context.WithValue(r.Context(), namedURLRewrittenKey{}, true))
				}
			}
		}
		next.ServeHTTP(w, r)
	})
}
