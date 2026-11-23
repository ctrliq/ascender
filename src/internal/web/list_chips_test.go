package web

import (
	"net/url"
	"strings"
	"testing"
	"time"
)

// Chips come from the list's own namespace only, and there are at most
// maxFilterChips of them, so a long query string costs little.
func TestActiveFiltersAreBounded(t *testing.T) {
	q := url.Values{}
	for i := 0; i < 8000; i++ {
		q.Add("zz.a", "1")
		q.Add("job.name__icontains", "x")
	}
	q.Add("job.status", "failed")
	start := time.Now()
	chips := activeFilters(q, "job", nil)
	limit := time.Second
	if raceEnabled {
		limit *= 10
	}
	if took := time.Since(start); took > limit {
		t.Errorf("took %v", took)
	}
	if len(chips) != maxFilterChips {
		t.Errorf("%d chips, want %d", len(chips), maxFilterChips)
	}
	for _, c := range chips {
		if strings.HasPrefix(c.Key, "a") {
			t.Errorf("a chip for another list's parameter: %+v", c)
		}
	}
	few := activeFilters(url.Values{"job.status": {"failed"}, "other.name": {"x"}}, "job", nil)
	if len(few) != 1 || few[0].Value != "failed" || strings.Contains(few[0].RemoveQuery, "job.status") {
		t.Errorf("chips: %+v", few)
	}
}
