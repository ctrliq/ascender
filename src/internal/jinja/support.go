package jinja

// Helpers behind filters and globals: urlize, pprint, textwrap, tojson,
// lipsum, datetimes, and reading JSON into template values.

import (
	"bytes"
	"encoding/json"
	"fmt"
	"math"
	"math/big"
	"math/rand"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode/utf16"

	"github.com/ctrliq/ascender/internal/pyre"
	"github.com/ctrliq/ascender/internal/pystr"
)

// ---------------------------------------------------------------- title, wordcount

var (
	titleSplitRe = pyre.MustCompileSearch(`([-\s({\[<]+)`, 0)
	wordRe       = pyre.MustCompileSearch(`\w+`, 0)
)

func doTitlePy(s string) string {
	var b strings.Builder
	for _, item := range titleSplitRe.Split(s) {
		if item == "" {
			continue
		}
		r := []rune(item)
		b.WriteString(pyUpper(string(r[0])) + pyLower(string(r[1:])))
	}
	return b.String()
}

func wordCount(s string) int { return len(wordRe.FindAll(s)) }

// ---------------------------------------------------------------- urlize

var (
	httpRe = `
    ^
    (
        (https?://|www\.)  # scheme or www
        (([\w%-]+\.)+)?  # subdomain
        (
            [a-z]{2,63}  # basic tld
        |
            xn--[\w%]{2,59}  # idna tld
        )
    |
        ([\w%-]{2,63}\.)+  # basic domain
        (com|net|int|edu|gov|org|info|mil)  # basic tld
    |
        (https?://)  # scheme
        (
            (([\d]{1,3})(\.[\d]{1,3}){3})  # IPv4
        |
            (\[([\da-f]{0,4}:){2}([\da-f]{0,4}:?){1,6}])  # IPv6
        )
    )
    (?::[\d]{1,5})?  # port
    (?:[/?#]\S*)?  # path, query, and fragment
    $
    `
	emailRe      = `^\S+@\w[\w.-]*\.\w+$`
	spaceSplitRe = pyre.MustCompileSearch(`(\s+)`, 0)
	uriSchemeRe  = `^([\w.+-]{2,}:(/){0,2})$`
)

