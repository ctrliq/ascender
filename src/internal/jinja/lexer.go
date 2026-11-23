package jinja

// A port of jinja2/lexer.py for the default environment settings (the
// delimiters {% %}, {{ }} and {# #}, no line statements or comments,
// trim_blocks, lstrip_blocks and keep_trailing_newline off). Each of the
// lexer's regular expressions is written out by hand, matching the same
// text. Like the generator it ports, the lexer works on demand: an error is
// raised when the parser asks for the token where it lies, so an earlier
// parse error takes precedence.

import (
	"math/big"
	"strconv"
	"strings"
	"unicode"

	"github.com/ctrliq/ascender/internal/pystr"
)

// Token types.
const (
	tokAdd           = "add"
	tokAssign        = "assign"
	tokColon         = "colon"
	tokComma         = "comma"
	tokDiv           = "div"
	tokDot           = "dot"
	tokEq            = "eq"
	tokFloordiv      = "floordiv"
	tokGt            = "gt"
	tokGteq          = "gteq"
	tokLbrace        = "lbrace"
	tokLbracket      = "lbracket"
	tokLparen        = "lparen"
	tokLt            = "lt"
	tokLteq          = "lteq"
	tokMod           = "mod"
	tokMul           = "mul"
	tokNe            = "ne"
	tokPipe          = "pipe"
	tokPow           = "pow"
	tokRbrace        = "rbrace"
	tokRbracket      = "rbracket"
	tokRparen        = "rparen"
	tokSemicolon     = "semicolon"
	tokSub           = "sub"
	tokTilde         = "tilde"
	tokWhitespace    = "whitespace"
	tokFloat         = "float"
	tokInteger       = "integer"
	tokName          = "name"
	tokString        = "string"
	tokOperator      = "operator"
	tokBlockBegin    = "block_begin"
	tokBlockEnd      = "block_end"
	tokVariableBegin = "variable_begin"
	tokVariableEnd   = "variable_end"
	tokRawBegin      = "raw_begin"
	tokRawEnd        = "raw_end"
	tokCommentBegin  = "comment_begin"
	tokCommentEnd    = "comment_end"
	tokComment       = "comment"
	tokData          = "data"
	tokInitial       = "initial"
	tokEOF           = "eof"
)

// operators, longest first as operator_re tries them.
var operatorList = []struct{ op, typ string }{
	{"//", tokFloordiv}, {"**", tokPow}, {"==", tokEq}, {"!=", tokNe}, {">=", tokGteq}, {"<=", tokLteq},
	{"+", tokAdd}, {"-", tokSub}, {"/", tokDiv}, {"*", tokMul}, {"%", tokMod}, {"~", tokTilde},
	{"[", tokLbracket}, {"]", tokRbracket}, {"(", tokLparen}, {")", tokRparen}, {"{", tokLbrace}, {"}", tokRbrace},
	{">", tokGt}, {"<", tokLt}, {"=", tokAssign}, {".", tokDot}, {":", tokColon}, {"|", tokPipe},
	{",", tokComma}, {";", tokSemicolon},
}

var reverseOperators = func() map[string]string {
	m := map[string]string{}
	for _, o := range operatorList {
		m[o.typ] = o.op
	}
	return m
}()

func describeTokenType(typ string) string {
	if op, ok := reverseOperators[typ]; ok {
		return op
	}
	switch typ {
	case tokCommentBegin:
		return "begin of comment"
	case tokCommentEnd:
		return "end of comment"
	case tokComment:
		return "comment"
	case tokBlockBegin:
		return "begin of statement block"
	case tokBlockEnd:
		return "end of statement block"
	case tokVariableBegin:
		return "begin of print statement"
	case tokVariableEnd:
		return "end of print statement"
	case tokData:
		return "template data / text"
	case tokEOF:
		return "end of template"
	}
	return typ
}

func describeToken(t token) string {
	if t.typ == tokName {
		return t.str()
	}
	return describeTokenType(t.typ)
}

func describeTokenExpr(expr string) string {
	if typ, value, ok := strings.Cut(expr, ":"); ok {
		if typ == tokName {
			return value
		}
		return describeTokenType(typ)
	}
	return describeTokenType(expr)
}

// token is lexer.Token. value is a string, or for numbers an int64,
// *big.Int or float64.
type token struct {
	lineno int
	typ    string
	value  any
}

