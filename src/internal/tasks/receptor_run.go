package tasks

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"
	"time"

	"gopkg.in/yaml.v3"

	"github.com/ctrliq/ascender/internal/api"
	"github.com/ctrliq/ascender/internal/models"
	"github.com/ctrliq/ascender/internal/receptor"
)

// Work on an execution node (AWXReceptorJob with the ansible-runner work
// type): the job's transmit stream goes to the node as a receptor work
// unit, signed when the mesh signs work; `ansible-runner worker` runs it
// there in the execution environment with podman, and the unit's results
// are the process stream read back here.

// meshAvailable reports whether this node has a receptor to reach
// execution nodes through.
func (d *Dispatcher) meshAvailable() bool {
	rc, err := d.receptorConfig()
	if err != nil {
		return false
	}
	_, err = os.Stat(rc.Socket)
	return err == nil
}

// remoteExecutionNode is the execution node the task manager chose for a
// task when that is another node reached over the mesh, or "".
func (d *Dispatcher) remoteExecutionNode(ctx context.Context, id int64) string {
	var node, nodeType string
	if err := d.DB.Pool.QueryRow(ctx, `SELECT COALESCE(uj.execution_node, ''), COALESCE(i.node_type, '') FROM main_unifiedjob uj
		LEFT JOIN main_instance i ON i.hostname = uj.execution_node WHERE uj.id = $1`, id).Scan(&node, &nodeType); err != nil {
		return ""
	}
	if node == "" || node == d.Cfg.ClusterHostID || nodeType != "execution" {
		return ""
	}
	return node
}

// workerMountTypes are CONTAINER_VOLUMES_MOUNT_TYPES.
var workerMountTypes = map[string]bool{"z": true, "O": true, "ro": true, "rw": true}

// eeWorkerParams is build_execution_environment_params: how the worker
// runs the execution environment with podman.
func (d *Dispatcher) eeWorkerParams(ctx context.Context, ee *models.ExecutionEnvironment) (map[string]any, error) {
	p := map[string]any{"container_image": ee.Image, "process_isolation": true, "process_isolation_executable": "podman"}
	opts := []any{"--user=root"}
	for _, o := range d.Settings.List(ctx, "DEFAULT_CONTAINER_RUN_OPTIONS") {
		opts = append(opts, fmt.Sprint(o))
	}
	if ee.CredentialID != nil {
		creds, err := d.loadCredentials(ctx, []int64{*ee.CredentialID})
		if err != nil || len(creds) == 0 {
			return nil, fmt.Errorf("execution environment credential: %v", err)
		}
		c := creds[0]
		if !c.has("host") || !c.has("username") || !c.has("password") {
			return nil, errors.New("Please recheck that your host, username, and password fields are all filled.")
		}
		var verify any
		if v, ok := c.inputs["verify_ssl"]; ok {
			verify = v
		}
		p["container_auth_data"] = map[string]any{"host": c.get("host"), "username": c.get("username"), "password": c.get("password"), "verify_ssl": verify}
	}
	if ee.Pull != "" {
		opts = append(opts, "--pull="+ee.Pull)
	}
	p["container_options"] = opts
	if paths := d.Settings.List(ctx, "ASCENDER_ISOLATION_SHOW_PATHS"); len(paths) > 0 {
		mounts := []any{}
		for _, raw := range paths {
			path := fmt.Sprint(raw)
			parts := strings.Split(path, ":")
			switch len(parts) {
			case 3:
				if !workerMountTypes[parts[2]] {
					d.Log.WarnContext(ctx, fmt.Sprintf("The path %s has volume mount type %s which is not supported. Using \"z\" instead.", path, parts[2]))
					parts[2] = "z"
				}
				mounts = append(mounts, strings.Join(parts, ":"))
			case 2:
				mounts = append(mounts, path+":z")
			default:
				mounts = append(mounts, path+":"+path+":z")
			}
		}
		p["container_volume_mounts"] = mounts
	}
	return p, nil
}

