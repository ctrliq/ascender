package api

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/activity"
	"github.com/ctrliq/ascender/internal/auth"
	"github.com/ctrliq/ascender/internal/crypto"
	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/models"
	"github.com/ctrliq/ascender/internal/rrule"
)

// Schedules: creating, changing and deleting them (ScheduleSerializer and
// LaunchConfigurationBaseSerializer), their sub-lists, the rrule preview
// and the scheduler pass that launches the ones that are due.

// --- rrule validation (SchedulePreviewSerializer.validate_rrule) -----------

var (
	rruleByDayNumericRe = regexp.MustCompile(`.*?BYDAY[:=][0-9]+[a-zA-Z]{2}`)
	rruleDTStartRe      = regexp.MustCompile(`.*?(DTSTART(;[^:]+)?:[0-9]+T[0-9]+Z?)`)
	rruleNaiveStartRe   = regexp.MustCompile(`.*?(DTSTART:[0-9]+T[0-9]+) `)
	rruleRuleRe         = regexp.MustCompile(`.*?(RULE:[^\s]*)`)
	rruleCountRe        = regexp.MustCompile(`.*?(COUNT=[0-9]+)`)
)

// validateRRule returns the old serializer's error list for an rrule, or
// nothing when it is acceptable.
func validateRRule(value string) []string {
	var errs []string
	starts := rruleDTStartRe.FindAllStringSubmatch(value, -1)
	if len(starts) == 0 {
		errs = append(errs, "Valid DTSTART required in rrule. Value should start with: DTSTART:YYYYMMDDTHHMMSSZ")
	}
	if rruleNaiveStartRe.MatchString(value) {
		errs = append(errs, "DTSTART cannot be a naive datetime.  Specify ;TZINFO= or YYYYMMDDTHHMMSSZZ.")
	}
	if len(starts) > 1 {
		errs = append(errs, "Multiple DTSTART is not supported.")
	}
	lower := strings.ToLower(value)
	if !strings.Contains(lower, "rrule:") {
		errs = append(errs, "One or more rule required in rrule.")
	}
	if strings.Contains(lower, "exdate:") {
		return []string{"EXDATE not allowed in rrule."}
	}
	if strings.Contains(lower, "rdate:") {
		return []string{"RDATE not allowed in rrule."}
	}
	for _, m := range rruleRuleRe.FindAllStringSubmatch(value, -1) {
		rule := m[1]
		rl := strings.ToLower(rule)
		if !strings.Contains(rl, "interval") {
			errs = append(errs, "INTERVAL required in rrule: "+rule)
		} else if strings.Contains(rl, "secondly") {
			errs = append(errs, "SECONDLY is not supported: "+rule)
		}
		if rruleByDayNumericRe.MatchString(rule) {
			errs = append(errs, "BYDAY with numeric prefix not supported: "+rule)
		}
		if strings.Contains(rule, "COUNT") && strings.Contains(rule, "UNTIL") {
			errs = append(errs, "RRULE may not contain both COUNT and UNTIL: "+rule)
		}
		if cm := rruleCountRe.FindStringSubmatch(rule); cm != nil {
			if n, err := strconv.Atoi(strings.TrimPrefix(cm[1], "COUNT=")); err == nil && n > 999 {
				errs = append(errs, "COUNT > 999 is unsupported: "+rule)
			}
		}
	}
	if _, _, err := rrule.ParseSchedule(value, time.Now()); err != nil {
		errs = append(errs, "rrule parsing failed validation: "+err.Error())
	}
	return errs
}

// --- the template a schedule belongs to --------------------------------------

// scheduleTemplate is what the schedule code needs to know about the
// unified job template a schedule runs.
type scheduleTemplate struct {
	ID    int64
	Model string // jobtemplate, workflowjobtemplate, project, inventorysource, systemjobtemplate
	Name  string
	JT    *models.JobTemplate
	WFT   *models.WorkflowJobTemplate
	Proj  *models.Project
	// inventory sources
	SourceInventoryID *int64
	SourceKind        string
	// system job templates
	SystemJobType string
}

func (s *Server) loadScheduleTemplate(ctx context.Context, id int64) (*scheduleTemplate, error) {
	return s.loadScheduleTemplateQ(ctx, s.Q(), id)
}

// loadScheduleTemplateQ reads through q, a transaction when the caller is
// in one.
func (s *Server) loadScheduleTemplateQ(ctx context.Context, q db.Querier, id int64) (*scheduleTemplate, error) {
	var ct int64
	var name string
	if err := q.QueryRow(ctx, `SELECT polymorphic_ctype_id, name FROM main_unifiedjobtemplate WHERE id = $1`, id).Scan(&ct, &name); err != nil {
		return nil, err
	}
	t := &scheduleTemplate{ID: id, Name: name, Model: strings.TrimPrefix(s.CT.Model(ct), "main.")}
	var err error
	switch t.Model {
	case "jobtemplate":
		t.JT, err = models.GetJobTemplate(ctx, q, id)
	case "workflowjobtemplate":
		t.WFT, err = models.GetWorkflowJobTemplate(ctx, q, id)
	case "project":
		t.Proj, err = models.GetProject(ctx, q, id)
	case "inventorysource":
		err = q.QueryRow(ctx, `SELECT inventory_id, source FROM main_inventorysource WHERE unifiedjobtemplate_ptr_id = $1`, id).Scan(&t.SourceInventoryID, &t.SourceKind)
	case "systemjobtemplate":
		err = q.QueryRow(ctx, `SELECT job_type FROM main_systemjobtemplate WHERE unifiedjobtemplate_ptr_id = $1`, id).Scan(&t.SystemJobType)
	}
	return t, err
}

// unifiedJobType is the API's name of the jobs a template produces.
func (t *scheduleTemplate) unifiedJobType() string {
	switch t.Model {
	case "jobtemplate":
		return "job"
	case "workflowjobtemplate":
		return "workflow_job"
	case "project":
		return "project_update"
	case "inventorysource":
		return "inventory_update"
	case "systemjobtemplate":
		return "system_job"
	}
	return ""
}

// canStart is the template's start permission (execute/update roles),
// which creating a schedule requires.
func (s *Server) scheduleCanStart(c *SerCtx, t *scheduleTemplate) bool {
	if c.User == nil {
		return false
	}
	if c.User.IsSuperuser {
		return true
	}
	switch t.Model {
	case "jobtemplate":
		return c.HasRoleOn("main.jobtemplate", t.ID, "execute_role")
	case "workflowjobtemplate":
		return c.HasRoleOn("main.workflowjobtemplate", t.ID, "execute_role")
	case "project":
		return c.HasRoleOn("main.project", t.ID, "update_role")
	case "inventorysource":
		return t.SourceInventoryID != nil && c.HasRoleOn("main.inventory", *t.SourceInventoryID, "update_role")
	}
	return false
}

// canAdmin is the template's change permission.
func (s *Server) scheduleCanAdmin(c *SerCtx, t *scheduleTemplate) bool {
	if c.User == nil {
		return false
	}
	if c.User.IsSuperuser {
		return true
	}
	switch t.Model {
	case "jobtemplate":
		return c.HasRoleOn("main.jobtemplate", t.ID, "admin_role")
	case "workflowjobtemplate":
		return c.HasRoleOn("main.workflowjobtemplate", t.ID, "admin_role")
	case "project":
		return c.HasRoleOn("main.project", t.ID, "admin_role")
	case "inventorysource":
		return t.SourceInventoryID != nil && c.HasRoleOn("main.inventory", *t.SourceInventoryID, "admin_role")
	}
	return false
}

// scheduleCanChange is ScheduleAccess.can_change: admins of the template,
// or the schedule's creator with start permission.
func (s *Server) scheduleCanChange(c *SerCtx, sc *schedule, t *scheduleTemplate) bool {
	if s.scheduleCanAdmin(c, t) {
		return true
	}
	return c.User != nil && sc.CreatedByID != nil && *sc.CreatedByID == c.User.ID && s.scheduleCanStart(c, t)
}

// scheduleObj is a schedule, readable as the schedule list filters.
var scheduleObj = &pathObject[*schedule]{
	model: "Schedule",
	get: func(ctx context.Context, q db.Querier, id int64) (*schedule, error) {
		return scanFirst[*schedule](ctx, q, `SELECT `+scheduleColumns+` FROM main_schedule sc WHERE sc.id = $1`, []any{id}, scanSchedule)
	},
	readable: func(c *SerCtx, sc *schedule) bool {
		q := NewQuery()
		c.S.scheduleAccess(q, c.User)
		ok, err := db.Exists(c.Ctx(), c.Q(), `SELECT 1 FROM main_schedule sc WHERE sc.id = `+q.Arg(sc.ID)+` AND `+strings.Join(q.Where, " AND "), q.Args...)
		return err == nil && ok
	},
}

// --- computed fields --------------------------------------------------------

// scheduleComputed is next_run, dtstart and dtend of a schedule
// (Schedule.update_computed_fields_no_save), and the rrule as the model
// stored it: naive UNTIL values coerced to UTC.
func scheduleComputed(rruleText string, enabled bool, now time.Time) (next, start, end *time.Time, coerced string, err error) {
	set, coerced, err := rrule.ParseSchedule(rruleText, now)
	if err != nil {
		return nil, nil, nil, "", err
	}
	if enabled {
		o, ok := set.After(now, false)
		for ok && !o.Exists {
			o, ok = set.After(o.Time, false)
		}
		if ok {
			t := o.Time.UTC()
			next = &t
		}
	}
	if o, ok := set.First(); ok {
		t := o.Time.UTC()
		start = &t
	}
	if o, ok := set.Last(); ok {
		t := o.Time.UTC()
		end = &t
	}
	return next, start, end, coerced, nil
}

