package tasks

import (
	"context"
	"encoding/json"
	"os"
	"testing"
	"time"

	"github.com/ctrliq/ascender/internal/models"
)

// fakeClock hands out the times a test sets.
type fakeClock struct{ t time.Time }

func (c *fakeClock) now() time.Time      { return c.t }
func (c *fakeClock) add(d time.Duration) { c.t = c.t.Add(d) }

// The throttle is RunnerCallback.event_handler's: up to max messages go
// out in any second; after that an event goes only when the oldest of the
// last max went more than a second ago or the last more than 1/max
// seconds ago. MINIMAL_EVENTS always go, events with no output never do
// (except as the first), and 0 lets everything through.
func TestWSThrottle(t *testing.T) {
	clock := &fakeClock{t: time.Date(2026, 11, 21, 9, 0, 0, 0, time.UTC)}
	th := &wsThrottle{max: 3, now: clock.now}
	out := func(event, stdout string, start, end int64) bool { return th.emit(event, stdout, start, end) }

	// The first event goes whatever it is, even one with no output.
	if !out("verbose", "", 0, 0) {
		t.Fatal("first event held back")
	}
	// An event with no output is held back from then on.
	if out("runner_on_start", "", 1, 1) {
		t.Error("event with no output sent")
	}
	// Empty stdout over lines is output (start_line != end_line).
	if !out("verbose", "", 1, 2) {
		t.Error("blank line held back while the window is not full")
	}
	if !out("runner_on_ok", "ok", 2, 3) {
		t.Error("third message held back")
	}
	// The window holds 3 messages sent at the same instant: the next is
	// held back, minimal events still go (and count).
	if out("runner_on_ok", "ok", 3, 4) {
		t.Error("fourth message in the same instant sent")
	}
	if !out("playbook_on_task_start", "TASK", 4, 5) || !out("playbook_on_stats", "", 5, 5) {
		t.Error("minimal event held back")
	}
	// More than 1/3 s after the last message, one more goes.
	clock.add(340 * time.Millisecond)
	if !out("runner_on_ok", "ok", 6, 7) {
		t.Error("message 1/max seconds after the last held back")
	}
	if out("runner_on_ok", "ok", 7, 8) {
		t.Error("second message at once sent")
	}
	// (Ties, exactly one second or 1/max seconds, are in the golden runs.)
	// After a quiet second the window has room again.
	clock.add(1100 * time.Millisecond)
	if !out("runner_on_ok", "ok", 8, 9) {
		t.Error("message after a quiet second held back")
	}
	if len(th.times) != 3 {
		t.Errorf("window holds %d times, want 3", len(th.times))
	}

	// 0 is no limit, and keeps no times.
	free := &wsThrottle{max: 0, now: clock.now}
	for i := 0; i < 100; i++ {
		if !free.emit("runner_on_start", "", 1, 1) {
			t.Fatal("rate 0 held an event back")
		}
	}
	if len(free.times) != 0 {
		t.Error("rate 0 kept times")
	}
	// No settings: the default, 30.
	if th := newWSThrottle(context.Background(), &Dispatcher{}); th.max != 30 {
		t.Errorf("default max %d", th.max)
	}
}

// At the old default of 30 a fast run sends about 30 messages a second
// after its first burst, and its MINIMAL_EVENTS all go.
func TestWSThrottleRate(t *testing.T) {
	clock := &fakeClock{t: time.Date(2026, 11, 21, 9, 0, 0, 0, time.UTC)}
	th := &wsThrottle{max: 30, now: clock.now}
	sent, tasks := 0, 0
	// 1000 events a second for 5 seconds; every 100th a task start.
	for i := 0; i < 5000; i++ {
		clock.add(time.Millisecond)
		ev := "runner_on_ok"
		if i%100 == 0 {
			ev = "playbook_on_task_start"
		}
		if th.emit(ev, "ok", int64(i), int64(i+1)) {
			sent++
			if ev == "playbook_on_task_start" {
				tasks++
			}
		}
	}
	if tasks != 50 {
		t.Errorf("%d of 50 task starts sent", tasks)
	}
	if sent < 5*30 || sent > 5*30+60 {
		t.Errorf("%d messages in 5 seconds at 30 a second", sent)
	}
}

