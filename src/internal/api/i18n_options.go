package api

import (
	"embed"
	"encoding/json"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"unicode"

	"github.com/ctrliq/ascender/internal/i18n"
)

// OPTIONS documents are captured in English; locale/options/<lang>.json
// (testdata/gen_options_i18n.py) records what the old API's documents said
// in each language: per kind of text (label, help_text, choice, category,
// unit, name) the usual translation of each English text, and per route
// the places that differ from it.

//go:embed locale/options/*.json
var optionsLocaleFS embed.FS

type optionsCatalog struct {
	kinds map[string]map[string]string
	paths map[string]map[string]string
}

var (
	optionsCatalogsMu sync.Mutex
	optionsCatalogs   = map[string]*optionsCatalog{}
)

func optionsCatalogFor(lang string) *optionsCatalog {
	optionsCatalogsMu.Lock()
	defer optionsCatalogsMu.Unlock()
	if c, ok := optionsCatalogs[lang]; ok {
		return c
	}
	c := &optionsCatalog{kinds: map[string]map[string]string{}, paths: map[string]map[string]string{}}
	if b, err := optionsLocaleFS.ReadFile("locale/options/" + lang + ".json"); err == nil {
		var raw map[string]map[string]json.RawMessage
		if err := json.Unmarshal(b, &raw); err != nil {
			panic("api: locale/options/" + lang + ".json: " + err.Error())
		}
		for kind, m := range raw {
			for k, v := range m {
				if kind == "paths" {
					var p map[string]string
					_ = json.Unmarshal(v, &p)
					c.paths[k] = p
					continue
				}
				var s string
				_ = json.Unmarshal(v, &s)
				if c.kinds[kind] == nil {
					c.kinds[kind] = map[string]string{}
				}
				c.kinds[kind][k] = s
			}
		}
	}
	optionsCatalogs[lang] = c
	return c
}

// text is an OPTIONS text of a kind at a place in a route's document.
func (c *optionsCatalog) text(route, path, kind, en string) string {
	if p, ok := c.paths[route][path]; ok {
		return p
	}
	if t, ok := c.kinds[kind][en]; ok {
		return t
	}
	return en
}

// OptionsText is the translation the old API's OPTIONS documents gave an
// English label, help text, choice name, setting category or unit (kind
// "label", "help_text", "choice", "category" or "unit") in an API
// language, for text taken from captured metadata or the settings
// registry outside a document.
func OptionsText(lang, kind, en string) string {
	l := locFor(lang)
	if l.English() {
		return en
	}
	return optionsCatalogFor(l.Lang).text("", "", kind, en)
}

var numericSegment = regexp.MustCompile(`/\d+/`)

// optionsRoute is the route a request's document is recorded under: its
// path with numeric segments as {id}.
func optionsRoute(r *http.Request) string {
	p := r.URL.Path
	for {
		q := numericSegment.ReplaceAllString(p, "/{id}/")
		if q == p {
			return p
		}
		p = q
	}
}

var optionsAttrs = []string{"label", "help_text", "category", "unit"}

// translateOptionsDoc puts an OPTIONS document into l's language in place.
func translateOptionsDoc(l *i18n.Locale, route string, doc *OMap) {
	c := optionsCatalogFor(l.Lang)
	if v, ok := doc.Get("name"); ok {
		if s, ok := v.(string); ok {
			doc.Set("name", c.text(route, "name", "name", s))
		}
	}
	// The description lists the fields with their help texts and choice
	// names, which change with them.
	var helps [][3]string
	choices := map[string]string{}
	if actions, ok := doc.Get("actions"); ok {
		if am, ok := actions.(*OMap); ok {
			for _, m := range am.keys {
				fields, ok := am.vals[m].(*OMap)
				if !ok {
					continue
				}
				for _, f := range fields.keys {
					fm, ok := fields.vals[f].(*OMap)
					if !ok {
						continue
					}
					before, _ := fm.vals["help_text"].(string)
					beforeChoices, _ := fm.vals["choices"].([]any)
					translateOptionsField(c, route, m+"."+f, fm)
					if after, _ := fm.vals["help_text"].(string); after != before {
						helps = append(helps, [3]string{f, before, after})
					}
					afterChoices, _ := fm.vals["choices"].([]any)
					for i := range beforeChoices {
						b, _ := beforeChoices[i].([]any)
						a, _ := afterChoices[i].([]any)
						if len(b) == 2 && len(a) == 2 {
							if bs, ok := b[1].(string); ok {
								if as, ok := a[1].(string); ok && as != bs {
									if _, seen := choices[bs]; !seen {
										choices[bs] = as
									}
								}
							}
						}
					}
				}
			}
		}
	}
	if v, ok := doc.Get("description"); ok {
		if s, ok := v.(string); ok && s != "" {
			doc.Set("description", translateDescription(c, route, s, helps, choices))
		}
	}
}

