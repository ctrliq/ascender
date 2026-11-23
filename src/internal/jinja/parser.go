package jinja

// A port of jinja2/parser.py. Errors panic with *Error and Parse recovers
// them, as the Python parser raises TemplateSyntaxError out of any depth.

import (
	"strings"

	"github.com/ctrliq/ascender/internal/pystr"
)

var statementKeywords = map[string]bool{
	"for": true, "if": true, "block": true, "extends": true, "print": true, "macro": true,
	"include": true, "from": true, "import": true, "set": true, "with": true, "autoescape": true,
}

var compareOperators = map[string]bool{"eq": true, "ne": true, "lt": true, "lteq": true, "gt": true, "gteq": true}

var mathNodes = map[string]string{"add": "Add", "sub": "Sub", "mul": "Mul", "div": "Div", "floordiv": "FloorDiv", "mod": "Mod"}

type parser struct {
	stream        *tokenStream
	tagStack      []string
	endTokenStack [][]string
}

// Parse is Environment.parse: the template's tree, or its
// TemplateSyntaxError.
func Parse(source string) (tpl *Template, err error) {
	defer func() {
		if r := recover(); r != nil {
			e, ok := r.(*Error)
			if !ok {
				panic(r)
			}
			tpl, err = nil, e
		}
	}()
	p := &parser{stream: newTokenStream(source)}
	return &Template{pos: pos{1}, Body: p.subparse(nil)}, nil
}

func (p *parser) fail(msg string, lineno int) {
	panic(syntaxError(msg, lineno))
}

func (p *parser) failHere(msg string) { p.fail(msg, p.stream.current.lineno) }

func (p *parser) failUtEOF(name string, named bool, endTokenStack [][]string, lineno int) {
	expected := map[string]bool{}
	for _, exprs := range endTokenStack {
		for _, e := range exprs {
			expected[describeTokenExpr(e)] = true
		}
	}
	currentlyLooking := ""
	if len(endTokenStack) > 0 {
		var parts []string
		for _, e := range endTokenStack[len(endTokenStack)-1] {
			parts = append(parts, pystr.Repr(describeTokenExpr(e)))
		}
		currentlyLooking = strings.Join(parts, " or ")
	}
	var message []string
	if !named {
		message = append(message, "Unexpected end of template.")
	} else {
		message = append(message, "Encountered unknown tag "+pystr.Repr(name)+".")
	}
	if currentlyLooking != "" {
		if named && expected[name] {
			message = append(message, "You probably made a nesting mistake. Jinja is expecting this tag, but currently looking for "+currentlyLooking+".")
		} else {
			message = append(message, "Jinja was looking for the following tags: "+currentlyLooking+".")
		}
	}
	if len(p.tagStack) > 0 {
		message = append(message, "The innermost block that needs to be closed is "+pystr.Repr(p.tagStack[len(p.tagStack)-1])+".")
	}
	p.fail(strings.Join(message, " "), lineno)
}

func (p *parser) failUnknownTag(name string, lineno int) {
	p.failUtEOF(name, true, p.endTokenStack, lineno)
}

func (p *parser) failEOF(endTokens []string, lineno int) {
	stack := append([][]string{}, p.endTokenStack...)
	if endTokens != nil {
		stack = append(stack, endTokens)
	}
	p.failUtEOF("", false, stack, lineno)
}

// isTupleEnd is is_tuple_end. Jinja passes extra_end_rules to test_any as
// one tuple argument, which no token matches, so the extra rules never end
// a tuple; that is kept.
func (p *parser) isTupleEnd(extraEndRules []string) bool {
	switch p.stream.current.typ {
	case tokVariableEnd, tokBlockEnd, tokRparen:
		return true
	}
	return false
}

