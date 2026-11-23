package api

import (
	"encoding/json"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/auth"
	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/models"
	"github.com/ctrliq/ascender/internal/rrule"
)

// Schedules: the list and detail views and the serializer; creating,
// changing and running them is in schedule_write.go.

type schedule struct {
	ID                     int64
	Created, Modified      time.Time
	Name, Description      string
	Enabled                bool
	DTStart, DTEnd         *time.Time
	RRule                  string
	NextRun                *time.Time
	ExtraData              string
	CreatedByID            *int64
	ModifiedByID           *int64
	UnifiedJobTemplateID   int64
	CharPrompts            map[string]any
	InventoryID            *int64
	SurveyPasswords        map[string]any
	ExecutionEnvironmentID *int64
}

const scheduleColumns = `sc.id, sc.created, sc.modified, sc.name, sc.description, sc.enabled, sc.dtstart, sc.dtend, sc.rrule, sc.next_run, COALESCE(sc.extra_data, ''), sc.created_by_id, sc.modified_by_id,
	sc.unified_job_template_id, COALESCE(sc.char_prompts::text, '{}'), sc.inventory_id, COALESCE(sc.survey_passwords::text, '{}'), sc.execution_environment_id`

func scanSchedule(rows pgx.Rows) (any, error) {
	sc := &schedule{}
	var chars, passwords string
	if err := rows.Scan(&sc.ID, &sc.Created, &sc.Modified, &sc.Name, &sc.Description, &sc.Enabled, &sc.DTStart, &sc.DTEnd, &sc.RRule, &sc.NextRun, &sc.ExtraData, &sc.CreatedByID, &sc.ModifiedByID,
		&sc.UnifiedJobTemplateID, &chars, &sc.InventoryID, &passwords, &sc.ExecutionEnvironmentID); err != nil {
		return nil, err
	}
	sc.CharPrompts = map[string]any{}
	_ = json.Unmarshal([]byte(chars), &sc.CharPrompts)
	sc.SurveyPasswords = map[string]any{}
	_ = json.Unmarshal([]byte(passwords), &sc.SurveyPasswords)
	return sc, nil
}

var scheduleFields = &FieldSet{
	Model: "Schedule",
	Fields: map[string]Field{
		"id": {SQL: "sc.id", Kind: KindInt}, "name": {SQL: "sc.name"}, "description": {SQL: "sc.description"},
		"created": {SQL: "sc.created", Kind: KindDateTime}, "modified": {SQL: "sc.modified", Kind: KindDateTime},
		"enabled": {SQL: "sc.enabled", Kind: KindBool}, "dtstart": {SQL: "sc.dtstart", Kind: KindDateTime}, "dtend": {SQL: "sc.dtend", Kind: KindDateTime},
		"rrule": {SQL: "sc.rrule"}, "next_run": {SQL: "sc.next_run", Kind: KindDateTime},
		"unified_job_template":  {SQL: "sc.unified_job_template_id", Kind: KindFK, Rel: &Relation{Alias: "sujt", Join: "LEFT JOIN main_unifiedjobtemplate sujt ON sujt.id = sc.unified_job_template_id", Target: func() *FieldSet { return unifiedJobTemplateFieldsAlias("sujt") }}},
		"inventory":             {SQL: "sc.inventory_id", Kind: KindFK},
		"execution_environment": {SQL: "sc.execution_environment_id", Kind: KindFK},
		"created_by":            {SQL: "sc.created_by_id", Kind: KindFK, Rel: &Relation{Alias: "cb", Join: "LEFT JOIN auth_user cb ON cb.id = sc.created_by_id", Target: func() *FieldSet { return userFieldsAlias("cb") }}},
		"modified_by":           {SQL: "sc.modified_by_id", Kind: KindFK, Rel: &Relation{Alias: "mb", Join: "LEFT JOIN auth_user mb ON mb.id = sc.modified_by_id", Target: func() *FieldSet { return userFieldsAlias("mb") }}},
	},
	SearchFields: []string{"description", "name"},
}

