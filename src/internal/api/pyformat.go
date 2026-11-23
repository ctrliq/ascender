package api

import (
	"fmt"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/ctrliq/ascender/internal/pystr"
)

// pyFormat is Python's str.format with keyword arguments only, for the
// format a setting gives (API_400_ERROR_LOG_FORMAT). It returns the text,
// or str() of the exception Python raised ("'name'" for an unknown key).
// Values are int64, string, nil (None) or *pyObject.
func pyFormat(format string, kwargs map[string]any) (string, string) {
	var b strings.Builder
	if msg := pyFormatInto(&b, format, kwargs, 2); msg != "" {
		return "", msg
	}
	return b.String(), ""
}

// pyObject is a value whose str() and attributes the format may use: the
// request's user.
type pyObject struct {
	class string
	str   string
	attrs map[string]any
}

func pyFormatInto(b *strings.Builder, format string, kwargs map[string]any, depth int) string {
	if depth < 0 {
		return "Max string recursion exceeded"
	}
	for i := 0; i < len(format); {
		c := format[i]
		switch c {
		case '}':
			if i+1 < len(format) && format[i+1] == '}' {
				b.WriteByte('}')
				i += 2
				continue
			}
			return "Single '}' encountered in format string"
		case '{':
			if i+1 < len(format) && format[i+1] == '{' {
				b.WriteByte('{')
				i += 2
				continue
			}
			// The field runs to the matching brace; a format spec may
			// hold nested fields.
			level, j := 1, i+1
			for ; j < len(format) && level > 0; j++ {
				switch format[j] {
				case '{':
					level++
				case '}':
					level--
				}
			}
			if level > 0 {
				if i+1 == len(format) {
					return "Single '{' encountered in format string"
				}
				return "expected '}' before end of string"
			}
			text, msg := pyFormatField(format[i+1:j-1], kwargs, depth)
			if msg != "" {
				return msg
			}
			b.WriteString(text)
			i = j
		default:
			b.WriteByte(c)
			i++
		}
	}
	return ""
}

func pyFormatField(field string, kwargs map[string]any, depth int) (string, string) {
	name, spec := field, ""
	conv := byte(0)
	// The name ends at the first '!' or ':' outside brackets.
	inBracket := false
	for k := 0; k < len(field); k++ {
		ch := field[k]
		if ch == '[' {
			inBracket = true
		} else if ch == ']' {
			inBracket = false
		} else if !inBracket && (ch == '!' || ch == ':') {
			name = field[:k]
			rest := field[k:]
			if ch == '!' {
				if len(rest) < 2 {
					return "", "end of string while looking for conversion specifier"
				}
				conv = rest[1]
				rest = rest[2:]
				if rest != "" && rest[0] != ':' {
					return "", "expected ':' after conversion specifier"
				}
			}
			if rest != "" {
				spec = rest[1:]
			}
			break
		}
	}
	v, msg := pyFieldValue(name, kwargs)
	if msg != "" {
		return "", msg
	}
	switch conv {
	case 0:
	case 's':
		v = pyFmtStr(v)
	case 'r', 'a':
		v = pyReprValue(v)
	default:
		return "", fmt.Sprintf("Unknown conversion specifier %c", conv)
	}
	if strings.Contains(spec, "{") {
		var sb strings.Builder
		if msg := pyFormatInto(&sb, spec, kwargs, depth-1); msg != "" {
			return "", msg
		}
		spec = sb.String()
	}
	return pyFormatValue(v, spec)
}

