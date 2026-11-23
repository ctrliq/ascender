package web

import (
	"encoding/json"
	"net/http"
	"net/url"
	"sort"
	"strings"

	"github.com/ctrliq/ascender/internal/api"
	"github.com/ctrliq/ascender/internal/i18n"
)

var credentialSearchKeys = []map[string]string{
	{"name": "Name", "key": "name__icontains"},
	{"name": "Description", "key": "description__icontains"},
	{"name": "Created By (Username)", "key": "created_by__username__icontains"},
	{"name": "Modified By (Username)", "key": "modified_by__username__icontains"},
	{"name": "Credential Type", "key": "credential_type__search"},
}

var credentialFilterLabels = searchLabels(credentialSearchKeys, "credential_type__kind", "Credential Type")

var credentialTypeSearchKeys = []map[string]string{
	{"name": "Name", "key": "name__icontains"},
	{"name": "Description", "key": "description__icontains"},
	{"name": "Created By (Username)", "key": "created_by__username__icontains"},
	{"name": "Modified By (Username)", "key": "modified_by__username__icontains"},
}

var credentialTypeFilterLabels = searchLabels(credentialTypeSearchKeys)

// credField is one input of a credential type, as the form renders it.
type credField struct {
	ID        string
	Label     string
	Type      string
	Format    string
	HelpText  string
	Secret    bool
	Multiline bool
	Ask       bool
	Required  bool
	Choices   []string
}

// credValue is the current value of one input on the form.
type credValue struct {
	Value     string
	Encrypted bool
	Ask       bool
	Bool      bool
	// Plugin is the hidden plugin.<field> input's JSON when the field is
	// looked up from another credential.
	Plugin string
}

// credTypeForm is everything the type details sub-form of one credential
// type needs.
type credTypeForm struct {
	ID         int64
	Name       string
	Kind       string
	Namespace  string
	Fields     []credField
	BoolFields []credField
	Values     map[string]credValue
	// Test is what the external test modal needs of an external type:
	// its field ids, metadata fields and required list, as JSON.
	Test string
	// Workload marks the types the platform signs tokens for, and Lookup
	// those of them that look secrets up as the job.
	Workload, Lookup bool
}

// parseCredType reads the fields of a credential type from its API JSON.
func parseCredType(t map[string]any) credTypeForm {
	out := credTypeForm{ID: int64(num(t["id"])), Name: str(t["name"]), Kind: str(t["kind"]), Namespace: str(t["namespace"]), Values: map[string]credValue{}}
	out.Workload, out.Lookup = isWorkloadIdentityType(out.Namespace), workloadIdentityLookups[out.Namespace]
	required := map[string]bool{}
	for _, r := range toList(dig(t, "inputs", "required")) {
		required[str(r)] = true
	}
	for _, fr := range toList(dig(t, "inputs", "fields")) {
		fm, _ := fr.(map[string]any)
		if fm == nil {
			continue
		}
		f := credField{ID: str(fm["id"]), Label: str(fm["label"]), Type: str(fm["type"]), Format: str(fm["format"]), HelpText: str(fm["help_text"]),
			Secret: fm["secret"] == true, Multiline: fm["multiline"] == true, Ask: fm["ask_at_runtime"] == true, Required: required[str(fm["id"])]}
		if f.Type == "" {
			f.Type = "string"
		}
		for _, c := range toList(fm["choices"]) {
			f.Choices = append(f.Choices, str(c))
		}
		if f.Type == "boolean" {
			out.BoolFields = append(out.BoolFields, f)
			out.Values[f.ID] = credValue{Bool: fm["default"] == true}
			continue
		}
		out.Fields = append(out.Fields, f)
		v := credValue{}
		if d, ok := fm["default"]; ok {
			v.Value = str(d)
		} else if len(f.Choices) > 0 {
			v.Value = f.Choices[0]
		}
		out.Values[f.ID] = v
	}
	if out.Kind == "external" {
		var ids []string
		for _, fr := range toList(dig(t, "inputs", "fields")) {
			if fm, ok := fr.(map[string]any); ok {
				ids = append(ids, str(fm["id"]))
			}
		}
		meta := toList(dig(t, "inputs", "metadata"))
		if meta == nil {
			meta = []any{}
		}
		req := toList(dig(t, "inputs", "required"))
		if req == nil {
			req = []any{}
		}
		b, _ := json.Marshal(map[string]any{"fields": ids, "metadata": meta, "required": req, "namespace": out.Namespace})
		out.Test = string(b)
	}
	return out
}

