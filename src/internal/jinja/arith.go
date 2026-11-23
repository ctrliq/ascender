package jinja

// Python's arithmetic operators with their result types and error
// messages.

import (
	"fmt"
	"math"
	"math/big"
	"strings"

	"github.com/ctrliq/ascender/internal/pystr"
)

// maxIntBits bounds the ints arithmetic builds: Python would take minutes
// and gigabytes on {{ 10**10**10 }}; past this it raises MemoryError.
const maxIntBits = 1 << 20

func checkIntSize(b *big.Int) *big.Int {
	if b.BitLen() > maxIntBits {
		raise("MemoryError", "")
	}
	return b
}

func unsupported(op string, a, b Value) {
	typeError(fmt.Sprintf("unsupported operand type(s) for %s: %s and %s", op, pystr.Repr(typeName(a)), pystr.Repr(typeName(b))))
}

func failUndefined(a, b Value) {
	if u, ok := a.(*Undefined); ok {
		u.fail()
	}
	if u, ok := b.(*Undefined); ok {
		u.fail()
	}
}

// binop applies a Jinja math node: Add, Sub, Mul, Div, FloorDiv, Mod, Pow.
func binop(kind string, a, b Value) Value {
	if _, isStr := asStr(a); kind == "Mod" && isStr {
		// str % x formats x, undefined or not.
		return mod(a, b)
	}
	failUndefined(a, b)
	switch kind {
	case "Add":
		return add(a, b)
	case "Sub":
		return sub(a, b)
	case "Mul":
		return mul(a, b)
	case "Div":
		return truediv(a, b)
	case "FloorDiv":
		return floordiv(a, b)
	case "Mod":
		return mod(a, b)
	case "Pow":
		return power(a, b)
	}
	return nil
}

func add(a, b Value) Value {
	if isNumber(a) && isNumber(b) {
		if isInt(a) && isInt(b) {
			return normInt(checkIntSize(new(big.Int).Add(toBig(a), toBig(b))))
		}
		return toFloat(a) + toFloat(b)
	}
	if c, ok := a.(*Complex); ok && isNumber(b) {
		return &Complex{c.V + complex(toFloat(b), 0)}
	}
	switch x := a.(type) {
	case Markup:
		if y, ok := asStr(b); ok {
			if _, isM := b.(Markup); isM {
				return x + Markup(y)
			}
			return x + Markup(escapeHTML(y))
		}
		if h, ok := b.(interface{ HTML() string }); ok {
			return x + Markup(h.HTML())
		}
		typeError(fmt.Sprintf("can only concatenate str (not %q) to str", typeName(b)))
	case string:
		if m, ok := b.(Markup); ok {
			return Markup(escapeHTML(x)) + m
		}
		if y, ok := b.(string); ok {
			return x + y
		}
		typeError(fmt.Sprintf("can only concatenate str (not %q) to str", typeName(b)))
	case *List:
		if y, ok := b.(*List); ok {
			items := append(append([]Value{}, x.Items...), y.Items...)
			return &List{Items: items}
		}
		typeError(fmt.Sprintf("can only concatenate list (not %q) to list", typeName(b)))
	case Tuple:
		if y, ok := b.(Tuple); ok {
			return append(append(Tuple{}, x...), y...)
		}
		typeError(fmt.Sprintf("can only concatenate tuple (not %q) to tuple", typeName(b)))
	}
	unsupported("+", a, b)
	return nil
}

func sub(a, b Value) Value {
	if isNumber(a) && isNumber(b) {
		if isInt(a) && isInt(b) {
			return normInt(checkIntSize(new(big.Int).Sub(toBig(a), toBig(b))))
		}
		return toFloat(a) - toFloat(b)
	}
	unsupported("-", a, b)
	return nil
}

func repeatCount(n Value, a, b Value) int {
	c := toBig(n)
	if c.Sign() <= 0 {
		return 0
	}
	if !c.IsInt64() || c.Int64() > 1<<28 {
		raise("MemoryError", "")
	}
	return int(c.Int64())
}

