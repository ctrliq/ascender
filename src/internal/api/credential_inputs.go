package api

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strings"

	"github.com/ctrliq/ascender/internal/crypto"
	"github.com/ctrliq/ascender/internal/models"
)

// inputsError is the 400 body the old CredentialInputField produced: a list
// of general messages, or a map of field id to messages.
func inputsError(general []string, fields map[string][]string) error {
	if len(general) > 0 {
		return &APIError{Status: http.StatusBadRequest, Body: map[string]any{"inputs": general}}
	}
	return &APIError{Status: http.StatusBadRequest, Body: map[string]any{"inputs": fields}}
}

// pyRepr renders a JSON value the way Python's repr did in jsonschema
// messages.
func pyRepr(v any) string {
	switch t := v.(type) {
	case nil:
		return "None"
	case bool:
		if t {
			return "True"
		}
		return "False"
	case string:
		if strings.Contains(t, "'") && !strings.Contains(t, `"`) {
			return `"` + t + `"`
		}
		return "'" + strings.ReplaceAll(t, "'", `\'`) + "'"
	case json.Number:
		return t.String()
	case float64:
		if t == float64(int64(t)) {
			return fmt.Sprintf("%d", int64(t))
		}
		return fmt.Sprint(t)
	case []any:
		parts := make([]string, len(t))
		for i, x := range t {
			parts[i] = pyRepr(x)
		}
		return "[" + strings.Join(parts, ", ") + "]"
	case map[string]any:
		keys := make([]string, 0, len(t))
		for k := range t {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		parts := make([]string, len(keys))
		for i, k := range keys {
			parts[i] = pyRepr(k) + ": " + pyRepr(t[k])
		}
		return "{" + strings.Join(parts, ", ") + "}"
	case *OMap:
		parts := make([]string, 0, t.Len())
		for _, k := range t.Keys() {
			x, _ := t.Get(k)
			parts = append(parts, pyRepr(k)+": "+pyRepr(x))
		}
		return "{" + strings.Join(parts, ", ") + "}"
	}
	return fmt.Sprint(v)
}

func isJSONString(v any) bool { _, ok := v.(string); return ok }

// plainValue converts decoded request values (ordered maps) into plain maps
// and slices for validation.
func plainValue(v any) any {
	switch t := v.(type) {
	case *OMap:
		out := map[string]any{}
		for _, k := range t.Keys() {
			val, _ := t.Get(k)
			out[k] = plainValue(val)
		}
		return out
	case map[string]any:
		out := map[string]any{}
		for k, val := range t {
			out[k] = plainValue(val)
		}
		return out
	case []any:
		out := make([]any, len(t))
		for i, x := range t {
			out[i] = plainValue(x)
		}
		return out
	}
	return v
}

// orderedJSON decodes stored JSON keeping the key order the database
// rendered, which is what the old API returned.
func orderedJSON(raw json.RawMessage) any {
	var v any
	dec := json.NewDecoder(strings.NewReader(string(raw)))
	dec.UseNumber()
	if err := decodeValue(dec, &v); err != nil {
		return nil
	}
	return v
}

// validateCredentialInputs checks and normalises the inputs of a credential
// against its type, as CredentialInputField.validate did. existing holds the
// stored (encrypted) inputs when updating.
func (s *Server) validateCredentialInputs(ct *models.CredentialType, raw any, existing map[string]any, pk *int64) (map[string]any, error) {
	schema := ct.ParsedInputs()
	if raw == nil {
		raw = map[string]any{}
	}
	raw = plainValue(raw)
	inputs, ok := raw.(map[string]any)
	if !ok {
		return nil, inputsError([]string{fmt.Sprintf("%s provided, expected dict", pyTypeName(raw))}, nil)
	}
	out := map[string]any{}
	for k, v := range inputs {
		out[k] = v
	}
	// Unknown keys.
	var extra []string
	for k := range out {
		if f := schema.Field(k); f == nil || f.Internal {
			extra = append(extra, k)
		}
	}
	if len(extra) > 0 {
		sort.Strings(extra)
		quoted := make([]string, len(extra))
		for i, k := range extra {
			quoted[i] = "'" + k + "'"
		}
		verb := "was"
		if len(extra) > 1 {
			verb = "were"
		}
		return nil, inputsError([]string{fmt.Sprintf("Additional properties are not allowed (%s %s unexpected)", strings.Join(quoted, ", "), verb)}, nil)
	}
	// Defaults for unset values.
	for k, v := range out {
		if !pyTruthy(v) {
			if d, ok := schema.DefaultFor(k); ok {
				out[k] = d
			}
		}
	}
	// Secrets: "$encrypted$" keeps the stored value on update and is
	// rejected on create; secret values must be strings.
	decrypted := map[string]any{}
	for k, v := range out {
		if schema.IsSecret(k) {
			if v == "$encrypted$" {
				if pk == nil {
					return nil, inputsError([]string{fmt.Sprintf("$encrypted$ is a reserved keyword, and cannot be used for %s.", k)}, nil)
				}
				if ev, ok := existing[k]; ok {
					out[k] = ev
					if es, ok := ev.(string); ok {
						plain, err := crypto.DecryptField(s.Cfg.SecretKey, k, pk, es)
						if err != nil {
							return nil, err
						}
						decrypted[k] = plain
					} else {
						decrypted[k] = ev
					}
				} else {
					delete(out, k)
				}
				continue
			}
			if !isJSONString(v) {
				return nil, inputsError([]string{fmt.Sprintf("secret values must be of type string, not %s", pyTypeName(v))}, nil)
			}
		}
		decrypted[k] = v
	}
	fieldErrs := map[string][]string{}
	addErr := func(id, msg string) {
		if _, ok := fieldErrs[id]; !ok {
			fieldErrs[id] = []string{msg}
		}
	}
	for _, f := range schema.Fields {
		v, present := decrypted[f.ID]
		if !present {
			continue
		}
		switch f.Type {
		case "boolean":
			if _, ok := v.(bool); !ok {
				addErr(f.ID, fmt.Sprintf("%s is not of type 'boolean'", pyRepr(v)))
				continue
			}
		default:
			sv, ok := v.(string)
			if !ok {
				addErr(f.ID, fmt.Sprintf("%s is not of type 'string'", pyRepr(v)))
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
					addErr(f.ID, fmt.Sprintf("%s is not one of %s", pyRepr(sv), pyRepr(choices)))
					continue
				}
			}
			if msg := checkInputFormat(f.Format, sv); msg != "" {
				addErr(f.ID, msg)
			}
		}
	}
	// Dependencies: a field that is set requires the fields it depends on.
	for k, deps := range schema.Dependencies {
		if _, present := decrypted[k]; !present {
			continue
		}
		for _, d := range deps {
			if _, ok := decrypted[d]; !ok {
				label := d
				if df := schema.Field(d); df != nil && df.Label != "" {
					label = df.Label
				}
				addErr(k, fmt.Sprintf(`cannot be set unless "%s" is set`, label))
			}
		}
	}
	// Machine credentials: the passphrase must match the key.
	if ct.Managed && schema.Field("ssh_key_unlock") != nil {
		keyData, _ := decrypted["ssh_key_data"].(string)
		if keyData == "" && pk != nil {
			if es, ok := existing["ssh_key_data"].(string); ok && es != "" {
				if plain, err := crypto.DecryptField(s.Cfg.SecretKey, "ssh_key_data", pk, es); err == nil {
					keyData = plain
				}
			}
		}
		encryptedKey := false
		if keyData != "" {
			if objs, err := validatePEM(keyData, 1, -1); err == nil {
				for _, o := range objs {
					if o.keyEnc {
						encryptedKey = true
					}
				}
			}
		}
		unlock, _ := decrypted["ssh_key_unlock"].(string)
		if _, bad := fieldErrs["ssh_key_data"]; !bad {
			if encryptedKey && unlock == "" {
				addErr("ssh_key_unlock", "must be set when SSH key is encrypted.")
			}
			if keyData != "" && unlock != "" && !encryptedKey {
				addErr("ssh_key_unlock", "should not be set when SSH key is not encrypted.")
			}
		}
	}
	if len(fieldErrs) > 0 {
		return nil, inputsError(nil, fieldErrs)
	}
	return out, nil
}