// UpdateScheduleComputedFields recomputes a schedule's next_run, dtstart and
// dtend and the template's next run; it reports whether anything changed.
func (s *Server) UpdateScheduleComputedFields(ctx context.Context, id int64, now time.Time) (bool, error) {
	var rruleText string
	var enabled bool
	var ujt int64
	var curNext, curStart, curEnd *time.Time
	if err := s.Q().QueryRow(ctx, `SELECT rrule, enabled, unified_job_template_id, next_run, dtstart, dtend FROM main_schedule WHERE id = $1`, id).Scan(&rruleText, &enabled, &ujt, &curNext, &curStart, &curEnd); err != nil {
		return false, err
	}
	next, start, end, _, err := scheduleComputed(rruleText, enabled, now)
	if err != nil {
		return false, err
	}
	if sameTime(next, curNext) && sameTime(start, curStart) && sameTime(end, curEnd) {
		return false, nil
	}
	if _, err := s.Q().Exec(ctx, `UPDATE main_schedule SET next_run = $2, dtstart = $3, dtend = $4 WHERE id = $1`, id, next, start, end); err != nil {
		return false, err
	}
	s.EmitScheduleChanged(ctx, id)
	return true, s.updateTemplateNextRun(ctx, ujt)
}

// scheduleCatchUp is how long after a scheduler pass a starting task
// process still leaves the occurrences that came due since to the next pass.
// Within it the scheduler is running in another task process, or was until
// this one restarted. Past it the scheduler has been stopped, and what it
// missed is skipped.
const scheduleCatchUp = 5 * time.Minute

// SyncSchedules is dispatch_startup's "Syncing Schedules": every schedule's
// computed fields are brought up to date. A schedule a migration created
// (the cleanup jobs' own) has no next run until something computes one.
//
// dispatch_startup moved every next run past the present. The scheduler
// launches a schedule when it finds its next run between the previous pass
// and now, so an occurrence that came due since the previous pass was
// dropped whenever a task process started before the next one. Those are
// left as they are here, for the pass to launch, unless the previous pass
// is longer ago than scheduleCatchUp: after a long stop, or in a database
// restored from a backup, the occurrences missed are skipped as they always
// were rather than all launched at once.
//
// The caller holds the scheduler's lock, so no pass runs meanwhile.
func (s *Server) SyncSchedules(ctx context.Context) {
	now := time.Now().UTC()
	var lastRun *time.Time
	var t time.Time
	switch err := s.Q().QueryRow(ctx, `SELECT schedule_last_run FROM main_ascenderschedulestate ORDER BY id LIMIT 1`).Scan(&t); {
	case err == nil:
		lastRun = &t
	case !db.IsNoRows(err):
		s.Log.ErrorContext(ctx, "sync schedules", "err", err)
		return
	}
	rows, err := s.Q().Query(ctx, `SELECT id, enabled, next_run FROM main_schedule ORDER BY id`)
	if err != nil {
		s.Log.ErrorContext(ctx, "sync schedules", "err", err)
		return
	}
	var ids []int64
	for rows.Next() {
		var id int64
		var enabled bool
		var nextRun *time.Time
		if err := rows.Scan(&id, &enabled, &nextRun); err != nil {
			rows.Close()
			s.Log.ErrorContext(ctx, "sync schedules", "err", err)
			return
		}
		if !dueForSchedulerPass(enabled, nextRun, lastRun, now) {
			ids = append(ids, id)
		}
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		s.Log.ErrorContext(ctx, "sync schedules", "err", err)
		return
	}
	for _, id := range ids {
		if _, err := s.UpdateScheduleComputedFields(ctx, id, now); err != nil {
			s.Log.ErrorContext(ctx, fmt.Sprintf("Failed to rebuild schedule %d.", id), "err", err)
		}
	}
}

// dueForSchedulerPass reports whether a schedule's next run is one the next
// scheduler pass will launch, given the time of the previous pass (nil when
// there has not been one): it came due after that pass, and that pass is
// recent enough for what followed it to still be caught up on.
func dueForSchedulerPass(enabled bool, nextRun, lastRun *time.Time, now time.Time) bool {
	if !enabled || nextRun == nil || lastRun == nil || now.Sub(*lastRun) >= scheduleCatchUp {
		return false
	}
	return nextRun.After(*lastRun) && !nextRun.After(now)
}

func sameTime(a, b *time.Time) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	return a.Equal(*b)
}

// updateTemplateNextRun is UnifiedJobTemplate.update_computed_fields: the
// template points at its enabled schedule with the latest next_run.
func (s *Server) updateTemplateNextRun(ctx context.Context, ujt int64) error {
	_, err := s.Q().Exec(ctx, `UPDATE main_unifiedjobtemplate t SET next_schedule_id = n.id, next_job_run = n.next_run
		FROM (SELECT id, next_run FROM main_schedule WHERE unified_job_template_id = $1 AND enabled AND next_run IS NOT NULL ORDER BY next_run DESC, id LIMIT 1) n
		WHERE t.id = $1 AND (t.next_schedule_id IS DISTINCT FROM n.id OR t.next_job_run IS DISTINCT FROM n.next_run)`, ujt)
	return err
}

// --- the form ---------------------------------------------------------------

// scheduleInput is what a create or update request carries.
type scheduleInput struct {
	fields  map[string]bool // keys the client sent
	prompts map[string]any  // char prompts the client sent, nil for null
	extra   map[string]any
	req     *launchRequest
}

// scheduleFromForm reads the schedule's own fields and the launch
// configuration fields into sc, with the serializer's errors.
func (s *Server) scheduleFromForm(ctx context.Context, f *Form, sc *schedule, t *scheduleTemplate) *scheduleInput {
	in := &scheduleInput{fields: map[string]bool{}, prompts: map[string]any{}, req: &launchRequest{}}
	for _, k := range f.Body.Keys() {
		in.fields[k] = true
	}
	sc.Name = f.String("name", true, 512, sc.Name)
	sc.Description = f.String("description", false, 0, sc.Description)
	if f.Has("rrule") || !f.Partial {
		v := f.String("rrule", true, 0, sc.RRule)
		if f.Has("rrule") && len(f.Errs["rrule"]) == 0 {
			if errs := validateRRule(v); len(errs) > 0 {
				f.Errs["rrule"] = errs
			} else {
				sc.RRule = v
			}
		}
	}
	sc.Enabled = f.Bool("enabled", sc.Enabled)
	s.launchConfigFromForm(ctx, f, in, &sc.InventoryID, &sc.ExecutionEnvironmentID)
	return in
}

// launchConfigFromForm reads the prompt fields every saved launch
// configuration has (LaunchConfigurationBaseSerializer): inventory,
// execution environment, the char prompts and extra_data.
func (s *Server) launchConfigFromForm(ctx context.Context, f *Form, in *scheduleInput, inventory, ee **int64) {
	if f.Has("inventory") {
		if id, ok := f.ID("inventory", *inventory, false, s.existsIn(ctx, "main_inventory")); ok {
			*inventory = id
			in.req.Inventory = id
		}
	}
	if f.Has("execution_environment") {
		if id, ok := f.ID("execution_environment", *ee, false, s.existsIn(ctx, "main_executionenvironment")); ok {
			*ee = id
			in.req.ExecutionEnv = id
		}
	}
	strPrompt := func(key string, maxLen int) {
		if !f.Has(key) {
			return
		}
		raw, _ := f.Body.Get(key)
		if raw == nil {
			in.prompts[key] = nil
			return
		}
		v := f.String(key, false, maxLen, "")
		if len(f.Errs[key]) > 0 {
			return
		}
		in.prompts[key] = v
	}
	strPrompt("scm_branch", 1024)
	strPrompt("job_tags", 0)
	strPrompt("skip_tags", 0)
	strPrompt("limit", 0)
	if f.Has("job_type") {
		if raw, _ := f.Body.Get("job_type"); raw == nil {
			in.prompts["job_type"] = nil
		} else {
			v := f.Choice("job_type", "", [][2]string{{"run", "Run"}, {"check", "Check"}}, false)
			if len(f.Errs["job_type"]) == 0 {
				in.prompts["job_type"] = v
			}
		}
	}
	if f.Has("diff_mode") {
		if raw, _ := f.Body.Get("diff_mode"); raw == nil {
			in.prompts["diff_mode"] = nil
		} else {
			in.prompts["diff_mode"] = f.Bool("diff_mode", false)
		}
	}
	if f.Has("verbosity") {
		if raw, _ := f.Body.Get("verbosity"); raw == nil {
			in.prompts["verbosity"] = nil
		} else {
			zero, five := int64(0), int64(5)
			v := f.Int("verbosity", 0, &zero, &five)
			if len(f.Errs["verbosity"]) == 0 {
				in.prompts["verbosity"] = v
			}
		}
	}
	for _, key := range []string{"forks", "job_slice_count", "timeout"} {
		if !f.Has(key) {
			continue
		}
		if raw, _ := f.Body.Get(key); raw == nil {
			in.prompts[key] = nil
			continue
		}
		var min *int64
		if key != "timeout" {
			zero := int64(0)
			min = &zero
		}
		v := f.Int(key, 0, min, nil)
		if len(f.Errs[key]) == 0 {
			in.prompts[key] = v
		}
	}
	if f.Has("extra_data") {
		raw, _ := f.Body.Get("extra_data")
		switch v := raw.(type) {
		case nil:
			in.extra = map[string]any{}
		case string:
			m, err := ParseVars(v)
			switch {
			case err != nil:
				f.Errs.Add("extra_data", "Cannot parse as JSON (error: "+err.Error()+") or YAML (error: "+err.Error()+").")
			case refusesCiphertext(auth.UserFrom(ctx), m):
				f.Errs.Add("extra_data", encryptedValueMsg)
			default:
				in.extra = m
			}
		case *OMap:
			in.extra = v.ToMap()
		case map[string]any:
			in.extra = v
		default:
			f.Errs.Add("extra_data", "Must be a dictionary or a YAML or JSON string.")
		}
	}
}

