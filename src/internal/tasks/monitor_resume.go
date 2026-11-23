package tasks

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/ctrliq/ascender/internal/api"
	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/extlog"
	"github.com/ctrliq/ascender/internal/models"
	"github.com/ctrliq/ascender/internal/receptor"
)

// Resuming a job whose monitor lease expired (BaseTask.resume with
// plan_resume): its output is read from where it survived, the events
// already saved are skipped, and the job is finished the way its launch
// would have. What cannot be decided now is decided again by a later
// sweep.

type planAction int

const (
	planResume planAction = iota
	planRequeue
	planFail
	planWait
)

var planNames = map[planAction]string{planResume: "resume", planRequeue: "requeue", planFail: "fail", planWait: "wait"}

// workSource is a job's output where it survived: a receptor work unit or
// a pod's log.
type workSource interface {
	kind() string
	open(ctx context.Context, follow bool) (workReader, error)
	isLive(ctx context.Context) (bool, error)
	finalStatus(ctx context.Context) (string, int, error)
	cancel(ctx context.Context) bool
	release(ctx context.Context)
}

// resumePlan is ResumePlan: what a resume does with a job, and with what.
type resumePlan struct {
	action planAction
	reason string
	// stream is the output where it was found, also for a cancel to stop.
	stream workSource
	follow bool
	// cleanup stops what is left of the work before a re-queue or a
	// failure; false when it could not.
	cleanup func() bool
	// counts: a wait counts against JOB_MONITOR_MAX_DEFERRALS.
	counts bool
}

// unitSource is ReceptorUnitStream: a work unit read through this node's
// receptor, its own or adopted from the node that runs it.
type unitSource struct {
	d    *Dispatcher
	rc   *receptor.Config
	unit string
	cr   *countingReader
}

func (u *unitSource) kind() string { return "receptor" }

// known: does this node's receptor have the unit?
func (u *unitSource) known() (bool, error) {
	if _, err := u.rc.WorkStatus(u.unit); err != nil {
		if strings.HasPrefix(err.Error(), "unknown work unit") {
			return false, nil
		}
		return false, err
	}
	return true, nil
}

func (u *unitSource) open(ctx context.Context, follow bool) (workReader, error) {
	rs, err := u.rc.Results(u.unit, 0)
	if err != nil {
		return workReader{}, err
	}
	u.cr = &countingReader{r: rs}
	return workReader{r: u.cr, interrupt: func() { _ = rs.Close() }, stop: func() bool { return u.cancel(ctx) }, stalled: unitStalled(u.rc, u.unit, u.cr)}, nil
}

func (u *unitSource) isLive(context.Context) (bool, error) {
	ws, err := u.rc.WorkStatus(u.unit)
	if err != nil {
		return false, err
	}
	return receptor.ActiveStates[ws.StateName], nil
}

func (u *unitSource) finalStatus(context.Context) (string, int, error) {
	st, rc := unitFinalStatus(u.rc, u.unit)
	return st, rc, nil
}

func (u *unitSource) cancel(context.Context) bool { return u.rc.Cancel(u.unit) == nil }

func (u *unitSource) release(ctx context.Context) {
	if u.d.releaseWork(ctx) {
		_ = u.rc.Release(u.unit)
	}
}

// discard stops the unit and lets receptor forget it.
func (u *unitSource) discard() bool {
	if err := u.rc.Cancel(u.unit); err != nil {
		return false
	}
	if u.d.releaseWork(context.Background()) {
		if err := u.rc.Release(u.unit); err != nil {
			return false
		}
	}
	return true
}

// terminalUnitStates are RECEPTOR_TERMINAL_STATES.
var terminalUnitStates = map[string]bool{"Succeeded": true, "Failed": true, "Canceled": true}

// unitStalled is ReceptorUnitStream.stalled: the reader has waited idle
// for bytes, the unit is done, and its stdout holds more than arrived.
func unitStalled(rc *receptor.Config, unit string, cr *countingReader) func(time.Duration) bool {
	return func(idle time.Duration) bool {
		if w := cr.waitedFor(); w == 0 || w < idle {
			return false
		}
		ws, err := rc.WorkStatus(unit)
		if err != nil || !terminalUnitStates[ws.StateName] {
			return false
		}
		return cr.n.Load() < ws.StdoutSize
	}
}

