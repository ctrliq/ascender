package jinja

// The template interpreter: jinja2/compiler.py's code generator, run as a
// tree walker. Frames and variable identifiers follow the compiler (see
// symbols.go): each Python function the compiler would write (the root, a
// block, a macro, a loop's filter or recursion) gets a store of its own
// whose parent is the store of the function it is defined in, so closures
// see later assignments as Python's do.

import (
	"fmt"
	"strings"
	"time"

	"github.com/ctrliq/ascender/internal/pystr"
)

type cell struct {
	v   Value
	set bool
}

// store is one Python function invocation's local variables.
type store struct {
	cells  map[string]*cell
	parent *store
}

func newStore(parent *store) *store { return &store{cells: map[string]*cell{}, parent: parent} }

func (s *store) lookup(ident string) *cell {
	for st := s; st != nil; st = st.parent {
		if c, ok := st.cells[ident]; ok {
			return c
		}
	}
	return nil
}

func (s *store) set(ident string, v Value) {
	c, ok := s.cells[ident]
	if !ok {
		c = &cell{}
		s.cells[ident] = c
	}
	c.v, c.set = v, true
}

func (s *store) unset(ident string) {
	if c, ok := s.cells[ident]; ok {
		c.v, c.set = nil, false
		return
	}
	s.cells[ident] = &cell{}
}

// Context is jinja2.runtime.Context.
type Context struct {
	parent   map[string]Value
	vars     map[string]Value
	varOrder []string
	blocks   map[string][]*Block
	// autoescape is the eval context's flag, shared by derived contexts.
	eval *evalContext
}

type evalContext struct{ autoescape Value }

func (c *Context) resolveOrMissing(key string) (Value, bool) {
	if v, ok := c.vars[key]; ok {
		return v, true
	}
	if v, ok := c.parent[key]; ok {
		return v, true
	}
	return nil, false
}

func (c *Context) setVar(key string, v Value) {
	if _, ok := c.vars[key]; !ok {
		c.varOrder = append(c.varOrder, key)
	}
	c.vars[key] = v
}

// derived is Context.derived(locals).
func (c *Context) derived(locals map[string]Value) *Context {
	parent := map[string]Value{}
	for k, v := range c.parent {
		parent[k] = v
	}
	for k, v := range c.vars {
		parent[k] = v
	}
	n := &Context{parent: parent, vars: map[string]Value{}, eval: c.eval, blocks: map[string][]*Block{}}
	for k, v := range locals {
		n.setVar(k, v)
	}
	for k, v := range c.blocks {
		n.blocks[k] = append([]*Block{}, v...)
	}
	return n
}

type renderer struct {
	undef    UndefinedKind
	deadline time.Time
	steps    int
	depth    int
	line     int
	// evalState is the compiler's eval context where an Output, Concat,
	// FilterBlock or AssignBlock was compiled: the autoescape setting it
	// knew, and whether it was volatile (set by a non-constant), when it
	// checks the runtime setting instead.
	evalState map[Node]evalBits
}

// frame is the compiler's Frame plus the runtime state it names.
type frame struct {
	sym                                     *symbols
	st                                      *store
	ctx                                     *Context
	w                                       *strings.Builder
	toplevel, rootlevel, loopFrame, blockFr bool
	loopVars, blockVars                     map[string]Value
}

func (f *frame) inner() *frame {
	return &frame{sym: newSymbols(f.sym, -1), st: f.st, ctx: f.ctx, w: f.w, loopVars: f.loopVars, blockVars: f.blockVars}
}

func (f *frame) soft() *frame {
	c := *f
	c.rootlevel = false
	return &c
}

func (r *renderer) tick() {
	r.steps++
	if r.steps%1024 == 0 && !r.deadline.IsZero() && time.Now().After(r.deadline) {
		raise("TimeoutError", "template rendering took too long")
	}
}