func (r *renderer) doUrlize(a []Value) string {
	relParts := map[string]bool{}
	if a[4] != nil {
		for _, w := range strings.FieldsFunc(str(a[4]), pystr.IsSpace) {
			relParts[w] = true
		}
	}
	if truth(a[2]) {
		relParts["nofollow"] = true
	}
	// policies["urlize.rel"]
	relParts["noopener"] = true
	var rels []string
	for k := range relParts {
		rels = append(rels, k)
	}
	sort.Strings(rels)
	rel := strings.Join(rels, " ")
	target := a[3]
	var schemes []string
	if a[5] != nil {
		for _, s := range toList(a[5]) {
			sc := str(s)
			if !pyre.MatchString(uriSchemeRe, 0, sc) || strings.HasSuffix(sc, "\n") {
				raise("FilterArgumentError", repr(s)+" is not a valid URI scheme prefix.")
			}
			schemes = append(schemes, sc)
		}
	}
	trim := func(x string) string {
		if a[1] == nil {
			return x
		}
		n := int(toBig(a[1]).Int64())
		if len([]rune(x)) > n {
			return string([]rune(x)[:max(n, 0)]) + "..."
		}
		return x
	}
	relAttr, targetAttr := "", ""
	if rel != "" {
		relAttr = ` rel="` + escapeHTML(rel) + `"`
	}
	if target != nil && truth(target) {
		targetAttr = ` target="` + string(escapeValue(target)) + `"`
	}
	words := spaceSplitRe.Split(string(escapeValue(a[0])))
	for i, word := range words {
		head, middle, tail := "", word, ""
		// ^([(<]|&lt;)+
		if lead := leadMatch(middle); lead != "" {
			head, middle = lead, middle[len(lead):]
		}
		if strings.HasSuffix(middle, ")") || strings.HasSuffix(middle, ">") || strings.HasSuffix(middle, ".") ||
			strings.HasSuffix(middle, ",") || strings.HasSuffix(middle, "\n") || strings.HasSuffix(middle, "&gt;") {
			if t := trailMatch(middle); t != "" {
				tail = t
				middle = middle[:len(middle)-len(t)]
			}
		}
		for _, pair := range [][2]string{{"(", ")"}, {"<", ">"}, {"&lt;", "&gt;"}} {
			startCount := strings.Count(middle, pair[0])
			if startCount <= strings.Count(middle, pair[1]) {
				continue
			}
			n := min(startCount, strings.Count(tail, pair[1]))
			for range n {
				end := strings.Index(tail, pair[1]) + len(pair[1])
				middle += tail[:end]
				tail = tail[end:]
			}
		}
		switch {
		case pyre.MatchString(httpRe, pyre.IgnoreCase|pyre.Verbose, middle):
			if strings.HasPrefix(middle, "https://") || strings.HasPrefix(middle, "http://") {
				middle = `<a href="` + middle + `"` + relAttr + targetAttr + `>` + trim(middle) + `</a>`
			} else {
				middle = `<a href="https://` + middle + `"` + relAttr + targetAttr + `>` + trim(middle) + `</a>`
			}
		case strings.HasPrefix(middle, "mailto:") && pyre.MatchString(emailRe, 0, middle[7:]):
			middle = `<a href="` + middle + `">` + middle[7:] + `</a>`
		case strings.Contains(middle, "@") && !strings.HasPrefix(middle, "www.") && !strings.HasPrefix(middle, "@") &&
			!strings.Contains(middle, ":") && pyre.MatchString(emailRe, 0, middle):
			middle = `<a href="mailto:` + middle + `">` + middle + `</a>`
		default:
			for _, sc := range schemes {
				if middle != sc && strings.HasPrefix(middle, sc) {
					middle = `<a href="` + middle + `"` + relAttr + targetAttr + `>` + middle + `</a>`
				}
			}
		}
		words[i] = head + middle + tail
	}
	return strings.Join(words, "")
}

func leadMatch(s string) string {
	n := 0
	for {
		switch {
		case strings.HasPrefix(s[n:], "("), strings.HasPrefix(s[n:], "<"):
			n++
		case strings.HasPrefix(s[n:], "&lt;"):
			n += 4
		default:
			return s[:n]
		}
	}
}

func trailMatch(s string) string {
	n := len(s)
	for {
		switch {
		case n > 0 && strings.ContainsRune(")>.,\n", rune(s[n-1])):
			n--
		case n >= 4 && s[n-4:n] == "&gt;":
			n -= 4
		default:
			return s[n:]
		}
	}
}

// ---------------------------------------------------------------- pprint

const pprintWidth = 80

// pformat is pprint.pformat(obj): width 80, dict keys sorted.
func pformat(v Value) string {
	var b strings.Builder
	ppFormat(&b, v, 0, 0, 1)
	return b.String()
}

func safeRepr(v Value) string {
	switch x := v.(type) {
	case *Dict:
		items := sortedItems(x)
		parts := make([]string, len(items))
		for i, it := range items {
			parts[i] = safeRepr(it[0]) + ": " + safeRepr(it[1])
		}
		return "{" + strings.Join(parts, ", ") + "}"
	case *List:
		parts := make([]string, len(x.Items))
		for i, it := range x.Items {
			parts[i] = safeRepr(it)
		}
		return "[" + strings.Join(parts, ", ") + "]"
	case Tuple:
		parts := make([]string, len(x))
		for i, it := range x {
			parts[i] = safeRepr(it)
		}
		if len(x) == 1 {
			return "(" + parts[0] + ",)"
		}
		return "(" + strings.Join(parts, ", ") + ")"
	}
	return repr(v)
}

