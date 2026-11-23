package api

import (
	"encoding/json"
	"math/rand"
	"strings"
	"testing"
	"time"
)

// legacyMarshal is the encoder appendJSON replaced: encoding/json with
// HTML escaping off and OMap written key by key through it.
func legacyMarshal(v any) ([]byte, error) {
	return marshalNoEscape(legacyValue(v))
}

// legacyOMap marshals the way OMap.MarshalJSON did before appendJSON.
type legacyOMap struct{ m *OMap }

func (l legacyOMap) MarshalJSON() ([]byte, error) {
	if l.m == nil {
		return []byte("null"), nil
	}
	var out []byte
	out = append(out, '{')
	for i, k := range l.m.keys {
		if i > 0 {
			out = append(out, ',')
		}
		kb, err := marshalNoEscape(k)
		if err != nil {
			return nil, err
		}
		out = append(out, kb...)
		out = append(out, ':')
		vb, err := marshalNoEscape(legacyValue(l.m.vals[k]))
		if err != nil {
			return nil, err
		}
		out = append(out, vb...)
	}
	return append(out, '}'), nil
}

func legacyValue(v any) any {
	switch t := v.(type) {
	case *OMap:
		return legacyOMap{t}
	case []any:
		if t == nil {
			return t
		}
		out := make([]any, len(t))
		for i, e := range t {
			out[i] = legacyValue(e)
		}
		return out
	case []*OMap:
		if t == nil {
			return t
		}
		out := make([]any, len(t))
		for i, e := range t {
			out[i] = legacyOMap{e}
		}
		return out
	case map[string]any:
		if t == nil {
			return t
		}
		out := make(map[string]any, len(t))
		for k, e := range t {
			out[k] = legacyValue(e)
		}
		return out
	}
	return v
}

var trickyStrings = []string{
	"", "plain", `quote " here`, `back\slash`, "tab\there", "nl\nx", "cr\rx", "\b\f", "\x00\x01\x1f\x7f",
	"<script>&amp;</script>", "café", "日本語", "emoji 😀", "\u2028line\u2029para", "bad \xff utf8", "\xc3",
	"mixed é\n\"", strings.Repeat("a", 1000),
}

func checkSame(t *testing.T, v any) {
	t.Helper()
	want, werr := legacyMarshal(v)
	got, gerr := appendJSON(nil, v)
	if (werr != nil) != (gerr != nil) {
		t.Fatalf("error mismatch for %#v: legacy %v, new %v", v, werr, gerr)
	}
	if string(want) != string(got) {
		t.Fatalf("mismatch for %#v:\nlegacy %s\nnew    %s", v, want, got)
	}
	if o, ok := v.(*OMap); ok {
		mj, err := json.Marshal(o)
		if werr == nil && (err != nil || string(mj) != string(asMarshalerOutput(t, want))) {
			t.Fatalf("json.Marshal(OMap) differs: %s vs %s (%v)", mj, want, err)
		}
	}
}

// asMarshalerOutput is what json.Marshal makes of a Marshaler's output: the
// same bytes with <, > and & escaped, as json.Marshal(OMap) always did.
func asMarshalerOutput(t *testing.T, b []byte) []byte {
	out, err := json.Marshal(json.RawMessage(b))
	if err != nil {
		t.Fatal(err)
	}
	return out
}

func TestAppendJSONMatchesEncodingJSON(t *testing.T) {
	var nilOMap *OMap
	var nilInt *int64
	var nilStr *string
	n := int64(42)
	str := "x\"y"
	values := []any{
		nil, true, false, 0, -1, int64(1 << 62), int32(-7), 3.5, 1e21, 1e-7, 0.1, float32(1.5), uint(9),
		&n, nilInt, &str, nilStr, nilOMap, NewOMap(), []any(nil), []any{}, []string(nil), []string{"a", "<b>"},
		[]*OMap(nil), []*OMap{NewOMap().Set("a", 1), nil}, map[string]any(nil), map[string]any{"b": 1, "a": "<", "c": nil},
		json.RawMessage(nil), json.RawMessage(`{ "a" : [1, 2 ,3], "b":"<&>" }`), json.RawMessage(`"x"`), json.Number("12.50"),
		time.Date(2026, 11, 15, 1, 2, 3, 456789000, time.UTC), []int64{1, 2}, map[string]string{"z": "1", "a": "2"},
		struct {
			A string `json:"a"`
			B int    `json:"b,omitempty"`
		}{A: "<x>"},
	}
	for _, s := range trickyStrings {
		values = append(values, s)
	}
	for _, v := range values {
		checkSame(t, v)
	}
	o := NewOMap()
	for i, s := range trickyStrings {
		o.Set(s, values[i%len(values)])
	}
	o.Set("nested", NewOMap().Set("list", []any{NewOMap().Set("x", nilOMap), map[string]any{"k": NewOMap().Set("é", "\u2028")}}))
	checkSame(t, o)
	checkSame(t, []any{o, o})
}

func TestAppendJSONRandom(t *testing.T) {
	rng := rand.New(rand.NewSource(1))
	var gen func(depth int) any
	gen = func(depth int) any {
		switch k := rng.Intn(9); {
		case depth > 3 || k == 0:
			return trickyStrings[rng.Intn(len(trickyStrings))]
		case k == 1:
			return rng.Int63() - rng.Int63()
		case k == 2:
			return rng.Intn(2) == 0
		case k == 3:
			return nil
		case k == 4:
			return rng.NormFloat64() * 1e6
		case k == 5:
			out := []any{}
			for i := rng.Intn(4); i > 0; i-- {
				out = append(out, gen(depth+1))
			}
			return out
		case k == 6:
			out := map[string]any{}
			for i := rng.Intn(4); i > 0; i-- {
				out[trickyStrings[rng.Intn(len(trickyStrings))]] = gen(depth + 1)
			}
			return out
		default:
			o := NewOMap()
			for i := rng.Intn(5); i > 0; i-- {
				o.Set(trickyStrings[rng.Intn(len(trickyStrings))], gen(depth+1))
			}
			return o
		}
	}
	for i := 0; i < 3000; i++ {
		checkSame(t, gen(0))
	}
}
