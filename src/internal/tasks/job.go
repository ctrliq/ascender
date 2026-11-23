package tasks

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/ctrliq/ascender/internal/api"
	"github.com/ctrliq/ascender/internal/crypto"
	"github.com/ctrliq/ascender/internal/models"
	"github.com/ctrliq/ascender/internal/pyyaml"
	"github.com/jackc/pgx/v5"
	"gopkg.in/yaml.v3"
)

// This file is the port of RunJob (main/tasks/jobs.py): it prepares the
// private data directory a job runs from, builds the environment and
// command line, runs the playbook in the execution environment and
// records the outcome the way the old task did.

// jobVariablePrefixes are JOB_VARIABLE_PREFIXES, the names the meta vars
// are published under.
var jobVariablePrefixes = []string{"ascender", "awx", "tower"}

// privilegeEscalationMethods are the become methods whose prompts are
// answered (PRIVILEGE_ESCALATION_METHODS).
var privilegeEscalationMethods = []string{"sudo", "su", "pbrun", "pfexec", "dzdo", "pmrun", "runas", "enable", "doas", "ksu", "machinectl", "sesu"}

var jinjaRe = regexp.MustCompile(`\{\{[^}]+}}|\{%[^%]+%}`)

// sanitizeJinja refuses inline template markers in a credential field.
func sanitizeJinja(s string) (string, error) {
	if jinjaRe.MatchString(s) {
		return "", fmt.Errorf("Inline Jinja variables are not allowed.")
	}
	return s, nil
}

// jobRun is the state of one job execution.
type jobRun struct {
	baseRun
	job *models.Job

	template *models.JobTemplate
	project  *models.Project
	// adHoc is set when the run is an ad hoc command (RunAdHocCommand):
	// the job fields above carry its options, and the run takes its own
	// command line, environment, events table and bookkeeping.
	adHoc     *models.AdHocCommand
	inventory *models.Inventory
	creds     []*credentialData
	hostMap   map[string]int64
	factHosts []*models.Host

	// workload is workload_identity_for: the job a credential resolved
	// while the run is prepared gets a token for.
	workload *api.WorkloadScope
	// finishedAt is when a resumed job really ended.
	finishedAt *time.Time
}

// runJob executes one job. jobCtx is cancelled when the job is cancelled;
// bg is the process context for bookkeeping afterwards.
func (d *Dispatcher) runJob(jobCtx, bg context.Context, id int64) (err error) {
	job, err := models.GetJob(bg, d.DB.Pool, id)
	if err != nil {
		return err
	}
	r := &jobRun{baseRun: d.newBaseRun(bg, id, "job", "main.job"), job: job}
	defer r.recoverPanic("job", r.finish, &err)
	if err := r.startable("job", &job.Status, job.CancelFlag); err != nil {
		return err
	}
	if job.JobTemplateID != nil {
		r.template, _ = models.GetJobTemplate(bg, d.DB.Pool, *job.JobTemplateID)
	}
	if job.ProjectID != nil {
		r.project, _ = models.GetProject(bg, d.DB.Pool, *job.ProjectID)
	}
	if job.InventoryID != nil {
		r.inventory, _ = models.GetInventory(bg, d.DB.Pool, *job.InventoryID)
	}
	r.executionEnvironment(&job.ExecutionEnvironmentID, r.resolveExecutionEnvironment)
	var template *int64
	if r.template != nil {
		template = &r.template.ID
	}
	return r.runTask(jobCtx, r.steps("job", template))
}

// steps are the job's parts of runTask; an ad hoc command's too.
func (r *jobRun) steps(what string, template *int64) runSteps {
	return runSteps{what: what, group: r.d.jobInstanceGroup(r.ctx, r.id), template: template,
		dependencies: r.runDependencies, place: r.placeOnGroup, execute: r.execute, finish: r.finish,
		tracebackFor: func(status, _ string) bool { return r.explanation == "" && status != "canceled" }}
}

// workflowJobID is the workflow job a job was spawned by, if any.
func workflowJobID(ctx context.Context, d *Dispatcher, jobID int64) *int64 {
	m, err := models.WorkflowJobIDForJob(ctx, d.DB.Pool, []int64{jobID})
	if err != nil {
		return nil
	}
	if id, ok := m[jobID]; ok {
		return &id
	}
	return nil
}

// runDependencies is the task manager's dependency step for a job: a
// project that updates on launch gets a fresh check update first (unless
// a recent one exists), and a failed dependency fails the job.
func (r *jobRun) runDependencies(jobCtx context.Context) (status string, err error) {
	d, job := r.d, r.job
	ctx := r.ctx
	defer func() {
		_, _ = d.DB.Pool.Exec(ctx, `UPDATE main_unifiedjob SET dependencies_processed = true WHERE id = $1`, job.ID)
	}()
	if job.DependenciesProcessed {
		return "", nil
	}
	if st, err := r.runProjectDependency(jobCtx); err != nil || st != "" {
		return st, err
	}
	return r.runInventoryDependencies(jobCtx)
}

// runProjectDependency updates a project that updates on launch before the
// job runs.
func (r *jobRun) runProjectDependency(jobCtx context.Context) (string, error) {
	if r.project == nil || !r.project.SCMUpdateOnLaunch {
		return "", nil
	}
	if _, st, err := r.projectUpdateDependency(jobCtx, r.project); err != nil || st != "" {
		return st, err
	}
	r.project, _ = models.GetProject(r.ctx, r.d.DB.Pool, r.project.ID)
	return "", nil
}

// waitInventoryDependency waits for inventory update id, which the job
// depends on, to finish. While it is pending no worker has it, and every
// worker may be a run waiting like this one: the job's worker takes it,
// placed in its own instance groups, and runs it. false when the job is
// canceled meanwhile.
func (r *jobRun) waitInventoryDependency(jobCtx context.Context, id int64, st string) bool {
	d, ctx := r.d, r.ctx
	ctype := d.CT.ID("main.inventoryupdate")
	for {
		if st == "pending" && d.claimPlacedDependency(ctx, id, ctype, r.job.ID) {
			r.log("running the inventory update the job depends on", "inventory_update", id)
			if err := d.runInline(jobCtx, id, func(c context.Context) error { return d.runInventoryUpdate(c, ctx, id) }); err != nil {
				d.Log.Error("dependency inventory update", "inventory_update", id, "err", err)
			}
		} else {
			select {
			case <-jobCtx.Done():
				return false
			case <-time.After(2 * time.Second):
			}
		}
		if d.DB.Pool.QueryRow(ctx, `SELECT status FROM main_unifiedjob WHERE id = $1`, id).Scan(&st) != nil || !models.ActiveStatuses[st] {
			return true
		}
	}
}

