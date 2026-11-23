package api

import (
	"slices"
	"testing"
)

func TestEventAncestors(t *testing.T) {
	counter := map[string]int64{"play": 1, "task": 2, "runner": 3}
	parent := map[string]string{"play": "", "task": "play", "runner": "task"}
	if got := eventAncestors("runner", counter, parent); !slices.Equal(got, []int64{3, 2, 1}) {
		t.Errorf("chain: %v", got)
	}
	if got := eventAncestors("gone", counter, parent); len(got) != 0 {
		t.Errorf("missing parent: %v", got)
	}
	// An event that is its own parent, and a two-event cycle, end.
	self := map[string]string{"a": "a"}
	if got := eventAncestors("a", map[string]int64{"a": 1}, self); len(got) > 2 {
		t.Errorf("self-parent walked %d steps", len(got))
	}
	cycle := map[string]string{"a": "b", "b": "a"}
	if got := eventAncestors("a", map[string]int64{"a": 1, "b": 2}, cycle); len(got) > 3 {
		t.Errorf("cycle walked %d steps", len(got))
	}
}
