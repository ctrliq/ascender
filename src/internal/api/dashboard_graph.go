package api

import (
	"net/http"
	"time"
)

// dashboard/graphs/jobs/ (DashboardJobsGraphView): finished jobs per day by
// status over the period, as [epoch seconds, count] pairs for the dashboard
// chart.

func init() {
	resourceRegistrars = append(resourceRegistrars, func(s *Server, mux *http.ServeMux) {
		s.route(mux, "/api/v2/dashboard/graphs/jobs/{$}", methodMap{"GET": s.dashboardJobsGraph}, s.optionsFor("dashboard_graphs_jobs"))
	})
}

var dashboardGraphTypes = map[string]string{"inv_sync": "main_inventoryupdate", "playbook_run": "main_job", "scm_update": "main_projectupdate"}

func (s *Server) dashboardJobsGraph(w http.ResponseWriter, r *http.Request) error {
	u, err := RequireUser(r)
	if err != nil {
		return err
	}
	period := r.URL.Query().Get("period")
	if !r.URL.Query().Has("period") {
		period = "month"
	}
	jobType := r.URL.Query().Get("job_type")
	end := time.Now().UTC()
	var start time.Time
	interval := "day"
	switch period {
	case "month":
		start = end.AddDate(0, -1, 0)
	case "two_weeks":
		start = end.AddDate(0, 0, -14)
	case "week":
		start = end.AddDate(0, 0, -7)
	case "day":
		start = end.AddDate(0, 0, -1)
		interval = "hour"
	default:
		WriteJSON(w, http.StatusBadRequest, NewOMap().Set("error", `Unknown period "`+period+`"`))
		return nil
	}
	q := NewQuery()
	q.And("uj.launch_type <> 'sync'")
	q.And("uj.status IN ('successful', 'failed', 'canceled', 'error')")
	q.And("uj.finished BETWEEN " + q.Arg(start) + " AND " + q.Arg(end))
	if t, ok := dashboardGraphTypes[jobType]; ok {
		q.And("uj.id IN (SELECT t.unifiedjob_ptr_id FROM " + t + " t)")
	}
	if !u.IsSuperuser && !u.IsSystemAuditor {
		s.unifiedJobAccess(q, u)
	}
	// Trunc('finished', interval) in UTC.
	rows, err := s.Q().Query(r.Context(), "SELECT uj.status, date_trunc('"+interval+"', uj.finished AT TIME ZONE 'UTC'), count(DISTINCT uj.id) FROM main_unifiedjob uj"+q.WhereSQL()+" GROUP BY 1, 2", q.Args...)
	if err != nil {
		return err
	}
	counts := map[string]map[time.Time]int64{}
	for rows.Next() {
		var st string
		var d time.Time
		var n int64
		if err := rows.Scan(&st, &d, &n); err != nil {
			rows.Close()
			return err
		}
		if counts[st] == nil {
			counts[st] = map[time.Time]int64{}
		}
		counts[st][d.UTC()] = n
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	statuses := []string{"successful", "failed", "canceled", "error"}
	lists := map[string][]any{}
	// The old view walked the days from midnight of the start, looking each
	// day up among the truncated keys (for the day period those are hours,
	// so a day only counts its midnight hour).
	day := time.Date(start.Year(), start.Month(), start.Day(), 0, 0, 0, 0, time.UTC)
	for d := 0; ; d++ {
		date := day.AddDate(0, 0, d)
		if date.After(end) {
			break
		}
		for _, st := range statuses {
			lists[st] = append(lists[st], []any{fixedFloat(float64(date.Unix())), counts[st][date]})
		}
	}
	jobs := NewOMap()
	for _, st := range statuses {
		if lists[st] == nil {
			lists[st] = []any{}
		}
		jobs.Set(st, lists[st])
	}
	WriteJSON(w, http.StatusOK, NewOMap().Set("jobs", jobs))
	return nil
}
