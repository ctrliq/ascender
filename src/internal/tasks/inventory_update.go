package tasks

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"gopkg.in/yaml.v3"

	"github.com/ctrliq/ascender/internal/api"
	"github.com/ctrliq/ascender/internal/extlog"
	"github.com/ctrliq/ascender/internal/models"
)

// This file is the port of RunInventoryUpdate (main/tasks/jobs.py) and the
// inventory source injectors (InventorySourceOptions.injectors in
// main/models/inventory.py): ansible-inventory runs in the execution
// environment and its JSON output is imported into the database.

// standardInventoryUpdateEnv is STANDARD_INVENTORY_UPDATE_ENV.
var standardInventoryUpdateEnv = map[string]string{
	"ANSIBLE_INVENTORY_UNPARSED_FAILED": "True",
	"ANSIBLE_INVENTORY_EXPORT":          "True",
	"ANSIBLE_VERBOSE_TO_STDERR":         "True",
	"ANSIBLE_HOST_PATTERN_MISMATCH":     "error",
}

// sourceInjector describes PluginFileInjector subclasses.
type sourceInjector struct {
	plugin       string // plugin_name
	baseInjector string // "managed", "template" or ""
	namespace    string
	collection   string
	useFQCN      bool
	alternates   map[string]bool
	jinjaNative  bool
}

var sourceInjectors = map[string]sourceInjector{
	"azure_rm":    {plugin: "azure_rm", baseInjector: "managed", namespace: "azure", collection: "azcollection", jinjaNative: true},
	"ec2":         {plugin: "aws_ec2", baseInjector: "managed", namespace: "amazon", collection: "aws", jinjaNative: true},
	"gce":         {plugin: "gcp_compute", baseInjector: "managed", namespace: "google", collection: "cloud", jinjaNative: true},
	"vmware":      {plugin: "vmware_vm_inventory", baseInjector: "managed", namespace: "community", collection: "vmware", useFQCN: true, alternates: map[string]bool{"vmware.vmware.vms": true}},
	"openstack":   {plugin: "openstack", namespace: "openstack", collection: "cloud"},
	"satellite6":  {plugin: "foreman", namespace: "theforeman", collection: "foreman", useFQCN: true},
	"terraform":   {plugin: "terraform_state", baseInjector: "managed", namespace: "cloud", collection: "terraform", useFQCN: true},
	"ascender":    {plugin: "controller", baseInjector: "template", namespace: "ctrliq", collection: "ascender", useFQCN: true},
	"netbox":      {plugin: "nb_inventory", baseInjector: "template", namespace: "netbox", collection: "netbox", useFQCN: true},
	"constructed": {plugin: "constructed", namespace: "ansible", collection: "builtin"},
}

// alternatePlugin is get_alternate_plugin.
func (si sourceInjector) alternatePlugin(vars map[string]any) string {
	if p, ok := vars["plugin"].(string); ok && si.alternates[p] {
		return p
	}
	return ""
}

// filename is get_filename: the name verify_file() demands.
func (si sourceInjector) filename(vars map[string]any) string {
	if alt := si.alternatePlugin(vars); alt != "" {
		parts := strings.Split(alt, ".")
		return parts[len(parts)-1] + ".yml"
	}
	return si.plugin + ".yml"
}

// invUpdateRun is the state of one inventory update.
type invUpdateRun struct {
	baseRun
	iu        *models.InventoryUpdate
	src       *models.InventorySource
	inventory *models.Inventory

	dependencyPU *int64
}

// runInventoryUpdate executes one inventory update.
func (d *Dispatcher) runInventoryUpdate(jobCtx, bg context.Context, id int64) (err error) {
	iu, err := models.GetInventoryUpdate(bg, d.DB.Pool, id)
	if err != nil {
		return err
	}
	r := &invUpdateRun{baseRun: d.newBaseRun(bg, id, "inventory_update", "main.inventoryupdate"), iu: iu}
	defer r.recoverPanic("inventory update", r.finish, &err)
	if err := r.startable("inventory update", &iu.Status, iu.CancelFlag); err != nil {
		return err
	}
	if iu.InventorySourceID != nil {
		r.src, _ = models.GetInventorySource(bg, d.DB.Pool, *iu.InventorySourceID)
	}
	if iu.InventoryID != nil {
		r.inventory, _ = models.GetInventory(bg, d.DB.Pool, *iu.InventoryID)
	}
	r.executionEnvironment(&iu.ExecutionEnvironmentID, func() *int64 {
		if r.src == nil {
			return nil
		}
		kind := ""
		if r.inventory != nil {
			kind = r.inventory.Kind
		}
		return d.API.ResolveSourceEnvironment(bg, r.src, kind)
	})
	return r.runTask(jobCtx, runSteps{what: "inventory update", group: d.jobInstanceGroup(bg, id), template: iu.UnifiedJobTemplateID,
		dependencies: r.runDependencies, place: r.placeOnGroup, execute: r.execute, finish: r.finish,
		tracebackFor: func(_, msg string) bool { return msg == "" }})
}

