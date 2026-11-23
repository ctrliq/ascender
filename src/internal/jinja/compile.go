package jinja

// The errors jinja2/compiler.py's CodeGenerator raises while turning a
// parsed template into code, checked in the order it visits the tree: a
// block defined twice, extends below the top level, an assignment to the
// for-loop's "loop", an explicit "caller" argument without a default, and
// a filter or test that does not exist (outside if statements and inline
// ifs, where that is left to runtime).

import (
	"strings"

	"github.com/ctrliq/ascender/internal/pystr"
)

var builtinFilters = setOf("abs attr batch capitalize center count d default dictsort e escape filesizeformat first float forceescape format groupby indent int items join last length list lower map max min pprint random reject rejectattr replace reverse round safe select selectattr slice sort string striptags sum title tojson trim truncate unique upper urlencode urlize wordcount wordwrap xmlattr")

var builtinTests = setOf("!= < <= == > >= boolean callable defined divisibleby eq equalto escaped even false filter float ge greaterthan gt in integer iterable le lessthan lower lt mapping ne none number odd sameas sequence string test true undefined upper")

func setOf(s string) map[string]bool {
	m := map[string]bool{}
	for _, w := range strings.Fields(s) {
		m[w] = true
	}
	return m
}

// cframe is the part of the compiler's Frame these checks read.
type cframe struct {
	toplevel, soft bool
}

func (f cframe) inner() cframe { return cframe{} }

func (f cframe) softened() cframe { return cframe{toplevel: f.toplevel, soft: true} }

type checker struct {
	blocks []*Block
}

// Compile parses the template and runs the compiler's checks, returning
// the tree or the TemplateSyntaxError / TemplateAssertionError
// Environment.from_string raised.
func Compile(source string) (*Template, error) {
	tpl, err := Parse(source)
	if err != nil {
		return nil, err
	}
	if err := check(tpl); err != nil {
		return nil, err
	}
	return tpl, nil
}

func check(tpl *Template) (err error) {
	defer func() {
		if r := recover(); r != nil {
			e, ok := r.(*Error)
			if !ok {
				panic(r)
			}
			err = e
		}
	}()
	c := &checker{}
	seen := map[string]bool{}
	for _, b := range findAll[*Block](tpl) {
		if seen[b.Name] {
			panic(assertionError("block "+pystr.Repr(b.Name)+" defined twice", b.Lineno))
		}
		seen[b.Name] = true
		c.blocks = append(c.blocks, b)
	}
	c.visitBody(tpl.Body, cframe{toplevel: true})
	for _, b := range c.blocks {
		c.visitBody(b.Body, cframe{})
	}
	return nil
}

// findAll is Node.find_all: every node of type T under n, depth first.
func findAll[T Node](n Node) []T {
	var out []T
	for _, c := range children(n) {
		if t, ok := c.(T); ok {
			out = append(out, t)
		}
		out = append(out, findAll[T](c)...)
	}
	return out
}

func (c *checker) visitBody(body []Node, fr cframe) {
	for _, n := range body {
		c.visit(n, fr)
	}
}

func (c *checker) visitAll(nodes []Node, fr cframe) {
	for _, n := range nodes {
		c.visit(n, fr)
	}
}