func (t token) str() string {
	s, _ := t.value.(string)
	return s
}

func (t token) test(expr string) bool {
	if t.typ == expr {
		return true
	}
	if typ, value, ok := strings.Cut(expr, ":"); ok {
		s, isStr := t.value.(string)
		return t.typ == typ && isStr && s == value
	}
	return false
}

func (t token) testAny(exprs ...string) bool {
	for _, e := range exprs {
		if t.test(e) {
			return true
		}
	}
	return false
}

// rawToken is what tokeniter yields, before wrap converts it.
type rawToken struct {
	lineno int
	typ    string
	data   string
}

type lexer struct {
	src              []rune
	pos              int
	lineno           int
	stack            []string
	balancing        []rune
	newlinesStripped int
	pending          []rawToken
	done             bool
}

func newLexer(source string) *lexer {
	// Only \r\n, \r and \n break lines; one trailing newline is dropped.
	source = strings.ReplaceAll(source, "\r\n", "\n")
	source = strings.ReplaceAll(source, "\r", "\n")
	source = strings.TrimSuffix(source, "\n")
	return &lexer{src: []rune(source), lineno: 1, stack: []string{"root"}}
}

func (l *lexer) emit(typ, data string) {
	l.pending = append(l.pending, rawToken{l.lineno, typ, data})
}

// next returns the next raw token, false at the end of the source. It
// panics with the lexer's TemplateSyntaxError.
func (l *lexer) next() (rawToken, bool) {
	for len(l.pending) == 0 {
		if l.done {
			return rawToken{}, false
		}
		l.step()
	}
	t := l.pending[0]
	l.pending = l.pending[1:]
	return t, true
}

func (l *lexer) fail(msg string) {
	panic(&Error{Type: "TemplateSyntaxError", Message: msg, Lineno: l.lineno})
}

func (l *lexer) has(at int, s string) bool {
	r := []rune(s)
	if at+len(r) > len(l.src) {
		return false
	}
	for i, c := range r {
		if l.src[at+i] != c {
			return false
		}
	}
	return true
}

func (l *lexer) spaces(at int) int {
	for at < len(l.src) && pystr.IsSpace(l.src[at]) {
		at++
	}
	return at
}

func (l *lexer) text(from, to int) string { return string(l.src[from:to]) }

func countNL(s string) int { return strings.Count(s, "\n") }

// step runs one pass of tokeniter's loop: the first rule of the current
// state that matches.
func (l *lexer) step() {
	state := l.stack[len(l.stack)-1]
	switch state {
	case "root":
		l.stepRoot()
	case tokCommentBegin:
		l.stepComment()
	case tokRawBegin:
		l.stepRaw()
	case tokBlockBegin, tokVariableBegin:
		l.stepTag(state)
	}
}

// rootTag matches one of the root alternatives at at: the raw block start,
// then {{, {# and {% each with its whitespace control sign.
func (l *lexer) rootTag(at int) (typ string, end int, sign rune, ok bool) {
	if l.has(at, "{%") {
		p := at + 2
		var sg rune
		if p < len(l.src) && (l.src[p] == '-' || l.src[p] == '+') {
			sg = l.src[p]
			p++
		}
		q := l.spaces(p)
		if l.has(q, "raw") {
			q = l.spaces(q + 3)
			if l.has(q, "-%}") {
				return tokRawBegin, l.spaces(q + 3), sg, true
			}
			if l.has(q, "%}") {
				return tokRawBegin, q + 2, sg, true
			}
		}
	}
	for _, t := range []struct{ start, typ string }{{"{{", tokVariableBegin}, {"{#", tokCommentBegin}, {"{%", tokBlockBegin}} {
		if l.has(at, t.start) {
			p := at + 2
			var sg rune
			if p < len(l.src) && (l.src[p] == '-' || l.src[p] == '+') {
				sg = l.src[p]
				p++
			}
			return t.typ, p, sg, true
		}
	}
	return "", 0, 0, false
}

