package pyyaml

import (
	"bytes"
	"encoding/json"
	"errors"
	"math"
	"os"
	"strings"
	"testing"
)

// golden is testdata/pyyaml.json, written by testdata/gen_load.py from
// the old application's PyYAML: json.dumps of yaml.safe_load, or which of
// the two failed (and json.dumps's message).
type golden struct {
	PyYAML string `json:"pyyaml"`
	Cases  []struct {
		Src   string  `json:"src"`
		JSON  *string `json:"json"`
		Error string  `json:"error"`
		Msg   string  `json:"msg"`
	} `json:"cases"`
}

// dumps writes v as json.dumps(separators=(',', ':')) did, Infinity and
// NaN included.
func dumps(v any) (string, error) {
	switch t := v.(type) {
	case float64:
		switch {
		case math.IsNaN(t):
			return "NaN", nil
		case math.IsInf(t, 1):
			return "Infinity", nil
		case math.IsInf(t, -1):
			return "-Infinity", nil
		}
	case []any:
		parts := make([]string, len(t))
		for i, x := range t {
			s, err := dumps(x)
			if err != nil {
				return "", err
			}
			parts[i] = s
		}
		return "[" + strings.Join(parts, ",") + "]", nil
	case *Map:
		parts := make([]string, len(t.Keys))
		for i, k := range t.Keys {
			ks, _ := dumps(k)
			s, err := dumps(t.Vals[i])
			if err != nil {
				return "", err
			}
			parts[i] = ks + ":" + s
		}
		return "{" + strings.Join(parts, ",") + "}", nil
	}
	var b bytes.Buffer
	enc := json.NewEncoder(&b)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(v); err != nil {
		return "", err
	}
	return strings.TrimSuffix(b.String(), "\n"), nil
}

func TestLoadMatchesPyYAML(t *testing.T) {
	b, err := os.ReadFile("testdata/pyyaml.json")
	if err != nil {
		t.Fatal(err)
	}
	var g golden
	if err := json.Unmarshal(b, &g); err != nil {
		t.Fatal(err)
	}
	for _, c := range g.Cases {
		v, err := Load(c.Src)
		var compat *CompatError
		switch {
		case c.JSON != nil:
			if err != nil {
				t.Errorf("%q: error %v, want %s", c.Src, err, *c.JSON)
				continue
			}
			got, err := dumps(v)
			if err != nil {
				t.Errorf("%q: dumps: %v", c.Src, err)
			} else if got != *c.JSON {
				t.Errorf("%q: got %s, want %s", c.Src, got, *c.JSON)
			}
		case c.Error == "json":
			if !errors.As(err, &compat) || compat.Msg != c.Msg {
				t.Errorf("%q: got %v, %v; want json.dumps error %q", c.Src, v, err, c.Msg)
			}
		default:
			if err == nil || errors.As(err, &compat) {
				got, _ := dumps(v)
				t.Errorf("%q: got %s, %v; want a %s error", c.Src, got, err, c.Error)
			}
		}
	}
}

func TestMapMarshalJSONKeepsOrder(t *testing.T) {
	v, err := Load("b: 1\na: {d: 2, c: [x]}\n")
	if err != nil {
		t.Fatal(err)
	}
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	if string(b) != `{"b":1,"a":{"d":2,"c":["x"]}}` {
		t.Errorf("got %s", b)
	}
	p, ok := Plain(v).(map[string]any)
	if !ok || p["a"].(map[string]any)["d"] != json.Number("2") {
		t.Errorf("Plain: %#v", Plain(v))
	}
	m, err := Load(`"1": a` + "\n1: b\n")
	if err != nil {
		t.Fatal(err)
	}
	if got, _ := m.(*Map).Get("1"); got != "b" {
		t.Errorf("Get: %v", got)
	}
}

// An alias may not blow a small document up into billions of values.
func TestLoadBoundsAliasExpansion(t *testing.T) {
	var b strings.Builder
	b.WriteString("a0: &a0 [x, x, x, x, x, x, x, x, x, x]\n")
	for i := 1; i < 10; i++ {
		b.WriteString("a")
		b.WriteString(string(rune('0' + i)))
		b.WriteString(": &a")
		b.WriteString(string(rune('0' + i)))
		b.WriteString(" [")
		for j := 0; j < 10; j++ {
			if j > 0 {
				b.WriteString(", ")
			}
			b.WriteString("*a")
			b.WriteString(string(rune('0' + i - 1)))
		}
		b.WriteString("]\n")
	}
	if _, err := Load(b.String()); err == nil {
		t.Fatal("no error for a billion values")
	}
}
