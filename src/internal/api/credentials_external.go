package api

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"strconv"
	"strings"

	"github.com/ctrliq/ascender/internal/auth"
	"github.com/ctrliq/ascender/internal/credplugins"
	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/models"
)

// External credentials: the lookups of input sources (Credential.get_input
// for a field another credential supplies) and the test/ views that try a
// lookup out before it is saved.

type workloadScopeKey struct{}

// WithWorkloadScope is workload_identity_for: lookups made with the
// returned context sign their tokens for the scope's job.
func WithWorkloadScope(ctx context.Context, w *WorkloadScope) context.Context {
	return context.WithValue(ctx, workloadScopeKey{}, w)
}

// WorkloadScopeFrom is the scope ctx was marked with, if any.
func WorkloadScopeFrom(ctx context.Context) *WorkloadScope {
	w, _ := ctx.Value(workloadScopeKey{}).(*WorkloadScope)
	return w
}

// tokenForCurrentWorkload is token_for_current_workload for a lookup: a
// fresh short-lived token for the job ctx runs.
func tokenForCurrentWorkload(ctx context.Context, audience string) (string, error) {
	w := WorkloadScopeFrom(ctx)
	if w == nil {
		return "", &WorkloadIdentityError{"A workload identity token can only be issued for a running job."}
	}
	return w.Token(ctx, audience, false)
}

// lookupEnv is what a lookup reads besides its keywords. withTaskEnv is
// set_environ(**ASCENDER_TASK_ENV), which the credential type test left out.
func (s *Server) lookupEnv(ctx context.Context, withTaskEnv bool) credplugins.Env {
	env := credplugins.Env{AllowAWSDefaultCredentials: s.Settings.Bool(ctx, "AWS_SECRETS_MANAGER_ALLOW_DEFAULT_CREDENTIALS")}
	if !withTaskEnv {
		return env
	}
	if v, ok := s.Settings.Get(ctx, "ASCENDER_TASK_ENV"); ok {
		if m, ok := v.(map[string]any); ok {
			env.TaskEnv = map[string]string{}
			for k, val := range m {
				env.TaskEnv[k] = credplugins.PyStr(val)
			}
		}
	}
	return env
}

// LookupError is a lookup that failed while a job was prepared. The old
// task left Python's whole traceback, frames of its own source and then the
// exception; this keeps the exception line and puts one line in place of
// the frames, naming the field and the credential it belongs to (the one
// the job uses, whose field an input source fills).
type LookupError struct {
	// Credential is the name of the target credential, whose field it is.
	Credential string
	Field      string
	Err        error
}

func (e *LookupError) Error() string {
	return "Traceback (most recent call last):\n  " + fmt.Sprintf("Looking up %s of credential %s", e.Field, e.Credential) + "\n" + credplugins.Traceback(e.Err)
}

func (e *LookupError) Unwrap() error { return e.Err }

// maxLookupDepth bounds a chain of credentials that look each other up;
// saving refuses a cycle, so only a damaged database comes near it.
const maxLookupDepth = 16

