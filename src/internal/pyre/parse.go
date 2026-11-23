package pyre

// A port of CPython 3.14's re/_parser.py (str patterns only): the same
// checks in the same order, so a pattern is refused with re.error's own
// message and position. The SubPattern optimizations that only reshape the
// tree (common branch prefixes, branches folded into sets, unpacked
// non-capturing groups) are left out: they change neither the errors nor
// what the pattern matches.

import (
	"strconv"
	"strings"

	"github.com/ctrliq/ascender/internal/pystr"
)

type opcode int

const (
	opLiteral opcode = iota + 1
	opNotLiteral
	opAny
	opIn
	opRange
	opCategory
	opNegate
	opAt
	opBranch
	opSubpattern
	opAtomicGroup
	opMaxRepeat
	opMinRepeat
	opPossessiveRepeat
	opGroupref
	opGrouprefExists
	opAssert
	opAssertNot
	opFailure
)

// AT and CATEGORY codes.
const (
	atBeginning = iota + 1
	atBeginningString
	atBoundary
	atNonBoundary
	atEnd
	atEndString

	catDigit
	catNotDigit
	catSpace
	catNotSpace
	catWord
	catNotWord
)

const (
	maxRepeat = 4294967295 // _sre.MAXREPEAT
	maxGroups = 1073741823 // _sre.MAXGROUPS
	maxCode   = 4294967295 // _compiler.MAXCODE
	// maxWidth stands in for _parser.MAXWIDTH (1 << 64): widths saturate
	// at it, and only their equality and size against maxCode are used.
	maxWidth uint64 = 1 << 63
)

type node struct {
	op       opcode
	arg      int64 // literal code point, AT/CATEGORY code, group id, repeat min, range lo
	arg2     int64 // repeat max, range hi
	set      []*node
	sub      *subPattern // SUBPATTERN, ATOMIC_GROUP, repeated item, assertion body
	group    int         // SUBPATTERN's group, 0 for none
	addFlags Flags
	delFlags Flags
	dir      int // assertion direction: 1 ahead, -1 behind
	branches []*subPattern
	yes, no  *subPattern
}

type subPattern struct {
	state *parseState
	data  []*node
	width *[2]uint64
}

func (p *subPattern) getwidth() (uint64, uint64) {
	if p.width != nil {
		return p.width[0], p.width[1]
	}
	var lo, hi uint64
	for _, n := range p.data {
		switch n.op {
		case opBranch:
			i, j := maxWidth, uint64(0)
			for _, b := range n.branches {
				l, h := b.getwidth()
				i, j = min(i, l), max(j, h)
			}
			lo, hi = satAdd(lo, i), satAdd(hi, j)
		case opAtomicGroup, opSubpattern:
			i, j := n.sub.getwidth()
			lo, hi = satAdd(lo, i), satAdd(hi, j)
		case opMaxRepeat, opMinRepeat, opPossessiveRepeat:
			i, j := n.sub.getwidth()
			lo = satAdd(lo, satMul(i, uint64(n.arg)))
			if n.arg2 == maxRepeat && j != 0 {
				hi = maxWidth
			} else {
				hi = satAdd(hi, satMul(j, uint64(n.arg2)))
			}
		case opAny, opRange, opIn, opLiteral, opNotLiteral, opCategory:
			lo, hi = satAdd(lo, 1), satAdd(hi, 1)
		case opGroupref:
			w := p.state.groupwidths[n.arg]
			lo, hi = satAdd(lo, w[0]), satAdd(hi, w[1])
		case opGrouprefExists:
			i, j := n.yes.getwidth()
			if n.no != nil {
				l, h := n.no.getwidth()
				i, j = min(i, l), max(j, h)
			} else {
				i = 0
			}
			lo, hi = satAdd(lo, i), satAdd(hi, j)
		}
	}
	p.width = &[2]uint64{min(lo, maxWidth), min(hi, maxWidth)}
	return p.width[0], p.width[1]
}

func satAdd(a, b uint64) uint64 {
	if a >= maxWidth || b >= maxWidth || a+b >= maxWidth {
		return maxWidth
	}
	return a + b
}

func satMul(a, b uint64) uint64 {
	if a == 0 || b == 0 {
		return 0
	}
	if a >= maxWidth || b >= maxWidth || a > maxWidth/b {
		return maxWidth
	}
	return a * b
}

type parseState struct {
	flags           Flags
	groupdict       map[string]int
	groupwidths     []*[2]uint64 // nil while the group is open
	lookbehindgroup int          // -1: not inside a lookbehind
	grouprefpos     []grouprefPos
}

