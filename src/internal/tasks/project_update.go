package tasks

import (
	"context"
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"gopkg.in/yaml.v3"

	"github.com/ctrliq/ascender/internal/models"
)

// This file is the port of RunProjectUpdate (main/tasks/jobs.py): the
// project_update.yml playbook (copied from the old app's playbooks
// directory) runs in the control plane execution environment with the
// project and its cache mounted, and its events are stored as project
// update events.

//go:embed playbooks
var updatePlaybooks embed.FS

// puRun is the state of one project update.
type puRun struct {
	baseRun
	pu      *models.ProjectUpdate
	project *models.Project
	// jobPDD is the private data directory of the job a sync runs for;
	// the synced tree is copied there before the branch is put back.
	jobPDD string

	newRevision string
	// requirementsGeneration is set while the extra vars are built.
	requirementsGeneration *int64
	unlock                 func()
}

// runProjectUpdate executes one project update. jobCtx is cancelled when
// the job is cancelled; bg is the process context used for bookkeeping
// after cancellation.
func (d *Dispatcher) runProjectUpdate(jobCtx, bg context.Context, id int64) error {
	return d.runProjectUpdateFor(jobCtx, bg, id, "")
}

// runProjectUpdateFor runs a project update; a sync for a job passes the
// job's private data directory (RunProjectUpdate(job_private_data_dir=...)).
func (d *Dispatcher) runProjectUpdateFor(jobCtx, bg context.Context, id int64, jobPDD string) (err error) {
	pu, err := models.GetProjectUpdate(bg, d.DB.Pool, id)
	if err != nil {
		return err
	}
	r := &puRun{baseRun: d.newBaseRun(bg, id, "project_update", "main.projectupdate"), pu: pu, jobPDD: jobPDD}
	r.localWork = d.localWorkOnReceptor(bg)
	// A project update has no worker to detach from: stopped by a
	// shutdown, it is re-queued as its runner's _handle_signal did, unless
	// it is a job's inline sync, which stops with the job.
	r.hold.inlineSync = pu.LaunchType == "sync"
	defer r.recoverPanic("project update", r.finish, &err)
	if err := r.startable("project update", &pu.Status, pu.CancelFlag); err != nil {
		return err
	}
	if pu.ProjectID != nil {
		r.project, _ = models.GetProject(bg, d.DB.Pool, *pu.ProjectID)
	}
	// Project updates use the control plane execution environment.
	r.executionEnvironment(&pu.ExecutionEnvironmentID, func() *int64 {
		return models.ControlPlaneExecutionEnvironmentID(bg, d.DB.Pool)
	})
	var igID *int64
	if _, name := d.queueNames(bg); name != "" {
		var gid int64
		if err := d.DB.Pool.QueryRow(bg, `SELECT id FROM main_instancegroup WHERE name = $1`, name).Scan(&gid); err == nil {
			igID = &gid
		}
	}
	return r.runTask(jobCtx, runSteps{what: "project update", group: igID, template: pu.UnifiedJobTemplateID, clearStartArgs: true,
		execute: r.execute, finish: r.finish, tracebackFor: func(string, string) bool { return true }})
}

func (r *puRun) timeoutSeconds() int64 {
	return r.timeoutFrom("DEFAULT_PROJECT_UPDATE_TIMEOUT", int64(r.pu.Timeout))
}

