package tasks

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/extlog"
	"github.com/ctrliq/ascender/internal/models"
)

// The job monitor (the CIQ fork's models/monitor.py and tasks/monitor.py):
// keep a running job's output being read when the task process that
// launched it goes away.
//
// A task that reads a job's output from a worker elsewhere (a receptor
// work unit on an execution or hop node, or a container group pod) holds
// the job's main_jobmonitorlease row and renews it while it reads. On a
// graceful shutdown the task detaches: it stops reading, leaves the work
// running and lets the lease expire at once; when the process is killed
// the lease expires by itself. The sweep, on every control node, claims an
// expired lease with one compare-and-set on the job's celery_task_id and
// reads the rest of the output from wherever it survived. The task id is
// the fence: only the task the job is owned by renews its lease, retires
// it, or writes the job's final status.

// monitorSettings are the JOB_MONITOR_* settings.
type monitorSettings struct {
	lease, renew, retry, wedge, streamIdle time.Duration
	sweepBatch, maxDeferrals               int
}

func envSeconds(name string, def int) time.Duration {
	if v := os.Getenv(name); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return time.Duration(n) * time.Second
		}
	}
	return time.Duration(def) * time.Second
}

func envCount(name string, def int) int {
	if v := os.Getenv(name); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 {
			return n
		}
	}
	return def
}

func monitorConfig() monitorSettings {
	return monitorSettings{
		lease:        envSeconds("JOB_MONITOR_LEASE_SECONDS", 60),
		renew:        envSeconds("JOB_MONITOR_RENEW_SECONDS", 10),
		retry:        envSeconds("JOB_MONITOR_RETRY_SECONDS", 30),
		wedge:        envSeconds("JOB_MONITOR_WEDGE_SECONDS", 60),
		streamIdle:   envSeconds("JOB_MONITOR_STREAM_IDLE_SECONDS", 120),
		sweepBatch:   envCount("JOB_MONITOR_SWEEP_BATCH", 50),
		maxDeferrals: envCount("JOB_MONITOR_MAX_DEFERRALS", 120),
	}
}

// errLeaseLost is LeaseLost: another task owns the job now, so this one
// must stop reading and writing it.
var errLeaseLost = errors.New("the job's monitor lease is held by another task")

// detectMonitor notes whether the database has the lease table (migration
// 0233); without it jobs are not monitored, as before the fork added it.
func (d *Dispatcher) detectMonitor(ctx context.Context) {
	var name *string
	if err := d.DB.Pool.QueryRow(ctx, `SELECT to_regclass('main_jobmonitorlease')::text`).Scan(&name); err != nil || name == nil {
		d.Log.WarnContext(ctx, "main_jobmonitorlease is missing (migration 0233); running jobs are not monitored across task process restarts")
		return
	}
	d.monitorOn = true
}

// ownedClause limits a lease to the job's current task ($2, none for a
// task without an id).
const ownedClause = `unified_job_id = $1 AND ($2 = '' OR EXISTS (SELECT 1 FROM main_unifiedjob WHERE id = $1 AND celery_task_id = $2))`

// leaseStart is JobMonitorLeaseManager.start: the job is leased to the
// task about to stream it, with the pod it runs in when known.
func (d *Dispatcher) leaseStart(ctx context.Context, jobID int64, podName, podNS string) error {
	if !d.monitorOn {
		return nil
	}
	_, err := d.DB.Pool.Exec(ctx, `INSERT INTO main_jobmonitorlease (unified_job_id, expires, pod_name, pod_namespace, worker_started, resumed, deferrals, created, modified)
		VALUES ($1, now() + make_interval(secs => $2), $3, $4, false, 0, 0, now(), now())
		ON CONFLICT (unified_job_id) DO UPDATE SET expires = EXCLUDED.expires, pod_name = EXCLUDED.pod_name, pod_namespace = EXCLUDED.pod_namespace, modified = now()`,
		jobID, monitorConfig().lease.Seconds(), podName, podNS)
	return err
}

// leaseRenew extends the lease while owner still owns the job; a task
// without an id owns its job.
func (d *Dispatcher) leaseRenew(ctx context.Context, jobID int64, owner string) error {
	tag, err := d.DB.Pool.Exec(ctx, `UPDATE main_jobmonitorlease SET expires = now() + make_interval(secs => $3) WHERE `+ownedClause,
		jobID, owner, monitorConfig().lease.Seconds())
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 && owner != "" {
		return errLeaseLost
	}
	return nil
}

