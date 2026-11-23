package extlog

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func drain(t *testing.T, q *queue, n int) []string {
	t.Helper()
	var out []string
	for i := 0; i < n; i++ {
		ctx, cancel := context.WithTimeout(context.Background(), time.Second)
		it, fromDisk, err := q.peek(ctx)
		cancel()
		if err != nil {
			t.Fatalf("peek %d: %v", i, err)
		}
		out = append(out, string(it.data))
		q.ack(fromDisk)
	}
	return out
}

func rec(i int) item { return item{sev: 6, data: []byte(fmt.Sprintf("r%03d", i))} }

func want(from, to int) []string {
	var out []string
	for i := from; i < to; i++ {
		out = append(out, fmt.Sprintf("r%03d", i))
	}
	return out
}

func eq(a, b []string) bool { return fmt.Sprint(a) == fmt.Sprint(b) }

func nolog(string, ...any) {}

// settle waits for the records waiting for room to get in or be
// discarded.
func settle(t *testing.T, q *queue) {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	for {
		q.mu.Lock()
		n := len(q.pending)
		q.mu.Unlock()
		if n == 0 {
			return
		}
		if time.Now().After(deadline) {
			t.Fatalf("%d record(s) still waiting", n)
		}
		time.Sleep(time.Millisecond)
	}
}

// Past the high water mark records go to disk, and they come back in the
// order they went in.
func TestQueueSpillsInOrder(t *testing.T) {
	q := openQueue(t.TempDir(), "q", QueueLimits{Size: 8, DiscardSeverity: 5, MaxDiskBytes: 1 << 20}, nolog)
	for i := 0; i < 20; i++ {
		q.enqueue(rec(i))
	}
	st := q.snapshot()
	if st.Size != 20 || st.OnDisk != 14 || st.Enqueued != 20 {
		t.Fatalf("stats %+v", st)
	}
	if got := drain(t, q, 20); !eq(got, want(0, 20)) {
		t.Errorf("order %v", got)
	}
	// Spooled records delivered, the spool starts afresh.
	if q.disk.count != 0 || len(q.disk.segs) != 0 {
		t.Errorf("spool left %d records in %v", q.disk.count, q.disk.segs)
	}
}

// What is in memory at shutdown goes to the front of the spool, and a
// restart sends it first, then what was already spooled, without what was
// delivered.
func TestQueueSurvivesRestart(t *testing.T) {
	dir := t.TempDir()
	l := QueueLimits{Size: 8, DiscardSeverity: 5, MaxDiskBytes: 1 << 20}
	q := openQueue(dir, "q", l, nolog)
	for i := 0; i < 20; i++ {
		q.enqueue(rec(i))
	}
	if got := drain(t, q, 3); !eq(got, want(0, 3)) {
		t.Fatalf("first reads %v", got)
	}
	q.close()
	q2 := openQueue(dir, "q", l, nolog)
	if q2.snapshot().Size != 17 {
		t.Fatalf("after restart %+v", q2.snapshot())
	}
	if got := drain(t, q2, 17); !eq(got, want(3, 20)) {
		t.Errorf("after restart %v", got)
	}
	// A second shutdown in the middle of the spool.
	for i := 20; i < 40; i++ {
		q2.enqueue(rec(i))
	}
	drain(t, q2, 9)
	q2.close()
	q3 := openQueue(dir, "q", l, nolog)
	if got := drain(t, q3, 11); !eq(got, want(29, 40)) {
		t.Errorf("after second restart %v", got)
	}
}

// Past the discard mark the less important records go first; at the size
// a record waits for room and is discarded when none comes in time;
// nothing blocks the producer.
func TestQueueDiscards(t *testing.T) {
	q := openQueue("", "q", QueueLimits{Size: 10, DiscardSeverity: 5}, nolog)
	q.timeoutEnqueue = 50 * time.Millisecond
	for i := 0; i < 9; i++ {
		q.enqueue(rec(i))
	}
	q.enqueue(item{sev: 6, data: []byte("info")}) // discarded: 9 >= 9, info
	q.enqueue(item{sev: 4, data: []byte("warning")})
	start := time.Now()
	q.enqueue(item{sev: 3, data: []byte("error")}) // full at 10
	if time.Since(start) > 20*time.Millisecond {
		t.Error("enqueue blocked on a full queue")
	}
	settle(t, q)
	st := q.snapshot()
	if st.Size != 10 || st.DiscardedNF != 1 || st.DiscardedFull != 1 || st.Full != 1 {
		t.Errorf("stats %+v", st)
	}
	got := drain(t, q, 10)
	if got[9] != "warning" {
		t.Errorf("kept %v", got)
	}
	// discardSeverity 8 turns grading off.
	q = openQueue("", "q", QueueLimits{Size: 10, DiscardSeverity: 8}, nolog)
	q.timeoutEnqueue = 10 * time.Millisecond
	for i := 0; i < 12; i++ {
		q.enqueue(item{sev: 7, data: []byte("debug")})
	}
	settle(t, q)
	if st := q.snapshot(); st.Size != 10 || st.DiscardedNF != 0 || st.DiscardedFull != 2 {
		t.Errorf("no grading %+v", st)
	}
}