func (c *checker) visit(n Node, fr cframe) {
	if n == nil || isNilNode(n) {
		return
	}
	switch x := n.(type) {
	case *Block:
		// The body is compiled as its own function, after the root.
	case *Extends:
		if !fr.toplevel {
			panic(assertionError("cannot use extend from a non top-level scope", x.Lineno))
		}
		c.visit(x.Template, fr)
	case *If:
		soft := fr.softened()
		c.visit(x.Test, soft)
		c.visitBody(x.Body, soft)
		for _, e := range x.Elif {
			c.visit(e.Test, soft)
			c.visitBody(e.Body, soft)
		}
		c.visitBody(x.Else, soft)
	case *CondExpr:
		soft := fr.softened()
		c.visit(x.Expr1, soft)
		c.visit(x.Test, soft)
		c.visit(x.Expr2, soft)
	case *For:
		loop, test, els := fr.inner(), fr.inner(), fr.inner()
		if x.Test != nil {
			c.visit(x.Target, loop)
			c.visit(x.Test, test)
		}
		for _, name := range findAll[*Name](x) {
			if name.Ctx == "store" && name.Name == "loop" {
				panic(assertionError("Can't assign to special loop variable in for-loop target", name.Lineno))
			}
		}
		c.visit(x.Target, loop)
		if !x.Recursive {
			c.visit(x.Iter, fr)
		}
		c.visitBody(x.Body, loop)
		c.visitBody(x.Else, els)
		if x.Recursive {
			c.visit(x.Iter, fr)
		}
	case *MacroNode:
		c.macroBody(x.Args, x.Defaults, x.Body, x.Lineno, fr)
	case *CallBlock:
		c.macroBody(x.Args, x.Defaults, x.Body, x.Lineno, fr)
		c.visit(x.Call, fr)
	case *FilterBlock:
		inner := fr.inner()
		c.visitBody(x.Body, inner)
		c.visit(x.Filter, inner)
	case *With:
		inner := fr.inner()
		for i := range x.Targets {
			c.visit(x.Targets[i], inner)
			c.visit(x.Values[i], fr)
		}
		c.visitBody(x.Body, inner)
	case *AssignBlock:
		inner := fr.inner()
		c.visitBody(x.Body, inner)
		c.visit(x.Target, fr)
		c.visit(x.Filter, inner)
	case *Assign:
		c.visit(x.Node, fr)
		c.visit(x.Target, fr)
	case *Scope:
		c.visitBody(x.Body, fr.inner())
	case *ScopedEvalContextModifier:
		for _, k := range x.Options {
			c.visit(k.Value, fr)
		}
		c.visitBody(x.Body, fr)
	case *Filter:
		c.filterTest(x.Name, builtinFilters, "filter", x.Lineno, fr)
		c.visit(x.Node, fr)
		c.signature(x.Args, x.Kwargs, x.DynArgs, x.DynKwargs, fr)
	case *Test:
		c.filterTest(x.Name, builtinTests, "test", x.Lineno, fr)
		c.visit(x.Node, fr)
		c.signature(x.Args, x.Kwargs, x.DynArgs, x.DynKwargs, fr)
	case *Call:
		c.visit(x.Node, fr)
		c.signature(x.Args, x.Kwargs, x.DynArgs, x.DynKwargs, fr)
	case *Getitem:
		c.visit(x.Node, fr)
		if _, ok := x.Arg.(*Slice); ok {
			c.visit(x.Arg, fr)
		} else {
			c.slicesOutside(x.Arg)
			c.visit(x.Arg, fr)
		}
	default:
		for _, ch := range children(n) {
			c.visit(ch, fr)
		}
	}
}

func (c *checker) signature(args []Node, kwargs []*Keyword, dynArgs, dynKwargs Node, fr cframe) {
	c.visitAll(args, fr)
	for _, k := range kwargs {
		c.visit(k.Value, fr)
	}
	c.visit(dynArgs, fr)
	c.visit(dynKwargs, fr)
}

func (c *checker) filterTest(name string, known map[string]bool, kind string, lineno int, fr cframe) {
	if !known[name] && !fr.soft {
		panic(assertionError("No "+kind+" named "+pystr.Repr(name)+".", lineno))
	}
}

// macroBody is CodeGenerator.macro_body's checks: the defaults, then the
// body, in a cframe of the macro's own.
func (c *checker) macroBody(args []*Name, defaults []Node, body []Node, lineno int, fr cframe) {
	inner := fr.inner()
	explicitCaller := -1
	for i, a := range args {
		if a.Name == "caller" {
			explicitCaller = i
		}
	}
	if explicitCaller >= 0 && usesUndeclared(body, "caller") {
		idx := explicitCaller - len(args)
		if idx < -len(defaults) {
			panic(assertionError(`When defining macros or call blocks the special "caller" argument must be omitted or be given a default.`, lineno))
		}
	}
	c.visitAll(defaults, inner)
	c.visitBody(body, inner)
}

// usesUndeclared is find_undeclared for one name: a load of it anywhere in
// the nodes, not looking into blocks.
func usesUndeclared(nodes []Node, name string) bool {
	for _, n := range nodes {
		if n == nil || isNilNode(n) {
			continue
		}
		if _, ok := n.(*Block); ok {
			continue
		}
		if x, ok := n.(*Name); ok && x.Ctx == "load" && x.Name == name {
			return true
		}
		if usesUndeclared(children(n), name) {
			return true
		}
	}
	return false
}

// slicesOutside fails like the Python compiler does on the code Jinja
// writes for a slice that is not a subscript's whole argument (a[:, 1]).
func (c *checker) slicesOutside(n Node) {
	if t, ok := n.(*TupleNode); ok {
		for _, it := range t.Items {
			if _, ok := it.(*Slice); ok {
				panic(&Error{Type: "SyntaxError", Message: "invalid syntax", Lineno: it.line()})
			}
		}
	}
}
