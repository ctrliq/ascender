package jinja

// A port of jinja2/idtracking.py: for each frame, which names it holds
// and how each is first loaded (a parameter, resolved from the context, an
// alias of the enclosing frame's variable, or undefined until assigned).
// Jinja's scoping rules come from here.

import (
	"sort"
	"strconv"
)

const (
	loadParameter = "param"
	loadResolve   = "resolve"
	loadAlias     = "alias"
	loadUndefined = "undefined"
)

type loadInstr struct {
	action string
	param  string // the resolved name or the aliased identifier
}

type symbols struct {
	level     int
	parent    *symbols
	refs      map[string]string
	loads     map[string]loadInstr
	loadOrder []string // dict insertion order of loads
	stores    map[string]bool
}

func newSymbols(parent *symbols, level int) *symbols {
	if level < 0 {
		if parent == nil {
			level = 0
		} else {
			level = parent.level + 1
		}
	}
	return &symbols{level: level, parent: parent, refs: map[string]string{}, loads: map[string]loadInstr{}, stores: map[string]bool{}}
}

func (s *symbols) setLoad(ident string, l loadInstr) {
	if _, ok := s.loads[ident]; !ok {
		s.loadOrder = append(s.loadOrder, ident)
	}
	s.loads[ident] = l
}

func (s *symbols) defineRef(name string, load *loadInstr) string {
	ident := "l_" + strconv.Itoa(s.level) + "_" + name
	s.refs[name] = ident
	if load != nil {
		s.setLoad(ident, *load)
	}
	return ident
}

func (s *symbols) findRef(name string) (string, bool) {
	if r, ok := s.refs[name]; ok {
		return r, true
	}
	if s.parent != nil {
		return s.parent.findRef(name)
	}
	return "", false
}

func (s *symbols) ref(name string) string {
	r, ok := s.findRef(name)
	if !ok {
		panic("jinja: unknown name " + name + " in frame")
	}
	return r
}

func (s *symbols) copy() *symbols {
	c := &symbols{level: s.level, parent: s.parent, refs: map[string]string{}, loads: map[string]loadInstr{}, stores: map[string]bool{}}
	for k, v := range s.refs {
		c.refs[k] = v
	}
	for k, v := range s.loads {
		c.loads[k] = v
	}
	c.loadOrder = append([]string{}, s.loadOrder...)
	for k := range s.stores {
		c.stores[k] = true
	}
	return c
}

func (s *symbols) store(name string) {
	s.stores[name] = true
	if _, ok := s.refs[name]; !ok {
		if s.parent != nil {
			if outer, ok := s.parent.findRef(name); ok {
				s.defineRef(name, &loadInstr{loadAlias, outer})
				return
			}
		}
		s.defineRef(name, &loadInstr{loadUndefined, ""})
	}
}

func (s *symbols) declareParameter(name string) string {
	s.stores[name] = true
	return s.defineRef(name, &loadInstr{loadParameter, ""})
}

func (s *symbols) load(name string) {
	if _, ok := s.findRef(name); !ok {
		s.defineRef(name, &loadInstr{loadResolve, name})
	}
}

func (s *symbols) branchUpdate(branches []*symbols) {
	stores := map[string]bool{}
	for _, b := range branches {
		for k := range b.stores {
			stores[k] = true
		}
	}
	for k := range s.stores {
		delete(stores, k)
	}
	for _, b := range branches {
		for k, v := range b.refs {
			s.refs[k] = v
		}
		for _, ident := range b.loadOrder {
			s.setLoad(ident, b.loads[ident])
		}
		for k := range b.stores {
			s.stores[k] = true
		}
	}
	names := make([]string, 0, len(stores))
	for n := range stores {
		names = append(names, n)
	}
	sort.Strings(names)
	for _, name := range names {
		target := s.ref(name)
		if s.parent != nil {
			if outer, ok := s.parent.findRef(name); ok {
				s.setLoad(target, loadInstr{loadAlias, outer})
				continue
			}
		}
		s.setLoad(target, loadInstr{loadResolve, name})
	}
}

