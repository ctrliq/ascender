package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/auth"
	"github.com/ctrliq/ascender/internal/extlog"
	"github.com/ctrliq/ascender/internal/models"
)

// Management jobs: launching a system job template, the system jobs
// (SystemJobList/Detail/Cancel/Events), the template's jobs and
// notification relations.

func init() {
	resourceRegistrars = append(resourceRegistrars, func(s *Server, mux *http.ServeMux) {
		s.route(mux, "/api/v2/system_job_templates/{id}/launch/{$}", methodMap{"GET": s.systemJobTemplateLaunchView, "POST": s.systemJobTemplateLaunch}, s.optionsFor("system_job_templates"))
		s.route(mux, "/api/v2/system_job_templates/{id}/jobs/{$}", methodMap{"GET": s.systemJobTemplateJobs}, s.optionsFor("system_jobs"))
		for _, kind := range []string{"started", "success", "error"} {
			kind := kind
			s.route(mux, "/api/v2/system_job_templates/{id}/notification_templates_"+kind+"/{$}", methodMap{
				"GET": func(w http.ResponseWriter, r *http.Request) error {
					return s.ntRelationList(w, r, "system_job_template", kind)
				},
				"POST": func(w http.ResponseWriter, r *http.Request) error {
					return s.ntRelationAttach(w, r, "system_job_template", kind)
				},
			}, s.optionsFor("notification_templates"))
		}
		s.route(mux, "/api/v2/system_jobs/{$}", methodMap{"GET": s.systemJobList}, s.optionsFor("system_jobs"))
		s.route(mux, "/api/v2/system_jobs/{id}/{$}", methodMap{"GET": s.systemJobDetail, "DELETE": s.systemJobDelete}, s.optionsFor("system_jobs"))
		s.route(mux, "/api/v2/system_jobs/{id}/cancel/{$}", methodMap{"GET": s.systemJobCancelView, "POST": s.systemJobCancel}, s.optionsFor("system_jobs"))
		s.route(mux, "/api/v2/system_jobs/{id}/events/{$}", methodMap{"GET": s.systemJobEvents}, s.optionsFor("system_job_events"))
	})
}

// systemJobTemplateRow is a system job template's launch data.
type systemJobTemplateRow struct {
	ID          int64
	Name        string
	Description string
	JobType     string
	OrgID       *int64
	EEID        *int64
}

func (s *Server) loadSystemJobTemplate(ctx context.Context, id int64) (*systemJobTemplateRow, error) {
	t := &systemJobTemplateRow{ID: id}
	err := s.Q().QueryRow(ctx, `SELECT u.name, u.description, st.job_type, u.organization_id, u.execution_environment_id FROM main_systemjobtemplate st
		JOIN main_unifiedjobtemplate u ON u.id = st.unifiedjobtemplate_ptr_id WHERE st.unifiedjobtemplate_ptr_id = $1`, id).Scan(&t.Name, &t.Description, &t.JobType, &t.OrgID, &t.EEID)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, NotFoundFor("SystemJobTemplate")
		}
		return nil, err
	}
	return t, nil
}

