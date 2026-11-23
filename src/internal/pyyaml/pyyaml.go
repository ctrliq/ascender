// Package pyyaml loads YAML the way PyYAML's yaml.safe_load did for the
// variables users write (extra vars, inventory, host and group variables),
// and turns the result into what json.dumps made of it.
//
// yaml.v3 parses the text; this package then constructs the values from
// its node tree with PyYAML's rules, which are YAML 1.1's: a plain yes, no,
// on or off is a boolean, 012 is octal, 1_000 and 1:20 (sexagesimal) are
// integers, 1e3 (no dot) is a string, 2001-12-14 is a date; a key may
// repeat (the last value wins, at the first key's place); << merges
// mappings; and the stream must hold a single document.
package pyyaml

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"math/big"
	"regexp"
	"strconv"
	"strings"

	"gopkg.in/yaml.v3"

	"github.com/ctrliq/ascender/internal/pystr"
)

// Map is a mapping in document order, with its keys as json.dumps wrote
// them. Two Python keys may write the same (the string "1" and the
// integer 1), so a key can appear twice, as it did in json.dumps's output.
type Map struct {
	Keys []string
	Vals []any
}

// Get returns the value of key, the last one when it appears twice (as
// json.loads read it back).
func (m *Map) Get(key string) (any, bool) {
	for i := len(m.Keys) - 1; i >= 0; i-- {
		if m.Keys[i] == key {
			return m.Vals[i], true
		}
	}
	return nil, false
}

// MarshalJSON writes the mapping in document order.
func (m *Map) MarshalJSON() ([]byte, error) {
	var b bytes.Buffer
	b.WriteByte('{')
	for i, k := range m.Keys {
		if i > 0 {
			b.WriteByte(',')
		}
		kb, err := json.Marshal(k)
		if err != nil {
			return nil, err
		}
		b.Write(kb)
		b.WriteByte(':')
		vb, err := json.Marshal(m.Vals[i])
		if err != nil {
			return nil, err
		}
		b.Write(vb)
	}
	b.WriteByte('}')
	return b.Bytes(), nil
}

// CompatError is a document that loaded but that json.dumps refused: a
// date, binary data, a set, a key of another type, a reference cycle.
// Its message is json.dumps's.
type CompatError struct{ Msg string }

func (e *CompatError) Error() string { return e.Msg }

// maxNodes bounds the values an alias-heavy document may expand to.
const maxNodes = 1_000_000

// Load is yaml.safe_load followed by what json.dumps made of the result:
// nil, bool, string, json.Number (integers, and floats written as Python
// wrote them), float64 (infinities and NaN, which json.dumps wrote as
// Infinity and NaN), []any and *Map. An empty stream is nil.
func Load(src string) (any, error) {
	dec := yaml.NewDecoder(strings.NewReader(src))
	var doc yaml.Node
	if err := dec.Decode(&doc); err != nil {
		if errors.Is(err, io.EOF) {
			return nil, nil
		}
		return nil, err
	}
	var next yaml.Node
	if err := dec.Decode(&next); !errors.Is(err, io.EOF) {
		if err != nil {
			return nil, err
		}
		return nil, errors.New("expected a single document in the stream, but found another document")
	}
	c := &constructor{active: map[*yaml.Node]bool{}}
	return c.construct(&doc)
}

// Plain is v with every *Map turned into a map[string]any.
func Plain(v any) any {
	switch t := v.(type) {
	case *Map:
		m := make(map[string]any, len(t.Keys))
		for i, k := range t.Keys {
			m[k] = Plain(t.Vals[i])
		}
		return m
	case []any:
		out := make([]any, len(t))
		for i, x := range t {
			out[i] = Plain(x)
		}
		return out
	}
	return v
}

type constructor struct {
	active map[*yaml.Node]bool // the collections being built, for cycles
	nodes  int
}