func (p *parser) parseStatement() []Node {
	tok := p.stream.current
	if tok.typ != tokName {
		p.fail("tag name expected", tok.lineno)
	}
	name := tok.str()
	p.tagStack = append(p.tagStack, name)
	popTag := true
	defer func() {
		if popTag {
			p.tagStack = p.tagStack[:len(p.tagStack)-1]
		}
	}()
	one := func(n Node) []Node { return []Node{n} }
	if statementKeywords[name] {
		switch name {
		case "for":
			return one(p.parseFor())
		case "if":
			return one(p.parseIf())
		case "block":
			return one(p.parseBlock())
		case "extends":
			return one(p.parseExtends())
		case "print":
			return one(p.parsePrint())
		case "macro":
			return one(p.parseMacro())
		case "include":
			return one(p.parseInclude())
		case "from":
			return one(p.parseFrom())
		case "import":
			return one(p.parseImport())
		case "set":
			return one(p.parseSet())
		case "with":
			return one(p.parseWith())
		case "autoescape":
			return one(p.parseAutoescape())
		}
	}
	if name == "call" {
		return one(p.parseCallBlock())
	}
	if name == "filter" {
		return one(p.parseFilterBlock())
	}
	p.tagStack = p.tagStack[:len(p.tagStack)-1]
	popTag = false
	p.failUnknownTag(name, tok.lineno)
	return nil
}

func (p *parser) parseStatements(endTokens []string, dropNeedle bool) []Node {
	p.stream.skipIf(tokColon)
	p.stream.expect(tokBlockEnd)
	result := p.subparse(endTokens)
	if p.stream.current.typ == tokEOF {
		p.failEOF(endTokens, p.stream.current.lineno)
	}
	if dropNeedle {
		p.stream.next()
	}
	return result
}

func (p *parser) parseSet() Node {
	lineno := p.stream.next().lineno
	target := p.parseAssignTarget(true, false, nil, true)
	if p.stream.skipIf(tokAssign) {
		expr := p.parseTuple(false, true, nil, false, false)
		return &Assign{pos: pos{lineno}, Target: target, Node: expr}
	}
	filterNode := p.parseFilter(nil, false)
	body := p.parseStatements([]string{"name:endset"}, true)
	return &AssignBlock{pos: pos{lineno}, Target: target, Filter: filterNode, Body: body}
}

func (p *parser) parseFor() Node {
	lineno := p.stream.expect("name:for").lineno
	target := p.parseAssignTarget(true, false, []string{"name:in"}, false)
	p.stream.expect("name:in")
	iter := p.parseTuple(false, false, []string{"name:recursive"}, false, false)
	var test Node
	if p.stream.skipIf("name:if") {
		test = p.parseExpression(true)
	}
	recursive := p.stream.skipIf("name:recursive")
	body := p.parseStatements([]string{"name:endfor", "name:else"}, false)
	var else_ []Node
	if p.stream.next().str() == "endfor" {
		else_ = []Node{}
	} else {
		else_ = p.parseStatements([]string{"name:endfor"}, true)
	}
	return &For{pos: pos{lineno}, Target: target, Iter: iter, Body: body, Else: else_, Test: test, Recursive: recursive}
}

func (p *parser) parseIf() Node {
	result := &If{pos: pos{p.stream.expect("name:if").lineno}}
	node := result
	for {
		node.Test = p.parseTuple(false, false, nil, false, false)
		node.Body = p.parseStatements([]string{"name:elif", "name:else", "name:endif"}, false)
		node.Elif = []*If{}
		node.Else = []Node{}
		tok := p.stream.next()
		if tok.test("name:elif") {
			node = &If{pos: pos{p.stream.current.lineno}}
			result.Elif = append(result.Elif, node)
			continue
		} else if tok.test("name:else") {
			result.Else = p.parseStatements([]string{"name:endif"}, true)
		}
		break
	}
	return result
}

func (p *parser) parseWith() Node {
	node := &With{pos: pos{p.stream.next().lineno}}
	targets, values := []Node{}, []Node{}
	for p.stream.current.typ != tokBlockEnd {
		if len(targets) > 0 {
			p.stream.expect(tokComma)
		}
		target := p.parseAssignTarget(true, false, nil, false)
		setCtx(target, "param")
		targets = append(targets, target)
		p.stream.expect(tokAssign)
		values = append(values, p.parseExpression(true))
	}
	node.Targets, node.Values = targets, values
	node.Body = p.parseStatements([]string{"name:endwith"}, true)
	return node
}

