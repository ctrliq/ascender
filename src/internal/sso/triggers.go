package sso

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"sort"
	"strings"

	"github.com/ctrliq/ascender/internal/pyre"
)

// Trigger rules: the AAP style rules an org/team map entry may carry
// (ascender.sso.triggers over dab's claims processing).

// Trigger is a rule's answer for one user.
type Trigger int

const (
	// TriggerSkip: the rule does not apply to the user.
	TriggerSkip Trigger = iota
	// TriggerAllow: the rule matched.
	TriggerAllow
	// TriggerDeny: the rule denied the user.
	TriggerDeny
	// TriggerUnusable: the rule cannot be evaluated at all.
	TriggerUnusable
)

// Identity is what a rule is evaluated against. Groups returns nil, false
// when the user's groups are not known (which is not belonging to none).
type Identity struct {
	Groups     func() ([]string, bool)
	Attributes func() map[string]any
	// CaseInsensitive is AUTH_MAP_CASE_INSENSITIVE.
	CaseInsensitive bool
	// CaselessAttrs: attribute names are looked up without regard to case
	// (an LDAP entry, which django-auth-ldap held in a cidict).
	CaselessAttrs bool
	Log           *slog.Logger
	// Validate is validate_trigger_rule: the rule's errors as "key:
	// error", sorted by key.
	Validate func(rule map[string]any) []string
}

func (id *Identity) warn(msg string) {
	if id.Log != nil {
		id.Log.Warn(msg, "logger", "ascender.sso.triggers")
	}
}

// Evaluate is evaluate_trigger_rule.
func (id *Identity) Evaluate(rule map[string]any, mapID string) Trigger {
	if id.Validate != nil {
		if errs := id.Validate(rule); len(errs) > 0 {
			id.warn(fmt.Sprintf("The trigger rule in mapping %s will be ignored: %s", mapID, strings.Join(errs, "; ")))
			return TriggerUnusable
		}
	}
	result := TriggerSkip
	for typ, trig := range rule {
		switch typ {
		case "groups":
			var groups []string
			ok := false
			if id.Groups != nil {
				groups, ok = id.Groups()
			}
			if !ok {
				id.warn(fmt.Sprintf("The trigger rule in mapping %s will be ignored: the user's groups are not known", mapID))
				return TriggerUnusable
			}
			cond, _ := trig.(map[string]any)
			result = processGroups(cond, groups, id.CaseInsensitive)
		case "attributes":
			cond, _ := trig.(map[string]any)
			var attrs map[string]any
			if id.Attributes != nil {
				attrs = id.Attributes()
			}
			result = processAttributes(cond, attrs, id.CaseInsensitive, id.CaselessAttrs)
		case "always":
			result = TriggerAllow
		case "never":
			result = TriggerDeny
		}
	}
	return result
}

// Resolve is resolve_membership: one role of one map entry. fallback is
// what the entry's older options decide (nil: no opinion).
func (id *Identity) Resolve(rule map[string]any, mapID string, fallback func() *bool, remove bool) *bool {
	if len(rule) == 0 {
		return fallback()
	}
	switch id.Evaluate(rule, mapID) {
	case TriggerUnusable:
		return fallback()
	case TriggerAllow:
		return Bool(true)
	case TriggerDeny:
		return Bool(false)
	}
	state := fallback()
	if state == nil && remove {
		return Bool(false)
	}
	return state
}

// Bool is a pointer to b.
func Bool(b bool) *bool { return &b }

func strList(v any) []string {
	l, _ := v.([]any)
	out := make([]string, 0, len(l))
	for _, x := range l {
		out = append(out, PyStr(x))
	}
	return out
}

// PyStr is Python's f"{value}" for a JSON value.
func PyStr(v any) string {
	switch t := v.(type) {
	case nil:
		return "None"
	case string:
		return t
	case bool:
		if t {
			return "True"
		}
		return "False"
	case float64:
		if t == float64(int64(t)) && t < 1e16 && t > -1e16 {
			return fmt.Sprintf("%d", int64(t))
		}
		return fmt.Sprint(t)
	case json.Number:
		return t.String()
	}
	b, _ := json.Marshal(v)
	return string(b)
}

func casefold(s string) string { return strings.ToLower(s) }

