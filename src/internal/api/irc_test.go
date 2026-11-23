package api

import (
	"bufio"
	"context"
	"net"
	"strings"
	"testing"
	"time"
)

// A lone \r in rendered job data does not end the PRIVMSG and start a
// command of its own: every line the bot sends is one IRC line.
func TestIRCMessageCannotInjectCommands(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()
	got := make(chan []string, 1)
	go func() {
		conn, err := ln.Accept()
		if err != nil {
			got <- nil
			return
		}
		defer conn.Close()
		_ = conn.SetDeadline(time.Now().Add(10 * time.Second))
		var lines []string
		sc := bufio.NewScanner(conn)
		// Split on CR as well as LF, as the servers that honour a lone
		// CR do.
		sc.Split(func(data []byte, atEOF bool) (int, []byte, error) {
			if i := strings.IndexAny(string(data), "\r\n"); i >= 0 {
				return i + 1, data[:i], nil
			}
			if atEOF && len(data) > 0 {
				return len(data), data, nil
			}
			return 0, nil, nil
		})
		for sc.Scan() {
			l := sc.Text()
			if l == "" {
				continue
			}
			lines = append(lines, l)
			switch {
			case strings.HasPrefix(l, "USER "):
				_, _ = conn.Write([]byte(":srv 001 zz-bot :welcome\r\n"))
			case strings.HasPrefix(l, "QUIT"):
				got <- lines
				return
			}
		}
		got <- lines
	}()
	host, port, _ := net.SplitHostPort(ln.Addr().String())
	conf := NewOMap().Set("server", host).Set("port", port).Set("nickname", "zz-bot")
	m := &outMessage{Subject: "Job #1 'zz\rKICK #ops victim' failed\r\nsecond line", To: []string{"zz-user"}}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if n, err := sendIRC(ctx, conf, m); err != nil || n != 1 {
		t.Fatalf("sendIRC = %d, %v", n, err)
	}
	lines := <-got
	var privmsg []string
	for _, l := range lines {
		cmd, _, _ := strings.Cut(l, " ")
		switch cmd {
		case "NICK", "USER", "QUIT":
		case "PRIVMSG":
			privmsg = append(privmsg, l)
		default:
			t.Errorf("injected command: %q", l)
		}
	}
	// str.splitlines() splits on the lone \r too: what follows it is
	// another PRIVMSG to the same target, never a command.
	want := []string{"PRIVMSG zz-user :Job #1 'zz", "PRIVMSG zz-user :KICK #ops victim' failed", "PRIVMSG zz-user :second line"}
	if strings.Join(privmsg, "|") != strings.Join(want, "|") {
		t.Errorf("PRIVMSG lines = %q, want %q", privmsg, want)
	}
}
