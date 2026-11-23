package api

import (
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/auth"
	"github.com/ctrliq/ascender/internal/models"
)

// Host metrics: HostMetricList, HostMetricDetail (a delete is a soft
// delete) and HostMetricSummaryMonthlyList, all IsSystemAdminOrAuditor.
// The views gave no ordering, so without order_by the rows come in the
// database's order, as they did.

type hostMetric struct {
	ID                int64
	Hostname          string
	FirstAutomation   time.Time
	LastAutomation    time.Time
	LastDeleted       *time.Time
	AutomatedCounter  int64
	DeletedCounter    int64
	Deleted           bool
	UsedInInventories *int64
}

const hostMetricColumns = `hm.id, hm.hostname, hm.first_automation, hm.last_automation, hm.last_deleted, hm.automated_counter, hm.deleted_counter, hm.deleted, hm.used_in_inventories`

func scanHostMetric(rows pgx.Rows) (any, error) {
	m := &hostMetric{}
	var used *int32
	err := rows.Scan(&m.ID, &m.Hostname, &m.FirstAutomation, &m.LastAutomation, &m.LastDeleted, &m.AutomatedCounter, &m.DeletedCounter, &m.Deleted, &used)
	if used != nil {
		n := int64(*used)
		m.UsedInInventories = &n
	}
	return m, err
}

var hostMetricFields = &FieldSet{Model: "HostMetric", Fields: map[string]Field{
	"id": {SQL: "hm.id", Kind: KindInt}, "hostname": {SQL: "hm.hostname"}, "first_automation": {SQL: "hm.first_automation", Kind: KindDateTime},
	"last_automation": {SQL: "hm.last_automation", Kind: KindDateTime}, "last_deleted": {SQL: "hm.last_deleted", Kind: KindDateTime},
	"automated_counter": {SQL: "hm.automated_counter", Kind: KindInt}, "deleted_counter": {SQL: "hm.deleted_counter", Kind: KindInt},
	"deleted": {SQL: "hm.deleted", Kind: KindBool}, "used_in_inventories": {SQL: "hm.used_in_inventories", Kind: KindInt},
}, SearchFields: []string{"hostname"}}

var hostMetricSummaryFields = &FieldSet{Model: "HostMetricSummaryMonthly", Fields: map[string]Field{
	"id": {SQL: "hs.id", Kind: KindInt}, "date": {SQL: "hs.date"}, "hosts_added": {SQL: "hs.hosts_added", Kind: KindInt},
	"hosts_deleted": {SQL: "hs.hosts_deleted", Kind: KindInt}, "indirectly_managed_hosts": {SQL: "hs.indirectly_managed_hosts", Kind: KindInt},
}, SearchFields: []string{"date"}}

func init() {
	resourceRegistrars = append(resourceRegistrars, func(s *Server, mux *http.ServeMux) {
		s.route(mux, "/api/v2/host_metrics/{$}", methodMap{"GET": s.hostMetricList}, s.optionsFor("host_metrics"))
		s.route(mux, "/api/v2/host_metrics/{id}/{$}", methodMap{"GET": s.hostMetricDetail, "DELETE": s.hostMetricDelete}, s.optionsFor("host_metrics"))
		s.route(mux, "/api/v2/host_metric_summary_monthly/{$}", methodMap{"GET": s.hostMetricSummaryList}, s.optionsFor("host_metric_summary_monthly"))
	})
}

// adminOrAuditor is IsSystemAdminOrAuditor: reads for administrators and
// auditors, writes for administrators.
func adminOrAuditor(r *http.Request) (*auth.User, error) {
	u, err := RequireUser(r)
	if err != nil {
		return nil, err
	}
	if u.IsSuperuser || (u.IsSystemAuditor && r.Method == http.MethodGet) {
		return u, nil
	}
	return nil, ErrForbidden
}

