package tasks

import (
	"context"
	"errors"
	"fmt"
	"io"
	"strings"
	"sync/atomic"
	"time"
)

// readOutcome is how reading a worker's output ended.
type readOutcome int

const (
	// readDone: the stream was read to its end.
	readDone readOutcome = iota
	// readCanceled: a cancel stopped the work.
	readCanceled
	// readShutdownCanceled: the task process stopped and the work was
	// stopped with it; the job cannot run again.
	readShutdownCanceled
	// readDetached: the task process stopped and the work was left
	// running, for the next monitor to read.
	readDetached
	// readRequeue: the task process stopped and the work was stopped, to
	// run the job again.
	readRequeue
	// readLost: another task owns the job now.
	readLost
	// readStalled: the work unit finished but its output stopped arriving.
	readStalled
)

// monitorHold is a task's hold on the job whose worker output it reads
// (the state AWXReceptorJob and its RunnerCallback kept): the task id it
// owns the job under, its lease, whether the worker started, and what it
// did when the task process stopped.
type monitorHold struct {
	d     *Dispatcher
	jobID int64
	ctype int64
	owner string
	// resuming: a resumed read, which always detaches on shutdown.
	resuming   bool
	canDetach  bool
	canRequeue bool
	inlineSync bool
	// leased: a lease row is held for the job.
	leased bool

	workerStarted         atomic.Bool
	workerStartedRecorded atomic.Bool

	outcome readOutcome
	// reason is why the job is re-queued.
	reason string
}

// newHold is the hold of a task that runs job id under its current task id.
func (d *Dispatcher) newHold(ctx context.Context, id, ctype int64) *monitorHold {
	var owner string
	_ = d.DB.Pool.QueryRow(ctx, `SELECT COALESCE(celery_task_id, '') FROM main_unifiedjob WHERE id = $1`, id).Scan(&owner)
	return &monitorHold{d: d, jobID: id, ctype: ctype, owner: owner, canDetach: d.jobCanDetach(ctype), canRequeue: d.canRequeue(ctx, id, ctype)}
}

// abandoned reports whether the run ends without finalizing the job:
// detached, re-queued, or taken over.
func (h *monitorHold) abandoned() bool {
	return h != nil && (h.outcome == readDetached || h.outcome == readRequeue || h.outcome == readLost)
}

// startLease leases the job to this task once its work is handed over.
func (h *monitorHold) startLease(ctx context.Context, podName, podNS string) {
	if h == nil || !h.d.monitorOn {
		return
	}
	if err := h.d.leaseStart(ctx, h.jobID, podName, podNS); err != nil {
		h.d.Log.WarnContext(ctx, "monitor lease", "id", h.jobID, "err", err)
		return
	}
	h.leased = true
	h.d.lifecycle(ctx, h.jobID, "monitor_leased")
	if podName != "" {
		h.d.lifecycle(ctx, h.jobID, "pod_recorded")
	}
}

// recordWorkerStarted is record_worker_started, tried again at the next
// renewal when it fails.
func (h *monitorHold) recordWorkerStarted(ctx context.Context) {
	if !h.leased {
		return
	}
	if err := h.d.leaseRecordWorkerStarted(ctx, h.jobID); err != nil {
		h.d.Log.WarnContext(ctx, fmt.Sprintf("unified job %d: could not record on its monitor lease that the worker started; trying again", h.jobID), "err", err)
		return
	}
	h.workerStartedRecorded.Store(true)
}

// retire is the end of reading: the lease goes, unless another task owns
// the job now (false).
func (h *monitorHold) retire(ctx context.Context) bool {
	if h == nil || !h.leased {
		return true
	}
	ok, err := h.d.leaseRetire(ctx, h.jobID, h.owner)
	if err != nil {
		// Cannot tell: a unit left behind is cleaned up by the work unit
		// reaper, one released from under a resumed monitor is lost.
		h.d.Log.WarnContext(ctx, fmt.Sprintf("Could not retire the monitor lease of unified job %d; leaving its work", h.jobID), "err", err)
		return false
	}
	if !ok {
		h.d.Log.WarnContext(ctx, fmt.Sprintf("unified job %d: another task took over its monitoring; leaving its work to it", h.jobID))
	}
	return ok
}