// leaseRecordWorkerStarted notes that the execution environment has its
// payload: before this a job that loses its monitor can be re-queued,
// after it only resumed.
func (d *Dispatcher) leaseRecordWorkerStarted(ctx context.Context, jobID int64) error {
	_, err := d.DB.Pool.Exec(ctx, `UPDATE main_jobmonitorlease SET worker_started = true WHERE unified_job_id = $1`, jobID)
	return err
}

// leaseRelease expires the lease now, so the next sweep on any node
// resumes the job at once.
func (d *Dispatcher) leaseRelease(ctx context.Context, jobID int64, owner string) {
	if !d.monitorOn {
		return
	}
	if _, err := d.DB.Pool.Exec(ctx, `UPDATE main_jobmonitorlease SET expires = now() WHERE `+ownedClause, jobID, owner); err != nil {
		d.Log.WarnContext(ctx, "monitor lease release", "id", jobID, "err", err)
	}
}

// leaseDefer leaves the job alone for a while, counting it against the
// deferrals when count is set.
func (d *Dispatcher) leaseDefer(ctx context.Context, jobID int64, owner string, count bool) {
	inc := 0
	if count {
		inc = 1
	}
	if _, err := d.DB.Pool.Exec(ctx, `UPDATE main_jobmonitorlease SET expires = now() + make_interval(secs => $3), deferrals = deferrals + $4 WHERE `+ownedClause,
		jobID, owner, monitorConfig().retry.Seconds(), inc); err != nil {
		d.Log.WarnContext(ctx, "monitor lease deferral", "id", jobID, "err", err)
	}
}

// leaseRetire removes the lease once its owner is done with the job's
// output: true when owner still owns the job, so that it may release the
// work and finish the job; false when another task claimed it meanwhile.
func (d *Dispatcher) leaseRetire(ctx context.Context, jobID int64, owner string) (bool, error) {
	if !d.monitorOn {
		return true, nil
	}
	owned := true
	err := d.DB.Tx(ctx, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `SELECT 1 FROM main_jobmonitorlease WHERE unified_job_id = $1 FOR UPDATE`, jobID); err != nil {
			return err
		}
		if owner != "" {
			var n int
			if err := tx.QueryRow(ctx, `SELECT count(*) FROM main_unifiedjob WHERE id = $1 AND celery_task_id = $2`, jobID, owner).Scan(&n); err != nil {
				return err
			}
			if n == 0 {
				owned = false
				return nil
			}
		}
		_, err := tx.Exec(ctx, `DELETE FROM main_jobmonitorlease WHERE unified_job_id = $1`, jobID)
		return err
	})
	return owned, err
}

// leaseFinish removes the lease: nothing is left to monitor.
func (d *Dispatcher) leaseFinish(ctx context.Context, q db.Querier, jobID int64) {
	if !d.monitorOn {
		return
	}
	if _, err := q.Exec(ctx, `DELETE FROM main_jobmonitorlease WHERE unified_job_id = $1`, jobID); err != nil {
		d.Log.WarnContext(ctx, "monitor lease removal", "id", jobID, "err", err)
	}
}

// leaseKeeper is LeaseKeeper: it renews the lease from a goroutine while
// its owner gets ready to read; lost is set when another task took the
// job.
type leaseKeeper struct {
	stop chan struct{}
	done chan struct{}
	lost bool
}

func (d *Dispatcher) keepLease(ctx context.Context, jobID int64, owner string) *leaseKeeper {
	k := &leaseKeeper{stop: make(chan struct{}), done: make(chan struct{})}
	go func() {
		defer close(k.done)
		t := time.NewTicker(monitorConfig().renew)
		defer t.Stop()
		for {
			select {
			case <-k.stop:
				return
			case <-t.C:
			}
			if err := d.leaseRenew(ctx, jobID, owner); errors.Is(err, errLeaseLost) {
				k.lost = true
				return
			} else if err != nil {
				d.Log.WarnContext(ctx, fmt.Sprintf("job %d: could not renew its monitor lease: %v", jobID, err))
			}
		}
	}()
	return k
}