func init() {
	resourceRegistrars = append(resourceRegistrars, func(s *Server, mux *http.ServeMux) {
		s.route(mux, "/api/v2/schedules/{$}", methodMap{"GET": s.scheduleList, "POST": s.scheduleCreate}, s.optionsFor("schedules"))
		s.route(mux, "/api/v2/schedules/preview/{$}", methodMap{"POST": s.schedulePreview}, s.optionsFor("schedules_preview"))
		s.route(mux, "/api/v2/schedules/zoneinfo/{$}", methodMap{"GET": s.scheduleZoneInfo}, nil)
		s.route(mux, "/api/v2/schedules/{id}/{$}", methodMap{"GET": s.scheduleDetail, "PUT": s.scheduleUpdate, "PATCH": s.scheduleUpdate, "DELETE": s.scheduleDelete}, s.optionsFor("schedules"))
		s.route(mux, "/api/v2/schedules/{id}/credentials/{$}", methodMap{"GET": s.scheduleCredentials, "POST": s.scheduleCredentialsAttach}, s.optionsFor("credentials"))
		s.route(mux, "/api/v2/schedules/{id}/labels/{$}", methodMap{"GET": s.scheduleLabels, "POST": s.scheduleLabelsAttach}, nil)
		s.route(mux, "/api/v2/schedules/{id}/instance_groups/{$}", methodMap{"GET": s.scheduleInstanceGroups, "POST": s.scheduleInstanceGroupsAttach}, nil)
		s.route(mux, "/api/v2/schedules/{id}/jobs/{$}", methodMap{"GET": s.scheduleJobs}, nil)
		s.route(mux, "/api/v2/projects/{id}/schedules/{$}", methodMap{"GET": s.projectSchedules, "POST": s.projectScheduleCreate}, s.optionsFor("schedules"))
		s.route(mux, "/api/v2/system_job_templates/{id}/schedules/{$}", methodMap{"GET": s.systemJobTemplateSchedules, "POST": s.systemJobTemplateScheduleCreate}, s.optionsFor("schedules"))
		s.route(mux, "/api/v2/inventory_sources/{id}/schedules/{$}", methodMap{"GET": s.inventorySourceSchedules, "POST": s.inventorySourceScheduleCreate}, s.optionsFor("schedules"))
	})
}

// scheduleAccess: schedules of templates the user can read.
func (s *Server) scheduleAccess(q *Query, u *auth.User) {
	q.And("(sc.unified_job_template_id IN (" + accessibleSQL(q, u.ID, s.CT.ID("main.jobtemplate"), "read_role") + ") OR sc.unified_job_template_id IN (" +
		accessibleSQL(q, u.ID, s.CT.ID("main.project"), "read_role") + ") OR sc.unified_job_template_id IN (" + accessibleSQL(q, u.ID, s.CT.ID("main.workflowjobtemplate"), "read_role") +
		") OR sc.unified_job_template_id IN (SELECT src.unifiedjobtemplate_ptr_id FROM main_inventorysource src WHERE src.inventory_id IN (" + accessibleSQL(q, u.ID, s.CT.ID("main.inventory"), "read_role") + ")))")
}

func (s *Server) scheduleList(w http.ResponseWriter, r *http.Request) error {
	return s.scheduleListWith(w, r, nil)
}

func (s *Server) scheduleListWith(w http.ResponseWriter, r *http.Request, extra func(q *Query)) error {
	spec := ListSpec{Model: "Schedule", From: "main_schedule sc", Columns: scheduleColumns, PK: "sc.id", Fields: scheduleFields, DefaultOrder: []string{"id"}, Access: s.scheduleAccess}
	rows, count, page, err := s.RunList(r, spec, extra, scanSchedule)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, false)
	results := make([]any, 0, len(rows))
	for _, row := range rows {
		o, err := s.serializeSchedule(c, row.(*schedule))
		if err != nil {
			return err
		}
		results = append(results, o)
	}
	WriteJSON(w, 200, Paginate(r, page, count, results))
	return nil
}

