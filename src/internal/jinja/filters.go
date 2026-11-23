package jinja

// jinja2/filters.py's builtin filters.

import (
	"fmt"
	"math"
	"math/big"
	"math/rand"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"github.com/ctrliq/ascender/internal/pystr"
)

type filterFunc func(r *renderer, f *frame, value Value, args []Value, kwargs []kwarg) Value

var filters map[string]filterFunc

// ---------------------------------------------------------------- argument binding

type param struct {
	name   string
	def    Value
	hasDef bool
}

func p(name string) param             { return param{name: name} }
func pd(name string, def Value) param { return param{name: name, def: def, hasDef: true} }

// pyFunc binds a call as a Python function with these parameters would,
// with its error messages. hidden counts a leading environment, context
// or eval context argument the caller does not see.
type pyFunc struct {
	name    string
	hidden  bool
	params  []param
	varargs bool
	varkw   bool
}

func (fn pyFunc) bind(args []Value, kwargs []kwarg) (vals []Value, rest []Value, extra []kwarg) {
	n := len(fn.params)
	vals = make([]Value, n)
	set := make([]bool, n)
	off := 0
	if fn.hidden {
		off = 1
	}
	if len(args) > n {
		if !fn.varargs {
			fn.tooMany(len(args) + off)
		}
		rest = args[n:]
		args = args[:n]
	}
	for i, a := range args {
		vals[i], set[i] = a, true
	}
	for _, kw := range kwargs {
		found := false
		for i, prm := range fn.params {
			if prm.name == kw.Name {
				if set[i] {
					typeError(fmt.Sprintf("%s() got multiple values for argument %s", fn.name, pystr.Repr(kw.Name)))
				}
				vals[i], set[i], found = kw.Value, true, true
				break
			}
		}
		if !found {
			if !fn.varkw {
				typeError(fmt.Sprintf("%s() got an unexpected keyword argument %s", fn.name, pystr.Repr(kw.Name)))
			}
			extra = append(extra, kw)
		}
	}
	var missing []string
	for i, prm := range fn.params {
		if !set[i] {
			if prm.hasDef {
				vals[i] = prm.def
			} else {
				missing = append(missing, pystr.Repr(prm.name))
			}
		}
	}
	if len(missing) > 0 {
		var names string
		switch len(missing) {
		case 1:
			names = missing[0]
		case 2:
			names = missing[0] + " and " + missing[1]
		default:
			names = strings.Join(missing[:len(missing)-1], ", ") + ", and " + missing[len(missing)-1]
		}
		typeError(fmt.Sprintf("%s() missing %d required positional argument%s: %s", fn.name, len(missing), plural(len(missing)), names))
	}
	return vals, rest, extra
}

func (fn pyFunc) tooMany(given int) {
	off := 0
	if fn.hidden {
		off = 1
	}
	total := len(fn.params) + off
	required := off
	for _, prm := range fn.params {
		if !prm.hasDef {
			required++
		}
	}
	if required == total {
		typeError(fmt.Sprintf("%s() takes %d positional argument%s but %d %s given", fn.name, total, plural(total), given, wereWas(given)))
	}
	typeError(fmt.Sprintf("%s() takes from %d to %d positional arguments but %d %s given", fn.name, required, total, given, wereWas(given)))
}

func wereWas(n int) string {
	if n == 1 {
		return "was"
	}
	return "were"
}

// builtin1 binds a C builtin taking exactly one argument (abs, len,
// escape, soft_str).
func builtin1(name string, value Value, args []Value, kwargs []kwarg) {
	if len(kwargs) > 0 {
		typeError(name + "() takes no keyword arguments")
	}
	if len(args) > 0 {
		typeError(fmt.Sprintf("%s() takes exactly one argument (%d given)", name, len(args)+1))
	}
}

// filter wraps a Python filter: value is its first visible parameter.
func filter(fn pyFunc, body func(r *renderer, f *frame, a []Value, rest []Value, extra []kwarg) Value) filterFunc {
	return func(r *renderer, f *frame, value Value, args []Value, kwargs []kwarg) Value {
		vals, rest, extra := fn.bind(append([]Value{value}, args...), kwargs)
		return body(r, f, vals, rest, extra)
	}
}

// ---------------------------------------------------------------- helpers

// softStr is markupsafe.soft_str: str, keeping Markup.
func softStr(v Value) Value {
	if m, ok := v.(Markup); ok {
		return m
	}
	if s, ok := v.(string); ok {
		return s
	}
	return str(v)
}

// callStrMethod calls a str method on soft_str(value).
func callStrMethod(r *renderer, v Value, name string, args ...Value) Value {
	m := &method{recv: softStr(v), name: name}
	return m.Call(r, args, nil)
}

func ignoreCase(v Value) Value {
	switch x := v.(type) {
	case string:
		return pyLower(x)
	case Markup:
		return Markup(pyLower(string(x)))
	}
	return v
}

// attributeParts is _prepare_attribute_parts.
func attributeParts(attr Value) []Value {
	if attr == nil {
		return nil
	}
	if s, ok := asStr(attr); ok {
		var out []Value
		for _, part := range strings.Split(s, ".") {
			if strPred(part, func(c rune) bool { return c >= '0' && c <= '9' }, true) {
				n, _ := strconv.ParseInt(part, 10, 64)
				out = append(out, n)
			} else {
				out = append(out, part)
			}
		}
		return out
	}
	return []Value{attr}
}

// attrGetter is make_attrgetter.
func (r *renderer) attrGetter(attr Value, post func(Value) Value, def Value) func(Value) Value {
	parts := attributeParts(attr)
	return func(item Value) Value {
		for _, part := range parts {
			item = r.getitem(item, part)
			if def != nil && isUndefined(item) {
				item = def
			}
		}
		if post != nil {
			item = post(item)
		}
		return item
	}
}

// multiAttrGetter is make_multi_attrgetter.
func (r *renderer) multiAttrGetter(attr Value, post func(Value) Value) func(Value) Value {
	var split []Value
	if s, ok := attr.(string); ok {
		for _, x := range strings.Split(s, ",") {
			split = append(split, x)
		}
	} else {
		split = []Value{attr}
	}
	var parts [][]Value
	for _, s := range split {
		parts = append(parts, attributeParts(s))
	}
	return func(item Value) Value {
		out := make([]Value, len(parts))
		for i, ps := range parts {
			it := item
			for _, part := range ps {
				it = r.getitem(it, part)
			}
			if post != nil {
				it = post(it)
			}
			out[i] = it
		}
		return &List{Items: out}
	}
}