// enterFrame is CodeGenerator.enter_frame: the frame's load instructions.
func (r *renderer) enterFrame(f *frame) {
	for _, ident := range f.sym.loadOrder {
		l := f.sym.loads[ident]
		switch l.action {
		case loadResolve:
			if v, ok := f.ctx.resolveOrMissing(l.param); ok {
				f.st.set(ident, v)
			} else {
				f.st.unset(ident)
			}
		case loadAlias:
			if c := f.st.lookup(l.param); c != nil && c.set {
				f.st.set(ident, c.v)
			} else {
				f.st.unset(ident)
			}
		case loadUndefined:
			f.st.unset(ident)
		}
	}
}

// leaveFrame is leave_frame without a Python scope: every identifier the
// frame loads becomes missing.
func (r *renderer) leaveFrame(f *frame) {
	for _, ident := range f.sym.loadOrder {
		f.st.unset(ident)
	}
}

func (r *renderer) write(f *frame, s string) { f.w.WriteString(s) }

// writeRaw writes what start_write/end_write would yield as is: the
// final concatenation needs a str.
func (r *renderer) writeRaw(f *frame, v Value) {
	s, ok := asStr(v)
	if !ok {
		typeError(fmt.Sprintf("sequence item 0: expected str instance, %s found", typeName(v)))
	}
	r.write(f, s)
}

func (r *renderer) execBody(body []Node, f *frame) {
	for _, n := range body {
		r.exec(n, f)
	}
}

func (r *renderer) exec(n Node, f *frame) {
	r.tick()
	if l := n.line(); l > 0 {
		r.line = l
	}
	switch x := n.(type) {
	case *Output:
		static := r.evalState[x]&evalStatic != 0
		for _, child := range x.Nodes {
			if td, ok := child.(*TemplateData); ok {
				r.write(f, td.Data)
				continue
			}
			if isConstExpr(child) {
				// The compiler folds a constant with the autoescape
				// setting it knew, not the one set at runtime.
				cf := *f
				cctx := *f.ctx
				cctx.eval = &evalContext{autoescape: static}
				cf.ctx = &cctx
				if v, ok := r.tryEval(child, &cf); ok {
					if static {
						r.write(f, string(escapeValue(v)))
					} else {
						r.write(f, str(v))
					}
					continue
				}
			}
			v := r.eval(child, f)
			if r.autoescape(x, f) {
				r.write(f, string(escapeValue(v)))
			} else {
				r.write(f, str(v))
			}
		}
	case *Assign:
		r.execAssign(x, f)
	case *AssignBlock:
		r.execAssignBlock(x, f)
	case *If:
		sf := f.soft()
		if truth(r.eval(x.Test, sf)) {
			r.execBody(x.Body, sf)
			return
		}
		for _, e := range x.Elif {
			if truth(r.eval(e.Test, sf)) {
				r.execBody(e.Body, sf)
				return
			}
		}
		r.execBody(x.Else, sf)
	case *For:
		r.execFor(x, f)
	case *With:
		wf := f.inner()
		wf.sym.analyzeNode(x, "")
		r.enterFrame(wf)
		for i, t := range x.Targets {
			r.assignTarget(t, r.eval(x.Values[i], f), wf)
		}
		r.execBody(x.Body, wf)
		r.leaveFrame(wf)
	case *FilterBlock:
		ff := f.inner()
		ff.sym.analyzeNode(x, "")
		r.enterFrame(ff)
		buf := &strings.Builder{}
		ff.w = buf
		r.execBody(x.Body, ff)
		var body Value = buf.String()
		if r.autoescape(x, f) {
			body = Markup(buf.String())
		}
		r.writeRaw(f, r.applyFilter(x.Filter, body, true, ff))
		r.leaveFrame(ff)
	case *MacroNode:
		m := r.defineMacro(x.Name, x.Args, x.Defaults, x.Body, x, f, true)
		if f.toplevel {
			f.ctx.setVar(x.Name, m)
		}
		f.st.set(f.sym.ref(x.Name), m)
	case *CallBlock:
		caller := r.defineMacro("", x.Args, x.Defaults, x.Body, x, f, false)
		r.writeRaw(f, r.evalCall(x.Call, f, caller))
	case *Block:
		r.execBlockCall(x, f)
	case *Extends:
		r.eval(x.Template, f)
		typeError("no loader for this environment specified")
	case *Include:
		v := r.eval(x.Template, f)
		selectList := false
		if c, ok := x.Template.(*Const); ok {
			_, isStr := c.Value.(string)
			selectList = !isStr
		} else if _, ok := x.Template.(*TupleNode); ok {
			selectList = true
		} else if _, ok := x.Template.(*ListNode); ok {
			selectList = true
		} else if _, isStr := asStr(v); !isStr {
			selectList = isIterable(v)
		}
		if selectList {
			if u, ok := v.(*Undefined); ok {
				u.fail()
			}
			if !truth(v) {
				raise("TemplatesNotFound", "Tried to select from an empty list of templates.")
			}
		}
		typeError("no loader for this environment specified")
	case *Import:
		r.eval(x.Template, f)
		typeError("no loader for this environment specified")
	case *FromImport:
		r.eval(x.Template, f)
		typeError("no loader for this environment specified")
	case *Scope:
		sf := f.inner()
		sf.sym.analyzeNode(x, "")
		r.enterFrame(sf)
		r.execBody(x.Body, sf)
		r.leaveFrame(sf)
	case *ScopedEvalContextModifier:
		saved := f.ctx.eval.autoescape
		for _, k := range x.Options {
			if k.Key == "autoescape" {
				f.ctx.eval.autoescape = r.eval(k.Value, f)
			}
		}
		r.execBody(x.Body, f)
		f.ctx.eval.autoescape = saved
	default:
		panic(fmt.Sprintf("jinja: cannot execute %T", n))
	}
}