type grouprefPos struct {
	group int64
	pos   int
}

func (s *parseState) groups() int { return len(s.groupwidths) }

func (s *parseState) opengroup(name string, named bool) (int, string) {
	gid := s.groups()
	s.groupwidths = append(s.groupwidths, nil)
	if s.groups() > maxGroups {
		return 0, "too many groups"
	}
	if named {
		if ogid, ok := s.groupdict[name]; ok {
			return 0, "redefinition of group name " + pystr.Repr(name) + " as group " + strconv.Itoa(gid) + "; was group " + strconv.Itoa(ogid)
		}
		s.groupdict[name] = gid
	}
	return gid, ""
}

func (s *parseState) closegroup(gid int, p *subPattern) {
	lo, hi := p.getwidth()
	s.groupwidths[gid] = &[2]uint64{lo, hi}
}

func (s *parseState) checkgroup(gid int64) bool {
	return gid < int64(s.groups()) && s.groupwidths[gid] != nil
}

func (s *parseState) checklookbehindgroup(gid int64, src *tokenizer) error {
	if s.lookbehindgroup >= 0 {
		if !s.checkgroup(gid) {
			return src.error("cannot refer to an open group", 0)
		}
		if gid >= int64(s.lookbehindgroup) {
			return src.error("cannot refer to group defined in the same lookbehind subpattern", 0)
		}
	}
	return nil
}

// tokenizer walks the pattern a code point at a time, an escape and the
// character after it making one token. next is "" at the end.
type tokenizer struct {
	pattern string
	runes   []rune
	index   int
	next    string
	nextLen int
	// consumedGlobalFlags tells parseSeq that the group it just read was
	// "(?flags)", so it rereads the verbose flag.
	consumedGlobalFlags bool
}

func newTokenizer(pattern string) (*tokenizer, error) {
	t := &tokenizer{pattern: pattern, runes: []rune(pattern)}
	return t, t.advance()
}

func (t *tokenizer) advance() error {
	index := t.index
	if index >= len(t.runes) {
		t.next, t.nextLen = "", 0
		return nil
	}
	char := string(t.runes[index])
	n := 1
	if t.runes[index] == '\\' {
		index++
		if index >= len(t.runes) {
			return &Error{Msg: "bad escape (end of pattern)", Pattern: t.pattern, Pos: len(t.runes) - 1}
		}
		char += string(t.runes[index])
		n = 2
	}
	t.index = index + 1
	t.next, t.nextLen = char, n
	return nil
}

func (t *tokenizer) match(char string) (bool, error) {
	if t.next != "" && char == t.next {
		return true, t.advance()
	}
	return false, nil
}

func (t *tokenizer) get() (string, error) {
	this := t.next
	return this, t.advance()
}

func (t *tokenizer) getwhile(n int, charset string) (string, error) {
	result := ""
	for range n {
		c := t.next
		if !inSet(c, charset) {
			break
		}
		result += c
		if err := t.advance(); err != nil {
			return "", err
		}
	}
	return result, nil
}

func (t *tokenizer) getuntil(terminator, name string) (string, error) {
	result := ""
	for {
		c := t.next
		if err := t.advance(); err != nil {
			return "", err
		}
		if c == "" {
			if result == "" {
				return "", t.error("missing "+name, 0)
			}
			return "", t.error("missing "+terminator+", unterminated name", runeLen(result))
		}
		if c == terminator {
			if result == "" {
				return "", t.error("missing "+name, 1)
			}
			break
		}
		result += c
	}
	return result, nil
}

func (t *tokenizer) tell() int { return t.index - t.nextLen }

func (t *tokenizer) seek(index int) error {
	t.index = index
	return t.advance()
}

func (t *tokenizer) error(msg string, offset int) error {
	return &Error{Msg: msg, Pattern: t.pattern, Pos: t.tell() - offset}
}

func (t *tokenizer) checkgroupname(name string, offset int) error {
	if !pystr.IsIdentifier(name) {
		return t.error("bad character in group name "+pystr.Repr(name), runeLen(name)+offset)
	}
	return nil
}

// inSet is Python's "c in frozenset(chars)": a single character token
// among chars.
func inSet(c, chars string) bool {
	return c != "" && runeLen(c) == 1 && strings.Contains(chars, c)
}

func runeLen(s string) int { return len([]rune(s)) }

const (
	specialChars = ".\\[{()*+?^$|"
	repeatChars  = "*+?{"
	digits       = "0123456789"
	octDigits    = "01234567"
	hexDigits    = "0123456789abcdefABCDEF"
	asciiLetters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
	whitespace   = " \t\n\r\v\f"
)