// execute is BaseTask.run for the update: it returns the final status.
func (r *puRun) execute(jobCtx context.Context) (status string, err error) {
	d, pu, project := r.d, r.pu, r.project
	ctx := r.ctx
	d.lifecycle(ctx, pu.ID, "pre_run")
	if r.ee == nil {
		return "error", fmt.Errorf("The ProjectUpdate could not run because there is no Execution Environment.")
	}
	if project == nil {
		return "error", fmt.Errorf("'NoneType' object has no attribute 'get_project_path'")
	}
	if err := models.EnsureEventPartition(ctx, d.DB.Pool, "main_projectupdateevent", pu.Created); err != nil {
		return "error", err
	}
	cleanup, err := r.preparePDD("inventory", "env", "artifacts")
	if err != nil {
		return "error", err
	}
	defer cleanup()
	pdd := r.pdd

	// pre_run_hook: the lock (a sync runs under its job's), the project
	// folder used as a mount, and an empty stage for roles and collections.
	if pu.LaunchType != "sync" {
		r.unlock = d.lockProject(project.ID)
	}
	defer func() {
		r.postRun(status)
		if r.unlock != nil {
			r.unlock()
		}
	}()
	projectPath := d.projectPathFor(pu.LocalPath)
	if projectPath == "" {
		return "error", fmt.Errorf("Invalid lock file path")
	}
	if err := os.MkdirAll(projectPath, 0o755); err != nil {
		return "error", err
	}
	cacheBase := d.projectCacheBase(pu.LocalPath)
	stage := filepath.Join(cacheBase, "stage")
	if pathExists(stage) {
		d.Log.Warn("stage unexpectedly existed before update", "path", stage)
		_ = os.RemoveAll(stage)
	}
	if err := os.MkdirAll(stage, 0o755); err != nil {
		return "error", err
	}

	// build_project_dir: the playbook and its plugins.
	if err := writeUpdatePlaybooks(filepath.Join(pdd, "project")); err != nil {
		return "error", err
	}
	// The inventory runner wrote for 'localhost,'.
	if err := os.WriteFile(filepath.Join(pdd, "inventory", "hosts"), []byte("localhost,"), 0o600); err != nil {
		return "error", err
	}

	// build_private_data / build_passwords
	var cred *credentialData
	if pu.CredentialID != nil {
		lookupCtx, stopLookup := cancelableBy(d.withWorkload(ctx, pu.ID, r.timeoutSeconds()), jobCtx)
		creds, err := d.loadCredentials(lookupCtx, []int64{*pu.CredentialID})
		stopLookup()
		if jobCtx.Err() != nil {
			return r.preRunInterrupted(), nil
		}
		if err != nil {
			return "error", err
		}
		if len(creds) > 0 {
			cred = creds[0]
		}
	}
	passwords := map[string]string{}
	sshKeyData := ""
	if cred != nil {
		sshKeyData = cred.get("ssh_key_data")
		passwords["scm_key_unlock"] = cred.get("ssh_key_unlock")
		passwords["scm_username"] = cred.get("username")
		passwords["scm_password"] = cred.get("password")
	}

	if err := r.writeExtraVars(cred); err != nil {
		r.traceback = err.Error()
		return "error", err
	}

	// build_env
	env := r.baseEnv()
	env["ANSIBLE_RETRY_FILES_ENABLED"] = "False"
	env["ANSIBLE_ASK_PASS"] = "False"
	env["ANSIBLE_BECOME_ASK_PASS"] = "False"
	env["DISPLAY"] = ""
	env["TMP"] = d.isolationBase(ctx)
	env["PROJECT_UPDATE_ID"] = fmt.Sprint(pu.ID)
	if d.Settings.Bool(ctx, "GALAXY_IGNORE_CERTS") {
		env["ANSIBLE_GALAXY_IGNORE"] = "True"
	}
	galaxy, err := r.galaxyCredentials()
	if err != nil {
		return "error", err
	}
	var servers []string
	for i, g := range galaxy {
		env[fmt.Sprintf("ANSIBLE_GALAXY_SERVER_SERVER%d_URL", i)] = g.get("url")
		if t := g.get("token"); t != "" {
			env[fmt.Sprintf("ANSIBLE_GALAXY_SERVER_SERVER%d_TOKEN", i)] = t
		}
		if a := g.get("auth_url"); a != "" {
			env[fmt.Sprintf("ANSIBLE_GALAXY_SERVER_SERVER%d_AUTH_URL", i)] = a
		}
		servers = append(servers, fmt.Sprintf("server%d", i))
	}
	if len(servers) > 0 {
		env["ANSIBLE_GALAXY_SERVER_LIST"] = strings.Join(servers, ",")
	}
	safeEnv := buildSafeEnv(env)

	// build_args
	var args []string
	if d.Settings.Bool(ctx, "PROJECT_UPDATE_VVV") {
		args = append(args, "-vvv")
	}
	if pu.JobTags != "" {
		args = append(args, "-t", pu.JobTags)
	}
	_ = os.WriteFile(filepath.Join(pdd, "env", "cmdline"), []byte(args2cmdline(args...)), 0o600)
	r.writeRunnerSettings(r.runnerSettings(r.timeoutSeconds()))

	// build_execution_environment_params: the project and its cache are
	// mounted at their own paths.
	cr, st, err := r.prepareContainer(jobCtx, env, safeEnv, r.timeoutSeconds(), containerOptions{
		mounts: []string{projectPath + ":" + projectPath + ":z", cacheBase + ":" + cacheBase + ":z"}})
	if cr == nil {
		return st, err
	}
	defer cr.cleanup()
	cfg := cr.cfg
	cfg.Args = append([]string{"ansible-playbook"}, append(args, "-i", "/runner/inventory", "-e", "@/runner/env/extravars", "project_update.yml")...)
	cfg.SSHKeyData, cfg.Passwords = sshKeyData, projectUpdatePrompts(passwords)
	if err := r.recordStart(cfg, safeEnv); err != nil {
		return "error", err
	}

	sink := newJobEventSink(ctx, d, &models.Job{UnifiedJob: models.UnifiedJob{ID: pu.ID, Created: pu.Created}}, nil, "", nil)
	sink.projectUpdate = true
	// RunnerCallbackForProjectUpdate: the revision comes from the set_fact
	// that records scm_version.
	sink.observe = func(event string, data map[string]any) {
		action, _ := data["task_action"].(string)
		if action != "set_fact" && action != "ansible.builtin.set_fact" {
			return
		}
		res, _ := data["res"].(map[string]any)
		facts, _ := res["ansible_facts"].(map[string]any)
		if v, ok := facts["scm_version"]; ok {
			r.newRevision = stringOr(v)
		}
	}
	d.lifecycle(ctx, pu.ID, "preparing_playbook")
	d.lifecycle(ctx, pu.ID, "running_playbook")
	var res runnerResult
	var runErr error
	if r.localWork {
		// The worker runs the playbook from the directory it is sent, with
		// the project and its cache at their own paths in its container.
		kw := workerKwargs(pu.ID, cr.workerEnv, args, r.runnerSettings(r.timeoutSeconds()), cfg.Passwords)
		kw["playbook"] = "project_update.yml"
		var pr podResult
		pr, runErr = d.runLocalWork(jobCtx, ctx, r.hold, pu.ID, pdd, kw, sshKeyData, sink.handle, r.log)
		res = pr.runnerResult
		if pr.Explanation != "" {
			r.explain(pr.Explanation)
		}
		if pr.Traceback != "" {
			r.traceback = pr.Traceback
		}
	} else {
		res, runErr = cfg.run(jobCtx, func(msg string, kv ...any) { r.log(msg, kv...) }, sink.handle)
	}
	d.lifecycle(ctx, pu.ID, "post_run")
	// _handle_signal: a project update is stopped on shutdown and run
	// again; an inline sync is not, the job that runs it stops too.
	if r.hold.abandoned() || r.shutdownRequeue(res.Status, "") {
		sink.abandon()
		return "", nil
	}
	sinkErr := sink.close()
	_, _ = d.DB.Pool.Exec(ctx, `UPDATE main_unifiedjob SET emitted_events = $2 WHERE id = $1`, pu.ID, sink.count)
	if runErr != nil {
		return "error", runErr
	}
	if sinkErr != nil {
		r.traceback = "Failed to save job events: " + sinkErr.Error()
	}
	status = r.mapRunnerStatus(res.Status)
	r.recordAnsibleVersion()
	return status, nil
}

