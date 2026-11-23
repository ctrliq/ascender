package tmplws

import (
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestCollapse(t *testing.T) {
	for _, c := range []struct{ in, want string }{
		// Line breaks next to tags and actions vanish.
		{"<div>\n\t<span>a</span>\n</div>", "<div><span>a</span></div>"},
		{"{{if .x}}\n\t<b>{{.y}}</b>\n{{end}}\n", "{{if .x}}<b>{{.y}}</b>{{end}}"},
		{"<b>Name:</b>\n\t{{.Name}}", "<b>Name:</b>{{.Name}}"},
		// Between two pieces of text they become one space.
		{"<p>\n\tone\n\ttwo\n</p>", "<p>one two</p>"},
		// Whitespace without a line break is kept.
		{"<b>a</b> <i>b</i>", "<b>a</b> <i>b</i>"},
		{"{{.a}} {{.b}}", "{{.a}} {{.b}}"},
		// Tags, actions and raw elements keep their whitespace.
		{"<div\n\tclass=\"a\">x</div>", "<div\n\tclass=\"a\">x</div>"},
		{"{{template \"x\"\n\t(dict \"a\" 1)}}", "{{template \"x\"\n\t(dict \"a\" 1)}}"},
		{"<pre>a:\n  b: 1\n</pre>\n<p>x</p>", "<pre>a:\n  b: 1\n</pre><p>x</p>"},
		{"<textarea>\n{{.v}}\n</textarea>", "<textarea>\n{{.v}}\n</textarea>"},
		{"<script>\nvar a = 1\nvar b = 2\n</script>", "<script>\nvar a = 1\nvar b = 2\n</script>"},
		// Quotes and braces inside actions and attributes do not confuse the
		// scanner.
		{"<a title=\"{{t \"a > b\"}}\">\n\tx\n</a>", "<a title=\"{{t \"a > b\"}}\">x</a>"},
		{"{{t \"}}\"}}\n<b>x</b>", "{{t \"}}\"}}<b>x</b>"},
		{"<p>a < b\n</p>", "<p>a < b</p>"},
	} {
		if got := Collapse(c.in); got != c.want {
			t.Errorf("Collapse(%q)\n got %q\nwant %q", c.in, got, c.want)
		}
	}
}

func TestFormat(t *testing.T) {
	in := `{{define "x"}}<ul class="list">{{range .}}<li class="item"><a href="/a/{{.id}}"><span class="name">{{.name}}</span> <span class="count">{{.n}}</span></a></li>{{end}}</ul>{{end}}` + "\n"
	want := `{{define "x"}}
<ul class="list">
	{{range .}}
		<li class="item">
			<a href="/a/{{.id}}">
				<span class="name">{{.name}}</span> <span class="count">{{.n}}</span>
			</a>
		</li>
	{{end}}
</ul>
{{end}}
`
	if got := Format(in); got != want {
		t.Errorf("Format:\n%s\nwant:\n%s", got, want)
	}
}

// Laying out the real templates must not change what the server parses, and
// laying out the result again must not change it.
func TestFormatTemplates(t *testing.T) {
	root := "../../web/templates"
	n := 0
	err := filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() || !strings.HasSuffix(path, ".html") {
			return err
		}
		b, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		n++
		src := string(b)
		out := Format(src)
		if Collapse(out) != Collapse(src) {
			t.Errorf("%s: Format changes the collapsed template", path)
		}
		if Format(out) != out {
			t.Errorf("%s: Format is not idempotent", path)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if n < 50 {
		t.Fatalf("checked %d templates", n)
	}
}
