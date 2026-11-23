package tasks

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime/debug"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/models"
)

// This file holds what BaseTask (main/tasks/jobs.py) gave every run type:
// the start of the run, the private data directory, the execution
// environment's parameters and runner's environment additions, the
// mapping of how the runner ended, and the final status. Jobs and ad hoc
// commands (jobRun), project updates (puRun) and inventory updates
// (invUpdateRun) embed baseRun.

// baseRun is the state every run type keeps.
type baseRun struct {
	d   *Dispatcher
	ctx context.Context // bookkeeping context, outlives a cancellation
	id  int64
	// logKey names the run's id in log lines ("job", "project_update").
	logKey string
	ee     *models.ExecutionEnvironment
	pdd    string

	explanation string
	traceback   string
	started     time.Time

	// hold is the task's hold on the run: its task id, and the monitor
	// lease while a worker elsewhere runs it.
	hold *monitorHold
	// cg is the container group the run is in, if it runs in one.
	cg *containerGroup
	// remote is the execution node it runs on over the mesh, if not this
	// one.
	remote string
	// localWork: the run is `local` work of this node's own receptor (a
	// project update on Kubernetes), not a container this process starts.
	localWork bool
}

// newBaseRun is the state of a run of unified job id, of model ctype
// ("main.job"), held under its current task id.
func (d *Dispatcher) newBaseRun(ctx context.Context, id int64, logKey, ctype string) baseRun {
	return baseRun{d: d, ctx: ctx, id: id, logKey: logKey, started: time.Now(), hold: d.newHold(ctx, id, d.CT.ID(ctype))}
}

func (r *baseRun) log(msg string, kv ...any) {
	r.d.Log.Info(msg, append([]any{r.logKey, r.id}, kv...)...)
}

// explain records a job_explanation, keeping earlier text (delay_update).
func (r *baseRun) explain(msg string) {
	if msg == "" || strings.Contains(r.explanation, msg) {
		return
	}
	if r.explanation != "" {
		r.explanation += "\n"
	}
	r.explanation += msg
}

// takeExplanation clears the explanation and returns it.
func (r *baseRun) takeExplanation() string {
	e := r.explanation
	r.explanation = ""
	return e
}

func (r *baseRun) hasTraceback() bool     { return r.traceback != "" }
func (r *baseRun) setTraceback(tb string) { r.traceback = tb }

func (r *baseRun) artifactDir() string {
	return filepath.Join(r.pdd, "artifacts", fmt.Sprint(r.id))
}

// owner is the task id the run is owned under ("" for none).
func (r *baseRun) owner() string {
	if r.hold == nil {
		return ""
	}
	return r.hold.owner
}

// worker reports whether the run is an ansible-runner worker (in a pod, on
// an execution node, or as local work of this node's receptor) rather than
// an execution environment this process runs itself.
func (r *baseRun) worker() bool { return r.cg != nil || r.remote != "" || r.localWork }

// timeoutFrom is get_instance_timeout: the run's own timeout, else the
// global setting; a negative one means none.
func (r *baseRun) timeoutFrom(setting string, local int64) int64 {
	if local < 0 {
		return 0
	}
	if local == 0 {
		return r.d.Settings.Int(r.ctx, setting)
	}
	return local
}

// preRunInterrupted is the status of a run stopped before its runner
// started; "" when it is re-queued (r.hold is abandoned then).
func (r *baseRun) preRunInterrupted() string {
	return r.d.preRunInterrupted(r.ctx, r.id, r.hold, r.explain)
}

// --- the start of a run ---------------------------------------------------------

// recoverPanic, deferred by a run, finishes the run as an error with the
// panic as its traceback.
func (r *baseRun) recoverPanic(what string, finish func(string) error, err *error) {
	if p := recover(); p != nil {
		r.traceback = fmt.Sprintf("%v\n%s", p, debug.Stack())
		r.d.Log.Error(what+" panicked", r.logKey, r.id, "panic", p)
		_ = finish("error")
		*err = fmt.Errorf("panic: %v", p)
	}
}

