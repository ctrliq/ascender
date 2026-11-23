// Package tasks is the background engine: it claims pending jobs from
// main_unifiedjob and runs them, writing status, events and results the
// way the old dispatcher and callback receiver did. Only project updates
// are implemented so far.
package tasks

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"runtime/debug"
	"strings"
	"sync"
	"time"

	"github.com/ctrliq/ascender/internal/api"
	"github.com/ctrliq/ascender/internal/config"
	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/models"
	"github.com/ctrliq/ascender/internal/settings"
)

// DispatchChannel is the LISTEN/NOTIFY channel the API wakes us on.
const DispatchChannel = "ascender_dispatch"

// Dispatcher claims and runs jobs.
type Dispatcher struct {
	Cfg      *config.Config
	DB       *db.DB
	CT       *models.ContentTypes
	Settings *settings.Store
	Log      *slog.Logger
	// API creates the jobs workflow nodes spawn, with the launch rules the
	// HTTP API applies.
	API *api.Server
	// Workers bounds concurrent jobs.
	Workers int

	wake chan struct{}
	wfMu sync.Mutex

	mu      sync.Mutex
	running map[int64]context.CancelFunc
	// blocked are pending jobs no instance group had room for; they are
	// tried again once a job finishes.
	blocked map[int64]bool

	// projectLocks serialise work on a project's source tree, as the old
	// file locks did.
	projectMu    sync.Mutex
	projectLocks map[int64]*projectLock

	// monitorOn: the database has the job monitor's lease table.
	monitorOn bool
	// acked are the tasks whose "acknowledged" lifecycle state is logged.
	acked map[int64]bool
	// runCtx ends when the task process is told to stop; base outlives it
	// for the bookkeeping that follows (a detach, a re-queue, a final
	// status).
	runCtx, base context.Context
	// tasks are the goroutines running or resuming jobs, waited for on
	// shutdown.
	tasks sync.WaitGroup
}

// stopping reports whether the task process is shutting down.
func (d *Dispatcher) stopping() bool {
	if d.runCtx == nil {
		return false
	}
	select {
	case <-d.runCtx.Done():
		return true
	default:
		return false
	}
}

// shutdownTimeout is how long a stopping task process waits for its jobs
// to detach, re-queue or stop (ASCENDER_SHUTDOWN_TIMEOUT seconds).
func shutdownTimeout() time.Duration {
	return envSeconds("ASCENDER_SHUTDOWN_TIMEOUT", 30)
}

// waitForTasks waits, for a while, for the jobs this process runs to wrap
// up after a shutdown signal.
func (d *Dispatcher) waitForTasks() {
	done := make(chan struct{})
	go func() {
		d.tasks.Wait()
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(shutdownTimeout()):
		d.Log.Warn("shutting down with jobs still wrapping up")
	}
}

// lockProject takes the lock of a project's tree; the returned function
// releases it. An entry lives while someone holds or waits for it, so the
// map does not grow with every project ever updated.
func (d *Dispatcher) lockProject(id int64) func() {
	d.projectMu.Lock()
	if d.projectLocks == nil {
		d.projectLocks = map[int64]*projectLock{}
	}
	l, ok := d.projectLocks[id]
	if !ok {
		l = &projectLock{}
		d.projectLocks[id] = l
	}
	l.refs++
	d.projectMu.Unlock()
	l.mu.Lock()
	var once sync.Once
	return func() {
		once.Do(func() {
			l.mu.Unlock()
			d.projectMu.Lock()
			l.refs--
			if l.refs == 0 {
				delete(d.projectLocks, id)
			}
			d.projectMu.Unlock()
		})
	}
}

// projectLock is a project's tree lock and the number of its holders and
// waiters.
type projectLock struct {
	mu   sync.Mutex
	refs int
}

type notice struct {
	Type string `json:"type"`
	ID   int64  `json:"id"`
	// Images are the references a remove_images notice names.
	Images []string `json:"images,omitempty"`
}

