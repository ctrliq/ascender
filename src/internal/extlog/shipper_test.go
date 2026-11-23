package extlog

import (
	"bufio"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"
)

func testDest(dir string, cfg Config) Destination {
	cfg.Enabled = true
	if cfg.Loggers == nil {
		cfg.Loggers = []string{"ascender", "activity_stream", "job_events", "system_tracking", "job_lifecycle"}
	}
	if cfg.Level == "" {
		cfg.Level = "INFO"
	}
	cfg.Timeout = 100 * time.Millisecond
	cfg.ClusterHostID, cfg.InstallUUID, cfg.URLBase = "node1", "uuid-1", "https://towerhost"
	return Destination{Name: "default", Config: cfg, Queue: QueueLimits{Size: 100, DiscardSeverity: 5, MaxDiskBytes: 1 << 20}, SpoolDir: dir, MaxMessageSize: 1 << 20}
}

func waitFor(t *testing.T, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if cond() {
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatal("timed out")
}

// tcpCollector accepts connections and keeps the lines they carry.
type tcpCollector struct {
	ln    net.Listener
	mu    sync.Mutex
	lines []string
	conns []net.Conn
}

// stop closes the listener and every connection, as a dead aggregator.
func (c *tcpCollector) stop() {
	c.ln.Close()
	c.mu.Lock()
	defer c.mu.Unlock()
	for _, conn := range c.conns {
		conn.Close()
	}
}

func listenTCP(t *testing.T, addr string) *tcpCollector {
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		t.Fatal(err)
	}
	c := &tcpCollector{ln: ln}
	go func() {
		for {
			conn, err := ln.Accept()
			if err != nil {
				return
			}
			c.mu.Lock()
			c.conns = append(c.conns, conn)
			c.mu.Unlock()
			go func() {
				defer conn.Close()
				sc := bufio.NewScanner(conn)
				sc.Buffer(make([]byte, 1<<20), 1<<20)
				for sc.Scan() {
					c.mu.Lock()
					c.lines = append(c.lines, sc.Text())
					c.mu.Unlock()
				}
			}()
		}
	}()
	return c
}

func (c *tcpCollector) got() []string {
	c.mu.Lock()
	defer c.mu.Unlock()
	return append([]string(nil), c.lines...)
}

// Records travel over TCP one per line; while the aggregator is down they
// wait in the queue, and they arrive once it is back, in order.
func TestShipperTCPRetries(t *testing.T) {
	col := listenTCP(t, "127.0.0.1:0")
	addr := col.ln.Addr().(*net.TCPAddr)
	s := NewShipper("test")
	s.errOut = func(string) {}
	defer s.Close()
	s.Apply([]Destination{testDest(t.TempDir(), Config{Protocol: "tcp", Host: "127.0.0.1", Port: int64(addr.Port)})})
	ctx := context.Background()
	s.Emit(ServiceRecord(ctx, time.Now(), "ascender.main.tasks", "INFO", "first", nil))
	waitFor(t, func() bool { return len(col.got()) == 1 })
	var m map[string]any
	if err := json.Unmarshal([]byte(col.got()[0]), &m); err != nil {
		t.Fatal(err)
	}
	if m["message"] != "first" || m["logger_name"] != "ascender.main.tasks" || m["cluster_host_id"] != "node1" || m["level"] != "INFO" {
		t.Errorf("record %v", m)
	}
	col.stop()
	time.Sleep(100 * time.Millisecond)
	// The open connection may take one write before it fails; what is
	// written to it after the aggregator is gone can be lost, as with
	// omfwd. The rest waits.
	for i := 0; i < 5; i++ {
		s.Emit(ServiceRecord(ctx, time.Now(), "ascender.main.tasks", "WARNING", "while down "+strconv.Itoa(i), nil))
		time.Sleep(30 * time.Millisecond)
	}
	col2 := listenTCP(t, addr.String())
	defer col2.ln.Close()
	waitFor(t, func() bool {
		g := col2.got()
		return len(g) > 0 && strings.Contains(g[len(g)-1], "while down 4")
	})
}

