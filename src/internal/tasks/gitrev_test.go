package tasks

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

const (
	shaA = "0123456789abcdef0123456789abcdef01234567"
	shaB = "89abcdef0123456789abcdef0123456789abcdef"
)

func writeRepoFile(t *testing.T, dir, name, content string) {
	t.Helper()
	p := filepath.Join(dir, name)
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(p, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestGitHeadReadsRefs(t *testing.T) {
	loose := t.TempDir()
	writeRepoFile(t, loose, ".git/HEAD", "ref: refs/heads/main\n")
	writeRepoFile(t, loose, ".git/refs/heads/main", shaA+"\n")

	packed := t.TempDir()
	writeRepoFile(t, packed, ".git/HEAD", "ref: refs/heads/release/1.0\n")
	writeRepoFile(t, packed, ".git/packed-refs", "# pack-refs with: peeled fully-peeled sorted\n"+shaB+" refs/heads/main\n"+shaA+" refs/heads/release/1.0\n^"+shaB+"\n")

	detached := t.TempDir()
	writeRepoFile(t, detached, ".git/HEAD", shaB+"\n")

	for name, tc := range map[string]struct{ dir, want string }{
		"loose ref": {loose, shaA}, "packed ref": {packed, shaA}, "detached": {detached, shaB},
	} {
		got, err := gitHead(tc.dir)
		if err != nil || got != tc.want {
			t.Errorf("%s: gitHead = %q, %v; want %q", name, got, err, tc.want)
		}
	}
}

// Whatever a project puts in its checkout, reading HEAD never leaves the
// tree, never blocks on a device and never trusts a malformed name.
func TestGitHeadRefusesHostileRepositories(t *testing.T) {
	outside := t.TempDir()
	writeRepoFile(t, outside, "secret", shaA+"\n")

	cases := map[string]func(dir string){
		"HEAD symlink out of the tree": func(dir string) {
			os.MkdirAll(filepath.Join(dir, ".git"), 0o755)
			os.Symlink(filepath.Join(outside, "secret"), filepath.Join(dir, ".git/HEAD"))
		},
		"ref symlink out of the tree": func(dir string) {
			writeRepoFile(t, dir, ".git/HEAD", "ref: refs/heads/main\n")
			os.MkdirAll(filepath.Join(dir, ".git/refs/heads"), 0o755)
			os.Symlink(filepath.Join(outside, "secret"), filepath.Join(dir, ".git/refs/heads/main"))
		},
		"HEAD is a device": func(dir string) {
			os.MkdirAll(filepath.Join(dir, ".git"), 0o755)
			os.Symlink("/dev/zero", filepath.Join(dir, ".git/HEAD"))
		},
		"ref escapes with dots": func(dir string) {
			writeRepoFile(t, dir, ".git/HEAD", "ref: refs/../../../secret\n")
		},
		"ref is not under refs/": func(dir string) {
			writeRepoFile(t, dir, ".git/HEAD", "ref: config\n")
		},
		"ref holds no object name": func(dir string) {
			writeRepoFile(t, dir, ".git/HEAD", "ref: refs/heads/main\n")
			writeRepoFile(t, dir, ".git/refs/heads/main", "--upload-pack=touch /tmp/x\n")
		},
		".git is a file": func(dir string) {
			writeRepoFile(t, dir, ".git", "gitdir: "+outside+"\n")
		},
		"missing ref": func(dir string) {
			writeRepoFile(t, dir, ".git/HEAD", "ref: refs/heads/gone\n")
		},
	}
	for name, setup := range cases {
		dir := t.TempDir()
		setup(dir)
		if got, err := gitHead(dir); err == nil {
			t.Errorf("%s: gitHead = %q, want an error", name, got)
		}
	}
}

// The result agrees with git's own on a real repository, loose and packed.
func TestGitHeadMatchesGit(t *testing.T) {
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("no git")
	}
	dir := t.TempDir()
	git := func(args ...string) string {
		t.Helper()
		cmd := exec.Command("git", args...)
		cmd.Dir = dir
		cmd.Env = append(os.Environ(), "GIT_CONFIG_GLOBAL=/dev/null", "GIT_CONFIG_SYSTEM=/dev/null",
			"GIT_AUTHOR_NAME=t", "GIT_AUTHOR_EMAIL=t@example.com", "GIT_COMMITTER_NAME=t", "GIT_COMMITTER_EMAIL=t@example.com")
		out, err := cmd.CombinedOutput()
		if err != nil {
			t.Fatalf("git %v: %v %s", args, err, out)
		}
		return strings.TrimSpace(string(out))
	}
	git("init", "-q", "-b", "main")
	writeRepoFile(t, dir, "a.yml", "- hosts: all\n")
	git("add", "a.yml")
	git("commit", "-q", "-m", "one")
	for _, step := range []string{"loose", "packed"} {
		if step == "packed" {
			git("pack-refs", "--all", "--prune")
		}
		want := git("rev-parse", "HEAD")
		if got, err := gitHead(dir); err != nil || got != want {
			t.Errorf("%s: gitHead = %q, %v; git says %q", step, got, err, want)
		}
	}
}
