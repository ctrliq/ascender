package jinja

// Python values as the templates see them. The builtin types are Go values:
//
//	None nil         bool bool        int int64 or *big.Int   float float64
//	str string       Markup Markup    list *List              tuple Tuple
//	dict *Dict       range Range
//
// Everything else (Undefined, the loop object, macros, namespaces,
// datetimes, bound methods, ...) implements Object. Operations raise Python
// exceptions by panicking with *Error, which rendering recovers.

import (
	"fmt"
	"math"
	"math/big"
	"strconv"
	"strings"

	"github.com/ctrliq/ascender/internal/pystr"
)

// Value is a Python value.
type Value = any

// Markup is markupsafe.Markup: a str marked as safe HTML.
type Markup string

// List is a Python list.
type List struct{ Items []Value }

// Tuple is a Python tuple.
type Tuple []Value

// Range is a range object.
type Range struct{ Start, Stop, Step int64 }

func (r Range) Len() int64 {
	if r.Step > 0 && r.Start < r.Stop {
		return (r.Stop - r.Start + r.Step - 1) / r.Step
	}
	if r.Step < 0 && r.Start > r.Stop {
		return (r.Start - r.Stop - r.Step - 1) / (-r.Step)
	}
	return 0
}

func (r Range) At(i int64) int64 { return r.Start + i*r.Step }

// Object is a value of any other type.
type Object interface {
	// TypeName is type(obj).__name__ and Module type(obj).__module__.
	TypeName() string
	Module() string
	// Attr is getattr(obj, name): false when the object has no such
	// attribute (AttributeError).
	Attr(name string) (Value, bool)
	Repr() string
}

// Optional behaviours of an Object.
type (
	stringer interface{ Str() string }
	truther  interface{ Truth() bool }
	lengther interface{ Len() int }
	iterable interface{ Iter() Iterator }
	itemer   interface {
		// Item is obj[key]: false raises the lookup failure (KeyError,
		// IndexError, TypeError) the sandbox turns into an undefined.
		Item(key Value) (Value, bool)
	}
	callable interface {
		Call(r *renderer, args []Value, kwargs []kwarg) Value
	}
)

type kwarg struct {
	Name  string
	Value Value
}

// Iterator yields values until done.
type Iterator func() (Value, bool)

func raise(typ, msg string) {
	panic(&Error{Type: typ, Message: msg})
}

func typeError(msg string)  { raise("TypeError", msg) }
func valueError(msg string) { raise("ValueError", msg) }

// typeName is type(v).__name__.
func typeName(v Value) string {
	switch x := v.(type) {
	case nil:
		return "NoneType"
	case bool:
		return "bool"
	case int64, *big.Int:
		return "int"
	case float64:
		return "float"
	case string:
		return "str"
	case Markup:
		return "Markup"
	case *List:
		return "list"
	case Tuple:
		return "tuple"
	case *Dict:
		return "dict"
	case Range:
		return "range"
	case Object:
		return x.TypeName()
	}
	return fmt.Sprintf("%T", v)
}

func moduleName(v Value) string {
	switch x := v.(type) {
	case Markup:
		return "markupsafe"
	case Object:
		return x.Module()
	}
	return "builtins"
}

// objectTypeRepr is jinja2.utils.object_type_repr.
func objectTypeRepr(v Value) string {
	if v == nil {
		return "None"
	}
	if m := moduleName(v); m != "builtins" {
		return m + "." + typeName(v) + " object"
	}
	return typeName(v) + " object"
}

// ---------------------------------------------------------------- numbers

// maxStrDigits is sys.get_int_max_str_digits().
const maxStrDigits = 4300

func normInt(b *big.Int) Value {
	if b.IsInt64() {
		return b.Int64()
	}
	return b
}

func toBig(v Value) *big.Int {
	switch x := v.(type) {
	case bool:
		if x {
			return big.NewInt(1)
		}
		return big.NewInt(0)
	case int64:
		return big.NewInt(x)
	case *big.Int:
		return x
	}
	return nil
}

