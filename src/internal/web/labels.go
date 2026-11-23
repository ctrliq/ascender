package web

import (
	"net/http"
	"net/url"
)

// Labels (LabelLists: the labels some template uses, linking to the
// templates that carry them) and Host Metrics (the automated hosts, with
// their soft delete). A label's link keeps LabelListItem's name search and
// narrows it by the label's id, where the old one narrowed it by the
// label's organization and so hid the templates of other organizations
// that carry the label.

func (u *UI) registerLabelsAndHostMetrics(mux *http.ServeMux) {
	mux.HandleFunc("/labels", u.protected(u.labelList))
	mux.HandleFunc("/labels/{$}", u.protected(u.labelList))
	mux.HandleFunc("/host_metrics", u.protected(u.hostMetricList))
	mux.HandleFunc("/host_metrics/{$}", u.protected(u.hostMetricList))
}

func (u *UI) labelList(w http.ResponseWriter, r *http.Request, uc *userContext) {
	p := u.newPage(r, uc, "Labels")
	p.Nav = navigation(uc, "/labels")
	if err := u.listPage(r, p, "labels", "/api/v2/labels/", url.Values{"order_by": {"name"}, "unifiedjobtemplate_labels__search": {""}},
		map[string]string{"name__icontains": "Name", "organization__name__icontains": "Organization"}); err != nil {
		u.api.Log.ErrorContext(r.Context(), "label list", "err", err)
	}
	p.Data["searchKeys"] = []map[string]string{{"name": "Name", "key": "name__icontains"}, {"name": "Organization", "key": "organization__name__icontains"}}
	u.render(w, r, "labels_list", p)
}

func (u *UI) hostMetricList(w http.ResponseWriter, r *http.Request, uc *userContext) {
	p := u.newPage(r, uc, "Host Metrics")
	p.Nav = navigation(uc, "/host_metrics")
	if err := u.listPage(r, p, "host_metrics", "/api/v2/host_metrics/", url.Values{"order_by": {"hostname"}, "deleted": {"false"}}, map[string]string{"hostname__icontains": "Hostname"}); err != nil {
		u.api.Log.ErrorContext(r.Context(), "host metric list", "err", err)
	}
	p.Data["searchKeys"] = []map[string]string{{"name": "Hostname", "key": "hostname__icontains"}}
	u.render(w, r, "host_metrics", p)
}
