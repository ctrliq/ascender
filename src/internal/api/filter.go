package api

import (
	"fmt"
	"maps"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// FieldKind says how a query-string value is converted before it is used in
// SQL, mirroring the Django field types the old filter backend inspected.
type FieldKind int

const (
	KindText FieldKind = iota
	KindInt
	KindBool
	KindDateTime
	KindJSON // filtered as text, as TREAT_JSONFIELD_AS_TEXT did
	KindFK   // integer id, or null/none
	// KindType is the polymorphic "type" pseudo-field: API type names such
	// as job_template are matched against the content type model name.
	KindType
)

// Field maps an API field name to a SQL expression.
type Field struct {
	SQL  string
	Kind FieldKind
	// Rel, when set, makes the field traversable: "organization__name".
	Rel *Relation
	// NoFilter marks fields the old API refused to filter on (passwords and
	// the like, via prevent_search).
	NoFilter bool
}

// Relation describes a join to another resource for lookup traversal.
type Relation struct {
	// Alias is the table alias used in Join and in the target's fields.
	Alias string
	// Join is the SQL join clause, e.g. "LEFT JOIN main_organization org ON org.id = ujt.organization_id".
	Join string
	// Target supplies the fields reachable through the relation.
	Target func() *FieldSet
	// Many marks a to-many join, which forces DISTINCT as the old backend did.
	Many bool
}

// FieldSet is the filterable surface of a resource.
type FieldSet struct {
	// Model is the verbose model name used in error messages ("Project").
	Model  string
	Fields map[string]Field
	// SearchFields are what ?search= matches with icontains.
	SearchFields []string
}

// With is a copy of fs with extra fields added (replacing any of the same
// name).
func (fs *FieldSet) With(extra map[string]Field) *FieldSet {
	out := &FieldSet{Model: fs.Model, Fields: make(map[string]Field, len(fs.Fields)+len(extra)), SearchFields: fs.SearchFields}
	maps.Copy(out.Fields, fs.Fields)
	maps.Copy(out.Fields, extra)
	return out
}

// supportedLookups mirrors FieldLookupBackend.SUPPORTED_LOOKUPS.
var supportedLookups = map[string]bool{
	"exact": true, "iexact": true, "contains": true, "icontains": true,
	"startswith": true, "istartswith": true, "endswith": true, "iendswith": true,
	"regex": true, "iregex": true, "gt": true, "gte": true, "lt": true, "lte": true,
	"in": true, "isnull": true, "search": true,
}

// reservedParams are query parameters that are not filters.
var reservedParams = map[string]bool{
	"page": true, "page_size": true, "format": true, "order": true, "order_by": true,
	"count_disabled": true, "no_truncate": true, "limit": true, "search": true, "summary_fields": true,
	"role_level": true, "csrfmiddlewaretoken": true,
	// ANSIBLE_BASE_REST_FILTERS_RESERVED_NAMES' others (type is a field
	// here, filtered by the views that have it).
	"host_filter": true, "validate": true, "user_ansible_id": true, "team_ansible_id": true, "object_ansible_id": true, "assignment": true,
}

// Query accumulates the SQL for a list request.
type Query struct {
	Where    []string
	Args     []any
	Joins    []string
	joinSeen map[string]bool
	Distinct bool
	OrderBy  []string
	// From and PK are the list's FROM clause and primary key. With them, a
	// negated filter across a to-many relation excludes every object with
	// any matching related row, as Django's exclude() did, rather than
	// keeping objects through their other related rows.
	From, PK string
}

// NewQuery creates an empty query.
func NewQuery() *Query { return &Query{joinSeen: map[string]bool{}} }

// Arg appends a parameter and returns its placeholder.
func (q *Query) Arg(v any) string {
	q.Args = append(q.Args, v)
	return "$" + strconv.Itoa(len(q.Args))
}

// AddJoin records a join once.
func (q *Query) AddJoin(join string) {
	if q.joinSeen == nil {
		q.joinSeen = map[string]bool{}
	}
	if !q.joinSeen[join] {
		q.joinSeen[join] = true
		q.Joins = append(q.Joins, join)
	}
}

// And appends a WHERE clause.
func (q *Query) And(clause string) { q.Where = append(q.Where, clause) }

// WhereSQL renders the WHERE clause, or "" when there is none.
func (q *Query) WhereSQL() string {
	if len(q.Where) == 0 {
		return ""
	}
	return " WHERE " + strings.Join(q.Where, " AND ")
}

// JoinSQL renders the joins.
func (q *Query) JoinSQL() string {
	if len(q.Joins) == 0 {
		return ""
	}
	return " " + strings.Join(q.Joins, " ")
}

// OrderSQL renders ORDER BY.
func (q *Query) OrderSQL() string {
	if len(q.OrderBy) == 0 {
		return ""
	}
	return " ORDER BY " + strings.Join(q.OrderBy, ", ")
}

// resolvedField is a field reached through zero or more relations.
type resolvedField struct {
	field Field
	many  bool
}

// resolve walks "a__b__c" through relations, adding joins as it goes, and
// returns the terminal field and the lookup suffix.
func resolve(q *Query, fs *FieldSet, path string) (resolvedField, string, error) {
	parts := strings.Split(path, "__")
	suffix := "exact"
	if len(parts) > 1 && supportedLookups[parts[len(parts)-1]] {
		suffix = parts[len(parts)-1]
		parts = parts[:len(parts)-1]
	}
	if len(parts) == 0 || parts[0] == "" {
		return resolvedField{}, "", BadRequest("Query string field name not provided.")
	}
	cur := fs
	many := false
	for i, p := range parts {
		f, ok := cur.Fields[p]
		// pk is Django's name for any model's primary key.
		if !ok && p == "pk" {
			f, ok = cur.Fields["id"]
		}
		if !ok {
			return resolvedField{}, "", NoFieldError(cur.Model, p)
		}
		if f.NoFilter {
			return resolvedField{}, "", BadRequest(fmt.Sprintf("Filtering on %s is not allowed.", p))
		}
		last := i == len(parts)-1
		if last {
			if suffix == "search" {
				if f.Rel == nil {
					return resolvedField{}, "", BadRequest(fmt.Sprintf("%s is not searchable", strings.TrimSuffix(path, "__search")))
				}
				// related search: handled by caller via the relation target
				q.AddJoin(f.Rel.Join)
				many = many || f.Rel.Many
				return resolvedField{field: f, many: many}, suffix, nil
			}
			// A to-many relation filtered by id reads the join's column.
			if f.Rel != nil && f.Rel.Many {
				q.AddJoin(f.Rel.Join)
				many = true
			}
			return resolvedField{field: f, many: many}, suffix, nil
		}
		if f.Rel == nil {
			// fk__id and fk__pk name the foreign key's own column, which
			// Django filtered on without a join.
			if f.Kind == KindFK && i == len(parts)-2 && (parts[i+1] == "id" || parts[i+1] == "pk") {
				return resolvedField{field: f, many: many}, suffix, nil
			}
			return resolvedField{}, "", NoFieldError(cur.Model, parts[i+1])
		}
		q.AddJoin(f.Rel.Join)
		many = many || f.Rel.Many
		cur = f.Rel.Target()
	}
	return resolvedField{}, "", BadRequest("Query string field name not provided.")
}

func toBool(v string) (bool, error) {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "true", "1", "t", "yes", "y", "on":
		return true, nil
	case "false", "0", "f", "no", "n", "off":
		return false, nil
	}
	return false, BadRequest(fmt.Sprintf("Unable to convert \"%s\" to boolean", v))
}

