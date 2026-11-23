// Package receptor talks to the local receptor node over its control
// socket, as receptorctl's ReceptorControl did for the old task system
// (main/tasks/receptor.py): mesh status, work submission with signing and
// TLS, results, status, release and cancel.
package receptor

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"regexp"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
)

// Config is what the task system reads from receptor's configuration file
// (read_receptor_config and its helpers).
type Config struct {
	// Socket is the control service's socket (get_receptor_sockfile).
	Socket string
	// TLSClient is the first tls-client's name (get_tls_client).
	TLSClient string
	// WorkSigning is true when the node signs work (work_signing_enabled).
	WorkSigning bool
	// Logf receives the warnings the old code logged.
	Logf func(string)
}

// ReadConfig parses receptor's YAML configuration: a list of one-key maps.
// socketOverride replaces the control socket's path (the file as seen from
// this process, when receptor runs elsewhere).
func ReadConfig(path, socketOverride string) (*Config, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var sections []map[string]any
	if err := yaml.Unmarshal(b, &sections); err != nil {
		return nil, fmt.Errorf("receptor conf %s: %v", path, err)
	}
	c := &Config{}
	for _, section := range sections {
		for name, data := range section {
			m, _ := data.(map[string]any)
			switch name {
			case "work-signing":
				c.WorkSigning = true
			case "control-service":
				if f, ok := m["filename"].(string); ok && c.Socket == "" {
					c.Socket = f
				}
			case "tls-client":
				if n, ok := m["name"].(string); ok && c.TLSClient == "" {
					c.TLSClient = n
				}
			}
		}
	}
	if socketOverride != "" {
		c.Socket = socketOverride
	}
	if c.Socket == "" {
		return nil, fmt.Errorf("Receptor conf %s does not have control-service entry needed to get sockfile", path)
	}
	return c, nil
}

// conn is one control session.
type conn struct {
	c net.Conn
	r *bufio.Reader
}

var handshakeRe = regexp.MustCompile(`^Receptor Control, node (.+)$`)

// controlTimeout bounds a control command: the handshake, the command and
// its answer. A wedged receptor otherwise held up whoever asked for ever:
// the heartbeat (so peers took this node for lost and reaped its jobs) or
// the work unit reaper, which runs under the cluster's scheduler lock.
// A results stream has no deadline once it streams.
var controlTimeout = 30 * time.Second

func (cfg *Config) dial() (*conn, error) {
	c, err := net.DialTimeout("unix", cfg.Socket, 10*time.Second)
	if err != nil {
		return nil, err
	}
	_ = c.SetDeadline(time.Now().Add(controlTimeout))
	s := &conn{c: c, r: bufio.NewReader(c)}
	line, err := s.readLine()
	if err != nil {
		c.Close()
		return nil, err
	}
	if !handshakeRe.MatchString(line) {
		c.Close()
		return nil, errors.New("Failed to connect to Receptor socket")
	}
	return s, nil
}

func (s *conn) readLine() (string, error) {
	line, err := s.r.ReadString('\n')
	if err != nil && line == "" {
		return "", err
	}
	return strings.TrimSpace(line), nil
}

func (s *conn) write(str string) error {
	_, err := io.WriteString(s.c, str)
	return err
}

func (s *conn) close() { _ = s.c.Close() }

// extend gives the session another controlTimeout.
func (s *conn) extend() { _ = s.c.SetDeadline(time.Now().Add(controlTimeout)) }

// deadlineWriter writes a payload with a fresh write deadline for every
// piece: a large payload takes as long as it takes while receptor keeps
// reading it, and a receptor that stops reading fails the write.
type deadlineWriter struct{ c net.Conn }

func (w deadlineWriter) Write(p []byte) (int, error) {
	_ = w.c.SetWriteDeadline(time.Now().Add(controlTimeout))
	return w.c.Write(p)
}

func (s *conn) closeWrite() {
	if uc, ok := s.c.(*net.UnixConn); ok {
		_ = uc.CloseWrite()
	}
}

// readJSON is read_and_parse_json.
func (s *conn) readJSON(v any) error {
	text, err := s.readLine()
	if err != nil {
		return err
	}
	if strings.HasPrefix(text, "ERROR:") {
		return errors.New(strings.TrimSpace(text[6:]))
	}
	return json.Unmarshal([]byte(text), v)
}

// SimpleCommand sends one command and decodes its JSON answer.
func (cfg *Config) SimpleCommand(command string, v any) error {
	s, err := cfg.dial()
	if err != nil {
		return err
	}
	defer s.close()
	if err := s.write(command + "\n"); err != nil {
		return err
	}
	return s.readJSON(v)
}

