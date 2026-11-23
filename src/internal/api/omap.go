package api

import (
	"bytes"
	"encoding/json"
)

// OMap is an insertion-ordered JSON object. Django REST Framework emitted
// OrderedDicts, and clients and tests compare field order, so every object
// the API returns is built as one of these.
type OMap struct {
	keys []string
	vals map[string]any
}

// NewOMap creates an empty ordered map.
func NewOMap() *OMap { return &OMap{vals: map[string]any{}} }

// Set adds or replaces a key, keeping the original position on replace.
func (m *OMap) Set(k string, v any) *OMap {
	if m.vals == nil {
		m.vals = map[string]any{}
	}
	if _, ok := m.vals[k]; !ok {
		m.keys = append(m.keys, k)
	}
	m.vals[k] = v
	return m
}

// Get returns a value.
func (m *OMap) Get(k string) (any, bool) {
	v, ok := m.vals[k]
	return v, ok
}

// Has reports presence.
func (m *OMap) Has(k string) bool { _, ok := m.vals[k]; return ok }

// Delete removes a key.
func (m *OMap) Delete(k string) {
	if _, ok := m.vals[k]; !ok {
		return
	}
	delete(m.vals, k)
	for i, kk := range m.keys {
		if kk == k {
			m.keys = append(m.keys[:i], m.keys[i+1:]...)
			break
		}
	}
}

// Keys returns the keys in order.
func (m *OMap) Keys() []string { return append([]string(nil), m.keys...) }

// Len returns the number of keys.
func (m *OMap) Len() int { return len(m.keys) }

// MarshalJSON writes keys in insertion order.
func (m *OMap) MarshalJSON() ([]byte, error) {
	return m.appendJSON(nil)
}

// UnmarshalJSON reads an object preserving key order.
func (m *OMap) UnmarshalJSON(b []byte) error {
	dec := json.NewDecoder(bytes.NewReader(b))
	dec.UseNumber()
	t, err := dec.Token()
	if err != nil {
		return err
	}
	if d, ok := t.(json.Delim); !ok || d != '{' {
		return &json.UnmarshalTypeError{Value: "non-object", Type: nil}
	}
	m.keys = nil
	m.vals = map[string]any{}
	for dec.More() {
		kt, err := dec.Token()
		if err != nil {
			return err
		}
		k := kt.(string)
		var v any
		if err := decodeValue(dec, &v); err != nil {
			return err
		}
		m.Set(k, v)
	}
	_, err = dec.Token()
	return err
}

// decodeValue decodes the next JSON value, keeping nested objects ordered.
func decodeValue(dec *json.Decoder, out *any) error {
	t, err := dec.Token()
	if err != nil {
		return err
	}
	switch d := t.(type) {
	case json.Delim:
		switch d {
		case '{':
			o := NewOMap()
			for dec.More() {
				kt, err := dec.Token()
				if err != nil {
					return err
				}
				var v any
				if err := decodeValue(dec, &v); err != nil {
					return err
				}
				o.Set(kt.(string), v)
			}
			if _, err := dec.Token(); err != nil {
				return err
			}
			*out = o
		case '[':
			arr := []any{}
			for dec.More() {
				var v any
				if err := decodeValue(dec, &v); err != nil {
					return err
				}
				arr = append(arr, v)
			}
			if _, err := dec.Token(); err != nil {
				return err
			}
			*out = arr
		}
	default:
		*out = t
	}
	return nil
}

// ToMap copies the object into a plain map, recursively.
func (m *OMap) ToMap() map[string]any {
	out := make(map[string]any, len(m.keys))
	for _, k := range m.keys {
		switch v := m.vals[k].(type) {
		case *OMap:
			out[k] = v.ToMap()
		default:
			out[k] = v
		}
	}
	return out
}

// marshalNoEscape is json.Marshal without the HTML escaping of <, > and &,
// which the old API's JSON renderer did not do.
func marshalNoEscape(v any) ([]byte, error) {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(v); err != nil {
		return nil, err
	}
	b := buf.Bytes()
	return b[:len(b)-1], nil
}
