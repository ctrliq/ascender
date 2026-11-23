package jinja

import (
	"errors"
	"testing"
	"time"
)

// TestRunawayTemplates checks the limits that stand in for the CPU and
// memory caps Python ran under.
func TestRunawayTemplates(t *testing.T) {
	cases := map[string]string{
		"{% for a in range(100000) %}{% for b in range(100000) %}{% endfor %}{% endfor %}": "TimeoutError",
		"{{ 10 ** (10 ** 10) }}":                          "MemoryError",
		"{{ 'x' * 10 ** 12 }}":                            "MemoryError",
		"{% macro m() %}{{ m() }}{% endmacro %}{{ m() }}": "RecursionError",
	}
	for src, typ := range cases {
		env := &Environment{Timeout: 200 * time.Millisecond}
		tpl, err := env.FromString(src)
		if err != nil {
			t.Fatal(err)
		}
		start := time.Now()
		_, err = tpl.Render(nil)
		var e *Error
		if !errors.As(err, &e) || e.Type != typ {
			t.Errorf("%q: %v, want %s", src, err, typ)
		}
		if d := time.Since(start); d > 2*time.Second {
			t.Errorf("%q took %s", src, d)
		}
	}
}