// Connection types of a service advertisement.
const (
	ConnDatagram  = 0
	ConnStream    = 1
	ConnStreamTLS = 2
)

// Advertisement is one service a node advertises on the mesh.
type Advertisement struct {
	NodeID       string
	Service      string
	Time         string
	ConnType     int
	Tags         map[string]any
	WorkCommands []struct {
		WorkType string
		Secure   bool
	}
}

// Status is receptor's `status` answer.
type Status struct {
	NodeID               string
	SystemCPUCount       int
	SystemMemoryMiB      int
	Version              string
	Advertisements       []Advertisement
	KnownConnectionCosts map[string]map[string]float64
	RoutingTable         map[string]string
}

// Status is the mesh as the local node knows it.
func (cfg *Config) Status() (*Status, error) {
	var st Status
	if err := cfg.SimpleCommand("status", &st); err != nil {
		return nil, err
	}
	return &st, nil
}

// ConnType is get_conn_type: how a node serves its control service.
func (st *Status) ConnType(node string) (int, bool) {
	for _, ad := range st.Advertisements {
		if ad.NodeID == node {
			return ad.ConnType, true
		}
	}
	return 0, false
}

// NodeNotFound is ReceptorNodeNotFound.
type NodeNotFound struct{ Node string }

func (e *NodeNotFound) Error() string {
	return fmt.Sprintf("Instance %s is not in the receptor mesh", e.Node)
}

// find_node_in_mesh's ten tries, a second more apart each time.
var (
	findNodeAttempts = 10
	findNodeBackoff  = time.Second
)

// FindNode is find_node_in_mesh: the node's advertisement, waited for
// with a growing backoff (ten tries, nearly a minute), or until ctx ends.
func (cfg *Config) FindNode(ctx context.Context, node string, logf func(string)) (*Advertisement, error) {
	backoff := findNodeBackoff
	for attempt := 0; attempt < findNodeAttempts; attempt++ {
		st, err := cfg.Status()
		if err != nil {
			return nil, err
		}
		for i := range st.Advertisements {
			if st.Advertisements[i].NodeID == node {
				return &st.Advertisements[i], nil
			}
		}
		if logf != nil {
			logf(fmt.Sprintf("Instance %s is not in the receptor mesh. %d attempts left.", node, findNodeAttempts-attempt))
		}
		if err := sleepCtx(ctx, backoff); err != nil {
			return nil, err
		}
		backoff += findNodeBackoff
	}
	return nil, &NodeNotFound{node}
}

// sleepCtx waits for d or until ctx ends.
func sleepCtx(ctx context.Context, d time.Duration) error {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-t.C:
		return nil
	}
}

// SubmitOptions are submit_work's arguments.
type SubmitOptions struct {
	WorkType  string
	Node      string
	TLSClient string
	TTL       string
	SignWork  bool
	Params    map[string]string
}

var unitCreatedRe = regexp.MustCompile(`^Work unit created with ID (.+)\. Send stdin data and EOF\.$`)

// SubmitWork creates a work unit, streams its payload and returns the
// unit's id once receptor has it all.
func (cfg *Config) SubmitWork(opts SubmitOptions, payload io.Reader) (string, error) {
	s, err := cfg.dial()
	if err != nil {
		return "", err
	}
	defer s.close()
	node := opts.Node
	if node == "" {
		node = "localhost"
	}
	cmd := map[string]string{"command": "work", "subcommand": "submit", "node": node, "worktype": opts.WorkType}
	if opts.TLSClient != "" {
		cmd["tlsclient"] = opts.TLSClient
	}
	if opts.TTL != "" {
		cmd["ttl"] = opts.TTL
	}
	if opts.SignWork {
		cmd["signwork"] = "true"
	}
	for k, v := range opts.Params {
		if _, dup := cmd[k]; dup {
			return "", fmt.Errorf("Duplicate or illegal parameter %s", k)
		}
		cmd[k] = v
	}
	b, _ := json.Marshal(cmd)
	if err := s.write(string(b) + "\n"); err != nil {
		return "", err
	}
	text, err := s.readLine()
	if err != nil {
		return "", err
	}
	if !unitCreatedRe.MatchString(text) {
		msg := "Failed to start work unit"
		if strings.HasPrefix(text, "ERROR: ") {
			msg += ": " + text[7:]
		}
		return "", errors.New(msg)
	}
	if payload != nil {
		if _, err := io.Copy(deadlineWriter{s.c}, payload); err != nil {
			return "", err
		}
	}
	s.extend()
	s.closeWrite()
	text, err = s.readLine()
	if err != nil {
		return "", err
	}
	if strings.HasPrefix(text, "ERROR:") {
		return "", fmt.Errorf("Remote error: %s", text)
	}
	var res struct {
		UnitID string `json:"unitid"`
	}
	if err := json.Unmarshal([]byte(text), &res); err != nil {
		return "", err
	}
	return res.UnitID, nil
}

