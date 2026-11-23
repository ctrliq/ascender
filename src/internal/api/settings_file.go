package api

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/ctrliq/ascender/internal/settings"
)

// CheckFileSettings runs the registered settings the deployment's file
// gives (ASCENDER_SETTINGS_FILE) through the validation a PUT of them would
// get, together, as one request, since some are validated against each
// other. A value that passes is kept in the form the validation returns; one
// that does not is dropped, so that the setting stays what the database
// says, and is returned for the process to report. The old application
// took whatever its settings files said, and found out when the value was
// used; a file written for it may hold Python the API never accepted.
func (s *Server) CheckFileSettings(ctx context.Context) []settings.FileProblem {
	loadSettingSpecs()
	body := NewOMap()
	var keys []string
	var problems []settings.FileProblem
	for _, key := range s.Settings.FileKeys() {
		if _, fileOnly := settings.FileOnlyKeys[key]; fileOnly {
			continue
		}
		if _, ok := s.Settings.Registry.Field(key); !ok {
			continue
		}
		raw, _ := s.Settings.Raw(ctx, key)
		v, err := decodeOrdered(string(raw))
		if err != nil {
			s.Settings.DropFile(key)
			problems = append(problems, settings.FileProblem{Key: key, Reason: err.Error()})
			continue
		}
		body.Set(key, v)
		keys = append(keys, key)
	}
	ctx = withSettingRequest(ctx, true, body)
	for _, key := range keys {
		sp := settingSpecs[key]
		if sp == nil {
			sp = &settingSpec{Class: "CharField", AllowBlank: true}
		}
		raw, _ := body.Get(key)
		v, skip, ferr := s.validateSetting(ctx, key, sp, raw)
		if ferr != nil {
			reason, _ := json.Marshal(ferr)
			s.Settings.DropFile(key)
			problems = append(problems, settings.FileProblem{Key: key, Reason: string(reason)})
			continue
		}
		if skip {
			continue
		}
		b, err := json.Marshal(v)
		if err == nil {
			err = s.Settings.SetFile(key, b)
		}
		if err != nil {
			s.Settings.DropFile(key)
			problems = append(problems, settings.FileProblem{Key: key, Reason: fmt.Sprint(err)})
		}
	}
	return problems
}