// runRemote runs one task's worker on an execution node.
func (d *Dispatcher) runRemote(jobCtx, ctx context.Context, hold *monitorHold, node string, jobID int64, ee *models.ExecutionEnvironment, pdd string, kw map[string]any, sshKey string, handler func(runnerEvent), log func(string, ...any)) (podResult, error) {
	fail := podResult{runnerResult: runnerResult{Status: "error", RC: -1}}
	rc, err := d.receptorConfig()
	if err != nil {
		return fail, err
	}
	ctx = d.withWorkload(ctx, jobID, 0)
	eeParams, err := d.eeWorkerParams(ctx, ee)
	if err != nil {
		return fail, err
	}
	for k, v := range eeParams {
		kw[k] = v
	}
	// On an execution node the private data directory goes once the job
	// is done; a hybrid node keeps it.
	params := "--private-data-dir=" + pdd
	if d.Settings.Bool(ctx, "ASCENDER_CLEANUP_PATHS") {
		params += " --delete"
	}
	p := d.newReceptorRun(ctx, hold, rc, node, "ansible-runner", map[string]string{"params": params}, jobID, pdd, kw, sshKey, handler, log)
	return p.run(jobCtx)
}

// localWorkOnReceptor reports whether what this node runs itself goes to
// its receptor as `local` work. On Kubernetes it does (IS_K8S), as in the
// old application: the task container has no container runtime to start an
// execution environment with, and the receptor beside it runs
// `ansible-runner worker` in the control plane execution environment
// instead, with the projects directory mounted at the same path.
func (d *Dispatcher) localWorkOnReceptor(ctx context.Context) bool {
	return d.Settings.Bool(ctx, "IS_K8S")
}

// runLocalWork runs one task's worker as `local` work of this node's own
// receptor (AWXReceptorJob with the local work type on Kubernetes, where
// the whole private data directory is transmitted: the worker does not
// share this process's files). The worker's copy of the directory goes when
// it is done, where paths are cleaned up; the old application left it in
// the receptor's container until the pod was replaced.
func (d *Dispatcher) runLocalWork(jobCtx, ctx context.Context, hold *monitorHold, jobID int64, pdd string, kw map[string]any, sshKey string, handler func(runnerEvent), log func(string, ...any)) (podResult, error) {
	fail := podResult{runnerResult: runnerResult{Status: "error", RC: -1}}
	rc, err := d.receptorConfig()
	if err != nil {
		return fail, err
	}
	ctx = d.withWorkload(ctx, jobID, 0)
	params := "--private-data-dir=" + pdd
	if d.Settings.Bool(ctx, "ASCENDER_CLEANUP_PATHS") {
		params += " --delete"
	}
	p := d.newReceptorRun(ctx, hold, rc, "", "local", map[string]string{"params": params}, jobID, pdd, kw, sshKey, handler, log)
	return p.run(jobCtx)
}

// runMeshPod runs one task's worker in a pod of a container group behind
// a mesh node: that node's receptor makes the pod in its own cluster with
// its own service account (kubernetes-incluster-auth) from the spec sent
// as a secret parameter, which receptor sends over TLS only.
func (d *Dispatcher) runMeshPod(jobCtx, ctx context.Context, hold *monitorHold, cg *containerGroup, jobID int64, ee *models.ExecutionEnvironment, pdd string, kw map[string]any, sshKey string, handler func(runnerEvent), log func(string, ...any)) (podResult, error) {
	fail := podResult{runnerResult: runnerResult{Status: "error", RC: -1}}
	rc, err := d.receptorConfig()
	if err != nil {
		return fail, err
	}
	ctx = d.withWorkload(ctx, jobID, 0)
	spec, err := d.podDefinition(ctx, cg, jobID, ee, nil)
	if err != nil {
		return podResult{runnerResult: fail.runnerResult, Explanation: err.Error()}, nil
	}
	y, err := yaml.Marshal(spec)
	if err != nil {
		return fail, err
	}
	params := map[string]string{"secret_kube_pod": "---\n" + string(y), "pod_pending_timeout": podPendingTimeoutSetting()}
	p := d.newReceptorRun(ctx, hold, rc, cg.MeshNode, "kubernetes-incluster-auth", params, jobID, pdd, kw, sshKey, handler, log)
	p.requireTLS = true
	return p.run(jobCtx)
}

