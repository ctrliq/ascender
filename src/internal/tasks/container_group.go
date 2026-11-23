package tasks

import (
	"archive/zip"
	"bufio"
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"gopkg.in/yaml.v3"

	"github.com/ctrliq/ascender/internal/models"
)

// Container groups (tasks/receptor.py AWXReceptorJob with the
// kubernetes-runtime-auth and kubernetes-incluster-auth work types): the
// job runs as `ansible-runner worker` in a pod made from the group's pod
// spec. The private data directory and the runner's arguments go in on
// the pod's stdin (ansible-runner's transmit stream) and the status,
// events and artifacts come back on its stdout (the process stream).

// containerGroup is a job's instance group when that is a container group.
type containerGroup struct {
	ID              int64
	Name            string
	CredentialID    *int64
	PodSpecOverride string
	// MeshNode is the hop node whose receptor runs the group's pods in
	// its own cluster, if any.
	MeshNode string
}

// containerGroupFor returns the container group igID names, or nil.
func (d *Dispatcher) containerGroupFor(ctx context.Context, igID *int64) (*containerGroup, error) {
	if igID == nil {
		return nil, nil
	}
	cg := &containerGroup{ID: *igID}
	var isCG bool
	var mesh *int64
	if err := d.DB.Pool.QueryRow(ctx, `SELECT name, is_container_group, credential_id, pod_spec_override, mesh_node_id FROM main_instancegroup WHERE id = $1`, *igID).
		Scan(&cg.Name, &isCG, &cg.CredentialID, &cg.PodSpecOverride, &mesh); err != nil || !isCG {
		return nil, err
	}
	if mesh != nil {
		if err := d.DB.Pool.QueryRow(ctx, `SELECT hostname FROM main_instance WHERE id = $1`, *mesh).Scan(&cg.MeshNode); err != nil {
			return nil, err
		}
	}
	return cg, nil
}

// deepmerge is utils.common.deepmerge: b wins, dicts merge key by key.
func deepmerge(a, b any) any {
	am, aok := a.(map[string]any)
	bm, bok := b.(map[string]any)
	if aok && bok {
		out := map[string]any{}
		for k, v := range am {
			out[k] = deepmerge(v, bm[k])
		}
		for k, v := range bm {
			if _, ok := am[k]; !ok {
				out[k] = deepmerge(nil, v)
			}
		}
		return out
	}
	if b == nil {
		return a
	}
	return b
}

// plainYAML turns yaml.v3's decoded values into JSON-shaped ones.
func plainYAML(v any) any {
	switch t := v.(type) {
	case map[string]any:
		for k, x := range t {
			t[k] = plainYAML(x)
		}
		return t
	case map[any]any:
		out := map[string]any{}
		for k, x := range t {
			out[fmt.Sprint(k)] = plainYAML(x)
		}
		return out
	case []any:
		for i, x := range t {
			t[i] = plainYAML(x)
		}
		return t
	}
	return v
}

// defaultPodSpec is get_default_pod_spec.
func (d *Dispatcher) defaultPodSpec(ctx context.Context, image string) map[string]any {
	label := os.Getenv("ASCENDER_CONTAINER_GROUP_DEFAULT_JOB_LABEL")
	if label == "" {
		label = "ansible_job"
	}
	ns := defaultPodNamespace()
	return map[string]any{
		"apiVersion": "v1",
		"kind":       "Pod",
		"metadata":   map[string]any{"namespace": ns, "labels": map[string]any{label: ""}},
		"spec": map[string]any{
			"serviceAccountName":           "default",
			"automountServiceAccountToken": false,
			"affinity": map[string]any{"podAntiAffinity": map[string]any{"preferredDuringSchedulingIgnoredDuringExecution": []any{
				map[string]any{"weight": 100, "podAffinityTerm": map[string]any{
					"labelSelector": map[string]any{"matchExpressions": []any{map[string]any{"key": label, "operator": "Exists"}}},
					"topologyKey":   "kubernetes.io/hostname",
				}},
			}}},
			"containers": []any{map[string]any{
				"image":     image,
				"name":      "worker",
				"args":      []any{"ansible-runner", "worker", "--private-data-dir=/runner"},
				"resources": map[string]any{"requests": map[string]any{"cpu": "250m", "memory": "100Mi"}},
			}},
		},
	}
}

var showPathColons = 2 // MAX_ISOLATED_PATH_COLON_DELIMITER