func (p *parser) parseAutoescape() Node {
	node := &ScopedEvalContextModifier{pos: pos{p.stream.next().lineno}}
	node.Options = []*Keyword{{Key: "autoescape", Value: p.parseExpression(true)}}
	node.Body = p.parseStatements([]string{"name:endautoescape"}, true)
	return &Scope{Body: []Node{node}}
}

func (p *parser) parseBlock() Node {
	node := &Block{pos: pos{p.stream.next().lineno}}
	node.Name = p.stream.expect(tokName).str()
	node.Scoped = p.stream.skipIf("name:scoped")
	node.Required = p.stream.skipIf("name:required")
	if p.stream.current.typ == tokSub {
		p.failHere("Block names in Jinja have to be valid Python identifiers and may not contain hyphens, use an underscore instead.")
	}
	node.Body = p.parseStatements([]string{"name:endblock"}, true)
	if node.Required {
		for _, bn := range node.Body {
			out, ok := bn.(*Output)
			bad := !ok
			if ok {
				for _, on := range out.Nodes {
					td, isData := on.(*TemplateData)
					if !isData || !isSpaceString(td.Data) {
						bad = true
					}
				}
			}
			if bad {
				p.failHere("Required blocks can only contain comments or whitespace")
			}
		}
	}
	p.stream.skipIf("name:" + node.Name)
	return node
}

// isSpaceString is str.isspace().
func isSpaceString(s string) bool {
	if s == "" {
		return false
	}
	for _, r := range s {
		if !pystr.IsSpace(r) {
			return false
		}
	}
	return true
}

func (p *parser) parseExtends() Node {
	node := &Extends{pos: pos{p.stream.next().lineno}}
	node.Template = p.parseExpression(true)
	return node
}

func (p *parser) parseImportContext(dflt bool) bool {
	if p.stream.current.testAny("name:with", "name:without") && p.stream.look().test("name:context") {
		with := p.stream.next().str() == "with"
		p.stream.skip(1)
		return with
	}
	return dflt
}

func (p *parser) parseInclude() Node {
	node := &Include{pos: pos{p.stream.next().lineno}}
	node.Template = p.parseExpression(true)
	if p.stream.current.test("name:ignore") && p.stream.look().test("name:missing") {
		node.IgnoreMissing = true
		p.stream.skip(2)
	}
	node.WithContext = p.parseImportContext(true)
	return node
}

func (p *parser) parseImport() Node {
	node := &Import{pos: pos{p.stream.next().lineno}}
	node.Template = p.parseExpression(true)
	p.stream.expect("name:as")
	node.Target = p.parseAssignTarget(false, true, nil, false).(*Name).Name
	node.WithContext = p.parseImportContext(false)
	return node
}

func (p *parser) parseFrom() Node {
	node := &FromImport{pos: pos{p.stream.next().lineno}}
	node.Template = p.parseExpression(true)
	p.stream.expect("name:import")
	node.Names = []any{}
	parseContext := func() bool {
		v := p.stream.current.str()
		if (v == "with" || v == "without") && p.stream.look().test("name:context") {
			node.WithContext = p.stream.next().str() == "with"
			p.stream.skip(1)
			return true
		}
		return false
	}
	for {
		if len(node.Names) > 0 {
			p.stream.expect(tokComma)
		}
		if p.stream.current.typ == tokName {
			if parseContext() {
				break
			}
			target := p.parseAssignTarget(false, true, nil, false).(*Name)
			if strings.HasPrefix(target.Name, "_") {
				panic(assertionError("names starting with an underline can not be imported", target.Lineno))
			}
			if p.stream.skipIf("name:as") {
				alias := p.parseAssignTarget(false, true, nil, false).(*Name)
				node.Names = append(node.Names, [2]string{target.Name, alias.Name})
			} else {
				node.Names = append(node.Names, target.Name)
			}
			if parseContext() || p.stream.current.typ != tokComma {
				break
			}
		} else {
			p.stream.expect(tokName)
		}
	}
	return node
}

