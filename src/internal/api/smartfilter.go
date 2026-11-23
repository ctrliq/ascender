package api

import (
	"encoding/json"
	"fmt"
	"math/big"
	"regexp"
	"strconv"
	"strings"
)

// SmartFilter parses the host_filter language of smart inventories:
// "name__icontains=web and (groups__name=db or ansible_facts__os=Linux)".
// Terms are field lookups as the list filters accept them, combined with
// and/or/not and parentheses.
type smartNode struct {
	op    string // "and", "or", "not", "term"
	kids  []*smartNode
	key   string
	value string
	// quoted: the value was written in double quotes, which keeps it a
	// string (string_to_type typed only unquoted values).
	quoted bool
}

func parseSmartFilter(s string) (*smartNode, error) {
	p := &smartParser{toks: tokenizeSmart(s)}
	n, err := p.parseOr()
	if err != nil {
		return nil, err
	}
	if p.pos < len(p.toks) {
		return nil, fmt.Errorf("Unexpected token %q", p.toks[p.pos])
	}
	return n, nil
}

// tokenizeSmart splits a filter into terms and parentheses. Only double
// quotes quote: the old grammar's atoms took a single quote as an ordinary
// character, so name='web' matched the name 'web' with its quotes.
func tokenizeSmart(s string) []string {
	var toks []string
	var cur strings.Builder
	inQuote := false
	flush := func() {
		if cur.Len() > 0 {
			toks = append(toks, cur.String())
			cur.Reset()
		}
	}
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case inQuote:
			if c == '"' {
				inQuote = false
			}
			cur.WriteByte(c)
		case c == '"':
			inQuote = true
			cur.WriteByte(c)
		case c == '(' || c == ')':
			flush()
			toks = append(toks, string(c))
		case c == ' ' || c == '\t':
			flush()
		default:
			cur.WriteByte(c)
		}
	}
	flush()
	return toks
}

type smartParser struct {
	toks []string
	pos  int
}

func (p *smartParser) peek() string {
	if p.pos < len(p.toks) {
		return p.toks[p.pos]
	}
	return ""
}

func (p *smartParser) parseOr() (*smartNode, error) {
	left, err := p.parseAnd()
	if err != nil {
		return nil, err
	}
	for strings.EqualFold(p.peek(), "or") {
		p.pos++
		right, err := p.parseAnd()
		if err != nil {
			return nil, err
		}
		left = &smartNode{op: "or", kids: []*smartNode{left, right}}
	}
	return left, nil
}

func (p *smartParser) parseAnd() (*smartNode, error) {
	left, err := p.parseNot()
	if err != nil {
		return nil, err
	}
	for strings.EqualFold(p.peek(), "and") {
		p.pos++
		right, err := p.parseNot()
		if err != nil {
			return nil, err
		}
		left = &smartNode{op: "and", kids: []*smartNode{left, right}}
	}
	return left, nil
}

func (p *smartParser) parseNot() (*smartNode, error) {
	if strings.EqualFold(p.peek(), "not") {
		p.pos++
		n, err := p.parseNot()
		if err != nil {
			return nil, err
		}
		return &smartNode{op: "not", kids: []*smartNode{n}}, nil
	}
	return p.parseAtom()
}

func (p *smartParser) parseAtom() (*smartNode, error) {
	t := p.peek()
	if t == "" {
		return nil, fmt.Errorf("Unexpected end of filter")
	}
	if t == "(" {
		p.pos++
		n, err := p.parseOr()
		if err != nil {
			return nil, err
		}
		if p.peek() != ")" {
			return nil, fmt.Errorf("Expected )")
		}
		p.pos++
		return n, nil
	}
	p.pos++
	// The first = outside quotes splits key from value.
	eq, in := -1, false
	for i := 0; i < len(t) && eq < 0; i++ {
		switch c := t[i]; {
		case in:
			if c == '"' {
				in = false
			}
		case c == '"':
			in = true
		case c == '=':
			eq = i
		}
	}
	if eq < 0 {
		return nil, fmt.Errorf("Invalid filter term %q", t)
	}
	k, v := unquoteSmart(t[:eq]), t[eq+1:]
	quoted := len(v) >= 2 && v[0] == '"' && v[len(v)-1] == '"'
	if quoted {
		v = v[1 : len(v)-1]
	}
	return &smartNode{op: "term", key: k, value: v, quoted: quoted}, nil
}