// unitFinalStatus is final_status: (status, rc) from the unit itself.
func unitFinalStatus(rc *receptor.Config, unit string) (string, int) {
	ws, err := rc.WorkStatus(unit)
	if err != nil {
		return "failed", 1
	}
	switch ws.StateName {
	case "Succeeded":
		return "successful", 0
	case "Canceled":
		return "canceled", 1
	}
	return "failed", 1
}

// planResume is plan_resume.
func (d *Dispatcher) planResume(ctx context.Context, j *monitoredJob) resumePlan {
	if j.deferrals >= monitorConfig().maxDeferrals {
		return resumePlan{action: planFail, reason: fmt.Sprintf("its output stayed unreachable through %d attempts to resume it", j.deferrals)}
	}
	if j.containerGroup && !j.meshNode {
		return d.planPod(ctx, j)
	}
	return d.planReceptor(ctx, j)
}

func (d *Dispatcher) requeueOrFail(ctx context.Context, j *monitoredJob, reason string, p resumePlan) resumePlan {
	p.reason = reason
	if d.canRequeue(ctx, j.id, j.ctype) {
		p.action = planRequeue
		return p
	}
	p.action = planFail
	p.reason = reason + ", and it cannot be run again without the passwords it was launched with"
	return p
}

// planPod is _plan_container_group: the pod's phase and its worker
// container's state say what can be read.
func (d *Dispatcher) planPod(ctx context.Context, j *monitoredJob) resumePlan {
	src, err := d.newPodSource(ctx, j)
	if err != nil {
		d.Log.WarnContext(ctx, fmt.Sprintf("unified job %d: could not reach its container group: %v; trying again later", j.id, err))
		return resumePlan{action: planWait, reason: "its pod could not be looked up", counts: true}
	}
	pod, err := src.find(ctx)
	if err != nil {
		d.Log.WarnContext(ctx, fmt.Sprintf("unified job %d: could not look up its pod: %v; trying again later", j.id, err))
		return resumePlan{action: planWait, reason: "its pod could not be looked up", counts: true}
	}
	if pod == nil {
		if j.workerStarted {
			return resumePlan{action: planFail, reason: "its pod no longer exists"}
		}
		return d.requeueOrFail(ctx, j, "its pod no longer exists and it had not started running", resumePlan{})
	}
	if pod.terminated() || pod.Status.Phase == "Succeeded" || pod.Status.Phase == "Failed" {
		return resumePlan{action: planResume, reason: "its pod has finished; its log holds the output", stream: src, follow: false}
	}
	now := time.Now()
	if pod.Status.Phase == "Pending" {
		limit := podPendingTimeout()
		if !pod.Metadata.CreationTimestamp.IsZero() && now.Sub(pod.Metadata.CreationTimestamp) > limit {
			return resumePlan{action: planFail, reason: fmt.Sprintf("its pod did not start within %d seconds", int(limit.Seconds())), stream: src, cleanup: src.deletePod}
		}
		return resumePlan{action: planWait, reason: "its pod is still pending", stream: src, counts: false}
	}
	if j.workerStarted {
		return resumePlan{action: planResume, reason: "its pod is still running", stream: src, follow: true}
	}
	has, err := src.hasOutput(ctx)
	if err != nil {
		d.Log.WarnContext(ctx, fmt.Sprintf("unified job %d: could not read the log of pod %s: %v; trying again later", j.id, src.name, err))
		return resumePlan{action: planWait, reason: "its pod log could not be read", stream: src, counts: true}
	}
	if has {
		return resumePlan{action: planResume, reason: "its pod is running and producing output", stream: src, follow: true}
	}
	// Live and silent: the worker reads its payload first, from a
	// controller that died, so after a while it never will.
	if st := pod.startedAt(); st != nil && now.Sub(*st) > monitorConfig().wedge {
		return d.requeueOrFail(ctx, j, "its pod never received its payload", resumePlan{stream: src, cleanup: src.deletePod})
	}
	return resumePlan{action: planWait, reason: "its pod has not produced output yet", stream: src, counts: true}
}

