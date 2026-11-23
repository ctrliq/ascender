package api

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/ctrliq/ascender/internal/redact"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/activity"
	"github.com/ctrliq/ascender/internal/auth"
	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/i18n"
	"github.com/ctrliq/ascender/internal/models"
)

// DispatchChannel is the LISTEN/NOTIFY channel the task process watches.
const DispatchChannel = "ascender_dispatch"

func projectUpdateFieldsAlias(uj, pu string) *FieldSet {
	return &FieldSet{
		Model: "ProjectUpdate",
		Fields: map[string]Field{
			"id": {SQL: uj + ".id", Kind: KindInt}, "name": {SQL: uj + ".name"}, "description": {SQL: uj + ".description"},
			"created": {SQL: uj + ".created", Kind: KindDateTime}, "modified": {SQL: uj + ".modified", Kind: KindDateTime},
			"launch_type": {SQL: uj + ".launch_type"}, "status": {SQL: uj + ".status"}, "failed": {SQL: uj + ".failed", Kind: KindBool},
			"started": {SQL: uj + ".started", Kind: KindDateTime}, "finished": {SQL: uj + ".finished", Kind: KindDateTime},
			"canceled_on": {SQL: uj + ".canceled_on", Kind: KindDateTime}, "elapsed": {SQL: uj + ".elapsed", Kind: KindInt},
			"job_explanation": {SQL: uj + ".job_explanation"}, "execution_node": {SQL: uj + ".execution_node"}, "controller_node": {SQL: uj + ".controller_node"},
			"work_unit_id": {SQL: uj + ".work_unit_id"}, "job_args": {SQL: uj + ".job_args", NoFilter: true}, "job_env": {SQL: uj + ".job_env", NoFilter: true},
			"local_path": {SQL: pu + ".local_path"}, "scm_type": {SQL: pu + ".scm_type"}, "scm_url": {SQL: pu + ".scm_url"}, "scm_branch": {SQL: pu + ".scm_branch"},
			"scm_refspec": {SQL: pu + ".scm_refspec"}, "scm_clean": {SQL: pu + ".scm_clean", Kind: KindBool}, "scm_delete_on_update": {SQL: pu + ".scm_delete_on_update", Kind: KindBool},
			"scm_track_submodules": {SQL: pu + ".scm_track_submodules", Kind: KindBool}, "timeout": {SQL: pu + ".timeout", Kind: KindInt}, "scm_revision": {SQL: pu + ".scm_revision"},
			"job_type": {SQL: pu + ".job_type"}, "job_tags": {SQL: pu + ".job_tags"}, "webhook_service": {SQL: pu + ".webhook_service"}, "webhook_guid": {SQL: pu + ".webhook_guid"},
			"project":               {SQL: pu + ".project_id", Kind: KindFK, Rel: &Relation{Alias: "pp", Join: "LEFT JOIN main_project pp ON pp.unifiedjobtemplate_ptr_id = " + pu + ".project_id LEFT JOIN main_unifiedjobtemplate pujt ON pujt.id = pp.unifiedjobtemplate_ptr_id", Target: func() *FieldSet { return projectFieldsAlias("pujt", "pp") }}},
			"unified_job_template":  {SQL: uj + ".unified_job_template_id", Kind: KindFK, Rel: &Relation{Alias: "ujt2", Join: "LEFT JOIN main_unifiedjobtemplate ujt2 ON ujt2.id = " + uj + ".unified_job_template_id", Target: func() *FieldSet { return projectFieldsAlias("ujt2", "pp2") }}},
			"credential":            {SQL: pu + ".credential_id", Kind: KindFK, Rel: &Relation{Alias: "puc", Join: "LEFT JOIN main_credential puc ON puc.id = " + pu + ".credential_id", Target: func() *FieldSet { return credentialFieldsAlias("puc") }}},
			"organization":          {SQL: uj + ".organization_id", Kind: KindFK, Rel: &Relation{Alias: "o", Join: "LEFT JOIN main_organization o ON o.id = " + uj + ".organization_id", Target: func() *FieldSet { return organizationFields }}},
			"created_by":            {SQL: uj + ".created_by_id", Kind: KindFK, Rel: &Relation{Alias: "cb", Join: "LEFT JOIN auth_user cb ON cb.id = " + uj + ".created_by_id", Target: func() *FieldSet { return userFieldsAlias("cb") }}},
			"modified_by":           {SQL: uj + ".modified_by_id", Kind: KindFK, Rel: &Relation{Alias: "mb", Join: "LEFT JOIN auth_user mb ON mb.id = " + uj + ".modified_by_id", Target: func() *FieldSet { return userFieldsAlias("mb") }}},
			"execution_environment": {SQL: uj + ".execution_environment_id", Kind: KindFK, Rel: &Relation{Alias: "ee", Join: "LEFT JOIN main_executionenvironment ee ON ee.id = " + uj + ".execution_environment_id", Target: func() *FieldSet { return executionEnvironmentFields }}},
			"instance_group":        {SQL: uj + ".instance_group_id", Kind: KindFK},
			"polymorphic_ctype":     {SQL: uj + ".polymorphic_ctype_id", Kind: KindFK},
		},
		SearchFields: []string{"name", "description"},
	}
}

