package jinja

// The template tree: jinja2/nodes.py's classes the parser produces. Each
// node knows its class name, its fields in Jinja's order (for repr, which
// the tests compare with Jinja's own) and its child nodes.

// Node is a template tree node.
type Node interface {
	typeName() string
	fields() []field
	line() int
}

type field struct {
	name  string
	value any
}

type pos struct{ Lineno int }

func (p pos) line() int { return p.Lineno }

type (
	Template struct {
		pos
		Body []Node
	}
	Output struct {
		pos
		Nodes []Node
	}
	TemplateData struct {
		pos
		Data string
	}
	Name struct {
		pos
		Name, Ctx string
	}
	NSRef struct {
		pos
		Name, Attr string
	}
	// Const holds nil, a bool, an int64 or *big.Int, a float64 or a string.
	Const struct {
		pos
		Value any
	}
	TupleNode struct {
		pos
		Items []Node
		Ctx   string
	}
	ListNode struct {
		pos
		Items []Node
	}
	DictNode struct {
		pos
		Items []*Pair
	}
	Pair struct {
		pos
		Key, Value Node
	}
	Getattr struct {
		pos
		Node Node
		Attr string
		Ctx  string
	}
	Getitem struct {
		pos
		Node, Arg Node
		Ctx       string
	}
	Slice struct {
		pos
		Start, Stop, Step Node
	}
	Call struct {
		pos
		Node               Node
		Args               []Node
		Kwargs             []*Keyword
		DynArgs, DynKwargs Node
	}
	Keyword struct {
		pos
		Key   string
		Value Node
	}
	// Filter's Node is nil in a filter block or a set block's filter.
	Filter struct {
		pos
		Node               Node
		Name               string
		Args               []Node
		Kwargs             []*Keyword
		DynArgs, DynKwargs Node
	}
	Test struct {
		pos
		Node               Node
		Name               string
		Args               []Node
		Kwargs             []*Keyword
		DynArgs, DynKwargs Node
	}
	CondExpr struct {
		pos
		Test, Expr1, Expr2 Node
	}
	// BinExpr's Kind is the class: Add, Sub, Mul, Div, FloorDiv, Mod, Pow,
	// And, Or.
	BinExpr struct {
		pos
		Kind        string
		Left, Right Node
	}
	// UnaryExpr's Kind is Not, Neg or Pos.
	UnaryExpr struct {
		pos
		Kind string
		Node Node
	}
	Compare struct {
		pos
		Expr Node
		Ops  []*Operand
	}
	Operand struct {
		pos
		Op   string
		Expr Node
	}
	Concat struct {
		pos
		Nodes []Node
	}
	Assign struct {
		pos
		Target, Node Node
	}
	AssignBlock struct {
		pos
		Target Node
		Filter Node
		Body   []Node
	}
	For struct {
		pos
		Target, Iter Node
		Body, Else   []Node
		Test         Node
		Recursive    bool
	}
	If struct {
		pos
		Test Node
		Body []Node
		Elif []*If
		Else []Node
	}
	With struct {
		pos
		Targets, Values []Node
		Body            []Node
	}
	Scope struct {
		pos
		Body []Node
	}
	ScopedEvalContextModifier struct {
		pos
		Options []*Keyword
		Body    []Node
	}
	Block struct {
		pos
		Name             string
		Body             []Node
		Scoped, Required bool
	}
	Extends struct {
		pos
		Template Node
	}
	Include struct {
		pos
		Template                   Node
		WithContext, IgnoreMissing bool
	}
	Import struct {
		pos
		Template    Node
		Target      string
		WithContext bool
	}
	// FromImport's Names hold a string, or a [2]string for "name as alias".
	FromImport struct {
		pos
		Template    Node
		Names       []any
		WithContext bool
	}
	MacroNode struct {
		pos
		Name     string
		Args     []*Name
		Defaults []Node
		Body     []Node
	}
	CallBlock struct {
		pos
		Call     *Call
		Args     []*Name
		Defaults []Node
		Body     []Node
	}
	FilterBlock struct {
		pos
		Body   []Node
		Filter *Filter
	}
)