// convert turns a query value into the typed argument for the field.
func convert(f Field, v string) (any, error) {
	switch f.Kind {
	case KindInt:
		n, err := strconv.ParseInt(strings.TrimSpace(v), 10, 64)
		if err != nil {
			return nil, BadRequest(fmt.Sprintf("Field '%s' expected a number but got '%s'.", "value", v))
		}
		return n, nil
	case KindFK:
		lv := strings.ToLower(strings.TrimSpace(v))
		if lv == "none" || lv == "null" {
			return nil, nil
		}
		n, err := strconv.ParseInt(lv, 10, 64)
		if err != nil {
			return nil, BadRequest(fmt.Sprintf("Invalid related field id: %s", v))
		}
		return n, nil
	case KindBool:
		return toBool(v)
	case KindType:
		return strings.ReplaceAll(strings.ToLower(strings.TrimSpace(v)), "_", ""), nil
	case KindDateTime:
		t, err := parseDateTime(v)
		if err != nil {
			return nil, BadRequest(fmt.Sprintf("Datetime has wrong format: %s", v))
		}
		return t, nil
	default:
		return v, nil
	}
}

var dateLayouts = []string{
	time.RFC3339Nano, time.RFC3339, "2006-01-02T15:04:05", "2006-01-02 15:04:05", "2006-01-02T15:04", "2006-01-02",
}