const (
	tagStr       = "!!str"
	tagInt       = "!!int"
	tagFloat     = "!!float"
	tagBool      = "!!bool"
	tagNull      = "!!null"
	tagTimestamp = "!!timestamp"
	tagMerge     = "!!merge"
	tagValue     = "!!value"
	tagBinary    = "!!binary"
	tagMap       = "!!map"
	tagSeq       = "!!seq"
	tagSet       = "!!set"
	tagOmap      = "!!omap"
	tagPairs     = "!!pairs"
)

// PyYAML's implicit resolvers, tried in the order they were registered.
var (
	boolRE  = regexp.MustCompile(`^(?:yes|Yes|YES|no|No|NO|true|True|TRUE|false|False|FALSE|on|On|ON|off|Off|OFF)$`)
	floatRE = regexp.MustCompile(`^(?:[-+]?(?:[0-9][0-9_]*)\.[0-9_]*(?:[eE][-+][0-9]+)?|\.[0-9][0-9_]*(?:[eE][-+][0-9]+)?|[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+\.[0-9_]*|[-+]?\.(?:inf|Inf|INF)|\.(?:nan|NaN|NAN))$`)
	intRE   = regexp.MustCompile(`^(?:[-+]?0b[0-1_]+|[-+]?0[0-7_]+|[-+]?(?:0|[1-9][0-9_]*)|[-+]?0x[0-9a-fA-F_]+|[-+]?[1-9][0-9_]*(?::[0-5]?[0-9])+)$`)
	mergeRE = regexp.MustCompile(`^(?:<<)$`)
	nullRE  = regexp.MustCompile(`^(?:~|null|Null|NULL|)$`)
	timeRE  = regexp.MustCompile(`^(?:[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]|[0-9][0-9][0-9][0-9]-[0-9][0-9]?-[0-9][0-9]?(?:[Tt]|[ \t]+)[0-9][0-9]?:[0-9][0-9]:[0-9][0-9](?:\.[0-9]*)?(?:[ \t]*(?:Z|[-+][0-9][0-9]?(?::[0-9][0-9])?))?)$`)
	valueRE = regexp.MustCompile(`^(?:=)$`)
)

type resolver struct {
	first string // the first characters it was registered for ("" too when empty)
	empty bool
	re    *regexp.Regexp
	tag   string
}

var resolvers = []resolver{
	{"yYnNtTfFoO", false, boolRE, tagBool},
	{"-+0123456789.", false, floatRE, tagFloat},
	{"-+0123456789", false, intRE, tagInt},
	{"<", false, mergeRE, tagMerge},
	{"~nN", true, nullRE, tagNull},
	{"0123456789", false, timeRE, tagTimestamp},
	{"=", false, valueRE, tagValue},
}

// tagOf is the tag PyYAML gave the node: its explicit tag, or for a plain
// scalar the first implicit resolver to match (str otherwise).
func tagOf(n *yaml.Node) string {
	if n.Style&yaml.TaggedStyle != 0 && n.Tag != "" && n.Tag != "!" {
		return n.Tag
	}
	switch n.Kind {
	case yaml.MappingNode:
		return tagMap
	case yaml.SequenceNode:
		return tagSeq
	}
	if n.Tag == "!" || n.Style&(yaml.DoubleQuotedStyle|yaml.SingleQuotedStyle|yaml.LiteralStyle|yaml.FoldedStyle) != 0 {
		return tagStr
	}
	v := n.Value
	for _, r := range resolvers {
		if v == "" {
			if !r.empty {
				continue
			}
		} else if !strings.ContainsRune(r.first, rune(v[0])) {
			continue
		}
		if r.re.MatchString(v) {
			return r.tag
		}
	}
	return tagStr
}

func (c *constructor) construct(n *yaml.Node) (any, error) {
	c.nodes++
	if c.nodes > maxNodes {
		return nil, errors.New("the document expands to too many values")
	}
	switch n.Kind {
	case yaml.DocumentNode:
		if len(n.Content) == 0 {
			return nil, nil
		}
		return c.construct(n.Content[0])
	case yaml.AliasNode:
		if c.active[n.Alias] {
			return nil, &CompatError{"Circular reference detected"}
		}
		return c.construct(n.Alias)
	case yaml.ScalarNode:
		return constructScalar(n)
	case yaml.SequenceNode:
		return c.constructSequence(n)
	case yaml.MappingNode:
		return c.constructMapping(n)
	}
	return nil, fmt.Errorf("unexpected YAML node kind %d", n.Kind)
}

