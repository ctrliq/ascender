package jinja

// The runtime objects templates see: the loop, macros, namespaces,
// cyclers, joiners, self and super, and markupsafe's escaping.

import (
	"fmt"
	"html"
	"strings"

	"github.com/ctrliq/ascender/internal/pystr"
)

// ---------------------------------------------------------------- LoopContext

// LoopContext is jinja2.runtime.LoopContext.
type LoopContext struct {
	r           *renderer
	lenSource   Value
	iter        Iterator
	undefined   UndefinedKind
	index0      int
	length      int
	hasLength   bool
	after       Value
	hasAfter    bool
	current     Value
	before      Value
	lastChanged Value
	hasChanged  bool
	depth0      int
	recurse     func(Value) Value
}

func newLoopContext(r *renderer, lenSource Value, iter Iterator, depth0 int) *LoopContext {
	return &LoopContext{r: r, lenSource: lenSource, iter: iter, undefined: r.undef, index0: -1, depth0: depth0}
}

func (l *LoopContext) next() (Value, bool) {
	var rv Value
	if l.hasAfter {
		rv, l.after, l.hasAfter = l.after, nil, false
		if _, done := rv.(loopDone); done {
			return nil, false
		}
	} else {
		v, ok := l.iter()
		if !ok {
			return nil, false
		}
		rv = v
	}
	l.index0++
	l.before = l.current
	l.current = rv
	return rv, true
}

// loopDone marks a peek that found the end.
type loopDone struct{}

func (l *LoopContext) peek() (Value, bool) {
	if l.hasAfter {
		_, done := l.after.(loopDone)
		return l.after, !done
	}
	v, ok := l.iter()
	l.hasAfter = true
	if !ok {
		l.after = loopDone{}
		return nil, false
	}
	l.after = v
	return v, true
}

func (l *LoopContext) getLength() int {
	if l.hasLength {
		return l.length
	}
	if l.lenSource != nil && hasLen(l.lenSource) {
		l.length = length(l.lenSource)
	} else {
		var rest []Value
		for {
			v, ok := l.iter()
			if !ok {
				break
			}
			rest = append(rest, v)
		}
		l.iter = iterate(&List{Items: rest})
		extra := 0
		if l.hasAfter {
			if _, done := l.after.(loopDone); !done {
				extra = 1
			}
		}
		l.length = len(rest) + l.index0 + 1 + extra
	}
	l.hasLength = true
	return l.length
}

func (l *LoopContext) TypeName() string { return "LoopContext" }
func (l *LoopContext) Module() string   { return "jinja2.runtime" }
func (l *LoopContext) Repr() string {
	return fmt.Sprintf("<LoopContext %d/%d>", l.index0+1, l.getLength())
}
func (l *LoopContext) Len() int { return l.getLength() }

func (l *LoopContext) Attr(name string) (Value, bool) {
	switch name {
	case "index0":
		return int64(l.index0), true
	case "index":
		return int64(l.index0 + 1), true
	case "length":
		return int64(l.getLength()), true
	case "revindex":
		return int64(l.getLength() - l.index0), true
	case "revindex0":
		return int64(l.getLength() - l.index0 - 1), true
	case "first":
		return l.index0 == 0, true
	case "last":
		_, ok := l.peek()
		return !ok, true
	case "depth":
		return int64(l.depth0 + 1), true
	case "depth0":
		return int64(l.depth0), true
	case "previtem":
		if l.index0 == 0 {
			return newUndefined(l.undefined, "there is no previous item", nil, false, nil, false, ""), true
		}
		return l.before, true
	case "nextitem":
		v, ok := l.peek()
		if !ok {
			return newUndefined(l.undefined, "there is no next item", nil, false, nil, false, ""), true
		}
		return v, true
	case "cycle":
		return &builtinFunc{name: "cycle", fn: func(r *renderer, args []Value, kw []kwarg) Value {
			if len(kw) > 0 {
				typeError("LoopContext.cycle() got an unexpected keyword argument " + pystr.Repr(kw[0].Name))
			}
			if len(args) == 0 {
				typeError("no items for cycling given")
			}
			return args[l.index0%len(args)]
		}}, true
	case "changed":
		return &builtinFunc{name: "changed", fn: func(r *renderer, args []Value, kw []kwarg) Value {
			v := Tuple(args)
			if !l.hasChanged || !equal(l.lastChanged, v) {
				l.lastChanged, l.hasChanged = v, true
				return true
			}
			return false
		}}, true
	}
	return nil, false
}