// pySort is sorted(items, key=key, reverse=reverse): stable, comparing
// with "<", reverse keeping equal items in order.
func pySort(items []Value, key func(Value) Value, reverse bool) []Value {
	out := append([]Value{}, items...)
	keys := make([]Value, len(out))
	for i, it := range out {
		if key != nil {
			keys[i] = key(it)
		} else {
			keys[i] = it
		}
	}
	idx := make([]int, len(out))
	for i := range idx {
		idx[i] = i
	}
	if reverse {
		for i, j := 0, len(idx)-1; i < j; i, j = i+1, j-1 {
			idx[i], idx[j] = idx[j], idx[i]
		}
	}
	sort.SliceStable(idx, func(a, b int) bool { return compare(keys[idx[a]], keys[idx[b]], "<") == -1 })
	if reverse {
		for i, j := 0, len(idx)-1; i < j; i, j = i+1, j-1 {
			idx[i], idx[j] = idx[j], idx[i]
		}
	}
	sorted := make([]Value, len(out))
	for i, j := range idx {
		sorted[i] = out[j]
	}
	return sorted
}

// generator is a Python generator object.
type generator struct {
	name string
	next Iterator
}

func (g *generator) TypeName() string          { return "generator" }
func (g *generator) Module() string            { return "builtins" }
func (g *generator) Attr(string) (Value, bool) { return nil, false }
func (g *generator) Repr() string              { return "<generator object " + g.name + " at 0x7f0000000000>" }
func (g *generator) Iter() Iterator            { return g.next }

// lazy builds a generator whose body runs on the first next, as a Python
// generator function's does.
func lazy(name string, body func() Iterator) *generator {
	var it Iterator
	return &generator{name: name, next: func() (Value, bool) {
		if it == nil {
			it = body()
		}
		return it()
	}}
}

// reverseIterator is reversed(seq).
type reverseIterator struct {
	tname string
	items []Value
	pos   int
}

func (it *reverseIterator) TypeName() string          { return it.tname }
func (it *reverseIterator) Module() string            { return "builtins" }
func (it *reverseIterator) Attr(string) (Value, bool) { return nil, false }
func (it *reverseIterator) Repr() string {
	return "<" + it.tname + " object at 0x7f0000000000>"
}
func (it *reverseIterator) Iter() Iterator {
	return func() (Value, bool) {
		if it.pos >= len(it.items) {
			return nil, false
		}
		it.pos++
		return it.items[len(it.items)-it.pos], true
	}
}

// reversedOf is reversed(v), false for a value that is not reversible.
func reversedOf(v Value) (*reverseIterator, bool) {
	switch x := v.(type) {
	case *List:
		return &reverseIterator{tname: "list_reverseiterator", items: append([]Value{}, x.Items...)}, true
	case Tuple:
		return &reverseIterator{tname: "reversed", items: append([]Value{}, x...)}, true
	case Range:
		return &reverseIterator{tname: "range_iterator", items: toList(x)}, true
	case *Dict:
		return &reverseIterator{tname: "dict_reversekeyiterator", items: append([]Value{}, x.keys...)}, true
	case string, Markup:
		return &reverseIterator{tname: "reversed", items: toList(x)}, true
	case *dictView:
		return &reverseIterator{tname: "dict_reverse" + strings.TrimSuffix(x.kind, "s") + "iterator", items: x.items()}, true
	case *Undefined:
		if x.strict() {
			x.fail()
		}
		return &reverseIterator{tname: "reversed"}, true
	}
	return nil, false
}

func emptyUndefined(r *renderer, hint string) *Undefined {
	return newUndefined(r.undef, hint, nil, false, nil, false, "")
}

// pyInt is int(value) and int(value, base) for the int filter's first try.
func pyIntOf(v Value, base Value) (Value, bool) {
	if s, ok := asStr(v); ok {
		b := 10
		if base != nil {
			if !isInt(base) {
				typeError(pystr.Repr(typeName(base)) + " object cannot be interpreted as an integer")
			}
			b = int(toBig(base).Int64())
		}
		return parsePyInt(s, b)
	}
	switch x := v.(type) {
	case bool, int64, *big.Int:
		return normInt(toBig(x)), true
	case float64:
		if math.IsInf(x, 0) || math.IsNaN(x) {
			return nil, false
		}
		b, _ := new(big.Float).SetFloat64(math.Trunc(x)).Int(nil)
		return normInt(b), true
	case *Undefined:
		x.fail()
	}
	return nil, false
}

// parsePyInt is int(s, base) for a str.
func parsePyInt(s string, base int) (Value, bool) {
	t := pystr.TrimSpace(s)
	t = asciiDigits(t)
	neg := false
	if strings.HasPrefix(t, "+") || strings.HasPrefix(t, "-") {
		neg = t[0] == '-'
		t = t[1:]
	}
	low := strings.ToLower(t)
	switch {
	case (base == 16 || base == 0) && strings.HasPrefix(low, "0x"):
		t, base = t[2:], 16
	case (base == 8 || base == 0) && strings.HasPrefix(low, "0o"):
		t, base = t[2:], 8
	case (base == 2 || base == 0) && strings.HasPrefix(low, "0b"):
		t, base = t[2:], 2
	case base == 0:
		if len(t) > 1 && t[0] == '0' && strings.Trim(t, "0_") != "" {
			return nil, false
		}
		base = 10
	}
	if strings.HasPrefix(t, "_") {
		t = t[1:]
		if base == 10 {
			return nil, false
		}
	}
	if t == "" || strings.HasSuffix(t, "_") || strings.Contains(t, "__") {
		return nil, false
	}
	t = strings.ReplaceAll(t, "_", "")
	b, ok := new(big.Int).SetString(t, base)
	if !ok {
		return nil, false
	}
	if neg {
		b.Neg(b)
	}
	return normInt(b), true
}