// A record that finds the queue full gets in when room comes within the
// enqueue timeout, behind the ones already waiting and ahead of later
// ones; what is waiting at shutdown is saved after the queue's own.
func TestQueueFullWaitsForRoom(t *testing.T) {
	q := openQueue("", "q", QueueLimits{Size: 3, DiscardSeverity: 8}, nolog)
	q.timeoutEnqueue = 5 * time.Second
	for i := 0; i < 6; i++ {
		q.enqueue(rec(i))
	}
	if st := q.snapshot(); st.Size != 3 || st.DiscardedFull != 0 {
		t.Fatalf("stats %+v", st)
	}
	if got := drain(t, q, 6); !eq(got, want(0, 6)) {
		t.Errorf("order %v", got)
	}
	settle(t, q)
	if st := q.snapshot(); st.Enqueued != 6 || st.DiscardedFull != 0 {
		t.Errorf("stats %+v", st)
	}

	dir := t.TempDir()
	l := QueueLimits{Size: 2, DiscardSeverity: 8, MaxDiskBytes: 1}
	q = openQueue(dir, "q", l, nolog)
	q.timeoutEnqueue = 5 * time.Second
	for i := 0; i < 4; i++ {
		q.enqueue(rec(i))
	}
	q.close()
	l.MaxDiskBytes = 1 << 20
	q = openQueue(dir, "q", l, nolog)
	if got := drain(t, q, 4); !eq(got, want(0, 4)) {
		t.Errorf("after restart %v", got)
	}
}

// The spool stops at its disk bound; memory then fills up to the size.
func TestQueueDiskBound(t *testing.T) {
	q := openQueue(t.TempDir(), "q", QueueLimits{Size: 8, DiscardSeverity: 8, MaxDiskBytes: 3 * (frameHeader + 4)}, nolog)
	q.timeoutEnqueue = 10 * time.Millisecond
	for i := 0; i < 20; i++ {
		q.enqueue(rec(i))
	}
	settle(t, q)
	st := q.snapshot()
	if st.OnDisk != 3 || st.Size != 8+3 || st.DiscardedFull != 9 {
		t.Errorf("stats %+v", st)
	}
}

// A record the last run did not finish writing is cut off; a run that
// died without its shutdown resends from the last checkpoint.
func TestQueueCrashRecovery(t *testing.T) {
	dir := t.TempDir()
	l := QueueLimits{Size: 4, DiscardSeverity: 8, MaxDiskBytes: 1 << 30}
	q := openQueue(dir, "q", l, nolog)
	for i := 0; i < 2500; i++ {
		q.enqueue(rec(i))
	}
	drain(t, q, 1500)
	// Crash: no close. The checkpoint was written at 1000 delivered reads
	// of the spool (the first 3 came from memory).
	seg := q.disk.segPath(q.disk.segs[len(q.disk.segs)-1])
	f, _ := os.OpenFile(seg, os.O_WRONLY|os.O_APPEND, 0)
	f.Write([]byte{0, 0, 0, 9, 6, 'x'})
	f.Close()
	q2 := openQueue(dir, "q", l, nolog)
	st := q2.snapshot()
	// 2500 - 3 in memory (lost with the crash) - 1000 checkpointed.
	if st.OnDisk != 1497 {
		t.Fatalf("after crash %+v", st)
	}
	got := drain(t, q2, 1497)
	if got[0] != "r1003" || got[len(got)-1] != "r2499" {
		t.Errorf("resent %s..%s", got[0], got[len(got)-1])
	}
	if _, err := os.Stat(filepath.Join(dir, "q.qi")); !os.IsNotExist(err) {
		t.Errorf("checkpoint left after the spool emptied: %v", err)
	}
}

// Segments roll at the file size bound.
func TestQueueSegmentsRoll(t *testing.T) {
	dir := t.TempDir()
	q := openQueue(dir, "q", QueueLimits{Size: 1, DiscardSeverity: 8, MaxDiskBytes: 1 << 30}, nolog)
	big := make([]byte, 30<<20)
	for i := 0; i < 8; i++ {
		big[0] = byte('a' + i)
		q.enqueue(item{sev: 6, data: append([]byte(nil), big...)})
	}
	if n := len(q.disk.segs); n < 2 {
		t.Fatalf("segments %v", q.disk.segs)
	}
	for i := 0; i < 8; i++ {
		ctx, cancel := context.WithTimeout(context.Background(), time.Second)
		it, fromDisk, err := q.peek(ctx)
		cancel()
		if err != nil || it.data[0] != byte('a'+i) || len(it.data) != 30<<20 {
			t.Fatalf("record %d: %v %c", i, err, it.data[0])
		}
		q.ack(fromDisk)
	}
	if entries, _ := os.ReadDir(dir); len(entries) != 0 {
		t.Errorf("files left: %d", len(entries))
	}
}