func sortedItems(d *Dict) [][2]Value {
	items := make([][2]Value, len(d.keys))
	for i, k := range d.keys {
		items[i] = [2]Value{k, d.vals[i]}
	}
	sort.SliceStable(items, func(i, j int) bool {
		return safeLess(items[i][0], items[j][0])
	})
	return items
}

// safeLess is pprint's _safe_key ordering: "<" when the types allow it,
// else the type names.
func safeLess(a, b Value) (res bool) {
	defer func() {
		if recover() != nil {
			res = "<class '"+typeName(a)+"'>" < "<class '"+typeName(b)+"'>"
		}
	}()
	return compare(a, b, "<") == -1
}

func ppFormat(b *strings.Builder, v Value, indent, allowance, level int) {
	rep := safeRepr(v)
	maxWidth := pprintWidth - indent - allowance
	if len([]rune(rep)) > maxWidth {
		switch x := v.(type) {
		case *Dict:
			b.WriteString("{")
			if x.Len() > 0 {
				ppDictItems(b, sortedItems(x), indent, allowance+1, level+1)
			}
			b.WriteString("}")
			return
		case *List:
			b.WriteString("[")
			ppItems(b, x.Items, indent, allowance+1, level+1)
			b.WriteString("]")
			return
		case Tuple:
			b.WriteString("(")
			end := ")"
			if len(x) == 1 {
				end = ",)"
			}
			ppItems(b, x, indent, allowance+len(end), level+1)
			b.WriteString(end)
			return
		case string:
			ppStr(b, x, indent, allowance, level+1)
			return
		}
	}
	b.WriteString(rep)
}

func ppDictItems(b *strings.Builder, items [][2]Value, indent, allowance, level int) {
	indent++
	delim := ",\n" + strings.Repeat(" ", indent)
	for i, it := range items {
		last := i == len(items)-1
		rep := safeRepr(it[0])
		b.WriteString(rep)
		b.WriteString(": ")
		a := 1
		if last {
			a = allowance
		}
		ppFormat(b, it[1], indent+len([]rune(rep))+2, a, level)
		if !last {
			b.WriteString(delim)
		}
	}
}

func ppItems(b *strings.Builder, items []Value, indent, allowance, level int) {
	indent++
	delim := ",\n" + strings.Repeat(" ", indent)
	for i, it := range items {
		if i > 0 {
			b.WriteString(delim)
		}
		a := 1
		if i == len(items)-1 {
			a = allowance
		}
		ppFormat(b, it, indent, a, level)
	}
}

var pprintPartRe = pyre.MustCompileSearch(`\S*\s*`, 0)

func ppStr(b *strings.Builder, s string, indent, allowance, level int) {
	if s == "" {
		b.WriteString(repr(s))
		return
	}
	var chunks []string
	lines := pySplitlines(s, true)
	if level == 1 {
		indent++
		allowance++
	}
	maxWidth1 := pprintWidth - indent
	maxWidth := maxWidth1
	var rep string
	for i, lv := range lines {
		line := lv.(string)
		rep = repr(line)
		if i == len(lines)-1 {
			maxWidth1 -= allowance
		}
		if len([]rune(rep)) <= maxWidth1 {
			chunks = append(chunks, rep)
			continue
		}
		parts := pprintPartRe.FindAll(line)
		if len(parts) > 0 && parts[len(parts)-1] == "" {
			parts = parts[:len(parts)-1]
		}
		maxWidth2 := maxWidth
		current := ""
		for j, part := range parts {
			candidate := current + part
			if j == len(parts)-1 && i == len(lines)-1 {
				maxWidth2 -= allowance
			}
			if len([]rune(repr(candidate))) > maxWidth2 {
				if current != "" {
					chunks = append(chunks, repr(current))
				}
				current = part
			} else {
				current = candidate
			}
		}
		if current != "" {
			chunks = append(chunks, repr(current))
		}
	}
	if len(chunks) == 1 {
		b.WriteString(rep)
		return
	}
	if level == 1 {
		b.WriteString("(")
	}
	for i, c := range chunks {
		if i > 0 {
			b.WriteString("\n" + strings.Repeat(" ", indent))
		}
		b.WriteString(c)
	}
	if level == 1 {
		b.WriteString(")")
	}
}

