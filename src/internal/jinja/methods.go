package jinja

// The builtin types' attributes and methods a template can reach.

import (
	"fmt"
	"math"
	"math/big"
	"sort"
	"strings"
	"unicode"
	"unicode/utf8"

	"golang.org/x/text/cases"
	"golang.org/x/text/language"

	"github.com/ctrliq/ascender/internal/pystr"
)

// method is a bound builtin method.
type method struct {
	recv Value
	name string
}

func (m *method) TypeName() string { return "builtin_function_or_method" }
func (m *method) Module() string   { return "builtins" }
func (m *method) Attr(name string) (Value, bool) {
	switch name {
	case "__name__":
		return m.name, true
	case "__self__":
		return m.recv, true
	}
	return nil, false
}
func (m *method) Repr() string {
	return fmt.Sprintf("<built-in method %s of %s object at 0x7f0000000000>", m.name, typeName(m.recv))
}

// builtinAttr is a non-method attribute of a builtin value.
func builtinAttr(obj Value, attr string) (Value, bool) {
	switch x := obj.(type) {
	case bool, int64, *big.Int:
		switch attr {
		case "real", "numerator":
			return normInt(toBig(x)), true
		case "imag":
			return int64(0), true
		case "denominator":
			return int64(1), true
		}
	case float64:
		switch attr {
		case "real":
			return x, true
		case "imag":
			return 0.0, true
		}
	case Range:
		switch attr {
		case "start":
			return x.Start, true
		case "stop":
			return x.Stop, true
		case "step":
			return x.Step, true
		}
	}
	return nil, false
}

// args helpers ---------------------------------------------------------

type argList struct {
	fn     string
	args   []Value
	kwargs []kwarg
}

func (a argList) noKwargs() {
	if len(a.kwargs) > 0 {
		typeError(a.fn + "() takes no keyword arguments")
	}
}

func (a argList) count(min, max int) {
	a.noKwargs()
	n := len(a.args)
	switch {
	case max == 0 && n > 0:
		typeError(fmt.Sprintf("%s() takes no arguments (%d given)", a.fn, n))
	case min == max && n != min:
		typeError(fmt.Sprintf("%s() takes exactly one argument (%d given)", a.fn, n))
	case n < min:
		typeError(fmt.Sprintf("%s expected at least %d argument%s, got %d", a.fn, min, plural(min), n))
	case max >= 0 && n > max:
		typeError(fmt.Sprintf("%s expected at most %d argument%s, got %d", a.fn, max, plural(max), n))
	}
}

func plural(n int) string {
	if n == 1 {
		return ""
	}
	return "s"
}

// named binds positional-or-keyword parameters with their defaults.
func (a argList) named(names []string, defaults []Value) []Value {
	out := make([]Value, len(names))
	set := make([]bool, len(names))
	if len(a.args) > len(names) {
		typeError(fmt.Sprintf("%s() takes at most %d arguments (%d given)", a.fn, len(names), len(a.args)))
	}
	for i, v := range a.args {
		out[i], set[i] = v, true
	}
	for _, kw := range a.kwargs {
		found := false
		for i, n := range names {
			if n == kw.Name {
				if set[i] {
					typeError(fmt.Sprintf("argument for %s() given by name (%s) and position (%d)", a.fn, pystr.Repr(kw.Name), i+1))
				}
				out[i], set[i], found = kw.Value, true, true
			}
		}
		if !found {
			typeError(fmt.Sprintf("%s() got an unexpected keyword argument %s", a.fn, pystr.Repr(kw.Name)))
		}
	}
	for i := range names {
		if !set[i] {
			if i >= len(names)-len(defaults) {
				out[i] = defaults[i-(len(names)-len(defaults))]
			} else {
				typeError(fmt.Sprintf("%s() missing required argument %s (pos %d)", a.fn, pystr.Repr(names[i]), i+1))
			}
		}
	}
	return out
}

func mustStr(v Value, ctx string) string {
	s, ok := asStr(v)
	if !ok {
		typeError(ctx + " must be str, not " + typeName(v))
	}
	return s
}

func optInt(v Value, def int) int {
	if v == nil {
		return def
	}
	if !isInt(v) {
		typeError(pystr.Repr(typeName(v)) + " object cannot be interpreted as an integer")
	}
	return int(toBig(v).Int64())
}

