package pyre

// translate writes a parsed pattern in regexp2's (.NET) syntax. Python's
// own definitions are spelled out where .NET's differ: \w, \s and \d (and
// \b, \B built on \w) per the ASCII flag in effect, capturing groups named
// by their Python number (.NET numbers named groups after unnamed ones),
// possessive repeats as atomic groups. regexp2's MULTILINE, DOTALL and
// IGNORECASE behave as Python's, so those flags are passed through.

import (
	"fmt"
	"math"
	"strings"
)

type translator struct {
	b strings.Builder
}

func translate(p *subPattern, ascii bool) string {
	t := &translator{}
	t.seq(p, ascii)
	return t.b.String()
}

func (t *translator) seq(p *subPattern, ascii bool) {
	for _, n := range p.data {
		t.node(n, ascii)
	}
}

func (t *translator) group(p *subPattern, ascii bool) {
	t.b.WriteString("(?:")
	t.seq(p, ascii)
	t.b.WriteString(")")
}

func (t *translator) node(n *node, ascii bool) {
	switch n.op {
	case opLiteral:
		t.b.WriteString(literal(rune(n.arg), false))
	case opNotLiteral:
		t.b.WriteString("[^" + literal(rune(n.arg), true) + "]")
	case opAny:
		t.b.WriteString(".")
	case opIn:
		t.b.WriteString(charSet(n.set, ascii))
	case opAt:
		t.b.WriteString(at(int(n.arg), ascii))
	case opBranch:
		t.b.WriteString("(?:")
		for i, br := range n.branches {
			if i > 0 {
				t.b.WriteString("|")
			}
			t.seq(br, ascii)
		}
		t.b.WriteString(")")
	case opSubpattern:
		inner := ascii
		if n.addFlags&ASCII != 0 {
			inner = true
		} else if n.addFlags&Unicode != 0 {
			inner = false
		}
		on, off := inlineFlags(n.addFlags), inlineFlags(n.delFlags)
		if on != "" || off != "" {
			if off != "" {
				off = "-" + off
			}
			t.b.WriteString("(?" + on + off + ":")
		}
		if n.group != 0 {
			fmt.Fprintf(&t.b, "(?<g%d>", n.group)
			t.seq(n.sub, inner)
			t.b.WriteString(")")
		} else {
			t.group(n.sub, inner)
		}
		if on != "" || off != "" {
			t.b.WriteString(")")
		}
	case opAtomicGroup:
		t.b.WriteString("(?>")
		t.seq(n.sub, ascii)
		t.b.WriteString(")")
	case opMaxRepeat, opMinRepeat, opPossessiveRepeat:
		if n.arg > math.MaxInt32 {
			// More repetitions than any string regexp2 can hold.
			t.b.WriteString("(?!)")
			return
		}
		var q string
		hi := n.arg2
		if hi > math.MaxInt32 {
			hi = maxRepeat
		}
		switch {
		case n.arg == 0 && hi == maxRepeat:
			q = "*"
		case n.arg == 1 && hi == maxRepeat:
			q = "+"
		case n.arg == 0 && hi == 1:
			q = "?"
		case hi == maxRepeat:
			q = fmt.Sprintf("{%d,}", n.arg)
		case n.arg == hi:
			q = fmt.Sprintf("{%d}", n.arg)
		default:
			q = fmt.Sprintf("{%d,%d}", n.arg, hi)
		}
		if n.op == opMinRepeat {
			q += "?"
		}
		if n.op == opPossessiveRepeat {
			t.b.WriteString("(?>")
		}
		t.group(n.sub, ascii)
		t.b.WriteString(q)
		if n.op == opPossessiveRepeat {
			t.b.WriteString(")")
		}
	case opGroupref:
		fmt.Fprintf(&t.b, `\k<g%d>`, n.arg)
	case opGrouprefExists:
		fmt.Fprintf(&t.b, "(?(g%d)", n.arg)
		t.seq(n.yes, ascii)
		if n.no != nil {
			t.b.WriteString("|")
			t.seq(n.no, ascii)
		}
		t.b.WriteString(")")
	case opAssert, opAssertNot:
		open := map[[2]bool]string{{true, true}: "(?=", {true, false}: "(?!", {false, true}: "(?<=", {false, false}: "(?<!"}[[2]bool{n.dir > 0, n.op == opAssert}]
		t.b.WriteString(open)
		t.seq(n.sub, ascii)
		t.b.WriteString(")")
	case opFailure:
		t.b.WriteString("(?!)")
	}
}

