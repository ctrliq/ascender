package pyre

import (
	"slices"
	"testing"
)

// FnmatchTranslate and the match of its result are Python 3.14's
// fnmatch.translate and re.match, from the old image.
func TestFnmatchTranslate(t *testing.T) {
	names := []string{"web01", "web02", "webxx01", "web1", "abc", "acc", "a]c", "]", "x", "b", "-", "a", "&", "~", "|", "^", "[", "a\\b", "\\", "d", "xay", "xyz", "xxyyzz", "é", "{a}", "a b", "#", "c", "web0a", "web01", "web1", "webq", "web0"}
	for _, c := range []struct {
		pat, re string
		match   []string
	}{
		{"web*", "(?s:web.*)\\z", []string{"web01", "web02", "webxx01", "web1", "web0a", "web01", "web1", "webq", "web0"}},
		{"*", "(?s:.*)\\z", []string{"web01", "web02", "webxx01", "web1", "abc", "acc", "a]c", "]", "x", "b", "-", "a", "&", "~", "|", "^", "[", "a\\b", "\\", "d", "xay", "xyz", "xxyyzz", "é", "{a}", "a b", "#", "c", "web0a", "web01", "web1", "webq", "web0"}},
		{"web*01", "(?s:web.*01)\\z", []string{"web01", "webxx01", "web01"}},
		{"web??", "(?s:web..)\\z", []string{"web01", "web02", "web0a", "web01"}},
		{"a[!b]c", "(?s:a[^b]c)\\z", []string{"acc", "a]c"}},
		{"[]]", "(?s:[]])\\z", []string{"]"}},
		{"[!]]", "(?s:[^]])\\z", []string{"x", "b", "-", "a", "&", "~", "|", "^", "[", "\\", "d", "é", "#", "c"}},
		{"[a-z]x", "(?s:[a-z]x)\\z", nil},
		{"[z-a]", "(?s:(?!))\\z", nil},
		{"[a-]", "(?s:[a\\-])\\z", []string{"-", "a"}},
		{"[-a]", "(?s:[\\-a])\\z", []string{"-", "a"}},
		{"[!]", "(?s:\\[!\\])\\z", nil},
		{"[]", "(?s:\\[\\])\\z", nil},
		{"[", "(?s:\\[)\\z", []string{"["}},
		{"a[b", "(?s:a\\[b)\\z", nil},
		{"[a&&b]", "(?s:[a\\&\\&b])\\z", []string{"b", "a", "&"}},
		{"[~~]", "(?s:[\\~\\~])\\z", []string{"~"}},
		{"[a||b]", "(?s:[a\\|\\|b])\\z", []string{"b", "a", "|"}},
		{"[^a]", "(?s:[\\^a])\\z", []string{"a", "^"}},
		{"[[a]", "(?s:[\\[a])\\z", []string{"a", "["}},
		{"a\\b", "(?s:a\\\\b)\\z", []string{"a\\b"}},
		{"[\\]", "(?s:[\\\\])\\z", []string{"\\"}},
		{"[a-c-e]", "(?s:[a-c\\-e])\\z", []string{"b", "-", "a", "c"}},
		{"[a-\\]", "(?s:(?!))\\z", nil},
		{"**x**y*", "(?s:(?>.*?x)(?>.*?y).*)\\z", []string{"xay", "xyz", "xxyyzz"}},
		{"x*y*z", "(?s:x(?>.*?y).*z)\\z", []string{"xyz", "xxyyzz"}},
		{"é*", "(?s:é.*)\\z", []string{"é"}},
		{"{a}", "(?s:\\{a\\})\\z", []string{"{a}"}},
		{"a b", "(?s:a\\ b)\\z", []string{"a b"}},
		{"#", "(?s:\\#)\\z", []string{"#"}},
		{"[!a-b-c]", "(?s:[^a-b\\-c])\\z", []string{"]", "x", "&", "~", "|", "^", "[", "\\", "d", "é", "#"}},
		{"[a--b]", "(?s:[b])\\z", []string{"b"}},
		{"web0[a1]", "(?s:web0[a1])\\z", []string{"web01", "web0a", "web01"}},
		{"[b-a-c]", "(?s:[\\-c])\\z", []string{"-", "c"}},
	} {
		got := FnmatchTranslate(c.pat)
		if got != c.re {
			t.Errorf("translate(%q) = %q, want %q", c.pat, got, c.re)
			continue
		}
		re, err := Compile(got, 0)
		if err != nil {
			t.Errorf("%q: %v", got, err)
			continue
		}
		var matched []string
		for _, n := range names {
			if re.Match(n) {
				matched = append(matched, n)
			}
		}
		if !slices.Equal(matched, c.match) {
			t.Errorf("%q matched %q, want %q", c.pat, matched, c.match)
		}
	}
	if got := Escape("a.b-c d#\t~"); got != "a\\.b\\-c\\ d\\#\\\t\\~" {
		t.Errorf("Escape = %q", got)
	}
}