func (p *parser) parseSignature() ([]*Name, []Node) {
	args, defaults := []*Name{}, []Node{}
	p.stream.expect(tokLparen)
	for p.stream.current.typ != tokRparen {
		if len(args) > 0 {
			p.stream.expect(tokComma)
		}
		arg := p.parseAssignTarget(false, true, nil, false).(*Name)
		setCtx(arg, "param")
		if p.stream.skipIf(tokAssign) {
			defaults = append(defaults, p.parseExpression(true))
		} else if len(defaults) > 0 {
			p.failHere("non-default argument follows default argument")
		}
		args = append(args, arg)
	}
	p.stream.expect(tokRparen)
	return args, defaults
}

func (p *parser) parseCallBlock() Node {
	node := &CallBlock{pos: pos{p.stream.next().lineno}}
	if p.stream.current.typ == tokLparen {
		node.Args, node.Defaults = p.parseSignature()
	} else {
		node.Args, node.Defaults = []*Name{}, []Node{}
	}
	callNode := p.parseExpression(true)
	call, ok := callNode.(*Call)
	if !ok {
		p.fail("expected call", node.Lineno)
	}
	node.Call = call
	node.Body = p.parseStatements([]string{"name:endcall"}, true)
	return node
}

func (p *parser) parseFilterBlock() Node {
	node := &FilterBlock{pos: pos{p.stream.next().lineno}}
	node.Filter = p.parseFilter(nil, true).(*Filter)
	node.Body = p.parseStatements([]string{"name:endfilter"}, true)
	return node
}

func (p *parser) parseMacro() Node {
	node := &MacroNode{pos: pos{p.stream.next().lineno}}
	node.Name = p.parseAssignTarget(false, true, nil, false).(*Name).Name
	node.Args, node.Defaults = p.parseSignature()
	node.Body = p.parseStatements([]string{"name:endmacro"}, true)
	return node
}

func (p *parser) parsePrint() Node {
	node := &Output{pos: pos{p.stream.next().lineno}, Nodes: []Node{}}
	for p.stream.current.typ != tokBlockEnd {
		if len(node.Nodes) > 0 {
			p.stream.expect(tokComma)
		}
		node.Nodes = append(node.Nodes, p.parseExpression(true))
	}
	return node
}

func (p *parser) parseAssignTarget(withTuple, nameOnly bool, extraEndRules []string, withNamespace bool) Node {
	var target Node
	if nameOnly {
		tok := p.stream.expect(tokName)
		target = &Name{pos: pos{tok.lineno}, Name: tok.str(), Ctx: "store"}
	} else {
		if withTuple {
			target = p.parseTuple(true, true, extraEndRules, false, withNamespace)
		} else {
			target = p.parsePrimary(withNamespace)
		}
		setCtx(target, "store")
	}
	if !canAssign(target) {
		p.fail("can't assign to "+pystr.Repr(strings.ToLower(target.typeName())), target.line())
	}
	return target
}

func (p *parser) parseExpression(withCondexpr bool) Node {
	if withCondexpr {
		return p.parseCondexpr()
	}
	return p.parseOr()
}

func (p *parser) parseCondexpr() Node {
	lineno := p.stream.current.lineno
	expr1 := p.parseOr()
	for p.stream.skipIf("name:if") {
		expr2 := p.parseOr()
		var expr3 Node
		if p.stream.skipIf("name:else") {
			expr3 = p.parseCondexpr()
		}
		expr1 = &CondExpr{pos: pos{lineno}, Test: expr2, Expr1: expr1, Expr2: expr3}
		lineno = p.stream.current.lineno
	}
	return expr1
}

func (p *parser) parseOr() Node {
	lineno := p.stream.current.lineno
	left := p.parseAnd()
	for p.stream.skipIf("name:or") {
		right := p.parseAnd()
		left = &BinExpr{pos: pos{lineno}, Kind: "Or", Left: left, Right: right}
		lineno = p.stream.current.lineno
	}
	return left
}

