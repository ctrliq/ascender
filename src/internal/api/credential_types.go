package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/activity"
	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/models"
)

var credentialTypeFields *FieldSet

func credentialTypeFieldSet(a string) *FieldSet {
	return &FieldSet{
		Model: "CredentialType",
		Fields: map[string]Field{
			"id": {SQL: a + ".id", Kind: KindInt}, "name": {SQL: a + ".name"}, "description": {SQL: a + ".description"},
			"created": {SQL: a + ".created", Kind: KindDateTime}, "modified": {SQL: a + ".modified", Kind: KindDateTime},
			"kind": {SQL: a + ".kind"}, "namespace": {SQL: a + ".namespace"}, "managed": {SQL: a + ".managed", Kind: KindBool},
			"inputs": {SQL: a + ".inputs", Kind: KindJSON}, "injectors": {SQL: a + ".injectors", Kind: KindJSON},
			"created_by":  {SQL: a + ".created_by_id", Kind: KindFK, Rel: &Relation{Alias: a + "cb", Join: "LEFT JOIN auth_user " + a + "cb ON " + a + "cb.id = " + a + ".created_by_id", Target: func() *FieldSet { return userFieldsAlias(a + "cb") }}},
			"modified_by": {SQL: a + ".modified_by_id", Kind: KindFK, Rel: &Relation{Alias: a + "mb", Join: "LEFT JOIN auth_user " + a + "mb ON " + a + "mb.id = " + a + ".modified_by_id", Target: func() *FieldSet { return userFieldsAlias(a + "mb") }}},
			"credentials": {SQL: a + "cr.id", Kind: KindFK, Rel: &Relation{Alias: a + "cr", Join: "LEFT JOIN main_credential " + a + "cr ON " + a + "cr.credential_type_id = " + a + ".id", Many: true, Target: func() *FieldSet { return credentialFieldSet(a + "cr") }}},
		},
		SearchFields: []string{"name", "description"},
	}
}

func init() {
	credentialTypeFields = credentialTypeFieldSet("ct")
	resourceRegistrars = append(resourceRegistrars, func(s *Server, mux *http.ServeMux) {
		s.route(mux, "/api/v2/credential_types/{$}", methodMap{"GET": s.credentialTypeList, "POST": s.credentialTypeCreate}, s.optionsFor("credential_types"))
		s.route(mux, "/api/v2/credential_types/{id}/{$}", methodMap{"GET": s.credentialTypeDetail, "PUT": s.credentialTypeUpdate, "PATCH": s.credentialTypeUpdate, "DELETE": s.credentialTypeDelete}, s.optionsFor("credential_types"))
		s.route(mux, "/api/v2/credential_types/{id}/credentials/{$}", methodMap{"GET": s.credentialTypeCredentials, "POST": s.credentialSubCreate(credentialsOfCredentialType)}, s.optionsFor("credentials"))
		s.route(mux, "/api/v2/credential_types/{id}/test/{$}", methodMap{"GET": s.credentialTypeExternalTest, "POST": s.credentialTypeExternalTest}, s.optionsFor("credential_types"))
	})
}

var credentialTypeKinds = [][2]string{{"ssh", "Machine"}, {"vault", "Vault"}, {"net", "Network"}, {"scm", "Source Control"}, {"cloud", "Cloud"}, {"registry", "Container Registry"}, {"token", "Personal Access Token"}, {"external", "External"}, {"kubernetes", "Kubernetes"}, {"galaxy", "Galaxy/Automation Hub"}, {"cryptography", "Cryptography"}}

func scanCredentialTypeRow(rows pgx.Rows) (any, error) { return models.ScanCredentialType(rows) }

func (s *Server) credentialTypeSpec() ListSpec {
	return ListSpec{Model: "CredentialType", From: "main_credentialtype ct", Columns: models.CredentialTypeColumns, PK: "ct.id", Fields: credentialTypeFields, DefaultOrder: []string{"kind", "name"}}
}

func (s *Server) credentialTypeList(w http.ResponseWriter, r *http.Request) error {
	rows, count, page, err := s.RunList(r, s.credentialTypeSpec(), nil, scanCredentialTypeRow)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, false)
	results := make([]any, 0, len(rows))
	for _, row := range rows {
		results = append(results, s.serializeCredentialType(c, row.(*models.CredentialType)))
	}
	WriteJSON(w, 200, Paginate(r, page, count, results))
	return nil
}

