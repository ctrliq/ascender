package models

import (
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"syscall"
	"testing"
	"time"
)

type invFixture struct {
	path, content, link string
	mode                os.FileMode
	dir                 bool
}

func writeInvFixture(t *testing.T, root string, spec []invFixture) {
	t.Helper()
	for _, e := range spec {
		p := filepath.Join(root, e.path)
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		switch {
		case e.link != "":
			if err := os.Symlink(e.link, p); err != nil {
				t.Fatal(err)
			}
		case e.dir:
			if err := os.MkdirAll(p, 0o755); err != nil {
				t.Fatal(err)
			}
		default:
			if err := os.WriteFile(p, []byte(e.content), e.mode); err != nil {
				t.Fatal(err)
			}
			if err := os.Chmod(p, e.mode); err != nil {
				t.Fatal(err)
			}
		}
	}
}

// InventoryFiles is Project.inventories with could_be_inventory and
// skip_directory. The expected list is what the old functions gave for the
// same tree in the old image (Python 3.14, as root): names, .ini and
// executables without reading, the first eleven lines of extensionless
// files read as UTF-8 with errors ignored and universal newlines, roles,
// tasks, group_vars, host_vars and dot directories skipped, no
// directories, links to directories not followed, sorted case-insensitively.
func TestInventoryFilesMatchCouldBeInventory(t *testing.T) {
	if os.Geteuid() != 0 {
		t.Skip("the expected list was made as root (os.access X_OK)")
	}
	root := filepath.Join(t.TempDir(), "proj")
	writeInvFixture(t, root, []invFixture{
		{path: "inventory", content: "garbage{\x0a", mode: 0o644},
		{path: "hosts", content: "", mode: 0o644},
		{path: "sub/hosts", content: "# only a comment\x0a", mode: 0o644},
		{path: "a.ini", content: "# comment\x0a", mode: 0o644},
		{path: ".ini", content: "[web]\x0a", mode: 0o644},
		{path: "script.py", content: "#!/usr/bin/env python\x0a", mode: 0o755},
		{path: "x.yml", content: "- hosts: all\x0a", mode: 0o755},
		{path: "script.sh", content: "web1\x0a", mode: 0o644},
		{path: "noext", content: "web1\x0a", mode: 0o644},
		{path: "noext2", content: "# comment\x0a- foo\x0a", mode: 0o644},
		{path: "line10", content: "#\x0a#\x0a#\x0a#\x0a#\x0a#\x0a#\x0a#\x0a#\x0a#\x0aweb\x0a", mode: 0o644},
		{path: "line11", content: "#\x0a#\x0a#\x0a#\x0a#\x0a#\x0a#\x0a#\x0a#\x0a#\x0a#\x0aweb\x0a", mode: 0o644},
		{path: "bom", content: "\xef\xbb\xbfweb\x0a", mode: 0o644},
		{path: "bom2", content: "\xef\xbb\xbfweb\x0aweb\x0a", mode: 0o644},
		{path: "badutf8", content: "\xff\xfeweb\x0a", mode: 0o644},
		{path: "crlf6", content: "#\x0d\x0a#\x0d\x0a#\x0d\x0a#\x0d\x0a#\x0d\x0a#\x0d\x0aweb", mode: 0o644},
		{path: "cr10", content: "#\x0d#\x0d#\x0d#\x0d#\x0d#\x0d#\x0d#\x0d#\x0d#\x0dweb", mode: 0o644},
		{path: "cr11", content: "#\x0d#\x0d#\x0d#\x0d#\x0d#\x0d#\x0d#\x0d#\x0d#\x0d#\x0dweb", mode: 0o644},
		{path: "crbadlf", content: "#\x0d\xff\x0a#\x0d\xff\x0a#\x0d\xff\x0a#\x0d\xff\x0a#\x0d\xff\x0a#\x0d\xff\x0aweb", mode: 0o644},
		{path: "empty", content: "", mode: 0o644},
		{path: "a.", content: "web\x0a", mode: 0o644},
		{path: "Makefile", content: "all:\x0a", mode: 0o644},
		{path: "README", content: "Readme\x0a", mode: 0o644},
		{path: "site.yml", content: "- hosts: all\x0a", mode: 0o644},
		{path: "inv.yaml", content: "all:\x0a  hosts:\x0a    web1:\x0a", mode: 0o644},
		{path: "group_vars/all", content: "x: 1\x0a", mode: 0o644},
		{path: "inv1/group_vars/all.yml", content: "x: 1\x0a", mode: 0o644},
		{path: "inv1/host_vars/web1", content: "x: 1\x0a", mode: 0o644},
		{path: "inv1/hosts", content: "[web]\x0aweb1\x0a", mode: 0o644},
		{path: "inv2/group_vars/web", content: "x\x0a", mode: 0o644},
		{path: "roles/x/hosts", content: "[web]\x0a", mode: 0o644},
		{path: "tasks/hosts", content: "[web]\x0a", mode: 0o644},
		{path: "a/roles/hosts", content: "[web]\x0a", mode: 0o644},
		{path: "rolesx/hosts", content: "[web]\x0a", mode: 0o644},
		{path: ".git/hosts", content: "[web]\x0a", mode: 0o644},
		{path: ".hidden/sub/hosts", content: "[web]\x0a", mode: 0o644},
		{path: ".hosts", content: "web\x0a", mode: 0o644},
		{path: "B/hosts", content: "", mode: 0o644},
		{path: "b/inventory", content: "", mode: 0o644},
		{path: "A.INI", content: "web\x0a", mode: 0o644},
		{path: "upper/Hosts", content: "web\x0a", mode: 0o644},
		{path: "nul", content: "\x00web\x0a", mode: 0o644},
		{path: "space", content: " web\x0a", mode: 0o644},
		{path: "dash", content: "-web\x0a", mode: 0o644},
		{path: "bracket", content: "[web]\x0a", mode: 0o644},
		{path: "eq", content: "=x\x0a", mode: 0o644},
		{path: "unicode", content: "\xc3\xa9web\x0a", mode: 0o644},
		{path: "real/hosts", content: "", mode: 0o644},
		{path: "linkdir", link: "real"},
		{path: "broken", link: "nowhere"},
		{path: "broken.ini", link: "nowhere"},
		{path: "linkfile", link: "noext"},
		{path: "emptydir", dir: true},
	})
	want := []string{".hosts", ".ini", "a.ini", "B/hosts", "b/inventory", "badutf8", "bom2", "bracket", "broken.ini", "cr10", "crbadlf", "crlf6", "eq", "hosts", "inv1/hosts", "inventory", "line10", "linkfile", "Makefile", "noext", "README", "real/hosts", "rolesx/hosts", "script.py", "sub/hosts", "upper/Hosts", "x.yml"}
	if got := InventoryFiles(root); !slices.Equal(got, want) {
		t.Errorf("got  %q\nwant %q", got, want)
	}
}

