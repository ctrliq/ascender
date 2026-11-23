package i18n

import (
	"encoding/json"
	"os"
	"testing"
)

// TestRequestLanguage checks the language negotiation against the old
// API's Django, captured by testdata/gen_api_language.py.
func TestRequestLanguage(t *testing.T) {
	b, err := os.ReadFile("testdata/api_language.json")
	if err != nil {
		t.Fatal(err)
	}
	var cases []struct {
		Cookie *string
		Accept *string
		Lang   string
	}
	if err := json.Unmarshal(b, &cases); err != nil {
		t.Fatal(err)
	}
	for _, c := range cases {
		cookie, accept := "", ""
		if c.Cookie != nil {
			cookie = *c.Cookie
		}
		if c.Accept != nil {
			accept = *c.Accept
		}
		if got := RequestLanguage(cookie, c.Cookie != nil, accept); got != c.Lang {
			t.Errorf("cookie %.40q accept %.40q: %s, want %s", cookie, accept, got, c.Lang)
		}
	}
}

func TestGettext(t *testing.T) {
	ja, en := ForAPI("ja"), ForAPI("en-us")
	if got := ja.Gettext("Invalid page."); got != "不正なページです。" {
		t.Errorf("ja Invalid page. = %q", got)
	}
	if got := en.Gettext("Invalid page."); got != "Invalid page." {
		t.Errorf("en Invalid page. = %q", got)
	}
	if !en.English() || ja.English() {
		t.Error("English()")
	}
	if got := ja.Gettext("Not in any catalog"); got != "Not in any catalog" {
		t.Errorf("missing = %q", got)
	}
	if got := ja.Pgettext("Task", "Running"); got != "実行中" {
		t.Errorf("pgettext = %q", got)
	}
}

func TestNgettext(t *testing.T) {
	cases := []struct {
		lang string
		n    int64
		want string
	}{
		{"en-us", 1, "%(num)d day"}, {"en-us", 2, "%(num)d days"}, {"en-us", 0, "%(num)d days"},
		{"ja", 5, "%(num)d日"},
		{"fr", 0, "%(num)d jour"}, {"fr", 1, "%(num)d jour"}, {"fr", 2, "%(num)d jours"},
		{"ar", 0, "%(num)d يوم"}, {"ar", 2, "%(num)d يومين"}, {"ar", 5, "%(num)d أيام"}, {"ar", 11, "%(num)d يوم"}, {"ar", 100, "%(num)d أيام"},
	}
	for _, c := range cases {
		if got := ForAPI(c.lang).Ngettext("%(num)d day", "%(num)d days", c.n); got != c.want {
			t.Errorf("%s n=%d: %q, want %q", c.lang, c.n, got, c.want)
		}
	}
	if got := Sprintf(ForAPI("fr").Ngettext("%(num)d day", "%(num)d days", 3), map[string]any{"num": 3}); got != "3 jours" {
		t.Errorf("fr filled = %q", got)
	}
}

func TestPythonFormat(t *testing.T) {
	cases := []struct{ got, want string }{
		{Sprintf("%s has %d of %s", "a", 2, "b"), "a has 2 of b"},
		{Sprintf("%(a)s and %(b)r 100%%", map[string]any{"a": "x", "b": "y'"}), `x and "y'" 100%`},
		{Sprintf("%(a)s", map[string]any{}), "%(a)s"},
		{Format("{} and {name} {{literal}} {0}", "p", map[string]any{"name": "n"}), "p and {name} {literal} p"},
		{Format("{name} {other}", map[string]any{"name": "n", "other": 3}), "n 3"},
		{Format("{survey_item[type]} at {idx}", map[string]any{"survey_item[type]": "text", "idx": 1}), "text at 1"},
		{ForAPI("ja").Format("Ensure this field has no more than {max_length} characters.", map[string]any{"max_length": 512}), "この項目が512文字より長くならないようにしてください。"},
		{ForAPI("en").Format("Ensure this field has no more than {max_length} characters.", map[string]any{"max_length": 512}), "Ensure this field has no more than 512 characters."},
	}
	for _, c := range cases {
		if c.got != c.want {
			t.Errorf("got %q, want %q", c.got, c.want)
		}
	}
}

func TestTemplate(t *testing.T) {
	ja := ForAPI("ja")
	tm := NewTemplate(`"{input}" is not a valid choice.`)
	if got, ok := tm.Translate(ja, `"foo" is not a valid choice.`); !ok || got != `"foo"は有効な選択肢ではありません。` {
		t.Errorf("brace = %q %v", got, ok)
	}
	if _, ok := tm.Translate(ja, `foo is not a valid choice.`); ok {
		t.Error("matched other text")
	}
	if got, ok := tm.Translate(ForAPI("en-us"), `"foo" is not a valid choice.`); !ok || got != `"foo" is not a valid choice.` {
		t.Errorf("english = %q", got)
	}
	pl := NewPluralTemplate("Ensure that there are no more than %(max)s digit in total.", "Ensure that there are no more than %(max)s digits in total.", "max")
	if pl.Style != Percent {
		t.Fatal("style")
	}
	if got, ok := pl.Translate(ja, "Ensure that there are no more than 4 digits in total."); !ok || got != "この値は合計 4 桁以内でなければなりません。" {
		t.Errorf("plural = %q %v", got, ok)
	}
	tr := NewTemplate("%s not found")
	tr.TrArgs = []string{"#0"}
	if got, ok := tr.Translate(ja, "Not found. not found"); !ok || got == "Not found. not found" {
		t.Errorf("translated arg = %q %v", got, ok)
	}
}