var projectUpdateFields *FieldSet

func projectUpdateSpec() ListSpec {
	return ListSpec{
		Model: "ProjectUpdate", From: models.ProjectUpdateFrom, Columns: models.ProjectUpdateColumns, PK: "uj.id",
		Fields: projectUpdateFields, DefaultOrder: []string{"id"},
	}
}

func init() {
	projectUpdateFields = projectUpdateFieldsAlias("uj", "pu")
	resourceRegistrars = append(resourceRegistrars, (*Server).registerProjectUpdates)
}

func (s *Server) registerProjectUpdates(mux *http.ServeMux) {
	s.route(mux, "/api/v2/projects/{id}/update/{$}", methodMap{"GET": s.projectUpdateView, "POST": s.projectUpdateLaunch}, nil)
	s.route(mux, "/api/v2/projects/{id}/project_updates/{$}", methodMap{"GET": s.projectProjectUpdates}, nil)
	s.route(mux, "/api/v2/project_updates/{$}", methodMap{"GET": s.projectUpdateList}, nil)
	s.route(mux, "/api/v2/project_updates/{id}/{$}", methodMap{"GET": s.projectUpdateDetail, "DELETE": s.projectUpdateDelete}, nil)
	s.route(mux, "/api/v2/project_updates/{id}/events/{$}", methodMap{"GET": s.projectUpdateEvents}, nil)
	s.route(mux, "/api/v2/project_updates/{id}/stdout/{$}", methodMap{"GET": s.projectUpdateStdout}, nil)
	s.route(mux, "/api/v2/project_updates/{id}/cancel/{$}", methodMap{"GET": s.projectUpdateCancelView, "POST": s.projectUpdateCancel}, nil)
}

// projectUpdateAccess: a user sees updates of projects they can read.
func (s *Server) projectUpdateAccess(q *Query, u *auth.User) {
	q.And("pu.project_id IN (" + accessibleSQL(q, u.ID, s.CT.ID("main.project"), "read_role") + ")")
}

// NotifyDispatcher wakes the task process.
func (s *Server) NotifyDispatcher(r *http.Request, payload string) {
	s.Notify(r.Context(), payload)
}

// Notify wakes the dispatcher with a JSON payload ({"type": ..., "id": N}).
// A job announced this way was just signalled to start, which emitted its
// pending status on the websocket.
func (s *Server) Notify(ctx context.Context, payload string) {
	if _, err := s.Q().Exec(ctx, `SELECT pg_notify($1, $2)`, DispatchChannel, payload); err != nil {
		s.Log.WarnContext(ctx, "pg_notify failed", "err", err)
	}
	var n struct {
		Type string `json:"type"`
		ID   int64  `json:"id"`
	}
	if json.Unmarshal([]byte(payload), &n) != nil || n.ID == 0 {
		return
	}
	switch n.Type {
	case "job", "project_update", "inventory_update", "ad_hoc_command", "workflow_job":
		var status string
		if s.Q().QueryRow(ctx, `SELECT status FROM main_unifiedjob WHERE id = $1`, n.ID).Scan(&status) == nil && status == "pending" {
			s.EmitJobStatus(ctx, n.ID, "pending")
		}
	}
}

func (s *Server) projectUpdateView(w http.ResponseWriter, r *http.Request) error {
	_, p, err := projectObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	WriteJSON(w, 200, NewOMap().Set("can_update", p.SCMType != ""))
	return nil
}

// LaunchProjectUpdate creates a pending update for the project and wakes the
// task process. launchType is "manual", "dependency", "scheduled" or "sync".
func (s *Server) LaunchProjectUpdate(r *http.Request, p *models.Project, u *auth.User, launchType string) (*models.ProjectUpdate, error) {
	var uid *int64
	if u != nil {
		uid = &u.ID
	}
	pu := models.NewProjectUpdate(p, launchType, uid, "check")
	ctx := r.Context()
	err := s.DB.Tx(ctx, func(tx pgx.Tx) error {
		return models.InsertProjectUpdate(ctx, tx, pu, s.CT)
	})
	if err != nil {
		return nil, err
	}
	s.NotifyDispatcher(r, fmt.Sprintf(`{"type":"project_update","id":%d}`, pu.ID))
	return pu, nil
}