// HTTP: a server error is retried, a refusal is written to the error file
// and dropped, and the next record still goes.
func TestShipperHTTP(t *testing.T) {
	var mu sync.Mutex
	var bodies []string
	var auth []string
	fail := 2
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		mu.Lock()
		defer mu.Unlock()
		auth = append(auth, r.Header.Get("Authorization"))
		if fail > 0 {
			fail--
			w.WriteHeader(503)
			return
		}
		if strings.Contains(string(b), "refuse me") {
			w.WriteHeader(400)
			io.WriteString(w, "bad record")
			return
		}
		bodies = append(bodies, string(b))
	}))
	defer srv.Close()
	u, _ := url.Parse(srv.URL)
	port, _ := strconv.ParseInt(u.Port(), 10, 64)
	dir := t.TempDir()
	d := testDest(dir, Config{Protocol: "https", Host: "http://" + u.Hostname() + "/services/collector/event", Port: port, Type: "splunk", Password: "tok"})
	d.ErrorFile = filepath.Join(dir, "rsyslog.err")
	s := NewShipper("test")
	s.errOut = func(string) {}
	defer s.Close()
	s.Apply([]Destination{d})
	ctx := context.Background()
	s.Emit(ServiceRecord(ctx, time.Now(), "ascender.api", "ERROR", "one", nil))
	s.Emit(ServiceRecord(ctx, time.Now(), "ascender.api", "ERROR", "refuse me", nil))
	s.Emit(ServiceRecord(ctx, time.Now(), "ascender.api", "ERROR", "three", nil))
	waitFor(t, func() bool { mu.Lock(); defer mu.Unlock(); return len(bodies) == 2 })
	mu.Lock()
	defer mu.Unlock()
	var m map[string]any
	if err := json.Unmarshal([]byte(bodies[0]), &m); err != nil {
		t.Fatal(err)
	}
	ev, _ := m["event"].(map[string]any)
	if _, ok := m["time"].(float64); !ok || ev["message"] != "one" {
		t.Errorf("splunk record %v", m)
	}
	if !strings.Contains(bodies[1], `"message": "three"`) {
		t.Errorf("second %s", bodies[1])
	}
	if auth[0] != "Splunk tok" {
		t.Errorf("authorization %q", auth[0])
	}
	b, _ := os.ReadFile(d.ErrorFile)
	if !strings.Contains(string(b), `"status":400`) || !strings.Contains(string(b), "refuse me") || !strings.Contains(string(b), "bad record") {
		t.Errorf("error file %s", b)
	}
}

// What a stopped shipper had not delivered is sent by the next one.
func TestShipperSpoolAcrossRestart(t *testing.T) {
	dir := t.TempDir()
	// Nothing listens here yet.
	ln, _ := net.Listen("tcp", "127.0.0.1:0")
	addr := ln.Addr().String()
	ln.Close()
	host, ps, _ := net.SplitHostPort(addr)
	port, _ := strconv.ParseInt(ps, 10, 64)
	d := testDest(dir, Config{Protocol: "tcp", Host: host, Port: port})
	s := NewShipper("test")
	s.errOut = func(string) {}
	s.Apply([]Destination{d})
	for i := 0; i < 3; i++ {
		s.Emit(ServiceRecord(context.Background(), time.Now(), "ascender", "WARNING", "kept "+strconv.Itoa(i), nil))
	}
	time.Sleep(50 * time.Millisecond)
	s.Close()
	col := listenTCP(t, addr)
	defer col.ln.Close()
	s2 := NewShipper("test")
	s2.errOut = func(string) {}
	defer s2.Close()
	s2.Apply([]Destination{d})
	waitFor(t, func() bool { return len(col.got()) == 3 })
	for i, l := range col.got() {
		if !strings.Contains(l, "kept "+strconv.Itoa(i)) {
			t.Errorf("line %d: %s", i, l)
		}
	}
}

// Only the selected loggers at or above the level are wanted.
func TestShipperFilters(t *testing.T) {
	s := NewShipper("test")
	s.errOut = func(string) {}
	defer s.Close()
	s.Apply([]Destination{testDest("", Config{Protocol: "udp", Host: "127.0.0.1", Port: 9, Loggers: []string{"awx", "job_lifecycle"}, Level: "WARNING"})})
	for _, c := range []struct {
		logger, level string
		want          bool
	}{
		{"ascender.api", "WARNING", true}, {"ascender.api", "INFO", false}, {JobLifecycleLogger, "ERROR", true},
		{JobEventsLogger, "ERROR", false}, {"django.request", "ERROR", false},
	} {
		if s.Wants(c.logger, c.level) != c.want {
			t.Errorf("%s %s: want %v", c.logger, c.level, c.want)
		}
	}
	var nilShipper *Shipper
	if nilShipper.Wants("ascender", "ERROR") {
		t.Error("nil shipper wants")
	}
	nilShipper.Emit(Record{})
}