// runDependencies is gen_dep_for_inventory_update: an update from a project
// that updates on launch runs that project's update first.
func (r *invUpdateRun) runDependencies(jobCtx context.Context) (string, error) {
	d, iu := r.d, r.iu
	ctx := r.ctx
	defer func() {
		_, _ = d.DB.Pool.Exec(ctx, `UPDATE main_unifiedjob SET dependencies_processed = true WHERE id = $1`, iu.ID)
	}()
	if iu.Source != "scm" || r.src == nil || r.src.SourceProjectID == nil || iu.DependenciesProcessed {
		return "", nil
	}
	project, err := models.GetProject(ctx, d.DB.Pool, *r.src.SourceProjectID)
	if err != nil || !project.SCMUpdateOnLaunch {
		return "", nil
	}
	puID, st, err := r.projectUpdateDependency(jobCtx, project)
	if err != nil || st != "" {
		return st, err
	}
	if puID != 0 {
		r.dependencyPU = &puID
	}
	return "", nil
}

// cloudCredential is get_cloud_credential; extra are the credentials that
// inject themselves (get_extra_credentials).
func (r *invUpdateRun) cloudCredential(creds []*credentialData) (cloud *credentialData, extra []*credentialData) {
	source := r.iu.Source
	for _, c := range creds {
		if cloudProvidersRun[source] {
			if c.Namespace == strings.ReplaceAll(source, "ec2", "aws") {
				cloud = c
				break
			}
		} else if c.Kind != "vault" {
			cloud = c
			break
		}
	}
	for _, c := range creds {
		if !cloudProvidersRun[source] || cloud == nil || c.ID != cloud.ID {
			extra = append(extra, c)
		}
	}
	return cloud, extra
}

var cloudProvidersRun = map[string]bool{"azure_rm": true, "ec2": true, "gce": true, "vmware": true, "openstack": true, "satellite6": true, "ascender": true, "terraform": true, "netbox": true}