// Call dispatches a bound builtin method.
func (m *method) Call(r *renderer, args []Value, kwargs []kwarg) Value {
	a := argList{fn: m.name, args: args, kwargs: kwargs}
	switch x := m.recv.(type) {
	case string:
		return strMethod(r, x, m.name, a)
	case Markup:
		return markupMethod(r, x, m.name, a)
	case *Dict:
		return dictMethod(x, m.name, a)
	case *List:
		return seqMethod(x.Items, m.name, a, "list")
	case Tuple:
		return seqMethod(x, m.name, a, "tuple")
	case bool, int64, *big.Int:
		return intMethod(toBig(x), m.name, a)
	case float64:
		return floatMethod(x, m.name, a)
	case Range:
		switch m.name {
		case "index", "count":
			a.count(1, 1)
			n := x.Len()
			for i := int64(0); i < n; i++ {
				if equal(x.At(i), args[0]) {
					if m.name == "index" {
						return i
					}
					return int64(1)
				}
			}
			if m.name == "count" {
				return int64(0)
			}
			valueError(repr(args[0]) + " is not in range")
		}
	}
	raise("NotImplementedError", typeName(m.recv)+"."+m.name+"() is not supported in templates")
	return nil
}

// str ------------------------------------------------------------------

var (
	upperCaser = cases.Upper(language.Und)
	lowerCaser = cases.Lower(language.Und)
	foldCaser  = cases.Fold()
	titleCaser = cases.Title(language.Und, cases.NoLower)
)

func pyUpper(s string) string { return upperCaser.String(s) }
func pyLower(s string) string { return lowerCaser.String(s) }

func isCased(r rune) bool { return unicode.IsUpper(r) || unicode.IsLower(r) || unicode.IsTitle(r) }

// pyTitle is str.title(): a cased character after an uncased one starts
// a word.
func pyTitle(s string) string {
	var b strings.Builder
	prevCased := false
	for _, r := range s {
		if prevCased {
			b.WriteString(pyLower(string(r)))
		} else {
			b.WriteString(titleRune(r))
		}
		prevCased = isCased(r)
	}
	return b.String()
}

func titleRune(r rune) string { return titleCaser.String(string(r)) }

func pyCapitalize(s string) string {
	if s == "" {
		return s
	}
	r, n := utf8.DecodeRuneInString(s)
	return titleRune(r) + pyLower(s[n:])
}

func pySwapcase(s string) string {
	var b strings.Builder
	for _, r := range s {
		switch {
		case unicode.IsUpper(r):
			b.WriteString(pyLower(string(r)))
		case unicode.IsLower(r):
			b.WriteString(pyUpper(string(r)))
		default:
			b.WriteRune(r)
		}
	}
	return b.String()
}

// pySplit is str.split / rsplit.
func pySplit(s string, sep Value, maxsplit int, right bool) []Value {
	var parts []string
	if sep == nil {
		fields := strings.FieldsFunc(s, pystr.IsSpace)
		if maxsplit < 0 || maxsplit >= len(fields)-1 {
			parts = fields
		} else if !right {
			// Split maxsplit times from the left, keeping the rest whole.
			rest := strings.TrimLeftFunc(s, pystr.IsSpace)
			for i := 0; i < maxsplit; i++ {
				k := strings.IndexFunc(rest, pystr.IsSpace)
				parts = append(parts, rest[:k])
				rest = strings.TrimLeftFunc(rest[k:], pystr.IsSpace)
			}
			if rest != "" {
				parts = append(parts, rest)
			}
		} else {
			rest := strings.TrimRightFunc(s, pystr.IsSpace)
			var rev []string
			for i := 0; i < maxsplit; i++ {
				k := strings.LastIndexFunc(rest, pystr.IsSpace)
				rev = append(rev, rest[k+1:])
				rest = strings.TrimRightFunc(rest[:k+1], pystr.IsSpace)
			}
			if rest != "" {
				rev = append(rev, rest)
			}
			for i := len(rev) - 1; i >= 0; i-- {
				parts = append(parts, rev[i])
			}
		}
	} else {
		sp := mustStr(sep, "sep")
		if sp == "" {
			valueError("empty separator")
		}
		if maxsplit < 0 {
			parts = strings.Split(s, sp)
		} else if !right {
			parts = strings.SplitN(s, sp, maxsplit+1)
		} else {
			rest := s
			var rev []string
			for i := 0; i < maxsplit; i++ {
				k := strings.LastIndex(rest, sp)
				if k < 0 {
					break
				}
				rev = append(rev, rest[k+len(sp):])
				rest = rest[:k]
			}
			rev = append(rev, rest)
			for i := len(rev) - 1; i >= 0; i-- {
				parts = append(parts, rev[i])
			}
		}
	}
	out := make([]Value, len(parts))
	for i, p := range parts {
		out[i] = p
	}
	return out
}

