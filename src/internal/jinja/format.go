package jinja

// Python's string formatting: printf-style "%" (str % args, the format
// filter), str.format through the sandbox's formatter, and the format
// specification mini-language for str, int and float.

import (
	"fmt"
	"math"
	"math/big"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/ctrliq/ascender/internal/pystr"
)

// ---------------------------------------------------------------- printf style

// percentFormat is format % args.
func percentFormat(format string, args Value) string {
	var items []Value
	var mapping Value
	isTuple := false
	switch a := args.(type) {
	case Tuple:
		items, isTuple = a, true
	default:
		items = []Value{args}
		if isMapping(args) {
			mapping = args
		}
	}
	argIdx := 0
	nextArg := func() Value {
		if argIdx >= len(items) {
			typeError("not enough arguments for format string")
		}
		argIdx++
		return items[argIdx-1]
	}
	var b strings.Builder
	r := []rune(format)
	usedMapping := false
	for i := 0; i < len(r); i++ {
		if r[i] != '%' {
			b.WriteRune(r[i])
			continue
		}
		start := i
		i++
		if i >= len(r) {
			valueError("incomplete format")
		}
		var arg Value
		haveArg := false
		if r[i] == '(' {
			if mapping == nil {
				typeError("format requires a mapping")
			}
			depth, j := 1, i+1
			for ; j < len(r) && depth > 0; j++ {
				switch r[j] {
				case '(':
					depth++
				case ')':
					depth--
				}
			}
			if depth > 0 {
				valueError("incomplete format key")
			}
			key := string(r[i+1 : j-1])
			arg = getItemStrict(mapping, key)
			haveArg, usedMapping = true, true
			i = j
		}
		flags := ""
		for i < len(r) && strings.ContainsRune("-+ #0", r[i]) {
			flags += string(r[i])
			i++
		}
		width := -1
		if i < len(r) && r[i] == '*' {
			width = int(toIntArg(nextArg(), "* wants int"))
			if width < 0 {
				flags += "-"
				width = -width
			}
			i++
		} else {
			w := 0
			has := false
			for i < len(r) && r[i] >= '0' && r[i] <= '9' {
				w = w*10 + int(r[i]-'0')
				has = true
				i++
			}
			if has {
				width = w
			}
		}
		prec := -1
		if i < len(r) && r[i] == '.' {
			i++
			if i < len(r) && r[i] == '*' {
				prec = int(toIntArg(nextArg(), "* wants int"))
				i++
			} else {
				p := 0
				for i < len(r) && r[i] >= '0' && r[i] <= '9' {
					p = p*10 + int(r[i]-'0')
					i++
				}
				prec = p
			}
		}
		for i < len(r) && (r[i] == 'h' || r[i] == 'l' || r[i] == 'L') {
			i++
		}
		if i >= len(r) {
			valueError("incomplete format")
		}
		conv := r[i]
		if conv == '%' {
			b.WriteByte('%')
			continue
		}
		if !haveArg {
			arg = nextArg()
		}
		var s string
		switch conv {
		case 's':
			s = str(arg)
			if prec >= 0 {
				s = truncateRunes(s, prec)
			}
		case 'r', 'a':
			s = repr(arg)
			if conv == 'a' {
				s = asciiRepr(s)
			}
			if prec >= 0 {
				s = truncateRunes(s, prec)
			}
		case 'd', 'i', 'u':
			n := percentInt(arg, string(conv), true)
			s = signed(n.String(), n.Sign() < 0, flags)
			s = zeroPad(s, width, flags, prec)
		case 'x', 'X', 'o':
			n := percentInt(arg, string(conv), false)
			base := map[rune]int{'x': 16, 'X': 16, 'o': 8}[conv]
			digits := new(big.Int).Abs(n).Text(base)
			if conv == 'X' {
				digits = strings.ToUpper(digits)
			}
			if prec > len(digits) {
				digits = strings.Repeat("0", prec-len(digits)) + digits
			}
			if strings.Contains(flags, "#") {
				digits = map[rune]string{'x': "0x", 'X': "0X", 'o': "0o"}[conv] + digits
			}
			s = signed(digits, n.Sign() < 0, flags)
			s = zeroPad(s, width, flags, -1)
		case 'e', 'E', 'f', 'F', 'g', 'G':
			f := percentFloat(arg)
			if prec < 0 {
				prec = 6
			}
			s = formatFloatC(f, byte(conv), prec, strings.Contains(flags, "#"))
			s = signed(strings.TrimPrefix(s, "-"), math.Signbit(f) && !math.IsNaN(f), flags)
			if !math.IsInf(f, 0) && !math.IsNaN(f) {
				s = zeroPad(s, width, flags, -1)
			}
		case 'c':
			switch x := arg.(type) {
			case string, Markup:
				c, _ := asStr(x)
				if utf8.RuneCountInString(c) != 1 {
					typeError(fmt.Sprintf("%%c requires an int or a unicode character, not a string of length %d", utf8.RuneCountInString(c)))
				}
				s = c
			default:
				if !isInt(arg) {
					typeError("%c requires an int or a unicode character, not " + typeName(arg))
				}
				n := toBig(arg)
				if !n.IsInt64() || n.Int64() < 0 || n.Int64() > 0x10FFFF {
					raise("OverflowError", "%c arg not in range(0x110000)")
				}
				s = string(rune(n.Int64()))
			}
		default:
			valueError(fmt.Sprintf("unsupported format character %s (0x%x) at index %d", pystr.Repr(string(conv)), conv, i))
		}
		_ = start
		if width > 0 && utf8.RuneCountInString(s) < width {
			pad := strings.Repeat(" ", width-utf8.RuneCountInString(s))
			if strings.Contains(flags, "-") {
				s += pad
			} else {
				s = pad + s
			}
		}
		b.WriteString(s)
	}
	if argIdx < len(items) && !usedMapping && (isTuple || mapping == nil) {
		typeError("not all arguments converted during string formatting")
	}
	return b.String()
}