// execute runs the update and returns its final status.
func (r *invUpdateRun) execute(jobCtx context.Context) (string, error) {
	d, iu := r.d, r.iu
	ctx := r.ctx
	d.lifecycle(ctx, iu.ID, "pre_run")
	if r.inventory == nil {
		return "error", fmt.Errorf("Inventory Source is not associated with an Inventory.")
	}
	if r.ee == nil {
		r.explain("Job could not start because no Execution Environment could be found.")
		return "error", nil
	}
	if iu.Source == "file" {
		return "error", fmt.Errorf("Cannot update file sources through the task system.")
	}
	iu.Started = &r.started
	if err := models.EnsureEventPartition(ctx, d.DB.Pool, "main_inventoryupdateevent", iu.Created); err != nil {
		return "error", err
	}
	cleanup, err := r.preparePDD("inventory", "env", "cp", "project", "artifacts")
	if err != nil {
		return "error", err
	}
	defer cleanup()
	pdd := r.pdd

	// build_project_dir
	if iu.Source == "scm" {
		if r.src == nil || r.src.SourceProjectID == nil {
			return "error", fmt.Errorf("Could not find project to run SCM inventory update from.")
		}
		project, err := models.GetProject(ctx, d.DB.Pool, *r.src.SourceProjectID)
		if err != nil {
			return "error", fmt.Errorf("Could not find project to run SCM inventory update from.")
		}
		linked := false
		ps := &projectSync{d: d, ctx: ctx, project: project, jobID: iu.ID, pdd: pdd, scmBranch: r.src.SCMBranch, eeID: iu.ExecutionEnvironmentID,
			forceSync: r.dependencyPU == nil,
			link: func(puID int64) {
				linked = true
				_, _ = d.DB.Pool.Exec(ctx, `UPDATE main_inventoryupdate SET source_project_update_id = $2 WHERE unifiedjob_ptr_id = $1`, iu.ID, puID)
			},
			explain: r.explain, log: r.log}
		rev, canceled, err := ps.run(jobCtx)
		if canceled {
			return "canceled", nil
		}
		if err != nil {
			return "failed", err
		}
		if !linked && r.dependencyPU != nil {
			_, _ = d.DB.Pool.Exec(ctx, `UPDATE main_inventoryupdate SET source_project_update_id = $2 WHERE unifiedjob_ptr_id = $1`, iu.ID, *r.dependencyPU)
		}
		iu.SCMRevision = rev
		_, _ = d.DB.Pool.Exec(ctx, `UPDATE main_inventoryupdate SET scm_revision = $2 WHERE unifiedjob_ptr_id = $1`, iu.ID, rev)
	}
	if jobCtx.Err() != nil {
		return r.preRunInterrupted(), nil
	}

	lookupCtx, stopLookup := cancelableBy(d.withWorkload(ctx, iu.ID, r.timeoutSeconds()), jobCtx)
	creds, err := d.loadJobCredentials(lookupCtx, iu.ID)
	stopLookup()
	if jobCtx.Err() != nil {
		return r.preRunInterrupted(), nil
	}
	if err != nil {
		return "error", err
	}
	cloud, extra := r.cloudCredential(creds)
	sourceVars, _ := parseVars(iu.SourceVars)
	if sourceVars == nil {
		sourceVars = map[string]any{}
	}

	// build_env
	env := r.baseEnv()
	env["INVENTORY_SOURCE_ID"] = fmt.Sprint(models.NullableID(iu.InventorySourceID))
	env["INVENTORY_UPDATE_ID"] = fmt.Sprint(iu.ID)
	for k, v := range standardInventoryUpdateEnv {
		env[k] = v
	}
	inj, hasInjector := sourceInjectors[iu.Source]
	ci := &credInjector{d: d, ctx: ctx, pdd: pdd, logf: r.log}
	if d.API != nil {
		ci.workload = d.API.NewWorkloadScope(r.iu.ID, r.timeoutSeconds())
	}
	if hasInjector {
		pluginEnv, err := r.pluginEnv(ci, inj, cloud, sourceVars)
		if err != nil {
			return "error", err
		}
		for k, v := range pluginEnv {
			env[k] = v
		}
		env["ANSIBLE_INVENTORY_ENABLED"] = "auto"
		if iu.Source == "constructed" {
			env["ANSIBLE_INVENTORY_ENABLED"] += ",script"
			env["ANSIBLE_INVENTORY_ANY_UNPARSED_IS_FAILED"] = "True"
		}
	}
	if iu.Source == "scm" {
		for k, v := range sourceVars {
			if _, set := env[k]; !set && !map[string]bool{"HOME": true, "USER": true, "_": true, "TERM": true, "PATH": true}[k] {
				env[k] = pyStr(v)
			}
		}
	}
	paths := []string{"~/.ansible/collections", "/usr/share/ansible/collections"}
	if iu.Source == "scm" && (r.dependencyPU != nil || pathExists(filepath.Join(pdd, "requirements_collections"))) {
		cfg := readAnsibleConfig(filepath.Join(pdd, "project"), []string{"collections_paths"})
		if v, ok := env["ANSIBLE_COLLECTIONS_PATH"]; ok {
			for _, p := range strings.Split(v, ":") {
				if !contains(paths, p) {
					paths = append([]string{v}, paths...)
				}
			}
		} else if v, ok := cfg["collections_paths"]; ok {
			for _, p := range strings.Split(v, ":") {
				if !contains(paths, p) {
					paths = append([]string{v}, paths...)
				}
			}
		}
		paths = append([]string{"/runner/requirements_collections"}, paths...)
	} else if v, ok := env["ANSIBLE_COLLECTIONS_PATH"]; ok {
		paths = strings.Split(v, ":")
	}
	env["ANSIBLE_COLLECTIONS_PATH"] = strings.Join(append(paths, "/usr/share/automation-controller/collections"), ":")
	if d.Settings.Bool(ctx, "ENABLE_ANSIBLE_29") {
		env["ANSIBLE_COLLECTIONS_PATHS"] = env["ANSIBLE_COLLECTIONS_PATH"]
	}

	// build_args
	args := []string{"ansible-inventory", "--list", "--export"}
	var factHosts []*models.Host
	if r.inventory.Kind == "constructed" {
		d.lifecycle(ctx, iu.ID, "start_job_fact_cache")
		inputs, err := r.inputInventories()
		if err != nil {
			return "error", err
		}
		for _, in := range inputs {
			hosts, err := api.InventoryHostRows(ctx, d.DB.Pool, in, false)
			if err != nil {
				return "error", err
			}
			data, _, err := api.InventoryScriptData(ctx, d.DB.Pool, in, hosts, true, true)
			if err != nil {
				return "error", err
			}
			js, _ := json.Marshal(data)
			name := fmt.Sprintf("hosts_%d", in.ID)
			content := "#! /usr/bin/env python3\n# -*- coding: utf-8 -*-\nprint(" + pythonRepr(string(js)) + ")\n"
			if err := os.WriteFile(filepath.Join(pdd, "inventory", name), []byte(content), 0o700); err != nil {
				return "error", err
			}
			args = append(args, "-i", "/runner/inventory/"+name)
			all, err := api.InventoryHostRows(ctx, d.DB.Pool, in, true)
			if err != nil {
				return "error", err
			}
			factHosts = append(factHosts, all...)
		}
		timeout := time.Duration(d.Settings.Int(ctx, "ANSIBLE_FACT_CACHE_TIMEOUT")) * time.Second
		if err := startFactCache(d.Log, factHosts, r.artifactDir(), timeout, r.inventory.ID); err != nil {
			return "error", err
		}
	}
	var relPath string
	if hasInjector {
		contents := r.inventoryAsDict(inj, cloud, sourceVars, env)
		out, err := yaml.Marshal(contents)
		if err != nil {
			return "error", err
		}
		fn := inj.filename(sourceVars)
		if err := os.WriteFile(filepath.Join(pdd, "inventory", fn), out, 0o700); err != nil {
			return "error", err
		}
		relPath = filepath.Join("inventory", fn)
	} else if iu.Source == "scm" {
		relPath = filepath.Join("project", iu.SourcePath)
	}
	containerLocation := filepath.Join("/runner", relPath)
	args = append(args, "-i", containerLocation)
	if iu.Limit != "" {
		args = append(args, "--limit", iu.Limit)
	}
	args = append(args, "--output", filepath.Join("/runner/artifacts", fmt.Sprint(iu.ID), "output.json"))
	playbookDir := filepath.Dir(containerLocation)
	if st, err := os.Stat(filepath.Join(pdd, relPath)); err == nil && st.IsDir() {
		playbookDir = containerLocation
	}
	args = append(args, "--playbook-dir", playbookDir)
	if iu.Verbosity > 0 {
		n := iu.Verbosity*2 + 1
		if n > 5 {
			n = 5
		}
		args = append(args, "-"+strings.Repeat("v", int(n)))
	}
	_ = os.WriteFile(filepath.Join(pdd, "args"), []byte(strings.Join(args, " ")), 0o600)

	safeEnv := buildSafeEnv(env)
	for _, c := range extra {
		if err := ci.injectCredential(c, env, safeEnv, &args); err != nil {
			return "error", err
		}
	}

	// Execution environment parameters and runner's own additions.
	timeout := r.timeoutSeconds()
	cr, st, err := r.prepareContainer(jobCtx, env, safeEnv, timeout, containerOptions{factCache: r.inventory.Kind == "constructed", optionalCallback: true})
	if cr == nil {
		return st, err
	}
	defer cr.cleanup()
	cfg := cr.cfg
	cfg.Args = args
	if err := r.recordStart(cfg, safeEnv); err != nil {
		return "error", err
	}

	d.lifecycle(ctx, iu.ID, "preparing_playbook")
	d.lifecycle(ctx, iu.ID, "running_playbook")
	sink := newInvEventSink(ctx, d, iu)
	var res runnerResult
	var runErr error
	if r.worker() {
		// RunInventoryUpdate's args file: runner runs it as written.
		if err := os.WriteFile(filepath.Join(pdd, "args"), []byte(strings.Join(args, " ")), 0o600); err != nil {
			_ = sink.close()
			return "error", err
		}
		kw := workerKwargs(iu.ID, cr.workerEnv, nil, r.runnerSettings(timeout), nil)
		delete(kw, "inventory")
		if r.inventory.Kind == "constructed" {
			kw["fact_cache_type"] = "jsonfile"
		} else {
			kw["fact_cache_type"] = ""
		}
		var pr podResult
		pr, runErr = r.runWorker(jobCtx, kw, "", sink.handle)
		if r.hold.abandoned() {
			sink.abandon()
			return "", nil
		}
		res = pr.runnerResult
		if pr.Explanation != "" {
			r.explain(pr.Explanation)
		}
		if pr.Traceback != "" {
			r.traceback = pr.Traceback
		}
	} else {
		res, runErr = cfg.run(jobCtx, func(msg string, kv ...any) { r.log(msg, kv...) }, sink.handle)
		// Its work stopped with this task process and cannot be read
		// elsewhere; an inventory update repeats safely.
		if r.shutdownRequeue(res.Status, "its controller stopped while it ran on that node, and this kind of job can be run again") {
			sink.abandon()
			return "", nil
		}
	}
	if runErr != nil {
		_ = sink.close()
		return "error", runErr
	}
	status := r.mapRunnerStatus(res.Status)
	// post_run_hook: the output is imported into the database.
	d.lifecycle(ctx, iu.ID, "post_run")
	if status == "successful" {
		if st, err := r.importOutput(sink); err != nil {
			d.Log.Error("inventory import", "inventory_update", iu.ID, "err", err)
			status = st
		}
	}
	if err := sink.close(); err != nil {
		r.traceback = "Failed to save job events: " + err.Error()
	}
	r.recordAnsibleVersion()
	return status, nil
}