// newReceptorRun is a task's work unit of workType on node.
func (d *Dispatcher) newReceptorRun(ctx context.Context, hold *monitorHold, rc *receptor.Config, node, workType string, params map[string]string, jobID int64, pdd string, kw map[string]any, sshKey string, handler func(runnerEvent), log func(string, ...any)) *receptorRun {
	if hold == nil {
		hold = &monitorHold{d: d, jobID: jobID, canDetach: true, canRequeue: true}
	}
	return &receptorRun{ctx: ctx, hold: hold, rc: rc, node: node, workType: workType, params: params, pdd: pdd, ident: fmt.Sprint(jobID), kwargs: kw, sshKey: sshKey,
		release: d.releaseWork(ctx), log: log, handler: handler,
		onStatus: func(st map[string]any) { d.recordStarting(ctx, jobID, st) },
		onUnit: func(unit string) {
			log("work unit id received", "work_unit_id", unit)
			d.lifecycle(ctx, jobID, "work_unit_id_received")
			_, _ = d.DB.Pool.Exec(ctx, `UPDATE main_unifiedjob SET work_unit_id = $2 WHERE id = $1`, jobID, unit)
			d.lifecycle(ctx, jobID, "work_unit_id_assigned")
		}}
}

// runErrorExplanation is the job explanation BaseTask.run gave the
// errors it caught by kind, or "" for one that is a traceback.
func runErrorExplanation(err error) string {
	var wiErr *api.WorkloadIdentityError
	if errors.As(err, &wiErr) {
		return "Could not issue a workload identity token for this job: " + wiErr.Msg
	}
	var nf *receptor.NodeNotFound
	if errors.As(err, &nf) {
		return nf.Error()
	}
	return ""
}

// releaseWork is the RECEPTOR_RELEASE_WORK setting (Settings > Debug):
// when it is off, finished work units and container group pods are kept
// for debugging, and the work unit reaper leaves them alone.
func (d *Dispatcher) releaseWork(ctx context.Context) bool {
	return d.Settings.Bool(ctx, "RECEPTOR_RELEASE_WORK")
}

// receptorRun is one task's work unit.
type receptorRun struct {
	ctx      context.Context
	hold     *monitorHold
	rc       *receptor.Config
	node     string
	workType string
	params   map[string]string
	// requireTLS: the unit carries secret parameters, which receptor only
	// sends over a TLS connection.
	requireTLS bool
	pdd        string
	ident      string
	kwargs     map[string]any
	sshKey     string
	release    bool
	log        func(string, ...any)
	onStatus   func(map[string]any)
	handler    func(runnerEvent)
	onUnit     func(string)
}

