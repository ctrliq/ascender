package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/activity"
	"github.com/ctrliq/ascender/internal/auth"
	"github.com/ctrliq/ascender/internal/crypto"
	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/models"
	"github.com/ctrliq/ascender/internal/pystr"
)

// askMapping maps each promptable field to its ask flag, in the model's
// declaration order (which ordered the launch defaults).
var askMapping = [][2]string{
	{"inventory", "ask_inventory_on_launch"}, {"limit", "ask_limit_on_launch"}, {"scm_branch", "ask_scm_branch_on_launch"},
	{"labels", "ask_labels_on_launch"}, {"job_tags", "ask_tags_on_launch"}, {"skip_tags", "ask_skip_tags_on_launch"},
	{"extra_vars", "ask_variables_on_launch"}, {"diff_mode", "ask_diff_mode_on_launch"}, {"job_type", "ask_job_type_on_launch"},
	{"verbosity", "ask_verbosity_on_launch"}, {"credentials", "ask_credential_on_launch"}, {"execution_environment", "ask_execution_environment_on_launch"},
	{"forks", "ask_forks_on_launch"}, {"job_slice_count", "ask_job_slice_count_on_launch"}, {"timeout", "ask_timeout_on_launch"},
	{"instance_groups", "ask_instance_groups_on_launch"},
}

func askFlag(t *models.JobTemplate, flag string) bool {
	switch flag {
	case "ask_inventory_on_launch":
		return t.AskInventoryOnLaunch
	case "ask_limit_on_launch":
		return t.AskLimitOnLaunch
	case "ask_scm_branch_on_launch":
		return t.AskSCMBranchOnLaunch
	case "ask_labels_on_launch":
		return t.AskLabelsOnLaunch
	case "ask_tags_on_launch":
		return t.AskTagsOnLaunch
	case "ask_skip_tags_on_launch":
		return t.AskSkipTagsOnLaunch
	case "ask_variables_on_launch":
		return t.AskVariablesOnLaunch
	case "ask_diff_mode_on_launch":
		return t.AskDiffModeOnLaunch
	case "ask_job_type_on_launch":
		return t.AskJobTypeOnLaunch
	case "ask_verbosity_on_launch":
		return t.AskVerbosityOnLaunch
	case "ask_credential_on_launch":
		return t.AskCredentialOnLaunch
	case "ask_execution_environment_on_launch":
		return t.AskExecutionEnvironmentOnLaunch
	case "ask_forks_on_launch":
		return t.AskForksOnLaunch
	case "ask_job_slice_count_on_launch":
		return t.AskJobSliceCountOnLaunch
	case "ask_timeout_on_launch":
		return t.AskTimeoutOnLaunch
	case "ask_instance_groups_on_launch":
		return t.AskInstanceGroupsOnLaunch
	}
	return false
}

// templateAsks reports whether any prompt is enabled.
func templateAsks(t *models.JobTemplate) bool {
	for _, m := range askMapping {
		if askFlag(t, m[1]) {
			return true
		}
	}
	return false
}

// surveyPasswordVariables lists the password-type survey variables.
func surveyPasswordVariables(t *models.JobTemplate) []string {
	var out []string
	if !t.HasSurvey() {
		return out
	}
	for _, e := range t.SurveyElements() {
		if ty, _ := e["type"].(string); ty == "password" {
			if v, _ := e["variable"].(string); v != "" {
				out = append(out, v)
			}
		}
	}
	return out
}

// variablesNeededToStart lists the required survey variables.
func variablesNeededToStart(t *models.JobTemplate) []string {
	out := []string{}
	if !t.HasSurvey() {
		return out
	}
	for _, e := range t.SurveyElements() {
		if req, _ := e["required"].(bool); req {
			if v, _ := e["variable"].(string); v != "" {
				out = append(out, v)
			}
		}
	}
	return out
}

// passwordsNeeded unions the launch passwords of credentials, in order.
func passwordsNeeded(creds []models.CredentialBrief) []string {
	out := []string{}
	for _, cr := range creds {
		out = append(out, cr.PasswordsNeeded()...)
	}
	return out
}

func numberValue(v any) (float64, bool) {
	switch t := v.(type) {
	case json.Number:
		f, err := t.Float64()
		return f, err == nil
	case float64:
		return t, true
	case int64:
		return float64(t), true
	case int:
		return float64(t), true
	}
	return 0, false
}

func limitValue(e map[string]any, key string) (float64, bool) {
	v, ok := e[key]
	if !ok || v == nil || v == "" {
		return 0, false
	}
	switch t := v.(type) {
	case string:
		f, err := strconv.ParseFloat(t, 64)
		return f, err == nil
	default:
		return numberValue(v)
	}
}

func choiceList(e map[string]any) []string {
	var out []string
	switch ch := e["choices"].(type) {
	case string:
		for _, line := range strings.Split(ch, "\n") {
			if strings.TrimSpace(line) != "" {
				out = append(out, line)
			}
		}
	case []any:
		for _, x := range ch {
			out = append(out, fmt.Sprint(x))
		}
	}
	return out
}

func pyList(items []string) string {
	parts := make([]string, len(items))
	for i, s := range items {
		parts[i] = pyRepr(s)
	}
	return "[" + strings.Join(parts, ", ") + "]"
}

// surveyElementValidation reproduces _survey_element_validation.
func surveyElementValidation(e map[string]any, data map[string]any, validateRequired bool) []string {
	var errs []string
	variable, _ := e["variable"].(string)
	typ, _ := e["type"].(string)
	required, _ := e["required"].(bool)
	value, present := data[variable]
	if typ == "password" {
		if pv, ok := value.(string); ok && pv == "$encrypted$" {
			if e["default"] == nil && required && validateRequired {
				errs = append(errs, fmt.Sprintf("'%s' value missing", variable))
			}
			return errs
		}
	}
	if !present && required {
		if validateRequired {
			errs = append(errs, fmt.Sprintf("'%s' value missing", variable))
		}
		return errs
	}
	switch typ {
	case "textarea", "text", "password":
		if present {
			sv, ok := value.(string)
			if !ok {
				return append(errs, fmt.Sprintf("Value %s for '%s' expected to be a string.", pyRepr(plainValue(value)), variable))
			}
			if min, ok := limitValue(e, "min"); ok && float64(len([]rune(sv))) < min {
				errs = append(errs, fmt.Sprintf("'%s' value %s is too small (length is %d must be at least %s).", variable, sv, len([]rune(sv)), fmt.Sprint(e["min"])))
			}
			if max, ok := limitValue(e, "max"); ok && float64(len([]rune(sv))) > max {
				errs = append(errs, fmt.Sprintf("'%s' value %s is too large (must be no more than %s).", variable, sv, fmt.Sprint(e["max"])))
			}
		}
	case "integer":
		if present {
			if !isInt(value) {
				return append(errs, fmt.Sprintf("Value %s for '%s' expected to be an integer.", pyRepr(plainValue(value)), variable))
			}
			n, _ := numberValue(value)
			if min, ok := limitValue(e, "min"); ok && n < min {
				errs = append(errs, fmt.Sprintf("'%s' value %s is too small (must be at least %s).", variable, pyRepr(plainValue(value)), fmt.Sprint(e["min"])))
			}
			if max, ok := limitValue(e, "max"); ok && n > max {
				errs = append(errs, fmt.Sprintf("'%s' value %s is too large (must be no more than %s).", variable, pyRepr(plainValue(value)), fmt.Sprint(e["max"])))
			}
		}
	case "float":
		if present {
			n, ok := numberValue(value)
			if !ok {
				return append(errs, fmt.Sprintf("Value %s for '%s' expected to be a numeric type.", pyRepr(plainValue(value)), variable))
			}
			if min, ok := limitValue(e, "min"); ok && n < min {
				errs = append(errs, fmt.Sprintf("'%s' value %s is too small (must be at least %s).", variable, pyRepr(plainValue(value)), fmt.Sprint(e["min"])))
			}
			if max, ok := limitValue(e, "max"); ok && n > max {
				errs = append(errs, fmt.Sprintf("'%s' value %s is too large (must be no more than %s).", variable, pyRepr(plainValue(value)), fmt.Sprint(e["max"])))
			}
		}
	case "multiselect":
		if present {
			list, ok := value.([]any)
			if !ok {
				errs = append(errs, fmt.Sprintf("'%s' value is expected to be a list.", variable))
			} else {
				choices := choiceList(e)
				for _, val := range list {
					found := false
					for _, ch := range choices {
						if ch == fmt.Sprint(val) {
							found = true
						}
					}
					if !found {
						errs = append(errs, fmt.Sprintf("Value %s for '%s' expected to be one of %s.", fmt.Sprint(val), variable, pyList(choices)))
					}
				}
			}
		}
	case "multiplechoice":
		if present {
			choices := choiceList(e)
			found := false
			for _, ch := range choices {
				if ch == fmt.Sprint(value) {
					found = true
				}
			}
			if !found {
				errs = append(errs, fmt.Sprintf("Value %s for '%s' expected to be one of %s.", fmt.Sprint(value), variable, pyList(choices)))
			}
		}
	}
	return errs
}