func isMapping(v Value) bool {
	switch v.(type) {
	case *Dict:
		return true
	case Tuple, string, Markup:
		return false
	case itemer:
		_, isList := v.(*List)
		return !isList
	}
	return false
}

func getItemStrict(m Value, key string) Value {
	switch x := m.(type) {
	case *Dict:
		if v, ok := x.Get(key); ok {
			return v
		}
	case itemer:
		if v, ok := x.Item(key); ok {
			return v
		}
	}
	raise("KeyError", pystr.Repr(key))
	return nil
}

func toIntArg(v Value, msg string) int64 {
	if !isInt(v) {
		typeError(msg)
	}
	return toBig(v).Int64()
}

func truncateRunes(s string, n int) string {
	r := []rune(s)
	if len(r) > n {
		return string(r[:n])
	}
	return s
}

func asciiRepr(s string) string {
	var b strings.Builder
	for _, r := range s {
		switch {
		case r < 0x80:
			b.WriteRune(r)
		case r < 0x100:
			fmt.Fprintf(&b, `\x%02x`, r)
		case r < 0x10000:
			fmt.Fprintf(&b, `\u%04x`, r)
		default:
			fmt.Fprintf(&b, `\U%08x`, r)
		}
	}
	return b.String()
}

func percentInt(arg Value, conv string, real bool) *big.Int {
	switch x := arg.(type) {
	case bool, int64, *big.Int:
		return toBig(x)
	case float64:
		if real {
			if math.IsInf(x, 0) {
				raise("OverflowError", "cannot convert float infinity to integer")
			}
			if math.IsNaN(x) {
				valueError("cannot convert float NaN to integer")
			}
			b, _ := new(big.Float).SetFloat64(math.Trunc(x)).Int(nil)
			return b
		}
	}
	if real {
		typeError("%" + conv + " format: a real number is required, not " + typeName(arg))
	}
	typeError("%" + conv + " format: an integer is required, not " + typeName(arg))
	return nil
}