func (p *parser) parseAnd() Node {
	lineno := p.stream.current.lineno
	left := p.parseNot()
	for p.stream.skipIf("name:and") {
		right := p.parseNot()
		left = &BinExpr{pos: pos{lineno}, Kind: "And", Left: left, Right: right}
		lineno = p.stream.current.lineno
	}
	return left
}

func (p *parser) parseNot() Node {
	if p.stream.current.test("name:not") {
		lineno := p.stream.next().lineno
		return &UnaryExpr{pos: pos{lineno}, Kind: "Not", Node: p.parseNot()}
	}
	return p.parseCompare()
}

func (p *parser) parseCompare() Node {
	lineno := p.stream.current.lineno
	expr := p.parseMath1()
	var ops []*Operand
	for {
		typ := p.stream.current.typ
		if compareOperators[typ] {
			p.stream.next()
			ops = append(ops, &Operand{Op: typ, Expr: p.parseMath1()})
		} else if p.stream.skipIf("name:in") {
			ops = append(ops, &Operand{Op: "in", Expr: p.parseMath1()})
		} else if p.stream.current.test("name:not") && p.stream.look().test("name:in") {
			p.stream.skip(2)
			ops = append(ops, &Operand{Op: "notin", Expr: p.parseMath1()})
		} else {
			break
		}
		lineno = p.stream.current.lineno
	}
	if len(ops) == 0 {
		return expr
	}
	return &Compare{pos: pos{lineno}, Expr: expr, Ops: ops}
}

func (p *parser) parseMath1() Node {
	lineno := p.stream.current.lineno
	left := p.parseConcat()
	for p.stream.current.typ == tokAdd || p.stream.current.typ == tokSub {
		kind := mathNodes[p.stream.current.typ]
		p.stream.next()
		right := p.parseConcat()
		left = &BinExpr{pos: pos{lineno}, Kind: kind, Left: left, Right: right}
		lineno = p.stream.current.lineno
	}
	return left
}

func (p *parser) parseConcat() Node {
	lineno := p.stream.current.lineno
	args := []Node{p.parseMath2()}
	for p.stream.current.typ == tokTilde {
		p.stream.next()
		args = append(args, p.parseMath2())
	}
	if len(args) == 1 {
		return args[0]
	}
	return &Concat{pos: pos{lineno}, Nodes: args}
}

func (p *parser) parseMath2() Node {
	lineno := p.stream.current.lineno
	left := p.parsePow()
	for {
		typ := p.stream.current.typ
		if typ != tokMul && typ != tokDiv && typ != tokFloordiv && typ != tokMod {
			break
		}
		kind := mathNodes[typ]
		p.stream.next()
		right := p.parsePow()
		left = &BinExpr{pos: pos{lineno}, Kind: kind, Left: left, Right: right}
		lineno = p.stream.current.lineno
	}
	return left
}

func (p *parser) parsePow() Node {
	lineno := p.stream.current.lineno
	left := p.parseUnary(true)
	for p.stream.current.typ == tokPow {
		p.stream.next()
		right := p.parseUnary(true)
		left = &BinExpr{pos: pos{lineno}, Kind: "Pow", Left: left, Right: right}
		lineno = p.stream.current.lineno
	}
	return left
}

func (p *parser) parseUnary(withFilter bool) Node {
	typ := p.stream.current.typ
	lineno := p.stream.current.lineno
	var node Node
	switch typ {
	case tokSub:
		p.stream.next()
		node = &UnaryExpr{pos: pos{lineno}, Kind: "Neg", Node: p.parseUnary(false)}
	case tokAdd:
		p.stream.next()
		node = &UnaryExpr{pos: pos{lineno}, Kind: "Pos", Node: p.parseUnary(false)}
	default:
		node = p.parsePrimary(false)
	}
	node = p.parsePostfix(node)
	if withFilter {
		node = p.parseFilterExpr(node)
	}
	return node
}