// startable is BaseTask.run's first look at the task: one whose cancel
// flag is set is canceled, and only an active one runs.
func (r *baseRun) startable(what string, status *string, cancelFlag bool) error {
	if cancelFlag && *status != "canceled" {
		// Canceled before it ran: finished as the old save() did, with its
		// template's status and the notification a cancel sends.
		var ujt *int64
		err := r.d.DB.Pool.QueryRow(r.ctx, `UPDATE main_unifiedjob SET status = 'canceled', failed = true, finished = COALESCE(finished, now()),
			canceled_on = COALESCE(canceled_on, now()), start_args = '', modified = now() WHERE id = $1 RETURNING unified_job_template_id`, r.id).Scan(&ujt)
		if err == nil {
			if ujt != nil {
				_ = r.d.templateFinished(r.ctx, r.d.DB.Pool, *ujt, "canceled", r.id, true, time.Now())
			}
			r.d.notify(r.id, "canceled")
		}
		*status = "canceled"
	}
	if !models.ActiveStatuses[*status] {
		return fmt.Errorf("not starting %s %s %d", *status, what, r.id)
	}
	return nil
}

// executionEnvironment loads the run's execution environment, resolving
// and recording one first when the run has none.
func (r *baseRun) executionEnvironment(eeID **int64, resolve func() *int64) {
	if *eeID == nil {
		if id := resolve(); id != nil {
			*eeID = id
			_, _ = r.d.DB.Pool.Exec(r.ctx, `UPDATE main_unifiedjob SET execution_environment_id = $2 WHERE id = $1`, r.id, *id)
		}
	}
	if *eeID != nil {
		r.ee, _ = models.GetExecutionEnvironment(r.ctx, r.d.DB.Pool, **eeID)
	}
}

// jobInstanceGroup picks the instance group a job runs in: the first
// preferred group recorded at launch, else the control plane queue.
func (d *Dispatcher) jobInstanceGroup(ctx context.Context, id int64) *int64 {
	var chosen *int64
	if err := d.DB.Pool.QueryRow(ctx, `SELECT instance_group_id FROM main_unifiedjob WHERE id = $1`, id).Scan(&chosen); err == nil && chosen != nil {
		return chosen
	}
	var raw []byte
	if err := d.DB.Pool.QueryRow(ctx, `SELECT preferred_instance_groups_cache FROM main_unifiedjob WHERE id = $1`, id).Scan(&raw); err == nil && len(raw) > 0 {
		var ids []int64
		if json.Unmarshal(raw, &ids) == nil && len(ids) > 0 {
			return &ids[0]
		}
	}
	_, name := d.queueNames(ctx)
	var igID int64
	if err := d.DB.Pool.QueryRow(ctx, `SELECT id FROM main_instancegroup WHERE name = $1`, name).Scan(&igID); err == nil {
		return &igID
	}
	return nil
}

// placeOnGroup notes a container group the run is in and returns its
// execution node: none for a pod (its mesh node for one behind a mesh
// node), the execution node the task manager chose over the mesh, or this
// node.
func (r *baseRun) placeOnGroup(igID *int64) (string, error) {
	cg, err := r.d.containerGroupFor(r.ctx, igID)
	if err != nil {
		return "", err
	}
	r.cg = cg
	if cg != nil {
		// A pod behind a mesh node executes there.
		return cg.MeshNode, nil
	}
	if r.remote = r.d.remoteExecutionNode(r.ctx, r.id); r.remote != "" {
		return r.remote, nil
	}
	return r.d.Cfg.ClusterHostID, nil
}

// runSteps are a run type's parts of BaseTask.run (runTask).
type runSteps struct {
	// what names the run in log lines ("job", "inventory update").
	what string
	// group is the instance group the run is recorded in.
	group *int64
	// template is the unified job template marked running, if any.
	template *int64
	// dependencies is the task manager's dependency step; nil for none.
	dependencies func(context.Context) (string, error)
	// place returns the execution node; nil runs on this node.
	place func(igID *int64) (string, error)
	// clearStartArgs blanks start_args as the run starts (a project
	// update); the others keep them for a re-queued run until they finish.
	clearStartArgs bool
	execute        func(context.Context) (string, error)
	finish         func(string) error
	// tracebackFor says whether an error the run ended with is also its
	// traceback, given the status and the explanation the error's kind
	// gave ("" for none).
	tracebackFor func(status, msg string) bool
}