func toList(v any) []any {
	l, _ := v.([]any)
	return l
}

// applyCredValues fills the form values from a credential's inputs.
func (tf *credTypeForm) applyCredValues(inputs map[string]any) {
	for id, v := range tf.Values {
		raw, ok := inputs[id]
		if !ok {
			continue
		}
		switch t := raw.(type) {
		case bool:
			v.Bool = t
		case string:
			switch {
			case t == "$encrypted$":
				v.Encrypted = true
				v.Value = ""
			case t == "ASK":
				v.Ask = true
				v.Value = ""
			default:
				v.Value = t
			}
		default:
			v.Value = str(raw)
		}
		tf.Values[id] = v
	}
}

func (u *UI) registerCredentials(mux *http.ServeMux) {
	mux.HandleFunc("/credentials", u.protected(u.credentialList))
	mux.HandleFunc("/credentials/{$}", u.protected(u.credentialList))
	mux.HandleFunc("/credentials/add", u.protected(u.credentialAdd))
	mux.HandleFunc("/credentials/{id}", u.protected(toDetails))
	for _, tab := range []string{"details", "access", "job_templates"} {
		mux.HandleFunc("/credentials/{id}/"+tab, u.protected(u.credentialDetail))
	}
	mux.HandleFunc("/credentials/{id}/edit", u.protected(u.credentialEdit))
	mux.HandleFunc("/credential_types", u.protected(u.credentialTypeList))
	mux.HandleFunc("/credential_types/{$}", u.protected(u.credentialTypeList))
	mux.HandleFunc("/credential_types/add", u.protected(u.credentialTypeAdd))
	mux.HandleFunc("/credential_types/{id}", u.protected(toDetails))
	mux.HandleFunc("/credential_types/{id}/details", u.protected(u.credentialTypeDetail))
	mux.HandleFunc("/credential_types/{id}/edit", u.protected(u.credentialTypeEdit))
}

func (u *UI) credentialList(w http.ResponseWriter, r *http.Request, uc *userContext) {
	p := u.newPage(r, uc, "Credentials")
	if err := u.listPage(r, p, "credential", "/api/v2/credentials/", url.Values{"order_by": {"name"}}, credentialFilterLabels); err != nil {
		u.api.Log.ErrorContext(r.Context(), "credential list", "err", err)
	}
	p.Data["searchKeys"] = credentialSearchKeys
	u.render(w, r, "credentials_list", p)
}

func (u *UI) loadCredential(w http.ResponseWriter, r *http.Request, uc *userContext) (map[string]any, bool) {
	return u.loadObject(w, r, uc, "/api/v2/credentials/"+r.PathValue("id")+"/")
}

func (u *UI) loadCredentialTypes(r *http.Request) []map[string]any {
	var out []map[string]any
	for _, it := range u.listResults(r, "/api/v2/credential_types/?page_size=200&order_by=name") {
		if m, ok := it.(map[string]any); ok {
			out = append(out, m)
		}
	}
	sort.SliceStable(out, func(i, j int) bool {
		return strings.ToLower(str(out[i]["name"])) < strings.ToLower(str(out[j]["name"]))
	})
	return out
}

// fieldDetail is one row of the credential detail list.
type fieldDetail struct {
	ID    string
	Label string
	Value string
	Help  string
	Muted bool
	// Source is the credential chip of a looked-up field, and Metadata
	// the lookup's metadata as the detail's code editor showed it.
	Source   map[string]any
	Metadata string
}

