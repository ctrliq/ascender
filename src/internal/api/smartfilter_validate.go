package api

import (
	"errors"
	"fmt"
	"regexp"
	"strings"
	"unicode"
)

// The old SmartFilter.query_from_string parsed host filters with a
// pyparsing grammar narrower than parseSmartFilter: terms are KEY=VALUE
// with no "=", parenthesis or double quote in an unquoted part, joined by
// lower-case "and" and "or" with parentheses, and no "not". A filter it
// could not parse, or one naming a host field that does not exist, was
// "Invalid query <filter>".

type smartTok struct {
	kind string // "(", ")", "=", "atom", "quoted"
	text string
}

func lexOldSmart(s string) []smartTok {
	var toks []smartTok
	for i := 0; i < len(s); {
		r := rune(s[i])
		switch {
		case unicode.IsSpace(r):
			i++
		case s[i] == '(' || s[i] == ')' || s[i] == '=':
			toks = append(toks, smartTok{kind: string(s[i])})
			i++
		case s[i] == '"':
			j := strings.IndexByte(s[i+1:], '"')
			if j < 0 {
				// An unterminated quote cannot be a term.
				return append(toks, smartTok{kind: "bad"})
			}
			toks = append(toks, smartTok{kind: "quoted", text: s[i+1 : i+1+j]})
			i += j + 2
		default:
			j := i
			for j < len(s) && !unicode.IsSpace(rune(s[j])) && !strings.ContainsRune("()=\"", rune(s[j])) {
				j++
			}
			toks = append(toks, smartTok{kind: "atom", text: s[i:j]})
			i = j
		}
	}
	return toks
}

type oldSmartParser struct {
	toks []smartTok
	pos  int
	// noValue: a term had nothing after its "=", which the old parse
	// action indexed into and failed with IndexError.
	noValue bool
}

func (p *oldSmartParser) peek() smartTok {
	if p.pos < len(p.toks) {
		return p.toks[p.pos]
	}
	return smartTok{kind: "end"}
}

func (p *oldSmartParser) expr() bool {
	if !p.operand() {
		return false
	}
	for {
		t := p.peek()
		if t.kind != "atom" || (t.text != "and" && t.text != "or") {
			return true
		}
		p.pos++
		if !p.operand() {
			return false
		}
	}
}

func (p *oldSmartParser) operand() bool {
	t := p.peek()
	if t.kind == "(" {
		p.pos++
		if !p.expr() || p.peek().kind != ")" {
			return false
		}
		p.pos++
		return true
	}
	if t.kind != "atom" && t.kind != "quoted" {
		return false
	}
	p.pos++
	if p.peek().kind != "=" {
		return false
	}
	p.pos++
	if v := p.peek(); v.kind == "quoted" || (v.kind == "atom" && v.text != "and" && v.text != "or") {
		p.pos++
		return true
	}
	p.noValue = true
	return false
}

// oldSmartGrammar reports whether the old grammar accepted the filter, which
// it parsed wrapped in parentheses (anything after the group was ignored).
func oldSmartGrammar(s string) (ok, noValue bool) {
	p := &oldSmartParser{toks: lexOldSmart("(" + s + ")")}
	ok = p.operand()
	return ok, p.noValue
}

// smartQuery is query_from_string: the parsed filter, or "Invalid query",
// or the message of another exception the filter's terms raised (HostList
// answered it as the error; the inventory serializer's validation did not
// catch it, and the 500 it became is a field error here).
func smartQuery(hf string) (*smartNode, error) {
	invalid := fmt.Errorf("Invalid query %s", hf)
	if ok, noValue := oldSmartGrammar(hf); noValue {
		return nil, fmt.Errorf("list index out of range")
	} else if !ok {
		return nil, invalid
	}
	n, err := parseSmartFilter(hf)
	if err != nil {
		return nil, invalid
	}
	if _, err := smartFilterSQL(NewQuery(), hostFields, n); err != nil {
		// A FieldError, ValueError or TypeError kept its message; a
		// ParseException or FieldDoesNotExist was "Invalid query".
		var se *smartFilterError
		if errors.As(err, &se) {
			return nil, se
		}
		return nil, invalid
	}
	return n, nil
}

// jsonFieldLookups are JSONField.get_lookups() but exact, in their order.
var jsonFieldLookups = []string{"iexact", "gt", "gte", "lt", "lte", "in", "contains", "icontains", "startswith", "istartswith", "endswith", "iendswith", "range", "isnull", "regex", "iregex", "contained_by", "has_key", "has_keys", "has_any_keys"}

var jsonFieldLookupRes = func() []*regexp.Regexp {
	out := make([]*regexp.Regexp, len(jsonFieldLookups))
	for i, m := range jsonFieldLookups {
		out[i] = regexp.MustCompile(`^ansible_facts[^=]+__` + m + `=`)
	}
	return out
}()

// validateHostFilter is the inventory serializer's validate_host_filter.
func validateHostFilter(hf string) error {
	for i, re := range jsonFieldLookupRes {
		if re.MatchString(hf) {
			return fmt.Errorf("ansible_facts does not support searching with __%s", jsonFieldLookups[i])
		}
	}
	_, err := smartQuery(hf)
	return err
}