// applyPrompts folds the prompt fields of a request into the schedule's
// char_prompts and builds the launch request the acceptance rules check.
func (in *scheduleInput) applyPrompts(chars map[string]any) {
	for key, v := range in.prompts {
		if v == nil {
			delete(chars, key)
		} else {
			chars[key] = v
		}
	}
	str := func(k string) *string {
		if v, ok := in.prompts[k]; ok && v != nil {
			s := fmt.Sprint(v)
			return &s
		}
		return nil
	}
	num := func(k string) *int64 {
		if v, ok := in.prompts[k]; ok && v != nil {
			n, _ := v.(int64)
			return &n
		}
		return nil
	}
	in.req.SCMBranch, in.req.JobTags, in.req.SkipTags, in.req.Limit, in.req.JobType = str("scm_branch"), str("job_tags"), str("skip_tags"), str("limit"), str("job_type")
	in.req.Verbosity, in.req.Forks, in.req.JobSliceCount, in.req.Timeout = num("verbosity"), num("forks"), num("job_slice_count"), num("timeout")
	if v, ok := in.prompts["diff_mode"]; ok && v != nil {
		b, _ := v.(bool)
		in.req.DiffMode = &b
	}
	if in.extra != nil {
		in.req.ExtraVars = in.extra
		in.req.HasExtraVars = true
	}
}

// launchConfigPromptFields are the prompt fields a saved launch
// configuration's serializer carries (LaunchConfigurationBaseSerializer):
// the template ask fields the request can set. extra_data stands for
// extra_vars and survey_passwords.
var launchConfigPromptFields = map[string]bool{"inventory": true, "scm_branch": true, "job_type": true, "job_tags": true, "limit": true, "skip_tags": true,
	"diff_mode": true, "verbosity": true, "execution_environment": true, "forks": true, "job_slice_count": true, "timeout": true}

// launchConfigCharDefaults are the char prompt pseudo-fields, declared on the
// serializer with default=None: a PUT or POST that leaves one out sets it
// to null.
var launchConfigCharDefaults = []string{"scm_branch", "job_type", "job_tags", "limit", "skip_tags", "diff_mode", "verbosity", "forks", "job_slice_count", "timeout"}

// applyCharDefaults gives a full write (PUT or POST) the serializer's
// default of null for every char prompt it left out.
func (in *scheduleInput) applyCharDefaults(partial bool) {
	if partial {
		return
	}
	for _, k := range launchConfigCharDefaults {
		if !in.fields[k] {
			in.fields[k] = true
			in.prompts[k] = nil
		}
	}
}

// launchConfigMock is the serializer's mock object: the saved launch
// configuration with the request's fields applied (_build_mock_obj).
type launchConfigMock struct {
	chars         map[string]any // char_prompts after the request
	inventory, ee *int64         // after the request
	// dbExtra is the stored extra_data; surveyPasswords the stored ones.
	dbExtra         map[string]any
	surveyPasswords map[string]any
	// The stored many-to-many prompts (an existing configuration only).
	credentials, labels, instanceGroups []int64
}

// launchConfigOutcome is what validation hands back to save: the extra
// data and survey passwords to store (nil leaves the stored ones).
type launchConfigOutcome struct {
	extra           map[string]any
	surveyPasswords map[string]any
}

// launchConfigPasswordVariables are the template's survey password
// variables (survey_password_variables; only templates with surveys).
func launchConfigPasswordVariables(t *scheduleTemplate) []string {
	switch t.Model {
	case "jobtemplate":
		return surveyPasswordVariables(t.JT)
	case "workflowjobtemplate":
		return surveyPasswordVariables(asSurveyTemplate(t.WFT))
	}
	return nil
}

// launchConfigSurveyElement is the template's survey question for key.
func launchConfigSurveyElement(t *scheduleTemplate, key string) map[string]any {
	var st *models.JobTemplate
	switch t.Model {
	case "jobtemplate":
		st = t.JT
	case "workflowjobtemplate":
		st = asSurveyTemplate(t.WFT)
	default:
		return nil
	}
	var out map[string]any
	for _, e := range st.SurveyElements() {
		if v, _ := e["variable"].(string); v == key {
			out = e
		}
	}
	return out
}