// dumpStores is Symbols.dump_stores: every stored name visible from the
// frame, with its identifier.
func (s *symbols) dumpStores() map[string]string {
	rv := map[string]string{}
	for node := s; node != nil; node = node.parent {
		for name := range node.stores {
			if _, ok := rv[name]; !ok {
				rv[name] = s.ref(name)
			}
		}
	}
	return rv
}

// analyzeNode is Symbols.analyze_node (RootVisitor). forBranch picks the
// part of a For: "body", "else" or "test".
func (s *symbols) analyzeNode(n Node, forBranch string) {
	v := &frameSymbolVisitor{sym: s}
	switch x := n.(type) {
	case *Template, *Block, *MacroNode, *FilterBlock, *Scope, *If, *ScopedEvalContextModifier:
		for _, c := range children(n) {
			v.visit(c, false)
		}
	case *AssignBlock:
		for _, c := range x.Body {
			v.visit(c, false)
		}
	case *CallBlock:
		for _, a := range x.Args {
			v.visit(a, false)
		}
		for _, d := range x.Defaults {
			v.visit(d, false)
		}
		for _, c := range x.Body {
			v.visit(c, false)
		}
	case *For:
		switch forBranch {
		case "body":
			v.visit(x.Target, true)
			for _, c := range x.Body {
				v.visit(c, false)
			}
		case "else":
			for _, c := range x.Else {
				v.visit(c, false)
			}
		case "test":
			v.visit(x.Target, true)
			if x.Test != nil {
				v.visit(x.Test, false)
			}
		}
	case *With:
		for _, t := range x.Targets {
			v.visit(t, false)
		}
		for _, c := range x.Body {
			v.visit(c, false)
		}
	}
}

type frameSymbolVisitor struct {
	sym *symbols
}

func (v *frameSymbolVisitor) visitAll(nodes []Node, storeAsParam bool) {
	for _, n := range nodes {
		v.visit(n, storeAsParam)
	}
}

func (v *frameSymbolVisitor) visit(n Node, storeAsParam bool) {
	if n == nil || isNilNode(n) {
		return
	}
	switch x := n.(type) {
	case *Name:
		switch {
		case storeAsParam || x.Ctx == "param":
			v.sym.declareParameter(x.Name)
		case x.Ctx == "store":
			v.sym.store(x.Name)
		case x.Ctx == "load":
			v.sym.load(x.Name)
		}
	case *NSRef:
		v.sym.load(x.Name)
	case *If:
		v.visit(x.Test, storeAsParam)
		original := v.sym
		inner := func(nodes []Node) *symbols {
			rv := original.copy()
			v.sym = rv
			v.visitAll(nodes, storeAsParam)
			v.sym = original
			return rv
		}
		elifs := make([]Node, len(x.Elif))
		for i, e := range x.Elif {
			elifs[i] = e
		}
		body := inner(x.Body)
		elif := inner(elifs)
		els := inner(x.Else)
		v.sym.branchUpdate([]*symbols{body, elif, els})
	case *MacroNode:
		v.sym.store(x.Name)
	case *Import:
		v.visit(x.Template, storeAsParam)
		v.sym.store(x.Target)
	case *FromImport:
		v.visit(x.Template, storeAsParam)
		for _, name := range x.Names {
			if pair, ok := name.([2]string); ok {
				v.sym.store(pair[1])
			} else {
				v.sym.store(name.(string))
			}
		}
	case *Assign:
		v.visit(x.Node, storeAsParam)
		v.visit(x.Target, storeAsParam)
	case *For:
		v.visit(x.Iter, storeAsParam)
	case *CallBlock:
		v.visit(x.Call, storeAsParam)
	case *FilterBlock:
		v.visit(x.Filter, storeAsParam)
	case *With:
		for _, val := range x.Values {
			v.visit(val, false)
		}
	case *AssignBlock:
		v.visit(x.Target, storeAsParam)
	case *Scope, *Block:
		// Stop: these get frames of their own.
	default:
		for _, c := range children(n) {
			v.visit(c, storeAsParam)
		}
	}
}