func unquoteSmart(s string) string {
	if len(s) >= 2 && s[0] == '"' && s[len(s)-1] == '"' {
		return s[1 : len(s)-1]
	}
	return s
}

var (
	smartIntRe   = regexp.MustCompile(`^[-+]?[0-9]+$`)
	smartFloatRe = regexp.MustCompile(`^[-+]?[0-9]+\.[0-9]+$`)
)

// smartFactValue is string_to_type for an unquoted value; a quoted one
// stays a string ("null" in quotes kept its quotes, as the old code did).
func smartFactValue(n *smartNode) any {
	if n.quoted {
		if n.value == "null" {
			return `"null"`
		}
		return n.value
	}
	switch v := n.value; {
	case v == "null":
		return nil
	case v == "true":
		return true
	case v == "false":
		return false
	case smartIntRe.MatchString(v):
		if i, err := strconv.ParseInt(v, 10, 64); err == nil {
			return i
		}
		// Python's int has no limit.
		if b, ok := new(big.Int).SetString(strings.TrimPrefix(v, "+"), 10); ok {
			return json.Number(b.String())
		}
	case smartFloatRe.MatchString(v):
		if f, err := strconv.ParseFloat(v, 64); err == nil {
			return f
		}
	}
	return n.value
}

// smartTermValue is a value outside ansible_facts: a quoted one is the
// string between the quotes (strip_quotes_traditional_logic), an unquoted
// one string_to_type of it.
func smartTermValue(n *smartNode) any {
	if n.quoted {
		return n.value
	}
	return smartFactValue(n)
}

// smartFactsContains is SmartFilter._json_path_to_contains: the key's
// pieces after ansible_facts become nested objects (a piece ending in []
// a list holding the next), the value at the bottom, matched by JSON
// containment. Only __exact is dropped; any other lookup stays a piece.
func smartFactsContains(key string, value any) ([]byte, error) {
	key = strings.TrimSuffix(key, "__exact")
	if strings.HasPrefix(key, "ansible_facts__") {
		key = key[len("ansible_facts__"):]
	} else {
		key = key[len("ansible_facts"):]
	}
	pieces := strings.Split(key, "__")
	var build func(i int) any
	build = func(i int) any {
		if i == len(pieces) {
			return value
		}
		piece := pieces[i]
		if strings.HasSuffix(piece, "[]") {
			return map[string]any{piece[:len(piece)-2]: []any{build(i + 1)}}
		}
		return map[string]any{piece: build(i + 1)}
	}
	return json.Marshal(build(0))
}