var streamingRe = regexp.MustCompile(`^Streaming results for work unit (.+)$`)

// Results streams a unit's output from startpos; it ends when the unit is
// done.
func (cfg *Config) Results(unitID string, startpos int64) (io.ReadCloser, error) {
	s, err := cfg.dial()
	if err != nil {
		return nil, err
	}
	if err := s.write(fmt.Sprintf("work results %s %d\n", unitID, startpos)); err != nil {
		s.close()
		return nil, err
	}
	text, err := s.readLine()
	if err != nil {
		s.close()
		return nil, err
	}
	if !streamingRe.MatchString(text) {
		s.close()
		msg := "Failed to get results"
		if strings.HasPrefix(text, "ERROR: ") {
			msg += ": " + text[7:]
		}
		return nil, errors.New(msg)
	}
	s.closeWrite()
	// The stream lasts as long as the work does; its reader watches it.
	_ = s.c.SetDeadline(time.Time{})
	return &resultStream{s: s}, nil
}

type resultStream struct{ s *conn }

func (r *resultStream) Read(p []byte) (int, error) { return r.s.r.Read(p) }
func (r *resultStream) Close() error               { r.s.close(); return nil }

// WorkStatus is `work status`.
type WorkStatus struct {
	State      int
	StateName  string
	Detail     string
	StdoutSize int64
	WorkType   string
	ExtraData  any
}

// ActiveStates are RECEPTOR_ACTIVE_STATES.
var ActiveStates = map[string]bool{"Pending": true, "Running": true}

func (cfg *Config) WorkStatus(unitID string) (*WorkStatus, error) {
	var ws WorkStatus
	if err := cfg.SimpleCommand("work status "+unitID, &ws); err != nil {
		return nil, err
	}
	return &ws, nil
}

// Release removes a unit (and its remote half).
func (cfg *Config) Release(unitID string) error {
	var res map[string]any
	if err := cfg.SimpleCommand("work release "+unitID, &res); err != nil {
		return err
	}
	if res["released"] != unitID {
		return fmt.Errorf("could not confirm release of receptor work unit id %s, data: %v", unitID, res)
	}
	return nil
}

// Adopt is `work adopt`: this node tracks a unit that another node
// submitted to node, so that `work results` serves it here. The JSON form
// of the command, as the old ReceptorUnitStream.adopt sent it.
func (cfg *Config) Adopt(node, unitID string, tls bool) error {
	s, err := cfg.dial()
	if err != nil {
		return err
	}
	defer s.close()
	cmd := map[string]string{"command": "work", "subcommand": "adopt", "node": node, "unitid": unitID}
	if tls && cfg.TLSClient != "" {
		cmd["tlsclient"] = cfg.TLSClient
	}
	if cfg.WorkSigning {
		cmd["signwork"] = "true"
	}
	b, _ := json.Marshal(cmd)
	if err := s.write(string(b) + "\n"); err != nil {
		return err
	}
	var reply map[string]any
	if err := s.readJSON(&reply); err != nil {
		return err
	}
	// "Adopt Pending" is an adoption too: the unit connects to the node in
	// the background, and its output is served as it arrives.
	if r := reply["result"]; r != "Adopted" && r != "Adopt Pending" {
		return fmt.Errorf("receptor did not adopt work unit %s from %s: %v", unitID, node, reply)
	}
	return nil
}

// Cancel stops a unit.
func (cfg *Config) Cancel(unitID string) error {
	var res map[string]any
	return cfg.SimpleCommand("work cancel "+unitID, &res)
}

// WorkList is `work list`: units by id.
func (cfg *Config) WorkList() (map[string]map[string]any, error) {
	var res map[string]map[string]any
	if err := cfg.SimpleCommand("work list", &res); err != nil {
		return nil, err
	}
	return res, nil
}

// RemoteJobError is a work unit that failed on its node.
type RemoteJobError struct{ Msg string }

func (e *RemoteJobError) Error() string { return e.Msg }

// Timing is what run_until_complete measured.
type Timing struct{ Transmit, Run float64 }

