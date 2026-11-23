package tasks

import (
	"bufio"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"syscall"
	"time"
	"unicode/utf8"
)

// This file is a port of the parts of ansible-runner the old task system
// used: the private data directory layout, the container invocation,
// answering password prompts on a pseudo-terminal, and turning the
// awx_display callback's output into events. Runner's job_events files,
// env.list, command, status and rc artifacts are written the same way so
// the directory looks as it did.

// expectPassword answers a prompt matched by re with value (runner's
// expect_passwords, in order).
type expectPassword struct {
	re    *regexp.Regexp
	value string
}

// runnerConfig describes one containerized ansible-playbook run.
type runnerConfig struct {
	PrivateDataDir string
	Ident          string
	Runtime        string // podman or docker
	Image          string
	// ContainerOptions are appended before the image (--user=root, the
	// DEFAULT_CONTAINER_RUN_OPTIONS and --pull=...).
	ContainerOptions []string
	// VolumeMounts are the extra -v mappings (AWX_ISOLATION_SHOW_PATHS).
	VolumeMounts []string
	// Env is the environment of the process in the container (env.list).
	Env map[string]string
	// Args is the ansible-playbook command line, playbook last.
	Args        []string
	SSHKeyData  string
	Passwords   []expectPassword
	JobTimeout  time.Duration
	IdleTimeout time.Duration
}

// artifactDir is <private_data_dir>/artifacts/<ident>.
func (c *runnerConfig) artifactDir() string {
	return filepath.Join(c.PrivateDataDir, "artifacts", c.Ident)
}

func (c *runnerConfig) containerName() string {
	return "ansible_runner_" + sanitizeContainerName(c.Ident)
}

var containerNameRe = regexp.MustCompile(`[^a-zA-Z0-9_.-]`)

func sanitizeContainerName(s string) string {
	return containerNameRe.ReplaceAllString(s, "_")
}

// shellQuote is shlex.quote.
func shellQuote(s string) string {
	if s == "" {
		return "''"
	}
	if !strings.ContainsAny(s, " \t\n\"'\\$`!*?[]{}()<>|&;#~^%") {
		return s
	}
	return "'" + strings.ReplaceAll(s, "'", `'"'"'`) + "'"
}

// args2cmdline joins arguments the way runner's args2cmdline does.
func args2cmdline(args ...string) string {
	q := make([]string, len(args))
	for i, a := range args {
		q[i] = shellQuote(a)
	}
	return strings.Join(q, " ")
}

// wrapWithSSHAgent is runner's wrap_args_with_ssh_agent for containers:
// the key is read from a fifo in the artifacts directory and removed.
func (c *runnerConfig) wrapWithSSHAgent(args []string) []string {
	keyPath := "/runner/artifacts/" + c.Ident + "/ssh_key_data"
	cleanup := "rm -f " + keyPath
	cmd := strings.Join([]string{args2cmdline("trap", cleanup, "EXIT"), args2cmdline("ssh-add", keyPath), cleanup, args2cmdline(args...)}, " && ")
	return []string{"ssh-agent", "sh", "-c", cmd}
}

// command is the full container invocation, as wrap_args_for_containerization
// built it for the interface.run() case the old task code used.
func (c *runnerConfig) command() []string {
	args := c.Args
	if c.SSHKeyData != "" {
		args = c.wrapWithSSHAgent(args)
	}
	cmd := []string{c.Runtime, "run", "--rm", "--tty", "--interactive", "--workdir", "/runner/project"}
	cmd = append(cmd, "-v", filepath.Clean(c.PrivateDataDir)+"/:/runner/:Z")
	for _, m := range c.VolumeMounts {
		cmd = append(cmd, "-v", m)
	}
	cmd = append(cmd, "--env-file", filepath.Join(c.artifactDir(), "env.list"))
	if strings.Contains(c.Runtime, "podman") {
		cmd = append(cmd, "--quiet")
	}
	if strings.Contains(c.Runtime, "docker") {
		cmd = append(cmd, fmt.Sprintf("--user=%d", os.Getuid()))
	}
	cmd = append(cmd, "--name", c.containerName())
	cmd = append(cmd, c.ContainerOptions...)
	cmd = append(cmd, c.Image)
	cmd = append(cmd, args...)
	return cmd
}