// ---------------------------------------------------------------- textwrap

const (
	twWhitespace = `[\t\n\x0b\x0c\r ]`
	twNoWS       = `[^\t\n\x0b\x0c\r ]`
	twWordPunct  = `[\w!"'&.,?]`
	twLetter     = `[^\d\W]`
)

var (
	wordsepRe = pyre.MustCompileSearch(`
        ( # any whitespace
          `+twWhitespace+`+
        | # em-dash between words
          (?<=`+twWordPunct+`) -{2,} (?=\w)
        | # word, possibly hyphenated
          `+twNoWS+`+? (?:
            # hyphenated word
              -(?: (?<=`+twLetter+`{2}-) | (?<=`+twLetter+`-`+twLetter+`-))
              (?= `+twLetter+` -? `+twLetter+`)
            | # end of word
              (?=`+twWhitespace+`|\Z)
            | # em-dash
              (?<=`+twWordPunct+`) (?=-{2,}\w)
            )
        )`, pyre.Verbose)
	wordsepSimpleRe = pyre.MustCompileSearch(`(`+twWhitespace+`+)`, 0)
)

// textwrap is textwrap.wrap with expand_tabs and replace_whitespace off.
func textwrap(text string, width int, breakLong, breakHyphens bool) []string {
	if width <= 0 {
		valueError(fmt.Sprintf("invalid width %d (must be > 0)", width))
	}
	var raw []string
	if breakHyphens {
		raw = wordsepRe.Split(text)
	} else {
		raw = wordsepSimpleRe.Split(text)
	}
	var chunks []string
	for _, c := range raw {
		if c != "" {
			chunks = append(chunks, c)
		}
	}
	rl := func(s string) int { return len([]rune(s)) }
	// reversed
	for i, j := 0, len(chunks)-1; i < j; i, j = i+1, j-1 {
		chunks[i], chunks[j] = chunks[j], chunks[i]
	}
	var lines []string
	for len(chunks) > 0 {
		var cur []string
		curLen := 0
		if pystr.TrimSpace(chunks[len(chunks)-1]) == "" && len(lines) > 0 {
			chunks = chunks[:len(chunks)-1]
		}
		for len(chunks) > 0 {
			l := rl(chunks[len(chunks)-1])
			if curLen+l <= width {
				cur = append(cur, chunks[len(chunks)-1])
				chunks = chunks[:len(chunks)-1]
				curLen += l
			} else {
				break
			}
		}
		if len(chunks) > 0 && rl(chunks[len(chunks)-1]) > width {
			spaceLeft := width - curLen
			if width < 1 {
				spaceLeft = 1
			}
			if breakLong {
				end := spaceLeft
				chunk := []rune(chunks[len(chunks)-1])
				if breakHyphens && len(chunk) > spaceLeft {
					hyphen := strings.LastIndex(string(chunk[:spaceLeft]), "-")
					if hyphen > 0 {
						hyphen = len([]rune(string(chunk[:spaceLeft])[:hyphen]))
						if strings.Trim(string(chunk[:hyphen]), "-") != "" {
							end = hyphen + 1
						}
					}
				}
				cur = append(cur, string(chunk[:end]))
				chunks[len(chunks)-1] = string(chunk[end:])
			} else if len(cur) == 0 {
				cur = append(cur, chunks[len(chunks)-1])
				chunks = chunks[:len(chunks)-1]
			}
			curLen = 0
			for _, c := range cur {
				curLen += rl(c)
			}
		}
		if len(cur) > 0 && pystr.TrimSpace(cur[len(cur)-1]) == "" {
			cur = cur[:len(cur)-1]
		}
		if len(cur) > 0 {
			lines = append(lines, strings.Join(cur, ""))
		}
	}
	return lines
}

