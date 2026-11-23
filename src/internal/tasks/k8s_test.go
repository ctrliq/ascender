package tasks

import (
	"bufio"
	"io"
	"net"
	"testing"
	"time"
)

// serverFrame is an unmasked server frame on the given channel.
func serverFrame(ch byte, data []byte) []byte {
	payload := append([]byte{ch}, data...)
	hdr := []byte{0x82}
	if len(payload) < 126 {
		hdr = append(hdr, byte(len(payload)))
	} else {
		hdr = append(hdr, 126, byte(len(payload)>>8), byte(len(payload)))
	}
	return append(hdr, payload...)
}

// Close must return while readLoop is blocked writing stdout that nobody
// reads (the worker stream reader gave up on a bad line): it used to wait
// on readLoop forever, leaving the job running and its pod in place.
func TestKubeStreamCloseWithBlockedReader(t *testing.T) {
	client, server := net.Pipe()
	pr, pw := io.Pipe()
	s := &kubeStream{conn: client, br: bufio.NewReader(client), stdout: pw, Stdout: pr, done: make(chan struct{})}
	go s.readLoop()
	go func() {
		_, _ = server.Write(serverFrame(2, []byte("some stderr")))
		// Nobody reads this one: readLoop blocks in the pipe write.
		_, _ = server.Write(serverFrame(1, []byte("stdout line\n")))
		_, _ = io.Copy(io.Discard, server)
	}()
	// Let readLoop take both frames.
	deadline := time.Now().Add(2 * time.Second)
	for s.Stderr() == "" && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
	time.Sleep(50 * time.Millisecond)
	closed := make(chan struct{})
	go func() {
		s.Close()
		s.Close() // a second Close (the deferred one) returns too
		close(closed)
	}()
	select {
	case <-closed:
	case <-time.After(5 * time.Second):
		t.Fatal("Close hung on a blocked stdout write")
	}
	if got := s.Stderr(); got != "some stderr" {
		t.Errorf("stderr %q", got)
	}
	server.Close()
}
