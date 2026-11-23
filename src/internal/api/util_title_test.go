package api

import (
	"strings"
	"testing"
)

// Title must match strings.Title exactly, so UI labels don't change.
func TestTitleMatchesStringsTitle(t *testing.T) {
	for _, s := range []string{"", "job template", "smart inventory", "never updated", "ssh key_data", "o'neil-x y.z", "élan vital", "a\tb c", "x1y 2z", "ünïcode wörds", "_under score"} {
		//lint:ignore SA1019 the reference implementation.
		if got, want := Title(s), strings.Title(s); got != want {
			t.Errorf("Title(%q) = %q, want %q", s, got, want)
		}
	}
}