// validateLaunchConfig is LaunchConfigurationBaseSerializer.validate for a
// schedule or a workflow job template node with a template: survey
// password answers are encrypted and $encrypted$ placeholders resolved,
// then the template's prompting rules check the whole configuration when
// the request set unified_job_template, else only the prompt fields the
// request carried, else nothing. excludeRequired leaves out missing
// required survey answers, which a node may get from its workflow
// (exclude_errors = ('required',)).
func (s *Server) validateLaunchConfig(ctx context.Context, t *scheduleTemplate, in *scheduleInput, mock *launchConfigMock, ujtInAttrs, excludeRequired bool) (*launchConfigOutcome, error) {
	out := &launchConfigOutcome{}
	passwordVars := launchConfigPasswordVariables(t)
	var passwordKeys []string // password_dict, in survey order
	var extra map[string]any
	surveyPasswords := mock.surveyPasswords
	if in.extra != nil {
		for _, key := range passwordVars {
			if _, ok := in.extra[key]; ok {
				passwordKeys = append(passwordKeys, key)
			}
		}
		extra = in.extra
		if len(passwordKeys) > 0 {
			sp := map[string]any{}
			for _, key := range passwordKeys {
				sp[key] = "$encrypted$"
			}
			out.surveyPasswords, surveyPasswords = sp, sp
			extra = make(map[string]any, len(in.extra))
			for k, v := range in.extra {
				extra[k] = v
			}
			for _, key := range passwordKeys {
				enc, err := s.encryptSurveyAnswer(extra[key])
				if err != nil {
					return nil, err
				}
				extra[key] = enc
			}
			// A raw $encrypted$ keeps the stored value, is refused, or
			// (with a default) is left for the default to apply.
			for _, key := range passwordKeys {
				if sv, ok := extra[key].(string); !ok || sv != "$encrypted$" {
					continue
				}
				if cur, ok := mock.dbExtra[key]; ok {
					extra[key] = cur
					continue
				}
				e := launchConfigSurveyElement(t, key)
				if def, has := e["default"]; !has || !pyTruthy(def) {
					return nil, FieldErrors{"extra_data": {fmt.Sprintf("Provided variable %s has no database value to replace with.", key)}}.Err()
				}
			}
		}
		out.extra = extra
	} else {
		extra = mock.dbExtra
	}
	requested := map[string]bool{}
	for k := range in.fields {
		if launchConfigPromptFields[k] {
			requested[k] = true
		}
	}
	if in.extra != nil {
		requested["extra_vars"], requested["survey_passwords"] = true, true
	}
	errs := newLaunchErrors()
	if ujtInAttrs || len(requested) > 0 {
		if ujtInAttrs {
			requested = nil
		}
		s.acceptLaunchConfigPrompts(ctx, t, mock.promptsDict(extra, surveyPasswords, requested), errs)
	}
	if excludeRequired {
		if v, ok := errs.m.Get("variables_needed_to_start"); ok {
			var kept []string
			if list, ok := v.([]any); ok {
				for _, m := range list {
					if ms, _ := m.(string); !strings.HasSuffix(ms, "value missing") {
						kept = append(kept, ms)
					}
				}
			}
			errs.m.Delete("variables_needed_to_start")
			if len(kept) > 0 {
				errs.set("variables_needed_to_start", kept)
			}
		}
	}
	// Unprocessed $encrypted$ answers mean the question's default applies.
	if in.extra != nil && len(passwordKeys) > 0 {
		keys := make([]string, 0, len(extra))
		for k := range extra {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		isPassword := map[string]bool{}
		for _, k := range passwordKeys {
			isPassword[k] = true
		}
		for _, key := range keys {
			if sv, ok := extra[key].(string); !ok || sv != "$encrypted$" {
				continue
			}
			if isPassword[key] {
				delete(extra, key)
				delete(out.surveyPasswords, key)
			} else {
				errs.add("extra_vars", fmt.Sprintf(`"$encrypted$ is a reserved keyword, may not be used for %s."`, key))
			}
		}
	}
	if errs.empty() {
		return out, nil
	}
	// Launch configs call extra_vars extra_data for historical reasons.
	if v, ok := errs.m.Get("extra_vars"); ok {
		errs.m.Delete("extra_vars")
		errs.m.Set("extra_data", v)
	}
	return nil, errs.err()
}

// encryptSurveyAnswer is encrypt_value for a survey password answer: null
// stays null, anything else is encrypted as its str() unless empty or
// already encrypted.
func (s *Server) encryptSurveyAnswer(v any) (any, error) {
	if v == nil {
		return nil, nil
	}
	sv := pyStr(plainValue(v))
	if sv == "" || strings.HasPrefix(sv, "$encrypted$") {
		return sv, nil
	}
	return s.encryptSurveyDefault(sv)
}

// launchConfigPrompt is one prompts_dict entry.
type launchConfigPrompt struct {
	key   string
	value any
}

// launchConfigPrompts is a mock's prompts_dict (for the job template's ask
// fields, in their order), limited to the requested fields (nil: all).
type launchConfigPrompts struct {
	list []launchConfigPrompt
	req  *launchRequest
	// surveyPasswords decrypt the encrypted answers the survey validates.
	surveyPasswords map[string]any
}

func (m *launchConfigMock) promptsDict(extra, surveyPasswords map[string]any, requested map[string]bool) *launchConfigPrompts {
	p := &launchConfigPrompts{req: &launchRequest{}}
	want := func(k string) bool { return requested == nil || requested[k] }
	add := func(k string, v any) { p.list = append(p.list, launchConfigPrompt{k, v}) }
	str := func(k string) *string {
		v, ok := m.chars[k]
		if !ok || v == nil || !want(k) {
			return nil
		}
		s := pyStr(v)
		add(k, v)
		return &s
	}
	num := func(k string) *int64 {
		v, ok := m.chars[k]
		if !ok || v == nil || !want(k) {
			return nil
		}
		n := int64(toFloat(v))
		add(k, v)
		return &n
	}
	for _, am := range askMapping {
		switch k := am[0]; k {
		case "inventory":
			if m.inventory != nil && want(k) {
				p.req.Inventory = m.inventory
				add(k, *m.inventory)
			}
		case "execution_environment":
			if m.ee != nil && want(k) {
				p.req.ExecutionEnv = m.ee
				add(k, *m.ee)
			}
		case "limit":
			p.req.Limit = str(k)
		case "scm_branch":
			p.req.SCMBranch = str(k)
		case "job_tags":
			p.req.JobTags = str(k)
		case "skip_tags":
			p.req.SkipTags = str(k)
		case "job_type":
			p.req.JobType = str(k)
		case "verbosity":
			p.req.Verbosity = num(k)
		case "forks":
			p.req.Forks = num(k)
		case "job_slice_count":
			p.req.JobSliceCount = num(k)
		case "timeout":
			p.req.Timeout = num(k)
		case "diff_mode":
			if v, ok := m.chars[k]; ok && v != nil && want(k) {
				b, _ := v.(bool)
				p.req.DiffMode = &b
				add(k, v)
			}
		case "extra_vars":
			if len(extra) > 0 && want(k) {
				p.req.ExtraVars, p.req.HasExtraVars = extra, true
				add(k, extra)
			}
			if len(surveyPasswords) > 0 && want("survey_passwords") {
				p.surveyPasswords = surveyPasswords
				add("survey_passwords", surveyPasswords)
			}
		case "credentials":
			if len(m.credentials) > 0 && requested == nil {
				p.req.Credentials, p.req.HasCredentials = m.credentials, true
				add(k, idsAny(m.credentials))
			}
		case "labels":
			if len(m.labels) > 0 && requested == nil {
				p.req.Labels, p.req.HasLabels = m.labels, true
				add(k, idsAny(m.labels))
			}
		case "instance_groups":
			if len(m.instanceGroups) > 0 && requested == nil {
				p.req.InstanceGroups, p.req.HasInstanceGroups = m.instanceGroups, true
				add(k, idsAny(m.instanceGroups))
			}
		}
	}
	return p
}

// surveyData is the extra vars the survey validates: an encrypted answer
// to a password question is checked decrypted.
func (s *Server) surveyData(p *launchConfigPrompts) map[string]any {
	if len(p.surveyPasswords) == 0 || p.req.ExtraVars == nil {
		return p.req.ExtraVars
	}
	data := make(map[string]any, len(p.req.ExtraVars))
	for k, v := range p.req.ExtraVars {
		data[k] = v
	}
	for k := range p.surveyPasswords {
		if sv, ok := data[k].(string); ok && crypto.IsEncrypted(sv) {
			if dec, err := s.decryptSurveyDefault(sv); err == nil {
				data[k] = dec
			}
		}
	}
	return data
}

// acceptLaunchConfigPrompts is the template's _accept_or_ignore_job_kwargs
// on a configuration's prompts, keeping the errors.
func (s *Server) acceptLaunchConfigPrompts(ctx context.Context, t *scheduleTemplate, p *launchConfigPrompts, errs *launchErrors) {
	req := *p.req
	if req.HasExtraVars {
		req.ExtraVars = s.surveyData(p)
	}
	switch t.Model {
	case "jobtemplate":
		tcreds, err := models.TemplateCredentials(ctx, s.Q(), []int64{t.ID})
		if err != nil {
			s.Log.ErrorContext(ctx, "launch configuration prompts: template credentials", "template", t.ID, "err", err)
		}
		s.acceptPrompts(ctx, t.JT, &req, tcreds[t.ID], errs, true)
	case "workflowjobtemplate":
		s.acceptWorkflowLaunchPrompts(ctx, t.WFT, &req, errs, true)
		// Only the variables left over are "not allowed": a survey answer
		// that failed validation has its own error.
		if _, ok := errs.m.Get("extra_vars"); ok {
			errs.m.Delete("extra_vars")
			data := req.ExtraVars
			if data == nil {
				data = map[string]any{}
			}
			if _, _, leftover, _ := s.acceptVariablesLeftover(asSurveyTemplate(t.WFT), data, true); len(leftover) > 0 {
				keys := make([]string, 0, len(leftover))
				for k := range leftover {
					keys = append(keys, k)
				}
				sort.Strings(keys)
				errs.add("extra_vars", fmt.Sprintf("Variables %s are not allowed on launch. Check the Prompt on Launch setting on the Workflow Job Template to include Extra Variables.", strings.Join(keys, ", ")))
			}
		}
	case "systemjobtemplate":
		// UnifiedJobTemplate's rule for every field but the variables,
		// which the system job's own rules check.
		for _, kv := range p.list {
			if kv.key != "extra_vars" {
				errs.add(kv.key, "Field is not allowed on launch.")
			}
		}
		if msgs := systemJobVariableErrors(t.SystemJobType, req.ExtraVars); len(msgs) > 0 {
			errs.set("extra_vars", msgs)
		}
	default:
		// Projects, inventory sources and approvals take no prompts.
		for _, kv := range p.list {
			errs.add(kv.key, "Field is not allowed on launch.")
		}
	}
}

// systemJobVariableErrors is SystemJobTemplate._accept_or_ignore_variables:
// only days, older_than and granularity are allowed, and the cleanup jobs
// want days as a positive integer.
func systemJobVariableErrors(jobType string, data map[string]any) []string {
	var msgs []string
	var unallowed []string
	for k := range data {
		if k != "days" && k != "older_than" && k != "granularity" {
			unallowed = append(unallowed, k)
		}
	}
	if len(unallowed) > 0 {
		// Python joined a set (in no stable order); sorted here.
		sort.Strings(unallowed)
		msgs = append(msgs, fmt.Sprintf("Variables %s are not allowed for system jobs.", strings.Join(unallowed, ", ")))
	}
	if jobType == "cleanup_jobs" || jobType == "cleanup_activitystream" {
		if v, ok := data["days"]; ok && !validSystemJobDays(v) {
			msgs = append(msgs, "days must be a positive integer.")
		}
	}
	return msgs
}

// validSystemJobDays: days must not be a bool or null, float(days) must
// equal int(days), and it must not be negative.
func validSystemJobDays(v any) bool {
	v = plainValue(v)
	switch t := v.(type) {
	case nil, bool:
		return false
	case json.Number:
		f, err := strconv.ParseFloat(string(t), 64)
		if err != nil {
			return false
		}
		return f == math.Trunc(f) && f >= 0 && !math.IsInf(f, 0)
	case float64:
		return t == math.Trunc(t) && t >= 0 && !math.IsInf(t, 0)
	case int64:
		return t >= 0
	case int:
		return t >= 0
	case string:
		// int(s) must parse (float(s) then parses and agrees).
		n, ok := pyIntString(t)
		return ok && n >= 0
	}
	// A list or dict made float() raise TypeError, a server error; it is
	// refused as an invalid value instead.
	return false
}

// pyIntString parses a string as Python's int() did (surrounding
// whitespace, a sign, digits with single underscores between them).
func pyIntString(s string) (int64, bool) {
	s = strings.TrimSpace(s)
	neg := false
	if s != "" && (s[0] == '+' || s[0] == '-') {
		neg = s[0] == '-'
		s = s[1:]
	}
	if s == "" || s[0] == '_' || s[len(s)-1] == '_' || strings.Contains(s, "__") {
		return 0, false
	}
	n, err := strconv.ParseInt(strings.ReplaceAll(s, "_", ""), 10, 64)
	if err != nil {
		return 0, false
	}
	if neg {
		n = -n
	}
	return n, true
}

// launchConfigTables name a saved launch configuration's many-to-many
// prompt tables and their owner column.
type launchConfigTables struct{ credentials, labels, instanceGroups, owner string }

// storedLaunchConfig reads what an existing configuration has saved: its
// extra data, survey passwords and many-to-many prompts.
func (s *Server) storedLaunchConfig(ctx context.Context, tb launchConfigTables, id int64, extraData string, surveyPasswords map[string]any) (*launchConfigMock, error) {
	m := &launchConfigMock{surveyPasswords: surveyPasswords}
	m.dbExtra, _ = ParseVars(extraData)
	if m.dbExtra == nil {
		m.dbExtra = map[string]any{}
	}
	var err error
	if m.credentials, err = models.ScanIDs(ctx, s.Q(), `SELECT credential_id FROM `+tb.credentials+` WHERE `+tb.owner+` = $1 ORDER BY id`, id); err != nil {
		return nil, err
	}
	if m.labels, err = models.ScanIDs(ctx, s.Q(), `SELECT label_id FROM `+tb.labels+` WHERE `+tb.owner+` = $1 ORDER BY id`, id); err != nil {
		return nil, err
	}
	if m.instanceGroups, err = models.ScanIDs(ctx, s.Q(), `SELECT instancegroup_id FROM `+tb.instanceGroups+` WHERE `+tb.owner+` = $1 ORDER BY position`, id); err != nil {
		return nil, err
	}
	return m, nil
}

// launchConfigPermitted is JobLaunchConfigAccess.can_add for the prompted
// resources a request names.
func (s *Server) launchConfigPermitted(c *SerCtx, in *scheduleInput) bool {
	if c.User.IsSuperuser {
		return true
	}
	if in.fields["inventory"] && in.req.Inventory != nil && !c.HasRoleOn("main.inventory", *in.req.Inventory, "use_role") {
		return false
	}
	if in.fields["execution_environment"] && in.req.ExecutionEnv != nil && !s.eeReadable(c, *in.req.ExecutionEnv) {
		return false
	}
	return true
}

// eeReadable: an execution environment is readable by everyone when global,
// else by members of its organization.
func (s *Server) eeReadable(c *SerCtx, id int64) bool {
	var orgID *int64
	if err := s.Q().QueryRow(c.Ctx(), `SELECT organization_id FROM main_executionenvironment WHERE id = $1`, id).Scan(&orgID); err != nil {
		return false
	}
	return orgID == nil || c.HasRoleOn("main.organization", *orgID, "read_role")
}

// --- handlers ---------------------------------------------------------------

func (s *Server) scheduleCreate(w http.ResponseWriter, r *http.Request) error {
	return s.createSchedule(w, r, nil)
}

// createSchedule creates a schedule; parent, when set, is the template the
// sub-list belongs to (its id replaces unified_job_template).
func (s *Server) createSchedule(w http.ResponseWriter, r *http.Request, parent *int64) error {
	u, err := RequireWrite(r)
	if err != nil {
		return err
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	ctx := r.Context()
	if parent != nil {
		body.Set("unified_job_template", json.Number(strconv.FormatInt(*parent, 10)))
	}
	f := NewForm(body, false)
	sc := &schedule{Enabled: true, CharPrompts: map[string]any{}, SurveyPasswords: map[string]any{}, CreatedByID: &u.ID, ModifiedByID: &u.ID}
	var t *scheduleTemplate
	if id, ok := f.ID("unified_job_template", nil, true, s.existsIn(ctx, "main_unifiedjobtemplate")); ok && id != nil {
		if t, err = s.loadScheduleTemplate(ctx, *id); err != nil {
			return err
		}
		sc.UnifiedJobTemplateID = *id
		switch {
		case t.Model == "inventorysource" && !cloudInventorySources[t.SourceKind]:
			f.Errs.Add("unified_job_template", "Inventory Source must be a cloud resource.")
		case t.Model == "project" && t.Proj != nil && t.Proj.SCMType == "":
			f.Errs.Add("unified_job_template", "Manual Project cannot have a schedule set.")
		}
	}
	in := s.scheduleFromForm(ctx, f, sc, t)
	if err := f.Err(); err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	if !s.scheduleCanStart(c, t) || !s.launchConfigPermitted(c, in) {
		return ErrForbidden
	}
	in.applyCharDefaults(false)
	in.applyPrompts(sc.CharPrompts)
	mock := &launchConfigMock{chars: sc.CharPrompts, inventory: sc.InventoryID, ee: sc.ExecutionEnvironmentID, dbExtra: map[string]any{}, surveyPasswords: sc.SurveyPasswords}
	res, err := s.validateLaunchConfig(ctx, t, in, mock, true, false)
	if err != nil {
		return err
	}
	if res.surveyPasswords != nil {
		sc.SurveyPasswords = res.surveyPasswords
	}
	if res.extra != nil {
		b, _ := json.Marshal(res.extra)
		sc.ExtraData = string(b)
	} else {
		sc.ExtraData = "{}"
	}
	now := time.Now()
	next, start, end, coerced, err := scheduleComputed(sc.RRule, sc.Enabled, now)
	if err != nil {
		return FieldErrors{"rrule": {"rrule parsing failed validation: " + err.Error()}}.Err()
	}
	sc.NextRun, sc.DTStart, sc.DTEnd, sc.RRule = next, start, end, coerced
	chars, _ := json.Marshal(sc.CharPrompts)
	passwords, _ := json.Marshal(sc.SurveyPasswords)
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if err := tx.QueryRow(ctx, `INSERT INTO main_schedule (created, modified, description, name, enabled, dtstart, dtend, rrule, next_run, extra_data, created_by_id, modified_by_id, unified_job_template_id, char_prompts, inventory_id, survey_passwords, execution_environment_id)
			VALUES (now(), now(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $9, $10, $11::jsonb, $12, $13::jsonb, $14) RETURNING id, created, modified`,
			sc.Description, sc.Name, sc.Enabled, sc.DTStart, sc.DTEnd, sc.RRule, sc.NextRun, sc.ExtraData, u.ID, sc.UnifiedJobTemplateID, string(chars), sc.InventoryID, string(passwords), sc.ExecutionEnvironmentID).Scan(&sc.ID, &sc.Created, &sc.Modified); err != nil {
			if isUniqueViolation(err) {
				return FieldErrors{"__all__": {"Schedule with this (unified_job_template, name) combination already exists."}}.Err()
			}
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE main_unifiedjobtemplate t SET next_schedule_id = n.id, next_job_run = n.next_run
			FROM (SELECT id, next_run FROM main_schedule WHERE unified_job_template_id = $1 AND enabled AND next_run IS NOT NULL ORDER BY next_run DESC, id LIMIT 1) n WHERE t.id = $1`, sc.UnifiedJobTemplateID); err != nil {
			return err
		}
		return s.Activity.Record(ctx, tx, activity.Entry{Operation: "create", Object1: "schedule", Changes: s.scheduleChanges(ctx, tx, sc, t), ActorID: &u.ID, Links: map[string]int64{"schedule": sc.ID}})
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

// cloudInventorySources are the sources a schedule may update
// (CLOUD_INVENTORY_SOURCES).
var cloudInventorySources = map[string]bool{"ec2": true, "gce": true, "azure_rm": true, "vmware": true, "satellite6": true, "openstack": true, "rhv": true, "controller": true, "insights": true, "terraform": true, "openshift_virtualization": true, "scm": true, "constructed": true}

// scheduleChanges renders a schedule for the activity stream.
func (s *Server) scheduleChanges(ctx context.Context, q db.Querier, sc *schedule, t *scheduleTemplate) map[string]any {
	ch := map[string]any{"name": sc.Name, "description": sc.Description, "enabled": sc.Enabled, "rrule": sc.RRule, "extra_data": maskCiphertext(sc.ExtraData), "id": sc.ID,
		"unified_job_template": activity.Ref(t.Name, t.ID), "inventory": s.nameRefCtx(ctx, q, `SELECT name FROM main_inventory WHERE id = $1`, sc.InventoryID),
		"execution_environment": s.nameRefCtx(ctx, q, `SELECT name FROM main_executionenvironment WHERE id = $1`, sc.ExecutionEnvironmentID)}
	if sc.NextRun != nil {
		ch["next_run"] = sc.NextRun.UTC().Format(time.RFC3339)
	}
	if sc.DTStart != nil {
		ch["dtstart"] = sc.DTStart.UTC().Format(time.RFC3339)
	}
	if sc.DTEnd != nil {
		ch["dtend"] = sc.DTEnd.UTC().Format(time.RFC3339)
	}
	for k, v := range sc.CharPrompts {
		ch[k] = v
	}
	return ch
}

func (s *Server) scheduleUpdate(w http.ResponseWriter, r *http.Request) error {
	u, sc, err := scheduleObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	ctx := r.Context()
	t, err := s.loadScheduleTemplate(ctx, sc.UnifiedJobTemplateID)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	if !s.scheduleCanChange(c, sc, t) {
		return ErrForbidden
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	partial := r.Method == http.MethodPatch
	f := NewForm(body, partial)
	before := s.scheduleChanges(ctx, s.Q(), sc, t)
	if f.Has("unified_job_template") {
		if id, ok := f.ID("unified_job_template", &sc.UnifiedJobTemplateID, !partial, s.existsIn(ctx, "main_unifiedjobtemplate")); ok && id != nil && *id != sc.UnifiedJobTemplateID {
			nt, err := s.loadScheduleTemplate(ctx, *id)
			if err != nil {
				return err
			}
			// check_related(mandatory=True) on both templates: admin of
			// the one it leaves and the one it joins, or its creator able
			// to start both. Its prompts (credentials, inventory) go with
			// it, so start on the new template alone is not enough.
			adminBoth := s.scheduleCanAdmin(c, t) && s.scheduleCanAdmin(c, nt)
			creator := sc.CreatedByID != nil && *sc.CreatedByID == u.ID
			if !adminBoth && !(creator && s.scheduleCanStart(c, t) && s.scheduleCanStart(c, nt)) {
				return ErrForbidden
			}
			t = nt
			sc.UnifiedJobTemplateID = *id
		}
	}
	// unified_job_template is required on a PUT; a PATCH sets it only
	// when sent. Setting it re-validates the whole configuration.
	ujtInAttrs := f.Has("unified_job_template")
	if !partial && !ujtInAttrs {
		f.Errs.Add("unified_job_template", "This field is required.")
	}
	// Disabling needs no validation of the template's prompts (a PATCH
	// of exactly {"enabled": false}); any other enabled-only PATCH has no
	// prompt fields to validate.
	onlyEnabled := partial && len(f.Body.Keys()) == 1 && f.Has("enabled")
	in := s.scheduleFromForm(ctx, f, sc, t)
	if err := f.Err(); err != nil {
		return err
	}
	if !onlyEnabled {
		if !s.launchConfigPermitted(c, in) {
			return ErrForbidden
		}
		in.applyCharDefaults(partial)
		in.applyPrompts(sc.CharPrompts)
		mock, err := s.storedLaunchConfig(ctx, launchConfigTables{"main_schedule_credentials", "main_schedule_labels", "main_scheduleinstancegroupmembership", "schedule_id"}, sc.ID,
			sc.ExtraData, sc.SurveyPasswords)
		if err != nil {
			return err
		}
		mock.chars, mock.inventory, mock.ee = sc.CharPrompts, sc.InventoryID, sc.ExecutionEnvironmentID
		res, err := s.validateLaunchConfig(ctx, t, in, mock, ujtInAttrs, false)
		if err != nil {
			return err
		}
		if res.surveyPasswords != nil {
			sc.SurveyPasswords = res.surveyPasswords
		}
		if res.extra != nil {
			b, _ := json.Marshal(res.extra)
			sc.ExtraData = string(b)
		}
	}
	now := time.Now()
	next, start, end, coerced, err := scheduleComputed(sc.RRule, sc.Enabled, now)
	if err != nil {
		return FieldErrors{"rrule": {"rrule parsing failed validation: " + err.Error()}}.Err()
	}
	sc.NextRun, sc.DTStart, sc.DTEnd, sc.RRule = next, start, end, coerced
	chars, _ := json.Marshal(sc.CharPrompts)
	passwords, _ := json.Marshal(sc.SurveyPasswords)
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `UPDATE main_schedule SET modified = now(), description = $2, name = $3, enabled = $4, dtstart = $5, dtend = $6, rrule = $7, next_run = $8, extra_data = $9, modified_by_id = $10,
			unified_job_template_id = $11, char_prompts = $12::jsonb, inventory_id = $13, survey_passwords = $14::jsonb, execution_environment_id = $15 WHERE id = $1`,
			sc.ID, sc.Description, sc.Name, sc.Enabled, sc.DTStart, sc.DTEnd, sc.RRule, sc.NextRun, sc.ExtraData, u.ID, sc.UnifiedJobTemplateID, string(chars), sc.InventoryID, string(passwords), sc.ExecutionEnvironmentID); err != nil {
			if isUniqueViolation(err) {
				return FieldErrors{"__all__": {"Schedule with this (unified_job_template, name) combination already exists."}}.Err()
			}
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE main_unifiedjobtemplate t SET next_schedule_id = n.id, next_job_run = n.next_run
			FROM (SELECT id, next_run FROM main_schedule WHERE unified_job_template_id = $1 AND enabled AND next_run IS NOT NULL ORDER BY next_run DESC, id LIMIT 1) n WHERE t.id = $1`, sc.UnifiedJobTemplateID); err != nil {
			return err
		}
		after := s.scheduleChanges(ctx, tx, sc, t)
		changes := map[string]any{}
		for k, v := range after {
			if bv, ok := before[k]; !ok || fmt.Sprint(bv) != fmt.Sprint(v) {
				changes[k] = []any{before[k], v}
			}
		}
		if len(changes) == 0 {
			return nil
		}
		return s.Activity.Record(ctx, tx, activity.Entry{Operation: "update", Object1: "schedule", Changes: changes, ActorID: &u.ID, Links: map[string]int64{"schedule": sc.ID}})
	})
	if err != nil {
		return err
	}
	s.EmitScheduleChanged(ctx, sc.ID)
	sc.Modified = time.Now()
	sc.ModifiedByID = &u.ID
	o, err := s.serializeSchedule(c, sc)
	if err != nil {
		return err
	}
	WriteJSON(w, 200, o)
	return nil
}