// The lifecycle message and data are log_lifecycle's.
func TestLifecycleRecord(t *testing.T) {
	org := int64(3)
	r := LifecycleRecord(context.Background(), Lifecycle{Type: "job", TaskID: 7, State: "controller_node_chosen", TaskName: "zz", ControllerNode: "ascender_1", OrganizationID: &org})
	want := `job-7 controller node chosen {"type": "job", "task_id": 7, "state": "controller_node_chosen", "work_unit_id": null, "task_name": "zz", "controller_node": "ascender_1"}`
	if r.Message != want {
		t.Errorf("message\n%s\nwant\n%s", r.Message, want)
	}
	c := Config{ClusterHostID: "n"}
	out := string(c.Format(r))
	if !strings.Contains(out, `"lifecycle_data": {"type": "job", "task_id": 7`) || !strings.Contains(out, `"organization_id": 3, "cluster_host_id": "n"`) || strings.Contains(out, "stack_info") {
		t.Errorf("formatted %s", out)
	}
	wu := "abc"
	b := LifecycleRecord(context.Background(), Lifecycle{Type: "job", TaskID: 7, State: "blocked", BlockedBy: "projectupdate-5", WorkUnitID: &wu})
	if b.Message != `job-7 blocked by projectupdate-5 {"type": "job", "task_id": 7, "state": "blocked", "work_unit_id": "abc", "blocked_by": "projectupdate-5"}` {
		t.Errorf("blocked %s", b.Message)
	}
}

// The slog handler sends the process's records as the service logger's,
// with their attributes and the correlation id.
func TestSlogHandler(t *testing.T) {
	col := listenTCP(t, "127.0.0.1:0")
	defer col.ln.Close()
	addr := col.ln.Addr().(*net.TCPAddr)
	s := NewShipper("test")
	s.errOut = func(string) {}
	defer s.Close()
	d := testDest("", Config{Protocol: "tcp", Host: "127.0.0.1", Port: int64(addr.Port)})
	d.Config.Level = "DEBUG"
	s.Apply([]Destination{d})
	SetDefault(s)
	defer SetDefault(nil)
	var buf strings.Builder
	log := slog.New(NewSlogHandler(slog.NewTextHandler(&buf, nil), "ascender.main.tasks")).With("job", 7)
	ctx := WithGUID(context.Background(), "g1")
	log.DebugContext(ctx, "debug only out there", "n", 2)
	log.InfoContext(ctx, "both")
	waitFor(t, func() bool { return len(col.got()) == 2 })
	if strings.Contains(buf.String(), "debug only") || !strings.Contains(buf.String(), "both") {
		t.Errorf("console %q", buf.String())
	}
	var m map[string]any
	_ = json.Unmarshal([]byte(col.got()[0]), &m)
	if m["level"] != "DEBUG" || m["job"] != float64(7) || m["n"] != float64(2) || m["guid"] != "g1" || m["logger_name"] != "ascender.main.tasks" {
		t.Errorf("record %v", m)
	}
	if !strings.HasPrefix(col.got()[0], `{"@timestamp": `) || !strings.Contains(col.got()[0], `"stack_info": null, "taskName": null, "job": 7, "n": 2, "guid": "g1"`) {
		t.Errorf("order %s", col.got()[0])
	}
}

// A "logger" attribute sends the record as that logger's: an analytics
// record keeps only its message.
func TestSlogLoggerAttr(t *testing.T) {
	col := listenTCP(t, "127.0.0.1:0")
	defer col.ln.Close()
	addr := col.ln.Addr().(*net.TCPAddr)
	s := NewShipper("test")
	s.errOut = func(string) {}
	defer s.Close()
	d := testDest("", Config{Protocol: "tcp", Host: "127.0.0.1", Port: int64(addr.Port), Loggers: []string{"broadcast_websocket"}})
	s.Apply([]Destination{d})
	SetDefault(s)
	defer SetDefault(nil)
	log := slog.New(NewSlogHandler(slog.NewTextHandler(io.Discard, nil), "ascender.api"))
	log.Warn("not selected")
	log.Warn("websocket notify: boom", LoggerAttr, BroadcastWebsocketLogger, "extra", 1)
	waitFor(t, func() bool { return len(col.got()) == 1 })
	line := col.got()[0]
	if !strings.Contains(line, `"logger_name": "ascender.analytics.broadcast_websocket"`) || !strings.Contains(line, `"message": "websocket notify: boom"`) || strings.Contains(line, `"extra"`) || strings.Contains(line, `"logger":`) {
		t.Errorf("record %s", line)
	}
}

