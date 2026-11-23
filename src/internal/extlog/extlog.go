// Package extlog sends log records to the external log aggregator
// (LOG_AGGREGATOR_*), formatted as the old LogstashFormatter did and
// carried as the old rsyslog actions carried them: omfwd over TCP (one
// record per line) or UDP (one per datagram), omrelp, or omhttp (one POST
// per record).
package extlog

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

// Config is the aggregator the settings describe.
type Config struct {
	Enabled    bool
	Host       string
	Port       int64
	Protocol   string // https, tcp, udp, relp
	Type       string // logstash, splunk, loggly, sumologic, other, ledger
	Username   string
	Password   string
	VerifyCert bool
	Timeout    time.Duration
	Loggers    []string
	Level      string
	// Metadata added to every record.
	ClusterHostID, InstallUUID, URLBase string
}

// Field is one key of a record's extra fields, in order.
type Field struct {
	Key   string
	Value any
}

// Record is one log record.
type Record struct {
	Time    time.Time
	Logger  string
	Level   string // DEBUG, INFO, WARNING, ERROR, CRITICAL
	Message string
	// Extra are the record's attributes (the LogRecord fields the
	// formatter kept, and the extra= ones), in order.
	Extra []Field
	// Data, when set, is what reformat_data_for_log made of an analytics
	// record's own data (a job event, facts, a request), used instead of
	// Extra.
	Data []Field
}

var levels = map[string]int{"DEBUG": 10, "INFO": 20, "WARNING": 30, "ERROR": 40, "CRITICAL": 50}

// Allowed is the ExternalLoggerEnabled and DynamicLevelFilter filters for
// a record of the service logger or of an analytics logger.
func (c Config) Allowed(rec Record) bool {
	if !c.Enabled || len(c.Loggers) == 0 {
		return false
	}
	cutoff, ok := levels[c.Level]
	if !ok {
		cutoff = levels["WARNING"]
	}
	if levels[rec.Level] < cutoff {
		return false
	}
	name := rec.Logger
	if strings.HasPrefix(name, AnalyticsPrefix+".") {
		headline := name[strings.LastIndexByte(name, '.')+1:]
		return contains(c.Loggers, headline)
	}
	base, _, _ := strings.Cut(name, ".")
	if base == ServicePrefix {
		return contains(c.Loggers, ServicePrefix) || contains(c.Loggers, LegacyServicePrefix)
	}
	return contains(c.Loggers, base)
}

func contains(list []string, s string) bool {
	for _, x := range list {
		if x == s {
			return true
		}
	}
	return false
}

// The logger names (main/constants.py).
const (
	AnalyticsPrefix     = "ascender.analytics"
	ServicePrefix       = "ascender"
	LegacyServicePrefix = "awx"
)

// TestLoggerName is connection_test_logger_name: the first selector
// decides; the service selector is the service logger, anything else an
// analytics logger.
func TestLoggerName(loggers []string) string {
	if len(loggers) == 0 || loggers[0] == ServicePrefix || loggers[0] == LegacyServicePrefix {
		return ServicePrefix
	}
	return AnalyticsPrefix + "." + loggers[0]
}

// orderedJSON writes keys in order with Python's json.dumps separators.
type orderedJSON []Field

func (o orderedJSON) MarshalJSON() ([]byte, error) {
	var b bytes.Buffer
	b.WriteByte('{')
	for i, f := range o {
		if i > 0 {
			b.WriteString(", ")
		}
		k, _ := json.Marshal(f.Key)
		b.Write(k)
		b.WriteString(": ")
		v, err := pyJSON(f.Value)
		if err != nil {
			return nil, err
		}
		b.Write(v)
	}
	b.WriteByte('}')
	return b.Bytes(), nil
}

// pyJSON is json.dumps's default separators for a value.
func pyJSON(v any) ([]byte, error) {
	switch x := v.(type) {
	case orderedJSON:
		return x.MarshalJSON()
	case []Field:
		return orderedJSON(x).MarshalJSON()
	case float64:
		s := strconv.FormatFloat(x, 'f', -1, 64)
		if !strings.ContainsAny(s, ".eE") {
			s += ".0"
		}
		return []byte(s), nil
	}
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(v); err != nil {
		return nil, err
	}
	out := bytes.TrimRight(buf.Bytes(), "\n")
	// Python's separators, outside strings.
	var res []byte
	inStr, esc := false, false
	for _, c := range out {
		res = append(res, c)
		switch {
		case inStr && esc:
			esc = false
		case inStr && c == '\\':
			esc = true
		case c == '"':
			inStr = !inStr
		case !inStr && (c == ',' || c == ':'):
			res = append(res, ' ')
		}
	}
	return pyASCII(res), nil
}

// pyASCII escapes non-ASCII as json.dumps's ensure_ascii does.
func pyASCII(b []byte) []byte {
	var out bytes.Buffer
	for _, r := range string(b) {
		if r < 0x80 {
			out.WriteRune(r)
			continue
		}
		if r > 0xFFFF {
			r -= 0x10000
			fmt.Fprintf(&out, "\\u%04x\\u%04x", 0xD800+(r>>10), 0xDC00+(r&0x3FF))
			continue
		}
		fmt.Fprintf(&out, "\\u%04x", r)
	}
	return out.Bytes()
}

// djangoTime is DjangoJSONEncoder's datetime: milliseconds and Z.
func djangoTime(t time.Time) string {
	t = t.UTC()
	s := t.Format("2006-01-02T15:04:05")
	if ms := t.Nanosecond() / 1000; ms > 0 {
		s += fmt.Sprintf(".%03d", ms/1000)
	}
	return s + "Z"
}