// checkInputFormat applies the jsonschema format checkers the old field
// registered. Empty and still-encrypted values pass.
func checkInputFormat(format, value string) string {
	switch format {
	case "ssh_private_key":
		if value == "" || value == "$encrypted$" {
			return ""
		}
		v := strings.ReplaceAll(value, `=`, "=")
		if _, err := validatePEM(v, 1, -1); err != nil {
			return err.Error()
		}
	case "url":
		parsed, err := url.Parse(value)
		if err != nil {
			return err.Error()
		}
		if parsed.Scheme == "" {
			return "Invalid URL: Missing url scheme (http, https, etc.)"
		}
		if parsed.Host == "" {
			return "Invalid URL: " + value
		}
	case "vault_id":
		if strings.Contains(value, "@") {
			return "@ is not an allowed character"
		}
	}
	return ""
}

// pemObject is one BEGIN/END block of PEM data.
type pemObject struct {
	typ     string
	keyType string
	keyEnc  bool
	data    string
}

var pemBeginRe = regexp.MustCompile(`^(-{4,}) *BEGIN ([A-Z ]+?) *(-{4,})`)
var pemHeaderRe = regexp.MustCompile(`^(.+?):\s*?(.+?)(\\??)$`)

// validatePEM ports validate_pem: it checks the data holds the required
// number of private keys and certificates and reports which keys are
// encrypted. maxKeys < 0 means no maximum.
func validatePEM(data string, minKeys, maxKeys int) ([]pemObject, error) {
	keyTypes := map[string]string{"RSA": "rsa", "DSA": "dsa", "EC": "ecdsa", "OPENSSH": "ed25519", "": "rsa1"}
	var objs []pemObject
	keyCount := 0
	data = strings.TrimLeft(data, " \t\r\n")
	for data != "" {
		m := pemBeginRe.FindStringSubmatch(data)
		if m == nil || m[1] != m[3] {
			return nil, fmt.Errorf("Invalid certificate or key: %s...", truncate(data, 100))
		}
		dashes, typ := m[1], m[2]
		end := dashes + " END " + typ
		endIdx := -1
		for _, candidate := range []string{dashes + "END " + typ, dashes + " END " + typ} {
			if i := strings.Index(data[len(m[0]):], candidate); i >= 0 && (endIdx < 0 || i < endIdx) {
				endIdx = i
				end = candidate
			}
		}
		if endIdx < 0 {
			return nil, fmt.Errorf("Invalid certificate or key: %s...", truncate(data, 100))
		}
		body := data[len(m[0]) : len(m[0])+endIdx]
		rest := data[len(m[0])+endIdx+len(end):]
		// The END line closes with the same dashes.
		rest = strings.TrimLeft(rest, " ")
		if !strings.HasPrefix(rest, dashes) {
			return nil, fmt.Errorf("Invalid certificate or key: %s...", truncate(data, 100))
		}
		rest = rest[len(dashes):]
		obj := pemObject{typ: typ, data: strings.TrimSpace(body)}
		if strings.HasSuffix(typ, "PRIVATE KEY") {
			keyCount++
			kt := strings.TrimSpace(strings.ReplaceAll(strings.ReplaceAll(typ, "ENCRYPTED PRIVATE KEY", ""), "PRIVATE KEY", ""))
			name, ok := keyTypes[kt]
			if !ok {
				return nil, fmt.Errorf("Invalid private key: unsupported type \"%s\"", kt)
			}
			obj.keyType = name
			obj.typ = "PRIVATE KEY"
		} else if typ != "CERTIFICATE" {
			return nil, fmt.Errorf("Unsupported PEM object type: \"%s\"", typ)
		}
		var b64 strings.Builder
		continues := false
		for _, line := range strings.Split(obj.data, "\n") {
			line = strings.TrimSpace(line)
			if line == "" {
				continue
			}
			if continues {
				continues = strings.HasSuffix(line, `\`)
				continue
			}
			if pemHeaderRe.MatchString(line) {
				continues = strings.HasSuffix(line, `\`)
				continue
			}
			b64.WriteString(line)
		}
		bin, err := base64.StdEncoding.DecodeString(b64.String())
		if err != nil || len(bin) == 0 {
			return nil, fmt.Errorf("Invalid base64-encoded data")
		}
		switch {
		case obj.keyType == "ed25519":
			obj.keyEnc = !strings.HasPrefix(string(bin), "openssh-key-v1\x00\x00\x00\x00\x04none")
		case typ == "ENCRYPTED PRIVATE KEY":
			obj.keyEnc = true
		case obj.keyType != "":
			obj.keyEnc = strings.Contains(obj.data, "ENCRYPTED")
		}
		objs = append(objs, obj)
		data = strings.TrimLeft(rest, " \t\r\n")
	}
	if keyCount < minKeys {
		if minKeys == 1 {
			if maxKeys == minKeys {
				return nil, fmt.Errorf("Exactly one private key is required.")
			}
			return nil, fmt.Errorf("At least one private key is required.")
		}
		return nil, fmt.Errorf("At least %d private keys are required, only %d provided.", minKeys, keyCount)
	}
	if maxKeys >= 0 && keyCount > maxKeys {
		if maxKeys == 1 {
			return nil, fmt.Errorf("Only one private key is allowed, %d provided.", keyCount)
		}
		return nil, fmt.Errorf("No more than %d private keys are allowed, %d provided.", maxKeys, keyCount)
	}
	return objs, nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}

// encryptInputs encrypts the secret fields of validated inputs with the
// credential's primary key, as Credential.save did.
func (s *Server) encryptInputs(ct *models.CredentialType, pk int64, inputs map[string]any) (json.RawMessage, error) {
	schema := ct.ParsedInputs()
	out := map[string]any{}
	for k, v := range inputs {
		out[k] = v
		if !schema.IsSecret(k) {
			continue
		}
		sv, ok := v.(string)
		if !ok {
			continue
		}
		enc, err := crypto.EncryptField(s.Cfg.SecretKey, k, &pk, sv, schema.IsAskable(k))
		if err != nil {
			return nil, err
		}
		if enc == "" {
			delete(out, k)
			continue
		}
		out[k] = enc
	}
	return json.Marshal(out)
}

// decryptInputs returns the plain inputs of a stored credential.
func (s *Server) decryptInputs(ct *models.CredentialType, cred *models.Credential) (map[string]any, error) {
	out := map[string]any{}
	for k, v := range cred.InputsMap() {
		if sv, ok := v.(string); ok && crypto.IsEncrypted(sv) {
			plain, err := crypto.DecryptField(s.Cfg.SecretKey, k, &cred.ID, sv)
			if err != nil {
				return nil, err
			}
			out[k] = plain
			continue
		}
		out[k] = v
	}
	return out, nil
}

// displayInputs masks encrypted values as the API did, keeping the stored
// key order.
func displayInputs(cred *models.Credential) *OMap {
	out := NewOMap()
	if len(cred.Inputs) == 0 {
		return out
	}
	if err := out.UnmarshalJSON(cred.Inputs); err != nil {
		return NewOMap()
	}
	for _, k := range out.Keys() {
		v, _ := out.Get(k)
		if sv, ok := v.(string); ok && strings.HasPrefix(sv, "$encrypted$") {
			out.Set(k, "$encrypted$")
		}
	}
	return out
}
