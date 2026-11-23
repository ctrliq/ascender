package pyre

import (
	"encoding/json"
	"errors"
	"os"
	"strings"
	"testing"
)

// golden is testdata/python314.json, written by testdata/gen.py from the
// old application's Python.
type golden struct {
	Python  string `json:"python"`
	Compile []struct {
		Pattern string  `json:"pattern"`
		Flags   Flags   `json:"flags"`
		Error   *string `json:"error"`
		Type    *string `json:"type"`
	} `json:"compile"`
	Match []struct {
		Pattern string `json:"pattern"`
		Flags   Flags  `json:"flags"`
		S       string `json:"s"`
		Match   bool   `json:"match"`
	} `json:"match"`
}

func loadGolden(t *testing.T) golden {
	t.Helper()
	b, err := os.ReadFile("testdata/python314.json")
	if err != nil {
		t.Fatal(err)
	}
	var g golden
	if err := json.Unmarshal(b, &g); err != nil {
		t.Fatal(err)
	}
	return g
}

func TestCompileMatchesPython(t *testing.T) {
	g := loadGolden(t)
	for _, c := range g.Compile {
		_, err := Compile(c.Pattern, c.Flags)
		var reErr *Error
		var ovErr *OverflowError
		var valErr *ValueError
		switch {
		case c.Error == nil:
			if err != nil {
				t.Errorf("Compile(%q, %d): unexpected error %v", c.Pattern, c.Flags, err)
			}
		case err == nil:
			t.Errorf("Compile(%q, %d): no error, Python said %q", c.Pattern, c.Flags, *c.Error)
		case err.Error() != *c.Error:
			t.Errorf("Compile(%q, %d): error %q, Python said %q", c.Pattern, c.Flags, err.Error(), *c.Error)
		case *c.Type == "error" && !errors.As(err, &reErr),
			*c.Type == "OverflowError" && !errors.As(err, &ovErr),
			*c.Type == "ValueError" && !errors.As(err, &valErr):
			t.Errorf("Compile(%q, %d): error type %T, Python raised %s", c.Pattern, c.Flags, err, *c.Type)
		}
	}
}

func TestMatchMatchesPython(t *testing.T) {
	g := loadGolden(t)
	for _, c := range g.Match {
		re, err := Compile(c.Pattern, c.Flags)
		if err != nil {
			t.Errorf("Compile(%q, %d): %v", c.Pattern, c.Flags, err)
			continue
		}
		if got := re.Match(c.S); got != c.Match {
			t.Errorf("match(%q, %q, %d) = %v, Python said %v", c.Pattern, c.S, c.Flags, got, c.Match)
		}
	}
}

func TestMatchString(t *testing.T) {
	if !MatchString(`(?=b)bob`, 0, "bob") || MatchString(`(`, 0, "(") {
		t.Fatal("MatchString")
	}
}

// Nesting past maxNesting is an error, not a Go stack overflow; ordinary
// nesting still compiles.
func TestDeepNestingIsRefused(t *testing.T) {
	for _, open := range []string{"(", "(?:"} {
		deep := strings.Repeat(open, 200000) + "a" + strings.Repeat(")", 200000)
		if err := Check(deep, 0); err == nil {
			t.Errorf("%s nested 200000 deep: accepted", open)
		}
	}
	if err := Check(strings.Repeat("(", 50)+"a"+strings.Repeat(")", 50), 0); err != nil {
		t.Errorf("50 levels: %v", err)
	}
	// Conditional groups recurse into their branches directly: they are
	// bounded too.
	cond := "(a)" + strings.Repeat("(?(1)", 200000) + "a" + strings.Repeat(")", 200000)
	if err := Check(cond, 0); err == nil {
		t.Error("conditionals nested 200000 deep: accepted")
	}
	if err := Check("(a)"+strings.Repeat("(?(1)", 50)+"a"+strings.Repeat(")", 50), 0); err != nil {
		t.Errorf("50 nested conditionals: %v", err)
	}
}