func (s *Server) loadCredentialType(r *http.Request) (*models.CredentialType, error) {
	id, err := PathID(r)
	if err != nil {
		return nil, NotFoundFor("CredentialType")
	}
	t, err := models.GetCredentialType(r.Context(), s.Q(), id)
	if err != nil {
		if db.IsNoRows(err) {
			return nil, NotFoundFor("CredentialType")
		}
		return nil, err
	}
	return t, nil
}

func (s *Server) credentialTypeDetail(w http.ResponseWriter, r *http.Request) error {
	if _, err := RequireUser(r); err != nil {
		return err
	}
	t, err := s.loadCredentialType(r)
	if err != nil {
		return err
	}
	WriteJSON(w, 200, s.serializeCredentialType(s.NewSerCtx(r, true), t))
	return nil
}

func (s *Server) serializeCredentialType(c *SerCtx, t *models.CredentialType) *OMap {
	related := NewOMap()
	if c.Detail {
		related.Set("named_url", "/api/v2/credential_types/"+namedURLEscape(t.Name)+"+"+namedURLEscape(t.Kind)+"/")
	}
	setURL(related, "created_by", "users", t.CreatedByID)
	setURL(related, "modified_by", "users", t.ModifiedByID)
	related.Set("credentials", URLFor("credential_types", t.ID)+"credentials/").Set("activity_stream", URLFor("credential_types", t.ID)+"activity_stream/")
	summary := NewOMap()
	c.putSummary(summary, "created_by", c.UserSummary, t.CreatedByID)
	c.putSummary(summary, "modified_by", c.UserSummary, t.ModifiedByID)
	if c.WantSummary("user_capabilities") && !c.NoCaps {
		summary.Set("user_capabilities", NewOMap().Set("edit", c.User.IsSuperuser).Set("delete", c.User.IsSuperuser))
	}
	name, inputs := t.Name, visibleInputs(t.EffectiveInputs())
	if t.Managed {
		// The managed types' name, fields and metadata, in the request's
		// language (CredentialTypeSerializer.to_representation and the
		// definitions' gettext_lazy texts).
		l := c.Loc()
		name = l.Gettext(name)
		translateCredentialInputs(l, inputs)
	}
	o := Base(NewOMap(), t.ID, "credential_type", URLFor("credential_types", t.ID), related, summary, t.Created, t.Modified, name, t.Description)
	o.Set("kind", t.Kind).Set("namespace", t.Namespace).Set("managed", t.Managed)
	o.Set("inputs", inputs).Set("injectors", orderedJSON(t.EffectiveInjectors()))
	return o
}

// visibleInputs drops the internal fields the platform fills in itself,
// keeping the key order of the definition.
func visibleInputs(raw json.RawMessage) any {
	v := orderedJSON(raw)
	in, ok := v.(*OMap)
	if !ok {
		return json.RawMessage(raw)
	}
	fieldsRaw, _ := in.Get("fields")
	fields, ok := fieldsRaw.([]any)
	if !ok {
		return in
	}
	kept := make([]any, 0, len(fields))
	for _, f := range fields {
		if m, ok := f.(*OMap); ok {
			if internal, has := m.Get("internal"); has && pyTruthy(internal) {
				continue
			}
		}
		kept = append(kept, f)
	}
	in.Set("fields", kept)
	return in
}

var credentialTypeDeleteProtected = "Deletion not allowed for managed credential types"

var fieldIDRe = regexp.MustCompile(`^[a-zA-Z_]+[a-zA-Z0-9_]*$`)
var envVarRe = regexp.MustCompile(`^[a-zA-Z_]+[a-zA-Z0-9_]*$`)
var fileTemplateRe = regexp.MustCompile(`^template(\.[a-zA-Z_]+[a-zA-Z0-9_]*)?$`)
var extraVarRe = regexp.MustCompile(`^[a-zA-Z_{}]+[a-zA-Z0-9_{}]*$`)
var asciiRe = regexp.MustCompile(`^[\x00-\x7f]*$`)

var reservedNamespaceNames = map[string]bool{"ascender": true, "tower": true}

