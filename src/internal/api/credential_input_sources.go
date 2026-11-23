package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"

	"github.com/ctrliq/ascender/internal/auth"
	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/models"
	"github.com/jackc/pgx/v5"
)

// Credential input sources: create (credential_input_sources/ and a
// credential's input_sources/), update and delete, with
// CredentialInputSourceSerializer's fields, the model's clean_ methods and
// CredentialInputSourceAccess. Input sources were never in the activity
// stream.

// inputSourceFieldOrder is _meta.fields' order of the cleaned fields.
var inputSourceFieldOrder = []string{"target_credential", "source_credential", "input_field_name"}

// canUseCredential and canAdminCredential are the role checks of
// CredentialInputSourceAccess.
func (s *Server) credentialRole(c *SerCtx, cr *models.Credential, role string) bool {
	if c.User != nil && c.User.IsSuperuser {
		return true
	}
	switch role {
	case "admin_role":
		return c.HasRole(cr.AdminRoleID)
	case "use_role":
		return c.HasRole(cr.UseRoleID)
	}
	return false
}

// inputSourceRelatedOK is check_related on the raw data: a credential that
// is named must carry the role; one that is absent passes.
func (s *Server) inputSourceRelatedOK(c *SerCtx, body *OMap, field, role string) bool {
	raw, ok := body.Get(field)
	if !ok || raw == nil || raw == "" {
		return true
	}
	id, ok := integerOf(raw)
	if !ok {
		str, isStr := raw.(string)
		if !isStr {
			return true
		}
		// The same parse as Form.ID, which the serializer then uses: an id
		// read differently here ("09" as octal) would check one credential
		// and store another. The update and create handlers check the
		// validated ids again anyway.
		n, err := strconv.ParseInt(strings.TrimSpace(str), 10, 64)
		if err != nil {
			return true
		}
		id = n
	}
	cr, err := models.GetCredential(c.Ctx(), s.Q(), id)
	if err != nil {
		return true
	}
	return s.credentialRole(c, cr, role)
}

// credentialTypeOf loads a credential's type.
func (s *Server) credentialTypeOf(ctx context.Context, cr *models.Credential) (*models.CredentialType, error) {
	return models.GetCredentialType(ctx, s.Q(), cr.CredentialTypeID)
}

// validateInputSourceMetadata is DynamicCredentialInputField.validate: the
// source type's metadata fields, by type and choices, no others, and the
// required ones set. Field errors are raised at once ({"metadata": {...}});
// an unexpected key is the field's own error.
// undeclaredMetadata is jsonschema's message for keys of m that are not
// among the type's metadata fields, or "" when there are none.
func undeclaredMetadata(schema models.CredentialTypeInputs, m map[string]any) string {
	var extra []string
	for k := range m {
		known := false
		for _, f := range schema.Metadata {
			if f.ID == k {
				known = true
			}
		}
		if !known {
			extra = append(extra, k)
		}
	}
	if len(extra) == 0 {
		return ""
	}
	sort.Strings(extra)
	quoted := make([]string, len(extra))
	for i, k := range extra {
		quoted[i] = "'" + k + "'"
	}
	verb := "was"
	if len(extra) > 1 {
		verb = "were"
	}
	return fmt.Sprintf("Additional properties are not allowed (%s %s unexpected)", strings.Join(quoted, ", "), verb)
}

