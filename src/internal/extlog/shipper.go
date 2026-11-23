package extlog

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// The shipper: every record a process produces goes through Emit to each
// destination that wants it, into that destination's action queue, and a
// worker per destination delivers the queue, retrying for as long as it
// takes. Destinations are a list; today the LOG_AGGREGATOR_* settings
// describe exactly one.

// DefaultSpoolDirectory is where queues spool when the setting names no
// usable directory.
const DefaultSpoolDirectory = "/var/lib/ascender"

// ActionQueueFilename is the queue's file name in the spool directory.
// Each process keeps its own queue, so the component is added to it.
const ActionQueueFilename = "ascender-external-logger-action-queue"

// LegacyActionQueueFilename is the queue file name before the rename.
const LegacyActionQueueFilename = "awx-external-logger-action-queue"

// Destination is one place records go.
type Destination struct {
	// Name tells destinations apart ("default" for the LOG_AGGREGATOR_*
	// one).
	Name string
	// Config is the format and the filters (and the transport fields).
	Config    Config
	KeepAlive KeepAlive
	Queue     QueueLimits
	// SpoolDir is LOG_AGGREGATOR_MAX_DISK_USAGE_PATH.
	SpoolDir string
	// ErrorFile is LOG_AGGREGATOR_RSYSLOGD_ERROR_LOG_FILE (http only).
	ErrorFile string
	// MaxMessageSize is rsyslog's maxMessageSize (MAX_EVENT_RES_DATA).
	MaxMessageSize int
	// StatsInterval is LOG_AGGREGATOR_ACTION_QUEUE_STATS_INTERVAL.
	StatsInterval time.Duration
	// Debug is LOG_AGGREGATOR_RSYSLOGD_DEBUG.
	Debug bool
}

// Shipper sends one process's records.
type Shipper struct {
	component string
	errOut    func(string)
	mu        sync.Mutex
	dests     map[string]*destination
	// active is what Emit reads without locking.
	active atomic.Pointer[[]*destination]
	ctx    context.Context
	cancel context.CancelFunc
	closed bool
	// spools remembers what each setting resolved to, so the warnings
	// come once per change, as the old config writer gave them.
	spools map[string]string
	// refresh wakes Run to apply the destinations again at once.
	refresh chan struct{}
}

type destination struct {
	s      *Shipper
	name   string
	cfg    atomic.Pointer[Destination]
	q      *queue
	spool  string
	tr     transport
	sink   sink
	cancel context.CancelFunc
	done   chan struct{}
	stats  actionStats
}

type actionStats struct {
	processed, failed, suspended, resumed atomic.Int64
	suspendedNs                           atomic.Int64
}

// NewShipper is the shipper of one component ("web", "task").
func NewShipper(component string) *Shipper {
	s := &Shipper{component: component, dests: map[string]*destination{}, refresh: make(chan struct{}, 1)}
	s.errOut = func(msg string) {
		fmt.Fprintf(os.Stderr, "%s ERROR external logging: %s\n", time.Now().UTC().Format("2006-01-02 15:04:05"), msg)
	}
	s.ctx, s.cancel = context.WithCancel(context.Background())
	empty := []*destination{}
	s.active.Store(&empty)
	return s
}

var defaultShipper atomic.Pointer[Shipper]

// SetDefault makes s the process's shipper.
func SetDefault(s *Shipper) { defaultShipper.Store(s) }

// Default is the process's shipper (nil, which drops everything, until
// one is set).
func Default() *Shipper { return defaultShipper.Load() }

func (s *Shipper) logf(format string, args ...any) {
	if s != nil && s.errOut != nil {
		s.errOut(fmt.Sprintf(format, args...))
	}
}

// Wants reports whether any destination takes a record of this logger
// and level, so producers build records only when one is wanted.
func (s *Shipper) Wants(logger, level string) bool {
	if s == nil {
		return false
	}
	rec := Record{Logger: logger, Level: level}
	for _, d := range *s.active.Load() {
		if d.cfg.Load().Config.Allowed(rec) {
			return true
		}
	}
	return false
}

// Emit queues a record for every destination that takes it. It never
// blocks: a full queue discards, as the old one did.
func (s *Shipper) Emit(rec Record) {
	if s == nil {
		return
	}
	if rec.Time.IsZero() {
		rec.Time = time.Now()
	}
	for _, d := range *s.active.Load() {
		cfg := d.cfg.Load()
		if !cfg.Config.Allowed(rec) {
			continue
		}
		msg := cfg.Config.Format(rec)
		msg = msg[:len(msg)-1] // the framing newline; outputs add their own
		if cfg.MaxMessageSize > 0 && len(msg) > cfg.MaxMessageSize {
			msg = msg[:cfg.MaxMessageSize]
		}
		d.q.enqueue(item{sev: severity(rec.Level), data: msg})
	}
}