// Call is loop(iterable) in a recursive loop.
func (l *LoopContext) Call(r *renderer, args []Value, kwargs []kwarg) Value {
	if l.recurse == nil {
		typeError("The loop must have the 'recursive' marker to be called recursively.")
	}
	if len(args) != 1 || len(kwargs) > 0 {
		typeError(fmt.Sprintf("LoopContext.__call__() takes 2 positional arguments but %d were given", len(args)+1))
	}
	return l.recurse(args[0])
}

// ---------------------------------------------------------------- Macro

// Macro is jinja2.runtime.Macro.
type Macro struct {
	r              *renderer
	name           string
	named          bool
	arguments      []string
	extraParams    []string
	catchKwargs    bool
	catchVarargs   bool
	caller         bool
	explicitCaller bool
	autoescape     Value
	invoke         func([]Value) string
}

func (m *Macro) TypeName() string { return "Macro" }
func (m *Macro) Module() string   { return "jinja2.runtime" }
func (m *Macro) Repr() string {
	if !m.named {
		return "<Macro anonymous>"
	}
	return "<Macro " + pystr.Repr(m.name) + ">"
}

func (m *Macro) Attr(name string) (Value, bool) {
	switch name {
	case "name":
		if !m.named {
			return nil, true
		}
		return m.name, true
	case "arguments":
		out := make(Tuple, len(m.arguments))
		for i, a := range m.arguments {
			out[i] = a
		}
		return out, true
	case "catch_kwargs":
		return m.catchKwargs, true
	case "catch_varargs":
		return m.catchVarargs, true
	case "caller":
		return m.caller, true
	}
	return nil, false
}

// Call is a call without an eval context (from a filter such as map).
func (m *Macro) Call(r *renderer, args []Value, kwargs []kwarg) Value {
	return m.call(args, kwargs, m.autoescape)
}

// call is Macro.__call__.
func (m *Macro) call(args []Value, kwargs []kwarg, autoescape Value) Value {
	n := len(m.arguments)
	var arguments []Value
	if len(args) > n {
		arguments = append(arguments, args[:n]...)
	} else {
		arguments = append(arguments, args...)
	}
	kw := append([]kwarg{}, kwargs...)
	pop := func(name string) (Value, bool) {
		for i, k := range kw {
			if k.Name == name {
				kw = append(kw[:i], kw[i+1:]...)
				return k.Value, true
			}
		}
		return nil, false
	}
	foundCaller := false
	if len(arguments) != n {
		for _, name := range m.arguments[len(arguments):] {
			v, ok := pop(name)
			if !ok {
				v = missingValue{}
			}
			if name == "caller" {
				foundCaller = true
			}
			arguments = append(arguments, v)
		}
	} else {
		foundCaller = m.explicitCaller
	}
	if m.caller && !foundCaller {
		c, ok := pop("caller")
		if !ok || c == nil {
			c = newUndefined(m.r.undef, "No caller defined", nil, false, "caller", true, "")
		}
		arguments = append(arguments, c)
	}
	if m.catchKwargs {
		d := NewDict()
		for _, k := range kw {
			d.Set(k.Name, k.Value)
		}
		arguments = append(arguments, d)
	} else if len(kw) > 0 {
		for _, k := range kw {
			if k.Name == "caller" {
				typeError(fmt.Sprintf("macro %s was invoked with two values for the special caller argument. This is most likely a bug.", pystr.Repr(m.name)))
			}
		}
		typeError(fmt.Sprintf("macro %s takes no keyword argument %s", reprMacroName(m), pystr.Repr(kw[0].Name)))
	}
	if m.catchVarargs {
		var rest Tuple
		if len(args) > n {
			rest = append(rest, args[n:]...)
		} else {
			rest = Tuple{}
		}
		arguments = append(arguments, rest)
	} else if len(args) > n {
		typeError(fmt.Sprintf("macro %s takes not more than %d argument(s)", reprMacroName(m), len(m.arguments)))
	}
	out := m.invoke(arguments)
	if truth(autoescape) {
		return Markup(out)
	}
	return out
}

