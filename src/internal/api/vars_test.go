package api

import (
	"encoding/json"
	"testing"
)

// TestParseVarsKeepsNumbers: JSON variables come back out as they went in,
// as Python's json.loads and json.dumps leave them.
func TestParseVarsKeepsNumbers(t *testing.T) {
	cases := []struct{ in, want string }{
		{`{"a": 9007199254740993}`, `{"a":9007199254740993}`},
		{`{"a": 12345678901234567890}`, `{"a":12345678901234567890}`},
		{`{"a": -1234567890123456789}`, `{"a":-1234567890123456789}`},
		{`{"a": 1.0, "b": 2.5}`, `{"a":1.0,"b":2.5}`},
		{`{"a": [1, {"b": 18446744073709551616}]}`, `{"a":[1,{"b":18446744073709551616}]}`},
		{" {\"a\": 1}\n", `{"a":1}`},
	}
	for _, c := range cases {
		m, err := ParseVars(c.in)
		if err != nil {
			t.Errorf("ParseVars(%q): %v", c.in, err)
			continue
		}
		got, _ := json.Marshal(m)
		if string(got) != c.want {
			t.Errorf("ParseVars(%q) = %s, want %s", c.in, got, c.want)
		}
	}
}

// TestParseVarsReadsYAMLAsPyYAML: YAML variables are read as PyYAML's
// safe_load read them, so a template's `feature: no` reaches the job as
// false, a key may be a number, and a second document is an error rather
// than dropped.
func TestParseVarsReadsYAMLAsPyYAML(t *testing.T) {
	cases := []struct{ in, want string }{
		{"feature: no\nenabled: on\nletter: y", `{"enabled":true,"feature":false,"letter":"y"}`},
		{"port: 022\nsize: 1_000\nexp: 1e3\nratio: 1.50", `{"exp":"1e3","port":18,"ratio":1.5,"size":1000}`},
		{"80: http\n443: https", `{"443":"https","80":"http"}`},
		{"a: 1\na: 2", `{"a":2}`},
		{"base: &b {x: 1}\nc:\n  <<: *b\n  y: 2", `{"base":{"x":1},"c":{"x":1,"y":2}}`},
		{"---", `{}`},
	}
	for _, c := range cases {
		m, err := ParseVars(c.in)
		if err != nil {
			t.Errorf("ParseVars(%q): %v", c.in, err)
			continue
		}
		got, _ := json.Marshal(m)
		if string(got) != c.want {
			t.Errorf("ParseVars(%q) = %s, want %s", c.in, got, c.want)
		}
	}
	if _, err := ParseVars("a: 1\n---\nb: 2"); err == nil {
		t.Error("ParseVars of two documents: no error")
	}
}

// TestValidateVars is vars_validate_or_raise on YAML: any dictionary is
// accepted, whatever its keys; a second document, a list, and values
// json.dumps refused are not.
func TestValidateVars(t *testing.T) {
	for _, ok := range []string{"", "---", "80: http", "1: a\ntrue: b", "a: {1: x}", `{"a": 1}`, "feature: no"} {
		if err := ValidateVars(ok); err != nil {
			t.Errorf("ValidateVars(%q): %v", ok, err)
		}
	}
	for in, want := range map[string]string{
		"- a\n- b":             "Input type `list` is not a dictionary",
		"a: 2001-12-14":        "Variables not compatible with JSON standard (error: Object of type date is not JSON serializable)",
		"a: !!binary aGVsbG8=": "Variables not compatible with JSON standard (error: Object of type bytes is not JSON serializable)",
		"2001-12-14: x":        "Variables not compatible with JSON standard (error: keys must be str, int, float, bool or None, not datetime.date)",
	} {
		if err := ValidateVars(in); err == nil || err.Error() != want {
			t.Errorf("ValidateVars(%q) = %v, want %q", in, err, want)
		}
	}
	if err := ValidateVars("a: 1\n---\nb: 2"); err == nil {
		t.Error("ValidateVars of two documents: no error")
	}
}