// runTask is BaseTask.run from the dependencies on: the task is marked
// running on its node, its runner runs, and it is finished unless it was
// left for another task (detached, re-queued or taken over).
func (r *baseRun) runTask(jobCtx context.Context, s runSteps) error {
	d, ctx, id := r.d, r.ctx, r.id
	if s.dependencies != nil {
		if st, derr := s.dependencies(jobCtx); derr != nil || st != "" {
			if derr != nil {
				d.Log.Error(s.what+" dependencies", r.logKey, id, "err", derr)
				r.traceback = derr.Error()
			}
			if st == "" {
				st = "error"
			}
			return s.finish(st)
		}
	}
	r.started = time.Now()
	execNode := d.Cfg.ClusterHostID
	if s.place != nil {
		node, err := s.place(s.group)
		if err != nil {
			r.explain(err.Error())
			return s.finish("error")
		}
		execNode = node
	}
	// The group chosen when the task was claimed stands.
	if _, err := d.DB.Pool.Exec(ctx, `UPDATE main_unifiedjob SET status = 'running', started = $2, execution_node = $5, controller_node = $3, instance_group_id = COALESCE(instance_group_id, $4),
		start_args = CASE WHEN $6 THEN '' ELSE start_args END, modified = now() WHERE id = $1`,
		id, r.started, d.Cfg.ClusterHostID, s.group, execNode, s.clearStartArgs); err != nil {
		return err
	}
	if s.template != nil {
		d.templateRunning(ctx, d.DB.Pool, *s.template, id)
	}
	d.notify(id, "running")
	d.discardEventsBeforeRun(ctx, id)
	status, runErr := s.execute(jobCtx)
	if r.hold.abandoned() {
		r.hold.endWithoutFinalizing(ctx)
		return nil
	}
	if runErr != nil {
		// BaseTask.run's except clauses: an explanation for the errors it
		// knew, else the traceback.
		msg := runErrorExplanation(runErr)
		if msg != "" && r.explanation == "" {
			r.explain(msg)
		}
		d.Log.Error(s.what+" run", r.logKey, id, "err", runErr)
		if r.traceback == "" && s.tracebackFor(status, msg) {
			r.traceback = runErr.Error()
		}
	}
	return s.finish(status)
}

// --- private data directory ------------------------------------------------------

// isolationBase is ASCENDER_ISOLATION_BASE_PATH, the directory private
// data directories are made in.
func (d *Dispatcher) isolationBase(ctx context.Context) string {
	if base := d.Settings.String(ctx, "ASCENDER_ISOLATION_BASE_PATH"); base != "" {
		return base
	}
	return os.TempDir()
}

// makePDD makes a private data directory for unified job id
// (build_private_data_dir).
func (d *Dispatcher) makePDD(ctx context.Context, id int64) (string, error) {
	base := d.isolationBase(ctx)
	if _, err := os.Stat(base); err != nil {
		return "", fmt.Errorf("ASCENDER_ISOLATION_BASE_PATH=%s does not exist", base)
	}
	pdd, err := os.MkdirTemp(base, fmt.Sprintf("ascender_%d_", id))
	if err != nil {
		return "", err
	}
	_ = os.Chmod(pdd, 0o700)
	return pdd, nil
}

// cleanupPDD removes a private data directory when ASCENDER_CLEANUP_PATHS
// says so.
func (d *Dispatcher) cleanupPDD(ctx context.Context, pdd string) {
	if pdd != "" && d.Settings.Bool(ctx, "ASCENDER_CLEANUP_PATHS") {
		_ = os.RemoveAll(pdd)
	}
}

// preparePDD makes the run's private data directory with the given
// subdirectories and its artifact directory. The returned cleanup, which
// the run defers, removes it when ASCENDER_CLEANUP_PATHS says so.
func (r *baseRun) preparePDD(subdirs ...string) (cleanup func(), err error) {
	pdd, err := r.d.makePDD(r.ctx, r.id)
	if err != nil {
		return nil, err
	}
	r.pdd = pdd
	cleanup = func() { r.d.cleanupPDD(r.ctx, pdd) }
	for _, dir := range append(subdirs, filepath.Join("artifacts", fmt.Sprint(r.id))) {
		if err := os.MkdirAll(filepath.Join(pdd, dir), 0o700); err != nil {
			cleanup()
			return nil, err
		}
	}
	return cleanup, nil
}

// --- environment and container -------------------------------------------------

// baseEnv is BaseTask.build_env: the ansible defaults, ASCENDER_TASK_ENV
// and the private data directory.
func (r *baseRun) baseEnv() map[string]string {
	d, ctx := r.d, r.ctx
	env := map[string]string{
		"ANSIBLE_FORCE_COLOR":               "True",
		"ANSIBLE_HOST_KEY_CHECKING":         "False",
		"ANSIBLE_INVENTORY_UNPARSED_FAILED": "True",
		"ANSIBLE_PARAMIKO_RECORD_HOST_KEYS": "False",
		"ANSIBLE_FACT_CACHE_TIMEOUT":        fmt.Sprint(d.Settings.Int(ctx, "ANSIBLE_FACT_CACHE_TIMEOUT")),
	}
	if taskEnv, ok := d.Settings.Get(ctx, "ASCENDER_TASK_ENV"); ok {
		if m, ok := taskEnv.(map[string]any); ok {
			for k, v := range m {
				env[k] = pyStr(v)
			}
		}
	}
	env["AWX_PRIVATE_DATA_DIR"] = r.pdd
	return env
}

