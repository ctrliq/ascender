// Command importpo converts the old UI's gettext catalogs into the JSON
// catalogs under internal/i18n/locales. It is a development tool: the JSON
// files are the source of truth from then on, and this only exists to
// bring in translations that were made upstream in the .po files.
//
//	go run ./internal/i18n/importpo -old <ascender checkout>
//
// reads <old>/ascender/ui/src/locales/<lang>/messages.po (the UI's Lingui
// catalogs) into locales/<lang>/ui.json. -merge keeps the entries already
// in the JSON files and only adds or replaces what the .po files translate.
// The API's catalogs (api.json) come from the old application's run time
// instead: see testdata/gen_api_catalogs.py.
//
// What gettext and Lingui ignore at run time is left out: the header,
// obsolete (#~) entries, fuzzy entries and empty translations. English is
// the source language, so it has no catalog.
package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
)

func main() {
	old := flag.String("old", "", "the old application's source tree (a checkout of github.com/ctrliq/ascender)")
	out := flag.String("out", "internal/i18n/locales", "the JSON catalog directory")
	merge := flag.Bool("merge", false, "keep entries already in the JSON catalogs")
	flag.Parse()
	if *old == "" {
		fail(fmt.Errorf("-old is required: the old application's source tree"))
	}
	sources := []struct{ domain, pattern string }{
		{"ui", filepath.Join(*old, "ascender/ui/src/locales/*/messages.po")},
	}
	for _, s := range sources {
		files, err := filepath.Glob(s.pattern)
		if err != nil {
			fail(err)
		}
		if len(files) == 0 {
			fail(fmt.Errorf("no catalogs match %s", s.pattern))
		}
		for _, f := range files {
			lang := langOf(s.domain, f)
			if lang == "en" || lang == "en-us" {
				continue
			}
			entries, err := parsePO(f)
			if err != nil {
				fail(fmt.Errorf("%s: %w", f, err))
			}
			dest := filepath.Join(*out, lang, s.domain+".json")
			catalog := map[string]any{}
			if *merge {
				if b, err := os.ReadFile(dest); err == nil {
					if err := json.Unmarshal(b, &catalog); err != nil {
						fail(fmt.Errorf("%s: %w", dest, err))
					}
				}
			}
			n := 0
			for _, e := range entries {
				if v := e.value(); v != nil {
					catalog[e.key()] = v
					n++
				}
			}
			if err := writeJSON(dest, catalog); err != nil {
				fail(err)
			}
			fmt.Printf("%s: %d translations from %s\n", dest, n, f)
		}
	}
}

func fail(err error) {
	fmt.Fprintln(os.Stderr, "importpo:", err)
	os.Exit(1)
}

// langOf is the language directory a catalog sits in.
func langOf(domain, path string) string {
	dir := filepath.Dir(path)
	if domain == "api" {
		dir = filepath.Dir(dir) // <lang>/LC_MESSAGES
	}
	return filepath.Base(dir)
}

type entry struct {
	ctx, id, plural string
	strs            map[int]string
	fuzzy           bool
}

// key is the catalog key: the msgid, behind its context and an EOT the way
// gettext keys pgettext entries.
func (e *entry) key() string {
	if e.ctx != "" {
		return e.ctx + "\x04" + e.id
	}
	return e.id
}

// value is the translation, a string or (for an ngettext entry) the list
// of plural forms; nil when there is none to use.
func (e *entry) value() any {
	if e.id == "" || e.fuzzy {
		return nil
	}
	if e.plural == "" {
		if s := e.strs[0]; s != "" {
			return s
		}
		return nil
	}
	forms := make([]string, len(e.strs))
	for i := range forms {
		forms[i] = e.strs[i]
		if forms[i] == "" {
			return nil
		}
	}
	if len(forms) == 0 {
		return nil
	}
	return forms
}

// parsePO reads the active entries of a .po file.
func parsePO(path string) ([]*entry, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	var (
		entries []*entry
		cur     *entry
		fuzzy   bool
		target  func(string)
	)
	start := func() {
		cur = &entry{strs: map[int]string{}, fuzzy: fuzzy}
		fuzzy = false
		entries = append(entries, cur)
	}
	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 1<<20), 1<<20)
	for n := 1; sc.Scan(); n++ {
		line := strings.TrimSpace(sc.Text())
		switch {
		case line == "" || strings.HasPrefix(line, "#~"):
			target = nil
		case strings.HasPrefix(line, "#,"):
			fuzzy = strings.Contains(line, "fuzzy")
		case strings.HasPrefix(line, "#"):
		case strings.HasPrefix(line, `"`):
			if target == nil {
				return nil, fmt.Errorf("line %d: continuation without a keyword", n)
			}
			s, err := strconv.Unquote(line)
			if err != nil {
				return nil, fmt.Errorf("line %d: %w", n, err)
			}
			target(s)
		default:
			kw, rest, ok := strings.Cut(line, " ")
			if !ok {
				return nil, fmt.Errorf("line %d: %q", n, line)
			}
			s, err := strconv.Unquote(rest)
			if err != nil {
				return nil, fmt.Errorf("line %d: %w", n, err)
			}
			switch {
			case kw == "msgctxt":
				start()
				cur.ctx = s
				c := cur
				target = func(s string) { c.ctx += s }
			case kw == "msgid":
				if cur == nil || cur.id != "" || len(cur.strs) > 0 || cur.ctx == "" {
					start()
				}
				cur.id = s
				c := cur
				target = func(s string) { c.id += s }
			case kw == "msgid_plural":
				cur.plural = s
				c := cur
				target = func(s string) { c.plural += s }
			case kw == "msgstr":
				cur.strs[0] = s
				target = appendTo(cur.strs, 0)
			case strings.HasPrefix(kw, "msgstr[") && strings.HasSuffix(kw, "]"):
				i, err := strconv.Atoi(kw[7 : len(kw)-1])
				if err != nil {
					return nil, fmt.Errorf("line %d: %q", n, kw)
				}
				cur.strs[i] = s
				target = appendTo(cur.strs, i)
			default:
				return nil, fmt.Errorf("line %d: unknown keyword %q", n, kw)
			}
		}
	}
	return entries, sc.Err()
}

// appendTo appends continuation lines to one of an entry's msgstrs.
func appendTo(m map[int]string, i int) func(string) {
	return func(s string) { m[i] += s }
}

// writeJSON writes a catalog sorted by key, one entry per line, without
// HTML escaping so translators read the text as it is.
func writeJSON(path string, catalog map[string]any) error {
	keys := make([]string, 0, len(catalog))
	for k := range catalog {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	var buf bytes.Buffer
	buf.WriteString("{\n")
	for i, k := range keys {
		buf.WriteString("  ")
		buf.Write(marshal(k))
		buf.WriteString(": ")
		buf.Write(marshal(catalog[k]))
		if i < len(keys)-1 {
			buf.WriteByte(',')
		}
		buf.WriteByte('\n')
	}
	buf.WriteString("}\n")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	return os.WriteFile(path, buf.Bytes(), 0o644)
}

func marshal(v any) []byte {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(v); err != nil {
		fail(err)
	}
	return bytes.TrimRight(buf.Bytes(), "\n")
}