// importOutput reads output.json and runs perform_update with the options
// RunInventoryUpdate.post_run_hook built, logging into the job output.
func (r *invUpdateRun) importOutput(sink *invEventSink) (string, error) {
	iu := r.iu
	raw, err := readJobFile(r.pdd, filepath.Join(r.artifactDir(), "output.json"), maxInventoryOutput)
	if err != nil {
		r.explain("Error occured while saving inventory data, see traceback or server logs")
		r.traceback = err.Error()
		return "error", err
	}
	opts := importOptions{overwrite: iu.Overwrite, overwriteVars: iu.OverwriteVars, hostFilter: iu.HostFilter}
	defaults := sourceImportSettings[iu.Source]
	if iu.EnabledVar != "" {
		opts.enabledVar = iu.EnabledVar
		opts.enabledValue, opts.enabledValueSet = iu.EnabledValue, true
	} else {
		opts.enabledVar = defaults.enabledVar
		if defaults.enabledValue != "" {
			opts.enabledValue, opts.enabledValueSet = defaults.enabledValue, true
		}
	}
	opts.excludeEmptyGroups = defaults.excludeEmpty
	opts.instanceIDVar = defaults.instanceIDVar
	skip := []int{logWarning, logInfo, logDebug, 0}[min(int(iu.Verbosity), 3)]
	start := r.started
	if iu.Started != nil {
		start = *iu.Started
	}
	log := func(level int, format string, args ...any) {
		if level < skip {
			return
		}
		msg := fmt.Sprintf(format, args...)
		sink.emitLog(fmt.Sprintf("%9.3f %-8s %s", time.Since(start).Seconds(), levelNames[level], msg))
	}
	name := ""
	if r.src != nil {
		name = r.src.Name
	}
	if err := r.d.performUpdate(r.ctx, opts, raw, iu, r.inventory, name, log); err != nil {
		log(logError, "%s", err.Error())
		r.explain("Error occured while saving inventory data, see traceback or server logs")
		r.traceback = err.Error()
		return "error", err
	}
	return "successful", nil
}

