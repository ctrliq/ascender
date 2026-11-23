package tasks

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// fakeEventDB stores events by their "uuid" argument: an event whose
// stdout holds a NUL fails (as PostgreSQL text does), "bad" always fails,
// a stored uuid comes back as no row (ON CONFLICT DO NOTHING), and down
// makes the batch fail without a server error.
type fakeEventDB struct {
	stored map[string]int64
	down   bool
	next   int64
}

func (f *fakeEventDB) insert(args []any) (int64, error) {
	uuid, stdout := args[0].(string), args[1].(string)
	if strings.Contains(stdout, "\x00") || stdout == "bad" {
		return 0, &pgconn.PgError{Code: "22021", Message: "invalid byte sequence"}
	}
	if _, ok := f.stored[uuid]; ok {
		return 0, pgx.ErrNoRows
	}
	f.next++
	f.stored[uuid] = f.next
	return f.next, nil
}

type fakeRow struct {
	id  int64
	err error
}

func (r fakeRow) Scan(dest ...any) error {
	if r.err != nil {
		return r.err
	}
	*dest[0].(*int64) = r.id
	return nil
}

// fakeBatch has the BatchResults methods saveEvents uses.
type fakeBatch struct {
	pgx.BatchResults
	rows []fakeRow
}

func (b *fakeBatch) QueryRow() pgx.Row {
	r := b.rows[0]
	b.rows = b.rows[1:]
	return r
}
func (b *fakeBatch) Close() error { return nil }

// SendBatch is one implicit transaction: any failure stores nothing.
func (f *fakeEventDB) SendBatch(_ context.Context, b *pgx.Batch) pgx.BatchResults {
	out := &fakeBatch{}
	if f.down {
		for range b.QueuedQueries {
			out.rows = append(out.rows, fakeRow{err: errors.New("dial tcp: connection refused")})
		}
		return out
	}
	saved := map[string]int64{}
	for k, v := range f.stored {
		saved[k] = v
	}
	next := f.next
	failed := false
	for _, q := range b.QueuedQueries {
		id, err := f.insert(q.Arguments)
		if failed {
			err = &pgconn.PgError{Code: "25P02", Message: "current transaction is aborted"}
		}
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			failed = true
		}
		out.rows = append(out.rows, fakeRow{id, err})
	}
	if failed {
		f.stored, f.next = saved, next
	}
	return out
}

func (f *fakeEventDB) QueryRow(_ context.Context, _ string, args ...any) pgx.Row {
	id, err := f.insert(args)
	return fakeRow{id, err}
}

type testEvent struct{ uuid, stdout string }

func TestSaveEvents(t *testing.T) {
	db := &fakeEventDB{stored: map[string]int64{"dup": 99}}
	tries := map[*testEvent]int{}
	insert := func(e *testEvent) eventInsert { return eventInsert{"INSERT", []any{e.uuid, e.stdout}} }
	strip := func(e *testEvent) bool { return stripNULs(&e.stdout) }
	nolog := func(string, string, ...any) {}
	a, nul, bad, dup := &testEvent{"a", "ok"}, &testEvent{"n", "x\x00y"}, &testEvent{"b", "bad"}, &testEvent{"dup", "again"}

	// All good: one batch.
	out := saveEvents(context.Background(), db, []*testEvent{a}, tries, insert, strip, false, nolog)
	if out.bulk != 1 || out.batchErrors != 0 || len(out.saved) != 1 || out.ids[0] == 0 {
		t.Fatalf("bulk save %+v", out)
	}

	// One bad event: the batch fails and the rest are saved one by one;
	// the NUL is taken out after the first failure, the duplicate dropped,
	// and the bad event tried again later.
	c := &testEvent{"c", "fine"}
	out = saveEvents(context.Background(), db, []*testEvent{c, nul, bad, dup}, tries, insert, strip, false, nolog)
	if out.batchErrors != 1 || out.singular != 1 || out.duplicates != 1 || len(out.retry) != 2 || out.dropped != 0 {
		t.Fatalf("fallback %+v", out)
	}
	if nul.stdout != "xy" {
		t.Errorf("NUL not stripped: %q", nul.stdout)
	}
	out = saveEvents(context.Background(), db, out.retry, tries, insert, strip, false, nolog)
	if out.singular != 1 || len(out.retry) != 1 || out.retry[0] != bad {
		t.Fatalf("second try %+v", out)
	}
	out = saveEvents(context.Background(), db, out.retry, tries, insert, strip, false, nolog)
	if out.dropped != 1 || len(out.retry) != 0 || out.lastErr == nil {
		t.Fatalf("given up %+v", out)
	}
	if len(tries) != 0 {
		t.Errorf("tries left %v", tries)
	}

	// The database away: the batch is kept whole without using up tries,
	// except on a sink's last flush.
	db.down = true
	d := &testEvent{"d", "later"}
	out = saveEvents(context.Background(), db, []*testEvent{d}, tries, insert, strip, false, nolog)
	if len(out.retry) != 1 || tries[d] != 0 || out.batchErrors != 1 {
		t.Fatalf("database down %+v", out)
	}
	db.down = false
	out = saveEvents(context.Background(), db, out.retry, tries, insert, strip, true, nolog)
	if out.bulk != 1 {
		t.Fatalf("after the database came back %+v", out)
	}
}

// The in-memory gauge comes back to zero whatever became of the events.
func TestCallbackMetricsInMemory(t *testing.T) {
	c := &subsystemCounters{vals: map[string]float64{}, buckets: make([]float64, len(SubsystemMetricBuckets)+1)}
	c.eventsReceived(10)
	c.recordSave(0, 6, 1, 2, 2, 0, 6, 0, 0)
	if got := c.vals["callback_receiver_events_in_memory"]; got != 0 {
		t.Errorf("in memory %v", got)
	}
	if got := c.vals["callback_receiver_batch_events_errors"]; got != 1 {
		t.Errorf("batch errors %v", got)
	}
	if got := c.vals["callback_receiver_events_insert_db"]; got != 6 {
		t.Errorf("inserted %v", got)
	}
}
