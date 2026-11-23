package extlog

import (
	"bufio"
	"context"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"strings"
	"testing"
	"time"
)

func testRecord() Record {
	return Record{Time: time.Date(2026, 11, 14, 8, 30, 1, 123456789, time.UTC), Logger: "ascender", Level: "ERROR", Message: "Ascender Connection Test Message",
		Extra: []Field{{"stack_info", nil}, {"taskName", nil}, {"guid", "abc"}}}
}

func TestFormat(t *testing.T) {
	host, _ := os.Hostname()
	c := Config{ClusterHostID: "node1", InstallUUID: "u-1", URLBase: "https://ascender.example.com"}
	got := string(c.Format(testRecord()))
	want := `{"@timestamp": "2026-11-14T08:30:01.123Z", "message": "Ascender Connection Test Message", "host": "` + host + `", "level": "ERROR", "logger_name": "ascender", "stack_info": null, "taskName": null, "guid": "abc", "cluster_host_id": "node1", "tower_uuid": "u-1", "tower_url": "https://ascender.example.com"}` + "\n"
	if got != want {
		t.Fatalf("got  %s\nwant %s", got, want)
	}
	c.Type = "splunk"
	got = string(c.Format(testRecord()))
	if !strings.HasPrefix(got, `{"time": 1794645001.123`) || !strings.Contains(got, `, "event": {"@timestamp": "2026-11-14T08:30:01.123Z"`) {
		t.Fatalf("splunk: %s", got)
	}
	rec := testRecord()
	rec.Logger = "ascender.analytics.activity_stream"
	got = string(Config{}.Format(rec))
	if !strings.Contains(got, `"guid": "abc", "changes": {}, "cluster_host_id"`) {
		t.Fatalf("activity_stream: %s", got)
	}
	rec.Logger = "ascender.analytics.job_events"
	got = string(Config{}.Format(rec))
	if !strings.Contains(got, `"logger_name": "ascender.analytics.job_events", "cluster_host_id": ""`) {
		t.Fatalf("job_events: %s", got)
	}
	rec.Message = "café"
	if got = string(Config{}.Format(rec)); !strings.Contains(got, "\"message\": \"caf\\u00e9\"") {
		t.Fatalf("ascii: %s", got)
	}
}

func TestAllowedAndLoggerName(t *testing.T) {
	c := Config{Enabled: true, Loggers: []string{"awx", "activity_stream"}, Level: "INFO"}
	for _, x := range []struct {
		logger, level string
		want          bool
	}{
		{"ascender", "ERROR", true}, {"ascender.main.tasks", "INFO", true}, {"ascender", "DEBUG", false},
		{"ascender.analytics.activity_stream", "INFO", true}, {"ascender.analytics.job_events", "INFO", false},
	} {
		if got := c.Allowed(Record{Logger: x.logger, Level: x.level}); got != x.want {
			t.Errorf("%s %s: got %v", x.logger, x.level, got)
		}
	}
	if got := TestLoggerName([]string{"job_events"}); got != "ascender.analytics.job_events" {
		t.Error(got)
	}
	if got := TestLoggerName([]string{"awx"}); got != "ascender" {
		t.Error(got)
	}
	if got := TestLoggerName(nil); got != "ascender" {
		t.Error(got)
	}
}

// sendOnce sends one record through the output the configuration gets.
func sendOnce(c Config, msg string) error {
	d := Destination{Config: c}
	sk, err := newSink(d.transport(), c, nolog)
	if err != nil {
		return err
	}
	defer sk.close()
	return sk.send(context.Background(), []byte(msg))
}