var envBlocklist = map[string]bool{
	"VIRTUAL_ENV": true, "PATH": true, "PYTHONPATH": true, "JOB_ID": true, "INVENTORY_ID": true, "INVENTORY_SOURCE_ID": true, "INVENTORY_UPDATE_ID": true,
	"AD_HOC_COMMAND_ID": true, "REST_API_URL": true, "REST_API_TOKEN": true, "MAX_EVENT_RES": true, "CALLBACK_QUEUE": true, "CALLBACK_CONNECTION": true,
	"CACHE": true, "JOB_CALLBACK_DEBUG": true, "INVENTORY_HOSTVARS": true, "AWX_HOST": true, "PROJECT_REVISION": true, "SUPERVISOR_CONFIG_PATH": true,
}

// EnvBlocked reports a variable credentials may not set (ENV_BLOCKLIST).
func EnvBlocked(name string) bool { return envBlocklist[name] }

// validateCredentialTypeInputs ports CredentialTypeInputField.validate.
func validateCredentialTypeInputs(raw any) ([]string, json.RawMessage) {
	raw = plainValue(raw)
	in, ok := raw.(map[string]any)
	if !ok {
		return []string{fmt.Sprintf("%s provided, expected dict", pyTypeName(raw))}, nil
	}
	if _, has := in["dependencies"]; has {
		return []string{"'dependencies' is not supported for custom credentials."}, nil
	}
	for k := range in {
		if k != "fields" && k != "required" {
			return []string{fmt.Sprintf("Additional properties are not allowed ('%s' was unexpected)", k)}, nil
		}
	}
	if req, has := in["required"]; has {
		list, ok := req.([]any)
		if !ok {
			return []string{fmt.Sprintf("%s provided in relative path ['required'], expected list", pyTypeName(req))}, nil
		}
		for i, x := range list {
			if !isJSONString(x) {
				return []string{fmt.Sprintf("%s provided in relative path ['required', %d], expected string", pyTypeName(x), i)}, nil
			}
		}
	}
	allowed := map[string]bool{"type": true, "format": true, "choices": true, "id": true, "label": true, "help_text": true, "multiline": true, "secret": true, "ask_at_runtime": true, "default": true}
	ids := map[string]bool{}
	if fieldsRaw, has := in["fields"]; has {
		fields, ok := fieldsRaw.([]any)
		if !ok {
			return []string{fmt.Sprintf("%s provided in relative path ['fields'], expected list", pyTypeName(fieldsRaw))}, nil
		}
		for i, fr := range fields {
			f, ok := fr.(map[string]any)
			if !ok {
				return []string{fmt.Sprintf("%s provided in relative path ['fields', %d], expected dict", pyTypeName(fr), i)}, nil
			}
			for k := range f {
				if !allowed[k] {
					return []string{fmt.Sprintf("Schema validation error in relative path ['fields', %d] (Additional properties are not allowed ('%s' was unexpected))", i, k)}, nil
				}
			}
			for _, req := range []string{"id", "label"} {
				if _, has := f[req]; !has {
					return []string{fmt.Sprintf("'%s' is a required property", req)}, nil
				}
			}
			id, _ := f["id"].(string)
			if !isJSONString(f["id"]) {
				return []string{fmt.Sprintf("%s provided in relative path ['fields', %d, 'id'], expected string", pyTypeName(f["id"]), i)}, nil
			}
			if !fieldIDRe.MatchString(id) {
				return []string{fmt.Sprintf("%s is an invalid variable name", id)}, nil
			}
			if !isJSONString(f["label"]) {
				return []string{fmt.Sprintf("%s provided in relative path ['fields', %d, 'label'], expected string", pyTypeName(f["label"]), i)}, nil
			}
			typ := "string"
			if t, has := f["type"]; has {
				ts, _ := t.(string)
				if ts != "string" && ts != "boolean" {
					return []string{fmt.Sprintf("%s is not one of ['string', 'boolean']", pyRepr(t))}, nil
				}
				typ = ts
			}
			if fm, has := f["format"]; has {
				fs, _ := fm.(string)
				if fs != "ssh_private_key" && fs != "url" {
					return []string{fmt.Sprintf("%s is not one of ['ssh_private_key', 'url']", pyRepr(fm))}, nil
				}
			}
			if ch, has := f["choices"]; has {
				list, ok := ch.([]any)
				if !ok {
					return []string{fmt.Sprintf("%s provided in relative path ['fields', %d, 'choices'], expected list", pyTypeName(ch), i)}, nil
				}
				if len(list) == 0 {
					return []string{"[] is too short"}, nil
				}
				seen := map[string]bool{}
				for j, x := range list {
					xs, ok := x.(string)
					if !ok {
						return []string{fmt.Sprintf("%s provided in relative path ['fields', %d, 'choices', %d], expected string", pyTypeName(x), i, j)}, nil
					}
					if seen[xs] {
						return []string{fmt.Sprintf("%s has non-unique elements", pyRepr(list))}, nil
					}
					seen[xs] = true
				}
			}
			for _, key := range []string{"multiline", "secret", "ask_at_runtime"} {
				if v, has := f[key]; has {
					if _, ok := v.(bool); !ok {
						return []string{fmt.Sprintf("%s provided in relative path ['fields', %d, '%s'], expected boolean", pyTypeName(v), i, key)}, nil
					}
				}
			}
			if hs, has := f["help_text"]; has && !isJSONString(hs) {
				return []string{fmt.Sprintf("%s provided in relative path ['fields', %d, 'help_text'], expected string", pyTypeName(hs), i)}, nil
			}
			if pyTruthy(f["ask_at_runtime"]) {
				return []string{"'ask_at_runtime' is not supported for custom credentials."}, nil
			}
			if reservedNamespaceNames[id] {
				return []string{fmt.Sprintf(`"%s" is a reserved field name`, id)}, nil
			}
			if ids[id] {
				return []string{fmt.Sprintf("field IDs must be unique (%s)", id)}, nil
			}
			ids[id] = true
			f["type"] = typ
			if d, has := f["default"]; has {
				if typ == "string" && !isJSONString(d) || typ == "boolean" && !isBool(d) {
					return []string{fmt.Sprintf("%s is not a %s", pyStr(d), typ)}, nil
				}
			}
			for _, key := range []string{"choices", "multiline", "format", "secret"} {
				if _, has := f[key]; has && typ != "string" {
					return []string{fmt.Sprintf("%s not allowed for %s type (%s)", key, typ, id)}, nil
				}
			}
		}
	}
	b, _ := json.Marshal(in)
	return nil, b
}