var choiceLine = regexp.MustCompile("^(    - `[^`]*`: )(.*)$")

// translateDescription translates a view's description line by line: the
// lines recorded from the old API (Markdown with the model's translated
// verbose names in it), else the field lines with the translated help
// texts and choice names swapped in.
func translateDescription(c *optionsCatalog, route, desc string, helps [][3]string, choices map[string]string) string {
	lines := strings.Split(desc, "\n")
	for i, line := range lines {
		if t, ok := c.paths[route]["line:"+line]; ok {
			lines[i] = t
		} else if t, ok := c.kinds["line"][line]; ok {
			lines[i] = t
		} else if m := choiceLine.FindStringSubmatch(line); m != nil {
			if t, ok := choices[m[2]]; ok {
				lines[i] = m[1] + t
			}
		}
	}
	out := strings.Join(lines, "\n")
	// Help texts can run over several lines. The descriptions show them
	// with capfirst and escaped.
	for _, h := range helps {
		out = strings.ReplaceAll(out, "`"+h[0]+"`: "+djangoEscape(capfirst(h[1]))+" (", "`"+h[0]+"`: "+djangoEscape(capfirst(h[2]))+" (")
	}
	return out
}

// capfirst is Django's capfirst: the first character upper-cased.
func capfirst(s string) string {
	for i, r := range s {
		return string(unicode.ToUpper(r)) + s[i+len(string(r)):]
	}
	return s
}

func translateOptionsField(c *optionsCatalog, route, path string, fm *OMap) {
	for _, a := range optionsAttrs {
		if s, ok := fm.vals[a].(string); ok {
			fm.vals[a] = c.text(route, path+"."+a, a, s)
		}
	}
	if choices, ok := fm.vals["choices"].([]any); ok {
		out := make([]any, len(choices))
		for i, ch := range choices {
			out[i] = ch
			pair, ok := ch.([]any)
			if !ok || len(pair) != 2 {
				continue
			}
			if s, ok := pair[1].(string); ok {
				out[i] = []any{pair[0], c.text(route, path+".choice."+pyValueString(pair[0]), "choice", s)}
			}
		}
		fm.vals["choices"] = out
	}
	if child, ok := fm.vals["child"].(*OMap); ok {
		translateOptionsField(c, route, path+".child", child)
	}
	if children, ok := fm.vals["children"].(*OMap); ok {
		for _, k := range children.keys {
			if cm, ok := children.vals[k].(*OMap); ok {
				translateOptionsField(c, route, path+".children."+k, cm)
			}
		}
	}
}

// pyValueString is Python's str() of a decoded JSON choice value, as the
// generator keyed choices.
func pyValueString(v any) string {
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
	case json.Number:
		return x.String()
	}
	b, _ := json.Marshal(v)
	return string(b)
}

// localizeOptions serves an OPTIONS handler's document in the request's
// language.
func localizeOptions(options HandlerFunc) HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) error {
		l := Loc(r)
		if l.English() {
			return options(w, r)
		}
		bw := newBufferWriter()
		err := options(bw, r)
		for k, v := range bw.header {
			if k != "Content-Length" {
				w.Header()[k] = v
			}
		}
		if err != nil {
			return err
		}
		if bw.status == http.StatusOK && strings.HasPrefix(bw.header.Get("Content-Type"), "application/json") {
			if v, err := DecodeOrdered(bw.body.String()); err == nil {
				if doc, ok := v.(*OMap); ok {
					translateOptionsDoc(l, optionsRoute(r), doc)
					WriteJSON(w, http.StatusOK, doc)
					return nil
				}
			}
		}
		bw.passThrough(w)
		return nil
	}
}
