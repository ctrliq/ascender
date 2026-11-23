package sso

import (
	"encoding/json"
	"regexp"
	"strings"
)

// Org and team map expressions: which users a map entry's admins, users
// (and for LDAP auditors) options name.

var mapRegexRe = regexp.MustCompile(`^/(.*)/([im]+)?$`)

// truthy is Python's bool() of a JSON value.
func truthy(v any) bool {
	switch t := v.(type) {
	case nil:
		return false
	case bool:
		return t
	case string:
		return t != ""
	case []any:
		return len(t) > 0
	case map[string]any:
		return len(t) > 0
	case float64:
		return t != 0
	case json.Number:
		f, err := t.Float64()
		return err != nil || f != 0
	}
	return true
}

func listOrOne(opts any) []any {
	if l, ok := opts.([]any); ok {
		return l
	}
	return []any{opts}
}

// Expression is the social pipeline's _update_m2m_from_expression: None,
// True, a username or email, a "/regex/flags" or a list of those. A
// user it names is added; one it does not is removed when remove is set.
func Expression(username, email string, opts any, remove bool) *bool {
	if opts == nil {
		return nil
	}
	if b, ok := opts.(bool); ok && b {
		return Bool(true)
	}
	if truthy(opts) {
		for _, x := range listOrOne(opts) {
			s, ok := x.(string)
			if !ok {
				continue
			}
			if m := mapRegexRe.FindStringSubmatch(s); m != nil {
				flags := ""
				if strings.Contains(m[2], "i") {
					flags += "i"
				}
				if strings.Contains(m[2], "m") {
					flags += "m"
				}
				if PyMatch(m[1], flags, username) || PyMatch(m[1], flags, email) {
					return Bool(true)
				}
				continue
			}
			if username == s || email == s {
				return Bool(true)
			}
		}
	}
	if remove {
		return Bool(false)
	}
	return nil
}

// GroupsExpression is the LDAP backend's _update_m2m_from_groups: None,
// True, or group DNs the user must belong to one of.
func (u *LDAPUser) GroupsExpression(opts any, remove bool) (*bool, error) {
	if opts == nil {
		return nil, nil
	}
	if b, ok := opts.(bool); ok && b {
		return Bool(true), nil
	}
	if truthy(opts) {
		for _, x := range listOrOne(opts) {
			dn, ok := x.(string)
			if !ok {
				continue
			}
			member, err := u.IsMemberOf(dn)
			if err != nil {
				return nil, err
			}
			if member {
				return Bool(true), nil
			}
		}
	}
	if remove {
		return Bool(false), nil
	}
	return nil, nil
}