// ---------------------------------------------------------------- tojson

// htmlsafeJSON is htmlsafe_json_dumps with the default policies:
// json.dumps(value, sort_keys=True, indent=indent), with <, >, & and '
// escaped.
func htmlsafeJSON(v Value, indent Value) string {
	var ind *string
	if indent != nil {
		var s string
		if is, ok := asStr(indent); ok {
			s = is
		} else {
			s = strings.Repeat(" ", int(toBig(indent).Int64()))
		}
		ind = &s
	}
	var b strings.Builder
	jsonEncode(&b, v, jsonOpts{indent: ind, sortKeys: true, ensureASCII: true}, 0)
	out := b.String()
	out = strings.ReplaceAll(out, "<", fmt.Sprintf("%cu%04x", 92, '<'))
	out = strings.ReplaceAll(out, ">", fmt.Sprintf("%cu%04x", 92, '>'))
	out = strings.ReplaceAll(out, "&", fmt.Sprintf("%cu%04x", 92, '&'))
	out = strings.ReplaceAll(out, "'", fmt.Sprintf("%cu%04x", 92, '\''))
	return out
}

func jsonString(s string, ensureASCII bool) string {
	var b strings.Builder
	b.WriteByte('"')
	for _, r := range s {
		switch r {
		case '"':
			b.WriteString(`\"`)
		case '\\':
			b.WriteString(`\\`)
		case '\n':
			b.WriteString(`\n`)
		case '\r':
			b.WriteString(`\r`)
		case '\t':
			b.WriteString(`\t`)
		case '\b':
			b.WriteString(`\b`)
		case '\f':
			b.WriteString(`\f`)
		default:
			switch {
			case r >= 0x10000 && ensureASCII:
				r1, r2 := utf16.EncodeRune(r)
				fmt.Fprintf(&b, `\u%04x\u%04x`, r1, r2)
			case r < 0x20 || ensureASCII && r > 0x7e:
				fmt.Fprintf(&b, `\u%04x`, r)
			default:
				b.WriteRune(r)
			}
		}
	}
	b.WriteByte('"')
	return b.String()
}

func jsonFloat(f float64) string {
	switch {
	case math.IsNaN(f):
		return "NaN"
	case math.IsInf(f, 1):
		return "Infinity"
	case math.IsInf(f, -1):
		return "-Infinity"
	}
	return pystr.FloatRepr(f)
}

type jsonOpts struct {
	indent      *string
	sortKeys    bool
	ensureASCII bool
}

// JSONDumps is json.dumps(v, indent=indent, sort_keys=sortKeys,
// ensure_ascii=ensureASCII); indent "" without hasIndent is None.
func JSONDumps(v Value, indent string, hasIndent, sortKeys, ensureASCII bool) (out string, err error) {
	defer func() {
		if rec := recover(); rec != nil {
			e, ok := rec.(*Error)
			if !ok {
				panic(rec)
			}
			err = e
		}
	}()
	o := jsonOpts{sortKeys: sortKeys, ensureASCII: ensureASCII}
	if hasIndent {
		o.indent = &indent
	}
	var b strings.Builder
	jsonEncode(&b, v, o, 0)
	return b.String(), nil
}