func (s *Server) scheduleDelete(w http.ResponseWriter, r *http.Request) error {
	u, sc, err := scheduleObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	ctx := r.Context()
	t, err := s.loadScheduleTemplate(ctx, sc.UnifiedJobTemplateID)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	if !s.scheduleCanChange(c, sc, t) {
		return ErrForbidden
	}
	changes := s.scheduleChanges(ctx, s.Q(), sc, t)
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if err := s.Activity.Record(ctx, tx, activity.Entry{Operation: "delete", Object1: "schedule", Changes: changes, ActorID: &u.ID}); err != nil {
			return err
		}
		if err := s.Cascade.Delete(ctx, tx, "main_schedule", "id", []int64{sc.ID}); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `UPDATE main_unifiedjobtemplate t SET next_schedule_id = n.id, next_job_run = n.next_run
			FROM (SELECT id, next_run FROM main_schedule WHERE unified_job_template_id = $1 AND enabled AND next_run IS NOT NULL ORDER BY next_run DESC, id LIMIT 1) n WHERE t.id = $1`, sc.UnifiedJobTemplateID)
		return err
	})
	if err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// schedulePreview lists the next occurrences of an rrule.
func (s *Server) schedulePreview(w http.ResponseWriter, r *http.Request) error {
	if _, err := RequireUser(r); err != nil {
		return err
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	f := NewForm(body, false)
	value := f.String("rrule", true, 0, "")
	if err := f.Err(); err != nil {
		return err
	}
	if errs := validateRRule(value); len(errs) > 0 {
		return FieldErrors{"rrule": errs}.Err()
	}
	now := time.Now()
	set, _, err := rrule.ParseSchedule(value, now)
	if err != nil {
		return FieldErrors{"rrule": {"rrule parsing failed validation: " + err.Error()}}.Err()
	}
	local := []string{}
	utc := []string{}
	for _, o := range set.XAfter(now, 20) {
		if len(local) >= 10 {
			break
		}
		if !o.Exists {
			continue
		}
		local = append(local, drfTime(o.Time))
		utc = append(utc, drfTime(o.Time.UTC()))
	}
	WriteJSON(w, 200, NewOMap().Set("local", local).Set("utc", utc))
	return nil
}

// drfTime renders a time as DRF's JSON encoder did: isoformat with the
// offset, and Z for UTC.
func drfTime(t time.Time) string {
	s := t.Format("2006-01-02T15:04:05-07:00")
	if strings.HasSuffix(s, "+00:00") {
		return strings.TrimSuffix(s, "+00:00") + "Z"
	}
	return s
}

// scheduleZoneInfo serves the zone list the old application offered.
func (s *Server) scheduleZoneInfo(w http.ResponseWriter, r *http.Request) error {
	if _, err := RequireUser(r); err != nil {
		return err
	}
	b, err := metadataFS.ReadFile("metadata/zoneinfo.json")
	if err != nil {
		return err
	}
	var doc OMap
	if err := json.Unmarshal(b, &doc); err != nil {
		return err
	}
	WriteJSON(w, 200, &doc)
	return nil
}

// --- sub-lists ---------------------------------------------------------------

func (s *Server) scheduleCredentials(w http.ResponseWriter, r *http.Request) error {
	_, sc, err := scheduleObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	spec := s.credentialSpec()
	// Only the credentials the user may read, as the old
	// LaunchConfigCredentialsBase and WorkflowJobNodeCredentialsList showed
	// (filter_read_permission stayed on there).
	spec.DefaultOrder = []string{"id"}
	spec.RoleLevel = "main.credential"
	creds, count, page, err := runListOf(s, r, spec, func(q *Query) {
		q.AddJoin("JOIN main_schedule_credentials scl ON scl.credential_id = c.id")
		q.And("scl.schedule_id = " + q.Arg(sc.ID))
	}, models.ScanCredential)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, false)
	results, err := s.serializeCredentials(c, creds)
	if err != nil {
		return err
	}
	WriteJSON(w, 200, Paginate(r, page, count, results))
	return nil
}

