package extlog

import (
	"context"
	"fmt"
	"log/slog"
	"time"
)

// LoggerAttr is the attribute that names a record's logger.
const LoggerAttr = "logger"

// SlogHandler sends a process's own log records to the shipper as the
// service logger's records, besides handing them to next.
type SlogHandler struct {
	next   slog.Handler
	logger string
	attrs  []slog.Attr
	groups []string
}

// NewSlogHandler wraps next; logger is the service logger's name for this
// process (under "ascender").
func NewSlogHandler(next slog.Handler, logger string) *SlogHandler {
	return &SlogHandler{next: next, logger: logger}
}

func levelName(l slog.Level) string {
	switch {
	case l < slog.LevelInfo:
		return "DEBUG"
	case l < slog.LevelWarn:
		return "INFO"
	case l < slog.LevelError:
		return "WARNING"
	case l < slog.LevelError+4:
		return "ERROR"
	}
	return "CRITICAL"
}

func (h *SlogHandler) Enabled(ctx context.Context, l slog.Level) bool {
	return h.next.Enabled(ctx, l) || Default().Wants(h.logger, levelName(l))
}

func (h *SlogHandler) Handle(ctx context.Context, r slog.Record) error {
	var err error
	if h.next.Enabled(ctx, r.Level) {
		err = h.next.Handle(ctx, r)
	}
	// A "logger" attribute names the record's logger instead of the
	// handler's (an analytics logger, or a finer service one).
	logger := h.logger
	isLogger := func(a slog.Attr) bool {
		if a.Key == LoggerAttr && a.Value.Kind() == slog.KindString {
			logger = a.Value.String()
			return true
		}
		return false
	}
	for _, a := range h.attrs {
		isLogger(a)
	}
	r.Attrs(func(a slog.Attr) bool {
		isLogger(a)
		return true
	})
	if s := Default(); s.Wants(logger, levelName(r.Level)) {
		var extra []Field
		// The handler's own attributes carry their groups already.
		for _, a := range h.attrs {
			if a.Key != LoggerAttr {
				extra = appendAttr(extra, nil, a)
			}
		}
		r.Attrs(func(a slog.Attr) bool {
			if a.Key != LoggerAttr {
				extra = appendAttr(extra, h.groups, a)
			}
			return true
		})
		t := r.Time
		if t.IsZero() {
			t = time.Now()
		}
		s.Emit(ServiceRecord(ctx, t, logger, levelName(r.Level), r.Message, extra))
	}
	return err
}

func appendAttr(out []Field, groups []string, a slog.Attr) []Field {
	v := a.Value.Resolve()
	key := a.Key
	for i := len(groups) - 1; i >= 0; i-- {
		key = groups[i] + "." + key
	}
	if v.Kind() == slog.KindGroup {
		for _, g := range v.Group() {
			out = appendAttr(out, append(append([]string(nil), groups...), a.Key), g)
		}
		return out
	}
	if key == "" {
		return out
	}
	return append(out, Field{key, attrValue(v)})
}

// attrValue is the formatter's rule: JSON's own types as they are,
// anything else as its text.
func attrValue(v slog.Value) any {
	switch v.Kind() {
	case slog.KindString:
		return v.String()
	case slog.KindInt64:
		return v.Int64()
	case slog.KindUint64:
		return v.Uint64()
	case slog.KindFloat64:
		return v.Float64()
	case slog.KindBool:
		return v.Bool()
	case slog.KindDuration:
		return v.Duration().String()
	case slog.KindTime:
		return djangoTime(v.Time())
	}
	switch x := v.Any().(type) {
	case nil:
		return nil
	case error:
		return x.Error()
	case fmt.Stringer:
		return x.String()
	case []string, []any, map[string]any, []int64:
		return x
	}
	return fmt.Sprint(v.Any())
}

func (h *SlogHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	c := *h
	c.next = h.next.WithAttrs(attrs)
	c.attrs = append([]slog.Attr(nil), h.attrs...)
	for _, a := range attrs {
		if len(h.groups) > 0 {
			a.Key = joinGroups(h.groups) + "." + a.Key
		}
		c.attrs = append(c.attrs, a)
	}
	return &c
}

func (h *SlogHandler) WithGroup(name string) slog.Handler {
	c := *h
	c.next = h.next.WithGroup(name)
	c.groups = append(append([]string(nil), h.groups...), name)
	return &c
}

func joinGroups(g []string) string {
	out := ""
	for i, x := range g {
		if i > 0 {
			out += "."
		}
		out += x
	}
	return out
}