// The job event sink decides as each event arrives, and a replayed event
// that is stored already is not counted against the rate.
func TestJobEventSinkThrottle(t *testing.T) {
	clock := &fakeClock{t: time.Date(2026, 11, 21, 9, 0, 0, 0, time.UTC)}
	s := &jobEventSink{d: &Dispatcher{}, ctx: context.Background(), job: &models.Job{UnifiedJob: models.UnifiedJob{ID: 1, Created: clock.t}},
		throttle: &wsThrottle{max: 2, now: clock.now}, persisted: map[int64]bool{2: true}}
	ev := func(counter int, event, stdout string, start, end int) runnerEvent {
		return runnerEvent{"event": event, "counter": float64(counter), "stdout": stdout, "start_line": float64(start), "end_line": float64(end),
			"uuid": "u", "created": "2026-11-21T09:00:00.000001", "event_data": map[string]any{}}
	}
	s.handle(ev(1, "playbook_on_start", "", 0, 0))
	s.handle(ev(2, "runner_on_ok", "replayed", 0, 1)) // persisted: neither stored nor counted
	s.handle(ev(3, "runner_on_ok", "ok", 1, 2))
	s.handle(ev(4, "runner_on_ok", "ok", 2, 3))
	s.handle(ev(5, "playbook_on_play_start", "", 3, 3)) // minimal, though it has no output
	var skipped []int64
	for _, e := range s.pending {
		if e.skipWS {
			skipped = append(skipped, e.Counter)
		}
	}
	if len(s.pending) != 4 || len(skipped) != 1 || skipped[0] != 4 {
		t.Errorf("pending %d, skipped %v; want 4 pending, event 4 skipped", len(s.pending), skipped)
	}
}

// The inventory update sink throttles the runner's lines and the import
// log alike.
func TestInvEventSinkThrottle(t *testing.T) {
	clock := &fakeClock{t: time.Date(2026, 11, 21, 9, 0, 0, 0, time.UTC)}
	s := &invEventSink{d: &Dispatcher{}, ctx: context.Background(), iu: &models.InventoryUpdate{}, throttle: &wsThrottle{max: 1, now: clock.now}}
	s.handle(runnerEvent{"event": "verbose", "counter": float64(1), "stdout": "a", "start_line": float64(0), "end_line": float64(1)})
	s.emitLog("b")
	clock.add(2 * time.Second)
	s.emitLog("c")
	got := []bool{}
	for _, e := range s.pending {
		got = append(got, e.skipWS)
	}
	if len(got) != 3 || got[0] || !got[1] || got[2] {
		t.Errorf("skipWS %v, want [false true false]", got)
	}
}

// The throttle decides as the old one did, event by event, for the runs
// testdata/gen_ws_throttle.py put through the old code.
func TestWSThrottleGolden(t *testing.T) {
	raw, err := os.ReadFile("testdata/ws_throttle.json")
	if err != nil {
		t.Fatal(err)
	}
	var runs []struct {
		Rate  int     `json:"rate"`
		Steps [][]any `json:"steps"`
	}
	if err := json.Unmarshal(raw, &runs); err != nil {
		t.Fatal(err)
	}
	const tick = time.Second / 512
	for _, run := range runs {
		clock := &fakeClock{t: time.Unix(1700000000, 0)}
		th := &wsThrottle{max: run.Rate, now: clock.now}
		for i, s := range run.Steps {
			clock.add(time.Duration(s[0].(float64)) * tick)
			got := th.emit(s[1].(string), s[2].(string), int64(s[3].(float64)), int64(s[4].(float64)))
			if got != s[5].(bool) {
				t.Fatalf("rate %d, step %d %v: sent %v", run.Rate, i, s, got)
			}
		}
	}
}
