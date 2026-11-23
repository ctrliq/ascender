package models

import (
	"context"
	_ "embed"
	"encoding/json"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/db"
)

//go:embed managed_credential_types.json
var managedCredentialTypesJSON []byte

// ManagedCredentialType is the definition of a built-in credential type. The
// old application kept these in code (ManagedCredentialType.registry) and
// stored empty inputs/injectors in the database, so the API output is served
// from this registry, captured from the old API.
type ManagedCredentialType struct {
	Name      string          `json:"name"`
	Kind      string          `json:"kind"`
	Inputs    json.RawMessage `json:"inputs"`
	Injectors json.RawMessage `json:"injectors"`
}

// ManagedCredentialTypes is keyed by namespace.
var ManagedCredentialTypes = map[string]ManagedCredentialType{}

func init() {
	// Compiled in: a malformed file is a build defect, not a runtime state.
	if err := json.Unmarshal(managedCredentialTypesJSON, &ManagedCredentialTypes); err != nil {
		panic("embedded managed_credential_types.json: " + err.Error())
	}
}

// CredentialType is a main_credentialtype row.
type CredentialType struct {
	ID           int64
	Created      time.Time
	Modified     time.Time
	Name         string
	Description  string
	Kind         string
	Managed      bool
	Inputs       json.RawMessage
	Injectors    json.RawMessage
	CreatedByID  *int64
	ModifiedByID *int64
	Namespace    *string
}

// CredentialTypeColumns selects with alias "ct".
const CredentialTypeColumns = `ct.id, ct.created, ct.modified, ct.name, ct.description, ct.kind, ct.managed, ct.inputs, ct.injectors, ct.created_by_id, ct.modified_by_id, ct.namespace`

// ScanCredentialType reads a row produced with CredentialTypeColumns.
func ScanCredentialType(r pgx.Row) (*CredentialType, error) {
	c := &CredentialType{}
	err := r.Scan(&c.ID, &c.Created, &c.Modified, &c.Name, &c.Description, &c.Kind, &c.Managed, &c.Inputs, &c.Injectors, &c.CreatedByID, &c.ModifiedByID, &c.Namespace)
	if err != nil {
		return nil, err
	}
	return c, nil
}

// GetCredentialType loads one row.
func GetCredentialType(ctx context.Context, q db.Querier, id int64) (*CredentialType, error) {
	return ScanCredentialType(q.QueryRow(ctx, `SELECT `+CredentialTypeColumns+` FROM main_credentialtype ct WHERE ct.id = $1`, id))
}