func parseDateTime(v string) (time.Time, error) {
	v = strings.TrimSpace(v)
	for _, l := range dateLayouts {
		if t, err := time.Parse(l, v); err == nil {
			return t, nil
		}
	}
	return time.Time{}, fmt.Errorf("bad datetime")
}

// typeClause reproduces TypeFilterBackend for ?type=a,b. Polymorphic lists
// expose a "type" field and match any of the listed names; a plain list
// yields nothing unless its own type name is listed.
func typeClause(q *Query, fs *FieldSet, value string) (string, error) {
	names := strings.Split(value, ",")
	if f, ok := fs.Fields["type"]; ok && f.Kind == KindType {
		if value == "" {
			return "FALSE", nil
		}
		return clause(q, f, "in", value)
	}
	if fs.Model == "" {
		return "", nil
	}
	own := ModelTypeName(fs.Model)
	for _, n := range names {
		if n == own {
			return "", nil
		}
	}
	return "FALSE", nil
}

// ModelTypeName converts a model name to the API type name the way
// get_type_for_model does ("JobTemplate" -> "job_template").
func ModelTypeName(model string) string {
	var b strings.Builder
	for i, r := range model {
		if i > 0 && r >= 'A' && r <= 'Z' {
			b.WriteByte('_')
		}
		b.WriteRune(r)
	}
	return strings.ToLower(b.String())
}

// sqlExpr returns the SQL for a field, casting JSON to text.
func sqlExpr(f Field) string {
	if f.Kind == KindJSON {
		return "(" + f.SQL + ")::text"
	}
	return f.SQL
}