// scheduleCredentialsAttach is LaunchConfigCredentialsBase: a credential
// may be saved in a launch configuration when the template prompts for
// credentials, the credential needs no passwords, and neither the
// configuration nor the template already provides one of its kind.
func (s *Server) scheduleCredentialsAttach(w http.ResponseWriter, r *http.Request) error {
	_, sc, err := scheduleObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	ctx := r.Context()
	t, err := s.loadScheduleTemplate(ctx, sc.UnifiedJobTemplateID)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	if !s.scheduleCanChange(c, sc, t) {
		return ErrForbidden
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	return s.launchConfigCredentialAttach(w, r, c, body, &sc.UnifiedJobTemplateID, launchConfigCredentials{"main_schedule_credentials", "schedule_id", "schedule", scheduleCredentialsRel}, sc.ID)
}

// launchConfigCredentials names a launch configuration's credentials
// table, its owner column, and the owner's model and through model in the
// activity entries an attach or detach writes.
type launchConfigCredentials struct {
	Table, Column, Object1, Relationship string
}

// launchConfigCredentialAttach attaches or detaches a credential on a saved
// launch configuration (a schedule or a workflow node), following
// LaunchConfigCredentialsBase.is_valid_relation, and records the
// "associate" or "disassociate" entry of Schedule.credentials or
// WorkflowJobTemplateNode.credentials (both registered models).
func (s *Server) launchConfigCredentialAttach(w http.ResponseWriter, r *http.Request, c *SerCtx, body *OMap, ujtID *int64, lc launchConfigCredentials, ownerID int64) error {
	table, column := lc.Table, lc.Column
	ctx := r.Context()
	detach := isDetach(body)
	cid, aerr := attachID(body, "Credential", detach)
	if aerr != nil {
		return aerr
	}
	briefs, err := models.LoadCredentialBriefs(ctx, s.Q(), []int64{cid})
	if err != nil {
		return err
	}
	if len(briefs) == 0 {
		return BadRequest("Credential matching query does not exist.")
	}
	sub := briefs[0]
	if !c.User.IsSuperuser && !c.HasRoleOn("main.credential", sub.ID, "use_role") {
		return ErrForbidden
	}
	if detach {
		// remove() signals the id it was given, attached or not.
		err := s.DB.Tx(ctx, func(tx pgx.Tx) error {
			if _, err := tx.Exec(ctx, `DELETE FROM `+table+` WHERE `+column+` = $1 AND credential_id = $2`, ownerID, sub.ID); err != nil {
				return err
			}
			return s.recordAssociation(ctx, tx, &c.User.ID, "disassociate", lc.Relationship, lc.Object1, ownerID, "credential", sub.ID)
		})
		if err != nil {
			return err
		}
		w.WriteHeader(http.StatusNoContent)
		return nil
	}
	var t *scheduleTemplate
	if ujtID != nil {
		if t, err = s.loadScheduleTemplate(ctx, *ujtID); err != nil {
			return err
		}
	}
	if t == nil {
		return &APIError{Status: http.StatusBadRequest, Body: map[string]any{"msg": "Cannot assign credential when related template is null."}}
	}
	if t.JT == nil {
		return &APIError{Status: http.StatusBadRequest, Body: map[string]any{"msg": "Related template cannot accept credentials on launch."}}
	}
	if len(sub.PasswordsNeeded()) > 0 {
		return &APIError{Status: http.StatusBadRequest, Body: map[string]any{"msg": "Credential that requires user input on launch cannot be used in saved launch configuration."}}
	}
	if !t.JT.AskCredentialOnLaunch {
		return &APIError{Status: http.StatusBadRequest, Body: map[string]any{"msg": "Related template is not configured to accept credentials on launch."}}
	}
	existingIDs, err := models.ScanIDs(ctx, s.Q(), `SELECT credential_id FROM `+table+` WHERE `+column+` = $1 ORDER BY id`, ownerID)
	if err != nil {
		return err
	}
	existing, err := models.LoadCredentialBriefs(ctx, s.Q(), existingIDs)
	if err != nil {
		return err
	}
	for _, cr := range existing {
		if cr.UniqueHash() == sub.UniqueHash() {
			return &APIError{Status: http.StatusBadRequest, Body: map[string]any{"msg": fmt.Sprintf("This launch configuration already provides a %s credential.", sub.UniqueHashDisplay())}}
		}
	}
	tcreds, err := models.TemplateCredentials(ctx, s.Q(), []int64{t.ID})
	if err != nil {
		return err
	}
	for _, cr := range tcreds[t.ID] {
		if cr.ID == sub.ID {
			return &APIError{Status: http.StatusBadRequest, Body: map[string]any{"msg": fmt.Sprintf("Related template already uses %s credential.", sub.Name)}}
		}
	}
	// The unique hash check above refuses a credential attached already,
	// so the add always adds.
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `INSERT INTO `+table+` (`+column+`, credential_id) VALUES ($1, $2)`, ownerID, sub.ID); err != nil {
			return err
		}
		return s.recordAssociation(ctx, tx, &c.User.ID, "associate", lc.Relationship, lc.Object1, ownerID, "credential", sub.ID)
	})
	if err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func (s *Server) scheduleLabels(w http.ResponseWriter, r *http.Request) error {
	_, sc, err := scheduleObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	return s.labelListWith(w, r, func(q *Query) {
		q.AddJoin("JOIN main_schedule_labels sll ON sll.label_id = l.id")
		q.And("sll.schedule_id = " + q.Arg(sc.ID))
	})
}