func percentFloat(arg Value) float64 {
	if isNumber(arg) {
		return toFloat(arg)
	}
	typeError("must be real number, not " + typeName(arg))
	return 0
}

func signed(digits string, negative bool, flags string) string {
	switch {
	case negative:
		return "-" + digits
	case strings.Contains(flags, "+"):
		return "+" + digits
	case strings.Contains(flags, " "):
		return " " + digits
	}
	return digits
}

// zeroPad applies the 0 flag: zeros after the sign up to width.
func zeroPad(s string, width int, flags string, _ int) string {
	if !strings.Contains(flags, "0") || strings.Contains(flags, "-") || width <= len(s) {
		return s
	}
	sign := ""
	if s != "" && strings.ContainsRune("+- ", rune(s[0])) {
		sign, s = s[:1], s[1:]
	}
	prefix := ""
	if len(s) > 1 && s[0] == '0' && strings.ContainsRune("xXob", rune(s[1])) {
		prefix, s = s[:2], s[2:]
	}
	return sign + prefix + strings.Repeat("0", width-len(sign)-len(prefix)-len(s)) + s
}

// formatFloatC formats like C's printf for e, f and g.
func formatFloatC(f float64, conv byte, prec int, alt bool) string {
	upper := conv == 'E' || conv == 'F' || conv == 'G'
	switch {
	case math.IsInf(f, 1):
		return caseIf("inf", upper)
	case math.IsInf(f, -1):
		return caseIf("-inf", upper)
	case math.IsNaN(f):
		return caseIf("nan", upper)
	}
	var s string
	switch conv {
	case 'e', 'E':
		s = strconv.FormatFloat(f, 'e', prec, 64)
	case 'f', 'F':
		s = strconv.FormatFloat(f, 'f', prec, 64)
	case 'g', 'G':
		if prec == 0 {
			prec = 1
		}
		s = formatG(f, prec, alt)
	}
	if alt && (conv == 'e' || conv == 'E' || conv == 'f' || conv == 'F') && prec == 0 {
		if i := strings.IndexAny(s, "eE"); i >= 0 {
			s = s[:i] + "." + s[i:]
		} else {
			s += "."
		}
	}
	return caseIf(s, upper)
}

func caseIf(s string, upper bool) string {
	if upper {
		return strings.ToUpper(s)
	}
	return s
}

// formatG is C's %g: exponential when the exponent is below -4 or at
// least the precision, trailing zeros removed (kept with #).
func formatG(f float64, prec int, alt bool) string {
	if f == 0 {
		if alt {
			return signZero(f) + "0." + strings.Repeat("0", prec-1)
		}
		return signZero(f) + "0"
	}
	e := strconv.FormatFloat(f, 'e', prec-1, 64)
	mant, expStr, _ := strings.Cut(e, "e")
	exp, _ := strconv.Atoi(expStr)
	var s string
	if exp < -4 || exp >= prec {
		if !alt && strings.Contains(mant, ".") {
			mant = strings.TrimRight(strings.TrimRight(mant, "0"), ".")
		}
		es := "+"
		if exp < 0 {
			es, exp = "-", -exp
		}
		s = mant + "e" + es + fmt.Sprintf("%02d", exp)
	} else {
		s = strconv.FormatFloat(f, 'f', prec-1-exp, 64)
		if !alt && strings.Contains(s, ".") {
			s = strings.TrimRight(strings.TrimRight(s, "0"), ".")
		}
	}
	return s
}

func signZero(f float64) string {
	if math.Signbit(f) {
		return "-"
	}
	return ""
}

// ---------------------------------------------------------------- str.format