// pyFloatOf is float(value): false for the TypeError or ValueError.
func pyFloatOf(v Value) (float64, bool, string) {
	if s, ok := asStr(v); ok {
		t := strings.ReplaceAll(asciiDigits(pystr.TrimSpace(s)), "_", "")
		low := strings.ToLower(t)
		switch strings.TrimLeft(low, "+-") {
		case "inf", "infinity":
			if strings.HasPrefix(low, "-") {
				return math.Inf(-1), true, ""
			}
			return math.Inf(1), true, ""
		case "nan":
			return math.NaN(), true, ""
		}
		if strings.Contains(pystr.TrimSpace(s), "__") || strings.HasPrefix(t, "0x") || strings.HasPrefix(low, "0x") {
			return 0, false, "could not convert string to float: " + pystr.Repr(s)
		}
		f, err := strconv.ParseFloat(t, 64)
		if err != nil && !strings.Contains(err.Error(), "range") {
			return 0, false, "could not convert string to float: " + pystr.Repr(s)
		}
		return f, true, ""
	}
	switch x := v.(type) {
	case bool, int64, *big.Int:
		return toFloat(x), true, ""
	case float64:
		return x, true, ""
	case *Undefined:
		x.fail()
	}
	return 0, false, "float() argument must be a string or a real number, not " + pystr.Repr(typeName(v))
}

// pyRound is round(value, precision).
func pyRound(v Value, precision Value) Value {
	if u, ok := v.(*Undefined); ok {
		u.fail()
	}
	nd := int64(0)
	hasNd := precision != nil
	if hasNd {
		if !isInt(precision) {
			typeError(pystr.Repr(typeName(precision)) + " object cannot be interpreted as an integer")
		}
		nd = toBig(precision).Int64()
	}
	switch x := v.(type) {
	case bool, int64, *big.Int:
		n := toBig(x)
		if !hasNd || nd >= 0 {
			return normInt(n)
		}
		p := new(big.Int).Exp(big.NewInt(10), big.NewInt(-nd), nil)
		q, m := new(big.Int).DivMod(n, p, new(big.Int))
		twice := new(big.Int).Mul(m, big.NewInt(2))
		if c := twice.Cmp(p); c > 0 || c == 0 && q.Bit(0) == 1 {
			q.Add(q, big.NewInt(1))
		}
		return normInt(q.Mul(q, p))
	case float64:
		if math.IsInf(x, 0) || math.IsNaN(x) {
			if !hasNd {
				if math.IsNaN(x) {
					valueError("cannot convert float NaN to integer")
				}
				raise("OverflowError", "cannot convert float infinity to integer")
			}
			return x
		}
		if !hasNd {
			r := math.RoundToEven(x)
			b, _ := new(big.Float).SetFloat64(r).Int(nil)
			return normInt(b)
		}
		if nd > 330 {
			return x
		}
		if nd < -330 {
			return math.Copysign(0, x)
		}
		if nd >= 0 {
			s := strconv.FormatFloat(x, 'f', int(nd), 64)
			f, _ := strconv.ParseFloat(s, 64)
			return f
		}
		p := math.Pow(10, float64(-nd))
		y := math.RoundToEven(x/p) * p
		return y
	}
	typeError("type " + typeName(v) + " doesn't define __round__ method")
	return nil
}

// ---------------------------------------------------------------- the filters

var attrKeyRe = regexp.MustCompile(`[ \t\n\r\f\v/>=]`)