// cancelRequested is _cancel_requested: the job's cancel_flag tells a
// cancel from a shutdown.
func (d *Dispatcher) cancelRequested(ctx context.Context, id int64) bool {
	var flag bool
	if err := d.DB.Pool.QueryRow(ctx, `SELECT cancel_flag FROM main_unifiedjob WHERE id = $1`, id).Scan(&flag); err != nil {
		d.Log.WarnContext(ctx, fmt.Sprintf("unified job %d: could not read its cancel flag; treating the signal as a shutdown", id), "err", err)
		return false
	}
	return flag
}

// workReader is a worker's output being read, and the work behind it.
type workReader struct {
	r io.Reader
	// interrupt drops the stream under the reader.
	interrupt func()
	// stop stops the work; false when it could not be.
	stop func() bool
	// stalled reports a finished unit whose output stopped arriving.
	stalled func(idle time.Duration) bool
}

// readWork is AWXReceptorJob.process_stream: ansible-runner's processor
// reads the stream while this keeps the lease, records the worker's start,
// abandons a stalled stream, and answers a cancel or a shutdown
// (_await_processor, _handle_signal).
func (h *monitorHold) readWork(jobCtx, ctx context.Context, w workReader, art string, onStatus func(map[string]any), handler func(runnerEvent), log func(string, ...any)) streamResult {
	cfg := monitorConfig()
	status := func(st map[string]any) {
		if st["status"] == "starting" {
			h.workerStarted.Store(true)
			h.recordWorkerStarted(ctx)
		}
		if onStatus != nil {
			onStatus(st)
		}
	}
	done := make(chan streamResult, 1)
	go func() { done <- processWorkerStream(w.r, art, status, handler, log) }()
	drain := func(st string) streamResult {
		select {
		case sr := <-done:
			if st != "" {
				sr.Status = st
			}
			return sr
		case <-time.After(cfg.renew):
			h.d.Log.ErrorContext(ctx, fmt.Sprintf("unified job %d: the streamer did not stop after its stream was closed", h.jobID))
			return streamResult{podResult: podResult{runnerResult: runnerResult{Status: orStr(st, "error"), RC: 1}}}
		}
	}
	t := time.NewTicker(cfg.renew)
	defer t.Stop()
	onSignal := func(drain func(string) streamResult) streamResult {
		if h.d.stopping() && !h.d.cancelRequested(ctx, h.jobID) {
			return h.onShutdown(w, drain)
		}
		if !w.stop() {
			h.d.Log.ErrorContext(ctx, fmt.Sprintf("unified job %d: could not stop its work after it was cancelled", h.jobID))
		}
		w.interrupt()
		h.outcome = readCanceled
		return drain("canceled")
	}
	for {
		select {
		case sr := <-done:
			if jobCtx.Err() != nil && !sr.gotEOF {
				// The stream ended with the signal: answer the signal.
				return onSignal(func(st string) streamResult {
					if st != "" {
						sr.Status = st
					}
					return sr
				})
			}
			h.outcome = readDone
			return sr
		case <-jobCtx.Done():
			return onSignal(drain)
		case <-t.C:
			if h.leased {
				if err := h.d.leaseRenew(ctx, h.jobID, h.owner); errors.Is(err, errLeaseLost) {
					h.d.Log.WarnContext(ctx, fmt.Sprintf("unified job %d: its monitoring was taken over by another task; dropping this stream", h.jobID))
					if !h.canDetach {
						// Never read by another task: stopped here too.
						w.stop()
					}
					w.interrupt()
					h.outcome = readLost
					return drain("error")
				} else if err != nil {
					h.d.Log.WarnContext(ctx, fmt.Sprintf("unified job %d: could not renew its monitor lease: %v", h.jobID, err))
				}
				if h.workerStarted.Load() && !h.workerStartedRecorded.Load() {
					h.recordWorkerStarted(ctx)
				}
			}
			if w.stalled != nil && w.stalled(cfg.streamIdle) {
				h.d.Log.WarnContext(ctx, fmt.Sprintf("unified job %d: its work is done but its output stopped arriving; abandoning the stream", h.jobID))
				w.interrupt()
				h.outcome = readStalled
				return drain("error")
			}
		}
	}
}