// clause renders one lookup as SQL.
func clause(q *Query, f Field, suffix, value string) (string, error) {
	expr := sqlExpr(f)
	switch suffix {
	case "isnull":
		b, err := toBool(value)
		if err != nil {
			return "", err
		}
		if b {
			return expr + " IS NULL", nil
		}
		return expr + " IS NOT NULL", nil
	case "in":
		if value == "" {
			return "", BadRequest("cannot provide empty value for __in")
		}
		var items []any
		hasNull := false
		for _, it := range strings.Split(value, ",") {
			v, err := convert(f, it)
			if err != nil {
				return "", err
			}
			if v == nil {
				hasNull = true
				continue
			}
			items = append(items, v)
		}
		var parts []string
		if len(items) > 0 {
			ph := make([]string, len(items))
			for i, it := range items {
				ph[i] = q.Arg(it)
			}
			parts = append(parts, expr+" IN ("+strings.Join(ph, ",")+")")
		}
		if hasNull {
			parts = append(parts, expr+" IS NULL")
		}
		if len(parts) == 0 {
			return "FALSE", nil
		}
		return "(" + strings.Join(parts, " OR ") + ")", nil
	case "exact":
		v, err := convert(f, value)
		if err != nil {
			return "", err
		}
		if v == nil {
			return expr + " IS NULL", nil
		}
		if f.Kind == KindText || f.Kind == KindJSON {
			return expr + " = " + q.Arg(v), nil
		}
		return expr + " = " + q.Arg(v), nil
	case "iexact":
		if f.Kind != KindText && f.Kind != KindJSON {
			return "", BadRequest("field is not a text field and cannot be filtered by case-insensitive search")
		}
		return "UPPER(" + expr + ") = UPPER(" + q.Arg(value) + ")", nil
	case "contains":
		return expr + " LIKE " + q.Arg("%"+escapeLike(value)+"%") + " ESCAPE '\\'", nil
	case "icontains":
		return "UPPER(" + expr + ") LIKE UPPER(" + q.Arg("%"+escapeLike(value)+"%") + ") ESCAPE '\\'", nil
	case "startswith":
		return expr + " LIKE " + q.Arg(escapeLike(value)+"%") + " ESCAPE '\\'", nil
	case "istartswith":
		return "UPPER(" + expr + ") LIKE UPPER(" + q.Arg(escapeLike(value)+"%") + ") ESCAPE '\\'", nil
	case "endswith":
		return expr + " LIKE " + q.Arg("%"+escapeLike(value)) + " ESCAPE '\\'", nil
	case "iendswith":
		return "UPPER(" + expr + ") LIKE UPPER(" + q.Arg("%"+escapeLike(value)) + ") ESCAPE '\\'", nil
	case "regex":
		if _, err := regexp.Compile(value); err != nil {
			return "", BadRequest(err.Error())
		}
		return expr + " ~ " + q.Arg(value), nil
	case "iregex":
		if _, err := regexp.Compile(value); err != nil {
			return "", BadRequest(err.Error())
		}
		return expr + " ~* " + q.Arg(value), nil
	case "gt", "gte", "lt", "lte":
		v, err := convert(f, value)
		if err != nil {
			return "", err
		}
		op := map[string]string{"gt": ">", "gte": ">=", "lt": "<", "lte": "<="}[suffix]
		return expr + " " + op + " " + q.Arg(v), nil
	}
	return "", BadRequest(fmt.Sprintf("Unsupported lookup: %s", suffix))
}

