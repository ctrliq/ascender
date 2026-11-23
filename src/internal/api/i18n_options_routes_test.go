package api

import (
	"io/fs"
	"path"
	"strings"
	"testing"

	"github.com/ctrliq/ascender/internal/i18n"
)

// optionsLeftEnglish are the texts of the route documents that the old
// API's catalog translates but its OPTIONS documents left English in every
// language: model field verbose names and choices that were never marked
// for translation, whose words happen to be msgids elsewhere (kind, then
// English text).
var optionsLeftEnglish = map[[2]string]bool{
	{"label", "Changed"}:   true,
	{"label", "Client ID"}: true,
	{"label", "Cloud"}:     true,
	{"label", "Created"}:   true,
	{"label", "Enabled"}:   true,
	{"label", "Error"}:     true,
	{"label", "Failed"}:    true,
	{"label", "Instances"}: true,
	{"label", "Jobs"}:      true,
	{"label", "Labels"}:    true,
	{"label", "Messages"}:  true,
	{"label", "Password"}:  true,
	{"label", "Peers"}:     true,
	{"label", "Token"}:     true,
	{"label", "User"}:      true,
	{"label", "Username"}:  true,
	{"help_text", "The container image to be used for execution."}: true,
	{"choice", "group"}: true,
	{"choice", "user"}:  true,
}

// Every route document (metadata/routes/) comes out of translateOptionsDoc
// with every name, label, help text, category, unit and choice name that
// the old API's catalog (or one of its field help text templates)
// translates translated, in every language of locale/options/, but for the
// texts the old API left English: those in optionsLeftEnglish, and the
// places locale/options/<lang>.json records as left English for a route.
// The description lines are checked against the old views by
// testdata/gen_options_i18n_offline.py --check --all.
func TestOptionsRouteDocumentsTranslated(t *testing.T) {
	files, err := fs.Glob(metadataFS, "metadata/routes/*.json")
	if err != nil || len(files) == 0 {
		t.Fatalf("no route documents: %v", err)
	}
	langs, err := fs.Glob(optionsLocaleFS, "locale/options/*.json")
	if err != nil || len(langs) == 0 {
		t.Fatalf("no OPTIONS catalogs: %v", err)
	}
	used := map[[2]string]bool{}
	for _, lf := range langs {
		lang := strings.TrimSuffix(path.Base(lf), ".json")
		l := i18n.ForAPI(lang)
		if l.English() {
			t.Fatalf("%s: no API catalog", lang)
		}
		c := optionsCatalogFor(lang)
		for _, f := range files {
			route := routeFromDocName(strings.TrimSuffix(path.Base(f), ".json"))
			b, err := metadataFS.ReadFile(f)
			if err != nil {
				t.Fatal(err)
			}
			en, err := DecodeOrdered(string(b))
			if err != nil {
				t.Fatalf("%s: %v", f, err)
			}
			tr, _ := DecodeOrdered(string(b))
			translateOptionsDoc(l, route, tr.(*OMap))
			compareOptionsTexts(en.(*OMap), tr.(*OMap), func(kind, p, e, got string) {
				if got != e || !optionsTranslatable(l, e) {
					return
				}
				if optionsLeftEnglish[[2]string{kind, e}] {
					used[[2]string{kind, e}] = true
					return
				}
				if o, ok := c.paths[route][p]; ok && o == e {
					return
				}
				t.Errorf("%s %s %s: %q is not translated", lang, route, p, e)
			})
		}
	}
	for k := range optionsLeftEnglish {
		if !used[k] {
			t.Errorf("optionsLeftEnglish %v: no route document leaves it English; drop it", k)
		}
	}
}

// fieldHelpTemplates are the help texts the old Metadata gave common
// fields, formatted with the model's verbose name.
var fieldHelpTemplates = []*i18n.Template{
	i18n.NewTemplate("Database ID for this {}."),
	i18n.NewTemplate("Name of this {}."),
	i18n.NewTemplate("Optional description of this {}."),
	i18n.NewTemplate("Data type for this {}."),
	i18n.NewTemplate("URL for this {}."),
	i18n.NewTemplate("Timestamp when this {} was created."),
	i18n.NewTemplate("Timestamp when this {} was last modified."),
}

// optionsTranslatable reports whether the old API's catalog translates an
// OPTIONS text, as a msgid or as a field help text template's.
func optionsTranslatable(l *i18n.Locale, e string) bool {
	if l.Gettext(e) != e {
		return true
	}
	for _, t := range fieldHelpTemplates {
		if _, ok := t.Match(e); ok && l.Gettext(t.ID) != t.ID {
			return true
		}
	}
	return false
}

// routeFromDocName is the route (as optionsRoute names it) of a route
// document: "hosts__id__job_events" is "/api/v2/hosts/{id}/job_events/".
func routeFromDocName(name string) string {
	switch name {
	case "v2root":
		return "/api/v2/"
	case "api":
		return "/api/"
	}
	segs := strings.Split(name, "__")
	for i, s := range segs {
		if s == "id" {
			segs[i] = "{id}"
		}
	}
	return "/api/v2/" + strings.Join(segs, "/") + "/"
}

// compareOptionsTexts calls fn with every translatable text of an English
// document and what the translated document has in its place.
func compareOptionsTexts(en, tr *OMap, fn func(kind, path, en, got string)) {
	if e, ok := en.vals["name"].(string); ok {
		g, _ := tr.vals["name"].(string)
		fn("name", "name", e, g)
	}
	ea, _ := en.vals["actions"].(*OMap)
	ta, _ := tr.vals["actions"].(*OMap)
	if ea == nil || ta == nil {
		return
	}
	for _, m := range ea.keys {
		ef, _ := ea.vals[m].(*OMap)
		tf, _ := ta.vals[m].(*OMap)
		if ef == nil || tf == nil {
			continue
		}
		for _, f := range ef.keys {
			e, _ := ef.vals[f].(*OMap)
			t, _ := tf.vals[f].(*OMap)
			compareOptionsField(m+"."+f, e, t, fn)
		}
	}
}

func compareOptionsField(prefix string, e, t *OMap, fn func(kind, path, en, got string)) {
	if e == nil || t == nil {
		return
	}
	for _, a := range optionsAttrs {
		if s, ok := e.vals[a].(string); ok {
			g, _ := t.vals[a].(string)
			fn(a, prefix+"."+a, s, g)
		}
	}
	ec, _ := e.vals["choices"].([]any)
	tc, _ := t.vals["choices"].([]any)
	for i := range ec {
		ep, _ := ec[i].([]any)
		if len(ep) != 2 || i >= len(tc) {
			continue
		}
		tp, _ := tc[i].([]any)
		es, ok := ep[1].(string)
		if !ok || len(tp) != 2 {
			continue
		}
		ts, _ := tp[1].(string)
		fn("choice", prefix+".choice."+pyValueString(ep[0]), es, ts)
	}
	ech, _ := e.vals["child"].(*OMap)
	tch, _ := t.vals["child"].(*OMap)
	compareOptionsField(prefix+".child", ech, tch, fn)
	if eck, ok := e.vals["children"].(*OMap); ok {
		tck, _ := t.vals["children"].(*OMap)
		if tck == nil {
			return
		}
		for _, k := range eck.keys {
			ec, _ := eck.vals[k].(*OMap)
			tc, _ := tck.vals[k].(*OMap)
			compareOptionsField(prefix+".children."+k, ec, tc, fn)
		}
	}
}
