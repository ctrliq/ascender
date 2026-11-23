package jinja

import (
	"fmt"
	"runtime/debug"
	"strings"
	"time"
)

// Environment is an ImmutableSandboxedEnvironment with the default
// settings and the chosen undefined class.
type Environment struct {
	Undefined UndefinedKind
	// Timeout bounds one render; zero means none.
	Timeout time.Duration
}

// FromString compiles a template: its TemplateSyntaxError (or
// TemplateAssertionError) as an *Error.
func (e *Environment) FromString(source string) (*Compiled, error) {
	tree, err := Compile(source)
	if err != nil {
		return nil, err
	}
	return &Compiled{env: e, tree: tree}, nil
}

// Compiled is a template ready to render.
type Compiled struct {
	env  *Environment
	tree *Template
}

// Render renders the template with the given variables: the output, or
// the Python exception the render raised as an *Error.
func (t *Compiled) Render(vars map[string]Value) (out string, err error) {
	r := &renderer{undef: t.env.Undefined}
	defer func() {
		if rec := recover(); rec != nil {
			if e, ok := rec.(*Error); ok {
				if e.Lineno == 0 {
					e.Lineno = r.line
				}
				out, err = "", e
				return
			}
			out, err = "", &Error{Type: "InternalError", Message: fmt.Sprintf("%v\n%s", rec, debug.Stack())}
		}
	}()
	if t.env.Timeout > 0 {
		r.deadline = time.Now().Add(t.env.Timeout)
	}
	parent := map[string]Value{
		"range":     &builtinFunc{name: "safe_range", fn: func(r *renderer, args []Value, kw []kwarg) Value { noKwargs("safe_range", kw); return safeRange(args) }},
		"dict":      &builtinType{name: "dict", fn: dictConstructor},
		"lipsum":    &builtinFunc{name: "generate_lorem_ipsum", fn: lipsum},
		"cycler":    &builtinType{name: "jinja2.utils.Cycler", fn: newCycler},
		"joiner":    &builtinType{name: "jinja2.utils.Joiner", fn: newJoiner},
		"namespace": &builtinType{name: "jinja2.utils.Namespace", fn: newNamespace},
	}
	for k, v := range vars {
		parent[k] = v
	}
	ctx := &Context{parent: parent, vars: map[string]Value{}, blocks: map[string][]*Block{}, eval: &evalContext{autoescape: false}}
	for _, b := range findAll[*Block](t.tree) {
		ctx.blocks[b.Name] = []*Block{b}
	}
	buf := &strings.Builder{}
	root := &frame{sym: newSymbols(nil, -1), st: newStore(nil), ctx: ctx, w: buf, toplevel: true, rootlevel: true}
	if usesUndeclared(t.tree.Body, "self") {
		root.st.set(root.sym.declareParameter("self"), &templateReference{r: r, ctx: ctx})
	}
	r.markEvalContext(t.tree)
	root.sym.analyzeNode(t.tree, "")
	r.enterFrame(root)
	r.execBody(t.tree.Body, root)
	return buf.String(), nil
}

func noKwargs(name string, kw []kwarg) {
	if len(kw) > 0 {
		typeError(name + "() got an unexpected keyword argument '" + kw[0].Name + "'")
	}
}