func mul(a, b Value) Value {
	if isNumber(a) && isNumber(b) {
		if isInt(a) && isInt(b) {
			return normInt(checkIntSize(new(big.Int).Mul(toBig(a), toBig(b))))
		}
		return toFloat(a) * toFloat(b)
	}
	seq, n := a, b
	if isInt(a) {
		seq, n = b, a
	}
	switch s := seq.(type) {
	case string, Markup, *List, Tuple:
		if !isInt(n) {
			typeError("can't multiply sequence by non-int of type " + pystr.Repr(typeName(n)))
		}
		count := repeatCount(n, a, b)
		switch x := s.(type) {
		case string:
			if len(x)*count > 1<<28 {
				raise("MemoryError", "")
			}
			return strings.Repeat(x, count)
		case Markup:
			return Markup(strings.Repeat(string(x), count))
		case *List:
			var items []Value
			for range count {
				items = append(items, x.Items...)
			}
			return &List{Items: items}
		case Tuple:
			var items Tuple
			for range count {
				items = append(items, x...)
			}
			return items
		}
	}
	unsupported("*", a, b)
	return nil
}

func zeroDivision() { raise("ZeroDivisionError", "division by zero") }

func truediv(a, b Value) Value {
	if isNumber(a) && isNumber(b) {
		if isInt(a) && isInt(b) {
			y := toBig(b)
			if y.Sign() == 0 {
				zeroDivision()
			}
			r, _ := new(big.Rat).SetFrac(toBig(a), y).Float64()
			return r
		}
		y := toFloat(b)
		if y == 0 {
			zeroDivision()
		}
		return toFloat(a) / y
	}
	unsupported("/", a, b)
	return nil
}

// floorDivInt and modInt round toward negative infinity, as Python does.
func floorDivInt(x, y *big.Int) *big.Int {
	q, m := new(big.Int).QuoRem(x, y, new(big.Int))
	if m.Sign() != 0 && (m.Sign() < 0) != (y.Sign() < 0) {
		q.Sub(q, big.NewInt(1))
	}
	return q
}

func modInt(x, y *big.Int) *big.Int {
	m := new(big.Int).Rem(x, y)
	if m.Sign() != 0 && (m.Sign() < 0) != (y.Sign() < 0) {
		m.Add(m, y)
	}
	return m
}

func modFloat(x, y float64) float64 {
	m := math.Mod(x, y)
	if m != 0 {
		if (m < 0) != (y < 0) {
			m += y
		}
	} else {
		m = math.Copysign(0, y)
	}
	return m
}

func floordiv(a, b Value) Value {
	if isNumber(a) && isNumber(b) {
		if isInt(a) && isInt(b) {
			y := toBig(b)
			if y.Sign() == 0 {
				zeroDivision()
			}
			return normInt(floorDivInt(toBig(a), y))
		}
		x, y := toFloat(a), toFloat(b)
		if y == 0 {
			zeroDivision()
		}
		m := modFloat(x, y)
		return math.Floor((x - m) / y)
	}
	unsupported("//", a, b)
	return nil
}

func mod(a, b Value) Value {
	if s, ok := asStr(a); ok {
		out := percentFormat(s, b)
		if _, isM := a.(Markup); isM {
			return Markup(out)
		}
		return out
	}
	if isNumber(a) && isNumber(b) {
		if isInt(a) && isInt(b) {
			y := toBig(b)
			if y.Sign() == 0 {
				zeroDivision()
			}
			return normInt(modInt(toBig(a), y))
		}
		y := toFloat(b)
		if y == 0 {
			zeroDivision()
		}
		return modFloat(toFloat(a), y)
	}
	unsupported("%", a, b)
	return nil
}