// writeUpdatePlaybooks copies the playbooks directory into project/.
func writeUpdatePlaybooks(dest string) error {
	return fs.WalkDir(updatePlaybooks, "playbooks", func(path string, de fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel := strings.TrimPrefix(strings.TrimPrefix(path, "playbooks"), "/")
		target := filepath.Join(dest, rel)
		if de.IsDir() {
			return os.MkdirAll(target, 0o755)
		}
		b, err := updatePlaybooks.ReadFile(path)
		if err != nil {
			return err
		}
		return os.WriteFile(target, b, 0o644)
	})
}

// projectUpdatePrompts is RunProjectUpdate.get_password_prompts with the
// answers create_expect_passwords_data_struct gave them.
func projectUpdatePrompts(passwords map[string]string) []expectPassword {
	list := [][2]string{
		{`Username for.*:\s*?$`, "scm_username"},
		{`Password for.*:\s*?$`, "scm_password"},
		{`Password:\s*?$`, "scm_password"},
		{`\S+?@\S+?'s\s+?password:\s*?$`, "scm_password"},
		{`Enter passphrase for .*:\s*?$`, "scm_key_unlock"},
		{`Bad passphrase, try again for .*:\s*?$`, ""},
		{`^Are you sure you want to continue connecting \(yes/no\)\?\s*?$`, "yes"},
	}
	out := make([]expectPassword, 0, len(list))
	for _, p := range list {
		out = append(out, expectPassword{re: regexp.MustCompile("(?m)" + p[0]), value: passwords[p[1]]})
	}
	return out
}