func (s *Server) projectUpdateLaunch(w http.ResponseWriter, r *http.Request) error {
	u, p, err := projectObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	if !c.HasRole(p.UpdateRoleID) {
		return ErrForbidden
	}
	if p.SCMType == "" {
		return MethodNotAllowed(r.Method)
	}
	pu, err := s.LaunchProjectUpdate(r, p, u, "manual")
	if err != nil {
		return err
	}
	_ = s.Activity.Record(r.Context(), s.Q(), activity.Entry{Operation: "create", Object1: "project_update", Changes: map[string]any{"name": pu.Name, "id": pu.ID, "project": activity.Ref(p.Name, p.ID), "job_type": pu.JobType, "status": pu.Status}, ActorID: &u.ID, Links: map[string]int64{"project_update": pu.ID, "unified_job": pu.ID}})
	results, err := s.serializeProjectUpdates(c, []*models.ProjectUpdate{pu}, false)
	if err != nil {
		return err
	}
	data := NewOMap().Set("project_update", pu.ID)
	obj := results[0].(*OMap)
	for _, k := range obj.Keys() {
		v, _ := obj.Get(k)
		data.Set(k, v)
	}
	w.Header().Set("Location", URLFor("project_updates", pu.ID))
	WriteJSON(w, http.StatusAccepted, data)
	return nil
}

func (s *Server) projectUpdateList(w http.ResponseWriter, r *http.Request) error {
	return s.projectUpdateListWith(w, r, nil)
}

func (s *Server) projectProjectUpdates(w http.ResponseWriter, r *http.Request) error {
	_, p, err := projectObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	return s.projectUpdateListWith(w, r, func(q *Query) { q.And("pu.project_id = " + q.Arg(p.ID)) })
}

func (s *Server) projectUpdateListWith(w http.ResponseWriter, r *http.Request, extra func(q *Query)) error {
	spec := projectUpdateSpec()
	spec.Access = s.projectUpdateAccess
	ups, count, page, err := runListOf(s, r, spec, extra, models.ScanProjectUpdate)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, false)
	results, err := s.serializeProjectUpdates(c, ups, false)
	if err != nil {
		return err
	}
	WriteJSON(w, 200, Paginate(r, page, count, results))
	return nil
}

// projectUpdateObj is a project update, read through its project.
var projectUpdateObj = &pathObject[*models.ProjectUpdate]{
	model: "ProjectUpdate",
	get:   models.GetProjectUpdate,
	readable: func(c *SerCtx, v *models.ProjectUpdate) bool {
		return v.ProjectID != nil && c.HasRoleOn("main.project", *v.ProjectID, "read_role")
	},
}

func (s *Server) projectUpdateDetail(w http.ResponseWriter, r *http.Request) error {
	_, pu, err := projectUpdateObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	results, err := s.serializeProjectUpdates(c, []*models.ProjectUpdate{pu}, true)
	if err != nil {
		return err
	}
	WriteJSON(w, 200, results[0])
	return nil
}

func (s *Server) projectUpdateDelete(w http.ResponseWriter, r *http.Request) error {
	_, pu, err := projectUpdateObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	if pu.ProjectID == nil || !c.HasRoleOn("main.project", *pu.ProjectID, "admin_role") {
		return ErrForbidden
	}
	if err := s.checkUnifiedJobDelete(r.Context(), pu.ID, "main_projectupdateevent", "project_update_id"); err != nil {
		return err
	}
	ctx := r.Context()
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `DELETE FROM main_projectupdateevent WHERE project_update_id = $1 AND job_created = $2`, pu.ID, pu.Created); err != nil {
			return err
		}
		return s.Cascade.Delete(ctx, tx, "main_unifiedjob", "id", []int64{pu.ID})
	})
	if err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// eventTypes mirrors JobEvent.EVENT_TYPES: level, display name, failed.
