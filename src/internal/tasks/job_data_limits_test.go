package tasks

import (
	"archive/zip"
	"bufio"
	"bytes"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestReadLimitedLine(t *testing.T) {
	br := bufio.NewReaderSize(strings.NewReader("short\n"+strings.Repeat("x", 5000)+"\nlast"), 64)
	if l, err := readLimitedLine(br, 100); err != nil || string(l) != "short\n" {
		t.Fatalf("first line %q %v", l, err)
	}
	if _, err := readLimitedLine(br, 100); !errors.Is(err, errLineTooLong) {
		t.Fatalf("long line: %v", err)
	}
	br = bufio.NewReaderSize(strings.NewReader(strings.Repeat("y", 300)+"\n"), 16)
	if l, err := readLimitedLine(br, 1000); err != nil || len(l) != 301 {
		t.Fatalf("line across buffer fills: %d %v", len(l), err)
	}
}

// The artifacts archive is decoded as it arrives into a file, unpacked,
// and the file removed; whitespace in the base64 is skipped.
func TestReceiveArtifacts(t *testing.T) {
	var zbuf bytes.Buffer
	zw := zip.NewWriter(&zbuf)
	w, _ := zw.Create("fact_cache/host1")
	fmt.Fprint(w, `{"a": 1}`)
	zw.Close()
	b64 := base64.StdEncoding.EncodeToString(zbuf.Bytes())
	var wrapped strings.Builder
	for i := 0; i < len(b64); i += 76 {
		if i > 0 {
			wrapped.WriteString("\n")
		}
		wrapped.WriteString(b64[i:min(i+76, len(b64))])
	}
	base := t.TempDir()
	art := filepath.Join(base, "artifacts", "7")
	if err := os.MkdirAll(art, 0o700); err != nil {
		t.Fatal(err)
	}
	br := bufio.NewReader(strings.NewReader(wrapped.String() + `{"eof": true}` + "\n"))
	if err := receiveArtifacts(br, int64(zbuf.Len()), art); err != nil {
		t.Fatal(err)
	}
	if b, err := os.ReadFile(filepath.Join(art, "fact_cache", "host1")); err != nil || string(b) != `{"a": 1}` {
		t.Errorf("unpacked %q %v", b, err)
	}
	if rest, _ := br.ReadString('\n'); rest != `{"eof": true}`+"\n" {
		t.Errorf("stream after the archive: %q", rest)
	}
	left, _ := filepath.Glob(filepath.Join(base, "artifacts", ".artifacts-*"))
	if len(left) != 0 {
		t.Errorf("temporary files left: %v", left)
	}
	// The size the worker announced, short of what arrives, fails.
	if err := receiveArtifacts(bufio.NewReader(strings.NewReader(b64[:8])), int64(zbuf.Len()), art); err == nil {
		t.Error("a short archive was accepted")
	}
}

// An entry unpacks only up to the budget, however small the archive.
func TestUnzipEntryBudget(t *testing.T) {
	var zbuf bytes.Buffer
	zw := zip.NewWriter(&zbuf)
	w, _ := zw.Create("big")
	_, _ = io.Copy(w, io.LimitReader(zeros{}, 4<<20))
	zw.Close()
	zr, err := zip.NewReader(bytes.NewReader(zbuf.Bytes()), int64(zbuf.Len()))
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	root, err := os.OpenRoot(dir)
	if err != nil {
		t.Fatal(err)
	}
	defer root.Close()
	budget := int64(1 << 20)
	if err := unzipEntry(root, zr.File[0], &budget); err == nil {
		t.Error("an entry past the budget unpacked")
	}
	if _, err := os.Stat(filepath.Join(dir, "big")); err == nil {
		t.Error("the partial file was left")
	}
}

type zeros struct{}

func (zeros) Read(p []byte) (int, error) {
	clear(p)
	return len(p), nil
}

// The worker payload lives in a 0600 file beside the private data
// directory, can be read again from its start, holds the SSH key without
// leaving it in the directory, and is removed by close.
func TestWorkerPayloadFile(t *testing.T) {
	base := t.TempDir()
	pdd := filepath.Join(base, "awx_7_xyz")
	if err := os.MkdirAll(filepath.Join(pdd, "project"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(pdd, "project", "site.yml"), []byte("- hosts: all\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	p, err := workerPayload(pdd, "KEY")
	if err != nil {
		t.Fatal(err)
	}
	st, err := os.Stat(p.f.Name())
	if err != nil || st.Mode().Perm() != 0o600 || filepath.Dir(p.f.Name()) != base {
		t.Fatalf("payload file %s %v %v", p.f.Name(), st, err)
	}
	if _, err := os.Stat(filepath.Join(pdd, "env", "ssh_key")); err == nil {
		t.Error("the SSH key was left in the private data directory")
	}
	for range 2 {
		b, _ := io.ReadAll(p.reader())
		zr, err := zip.NewReader(bytes.NewReader(b), int64(len(b)))
		if err != nil || int64(len(b)) != p.size {
			t.Fatalf("payload: %v (%d of %d bytes)", err, len(b), p.size)
		}
		names := map[string]bool{}
		for _, f := range zr.File {
			names[f.Name] = true
		}
		if !names["project/site.yml"] || !names["env/ssh_key"] {
			t.Errorf("payload entries %v", names)
		}
	}
	name := p.f.Name()
	p.close()
	if _, err := os.Stat(name); err == nil {
		t.Error("the payload file was not removed")
	}
}

// Output that never reaches an event's end or a newline is let go past
// maxOutputBuffer.
func TestOutputFilterBufferIsBounded(t *testing.T) {
	var events int
	f := &outputEventFilter{emit: func(runnerEvent) { events++ }}
	chunk := strings.Repeat("x", 1<<20)
	for range 20 {
		f.write(chunk)
		if f.buffer.Len() > maxOutputBuffer {
			t.Fatalf("buffer at %d bytes", f.buffer.Len())
		}
	}
	if events == 0 {
		t.Error("nothing was emitted")
	}
}

// The bound holds for a command's output copied by exec (io.Copy would use
// a ReadFrom, had the buffer one, and go past it).
func TestLimitedBufferBoundsCommandOutput(t *testing.T) {
	out := &limitedBuffer{max: 1 << 20}
	cmd := exec.Command("sh", "-c", "head -c 20000000 /dev/zero")
	cmd.Stdout = out
	if err := cmd.Run(); err == nil {
		t.Error("20 MB of output went through a 1 MiB buffer")
	}
	if n := len(out.Bytes()); n > 1<<20 {
		t.Errorf("buffer holds %d bytes", n)
	}
}
