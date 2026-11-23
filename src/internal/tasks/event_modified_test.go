package tasks

import (
	"context"
	"io"
	"log/slog"
	"testing"
	"time"

	"github.com/ctrliq/ascender/internal/models"
)

// An inventory update's events keep their own created time and get
// modified when they are stored, as the callback receiver's flush set it;
// an event that came without a created time gets the time it arrived.
func TestInventoryUpdateEventModified(t *testing.T) {
	database := claimScratchDB(t)
	ctx := context.Background()
	jobCreated := time.Now().UTC().Truncate(time.Microsecond)
	if err := models.EnsureEventPartition(ctx, database.Pool, "main_inventoryupdateevent", jobCreated); err != nil {
		t.Fatal(err)
	}
	d := &Dispatcher{DB: database, Log: slog.New(slog.NewTextHandler(io.Discard, nil))}
	s := &invEventSink{d: d, ctx: ctx, iu: &models.InventoryUpdate{UnifiedJob: models.UnifiedJob{ID: 41, Created: jobCreated}}}
	s.handle(runnerEvent{"event": "verbose", "counter": float64(1), "uuid": "zz-1", "stdout": "a", "start_line": float64(0), "end_line": float64(1),
		"created": "2026-01-02T03:04:05.123456"})
	s.handle(runnerEvent{"event": "verbose", "counter": float64(2), "uuid": "zz-2", "stdout": "b", "start_line": float64(1), "end_line": float64(2)})
	s.emitLog("imported")
	before := time.Now()
	if s.flush(true) {
		t.Fatal("events kept for another try")
	}
	rows, err := database.Pool.Query(ctx, `SELECT counter, created, modified FROM main_inventoryupdateevent WHERE inventory_update_id = 41 ORDER BY counter`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	n := 0
	for rows.Next() {
		var counter int64
		var created, modified time.Time
		if err := rows.Scan(&counter, &created, &modified); err != nil {
			t.Fatal(err)
		}
		n++
		if modified.Before(before.Add(-time.Millisecond)) || modified.After(time.Now()) {
			t.Errorf("event %d: modified %s is not when it was stored", counter, modified)
		}
		switch counter {
		case 1:
			if want := time.Date(2026, 1, 2, 3, 4, 5, 123456000, time.UTC); !created.Equal(want) {
				t.Errorf("event 1: created %s, want its own %s", created, want)
			}
		default:
			// No created time of its own (2), the import log's line (3):
			// when it arrived, before it was stored.
			if created.After(modified) || created.Before(before.Add(-time.Minute)) {
				t.Errorf("event %d: created %s, modified %s", counter, created, modified)
			}
		}
		if counter == 1 && !modified.After(created) {
			t.Errorf("event 1: modified %s = created %s", modified, created)
		}
	}
	if n != 3 {
		t.Fatalf("%d events stored, want 3", n)
	}
}

// A system job's event is created when the command wrote the line and
// modified when the row was stored.
func TestSystemJobEventModified(t *testing.T) {
	database := claimScratchDB(t)
	ctx := context.Background()
	jobCreated := time.Now().UTC().Truncate(time.Microsecond)
	if err := models.EnsureEventPartition(ctx, database.Pool, "main_systemjobevent", jobCreated); err != nil {
		t.Fatal(err)
	}
	d := &Dispatcher{DB: database, Log: slog.New(slog.NewTextHandler(io.Discard, nil))}
	written := time.Date(2026, 11, 21, 9, 0, 0, 0, time.UTC)
	stored := written.Add(1500 * time.Microsecond)
	times := []time.Time{written, stored}
	w := &systemJobEvents{d: d, ctx: ctx, id: 42, created: jobCreated, now: func() time.Time {
		next := times[0]
		times = times[1:]
		return next
	}}
	w.emit("Removed 3 jobs", 0, 1)
	var created, modified time.Time
	var counter int64
	if err := database.Pool.QueryRow(ctx, `SELECT counter, created, modified FROM main_systemjobevent WHERE system_job_id = 42`).Scan(&counter, &created, &modified); err != nil {
		t.Fatal(err)
	}
	if counter != 1 || !created.Equal(written) || !modified.Equal(stored) {
		t.Errorf("counter %d, created %s, modified %s; want 1, %s, %s", counter, created, modified, written, stored)
	}
}