// storedNames are the names an assignment target stores (for exporting
// top-level assignments to the context).
func storedNames(target Node) []string {
	switch x := target.(type) {
	case *Name:
		return []string{x.Name}
	case *TupleNode:
		var out []string
		for _, it := range x.Items {
			out = append(out, storedNames(it)...)
		}
		return out
	}
	return nil
}

// popAssignTracking exports the names an assignment set: to the context
// at the top level, to the loop's or block's variables inside those.
func (r *renderer) popAssignTracking(names []string, f *frame) {
	if !f.blockFr && !f.loopFrame && !f.toplevel || len(names) == 0 {
		return
	}
	for _, name := range names {
		c := f.st.lookup(f.sym.ref(name))
		var v Value
		if c != nil && c.set {
			v = c.v
		}
		switch {
		case f.loopFrame:
			f.loopVars[name] = v
		case f.blockFr:
			f.blockVars[name] = v
		default:
			f.ctx.setVar(name, v)
		}
	}
}

func (r *renderer) execAssign(x *Assign, f *frame) {
	seen := map[string]bool{}
	for _, ns := range findAll[*NSRef](x) {
		if seen[ns.Name] {
			continue
		}
		seen[ns.Name] = true
		c := f.st.lookup(f.sym.ref(ns.Name))
		if c == nil || !c.set {
			raise("TemplateRuntimeError", "cannot assign attribute on non-namespace object")
		}
		if _, ok := c.v.(*Namespace); !ok {
			raise("TemplateRuntimeError", "cannot assign attribute on non-namespace object")
		}
	}
	v := r.eval(x.Node, f)
	r.assignTarget(x.Target, v, f)
	r.popAssignTracking(storedNames(x.Target), f)
}

func (r *renderer) execAssignBlock(x *AssignBlock, f *frame) {
	bf := f.inner()
	bf.sym.analyzeNode(x, "")
	r.enterFrame(bf)
	buf := &strings.Builder{}
	bf.w = buf
	r.execBody(x.Body, bf)
	var v Value
	if x.Filter != nil {
		var body Value = buf.String()
		if r.autoescape(x, f) {
			body = Markup(buf.String())
		}
		v = r.applyFilter(x.Filter.(*Filter), body, true, bf)
	} else {
		v = buf.String()
	}
	if truth(f.ctx.eval.autoescape) {
		if s, ok := asStr(v); ok {
			v = Markup(s)
		} else {
			v = Markup(str(v))
		}
	}
	r.assignTarget(x.Target, v, f)
	r.popAssignTracking(storedNames(x.Target), f)
	r.leaveFrame(bf)
}