// launchRequest is the parsed body of a launch or relaunch.
type launchRequest struct {
	ExtraVars           map[string]any
	HasExtraVars        bool
	Inventory           *int64
	Credentials         []int64
	HasCredentials      bool
	CredentialPasswords map[string]string
	SCMBranch           *string
	DiffMode            *bool
	JobTags             *string
	JobType             *string
	SkipTags            *string
	Limit               *string
	Verbosity           *int64
	ExecutionEnv        *int64
	Labels              []int64
	HasLabels           bool
	Forks               *int64
	JobSliceCount       *int64
	Timeout             *int64
	InstanceGroups      []int64
	HasInstanceGroups   bool
}

// parseLaunchRequest validates the launch body as JobLaunchSerializer's
// fields did.
func (s *Server) parseLaunchRequest(r *http.Request, body *OMap) (*launchRequest, error) {
	req := &launchRequest{}
	// WorkflowJobLaunchSerializer has fewer fields than JobLaunchSerializer;
	// the others are not read.
	wfjt := r != nil && r.URL != nil && wfjtLaunchPathRe.MatchString(r.URL.Path)
	launchFields := []string{"extra_vars", "inventory", "credentials", "credential_passwords", "scm_branch", "limit", "job_tags", "skip_tags", "job_type", "verbosity",
		"diff_mode", "execution_environment", "labels", "forks", "job_slice_count", "timeout", "instance_groups"}
	if wfjt {
		launchFields = []string{"extra_vars", "inventory", "limit", "scm_branch", "labels", "skip_tags", "job_tags"}
	}
	known := map[string]bool{}
	for _, k := range launchFields {
		known[k] = true
	}
	fields := NewOMap()
	for _, k := range body.Keys() {
		if known[k] {
			v, _ := body.Get(k)
			fields.Set(k, v)
		}
	}
	// Old clients sent inventory_id (a workflow launch let it win).
	if body.Has("inventory_id") && (wfjt || !body.Has("inventory")) {
		v, _ := body.Get("inventory_id")
		fields.Set("inventory", v)
	}
	f := NewForm(fields, true)
	// None of the launch fields allows null.
	for _, k := range fields.Keys() {
		if v, _ := fields.Get(k); v == nil {
			f.Errs.Add(k, "This field may not be null.")
			fields.Delete(k)
		}
	}
	if raw, ok := fields.Get("extra_vars"); ok {
		req.HasExtraVars = true
		switch v := raw.(type) {
		case *OMap:
			req.ExtraVars = plainValue(v).(map[string]any)
		case map[string]any:
			req.ExtraVars = v
		case string:
			m, err := ParseVars(v)
			switch {
			case err != nil:
				f.Errs.Add("extra_vars", err.Error())
			case refusesCiphertext(auth.UserFrom(r.Context()), m):
				f.Errs.Add("extra_vars", encryptedValueMsg)
			default:
				req.ExtraVars = m
			}
		default:
			f.Errs.Add("extra_vars", fmt.Sprintf("Input type `%s` is not a dictionary", pyTypeName(v)))
		}
	}
	if id, set := f.ID("inventory", nil, false, s.existsIn(r.Context(), "main_inventory")); set && id != nil {
		req.Inventory = id
	}
	if ids, set, ok := f.idList("credentials", "Credential", s.credentialExists(r)); set && ok {
		req.Credentials, req.HasCredentials = ids, true
	}
	if ids, set, ok := f.idList("labels", "Label", s.existsIn(r.Context(), "main_label")); set && ok {
		req.Labels, req.HasLabels = ids, true
	}
	if ids, set, ok := f.idList("instance_groups", "Instance Group", func(id int64) bool {
		g, _ := s.loadInstanceGroup(r, id)
		return g != nil
	}); set && ok {
		req.InstanceGroups, req.HasInstanceGroups = ids, true
	}
	if raw, ok := fields.Get("credential_passwords"); ok {
		req.CredentialPasswords = map[string]string{}
		if m, ok := raw.(*OMap); ok {
			for _, k := range m.Keys() {
				v, _ := m.Get(k)
				if sv, ok := v.(string); ok {
					req.CredentialPasswords[k] = sv
				} else if v != nil {
					req.CredentialPasswords[k] = fmt.Sprint(v)
				}
			}
		}
	}
	// Credential passwords were historically top-level attributes.
	for _, k := range body.Keys() {
		if wfjt {
			break
		}
		if k == "ssh_password" || k == "become_password" || k == "ssh_key_unlock" || strings.HasPrefix(k, "vault_password") {
			if req.CredentialPasswords == nil {
				req.CredentialPasswords = map[string]string{}
			}
			if _, done := req.CredentialPasswords[k]; !done {
				v, _ := body.Get(k)
				if sv, ok := v.(string); ok {
					req.CredentialPasswords[k] = sv
				}
			}
		}
	}
	str := func(key string, max int) *string {
		if !fields.Has(key) {
			return nil
		}
		v := f.String(key, false, max, "")
		return &v
	}
	req.SCMBranch = str("scm_branch", 1024)
	req.JobTags = str("job_tags", 0)
	req.SkipTags = str("skip_tags", 0)
	req.Limit = str("limit", 0)
	if fields.Has("diff_mode") {
		v := f.Bool("diff_mode", false)
		req.DiffMode = &v
	}
	if fields.Has("job_type") {
		v := f.Choice("job_type", "", jobTypeChoices, false)
		req.JobType = &v
	}
	if fields.Has("verbosity") {
		v := f.intChoice("verbosity", 0, verbosityChoices)
		req.Verbosity = &v
	}
	if id, set := f.ID("execution_environment", nil, false, s.existsIn(r.Context(), "main_executionenvironment")); set && id != nil {
		req.ExecutionEnv = id
	}
	zero := int64(0)
	if fields.Has("forks") {
		v := f.Int("forks", 0, &zero, nil)
		req.Forks = &v
	}
	if fields.Has("job_slice_count") {
		v := f.Int("job_slice_count", 0, &zero, nil)
		req.JobSliceCount = &v
	}
	if fields.Has("timeout") {
		v := f.Int("timeout", 0, nil, nil)
		req.Timeout = &v
	}
	if err := f.Err(); err != nil {
		return nil, err
	}
	return req, nil
}