var eventTypes = map[string]struct {
	Level   int
	Display string
	Failed  bool
}{
	"runner_on_failed": {3, "Host Failed", true}, "runner_on_start": {3, "Host Started", false}, "runner_on_ok": {3, "Host OK", false},
	"runner_on_error": {3, "Host Failure", true}, "runner_on_skipped": {3, "Host Skipped", false}, "runner_on_unreachable": {3, "Host Unreachable", true},
	"runner_on_no_hosts": {3, "No Hosts Remaining", false}, "runner_on_async_poll": {3, "Host Polling", false}, "runner_on_async_ok": {3, "Host Async OK", false},
	"runner_on_async_failed": {3, "Host Async Failure", true}, "runner_item_on_ok": {3, "Item OK", false}, "runner_item_on_failed": {3, "Item Failed", true},
	"runner_item_on_skipped": {3, "Item Skipped", false}, "runner_retry": {3, "Host Retry", false}, "runner_on_file_diff": {3, "File Difference", false},
	"playbook_on_start": {0, "Playbook Started", false}, "playbook_on_notify": {2, "Running Handlers", false}, "playbook_on_include": {2, "Including File", false},
	"playbook_on_no_hosts_matched": {2, "No Hosts Matched", false}, "playbook_on_no_hosts_remaining": {2, "No Hosts Remaining", false},
	"playbook_on_task_start": {2, "Task Started", false}, "playbook_on_vars_prompt": {1, "Variables Prompted", false}, "playbook_on_setup": {2, "Gathering Facts", false},
	"playbook_on_import_for_host": {2, "internal: on Import for Host", false}, "playbook_on_not_import_for_host": {2, "internal: on Not Import for Host", false},
	"playbook_on_play_start": {1, "Play Started", false}, "playbook_on_stats": {1, "Playbook Complete", false},
	"debug": {0, "Debug", false}, "verbose": {0, "Verbose", false}, "deprecated": {0, "Deprecated", false}, "warning": {0, "Warning", false},
	"system_warning": {0, "System Warning", false}, "error": {0, "Error", true},
}

// EventDisplay renders get_event_display2.
func EventDisplay(event, play, task, role string, data map[string]any) string {
	return EventDisplayIn(nil, event, play, task, role, data)
}

// EventDisplayIn is EventDisplay in l's language: the event type's name
// was a gettext_lazy choice name.
func EventDisplayIn(l *i18n.Locale, event, play, task, role string, data map[string]any) string {
	msg := event
	if t, ok := eventTypes[event]; ok {
		msg = l.Gettext(t.Display)
	}
	switch event {
	case "playbook_on_play_start":
		if play != "" {
			msg = fmt.Sprintf("%s (%s)", msg, play)
		}
	case "playbook_on_task_start":
		if task != "" {
			if c, _ := data["is_conditional"].(bool); c {
				msg = "Handler Notified"
			}
			if role != "" {
				msg = fmt.Sprintf("%s (%s | %s)", msg, role, task)
			} else {
				msg = fmt.Sprintf("%s (%s)", msg, task)
			}
		}
	}
	return msg
}

func (s *Server) serializeProjectUpdates(c *SerCtx, ups []*models.ProjectUpdate, detail bool) ([]any, error) {
	var userIDs, orgIDs, eeIDs, projIDs, credIDs, schedIDs []int64
	for _, pu := range ups {
		schedIDs = append(schedIDs, uniqueIDs(pu.ScheduleID)...)
		userIDs = append(userIDs, uniqueIDs(pu.CreatedByID, pu.ModifiedByID)...)
		orgIDs = append(orgIDs, uniqueIDs(pu.OrganizationID)...)
		eeIDs = append(eeIDs, uniqueIDs(pu.ExecutionEnvironmentID)...)
		projIDs = append(projIDs, uniqueIDs(pu.ProjectID, pu.UnifiedJobTemplateID)...)
		credIDs = append(credIDs, uniqueIDs(pu.CredentialID)...)
	}
	if err := c.PreloadUsers(userIDs); err != nil {
		return nil, err
	}
	if err := c.PreloadOrgs(orgIDs); err != nil {
		return nil, err
	}
	if err := c.PreloadEEs(eeIDs); err != nil {
		return nil, err
	}
	if err := c.PreloadCredentials(credIDs); err != nil {
		return nil, err
	}
	schedules, err := s.loadScheduleBriefs(c, schedIDs)
	if err != nil {
		return nil, err
	}
	projects := map[int64]*models.Project{}
	if len(projIDs) > 0 {
		rows, err := c.S.Q().Query(c.Ctx(), `SELECT `+models.ProjectColumns+` FROM `+models.ProjectFrom+` WHERE ujt.id = ANY($1)`, projIDs)
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			p, err := models.ScanProject(rows)
			if err != nil {
				rows.Close()
				return nil, err
			}
			projects[p.ID] = p
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return nil, err
		}
	}
	igNames := map[int64]struct {
		Name      string
		Container bool
	}{}
	out := make([]any, 0, len(ups))
	for _, pu := range ups {
		if pu.InstanceGroupID != nil {
			if _, ok := igNames[*pu.InstanceGroupID]; !ok {
				var name string
				var container bool
				if err := c.S.Q().QueryRow(c.Ctx(), `SELECT name, is_container_group FROM main_instancegroup WHERE id = $1`, *pu.InstanceGroupID).Scan(&name, &container); err == nil {
					igNames[*pu.InstanceGroupID] = struct {
						Name      string
						Container bool
					}{name, container}
				}
			}
		}
		out = append(out, s.serializeProjectUpdate(c, pu, projects, igNames, schedules, detail))
	}
	return out, nil
}

