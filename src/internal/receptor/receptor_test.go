package receptor

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestReadConfig(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "receptor.conf")
	conf := `---
- node:
    id: zz-node
- control-service:
    service: control
    filename: /var/run/receptor/receptor.sock
- work-signing:
    privatekey: /etc/receptor/work_private_key.pem
    tokenexpiration: 1m
- tls-client:
    name: tlsclient
    cert: /etc/receptor/tls/receptor.crt
- tls-client:
    name: second
`
	if err := os.WriteFile(path, []byte(conf), 0o600); err != nil {
		t.Fatal(err)
	}
	cfg, err := ReadConfig(path, "")
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Socket != "/var/run/receptor/receptor.sock" || cfg.TLSClient != "tlsclient" || !cfg.WorkSigning {
		t.Errorf("config %+v", cfg)
	}
	if cfg, _ := ReadConfig(path, "/run/other.sock"); cfg.Socket != "/run/other.sock" {
		t.Errorf("override %q", cfg.Socket)
	}
	if err := os.WriteFile(path, []byte("- node:\n    id: x\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := ReadConfig(path, ""); err == nil || !strings.Contains(err.Error(), "does not have control-service entry") {
		t.Errorf("missing control service: %v", err)
	}
}

// fakeReceptor serves receptor's control protocol for one work unit.
type fakeReceptor struct {
	mu        sync.Mutex
	submitted map[string]string
	payload   string
	released  []string
	canceled  []string
}

func (f *fakeReceptor) serve(t *testing.T, ln net.Listener) {
	for {
		c, err := ln.Accept()
		if err != nil {
			return
		}
		go f.handle(t, c)
	}
}

func (f *fakeReceptor) handle(t *testing.T, c net.Conn) {
	defer c.Close()
	r := bufio.NewReader(c)
	fmt.Fprint(c, "Receptor Control, node fake\n")
	line, err := r.ReadString('\n')
	if err != nil {
		return
	}
	line = strings.TrimSpace(line)
	f.mu.Lock()
	defer f.mu.Unlock()
	switch {
	case strings.HasPrefix(line, "{"):
		var cmd map[string]string
		if json.Unmarshal([]byte(line), &cmd) != nil || cmd["subcommand"] != "submit" {
			fmt.Fprint(c, "ERROR: bad command\n")
			return
		}
		if cmd["worktype"] == "unknown" {
			fmt.Fprint(c, "ERROR: unknown work type\n")
			return
		}
		f.submitted = cmd
		fmt.Fprint(c, "Work unit created with ID abc123. Send stdin data and EOF.\n")
		f.mu.Unlock()
		b, _ := io.ReadAll(r)
		f.mu.Lock()
		f.payload = string(b)
		fmt.Fprint(c, `{"result": "Job Started", "unitid": "abc123"}`+"\n")
	case line == "status":
		fmt.Fprint(c, `{"NodeID": "fake", "Advertisements": [{"NodeID": "exec1", "ConnType": 2, "WorkCommands": [{"WorkType": "ansible-runner", "Secure": true}]}]}`+"\n")
	case strings.HasPrefix(line, "work results abc123 "):
		fmt.Fprint(c, "Streaming results for work unit abc123\n")
		pos := strings.TrimPrefix(line, "work results abc123 ")
		fmt.Fprintf(c, "output from %s\n", pos)
	case line == "work status abc123":
		fmt.Fprint(c, `{"State": 3, "StateName": "Failed", "Detail": "exit status 1", "StdoutSize": 42}`+"\n")
	case line == "work release abc123":
		f.released = append(f.released, "abc123")
		fmt.Fprint(c, `{"released": "abc123"}`+"\n")
	case line == "work cancel abc123":
		f.canceled = append(f.canceled, "abc123")
		fmt.Fprint(c, `{"cancelled": "abc123"}`+"\n")
	case line == "work status nope":
		fmt.Fprint(c, "ERROR: unknown work unit nope\n")
	default:
		fmt.Fprint(c, "ERROR: unexpected "+line+"\n")
	}
}

