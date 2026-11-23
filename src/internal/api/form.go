package api

import (
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"strings"
)

// Form validates a request body against a serializer's fields and collects
// errors in the shape DRF reported them. PATCH treats absent keys as
// "leave unchanged"; POST and PUT treat them as defaults.
type Form struct {
	Body    *OMap
	Partial bool
	Errs    FieldErrors
}

// NewForm wraps a body.
func NewForm(body *OMap, partial bool) *Form {
	return &Form{Body: body, Partial: partial, Errs: FieldErrors{}}
}

// Has reports whether the client sent the key.
func (f *Form) Has(key string) bool { return f.Body.Has(key) }

// Err returns the collected errors as a 400, or nil.
func (f *Form) Err() error { return f.Errs.Err() }

// String reads a string field. required applies to POST/PUT only.
func (f *Form) String(key string, required bool, maxLen int, current string) string {
	v, ok := f.Body.Get(key)
	if !ok {
		if required && !f.Partial {
			f.Errs.Add(key, "This field is required.")
		}
		return current
	}
	var s string
	switch t := v.(type) {
	case nil:
		if required {
			f.Errs.Add(key, "This field may not be null.")
			return current
		}
		s = ""
	case string:
		s = t
	case json.Number:
		s = t.String()
	case bool:
		s = strconv.FormatBool(t)
	default:
		f.Errs.Add(key, "Not a valid string.")
		return current
	}
	if required && strings.TrimSpace(s) == "" {
		f.Errs.Add(key, "This field may not be blank.")
		return current
	}
	if maxLen > 0 && len([]rune(s)) > maxLen {
		f.Errs.Add(key, fmt.Sprintf("Ensure this field has no more than %d characters.", maxLen))
		return current
	}
	return s
}

// Bool reads a boolean field.
func (f *Form) Bool(key string, current bool) bool {
	v, ok := f.Body.Get(key)
	if !ok {
		return current
	}
	if v == nil {
		f.Errs.Add(key, "This field may not be null.")
		return current
	}
	if b, ok := drfBool(v); ok {
		return b
	}
	f.Errs.Add(key, "Must be a valid boolean.")
	return current
}

// drfBool is BooleanField.to_internal_value: the TRUE_VALUES and
// FALSE_VALUES sets, strings compared lowercased. An empty string is not
// a boolean (the old Run Command wizard's untouched become_enabled was
// refused for that).
func drfBool(v any) (bool, bool) {
	switch t := v.(type) {
	case bool:
		return t, true
	case string:
		switch strings.ToLower(t) {
		case "t", "y", "yes", "true", "on", "1":
			return true, true
		case "f", "n", "no", "false", "off", "0":
			return false, true
		}
	case json.Number:
		if n, err := t.Float64(); err == nil {
			if n == 1 {
				return true, true
			}
			if n == 0 {
				return false, true
			}
		}
	}
	return false, false
}

// drfInt is IntegerField.to_internal_value without the bounds: a whole
// JSON number or a string of digits.
func drfInt(v any) (int64, bool) {
	switch t := v.(type) {
	case json.Number:
		if i, err := t.Int64(); err == nil {
			return i, true
		}
		fl, err := t.Float64()
		if err != nil || fl != math.Trunc(fl) {
			return 0, false
		}
		return int64(fl), true
	case float64:
		return int64(t), true
	case string:
		i, err := strconv.ParseInt(strings.TrimSpace(t), 10, 64)
		return i, err == nil
	}
	return 0, false
}

// Int reads an integer field with optional bounds.
func (f *Form) Int(key string, current int64, min, max *int64) int64 {
	v, ok := f.Body.Get(key)
	if !ok {
		return current
	}
	if v == nil {
		f.Errs.Add(key, "This field may not be null.")
		return current
	}
	n, ok := drfInt(v)
	if !ok {
		f.Errs.Add(key, "A valid integer is required.")
		return current
	}
	if min != nil && n < *min {
		f.Errs.Add(key, fmt.Sprintf("Ensure this value is greater than or equal to %d.", *min))
		return current
	}
	if max != nil && n > *max {
		f.Errs.Add(key, fmt.Sprintf("Ensure this value is less than or equal to %d.", *max))
		return current
	}
	return n
}