func validateInputSourceMetadata(ct *models.CredentialType, raw any) (map[string]any, *APIError, []string) {
	raw = plainValue(raw)
	if raw == nil {
		raw = map[string]any{}
	}
	m, ok := raw.(map[string]any)
	if !ok {
		return nil, nil, []string{fmt.Sprintf("%s is not of type 'object'", pyRepr(raw))}
	}
	schema := ct.ParsedInputs()
	errs := NewOMap()
	for _, f := range schema.Metadata {
		v, present := m[f.ID]
		if !present {
			continue
		}
		typ := f.Type
		if typ == "" {
			typ = "string"
		}
		switch typ {
		case "boolean":
			if _, ok := v.(bool); !ok {
				errs.Set(f.ID, []string{fmt.Sprintf("%s is not of type 'boolean'", pyRepr(v))})
				continue
			}
		default:
			sv, ok := v.(string)
			if !ok {
				errs.Set(f.ID, []string{fmt.Sprintf("%s is not of type 'string'", pyRepr(v))})
				continue
			}
			if len(f.Choices) > 0 {
				found := false
				for _, c := range f.Choices {
					if c == sv {
						found = true
					}
				}
				if !found {
					choices := make([]any, len(f.Choices))
					for i, c := range f.Choices {
						choices[i] = c
					}
					errs.Set(f.ID, []string{fmt.Sprintf("%s is not one of %s", pyRepr(sv), pyRepr(choices))})
				}
			}
		}
	}
	if msg := undeclaredMetadata(schema, m); msg != "" {
		return nil, nil, []string{msg}
	}
	for _, req := range schema.Required {
		for _, f := range schema.Metadata {
			if f.ID == req && !pyTruthy(m[req]) && !errs.Has(req) {
				errs.Set(req, []string{"required for " + ct.Name})
			}
		}
	}
	if errs.Len() > 0 {
		return nil, &APIError{Status: http.StatusBadRequest, Body: NewOMap().Set("metadata", errs)}, nil
	}
	return m, nil, nil
}

// inputSourceCycle is clean_source_credential's walk: would the source
// already read, through its own sources, from the target?
func (s *Server) inputSourceCycle(ctx context.Context, sourceID, targetID int64) (bool, error) {
	visited := map[int64]bool{}
	var walk func(id int64) (bool, error)
	walk = func(id int64) (bool, error) {
		if id == targetID {
			return true, nil
		}
		if visited[id] {
			return false, nil
		}
		visited[id] = true
		next, err := models.ScanIDs(ctx, s.Q(), `SELECT source_credential_id FROM main_credentialinputsource WHERE target_credential_id = $1`, id)
		if err != nil {
			return false, err
		}
		for _, n := range next {
			if found, err := walk(n); found || err != nil {
				return found, err
			}
		}
		return false, nil
	}
	return walk(sourceID)
}

// wantsWorkloadIdentityToken is CredentialType.wants_workload_identity_token.
func wantsWorkloadIdentityToken(ct *models.CredentialType) bool {
	for _, f := range ct.ParsedInputs().Fields {
		if f.Internal && f.ID == workloadIdentityTokenField {
			return true
		}
	}
	return false
}

// workloadIdentityTokenField is workload_identity.TOKEN_FIELD.
const workloadIdentityTokenField = "workload_identity_token"

// sourceLooksUpAsJob is _source_looks_up_as_the_job.
func (s *Server) sourceLooksUpAsJob(ctx context.Context, sourceID int64) (bool, error) {
	seen := map[int64]bool{}
	pending := []int64{sourceID}
	for len(pending) > 0 {
		id := pending[len(pending)-1]
		pending = pending[:len(pending)-1]
		if seen[id] {
			continue
		}
		seen[id] = true
		cr, err := models.GetCredential(ctx, s.Q(), id)
		if db.IsNoRows(err) {
			continue
		}
		if err != nil {
			return false, err
		}
		if ct, err := s.credentialTypeOf(ctx, cr); err == nil && wantsWorkloadIdentityToken(ct) {
			return true, nil
		}
		next, err := models.ScanIDs(ctx, s.Q(), `SELECT source_credential_id FROM main_credentialinputsource WHERE target_credential_id = $1`, id)
		if err != nil {
			return false, err
		}
		pending = append(pending, next...)
	}
	return false, nil
}