func (k *leaseKeeper) close() bool {
	close(k.stop)
	<-k.done
	return k.lost
}

// eventTable is the event table and job column of a unified job's type.
func (d *Dispatcher) eventTable(ctype int64) (string, string) {
	switch ctype {
	case d.CT.ID("main.job"):
		return "main_jobevent", "job_id"
	case d.CT.ID("main.adhoccommand"):
		return "main_adhoccommandevent", "ad_hoc_command_id"
	case d.CT.ID("main.inventoryupdate"):
		return "main_inventoryupdateevent", "inventory_update_id"
	case d.CT.ID("main.projectupdate"):
		return "main_projectupdateevent", "project_update_id"
	case d.CT.ID("main.systemjob"):
		return "main_systemjobevent", "system_job_id"
	}
	return "", ""
}

// discardAbandonedEvents is discard_abandoned_events: the saved events of
// an attempt of the job that was given up, which would collide with the
// next attempt's counters.
func (d *Dispatcher) discardAbandonedEvents(ctx context.Context, q db.Querier, jobID int64) (int64, error) {
	var ctype int64
	var created time.Time
	if err := q.QueryRow(ctx, `SELECT polymorphic_ctype_id, created FROM main_unifiedjob WHERE id = $1`, jobID).Scan(&ctype, &created); err != nil {
		return 0, err
	}
	table, col := d.eventTable(ctype)
	if table == "" {
		return 0, nil
	}
	tag, err := q.Exec(ctx, `DELETE FROM `+table+` WHERE `+col+` = $1 AND job_created = $2`, jobID, created)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

// discardEventsBeforeRun is BaseTask.run's check: only a re-queued job has
// events before it runs, ones its abandoned attempt saved.
func (d *Dispatcher) discardEventsBeforeRun(ctx context.Context, jobID int64) {
	n, err := d.discardAbandonedEvents(ctx, d.DB.Pool, jobID)
	if err != nil {
		d.Log.WarnContext(ctx, "discarding abandoned events", "id", jobID, "err", err)
	} else if n > 0 {
		d.Log.WarnContext(ctx, fmt.Sprintf("unified job %d: deleting %d event(s) left by an earlier attempt", jobID, n))
	}
}

// requeueJob is requeue_job: the job goes back to the task manager as if
// it had never been dispatched, its lease and the events of the attempt
// given up with it. False when owner no longer owns the job.
func (d *Dispatcher) requeueJob(ctx context.Context, jobID int64, reason, owner string) bool {
	explanation := fmt.Sprintf("The job was re-queued because %s.", reason)
	var discarded int64
	updated := false
	err := d.DB.Tx(ctx, func(tx pgx.Tx) error {
		// The lease row first, then the job's, the order claimJob takes them in.
		if d.monitorOn {
			if _, err := tx.Exec(ctx, `SELECT 1 FROM main_jobmonitorlease WHERE unified_job_id = $1 FOR UPDATE`, jobID); err != nil {
				return err
			}
		}
		tag, err := tx.Exec(ctx, `UPDATE main_unifiedjob SET status = 'pending', controller_node = '', execution_node = '', work_unit_id = '', celery_task_id = '', started = NULL, job_explanation = $3
			WHERE id = $1 AND status = 'running' AND ($2 = '' OR celery_task_id = $2)`, jobID, owner, explanation)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return nil
		}
		updated = true
		d.leaseFinish(ctx, tx, jobID)
		discarded, err = d.discardAbandonedEvents(ctx, tx, jobID)
		return err
	})
	if err != nil {
		d.Log.ErrorContext(ctx, "re-queue job", "id", jobID, "err", err)
		return false
	}
	if !updated {
		return false
	}
	d.lifecycle(ctx, jobID, "monitor_requeued")
	msg := fmt.Sprintf("unified job %d re-queued because %s", jobID, reason)
	if discarded > 0 {
		msg += fmt.Sprintf("; the %d event(s) of the attempt given up are deleted", discarded)
	}
	d.Log.WarnContext(ctx, msg)
	if d.API != nil {
		d.API.EmitJobStatus(ctx, jobID, "pending")
	}
	d.mu.Lock()
	if d.blocked != nil {
		delete(d.blocked, jobID)
	}
	d.mu.Unlock()
	d.poke()
	return true
}

