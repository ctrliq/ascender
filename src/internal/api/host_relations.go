package api

import (
	"context"
	"net/http"
	"strconv"

	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/models"
)

// The host sub-lists of the old host views that are not elsewhere:
// HostJobEventsList, HostJobHostSummariesList, HostInventorySourcesList
// and HostSmartInventoriesList; and the group ones of the old group views:
// GroupJobEventsList, GroupJobHostSummariesList and
// GroupInventorySourcesList. Their OPTIONS documents are the old views',
// in metadata/routes.

func init() {
	resourceRegistrars = append(resourceRegistrars, func(s *Server, mux *http.ServeMux) {
		s.route(mux, "/api/v2/hosts/{id}/job_events/{$}", methodMap{"GET": s.hostJobEvents}, nil)
		s.route(mux, "/api/v2/hosts/{id}/job_host_summaries/{$}", methodMap{"GET": s.hostJobHostSummaries}, nil)
		s.route(mux, "/api/v2/hosts/{id}/inventory_sources/{$}", methodMap{"GET": s.hostInventorySources}, nil)
		s.route(mux, "/api/v2/hosts/{id}/smart_inventories/{$}", methodMap{"GET": s.hostSmartInventories}, nil)
		s.route(mux, "/api/v2/groups/{id}/job_events/{$}", methodMap{"GET": s.groupJobEvents}, nil)
		s.route(mux, "/api/v2/groups/{id}/job_host_summaries/{$}", methodMap{"GET": s.groupJobHostSummaries}, nil)
		s.route(mux, "/api/v2/groups/{id}/inventory_sources/{$}", methodMap{"GET": s.groupInventorySources}, nil)
	})
}

// jobsByID loads the jobs a page of events or summaries belong to, once
// each.
func (s *Server) jobsByID(ctx context.Context, ids []int64) (map[int64]*models.Job, error) {
	out := map[int64]*models.Job{}
	for _, id := range ids {
		if _, ok := out[id]; ok {
			continue
		}
		jb, err := models.GetJob(ctx, s.Q(), id)
		if err != nil {
			if db.IsNoRows(err) {
				out[id] = &models.Job{UnifiedJob: models.UnifiedJob{ID: id}}
				continue
			}
			return nil, err
		}
		out[id] = jb
	}
	return out, nil
}

// hostJobEvents is HostJobEventsList: the job events of the host, in id
// order. JobEventAccess let a user see the events of the hosts whose
// inventory they can read, which the parent check already requires.
func (s *Server) hostJobEvents(w http.ResponseWriter, r *http.Request) error {
	_, h, err := hostObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	return s.jobEventSubList(w, r, func(q *Query) { q.And("e.host_id = " + q.Arg(h.ID)) })
}

// jobEventSubList is BaseJobEventsList over the job events extra selects:
// in id order, stdout truncated unless ?no_truncate is set, with the
// X-UI-Max-Events header.
func (s *Server) jobEventSubList(w http.ResponseWriter, r *http.Request, extra func(q *Query)) error {
	ctx := r.Context()
	spec := ListSpec{Model: "JobEvent", From: "main_jobevent e", Columns: jobEventColumns, PK: "e.id", Fields: jobEventFields, DefaultOrder: []string{"id"}}
	rows, count, page, err := s.RunList(r, spec, extra, scanJobEvent)
	if err != nil {
		return err
	}
	var jobIDs, hostIDs []int64
	for _, row := range rows {
		e := row.(*models.JobEvent)
		jobIDs = append(jobIDs, e.JobID)
		if e.HostID != nil {
			hostIDs = append(hostIDs, *e.HostID)
		}
	}
	jobs, err := s.jobsByID(ctx, jobIDs)
	if err != nil {
		return err
	}
	s.preloadEventHosts(ctx, hostIDs)
	// NoTruncateMixin: stdout is truncated unless ?no_truncate is set.
	truncate := r.URL.Query().Get("no_truncate") == ""
	maxBytes := int(s.Settings.Int(ctx, "EVENT_STDOUT_MAX_BYTES_DISPLAY"))
	if maxBytes == 0 {
		maxBytes = 1024
	}
	results := make([]any, 0, len(rows))
	for _, row := range rows {
		e := row.(*models.JobEvent)
		results = append(results, s.serializeJobEvent(ctx, e, jobs[e.JobID], truncate, maxBytes))
	}
	w.Header().Set("X-UI-Max-Events", strconv.FormatInt(s.Settings.Int(ctx, "MAX_UI_JOB_EVENTS"), 10))
	WriteJSON(w, 200, Paginate(r, page, count, results))
	return nil
}

// hostJobHostSummaries is HostJobHostSummariesList: the host's summaries
// (a constructed inventory's host has them as constructed_host), newest
// first, with no further access check (filter_read_permission = False).
func (s *Server) hostJobHostSummaries(w http.ResponseWriter, r *http.Request) error {
	_, h, err := hostObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	column := "hs.host_id"
	if colOf[string](r.Context(), s.Q(), "main_inventory", "kind", h.InventoryID) == "constructed" {
		column = "hs.constructed_host_id"
	}
	return s.jobHostSummarySubList(w, r, func(q *Query) { q.And(column + " = " + q.Arg(h.ID)) })
}