func (s *Server) serializeProjectUpdate(c *SerCtx, pu *models.ProjectUpdate, projects map[int64]*models.Project, igs map[int64]struct {
	Name      string
	Container bool
}, schedules map[int64]scheduleBrief, detail bool) *OMap {
	related := NewOMap()
	setURL(related, "created_by", "users", pu.CreatedByID)
	setURL(related, "modified_by", "users", pu.ModifiedByID)
	setURL(related, "credential", "credentials", pu.CredentialID)
	setURL(related, "unified_job_template", "projects", pu.UnifiedJobTemplateID)
	setURL(related, "schedule", "schedules", pu.ScheduleID)
	related.Set("stdout", SubURL("project_updates", pu.ID, "stdout"))
	setURL(related, "execution_environment", "execution_environments", pu.ExecutionEnvironmentID)
	setURL(related, "project", "projects", pu.ProjectID)
	related.Set("cancel", SubURL("project_updates", pu.ID, "cancel"))
	related.Set("scm_inventory_updates", SubURL("project_updates", pu.ID, "scm_inventory_updates"))
	related.Set("notifications", SubURL("project_updates", pu.ID, "notifications"))
	related.Set("events", SubURL("project_updates", pu.ID, "events"))

	summary := NewOMap()
	c.putSummary(summary, "organization", c.OrgSummary, pu.OrganizationID)
	c.putSummary(summary, "execution_environment", c.EESummary, pu.ExecutionEnvironmentID)
	if c.WantSummary("project") && pu.ProjectID != nil {
		if p, ok := projects[*pu.ProjectID]; ok {
			summary.Set("project", NewOMap().Set("id", p.ID).Set("name", p.Name).Set("description", p.Description).Set("status", p.Status).Set("scm_type", p.SCMType).Set("allow_override", p.AllowOverride))
		}
	}
	c.putSummary(summary, "credential", c.CredentialSummary, pu.CredentialID)
	if c.WantSummary("schedule") && pu.ScheduleID != nil {
		if sb, ok := schedules[*pu.ScheduleID]; ok {
			summary.Set("schedule", NewOMap().Set("id", sb.ID).Set("name", sb.Name).Set("description", sb.Description).Set("next_run", models.FormatTimePtr(sb.NextRun)))
		}
	}
	if c.WantSummary("unified_job_template") && pu.UnifiedJobTemplateID != nil {
		if p, ok := projects[*pu.UnifiedJobTemplateID]; ok {
			summary.Set("unified_job_template", NewOMap().Set("id", p.ID).Set("name", p.Name).Set("description", p.Description).Set("unified_job_type", "project_update"))
		}
	}
	if c.WantSummary("instance_group") && pu.InstanceGroupID != nil {
		if ig, ok := igs[*pu.InstanceGroupID]; ok {
			summary.Set("instance_group", NewOMap().Set("id", *pu.InstanceGroupID).Set("name", ig.Name).Set("is_container_group", ig.Container))
		}
	}
	c.putSummary(summary, "created_by", c.UserSummary, pu.CreatedByID)
	c.putSummary(summary, "modified_by", c.UserSummary, pu.ModifiedByID)
	if c.WantSummary("user_capabilities") {
		canDelete := false
		canStart := false
		if pu.ProjectID != nil {
			canDelete = c.HasRoleOn("main.project", *pu.ProjectID, "admin_role")
			canStart = c.HasRoleOn("main.project", *pu.ProjectID, "update_role")
		}
		summary.Set("user_capabilities", Caps("delete", canDelete, "start", canStart))
	}

	o := Base(NewOMap(), pu.ID, "project_update", URLFor("project_updates", pu.ID), related, summary, pu.Created, pu.Modified, pu.Name, pu.Description)
	// The list serializer put the unified job fields first, the detail one
	// the project options.
	options := func() {
		o.Set("local_path", pu.LocalPath).Set("scm_type", pu.SCMType).Set("scm_url", pu.SCMURL).Set("scm_branch", pu.SCMBranch).Set("scm_refspec", pu.SCMRefspec)
		o.Set("scm_clean", pu.SCMClean).Set("scm_track_submodules", pu.SCMTrackSubmodules).Set("scm_delete_on_update", pu.SCMDeleteOnUpdate)
		o.Set("credential", models.NullableID(pu.CredentialID)).Set("timeout", pu.Timeout).Set("scm_revision", pu.SCMRevision)
	}
	if detail {
		options()
	}
	o.Set("unified_job_template", models.NullableID(pu.UnifiedJobTemplateID)).Set("launch_type", pu.LaunchType).Set("status", pu.Status)
	o.Set("execution_environment", models.NullableID(pu.ExecutionEnvironmentID)).Set("failed", pu.Failed)
	o.Set("started", models.FormatTimePtr(pu.Started)).Set("finished", models.FormatTimePtr(pu.Finished)).Set("canceled_on", models.FormatTimePtr(pu.CanceledOn))
	o.Set("elapsed", pu.Elapsed)
	if detail {
		o.Set("job_args", pu.JobArgs).Set("job_cwd", pu.JobCwd)
		// rawJSON keeps the jsonb's key order (a Go map would sort the
		// keys) and its numbers as written.
		o.Set("job_env", rawJSON(pu.JobEnv, map[string]any{}))
	}
	o.Set("job_explanation", c.Loc().Gettext(pu.JobExplanation)).Set("execution_node", pu.ExecutionNode)
	if detail {
		o.Set("result_traceback", pu.ResultTraceback)
		o.Set("event_processing_finished", !models.ActiveStatuses[pu.Status])
	}
	launchedBy := NewOMap()
	if ancestor, err := s.ancestorBrief(c, &pu.UnifiedJob, &jobContext{briefs: map[int64]models.UnifiedJobBrief{}, schedules: schedules}); err == nil {
		launchedBy = s.launchedBy(c, ancestor, &jobContext{schedules: schedules})
	}
	o.Set("launched_by", launchedBy).Set("work_unit_id", nullIfEmpty(pu.WorkUnitID))
	if !detail {
		options()
	}
	o.Set("project", models.NullableID(pu.ProjectID)).Set("job_type", pu.JobType).Set("job_tags", pu.JobTags)
	o.Set("webhook_service", pu.WebhookService).Set("webhook_guid", pu.WebhookGUID)
	if detail {
		o.Set("host_status_counts", rawJSON(pu.HostStatusCounts, map[string]any{}))
		var plays, tasks int64
		_ = db.Tolerant(s.Q()).QueryRow(c.Ctx(), `SELECT count(*) FILTER (WHERE event = 'playbook_on_play_start'), count(*) FILTER (WHERE event = 'playbook_on_task_start') FROM main_projectupdateevent WHERE project_update_id = $1 AND job_created = $2`, pu.ID, pu.Created).Scan(&plays, &tasks)
		o.Set("playbook_counts", NewOMap().Set("play_count", plays).Set("task_count", tasks))
	}
	return o
}

func nullIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}

// --- events -----------------------------------------------------------------

var projectUpdateEventFields = &FieldSet{
	Model: "ProjectUpdateEvent",
	Fields: map[string]Field{
		"id": {SQL: "e.id", Kind: KindInt}, "event": {SQL: "e.event"}, "counter": {SQL: "e.counter", Kind: KindInt}, "stdout": {SQL: "e.stdout"},
		"failed": {SQL: "e.failed", Kind: KindBool}, "changed": {SQL: "e.changed", Kind: KindBool}, "uuid": {SQL: "e.uuid"}, "playbook": {SQL: "e.playbook"},
		"play": {SQL: "e.play"}, "task": {SQL: "e.task"}, "role": {SQL: "e.role"}, "verbosity": {SQL: "e.verbosity", Kind: KindInt},
		"start_line": {SQL: "e.start_line", Kind: KindInt}, "end_line": {SQL: "e.end_line", Kind: KindInt}, "created": {SQL: "e.created", Kind: KindDateTime},
		"modified": {SQL: "e.modified", Kind: KindDateTime}, "project_update": {SQL: "e.project_update_id", Kind: KindFK}, "event_data": {SQL: "e.event_data", Kind: KindJSON},
	},
	SearchFields: []string{"stdout"},
}

const eventColumns = `e.id, e.created, e.modified, e.event, e.event_data, e.failed, e.changed, e.uuid, e.playbook, e.play, e.role, e.task, e.counter, e.stdout, e.verbosity, e.start_line, e.end_line`

