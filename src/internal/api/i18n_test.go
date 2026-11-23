package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/ctrliq/ascender/internal/i18n"
)

func TestTranslateMessage(t *testing.T) {
	ja := i18n.ForAPI("ja")
	cases := []struct{ in, want string }{
		// Whole messages.
		{"Not found.", "見つかりません"},
		{"Invalid page.", "不正なページです。"},
		// Formatted after translation (DRF's self.fail, str.format).
		{"Ensure this field has no more than 512 characters.", "この項目が512文字より長くならないようにしてください。"},
		{`"bogus" is not a valid choice.`, `"bogus"は有効な選択肢ではありません。`},
		// A 401's detail with finalize_response's sentence after it.
		{"Authentication credentials were not provided. To establish a login session, visit /api/login/.", "認証情報が含まれていません。ログインセッションを確立するには、以下にアクセスしてください。 /api/login/."},
		// Formatted before translation in the old code: English.
		{"Password must be at least 8 characters long.", "Password must be at least 8 characters long."},
		{"No Organization matches the given query.", "No Organization matches the given query."},
		// Not a message at all.
		{"zz-some-host", "zz-some-host"},
	}
	for _, c := range cases {
		if got := TranslateMessage(ja, c.in); got != c.want {
			t.Errorf("TranslateMessage(%q) = %q, want %q", c.in, got, c.want)
		}
	}
	if got := TranslateMessage(i18n.ForAPI("en-us"), "Not found."); got != "Not found." {
		t.Errorf("english = %q", got)
	}
	// The role's name in the message was translated too.
	if got := TranslateMessage(ja, "The Admin role cannot be assigned to a team"); got == "The Admin role cannot be assigned to a team" || !strings.Contains(got, ja.Gettext("Admin")) {
		t.Errorf("role message = %q", got)
	}
}

func TestTranslateBodyCopies(t *testing.T) {
	ja := i18n.ForAPI("ja")
	got := translateBody(ja, ErrNotFound.Body).(map[string]any)
	if got["detail"] != "見つかりません" {
		t.Errorf("detail = %v", got["detail"])
	}
	if ErrNotFound.Body.(map[string]any)["detail"] != "Not found." {
		t.Error("shared body was modified")
	}
	fe := FieldErrors{"name": {"This field is required."}}
	out := translateBody(ja, fe).(map[string][]string)
	if out["name"][0] == "This field is required." || fe["name"][0] != "This field is required." {
		t.Errorf("field errors = %v (source %v)", out, fe)
	}
	body := map[string]any{"error": "Resource is being used by running jobs.", "active_jobs": []any{map[string]any{"type": "Not found."}}}
	tb := translateBody(ja, body).(map[string]any)
	if tb["active_jobs"].([]any)[0].(map[string]any)["type"] != "Not found." {
		t.Error("data under active_jobs was translated")
	}
}

func TestContentLanguage(t *testing.T) {
	h := LanguageHandler(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		WriteError(w, ErrNotFound)
	}))
	cases := []struct {
		accept, cookie, ctxLang string
		lang, body              string
	}{
		{"", "", "", "en-us", `{"detail":"Not found."}`},
		{"de,ja;q=0.5", "", "", "ja", `{"detail":"見つかりません"}`},
		{"ja", "ko", "", "ko", ""},
		{"ja", "", "en", "en", `{"detail":"Not found."}`},
		{"", "", "zh", "zh", ""},
	}
	for _, c := range cases {
		req := httptest.NewRequest("GET", "/api/v2/x/", nil)
		if c.accept != "" {
			req.Header.Set("Accept-Language", c.accept)
		}
		if c.cookie != "" {
			req.AddCookie(&http.Cookie{Name: "django_language", Value: c.cookie})
		}
		if c.ctxLang != "" {
			req = req.WithContext(WithLanguage(context.Background(), c.ctxLang))
		}
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		if got := rec.Header().Get("Content-Language"); got != c.lang {
			t.Errorf("%+v: Content-Language %q", c, got)
		}
		if c.body != "" && rec.Body.String() != c.body {
			t.Errorf("%+v: body %s", c, rec.Body.String())
		}
	}
}

func TestTranslateOptionsDoc(t *testing.T) {
	doc, err := DecodeOrdered(`{"name":"Organization List","description":"* ` + "`name`" + `: Name of this organization. (string, required)","actions":{"POST":{"name":{"type":"string","label":"Name","help_text":"Name of this organization."}}}}`)
	if err != nil {
		t.Fatal(err)
	}
	m := doc.(*OMap)
	translateOptionsDoc(i18n.ForAPI("ja"), "/api/v2/organizations/", m)
	actions, _ := m.Get("actions")
	post, _ := actions.(*OMap).Get("POST")
	name, _ := post.(*OMap).Get("name")
	help, _ := name.(*OMap).Get("help_text")
	if help != "このorganizationの名前。" {
		t.Errorf("help_text = %v", help)
	}
	if label, _ := name.(*OMap).Get("label"); label != "Name" {
		t.Errorf("label = %v (the old API left it English)", label)
	}
	if d, _ := m.Get("description"); d != "* `name`: このorganizationの名前。 (string, required)" {
		t.Errorf("description = %q", d)
	}
}

// TestFormattedTemplatesCompile checks the formatted messages load.
func TestFormattedTemplatesCompile(t *testing.T) {
	rs := loadMessageRules()
	if len(rs.formatted) < 100 {
		t.Fatalf("only %d formatted messages", len(rs.formatted))
	}
	for _, f := range rs.formatted {
		f.t.Match("")
	}
}

func TestTranslateDescription(t *testing.T) {
	c := &optionsCatalog{
		kinds: map[string]map[string]string{"line": {"# List Applications:": "# List アプリケーションS:"}},
		paths: map[string]map[string]string{"/x/": {"line:# List Applications:": "# List Applications:"}},
	}
	desc := "# List Applications:\n* `job_explanation`: It wasn&#x27;t run (string)\n    - `run`: Run\n    - `zz`: Other"
	helps := [][3]string{{"job_explanation", "It wasn't run", "実行されず"}}
	got := translateDescription(c, "/y/", desc, helps, map[string]string{"Run": "実行"})
	want := "# List アプリケーションS:\n* `job_explanation`: 実行されず (string)\n    - `run`: 実行\n    - `zz`: Other"
	if got != want {
		t.Errorf("description = %q", got)
	}
	// A route whose line stayed English.
	if got := translateDescription(c, "/x/", "# List Applications:", nil, nil); got != "# List Applications:" {
		t.Errorf("override = %q", got)
	}
}
