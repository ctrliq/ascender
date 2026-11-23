package tasks

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"runtime/debug"
	"sort"
	"strings"
	"time"

	"github.com/ctrliq/ascender/internal/api"
	"github.com/ctrliq/ascender/internal/models"
)

// runSystemJob is RunSystemJob: the management command a system job
// names, run in the task process on the control plane, its log lines kept
// as the job's events.
func (d *Dispatcher) runSystemJob(jobCtx, bg context.Context, id int64) (err error) {
	var jobType, extra, status string
	var tmpl *int64
	var created time.Time
	var cancelFlag bool
	if err := d.DB.Pool.QueryRow(bg, `SELECT s.job_type, s.extra_vars, s.system_job_template_id, u.status, u.created, u.cancel_flag FROM main_systemjob s
		JOIN main_unifiedjob u ON u.id = s.unifiedjob_ptr_id WHERE s.unifiedjob_ptr_id = $1`, id).Scan(&jobType, &extra, &tmpl, &status, &created, &cancelFlag); err != nil {
		return err
	}
	started := time.Now()
	ran := false
	// finish stores the final status. A canceled job gets its canceled_on
	// (UnifiedJob.save stamps it once cancel_flag is set) and, like every
	// finished job, loses its start_args.
	finish := func(st, explanation, traceback string, events int) {
		finished := time.Now()
		failed := st != "successful"
		var canceledOn *time.Time
		if st == "canceled" {
			canceledOn = &finished
		}
		elapsed := 0.0
		if ran {
			elapsed = finished.Sub(started).Seconds()
		}
		_, _ = d.DB.Pool.Exec(bg, `UPDATE main_unifiedjob SET status = $2, failed = $3, finished = $4, elapsed = $5,
			job_explanation = CASE WHEN $6 = '' THEN job_explanation ELSE $6 END, result_traceback = $7, emitted_events = $8,
			canceled_on = COALESCE(canceled_on, $9), start_args = '', modified = now() WHERE id = $1`,
			id, st, failed, finished, elapsed, explanation, traceback, events, canceledOn)
		if tmpl != nil {
			_ = d.templateFinished(bg, d.DB.Pool, *tmpl, st, id, failed, finished)
		}
		d.notify(id, st)
	}
	if !models.ActiveStatuses[status] {
		return fmt.Errorf("not starting %s system job %d", status, id)
	}
	// Canceled before it started: it ends at once, never running, with its
	// template and notifications following as for any finished job.
	if cancelFlag {
		finish("canceled", "", "", 0)
		return nil
	}
	defer func() {
		if p := recover(); p != nil {
			d.Log.Error("system job panicked", "system_job", id, "panic", p)
			finish("error", "", fmt.Sprintf("%v\n%s", p, debug.Stack()), 0)
			err = fmt.Errorf("panic: %v", p)
		}
	}()
	vars := map[string]any{}
	if strings.TrimSpace(extra) != "" {
		if err := json.Unmarshal([]byte(extra), &vars); err != nil {
			d.Log.Error("Failed to parse system job", "system_job", id, "err", err)
		}
	}
	args := api.SystemJobArgs(jobType, vars)
	argsJSON := api.PyJSONText(args)
	cwd, _ := os.Getwd()
	envJSON, _ := json.Marshal(systemJobEnv())
	var igID *int64
	var ig int64
	_, controlQueue := d.queueNames(bg)
	if err := d.DB.Pool.QueryRow(bg, `SELECT id FROM main_instancegroup WHERE name = $1`, controlQueue).Scan(&ig); err == nil {
		igID = &ig
	}
	if _, err := d.DB.Pool.Exec(bg, `UPDATE main_unifiedjob SET status = 'running', started = $2, execution_node = $3, controller_node = COALESCE(NULLIF(controller_node, ''), $3), instance_group_id = COALESCE(instance_group_id, $4),
		job_args = $5, job_cwd = $6, job_env = $7::jsonb, modified = now() WHERE id = $1`, id, started, d.Cfg.ClusterHostID, igID, argsJSON, cwd, string(envJSON)); err != nil {
		return err
	}
	ran = true
	if tmpl != nil {
		d.templateRunning(bg, d.DB.Pool, *tmpl, id)
	}
	d.notify(id, "running")
	if err := models.EnsureEventPartition(bg, d.DB.Pool, "main_systemjobevent", created); err != nil {
		finish("error", "", err.Error(), 0)
		return err
	}
	events := &systemJobEvents{d: d, ctx: bg, id: id, created: created, throttle: newWSThrottle(bg, d), now: time.Now}
	emit := events.emit
	lines := 0
	runErr := d.API.RunManagementCommand(jobCtx, args, func(line string) {
		emit(line, lines, lines+1)
		lines++
	})
	st, explanation, traceback := systemJobOutcome(runErr, jobCtx.Err() != nil, func() bool { return d.cancelRequested(bg, id) })
	if traceback != "" {
		emit("CommandError: "+runErr.Error(), lines, lines+1)
		lines++
	}
	// The runner's closing reset sequence.
	emit("\x1b[0m", lines, lines)
	if d.API != nil {
		d.API.EmitJobSummary(bg, id, int64(events.counter))
	}
	finish(st, explanation, traceback, events.counter)
	return nil
}

