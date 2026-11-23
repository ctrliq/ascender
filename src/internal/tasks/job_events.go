package tasks

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/ctrliq/ascender/internal/extlog"
	"github.com/ctrliq/ascender/internal/models"
	"github.com/ctrliq/ascender/internal/redact"
	"github.com/jackc/pgx/v5"
)

// failedEvents are the event types that mark an event failed
// (BasePlaybookEvent.FAILED_EVENTS).
var failedEvents = map[string]bool{
	"runner_on_failed": true, "runner_on_error": true, "runner_on_unreachable": true,
	"runner_on_async_failed": true, "runner_item_on_failed": true, "error": true,
}

// jobEventSink stores a job's events the way the callback receiver did:
// rows go in batches in counter order, and the playbook_on_stats event
// produces the host summaries, host metrics, inventory counts and the
// job's host_status_counts.
type jobEventSink struct {
	d             *Dispatcher
	ctx           context.Context
	job           *models.Job
	hostMap       map[string]int64 // host name -> id in the job's inventory
	inventoryKind string
	workflowJobID *int64
	// adHoc stores AdHocCommandEvents: their own table and failure rules,
	// and only the host status counts from the stats event.
	adHoc bool
	// projectUpdate stores ProjectUpdateEvents: the playbook event rules,
	// no hosts, and only the host status counts from the stats event.
	projectUpdate bool
	// observe sees every event as it arrives (RunnerCallback subclasses'
	// event_handler).
	observe func(event string, data map[string]any)

	mu        sync.Mutex
	pending   []*sinkEvent
	count     int64
	artifacts map[string]any
	lastErr   error
	statsSeen bool
	// noCreated: events that came without a created time, left out of the
	// processing time metric.
	noCreated map[*sinkEvent]bool
	// tries counts the failed one-by-one saves of events kept for the
	// next flush; only the flushing goroutine uses it.
	tries map[*sinkEvent]int
	stop  chan struct{}
	done  chan struct{}
	// persisted are the counters of events a resumed read finds saved
	// already, which are not dispatched again.
	persisted map[int64]bool
	// wrapup is when the wrapup event was created, on the execution
	// node's clock.
	wrapup time.Time
	// throttle holds back websocket messages over MAX_WEBSOCKET_EVENT_RATE.
	throttle *wsThrottle
}

// sinkEvent is an event on its way to its row, with the event_data text
// the row gets (eventDataText).
type sinkEvent struct {
	*models.JobEvent
	data string
	// skipWS: the throttle held back its websocket message.
	skipWS bool
}

// resumeFrom sets the sink up for a resumed read: the saved events are
// skipped, and counted, so the event count describes the whole job.
func (s *jobEventSink) resumeFrom(persisted map[int64]bool) {
	s.mu.Lock()
	s.persisted = persisted
	s.count = int64(len(persisted))
	s.mu.Unlock()
}

// wrapupCreated is when the wrapup event was created (zero if none came).
func (s *jobEventSink) wrapupCreated() time.Time {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.wrapup
}

// abandon stores what was received and stops, without announcing the end
// of the job's events: a stream left for another task is not the end.
func (s *jobEventSink) abandon() {
	close(s.stop)
	<-s.done
}

func newJobEventSink(ctx context.Context, d *Dispatcher, job *models.Job, hostMap map[string]int64, inventoryKind string, workflowJobID *int64) *jobEventSink {
	s := &jobEventSink{d: d, ctx: ctx, job: job, hostMap: hostMap, inventoryKind: inventoryKind, workflowJobID: workflowJobID, throttle: newWSThrottle(ctx, d), stop: make(chan struct{}), done: make(chan struct{})}
	go s.loop()
	return s
}

// loop flushes pending events twice a second until stopped. A panic in a
// flush is logged and the loop goes on: it would otherwise end the task
// process and every job it runs.
func (s *jobEventSink) loop() {
	defer close(s.done)
	t := time.NewTicker(500 * time.Millisecond)
	defer t.Stop()
	for {
		select {
		case <-t.C:
			s.d.safely("job event flush", func() { s.flush(false) })
		case <-s.stop:
			// The last flushes: events kept for another try get their
			// remaining tries now.
			for more := true; more; {
				more = false
				s.d.safely("job event flush", func() { more = s.flush(true) })
			}
			return
		}
	}
}