// claimJob is claim_job: this node becomes the job's controller and a new
// task id its owner, provided the lease is still expired and nothing
// changed the job since it was read. "" when the claim lost.
func (d *Dispatcher) claimJob(ctx context.Context, jobID int64, current string) (string, error) {
	taskID := newUUID()
	claimed := false
	err := d.DB.Tx(ctx, func(tx pgx.Tx) error {
		var one int
		if err := tx.QueryRow(ctx, `SELECT 1 FROM main_jobmonitorlease WHERE unified_job_id = $1 AND expires < now() FOR UPDATE`, jobID).Scan(&one); err != nil {
			if db.IsNoRows(err) {
				return nil
			}
			return err
		}
		tag, err := tx.Exec(ctx, `UPDATE main_unifiedjob SET celery_task_id = $3, controller_node = $4 WHERE id = $1 AND status = 'running' AND COALESCE(celery_task_id, '') = $2`,
			jobID, current, taskID, d.Cfg.ClusterHostID)
		if err != nil || tag.RowsAffected() == 0 {
			return err
		}
		claimed = true
		_, err = tx.Exec(ctx, `UPDATE main_jobmonitorlease SET expires = now() + make_interval(secs => $2), modified = now() WHERE unified_job_id = $1`, jobID, monitorConfig().lease.Seconds())
		return err
	})
	if err != nil || !claimed {
		return "", err
	}
	return taskID, nil
}

// monitoredJob is what the sweep and a resume read about a leased job.
type monitoredJob struct {
	id             int64
	ctype          int64
	status         string
	taskID         string
	cancelFlag     bool
	workUnitID     string
	executionNode  string
	controllerNode string
	launchType     string
	containerGroup bool
	meshNode       bool
	igID           *int64
	created        time.Time
	started        *time.Time
	// lease
	expires       time.Time
	podName       string
	podNamespace  string
	workerStarted bool
	deferrals     int
}

const monitoredJobColumns = `uj.id, uj.polymorphic_ctype_id, uj.status, COALESCE(uj.celery_task_id, ''), uj.cancel_flag, COALESCE(uj.work_unit_id, ''),
	COALESCE(uj.execution_node, ''), COALESCE(uj.controller_node, ''), uj.launch_type, COALESCE(ig.is_container_group, false), ig.mesh_node_id IS NOT NULL,
	uj.instance_group_id, uj.created, uj.started, l.expires, l.pod_name, l.pod_namespace, l.worker_started, l.deferrals`

func scanMonitoredJob(row interface{ Scan(...any) error }) (*monitoredJob, error) {
	j := &monitoredJob{}
	err := row.Scan(&j.id, &j.ctype, &j.status, &j.taskID, &j.cancelFlag, &j.workUnitID, &j.executionNode, &j.controllerNode, &j.launchType,
		&j.containerGroup, &j.meshNode, &j.igID, &j.created, &j.started, &j.expires, &j.podName, &j.podNamespace, &j.workerStarted, &j.deferrals)
	return j, err
}

func (d *Dispatcher) loadMonitoredJob(ctx context.Context, id int64) (*monitoredJob, error) {
	return scanMonitoredJob(d.DB.Pool.QueryRow(ctx, `SELECT `+monitoredJobColumns+` FROM main_jobmonitorlease l JOIN main_unifiedjob uj ON uj.id = l.unified_job_id
		LEFT JOIN main_instancegroup ig ON ig.id = uj.instance_group_id WHERE uj.id = $1`, id))
}

// isInlineSync is is_inline_sync: a project sync a job runs inside its own
// task before it starts.
func (d *Dispatcher) isInlineSync(j *monitoredJob) bool {
	return j.ctype == d.CT.ID("main.projectupdate") && j.launchType == "sync"
}

// jobCanRepeat is job_can_repeat: a project or inventory update run again
// from the start produces the same result; a playbook run partly does not.
func (d *Dispatcher) jobCanRepeat(j *monitoredJob) bool {
	if j.ctype == d.CT.ID("main.projectupdate") {
		return !d.isInlineSync(j)
	}
	return j.ctype == d.CT.ID("main.inventoryupdate")
}