// idList reads a list of primary keys; set reports presence, ok validity.
func (f *Form) idList(key, model string, exists func(int64) bool) ([]int64, bool, bool) {
	raw, present := f.Body.Get(key)
	if !present {
		return nil, false, false
	}
	list, ok := raw.([]any)
	if !ok {
		f.Errs.Add(key, fmt.Sprintf("Expected a list of items but got type \"%s\".", pyTypeName(raw)))
		return nil, true, false
	}
	out := make([]int64, 0, len(list))
	for _, item := range list {
		id, ok := integerOf(item)
		if !ok {
			f.Errs.Add(key, "Incorrect type. Expected pk value, received str.")
			return nil, true, false
		}
		if exists != nil && !exists(id) {
			f.Errs.Add(key, fmt.Sprintf("Invalid pk \"%d\" - object does not exist.", id))
			return nil, true, false
		}
		out = append(out, id)
	}
	return out, true, true
}

// launchErrors collects the launch validation errors in insertion order;
// every value is rendered as a list, as DRF did.
type launchErrors struct{ m *OMap }

func newLaunchErrors() *launchErrors { return &launchErrors{m: NewOMap()} }

func (e *launchErrors) add(field string, msg string) {
	cur, _ := e.m.Get(field)
	list, _ := cur.([]any)
	e.m.Set(field, append(list, msg))
}

func (e *launchErrors) set(field string, msgs []string) {
	list := make([]any, 0, len(msgs))
	for _, m := range msgs {
		list = append(list, m)
	}
	e.m.Set(field, list)
}

func (e *launchErrors) empty() bool { return e.m.Len() == 0 }

func (e *launchErrors) err() error {
	return &APIError{Status: http.StatusBadRequest, Body: e.m}
}

// acceptedPrompts is the outcome of _accept_or_ignore_job_kwargs.
type acceptedPrompts struct {
	models.JobPrompts
	HasExtraVars bool
	Ignored      *OMap
	// StartArgs are signal_start's other keyword arguments, stored with
	// the launch passwords (the provisioning callback's
	// inventory_sources_already_updated).
	StartArgs map[string]any
}

func sameIDList(a, b []int64) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func idsAny(ids []int64) []any {
	out := make([]any, 0, len(ids))
	for _, id := range ids {
		out = append(out, id)
	}
	return out
}

// effectiveSliceCount reproduces get_effective_slice_ct.
func (s *Server) effectiveSliceCount(ctx context.Context, t *models.JobTemplate, inventory *int64, sliceCount int64) int64 {
	if inventory == nil {
		return sliceCount
	}
	hosts, err := models.InventoryHostCount(ctx, s.Q(), *inventory)
	if err != nil {
		return sliceCount
	}
	pinned := t.JobSlicePinnedHostsList()
	if len(pinned) > 0 && hosts > 0 && sliceCount > 1 {
		var pinnedCount int64
		_ = db.Tolerant(s.Q()).QueryRow(ctx, `SELECT count(*) FROM main_host WHERE inventory_id = $1 AND name = ANY($2)`, *inventory, pinned).Scan(&pinnedCount)
		hosts -= pinnedCount
		if hosts < 1 {
			hosts = 1
		}
	}
	if hosts < sliceCount {
		return hosts
	}
	return sliceCount
}