// LoadCredentialTypes returns every credential type keyed by id.
func LoadCredentialTypes(ctx context.Context, q db.Querier) (map[int64]*CredentialType, error) {
	rows, err := q.Query(ctx, `SELECT `+CredentialTypeColumns+` FROM main_credentialtype ct`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[int64]*CredentialType{}
	for rows.Next() {
		t, err := ScanCredentialType(rows)
		if err != nil {
			return nil, err
		}
		out[t.ID] = t
	}
	return out, rows.Err()
}

// EffectiveInputs returns the inputs the API shows: the registry definition
// for managed types, the stored value otherwise.
func (t *CredentialType) EffectiveInputs() json.RawMessage {
	if t.Managed && t.Namespace != nil {
		if m, ok := ManagedCredentialTypes[*t.Namespace]; ok && len(m.Inputs) > 0 {
			return m.Inputs
		}
	}
	if len(t.Inputs) == 0 || string(t.Inputs) == "null" {
		return json.RawMessage("{}")
	}
	return t.Inputs
}

// EffectiveInjectors is EffectiveInputs for injectors.
func (t *CredentialType) EffectiveInjectors() json.RawMessage {
	if t.Managed && t.Namespace != nil {
		if m, ok := ManagedCredentialTypes[*t.Namespace]; ok && len(m.Injectors) > 0 {
			return m.Injectors
		}
	}
	if len(t.Injectors) == 0 || string(t.Injectors) == "null" {
		return json.RawMessage("{}")
	}
	return t.Injectors
}

// CredentialField is one entry of a credential type's inputs.fields.
type CredentialField struct {
	ID           string   `json:"id"`
	Label        string   `json:"label"`
	Type         string   `json:"type,omitempty"`
	Secret       bool     `json:"secret,omitempty"`
	Multiline    bool     `json:"multiline,omitempty"`
	AskAtRuntime bool     `json:"ask_at_runtime,omitempty"`
	Format       string   `json:"format,omitempty"`
	HelpText     string   `json:"help_text,omitempty"`
	Choices      []string `json:"choices,omitempty"`
	Default      any      `json:"default,omitempty"`
	HasDefault   bool     `json:"-"`
	Internal     bool     `json:"internal,omitempty"`
}

// CredentialTypeInputs is the parsed inputs schema of a credential type.
type CredentialTypeInputs struct {
	Fields       []CredentialField   `json:"fields"`
	Metadata     []CredentialField   `json:"metadata,omitempty"`
	Required     []string            `json:"required,omitempty"`
	Dependencies map[string][]string `json:"dependencies,omitempty"`
}

// ParsedInputs decodes EffectiveInputs. Fields without a type are strings.
func (t *CredentialType) ParsedInputs() CredentialTypeInputs {
	var in CredentialTypeInputs
	_ = json.Unmarshal(t.EffectiveInputs(), &in)
	var rawFields struct {
		Fields []map[string]json.RawMessage `json:"fields"`
	}
	_ = json.Unmarshal(t.EffectiveInputs(), &rawFields)
	for i := range in.Fields {
		if in.Fields[i].Type == "" {
			in.Fields[i].Type = "string"
		}
		if i < len(rawFields.Fields) {
			_, in.Fields[i].HasDefault = rawFields.Fields[i]["default"]
		}
	}
	return in
}

// Field returns the field with the id, or nil.
func (in CredentialTypeInputs) Field(id string) *CredentialField {
	for i := range in.Fields {
		if in.Fields[i].ID == id {
			return &in.Fields[i]
		}
	}
	return nil
}

// SecretFields lists the ids of secret fields.
func (in CredentialTypeInputs) SecretFields() []string {
	var out []string
	for _, f := range in.Fields {
		if f.Secret {
			out = append(out, f.ID)
		}
	}
	return out
}

// IsSecret reports whether the field is a secret.
func (in CredentialTypeInputs) IsSecret(id string) bool {
	f := in.Field(id)
	return f != nil && f.Secret
}

// IsAskable reports whether the field may hold "ASK".
func (in CredentialTypeInputs) IsAskable(id string) bool {
	f := in.Field(id)
	return f != nil && f.AskAtRuntime
}

// DefaultFor returns the default the old default_for_field produced for an
// unset value: the first choice, "" for strings, false for booleans.
func (in CredentialTypeInputs) DefaultFor(id string) (any, bool) {
	f := in.Field(id)
	if f == nil {
		return nil, false
	}
	if len(f.Choices) > 0 {
		return f.Choices[0], true
	}
	if f.Type == "boolean" {
		return false, true
	}
	return "", true
}

// InsertCredentialType creates a custom credential type.
func InsertCredentialType(ctx context.Context, tx pgx.Tx, t *CredentialType) error {
	if len(t.Inputs) == 0 {
		t.Inputs = json.RawMessage("{}")
	}
	if len(t.Injectors) == 0 {
		t.Injectors = json.RawMessage("{}")
	}
	return tx.QueryRow(ctx, `INSERT INTO main_credentialtype (created, modified, description, name, kind, managed, inputs, injectors, created_by_id, modified_by_id, namespace)
		VALUES (now(), now(), $1, $2, $3, false, $4, $5, $6, $7, NULL) RETURNING id, created, modified`,
		t.Description, t.Name, t.Kind, []byte(t.Inputs), []byte(t.Injectors), t.CreatedByID, t.ModifiedByID).Scan(&t.ID, &t.Created, &t.Modified)
}

// UpdateCredentialType stores the editable fields of a custom type.
func UpdateCredentialType(ctx context.Context, tx pgx.Tx, t *CredentialType) error {
	return tx.QueryRow(ctx, `UPDATE main_credentialtype SET modified = now(), description = $2, name = $3, kind = $4, inputs = $5, injectors = $6, modified_by_id = $7 WHERE id = $1 RETURNING modified`,
		t.ID, t.Description, t.Name, t.Kind, []byte(t.Inputs), []byte(t.Injectors), t.ModifiedByID).Scan(&t.Modified)
}

// DeleteCredentialType removes a type and whatever referenced it.
func DeleteCredentialType(ctx context.Context, tx pgx.Tx, id int64, cascader *Cascader) error {
	return cascader.Delete(ctx, tx, "main_credentialtype", "id", []int64{id})
}

// Credential is a main_credential row.
type Credential struct {
	ID                                 int64
	Created                            time.Time
	Modified                           time.Time
	Name                               string
	Description                        string
	CreatedByID                        *int64
	ModifiedByID                       *int64
	OrganizationID                     *int64
	Inputs                             json.RawMessage
	CredentialTypeID                   int64
	Managed                            bool
	AdminRoleID, UseRoleID, ReadRoleID *int64
}

// CredentialRoleFields in declaration order.
var CredentialRoleFields = []string{"admin_role", "use_role", "read_role"}

// Roles maps role field to id for the roles that exist.
func (c *Credential) Roles() map[string]int64 {
	out := map[string]int64{}
	for f, id := range map[string]*int64{"admin_role": c.AdminRoleID, "use_role": c.UseRoleID, "read_role": c.ReadRoleID} {
		if id != nil {
			out[f] = *id
		}
	}
	return out
}

// RoleID returns the id of one role field.
func (c *Credential) RoleID(field string) *int64 {
	switch field {
	case "admin_role":
		return c.AdminRoleID
	case "use_role":
		return c.UseRoleID
	case "read_role":
		return c.ReadRoleID
	}
	return nil
}

// InputsMap decodes the stored inputs.
func (c *Credential) InputsMap() map[string]any {
	out := map[string]any{}
	if len(c.Inputs) > 0 {
		_ = json.Unmarshal(c.Inputs, &out)
	}
	if out == nil {
		out = map[string]any{}
	}
	return out
}

// CredentialColumns selects with alias "c".
const CredentialColumns = `c.id, c.created, c.modified, c.name, c.description, c.created_by_id, c.modified_by_id, c.organization_id, c.inputs, c.credential_type_id, c.managed, c.admin_role_id, c.use_role_id, c.read_role_id`

// ScanCredential reads a row produced with CredentialColumns.
func ScanCredential(r pgx.Row) (*Credential, error) {
	c := &Credential{}
	err := r.Scan(&c.ID, &c.Created, &c.Modified, &c.Name, &c.Description, &c.CreatedByID, &c.ModifiedByID, &c.OrganizationID, &c.Inputs, &c.CredentialTypeID, &c.Managed, &c.AdminRoleID, &c.UseRoleID, &c.ReadRoleID)
	if err != nil {
		return nil, err
	}
	return c, nil
}

// GetCredential loads one row.
func GetCredential(ctx context.Context, q db.Querier, id int64) (*Credential, error) {
	return ScanCredential(q.QueryRow(ctx, `SELECT `+CredentialColumns+` FROM main_credential c WHERE c.id = $1`, id))
}

func credentialOrgLookup(c *Credential, orgLookup func(int64) *Organization) ParentLookup {
	return func(spec string) *int64 {
		if c.OrganizationID == nil || !strings.HasPrefix(spec, "organization.") {
			return nil
		}
		org := orgLookup(*c.OrganizationID)
		if org == nil {
			return nil
		}
		return org.RoleID(strings.TrimPrefix(spec, "organization."))
	}
}

// InsertCredential creates the row and its roles. Inputs are stored as
// given; the caller encrypts secrets once the id is known and stores them
// with UpdateCredentialInputs, as the old two-step save did.
func InsertCredential(ctx context.Context, tx pgx.Tx, c *Credential, cts *ContentTypes, factory RoleFactory, orgLookup func(int64) *Organization) error {
	ct := cts.ID("main.credential")
	inputs := c.Inputs
	if len(inputs) == 0 {
		inputs = json.RawMessage("{}")
	}
	err := tx.QueryRow(ctx, `INSERT INTO main_credential (created, modified, description, name, created_by_id, modified_by_id, organization_id, inputs, credential_type_id, managed)
		VALUES (now(), now(), $1, $2, $3, $4, $5, $6, $7, false) RETURNING id, created, modified`,
		c.Description, c.Name, c.CreatedByID, c.ModifiedByID, c.OrganizationID, []byte(inputs), c.CredentialTypeID).Scan(&c.ID, &c.Created, &c.Modified)
	if err != nil {
		return err
	}
	roles, err := factory.CreateRoles(ctx, tx, "credential", ct, c.ID, CredentialRoleFields, credentialOrgLookup(c, orgLookup))
	if err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `UPDATE main_credential SET admin_role_id = $2, use_role_id = $3, read_role_id = $4 WHERE id = $1`, c.ID, roles["admin_role"], roles["use_role"], roles["read_role"]); err != nil {
		return err
	}
	a, u, r := roles["admin_role"], roles["use_role"], roles["read_role"]
	c.AdminRoleID, c.UseRoleID, c.ReadRoleID = &a, &u, &r
	return nil
}