func (*Template) typeName() string                  { return "Template" }
func (*Output) typeName() string                    { return "Output" }
func (*TemplateData) typeName() string              { return "TemplateData" }
func (*Name) typeName() string                      { return "Name" }
func (*NSRef) typeName() string                     { return "NSRef" }
func (*Const) typeName() string                     { return "Const" }
func (*TupleNode) typeName() string                 { return "Tuple" }
func (*ListNode) typeName() string                  { return "List" }
func (*DictNode) typeName() string                  { return "Dict" }
func (*Pair) typeName() string                      { return "Pair" }
func (*Getattr) typeName() string                   { return "Getattr" }
func (*Getitem) typeName() string                   { return "Getitem" }
func (*Slice) typeName() string                     { return "Slice" }
func (*Call) typeName() string                      { return "Call" }
func (*Keyword) typeName() string                   { return "Keyword" }
func (*Filter) typeName() string                    { return "Filter" }
func (*Test) typeName() string                      { return "Test" }
func (*CondExpr) typeName() string                  { return "CondExpr" }
func (n *BinExpr) typeName() string                 { return n.Kind }
func (n *UnaryExpr) typeName() string               { return n.Kind }
func (*Compare) typeName() string                   { return "Compare" }
func (*Operand) typeName() string                   { return "Operand" }
func (*Concat) typeName() string                    { return "Concat" }
func (*Assign) typeName() string                    { return "Assign" }
func (*AssignBlock) typeName() string               { return "AssignBlock" }
func (*For) typeName() string                       { return "For" }
func (*If) typeName() string                        { return "If" }
func (*With) typeName() string                      { return "With" }
func (*Scope) typeName() string                     { return "Scope" }
func (*ScopedEvalContextModifier) typeName() string { return "ScopedEvalContextModifier" }
func (*Block) typeName() string                     { return "Block" }
func (*Extends) typeName() string                   { return "Extends" }
func (*Include) typeName() string                   { return "Include" }
func (*Import) typeName() string                    { return "Import" }
func (*FromImport) typeName() string                { return "FromImport" }
func (*MacroNode) typeName() string                 { return "Macro" }
func (*CallBlock) typeName() string                 { return "CallBlock" }
func (*FilterBlock) typeName() string               { return "FilterBlock" }

func f(name string, value any) field { return field{name, value} }

func (n *Template) fields() []field     { return []field{f("body", n.Body)} }
func (n *Output) fields() []field       { return []field{f("nodes", n.Nodes)} }
func (n *TemplateData) fields() []field { return []field{f("data", n.Data)} }
func (n *Name) fields() []field         { return []field{f("name", n.Name), f("ctx", n.Ctx)} }
func (n *NSRef) fields() []field        { return []field{f("name", n.Name), f("attr", n.Attr)} }
func (n *Const) fields() []field        { return []field{f("value", constValue{n.Value})} }
func (n *TupleNode) fields() []field    { return []field{f("items", n.Items), f("ctx", n.Ctx)} }
func (n *ListNode) fields() []field     { return []field{f("items", n.Items)} }
func (n *DictNode) fields() []field     { return []field{f("items", n.Items)} }
func (n *Pair) fields() []field         { return []field{f("key", n.Key), f("value", n.Value)} }
func (n *Getattr) fields() []field {
	return []field{f("node", n.Node), f("attr", n.Attr), f("ctx", n.Ctx)}
}
func (n *Getitem) fields() []field {
	return []field{f("node", n.Node), f("arg", n.Arg), f("ctx", n.Ctx)}
}
func (n *Slice) fields() []field {
	return []field{f("start", n.Start), f("stop", n.Stop), f("step", n.Step)}
}
func (n *Call) fields() []field {
	return []field{f("node", n.Node), f("args", n.Args), f("kwargs", n.Kwargs), f("dyn_args", n.DynArgs), f("dyn_kwargs", n.DynKwargs)}
}
func (n *Keyword) fields() []field { return []field{f("key", n.Key), f("value", n.Value)} }
func (n *Filter) fields() []field {
	return []field{f("node", n.Node), f("name", n.Name), f("args", n.Args), f("kwargs", n.Kwargs), f("dyn_args", n.DynArgs), f("dyn_kwargs", n.DynKwargs)}
}
func (n *Test) fields() []field {
	return []field{f("node", n.Node), f("name", n.Name), f("args", n.Args), f("kwargs", n.Kwargs), f("dyn_args", n.DynArgs), f("dyn_kwargs", n.DynKwargs)}
}
func (n *CondExpr) fields() []field {
	return []field{f("test", n.Test), f("expr1", n.Expr1), f("expr2", n.Expr2)}
}
func (n *BinExpr) fields() []field   { return []field{f("left", n.Left), f("right", n.Right)} }
func (n *UnaryExpr) fields() []field { return []field{f("node", n.Node)} }
func (n *Compare) fields() []field   { return []field{f("expr", n.Expr), f("ops", n.Ops)} }
func (n *Operand) fields() []field   { return []field{f("op", n.Op), f("expr", n.Expr)} }
func (n *Concat) fields() []field    { return []field{f("nodes", n.Nodes)} }
func (n *Assign) fields() []field    { return []field{f("target", n.Target), f("node", n.Node)} }
func (n *AssignBlock) fields() []field {
	return []field{f("target", n.Target), f("filter", n.Filter), f("body", n.Body)}
}
func (n *For) fields() []field {
	return []field{f("target", n.Target), f("iter", n.Iter), f("body", n.Body), f("else_", n.Else), f("test", n.Test), f("recursive", n.Recursive)}
}
func (n *If) fields() []field {
	return []field{f("test", n.Test), f("body", n.Body), f("elif_", n.Elif), f("else_", n.Else)}
}
func (n *With) fields() []field {
	return []field{f("targets", n.Targets), f("values", n.Values), f("body", n.Body)}
}
func (n *Scope) fields() []field { return []field{f("body", n.Body)} }
func (n *ScopedEvalContextModifier) fields() []field {
	return []field{f("options", n.Options), f("body", n.Body)}
}
func (n *Block) fields() []field {
	return []field{f("name", n.Name), f("body", n.Body), f("scoped", n.Scoped), f("required", n.Required)}
}
func (n *Extends) fields() []field { return []field{f("template", n.Template)} }
func (n *Include) fields() []field {
	return []field{f("template", n.Template), f("with_context", n.WithContext), f("ignore_missing", n.IgnoreMissing)}
}
func (n *Import) fields() []field {
	return []field{f("template", n.Template), f("target", n.Target), f("with_context", n.WithContext)}
}
func (n *FromImport) fields() []field {
	return []field{f("template", n.Template), f("names", n.Names), f("with_context", n.WithContext)}
}
func (n *MacroNode) fields() []field {
	return []field{f("name", n.Name), f("args", n.Args), f("defaults", n.Defaults), f("body", n.Body)}
}
func (n *CallBlock) fields() []field {
	return []field{f("call", n.Call), f("args", n.Args), f("defaults", n.Defaults), f("body", n.Body)}
}
func (n *FilterBlock) fields() []field { return []field{f("body", n.Body), f("filter", n.Filter)} }

