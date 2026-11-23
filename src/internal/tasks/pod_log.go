package tasks

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// Reading a container group job's output straight from its pod (the
// fork's tasks/streams.py PodLogStream). The pod outlives the task that
// created it, and its log holds the same `ansible-runner worker` stream
// the attach session carried. The kubelet serves it with a timestamp per
// line, which lets a dropped connection resume in place: it reopens from
// the second of the last line delivered and skips what that repeats,
// counting the lines delivered at the last timestamp. A connection silent
// for JOB_MONITOR_STREAM_IDLE_SECONDS is reopened the same way.

// workerContainer is the container receptor streamed, which the pod spec
// must contain.
const workerContainer = "worker"

// followReopenPause is how long to wait before reopening a followed log
// the kubelet ended while the pod still looks live.
const followReopenPause = time.Second

var podLogTimestampRe = regexp.MustCompile(`^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,9}))?(Z|[+-]\d\d:\d\d) `)

// errPodLogIncomplete is PodLogIncomplete: the last read of the pod's log
// broke off, so it was not read to its end; the resume tries again later.
var errPodLogIncomplete = errors.New("the pod's log could not be read to its end")

// kubePod is the part of a pod the monitor reads.
type kubePod struct {
	Metadata struct {
		Name              string    `json:"name"`
		Namespace         string    `json:"namespace"`
		CreationTimestamp time.Time `json:"creationTimestamp"`
	} `json:"metadata"`
	Spec struct {
		Containers []struct {
			Name string `json:"name"`
		} `json:"containers"`
	} `json:"spec"`
	Status struct {
		Phase             string `json:"phase"`
		ContainerStatuses []struct {
			Name  string `json:"name"`
			State struct {
				Running *struct {
					StartedAt time.Time `json:"startedAt"`
				} `json:"running"`
				Terminated *struct {
					ExitCode *int `json:"exitCode"`
				} `json:"terminated"`
			} `json:"state"`
		} `json:"containerStatuses"`
	} `json:"status"`
}

// workerStatus is the worker container's status, or the only container's.
func (p *kubePod) workerStatus() int {
	for i, cs := range p.Status.ContainerStatuses {
		if cs.Name == workerContainer {
			return i
		}
	}
	if len(p.Status.ContainerStatuses) > 0 {
		return 0
	}
	return -1
}

func (p *kubePod) terminated() bool {
	i := p.workerStatus()
	return i >= 0 && p.Status.ContainerStatuses[i].State.Terminated != nil
}

func (p *kubePod) startedAt() *time.Time {
	i := p.workerStatus()
	if i < 0 || p.Status.ContainerStatuses[i].State.Running == nil {
		return nil
	}
	t := p.Status.ContainerStatuses[i].State.Running.StartedAt
	return &t
}

// exitCode is pod_exit_code: the worker container's code once done.
func (p *kubePod) exitCode() int {
	if i := p.workerStatus(); i >= 0 {
		if t := p.Status.ContainerStatuses[i].State.Terminated; t != nil && t.ExitCode != nil {
			return *t.ExitCode
		}
	}
	if p.Status.Phase == "Succeeded" {
		return 0
	}
	return 1
}

func (p *kubePod) containerName() string {
	for _, c := range p.Spec.Containers {
		if c.Name == workerContainer {
			return workerContainer
		}
	}
	if len(p.Spec.Containers) > 0 {
		return p.Spec.Containers[0].Name
	}
	return workerContainer
}

// stream opens a streaming GET, without the client's overall timeout.
func (k *kubeClient) stream(ctx context.Context, path string) (io.ReadCloser, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", k.host.String()+path, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+k.token)
	// The API server answers a log request that accepts only text/plain
	// with 406.
	req.Header.Set("Accept", "application/json, */*")
	resp, err := (&http.Client{Transport: k.http.Transport}).Do(req)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode >= 300 {
		defer resp.Body.Close()
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
		var st struct {
			Message string `json:"message"`
		}
		_ = json.Unmarshal(b, &st)
		if st.Message == "" {
			st.Message = strings.TrimSpace(string(b))
		}
		return nil, &kubeError{resp.StatusCode, st.Message}
	}
	return resp.Body, nil
}

func isKube404(err error) bool {
	var ke *kubeError
	return errors.As(err, &ke) && ke.Status == 404
}