// planReceptor is _plan_receptor: a unit survives on the node that ran it,
// and this node's receptor has it or adopts it.
func (d *Dispatcher) planReceptor(ctx context.Context, j *monitoredJob) resumePlan {
	if j.workUnitID == "" {
		return d.requeueOrFail(ctx, j, "it had not been handed to receptor yet", resumePlan{})
	}
	rc, err := d.receptorConfig()
	if err != nil {
		d.Log.WarnContext(ctx, fmt.Sprintf("unified job %d: no receptor to ask about work unit %s: %v; trying again later", j.id, j.workUnitID, err))
		return resumePlan{action: planWait, reason: "receptor could not be asked about its work unit", counts: true}
	}
	src := &unitSource{d: d, rc: rc, unit: j.workUnitID}
	known, err := src.known()
	if err != nil {
		d.Log.WarnContext(ctx, fmt.Sprintf("unified job %d: could not ask receptor about work unit %s: %v; trying again later", j.id, j.workUnitID, err))
		return resumePlan{action: planWait, reason: "receptor could not be asked about its work unit", counts: true}
	}
	if known {
		if !d.jobCanDetach(j.ctype) {
			return d.unitGivenUp(ctx, j, "a project update is not resumed without the lock on its project", src.discard, src)
		}
		return resumePlan{action: planResume, reason: fmt.Sprintf("its work unit %s is known to this node", j.workUnitID), stream: src, follow: true}
	}
	me := d.Cfg.ClusterHostID
	holder := d.localUnitHolder(ctx, j)
	if holder != "" && holder != me && d.holderIsPresent(ctx, holder) {
		return resumePlan{action: planWait, reason: fmt.Sprintf("its work unit runs on %s, which reads it itself once its dispatcher is back", holder), counts: true}
	}
	node := j.executionNode
	if holder == "" && node != "" && node != me && d.jobCanDetach(j.ctype) {
		if remote, err := models.InstanceHealthByHostname(ctx, d.DB.Pool, node); err == nil && (remote.NodeType == "execution" || remote.NodeType == "hop") {
			if remote.NodeState == "unavailable" && !remote.IsLost(time.Now()) {
				return resumePlan{action: planWait, reason: fmt.Sprintf("its work unit runs on %s, which is unavailable for now", node), counts: true}
			}
			if remote.NodeState == "ready" {
				tls := false
				if st, err := rc.Status(); err == nil {
					if ct, ok := st.ConnType(node); ok {
						tls = ct == receptor.ConnStreamTLS
					}
				}
				if err := rc.Adopt(node, j.workUnitID, tls); err != nil {
					d.Log.WarnContext(ctx, fmt.Sprintf("unified job %d: could not adopt work unit %s from %s: %v; trying again later", j.id, j.workUnitID, node, err))
					return resumePlan{action: planWait, reason: fmt.Sprintf("its work unit on %s could not be adopted yet", node), counts: true}
				}
				return resumePlan{action: planResume, reason: fmt.Sprintf("its work unit %s was adopted from %s", j.workUnitID, node), stream: src, follow: true}
			}
		}
	}
	return d.unitGivenUp(ctx, j, "its work unit was lost with its controller", nil, nil)
}

// unitGivenUp is _unit_given_up: re-queue a job whose work cannot be read
// when that is safe, fail it otherwise.
func (d *Dispatcher) unitGivenUp(ctx context.Context, j *monitoredJob, reason string, cleanup func() bool, stream workSource) resumePlan {
	p := resumePlan{stream: stream, cleanup: cleanup}
	switch {
	case d.isInlineSync(j):
		p.action, p.reason = planFail, reason+", and an inline project sync is not run again without the job that started it"
		return p
	case !j.workerStarted:
		return d.requeueOrFail(ctx, j, reason+", before its execution environment received its payload", p)
	case d.jobCanRepeat(j):
		return d.requeueOrFail(ctx, j, reason+", and this kind of job can be run again", p)
	}
	p.action, p.reason = planFail, reason+", and a partly run job cannot be repeated"
	return p
}

// startResume runs resume_job for a claimed job in the background.
func (d *Dispatcher) startResume(id int64, taskID string) {
	jobCtx, cancel := context.WithCancel(d.runCtx)
	d.mu.Lock()
	d.running[id] = cancel
	d.mu.Unlock()
	d.tasks.Add(1)
	go func() {
		defer func() {
			d.mu.Lock()
			delete(d.running, id)
			d.mu.Unlock()
			cancel()
			d.tasks.Done()
			d.poke()
		}()
		defer func() {
			if p := recover(); p != nil {
				d.Log.Error("resume panicked", "id", id, "panic", p)
			}
		}()
		d.resumeJob(jobCtx, extlog.WithGUID(d.base, strings.ReplaceAll(taskID, "-", "")), id, taskID)
	}()
}