// isInt reports an int (bool included, as Python's bool is an int).
func isInt(v Value) bool {
	switch v.(type) {
	case bool, int64, *big.Int:
		return true
	}
	return false
}

func isNumber(v Value) bool {
	_, f := v.(float64)
	return f || isInt(v)
}

func toFloat(v Value) float64 {
	switch x := v.(type) {
	case bool:
		if x {
			return 1
		}
		return 0
	case int64:
		return float64(x)
	case *big.Int:
		f, acc := new(big.Float).SetInt(x).Float64()
		if math.IsInf(f, 0) && acc != big.Exact {
			raise("OverflowError", "int too large to convert to float")
		}
		return f
	case float64:
		return x
	}
	return math.NaN()
}

func intStr(v Value) string {
	switch x := v.(type) {
	case int64:
		return strconv.FormatInt(x, 10)
	case *big.Int:
		s := x.String()
		if n := len(strings.TrimPrefix(s, "-")); n > maxStrDigits {
			valueError(fmt.Sprintf("Exceeds the limit (%d digits) for integer string conversion; use sys.set_int_max_str_digits() to increase the limit", maxStrDigits))
		}
		return s
	case bool:
		if x {
			return "1"
		}
		return "0"
	}
	return ""
}

// ---------------------------------------------------------------- str/repr

// str is str(v).
func str(v Value) string {
	switch x := v.(type) {
	case string:
		return x
	case Markup:
		return string(x)
	case nil, bool, float64, *List, Tuple, *Dict, Range:
		return repr(v)
	case int64, *big.Int:
		return intStr(v)
	case stringer:
		return x.Str()
	case Object:
		return x.Repr()
	}
	return fmt.Sprint(v)
}

// repr is repr(v).
func repr(v Value) string {
	switch x := v.(type) {
	case nil:
		return "None"
	case bool:
		if x {
			return "True"
		}
		return "False"
	case int64, *big.Int:
		return intStr(v)
	case float64:
		return pystr.FloatRepr(x)
	case string:
		return pystr.Repr(x)
	case Markup:
		return "Markup(" + pystr.Repr(string(x)) + ")"
	case *List:
		return "[" + joinRepr(x.Items) + "]"
	case Tuple:
		if len(x) == 1 {
			return "(" + repr(x[0]) + ",)"
		}
		return "(" + joinRepr(x) + ")"
	case *Dict:
		parts := make([]string, len(x.keys))
		for i, k := range x.keys {
			parts[i] = repr(k) + ": " + repr(x.vals[i])
		}
		return "{" + strings.Join(parts, ", ") + "}"
	case Range:
		if x.Step == 1 {
			return fmt.Sprintf("range(%d, %d)", x.Start, x.Stop)
		}
		return fmt.Sprintf("range(%d, %d, %d)", x.Start, x.Stop, x.Step)
	case Object:
		return x.Repr()
	}
	return fmt.Sprint(v)
}

func joinRepr(items []Value) string {
	parts := make([]string, len(items))
	for i, it := range items {
		parts[i] = repr(it)
	}
	return strings.Join(parts, ", ")
}

// ---------------------------------------------------------------- truth, len, iteration

// truth is bool(v).
func truth(v Value) bool {
	switch x := v.(type) {
	case nil:
		return false
	case bool:
		return x
	case int64:
		return x != 0
	case *big.Int:
		return x.Sign() != 0
	case float64:
		return x != 0
	case string:
		return x != ""
	case Markup:
		return x != ""
	case *List:
		return len(x.Items) > 0
	case Tuple:
		return len(x) > 0
	case *Dict:
		return len(x.keys) > 0
	case Range:
		return x.Len() > 0
	case truther:
		return x.Truth()
	case lengther:
		return x.Len() > 0
	}
	return true
}

// length is len(v).
func length(v Value) int {
	switch x := v.(type) {
	case string:
		return len([]rune(x))
	case Markup:
		return len([]rune(string(x)))
	case *List:
		return len(x.Items)
	case Tuple:
		return len(x)
	case *Dict:
		return len(x.keys)
	case Range:
		return int(x.Len())
	case lengther:
		return x.Len()
	}
	typeError(fmt.Sprintf("object of type %s has no len()", pystr.Repr(typeName(v))))
	return 0
}

