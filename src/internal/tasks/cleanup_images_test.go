package tasks

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// fakeImageRuntime writes a stand-in for podman or docker that records its
// arguments and answers as the real one does: `images` lists the tags in
// $FAKE_IMAGES (one per line, quoted as the format asks), the first
// `untag` succeeds silently and later ones fail as podman does once the
// reference is gone, `rmi` reports the untag, and `image prune` prints
// $FAKE_PRUNE.
func fakeImageRuntime(t *testing.T, name string) (path, logFile string) {
	t.Helper()
	dir := t.TempDir()
	path, logFile = filepath.Join(dir, name), filepath.Join(dir, "calls")
	script := `#!/bin/sh
echo "$*" >> "` + logFile + `"
case "$1" in
images) [ -n "$FAKE_IMAGES" ] && printf '%s\n' "$FAKE_IMAGES" ;;
untag) [ -e "` + dir + `/untagged" ] && { echo "Error: not found" >&2; exit 125; }; : > "` + dir + `/untagged" ;;
rmi) echo "Untagged: $2" ;;
image) printf '%s' "$FAKE_PRUNE" ;;
esac
exit 0
`
	if err := os.WriteFile(path, []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}
	return path, logFile
}

func fakeCalls(t *testing.T, logFile string) []string {
	t.Helper()
	b, err := os.ReadFile(logFile)
	if err != nil && !os.IsNotExist(err) {
		t.Fatal(err)
	}
	return strings.Fields(strings.ReplaceAll(strings.TrimSpace(string(b)), " ", "_"))
}

// prune_images: the prune reports a change unless it printed nothing or
// docker's nothing-reclaimed line.
func TestPruneImages(t *testing.T) {
	rt, _ := fakeImageRuntime(t, "podman")
	for out, want := range map[string]bool{
		"":                                    false,
		"Total reclaimed space: 0B":           false,
		"Total reclaimed space: 1.2GB":        true,
		"3f2a1c0e9b8d\n7c6b5a4f3e2d":          true,
		"Deleted Images:\ndeleted: sha256:ab": true,
	} {
		t.Setenv("FAKE_PRUNE", out)
		got, err := pruneImages(context.Background(), rt)
		if err != nil {
			t.Fatal(err)
		}
		if got != want {
			t.Errorf("prune printing %q: changed %v, want %v", out, got, want)
		}
	}
}

// cleanup_images under podman removes the one name (not every name of the
// image, as the old untag did), once per tag listed, counting only the untags that succeed; a tag not present is
// skipped.
func TestCleanupImagesPodman(t *testing.T) {
	rt, calls := fakeImageRuntime(t, "podman")
	t.Setenv("FAKE_IMAGES", `"quay.io/a/ee:1"`+"\n"+`"quay.io/a/ee:1"`)
	n, err := cleanupImages(context.Background(), rt, []string{"quay.io/a/ee:1"})
	if err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Errorf("removed %d, want 1", n)
	}
	want := []string{`images_--format="{{.Repository}}:{{.Tag}}"_quay.io/a/ee:1`, "untag_quay.io/a/ee:1_quay.io/a/ee:1", "untag_quay.io/a/ee:1_quay.io/a/ee:1"}
	if got := fakeCalls(t, calls); strings.Join(got, "|") != strings.Join(want, "|") {
		t.Errorf("calls %q, want %q", got, want)
	}

	rt, calls = fakeImageRuntime(t, "podman")
	t.Setenv("FAKE_IMAGES", "")
	if n, err := cleanupImages(context.Background(), rt, []string{"quay.io/a/gone:2"}); err != nil || n != 0 {
		t.Errorf("absent image: removed %d, err %v", n, err)
	}
	if got := fakeCalls(t, calls); len(got) != 1 {
		t.Errorf("absent image: calls %q, want the listing only", got)
	}
}

// Under docker it removes each listed tag, with the format's quotes
// stripped, and counts docker's Untagged lines.
func TestCleanupImagesDocker(t *testing.T) {
	rt, calls := fakeImageRuntime(t, "docker")
	t.Setenv("FAKE_IMAGES", `"quay.io/a/ee:1"`)
	n, err := cleanupImages(context.Background(), rt, []string{"quay.io/a/ee:1"})
	if err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Errorf("removed %d, want 1", n)
	}
	want := []string{`images_--format="{{.Repository}}:{{.Tag}}"_quay.io/a/ee:1`, "rmi_quay.io/a/ee:1_-f"}
	if got := fakeCalls(t, calls); strings.Join(got, "|") != strings.Join(want, "|") {
		t.Errorf("calls %q, want %q", got, want)
	}
}
