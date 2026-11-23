package extlog

import (
	"context"
	"log/slog"
	"sync"
	"time"
)

// The console: the process output, where the old application's console
// handler also wrote the ascender.analytics.job_lifecycle logger. Those
// records go to the same log/slog handler as the process's own messages,
// in its format, with the record's fields as attributes. They are handed
// to that handler directly rather than through the slog default logger,
// whose handler also tees into the external logger: the lifecycle record
// already went there itself.
var console struct {
	mu sync.Mutex
	h  slog.Handler
}

// SetConsole makes h the process's console: analytics records whose level
// h is enabled for are written to it. With no console set (nil), they are
// not written.
func SetConsole(h slog.Handler) {
	console.mu.Lock()
	console.h = h
	console.mu.Unlock()
}

// ConsoleWants reports whether a record of this level (DEBUG, INFO, ...)
// is written to the console.
func ConsoleWants(level string) bool {
	console.mu.Lock()
	h := console.h
	console.mu.Unlock()
	return h != nil && h.Enabled(context.Background(), slogLevel(level))
}

func slogLevel(level string) slog.Level {
	switch level {
	case "DEBUG":
		return slog.LevelDebug
	case "INFO":
		return slog.LevelInfo
	case "WARNING":
		return slog.LevelWarn
	case "ERROR":
		return slog.LevelError
	}
	return slog.LevelError + 4
}

// writeLifecycleConsole writes a lifecycle record to the console when it
// wants INFO: its message ("job-7 running") with the logger's name, the
// lifecycle fields, the organization and the guid as attributes, the
// empty ones left out.
func writeLifecycleConsole(ctx context.Context, l Lifecycle) {
	console.mu.Lock()
	h := console.h
	console.mu.Unlock()
	if h == nil || !h.Enabled(ctx, slog.LevelInfo) {
		return
	}
	msg, data := lifecycleParts(l)
	r := slog.NewRecord(time.Now(), slog.LevelInfo, msg, 0)
	r.AddAttrs(slog.String("logger", JobLifecycleLogger))
	for _, f := range data {
		if f.Value != nil {
			r.AddAttrs(slog.Any(f.Key, f.Value))
		}
	}
	if l.OrganizationID != nil {
		r.AddAttrs(slog.Int64("organization_id", *l.OrganizationID))
	}
	if g, ok := GUID(ctx).(string); ok {
		r.AddAttrs(slog.String("guid", g))
	}
	_ = h.Handle(ctx, r)
}
