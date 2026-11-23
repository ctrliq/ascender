// Package i18n translates the user interface and the API's messages.
//
// The catalogs are JSON files under locales/<lang>/: ui.json holds the
// user interface's messages (imported from the old UI's Lingui catalogs)
// and api.json the API's (imported from the old Django catalogs). Each is a
// flat object from the English source text, the msgid, to its
// translation. English is the source language and has no catalog; a
// message a catalog lacks is shown in English, as Lingui and gettext do.
//
// UI messages are ICU MessageFormat, the syntax Lingui writes: {name}
// placeholders, {n, plural, one {...} other {...}} and selectordinal, with
// # for the number. Lingui's <0>...</0> markup is filled in by HTML.
package i18n

import (
	"embed"
	"encoding/json"
	"fmt"
	"html/template"
	"io/fs"
	"strings"
	"sync"
)

//go:embed locales
var localesFS embed.FS

// Language is one language the interface is translated into.
type Language struct {
	Code, Name string
}

// Languages are the UI's languages, in the order of the old UI's
// i18nLoader (its language menu's order).
var Languages = []Language{
	{"en", "English"}, {"ar", "Arabic"}, {"zh", "Chinese"}, {"nl", "Dutch"},
	{"fr", "French"}, {"hi", "Hindi"}, {"ja", "Japanese"}, {"ko", "Korean"},
	{"es", "Spanish"},
}

// Default is the language used when nothing asks for another.
const Default = "en"

// Supported reports whether code is one of Languages.
func Supported(code string) bool {
	for _, l := range Languages {
		if l.Code == code {
			return true
		}
	}
	return false
}

// RTL reports whether a language is written right to left.
func RTL(code string) bool { return code == "ar" }

// Domains of the catalogs.
const (
	UI  = "ui"
	API = "api"
)

type catalog struct {
	msgs map[string]any
	// norm maps each msgid with its whitespace collapsed to the msgid, so
	// a template can ask for a message the old UI extracted from indented
	// JSX without reproducing the indentation.
	norm map[string]string
}

var (
	catalogsMu sync.Mutex
	catalogs   = map[string]*catalog{}
)

// load returns a language's catalog of a domain, empty when it has none.
func load(lang, domain string) *catalog {
	key := lang + "/" + domain
	catalogsMu.Lock()
	defer catalogsMu.Unlock()
	if c, ok := catalogs[key]; ok {
		return c
	}
	c := &catalog{msgs: map[string]any{}, norm: map[string]string{}}
	if b, err := fs.ReadFile(localesFS, "locales/"+key+".json"); err == nil {
		if err := json.Unmarshal(b, &c.msgs); err != nil {
			panic(fmt.Sprintf("i18n: locales/%s.json: %v", key, err))
		}
	}
	for id := range c.msgs {
		if n := collapse(id); n != id {
			c.norm[n] = id
		}
	}
	catalogs[key] = c
	return c
}

// lookup is the translation of msgid, or "" when the catalog has none.
func (c *catalog) lookup(msgid string) string {
	if s, ok := c.msgs[msgid].(string); ok {
		return s
	}
	if id, ok := c.norm[collapse(msgid)]; ok {
		if s, ok := c.msgs[id].(string); ok {
			return collapse(s)
		}
	}
	return ""
}

// collapse trims s and turns each run of whitespace into one space, the
// way HTML shows it.
func collapse(s string) string {
	return strings.Join(strings.Fields(s), " ")
}

// Catalog returns the raw messages of a language's catalog, for the
// browser's copy of the UI catalog.
func Catalog(lang, domain string) map[string]any {
	return load(lang, domain).msgs
}

// Locale translates into one language.
type Locale struct {
	Lang string
	// Pseudo marks every translated message (the old UI's
	// ?pseudolocalization=true), to find text that is not translated.
	Pseudo bool
	ui     *catalog
	api    *catalog
}

// New returns the Locale of a language; an unsupported one is English.
func New(lang string) *Locale {
	if !Supported(lang) {
		lang = Default
	}
	return &Locale{Lang: lang, ui: load(lang, UI), api: load(lang, API)}
}

// Dir is the language's text direction, for <html dir>.
func (l *Locale) Dir() string {
	if RTL(l.Lang) {
		return "rtl"
	}
	return "ltr"
}

// T translates a UI message and fills in its placeholders from args,
// given as name, value pairs: T("Delete {name}?", "name", n).
func (l *Locale) T(msgid string, args ...any) string {
	msg := msgid
	if l != nil && l.ui != nil {
		if s := l.ui.lookup(msgid); s != "" {
			msg = s
		}
	}
	lang := Default
	if l != nil {
		lang = l.Lang
	}
	out := format(lang, msg, argMap(args), nil)
	if l != nil && l.Pseudo {
		out = "»" + out + "«"
	}
	return out
}

// HTML translates a UI message that has Lingui markup: each <N>...</N>
// becomes the element whose opening tag is the argument "N" (a
// template.HTML such as `<a href="/users/1/details">`), and <N/> the
// argument itself. Text and string arguments are escaped; template.HTML
// arguments are not.
func (l *Locale) HTML(msgid string, args ...any) template.HTML {
	msg := msgid
	if l != nil && l.ui != nil {
		if s := l.ui.lookup(msgid); s != "" {
			msg = s
		}
	}
	lang := Default
	if l != nil {
		lang = l.Lang
	}
	out := format(lang, msg, argMap(args), &htmlMode{})
	if l != nil && l.Pseudo {
		out = "»" + out + "«"
	}
	return template.HTML(out)
}

// Has reports whether the UI catalog translates msgid.
func (l *Locale) Has(msgid string) bool {
	return l != nil && l.ui != nil && l.ui.lookup(msgid) != ""
}

func argMap(args []any) map[string]any {
	if len(args) == 0 {
		return nil
	}
	if len(args) == 1 {
		if m, ok := args[0].(map[string]any); ok {
			return m
		}
	}
	m := make(map[string]any, len(args)/2)
	for i := 0; i+1 < len(args); i += 2 {
		m[fmt.Sprint(args[i])] = args[i+1]
	}
	return m
}