// severity is the syslog severity SysLogHandler gave a level.
func severity(level string) uint8 {
	switch level {
	case "DEBUG":
		return 7
	case "INFO":
		return 6
	case "WARNING":
		return 4
	case "ERROR":
		return 3
	case "CRITICAL":
		return 2
	}
	return 4
}

// Apply makes the destinations these: new ones start, removed or disabled
// ones stop (their queues saved to disk), and changed ones take the new
// settings, a new output when the transport changed.
func (s *Shipper) Apply(dests []Destination) {
	if s == nil {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return
	}
	want := map[string]Destination{}
	for _, d := range dests {
		if d.Config.delivers() {
			want[d.Name] = d
		}
	}
	for name, d := range s.dests {
		if _, ok := want[name]; !ok {
			d.stop()
			d.q.close()
			delete(s.dests, name)
		}
	}
	for name, cfg := range want {
		cfg := cfg
		d := s.dests[name]
		spool := s.spoolDir(cfg.SpoolDir)
		if d != nil && d.spool != spool {
			d.stop()
			d.q.close()
			d = nil
		}
		if d == nil {
			d = &destination{s: s, name: name, spool: spool}
			d.cfg.Store(&cfg)
			d.q = openQueue(spool, s.queueName(name), cfg.Queue, s.logf)
			s.dests[name] = d
			d.start(cfg)
			continue
		}
		d.cfg.Store(&cfg)
		d.q.setLimits(cfg.Queue)
		if tr := cfg.transport(); !reflect.DeepEqual(tr, d.tr) {
			d.stop()
			d.start(cfg)
		}
	}
	list := make([]*destination, 0, len(s.dests))
	for _, d := range s.dests {
		list = append(list, d)
	}
	sort.Slice(list, func(i, k int) bool { return list[i].name < list[k].name })
	s.active.Store(&list)
}

func (s *Shipper) queueName(dest string) string {
	name := ActionQueueFilename + "-" + s.component
	if dest != "" && dest != "default" {
		name += "-" + dest
	}
	return name
}

// spoolDir is the setting's directory when it is one this process can
// write and enter, else the default, else none (memory only).
func (s *Shipper) spoolDir(dir string) string {
	setting := dir
	dir = strings.TrimRight(dir, "/")
	if dir == "" {
		dir = DefaultSpoolDirectory
	}
	resolved := dir
	if !usableDir(dir) {
		resolved = DefaultSpoolDirectory
		if !usableDir(resolved) {
			resolved = ""
		}
	}
	if s.spools == nil {
		s.spools = map[string]string{}
	}
	if prev, ok := s.spools[setting]; ok && prev == resolved {
		return resolved
	}
	s.spools[setting] = resolved
	if resolved != dir {
		s.logf("Cannot spool external logs in %s, using %s instead.", dir, DefaultSpoolDirectory)
		if resolved == "" {
			s.logf("Cannot spool external logs in %s either; the queue is kept in memory and does not survive a restart.", DefaultSpoolDirectory)
			return ""
		}
	}
	s.warnAbandoned(resolved)
	return resolved
}

// warnAbandoned reports queue files nothing will send: the old name's, and
// rsyslog's from the Python application.
func (s *Shipper) warnAbandoned(dir string) {
	var left []string
	for _, prefix := range []string{LegacyActionQueueFilename, ActionQueueFilename} {
		matches, _ := filepath.Glob(filepath.Join(dir, prefix+".*"))
		for _, m := range matches {
			left = append(left, filepath.Base(m))
		}
	}
	if len(left) > 0 {
		sort.Strings(left)
		s.logf("External log records spooled by the previous logging service are still in %s and will not be sent: %s. Deliver those files or remove them.", dir, strings.Join(left, ", "))
	}
}

func (d *destination) start(cfg Destination) {
	d.tr = cfg.transport()
	sk, err := newSink(d.tr, cfg.Config, d.s.logf)
	if err != nil {
		d.s.logf("destination %s: %v; records are queued but not sent", d.name, err)
	}
	d.sink = sk
	ctx, cancel := context.WithCancel(d.s.ctx)
	d.cancel = cancel
	d.done = make(chan struct{})
	go d.run(ctx)
}

func (d *destination) stop() {
	if d.cancel != nil {
		d.cancel()
		<-d.done
		d.cancel = nil
	}
	if d.sink != nil {
		d.sink.close()
		d.sink = nil
	}
}