// assignTarget stores a value: a name, a tuple unpacked as Python does,
// or a namespace attribute.
func (r *renderer) assignTarget(t Node, v Value, f *frame) {
	switch x := t.(type) {
	case *Name:
		f.st.set(f.sym.ref(x.Name), v)
	case *NSRef:
		c := f.st.lookup(f.sym.ref(x.Name))
		ns := c.v.(*Namespace)
		ns.attrs.Set(x.Attr, v)
	case *TupleNode:
		items := unpack(v, len(x.Items))
		for i, it := range x.Items {
			r.assignTarget(it, items[i], f)
		}
	}
}

// unpack is Python's tuple unpacking into n targets.
func unpack(v Value, n int) []Value {
	if !isIterable(v) {
		typeError("cannot unpack non-iterable " + typeName(v) + " object")
	}
	next := iterate(v)
	var items []Value
	for {
		x, ok := next()
		if !ok {
			break
		}
		items = append(items, x)
		if len(items) > n {
			if hasLen(v) {
				valueError(fmt.Sprintf("too many values to unpack (expected %d, got %d)", n, length(v)))
			}
			valueError(fmt.Sprintf("too many values to unpack (expected %d)", n))
		}
	}
	if len(items) < n {
		valueError(fmt.Sprintf("not enough values to unpack (expected %d, got %d)", n, len(items)))
	}
	return items
}

func (r *renderer) execFor(x *For, f *frame) {
	loopF := f.inner()
	loopF.loopFrame = true
	testF := f.inner()
	elseF := f.inner()
	extended := x.Recursive || usesUndeclared(x.Body, "loop")
	if !extended {
		for _, b := range findAll[*Block](x) {
			if b.Scoped {
				extended = true
			}
		}
	}
	var loopRef string
	if extended {
		loopRef = loopF.sym.declareParameter("loop")
	}
	loopF.sym.analyzeNode(x, "body")
	if len(x.Else) > 0 {
		elseF.sym.analyzeNode(x, "else")
	}
	if x.Test != nil {
		testF.sym.analyzeNode(x, "test")
	}

	// render runs the loop over one iterable, as the loop function of a
	// recursive loop does.
	var render func(iter Value, depth int, st *store) string
	render = func(iterVal Value, depth int, st *store) string {
		lf := *loopF
		lf.st = st
		ef := *elseF
		ef.st = st
		var buf *strings.Builder
		if x.Recursive {
			buf = &strings.Builder{}
			lf.w, ef.w = buf, buf
		}
		var items Iterator
		if x.Test != nil {
			items = r.loopFilter(x, testF, &lf, iterVal, st)
		} else {
			items = iterate(iterVal)
		}
		var loop *LoopContext
		if extended {
			var lenSource Value = iterVal
			if x.Test != nil {
				lenSource = nil
			}
			loop = newLoopContext(r, lenSource, items, depth)
			if x.Recursive {
				loop.recurse = func(inner Value) Value {
					out := render(inner, loop.depth0+1, newStore(f.st))
					if truth(f.ctx.eval.autoescape) {
						return Markup(out)
					}
					return out
				}
			}
			lf.st.set(loopRef, nil)
			lf.st.unset(loopRef)
		}
		iterated := false
		for {
			var item Value
			var ok bool
			if loop != nil {
				item, ok = loop.next()
			} else {
				item, ok = items()
			}
			if !ok {
				break
			}
			r.tick()
			iterated = true
			r.assignTarget(x.Target, item, &lf)
			if extended {
				lf.st.set(loopRef, loop)
			}
			r.enterFrame(&lf)
			lf.loopVars = map[string]Value{}
			r.execBody(x.Body, &lf)
		}
		if !(x.Recursive && len(x.Else) == 0) {
			r.leaveFrame(&lf)
		}
		if len(x.Else) > 0 && !iterated {
			r.enterFrame(&ef)
			r.execBody(x.Else, &ef)
			r.leaveFrame(&ef)
		}
		if buf != nil {
			return buf.String()
		}
		return ""
	}
	if x.Recursive {
		iterVal := r.eval(x.Iter, f)
		out := render(iterVal, 0, newStore(f.st))
		r.write(f, out)
		return
	}
	render(r.eval(x.Iter, f), 0, f.st)
}

