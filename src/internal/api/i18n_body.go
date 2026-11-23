package api

import (
	_ "embed"
	"encoding/json"
	"sort"
	"sync"

	"github.com/ctrliq/ascender/internal/i18n"
)

// Error bodies are translated as they are written: each message in them
// is looked up whole, or recognized as one of the old code's formatted
// messages, in the request's language. locale/messages.json
// (testdata/gen_api_messages.py) says which of the old messages were
// translated at all.

//go:embed locale/messages.json
var messagesJSON []byte

type messageRules struct {
	// formatted are the old code's formatted messages, most specific
	// first; an english one is a format the old code left English.
	formatted []formattedRule
	// untranslated are whole messages that stay English though a catalog
	// has them, english ones that no formatted message may claim.
	untranslated, english map[string]bool
	// exact are messages Django put together from pieces, as it gave
	// them in each language.
	exact map[string]map[string]string
}

type formattedRule struct {
	t       *i18n.Template
	english bool
}

var (
	rulesOnce sync.Once
	rules     messageRules
)

func loadMessageRules() *messageRules {
	rulesOnce.Do(func() {
		type format struct {
			ID, Style, Plural, N string
		}
		var raw struct {
			Formatted    []format
			Untranslated []string
			English      []json.RawMessage
			Exact        map[string]map[string]string
		}
		if err := json.Unmarshal(messagesJSON, &raw); err != nil {
			panic("api: locale/messages.json: " + err.Error())
		}
		rules.exact = raw.Exact
		rules.english = map[string]bool{}
		for _, e := range raw.English {
			var s string
			if json.Unmarshal(e, &s) == nil {
				rules.english[s] = true
				continue
			}
			var f format
			if err := json.Unmarshal(e, &f); err != nil {
				panic("api: locale/messages.json: " + err.Error())
			}
			t := i18n.NewTemplate(f.ID)
			if f.Style == "brace" {
				t.Style = i18n.Brace
			} else {
				t.Style = i18n.Percent
			}
			rules.formatted = append(rules.formatted, formattedRule{t, true})
		}
		for _, f := range raw.Formatted {
			var t *i18n.Template
			if f.Plural != "" {
				t = i18n.NewPluralTemplate(f.ID, f.Plural, f.N)
			} else {
				t = i18n.NewTemplate(f.ID)
			}
			t.TrArgs = translatedArgs[f.ID]
			if f.Style == "brace" {
				t.Style = i18n.Brace
			} else {
				t.Style = i18n.Percent
			}
			rules.formatted = append(rules.formatted, formattedRule{t, false})
		}
		// The most specific message first; of two as specific, English.
		sort.SliceStable(rules.formatted, func(i, j int) bool {
			a, b := rules.formatted[i], rules.formatted[j]
			if a.t.Literal() != b.t.Literal() {
				return a.t.Literal() > b.t.Literal()
			}
			return a.english && !b.english
		})
		rules.untranslated = map[string]bool{}
		for _, m := range raw.Untranslated {
			rules.untranslated[m] = true
		}
	})
	return &rules
}

// TranslateMessage is an English API message in l's language, where the
// old API translated it.
func TranslateMessage(l *i18n.Locale, s string) string {
	if l.English() || s == "" {
		return s
	}
	rs := loadMessageRules()
	if rs.untranslated[s] || rs.english[s] {
		return s
	}
	if m, ok := rs.exact[s]; ok {
		if t, ok := m[l.Lang]; ok {
			return t
		}
		return s
	}
	if l.HasAPI(s) {
		return l.Gettext(s)
	}
	for _, c := range composedMessages {
		if out, ok := c(l, s); ok {
			return out
		}
	}
	for _, f := range rs.formatted {
		if f.english {
			if _, ok := f.t.Match(s); ok {
				return s
			}
			continue
		}
		if out, ok := f.t.Translate(l, s); ok {
			return out
		}
	}
	return s
}

// dataKeys are error-body keys whose values are data, not messages.
var dataKeys = map[string]bool{
	"active_jobs":               true,
	"ignored_fields":            true,
	"passwords_needed_to_start": true,
	"sent_jwt_payload":          true,
}

// translateBody returns an error body with its messages translated: the
// strings in it, at any depth of objects and lists, except under
// dataKeys. The body is copied where it changes; shared bodies (ErrNotFound)
// are never modified.
func translateBody(l *i18n.Locale, v any) any {
	switch x := v.(type) {
	case string:
		return TranslateMessage(l, x)
	case []string:
		out := make([]string, len(x))
		for i, s := range x {
			out[i] = TranslateMessage(l, s)
		}
		return out
	case []any:
		out := make([]any, len(x))
		for i, e := range x {
			out[i] = translateBody(l, e)
		}
		return out
	case FieldErrors:
		return translateStringLists(l, x)
	case map[string][]string:
		return translateStringLists(l, x)
	case map[string]string:
		out := make(map[string]any, len(x))
		for k, s := range x {
			if dataKeys[k] {
				out[k] = s
			} else {
				out[k] = TranslateMessage(l, s)
			}
		}
		return out
	case map[string]any:
		out := make(map[string]any, len(x))
		for k, e := range x {
			if dataKeys[k] {
				out[k] = e
			} else {
				out[k] = translateBody(l, e)
			}
		}
		return out
	case *OMap:
		if x == nil {
			return x
		}
		out := NewOMap()
		for _, k := range x.keys {
			e := x.vals[k]
			if !dataKeys[k] {
				e = translateBody(l, e)
			}
			out.Set(k, e)
		}
		return out
	}
	return v
}

func translateStringLists(l *i18n.Locale, m map[string][]string) map[string][]string {
	out := make(map[string][]string, len(m))
	for k, list := range m {
		t := make([]string, len(list))
		for i, s := range list {
			t[i] = TranslateMessage(l, s)
		}
		out[k] = t
	}
	return out
}