// runnerEvent is what the output filter produces for every event: the
// begin-marker fields plus the stdout runner attributed to it.
type runnerEvent map[string]any

// outputEventFilter is runner's OutputEventFilter: a writer that finds the
// base64 event tokens the callback wraps in \x1b[K and emits an event per
// token (with the stdout that followed it) and a verbose event per plain
// line outside tokens, tracking the counter and line numbers.
type outputEventFilter struct {
	emit         func(runnerEvent)
	counter      int64
	startLine    int64
	buffer       strings.Builder
	lastChunk    string
	currentEvent runnerEvent
	pending      []byte // incomplete UTF-8 tail of the previous chunk
}

var eventDataRe = regexp.MustCompile(`\x1b\[K((?:[A-Za-z0-9+/=]+\x1b\[\d+D)+)\x1b\[K`)
var cursorBackRe = regexp.MustCompile(`\x1b\[\d+D`)

func (f *outputEventFilter) writeBytes(b []byte) {
	b = append(f.pending, b...)
	f.pending = nil
	// Keep an incomplete trailing rune for the next chunk, as a utf-8
	// decoder with errors='replace' would otherwise mangle it.
	for i := len(b) - 1; i >= 0 && i >= len(b)-4; i-- {
		if utf8.RuneStart(b[i]) {
			if !utf8.FullRune(b[i:]) {
				f.pending = append([]byte{}, b[i:]...)
				b = b[:i]
			}
			break
		}
	}
	f.write(strings.ToValidUTF8(string(b), "�"))
}

func (f *outputEventFilter) write(data string) {
	f.buffer.WriteString(data)
	shouldSearch := strings.Contains(f.lastChunk+data, "\x1b[K")
	f.lastChunk = data
	if shouldSearch {
		for {
			value := f.buffer.String()
			loc := eventDataRe.FindStringSubmatchIndex(value)
			if loc == nil {
				return
			}
			var eventData runnerEvent
			b64 := cursorBackRe.ReplaceAllString(value[loc[2]:loc[3]], "")
			if raw, err := base64.StdEncoding.DecodeString(b64); err == nil {
				if json.Unmarshal(raw, &eventData) == nil && eventData != nil {
					keepEventData(eventData, raw)
				}
			}
			if eventData == nil {
				eventData = runnerEvent{}
			}
			f.emitEvent(value[:loc[0]], eventData)
			remainder := value[loc[1]:]
			f.buffer.Reset()
			f.buffer.WriteString(remainder)
			f.lastChunk = remainder
		}
	}
	// Verbose stdout outside of event data context: emit complete lines.
	if data != "" && strings.Contains(data, "\n") && f.currentEvent == nil {
		lines := splitLinesKeepEnds(f.buffer.String())
		var remainder string
		if len(lines) > 0 && !strings.Contains(lines[len(lines)-1], "\n") {
			remainder = lines[len(lines)-1]
			lines = lines[:len(lines)-1]
		}
		for _, l := range lines {
			f.emitEvent(l, nil)
		}
		f.buffer.Reset()
		f.buffer.WriteString(remainder)
	}
	// An event that never ends (or a line that never does) would grow the
	// buffer, and each chunk would search all of it again: past the bound
	// the text goes out as it is.
	if f.buffer.Len() > maxOutputBuffer {
		f.emitEvent(f.buffer.String(), nil)
		f.buffer.Reset()
		f.lastChunk = ""
	}
}

// close flushes what is buffered and emits the EOF marker.
func (f *outputEventFilter) close() {
	if len(f.pending) > 0 {
		f.write(strings.ToValidUTF8(string(f.pending), "�"))
		f.pending = nil
	}
	if v := f.buffer.String(); v != "" {
		f.emitEvent(v, nil)
		f.buffer.Reset()
	}
	f.emit(runnerEvent{"event": "EOF"})
}

// splitLinesKeepEnds is str.splitlines(True) for \n and \r\n endings.
func splitLinesKeepEnds(s string) []string {
	var out []string
	for s != "" {
		i := strings.IndexByte(s, '\n')
		if i < 0 {
			out = append(out, s)
			break
		}
		out = append(out, s[:i+1])
		s = s[i+1:]
	}
	return out
}