// pyFieldValue resolves "name", "name.attr" and "name[key]".
func pyFieldValue(name string, kwargs map[string]any) (any, string) {
	first := name
	rest := ""
	if k := strings.IndexAny(name, ".["); k >= 0 {
		first, rest = name[:k], name[k:]
	}
	if first == "" || isDigits(first) {
		n := 0
		if first != "" {
			n, _ = strconv.Atoi(first)
		}
		return nil, fmt.Sprintf("Replacement index %d out of range for positional args tuple", n)
	}
	v, ok := kwargs[first]
	if !ok {
		return nil, pystr.Repr(first)
	}
	for rest != "" {
		switch rest[0] {
		case '.':
			end := strings.IndexAny(rest[1:], ".[")
			attr := rest[1:]
			if end >= 0 {
				attr, rest = rest[1:end+1], rest[end+1:]
			} else {
				rest = ""
			}
			if attr == "" {
				return nil, "Empty attribute in format string"
			}
			o, isObj := v.(*pyObject)
			if !isObj {
				return nil, fmt.Sprintf("'%s' object has no attribute %s", pyTypeOf(v), pystr.Repr(attr))
			}
			av, ok := o.attrs[attr]
			if !ok {
				return nil, fmt.Sprintf("'%s' object has no attribute %s", o.class, pystr.Repr(attr))
			}
			v = av
		case '[':
			end := strings.IndexByte(rest, ']')
			if end < 0 {
				return nil, "Missing ']' in format string"
			}
			key := rest[1:end]
			rest = rest[end+1:]
			if rest != "" && rest[0] != '.' && rest[0] != '[' {
				return nil, "Only '.' or '[' may follow ']' in format field specifier"
			}
			switch t := v.(type) {
			case string:
				if !isDigits(key) {
					return nil, "string indices must be integers, not 'str'"
				}
				n, _ := strconv.Atoi(key)
				r := []rune(t)
				if n >= len(r) {
					return nil, "string index out of range"
				}
				v = string(r[n])
			default:
				return nil, fmt.Sprintf("'%s' object is not subscriptable", pyTypeOf(v))
			}
		default:
			return nil, "Only '.' or '[' may follow ']' in format field specifier"
		}
	}
	return v, ""
}

func pyTypeOf(v any) string {
	switch t := v.(type) {
	case nil:
		return "NoneType"
	case int64:
		return "int"
	case string:
		return "str"
	case *pyObject:
		return t.class
	}
	return "object"
}

func pyFmtStr(v any) string {
	switch t := v.(type) {
	case nil:
		return "None"
	case int64:
		return strconv.FormatInt(t, 10)
	case string:
		return t
	case *pyObject:
		return t.str
	}
	return fmt.Sprint(v)
}

func pyReprValue(v any) string {
	switch t := v.(type) {
	case string:
		return pystr.Repr(t)
	case *pyObject:
		if t.class == "User" {
			return "<User: " + t.str + ">"
		}
		return t.str
	}
	return pyFmtStr(v)
}

type pySpec struct {
	fill      rune
	align     byte
	sign      byte
	alt, zero bool
	width     int
	grouping  byte
	precision int
	typ       byte
}

func parsePySpec(spec string) (pySpec, string) {
	p := pySpec{fill: ' ', precision: -1}
	r := []rune(spec)
	i := 0
	isAlign := func(c rune) bool { return c == '<' || c == '>' || c == '=' || c == '^' }
	if len(r) >= 2 && isAlign(r[1]) {
		p.fill, p.align = r[0], byte(r[1])
		i = 2
	} else if len(r) >= 1 && isAlign(r[0]) {
		p.align = byte(r[0])
		i = 1
	}
	if i < len(r) && (r[i] == '+' || r[i] == '-' || r[i] == ' ') {
		p.sign = byte(r[i])
		i++
	}
	if i < len(r) && r[i] == 'z' {
		i++
	}
	if i < len(r) && r[i] == '#' {
		p.alt = true
		i++
	}
	if i < len(r) && r[i] == '0' {
		p.zero = true
		i++
	}
	start := i
	for i < len(r) && r[i] >= '0' && r[i] <= '9' {
		i++
	}
	if i > start {
		p.width, _ = strconv.Atoi(string(r[start:i]))
	}
	if i < len(r) && (r[i] == ',' || r[i] == '_') {
		p.grouping = byte(r[i])
		i++
	}
	if i < len(r) && r[i] == '.' {
		i++
		start = i
		for i < len(r) && r[i] >= '0' && r[i] <= '9' {
			i++
		}
		if i == start {
			return p, "Format specifier missing precision"
		}
		p.precision, _ = strconv.Atoi(string(r[start:i]))
	}
	if len(r)-i > 1 {
		return p, "Invalid format specifier '" + spec + "' for object of type '%s'"
	}
	if i < len(r) {
		p.typ = byte(r[i])
	}
	return p, ""
}

