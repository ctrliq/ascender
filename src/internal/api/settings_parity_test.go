package api

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/activity"
	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/extlog"
)

// cleanSettings removes the system-wide rows of keys now and when the
// test ends.
func (d *dbServer) cleanSettings(keys ...string) {
	clean := func() {
		if _, err := d.DB.Pool.Exec(context.Background(), `DELETE FROM conf_setting WHERE key = ANY($1) AND user_id IS NULL`, keys); err != nil {
			d.t.Errorf("clean settings: %v", err)
		}
		_ = d.Settings.Reload(context.Background())
	}
	clean()
	d.t.Cleanup(clean)
}

var uiKeys = []string{"CUSTOM_LOGIN_INFO", "CUSTOM_TITLE", "CUSTOM_LOGO", "CUSTOM_HEADER_LOGO", "CUSTOM_THEME", "CUSTOM_THEME_NAME", "MAX_UI_JOB_EVENTS", "UI_LIVE_UPDATES_ENABLED"}

// A PUT is DRF's full update: each required setting it leaves out is an
// error, and each optional one it leaves out is reset to its default,
// stored as a row; a PATCH writes only what it sends.
func TestSettingsPutIsFullUpdate(t *testing.T) {
	d := newDBServer(t, "zz-settings-put")
	d.cleanSettings(uiKeys...)
	status, body := d.do("PUT", "/api/v2/settings/ui/", map[string]any{"CUSTOM_TITLE": "zz"})
	d.expect(status, body, 400, `{"MAX_UI_JOB_EVENTS":["This field is required."],"UI_LIVE_UPDATES_ENABLED":["This field is required."]}`)

	status, body = d.do("PATCH", "/api/v2/settings/ui/", map[string]any{"CUSTOM_LOGIN_INFO": "zz info", "CUSTOM_TITLE": "zz title"})
	d.expect(status, body, 200, "")
	status, body = d.do("PUT", "/api/v2/settings/ui/", map[string]any{"MAX_UI_JOB_EVENTS": 100, "UI_LIVE_UPDATES_ENABLED": false, "CUSTOM_TITLE": "zz kept"})
	d.expect(status, body, 200, "")
	var got map[string]any
	if err := json.Unmarshal([]byte(body), &got); err != nil {
		t.Fatal(err)
	}
	if got["CUSTOM_LOGIN_INFO"] != "" || got["CUSTOM_TITLE"] != "zz kept" || got["MAX_UI_JOB_EVENTS"] != float64(100) || got["UI_LIVE_UPDATES_ENABLED"] != false {
		t.Errorf("after PUT: %s", body)
	}
	// The omitted optional settings are rows holding their defaults.
	var n int
	if err := d.DB.Pool.QueryRow(context.Background(), `SELECT count(*) FROM conf_setting WHERE key = ANY($1) AND user_id IS NULL AND value = '""'::jsonb`,
		[]string{"CUSTOM_LOGIN_INFO", "CUSTOM_LOGO", "CUSTOM_HEADER_LOGO", "CUSTOM_THEME", "CUSTOM_THEME_NAME"}).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 5 {
		t.Errorf("%d of the 5 omitted settings hold their default", n)
	}
	// PATCH leaves what it does not send.
	status, body = d.do("PATCH", "/api/v2/settings/ui/", map[string]any{"CUSTOM_LOGIN_INFO": "zz again"})
	d.expect(status, body, 200, "")
	if !strings.Contains(body, `"CUSTOM_TITLE":"zz kept"`) {
		t.Errorf("PATCH changed what it did not send: %s", body)
	}
}

// OPTIONS of "changed" is "all"'s document with only the changed settings
// under PUT, in registration order.
func TestSettingsChangedOptions(t *testing.T) {
	d := newDBServer(t, "zz-settings-changed")
	d.cleanSettings("CUSTOM_LOGIN_INFO", "MAX_FORKS")
	status, body := d.do("PATCH", "/api/v2/settings/all/", map[string]any{"MAX_FORKS": 50, "CUSTOM_LOGIN_INFO": "zz"})
	d.expect(status, body, 200, "")
	status, body = d.do("OPTIONS", "/api/v2/settings/changed/", nil)
	d.expect(status, body, 200, "")
	doc, err := DecodeOrdered(body)
	if err != nil {
		t.Fatal(err)
	}
	actions, _ := doc.(*OMap).Get("actions")
	put, _ := omapAt(actions.(*OMap), "PUT")
	get, _ := omapAt(actions.(*OMap), "GET")
	want := []string{}
	for _, k := range d.settingKeys(context.Background(), "changed") {
		if f, _ := d.Settings.Registry.Field(k); !f.ReadOnly {
			want = append(want, k)
		}
	}
	if strings.Join(put.Keys(), ",") != strings.Join(want, ",") {
		t.Errorf("PUT lists %v, want %v", put.Keys(), want)
	}
	if !put.Has("MAX_FORKS") || !put.Has("CUSTOM_LOGIN_INFO") {
		t.Errorf("PUT misses the changed settings: %v", put.Keys())
	}
	if len(get.Keys()) != len(d.Settings.Registry.Fields) {
		t.Errorf("GET lists %d settings, want all %d", len(get.Keys()), len(d.Settings.Registry.Fields))
	}
}

