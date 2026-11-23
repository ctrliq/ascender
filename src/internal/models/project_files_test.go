package models

import (
	"os"
	"path/filepath"
	"slices"
	"testing"
	"time"
)

// A checkout may hold symlinks to devices or host files and FIFOs; finding
// playbooks and inventories reads none of them.
func TestProjectDiscoveryReadsOnlyRegularFilesInside(t *testing.T) {
	dir := t.TempDir()
	outside := t.TempDir()
	write := func(root, name, content string) {
		if err := os.WriteFile(filepath.Join(root, name), []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	write(dir, "site.yml", "- hosts: all\n  tasks: []\n")
	write(outside, "secret.yml", "- hosts: all\n")
	write(dir, "hosts.ini", "[web]\nweb1\n")
	if err := os.Symlink("/dev/zero", filepath.Join(dir, "zero.yml")); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink("/dev/zero", filepath.Join(dir, "zero.ini")); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(filepath.Join(outside, "secret.yml"), filepath.Join(dir, "linked.yml")); err != nil {
		t.Fatal(err)
	}
	write(dir, "inside.yml", "- hosts: localhost\n")
	if err := os.Symlink("inside.yml", filepath.Join(dir, "alias.yml")); err != nil {
		t.Fatal(err)
	}
	start := time.Now()
	got := ProjectPlaybooks(dir, false)
	inv := InventoryFiles(dir)
	if took := time.Since(start); took > 5*time.Second {
		t.Fatalf("took %v", took)
	}
	for _, want := range []string{"site.yml", "inside.yml", "alias.yml"} {
		if !slices.Contains(got, want) {
			t.Errorf("playbooks %v lack %s", got, want)
		}
	}
	for _, not := range []string{"zero.yml", "linked.yml"} {
		if slices.Contains(got, not) {
			t.Errorf("playbooks %v include %s", got, not)
		}
	}
	// An .ini file is an inventory by its name alone (could_be_inventory),
	// so the link is listed without being read.
	if !slices.Contains(inv, "hosts.ini") || !slices.Contains(inv, "zero.ini") {
		t.Errorf("inventories %v", inv)
	}
	if _, err := ReadProjectFile(dir, filepath.Join(dir, "zero.yml"), 1<<20); err == nil {
		t.Error("read /dev/zero through a link")
	}
}