func isBool(v any) bool { _, ok := v.(bool); return ok }

// pyStr renders a value as Python's str() did.
func pyStr(v any) string {
	if s, ok := v.(string); ok {
		return s
	}
	return pyRepr(v)
}

// validateCredentialTypeInjectors ports the schema half of
// CredentialTypeInjectorField.validate; checkInjectorTemplates renders the
// templates.
func validateCredentialTypeInjectors(raw any) ([]string, json.RawMessage) {
	raw = plainValue(raw)
	in, ok := raw.(map[string]any)
	if !ok {
		return []string{fmt.Sprintf("%s provided, expected dict", pyTypeName(raw))}, nil
	}
	for k := range in {
		if k != "file" && k != "env" && k != "extra_vars" {
			return []string{fmt.Sprintf("Additional properties are not allowed ('%s' was unexpected)", k)}, nil
		}
	}
	if fileRaw, has := in["file"]; has {
		files, ok := fileRaw.(map[string]any)
		if !ok {
			return []string{fmt.Sprintf("%s provided in relative path ['file'], expected dict", pyTypeName(fileRaw))}, nil
		}
		names := make([]string, 0, len(files))
		for k, v := range files {
			if !fileTemplateRe.MatchString(k) {
				return []string{fmt.Sprintf("Schema validation error in relative path ['file'] (Additional properties are not allowed ('%s' was unexpected))", k)}, nil
			}
			if !isJSONString(v) {
				return []string{fmt.Sprintf("%s provided in relative path ['file', '%s'], expected string", pyTypeName(v), k)}, nil
			}
			names = append(names, k)
		}
		sort.Strings(names)
		hasPlain := false
		for _, n := range names {
			if n == "template" {
				hasPlain = true
			}
		}
		if hasPlain && len(names) > 1 {
			return []string{"Must use multi-file syntax when injecting multiple files"}, nil
		}
	}
	if envRaw, has := in["env"]; has {
		env, ok := envRaw.(map[string]any)
		if !ok {
			return []string{fmt.Sprintf("%s provided in relative path ['env'], expected dict", pyTypeName(envRaw))}, nil
		}
		for k, v := range env {
			if !envVarRe.MatchString(k) {
				return []string{fmt.Sprintf("Schema validation error in relative path ['env'] (Additional properties are not allowed ('%s' was unexpected))", k)}, nil
			}
			vs, ok := v.(string)
			if !ok {
				return []string{fmt.Sprintf("%s provided in relative path ['env', '%s'], expected string", pyTypeName(v), k)}, nil
			}
			if !asciiRe.MatchString(vs) {
				return []string{fmt.Sprintf("%s does not match '^[\\x00-\\x7f]*$'", pyRepr(vs))}, nil
			}
			if strings.HasPrefix(k, "ANSIBLE_") {
				return []string{fmt.Sprintf("Environment variable %s may affect Ansible configuration so its use is not allowed in credentials.", k)}, nil
			}
			if envBlocklist[k] {
				return []string{fmt.Sprintf("Environment variable %s is not allowed to be used in credentials.", k)}, nil
			}
		}
	}
	if evRaw, has := in["extra_vars"]; has {
		if msg := checkExtraVars(evRaw, "['extra_vars']"); msg != "" {
			return []string{msg}, nil
		}
	}
	b, _ := json.Marshal(in)
	return nil, b
}