// inlineFlags spells the scoped flags regexp2 understands; VERBOSE was
// applied while parsing and ASCII/UNICODE by the translator.
func inlineFlags(f Flags) string {
	s := ""
	if f&IgnoreCase != 0 {
		s += "i"
	}
	if f&Multiline != 0 {
		s += "m"
	}
	if f&DotAll != 0 {
		s += "s"
	}
	return s
}

// literal escapes a code point for use outside (or, inClass, inside) a
// character class.
func literal(r rune, inClass bool) string {
	switch {
	case r < 0x20 || r == 0x7f || (r >= 0xd800 && r <= 0xdfff):
		return fmt.Sprintf(`\u%04X`, r)
	case r > 0xffff:
		return string(r)
	case inClass && strings.ContainsRune(`\]-[^`, r):
		return `\` + string(r)
	case !inClass && strings.ContainsRune(`\.^$|?*+()[]{}#`, r):
		return `\` + string(r)
	case !inClass && r == ' ':
		return ` `
	case r >= 0x80:
		return fmt.Sprintf(`\u%04X`, r)
	}
	return string(r)
}

// Class contents of Python's categories.
func categoryClass(code int, ascii bool) string {
	switch code {
	case catDigit:
		if ascii {
			return "0-9"
		}
		return `\p{Nd}`
	case catSpace:
		if ascii {
			return ` \u0009-\u000D`
		}
		// _PyUnicode_IsWhitespace: bidirectional WS, B or S, or Zs.
		return `\u0009-\u000D\u001C- \u0085   -     　`
	case catWord:
		if ascii {
			return "a-zA-Z0-9_"
		}
		// str.isalnum() or "_".
		return `\p{L}\p{N}_`
	}
	return ""
}

func negatedCategory(code int) (int, bool) {
	switch code {
	case catNotDigit:
		return catDigit, true
	case catNotSpace:
		return catSpace, true
	case catNotWord:
		return catWord, true
	}
	return code, false
}

// charSet writes an IN. Items regexp2 cannot hold in one class (the
// negated categories) become alternatives; a negated set is then "none of
// those, then any character".
func charSet(set []*node, ascii bool) string {
	negate := len(set) > 0 && set[0].op == opNegate
	if negate {
		set = set[1:]
	}
	var plain strings.Builder
	var alts []string
	for _, n := range set {
		switch n.op {
		case opLiteral:
			plain.WriteString(literal(rune(n.arg), true))
		case opRange:
			plain.WriteString(literal(rune(n.arg), true) + "-" + literal(rune(n.arg2), true))
		case opCategory:
			if pos, neg := negatedCategory(int(n.arg)); neg {
				alts = append(alts, "[^"+categoryClass(pos, ascii)+"]")
			} else {
				plain.WriteString(categoryClass(pos, ascii))
			}
		}
	}
	if plain.Len() > 0 {
		alts = append([]string{"[" + plain.String() + "]"}, alts...)
	}
	if len(alts) == 0 {
		alts = []string{"(?!)"}
	}
	if !negate {
		if len(alts) == 1 {
			return alts[0]
		}
		return "(?:" + strings.Join(alts, "|") + ")"
	}
	if len(alts) == 1 && strings.HasPrefix(alts[0], "[") && !strings.HasPrefix(alts[0], "[^") {
		return "[^" + alts[0][1:]
	}
	return "(?:(?!" + strings.Join(alts, "|") + `)[\s\S])`
}

func at(code int, ascii bool) string {
	switch code {
	case atBeginning:
		return "^"
	case atBeginningString:
		return `\A`
	case atEnd:
		return "$"
	case atEndString:
		return `\z`
	case atBoundary, atNonBoundary:
		w := "[" + categoryClass(catWord, ascii) + "]"
		if code == atBoundary {
			return "(?:(?<=" + w + ")(?!" + w + ")|(?<!" + w + ")(?=" + w + "))"
		}
		return "(?:(?<=" + w + ")(?=" + w + ")|(?<!" + w + ")(?!" + w + "))"
	}
	return ""
}