// strFormat is the sandbox's str.format / format_map.
func strFormat(r *renderer, format string, args []Value, kwargs map[string]Value, depth int) string {
	if depth > 2 {
		valueError("Max string recursion exceeded")
	}
	var b strings.Builder
	rs := []rune(format)
	auto := 0
	manual := false
	autoUsed := false
	for i := 0; i < len(rs); i++ {
		c := rs[i]
		if c == '}' {
			if i+1 < len(rs) && rs[i+1] == '}' {
				b.WriteRune('}')
				i++
				continue
			}
			valueError("Single '}' encountered in format string")
		}
		if c != '{' {
			b.WriteRune(c)
			continue
		}
		if i+1 < len(rs) && rs[i+1] == '{' {
			b.WriteRune('{')
			i++
			continue
		}
		// Find the matching close brace, allowing nested fields in the spec.
		depthB, j := 1, i+1
		for ; j < len(rs); j++ {
			if rs[j] == '{' {
				depthB++
			} else if rs[j] == '}' {
				depthB--
				if depthB == 0 {
					break
				}
			}
		}
		if j >= len(rs) {
			if strings.ContainsRune(string(rs[i+1:]), '}') {
				valueError("unmatched '{' in format spec")
			}
			valueError("Single '{' encountered in format string")
		}
		field := string(rs[i+1 : j])
		i = j
		name, conv, spec := field, "", ""
		if k := strings.IndexAny(name, "!:"); k >= 0 {
			rest := name[k:]
			name = name[:k]
			if rest[0] == '!' {
				if len(rest) < 2 {
					valueError("end of string while looking for conversion specifier")
				}
				conv = string([]rune(rest[1:])[:1])
				rest = string([]rune(rest[1:])[1:])
				if rest != "" && rest[0] != ':' {
					valueError("expected ':' after conversion specifier")
				}
			}
			if rest != "" && rest[0] == ':' {
				spec = rest[1:]
			}
		}
		// The first part of the field name, then .attr and [key] parts.
		first, rest := name, ""
		if k := strings.IndexAny(name, ".["); k >= 0 {
			first, rest = name[:k], name[k:]
		}
		var obj Value
		if first == "" {
			if manual {
				valueError("cannot switch from manual field specification to automatic field numbering")
			}
			autoUsed = true
			if auto >= len(args) {
				raise("IndexError", "tuple index out of range")
			}
			obj = args[auto]
			auto++
		} else if n, err := strconv.Atoi(first); err == nil && isASCIIDigits(first) {
			if autoUsed {
				valueError("cannot switch from automatic field numbering to manual field specification")
			}
			manual = true
			if n >= len(args) {
				raise("IndexError", "tuple index out of range")
			}
			obj = args[n]
		} else {
			v, ok := kwargs[first]
			if !ok {
				raise("KeyError", pystr.Repr(first))
			}
			obj = v
		}
		for rest != "" {
			if rest[0] == '.' {
				k := strings.IndexAny(rest[1:], ".[")
				attr := rest[1:]
				if k >= 0 {
					attr, rest = rest[1:1+k], rest[1+k:]
				} else {
					rest = ""
				}
				if attr == "" {
					valueError("Empty attribute in format string")
				}
				obj = r.getattr(obj, attr)
			} else {
				k := strings.IndexByte(rest, ']')
				if k < 0 {
					valueError("Missing ']' in format string")
				}
				key := rest[1:k]
				rest = rest[k+1:]
				if rest != "" && rest[0] != '.' && rest[0] != '[' {
					valueError("Only '.' or '[' may follow ']' in format field specifier")
				}
				var kv Value = key
				if n, err := strconv.Atoi(key); err == nil && isASCIIDigits(key) {
					kv = int64(n)
				}
				obj = r.getitem(obj, kv)
			}
		}
		switch conv {
		case "":
		case "s":
			obj = str(obj)
		case "r":
			obj = repr(obj)
		case "a":
			obj = asciiRepr(repr(obj))
		default:
			valueError("Unknown conversion specifier " + conv)
		}
		if strings.ContainsRune(spec, '{') {
			spec = strFormat(r, spec, args, kwargs, depth+1)
		}
		b.WriteString(formatValue(obj, spec))
	}
	return b.String()
}

func isASCIIDigits(s string) bool {
	if s == "" {
		return false
	}
	for _, c := range s {
		if c < '0' || c > '9' {
			return false
		}
	}
	return true
}

// ---------------------------------------------------------------- format()