func init() {
	filters = map[string]filterFunc{
		"abs": func(r *renderer, f *frame, v Value, args []Value, kw []kwarg) Value {
			builtin1("abs", v, args, kw)
			switch x := v.(type) {
			case bool, int64, *big.Int:
				return normInt(new(big.Int).Abs(toBig(x)))
			case float64:
				return math.Abs(x)
			case *Complex:
				return math.Hypot(real(x.V), imag(x.V))
			case *Undefined:
				x.fail()
			}
			typeError("bad operand type for abs(): " + pystr.Repr(typeName(v)))
			return nil
		},
		"attr": filter(pyFunc{name: "do_attr", hidden: true, params: []param{p("obj"), p("name")}}, func(r *renderer, f *frame, a, _ []Value, _ []kwarg) Value {
			name, ok := a[1].(string)
			if !ok {
				typeError("attribute name must be string, not " + pystr.Repr(typeName(a[1])))
			}
			if _, found := pyGetattr(a[0], name); !found {
				return newUndefined(r.undef, "", a[0], true, name, true, "")
			}
			return r.getattr(a[0], name)
		}),
		"batch": filter(pyFunc{name: "do_batch", params: []param{p("value"), p("linecount"), pd("fill_with", nil)}}, func(r *renderer, f *frame, a, _ []Value, _ []kwarg) Value {
			return lazy("do_batch", func() Iterator {
				src := iterate(a[0])
				done := false
				return func() (Value, bool) {
					if done {
						return nil, false
					}
					var tmp []Value
					for {
						if len(tmp) > 0 && equal(int64(len(tmp)), a[1]) {
							return &List{Items: tmp}, true
						}
						item, ok := src()
						if !ok {
							done = true
							if len(tmp) == 0 {
								return nil, false
							}
							if a[2] != nil && less(int64(len(tmp)), a[1], "<") {
								n := toBig(sub(a[1], int64(len(tmp)))).Int64()
								for range n {
									tmp = append(tmp, a[2])
								}
							}
							return &List{Items: tmp}, true
						}
						tmp = append(tmp, item)
					}
				}
			})
		}),
		"capitalize": filter(pyFunc{name: "do_capitalize", params: []param{p("s")}}, func(r *renderer, f *frame, a, _ []Value, _ []kwarg) Value {
			return callStrMethod(r, a[0], "capitalize")
		}),
		"center": filter(pyFunc{name: "do_center", params: []param{p("value"), pd("width", int64(80))}}, func(r *renderer, f *frame, a, _ []Value, _ []kwarg) Value {
			return callStrMethod(r, a[0], "center", a[1])
		}),
		"count": func(r *renderer, f *frame, v Value, args []Value, kw []kwarg) Value {
			builtin1("len", v, args, kw)
			return int64(length(v))
		},
		"default": filter(pyFunc{name: "do_default", params: []param{p("value"), pd("default_value", ""), pd("boolean", false)}}, func(r *renderer, f *frame, a, _ []Value, _ []kwarg) Value {
			if isUndefined(a[0]) || (truth(a[2]) && !truth(a[0])) {
				return a[1]
			}
			return a[0]
		}),
		"dictsort": filter(pyFunc{name: "do_dictsort", params: []param{p("value"), pd("case_sensitive", false), pd("by", "key"), pd("reverse", false)}}, func(r *renderer, f *frame, a, _ []Value, _ []kwarg) Value {
			var pos int
			switch {
			case equal(a[2], "key"):
				pos = 0
			case equal(a[2], "value"):
				pos = 1
			default:
				raise("FilterArgumentError", `You can only sort by either "key" or "value"`)
			}
			d, ok := a[0].(*Dict)
			if !ok {
				if _, found := pyGetattr(a[0], "items"); !found {
					raise("AttributeError", pystr.Repr(typeName(a[0]))+" object has no attribute 'items'")
				}
				typeError("dictsort needs a dict")
			}
			items := (&dictView{d: d, kind: "items"}).items()
			cs := truth(a[1])
			return &List{Items: pySort(items, func(it Value) Value {
				v := it.(Tuple)[pos]
				if !cs {
					v = ignoreCase(v)
				}
				return v
			}, truth(a[3]))}
		}),
		"escape": func(r *renderer, f *frame, v Value, args []Value, kw []kwarg) Value {
			builtin1("escape", v, args, kw)
			return escapeValue(v)
		},
		"filesizeformat": filter(pyFunc{name: "do_filesizeformat", params: []param{p("value"), pd("binary", false)}}, func(r *renderer, f *frame, a, _ []Value, _ []kwarg) Value {
			b, ok, msg := pyFloatOf(a[0])
			if !ok {
				if strings.HasPrefix(msg, "float() argument") {
					typeError(msg)
				}
				valueError(msg)
			}
			binary := truth(a[1])
			base := 1000.0
			prefixes := []string{"kB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"}
			if binary {
				base = 1024
				prefixes = []string{"KiB", "MiB", "GiB", "TiB", "PiB", "EiB", "ZiB", "YiB"}
			}
			switch {
			case b == 1:
				return "1 Byte"
			case b < base:
				iv, ok := pyIntOf(b, nil)
				if !ok {
					valueError("cannot convert float NaN to integer")
				}
				return str(iv) + " Bytes"
			}
			var unit float64
			for i, prefix := range prefixes {
				unit = math.Pow(base, float64(i+2))
				if b < unit {
					return formatFloat(base*b/unit, ".1f") + " " + prefix
				}
			}
			return formatFloat(base*b/unit, ".1f") + " " + prefixes[len(prefixes)-1]
		}),
		"first": filter(pyFunc{name: "sync_do_first", hidden: true, params: []param{p("seq")}}, func(r *renderer, f *frame, a, _ []Value, _ []kwarg) Value {
			if v, ok := iterate(a[0])(); ok {
				return v
			}
			return emptyUndefined(r, "No first item, sequence was empty.")
		}),
		"float": filter(pyFunc{name: "do_float", params: []param{p("value"), pd("default", 0.0)}}, func(r *renderer, f *frame, a, _ []Value, _ []kwarg) Value {
			if v, ok, _ := pyFloatOf(a[0]); ok {
				return v
			}
			return a[1]
		}),
		"forceescape": filter(pyFunc{name: "do_forceescape", params: []param{p("value")}}, func(r *renderer, f *frame, a, _ []Value, _ []kwarg) Value {
			v := a[0]
			if h, ok := v.(Markup); ok {
				v = string(h)
			}
			return Markup(escapeHTML(str(v)))
		}),
		"format": filter(pyFunc{name: "do_format", params: []param{p("value")}, varargs: true, varkw: true}, func(r *renderer, f *frame, a, rest []Value, extra []kwarg) Value {
			if len(rest) > 0 && len(extra) > 0 {
				raise("FilterArgumentError", "can't handle positional and keyword arguments at the same time")
			}
			var args Value = Tuple(rest)
			if len(extra) > 0 {
				d := NewDict()
				for _, k := range extra {
					d.Set(k.Name, k.Value)
				}
				args = d
			} else if rest == nil {
				args = Tuple{}
			}
			return mod(softStr(a[0]), args)
		}),
		"groupby": filter(pyFunc{name: "sync_do_groupby", hidden: true, params: []param{p("value"), p("attribute"), pd("default", nil), pd("case_sensitive", false)}}, func(r *renderer, f *frame, a, _ []Value, _ []kwarg) Value {
			cs := truth(a[3])
			var post func(Value) Value
			if !cs {
				post = ignoreCase
			}
			expr := r.attrGetter(a[1], post, a[2])
			sorted := pySort(toList(a[0]), expr, false)
			var out []Value
			var curKey Value
			var cur []Value
			for i, it := range sorted {
				k := expr(it)
				if i == 0 || !equal(k, curKey) {
					if i > 0 {
						out = append(out, &groupTuple{grouper: curKey, list: &List{Items: cur}})
					}
					curKey, cur = k, nil
				}
				cur = append(cur, it)
			}
			if len(sorted) > 0 {
				out = append(out, &groupTuple{grouper: curKey, list: &List{Items: cur}})
			}
			if !cs {
				outExpr := r.attrGetter(a[1], nil, a[2])
				for _, g := range out {
					gt := g.(*groupTuple)
					gt.grouper = outExpr(gt.list.Items[0])
				}
			}
			return &List{Items: out}
		}),
		"indent": filter(pyFunc{name: "do_indent", params: []param{p("s"), pd("width", int64(4)), pd("first", false), pd("blank", false)}}, func(r *renderer, f *frame, a, _ []Value, _ []kwarg) Value {
			var indention Value
			if s, ok := asStr(a[1]); ok {
				indention = s
			} else {
				indention = mul(" ", a[1])
			}
			var newline Value = "\n"
			_, isMarkup := a[0].(Markup)
			if isMarkup {
				indention = Markup(str(indention))
				newline = Markup("\n")
			}
			s := add(a[0], newline)
			lines := toList(callStrMethod(r, s, "splitlines"))
			if isMarkup {
				for i, l := range lines {
					lines[i] = Markup(str(l))
				}
			}
			var rv Value
			nl := str(newline)
			ind := str(indention)
			if truth(a[3]) {
				parts := make([]string, len(lines))
				for i, l := range lines {
					parts[i] = str(l)
				}
				rv = strings.Join(parts, nl+ind)
			} else {
				out := str(lines[0])
				if len(lines) > 1 {
					parts := make([]string, len(lines)-1)
					for i, l := range lines[1:] {
						if str(l) != "" {
							parts[i] = ind + str(l)
						}
					}
					out += nl + strings.Join(parts, nl)
				}
				rv = out
			}
			if truth(a[2]) {
				rv = ind + str(rv)
			}
			if isMarkup {
				return Markup(str(rv))
			}
			return rv
		}),
		"int": filter(pyFunc{name: "do_int", params: []param{p("value"), pd("default", int64(0)), pd("base", int64(10))}}, func(r *renderer, f *frame, a, _ []Value, _ []kwarg) Value {
			var base Value
			if _, isStr := asStr(a[0]); isStr {
				base = a[2]
			}
			if v, ok := pyIntOf(a[0], base); ok {
				return v
			}
			fv, ok, _ := pyFloatOf(a[0])
			if !ok || math.IsInf(fv, 0) || math.IsNaN(fv) {
				return a[1]
			}
			v, _ := pyIntOf(fv, nil)
			return v
		}),
		"items": filter(pyFunc{name: "do_items", params: []param{p("value")}}, func(r *renderer, f *frame, a, _ []Value, _ []kwarg) Value {
			return lazy("do_items", func() Iterator {
				if isUndefined(a[0]) {
					return iterate(&List{})
				}
				d, ok := a[0].(*Dict)
				if !ok {
					typeError("Can only get item pairs from a mapping.")
				}
				return iterate(&List{Items: (&dictView{d: d, kind: "items"}).items()})
			})
		}),
		"join": filter(pyFunc{name: "sync_do_join", hidden: true, params: []param{p("value"), pd("d", ""), pd("attribute", nil)}}, func(r *renderer, f *frame, a, _ []Value, _ []kwarg) Value {
			items := toList(a[0])
			if a[2] != nil {
				get := r.attrGetter(a[2], nil, nil)
				for i, it := range items {
					items[i] = get(it)
				}
			}
			if !truth(f.ctx.eval.autoescape) {
				parts := make([]string, len(items))
				for i, it := range items {
					parts[i] = str(it)
				}
				return strings.Join(parts, str(a[1]))
			}
			if _, isM := a[1].(Markup); !isM {
				doEscape := false
				for _, it := range items {
					if _, ok := it.(Markup); ok {
						doEscape = true
					}
				}
				parts := make([]string, len(items))
				for i, it := range items {
					if doEscape {
						parts[i] = string(escapeValue(it))
					} else {
						parts[i] = str(it)
					}
				}
				if doEscape {
					return Markup(strings.Join(parts, string(escapeValue(a[1]))))
				}
				return strings.Join(parts, str(a[1]))
			}
			parts := make([]string, len(items))
			for i, it := range items {
				parts[i] = string(escapeValue(it))
			}
			return Markup(strings.Join(parts, string(a[1].(Markup))))
		}),
		"last": filter(pyFunc{name: "do_last", hidden: true, params: []param{p("seq")}}, func(r *renderer, f *frame, a, _ []Value, _ []kwarg) Value {
			it, ok := reversedOf(a[0])
			if !ok {
				typeError(pystr.Repr(typeName(a[0])) + " object is not reversible")
			}
			if v, ok := it.Iter()(); ok {
				return v
			}
			return emptyUndefined(r, "No last item, sequence was empty.")
		}),
		"length": func(r *renderer, f *frame, v Value, args []Value, kw []kwarg) Value {
			builtin1("len", v, args, kw)
			return int64(length(v))
		},
		"list": filter(pyFunc{name: "sync_do_list", params: []param{p("value")}}, func(r *renderer, f *frame, a, _ []Value, _ []kwarg) Value {
			items := toList(a[0])
			if items == nil {
				items = []Value{}
			}
			return &List{Items: items}
		}),
		"lower": filter(pyFunc{name: "do_lower", params: []param{p("s")}}, func(r *renderer, f *frame, a, _ []Value, _ []kwarg) Value {
			return callStrMethod(r, a[0], "lower")
		}),
		"map": filter(pyFunc{name: "sync_do_map", hidden: true, params: []param{p("value")}, varargs: true, varkw: true}, func(r *renderer, f *frame, a, rest []Value, extra []kwarg) Value {
			return lazy("sync_do_map", func() Iterator {
				if !truth(a[0]) {
					return iterate(&List{})
				}
				fn := r.prepareMap(f, rest, extra)
				src := iterate(a[0])
				return func() (Value, bool) {
					item, ok := src()
					if !ok {
						return nil, false
					}
					return fn(item), true
				}
			})
		}),
		"max": filter(pyFunc{name: "do_max", hidden: true, params: []param{p("value"), pd("case_sensitive", false), pd("attribute", nil)}}, func(r *renderer, f *frame, a, _ []Value, _ []kwarg) Value {
			return r.minOrMax(a, ">")
		}),
		"min": filter(pyFunc{name: "do_min", hidden: true, params: []param{p("value"), pd("case_sensitive", false), pd("attribute", nil)}}, func(r *renderer, f *frame, a, _ []Value, _ []kwarg) Value {
			return r.minOrMax(a, "<")
		}),
		"pprint": filter(pyFunc{name: "do_pprint", params: []param{p("value")}}, func(r *renderer, f *frame, a, _ []Value, _ []kwarg) Value {
			return pformat(a[0])
		}),
		"random": filter(pyFunc{name: "do_random", hidden: true, params: []param{p("seq")}}, func(r *renderer, f *frame, a, _ []Value, _ []kwarg) Value {
			n := length(a[0])
			if n == 0 {
				return emptyUndefined(r, "No random item, sequence was empty.")
			}
			v, ok := pyGetitem(a[0], int64(rand.Intn(n)))
			if !ok {
				raise("KeyError", "0")
			}
			return v
		}),
		"reject": func(r *renderer, f *frame, v Value, args []Value, kw []kwarg) Value {
			return r.selectOrReject("sync_do_reject", f, v, args, kw, true, false)
		},
		"rejectattr": func(r *renderer, f *frame, v Value, args []Value, kw []kwarg) Value {
			return r.selectOrReject("sync_do_rejectattr", f, v, args, kw, true, true)
		},
		"replace": filter(pyFunc{name: "do_replace", hidden: true, params: []param{p("s"), p("old"), p("new"), pd("count", nil)}}, func(r *renderer, f *frame, a, _ []Value, _ []kwarg) Value {
			count := a[3]
			if count == nil {
				count = int64(-1)
			}
			if !truth(f.ctx.eval.autoescape) {
				return (&method{recv: str(a[0]), name: "replace"}).Call(r, []Value{str(a[1]), str(a[2]), count}, nil)
			}
			_, oldM := a[1].(Markup)
			_, newM := a[2].(Markup)
			_, sM := a[0].(Markup)
			var s Value
			if oldM || (newM && !sM) {
				s = escapeValue(a[0])
			} else {
				s = softStr(a[0])
			}
			return (&method{recv: s, name: "replace"}).Call(r, []Value{softStr(a[1]), softStr(a[2]), count}, nil)
		}),
		"reverse": filter(pyFunc{name: "do_reverse", params: []param{p("value")}}, func(r *renderer, f *frame, a, _ []Value, _ []kwarg) Value {
			if s, ok := asStr(a[0]); ok {
				rs := []rune(s)
				for i, j := 0, len(rs)-1; i < j; i, j = i+1, j-1 {
					rs[i], rs[j] = rs[j], rs[i]
				}
				if _, isM := a[0].(Markup); isM {
					return Markup(rs)
				}
				return string(rs)
			}
			if it, ok := reversedOf(a[0]); ok {
				return it
			}
			if !isIterable(a[0]) {
				raise("FilterArgumentError", "argument must be iterable")
			}
			items := toList(a[0])
			for i, j := 0, len(items)-1; i < j; i, j = i+1, j-1 {
				items[i], items[j] = items[j], items[i]
			}
			if items == nil {
				items = []Value{}
			}
			return &List{Items: items}
		}),
		"round": filter(pyFunc{name: "do_round", params: []param{p("value"), pd("precision", int64(0)), pd("method", "common")}}, func(r *renderer, f *frame, a, _ []Value, _ []kwarg) Value {
			m, _ := asStr(a[2])
			if _, isStr := a[2].(string); !isStr || (m != "common" && m != "ceil" && m != "floor") {
				raise("FilterArgumentError", "method must be common, ceil or floor")
			}
			if m == "common" {
				return pyRound(a[0], a[1])
			}
			scale := power(int64(10), a[1])
			x := toFloat(mul(a[0], scale))
			var y float64
			if m == "ceil" {
				y = math.Ceil(x)
			} else {
				y = math.Floor(x)
			}
			b, _ := new(big.Float).SetFloat64(y).Int(nil)
			return truediv(normInt(b), scale)
		}),
		"safe": filter(pyFunc{name: "do_mark_safe", params: []param{p("value")}}, func(r *renderer, f *frame, a, _ []Value, _ []kwarg) Value {
			if m, ok := a[0].(Markup); ok {
				return m
			}
			return Markup(str(a[0]))
		}),
		"select": func(r *renderer, f *frame, v Value, args []Value, kw []kwarg) Value {
			return r.selectOrReject("sync_do_select", f, v, args, kw, false, false)
		},
		"selectattr": func(r *renderer, f *frame, v Value, args []Value, kw []kwarg) Value {
			return r.selectOrReject("sync_do_selectattr", f, v, args, kw, false, true)
		},
		"slice": filter(pyFunc{name: "sync_do_slice", params: []param{p("value"), p("slices"), pd("fill_with", nil)}}, func(r *renderer, f *frame, a, _ []Value, _ []kwarg) Value {
			return lazy("sync_do_slice", func() Iterator {
				seq := toList(a[0])
				n := int64(len(seq))
				slices := toBig(a[1]).Int64()
				if !isInt(a[1]) {
					typeError("unsupported operand type(s) for //: 'int' and " + pystr.Repr(typeName(a[1])))
				}
				if slices == 0 {
					zeroDivision()
				}
				per := floorDivInt(big.NewInt(n), big.NewInt(slices)).Int64()
				extra := modInt(big.NewInt(n), big.NewInt(slices)).Int64()
				offset := int64(0)
				num := int64(0)
				return func() (Value, bool) {
					if num >= slices {
						return nil, false
					}
					start := offset + num*per
					if num < extra {
						offset++
					}
					end := offset + (num+1)*per
					tmp := pick(seq, sliceIndices(start, end, nil, len(seq)))
					if a[2] != nil && num >= extra {
						tmp = append(tmp, a[2])
					}
					num++
					if tmp == nil {
						tmp = []Value{}
					}
					return &List{Items: tmp}, true
				}
			})
		}),
		"sort": filter(pyFunc{name: "do_sort", hidden: true, params: []param{p("value"), pd("reverse", false), pd("case_sensitive", false), pd("attribute", nil)}}, func(r *renderer, f *frame, a, _ []Value, _ []kwarg) Value {
			var post func(Value) Value
			if !truth(a[2]) {
				post = ignoreCase
			}
			key := r.multiAttrGetter(a[3], post)
			out := pySort(toList(a[0]), key, truth(a[1]))
			if out == nil {
				out = []Value{}
			}
			return &List{Items: out}
		}),
		"string": func(r *renderer, f *frame, v Value, args []Value, kw []kwarg) Value {
			builtin1("soft_str", v, args, kw)
			return softStr(v)
		},
		"striptags": filter(pyFunc{name: "do_striptags", params: []param{p("value")}}, func(r *renderer, f *frame, a, _ []Value, _ []kwarg) Value {
			v := a[0]
			if m, ok := v.(Markup); ok {
				v = string(m)
			}
			return striptags(str(v))
		}),
		"sum": filter(pyFunc{name: "sync_do_sum", hidden: true, params: []param{p("iterable"), pd("attribute", nil), pd("start", int64(0))}}, func(r *renderer, f *frame, a, _ []Value, _ []kwarg) Value {
			items := toList(a[0])
			if a[1] != nil {
				get := r.attrGetter(a[1], nil, nil)
				for i, it := range items {
					items[i] = get(it)
				}
			}
			if _, isStr := asStr(a[2]); isStr {
				typeError("sum() can't sum strings [use ''.join(seq) instead]")
			}
			total := a[2]
			for _, it := range items {
				failUndefined(total, it)
				total = add(total, it)
			}
			return total
		}),
		"title": filter(pyFunc{name: "do_title", params: []param{p("s")}}, func(r *renderer, f *frame, a, _ []Value, _ []kwarg) Value {
			s := softStr(a[0])
			if m, ok := s.(Markup); ok {
				return Markup(doTitlePy(string(m)))
			}
			return doTitlePy(s.(string))
		}),
		"trim": filter(pyFunc{name: "do_trim", params: []param{p("value"), pd("chars", nil)}}, func(r *renderer, f *frame, a, _ []Value, _ []kwarg) Value {
			return callStrMethod(r, a[0], "strip", a[1])
		}),
		"truncate": filter(pyFunc{name: "do_truncate", hidden: true, params: []param{p("s"), pd("length", int64(255)), pd("killwords", false), pd("end", "..."), pd("leeway", nil)}}, func(r *renderer, f *frame, a, _ []Value, _ []kwarg) Value {
			leeway := a[4]
			if leeway == nil {
				leeway = int64(5)
			}
			endLen := int64(length(a[3]))
			if !compareOp("gteq", a[1], endLen) {
				raise("AssertionError", fmt.Sprintf("expected length >= %d, got %s", endLen, str(a[1])))
			}
			if !compareOp("gteq", leeway, int64(0)) {
				raise("AssertionError", "expected leeway >= 0, got "+str(leeway))
			}
			if compareOp("lteq", int64(length(a[0])), add(a[1], leeway)) {
				return a[0]
			}
			cut := r.slice(a[0], nil, sub(a[1], endLen), nil)
			if truth(a[2]) {
				return add(cut, a[3])
			}
			parts := toList(callStrMethod(r, cut, "rsplit", " ", int64(1)))
			return add(parts[0], a[3])
		}),
		"unique": filter(pyFunc{name: "sync_do_unique", hidden: true, params: []param{p("value"), pd("case_sensitive", false), pd("attribute", nil)}}, func(r *renderer, f *frame, a, _ []Value, _ []kwarg) Value {
			return lazy("sync_do_unique", func() Iterator {
				var post func(Value) Value
				if !truth(a[1]) {
					post = ignoreCase
				}
				get := r.attrGetter(a[2], post, nil)
				seen := map[string]bool{}
				src := iterate(a[0])
				return func() (Value, bool) {
					for {
						item, ok := src()
						if !ok {
							return nil, false
						}
						k := hashKey(get(item))
						if !seen[k] {
							seen[k] = true
							return item, true
						}
					}
				}
			})
		}),
		"upper": filter(pyFunc{name: "do_upper", params: []param{p("s")}}, func(r *renderer, f *frame, a, _ []Value, _ []kwarg) Value {
			return callStrMethod(r, a[0], "upper")
		}),
		"urlencode": filter(pyFunc{name: "do_urlencode", params: []param{p("value")}}, func(r *renderer, f *frame, a, _ []Value, _ []kwarg) Value {
			v := a[0]
			if _, isStr := asStr(v); isStr || !isIterable(v) {
				return urlQuote(v, false)
			}
			var items []Value
			if d, ok := v.(*Dict); ok {
				items = (&dictView{d: d, kind: "items"}).items()
			} else {
				items = toList(v)
			}
			parts := make([]string, len(items))
			for i, it := range items {
				kv := unpack(it, 2)
				parts[i] = urlQuote(kv[0], true) + "=" + urlQuote(kv[1], true)
			}
			return strings.Join(parts, "&")
		}),
		"urlize": filter(pyFunc{name: "do_urlize", hidden: true, params: []param{p("value"), pd("trim_url_limit", nil), pd("nofollow", false), pd("target", nil), pd("rel", nil), pd("extra_schemes", nil)}}, func(r *renderer, f *frame, a, _ []Value, _ []kwarg) Value {
			out := r.doUrlize(a)
			if truth(f.ctx.eval.autoescape) {
				return Markup(out)
			}
			return out
		}),
		"wordcount": filter(pyFunc{name: "do_wordcount", params: []param{p("s")}}, func(r *renderer, f *frame, a, _ []Value, _ []kwarg) Value {
			return int64(wordCount(str(softStr(a[0]))))
		}),
		"wordwrap": filter(pyFunc{name: "do_wordwrap", hidden: true, params: []param{p("s"), pd("width", int64(79)), pd("break_long_words", true), pd("wrapstring", nil), pd("break_on_hyphens", true)}}, func(r *renderer, f *frame, a, _ []Value, _ []kwarg) Value {
			wrap := a[3]
			if wrap == nil {
				wrap = "\n"
			}
			ws := str(wrap)
			lines := toList(callStrMethod(r, a[0], "splitlines"))
			out := make([]string, len(lines))
			for i, l := range lines {
				out[i] = strings.Join(textwrap(str(l), int(toBig(a[1]).Int64()), truth(a[2]), truth(a[4])), ws)
			}
			return strings.Join(out, ws)
		}),
		"xmlattr": filter(pyFunc{name: "do_xmlattr", hidden: true, params: []param{p("d"), pd("autospace", true)}}, func(r *renderer, f *frame, a, _ []Value, _ []kwarg) Value {
			d, ok := a[0].(*Dict)
			if !ok {
				raise("AttributeError", pystr.Repr(typeName(a[0]))+" object has no attribute 'items'")
			}
			var items []string
			for i, k := range d.keys {
				v := d.vals[i]
				if v == nil || isUndefined(v) {
					continue
				}
				ks := str(k)
				if attrKeyRe.MatchString(ks) {
					valueError("Invalid character in attribute name: " + repr(k))
				}
				items = append(items, string(escapeValue(k))+`="`+string(escapeValue(v))+`"`)
			}
			rv := strings.Join(items, " ")
			if truth(a[1]) && rv != "" {
				rv = " " + rv
			}
			if truth(f.ctx.eval.autoescape) {
				return Markup(rv)
			}
			return rv
		}),
		"tojson": filter(pyFunc{name: "do_tojson", hidden: true, params: []param{p("value"), pd("indent", nil)}}, func(r *renderer, f *frame, a, _ []Value, _ []kwarg) Value {
			return Markup(htmlsafeJSON(a[0], a[1]))
		}),
	}
	filters["d"] = filters["default"]
	filters["e"] = filters["escape"]
}