// pluginEnv is get_plugin_env.
func (r *invUpdateRun) pluginEnv(ci *credInjector, inj sourceInjector, cloud *credentialData, sourceVars map[string]any) (map[string]string, error) {
	env := map[string]string{}
	if cloud != nil {
		if inj.baseInjector == "managed" || inj.baseInjector == "template" {
			env["INVENTORY_UPDATE_ID"] = fmt.Sprint(r.iu.ID)
		}
		switch inj.baseInjector {
		case "managed":
			kind := strings.ReplaceAll(r.iu.Source, "ec2", "aws")
			if cloud.Namespace == kind {
				if err := ci.builtinInjector(cloud, env); err != nil {
					return nil, err
				}
			}
		case "template":
			safe := map[string]string{}
			var args []string
			if err := ci.injectCredential(cloud, env, safe, &args); err != nil {
				return nil, err
			}
		}
	}
	if inj.jinjaNative {
		env["ANSIBLE_JINJA2_NATIVE"] = "True"
	}
	switch r.iu.Source {
	case "openstack":
		if cloud != nil {
			path, err := r.openstackCloudsFile(cloud, sourceVars)
			if err != nil {
				return nil, err
			}
			env["OS_CLIENT_CONFIG_FILE"] = toContainerPath(path, r.pdd)
		}
	case "satellite6":
		if cloud != nil {
			env["FOREMAN_SERVER"] = cloud.get("host")
			env["FOREMAN_USER"] = cloud.get("username")
			env["FOREMAN_PASSWORD"] = cloud.get("password")
		}
	}
	return env, nil
}