// runnerSettings are the runner settings (env/settings, a worker's
// settings): the timeout, and DEFAULT_JOB_IDLE_TIMEOUT when set.
func (r *baseRun) runnerSettings(timeout int64) map[string]any {
	s := map[string]any{"job_timeout": timeout, "suppress_ansible_output": true, "suppress_output_file": true}
	if idle := r.d.Settings.Int(r.ctx, "DEFAULT_JOB_IDLE_TIMEOUT"); idle > 0 {
		s["idle_timeout"] = idle
	}
	return s
}

// writeRunnerSettings writes env/settings.
func (r *baseRun) writeRunnerSettings(settings map[string]any) {
	b, _ := json.Marshal(settings)
	_ = os.WriteFile(filepath.Join(r.pdd, "env", "settings"), b, 0o600)
}

// containerOptions are where the run types' execution environment
// parameters differ.
type containerOptions struct {
	// factCache points ansible's jsonfile fact cache into the artifacts.
	factCache bool
	// optionalCallback: the callback plugin is installed when it can be,
	// and its variables are set only then, as for an inventory update,
	// which ansible-inventory runs without it.
	optionalCallback bool
	// mounts are volumes beyond ASCENDER_ISOLATION_SHOW_PATHS.
	mounts []string
}

// containerRun is the runner configuration prepareContainer built, and
// the environment a worker is given.
type containerRun struct {
	cfg *runnerConfig
	// cleanup removes what the run needed only while it ran (the registry
	// login); the caller defers it.
	cleanup func()
	// workerEnv is build_env's environment, before the variables runner
	// adds itself: what a worker in a pod or on an execution node gets.
	workerEnv map[string]string
}

// prepareContainer is build_execution_environment_params plus runner's
// own additions to the environment (prepare_env): the run options, the
// image pull, the mounts, the callback plugin in the artifacts and the
// ANSIBLE_*/RUNNER_* variables. env gets runner's variables, and safeEnv
// every variable of env it lacks. Without a containerRun the run ends with
// the status (and the error); "" is a run re-queued by a shutdown.
func (r *baseRun) prepareContainer(jobCtx context.Context, env, safeEnv map[string]string, timeout int64, o containerOptions) (*containerRun, string, error) {
	d, ctx := r.d, r.ctx
	rt := d.containerRuntime()
	opts := []string{"--user=root"}
	for _, opt := range d.Settings.List(ctx, "DEFAULT_CONTAINER_RUN_OPTIONS") {
		opts = append(opts, fmt.Sprint(opt))
	}
	opts = filterRuntimeOptions(rt, opts)
	// The execution environment's registry login, for a local pull: a
	// file beside the private data directory, never inside it (that is
	// the job's to read), passed to podman as --authfile and to docker as
	// --config, and removed when the run ends.
	cleanup := func() {}
	var pullArgs, dockerArgs []string
	if !r.worker() && r.ee.CredentialID != nil {
		authCfg, err := d.registryAuthConfig(ctx, r.ee)
		if err != nil {
			r.explain("Failed to read the execution environment's registry credential: " + err.Error())
			return nil, "error", err
		}
		dir, err := os.MkdirTemp(filepath.Dir(filepath.Clean(r.pdd)), ".registry-")
		if err != nil {
			return nil, "error", err
		}
		cleanup = func() { _ = os.RemoveAll(dir) }
		name := "auth.json"
		if strings.Contains(rt, "docker") {
			name = "config.json"
		}
		if err := os.WriteFile(filepath.Join(dir, name), authCfg, 0o600); err != nil {
			cleanup()
			return nil, "error", err
		}
		if strings.Contains(rt, "docker") {
			dockerArgs = []string{"--config", dir}
		} else {
			pullArgs = []string{"--authfile=" + filepath.Join(dir, name)}
			opts = append(opts, pullArgs...)
		}
	}
	if r.worker() {
		// A pod pulls its own image, by the pod's imagePullPolicy, and
		// the worker on an execution node by --pull.
	} else if strings.Contains(rt, "docker") {
		// docker prints pull progress on the job's terminal, so the pull
		// happens before the run instead of through --pull.
		if err := dockerPull(jobCtx, rt, r.ee.Image, r.ee.Pull, dockerArgs...); err != nil {
			cleanup()
			if jobCtx.Err() != nil {
				return nil, r.preRunInterrupted(), nil
			}
			r.explain("Failed to pull the execution environment image: " + err.Error())
			return nil, "error", err
		}
	} else if r.ee.Pull != "" {
		opts = append(opts, "--pull="+r.ee.Pull)
	}
	var mounts []string
	for _, p := range d.Settings.List(ctx, "ASCENDER_ISOLATION_SHOW_PATHS") {
		mounts = append(mounts, showPathMount(fmt.Sprint(p)))
	}
	mounts = append(mounts, o.mounts...)
	ident := fmt.Sprint(r.id)
	workerEnv := make(map[string]string, len(env))
	for k, v := range env {
		workerEnv[k] = v
	}
	callback := !r.worker() || !o.optionalCallback
	if !r.worker() {
		// The worker in a pod or on an execution node brings its own callback.
		cacheRoot := d.Cfg.JobOutputRoot
		if cacheRoot == "" {
			cacheRoot = d.isolationBase(ctx)
		}
		pluginDir, err := callbackPlugin(jobCtx, rt, r.ee.Image, cacheRoot, pullArgs...)
		if jobCtx.Err() != nil {
			cleanup()
			return nil, r.preRunInterrupted(), nil
		}
		if err == nil {
			err = copyTree(pluginDir, filepath.Join(r.artifactDir(), "callback"), nil)
		}
		if err != nil && !o.optionalCallback {
			cleanup()
			return nil, "error", err
		}
		callback = err == nil
	}
	addRunnerEnv(env, rt, ident, o.factCache, callback)
	for k, v := range env {
		if _, ok := safeEnv[k]; !ok {
			safeEnv[k] = v
		}
	}
	cfg := &runnerConfig{PrivateDataDir: r.pdd, Ident: ident, Runtime: rt, Image: r.ee.Image, ContainerOptions: opts, VolumeMounts: mounts, Env: env,
		JobTimeout: time.Duration(timeout) * time.Second}
	if idle := d.Settings.Int(ctx, "DEFAULT_JOB_IDLE_TIMEOUT"); idle > 0 {
		cfg.IdleTimeout = time.Duration(idle) * time.Second
	}
	return &containerRun{cfg: cfg, workerEnv: workerEnv, cleanup: cleanup}, "", nil
}