func (u *UI) credentialDetail(w http.ResponseWriter, r *http.Request, uc *userContext) {
	cred, ok := u.loadCredential(w, r, uc)
	if !ok {
		return
	}
	tab := lastPathSegment(r)
	titles := map[string]string{"details": "Details", "access": "Access", "job_templates": "Job Templates"}
	p := u.newPage(r, uc, titles[tab])
	p.Nav = navigation(uc, "/credentials")
	p.Data["credential"] = cred
	p.Data["tab"] = tab
	p.Data["credTabs"] = credentialTabs(cred)
	if tab == "access" {
		u.accessTab(r, p, "/api/v2/credentials/"+str(cred["id"])+"/", cred)
	}
	if tab == "job_templates" {
		id := str(cred["id"])
		u.relatedTemplatesTab(r, p, url.Values{"credentials__id": {id}}, map[string]string{"resource_id": id, "resource_name": str(cred["name"]), "resource_type": "credentials", "resource_kind": str(cred["kind"])})
	}
	if tab == "details" {
		if res, err := u.apiCall(r, "GET", "/api/v2/credential_types/"+str(cred["credential_type"])+"/", nil); err == nil && res.Status == 200 {
			tf := parseCredType(res.Data)
			inputs, _ := cred["inputs"].(map[string]any)
			sources := u.credentialInputSources(r, str(cred["id"]))
			var details []fieldDetail
			for _, f := range tf.Fields {
				if src, ok := sources[f.ID]; ok {
					sc, _ := dig(src, "summary_fields", "source_credential").(map[string]any)
					details = append(details, fieldDetail{ID: f.ID, Label: f.Label + " *", Help: f.HelpText, Source: map[string]any{"name": str(sc["name"]), "kind_label": localCredKindLabel(p.Loc, sc)},
						Metadata: jsonbIndent(src["metadata"])})
					p.Data["hasInputSources"] = true
					p.Data["editor"] = true
					continue
				}
				raw, has := inputs[f.ID]
				if !has || raw == nil || raw == "" {
					continue
				}
				d := fieldDetail{ID: f.ID, Label: f.Label, Help: f.HelpText, Value: str(raw)}
				if raw == "$encrypted$" {
					d.Value, d.Muted = p.Loc.T("Encrypted"), true
				} else if f.Ask && raw == "ASK" {
					d.Value = p.Loc.T("Prompt on launch")
				}
				details = append(details, d)
			}
			var enabled []string
			for _, f := range tf.BoolFields {
				if inputs[f.ID] == true {
					enabled = append(enabled, f.Label)
				}
			}
			p.Data["fieldDetails"] = details
			p.Data["enabledOptions"] = enabled
			p.Data["credType"] = res.Data
		}
	}
	u.render(w, r, "credentials_detail", p)
}

// localCredKindLabel is credKindLabel in the page's language: CredentialChip
// translated "Cloud" and "GPG Public Key", not the kinds it title-cased.
func localCredKindLabel(loc *i18n.Locale, c map[string]any) string {
	l := credKindLabel(c)
	if l == "Cloud" || l == "GPG Public Key" {
		return loc.T(l)
	}
	return l
}

// credentialFormData prepares the type sub-forms for the add/edit page.
func (u *UI) credentialFormData(r *http.Request, p *page, cred map[string]any) {
	p.Data["editor"] = false
	var forms []credTypeForm
	var sources map[string]map[string]any
	if cred != nil {
		sources = u.credentialInputSources(r, str(cred["id"]))
		p.Data["inputSources"] = sources
	}
	workload := false
	for _, t := range u.loadCredentialTypes(r) {
		tf := parseCredType(t)
		if cred != nil {
			if tf.ID != int64(num(cred["credential_type"])) {
				continue
			}
			inputs, _ := cred["inputs"].(map[string]any)
			tf.applyCredValues(inputs)
			for field, src := range sources {
				if v, ok := tf.Values[field]; ok {
					v.Plugin = pluginValue(src)
					tf.Values[field] = v
				}
			}
		}
		if isWorkloadIdentityType(tf.Namespace) {
			workload = true
		}
		forms = append(forms, tf)
	}
	p.Data["typeForms"] = forms
	if workload {
		p.Data["workloadIdentity"] = u.workloadIdentityIssuer(r)
	}
}