// openstackCloudsFile writes the clouds.yaml of the openstack injector,
// with the source's private and ansible settings.
func (r *invUpdateRun) openstackCloudsFile(c *credentialData, sourceVars map[string]any) (string, error) {
	auth := map[string]any{}
	useApp := c.has("application_credential_id") && c.has("application_credential_secret")
	auth["auth_url"] = c.get("host")
	if useApp {
		auth["application_credential_id"] = c.get("application_credential_id")
		auth["application_credential_secret"] = c.get("application_credential_secret")
	} else {
		auth["username"] = c.get("username")
		auth["password"] = c.get("password")
		auth["project_name"] = c.get("project")
		if c.has("project_domain_name") {
			auth["project_domain_name"] = c.get("project_domain_name")
		}
		if c.has("domain") {
			auth["domain_name"] = c.get("domain")
		}
	}
	verify := true
	if _, ok := c.inputs["verify_ssl"]; ok {
		verify = c.getBool("verify_ssl")
	}
	devstack := map[string]any{"auth": auth, "verify": verify}
	if useApp {
		devstack["auth_type"] = "v3applicationcredential"
	}
	if c.has("region") {
		devstack["region_name"] = c.get("region")
	}
	private := any(true)
	if v, ok := sourceVars["private"]; ok {
		private = v
	}
	devstack["private"] = private
	data := map[string]any{"clouds": map[string]any{"devstack": devstack}}
	ansibleVars := map[string]any{"use_hostnames": true, "expand_hostvars": false, "fail_on_errors": true}
	provided := false
	for k := range ansibleVars {
		if v, ok := sourceVars[k]; ok {
			ansibleVars[k] = v
			provided = true
		}
	}
	if provided {
		data["ansible"] = ansibleVars
	}
	out, err := yaml.Marshal(data)
	if err != nil {
		return "", err
	}
	return privateFile(r.pdd, "env", string(out), 0o600)
}

// inventoryAsDict is inventory_as_dict: the source variables with the
// plugin the injector selects.
func (r *invUpdateRun) inventoryAsDict(inj sourceInjector, cloud *credentialData, sourceVars map[string]any, env map[string]string) map[string]any {
	out := map[string]any{}
	for k, v := range sourceVars {
		out[k] = v
	}
	if inj.alternatePlugin(sourceVars) == "" {
		if inj.useFQCN {
			out["plugin"] = inj.namespace + "." + inj.collection + "." + inj.plugin
		} else {
			out["plugin"] = inj.plugin
		}
	}
	switch r.iu.Source {
	case "gce":
		if _, ok := out["projects"]; !ok {
			project := ""
			if cloud != nil {
				project = cloud.get("project")
			}
			out["projects"] = []any{project}
		}
	case "terraform":
		out["backend_config_files"] = env["TF_BACKEND_CONFIG_FILE"]
	case "netbox":
		// nb_inventory reads its endpoint and token from NETBOX_API and
		// NETBOX_TOKEN (the credential type's env injectors), but
		// validate_certs only from the inventory file: the credential's
		// Verify SSL goes there unless the source variables set it.
		if _, ok := out["validate_certs"]; !ok && cloud != nil {
			verify := true
			if _, ok := cloud.inputs["verify_ssl"]; ok {
				verify = cloud.getBool("verify_ssl")
			}
			out["validate_certs"] = verify
		}
		// Each host's NetBox identity, for the importer to match hosts by
		// (netboxInstanceIDVar), named after the NetBox the plugin reads:
		// api_endpoint in the source variables wins over NETBOX_API.
		host := ""
		if ep, ok := out["api_endpoint"].(string); ok && strings.TrimSpace(ep) != "" {
			host = ep
		} else if cloud != nil {
			host = cloud.get("host")
		}
		out["compose"] = netboxCompose(out["compose"], host)
	}
	return out
}