// podDefinition is AWXReceptorJob.pod_definition, with what receptor's
// kubernetes worker set on the pod: stdin open once, never restarted. For
// a group behind a mesh node it is the spec that node's receptor gets,
// which sets those itself; kube is nil then.
func (d *Dispatcher) podDefinition(ctx context.Context, cg *containerGroup, jobID int64, ee *models.ExecutionEnvironment, kube *kubeClient) (map[string]any, error) {
	override := map[string]any{}
	if strings.TrimSpace(cg.PodSpecOverride) != "" {
		var v any
		if err := yaml.Unmarshal([]byte(cg.PodSpecOverride), &v); err != nil {
			return nil, fmt.Errorf("pod spec override of %s: %w", cg.Name, err)
		}
		if m, ok := plainYAML(v).(map[string]any); ok {
			override = m
		}
	}
	spec, _ := deepmerge(d.defaultPodSpec(ctx, ee.Image), override).(map[string]any)
	mesh := cg.MeshNode != ""
	if mesh {
		// The default namespace belongs to this cluster and means nothing
		// on the one behind the mesh node, whose receptor's namespace
		// applies instead; so does an override that carries the default.
		ovMD, _ := override["metadata"].(map[string]any)
		ovNS, _ := ovMD["namespace"].(string)
		if ovNS == "" || ovNS == defaultPodNamespace() {
			if md, ok := spec["metadata"].(map[string]any); ok {
				delete(md, "namespace")
			}
		}
	}
	podSpec, _ := spec["spec"].(map[string]any)
	if podSpec == nil {
		return nil, errors.New("the pod spec has no spec")
	}
	containers, _ := podSpec["containers"].([]any)
	if len(containers) == 0 {
		return nil, errors.New("the pod spec has no containers")
	}
	c0, _ := containers[0].(map[string]any)
	if c0 == nil {
		return nil, errors.New("the pod spec's first container is not an object")
	}
	c0["image"] = ee.Image
	c0["args"] = []any{"ansible-runner", "worker", "--private-data-dir=/runner"}
	if ka := d.Settings.Int(ctx, "ASCENDER_RUNNER_KEEPALIVE_SECONDS"); ka > 0 {
		envs, _ := c0["env"].([]any)
		c0["env"] = append(envs, map[string]any{"name": "ANSIBLE_RUNNER_KEEPALIVE_SECONDS", "value": strconv.FormatInt(ka, 10)})
	}
	if p := map[string]string{"always": "Always", "missing": "IfNotPresent", "never": "Never"}[ee.Pull]; p != "" {
		c0["imagePullPolicy"] = p
	}
	if d.Settings.Bool(ctx, "ASCENDER_MOUNT_ISOLATED_PATHS_ON_K8S") {
		var vols, mounts []any
		for i, raw := range d.Settings.List(ctx, "ASCENDER_ISOLATION_SHOW_PATHS") {
			p := fmt.Sprint(raw)
			src, dest, opt := p, p, ""
			switch strings.Count(p, ":") {
			case showPathColons:
				parts := strings.SplitN(p, ":", 3)
				src, dest, opt = parts[0], parts[1], parts[2]
			case showPathColons - 1:
				parts := strings.SplitN(p, ":", 2)
				src, dest = parts[0], parts[1]
			}
			vols = append(vols, map[string]any{"name": fmt.Sprintf("volume-%d", i), "hostPath": map[string]any{"path": src}})
			mounts = append(mounts, map[string]any{"name": fmt.Sprintf("volume-%d", i), "mountPath": dest, "readOnly": opt == "ro"})
		}
		if len(vols) > 0 {
			existing, _ := podSpec["volumes"].([]any)
			podSpec["volumes"] = append(existing, vols...)
			em, _ := c0["volumeMounts"].([]any)
			c0["volumeMounts"] = append(em, mounts...)
		}
	}
	md, _ := spec["metadata"].(map[string]any)
	if md == nil {
		md = map[string]any{}
	}
	install := d.Settings.String(ctx, "INSTALL_UUID")
	if mesh {
		// The cluster's API is out of reach: a pull secret has to exist
		// there already and be named in the pod spec override.
		spec["metadata"] = deepmerge(md, map[string]any{"name": fmt.Sprintf("automation-job-%d", jobID), "labels": map[string]any{"ansible-awx": install, "ansible-awx-job-id": strconv.FormatInt(jobID, 10)}})
		return spec, nil
	}
	ns, _ := md["namespace"].(string)
	if ns == "" {
		ns = "default"
		md["namespace"] = ns
	}
	if ee.CredentialID != nil {
		name, err := d.imagePullSecret(ctx, kube, ns, ee)
		if err != nil {
			return nil, err
		}
		podSpec["imagePullSecrets"] = []any{map[string]any{"name": name}}
	}
	spec["metadata"] = deepmerge(md, map[string]any{"name": fmt.Sprintf("automation-job-%d", jobID), "labels": map[string]any{"ansible-awx": install, "ansible-awx-job-id": strconv.FormatInt(jobID, 10)},
		// Marks the pods this task runner made: its reaper leaves alone
		// any other controller's pods that share the install's labels.
		"annotations": map[string]any{podAnnotation: d.Cfg.ClusterHostID}})
	c0["stdin"], c0["stdinOnce"], c0["tty"] = true, true, false
	podSpec["restartPolicy"] = "Never"
	return spec, nil
}

// registryAuthConfig is the execution environment's registry credential as
// a docker config.json (podman's auth.json is the same file).
func (d *Dispatcher) registryAuthConfig(ctx context.Context, ee *models.ExecutionEnvironment) ([]byte, error) {
	creds, err := d.loadCredentials(ctx, []int64{*ee.CredentialID})
	if err != nil || len(creds) == 0 {
		return nil, fmt.Errorf("execution environment credential: %v", err)
	}
	rc := creds[0]
	host := rc.get("host")
	if u, err := url.Parse(host); err != nil || (u.Scheme == "" && !strings.HasPrefix(host, "//")) || u.Hostname() == "" {
		host = "https://" + host
	}
	u, _ := url.Parse(host)
	hostPort := u.Hostname()
	if u.Port() != "" {
		hostPort += ":" + u.Port()
	}
	auth := base64.StdEncoding.EncodeToString([]byte(rc.get("username") + ":" + rc.get("password")))
	return json.MarshalIndent(map[string]any{"auths": map[string]any{hostPort: map[string]any{"auth": auth}}}, "", "    ")
}

// imagePullSecret is PodManager.create_secret: a dockerconfigjson secret
// from the execution environment's registry credential, replaced when it
// changed.
func (d *Dispatcher) imagePullSecret(ctx context.Context, kube *kubeClient, ns string, ee *models.ExecutionEnvironment) (string, error) {
	cfg, err := d.registryAuthConfig(ctx, ee)
	if err != nil {
		return "", err
	}
	data := map[string]any{".dockerconfigjson": base64.StdEncoding.EncodeToString(cfg)}
	install := d.Settings.String(ctx, "INSTALL_UUID")
	if len(install) > 5 {
		install = install[:5]
	}
	name := fmt.Sprintf("automation-%s-image-pull-secret-%d", install, *ee.CredentialID)
	secret := map[string]any{"apiVersion": "v1", "kind": "Secret", "type": "kubernetes.io/dockerconfigjson", "metadata": map[string]any{"name": name}, "data": data}
	base := "/api/v1/namespaces/" + url.PathEscape(ns) + "/secrets"
	var existing struct {
		Data map[string]string `json:"data"`
	}
	err = kube.do(ctx, "GET", base+"/"+url.PathEscape(name), nil, &existing)
	var ke *kubeError
	switch {
	case err == nil:
		if existing.Data[".dockerconfigjson"] == data[".dockerconfigjson"] {
			return name, nil
		}
		_ = kube.do(ctx, "DELETE", base+"/"+url.PathEscape(name), nil, nil)
	case errors.As(err, &ke) && ke.Status == 404:
	case errors.As(err, &ke) && ke.Status == 403:
		return "", fmt.Errorf("Failed to create secret for container group because additional service account role rules are needed.  Add get, create and delete role rules for secret resources for your cluster credential.: %v", err)
	default:
		return "", fmt.Errorf("Invalid openshift or k8s cluster credential: %v", err)
	}
	if err := kube.do(ctx, "POST", base, secret, nil); err != nil {
		return "", fmt.Errorf("Failed to create imagePullSecret: %v", err)
	}
	return name, nil
}