// loopFilter is the generator the compiler writes for "for x in y if
// test": a function of its own over the iterable.
func (r *renderer) loopFilter(x *For, testF, loopF *frame, iterVal Value, parent *store) Iterator {
	st := newStore(parent)
	tf := *testF
	tf.st = st
	lf := *loopF
	lf.st = st
	src := iterate(iterVal)
	entered := false
	return func() (Value, bool) {
		if !entered {
			r.enterFrame(&tf)
			entered = true
		}
		for {
			item, ok := src()
			if !ok {
				return nil, false
			}
			r.assignTarget(x.Target, item, &lf)
			if truth(r.eval(x.Test, &tf)) {
				// The target is yielded again from the function's locals.
				return r.targetValue(x.Target, &lf), true
			}
		}
	}
}

func (r *renderer) targetValue(t Node, f *frame) Value {
	switch x := t.(type) {
	case *Name:
		c := f.st.lookup(f.sym.ref(x.Name))
		if c == nil || !c.set {
			return nil
		}
		return c.v
	case *TupleNode:
		out := make(Tuple, len(x.Items))
		for i, it := range x.Items {
			out[i] = r.targetValue(it, f)
		}
		return out
	}
	return nil
}

// execBlockCall is visit_Block: render the block's first definition.
func (r *renderer) execBlockCall(x *Block, f *frame) {
	ctx := f.ctx
	if x.Scoped {
		ctx = f.ctx.derived(r.localContext(f))
	}
	if x.Required && len(ctx.blocks[x.Name]) <= 1 {
		raise("TemplateRuntimeError", "Required block "+pystr.Repr(x.Name)+" not found")
	}
	r.write(f, r.renderBlock(ctx.blocks[x.Name][0], ctx))
}

// localContext is dump_local_context: the frame's stored names.
func (r *renderer) localContext(f *frame) map[string]Value {
	out := map[string]Value{}
	for name, ident := range f.sym.dumpStores() {
		if c := f.st.lookup(ident); c != nil && c.set {
			out[name] = c.v
		} else {
			out[name] = missingValue{}
		}
	}
	return out
}

// missingValue is the missing sentinel a derived context can carry.
type missingValue struct{}

func (missingValue) TypeName() string          { return "_MissingType" }
func (missingValue) Module() string            { return "jinja2.utils" }
func (missingValue) Attr(string) (Value, bool) { return nil, false }
func (missingValue) Repr() string              { return "missing" }

// renderBlock runs a block function with a context.
func (r *renderer) renderBlock(b *Block, ctx *Context) string {
	r.enter()
	defer r.leave()
	buf := &strings.Builder{}
	bf := &frame{sym: newSymbols(nil, -1), st: newStore(nil), ctx: ctx, w: buf, blockFr: true, blockVars: map[string]Value{}}
	if usesUndeclared(b.Body, "self") {
		bf.st.set(bf.sym.declareParameter("self"), &templateReference{r: r, ctx: ctx})
	}
	if usesUndeclared(b.Body, "super") {
		bf.st.set(bf.sym.declareParameter("super"), r.superBlock(ctx, b))
	}
	bf.sym.analyzeNode(b, "")
	r.enterFrame(bf)
	r.execBody(b.Body, bf)
	return buf.String()
}

// superBlock is Context.super.
func (r *renderer) superBlock(ctx *Context, current *Block) Value {
	blocks := ctx.blocks[current.Name]
	for i, b := range blocks {
		if b == current && i+1 < len(blocks) {
			return &blockReference{r: r, ctx: ctx, name: current.Name, blocks: blocks, index: i + 1}
		}
	}
	return newUndefined(r.undef, "there is no parent block called "+pystr.Repr(current.Name)+".", nil, false, "super", true, "")
}

func (r *renderer) enter() {
	r.depth++
	if r.depth > 300 {
		raise("RecursionError", "maximum recursion depth exceeded")
	}
}

func (r *renderer) leave() { r.depth-- }

