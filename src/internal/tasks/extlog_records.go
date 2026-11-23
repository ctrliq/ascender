package tasks

import (
	"context"
	"fmt"
	"time"

	"github.com/ctrliq/ascender/internal/api"
	"github.com/ctrliq/ascender/internal/extlog"
	"github.com/ctrliq/ascender/internal/models"
)

// The job_events record: JobEvent._update_from_event_data logged every
// playbook, project update and ad hoc command event as it was taken in
// ("Event data saved."), and reformat_data_for_log turned the unsaved
// event into its fields, in the model's field order, with the event's
// display, before the id and modified existed.

// emitEvent sends the record of an event the sink dispatches.
func (s *jobEventSink) emitEvent(e *sinkEvent) {
	sh := extlog.Default()
	if !sh.Wants(extlog.JobEventsLogger, "INFO") {
		return
	}
	kind := "job"
	switch {
	case s.adHoc:
		kind = "adhoc"
	case s.projectUpdate:
		kind = "projectupdate"
	}
	sh.Emit(extlog.Record{Time: time.Now(), Logger: extlog.JobEventsLogger, Level: "INFO", Message: "Event data saved.", Data: eventRecordData(e.JobEvent, e.data, kind, s.workflowJobID)})
}

// eventRecordData is the record's data. event_data is the stored text
// (dataText) with its keys in their order and the guid taken out, as
// the old formatter popped it; without the text, the decoded keys
// sorted.
func eventRecordData(e *models.JobEvent, dataText, kind string, workflowJobID *int64) []extlog.Field {
	type F = extlog.Field
	data := []F{}
	var ed any
	if obj, ok := extlog.OrderedObject(dataText); ok {
		rest := extlog.Ordered{}
		for _, f := range obj {
			if f.Key == "guid" {
				if f.Value != nil && f.Value != "" {
					data = append(data, F{Key: "guid", Value: f.Value})
				}
				continue
			}
			rest = append(rest, f)
		}
		ed = rest
	} else {
		m := e.EventData
		if g, ok := m["guid"]; ok && g != nil && g != "" {
			data = append(data, F{Key: "guid", Value: g})
		}
		rest := make(map[string]any, len(m))
		for k, v := range m {
			if k != "guid" {
				rest[k] = v
			}
		}
		ed = rest
	}
	var host any
	if e.HostID != nil {
		host = *e.HostID
	}
	at := func(t time.Time) any {
		if t.IsZero() {
			return nil
		}
		return extlog.Time(t)
	}
	plain := e.EventData
	if plain == nil {
		plain = map[string]any{}
	}
	display := api.EventDisplay(e.Event, e.Play, e.Task, e.Role, plain)
	switch kind {
	case "adhoc":
		display = api.EventDisplay(e.Event, "", "", "", nil)
		data = append(data, F{Key: "id", Value: nil}, F{Key: "event_data", Value: ed}, F{Key: "uuid", Value: e.UUID}, F{Key: "counter", Value: e.Counter},
			F{Key: "stdout", Value: e.Stdout}, F{Key: "verbosity", Value: e.Verbosity}, F{Key: "start_line", Value: e.StartLine}, F{Key: "end_line", Value: e.EndLine},
			F{Key: "created", Value: at(e.Created)}, F{Key: "modified", Value: nil}, F{Key: "event", Value: e.Event}, F{Key: "failed", Value: e.Failed},
			F{Key: "changed", Value: e.Changed}, F{Key: "ad_hoc_command", Value: e.JobID}, F{Key: "host", Value: host}, F{Key: "host_name", Value: e.HostName},
			F{Key: "job_created", Value: at(e.JobCreated)})
	default:
		data = append(data, F{Key: "id", Value: nil}, F{Key: "event", Value: e.Event}, F{Key: "event_data", Value: ed}, F{Key: "failed", Value: e.Failed},
			F{Key: "changed", Value: e.Changed}, F{Key: "uuid", Value: e.UUID}, F{Key: "playbook", Value: e.Playbook}, F{Key: "play", Value: e.Play},
			F{Key: "role", Value: e.Role}, F{Key: "task", Value: e.Task}, F{Key: "counter", Value: e.Counter}, F{Key: "stdout", Value: e.Stdout},
			F{Key: "verbosity", Value: e.Verbosity}, F{Key: "start_line", Value: e.StartLine}, F{Key: "end_line", Value: e.EndLine},
			F{Key: "created", Value: at(e.Created)}, F{Key: "modified", Value: nil})
		if kind == "projectupdate" {
			data = append(data, F{Key: "project_update", Value: e.JobID}, F{Key: "job_created", Value: at(e.JobCreated)})
		} else {
			data = append(data, F{Key: "job", Value: e.JobID}, F{Key: "host", Value: host}, F{Key: "host_name", Value: e.HostName},
				F{Key: "parent_uuid", Value: e.ParentUUID}, F{Key: "job_created", Value: at(e.JobCreated)})
		}
	}
	data = append(data, F{Key: "event_display", Value: display})
	if workflowJobID != nil {
		data = append(data, F{Key: "workflow_job_id", Value: *workflowJobID})
	}
	return data
}