func (s *Server) scheduleLabelsAttach(w http.ResponseWriter, r *http.Request) error {
	_, sc, err := scheduleObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	t, err := s.loadScheduleTemplate(r.Context(), sc.UnifiedJobTemplateID)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	return s.labelsAttach(w, r, c, func() bool { return s.scheduleCanChange(c, sc, t) }, scheduleLabels, sc.ID, "Schedule")
}

func (s *Server) scheduleInstanceGroups(w http.ResponseWriter, r *http.Request) error {
	_, sc, err := scheduleObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	return s.orderedInstanceGroups(w, r, "main_scheduleinstancegroupmembership", "schedule_id", sc.ID, true)
}

func (s *Server) scheduleInstanceGroupsAttach(w http.ResponseWriter, r *http.Request) error {
	u, sc, err := scheduleObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	t, err := s.loadScheduleTemplate(r.Context(), sc.UnifiedJobTemplateID)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	if !s.scheduleCanChange(c, sc, t) {
		return ErrForbidden
	}
	return s.instanceGroupLink(w, r, u, orderedLink{Table: "main_scheduleinstancegroupmembership", OwnerCol: "schedule_id", Owner: sc.ID, Object1: "schedule", Relationship: scheduleInstanceGroupRel},
		func(g *instanceGroup) bool { return u.IsSuperuser || c.HasRole(g.UseRoleID) })
}

func (s *Server) scheduleJobs(w http.ResponseWriter, r *http.Request) error {
	_, sc, err := scheduleObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	return s.unifiedJobListWith(w, r, func(q *Query) { q.And("uj.schedule_id = " + q.Arg(sc.ID)) })
}

// --- template sub-lists -----------------------------------------------------

func (s *Server) jobTemplateScheduleCreate(w http.ResponseWriter, r *http.Request) error {
	_, t, err := jobTemplateObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	return s.createSchedule(w, r, &t.ID)
}

func (s *Server) workflowJobTemplateScheduleCreate(w http.ResponseWriter, r *http.Request) error {
	_, t, err := workflowJobTemplateObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	return s.createSchedule(w, r, &t.ID)
}

func (s *Server) projectSchedules(w http.ResponseWriter, r *http.Request) error {
	_, p, err := projectObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	return s.scheduleListWith(w, r, func(q *Query) { q.And("sc.unified_job_template_id = " + q.Arg(p.ID)) })
}

func (s *Server) projectScheduleCreate(w http.ResponseWriter, r *http.Request) error {
	_, p, err := projectObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	return s.createSchedule(w, r, &p.ID)
}

func (s *Server) systemJobTemplateSchedules(w http.ResponseWriter, r *http.Request) error {
	if _, err := RequireUser(r); err != nil {
		return err
	}
	id, err := PathID(r)
	if err != nil {
		return NotFoundFor("SystemJobTemplate")
	}
	if exists, err := db.Exists(r.Context(), s.Q(), `SELECT 1 FROM main_systemjobtemplate WHERE unifiedjobtemplate_ptr_id = $1`, id); err != nil {
		return err
	} else if !exists {
		return NotFoundFor("SystemJobTemplate")
	}
	return s.scheduleListWith(w, r, func(q *Query) { q.And("sc.unified_job_template_id = " + q.Arg(id)) })
}

func (s *Server) systemJobTemplateScheduleCreate(w http.ResponseWriter, r *http.Request) error {
	u, err := RequireWrite(r)
	if err != nil {
		return err
	}
	if !u.IsSuperuser {
		return ErrForbidden
	}
	id, err := PathID(r)
	if err != nil {
		return NotFoundFor("SystemJobTemplate")
	}
	if exists, err := db.Exists(r.Context(), s.Q(), `SELECT 1 FROM main_systemjobtemplate WHERE unifiedjobtemplate_ptr_id = $1`, id); err != nil {
		return err
	} else if !exists {
		return NotFoundFor("SystemJobTemplate")
	}
	return s.createSchedule(w, r, &id)
}

func (s *Server) inventorySourceSchedules(w http.ResponseWriter, r *http.Request) error {
	_, src, err := inventorySourceObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	return s.scheduleListWith(w, r, func(q *Query) { q.And("sc.unified_job_template_id = " + q.Arg(src.ID)) })
}

func (s *Server) inventorySourceScheduleCreate(w http.ResponseWriter, r *http.Request) error {
	_, src, err := inventorySourceObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	return s.createSchedule(w, r, &src.ID)
}

// --- the scheduler pass -----------------------------------------------------

// SchedulerPass is awx_periodic_scheduler: schedules whose next run fell
// between the previous pass and now are launched, and stale ones are
// recomputed. The task process calls it every thirty seconds.
func (s *Server) SchedulerPass(ctx context.Context, now time.Time) error {
	var lastRun time.Time
	err := s.Q().QueryRow(ctx, `SELECT schedule_last_run FROM main_ascenderschedulestate ORDER BY id LIMIT 1`).Scan(&lastRun)
	if err != nil {
		if !db.IsNoRows(err) {
			return err
		}
		lastRun = now
		if _, err := s.Q().Exec(ctx, `INSERT INTO main_ascenderschedulestate (schedule_last_run) VALUES ($1)`, now); err != nil {
			return err
		}
	}
	if _, err := s.Q().Exec(ctx, `UPDATE main_ascenderschedulestate SET schedule_last_run = $1`, now); err != nil {
		return err
	}
	if s.Settings.Bool(ctx, "DISABLE_ALL_SCHEDULES") {
		return nil
	}
	stale, err := models.ScanIDs(ctx, s.Q(), `SELECT id FROM main_schedule WHERE enabled AND next_run < $1 ORDER BY id`, lastRun)
	if err != nil {
		return err
	}
	for _, id := range stale {
		if _, err := s.UpdateScheduleComputedFields(ctx, id, now); err != nil {
			s.Log.WarnContext(ctx, "schedule recompute", "schedule", id, "err", err)
		}
	}
	due, err := models.ScanIDs(ctx, s.Q(), `SELECT id FROM main_schedule WHERE enabled AND next_run > $1 AND next_run < $2 ORDER BY id`, lastRun, now)
	if err != nil {
		return err
	}
	for _, id := range due {
		if _, err := s.UpdateScheduleComputedFields(ctx, id, now); err != nil {
			s.Log.WarnContext(ctx, "schedule recompute", "schedule", id, "err", err)
		}
		if err := s.launchSchedule(ctx, id); err != nil {
			s.Log.ErrorContext(ctx, "scheduled launch", "schedule", id, "err", err)
		}
	}
	return nil
}

// launchSchedule creates the job a due schedule runs.
func (s *Server) launchSchedule(ctx context.Context, id int64) error {
	rows, err := s.Q().Query(ctx, `SELECT `+scheduleColumns+` FROM main_schedule sc WHERE sc.id = $1`, id)
	if err != nil {
		return err
	}
	if !rows.Next() {
		rows.Close()
		return nil
	}
	v, err := scanSchedule(rows)
	rows.Close()
	if err != nil {
		return err
	}
	sc := v.(*schedule)
	t, err := s.loadScheduleTemplate(ctx, sc.UnifiedJobTemplateID)
	if err != nil {
		return err
	}
	switch t.Model {
	case "jobtemplate":
		return s.launchScheduledJob(ctx, sc, t.JT)
	case "project":
		return s.launchScheduledProjectUpdate(ctx, sc, t.Proj)
	case "workflowjobtemplate":
		return s.launchScheduledWorkflow(ctx, sc, t.WFT)
	case "inventorysource":
		return s.launchScheduledInventoryUpdate(ctx, sc, t.ID)
	case "systemjobtemplate":
		// The schedule's extra data become the job's extra vars.
		st, err := s.loadSystemJobTemplate(ctx, t.ID)
		if err != nil {
			return err
		}
		var extra any = NewOMap()
		if len(sc.ExtraData) > 0 {
			if v, err := decodeOrdered(string(sc.ExtraData)); err == nil && v != nil {
				extra = v
			}
		}
		sid := sc.ID
		_, err = s.CreateSystemJob(ctx, st, nil, "scheduled", extra, &sid)
		return err
	default:
		s.Log.WarnContext(ctx, "schedule skipped: this task process cannot run its template type yet", "schedule", sc.ID, "template", t.Name, "type", t.unifiedJobType())
		return nil
	}
}