func scanEvent(rows pgx.Rows, jobID *int64) (*models.JobEvent, error) {
	e := &models.JobEvent{}
	var data string
	if err := rows.Scan(&e.ID, &e.Created, &e.Modified, &e.Event, &data, &e.Failed, &e.Changed, &e.UUID, &e.Playbook, &e.Play, &e.Role, &e.Task, &e.Counter, &e.Stdout, &e.Verbosity, &e.StartLine, &e.EndLine, jobID); err != nil {
		return nil, err
	}
	e.EventData = map[string]any{}
	if data != "" {
		_ = json.Unmarshal([]byte(data), &e.EventData)
	}
	e.EventDataText = data
	if jobID != nil {
		e.JobID = *jobID
	}
	return e, nil
}

func (s *Server) projectUpdateEvents(w http.ResponseWriter, r *http.Request) error {
	_, pu, err := projectUpdateObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	spec := ListSpec{Model: "ProjectUpdateEvent", From: "main_projectupdateevent e", Columns: eventColumns + ", e.project_update_id", PK: "e.id", Fields: projectUpdateEventFields, DefaultOrder: []string{"id"}}
	// ?limit= selects the limit paginator the old UI used for output.
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
		q.And("e.project_update_id = " + q.Arg(pu.ID) + " AND e.job_created = " + q.Arg(pu.Created))
	}, func(rows pgx.Rows) (any, error) {
		var jid int64
		return scanEvent(rows, &jid)
	})
	if err != nil {
		return err
	}
	results := make([]any, 0, len(rows))
	for _, row := range rows {
		e := row.(*models.JobEvent)
		results = append(results, s.serializeProjectUpdateEvent(Loc(r), e, pu))
	}
	WriteJSON(w, 200, Paginate(r, page, count, results))
	return nil
}

func (s *Server) serializeProjectUpdateEvent(l *i18n.Locale, e *models.JobEvent, pu *models.ProjectUpdate) *OMap {
	o := NewOMap()
	o.Set("id", e.ID).Set("type", "project_update_event").Set("url", "")
	o.Set("related", NewOMap().Set("project_update", URLFor("project_updates", pu.ID)))
	summary := NewOMap().Set("project_update", NewOMap().Set("id", pu.ID).Set("name", pu.Name).Set("description", pu.Description).Set("status", pu.Status).Set("failed", pu.Failed))
	summary.Set("role", NewOMap())
	o.Set("summary_fields", summary)
	o.Set("created", models.FormatTime(e.Created)).Set("modified", models.FormatTime(e.Modified))
	o.Set("event", e.Event).Set("counter", e.Counter).Set("event_display", EventDisplayIn(l, e.Event, e.Play, e.Task, e.Role, e.EventData))
	// Rows stored before events were redacted on the way in are
	// redacted on the way out.
	o.Set("event_data", redactURIsOrdered(eventDataOut(e)))
	lvl := 0
	if t, ok := eventTypes[e.Event]; ok {
		lvl = t.Level
	}
	o.Set("event_level", lvl).Set("failed", e.Failed).Set("changed", e.Changed).Set("uuid", e.UUID)
	host, _ := e.EventData["host"].(string)
	o.Set("host_name", host).Set("playbook", e.Playbook).Set("play", e.Play).Set("task", e.Task).Set("role", e.Role)
	o.Set("stdout", redact.URIs(e.Stdout)).Set("start_line", e.StartLine).Set("end_line", e.EndLine).Set("verbosity", e.Verbosity).Set("project_update", pu.ID)
	return o
}

// projectUpdateStdout serves the collected stdout in the stdout view's
// formats.
func (s *Server) projectUpdateStdout(w http.ResponseWriter, r *http.Request) error {
	_, pu, err := projectUpdateObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	return s.unifiedJobStdout(w, r, "main_projectupdateevent", "project_update_id", pu.ID, pu.Created, "project_update")
}

// stripANSI removes colour escape sequences.
func stripANSI(s string) string {
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		if s[i] == 0x1b && i+1 < len(s) && s[i+1] == '[' {
			j := i + 2
			for j < len(s) && ((s[j] >= '0' && s[j] <= '9') || s[j] == ';') {
				j++
			}
			if j < len(s) {
				j++
			}
			i = j - 1
			continue
		}
		b.WriteByte(s[i])
	}
	return b.String()
}

func (s *Server) projectUpdateCancelView(w http.ResponseWriter, r *http.Request) error {
	_, pu, err := projectUpdateObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	WriteJSON(w, 200, NewOMap().Set("can_cancel", models.ActiveStatuses[pu.Status]).Set("job_explanation", Tr(r, pu.JobExplanation)))
	return nil
}