// systemJobEvents stores a system job's output lines as its events
// (SystemJobEvent), one row per line as it comes.
type systemJobEvents struct {
	d       *Dispatcher
	ctx     context.Context
	id      int64
	created time.Time // the job's, the partition key
	counter int
	// throttle holds back websocket messages over MAX_WEBSOCKET_EVENT_RATE.
	throttle *wsThrottle
	now      func() time.Time
}

// emit stores one line. created is when the command wrote the line, the
// event's own time; modified is when the row is stored, as the callback
// receiver set it at its flush.
func (w *systemJobEvents) emit(line string, start, end int) {
	d := w.d
	w.counter++
	eventCreated := w.now()
	callbackMetrics.eventsReceived(1)
	send := w.throttle.emit("verbose", line, int64(start), int64(end))
	var eid int64
	stored := w.now()
	took := time.Now()
	if err := d.DB.Pool.QueryRow(w.ctx, `INSERT INTO main_systemjobevent (created, modified, event_data, uuid, counter, stdout, verbosity, start_line, end_line, system_job_id, job_created)
		VALUES ($1, $2, '{}', $3, $4, $5, 0, $6, $7, $8, $9) RETURNING id`, eventCreated, stored, newUUID(), w.counter, line, start, end, w.id, w.created).Scan(&eid); err != nil {
		d.Log.Error("system job event", "system_job", w.id, "err", err)
		callbackMetrics.discarded(1)
		return
	}
	broadcast := 0
	if d.API != nil && send {
		broadcast = 1
		d.API.EmitEventDetail(w.ctx, "main_systemjobevent", eid, w.id, w.created, "verbose")
	}
	callbackMetrics.flushed(1, 0, 0, time.Since(took), broadcast, stored.Sub(eventCreated), 0)
}

// systemJobOutcome maps how the management command ended to the job's
// status, explanation and traceback. A command cut short by the job's
// context was canceled (cancel_flag set) or stopped by a shutdown, which
// BaseTask.run recorded as failed, "Task was canceled due to receiving a
// shutdown signal."; neither is a CommandError.
func systemJobOutcome(runErr error, interrupted bool, cancelRequested func() bool) (status, explanation, traceback string) {
	switch {
	case runErr == nil:
		return "successful", "", ""
	case interrupted && cancelRequested():
		return "canceled", "", ""
	case interrupted:
		return "failed", "Task was canceled due to receiving a shutdown signal.", ""
	}
	return "failed", "", runErr.Error()
}

// systemJobEnv is the environment recorded on a system job, without the
// task process's secrets.
func systemJobEnv() map[string]string {
	out := map[string]string{}
	keys := os.Environ()
	sort.Strings(keys)
	for _, kv := range keys {
		i := strings.IndexByte(kv, '=')
		if i <= 0 {
			continue
		}
		k := kv[:i]
		up := strings.ToUpper(k)
		if strings.Contains(up, "PASSWORD") || strings.Contains(up, "SECRET") || strings.Contains(up, "DATABASE") || strings.Contains(up, "TOKEN") || strings.Contains(up, "KEY") {
			continue
		}
		out[k] = kv[i+1:]
	}
	return out
}