func (f *outputEventFilter) emitEvent(bufferedStdout string, next runnerEvent) {
	var eventData runnerEvent
	var chunks []string
	switch {
	case f.currentEvent != nil:
		eventData = f.currentEvent
		chunks = []string{bufferedStdout}
	case bufferedStdout != "":
		eventData = runnerEvent{"event": "verbose"}
		chunks = splitLinesKeepEnds(bufferedStdout)
	default:
		eventData = runnerEvent{}
	}
	for _, chunk := range chunks {
		if eventData["event"] == "verbose" {
			eventData["uuid"] = newUUID()
		}
		f.counter++
		eventData["counter"] = f.counter
		eventData["stdout"] = strings.TrimRight(chunk, "\n\r")
		n := int64(strings.Count(chunk, "\n"))
		eventData["start_line"] = f.startLine
		eventData["end_line"] = f.startLine + n
		f.startLine += n
		f.emit(eventData)
	}
	if next != nil && next["uuid"] != nil {
		f.currentEvent = next
	} else {
		f.currentEvent = nil
	}
}

// envNameRe is a variable name --env-file can carry.
var envNameRe = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*$`)

// envFile renders a job's environment as the --env-file the container is
// started with. podman and docker read that file a line at a time, and a
// line holding only a name (or podman's NAME*) copies that variable from
// the client's own environment into the container. The values come from
// credential inputs, injectors and inventory source variables, which users
// write: a line break in one would add such lines and hand the job the task
// process's environment. So every name must be a plain variable name, and
// a value with a line break or NUL refuses the run (naming the variable,
// never its value) rather than being cut short silently.
func envFile(env map[string]string) ([]byte, error) {
	keys := make([]string, 0, len(env))
	for k := range env {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	var b bytes.Buffer
	for _, k := range keys {
		v := env[k]
		if !envNameRe.MatchString(k) {
			return nil, fmt.Errorf("environment variable name %q is not valid: a name is letters, digits and underscores, not starting with a digit", k)
		}
		if strings.ContainsAny(v, "\r\n\x00") {
			return nil, fmt.Errorf("the value of environment variable %s contains a line break or NUL character, which cannot be passed to the container", k)
		}
		b.WriteString(k + "=" + v + "\n")
	}
	return b.Bytes(), nil
}

// runtimeClientEnv is the environment podman or docker runs with on this
// host: the task process's own, without its configuration (ASCENDER_*,
// which holds the database password and URL and may hold SECRET_KEY) or
// libpq's credentials. The runtime keeps what it needs (PATH, HOME,
// XDG_RUNTIME_DIR, CONTAINERS_*, DOCKER_*, proxies, TLS trust).
func runtimeClientEnv() []string {
	var out []string
	for _, kv := range os.Environ() {
		name, _, _ := strings.Cut(kv, "=")
		switch {
		case strings.HasPrefix(name, "ASCENDER_"), strings.HasPrefix(name, "PGPASS"), name == "PGSERVICEFILE", name == "DATABASE_URL", name == "SECRET_KEY":
			continue
		}
		out = append(out, kv)
	}
	return out
}

// runnerResult is what run returns: runner's status and return code.
type runnerResult struct {
	Status string
	RC     int
}

// run executes the container with a pseudo-terminal, answers prompts,
// streams events to handler and returns runner's status: successful,
// failed, canceled or timeout. The handler receives each event already
// merged with the callback's partial file.
func (c *runnerConfig) run(ctx context.Context, log func(string, ...any), handler func(runnerEvent)) (runnerResult, error) {
	art := c.artifactDir()
	if err := os.MkdirAll(filepath.Join(art, "job_events"), 0o700); err != nil {
		return runnerResult{}, err
	}
	cmd := c.command()
	cmdFile, _ := json.Marshal(map[string]any{"command": cmd, "cwd": "/runner/project", "env": c.Env})
	_ = os.WriteFile(filepath.Join(art, "command"), cmdFile, 0o600)
	envList, err := envFile(c.Env)
	if err != nil {
		return runnerResult{}, err
	}
	if err := os.WriteFile(filepath.Join(art, "env.list"), envList, 0o600); err != nil {
		return runnerResult{}, err
	}
	if c.SSHKeyData != "" {
		if err := c.writeKeyFIFO(ctx, filepath.Join(art, "ssh_key_data")); err != nil {
			return runnerResult{}, err
		}
	}

	filter := &outputEventFilter{emit: func(ev runnerEvent) { c.completeEvent(ev, handler) }}
	master, slave, err := openPTY()
	if err != nil {
		return runnerResult{}, err
	}
	defer master.Close()
	proc := exec.Command(cmd[0], cmd[1:]...)
	proc.Stdin, proc.Stdout, proc.Stderr = slave, slave, slave
	proc.SysProcAttr = &syscall.SysProcAttr{Setsid: true, Setctty: true, Ctty: 0}
	// The job's environment reaches the container through --env-file.
	// The runtime client on this host runs with the task process's own
	// (without its secrets): a credential injecting DOCKER_HOST,
	// CONTAINER_HOST or LD_PRELOAD must not redirect or hook the client
	// that mounts the private data directory and passes the job's secrets.
	proc.Env = runtimeClientEnv()
	if err := proc.Start(); err != nil {
		slave.Close()
		filter.write(err.Error() + "\n")
		filter.close()
		return runnerResult{Status: "failed", RC: 127}, nil
	}
	slave.Close()

	var (
		mu          sync.Mutex
		lastOutput  = time.Now()
		expectBuf   string
		canceled    bool
		timedOut    bool
		readDone    = make(chan struct{})
		killOnce    sync.Once
		killContain = func() {
			killOnce.Do(func() {
				// The runtime's kill gets ten seconds: a hung podman or
				// docker must not hold up the SIGTERM and SIGKILL that
				// follow, nor the run loop this is called from.
				kctx, cancel := context.WithTimeout(context.Background(), killContainTimeout)
				kc := exec.CommandContext(kctx, c.Runtime, "kill", c.containerName())
				kc.Env = runtimeClientEnv()
				kc.WaitDelay = time.Second
				_ = kc.Run()
				cancel()
				_ = proc.Process.Signal(syscall.SIGTERM)
				time.AfterFunc(5*time.Second, func() { _ = proc.Process.Kill() })
			})
		}
	)
	go func() {
		defer close(readDone)
		buf := make([]byte, 32*1024)
		for {
			n, err := master.Read(buf)
			if n > 0 {
				chunk := buf[:n]
				mu.Lock()
				lastOutput = time.Now()
				filter.writeBytes(chunk)
				// Prompts: the last 100 characters are searched like
				// pexpect's searchwindowsize, earliest match wins, and the
				// answer is typed with a newline.
				expectBuf += strings.ToValidUTF8(string(chunk), "")
				for {
					window := expectBuf
					if len(window) > 100 {
						window = window[len(window)-100:]
					}
					best, bestEnd := -1, -1
					var answer string
					for _, p := range c.Passwords {
						if loc := p.re.FindStringIndex(window); loc != nil && (best < 0 || loc[0] < best) {
							best, bestEnd, answer = loc[0], loc[1], p.value
						}
					}
					if best < 0 {
						if len(expectBuf) > 100 {
							expectBuf = expectBuf[len(expectBuf)-100:]
						}
						break
					}
					_, _ = master.Write([]byte(answer + "\n"))
					expectBuf = window[bestEnd:]
				}
				mu.Unlock()
			}
			if err != nil {
				return
			}
		}
	}()

	start := time.Now()
	waitDone := make(chan error, 1)
	go func() { waitDone <- proc.Wait() }()
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	var waitErr error
loop:
	for {
		select {
		case waitErr = <-waitDone:
			break loop
		case <-ctx.Done():
			if !canceled {
				canceled = true
				log("canceling job, killing container", "container", c.containerName())
				killContain()
			}
		case <-ticker.C:
			if c.JobTimeout > 0 && !canceled && time.Since(start) > c.JobTimeout {
				timedOut = true
				killContain()
			}
			mu.Lock()
			idle := time.Since(lastOutput)
			mu.Unlock()
			if c.IdleTimeout > 0 && idle > c.IdleTimeout {
				timedOut = true
				killContain()
			}
		}
	}
	<-readDone
	mu.Lock()
	filter.close()
	mu.Unlock()

	rc := 0
	if waitErr != nil {
		var ee *exec.ExitError
		if errors.As(waitErr, &ee) {
			rc = ee.ExitCode()
		} else {
			rc = 254
		}
	}
	if timedOut || canceled {
		rc = 254
	}
	res := runnerResult{RC: rc}
	switch {
	case canceled:
		res.Status = "canceled"
	case rc == 0 && !timedOut:
		res.Status = "successful"
	case timedOut:
		res.Status = "timeout"
	default:
		res.Status = "failed"
	}
	_ = writeJobFile(c.PrivateDataDir, filepath.Join(art, "status"), []byte(res.Status), 0o600)
	_ = writeJobFile(c.PrivateDataDir, filepath.Join(art, "rc"), []byte(fmt.Sprint(rc)), 0o600)
	return res, nil
}

// completeEvent is Runner.event_callback: merge the partial file the
// callback dropped for the event's uuid, stamp created, hand it over.
func (c *runnerConfig) completeEvent(ev runnerEvent, handler func(runnerEvent)) {
	if uuid, _ := ev["uuid"].(string); uuid != "" {
		// The uuid comes from the job's output: only a plain one names
		// a file, and the file is read inside the private data dir.
		if eventUUIDRe.MatchString(uuid) {
			partial := filepath.Join(c.artifactDir(), "job_events", uuid+"-partial.json")
			if raw, err := readJobFile(c.PrivateDataDir, partial, 64<<20); err == nil {
				var data map[string]any
				if json.Unmarshal(raw, &data) == nil {
					for k, v := range data {
						ev[k] = v
					}
					if _, ok := data["event_data"]; ok {
						delete(ev, rawEventDataKey)
						keepEventData(ev, raw)
					}
				}
				_ = removeJobFile(c.PrivateDataDir, partial)
			}
		}
		ev["runner_ident"] = c.Ident
		if _, ok := ev["created"]; !ok {
			ev["created"] = time.Now().UTC().Format("2006-01-02T15:04:05.000000")
		}
	}
	handler(ev)
}

// writeKeyFIFO feeds the SSH key to ssh-add through a named pipe so the
// key never rests on disk (runner's open_fifo_write).
func (c *runnerConfig) writeKeyFIFO(ctx context.Context, path string) error {
	_ = os.Remove(path)
	if err := syscall.Mkfifo(path, 0o600); err != nil {
		return err
	}
	data := c.SSHKeyData
	if strings.Contains(data, "OPENSSH PRIVATE KEY") && !strings.HasSuffix(data, "\n") {
		data += "\n"
	}
	go func() {
		f, err := os.OpenFile(path, os.O_WRONLY, 0o600)
		if err != nil {
			return
		}
		w := bufio.NewWriter(f)
		_, _ = w.WriteString(data)
		_ = w.Flush()
		f.Close()
	}()
	go func() {
		// Unblock the writer when the run ends without a reader.
		<-ctx.Done()
		if r, err := os.OpenFile(path, os.O_RDONLY|syscall.O_NONBLOCK, 0); err == nil {
			r.Close()
		}
	}()
	return nil
}

// killContainTimeout bounds the runtime's kill of a job's container.
const killContainTimeout = 10 * time.Second

// callbackFileRe is the file names callbackPlugin accepts from an image.
var callbackFileRe = regexp.MustCompile(`^[A-Za-z0-9_]+\.py$`)

// callbackPlugin returns a directory holding the awx_display callback
// plugin of the image's ansible-runner, copied out once per image and
// cached under cacheRoot. Runner copied its own package's plugin into every
// job's artifacts; the plugin shipped in the execution environment is the
// same file, so the job's ANSIBLE_CALLBACK_PLUGINS path is unchanged.
// callbackProbeTimeout bounds the callback plugin probe, an image pull
// included.
const callbackProbeTimeout = 10 * time.Minute

func callbackPlugin(ctx context.Context, runtime, image, cacheRoot string, runArgs ...string) (string, error) {
	// The directory is keyed by a digest of the full image reference too:
	// sanitizing alone maps different images (a/b_c, a/b/c) to one name,
	// and one image must never supply another's plugin.
	sum := sha256.Sum256([]byte(image))
	dir := filepath.Join(cacheRoot, "callback_cache", sanitizeContainerName(image)+"-"+hex.EncodeToString(sum[:8]))
	if callbackCached(dir) {
		return dir, nil
	}
	// One fill per image at a time here; the first jobs on a new image
	// wait for it and use what it made.
	m, _ := callbackFills.LoadOrStore(dir, &sync.Mutex{})
	mu := m.(*sync.Mutex)
	mu.Lock()
	defer mu.Unlock()
	if callbackCached(dir) {
		return dir, nil
	}
	script := `import json, os, sys