// podRun is one job's pod.
type podRun struct {
	d         *Dispatcher
	ctx       context.Context
	hold      *monitorHold
	jobID     int64
	kube      *kubeClient
	spec      map[string]any
	ns, name  string
	container string
	pdd       string
	ident     string
	kwargs    map[string]any
	sshKey    string
	pending   time.Duration
	log       func(string, ...any)
	onStatus  func(map[string]any)
	handler   func(runnerEvent)
}

// podResult is the worker's final status with what it explained.
type podResult struct {
	runnerResult
	Explanation string
	Traceback   string
	// ArtifactsProcessed: the worker's artifacts arrived
	// (artifacts_processed).
	ArtifactsProcessed bool
}

// zipDir is stream_dir's archive: every file and directory under root
// with its mode, symlinks as links, pipes left out.
func zipDir(root string, w io.Writer) error {
	zw := zip.NewWriter(w)
	err := filepath.WalkDir(root, func(path string, de fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if path == root {
			return nil
		}
		rel, _ := filepath.Rel(root, path)
		info, err := os.Lstat(path)
		if err != nil {
			return err
		}
		if info.Mode()&os.ModeNamedPipe != 0 || info.Mode()&os.ModeSocket != 0 {
			return nil
		}
		hdr, err := zip.FileInfoHeader(info)
		if err != nil {
			return err
		}
		hdr.Name = filepath.ToSlash(rel)
		// zipfile's date_time is the local time (the reader takes it as its
		// own local time); FileInfoHeader's is UTC.
		hdr.Modified = info.ModTime().Local()
		if info.IsDir() {
			hdr.Name += "/"
			_, err = zw.CreateHeader(hdr)
			return err
		}
		if !info.Mode().IsRegular() && info.Mode()&os.ModeSymlink == 0 {
			// FIFOs, sockets and devices stay out of the payload.
			return nil
		}
		hdr.Method = zip.Deflate
		if info.Mode()&os.ModeSymlink != 0 {
			target, err := os.Readlink(path)
			if err != nil {
				return err
			}
			hdr.Method = zip.Store
			fw, err := zw.CreateHeader(hdr)
			if err != nil {
				return err
			}
			_, err = fw.Write([]byte(target))
			return err
		}
		fw, err := zw.CreateHeader(hdr)
		if err != nil {
			return err
		}
		f, err := os.Open(path)
		if err != nil {
			return err
		}
		defer f.Close()
		_, err = io.Copy(fw, f)
		return err
	})
	if err != nil {
		return err
	}
	return zw.Close()
}

// unzipDir is unstream_dir's extraction: modes, symlinks and the archived
// modification times kept (the fact cache tells new facts by them). The
// archive comes from the worker, which the job's playbook can write to,
// so everything is created through an os.Root on target: an entry can be
// a symlink, but nothing is ever written through one to outside target.
func unzipFrom(r io.ReaderAt, size int64, target string) error {
	zr, err := zip.NewReader(r, size)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(target, 0o700); err != nil {
		return err
	}
	root, err := os.OpenRoot(target)
	if err != nil {
		return err
	}
	defer root.Close()
	// An entry that cannot be written (one aimed outside target among
	// them) is skipped; the rest still land, and the first failure is
	// reported.
	var first error
	budget := int64(maxUnpacked)
	for _, f := range zr.File {
		if err := unzipEntry(root, f, &budget); err != nil && first == nil {
			first = err
		}
		if budget < 0 {
			return fmt.Errorf("the archive unpacks to more than %d bytes", maxUnpacked)
		}
	}
	return first
}

// unzipEntry writes one archive entry under root.
func unzipEntry(root *os.Root, f *zip.File, budget *int64) error {
	name := filepath.Clean(filepath.FromSlash(f.Name))
	if name == "." || !filepath.IsLocal(name) {
		return nil
	}
	mode := f.Mode()
	switch {
	case f.FileInfo().IsDir():
		return root.MkdirAll(name, 0o700)
	case mode&os.ModeSymlink != 0:
		rc, err := f.Open()
		if err != nil {
			return err
		}
		link, _ := io.ReadAll(io.LimitReader(rc, 4096))
		rc.Close()
		_ = root.Remove(name)
		_ = root.MkdirAll(filepath.Dir(name), 0o700)
		return root.Symlink(string(link), name)
	}
	if st, err := root.Lstat(name); err == nil && !st.Mode().IsRegular() && !st.IsDir() {
		// A FIFO (the ssh key's) or a link already there: replaced,
		// never written through.
		if err := root.Remove(name); err != nil {
			return err
		}
		if st.Mode()&os.ModeNamedPipe != 0 {
			return nil
		}
	}
	if err := root.MkdirAll(filepath.Dir(name), 0o700); err != nil {
		return err
	}
	rc, err := f.Open()
	if err != nil {
		return err
	}
	defer rc.Close()
	perm := mode.Perm()
	if perm == 0 {
		perm = 0o600
	}
	w, err := root.OpenFile(name, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, perm)
	if err != nil {
		return err
	}
	// The sizes in the archive are its own word: what is written is
	// counted as it is.
	n, err := io.Copy(w, io.LimitReader(rc, *budget+1))
	*budget -= n
	w.Close()
	if err != nil {
		return err
	}
	if *budget < 0 {
		_ = root.Remove(name)
		return fmt.Errorf("%s: the archive unpacks to more than %d bytes", f.Name, maxUnpacked)
	}
	_ = root.Chmod(name, perm)
	// time.mktime(info.date_time): the archived time read as local time.
	t := f.Modified
	if !f.Modified.IsZero() {
		t = time.Date(t.Year(), t.Month(), t.Day(), t.Hour(), t.Minute(), t.Second(), 0, time.Local)
	}
	_ = root.Chtimes(name, t, t)
	return nil
}

