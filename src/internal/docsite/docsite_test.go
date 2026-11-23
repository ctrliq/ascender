package docsite

import (
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
)

func page(fm, body string) *fstest.MapFile {
	return &fstest.MapFile{Data: []byte("---\n" + fm + "\n---\n" + body)}
}

func testSite() fstest.MapFS {
	return fstest.MapFS{
		"index.md":   page("title: Home", "Start with the [guide](guide) and the [section](/guide/sub#second-part).\n"),
		"README.md":  {Data: []byte("not a page")},
		"_IMPORT.md": {Data: []byte("not a page either")},
		"guide/index.md": page("title: Guide\ndescription: The guide.\nweight: 2", `## First

<Hint type="warning" title="Careful">

Some **bold** text, and <name> as a placeholder.

</Hint>

![Shot](/assets/images/shot.webp)

`+"```yaml\n<Hint type=\"note\">\nkept: <as written>\n```\n"+`
## First

Read [the sub page](sub) and [a heading here](#first-1).
`),
		"guide/sub/index.md":        page("title: Sub", "## Second part\n\nBack to [home](/) and [nowhere](/missing) and [no anchor](/guide#none).\n\n<Hint type=\"odd\">\n\nx\n\n</Hint>\n"),
		"hidden/index.md":           page("title: Hidden\nshowInNav: false\nweight: 1", "Hidden.\n"),
		"assets/images/shot.webp":   {Data: []byte("webp")},
		"assets/images/unused.webp": {Data: []byte("webp")},
		"guide/stray.md":            {Data: []byte("# stray")},
	}
}

func TestLoad(t *testing.T) {
	s, err := Load(testSite(), Options{Base: "/docs/", Static: "/static/", App: "/"})
	if err != nil {
		t.Fatal(err)
	}
	want := []string{
		`assets/images/unused.webp: no page uses it`,
		`guide/stray.md: a page is the index.md of a directory of its own`,
		`guide/sub/index.md: "/guide#none": no heading #none on /guide`,
		`guide/sub/index.md: "/missing": no page /missing`,
		`guide/sub/index.md:8: Hint type "odd" is not one of note, info, tip, warning, danger`,
	}
	if strings.Join(s.Problems, "\n") != strings.Join(want, "\n") {
		t.Errorf("problems:\n%s\nwant:\n%s", strings.Join(s.Problems, "\n"), strings.Join(want, "\n"))
	}

	guide := s.pages["guide"]
	body := string(guide.Body)
	for _, w := range []string{
		`<h2 id="first">First</h2>`,
		`<h2 id="first-1">First</h2>`,
		`class="pf-v6-c-alert pf-m-inline pf-m-warning docs-hint"`,
		`<p class="pf-v6-c-alert__title">Careful</p>`,
		`<strong>bold</strong>`,
		`&lt;name&gt; as a placeholder`,
		`<img src="/docs/assets/images/shot.webp" alt="Shot" loading="lazy">`,
		`&lt;Hint type=&quot;note&quot;&gt;` + "\nkept: &lt;as written&gt;",
		`<a href="/docs/guide/sub/">the sub page</a>`,
		`<a href="#first-1">a heading here</a>`,
	} {
		if !strings.Contains(body, w) {
			t.Errorf("guide body lacks %s:\n%s", w, body)
		}
	}
	if len(guide.TOC) != 2 || guide.TOC[1].ID != "first-1" {
		t.Errorf("toc = %+v", guide.TOC)
	}
	if home := string(s.pages[""].Body); !strings.Contains(home, `<a href="/docs/guide/sub/#second-part">section</a>`) {
		t.Errorf("home body: %s", home)
	}

	// The hidden page is out of the navigation and the page order; the
	// others go by weight.
	var order []string
	for _, p := range s.order {
		order = append(order, p.Path)
	}
	if got := strings.Join(order, ","); got != ",guide,guide/sub" {
		t.Errorf("order = %q", got)
	}
	html := string(s.html["guide/sub"])
	for _, w := range []string{
		`<title>Sub | Ascender Documentation</title>`,
		`href="/static/css/docsite.css"`,
		`<a class="pf-v6-c-breadcrumb__link" href="/docs/guide/">Guide</a>`,
		`<a class="pf-v6-c-nav__link pf-m-current" href="/docs/guide/sub/" aria-current="page">Sub</a>`,
		`<a class="pf-v6-c-button pf-m-link" href="/">`,
	} {
		if !strings.Contains(html, w) {
			t.Errorf("sub page lacks %s", w)
		}
	}
	if strings.Contains(html, "Hidden") {
		t.Error("hidden page is in the navigation")
	}
}