// schedulePrompts is the schedule's launch configuration as a request.
func (s *Server) schedulePrompts(ctx context.Context, sc *schedule) (*launchRequest, error) {
	p := &models.JobPrompts{InventoryID: sc.InventoryID, ExecutionEnvironment: sc.ExecutionEnvironmentID}
	applyCharPrompts(p, sc.CharPrompts)
	if sc.ExtraData != "" {
		extra := map[string]any{}
		if json.Unmarshal([]byte(sc.ExtraData), &extra) == nil && len(extra) > 0 {
			p.ExtraVars = extra
		}
	}
	if len(sc.SurveyPasswords) > 0 {
		p.SurveyPasswords = sc.SurveyPasswords
	}
	var err error
	if p.Credentials, err = models.ScanIDs(ctx, s.Q(), `SELECT credential_id FROM main_schedule_credentials WHERE schedule_id = $1 ORDER BY id`, sc.ID); err != nil {
		return nil, err
	}
	if p.Labels, err = models.ScanIDs(ctx, s.Q(), `SELECT label_id FROM main_schedule_labels WHERE schedule_id = $1 ORDER BY id`, sc.ID); err != nil {
		return nil, err
	}
	if p.InstanceGroups, err = models.ScanIDs(ctx, s.Q(), `SELECT instancegroup_id FROM main_scheduleinstancegroupmembership WHERE schedule_id = $1 ORDER BY position`, sc.ID); err != nil {
		return nil, err
	}
	return launchRequestFromPrompts(p), nil
}

// scheduledJobCannotStart is the explanation of a scheduled job that could
// not start, spaces and all.
const scheduledJobCannotStart = "Scheduled job could not start because it                     was not in the right state or required manual credentials"

// scheduleMaxJobs is SCHEDULE_MAX_JOBS (default 10).
func (s *Server) scheduleMaxJobs(ctx context.Context) int64 {
	if n := s.Settings.Int(ctx, "SCHEDULE_MAX_JOBS"); n > 0 {
		return n
	}
	return 10
}

// launchScheduledJob creates the job of a job template schedule with the
// schedule's prompts; a job that needs passwords cannot start and is
// marked failed, as signal_start reported.
func (s *Server) launchScheduledJob(ctx context.Context, sc *schedule, t *models.JobTemplate) error {
	// JobTemplate.cache_timeout_blocked: too many runs already waiting.
	maxJobs := s.scheduleMaxJobs(ctx)
	var active int64
	if err := s.Q().QueryRow(ctx, `SELECT count(*) FROM main_job j JOIN main_unifiedjob u ON u.id = j.unifiedjob_ptr_id WHERE j.job_template_id = $1 AND u.status IN ('pending', 'waiting', 'running')`, t.ID).Scan(&active); err != nil {
		return err
	}
	if active >= maxJobs {
		s.Log.ErrorContext(ctx, fmt.Sprintf("Job template %s could not be started because there are more than %d other jobs from that template waiting to run", t.Name, maxJobs))
		s.Log.WarnContext(ctx, "cache timeout is in the future, bypassing schedule for template", "template", t.ID)
		return nil
	}
	req, err := s.schedulePrompts(ctx, sc)
	if err != nil {
		return err
	}
	tcredsMap, err := models.TemplateCredentials(ctx, s.Q(), []int64{t.ID})
	if err != nil {
		return err
	}
	tcreds := tcredsMap[t.ID]
	errs := newLaunchErrors()
	acc := s.acceptPrompts(ctx, t, req, tcreds, errs, false)
	if !errs.empty() {
		b, _ := json.Marshal(errs.m)
		s.Log.InfoContext(ctx, "errors creating scheduled job", "schedule", sc.ID, "errors", string(b))
	}
	launchCreds := tcreds
	if len(acc.Credentials) > 0 {
		prompted, err := models.LoadCredentialBriefs(ctx, s.Q(), acc.Credentials)
		if err != nil {
			return err
		}
		launchCreds = mergeCredentials(tcreds, prompted)
	}
	sid := sc.ID
	eager := func(jb *models.Job) { jb.ScheduleID = &sid }
	outcome, err := s.createJobFromTemplate(ctx, nil, t, acc, launchCreds, map[string]string{}, "scheduled", eager, spawnPrevent{})
	if err != nil {
		return err
	}
	if outcome.Job != nil && len(passwordsNeeded(launchCreds)) > 0 {
		// The old message's backslash continuation kept the next line's
		// indentation: 21 spaces before "was". Saving the failed status
		// stamped finished.
		_, err := s.Q().Exec(ctx, `UPDATE main_unifiedjob SET status = 'failed', failed = true, job_explanation = $2, finished = COALESCE(finished, now()), modified = now() WHERE id = $1`,
			outcome.Job.ID, scheduledJobCannotStart)
		return err
	}
	switch {
	case outcome.Job != nil:
		s.Log.InfoContext(ctx, "spawned job from schedule", "schedule", sc.ID, "job", outcome.Job.ID)
	case outcome.WorkflowJob != nil:
		s.Log.InfoContext(ctx, "spawned sliced workflow job from schedule", "schedule", sc.ID, "workflow_job", outcome.WorkflowJob.ID)
	}
	return nil
}

// launchScheduledProjectUpdate creates the project update of a project
// schedule unless the project's cache timeout still covers the last run.
func (s *Server) launchScheduledProjectUpdate(ctx context.Context, sc *schedule, p *models.Project) error {
	if p.LastJobRun != nil && p.LastJobRun.Add(time.Duration(p.SCMUpdateCacheTimeout)*time.Second).After(time.Now()) {
		s.Log.WarnContext(ctx, "cache timeout is in the future, bypassing schedule for template", "template", p.ID)
		return nil
	}
	pu := models.NewProjectUpdate(p, "scheduled", nil, "check")
	sid := sc.ID
	pu.ScheduleID = &sid
	if err := s.DB.Tx(ctx, func(tx pgx.Tx) error { return models.InsertProjectUpdate(ctx, tx, pu, s.CT) }); err != nil {
		return err
	}
	s.Notify(ctx, fmt.Sprintf(`{"type":"project_update","id":%d}`, pu.ID))
	return nil
}

// launchScheduledInventoryUpdate syncs an inventory source on schedule,
// unless its last sync is newer than its cache timeout
// (InventorySource.cache_timeout_blocked).
func (s *Server) launchScheduledInventoryUpdate(ctx context.Context, sc *schedule, sourceID int64) error {
	src, err := models.GetInventorySource(ctx, s.Q(), sourceID)
	if err != nil {
		return err
	}
	if src.LastJobRun != nil && src.LastJobRun.Add(time.Duration(src.UpdateCacheTimeout)*time.Second).After(time.Now()) {
		s.Log.WarnContext(ctx, "cache timeout is in the future, bypassing schedule for template", "template", src.ID)
		return nil
	}
	if !s.sourceCanUpdate(ctx, src) {
		s.Log.WarnContext(ctx, "schedule skipped: the inventory source cannot be updated", "schedule", sc.ID, "template", src.ID)
		return nil
	}
	sid := sc.ID
	_, err = s.CreateInventoryUpdate(ctx, src, nil, "scheduled", func(iu *models.InventoryUpdate) { iu.ScheduleID = &sid })
	return err
}

// launchScheduledWorkflow creates the workflow job of a workflow template
// schedule, unless too many runs of the template are already waiting
// (WorkflowJobTemplate.cache_timeout_blocked).
func (s *Server) launchScheduledWorkflow(ctx context.Context, sc *schedule, t *models.WorkflowJobTemplate) error {
	maxJobs := s.scheduleMaxJobs(ctx)
	var active int64
	if err := s.Q().QueryRow(ctx, `SELECT count(*) FROM main_workflowjob w JOIN main_unifiedjob u ON u.id = w.unifiedjob_ptr_id WHERE w.workflow_job_template_id = $1 AND u.status IN ('pending', 'waiting', 'running')`, t.ID).Scan(&active); err != nil {
		return err
	}
	if active >= maxJobs {
		s.Log.ErrorContext(ctx, fmt.Sprintf("Workflow Job template %s could not be started because there are more than %d other jobs from that template waiting to run", t.Name, maxJobs))
		s.Log.WarnContext(ctx, "cache timeout is in the future, bypassing schedule for template", "template", t.ID)
		return nil
	}
	req, err := s.schedulePrompts(ctx, sc)
	if err != nil {
		return err
	}
	errs := newLaunchErrors()
	acc := s.acceptWorkflowLaunchPrompts(ctx, t, req, errs, false)
	if !errs.empty() {
		b, _ := json.Marshal(errs.m)
		s.Log.InfoContext(ctx, "errors creating scheduled workflow job", "schedule", sc.ID, "errors", string(b))
	}
	sid := sc.ID
	wj, err := s.CreateWorkflowJobFromTemplate(ctx, nil, t, acc, "scheduled", func(w *models.WorkflowJob) { w.ScheduleID = &sid })
	if err != nil {
		return err
	}
	s.Log.InfoContext(ctx, "spawned workflow job from schedule", "schedule", sc.ID, "workflow_job", wj.ID)
	return nil
}