var escapes = map[string]rune{`\a`: '\a', `\b`: '\b', `\f`: '\f', `\n`: '\n', `\r`: '\r', `\t`: '\t', `\v`: '\v', `\\`: '\\'}

// categories maps an escape to its AT code or, for the classes, its
// CATEGORY code (an IN of one CATEGORY in the original).
var categories = map[string]*node{
	`\A`: {op: opAt, arg: atBeginningString},
	`\b`: {op: opAt, arg: atBoundary},
	`\B`: {op: opAt, arg: atNonBoundary},
	`\d`: {op: opCategory, arg: catDigit},
	`\D`: {op: opCategory, arg: catNotDigit},
	`\s`: {op: opCategory, arg: catSpace},
	`\S`: {op: opCategory, arg: catNotSpace},
	`\w`: {op: opCategory, arg: catWord},
	`\W`: {op: opCategory, arg: catNotWord},
	`\z`: {op: opAt, arg: atEndString},
	`\Z`: {op: opAt, arg: atEndString},
}

var flagChars = map[rune]Flags{'i': IgnoreCase, 'L': Locale, 'm': Multiline, 's': DotAll, 'x': Verbose, 'a': ASCII, 'u': Unicode}

const typeFlags = ASCII | Locale | Unicode

func inClass(n *node) *node { return &node{op: opIn, set: []*node{n}} }

// hexEscape reads the digits of \x, \u or \U; ok is false for a code point
// chr() refuses (the ValueError that ends in "bad escape").
func hexEscape(src *tokenizer, escape string, n int) (string, int64, bool, error) {
	more, err := src.getwhile(n, hexDigits)
	if err != nil {
		return "", 0, false, err
	}
	escape += more
	if runeLen(escape) != n+2 {
		return "", 0, false, src.error("incomplete escape "+escape, runeLen(escape))
	}
	v, _ := strconv.ParseInt(escape[2:], 16, 64)
	return escape, v, v <= 0x10FFFF, nil
}

func namedEscape(src *tokenizer) (int64, error) {
	ok, err := src.match("{")
	if err != nil {
		return 0, err
	}
	if !ok {
		return 0, src.error("missing {", 0)
	}
	charname, err := src.getuntil("}", "character name")
	if err != nil {
		return 0, err
	}
	r, found := pystr.LookupName(charname)
	if !found {
		return 0, src.error("undefined character name "+pystr.Repr(charname), runeLen(charname)+len(`\N{}`))
	}
	return int64(r), nil
}

// classEscape is _class_escape: an escape inside a character set.
func classEscape(src *tokenizer, escape string) (*node, error) {
	if c, ok := escapes[escape]; ok {
		return &node{op: opLiteral, arg: int64(c)}, nil
	}
	if code, ok := categories[escape]; ok && code.op == opCategory {
		return inClass(code), nil
	}
	c := string([]rune(escape)[1:])
	switch {
	case c == "x" || c == "u" || c == "U":
		n := map[string]int{"x": 2, "u": 4, "U": 8}[c]
		esc, v, ok, err := hexEscape(src, escape, n)
		if err != nil {
			return nil, err
		}
		if !ok {
			return nil, src.error("bad escape "+esc, runeLen(esc))
		}
		return &node{op: opLiteral, arg: v}, nil
	case c == "N":
		v, err := namedEscape(src)
		if err != nil {
			return nil, err
		}
		return &node{op: opLiteral, arg: v}, nil
	case inSet(c, octDigits):
		more, err := src.getwhile(2, octDigits)
		if err != nil {
			return nil, err
		}
		escape += more
		v, _ := strconv.ParseInt(escape[1:], 8, 64)
		if v > 0o377 {
			return nil, src.error("octal escape value "+escape+" outside of range 0-0o377", runeLen(escape))
		}
		return &node{op: opLiteral, arg: v}, nil
	case inSet(c, digits):
		return nil, src.error("bad escape "+escape, runeLen(escape))
	}
	if runeLen(escape) == 2 {
		if inSet(c, asciiLetters) {
			return nil, src.error("bad escape "+escape, runeLen(escape))
		}
		return &node{op: opLiteral, arg: int64([]rune(escape)[1])}, nil
	}
	return nil, src.error("bad escape "+escape, runeLen(escape))
}