func TestSendTCPUDP(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()
	got := make(chan string, 1)
	go func() {
		conn, err := ln.Accept()
		if err != nil {
			return
		}
		line, _ := bufio.NewReader(conn).ReadString('\n')
		got <- line
		conn.Close()
	}()
	port, _ := strconv.ParseInt(strings.Split(ln.Addr().String(), ":")[1], 10, 64)
	c := Config{Protocol: "tcp", Host: "127.0.0.1", Port: port}
	if err := sendOnce(c, "{\"a\": 1}"); err != nil {
		t.Fatal(err)
	}
	if line := <-got; line != "{\"a\": 1}\n" {
		t.Fatalf("tcp: %q", line)
	}

	pc, err := net.ListenPacket("udp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer pc.Close()
	uport, _ := strconv.ParseInt(strings.Split(pc.LocalAddr().String(), ":")[1], 10, 64)
	c = Config{Protocol: "udp", Host: "127.0.0.1", Port: uport}
	if err := sendOnce(c, "{\"b\": 2}"); err != nil {
		t.Fatal(err)
	}
	buf := make([]byte, 100)
	pc.SetDeadline(time.Now().Add(2 * time.Second))
	n, _, err := pc.ReadFrom(buf)
	if err != nil || string(buf[:n]) != "{\"b\": 2}" {
		t.Fatalf("udp: %q %v", buf[:n], err)
	}
}

func TestSendHTTP(t *testing.T) {
	var auth, body, path, ctype string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		auth, path, ctype = r.Header.Get("Authorization"), r.URL.RequestURI(), r.Header.Get("Content-Type")
		b, _ := io.ReadAll(r.Body)
		body = string(b)
	}))
	defer srv.Close()
	c := Config{Protocol: "https", Host: srv.URL + "/services/collector/event?x=1", Type: "splunk", Password: "tok"}
	if err := sendOnce(c, "{\"c\": 3}"); err != nil {
		t.Fatal(err)
	}
	if auth != "Splunk tok" || body != `{"c": 3}` || path != "/services/collector/event?x=1" || ctype != "application/json; charset=utf-8" {
		t.Fatalf("got %q %q %q %q", auth, body, path, ctype)
	}
	c = Config{Protocol: "https", Host: srv.URL, Type: "logstash", Username: "u", Password: "p"}
	if err := sendOnce(c, "{}"); err != nil {
		t.Fatal(err)
	}
	if auth != "Basic dTpw" {
		t.Fatalf("basic: %q", auth)
	}
	// Splunk with a username: omhttp's uid and pwd, which curl sends as
	// basic authentication unless the Splunk header (a password) replaces
	// it; ledger never sends them.
	for _, tc := range []struct {
		c    Config
		want string
	}{
		{Config{Type: "splunk", Username: "u"}, "Basic dTo="},
		{Config{Type: "splunk", Username: "u", Password: "tok"}, "Splunk tok"},
		{Config{Type: "ledger", Username: "u"}, ""},
		{Config{Type: "ledger", Username: "u", Password: "tok"}, "Ledger tok"},
		{Config{Type: "other", Username: "u"}, "Basic dTo="},
		{Config{Type: "other", Password: "p"}, ""},
	} {
		tc.c.Protocol, tc.c.Host = "https", srv.URL
		auth = "unset"
		if err := sendOnce(tc.c, "{}"); err != nil {
			t.Fatal(err)
		}
		if auth != tc.want {
			t.Errorf("%s %q/%q: Authorization %q, want %q", tc.c.Type, tc.c.Username, tc.c.Password, auth, tc.want)
		}
	}
	// A host without a scheme is https on the given port.
	u, err := Config{Host: "logs.example.com", Port: 8443}.HTTPTarget()
	if err != nil || u.String() != "https://logs.example.com:8443" {
		t.Fatalf("%v %v", u, err)
	}
	u, _ = Config{Host: "http://logs.example.com/path"}.HTTPTarget()
	if u.String() != "http://logs.example.com:80/path" {
		t.Fatal(u.String())
	}
}

func TestSendRELP(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()
	got := make(chan string, 1)
	go func() {
		conn, err := ln.Accept()
		if err != nil {
			return
		}
		defer conn.Close()
		r := bufio.NewReader(conn)
		readFrame := func() (string, string, string) {
			txnr, _ := r.ReadString(' ')
			cmd, _ := r.ReadString(' ')
			ls, _ := r.ReadString(' ')
			ls = strings.TrimSpace(ls)
			n, _ := strconv.Atoi(ls)
			data := make([]byte, n+1)
			io.ReadFull(r, data)
			return strings.TrimSpace(txnr), strings.TrimSpace(cmd), strings.TrimSuffix(string(data), "\n")
		}
		tx, cmd, _ := readFrame()
		if cmd != "open" {
			return
		}
		conn.Write([]byte(tx + " rsp 6 200 OK\n"))
		tx, cmd, data := readFrame()
		if cmd == "syslog" {
			got <- data
		}
		conn.Write([]byte(tx + " rsp 6 200 OK\n"))
	}()
	port, _ := strconv.ParseInt(strings.Split(ln.Addr().String(), ":")[1], 10, 64)
	c := Config{Protocol: "relp", Host: "127.0.0.1", Port: port}
	if err := sendOnce(c, "{\"d\": 4}"); err != nil {
		t.Fatal(err)
	}
	if d := <-got; d != `{"d": 4}` {
		t.Fatalf("relp: %q", d)
	}
}

// A RELP answer's length comes from the server: out-of-range lengths are
// errors, not a panic or a huge allocation.
func TestReadRELPAnswerBounds(t *testing.T) {
	for _, tc := range []struct {
		in, err string
	}{
		{"1 rsp 6 200 OK\n", ""},
		{"1 rsp 8 500 nope\n", "relp: 500 nope"},
		{"1 rsp -5 200 OK\n", "relp: answer length -5 out of range"},
		{"1 rsp 999999999 200 OK\n", "relp: answer length 999999999 out of range"},
		{"2 rsp 6 200 OK\n", `relp: unexpected transaction "2"`},
		{"1 rsp " + strings.Repeat("9", 100) + " 200 OK\n", "relp: header field too long"},
	} {
		err := readRELPAnswer(bufio.NewReader(strings.NewReader(tc.in)), 1)
		switch {
		case tc.err == "" && err != nil:
			t.Errorf("%q: %v", tc.in, err)
		case tc.err != "" && (err == nil || !strings.HasPrefix(err.Error(), tc.err)):
			t.Errorf("%q: got %v, want %s", tc.in, err, tc.err)
		}
	}
}
