package tasks

import (
	"archive/tar"
	"archive/zip"
	"bufio"
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"testing"
)

// A job's private data dir can hold whatever its playbook left: the
// host-side helpers read and write inside it only.
func TestJobFileHelpersStayInside(t *testing.T) {
	pdd, outside := t.TempDir(), t.TempDir()
	secret := filepath.Join(outside, "SECRET_KEY")
	if err := os.WriteFile(secret, []byte("s3cret"), 0o600); err != nil {
		t.Fatal(err)
	}
	art := filepath.Join(pdd, "artifacts", "7")
	if err := os.MkdirAll(art, 0o700); err != nil {
		t.Fatal(err)
	}
	// A planted link to a host file, a FIFO, and a plain file.
	if err := os.Symlink(secret, filepath.Join(art, "ansible_version.txt")); err != nil {
		t.Fatal(err)
	}
	if err := syscall.Mkfifo(filepath.Join(art, "collections.json"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(art, "output.json"), []byte("{}"), 0o600); err != nil {
		t.Fatal(err)
	}
	if b, err := readJobFile(pdd, filepath.Join(art, "ansible_version.txt"), 4096); err == nil {
		t.Fatalf("read through an escaping link: %q", b)
	}
	if _, err := readJobFile(pdd, filepath.Join(art, "collections.json"), 4096); err == nil {
		t.Fatal("read a FIFO")
	}
	if b, err := readJobFile(pdd, filepath.Join(art, "output.json"), 4096); err != nil || string(b) != "{}" {
		t.Fatalf("plain file: %q %v", b, err)
	}
	if _, err := readJobFile(pdd, filepath.Join(art, "output.json"), 1); err == nil {
		t.Fatal("size limit ignored")
	}
	// The status write replaces the link instead of writing through it.
	if err := os.Symlink(secret, filepath.Join(art, "status")); err != nil {
		t.Fatal(err)
	}
	if err := writeJobFile(pdd, filepath.Join(art, "status"), []byte("successful"), 0o600); err != nil {
		t.Fatal(err)
	}
	if b, _ := os.ReadFile(secret); string(b) != "s3cret" {
		t.Fatalf("host file overwritten: %q", b)
	}
	if b, _ := os.ReadFile(filepath.Join(art, "status")); string(b) != "successful" {
		t.Fatalf("status: %q", b)
	}
	// A symlinked directory in the path is refused too.
	if err := os.RemoveAll(art); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, art); err != nil {
		t.Fatal(err)
	}
	if b, err := readJobFile(pdd, filepath.Join(art, "SECRET_KEY"), 4096); err == nil {
		t.Fatalf("read through a linked directory: %q", b)
	}
}

// An archive from the worker cannot write outside its target through a
// symlink entry of its own.
func TestUnzipDirSymlinkEscape(t *testing.T) {
	target, outside := t.TempDir(), t.TempDir()
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	h := &zip.FileHeader{Name: "a"}
	h.SetMode(os.ModeSymlink | 0o777)
	w, _ := zw.CreateHeader(h)
	_, _ = w.Write([]byte(outside))
	w, _ = zw.Create("a/pwned")
	_, _ = w.Write([]byte("x"))
	w, _ = zw.Create("../escaped")
	_, _ = w.Write([]byte("x"))
	w, _ = zw.Create("job_events/1-ok.json")
	_, _ = w.Write([]byte("{}"))
	if err := zw.Close(); err != nil {
		t.Fatal(err)
	}
	_ = unzipDir(buf.Bytes(), target)
	if _, err := os.Stat(filepath.Join(outside, "pwned")); err == nil {
		t.Fatal("wrote through a symlink entry")
	}
	if _, err := os.Stat(filepath.Join(filepath.Dir(target), "escaped")); err == nil {
		t.Fatal("wrote outside with ..")
	}
	if _, err := os.Stat(filepath.Join(target, "job_events", "1-ok.json")); err != nil {
		t.Fatalf("plain entry: %v", err)
	}
}

func TestReadBase64RejectsBadSize(t *testing.T) {
	for _, n := range []int{-1, maxWorkerArtifacts + 1} {
		if _, err := readBase64(bufio.NewReader(strings.NewReader("")), n); err == nil {
			t.Errorf("size %d accepted", n)
		}
	}
}

func TestCallbackFileNames(t *testing.T) {
	for name, ok := range map[string]bool{
		"awx_display.py": true, "__init__.py": true,
		"../x/awx_display.py": false, "a/b.py": false, "x.sh": false, ".py": false, "": false,
	} {
		if callbackFileRe.MatchString(name) != ok {
			t.Errorf("%q: want %v", name, ok)
		}
	}
}

// A chain of links, each inside the destination by its name, cannot
// carry a file out of it.
func TestExtractTarDataChainedLinks(t *testing.T) {
	dir := t.TempDir()
	dest := filepath.Join(dir, "pdd", "dest")
	var buf bytes.Buffer
	tw := tar.NewWriter(&buf)
	for _, h := range []*tar.Header{
		{Name: "a", Typeflag: tar.TypeSymlink, Linkname: "."},
		{Name: "a/b", Typeflag: tar.TypeSymlink, Linkname: ".."},
	} {
		if err := tw.WriteHeader(h); err != nil {
			t.Fatal(err)
		}
	}
	_ = tw.WriteHeader(&tar.Header{Name: "b/escaped", Typeflag: tar.TypeReg, Mode: 0o644, Size: 1})
	_, _ = tw.Write([]byte("x"))
	_ = tw.Close()
	tarPath := filepath.Join(dir, "in.tar")
	if err := os.WriteFile(tarPath, buf.Bytes(), 0o600); err != nil {
		t.Fatal(err)
	}
	_ = extractTarData(tarPath, dest)
	if _, err := os.Stat(filepath.Join(dir, "pdd", "escaped")); err == nil {
		t.Fatal("a file was written outside the destination")
	}
}