// smartFilterSQL renders the host_filter as a WHERE clause over the host
// field set (aliases as in hostFields).
func smartFilterSQL(q *Query, fs *FieldSet, n *smartNode) (string, error) {
	switch n.op {
	case "and", "or":
		var parts []string
		for _, k := range n.kids {
			s, err := smartFilterSQL(q, fs, k)
			if err != nil {
				return "", err
			}
			parts = append(parts, s)
		}
		return "(" + strings.Join(parts, " "+strings.ToUpper(n.op)+" ") + ")", nil
	case "not":
		s, err := smartFilterSQL(q, fs, n.kids[0])
		if err != nil {
			return "", err
		}
		return "NOT (" + s + ")", nil
	}
	key := n.key
	if strings.HasPrefix(key, "ansible_facts") {
		// ansible_facts__os_family=RedHat: JSON containment, as
		// ansible_facts__contains={"os_family": "RedHat"} was.
		doc, err := smartFactsContains(key, smartFactValue(n))
		if err != nil {
			return "", err
		}
		return "h.ansible_facts @> " + q.Arg(string(doc)) + "::jsonb", nil
	}
	if strings.Contains(key, "search") {
		if s, ok, err := smartSearchSQL(q, fs, n); ok || err != nil {
			return s, err
		}
	}
	rf, suffix, err := resolve(q, fs, key)
	if err != nil {
		return "", err
	}
	if rf.many {
		q.Distinct = true
	}
	// Host.objects.filter(**{key: value}) with the value string_to_type
	// made of an unquoted one.
	switch v := smartTermValue(n).(type) {
	case nil:
		switch suffix {
		case "exact", "iexact":
			return sqlExpr(rf.field) + " IS NULL", nil
		case "in":
			return "", smartErrorf("'NoneType' object is not iterable")
		}
		return "", smartErrorf("Cannot use None as a query value")
	case string:
		return clause(q, rf.field, suffix, v)
	default:
		if suffix == "in" {
			return "", smartErrorf("'%s' object is not iterable", pyTypeName(v))
		}
		return clause(q, rf.field, suffix, smartPyStr(v))
	}
}

// smartFilterError is an exception other than ParseException (a FieldError,
// ValueError or TypeError) that building the old filter raised: it reached
// the caller with its own message rather than "Invalid query".
type smartFilterError struct{ msg string }

func (e *smartFilterError) Error() string { return e.msg }

func smartErrorf(format string, args ...any) error {
	return &smartFilterError{msg: fmt.Sprintf(format, args...)}
}

// smartModelSearchFields are get_search_fields() of each model in the main
// app with any (name and description, in field order), and smartModels the
// other models' names: what SmartFilter._expand_search looked up.
var smartModelSearchFields = map[string][]string{
	"adhoccommand": {"description", "name"}, "credential": {"description", "name"}, "credentialinputsource": {"description"},
	"credentialtype": {"description", "name"}, "custominventoryscript": {"description", "name"}, "executionenvironment": {"description", "name"},
	"group": {"description", "name"}, "host": {"description", "name"}, "instancegroup": {"name"}, "inventory": {"description", "name"},
	"inventorysource": {"description", "name"}, "inventoryupdate": {"description", "name"}, "job": {"description", "name"},
	"jobtemplate": {"description", "name"}, "label": {"description", "name"}, "notificationtemplate": {"description", "name"},
	"oauth2accesstoken": {"description"}, "oauth2application": {"name", "description"}, "organization": {"description", "name"},
	"project": {"description", "name"}, "projectupdate": {"description", "name"}, "schedule": {"description", "name"},
	"systemjob": {"description", "name"}, "systemjobtemplate": {"description", "name"}, "team": {"description", "name"},
	"unifiedjob": {"description", "name"}, "unifiedjobtemplate": {"description", "name"}, "workflowapproval": {"description", "name"},
	"workflowapprovaltemplate": {"description", "name"}, "workflowjob": {"description", "name"}, "workflowjobtemplate": {"description", "name"},
}

var smartModels = map[string]bool{
	"activitystream": true, "adhoccommandevent": true, "adhoccommandinstancegroupmembership": true, "ascenderschedulestate": true,
	"hostmetric": true, "hostmetricsummarymonthly": true, "instance": true, "instancelink": true, "inventoryconstructedinventorymembership": true,
	"inventoryinstancegroupmembership": true, "inventoryupdateevent": true, "jobevent": true, "jobhostsummary": true, "joblaunchconfig": true,
	"joblaunchconfiginstancegroupmembership": true, "jobmonitorlease": true, "notification": true, "oauth2idtoken": true, "oauth2refreshtoken": true,
	"organizationgalaxycredentialmembership": true, "organizationinstancegroupmembership": true, "profile": true, "projectupdateevent": true,
	"receptoraddress": true, "role": true, "roleancestorentry": true, "scheduleinstancegroupmembership": true, "smartinventorymembership": true,
	"systemjobevent": true, "unifiedjobdeprecatedstdout": true, "unifiedjobtemplateinstancegroupmembership": true,
	"unpartitionedadhoccommandevent": true, "unpartitionedinventoryupdateevent": true, "unpartitionedjobevent": true,
	"unpartitionedprojectupdateevent": true, "unpartitionedsystemjobevent": true, "usersessionmembership": true, "workflowapprovalvote": true,
	"workflowjobinstancegroupmembership": true, "workflowjobnode": true, "workflowjobnodebaseinstancegroupmembership": true,
	"workflowjobnodeconditionlink": true, "workflowjobtemplatenode": true, "workflowjobtemplatenodebaseinstancegroupmembership": true,
	"workflowjobtemplatenodeconditionlink": true, "workloadidentitykey": true,
}

