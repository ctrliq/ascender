package api

import (
	"bytes"
	"encoding/json"
	"io"
	"strconv"
	"strings"
	"unicode"
)

func itoa(i int64) string { return strconv.FormatInt(i, 10) }

// URLFor builds the detail URL for a collection.
func URLFor(collection string, id int64) string {
	return "/api/v2/" + collection + "/" + strconv.FormatInt(id, 10) + "/"
}

// SubURL builds a sub-resource URL.
func SubURL(collection string, id int64, sub string) string {
	return "/api/v2/" + collection + "/" + strconv.FormatInt(id, 10) + "/" + sub + "/"
}

// IsSafeMethod reports whether a method needs no CSRF check.
func IsSafeMethod(m string) bool { return safeMethod(m) }

// ioNopCloser wraps bytes as a request body.
func ioNopCloser(b []byte) io.ReadCloser { return io.NopCloser(bytes.NewReader(b)) }

// Title upper-cases the first letter of each word, leaving the rest as is.
// It is strings.Title (deprecated for its Unicode word boundaries, which
// don't matter for the identifiers and verbose names passed here), kept
// rule for rule so labels don't change.
func Title(s string) string {
	prev := ' '
	return strings.Map(func(r rune) rune {
		if titleSeparator(prev) {
			prev = r
			return unicode.ToTitle(r)
		}
		prev = r
		return r
	}, s)
}

// titleSeparator is strings.Title's word boundary test.
func titleSeparator(r rune) bool {
	if r <= 0x7F {
		switch {
		case '0' <= r && r <= '9', 'a' <= r && r <= 'z', 'A' <= r && r <= 'Z', r == '_':
			return false
		}
		return true
	}
	if unicode.IsLetter(r) || unicode.IsDigit(r) {
		return false
	}
	return unicode.IsSpace(r)
}

// pyTypeName is type(v).__name__ of what Python decoded where Go decoded
// v: a JSON number is a float when it has a fraction or exponent, as
// json.loads read it, and a float64 (YAML's) a float.
func pyTypeName(v any) string {
	switch t := v.(type) {
	case nil:
		return "NoneType"
	case string:
		return "str"
	case bool:
		return "bool"
	case json.Number:
		if strings.ContainsAny(t.String(), ".eE") {
			return "float"
		}
		return "int"
	case float64:
		return "float"
	case int, int64:
		return "int"
	case []any:
		return "list"
	case *OMap, map[string]any, map[any]any:
		return "dict"
	}
	return "object"
}

// pyTruthy is Python truthiness of a decoded JSON value.
func pyTruthy(v any) bool {
	switch t := v.(type) {
	case nil:
		return false
	case bool:
		return t
	case string:
		return t != ""
	case float64:
		return t != 0
	case json.Number:
		// 0, -0 and 0.0 are all falsy.
		f, err := t.Float64()
		return err != nil || f != 0
	case []any:
		return len(t) > 0
	case map[string]any:
		return len(t) > 0
	case *OMap:
		return t.Len() > 0
	}
	return true
}