// waitRunning waits for the pod's first container to run, or reports why
// it will not.
func (p *podRun) waitRunning(ctx context.Context) error {
	deadline := time.Now().Add(p.pending)
	for {
		var pod struct {
			Status struct {
				Phase             string `json:"phase"`
				Message           string `json:"message"`
				Reason            string `json:"reason"`
				ContainerStatuses []struct {
					Name  string `json:"name"`
					State struct {
						Running    *struct{}                         `json:"running"`
						Waiting    *struct{ Reason, Message string } `json:"waiting"`
						Terminated *struct {
							Reason, Message string
							ExitCode        int `json:"exitCode"`
						} `json:"terminated"`
					} `json:"state"`
				} `json:"containerStatuses"`
			} `json:"status"`
		}
		if err := p.kube.do(ctx, "GET", "/api/v1/namespaces/"+url.PathEscape(p.ns)+"/pods/"+url.PathEscape(p.name), nil, &pod); err != nil {
			return err
		}
		for _, cs := range pod.Status.ContainerStatuses {
			if cs.Name != p.container {
				continue
			}
			if cs.State.Running != nil {
				return nil
			}
			if w := cs.State.Waiting; w != nil {
				switch w.Reason {
				case "ErrImagePull", "ImagePullBackOff", "InvalidImageName", "CreateContainerConfigError", "CreateContainerError", "ErrImageNeverPull":
					return fmt.Errorf("Error creating pod: container failed to start, %s: %s", w.Reason, w.Message)
				}
			}
			if t := cs.State.Terminated; t != nil {
				return fmt.Errorf("Error creating pod: container exited before it was attached to, %s (exit code %d): %s", t.Reason, t.ExitCode, t.Message)
			}
		}
		if pod.Status.Phase == "Failed" || pod.Status.Phase == "Succeeded" {
			return fmt.Errorf("Error creating pod: pod %s: %s %s", strings.ToLower(pod.Status.Phase), pod.Status.Reason, pod.Status.Message)
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("Pod was not ready within %s", p.pending)
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(time.Second):
		}
	}
}

func (p *podRun) deletePod() { p.deletePodOK() }

// deletePodOK deletes the pod; false when it could not be.
func (p *podRun) deletePodOK() bool {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	err := p.kube.do(ctx, "DELETE", "/api/v1/namespaces/"+url.PathEscape(p.ns)+"/pods/"+url.PathEscape(p.name), map[string]any{"propagationPolicy": "Background"}, nil)
	var ke *kubeError
	return err == nil || (errors.As(err, &ke) && ke.Status == 404)
}

// run creates the pod, transmits the job and processes the worker's
// stream until its eof.
func (p *podRun) run(jobCtx context.Context) (podResult, error) {
	res := podResult{runnerResult: runnerResult{Status: "error", RC: -1}}
	zipBuf, err := workerPayload(p.pdd, p.sshKey)
	if err != nil {
		return res, err
	}
	defer zipBuf.close()
	art, err := resetArtifacts(p.pdd, p.ident)
	if err != nil {
		return res, err
	}

	base := "/api/v1/namespaces/" + url.PathEscape(p.ns) + "/pods"
	if err := p.kube.do(p.ctx, "POST", base, p.spec, nil); err != nil {
		var ke *kubeError
		if errors.As(err, &ke) && ke.Status == 409 {
			// A pod left by an earlier attempt at this job, if this runner
			// made it: in a namespace shared with the old application, a
			// pod of the same name may be its job's, and is not this
			// runner's to delete.
			var existing struct {
				Metadata struct {
					Annotations map[string]string `json:"annotations"`
				} `json:"metadata"`
			}
			if gerr := p.kube.do(p.ctx, "GET", base+"/"+url.PathEscape(p.name), nil, &existing); gerr == nil && ownPod(existing.Metadata.Annotations) {
				p.deletePod()
				time.Sleep(3 * time.Second)
				err = p.kube.do(p.ctx, "POST", base, p.spec, nil)
			} else if gerr == nil {
				err = fmt.Errorf("a pod named %s, which this controller did not create, already exists in namespace %s", p.name, p.ns)
			}
		}
		if err != nil {
			if p.hold.requeueForQuota(err.Error()) {
				res.Status = "canceled"
				return res, nil
			}
			res.Explanation = "Error creating pod: " + err.Error()
			return res, nil
		}
	}
	p.log("container group pod created", "namespace", p.ns, "pod", p.name)
	// The job is leased to this task, with its pod, so that a later
	// reader finds the pod's log if this task is lost.
	p.hold.startLease(p.ctx, p.name, p.ns)
	// While the pod starts and the payload goes in, the lease is renewed
	// here; once the output is read, by the reader.
	var keeper *leaseKeeper
	if p.hold.leased {
		keeper = p.d.keepLease(p.ctx, p.jobID, p.hold.owner)
	}
	stopKeeper := func() bool {
		if keeper == nil {
			return false
		}
		k := keeper
		keeper = nil
		return k.close()
	}
	defer stopKeeper()
	// A pod left for the next monitor, or for the task that took the job
	// over, stays; any other is deleted at the end, unless
	// RECEPTOR_RELEASE_WORK is off: then a pod whose job ran its course is
	// kept for debugging, as an unreleased work unit kept it (a canceled
	// one still goes, as `work cancel` removed it), and reapPods leaves it.
	keep := false
	defer func() {
		if keep {
			return
		}
		if res.Status != "canceled" && p.d != nil && !p.d.releaseWork(context.Background()) {
			p.log("container group pod kept: RECEPTOR_RELEASE_WORK is off", "namespace", p.ns, "pod", p.name)
			return
		}
		p.deletePod()
	}()
	// interrupted answers a cancel or a shutdown that came before the
	// worker's output could be read.
	interrupted := func() (podResult, error) {
		res.Status = "canceled"
		if stopKeeper() {
			keep = true
			p.hold.outcome = readLost
			return res, nil
		}
		if p.d != nil && p.d.stopping() && !p.d.cancelRequested(p.ctx, p.jobID) {
			p.hold.shutdownBeforeReading(p.deletePodOK)
			if p.hold.outcome == readDetached {
				keep = true
				return res, nil
			}
		}
		if !p.hold.retire(p.ctx) {
			keep = true
			p.hold.outcome = readLost
		}
		return res, nil
	}

	if err := p.waitRunning(jobCtx); err != nil {
		if jobCtx.Err() != nil {
			return interrupted()
		}
		res.Explanation = err.Error()
		if stopKeeper() || !p.hold.retire(p.ctx) {
			keep = true
			p.hold.outcome = readLost
		}
		return res, nil
	}
	stream, err := p.kube.attach(jobCtx, p.ns, p.name, p.container)
	if err != nil {
		if jobCtx.Err() != nil {
			return interrupted()
		}
		res.Explanation = "Error attaching to pod: " + err.Error()
		if stopKeeper() || !p.hold.retire(p.ctx) {
			keep = true
			p.hold.outcome = readLost
		}
		return res, nil
	}
	defer stream.Close()

	go func() {
		w := stdinWriter{stream}
		if transmitWorker(w, p.kwargs, zipBuf.reader(), zipBuf.size) == nil {
			stream.CloseStdin()
		}
	}()

	w := workReader{r: stream.Stdout, interrupt: func() { stream.Close() }, stop: p.deletePodOK}
	if stopKeeper() {
		// Another task took the job while the pod started: it reads it.
		p.d.Log.Warn(fmt.Sprintf("unified job %d: its monitoring was taken over by another task while its pod started; this task stands down", p.jobID))
		stream.Close()
		keep = true
		p.hold.outcome = readLost
		return res, nil
	}
	sr := p.hold.readWork(jobCtx, p.ctx, w, art, p.onStatus, p.handler, p.log)
	res = sr.podResult
	switch p.hold.outcome {
	case readDetached, readLost:
		keep = true
		return res, nil
	case readCanceled, readShutdownCanceled, readRequeue:
		res.Status = "canceled"
	default:
		if !sr.gotEOF && res.Explanation == "" {
			res.Status = "error"
			res.Explanation = unexpectedEmptyLine
			if s := strings.TrimSpace(stream.Stderr()); s != "" {
				res.Traceback = s
			}
		}
	}
	if !p.hold.retire(p.ctx) {
		keep = true
		p.hold.outcome = readLost
		return res, nil
	}
	writeRunnerStatus(art, res.runnerResult)
	return res, nil
}