// jobCanDetach is job_can_detach: a project update's output is never left
// for another task, since it works under the lock on its project.
func (d *Dispatcher) jobCanDetach(ctype int64) bool {
	return ctype != d.CT.ID("main.projectupdate")
}

// canRequeue is can_requeue: a job launched with passwords typed in at
// launch cannot start a second time, those are gone.
func (d *Dispatcher) canRequeue(ctx context.Context, jobID, ctype int64) bool {
	var ids []int64
	switch ctype {
	case d.CT.ID("main.job"):
		rows, err := d.DB.Pool.Query(ctx, `SELECT credential_id FROM main_unifiedjob_credentials WHERE unifiedjob_id = $1`, jobID)
		if err != nil {
			return true
		}
		for rows.Next() {
			var id int64
			if rows.Scan(&id) == nil {
				ids = append(ids, id)
			}
		}
		rows.Close()
	case d.CT.ID("main.adhoccommand"):
		var cred *int64
		if err := d.DB.Pool.QueryRow(ctx, `SELECT credential_id FROM main_adhoccommand WHERE unifiedjob_ptr_id = $1`, jobID).Scan(&cred); err == nil && cred != nil {
			ids = append(ids, *cred)
		}
	default:
		return true
	}
	if len(ids) == 0 {
		return true
	}
	briefs, err := models.LoadCredentialBriefs(ctx, d.DB.Pool, ids)
	if err != nil {
		return true
	}
	for _, b := range briefs {
		if len(b.PasswordsNeeded()) > 0 {
			return false
		}
	}
	return true
}

// localUnitHolder is local_unit_holder: the control or hybrid node whose
// own receptor runs the job's work unit, or "". A unit on an execution or
// hop node can be adopted from any control node, and a pod read from
// anywhere.
func (d *Dispatcher) localUnitHolder(ctx context.Context, j *monitoredJob) string {
	if j.containerGroup || j.executionNode == "" {
		return ""
	}
	var n int
	if err := d.DB.Pool.QueryRow(ctx, `SELECT count(*) FROM main_instance WHERE hostname = $1 AND node_type IN ('control', 'hybrid')`, j.executionNode).Scan(&n); err != nil || n == 0 {
		return ""
	}
	return j.executionNode
}

// holderIsPresent is holder_is_present: the node is ready, or went
// unavailable too recently to be declared lost.
func (d *Dispatcher) holderIsPresent(ctx context.Context, hostname string) bool {
	h, err := models.InstanceHealthByHostname(ctx, d.DB.Pool, hostname)
	if err != nil {
		return false
	}
	if h.NodeState == "ready" {
		return true
	}
	return h.NodeState == "unavailable" && !h.IsLost(time.Now())
}

// retireStaleLeases is retire_stale_leases: the expired leases of jobs
// that are no longer running.
func (d *Dispatcher) retireStaleLeases(ctx context.Context) int64 {
	tag, err := d.DB.Pool.Exec(ctx, `DELETE FROM main_jobmonitorlease l USING main_unifiedjob uj WHERE uj.id = l.unified_job_id AND l.expires < now() AND uj.status <> 'running'`)
	if err != nil {
		d.Log.WarnContext(ctx, "retiring stale monitor leases", "err", err)
		return 0
	}
	return tag.RowsAffected()
}

// runMonitorSweep runs sweep_job_monitors every thirty seconds.
func (d *Dispatcher) runMonitorSweep(ctx context.Context) {
	if !d.monitorOn {
		return
	}
	t := time.NewTicker(30 * time.Second)
	defer t.Stop()
	for {
		d.safely("job monitor sweep", func() { d.sweepJobMonitors(ctx) })
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
	}
}