// defineMacro is macro_body and macro_def: a Macro over a function
// defined in the frame's function.
func (r *renderer) defineMacro(name string, args []*Name, defaults []Node, body []Node, node Node, f *frame, named bool) *Macro {
	mf := f.inner()
	mf.toplevel, mf.loopFrame, mf.blockFr = false, false, false
	mf.sym.analyzeNode(node, "")
	explicitCaller := -1
	skip := map[string]bool{}
	var argNames []string
	for i, a := range args {
		if a.Name == "caller" {
			explicitCaller = i
		}
		if a.Name == "kwargs" || a.Name == "varargs" {
			skip[a.Name] = true
		}
		argNames = append(argNames, a.Name)
	}
	m := &Macro{r: r, name: name, named: named, arguments: argNames, explicitCaller: explicitCaller >= 0, autoescape: f.ctx.eval.autoescape}
	if usesUndeclared(body, "caller") {
		if explicitCaller < 0 {
			mf.sym.declareParameter("caller")
			m.extraParams = append(m.extraParams, "caller")
		}
		m.caller = true
	}
	if usesUndeclared(body, "kwargs") && !skip["kwargs"] {
		mf.sym.declareParameter("kwargs")
		m.extraParams = append(m.extraParams, "kwargs")
		m.catchKwargs = true
	}
	if usesUndeclared(body, "varargs") && !skip["varargs"] {
		mf.sym.declareParameter("varargs")
		m.extraParams = append(m.extraParams, "varargs")
		m.catchVarargs = true
	}
	mf.sym.analyzeNode(node, "")
	defStore := f.st
	m.invoke = func(arguments []Value) string {
		r.enter()
		defer r.leave()
		buf := &strings.Builder{}
		fr := *mf
		fr.st = newStore(defStore)
		fr.w = buf
		params := append(append([]string{}, argNames...), m.extraParams...)
		for i, p := range params {
			ident := fr.sym.ref(p)
			if i < len(arguments) {
				if _, isMissing := arguments[i].(missingValue); isMissing {
					fr.st.unset(ident)
					continue
				}
				fr.st.set(ident, arguments[i])
			}
		}
		r.enterFrame(&fr)
		for i, a := range args {
			ident := fr.sym.ref(a.Name)
			c := fr.st.lookup(ident)
			if c != nil && c.set {
				continue
			}
			if di := i - len(args) + len(defaults); di >= 0 {
				fr.st.set(ident, r.eval(defaults[di], &fr))
			} else {
				fr.st.set(ident, newUndefined(r.undef, "parameter "+pystr.Repr(a.Name)+" was not provided", nil, false, a.Name, true, ""))
			}
		}
		r.execBody(body, &fr)
		return buf.String()
	}
	return m
}

// ---------------------------------------------------------------- expressions