func processGroups(cond map[string]any, groups []string, ci bool) Trigger {
	set := map[string]bool{}
	for _, g := range groups {
		if ci {
			g = casefold(g)
		}
		set[g] = true
	}
	list := func(k string) []string {
		l := strList(cond[k])
		if ci {
			for i := range l {
				l[i] = casefold(l[i])
			}
		}
		return l
	}
	if _, ok := cond["has_or"]; ok {
		for _, g := range list("has_or") {
			if set[g] {
				return TriggerAllow
			}
		}
	} else if _, ok := cond["has_and"]; ok {
		for _, g := range list("has_and") {
			if !set[g] {
				return TriggerSkip
			}
		}
		return TriggerAllow
	} else if _, ok := cond["has_not"]; ok {
		for _, g := range list("has_not") {
			if set[g] {
				return TriggerSkip
			}
		}
		return TriggerAllow
	}
	return TriggerSkip
}

func join(cur *bool, v bool, cond string) *bool {
	if cur == nil {
		return Bool(v)
	}
	if cond == "and" {
		return Bool(*cur && v)
	}
	return Bool(*cur || v)
}

func processAttributes(cond map[string]any, attrs map[string]any, ci, caseless bool) Trigger {
	get := func(name string) (any, bool) {
		v, ok := attrs[name]
		if ok || !caseless {
			return v, ok
		}
		for k, v := range attrs {
			if strings.EqualFold(k, name) {
				return v, true
			}
		}
		return nil, false
	}
	if ci {
		low := make(map[string]any, len(attrs))
		for k, v := range attrs {
			low[casefold(k)] = v
		}
		attrs = low
		lc := make(map[string]any, len(cond))
		for k, v := range cond {
			switch t := v.(type) {
			case string:
				lc[casefold(k)] = casefold(t)
			case map[string]any:
				m := make(map[string]any, len(t))
				for op, val := range t {
					switch vv := val.(type) {
					case string:
						m[op] = casefold(vv)
					case []any:
						l := make([]any, len(vv))
						for i, x := range vv {
							l[i] = casefold(PyStr(x))
						}
						m[op] = l
					default:
						m[op] = val
					}
				}
				lc[casefold(k)] = m
			default:
				lc[casefold(k)] = v
			}
		}
		cond = lc
	}
	joinCond := "or"
	if jc, ok := cond["join_condition"]; ok {
		if s, _ := jc.(string); s == "and" || s == "or" {
			joinCond = s
		}
	}
	var access *bool
	names := make([]string, 0, len(cond))
	for k := range cond {
		if k != "join_condition" {
			names = append(names, k)
		}
	}
	sort.Strings(names)
	for _, attr := range names {
		if access != nil && *access && joinCond == "or" {
			break
		}
		if access != nil && !*access && joinCond == "and" {
			break
		}
		c, _ := cond[attr].(map[string]any)
		if in, ok := c["in"]; ok {
			if _, isList := in.([]any); !isList {
				continue
			}
		}
		if len(c) == 0 {
			_, has := get(attr)
			access = join(access, has, joinCond)
			continue
		}
		uv, has := get(attr)
		if !has || uv == nil {
			if joinCond == "and" {
				access = join(access, false, joinCond)
			}
			continue
		}
		values, isList := uv.([]any)
		if !isList {
			values = []any{uv}
		}
		op := ""
		for _, o := range []string{"equals", "matches", "contains", "ends_with", "in"} {
			if _, ok := c[o]; ok {
				op = o
				break
			}
		}
		if op == "" {
			continue
		}
		tv := c[op]
		for _, v := range values {
			s := PyStr(v)
			if ci {
				s = casefold(s)
			}
			var r bool
			switch op {
			case "equals":
				t, isStr := tv.(string)
				r = isStr && s == t
			case "matches":
				t, _ := tv.(string)
				r = PyMatch(t, "i", s)
			case "contains":
				r = strings.Contains(s, PyStr(tv))
			case "ends_with":
				r = strings.HasSuffix(s, PyStr(tv))
			case "in":
				for _, x := range tv.([]any) {
					if xs, ok := x.(string); ok && xs == s {
						r = true
						break
					}
				}
			}
			access = join(access, r, joinCond)
		}
	}
	if access != nil && *access {
		return TriggerAllow
	}
	return TriggerSkip
}

// PyMatch is re.match(pattern, s, flags) is not None, flags drawn from
// "i" and "m", matched as Python's re did (see package pyre).
func PyMatch(pattern, flags, s string) bool {
	return pyre.MatchString(pattern, pyre.FlagsFrom(flags), s)
}