// close flushes everything and waits for the writer.
func (s *jobEventSink) close() error {
	close(s.stop)
	<-s.done
	if s.d.API != nil {
		// The EOF event's jobs-summary.
		s.mu.Lock()
		n := s.count
		s.mu.Unlock()
		s.d.API.EmitJobSummary(s.ctx, s.job.ID, n)
	}
	return s.lastErr
}

// handle is RunnerCallback.event_handler followed by
// JobEvent.create_from_data: it turns a runner event into a row.
func (s *jobEventSink) handle(ev runnerEvent) {
	event, _ := ev["event"].(string)
	if event == "EOF" || event == "keepalive" || event == "" {
		return
	}
	data, _ := ev["event_data"].(map[string]any)
	if data == nil {
		data = map[string]any{}
	}
	stdout, _ := ev["stdout"].(string)
	if s.projectUpdate {
		// RunnerCallbackForProjectUpdate's UriCleaner pass: SCM modules
		// print the clone URL, basic auth credentials included, in their
		// arguments and errors. Every project update event is cleaned
		// before it is stored or sent to the websocket.
		data, _ = redact.URIsIn(data).(map[string]any)
		stdout = redact.URIs(stdout)
	}
	// event_handler adds the task's guid to the event's data.
	guid := extlog.GUID(s.ctx)
	if _, ok := ev["event_data"]; ok {
		data["guid"] = guid
	}
	e := &sinkEvent{JobEvent: &models.JobEvent{Event: event, EventData: data, JobID: s.job.ID, JobCreated: s.job.Created},
		data: eventDataText(ev, data, guid, s.projectUpdate)}
	if u, ok := ev["uuid"].(string); ok {
		e.UUID = u
	}
	if p, ok := ev["parent_uuid"].(string); ok {
		e.ParentUUID = p
	}
	e.Counter = toInt(ev["counter"])
	e.StartLine = toInt(ev["start_line"])
	e.EndLine = toInt(ev["end_line"])
	e.Verbosity = toInt(ev["verbosity"])
	e.Stdout = stdout
	if c, ok := ev["created"].(string); ok {
		e.Created = parseEventTime(c)
	}
	if e.Created.IsZero() {
		e.Created = time.Now()
		s.mu.Lock()
		if s.noCreated == nil {
			s.noCreated = map[*sinkEvent]bool{}
		}
		s.noCreated[e] = true
		s.mu.Unlock()
	}
	e.Modified = e.Created
	callbackMetrics.eventsReceived(1)
	if s.persisted[e.Counter] {
		// A replayed event that is stored already leaves memory at once.
		callbackMetrics.discarded(1)
	}
	if s.observe != nil {
		s.observe(event, data)
	}
	if host, ok := data["host"].(string); ok && strings.TrimSpace(host) != "" {
		e.HostName = strings.TrimSpace(host)
		if id, ok := s.hostMap[e.HostName]; ok {
			hid := id
			e.HostID = &hid
		}
	}
	// _update_from_event_data
	if s.adHoc {
		if event == "runner_on_failed" || event == "runner_on_unreachable" {
			if ie, _ := data["ignore_errors"].(bool); !ie {
				e.Failed = true
			}
		}
	} else if failedEvents[event] {
		if ie, _ := data["ignore_errors"].(bool); !ie {
			e.Failed = true
		}
	}
	if res, ok := data["res"].(map[string]any); ok {
		if ch, _ := res["changed"].(bool); ch {
			e.Changed = true
		}
	}
	if event == "playbook_on_stats" && !s.adHoc {
		e.Failed = sumCounts(data["failures"])+sumCounts(data["dark"]) > 0
		e.Changed = sumCounts(data["changed"]) > 0
	}
	for _, f := range []string{"playbook", "play", "task", "role"} {
		v := strings.TrimSpace(fmt.Sprint(stringOr(data[f])))
		if len(v) > 1024 {
			v = v[:1021] + "…"
		}
		switch f {
		case "playbook":
			e.Playbook = v
		case "play":
			e.Play = v
		case "task":
			e.Task = v
		case "role":
			e.Role = v
		}
	}
	// Artifacts come from set_stats; the stats event adds the automatic
	// ascender_stats_* keys.
	var artifacts map[string]any
	if ad, ok := data["artifact_data"].(map[string]any); ok && len(ad) > 0 {
		artifacts = ad
	}
	if event == "playbook_on_stats" {
		if stats := s.statsArtifacts(data); len(stats) > 0 {
			for k, v := range artifacts {
				stats[k] = v
			}
			artifacts = stats
		}
	}
	// The persisted set is fixed before the first event, so it is read
	// without the lock.
	if !s.persisted[e.Counter] {
		// Decided as the event arrives, as event_handler did, not when it
		// is stored.
		e.skipWS = !s.throttle.emit(event, e.Stdout, e.StartLine, e.EndLine)
		s.emitEvent(e)
	}
	s.mu.Lock()
	if event == "playbook_on_stats" {
		s.wrapup = e.Created
	}
	if s.persisted[e.Counter] {
		// Replayed by a resumed read and saved already: not dispatched
		// again, but its artifacts still count, since the launch that saw
		// it first never finalized the job.
		delete(s.noCreated, e)
		if artifacts != nil {
			s.artifacts = artifacts
		}
		s.mu.Unlock()
		return
	}
	s.pending = append(s.pending, e)
	s.count++
	if artifacts != nil {
		s.artifacts = artifacts
	}
	s.mu.Unlock()
}