func power(a, b Value) Value {
	if isNumber(a) && isNumber(b) {
		if isInt(a) && isInt(b) {
			x, y := toBig(a), toBig(b)
			if y.Sign() < 0 {
				if x.Sign() == 0 {
					raise("ZeroDivisionError", "zero to a negative power")
				}
				return math.Pow(toFloat(a), toFloat(b))
			}
			if x.BitLen() > 1 && (!y.IsInt64() || int64(x.BitLen())*y.Int64() > maxIntBits) {
				raise("MemoryError", "")
			}
			return normInt(new(big.Int).Exp(x, y, nil))
		}
		x, y := toFloat(a), toFloat(b)
		if x == 0 && y < 0 {
			raise("ZeroDivisionError", "zero to a negative power")
		}
		if x < 0 && y != math.Trunc(y) {
			// complex.__pow__ (_Py_c_pow): through polar form.
			ln := math.Pow(math.Abs(x), y)
			phase := math.Atan2(0, x) * y
			return &Complex{complex(ln*cosReduced(phase), ln*sinReduced(phase))}
		}
		r := math.Pow(x, y)
		if math.IsInf(r, 0) && !math.IsInf(x, 0) {
			raise("OverflowError", "(34, 'Numerical result out of range')")
		}
		return r
	}
	unsupported("** or pow()", a, b)
	return nil
}

// unop applies Neg or Pos.
func unop(kind string, v Value) Value {
	if u, ok := v.(*Undefined); ok {
		u.fail()
	}
	op := "-"
	if kind == "Pos" {
		op = "+"
	}
	switch x := v.(type) {
	case bool, int64, *big.Int:
		if kind == "Pos" {
			return normInt(toBig(x))
		}
		return normInt(new(big.Int).Neg(toBig(x)))
	case float64:
		if kind == "Pos" {
			return x
		}
		return -x
	case *Complex:
		if kind == "Pos" {
			return x
		}
		return &Complex{-x.V}
	}
	typeError("bad operand type for unary " + op + ": " + pystr.Repr(typeName(v)))
	return nil
}

// Complex is a complex number, which only a negative float raised to a
// fractional power produces here.
type Complex struct{ V complex128 }

func (*Complex) TypeName() string              { return "complex" }
func (*Complex) Module() string                { return "builtins" }
func (c *Complex) Attr(n string) (Value, bool) { return complexAttr(c, n) }

func complexAttr(c *Complex, name string) (Value, bool) {
	switch name {
	case "real":
		return real(c.V), true
	case "imag":
		return imag(c.V), true
	}
	return nil, false
}

func complexPart(f float64) string {
	s := pystr.FloatRepr(f)
	return strings.TrimSuffix(s, ".0")
}

func (c *Complex) Repr() string {
	re, im := real(c.V), imag(c.V)
	if re == 0 && !math.Signbit(re) {
		return complexPart(im) + "j"
	}
	sign := "+"
	if im < 0 || (im == 0 && math.Signbit(im)) || math.IsNaN(im) && false {
		sign = "-"
		im = -im
	}
	return "(" + complexPart(re) + sign + complexPart(im) + "j)"
}

func (c *Complex) Truth() bool { return c.V != 0 }

func (c *Complex) Equal(o Value) bool {
	switch y := o.(type) {
	case *Complex:
		return c.V == y.V
	}
	if isNumber(o) {
		return imag(c.V) == 0 && real(c.V) == toFloat(o)
	}
	return false
}

// Two-part pi/2 for reducing an argument before sin and cos: Go's own
// reduction loses the last digits near multiples of pi/2, where glibc's
// (which CPython uses) does not.
const (
	piOver2Hi = 1.5707963267948966
	piOver2Lo = 6.123233995736766e-17
)

func reduce(x float64) (float64, int) {
	k := math.Round(x / piOver2Hi)
	r := (x - k*piOver2Hi) - k*piOver2Lo
	return r, int(math.Mod(k, 4)+4) % 4
}

func cosReduced(x float64) float64 {
	r, q := reduce(x)
	switch q {
	case 0:
		return math.Cos(r)
	case 1:
		return -math.Sin(r)
	case 2:
		return -math.Cos(r)
	}
	return math.Sin(r)
}

func sinReduced(x float64) float64 {
	r, q := reduce(x)
	switch q {
	case 0:
		return math.Sin(r)
	case 1:
		return math.Cos(r)
	case 2:
		return -math.Sin(r)
	}
	return -math.Cos(r)
}