func (p *parser) parsePrimary(withNamespace bool) Node {
	tok := p.stream.current
	switch tok.typ {
	case tokName:
		p.stream.next()
		v := tok.str()
		switch {
		case v == "true" || v == "false" || v == "True" || v == "False":
			return &Const{pos: pos{tok.lineno}, Value: v == "true" || v == "True"}
		case v == "none" || v == "None":
			return &Const{pos: pos{tok.lineno}, Value: nil}
		case withNamespace && p.stream.current.typ == tokDot:
			p.stream.next()
			attr := p.stream.expect(tokName)
			return &NSRef{pos: pos{tok.lineno}, Name: v, Attr: attr.str()}
		}
		return &Name{pos: pos{tok.lineno}, Name: v, Ctx: "load"}
	case tokString:
		p.stream.next()
		buf := []string{tok.str()}
		for p.stream.current.typ == tokString {
			buf = append(buf, p.stream.current.str())
			p.stream.next()
		}
		return &Const{pos: pos{tok.lineno}, Value: strings.Join(buf, "")}
	case tokInteger, tokFloat:
		p.stream.next()
		return &Const{pos: pos{tok.lineno}, Value: tok.value}
	case tokLparen:
		p.stream.next()
		node := p.parseTuple(false, true, nil, true, false)
		p.stream.expect(tokRparen)
		return node
	case tokLbracket:
		return p.parseList()
	case tokLbrace:
		return p.parseDict()
	}
	p.fail("unexpected "+pystr.Repr(describeToken(tok)), tok.lineno)
	return nil
}

func (p *parser) parseTuple(simplified, withCondexpr bool, extraEndRules []string, explicitParentheses, withNamespace bool) Node {
	lineno := p.stream.current.lineno
	parse := func() Node {
		if simplified {
			return p.parsePrimary(withNamespace)
		}
		return p.parseExpression(withCondexpr)
	}
	args := []Node{}
	isTuple := false
	for {
		if len(args) > 0 {
			p.stream.expect(tokComma)
		}
		if p.isTupleEnd(extraEndRules) {
			break
		}
		args = append(args, parse())
		if p.stream.current.typ == tokComma {
			isTuple = true
		} else {
			break
		}
		lineno = p.stream.current.lineno
	}
	if !isTuple {
		if len(args) > 0 {
			return args[0]
		}
		if !explicitParentheses {
			p.failHere("Expected an expression, got " + pystr.Repr(describeToken(p.stream.current)))
		}
	}
	return &TupleNode{pos: pos{lineno}, Items: args, Ctx: "load"}
}

func (p *parser) parseList() Node {
	tok := p.stream.expect(tokLbracket)
	items := []Node{}
	for p.stream.current.typ != tokRbracket {
		if len(items) > 0 {
			p.stream.expect(tokComma)
		}
		if p.stream.current.typ == tokRbracket {
			break
		}
		items = append(items, p.parseExpression(true))
	}
	p.stream.expect(tokRbracket)
	return &ListNode{pos: pos{tok.lineno}, Items: items}
}

func (p *parser) parseDict() Node {
	tok := p.stream.expect(tokLbrace)
	items := []*Pair{}
	for p.stream.current.typ != tokRbrace {
		if len(items) > 0 {
			p.stream.expect(tokComma)
		}
		if p.stream.current.typ == tokRbrace {
			break
		}
		key := p.parseExpression(true)
		p.stream.expect(tokColon)
		value := p.parseExpression(true)
		items = append(items, &Pair{pos: pos{key.line()}, Key: key, Value: value})
	}
	p.stream.expect(tokRbrace)
	return &DictNode{pos: pos{tok.lineno}, Items: items}
}

func (p *parser) parsePostfix(node Node) Node {
	for {
		switch p.stream.current.typ {
		case tokDot, tokLbracket:
			node = p.parseSubscript(node)
		case tokLparen:
			node = p.parseCall(node)
		default:
			return node
		}
	}
}

