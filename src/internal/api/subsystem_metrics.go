package api

import (
	"context"
	"encoding/json"
	"math"
	"sort"
	"strconv"
	"strings"
	"sync"
)

// Subsystem metrics from the task processes: each publishes its callback
// receiver counters on the websocket notice channel's "metrics" group (the
// old wsrelay "metrics" broadcast) and every web process keeps the latest
// per instance (the old per-instance Valkey keys), for /api/v2/metrics/.

var (
	subsysMu      sync.Mutex
	subsysMetrics = map[string]map[string]any{} // instance → counters
)

// PublishSubsystemMetrics is send_metrics' emit_channel_notification.
func (s *Server) PublishSubsystemMetrics(ctx context.Context, instance, namespace string, metrics map[string]any) {
	b, err := json.Marshal(metrics)
	if err != nil {
		return
	}
	payload := NewOMap().Set("instance", instance).Set("metrics", string(b)).Set("metrics_namespace", namespace)
	s.publishNotice(ctx, wsNotice{Group: "metrics", Text: string(pyJSONDumps(payload, true))})
}

// storeSubsystemMetrics is BroadcastConsumer.receive_json for the metrics
// group: the instance's counters replace what was kept for it.
func storeSubsystemMetrics(text string) {
	var msg struct {
		Instance  string `json:"instance"`
		Metrics   string `json:"metrics"`
		Namespace string `json:"metrics_namespace"`
	}
	if json.Unmarshal([]byte(text), &msg) != nil || msg.Instance == "" || msg.Namespace != "callback_receiver" {
		return
	}
	var vals map[string]any
	if json.Unmarshal([]byte(msg.Metrics), &vals) != nil {
		return
	}
	subsysMu.Lock()
	subsysMetrics[msg.Instance] = vals
	subsysMu.Unlock()
}

// subsystemNodes are the instances with metrics: this one and any whose
// counters have arrived.
func subsystemNodes(local string) ([]string, map[string]map[string]any) {
	subsysMu.Lock()
	defer subsysMu.Unlock()
	nodes := []string{local}
	copyOf := map[string]map[string]any{}
	for inst, v := range subsysMetrics {
		copyOf[inst] = v
		if inst != local {
			nodes = append(nodes, inst)
		}
	}
	sort.Strings(nodes[1:])
	return nodes, copyOf
}

// subsystemValue renders a counter as the old metrics did: integers as
// integers, the float ones (seconds) as Python printed a float.
func subsystemValue(vals map[string]any, name string) string {
	f, _ := vals[name].(float64)
	if !strings.HasSuffix(name, "_seconds") {
		return strconv.FormatInt(int64(f), 10)
	}
	return pyFloatString(f)
}

func pyFloatString(f float64) string {
	if f == 0 {
		return "0.0"
	}
	if a := math.Abs(f); a >= 1e16 || a < 1e-4 {
		return strconv.FormatFloat(f, 'e', -1, 64)
	}
	s := strconv.FormatFloat(f, 'f', -1, 64)
	if !strings.ContainsAny(s, ".e") {
		s += ".0"
	}
	return s
}

func subsystemBucket(vals map[string]any, i int) string {
	if b, ok := vals["callback_receiver_batch_events_insert_db_buckets"].([]any); ok && i < len(b) {
		if f, ok := b[i].(float64); ok {
			return strconv.FormatInt(int64(f), 10)
		}
	}
	return "0"
}
