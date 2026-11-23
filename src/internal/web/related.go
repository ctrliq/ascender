package web

import (
	"net/http"
	"net/url"
	"sort"
	"strings"
)

// relatedTemplateSearchKeys are RelatedTemplateList's search columns.
var relatedTemplateSearchKeys = []map[string]string{
	{"name": "Name", "key": "name__icontains"},
	{"name": "Created By (Username)", "key": "created_by__username__icontains"},
	{"name": "Modified By (Username)", "key": "modified_by__username__icontains"},
	{"name": "Playbook name", "key": "job_template__playbook__icontains"},
	{"name": "Label", "key": "labels__name__icontains"},
}

// relatedJobsTab loads JobList for a resource's Jobs tab: the unified jobs
// its defaultParams select, newest finished first, syncs left out.
func (u *UI) relatedJobsTab(r *http.Request, p *page, params url.Values) {
	defaults := url.Values{"order_by": {"-finished"}, "not__launch_type": {"sync"}}
	for k, v := range params {
		defaults[k] = v
	}
	if err := u.listPage(r, p, "job", "/api/v2/unified_jobs/", defaults, jobFilterLabels); err != nil {
		u.api.Log.ErrorContext(r.Context(), "related jobs", "err", err)
	}
	p.Data["searchKeys"] = jobSearchKeys
	p.Data["editor"] = true
}

// relatedTemplatesTab loads RelatedTemplateList: the job templates params
// select, with an Add link that seeds the new template with the resource
// (resource_id, resource_name, resource_type, resource_kind) when given.
func (u *UI) relatedTemplatesTab(r *http.Request, p *page, params url.Values, resource map[string]string) {
	defaults := url.Values{"order_by": {"name"}}
	for k, v := range params {
		defaults[k] = v
	}
	if err := u.listPage(r, p, "template", "/api/v2/job_templates/", defaults, templateFilterLabels); err != nil {
		u.api.Log.ErrorContext(r.Context(), "related templates", "err", err)
	}
	p.Data["searchKeys"] = relatedTemplateSearchKeys
	if res, err := u.apiCall(r, "OPTIONS", "/api/v2/job_templates/", nil); err == nil && dig(res.Data, "actions", "POST") != nil {
		href := "/templates/job_template/add"
		if resource != nil {
			href = "/templates/job_template/add/?" + encodeQueryString(resource)
		}
		p.Data["relatedAddHref"] = href
	}
}

// encodeQueryString is util/qs's: keys sorted, empty ones left out, each
// part encoded as encodeURIComponent did.
func encodeQueryString(params map[string]string) string {
	keys := make([]string, 0, len(params))
	for k, v := range params {
		if v != "" {
			keys = append(keys, k)
		}
	}
	sort.Strings(keys)
	parts := make([]string, len(keys))
	for i, k := range keys {
		parts[i] = uriComponent(k) + "=" + uriComponent(params[k])
	}
	return strings.Join(parts, "&")
}

// uriComponent is encodeURIComponent.
func uriComponent(s string) string {
	var b strings.Builder
	for _, c := range []byte(s) {
		if c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || strings.IndexByte("-_.!~*'()", c) >= 0 {
			b.WriteByte(c)
		} else {
			b.WriteString("%" + strings.ToUpper(hexByte(c)))
		}
	}
	return b.String()
}

func hexByte(c byte) string {
	const h = "0123456789abcdef"
	return string([]byte{h[c>>4], h[c&15]})
}