// RunUntilComplete is run_until_complete: an ansible-runner work unit on a
// remote node, waited for (20 seconds at most) and released; it returns
// the unit's stdout.
func (cfg *Config) RunUntilComplete(ctx context.Context, node string, params map[string]string, release bool, timing *Timing) (string, error) {
	ad, err := cfg.FindNode(ctx, node, cfg.Logf)
	if err != nil {
		return "", err
	}
	tls := ""
	if ad.ConnType == ConnStreamTLS {
		tls = cfg.TLSClient
	}
	transmitStart := time.Now()
	unit, err := cfg.SubmitWork(SubmitOptions{WorkType: "ansible-runner", Node: node, TLSClient: tls, TTL: "20s", SignWork: cfg.WorkSigning, Params: params}, strings.NewReader(""))
	if err != nil {
		return "", err
	}
	runStart := time.Now()
	if timing != nil {
		timing.Transmit = runStart.Sub(transmitStart).Seconds()
	}
	defer func() {
		if release {
			_ = cfg.Release(unit)
		}
	}()
	results, err := cfg.Results(unit, 0)
	if err != nil {
		return "", err
	}
	defer results.Close()
	var ws *WorkStatus
	for {
		ws, err = cfg.WorkStatus(unit)
		if err != nil {
			return "", err
		}
		if !ActiveStates[ws.StateName] {
			break
		}
		if time.Since(runStart) >= 20*time.Second {
			return "", &RemoteJobError{fmt.Sprintf("Receptor job timeout on %s after %v seconds, state remains in %s", node, time.Since(runStart).Seconds(), ws.StateName)}
		}
		if err := sleepCtx(ctx, 500*time.Millisecond); err != nil {
			return "", err
		}
	}
	if timing != nil {
		timing.Run = time.Since(runStart).Seconds()
	}
	out, _ := io.ReadAll(results)
	stdout := string(out)
	if strings.EqualFold(ws.StateName, "failed") {
		switch {
		case ws.Detail != "" && stdout != "":
			return stdout, &RemoteJobError{fmt.Sprintf("Receptor error from %s, detail:\n%s\nstdout:\n%s", node, ws.Detail, stdout)}
		case ws.Detail != "":
			return stdout, &RemoteJobError{fmt.Sprintf("Receptor error from %s, detail:\n%s", node, ws.Detail)}
		default:
			return stdout, &RemoteJobError{fmt.Sprintf("Unknown ansible-runner error on node %s, stdout:\n%s", node, stdout)}
		}
	}
	return stdout, nil
}

// WorkerInfo is worker_info: `ansible-runner worker --worker-info` on the
// node, its YAML output merged with what went wrong.
func (cfg *Config) WorkerInfo(ctx context.Context, node string, release bool) map[string]any {
	errs := []string{}
	data := map[string]any{"transmit_timing": 0.0}
	var timing Timing
	stdout, err := cfg.RunUntilComplete(ctx, node, map[string]string{"params": "--worker-info"}, release, &timing)
	data["transmit_timing"] = timing.Transmit
	if timing.Run > 0 {
		data["run_timing"] = timing.Run
	}
	if err != nil {
		var rje *RemoteJobError
		if errors.As(err, &rje) && strings.Contains(rje.Msg, "unrecognized arguments: --worker-info") {
			errs = append(errs, fmt.Sprintf("Old version (2.0.1 or earlier) of ansible-runner on node %s without --worker-info", node))
		} else {
			errs = append(errs, err.Error())
		}
	} else {
		trimmed := strings.TrimSpace(stdout)
		var remote any
		if err := yaml.Unmarshal([]byte(trimmed), &remote); err != nil {
			errs = append(errs, fmt.Sprintf("Failed to parse node %s --worker-info output as YAML, error: %v, data:\n%s", node, err, trimmed))
		}
		if m, ok := remote.(map[string]any); ok {
			if re, ok := m["errors"].([]any); ok {
				for _, e := range re {
					errs = append(errs, fmt.Sprint(e))
				}
			}
			delete(m, "errors")
			for k, v := range m {
				data[k] = v
			}
		} else {
			errs = append(errs, fmt.Sprintf("Remote node %s --worker-info output is not a YAML dict, output:%s", node, stdout))
		}
	}
	if len(errs) == 0 {
		var missing []string
		for _, k := range []string{"runner_version", "mem_in_bytes", "cpu_count"} {
			if _, ok := data[k]; !ok {
				missing = append(missing, k)
			}
		}
		if len(missing) > 0 {
			errs = append(errs, "Worker failed to return keys "+strings.Join(missing, " "))
		}
	}
	data["errors"] = errs
	return data
}