// credentialFromPost builds the API payload from the form.
func (u *UI) credentialFromPost(r *http.Request, forms []credTypeForm, editing bool, existing map[string]any) (map[string]any, map[string]any, []credTypeForm, map[string]*pluginInput) {
	f := r.PostForm
	typeID := atoiDefault(f.Get("credential_type"), 0)
	payload := map[string]any{"name": f.Get("name"), "description": f.Get("description")}
	if !editing {
		payload["credential_type"] = typeID
	}
	if id := strings.TrimSpace(f.Get("organization")); id != "" {
		payload["organization"] = atoiDefault(id, 0)
	} else if !editing {
		payload["user"] = int64(num(dig(existing, "_me_id")))
	} else {
		payload["organization"] = nil
	}
	inputs := map[string]any{}
	plugins := map[string]*pluginInput{}
	existingInputs, _ := dig(existing, "inputs").(map[string]any)
	for i := range forms {
		tf := &forms[i]
		if tf.ID != int64(typeID) {
			continue
		}
		for _, fld := range tf.Fields {
			var v credValue
			// A field looked up from another credential is saved as an
			// input source, not with the credential's inputs.
			if p, ok := parsePluginInput(f.Get("plugin." + fld.ID)); ok {
				plugins[fld.ID] = p
				tf.Values[fld.ID] = credValue{Plugin: f.Get("plugin." + fld.ID)}
				continue
			}
			if fld.Ask && f.Get("passwordPrompts."+fld.ID) == "on" {
				inputs[fld.ID] = "ASK"
				v = credValue{Ask: true}
			} else if _, submitted := f["inputs."+fld.ID]; submitted {
				val := f.Get("inputs." + fld.ID)
				if fld.Multiline {
					val = strings.ReplaceAll(val, "\r\n", "\n")
				}
				inputs[fld.ID] = val
				v = credValue{Value: val}
			} else if editing && fld.Secret && existingInputs[fld.ID] == "$encrypted$" {
				inputs[fld.ID] = "$encrypted$"
				v = credValue{Encrypted: true}
			} else {
				inputs[fld.ID] = ""
				v = credValue{}
			}
			tf.Values[fld.ID] = v
		}
		for _, fld := range tf.BoolFields {
			on := f.Get("inputs."+fld.ID) == "on"
			inputs[fld.ID] = on
			tf.Values[fld.ID] = credValue{Bool: on}
		}
	}
	payload["inputs"] = inputs
	values := map[string]any{"name": f.Get("name"), "description": f.Get("description"), "credential_type": typeID,
		"organization": map[string]any{"id": f.Get("organization"), "name": f.Get("organization_name")}}
	return payload, values, forms, plugins
}

func (u *UI) credentialAdd(w http.ResponseWriter, r *http.Request, uc *userContext) {
	p := u.newPage(r, uc, "Create New Credential")
	p.Nav = navigation(uc, "/credentials")
	u.credentialFormData(r, p, nil)
	forms := p.Data["typeForms"].([]credTypeForm)
	if r.Method == http.MethodPost {
		payload, values, forms, plugins := u.credentialFromPost(r, forms, false, map[string]any{"_me_id": uc.Me["id"]})
		p.Data["typeForms"] = forms
		u.submitForm(w, r, p, "credentials_form", "POST", "/api/v2/credentials/", payload, values, "/credentials/{id}/details", func(cred map[string]any) *apiResult {
			return u.saveInputSources(r, str(cred["id"]), plugins, nil)
		})
		return
	}
	p.Data["values"] = map[string]any{"name": "", "description": "", "credential_type": 0, "organization": map[string]any{"id": "", "name": ""}}
	u.render(w, r, "credentials_form", p)
}