func reprMacroName(m *Macro) string {
	if !m.named {
		return "None"
	}
	return pystr.Repr(m.name)
}

// ---------------------------------------------------------------- Namespace

// Namespace is jinja2.utils.Namespace.
type Namespace struct{ attrs *Dict }

func (n *Namespace) TypeName() string { return "Namespace" }
func (n *Namespace) Module() string   { return "jinja2.utils" }
func (n *Namespace) Repr() string     { return "<Namespace " + repr(n.attrs) + ">" }
func (n *Namespace) Attr(name string) (Value, bool) {
	if v, ok := n.attrs.Get(name); ok {
		return v, true
	}
	return nil, false
}
func (n *Namespace) Iter() Iterator {
	typeError("'Namespace' object is not iterable")
	return nil
}

func newNamespace(r *renderer, args []Value, kwargs []kwarg) Value {
	d := dictConstructor(r, args, kwargs).(*Dict)
	return &Namespace{attrs: d}
}

// ---------------------------------------------------------------- cycler, joiner

// Cycler is jinja2.utils.Cycler.
type Cycler struct {
	items []Value
	pos   int
}

func (c *Cycler) TypeName() string { return "Cycler" }
func (c *Cycler) Module() string   { return "jinja2.utils" }
func (c *Cycler) Repr() string     { return "<jinja2.utils.Cycler object at 0x7f0000000000>" }
func (c *Cycler) Attr(name string) (Value, bool) {
	switch name {
	case "items":
		return &List{Items: c.items}, true
	case "pos":
		return int64(c.pos), true
	case "current":
		return c.items[c.pos], true
	case "next", "__next__":
		return &builtinFunc{name: "next", fn: func(*renderer, []Value, []kwarg) Value {
			rv := c.items[c.pos]
			c.pos = (c.pos + 1) % len(c.items)
			return rv
		}}, true
	case "reset":
		return &builtinFunc{name: "reset", fn: func(*renderer, []Value, []kwarg) Value {
			c.pos = 0
			return nil
		}}, true
	}
	return nil, false
}

func newCycler(r *renderer, args []Value, kwargs []kwarg) Value {
	if len(kwargs) > 0 {
		typeError("Cycler.__init__() got an unexpected keyword argument " + pystr.Repr(kwargs[0].Name))
	}
	if len(args) == 0 {
		raise("RuntimeError", "at least one item has to be provided")
	}
	return &Cycler{items: args}
}

// Joiner is jinja2.utils.Joiner.
type Joiner struct {
	used bool
	sepV Value
}

func (j *Joiner) TypeName() string               { return "Joiner" }
func (j *Joiner) Module() string                 { return "jinja2.utils" }
func (j *Joiner) Repr() string                   { return "<jinja2.utils.Joiner object at 0x7f0000000000>" }
func (j *Joiner) Attr(name string) (Value, bool) { return nil, false }
func (j *Joiner) Call(*renderer, []Value, []kwarg) Value {
	if !j.used {
		j.used = true
		return ""
	}
	return j.sepV
}