// stdinWriter writes to an attached pod's stdin.
type stdinWriter struct {
	s interface{ WriteStdin([]byte) error }
}

func (w stdinWriter) Write(b []byte) (int, error) {
	if err := w.s.WriteStdin(b); err != nil {
		return 0, err
	}
	return len(b), nil
}

// unexpectedEmptyLine is the Processor's complaint about a stream that
// ended without its eof.
const unexpectedEmptyLine = "Unexpected empty line encountered during worker stream. Worker did not produce events or streaming was aborted, check execution node health."

// payloadFile is the zip a worker is sent, kept in a file beside the
// private data directory (it holds the project copy, and could be large):
// mode 0600, removed by close.
type payloadFile struct {
	f    *os.File
	size int64
}

// reader reads the zip from its start (a retry sends it again).
func (p *payloadFile) reader() io.Reader { return io.NewSectionReader(p.f, 0, p.size) }

func (p *payloadFile) close() {
	name := p.f.Name()
	_ = p.f.Close()
	_ = os.Remove(name)
}

// workerPayload is stream_dir's zip of the private data directory, with
// the SSH key as env/ssh_key, which the worker loads into an agent.
func workerPayload(pdd, sshKey string) (*payloadFile, error) {
	keyFile := filepath.Join(pdd, "env", "ssh_key")
	if sshKey != "" {
		if err := os.MkdirAll(filepath.Dir(keyFile), 0o700); err != nil {
			return nil, err
		}
		if err := os.WriteFile(keyFile, []byte(sshKey), 0o600); err != nil {
			return nil, err
		}
	}
	f, err := os.CreateTemp(filepath.Dir(filepath.Clean(pdd)), ".payload-*.zip")
	if err != nil {
		if sshKey != "" {
			_ = os.Remove(keyFile)
		}
		return nil, err
	}
	p := &payloadFile{f: f}
	err = zipDir(pdd, f)
	if sshKey != "" {
		_ = os.Remove(keyFile)
	}
	if err == nil {
		p.size, err = f.Seek(0, io.SeekCurrent)
	}
	if err != nil {
		p.close()
		return nil, err
	}
	return p, nil
}

// resetArtifacts empties the job's artifacts once they are on their way
// to the worker: what comes back is what the worker left (a fact it
// cleared is a file missing), as _transmit_phase did for remote work.
func resetArtifacts(pdd, ident string) (string, error) {
	art := filepath.Join(pdd, "artifacts", ident)
	if err := os.RemoveAll(filepath.Join(pdd, "artifacts")); err != nil {
		return art, err
	}
	return art, os.MkdirAll(filepath.Join(art, "job_events"), 0o700)
}

// transmitWorker is Transmitter.run: the arguments, the directory, the
// end.
func transmitWorker(w io.Writer, kwargs map[string]any, zip io.Reader, size int64) error {
	kw, err := json.Marshal(map[string]any{"kwargs": kwargs})
	if err != nil {
		return err
	}
	for _, b := range [][]byte{append(kw, '\n'), []byte(fmt.Sprintf("{\"zipfile\": %d}\n", size))} {
		if _, err := w.Write(b); err != nil {
			return err
		}
	}
	enc := base64.NewEncoder(base64.StdEncoding, w)
	if _, err := io.Copy(enc, zip); err != nil {
		return err
	}
	if err := enc.Close(); err != nil {
		return err
	}
	_, err = w.Write([]byte("{\"eof\": true}\n"))
	return err
}

