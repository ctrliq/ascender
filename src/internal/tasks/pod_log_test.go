package tasks

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"
)

// fakeLogAPI serves a pod and its timestamped log the way the kubelet
// does: from sinceTime's second on, and a first followed connection that
// drops after three lines.
type fakeLogAPI struct {
	mu       sync.Mutex
	phase    string
	requests []string
	lines    []string // "RFC3339Nano body"
}

func (f *fakeLogAPI) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if !strings.HasSuffix(r.URL.Path, "/log") {
		fmt.Fprintf(w, `{"metadata": {"name": "p", "namespace": "ns"}, "spec": {"containers": [{"name": "worker"}]}, "status": {"phase": %q}}`, f.phase)
		return
	}
	q := r.URL.Query()
	f.requests = append(f.requests, q.Encode())
	var since time.Time
	if s := q.Get("sinceTime"); s != "" {
		since, _ = time.Parse(time.RFC3339, s)
	}
	var out []string
	for _, l := range f.lines {
		ts, _ := time.Parse(time.RFC3339Nano, strings.SplitN(l, " ", 2)[0])
		if !since.IsZero() && ts.Before(since) {
			continue
		}
		out = append(out, l)
	}
	if len(f.requests) == 1 {
		// The first connection drops after three lines.
		body := strings.Join(out[:3], "")
		w.Header().Set("Content-Length", "100000")
		w.WriteHeader(200)
		io.WriteString(w, body)
		w.(http.Flusher).Flush()
		conn, _, _ := w.(http.Hijacker).Hijack()
		conn.Close()
		return
	}
	if len(f.requests) == 2 {
		// The second ends cleanly as the container exits.
		out = out[:len(out)-1]
		f.phase = "Succeeded"
	}
	io.WriteString(w, strings.Join(out, ""))
}

// The pod log reader serves every line once across a dropped connection,
// a clean end and the final pass, with timestamps stripped, lines that
// share a timestamp told apart by count, and blank lines skipped.
func TestPodLogReaderReconnects(t *testing.T) {
	f := &fakeLogAPI{phase: "Running", lines: []string{
		"2026-11-15T05:00:00.1Z a\n",
		"2026-11-15T05:00:01.000000000Z b\n",
		"2026-11-15T05:00:01.000000000Z c\n",
		"2026-11-15T05:00:01.5Z d\n",
		"2026-11-15T05:00:01.6Z    \n",
		"2026-11-15T06:00:02.25+01:00 e\n",
	}}
	srv := httptest.NewServer(f)
	defer srv.Close()
	u, _ := url.Parse(srv.URL)
	kube := &kubeClient{host: u, token: "t", http: &http.Client{Transport: http.DefaultTransport}}
	src := &podSource{kube: kube, jobID: 1, name: "p", ns: "ns"}
	r := &podLogReader{src: src, ctx: context.Background(), follow: true, idle: 5 * time.Second}
	if _, err := src.refresh(r.ctx); err != nil {
		t.Fatal(err)
	}
	if err := r.openStream(""); err != nil {
		t.Fatal(err)
	}
	b, err := io.ReadAll(r)
	if err != nil {
		t.Fatal(err)
	}
	if string(b) != "a\nb\nc\nd\ne\n" {
		t.Errorf("read %q", b)
	}
	if len(f.requests) != 3 {
		t.Fatalf("requests %v", f.requests)
	}
	for i, want := range []string{"follow=true", "follow=true", "follow=false"} {
		if !strings.Contains(f.requests[i], want) {
			t.Errorf("request %d %q lacks %s", i, f.requests[i], want)
		}
	}
	if !strings.Contains(f.requests[1], "sinceTime=2026-11-15T05%3A00%3A01Z") || !strings.Contains(f.requests[2], "sinceTime=2026-11-15T05%3A00%3A01Z") {
		t.Errorf("reconnects did not resume from the last second: %v", f.requests)
	}
}

func TestKubePodStatus(t *testing.T) {
	code := 3
	p := &kubePod{}
	p.Spec.Containers = []struct {
		Name string `json:"name"`
	}{{Name: "sidecar"}, {Name: "worker"}}
	if p.containerName() != "worker" {
		t.Error("worker container not chosen")
	}
	p.Status.Phase = "Failed"
	if p.exitCode() != 1 {
		t.Error("a failed pod without a container state exits 1")
	}
	p.Status.ContainerStatuses = append(p.Status.ContainerStatuses, struct {
		Name  string `json:"name"`
		State struct {
			Running *struct {
				StartedAt time.Time `json:"startedAt"`
			} `json:"running"`
			Terminated *struct {
				ExitCode *int `json:"exitCode"`
			} `json:"terminated"`
		} `json:"state"`
	}{Name: "worker"})
	p.Status.ContainerStatuses[0].State.Terminated = &struct {
		ExitCode *int `json:"exitCode"`
	}{ExitCode: &code}
	if !p.terminated() || p.exitCode() != 3 {
		t.Errorf("terminated %v exit %d", p.terminated(), p.exitCode())
	}
}

// A line longer than the limit ends the read with errLineTooLong rather
// than counting as a dropped connection: a reconnect would download the
// same line again, for as long as the pod runs.
func TestPodLogReaderLineTooLong(t *testing.T) {
	var mu sync.Mutex
	logRequests := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasSuffix(r.URL.Path, "/log") {
			io.WriteString(w, `{"metadata": {"name": "p", "namespace": "ns"}, "spec": {"containers": [{"name": "worker"}]}, "status": {"phase": "Running"}}`)
			return
		}
		mu.Lock()
		logRequests++
		mu.Unlock()
		io.WriteString(w, "2026-11-15T05:00:00.1Z a\n2026-11-15T05:00:00.2Z "+strings.Repeat("x", 4096)+"\n")
	}))
	defer srv.Close()
	u, _ := url.Parse(srv.URL)
	kube := &kubeClient{host: u, token: "t", http: &http.Client{Transport: http.DefaultTransport}}
	src := &podSource{kube: kube, jobID: 1, name: "p", ns: "ns"}
	r := &podLogReader{src: src, ctx: context.Background(), follow: true, idle: 5 * time.Second, lineLimit: 1024}
	if _, err := src.refresh(r.ctx); err != nil {
		t.Fatal(err)
	}
	if err := r.openStream(""); err != nil {
		t.Fatal(err)
	}
	done := make(chan error, 1)
	go func() {
		_, err := io.ReadAll(r)
		done <- err
	}()
	select {
	case err := <-done:
		if !errors.Is(err, errLineTooLong) || !errors.Is(err, errPodLogIncomplete) {
			t.Errorf("read ended with %v", err)
		}
	case <-time.After(10 * time.Second):
		t.Fatal("the reader kept reconnecting over the long line")
	}
	mu.Lock()
	defer mu.Unlock()
	if logRequests != 1 {
		t.Errorf("log requested %d times", logRequests)
	}
}