func (s *Server) projectUpdateCancel(w http.ResponseWriter, r *http.Request) error {
	u, pu, err := projectUpdateObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	if !(u.IsSuperuser || (pu.CreatedByID != nil && *pu.CreatedByID == u.ID) || (pu.ProjectID != nil && c.HasRoleOn("main.project", *pu.ProjectID, "admin_role"))) {
		return ErrForbidden
	}
	if !models.ActiveStatuses[pu.Status] {
		return MethodNotAllowed(r.Method)
	}
	if err := s.cancelJob(r, pu.ID, pu.Status, pu.UnifiedJobTemplateID); err != nil {
		return err
	}
	w.WriteHeader(http.StatusAccepted)
	return nil
}

// jobStdout rebuilds a job's stdout the way the old result_stdout_raw_handle
// did: every event's non-empty stdout chunk becomes a line of a COPY, so
// chunks are joined with a newline and the CRLF line endings inside a chunk
// become newlines.
func (s *Server) jobStdout(r *http.Request, table, jobColumn string, jobID int64, created time.Time) (string, int, error) {
	return s.jobStdoutCtx(r.Context(), table, jobColumn, jobID, created)
}

// jobStdoutCtx is jobStdout outside a request.
// created is the job's creation time, the event tables' partition key.
func (s *Server) jobStdoutCtx(ctx context.Context, table, jobColumn string, jobID int64, created time.Time) (string, int, error) {
	rows, err := s.Q().Query(ctx, fmt.Sprintf(`SELECT stdout FROM %s WHERE %s = $1 AND job_created = $2 AND stdout <> '' ORDER BY start_line`, table, jobColumn), jobID, created)
	if err != nil {
		return "", 0, err
	}
	defer rows.Close()
	var chunks []string
	for rows.Next() {
		var out string
		if err := rows.Scan(&out); err != nil {
			return "", 0, err
		}
		chunks = append(chunks, strings.ReplaceAll(out, "\r\n", "\n"))
	}
	content := strings.Join(chunks, "\n")
	if content != "" {
		content += "\n"
	}
	if table == "main_projectupdateevent" {
		// result_stdout_raw(redact_sensitive=True): SCM tools print the
		// clone URL, credentials included.
		content = redact.URIs(content)
	}
	return content, strings.Count(content, "\n"), rows.Err()
}

// streamJobStdout writes a job's output as jobStdoutCtx builds it (each
// event's text and a newline, URLs redacted for project updates), event by
// event, so a download of any size holds one event in memory at a time.
func (s *Server) streamJobStdout(ctx context.Context, w io.Writer, table, jobColumn string, jobID int64, created time.Time, strip bool) error {
	rows, err := s.Q().Query(ctx, fmt.Sprintf(`SELECT stdout FROM %s WHERE %s = $1 AND job_created = $2 AND stdout <> '' ORDER BY start_line`, table, jobColumn), jobID, created)
	if err != nil {
		return err
	}
	defer rows.Close()
	bw := bufio.NewWriterSize(w, 64<<10)
	for rows.Next() {
		var out string
		if err := rows.Scan(&out); err != nil {
			return err
		}
		out = strings.ReplaceAll(out, "\r\n", "\n")
		if table == "main_projectupdateevent" {
			out = redact.URIs(out)
		}
		if strip {
			out = stripANSI(out)
		}
		if _, err := bw.WriteString(out + "\n"); err != nil {
			return nil // the client went away
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}
	_ = bw.Flush()
	return nil
}

// jobStdoutBatch is jobStdoutCtx for several jobs of one event table in
// one statement; created[i] is the creation time of jobIDs[i]. Jobs without
// output are absent from the result.
func (s *Server) jobStdoutBatch(ctx context.Context, table, jobColumn string, jobIDs []int64, created []time.Time) (map[int64]string, error) {
	out := map[int64]string{}
	if len(jobIDs) == 0 {
		return out, nil
	}
	rows, err := s.Q().Query(ctx, fmt.Sprintf(`SELECT %[2]s, stdout FROM %[1]s WHERE %[2]s = ANY($1) AND job_created = ANY($2) AND stdout <> '' ORDER BY %[2]s, start_line`, table, jobColumn), jobIDs, created)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	chunks := map[int64][]string{}
	for rows.Next() {
		var id int64
		var text string
		if err := rows.Scan(&id, &text); err != nil {
			return nil, err
		}
		chunks[id] = append(chunks[id], strings.ReplaceAll(text, "\r\n", "\n"))
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	for id, c := range chunks {
		content := strings.Join(c, "\n") + "\n"
		if table == "main_projectupdateevent" {
			content = redact.URIs(content)
		}
		out[id] = content
	}
	return out, nil
}