// Run listens for notifications and polls for pending work until ctx ends.
func (d *Dispatcher) Run(ctx context.Context) error {
	if d.Workers <= 0 {
		d.Workers = 2
	}
	d.running = map[int64]context.CancelFunc{}
	d.blocked = map[int64]bool{}
	d.runCtx, d.base = ctx, context.WithoutCancel(ctx)
	d.detectMonitor(d.base)
	if err := d.provision(ctx); err != nil {
		return err
	}
	if ctx.Err() != nil {
		return nil
	}
	if d.API != nil {
		// Under the scheduler's lock, waited for: a pass in another task
		// process finishes first, and none starts while this one runs.
		d.advisoryLocked(ctx, schedulerLockID, "sync schedules", true, func() { d.API.SyncSchedules(ctx) })
	}
	d.startupReaping(ctx)
	sem := make(chan struct{}, d.Workers)
	d.wake = make(chan struct{}, 1)
	go d.listen(ctx, d.poke)

	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()
	go d.runScheduler(ctx)
	go d.publishMetrics(ctx)
	go d.runHostMetricTasks(ctx)
	go d.runDeprovisionReaper(ctx)
	go d.runHeartbeat(ctx)
	go d.runReceptorConfig(ctx)
	go d.runMonitorSweep(ctx)
	go d.runCancelPoll(ctx)
	go d.runCleanupPaths(ctx)
	for {
		d.safely("workflow manager", func() { d.processWorkflows(ctx) })
		d.safely("task claim", func() { d.claimAndRun(ctx, sem) })
		select {
		case <-ctx.Done():
			d.waitForTasks()
			return nil
		case <-d.wake:
		case <-ticker.C:
			// Jobs waiting for room are looked at again now and then too.
			d.mu.Lock()
			d.blocked = map[int64]bool{}
			d.mu.Unlock()
		}
	}
}

// poke wakes the main loop without blocking.
func (d *Dispatcher) poke() {
	select {
	case d.wake <- struct{}{}:
	default:
	}
}

// listen holds a dedicated connection on the notify channel.
func (d *Dispatcher) listen(ctx context.Context, poke func()) {
	for ctx.Err() == nil {
		conn, err := d.DB.Pool.Acquire(ctx)
		if err != nil {
			time.Sleep(5 * time.Second)
			continue
		}
		if _, err := conn.Exec(ctx, "LISTEN "+DispatchChannel); err != nil {
			conn.Release()
			time.Sleep(5 * time.Second)
			continue
		}
		for ctx.Err() == nil {
			n, err := conn.Conn().WaitForNotification(ctx)
			if err != nil {
				break
			}
			var msg notice
			_ = json.Unmarshal([]byte(n.Payload), &msg)
			switch msg.Type {
			case "cancel":
				d.cancel(msg.ID)
			case "health_check":
				d.healthCheckByID(ctx, msg.ID)
			case "remove_images":
				// The mesh commands take a while; the listen goes on.
				go d.safely("removal of images", func() { d.handleRemovedImages(ctx, msg.Images) })
			}
			poke()
		}
		conn.Release()
	}
}

func (d *Dispatcher) cancel(id int64) {
	d.mu.Lock()
	defer d.mu.Unlock()
	if c, ok := d.running[id]; ok {
		c()
	}
}

// cancelEverywhere stops a job whose cancel_flag is set, wherever it runs:
// here at once, on another task process through the notify channel the
// API's cancel uses, and failing that by the cancel-flag poll.
func (d *Dispatcher) cancelEverywhere(ctx context.Context, id int64) {
	d.cancel(id)
	b, _ := json.Marshal(notice{Type: "cancel", ID: id})
	if _, err := d.DB.Pool.Exec(ctx, `SELECT pg_notify($1, $2)`, DispatchChannel, string(b)); err != nil {
		d.Log.WarnContext(ctx, "pg_notify failed", "err", err)
	}
}

// cancelableBy is ctx, with its values (the task's log correlation, its
// workload scope), ended also by jobCtx: the steps before the runner (a
// credential lookup) stop on a cancel or a shutdown as the runner does.
func cancelableBy(ctx, jobCtx context.Context) (context.Context, context.CancelFunc) {
	c, cancel := context.WithCancel(ctx)
	stop := context.AfterFunc(jobCtx, cancel)
	return c, func() { stop(); cancel() }
}

// shutdownExplanation is BaseTask.run's explanation for a task a shutdown
// stopped.
const shutdownExplanation = "Task was canceled due to receiving a shutdown signal."

// preRunInterrupted is what becomes of a task whose context ended in the
// steps before the runner (an image pull, the callback plugin probe, a
// credential lookup): canceled when it was canceled (its own flag, or the
// task that ran it inline). A shutdown re-queues it when its hold allows,
// as a shutdown before the work had its payload does ("" then, with the
// hold abandoned); otherwise it fails with BaseTask's shutdown
// explanation.
func (d *Dispatcher) preRunInterrupted(ctx context.Context, id int64, hold *monitorHold, explain func(string)) string {
	if d.cancelRequested(ctx, id) || !d.stopping() {
		return "canceled"
	}
	if hold != nil && hold.canRequeue && !hold.inlineSync {
		hold.outcome, hold.reason = readRequeue, hold.requeueReason()
		return ""
	}
	explain(shutdownExplanation)
	return "failed"
}

