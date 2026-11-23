package extlog

import (
	"bufio"
	"context"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

// The action queue: what the old rsyslog configuration asked of its queue
// (main/utils/external_logging.py), kept for each destination. A
// LinkedList queue in memory that goes to disk from its high water mark,
// in queue.maxFileSize segment files in the spool directory, fsynced and
// checkpointed every thousand records, bounded at queue.size records in
// memory and queue.maxDiskSpace on disk, saved to disk on shutdown and
// read back on start, and discarding the least important records once it
// is nine tenths full. A record that finds the queue full waits up to
// queue.timeoutEnqueue (rsyslog's two seconds) for room before it is
// discarded; it waits in front of the queue, in what rsyslog's main
// queue was, so the process that produced it does not.

const (
	// queueMaxFileBytes is queue.maxFileSize.
	queueMaxFileBytes = 100 << 20
	// queueCheckpoint is queue.checkpointInterval.
	queueCheckpoint = 1000
	// frameHeader is a spooled record's length and severity.
	frameHeader = 5
	// enqueueTimeout is queue.timeoutEnqueue's default: how long a record
	// waits for room in a full queue before it is discarded.
	enqueueTimeout = 2 * time.Second
	// maxPending is rsyslog's main queue size (100000 records): what
	// waits in front of a full action queue. Past it records are
	// discarded at once.
	maxPending = 100000
)

// QueueLimits are the queue's settings.
type QueueLimits struct {
	// Size is LOG_AGGREGATOR_ACTION_QUEUE_SIZE: records in memory.
	Size int
	// MaxDiskBytes is LOG_AGGREGATOR_ACTION_MAX_DISK_USAGE_GB.
	MaxDiskBytes int64
	// DiscardSeverity is LOG_AGGREGATOR_ACTION_QUEUE_DISCARD_SEVERITY:
	// records of this syslog severity number or above are discarded at
	// the discard mark (5 discards notice, info and debug; 8 nothing).
	DiscardSeverity int
}

// highWater is queue.highwaterMark: 75% of the size.
func (l QueueLimits) highWater() int { return int(float64(l.Size) * 0.75) }

// discardMark is queue.discardMark: 90% of the size.
func (l QueueLimits) discardMark() int { return int(float64(l.Size) * 0.9) }

// QueueStats are what impstats reported of a queue.
type QueueStats struct {
	Size          int64 `json:"size"`
	Enqueued      int64 `json:"enqueued"`
	Full          int64 `json:"full"`
	DiscardedFull int64 `json:"discarded.full"`
	DiscardedNF   int64 `json:"discarded.nf"`
	MaxQSize      int64 `json:"maxqsize"`
	// OnDisk is how many of the queued records are spooled.
	OnDisk int64 `json:"-"`
}

type item struct {
	sev  uint8
	data []byte
}

// queue is one destination's action queue, with one consumer.
type queue struct {
	mu     sync.Mutex
	notify chan struct{}
	limits QueueLimits
	mem    []item
	head   int
	disk   *spool
	closed bool
	stats  QueueStats
	logf   func(string, ...any)

	// pending are the records waiting for room, in order, which the
	// feeder moves in; while there are any, new records join them.
	pending []item
	// pendingSig wakes the feeder, room tells it a record left.
	pendingSig, room chan struct{}
	stop             chan struct{}
	timeoutEnqueue   time.Duration
}

// openQueue opens the queue spooled at dir/name, reading back what an
// earlier run left there. dir "" keeps the queue in memory only.
func openQueue(dir, name string, limits QueueLimits, logf func(string, ...any)) *queue {
	q := &queue{notify: make(chan struct{}, 1), limits: limits, logf: logf,
		pendingSig: make(chan struct{}, 1), room: make(chan struct{}, 1), stop: make(chan struct{}), timeoutEnqueue: enqueueTimeout}
	go q.feed()
	if dir != "" {
		sp, err := openSpool(dir, name)
		if err != nil {
			logf("External log queue %s cannot be spooled in %s, keeping it in memory: %v", name, dir, err)
		} else {
			q.disk = sp
			if sp.count > 0 {
				logf("External log queue %s: %d record(s) spooled by an earlier run will be sent", name, sp.count)
			}
		}
	}
	return q
}

func (q *queue) setLimits(l QueueLimits) {
	q.mu.Lock()
	q.limits = l
	q.mu.Unlock()
	wake(q.room)
}

func (q *queue) signal() { wake(q.notify) }

func wake(c chan struct{}) {
	select {
	case c <- struct{}{}:
	default:
	}
}

func (q *queue) memLen() int { return len(q.mem) - q.head }

func (q *queue) diskCount() int64 {
	if q.disk == nil {
		return 0
	}
	return q.disk.count
}

// enqueue adds a record without ever blocking the producer: to disk past
// the high water mark (and while anything is spooled, to keep the order),
// otherwise to memory, discarding past the discard mark by severity. A
// record that finds the queue full (the disk cannot take it and memory is
// at the size) waits for room behind any already waiting.
func (q *queue) enqueue(it item) {
	q.mu.Lock()
	defer q.mu.Unlock()
	if q.closed {
		q.stats.DiscardedFull++
		return
	}
	if len(q.pending) == 0 && q.tryAdd(it) != addFull {
		return
	}
	if len(q.pending) >= maxPending {
		q.stats.Full++
		q.stats.DiscardedFull++
		return
	}
	q.pending = append(q.pending, it)
	wake(q.pendingSig)
}

type addResult int

const (
	addDone addResult = iota // queued, or discarded by severity
	addFull
)

// tryAdd queues a record if there is room for it; q.mu is held.
func (q *queue) tryAdd(it item) addResult {
	n := q.memLen()
	if q.disk != nil && (n >= q.limits.highWater() || q.disk.count > 0) && q.disk.hasRoom(len(it.data), q.limits.MaxDiskBytes) {
		if err := q.disk.append(it); err == nil {
			q.added()
			return addDone
		} else {
			q.logf("External log queue spool failed, keeping records in memory: %v", err)
			q.disk.close()
			q.disk = nil
		}
	}
	if n >= q.limits.discardMark() && int(it.sev) >= q.limits.DiscardSeverity {
		q.stats.DiscardedNF++
		return addDone
	}
	if n >= q.limits.Size {
		return addFull
	}
	q.mem = append(q.mem, it)
	q.added()
	return addDone
}

// feed moves the waiting records in, in order: each waits up to
// timeoutEnqueue for room and is discarded if none comes.
func (q *queue) feed() {
	for {
		q.mu.Lock()
		if q.closed {
			q.mu.Unlock()
			return
		}
		if len(q.pending) == 0 {
			q.mu.Unlock()
			select {
			case <-q.pendingSig:
			case <-q.stop:
				return
			}
			continue
		}
		it := q.pending[0]
		if q.tryAdd(it) != addFull {
			q.popPending()
			q.mu.Unlock()
			continue
		}
		q.stats.Full++
		q.mu.Unlock()
		if !q.waitForRoom(it) {
			return
		}
	}
}

// waitForRoom retries the first waiting record whenever one leaves the
// queue, until it gets in or its time is up; false when the queue closed.
func (q *queue) waitForRoom(it item) bool {
	timer := time.NewTimer(q.timeoutEnqueue)
	defer timer.Stop()
	for {
		select {
		case <-q.stop:
			return false
		case <-timer.C:
			q.mu.Lock()
			defer q.mu.Unlock()
			if q.closed {
				return false
			}
			q.stats.DiscardedFull++
			q.popPending()
			return true
		case <-q.room:
			q.mu.Lock()
			if q.closed {
				q.mu.Unlock()
				return false
			}
			if q.tryAdd(it) != addFull {
				q.popPending()
				q.mu.Unlock()
				return true
			}
			q.mu.Unlock()
		}
	}
}

func (q *queue) popPending() {
	q.pending[0] = item{}
	q.pending = q.pending[1:]
	if len(q.pending) == 0 {
		q.pending = nil
	}
}

func (q *queue) added() {
	q.stats.Enqueued++
	if s := int64(q.memLen()) + q.diskCount(); s > q.stats.MaxQSize {
		q.stats.MaxQSize = s
	}
	q.signal()
}

// peek waits for the next record; fromDisk says where it came from, for
// ack.
func (q *queue) peek(ctx context.Context) (item, bool, error) {
	for {
		q.mu.Lock()
		if q.memLen() > 0 {
			it := q.mem[q.head]
			q.mu.Unlock()
			return it, false, nil
		}
		if q.disk != nil && q.disk.count > 0 {
			it, err := q.disk.peek()
			if err != nil {
				q.logf("External log queue spool unreadable, dropping what is left of it: %v", err)
				q.disk.reset()
				q.mu.Unlock()
				continue
			}
			q.mu.Unlock()
			return it, true, nil
		}
		q.mu.Unlock()
		select {
		case <-q.notify:
		case <-ctx.Done():
			return item{}, false, ctx.Err()
		}
	}
}

// ack removes the record peek returned.
func (q *queue) ack(fromDisk bool) {
	q.mu.Lock()
	defer q.mu.Unlock()
	defer wake(q.room)
	if fromDisk {
		if q.disk != nil {
			if err := q.disk.ack(); err != nil {
				q.logf("External log queue checkpoint failed: %v", err)
			}
		}
		return
	}
	if q.memLen() == 0 {
		return
	}
	q.mem[q.head] = item{}
	q.head++
	if q.head > 1024 && q.head*2 > len(q.mem) {
		q.mem = append([]item(nil), q.mem[q.head:]...)
		q.head = 0
	}
}

func (q *queue) snapshot() QueueStats {
	q.mu.Lock()
	defer q.mu.Unlock()
	st := q.stats
	st.OnDisk = q.diskCount()
	st.Size = int64(q.memLen()) + st.OnDisk
	return st
}

// close is queue.saveOnShutdown: what is still in memory goes to the front
// of the spool, read back first on the next start.
func (q *queue) close() {
	q.mu.Lock()
	defer q.mu.Unlock()
	if q.closed {
		return
	}
	q.closed = true
	close(q.stop)
	// The records still waiting for room come after the queue's own.
	rest := append(q.mem[q.head:len(q.mem):len(q.mem)], q.pending...)
	q.pending = nil
	if q.disk == nil {
		if len(rest) > 0 {
			q.logf("External log queue: %d record(s) in memory are lost, there is no spool to save them in", len(rest))
		}
		return
	}
	if len(rest) > 0 {
		if err := q.disk.prepend(rest); err != nil {
			q.logf("External log queue: could not save %d record(s) on shutdown: %v", len(rest), err)
		}
	}
	q.mem, q.head = nil, 0
	q.disk.close()
}

// spool is the queue's disk part: segment files <name>.<seq> read in
// order, and <name>.qi, the read position checkpoint.
type spool struct {
	dir, name string
	segs      []int64
	// starts are where reading begins in segments a shutdown put a
	// segment in front of.
	starts  map[int64]int64
	readSeq int64
	readOff int64
	w       *os.File
	wbuf    *bufio.Writer
	wSeq    int64
	wSize   int64
	r       *os.File
	rSeq    int64
	count   int64
	bytes   int64
	unsync  int
	acked   int
}

type spoolCheckpoint struct {
	Seq    int64            `json:"seq"`
	Off    int64            `json:"off"`
	Starts map[string]int64 `json:"starts,omitempty"`
}

// firstSeq leaves room for segments put in front on shutdown.
const firstSeq = 100000000

func (s *spool) segPath(seq int64) string {
	return filepath.Join(s.dir, fmt.Sprintf("%s.%08d", s.name, seq))
}

func (s *spool) qiPath() string { return filepath.Join(s.dir, s.name+".qi") }

func openSpool(dir, name string) (*spool, error) {
	s := &spool{dir: dir, name: name, starts: map[int64]int64{}}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	for _, e := range entries {
		rest, ok := strings.CutPrefix(e.Name(), name+".")
		if !ok {
			continue
		}
		if seq, err := strconv.ParseInt(rest, 10, 64); err == nil {
			s.segs = append(s.segs, seq)
		}
	}
	sort.Slice(s.segs, func(i, k int) bool { return s.segs[i] < s.segs[k] })
	if b, err := os.ReadFile(s.qiPath()); err == nil {
		var cp spoolCheckpoint
		if json.Unmarshal(b, &cp) == nil {
			s.readSeq, s.readOff = cp.Seq, cp.Off
			for k, v := range cp.Starts {
				if seq, err := strconv.ParseInt(k, 10, 64); err == nil {
					s.starts[seq] = v
				}
			}
		}
	}
	// Segments before the read position were delivered.
	var keep []int64
	for _, seq := range s.segs {
		if s.readSeq != 0 && seq < s.readSeq {
			_ = os.Remove(s.segPath(seq))
			continue
		}
		keep = append(keep, seq)
	}
	s.segs = keep
	if len(s.segs) == 0 {
		s.readSeq, s.readOff = 0, 0
		return s, nil
	}
	if s.readSeq == 0 || s.readSeq != s.segs[0] {
		s.readSeq, s.readOff = s.segs[0], s.starts[s.segs[0]]
	}
	// Count what is left, cutting a record the last run did not finish.
	for i, seq := range s.segs {
		off := s.starts[seq]
		if seq == s.readSeq {
			off = s.readOff
		}
		n, b, end, err := scanSegment(s.segPath(seq), off)
		if err != nil {
			return nil, err
		}
		s.count += n
		s.bytes += b
		if i == len(s.segs)-1 {
			if st, err := os.Stat(s.segPath(seq)); err == nil && st.Size() > end {
				_ = os.Truncate(s.segPath(seq), end)
			}
		}
	}
	return s, nil
}

// scanSegment counts the whole records from off on; end is where the
// last whole one ends.
func scanSegment(path string, off int64) (n, size, end int64, err error) {
	f, err := os.Open(path)
	if err != nil {
		return 0, 0, 0, err
	}
	defer f.Close()
	st, err := f.Stat()
	if err != nil {
		return 0, 0, 0, err
	}
	end = off
	hdr := make([]byte, frameHeader)
	for {
		if _, err := f.ReadAt(hdr, end); err != nil {
			return n, size, end, nil
		}
		l := int64(binary.BigEndian.Uint32(hdr[:4]))
		if end+frameHeader+l > st.Size() {
			return n, size, end, nil
		}
		end += frameHeader + l
		n++
		size += frameHeader + l
	}
}

func (s *spool) hasRoom(n int, max int64) bool {
	return max <= 0 || s.bytes+int64(n)+frameHeader <= max
}

func (s *spool) lastSeq() int64 {
	if len(s.segs) == 0 {
		return firstSeq - 1
	}
	return s.segs[len(s.segs)-1]
}

func (s *spool) roll() error {
	if err := s.flushSync(); err != nil {
		return err
	}
	if s.w != nil {
		_ = s.w.Close()
		s.w, s.wbuf = nil, nil
	}
	seq := s.lastSeq() + 1
	if s.wSeq == 0 && len(s.segs) > 0 {
		// Continue the last segment an earlier run wrote.
		seq = s.lastSeq()
	}
	f, err := os.OpenFile(s.segPath(seq), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
	if err != nil {
		return err
	}
	st, err := f.Stat()
	if err != nil {
		f.Close()
		return err
	}
	if st.Size() >= queueMaxFileBytes {
		f.Close()
		seq = s.lastSeq() + 1
		if f, err = os.OpenFile(s.segPath(seq), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600); err != nil {
			return err
		}
		st, _ = f.Stat()
	}
	s.w, s.wbuf, s.wSeq, s.wSize = f, bufio.NewWriterSize(f, 64<<10), seq, st.Size()
	if len(s.segs) == 0 || s.segs[len(s.segs)-1] != seq {
		s.segs = append(s.segs, seq)
	}
	if s.readSeq == 0 {
		s.readSeq, s.readOff = seq, s.wSize
	}
	return nil
}

func (s *spool) append(it item) error {
	frame := int64(frameHeader + len(it.data))
	if s.w == nil || s.wSize+frame > queueMaxFileBytes {
		if err := s.roll(); err != nil {
			return err
		}
	}
	var hdr [frameHeader]byte
	binary.BigEndian.PutUint32(hdr[:4], uint32(len(it.data)))
	hdr[4] = it.sev
	if _, err := s.wbuf.Write(hdr[:]); err != nil {
		return err
	}
	if _, err := s.wbuf.Write(it.data); err != nil {
		return err
	}
	// Written through, so the reader sees it; synced every checkpoint.
	if err := s.wbuf.Flush(); err != nil {
		return err
	}
	s.wSize += frame
	s.count++
	s.bytes += frame
	s.unsync++
	if s.unsync >= queueCheckpoint {
		return s.flushSync()
	}
	return nil
}

func (s *spool) flushSync() error {
	if s.w == nil {
		return nil
	}
	if err := s.wbuf.Flush(); err != nil {
		return err
	}
	s.unsync = 0
	return s.w.Sync()
}

// peek reads the record at the read position.
func (s *spool) peek() (item, error) {
	for {
		if s.r == nil || s.rSeq != s.readSeq {
			if s.r != nil {
				s.r.Close()
			}
			f, err := os.Open(s.segPath(s.readSeq))
			if err != nil {
				return item{}, err
			}
			s.r, s.rSeq = f, s.readSeq
		}
		hdr := make([]byte, frameHeader)
		_, err := s.r.ReadAt(hdr, s.readOff)
		if err == nil {
			l := int64(binary.BigEndian.Uint32(hdr[:4]))
			data := make([]byte, l)
			if _, err := s.r.ReadAt(data, s.readOff+frameHeader); err != nil {
				return item{}, fmt.Errorf("segment %d at %d: %w", s.readSeq, s.readOff, err)
			}
			return item{sev: hdr[4], data: data}, nil
		}
		if !errors.Is(err, io.EOF) {
			return item{}, err
		}
		// This segment is read to its end: on to the next one.
		if !s.advance() {
			return item{}, fmt.Errorf("segment %d ended with %d record(s) still counted", s.readSeq, s.count)
		}
	}
}

// advance moves to the next segment, removing the finished one.
func (s *spool) advance() bool {
	if len(s.segs) < 2 || s.segs[0] != s.readSeq {
		return false
	}
	if s.r != nil {
		s.r.Close()
		s.r = nil
	}
	if s.w != nil && s.wSeq == s.readSeq {
		return false
	}
	_ = os.Remove(s.segPath(s.readSeq))
	s.segs = s.segs[1:]
	s.readSeq = s.segs[0]
	s.readOff = s.starts[s.readSeq]
	delete(s.starts, s.readSeq)
	return true
}

func (s *spool) ack() error {
	hdr := make([]byte, frameHeader)
	if s.r == nil {
		return nil
	}
	if _, err := s.r.ReadAt(hdr, s.readOff); err != nil {
		return err
	}
	frame := int64(frameHeader) + int64(binary.BigEndian.Uint32(hdr[:4]))
	s.readOff += frame
	s.count--
	s.bytes -= frame
	s.acked++
	if s.count == 0 {
		// Everything spooled was delivered: start afresh.
		return s.reset()
	}
	if s.acked >= queueCheckpoint {
		return s.checkpoint()
	}
	return nil
}

// checkpoint writes the read position, atomically and synced.
func (s *spool) checkpoint() error {
	s.acked = 0
	cp := spoolCheckpoint{Seq: s.readSeq, Off: s.readOff}
	if len(s.starts) > 0 {
		cp.Starts = map[string]int64{}
		for k, v := range s.starts {
			cp.Starts[strconv.FormatInt(k, 10)] = v
		}
	}
	b, _ := json.Marshal(cp)
	tmp := s.qiPath() + ".tmp"
	f, err := os.OpenFile(tmp, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o600)
	if err != nil {
		return err
	}
	if _, err := f.Write(b); err != nil {
		f.Close()
		return err
	}
	if err := f.Sync(); err != nil {
		f.Close()
		return err
	}
	f.Close()
	return os.Rename(tmp, s.qiPath())
}

// reset removes every segment and the checkpoint.
func (s *spool) reset() error {
	if s.r != nil {
		s.r.Close()
		s.r = nil
	}
	if s.w != nil {
		s.w.Close()
		s.w, s.wbuf = nil, nil
	}
	for _, seq := range s.segs {
		_ = os.Remove(s.segPath(seq))
	}
	_ = os.Remove(s.qiPath())
	s.segs, s.starts = nil, map[int64]int64{}
	s.readSeq, s.readOff, s.wSeq, s.wSize, s.count, s.bytes, s.acked, s.unsync = 0, 0, 0, 0, 0, 0, 0, 0
	return nil
}

// prepend writes records in front of everything spooled.
func (s *spool) prepend(items []item) error {
	seq := int64(firstSeq - 1)
	if len(s.segs) > 0 {
		seq = s.segs[0] - 1
		if s.readOff > 0 {
			s.starts[s.segs[0]] = s.readOff
		}
	}
	f, err := os.OpenFile(s.segPath(seq), os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o600)
	if err != nil {
		return err
	}
	w := bufio.NewWriter(f)
	var size int64
	for _, it := range items {
		var hdr [frameHeader]byte
		binary.BigEndian.PutUint32(hdr[:4], uint32(len(it.data)))
		hdr[4] = it.sev
		w.Write(hdr[:])
		w.Write(it.data)
		size += int64(frameHeader + len(it.data))
	}
	if err := w.Flush(); err != nil {
		f.Close()
		return err
	}
	if err := f.Sync(); err != nil {
		f.Close()
		return err
	}
	f.Close()
	s.segs = append([]int64{seq}, s.segs...)
	s.readSeq, s.readOff = seq, 0
	s.count += int64(len(items))
	s.bytes += size
	return s.checkpoint()
}

func (s *spool) close() {
	_ = s.flushSync()
	if s.count > 0 {
		_ = s.checkpoint()
	}
	if s.w != nil {
		s.w.Close()
		s.w, s.wbuf = nil, nil
	}
	if s.r != nil {
		s.r.Close()
		s.r = nil
	}
}

// usableDir is the old check: a directory, writable and searchable.
func usableDir(dir string) bool {
	st, err := os.Stat(dir)
	if err != nil || !st.IsDir() {
		return false
	}
	return syscall.Access(dir, 0x2|0x1) == nil
}