// run transmits the task to its node and processes the unit's results.
func (p *receptorRun) run(jobCtx context.Context) (podResult, error) {
	res := podResult{runnerResult: runnerResult{Status: "error", RC: -1}}
	tls := ""
	// Local work (no node) goes to the receptor on the control socket
	// itself: there is no node to find and no connection to it to secure.
	if p.node != "" {
		// A node missing from the mesh is a *receptor.NodeNotFound, which
		// becomes the job's explanation (runErrorExplanation).
		ad, err := p.rc.FindNode(jobCtx, p.node, p.rc.Logf)
		if err != nil {
			if jobCtx.Err() != nil {
				// A cancel or a shutdown while the node was looked for: the
				// work never had its payload (as shutdownBeforeReading).
				res.Status = "canceled"
				if d := p.hold.d; d.stopping() && !d.cancelRequested(p.ctx, p.hold.jobID) {
					p.hold.shutdownBeforeReading(func() bool { return true })
				}
				return res, nil
			}
			return res, err
		}
		if ad.ConnType == receptor.ConnStreamTLS {
			tls = p.rc.TLSClient
		} else if p.requireTLS {
			return res, fmt.Errorf("Mesh node %s must serve its control service over TLS to run the pods of a container group.", p.node)
		}
	}
	zipBuf, err := workerPayload(p.pdd, p.sshKey)
	if err != nil {
		return res, err
	}
	defer zipBuf.close()
	pr, pw := io.Pipe()
	go func() { _ = pw.CloseWithError(transmitWorker(pw, p.kwargs, zipBuf.reader(), zipBuf.size)) }()
	unit, err := p.rc.SubmitWork(receptor.SubmitOptions{WorkType: p.workType, Node: p.node, TLSClient: tls, SignWork: p.rc.WorkSigning, Params: p.params}, pr)
	_ = pr.Close()
	if err != nil {
		return res, err
	}
	p.onUnit(unit)
	// From here the job is monitored: leased to this task until its
	// output has been read.
	p.hold.startLease(p.ctx, "", "")
	art, err := resetArtifacts(p.pdd, p.ident)
	if err != nil {
		p.finishUnit(unit)
		return res, err
	}
	results, err := p.rc.Results(unit, 0)
	if err != nil {
		_ = p.rc.Cancel(unit)
		p.finishUnit(unit)
		return res, err
	}
	cr := &countingReader{r: results}
	w := workReader{r: cr, interrupt: func() { _ = results.Close() }, stalled: unitStalled(p.rc, unit, cr),
		stop: func() bool {
			// _stop_work: the unit is cancelled, then the stream dropped.
			if err := p.rc.Cancel(unit); err != nil {
				p.log(fmt.Sprintf("could not cancel work unit %s", unit), "err", err)
				return false
			}
			return true
		}}
	sr := p.hold.readWork(jobCtx, p.ctx, w, art, p.onStatus, p.handler, p.log)
	_ = results.Close()
	res = sr.podResult
	switch p.hold.outcome {
	case readDetached, readLost:
		// The unit runs on for the next monitor, or is another task's now.
		return res, nil
	case readStalled:
		// stalled_result: the job's result from the unit, not the stream.
		st, rc := unitFinalStatus(p.rc, unit)
		res.Status, res.RC = st, rc
		res.Explanation = fmt.Sprintf("The output of work unit %s stopped arriving after the unit finished; the final status was taken from the unit, which reported it as %s.", unit, st)
	case readCanceled, readShutdownCanceled, readRequeue:
		res.Status = "canceled"
	default:
		if !sr.gotEOF && res.Explanation == "" {
			res.Status = "error"
			res.Explanation = unexpectedEmptyLine
		}
		if res.Status == "error" && res.Traceback == "" {
			p.workError(unit, sr.events, &res)
		}
	}
	if !p.finishUnit(unit) {
		p.hold.outcome = readLost
		return res, nil
	}
	writeRunnerStatus(art, res.runnerResult)
	return res, nil
}

// finishUnit is the end of AWXReceptorJob.run: once this task is done with
// the unit, the lease is retired and the unit released; neither when
// another task claimed the job meanwhile (false).
func (p *receptorRun) finishUnit(unit string) bool {
	if !p.hold.retire(p.ctx) {
		return false
	}
	if p.release {
		if err := p.rc.Release(unit); err != nil {
			p.log(fmt.Sprintf("Error releasing work unit %s.", unit), "err", err)
		}
	}
	return true
}