// jobHostSummarySubList is BaseJobHostSummariesList over the summaries
// extra selects: newest first, with no further access check.
func (s *Server) jobHostSummarySubList(w http.ResponseWriter, r *http.Request, extra func(q *Query)) error {
	spec := ListSpec{Model: "JobHostSummary", From: "main_jobhostsummary hs", Columns: models.JobHostSummaryColumns, PK: "hs.id", Fields: jobHostSummaryFields, DefaultOrder: []string{"-id"}}
	summaries, count, page, err := runListOf(s, r, spec, extra, models.ScanJobHostSummary)
	if err != nil {
		return err
	}
	var jobIDs []int64
	for _, hs := range summaries {
		jobIDs = append(jobIDs, hs.JobID)
	}
	jobs, err := s.jobsByID(r.Context(), jobIDs)
	if err != nil {
		return err
	}
	results := make([]any, 0, len(summaries))
	for _, hs := range summaries {
		results = append(results, s.serializeJobHostSummary(r, hs, jobs[hs.JobID]))
	}
	WriteJSON(w, 200, Paginate(r, page, count, results))
	return nil
}

// hostInventorySources is HostInventorySourcesList: the sources the host
// came from that the user can read.
func (s *Server) hostInventorySources(w http.ResponseWriter, r *http.Request) error {
	_, h, err := hostObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	return s.inventorySourceListWith(w, r, func(q *Query) {
		q.And("ujt.id IN (SELECT hs.inventorysource_id FROM main_host_inventory_sources hs WHERE hs.host_id = " + q.Arg(h.ID) + ")")
	})
}

// hostSmartInventories is HostSmartInventoriesList: the smart inventories
// whose cached membership (main_smartinventorymembership) holds the host,
// of those the user can read.
func (s *Server) hostSmartInventories(w http.ResponseWriter, r *http.Request) error {
	_, h, err := hostObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	return s.inventoryListWith(w, r, func(q *Query) {
		q.And("i.id IN (SELECT sm.inventory_id FROM main_smartinventorymembership sm WHERE sm.host_id = " + q.Arg(h.ID) + ")")
	}, viewInventories)
}

// groupAllHostsIn selects the ids of Group.all_hosts of g: the hosts of
// the group and of every group below it, following only the parent links
// and host memberships within the group's inventory, as the inventory's
// group children and group hosts maps did.
func groupAllHostsIn(q *Query, g *models.Group) string {
	inv := q.Arg(g.InventoryID)
	return `(WITH RECURSIVE down AS (SELECT ` + q.Arg(g.ID) + `::int AS id
		UNION SELECT gp.from_group_id FROM main_group_parents gp JOIN down ON gp.to_group_id = down.id
			JOIN main_group gf ON gf.id = gp.from_group_id JOIN main_group gt ON gt.id = gp.to_group_id
			WHERE gf.inventory_id = ` + inv + ` AND gt.inventory_id = ` + inv + `)
		SELECT gh.host_id FROM main_group_hosts gh JOIN down ON gh.group_id = down.id JOIN main_host ghh ON ghh.id = gh.host_id
		WHERE ghh.inventory_id = ` + inv + `)`
}

// groupJobEvents is GroupJobEventsList: the job events of the group's
// hosts (Group.job_events, over all_hosts), in id order. The hosts are
// those of the group's inventory, which the parent check requires the user
// to read, so JobEventAccess hides none of them.
func (s *Server) groupJobEvents(w http.ResponseWriter, r *http.Request) error {
	_, g, err := groupObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	return s.jobEventSubList(w, r, func(q *Query) { q.And("e.host_id IN " + groupAllHostsIn(q, g)) })
}

// groupJobHostSummaries is GroupJobHostSummariesList: the summaries of the
// group's hosts (Group.job_host_summaries; in a constructed inventory
// Group.constructed_host_summaries), newest first, with no further access
// check.
func (s *Server) groupJobHostSummaries(w http.ResponseWriter, r *http.Request) error {
	_, g, err := groupObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	column := "hs.host_id"
	if colOf[string](r.Context(), s.Q(), "main_inventory", "kind", g.InventoryID) == "constructed" {
		column = "hs.constructed_host_id"
	}
	return s.jobHostSummarySubList(w, r, func(q *Query) { q.And(column + " IN " + groupAllHostsIn(q, g)) })
}

// groupInventorySources is GroupInventorySourcesList: the sources that
// created or modified the group that the user can read.
func (s *Server) groupInventorySources(w http.ResponseWriter, r *http.Request) error {
	_, g, err := groupObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	return s.inventorySourceListWith(w, r, func(q *Query) {
		q.And("ujt.id IN (SELECT gs.inventorysource_id FROM main_group_inventory_sources gs WHERE gs.group_id = " + q.Arg(g.ID) + ")")
	})
}