// ID reads a nullable foreign key. exists checks the id; when it reports
// false the DRF "Invalid pk" error is recorded.
func (f *Form) ID(key string, current *int64, required bool, exists func(int64) bool) (*int64, bool) {
	v, ok := f.Body.Get(key)
	if !ok {
		if required && !f.Partial {
			f.Errs.Add(key, "This field is required.")
		}
		return current, false
	}
	var n int64
	switch t := v.(type) {
	case nil:
		if required {
			f.Errs.Add(key, "This field may not be null.")
			return current, false
		}
		return nil, true
	case json.Number:
		i, err := t.Int64()
		if err != nil {
			f.Errs.Add(key, fmt.Sprintf("Incorrect type. Expected pk value, received %s.", "str"))
			return current, false
		}
		n = i
	case string:
		if strings.TrimSpace(t) == "" {
			if required {
				f.Errs.Add(key, "This field may not be null.")
				return current, false
			}
			return nil, true
		}
		i, err := strconv.ParseInt(strings.TrimSpace(t), 10, 64)
		if err != nil {
			f.Errs.Add(key, "Incorrect type. Expected pk value, received str.")
			return current, false
		}
		n = i
	case *OMap:
		f.Errs.Add(key, fmt.Sprintf("Cannot use dictionary for %s", key))
		return current, false
	default:
		f.Errs.Add(key, "Incorrect type. Expected pk value.")
		return current, false
	}
	if exists != nil && !exists(n) {
		f.Errs.Add(key, fmt.Sprintf("Invalid pk \"%d\" - object does not exist.", n))
		return current, false
	}
	return &n, true
}

// Choice reads a string that must be one of the allowed values.
func (f *Form) Choice(key string, current string, choices [][2]string, required bool) string {
	v, ok := f.Body.Get(key)
	if !ok {
		if required && !f.Partial {
			f.Errs.Add(key, "This field is required.")
		}
		return current
	}
	s, isStr := v.(string)
	if v == nil {
		s, isStr = "", true
	}
	if !isStr {
		// The input as Python's str() wrote it.
		in := fmt.Sprint(v)
		if b, ok := v.(bool); ok {
			in = pyRepr(b)
		}
		f.Errs.Add(key, fmt.Sprintf("\"%s\" is not a valid choice.", in))
		return current
	}
	for _, c := range choices {
		if c[0] == s {
			return s
		}
	}
	f.Errs.Add(key, fmt.Sprintf("\"%s\" is not a valid choice.", s))
	return current
}

// Raw returns the raw value and presence.
func (f *Form) Raw(key string) (any, bool) { return f.Body.Get(key) }

// copyName validates a copy request's body as CopySerializer did: name is a
// plain CharField (required, not null or blank, trimmed, any length; a
// number is taken as Python's str of it, a boolean, list or object is
// not a string), and validate() refused the original's own name.
func copyName(body *OMap, original string) (string, error) {
	v, ok := body.Get("name")
	if !ok {
		return "", FieldErrors{"name": {"This field is required."}}.Err()
	}
	if v == nil {
		return "", FieldErrors{"name": {"This field may not be null."}}.Err()
	}
	name, ferr := charValue(v)
	if ferr != nil {
		return "", FieldErrors{"name": {"Not a valid string."}}.Err()
	}
	if name == "" {
		return "", FieldErrors{"name": {"This field may not be blank."}}.Err()
	}
	if name == original {
		return "", FieldErrors{"__all__": {"The original object is already named " + name + ", a copy from it cannot have the same name."}}.Err()
	}
	return name, nil
}
