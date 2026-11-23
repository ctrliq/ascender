package jinja

// jinja2.sandbox.ImmutableSandboxedEnvironment's attribute, item and call
// rules over Python's own getattr and subscription.

import (
	"fmt"
	"math/big"
	"strings"

	"github.com/ctrliq/ascender/internal/pystr"
)

// MaxRange is sandbox.MAX_RANGE.
const MaxRange = 100000

var mutatingAttrs = map[string]map[string]bool{
	"list": setOf("append clear pop reverse insert sort extend remove"),
	"dict": setOf("clear pop popitem setdefault update"),
}

// modifiesKnownMutable is sandbox.modifies_known_mutable.
func modifiesKnownMutable(obj Value, attr string) bool {
	switch obj.(type) {
	case *List:
		return mutatingAttrs["list"][attr]
	case *Dict:
		return mutatingAttrs["dict"][attr]
	case *Namespace:
		return mutatingAttrs["dict"][attr]
	}
	return false
}

// isSafeAttribute is ImmutableSandboxedEnvironment.is_safe_attribute.
func isSafeAttribute(obj Value, attr string) bool {
	if strings.HasPrefix(attr, "_") {
		return false
	}
	if attr == "mro" {
		if _, isType := obj.(*builtinType); isType {
			return false
		}
	}
	return !modifiesKnownMutable(obj, attr)
}

func (r *renderer) unsafeUndefined(obj Value, attr string) *Undefined {
	return newUndefined(r.undef, fmt.Sprintf("access to attribute %s of %s object is unsafe.", pystr.Repr(attr), pystr.Repr(typeName(obj))), obj, true, attr, true, "SecurityError")
}

// pyGetattr is Python's getattr: false for AttributeError.
func pyGetattr(obj Value, attr string) (Value, bool) {
	if o, ok := obj.(Object); ok {
		return o.Attr(attr)
	}
	tn := typeName(obj)
	if !typeAttrs[tn][attr] {
		return nil, false
	}
	if v, ok := builtinAttr(obj, attr); ok {
		return v, true
	}
	return &method{recv: obj, name: attr}, true
}

// pyGetitem is obj[key]: false for the TypeError or LookupError the
// sandbox catches.
func pyGetitem(obj, key Value) (Value, bool) {
	switch x := obj.(type) {
	case *Dict:
		if !hashable(key) {
			return nil, false
		}
		return x.Get(key)
	case *List:
		return seqIndex(x.Items, key)
	case Tuple:
		return seqIndex(x, key)
	case string:
		if v, ok := seqIndexRunes([]rune(x), key); ok {
			return v, true
		}
		return nil, false
	case Markup:
		if v, ok := seqIndexRunes([]rune(string(x)), key); ok {
			return Markup(v.(string)), true
		}
		return nil, false
	case Range:
		i, ok := index(key, x.Len())
		if !ok {
			return nil, false
		}
		return x.At(i), true
	case itemer:
		return x.Item(key)
	}
	return nil, false
}

func hashable(key Value) bool {
	switch k := key.(type) {
	case *List, *Dict:
		return false
	case Tuple:
		for _, it := range k {
			if !hashable(it) {
				return false
			}
		}
	}
	return true
}

// index resolves a sequence index (negative counts from the end).
func index(key Value, n int64) (int64, bool) {
	if !isInt(key) {
		return 0, false
	}
	b := toBig(key)
	if !b.IsInt64() {
		return 0, false
	}
	i := b.Int64()
	if i < 0 {
		i += n
	}
	if i < 0 || i >= n {
		return 0, false
	}
	return i, true
}

func seqIndex(items []Value, key Value) (Value, bool) {
	i, ok := index(key, int64(len(items)))
	if !ok {
		return nil, false
	}
	return items[i], true
}

func seqIndexRunes(r []rune, key Value) (Value, bool) {
	i, ok := index(key, int64(len(r)))
	if !ok {
		return nil, false
	}
	return string(r[i]), true
}

// wrapStrFormat is SandboxedEnvironment.wrap_str_format: str.format and
// format_map go through the sandboxed formatter.
func wrapStrFormat(v Value) Value {
	m, ok := v.(*method)
	if !ok || (m.name != "format" && m.name != "format_map") {
		return nil
	}
	if _, isStr := asStr(m.recv); !isStr {
		return nil
	}
	return &formatFunc{m: m}
}

// formatFunc is the sandbox's wrapper of str.format, a function of its
// own (update_wrapper gives it the method's name).
type formatFunc struct{ m *method }

func (f *formatFunc) TypeName() string { return "function" }
func (f *formatFunc) Module() string   { return "jinja2.sandbox" }
func (f *formatFunc) Attr(name string) (Value, bool) {
	if name == "__name__" {
		return f.m.name, true
	}
	return nil, false
}
func (f *formatFunc) Repr() string {
	return "<function " + typeName(f.m.recv) + "." + f.m.name + " at 0x7f0000000000>"
}
func (f *formatFunc) Call(r *renderer, args []Value, kwargs []kwarg) Value {
	return f.m.Call(r, args, kwargs)
}

// getattr is SandboxedEnvironment.getattr.
func (r *renderer) getattr(obj Value, attr string) Value {
	if v, ok := pyGetattr(obj, attr); ok {
		if f := wrapStrFormat(v); f != nil {
			return f
		}
		if isSafeAttribute(obj, attr) {
			return v
		}
		return r.unsafeUndefined(obj, attr)
	}
	if v, ok := pyGetitem(obj, attr); ok {
		return v
	}
	return newUndefined(r.undef, "", obj, true, attr, true, "")
}