func newJoiner(r *renderer, args []Value, kwargs []kwarg) Value {
	a := argList{fn: "Joiner.__init__", args: args, kwargs: kwargs}
	p := a.named([]string{"sep"}, []Value{", "})
	return &Joiner{sepV: p[0]}
}

// ---------------------------------------------------------------- self, super

type templateReference struct {
	r   *renderer
	ctx *Context
}

func (t *templateReference) TypeName() string               { return "TemplateReference" }
func (t *templateReference) Module() string                 { return "jinja2.runtime" }
func (t *templateReference) Repr() string                   { return "<TemplateReference None>" }
func (t *templateReference) Attr(name string) (Value, bool) { return t.Item(name) }
func (t *templateReference) Item(key Value) (Value, bool) {
	name, _ := key.(string)
	blocks := t.ctx.blocks[name]
	if len(blocks) == 0 {
		raise("KeyError", repr(key))
	}
	return &blockReference{r: t.r, ctx: t.ctx, name: name, blocks: blocks, index: 0}, true
}

type blockReference struct {
	r      *renderer
	ctx    *Context
	name   string
	blocks []*Block
	index  int
}

func (b *blockReference) TypeName() string { return "BlockReference" }
func (b *blockReference) Module() string   { return "jinja2.runtime" }
func (b *blockReference) Repr() string     { return "<BlockReference " + pystr.Repr(b.name) + ">" }
func (b *blockReference) Attr(name string) (Value, bool) {
	if name == "super" {
		if b.index+1 >= len(b.blocks) {
			return newUndefined(b.r.undef, "there is no parent block called "+pystr.Repr(b.name)+".", nil, false, "super", true, ""), true
		}
		return &blockReference{r: b.r, ctx: b.ctx, name: b.name, blocks: b.blocks, index: b.index + 1}, true
	}
	return nil, false
}
func (b *blockReference) Call(r *renderer, args []Value, kwargs []kwarg) Value {
	if len(args) > 0 || len(kwargs) > 0 {
		typeError("BlockReference.__call__() takes 1 positional argument")
	}
	out := r.renderBlock(b.blocks[b.index], b.ctx)
	if truth(b.ctx.eval.autoescape) {
		return Markup(out)
	}
	return out
}

// ---------------------------------------------------------------- markupsafe

// escapeHTML is markupsafe's escaping of a str.
func escapeHTML(s string) string {
	if !strings.ContainsAny(s, `&<>'"`) {
		return s
	}
	var b strings.Builder
	for _, r := range s {
		switch r {
		case '&':
			b.WriteString("&amp;")
		case '<':
			b.WriteString("&lt;")
		case '>':
			b.WriteString("&gt;")
		case '\'':
			b.WriteString("&#39;")
		case '"':
			b.WriteString("&#34;")
		default:
			b.WriteRune(r)
		}
	}
	return b.String()
}

// escapeValue is markupsafe.escape.
func escapeValue(v Value) Markup {
	switch x := v.(type) {
	case Markup:
		return x
	case interface{ HTML() string }:
		return Markup(x.HTML())
	}
	return Markup(escapeHTML(str(v)))
}

func unescapeHTML(s string) string { return html.UnescapeString(s) }

// striptags is Markup.striptags: comments, then tags, removed, whitespace
// collapsed, entities unescaped.
func striptags(s string) string {
	for {
		start := strings.Index(s, "<!--")
		if start < 0 {
			break
		}
		end := strings.Index(s[start:], "-->")
		if end < 0 {
			break
		}
		s = s[:start] + s[start+end+3:]
	}
	for {
		start := strings.Index(s, "<")
		if start < 0 {
			break
		}
		end := strings.Index(s[start:], ">")
		if end < 0 {
			break
		}
		s = s[:start] + s[start+end+1:]
	}
	s = strings.Join(strings.FieldsFunc(s, pystr.IsSpace), " ")
	return unescapeHTML(s)
}