func pySplitlines(s string, keepends bool) []Value {
	var out []Value
	r := []rune(s)
	start := 0
	for i := 0; i < len(r); i++ {
		c := r[i]
		if c == '\n' || c == '\r' || c == '\v' || c == '\f' || c == 0x1c || c == 0x1d || c == 0x1e || c == 0x85 || c == 0x2028 || c == 0x2029 {
			end := i + 1
			if c == '\r' && i+1 < len(r) && r[i+1] == '\n' {
				end++
			}
			if keepends {
				out = append(out, string(r[start:end]))
			} else {
				out = append(out, string(r[start:i]))
			}
			i = end - 1
			start = end
		}
	}
	if start < len(r) {
		out = append(out, string(r[start:]))
	}
	return out
}

// subRange applies the optional start and end arguments of find, count,
// startswith and the like.
func subRange(s string, args []Value) (string, int) {
	r := []rune(s)
	n := len(r)
	lo, hi := 0, n
	norm := func(v int) int {
		if v < 0 {
			v += n
			if v < 0 {
				v = 0
			}
		}
		if v > n {
			v = n
		}
		return v
	}
	if len(args) > 0 && args[0] != nil {
		lo = norm(optInt(args[0], 0))
	}
	if len(args) > 1 && args[1] != nil {
		hi = norm(optInt(args[1], n))
	}
	if lo > hi {
		return "", -1
	}
	return string(r[lo:hi]), lo
}

func runeIndex(s string, byteIdx int) int { return utf8.RuneCountInString(s[:byteIdx]) }

func stripChars(s string, chars Value, left, right bool) string {
	if chars == nil {
		if left {
			s = strings.TrimLeftFunc(s, pystr.IsSpace)
		}
		if right {
			s = strings.TrimRightFunc(s, pystr.IsSpace)
		}
		return s
	}
	cs := mustStr(chars, "strip arg")
	if left {
		s = strings.TrimLeft(s, cs)
	}
	if right {
		s = strings.TrimRight(s, cs)
	}
	return s
}

func padTo(s string, width int, fill string, mode byte) string {
	n := utf8.RuneCountInString(s)
	if width <= n {
		return s
	}
	pad := width - n
	switch mode {
	case 'l':
		return s + strings.Repeat(fill, pad)
	case 'r':
		return strings.Repeat(fill, pad) + s
	}
	// str.center puts the extra character on the left when the width and
	// the padding are both odd.
	left := pad / 2
	if pad%2 == 1 && width%2 == 1 {
		left++
	}
	return strings.Repeat(fill, left) + s + strings.Repeat(fill, pad-left)
}

func fillArg(a argList) string {
	if len(a.args) > 1 {
		f, ok := asStr(a.args[1])
		if !ok || utf8.RuneCountInString(f) != 1 {
			typeError("The fill character must be exactly one character long")
		}
		return f
	}
	return " "
}

func strPred(s string, f func(rune) bool, nonEmpty bool) bool {
	if s == "" {
		return false
	}
	for _, r := range s {
		if !f(r) {
			return false
		}
	}
	return nonEmpty
}