// addRunnerEnv adds the variables ansible-runner set itself for a
// containerized run (prepare_env): the artifacts directory, the fact cache
// when asked for, the awx_display callback when it is installed, and the
// event settings.
func addRunnerEnv(env map[string]string, rt, ident string, factCache, callback bool) {
	if strings.Contains(rt, "podman") {
		env["ANSIBLE_UNSAFE_WRITES"] = "1"
	}
	env["AWX_ISOLATED_DATA_DIR"] = "/runner/artifacts/" + ident
	if factCache {
		env["ANSIBLE_CACHE_PLUGIN_CONNECTION"] = "/runner/artifacts/" + ident + "/fact_cache"
		env["ANSIBLE_CACHE_PLUGIN"] = "jsonfile"
	}
	if callback {
		cbPath := "/runner/artifacts/" + ident + "/callback"
		if existing := env["ANSIBLE_CALLBACK_PLUGINS"]; existing != "" {
			cbPath = existing + ":" + cbPath
		}
		env["ANSIBLE_CALLBACK_PLUGINS"] = cbPath
		env["ANSIBLE_STDOUT_CALLBACK"] = "awx_display"
	}
	env["ANSIBLE_RETRY_FILES_ENABLED"] = "False"
	if _, ok := env["ANSIBLE_HOST_KEY_CHECKING"]; !ok {
		env["ANSIBLE_HOST_KEY_CHECKING"] = "False"
	}
	env["RUNNER_OMIT_EVENTS"] = "False"
	env["RUNNER_ONLY_FAILED_EVENTS"] = "False"
}

// recordStart is status_handler('starting'): the command and the
// environment, secrets hidden, stored on the unified job.
func (r *baseRun) recordStart(cfg *runnerConfig, safeEnv map[string]string) error {
	jobEnv, _ := json.Marshal(safeEnv)
	_, err := r.d.DB.Pool.Exec(r.ctx, `UPDATE main_unifiedjob SET job_args = $2, job_cwd = '/runner/project', job_env = $3::jsonb, modified = now() WHERE id = $1`,
		r.id, pyJSONList(cfg.command()), string(jobEnv))
	return err
}