// resumable is what reading a job's output on resume needs from its
// type: where the events go, and how it is finished.
type resumable interface {
	explain(msg string)
	takeExplanation() string
	hasTraceback() bool
	setTraceback(tb string)
	handle(ev runnerEvent)
	onStatus(st map[string]any)
	artifactDir() string
	// finish runs the post-run hooks and writes the final status.
	finish(status string, artifactsProcessed bool)
	// abandon stops without finishing.
	abandon()
}

// resumeJob is resume_job with BaseTask.resume.
func (d *Dispatcher) resumeJob(jobCtx, ctx context.Context, id int64, taskID string) {
	j, err := d.loadMonitoredJob(ctx, id)
	if err != nil {
		d.Log.InfoContext(ctx, fmt.Sprintf("unified job %d: no monitor lease left to resume", id))
		return
	}
	if j.status != "running" || j.taskID != taskID {
		d.Log.InfoContext(ctx, fmt.Sprintf("unified job %d: not resuming, it is %s and owned by task %s", id, j.status, j.taskID))
		return
	}
	// Planning and getting ready can take a while; the lease is renewed
	// meanwhile.
	keeper := d.keepLease(ctx, id, taskID)
	plan := d.planResume(ctx, j)
	canceled := j.cancelFlag || d.cancelRequested(ctx, id)
	var rs resumable
	var prepErr error
	if plan.action == planResume && !canceled {
		rs, prepErr = d.prepareResume(ctx, j, taskID)
	}
	lost := keeper.close()
	if prepErr != nil {
		// Counted like any other wait, so a failure that persists ends with
		// the job failed once its deferrals run out.
		d.Log.ErrorContext(ctx, fmt.Sprintf("unified job %d: getting ready to resume it failed; the next job monitor sweep tries again", id), "err", prepErr)
		d.leaseDefer(ctx, id, taskID, true)
		return
	}
	if lost {
		if rs != nil {
			rs.abandon()
		}
		d.Log.WarnContext(ctx, fmt.Sprintf("unified job %d: another task took over its monitoring while this one got ready to resume it; this task stands down", id))
		return
	}
	d.Log.InfoContext(ctx, fmt.Sprintf("unified job %d: resume plan is to %s because %s", id, planNames[plan.action], plan.reason))
	if canceled {
		d.cancelUnmonitored(ctx, j, taskID, plan)
		return
	}
	switch plan.action {
	case planWait:
		d.leaseDefer(ctx, id, taskID, plan.counts)
		return
	case planRequeue, planFail:
		if plan.cleanup != nil && !plan.cleanup() {
			// What still runs could not be stopped: no second copy, and no
			// failure reported while it goes on.
			d.leaseDefer(ctx, id, taskID, true)
			return
		}
		if plan.action == planRequeue {
			d.requeueJob(ctx, id, plan.reason, taskID)
			return
		}
		d.lifecycle(ctx, id, "monitor_resume_failed")
		d.finishUnread(ctx, j, taskID, "failed", fmt.Sprintf("The job failed because %s.", plan.reason))
		return
	}

	rs.explain(fmt.Sprintf("Output monitoring was resumed on %s after the node reading it stopped.", d.Cfg.ClusterHostID))
	_, _ = d.DB.Pool.Exec(ctx, `UPDATE main_jobmonitorlease SET resumed = resumed + 1 WHERE unified_job_id = $1`, id)
	d.lifecycle(ctx, id, "monitor_resumed")
	hold := &monitorHold{d: d, jobID: id, ctype: j.ctype, owner: taskID, resuming: true, leased: true, canDetach: d.jobCanDetach(j.ctype), inlineSync: d.isInlineSync(j)}
	hold.workerStarted.Store(j.workerStarted)
	hold.workerStartedRecorded.Store(j.workerStarted)
	w, err := plan.stream.open(ctx, plan.follow)
	if err != nil {
		rs.abandon()
		d.Log.WarnContext(ctx, fmt.Sprintf("unified job %d: reading its output failed: %v; the next job monitor sweep tries again", id, err))
		d.leaseDefer(ctx, id, taskID, true)
		return
	}
	log := func(msg string, kv ...any) { d.Log.InfoContext(ctx, msg, append([]any{"id", id}, kv...)...) }
	sr := hold.readWork(jobCtx, ctx, w, rs.artifactDir(), rs.onStatus, rs.handle, log)
	w.interrupt()
	switch hold.outcome {
	case readDetached:
		rs.abandon()
		d.lifecycle(ctx, id, "monitor_detached")
		d.leaseRelease(ctx, id, taskID)
		d.Log.WarnContext(ctx, fmt.Sprintf("unified job %d: detached again on shutdown; the next job monitor sweep resumes it", id))
		return
	case readLost:
		rs.abandon()
		return
	}
	if hold.outcome == readDone && sr.readErr != nil {
		rs.abandon()
		d.Log.WarnContext(ctx, fmt.Sprintf("unified job %d: reading its output failed: %v; the next job monitor sweep tries again", id, sr.readErr))
		d.leaseDefer(ctx, id, taskID, true)
		return
	}
	if hold.outcome != readCanceled && !sr.gotEOF && sr.Explanation == "" {
		sr.Status, sr.Explanation = "error", unexpectedEmptyLine
	}
	status, ok, err := d.resumedStatus(ctx, id, sr, plan.stream, rs)
	if err != nil {
		rs.abandon()
		d.Log.WarnContext(ctx, fmt.Sprintf("unified job %d: reading its output failed: %v; the next job monitor sweep tries again", id, err))
		d.leaseDefer(ctx, id, taskID, true)
		return
	}
	if !ok {
		rs.abandon()
		d.Log.WarnContext(ctx, fmt.Sprintf("unified job %d: its output stream ended while its %s is still running; the next job monitor sweep reads it again", id, plan.stream.kind()))
		d.leaseDefer(ctx, id, taskID, true)
		return
	}
	// The lease goes before the work and the post-run hooks; it fails if
	// another task claimed the job meanwhile.
	if owned, err := d.leaseRetire(ctx, id, taskID); err != nil || !owned {
		rs.abandon()
		d.Log.WarnContext(ctx, fmt.Sprintf("unified job %d: another task took over its monitoring; this task stands down without finalizing", id))
		return
	}
	plan.stream.release(ctx)
	rs.finish(status, sr.ArtifactsProcessed)
}