func jsonEncode(b *strings.Builder, v Value, o jsonOpts, level int) {
	indent := o.indent
	newline := func(l int) {
		if indent != nil {
			b.WriteString("\n" + strings.Repeat(*indent, l))
		}
	}
	itemSep := ", "
	if indent != nil {
		itemSep = ","
	}
	switch x := v.(type) {
	case nil:
		b.WriteString("null")
	case bool:
		if x {
			b.WriteString("true")
		} else {
			b.WriteString("false")
		}
	case int64, *big.Int:
		b.WriteString(intStr(x))
	case float64:
		b.WriteString(jsonFloat(x))
	case string:
		b.WriteString(jsonString(x, o.ensureASCII))
	case Markup:
		b.WriteString(jsonString(string(x), o.ensureASCII))
	case *List, Tuple:
		items := toList(x)
		if len(items) == 0 {
			b.WriteString("[]")
			return
		}
		b.WriteString("[")
		for i, it := range items {
			if i > 0 {
				b.WriteString(itemSep)
			}
			newline(level + 1)
			jsonEncode(b, it, o, level+1)
		}
		newline(level)
		b.WriteString("]")
	case *Dict:
		if x.Len() == 0 {
			b.WriteString("{}")
			return
		}
		keys := append([]Value{}, x.keys...)
		vals := map[string]Value{}
		for i, k := range x.keys {
			vals[hashKey(k)] = x.vals[i]
		}
		if o.sortKeys {
			keys = pySort(keys, nil, false)
		}
		b.WriteString("{")
		for i, k := range keys {
			if i > 0 {
				b.WriteString(itemSep)
			}
			newline(level + 1)
			var ks string
			switch kk := k.(type) {
			case string:
				ks = kk
			case Markup:
				ks = string(kk)
			case bool:
				ks = map[bool]string{true: "true", false: "false"}[kk]
			case nil:
				ks = "null"
			case int64, *big.Int:
				ks = intStr(kk)
			case float64:
				ks = jsonFloat(kk)
			default:
				typeError("keys must be str, int, float, bool or None, not " + typeName(k))
			}
			b.WriteString(jsonString(ks, o.ensureASCII))
			b.WriteString(": ")
			jsonEncode(b, vals[hashKey(k)], o, level+1)
		}
		newline(level)
		b.WriteString("}")
	default:
		typeError("Object of type " + typeName(v) + " is not JSON serializable")
	}
}

// ---------------------------------------------------------------- lipsum

func lipsum(r *renderer, args []Value, kwargs []kwarg) Value {
	a := argList{fn: "generate_lorem_ipsum", args: args, kwargs: kwargs}
	vals := a.named([]string{"n", "html", "min", "max"}, []Value{int64(5), true, int64(20), int64(100)})
	words := strings.Fields(loremIpsumWords)
	n, lo, hi := optInt(vals[0], 5), optInt(vals[2], 20), optInt(vals[3], 100)
	var result []string
	for range n {
		next := true
		lastComma, lastFullstop := 0, 0
		last := ""
		var p []string
		count := lo
		if hi > lo {
			count = lo + rand.Intn(hi-lo)
		}
		for idx := 0; idx < count; idx++ {
			var word string
			for {
				word = words[rand.Intn(len(words))]
				if word != last {
					last = word
					break
				}
			}
			if next {
				word = pyCapitalize(word)
				next = false
			}
			if idx-(3+rand.Intn(5)) > lastComma {
				lastComma = idx
				lastFullstop += 2
				word += ","
			}
			if idx-(10+rand.Intn(10)) > lastFullstop {
				lastComma, lastFullstop = idx, idx
				word += "."
				next = true
			}
			p = append(p, word)
		}
		ps := strings.Join(p, " ")
		if strings.HasSuffix(ps, ",") {
			ps = ps[:len(ps)-1] + "."
		} else if !strings.HasSuffix(ps, ".") {
			ps += "."
		}
		result = append(result, ps)
	}
	if !truth(vals[1]) {
		return strings.Join(result, "\n\n")
	}
	parts := make([]string, len(result))
	for i, x := range result {
		parts[i] = "<p>" + escapeHTML(x) + "</p>"
	}
	return Markup(strings.Join(parts, "\n"))
}

// ---------------------------------------------------------------- datetime