func stringOr(v any) string {
	if v == nil {
		return ""
	}
	if s, ok := v.(string); ok {
		return s
	}
	return fmt.Sprint(v)
}

func toInt(v any) int64 {
	switch t := v.(type) {
	case float64:
		return int64(t)
	case int64:
		return t
	case int:
		return int64(t)
	case json.Number:
		n, _ := t.Int64()
		return n
	}
	return 0
}

func sumCounts(v any) int64 {
	m, _ := v.(map[string]any)
	var n int64
	for _, c := range m {
		n += toInt(c)
	}
	return n
}

// parseEventTime reads the callback's naive UTC isoformat timestamps.
func parseEventTime(s string) time.Time {
	for _, layout := range []string{"2006-01-02T15:04:05.999999", "2006-01-02T15:04:05.999999Z07:00", time.RFC3339Nano, "2006-01-02T15:04:05"} {
		if t, err := time.Parse(layout, s); err == nil {
			return t.UTC()
		}
	}
	return time.Time{}
}

// flush writes the pending rows and, after the stats event, the
// summaries; it reports whether events are kept for another try. final
// is the sink's last flush (see saveEvents).
func (s *jobEventSink) flush(final bool) bool {
	s.mu.Lock()
	batch := s.pending
	s.pending = nil
	missing := 0
	for _, e := range batch {
		if s.noCreated[e] {
			missing++
			delete(s.noCreated, e)
		}
	}
	s.mu.Unlock()
	if len(batch) == 0 {
		return false
	}
	ctx := s.ctx
	// modified is when the event was stored, as the callback receiver set it.
	now := time.Now()
	var processing time.Duration
	for _, e := range batch {
		processing += now.Sub(e.Created)
		e.Modified = now
	}
	if s.tries == nil {
		s.tries = map[*sinkEvent]int{}
	}
	insert := func(e *sinkEvent) eventInsert {
		data := e.data
		if s.projectUpdate {
			return eventInsert{`INSERT INTO main_projectupdateevent (created, modified, event, event_data, failed, changed, uuid, playbook, play, role, task, counter, stdout, verbosity, start_line, end_line, project_update_id, job_created)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18) ON CONFLICT DO NOTHING RETURNING id`,
				[]any{e.Created, e.Modified, e.Event, data, e.Failed, e.Changed, e.UUID, e.Playbook, e.Play, e.Role, e.Task, e.Counter, e.Stdout, e.Verbosity, e.StartLine, e.EndLine, e.JobID, e.JobCreated}}
		}
		if s.adHoc {
			return eventInsert{`INSERT INTO main_adhoccommandevent (created, modified, host_name, event, event_data, failed, changed, counter, host_id, ad_hoc_command_id, end_line, start_line, stdout, uuid, verbosity, job_created)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) ON CONFLICT DO NOTHING RETURNING id`,
				[]any{e.Created, e.Modified, e.HostName, e.Event, data, e.Failed, e.Changed, e.Counter, e.HostID, e.JobID, e.EndLine, e.StartLine, e.Stdout, e.UUID, e.Verbosity, e.JobCreated}}
		}
		return eventInsert{`INSERT INTO main_jobevent (created, modified, event, event_data, failed, changed, uuid, playbook, play, role, task, counter, stdout, verbosity, start_line, end_line, job_id, job_created, host_id, host_name, parent_uuid)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21) ON CONFLICT DO NOTHING RETURNING id`,
			[]any{e.Created, e.Modified, e.Event, data, e.Failed, e.Changed, e.UUID, e.Playbook, e.Play, e.Role, e.Task, e.Counter, e.Stdout, e.Verbosity, e.StartLine, e.EndLine, e.JobID, e.JobCreated, e.HostID, e.HostName, e.ParentUUID}}
	}
	logf := func(level, msg string, args ...any) {
		args = append([]any{"id", s.job.ID}, args...)
		switch level {
		case "error":
			s.d.Log.Error(msg, args...)
		case "warn":
			s.d.Log.Warn(msg, args...)
		default:
			s.d.Log.Info(msg, args...)
		}
	}
	out := saveEvents(ctx, s.d.DB.Pool, batch, s.tries, insert, func(e *sinkEvent) bool { return stripNULs(&e.Stdout) }, final, logf)
	if len(out.retry) > 0 {
		s.mu.Lock()
		s.pending = append(out.retry, s.pending...)
		s.mu.Unlock()
	}
	if out.lastErr != nil {
		s.mu.Lock()
		s.lastErr = out.lastErr
		s.mu.Unlock()
	}
	for i, e := range out.saved {
		e.ID = out.ids[i]
	}
	broadcast := 0
	if s.d.API != nil {
		for _, e := range out.saved {
			if !e.skipWS {
				broadcast++
			}
		}
	}
	callbackMetrics.recordSave(out.bulk, out.singular, out.batchErrors, out.duplicates, out.dropped, out.took, broadcast, processing, missing)
	table := "main_jobevent"
	if s.adHoc {
		table = "main_adhoccommandevent"
	} else if s.projectUpdate {
		table = "main_projectupdateevent"
	}
	for _, e := range out.saved {
		if s.d.API != nil && !e.skipWS {
			s.d.API.EmitEventDetail(ctx, table, e.ID, e.JobID, e.JobCreated, e.Event)
		}
		if e.Event == "playbook_on_stats" {
			s.onStats(e.JobEvent)
		}
	}
	return len(out.retry) > 0
}