func pyFormatValue(v any, spec string) (string, string) {
	switch t := v.(type) {
	case nil, *pyObject:
		if spec != "" {
			return "", fmt.Sprintf("unsupported format string passed to %s.__format__", pyTypeOf(v))
		}
		return pyFmtStr(v), ""
	case string:
		if spec == "" {
			return t, ""
		}
		p, msg := parsePySpec(spec)
		if msg != "" {
			return "", strings.Replace(msg, "%s", "str", 1)
		}
		switch {
		case p.typ != 0 && p.typ != 's':
			return "", fmt.Sprintf("Unknown format code '%c' for object of type 'str'", p.typ)
		case p.sign != 0:
			return "", "Sign not allowed in string format specifier"
		case p.alt:
			return "", "Alternate form (#) not allowed in string format specifier"
		case p.align == '=':
			return "", "'=' alignment not allowed in string format specifier"
		case p.grouping != 0:
			return "", fmt.Sprintf("Cannot specify '%c' with 's'.", p.grouping)
		}
		if p.zero && p.align == 0 {
			p.fill = '0'
		}
		if p.precision >= 0 && utf8.RuneCountInString(t) > p.precision {
			t = string([]rune(t)[:p.precision])
		}
		if p.align == 0 {
			p.align = '<'
		}
		return pyPad(t, "", p), ""
	case int64:
		if spec == "" {
			return strconv.FormatInt(t, 10), ""
		}
		p, msg := parsePySpec(spec)
		if msg != "" {
			return "", strings.Replace(msg, "%s", "int", 1)
		}
		neg := t < 0
		u := t
		if neg {
			u = -t
		}
		var digits, prefix string
		switch p.typ {
		case 0, 'd', 'n':
			digits = strconv.FormatInt(u, 10)
		case 'b':
			digits, prefix = strconv.FormatInt(u, 2), "0b"
		case 'o':
			digits, prefix = strconv.FormatInt(u, 8), "0o"
		case 'x':
			digits, prefix = strconv.FormatInt(u, 16), "0x"
		case 'X':
			digits, prefix = strings.ToUpper(strconv.FormatInt(u, 16)), "0X"
		case 'c':
			if p.sign != 0 {
				return "", "Sign not allowed with integer format specifier 'c'"
			}
			digits = string(rune(t))
			neg = false
		case 'e', 'E', 'f', 'F', 'g', 'G', '%':
			return pyFormatFloat(float64(t), p)
		default:
			return "", fmt.Sprintf("Unknown format code '%c' for object of type 'int'", p.typ)
		}
		if p.precision >= 0 {
			return "", "Precision not allowed in integer format specifier"
		}
		if p.grouping != 0 {
			if p.grouping == ',' && p.typ != 0 && p.typ != 'd' {
				return "", fmt.Sprintf("Cannot specify ',' with '%c'.", p.typ)
			}
			every := 3
			if p.typ == 'b' || p.typ == 'o' || p.typ == 'x' || p.typ == 'X' {
				every = 4
			}
			digits = groupDigits(digits, string(p.grouping), every)
		}
		if !p.alt {
			prefix = ""
		}
		return pyPad(digits, pySignPrefix(neg, p.sign)+prefix, p), ""
	}
	return pyFmtStr(v), ""
}

func pyFormatFloat(f float64, p pySpec) (string, string) {
	prec := p.precision
	if prec < 0 {
		prec = 6
	}
	neg := f < 0
	if neg {
		f = -f
	}
	var s string
	switch p.typ {
	case 'f', 'F':
		s = strconv.FormatFloat(f, 'f', prec, 64)
	case 'e', 'E':
		s = strconv.FormatFloat(f, 'e', prec, 64)
		if p.typ == 'E' {
			s = strings.ToUpper(s)
		}
	case 'g', 'G':
		if prec == 0 {
			prec = 1
		}
		s = strconv.FormatFloat(f, 'g', prec, 64)
		if p.typ == 'G' {
			s = strings.ToUpper(s)
		}
	case '%':
		s = strconv.FormatFloat(f*100, 'f', prec, 64) + "%"
	}
	return pyPad(s, pySignPrefix(neg, p.sign), p), ""
}

func pySignPrefix(neg bool, sign byte) string {
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

func groupDigits(digits, sep string, every int) string {
	var out []string
	for len(digits) > every {
		out = append([]string{digits[len(digits)-every:]}, out...)
		digits = digits[:len(digits)-every]
	}
	return strings.Join(append([]string{digits}, out...), sep)
}

// pyPad pads body (after its sign and prefix) to the width.
func pyPad(body, signPrefix string, p pySpec) string {
	if p.zero && p.align == 0 {
		p.fill, p.align = '0', '='
	}
	if p.align == 0 {
		p.align = '>'
	}
	n := utf8.RuneCountInString(signPrefix) + utf8.RuneCountInString(body)
	if n >= p.width {
		return signPrefix + body
	}
	pad := p.width - n
	fill := func(k int) string { return strings.Repeat(string(p.fill), k) }
	switch p.align {
	case '<':
		return signPrefix + body + fill(pad)
	case '^':
		return fill(pad/2) + signPrefix + body + fill(pad-pad/2)
	case '=':
		return signPrefix + fill(pad) + body
	}
	return fill(pad) + signPrefix + body
}
