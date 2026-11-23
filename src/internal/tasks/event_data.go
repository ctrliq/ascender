package tasks

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"strings"

	"github.com/ctrliq/ascender/internal/redact"
)

// The callback receiver stored an event's event_data as the dict the
// runner sent, so in the order the callback plugin wrote its keys, with
// the task's guid added last (RunnerCallback.event_handler), and as
// json.dumps wrote it (JSONBlob). The API renders event_data in the
// stored order. A runner event decoded into a Go map has lost that order,
// so where events are read their event_data is also kept as written.

// rawEventDataKey is the runner event key that carries its event_data as
// the runner wrote it (a json.RawMessage). It is not a JSON key a runner
// can send.
const rawEventDataKey = "\x00event_data"

// keepEventData notes on ev the event_data member of raw, the JSON the
// event was decoded from, when it has one that is an object.
func keepEventData(ev runnerEvent, raw []byte) {
	var m struct {
		EventData json.RawMessage `json:"event_data"`
	}
	if json.Unmarshal(raw, &m) == nil {
		if b := bytes.TrimSpace(m.EventData); len(b) > 0 && b[0] == '{' {
			ev[rawEventDataKey] = json.RawMessage(b)
		}
	}
}

// eventDataText is the event_data text the callback receiver stored for
// ev, whose event_data the sink decoded as data (with its changes, such
// as redaction, already made). Without event_data it is "{}"; with one,
// the guid follows the runner's keys. redactURIs redacts the written
// form as the project update callback did data.
func eventDataText(ev runnerEvent, data map[string]any, guid any, redactURIs bool) string {
	if _, ok := ev["event_data"]; !ok {
		return "{}"
	}
	var obj *orderedObject
	if raw, ok := ev[rawEventDataKey].(json.RawMessage); ok {
		if v, err := decodeOrdered(raw); err == nil {
			obj, _ = v.(*orderedObject)
		}
	}
	if obj == nil {
		// No text to keep the order of (or none that parses): the decoded
		// keys, sorted.
		b, _ := json.Marshal(data)
		v, _ := decodeOrdered(b)
		obj, _ = v.(*orderedObject)
		if obj == nil {
			obj = &orderedObject{}
		}
		redactURIs = false
	}
	if redactURIs {
		obj = redactOrdered(obj).(*orderedObject)
	}
	obj.set("guid", guid)
	var b strings.Builder
	writePyJSON(&b, obj)
	return b.String()
}

// orderedObject is a JSON object with its keys in document order; a key
// written twice keeps its first place and its last value, as json.loads
// left it.
type orderedObject struct {
	keys []string
	vals map[string]any
}

func (o *orderedObject) set(k string, v any) {
	if o.vals == nil {
		o.vals = map[string]any{}
	}
	if _, ok := o.vals[k]; !ok {
		o.keys = append(o.keys, k)
	}
	o.vals[k] = v
}

// decodeOrdered decodes JSON with objects as *orderedObject and numbers
// as json.Number, as written.
func decodeOrdered(b []byte) (any, error) {
	dec := json.NewDecoder(bytes.NewReader(b))
	dec.UseNumber()
	v, err := decodeOrderedValue(dec)
	if err != nil {
		return nil, err
	}
	if _, err := dec.Token(); err != io.EOF {
		return nil, fmt.Errorf("trailing data after JSON value")
	}
	return v, nil
}

func decodeOrderedValue(dec *json.Decoder) (any, error) {
	t, err := dec.Token()
	if err != nil {
		return nil, err
	}
	switch t {
	case json.Delim('{'):
		o := &orderedObject{vals: map[string]any{}}
		for dec.More() {
			kt, err := dec.Token()
			if err != nil {
				return nil, err
			}
			k, _ := kt.(string)
			v, err := decodeOrderedValue(dec)
			if err != nil {
				return nil, err
			}
			o.set(k, v)
		}
		_, err := dec.Token()
		return o, err
	case json.Delim('['):
		list := []any{}
		for dec.More() {
			v, err := decodeOrderedValue(dec)
			if err != nil {
				return nil, err
			}
			list = append(list, v)
		}
		_, err := dec.Token()
		return list, err
	}
	return t, nil
}

// redactOrdered is redact.URIsIn for an ordered value.
func redactOrdered(v any) any {
	switch t := v.(type) {
	case string:
		return redact.URIs(t)
	case []any:
		out := make([]any, len(t))
		for i, x := range t {
			out[i] = redactOrdered(x)
		}
		return out
	case *orderedObject:
		out := &orderedObject{vals: map[string]any{}}
		for _, k := range t.keys {
			out.set(redact.URIs(k), redactOrdered(t.vals[k]))
		}
		return out
	}
	return v
}

// writePyJSON writes v as json.dumps did with its defaults: ", " and ": "
// separators and ASCII only.
func writePyJSON(b *strings.Builder, v any) {
	switch t := v.(type) {
	case *orderedObject:
		b.WriteByte('{')
		for i, k := range t.keys {
			if i > 0 {
				b.WriteString(", ")
			}
			writePyString(b, k)
			b.WriteString(": ")
			writePyJSON(b, t.vals[k])
		}
		b.WriteByte('}')
	case []any:
		b.WriteByte('[')
		for i, x := range t {
			if i > 0 {
				b.WriteString(", ")
			}
			writePyJSON(b, x)
		}
		b.WriteByte(']')
	case string:
		writePyString(b, t)
	case json.Number:
		b.WriteString(t.String())
	case bool:
		if t {
			b.WriteString("true")
		} else {
			b.WriteString("false")
		}
	case nil:
		b.WriteString("null")
	default:
		raw, _ := json.Marshal(t)
		b.Write(raw)
	}
}

// writePyString writes s as json.dumps(ensure_ascii=True) quoted it.
func writePyString(b *strings.Builder, s string) {
	b.WriteByte('"')
	for _, r := range s {
		switch {
		case r == '"':
			b.WriteString(`\"`)
		case r == '\\':
			b.WriteString(`\\`)
		case r == '\n':
			b.WriteString(`\n`)
		case r == '\r':
			b.WriteString(`\r`)
		case r == '\t':
			b.WriteString(`\t`)
		case r == '\b':
			b.WriteString(`\b`)
		case r == '\f':
			b.WriteString(`\f`)
		case r < 0x20:
			fmt.Fprintf(b, `\u%04x`, r)
		case r < 0x80:
			b.WriteRune(r)
		case r > 0xFFFF:
			r -= 0x10000
			fmt.Fprintf(b, `\u%04x\u%04x`, 0xD800+(r>>10), 0xDC00+(r&0x3FF))
		default:
			fmt.Fprintf(b, `\u%04x`, r)
		}
	}
	b.WriteByte('"')
}