// escape is _escape: an escape outside a character set.
func parseEscape(src *tokenizer, escape string, state *parseState) (*node, error) {
	if code, ok := categories[escape]; ok {
		if code.op == opCategory {
			return inClass(code), nil
		}
		return &node{op: opAt, arg: code.arg}, nil
	}
	if c, ok := escapes[escape]; ok {
		return &node{op: opLiteral, arg: int64(c)}, nil
	}
	c := string([]rune(escape)[1:])
	switch {
	case c == "x" || c == "u" || c == "U":
		n := map[string]int{"x": 2, "u": 4, "U": 8}[c]
		esc, v, ok, err := hexEscape(src, escape, n)
		if err != nil {
			return nil, err
		}
		if !ok {
			return nil, src.error("bad escape "+esc, runeLen(esc))
		}
		return &node{op: opLiteral, arg: v}, nil
	case c == "N":
		v, err := namedEscape(src)
		if err != nil {
			return nil, err
		}
		return &node{op: opLiteral, arg: v}, nil
	case c == "0":
		more, err := src.getwhile(2, octDigits)
		if err != nil {
			return nil, err
		}
		escape += more
		v, _ := strconv.ParseInt(escape[1:], 8, 64)
		return &node{op: opLiteral, arg: v}, nil
	case inSet(c, digits):
		// An octal escape or a decimal group reference.
		if inSet(src.next, digits) {
			d, err := src.get()
			if err != nil {
				return nil, err
			}
			escape += d
			r := []rune(escape)
			if inSet(string(r[1]), octDigits) && inSet(string(r[2]), octDigits) && inSet(src.next, octDigits) {
				d, err := src.get()
				if err != nil {
					return nil, err
				}
				escape += d
				v, _ := strconv.ParseInt(escape[1:], 8, 64)
				if v > 0o377 {
					return nil, src.error("octal escape value "+escape+" outside of range 0-0o377", runeLen(escape))
				}
				return &node{op: opLiteral, arg: v}, nil
			}
		}
		group, _ := strconv.ParseInt(escape[1:], 10, 64)
		if group < int64(state.groups()) {
			if !state.checkgroup(group) {
				return nil, src.error("cannot refer to an open group", runeLen(escape))
			}
			if err := state.checklookbehindgroup(group, src); err != nil {
				return nil, err
			}
			return &node{op: opGroupref, arg: group}, nil
		}
		return nil, src.error("invalid group reference "+strconv.FormatInt(group, 10), runeLen(escape)-1)
	}
	if runeLen(escape) == 2 {
		if inSet(c, asciiLetters) {
			return nil, src.error("bad escape "+escape, runeLen(escape))
		}
		return &node{op: opLiteral, arg: int64([]rune(escape)[1])}, nil
	}
	return nil, src.error("bad escape "+escape, runeLen(escape))
}

// parseSub is _parse_sub: an alternation.
// maxNesting bounds how deeply groups nest. The parser recurses once per
// level, and a Go stack overflow ends the whole process, which no recover
// catches; CPython's own parser stopped at its recursion limit sooner.
const maxNesting = 1000

func parseSub(src *tokenizer, state *parseState, verbose bool, nested int) (*subPattern, error) {
	if nested > maxNesting {
		return nil, src.error("too many nested groups", 0)
	}
	var items []*subPattern
	for {
		item, err := parseSeq(src, state, verbose, nested+1, nested == 0 && len(items) == 0)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
		ok, err := src.match("|")
		if err != nil {
			return nil, err
		}
		if !ok {
			break
		}
		if nested == 0 {
			verbose = state.flags&Verbose != 0
		}
	}
	if len(items) == 1 {
		return items[0], nil
	}
	return &subPattern{state: state, data: []*node{{op: opBranch, branches: items}}}, nil
}