func hasLen(v Value) bool {
	switch v.(type) {
	case string, Markup, *List, Tuple, *Dict, Range, lengther:
		return true
	}
	return false
}

// iterate is iter(v).
func iterate(v Value) Iterator {
	sliceIter := func(items []Value) Iterator {
		i := 0
		return func() (Value, bool) {
			if i >= len(items) {
				return nil, false
			}
			i++
			return items[i-1], true
		}
	}
	switch x := v.(type) {
	case string:
		r := []rune(x)
		i := 0
		return func() (Value, bool) {
			if i >= len(r) {
				return nil, false
			}
			i++
			return string(r[i-1]), true
		}
	case Markup:
		r := []rune(string(x))
		i := 0
		return func() (Value, bool) {
			if i >= len(r) {
				return nil, false
			}
			i++
			return Markup(r[i-1]), true
		}
	case *List:
		return sliceIter(x.Items)
	case Tuple:
		return sliceIter(x)
	case *Dict:
		return sliceIter(append([]Value{}, x.keys...))
	case Range:
		var i int64
		n := x.Len()
		return func() (Value, bool) {
			if i >= n {
				return nil, false
			}
			i++
			return x.At(i - 1), true
		}
	case iterable:
		return x.Iter()
	}
	typeError(pystr.Repr(typeName(v)) + " object is not iterable")
	return nil
}

func isIterable(v Value) bool {
	switch v.(type) {
	case string, Markup, *List, Tuple, *Dict, Range, iterable:
		return true
	}
	return false
}

// toList is list(v).
func toList(v Value) []Value {
	next := iterate(v)
	var out []Value
	for {
		x, ok := next()
		if !ok {
			return out
		}
		out = append(out, x)
	}
}

// ---------------------------------------------------------------- equality, hashing, ordering

// equal is a == b.
func equal(a, b Value) bool {
	if u, ok := a.(*Undefined); ok {
		return u.eq(b)
	}
	if u, ok := b.(*Undefined); ok {
		return u.eq(a)
	}
	if isNumber(a) && isNumber(b) {
		return compareNumbers(a, b) == 0 && !isNaN(a) && !isNaN(b)
	}
	if sa, ok := asStr(a); ok {
		sb, ok := asStr(b)
		return ok && sa == sb
	}
	switch x := a.(type) {
	case nil:
		return b == nil
	case *List:
		y, ok := b.(*List)
		return ok && equalSlices(x.Items, y.Items)
	case Tuple:
		y, ok := b.(Tuple)
		return ok && equalSlices(x, y)
	case *Dict:
		y, ok := b.(*Dict)
		if !ok || len(x.keys) != len(y.keys) {
			return false
		}
		for i, k := range x.keys {
			v, found := y.Get(k)
			if !found || !equal(x.vals[i], v) {
				return false
			}
		}
		return true
	case Range:
		y, ok := b.(Range)
		if !ok {
			return false
		}
		if x.Len() != y.Len() {
			return false
		}
		return x.Len() == 0 || (x.Start == y.Start && (x.Len() == 1 || x.Step == y.Step))
	}
	if e, ok := a.(interface{ Equal(Value) bool }); ok {
		return e.Equal(b)
	}
	return a == b
}

func isNaN(v Value) bool {
	f, ok := v.(float64)
	return ok && math.IsNaN(f)
}

func equalSlices(a, b []Value) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if !equal(a[i], b[i]) {
			return false
		}
	}
	return true
}

func asStr(v Value) (string, bool) {
	switch x := v.(type) {
	case string:
		return x, true
	case Markup:
		return string(x), true
	}
	return "", false
}