// onStats is the stats wrap-up: host summaries, host metrics, inventory
// counts, parent flag propagation and the job's host_status_counts.
func (s *jobEventSink) onStats(e *models.JobEvent) {
	ctx := s.ctx
	s.mu.Lock()
	s.statsSeen = true
	s.mu.Unlock()
	if s.adHoc || s.projectUpdate {
		counts, _ := json.Marshal(hostStatusCounts(e.EventData))
		if _, err := s.d.DB.Pool.Exec(ctx, `UPDATE main_unifiedjob SET host_status_counts = $2::jsonb WHERE id = $1`, s.job.ID, string(counts)); err != nil {
			s.d.Log.Warn("host status counts", "ad_hoc_command", s.job.ID, "err", err)
		}
		s.d.lifecycle(ctx, s.job.ID, "stats_wrapup_finished")
		return
	}
	if s.job.InventoryID != nil {
		if err := s.hostSummaries(ctx, e); err != nil {
			s.d.Log.Error("host summaries", "job", s.job.ID, "err", err)
		}
		if err := models.UpdateInventoryComputedFields(ctx, s.d.DB.Pool, *s.job.InventoryID); err != nil {
			s.d.Log.Warn("inventory computed fields", "inventory", *s.job.InventoryID, "err", err)
		}
	}
	for _, col := range []string{"changed", "failed"} {
		if _, err := s.d.DB.Pool.Exec(ctx, fmt.Sprintf(`UPDATE main_jobevent SET %[1]s = true WHERE job_id = $1 AND job_created = $2 AND uuid IN (SELECT DISTINCT parent_uuid FROM main_jobevent WHERE job_id = $1 AND job_created = $2 AND %[1]s = true AND parent_uuid <> '')`, col), s.job.ID, s.job.Created); err != nil {
			s.d.Log.Warn("event flag propagation", "job", s.job.ID, "err", err)
		}
	}
	counts, _ := json.Marshal(hostStatusCounts(e.EventData))
	if _, err := s.d.DB.Pool.Exec(ctx, `UPDATE main_unifiedjob SET host_status_counts = $2::jsonb WHERE id = $1`, s.job.ID, string(counts)); err != nil {
		s.d.Log.Warn("host status counts", "job", s.job.ID, "err", err)
	}
	s.d.lifecycle(ctx, s.job.ID, "stats_wrapup_finished")
}