func (l *lexer) stepRoot() {
	for j := l.pos; j < len(l.src); j++ {
		typ, end, sign, ok := l.rootTag(j)
		if !ok {
			continue
		}
		text := l.text(l.pos, j)
		if sign == '-' {
			stripped := pystr.TrimRightSpace(text)
			l.newlinesStripped = countNL(text[len(stripped):])
			text = stripped
		}
		if text != "" {
			l.emit(tokData, text)
		}
		l.lineno += countNL(text) + l.newlinesStripped
		l.newlinesStripped = 0
		tag := l.text(j, end)
		l.emit(typ, tag)
		l.lineno += countNL(tag)
		l.stack = append(l.stack, typ)
		l.pos = end
		return
	}
	if l.pos < len(l.src) {
		data := l.text(l.pos, len(l.src))
		l.emit(tokData, data)
		l.lineno += countNL(data)
		l.pos = len(l.src)
		return
	}
	l.done = true
}

func (l *lexer) pop() { l.stack = l.stack[:len(l.stack)-1] }

func (l *lexer) stepComment() {
	for j := l.pos; j < len(l.src); j++ {
		end := -1
		switch {
		case l.has(j, "+#}"):
			end = j + 3
		case l.has(j, "-#}"):
			end = l.spaces(j + 3)
		case l.has(j, "#}"):
			end = j + 2
		}
		if end < 0 {
			continue
		}
		text, tail := l.text(l.pos, j), l.text(j, end)
		if text != "" {
			l.emit(tokComment, text)
		}
		l.lineno += countNL(text)
		l.emit(tokCommentEnd, tail)
		l.lineno += countNL(tail)
		l.pop()
		l.pos = end
		return
	}
	if l.pos < len(l.src) {
		l.fail("Missing end of comment tag")
	}
	l.done = true
}

func (l *lexer) stepRaw() {
	for j := l.pos; j < len(l.src); j++ {
		if !l.has(j, "{%") {
			continue
		}
		p := j + 2
		var sign rune
		if p < len(l.src) && (l.src[p] == '-' || l.src[p] == '+') {
			sign = l.src[p]
			p++
		}
		p = l.spaces(p)
		if !l.has(p, "endraw") {
			continue
		}
		p = l.spaces(p + 6)
		end := -1
		switch {
		case l.has(p, "+%}"):
			end = p + 3
		case l.has(p, "-%}"):
			end = l.spaces(p + 3)
		case l.has(p, "%}"):
			end = p + 2
		}
		if end < 0 {
			continue
		}
		text, tail := l.text(l.pos, j), l.text(j, end)
		if sign == '-' {
			stripped := pystr.TrimRightSpace(text)
			l.newlinesStripped = countNL(text[len(stripped):])
			text = stripped
		}
		if text != "" {
			l.emit(tokData, text)
		}
		l.lineno += countNL(text) + l.newlinesStripped
		l.newlinesStripped = 0
		l.emit(tokRawEnd, tail)
		l.lineno += countNL(tail)
		l.pop()
		l.pos = end
		return
	}
	if l.pos < len(l.src) {
		l.fail("Missing end of raw directive")
	}
	l.done = true
}

func isDigit(r rune) bool { return unicode.IsDigit(r) }

// digitsUnderscore matches (\d+_)*\d+ at at, returning its end or -1.
func (l *lexer) digitsUnderscore(at int) int {
	if at >= len(l.src) || !isDigit(l.src[at]) {
		return -1
	}
	p := at
	for {
		for p < len(l.src) && isDigit(l.src[p]) {
			p++
		}
		if p+1 < len(l.src) && l.src[p] == '_' && isDigit(l.src[p+1]) {
			p++
			continue
		}
		return p
	}
}

func (l *lexer) exponent(at int) int {
	if at >= len(l.src) || (l.src[at] != 'e' && l.src[at] != 'E') {
		return -1
	}
	p := at + 1
	if p < len(l.src) && (l.src[p] == '+' || l.src[p] == '-') {
		p++
	}
	return l.digitsUnderscore(p)
}

// matchFloat is float_re.
func (l *lexer) matchFloat(at int) int {
	if at > 0 && l.src[at-1] == '.' {
		return -1
	}
	p := l.digitsUnderscore(at)
	if p < 0 {
		return -1
	}
	if p < len(l.src) && l.src[p] == '.' {
		if q := l.digitsUnderscore(p + 1); q >= 0 {
			if e := l.exponent(q); e >= 0 {
				return e
			}
		}
	}
	if e := l.exponent(p); e >= 0 {
		return e
	}
	if p < len(l.src) && l.src[p] == '.' {
		if q := l.digitsUnderscore(p + 1); q >= 0 {
			return q
		}
	}
	return -1
}

