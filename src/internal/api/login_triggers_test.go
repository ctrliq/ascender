package api

import (
	"testing"

	"github.com/ctrliq/ascender/internal/sso"
)

// A LOGIN_TRIGGERS value that is set but is not an object cannot be
// evaluated, and turns everyone away; an object is evaluated.
func TestLoginTriggerState(t *testing.T) {
	id := &sso.Identity{
		Groups:     func() ([]string, bool) { return []string{"admins"}, true },
		Attributes: func() map[string]any { return map[string]any{} },
	}
	for _, raw := range []any{"groups", []any{"admins"}, true, 1.0} {
		if got := loginTriggerState(raw, id, "m"); got != sso.TriggerUnusable {
			t.Errorf("%#v: got %v, want unusable", raw, got)
		}
	}
	if got := loginTriggerState(map[string]any{"groups": map[string]any{"has_or": []any{"admins"}}}, id, "m"); got != sso.TriggerAllow {
		t.Errorf("a matching rule: got %v", got)
	}
	if got := loginTriggerState(map[string]any{"groups": map[string]any{"has_or": []any{"others"}}}, id, "m"); got == sso.TriggerAllow {
		t.Error("a rule that does not match allowed the login")
	}
}
