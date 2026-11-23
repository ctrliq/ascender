package jinjarun

import (
	"context"
	"encoding/json"
	"os"
	"reflect"
	"strings"
	"testing"
)

// opsGolden is testdata/ops.json, written by testdata/gen_ops.py with the
// python3 scripts these operations replace.
type opsGolden []struct {
	Op        string          `json:"op"`
	Input     json.RawMessage `json:"input"`
	Output    json.RawMessage `json:"output"`
	Exception *string         `json:"exception"`
}

// normalizeTracebacks keeps a traceback's first and last lines: the frames
// between are Python's own.
func normalizeTracebacks(v any) any {
	switch x := v.(type) {
	case map[string]any:
		for k, e := range x {
			x[k] = normalizeTracebacks(e)
		}
	case []any:
		for i, e := range x {
			x[i] = normalizeTracebacks(e)
		}
	case string:
		head, tb, ok := strings.Cut(x, "Traceback (most recent call last):")
		if !ok {
			return x
		}
		// The notifications' lines end in \r\n, a credential's in \n.
		lines := strings.Split(strings.ReplaceAll(strings.TrimRight(tb, "\r\n"), "\r\n", "\n"), "\n")
		return head + "Traceback ... " + lines[len(lines)-1]
	}
	return v
}

// TestMain lets the test binary serve the child operations, so Run's
// child process path is what the tests exercise.
func TestMain(m *testing.M) {
	Main()
	os.Exit(m.Run())
}

func TestOpsMatchScripts(t *testing.T) {
	for _, child := range []bool{true, false} {
		serving = child
		t.Run(map[bool]string{true: "child", false: "inprocess"}[child], testOps)
	}
	serving = true
}

func testOps(t *testing.T) {
	b, err := os.ReadFile("testdata/ops.json")
	if err != nil {
		t.Fatal(err)
	}
	var g opsGolden
	if err := json.Unmarshal(b, &g); err != nil {
		t.Fatal(err)
	}
	for i, c := range g {
		var got any
		err := Run(context.Background(), c.Op, c.Input, &got)
		if c.Exception != nil {
			if err == nil {
				t.Errorf("case %d (%s): no exception, the script raised %s", i, c.Op, *c.Exception)
				continue
			}
			want := *c.Exception
			typ, _, _ := strings.Cut(want, ":")
			if !strings.Contains(err.Error(), typ) && !strings.HasPrefix(want, "when serializing") {
				t.Errorf("case %d (%s): %v, the script raised %s", i, c.Op, err, want)
			}
			continue
		}
		if err != nil {
			t.Errorf("case %d (%s): %v", i, c.Op, err)
			continue
		}
		var want any
		_ = json.Unmarshal(c.Output, &want)
		got, want = normalizeTracebacks(got), normalizeTracebacks(want)
		if !reflect.DeepEqual(got, want) {
			gb, _ := json.Marshal(got)
			wb, _ := json.Marshal(want)
			t.Errorf("case %d (%s):\n got  %s\n want %s", i, c.Op, gb, wb)
		}
	}
}
