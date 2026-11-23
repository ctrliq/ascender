package tmplws

import (
	"strings"
)

// Limit is the line width Format aims for, counting a tab as TabWidth.
const (
	Limit    = 100
	TabWidth = 4
)

type nodeKind int

const (
	leafNode nodeKind = iota
	elemNode
	blockNode
)

// node is a leaf token, an element (open tag, children, close tag) or an
// action block ({{if}} sections separated by {{else}}, then {{end}}).
type node struct {
	kind nodeKind
	tok  Token   // a leaf
	keys []Token // element: open, close; block: open, mids..., end
	secs []seq   // element: one; block: one per section
	// noIndent keeps a {{define}} body at its block's level.
	noIndent bool
}

// seq is a run of nodes and the whitespace around them: gaps[i] comes before
// nodes[i], gaps[len(nodes)] after the last.
type seq struct {
	nodes []*node
	gaps  []string
}

func actionKeyword(src string) string {
	s := strings.TrimPrefix(src, "{{")
	s = strings.TrimPrefix(s, "-")
	s = strings.TrimLeft(s, " \t\r\n")
	end := 0
	for end < len(s) && isLetter(s[end]) {
		end++
	}
	switch w := s[:end]; w {
	case "if", "range", "with", "define", "block":
		return "open"
	case "else":
		return "mid"
	case "end":
		return "end"
	}
	return ""
}

// unit is a token, or a whole raw element (pre, textarea, script, style)
// merged into one tag-like leaf.
func units(toks []Token) []Token {
	var out []Token
	for i := 0; i < len(toks); i++ {
		t := toks[i]
		if t.Kind == Tag && !t.Close && !t.SelfClose && rawElements[t.Name] {
			src := t.Src
			j := i + 1
			if j < len(toks) && toks[j].Kind == Raw {
				src += toks[j].Src
				j++
			}
			if j < len(toks) && toks[j].Kind == Tag && toks[j].Close && toks[j].Name == t.Name {
				src += toks[j].Src
				out = append(out, Token{Kind: Tag, Src: src, Name: t.Name, SelfClose: true})
				i = j
				continue
			}
		}
		out = append(out, t)
	}
	return out
}

// match pairs open tags with their closing tags and block actions with their
// {{else}}s and {{end}}, never letting an element cross a block boundary.
// Tags that do not pair stay leaves.
func match(us []Token) (closeOf map[int]int, midsOf map[int][]int) {
	closeOf = map[int]int{}
	midsOf = map[int][]int{}
	type entry struct {
		block bool
		i     int
	}
	var stack []entry
	popElems := func() {
		for len(stack) > 0 && !stack[len(stack)-1].block {
			stack = stack[:len(stack)-1]
		}
	}
	for i, u := range us {
		switch {
		case u.Kind == Tag && !u.Close && !u.SelfClose:
			stack = append(stack, entry{false, i})
		case u.Kind == Tag && u.Close:
			for k := len(stack) - 1; k >= 0 && !stack[k].block; k-- {
				if us[stack[k].i].Name == u.Name {
					closeOf[stack[k].i] = i
					stack = stack[:k]
					break
				}
			}
		case u.Kind == Action:
			switch actionKeyword(u.Src) {
			case "open":
				stack = append(stack, entry{true, i})
			case "mid":
				popElems()
				if len(stack) > 0 {
					b := stack[len(stack)-1].i
					midsOf[b] = append(midsOf[b], i)
				}
			case "end":
				popElems()
				if len(stack) > 0 {
					closeOf[stack[len(stack)-1].i] = i
					stack = stack[:len(stack)-1]
				}
			}
		}
	}
	return closeOf, midsOf
}

func build(us []Token, from, to int, closeOf map[int]int, midsOf map[int][]int) seq {
	var s seq
	gap := ""
	for i := from; i < to; i++ {
		u := us[i]
		if u.Kind == Space {
			gap = u.Src
			continue
		}
		var n *node
		if end, ok := closeOf[i]; ok {
			if u.Kind == Tag {
				n = &node{kind: elemNode, keys: []Token{u, us[end]},
					secs: []seq{build(us, i+1, end, closeOf, midsOf)}}
			} else {
				n = &node{kind: blockNode, keys: []Token{u}, noIndent: strings.Contains(u.Src, "define")}
				start := i + 1
				for _, m := range midsOf[i] {
					n.secs = append(n.secs, build(us, start, m, closeOf, midsOf))
					n.keys = append(n.keys, us[m])
					start = m + 1
				}
				n.secs = append(n.secs, build(us, start, end, closeOf, midsOf))
				n.keys = append(n.keys, us[end])
			}
			i = end
		} else {
			n = &node{kind: leafNode, tok: u}
		}
		s.nodes = append(s.nodes, n)
		s.gaps = append(s.gaps, gap)
		gap = ""
	}
	s.gaps = append(s.gaps, gap)
	return s
}

// item is a node or the key token (open tag, {{else}}, close tag...) of
// the container being laid out, which sits at the container's indent.
type item struct {
	n   *node
	key *Token
	in  int // extra indent: 1 for children, 0 for keys
}

func (it item) first() *Token {
	if it.key != nil {
		return it.key
	}
	return it.n.first()
}

func (it item) last() *Token {
	if it.key != nil {
		return it.key
	}
	return it.n.last()
}

