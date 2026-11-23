package models

import (
	"context"
	"time"

	"github.com/ctrliq/ascender/internal/db"
)

// JobSummary carries the fields the various last_job/last_update/current_job
// summary blocks draw on.
type JobSummary struct {
	ID           int64
	Name         string
	Description  string
	Status       string
	Failed       bool
	Finished     *time.Time
	Started      *time.Time
	Elapsed      float64
	CanceledOn   *time.Time
	Type         string
	LicenseError bool
}

// LoadJobSummaries returns summaries for unified job ids.
func LoadJobSummaries(ctx context.Context, q db.Querier, cts *ContentTypes, ids []int64) (map[int64]JobSummary, error) {
	out := map[int64]JobSummary{}
	if len(ids) == 0 {
		return out, nil
	}
	rows, err := q.Query(ctx, `SELECT id, name, description, status, failed, finished, started, elapsed, canceled_on, polymorphic_ctype_id FROM main_unifiedjob WHERE id = ANY($1)`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var s JobSummary
		var ct int64
		if err := rows.Scan(&s.ID, &s.Name, &s.Description, &s.Status, &s.Failed, &s.Finished, &s.Started, &s.Elapsed, &s.CanceledOn, &ct); err != nil {
			return nil, err
		}
		s.Type = JobTypeForContentType(cts, ct)
		out[s.ID] = s
	}
	return out, rows.Err()
}

// JobTypeForContentType maps a polymorphic content type to the API type name.
func JobTypeForContentType(cts *ContentTypes, ct int64) string {
	switch cts.Model(ct) {
	case "main.job":
		return "job"
	case "main.projectupdate":
		return "project_update"
	case "main.inventoryupdate":
		return "inventory_update"
	case "main.adhoccommand":
		return "ad_hoc_command"
	case "main.systemjob":
		return "system_job"
	case "main.workflowjob":
		return "workflow_job"
	case "main.workflowapproval":
		return "workflow_approval"
	}
	return "unified_job"
}

// JobDetailURL returns the API detail URL for a job of the given type.
func JobDetailURL(typ string, id int64) string {
	switch typ {
	case "job":
		return apiURL("jobs", id)
	case "project_update":
		return apiURL("project_updates", id)
	case "inventory_update":
		return apiURL("inventory_updates", id)
	case "ad_hoc_command":
		return apiURL("ad_hoc_commands", id)
	case "system_job":
		return apiURL("system_jobs", id)
	case "workflow_job":
		return apiURL("workflow_jobs", id)
	case "workflow_approval":
		return apiURL("workflow_approvals", id)
	}
	return apiURL("unified_jobs", id)
}

func apiURL(collection string, id int64) string {
	return "/api/v2/" + collection + "/" + itoa(id) + "/"
}

func itoa(i int64) string {
	if i == 0 {
		return "0"
	}
	neg := i < 0
	if neg {
		i = -i
	}
	var b [20]byte
	pos := len(b)
	for i > 0 {
		pos--
		b[pos] = byte('0' + i%10)
		i /= 10
	}
	if neg {
		pos--
		b[pos] = '-'
	}
	return string(b[pos:])
}