// parseSeq is _parse: a sequence of items up to "|", ")" or the end.
func parseSeq(src *tokenizer, state *parseState, verbose bool, nested int, first bool) (*subPattern, error) {
	// A conditional group's branches reach here without parseSub, so the
	// bound is checked here too.
	if nested > maxNesting {
		return nil, src.error("too many nested groups", 0)
	}
	sp := &subPattern{state: state}
	add := func(n *node) { sp.data = append(sp.data, n) }
	for {
		this := src.next
		if this == "" {
			break
		}
		if this == "|" || this == ")" {
			break
		}
		if err := src.advance(); err != nil {
			return nil, err
		}

		if verbose {
			if inSet(this, whitespace) {
				continue
			}
			if this == "#" {
				for {
					c, err := src.get()
					if err != nil {
						return nil, err
					}
					if c == "" || c == "\n" {
						break
					}
				}
				continue
			}
		}

		switch {
		case this[0] == '\\':
			code, err := parseEscape(src, this, state)
			if err != nil {
				return nil, err
			}
			add(code)

		case !inSet(this, specialChars):
			add(&node{op: opLiteral, arg: int64([]rune(this)[0])})

		case this == "[":
			n, err := parseSet(src)
			if err != nil {
				return nil, err
			}
			add(n)

		case inSet(this, repeatChars):
			here := src.tell()
			var lo, hi int64
			switch this {
			case "?":
				lo, hi = 0, 1
			case "*":
				lo, hi = 0, maxRepeat
			case "+":
				lo, hi = 1, maxRepeat
			case "{":
				if src.next == "}" {
					add(&node{op: opLiteral, arg: '{'})
					continue
				}
				lo, hi = 0, maxRepeat
				los, his := "", ""
				for inSet(src.next, digits) {
					d, err := src.get()
					if err != nil {
						return nil, err
					}
					los += d
				}
				comma, err := src.match(",")
				if err != nil {
					return nil, err
				}
				if comma {
					for inSet(src.next, digits) {
						d, err := src.get()
						if err != nil {
							return nil, err
						}
						his += d
					}
				} else {
					his = los
				}
				closed, err := src.match("}")
				if err != nil {
					return nil, err
				}
				if !closed {
					add(&node{op: opLiteral, arg: '{'})
					if err := src.seek(here); err != nil {
						return nil, err
					}
					continue
				}
				if los != "" {
					v, ok := parseRepeatCount(los)
					if !ok {
						return nil, &OverflowError{Msg: "the repetition number is too large"}
					}
					lo = v
				}
				if his != "" {
					v, ok := parseRepeatCount(his)
					if !ok {
						return nil, &OverflowError{Msg: "the repetition number is too large"}
					}
					hi = v
					if hi < lo {
						return nil, src.error("min repeat greater than max repeat", src.tell()-here)
					}
				}
			}
			var last *node
			if len(sp.data) > 0 {
				last = sp.data[len(sp.data)-1]
			}
			if last == nil || last.op == opAt {
				return nil, src.error("nothing to repeat", src.tell()-here+runeLen(this))
			}
			if last.op == opMaxRepeat || last.op == opMinRepeat || last.op == opPossessiveRepeat {
				return nil, src.error("multiple repeat", src.tell()-here+runeLen(this))
			}
			item := &subPattern{state: state, data: []*node{last}}
			if last.op == opSubpattern && last.group == 0 && last.addFlags == 0 && last.delFlags == 0 {
				item = last.sub
			}
			op := opMaxRepeat
			if ok, err := src.match("?"); err != nil {
				return nil, err
			} else if ok {
				op = opMinRepeat
			} else if ok, err := src.match("+"); err != nil {
				return nil, err
			} else if ok {
				op = opPossessiveRepeat
			}
			sp.data[len(sp.data)-1] = &node{op: op, arg: lo, arg2: hi, sub: item}

		case this == ".":
			add(&node{op: opAny})

		case this == "(":
			n, err := parseGroup(src, state, verbose, nested, first, sp)
			if err != nil {
				return nil, err
			}
			if n != nil {
				add(n)
			} else if src.consumedGlobalFlags {
				src.consumedGlobalFlags = false
				verbose = state.flags&Verbose != 0
			}

		case this == "^":
			add(&node{op: opAt, arg: atBeginning})

		case this == "$":
			add(&node{op: opAt, arg: atEnd})
		}
	}
	return sp, nil
}

// parseRepeatCount reads a repeat bound, false when it reaches MAXREPEAT.
func parseRepeatCount(s string) (int64, bool) {
	s = strings.TrimLeft(s, "0")
	if s == "" {
		return 0, true
	}
	if len(s) > 10 {
		return 0, false
	}
	v, _ := strconv.ParseInt(s, 10, 64)
	return v, v < maxRepeat
}