// CreateSystemJob is create_unified_job for a system job template: the
// template's fields, the given extra vars (as JSON text) and the default
// execution environment.
func (s *Server) CreateSystemJob(ctx context.Context, t *systemJobTemplateRow, userID *int64, launchType string, extraVars any, scheduleID *int64) (int64, error) {
	extra := ""
	if extraVars != nil {
		if m, ok := extraVars.(*OMap); !ok || m.Len() > 0 {
			b, _ := json.Marshal(extraVars)
			extra = string(b)
		} else {
			extra = "{}"
		}
	}
	ee := t.EEID
	if ee == nil {
		if v, ok := s.Settings.Get(ctx, "DEFAULT_EXECUTION_ENVIRONMENT"); ok && v != nil {
			if f, ok := v.(float64); ok {
				n := int64(f)
				ee = &n
			}
		}
	}
	var id int64
	err := s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if err := tx.QueryRow(ctx, `INSERT INTO main_unifiedjob (created, modified, description, name, old_pk, launch_type, cancel_flag, status, failed, started, finished, elapsed,
			job_args, job_cwd, job_explanation, start_args, result_stdout_text, result_traceback, celery_task_id, created_by_id, modified_by_id, polymorphic_ctype_id, schedule_id,
			unified_job_template_id, execution_node, instance_group_id, emitted_events, controller_node, canceled_on, dependencies_processed, organization_id, execution_environment_id,
			installed_collections, ansible_version, work_unit_id, host_status_counts, preferred_instance_groups_cache, task_impact, job_env)
			VALUES (now(), now(), $1, $2, NULL, $3, false, 'pending', false, NULL, NULL, 0, '', '', '', '', '', '', '', $4, $4, $5, $6,
			$7, '', NULL, 0, '', NULL, true, $8, $9, '{}'::jsonb, '', '', NULL, NULL, 5, '{}'::jsonb) RETURNING id`,
			t.Description, t.Name, launchType, userID, s.CT.ID("main.systemjob"), scheduleID, t.ID, t.OrgID, ee).Scan(&id); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO main_systemjob (unifiedjob_ptr_id, job_type, extra_vars, system_job_template_id) VALUES ($1, $2, $3, $4)`, id, t.JobType, extra, t.ID); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `UPDATE main_unifiedjobtemplate SET current_job_id = $2, status = 'pending', modified = now() WHERE id = $1`, t.ID, id)
		return err
	})
	if err != nil {
		return 0, err
	}
	extlog.Default().LogLifecycle(ctx, extlog.Lifecycle{Type: "systemjob", TaskID: id, State: "created", TaskName: t.Name, OrganizationID: t.OrgID})
	s.Notify(ctx, fmt.Sprintf(`{"type":"job","id":%d}`, id))
	return id, nil
}

// systemJobTemplateLaunchView is SystemJobTemplateLaunch.get, which
// answered {} without looking up the template.
func (s *Server) systemJobTemplateLaunchView(w http.ResponseWriter, r *http.Request) error {
	if _, err := RequireUser(r); err != nil {
		return err
	}
	WriteJSON(w, 200, NewOMap())
	return nil
}

// systemJobTemplateFromPath reads the template in the URL: 404 when it
// does not exist, 403 when the user may not read it (superusers and
// system auditors only).
func (s *Server) systemJobTemplateFromPath(r *http.Request, u *auth.User) (*systemJobTemplateRow, error) {
	id, err := PathID(r)
	if err != nil {
		return nil, NotFoundFor("SystemJobTemplate")
	}
	t, err := s.loadSystemJobTemplate(r.Context(), id)
	if err != nil {
		return nil, err
	}
	if !u.IsSuperuser && !u.IsSystemAuditor {
		return nil, ErrForbidden
	}
	return t, nil
}

// systemJobTemplateLaunch is SystemJobTemplateLaunch.post: only superusers
// may start a system job (SystemJobTemplateAccess.can_start).
func (s *Server) systemJobTemplateLaunch(w http.ResponseWriter, r *http.Request) error {
	u, err := RequireWrite(r)
	if err != nil {
		return err
	}
	id, err := PathID(r)
	if err != nil {
		return NotFoundFor("SystemJobTemplate")
	}
	ctx := r.Context()
	t, err := s.loadSystemJobTemplate(ctx, id)
	if err != nil {
		return err
	}
	// SystemJobTemplateAccess.can_start, without a read check.
	if !u.IsSuperuser {
		return ErrForbidden
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	var extra any = NewOMap()
	if v, ok := body.Get("extra_vars"); ok {
		extra = v
	}
	jid, err := s.CreateSystemJob(ctx, t, &u.ID, "manual", extra, nil)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	o, err := s.serializeSystemJob(c, jid)
	if err != nil {
		return err
	}
	out := NewOMap().Set("system_job", jid)
	for _, k := range o.Keys() {
		v, _ := o.Get(k)
		out.Set(k, v)
	}
	w.Header().Set("Location", URLFor("system_jobs", jid))
	WriteJSON(w, http.StatusCreated, out)
	return nil
}

// serializeSystemJob is SystemJobSerializer: the list fields plus the
// detail-only ones in their places.
func (s *Server) serializeSystemJob(c *SerCtx, id int64) (*OMap, error) {
	items, err := s.serializeGenericJobs(c, []int64{id})
	if err != nil {
		return nil, err
	}
	if len(items) == 0 {
		return nil, NotFoundFor("SystemJob")
	}
	base := items[0].(*OMap)
	var jobArgs, jobCwd, traceback, extra string
	var env []byte
	var processed bool
	if err := s.Q().QueryRow(c.Ctx(), `SELECT u.job_args, u.job_cwd, u.job_env, u.result_traceback, s.extra_vars,
		(u.status NOT IN ('new','pending','waiting','running')) FROM main_unifiedjob u JOIN main_systemjob s ON s.unifiedjob_ptr_id = u.id WHERE u.id = $1`, id).
		Scan(&jobArgs, &jobCwd, &env, &traceback, &extra, &processed); err != nil {
		return nil, err
	}
	var envV any = NewOMap()
	if len(env) > 0 {
		if v, err := decodeOrdered(string(env)); err == nil {
			envV = v
		}
	}
	out := NewOMap()
	for _, k := range base.Keys() {
		v, _ := base.Get(k)
		out.Set(k, v)
		switch k {
		case "elapsed":
			out.Set("job_args", jobArgs).Set("job_cwd", jobCwd).Set("job_env", envV)
		case "execution_node":
			out.Set("result_traceback", traceback).Set("event_processing_finished", processed)
		case "job_type":
			out.Set("extra_vars", extra)
		}
	}
	return out, nil
}

func (s *Server) requireSystemJobUser(r *http.Request) (*auth.User, error) {
	u, err := RequireUser(r)
	if err != nil {
		return nil, err
	}
	if !u.IsSuperuser && !u.IsSystemAuditor {
		return nil, Detail(http.StatusForbidden, "Superuser privileges needed.")
	}
	return u, nil
}

func (s *Server) systemJobList(w http.ResponseWriter, r *http.Request) error {
	if _, err := s.requireSystemJobUser(r); err != nil {
		return err
	}
	ct := s.CT.ID("main.systemjob")
	return s.unifiedJobListWith(w, r, func(q *Query) { q.And("uj.polymorphic_ctype_id = " + q.Arg(ct)) })
}

func (s *Server) systemJobTemplateJobs(w http.ResponseWriter, r *http.Request) error {
	u, err := RequireUser(r)
	if err != nil {
		return err
	}
	t, err := s.systemJobTemplateFromPath(r, u)
	if err != nil {
		return err
	}
	id := t.ID
	return s.unifiedJobListWith(w, r, func(q *Query) {
		q.And("uj.id IN (SELECT unifiedjob_ptr_id FROM main_systemjob WHERE system_job_template_id = " + q.Arg(id) + ")")
	})
}

// loadSystemJob reads a system job's status for the views on it; only
// superusers and auditors may read system jobs (403 for others).
func (s *Server) loadSystemJob(r *http.Request) (int64, string, *int64, error) {
	u, err := RequireUser(r)
	if err != nil {
		return 0, "", nil, err
	}
	id, err := PathID(r)
	if err != nil {
		return 0, "", nil, NotFoundFor("SystemJob")
	}
	var status string
	var tmpl *int64
	if err := s.Q().QueryRow(r.Context(), `SELECT u.status, s.system_job_template_id FROM main_systemjob s JOIN main_unifiedjob u ON u.id = s.unifiedjob_ptr_id WHERE s.unifiedjob_ptr_id = $1`, id).Scan(&status, &tmpl); err != nil {
		return 0, "", nil, NotFoundFor("SystemJob")
	}
	if !u.IsSuperuser && !u.IsSystemAuditor {
		return 0, "", nil, ErrForbidden
	}
	return id, status, tmpl, nil
}

func (s *Server) systemJobDetail(w http.ResponseWriter, r *http.Request) error {
	id, _, _, err := s.loadSystemJob(r)
	if err != nil {
		return err
	}
	o, err := s.serializeSystemJob(s.NewSerCtx(r, true), id)
	if err != nil {
		return err
	}
	WriteJSON(w, 200, o)
	return nil
}

func (s *Server) systemJobDelete(w http.ResponseWriter, r *http.Request) error {
	u, err := RequireWrite(r)
	if err != nil {
		return err
	}
	id, _, _, err := s.loadSystemJob(r)
	if err != nil {
		return err
	}
	if !u.IsSuperuser {
		return ErrForbidden
	}
	if err := s.checkUnifiedJobDelete(r.Context(), id, "main_systemjobevent", "system_job_id"); err != nil {
		return err
	}
	ctx := r.Context()
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `DELETE FROM main_systemjobevent WHERE system_job_id = $1 AND job_created = (SELECT created FROM main_unifiedjob WHERE id = $1)`, id); err != nil {
			return err
		}
		return s.Cascade.Delete(ctx, tx, "main_unifiedjob", "id", []int64{id})
	})
	if err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func (s *Server) systemJobCancelView(w http.ResponseWriter, r *http.Request) error {
	id, status, _, err := s.loadSystemJob(r)
	if err != nil {
		return err
	}
	explanation := colOf[string](r.Context(), s.Q(), "main_unifiedjob", "job_explanation", id)
	WriteJSON(w, 200, NewOMap().Set("can_cancel", models.ActiveStatuses[status]).Set("job_explanation", Tr(r, explanation)))
	return nil
}

func (s *Server) systemJobCancel(w http.ResponseWriter, r *http.Request) error {
	u, err := RequireWrite(r)
	if err != nil {
		return err
	}
	id, status, tmpl, err := s.loadSystemJob(r)
	if err != nil {
		return err
	}
	if !u.IsSuperuser {
		return ErrForbidden
	}
	if !models.ActiveStatuses[status] {
		return MethodNotAllowed(r.Method)
	}
	if err := s.cancelJob(r, id, status, tmpl); err != nil {
		return err
	}
	w.WriteHeader(http.StatusAccepted)
	return nil
}

var systemJobEventFields = &FieldSet{
	Model: "SystemJobEvent",
	Fields: map[string]Field{
		"id": {SQL: "e.id", Kind: KindInt}, "counter": {SQL: "e.counter", Kind: KindInt}, "stdout": {SQL: "e.stdout"},
		"uuid": {SQL: "e.uuid"}, "verbosity": {SQL: "e.verbosity", Kind: KindInt},
		"start_line": {SQL: "e.start_line", Kind: KindInt}, "end_line": {SQL: "e.end_line", Kind: KindInt}, "created": {SQL: "e.created", Kind: KindDateTime},
		"modified": {SQL: "e.modified", Kind: KindDateTime}, "system_job": {SQL: "e.system_job_id", Kind: KindFK}, "event_data": {SQL: "e.event_data", Kind: KindJSON},
	},
	SearchFields: []string{"stdout"},
}

// systemJobEvents is SystemJobEventsList: verbose events only.
func (s *Server) systemJobEvents(w http.ResponseWriter, r *http.Request) error {
	id, _, _, err := s.loadSystemJob(r)
	if err != nil {
		return err
	}
	cols := `e.id, e.created, e.modified, e.event_data, e.uuid, e.counter, e.stdout, e.verbosity, e.start_line, e.end_line`
	spec := ListSpec{Model: "SystemJobEvent", From: "main_systemjobevent e", Columns: cols, PK: "e.id", Fields: systemJobEventFields, DefaultOrder: []string{"-id"}}
	if limit := r.URL.Query().Get("limit"); limit != "" {
		n, _ := strconv.Atoi(limit)
		if n <= 0 || n > MaxPageSize {
			n = DefaultPageSize
		}
		q := r.URL.Query()
		q.Set("page_size", strconv.Itoa(n))
		q.Del("limit")
		q.Set("count_disabled", "1")
		r.URL.RawQuery = q.Encode()
	}
	rows, count, page, err := s.RunList(r, spec, func(q *Query) {
		q.And("e.system_job_id = " + q.Arg(id) + " AND e.job_created = (SELECT created FROM main_unifiedjob WHERE id = " + q.Arg(id) + ")")
	}, func(rows pgx.Rows) (any, error) {
		e := &models.JobEvent{}
		var data string
		if err := rows.Scan(&e.ID, &e.Created, &e.Modified, &data, &e.UUID, &e.Counter, &e.Stdout, &e.Verbosity, &e.StartLine, &e.EndLine); err != nil {
			return nil, err
		}
		e.EventData = map[string]any{}
		if data != "" {
			_ = json.Unmarshal([]byte(data), &e.EventData)
		}
		e.EventDataText = data
		return e, nil
	})
	if err != nil {
		return err
	}
	results := make([]any, 0, len(rows))
	for _, row := range rows {
		e := row.(*models.JobEvent)
		o := NewOMap().Set("id", e.ID).Set("type", "system_job_event").Set("url", "")
		o.Set("related", NewOMap().Set("system_job", URLFor("system_jobs", id))).Set("summary_fields", NewOMap())
		o.Set("created", models.FormatTime(e.Created)).Set("modified", models.FormatTime(e.Modified))
		o.Set("event", "verbose").Set("counter", e.Counter).Set("event_display", "verbose").Set("event_data", eventDataOut(e))
		o.Set("failed", false).Set("changed", false).Set("uuid", e.UUID).Set("stdout", e.Stdout).Set("start_line", e.StartLine).Set("end_line", e.EndLine)
		o.Set("verbosity", e.Verbosity).Set("system_job", id)
		results = append(results, o)
	}
	w.Header().Set("X-UI-Max-Events", strconv.FormatInt(s.Settings.Int(r.Context(), "MAX_UI_JOB_EVENTS"), 10))
	WriteJSON(w, 200, Paginate(r, page, count, results))
	return nil
}