func checkExtraVars(raw any, path string) string {
	ev, ok := raw.(map[string]any)
	if !ok {
		return fmt.Sprintf("%s provided in relative path %s, expected dict", pyTypeName(raw), path)
	}
	for k, v := range ev {
		if !extraVarRe.MatchString(k) {
			return fmt.Sprintf("Schema validation error in relative path %s (Additional properties are not allowed ('%s' was unexpected))", path, k)
		}
		switch t := v.(type) {
		case string, []any:
		case map[string]any:
			if msg := checkExtraVars(t, strings.TrimSuffix(path, "]")+", '"+k+"']"); msg != "" {
				return msg
			}
		default:
			return fmt.Sprintf("%s is not valid under any of the given schemas", pyRepr(v))
		}
	}
	return ""
}

// credentialTypeFromForm applies a create/update body.
func (s *Server) credentialTypeFromForm(f *Form, t *models.CredentialType, creating bool) {
	t.Name = f.String("name", creating, 512, t.Name)
	t.Description = f.String("description", false, 0, t.Description)
	if f.Has("kind") || creating {
		kind := f.Choice("kind", t.Kind, credentialTypeKinds, creating)
		if kind != "" && kind != "cloud" && kind != "net" {
			f.Errs.Add("kind", fmt.Sprintf("Must be 'cloud' or 'net', not %s", kind))
		} else {
			t.Kind = kind
		}
	}
	if raw, has := f.Raw("inputs"); has {
		if raw == nil {
			raw = map[string]any{}
		}
		if msgs, b := validateCredentialTypeInputs(raw); msgs != nil {
			for _, m := range msgs {
				f.Errs.Add("inputs", m)
			}
		} else {
			t.Inputs = b
		}
	} else if creating {
		t.Inputs = json.RawMessage("{}")
	}
	if raw, has := f.Raw("injectors"); has {
		if raw == nil {
			raw = map[string]any{}
		}
		if msgs, b := validateCredentialTypeInjectors(raw); msgs != nil {
			for _, m := range msgs {
				f.Errs.Add("injectors", m)
			}
		} else {
			t.Injectors = b
		}
	} else if creating {
		t.Injectors = json.RawMessage("{}")
	}
}

func (s *Server) credentialTypeNameTaken(r *http.Request, name, kind string, exclude int64) (bool, error) {
	var n int
	if err := s.Q().QueryRow(r.Context(), `SELECT count(*) FROM main_credentialtype WHERE name = $1 AND kind = $2 AND id <> $3`, name, kind, exclude).Scan(&n); err != nil {
		return false, err
	}
	return n > 0, nil
}

func (s *Server) credentialTypeChanges(t *models.CredentialType) map[string]any {
	return map[string]any{"name": t.Name, "description": t.Description, "kind": t.Kind, "managed": t.Managed, "namespace": t.Namespace,
		"inputs": string(t.EffectiveInputs()), "injectors": string(t.EffectiveInjectors()), "id": t.ID}
}

func (s *Server) credentialTypeCreate(w http.ResponseWriter, r *http.Request) error {
	u, err := RequireWrite(r)
	if err != nil {
		return err
	}
	if !u.IsSuperuser {
		return ErrForbidden
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	f := NewForm(body, false)
	t := &models.CredentialType{CreatedByID: &u.ID, ModifiedByID: &u.ID}
	s.credentialTypeFromForm(f, t, true)
	if err := s.checkInjectorTemplates(r.Context(), f, t); err != nil {
		return err
	}
	if err := f.Err(); err != nil {
		return err
	}
	if v, err := s.credentialTypeNameTaken(r, t.Name, t.Kind, 0); err != nil {
		return err
	} else if v {
		return FieldErrors{"__all__": {"CredentialType with this (name, kind) combination already exists."}}.Err()
	}
	ctx := r.Context()
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if err := models.InsertCredentialType(ctx, tx, t); err != nil {
			return err
		}
		return s.Activity.Record(ctx, tx, activity.Entry{Operation: "create", Object1: "credential_type", Changes: s.credentialTypeChanges(t), ActorID: &u.ID, Links: map[string]int64{"credential_type": t.ID}})
	})
	if err != nil {
		return err
	}
	w.Header().Set("Location", URLFor("credential_types", t.ID))
	WriteJSON(w, http.StatusCreated, s.serializeCredentialType(s.NewSerCtx(r, true), t))
	return nil
}