// targetFeedsVaultID is _target_feeds_a_vault_id.
func (s *Server) targetFeedsVaultID(ctx context.Context, targetID int64) (bool, error) {
	seen := map[int64]bool{}
	pending := []int64{targetID}
	for len(pending) > 0 {
		id := pending[len(pending)-1]
		pending = pending[:len(pending)-1]
		if seen[id] {
			continue
		}
		seen[id] = true
		rows, err := s.Q().Query(ctx, `SELECT input_field_name, target_credential_id FROM main_credentialinputsource WHERE source_credential_id = $1`, id)
		if err != nil {
			return false, err
		}
		type edge struct {
			name   string
			target int64
		}
		edges, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (edge, error) {
			var e edge
			err := row.Scan(&e.name, &e.target)
			return e, err
		})
		if err != nil {
			return false, err
		}
		for _, e := range edges {
			if e.name == "vault_id" {
				return true, nil
			}
			pending = append(pending, e.target)
		}
	}
	return false, nil
}

// inputSourceForm reads and validates the serializer's fields over an
// existing source (nil to create). It returns the field errors DRF raised
// before validate(), or the result of validate().
func (s *Server) inputSourceForm(r *http.Request, body *OMap, src *models.CredentialInputSource, partial bool) (*models.CredentialInputSource, error) {
	ctx := r.Context()
	out := &models.CredentialInputSource{}
	if src != nil {
		*out = *src
	}
	f := NewForm(body, partial)
	out.Description = f.String("description", false, 0, out.Description)
	credExists := func(id int64) bool { _, err := models.GetCredential(ctx, s.Q(), id); return err == nil }
	var cur *int64
	if src != nil {
		cur = &src.TargetCredentialID
	}
	if id, set := f.ID("target_credential", cur, true, credExists); set && id != nil {
		out.TargetCredentialID = *id
	}
	if src != nil {
		cur = &src.SourceCredentialID
	} else {
		cur = nil
	}
	if id, set := f.ID("source_credential", cur, true, credExists); set && id != nil {
		out.SourceCredentialID = *id
	}
	cfn := out.InputFieldName
	if src == nil {
		cfn = ""
	}
	out.InputFieldName = f.String("input_field_name", src == nil || !partial, 1024, cfn)
	metaRaw, metaSet := f.Raw("metadata")
	if err := f.Err(); err != nil {
		return nil, err
	}
	target, err := models.GetCredential(ctx, s.Q(), out.TargetCredentialID)
	if err != nil {
		return nil, err
	}
	source, err := models.GetCredential(ctx, s.Q(), out.SourceCredentialID)
	if err != nil {
		return nil, err
	}
	sourceType, err := s.credentialTypeOf(ctx, source)
	if err != nil {
		return nil, err
	}
	targetType, err := s.credentialTypeOf(ctx, target)
	if err != nil {
		return nil, err
	}
	// full_clean: the metadata field, then the clean_ methods.
	errs := NewOMap()
	var meta any = map[string]any{}
	if metaSet {
		meta = metaRaw
	} else if src != nil && len(src.Metadata) > 0 {
		var m any
		_ = json.Unmarshal(src.Metadata, &m)
		meta = m
	}
	cleaned, raised, own := validateInputSourceMetadata(sourceType, meta)
	if raised != nil {
		return nil, raised
	}
	if own != nil {
		errs.Set("metadata", own)
	} else {
		b, _ := json.Marshal(cleaned)
		out.Metadata = b
	}
	for _, field := range inputSourceFieldOrder {
		switch field {
		case "target_credential":
			if out.TargetCredentialID == out.SourceCredentialID {
				errs.Set(field, []string{"Target and source credentials must be different"})
			}
		case "source_credential":
			if sourceType.Kind != "external" {
				errs.Set(field, []string{"Source must be an external credential"})
			} else if cyc, err := s.inputSourceCycle(ctx, out.SourceCredentialID, out.TargetCredentialID); err != nil {
				return nil, err
			} else if cyc {
				errs.Set(field, []string{"This would create a circular dependency between credentials"})
			}
		case "input_field_name":
			var defined []string
			for _, fd := range targetType.ParsedInputs().Fields {
				if !fd.Internal {
					defined = append(defined, fd.ID)
				}
			}
			found := false
			for _, d := range defined {
				if d == out.InputFieldName {
					found = true
				}
			}
			if !found {
				sort.Strings(defined)
				errs.Set(field, []string{fmt.Sprintf("Input field must be defined on target credential (options are %s).", strings.Join(defined, ", "))})
			} else {
				asJob, err := s.sourceLooksUpAsJob(ctx, out.SourceCredentialID)
				if err != nil {
					return nil, err
				}
				feedsVault := out.InputFieldName == "vault_id"
				if asJob && !feedsVault {
					if feedsVault, err = s.targetFeedsVaultID(ctx, out.TargetCredentialID); err != nil {
						return nil, err
					}
				}
				if asJob && feedsVault {
					errs.Set(field, []string{"A vault id cannot be looked up as the job: it is needed before any job runs."})
				}
			}
		}
	}
	// validate_unique, skipping the fields already in error.
	if !errs.Has("target_credential") && !errs.Has("input_field_name") {
		var other int64
		err := s.Q().QueryRow(ctx, `SELECT id FROM main_credentialinputsource WHERE target_credential_id = $1 AND input_field_name = $2 AND id <> $3`,
			out.TargetCredentialID, out.InputFieldName, out.ID).Scan(&other)
		if err == nil {
			errs.Set("__all__", []string{"Credential input source with this Target credential and Input field name already exists."})
		}
	}
	if errs.Len() > 0 {
		return nil, &APIError{Status: http.StatusBadRequest, Body: errs}
	}
	return out, nil
}