// parseSet reads a character set after its "[".
func parseSet(src *tokenizer) (*node, error) {
	here := src.tell() - 1
	var set []*node
	negate, err := src.match("^")
	if err != nil {
		return nil, err
	}
	for {
		this, err := src.get()
		if err != nil {
			return nil, err
		}
		if this == "" {
			return nil, src.error("unterminated character set", src.tell()-here)
		}
		if this == "]" && len(set) > 0 {
			break
		}
		var code1 *node
		if this[0] == '\\' {
			if code1, err = classEscape(src, this); err != nil {
				return nil, err
			}
		} else {
			code1 = &node{op: opLiteral, arg: int64([]rune(this)[0])}
		}
		dash, err := src.match("-")
		if err != nil {
			return nil, err
		}
		if !dash {
			if code1.op == opIn {
				code1 = code1.set[0]
			}
			set = append(set, code1)
			continue
		}
		that, err := src.get()
		if err != nil {
			return nil, err
		}
		if that == "" {
			return nil, src.error("unterminated character set", src.tell()-here)
		}
		if that == "]" {
			if code1.op == opIn {
				code1 = code1.set[0]
			}
			set = append(set, code1, &node{op: opLiteral, arg: '-'})
			break
		}
		var code2 *node
		if that[0] == '\\' {
			if code2, err = classEscape(src, that); err != nil {
				return nil, err
			}
		} else {
			code2 = &node{op: opLiteral, arg: int64([]rune(that)[0])}
		}
		if code1.op != opLiteral || code2.op != opLiteral || code2.arg < code1.arg {
			return nil, src.error("bad character range "+this+"-"+that, runeLen(this)+1+runeLen(that))
		}
		set = append(set, &node{op: opRange, arg: code1.arg, arg2: code2.arg})
	}
	if len(set) == 1 && set[0].op == opLiteral {
		if negate {
			return &node{op: opNotLiteral, arg: set[0].arg}, nil
		}
		return set[0], nil
	}
	if negate {
		set = append([]*node{{op: opNegate}}, set...)
	}
	return &node{op: opIn, set: set}, nil
}

