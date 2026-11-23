package tasks

import (
	"bytes"
	"fmt"
	"reflect"
	"sort"

	"gopkg.in/yaml.v3"
)

// kv is one top-level extra var, kept in insertion order like the dict
// the old code dumped.
type kv struct {
	Key   string
	Value any
}

// safeDump serialises extra vars the way main.utils.safe_yaml.safe_dump
// did: every string scalar is tagged !unsafe so Ansible never templates
// it, except the top-level entries that also appear unchanged in safeDict
// (the template's own extra vars, set by a privileged user).
func safeDump(vars []kv, safeDict map[string]any) (string, error) {
	var out bytes.Buffer
	for _, e := range vars {
		safe := false
		if sv, ok := safeDict[e.Key]; ok && reflect.DeepEqual(sv, e.Value) {
			safe = true
		}
		doc := &yaml.Node{Kind: yaml.MappingNode, Tag: "!!map"}
		doc.Content = append(doc.Content, scalarNode(e.Key, !safe), valueNode(e.Value, !safe))
		enc := yaml.NewEncoder(&out)
		enc.SetIndent(2)
		if err := enc.Encode(doc); err != nil {
			return "", err
		}
		enc.Close()
	}
	return out.String(), nil
}

func scalarNode(s string, unsafe bool) *yaml.Node {
	n := &yaml.Node{Kind: yaml.ScalarNode, Value: s}
	if unsafe {
		n.Tag = "!unsafe"
		n.Style = yaml.SingleQuotedStyle
	} else {
		n.Tag = "!!str"
		if yamlNeedsQuotes(s) {
			n.Style = yaml.SingleQuotedStyle
		}
	}
	return n
}

// yamlNeedsQuotes mirrors when PyYAML quotes a plain string: when it would
// otherwise read back as another type or is empty.
func yamlNeedsQuotes(s string) bool {
	if s == "" {
		return true
	}
	var v any
	if err := yaml.Unmarshal([]byte(s), &v); err != nil {
		return true
	}
	_, isStr := v.(string)
	return !isStr
}

func valueNode(v any, unsafe bool) *yaml.Node {
	switch t := v.(type) {
	case nil:
		return &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!null", Value: "null"}
	case string:
		return scalarNode(t, unsafe)
	case bool:
		return &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!bool", Value: fmt.Sprint(t)}
	case int, int64, int32:
		return &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!int", Value: fmt.Sprint(t)}
	case float64:
		if t == float64(int64(t)) {
			return &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!int", Value: fmt.Sprint(int64(t))}
		}
		return &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!float", Value: fmt.Sprint(t)}
	case []any:
		n := &yaml.Node{Kind: yaml.SequenceNode, Tag: "!!seq"}
		for _, it := range t {
			n.Content = append(n.Content, valueNode(it, unsafe))
		}
		return n
	case map[string]any:
		n := &yaml.Node{Kind: yaml.MappingNode, Tag: "!!map"}
		keys := make([]string, 0, len(t))
		for k := range t {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, k := range keys {
			n.Content = append(n.Content, scalarNode(k, unsafe), valueNode(t[k], unsafe))
		}
		return n
	default:
		return scalarNode(fmt.Sprint(v), unsafe)
	}
}