func (u *UI) credentialEdit(w http.ResponseWriter, r *http.Request, uc *userContext) {
	cred, ok := u.loadCredential(w, r, uc)
	if !ok {
		return
	}
	p := u.newPage(r, uc, "Edit Details")
	p.Nav = navigation(uc, "/credentials")
	p.Data["credential"] = cred
	u.credentialFormData(r, p, cred)
	forms := p.Data["typeForms"].([]credTypeForm)
	if r.Method == http.MethodPost {
		payload, values, forms, plugins := u.credentialFromPost(r, forms, true, cred)
		existing, _ := p.Data["inputSources"].(map[string]map[string]any)
		p.Data["typeForms"] = forms
		u.submitForm(w, r, p, "credentials_form", "PATCH", "/api/v2/credentials/"+str(cred["id"])+"/", payload, values, "/credentials/"+str(cred["id"])+"/details", func(map[string]any) *apiResult {
			return u.saveInputSources(r, str(cred["id"]), plugins, existing)
		})
		return
	}
	p.Data["values"] = map[string]any{"name": str(cred["name"]), "description": str(cred["description"]), "credential_type": int64(num(cred["credential_type"])), "organization": refValue(cred, "organization")}
	u.render(w, r, "credentials_form", p)
}

// --- credential types ---------------------------------------------------------

func (u *UI) credentialTypeList(w http.ResponseWriter, r *http.Request, uc *userContext) {
	p := u.newPage(r, uc, "Credential Types")
	if err := u.listPage(r, p, "credential-type", "/api/v2/credential_types/", url.Values{"order_by": {"name"}, "managed": {"false"}}, credentialTypeFilterLabels); err != nil {
		u.api.Log.ErrorContext(r.Context(), "credential type list", "err", err)
	}
	p.Data["searchKeys"] = credentialTypeSearchKeys
	u.render(w, r, "credential_types_list", p)
}

func (u *UI) loadCredentialType(w http.ResponseWriter, r *http.Request, uc *userContext) (map[string]any, bool) {
	res := u.loadResult(w, r, uc, "/api/v2/credential_types/"+r.PathValue("id")+"/")
	if res == nil {
		return nil, false
	}
	res.Data["_inputs_json"] = orderedJSONField(res.Raw, "inputs")
	res.Data["_injectors_json"] = orderedJSONField(res.Raw, "injectors")
	return res.Data, true
}

// orderedJSONField returns one JSON object field of an API response as text,
// keeping the key order the API sent (map decoding would sort it).
func orderedJSONField(raw []byte, key string) string {
	o := api.NewOMap()
	if err := o.UnmarshalJSON(raw); err != nil {
		return "{}"
	}
	v, ok := o.Get(key)
	if !ok || v == nil {
		return "{}"
	}
	b, err := json.Marshal(v)
	if err != nil {
		return "{}"
	}
	return string(b)
}

func (u *UI) credentialTypeDetail(w http.ResponseWriter, r *http.Request, uc *userContext) {
	t, ok := u.loadCredentialType(w, r, uc)
	if !ok {
		return
	}
	p := u.newPage(r, uc, "Details")
	p.Nav = navigation(uc, "/credential_types")
	p.Data["credType"] = t
	p.Data["inputsJSON"] = str(t["_inputs_json"])
	p.Data["injectorsJSON"] = str(t["_injectors_json"])
	p.Data["editor"] = true
	var inUse int
	if res, err := u.apiCall(r, "GET", "/api/v2/credential_types/"+str(t["id"])+"/credentials/?page_size=1", nil); err == nil && res.Status == 200 {
		inUse = num(res.Data["count"])
	}
	p.Data["inUse"] = inUse
	u.render(w, r, "credential_types_detail", p)
}