// inputInventories are a constructed inventory's input inventories in order.
func (r *invUpdateRun) inputInventories() ([]*models.Inventory, error) {
	ids, err := models.ScanIDs(r.ctx, r.d.DB.Pool, `SELECT input_inventory_id FROM main_inventoryconstructedinventorymembership WHERE constructed_inventory_id = $1 ORDER BY position, id`, r.inventory.ID)
	if err != nil {
		return nil, err
	}
	var out []*models.Inventory
	for _, id := range ids {
		inv, err := models.GetInventory(r.ctx, r.d.DB.Pool, id)
		if err != nil {
			return nil, err
		}
		out = append(out, inv)
	}
	return out, nil
}

func (r *invUpdateRun) timeoutSeconds() int64 {
	return r.timeoutFrom("DEFAULT_INVENTORY_UPDATE_TIMEOUT", r.iu.Timeout)
}

// finish stores the final status on the update, its source and inventory.
func (r *invUpdateRun) finish(status string) error {
	return r.finishUnified(status, time.Now(), r.iu.UnifiedJobTemplateID, status, func(tx pgx.Tx) error {
		if r.iu.InventoryID != nil {
			_ = models.UpdateInventoryComputedFields(r.ctx, tx, *r.iu.InventoryID)
		}
		return nil
	})
}

// --- events -------------------------------------------------------------------------

// invEventSink stores an inventory update's events (InventoryUpdateEvent):
// the runner's verbose lines, then the import log.
type invEventSink struct {
	d   *Dispatcher
	ctx context.Context
	iu  *models.InventoryUpdate

	mu      sync.Mutex
	pending []*invEvent
	// tries counts failed one-by-one saves (see saveEvents); only the
	// flushing goroutine uses it.
	tries   map[*invEvent]int
	counter int64
	line    int64
	count   int64
	lastErr error
	stop    chan struct{}
	done    chan struct{}
	// persisted are the counters of events a resumed read finds saved.
	persisted map[int64]bool
	// throttle holds back websocket messages over MAX_WEBSOCKET_EVENT_RATE.
	throttle *wsThrottle
}

// resumeFrom sets the sink up for a resumed read (see jobEventSink).
func (s *invEventSink) resumeFrom(persisted map[int64]bool) {
	s.mu.Lock()
	s.persisted = persisted
	s.count = int64(len(persisted))
	s.mu.Unlock()
}

// abandon stores what was received and stops without the summary.
func (s *invEventSink) abandon() {
	close(s.stop)
	<-s.done
}

type invEvent struct {
	created            time.Time
	data               string
	uuid, stdout       string
	counter, verbosity int64
	startLine, endLine int64
	// noCreated: the event came without a created time, which is left
	// out of the processing time metric.
	noCreated bool
	// skipWS: the throttle held back its websocket message.
	skipWS bool
}

func newInvEventSink(ctx context.Context, d *Dispatcher, iu *models.InventoryUpdate) *invEventSink {
	s := &invEventSink{d: d, ctx: ctx, iu: iu, throttle: newWSThrottle(ctx, d), stop: make(chan struct{}), done: make(chan struct{})}
	go func() {
		defer close(s.done)
		t := time.NewTicker(500 * time.Millisecond)
		defer t.Stop()
		for {
			select {
			case <-t.C:
				d.safely("inventory update event flush", func() { s.flush(false) })
			case <-s.stop:
				for more := true; more; {
					more = false
					d.safely("inventory update event flush", func() { more = s.flush(true) })
				}
				return
			}
		}
	}()
	return s
}

