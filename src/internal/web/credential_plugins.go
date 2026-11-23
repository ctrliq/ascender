package web

import (
	"bytes"
	"encoding/json"
	"net/http"
	"sort"
	"strings"
)

// Credential plugins in the credential form: a field another credential
// looks up (CredentialPluginField) travels in the form as a hidden
// plugin.<field> input holding {"credential": {...}, "inputs": {...},
// "touched": bool}, the shape the old form kept in the field's value, and
// is saved as a credential input source once the credential is.

// pluginInput is one looked-up field as the form posts it.
type pluginInput struct {
	Credential map[string]any `json:"credential"`
	Inputs     map[string]any `json:"inputs"`
	Touched    bool           `json:"touched"`
}

// workloadIdentityLookups are the lookups that log in as the job, and
// workloadIdentityTypes every type the platform signs tokens for.
var workloadIdentityLookups = map[string]bool{"hashivault_kv_oidc": true, "hashivault_ssh_oidc": true}

func isWorkloadIdentityType(ns string) bool {
	return workloadIdentityLookups[ns] || ns == "oidc_workload_identity"
}

// credentialInputSources maps a credential's looked-up fields to their
// input sources.
func (u *UI) credentialInputSources(r *http.Request, credID string) map[string]map[string]any {
	out := map[string]map[string]any{}
	for _, it := range u.listResults(r, "/api/v2/credentials/"+credID+"/input_sources/?page_size=200") {
		if m, ok := it.(map[string]any); ok {
			out[str(m["input_field_name"])] = m
		}
	}
	return out
}

// pluginValue is the hidden input's JSON for a stored input source.
func pluginValue(src map[string]any) string {
	meta, _ := src["metadata"].(map[string]any)
	if meta == nil {
		meta = map[string]any{}
	}
	b, _ := json.Marshal(map[string]any{"credential": dig(src, "summary_fields", "source_credential"), "inputs": meta, "touched": false})
	return string(b)
}

// parsePluginInput reads a posted plugin.<field> value; only one naming a
// credential and carrying its metadata is a lookup (input.credential &&
// input.inputs in the old form).
func parsePluginInput(raw string) (*pluginInput, bool) {
	if strings.TrimSpace(raw) == "" {
		return nil, false
	}
	var p pluginInput
	if err := json.Unmarshal([]byte(raw), &p); err != nil || p.Credential == nil || p.Inputs == nil || num(p.Credential["id"]) == 0 {
		return nil, false
	}
	return &p, true
}

// jsonbIndent renders an object the way the detail page's code editor
// showed it: JSON.stringify(value, null, 2) of what the API returned,
// whose keys PostgreSQL's jsonb had put shortest first.
func jsonbIndent(v any) string {
	var buf bytes.Buffer
	writeJSONB(&buf, v, "")
	return buf.String()
}

func writeJSONB(buf *bytes.Buffer, v any, indent string) {
	switch t := v.(type) {
	case map[string]any:
		if len(t) == 0 {
			buf.WriteString("{}")
			return
		}
		keys := make([]string, 0, len(t))
		for k := range t {
			keys = append(keys, k)
		}
		sort.Slice(keys, func(i, j int) bool {
			if len(keys[i]) != len(keys[j]) {
				return len(keys[i]) < len(keys[j])
			}
			return keys[i] < keys[j]
		})
		buf.WriteString("{\n")
		for i, k := range keys {
			kb, _ := json.Marshal(k)
			buf.WriteString(indent + "  " + string(kb) + ": ")
			writeJSONB(buf, t[k], indent+"  ")
			if i < len(keys)-1 {
				buf.WriteString(",")
			}
			buf.WriteString("\n")
		}
		buf.WriteString(indent + "}")
	case []any:
		if len(t) == 0 {
			buf.WriteString("[]")
			return
		}
		buf.WriteString("[\n")
		for i, it := range t {
			buf.WriteString(indent + "  ")
			writeJSONB(buf, it, indent+"  ")
			if i < len(t)-1 {
				buf.WriteString(",")
			}
			buf.WriteString("\n")
		}
		buf.WriteString(indent + "]")
	default:
		var b bytes.Buffer
		enc := json.NewEncoder(&b)
		enc.SetEscapeHTML(false)
		_ = enc.Encode(t)
		buf.WriteString(strings.TrimSuffix(b.String(), "\n"))
	}
}

// saveInputSources is the second half of the old add and edit screens:
// once the credential is saved, every looked-up field gets an input source
// (a new one, or the old one updated when the lookup was changed), and the
// input sources of fields no longer looked up are deleted.
func (u *UI) saveInputSources(r *http.Request, credID string, plugins map[string]*pluginInput, existing map[string]map[string]any) *apiResult {
	for field, src := range existing {
		if _, still := plugins[field]; still {
			continue
		}
		if res, err := u.apiCall(r, "DELETE", "/api/v2/credential_input_sources/"+str(src["id"])+"/", nil); err != nil || res.Status != 204 {
			return res
		}
	}
	fields := make([]string, 0, len(plugins))
	for f := range plugins {
		fields = append(fields, f)
	}
	sort.Strings(fields)
	for _, field := range fields {
		p := plugins[field]
		if src, ok := existing[field]; ok {
			if !p.Touched {
				continue
			}
			res, err := u.apiCall(r, "PATCH", "/api/v2/credential_input_sources/"+str(src["id"])+"/", map[string]any{"metadata": p.Inputs, "source_credential": p.Credential["id"]})
			if err != nil || res.Status != 200 {
				return res
			}
			continue
		}
		res, err := u.apiCall(r, "POST", "/api/v2/credential_input_sources/", map[string]any{"input_field_name": field, "metadata": p.Inputs,
			"source_credential": p.Credential["id"], "target_credential": atoiDefault(credID, 0)})
		if err != nil || res.Status != 201 {
			return res
		}
	}
	return nil
}

// workloadIdentityIssuer is what WorkloadIdentityInfo read from the
// discovery document: the issuer, or why there is none.
func (u *UI) workloadIdentityIssuer(r *http.Request) map[string]any {
	res, err := u.apiCall(r, "GET", "/api/o/.well-known/openid-configuration", nil)
	switch {
	case err != nil || res == nil:
		return map[string]any{"error": "failed"}
	case res.Status == 404:
		return map[string]any{"error": "unavailable"}
	case res.Status != 200 || str(res.Data["issuer"]) == "":
		return map[string]any{"error": "failed"}
	}
	return map[string]any{"issuer": str(res.Data["issuer"])}
}