// acceptPrompts applies the template's prompting rules to a launch request,
// as _accept_or_ignore_job_kwargs did for a manual launch (prompt errors
// are not blocking: the fields are ignored instead).
func (s *Server) acceptPrompts(ctx context.Context, t *models.JobTemplate, req *launchRequest, templateCreds []models.CredentialBrief, errs *launchErrors, strict bool) *acceptedPrompts {
	acc := &acceptedPrompts{Ignored: NewOMap()}
	// extra_vars
	if req.HasExtraVars {
		accepted, rejected, leftover, surveyErrs := s.acceptVariablesLeftover(t, req.ExtraVars, strict)
		if len(surveyErrs) > 0 {
			errs.set("variables_needed_to_start", surveyErrs)
		}
		if len(accepted) > 0 {
			acc.ExtraVars = accepted
			acc.HasExtraVars = true
		}
		if len(rejected) > 0 {
			acc.Ignored.Set("extra_vars", rejected)
			if strict && len(leftover) > 0 {
				keys := make([]string, 0, len(leftover))
				for k := range leftover {
					keys = append(keys, k)
				}
				sort.Strings(keys)
				errs.add("extra_vars", fmt.Sprintf("Variables %s are not allowed on launch. Check the Prompt on Launch setting on the Job Template to include Extra Variables.", strings.Join(keys, ", ")))
			}
		}
	} else {
		_, _, surveyErrs := s.acceptVariables(t, map[string]any{}, strict)
		if len(surveyErrs) > 0 {
			errs.set("variables_needed_to_start", surveyErrs)
		}
	}
	reject := func(field string, value any) {
		acc.Ignored.Set(field, value)
		if strict {
			errs.add(field, "Field is not configured to prompt on launch.")
		}
	}
	var project *models.Project
	if t.ProjectID != nil {
		var err error
		if project, err = models.GetProject(ctx, s.Q(), *t.ProjectID); err != nil {
			// Without the project, branch prompts are refused (no
			// allow_override); a failure other than its absence is logged.
			if !db.IsNoRows(err) {
				s.Log.ErrorContext(ctx, "launch prompts: project", "project", *t.ProjectID, "err", err)
			}
			project = nil
		}
	}
	for _, m := range askMapping {
		field, flag := m[0], m[1]
		asks := askFlag(t, flag)
		switch field {
		case "inventory":
			if req.Inventory == nil || (t.InventoryID != nil && *t.InventoryID == *req.Inventory) {
				continue
			}
			if asks {
				acc.InventoryID = req.Inventory
			} else {
				reject(field, *req.Inventory)
			}
		case "limit":
			if req.Limit == nil || *req.Limit == t.Limit {
				continue
			}
			if asks {
				acc.Limit = req.Limit
			} else {
				reject(field, *req.Limit)
			}
		case "scm_branch":
			if req.SCMBranch == nil || *req.SCMBranch == t.SCMBranch {
				continue
			}
			if t.SCMBranch == "" && project != nil && *req.SCMBranch == project.SCMBranch {
				continue
			}
			if !asks {
				reject(field, *req.SCMBranch)
				continue
			}
			if project == nil {
				acc.Ignored.Set(field, *req.SCMBranch)
				errs.add(field, "Project is missing.")
				continue
			}
			if *req.SCMBranch != project.SCMBranch && !project.AllowOverride {
				acc.Ignored.Set(field, *req.SCMBranch)
				errs.add(field, "Project does not allow override of branch.")
				continue
			}
			acc.SCMBranch = req.SCMBranch
		case "labels":
			if !req.HasLabels {
				continue
			}
			cur, _ := models.TemplateLabels(ctx, s.Q(), []int64{t.ID})
			var curIDs []int64
			for _, l := range cur[t.ID] {
				curIDs = append(curIDs, l.ID)
			}
			if sameIDList(sortedCopy(req.Labels), sortedCopy(curIDs)) {
				continue
			}
			if asks {
				acc.Labels = req.Labels
			} else {
				reject(field, idsAny(req.Labels))
			}
		case "job_tags":
			if req.JobTags == nil || *req.JobTags == t.JobTags {
				continue
			}
			if asks {
				acc.JobTags = req.JobTags
			} else {
				reject(field, *req.JobTags)
			}
		case "skip_tags":
			if req.SkipTags == nil || *req.SkipTags == t.SkipTags {
				continue
			}
			if asks {
				acc.SkipTags = req.SkipTags
			} else {
				reject(field, *req.SkipTags)
			}
		case "extra_vars":
			continue
		case "diff_mode":
			if req.DiffMode == nil || *req.DiffMode == t.DiffMode {
				continue
			}
			if asks {
				acc.DiffMode = req.DiffMode
			} else {
				reject(field, *req.DiffMode)
			}
		case "job_type":
			if req.JobType == nil || *req.JobType == t.JobType {
				continue
			}
			if asks {
				acc.JobType = req.JobType
			} else {
				reject(field, *req.JobType)
			}
		case "verbosity":
			if req.Verbosity == nil || *req.Verbosity == t.Verbosity {
				continue
			}
			if asks {
				acc.Verbosity = req.Verbosity
			} else {
				reject(field, *req.Verbosity)
			}
		case "credentials":
			if !req.HasCredentials {
				continue
			}
			have := map[int64]bool{}
			for _, cr := range templateCreds {
				have[cr.ID] = true
			}
			var newOnes []int64
			for _, id := range req.Credentials {
				if !have[id] {
					newOnes = append(newOnes, id)
				}
			}
			if len(newOnes) == 0 {
				continue
			}
			if asks {
				acc.Credentials = newOnes
			} else {
				reject(field, idsAny(newOnes))
			}
		case "execution_environment":
			if req.ExecutionEnv == nil || (t.ExecutionEnvironmentID != nil && *t.ExecutionEnvironmentID == *req.ExecutionEnv) {
				continue
			}
			if asks {
				acc.ExecutionEnvironment = req.ExecutionEnv
			} else {
				reject(field, *req.ExecutionEnv)
			}
		case "forks":
			if req.Forks == nil || *req.Forks == t.Forks {
				continue
			}
			if asks {
				acc.Forks = req.Forks
			} else {
				reject(field, *req.Forks)
			}
		case "job_slice_count":
			if req.JobSliceCount == nil || *req.JobSliceCount == t.JobSliceCount {
				continue
			}
			if !asks {
				reject(field, *req.JobSliceCount)
				continue
			}
			inv := t.InventoryID
			if t.AskInventoryOnLaunch && req.Inventory != nil {
				inv = req.Inventory
			}
			if *req.JobSliceCount > 1 && s.effectiveSliceCount(ctx, t, inv, *req.JobSliceCount) <= 1 {
				acc.Ignored.Set(field, *req.JobSliceCount)
				errs.add(field, "Job inventory does not have enough hosts for slicing")
				continue
			}
			acc.JobSliceCount = req.JobSliceCount
		case "timeout":
			if req.Timeout == nil || *req.Timeout == t.Timeout {
				continue
			}
			if asks {
				acc.Timeout = req.Timeout
			} else {
				reject(field, *req.Timeout)
			}
		case "instance_groups":
			if !req.HasInstanceGroups {
				continue
			}
			cur, _ := models.TemplateInstanceGroupIDs(ctx, s.Q(), t.ID)
			if sameIDList(req.InstanceGroups, cur) {
				continue
			}
			if asks {
				acc.InstanceGroups = req.InstanceGroups
			} else {
				reject(field, idsAny(req.InstanceGroups))
			}
		}
	}
	if strict && !t.AskCredentialOnLaunch && len(passwordsNeeded(templateCreds)) > 0 {
		errs.add("passwords_needed_to_start", "Saved launch configurations cannot provide passwords needed to start.")
	}
	var needed []string
	if t.ProjectID == nil {
		needed = append(needed, "Job Template project is missing or undefined.")
	}
	if t.InventoryID == nil && acc.InventoryID == nil {
		needed = append(needed, "Job Template inventory is missing or undefined.")
	}
	if len(needed) > 0 {
		errs.set("resources_needed_to_start", needed)
	}
	return acc
}

func sortedCopy(ids []int64) []int64 {
	out := append([]int64(nil), ids...)
	sort.Slice(out, func(i, j int) bool { return out[i] < out[j] })
	return out
}

// acceptVariables reproduces _accept_or_ignore_variables: survey answers are
// validated, prompted variables accepted when the template asks for them,
// and the rest rejected (minus values identical to the template's).
func (s *Server) acceptVariables(t *models.JobTemplate, data map[string]any, strict bool) (accepted, rejected map[string]any, surveyErrs []string) {
	accepted, rejected, _, surveyErrs = s.acceptVariablesLeftover(t, data, strict)
	return accepted, rejected, surveyErrs
}

// acceptVariablesLeftover is acceptVariables also returning the variables
// left over (not survey answers, not prompted), which alone are "not
// allowed on launch": a survey answer that failed validation is rejected
// without that error.
func (s *Server) acceptVariablesLeftover(t *models.JobTemplate, data map[string]any, strict bool) (accepted, rejected, leftover map[string]any, surveyErrs []string) {
	accepted = map[string]any{}
	rejected = map[string]any{}
	extra := map[string]any{}
	for k, v := range data {
		extra[k] = v
	}
	if t.SurveyEnabled && len(t.SurveySpecMap()) > 0 {
		for _, e := range t.SurveyElements() {
			key, _ := e["variable"].(string)
			elementErrs := surveyElementValidation(e, data, true)
			if len(elementErrs) > 0 {
				surveyErrs = append(surveyErrs, elementErrs...)
				if v, ok := extra[key]; ok {
					rejected[key] = v
					delete(extra, key)
				}
			} else if v, ok := extra[key]; ok {
				accepted[key] = v
				delete(extra, key)
			}
		}
	}
	if t.AskVariablesOnLaunch {
		for k, v := range extra {
			accepted[k] = v
		}
		extra = map[string]any{}
	}
	if len(extra) > 0 {
		tmpl, _ := ParseVars(t.ExtraVars)
		for k, v := range extra {
			if tv, ok := tmpl[k]; ok && jsonEqual(tv, v) {
				delete(extra, k)
			}
		}
	}
	for k, v := range extra {
		rejected[k] = v
	}
	return accepted, rejected, extra, surveyErrs
}

func jsonEqual(a, b any) bool {
	ab, err1 := json.Marshal(plainValue(a))
	bb, err2 := json.Marshal(plainValue(b))
	return err1 == nil && err2 == nil && string(ab) == string(bb)
}

// launchCredentials resolves the credentials a launch runs with: the
// template's, with prompted ones replacing those of the same type.
func mergeCredentials(templateCreds, prompted []models.CredentialBrief) []models.CredentialBrief {
	out := append([]models.CredentialBrief(nil), templateCreds...)
	for _, p := range prompted {
		replaced := false
		for i, cur := range out {
			if cur.UniqueHash() == p.UniqueHash() {
				out[i] = p
				replaced = true
				break
			}
		}
		if !replaced {
			out = append(out, p)
		}
	}
	return out
}

func credentialIDs(creds []models.CredentialBrief) []int64 {
	out := make([]int64, 0, len(creds))
	for _, c := range creds {
		out = append(out, c.ID)
	}
	return out
}