// A UDP record longer than a datagram is cut to 65507 bytes and sent,
// with omfwd's error, and the records after it still go: it is not tried
// for ever.
func TestShipperUDPOversized(t *testing.T) {
	pc, err := net.ListenPacket("udp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer pc.Close()
	if uc, ok := pc.(*net.UDPConn); ok {
		_ = uc.SetReadBuffer(4 << 20)
	}
	port := pc.LocalAddr().(*net.UDPAddr).Port
	var mu sync.Mutex
	var errs []string
	s := NewShipper("test")
	s.errOut = func(m string) { mu.Lock(); errs = append(errs, m); mu.Unlock() }
	defer s.Close()
	s.Apply([]Destination{testDest(t.TempDir(), Config{Protocol: "udp", Host: "127.0.0.1", Port: int64(port)})})
	ctx := context.Background()
	s.Emit(ServiceRecord(ctx, time.Now(), "ascender.main.tasks", "INFO", strings.Repeat("x", 100000), nil))
	s.Emit(ServiceRecord(ctx, time.Now(), "ascender.main.tasks", "INFO", "after", nil))
	var sizes []int
	var last string
	buf := make([]byte, 1<<17)
	_ = pc.SetDeadline(time.Now().Add(5 * time.Second))
	for len(sizes) < 2 {
		n, _, err := pc.ReadFrom(buf)
		if err != nil {
			t.Fatalf("got %v, then %v", sizes, err)
		}
		sizes = append(sizes, n)
		last = string(buf[:n])
	}
	if sizes[0] != 65507 || !strings.Contains(last, `"message": "after"`) {
		t.Errorf("datagrams %v, last %q", sizes, last)
	}
	mu.Lock()
	defer mu.Unlock()
	if len(errs) == 0 || !strings.Contains(errs[0], "but UDP can send at most 65507 bytes (by RFC limit) - truncating message") {
		t.Errorf("errors %q", errs)
	}
}

// With tcp, udp or relp and no port the old configuration had no action:
// records are discarded, not queued, and nothing asks for them.
func TestShipperSocketWithoutPort(t *testing.T) {
	for _, proto := range []string{"tcp", "udp", "relp"} {
		s := NewShipper("test")
		s.errOut = func(string) {}
		s.Apply([]Destination{testDest(t.TempDir(), Config{Protocol: proto, Host: "127.0.0.1"})})
		if s.Wants("ascender.main.tasks", "ERROR") {
			t.Errorf("%s without a port: records wanted", proto)
		}
		s.Emit(ServiceRecord(context.Background(), time.Now(), "ascender.main.tasks", "ERROR", "dropped", nil))
		if _, ok := s.Stats("default"); ok {
			t.Errorf("%s without a port: a destination queues records", proto)
		}
		s.Close()
	}
	// https needs none.
	s := NewShipper("test")
	s.errOut = func(string) {}
	defer s.Close()
	s.Apply([]Destination{testDest(t.TempDir(), Config{Protocol: "https", Host: "127.0.0.1"})})
	if !s.Wants("ascender.main.tasks", "ERROR") {
		t.Error("https without a port: records not wanted")
	}
}

// Queue statistics come every LOG_AGGREGATOR_ACTION_QUEUE_STATS_INTERVAL,
// also below the ten seconds destinations are applied at, and Refresh
// applies changed destinations at once.
func TestShipperRunStatsAndRefresh(t *testing.T) {
	r, w, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	stdout := os.Stdout
	os.Stdout = w
	defer func() { os.Stdout = stdout }()
	var lines []string
	var linesMu sync.Mutex
	go func() {
		sc := bufio.NewScanner(r)
		for sc.Scan() {
			linesMu.Lock()
			lines = append(lines, sc.Text())
			linesMu.Unlock()
		}
	}()
	col := listenTCP(t, "127.0.0.1:0")
	defer col.stop()
	port := int64(col.ln.Addr().(*net.TCPAddr).Port)
	var cfgMu sync.Mutex
	enabled := false
	spool := t.TempDir()
	load := func(context.Context) []Destination {
		cfgMu.Lock()
		defer cfgMu.Unlock()
		d := testDest(spool, Config{Protocol: "tcp", Host: "127.0.0.1", Port: port})
		d.Config.Enabled = enabled
		d.StatsInterval = time.Second
		return []Destination{d}
	}
	s := NewShipper("test")
	s.errOut = func(string) {}
	defer s.Close()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go s.Run(ctx, load, time.Hour)
	time.Sleep(100 * time.Millisecond)
	if s.Wants("ascender.main.tasks", "ERROR") {
		t.Fatal("disabled destination wanted")
	}
	cfgMu.Lock()
	enabled = true
	cfgMu.Unlock()
	s.Refresh()
	waitFor(t, func() bool { return s.Wants("ascender.main.tasks", "ERROR") })
	start := time.Now()
	waitFor(t, func() bool {
		linesMu.Lock()
		defer linesMu.Unlock()
		n := 0
		for _, l := range lines {
			if strings.Contains(l, `"origin":"core.queue"`) {
				n++
			}
		}
		return n >= 2
	})
	if el := time.Since(start); el > 4*time.Second {
		t.Errorf("two statistics reports took %s at a one-second interval", el)
	}
}