func strMethod(r *renderer, s, name string, a argList) Value {
	switch name {
	case "upper":
		a.count(0, 0)
		return pyUpper(s)
	case "lower":
		a.count(0, 0)
		return pyLower(s)
	case "casefold":
		a.count(0, 0)
		return foldCaser.String(s)
	case "title":
		a.count(0, 0)
		return pyTitle(s)
	case "capitalize":
		a.count(0, 0)
		return pyCapitalize(s)
	case "swapcase":
		a.count(0, 0)
		return pySwapcase(s)
	case "strip", "lstrip", "rstrip":
		a.count(0, 1)
		var chars Value
		if len(a.args) > 0 {
			chars = a.args[0]
		}
		return stripChars(s, chars, name != "rstrip", name != "lstrip")
	case "split", "rsplit":
		p := a.named([]string{"sep", "maxsplit"}, []Value{nil, int64(-1)})
		return &List{Items: pySplit(s, p[0], optInt(p[1], -1), name == "rsplit")}
	case "splitlines":
		p := a.named([]string{"keepends"}, []Value{false})
		return &List{Items: pySplitlines(s, truth(p[0]))}
	case "join":
		a.count(1, 1)
		items := toList(a.args[0])
		parts := make([]string, len(items))
		for i, it := range items {
			v, ok := asStr(it)
			if !ok {
				typeError(fmt.Sprintf("sequence item %d: expected str instance, %s found", i, typeName(it)))
			}
			parts[i] = v
		}
		return strings.Join(parts, s)
	case "replace":
		p := a.named([]string{"old", "new", "count"}, []Value{int64(-1)})
		return strings.Replace(s, mustStr(p[0], "replace() argument 1"), mustStr(p[1], "replace() argument 2"), optInt(p[2], -1))
	case "startswith", "endswith":
		a.count(1, 3)
		sub, _ := subRange(s, a.args[1:])
		test := func(prefix string) bool {
			if name == "startswith" {
				return strings.HasPrefix(sub, prefix)
			}
			return strings.HasSuffix(sub, prefix)
		}
		if t, ok := a.args[0].(Tuple); ok {
			for _, it := range t {
				if test(mustStr(it, "tuple for "+name)) {
					return true
				}
			}
			return false
		}
		p, ok := asStr(a.args[0])
		if !ok {
			typeError(name + " first arg must be str or a tuple of str, not " + typeName(a.args[0]))
		}
		return test(p)
	case "find", "rfind", "index", "rindex", "count":
		a.count(1, 3)
		sub := mustStr(a.args[0], "must be str, not "+typeName(a.args[0])+"; argument")
		hay, off := subRange(s, a.args[1:])
		if off < 0 {
			if name == "count" {
				return int64(0)
			}
			if strings.HasPrefix(name, "r") || name == "find" {
				if name == "index" || name == "rindex" {
					valueError("substring not found")
				}
				return int64(-1)
			}
		}
		switch name {
		case "count":
			if sub == "" {
				return int64(utf8.RuneCountInString(hay) + 1)
			}
			return int64(strings.Count(hay, sub))
		case "find", "index":
			k := strings.Index(hay, sub)
			if k < 0 {
				if name == "index" {
					valueError("substring not found")
				}
				return int64(-1)
			}
			return int64(off + runeIndex(hay, k))
		default:
			k := strings.LastIndex(hay, sub)
			if k < 0 {
				if name == "rindex" {
					valueError("substring not found")
				}
				return int64(-1)
			}
			return int64(off + runeIndex(hay, k))
		}
	case "partition", "rpartition":
		a.count(1, 1)
		sep := mustStr(a.args[0], "sep")
		if sep == "" {
			valueError("empty separator")
		}
		var k int
		if name == "partition" {
			k = strings.Index(s, sep)
			if k < 0 {
				return Tuple{s, "", ""}
			}
		} else {
			k = strings.LastIndex(s, sep)
			if k < 0 {
				return Tuple{"", "", s}
			}
		}
		return Tuple{s[:k], sep, s[k+len(sep):]}
	case "center", "ljust", "rjust":
		a.count(1, 2)
		return padTo(s, optInt(a.args[0], 0), fillArg(a), map[string]byte{"center": 'c', "ljust": 'l', "rjust": 'r'}[name])
	case "zfill":
		a.count(1, 1)
		w := optInt(a.args[0], 0)
		n := utf8.RuneCountInString(s)
		if w <= n {
			return s
		}
		sign := ""
		body := s
		if s != "" && (s[0] == '+' || s[0] == '-') {
			sign, body = s[:1], s[1:]
		}
		return sign + strings.Repeat("0", w-n) + body
	case "removeprefix":
		a.count(1, 1)
		return strings.TrimPrefix(s, mustStr(a.args[0], "removeprefix() argument"))
	case "removesuffix":
		a.count(1, 1)
		return strings.TrimSuffix(s, mustStr(a.args[0], "removesuffix() argument"))
	case "expandtabs":
		p := a.named([]string{"tabsize"}, []Value{int64(8)})
		size := optInt(p[0], 8)
		var b strings.Builder
		col := 0
		for _, c := range s {
			switch c {
			case '\t':
				if size > 0 {
					n := size - col%size
					b.WriteString(strings.Repeat(" ", n))
					col += n
				}
			case '\n', '\r':
				b.WriteRune(c)
				col = 0
			default:
				b.WriteRune(c)
				col++
			}
		}
		return b.String()
	case "isupper", "islower":
		a.count(0, 0)
		cased := false
		for _, c := range s {
			if unicode.IsUpper(c) || unicode.IsTitle(c) {
				if name == "islower" {
					return false
				}
				cased = true
			} else if unicode.IsLower(c) {
				if name == "isupper" {
					return false
				}
				cased = true
			}
		}
		return cased
	case "istitle":
		a.count(0, 0)
		return pyTitle(s) == s && strings.IndexFunc(s, isCased) >= 0
	case "isalpha":
		a.count(0, 0)
		return strPred(s, unicode.IsLetter, true)
	case "isalnum":
		a.count(0, 0)
		return strPred(s, func(c rune) bool { return unicode.IsLetter(c) || unicode.IsNumber(c) }, true)
	case "isdigit", "isdecimal":
		a.count(0, 0)
		return strPred(s, unicode.IsDigit, true)
	case "isnumeric":
		a.count(0, 0)
		return strPred(s, unicode.IsNumber, true)
	case "isspace":
		a.count(0, 0)
		return strPred(s, pystr.IsSpace, true)
	case "isascii":
		a.count(0, 0)
		for _, c := range s {
			if c >= 0x80 {
				return false
			}
		}
		return true
	case "isidentifier":
		a.count(0, 0)
		return pystr.IsIdentifier(s)
	case "isprintable":
		a.count(0, 0)
		for _, c := range s {
			if !pystr.IsPrintable(c) {
				return false
			}
		}
		return true
	case "format":
		return strFormat(r, s, a.args, kwargsMap(a.kwargs), 0)
	case "format_map":
		if len(a.kwargs) > 0 {
			typeError("format_map() takes no keyword arguments")
		}
		if len(a.args) != 1 {
			typeError(fmt.Sprintf("format_map() takes exactly one argument (%d given)", len(a.args)))
		}
		return strFormat(r, s, nil, mappingToMap(a.args[0]), 0)
	case "encode":
		raise("NotImplementedError", "str.encode() is not supported in templates")
	}
	raise("NotImplementedError", "str."+name+"() is not supported in templates")
	return nil
}