// runInventoryDependencies is the inventory half of gen_dep_for_job: every
// source of the job's inventory that updates on launch is synced first
// unless its last update is recent enough (should_update_again), and a
// sync already under way is waited for, unless the inventory allows jobs
// while syncing and has synced successfully before.
func (r *jobRun) runInventoryDependencies(jobCtx context.Context) (string, error) {
	d, job := r.d, r.job
	ctx := r.ctx
	if r.inventory == nil {
		return "", nil
	}
	rows, err := d.DB.Pool.Query(ctx, `SELECT `+models.InventorySourceColumns+` FROM `+models.InventorySourceFrom+` WHERE src.inventory_id = $1 AND src.update_on_launch = true AND src.source <> '' ORDER BY ujt.id`, r.inventory.ID)
	if err != nil {
		return "error", err
	}
	var sources []*models.InventorySource
	for rows.Next() {
		src, err := models.ScanInventorySource(rows)
		if err != nil {
			rows.Close()
			return "error", err
		}
		sources = append(sources, src)
	}
	rows.Close()
	skip := r.sourcesAlreadyUpdated()
	for _, src := range sources {
		// The provisioning callback synced these before it launched.
		if skip[src.ID] {
			continue
		}
		var latestID int64
		var latestStatus string
		var finished *time.Time
		qerr := d.DB.Pool.QueryRow(ctx, `SELECT uj.id, uj.status, uj.finished FROM main_unifiedjob uj JOIN main_inventoryupdate iu ON iu.unifiedjob_ptr_id = uj.id
			WHERE iu.inventory_source_id = $1 ORDER BY uj.created DESC LIMIT 1`, src.ID).Scan(&latestID, &latestStatus, &finished)
		again := qerr != nil || latestStatus == "failed" || latestStatus == "canceled" || latestStatus == "error"
		if !again && !models.ActiveStatuses[latestStatus] {
			again = finished == nil || finished.Add(time.Duration(src.UpdateCacheTimeout)*time.Second).Before(time.Now())
		}
		depID := latestID
		switch {
		case again:
			// A new update of the source, pending with the source's
			// preferred instance groups, as InventorySource.update made
			// it: placed like any other task (claimPlacedDependency).
			if d.API == nil {
				return "error", fmt.Errorf("inventory update of source %d: no API server", src.ID)
			}
			iu, err := d.API.CreateInventoryUpdate(ctx, src, nil, "dependency", nil)
			if err != nil {
				return "error", err
			}
			if _, err := d.DB.Pool.Exec(ctx, `INSERT INTO main_unifiedjob_dependent_jobs (from_unifiedjob_id, to_unifiedjob_id) VALUES ($1, $2)`, job.ID, iu.ID); err != nil {
				return "error", err
			}
			r.log("waiting for the inventory update the job depends on", "inventory_update", iu.ID)
			depID, latestStatus = iu.ID, "pending"
		case models.ActiveStatuses[latestStatus]:
			var successes bool
			_ = d.DB.Pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM main_unifiedjob uj JOIN main_inventoryupdate iu ON iu.unifiedjob_ptr_id = uj.id WHERE iu.inventory_source_id = $1 AND uj.status = 'successful')`, src.ID).Scan(&successes)
			if r.inventory.AllowJobsWhileSyncing && successes {
				continue
			}
			_, _ = d.DB.Pool.Exec(ctx, `INSERT INTO main_unifiedjob_dependent_jobs (from_unifiedjob_id, to_unifiedjob_id) VALUES ($1, $2)`, job.ID, latestID)
		default:
			_, _ = d.DB.Pool.Exec(ctx, `INSERT INTO main_unifiedjob_dependent_jobs (from_unifiedjob_id, to_unifiedjob_id) VALUES ($1, $2)`, job.ID, latestID)
			continue
		}
		if !r.waitInventoryDependency(jobCtx, depID, latestStatus) {
			return "canceled", nil
		}
		var name, st string
		if err := d.DB.Pool.QueryRow(ctx, `SELECT name, status FROM main_unifiedjob WHERE id = $1`, depID).Scan(&name, &st); err != nil {
			return "error", err
		}
		if st == "canceled" && jobCtx.Err() != nil {
			return "canceled", nil
		}
		if st != "successful" {
			r.explain(fmt.Sprintf(`Previous Task Failed: {"job_type": "inventory_update", "job_name": "%s", "job_id": "%d"}`, name, depID))
			return "failed", nil
		}
	}
	return "", nil
}

// resolveExecutionEnvironment is resolve_execution_environment.
func (r *jobRun) resolveExecutionEnvironment() *int64 {
	if r.template != nil && r.template.ExecutionEnvironmentID != nil {
		return r.template.ExecutionEnvironmentID
	}
	if r.project != nil && r.project.DefaultEnvironmentID != nil {
		return r.project.DefaultEnvironmentID
	}
	orgIDs := []*int64{r.job.OrganizationID}
	if r.inventory != nil {
		orgIDs = append(orgIDs, r.inventory.OrganizationID)
	}
	for _, oid := range orgIDs {
		if oid == nil {
			continue
		}
		if o, err := models.GetOrganization(r.ctx, r.d.DB.Pool, *oid); err == nil && o.DefaultEnvironmentID != nil {
			return o.DefaultEnvironmentID
		}
	}
	if r.d.API != nil {
		return r.d.API.DefaultExecutionEnvironmentID(r.ctx)
	}
	if n := r.d.Settings.Int(r.ctx, "DEFAULT_EXECUTION_ENVIRONMENT"); n > 0 {
		return &n
	}
	return models.DefaultExecutionEnvironmentID(r.ctx, r.d.DB.Pool, nil)
}

// execute runs the job and returns its final status.
func (r *jobRun) execute(jobCtx context.Context) (string, error) {
	d, job := r.d, r.job
	ctx := r.ctx
	// pre_run_hook
	d.lifecycle(ctx, job.ID, "pre_run")
	switch {
	case r.inventory == nil:
		r.explain("Job could not start because it does not have a valid inventory.")
		return "failed", nil
	case r.project == nil && r.adHoc == nil:
		r.explain("Job could not start because it does not have a valid project.")
		return "failed", nil
	case r.ee == nil:
		r.explain("Job could not start because no Execution Environment could be found.")
		return "error", nil
	}
	eventTable := "main_jobevent"
	if r.adHoc != nil {
		eventTable = "main_adhoccommandevent"
	}
	if err := models.EnsureEventPartition(ctx, d.DB.Pool, eventTable, job.Created); err != nil {
		return "error", err
	}
	if r.adHoc == nil && r.inventory.Kind == "smart" {
		// RunJob.pre_run_hook cached the smart inventory's memberships.
		if _, err := updateSmartMemberships(ctx, d.DB, d.Log, r.inventory); err != nil {
			return "error", err
		}
	}
	cleanup, err := r.preparePDD("inventory", "env", "cp", "project", "artifacts")
	if err != nil {
		return "error", err
	}
	defer cleanup()

	// Project sync and copy (build_project_dir); an ad hoc command has none.
	if r.adHoc == nil {
		if canceled, err := r.syncAndCopyProject(jobCtx); err != nil {
			return "failed", err
		} else if canceled {
			return "canceled", nil
		}
	}
	if jobCtx.Err() != nil {
		return r.preRunInterrupted(), nil
	}
	d.lifecycle(ctx, job.ID, "preparing_playbook")

	// Hosts, inventory script and host map.
	hosts, err := r.inventoryHosts(false)
	if err != nil {
		return "error", err
	}
	if err := r.writeInventory(hosts); err != nil {
		return "error", err
	}
	if job.UseFactCache {
		r.factHosts, err = r.factCacheHosts()
		if err != nil {
			return "error", err
		}
		timeout := time.Duration(d.Settings.Int(ctx, "ANSIBLE_FACT_CACHE_TIMEOUT")) * time.Second
		d.lifecycle(ctx, job.ID, "start_job_fact_cache")
		if err := startFactCache(d.Log, r.factHosts, r.artifactDir(), timeout, *job.InventoryID); err != nil {
			return "error", err
		}
	}

	// A lookup in a slow secret store ends with a cancel or a shutdown.
	lookupCtx, stopLookup := cancelableBy(r.lookupContext(ctx), jobCtx)
	if r.adHoc != nil {
		var ids []int64
		if r.adHoc.CredentialID != nil {
			ids = append(ids, *r.adHoc.CredentialID)
		}
		r.creds, err = d.loadCredentials(lookupCtx, ids)
	} else {
		r.creds, err = d.loadJobCredentials(lookupCtx, job.ID)
	}
	stopLookup()
	if jobCtx.Err() != nil {
		return r.preRunInterrupted(), nil
	}
	if err != nil {
		return "error", err
	}
	sshKeyData, certs, credFiles, err := r.privateDataFiles()
	if err != nil {
		return "error", err
	}
	_ = certs
	passwords, err := r.buildPasswords()
	if err != nil {
		return "error", err
	}
	if err := r.writeExtraVars(); err != nil {
		return "error", err
	}
	var args []string
	if r.adHoc != nil {
		args, err = r.buildAdHocArgs(passwords)
	} else {
		args, err = r.buildArgs(passwords)
	}
	if err != nil {
		r.traceback = err.Error()
		return "error", err
	}
	env, err := r.buildEnv(credFiles)
	if err != nil {
		return "error", err
	}
	safeEnv := buildSafeEnv(env)
	for _, c := range r.creds {
		if err := r.injector().injectCredential(c, env, safeEnv, &args); err != nil {
			return "error", err
		}
	}
	_ = os.WriteFile(filepath.Join(r.pdd, "env", "cmdline"), []byte(args2cmdline(args...)), 0o600)

	prompts := r.passwordPrompts(passwords)
	runnerSettings := r.runnerSettings(r.timeoutSeconds())
	r.writeRunnerSettings(runnerSettings)

	// Execution environment parameters and runner's own environment.
	cr, st, err := r.prepareContainer(jobCtx, env, safeEnv, r.timeoutSeconds(), containerOptions{factCache: job.UseFactCache})
	if cr == nil {
		return st, err
	}
	defer cr.cleanup()
	command := append([]string{"ansible-playbook"}, append(args, "-i", "/runner/inventory", "-e", "@/runner/env/extravars", job.Playbook)...)
	if r.adHoc != nil {
		moduleArgs := r.adHoc.ModuleArgs
		if d.Settings.String(ctx, "ALLOW_JINJA_IN_EXTRA_VARS") != "always" {
			if moduleArgs, err = sanitizeJinja(moduleArgs); err != nil {
				r.traceback = err.Error()
				return "error", err
			}
		}
		command = append([]string{"ansible"}, append(args, "-i", "/runner/inventory", "-e", "@/runner/env/extravars", "-m", r.adHoc.ModuleName, "-a", moduleArgs)...)
	}
	cfg := cr.cfg
	cfg.Args, cfg.SSHKeyData, cfg.Passwords = command, sshKeyData, prompts
	if err := r.recordStart(cfg, safeEnv); err != nil {
		return "error", err
	}

	d.lifecycle(ctx, job.ID, "running_playbook")
	wfID := workflowJobID(ctx, d, job.ID)
	sink := newJobEventSink(ctx, d, job, r.hostMap, r.inventory.Kind, wfID)
	sink.adHoc = r.adHoc != nil
	var res runnerResult
	var runErr error
	// A worker's artifacts (the fact cache among them) are only there if
	// its stream delivered them.
	artifactsProcessed := true
	if r.worker() {
		var pr podResult
		pr, runErr = r.runInContainerGroup(jobCtx, cr.workerEnv, args, runnerSettings, prompts, sshKeyData, sink.handle)
		res = pr.runnerResult
		artifactsProcessed = pr.ArtifactsProcessed
		if pr.Explanation != "" {
			r.explain(pr.Explanation)
		}
		if pr.Traceback != "" {
			r.traceback = pr.Traceback
		}
	} else {
		res, runErr = cfg.run(jobCtx, func(msg string, kv ...any) { r.log(msg, kv...) }, sink.handle)
	}
	if r.hold.abandoned() {
		// Left running for the next monitor, re-queued, or taken over: the
		// stream's end is not the end of the job's events.
		sink.abandon()
		return "", nil
	}
	sinkErr := sink.close()
	r.recordEvents(sink)
	if runErr != nil {
		return "error", runErr
	}
	if sinkErr != nil {
		r.traceback = "Failed to save job events: " + sinkErr.Error()
	}
	status := r.mapRunnerStatus(res.Status)
	// post_run_hook: facts written by the run go back to the hosts.
	d.lifecycle(ctx, job.ID, "post_run")
	if job.UseFactCache && artifactsProcessed {
		d.lifecycle(ctx, job.ID, "finish_job_fact_cache")
		updated, cleared := finishFactCache(ctx, d, r.factHosts, r.artifactDir(), job.ID, job.Created)
		r.log("fact cache finished", "updated", updated, "cleared", cleared)
	}
	r.readArtifacts()
	return status, nil
}

// recordEvents stores the artifacts and event count the sink gathered.
func (r *jobRun) recordEvents(s *jobEventSink) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.artifacts != nil && r.adHoc == nil {
		b, _ := json.Marshal(s.artifacts)
		_, _ = r.d.DB.Pool.Exec(r.ctx, `UPDATE main_job SET artifacts = $2 WHERE unifiedjob_ptr_id = $1`, r.job.ID, string(b))
	}
	_, _ = r.d.DB.Pool.Exec(r.ctx, `UPDATE main_unifiedjob SET emitted_events = $2 WHERE id = $1`, r.job.ID, s.count)
}

// readArtifacts is final_run_hook: the collections and ansible version
// the execution environment reported.
func (r *jobRun) readArtifacts() {
	if b, err := readJobFile(r.pdd, filepath.Join(r.artifactDir(), "collections.json"), 16<<20); err == nil && json.Valid(b) {
		_, _ = r.d.DB.Pool.Exec(r.ctx, `UPDATE main_unifiedjob SET installed_collections = $2::jsonb WHERE id = $1`, r.job.ID, string(b))
	}
	r.recordAnsibleVersion()
}

// finish stores the final status on the job and its template.
func (r *jobRun) finish(status string) error {
	finished := time.Now()
	if r.finishedAt != nil {
		finished = *r.finishedAt
	}
	var template *int64
	if r.template != nil {
		template = &r.template.ID
	}
	return r.finishUnified(status, finished, template, templateJobStatus(failedStatus(status)), func(tx pgx.Tx) error {
		if r.adHoc == nil {
			if _, err := tx.Exec(r.ctx, `UPDATE main_job SET scm_revision = CASE WHEN $2 = '' THEN scm_revision ELSE $2 END WHERE unifiedjob_ptr_id = $1`, r.job.ID, r.job.SCMRevision); err != nil {
				return err
			}
		}
		if r.inventory != nil {
			_ = models.UpdateInventoryComputedFields(r.ctx, tx, r.inventory.ID)
		}
		return nil
	})
}

func (r *jobRun) timeoutSeconds() int64 {
	// Ad hoc commands have no timeout setting of their own.
	if r.adHoc != nil {
		return 0
	}
	return r.timeoutFrom("DEFAULT_JOB_TIMEOUT", r.job.Timeout)
}

// containerRuntime is podman unless configured otherwise or only docker
// is installed.
func (d *Dispatcher) containerRuntime() string {
	if d.Cfg.ContainerRuntime != "" {
		return d.Cfg.ContainerRuntime
	}
	if _, err := exec.LookPath("podman"); err == nil {
		return "podman"
	}
	return "docker"
}

// filterRuntimeOptions drops the podman-only run options when docker is
// the runtime, such as the slirp4netns network, and --user=root. The old
// application always ran rootless podman, where root in the container is
// the user who started it; under a docker daemon it is root on the host,
// and everything the playbook writes into the private data directory and
// the project (events, checkouts) would belong to root, out of reach of a
// task process that is not. Without it the runtime runs the container as
// the task process's own uid (command(), as ansible-runner did for docker),
// which is the same thing podman's root meant.
func filterRuntimeOptions(rt string, opts []string) []string {
	if !strings.Contains(rt, "docker") {
		return opts
	}
	var out []string
	for i := 0; i < len(opts); i++ {
		o := opts[i]
		if o == "--network" && i+1 < len(opts) && (strings.HasPrefix(opts[i+1], "slirp4netns") || strings.HasPrefix(opts[i+1], "pasta")) {
			i++
			continue
		}
		if strings.HasPrefix(o, "--network=slirp4netns") || strings.HasPrefix(o, "--network=pasta") || o == "--quiet" || o == "--user=root" {
			continue
		}
		out = append(out, o)
	}
	return out
}

// showPathMount renders one ASCENDER_ISOLATION_SHOW_PATHS entry as a
// volume mapping (HOST-DIR[:CONTAINER-DIR[:OPTIONS]]).
func showPathMount(p string) string {
	switch strings.Count(p, ":") {
	case 2:
		parts := strings.Split(p, ":")
		if parts[2] != "z" && parts[2] != "Z" && parts[2] != "ro" && parts[2] != "rw" && parts[2] != "O" {
			parts[2] = "z"
		}
		return strings.Join(parts, ":")
	case 1:
		return p + ":z"
	default:
		return p + ":" + p + ":z"
	}
}

// --- project ---------------------------------------------------------------

// syncAndCopyProject is sync_and_copy: it refreshes the project from
// source control when the job needs a revision the local tree lacks (as
// a project update with launch_type sync) and copies the tree, roles and
// collections into the private data directory.
func (r *jobRun) syncAndCopyProject(jobCtx context.Context) (canceled bool, err error) {
	ps := &projectSync{d: r.d, ctx: r.ctx, project: r.project, jobID: r.job.ID, pdd: r.pdd, scmBranch: r.job.SCMBranch, eeID: r.job.ExecutionEnvironmentID,
		link: func(puID int64) {
			_, _ = r.d.DB.Pool.Exec(r.ctx, `UPDATE main_job SET project_update_id = $2 WHERE unifiedjob_ptr_id = $1`, r.job.ID, puID)
		},
		explain: r.explain, log: r.log}
	rev, canceled, err := ps.run(jobCtx)
	if err != nil || canceled {
		return canceled, err
	}
	r.job.SCMRevision = rev
	return false, nil
}

func pathExists(p string) bool {
	_, err := os.Stat(p)
	return err == nil
}

// --- inventory -------------------------------------------------------------

// inventoryHosts lists the hosts the job targets, in name order, with the
// slice applied when the job is one slice of a sliced run.
func (r *jobRun) inventoryHosts(includeDisabled bool) ([]*models.Host, error) {
	hosts, err := api.InventoryHostRows(r.ctx, r.d.DB.Pool, r.inventory, includeDisabled)
	if err != nil {
		return nil, err
	}
	return slicedHosts(hosts, r.job.JobSliceNumber, r.job.JobSliceCount, r.job.JobSlicePinnedHosts), nil
}

// slicedHosts is Inventory.get_sliced_hosts.
func slicedHosts(hosts []*models.Host, sliceNumber, sliceCount int64, pinned string) []*models.Host {
	if sliceCount <= 1 || sliceNumber <= 0 {
		return hosts
	}
	pinnedNames := map[string]bool{}
	for _, n := range strings.Split(pinned, ",") {
		if n = strings.TrimSpace(n); n != "" {
			pinnedNames[n] = true
		}
	}
	var pinnedHosts, others []*models.Host
	for _, h := range hosts {
		if pinnedNames[h.Name] {
			pinnedHosts = append(pinnedHosts, h)
		} else {
			others = append(others, h)
		}
	}
	if len(pinnedHosts) == 0 {
		others = hosts
	}
	var out []*models.Host
	for i := int(sliceNumber - 1); i < len(others); i += int(sliceCount) {
		out = append(out, others[i])
	}
	out = append(out, pinnedHosts...)
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out
}

// factCacheHosts are the hosts whose facts are cached: the source hosts
// of a constructed inventory, else the inventory's own, sliced like the run.
func (r *jobRun) factCacheHosts() ([]*models.Host, error) {
	if r.inventory.Kind != "constructed" {
		return r.inventoryHosts(true)
	}
	rows, err := r.d.DB.Pool.Query(r.ctx, `SELECT `+models.HostColumns+` FROM main_host h WHERE h.id IN (SELECT NULLIF(c.instance_id, '')::integer FROM main_host c WHERE c.inventory_id = $1 AND c.instance_id ~ '^[0-9]+$') ORDER BY h.name`, r.inventory.ID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var hosts []*models.Host
	for rows.Next() {
		h, err := models.ScanHost(rows)
		if err != nil {
			return nil, err
		}
		hosts = append(hosts, h)
	}
	return slicedHosts(hosts, r.job.JobSliceNumber, r.job.JobSliceCount, r.job.JobSlicePinnedHosts), nil
}

// writeInventory writes the inventory script (write_inventory_file): a
// python program printing the JSON get_script_data produced.
func (r *jobRun) writeInventory(hosts []*models.Host) error {
	data, hostMap, err := api.InventoryScriptData(r.ctx, r.d.DB.Pool, r.inventory, hosts, true, true)
	if err != nil {
		return err
	}
	r.hostMap = hostMap
	js, err := json.Marshal(data)
	if err != nil {
		return err
	}
	content := "#! /usr/bin/env python3\n# -*- coding: utf-8 -*-\nprint(" + pythonRepr(string(js)) + ")\n"
	return os.WriteFile(filepath.Join(r.pdd, "inventory", "hosts"), []byte(content), 0o700)
}

// pythonRepr quotes a string the way repr() does for the inventory script.
func pythonRepr(s string) string {
	quote := "'"
	if strings.Contains(s, "'") && !strings.Contains(s, `"`) {
		quote = `"`
	}
	var b strings.Builder
	b.WriteString(quote)
	for _, c := range s {
		switch {
		case c == '\\':
			b.WriteString(`\\`)
		case string(c) == quote:
			b.WriteString(`\` + quote)
		case c == '\n':
			b.WriteString(`\n`)
		case c == '\r':
			b.WriteString(`\r`)
		case c == '\t':
			b.WriteString(`\t`)
		case c < 0x20 || c == 0x7f:
			fmt.Fprintf(&b, `\x%02x`, c)
		default:
			b.WriteRune(c)
		}
	}
	b.WriteString(quote)
	return b.String()
}

// --- credentials, passwords, args, env -------------------------------------

func (r *jobRun) machineCredential() *credentialData {
	for _, c := range r.creds {
		if c.Kind == "ssh" {
			return c
		}
	}
	return nil
}

func (r *jobRun) credentialsOfKind(kind string) []*credentialData {
	var out []*credentialData
	for _, c := range r.creds {
		if c.Kind == kind {
			out = append(out, c)
		}
	}
	return out
}

// privateDataFiles is build_private_data_files: SSH keys of machine and
// source control credentials go to the agent, other keys to files.
func (r *jobRun) privateDataFiles() (sshKeyData string, certs map[int64]string, credFiles map[int64]string, err error) {
	credFiles = map[int64]string{}
	certs = map[int64]string{}
	for _, c := range r.creds {
		if c.has("ssh_key_data") {
			data := c.get("ssh_key_data")
			if strings.Contains(data, "OPENSSH PRIVATE KEY") && !strings.HasSuffix(data, "\n") {
				data += "\n"
			}
			if c.Namespace == "ssh" || c.Namespace == "scm" {
				sshKeyData = data
			} else {
				path, err := privateFile(r.pdd, "env", data, 0o600)
				if err != nil {
					return "", nil, nil, err
				}
				credFiles[c.ID] = path
			}
		}
		if c.has("ssh_public_key_data") {
			path := filepath.Join(r.artifactDir(), "ssh_key_data-cert.pub")
			if err := os.WriteFile(path, []byte(c.get("ssh_public_key_data")), 0o600); err != nil {
				return "", nil, nil, err
			}
			certs[c.ID] = path
		}
	}
	return sshKeyData, certs, credFiles, nil
}

// sourcesAlreadyUpdated are the inventory sources the launch synced
// itself (start_args' inventory_sources_already_updated).
func (r *jobRun) sourcesAlreadyUpdated() map[int64]bool {
	out := map[int64]bool{}
	if r.job.StartArgs == "" {
		return out
	}
	pk := r.job.ID
	dec, err := crypto.DecryptField(r.d.Cfg.SecretKey, "start_args", &pk, r.job.StartArgs)
	if err != nil {
		return out
	}
	var m struct {
		Sources []int64 `json:"inventory_sources_already_updated"`
	}
	if json.Unmarshal([]byte(dec), &m) == nil {
		for _, id := range m.Sources {
			out[id] = true
		}
	}
	return out
}

// runtimePasswords are the passwords given at launch (start_args).
func (r *jobRun) runtimePasswords() map[string]string {
	out := map[string]string{}
	if r.job.StartArgs == "" {
		return out
	}
	pk := r.job.ID
	dec, err := crypto.DecryptField(r.d.Cfg.SecretKey, "start_args", &pk, r.job.StartArgs)
	if err != nil {
		return out
	}
	var m map[string]any
	if json.Unmarshal([]byte(dec), &m) == nil {
		for k, v := range m {
			if s, ok := v.(string); ok {
				out[k] = s
			}
		}
	}
	return out
}

// buildPasswords is RunJob.build_passwords.
func (r *jobRun) buildPasswords() (map[string]string, error) {
	passwords := map[string]string{"yes": "yes", "no": "no", "": ""}
	runtime := r.runtimePasswords()
	if cred := r.machineCredential(); cred != nil {
		for _, field := range []string{"ssh_key_unlock", "ssh_password", "become_password", "vault_password"} {
			input := field
			if field == "ssh_password" {
				input = "password"
			}
			value, ok := runtime[field]
			if !ok {
				value = cred.get(input)
			}
			if value != "" && value != "ASK" {
				passwords[field] = value
			}
		}
	}
	for _, cred := range r.credentialsOfKind("vault") {
		field := "vault_password"
		if vid := cred.get("vault_id"); vid != "" {
			field = "vault_password." + vid
			if _, dup := passwords[field]; dup {
				return nil, fmt.Errorf("multiple vault credentials were specified with --vault-id %s@prompt", vid)
			}
		}
		value, ok := runtime[field]
		if !ok {
			value = cred.get("vault_password")
		}
		if value != "" && value != "ASK" {
			passwords[field] = value
		}
	}
	if _, ok := passwords["ssh_key_unlock"]; !ok {
		for _, cred := range r.credentialsOfKind("net") {
			if cred.has("ssh_key_unlock") {
				if v, ok := runtime["ssh_key_unlock"]; ok {
					passwords["ssh_key_unlock"] = v
				} else {
					passwords["ssh_key_unlock"] = cred.get("ssh_key_unlock")
				}
				break
			}
		}
	}
	return passwords, nil
}

// passwordPrompts is get_password_prompts combined with
// create_expect_passwords_data_struct: prompt patterns in order with the
// answer each gets.
func (r *jobRun) passwordPrompts(passwords map[string]string) []expectPassword {
	type pp struct{ pattern, key string }
	var list []pp
	list = append(list, pp{`Enter passphrase for .*:\s*?$`, "ssh_key_unlock"}, pp{`Bad passphrase, try again for .*:\s*?$`, ""})
	for _, m := range privilegeEscalationMethods {
		list = append(list, pp{m + ` password.*:\s*?$`, "become_password"}, pp{strings.ToUpper(m) + ` password.*:\s*?$`, "become_password"})
	}
	list = append(list, pp{`BECOME password.*:\s*?$`, "become_password"}, pp{`SSH password:\s*?$`, "ssh_password"}, pp{`Password:\s*?$`, "ssh_password"}, pp{`Vault password:\s*?$`, "vault_password"})
	var vaultIDs []string
	for k := range passwords {
		if strings.HasPrefix(k, "vault_password.") {
			vaultIDs = append(vaultIDs, k)
		}
	}
	sort.Strings(vaultIDs)
	for _, k := range vaultIDs {
		list = append(list, pp{`Vault password \(` + regexp.QuoteMeta(strings.SplitN(k, ".", 2)[1]) + `\):\s*?$`, k})
	}
	var out []expectPassword
	for _, p := range list {
		out = append(out, expectPassword{re: regexp.MustCompile("(?m)" + p.pattern), value: passwords[p.key]})
	}
	return out
}

// buildArgs is RunJob.build_args: the ansible-playbook options before
// the inventory, extra vars and playbook.
func (r *jobRun) buildArgs(passwords map[string]string) ([]string, error) {
	job := r.job
	sshUser, becomeUser, becomeMethod := "", "", ""
	if cred := r.machineCredential(); cred != nil {
		sshUser, becomeMethod, becomeUser = cred.get("username"), cred.get("become_method"), cred.get("become_username")
	}
	if sshUser == "" {
		sshUser = "root"
	}
	var args []string
	if job.JobType == "check" {
		args = append(args, "--check")
	}
	u, err := sanitizeJinja(sshUser)
	if err != nil {
		return nil, err
	}
	args = append(args, "-u", u)
	if _, ok := passwords["ssh_password"]; ok {
		args = append(args, "--ask-pass")
	}
	if job.BecomeEnabled {
		args = append(args, "--become")
	}
	if job.DiffMode {
		args = append(args, "--diff")
	}
	if becomeMethod != "" {
		m, err := sanitizeJinja(becomeMethod)
		if err != nil {
			return nil, err
		}
		args = append(args, "--become-method", m)
	}
	if becomeUser != "" {
		bu, err := sanitizeJinja(becomeUser)
		if err != nil {
			return nil, err
		}
		args = append(args, "--become-user", bu)
	}
	if _, ok := passwords["become_password"]; ok {
		args = append(args, "--ask-become-pass")
	}
	var vaultKeys []string
	for k := range passwords {
		if strings.HasPrefix(k, "vault_password") {
			vaultKeys = append(vaultKeys, k)
		}
	}
	sort.Strings(vaultKeys)
	for _, k := range vaultKeys {
		if k == "vault_password" {
			args = append(args, "--ask-vault-pass")
		} else {
			args = append(args, "--vault-id", strings.SplitN(k, ".", 2)[1]+"@prompt")
		}
	}
	if job.Forks > 0 {
		if max := r.d.Settings.Int(r.ctx, "MAX_FORKS"); max > 0 && job.Forks > max {
			r.d.Log.Warn("maximum number of forks exceeded", "job", job.ID, "max", max)
			args = append(args, fmt.Sprintf("--forks=%d", max))
		} else {
			args = append(args, fmt.Sprintf("--forks=%d", job.Forks))
		}
	}
	if job.ForceHandlers {
		args = append(args, "--force-handlers")
	}
	if job.Limit != "" {
		args = append(args, "-l", job.Limit)
	}
	if job.Verbosity > 0 {
		v := job.Verbosity
		if v > 5 {
			v = 5
		}
		args = append(args, "-"+strings.Repeat("v", int(v)))
	}
	if job.JobTags != "" {
		args = append(args, "-t", job.JobTags)
	}
	if job.SkipTags != "" {
		args = append(args, "--skip-tags="+job.SkipTags)
	}
	if job.StartAtTask != "" {
		args = append(args, "--start-at-task="+job.StartAtTask)
	}
	return args, nil
}

// writeExtraVars is build_extra_vars_file: the job's variables (survey
// passwords decrypted) plus the meta vars, dumped with !unsafe tags except
// for the template's own values.
func (r *jobRun) writeExtraVars() error {
	job := r.job
	var vars []kv
	seen := map[string]int{}
	set := func(k string, v any) {
		if i, ok := seen[k]; ok {
			vars[i].Value = v
			return
		}
		seen[k] = len(vars)
		vars = append(vars, kv{k, v})
	}
	if strings.TrimSpace(job.ExtraVars) != "" && !json.Valid([]byte(job.ExtraVars)) {
		// YAML, as an ad hoc command may hold: its keys in document order,
		// read as PyYAML read them.
		if v, err := pyyaml.Load(job.ExtraVars); err == nil {
			if m, ok := v.(*pyyaml.Map); ok {
				for i, k := range m.Keys {
					set(k, jsonShaped(m.Vals[i]))
				}
			}
		}
	} else if strings.TrimSpace(job.ExtraVars) != "" {
		raw := map[string]any{}
		dec := json.NewDecoder(strings.NewReader(job.ExtraVars))
		if err := dec.Decode(&raw); err == nil {
			// Keep the JSON key order the launch recorded.
			for _, k := range jsonKeys(job.ExtraVars) {
				v := raw[k]
				if s, ok := v.(string); ok && crypto.IsEncrypted(s) && r.isSurveyPassword(k) {
					if plain, err := crypto.DecryptField(r.d.Cfg.SecretKey, "value", nil, s); err == nil {
						v = plain
					}
				}
				set(k, v)
			}
		}
	}
	meta := r.metaVars()
	keys := make([]metaKey, 0, len(meta))
	for k := range meta {
		keys = append(keys, k)
	}
	sort.Slice(keys, func(i, j int) bool { return keys[i].order < keys[j].order })
	for _, k := range keys {
		set(k.key, meta[k])
	}
	safeDict := map[string]any{}
	if r.template != nil && r.d.Settings.String(r.ctx, "ALLOW_JINJA_IN_EXTRA_VARS") == "template" {
		safeDict, _ = parseVars(r.template.ExtraVars)
	}
	var content string
	if r.d.Settings.String(r.ctx, "ALLOW_JINJA_IN_EXTRA_VARS") == "always" {
		m := map[string]any{}
		for _, e := range vars {
			m[e.Key] = e.Value
		}
		b, err := yaml.Marshal(m)
		if err != nil {
			return err
		}
		content = string(b)
	} else {
		var err error
		if content, err = safeDump(vars, safeDict); err != nil {
			return err
		}
	}
	return os.WriteFile(filepath.Join(r.pdd, "env", "extravars"), []byte(content), 0o600)
}

func (r *jobRun) isSurveyPassword(key string) bool {
	var m map[string]any
	if len(r.job.SurveyPasswords) > 0 && json.Unmarshal(r.job.SurveyPasswords, &m) == nil {
		_, ok := m[key]
		return ok
	}
	return false
}

// jsonKeys lists the top-level keys of a JSON object in document order.
func jsonKeys(s string) []string {
	dec := json.NewDecoder(strings.NewReader(s))
	var keys []string
	if t, err := dec.Token(); err != nil || t != json.Delim('{') {
		return nil
	}
	for dec.More() {
		t, err := dec.Token()
		if err != nil {
			break
		}
		k, _ := t.(string)
		keys = append(keys, k)
		var v json.RawMessage
		if err := dec.Decode(&v); err != nil {
			break
		}
	}
	return keys
}

// metaKey orders the meta vars the way awx_meta_vars built them: per
// attribute, one entry per prefix.
type metaKey struct {
	order int
	key   string
}

// metaVars is Job.awx_meta_vars.
func (r *jobRun) metaVars() map[metaKey]any {
	job := r.job
	out := map[metaKey]any{}
	n := 0
	add := func(suffix string, v any) {
		for _, p := range jobVariablePrefixes {
			out[metaKey{n, p + "_" + suffix}] = v
			n++
		}
	}
	add("job_id", job.ID)
	add("job_launch_type", job.LaunchType)
	if wfID := workflowJobID(r.ctx, r.d, job.ID); wfID != nil {
		var name, launchType string
		var scheduleID *int64
		if err := r.d.DB.Pool.QueryRow(r.ctx, `SELECT name, launch_type, schedule_id FROM main_unifiedjob WHERE id = $1`, *wfID).Scan(&name, &launchType, &scheduleID); err == nil {
			add("workflow_job_id", *wfID)
			add("workflow_job_name", name)
			add("workflow_job_launch_type", launchType)
			if scheduleID != nil {
				var sname string
				if r.d.DB.Pool.QueryRow(r.ctx, `SELECT name FROM main_schedule WHERE id = $1`, *scheduleID).Scan(&sname) == nil {
					add("parent_job_schedule_id", *scheduleID)
					add("parent_job_schedule_name", sname)
				}
			}
		}
	}
	if job.CreatedByID == nil && job.ScheduleID != nil {
		var sname string
		if r.d.DB.Pool.QueryRow(r.ctx, `SELECT name FROM main_schedule WHERE id = $1`, *job.ScheduleID).Scan(&sname) == nil {
			add("schedule_id", *job.ScheduleID)
			add("schedule_name", sname)
		}
	}
	if job.CreatedByID != nil {
		var username, email, first, last string
		if r.d.DB.Pool.QueryRow(r.ctx, `SELECT username, email, first_name, last_name FROM auth_user WHERE id = $1`, *job.CreatedByID).Scan(&username, &email, &first, &last) == nil {
			add("user_id", *job.CreatedByID)
			add("user_name", username)
			add("user_email", email)
			add("user_first_name", first)
			add("user_last_name", last)
		}
	}
	if r.inventory != nil {
		add("inventory_id", r.inventory.ID)
		add("inventory_name", r.inventory.Name)
	}
	if r.project != nil {
		add("project_revision", r.project.SCMRevision)
		add("project_scm_branch", r.project.SCMBranch)
	}
	if job.SCMBranch != "" {
		add("job_scm_branch", job.SCMBranch)
	}
	if r.template != nil {
		add("job_template_id", r.template.ID)
		add("job_template_name", r.template.Name)
	}
	// The job's execution_node: an execution node over the mesh, the mesh
	// node a pod runs behind, none in a local pod, else this node.
	switch {
	case r.remote != "":
		add("execution_node", r.remote)
	case r.cg != nil && r.cg.MeshNode != "":
		add("execution_node", r.cg.MeshNode)
	case r.cg == nil && r.d.Cfg.ClusterHostID != "":
		add("execution_node", r.d.Cfg.ClusterHostID)
	}
	return out
}

// buildEnv is BaseTask.build_env plus RunJob.build_env.
func (r *jobRun) buildEnv(credFiles map[int64]string) (map[string]string, error) {
	d, job := r.d, r.job
	ctx := r.ctx
	env := r.baseEnv()
	if plugins := d.Settings.List(ctx, "ASCENDER_ANSIBLE_CALLBACK_PLUGINS"); len(plugins) > 0 && r.adHoc != nil {
		var ps []string
		for _, p := range plugins {
			ps = append(ps, fmt.Sprint(p))
		}
		env["ANSIBLE_CALLBACK_PLUGINS"] = strings.Join(ps, ":")
	}
	if r.adHoc != nil {
		// RunAdHocCommand.build_env.
		env["AD_HOC_COMMAND_ID"] = fmt.Sprint(job.ID)
		env["INVENTORY_ID"] = fmt.Sprint(r.inventory.ID)
		env["INVENTORY_HOSTVARS"] = "True"
		env["ANSIBLE_LOAD_CALLBACK_PLUGINS"] = "1"
		env["ANSIBLE_SFTP_BATCH_MODE"] = "False"
		return env, nil
	}
	env["JOB_ID"] = fmt.Sprint(job.ID)
	env["INVENTORY_ID"] = fmt.Sprint(r.inventory.ID)
	if r.project != nil {
		env["PROJECT_REVISION"] = r.project.SCMRevision
	}
	env["ANSIBLE_RETRY_FILES_ENABLED"] = "False"
	env["MAX_EVENT_RES"] = "25000000"
	if plugins := d.Settings.List(ctx, "ASCENDER_ANSIBLE_CALLBACK_PLUGINS"); len(plugins) > 0 {
		var ps []string
		for _, p := range plugins {
			ps = append(ps, fmt.Sprint(p))
		}
		env["ANSIBLE_CALLBACK_PLUGINS"] = strings.Join(ps, ":")
	}
	env["AWX_HOST"] = d.Settings.String(ctx, "ASCENDER_URL_BASE")
	env["ANSIBLE_SSH_CONTROL_PATH_DIR"] = "/runner/cp"
	for _, c := range r.credentialsOfKind("cloud") {
		if c.Namespace == "openstack" && credFiles[c.ID] != "" {
			env["OS_CLIENT_CONFIG_FILE"] = toContainerPath(credFiles[c.ID], r.pdd)
		}
	}
	for _, c := range r.credentialsOfKind("net") {
		env["ANSIBLE_NET_USERNAME"] = c.get("username")
		env["ANSIBLE_NET_PASSWORD"] = c.get("password")
		if f := credFiles[c.ID]; f != "" {
			env["ANSIBLE_NET_SSH_KEYFILE"] = toContainerPath(f, r.pdd)
		}
		authorize := c.getBool("authorize")
		if authorize {
			env["ANSIBLE_NET_AUTHORIZE"] = "1"
			env["ANSIBLE_NET_AUTH_PASS"] = c.get("authorize_password")
		} else {
			env["ANSIBLE_NET_AUTHORIZE"] = "0"
		}
	}
	cfgValues := readAnsibleConfig(filepath.Join(r.pdd, "project"), []string{"roles_path", "collections_path"})
	pathVars := []struct{ envKey, cfgKey, folder, def string }{
		{"ANSIBLE_ROLES_PATH", "roles_path", "requirements_roles", "~/.ansible/roles:/usr/share/ansible/roles:/etc/ansible/roles"},
		{"ANSIBLE_COLLECTIONS_PATH", "collections_path", "requirements_collections", "~/.ansible/collections:/usr/share/ansible/collections"},
	}
	if d.Settings.Bool(ctx, "ENABLE_ANSIBLE_29") {
		pathVars = append(pathVars, struct{ envKey, cfgKey, folder, def string }{"ANSIBLE_COLLECTIONS_PATHS", "collections_paths", "requirements_collections", "~/.ansible/collections:/usr/share/ansible/collections"})
	}
	for _, pv := range pathVars {
		paths := strings.Split(pv.def, ":")
		if v, ok := env[pv.envKey]; ok {
			for _, p := range strings.Split(v, ":") {
				if !contains(paths, p) {
					paths = append([]string{v}, paths...)
				}
			}
		} else if v, ok := cfgValues[pv.cfgKey]; ok {
			for _, p := range strings.Split(v, ":") {
				if !contains(paths, p) {
					paths = append([]string{v}, paths...)
				}
			}
		}
		env[pv.envKey] = strings.Join(append([]string{"/runner/" + pv.folder}, paths...), ":")
	}
	return env, nil
}

func contains(l []string, s string) bool {
	for _, x := range l {
		if x == s {
			return true
		}
	}
	return false
}

// pyStr renders a setting value the way str() did for the environment.
func pyStr(v any) string {
	switch t := v.(type) {
	case bool:
		if t {
			return "True"
		}
		return "False"
	case float64:
		if t == float64(int64(t)) {
			return fmt.Sprint(int64(t))
		}
	}
	return fmt.Sprint(v)
}

// readAnsibleConfig reads [defaults] keys from /etc/ansible/ansible.cfg
// and the project's ansible.cfg, the latter winning.
func readAnsibleConfig(projectPath string, keys []string) map[string]string {
	out := map[string]string{}
	for _, f := range []string{"/etc/ansible/ansible.cfg", filepath.Join(projectPath, "ansible.cfg")} {
		var raw []byte
		var err error
		if f == "/etc/ansible/ansible.cfg" {
			raw, err = os.ReadFile(f)
		} else {
			// The project's own file: nothing it links to outside the
			// checkout, and no device or FIFO, is read.
			raw, err = models.ReadProjectFile(projectPath, f, 1<<20)
		}
		if err != nil {
			continue
		}
		section := ""
		for _, line := range strings.Split(string(raw), "\n") {
			line = strings.TrimSpace(line)
			if line == "" || line[0] == '#' || line[0] == ';' {
				continue
			}
			if line[0] == '[' && strings.HasSuffix(line, "]") {
				section = strings.ToLower(strings.TrimSpace(line[1 : len(line)-1]))
				continue
			}
			if section != "defaults" {
				continue
			}
			k, v, ok := strings.Cut(line, "=")
			if !ok {
				continue
			}
			k = strings.ToLower(strings.TrimSpace(k))
			for _, want := range keys {
				if k == want {
					out[k] = strings.TrimSpace(v)
				}
			}
		}
	}
	return out
}

// parseVars reads a variables string as JSON or YAML (parse_yaml_or_json).
func parseVars(s string) (map[string]any, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return map[string]any{}, nil
	}
	m := map[string]any{}
	if err := json.Unmarshal([]byte(s), &m); err == nil {
		return m, nil
	}
	v, err := pyyaml.Load(s)
	if err != nil {
		return nil, err
	}
	switch t := jsonShaped(v).(type) {
	case map[string]any:
		return t, nil
	case nil:
		return map[string]any{}, nil
	}
	return nil, fmt.Errorf("variables must be a mapping")
}

// jsonShaped is a value pyyaml loaded, decoded again as json.Unmarshal
// decodes the JSON variables (numbers as float64), so that both compare
// alike.
func jsonShaped(v any) any {
	b, err := json.Marshal(v)
	if err != nil {
		return pyyaml.Plain(v)
	}
	var out any
	if err := json.Unmarshal(b, &out); err != nil {
		return pyyaml.Plain(v)
	}
	return out
}

// pyJSONList renders a list of strings the way json.dumps did (", "
// separated), which is how job_args was stored and is shown.
func pyJSONList(items []string) string {
	parts := make([]string, len(items))
	for i, it := range items {
		b, _ := json.Marshal(it)
		parts[i] = string(b)
	}
	return "[" + strings.Join(parts, ", ") + "]"
}

// dockerPull applies an execution environment's pull policy with docker:
// always pulls, missing pulls when the image is absent, never does nothing.
func dockerPull(ctx context.Context, rt, image, policy string, globalArgs ...string) error {
	switch policy {
	case "never":
		return nil
	case "always":
	default:
		inspect := exec.CommandContext(ctx, rt, append(append([]string{}, globalArgs...), "image", "inspect", image)...)
		inspect.Env = runtimeClientEnv()
		if err := inspect.Run(); err == nil {
			return nil
		}
	}
	pull := exec.CommandContext(ctx, rt, append(append([]string{}, globalArgs...), "pull", "--quiet", image)...)
	pull.Env = runtimeClientEnv()
	out, err := pull.CombinedOutput()
	if err != nil {
		return fmt.Errorf("%s pull %s: %s", rt, image, strings.TrimSpace(string(out)))
	}
	return nil
}