type formatSpec struct {
	fill     rune
	align    rune
	sign     rune
	alt      bool
	zero     bool
	width    int
	grouping rune
	prec     int
	typ      rune
}

func parseSpec(spec string, typeName string) formatSpec {
	fs := formatSpec{fill: ' ', width: -1, prec: -1}
	r := []rune(spec)
	i := 0
	if len(r) >= 2 && strings.ContainsRune("<>=^", r[1]) {
		fs.fill, fs.align = r[0], r[1]
		i = 2
	} else if len(r) >= 1 && strings.ContainsRune("<>=^", r[0]) {
		fs.align = r[0]
		i = 1
	}
	if i < len(r) && strings.ContainsRune("+- ", r[i]) {
		fs.sign = r[i]
		i++
	}
	if i < len(r) && r[i] == 'z' {
		i++
	}
	if i < len(r) && r[i] == '#' {
		fs.alt = true
		i++
	}
	if i < len(r) && r[i] == '0' {
		fs.zero = true
		i++
	}
	start := i
	for i < len(r) && r[i] >= '0' && r[i] <= '9' {
		i++
	}
	if i > start {
		fs.width, _ = strconv.Atoi(string(r[start:i]))
	}
	if i < len(r) && (r[i] == ',' || r[i] == '_') {
		fs.grouping = r[i]
		i++
	}
	if i < len(r) && r[i] == '.' {
		i++
		start = i
		for i < len(r) && r[i] >= '0' && r[i] <= '9' {
			i++
		}
		if i == start {
			valueError("Format specifier missing precision")
		}
		fs.prec, _ = strconv.Atoi(string(r[start:i]))
	}
	if i < len(r) {
		fs.typ = r[i]
		i++
	}
	if i < len(r) {
		valueError("Invalid format specifier '" + spec + "' for object of type '" + typeName + "'")
	}
	return fs
}

// formatValue is format(v, spec).
func formatValue(v Value, spec string) string {
	switch x := v.(type) {
	case string:
		return formatStr(x, spec)
	case Markup:
		return formatStr(string(x), spec)
	case bool:
		if spec == "" {
			return str(x)
		}
		return formatInt(toBig(x), spec, "bool")
	case int64, *big.Int:
		return formatInt(toBig(x), spec, "int")
	case float64:
		return formatFloat(x, spec)
	case *Undefined:
		return x.Str()
	}
	if spec != "" {
		typeError("unsupported format string passed to " + typeName(v) + ".__format__")
	}
	return str(v)
}

func applyAlign(s string, fs formatSpec, defAlign rune) string {
	n := utf8.RuneCountInString(s)
	if fs.width <= n {
		return s
	}
	pad := fs.width - n
	align := fs.align
	if align == 0 {
		align = defAlign
	}
	fill := string(fs.fill)
	switch align {
	case '<':
		return s + strings.Repeat(fill, pad)
	case '^':
		left := pad / 2
		return strings.Repeat(fill, left) + s + strings.Repeat(fill, pad-left)
	case '=':
		sign := ""
		if s != "" && strings.ContainsRune("+- ", rune(s[0])) {
			sign, s = s[:1], s[1:]
		}
		return sign + strings.Repeat(fill, pad) + s
	}
	return strings.Repeat(fill, pad) + s
}

func formatStr(s, spec string) string {
	fs := parseSpec(spec, "str")
	if fs.typ != 0 && fs.typ != 's' {
		valueError(fmt.Sprintf("Unknown format code '%c' for object of type 'str'", fs.typ))
	}
	if fs.sign != 0 {
		valueError("Sign not allowed in string format specifier")
	}
	if fs.alt {
		valueError("Alternate form (#) not allowed in string format specifier")
	}
	if fs.align == '=' {
		valueError("'=' alignment not allowed in string format specifier")
	}
	if fs.grouping != 0 {
		valueError("Cannot specify ',' with 's'.")
	}
	if fs.prec >= 0 {
		s = truncateRunes(s, fs.prec)
	}
	if fs.zero && fs.align == 0 {
		fs.fill, fs.align = '0', '<'
	}
	return applyAlign(s, fs, '<')
}

