package api

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/activity"
	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/extlog"
	"github.com/ctrliq/ascender/internal/models"
)

// External logging: the destinations the settings describe, and the
// records the API side produces.

// defaultErrorLogFile is LOG_AGGREGATOR_RSYSLOGD_ERROR_LOG_FILE's default.
const defaultErrorLogFile = "/var/log/ascender/rsyslog.err"

// maxEventResData is MAX_EVENT_RES_DATA, rsyslog's maxMessageSize.
const maxEventResData = 25000000

// LogDestinations are the external log destinations: the one the
// LOG_AGGREGATOR_* settings describe.
func (s *Server) LogDestinations(ctx context.Context) []extlog.Destination {
	cfg := s.ExtLogConfig(ctx)
	intOr := func(key string, def int64) int64 {
		if v := s.Settings.Int(ctx, key); v > 0 {
			return v
		}
		return def
	}
	sev := s.Settings.Int(ctx, "LOG_AGGREGATOR_ACTION_QUEUE_DISCARD_SEVERITY")
	if sev <= 0 {
		sev = 5
	}
	errFile := os.Getenv("ASCENDER_LOG_AGGREGATOR_ERROR_LOG_FILE")
	if errFile == "" {
		if st, err := os.Stat(filepath.Dir(defaultErrorLogFile)); err == nil && st.IsDir() {
			errFile = defaultErrorLogFile
		}
	}
	return []extlog.Destination{{
		Name:   "default",
		Config: cfg,
		KeepAlive: extlog.KeepAlive{
			Enabled:  s.Settings.Bool(ctx, "LOG_AGGREGATOR_TCP_KEEPALIVE"),
			Time:     time.Duration(intOr("LOG_AGGREGATOR_TCP_KEEPALIVE_TIME", 120)) * time.Second,
			Interval: time.Duration(intOr("LOG_AGGREGATOR_TCP_KEEPALIVE_INTERVAL", 30)) * time.Second,
			Probes:   int(intOr("LOG_AGGREGATOR_TCP_KEEPALIVE_PROBES", 3)),
		},
		Queue: extlog.QueueLimits{
			Size:            int(intOr("LOG_AGGREGATOR_ACTION_QUEUE_SIZE", 131072)),
			MaxDiskBytes:    intOr("LOG_AGGREGATOR_ACTION_MAX_DISK_USAGE_GB", 1) << 30,
			DiscardSeverity: int(sev),
		},
		SpoolDir:       s.Settings.String(ctx, "LOG_AGGREGATOR_MAX_DISK_USAGE_PATH"),
		ErrorFile:      errFile,
		MaxMessageSize: maxEventResData,
		StatsInterval:  time.Duration(s.Settings.Int(ctx, "LOG_AGGREGATOR_ACTION_QUEUE_STATS_INTERVAL")) * time.Second,
		Debug:          s.Settings.Bool(ctx, "LOG_AGGREGATOR_RSYSLOGD_DEBUG"),
	}}
}

// LogActivity is emit_activity_stream_change: the activity_stream record
// of an entry just written through q, with the summary fields the API
// shows for it. The record is read now, in q's transaction, and sent once
// that transaction commits (connection.on_commit): a change that rolls
// back sends nothing.
func (s *Server) LogActivity(ctx context.Context, q db.Querier, id int64, e activity.Entry) {
	sh := extlog.Default()
	if !sh.Wants(extlog.ActivityStreamLogger, "INFO") {
		return
	}
	outer := q
	// Read in a savepoint: a failure here must not abort the caller's
	// transaction.
	if b, ok := q.(interface {
		Begin(context.Context) (pgx.Tx, error)
	}); ok {
		sp, err := b.Begin(ctx)
		if err != nil {
			return
		}
		defer sp.Rollback(ctx)
		q = sp
	}
	row := &activityRow{}
	if err := q.QueryRow(ctx, `SELECT `+activityColumns+` FROM main_activitystream act WHERE act.id = $1`, id).Scan(&row.ID, &row.ActorID, &row.Operation, &row.Timestamp,
		&row.Changes, &row.DeletedActor, &row.ActionNode, &row.RelType, &row.Object1, &row.Object2, &row.Setting); err != nil {
		return
	}
	loaded := map[string]map[int64][]activityItem{}
	for _, l := range activityLinks {
		if l.key == row.Object1 || l.key == row.Object2 || (l.key == "role" && (row.Object1 == "user" || row.Object2 == "user")) {
			if m, err := s.loadActivityLinksQ(ctx, q, l, []int64{id}); err == nil {
				loaded[l.key] = m
			}
		}
	}
	var actor any
	userSummary := func(*int64) *OMap { return nil }
	if row.ActorID != nil {
		if users, err := models.LoadUserSummaries(ctx, q, []int64{*row.ActorID}); err == nil {
			if u, ok := users[*row.ActorID]; ok {
				actor = u.Username
				userSummary = func(*int64) *OMap {
					return NewOMap().Set("id", u.ID).Set("username", u.Username).Set("first_name", u.FirstName).Set("last_name", u.LastName)
				}
			}
		}
	}
	_, summary := activityRelatedSummary(row, loaded, userSummary)
	extra := []extlog.Field{
		{Key: "changes", Value: row.Changes},
		{Key: "relationship", Value: row.RelType},
		{Key: "actor", Value: actor},
		{Key: "operation", Value: row.Operation},
		{Key: "object1", Value: row.Object1},
		{Key: "object2", Value: row.Object2},
		{Key: "summary_fields", Value: summary},
	}
	rec := extlog.ServiceRecord(ctx, time.Now(), extlog.ActivityStreamLogger, "INFO", "Activity Stream update entry for "+row.Object1, extra)
	db.AfterCommit(outer, func() {
		rec.Time = time.Now()
		sh.Emit(rec)
	})
}

