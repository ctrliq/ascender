package jinja

// repr() of a parsed tree as Jinja writes it, which the parser's golden
// test compares with Jinja's own.

import (
	"math/big"
	"strconv"
	"strings"

	"github.com/ctrliq/ascender/internal/pystr"
)

// Repr is repr() of the tree as Jinja writes it.
func Repr(n Node) string {
	var b strings.Builder
	reprValue(&b, n)
	return b.String()
}

func reprValue(b *strings.Builder, v any) {
	switch x := v.(type) {
	case nil:
		b.WriteString("None")
	case Node:
		if isNilNode(x) {
			b.WriteString("None")
			return
		}
		b.WriteString(x.typeName())
		b.WriteByte('(')
		for i, fl := range x.fields() {
			if i > 0 {
				b.WriteString(", ")
			}
			b.WriteString(fl.name)
			b.WriteByte('=')
			reprValue(b, fl.value)
		}
		b.WriteByte(')')
	case constValue:
		b.WriteString(pyRepr(x.v))
	case string:
		b.WriteString(pystr.Repr(x))
	case bool:
		if x {
			b.WriteString("True")
		} else {
			b.WriteString("False")
		}
	case [2]string:
		b.WriteString("(" + pystr.Repr(x[0]) + ", " + pystr.Repr(x[1]) + ")")
	case []Node:
		reprList(b, len(x), func(i int) any { return x[i] })
	case []*Pair:
		reprList(b, len(x), func(i int) any { return x[i] })
	case []*Keyword:
		reprList(b, len(x), func(i int) any { return x[i] })
	case []*Operand:
		reprList(b, len(x), func(i int) any { return x[i] })
	case []*If:
		reprList(b, len(x), func(i int) any { return x[i] })
	case []*Name:
		reprList(b, len(x), func(i int) any { return x[i] })
	case []any:
		reprList(b, len(x), func(i int) any { return x[i] })
	}
}

func reprList(b *strings.Builder, n int, item func(int) any) {
	b.WriteByte('[')
	for i := range n {
		if i > 0 {
			b.WriteString(", ")
		}
		reprValue(b, item(i))
	}
	b.WriteByte(']')
}

// pyRepr is repr() of a constant.
func pyRepr(v any) string {
	switch x := v.(type) {
	case nil:
		return "None"
	case bool:
		if x {
			return "True"
		}
		return "False"
	case int64:
		return strconv.FormatInt(x, 10)
	case *big.Int:
		return x.String()
	case float64:
		return pystr.FloatRepr(x)
	case string:
		return pystr.Repr(x)
	}
	return "?"
}