// runningIDs are the tasks this process runs (with the inline updates
// they wait for).
func (d *Dispatcher) runningIDs() []int64 {
	d.mu.Lock()
	defer d.mu.Unlock()
	ids := make([]int64, 0, len(d.running))
	for id := range d.running {
		ids = append(ids, id)
	}
	return ids
}

// cancelPollInterval is how often the cancel flags of running tasks are
// read.
const cancelPollInterval = 5 * time.Second

// runCancelPoll is the old runner's cancel_callback, which read the job's
// cancel_flag as the job ran: a cancel whose notification was missed (sent
// while listen reconnected, or a cancel_flag set by another task process
// or the old app) still stops the task within a few seconds.
func (d *Dispatcher) runCancelPoll(ctx context.Context) {
	t := time.NewTicker(cancelPollInterval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
		d.safely("cancel poll", func() { d.pollCancels(ctx) })
	}
}

func (d *Dispatcher) pollCancels(ctx context.Context) {
	ids := d.runningIDs()
	if len(ids) == 0 {
		return
	}
	flagged, err := models.ScanIDs(ctx, d.DB.Pool, `SELECT id FROM main_unifiedjob WHERE id = ANY($1) AND cancel_flag`, ids)
	if err != nil {
		if ctx.Err() == nil {
			d.Log.WarnContext(ctx, "reading cancel flags", "err", err)
		}
		return
	}
	for _, id := range flagged {
		d.cancel(id)
	}
}

// runInline runs a project or inventory update inside the task that needs
// it (a dependency, or a job's project sync), registered like a claimed
// task so that its own cancel, by notification or by the poll, reaches it
// and so that the reaper sees it as active.
func (d *Dispatcher) runInline(jobCtx context.Context, id int64, run func(context.Context) error) error {
	ctx, cancel := context.WithCancel(jobCtx)
	defer cancel()
	d.mu.Lock()
	if d.running == nil {
		d.running = map[int64]context.CancelFunc{}
	}
	d.running[id] = cancel
	d.mu.Unlock()
	defer func() {
		d.mu.Lock()
		delete(d.running, id)
		d.mu.Unlock()
	}()
	return run(ctx)
}

// claimAndRun moves pending tasks to waiting and starts them, leaving
// the ones the task manager's blocking rules held back (blockerSQL)
// pending with their explanation.
func (d *Dispatcher) claimAndRun(ctx context.Context, sem chan struct{}) {
	d.explainBlocked(ctx)
	d.logBlocked(ctx)
	for {
		select {
		case sem <- struct{}{}:
		default:
			return // all workers busy
		}
		if !d.claimNext(ctx, sem) {
			return
		}
	}
}

