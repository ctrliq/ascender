package extlog

import (
	"bytes"
	"context"
	"log/slog"
	"strings"
	"testing"
)

// A lifecycle record reaches the process output through its slog handler,
// in that handler's format, with or without an external logger, and only
// when the handler lets INFO through.
func TestLifecycleConsole(t *testing.T) {
	defer SetConsole(nil)
	SetDefault(nil)
	var buf bytes.Buffer
	text := func(level slog.Level) slog.Handler {
		return slog.NewTextHandler(&buf, &slog.HandlerOptions{Level: level, ReplaceAttr: func(_ []string, a slog.Attr) slog.Attr {
			if a.Key == slog.TimeKey {
				return slog.Attr{}
			}
			return a
		}})
	}
	SetConsole(text(slog.LevelInfo))
	if !Default().LifecycleWanted() {
		t.Fatal("a console at info does not want lifecycle records")
	}
	ctx := WithGUID(context.Background(), "0123456789abcdef")
	org := int64(3)
	Default().LogLifecycle(ctx, Lifecycle{Type: "job", TaskID: 7, State: "running", TaskName: "zz", OrganizationID: &org})
	want := `level=INFO msg="job-7 running" logger=ascender.analytics.job_lifecycle type=job task_id=7 state=running task_name=zz organization_id=3 guid=0123456789abcdef` + "\n"
	if buf.String() != want {
		t.Errorf("line\n%q\nwant\n%q", buf.String(), want)
	}

	buf.Reset()
	Default().LogLifecycle(context.Background(), Lifecycle{Type: "job", TaskID: 7, State: "blocked", BlockedBy: "projectupdate-5"})
	want = `level=INFO msg="job-7 blocked by projectupdate-5" logger=ascender.analytics.job_lifecycle type=job task_id=7 state=blocked blocked_by=projectupdate-5` + "\n"
	if buf.String() != want {
		t.Errorf("blocked line\n%q\nwant\n%q", buf.String(), want)
	}

	// warn leaves INFO records out, and with no console and no aggregator
	// nothing wants them.
	buf.Reset()
	SetConsole(text(slog.LevelWarn))
	if Default().LifecycleWanted() {
		t.Error("a console at warn wants lifecycle records")
	}
	Default().LogLifecycle(ctx, Lifecycle{Type: "job", TaskID: 7, State: "running"})
	if buf.Len() != 0 {
		t.Errorf("written at warn: %q", buf.String())
	}
	SetConsole(nil)
	if Default().LifecycleWanted() || ConsoleWants("CRITICAL") {
		t.Error("no console and no aggregator still want records")
	}
	if strings.Contains(want, "{") {
		t.Error("the console line carries the record's JSON")
	}
}