func TestControlProtocol(t *testing.T) {
	sock := filepath.Join(t.TempDir(), "r.sock")
	ln, err := net.Listen("unix", sock)
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()
	f := &fakeReceptor{}
	go f.serve(t, ln)
	cfg := &Config{Socket: sock, TLSClient: "tlsclient", WorkSigning: true}

	ad, err := cfg.FindNode(context.Background(), "exec1", nil)
	if err != nil || ad.ConnType != ConnStreamTLS || ad.WorkCommands[0].WorkType != "ansible-runner" {
		t.Fatalf("find node %+v %v", ad, err)
	}
	unit, err := cfg.SubmitWork(SubmitOptions{WorkType: "ansible-runner", Node: "exec1", TLSClient: "tlsclient", SignWork: true,
		Params: map[string]string{"params": "--private-data-dir=/tmp/x --delete"}}, strings.NewReader("payload bytes"))
	if err != nil || unit != "abc123" {
		t.Fatalf("submit %q %v", unit, err)
	}
	f.mu.Lock()
	want := map[string]string{"command": "work", "subcommand": "submit", "node": "exec1", "worktype": "ansible-runner", "tlsclient": "tlsclient", "signwork": "true", "params": "--private-data-dir=/tmp/x --delete"}
	for k, v := range want {
		if f.submitted[k] != v {
			t.Errorf("submit %s = %q, want %q", k, f.submitted[k], v)
		}
	}
	if f.payload != "payload bytes" {
		t.Errorf("payload %q", f.payload)
	}
	f.mu.Unlock()
	if _, err := cfg.SubmitWork(SubmitOptions{WorkType: "x", Params: map[string]string{"node": "y"}}, nil); err == nil || !strings.Contains(err.Error(), "Duplicate or illegal parameter node") {
		t.Errorf("duplicate param: %v", err)
	}
	if _, err := cfg.SubmitWork(SubmitOptions{WorkType: "unknown"}, nil); err == nil || err.Error() != "Failed to start work unit: unknown work type" {
		t.Errorf("refused submit: %v", err)
	}

	rs, err := cfg.Results("abc123", 7)
	if err != nil {
		t.Fatal(err)
	}
	b, _ := io.ReadAll(rs)
	rs.Close()
	if string(b) != "output from 7\n" {
		t.Errorf("results %q", b)
	}
	ws, err := cfg.WorkStatus("abc123")
	if err != nil || ws.StateName != "Failed" || ws.Detail != "exit status 1" || ws.StdoutSize != 42 {
		t.Errorf("status %+v %v", ws, err)
	}
	if _, err := cfg.WorkStatus("nope"); err == nil || !strings.HasPrefix(err.Error(), "unknown work unit") {
		t.Errorf("unknown unit: %v", err)
	}
	if err := cfg.Cancel("abc123"); err != nil {
		t.Error(err)
	}
	if err := cfg.Release("abc123"); err != nil {
		t.Error(err)
	}
	f.mu.Lock()
	if len(f.canceled) != 1 || len(f.released) != 1 {
		t.Errorf("cancel %v release %v", f.canceled, f.released)
	}
	f.mu.Unlock()

	attempts, backoff := findNodeAttempts, findNodeBackoff
	findNodeAttempts, findNodeBackoff = 2, time.Millisecond
	defer func() { findNodeAttempts, findNodeBackoff = attempts, backoff }()
	var logged []string
	var nf *NodeNotFound
	if _, err := cfg.FindNode(context.Background(), "missing", func(s string) { logged = append(logged, s) }); !errors.As(err, &nf) || err.Error() != "Instance missing is not in the receptor mesh" {
		t.Errorf("missing node: %v", err)
	}
	if len(logged) != 2 || logged[0] != "Instance missing is not in the receptor mesh. 2 attempts left." {
		t.Errorf("logged %q", logged)
	}
}

// A receptor that accepts but never answers fails a control command at
// its deadline instead of holding up the heartbeat for ever; FindNode's
// waits end with their context.
func TestControlDeadlines(t *testing.T) {
	sock := filepath.Join(t.TempDir(), "wedged.sock")
	ln, err := net.Listen("unix", sock)
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()
	var held []net.Conn
	var mu sync.Mutex
	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			mu.Lock()
			held = append(held, c)
			mu.Unlock()
		}
	}()
	defer func() {
		mu.Lock()
		for _, c := range held {
			c.Close()
		}
		mu.Unlock()
	}()
	saved := controlTimeout
	controlTimeout = 100 * time.Millisecond
	defer func() { controlTimeout = saved }()
	cfg := &Config{Socket: sock}
	start := time.Now()
	if _, err := cfg.Status(); err == nil {
		t.Fatal("status from a wedged receptor")
	}
	if took := time.Since(start); took > 2*time.Second {
		t.Errorf("status took %v", took)
	}

	// A mesh without the node: FindNode backs off, until canceled.
	f := &fakeReceptor{submitted: map[string]string{}}
	good := filepath.Join(t.TempDir(), "r.sock")
	gl, err := net.Listen("unix", good)
	if err != nil {
		t.Fatal(err)
	}
	defer gl.Close()
	go f.serve(t, gl)
	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()
	start = time.Now()
	if _, err := (&Config{Socket: good}).FindNode(ctx, "missing", nil); !errors.Is(err, context.DeadlineExceeded) {
		t.Errorf("find node: %v", err)
	}
	if took := time.Since(start); took > 2*time.Second {
		t.Errorf("find node took %v", took)
	}
}