func escapeLike(s string) string {
	s = strings.ReplaceAll(s, `\`, `\\`)
	s = strings.ReplaceAll(s, `%`, `\%`)
	s = strings.ReplaceAll(s, `_`, `\_`)
	return s
}

// relatedSearchFields are the columns ?<rel>__search= matches, as the old
// backend hard coded them.
var relatedSearchNames = map[string]bool{"username": true, "first_name": true, "last_name": true, "email": true, "name": true, "description": true, "playbook": true}

// ApplyFilters parses the query string the way FieldLookupBackend did and
// appends the resulting WHERE clauses to q. Keys the caller handles itself
// (role_level, for instance) are skipped by listing them in extraReserved.
func ApplyFilters(q *Query, fs *FieldSet, params url.Values, extraReserved map[string]bool) error {
	type cond struct {
		not    bool
		clause string
	}
	var ands, ors, chains []cond
	searchTerms := map[string][]string{} // term -> clauses
	searchRelation := "OR"
	var searchOrder []string

	for key, values := range params {
		if reservedParams[key] || extraReserved[key] {
			continue
		}
		if key == "type" {
			// TypeFilterBackend: a comma-separated list of API type names
			// applied to every list; the last value wins like QueryDict.items().
			c, err := typeClause(q, fs, values[len(values)-1])
			if err != nil {
				return err
			}
			if c != "" {
				ands = append(ands, cond{false, c})
			}
			continue
		}
		k := key
		k = strings.TrimSuffix(k, "__int")
		if strings.HasSuffix(k, "__search") {
			if len(values) > 0 && strings.Contains(values[0], ",") {
				searchRelation = "AND"
				var split []string
				for _, v := range values {
					split = append(split, strings.Split(v, ",")...)
				}
				values = split
			}
			rel := strings.TrimSuffix(k, "__search")
			for _, v := range values {
				rf, _, err := resolve(q, fs, rel+"__search")
				if err != nil {
					return err
				}
				target := rf.field.Rel.Target()
				var cls []string
				for name, tf := range target.Fields {
					if relatedSearchNames[name] && (tf.Kind == KindText) && tf.Rel == nil {
						c, err := clause(q, tf, "icontains", v)
						if err != nil {
							return err
						}
						cls = append(cls, c)
					}
				}
				if _, seen := searchTerms[v]; !seen {
					searchOrder = append(searchOrder, v)
				}
				searchTerms[v] = append(searchTerms[v], cls...)
			}
			q.Distinct = true
			continue
		}
		qChain, qOr := false, false
		if strings.HasPrefix(k, "chain__") {
			k = strings.TrimPrefix(k, "chain__")
			qChain = true
		} else if strings.HasPrefix(k, "or__") {
			k = strings.TrimPrefix(k, "or__")
			qOr = true
		}
		qNot := false
		if strings.HasPrefix(k, "not__") {
			k = strings.TrimPrefix(k, "not__")
			qNot = true
		}
		for _, v := range values {
			if qNot && q.PK != "" && q.From != "" {
				// Resolve into a subquery that shares the argument list.
				sub := &Query{Args: q.Args, joinSeen: map[string]bool{}}
				rf, suffix, err := resolve(sub, fs, k)
				if err != nil {
					return err
				}
				if rf.many {
					c, err := clause(sub, rf.field, suffix, v)
					if err != nil {
						return err
					}
					q.Args = sub.Args
					c = q.PK + " IN (SELECT " + q.PK + " FROM " + q.From + sub.JoinSQL() + " WHERE " + c + ")"
					switch {
					case qChain:
						chains = append(chains, cond{qNot, c})
					case qOr:
						ors = append(ors, cond{qNot, c})
					default:
						ands = append(ands, cond{qNot, c})
					}
					continue
				}
			}
			rf, suffix, err := resolve(q, fs, k)
			if err != nil {
				return err
			}
			if rf.many {
				q.Distinct = true
			}
			c, err := clause(q, rf.field, suffix, v)
			if err != nil {
				return err
			}
			switch {
			case qChain:
				chains = append(chains, cond{qNot, c})
			case qOr:
				ors = append(ors, cond{qNot, c})
			default:
				ands = append(ands, cond{qNot, c})
			}
		}
	}

	// Top-level ?search= across the resource's search fields.
	if terms, ok := params["search"]; ok {
		var all []string
		for _, t := range terms {
			all = append(all, strings.Split(t, ",")...)
		}
		relation := "OR"
		if len(terms) > 0 && strings.Contains(terms[0], ",") {
			relation = "AND"
		}
		var termClauses []string
		for _, t := range all {
			t = strings.TrimSpace(t)
			if t == "" {
				continue
			}
			var cls []string
			for _, name := range fs.SearchFields {
				rf, _, err := resolve(q, fs, name)
				if err != nil {
					return err
				}
				c, err := clause(q, rf.field, "icontains", t)
				if err != nil {
					return err
				}
				cls = append(cls, c)
			}
			if len(cls) > 0 {
				termClauses = append(termClauses, "("+strings.Join(cls, " OR ")+")")
			}
		}
		if len(termClauses) > 0 {
			q.And("(" + strings.Join(termClauses, " "+relation+" ") + ")")
		}
	}

	wrap := func(c cond) string {
		if c.not {
			return "NOT (" + c.clause + ")"
		}
		return c.clause
	}
	for _, c := range ands {
		q.And(wrap(c))
	}
	if len(ors) > 0 {
		parts := make([]string, len(ors))
		for i, c := range ors {
			parts[i] = wrap(c)
		}
		q.And("(" + strings.Join(parts, " OR ") + ")")
	}
	if len(searchTerms) > 0 {
		if searchRelation == "OR" {
			var parts []string
			for _, t := range searchOrder {
				parts = append(parts, searchTerms[t]...)
			}
			q.And("(" + strings.Join(parts, " OR ") + ")")
		} else {
			for _, t := range searchOrder {
				q.And("(" + strings.Join(searchTerms[t], " OR ") + ")")
			}
		}
	}
	for _, c := range chains {
		q.And(wrap(c))
	}
	return nil
}

// ApplyOrdering reads order_by (and the older order) and appends ORDER BY
// terms. Unknown fields are a 400, as in the old OrderByBackend.
func ApplyOrdering(q *Query, fs *FieldSet, params url.Values, defaults []string) error {
	var raw []string
	for _, key := range []string{"order_by", "order"} {
		for _, v := range params[key] {
			raw = append(raw, strings.Split(v, ",")...)
		}
	}
	if len(raw) == 0 {
		raw = defaults
	}
	for _, term := range raw {
		term = strings.TrimSpace(term)
		if term == "" {
			continue
		}
		desc := false
		if strings.HasPrefix(term, "-") {
			desc = true
			term = term[1:]
		}
		rf, suffix, err := resolve(q, fs, term)
		if err != nil {
			return err
		}
		if suffix != "exact" || (rf.field.Rel != nil && rf.field.Rel.Many) {
			return NoFieldError(fs.Model, term)
		}
		if rf.field.Rel != nil {
			q.OrderBy = append(q.OrderBy, relatedOrdering(q, fs, term, rf.field, desc, 0)...)
			continue
		}
		q.OrderBy = append(q.OrderBy, sqlExpr(rf.field)+orderDir(desc))
	}
	return nil
}

func orderDir(desc bool) string {
	if desc {
		return " DESC"
	}
	return " ASC"
}

// modelOrdering is each old model's Meta.ordering, which Django used when
// a list was ordered by a foreign key to it (order_by=inventory sorts by
// the inventory's name). Models not listed ordered by their id.
var modelOrdering = map[string][]string{
	"Inventory": {"name"}, "Host": {"name"}, "Group": {"name"},
	"InventorySource": {"inventory", "name"}, "InventoryUpdate": {"inventory", "name"},
	"JobTemplate": {"name"}, "UnifiedJobTemplate": {"name"}, "WorkflowJobTemplate": {"name"}, "SystemJobTemplate": {"name"},
	"Organization": {"name"}, "Team": {"organization__name", "name"},
	"Credential": {"name"}, "CredentialType": {"kind", "name"},
	"ExecutionEnvironment": {"-created"}, "Instance": {"hostname"},
	"Label": {"organization", "name"}, "NotificationTemplate": {"name"},
	"OAuth2Application": {"organization", "name"},
}

// relatedOrdering expands an order_by on a foreign key into the related
// model's ordering, each term's direction flipped by a descending key.
// Anything the target's fields cannot reach falls back to the key's column.
func relatedOrdering(q *Query, fs *FieldSet, term string, f Field, desc bool, depth int) []string {
	own := []string{sqlExpr(f) + orderDir(desc)}
	ord := modelOrdering[f.Rel.Target().Model]
	if len(ord) == 0 || depth > 2 {
		return own
	}
	var out []string
	for _, o := range ord {
		d := desc
		if strings.HasPrefix(o, "-") {
			d = !d
			o = o[1:]
		}
		path := term + "__" + o
		rf, suffix, err := resolve(q, fs, path)
		if err != nil || suffix != "exact" || (rf.field.Rel != nil && rf.field.Rel.Many) {
			return own
		}
		if rf.field.Rel != nil {
			out = append(out, relatedOrdering(q, fs, path, rf.field, d, depth+1)...)
			continue
		}
		out = append(out, sqlExpr(rf.field)+orderDir(d))
	}
	return out
}
