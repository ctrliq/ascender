package api

import (
	"context"
	"fmt"
	"github.com/ctrliq/ascender/internal/db"
	"math"
	"net/http"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

// metrics/ (MetricsView): the Prometheus exposition of the database gauges
// (analytics.metrics, under both the ascender_ and the former awx_ names)
// and the per-node subsystem metrics; ?format=json is the
// PrometheusJSONRenderer's reading of the same text.

func init() {
	resourceRegistrars = append(resourceRegistrars, func(s *Server, mux *http.ServeMux) {
		s.route(mux, "/api/v2/metrics/{$}", methodMap{"GET": s.metricsView}, s.optionsFor("metrics"))
	})
}

type promWriter struct{ b strings.Builder }

func (p *promWriter) family(name, help, typ string) {
	fmt.Fprintf(&p.b, "# HELP %s %s\n# TYPE %s %s\n", name, help, name, typ)
}

// sample writes one sample with prometheus_client's float formatting.
func (p *promWriter) sample(name string, labels [][2]string, v float64) {
	p.b.WriteString(name)
	if len(labels) > 0 {
		sort.Slice(labels, func(i, j int) bool { return labels[i][0] < labels[j][0] })
		parts := make([]string, len(labels))
		for i, l := range labels {
			parts[i] = fmt.Sprintf(`%s="%s"`, l[0], strings.ReplaceAll(strings.ReplaceAll(l[1], `\`, `\\`), `"`, `\"`))
		}
		p.b.WriteString("{" + strings.Join(parts, ",") + "}")
	}
	p.b.WriteString(" " + promFloat(v) + "\n")
}

// promFloat is prometheus_client's floatToGoString: Python's repr of the
// value, switched to Go's exponent form once the integer part passes six
// digits.
func promFloat(v float64) string {
	switch {
	case math.IsInf(v, 1):
		return "+Inf"
	case math.IsInf(v, -1):
		return "-Inf"
	case math.IsNaN(v):
		return "NaN"
	case v >= 1e6 || v <= -1e16 || (v != 0 && math.Abs(v) < 1e-4):
		return strconv.FormatFloat(v, 'e', -1, 64)
	}
	s := strconv.FormatFloat(v, 'f', -1, 64)
	if !strings.Contains(s, ".") {
		s += ".0"
	}
	return s
}

func (s *Server) countOf(ctx context.Context, q string, args ...any) float64 {
	var n int64
	if err := s.Q().QueryRow(ctx, q, args...).Scan(&n); err != nil {
		s.Log.WarnContext(ctx, "metrics query failed", "err", err)
	}
	return float64(n)
}

// dbMetrics is analytics.metrics() with the ascender_ names.
func (s *Server) dbMetrics(ctx context.Context) string {
	p := &promWriter{}
	p.family("ascender_system_info", "Ascender System Information", "gauge")
	loggerType := s.Settings.String(ctx, "LOG_AGGREGATOR_TYPE")
	if loggerType == "" {
		loggerType = "None"
	}
	enabled := "False"
	if s.Settings.Bool(ctx, "LOG_AGGREGATOR_ENABLED") {
		enabled = "True"
	}
	p.sample("ascender_system_info", [][2]string{{"install_uuid", s.Settings.String(ctx, "INSTALL_UUID")}, {"tower_url_base", s.Settings.String(ctx, "ASCENDER_URL_BASE")},
		{"ascender_version", s.Cfg.Version}, {"tower_version", s.Cfg.Version}, {"external_logger_enabled", enabled}, {"external_logger_type", loggerType}}, 1)
	simple := [][3]string{
		{"ascender_organizations_total", "Number of organizations", `SELECT count(*) FROM main_organization`},
		{"ascender_users_total", "Number of users", `SELECT count(*) FROM auth_user`},
		{"ascender_teams_total", "Number of teams", `SELECT count(*) FROM main_team`},
		{"ascender_inventories_total", "Number of inventories", `SELECT count(*) FROM main_inventory`},
		{"ascender_projects_total", "Number of projects", `SELECT count(*) FROM main_project`},
		{"ascender_job_templates_total", "Number of job templates", `SELECT count(*) FROM main_jobtemplate`},
		{"ascender_workflow_job_templates_total", "Number of workflow job templates", `SELECT count(*) FROM main_workflowjobtemplate`},
	}
	for _, m := range simple {
		p.family(m[0], m[1], "gauge")
		p.sample(m[0], nil, s.countOf(ctx, m[2]))
	}
	p.family("ascender_hosts_total", "Number of hosts", "gauge")
	p.sample("ascender_hosts_total", [][2]string{{"type", "all"}}, s.countOf(ctx, `SELECT count(*) FROM main_host`))
	p.sample("ascender_hosts_total", [][2]string{{"type", "active"}}, s.countOf(ctx, `SELECT count(DISTINCT lower(h.name)) FROM main_host h JOIN main_inventory i ON i.id = h.inventory_id WHERE i.kind <> 'constructed'
		AND NOT EXISTS (SELECT 1 FROM main_host_inventory_sources hs JOIN main_inventorysource src ON src.unifiedjobtemplate_ptr_id = hs.inventorysource_id WHERE hs.host_id = h.id AND src.source = 'ascender')`))
	p.family("ascender_schedules_total", "Number of schedules", "gauge")
	p.sample("ascender_schedules_total", nil, s.countOf(ctx, `SELECT count(*) FROM main_schedule`))
	all := s.countOf(ctx, `SELECT count(*) FROM django_session WHERE expire_date >= now()`)
	user := s.countOf(ctx, `SELECT count(*) FROM main_usersessionmembership m JOIN django_session ds ON ds.session_key = m.session_id WHERE ds.expire_date >= now()`)
	p.family("ascender_sessions_total", "Number of sessions", "gauge")
	p.sample("ascender_sessions_total", [][2]string{{"type", "all"}}, all)
	p.sample("ascender_sessions_total", [][2]string{{"type", "user"}}, user)
	p.sample("ascender_sessions_total", [][2]string{{"type", "anonymous"}}, all-user)
	p.family("ascender_running_jobs_total", "Number of running jobs on the system", "gauge")
	p.sample("ascender_running_jobs_total", nil, s.countOf(ctx, `SELECT count(*) FROM main_unifiedjob WHERE launch_type <> 'sync' AND status IN ('running','waiting')`))
	p.family("ascender_pending_jobs_total", "Number of pending jobs on the system", "gauge")
	p.sample("ascender_pending_jobs_total", nil, s.countOf(ctx, `SELECT count(*) FROM main_unifiedjob WHERE launch_type <> 'sync' AND status = 'pending'`))
	var jobs int64
	var waitAvg, waitMax, runAvg, runMax float64
	_ = db.Tolerant(s.Q()).QueryRow(ctx, `SELECT count(*), COALESCE(EXTRACT(EPOCH FROM avg(started - created)), 0), COALESCE(EXTRACT(EPOCH FROM max(started - created)), 0),
		COALESCE(avg(elapsed), 0), COALESCE(max(elapsed), 0) FROM main_unifiedjob WHERE started IS NOT NULL AND created >= $1`, time.Now().Add(-60*time.Minute)).Scan(&jobs, &waitAvg, &waitMax, &runAvg, &runMax)
	timing := [][3]any{
		{"ascender_job_wait_seconds_average", "Mean seconds a job waited before the dispatcher started it, over the recent window", waitAvg},
		{"ascender_job_wait_seconds_longest", "Longest seconds a job waited before the dispatcher started it, over the recent window", waitMax},
		{"ascender_job_run_seconds_average", "Mean seconds a job ran once started, over the recent window", runAvg},
		{"ascender_job_run_seconds_longest", "Longest seconds a job ran once started, over the recent window", runMax},
		{"ascender_job_timing_sample_total", "Number of jobs the timing gauges above were taken from", float64(jobs)},
	}
	for _, t := range timing {
		p.family(t[0].(string), t[1].(string), "gauge")
		p.sample(t[0].(string), nil, t[2].(float64))
	}
	statuses := map[string]float64{}
	rows, err := s.Q().Query(ctx, `SELECT status, count(*) FROM main_unifiedjob WHERE launch_type <> 'sync' GROUP BY status`)
	if err == nil {
		for rows.Next() {
			var st string
			var n int64
			if rows.Scan(&st, &n) == nil {
				statuses[st] = float64(n)
			}
		}
		rows.Close()
		s.logRowsErr(ctx, "dbMetrics", rows)
	}
	p.family("ascender_status_total", "Status of Job launched", "gauge")
	for _, st := range []string{"canceled", "running", "waiting", "successful", "error", "failed", "pending"} {
		p.sample("ascender_status_total", [][2]string{{"status", st}}, statuses[st])
	}
	type inst struct {
		host, uuid, typ, version string
		capacity, cpu, memory    float64
		enabled, policy          bool
		consumed                 float64
	}
	var insts []inst
	ir, err := s.Q().Query(ctx, `SELECT hostname, uuid, node_type, version, capacity, cpu, memory, enabled, managed_by_policy FROM main_instance ORDER BY hostname`)
	if err == nil {
		for ir.Next() {
			var i inst
			var capacity, memory int64
			var cpu float64
			if ir.Scan(&i.host, &i.uuid, &i.typ, &i.version, &capacity, &cpu, &memory, &i.enabled, &i.policy) == nil {
				i.capacity, i.cpu, i.memory = float64(capacity), cpu, float64(memory)
				insts = append(insts, i)
			}
		}
		ir.Close()
		s.logRowsErr(ctx, "dbMetrics", ir)
	}
	for k := range insts {
		insts[k].consumed = s.countOf(ctx, `SELECT COALESCE(sum(task_impact), 0) FROM main_unifiedjob WHERE status IN ('running','waiting') AND (execution_node = $1 OR controller_node = $1)`, insts[k].host)
	}
	families := []struct{ name, help string }{
		{"ascender_instance_capacity", "Capacity of each node in the system"}, {"ascender_instance_cpu", "CPU cores on each node in the system"},
		{"ascender_instance_memory", "RAM (Kb) on each node in the system"}, {"ascender_instance_info", "Info about each node in the system"},
	}
	for _, f := range families {
		p.family(f.name, f.help, "gauge")
		for _, i := range insts {
			switch f.name {
			case "ascender_instance_capacity":
				p.sample(f.name, [][2]string{{"hostname", i.host}, {"instance_uuid", i.uuid}, {"node_type", i.typ}}, i.capacity)
			case "ascender_instance_cpu":
				p.sample(f.name, [][2]string{{"hostname", i.host}, {"instance_uuid", i.uuid}}, i.cpu)
			case "ascender_instance_memory":
				p.sample(f.name, [][2]string{{"hostname", i.host}, {"instance_uuid", i.uuid}}, i.memory)
			case "ascender_instance_info":
				p.sample(f.name, [][2]string{{"enabled", pyBoolStr(i.enabled)}, {"hostname", i.host}, {"instance_uuid", i.uuid}, {"managed_by_policy", pyBoolStr(i.policy)}, {"node_type", i.typ}, {"version", i.version}}, 1)
			}
		}
	}
	p.family("ascender_instance_launch_type_total", "Type of Job launched", "gauge")
	lr, err := s.Q().Query(ctx, `SELECT execution_node, launch_type, count(*) FROM main_unifiedjob WHERE launch_type <> 'sync' AND execution_node <> '' GROUP BY 1, 2 ORDER BY 1, 2`)
	if err == nil {
		for lr.Next() {
			var node, lt string
			var n int64
			if lr.Scan(&node, &lt, &n) == nil {
				p.sample("ascender_instance_launch_type_total", [][2]string{{"launch_type", lt}, {"node", node}}, float64(n))
			}
		}
		lr.Close()
		s.logRowsErr(ctx, "dbMetrics", lr)
	}
	p.family("ascender_instance_status_total", "Status of Job launched", "gauge")
	sr, err := s.Q().Query(ctx, `SELECT execution_node, status, count(*) FROM main_unifiedjob WHERE launch_type <> 'sync' AND execution_node <> '' GROUP BY 1, 2 ORDER BY 1, 2`)
	if err == nil {
		for sr.Next() {
			var node, st string
			var n int64
			if sr.Scan(&node, &st, &n) == nil {
				p.sample("ascender_instance_status_total", [][2]string{{"node", node}, {"status", st}}, float64(n))
			}
		}
		sr.Close()
		s.logRowsErr(ctx, "dbMetrics", sr)
	}
	p.family("ascender_instance_consumed_capacity", "Consumed capacity of each node in the system", "gauge")
	for _, i := range insts {
		p.sample("ascender_instance_consumed_capacity", [][2]string{{"hostname", i.host}, {"instance_uuid", i.uuid}, {"node_type", i.typ}}, i.consumed)
	}
	p.family("ascender_instance_remaining_capacity", "Remaining capacity of each node in the system", "gauge")
	for _, i := range insts {
		p.sample("ascender_instance_remaining_capacity", [][2]string{{"hostname", i.host}, {"instance_uuid", i.uuid}, {"node_type", i.typ}}, i.capacity-i.consumed)
	}
	p.family("ascender_database_connections_total", "Number of connections to database", "gauge")
	p.sample("ascender_database_connections_total", nil, s.countOf(ctx, `SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()`))
	text := p.b.String()
	return text + withFormerNames(text)
}

func pyBoolStr(b bool) string {
	if b {
		return "True"
	}
	return "False"
}

var formerHelpRe = regexp.MustCompile(`(?m)^(# (?:HELP|TYPE) )ascender_`)
var formerSampleRe = regexp.MustCompile(`(?m)^ascender_([A-Za-z0-9_]*[\s{])`)

// withFormerNames is the same families under their awx_ names.
func withFormerNames(text string) string {
	t := formerHelpRe.ReplaceAllString(text, "${1}awx_")
	return formerSampleRe.ReplaceAllString(t, "awx_$1")
}

// subsystemMetrics are the callback receiver's and the metrics pipe's
// per-node counters, as the task processes last published them (zero for
// a node that has published nothing yet). There is no Valkey queue in
// front of the Go event writer, so the queue size is always zero.
func (s *Server) subsystemMetrics(ctx context.Context, node, metric string) string {
	all, published := subsystemNodes(s.Cfg.ClusterHostID)
	var nodes []string
	for _, n := range all {
		if node == "" || node == n {
			nodes = append(nodes, n)
		}
	}
	val := func(n, name string) string {
		if v, ok := published[n]; ok {
			return subsystemValue(v, name)
		}
		return zeroValue(name)
	}
	gauges := [][2]string{
		{"callback_receiver_events_queue_size_redis", "Current number of events in valkey queue"},
		{"callback_receiver_events_popped_redis", "Number of events popped from valkey"},
		{"callback_receiver_events_in_memory", "Current number of events in memory (in transfer from valkey to db)"},
		{"callback_receiver_batch_events_errors", "Number of times batch insertion failed"},
		{"callback_receiver_events_insert_db_seconds", "Total time spent saving events to database"},
		{"callback_receiver_events_insert_db", "Number of events batch inserted into database"},
		{"callback_receiver_events_broadcast", "Number of events broadcast to other control plane nodes"},
	}
	var b strings.Builder
	want := func(name string) bool { return metric == "" || metric == name }
	for _, g := range gauges {
		if !want(g[0]) {
			continue
		}
		fmt.Fprintf(&b, "# HELP %s %s\n# TYPE %s gauge\n", g[0], g[1], g[0])
		for _, n := range nodes {
			fmt.Fprintf(&b, "%s{node=\"%s\"} %s\n", g[0], n, val(n, g[0]))
		}
	}
	if want("callback_receiver_batch_events_insert_db") {
		b.WriteString("# HELP callback_receiver_batch_events_insert_db Number of events batch inserted into database\n# TYPE callback_receiver_batch_events_insert_db histogram\n")
		for _, n := range nodes {
			for i, le := range []string{"10", "50", "150", "350", "650", "2000", "+Inf"} {
				bucket := "0"
				if v, ok := published[n]; ok {
					bucket = subsystemBucket(v, i)
				}
				fmt.Fprintf(&b, "callback_receiver_batch_events_insert_db_bucket{le=\"%s\",node=\"%s\"} %s\n", le, n, bucket)
			}
			fmt.Fprintf(&b, "callback_receiver_batch_events_insert_db_count{node=\"%s\"} %s\n", n, val(n, "callback_receiver_batch_events_insert_db_count"))
			fmt.Fprintf(&b, "callback_receiver_batch_events_insert_db_sum{node=\"%s\"} %s\n", n, val(n, "callback_receiver_batch_events_insert_db_sum"))
		}
	}
	if want("callback_receiver_event_processing_avg_seconds") {
		b.WriteString("# HELP callback_receiver_event_processing_avg_seconds Average processing time per event per callback receiver batch\n# TYPE callback_receiver_event_processing_avg_seconds gauge\n")
		for _, n := range nodes {
			fmt.Fprintf(&b, "callback_receiver_event_processing_avg_seconds{node=\"%s\"} %s\n", n, val(n, "callback_receiver_event_processing_avg_seconds"))
		}
	}
	pipe := [][2]string{{"subsystem_metrics_pipe_execute_seconds", "Time spent saving metrics to valkey"}, {"subsystem_metrics_pipe_execute_calls", "Number of calls to pipe_execute"},
		{"subsystem_metrics_send_metrics_seconds", "Time spent sending metrics to other nodes"}}
	for _, g := range pipe {
		if !want(g[0]) {
			continue
		}
		fmt.Fprintf(&b, "# HELP %s %s\n# TYPE %s gauge\n", g[0], g[1], g[0])
		for _, n := range nodes {
			fmt.Fprintf(&b, "%s{node=\"%s\",subsystem=\"callback_receiver\"} %s\n", g[0], n, val(n, g[0]))
		}
	}
	return b.String()
}

func (s *Server) metricsView(w http.ResponseWriter, r *http.Request) error {
	u, err := RequireUser(r)
	anonymous := s.Settings.Bool(r.Context(), "ALLOW_METRICS_FOR_ANONYMOUS_USERS")
	if err != nil && !anonymous {
		return err
	}
	if !anonymous && !u.IsSuperuser && !u.IsSystemAuditor {
		return ErrForbidden
	}
	q := r.URL.Query()
	ctx := r.Context()
	text := ""
	if q.Get("subsystemonly") != "1" {
		text += s.dbMetrics(ctx)
	}
	if q.Get("dbonly") != "1" {
		text += s.subsystemMetrics(ctx, q.Get("node"), q.Get("metric"))
	}
	if q.Get("format") == "json" {
		WriteJSON(w, 200, promTextToJSON(text))
		return nil
	}
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.WriteHeader(200)
	_, _ = w.Write([]byte(text))
	return nil
}

var promSampleRe = regexp.MustCompile(`^([A-Za-z_:][A-Za-z0-9_:]*)(\{(.*)\})? (\S+)$`)
var promLabelRe = regexp.MustCompile(`([A-Za-z_][A-Za-z0-9_]*)="((?:[^"\\]|\\.)*)"`)

// promTextToJSON is the PrometheusJSONRenderer: each family's help text,
// type and samples.
func promTextToJSON(text string) *OMap {
	out := NewOMap()
	help := map[string]string{}
	types := map[string]string{}
	for _, line := range strings.Split(text, "\n") {
		switch {
		case strings.HasPrefix(line, "# HELP "):
			parts := strings.SplitN(line[7:], " ", 2)
			if len(parts) == 2 {
				help[parts[0]] = parts[1]
			}
		case strings.HasPrefix(line, "# TYPE "):
			parts := strings.SplitN(line[7:], " ", 2)
			if len(parts) == 2 {
				types[parts[0]] = parts[1]
				if !out.Has(parts[0]) {
					out.Set(parts[0], NewOMap().Set("help_text", help[parts[0]]).Set("type", parts[1]).Set("samples", []any{}))
				}
			}
		case line == "" || strings.HasPrefix(line, "#"):
		default:
			m := promSampleRe.FindStringSubmatch(line)
			if m == nil {
				continue
			}
			name, family, sampleType := m[1], m[1], ""
			for _, suf := range []string{"_bucket", "_count", "_sum"} {
				base := strings.TrimSuffix(name, suf)
				if base != name && types[base] == "histogram" {
					family, sampleType = base, strings.TrimPrefix(suf, "_")
				}
			}
			fam, _ := out.Get(family)
			fm, ok := fam.(*OMap)
			if !ok {
				continue
			}
			labels := NewOMap()
			for _, lm := range promLabelRe.FindAllStringSubmatch(m[3], -1) {
				labels.Set(lm[1], lm[2])
			}
			var value any
			if n, err := strconv.ParseInt(m[4], 10, 64); err == nil {
				value = n
			} else if f, err := strconv.ParseFloat(m[4], 64); err == nil {
				value = fixedFloat(f)
			}
			sample := NewOMap().Set("labels", labels).Set("value", value)
			if sampleType != "" {
				sample.Set("sample_type", sampleType)
			}
			samples, _ := fm.Get("samples")
			fm.Set("samples", append(samples.([]any), sample))
		}
	}
	return out
}

func zeroValue(name string) string {
	if strings.HasSuffix(name, "_seconds") {
		return "0.0"
	}
	return "0"
}