// constValue marks a Const's value, written as Python's repr.
type constValue struct{ v any }

// children is iter_child_nodes: the nodes among the fields, in order.
func children(n Node) []Node {
	var out []Node
	add := func(v any) {
		switch x := v.(type) {
		case Node:
			if !isNilNode(x) {
				out = append(out, x)
			}
		}
	}
	for _, fl := range n.fields() {
		switch v := fl.value.(type) {
		case []Node:
			for _, c := range v {
				add(c)
			}
		case []*Pair:
			for _, c := range v {
				add(c)
			}
		case []*Keyword:
			for _, c := range v {
				add(c)
			}
		case []*Operand:
			for _, c := range v {
				add(c)
			}
		case []*If:
			for _, c := range v {
				add(c)
			}
		case []*Name:
			for _, c := range v {
				add(c)
			}
		default:
			add(v)
		}
	}
	return out
}

// isNilNode reports a nil node held in a typed field.
func isNilNode(n Node) bool {
	switch x := n.(type) {
	case nil:
		return true
	case *Call:
		return x == nil
	case *Filter:
		return x == nil
	case *If:
		return x == nil
	case *Name:
		return x == nil
	}
	return false
}

// setCtx is Node.set_ctx: the ctx of the node and every node under it.
func setCtx(n Node, ctx string) {
	switch x := n.(type) {
	case *Name:
		x.Ctx = ctx
	case *TupleNode:
		x.Ctx = ctx
	case *Getattr:
		x.Ctx = ctx
	case *Getitem:
		x.Ctx = ctx
	}
	for _, c := range children(n) {
		setCtx(c, ctx)
	}
}

// canAssign is Expr.can_assign.
func canAssign(n Node) bool {
	switch x := n.(type) {
	case *Name:
		switch x.Name {
		case "true", "false", "none", "True", "False", "None":
			return false
		}
		return true
	case *NSRef:
		return true
	case *TupleNode:
		for _, it := range x.Items {
			if !canAssign(it) {
				return false
			}
		}
		return true
	}
	return false
}