// workerStatuses are the statuses ansible-runner reports.
var workerStatuses = map[string]bool{"starting": true, "running": true, "successful": true, "failed": true, "canceled": true, "timeout": true, "error": true}

// streamResult is what the Processor read.
type streamResult struct {
	podResult
	gotEOF bool
	// events counts the job events the stream carried.
	events int
	// readErr is why reading stopped, when that was not the stream's end.
	readErr error
}

// processWorkerStream is Processor.run: status lines, events (also kept
// as job_events files), the artifacts and the eof.
func processWorkerStream(r io.Reader, art string, onStatus func(map[string]any), handler func(runnerEvent), log func(string, ...any)) streamResult {
	res := streamResult{podResult: podResult{runnerResult: runnerResult{Status: "error", RC: -1}}}
	br := bufio.NewReaderSize(r, 1<<20)
	for {
		line, err := readLimitedLine(br, maxStreamLine)
		if len(bytes.TrimSpace(line)) == 0 && err != nil {
			if !isEOF(err) {
				res.readErr = err
			}
			return res
		}
		var data map[string]any
		if jerr := json.Unmarshal(line, &data); jerr != nil {
			res.Status = "error"
			res.Explanation = fmt.Sprintf("Failed to JSON parse a line from worker stream. Error: %v Line with invalid JSON data: %s", jerr, truncate(string(line), 1000))
			return res
		}
		switch {
		case data["status"] != nil:
			// The worker's word, from a pod or node a job's image runs on:
			// only runner's statuses. "pending" would queue the job again,
			// anything else leave it without one.
			st, _ := data["status"].(string)
			if workerStatuses[st] {
				res.Status = st
			}
			if rc, ok := data["rc"]; ok && rc != nil {
				res.RC = int(toInt(rc))
			}
			if e, _ := data["job_explanation"].(string); e != "" {
				res.Explanation = e
			}
			if t, _ := data["result_traceback"].(string); t != "" {
				res.Traceback = t
			}
			if onStatus != nil {
				onStatus(data)
			}
		case data["zipfile"] != nil:
			n := toInt(data["zipfile"])
			if rerr := receiveArtifacts(br, n, art); rerr != nil {
				var ue *unpackError
				if !errors.As(rerr, &ue) {
					res.Status = "error"
					res.Explanation = "Failed to read the artifacts from the worker stream: " + rerr.Error()
					return res
				}
				log("artifacts", "err", ue.err)
			}
			res.ArtifactsProcessed = true
		case data["eof"] != nil:
			res.gotEOF = true
			return res
		case data["event"] == "keepalive":
		default:
			if c := toInt(data["counter"]); c == 0 || data["uuid"] == nil {
				break
			}
			ev := runnerEvent(data)
			b, merr := json.Marshal(ev)
			keepEventData(ev, line)
			if merr == nil {
				// The uuid is the worker's word: only a plain one names
				// the file.
				if uuid, _ := data["uuid"].(string); eventUUIDRe.MatchString(uuid) {
					_ = writeJobFile(art, filepath.Join(art, "job_events", fmt.Sprintf("%d-%s.json", toInt(data["counter"]), uuid)), b, 0o600)
				}
			}
			res.events++
			handler(ev)
		}
		if err != nil {
			if !isEOF(err) {
				res.readErr = err
			}
			return res
		}
	}
}

// writeRunnerStatus leaves the final status and rc in the artifacts, as
// runner did.
func writeRunnerStatus(art string, r runnerResult) {
	_ = writeJobFile(art, filepath.Join(art, "status"), []byte(r.Status), 0o600)
	_ = writeJobFile(art, filepath.Join(art, "rc"), []byte(strconv.Itoa(r.RC)), 0o600)
}

// base64Alphabet marks the bytes of the standard base64 alphabet.
var base64Alphabet = func() (t [256]bool) {
	for _, c := range []byte("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=") {
		t[c] = true
	}
	return
}()

// base64Text reads want characters of base64 text from br, skipping
// anything else (Base64IO ignores whitespace).
type base64Text struct {
	br   *bufio.Reader
	want int64
}

func (b *base64Text) Read(p []byte) (int, error) {
	if b.want <= 0 {
		return 0, io.EOF
	}
	n := 0
	for n < len(p) && b.want > 0 {
		c, err := b.br.ReadByte()
		if err != nil {
			if n > 0 {
				return n, nil
			}
			return 0, err
		}
		if base64Alphabet[c] {
			p[n] = c
			n++
			b.want--
		}
	}
	return n, nil
}

// readBase64To decodes the base64 text of n bytes from br into w, as it
// arrives: nothing the size of the archive is held in memory.
func readBase64To(br *bufio.Reader, n int64, w io.Writer) error {
	// n is the worker's word: bounded.
	if n < 0 || n > maxWorkerArtifacts {
		return fmt.Errorf("artifacts: invalid size %d", n)
	}
	got, err := io.Copy(w, base64.NewDecoder(base64.StdEncoding, &base64Text{br: br, want: 4 * ((n + 2) / 3)}))
	if err != nil {
		return err
	}
	if got != n {
		return fmt.Errorf("artifacts: %d bytes, %d expected", got, n)
	}
	return nil
}

// unpackError is an archive that arrived whole but did not unpack
// cleanly: logged, and the stream goes on.
type unpackError struct{ err error }

func (e *unpackError) Error() string { return e.err.Error() }

// receiveArtifacts reads the worker's artifacts archive (n bytes) into a
// temporary file beside the directory and unpacks it into art.
func receiveArtifacts(br *bufio.Reader, n int64, art string) error {
	f, err := os.CreateTemp(filepath.Dir(filepath.Clean(art)), ".artifacts-*.zip")
	if err != nil {
		return err
	}
	defer func() {
		_ = f.Close()
		_ = os.Remove(f.Name())
	}()
	if err := readBase64To(br, n, f); err != nil {
		return err
	}
	if err := unzipFrom(f, n, art); err != nil {
		return &unpackError{err}
	}
	return nil
}