func (s *Server) credentialTypeInUse(r *http.Request, id int64) (bool, error) {
	var n int
	if err := s.Q().QueryRow(r.Context(), `SELECT count(*) FROM main_credential WHERE credential_type_id = $1`, id).Scan(&n); err != nil {
		return false, err
	}
	return n > 0, nil
}

func (s *Server) credentialTypeUpdate(w http.ResponseWriter, r *http.Request) error {
	u, err := RequireWrite(r)
	if err != nil {
		return err
	}
	t, err := s.loadCredentialType(r)
	if err != nil {
		return err
	}
	if !u.IsSuperuser {
		return ErrForbidden
	}
	if t.Managed {
		return Detail(http.StatusForbidden, "Modifications not allowed for managed credential types")
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	before := s.credentialTypeChanges(t)
	prevInputs := string(t.EffectiveInputs())
	f := NewForm(body, r.Method == http.MethodPatch)
	s.credentialTypeFromForm(f, t, false)
	if err := s.checkInjectorTemplates(r.Context(), f, t); err != nil {
		return err
	}
	if err := f.Err(); err != nil {
		return err
	}
	if f.Has("inputs") && string(t.EffectiveInputs()) != prevInputs {
		if inUse, err := s.credentialTypeInUse(r, t.ID); err != nil {
			return err
		} else if inUse {
			return Detail(http.StatusForbidden, "Modifications to inputs are not allowed for credential types that are in use")
		}
	}
	if v, err := s.credentialTypeNameTaken(r, t.Name, t.Kind, t.ID); err != nil {
		return err
	} else if v {
		return FieldErrors{"__all__": {"CredentialType with this (name, kind) combination already exists."}}.Err()
	}
	t.ModifiedByID = &u.ID
	ctx := r.Context()
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if err := models.UpdateCredentialType(ctx, tx, t); err != nil {
			return err
		}
		changes := diffChanges(before, s.credentialTypeChanges(t))
		if len(changes) == 0 {
			return nil
		}
		return s.Activity.Record(ctx, tx, activity.Entry{Operation: "update", Object1: "credential_type", Changes: changes, ActorID: &u.ID, Links: map[string]int64{"credential_type": t.ID}})
	})
	if err != nil {
		return err
	}
	WriteJSON(w, 200, s.serializeCredentialType(s.NewSerCtx(r, true), t))
	return nil
}

func (s *Server) credentialTypeDelete(w http.ResponseWriter, r *http.Request) error {
	u, err := RequireWrite(r)
	if err != nil {
		return err
	}
	t, err := s.loadCredentialType(r)
	if err != nil {
		return err
	}
	if !u.IsSuperuser {
		return ErrForbidden
	}
	if t.Managed {
		return Detail(http.StatusForbidden, credentialTypeDeleteProtected)
	}
	if v, err := s.credentialTypeInUse(r, t.ID); err != nil {
		return err
	} else if v {
		return Detail(http.StatusForbidden, "Credential types that are in use cannot be deleted")
	}
	ctx := r.Context()
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if err := s.Activity.Record(ctx, tx, activity.Entry{Operation: "delete", Object1: "credential_type", Changes: s.credentialTypeChanges(t), ActorID: &u.ID}); err != nil {
			return err
		}
		return models.DeleteCredentialType(ctx, tx, t.ID, s.Cascade)
	})
	if err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func (s *Server) credentialTypeCredentials(w http.ResponseWriter, r *http.Request) error {
	if _, err := RequireUser(r); err != nil {
		return err
	}
	t, err := s.loadCredentialType(r)
	if err != nil {
		return err
	}
	return s.credentialListWith(w, r, func(q *Query) { q.And("c.credential_type_id = " + q.Arg(t.ID)) })
}