// validateLaunch runs the remaining JobLaunchSerializer.validate checks and
// resolves the credentials and passwords of the launch.
func (s *Server) validateLaunch(r *http.Request, t *models.JobTemplate, req *launchRequest, acc *acceptedPrompts, templateCreds []models.CredentialBrief, errs *launchErrors) ([]models.CredentialBrief, map[string]string) {
	if t.ProjectID == nil {
		errs.add("project", "A project is required to run a job.")
	} else if p, err := models.GetProject(r.Context(), s.Q(), *t.ProjectID); err == nil {
		if reason := models.ProjectFailureReason(r.Context(), s.Q(), p); reason != "" {
			errs.add("playbook", reason)
		}
	}
	if acc.InventoryID != nil || t.InventoryID != nil {
		inv := t.InventoryID
		if acc.InventoryID != nil {
			inv = acc.InventoryID
		}
		var pending bool
		if err := s.Q().QueryRow(r.Context(), `SELECT pending_deletion FROM main_inventory WHERE id = $1`, *inv).Scan(&pending); err == nil && pending {
			if acc.InventoryID != nil {
				errs.add("inventory", "The provided inventory is being deleted.")
			} else {
				errs.add("inventory", "The inventory associated with this Job Template is being deleted.")
			}
		}
	}
	var prompted []models.CredentialBrief
	if len(acc.Credentials) > 0 {
		var err error
		if prompted, err = models.LoadCredentialBriefs(r.Context(), s.Q(), acc.Credentials); err != nil {
			s.Log.ErrorContext(r.Context(), "launch validation: prompted credentials", "err", err)
		}
		seen := map[string]bool{}
		for _, cr := range prompted {
			if seen[cr.UniqueHash()] {
				errs.add("credentials", fmt.Sprintf("Cannot assign multiple %s credentials.", cr.UniqueHashDisplay()))
			}
			if !validCredentialKinds[cr.TypeKind] {
				errs.add("credentials", fmt.Sprintf("Cannot assign a Credential of kind `%s`", cr.TypeKind))
			}
			seen[cr.UniqueHash()] = true
		}
	}
	if req.HasCredentials {
		provided, err := models.LoadCredentialBriefs(r.Context(), s.Q(), req.Credentials)
		if err != nil {
			s.Log.ErrorContext(r.Context(), "launch validation: provided credentials", "err", err)
		}
		providedHashes := map[string]bool{}
		providedIDs := map[int64]bool{}
		for _, cr := range provided {
			providedHashes[cr.UniqueHash()] = true
			providedIDs[cr.ID] = true
		}
		var removed []models.CredentialBrief
		for _, cr := range templateCreds {
			if !providedIDs[cr.ID] {
				removed = append(removed, cr)
			}
		}
		for _, cr := range removed {
			if providedHashes[cr.UniqueHash()] {
				continue
			}
			names := make([]string, 0, len(removed))
			for _, rc := range removed {
				names = append(names, rc.Name)
			}
			errs.add("credentials", fmt.Sprintf("Removing %s credential at launch time without replacement is not supported. Provided list lacked credential(s): %s.", cr.UniqueHashDisplay(), strings.Join(names, ", ")))
		}
	}
	launchCreds := templateCreds
	if len(acc.Credentials) > 0 {
		launchCreds = mergeCredentials(templateCreds, prompted)
	}
	passwords := map[string]string{}
	var lacking []string
	for _, cr := range launchCreds {
		for _, p := range cr.PasswordsNeeded() {
			if v, ok := req.CredentialPasswords[p]; ok {
				passwords[p] = v
			} else {
				lacking = append(lacking, p)
			}
		}
	}
	if len(lacking) > 0 {
		errs.set("passwords_needed_to_start", lacking)
	}
	return launchCreds, passwords
}

// launchConfigAllowed mirrors JobLaunchConfigAccess.can_add: use on the
// prompted inventory, credentials and instance groups, read on the
// environment and labels.
func (s *Server) launchConfigAllowed(c *SerCtx, t *models.JobTemplate, acc *acceptedPrompts) bool {
	if c.User.IsSuperuser {
		return true
	}
	if acc.InventoryID != nil && !c.HasRoleOn("main.inventory", *acc.InventoryID, "use_role") {
		return false
	}
	if acc.ExecutionEnvironment != nil && !s.eeReadable(c, *acc.ExecutionEnvironment) {
		return false
	}
	for _, id := range acc.Credentials {
		if !c.HasRoleOn("main.credential", id, "use_role") {
			return false
		}
	}
	for _, id := range acc.InstanceGroups {
		if !c.HasRoleOn("main.instancegroup", id, "use_role") {
			return false
		}
	}
	for _, id := range acc.Labels {
		var org int64
		if err := s.Q().QueryRow(c.Ctx(), `SELECT organization_id FROM main_label WHERE id = $1`, id).Scan(&org); err == nil && !c.HasRoleOn("main.organization", org, "read_role") {
			return false
		}
	}
	return true
}

// mergedExtraVars reproduces _update_unified_job_kwargs: template
// extra_vars, then validated survey defaults, then the runtime values.
func (s *Server) mergedExtraVars(t *models.JobTemplate, runtime map[string]any) map[string]any {
	out, _ := ParseVars(t.ExtraVars)
	if out == nil {
		out = map[string]any{}
	}
	rt := map[string]any{}
	for k, v := range runtime {
		rt[k] = v
	}
	if t.HasSurvey() {
		for _, e := range t.SurveyElements() {
			key, _ := e["variable"].(string)
			typ, _ := e["type"].(string)
			required, _ := e["required"].(bool)
			if typ == "password" {
				if v, ok := rt[key]; ok {
					if sv, ok := v.(string); ok && sv == "$encrypted$" {
						delete(rt, key)
					}
				}
			}
			def, has := e["default"]
			if !has || def == nil {
				continue
			}
			if ds, ok := def.(string); ok && ds == "" && !required && typ != "password" {
				if _, present := rt[key]; !present {
					continue
				}
			}
			decrypted := def
			if typ == "password" {
				if ds, ok := def.(string); ok && strings.HasPrefix(ds, "$encrypted$") {
					if plain, err := s.decryptSurveyDefault(ds); err == nil {
						decrypted = plain
					}
				}
			}
			if len(surveyElementValidation(e, map[string]any{key: decrypted}, true)) == 0 {
				out[key] = def
			}
		}
	}
	for k, v := range rt {
		out[k] = v
	}
	return out
}

// launchOutcome is what a launch produced: a job, or a workflow job when
// the template sliced or federated.
type launchOutcome struct {
	Job         *models.Job
	WorkflowJob *models.WorkflowJob
	Ignored     *OMap
	// CannotStart is why a workflow node's job was failed instead of
	// started.
	CannotStart string
}

// spawnPrevent is create_unified_job's _prevent_slicing and
// _prevent_federation: a launch that must make a job, not a sliced or a
// federated workflow job.
type spawnPrevent struct {
	slicing, federation bool
}

