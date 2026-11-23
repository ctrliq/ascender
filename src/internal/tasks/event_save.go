package tasks

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// individualEventRetries is CallbackBrokerWorker.INDIVIDUAL_EVENT_RETRIES:
// how many times an event that cannot be saved alone is tried before it
// is given up.
const individualEventRetries = 3

// eventInsert is one event's INSERT ... ON CONFLICT DO NOTHING RETURNING
// id; no row back means the event is stored already.
type eventInsert struct {
	sql  string
	args []any
}

// eventQuerier is what saving events needs of the pool.
type eventQuerier interface {
	SendBatch(ctx context.Context, b *pgx.Batch) pgx.BatchResults
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// eventSave is the outcome of saving one flush's events.
type eventSave[E comparable] struct {
	// saved are the stored events, in order, with their ids.
	saved []E
	ids   []int64
	// retry failed alone and are tried again at the next flush.
	retry []E
	// bulk and singular count what the batch and the one-by-one saves
	// stored; duplicates were stored before (a replayed stream); dropped
	// were given up after individualEventRetries.
	bulk, singular, duplicates, dropped int
	// batchErrors is 1 when the batch failed.
	batchErrors int
	// lastErr is why an event was given up.
	lastErr error
	took    time.Duration
}

// saveEvents is the save in CallbackBrokerWorker.flush: the events go in
// one batch, and when that fails, one by one, so that one bad event does
// not lose the others. An event that fails alone stays for the next flush
// (with NUL characters taken out of its stdout after the first failure,
// which PostgreSQL cannot store) until it has failed
// individualEventRetries times. A batch that failed for want of the
// database (no server error) is kept whole for the next flush, as the
// old receiver waited for its connection; giveUp counts it as a failure
// of every event instead (the final flush of a sink).
func saveEvents[E comparable](ctx context.Context, q eventQuerier, batch []E, tries map[E]int, insert func(E) eventInsert, stripNUL func(E) bool, giveUp bool, logf func(level, msg string, args ...any)) eventSave[E] {
	var out eventSave[E]
	start := time.Now()
	defer func() { out.took = time.Since(start) }()
	b := &pgx.Batch{}
	for _, e := range batch {
		in := insert(e)
		b.Queue(in.sql, in.args...)
	}
	res := q.SendBatch(ctx, b)
	ids := make([]int64, len(batch))
	var bulkErr error
	for i := range batch {
		if err := res.QueryRow().Scan(&ids[i]); errors.Is(err, pgx.ErrNoRows) {
			ids[i] = 0
		} else if err != nil && bulkErr == nil {
			bulkErr = err
		}
	}
	if err := res.Close(); err != nil && bulkErr == nil {
		bulkErr = err
	}
	if bulkErr == nil {
		for i, e := range batch {
			if ids[i] == 0 {
				out.duplicates++
				continue
			}
			out.saved, out.ids = append(out.saved, e), append(out.ids, ids[i])
			out.bulk++
			delete(tries, e)
		}
		return out
	}
	// The batch ran as one implicit transaction: none of it is stored.
	out.batchErrors = 1
	var pgErr *pgconn.PgError
	if !errors.As(bulkErr, &pgErr) && !giveUp && ctx.Err() == nil {
		logf("warn", "Error in events bulk_create, the database is unavailable; will try again", "err", bulkErr)
		out.retry = batch
		return out
	}
	logf("warn", "Error in events bulk_create, will try indiviually", "err", bulkErr)
	for _, e := range batch {
		in := insert(e)
		var id int64
		err := q.QueryRow(ctx, in.sql, in.args...).Scan(&id)
		switch {
		case err == nil:
			out.saved, out.ids = append(out.saved, e), append(out.ids, id)
			out.singular++
			delete(tries, e)
			continue
		case errors.Is(err, pgx.ErrNoRows):
			out.duplicates++
			delete(tries, e)
			continue
		}
		tries[e]++
		n := tries[e]
		if n == 1 {
			stripNUL(e)
		}
		if n >= individualEventRetries {
			logf("error", "Hit max retries saving individual Event", "retries", n, "err", err)
			out.dropped++
			out.lastErr = err
			delete(tries, e)
			continue
		}
		logf("info", "Database Error Saving individual Event", "try", n, "err", err)
		out.retry = append(out.retry, e)
	}
	return out
}

// stripNULs removes NUL characters, which PostgreSQL text cannot hold;
// it reports whether there were any.
func stripNULs(s *string) bool {
	if !strings.Contains(*s, "\x00") {
		return false
	}
	*s = strings.ReplaceAll(*s, "\x00", "")
	return true
}