// resumedStatus is _resumed_status: the job's final status from what the
// resumed read produced, with the pod or unit as the fallback; ok false
// while the work still runs.
func (d *Dispatcher) resumedStatus(ctx context.Context, id int64, sr streamResult, stream workSource, rs resumable) (string, bool, error) {
	if sr.Explanation != "" {
		rs.explain(sr.Explanation)
	}
	if sr.Traceback != "" {
		rs.setTraceback(sr.Traceback)
	}
	status := sr.Status
	switch {
	case status == "canceled":
		if !d.cancelRequested(ctx, id) {
			rs.explain("The running ansible process received a shutdown signal.")
			status = "failed"
		}
	case status == "error" && !rs.hasTraceback():
		// No status line: only the pod or the unit can say how it ended.
		live, err := stream.isLive(ctx)
		if err != nil {
			return "", false, err
		}
		if live {
			return "", false, nil
		}
		st, _, err := stream.finalStatus(ctx)
		if err != nil {
			return "", false, err
		}
		// The complaint about the stream ending stays only if the job
		// did not succeed.
		if old := rs.takeExplanation(); st != "successful" && old != "" {
			rs.explain(old)
		}
		rs.explain(fmt.Sprintf("The final status was taken from the job's %s, which reported it as %s.", stream.kind(), st))
		status = st
	case status == "timeout" || status == "error":
		if old := rs.takeExplanation(); old != "" {
			rs.explain(old)
		} else {
			rs.explain("Job terminated due to " + status)
		}
		if status == "timeout" {
			status = "failed"
		}
	}
	return status, true, nil
}

// cancelUnmonitored is _cancel_unmonitored: a job cancelled while nobody
// read it is stopped where the plan found it and finished as canceled.
func (d *Dispatcher) cancelUnmonitored(ctx context.Context, j *monitoredJob, taskID string, plan resumePlan) {
	if plan.stream != nil {
		plan.stream.cancel(ctx)
		plan.stream.release(ctx)
	} else if plan.cleanup != nil {
		plan.cleanup()
	}
	d.lifecycle(ctx, j.id, "monitor_resume_canceled")
	d.finishUnread(ctx, j, taskID, "canceled", "")
}