// createJobFromTemplate builds and stores the job a template launch
// produces, as create_unified_job did; passwords are the launch passwords
// that go into start_args.
func (s *Server) createJobFromTemplate(ctx context.Context, actorID *int64, t *models.JobTemplate, acc *acceptedPrompts, launchCreds []models.CredentialBrief, passwords map[string]string, launchType string, eager func(j *models.Job), prevent spawnPrevent) (*launchOutcome, error) {
	preventSlicing := prevent.slicing
	// Survey password answers are encrypted before anything is stored.
	runtimeVars := map[string]any{}
	for k, v := range acc.ExtraVars {
		runtimeVars[k] = v
	}
	passwordVars := surveyPasswordVariables(t)
	for _, pv := range passwordVars {
		if v, ok := runtimeVars[pv]; ok {
			if sv, ok := v.(string); ok && sv != "" && !crypto.IsEncrypted(sv) {
				enc, err := s.encryptSurveyDefault(sv)
				if err != nil {
					return nil, err
				}
				runtimeVars[pv] = enc
			}
		}
	}
	merged := s.mergedExtraVars(t, runtimeVars)
	mergedJSON, err := json.Marshal(merged)
	if err != nil {
		return nil, err
	}
	surveyPasswords := map[string]any{}
	for _, pv := range passwordVars {
		surveyPasswords[pv] = "$encrypted$"
	}
	cfg := &models.JobPrompts{InventoryID: acc.InventoryID, SCMBranch: acc.SCMBranch, Limit: acc.Limit, JobTags: acc.JobTags, SkipTags: acc.SkipTags,
		JobType: acc.JobType, Verbosity: acc.Verbosity, DiffMode: acc.DiffMode, Forks: acc.Forks, JobSliceCount: acc.JobSliceCount, Timeout: acc.Timeout,
		ExecutionEnvironment: acc.ExecutionEnvironment, InstanceGroups: acc.InstanceGroups}
	if acc.HasExtraVars {
		cfg.ExtraVars = runtimeVars
	}
	if len(surveyPasswords) > 0 {
		cfg.SurveyPasswords = surveyPasswords
	}
	// Prompted credentials and labels in the config are the diff against the template.
	templateCredIDs := map[int64]bool{}
	tcreds, err := models.TemplateCredentials(ctx, s.Q(), []int64{t.ID})
	if err != nil {
		return nil, err
	}
	for _, cr := range tcreds[t.ID] {
		templateCredIDs[cr.ID] = true
	}
	var cfgCreds []int64
	for _, id := range acc.Credentials {
		if !templateCredIDs[id] {
			cfgCreds = append(cfgCreds, id)
		}
	}
	tlabels, err := models.TemplateLabels(ctx, s.Q(), []int64{t.ID})
	if err != nil {
		return nil, err
	}
	var labelIDs []int64
	have := map[int64]bool{}
	for _, l := range tlabels[t.ID] {
		labelIDs = append(labelIDs, l.ID)
		have[l.ID] = true
	}
	var cfgLabels []int64
	for _, id := range acc.Labels {
		if !have[id] {
			cfgLabels = append(cfgLabels, id)
			labelIDs = append(labelIDs, id)
			have[id] = true
		}
	}
	inventory := t.InventoryID
	if acc.InventoryID != nil {
		inventory = acc.InventoryID
	}
	sliceCount := t.JobSliceCount
	if acc.JobSliceCount != nil {
		sliceCount = *acc.JobSliceCount
	}
	effectiveSlices := s.effectiveSliceCount(ctx, t, inventory, sliceCount)
	federated := false
	if inventory != nil && !prevent.federation {
		var kind string
		if err := s.Q().QueryRow(ctx, `SELECT kind FROM main_inventory WHERE id = $1`, *inventory).Scan(&kind); err != nil {
			return nil, err
		}
		federated = kind == "federated"
	}
	sliced := effectiveSlices > 1 && !preventSlicing
	pick := func(p *string, v string) string {
		if p != nil {
			return *p
		}
		return v
	}
	pickInt := func(p *int64, v int64) int64 {
		if p != nil {
			return *p
		}
		return v
	}
	if federated || sliced {
		w := &models.WorkflowJob{IsSlicedJob: true, JobTemplateID: &t.ID, InventoryID: inventory, ExtraVars: string(mergedJSON), AllowSimultaneous: t.AllowSimultaneous}
		w.Name = t.Name
		w.Description = t.Description
		w.LaunchType = launchType
		w.Status = "pending"
		w.CreatedByID = actorID
		w.UnifiedJobTemplateID = &t.ID
		w.OrganizationID = t.OrganizationID
		chars, _ := json.Marshal(cfg.CharPrompts())
		w.CharPrompts = chars
		sp, _ := json.Marshal(surveyPasswords)
		w.SurveyPasswords = sp
		var nodes []map[string]any
		if federated {
			// One node per input inventory, in their order, leaving out
			// those without hosts the limit targets. A launch none of them
			// matches makes a workflow job without nodes, which the
			// workflow manager finishes as successful.
			limit := t.Limit
			if acc.Limit != nil && *acc.Limit != "" {
				limit = *acc.Limit
			}
			limit = pystr.TrimSpace(limit)
			inputs, err := models.FederatedInputInventories(ctx, s.Q(), *inventory)
			if err != nil {
				return nil, err
			}
			for _, inv := range inputs {
				ok, err := models.FederatedInventoryHasMatchingHosts(ctx, s.Q(), inv, limit)
				if err != nil {
					return nil, err
				}
				if ok {
					nodes = append(nodes, map[string]any{"source_inventory_id": inv})
				}
			}
		} else {
			for i := int64(0); i < effectiveSlices; i++ {
				nodes = append(nodes, map[string]any{"job_slice": i + 1})
			}
		}
		err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
			if err := models.InsertWorkflowJob(ctx, tx, w, s.CT, nodes, credentialIDs(launchCreds), labelIDs, cfg, cfgCreds, cfgLabels); err != nil {
				return err
			}
			return s.Activity.Record(ctx, tx, activity.Entry{Operation: "create", Object1: "workflow_job", Changes: map[string]any{"name": w.Name, "id": w.ID, "job_template": activity.Ref(t.Name, t.ID), "status": w.Status, "is_sliced_job": true}, ActorID: actorID, Links: map[string]int64{"workflow_job": w.ID, "unified_job": w.ID}})
		})
		if err != nil {
			return nil, err
		}
		s.Notify(ctx, fmt.Sprintf(`{"type":"workflow_job","id":%d}`, w.ID))
		return &launchOutcome{WorkflowJob: w, Ignored: acc.Ignored}, nil
	}
	jb := &models.Job{
		JobType: pick(acc.JobType, t.JobType), Playbook: t.Playbook, Forks: pickInt(acc.Forks, t.Forks), Limit: pick(acc.Limit, t.Limit),
		Verbosity: pickInt(acc.Verbosity, t.Verbosity), ExtraVars: string(mergedJSON), JobTags: pick(acc.JobTags, t.JobTags), ForceHandlers: t.ForceHandlers,
		SkipTags: pick(acc.SkipTags, t.SkipTags), StartAtTask: t.StartAtTask, BecomeEnabled: t.BecomeEnabled, InventoryID: inventory, JobTemplateID: &t.ID,
		ProjectID: t.ProjectID, AllowSimultaneous: t.AllowSimultaneous, Timeout: pickInt(acc.Timeout, t.Timeout), UseFactCache: t.UseFactCache,
		SCMBranch: pick(acc.SCMBranch, t.SCMBranch), JobSlicePinnedHosts: t.JobSlicePinnedHosts, JobSliceCount: 1,
	}
	if acc.DiffMode != nil {
		jb.DiffMode = *acc.DiffMode
	} else {
		jb.DiffMode = t.DiffMode
	}
	if sliceCount > 1 && preventSlicing {
		jb.JobSliceCount = sliceCount
	}
	sp, _ := json.Marshal(surveyPasswords)
	jb.SurveyPasswords = sp
	jb.Name = t.Name
	jb.Description = t.Description
	jb.LaunchType = launchType
	jb.CreatedByID = actorID
	jb.UnifiedJobTemplateID = &t.ID
	jb.OrganizationID = t.OrganizationID
	jb.ExecutionEnvironmentID = t.ExecutionEnvironmentID
	if acc.ExecutionEnvironment != nil {
		jb.ExecutionEnvironmentID = acc.ExecutionEnvironment
	}
	if eager != nil {
		eager(jb)
	}
	// Dependencies: a project that updates on launch or an inventory with
	// sources that update on launch need the dependency manager first.
	jb.DependenciesProcessed = true
	if jb.ProjectID == nil {
		jb.DependenciesProcessed = false
	} else {
		var onLaunch bool
		if err := s.Q().QueryRow(ctx, `SELECT scm_update_on_launch FROM main_project WHERE unifiedjobtemplate_ptr_id = $1`, *jb.ProjectID).Scan(&onLaunch); err != nil {
			return nil, err
		}
		if onLaunch {
			jb.DependenciesProcessed = false
		}
	}
	if jb.DependenciesProcessed {
		if jb.InventoryID == nil {
			jb.DependenciesProcessed = false
		} else {
			var srcOnLaunch bool
			if err := s.Q().QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM main_inventorysource WHERE inventory_id = $1 AND update_on_launch)`, *jb.InventoryID).Scan(&srcOnLaunch); err != nil {
				return nil, err
			}
			if srcOnLaunch {
				jb.DependenciesProcessed = false
			}
		}
	}
	var hostCount *int64
	var pinnedCount int64
	if jb.InventoryID != nil {
		var n int64
		if err := s.Q().QueryRow(ctx, `SELECT total_hosts FROM main_inventory WHERE id = $1`, *jb.InventoryID).Scan(&n); err != nil {
			return nil, err
		}
		hostCount = &n
		if jb.JobSliceCount > 1 {
			if pinned := t.JobSlicePinnedHostsList(); len(pinned) > 0 {
				if err := s.Q().QueryRow(ctx, `SELECT count(*) FROM main_host WHERE inventory_id = $1 AND name = ANY($2)`, *jb.InventoryID, pinned).Scan(&pinnedCount); err != nil {
					return nil, err
				}
			}
		}
	}
	jb.TaskImpact = models.JobTaskImpact(launchType, hostCount, jb.Forks, jb.JobSliceCount, jb.JobSliceNumber, pinnedCount)
	if len(acc.InstanceGroups) > 0 {
		jb.PreferredInstanceGroups = acc.InstanceGroups
	} else {
		igs, err := models.PreferredInstanceGroups(ctx, s.Q(), &t.ID, jb.InventoryID, jb.OrganizationID, s.GlobalInstanceGroupNames(ctx))
		if err != nil {
			return nil, err
		}
		jb.PreferredInstanceGroups = igs
	}
	jb.Status = "pending"
	// The workflow manager only signalled a node's job to start when it
	// could: with its inventory and project, and with the passwords its
	// credentials prompt for among the workflow's start arguments.
	// Otherwise the job was failed where it stood.
	cannotStart := ""
	if launchType == "workflow" {
		if jb.InventoryID == nil || jb.ProjectID == nil {
			cannotStart = "Job spawned from workflow could not start because it was missing a related resource such as project or inventory"
		} else {
			for _, p := range passwordsNeeded(launchCreds) {
				if passwords[p] == "" {
					cannotStart = "Job spawned from workflow could not start because it was not in the right state or required manual credentials"
					break
				}
			}
		}
		if cannotStart != "" {
			jb.Status = "new"
		}
	}
	credIDs := credentialIDs(launchCreds)
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if err := models.InsertJob(ctx, tx, jb, s.CT, credIDs, labelIDs, cfg, cfgCreds, cfgLabels); err != nil {
			return err
		}
		args := map[string]any{}
		for k, v := range passwords {
			args[k] = v
		}
		for k, v := range acc.StartArgs {
			args[k] = v
		}
		startArgs, _ := json.Marshal(args)
		enc, err := crypto.EncryptField(s.Cfg.SecretKey, "start_args", &jb.ID, string(startArgs), false)
		if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE main_unifiedjob SET start_args = $2 WHERE id = $1`, jb.ID, enc); err != nil {
			return err
		}
		jb.StartArgs = enc
		changes, err := s.jobChanges(ctx, tx, jb, launchCreds, labelIDs)
		if err != nil {
			return err
		}
		if err := s.Activity.Record(ctx, tx, activity.Entry{Operation: "create", Object1: "job", Changes: changes, ActorID: actorID, Links: map[string]int64{"job": jb.ID, "unified_job": jb.ID, "job_template": t.ID}}); err != nil {
			return err
		}
		if cannotStart == "" {
			return nil
		}
		jb.Status = "failed"
		if _, err := tx.Exec(ctx, `UPDATE main_unifiedjob SET status = 'failed', failed = true, finished = now(), job_explanation = $2, modified = now() WHERE id = $1`, jb.ID, cannotStart); err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `UPDATE main_unifiedjobtemplate SET status = 'failed', last_job_id = $2, last_job_failed = true, last_job_run = now(),
			current_job_id = CASE WHEN current_job_id = $2 THEN NULL ELSE current_job_id END, modified = now() WHERE id = $1`, t.ID, jb.ID)
		return err
	})
	if err != nil {
		return nil, err
	}
	if cannotStart != "" {
		return &launchOutcome{Job: jb, Ignored: acc.Ignored, CannotStart: cannotStart}, nil
	}
	s.Notify(ctx, fmt.Sprintf(`{"type":"job","id":%d}`, jb.ID))
	return &launchOutcome{Job: jb, Ignored: acc.Ignored}, nil
}