func group(digits string, sep rune, every int) string {
	if sep == 0 {
		return digits
	}
	var parts []string
	for len(digits) > every {
		parts = append([]string{digits[len(digits)-every:]}, parts...)
		digits = digits[:len(digits)-every]
	}
	parts = append([]string{digits}, parts...)
	return strings.Join(parts, string(sep))
}

func signPrefix(neg bool, sign rune) string {
	switch {
	case neg:
		return "-"
	case sign == '+':
		return "+"
	case sign == ' ':
		return " "
	}
	return ""
}

func zeroFill(fs formatSpec) formatSpec {
	if fs.zero && fs.align == 0 {
		fs.fill, fs.align = '0', '='
	}
	return fs
}

func formatInt(n *big.Int, spec, tname string) string {
	fs := parseSpec(spec, tname)
	switch fs.typ {
	case 'e', 'E', 'f', 'F', 'g', 'G', '%':
		f, _ := new(big.Float).SetInt(n).Float64()
		return formatFloat(f, spec)
	}
	if fs.prec >= 0 {
		valueError("Precision not allowed in integer format specifier")
	}
	neg := n.Sign() < 0
	abs := new(big.Int).Abs(n)
	var digits, prefix string
	switch fs.typ {
	case 0, 'd', 'n':
		digits = group(abs.String(), fs.grouping, 3)
	case 'b', 'o', 'x', 'X':
		base := map[rune]int{'b': 2, 'o': 8, 'x': 16, 'X': 16}[fs.typ]
		digits = abs.Text(base)
		if fs.typ == 'X' {
			digits = strings.ToUpper(digits)
		}
		digits = group(digits, fs.grouping, 4)
		if fs.alt {
			prefix = "0" + string(fs.typ)
		}
	case 'c':
		if !n.IsInt64() || n.Int64() < 0 || n.Int64() > 0x10FFFF {
			raise("OverflowError", "%c arg not in range(0x110000)")
		}
		return applyAlign(string(rune(n.Int64())), fs, '<')
	default:
		valueError(fmt.Sprintf("Unknown format code '%c' for object of type '%s'", fs.typ, tname))
	}
	fs = zeroFill(fs)
	return applyAlign(signPrefix(neg, fs.sign)+prefix+digits, fs, '>')
}

func formatFloat(f float64, spec string) string {
	fs := parseSpec(spec, "float")
	neg := math.Signbit(f) && !math.IsNaN(f)
	a := math.Abs(f)
	var body string
	switch fs.typ {
	case 0:
		if fs.prec < 0 {
			body = pystr.FloatRepr(a)
		} else {
			p := fs.prec
			if p == 0 {
				p = 1
			}
			body = formatG(a, p, fs.alt)
			if !strings.ContainsAny(body, ".einf") {
				body += ".0"
			}
		}
	case 'e', 'E', 'f', 'F', 'g', 'G':
		p := fs.prec
		if p < 0 {
			p = 6
		}
		body = formatFloatC(a, byte(fs.typ), p, fs.alt)
	case 'n':
		p := fs.prec
		if p < 0 {
			p = 6
		}
		body = formatFloatC(a, 'g', p, fs.alt)
	case '%':
		p := fs.prec
		if p < 0 {
			p = 6
		}
		body = formatFloatC(a*100, 'f', p, fs.alt) + "%"
	default:
		valueError(fmt.Sprintf("Unknown format code '%c' for object of type 'float'", fs.typ))
	}
	if fs.grouping != 0 && !math.IsInf(a, 0) && !math.IsNaN(a) {
		intPart, frac := body, ""
		if k := strings.IndexAny(body, ".e%"); k >= 0 {
			intPart, frac = body[:k], body[k:]
		}
		body = group(intPart, fs.grouping, 3) + frac
	}
	if !math.IsInf(a, 0) && !math.IsNaN(a) {
		fs = zeroFill(fs)
	}
	return applyAlign(signPrefix(neg, fs.sign)+body, fs, '>')
}