// finishUnread is _finish_unread: a job whose output this task never read,
// failed or cancelled by a resume, ends without post-run hooks.
func (d *Dispatcher) finishUnread(ctx context.Context, j *monitoredJob, taskID, status, explanation string) {
	table, col := d.eventTable(j.ctype)
	var emitted int64
	if table != "" {
		_ = d.DB.Pool.QueryRow(ctx, `SELECT count(*) FROM `+table+` WHERE `+col+` = $1 AND job_created = $2`, j.id, j.created).Scan(&emitted)
	}
	var ujt *int64
	err := d.DB.Pool.QueryRow(ctx, `UPDATE main_unifiedjob SET status = $2, failed = true, finished = now(),
		elapsed = CASE WHEN started IS NOT NULL THEN EXTRACT(EPOCH FROM (now() - started)) ELSE elapsed END,
		job_explanation = CASE WHEN $3::text = '' THEN job_explanation ELSE $3::text END, canceled_on = CASE WHEN $6 THEN now() ELSE canceled_on END,
		start_args = '', emitted_events = $5, modified = now()
		WHERE id = $1 AND status = 'running' AND ($4::text = '' OR celery_task_id = $4::text) RETURNING unified_job_template_id`, j.id, status, explanation, taskID, emitted, status == "canceled").Scan(&ujt)
	if db.IsNoRows(err) {
		d.Log.WarnContext(ctx, fmt.Sprintf("unified job %d is owned by another task now; this task does not write status %s", j.id, status))
		return
	}
	if err != nil {
		d.Log.ErrorContext(ctx, fmt.Sprintf("unified job %d: could not write status %s; the next job monitor sweep tries again", j.id, status), "err", err)
		d.leaseDefer(ctx, j.id, taskID, true)
		return
	}
	if ujt != nil {
		_ = d.templateFinished(ctx, d.DB.Pool, *ujt, "failed", j.id, true, time.Now())
	}
	d.leaseFinish(ctx, d.DB.Pool, j.id)
	d.notify(j.id, status)
}

// persistedCounters are the counters of the job's saved events, which a
// resumed read does not dispatch again.
func (d *Dispatcher) persistedCounters(ctx context.Context, j *monitoredJob) (map[int64]bool, error) {
	table, col := d.eventTable(j.ctype)
	out := map[int64]bool{}
	if table == "" {
		return out, nil
	}
	rows, err := d.DB.Pool.Query(ctx, `SELECT counter FROM `+table+` WHERE `+col+` = $1 AND job_created = $2`, j.id, j.created)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var c int64
		if err := rows.Scan(&c); err != nil {
			return nil, err
		}
		out[c] = true
	}
	return out, rows.Err()
}

// recordResumedStart is _resumed_start_fields: the launch's record of the
// command and environment stands; only a job whose launch never got that
// far is given one, with every value a credential could have set hidden.
func (d *Dispatcher) recordResumedStart(ctx context.Context, id int64, st map[string]any, pdd string) {
	if st["status"] != "starting" {
		return
	}
	var has bool
	if err := d.DB.Pool.QueryRow(ctx, `SELECT job_env IS NOT NULL AND job_env::text NOT IN ('{}', 'null') FROM main_unifiedjob WHERE id = $1`, id).Scan(&has); err != nil || has {
		return
	}
	env := map[string]string{}
	if m, ok := st["env"].(map[string]any); ok {
		for k, v := range m {
			env[k] = fmt.Sprint(v)
		}
	}
	safe := buildSafeEnv(env)
	for k := range safe {
		if !strings.HasPrefix(k, "ANSIBLE_") && !api.EnvBlocked(k) {
			safe[k] = hiddenPassword
		}
	}
	safe["AWX_PRIVATE_DATA_DIR"] = pdd
	var cmd []string
	if list, ok := st["command"].([]any); ok {
		for _, c := range list {
			cmd = append(cmd, fmt.Sprint(c))
		}
	}
	cwd, _ := st["cwd"].(string)
	b, _ := json.Marshal(safe)
	_, _ = d.DB.Pool.Exec(ctx, `UPDATE main_unifiedjob SET job_args = $2, job_cwd = $3, job_env = $4::jsonb WHERE id = $1`, id, pyJSONList(cmd), cwd, string(b))
}