// getitem is SandboxedEnvironment.getitem.
func (r *renderer) getitem(obj, arg Value) Value {
	if v, ok := pyGetitem(obj, arg); ok {
		return v
	}
	if s, isStr := arg.(string); isStr {
		if v, ok := pyGetattr(obj, s); ok {
			if f := wrapStrFormat(v); f != nil {
				return f
			}
			if isSafeAttribute(obj, s) {
				return v
			}
			return r.unsafeUndefined(obj, s)
		}
	}
	return newUndefined(r.undef, "", obj, true, arg, true, "")
}

// call is SandboxedEnvironment.call: the callable must be safe, then
// Context.call.
func (r *renderer) call(obj Value, args []Value, kwargs []kwarg) Value {
	if u, ok := obj.(*Undefined); ok {
		// is_safe_callable's getattr(obj, "unsafe_callable") reaches
		// Undefined.__getattr__, which raises; a chainable one is called.
		u.fail()
	}
	switch x := obj.(type) {
	case callable:
		return x.Call(r, args, kwargs)
	}
	typeError(pystr.Repr(typeName(obj)) + " object is not callable")
	return nil
}

// slice is obj[start:stop:step], Python's own subscription (Jinja does
// not route slices through the sandbox).
func (r *renderer) slice(obj Value, start, stop, step Value) Value {
	if u, ok := obj.(*Undefined); ok {
		if u.kind == undefChainable {
			return u
		}
		u.fail()
	}
	var n int
	switch x := obj.(type) {
	case *List:
		n = len(x.Items)
	case Tuple:
		n = len(x)
	case string:
		n = len([]rune(x))
	case Markup:
		n = len([]rune(string(x)))
	case Range:
		n = int(x.Len())
	case *Dict:
		raise("KeyError", "slice("+repr(start)+", "+repr(stop)+", "+repr(step)+")")
	default:
		typeError(pystr.Repr(typeName(obj)) + " object is not subscriptable")
	}
	idx := sliceIndices(start, stop, step, n)
	switch x := obj.(type) {
	case *List:
		return &List{Items: pick(x.Items, idx)}
	case Tuple:
		return Tuple(pick(x, idx))
	case string:
		return pickRunes([]rune(x), idx)
	case Markup:
		return Markup(pickRunes([]rune(string(x)), idx))
	case Range:
		if len(idx) == 0 {
			return Range{0, 0, 1}
		}
		s := sliceStep(step)
		first := x.At(int64(idx[0]))
		return Range{first, first + int64(len(idx))*x.Step*s, x.Step * s}
	}
	return nil
}

func sliceStep(step Value) int64 {
	if step == nil {
		return 1
	}
	return toBig(step).Int64()
}

func sliceArg(v Value) (int64, bool) {
	if v == nil {
		return 0, false
	}
	if !isInt(v) {
		typeError("slice indices must be integers or None or have an __index__ method")
	}
	b := toBig(v)
	if !b.IsInt64() {
		if b.Sign() > 0 {
			return 1 << 62, true
		}
		return -(1 << 62), true
	}
	return b.Int64(), true
}

// sliceIndices is slice.indices(n) expanded to the selected indices.
func sliceIndices(start, stop, step Value, n int) []int {
	st := int64(1)
	if s, ok := sliceArg(step); ok {
		st = s
	}
	if st == 0 {
		valueError("slice step cannot be zero")
	}
	ln := int64(n)
	var lo, hi int64
	if st > 0 {
		lo, hi = 0, ln
	} else {
		lo, hi = ln-1, -1
	}
	clamp := func(v int64, isStart bool) int64 {
		if v < 0 {
			v += ln
			if v < 0 {
				if st > 0 {
					return 0
				}
				return -1
			}
		}
		if v >= ln {
			if st > 0 {
				return ln
			}
			return ln - 1
		}
		return v
	}
	if s, ok := sliceArg(start); ok {
		lo = clamp(s, true)
	}
	if s, ok := sliceArg(stop); ok {
		hi = clamp(s, false)
	}
	var out []int
	if st > 0 {
		for i := lo; i < hi; i += st {
			out = append(out, int(i))
		}
	} else {
		for i := lo; i > hi; i += st {
			out = append(out, int(i))
		}
	}
	return out
}

func pick(items []Value, idx []int) []Value {
	out := make([]Value, len(idx))
	for i, j := range idx {
		out[i] = items[j]
	}
	return out
}

func pickRunes(r []rune, idx []int) string {
	out := make([]rune, len(idx))
	for i, j := range idx {
		out[i] = r[j]
	}
	return string(out)
}

// safeRange is sandbox.safe_range.
func safeRange(args []Value) Value {
	var nums []int64
	for _, a := range args {
		if !isInt(a) {
			typeError(pystr.Repr(typeName(a)) + " object cannot be interpreted as an integer")
		}
		b := toBig(a)
		if !b.IsInt64() {
			raise("OverflowError", "Python int too large to convert to C ssize_t")
		}
		nums = append(nums, b.Int64())
	}
	var rg Range
	switch len(nums) {
	case 1:
		rg = Range{0, nums[0], 1}
	case 2:
		rg = Range{nums[0], nums[1], 1}
	case 3:
		if nums[2] == 0 {
			valueError("range() arg 3 must not be zero")
		}
		rg = Range{nums[0], nums[1], nums[2]}
	case 0:
		typeError("range expected at least 1 argument, got 0")
	default:
		typeError(fmt.Sprintf("range expected at most 3 arguments, got %d", len(nums)))
	}
	if rg.Len() > MaxRange {
		raise("OverflowError", fmt.Sprintf("Range too big. The sandbox blocks ranges larger than MAX_RANGE (%d).", MaxRange))
	}
	return rg
}

var _ = big.NewInt
