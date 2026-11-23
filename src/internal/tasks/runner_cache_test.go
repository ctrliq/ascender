package tasks

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

// fakeRuntime is a container runtime whose "run" prints the plugin files
// of an image after a moment, as the probe would read them.
func fakeRuntime(t *testing.T, body string) string {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "fakert")
	script := "#!/bin/sh\ncat >/dev/null\nsleep 0.2\nprintf '%s' '" + body + "'\n"
	if err := os.WriteFile(path, []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}
	return path
}

// The first jobs on an image fill the cache once, whole; a directory an
// earlier failed fill left is replaced rather than trusted for ever.
func TestCallbackPluginFill(t *testing.T) {
	big := strings.Repeat("x", 200000)
	rt := fakeRuntime(t, `{"awx_display.py": "`+big+`", "__init__.py": "i"}`)
	root := t.TempDir()
	var wg sync.WaitGroup
	dirs := make([]string, 8)
	errs := make([]error, 8)
	for i := range dirs {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			dirs[i], errs[i] = callbackPlugin(context.Background(), rt, "example/ee:1", root)
			if errs[i] == nil {
				// Whoever gets the directory gets all of it.
				if b, err := os.ReadFile(filepath.Join(dirs[i], "awx_display.py")); err != nil || len(b) != len(big) {
					errs[i] = err
					if err == nil {
						t.Errorf("job %d read %d bytes", i, len(b))
					}
				}
			}
		}(i)
	}
	wg.Wait()
	for i := range dirs {
		if errs[i] != nil || dirs[i] != dirs[0] {
			t.Fatalf("job %d: %q %v", i, dirs[i], errs[i])
		}
	}
	entries, _ := os.ReadDir(filepath.Dir(dirs[0]))
	if len(entries) != 1 {
		t.Errorf("cache holds %d entries, want only the image's", len(entries))
	}

	// A partial directory from before: no awx_display.py.
	stale := t.TempDir()
	rt2 := fakeRuntime(t, `{"awx_display.py": "full", "__init__.py": "i"}`)
	dir, err := callbackPlugin(context.Background(), rt2, "example/other:1", stale)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.RemoveAll(dir); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	_ = os.WriteFile(filepath.Join(dir, "__init__.py"), []byte("i"), 0o644)
	if _, err := callbackPlugin(context.Background(), rt2, "example/other:1", stale); err != nil {
		t.Fatal(err)
	}
	if b, _ := os.ReadFile(filepath.Join(dir, "awx_display.py")); string(b) != "full" {
		t.Errorf("stale fill not replaced: %q", b)
	}

	// A failed probe leaves nothing that passes for a fill.
	failed := t.TempDir()
	if _, err := callbackPlugin(context.Background(), fakeRuntime(t, `not json`), "example/bad:1", failed); err == nil {
		t.Fatal("bad probe output accepted")
	}
	if entries, _ := os.ReadDir(filepath.Join(failed, "callback_cache")); len(entries) != 0 {
		t.Errorf("failed fill left %d entries", len(entries))
	}
}