// resumePDD is the private data directory a resumed read unpacks the
// worker's artifacts into.
func (d *Dispatcher) resumePDD(ctx context.Context, id int64) (string, error) {
	pdd, err := d.makePDD(ctx, id)
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(filepath.Join(pdd, "artifacts", fmt.Sprint(id), "job_events"), 0o700); err != nil {
		return "", err
	}
	// The launch's stored environment points at this run's directory now.
	_, _ = d.DB.Pool.Exec(ctx, `UPDATE main_unifiedjob SET job_env = jsonb_set(job_env, '{AWX_PRIVATE_DATA_DIR}', to_jsonb($2::text))
		WHERE id = $1 AND job_env ? 'AWX_PRIVATE_DATA_DIR' AND job_env->>'AWX_PRIVATE_DATA_DIR' <> $2`, id, pdd)
	return pdd, nil
}

// prepareResume builds what reading the job's output needs for its type.
func (d *Dispatcher) prepareResume(ctx context.Context, j *monitoredJob, taskID string) (resumable, error) {
	switch j.ctype {
	case d.CT.ID("main.job"), d.CT.ID("main.adhoccommand"):
		return d.prepareJobResume(ctx, j, taskID)
	case d.CT.ID("main.inventoryupdate"):
		return d.prepareInventoryUpdateResume(ctx, j, taskID)
	}
	return nil, fmt.Errorf("unified job %d: this task runner does not resume its kind of job", j.id)
}

// clampedWrapup is _resumed_finished_at: when a resumed job really ended,
// from the wrapup event, between its start and now.
func clampedWrapup(wrapup time.Time, started time.Time) *time.Time {
	if wrapup.IsZero() {
		return nil
	}
	now := time.Now()
	t := wrapup
	if !started.IsZero() && t.Before(started) {
		t = started
	}
	if t.After(now) {
		t = now
	}
	return &t
}

// resumeBase is what the resumed reads of every type share.
type resumeBase struct{ *baseRun }

func (x resumeBase) onStatus(st map[string]any) {
	x.d.recordResumedStart(x.ctx, x.id, st, x.pdd)
}
func (x resumeBase) cleanup() { x.d.cleanupPDD(x.ctx, x.pdd) }

// jobResume reads a job or an ad hoc command on resume.
type jobResume struct {
	resumeBase
	r    *jobRun
	sink *jobEventSink
}

func (x *jobResume) handle(ev runnerEvent) { x.sink.handle(ev) }
func (x *jobResume) abandon() {
	x.sink.abandon()
	x.cleanup()
}

func (x *jobResume) finish(status string, artifactsProcessed bool) {
	r := x.r
	defer x.cleanup()
	if err := x.sink.close(); err != nil {
		r.traceback = "Failed to save job events: " + err.Error()
	}
	r.recordEvents(x.sink)
	if r.job.UseFactCache && r.adHoc == nil && artifactsProcessed {
		updated, cleared := finishFactCache(r.ctx, r.d, r.factHosts, r.artifactDir(), r.job.ID, r.job.Created)
		r.log("fact cache finished", "updated", updated, "cleared", cleared)
	}
	r.readArtifacts()
	r.finishedAt = clampedWrapup(x.sink.wrapupCreated(), r.started)
	if err := r.finish(status); err != nil {
		r.d.Log.Error("resumed job finish", "id", r.job.ID, "err", err)
	}
}