// claimNext claims one task with the worker slot taken from sem, and
// reports whether to look for another. The slot goes back unless the task
// started; a panic gives it back too (the claimed task, left waiting, is
// the local reaper's).
func (d *Dispatcher) claimNext(ctx context.Context, sem chan struct{}) bool {
	held := true
	release := func() {
		if held {
			held = false
			<-sem
		}
	}
	defer func() {
		if p := recover(); p != nil {
			release()
			panic(p)
		}
	}()
	d.mu.Lock()
	skip := make([]int64, 0, len(d.blocked))
	for b := range d.blocked {
		skip = append(skip, b)
	}
	d.mu.Unlock()
	id, ctype, placed := d.claimLocked(ctx, skip)
	switch placed {
	case claimNone:
		release()
		return false
	case claimNoRoom:
		d.mu.Lock()
		d.blocked[id] = true
		d.mu.Unlock()
		release()
		return true
	}
	// The task manager's pre_start check, on the way to waiting.
	if expl, err := d.preStartCheck(ctx, id, ctype); err != nil {
		d.Log.ErrorContext(ctx, "pre-start check", "id", id, "err", err)
	} else if expl != "" {
		d.Log.WarnContext(ctx, "job failed its pre-start check", "id", id, "explanation", expl)
		if err := d.failPreStart(ctx, id, expl); err != nil {
			d.Log.ErrorContext(ctx, "fail pre-start", "id", id, "err", err)
		}
		release()
		// A failed job may unblock another job or a workflow node.
		d.poke()
		return true
	}
	// start_task: the task manager emitted the move to waiting.
	if d.API != nil {
		d.lifecycle(ctx, id, "waiting")
		d.API.EmitJobStatus(ctx, id, "waiting")
	}
	// A job's context ends on a cancel and on a shutdown, which the
	// run tells apart by the cancel flag (_cancel_requested).
	jobCtx, cancel := context.WithCancel(ctx)
	d.mu.Lock()
	d.running[id] = cancel
	d.mu.Unlock()
	d.tasks.Add(1)
	// The slot is the goroutine's to give back now.
	held = false
	isJob := ctype == d.CT.ID("main.job")
	isInventoryUpdate := ctype == d.CT.ID("main.inventoryupdate")
	isSystemJob := ctype == d.CT.ID("main.systemjob")
	isAdHoc := ctype == d.CT.ID("main.adhoccommand")
	go func(id int64) {
		defer func() {
			<-sem
			d.mu.Lock()
			delete(d.running, id)
			d.mu.Unlock()
			cancel()
			d.tasks.Done()
		}()
		kind := "project update"
		run := d.runProjectUpdate
		if isJob {
			kind, run = "job", d.runJob
		}
		if isInventoryUpdate {
			kind, run = "inventory update", d.runInventoryUpdate
		}
		if isSystemJob {
			kind, run = "system job", d.runSystemJob
		}
		if isAdHoc {
			kind, run = "ad hoc command", d.runAdHocCommand
		}
		d.Log.InfoContext(ctx, kind+" starting", "id", id)
		// Each run recovers its own panics and finishes the job; one
		// outside that leaves the job to the local reaper.
		d.safely(kind+" "+fmt.Sprint(id), func() {
			if err := run(jobCtx, d.taskContext(id), id); err != nil {
				d.Log.ErrorContext(ctx, kind+" failed", "id", id, "err", err)
			} else {
				d.Log.InfoContext(ctx, kind+" finished", "id", id)
			}
		})
		// A finished job may unblock a workflow node or another job,
		// and frees room in its instance group.
		d.mu.Lock()
		d.blocked = map[int64]bool{}
		d.mu.Unlock()
		d.poke()
	}(id)
	return true
}

// claimOutcome is what claimAndPlace did.
type claimOutcome int

const (
	claimNone   claimOutcome = iota // nothing to claim, or the claim failed
	claimPlaced                     // claimed and placed (or placement failed: run anyway, as before)
	claimNoRoom                     // claimed, did not fit, back to pending
)

// claimLocked is claimAndPlace under the task manager's lock. The claim
// and the placement read what other task processes have claimed and
// placed (the blocking rules, instance group capacity), so they run under
// the lock, as the task manager's pass did: without it two task processes
// could each start a job of the same template, or both fill the last
// room in a group. The lock is waited for; it is held only for these few
// statements, each committed before it is released.
func (d *Dispatcher) claimLocked(ctx context.Context, skip []int64) (id, ctype int64, outcome claimOutcome) {
	d.advisoryLocked(ctx, taskManagerLockID, "task claim", true, func() {
		id, ctype, outcome = d.claimAndPlace(ctx, skip)
	})
	return id, ctype, outcome
}

