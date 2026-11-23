package jinjarun

import (
	"context"
	"strings"
	"testing"
	"time"
)

// A template that prints more than maxChildOutput ends the child; the
// parent never holds the output.
func TestChildOutputIsBounded(t *testing.T) {
	start := time.Now()
	var out any
	in := map[string]any{"mode": "render", "approval": false, "context": map[string]any{"job": map[string]any{"id": 7}}, "metadata": map[string]any{"id": 7},
		"ensure_ascii": true, "templates": []any{map[string]any{"message": "{{ 'a' * 20000000 }}"}}}
	err := Run(context.Background(), "notify", in, &out)
	if err == nil || !strings.Contains(err.Error(), "longer than") {
		t.Fatalf("Run = %v", err)
	}
	if took := time.Since(start); took > 20*time.Second {
		t.Errorf("took %v", took)
	}
	// Ordinary output still comes back.
	if err := Run(context.Background(), "context", map[string]any{"template": "{{ x | upper }}", "vars": map[string]any{"x": "ok"}}, &out); err != nil {
		t.Fatal(err)
	}
}
