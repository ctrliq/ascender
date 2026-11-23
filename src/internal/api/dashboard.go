package api

import (
	"net/http"

	"github.com/ctrliq/ascender/internal/auth"
	"github.com/jackc/pgx/v5"
)

func init() {
	resourceRegistrars = append(resourceRegistrars, func(s *Server, mux *http.ServeMux) {
		s.route(mux, "/api/v2/dashboard/{$}", methodMap{"GET": s.dashboardView}, nil)
	})
}

// countWhere counts rows of a query, restricted by RBAC for ordinary users.
func (s *Server) countAccessible(r *http.Request, u *auth.User, from, pk, ctKey, where string) (int64, error) {
	q := NewQuery()
	if where != "" {
		q.And(where)
	}
	if !u.IsSuperuser && !u.IsSystemAuditor && ctKey != "" {
		s.AccessibleFilter(q, u, pk, ctKey, "read_role")
	}
	var n int64
	err := s.Q().QueryRow(r.Context(), "SELECT count(*) FROM "+from+q.WhereSQL(), q.Args...).Scan(&n)
	return n, err
}

// dashboardView reproduces /api/v2/dashboard/ (deprecated upstream but
// still what the dashboard screen reads).
func (s *Server) dashboardView(w http.ResponseWriter, r *http.Request) error {
	// DashboardView.deprecated: finalize_response warned about it.
	w.Header().Set("Warning", deprecatedWarning)
	u, err := RequireUser(r)
	if err != nil {
		return err
	}
	ctx := r.Context()
	o := NewOMap()
	o.Set("related", NewOMap().Set("jobs_graph", "/api/v2/dashboard/graphs/jobs/"))

	// The first failure answers the request (the old view failed with a
	// 500), rather than a dashboard of zeros.
	var firstErr error
	count := func(from, idCol, ctKey, where string) int64 {
		if firstErr != nil {
			return 0
		}
		n, err := s.countAccessible(r, u, from, idCol, ctKey, where)
		if err != nil {
			firstErr = err
		}
		return n
	}
	scan := func(row pgx.Row, dest ...any) {
		if firstErr == nil {
			firstErr = row.Scan(dest...)
		}
	}
	invTotal := count("main_inventory i", "i.id", "main.inventory", "")
	invWithSource := count("main_inventory i", "i.id", "main.inventory", "i.has_inventory_sources")
	invJobFailed := count("main_inventory i", "i.id", "main.inventory", "i.hosts_with_active_failures > 0")
	q := NewQuery()
	if !u.IsSuperuser && !u.IsSystemAuditor {
		s.AccessibleFilter(q, u, "i.id", "main.inventory", "read_role")
	}
	var invFailed int64
	scan(s.Q().QueryRow(ctx, "SELECT COALESCE(sum(i.inventory_sources_with_failures), 0) FROM main_inventory i"+q.WhereSQL(), q.Args...), &invFailed)
	o.Set("inventories", NewOMap().Set("url", "/api/v2/inventories/").Set("total", invTotal).Set("total_with_inventory_source", invWithSource).Set("job_failed", invJobFailed).Set("inventory_failed", invFailed))

	ec2Total := count("main_inventorysource src JOIN main_unifiedjobtemplate ujt ON ujt.id = src.unifiedjobtemplate_ptr_id JOIN main_inventory i ON i.id = src.inventory_id", "i.id", "main.inventory", "src.source = 'ec2'")
	ec2Failed := count("main_inventorysource src JOIN main_unifiedjobtemplate ujt ON ujt.id = src.unifiedjobtemplate_ptr_id JOIN main_inventory i ON i.id = src.inventory_id", "i.id", "main.inventory", "src.source = 'ec2' AND ujt.status = 'failed'")
	o.Set("inventory_sources", NewOMap().Set("ec2", NewOMap().Set("url", "/api/v2/inventory_sources/?source=ec2").Set("failures_url", "/api/v2/inventory_sources/?source=ec2&status=failed").Set("label", "Amazon EC2").Set("total", ec2Total).Set("failed", ec2Failed)))

	groupsTotal := count("main_group g JOIN main_inventory i ON i.id = g.inventory_id", "i.id", "main.inventory", "")
	var groupsInvFailed int64
	scan(s.Q().QueryRow(ctx, `SELECT count(DISTINCT g.id) FROM main_group g JOIN main_group_inventory_sources gis ON gis.group_id = g.id JOIN main_unifiedjobtemplate ujt ON ujt.id = gis.inventorysource_id WHERE ujt.last_job_failed`), &groupsInvFailed)
	o.Set("groups", NewOMap().Set("url", "/api/v2/groups/").Set("total", groupsTotal).Set("inventory_failed", groupsInvFailed))

	hostsTotal := count("main_host h JOIN main_inventory i ON i.id = h.inventory_id", "i.id", "main.inventory", "i.kind <> 'constructed'")
	hostsFailed := count("main_host h JOIN main_inventory i ON i.id = h.inventory_id", "i.id", "main.inventory", "i.kind <> 'constructed' AND (SELECT s.failed FROM main_jobhostsummary s WHERE s.host_id = h.id ORDER BY s.id DESC LIMIT 1) = true")
	o.Set("hosts", NewOMap().Set("url", "/api/v2/hosts/").Set("total", hostsTotal).Set("failed", hostsFailed))

	projFrom := "main_project p JOIN main_unifiedjobtemplate ujt ON ujt.id = p.unifiedjobtemplate_ptr_id"
	projTotal := count(projFrom, "ujt.id", "main.project", "")
	projFailed := count(projFrom, "ujt.id", "main.project", "ujt.last_job_failed")
	o.Set("projects", NewOMap().Set("url", "/api/v2/projects/").Set("failures_url", "/api/v2/projects/?last_job_failed=True").Set("total", projTotal).Set("failed", projFailed))

	scm := NewOMap()
	for _, t := range []struct{ key, label string }{{"git", "Git"}, {"svn", "Subversion"}, {"archive", "Remote Archive"}} {
		total := count(projFrom, "ujt.id", "main.project", "p.scm_type = '"+t.key+"'")
		failed := count(projFrom, "ujt.id", "main.project", "p.scm_type = '"+t.key+"' AND ujt.last_job_failed")
		scm.Set(t.key, NewOMap().Set("url", "/api/v2/projects/?scm_type="+t.key).Set("label", t.label).Set("failures_url", "/api/v2/projects/?scm_type="+t.key+"&last_job_failed=True").Set("total", total).Set("failed", failed))
	}
	o.Set("scm_types", scm)

	// get_user_queryset(User).count(): the users list's own visibility.
	// (The query here before passed its arguments out of line with its
	// placeholders, failed, and showed 0.)
	var users int64
	uq := NewQuery()
	if clause := s.userVisibleClause(ctx, uq, u, "u.id"); clause == "" {
		scan(s.Q().QueryRow(ctx, `SELECT count(*) FROM auth_user`), &users)
	} else {
		scan(s.Q().QueryRow(ctx, `SELECT count(*) FROM auth_user u WHERE `+clause, uq.Args...), &users)
	}
	o.Set("users", NewOMap().Set("url", "/api/v2/users/").Set("total", users))
	orgs := count("main_organization o", "o.id", "main.organization", "")
	o.Set("organizations", NewOMap().Set("url", "/api/v2/organizations/").Set("total", orgs))
	teams := count("main_team t", "t.id", "main.team", "")
	o.Set("teams", NewOMap().Set("url", "/api/v2/teams/").Set("total", teams))
	creds := count("main_credential c", "c.id", "main.credential", "")
	o.Set("credentials", NewOMap().Set("url", "/api/v2/credentials/").Set("total", creds))
	jts := count("main_jobtemplate j JOIN main_unifiedjobtemplate ujt ON ujt.id = j.unifiedjobtemplate_ptr_id", "ujt.id", "main.jobtemplate", "")
	o.Set("job_templates", NewOMap().Set("url", "/api/v2/job_templates/").Set("total", jts))
	if firstErr != nil {
		return firstErr
	}
	Allow(w, "GET", "HEAD", "OPTIONS")
	WriteJSON(w, 200, o)
	return nil
}