// sweepJobMonitors is sweep_job_monitors: claim the jobs whose lease
// expired and resume reading their output here. A job whose unit only one
// node's receptor has is left to that node while it is up; any other job
// is taken only with control capacity to spare, but this node's own jobs
// always come back to it.
func (d *Dispatcher) sweepJobMonitors(ctx context.Context) int {
	if n := d.retireStaleLeases(ctx); n > 0 {
		d.Log.InfoContext(ctx, fmt.Sprintf("Job monitor sweep removed %d lease(s) of jobs that are no longer running", n))
	}
	cfg := monitorConfig()
	me := d.Cfg.ClusterHostID
	rows, err := d.DB.Pool.Query(ctx, `SELECT `+monitoredJobColumns+` FROM main_jobmonitorlease l JOIN main_unifiedjob uj ON uj.id = l.unified_job_id
		LEFT JOIN main_instancegroup ig ON ig.id = uj.instance_group_id
		WHERE l.expires < now() AND uj.status = 'running'
		ORDER BY CASE WHEN uj.controller_node = $1 OR uj.execution_node = $1 THEN 0 ELSE 1 END, l.expires LIMIT $2`, me, cfg.sweepBatch)
	if err != nil {
		d.Log.WarnContext(ctx, "job monitor sweep", "err", err)
		return 0
	}
	var expired []*monitoredJob
	for rows.Next() {
		if j, err := scanMonitoredJob(rows); err == nil {
			expired = append(expired, j)
		}
	}
	rows.Close()
	if len(expired) == 0 {
		return 0
	}
	inst, err := models.InstanceHealthByHostname(ctx, d.DB.Pool, me)
	if err != nil {
		d.Log.WarnContext(ctx, "Job monitor sweep skipped: this node has no instance record yet")
		return 0
	}
	if inst.NodeState != "ready" || (inst.NodeType != "control" && inst.NodeType != "hybrid") {
		d.Log.DebugContext(ctx, "Job monitor sweep skipped on "+me+": not a ready control node")
		return 0
	}
	var remaining int64
	if st, err := d.loadTaskManagerState(ctx, 0); err == nil {
		if i := st.instances[me]; i != nil {
			remaining = i.remaining()
		}
	}
	claimed := 0
	outOfCapacity := false
	for _, j := range expired {
		holder := d.localUnitHolder(ctx, j)
		if holder != "" && holder != me && d.holderIsPresent(ctx, holder) {
			continue // only that node's receptor has the unit
		}
		if j.controllerNode != me && holder != me {
			if !inst.Enabled || outOfCapacity {
				continue
			}
			if remaining < controlTaskImpact {
				outOfCapacity = true
				d.Log.InfoContext(ctx, fmt.Sprintf("Job monitor sweep on %s: no control capacity left for the jobs of other nodes; a peer or a later sweep takes them", me))
				continue
			}
		}
		former := j.controllerNode
		if former == "" {
			former = "nobody"
		}
		taskID, err := d.claimJob(ctx, j.id, j.taskID)
		if err != nil {
			d.Log.WarnContext(ctx, "claiming job", "id", j.id, "err", err)
			continue
		}
		if taskID == "" {
			continue
		}
		if j.controllerNode != me {
			remaining -= controlTaskImpact
		}
		claimed++
		d.Log.WarnContext(ctx, fmt.Sprintf("unified job %d: monitor lease held by %s expired at %s; %s is resuming it as task %s", j.id, former, j.expires.Local().Format("15:04:05"), me, taskID))
		d.startResume(j.id, taskID)
	}
	return claimed
}

// acknowledge logs the "acknowledged" lifecycle state the first time the
// task manager takes a task up (generate_dependencies).
func (d *Dispatcher) acknowledge(ctx context.Context, id int64) {
	d.mu.Lock()
	if d.acked == nil || len(d.acked) > 10000 {
		d.acked = map[int64]bool{}
	}
	seen := d.acked[id]
	d.acked[id] = true
	d.mu.Unlock()
	if !seen {
		d.lifecycle(ctx, id, "acknowledged")
	}
}

// taskContext is the bookkeeping context of a task run: it outlives a
// shutdown, and its records carry the task id as their correlation id.
func (d *Dispatcher) taskContext(id int64) context.Context {
	var taskID string
	_ = d.DB.Pool.QueryRow(d.base, `SELECT COALESCE(celery_task_id, '') FROM main_unifiedjob WHERE id = $1`, id).Scan(&taskID)
	if taskID == "" {
		return d.base
	}
	return extlog.WithGUID(d.base, strings.ReplaceAll(taskID, "-", ""))
}

// lifecycle is UnifiedJob.log_lifecycle for a task.
func (d *Dispatcher) lifecycle(ctx context.Context, id int64, state string) {
	if d != nil && d.API != nil {
		d.API.LogLifecycle(ctx, id, state)
	}
}