// runWorker runs the run as an ansible-runner worker on its execution node
// or in a pod of its container group.
func (r *baseRun) runWorker(jobCtx context.Context, kw map[string]any, sshKey string, handler func(runnerEvent)) (podResult, error) {
	if r.remote != "" {
		return r.d.runRemote(jobCtx, r.ctx, r.hold, r.remote, r.id, r.ee, r.pdd, kw, sshKey, handler, r.log)
	}
	return r.d.runPod(jobCtx, r.ctx, r.hold, r.cg, r.id, r.ee, r.pdd, kw, sshKey, handler, r.log)
}

// shutdownRequeue is _handle_signal for a local runner a shutdown stopped:
// a run that can be repeated is re-queued (reason says why) and the run
// ends without finalizing.
func (r *baseRun) shutdownRequeue(runnerStatus, reason string) bool {
	h := r.hold
	if runnerStatus != "canceled" || h == nil || !h.canRequeue || h.inlineSync || !r.d.stopping() || r.d.cancelRequested(r.ctx, r.id) {
		return false
	}
	if reason == "" {
		reason = h.requeueReason()
	}
	h.outcome, h.reason = readRequeue, reason
	return true
}

// --- the end of a run ------------------------------------------------------------

// runnerOutcome is BaseTask.run's reading of how the runner ended: a
// timeout fails the task, an error is explained, and a cancel without the
// cancel flag set was a shutdown, which fails it.
func runnerOutcome(status string, cancelRequested func() bool) (string, string) {
	switch status {
	case "timeout":
		return "failed", "Job terminated due to timeout"
	case "error":
		return "error", "Job terminated due to error"
	case "canceled":
		if !cancelRequested() {
			return "failed", shutdownExplanation
		}
	}
	return status, ""
}

// mapRunnerStatus is runnerOutcome for this run, explaining the status.
func (r *baseRun) mapRunnerStatus(status string) string {
	status, msg := runnerOutcome(status, func() bool { return r.d.cancelRequested(r.ctx, r.id) })
	r.explain(msg)
	return status
}

// recordAnsibleVersion stores the ansible version the execution
// environment reported.
func (r *baseRun) recordAnsibleVersion() {
	if b, err := readJobFile(r.pdd, filepath.Join(r.artifactDir(), "ansible_version.txt"), 4096); err == nil {
		_, _ = r.d.DB.Pool.Exec(r.ctx, `UPDATE main_unifiedjob SET ansible_version = $2 WHERE id = $1`, r.id, strings.SplitN(string(b), "\n", 2)[0])
	}
}

// failedStatus is UnifiedJob.failed for a finished status.
func failedStatus(status string) bool {
	return status == "failed" || status == "error" || status == "canceled"
}

// finishUnified writes the final status (finished at finished) on the
// unified job and its template, which takes templateStatus, and what the
// run type adds (also) in the same transaction; then the run's
// finalize_run and notifications. The write is fenced by the task id: a
// job another task took over is that task's to finish.
func (r *baseRun) finishUnified(status string, finished time.Time, template *int64, templateStatus string, also func(pgx.Tx) error) error {
	d, ctx, id := r.d, r.ctx, r.id
	failed := failedStatus(status)
	var canceledOn *time.Time
	if status == "canceled" {
		canceledOn = &finished
	}
	owned := true
	err := d.DB.Tx(ctx, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `UPDATE main_unifiedjob SET status = $2, failed = $3, finished = $4, elapsed = $5,
			job_explanation = CASE WHEN $6 = '' THEN job_explanation ELSE $6 END, result_traceback = CASE WHEN $7 = '' THEN result_traceback ELSE $7 END, canceled_on = $8, start_args = '', modified = now()
			WHERE id = $1 AND ($9 = '' OR celery_task_id = $9)`,
			id, status, failed, finished, finished.Sub(r.started).Seconds(), r.explanation, r.traceback, canceledOn, r.owner())
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			owned = false
			d.Log.Warn(fmt.Sprintf("unified job %d is owned by another task now; this task does not write status %s", id, status))
			return nil
		}
		d.leaseFinish(ctx, tx, id)
		if template != nil {
			if err := d.templateFinished(ctx, tx, *template, templateStatus, id, failed, finished); err != nil {
				return err
			}
		}
		if also != nil {
			return also(tx)
		}
		return nil
	})
	if err == nil && owned {
		// final_run_hook
		d.lifecycle(ctx, id, "finalize_run")
		d.notify(id, status)
	}
	return err
}

