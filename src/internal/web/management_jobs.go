package web

import (
	"net/http"
	"net/url"
)

// Management Jobs (ManagementJobList, ManagementJob): the system job
// templates, launched from the list (the cleanup jobs first ask how many
// days to keep), with their schedules (schedules.go) and notifications.

func (u *UI) registerManagementJobs(mux *http.ServeMux) {
	mux.HandleFunc("/management_jobs", u.protected(u.managementJobList))
	mux.HandleFunc("/management_jobs/{$}", u.protected(u.managementJobList))
	mux.HandleFunc("/management_jobs/{id}/notifications", u.protected(u.managementJobNotifications))
}

// canSeeManagementJobs is the old route config, which dropped the
// management job routes for everyone but superusers and system auditors.
func canSeeManagementJobs(uc *userContext) bool {
	return uc.User != nil && (uc.User.IsSuperuser || uc.User.IsSystemAuditor)
}

func (u *UI) managementJobList(w http.ResponseWriter, r *http.Request, uc *userContext) {
	if !canSeeManagementJobs(uc) {
		u.notFound(w, r, uc)
		return
	}
	p := u.newPage(r, uc, "Management jobs")
	p.Nav = navigation(uc, "/management_jobs")
	if err := u.listPage(r, p, "system_job_templates", "/api/v2/system_job_templates/", url.Values{"order_by": {"name"}}, map[string]string{"name__icontains": "Name"}); err != nil {
		u.api.Log.ErrorContext(r.Context(), "management job list", "err", err)
		p.Data["error"] = true
	}
	p.Data["searchKeys"] = []map[string]string{{"name": "Name", "key": "name__icontains"}}
	p.Data["superuser"] = uc.User.IsSuperuser
	p.Data["managementJobs"] = true
	u.render(w, r, "management_jobs_list", p)
}

// managementJobNotifications is the Notifications tab, shown to
// notification admins and system auditors.
func (u *UI) managementJobNotifications(w http.ResponseWriter, r *http.Request, uc *userContext) {
	o, ok := u.loadScheduleOwner(w, r, uc, "system_job_template")
	if !ok {
		return
	}
	admin := u.isNotificationAdmin(r)
	if !admin && !uc.User.IsSystemAuditor {
		u.notFound(w, r, uc)
		return
	}
	p := u.newPage(r, uc, "Notifications")
	p.Nav = navigation(uc, "/management_jobs")
	p.Data["owner"] = o
	u.notificationsTab(r, p, "/api/v2/system_job_templates/"+o.ID+"/", []string{"started", "success", "error"}, admin)
	u.render(w, r, "management_jobs_notifications", p)
}