import ansible_runner.display_callback.callback as c
d = os.path.dirname(c.__file__)
out = {}
for n in os.listdir(d):
    p = os.path.join(d, n)
    if os.path.isfile(p) and n.endswith('.py'):
        out[n] = open(p).read()
json.dump(out, sys.stdout)
`
	// The image's own code runs here: without a network, and for no
	// longer than a probe needs.
	pctx, cancel := context.WithTimeout(ctx, callbackProbeTimeout)
	defer cancel()
	args := append(append([]string{"run"}, runArgs...), "--rm", "--interactive", "--network", "none", "--entrypoint", "python3", image, "-")
	probe := exec.CommandContext(pctx, runtime, args...)
	probe.WaitDelay = 5 * time.Second
	probe.Env = runtimeClientEnv()
	probe.Stdin = strings.NewReader(script)
	// The image's own code prints this: bounded.
	stdout, stderr := &limitedBuffer{max: maxProbeOutput}, &limitedBuffer{max: 1 << 20}
	probe.Stdout, probe.Stderr = stdout, stderr
	if err := probe.Run(); err != nil {
		return "", fmt.Errorf("could not read the callback plugin from %s: %v: %s", image, err, strings.TrimSpace(stderr.String()))
	}
	var files map[string]string
	if err := json.Unmarshal(stdout.Bytes(), &files); err != nil || files["awx_display.py"] == "" {
		return "", fmt.Errorf("image %s has no ansible-runner callback plugin", image)
	}
	// The names come from the image, which whoever registered the
	// execution environment controls: only plain module file names are
	// taken, so nothing is written outside the cache directory.
	for name := range files {
		if !callbackFileRe.MatchString(name) {
			return "", fmt.Errorf("image %s reported an invalid callback plugin file name %q", image, name)
		}
	}
	// The files go to a directory of their own that is renamed into place
	// whole: a job never copies a half-written plugin (from a fill under
	// way in another task process), and a fill that fails leaves nothing
	// that passes for a complete one.
	parent := filepath.Dir(dir)
	if err := os.MkdirAll(parent, 0o755); err != nil {
		return "", err
	}
	tmp, err := os.MkdirTemp(parent, ".fill-")
	if err != nil {
		return "", err
	}
	defer os.RemoveAll(tmp)
	if err := os.Chmod(tmp, 0o755); err != nil {
		return "", err
	}
	for name, content := range files {
		if err := os.WriteFile(filepath.Join(tmp, name), []byte(content), 0o644); err != nil {
			return "", err
		}
	}
	// What a fill made before fills were whole may be there, incomplete.
	if _, err := os.Lstat(dir); err == nil {
		if err := os.RemoveAll(dir); err != nil {
			return "", err
		}
	}
	if err := os.Rename(tmp, dir); err != nil {
		// Another task process put its fill in place first.
		if callbackCached(dir) {
			return dir, nil
		}
		return "", err
	}
	return dir, nil
}

// callbackFills serialises the fills of one image's plugin directory.
var callbackFills sync.Map

// callbackCached reports whether a plugin directory is filled.
func callbackCached(dir string) bool {
	st, err := os.Stat(filepath.Join(dir, "awx_display.py"))
	return err == nil && st.Size() > 0
}

// copyTree copies src into dst (which must not exist), keeping symlinks as
// links and skipping names in ignore, like shutil.copytree(symlinks=True).
func copyTree(src, dst string, ignore map[string]bool) error {
	return filepath.Walk(src, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(src, path)
		if rel != "." && ignore[info.Name()] {
			if info.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		target := filepath.Join(dst, rel)
		switch {
		case info.Mode()&os.ModeSymlink != 0:
			link, err := os.Readlink(path)
			if err != nil {
				return err
			}
			return os.Symlink(link, target)
		case info.IsDir():
			return os.MkdirAll(target, info.Mode().Perm()|0o700)
		case !info.Mode().IsRegular():
			// A FIFO, socket or device a checkout left: opening one would
			// block or read without end, and no playbook needs it.
			return nil
		default:
			in, err := os.Open(path)
			if err != nil {
				return err
			}
			defer in.Close()
			out, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, info.Mode().Perm())
			if err != nil {
				return err
			}
			if _, err := out.ReadFrom(in); err != nil {
				out.Close()
				return err
			}
			return out.Close()
		}
	})
}