// parseGroup reads what follows a "(". It returns nil for a construct that
// adds nothing (a comment, or global flags, which it marks on src).
func parseGroup(src *tokenizer, state *parseState, verbose bool, nested int, first bool, sp *subPattern) (*node, error) {
	start := src.tell() - 1
	capture, atomic := true, false
	name, named := "", false
	var addFlags, delFlags Flags
	ok, err := src.match("?")
	if err != nil {
		return nil, err
	}
	if ok {
		char, err := src.get()
		if err != nil {
			return nil, err
		}
		if char == "" {
			return nil, src.error("unexpected end of pattern", 0)
		}
		switch {
		case char == "P":
			if ok, err := src.match("<"); err != nil {
				return nil, err
			} else if ok {
				if name, err = src.getuntil(">", "group name"); err != nil {
					return nil, err
				}
				if err := src.checkgroupname(name, 1); err != nil {
					return nil, err
				}
				named = true
			} else if ok, err := src.match("="); err != nil {
				return nil, err
			} else if ok {
				name, err := src.getuntil(")", "group name")
				if err != nil {
					return nil, err
				}
				if err := src.checkgroupname(name, 1); err != nil {
					return nil, err
				}
				gid, found := state.groupdict[name]
				if !found {
					return nil, src.error("unknown group name "+pystr.Repr(name), runeLen(name)+1)
				}
				if !state.checkgroup(int64(gid)) {
					return nil, src.error("cannot refer to an open group", runeLen(name)+1)
				}
				if err := state.checklookbehindgroup(int64(gid), src); err != nil {
					return nil, err
				}
				return &node{op: opGroupref, arg: int64(gid)}, nil
			} else {
				char, err := src.get()
				if err != nil {
					return nil, err
				}
				if char == "" {
					return nil, src.error("unexpected end of pattern", 0)
				}
				return nil, src.error("unknown extension ?P"+char, runeLen(char)+2)
			}
		case char == ":":
			capture = false
		case char == "#":
			for {
				if src.next == "" {
					return nil, src.error("missing ), unterminated comment", src.tell()-start)
				}
				c, err := src.get()
				if err != nil {
					return nil, err
				}
				if c == ")" {
					break
				}
			}
			return nil, nil
		case char == "=" || char == "!" || char == "<":
			dir := 1
			outerLookbehind := state.lookbehindgroup
			if char == "<" {
				if char, err = src.get(); err != nil {
					return nil, err
				}
				if char == "" {
					return nil, src.error("unexpected end of pattern", 0)
				}
				if char != "=" && char != "!" {
					return nil, src.error("unknown extension ?<"+char, runeLen(char)+2)
				}
				dir = -1
				if outerLookbehind < 0 {
					state.lookbehindgroup = state.groups()
				}
			}
			p, err := parseSub(src, state, verbose, nested+1)
			if err != nil {
				return nil, err
			}
			if dir < 0 && outerLookbehind < 0 {
				state.lookbehindgroup = -1
			}
			if ok, err := src.match(")"); err != nil {
				return nil, err
			} else if !ok {
				return nil, src.error("missing ), unterminated subpattern", src.tell()-start)
			}
			switch {
			case char == "=":
				return &node{op: opAssert, dir: dir, sub: p}, nil
			case len(p.data) > 0:
				return &node{op: opAssertNot, dir: dir, sub: p}, nil
			default:
				return &node{op: opFailure}, nil
			}
		case char == "(":
			condname, err := src.getuntil(")", "group name")
			if err != nil {
				return nil, err
			}
			var condgroup int64
			if !isASCIIDecimal(condname) {
				if err := src.checkgroupname(condname, 1); err != nil {
					return nil, err
				}
				gid, found := state.groupdict[condname]
				if !found {
					return nil, src.error("unknown group name "+pystr.Repr(condname), runeLen(condname)+1)
				}
				condgroup = int64(gid)
			} else {
				trimmed := strings.TrimLeft(condname, "0")
				if trimmed == "" {
					return nil, src.error("bad group number", runeLen(condname)+1)
				}
				if len(trimmed) > 10 {
					condgroup = maxGroups
				} else {
					condgroup, _ = strconv.ParseInt(trimmed, 10, 64)
				}
				if condgroup >= maxGroups {
					return nil, src.error("invalid group reference "+trimmed, runeLen(condname)+1)
				}
				seen := false
				for _, g := range state.grouprefpos {
					if g.group == condgroup {
						seen = true
					}
				}
				if !seen {
					state.grouprefpos = append(state.grouprefpos, grouprefPos{condgroup, src.tell() - runeLen(condname) - 1})
				}
			}
			if err := state.checklookbehindgroup(condgroup, src); err != nil {
				return nil, err
			}
			yes, err := parseSeq(src, state, verbose, nested+1, false)
			if err != nil {
				return nil, err
			}
			var no *subPattern
			if ok, err := src.match("|"); err != nil {
				return nil, err
			} else if ok {
				if no, err = parseSeq(src, state, verbose, nested+1, false); err != nil {
					return nil, err
				}
				if src.next == "|" {
					return nil, src.error("conditional backref with more than two branches", 0)
				}
			}
			if ok, err := src.match(")"); err != nil {
				return nil, err
			} else if !ok {
				return nil, src.error("missing ), unterminated subpattern", src.tell()-start)
			}
			return &node{op: opGrouprefExists, arg: condgroup, yes: yes, no: no}, nil
		case char == ">":
			capture, atomic = false, true
		case char == "-" || (runeLen(char) == 1 && flagChars[[]rune(char)[0]] != 0):
			add, del, global, err := parseFlags(src, state, char)
			if err != nil {
				return nil, err
			}
			if global {
				if !first || len(sp.data) > 0 {
					return nil, src.error("global flags not at the start of the expression", src.tell()-start)
				}
				src.consumedGlobalFlags = true
				return nil, nil
			}
			addFlags, delFlags = add, del
			capture = false
		default:
			return nil, src.error("unknown extension ?"+char, runeLen(char)+1)
		}
	}

	group := 0
	if capture {
		gid, msg := state.opengroup(name, named)
		if msg != "" {
			return nil, src.error(msg, runeLen(name)+1)
		}
		group = gid
	}
	subVerbose := (verbose || addFlags&Verbose != 0) && delFlags&Verbose == 0
	p, err := parseSub(src, state, subVerbose, nested+1)
	if err != nil {
		return nil, err
	}
	if ok, err := src.match(")"); err != nil {
		return nil, err
	} else if !ok {
		return nil, src.error("missing ), unterminated subpattern", src.tell()-start)
	}
	if group != 0 {
		state.closegroup(group, p)
	}
	if atomic {
		return &node{op: opAtomicGroup, sub: p}, nil
	}
	return &node{op: opSubpattern, group: group, addFlags: addFlags, delFlags: delFlags, sub: p}, nil
}