// groupTuple is filters._GroupTuple: a (grouper, list) namedtuple that
// prints as a plain tuple.
type groupTuple struct {
	grouper Value
	list    *List
}

func (g *groupTuple) TypeName() string { return "_GroupTuple" }
func (g *groupTuple) Module() string   { return "jinja2.filters" }
func (g *groupTuple) Repr() string     { return repr(Tuple{g.grouper, g.list}) }
func (g *groupTuple) Attr(name string) (Value, bool) {
	switch name {
	case "grouper":
		return g.grouper, true
	case "list":
		return g.list, true
	case "count", "index":
		return &method{recv: Tuple{g.grouper, g.list}, name: name}, true
	}
	return nil, false
}
func (g *groupTuple) Item(key Value) (Value, bool) { return pyGetitem(Tuple{g.grouper, g.list}, key) }
func (g *groupTuple) Len() int                     { return 2 }
func (g *groupTuple) Iter() Iterator               { return iterate(Tuple{g.grouper, g.list}) }
func (g *groupTuple) Equal(o Value) bool {
	if t, ok := o.(Tuple); ok {
		return equal(Tuple{g.grouper, g.list}, t)
	}
	if t, ok := o.(*groupTuple); ok {
		return equal(g.grouper, t.grouper) && equal(g.list, t.list)
	}
	return false
}