func (s *Server) scheduleDetail(w http.ResponseWriter, r *http.Request) error {
	u, err := RequireUser(r)
	if err != nil {
		return err
	}
	id, err := PathID(r)
	if err != nil {
		return NotFoundFor("Schedule")
	}
	rows, err := s.Q().Query(r.Context(), `SELECT `+scheduleColumns+` FROM main_schedule sc WHERE sc.id = $1`, id)
	if err != nil {
		return err
	}
	defer rows.Close()
	if !rows.Next() {
		return NotFoundFor("Schedule")
	}
	v, err := scanSchedule(rows)
	if err != nil {
		return err
	}
	sc := v.(*schedule)
	if !u.IsSuperuser && !u.IsSystemAuditor {
		q := NewQuery()
		s.scheduleAccess(q, u)
		var ok bool
		if err := s.Q().QueryRow(r.Context(), `SELECT EXISTS (SELECT 1 FROM main_schedule sc WHERE sc.id = `+q.Arg(sc.ID)+` AND `+strings.Join(q.Where, " AND ")+`)`, q.Args...).Scan(&ok); err != nil {
			return err
		}
		if !ok {
			return ErrForbidden
		}
	}
	c := s.NewSerCtx(r, true)
	o, err := s.serializeSchedule(c, sc)
	if err != nil {
		return err
	}
	WriteJSON(w, 200, o)
	return nil
}

var rruleUntilRe = regexp.MustCompile(`(?i)UNTIL=([0-9]+T[0-9]+Z?)`)

// scheduleUntil extracts the UNTIL of an rrule as the old API showed it:
// the naive timestamp without the trailing Z, or "".
func scheduleUntil(rrule string) string {
	if m := rruleUntilRe.FindStringSubmatch(rrule); m != nil {
		return strings.TrimSuffix(m[1], "Z")
	}
	return ""
}

