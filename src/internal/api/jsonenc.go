package api

import (
	"bytes"
	"encoding/json"
	"slices"
	"strconv"
	"sync"
	"unicode/utf8"
)

// appendJSON appends v encoded exactly as marshalNoEscape would encode it,
// in one pass. Going through encoding/json, every nested OMap's
// MarshalJSON output was validated and copied again by its parent, at
// every level, and each key and value got its own encoder and buffer:
// building a page of 200 templates spent more time there than in the
// database. The types the serializers produce are written directly;
// anything else goes through encoding/json as before.
func appendJSON(b []byte, v any) ([]byte, error) {
	switch t := v.(type) {
	case nil:
		return append(b, "null"...), nil
	case *OMap:
		return t.appendJSON(b)
	case string:
		return appendJSONString(b, t)
	case bool:
		return strconv.AppendBool(b, t), nil
	case int:
		return strconv.AppendInt(b, int64(t), 10), nil
	case int64:
		return strconv.AppendInt(b, t, 10), nil
	case int32:
		return strconv.AppendInt(b, int64(t), 10), nil
	case *int64:
		if t == nil {
			return append(b, "null"...), nil
		}
		return strconv.AppendInt(b, *t, 10), nil
	case *string:
		if t == nil {
			return append(b, "null"...), nil
		}
		return appendJSONString(b, *t)
	case []any:
		if t == nil {
			return append(b, "null"...), nil
		}
		b = append(b, '[')
		for i, e := range t {
			if i > 0 {
				b = append(b, ',')
			}
			var err error
			if b, err = appendJSON(b, e); err != nil {
				return nil, err
			}
		}
		return append(b, ']'), nil
	case []*OMap:
		if t == nil {
			return append(b, "null"...), nil
		}
		b = append(b, '[')
		for i, e := range t {
			if i > 0 {
				b = append(b, ',')
			}
			var err error
			if b, err = e.appendJSON(b); err != nil {
				return nil, err
			}
		}
		return append(b, ']'), nil
	case []string:
		if t == nil {
			return append(b, "null"...), nil
		}
		b = append(b, '[')
		for i, e := range t {
			if i > 0 {
				b = append(b, ',')
			}
			var err error
			if b, err = appendJSONString(b, e); err != nil {
				return nil, err
			}
		}
		return append(b, ']'), nil
	case map[string]any:
		if t == nil {
			return append(b, "null"...), nil
		}
		// encoding/json writes map keys sorted.
		keys := make([]string, 0, len(t))
		for k := range t {
			keys = append(keys, k)
		}
		slices.Sort(keys)
		b = append(b, '{')
		for i, k := range keys {
			if i > 0 {
				b = append(b, ',')
			}
			var err error
			if b, err = appendJSONString(b, k); err != nil {
				return nil, err
			}
			b = append(b, ':')
			if b, err = appendJSON(b, t[k]); err != nil {
				return nil, err
			}
		}
		return append(b, '}'), nil
	case json.RawMessage:
		if t == nil {
			return append(b, "null"...), nil
		}
		// encoding/json compacts a RawMessage (it is a Marshaler).
		buf := bytes.NewBuffer(b)
		if err := json.Compact(buf, t); err != nil {
			return nil, err
		}
		return buf.Bytes(), nil
	}
	enc, err := marshalNoEscape(v)
	if err != nil {
		return nil, err
	}
	return append(b, enc...), nil
}

// appendJSON writes the object's keys in insertion order.
func (m *OMap) appendJSON(b []byte) ([]byte, error) {
	if m == nil {
		return append(b, "null"...), nil
	}
	b = append(b, '{')
	for i, k := range m.keys {
		if i > 0 {
			b = append(b, ',')
		}
		var err error
		if b, err = appendJSONString(b, k); err != nil {
			return nil, err
		}
		b = append(b, ':')
		if b, err = appendJSON(b, m.vals[k]); err != nil {
			return nil, err
		}
	}
	return append(b, '}'), nil
}

// appendJSONString quotes s. Printable ASCII without quotes or
// backslashes is written as is; anything else (control characters,
// invalid UTF-8, U+2028 and U+2029, which encoding/json escapes) takes
// encoding/json's path so the escaping stays its own.
func appendJSONString(b []byte, s string) ([]byte, error) {
	for i := 0; i < len(s); i++ {
		c := s[i]
		if c < 0x20 || c == '"' || c == '\\' || c >= utf8.RuneSelf {
			if c >= utf8.RuneSelf && plainUnicode(s) {
				break
			}
			enc, err := marshalNoEscape(s)
			if err != nil {
				return nil, err
			}
			return append(b, enc...), nil
		}
	}
	b = append(b, '"')
	b = append(b, s...)
	return append(b, '"'), nil
}

// plainUnicode reports whether s is valid UTF-8 that encoding/json writes
// unchanged: no control characters, quotes, backslashes, U+2028 or
// U+2029.
func plainUnicode(s string) bool {
	if !utf8.ValidString(s) {
		return false
	}
	for _, r := range s {
		if r < 0x20 || r == '"' || r == '\\' || r == ' ' || r == ' ' {
			return false
		}
	}
	return true
}

// jsonBufs recycles response buffers.
var jsonBufs = sync.Pool{New: func() any { b := make([]byte, 0, 64<<10); return &b }}
