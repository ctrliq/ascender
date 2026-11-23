package i18n

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"sync"
)

// Python's two ways of filling in a message, which the old API's catalogs
// were written for.

// Style is how a message's placeholders are written.
type Style int

const (
	// Percent is printf-style: "%(name)s", "%s", "%d", "%%".
	Percent Style = iota
	// Brace is str.format: "{name}", "{}", "{0}", "{a[b]}", "{{".
	Brace
)

// token is one piece of a message: literal text, or a placeholder.
type token struct {
	text string // literal text, or the placeholder as written
	ph   bool
	// key identifies a placeholder's value: "name" for %(name)s and
	// {name}, "#0", "#1"... for positional ones (%s, {}, {0}).
	key string
	// conv is a %-placeholder's conversion character ('s', 'd', 'r'...).
	conv byte
}

var pctRe = regexp.MustCompile(`%(?:\(([^)]*)\))?[-#0 +]*(?:\*|\d+)?(?:\.(?:\*|\d+))?[hlL]?([diouxXeEfFgGcrsa%])`)

// tokenize splits a message written in a style.
func tokenize(msg string, style Style) []token {
	var out []token
	lit := func(s string) {
		if s == "" {
			return
		}
		if n := len(out); n > 0 && !out[n-1].ph {
			out[n-1].text += s
			return
		}
		out = append(out, token{text: s})
	}
	switch style {
	case Percent:
		pos, auto := 0, 0
		for _, m := range pctRe.FindAllStringSubmatchIndex(msg, -1) {
			lit(msg[pos:m[0]])
			pos = m[1]
			conv := msg[m[4]]
			if conv == '%' {
				lit("%")
				continue
			}
			t := token{text: msg[m[0]:m[1]], ph: true, conv: conv}
			if m[2] >= 0 {
				t.key = msg[m[2]:m[3]]
			} else {
				t.key = "#" + strconv.Itoa(auto)
				auto++
			}
			out = append(out, t)
		}
		lit(msg[pos:])
	case Brace:
		auto := 0
		var b strings.Builder
		for i := 0; i < len(msg); i++ {
			c := msg[i]
			if (c == '{' || c == '}') && i+1 < len(msg) && msg[i+1] == c {
				b.WriteByte(c)
				i++
				continue
			}
			if c != '{' {
				b.WriteByte(c)
				continue
			}
			end := strings.IndexByte(msg[i:], '}')
			if end < 0 {
				b.WriteString(msg[i:])
				break
			}
			field := msg[i+1 : i+end]
			lit(b.String())
			b.Reset()
			name := field
			if j := strings.IndexAny(name, "!:"); j >= 0 {
				name = name[:j]
			}
			key := name
			switch {
			case name == "":
				key = "#" + strconv.Itoa(auto)
				auto++
			case isDigits(name):
				key = "#" + name
			}
			out = append(out, token{text: msg[i : i+end+1], ph: true, key: key})
			i += end
		}
		lit(b.String())
	}
	return out
}

func isDigits(s string) bool {
	for i := 0; i < len(s); i++ {
		if s[i] < '0' || s[i] > '9' {
			return false
		}
	}
	return s != ""
}

// fill writes a tokenized message with its placeholders' values; a
// placeholder without one is left as written.
func fill(toks []token, vals map[string]string) string {
	var b strings.Builder
	for _, t := range toks {
		if !t.ph {
			b.WriteString(t.text)
			continue
		}
		if v, ok := vals[t.key]; ok {
			b.WriteString(v)
		} else {
			b.WriteString(t.text)
		}
	}
	return b.String()
}

// pyStr is Python's str() of a value, for the values Go code passes.
func pyStr(v any) string {
	switch x := v.(type) {
	case nil:
		return "None"
	case bool:
		if x {
			return "True"
		}
		return "False"
	case string:
		return x
	case fmt.Stringer:
		return x.String()
	}
	return fmt.Sprint(v)
}

// pyRepr is Python's repr() of a string or a number.
func pyRepr(v any) string {
	s, ok := v.(string)
	if !ok {
		return pyStr(v)
	}
	q := "'"
	if strings.Contains(s, "'") && !strings.Contains(s, `"`) {
		q = `"`
	}
	r := strings.NewReplacer(`\`, `\\`, "\n", `\n`, "\r", `\r`, "\t", `\t`)
	s = r.Replace(s)
	if q == "'" {
		s = strings.ReplaceAll(s, "'", `\'`)
	}
	return q + s + q
}

// values maps a call's arguments to placeholder keys: one map argument
// gives named values, others are positional ("#0", "#1"...).
func values(toks []token, args []any) map[string]string {
	vals := map[string]string{}
	var named map[string]any
	if len(args) == 1 {
		named, _ = args[0].(map[string]any)
	}
	for _, t := range toks {
		if !t.ph {
			continue
		}
		var v any
		ok := false
		if named != nil && !strings.HasPrefix(t.key, "#") {
			v, ok = named[t.key]
		} else if strings.HasPrefix(t.key, "#") {
			if i, err := strconv.Atoi(t.key[1:]); err == nil && i < len(args) {
				v, ok = args[i], true
			}
		}
		if !ok {
			continue
		}
		switch t.conv {
		case 'r':
			vals[t.key] = pyRepr(v)
		case 'd', 'i':
			switch n := v.(type) {
			case float64:
				vals[t.key] = strconv.FormatInt(int64(n), 10)
			default:
				vals[t.key] = pyStr(v)
			}
		default:
			vals[t.key] = pyStr(v)
		}
	}
	return vals
}