func (s *Server) serializeSchedule(c *SerCtx, sc *schedule) (*OMap, error) {
	tmpls, err := s.loadTemplateBriefs(c, []int64{sc.UnifiedJobTemplateID})
	if err != nil {
		return nil, err
	}
	tb, hasTmpl := tmpls[sc.UnifiedJobTemplateID]
	o := NewOMap().Set("rrule", sc.RRule)
	o.Set("id", sc.ID).Set("type", "schedule").Set("url", URLFor("schedules", sc.ID))
	related := NewOMap()
	setURL(related, "created_by", "users", sc.CreatedByID)
	setURL(related, "modified_by", "users", sc.ModifiedByID)
	related.Set("labels", SubURL("schedules", sc.ID, "labels")).Set("credentials", SubURL("schedules", sc.ID, "credentials")).Set("instance_groups", SubURL("schedules", sc.ID, "instance_groups"))
	related.Set("unified_jobs", SubURL("schedules", sc.ID, "jobs"))
	if hasTmpl {
		related.Set("unified_job_template", templateDetailURL(tb))
	}
	setURL(related, "inventory", "inventories", sc.InventoryID)
	setURL(related, "execution_environment", "execution_environments", sc.ExecutionEnvironmentID)
	o.Set("related", related)
	summary := NewOMap()
	if c.WantSummary("inventory") && sc.InventoryID != nil {
		invs, _ := models.LoadInventorySummaries(c.Ctx(), c.S.Q(), []int64{*sc.InventoryID})
		if inv, ok := invs[*sc.InventoryID]; ok {
			summary.Set("inventory", inventorySummaryMap(inv))
		}
	}
	c.putSummary(summary, "execution_environment", c.EESummary, sc.ExecutionEnvironmentID)
	if c.WantSummary("unified_job_template") && hasTmpl {
		t := NewOMap().Set("id", tb.ID).Set("name", tb.Name).Set("description", tb.Description).Set("unified_job_type", tb.Type)
		if tb.Type == "system_job" {
			var jobType string
			_ = db.Tolerant(s.Q()).QueryRow(c.Ctx(), `SELECT job_type FROM main_systemjobtemplate WHERE unifiedjobtemplate_ptr_id = $1`, tb.ID).Scan(&jobType)
			t.Set("job_type", jobType)
		}
		summary.Set("unified_job_template", t)
	}
	c.putSummary(summary, "created_by", c.UserSummary, sc.CreatedByID)
	c.putSummary(summary, "modified_by", c.UserSummary, sc.ModifiedByID)
	if c.WantSummary("user_capabilities") {
		edit := c.User != nil && c.User.IsSuperuser
		if !edit && hasTmpl && c.User != nil {
			switch tb.Type {
			case "job":
				edit = c.HasRoleOn("main.jobtemplate", tb.ID, "execute_role")
			case "project_update":
				edit = c.HasRoleOn("main.project", tb.ID, "update_role")
			case "workflow_job":
				edit = c.HasRoleOn("main.workflowjobtemplate", tb.ID, "execute_role")
			}
		}
		summary.Set("user_capabilities", Caps("edit", edit, "delete", edit))
	}
	if c.WantSummary("labels") {
		rows, err := s.Q().Query(c.Ctx(), `SELECT l.id, l.name FROM main_schedule_labels sl JOIN main_label l ON l.id = sl.label_id WHERE sl.schedule_id = $1 ORDER BY l.name`, sc.ID)
		if err == nil {
			var labels []models.NameSummary
			for rows.Next() {
				var l models.NameSummary
				if err := rows.Scan(&l.ID, &l.Name); err != nil {
					s.Log.ErrorContext(c.Ctx(), "reading labels", "err", err)
					break
				}
				labels = append(labels, l)
			}
			rows.Close()
			s.logRowsErr(c.Ctx(), "serializeSchedule", rows)
			if len(labels) > 0 {
				summary.Set("labels", labelsSummary(labels))
			}
		}
	}
	o.Set("summary_fields", summary)
	o.Set("created", models.FormatTime(sc.Created)).Set("modified", models.FormatTime(sc.Modified)).Set("name", sc.Name).Set("description", sc.Description)
	extra := NewOMap()
	if sc.ExtraData != "" {
		_ = extra.UnmarshalJSON([]byte(sc.ExtraData))
	}
	for k, v := range sc.SurveyPasswords {
		if extra.Has(k) {
			extra.Set(k, v)
		}
	}
	o.Set("extra_data", extra).Set("inventory", models.NullableID(sc.InventoryID))
	for _, k := range []string{"scm_branch", "job_type", "job_tags", "skip_tags", "limit", "diff_mode", "verbosity"} {
		o.Set(k, nullableString(sc.CharPrompts, k))
	}
	o.Set("execution_environment", models.NullableID(sc.ExecutionEnvironmentID))
	for _, k := range []string{"forks", "job_slice_count", "timeout"} {
		o.Set(k, nullableString(sc.CharPrompts, k))
	}
	enabled := sc.Enabled
	if s.Settings.Bool(c.Ctx(), "DISABLE_ALL_SCHEDULES") {
		enabled = false
	}
	o.Set("unified_job_template", sc.UnifiedJobTemplateID).Set("enabled", enabled)
	o.Set("dtstart", formatTimeSeconds(sc.DTStart)).Set("dtend", formatTimeSeconds(sc.DTEnd)).Set("next_run", formatTimeSeconds(sc.NextRun))
	until := scheduleUntil(sc.RRule)
	if set, _, err := rrule.ParseSchedule(sc.RRule, time.Now()); err == nil {
		until = set.Until()
	}
	o.Set("timezone", rrule.Timezone(sc.RRule)).Set("until", until)
	return o, nil
}

// formatTimeSeconds renders a timestamp without fractional seconds, as the
// schedule fields appeared.
func formatTimeSeconds(t *time.Time) any {
	if t == nil {
		return nil
	}
	return t.UTC().Format("2006-01-02T15:04:05Z")
}