// compareNumbers orders two numbers (-1, 0, 1; NaN compares unequal).
func compareNumbers(a, b Value) int {
	_, fa := a.(float64)
	_, fb := b.(float64)
	if !fa && !fb {
		return toBig(a).Cmp(toBig(b))
	}
	if fa && fb {
		x, y := a.(float64), b.(float64)
		switch {
		case x < y:
			return -1
		case x > y:
			return 1
		}
		return 0
	}
	// An int against a float, compared exactly.
	var i *big.Int
	var f float64
	sign := 1
	if fa {
		f, i, sign = a.(float64), toBig(b), 1
	} else {
		f, i, sign = b.(float64), toBig(a), -1
	}
	if math.IsNaN(f) {
		return 2
	}
	if math.IsInf(f, 1) {
		return sign
	}
	if math.IsInf(f, -1) {
		return -sign
	}
	c := new(big.Float).SetFloat64(f).Cmp(new(big.Float).SetInt(i))
	return c * sign
}

// hashKey is the identity of a dict key: values equal in Python share it.
func hashKey(v Value) string {
	switch x := v.(type) {
	case nil:
		return "N"
	case bool, int64, *big.Int:
		return "i" + toBig(x).String()
	case float64:
		if x == math.Trunc(x) && !math.IsInf(x, 0) {
			b, _ := new(big.Float).SetFloat64(x).Int(nil)
			return "i" + b.String()
		}
		return "f" + strconv.FormatFloat(x, 'g', -1, 64)
	case string:
		return "s" + x
	case Markup:
		return "s" + string(x)
	case Tuple:
		parts := make([]string, len(x))
		for i, it := range x {
			parts[i] = hashKey(it)
		}
		return "t(" + strings.Join(parts, "\x00") + ")"
	case Range:
		return fmt.Sprintf("r%d,%d,%d", x.Start, x.Stop, x.Step)
	case *Undefined:
		if x.kind == undefStrict || x.kind == undefDescriptive {
			x.fail()
		}
		return "U" + x.typeName()
	case *List, *Dict:
		typeError("unhashable type: " + pystr.Repr(typeName(v)))
	}
	return fmt.Sprintf("o%p", v)
}

// less is a < b, raising TypeError for unorderable types.
func less(a, b Value, op string) bool {
	c := compare(a, b, op)
	return c < 0
}

// compare orders a and b for op ("<", "<=", ">", ">="): -1, 0, 1, or 2
// for unordered (NaN).
func compare(a, b Value, op string) int {
	if u, ok := a.(*Undefined); ok {
		u.fail()
	}
	if u, ok := b.(*Undefined); ok {
		u.fail()
	}
	if isNumber(a) && isNumber(b) {
		return compareNumbers(a, b)
	}
	if sa, ok := asStr(a); ok {
		if sb, ok := asStr(b); ok {
			return strings.Compare(sa, sb)
		}
	}
	var xa, xb []Value
	switch x := a.(type) {
	case *List:
		if y, ok := b.(*List); ok {
			xa, xb = x.Items, y.Items
		}
	case Tuple:
		if y, ok := b.(Tuple); ok {
			xa, xb = x, y
		}
	}
	if xa != nil || xb != nil || (isSeq(a) && isSeq(b) && typeName(a) == typeName(b)) {
		for i := 0; i < len(xa) && i < len(xb); i++ {
			if !equal(xa[i], xb[i]) {
				return compare(xa[i], xb[i], op)
			}
		}
		switch {
		case len(xa) < len(xb):
			return -1
		case len(xa) > len(xb):
			return 1
		}
		return 0
	}
	typeError(fmt.Sprintf("%s not supported between instances of %s and %s", pystr.Repr(op), pystr.Repr(typeName(a)), pystr.Repr(typeName(b))))
	return 0
}

func isSeq(v Value) bool {
	switch v.(type) {
	case *List, Tuple:
		return true
	}
	return false
}

// compareOp evaluates one comparison operator.
func compareOp(op string, a, b Value) bool {
	switch op {
	case "eq":
		return equal(a, b)
	case "ne":
		if u, ok := a.(*Undefined); ok {
			return !u.eq(b)
		}
		return !equal(a, b)
	case "lt":
		c := compare(a, b, "<")
		return c == -1
	case "lteq":
		c := compare(a, b, "<=")
		return c == -1 || c == 0
	case "gt":
		c := compare(a, b, ">")
		return c == 1
	case "gteq":
		c := compare(a, b, ">=")
		return c == 1 || c == 0
	case "in":
		return contains(b, a)
	case "notin":
		return !contains(b, a)
	}
	return false
}