func (r *renderer) eval(n Node, f *frame) Value {
	switch x := n.(type) {
	case *Const:
		return x.Value
	case *TemplateData:
		if truth(f.ctx.eval.autoescape) {
			return Markup(x.Data)
		}
		return x.Data
	case *Name:
		c := f.st.lookup(f.sym.ref(x.Name))
		if c == nil || !c.set {
			return newUndefined(r.undef, "", nil, false, x.Name, true, "")
		}
		return c.v
	case *TupleNode:
		out := make(Tuple, len(x.Items))
		for i, it := range x.Items {
			out[i] = r.eval(it, f)
		}
		return out
	case *ListNode:
		out := make([]Value, len(x.Items))
		for i, it := range x.Items {
			out[i] = r.eval(it, f)
		}
		return &List{Items: out}
	case *DictNode:
		d := NewDict()
		for _, p := range x.Items {
			k := r.eval(p.Key, f)
			v := r.eval(p.Value, f)
			_ = hashKey(k)
			d.Set(k, v)
		}
		return d
	case *Getattr:
		return r.getattr(r.eval(x.Node, f), x.Attr)
	case *Getitem:
		obj := r.eval(x.Node, f)
		if s, ok := x.Arg.(*Slice); ok {
			var start, stop, step Value
			if s.Start != nil {
				start = r.eval(s.Start, f)
			}
			if s.Stop != nil {
				stop = r.eval(s.Stop, f)
			}
			if s.Step != nil {
				step = r.eval(s.Step, f)
			}
			return r.slice(obj, start, stop, step)
		}
		return r.getitem(obj, r.eval(x.Arg, f))
	case *Call:
		return r.evalCall(x, f, nil)
	case *Filter:
		return r.applyFilter(x, nil, false, f)
	case *Test:
		return r.applyTest(x, f)
	case *CondExpr:
		sf := f.soft()
		if truth(r.eval(x.Test, sf)) {
			return r.eval(x.Expr1, sf)
		}
		if x.Expr2 != nil {
			return r.eval(x.Expr2, sf)
		}
		return newUndefined(undefDefault, fmt.Sprintf("the inline if-expression on line %d evaluated to false and no else section was defined.", x.Lineno), nil, false, nil, false, "")
	case *BinExpr:
		switch x.Kind {
		case "And":
			left := r.eval(x.Left, f)
			if !truth(left) {
				return left
			}
			return r.eval(x.Right, f)
		case "Or":
			left := r.eval(x.Left, f)
			if truth(left) {
				return left
			}
			return r.eval(x.Right, f)
		}
		left := r.eval(x.Left, f)
		right := r.eval(x.Right, f)
		return binop(x.Kind, left, right)
	case *UnaryExpr:
		v := r.eval(x.Node, f)
		if x.Kind == "Not" {
			return !truth(v)
		}
		return unop(x.Kind, v)
	case *Compare:
		left := r.eval(x.Expr, f)
		for _, op := range x.Ops {
			right := r.eval(op.Expr, f)
			if !compareOp(op.Op, left, right) {
				return false
			}
			left = right
		}
		return true
	case *Concat:
		var b strings.Builder
		escaped := r.autoescape(x, f)
		for _, it := range x.Nodes {
			v := r.eval(it, f)
			if escaped {
				b.WriteString(string(escapeValue(v)))
			} else {
				b.WriteString(str(v))
			}
		}
		if escaped {
			return Markup(b.String())
		}
		return b.String()
	}
	panic(fmt.Sprintf("jinja: cannot evaluate %T", n))
}

// evalArgs evaluates a call's arguments: positional, keywords, *args and
// **kwargs, as Python binds them.
func (r *renderer) evalArgs(args []Node, kwargs []*Keyword, dynArgs, dynKwargs Node, f *frame) ([]Value, []kwarg) {
	var pos []Value
	for _, a := range args {
		pos = append(pos, r.eval(a, f))
	}
	var kws []kwarg
	for _, k := range kwargs {
		kws = append(kws, kwarg{k.Key, r.eval(k.Value, f)})
	}
	if dynArgs != nil {
		v := r.eval(dynArgs, f)
		if !isIterable(v) {
			typeError("Value after * must be an iterable, not " + typeName(v))
		}
		pos = append(pos, toList(v)...)
	}
	if dynKwargs != nil {
		v := r.eval(dynKwargs, f)
		d, ok := v.(*Dict)
		if !ok {
			typeError("argument after ** must be a mapping, not " + typeName(v))
		}
		for i, k := range d.keys {
			s, ok := k.(string)
			if !ok {
				typeError("keywords must be strings")
			}
			for _, e := range kws {
				if e.Name == s {
					typeError("got multiple values for keyword argument " + pystr.Repr(s))
				}
			}
			kws = append(kws, kwarg{s, d.vals[i]})
		}
	}
	return pos, kws
}

func (r *renderer) evalCall(x *Call, f *frame, caller *Macro) Value {
	fn := r.eval(x.Node, f)
	args, kwargs := r.evalArgs(x.Args, x.Kwargs, x.DynArgs, x.DynKwargs, f)
	if caller != nil {
		for _, k := range kwargs {
			if k.Name == "caller" {
				typeError("got multiple values for keyword argument 'caller'")
			}
		}
		kwargs = append(kwargs, kwarg{"caller", caller})
	}
	return r.callWithContext(fn, args, kwargs, f)
}

// callWithContext is the sandbox's call, passing the eval context to
// macros.
func (r *renderer) callWithContext(fn Value, args []Value, kwargs []kwarg, f *frame) Value {
	if m, ok := fn.(*Macro); ok {
		return m.call(args, kwargs, f.ctx.eval.autoescape)
	}
	return r.call(fn, args, kwargs)
}

