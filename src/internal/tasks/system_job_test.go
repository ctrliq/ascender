package tasks

import (
	"context"
	"errors"
	"fmt"
	"testing"
)

// A cancel or a shutdown cuts the management command short through its
// context: that is canceled, or failed with BaseTask's shutdown
// explanation, never a CommandError.
func TestSystemJobOutcome(t *testing.T) {
	ctxErr := fmt.Errorf("deleting: %w", context.Canceled)
	for _, tc := range []struct {
		name                string
		runErr              error
		interrupted, flag   bool
		st, expl, traceback string
	}{
		{"success", nil, false, false, "successful", "", ""},
		{"finished despite a late cancel", nil, true, true, "successful", "", ""},
		{"command error", errors.New("argument --days: invalid int value: 'x'"), false, false, "failed", "", "argument --days: invalid int value: 'x'"},
		{"cancel", ctxErr, true, true, "canceled", "", ""},
		{"shutdown", ctxErr, true, false, "failed", "Task was canceled due to receiving a shutdown signal.", ""},
	} {
		st, expl, tb := systemJobOutcome(tc.runErr, tc.interrupted, func() bool { return tc.flag })
		if st != tc.st || expl != tc.expl || tb != tc.traceback {
			t.Errorf("%s: got %q %q %q", tc.name, st, expl, tb)
		}
	}
}
