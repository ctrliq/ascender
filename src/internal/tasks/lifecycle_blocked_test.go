package tasks

import (
	"bufio"
	"fmt"
	"net"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/ctrliq/ascender/internal/api"
	"github.com/ctrliq/ascender/internal/extlog"
)

// Every blocked pending task gets the task manager's blocked lifecycle
// record, whatever its age: "<type>-<id> blocked by <type>-<id>" with
// blocked_by in the data.
func TestLogBlocked(t *testing.T) {
	b := newBlockRig(t)
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()
	var mu sync.Mutex
	var lines []string
	go func() {
		for {
			conn, err := ln.Accept()
			if err != nil {
				return
			}
			go func() {
				sc := bufio.NewScanner(conn)
				for sc.Scan() {
					mu.Lock()
					lines = append(lines, sc.Text())
					mu.Unlock()
				}
			}()
		}
	}()
	sh := extlog.NewShipper("zz-test")
	extlog.SetDefault(sh)
	defer func() { extlog.SetDefault(nil); sh.Close() }()
	sh.Apply([]extlog.Destination{{Name: "default", SpoolDir: t.TempDir(), Queue: extlog.QueueLimits{Size: 100, DiscardSeverity: 8},
		Config: extlog.Config{Enabled: true, Protocol: "tcp", Host: "127.0.0.1", Port: int64(ln.Addr().(*net.TCPAddr).Port), Loggers: []string{"job_lifecycle"}, Level: "INFO", Timeout: time.Second}}})

	jt := b.jobTemplate()
	running := b.task("main.job", "running", "manual", time.Hour, jt, map[string]any{"job_template_id": jt})
	young := b.task("main.job", "pending", "manual", time.Second, jt, map[string]any{"job_template_id": jt})
	free := b.task("main.systemjob", "pending", "manual", time.Second, 0, nil)
	b.d[0].API = &api.Server{DB: b.db, CT: b.ct}
	b.d[0].logBlocked(b.ctx)
	want := fmt.Sprintf("job-%d blocked by job-%d", young, running)
	deadline := time.Now().Add(5 * time.Second)
	for {
		mu.Lock()
		got := strings.Join(lines, "\n")
		mu.Unlock()
		if strings.Contains(got, want) {
			if !strings.Contains(got, fmt.Sprintf(`"blocked_by": "job-%d"`, running)) || strings.Contains(got, fmt.Sprintf("systemjob-%d", free)) {
				t.Errorf("records: %s", got)
			}
			return
		}
		if time.Now().After(deadline) {
			t.Fatalf("no %q in %s", want, got)
		}
		time.Sleep(10 * time.Millisecond)
	}
}