func (p *parser) parseFilterExpr(node Node) Node {
	for {
		typ := p.stream.current.typ
		switch {
		case typ == tokPipe:
			node = p.parseFilter(node, false)
		case typ == tokName && p.stream.current.str() == "is":
			node = p.parseTest(node)
		case typ == tokLparen:
			node = p.parseCall(node)
		default:
			return node
		}
	}
}

func (p *parser) parseSubscript(node Node) Node {
	tok := p.stream.next()
	if tok.typ == tokDot {
		attr := p.stream.current
		p.stream.next()
		if attr.typ == tokName {
			return &Getattr{pos: pos{tok.lineno}, Node: node, Attr: attr.str(), Ctx: "load"}
		} else if attr.typ != tokInteger {
			p.fail("expected name or number", attr.lineno)
		}
		arg := &Const{pos: pos{attr.lineno}, Value: attr.value}
		return &Getitem{pos: pos{tok.lineno}, Node: node, Arg: arg, Ctx: "load"}
	}
	if tok.typ == tokLbracket {
		var args []Node
		for p.stream.current.typ != tokRbracket {
			if len(args) > 0 {
				p.stream.expect(tokComma)
			}
			args = append(args, p.parseSubscribed())
		}
		p.stream.expect(tokRbracket)
		var arg Node
		if len(args) == 1 {
			arg = args[0]
		} else {
			if args == nil {
				args = []Node{}
			}
			arg = &TupleNode{pos: pos{tok.lineno}, Items: args, Ctx: "load"}
		}
		return &Getitem{pos: pos{tok.lineno}, Node: node, Arg: arg, Ctx: "load"}
	}
	p.fail("expected subscript expression", tok.lineno)
	return nil
}

func (p *parser) parseSubscribed() Node {
	lineno := p.stream.current.lineno
	var args []Node
	if p.stream.current.typ == tokColon {
		p.stream.next()
		args = []Node{nil}
	} else {
		node := p.parseExpression(true)
		if p.stream.current.typ != tokColon {
			return node
		}
		p.stream.next()
		args = []Node{node}
	}
	if p.stream.current.typ == tokColon {
		args = append(args, nil)
	} else if t := p.stream.current.typ; t != tokRbracket && t != tokComma {
		args = append(args, p.parseExpression(true))
	} else {
		args = append(args, nil)
	}
	if p.stream.current.typ == tokColon {
		p.stream.next()
		if t := p.stream.current.typ; t != tokRbracket && t != tokComma {
			args = append(args, p.parseExpression(true))
		} else {
			args = append(args, nil)
		}
	} else {
		args = append(args, nil)
	}
	return &Slice{pos: pos{lineno}, Start: args[0], Stop: args[1], Step: args[2]}
}

func (p *parser) parseCallArgs() ([]Node, []*Keyword, Node, Node) {
	tok := p.stream.expect(tokLparen)
	args, kwargs := []Node{}, []*Keyword{}
	var dynArgs, dynKwargs Node
	requireComma := false
	ensure := func(ok bool) {
		if !ok {
			p.fail("invalid syntax for function call expression", tok.lineno)
		}
	}
	for p.stream.current.typ != tokRparen {
		if requireComma {
			p.stream.expect(tokComma)
			if p.stream.current.typ == tokRparen {
				break
			}
		}
		switch {
		case p.stream.current.typ == tokMul:
			ensure(dynArgs == nil && dynKwargs == nil)
			p.stream.next()
			dynArgs = p.parseExpression(true)
		case p.stream.current.typ == tokPow:
			ensure(dynKwargs == nil)
			p.stream.next()
			dynKwargs = p.parseExpression(true)
		default:
			if p.stream.current.typ == tokName && p.stream.look().typ == tokAssign {
				ensure(dynKwargs == nil)
				key := p.stream.current.str()
				p.stream.skip(2)
				value := p.parseExpression(true)
				kwargs = append(kwargs, &Keyword{pos: pos{value.line()}, Key: key, Value: value})
			} else {
				ensure(dynArgs == nil && dynKwargs == nil && len(kwargs) == 0)
				args = append(args, p.parseExpression(true))
			}
		}
		requireComma = true
	}
	p.stream.expect(tokRparen)
	return args, kwargs, dynArgs, dynKwargs
}