// A setting the deployment's file gives shows in OPTIONS as the old
// registry showed a file-defined one; a DELETE of its category does not
// try to reset ASCENDER_URL_BASE when the file gives it.
func TestSettingsFromFile(t *testing.T) {
	d := newDBServer(t, "zz-settings-file")
	d.cleanSettings("ASCENDER_URL_BASE", "CUSTOM_LOGIN_INFO")
	path := filepath.Join(t.TempDir(), "settings.json")
	if err := os.WriteFile(path, []byte(`{"CUSTOM_LOGIN_INFO": "zz from file", "ASCENDER_URL_BASE": "https://zz.example.com"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	if problems, err := d.Settings.LoadFile(path); err != nil || len(problems) != 0 {
		t.Fatalf("LoadFile: %v %v", problems, err)
	}
	status, body := d.do("OPTIONS", "/api/v2/settings/ui/", nil)
	d.expect(status, body, 200, "")
	doc, _ := DecodeOrdered(body)
	actions, _ := doc.(*OMap).Get("actions")
	put, _ := omapAt(actions.(*OMap), "PUT")
	get, _ := omapAt(actions.(*OMap), "GET")
	if put.Has("CUSTOM_LOGIN_INFO") {
		t.Error("PUT takes the file's setting")
	}
	field, _ := omapAt(get, "CUSTOM_LOGIN_INFO")
	help, _ := field.Get("help_text")
	inFile, _ := field.Get("defined_in_file")
	f, _ := d.Settings.Registry.Field("CUSTOM_LOGIN_INFO")
	if inFile != true || help != "This value has been set manually in a settings file.\n\n"+f.HelpText {
		t.Errorf("GET: defined_in_file %v, help_text %q", inFile, help)
	}
	desc, _ := doc.(*OMap).Get("description")
	text := desc.(string)
	get1, upd, _ := strings.Cut(text, "\n# Update ")
	if !strings.Contains(get1, "* `CUSTOM_LOGIN_INFO`: This value has been set manually in a settings file.\n\n") {
		t.Errorf("description's GET list: %s", get1)
	}
	if strings.Contains(upd, "`CUSTOM_LOGIN_INFO`") || !strings.Contains(upd, "`CUSTOM_TITLE`") {
		t.Errorf("description's update list: %s", upd)
	}
	// Other settings of the category keep their own text.
	title, _ := omapAt(get, "CUSTOM_TITLE")
	if v, _ := title.Get("defined_in_file"); v != false {
		t.Errorf("CUSTOM_TITLE defined_in_file %v", v)
	}

	status, body = d.do("DELETE", "/api/v2/settings/system/", nil)
	d.expect(status, body, 204, "")
	var n int
	if err := d.DB.Pool.QueryRow(context.Background(), `SELECT count(*) FROM conf_setting WHERE key = 'ASCENDER_URL_BASE'`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 0 || d.Settings.String(context.Background(), "ASCENDER_URL_BASE") != "https://zz.example.com" {
		t.Errorf("ASCENDER_URL_BASE: %d rows, value %q", n, d.Settings.String(context.Background(), "ASCENDER_URL_BASE"))
	}
}

// lineCollector keeps the lines TCP clients send it.
type lineCollector struct {
	ln    net.Listener
	mu    sync.Mutex
	lines []string
}

func collectLines(t *testing.T) *lineCollector {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	c := &lineCollector{ln: ln}
	t.Cleanup(func() { ln.Close() })
	go func() {
		for {
			conn, err := ln.Accept()
			if err != nil {
				return
			}
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

func (c *lineCollector) port() int { return c.ln.Addr().(*net.TCPAddr).Port }

func (c *lineCollector) wait(t *testing.T, substr string) string {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		c.mu.Lock()
		for _, l := range c.lines {
			if strings.Contains(l, substr) {
				c.mu.Unlock()
				return l
			}
		}
		c.mu.Unlock()
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("no record with %q", substr)
	return ""
}

func (c *lineCollector) count(substr string) int {
	c.mu.Lock()
	defer c.mu.Unlock()
	n := 0
	for _, l := range c.lines {
		if strings.Contains(l, substr) {
			n++
		}
	}
	return n
}

var loggingKeys = []string{"LOG_AGGREGATOR_MAX_DISK_USAGE_PATH", "LOG_AGGREGATOR_ENABLED", "LOG_AGGREGATOR_HOST", "LOG_AGGREGATOR_PORT", "LOG_AGGREGATOR_PROTOCOL", "LOG_AGGREGATOR_TYPE", "LOG_AGGREGATOR_LOGGERS", "LOG_AGGREGATOR_LEVEL", "LOG_AGGREGATOR_TCP_TIMEOUT"}

// useShipper makes a shipper the process's for the test.
func useShipper(t *testing.T) {
	sh := extlog.NewShipper("zz-test")
	extlog.SetDefault(sh)
	t.Cleanup(func() {
		extlog.SetDefault(nil)
		sh.Close()
	})
}

// The logging test sends its message through the queue, as any record
// goes, with the request's guid, and reports a port it cannot connect to
// as the old test did, in Python's words.
func TestSettingsLoggingTest(t *testing.T) {
	d := newDBServer(t, "zz-settings-logtest")
	d.cleanSettings(loggingKeys...)
	spool := t.TempDir() // removed after the shipper closes
	useShipper(t)
	col := collectLines(t)
	patch := map[string]any{"LOG_AGGREGATOR_MAX_DISK_USAGE_PATH": spool, "LOG_AGGREGATOR_HOST": "127.0.0.1", "LOG_AGGREGATOR_PORT": col.port(), "LOG_AGGREGATOR_PROTOCOL": "tcp",
		"LOG_AGGREGATOR_TYPE": "other", "LOG_AGGREGATOR_LOGGERS": []string{"ascender"}, "LOG_AGGREGATOR_ENABLED": true, "LOG_AGGREGATOR_TCP_TIMEOUT": 1}
	status, body := d.do("PATCH", "/api/v2/settings/logging/", patch)
	d.expect(status, body, 200, "")
	status, body = d.do("POST", "/api/v2/settings/logging/test/", map[string]any{})
	d.expect(status, body, 202, "")
	line := col.wait(t, "Ascender Connection Test Message")
	var rec map[string]any
	if err := json.Unmarshal([]byte(line), &rec); err != nil {
		t.Fatal(err)
	}
	if rec["logger_name"] != "ascender" || rec["level"] != "ERROR" || rec["guid"] == nil {
		t.Errorf("test record %s", line)
	}

	// A port nothing listens on.
	ln, _ := net.Listen("tcp", "127.0.0.1:0")
	closed := ln.Addr().(*net.TCPAddr).Port
	ln.Close()
	status, body = d.do("PATCH", "/api/v2/settings/logging/", map[string]any{"LOG_AGGREGATOR_PORT": closed})
	d.expect(status, body, 200, "")
	status, body = d.do("POST", "/api/v2/settings/logging/test/", map[string]any{})
	d.expect(status, body, 400, `{"error":"[Errno 111] Connection refused"}`)
	// An IPv6 address, which the old AF_INET socket could not take.
	status, body = d.do("PATCH", "/api/v2/settings/logging/", map[string]any{"LOG_AGGREGATOR_HOST": "::1"})
	d.expect(status, body, 200, "")
	status, body = d.do("POST", "/api/v2/settings/logging/test/", map[string]any{})
	d.expect(status, body, 400, `{"error":"[Errno -9] Address family for hostname not supported"}`)
}

// The activity stream log record of a change goes out once the change
// commits, and never for one that rolls back.
func TestActivityLogAfterCommit(t *testing.T) {
	d := newDBServer(t, "zz-activity-commit")
	d.cleanSettings(loggingKeys...)
	spool := t.TempDir()
	useShipper(t)
	col := collectLines(t)
	ctx := context.Background()
	for _, kv := range [][2]any{{"LOG_AGGREGATOR_MAX_DISK_USAGE_PATH", spool}, {"LOG_AGGREGATOR_HOST", "127.0.0.1"}, {"LOG_AGGREGATOR_PORT", col.port()}, {"LOG_AGGREGATOR_PROTOCOL", "tcp"},
		{"LOG_AGGREGATOR_TYPE", "other"}, {"LOG_AGGREGATOR_LOGGERS", []any{"activity_stream"}}, {"LOG_AGGREGATOR_LEVEL", "INFO"}, {"LOG_AGGREGATOR_ENABLED", true}} {
		if err := d.Settings.Set(ctx, kv[0].(string), kv[1]); err != nil {
			t.Fatal(err)
		}
	}
	extlog.Default().Apply(d.LogDestinations(ctx))
	recorded := d.Activity.Written
	d.Activity.Written = func(ctx context.Context, q db.Querier, id int64, e activity.Entry) {
		recorded(ctx, q, id, e)
		d.LogActivity(ctx, q, id, e)
	}
	record := func(name string, fail bool) error {
		return d.DB.Tx(ctx, func(tx pgx.Tx) error {
			if err := d.Activity.Record(ctx, tx, activity.Entry{Operation: "create", Object1: "setting", ActorID: &d.user.ID,
				Changes: map[string]any{"value": name}, Setting: map[string]any{"name": name, "category": "zz"}}); err != nil {
				return err
			}
			if fail {
				return errors.New("zz rollback")
			}
			// Not sent before the commit.
			time.Sleep(200 * time.Millisecond)
			if col.count(name) != 0 {
				t.Errorf("%s: record sent before the commit", name)
			}
			return nil
		})
	}
	if err := record("zz-rolled-back", true); err == nil {
		t.Fatal("no rollback")
	}
	if err := record("zz-committed", false); err != nil {
		t.Fatal(err)
	}
	col.wait(t, "zz-committed")
	if col.count("zz-rolled-back") != 0 {
		t.Error("a rolled back change sent its record")
	}
}

// Error responses of the API views are logged in API_400_ERROR_LOG_FORMAT's
// words (401 at INFO, the rest at WARNING); a format that cannot be
// applied logs why and uses the default.
func TestAPIErrorLog(t *testing.T) {
	d := newDBServer(t, "zz-api-errlog")
	d.cleanSettings("API_400_ERROR_LOG_FORMAT", "REMOTE_HOST_HEADERS", "PROXY_IP_ALLOWED_LIST")
	var buf bytes.Buffer
	var mu sync.Mutex
	d.Log = slog.New(slog.NewTextHandler(&lockedWriter{w: &buf, mu: &mu}, &slog.HandlerOptions{Level: slog.LevelInfo}))
	logged := func() string {
		mu.Lock()
		defer mu.Unlock()
		s := buf.String()
		buf.Reset()
		return s
	}
	d.do("GET", "/api/v2/settings/zz-nonexistent/", nil)
	if got := logged(); !strings.Contains(got, `level=WARN msg="status 404 received by user zz-api-errlog attempting to access /api/v2/settings/zz-nonexistent/ from 192.0.2.1" logger=ascender.api.generics`) {
		t.Errorf("404: %s", got)
	}
	// Anonymous: a 401 at INFO.
	r := httptest.NewRequest("GET", "/api/v2/settings/all/", nil)
	r.Header.Set("Accept", "application/json")
	w := httptest.NewRecorder()
	d.Routes().ServeHTTP(w, r)
	if got := logged(); w.Code != 401 || !strings.Contains(got, `level=INFO msg="status 401 received by user AnonymousUser attempting to access /api/v2/settings/all/ from 192.0.2.1"`) {
		t.Errorf("401 (%d): %s", w.Code, got)
	}
	// The format, with the error key and a format spec.
	if err := d.Settings.Set(context.Background(), "API_400_ERROR_LOG_FORMAT", "{status_code:>5}|{error}|{user_name.username}|{url_path!r}"); err != nil {
		t.Fatal(err)
	}
	status, _ := d.do("POST", "/api/v2/settings/logging/test/", map[string]any{})
	if got := logged(); status != 409 || !strings.Contains(got, `msg="  409|Logging not enabled|zz-api-errlog|'/api/v2/settings/logging/test/'"`) {
		t.Errorf("409 (%d): %s", status, got)
	}
	// A format naming a variable there is not.
	if err := d.Settings.Set(context.Background(), "API_400_ERROR_LOG_FORMAT", "{nope} {status_code}"); err != nil {
		t.Fatal(err)
	}
	d.do("GET", "/api/v2/settings/zz-nonexistent/", nil)
	got := logged()
	if !strings.Contains(got, `level=ERROR msg="Unable to format API_400_ERROR_LOG_FORMAT setting, defaulting log message: 'nope'"`) ||
		!strings.Contains(got, `msg="status 404 received by user zz-api-errlog`) {
		t.Errorf("bad format: %s", got)
	}
	// A successful request logs nothing.
	d.do("GET", "/api/v2/settings/ui/", nil)
	if got := logged(); got != "" {
		t.Errorf("200 logged: %s", got)
	}
}

type lockedWriter struct {
	w  *bytes.Buffer
	mu *sync.Mutex
}

func (l *lockedWriter) Write(p []byte) (int, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.w.Write(p)
}