func (n *node) first() *Token {
	if n.kind == leafNode {
		return &n.tok
	}
	return &n.keys[0]
}

func (n *node) last() *Token {
	if n.kind == leafNode {
		return &n.tok
	}
	return &n.keys[len(n.keys)-1]
}

func hasNewline(s string) bool { return strings.ContainsAny(s, "\n\r") }

// inline reports whether t is text or an action that prints text; a
// {{template}} call or a variable assignment is laid out like a tag.
func inline(t *Token) bool {
	if t.Kind == Text {
		return true
	}
	if t.Kind != Action || actionKeyword(t.Src) != "" {
		return false
	}
	s := strings.TrimLeft(strings.TrimPrefix(strings.TrimPrefix(t.Src, "{{"), "-"), " \t\r\n")
	if strings.HasPrefix(s, "template ") || strings.HasPrefix(s, "/*") {
		return false
	}
	if strings.HasPrefix(s, "$") {
		f := strings.Fields(s)
		return !(len(f) > 1 && (f[1] == ":=" || f[1] == "="))
	}
	return true
}

// glued reports whether a line break may not go between a and b: the gap
// between them is whitespace without a line break (which is rendered), or
// nothing at all between two pieces of inline content.
func glued(a, b *Token, gap string) bool {
	if gap != "" {
		return !hasNewline(gap)
	}
	return inline(a) && inline(b)
}

// flatGap is the gap as it renders on one line.
func flatGap(a, b *Token, gap string) string {
	if !hasNewline(gap) {
		return gap
	}
	return JoinSpace(a, b)
}

func (n *node) items() ([]item, []string) {
	var its []item
	var gaps []string
	in := 1
	if n.noIndent {
		in = 0
	}
	for k := range n.keys {
		its = append(its, item{key: &n.keys[k]})
		if k < len(n.secs) {
			s := n.secs[k]
			for i, c := range s.nodes {
				gaps = append(gaps, s.gaps[i])
				its = append(its, item{n: c, in: in})
			}
			gaps = append(gaps, s.gaps[len(s.nodes)])
		}
	}
	return its, gaps
}

func (n *node) flat() string {
	if n.kind == leafNode {
		return n.tok.Src
	}
	its, gaps := n.items()
	var b strings.Builder
	for i, it := range its {
		if i > 0 {
			b.WriteString(flatGap(its[i-1].last(), it.first(), gaps[i-1]))
		}
		if it.key != nil {
			b.WriteString(it.key.Src)
		} else {
			b.WriteString(it.n.flat())
		}
	}
	return b.String()
}

type line struct {
	indent   int
	text     string
	verbatim bool // continuation of a multi-line token: not re-indented
}

func width(indent int, text string) int { return indent*TabWidth + len(text) }

// lay out appends n to lines: on the last line (after prefix) when cont is
// set, else on a new line at indent.
func layout(lines []line, n *node, indent int, cont bool) []line {
	start := func(text string) []line {
		parts := strings.Split(text, "\n")
		if cont {
			lines[len(lines)-1].text += parts[0]
		} else {
			lines = append(lines, line{indent: indent, text: parts[0]})
		}
		for _, p := range parts[1:] {
			lines = append(lines, line{text: p, verbatim: true})
		}
		return lines
	}
	if n.kind == leafNode {
		return start(n.tok.Src)
	}
	f := n.flat()
	col := indent * TabWidth
	if cont {
		l := lines[len(lines)-1]
		col = width(l.indent, l.text)
		if l.verbatim {
			col = len(l.text)
		}
	}
	if !hasNewline(f) && col+len(f) <= Limit {
		return start(f)
	}
	its, gaps := n.items()
	for i, it := range its {
		c := cont && i == 0
		if i > 0 && glued(its[i-1].last(), it.first(), gaps[i-1]) {
			lines[len(lines)-1].text += gaps[i-1]
			c = true
		}
		if it.key != nil {
			lines = layoutTok(lines, it.key, indent, c)
		} else {
			lines = layout(lines, it.n, indent+it.in, c)
		}
	}
	return lines
}

func layoutTok(lines []line, t *Token, indent int, cont bool) []line {
	return layout(lines, &node{kind: leafNode, tok: *t}, indent, cont)
}

// Format lays a template's markup out on indented lines, breaking elements
// and action blocks that do not fit in Limit columns. Collapse gives the
// same result for the output as for the input.
func Format(src string) string {
	us := units(Scan(src))
	closeOf, midsOf := match(us)
	top := build(us, 0, len(us), closeOf, midsOf)
	var lines []line
	lead := top.gaps[0]
	for i, n := range top.nodes {
		cont := false
		if i == 0 {
			if lead != "" && !hasNewline(lead) {
				lines = append(lines, line{text: lead})
				cont = true
			}
		} else if glued(top.nodes[i-1].last(), n.first(), top.gaps[i]) {
			lines[len(lines)-1].text += top.gaps[i]
			cont = true
		}
		lines = layout(lines, n, 0, cont)
	}
	var b strings.Builder
	for i, l := range lines {
		if i > 0 {
			b.WriteByte('\n')
		}
		if !l.verbatim {
			b.WriteString(strings.Repeat("\t", l.indent))
		}
		b.WriteString(l.text)
	}
	if trail := top.gaps[len(top.nodes)]; hasNewline(trail) {
		b.WriteByte('\n')
	} else {
		b.WriteString(trail)
	}
	return b.String()
}
