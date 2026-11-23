package settings

import (
	"bytes"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"sort"
)

// Settings from a file are what /etc/tower/settings.py and conf.d/*.py were
// to the old application: values the deployment decides, which the database
// does not override and the API does not change. The file is one JSON
// object, the setting's name to its value (ASCENDER_SETTINGS_FILE):
//
//	{"IS_K8S": true, "AUTH_LDAP_BIND_PASSWORD": "...", "SESSION_COOKIE_AGE": 3600}
//
// As in the old application (conf/settings.py, _preload_cache), a writable
// registered setting given there becomes read-only and reports
// defined_in_file. A setting the registry does not know is kept too: some
// the old application read only from files (DISABLE_ALL_SCHEDULES).

// FileOnlyKeys are the settings read from the file that the registry does
// not hold or holds as read-only: the old application took them from its
// settings files alone.
var FileOnlyKeys = map[string]string{
	"IS_K8S":                                      "boolean",
	"DISABLE_ALL_SCHEDULES":                       "boolean",
	"ASCENDER_AUTO_DEPROVISION_INSTANCES":         "boolean",
	"VMWARE_VALIDATE_CERTS":                       "boolean",
	"DEFAULT_CONTROL_PLANE_QUEUE_NAME":            "string",
	"DEFAULT_EXECUTION_QUEUE_NAME":                "string",
	"DEFAULT_EXECUTION_QUEUE_POD_SPEC_OVERRIDE":   "string",
	"DEFAULT_EXECUTION_QUEUE_MAX_FORKS":           "integer",
	"DEFAULT_EXECUTION_QUEUE_MAX_CONCURRENT_JOBS": "integer",
	"RECEPTOR_LOG_LEVEL":                          "string",
	// The notification backends' per-connect and per-read timeout, in
	// seconds (default 30).
	"ASCENDER_NOTIFICATION_REQUEST_TIMEOUT": "integer",
	// What register_default_execution_environments registers.
	"GLOBAL_JOB_EXECUTION_ENVIRONMENTS":   "list",
	"CONTROL_PLANE_EXECUTION_ENVIRONMENT": "string",
}

// FileProblem is a setting of the file that was not taken.
type FileProblem struct {
	Key    string
	Reason string
}

func (p FileProblem) String() string { return p.Key + ": " + p.Reason }

// LoadFile reads the deployment's settings file. A file that cannot be read
// or is not a JSON object is an error; a setting in it that cannot apply (an
// unknown name, a value of the wrong type) is skipped and returned, so that
// one mistake does not keep the process from starting with the rest.
func (s *Store) LoadFile(path string) ([]FileProblem, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("settings file: %w", err)
	}
	return s.loadFile(path, b)
}

func (s *Store) loadFile(path string, b []byte) ([]FileProblem, error) {
	var raws map[string]json.RawMessage
	dec := json.NewDecoder(bytes.NewReader(b))
	if err := dec.Decode(&raws); err != nil {
		return nil, fmt.Errorf("settings file %s: not a JSON object of settings: %w", path, err)
	}
	if dec.More() {
		return nil, fmt.Errorf("settings file %s: more than one JSON document", path)
	}
	keys := make([]string, 0, len(raws))
	for k := range raws {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	values := map[string]any{}
	kept := map[string][]byte{}
	var problems []FileProblem
	for _, key := range keys {
		var v any
		if err := json.Unmarshal(raws[key], &v); err != nil {
			problems = append(problems, FileProblem{key, err.Error()})
			continue
		}
		f, registered := s.Registry.Field(key)
		typ, fileOnly := FileOnlyKeys[key]
		switch {
		case fileOnly:
		case registered && f.ReadOnly:
			problems = append(problems, FileProblem{key, "is worked out by the application and cannot be set"})
			continue
		case registered:
			typ = f.Type
		default:
			problems = append(problems, FileProblem{key, "is not a setting this application reads"})
			continue
		}
		if reason := fileTypeMismatch(typ, v); reason != "" {
			problems = append(problems, FileProblem{key, reason})
			continue
		}
		values[key] = v
		kept[key] = append([]byte(nil), raws[key]...)
	}
	// The registry is marked as the old one was: the API then leaves these
	// settings out of what it writes, and reports where they come from.
	for key := range values {
		if f, ok := s.Registry.Field(key); ok && !f.ReadOnly {
			f.ReadOnly, f.DefinedInFile = true, true
		}
	}
	s.mu.Lock()
	s.file, s.fileRaws = values, kept
	s.mu.Unlock()
	return problems, nil
}

// fileTypeMismatch says why a value does not fit a setting of the type, or
// "". A null fits any: several settings are null when unset.
func fileTypeMismatch(typ string, v any) string {
	if v == nil {
		return ""
	}
	ok := true
	switch typ {
	case "boolean":
		_, ok = v.(bool)
	case "integer":
		n, isNum := v.(float64)
		ok = isNum && n == math.Trunc(n)
	case "string", "choice", "datetime":
		_, ok = v.(string)
	case "list":
		_, ok = v.([]any)
	case "nested object":
		_, ok = v.(map[string]any)
	}
	if ok {
		return ""
	}
	return fmt.Sprintf("expected %s, got %s", typ, jsonTypeName(v))
}

func jsonTypeName(v any) string {
	switch v.(type) {
	case bool:
		return "boolean"
	case float64:
		return "number"
	case string:
		return "string"
	case []any:
		return "list"
	case map[string]any:
		return "object"
	}
	return fmt.Sprintf("%T", v)
}

// DefinedInFile reports whether the deployment's settings file gives key.
func (s *Store) DefinedInFile(key string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	_, ok := s.file[key]
	return ok
}

// FileKeys are the settings the deployment's file gives, sorted.
func (s *Store) FileKeys() []string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	keys := make([]string, 0, len(s.file))
	for k := range s.file {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

// SetFile replaces the value the file gives a setting with its validated
// form (the API's validation normalizes what it takes).
func (s *Store) SetFile(key string, raw []byte) error {
	var v any
	if err := json.Unmarshal(raw, &v); err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.file[key]; ok {
		s.file[key], s.fileRaws[key] = v, append([]byte(nil), raw...)
	}
	return nil
}

// DropFile forgets a setting of the file whose value did not pass the
// setting's validation: it is the database's and the API's again.
func (s *Store) DropFile(key string) {
	s.mu.Lock()
	_, had := s.file[key]
	delete(s.file, key)
	delete(s.fileRaws, key)
	s.mu.Unlock()
	if f, ok := s.Registry.Field(key); ok && had && f.DefinedInFile {
		f.ReadOnly, f.DefinedInFile = false, false
	}
}