func truncate(s string, n int) string {
	if len(s) > n {
		return s[:n]
	}
	return s
}

// runInContainerGroup runs the job as a worker in its container group or
// on its execution node: build_params' runner arguments, the pod from the
// group's spec or the work unit, and the worker's starting status
// recorded as the job's command, directory and environment.
func (r *jobRun) runInContainerGroup(jobCtx context.Context, env map[string]string, cmdline []string, settings map[string]any, prompts []expectPassword, sshKey string, handler func(runnerEvent)) (podResult, error) {
	kw := workerKwargs(r.job.ID, env, cmdline, settings, prompts)
	if r.adHoc != nil {
		kw["module"] = r.adHoc.ModuleName
		args := r.adHoc.ModuleArgs
		if r.d.Settings.String(r.ctx, "ALLOW_JINJA_IN_EXTRA_VARS") != "always" {
			var err error
			if args, err = sanitizeJinja(args); err != nil {
				return podResult{runnerResult: runnerResult{Status: "error", RC: -1}, Explanation: err.Error()}, nil
			}
		}
		kw["module_args"] = args
	} else if r.job.Playbook != "" {
		kw["playbook"] = r.job.Playbook
	}
	if r.job.UseFactCache && r.adHoc == nil {
		kw["fact_cache_type"] = "jsonfile"
	} else {
		kw["fact_cache_type"] = ""
	}
	if r.remote != "" {
		return r.d.runRemote(jobCtx, r.ctx, r.hold, r.remote, r.job.ID, r.ee, r.pdd, kw, sshKey, handler, r.log)
	}
	return r.d.runPod(jobCtx, r.ctx, r.hold, r.cg, r.job.ID, r.ee, r.pdd, kw, sshKey, handler, r.log)
}

// defaultPodNamespace is ASCENDER_CONTAINER_GROUP_DEFAULT_NAMESPACE.
func defaultPodNamespace() string {
	if ns := os.Getenv("MY_POD_NAMESPACE"); ns != "" {
		return ns
	}
	return "default"
}

// runPod runs one job's worker in a pod of its container group.
func (d *Dispatcher) runPod(jobCtx, ctx context.Context, hold *monitorHold, cg *containerGroup, jobID int64, ee *models.ExecutionEnvironment, pdd string, kw map[string]any, sshKey string, handler func(runnerEvent), log func(string, ...any)) (podResult, error) {
	fail := func(msg string) (podResult, error) {
		return podResult{runnerResult: runnerResult{Status: "error", RC: -1}, Explanation: msg}, nil
	}
	if cg.MeshNode != "" {
		return d.runMeshPod(jobCtx, ctx, hold, cg, jobID, ee, pdd, kw, sshKey, handler, log)
	}
	var cred *credentialData
	ctx = d.withWorkload(ctx, jobID, 0)
	if cg.CredentialID != nil {
		creds, err := d.loadCredentials(ctx, []int64{*cg.CredentialID})
		if err != nil || len(creds) == 0 {
			return fail(fmt.Sprintf("Container group %s: its credential could not be read: %v", cg.Name, err))
		}
		cred = creds[0]
	}
	kube, err := newKubeClient(cred)
	if err != nil {
		return fail(fmt.Sprintf("Container group %s: %v", cg.Name, err))
	}
	defer kube.close()
	spec, err := d.podDefinition(ctx, cg, jobID, ee, kube)
	if err != nil {
		return fail(err.Error())
	}
	md, _ := spec["metadata"].(map[string]any)
	ns, _ := md["namespace"].(string)
	name, _ := md["name"].(string)
	podSpec, _ := spec["spec"].(map[string]any)
	containers, _ := podSpec["containers"].([]any)
	c0, _ := containers[0].(map[string]any)
	container, _ := c0["name"].(string)
	if hold == nil {
		hold = &monitorHold{d: d, jobID: jobID, canDetach: true, canRequeue: true}
	}
	p := &podRun{d: d, ctx: ctx, hold: hold, jobID: jobID, kube: kube, spec: spec, ns: ns, name: name, container: container, pdd: pdd, ident: fmt.Sprint(jobID), kwargs: kw, sshKey: sshKey,
		pending: podPendingTimeout(), log: log, handler: handler, onStatus: func(st map[string]any) { d.recordStarting(ctx, jobID, st) }}
	return p.run(jobCtx)
}

// workerKwargs are the runner arguments every kind of job sends: the
// environment without HOME (a pod has its own), the command line,
// settings and prompts, with empty ones left out as build_params did.
func workerKwargs(ident int64, env map[string]string, cmdline []string, settings map[string]any, prompts []expectPassword) map[string]any {
	envvars := map[string]string{}
	for k, v := range env {
		if k != "HOME" {
			envvars[k] = v
		}
	}
	kw := map[string]any{"ident": ident, "inventory": "inventory", "envvars": envvars, "settings": settings}
	if len(cmdline) > 0 {
		kw["cmdline"] = args2cmdline(cmdline...)
	}
	if len(prompts) > 0 {
		pw := map[string]string{}
		for _, p := range prompts {
			pw[p.re.String()] = p.value
		}
		kw["passwords"] = pw
	}
	return kw
}

// podPendingTimeoutSetting is ASCENDER_CONTAINER_GROUP_POD_PENDING_TIMEOUT
// as written (receptor's pod_pending_timeout).
func podPendingTimeoutSetting() string {
	if v := os.Getenv("ASCENDER_CONTAINER_GROUP_POD_PENDING_TIMEOUT"); v != "" {
		return v
	}
	return "2h"
}

// podPendingTimeout is ASCENDER_CONTAINER_GROUP_POD_PENDING_TIMEOUT.
func podPendingTimeout() time.Duration {
	v := podPendingTimeoutSetting()
	d, err := time.ParseDuration(v)
	if err != nil || d <= 0 {
		return 2 * time.Hour
	}
	return d
}