// contains is item in container.
func contains(container, item Value) bool {
	switch x := container.(type) {
	case string, Markup:
		s, _ := asStr(x)
		sub, ok := asStr(item)
		if !ok {
			typeError("'in <string>' requires string as left operand, not " + typeName(item))
		}
		return strings.Contains(s, sub)
	case *Dict:
		_ = hashKey(item)
		_, found := x.Get(item)
		return found
	case Range:
		if isInt(item) || isWholeFloat(item) {
			n := toFloat(item)
			if x.Step > 0 && (n < float64(x.Start) || n >= float64(x.Stop)) || x.Step < 0 && (n > float64(x.Start) || n <= float64(x.Stop)) {
				return false
			}
			return math.Mod(n-float64(x.Start), float64(x.Step)) == 0
		}
		return false
	case *Undefined:
		if x.kind == undefStrict || x.kind == undefDescriptive {
			x.fail()
		}
		return false
	case interface{ Contains(Value) bool }:
		return x.Contains(item)
	}
	if !isIterable(container) {
		typeError("argument of type " + pystr.Repr(typeName(container)) + " is not a container or iterable")
	}
	next := iterate(container)
	for {
		v, ok := next()
		if !ok {
			return false
		}
		if equal(item, v) {
			return true
		}
	}
}

func isWholeFloat(v Value) bool {
	f, ok := v.(float64)
	return ok && f == math.Trunc(f)
}

// ---------------------------------------------------------------- dict

// Dict is a Python dict: insertion ordered.
type Dict struct {
	keys  []Value
	vals  []Value
	index map[string]int
}

func NewDict() *Dict { return &Dict{index: map[string]int{}} }

func (d *Dict) Len() int { return len(d.keys) }

func (d *Dict) Get(k Value) (Value, bool) {
	i, ok := d.index[hashKey(k)]
	if !ok {
		return nil, false
	}
	return d.vals[i], true
}

func (d *Dict) Set(k, v Value) {
	h := hashKey(k)
	if i, ok := d.index[h]; ok {
		d.vals[i] = v
		return
	}
	d.index[h] = len(d.keys)
	d.keys = append(d.keys, k)
	d.vals = append(d.vals, v)
}

func (d *Dict) Keys() []Value   { return d.keys }
func (d *Dict) Values() []Value { return d.vals }

func (d *Dict) Copy() *Dict {
	n := NewDict()
	for i, k := range d.keys {
		n.Set(k, d.vals[i])
	}
	return n
}

// ---------------------------------------------------------------- conversion from Go

// FromGo converts decoded JSON (or plain Go values) to template values:
// maps become dicts in sorted key order unless given as *Dict, slices
// lists, json.Number ints or floats.
func FromGo(v any) Value {
	switch x := v.(type) {
	case nil, bool, string, int64, float64, *big.Int, Markup, *List, Tuple, *Dict, Range, Object:
		return x
	case int:
		return int64(x)
	case int32:
		return int64(x)
	case float32:
		return float64(x)
	case interface{ Int64() (int64, error) }:
		if s, ok := x.(fmt.Stringer); ok {
			txt := s.String()
			if !strings.ContainsAny(txt, ".eE") {
				if i, err := x.Int64(); err == nil {
					return i
				}
				if b, ok := new(big.Int).SetString(txt, 10); ok {
					return b
				}
			}
			f, _ := strconv.ParseFloat(txt, 64)
			return f
		}
	case []any:
		items := make([]Value, len(x))
		for i, it := range x {
			items[i] = FromGo(it)
		}
		return &List{Items: items}
	case map[string]any:
		keys := make([]string, 0, len(x))
		for k := range x {
			keys = append(keys, k)
		}
		sortStrings(keys)
		d := NewDict()
		for _, k := range keys {
			d.Set(k, FromGo(x[k]))
		}
		return d
	}
	return fmt.Sprint(v)
}