// UpdateCredentialInputs stores the (encrypted) inputs.
func UpdateCredentialInputs(ctx context.Context, q db.Querier, id int64, inputs json.RawMessage) error {
	_, err := q.Exec(ctx, `UPDATE main_credential SET inputs = $2 WHERE id = $1`, id, []byte(inputs))
	return err
}

// UpdateCredential stores the editable fields and relinks the organization
// roles when the organization changed.
func UpdateCredential(ctx context.Context, tx pgx.Tx, c *Credential, orgLookup func(int64) *Organization, orgChanged bool) error {
	inputs := c.Inputs
	if len(inputs) == 0 {
		inputs = json.RawMessage("{}")
	}
	if err := tx.QueryRow(ctx, `UPDATE main_credential SET modified = now(), description = $2, name = $3, modified_by_id = $4, organization_id = $5, inputs = $6, credential_type_id = $7 WHERE id = $1 RETURNING modified`,
		c.ID, c.Description, c.Name, c.ModifiedByID, c.OrganizationID, []byte(inputs), c.CredentialTypeID).Scan(&c.Modified); err != nil {
		return err
	}
	if orgChanged {
		return RelinkParentRole(ctx, tx, "credential", c.Roles(), "organization", credentialOrgLookup(c, orgLookup))
	}
	return nil
}