// DateTime is a datetime.datetime, aware when UTC is set.
type DateTime struct {
	T     time.Time
	Aware bool
}

func (d *DateTime) TypeName() string { return "datetime" }
func (d *DateTime) Module() string   { return "datetime" }

func (d *DateTime) Str() string {
	s := d.T.Format("2006-01-02 15:04:05")
	if us := d.T.Nanosecond() / 1000; us != 0 {
		s += fmt.Sprintf(".%06d", us)
	}
	if d.Aware {
		s += offsetString(d.T)
	}
	return s
}

func offsetString(t time.Time) string {
	_, off := t.Zone()
	sign := "+"
	if off < 0 {
		sign, off = "-", -off
	}
	return fmt.Sprintf("%s%02d:%02d", sign, off/3600, off%3600/60)
}

func (d *DateTime) Repr() string {
	t := d.T
	parts := []string{strconv.Itoa(t.Year()), strconv.Itoa(int(t.Month())), strconv.Itoa(t.Day()), strconv.Itoa(t.Hour()), strconv.Itoa(t.Minute())}
	us := t.Nanosecond() / 1000
	if t.Second() != 0 || us != 0 {
		parts = append(parts, strconv.Itoa(t.Second()))
	}
	if us != 0 {
		parts = append(parts, strconv.Itoa(us))
	}
	s := "datetime.datetime(" + strings.Join(parts, ", ")
	if d.Aware {
		s += ", tzinfo=datetime.timezone.utc"
	}
	return s + ")"
}

func (d *DateTime) Equal(o Value) bool {
	x, ok := o.(*DateTime)
	return ok && x.T.Equal(d.T)
}

func (d *DateTime) isoformat(sep string) string {
	s := d.T.Format("2006-01-02") + sep + d.T.Format("15:04:05")
	if us := d.T.Nanosecond() / 1000; us != 0 {
		s += fmt.Sprintf(".%06d", us)
	}
	if d.Aware {
		s += offsetString(d.T)
	}
	return s
}

func (d *DateTime) Attr(name string) (Value, bool) {
	t := d.T
	switch name {
	case "year":
		return int64(t.Year()), true
	case "month":
		return int64(t.Month()), true
	case "day":
		return int64(t.Day()), true
	case "hour":
		return int64(t.Hour()), true
	case "minute":
		return int64(t.Minute()), true
	case "second":
		return int64(t.Second()), true
	case "microsecond":
		return int64(t.Nanosecond() / 1000), true
	case "fold":
		return int64(0), true
	case "tzinfo":
		if !d.Aware {
			return nil, true
		}
		return utcZone{}, true
	case "isoformat":
		return &builtinFunc{name: "isoformat", fn: func(r *renderer, args []Value, kw []kwarg) Value {
			p := argList{fn: "isoformat", args: args, kwargs: kw}.named([]string{"sep", "timespec"}, []Value{"T", "auto"})
			return d.isoformat(str(p[0]))
		}}, true
	case "strftime":
		return &builtinFunc{name: "strftime", fn: func(r *renderer, args []Value, kw []kwarg) Value {
			argList{fn: "strftime", args: args, kwargs: kw}.count(1, 1)
			return strftime(d, mustStr(args[0], "strftime() argument 1"))
		}}, true
	case "timestamp":
		return &builtinFunc{name: "timestamp", fn: func(*renderer, []Value, []kwarg) Value {
			return float64(t.UnixNano()) / 1e9
		}}, true
	case "weekday":
		return &builtinFunc{name: "weekday", fn: func(*renderer, []Value, []kwarg) Value { return int64((int(t.Weekday()) + 6) % 7) }}, true
	case "isoweekday":
		return &builtinFunc{name: "isoweekday", fn: func(*renderer, []Value, []kwarg) Value { return int64((int(t.Weekday())+6)%7 + 1) }}, true
	case "ctime":
		return &builtinFunc{name: "ctime", fn: func(*renderer, []Value, []kwarg) Value {
			return t.Format("Mon Jan ") + fmt.Sprintf("%2d", t.Day()) + t.Format(" 15:04:05 2006")
		}}, true
	}
	return nil, false
}