// hostFieldChoices is the list Django's FieldError offered for a keyword
// Host does not have.
const hostFieldChoices = "activitystream, ad_hoc_command_events, ad_hoc_commands, ansible_facts, ansible_facts_modified, constructed_host_summaries, created, created_by, created_by_id, description, enabled, groups, id, instance_id, inventory, inventory_id, inventory_sources, job_events_as_primary_host, job_host_summaries, jobs, modified, modified_by, modified_by_id, name, smart_inventories, variables"

// smartSearchSQL is SmartFilter._expand_search for a key with "search" in
// it: search=v matched the host's search fields, <rel>__search=v those of
// the main model named rel through the host's relation of that name, each
// with icontains and the matches ORed. ok is false for a key the old code
// left to the ordinary lookup (no model, or a model without search fields).
func smartSearchSQL(q *Query, fs *FieldSet, n *smartNode) (string, bool, error) {
	key, rel := n.key, ""
	switch {
	case key == "search":
		rel = ""
	case strings.HasSuffix(key, "__search"):
		rel = strings.SplitN(key, "__", 2)[0]
		model := strings.ToLower(rel)
		if _, ok := smartModelSearchFields[model]; !ok && !smartModels[model] {
			// apps.get_model failed: ParseException('No related field named ...').
			return "", false, BadRequest("No related field named " + rel)
		}
	default:
		return "", false, nil
	}
	model := "host"
	if rel != "" {
		model = strings.ToLower(rel)
	}
	fields := smartModelSearchFields[model]
	if len(fields) == 0 {
		// No search fields: the plain lookup, which refused __search.
		if rel == "activitystream" {
			return "", true, smartErrorf("Unsupported lookup 'search' for ForeignKey or join on the field not permitted.")
		}
		return "", false, nil
	}
	if rel != "" && rel != "inventory" {
		// The host has no relation by that name.
		return "", true, smartErrorf("Cannot resolve keyword '%s' into field. Choices are: %s", rel, hostFieldChoices)
	}
	var value string
	switch v := smartTermValue(n).(type) {
	case nil:
		return "", true, smartErrorf("Cannot use None as a query value")
	case string:
		value = v
	default:
		value = smartPyStr(v)
	}
	var parts []string
	for _, f := range fields {
		path := f
		if rel != "" {
			path = rel + "__" + f
		}
		rf, _, err := resolve(q, fs, path)
		if err != nil {
			return "", true, err
		}
		c, err := clause(q, rf.field, "icontains", value)
		if err != nil {
			return "", true, err
		}
		parts = append(parts, c)
	}
	return "(" + strings.Join(parts, " OR ") + ")", true, nil
}

// smartPyStr is Python's str() of a string_to_type value, which Django
// made of a number or a boolean compared with a text column.
func smartPyStr(v any) string {
	switch t := v.(type) {
	case bool:
		if t {
			return "True"
		}
		return "False"
	case int64:
		return strconv.FormatInt(t, 10)
	case json.Number:
		return t.String()
	case float64:
		return pyFloatRepr(t)
	case string:
		return t
	}
	return fmt.Sprint(v)
}