func TestCheck(t *testing.T) {
	s, err := Load(testSite(), Options{Base: "/docs/", Static: "/static/"})
	if err != nil {
		t.Fatal(err)
	}
	for link, want := range map[string]string{
		"/docs/":                       "",
		"/docs/guide/sub/#second-part": "",
		"/docs/guide/#first-1":         "",
		"/docs/guide/#none":            "no heading #none on /docs/guide/",
		"/docs/guide":                  "a page's address ends with /",
		"/docs/missing/":               "no page /docs/missing/",
		"/elsewhere/":                  "not under /docs/",
	} {
		got := ""
		if err := s.Check(link); err != nil {
			got = err.Error()
		}
		if got != want {
			t.Errorf("Check(%q) = %q, want %q", link, got, want)
		}
	}
}

func TestSlug(t *testing.T) {
	for in, want := range map[string]string{
		"Azure AD settings":             "azure-ad-settings",
		"TACACS+ settings":              "tacacs-settings",
		"The `awx-manage` Utility":      "the-awx-manage-utility",
		"CyberArk Central (CCP) Lookup": "cyberark-central-ccp-lookup",
		"A & B":                         "a--b",
		"Ünïcode_ok":                    "ünïcode_ok",
	} {
		if got := slug(in); got != want {
			t.Errorf("slug(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestServeHTTP(t *testing.T) {
	s, err := Load(testSite(), Options{Base: "/docs/", Static: "/static/"})
	if err != nil {
		t.Fatal(err)
	}
	for _, c := range []struct {
		method, path string
		code         int
		location     string
	}{
		{"GET", "/docs/", 200, ""},
		{"GET", "/docs", 301, "/docs/"},
		{"GET", "/docs/guide/sub/", 200, ""},
		{"HEAD", "/docs/guide/", 200, ""},
		{"GET", "/docs/guide", 301, "/docs/guide/"},
		{"GET", "/docs/missing/", 404, ""},
		{"GET", "/docs/assets/images/shot.webp", 200, ""},
		{"GET", "/docs/assets/images/", 404, ""},
		{"GET", "/docs/assets/../index.md", 404, ""},
		{"GET", "/docs/guide/index.md", 404, ""},
		{"GET", "/docs/_IMPORT.md", 404, ""},
		{"POST", "/docs/", 405, ""},
	} {
		w := httptest.NewRecorder()
		r := httptest.NewRequest(c.method, "/", nil)
		r.URL.Path = c.path
		s.ServeHTTP(w, r)
		if w.Code != c.code || w.Header().Get("Location") != c.location {
			t.Errorf("%s %s = %d %q, want %d %q", c.method, c.path, w.Code, w.Header().Get("Location"), c.code, c.location)
		}
		if c.code == 200 && c.method == "GET" && strings.HasSuffix(c.path, "/") && !strings.HasPrefix(w.Header().Get("Content-Type"), "text/html") {
			t.Errorf("%s: content type %q", c.path, w.Header().Get("Content-Type"))
		}
	}
}

func TestFormatTables(t *testing.T) {
	in := "Text | with a pipe.\n\n" +
		"|Name|  Value |\n|:---|---:|\n|a|`x\\|y`|\n|  b  | c |\n|  |d|\n\nAfter.\n\n" +
		"  | indented | table |\n  |-|-|\n  | 1 | 2 |\n\n" +
		"```\n|not|a|\n|-|-|\n```\n"
	want := "Text | with a pipe.\n\n" +
		"| Name | Value |\n| :--- | ---: |\n| a | `x\\|y` |\n| b | c |\n| | d |\n\nAfter.\n\n" +
		"  | indented | table |\n  | --- | --- |\n  | 1 | 2 |\n\n" +
		"```\n|not|a|\n|-|-|\n```\n"
	if got := FormatTables(in); got != want {
		t.Errorf("FormatTables:\n%s\nwant:\n%s", got, want)
	}
	if got := FormatTables(want); got != want {
		t.Errorf("FormatTables is not idempotent:\n%s", got)
	}
}