func constructScalar(n *yaml.Node) (any, error) {
	v := n.Value
	switch tag := tagOf(n); tag {
	case tagStr:
		return v, nil
	case tagNull:
		return nil, nil
	case tagBool:
		switch strings.ToLower(v) {
		case "yes", "true", "on":
			return true, nil
		case "no", "false", "off":
			return false, nil
		}
		return nil, fmt.Errorf("invalid boolean value %q", v)
	case tagInt:
		return constructInt(v)
	case tagFloat:
		return constructFloat(v)
	case tagTimestamp:
		if len(v) == 10 {
			return nil, &CompatError{"Object of type date is not JSON serializable"}
		}
		return nil, &CompatError{"Object of type datetime is not JSON serializable"}
	case tagBinary:
		return nil, &CompatError{"Object of type bytes is not JSON serializable"}
	default:
		return nil, fmt.Errorf("could not determine a constructor for the tag %s", pyTag(tag))
	}
}

// pyTag writes a tag as PyYAML named it.
func pyTag(tag string) string {
	if strings.HasPrefix(tag, "!!") {
		return "'tag:yaml.org,2002:" + tag[2:] + "'"
	}
	return "'" + tag + "'"
}

// maxIntDigits is CPython's int_max_str_digits default: int() refuses a
// longer decimal string and str() (json.dumps) a larger value, so the old
// application could not load one. The checks come before any big.Int work,
// whose decimal and base-60 conversions take quadratic time: a 10 MiB
// scalar would hold the request for minutes.
const maxIntDigits = 4300

// maxIntBits is the most bits a value of maxIntDigits decimal digits needs.
const maxIntBits = 14285

func intDigitsError(n int) error {
	return fmt.Errorf("Exceeds the limit (%d digits) for integer string conversion: value has %d digits; use sys.set_int_max_str_digits() to increase the limit", maxIntDigits, n)
}

// constructInt is construct_yaml_int.
func constructInt(s string) (any, error) {
	v := strings.ReplaceAll(s, "_", "")
	neg := false
	if v != "" && (v[0] == '-' || v[0] == '+') {
		neg = v[0] == '-'
		v = v[1:]
	}
	// Refuse what cannot fit before converting: a decimal string longer
	// than the limit, more base-60 parts than the limit (each part past
	// the first multiplies the value by 60), and any other spelling longer
	// than a 4300-digit value could need (binary is the longest, at about
	// 3.3 characters a decimal digit). What passes is checked by size
	// below.
	switch {
	case strings.Contains(v, ":"):
		if strings.Count(v, ":") >= maxIntDigits {
			return nil, intDigitsError(maxIntDigits + 1)
		}
	case strings.HasPrefix(v, "0"):
		if len(v) > maxIntBits+2 {
			return nil, intDigitsError(maxIntDigits + 1)
		}
	default:
		if len(v) > maxIntDigits {
			return nil, intDigitsError(len(v))
		}
	}
	n := new(big.Int)
	ok := true
	switch {
	case v == "0":
	case strings.HasPrefix(v, "0b"):
		_, ok = n.SetString(v[2:], 2)
	case strings.HasPrefix(v, "0x"):
		_, ok = n.SetString(v[2:], 16)
	case strings.HasPrefix(v, "0"):
		_, ok = n.SetString(v[1:], 8)
	case strings.Contains(v, ":"):
		base := big.NewInt(1)
		parts := strings.Split(v, ":")
		for i := len(parts) - 1; i >= 0; i-- {
			d, dok := new(big.Int).SetString(parts[i], 10)
			if !dok {
				ok = false
				break
			}
			n.Add(n, d.Mul(d, base))
			base = new(big.Int).Mul(base, big.NewInt(60))
		}
	default:
		_, ok = n.SetString(v, 10)
	}
	if !ok {
		return nil, fmt.Errorf("invalid literal for int(): %q", s)
	}
	if n.BitLen() > maxIntBits {
		return nil, intDigitsError(maxIntDigits + 1)
	}
	if neg {
		n.Neg(n)
	}
	str := n.String()
	if d := len(strings.TrimPrefix(str, "-")); d > maxIntDigits {
		return nil, intDigitsError(d)
	}
	return json.Number(str), nil
}