// jobChanges renders the activity stream record of a new job, reading
// through q, the launch's transaction.
func (s *Server) jobChanges(ctx context.Context, q db.Querier, jb *models.Job, creds []models.CredentialBrief, labelIDs []int64) (map[string]any, error) {
	credNames := make([]string, 0, len(creds))
	for _, cr := range creds {
		credNames = append(credNames, fmt.Sprintf("%s (%d)", cr.Name, cr.ID))
	}
	labelNames := []string{}
	if len(labelIDs) > 0 {
		rows, err := q.Query(ctx, `SELECT name FROM main_label WHERE id = ANY($1) ORDER BY name`, labelIDs)
		if err != nil {
			return nil, err
		}
		names, err := pgx.CollectRows(rows, pgx.RowTo[string])
		if err != nil {
			return nil, err
		}
		labelNames = append(labelNames, names...)
	}
	return map[string]any{
		"name": jb.Name, "description": jb.Description, "job_type": jb.JobType,
		"inventory": s.nameRefCtx(ctx, q, `SELECT name FROM main_inventory WHERE id = $1`, jb.InventoryID),
		"project":   s.nameRefCtx(ctx, q, `SELECT name FROM main_unifiedjobtemplate WHERE id = $1`, jb.ProjectID),
		"playbook":  jb.Playbook, "scm_branch": jb.SCMBranch, "forks": jb.Forks, "limit": jb.Limit, "job_slice_pinned_hosts": jb.JobSlicePinnedHosts,
		"verbosity": jb.Verbosity, "extra_vars": maskCiphertext(jb.ExtraVars), "job_tags": jb.JobTags, "force_handlers": jb.ForceHandlers, "skip_tags": jb.SkipTags,
		"start_at_task": jb.StartAtTask, "timeout": jb.Timeout, "use_fact_cache": jb.UseFactCache,
		"execution_environment": s.nameRefCtx(ctx, q, `SELECT name FROM main_executionenvironment WHERE id = $1`, jb.ExecutionEnvironmentID),
		"job_template":          s.nameRefCtx(ctx, q, `SELECT name FROM main_unifiedjobtemplate WHERE id = $1`, jb.JobTemplateID),
		"allow_simultaneous":    jb.AllowSimultaneous, "instance_group": nil, "diff_mode": jb.DiffMode, "job_slice_number": jb.JobSliceNumber,
		"job_slice_count": jb.JobSliceCount, "webhook_service": jb.WebhookService, "webhook_credential": nil, "webhook_guid": jb.WebhookGUID,
		"id": jb.ID, "credentials": credNames, "labels": labelNames,
	}, nil
}