// blockerSQL is the task manager's dependency graph (task_blocked_by in
// dependency_graph.py) as an SQL expression on the pending task uj: the
// waiting or running task that keeps it pending, as
// "<model_name>-<id>", or NULL. $1 to $5 are the content types of project
// updates, jobs, inventory updates, system jobs and ad hoc commands.
//
//   - a project update waits for another update of its project;
//   - an inventory update waits for another update of its inventory source;
//   - a system job waits for any other system job;
//   - a job waits for an update of its project, then for an ad hoc command
//     on its inventory, then for a sync of its inventory unless the
//     inventory allows jobs while syncing, then, unless it allows
//     simultaneous runs, for a job of its job template;
//   - an ad hoc command waits for another ad hoc command on its inventory,
//     then for a sync of its inventory unless the inventory allows jobs
//     while syncing.
//
// When several tasks block it, the first one the graph marked is named:
// the oldest by creation. Tasks with launch type "sync" (a job's project
// sync) were left out of the graph.
const blockerSQL = `CASE uj.polymorphic_ctype_id
	WHEN $1 THEN (SELECT 'projectupdate-' || o.id FROM main_projectupdate c JOIN main_projectupdate op ON op.project_id = c.project_id
		JOIN main_unifiedjob o ON o.id = op.unifiedjob_ptr_id
		WHERE c.unifiedjob_ptr_id = uj.id AND o.status IN ('waiting', 'running') AND o.launch_type <> 'sync' ORDER BY o.created, o.id LIMIT 1)
	WHEN $3 THEN (SELECT 'inventoryupdate-' || o.id FROM main_inventoryupdate c JOIN main_inventoryupdate oi ON oi.inventory_source_id = c.inventory_source_id
		JOIN main_unifiedjob o ON o.id = oi.unifiedjob_ptr_id
		WHERE c.unifiedjob_ptr_id = uj.id AND o.status IN ('waiting', 'running') AND o.launch_type <> 'sync' ORDER BY o.created, o.id LIMIT 1)
	WHEN $4 THEN (SELECT 'systemjob-' || o.id FROM main_unifiedjob o
		WHERE o.polymorphic_ctype_id = $4 AND o.status IN ('waiting', 'running') AND o.launch_type <> 'sync' ORDER BY o.created, o.id LIMIT 1)
	WHEN $2 THEN (SELECT COALESCE(
		(SELECT 'projectupdate-' || o.id FROM main_projectupdate op JOIN main_unifiedjob o ON o.id = op.unifiedjob_ptr_id
			WHERE op.project_id = c.project_id AND o.status IN ('waiting', 'running') AND o.launch_type <> 'sync' ORDER BY o.created, o.id LIMIT 1),
		` + inventoryBlockerSQL + `,
		CASE WHEN NOT c.allow_simultaneous THEN (SELECT 'job-' || o.id FROM main_job oj JOIN main_unifiedjob o ON o.id = oj.unifiedjob_ptr_id
			WHERE oj.job_template_id = c.job_template_id AND o.status IN ('waiting', 'running') AND o.launch_type <> 'sync' ORDER BY o.created, o.id LIMIT 1) END)
		FROM main_job c WHERE c.unifiedjob_ptr_id = uj.id)
	WHEN $5 THEN (SELECT ` + inventoryBlockerSQL + ` FROM main_adhoccommand c WHERE c.unifiedjob_ptr_id = uj.id)
	END`

// inventoryBlockerSQL is inventory_blocked_by for the job or ad hoc command
// c: an ad hoc command on its inventory, or else a sync of it unless the
// inventory allows jobs while syncing. An inventory update's inventory is
// its own, or its source's when it has none.
const inventoryBlockerSQL = `COALESCE(
		(SELECT 'adhoccommand-' || o.id FROM main_adhoccommand oa JOIN main_unifiedjob o ON o.id = oa.unifiedjob_ptr_id
			WHERE oa.inventory_id = c.inventory_id AND o.status IN ('waiting', 'running') AND o.launch_type <> 'sync' ORDER BY o.created, o.id LIMIT 1),
		(SELECT 'inventoryupdate-' || o.id FROM main_inventoryupdate oi JOIN main_unifiedjob o ON o.id = oi.unifiedjob_ptr_id
			JOIN main_inventorysource src ON src.unifiedjobtemplate_ptr_id = oi.inventory_source_id
			WHERE COALESCE(oi.inventory_id, src.inventory_id) = c.inventory_id AND o.status IN ('waiting', 'running') AND o.launch_type <> 'sync'
			AND NOT EXISTS (SELECT 1 FROM main_inventory i WHERE i.id = c.inventory_id AND i.allow_jobs_while_syncing)
			ORDER BY o.created, o.id LIMIT 1))`