// The walk stops once more than 50 files were found (51 are listed), and
// skip_directory looks at the whole path the walk yields.
func TestInventoryFilesCapAndSkippedPath(t *testing.T) {
	root := t.TempDir()
	for i := range 60 {
		if err := os.WriteFile(filepath.Join(root, fmt.Sprintf("h%02d", i)), []byte("web\n"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	if got := InventoryFiles(root); len(got) != 51 {
		t.Errorf("listed %d, want 51", len(got))
	}
	hidden := filepath.Join(t.TempDir(), ".projects", "_1__p")
	writeInvFixture(t, hidden, []invFixture{{path: "hosts", mode: 0o644}})
	if got := InventoryFiles(hidden); len(got) != 0 {
		t.Errorf("listed %q under a dot directory", got)
	}
	for _, c := range []struct{ name, ext string }{{"a.ini", ".ini"}, {".ini", ""}, {"..ini", ""}, {"a.", "."}, {"a.tar.gz", ".gz"}, {"noext", ""}, {".a.b", ".b"}} {
		if got := pySplitextExt(c.name); got != c.ext {
			t.Errorf("splitext(%q) = %q, want %q", c.name, got, c.ext)
		}
	}
}

// Reading an extensionless file never follows a link out of the checkout
// or onto a device, and never waits on a FIFO (the old open() would hang
// on both); such a file is not an inventory. Names alone still count.
func TestInventoryFilesReadsNoDevices(t *testing.T) {
	root := t.TempDir()
	outside := t.TempDir()
	if err := os.WriteFile(filepath.Join(outside, "secret"), []byte("web\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	writeInvFixture(t, root, []invFixture{{path: "zero", link: "/dev/zero"}, {path: "zero.ini", link: "/dev/zero"},
		{path: "outside", link: filepath.Join(outside, "secret")}, {path: "hosts", link: "/dev/zero"}})
	if err := syscall.Mkfifo(filepath.Join(root, "fifo"), 0o644); err != nil {
		t.Fatal(err)
	}
	start := time.Now()
	got := InventoryFiles(root)
	if took := time.Since(start); took > 5*time.Second {
		t.Fatalf("took %v", took)
	}
	if want := []string{"hosts", "zero.ini"}; !slices.Equal(got, want) {
		t.Errorf("got %q, want %q", got, want)
	}
}
