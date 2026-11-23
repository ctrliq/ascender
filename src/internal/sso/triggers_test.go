package sso

import "testing"

func groupsOf(g ...string) func() ([]string, bool) {
	return func() ([]string, bool) { return g, true }
}

func state(p *bool) string {
	if p == nil {
		return "None"
	}
	if *p {
		return "True"
	}
	return "False"
}

func TestTriggerGroups(t *testing.T) {
	id := &Identity{Groups: groupsOf("a", "b")}
	cases := []struct {
		rule map[string]any
		want Trigger
	}{
		{map[string]any{"groups": map[string]any{"has_or": []any{"x", "b"}}}, TriggerAllow},
		{map[string]any{"groups": map[string]any{"has_or": []any{"x"}}}, TriggerSkip},
		{map[string]any{"groups": map[string]any{"has_and": []any{"a", "b"}}}, TriggerAllow},
		{map[string]any{"groups": map[string]any{"has_and": []any{"a", "c"}}}, TriggerSkip},
		{map[string]any{"groups": map[string]any{"has_not": []any{"c"}}}, TriggerAllow},
		{map[string]any{"groups": map[string]any{"has_not": []any{"a"}}}, TriggerSkip},
		{map[string]any{"always": map[string]any{}}, TriggerAllow},
		{map[string]any{"never": map[string]any{}}, TriggerDeny},
	}
	for _, c := range cases {
		if got := id.Evaluate(c.rule, "m"); got != c.want {
			t.Errorf("%v: %v want %v", c.rule, got, c.want)
		}
	}
	// Unknown groups make a group rule unusable.
	unknown := &Identity{Groups: func() ([]string, bool) { return nil, false }}
	if got := unknown.Evaluate(map[string]any{"groups": map[string]any{"has_not": []any{"a"}}}, "m"); got != TriggerUnusable {
		t.Errorf("unknown groups: %v", got)
	}
	ci := &Identity{Groups: groupsOf("CN=Admins"), CaseInsensitive: true}
	if got := ci.Evaluate(map[string]any{"groups": map[string]any{"has_or": []any{"cn=admins"}}}, "m"); got != TriggerAllow {
		t.Errorf("case insensitive groups: %v", got)
	}
}

func TestTriggerAttributes(t *testing.T) {
	attrs := map[string]any{"email": "bob@example.com", "dept": []any{"Sales", "Ops"}, "level": float64(3)}
	id := &Identity{Attributes: func() map[string]any { return attrs }}
	rule := func(join string, conds map[string]any) map[string]any {
		if join != "" {
			conds["join_condition"] = join
		}
		return map[string]any{"attributes": conds}
	}
	cases := []struct {
		rule map[string]any
		want Trigger
	}{
		{rule("", map[string]any{"email": map[string]any{"ends_with": "@example.com"}}), TriggerAllow},
		{rule("", map[string]any{"email": map[string]any{"matches": "BOB@"}}), TriggerAllow},
		{rule("", map[string]any{"email": map[string]any{"matches": "ob@"}}), TriggerSkip},
		{rule("", map[string]any{"dept": map[string]any{"in": []any{"Ops"}}}), TriggerAllow},
		// and: every value of every attribute must match.
		{rule("and", map[string]any{"dept": map[string]any{"in": []any{"Ops"}}}), TriggerSkip},
		{rule("and", map[string]any{"email": map[string]any{"contains": "bob"}, "missing": map[string]any{"equals": "x"}}), TriggerSkip},
		{rule("or", map[string]any{"email": map[string]any{"contains": "zed"}, "missing": map[string]any{"equals": "x"}}), TriggerSkip},
		{rule("", map[string]any{"level": map[string]any{"equals": "3"}}), TriggerAllow},
		{rule("", map[string]any{"dept": map[string]any{}}), TriggerAllow},
		{rule("", map[string]any{"nope": map[string]any{}}), TriggerSkip},
		{rule("", map[string]any{"dept": map[string]any{"in": "Ops"}}), TriggerSkip},
	}
	for _, c := range cases {
		if got := id.Evaluate(c.rule, "m"); got != c.want {
			t.Errorf("%v: %v want %v", c.rule, got, c.want)
		}
	}
	caseless := &Identity{Attributes: func() map[string]any { return map[string]any{"departmentNumber": []any{"Sales"}} }, CaselessAttrs: true}
	if got := caseless.Evaluate(rule("", map[string]any{"departmentnumber": map[string]any{"equals": "Sales"}}), "m"); got != TriggerAllow {
		t.Errorf("caseless attribute names: %v", got)
	}
}

func TestResolveMembership(t *testing.T) {
	id := &Identity{Groups: groupsOf("a")}
	yes, none := func() *bool { return Bool(true) }, func() *bool { return nil }
	match := map[string]any{"groups": map[string]any{"has_or": []any{"a"}}}
	miss := map[string]any{"groups": map[string]any{"has_or": []any{"z"}}}
	bad := map[string]any{"groups": map[string]any{"has_or": []any{}}}
	id.Validate = func(rule map[string]any) []string {
		if g, ok := rule["groups"].(map[string]any); ok {
			if l, ok := g["has_or"].([]any); ok && len(l) == 0 {
				return []string{"triggers.groups.has_or: At least one group is required."}
			}
		}
		return nil
	}
	cases := []struct {
		rule     map[string]any
		fallback func() *bool
		remove   bool
		want     string
	}{
		{nil, yes, true, "True"},
		{match, none, false, "True"},
		{miss, none, true, "False"},
		{miss, none, false, "None"},
		{miss, yes, true, "True"},
		{bad, none, true, "None"},
		{map[string]any{"never": map[string]any{}}, yes, false, "False"},
	}
	for _, c := range cases {
		if got := state(id.Resolve(c.rule, "m", c.fallback, c.remove)); got != c.want {
			t.Errorf("%v remove=%v: %s want %s", c.rule, c.remove, got, c.want)
		}
	}
}

func TestExpression(t *testing.T) {
	cases := []struct {
		opts   any
		remove bool
		want   string
	}{
		{nil, true, "None"},
		{true, true, "True"},
		{false, true, "False"},
		{false, false, "None"},
		{[]any{}, true, "False"},
		{"bob", true, "True"},
		{"bob@example.com", true, "True"},
		{[]any{"x", "/^B/i"}, true, "True"},
		{"/^B/", true, "False"},
		{"/ob/", false, "None"},
		{"/^.*@example\\.com$/", true, "True"},
	}
	for _, c := range cases {
		if got := state(Expression("bob", "bob@example.com", c.opts, c.remove)); got != c.want {
			t.Errorf("%v remove=%v: %s want %s", c.opts, c.remove, got, c.want)
		}
	}
	// A pattern only Python compiles still matches.
	if !PyMatch(`(?=b)bob`, "", "bob") {
		t.Error("lookahead pattern")
	}
}