// claimAndPlace moves one pending task to waiting and chooses its instance
// group and nodes. Call it through claimLocked.
func (d *Dispatcher) claimAndPlace(ctx context.Context, skip []int64) (id, ctype int64, outcome claimOutcome) {
	// The oldest pending task that nothing blocks (blockerSQL). Tasks with
	// launch type "sync" were never the task manager's to start.
	err := d.DB.Pool.QueryRow(ctx, `UPDATE main_unifiedjob SET status = 'waiting', modified = now()
		WHERE id = (SELECT uj.id FROM main_unifiedjob uj
			WHERE uj.status = 'pending' AND uj.polymorphic_ctype_id IN ($1, $2, $3, $4, $5) AND uj.launch_type <> 'sync' AND NOT (uj.id = ANY($6::bigint[]))
			AND (`+blockerSQL+`) IS NULL
			ORDER BY uj.id FOR UPDATE SKIP LOCKED LIMIT 1)
		RETURNING id, polymorphic_ctype_id`, d.claimTypes(skip)...).Scan(&id, &ctype)
	if err != nil {
		if !db.IsNoRows(err) {
			d.Log.ErrorContext(ctx, "claim job", "err", err)
		}
		return 0, 0, claimNone
	}
	d.acknowledge(ctx, id)
	// The task manager's capacity check and instance group choice
	// (capacity.go); a task that does not fit stays pending.
	if ok, err := d.placeTask(ctx, id, ctype); err != nil {
		d.Log.ErrorContext(ctx, "instance group choice", "id", id, "err", err)
	} else if !ok {
		d.lifecycle(ctx, id, "needs_capacity")
		if _, err := d.DB.Pool.Exec(ctx, `UPDATE main_unifiedjob SET status = 'pending', modified = now() WHERE id = $1 AND status = 'waiting'`, id); err != nil {
			// Left waiting, it is the local reaper's.
			d.Log.ErrorContext(ctx, "returning a task to pending", "id", id, "err", err)
		}
		return id, ctype, claimNoRoom
	}
	d.clearPendingExplanation(ctx, id)
	return id, ctype, claimPlaced
}

// clearPendingExplanation is pre_start's "remove any job_explanations that
// may have been set while job was in pending": a task the task manager
// starts drops why it waited ("waiting for job-12 to finish", "not enough
// capacity"), which would otherwise stay on it while it runs and after.
func (d *Dispatcher) clearPendingExplanation(ctx context.Context, id int64) {
	if _, err := d.DB.Pool.Exec(ctx, `UPDATE main_unifiedjob SET job_explanation = '' WHERE id = $1 AND job_explanation <> ''`, id); err != nil {
		d.Log.ErrorContext(ctx, "clearing the pending explanation", "id", id, "err", err)
	}
}

// claimTypes are blockerSQL's arguments, then skip.
func (d *Dispatcher) claimTypes(skip []int64) []any {
	return []any{d.CT.ID("main.projectupdate"), d.CT.ID("main.job"), d.CT.ID("main.inventoryupdate"), d.CT.ID("main.systemjob"), d.CT.ID("main.adhoccommand"), skip}
}

// explainBlocked is the task manager's explanation for a blocked task:
// "waiting for <model_name>-<id> to finish", written once the task is 30
// seconds old (most blocks clear within seconds) and when it changed.
func (d *Dispatcher) explainBlocked(ctx context.Context) {
	_, err := d.DB.Pool.Exec(ctx, `UPDATE main_unifiedjob t SET job_explanation = b.explanation
		FROM (SELECT uj.id, 'waiting for ' || (`+blockerSQL+`) || ' to finish' AS explanation FROM main_unifiedjob uj
			WHERE uj.status = 'pending' AND uj.polymorphic_ctype_id IN ($1, $2, $3, $4, $5) AND uj.launch_type <> 'sync'
			AND uj.created < now() - interval '30 seconds' AND NOT (uj.id = ANY($6::bigint[]))) b
		WHERE t.id = b.id AND t.status = 'pending' AND b.explanation IS NOT NULL AND t.job_explanation IS DISTINCT FROM b.explanation`, d.claimTypes([]int64{})...)
	if err != nil && ctx.Err() == nil {
		d.Log.ErrorContext(ctx, "blocked task explanations", "err", err)
	}
}

// runDeprovisionReaper removes deprovisioned nodes once their jobs are
// done, looking every minute as remove_deprovisioned_node did.
func (d *Dispatcher) runDeprovisionReaper(ctx context.Context) {
	if d.API == nil {
		return
	}
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
		d.safely("deprovision reaper", func() {
			if err := d.API.RemoveDeprovisionedInstances(ctx); err != nil {
				d.Log.ErrorContext(ctx, "removing deprovisioned instances", "err", err)
			}
		})
	}
}

// runScheduler launches due schedules every thirty seconds, as the
// periodic scheduler task did, under an advisory lock so only one task
// process does it.
func (d *Dispatcher) runScheduler(ctx context.Context) {
	if d.API == nil {
		return
	}
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
		d.schedulerPass(ctx)
	}
}

// The advisory lock keys are db.AdvisoryLockKey's, the
// ones the old app's advisory_lock took: the old and new task processes
// never both run a pass against a shared database.

// schedulerLockID is the periodic scheduler's 'awx_periodic_scheduler_lock'.
var schedulerLockID = db.AdvisoryLockKey("awx_periodic_scheduler_lock")

