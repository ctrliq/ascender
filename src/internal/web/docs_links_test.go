package web

import (
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/ctrliq/ascender/internal/docsite"
)

// docsLinkRE finds the user interface's links into the documentation site
// in templates, scripts and Go source: a quoted /docs/ address.
var docsLinkRE = regexp.MustCompile(`["']` + docsBase + `[^"'\s]*["']`)

// TestDocsLinks checks that every link the user interface and the
// browsable API make into the documentation site reaches a page, and the
// heading it names, in docs/docsite.
func TestDocsLinks(t *testing.T) {
	site, err := docsite.Load(os.DirFS("../../../docs/docsite"), docsite.Options{Base: docsBase, Static: "/static/"})
	if err != nil {
		t.Fatal(err)
	}
	found := 0
	for _, dir := range []string{"../../web/templates", "../../web/static/js", ".", "../api"} {
		err := filepath.WalkDir(dir, func(p string, d fs.DirEntry, err error) error {
			if err != nil {
				return err
			}
			if d.IsDir() {
				if d.Name() == "vendor" {
					return filepath.SkipDir
				}
				return nil
			}
			if strings.HasSuffix(p, "_test.go") || !strings.HasSuffix(p, ".html") && !strings.HasSuffix(p, ".js") && !strings.HasSuffix(p, ".go") {
				return nil
			}
			b, err := os.ReadFile(p)
			if err != nil {
				return err
			}
			for _, m := range docsLinkRE.FindAllString(string(b), -1) {
				found++
				if err := site.Check(m[1 : len(m)-1]); err != nil {
					t.Errorf("%s: %s: %v", p, m, err)
				}
			}
			return nil
		})
		if err != nil {
			t.Fatal(err)
		}
	}
	if found < 10 {
		t.Errorf("found %d links into the documentation, expected at least 10", found)
	}
}
