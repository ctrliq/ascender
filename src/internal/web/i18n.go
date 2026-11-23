package web

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"html/template"
	"io"
	"net/http"
	"strings"
	"sync"

	"github.com/ctrliq/ascender/internal/api"
	"github.com/ctrliq/ascender/internal/i18n"
)

// languageCookie is Django's LANGUAGE_COOKIE_NAME. The old UI wrote it on
// every language change so the API answered in the UI's language; the Go
// UI does the same, and reads it back on pages shown before sign-in (the
// old UI's localStorage preferred_language).
const languageCookie = "django_language"

// locale picks the language of a page the way the old UI did. Signed in,
// it is the user's preferred_language, else the browser's language (its
// first Accept-Language), else English. Signed out, ?lang= and then the
// language last used come before the browser's. ?pseudolocalization=true
// marks every translated message.
func (u *UI) locale(r *http.Request, uc *userContext) *i18n.Locale {
	q := r.URL.Query()
	lang := ""
	if uc != nil {
		lang = supported(str(uc.Me["preferred_language"]))
	} else {
		lang = supported(q.Get("lang"))
		if lang == "" {
			if c, err := r.Cookie(languageCookie); err == nil {
				lang = supported(c.Value)
			}
		}
	}
	if lang == "" {
		lang = supported(browserLanguage(r.Header.Get("Accept-Language")))
	}
	loc := i18n.New(lang)
	loc.Pseudo = q.Get("pseudolocalization") == "true"
	return loc
}

func supported(code string) string {
	if i18n.Supported(code) {
		return code
	}
	return ""
}

// browserLanguage is navigator.language without its region, as the old
// UI's getLanguageWithoutRegionCode took it: the first Accept-Language
// entry.
func browserLanguage(header string) string {
	first, _, _ := strings.Cut(header, ",")
	first, _, _ = strings.Cut(first, ";")
	first = strings.ToLower(strings.TrimSpace(first))
	primary, _, _ := strings.Cut(strings.ReplaceAll(first, "_", "-"), "-")
	return primary
}

// rememberLanguage writes the language cookie when it changed, the old
// UI's dynamicActivate.
func rememberLanguage(w http.ResponseWriter, r *http.Request, lang string) {
	if c, err := r.Cookie(languageCookie); err == nil && c.Value == lang {
		return
	}
	http.SetCookie(w, &http.Cookie{Name: languageCookie, Value: lang, Path: "/", MaxAge: 60 * 60 * 24 * 365, SameSite: http.SameSiteLaxMode})
}

// localizedPages caches each page's template per language. A page's
// template is cloned from the parsed set, which is never executed itself
// (html/template cannot clone a template once it has run), with t and
// tHTML bound to the language.
type localizedPages struct {
	mu    sync.Mutex
	src   *map[string]*template.Template
	pages map[string]*template.Template // "<lang>[+pseudo]/<page>"
}

func (u *UI) localizedPage(name string, loc *i18n.Locale) (*template.Template, error) {
	if _, err := u.templates(); err != nil {
		return nil, err
	}
	src := u.pages.Load()
	key := loc.Lang
	if loc.Pseudo {
		key += "+pseudo"
	}
	key += "/" + name
	c := &u.localized
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.src != src {
		c.src, c.pages = src, map[string]*template.Template{}
	}
	if t, ok := c.pages[key]; ok {
		return t, nil
	}
	base, ok := (*src)[name]
	if !ok {
		return nil, nil
	}
	t, err := base.Clone()
	if err != nil {
		return nil, err
	}
	t.Funcs(localeFuncs(loc))
	c.pages[key] = t
	return t, nil
}

// localeFuncs are the template functions that translate:
//
//	{{t "Delete {name}?" "name" .name}}  a message as text
//	{{tHTML "{dateStr} by <0>{username}</0>" ... "0" (safeHTML "<a ...>")}}
//	                                     a message with Lingui markup
//	{{lang}}                             the language's code
//	{{tChoice "Manual"}}                 an API choice name, translated as
//	                                     the API's OPTIONS translates it
//
// tChoice is for select options the old UI read from an OPTIONS document
// and the Go templates carry as English copies.
func localeFuncs(loc *i18n.Locale) template.FuncMap {
	return template.FuncMap{
		"t":       loc.T,
		"tHTML":   loc.HTML,
		"lang":    func() string { return loc.Lang },
		"tChoice": func(en string) string { return api.OptionsText(loc.Lang, "choice", en) },
	}
}

// catalogScripts holds each language's UI catalog as a script, built once.
var catalogScripts sync.Map // lang -> *catalogScript

type catalogScript struct {
	body    []byte
	version string
	// served carries the ETag and the gzip copy.
	served *variants
}

func catalogFor(lang string) *catalogScript {
	if v, ok := catalogScripts.Load(lang); ok {
		return v.(*catalogScript)
	}
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(i18n.Catalog(lang, i18n.UI))
	body := append([]byte("window.ASCENDER_I18N = "), bytes.TrimRight(buf.Bytes(), "\n")...)
	body = append(body, ";\n"...)
	sum := sha256.Sum256(body)
	cs := &catalogScript{body: body, version: hex.EncodeToString(sum[:6]), served: newVariants(lang+".js", body)}
	v, _ := catalogScripts.LoadOrStore(lang, cs)
	return v.(*catalogScript)
}

// CatalogURL is where the page loads its language's catalog for app.js's
// t(), versioned so browsers keep it; "" for English, which needs none.
func (p *page) CatalogURL() string {
	if p.Loc == nil || p.Loc.Lang == i18n.Default {
		return ""
	}
	return "/i18n/" + p.Loc.Lang + ".js?v=" + catalogFor(p.Loc.Lang).version
}

// serveCatalog answers /i18n/<lang>.js.
func (u *UI) serveCatalog(w http.ResponseWriter, r *http.Request) {
	lang := strings.TrimSuffix(r.PathValue("file"), ".js")
	if !i18n.Supported(lang) || lang == i18n.Default || !strings.HasSuffix(r.PathValue("file"), ".js") {
		http.NotFound(w, r)
		return
	}
	cs := catalogFor(lang)
	if r.URL.Query().Get("v") == cs.version {
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	} else {
		w.Header().Set("Cache-Control", "public, max-age=3600")
	}
	cs.served.serve(w, r, lang+".js",
		func() (io.ReadSeeker, error) { return bytes.NewReader(cs.body), nil },
		func() ([]byte, error) { return cs.body, nil })
}