// LogLifecycle is UnifiedJob.log_lifecycle for the unified job id: its
// type, name, work unit, nodes and organization read when a lifecycle
// record is wanted.
func (s *Server) LogLifecycle(ctx context.Context, id int64, state string) {
	s.logLifecycle(ctx, id, state, "")
}

// LogBlocked is log_lifecycle("blocked", blocked_by=...).
func (s *Server) LogBlocked(ctx context.Context, id int64, blockedBy string) {
	s.logLifecycle(ctx, id, "blocked", blockedBy)
}

func (s *Server) logLifecycle(ctx context.Context, id int64, state, blockedBy string) {
	if s == nil {
		return
	}
	sh := extlog.Default()
	if !sh.LifecycleWanted() {
		return
	}
	var ctype int64
	var name, ctrl, exec string
	var wu *string
	var org *int64
	if err := s.DB.Pool.QueryRow(ctx, `SELECT polymorphic_ctype_id, name, work_unit_id, organization_id, COALESCE(controller_node, ''), COALESCE(execution_node, '')
		FROM main_unifiedjob WHERE id = $1`, id).Scan(&ctype, &name, &wu, &org, &ctrl, &exec); err != nil {
		return
	}
	model := strings.TrimPrefix(s.CT.Model(ctype), "main.")
	sh.LogLifecycle(ctx, extlog.Lifecycle{Type: model, TaskID: id, State: state, WorkUnitID: wu, TaskName: name, BlockedBy: blockedBy,
		ControllerNode: ctrl, ExecutionNode: exec, OrganizationID: org})
}

// logPerformance is TimingMiddleware's perf_logger.debug record: the
// request, and the timing headers of its response as numbers.
func (s *Server) logPerformance(r *http.Request, h http.Header) {
	sh := extlog.Default()
	if !sh.Wants(extlog.PerformanceLogger, "DEBUG") {
		return
	}
	xapi := extlog.Ordered{}
	num := func(v string, float bool) any {
		if float {
			if f, err := strconv.ParseFloat(strings.TrimSuffix(v, "s"), 64); err == nil {
				return f
			}
			return v
		}
		if n, err := strconv.ParseInt(v, 10, 64); err == nil {
			return n
		}
		return v
	}
	for _, k := range []struct {
		name string
		kind int // 0 float, 1 int, 2 str
	}{{"X-API-Time", 0}, {"X-API-Total-Time", 0}, {"X-API-Query-Count", 1}, {"X-API-Query-Time", 0}, {"X-API-Node", 2}} {
		v := h.Values(k.name)
		if len(v) == 0 {
			continue
		}
		var val any = v[0]
		if k.kind != 2 {
			val = num(v[0], k.kind == 0)
		}
		xapi = append(xapi, extlog.Field{Key: k.name, Value: val})
	}
	req := extlog.Ordered{{Key: "method", Value: r.Method}, {Key: "path", Value: r.URL.Path}, {Key: "path_info", Value: r.URL.Path}, {Key: "query_string", Value: r.URL.RawQuery}}
	msg := fmt.Sprintf("request: <ASGIRequest: %s %s>, response_time: %s", r.Method, pyRepr(r.URL.RequestURI()), h.Get("X-API-Total-Time"))
	sh.Emit(extlog.Record{Time: time.Now(), Logger: extlog.PerformanceLogger, Level: "DEBUG", Message: msg,
		Data: []extlog.Field{{Key: "x_api", Value: xapi}, {Key: "request", Value: req}}})
}
