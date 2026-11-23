package tasks

import (
	"context"
	"sync"
	"time"
)

// The callback receiver's subsystem metrics (CallbackBrokerWorker's
// subsystem_metrics), counted where the Go task process takes events in
// and writes them. Every few seconds, when something changed, the counts
// go out on the websocket notice channel's "metrics" group, which the web
// processes keep per instance for /api/v2/metrics/, as the old nodes
// shared theirs through the wsrelay "metrics" group and Valkey.

// SubsystemMetricBuckets are callback_receiver_batch_events_insert_db's.
var SubsystemMetricBuckets = []float64{10, 50, 150, 350, 650, 2000}

type subsystemCounters struct {
	mu      sync.Mutex
	vals    map[string]float64
	buckets []float64 // cumulative per SubsystemMetricBuckets, then +Inf
	changed bool
}

var callbackMetrics = &subsystemCounters{vals: map[string]float64{}, buckets: make([]float64, len(SubsystemMetricBuckets)+1)}

// eventsReceived counts events taken in and not yet stored.
func (c *subsystemCounters) eventsReceived(n int) {
	c.mu.Lock()
	c.vals["callback_receiver_events_popped_redis"] += float64(n)
	c.vals["callback_receiver_events_in_memory"] += float64(n)
	c.changed = true
	c.mu.Unlock()
}

// flushed is the end of CallbackBrokerWorker.flush: the events the batch
// and the one-by-one saves stored, failed batches, the time the save
// took, events broadcast, and the processing time (stored minus created)
// of those whose created came with the event. As there, nothing is counted
// unless something was saved, and the batch histogram observes the
// batch's own count.
func (c *subsystemCounters) flushed(bulk, singular, batchErrors int, took time.Duration, broadcast int, processing time.Duration, missingCreated int) {
	saved := bulk + singular
	if saved <= 0 {
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	c.vals["callback_receiver_batch_events_errors"] += float64(batchErrors)
	c.vals["callback_receiver_events_insert_db_seconds"] += took.Seconds()
	c.vals["callback_receiver_events_insert_db"] += float64(saved)
	c.vals["callback_receiver_events_in_memory"] -= float64(saved)
	c.vals["callback_receiver_events_broadcast"] += float64(broadcast)
	for i, le := range SubsystemMetricBuckets {
		if float64(bulk) <= le {
			c.buckets[i]++
		}
	}
	c.buckets[len(SubsystemMetricBuckets)]++
	c.vals["callback_receiver_batch_events_insert_db_count"]++
	c.vals["callback_receiver_batch_events_insert_db_sum"] += float64(bulk)
	if n := saved - missingCreated; n > 0 {
		c.vals["callback_receiver_event_processing_avg_seconds"] = processing.Seconds() / float64(n)
	}
	c.changed = true
}

// discarded takes events that leave memory unsaved out of
// callback_receiver_events_in_memory: duplicates of stored events (the
// old receiver's dropped replays) and events given up after their
// retries, which the old receiver left counted for ever.
func (c *subsystemCounters) discarded(n int) {
	if n <= 0 {
		return
	}
	c.mu.Lock()
	c.vals["callback_receiver_events_in_memory"] -= float64(n)
	c.changed = true
	c.mu.Unlock()
}

// recordSave counts one flush's save.
func (c *subsystemCounters) recordSave(bulk, singular, batchErrors, duplicates, dropped int, took time.Duration, broadcast int, processing time.Duration, missingCreated int) {
	c.discarded(duplicates + dropped)
	c.flushed(bulk, singular, batchErrors, took, broadcast, processing, missingCreated)
}

// snapshot copies the counters when they changed since the last one.
func (c *subsystemCounters) snapshot() (map[string]any, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if !c.changed {
		return nil, false
	}
	c.changed = false
	out := map[string]any{}
	for k, v := range c.vals {
		out[k] = v
	}
	out["callback_receiver_batch_events_insert_db_buckets"] = append([]float64(nil), c.buckets...)
	return out, true
}

// publishMetrics is send_metrics: every SUBSYSTEM_METRICS_INTERVAL_SEND_METRICS
// (three seconds) the changed counters go to the web processes, with the
// time the sending took counted as the old pipe metrics were.
func (d *Dispatcher) publishMetrics(ctx context.Context) {
	t := time.NewTicker(3 * time.Second)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
		if d.API == nil {
			continue
		}
		snap, ok := callbackMetrics.snapshot()
		if !ok {
			continue
		}
		start := time.Now()
		d.safely("metrics", func() { d.API.PublishSubsystemMetrics(ctx, d.Cfg.ClusterHostID, "callback_receiver", snap) })
		took := time.Since(start).Seconds()
		callbackMetrics.mu.Lock()
		callbackMetrics.vals["subsystem_metrics_pipe_execute_calls"]++
		callbackMetrics.vals["subsystem_metrics_pipe_execute_seconds"] += took
		callbackMetrics.vals["subsystem_metrics_send_metrics_seconds"] += took
		callbackMetrics.mu.Unlock()
	}
}