// constructFloat is construct_yaml_float, written as repr() wrote it.
func constructFloat(s string) (any, error) {
	v := strings.ToLower(strings.ReplaceAll(s, "_", ""))
	sign := 1.0
	if v != "" && (v[0] == '-' || v[0] == '+') {
		if v[0] == '-' {
			sign = -1
		}
		v = v[1:]
	}
	var f float64
	switch {
	case v == ".inf":
		return math.Inf(int(sign)), nil
	case v == ".nan":
		return math.NaN(), nil
	case strings.Contains(v, ":"):
		base := 1.0
		parts := strings.Split(v, ":")
		for i := len(parts) - 1; i >= 0; i-- {
			d, err := strconv.ParseFloat(parts[i], 64)
			if err != nil {
				return nil, fmt.Errorf("could not convert string to float: %q", s)
			}
			f += d * base
			base *= 60
		}
	default:
		var err error
		if f, err = strconv.ParseFloat(v, 64); err != nil && !errors.Is(err, strconv.ErrRange) {
			return nil, fmt.Errorf("could not convert string to float: %q", s)
		}
	}
	f *= sign
	if math.IsInf(f, 0) || math.IsNaN(f) {
		return f, nil
	}
	return json.Number(pystr.FloatRepr(f)), nil
}

func (c *constructor) constructSequence(n *yaml.Node) (any, error) {
	tag := tagOf(n)
	if tag != tagSeq && tag != tagOmap && tag != tagPairs {
		return nil, fmt.Errorf("could not determine a constructor for the tag %s", pyTag(tag))
	}
	c.active[n] = true
	defer delete(c.active, n)
	out := make([]any, 0, len(n.Content))
	for _, item := range n.Content {
		if tag != tagSeq {
			// construct_yaml_omap and _pairs: a list of (key, value)
			// tuples, each from a one-pair mapping.
			m := deref(item)
			if m.Kind != yaml.MappingNode || len(m.Content) != 2 {
				return nil, fmt.Errorf("expected a single mapping item while constructing an ordered map")
			}
			k, err := c.construct(m.Content[0])
			if err != nil {
				return nil, err
			}
			v, err := c.construct(m.Content[1])
			if err != nil {
				return nil, err
			}
			out = append(out, []any{k, v})
			continue
		}
		v, err := c.construct(item)
		if err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, nil
}

func deref(n *yaml.Node) *yaml.Node {
	for n.Kind == yaml.AliasNode {
		n = n.Alias
	}
	return n
}

// pair is one key and value node of a mapping.
type pair struct{ k, v *yaml.Node }

// flatten is flatten_mapping: the pairs of the mappings merged with <<
// come first, a list's earlier mappings winning over its later ones, and
// the mapping's own pairs after them, winning over all.
//
// Merges of aliases are flattened again at every reference, so nested
// anchors merged twice at each level double the pairs per level: a few
// hundred bytes would expand to billions. Every mapping visited and every
// pair produced counts against maxNodes, as constructed values do.
func (c *constructor) flatten(n *yaml.Node, depth int) ([]pair, error) {
	if depth > 1000 {
		return nil, &CompatError{"Circular reference detected"}
	}
	c.nodes++
	if c.nodes > maxNodes {
		return nil, errors.New("the document expands to too many values")
	}
	var merge, own []pair
	for i := 0; i+1 < len(n.Content); i += 2 {
		k, v := n.Content[i], n.Content[i+1]
		if dk := deref(k); dk.Kind == yaml.ScalarNode && tagOf(dk) == tagMerge {
			switch dv := deref(v); dv.Kind {
			case yaml.MappingNode:
				sub, err := c.flatten(dv, depth+1)
				if err != nil {
					return nil, err
				}
				merge = append(merge, sub...)
			case yaml.SequenceNode:
				var subs [][]pair
				for _, s := range dv.Content {
					ds := deref(s)
					if ds.Kind != yaml.MappingNode {
						return nil, fmt.Errorf("while constructing a mapping: expected a mapping for merging")
					}
					sub, err := c.flatten(ds, depth+1)
					if err != nil {
						return nil, err
					}
					subs = append(subs, sub)
				}
				for i := len(subs) - 1; i >= 0; i-- {
					merge = append(merge, subs[i]...)
				}
			default:
				return nil, fmt.Errorf("while constructing a mapping: expected a mapping or list of mappings for merging")
			}
			continue
		}
		own = append(own, pair{k, v})
	}
	out := append(merge, own...)
	c.nodes += len(out)
	if c.nodes > maxNodes {
		return nil, errors.New("the document expands to too many values")
	}
	return out, nil
}

func (c *constructor) constructMapping(n *yaml.Node) (any, error) {
	tag := tagOf(n)
	if tag == tagSet {
		return nil, &CompatError{"Object of type set is not JSON serializable"}
	}
	if tag != tagMap {
		return nil, fmt.Errorf("could not determine a constructor for the tag %s", pyTag(tag))
	}
	pairs, err := c.flatten(n, 0)
	if err != nil {
		return nil, err
	}
	c.active[n] = true
	defer delete(c.active, n)
	m := &Map{}
	// Python's dict: keys that compare equal (1, 1.0 and True) are one key,
	// kept where it first went, under its first spelling.
	byIdentity := map[string]int{}
	for _, p := range pairs {
		key, ident, err := c.constructKey(p.k)
		if err != nil {
			return nil, err
		}
		v, err := c.construct(p.v)
		if err != nil {
			return nil, err
		}
		if i, ok := byIdentity[ident]; ok {
			m.Vals[i] = v
			continue
		}
		byIdentity[ident] = len(m.Keys)
		m.Keys = append(m.Keys, key)
		m.Vals = append(m.Vals, v)
	}
	return m, nil
}

// constructKey builds a mapping key and writes it as json.dumps wrote a
// dict key, with an identity under which equal Python keys coincide.
func (c *constructor) constructKey(n *yaml.Node) (string, string, error) {
	d := deref(n)
	if d.Kind != yaml.ScalarNode {
		if d.Kind == yaml.MappingNode || (d.Kind == yaml.SequenceNode && tagOf(d) == tagSeq) {
			return "", "", errors.New("while constructing a mapping: found unhashable key")
		}
		return "", "", &CompatError{"keys must be str, int, float, bool or None, not tuple"}
	}
	switch tagOf(d) {
	case tagValue:
		return d.Value, "s:" + d.Value, nil
	case tagTimestamp:
		if len(d.Value) == 10 {
			return "", "", &CompatError{"keys must be str, int, float, bool or None, not datetime.date"}
		}
		return "", "", &CompatError{"keys must be str, int, float, bool or None, not datetime.datetime"}
	case tagBinary:
		return "", "", &CompatError{"keys must be str, int, float, bool or None, not bytes"}
	}
	k, err := c.construct(n)
	if err != nil {
		return "", "", err
	}
	switch t := k.(type) {
	case nil:
		return "null", "null", nil
	case string:
		return t, "s:" + t, nil
	case bool:
		if t {
			return "true", "n:1", nil
		}
		return "false", "n:0", nil
	case json.Number:
		s := string(t)
		if f, err := strconv.ParseFloat(s, 64); err == nil && f == math.Trunc(f) && strings.ContainsAny(s, ".e") {
			if bf, _ := new(big.Float).SetFloat64(f).Int(nil); bf != nil {
				return s, "n:" + bf.String(), nil
			}
		}
		return s, "n:" + s, nil
	case float64:
		switch {
		case math.IsNaN(t):
			return "NaN", "nan", nil
		case t > 0:
			return "Infinity", "inf", nil
		default:
			return "-Infinity", "-inf", nil
		}
	}
	return "", "", fmt.Errorf("unexpected key %v", k)
}