// taskManagerLockID is the TaskManager's lock (advisory_lock(
// "task_manager_lock")): one task process at a time claims and places
// tasks, so the blocking rules and capacity see every other claim.
var taskManagerLockID = db.AdvisoryLockKey("task_manager_lock")

// workflowLockID is the WorkflowManager's lock (advisory_lock(
// "workflow_manager_lock", wait=False)): one task process at a time
// advances workflows, so no two spawn the same node's job.
var workflowLockID = db.AdvisoryLockKey("workflow_manager_lock")

// withAdvisoryLock runs fn while holding a session advisory lock, taken
// without waiting: when another process holds it, fn does not run. It
// reports whether fn ran.
func (d *Dispatcher) withAdvisoryLock(ctx context.Context, key int64, what string, fn func()) bool {
	return d.advisoryLocked(ctx, key, what, false, fn)
}

// advisoryLocked runs fn while holding a session advisory lock, which it
// waits for when wait is set, on a dedicated connection: a session lock
// belongs to the connection that took it, so taking and releasing it
// through the pool could leave it held. It reports whether fn ran.
func (d *Dispatcher) advisoryLocked(ctx context.Context, key int64, what string, wait bool, fn func()) bool {
	conn, err := d.DB.Pool.Acquire(ctx)
	if err != nil {
		if ctx.Err() == nil {
			d.Log.ErrorContext(ctx, what, "err", err)
		}
		return false
	}
	defer conn.Release()
	if wait {
		if _, err := conn.Exec(ctx, `SELECT pg_advisory_lock($1)`, key); err != nil {
			if ctx.Err() == nil {
				d.Log.ErrorContext(ctx, what, "err", err)
			}
			// Cancelled while waiting: whether the lock was granted is not
			// known, and closing the connection gives it up either way.
			_ = conn.Conn().Close(context.Background())
			return false
		}
	} else {
		var locked bool
		if err := conn.QueryRow(ctx, `SELECT pg_try_advisory_lock($1)`, key).Scan(&locked); err != nil || !locked {
			return false
		}
	}
	defer func() {
		if _, err := conn.Exec(context.Background(), `SELECT pg_advisory_unlock($1)`, key); err != nil {
			d.Log.WarnContext(ctx, what+" unlock", "err", err)
			// A lock that could not be released must not outlive this
			// pass on a pooled connection.
			_ = conn.Conn().Close(context.Background())
		}
	}()
	d.safely(what, fn)
	return true
}

// safely runs one pass of a background loop, so that a panic in it is
// logged with its stack and the loop (and with it every job this process
// runs) carries on, as a dispatcher worker survived a failed task.
func (d *Dispatcher) safely(what string, fn func()) {
	defer func() {
		if p := recover(); p != nil {
			d.Log.Error(what+" panicked", "panic", p, "stack", string(debug.Stack()))
		}
	}()
	fn()
}

// background runs a send that outlives its caller (notifications, a
// webhook status) under the API server's tracker, which the task process
// lets finish at shutdown before the pool closes.
func (d *Dispatcher) background(fn func(ctx context.Context)) {
	if d.API != nil {
		d.API.Background(fn)
	}
}

// schedulerPass runs one pass while holding the scheduler lock.
func (d *Dispatcher) schedulerPass(ctx context.Context) {
	d.withAdvisoryLock(ctx, schedulerLockID, "scheduler", func() {
		if err := d.API.SchedulerPass(ctx, time.Now()); err != nil {
			d.Log.ErrorContext(ctx, "scheduler", "err", err)
		}
		d.reapPods(ctx)
		d.reapWorkUnits(ctx)
		d.poke()
	})
}

// notify sends a job's notifications for a status change in the background
// (send_notification_templates): "running", or the finished status, which
// is succeeded when the job was successful and failed otherwise.
func (d *Dispatcher) notify(jobID int64, status string) {
	if d.API == nil {
		return
	}
	// Webhook-launched jobs report every status change to their forge.
	d.background(func(ctx context.Context) { d.API.SendWebhookStatus(ctx, jobID, status) })
	d.API.EmitJobStatus(context.Background(), jobID, status)
	switch status {
	case "running":
	case "successful":
		status = "succeeded"
	default:
		status = "failed"
	}
	d.background(func(ctx context.Context) { d.API.SendJobNotifications(ctx, jobID, status) })
}

