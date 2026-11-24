package tasks

import (
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/ctrliq/ascender/internal/config"
	"github.com/ctrliq/ascender/internal/models"
)

func TestRequirementsCacheTarRoundTrip(t *testing.T) {
	dir := t.TempDir()
	src := filepath.Join(dir, "cache", "requirements_collections")
	if err := os.MkdirAll(filepath.Join(src, "ansible_collections", "ns", "coll"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(src, "ansible_collections", "ns", "coll", "MANIFEST.json"), []byte(`{"a": 1}`), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink("MANIFEST.json", filepath.Join(src, "ansible_collections", "ns", "coll", "link.json")); err != nil {
		t.Fatal(err)
	}
	tarPath := filepath.Join(dir, "requirements_collections.tar")
	if err := tarDir(src, tarPath, "requirements_collections"); err != nil {
		t.Fatal(err)
	}
	out := filepath.Join(dir, "job")
	if err := os.MkdirAll(out, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := extractTarData(tarPath, out); err != nil {
		t.Fatal(err)
	}
	b, err := os.ReadFile(filepath.Join(out, "requirements_collections", "ansible_collections", "ns", "coll", "link.json"))
	if err != nil || string(b) != `{"a": 1}` {
		t.Fatalf("extracted: %q %v", b, err)
	}
}

func TestExtractTarDataRefusesEscapes(t *testing.T) {
	dir := t.TempDir()
	// A link out of the destination.
	src := filepath.Join(dir, "evil")
	if err := os.MkdirAll(src, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink("/etc/passwd", filepath.Join(src, "pw")); err != nil {
		t.Fatal(err)
	}
	tarPath := filepath.Join(dir, "evil.tar")
	if err := tarDir(src, tarPath, "evil"); err != nil {
		t.Fatal(err)
	}
	if err := extractTarData(tarPath, filepath.Join(dir, "out")); err == nil || !strings.Contains(err.Error(), "outside") {
		t.Fatalf("absolute link extracted: %v", err)
	}
}

func TestClearProjectCache(t *testing.T) {
	d := &Dispatcher{Cfg: &config.Config{}, Log: slog.New(slog.NewTextHandler(io.Discard, nil))}
	dir := t.TempDir()
	hashOf := func(c byte) string { return strings.Repeat(string(c), 64) }
	mk := func(name string) string {
		p := filepath.Join(dir, name)
		if err := os.MkdirAll(p, 0o755); err != nil {
			t.Fatal(err)
		}
		return p
	}
	keep := mk("rev1")
	_ = os.WriteFile(filepath.Join(keep, ".requirements_hash"), []byte(hashOf('a')), 0o644)
	mk("rev0")
	mk("stage")
	old := time.Now().Add(-time.Hour)
	for i, c := range []byte("abc") {
		p := mk("reqcache_" + hashOf(c))
		ts := old.Add(time.Duration(i) * time.Minute)
		_ = os.Chtimes(p, ts, ts)
	}
	d.clearProjectCache(dir, "rev1", 2)
	var names []string
	entries, _ := os.ReadDir(dir)
	for _, e := range entries {
		names = append(names, e.Name())
	}
	got := strings.Join(names, ",")
	// rev0 goes; of the three requirements caches, the kept revision's is
	// protected and the least recently used other one is evicted.
	want := strings.Join([]string{"reqcache_" + hashOf('a'), "reqcache_" + hashOf('c'), "rev1", "stage"}, ",")
	if got != want {
		t.Fatalf("got  %s\nwant %s", got, want)
	}
}

func TestRequirementsMutableRefresh(t *testing.T) {
	for _, tc := range []struct {
		name    string
		jobType string
		mutable bool
		want    bool
	}{
		// an update that fetched the project and installed a git requirement on a branch
		{"check, mutable", "check", true, true},
		// pinned requirements: the project revision still decides the content
		{"check, pinned", "check", false, false},
		// a job's local sync installs for a revision another update published
		{"run, mutable", "run", true, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			dir := t.TempDir()
			if tc.mutable {
				if err := os.WriteFile(filepath.Join(dir, ".requirements_mutable"), []byte("git requirement"), 0o644); err != nil {
					t.Fatal(err)
				}
			}
			pu := &models.ProjectUpdate{}
			pu.JobType = tc.jobType
			if got := requirementsMutableRefresh(pu, dir); got != tc.want {
				t.Fatalf("requirementsMutableRefresh = %v, want %v", got, tc.want)
			}
		})
	}
}