// run delivers the queue: a record leaves it once sent, or refused; any
// other failure suspends the output for the resume interval and the same
// record is tried again, for ever (action.resumeRetryCount -1).
func (d *destination) run(ctx context.Context) {
	defer close(d.done)
	var suspendedAt time.Time
	for {
		it, fromDisk, err := d.q.peek(ctx)
		if err != nil {
			return
		}
		cfg := d.cfg.Load()
		if d.sink == nil {
			select {
			case <-ctx.Done():
				return
			case <-time.After(d.tr.timeout()):
				continue
			}
		}
		err = d.sink.send(ctx, it.data)
		if ctx.Err() != nil {
			return
		}
		var refused *refusedError
		switch {
		case err == nil:
			d.q.ack(fromDisk)
			d.stats.processed.Add(1)
			if !suspendedAt.IsZero() {
				d.stats.resumed.Add(1)
				d.stats.suspendedNs.Add(int64(time.Since(suspendedAt)))
				d.s.logf("destination %s resumed after %s", d.name, time.Since(suspendedAt).Round(time.Second))
				suspendedAt = time.Time{}
			}
			if cfg.Debug {
				d.s.logf("destination %s: sent %d bytes", d.name, len(it.data))
			}
		case errors.As(err, &refused):
			d.q.ack(fromDisk)
			d.stats.failed.Add(1)
			d.s.logf("destination %s refused a record: %v", d.name, err)
		default:
			if suspendedAt.IsZero() {
				suspendedAt = time.Now()
				d.stats.suspended.Add(1)
				d.s.logf("destination %s is unreachable, retrying every %s: %v", d.name, d.tr.timeout(), err)
			} else if cfg.Debug {
				d.s.logf("destination %s: still unreachable: %v", d.name, err)
			}
			select {
			case <-ctx.Done():
				return
			case <-time.After(d.tr.timeout()):
			}
		}
	}
}

// Refresh has Run apply the destinations again now rather than at its
// next interval: the settings changed.
func (s *Shipper) Refresh() {
	if s != nil {
		wake(s.refresh)
	}
}

// Run applies the destinations load returns now, every interval and on
// Refresh, and reports queue statistics every
// LOG_AGGREGATOR_ACTION_QUEUE_STATS_INTERVAL, until ctx ends.
func (s *Shipper) Run(ctx context.Context, load func(context.Context) []Destination, every time.Duration) {
	if s == nil {
		return
	}
	s.Apply(load(ctx))
	t := time.NewTicker(every)
	defer t.Stop()
	var stats *time.Ticker
	var statsC <-chan time.Time
	var statsEvery time.Duration
	defer func() {
		if stats != nil {
			stats.Stop()
		}
	}()
	for {
		// impstats' interval: the shortest any destination asks for.
		var interval time.Duration
		for _, d := range *s.active.Load() {
			if iv := d.cfg.Load().StatsInterval; iv > 0 && (interval == 0 || iv < interval) {
				interval = iv
			}
		}
		if interval != statsEvery {
			if stats != nil {
				stats.Stop()
				stats, statsC = nil, nil
			}
			if interval > 0 {
				stats = time.NewTicker(interval)
				statsC = stats.C
			}
			statsEvery = interval
		}
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			s.Apply(load(ctx))
		case <-s.refresh:
			s.Apply(load(ctx))
		case <-statsC:
			s.writeStats()
		}
	}
}

// writeStats is impstats' JSON on standard output: each destination's
// queue and output counters.
func (s *Shipper) writeStats() {
	for _, d := range *s.active.Load() {
		st := d.q.snapshot()
		qname := s.queueName(d.name)
		q, _ := json.Marshal(map[string]any{"name": qname + " queue", "origin": "core.queue", "size": st.Size, "enqueued": st.Enqueued, "full": st.Full,
			"discarded.full": st.DiscardedFull, "discarded.nf": st.DiscardedNF, "maxqsize": st.MaxQSize, "ondisk": st.OnDisk})
		a, _ := json.Marshal(map[string]any{"name": qname, "origin": "core.action", "processed": d.stats.processed.Load(), "failed": d.stats.failed.Load(),
			"suspended": d.stats.suspended.Load(), "suspended.duration": d.stats.suspendedNs.Load() / int64(time.Second), "resumed": d.stats.resumed.Load()})
		fmt.Fprintf(os.Stdout, "%s\n%s\n", q, a)
	}
}

// Stats are a destination's queue counters, for tests and diagnostics.
func (s *Shipper) Stats(dest string) (QueueStats, bool) {
	if s == nil {
		return QueueStats{}, false
	}
	for _, d := range *s.active.Load() {
		if d.name == dest {
			return d.q.snapshot(), true
		}
	}
	return QueueStats{}, false
}

// Close stops the outputs and saves every queue to disk
// (queue.saveOnShutdown). Records emitted afterwards are dropped.
func (s *Shipper) Close() {
	if s == nil {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return
	}
	s.closed = true
	for _, d := range s.dests {
		d.stop()
	}
	empty := []*destination{}
	s.active.Store(&empty)
	for _, d := range s.dests {
		d.q.close()
	}
	s.cancel()
}

type guidKey struct{}

// WithGUID carries the correlation id (django_guid's) records made in ctx
// carry: the request id in the API, the task id in the task runner.
func WithGUID(ctx context.Context, guid string) context.Context {
	return context.WithValue(ctx, guidKey{}, guid)
}

// GUID is ctx's correlation id, or nil.
func GUID(ctx context.Context) any {
	if ctx == nil {
		return nil
	}
	if g, ok := ctx.Value(guidKey{}).(string); ok && g != "" {
		return g
	}
	return nil
}