// applyFilter is visit_Filter: the filter applied to its node, or to the
// buffered body of a filter or set block.
func (r *renderer) applyFilter(x *Filter, body Value, fromBlock bool, f *frame) Value {
	var value Value
	if fromBlock {
		value = body
	} else {
		value = r.eval(x.Node, f)
	}
	args, kwargs := r.evalArgs(x.Args, x.Kwargs, x.DynArgs, x.DynKwargs, f)
	fn, ok := filters[x.Name]
	if !ok {
		raise("TemplateRuntimeError", "No filter named "+pystr.Repr(x.Name)+" found.")
	}
	return fn(r, f, value, args, kwargs)
}

func (r *renderer) applyTest(x *Test, f *frame) Value {
	value := r.eval(x.Node, f)
	args, kwargs := r.evalArgs(x.Args, x.Kwargs, x.DynArgs, x.DynKwargs, f)
	fn, ok := tests[x.Name]
	if !ok {
		raise("TemplateRuntimeError", "No test named "+pystr.Repr(x.Name)+" found.")
	}
	return fn(r, f, value, args, kwargs)
}

// isConstExpr reports an expression Node.as_const can fold inside a
// volatile autoescape block (filters and tests are not folded there).
func isConstExpr(n Node) bool {
	switch x := n.(type) {
	case nil:
		return true
	case *Const:
		return true
	case *TupleNode, *ListNode, *DictNode, *Pair, *BinExpr, *UnaryExpr, *Compare, *Operand, *Concat, *CondExpr, *Getattr, *Getitem, *Slice:
		for _, c := range children(x) {
			if !isConstExpr(c) {
				return false
			}
		}
		if ce, ok := x.(*CondExpr); ok && ce.Expr2 == nil {
			return false
		}
		return true
	}
	return false
}

// tryEval evaluates an expression, false if it raised.
func (r *renderer) tryEval(n Node, f *frame) (v Value, ok bool) {
	defer func() {
		if rec := recover(); rec != nil {
			if _, isErr := rec.(*Error); !isErr {
				panic(rec)
			}
			v, ok = nil, false
		}
	}()
	return r.eval(n, f), true
}

type evalBits uint8

const (
	evalStatic evalBits = 1 << iota
	evalVolatile
)

// autoescape is whether a node escapes: the runtime setting where the
// compiler's eval context was volatile, else the one it knew.
func (r *renderer) autoescape(n Node, f *frame) bool {
	st := r.evalState[n]
	if st&evalVolatile != 0 {
		return truth(f.ctx.eval.autoescape)
	}
	return st&evalStatic != 0
}

// markEvalContext walks the tree as the compiler does, tracking its eval
// context: a constant autoescape option sets the setting for the body, any
// other makes the context volatile. Block bodies are compiled after the
// root, with the context as it started.
func (r *renderer) markEvalContext(tpl *Template) {
	r.evalState = map[Node]evalBits{}
	constFrame := &frame{ctx: &Context{eval: &evalContext{}}}
	var walk func(n Node, st evalBits)
	walk = func(n Node, st evalBits) {
		switch x := n.(type) {
		case *Block:
			return
		case *ScopedEvalContextModifier:
			for _, k := range x.Options {
				walk(k.Value, st)
				if k.Key != "autoescape" {
					continue
				}
				if isConstExpr(k.Value) {
					if v, ok := r.tryEval(k.Value, constFrame); ok {
						if truth(v) {
							st |= evalStatic
						} else {
							st &^= evalStatic
						}
						continue
					}
				}
				st |= evalVolatile
			}
			for _, c := range x.Body {
				walk(c, st)
			}
			return
		case *Output, *Concat, *FilterBlock, *AssignBlock:
			if st != 0 {
				r.evalState[n] = st
			}
		}
		for _, c := range children(n) {
			walk(c, st)
		}
	}
	walk(tpl, 0)
	for _, b := range findAll[*Block](tpl) {
		for _, c := range b.Body {
			walk(c, 0)
		}
	}
}