// onShutdown is _handle_signal for a shutdown: work whose worker has its
// payload is left running for the next monitor; work that has not, or a
// project update, is stopped and the job run again, unless it cannot be.
func (h *monitorHold) onShutdown(w workReader, drain func(string) streamResult) streamResult {
	if h.resuming || (h.workerStarted.Load() && h.canDetach) {
		h.d.Log.Warn(fmt.Sprintf("unified job %d: shutdown signal received; detaching from its output without stopping the job", h.jobID))
		w.interrupt()
		h.outcome = readDetached
		return drain("error")
	}
	if h.inlineSync || !h.canRequeue {
		h.d.Log.Warn(fmt.Sprintf("unified job %d: shutdown signal received; stopping its work, and the job cannot be re-queued", h.jobID))
		w.stop()
		w.interrupt()
		h.outcome = readShutdownCanceled
		return drain("canceled")
	}
	if !w.stop() {
		h.d.Log.Warn(fmt.Sprintf("unified job %d: shutdown signal received; its work could not be stopped, so the next monitor, not a second run, takes the job", h.jobID))
		w.interrupt()
		h.outcome = readDetached
		return drain("error")
	}
	w.interrupt()
	h.outcome = readRequeue
	h.reason = h.requeueReason()
	h.d.Log.Warn(fmt.Sprintf("unified job %d: shutdown signal received; its work is stopped and it is re-queued", h.jobID))
	return drain("canceled")
}

// shutdownBeforeReading answers a shutdown that came before the worker's
// output could be read (while the pod was starting): the work never had
// its payload, so the job runs again unless it cannot.
func (h *monitorHold) shutdownBeforeReading(stop func() bool) {
	if h.inlineSync || !h.canRequeue {
		stop()
		h.outcome = readShutdownCanceled
		return
	}
	if !stop() {
		h.outcome = readDetached
		return
	}
	h.outcome = readRequeue
	h.reason = h.requeueReason()
}

// requeueForQuota is _handle_work_error's quota case: the cluster
// refused the job's pod because its namespace's resource quota is used
// up, so the job goes back to pending, to start again when there is room,
// unless it cannot run again (passwords typed in at launch, an inline
// project sync). It reports whether the job is re-queued.
func (h *monitorHold) requeueForQuota(detail string) bool {
	if h == nil || !strings.Contains(detail, "exceeded quota") {
		return false
	}
	h.d.Log.Warn(detail)
	if h.inlineSync || !h.canRequeue {
		h.d.Log.Warn(fmt.Sprintf("unified job %d: could not launch its pod, the resource quota is exceeded, and the job cannot be re-queued", h.jobID))
		return false
	}
	h.d.Log.Warn(fmt.Sprintf("unified job %d: could not launch its pod, the resource quota is exceeded; it is re-queued", h.jobID))
	h.outcome = readRequeue
	h.reason = "its container group's namespace had used up its resource quota when its pod was created"
	return true
}

func (h *monitorHold) requeueReason() string {
	if !h.canDetach {
		return "its controller stopped, and a project update is run again rather than left running without the lock on its project"
	}
	return "its controller stopped before the execution environment received its payload"
}

// endWithoutFinalizing is _end_without_finalizing: a run that detached
// lets its lease expire at once for the next sweep, one that is re-queued
// goes back to the task manager, and one that lost the job stands down.
func (h *monitorHold) endWithoutFinalizing(ctx context.Context) {
	switch h.outcome {
	case readRequeue:
		if !h.d.requeueJob(ctx, h.jobID, h.reason, h.owner) {
			h.d.Log.WarnContext(ctx, fmt.Sprintf("unified job %d: not re-queued, another task owns it now", h.jobID))
		}
	case readDetached:
		h.d.lifecycle(ctx, h.jobID, "monitor_detached")
		h.d.leaseRelease(ctx, h.jobID, h.owner)
		h.d.Log.WarnContext(ctx, fmt.Sprintf("unified job %d: detached from its work on shutdown; the next job monitor sweep resumes it", h.jobID))
	case readLost:
		h.d.Log.WarnContext(ctx, fmt.Sprintf("unified job %d: its monitoring was taken over by another task; this task stands down without finalizing or releasing anything", h.jobID))
	}
}

// countingReader counts what a work unit's results delivered and notes
// when the reader started waiting for more (ReceptorUnitStream).
type countingReader struct {
	r            io.Reader
	n            atomic.Int64
	waitingSince atomic.Int64
}

func (c *countingReader) Read(p []byte) (int, error) {
	c.waitingSince.Store(time.Now().UnixNano())
	n, err := c.r.Read(p)
	c.waitingSince.Store(0)
	c.n.Add(int64(n))
	return n, err
}

// waitedFor is how long the reader has been waiting for bytes, 0 while
// it is busy with the ones it has.
func (c *countingReader) waitedFor() time.Duration {
	if s := c.waitingSince.Load(); s != 0 {
		return time.Since(time.Unix(0, s))
	}
	return 0
}

func orStr(s, def string) string {
	if s == "" {
		return def
	}
	return s
}