// notRunSync is ProjectUpdate._update_parent_instance's exception, as a
// condition on the template row t for job $2: a run update (the sync of a
// job's own checkout) leaves its project alone, unless it is the project's
// first update (the project was never updated when it started, and so took
// it as its current job).
const notRunSync = `NOT EXISTS (SELECT 1 FROM main_projectupdate pu WHERE pu.unifiedjob_ptr_id = $2 AND pu.job_type = 'run')`

// templateRunning is _update_parent_instance for a job that started: the
// template shows it as its current job.
func (d *Dispatcher) templateRunning(ctx context.Context, q db.Querier, template, jobID int64) {
	_, _ = q.Exec(ctx, `UPDATE main_unifiedjobtemplate t SET status = 'running', current_job_id = $2, modified = now() WHERE t.id = $1
		AND (`+notRunSync+` OR t.status = 'never updated' OR t.current_job_id = $2)`, template, jobID)
}

// templateFinished is _update_parent_instance for a job that finished:
// the template takes status and the job as its last.
func (d *Dispatcher) templateFinished(ctx context.Context, q db.Querier, template int64, status string, jobID int64, failed bool, finished time.Time) error {
	_, err := q.Exec(ctx, `UPDATE main_unifiedjobtemplate t SET status = $3, last_job_id = $2, last_job_failed = $4, last_job_run = $5,
		current_job_id = CASE WHEN t.current_job_id = $2 THEN NULL ELSE t.current_job_id END, modified = now() WHERE t.id = $1
		AND (`+notRunSync+` OR t.current_job_id = $2)`, template, jobID, status, failed, finished)
	return err
}

// templateJobStatus is the status a job template or a workflow template
// takes from its last job: successful or failed.
func templateJobStatus(failed bool) string {
	if failed {
		return "failed"
	}
	return "successful"
}

// --- dependencies ---------------------------------------------------------------

// projectUpdateDependency is get_or_create_project_update for this run:
// the latest check update of the project is reused unless
// should_update_again says otherwise (one under way is waited for), and
// either way it is linked as a dependency (dependent_jobs). It returns the
// update the run depends on and, when that update did not succeed, the
// run's status, with the explanation given.
// claimPendingDependency takes a dependency no worker has started for this
// node, as the dispatcher's claim would (only while it is still pending:
// of the two, one wins). The run waiting on it runs it in its own worker:
// with every worker held by runs waiting on pending dependencies, nothing
// would ever start them.
func (d *Dispatcher) claimPendingDependency(ctx context.Context, id int64) bool {
	tag, err := d.DB.Pool.Exec(ctx, `UPDATE main_unifiedjob SET status = 'waiting', execution_node = $2, controller_node = $2, job_explanation = '', modified = now()
		WHERE id = $1 AND status = 'pending'`, id, d.Cfg.ClusterHostID)
	return err == nil && tag.RowsAffected() == 1
}

// claimPlacedDependency takes a pending dependency of run parentID that no
// worker has started and places it as the dispatcher's claim would
// (placeTask: its preferred instance groups and their capacity), so that
// the run waiting on it can run it in its own worker. When it does not fit
// and the run itself is placed in one of the dependency's preferred
// groups, the dependency takes the run's place: the run holds that
// capacity but uses none of it until its dependencies are done (the old
// task manager placed a job only after them). Otherwise the dependency goes
// back to pending, for the run to try again or a worker to claim.
func (d *Dispatcher) claimPlacedDependency(ctx context.Context, depID, ctype, parentID int64) bool {
	claimed := false
	d.advisoryLocked(ctx, taskManagerLockID, "dependency claim", true, func() {
		tag, err := d.DB.Pool.Exec(ctx, `UPDATE main_unifiedjob SET status = 'waiting', modified = now() WHERE id = $1 AND status = 'pending'`, depID)
		if err != nil || tag.RowsAffected() == 0 {
			return
		}
		d.acknowledge(ctx, depID)
		ok, err := d.placeTask(ctx, depID, ctype)
		if err != nil {
			// As the dispatcher's claim: run it anyway.
			d.Log.ErrorContext(ctx, "instance group choice", "id", depID, "err", err)
			ok = true
		}
		if !ok {
			tag, err := d.DB.Pool.Exec(ctx, `UPDATE main_unifiedjob dep SET instance_group_id = p.instance_group_id, execution_node = p.execution_node, controller_node = $3, celery_task_id = $4
				FROM main_unifiedjob p WHERE dep.id = $1 AND p.id = $2 AND p.instance_group_id IS NOT NULL
				AND COALESCE(dep.preferred_instance_groups_cache, '[]'::jsonb) @> jsonb_build_array(p.instance_group_id)`, depID, parentID, d.Cfg.ClusterHostID, newUUID())
			ok = err == nil && tag.RowsAffected() == 1
		}
		if !ok {
			d.lifecycle(ctx, depID, "needs_capacity")
			if _, err := d.DB.Pool.Exec(ctx, `UPDATE main_unifiedjob SET status = 'pending', modified = now() WHERE id = $1 AND status = 'waiting'`, depID); err != nil {
				d.Log.ErrorContext(ctx, "returning a task to pending", "id", depID, "err", err)
			}
			return
		}
		d.clearPendingExplanation(ctx, depID)
		claimed = true
	})
	return claimed
}

