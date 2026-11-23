package pyyaml

import (
	"fmt"
	"strings"
	"testing"
	"time"
)

// mergeBomb nests n anchored mappings, each merging the one inside it
// twice (once inline, once by alias): flattening doubles the pairs at each
// level.
func mergeBomb(n int) string {
	inner := "{k: v}"
	for i := 0; i < n; i++ {
		inner = fmt.Sprintf("{<<: [&a%d %s, *a%d]}", i, inner, i)
	}
	return "x: " + inner + "\n"
}

func TestMergeBombIsRefused(t *testing.T) {
	for _, n := range []int{24, 30, 40, 60} {
		doc := mergeBomb(n)
		start := time.Now()
		_, err := Load(doc)
		took := time.Since(start)
		if err == nil || !strings.Contains(err.Error(), "too many values") {
			t.Errorf("n=%d (%d bytes): Load = %v, want the too-many-values error", n, len(doc), err)
		}
		if took > 5*time.Second {
			t.Errorf("n=%d: took %v", n, took)
		}
	}
}

// Ordinary merges, wide ones included, still load.
func TestMergesStillLoad(t *testing.T) {
	v, err := Load(mergeBomb(4))
	if err != nil {
		t.Fatalf("a shallow merge: %v", err)
	}
	if m := v.(*Map); len(m.Keys) != 1 {
		t.Fatalf("got %v", v)
	}
	var b strings.Builder
	b.WriteString("base: &base\n")
	for i := 0; i < 5000; i++ {
		fmt.Fprintf(&b, "  k%d: %d\n", i, i)
	}
	for i := 0; i < 20; i++ {
		fmt.Fprintf(&b, "copy%d:\n  <<: *base\n  extra: %d\n", i, i)
	}
	if _, err := Load(b.String()); err != nil {
		t.Fatalf("20 merges of a 5000-key mapping: %v", err)
	}
}

// Integers past CPython's 4300-digit limit are refused before the
// quadratic conversions run; the largest that fit still load exactly.
func TestHugeIntegersAreRefusedQuickly(t *testing.T) {
	for name, doc := range map[string]string{
		"decimal":     "a: " + strings.Repeat("7", 200_000),
		"sexagesimal": "a: 1" + strings.Repeat(":1", 100_000),
		"hex":         "a: 0x" + strings.Repeat("f", 200_000),
		"binary":      "a: 0b" + strings.Repeat("1", 200_000),
		"just over":   "a: " + strings.Repeat("9", 4301),
	} {
		start := time.Now()
		if _, err := Load(doc); err == nil || !strings.Contains(err.Error(), "4300 digits") {
			t.Errorf("%s: Load = %v, want the digit limit", name, err)
		}
		if took := time.Since(start); took > 5*time.Second {
			t.Errorf("%s: took %v", name, took)
		}
	}
	v, err := Load("a: " + strings.Repeat("9", 4300))
	if err != nil {
		t.Fatalf("4300 digits: %v", err)
	}
	if got := fmt.Sprint(v.(*Map).Vals[0]); got != strings.Repeat("9", 4300) {
		t.Errorf("4300 digits came back as %d characters", len(got))
	}
}