// inputSources lists the input sources of a credential.
func (s *Server) inputSources(ctx context.Context, credID int64) ([]*models.CredentialInputSource, error) {
	rows, err := s.Q().Query(ctx, `SELECT `+models.CredentialInputSourceColumns+` FROM main_credentialinputsource cis WHERE cis.target_credential_id = $1 ORDER BY cis.id`, credID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*models.CredentialInputSource
	for rows.Next() {
		src, err := models.ScanCredentialInputSource(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, src)
	}
	return out, rows.Err()
}

// DynamicInputs looks up every field of a credential that an input source
// supplies (Credential.get_input of a dynamic field). A lookup that logs
// in as the job needs ctx to carry the job's WorkloadScope.
func (s *Server) DynamicInputs(ctx context.Context, credID int64) (map[string]any, error) {
	return s.dynamicInputs(ctx, credID, 0)
}

func (s *Server) dynamicInputs(ctx context.Context, credID int64, depth int) (map[string]any, error) {
	srcs, err := s.inputSources(ctx, credID)
	if err != nil || len(srcs) == 0 {
		return nil, err
	}
	out := map[string]any{}
	for _, src := range srcs {
		if _, done := out[src.InputFieldName]; done {
			continue
		}
		v, err := s.inputSourceValue(ctx, src, depth)
		if err != nil {
			return nil, err
		}
		out[src.InputFieldName] = v
	}
	return out, nil
}

// lookupInput is Credential.get_input of a field an input source fills
// (_get_dynamic_input): the lookup, run there and then, with str() of its
// value. It is what credential briefs run for a looked-up vault id.
func (s *Server) lookupInput(ctx context.Context, credID int64, field string) (string, error) {
	srcs, err := s.inputSources(ctx, credID)
	if err != nil {
		return "", err
	}
	for _, src := range srcs {
		if src.InputFieldName != field {
			continue
		}
		v, err := s.inputSourceValue(ctx, src, 0)
		if err != nil {
			s.Log.WarnContext(ctx, "credential lookup failed", "credential", credID, "field", field, "err", err)
			return "", err
		}
		return credplugins.PyStr(v), nil
	}
	return "", fmt.Errorf("%s is not a dynamic input field", field)
}

// WithInputLookups marks ctx so that credential briefs loaded with it look
// up a vault id an input source fills (models.WithInputLookup). Every API
// request has it; work outside one adds it where it compares credentials.
func (s *Server) WithInputLookups(ctx context.Context) context.Context {
	return models.WithInputLookup(ctx, s.lookupInput)
}

// inputSourceValue is CredentialInputSource.get_input_value: the source
// credential's inputs, the fields other sources give it, and the metadata,
// handed to the source's plugin.
func (s *Server) inputSourceValue(ctx context.Context, src *models.CredentialInputSource, depth int) (any, error) {
	if depth >= maxLookupDepth {
		return nil, fmt.Errorf("credential input sources nest more than %d deep", maxLookupDepth)
	}
	cred, err := models.GetCredential(ctx, s.Q(), src.SourceCredentialID)
	if err != nil {
		return nil, err
	}
	ct, err := models.GetCredentialType(ctx, s.Q(), cred.CredentialTypeID)
	if err != nil {
		return nil, err
	}
	kw, err := s.decryptInputs(ct, cred)
	if err != nil {
		return nil, err
	}
	dyn, err := s.dynamicInputs(ctx, cred.ID, depth+1)
	if err != nil {
		return nil, err
	}
	for k, v := range dyn {
		if _, ok := kw[k]; !ok {
			kw[k] = v
		}
	}
	var meta map[string]any
	if len(src.Metadata) > 0 {
		_ = json.Unmarshal(src.Metadata, &meta)
	}
	for k, v := range meta {
		kw[k] = v
	}
	if wantsWorkloadIdentityToken(ct) {
		tok, err := tokenForCurrentWorkload(ctx, credplugins.PyStr(kw["url"]))
		if err != nil {
			return nil, err
		}
		kw[credplugins.TokenField] = tok
	}
	v, err := s.runPlugin(ctx, ct, credplugins.Kwargs(kw), true)
	if err != nil {
		// The field is the target credential's, so the traceback names
		// that credential, the one the job uses, not the lookup's.
		target := fmt.Sprintf("#%d", src.TargetCredentialID)
		if t, terr := models.GetCredential(ctx, s.Q(), src.TargetCredentialID); terr == nil {
			target = t.Name
		}
		return nil, &LookupError{Credential: target, Field: src.InputFieldName, Err: err}
	}
	return v, nil
}

// runPlugin is credential_type.plugin.backend(**kwargs).
func (s *Server) runPlugin(ctx context.Context, ct *models.CredentialType, kw credplugins.Kwargs, withTaskEnv bool) (any, error) {
	if ct.Kind != "external" {
		return nil, &credplugins.Exception{Class: "AttributeError", Msg: "plugin"}
	}
	ns := ""
	if ct.Namespace != nil {
		ns = *ct.Namespace
	}
	return credplugins.Lookup(ctx, ns, s.lookupEnv(ctx, withTaskEnv), kw)
}

// claimsForJobTemplate is claims_for_job_template: the claims a job from
// the template would carry when u launches it, as far as they are known
// before it runs.
func (s *Server) claimsForJobTemplate(ctx context.Context, jtID int64, u *auth.User) (*OMap, error) {
	var (
		name, jobType, playbook       string
		orgID, projID, invID, ownEEID *int64
		orgName, projName, invName    *string
		projEE, orgEE, invOrgEE       *int64
	)
	err := s.Q().QueryRow(ctx, `SELECT ujt.name, jt.job_type, jt.playbook, o.id, o.name, p.id, p.name, i.id, i.name, ujt.execution_environment_id,
			pr.default_environment_id, o.default_environment_id, io.default_environment_id
		FROM main_jobtemplate jt
		JOIN main_unifiedjobtemplate ujt ON ujt.id = jt.unifiedjobtemplate_ptr_id
		LEFT JOIN main_organization o ON o.id = ujt.organization_id
		LEFT JOIN main_unifiedjobtemplate p ON p.id = jt.project_id
		LEFT JOIN main_project pr ON pr.unifiedjobtemplate_ptr_id = jt.project_id
		LEFT JOIN main_inventory i ON i.id = jt.inventory_id
		LEFT JOIN main_organization io ON io.id = i.organization_id
		WHERE jt.unifiedjobtemplate_ptr_id = $1`, jtID).Scan(&name, &jobType, &playbook, &orgID, &orgName, &projID, &projName, &invID, &invName, &ownEEID, &projEE, &orgEE, &invOrgEE)
	if err != nil {
		return nil, err
	}
	c := NewOMap().Set("ascender_unified_job_type", "job").Set("ascender_launch_type", "manual").
		Set("ascender_job_template_name", name).Set("ascender_job_template_id", jtID).
		Set("ascender_unified_job_template_name", name).Set("ascender_unified_job_template_id", jtID).
		Set("ascender_job_type", jobType)
	if playbook != "" {
		c.Set("ascender_playbook_name", playbook)
	}
	if orgID != nil {
		c.Set("ascender_organization_name", *orgName).Set("ascender_organization_id", *orgID)
	}
	if projID != nil {
		c.Set("ascender_project_name", *projName).Set("ascender_project_id", *projID)
	}
	if invID != nil {
		c.Set("ascender_inventory_name", *invName).Set("ascender_inventory_id", *invID)
	}
	// The environment a job would run in: the template's, the project's,
	// the organization's, the inventory organization's, or the default.
	var ee *int64
	for _, id := range []*int64{ownEEID, projEE, orgEE, invOrgEE} {
		if id != nil {
			ee = id
			break
		}
	}
	if ee == nil {
		ee = s.DefaultExecutionEnvironmentID(ctx)
	}
	if ee != nil {
		var eeName string
		if s.Q().QueryRow(ctx, `SELECT name FROM main_executionenvironment WHERE id = $1`, *ee).Scan(&eeName) == nil {
			c.Set("ascender_execution_environment_name", eeName).Set("ascender_execution_environment_id", *ee)
		}
	}
	if u != nil {
		c.Set("ascender_launched_by_name", u.Username).Set("ascender_launched_by_id", u.ID).Set("ascender_launched_by_type", "user")
	}
	return c, nil
}

// testJobTemplateKey is the metadata key a test names the job template
// it signs a workload identity token for by.
const testJobTemplateKey = "job_template_id"

// testJobTemplateID is int(job_template_id), or false when Python's int()
// would have raised.
func testJobTemplateID(v any) (int64, bool) {
	switch x := v.(type) {
	case bool:
		if x {
			return 1, true
		}
		return 0, true
	case float64:
		if math.IsInf(x, 0) || math.IsNaN(x) {
			return 0, false
		}
		return int64(x), true
	case json.Number:
		if i, err := x.Int64(); err == nil {
			return i, true
		}
		f, err := x.Float64()
		return int64(f), err == nil
	case string:
		i, err := strconv.ParseInt(strings.ReplaceAll(strings.TrimSpace(x), "_", ""), 10, 64)
		return i, err == nil
	}
	return 0, false
}

// workloadIdentityTestToken is workload_identity_test_token: a credential
// that logs in as the job is tested as a job from the template the user
// picks, which they have to be able to launch. It returns the decoded
// claims the token carried, or the response to give instead.
func (s *Server) workloadIdentityTestToken(r *http.Request, u *auth.User, ct *models.CredentialType, kw credplugins.Kwargs) (*OMap, *OMap, error) {
	delete(kw, credplugins.TokenField)
	jtRaw, hasJT := kw[testJobTemplateKey]
	delete(kw, testJobTemplateKey)
	if !wantsWorkloadIdentityToken(ct) {
		return nil, nil, nil
	}
	if !hasJT || jtRaw == nil || jtRaw == "" {
		return nil, NewOMap().Set("inputs", "Pick the job template to test this credential as."), nil
	}
	jtID, ok := testJobTemplateID(jtRaw)
	if !ok {
		return nil, NewOMap().Set("inputs", "The job template must be given by its id."), nil
	}
	denied := Detail(http.StatusForbidden, fmt.Sprintf("You cannot launch job template %d.", jtID))
	exists, err := db.Exists(r.Context(), s.Q(), `SELECT 1 FROM main_jobtemplate WHERE unifiedjobtemplate_ptr_id = $1`, jtID)
	if err != nil {
		return nil, nil, err
	}
	if !exists || !s.canStartTemplate(r.Context(), s.Q(), s.NewSerCtx(r, true), jtID) {
		return nil, nil, denied
	}
	claims, err := s.claimsForJobTemplate(r.Context(), jtID, u)
	if err != nil {
		return nil, nil, err
	}
	audience := ""
	if v, ok := kw["url"]; ok && v != nil {
		audience = credplugins.PyStr(v)
	}
	token, err := s.SignWorkloadToken(r.Context(), claims, audience, 0)
	if err != nil {
		if wi, ok := err.(*WorkloadIdentityError); ok {
			return nil, NewOMap().Set("inputs", wi.Msg), nil
		}
		return nil, nil, err
	}
	kw[credplugins.TokenField] = token
	// Decoded only to show the user what was sent.
	sent := NewOMap()
	if parts := strings.Split(token, "."); len(parts) == 3 {
		if b, err := base64.RawURLEncoding.DecodeString(parts[1]); err == nil {
			_ = sent.UnmarshalJSON(b)
		}
	}
	return sent, nil, nil
}

// externalTest runs the backend of an external credential type for one of
// the test views and answers as they did: 202 when the lookup worked, 400
// with what went wrong when it did not.
func (s *Server) externalTest(w http.ResponseWriter, r *http.Request, u *auth.User, ct *models.CredentialType, kw credplugins.Kwargs, withTaskEnv bool) error {
	sent, refusal, err := s.workloadIdentityTestToken(r, u, ct, kw)
	if err != nil {
		return err
	}
	if refusal != nil {
		WriteJSON(w, http.StatusBadRequest, refusal)
		return nil
	}
	details := NewOMap()
	if sent != nil && sent.Len() > 0 {
		details.Set("details", NewOMap().Set("sent_jwt_payload", sent))
	}
	if _, err := s.runPlugin(r.Context(), ct, kw, withTaskEnv); err != nil {
		if r.Context().Err() != nil {
			return err
		}
		out := NewOMap().Set("inputs", credplugins.TestMessage(err, sent != nil && sent.Len() > 0))
		if d, ok := details.Get("details"); ok {
			out.Set("details", d)
		}
		WriteJSON(w, http.StatusBadRequest, out)
		return nil
	}
	WriteJSON(w, http.StatusAccepted, details)
	return nil
}

// requestInputs is request.data.get(name, {}).
func requestInputs(body *OMap, name string) map[string]any {
	v, ok := body.Get(name)
	if !ok {
		return nil
	}
	switch m := v.(type) {
	case *OMap:
		return m.ToMap()
	case map[string]any:
		return m
	}
	return nil
}

// credentialExternalTest is CredentialExternalTest: try a saved external
// credential with changes to its inputs and metadata that are not saved.
func (s *Server) credentialExternalTest(w http.ResponseWriter, r *http.Request) error {
	u, cr, err := credentialObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	if r.Method == http.MethodGet {
		WriteJSON(w, http.StatusOK, NewOMap())
		return nil
	}
	if err := RequireWriteScope(u); err != nil {
		return err
	}
	if !s.credentialRole(s.NewSerCtx(r, true), cr, "use_role") {
		return ErrForbidden
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	ct, err := models.GetCredentialType(r.Context(), s.Q(), cr.CredentialTypeID)
	if err != nil {
		return err
	}
	stored, err := s.decryptInputs(ct, cr)
	if err != nil {
		return err
	}
	// get_input of each stored field: one another credential supplies is
	// looked up.
	srcs, err := s.inputSources(r.Context(), cr.ID)
	if err != nil {
		return err
	}
	kw := credplugins.Kwargs{}
	for k, v := range stored {
		kw[k] = v
	}
	looked := map[string]bool{}
	for _, src := range srcs {
		if _, ok := stored[src.InputFieldName]; !ok || looked[src.InputFieldName] {
			continue
		}
		looked[src.InputFieldName] = true
		v, err := s.inputSourceValue(r.Context(), src, 0)
		if err != nil {
			return err
		}
		kw[src.InputFieldName] = v
	}
	// The stored secrets go wherever the inputs point. Testing with the
	// inputs as saved takes use of the credential; changing one for the
	// test (the url above all) takes admin, as changing the credential
	// itself does, so a user who may only use it cannot send its secret
	// to a server of their own.
	admin := s.credentialRole(s.NewSerCtx(r, true), cr, "admin_role")
	for k, v := range requestInputs(body, "inputs") {
		if v == "$encrypted$" {
			continue
		}
		if !admin && !sameInput(stored[k], v) {
			return Detail(http.StatusForbidden, "You do not have permission to test this credential with changed inputs.")
		}
		kw[k] = v
	}
	// Metadata says what to look up (a path, a key, a version) and is
	// merged into the same arguments as the inputs. The old view took any
	// key, so a user who may only use the credential could replace its url
	// through metadata and have its secret sent to a server of their own.
	// Only the type's declared metadata fields are taken; an input is
	// changed through inputs, which needs admin.
	//
	// job_template_id is the one key besides them: it is not the plugin's
	// but the test's own, the template a credential that logs in as the
	// job is tested as (workloadIdentityTestToken), and it is taken out
	// before the plugin runs, as the old view popped it for every type (a
	// template picked for an earlier credential in the UI can be left over
	// when another is tested).
	meta := requestInputs(body, "metadata")
	if jt, ok := meta[testJobTemplateKey]; ok {
		delete(meta, testJobTemplateKey)
		kw[testJobTemplateKey] = jt
	}
	if msg := undeclaredMetadata(ct.ParsedInputs(), meta); msg != "" {
		return FieldErrors{"metadata": {msg}}.Err()
	}
	for k, v := range meta {
		kw[k] = v
	}
	return s.externalTest(w, r, u, ct, kw, true)
}

// sameInput compares a stored credential input with one from a request;
// an absent input reads as empty.
func sameInput(stored, sent any) bool {
	norm := func(v any) string {
		if v == nil {
			return ""
		}
		return fmt.Sprint(v)
	}
	return norm(stored) == norm(sent)
}

// credentialTypeExternalTest is CredentialTypeExternalTest: try a complete
// set of inputs for a credential that is not saved yet. Only a superuser
// passed its permission check (CredentialType's can_add).
func (s *Server) credentialTypeExternalTest(w http.ResponseWriter, r *http.Request) error {
	u, err := RequireUser(r)
	if err != nil {
		return err
	}
	if r.Method != http.MethodGet && !u.IsSuperuser {
		return ErrForbidden
	}
	ct, err := s.loadCredentialType(r)
	if err != nil {
		return err
	}
	if r.Method == http.MethodGet {
		WriteJSON(w, http.StatusOK, NewOMap())
		return nil
	}
	if err := RequireWriteScope(u); err != nil {
		return err
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	kw := credplugins.Kwargs{}
	for k, v := range requestInputs(body, "inputs") {
		kw[k] = v
	}
	for k, v := range requestInputs(body, "metadata") {
		kw[k] = v
	}
	return s.externalTest(w, r, u, ct, kw, false)
}