type utcZone struct{}

func (utcZone) TypeName() string          { return "timezone" }
func (utcZone) Module() string            { return "datetime" }
func (utcZone) Attr(string) (Value, bool) { return nil, false }
func (utcZone) Repr() string              { return "datetime.timezone.utc" }
func (utcZone) Str() string               { return "UTC" }

func strftime(d *DateTime, f string) string {
	t := d.T
	var b strings.Builder
	r := []rune(f)
	for i := 0; i < len(r); i++ {
		if r[i] != '%' || i+1 >= len(r) {
			b.WriteRune(r[i])
			continue
		}
		i++
		switch r[i] {
		case 'Y':
			fmt.Fprintf(&b, "%04d", t.Year())
		case 'y':
			fmt.Fprintf(&b, "%02d", t.Year()%100)
		case 'm':
			fmt.Fprintf(&b, "%02d", int(t.Month()))
		case 'd':
			fmt.Fprintf(&b, "%02d", t.Day())
		case 'H':
			fmt.Fprintf(&b, "%02d", t.Hour())
		case 'I':
			h := t.Hour() % 12
			if h == 0 {
				h = 12
			}
			fmt.Fprintf(&b, "%02d", h)
		case 'M':
			fmt.Fprintf(&b, "%02d", t.Minute())
		case 'S':
			fmt.Fprintf(&b, "%02d", t.Second())
		case 'f':
			fmt.Fprintf(&b, "%06d", t.Nanosecond()/1000)
		case 'p':
			b.WriteString(t.Format("PM"))
		case 'b':
			b.WriteString(t.Format("Jan"))
		case 'B':
			b.WriteString(t.Format("January"))
		case 'a':
			b.WriteString(t.Format("Mon"))
		case 'A':
			b.WriteString(t.Format("Monday"))
		case 'j':
			fmt.Fprintf(&b, "%03d", t.YearDay())
		case 'z':
			if d.Aware {
				b.WriteString(strings.ReplaceAll(offsetString(t), ":", ""))
			}
		case 'Z':
			if d.Aware {
				b.WriteString("UTC")
			}
		case 'w':
			fmt.Fprintf(&b, "%d", int(t.Weekday()))
		case '%':
			b.WriteByte('%')
		default:
			b.WriteRune('%')
			b.WriteRune(r[i])
		}
	}
	return b.String()
}

// ---------------------------------------------------------------- JSON input

// FromJSON decodes JSON into template values as Python's json.loads does:
// objects become dicts in their own key order, numbers ints or floats.
func FromJSON(data []byte) (Value, error) {
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.UseNumber()
	v, err := decodeJSON(dec)
	if err != nil {
		return nil, err
	}
	return v, nil
}

func decodeJSON(dec *json.Decoder) (Value, error) {
	tok, err := dec.Token()
	if err != nil {
		return nil, err
	}
	switch t := tok.(type) {
	case json.Delim:
		switch t {
		case '{':
			d := NewDict()
			for dec.More() {
				kt, err := dec.Token()
				if err != nil {
					return nil, err
				}
				v, err := decodeJSON(dec)
				if err != nil {
					return nil, err
				}
				d.Set(kt.(string), v)
			}
			_, err := dec.Token()
			return d, err
		case '[':
			l := &List{Items: []Value{}}
			for dec.More() {
				v, err := decodeJSON(dec)
				if err != nil {
					return nil, err
				}
				l.Items = append(l.Items, v)
			}
			_, err := dec.Token()
			return l, err
		}
	case json.Number:
		return FromGo(t), nil
	case string, bool, nil:
		return t, nil
	}
	return nil, fmt.Errorf("unexpected JSON token %v", tok)
}