// inputSourceCreate is ListCreateAPIView.create, and with parent the
// credential's sub-list (target_credential from the URL).
func (s *Server) inputSourceCreate(w http.ResponseWriter, r *http.Request, parent bool) error {
	u, err := RequireWrite(r)
	if err != nil {
		return err
	}
	ctx := r.Context()
	c := s.NewSerCtx(r, true)
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	if parent {
		id, err := PathID(r)
		if err != nil {
			return NotFoundFor("Credential")
		}
		cr, err := credentialObj.load(s, r, u, id)
		if err != nil {
			return err
		}
		// check_post_permissions: admin of the parent credential.
		if !s.credentialRole(c, cr, "admin_role") {
			return ErrForbidden
		}
		body.Set("target_credential", json.Number(fmt.Sprint(id)))
	} else if !s.inputSourceRelatedOK(c, body, "target_credential", "admin_role") || !s.inputSourceRelatedOK(c, body, "source_credential", "use_role") {
		return ErrForbidden
	}
	src, err := s.inputSourceForm(r, body, nil, false)
	if err != nil {
		return err
	}
	// can_add with the validated data.
	if target, err := models.GetCredential(ctx, s.Q(), src.TargetCredentialID); err != nil || !s.credentialRole(c, target, "admin_role") {
		return ErrForbidden
	}
	if source, err := models.GetCredential(ctx, s.Q(), src.SourceCredentialID); err != nil || !s.credentialRole(c, source, "use_role") {
		return ErrForbidden
	}
	err = s.Q().QueryRow(ctx, `INSERT INTO main_credentialinputsource (created, modified, description, input_field_name, metadata, created_by_id, modified_by_id, source_credential_id, target_credential_id)
		VALUES (now(), now(), $1, $2, $3::jsonb, $4, $4, $5, $6) RETURNING id, created, modified`,
		src.Description, src.InputFieldName, string(src.Metadata), u.ID, src.SourceCredentialID, src.TargetCredentialID).Scan(&src.ID, &src.Created, &src.Modified)
	if err != nil {
		return err
	}
	src.CreatedByID, src.ModifiedByID = &u.ID, &u.ID
	o, err := s.serializeCredentialInputSource(c, src)
	if err != nil {
		return err
	}
	w.Header().Set("Location", URLFor("credential_input_sources", src.ID))
	WriteJSON(w, http.StatusCreated, o)
	return nil
}

func (s *Server) inputSourceListCreate(w http.ResponseWriter, r *http.Request) error {
	return s.inputSourceCreate(w, r, false)
}

func (s *Server) inputSourceSubCreate(w http.ResponseWriter, r *http.Request) error {
	return s.inputSourceCreate(w, r, true)
}