func serializeHostMetric(m *hostMetric) *OMap {
	return NewOMap().Set("id", m.ID).Set("hostname", m.Hostname).Set("url", URLFor("host_metrics", m.ID)).
		Set("first_automation", models.FormatTime(m.FirstAutomation)).Set("last_automation", models.FormatTime(m.LastAutomation)).
		Set("last_deleted", models.FormatTimePtr(m.LastDeleted)).Set("automated_counter", m.AutomatedCounter).Set("deleted_counter", m.DeletedCounter).
		Set("deleted", m.Deleted).Set("used_in_inventories", models.NullableID(m.UsedInInventories))
}

func (s *Server) hostMetricList(w http.ResponseWriter, r *http.Request) error {
	if _, err := adminOrAuditor(r); err != nil {
		return err
	}
	spec := ListSpec{Model: "HostMetric", From: "main_hostmetric hm", Columns: hostMetricColumns, PK: "hm.id", Fields: hostMetricFields}
	rows, count, page, err := s.RunList(r, spec, nil, scanHostMetric)
	if err != nil {
		return err
	}
	results := make([]any, 0, len(rows))
	for _, row := range rows {
		results = append(results, serializeHostMetric(row.(*hostMetric)))
	}
	WriteJSON(w, 200, Paginate(r, page, count, results))
	return nil
}

func (s *Server) loadHostMetric(r *http.Request) (*hostMetric, error) {
	id, err := PathID(r)
	if err != nil {
		return nil, NotFoundFor("HostMetric")
	}
	rows, err := s.Q().Query(r.Context(), `SELECT `+hostMetricColumns+` FROM main_hostmetric hm WHERE hm.id = $1`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	if !rows.Next() {
		return nil, NotFoundFor("HostMetric")
	}
	v, err := scanHostMetric(rows)
	if err != nil {
		return nil, err
	}
	return v.(*hostMetric), nil
}

func (s *Server) hostMetricDetail(w http.ResponseWriter, r *http.Request) error {
	if _, err := adminOrAuditor(r); err != nil {
		return err
	}
	m, err := s.loadHostMetric(r)
	if err != nil {
		return err
	}
	WriteJSON(w, 200, serializeHostMetric(m))
	return nil
}

// hostMetricDelete is HostMetric.soft_delete: the host stops counting as
// automated until it is automated again.
func (s *Server) hostMetricDelete(w http.ResponseWriter, r *http.Request) error {
	if _, err := adminOrAuditor(r); err != nil {
		return err
	}
	if _, err := RequireWrite(r); err != nil {
		return err
	}
	m, err := s.loadHostMetric(r)
	if err != nil {
		return err
	}
	if !m.Deleted {
		if _, err := s.Q().Exec(r.Context(), `UPDATE main_hostmetric SET deleted = true, deleted_counter = COALESCE(deleted_counter, 0) + 1, last_deleted = now() WHERE id = $1`, m.ID); err != nil {
			return err
		}
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func (s *Server) hostMetricSummaryList(w http.ResponseWriter, r *http.Request) error {
	if _, err := adminOrAuditor(r); err != nil {
		return err
	}
	spec := ListSpec{Model: "HostMetricSummaryMonthly", From: "main_hostmetricsummarymonthly hs", Columns: "hs.id, hs.date::text, hs.hosts_added, hs.hosts_deleted, hs.indirectly_managed_hosts", PK: "hs.id", Fields: hostMetricSummaryFields}
	rows, count, page, err := s.RunList(r, spec, nil, func(rows pgx.Rows) (any, error) {
		var id, added, deleted, indirect int64
		var date string
		err := rows.Scan(&id, &date, &added, &deleted, &indirect)
		return NewOMap().Set("id", id).Set("date", date).Set("hosts_added", added).Set("hosts_deleted", deleted).Set("indirectly_managed_hosts", indirect), err
	})
	if err != nil {
		return err
	}
	WriteJSON(w, 200, Paginate(r, page, count, rows))
	return nil
}