// factsLogger is the service logger the fact records came from.
const factsLogger = "ascender.main.tasks.facts"

// factLog sends finish_fact_cache's per-host records: "New fact for
// inventory <name> host <name>" with the facts, and "Facts cleared for
// inventory <name> host <name>".
type factLog struct {
	d        *Dispatcher
	ctx      context.Context
	sh       *extlog.Shipper
	invNames map[int64]string
}

// newFactLog is nil when no destination takes the records.
func (d *Dispatcher) newFactLog(ctx context.Context, hosts []*models.Host) *factLog {
	sh := extlog.Default()
	if !sh.Wants(factsLogger, "INFO") {
		return nil
	}
	f := &factLog{d: d, ctx: ctx, sh: sh, invNames: map[int64]string{}}
	var ids []int64
	seen := map[int64]bool{}
	for _, h := range hosts {
		if !seen[h.InventoryID] {
			seen[h.InventoryID] = true
			ids = append(ids, h.InventoryID)
		}
	}
	if rows, err := d.DB.Pool.Query(ctx, `SELECT id, name FROM main_inventory WHERE id = ANY($1)`, ids); err == nil {
		for rows.Next() {
			var id int64
			var name string
			if rows.Scan(&id, &name) == nil {
				f.invNames[id] = name
			}
		}
		rows.Close()
	}
	return f
}

func (f *factLog) updated(h *models.Host, facts map[string]any, at time.Time, jobID int64) {
	if f == nil {
		return
	}
	var job any
	if jobID != 0 {
		job = jobID
	}
	extra := []extlog.Field{{Key: "inventory_id", Value: h.InventoryID}, {Key: "host_name", Value: h.Name}, {Key: "ansible_facts", Value: facts},
		{Key: "ansible_facts_modified", Value: pyISOFormat(at)}, {Key: "job_id", Value: job}}
	f.sh.Emit(extlog.ServiceRecord(f.ctx, time.Now(), factsLogger, "INFO", fmt.Sprintf("New fact for inventory %s host %s", f.invNames[h.InventoryID], h.Name), extra))
}

func (f *factLog) cleared(h *models.Host) {
	if f == nil || h == nil {
		return
	}
	f.sh.Emit(extlog.ServiceRecord(f.ctx, time.Now(), factsLogger, "INFO", fmt.Sprintf("Facts cleared for inventory %s host %s", f.invNames[h.InventoryID], h.Name), nil))
}

// pyISOFormat is datetime.isoformat() of an aware UTC time.
func pyISOFormat(t time.Time) string {
	t = t.UTC()
	s := t.Format("2006-01-02T15:04:05")
	if us := t.Nanosecond() / 1000; us != 0 {
		s += fmt.Sprintf(".%06d", us)
	}
	return s + "+00:00"
}

// logBlocked sends the blocked lifecycle record of every pending task that
// another task blocks (blockerSQL), as the task manager did for each one
// on each pass: log_lifecycle("blocked", blocked_by=...), "<type>-<id>
// blocked by <type>-<id>". Run beside explainBlocked.
func (d *Dispatcher) logBlocked(ctx context.Context) {
	if d.API == nil || !extlog.Default().LifecycleWanted() {
		return
	}
	rows, err := d.DB.Pool.Query(ctx, `SELECT uj.id, (`+blockerSQL+`) FROM main_unifiedjob uj
		WHERE uj.status = 'pending' AND uj.polymorphic_ctype_id IN ($1, $2, $3, $4, $5) AND uj.launch_type <> 'sync' AND NOT (uj.id = ANY($6::bigint[]))
		ORDER BY uj.created, uj.id`, d.claimTypes([]int64{})...)
	if err != nil {
		if ctx.Err() == nil {
			d.Log.ErrorContext(ctx, "blocked task lifecycle records", "err", err)
		}
		return
	}
	type blocked struct {
		id int64
		by string
	}
	var list []blocked
	for rows.Next() {
		var b blocked
		var by *string
		if err := rows.Scan(&b.id, &by); err != nil {
			rows.Close()
			return
		}
		if by != nil {
			b.by = *by
			list = append(list, b)
		}
	}
	rows.Close()
	for _, b := range list {
		d.API.LogBlocked(ctx, b.id, b.by)
	}
}
