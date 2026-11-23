package tasks

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// argRuntime is a container runtime that records its arguments.
func argRuntime(t *testing.T, out string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "rt")
	script := "#!/bin/sh\necho \"$@\" >> " + out + "\ncat >/dev/null\nprintf '%s' '{\"awx_display.py\": \"x\"}'\n"
	if err := os.WriteFile(path, []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}
	return path
}

// The registry login reaches docker's pull as a global --config and
// podman's callback probe (which pulls the image) as --authfile.
func TestRegistryLoginReachesTheRuntime(t *testing.T) {
	log := filepath.Join(t.TempDir(), "args")
	rt := argRuntime(t, log)
	if err := dockerPull(context.Background(), rt, "registry.example.com/ee:1", "always", "--config", "/run/reg"); err != nil {
		t.Fatal(err)
	}
	if _, err := callbackPlugin(context.Background(), rt, "registry.example.com/ee:1", t.TempDir(), "--authfile=/run/reg/auth.json"); err != nil {
		t.Fatal(err)
	}
	b, _ := os.ReadFile(log)
	lines := strings.Split(strings.TrimSpace(string(b)), "\n")
	if len(lines) != 2 || !strings.HasPrefix(lines[0], "--config /run/reg pull --quiet registry.example.com/ee:1") ||
		!strings.HasPrefix(lines[1], "run --authfile=/run/reg/auth.json --rm") {
		t.Errorf("runtime calls: %q", lines)
	}
}