// DeleteCredential removes the credential, its roles and dependants.
func DeleteCredential(ctx context.Context, tx pgx.Tx, id int64, cts *ContentTypes, cascader *Cascader) error {
	if err := DeleteRolesFor(ctx, tx, cts.ID("main.credential"), id); err != nil {
		return err
	}
	return cascader.Delete(ctx, tx, "main_credential", "id", []int64{id})
}

// CredentialSummary is the {id,name,description,kind,cloud,kubernetes,credential_type_id} block.
type CredentialSummary struct {
	ID               int64
	Name             string
	Description      string
	Kind             string
	Cloud            bool
	Kubernetes       bool
	CredentialTypeID int64
}

// LoadCredentialSummaries returns summaries for ids.
func LoadCredentialSummaries(ctx context.Context, q db.Querier, ids []int64) (map[int64]CredentialSummary, error) {
	out := map[int64]CredentialSummary{}
	if len(ids) == 0 {
		return out, nil
	}
	rows, err := q.Query(ctx, `SELECT c.id, c.name, c.description, COALESCE(ct.namespace, ct.kind), ct.kind, ct.id FROM main_credential c JOIN main_credentialtype ct ON ct.id = c.credential_type_id WHERE c.id = ANY($1)`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var s CredentialSummary
		var typeKind string
		if err := rows.Scan(&s.ID, &s.Name, &s.Description, &s.Kind, &typeKind, &s.CredentialTypeID); err != nil {
			return nil, err
		}
		s.Cloud = typeKind == "cloud"
		s.Kubernetes = typeKind == "kubernetes"
		out[s.ID] = s
	}
	return out, rows.Err()
}

// CredentialInputSource is a main_credentialinputsource row.
type CredentialInputSource struct {
	ID                 int64
	Created            time.Time
	Modified           time.Time
	Description        string
	InputFieldName     string
	Metadata           json.RawMessage
	CreatedByID        *int64
	ModifiedByID       *int64
	SourceCredentialID int64
	TargetCredentialID int64
}

// CredentialInputSourceColumns selects with alias "cis".
const CredentialInputSourceColumns = `cis.id, cis.created, cis.modified, cis.description, cis.input_field_name, cis.metadata, cis.created_by_id, cis.modified_by_id, cis.source_credential_id, cis.target_credential_id`

// ScanCredentialInputSource reads a row produced with CredentialInputSourceColumns.
func ScanCredentialInputSource(r pgx.Row) (*CredentialInputSource, error) {
	s := &CredentialInputSource{}
	err := r.Scan(&s.ID, &s.Created, &s.Modified, &s.Description, &s.InputFieldName, &s.Metadata, &s.CreatedByID, &s.ModifiedByID, &s.SourceCredentialID, &s.TargetCredentialID)
	if err != nil {
		return nil, err
	}
	return s, nil
}