func credentialTypeFormValues(t map[string]any) map[string]any {
	return map[string]any{"name": str(t["name"]), "description": str(t["description"]), "inputs": str(t["_inputs_json"]), "injectors": str(t["_injectors_json"])}
}

// credentialTypeFromPost converts the YAML/JSON editors to API objects.
func credentialTypeFromPost(r *http.Request) (map[string]any, map[string]any, map[string][]string) {
	f := r.PostForm
	payload := map[string]any{"name": f.Get("name"), "description": f.Get("description"), "kind": "cloud"}
	values := map[string]any{"name": f.Get("name"), "description": f.Get("description"), "inputs": formText(f, "inputs"), "injectors": formText(f, "injectors")}
	errs := map[string][]string{}
	for _, key := range []string{"inputs", "injectors"} {
		text := strings.TrimSpace(formText(f, key))
		if text == "" || text == "---" {
			payload[key] = map[string]any{}
			continue
		}
		obj, err := api.VarsToJSON(text)
		if err != nil {
			errs[key] = []string{err.Error()}
			continue
		}
		payload[key] = obj
	}
	return payload, values, errs
}

func (u *UI) credentialTypeAdd(w http.ResponseWriter, r *http.Request, uc *userContext) {
	p := u.newPage(r, uc, "Create new credential type")
	p.Nav = navigation(uc, "/credential_types")
	p.Data["editor"] = true
	if r.Method == http.MethodPost {
		payload, values, errs := credentialTypeFromPost(r)
		if len(errs) > 0 {
			u.renderForm(w, r, p, "credential_types_form", values, errs)
			return
		}
		u.submitForm(w, r, p, "credential_types_form", "POST", "/api/v2/credential_types/", payload, values, "/credential_types/{id}/details")
		return
	}
	p.Data["values"] = map[string]any{"name": "", "description": "", "inputs": "---", "injectors": "---"}
	u.render(w, r, "credential_types_form", p)
}

func (u *UI) credentialTypeEdit(w http.ResponseWriter, r *http.Request, uc *userContext) {
	t, ok := u.loadCredentialType(w, r, uc)
	if !ok {
		return
	}
	p := u.newPage(r, uc, "Edit Details")
	p.Nav = navigation(uc, "/credential_types")
	p.Data["credType"] = t
	p.Data["editor"] = true
	if r.Method == http.MethodPost {
		payload, values, errs := credentialTypeFromPost(r)
		delete(payload, "kind")
		if len(errs) > 0 {
			u.renderForm(w, r, p, "credential_types_form", values, errs)
			return
		}
		u.submitForm(w, r, p, "credential_types_form", "PATCH", "/api/v2/credential_types/"+str(t["id"])+"/", payload, values, "/credential_types/"+str(t["id"])+"/details")
		return
	}
	p.Data["values"] = credentialTypeFormValues(t)
	u.render(w, r, "credential_types_form", p)
}

// noJobTemplatesTab are the credential kinds Credential.tsx gave no Job
// Templates tab (unacceptableCredentialTypes).
var noJobTemplatesTab = map[string]bool{"centrify_vault_kv": true, "aim": true, "conjur": true, "hashivault_kv": true, "hashivault_ssh": true, "hashivault_kv_oidc": true,
	"hashivault_ssh_oidc": true, "azure_kv": true, "thycotic_dsv": true, "thycotic_tss": true, "galaxy_api_token": true, "registry": true, "scm": true}

func credentialTabs(cred map[string]any) []map[string]string {
	id := str(cred["id"])
	tabs := []map[string]string{
		{"key": "details", "href": "/credentials/" + id + "/details", "label": "Details"},
		{"key": "access", "href": "/credentials/" + id + "/access", "label": "Access"},
	}
	if !noJobTemplatesTab[str(cred["kind"])] {
		tabs = append(tabs, map[string]string{"key": "job_templates", "href": "/credentials/" + id + "/job_templates", "label": "Job Templates"})
	}
	return tabs
}