// Sprintf fills in a %-style message as Python's % operator does, for the
// conversions the API's messages use (%s, %d, %r, %%): one map argument
// supplies %(name)s placeholders, other arguments %s ones in order.
func Sprintf(format string, args ...any) string {
	toks := tokenize(format, Percent)
	return fill(toks, values(toks, args))
}

// Format fills in a str.format message: one map argument supplies {name}
// placeholders, other arguments {} and {0} ones.
func Format(format string, args ...any) string {
	toks := tokenize(format, Brace)
	return fill(toks, values(toks, args))
}

// Sprintf translates a %-style message and fills it in, as the old code's
// _('...') % args.
func (l *Locale) Sprintf(msgid string, args ...any) string {
	return Sprintf(l.Gettext(msgid), args...)
}

// Format translates a str.format message and fills it in, as the old
// code's _('...').format(args).
func (l *Locale) Format(msgid string, args ...any) string {
	return Format(l.Gettext(msgid), args...)
}

// A Template recognizes the English text of one formatted message, so a
// message built in English can be given in another language afterwards:
// the old code formatted gettext's result, so the translation is the
// translated message filled with the same values.
type Template struct {
	ID, Plural string
	Style      Style
	// NKey names the placeholder holding a plural message's count.
	NKey string
	// TrArgs are placeholders whose values the old code translated too
	// (a lazily translated name passed in as a value).
	TrArgs []string

	once  sync.Once
	forms []*regexp.Regexp
	keys  [][]string
	// prefix and suffix are each form's literal text before its first
	// placeholder and after its last, checked before the expression.
	prefix, suffix []string
	literal        int
}

// NewTemplate returns the Template of msgid, whose style is guessed from
// its placeholders: %-style when it has any, else str.format.
func NewTemplate(msgid string) *Template {
	t := &Template{ID: msgid, Style: Brace}
	for _, tk := range tokenize(msgid, Percent) {
		if tk.ph {
			t.Style = Percent
			break
		}
	}
	return t
}

// NewPluralTemplate returns the Template of an ngettext message, whose
// count is the placeholder nKey.
func NewPluralTemplate(singular, plural, nKey string) *Template {
	t := NewTemplate(singular)
	t.Plural, t.NKey = plural, nKey
	return t
}

func (t *Template) compile() {
	t.once.Do(func() {
		srcs := []string{t.ID}
		if t.Plural != "" {
			srcs = append(srcs, t.Plural)
		}
		for _, src := range srcs {
			var re strings.Builder
			re.WriteString(`(?s)^`)
			var keys []string
			toks := tokenize(src, t.Style)
			pre, suf := "", ""
			if len(toks) > 0 && !toks[0].ph {
				pre = toks[0].text
			}
			if n := len(toks); n > 1 && !toks[n-1].ph {
				suf = toks[n-1].text
			}
			t.prefix, t.suffix = append(t.prefix, pre), append(t.suffix, suf)
			for _, tk := range toks {
				if !tk.ph {
					if src == t.ID {
						t.literal += len(tk.text)
					}
					re.WriteString(regexp.QuoteMeta(tk.text))
					continue
				}
				if tk.conv == 'd' || tk.conv == 'i' {
					re.WriteString(`(-?\d+)`)
				} else {
					re.WriteString(`(.*?)`)
				}
				keys = append(keys, tk.key)
			}
			re.WriteString(`$`)
			t.forms = append(t.forms, regexp.MustCompile(re.String()))
			t.keys = append(t.keys, keys)
		}
	})
}

// Match returns the placeholder values that make text this message in
// English.
func (t *Template) Match(text string) (map[string]string, bool) {
	t.compile()
	for i, re := range t.forms {
		if !strings.HasPrefix(text, t.prefix[i]) || !strings.HasSuffix(text, t.suffix[i]) {
			continue
		}
		m := re.FindStringSubmatch(text)
		if m == nil {
			continue
		}
		vals := map[string]string{}
		ok := true
		for j, k := range t.keys[i] {
			if prev, seen := vals[k]; seen && prev != m[j+1] {
				ok = false
				break
			}
			vals[k] = m[j+1]
		}
		if ok {
			return vals, true
		}
	}
	return nil, false
}

// Literal is the length of the message's text outside its placeholders:
// of two messages that both match a text, the one with more literal text
// is the more specific.
func (t *Template) Literal() int {
	t.compile()
	return t.literal
}

// Translate gives text, this message in English, in l's language; ok is
// false when text is not this message.
func (t *Template) Translate(l *Locale, text string) (string, bool) {
	vals, ok := t.Match(text)
	if !ok {
		return text, false
	}
	for _, k := range t.TrArgs {
		if v, ok := vals[k]; ok {
			vals[k] = l.Gettext(v)
		}
	}
	msg := l.Gettext(t.ID)
	if t.Plural != "" {
		n, _ := strconv.ParseInt(vals[t.NKey], 10, 64)
		msg = l.Ngettext(t.ID, t.Plural, n)
	}
	return fill(tokenize(msg, t.Style), vals), true
}
