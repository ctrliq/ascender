package tasks

import (
	"slices"
	"testing"
)

// An inventory source's host_filter is a Python regular expression matched
// with re.match, as perform_update compiled it; the group filter is the
// default "^.+$". The expected names are Python 3.14's (the old image).
func TestImportFiltersArePythonRe(t *testing.T) {
	names := []string{"web01", "db01", "webweb", "xweb", "", "a\nb", "web\n", "aa", "12", "y", "xy"}
	for _, c := range []struct {
		filter string
		want   []string
		err    string
	}{
		{`^(?!db)`, []string{"web01", "webweb", "xweb", "", "a\nb", "web\n", "aa", "12", "y", "xy"}, ""},
		{`(web)\1`, []string{"webweb"}, ""},
		{`web`, []string{"web01", "webweb", "web\n"}, ""},
		{``, []string{"web01", "db01", "webweb", "xweb", "web\n", "aa", "12", "y", "xy"}, ""},
		{`^.+$`, []string{"web01", "db01", "webweb", "xweb", "web\n", "aa", "12", "y", "xy"}, ""},
		{`(?<=x)y`, nil, ""},
		{`\d+$`, []string{"12"}, ""},
		{`(?P<n>a)(?P=n)`, []string{"aa"}, ""},
		{`[`, nil, "invalid regular expression for --host-filter"},
		{`a{4294967296}`, nil, "the repetition number is too large"},
	} {
		groupRe, hostRe, err := importFilters(importOptions{hostFilter: c.filter})
		if c.err != "" {
			if err == nil || err.Error() != c.err {
				t.Errorf("%q: error %v, want %q", c.filter, err, c.err)
			}
			continue
		}
		if err != nil {
			t.Errorf("%q: %v", c.filter, err)
			continue
		}
		var got []string
		for _, n := range names {
			if reMatch(hostRe, n) {
				got = append(got, n)
			}
		}
		if !slices.Equal(got, c.want) {
			t.Errorf("%q matched %q, want %q", c.filter, got, c.want)
		}
		if reMatch(groupRe, "") || reMatch(groupRe, "a\nb") || !reMatch(groupRe, "web\n") || !reMatch(groupRe, "web") {
			t.Errorf("group filter is not ^.+$")
		}
	}
}