// podSource is a container group job's pod: found by the name on its
// lease, or by its labels when its controller died before recording it.
type podSource struct {
	d       *Dispatcher
	kube    *kubeClient
	jobID   int64
	name    string
	ns      string
	install string
	pod     *kubePod
}

func (s *podSource) kind() string { return "pod" }

func (s *podSource) podPath() string {
	return "/api/v1/namespaces/" + url.PathEscape(s.ns) + "/pods/" + url.PathEscape(s.name)
}

// newPodSource is the pod of a job in a container group this runner
// reaches through the cluster's API.
func (d *Dispatcher) newPodSource(ctx context.Context, j *monitoredJob) (*podSource, error) {
	cg, err := d.containerGroupFor(ctx, j.igID)
	if err != nil {
		return nil, err
	}
	if cg == nil {
		return nil, fmt.Errorf("unified job %d has no container group", j.id)
	}
	var cred *credentialData
	if cg.CredentialID != nil {
		creds, err := d.loadCredentials(d.withWorkload(ctx, j.id, 0), []int64{*cg.CredentialID})
		if err != nil || len(creds) == 0 {
			return nil, fmt.Errorf("container group %s: its credential could not be read: %v", cg.Name, err)
		}
		cred = creds[0]
	}
	kube, err := newKubeClient(cred)
	if err != nil {
		return nil, err
	}
	ns := j.podNamespace
	if ns == "" {
		if ns, err = d.podNamespace(ctx, cg); err != nil {
			return nil, err
		}
	}
	return &podSource{d: d, kube: kube, jobID: j.id, name: j.podName, ns: ns, install: d.Settings.String(ctx, "INSTALL_UUID")}, nil
}

// find is find_pod: nil when no pod exists. Of several (a re-queued job
// keeps its id), the newest is the current run's.
func (s *podSource) find(ctx context.Context) (*kubePod, error) {
	if s.name != "" {
		return s.refresh(ctx)
	}
	var list struct {
		Items []*kubePod `json:"items"`
	}
	q := url.Values{"labelSelector": {fmt.Sprintf("ansible-awx=%s,ansible-awx-job-id=%d", s.install, s.jobID)}}
	if err := s.kube.do(ctx, "GET", "/api/v1/namespaces/"+url.PathEscape(s.ns)+"/pods?"+q.Encode(), nil, &list); err != nil {
		return nil, err
	}
	if len(list.Items) == 0 {
		s.pod = nil
		return nil, nil
	}
	sort.Slice(list.Items, func(i, k int) bool {
		return list.Items[i].Metadata.CreationTimestamp.Before(list.Items[k].Metadata.CreationTimestamp)
	})
	s.pod = list.Items[len(list.Items)-1]
	s.name, s.ns = s.pod.Metadata.Name, s.pod.Metadata.Namespace
	return s.pod, nil
}

func (s *podSource) refresh(ctx context.Context) (*kubePod, error) {
	var pod kubePod
	if err := s.kube.do(ctx, "GET", s.podPath(), nil, &pod); err != nil {
		if isKube404(err) {
			s.pod = nil
			return nil, nil
		}
		return nil, err
	}
	s.pod = &pod
	return s.pod, nil
}

func (s *podSource) container() string {
	if s.pod == nil {
		return workerContainer
	}
	return s.pod.containerName()
}

// isLive: the worker container has not finished, so more may come.
func (s *podSource) isLive(ctx context.Context) (bool, error) {
	pod, err := s.refresh(ctx)
	if err != nil {
		return false, err
	}
	if pod == nil || (pod.Status.Phase != "Pending" && pod.Status.Phase != "Running") {
		return false, nil
	}
	return !pod.terminated(), nil
}

// hasOutput: has the pod written anything yet? A pod with output has its
// payload; a silent one may still be waiting for it.
func (s *podSource) hasOutput(ctx context.Context) (bool, error) {
	q := url.Values{"container": {s.container()}, "tailLines": {"1"}}
	rc, err := s.kube.stream(ctx, s.podPath()+"/log?"+q.Encode())
	if err != nil {
		return false, err
	}
	defer rc.Close()
	b, _ := io.ReadAll(io.LimitReader(rc, 1<<20))
	return len(bytes.TrimSpace(b)) > 0, nil
}

