package api

import (
	"strings"
	"testing"
)

// A webhook key is get_random_string(length=50): 50 characters of
// Django's alphabet, different each time.
func TestNewWebhookKey(t *testing.T) {
	seen := map[string]bool{}
	counts := map[rune]int{}
	for i := 0; i < 2000; i++ {
		k := newWebhookKey()
		if len(k) != 50 || strings.Trim(k, webhookKeyAlphabet) != "" {
			t.Fatalf("bad key %q", k)
		}
		if seen[k] {
			t.Fatalf("repeated key %q", k)
		}
		seen[k] = true
		for _, c := range k {
			counts[c]++
		}
	}
	// 100000 characters over 62: each about 1613; a byte%62 bias would put
	// the first eight near 1953.
	for _, c := range webhookKeyAlphabet {
		if n := counts[c]; n < 1350 || n > 1880 {
			t.Errorf("%c drawn %d times", c, n)
		}
	}
}

// webhookKeyOnSave follows WebhookKeyTemplateMixin.save: "new" means a
// generated key.
func TestWebhookKeyOnSave(t *testing.T) {
	for _, c := range []struct {
		name                                   string
		isNew                                  bool
		oldService, oldKey, service, key, want string
	}{
		{"new, no service", true, "", "", "", "", ""},
		{"new, service, no key", true, "", "", "github", "", "new"},
		{"new, service, own key", true, "", "", "github", "mine", "mine"},
		{"service added", false, "", "", "github", "", "new"},
		{"service added with own key", false, "", "", "github", "mine", "mine"},
		{"service changed, key not sent", false, "github", "old", "gitlab", "old", "new"},
		{"service changed, key blanked", false, "github", "old", "gitlab", "", "new"},
		{"service changed, own key", false, "github", "old", "gitlab", "mine", "mine"},
		{"service removed", false, "github", "old", "", "old", ""},
		{"unchanged", false, "github", "old", "github", "old", "old"},
		{"key replaced", false, "github", "old", "github", "mine", "mine"},
		{"key blanked", false, "github", "old", "github", "", "new"},
	} {
		got := webhookKeyOnSave(c.isNew, c.oldService, c.oldKey, c.service, c.key)
		if c.want == "new" {
			if len(got) != 50 || got == c.oldKey {
				t.Errorf("%s: got %q, want a new key", c.name, got)
			}
		} else if got != c.want {
			t.Errorf("%s: got %q, want %q", c.name, got, c.want)
		}
	}
}
