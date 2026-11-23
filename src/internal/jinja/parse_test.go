package jinja

import (
	"encoding/json"
	"errors"
	"os"
	"testing"
)

// parseGolden is testdata/parse316.json, written by testdata/gen_parse.py
// from the old application's Jinja2.
type parseGolden struct {
	Jinja2    string `json:"jinja2"`
	Templates []struct {
		Source string  `json:"source"`
		Parse  *string `json:"parse"`
		Error  *struct {
			Type    string `json:"type"`
			Message string `json:"message"`
		} `json:"error"`
	} `json:"templates"`
}

func TestParseMatchesJinja(t *testing.T) {
	b, err := os.ReadFile("testdata/parse316.json")
	if err != nil {
		t.Fatal(err)
	}
	var g parseGolden
	if err := json.Unmarshal(b, &g); err != nil {
		t.Fatal(err)
	}
	for _, c := range g.Templates {
		tree, perr := Parse(c.Source)
		switch {
		case c.Parse != nil && perr != nil:
			t.Errorf("Parse(%q): error %v, Jinja parsed it", c.Source, perr)
		case c.Parse == nil && perr == nil:
			t.Errorf("Parse(%q): parsed, Jinja refused it", c.Source)
		case c.Parse != nil && Repr(tree) != *c.Parse:
			t.Errorf("Parse(%q):\n got  %s\n want %s", c.Source, Repr(tree), *c.Parse)
		}
		_, cerr := Compile(c.Source)
		var e *Error
		switch {
		case c.Error == nil && cerr != nil:
			t.Errorf("Compile(%q): error %v", c.Source, cerr)
		case c.Error != nil && cerr == nil:
			t.Errorf("Compile(%q): no error, Jinja raised %s: %s", c.Source, c.Error.Type, c.Error.Message)
		case c.Error != nil && c.Error.Type == "SyntaxError" && errors.As(cerr, &e) && e.Type == "SyntaxError":
			// Python's own SyntaxError names a line of the generated code.
		case c.Error != nil && (!errors.As(cerr, &e) || e.Type != c.Error.Type || e.Message != c.Error.Message):
			t.Errorf("Compile(%q):\n got  %T %v\n want %s: %s", c.Source, cerr, describeErr(cerr), c.Error.Type, c.Error.Message)
		}
	}
}

func describeErr(err error) string {
	var e *Error
	if errors.As(err, &e) {
		return e.Type + ": " + e.Message
	}
	return err.Error()
}
