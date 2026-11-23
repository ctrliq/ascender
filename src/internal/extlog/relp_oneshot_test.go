package extlog

import (
	"bufio"
	"net"
	"strconv"
	"strings"
	"testing"
	"time"
)

// The RELP output bounds the length a server answers with instead of
// allocating it.
func TestSendRELPBoundsAnswer(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()
	go func() {
		conn, err := ln.Accept()
		if err != nil {
			return
		}
		defer conn.Close()
		_ = conn.SetDeadline(time.Now().Add(10 * time.Second))
		r := bufio.NewReader(conn)
		for {
			line, err := r.ReadString('\n')
			if err != nil {
				return
			}
			txnr, _, _ := strings.Cut(line, " ")
			_, _ = conn.Write([]byte(txnr + " rsp 999999999999 200 OK\n"))
		}
	}()
	host, port, _ := net.SplitHostPort(ln.Addr().String())
	p, _ := strconv.ParseInt(port, 10, 64)
	if err := sendOnce(Config{Protocol: "relp", Host: host, Port: p, Timeout: 10 * time.Second}, "zz test"); err == nil {
		t.Fatal("an answer of 999999999999 bytes was accepted")
	}
}