// underscored matches (_?X)+ at at.
func (l *lexer) underscored(at int, isX func(rune) bool) int {
	p := at
	for {
		switch {
		case p < len(l.src) && isX(l.src[p]):
			p++
		case p+1 < len(l.src) && l.src[p] == '_' && isX(l.src[p+1]):
			p += 2
		default:
			if p == at {
				return -1
			}
			return p
		}
	}
}

// matchInteger is integer_re.
func (l *lexer) matchInteger(at int) int {
	if at >= len(l.src) {
		return -1
	}
	c := l.src[at]
	if c == '0' && at+1 < len(l.src) {
		var isX func(rune) bool
		switch l.src[at+1] {
		case 'b', 'B':
			isX = func(r rune) bool { return r == '0' || r == '1' }
		case 'o', 'O':
			isX = func(r rune) bool { return r >= '0' && r <= '7' }
		case 'x', 'X':
			isX = func(r rune) bool { return isDigit(r) || (r >= 'a' && r <= 'f') || (r >= 'A' && r <= 'F') }
		}
		if isX != nil {
			if p := l.underscored(at+2, isX); p >= 0 {
				return p
			}
		}
	}
	if c >= '1' && c <= '9' {
		if p := l.underscored(at+1, isDigit); p >= 0 {
			return p
		}
		return at + 1
	}
	if c == '0' {
		if p := l.underscored(at+1, func(r rune) bool { return r == '0' }); p >= 0 {
			return p
		}
		return at + 1
	}
	return -1
}

func isNameChar(r rune) bool {
	if r == '_' || unicode.IsLetter(r) || unicode.IsNumber(r) {
		return true
	}
	for _, rg := range nameExtra {
		if r < rg[0] {
			return false
		}
		if r <= rg[1] {
			return true
		}
	}
	return false
}

func (l *lexer) matchName(at int) int {
	p := at
	for p < len(l.src) && isNameChar(l.src[p]) {
		p++
	}
	if p == at {
		return -1
	}
	return p
}

// matchString is string_re: a quoted string with backslash escapes.
func (l *lexer) matchString(at int) int {
	if at >= len(l.src) || (l.src[at] != '\'' && l.src[at] != '"') {
		return -1
	}
	q := l.src[at]
	for p := at + 1; p < len(l.src); p++ {
		switch l.src[p] {
		case q:
			return p + 1
		case '\\':
			p++
		}
	}
	return -1
}

func (l *lexer) stepTag(state string) {
	at := l.pos
	data, typ, end := "", "", -1
	if len(l.balancing) == 0 {
		if state == tokBlockBegin {
			switch {
			case l.has(at, "+%}"):
				end = at + 3
			case l.has(at, "-%}"):
				end = l.spaces(at + 3)
			case l.has(at, "%}"):
				end = at + 2
			}
			typ = tokBlockEnd
		} else {
			switch {
			case l.has(at, "-}}"):
				end = l.spaces(at + 3)
			case l.has(at, "}}"):
				end = at + 2
			}
			typ = tokVariableEnd
		}
		if end >= 0 {
			data = l.text(at, end)
			l.emit(typ, data)
			l.lineno += countNL(data)
			l.pop()
			l.pos = end
			return
		}
	}
	if p := l.spaces(at); p > at {
		typ, end = tokWhitespace, p
	} else if p := l.matchFloat(at); p >= 0 {
		typ, end = tokFloat, p
	} else if p := l.matchInteger(at); p >= 0 {
		typ, end = tokInteger, p
	} else if p := l.matchName(at); p >= 0 {
		typ, end = tokName, p
	} else if p := l.matchString(at); p >= 0 {
		typ, end = tokString, p
	} else {
		for _, o := range operatorList {
			if l.has(at, o.op) {
				typ, end = tokOperator, at+len([]rune(o.op))
				break
			}
		}
	}
	if end < 0 {
		if at >= len(l.src) {
			l.done = true
			return
		}
		l.fail("unexpected char " + pystr.Repr(string(l.src[at])) + " at " + strconv.Itoa(at))
	}
	data = l.text(at, end)
	if typ == tokOperator {
		switch data {
		case "{":
			l.balancing = append(l.balancing, '}')
		case "(":
			l.balancing = append(l.balancing, ')')
		case "[":
			l.balancing = append(l.balancing, ']')
		case "}", ")", "]":
			if len(l.balancing) == 0 {
				l.fail("unexpected '" + data + "'")
			}
			expected := l.balancing[len(l.balancing)-1]
			l.balancing = l.balancing[:len(l.balancing)-1]
			if string(expected) != data {
				l.fail("unexpected '" + data + "', expected '" + string(expected) + "'")
			}
		}
	}
	l.emit(typ, data)
	l.lineno += countNL(data)
	l.pos = end
}

