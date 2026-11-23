package web

// Helpers shared by the add and edit forms.

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
)

// refValue reads a related object as {id, name} from either a posted form
// (id + name fields) or an API object (summary_fields).
func refValue(data map[string]any, key string) map[string]any {
	if sf := dig(data, "summary_fields", key); sf != nil {
		m, _ := sf.(map[string]any)
		if m != nil {
			return map[string]any{"id": str(m["id"]), "name": str(m["name"])}
		}
	}
	if m, ok := data[key].(map[string]any); ok {
		return map[string]any{"id": str(m["id"]), "name": str(m["name"])}
	}
	return map[string]any{"id": "", "name": ""}
}

// submitForm saves a form's payload through the API: POST expects a 201,
// anything else a 200. Then after, when given, makes the follow-up saves
// (relations), and its failure is shown like the save's own. On success it
// redirects to done, with "{id}" replaced by the saved object's id;
// otherwise it renders the form page again with the errors and the posted
// values.
func (u *UI) submitForm(w http.ResponseWriter, r *http.Request, p *page, tmpl, method, apiPath string, payload any, values map[string]any, done string, after ...func(saved map[string]any) *apiResult) {
	res, err := u.apiCall(r, method, apiPath, payload)
	want := http.StatusOK
	if method == http.MethodPost {
		want = http.StatusCreated
	}
	if err == nil && res.Status == want {
		for _, fn := range after {
			if failed := fn(res.Data); failed != nil {
				u.renderForm(w, r, p, tmpl, values, formWideUnknown(apiErrors(failed), values))
				return
			}
		}
		http.Redirect(w, r, strings.ReplaceAll(done, "{id}", str(res.Data["id"])), http.StatusFound)
		return
	}
	u.renderForm(w, r, p, tmpl, values, apiErrors(res))
}

// formWideUnknown moves the errors of keys the form has no value for to the
// form-wide errors, as sortErrorMessages did: a related save (a label
// needing an organization, an attach the API refused) answers for fields
// the form does not show, and its error would otherwise be lost.
func formWideUnknown(errs map[string][]string, values map[string]any) map[string][]string {
	for k, v := range errs {
		if k == "__all__" {
			continue
		}
		if _, ok := values[k]; !ok {
			errs["__all__"] = append(errs["__all__"], v...)
			delete(errs, k)
		}
	}
	return errs
}

// renderForm renders a form page again with its errors and posted values.
func (u *UI) renderForm(w http.ResponseWriter, r *http.Request, p *page, tmpl string, values map[string]any, errs map[string][]string) {
	p.Errors = errs
	p.Data["values"] = values
	u.render(w, r, tmpl, p)
}

// The form-wide errors apiErrors makes up itself, in English: render
// translates them (localizeErrors), as apiErrors has no page to hand.
const (
	errUnexpected    = "An unexpected error occurred."
	errRequestFailed = "Request failed with status %d."
)

// apiErrors converts an API error body into field errors for the form.
func apiErrors(res *apiResult) map[string][]string {
	out := map[string][]string{}
	if res == nil {
		out["__all__"] = []string{errUnexpected}
		return out
	}
	if res.Data == nil {
		out["__all__"] = []string{fmt.Sprintf(errRequestFailed, res.Status)}
		return out
	}
	for k, v := range res.Data {
		// FormSubmitError showed a request's detail and non-field errors
		// above the actions, with the form-wide errors.
		key := k
		if k == "detail" || k == "non_field_errors" {
			key = "__all__"
		}
		switch t := v.(type) {
		case []any:
			for _, m := range t {
				out[key] = append(out[key], str(m))
			}
		case string:
			out[key] = append(out[key], t)
		default:
			out[key] = append(out[key], str(t))
		}
	}
	return out
}

// localizeErrors translates the form-wide errors apiErrors made up; the
// API's own messages are left as they came.
func localizeErrors(p *page) {
	all := p.Errors["__all__"]
	if len(all) != 1 || p.Loc == nil {
		return
	}
	var status int
	switch {
	case all[0] == errUnexpected:
		p.Errors["__all__"] = []string{p.Loc.T("An unexpected error occurred.")}
	case strings.HasPrefix(all[0], "Request failed with status "):
		if _, err := fmt.Sscanf(all[0], errRequestFailed, &status); err == nil && fmt.Sprintf(errRequestFailed, status) == all[0] {
			p.Errors["__all__"] = []string{p.Loc.T("Request failed with status {0}.", "0", status)}
		}
	}
}

func atoiDefault(s string, def int) int {
	n, err := strconv.Atoi(strings.TrimSpace(s))
	if err != nil {
		return def
	}
	return n
}