// hostStatusCounts is create_host_status_counts: each host's last status
// in the order skipped, ok, changed, failures, dark, counted per status.
func hostStatusCounts(data map[string]any) map[string]int {
	status := map[string]string{}
	for _, key := range []string{"skipped", "ok", "changed", "failures", "dark"} {
		if m, ok := data[key].(map[string]any); ok {
			for host := range m {
				status[host] = key
			}
		}
	}
	out := map[string]int{}
	for _, st := range status {
		out[st]++
	}
	return out
}

// hostSummaries is JobEvent._update_host_summary_from_stats.
func (s *jobEventSink) hostSummaries(ctx context.Context, e *models.JobEvent) error {
	names := map[string]bool{}
	for _, stat := range []string{"changed", "dark", "failures", "ok", "processed", "skipped"} {
		if m, ok := e.EventData[stat].(map[string]any); ok {
			for h := range m {
				names[h] = true
			}
		}
	}
	if len(names) == 0 {
		return nil
	}
	hostMap := s.hostMap
	constructedMap := map[string]int64{}
	if s.inventoryKind == "constructed" {
		// Summaries of a constructed inventory point at the real hosts; the
		// constructed host is kept beside it.
		constructedMap = s.hostMap
		hostMap = map[string]int64{}
		rows, err := s.d.DB.Pool.Query(ctx, `SELECT h.id, h.name FROM main_host h WHERE h.id IN (SELECT NULLIF(c.instance_id, '')::integer FROM main_host c WHERE c.inventory_id = $1 AND c.instance_id ~ '^[0-9]+$')`, *s.job.InventoryID)
		if err != nil {
			return err
		}
		for rows.Next() {
			var id int64
			var name string
			if err := rows.Scan(&id, &name); err != nil {
				rows.Close()
				return err
			}
			hostMap[name] = id
		}
		rows.Close()
	}
	existing := map[int64]bool{}
	var ids []int64
	for _, id := range hostMap {
		ids = append(ids, id)
	}
	if len(ids) > 0 {
		rows, err := s.d.DB.Pool.Query(ctx, `SELECT id FROM main_host WHERE id = ANY($1)`, ids)
		if err != nil {
			return err
		}
		for rows.Next() {
			var id int64
			_ = rows.Scan(&id)
			existing[id] = true
		}
		rows.Close()
	}
	sorted := make([]string, 0, len(names))
	for h := range names {
		sorted = append(sorted, h)
	}
	sort.Strings(sorted)
	now := time.Now()
	b := &pgx.Batch{}
	var lowered []string
	for _, host := range sorted {
		lowered = append(lowered, strings.ToLower(host))
		var hostID, constructedID *int64
		if id, ok := hostMap[host]; ok && existing[id] {
			v := id
			hostID = &v
		}
		if id, ok := constructedMap[host]; ok {
			v := id
			constructedID = &v
		}
		stat := func(k string) int64 {
			if m, ok := e.EventData[k].(map[string]any); ok {
				return toInt(m[host])
			}
			return 0
		}
		changed, dark, failures, ignored, okc, processed, rescued, skipped := stat("changed"), stat("dark"), stat("failures"), stat("ignored"), stat("ok"), stat("processed"), stat("rescued"), stat("skipped")
		b.Queue(`INSERT INTO main_jobhostsummary (created, modified, host_name, changed, dark, failures, ok, processed, skipped, failed, host_id, job_id, ignored, rescued, constructed_host_id)
			VALUES ($1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
			now, host, changed, dark, failures, okc, processed, skipped, dark > 0 || failures > 0, hostID, s.job.ID, ignored, rescued, constructedID)
	}
	res := s.d.DB.Pool.SendBatch(ctx, b)
	var err error
	for range sorted {
		if _, e := res.Exec(); e != nil && err == nil {
			err = e
		}
	}
	_ = res.Close()
	if err != nil {
		return err
	}
	// Host metrics: one row per host name automated, counting the runs.
	for _, name := range lowered {
		if _, err := s.d.DB.Pool.Exec(ctx, `INSERT INTO main_hostmetric (hostname, first_automation, last_automation, automated_counter, deleted_counter, deleted) VALUES ($1, $2, $2, 0, 0, false) ON CONFLICT (hostname) DO NOTHING`, name, now); err != nil {
			return err
		}
	}
	_, err = s.d.DB.Pool.Exec(ctx, `UPDATE main_hostmetric SET last_automation = $2, automated_counter = automated_counter + 1, deleted = false WHERE hostname = ANY($1)`, lowered, now)
	return err
}

// statsArtifacts are the automatic ascender_stats_* artifacts of the stats
// event (build_stats_artifacts), unless the setting or the job's own
// ASCENDER_AUTO_STATS_ENABLED variable turns them off.
func (s *jobEventSink) statsArtifacts(data map[string]any) map[string]any {
	jobVars, _ := parseVars(s.job.ExtraVars)
	enabled := s.d.Settings.Bool(s.ctx, "ASCENDER_AUTO_STATS_ENABLED")
	if v, ok := jobVars["ASCENDER_AUTO_STATS_ENABLED"]; ok {
		enabled = settingBool(v, enabled)
	}
	if !enabled {
		return nil
	}
	maxHosts := int(s.d.Settings.Int(s.ctx, "ASCENDER_AUTO_STATS_MAX_HOSTS"))
	if v, ok := jobVars["ASCENDER_AUTO_STATS_MAX_HOSTS"]; ok {
		if n, ok := settingInt(v); ok && n >= 0 {
			maxHosts = n
		}
	}
	counts := map[string]map[string]any{}
	all := map[string]bool{}
	for _, stat := range []string{"changed", "failures", "dark", "ok", "processed", "skipped", "ignored", "rescued"} {
		m, _ := data[stat].(map[string]any)
		if m == nil {
			m = map[string]any{}
		}
		counts[stat] = m
		for h := range m {
			all[h] = true
		}
	}
	var changed, nonChanged, failed, nonFailed []string
	for h := range all {
		if toInt(counts["changed"][h]) > 0 {
			changed = append(changed, h)
		} else {
			nonChanged = append(nonChanged, h)
		}
		if toInt(counts["failures"][h]) > 0 || toInt(counts["dark"][h]) > 0 {
			failed = append(failed, h)
		} else {
			nonFailed = append(nonFailed, h)
		}
	}
	for _, l := range [][]string{changed, nonChanged, failed, nonFailed} {
		sort.Strings(l)
	}
	out := map[string]any{
		"ascender_stats_changed":         len(changed) > 0,
		"ascender_stats_failed":          len(failed) > 0,
		"ascender_stats_hosts_truncated": len(all) > maxHosts,
	}
	if len(all) <= maxHosts {
		out["ascender_stats_changed_hosts"] = emptyIfNil(changed)
		out["ascender_stats_non_changed_hosts"] = emptyIfNil(nonChanged)
		out["ascender_stats_failed_hosts"] = emptyIfNil(failed)
		out["ascender_stats_non_failed_hosts"] = emptyIfNil(nonFailed)
	}
	return out
}

func emptyIfNil(l []string) []string {
	if l == nil {
		return []string{}
	}
	return l
}

func settingBool(v any, def bool) bool {
	switch t := v.(type) {
	case bool:
		return t
	case float64:
		if t == 0 || t == 1 {
			return t == 1
		}
	case string:
		switch strings.ToLower(strings.TrimSpace(t)) {
		case "true", "yes", "on", "1":
			return true
		case "false", "no", "off", "0":
			return false
		}
	}
	return def
}

func settingInt(v any) (int, bool) {
	switch t := v.(type) {
	case bool:
		return 0, false
	case float64:
		return int(t), true
	case string:
		var n int
		if _, err := fmt.Sscanf(strings.TrimSpace(t), "%d", &n); err == nil {
			return n, true
		}
	}
	return 0, false
}