// Format is LogstashFormatter.format, newline included.
func (c Config) Format(rec Record) []byte {
	host, _ := os.Hostname()
	msg := []Field{
		{"@timestamp", djangoTime(rec.Time)},
		{"message", rec.Message},
		{"host", host},
		{"level", rec.Level},
		{"logger_name", rec.Logger},
	}
	extra := rec.Extra
	if rec.Data != nil {
		extra = rec.Data
	} else if strings.HasPrefix(rec.Logger, AnalyticsPrefix+".") {
		extra = reformat(extra, rec.Logger[len(AnalyticsPrefix)+1:])
	}
	extra = append(append([]Field(nil), extra...), Field{"cluster_host_id", c.ClusterHostID}, Field{"tower_uuid", c.InstallUUID}, Field{"tower_url", c.URLBase})
	for _, f := range extra {
		set(&msg, f)
	}
	var out any = orderedJSON(msg)
	if c.Type == "splunk" {
		// splunk's event receiver wants the record under "event" and the
		// epoch time beside it.
		out = orderedJSON{{"time", float64(rec.Time.UnixNano()) / 1e9}, {"event", orderedJSON(msg)}}
	}
	b, _ := pyJSON(out)
	return append(b, '\n')
}

func set(fields *[]Field, f Field) {
	for i := range *fields {
		if (*fields)[i].Key == f.Key {
			(*fields)[i].Value = f.Value
			return
		}
	}
	*fields = append(*fields, f)
}

// reformat is reformat_data_for_log for records that carry no data of
// their own (the connection test): activity_stream records keep their
// fields with changes decoded, system_tracking ones become the facts
// summary, and the rest keep only the lifecycle keys.
func reformat(extra []Field, kind string) []Field {
	switch kind {
	case "activity_stream":
		out := append([]Field(nil), extra...)
		changes := any(orderedJSON{})
		for _, f := range out {
			if f.Key == "changes" {
				changes = f.Value
				if s, ok := f.Value.(string); ok {
					if v, err := decodeOrderedJSON(s); err == nil {
						changes = v
					}
				}
			}
		}
		set(&out, Field{"changes", changes})
		return out
	case "system_tracking":
		return []Field{{"ansible_facts", orderedJSON{}}, {"ansible_facts_modified", nil}, {"inventory_id", nil}, {"host_name", nil}, {"job_id", nil}}
	}
	var out []Field
	for _, f := range extra {
		if f.Key == "lifecycle_data" || f.Key == "organization_id" {
			out = append(out, f)
		}
	}
	return out
}

// delivers reports whether the old configuration had an action for these
// settings: enabled, with a protocol and a host, and a port for the socket
// protocols. Without one it sent everything to /dev/null.
func (c Config) delivers() bool {
	if !c.Enabled || c.Protocol == "" || c.Host == "" {
		return false
	}
	return strings.HasPrefix(c.Protocol, "http") || c.Port != 0
}

// HTTPTarget is what the old config gave omhttp: the URL a scheme-less
// host means (https), and the port from the URL or the setting.
func (c Config) HTTPTarget() (*url.URL, error) {
	host := c.Host
	if u, err := url.Parse(host); err != nil || (u.Scheme == "" && !strings.HasPrefix(host, "//")) || u.Hostname() == "" {
		host = "https://" + host
	}
	u, err := url.Parse(host)
	if err != nil {
		return nil, err
	}
	if u.Port() == "" {
		port := c.Port
		if port == 0 {
			port = 80
			if u.Scheme == "https" {
				port = 443
			}
		}
		u.Host = net.JoinHostPort(u.Hostname(), strconv.FormatInt(port, 10))
	}
	if u.Scheme != "https" {
		u.Scheme = "http"
	}
	return u, nil
}

// decodeOrderedJSON is json.loads: objects keep their key order.
func decodeOrderedJSON(s string) (any, error) { return decodeOrdered(s, false) }

// OrderedObject decodes a JSON object (a job event's stored event_data)
// with its keys in their order and its numbers as written, which is how
// json.dumps wrote them back.
func OrderedObject(s string) (Ordered, bool) {
	v, err := decodeOrdered(s, true)
	if err != nil {
		return nil, false
	}
	o, ok := v.(orderedJSON)
	return o, ok
}

func decodeOrdered(s string, keepNumbers bool) (any, error) {
	dec := json.NewDecoder(strings.NewReader(s))
	dec.UseNumber()
	v, err := decodeValue(dec, keepNumbers)
	if err != nil {
		return nil, err
	}
	if _, err := dec.Token(); err != io.EOF {
		return nil, fmt.Errorf("trailing data")
	}
	return v, nil
}

func decodeValue(dec *json.Decoder, keepNumbers bool) (any, error) {
	tok, err := dec.Token()
	if err != nil {
		return nil, err
	}
	switch t := tok.(type) {
	case json.Delim:
		switch t {
		case '{':
			obj := []Field{}
			for dec.More() {
				kt, err := dec.Token()
				if err != nil {
					return nil, err
				}
				k, _ := kt.(string)
				v, err := decodeValue(dec, keepNumbers)
				if err != nil {
					return nil, err
				}
				// json.loads keeps a repeated key's first place and last
				// value.
				set(&obj, Field{k, v})
			}
			_, err := dec.Token()
			return orderedJSON(obj), err
		case '[':
			arr := []any{}
			for dec.More() {
				v, err := decodeValue(dec, keepNumbers)
				if err != nil {
					return nil, err
				}
				arr = append(arr, v)
			}
			_, err := dec.Token()
			return arr, err
		}
	case json.Number:
		if keepNumbers {
			return t, nil
		}
		if i, err := t.Int64(); err == nil {
			return i, nil
		}
		f, _ := t.Float64()
		return f, nil
	}
	return tok, nil
}
