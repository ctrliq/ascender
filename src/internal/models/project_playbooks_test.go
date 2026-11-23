package models

import (
	"encoding/json"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"
)

// playbookGolden is testdata/playbooks.json, made by gen_playbooks.py in
// the old image: a tree, and what Project.playbooks listed for it with
// ASCENDER_SHOW_PLAYBOOK_LINKS off and on.
type playbookGolden struct {
	Files []struct {
		Path string `json:"path"`
		// Parts are [Latin-1 string, count] pairs.
		Parts [][]any `json:"parts"`
	} `json:"files"`
	Links []struct {
		Path   string `json:"path"`
		Target string `json:"target"`
	} `json:"links"`
	Dirs        []string `json:"dirs"`
	Playbooks   []string `json:"playbooks"`
	FollowLinks []string `json:"playbooks_follow_links"`
}

// latin1Bytes turns a string of characters below 256 back into its bytes.
func latin1Bytes(t *testing.T, s string) []byte {
	t.Helper()
	b := make([]byte, 0, len(s))
	for _, r := range s {
		if r > 0xff {
			t.Fatalf("character %U in a Latin-1 string", r)
		}
		b = append(b, byte(r))
	}
	return b
}

func buildPlaybookGolden(t *testing.T) (string, playbookGolden) {
	t.Helper()
	raw, err := os.ReadFile("testdata/playbooks.json")
	if err != nil {
		t.Fatal(err)
	}
	var g playbookGolden
	if err := json.Unmarshal(raw, &g); err != nil {
		t.Fatal(err)
	}
	root := filepath.Join(t.TempDir(), "proj")
	for _, f := range g.Files {
		var content []byte
		for _, part := range f.Parts {
			chunk := latin1Bytes(t, part[0].(string))
			for range int(part[1].(float64)) {
				content = append(content, chunk...)
			}
		}
		p := filepath.Join(root, f.Path)
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, content, 0o644); err != nil {
			t.Fatal(err)
		}
	}
	for _, l := range g.Links {
		p := filepath.Join(root, l.Path)
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.Symlink(l.Target, p); err != nil {
			t.Fatal(err)
		}
	}
	for _, d := range g.Dirs {
		if err := os.MkdirAll(filepath.Join(root, d), 0o755); err != nil {
			t.Fatal(err)
		}
	}
	return root, g
}

// ProjectPlaybooks is Project.playbooks: could_be_playbook's .yml/.yaml
// extension (case included), valid_playbook_re on every line (Python
// whitespace, one dash, the five keys and a colon) or a vault header on
// line 0, the file read whole as UTF-8 with errors ignored and universal
// newlines, skip_directory's roles, tasks, group_vars, host_vars and dot
// directories only, links to directories followed only with
// ASCENDER_SHOW_PLAYBOOK_LINKS, no cap, sorted case-insensitively.
func TestProjectPlaybooksMatchOldPlaybooks(t *testing.T) {
	root, g := buildPlaybookGolden(t)
	for _, c := range []struct {
		follow bool
		want   []string
	}{{false, g.Playbooks}, {true, g.FollowLinks}} {
		if got := ProjectPlaybooks(root, c.follow); !slices.Equal(got, c.want) {
			t.Errorf("follow links %v:\ngot  %q\nwant %q", c.follow, got, c.want)
		}
	}
	if got := ProjectPlaybooks(root, false); !slices.Equal(got, g.Playbooks) {
		t.Errorf("Playbooks: %q", got)
	}
}

// skip_directory looks at the whole path the walk yields, the project
// path included, as for inventories.
func TestProjectPlaybooksSkippedPath(t *testing.T) {
	for _, parent := range []string{".projects", "roles", "tasks", "group_vars"} {
		root := filepath.Join(t.TempDir(), parent, "_1__p")
		writeInvFixture(t, root, []invFixture{{path: "site.yml", content: "- hosts: all\n", mode: 0o644}})
		if got := ProjectPlaybooks(root, false); len(got) != 0 {
			t.Errorf("under %s: %q", parent, got)
		}
	}
	if got := ProjectPlaybooks("", true); got == nil || len(got) != 0 {
		t.Errorf("no path: %#v", got)
	}
}

// With links followed, a link loop ends where the kernel refuses the path
// (as os.walk's did) instead of running forever, and a link out of the
// checkout is walked but its files are not read.
func TestProjectPlaybooksLinkLoopAndOutside(t *testing.T) {
	root := t.TempDir()
	outside := t.TempDir()
	writeInvFixture(t, outside, []invFixture{{path: "secret.yml", content: "- hosts: all\n", mode: 0o644}})
	writeInvFixture(t, root, []invFixture{
		{path: "site.yml", content: "- hosts: all\n", mode: 0o644},
		{path: "loop", link: "."},
		{path: "out", link: outside},
	})
	start := time.Now()
	got := ProjectPlaybooks(root, true)
	if took := time.Since(start); took > 10*time.Second {
		t.Fatalf("took %v", took)
	}
	if !slices.Contains(got, "site.yml") || !slices.Contains(got, "loop/site.yml") || !slices.Contains(got, "loop/loop/site.yml") {
		t.Errorf("loop: %q", got[:min(len(got), 5)])
	}
	for _, p := range got {
		if strings.Contains(p, "secret") {
			t.Errorf("read %s outside the checkout", p)
		}
	}
	if got := ProjectPlaybooks(root, false); !slices.Equal(got, []string{"site.yml"}) {
		t.Errorf("links not followed: %q", got)
	}
}