func kwargsMap(kw []kwarg) map[string]Value {
	m := map[string]Value{}
	for _, k := range kw {
		m[k.Name] = k.Value
	}
	return m
}

func mappingToMap(v Value) map[string]Value {
	m := map[string]Value{}
	if d, ok := v.(*Dict); ok {
		for i, k := range d.keys {
			if s, ok := asStr(k); ok {
				m[s] = d.vals[i]
			}
		}
	}
	return m
}

// markupMethod is a Markup method: the str method with str arguments
// escaped and a Markup result where markupsafe wraps one.
func markupMethod(r *renderer, m Markup, name string, a argList) Value {
	switch name {
	case "striptags":
		a.count(0, 0)
		return striptags(string(m))
	case "unescape":
		a.count(0, 0)
		return unescapeHTML(string(m))
	case "escape":
		a.count(1, 1)
		return escapeValue(a.args[0])
	}
	escArgs := make([]Value, len(a.args))
	for i, v := range a.args {
		if s, ok := v.(string); ok {
			escArgs[i] = escapeHTML(s)
		} else {
			escArgs[i] = v
		}
	}
	a.args = escArgs
	if name == "format" || name == "format_map" {
		escKw := make([]kwarg, len(a.kwargs))
		for i, k := range a.kwargs {
			escKw[i] = k
			if s, ok := k.Value.(string); ok {
				escKw[i].Value = Markup(escapeHTML(s))
			}
		}
		a.kwargs = escKw
	}
	out := strMethod(r, string(m), name, a)
	switch name {
	case "capitalize", "title", "lower", "upper", "replace", "ljust", "rjust", "lstrip", "rstrip", "center", "strip",
		"expandtabs", "swapcase", "zfill", "casefold", "removeprefix", "removesuffix", "join", "format", "format_map":
		if s, ok := out.(string); ok {
			return Markup(s)
		}
	case "split", "rsplit", "splitlines":
		l := out.(*List)
		for i, it := range l.Items {
			l.Items[i] = Markup(it.(string))
		}
	case "partition", "rpartition":
		t := out.(Tuple)
		for i, it := range t {
			t[i] = Markup(it.(string))
		}
	}
	return out
}

