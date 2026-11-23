package web

import (
	"testing"
	"time"
)

// Which instances the Instances screens offer to remove.
func TestInstanceRemovable(t *testing.T) {
	now := time.Date(2026, 11, 17, 12, 0, 0, 0, time.UTC)
	old := "2026-11-17T11:00:00.000000Z"
	recent := "2026-11-17T11:59:00.000000Z"
	for _, c := range []struct {
		name string
		i    map[string]any
		k8s  bool
		want bool
	}{
		{"lost control node", map[string]any{"node_type": "control", "node_state": "unavailable", "managed": true, "last_seen": old}, false, true},
		{"lost execution node", map[string]any{"node_type": "execution", "node_state": "unavailable", "last_seen": old}, false, true},
		{"unavailable but checking in", map[string]any{"node_type": "control", "node_state": "unavailable", "managed": true, "last_seen": recent}, false, false},
		{"never seen", map[string]any{"node_type": "hybrid", "node_state": "unavailable", "managed": true, "last_seen": nil}, false, true},
		{"ready control node", map[string]any{"node_type": "control", "node_state": "ready", "managed": true, "last_seen": old}, false, false},
		{"execution node off Kubernetes", map[string]any{"node_type": "execution", "node_state": "ready", "last_seen": recent}, false, false},
		{"execution node on Kubernetes", map[string]any{"node_type": "execution", "node_state": "ready", "last_seen": recent}, true, true},
		{"managed control node on Kubernetes", map[string]any{"node_type": "control", "node_state": "ready", "managed": true, "last_seen": recent}, true, false},
	} {
		if got := instanceRemovable(c.i, c.k8s, now); got != c.want {
			t.Errorf("%s: got %v, want %v", c.name, got, c.want)
		}
	}
}