// wrap is Lexer.wrap: it drops the tokens the parser ignores and converts
// values. Like the lexer it panics with the TemplateSyntaxError.
func wrapToken(t rawToken) (token, bool) {
	switch t.typ {
	case tokCommentBegin, tokComment, tokCommentEnd, tokWhitespace, tokRawBegin, tokRawEnd:
		return token{}, false
	case tokName:
		if !pystr.IsIdentifier(t.data) {
			panic(&Error{Type: "TemplateSyntaxError", Message: "Invalid character in identifier", Lineno: t.lineno})
		}
		return token{t.lineno, tokName, t.data}, true
	case tokString:
		r := []rune(t.data)
		v, msg := unicodeEscape(string(r[1 : len(r)-1]))
		if msg != "" {
			panic(&Error{Type: "TemplateSyntaxError", Message: msg, Lineno: t.lineno})
		}
		return token{t.lineno, tokString, v}, true
	case tokInteger:
		return token{t.lineno, tokInteger, parseIntLiteral(strings.ReplaceAll(t.data, "_", ""))}, true
	case tokFloat:
		f, err := strconv.ParseFloat(asciiDigits(strings.ReplaceAll(t.data, "_", "")), 64)
		if err != nil && !strings.Contains(err.Error(), "range") {
			panic(&Error{Type: "SyntaxError", Message: "invalid decimal literal", Lineno: t.lineno})
		}
		return token{t.lineno, tokFloat, f}, true
	case tokOperator:
		for _, o := range operatorList {
			if o.op == t.data {
				return token{t.lineno, o.typ, t.data}, true
			}
		}
	}
	return token{t.lineno, t.typ, t.data}, true
}

// digitValue is the value of a decimal digit of any script: Unicode lays
// each set of ten out in order from its zero.
func digitValue(r rune) int {
	z := r
	for z > 0 && unicode.IsDigit(z-1) {
		z--
	}
	return int(r-z) % 10
}

func asciiDigits(s string) string {
	var b strings.Builder
	for _, r := range s {
		if r > 0x7f && unicode.IsDigit(r) {
			b.WriteByte(byte('0' + digitValue(r)))
		} else {
			b.WriteRune(r)
		}
	}
	return b.String()
}

// parseIntLiteral is int(s, 0) for what integer_re matched.
func parseIntLiteral(s string) any {
	s = asciiDigits(s)
	base := 10
	if len(s) > 1 && s[0] == '0' {
		switch s[1] {
		case 'b', 'B':
			base, s = 2, s[2:]
		case 'o', 'O':
			base, s = 8, s[2:]
		case 'x', 'X':
			base, s = 16, s[2:]
		}
	}
	if v, err := strconv.ParseInt(s, base, 64); err == nil {
		return v
	}
	b, _ := new(big.Int).SetString(s, base)
	return b
}