// dict -----------------------------------------------------------------

func dictMethod(d *Dict, name string, a argList) Value {
	switch name {
	case "items", "keys", "values":
		a.count(0, 0)
		return &dictView{d: d, kind: name}
	case "get":
		a.count(1, 2)
		if !hashable(a.args[0]) {
			_ = hashKey(a.args[0])
		}
		if v, ok := d.Get(a.args[0]); ok {
			return v
		}
		if len(a.args) > 1 {
			return a.args[1]
		}
		return nil
	case "copy":
		a.count(0, 0)
		return d.Copy()
	}
	raise("NotImplementedError", "dict."+name+"() is not supported in templates")
	return nil
}

// dictView is dict.keys(), values() or items().
type dictView struct {
	d    *Dict
	kind string
}

func (v *dictView) TypeName() string               { return "dict_" + v.kind }
func (v *dictView) Module() string                 { return "builtins" }
func (v *dictView) Attr(name string) (Value, bool) { return nil, false }
func (v *dictView) Len() int                       { return v.d.Len() }
func (v *dictView) items() []Value {
	out := make([]Value, v.d.Len())
	for i, k := range v.d.keys {
		switch v.kind {
		case "keys":
			out[i] = k
		case "values":
			out[i] = v.d.vals[i]
		default:
			out[i] = Tuple{k, v.d.vals[i]}
		}
	}
	return out
}
func (v *dictView) Iter() Iterator { return iterate(&List{Items: v.items()}) }
func (v *dictView) Repr() string {
	return "dict_" + v.kind + "([" + joinRepr(v.items()) + "])"
}
func (v *dictView) Contains(item Value) bool {
	switch v.kind {
	case "keys":
		_, ok := v.d.Get(item)
		return ok
	case "items":
		t, ok := item.(Tuple)
		if !ok || len(t) != 2 {
			return false
		}
		val, found := v.d.Get(t[0])
		return found && equal(val, t[1])
	}
	for _, x := range v.d.vals {
		if equal(x, item) {
			return true
		}
	}
	return false
}

// list / tuple ---------------------------------------------------------

func seqMethod(items []Value, name string, a argList, tname string) Value {
	switch name {
	case "index":
		a.count(1, 3)
		sub := append([]Value{}, items...)
		lo := 0
		if len(a.args) > 1 {
			lo = optInt(a.args[1], 0)
			if lo < 0 {
				lo += len(items)
				if lo < 0 {
					lo = 0
				}
			}
		}
		hi := len(items)
		if len(a.args) > 2 {
			hi = optInt(a.args[2], len(items))
			if hi < 0 {
				hi += len(items)
			}
			if hi > len(items) {
				hi = len(items)
			}
		}
		for i := lo; i < hi; i++ {
			if equal(sub[i], a.args[0]) {
				return int64(i)
			}
		}
		if tname == "tuple" {
			valueError("tuple.index(x): x not in tuple")
		}
		valueError(repr(a.args[0]) + " is not in list")
	case "count":
		a.count(1, 1)
		n := int64(0)
		for _, it := range items {
			if equal(it, a.args[0]) {
				n++
			}
		}
		return n
	case "copy":
		if tname == "list" {
			a.count(0, 0)
			return &List{Items: append([]Value{}, items...)}
		}
	}
	raise("NotImplementedError", tname+"."+name+"() is not supported in templates")
	return nil
}

// numbers --------------------------------------------------------------

func intMethod(n *big.Int, name string, a argList) Value {
	switch name {
	case "bit_length":
		a.count(0, 0)
		return int64(new(big.Int).Abs(n).BitLen())
	case "bit_count":
		a.count(0, 0)
		c := 0
		for _, w := range new(big.Int).Abs(n).Bits() {
			for ; w != 0; w &= w - 1 {
				c++
			}
		}
		return int64(c)
	case "conjugate", "__index__", "__int__":
		a.count(0, 0)
		return normInt(n)
	case "is_integer":
		a.count(0, 0)
		return true
	case "as_integer_ratio":
		a.count(0, 0)
		return Tuple{normInt(n), int64(1)}
	}
	raise("NotImplementedError", "int."+name+"() is not supported in templates")
	return nil
}

