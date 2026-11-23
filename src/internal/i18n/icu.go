package i18n

import (
	"fmt"
	"html/template"
	"math"
	"regexp"
	"strconv"
	"strings"
	"sync"
)

// The ICU MessageFormat subset Lingui writes: text, {name}, {name, plural,
// ...}, {name, selectordinal, ...} and {name, select, ...}, with # for the
// number inside a plural, and ICU's apostrophe quoting.

type nodeKind int

const (
	textNode nodeKind = iota
	argNode
	pluralNode
	ordinalNode
	selectNode
	poundNode
)

type node struct {
	kind   nodeKind
	text   string // textNode, or the argument's name
	offset float64
	cases  []icuCase
}

type icuCase struct {
	key   string // "one", "other", "=0"
	nodes []node
}

var parsed sync.Map // message -> []node

func parseCached(msg string) []node {
	if v, ok := parsed.Load(msg); ok {
		return v.([]node)
	}
	nodes, err := parseMessage(msg)
	if err != nil {
		// A malformed message is shown as written rather than lost.
		nodes = []node{{kind: textNode, text: msg}}
	}
	parsed.Store(msg, nodes)
	return nodes
}

type parser struct {
	s   string
	pos int
}

func parseMessage(msg string) ([]node, error) {
	p := &parser{s: msg}
	nodes, err := p.nodes(false)
	if err != nil {
		return nil, err
	}
	if p.pos < len(p.s) {
		return nil, fmt.Errorf("unexpected %q at %d", p.s[p.pos], p.pos)
	}
	return nodes, nil
}

// nodes parses until the end or an unmatched "}"; inPlural makes # the
// number.
func (p *parser) nodes(inPlural bool) ([]node, error) {
	var out []node
	var text strings.Builder
	flush := func() {
		if text.Len() > 0 {
			out = append(out, node{kind: textNode, text: text.String()})
			text.Reset()
		}
	}
	for p.pos < len(p.s) {
		c := p.s[p.pos]
		switch {
		case c == '}':
			flush()
			return out, nil
		case c == '{':
			flush()
			n, err := p.argument()
			if err != nil {
				return nil, err
			}
			out = append(out, n)
		case c == '#' && inPlural:
			flush()
			out = append(out, node{kind: poundNode})
			p.pos++
		case c == '\'':
			p.pos++
			switch {
			case p.pos < len(p.s) && p.s[p.pos] == '\'':
				text.WriteByte('\'')
				p.pos++
			case p.pos < len(p.s) && (p.s[p.pos] == '{' || p.s[p.pos] == '}' || (inPlural && p.s[p.pos] == '#')):
				// Quoted literal text up to the next lone apostrophe.
				for p.pos < len(p.s) {
					if p.s[p.pos] == '\'' {
						if p.pos+1 < len(p.s) && p.s[p.pos+1] == '\'' {
							text.WriteByte('\'')
							p.pos += 2
							continue
						}
						p.pos++
						break
					}
					text.WriteByte(p.s[p.pos])
					p.pos++
				}
			default:
				text.WriteByte('\'')
			}
		default:
			text.WriteByte(c)
			p.pos++
		}
	}
	flush()
	return out, nil
}

func (p *parser) space() {
	for p.pos < len(p.s) && strings.IndexByte(" \t\r\n", p.s[p.pos]) >= 0 {
		p.pos++
	}
}

func (p *parser) word() string {
	p.space()
	start := p.pos
	for p.pos < len(p.s) && strings.IndexByte(" \t\r\n,{}", p.s[p.pos]) < 0 {
		p.pos++
	}
	return p.s[start:p.pos]
}

// argument parses from "{" to its "}".
func (p *parser) argument() (node, error) {
	p.pos++ // {
	name := p.word()
	if name == "" {
		return node{}, fmt.Errorf("empty argument at %d", p.pos)
	}
	p.space()
	if p.pos < len(p.s) && p.s[p.pos] == '}' {
		p.pos++
		return node{kind: argNode, text: name}, nil
	}
	if p.pos >= len(p.s) || p.s[p.pos] != ',' {
		return node{}, fmt.Errorf("expected , or } at %d", p.pos)
	}
	p.pos++
	n := node{text: name}
	switch typ := p.word(); typ {
	case "plural":
		n.kind = pluralNode
	case "selectordinal":
		n.kind = ordinalNode
	case "select":
		n.kind = selectNode
	default:
		return node{}, fmt.Errorf("unsupported argument type %q", typ)
	}
	p.space()
	if p.pos >= len(p.s) || p.s[p.pos] != ',' {
		return node{}, fmt.Errorf("expected , at %d", p.pos)
	}
	p.pos++
	for {
		key := p.word()
		if key == "" {
			p.space()
			if p.pos < len(p.s) && p.s[p.pos] == '}' {
				p.pos++
				return n, nil
			}
			return node{}, fmt.Errorf("expected a case at %d", p.pos)
		}
		if strings.HasPrefix(key, "offset:") && n.kind != selectNode {
			off, err := strconv.ParseFloat(strings.TrimPrefix(key, "offset:"), 64)
			if err != nil {
				return node{}, err
			}
			n.offset = off
			continue
		}
		p.space()
		if p.pos >= len(p.s) || p.s[p.pos] != '{' {
			return node{}, fmt.Errorf("expected { after case %q", key)
		}
		p.pos++
		body, err := p.nodes(n.kind != selectNode)
		if err != nil {
			return node{}, err
		}
		if p.pos >= len(p.s) || p.s[p.pos] != '}' {
			return node{}, fmt.Errorf("unterminated case %q", key)
		}
		p.pos++
		n.cases = append(n.cases, icuCase{key: key, nodes: body})
	}
}

