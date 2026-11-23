package db

import (
	"context"
	"log/slog"
	"sync/atomic"
	"time"

	"github.com/jackc/pgx/v5"
)

// QueryStats counts the statements run on behalf of one request and the
// time they took, which is what the X-API-Query-Count and
// X-API-Query-Time headers report when SQL debugging is on. In-process
// sub-requests (the UI calling the API) share their parent's stats, so a
// page's numbers include every API call it made.
type QueryStats struct {
	count atomic.Int64
	nanos atomic.Int64
	// Log, when set, receives every statement with its duration.
	Log *slog.Logger
	// ID labels logged statements (the request id).
	ID string
}

// Count is the number of statements run.
func (s *QueryStats) Count() int64 { return s.count.Load() }

// Duration is the time spent waiting on them.
func (s *QueryStats) Duration() time.Duration { return time.Duration(s.nanos.Load()) }

type statsKey struct{}
type startKey struct{}

// WithQueryStats attaches stats to ctx unless it already carries some, and
// returns the stats in effect.
func WithQueryStats(ctx context.Context, fresh func() *QueryStats) (context.Context, *QueryStats) {
	if s := QueryStatsFrom(ctx); s != nil {
		return ctx, s
	}
	s := fresh()
	return context.WithValue(ctx, statsKey{}, s), s
}

// QueryStatsFrom returns the stats attached to ctx, or nil.
func QueryStatsFrom(ctx context.Context) *QueryStats {
	s, _ := ctx.Value(statsKey{}).(*QueryStats)
	return s
}

type started struct {
	at  time.Time
	sql string
}

// tracer is installed on every pool connection. Without stats on the
// context it does nothing beyond the context lookup.
type tracer struct{}

func (tracer) TraceQueryStart(ctx context.Context, _ *pgx.Conn, data pgx.TraceQueryStartData) context.Context {
	if QueryStatsFrom(ctx) == nil {
		return ctx
	}
	return context.WithValue(ctx, startKey{}, started{at: time.Now(), sql: data.SQL})
}

func (tracer) TraceQueryEnd(ctx context.Context, _ *pgx.Conn, data pgx.TraceQueryEndData) {
	s := QueryStatsFrom(ctx)
	st, ok := ctx.Value(startKey{}).(started)
	if s == nil || !ok {
		return
	}
	d := time.Since(st.at)
	s.count.Add(1)
	s.nanos.Add(int64(d))
	if s.Log != nil {
		s.Log.InfoContext(ctx, "sql", "request", s.ID, "ms", float64(d.Microseconds())/1000, "rows", data.CommandTag.RowsAffected(), "sql", st.sql)
	}
}