// --- launch views ------------------------------------------------------------

func (s *Server) loadTemplateForStart(r *http.Request) (*models.JobTemplate, *SerCtx, error) {
	_, t, err := jobTemplateObj.fromPath(s, r, false)
	if err != nil {
		return nil, nil, err
	}
	c := s.NewSerCtx(r, true)
	if !c.HasRole(t.ExecuteRoleID) {
		return nil, nil, ErrForbidden
	}
	return t, c, nil
}

func (s *Server) jobTemplateLaunchView(w http.ResponseWriter, r *http.Request) error {
	t, c, err := s.loadTemplateForStart(r)
	if err != nil {
		return err
	}
	creds, err := models.TemplateCredentials(r.Context(), s.Q(), []int64{t.ID})
	if err != nil {
		return err
	}
	tcreds := creds[t.ID]
	needed := passwordsNeeded(tcreds)
	vars := variablesNeededToStart(t)
	o := NewOMap()
	o.Set("can_start_without_user_input", !templateAsks(t) && len(needed) == 0 && len(vars) == 0)
	o.Set("passwords_needed_to_start", needed)
	for _, flag := range []string{"ask_scm_branch_on_launch", "ask_variables_on_launch", "ask_tags_on_launch", "ask_diff_mode_on_launch", "ask_skip_tags_on_launch",
		"ask_job_type_on_launch", "ask_limit_on_launch", "ask_verbosity_on_launch", "ask_inventory_on_launch", "ask_credential_on_launch",
		"ask_execution_environment_on_launch", "ask_labels_on_launch", "ask_forks_on_launch", "ask_job_slice_count_on_launch", "ask_timeout_on_launch", "ask_instance_groups_on_launch"} {
		o.Set(flag, askFlag(t, flag))
	}
	o.Set("survey_enabled", t.HasSurvey())
	o.Set("variables_needed_to_start", vars)
	o.Set("credential_needed_to_start", false)
	o.Set("inventory_needed_to_start", t.InventoryID == nil)
	o.Set("job_template_data", NewOMap().Set("name", t.Name).Set("id", t.ID).Set("description", t.Description))
	defaults := NewOMap()
	invDefault := NewOMap().Set("name", nil).Set("id", nil)
	if t.InventoryID != nil {
		var name string
		if err := s.Q().QueryRow(r.Context(), `SELECT name FROM main_inventory WHERE id = $1`, *t.InventoryID).Scan(&name); err == nil {
			invDefault = NewOMap().Set("name", name).Set("id", *t.InventoryID)
		}
	}
	defaults.Set("inventory", invDefault)
	defaults.Set("limit", t.Limit).Set("scm_branch", t.SCMBranch)
	labels, err := models.TemplateLabels(r.Context(), s.Q(), []int64{t.ID})
	if err != nil {
		return err
	}
	labelList := make([]any, 0, len(labels[t.ID]))
	for _, l := range labels[t.ID] {
		labelList = append(labelList, NewOMap().Set("id", l.ID).Set("name", l.Name))
	}
	if len(labelList) > 0 {
		defaults.Set("labels", labelList)
	}
	defaults.Set("job_tags", t.JobTags).Set("skip_tags", t.SkipTags).Set("extra_vars", t.ExtraVars).Set("diff_mode", t.DiffMode)
	defaults.Set("job_type", t.JobType).Set("verbosity", t.Verbosity)
	credList := make([]any, 0, len(tcreds))
	for _, cr := range tcreds {
		cd := NewOMap().Set("id", cr.ID).Set("name", cr.Name).Set("credential_type", cr.CredentialTypeID).Set("passwords_needed", cr.PasswordsNeeded())
		if cr.Managed && cr.TypeKind == "vault" {
			cd.Set("vault_id", nullIfEmpty(cr.InputString("vault_id")))
		}
		credList = append(credList, cd)
	}
	if len(credList) > 0 {
		defaults.Set("credentials", credList)
	}
	if t.ExecutionEnvironmentID != nil {
		if e := c.EESummary(t.ExecutionEnvironmentID); e != nil {
			name, _ := e.Get("name")
			defaults.Set("execution_environment", NewOMap().Set("id", *t.ExecutionEnvironmentID).Set("name", name))
		} else {
			defaults.Set("execution_environment", NewOMap())
		}
	} else {
		defaults.Set("execution_environment", NewOMap())
	}
	defaults.Set("forks", t.Forks).Set("job_slice_count", t.JobSliceCount).Set("timeout", t.Timeout).Set("instance_groups", []any{})
	o.Set("defaults", defaults)
	WriteJSON(w, 200, o)
	return nil
}

func (s *Server) jobTemplateLaunch(w http.ResponseWriter, r *http.Request) error {
	if _, err := RequireWrite(r); err != nil {
		return err
	}
	t, c, err := s.loadTemplateForStart(r)
	if err != nil {
		return err
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	req, err := s.parseLaunchRequest(r, body)
	if err != nil {
		return err
	}
	creds, err := models.TemplateCredentials(r.Context(), s.Q(), []int64{t.ID})
	if err != nil {
		return err
	}
	tcreds := creds[t.ID]
	errs := newLaunchErrors()
	acc := s.acceptPrompts(r.Context(), t, req, tcreds, errs, false)
	launchCreds, passwords := s.validateLaunch(r, t, req, acc, tcreds, errs)
	if !errs.empty() {
		return errs.err()
	}
	if !s.launchConfigAllowed(c, t, acc) {
		return ErrForbidden
	}
	outcome, err := s.createJobFromTemplate(r.Context(), &c.User.ID, t, acc, launchCreds, passwords, "manual", nil, spawnPrevent{})
	if err != nil {
		return err
	}
	return s.writeLaunchResponse(w, r, c, outcome)
}

// writeLaunchResponse renders the 201 body of a launch: the job key, the
// ignored fields and the job itself.
func (s *Server) writeLaunchResponse(w http.ResponseWriter, r *http.Request, c *SerCtx, outcome *launchOutcome) error {
	data := NewOMap()
	var obj *OMap
	var location string
	if outcome.WorkflowJob != nil {
		data.Set("workflow_job", outcome.WorkflowJob.ID)
		data.Set("ignored_fields", outcome.Ignored)
		results, err := s.serializeWorkflowJobs(c, []*models.WorkflowJob{outcome.WorkflowJob}, true)
		if err != nil {
			return err
		}
		obj = results[0].(*OMap)
		location = URLFor("workflow_jobs", outcome.WorkflowJob.ID)
	} else {
		data.Set("job", outcome.Job.ID)
		data.Set("ignored_fields", outcome.Ignored)
		results, err := s.serializeJobs(c, []*models.Job{outcome.Job}, "full")
		if err != nil {
			return err
		}
		obj = results[0].(*OMap)
		location = URLFor("jobs", outcome.Job.ID)
	}
	for _, k := range obj.Keys() {
		v, _ := obj.Get(k)
		data.Set(k, v)
	}
	w.Header().Set("Location", location)
	WriteJSON(w, http.StatusCreated, data)
	return nil
}
