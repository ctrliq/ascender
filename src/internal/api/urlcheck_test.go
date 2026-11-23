package api

import (
	"strings"
	"testing"
)

// The results are those of the old application's URLField (Django's
// URLValidator) for the same strings, including its quirks: 1.2.3.04 passes
// as a domain whose top-level label is "04", and only a domain's first
// label may not start or end with a hyphen.
func TestValidURL(t *testing.T) {
	schemes := []string{"http", "https", "ftp", "ftps"}
	for _, tc := range []struct {
		url  string
		want bool
	}{
		{"http://example.com", true},
		{"https://example.com/path?q=1#f", true},
		{"http://example.com.", true},
		{"HTTP://EXAMPLE.COM", true},
		{"ftp://example.com", true},
		{"ftps://example.com", true},
		{"gopher://example.com", false},
		{"http:/example.com", false},
		{"://example.com", false},
		{"http://localhost", true},
		{"http://LocalHost:8080/x", true},
		{"http://localhost.", false},
		{"http://1.2.3.4", true},
		{"http://255.255.255.255", true},
		{"http://256.1.1.1", false},
		{"http://1.2.3.04", true},
		{"http://1.2.3", false},
		{"http://[::1]", true},
		{"http://[::1]:8080/x", true},
		{"http://[]", false},
		{"http://[g::1]", false},
		{"http://u:p@example.com", true},
		{"http://u@example.com", true},
		{"http://:p@example.com", false},
		{"http://u:p:q@example.com", false},
		{"http://localhost?@", true},
		{"http://a@b@c.com", false},
		{"http://u p@example.com", false},
		{"http://example.com/a b", false},
		{"http://example.com/a\tb", false},
		{"http://example.com:8", false},
		{"http://example.com:123456", false},
		{"http://example.com:12345", true},
		{"http://example", false},
		{"http://a.b", false},
		{"http://-a.com", false},
		{"http://a-.com", false},
		{"http://a.-b-.com", true},
		{"http://example..com", false},
		{"http://ex_ample.com", false},
		{"http://\u00e9xample.com", true},
		{"http://\U0001F600.com", false},
		{"http://example.xn--p1ai", true},
		{"http://" + strings.Repeat("a", 63) + ".com", true},
		{"http://" + strings.Repeat("a", 64) + ".com", false},
	} {
		if got := validURL(tc.url, schemes); got != tc.want {
			t.Errorf("validURL(%q) = %v, want %v", tc.url, got, tc.want)
		}
	}
}
