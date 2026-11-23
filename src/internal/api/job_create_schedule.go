package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/ctrliq/ascender/internal/activity"
	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/models"
	"github.com/jackc/pgx/v5"
)

// jobCreateSchedulePost is JobCreateSchedule.post: a disabled monthly
// schedule of the job's template that launches with what the job was
// launched with (its launch configuration).
func (s *Server) jobCreateSchedulePost(w http.ResponseWriter, r *http.Request) error {
	u, jb, err := jobObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	ctx := r.Context()
	cfg, err := models.GetLaunchConfig(ctx, s.Q(), jb.ID)
	if err != nil {
		return err
	}
	var jt *models.JobTemplate
	if jb.JobTemplateID != nil {
		if jt, err = models.GetJobTemplate(ctx, s.Q(), *jb.JobTemplateID); err != nil && !db.IsNoRows(err) {
			return err
		}
	}
	c := s.NewSerCtx(r, true)
	// obj_permission_type = 'start'
	if err := s.jobCanStart(c, jb, cfg, jt); err != nil {
		return err
	}
	creds, err := models.JobCredentials(ctx, s.Q(), []int64{jb.ID})
	if err != nil {
		return err
	}
	needsPasswords := len(passwordsNeeded(creds[jb.ID])) > 0
	if needsPasswords || jb.InventoryID == nil || cfg == nil || jb.UnifiedJobTemplateID == nil {
		msg := "Cannot create schedule because a related resource is missing."
		switch {
		case needsPasswords:
			msg = "Cannot create schedule because job requires credential passwords."
		case cfg == nil:
			msg = "Cannot create schedule because job was launched by legacy method."
		}
		WriteJSON(w, http.StatusBadRequest, NewOMap().Set("error", msg))
		return nil
	}
	// A name of its own: "- number <n>" after the first.
	name := fmt.Sprintf("Auto-generated schedule from job %d", jb.ID)
	taken := map[string]bool{}
	rows, err := s.Q().Query(ctx, `SELECT name FROM main_schedule WHERE name LIKE $1 || '%'`, name)
	if err != nil {
		return err
	}
	for rows.Next() {
		var n string
		if err := rows.Scan(&n); err != nil {
			rows.Close()
			return err
		}
		taken[n] = true
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	if taken[name] {
		idx := 1
		alt := fmt.Sprintf("%s - number %d", name, idx)
		for taken[alt] {
			idx++
			alt = fmt.Sprintf("%s - number %d", name, idx)
		}
		name = alt
	}
	t, err := s.loadScheduleTemplate(ctx, *jb.UnifiedJobTemplateID)
	if err != nil {
		return err
	}
	// ScheduleAccess.can_add: the template to run, and the prompts it
	// carries over.
	prompts := cfg.Prompts()
	if !s.scheduleCanStart(c, t) || !s.launchConfigAllowed(c, jt, &acceptedPrompts{JobPrompts: *prompts}) {
		return ErrForbidden
	}
	var extra string
	_ = db.Tolerant(s.Q()).QueryRow(ctx, `SELECT COALESCE(extra_data, '') FROM main_joblaunchconfig WHERE id = $1`, cfg.ID).Scan(&extra)
	if extra == "" {
		extra = "{}"
	}
	now := time.Now()
	sc := &schedule{Name: name, Enabled: false, RRule: now.UTC().Format("DTSTART:20060102T150405") + "Z RRULE:FREQ=MONTHLY;INTERVAL=1", ExtraData: extra,
		CreatedByID: &u.ID, ModifiedByID: &u.ID, UnifiedJobTemplateID: *jb.UnifiedJobTemplateID, CharPrompts: cfg.CharPrompts, InventoryID: cfg.InventoryID,
		SurveyPasswords: cfg.SurveyPasswords, ExecutionEnvironmentID: cfg.ExecutionEnvironmentID}
	if sc.CharPrompts == nil {
		sc.CharPrompts = map[string]any{}
	}
	if sc.SurveyPasswords == nil {
		sc.SurveyPasswords = map[string]any{}
	}
	next, start, end, coerced, err := scheduleComputed(sc.RRule, sc.Enabled, now)
	if err != nil {
		return err
	}
	sc.NextRun, sc.DTStart, sc.DTEnd, sc.RRule = next, start, end, coerced
	chars, _ := json.Marshal(sc.CharPrompts)
	passwords, _ := json.Marshal(sc.SurveyPasswords)
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if err := tx.QueryRow(ctx, `INSERT INTO main_schedule (created, modified, description, name, enabled, dtstart, dtend, rrule, next_run, extra_data, created_by_id, modified_by_id, unified_job_template_id, char_prompts, inventory_id, survey_passwords, execution_environment_id)
			VALUES (now(), now(), '', $1, $2, $3, $4, $5, $6, $7, $8, $8, $9, $10::jsonb, $11, $12::jsonb, $13) RETURNING id, created, modified`,
			sc.Name, sc.Enabled, sc.DTStart, sc.DTEnd, sc.RRule, sc.NextRun, sc.ExtraData, u.ID, sc.UnifiedJobTemplateID, string(chars), sc.InventoryID, string(passwords), sc.ExecutionEnvironmentID).Scan(&sc.ID, &sc.Created, &sc.Modified); err != nil {
			return err
		}
		if err := s.Activity.Record(ctx, tx, activity.Entry{Operation: "create", Object1: "schedule", Changes: s.scheduleChanges(ctx, tx, sc, t), ActorID: &u.ID, Links: map[string]int64{"schedule": sc.ID}}); err != nil {
			return err
		}
		for _, id := range cfg.Credentials {
			if _, err := tx.Exec(ctx, `INSERT INTO main_schedule_credentials (schedule_id, credential_id) VALUES ($1, $2)`, sc.ID, id); err != nil {
				return err
			}
			// The view added each item with getattr(schedule, rel).add(),
			// which writes an "associate" entry per item after the
			// schedule's "create" entry.
			if err := s.recordAssociation(ctx, tx, &u.ID, "associate", scheduleCredentialsRel, "schedule", sc.ID, "credential", id); err != nil {
				return err
			}
		}
		for _, id := range cfg.Labels {
			if _, err := tx.Exec(ctx, `INSERT INTO main_schedule_labels (schedule_id, label_id) VALUES ($1, $2)`, sc.ID, id); err != nil {
				return err
			}
			if err := s.recordAssociation(ctx, tx, &u.ID, "associate", scheduleLabels.Relationship, "schedule", sc.ID, "label", id); err != nil {
				return err
			}
		}
		for i, id := range cfg.InstanceGroups {
			if _, err := tx.Exec(ctx, `INSERT INTO main_scheduleinstancegroupmembership (position, instancegroup_id, schedule_id) VALUES ($1, $2, $3)`, i, id, sc.ID); err != nil {
				return err
			}
			if err := s.recordAssociation(ctx, tx, &u.ID, "associate", scheduleInstanceGroupRel, "schedule", sc.ID, "instance_group", id); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return err
	}
	s.EmitScheduleChanged(ctx, sc.ID)
	o, err := s.serializeSchedule(c, sc)
	if err != nil {
		return err
	}
	w.Header().Set("Location", URLFor("schedules", sc.ID))
	WriteJSON(w, http.StatusCreated, o)
	return nil
}
