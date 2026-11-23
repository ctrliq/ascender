package api

import (
	"testing"
	"time"
)

// What the startup sync leaves for the scheduler pass: an occurrence that
// came due after the previous pass, while that pass is recent.
func TestDueForSchedulerPass(t *testing.T) {
	now := time.Date(2026, 3, 1, 12, 0, 30, 0, time.UTC)
	at := func(d time.Duration) *time.Time { v := now.Add(d); return &v }
	for _, c := range []struct {
		name             string
		enabled          bool
		nextRun, lastRun *time.Time
		want             bool
	}{
		{"due since the previous pass", true, at(-10 * time.Second), at(-25 * time.Second), true},
		{"due this instant", true, at(0), at(-25 * time.Second), true},
		{"due while the task process restarted", true, at(-2 * time.Minute), at(-3 * time.Minute), true},
		{"not due yet", true, at(20 * time.Second), at(-25 * time.Second), false},
		{"older than the previous pass, which has passed it over", true, at(-40 * time.Second), at(-25 * time.Second), false},
		{"never computed", true, nil, at(-25 * time.Second), false},
		{"disabled", false, at(-10 * time.Second), at(-25 * time.Second), false},
		{"no pass has run yet", true, at(-10 * time.Second), nil, false},
		{"missed during a long stop", true, at(-10 * time.Second), at(-scheduleCatchUp), false},
		{"missed in a restored database", true, at(-24 * time.Hour), at(-48 * time.Hour), false},
	} {
		if got := dueForSchedulerPass(c.enabled, c.nextRun, c.lastRun, now); got != c.want {
			t.Errorf("%s: left for the pass %v, want %v", c.name, got, c.want)
		}
	}
}
