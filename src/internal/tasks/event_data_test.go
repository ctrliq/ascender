package tasks

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/ctrliq/ascender/internal/redact"
)

// The stored event_data keeps the runner's key order, appends the guid,
// and is written as json.dumps wrote it.
func TestEventDataText(t *testing.T) {
	line := []byte(`{"uuid": "u", "event": "runner_on_ok", "event_data": {"playbook": "p.yml", "host": "hé", "res": {"z": 1, "a": [true, null, 1.50]}, "task_args": "", "msg": "a\"b\n<&>\u0001"}}`)
	var ev runnerEvent
	if err := json.Unmarshal(line, &ev); err != nil {
		t.Fatal(err)
	}
	keepEventData(ev, line)
	data, _ := ev["event_data"].(map[string]any)
	got := eventDataText(ev, data, "abc123", false)
	want := `{"playbook": "p.yml", "host": "h\u00e9", "res": {"z": 1, "a": [true, null, 1.50]}, "task_args": "", "msg": "a\"b\n<&>\u0001", "guid": "abc123"}`
	if got != want {
		t.Errorf("event_data\n got %s\nwant %s", got, want)
	}

	// No guid in the context: json.dumps's null.
	if got := eventDataText(ev, data, nil, false); !strings.HasSuffix(got, `, "guid": null}`) {
		t.Errorf("no guid: %s", got)
	}

	// An event without event_data (verbose output) stores {}.
	if got := eventDataText(runnerEvent{"event": "verbose"}, map[string]any{}, "abc", false); got != "{}" {
		t.Errorf("verbose event: %s", got)
	}

	// Without the written form, the decoded keys in sorted order; a guid
	// already among them keeps its place.
	ev2 := runnerEvent{"event_data": map[string]any{"b": 1.0, "a": "x", "guid": "g"}}
	if got := eventDataText(ev2, ev2["event_data"].(map[string]any), "g", false); got != `{"a": "x", "b": 1, "guid": "g"}` {
		t.Errorf("fallback: %s", got)
	}

	// A key written twice keeps its first place and its last value.
	dup := []byte(`{"event_data": {"x": 1, "y": 2, "x": 3}}`)
	ev3 := runnerEvent{"event_data": map[string]any{}}
	keepEventData(ev3, dup)
	if got := eventDataText(ev3, nil, nil, false); got != `{"x": 3, "y": 2, "guid": null}` {
		t.Errorf("duplicate key: %s", got)
	}
}

// Project update events are redacted in their written form, order kept.
func TestEventDataTextRedacted(t *testing.T) {
	line := []byte(`{"event_data": {"task_action": "git", "res": {"msg": "cloning https://user:secret@example.com/r.git"}}}`)
	ev := runnerEvent{"event_data": map[string]any{}}
	keepEventData(ev, line)
	got := eventDataText(ev, nil, "g", true)
	want := `{"task_action": "git", "res": {"msg": "` + redact.URIs("cloning https://user:secret@example.com/r.git") + `"}, "guid": "g"}`
	if got != want || strings.Contains(got, "secret") {
		t.Errorf("redacted\n got %s\nwant %s", got, want)
	}
}

// A character beyond the BMP is written as a surrogate pair, as
// ensure_ascii did.
func TestWritePyStringSurrogates(t *testing.T) {
	var b strings.Builder
	writePyString(&b, "x\U0001F600 \x7f")
	if got := b.String(); got != "\"x\\ud83d\\ude00\\u2028\x7f\"" {
		t.Errorf("got %s", got)
	}
}