// galaxyCredentials are the project organization's Galaxy credentials in
// order.
func (r *puRun) galaxyCredentials() ([]*credentialData, error) {
	if r.project == nil || r.project.OrganizationID == nil {
		return nil, nil
	}
	rows, err := r.d.DB.Pool.Query(r.ctx, `SELECT credential_id FROM main_organizationgalaxycredentialmembership WHERE organization_id = $1 ORDER BY position, id`, *r.project.OrganizationID)
	if err != nil {
		return nil, err
	}
	var ids []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return nil, err
		}
		ids = append(ids, id)
	}
	rows.Close()
	if len(ids) == 0 {
		return nil, nil
	}
	return r.d.loadCredentials(r.ctx, ids)
}

// fingerprint is _fingerprint: sha256 of json.dumps(sort_keys=True).
func fingerprint(v any) string {
	b, _ := json.Marshal(v)
	var plain any
	_ = json.Unmarshal(b, &plain)
	sum := sha256.Sum256([]byte(pyJSONSorted(plain)))
	return hex.EncodeToString(sum[:])
}

// pyJSONSorted is json.dumps(v, sort_keys=True) with its default
// separators and ASCII escaping.
func pyJSONSorted(v any) string {
	switch t := v.(type) {
	case map[string]any:
		keys := make([]string, 0, len(t))
		for k := range t {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		parts := make([]string, len(keys))
		for i, k := range keys {
			parts[i] = pyJSONSorted(k) + ": " + pyJSONSorted(t[k])
		}
		return "{" + strings.Join(parts, ", ") + "}"
	case []any:
		parts := make([]string, len(t))
		for i, x := range t {
			parts[i] = pyJSONSorted(x)
		}
		return "[" + strings.Join(parts, ", ") + "]"
	case string:
		b, _ := json.Marshal(t)
		var out strings.Builder
		for _, c := range string(b) {
			if c > 127 {
				if c > 0xFFFF {
					c -= 0x10000
					fmt.Fprintf(&out, "\\u%04x\\u%04x", 0xD800+(c>>10), 0xDC00+(c&0x3FF))
				} else {
					fmt.Fprintf(&out, "\\u%04x", c)
				}
				continue
			}
			out.WriteRune(c)
		}
		s := out.String()
		s = strings.NewReplacer(`<`, "<", `>`, ">", `&`, "&").Replace(s)
		return s
	case nil:
		return "null"
	case bool:
		if t {
			return "true"
		}
		return "false"
	case float64:
		if t == float64(int64(t)) {
			return fmt.Sprint(int64(t))
		}
		return fmt.Sprint(t)
	}
	b, _ := json.Marshal(v)
	return string(b)
}

// writeExtraVars is build_extra_vars_file.
func (r *puRun) writeExtraVars(cred *credentialData) error {
	d, pu, project := r.d, r.pu, r.project
	ctx := r.ctx
	var vars []kv
	set := func(k string, v any) {
		for i := range vars {
			if vars[i].Key == k {
				vars[i].Value = v
				return
			}
		}
		vars = append(vars, kv{k, v})
	}
	// _build_scm_url_extra_vars
	credUser, credPass := "", ""
	if cred != nil {
		credUser, credPass = cred.get("username"), cred.get("password")
	}
	scmURL, err := updateSCMURL(pu.SCMType, pu.SCMURL, keepCred, keepCred, false, false)
	if err != nil {
		return err
	}
	parts := pyURLSplit(scmURL)
	user := parts.username()
	if user == "" {
		user = credUser
	}
	pass := parts.password()
	if pass == "" {
		pass = credPass
	}
	if user != "" {
		userArg, passArg := setCred(user), setCred(pass)
		switch {
		case pu.SCMType == "svn":
			set("scm_username", user)
			set("scm_password", pass)
			passArg = setCred("")
			if parts.scheme != "svn+ssh" {
				userArg = setCred("")
			}
		case strings.HasSuffix(parts.scheme, "ssh"):
			passArg = setCred("")
		case pu.SCMType == "archive":
			set("scm_username", user)
			set("scm_password", pass)
		}
		scmURL, err = updateSCMURL(pu.SCMType, scmURL, userArg, passArg, true, true)
	} else {
		scmURL, err = updateSCMURL(pu.SCMType, scmURL, keepCred, keepCred, true, true)
	}
	if err != nil {
		return err
	}
	if pu.SCMType == "git" && strings.HasSuffix(parts.scheme, "ssh") {
		set("scm_accept_hostkey", "true")
	}

	branch := pu.SCMBranch
	if pu.JobType == "run" && !puBranchOverride(pu, project) {
		if project.SCMRevision != "" {
			branch = project.SCMRevision
		} else if branch == "" {
			return fmt.Errorf("Could not determine a revision to run from project.")
		}
	} else if branch == "" {
		branch = "HEAD"
	}
	galaxy, err := r.galaxyCredentials()
	if err != nil {
		return err
	}
	galaxyDefined := len(galaxy) > 0
	var galaxyCreds []any
	var galaxyServers []any
	for _, g := range galaxy {
		c := map[string]any{}
		for _, f := range []string{"url", "auth_url", "token"} {
			if v := g.get(f); v != "" {
				c[f] = v
			} else {
				c[f] = nil
			}
		}
		galaxyCreds = append(galaxyCreds, c)
		galaxyServers = append(galaxyServers, c["url"])
	}
	if galaxyCreds == nil {
		galaxyCreds = []any{}
		galaxyServers = []any{}
	}
	gen := d.currentRequirementsGeneration(ctx, project, pu)
	r.requirementsGeneration = &gen
	rolesEnabled := d.Settings.Bool(ctx, "ASCENDER_ROLES_ENABLED")
	collectionsEnabled := d.Settings.Bool(ctx, "ASCENDER_COLLECTIONS_ENABLED")
	if !galaxyDefined && (rolesEnabled || collectionsEnabled) {
		d.Log.Warn("Galaxy role/collection syncing is enabled, but no credentials are configured for the project's organization", "project", project.ID)
	}
	galaxyTaskEnv := map[string]any{}
	if v, ok := d.Settings.Get(ctx, "GALAXY_TASK_ENV"); ok {
		if m, ok := v.(map[string]any); ok {
			galaxyTaskEnv = m
		}
	}
	taskEnv := map[string]any{}
	if v, ok := d.Settings.Get(ctx, "ASCENDER_TASK_ENV"); ok {
		if m, ok := v.(map[string]any); ok {
			taskEnv = m
		}
	}
	projectsRoot := strings.TrimRight(d.Cfg.ProjectsRoot, "/")
	set("projects_root", projectsRoot)
	set("local_path", filepath.Base(project.LocalPath))
	set("project_path", d.projectPathFor(pu.LocalPath))
	set("awx_version", d.Cfg.Version)
	set("scm_url", scmURL)
	set("scm_branch", branch)
	set("scm_clean", pu.SCMClean)
	set("scm_track_submodules", pu.SCMTrackSubmodules)
	set("roles_enabled", galaxyDefined && rolesEnabled)
	set("collections_enabled", galaxyDefined && collectionsEnabled)
	set("galaxy_task_env", galaxyTaskEnv)
	set("requirements_cache_enabled", project.ReuseRequirements)
	set("requirements_cache_refresh", requirementsRefreshLaunchTypes[pu.LaunchType])
	set("requirements_cache_salt", map[string]any{
		"galaxy_servers":      galaxyServers,
		"galaxy_auth":         fingerprint(galaxyCreds),
		"galaxy_task_env":     fingerprint(galaxyTaskEnv),
		"galaxy_ignore_certs": d.Settings.Bool(ctx, "GALAXY_IGNORE_CERTS"),
		"task_env":            fingerprint(map[string]any{"ASCENDER_TASK_ENV": taskEnv, "settings": map[string]any{}}),
		"refresh_generation":  gen,
	})
	if pu.SCMRefspec != "" {
		set("scm_refspec", pu.SCMRefspec)
	} else if project.AllowOverride {
		set("scm_refspec", "+refs/heads/*:refs/remotes/origin/*")
	}
	if pu.SCMType == "archive" {
		set("ansible_remote_tmp", filepath.Join(d.projectPathFor(pu.LocalPath), ".ansible_awx", "tmp"))
	}
	if project.SignatureValidationCredentialID != nil {
		creds, err := d.loadCredentials(ctx, []int64{*project.SignatureValidationCredentialID})
		if err != nil {
			return err
		}
		if len(creds) > 0 {
			set("gpg_pubkey", creds[0].get("gpg_public_key"))
		}
	}
	var content string
	if d.Settings.String(ctx, "ALLOW_JINJA_IN_EXTRA_VARS") == "always" {
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
		if content, err = safeDump(vars, map[string]any{}); err != nil {
			return err
		}
	}
	return os.WriteFile(filepath.Join(r.pdd, "env", "extravars"), []byte(content), 0o400)
}

// postRun is RunProjectUpdate.post_run_hook: the revision, the content
// cache and, for a sync, the copy into the job's directory.
func (r *puRun) postRun(status string) {
	d, pu, project := r.d, r.pu, r.project
	ctx := r.ctx
	if project == nil {
		return
	}
	if r.newRevision != "" {
		pu.SCMRevision = r.newRevision
		_, _ = d.DB.Pool.Exec(ctx, `UPDATE main_projectupdate SET scm_revision = $2 WHERE unifiedjob_ptr_id = $1`, pu.ID, r.newRevision)
	}
	base := d.projectCacheBase(pu.LocalPath)
	stage := filepath.Join(base, "stage")
	if status == "successful" && strings.Contains(pu.JobTags, "install_") {
		keep := puCacheID(pu, project)
		if puBranchOverride(pu, project) {
			keep = projectCacheID(project)
		}
		maxReq := 0
		if project.ReuseRequirements {
			maxReq = 10
		}
		d.clearProjectCache(base, keep, maxReq)
		cachePath := filepath.Join(base, puCacheID(pu, project))
		if pathExists(stage) {
			if pathExists(cachePath) {
				d.Log.Warn("rewriting cache, performance may suffer", "path", cachePath)
				_ = os.RemoveAll(cachePath)
			}
			if err := os.Rename(stage, cachePath); err != nil {
				d.Log.Error("could not save project cache", "path", cachePath, "err", err)
			} else {
				refresh := requirementsRefreshLaunchTypes[pu.LaunchType]
				d.syncRequirementsCache(base, cachePath, refresh)
				if refresh {
					_, _ = d.DB.Pool.Exec(ctx, `UPDATE main_project SET requirements_generation = $2 WHERE unifiedjobtemplate_ptr_id = $1 AND requirements_generation < $2`, project.ID, pu.ID)
				}
				if r.requirementsGeneration != nil {
					if err := writeJobFile(cachePath, filepath.Join(cachePath, ".requirements_generation"), []byte(fmt.Sprint(*r.requirementsGeneration)), 0o644); err != nil {
						d.Log.Warn("could not record the requirements generation", "path", cachePath)
					}
				}
			}
		}
	} else if pathExists(stage) {
		_ = os.RemoveAll(stage)
	}
	if r.jobPDD != "" && status == "successful" {
		if err := d.makeLocalCopy(ctx, pu.LocalPath, puCacheID(pu, project), r.jobPDD); err != nil {
			d.Log.Error("could not copy the project for the job", "project_update", pu.ID, "err", err)
		}
	}
}

// finish records the final state; a check update also records the
// project's revision and the playbooks and inventories it found.
func (r *puRun) finish(status string) error {
	d, pu, project := r.d, r.pu, r.project
	ctx := r.ctx
	// The project's own status is its last update's (Project._get_current_status).
	var template *int64
	if project != nil {
		template = &project.ID
	}
	return r.finishUnified(status, time.Now(), template, status, func(tx pgx.Tx) error {
		if project == nil || pu.JobType != "check" || status == "failed" || status == "canceled" {
			return nil
		}
		revision := project.SCMRevision
		if r.newRevision != "" {
			revision = r.newRevision
		} else if status == "successful" {
			d.Log.Error("could not find scm revision in check", "project_update", pu.ID)
		}
		path := models.ProjectPath(d.Cfg.ProjectsRoot, project.LocalPath)
		pb, _ := json.Marshal(models.ProjectPlaybooks(path, d.Settings.Bool(ctx, "ASCENDER_SHOW_PLAYBOOK_LINKS")))
		inv, _ := json.Marshal(models.InventoryFiles(path))
		_, err := tx.Exec(ctx, `UPDATE main_project SET scm_revision = $2, playbook_files = $3::jsonb, inventory_files = $4::jsonb WHERE unifiedjobtemplate_ptr_id = $1`, project.ID, revision, string(pb), string(inv))
		return err
	})
}