func (r *renderer) minOrMax(a []Value, op string) Value {
	src := iterate(a[0])
	first, ok := src()
	if !ok {
		return emptyUndefined(r, "No aggregated item, sequence was empty.")
	}
	var post func(Value) Value
	if !truth(a[1]) {
		post = ignoreCase
	}
	key := r.attrGetter(a[2], post, nil)
	best, bestKey := first, key(first)
	for {
		it, ok := src()
		if !ok {
			return best
		}
		k := key(it)
		if compare(k, bestKey, op) == map[string]int{"<": -1, ">": 1}[op] {
			best, bestKey = it, k
		}
	}
}

// prepareMap is filters.prepare_map.
func (r *renderer) prepareMap(f *frame, args []Value, kwargs []kwarg) func(Value) Value {
	attrIdx := -1
	for i, k := range kwargs {
		if k.Name == "attribute" {
			attrIdx = i
		}
	}
	if len(args) == 0 && attrIdx >= 0 {
		attr := kwargs[attrIdx].Value
		var def Value
		var rest []kwarg
		for i, k := range kwargs {
			if i == attrIdx {
				continue
			}
			if k.Name == "default" {
				def = k.Value
				continue
			}
			rest = append(rest, k)
		}
		if len(rest) > 0 {
			raise("FilterArgumentError", "Unexpected keyword argument "+pystr.Repr(rest[0].Name))
		}
		return r.attrGetter(attr, nil, def)
	}
	if len(args) == 0 {
		raise("FilterArgumentError", "map requires a filter argument")
	}
	name, rest := args[0], args[1:]
	return func(item Value) Value { return r.callFilter(f, name, item, rest, kwargs) }
}