// finalStatus is the job's status from the pod's exit code.
func (s *podSource) finalStatus(ctx context.Context) (string, int, error) {
	pod, err := s.refresh(ctx)
	if err != nil {
		return "", 0, err
	}
	rc := 1
	if pod != nil {
		rc = pod.exitCode()
	}
	if rc == 0 {
		return "successful", 0, nil
	}
	return "failed", rc, nil
}

// deletePod is delete_pod; false when it could not be.
func (s *podSource) deletePod() bool {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := s.kube.do(ctx, "DELETE", s.podPath(), map[string]any{"propagationPolicy": "Background"}, nil); err != nil && !isKube404(err) {
		s.d.Log.Error(fmt.Sprintf("Failed to delete pod %s of unified job %d", s.name, s.jobID), "err", err)
		return false
	}
	return true
}

func (s *podSource) cancel(context.Context) bool { return s.deletePod() }

// release removes the pod once the job is final, as `work release` did.
func (s *podSource) release(ctx context.Context) {
	if s.d.releaseWork(ctx) {
		s.deletePod()
	}
}

// open reads the pod's log, following it while the pod runs.
func (s *podSource) open(ctx context.Context, follow bool) (workReader, error) {
	if s.pod == nil {
		if _, err := s.refresh(ctx); err != nil {
			return workReader{}, err
		}
	}
	r := &podLogReader{src: s, ctx: ctx, follow: follow, idle: monitorConfig().streamIdle}
	if err := r.openStream(""); err != nil {
		return workReader{}, err
	}
	return workReader{r: r, interrupt: r.interrupt, stop: s.deletePod}, nil
}

// podLogReader is the pod's log, timestamps stripped, surviving dropped
// connections.
type podLogReader struct {
	// lineLimit bounds one line of the log; 0 is maxStreamLine.
	lineLimit int
	src       *podSource
	ctx       context.Context
	follow    bool
	idle      time.Duration

	mu       sync.Mutex
	body     io.ReadCloser
	br       *bufio.Reader
	timedOut atomic.Bool

	buf        []byte
	lastStamp  int64
	atLast     int
	haveStamp  bool
	replay     *[2]int64
	finalDone  bool
	interrupts atomic.Bool
	reconnects int
}

func (r *podLogReader) openStream(since string) error {
	q := url.Values{"container": {r.src.container()}, "follow": {strconv.FormatBool(r.follow)}, "timestamps": {"true"}}
	if since != "" {
		q.Set("sinceTime", since)
	}
	body, err := r.src.kube.stream(r.ctx, r.src.podPath()+"/log?"+q.Encode())
	if err != nil {
		return err
	}
	r.mu.Lock()
	r.body = body
	r.br = bufio.NewReaderSize(&idleReader{r: r, body: body}, 64<<10)
	r.mu.Unlock()
	return nil
}

// idleReader closes a connection that stays silent too long, so a read
// cannot hang on a connection that died without being closed.
type idleReader struct {
	r    *podLogReader
	body io.ReadCloser
}

func (ir *idleReader) Read(p []byte) (int, error) {
	t := time.AfterFunc(ir.r.idle, func() {
		ir.r.timedOut.Store(true)
		_ = ir.body.Close()
	})
	n, err := ir.body.Read(p)
	t.Stop()
	return n, err
}

func (r *podLogReader) closeStream() {
	r.mu.Lock()
	body := r.body
	r.body, r.br = nil, nil
	r.mu.Unlock()
	if body != nil {
		_ = body.Close()
	}
}

// interrupt unblocks a reader: the connection is closed under it.
func (r *podLogReader) interrupt() {
	r.interrupts.Store(true)
	r.closeStream()
}

// rawLine is the next line of the current connection; "" at its end. A
// followed connection that ends inside a line ends there, the reconnect
// serves that line again in full.
func (r *podLogReader) rawLine() ([]byte, bool, error) {
	r.mu.Lock()
	br := r.br
	r.mu.Unlock()
	if br == nil {
		return nil, true, nil
	}
	limit := r.lineLimit
	if limit == 0 {
		limit = maxStreamLine
	}
	line, err := readLimitedLine(br, limit)
	if err == nil {
		return line, false, nil
	}
	if errors.Is(err, io.EOF) {
		if len(line) > 0 && !r.follow {
			return line, false, nil
		}
		return nil, true, nil
	}
	return nil, false, err
}