// recordStarting is status_handler's starting: the command, directory
// and (redacted) environment the worker ran with.
func (d *Dispatcher) recordStarting(ctx context.Context, id int64, st map[string]any) {
	if st["status"] != "starting" {
		return
	}
	var cmd []string
	if list, ok := st["command"].([]any); ok {
		for _, c := range list {
			cmd = append(cmd, fmt.Sprint(c))
		}
	}
	cwd, _ := st["cwd"].(string)
	env := map[string]string{}
	if m, ok := st["env"].(map[string]any); ok {
		for k, v := range m {
			env[k] = fmt.Sprint(v)
		}
	}
	safe, _ := json.Marshal(mergeWorkerEnv(buildSafeEnv(env), d.storedJobEnv(ctx, id)))
	_, _ = d.DB.Pool.Exec(ctx, `UPDATE main_unifiedjob SET job_args = $2, job_cwd = $3, job_env = $4::jsonb, modified = now() WHERE id = $1`, id, pyJSONList(cmd), cwd, string(safe))
}

// storedJobEnv is the job_env recordStart wrote: the run's own safe
// environment, which hides every value a credential injected.
func (d *Dispatcher) storedJobEnv(ctx context.Context, id int64) map[string]string {
	var raw []byte
	if err := d.DB.Pool.QueryRow(ctx, `SELECT job_env FROM main_unifiedjob WHERE id = $1`, id).Scan(&raw); err != nil {
		return nil
	}
	var m map[string]any
	if json.Unmarshal(raw, &m) != nil {
		return nil
	}
	out := make(map[string]string, len(m))
	for k, v := range m {
		out[k] = fmt.Sprint(v)
	}
	return out
}

// mergeWorkerEnv is status_handler's job_env: the worker's environment,
// masked by name only (buildSafeEnv cannot know that GITHUB_PAT or SVC_PWD
// came from a credential), overlaid with the run's own safe environment,
// which masked every injected value. The run's values win.
func mergeWorkerEnv(worker, run map[string]string) map[string]string {
	out := make(map[string]string, len(worker)+len(run))
	for k, v := range worker {
		out[k] = v
	}
	for k, v := range run {
		out[k] = v
	}
	return out
}

// podAnnotation marks a pod this task runner created.
const podAnnotation = "ascender/controller-node"

// ownPod reports whether a pod's annotations mark it as this runner's.
func ownPod(annotations map[string]string) bool {
	return annotations[podAnnotation] != ""
}

var lastPodReap time.Time

// reapPods is awx_k8s_reaper: every minute, the pods of jobs that finished
// more than K8S_POD_REAPER_GRACE_PERIOD ago go, in every container group
// this runner can reach. Only pods this runner made are considered.
func (d *Dispatcher) reapPods(ctx context.Context) {
	if time.Since(lastPodReap) < time.Minute || !d.releaseWork(ctx) {
		return
	}
	lastPodReap = time.Now()
	install := d.Settings.String(ctx, "INSTALL_UUID")
	grace := 60 * time.Second
	if v := os.Getenv("K8S_POD_REAPER_GRACE_PERIOD"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			grace = time.Duration(n) * time.Second
		}
	}
	rows, err := d.DB.Pool.Query(ctx, `SELECT id FROM main_instancegroup WHERE is_container_group AND mesh_node_id IS NULL`)
	if err != nil {
		return
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
		cg, err := d.containerGroupFor(ctx, &id)
		if err != nil || cg == nil {
			continue
		}
		var cred *credentialData
		if cg.CredentialID != nil {
			creds, err := d.loadCredentials(ctx, []int64{*cg.CredentialID})
			if err != nil || len(creds) == 0 {
				continue
			}
			cred = creds[0]
		}
		kube, err := newKubeClient(cred)
		if err != nil {
			continue
		}
		// The namespace the group's pods go to.
		ns := "default"
		if def, err := d.podNamespace(ctx, cg); err == nil {
			ns = def
		}
		var list struct {
			Items []struct {
				Metadata struct {
					Name        string            `json:"name"`
					Labels      map[string]string `json:"labels"`
					Annotations map[string]string `json:"annotations"`
				} `json:"metadata"`
			} `json:"items"`
		}
		q := url.Values{"labelSelector": {"ansible-awx=" + install}}
		lctx, cancel := context.WithTimeout(ctx, 30*time.Second)
		err = kube.do(lctx, "GET", "/api/v1/namespaces/"+url.PathEscape(ns)+"/pods?"+q.Encode(), nil, &list)
		cancel()
		if err != nil {
			d.Log.WarnContext(ctx, "Failed to list pods for container group", "group", cg.Name, "err", err)
			kube.close()
			continue
		}
		for _, p := range list.Items {
			if !ownPod(p.Metadata.Annotations) {
				continue
			}
			jobID, err := strconv.ParseInt(p.Metadata.Labels["ansible-awx-job-id"], 10, 64)
			if err != nil {
				continue
			}
			var status string
			var finished *time.Time
			if err := d.DB.Pool.QueryRow(ctx, `SELECT status, finished FROM main_unifiedjob WHERE id = $1`, jobID).Scan(&status, &finished); err != nil {
				continue
			}
			if models.ActiveStatuses[status] || finished == nil || time.Since(*finished) < grace {
				continue
			}
			d.Log.InfoContext(ctx, "job is no longer active, reaping orphaned k8s pod", "job", jobID, "pod", p.Metadata.Name)
			pr := &podRun{kube: kube, ns: ns, name: p.Metadata.Name}
			pr.deletePod()
		}
		kube.close()
	}
}

// podNamespace is the namespace of a group's pod spec.
func (d *Dispatcher) podNamespace(ctx context.Context, cg *containerGroup) (string, error) {
	override := map[string]any{}
	if strings.TrimSpace(cg.PodSpecOverride) != "" {
		var v any
		if err := yaml.Unmarshal([]byte(cg.PodSpecOverride), &v); err != nil {
			return "", err
		}
		if m, ok := plainYAML(v).(map[string]any); ok {
			override = m
		}
	}
	spec, _ := deepmerge(d.defaultPodSpec(ctx, ""), override).(map[string]any)
	md, _ := spec["metadata"].(map[string]any)
	ns, _ := md["namespace"].(string)
	if ns == "" {
		ns = "default"
	}
	return ns, nil
}