func floatMethod(f float64, name string, a argList) Value {
	switch name {
	case "is_integer":
		a.count(0, 0)
		return f == math.Trunc(f) && !math.IsInf(f, 0)
	case "conjugate":
		a.count(0, 0)
		return f
	case "as_integer_ratio":
		a.count(0, 0)
		if math.IsInf(f, 0) {
			raise("OverflowError", "cannot convert Infinity to integer ratio")
		}
		if math.IsNaN(f) {
			valueError("cannot convert NaN to integer ratio")
		}
		r := new(big.Rat).SetFloat64(f)
		return Tuple{normInt(r.Num()), normInt(r.Denom())}
	case "hex":
		a.count(0, 0)
		return floatHex(f)
	}
	raise("NotImplementedError", "float."+name+"() is not supported in templates")
	return nil
}

func floatHex(f float64) string {
	switch {
	case math.IsInf(f, 1):
		return "inf"
	case math.IsInf(f, -1):
		return "-inf"
	case math.IsNaN(f):
		return "nan"
	case f == 0:
		if math.Signbit(f) {
			return "-0x0.0p+0"
		}
		return "0x0.0p+0"
	}
	sign := ""
	if f < 0 {
		sign, f = "-", -f
	}
	frac, exp := math.Frexp(f)
	mant := uint64(frac * (1 << 53))
	exp--
	hex := fmt.Sprintf("%013x", mant&((1<<52)-1))
	return fmt.Sprintf("%s0x1.%sp%+d", sign, hex, exp)
}

// builtinType is a builtin class reachable from a template (dict).
type builtinType struct {
	name string
	fn   func(r *renderer, args []Value, kwargs []kwarg) Value
}

func (t *builtinType) TypeName() string { return "type" }
func (t *builtinType) Module() string   { return "builtins" }
func (t *builtinType) Attr(name string) (Value, bool) {
	if name == "__name__" {
		return t.name, true
	}
	if name == "mro" {
		return &builtinFunc{name: "mro", fn: func(*renderer, []Value, []kwarg) Value { return &List{} }}, true
	}
	return nil, false
}
func (t *builtinType) Repr() string { return "<class '" + t.name + "'>" }
func (t *builtinType) Call(r *renderer, args []Value, kwargs []kwarg) Value {
	return t.fn(r, args, kwargs)
}

// builtinFunc is a Python function reachable from a template (range,
// lipsum, filters passed around).
type builtinFunc struct {
	name string
	fn   func(r *renderer, args []Value, kwargs []kwarg) Value
}

func (f *builtinFunc) TypeName() string { return "function" }
func (f *builtinFunc) Module() string   { return "builtins" }
func (f *builtinFunc) Attr(name string) (Value, bool) {
	if name == "__name__" {
		return f.name, true
	}
	return nil, false
}
func (f *builtinFunc) Repr() string { return "<function " + f.name + " at 0x7f0000000000>" }
func (f *builtinFunc) Call(r *renderer, args []Value, kwargs []kwarg) Value {
	return f.fn(r, args, kwargs)
}

// dictConstructor is dict(...).
func dictConstructor(r *renderer, args []Value, kwargs []kwarg) Value {
	d := NewDict()
	if len(args) > 1 {
		typeError(fmt.Sprintf("dict expected at most 1 argument, got %d", len(args)))
	}
	if len(args) == 1 {
		switch x := args[0].(type) {
		case *Dict:
			for i, k := range x.keys {
				d.Set(k, x.vals[i])
			}
		default:
			next := iterate(x)
			for i := 0; ; i++ {
				item, ok := next()
				if !ok {
					break
				}
				pair := toList(item)
				if len(pair) != 2 {
					valueError(fmt.Sprintf("dictionary update sequence element #%d has length %d; 2 is required", i, len(pair)))
				}
				_ = hashKey(pair[0])
				d.Set(pair[0], pair[1])
			}
		}
	}
	for _, kw := range kwargs {
		d.Set(kw.Name, kw.Value)
	}
	return d
}

func sortStrings(s []string) { sort.Strings(s) }