// prepareJobResume is configure_for_resume for a job or an ad hoc command:
// its records loaded, a private data directory for the artifacts, the
// host map the launch built, and the events already saved.
func (d *Dispatcher) prepareJobResume(ctx context.Context, j *monitoredJob, taskID string) (resumable, error) {
	r := &jobRun{baseRun: baseRun{d: d, ctx: ctx, id: j.id, logKey: "job"}}
	if j.ctype == d.CT.ID("main.adhoccommand") {
		a, err := models.GetAdHocCommand(ctx, d.DB.Pool, j.id)
		if err != nil {
			return nil, err
		}
		r.job, r.adHoc, r.logKey = adHocAsJob(a, true), a, "ad_hoc_command"
	} else {
		job, err := models.GetJob(ctx, d.DB.Pool, j.id)
		if err != nil {
			return nil, err
		}
		r.job = job
		if job.JobTemplateID != nil {
			r.template, _ = models.GetJobTemplate(ctx, d.DB.Pool, *job.JobTemplateID)
		}
		if job.ProjectID != nil {
			r.project, _ = models.GetProject(ctx, d.DB.Pool, *job.ProjectID)
		}
	}
	if j.started != nil {
		r.started = *j.started
	} else {
		r.started = time.Now()
	}
	if r.job.InventoryID != nil {
		r.inventory, _ = models.GetInventory(ctx, d.DB.Pool, *r.job.InventoryID)
	}
	r.hold = &monitorHold{d: d, jobID: j.id, ctype: j.ctype, owner: taskID, resuming: true, leased: true}
	pdd, err := d.resumePDD(ctx, j.id)
	if err != nil {
		return nil, err
	}
	r.pdd = pdd
	kind := ""
	if r.inventory != nil {
		kind = r.inventory.Kind
		hosts, err := r.inventoryHosts(false)
		if err != nil {
			_ = os.RemoveAll(pdd)
			return nil, err
		}
		if _, hostMap, err := api.InventoryScriptData(ctx, d.DB.Pool, r.inventory, hosts, true, true); err == nil {
			r.hostMap = hostMap
		} else {
			d.Log.WarnContext(ctx, fmt.Sprintf("unified job %d: could not build its host map; replayed events will carry no host id", j.id), "err", err)
		}
		if r.job.UseFactCache && r.adHoc == nil {
			if r.factHosts, err = r.factCacheHosts(); err != nil {
				_ = os.RemoveAll(pdd)
				return nil, err
			}
		}
	}
	persisted, err := d.persistedCounters(ctx, j)
	if err != nil {
		_ = os.RemoveAll(pdd)
		return nil, err
	}
	sink := newJobEventSink(ctx, d, r.job, r.hostMap, kind, workflowJobID(ctx, d, j.id))
	sink.adHoc = r.adHoc != nil
	sink.resumeFrom(persisted)
	return &jobResume{resumeBase: resumeBase{&r.baseRun}, r: r, sink: sink}, nil
}

// invResume reads an inventory update on resume.
type invResume struct {
	resumeBase
	r    *invUpdateRun
	sink *invEventSink
}

func (x *invResume) handle(ev runnerEvent) { x.sink.handle(ev) }
func (x *invResume) abandon() {
	x.sink.abandon()
	x.cleanup()
}

func (x *invResume) finish(status string, artifactsProcessed bool) {
	r := x.r
	defer x.cleanup()
	// post_run_hook: the output is imported into the database.
	if status == "successful" {
		if st, err := r.importOutput(x.sink); err != nil {
			r.d.Log.Error("inventory import", "inventory_update", r.iu.ID, "err", err)
			status = st
		}
	}
	if err := x.sink.close(); err != nil {
		r.traceback = "Failed to save job events: " + err.Error()
	}
	r.recordAnsibleVersion()
	if err := r.finish(status); err != nil {
		r.d.Log.Error("resumed inventory update finish", "id", r.iu.ID, "err", err)
	}
}

func (d *Dispatcher) prepareInventoryUpdateResume(ctx context.Context, j *monitoredJob, taskID string) (resumable, error) {
	iu, err := models.GetInventoryUpdate(ctx, d.DB.Pool, j.id)
	if err != nil {
		return nil, err
	}
	r := &invUpdateRun{baseRun: baseRun{d: d, ctx: ctx, id: j.id, logKey: "inventory_update", started: time.Now()}, iu: iu}
	if iu.Started != nil {
		r.started = *iu.Started
	}
	if iu.InventorySourceID != nil {
		r.src, _ = models.GetInventorySource(ctx, d.DB.Pool, *iu.InventorySourceID)
	}
	if iu.InventoryID != nil {
		r.inventory, _ = models.GetInventory(ctx, d.DB.Pool, *iu.InventoryID)
	}
	r.hold = &monitorHold{d: d, jobID: j.id, ctype: j.ctype, owner: taskID, resuming: true, leased: true}
	pdd, err := d.resumePDD(ctx, j.id)
	if err != nil {
		return nil, err
	}
	r.pdd = pdd
	persisted, err := d.persistedCounters(ctx, j)
	if err != nil {
		_ = os.RemoveAll(pdd)
		return nil, err
	}
	sink := newInvEventSink(ctx, d, iu)
	sink.resumeFrom(persisted)
	return &invResume{resumeBase: resumeBase{&r.baseRun}, r: r, sink: sink}, nil
}

// isEOF reports a stream that ended as streams do.
func isEOF(err error) bool { return err == nil || errors.Is(err, io.EOF) }