func isASCIIDecimal(s string) bool {
	if s == "" {
		return false
	}
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

// parseFlags is _parse_flags; global is true for "(?flags)".
func parseFlags(src *tokenizer, state *parseState, char string) (Flags, Flags, bool, error) {
	var add, del Flags
	isFlag := func(c string) bool { return runeLen(c) == 1 && flagChars[[]rune(c)[0]] != 0 }
	isAlpha := func(c string) bool {
		r := []rune(c)
		return len(r) > 0 && pystr.IsAlpha(r)
	}
	var err error
	if char != "-" {
		for {
			flag := flagChars[[]rune(char)[0]]
			if char == "L" {
				return 0, 0, false, src.error("bad inline flags: cannot use 'L' flag with a str pattern", 0)
			}
			add |= flag
			if flag&typeFlags != 0 && add&typeFlags != flag {
				return 0, 0, false, src.error("bad inline flags: flags 'a', 'u' and 'L' are incompatible", 0)
			}
			if char, err = src.get(); err != nil {
				return 0, 0, false, err
			}
			if char == "" {
				return 0, 0, false, src.error("missing -, : or )", 0)
			}
			if char == ")" || char == "-" || char == ":" {
				break
			}
			if !isFlag(char) {
				msg := "missing -, : or )"
				if isAlpha(char) {
					msg = "unknown flag"
				}
				return 0, 0, false, src.error(msg, runeLen(char))
			}
		}
	}
	if char == ")" {
		state.flags |= add
		return 0, 0, true, nil
	}
	if char == "-" {
		if char, err = src.get(); err != nil {
			return 0, 0, false, err
		}
		if char == "" {
			return 0, 0, false, src.error("missing flag", 0)
		}
		if !isFlag(char) {
			msg := "missing flag"
			if isAlpha(char) {
				msg = "unknown flag"
			}
			return 0, 0, false, src.error(msg, runeLen(char))
		}
		for {
			flag := flagChars[[]rune(char)[0]]
			if flag&typeFlags != 0 {
				return 0, 0, false, src.error("bad inline flags: cannot turn off flags 'a', 'u' and 'L'", 0)
			}
			del |= flag
			if char, err = src.get(); err != nil {
				return 0, 0, false, err
			}
			if char == "" {
				return 0, 0, false, src.error("missing :", 0)
			}
			if char == ":" {
				break
			}
			if !isFlag(char) {
				msg := "missing :"
				if isAlpha(char) {
					msg = "unknown flag"
				}
				return 0, 0, false, src.error(msg, runeLen(char))
			}
		}
	}
	if add&del != 0 {
		return 0, 0, false, src.error("bad inline flags: flag turned on and off", 1)
	}
	return add, del, false, nil
}

// parse is _parser.parse followed by the compiler's look-behind checks.
func parse(pattern string, flags Flags) (*subPattern, error) {
	src, err := newTokenizer(pattern)
	if err != nil {
		return nil, err
	}
	state := &parseState{flags: flags, groupdict: map[string]int{}, groupwidths: []*[2]uint64{nil}, lookbehindgroup: -1}
	p, err := parseSub(src, state, flags&Verbose != 0, 0)
	if err != nil {
		return nil, err
	}
	// fix_flags
	if state.flags&Locale != 0 {
		return nil, &ValueError{Msg: "cannot use LOCALE flag with a str pattern"}
	}
	if state.flags&ASCII == 0 {
		state.flags |= Unicode
	} else if state.flags&Unicode != 0 {
		return nil, &ValueError{Msg: "ASCII and UNICODE flags are incompatible"}
	}
	if src.next != "" {
		return nil, src.error("unbalanced parenthesis", 0)
	}
	for _, g := range state.grouprefpos {
		if g.group >= int64(state.groups()) {
			return nil, &Error{Msg: "invalid group reference " + strconv.FormatInt(g.group, 10), Pattern: pattern, Pos: g.pos}
		}
	}
	if err := checkLookbehinds(p); err != nil {
		return nil, err
	}
	return p, nil
}

// checkLookbehinds walks the tree in the compiler's order for its errors:
// a look-behind must have a fixed width.
func checkLookbehinds(p *subPattern) error {
	if p == nil {
		return nil
	}
	for _, n := range p.data {
		switch n.op {
		case opAssert, opAssertNot:
			if n.dir < 0 {
				lo, hi := n.sub.getwidth()
				if lo > maxCode {
					return &Error{Msg: "looks too much behind", Pos: -1}
				}
				if lo != hi {
					return &Error{Msg: "look-behind requires fixed-width pattern", Pos: -1}
				}
			}
			if err := checkLookbehinds(n.sub); err != nil {
				return err
			}
		case opMaxRepeat, opMinRepeat, opPossessiveRepeat, opSubpattern, opAtomicGroup:
			if err := checkLookbehinds(n.sub); err != nil {
				return err
			}
		case opBranch:
			for _, b := range n.branches {
				if err := checkLookbehinds(b); err != nil {
					return err
				}
			}
		case opGrouprefExists:
			if err := checkLookbehinds(n.yes); err != nil {
				return err
			}
			if err := checkLookbehinds(n.no); err != nil {
				return err
			}
		}
	}
	return nil
}