// unicodeEscape is value.encode("ascii", "backslashreplace")
// .decode("unicode-escape"), returning the message of the decode error
// as the lexer reports it.
func unicodeEscape(s string) (string, string) {
	var ascii strings.Builder
	for _, r := range s {
		switch {
		case r < 0x80:
			ascii.WriteRune(r)
		case r < 0x100:
			ascii.WriteString(`\x` + strconv.FormatInt(int64(r)|0x100, 16)[1:])
		case r < 0x10000:
			ascii.WriteString(`\u` + strconv.FormatInt(int64(r)|0x10000, 16)[1:])
		default:
			ascii.WriteString(`\U` + strconv.FormatInt(int64(r)|0x100000000, 16)[1:])
		}
	}
	b := ascii.String()
	var out strings.Builder
	isHex := func(c byte) bool { return c >= '0' && c <= '9' || c >= 'a' && c <= 'f' || c >= 'A' && c <= 'F' }
	for i := 0; i < len(b); i++ {
		c := b[i]
		if c != '\\' {
			out.WriteByte(c)
			continue
		}
		i++
		if i >= len(b) {
			return "", `\ at end of string`
		}
		c = b[i]
		switch c {
		case '\n':
		case '\\', '\'', '"':
			out.WriteByte(c)
		case 'a':
			out.WriteByte('\a')
		case 'b':
			out.WriteByte('\b')
		case 'f':
			out.WriteByte('\f')
		case 't':
			out.WriteByte('\t')
		case 'n':
			out.WriteByte('\n')
		case 'r':
			out.WriteByte('\r')
		case 'v':
			out.WriteByte('\v')
		case '0', '1', '2', '3', '4', '5', '6', '7':
			v := int(c - '0')
			for k := 0; k < 2 && i+1 < len(b) && b[i+1] >= '0' && b[i+1] <= '7'; k++ {
				i++
				v = v*8 + int(b[i]-'0')
			}
			out.WriteRune(rune(v))
		case 'x', 'u', 'U':
			n := map[byte]int{'x': 2, 'u': 4, 'U': 8}[c]
			msg := map[byte]string{'x': `truncated \xXX escape`, 'u': `truncated \uXXXX escape`, 'U': `truncated \UXXXXXXXX escape`}[c]
			for k := 1; k <= n; k++ {
				if i+k >= len(b) || !isHex(b[i+k]) {
					return "", msg
				}
			}
			v, _ := strconv.ParseInt(b[i+1:i+1+n], 16, 64)
			if v > unicode.MaxRune {
				return "", "illegal Unicode character"
			}
			out.WriteRune(rune(v))
			i += n
		case 'N':
			if i+1 >= len(b) || b[i+1] != '{' {
				return "", `malformed \N character escape`
			}
			end := strings.IndexByte(b[i+2:], '}')
			if end <= 0 {
				return "", `malformed \N character escape`
			}
			name := b[i+2 : i+2+end]
			r, ok := pystr.LookupName(name)
			if !ok {
				return "", "unknown Unicode character name"
			}
			out.WriteRune(r)
			i += 2 + end
		default:
			out.WriteByte('\\')
			out.WriteByte(c)
		}
	}
	return out.String(), ""
}

// tokenStream is lexer.TokenStream over the wrapped tokens.
type tokenStream struct {
	lex     *lexer
	pushed  []token
	current token
}

func newTokenStream(source string) *tokenStream {
	s := &tokenStream{lex: newLexer(source), current: token{1, tokInitial, ""}}
	s.next()
	return s
}

// pull is next(self._iter): the next wrapped token, false at the end.
func (s *tokenStream) pull() (token, bool) {
	for {
		rt, ok := s.lex.next()
		if !ok {
			return token{}, false
		}
		if t, keep := wrapToken(rt); keep {
			return t, true
		}
	}
}

// next is __next__: it advances and returns the token it leaves.
func (s *tokenStream) next() token {
	rv := s.current
	if len(s.pushed) > 0 {
		s.current = s.pushed[0]
		s.pushed = s.pushed[1:]
	} else if s.current.typ != tokEOF {
		if t, ok := s.pull(); ok {
			s.current = t
		} else {
			s.current = token{s.current.lineno, tokEOF, ""}
		}
	}
	return rv
}

func (s *tokenStream) more() bool { return len(s.pushed) > 0 || s.current.typ != tokEOF }

func (s *tokenStream) push(t token) { s.pushed = append(s.pushed, t) }

func (s *tokenStream) look() token {
	old := s.next()
	result := s.current
	s.push(result)
	s.current = old
	return result
}

func (s *tokenStream) skip(n int) {
	for range n {
		s.next()
	}
}

func (s *tokenStream) skipIf(expr string) bool {
	if s.current.test(expr) {
		s.next()
		return true
	}
	return false
}

func (s *tokenStream) expect(expr string) token {
	if !s.current.test(expr) {
		desc := describeTokenExpr(expr)
		if s.current.typ == tokEOF {
			panic(&Error{Type: "TemplateSyntaxError", Message: "unexpected end of template, expected " + pystr.Repr(desc) + ".", Lineno: s.current.lineno})
		}
		panic(&Error{Type: "TemplateSyntaxError", Message: "expected token " + pystr.Repr(desc) + ", got " + pystr.Repr(describeToken(s.current)), Lineno: s.current.lineno})
	}
	return s.next()
}
