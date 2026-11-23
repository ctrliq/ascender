package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"

	"github.com/ctrliq/ascender/internal/auth"
	"github.com/ctrliq/ascender/internal/pyyaml"
)

// ParseVars reads a variables string the way parse_yaml_or_json did: JSON
// first, then YAML as PyYAML's safe_load read it (YAML 1.1: a plain yes or
// off is a boolean, one document only, any scalar key); an empty string is
// an empty object. The result is a map or nil for scalars.
func ParseVars(s string) (map[string]any, error) {
	s = strings.TrimSpace(s)
	if s == "" || s == "---" {
		return map[string]any{}, nil
	}
	if strings.HasPrefix(s, "{") {
		// Numbers stay json.Number, as request bodies decode them: a float64
		// would change integers beyond 2**53 and turn 1.0 into 1, where
		// Python's json keeps both as written.
		var m map[string]any
		dec := json.NewDecoder(strings.NewReader(s))
		dec.UseNumber()
		if err := dec.Decode(&m); err == nil {
			if _, err := dec.Token(); err == io.EOF {
				return m, nil
			}
		}
	}
	v, err := pyyaml.Load(s)
	if err != nil {
		return nil, err
	}
	switch t := v.(type) {
	case nil:
		return map[string]any{}, nil
	case *pyyaml.Map:
		return pyyaml.Plain(t).(map[string]any), nil
	default:
		return nil, fmt.Errorf("Input type `%s` is not a dictionary", pyTypeName(v))
	}
}

// encryptedValueMsg refuses a stored encrypted value sent by a client.
const encryptedValueMsg = "Encrypted values cannot be submitted; enter the value itself."

// refusesCiphertext reports whether variables a request sent hold a stored
// encrypted value ($encrypted$UTF8$AESCBC$...) that u may not submit. No
// read shows one, so it was copied from somewhere (another template's
// survey password, an activity entry), and a job would decrypt it as a
// survey answer. ReadBody refuses one anywhere in the body; variables sent
// as JSON or YAML text are only seen once parsed (an escaped \u0024 hides
// the marker from it), so every place that parses them checks again.
// Superusers may send one, as ReadBody lets them.
func refusesCiphertext(u *auth.User, vars any) bool {
	return (u == nil || !u.IsSuperuser) && hasCiphertext(vars)
}

// ValidateVars reproduces vars_validate_or_raise: the value must parse as
// JSON or YAML into a dictionary.
func ValidateVars(s string) error {
	s2 := strings.TrimSpace(s)
	if s2 == "" {
		return nil
	}
	var jsonErr error
	if strings.HasPrefix(s2, "{") {
		var m any
		jsonErr = json.Unmarshal([]byte(s2), &m)
		if jsonErr == nil {
			if _, ok := m.(map[string]any); !ok {
				return fmt.Errorf("Input type `%s` is not a dictionary", pyTypeName(m))
			}
			return nil
		}
	}
	v, yamlErr := pyyaml.Load(s2)
	if yamlErr == nil {
		switch v.(type) {
		case nil, *pyyaml.Map:
			return nil
		default:
			return fmt.Errorf("Input type `%s` is not a dictionary", pyTypeName(v))
		}
	}
	// It loaded, but json.dumps refused it (a date, binary data, a set).
	var compat *pyyaml.CompatError
	if errors.As(yamlErr, &compat) {
		return fmt.Errorf("Variables not compatible with JSON standard (error: %s)", compat.Msg)
	}
	if jsonErr != nil {
		return fmt.Errorf("Cannot parse as JSON (error: %s) or YAML (error: %s).", jsonErr.Error(), yamlErr.Error())
	}
	return fmt.Errorf("Cannot parse as YAML (error: %s).", yamlErr.Error())
}

// VarsToJSON renders a variables string as a JSON object for the
// variable_data endpoints.
func VarsToJSON(s string) (map[string]any, error) {
	return ParseVars(s)
}