func (r *baseRun) projectUpdateDependency(jobCtx context.Context, project *models.Project) (int64, string, error) {
	d, ctx := r.d, r.ctx
	var latestID int64
	var latestStatus string
	var finished *time.Time
	err := d.DB.Pool.QueryRow(ctx, `SELECT uj.id, uj.status, uj.finished FROM main_unifiedjob uj JOIN main_projectupdate p ON p.unifiedjob_ptr_id = uj.id
		WHERE p.project_id = $1 AND p.job_type = 'check' ORDER BY uj.created DESC LIMIT 1`, project.ID).Scan(&latestID, &latestStatus, &finished)
	needUpdate := false
	switch {
	case err != nil:
		needUpdate = true
	case latestStatus == "failed" || latestStatus == "canceled" || latestStatus == "error":
		needUpdate = true
	case latestStatus == "waiting" || latestStatus == "pending" || latestStatus == "running":
		// An update already under way is the dependency; wait for it.
		r.log("waiting for the running project update", "project_update", latestID)
		for st := latestStatus; ; {
			// Still pending, it has no worker yet, and every worker may be
			// a run waiting like this one: take it and run it here.
			if st == "pending" && d.claimPendingDependency(ctx, latestID) {
				r.log("running the pending project update the run depends on", "project_update", latestID)
				if err := d.runInline(jobCtx, latestID, func(c context.Context) error { return d.runProjectUpdate(c, ctx, latestID) }); err != nil {
					d.Log.Error("dependency project update", "project_update", latestID, "err", err)
				}
			} else {
				select {
				case <-jobCtx.Done():
					return latestID, "canceled", nil
				case <-time.After(2 * time.Second):
				}
			}
			if d.DB.Pool.QueryRow(ctx, `SELECT status FROM main_unifiedjob WHERE id = $1`, latestID).Scan(&st) != nil || !models.ActiveStatuses[st] {
				latestStatus = st
				break
			}
		}
		if latestStatus != "successful" {
			needUpdate = true
		}
	default:
		needUpdate = finished == nil || finished.Add(time.Duration(project.SCMUpdateCacheTimeout)*time.Second).Before(time.Now())
	}
	if !needUpdate {
		_, _ = d.DB.Pool.Exec(ctx, `INSERT INTO main_unifiedjob_dependent_jobs (from_unifiedjob_id, to_unifiedjob_id) VALUES ($1, $2)`, r.id, latestID)
		return latestID, "", nil
	}
	pu := models.NewProjectUpdate(project, "dependency", nil, "check")
	if err := d.DB.Tx(ctx, func(tx pgx.Tx) error {
		if err := models.InsertProjectUpdate(ctx, tx, pu, d.CT); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO main_unifiedjob_dependent_jobs (from_unifiedjob_id, to_unifiedjob_id) VALUES ($1, $2)`, r.id, pu.ID); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `UPDATE main_unifiedjob SET status = 'waiting', execution_node = $2, controller_node = $2 WHERE id = $1`, pu.ID, d.Cfg.ClusterHostID)
		return err
	}); err != nil {
		return 0, "error", err
	}
	r.log("running the project update the run depends on", "project_update", pu.ID)
	if err := d.runInline(jobCtx, pu.ID, func(c context.Context) error { return d.runProjectUpdate(c, ctx, pu.ID) }); err != nil {
		d.Log.Error("dependency project update", "project_update", pu.ID, "err", err)
	}
	done, err := models.GetProjectUpdate(ctx, d.DB.Pool, pu.ID)
	if err != nil {
		return pu.ID, "error", err
	}
	switch done.Status {
	case "successful":
		return pu.ID, "", nil
	case "canceled":
		return pu.ID, "canceled", nil
	}
	r.explain(fmt.Sprintf(`Previous Task Failed: {"job_type": "project_update", "job_name": "%s", "job_id": "%d"}`, done.Name, done.ID))
	return pu.ID, "failed", nil
}