// callFilter is Environment.call_filter.
func (r *renderer) callFilter(f *frame, name Value, value Value, args []Value, kwargs []kwarg) Value {
	s, _ := name.(string)
	fn, ok := filters[s]
	if !ok {
		r.unknownFilterTest("filter", name)
	}
	return fn(r, f, value, args, kwargs)
}

// callTest is Environment.call_test.
func (r *renderer) callTest(f *frame, name Value, value Value, args []Value, kwargs []kwarg) Value {
	s, _ := name.(string)
	fn, ok := tests[s]
	if !ok {
		r.unknownFilterTest("test", name)
	}
	return fn(r, f, value, args, kwargs)
}

func (r *renderer) unknownFilterTest(kind string, name Value) {
	if _, isStr := name.(string); !isStr {
		_ = hashKey(name)
	}
	msg := "No " + kind + " named " + repr(name) + "."
	if u, ok := name.(*Undefined); ok {
		msg += " (" + u.message() + "; did you forget to quote the callable name?)"
	}
	raise("TemplateRuntimeError", msg)
}

// selectOrReject is filters.select_or_reject.
func (r *renderer) selectOrReject(name string, f *frame, value Value, args []Value, kwargs []kwarg, reject, lookupAttr bool) Value {
	return lazy(name, func() Iterator {
		if !truth(value) {
			return iterate(&List{})
		}
		trans := func(v Value) Value { return v }
		off := 0
		if lookupAttr {
			if len(args) == 0 {
				raise("FilterArgumentError", "Missing parameter for attribute name")
			}
			trans = r.attrGetter(args[0], nil, nil)
			off = 1
		}
		var test func(Value) bool
		if len(args) > off {
			tname, targs := args[off], args[1+off:]
			test = func(v Value) bool { return truth(r.callTest(f, tname, v, targs, kwargs)) }
		} else {
			test = truth
		}
		src := iterate(value)
		return func() (Value, bool) {
			for {
				item, ok := src()
				if !ok {
					return nil, false
				}
				if test(trans(item)) != reject {
					return item, true
				}
			}
		}
	})
}

// urlQuote is jinja2.utils.url_quote.
func urlQuote(v Value, forQS bool) string {
	s, ok := asStr(v)
	if !ok {
		s = str(v)
	}
	var b strings.Builder
	for _, c := range []byte(s) {
		switch {
		case c >= 'A' && c <= 'Z', c >= 'a' && c <= 'z', c >= '0' && c <= '9', c == '_', c == '.', c == '-', c == '~':
			b.WriteByte(c)
		case c == '/' && !forQS:
			b.WriteByte(c)
		default:
			fmt.Fprintf(&b, "%%%02X", c)
		}
	}
	out := b.String()
	if forQS {
		out = strings.ReplaceAll(out, "%20", "+")
	}
	return out
}