// startupReaping is reaper.startup_reaping and reap_waiting(grace_period=0)
// at dispatcher start: whatever this node was running or about to run did
// not survive the restart. Workflow jobs are left out; their runner picks
// them up again.
func (d *Dispatcher) startupReaping(ctx context.Context) {
	wf, approval := d.CT.ID("main.workflowjob"), d.CT.ID("main.workflowapproval")
	reap := func(where, explanation string) []int64 {
		rows, err := d.DB.Pool.Query(ctx, `SELECT id FROM main_unifiedjob WHERE `+where+` AND polymorphic_ctype_id NOT IN ($1, $2)`, wf, approval)
		if err != nil {
			d.Log.ErrorContext(ctx, "startup reaping", "err", err)
			return nil
		}
		var ids []int64
		for rows.Next() {
			var id int64
			if rows.Scan(&id) == nil {
				ids = append(ids, id)
			}
		}
		rows.Close()
		for _, id := range ids {
			if err := d.reapJob(ctx, id, explanation); err != nil {
				d.Log.ErrorContext(ctx, "reap job", "id", id, "err", err)
			}
		}
		return ids
	}
	host := d.Cfg.ClusterHostID
	leaseFree := ""
	if d.monitorOn {
		// A running job that holds a monitor lease was handed to a worker
		// that may well still run it; the sweep resumes or re-queues it.
		leaseFree = ` AND NOT EXISTS (SELECT 1 FROM main_jobmonitorlease l WHERE l.unified_job_id = main_unifiedjob.id)`
		rows, err := d.DB.Pool.Query(ctx, `SELECT id FROM main_unifiedjob uj WHERE status = 'running' AND controller_node = $1 AND EXISTS (SELECT 1 FROM main_jobmonitorlease l WHERE l.unified_job_id = uj.id) ORDER BY id`, host)
		if err == nil {
			var leased []int64
			for rows.Next() {
				var id int64
				if rows.Scan(&id) == nil {
					leased = append(leased, id)
				}
			}
			rows.Close()
			if len(leased) > 0 {
				d.Log.WarnContext(ctx, fmt.Sprintf("Unified jobs %v were running under a monitor lease at dispatch startup; left to the job monitor sweep", leased))
			}
		}
	}
	if ids := reap(fmt.Sprintf(`status = 'running' AND controller_node = %s`, quoteLiteral(host))+leaseFree,
		"Task was marked as running at system start up. The system must have not shut down properly, so it has been marked as failed."); len(ids) > 0 {
		d.Log.ErrorContext(ctx, fmt.Sprintf("Unified jobs %v were reaped on dispatch startup", ids))
	}
	// A job this runner claimed (waiting) but never started.
	const notQueued = "Task was marked as running but was not present in the job queue, so it has been marked as failed."
	reap(fmt.Sprintf(`status = 'waiting' AND controller_node = %s`, quoteLiteral(host)), notQueued)
	// One claimed but not yet placed has no controller. Another replica's
	// claim is in that state until its placement, which runs under the
	// task manager lock: only under that lock, and only one left so for a
	// while, is it a claim that was lost.
	d.advisoryLocked(ctx, taskManagerLockID, "startup reap", true, func() {
		reap(`status = 'waiting' AND controller_node = '' AND modified < now() - interval '2 minutes'`, notQueued)
	})
}

// reapJob is reaper.reap_job: the job fails with the explanation added to
// any it had, its template follows, and its failure is announced.
func (d *Dispatcher) reapJob(ctx context.Context, id int64, explanation string) error {
	var ujt *int64
	err := d.DB.Pool.QueryRow(ctx, `UPDATE main_unifiedjob SET status = 'failed', failed = true, start_args = '', finished = COALESCE(finished, now()),
		elapsed = CASE WHEN started IS NOT NULL THEN EXTRACT(EPOCH FROM (COALESCE(finished, now()) - started)) ELSE elapsed END,
		job_explanation = CASE WHEN job_explanation <> '' THEN job_explanation || ' ' ELSE '' END || $2, modified = now()
		WHERE id = $1 AND status IN ('running', 'waiting') RETURNING unified_job_template_id`, id, explanation).Scan(&ujt)
	if err != nil {
		return err
	}
	if ujt != nil {
		_ = d.templateFinished(ctx, d.DB.Pool, *ujt, "failed", id, true, time.Now())
	}
	d.notify(id, "failed")
	return nil
}

// quoteLiteral quotes a string for SQL.
func quoteLiteral(s string) string { return "'" + strings.ReplaceAll(s, "'", "''") + "'" }
