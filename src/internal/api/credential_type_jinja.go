package api

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/ctrliq/ascender/internal/jinjarun"
	"github.com/ctrliq/ascender/internal/models"
)

// orderedEntries lists a decoded JSON object's entries in their order.
func orderedEntries(v any) ([]string, map[string]any, bool) {
	switch o := v.(type) {
	case *OMap:
		vals := map[string]any{}
		for _, k := range o.Keys() {
			vals[k], _ = o.Get(k)
		}
		return o.Keys(), vals, true
	case map[string]any:
		keys := make([]string, 0, len(o))
		for k := range o {
			keys = append(keys, k)
		}
		return keys, o, true
	}
	return nil, nil, false
}

// injectorTemplates lists the (type, key, template) triples validate
// renders, in its order: extra_vars keys are templates too.
func injectorTemplates(injectors any) [][3]any {
	var out [][3]any
	types, vals, ok := orderedEntries(injectors)
	if !ok {
		return nil
	}
	var walk func(key *string, node any)
	walk = func(key *string, node any) {
		if keys, m, ok := orderedEntries(node); ok {
			for _, k := range keys {
				sub := "a key"
				if key != nil {
					sub = *key
				}
				out = append(out, [3]any{"extra_vars", sub, k})
				path := k
				if key != nil {
					path = *key + "." + k
				}
				walk(&path, m[k])
			}
			return
		}
		if list, ok := node.([]any); ok {
			for i, x := range list {
				path := fmt.Sprintf("%s[%d]", derefOr(key, "None"), i)
				walk(&path, x)
			}
			return
		}
		out = append(out, [3]any{"extra_vars", derefOr(key, "None"), node})
	}
	for _, typ := range types {
		if typ == "extra_vars" {
			walk(nil, vals[typ])
			continue
		}
		keys, m, ok := orderedEntries(vals[typ])
		if !ok {
			continue
		}
		for _, k := range keys {
			out = append(out, [3]any{typ, k, m[k]})
		}
	}
	return out
}

func derefOr(s *string, def string) string {
	if s == nil {
		return def
	}
	return *s
}

// checkInjectorTemplates renders a credential type's injector templates as
// full_clean did on every save: against the inputs being saved, with the
// injectors sent or those already stored. Nothing is checked when the
// inputs or injectors already failed validation.
func (s *Server) checkInjectorTemplates(ctx context.Context, f *Form, t *models.CredentialType) error {
	if f.Errs.Has("inputs") || f.Errs.Has("injectors") {
		return nil
	}
	injectors, has := f.Raw("injectors")
	if !has || injectors == nil {
		injectors = orderedJSON(t.Injectors)
	}
	templates := injectorTemplates(injectors)
	if len(templates) == 0 {
		return nil
	}
	fileNames := []string{}
	if _, vals, ok := orderedEntries(injectors); ok {
		if keys, _, ok := orderedEntries(vals["file"]); ok {
			for _, k := range keys {
				if strings.HasPrefix(k, "template") {
					fileNames = append(fileNames, k)
				}
			}
		}
	}
	fields := []string{}
	for _, fd := range t.ParsedInputs().Fields {
		fields = append(fields, fd.ID)
	}
	in := map[string]any{"fields": fields, "reserved": []string{"ascender", "tower"}, "file_names": fileNames, "templates": templates}
	cctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	// The template half of CredentialTypeInjectorField.validate (see
	// jinjarun.Injector).
	var res struct {
		Error *string `json:"error"`
	}
	if err := jinjarun.Run(cctx, "injector", in, &res); err != nil {
		return fmt.Errorf("validating injector templates: %w", err)
	}
	if res.Error != nil {
		f.Errs.Add("injectors", *res.Error)
	}
	return nil
}
