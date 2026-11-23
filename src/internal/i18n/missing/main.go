// Command missing lists the UI messages the code asks for that a language's
// catalog does not translate: the work left for translators, and (when a
// message is in no catalog at all) a hint that a msgid was mistyped.
//
//	go run ./internal/i18n/missing [-lang ja] [-all]
//
// It reads the literal messages of {{t "..."}} and {{tHTML "..."}} in
// web/templates, loc.T("...") and Loc.HTML("...") in internal/web, and
// t('...') in web/static/js. Messages chosen at run time ({{t .label}})
// are not seen. With -all every language is checked and only messages no
// catalog has are listed.
package main

import (
	"flag"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"github.com/ctrliq/ascender/internal/i18n"
)

var patterns = map[string][]*regexp.Regexp{
	".html": {regexp.MustCompile(`[({]\s*-?\s*tHTML\s+("(?:[^"\\]|\\.)*")`), regexp.MustCompile(`[({]\s*-?\s*t\s+("(?:[^"\\]|\\.)*")`)},
	".go":   {regexp.MustCompile(`\b[Ll]oc\.(?:T|HTML)\(\s*("(?:[^"\\]|\\.)*"|` + "`[^`]*`" + `)`)},
	".js":   {regexp.MustCompile(`\bt\(\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")`)},
}

type use struct {
	file string
	line int
}

func main() {
	lang := flag.String("lang", "ja", "the catalog to check")
	all := flag.Bool("all", false, "list only messages that no catalog translates")
	flag.Parse()
	uses := map[string][]use{}
	for _, root := range []string{"web/templates", "internal/web", "web/static/js"} {
		err := filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
			if err != nil || d.IsDir() || strings.HasSuffix(path, "_test.go") || strings.Contains(path, "/vendor/") {
				return err
			}
			res := patterns[filepath.Ext(path)]
			if res == nil {
				return nil
			}
			b, err := os.ReadFile(path)
			if err != nil {
				return err
			}
			src := string(b)
			for _, re := range res {
				for _, m := range re.FindAllStringSubmatchIndex(src, -1) {
					lit := src[m[2]:m[3]]
					id, err := unquote(lit)
					if err != nil {
						continue
					}
					uses[id] = append(uses[id], use{path, strings.Count(src[:m[2]], "\n") + 1})
				}
			}
			return nil
		})
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
	}
	langs := []string{*lang}
	if *all {
		langs = nil
		for _, l := range i18n.Languages {
			if l.Code != i18n.Default {
				langs = append(langs, l.Code)
			}
		}
	}
	var missing []string
	for id := range uses {
		found := false
		for _, l := range langs {
			if i18n.New(l).Has(id) {
				found = true
				break
			}
		}
		if !found {
			missing = append(missing, id)
		}
	}
	sort.Strings(missing)
	for _, id := range missing {
		u := uses[id][0]
		fmt.Printf("%s:%d\t%q\n", u.file, u.line, id)
	}
	fmt.Fprintf(os.Stderr, "%d of %d messages not translated (%s)\n", len(missing), len(uses), strings.Join(langs, ","))
}

// unquote reads a Go or JavaScript string literal.
func unquote(lit string) (string, error) {
	if strings.HasPrefix(lit, "'") {
		inner := lit[1 : len(lit)-1]
		inner = strings.ReplaceAll(inner, `\'`, `'`)
		inner = strings.ReplaceAll(inner, `"`, `\"`)
		return strconv.Unquote(`"` + inner + `"`)
	}
	return strconv.Unquote(lit)
}