// htmlMode formats for HTML: text is escaped and Lingui's numbered tags
// become the elements given as arguments.
type htmlMode struct{}

var tagRe = regexp.MustCompile(`<(/?)(\d+)(/?)>`)
var elementName = regexp.MustCompile(`^<([a-zA-Z][a-zA-Z0-9-]*)`)

// format fills in a message's arguments; h is nil for plain text.
func format(lang, msg string, args map[string]any, h *htmlMode) string {
	var b strings.Builder
	formatNodes(&b, lang, parseCached(msg), args, h, nil)
	return b.String()
}

func formatNodes(b *strings.Builder, lang string, nodes []node, args map[string]any, h *htmlMode, pound *float64) {
	for _, n := range nodes {
		switch n.kind {
		case textNode:
			writeText(b, n.text, args, h)
		case poundNode:
			if pound != nil {
				b.WriteString(formatNumber(lang, *pound))
			}
		case argNode:
			writeValue(b, args[n.text], h)
		case selectNode:
			v := fmt.Sprint(args[n.text])
			formatNodes(b, lang, pick(n.cases, v, ""), args, h, pound)
		case pluralNode, ordinalNode:
			v, ok := number(args[n.text])
			if !ok {
				formatNodes(b, lang, pick(n.cases, "", "other"), args, h, nil)
				continue
			}
			exact := "=" + strconv.FormatFloat(v, 'f', -1, 64)
			rel := v - n.offset
			cat := pluralCategory(lang, rel, n.kind == ordinalNode)
			formatNodes(b, lang, pick(n.cases, exact, cat), args, h, &rel)
		}
	}
}

// pick chooses the case keyed exact, else cat, else other.
func pick(cases []icuCase, exact, cat string) []node {
	for _, want := range []string{exact, cat, "other"} {
		if want == "" {
			continue
		}
		for _, c := range cases {
			if c.key == want {
				return c.nodes
			}
		}
	}
	return nil
}

func writeText(b *strings.Builder, s string, args map[string]any, h *htmlMode) {
	if h == nil {
		b.WriteString(tagRe.ReplaceAllString(s, ""))
		return
	}
	last := 0
	for _, m := range tagRe.FindAllStringSubmatchIndex(s, -1) {
		b.WriteString(template.HTMLEscapeString(s[last:m[0]]))
		last = m[1]
		// <N> and <N/> are the argument itself, </N> closes its element.
		open, _ := args[s[m[4]:m[5]]].(template.HTML)
		if m[3] > m[2] {
			if el := elementName.FindStringSubmatch(string(open)); el != nil {
				b.WriteString("</" + el[1] + ">")
			}
		} else {
			b.WriteString(string(open))
		}
	}
	b.WriteString(template.HTMLEscapeString(s[last:]))
}

func writeValue(b *strings.Builder, v any, h *htmlMode) {
	if v == nil {
		return
	}
	if h != nil {
		if s, ok := v.(template.HTML); ok {
			b.WriteString(string(s))
			return
		}
		b.WriteString(template.HTMLEscapeString(fmt.Sprint(v)))
		return
	}
	b.WriteString(fmt.Sprint(v))
}

// number reads a plural's argument.
func number(v any) (float64, bool) {
	switch x := v.(type) {
	case int:
		return float64(x), true
	case int32:
		return float64(x), true
	case int64:
		return float64(x), true
	case uint:
		return float64(x), true
	case uint64:
		return float64(x), true
	case float32:
		return float64(x), true
	case float64:
		return x, !math.IsNaN(x)
	case string:
		f, err := strconv.ParseFloat(strings.TrimSpace(x), 64)
		return f, err == nil
	case fmt.Stringer:
		f, err := strconv.ParseFloat(x.String(), 64)
		return f, err == nil
	}
	return 0, false
}