// loadInputSourceFor reads an input source the user can see (through its
// target credential).
func (s *Server) loadInputSourceFor(r *http.Request, u *auth.User) (*models.CredentialInputSource, error) {
	id, err := PathID(r)
	if err != nil {
		return nil, NotFoundFor("CredentialInputSource")
	}
	src, err := models.ScanCredentialInputSource(s.Q().QueryRow(r.Context(), `SELECT `+models.CredentialInputSourceColumns+` FROM main_credentialinputsource cis WHERE cis.id = $1`, id))
	if err != nil {
		if db.IsNoRows(err) {
			return nil, NotFoundFor("CredentialInputSource")
		}
		return nil, err
	}
	// CredentialInputSourceAccess.can_read: readers of the target.
	if _, err := credentialObj.load(s, r, u, src.TargetCredentialID); err != nil {
		return nil, err
	}
	return src, nil
}

// inputSourceUpdate is the detail's PUT and PATCH (can_change, then the
// serializer).
func (s *Server) inputSourceUpdate(w http.ResponseWriter, r *http.Request) error {
	u, err := RequireWrite(r)
	if err != nil {
		return err
	}
	ctx := r.Context()
	src, err := s.loadInputSourceFor(r, u)
	if err != nil {
		return err
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	if !u.IsSuperuser {
		target, err := models.GetCredential(ctx, s.Q(), src.TargetCredentialID)
		if err != nil && !db.IsNoRows(err) {
			return err
		}
		source, err := models.GetCredential(ctx, s.Q(), src.SourceCredentialID)
		if err != nil && !db.IsNoRows(err) {
			return err
		}
		if !s.inputSourceRelatedOK(c, body, "target_credential", "admin_role") || !s.inputSourceRelatedOK(c, body, "source_credential", "use_role") ||
			target == nil || source == nil || !s.credentialRole(c, target, "admin_role") || !s.credentialRole(c, source, "use_role") {
			return ErrForbidden
		}
	}
	out, err := s.inputSourceForm(r, body, src, r.Method == http.MethodPatch)
	if err != nil {
		return err
	}
	// can_change with the validated data, as create checks it: the
	// credentials the input source will link are the ones that need the
	// roles, whatever the request's raw values looked like.
	if !u.IsSuperuser {
		if target, err := models.GetCredential(ctx, s.Q(), out.TargetCredentialID); err != nil || !s.credentialRole(c, target, "admin_role") {
			return ErrForbidden
		}
		if source, err := models.GetCredential(ctx, s.Q(), out.SourceCredentialID); err != nil || !s.credentialRole(c, source, "use_role") {
			return ErrForbidden
		}
	}
	if _, err := s.Q().Exec(ctx, `UPDATE main_credentialinputsource SET modified = now(), description = $2, input_field_name = $3, metadata = $4::jsonb, modified_by_id = $5,
		source_credential_id = $6, target_credential_id = $7 WHERE id = $1`, out.ID, out.Description, out.InputFieldName, string(out.Metadata), u.ID, out.SourceCredentialID, out.TargetCredentialID); err != nil {
		return err
	}
	fresh, err := s.loadInputSourceFor(r, u)
	if err != nil {
		return err
	}
	o, err := s.serializeCredentialInputSource(c, fresh)
	if err != nil {
		return err
	}
	WriteJSON(w, 200, o)
	return nil
}

// inputSourceDelete is can_delete: admin of the target credential.
func (s *Server) inputSourceDelete(w http.ResponseWriter, r *http.Request) error {
	u, err := RequireWrite(r)
	if err != nil {
		return err
	}
	ctx := r.Context()
	src, err := s.loadInputSourceFor(r, u)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	target, err := models.GetCredential(ctx, s.Q(), src.TargetCredentialID)
	if err != nil || !s.credentialRole(c, target, "admin_role") {
		return ErrForbidden
	}
	if _, err := s.Q().Exec(ctx, `DELETE FROM main_credentialinputsource WHERE id = $1`, src.ID); err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}
