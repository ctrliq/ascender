package tasks

import (
	"bufio"
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// The transmit stream: the kwargs line, the zip's size, its base64 and
// the eof, as ansible-runner's Transmitter wrote them.
func TestTransmitWorker(t *testing.T) {
	var out bytes.Buffer
	zip := []byte("not really a zip")
	if err := transmitWorker(&out, map[string]any{"ident": 7}, bytes.NewReader(zip), int64(len(zip))); err != nil {
		t.Fatal(err)
	}
	br := bufio.NewReader(&out)
	line, _ := br.ReadString('\n')
	if line != `{"kwargs":{"ident":7}}`+"\n" {
		t.Errorf("kwargs line %q", line)
	}
	line, _ = br.ReadString('\n')
	if line != fmt.Sprintf("{\"zipfile\": %d}\n", len(zip)) {
		t.Errorf("zipfile line %q", line)
	}
	raw, err := readBase64(br, len(zip))
	if err != nil || !bytes.Equal(raw, zip) {
		t.Errorf("payload %q %v", raw, err)
	}
	if rest, _ := br.ReadString('\n'); rest != "{\"eof\": true}\n" {
		t.Errorf("eof line %q", rest)
	}
}

// A worker's process stream: status lines, events (kept as job_events
// files), keepalives, the artifacts and the eof.
func TestProcessWorkerStream(t *testing.T) {
	src := t.TempDir()
	if err := os.MkdirAll(filepath.Join(src, "fact_cache"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(src, "fact_cache", "web1"), []byte(`{"a": 1}`), 0o600); err != nil {
		t.Fatal(err)
	}
	var zipBuf bytes.Buffer
	if err := zipDir(src, &zipBuf); err != nil {
		t.Fatal(err)
	}
	var in bytes.Buffer
	in.WriteString(`{"status": "starting", "runner_ident": "7", "command": ["ansible-playbook"], "cwd": "/runner/project", "env": {}}` + "\n")
	in.WriteString(`{"event": "keepalive"}` + "\n")
	in.WriteString(`{"status": "running", "runner_ident": "7"}` + "\n")
	in.WriteString(`{"uuid": "u1", "counter": 1, "event": "playbook_on_start", "stdout": ""}` + "\n")
	in.WriteString(`{"uuid": "u2", "counter": 2, "event": "runner_on_ok", "stdout": "ok"}` + "\n")
	in.WriteString(`{"status": "successful", "runner_ident": "7", "rc": 0}` + "\n")
	in.WriteString(fmt.Sprintf("{\"zipfile\": %d}\n", zipBuf.Len()))
	in.WriteString(base64.StdEncoding.EncodeToString(zipBuf.Bytes()))
	in.WriteString(`{"eof": true}` + "\n")

	art := filepath.Join(t.TempDir(), "artifacts", "7")
	if err := os.MkdirAll(filepath.Join(art, "job_events"), 0o700); err != nil {
		t.Fatal(err)
	}
	var statuses []string
	var events []string
	res := processWorkerStream(&in, art, func(st map[string]any) { statuses = append(statuses, fmt.Sprint(st["status"])) },
		func(ev runnerEvent) { events = append(events, fmt.Sprint(ev["event"])) }, func(string, ...any) {})
	if !res.gotEOF || res.Status != "successful" || res.RC != 0 || !res.ArtifactsProcessed || res.events != 2 {
		t.Fatalf("result %+v", res)
	}
	if strings.Join(statuses, ",") != "starting,running,successful" || strings.Join(events, ",") != "playbook_on_start,runner_on_ok" {
		t.Errorf("statuses %v events %v", statuses, events)
	}
	if b, err := os.ReadFile(filepath.Join(art, "fact_cache", "web1")); err != nil || string(b) != `{"a": 1}` {
		t.Errorf("artifact %q %v", b, err)
	}
	if b, err := os.ReadFile(filepath.Join(art, "job_events", "2-u2.json")); err != nil || !json.Valid(b) {
		t.Errorf("job event file %q %v", b, err)
	}

	// A stream cut short has no eof; one with a bad line explains it.
	cut := processWorkerStream(strings.NewReader(`{"status": "running"}`+"\n"), art, nil, func(runnerEvent) {}, func(string, ...any) {})
	if cut.gotEOF || cut.Status != "running" {
		t.Errorf("cut stream %+v", cut)
	}
	bad := processWorkerStream(strings.NewReader("Traceback (most recent call last):\n"), art, nil, func(runnerEvent) {}, func(string, ...any) {})
	if bad.Status != "error" || !strings.HasPrefix(bad.Explanation, "Failed to JSON parse a line from worker stream.") {
		t.Errorf("bad stream %+v", bad)
	}
}

// Archived times are local wall-clock times, as zipfile wrote and read
// them, so a fact file keeps its time through a worker in the same zone.
func TestZipDirLocalTimes(t *testing.T) {
	src := t.TempDir()
	p := filepath.Join(src, "host_cache_summary.json")
	if err := os.WriteFile(p, []byte("{}"), 0o600); err != nil {
		t.Fatal(err)
	}
	when := time.Date(2026, 3, 4, 5, 6, 8, 0, time.Local)
	if err := os.Chtimes(p, when, when); err != nil {
		t.Fatal(err)
	}
	var buf bytes.Buffer
	if err := zipDir(src, &buf); err != nil {
		t.Fatal(err)
	}
	dst := t.TempDir()
	if err := unzipDir(buf.Bytes(), dst); err != nil {
		t.Fatal(err)
	}
	st, err := os.Stat(filepath.Join(dst, "host_cache_summary.json"))
	if err != nil {
		t.Fatal(err)
	}
	if !st.ModTime().Equal(when) {
		t.Errorf("mtime %v, want %v", st.ModTime(), when)
	}
	// The DOS fields hold the local time itself, not UTC.
	data := buf.Bytes()
	i := bytes.Index(data, []byte("PK\x03\x04"))
	dosTime := uint16(data[i+10]) | uint16(data[i+11])<<8
	if h := int(dosTime >> 11); h != when.Hour() {
		t.Errorf("DOS hour %d, want local %d", h, when.Hour())
	}
}

// readBase64 and unzipDir are the streaming helpers over byte slices, for
// the tests.
func readBase64(br *bufio.Reader, n int) ([]byte, error) {
	var b bytes.Buffer
	err := readBase64To(br, int64(n), &b)
	return b.Bytes(), err
}

func unzipDir(data []byte, target string) error {
	return unzipFrom(bytes.NewReader(data), int64(len(data)), target)
}