func (s *invEventSink) handle(ev runnerEvent) {
	event, _ := ev["event"].(string)
	if event == "EOF" || event == "keepalive" || event == "" {
		return
	}
	data, _ := ev["event_data"].(map[string]any)
	if data == nil {
		data = map[string]any{}
	}
	e := &invEvent{data: eventDataText(ev, data, extlog.GUID(s.ctx), false), counter: toInt(ev["counter"]), startLine: toInt(ev["start_line"]), endLine: toInt(ev["end_line"]), verbosity: toInt(ev["verbosity"])}
	e.uuid, _ = ev["uuid"].(string)
	e.stdout, _ = ev["stdout"].(string)
	if c, ok := ev["created"].(string); ok {
		e.created = parseEventTime(c)
	}
	if e.created.IsZero() {
		e.created = time.Now()
		e.noCreated = true
	}
	s.mu.Lock()
	if e.counter > s.counter {
		s.counter = e.counter
	}
	if e.endLine > s.line {
		s.line = e.endLine
	}
	if !s.persisted[e.counter] {
		e.skipWS = !s.throttle.emit("verbose", e.stdout, e.startLine, e.endLine)
		s.pending = append(s.pending, e)
		s.count++
		callbackMetrics.eventsReceived(1)
	}
	s.mu.Unlock()
}

// emitLog is SpecialInventoryHandler.emit: a verbose event per log line,
// numbered after the runner's events.
func (s *invEventSink) emitLog(msg string) {
	n := int64(len(strings.Split(strings.TrimSpace(msg), "\n")))
	s.mu.Lock()
	s.counter++
	e := &invEvent{created: time.Now(), data: "{}", stdout: msg, counter: s.counter, startLine: s.line, endLine: s.line + n}
	s.line += n
	e.skipWS = !s.throttle.emit("verbose", e.stdout, e.startLine, e.endLine)
	s.pending = append(s.pending, e)
	s.count++
	s.mu.Unlock()
	callbackMetrics.eventsReceived(1)
}

// flush stores the pending events; it reports whether events are kept
// for another try (see jobEventSink.flush).
func (s *invEventSink) flush(final bool) bool {
	s.mu.Lock()
	batch := s.pending
	s.pending = nil
	s.mu.Unlock()
	if len(batch) == 0 {
		return false
	}
	if s.tries == nil {
		s.tries = map[*invEvent]int{}
	}
	// modified is when the event was stored, as the callback receiver
	// set it at its flush; created stays the event's own time.
	now := time.Now()
	var processing time.Duration
	missing := 0
	for _, e := range batch {
		if e.noCreated {
			missing++
			e.noCreated = false
			continue
		}
		processing += now.Sub(e.created)
	}
	insert := func(e *invEvent) eventInsert {
		return eventInsert{`INSERT INTO main_inventoryupdateevent (created, modified, event_data, uuid, counter, stdout, verbosity, start_line, end_line, inventory_update_id, job_created)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) ON CONFLICT DO NOTHING RETURNING id`,
			[]any{e.created, now, e.data, e.uuid, e.counter, e.stdout, e.verbosity, e.startLine, e.endLine, s.iu.ID, s.iu.Created}}
	}
	logf := func(level, msg string, args ...any) {
		args = append([]any{"inventory_update", s.iu.ID}, args...)
		switch level {
		case "error":
			s.d.Log.Error(msg, args...)
		case "warn":
			s.d.Log.Warn(msg, args...)
		default:
			s.d.Log.Info(msg, args...)
		}
	}
	out := saveEvents(s.ctx, s.d.DB.Pool, batch, s.tries, insert, func(e *invEvent) bool { return stripNULs(&e.stdout) }, final, logf)
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
	broadcast := 0
	if s.d.API != nil {
		for i, e := range out.saved {
			if !e.skipWS {
				broadcast++
				s.d.API.EmitEventDetail(s.ctx, "main_inventoryupdateevent", out.ids[i], s.iu.ID, s.iu.Created, "verbose")
			}
		}
	}
	callbackMetrics.recordSave(out.bulk, out.singular, out.batchErrors, out.duplicates, out.dropped, out.took, broadcast, processing, missing)
	return len(out.retry) > 0
}

func (s *invEventSink) close() error {
	close(s.stop)
	<-s.done
	_, _ = s.d.DB.Pool.Exec(s.ctx, `UPDATE main_unifiedjob SET emitted_events = $2 WHERE id = $1`, s.iu.ID, s.count)
	if s.d.API != nil {
		s.d.API.EmitJobSummary(s.ctx, s.iu.ID, s.count)
	}
	return s.lastErr
}
