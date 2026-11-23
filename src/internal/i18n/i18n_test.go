package i18n

import (
	"encoding/json"
	"html/template"
	"os"
	"testing"
)

// TestIntl compares the plural rules and number formats with the
// browser's, captured by testdata/gen_intl.js.
func TestIntl(t *testing.T) {
	b, err := os.ReadFile("testdata/intl.json")
	if err != nil {
		t.Fatal(err)
	}
	var golden map[string][][4]any
	if err := json.Unmarshal(b, &golden); err != nil {
		t.Fatal(err)
	}
	for lang, rows := range golden {
		for _, r := range rows {
			n := r[0].(float64)
			if got := pluralCategory(lang, n, false); got != r[1] {
				t.Errorf("%s cardinal %v = %s, want %s", lang, n, got, r[1])
			}
			if got := pluralCategory(lang, n, true); got != r[2] {
				t.Errorf("%s ordinal %v = %s, want %s", lang, n, got, r[2])
			}
			if got := formatNumber(lang, n); got != r[3] {
				t.Errorf("%s number %v = %q, want %q", lang, n, got, r[3])
			}
		}
	}
}

// TestCatalogsParse checks every message and translation is a message
// the formatter understands, and that translations keep the source's
// placeholders.
func TestCatalogsParse(t *testing.T) {
	for _, l := range Languages {
		for _, domain := range []string{UI, API} {
			for id, v := range Catalog(l.Code, domain) {
				s, ok := v.(string)
				if !ok || domain != UI {
					continue
				}
				if _, err := parseMessage(id); err != nil {
					t.Errorf("%s msgid %q: %v", l.Code, id, err)
				}
				if _, err := parseMessage(s); err != nil {
					t.Errorf("%s translation of %q: %v", l.Code, id, err)
				}
			}
		}
	}
}

func TestT(t *testing.T) {
	ja, fr, ar, en := New("ja"), New("fr"), New("ar"), New("en")
	cases := []struct {
		loc  *Locale
		id   string
		args []any
		want string
	}{
		{en, "Copy to clipboard", nil, "Copy to clipboard"},
		{ja, "Copy to clipboard", nil, "クリップボードにコピーする"},
		{ja, "Not in any catalog", nil, "Not in any catalog"},
		{fr, "Failed to delete {name}.", []any{"name", "x"}, "N'a pas réussi à supprimer x."},
		{ja, "No {pluralizedItemName} Found", []any{"pluralizedItemName", "組織"}, "組織 は見つかりません"},
		{en, "{forks, plural, one {# fork} other {# forks}}", []any{"forks", 1}, "1 fork"},
		{en, "{forks, plural, one {# fork} other {# forks}}", []any{"forks", 1234}, "1,234 forks"},
		{fr, "{interval, plural, one {# year} other {# years}}", []any{"interval", 0}, "0 année"},
		{ar, "{forks, plural, one {# fork} other {# forks}}", []any{"forks", 2}, "2 تفريعات"},
		{en, "{n, plural, =0 {none} one {one} other {#}}", []any{"n", 0}, "none"},
		{en, "{0, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}", []any{"0", 22}, "22nd"},
		{en, "{0, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}", []any{"0", "13"}, "13th"},
		{en, "It''s '{literal}' {x}", []any{"x", 1}, "It's {literal} 1"},
		{en, "{dateStr} by <0>{username}</0>", []any{"dateStr", "today", "username", "bob"}, "today by bob"},
	}
	for _, c := range cases {
		if got := c.loc.T(c.id, c.args...); got != c.want {
			t.Errorf("%s T(%q) = %q, want %q", c.loc.Lang, c.id, got, c.want)
		}
	}
}

func TestHTML(t *testing.T) {
	got := New("ja").HTML("{dateStr} by <0>{username}</0>", "dateStr", "<today>", "username", "a&b", "0", template.HTML(`<a href="/users/1/details">`))
	want := template.HTML(`&lt;today&gt; (<a href="/users/1/details">a&amp;b</a> による)`)
	if got != want {
		t.Errorf("HTML = %q, want %q", got, want)
	}
	// A value's own markup is text, never a tag.
	got = New("en").HTML("{x} <0>y</0>", "x", "<0>", "0", template.HTML("<b>"))
	if want := template.HTML("&lt;0&gt; <b>y</b>"); got != want {
		t.Errorf("HTML = %q, want %q", got, want)
	}
}

func TestWhitespace(t *testing.T) {
	ja := New("ja")
	id := "Note that only hosts directly in this group can be disassociated. Hosts in sub-groups must be disassociated directly from the sub-group level that they belong."
	if got := ja.T(id); got == id || got[0] == ' ' || got[0] == '\n' {
		t.Errorf("collapsed msgid not found: %q", got)
	}
}

func TestPseudo(t *testing.T) {
	l := New("en")
	l.Pseudo = true
	if got := l.T("Save"); got != "»Save«" {
		t.Errorf("pseudo = %q", got)
	}
}

func TestUnsupported(t *testing.T) {
	if l := New("xx"); l.Lang != "en" || l.Dir() != "ltr" {
		t.Errorf("New(xx) = %s %s", l.Lang, l.Dir())
	}
	if New("ar").Dir() != "rtl" {
		t.Error("ar is not rtl")
	}
}
