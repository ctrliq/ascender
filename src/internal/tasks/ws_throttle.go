package tasks

import (
	"context"
	"sync"
	"time"
)

// minimalEvents are MINIMAL_EVENTS: the events the throttle always lets
// through to the websocket (and the only ones that go out with
// UI_LIVE_UPDATES_ENABLED off), which the UI needs to draw a job's outline
// and summary.
var minimalEvents = map[string]bool{
	"playbook_on_play_start": true, "playbook_on_task_start": true, "playbook_on_stats": true, "EOF": true,
}

// wsThrottle is RunnerCallback's recent_event_timings: it keeps a run's
// events from overwhelming the websocket, at no more than
// MAX_WEBSOCKET_EVENT_RATE messages a second. Each run (and each resumed
// read of one) has its own, as each RunnerCallback had its own deque. An
// event it holds back is still stored, and is in the job's output; only
// its websocket message is not sent (skip_websocket_message).
type wsThrottle struct {
	mu sync.Mutex
	// max is the deque's maxlen, the setting's value; 0 is no limit.
	max int
	// times are when the last max messages went out: a ring whose
	// oldest entry is at head once it is full.
	times []time.Time
	head  int
	now   func() time.Time
}

// newWSThrottle reads MAX_WEBSOCKET_EVENT_RATE once, when the run starts,
// as RunnerCallback.__init__ did.
func newWSThrottle(ctx context.Context, d *Dispatcher) *wsThrottle {
	t := &wsThrottle{max: 30, now: time.Now}
	if d != nil && d.Settings != nil {
		t.max = int(d.Settings.Int(ctx, "MAX_WEBSOCKET_EVENT_RATE"))
	}
	return t
}

// emit is the throttle in RunnerCallback.event_handler: it reports
// whether the event's websocket message goes out, and notes the time when
// it does. Events of MINIMAL_EVENTS always go; an event with no output
// (empty stdout and start_line equal to end_line) never does, unless it is
// the run's first; any other goes when the oldest of the last max messages
// went more than a second ago, the last one more than 1/max seconds ago,
// or fewer than max have gone yet. The very first event goes whatever it
// is. A rate of 0 lets everything through and keeps no times.
func (t *wsThrottle) emit(event, stdout string, startLine, endLine int64) bool {
	if t == nil || t.max <= 0 {
		return true
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	now := t.now()
	if len(t.times) == 0 {
		t.times = append(t.times, now)
		return true
	}
	var ok bool
	switch {
	case minimalEvents[event]:
		ok = true
	case stdout == "" && startLine == endLine:
		ok = false
	default:
		first, last := t.times[t.head], t.times[(t.head+len(t.times)-1)%len(t.times)]
		ok = now.Sub(first).Seconds() > 1.0 ||
			float64(t.max)*now.Sub(last).Seconds() > 1.0 ||
			len(t.times) != t.max
	}
	if ok {
		if len(t.times) == t.max {
			t.times[t.head] = now
			t.head = (t.head + 1) % t.max
		} else {
			t.times = append(t.times, now)
		}
	}
	return ok
}
