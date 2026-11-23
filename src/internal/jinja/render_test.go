package jinja

import (
	"encoding/json"
	"errors"
	"os"
	"regexp"
	"testing"
)

// renderGolden is testdata/render316.json, written by testdata/gen_render.py
// from the old application's Jinja2.
type renderGolden struct {
	Jinja2   string                     `json:"jinja2"`
	Contexts map[string]json.RawMessage `json:"contexts"`
	Cases    []struct {
		Source  string          `json:"source"`
		Context json.RawMessage `json:"context"`
		Mode    string          `json:"mode"`
		Output  *string         `json:"output"`
		Error   *struct {
			Type    string `json:"type"`
			Message string `json:"message"`
		} `json:"error"`
	} `json:"cases"`
}

var addrRe = regexp.MustCompile(` at 0x[0-9a-f]+`)

var modes = map[string]UndefinedKind{"default": UndefinedDefault, "strict": UndefinedStrict, "chainable": UndefinedChainable, "descriptive": UndefinedDescriptive}

func TestRenderMatchesJinja(t *testing.T) {
	b, err := os.ReadFile("testdata/render316.json")
	if err != nil {
		t.Fatal(err)
	}
	var g renderGolden
	if err := json.Unmarshal(b, &g); err != nil {
		t.Fatal(err)
	}
	contexts := map[string]map[string]Value{}
	for name, raw := range g.Contexts {
		v, err := FromJSON(raw)
		if err != nil {
			t.Fatal(err)
		}
		vars := map[string]Value{}
		d := v.(*Dict)
		for i, k := range d.Keys() {
			vars[k.(string)] = d.Values()[i]
		}
		contexts[name] = vars
	}
	failures := 0
	for _, c := range g.Cases {
		var name string
		_ = json.Unmarshal(c.Context, &name)
		vars := contexts[name]
		env := &Environment{Undefined: modes[c.Mode]}
		var out string
		tpl, err := env.FromString(c.Source)
		if err == nil {
			out, err = tpl.Render(vars)
		}
		out = addrRe.ReplaceAllString(out, " at 0x?")
		var e *Error
		switch {
		case c.Error == nil && err != nil:
			t.Errorf("[%s] %q: error %v, want %q", c.Mode, c.Source, describeErr(err), *c.Output)
		case c.Error != nil && err == nil:
			t.Errorf("[%s] %q: output %q, want %s: %s", c.Mode, c.Source, out, c.Error.Type, c.Error.Message)
		case c.Error == nil && out != *c.Output:
			t.Errorf("[%s] %q:\n got  %q\n want %q", c.Mode, c.Source, out, *c.Output)
		case c.Error != nil && (!errors.As(err, &e) || e.Type != c.Error.Type || addrRe.ReplaceAllString(e.Message, " at 0x?") != c.Error.Message):
			t.Errorf("[%s] %q:\n got  %s\n want %s: %s", c.Mode, c.Source, describeErr(err), c.Error.Type, c.Error.Message)
		default:
			continue
		}
		failures++
	}
	if failures > 0 {
		t.Logf("%d of %d cases differ", failures, len(g.Cases))
	}
}