func (r *podLogReader) since() string {
	if !r.haveStamp {
		return ""
	}
	return time.Unix(r.lastStamp/1e9, 0).UTC().Format("2006-01-02T15:04:05Z")
}

func (r *podLogReader) reconnect(follow bool) error {
	r.reconnects++
	r.closeStream()
	r.follow = follow
	if r.haveStamp {
		r.replay = &[2]int64{r.lastStamp, int64(r.atLast)}
	}
	r.timedOut.Store(false)
	return r.openStream(r.since())
}

// nextLine is _next_line: the next raw line, reconnecting while the pod
// is live; nil once nothing more will come.
func (r *podLogReader) nextLine() ([]byte, error) {
	for {
		if r.interrupts.Load() {
			return nil, nil
		}
		line, ended, err := r.rawLine()
		if err != nil {
			if r.interrupts.Load() {
				return nil, nil
			}
			// A line past the limit is not a dropped connection: a
			// reconnect would read the same line again, for ever.
			if r.finalDone || errors.Is(err, errLineTooLong) {
				return nil, fmt.Errorf("%w: pod %s: %w", errPodLogIncomplete, r.src.name, err)
			}
			ended = false // dropped or idle: reconnect
		}
		if len(line) > 0 {
			return line, nil
		}
		if r.interrupts.Load() || r.finalDone {
			return nil, nil
		}
		if r.follow {
			live, err := r.src.isLive(r.ctx)
			if err != nil {
				return nil, err
			}
			if live {
				if ended && !r.timedOut.Load() {
					// The kubelet ended it, as it does when the container
					// exits a moment before the pod's status says so.
					time.Sleep(followReopenPause)
					if r.interrupts.Load() {
						return nil, nil
					}
				}
				if err := r.reconnect(true); err != nil {
					return nil, err
				}
				continue
			}
		}
		// Finished, or a harvest: what came after the last line seen,
		// without following, exactly once.
		r.finalDone = true
		if err := r.reconnect(false); err != nil {
			if isKube404(err) {
				return nil, nil
			}
			return nil, err
		}
	}
}

func (r *podLogReader) stamp(line []byte, m []int) int64 {
	t, err := time.Parse("2006-01-02T15:04:05", string(line[m[2]:m[3]]))
	if err != nil {
		return 0
	}
	secs := t.Unix()
	if zone := string(line[m[6]:m[7]]); zone != "Z" {
		h, _ := strconv.Atoi(zone[1:3])
		mi, _ := strconv.Atoi(zone[4:6])
		off := int64(h*3600 + mi*60)
		if zone[0] == '+' {
			secs -= off
		} else {
			secs += off
		}
	}
	var frac int64
	if m[4] >= 0 {
		f := string(line[m[4]:m[5]])
		f += strings.Repeat("0", 9-len(f))
		frac, _ = strconv.ParseInt(f, 10, 64)
	}
	return secs*1e9 + frac
}

// fill moves the next line, minus its timestamp, into the buffer.
func (r *podLogReader) fill() (bool, error) {
	for {
		line, err := r.nextLine()
		if err != nil {
			return false, err
		}
		if line == nil {
			return false, nil
		}
		body := line
		if m := podLogTimestampRe.FindSubmatchIndex(line); m != nil {
			st := r.stamp(line, m)
			body = line[m[1]:]
			if r.replay != nil {
				if st < r.replay[0] {
					continue
				}
				if st == r.replay[0] && r.replay[1] > 0 {
					r.replay[1]--
					continue
				}
				r.replay = nil
			}
			if r.haveStamp && st == r.lastStamp {
				r.atLast++
			} else {
				r.lastStamp, r.atLast, r.haveStamp = st, 1, true
			}
		}
		if len(bytes.TrimSpace(body)) == 0 {
			continue
		}
		r.buf = append(r.buf, body...)
		return true, nil
	}
}

func (r *podLogReader) Read(p []byte) (int, error) {
	for len(r.buf) == 0 {
		ok, err := r.fill()
		if err != nil {
			return 0, err
		}
		if !ok {
			return 0, io.EOF
		}
	}
	n := copy(p, r.buf)
	r.buf = r.buf[n:]
	return n, nil
}
