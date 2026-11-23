package api

import "testing"

func TestIsLocalPath(t *testing.T) {
	for next, want := range map[string]bool{
		"/home": true, "/templates/job_template/7/details?x=1#y": true, "/api/v2/": true,
		"": false, "home": false, "//evil.com": false, `/\evil.com`: false, `/\/evil.com`: false,
		"/\t/evil.com": false, "/\n/evil.com": false, "https://evil.com/": false, "javascript:alert(1)": false,
		"/\u200b/evil.com": false, "///evil.com": false,
	} {
		if got := IsLocalPath(next); got != want {
			t.Errorf("IsLocalPath(%q) = %v, want %v", next, got, want)
		}
	}
}
