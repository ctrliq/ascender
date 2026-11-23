package api

import (
	"bufio"
	"net"
	"strings"
	"testing"
)

// maskedFrame is a client frame (masked, as clients must send).
func maskedFrame(op byte, fin bool, payload []byte) []byte {
	b0 := op
	if fin {
		b0 |= 0x80
	}
	var hdr []byte
	switch n := len(payload); {
	case n < 126:
		hdr = []byte{b0, 0x80 | byte(n)}
	default:
		hdr = []byte{b0, 0x80 | 126, byte(n >> 8), byte(n)}
	}
	mask := []byte{1, 2, 3, 4}
	out := append(hdr, mask...)
	for i, c := range payload {
		out = append(out, c^mask[i%4])
	}
	return out
}

func pipeConn(t *testing.T) (*wsConn, net.Conn) {
	t.Helper()
	server, client := net.Pipe()
	t.Cleanup(func() { server.Close(); client.Close() })
	return &wsConn{c: server, br: bufio.NewReader(server), send: make(chan []byte, 512), done: make(chan struct{}), recorded: map[string]bool{}}, client
}

func TestWebsocketRefusesOversizedControlFrames(t *testing.T) {
	for name, frame := range map[string][]byte{
		"ping of 126 bytes":  maskedFrame(0x9, true, []byte(strings.Repeat("x", 126))),
		"fragmented ping":    maskedFrame(0x9, false, []byte("x")),
		"close of 200 bytes": maskedFrame(0x8, true, []byte(strings.Repeat("x", 200))),
	} {
		conn, client := pipeConn(t)
		go func() { _, _ = client.Write(frame) }()
		if _, _, err := conn.readMessage(); err == nil || !strings.Contains(err.Error(), "control frame") {
			t.Errorf("%s: readMessage = %v", name, err)
		}
	}
	// A small ping is answered, and the message after it read.
	conn, client := pipeConn(t)
	go func() {
		_, _ = client.Write(maskedFrame(0x9, true, []byte("hi")))
		_, _ = client.Write(maskedFrame(0x1, true, []byte(`{"a":1}`)))
	}()
	if op, msg, err := conn.readMessage(); err != nil || op != 0x1 || string(msg) != `{"a":1}` {
		t.Errorf("after a ping: %v %q %v", op, msg, err)
	}
	if len(conn.send) != 1 {
		t.Errorf("pong not queued: %d frames", len(conn.send))
	}
}

// A client that stops reading is dropped once its queue holds wsMaxQueued
// bytes, not 512 frames of any size.
func TestWebsocketQueueIsBoundedInBytes(t *testing.T) {
	conn, _ := pipeConn(t)
	big := make([]byte, 1<<20)
	queued := 0
	for i := 0; i < 20; i++ {
		if !conn.sendText(big) {
			break
		}
		queued++
	}
	if queued == 0 || queued > wsMaxQueued/(1<<20) {
		t.Errorf("queued %d one-MiB frames", queued)
	}
	select {
	case <-conn.done:
	default:
		t.Error("the connection was not closed")
	}
}

func TestWebsocketPerUserLimit(t *testing.T) {
	h := &wsHub{groups: map[string]map[*wsConn]struct{}{}}
	for i := 0; i < wsMaxPerUser; i++ {
		if !h.openFor(7) {
			t.Fatalf("socket %d refused", i)
		}
	}
	if h.openFor(7) {
		t.Error("one socket too many accepted")
	}
	if !h.openFor(8) {
		t.Error("another user refused")
	}
	h.closedFor(7)
	if !h.openFor(7) {
		t.Error("refused after a socket closed")
	}
}