func (p *parser) parseCall(node Node) Node {
	tok := p.stream.current
	args, kwargs, dynArgs, dynKwargs := p.parseCallArgs()
	return &Call{pos: pos{tok.lineno}, Node: node, Args: args, Kwargs: kwargs, DynArgs: dynArgs, DynKwargs: dynKwargs}
}

func (p *parser) parseFilter(node Node, startInline bool) Node {
	for p.stream.current.typ == tokPipe || startInline {
		if !startInline {
			p.stream.next()
		}
		tok := p.stream.expect(tokName)
		name := tok.str()
		for p.stream.current.typ == tokDot {
			p.stream.next()
			name += "." + p.stream.expect(tokName).str()
		}
		var args []Node
		var kwargs []*Keyword
		var dynArgs, dynKwargs Node
		if p.stream.current.typ == tokLparen {
			args, kwargs, dynArgs, dynKwargs = p.parseCallArgs()
		} else {
			args, kwargs = []Node{}, []*Keyword{}
		}
		node = &Filter{pos: pos{tok.lineno}, Node: node, Name: name, Args: args, Kwargs: kwargs, DynArgs: dynArgs, DynKwargs: dynKwargs}
		startInline = false
	}
	return node
}

func (p *parser) parseTest(node Node) Node {
	tok := p.stream.next()
	negated := false
	if p.stream.current.test("name:not") {
		p.stream.next()
		negated = true
	}
	name := p.stream.expect(tokName).str()
	for p.stream.current.typ == tokDot {
		p.stream.next()
		name += "." + p.stream.expect(tokName).str()
	}
	var args []Node
	kwargs := []*Keyword{}
	var dynArgs, dynKwargs Node
	switch t := p.stream.current.typ; {
	case t == tokLparen:
		args, kwargs, dynArgs, dynKwargs = p.parseCallArgs()
	case (t == tokName || t == tokString || t == tokInteger || t == tokFloat || t == tokLbracket || t == tokLbrace) &&
		!p.stream.current.testAny("name:else", "name:or", "name:and"):
		if p.stream.current.test("name:is") {
			p.failHere("You cannot chain multiple tests with is")
		}
		argNode := p.parsePostfix(p.parsePrimary(false))
		args = []Node{argNode}
	default:
		args = []Node{}
	}
	var out Node = &Test{pos: pos{tok.lineno}, Node: node, Name: name, Args: args, Kwargs: kwargs, DynArgs: dynArgs, DynKwargs: dynKwargs}
	if negated {
		out = &UnaryExpr{pos: pos{tok.lineno}, Kind: "Not", Node: out}
	}
	return out
}

func (p *parser) subparse(endTokens []string) []Node {
	body := []Node{}
	var dataBuffer []Node
	if endTokens != nil {
		p.endTokenStack = append(p.endTokenStack, endTokens)
		defer func() { p.endTokenStack = p.endTokenStack[:len(p.endTokenStack)-1] }()
	}
	flush := func() {
		if len(dataBuffer) > 0 {
			body = append(body, &Output{pos: pos{dataBuffer[0].line()}, Nodes: dataBuffer})
			dataBuffer = nil
		}
	}
	for p.stream.more() {
		tok := p.stream.current
		switch tok.typ {
		case tokData:
			if tok.str() != "" {
				dataBuffer = append(dataBuffer, &TemplateData{pos: pos{tok.lineno}, Data: tok.str()})
			}
			p.stream.next()
		case tokVariableBegin:
			p.stream.next()
			dataBuffer = append(dataBuffer, p.parseTuple(false, true, nil, false, false))
			p.stream.expect(tokVariableEnd)
		case tokBlockBegin:
			flush()
			p.stream.next()
			if endTokens != nil && p.stream.current.testAny(endTokens...) {
				return body
			}
			body = append(body, p.parseStatement()...)
			p.stream.expect(tokBlockEnd)
		default:
			panic("internal parsing error")
		}
	}
	flush()
	return body
}