// workError is _handle_work_error: why a unit failed, from its last
// output when it produced no events, or receptor's detail.
func (p *receptorRun) workError(unit string, events int, res *podResult) {
	ws, err := p.rc.WorkStatus(unit)
	if err != nil {
		p.log(fmt.Sprintf("An error was encountered while getting status for work unit %s", unit), "err", err)
		return
	}
	if p.hold.requeueForQuota(ws.Detail) {
		res.Status = "canceled"
		return
	}
	if ws.StateName == "Failed" && events == 0 {
		start := ws.StdoutSize - 1000
		if start < 0 {
			start = 0
		}
		if out, err := p.rc.Results(unit, start); err == nil {
			b := readAllTimeout(out, 30*time.Second)
			_ = out.Close()
			if len(b) > 0 {
				res.Traceback = "Worker output:\n" + string(b)
				return
			}
		}
	}
	if ws.Detail != "" {
		res.Traceback = "Receptor detail:\n" + ws.Detail
		return
	}
	p.log(fmt.Sprintf("No result details or output, status:\n%s", ws.StateName))
}

// readAllTimeout reads a finished unit's output, giving up after d.
func readAllTimeout(r io.ReadCloser, d time.Duration) []byte {
	done := make(chan []byte, 1)
	go func() {
		b, _ := io.ReadAll(r)
		done <- b
	}()
	select {
	case b := <-done:
		return b
	case <-time.After(d):
		_ = r.Close()
		return nil
	}
}

var lastWorkUnitReap time.Time

// reapWorkUnits is awx_receptor_workunit_reaper with
// administrative_workunit_reaper: every minute, the units of tasks that
// are no longer active are cancelled and released, and finished health
// checks and cleanups too.
func (d *Dispatcher) reapWorkUnits(ctx context.Context) {
	if time.Since(lastWorkUnitReap) < time.Minute || !d.releaseWork(ctx) {
		return
	}
	lastWorkUnitReap = time.Now()
	rc, err := d.receptorConfig()
	if err != nil {
		return
	}
	if _, err := os.Stat(rc.Socket); err != nil {
		return
	}
	list, err := rc.WorkList()
	if err != nil {
		d.Log.WarnContext(ctx, "receptor work list", "err", err)
		return
	}
	ids := make([]string, 0, len(list))
	for id := range list {
		ids = append(ids, id)
	}
	if len(ids) > 0 {
		rows, err := d.DB.Pool.Query(ctx, `SELECT id, work_unit_id FROM main_unifiedjob WHERE work_unit_id = ANY($1) AND status NOT IN ('new', 'pending', 'waiting', 'running')`, ids)
		if err == nil {
			type done struct {
				id   int64
				unit string
			}
			var reap []done
			for rows.Next() {
				var x done
				if rows.Scan(&x.id, &x.unit) == nil {
					reap = append(reap, x)
				}
			}
			rows.Close()
			for _, x := range reap {
				d.Log.DebugContext(ctx, fmt.Sprintf("job %d is not active, reaping receptor work unit %s", x.id, x.unit))
				_ = rc.Cancel(x.unit)
				_ = rc.Release(x.unit)
				delete(list, x.unit)
			}
		}
	}
	for unit, data := range list {
		extra := data["ExtraData"]
		state, _ := data["StateName"].(string)
		switch e := extra.(type) {
		case nil:
			continue
		case string:
			if state == "" || receptor.ActiveStates[state] {
				continue
			}
		case map[string]any:
			if e["RemoteWorkType"] != "ansible-runner" {
				continue
			}
			rp, _ := e["RemoteParams"].(map[string]any)
			params, _ := rp["params"].(string)
			if params == "" || !(params == "--worker-info" || strings.HasPrefix(params, "cleanup")) || receptor.ActiveStates[state] {
				continue
			}
			d.Log.InfoContext(ctx, fmt.Sprintf("Reaping orphaned work unit %s with params %s", unit, params))
		default:
			continue
		}
		_ = rc.Release(unit)
	}
}
