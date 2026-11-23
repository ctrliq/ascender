package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/auth"
	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/models"
)

// Workflow job relaunch (WorkflowJobRelaunch): a plain relaunch rebuilds
// the run from its template with the prompts it was launched with; a
// relaunch from failed nodes carries the nodes that succeeded forward so
// only the failed ones and what follows them run again.

func (s *Server) workflowJobRelaunchView(w http.ResponseWriter, r *http.Request) error {
	_, _, err := workflowJobObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	WriteJSON(w, 200, map[string]any{})
	return nil
}

func parseErr(msg any) error {
	return &APIError{Status: http.StatusBadRequest, Body: map[string]any{"detail": msg}}
}

// workflowJobCanRelaunch is WorkflowJobAccess.can_start.
func (s *Server) workflowJobCanRelaunch(ctx context.Context, c *SerCtx, wj *models.WorkflowJob) error {
	if c.User.IsSuperuser {
		return nil
	}
	var role *int64
	switch {
	case wj.WorkflowJobTemplateID != nil:
		t, err := models.GetWorkflowJobTemplate(ctx, s.Q(), *wj.WorkflowJobTemplateID)
		if err != nil {
			return ErrForbidden
		}
		role = t.ExecuteRoleID
	case wj.JobTemplateID != nil:
		t, err := models.GetJobTemplate(ctx, s.Q(), *wj.JobTemplateID)
		if err != nil {
			return ErrForbidden
		}
		role = t.ExecuteRoleID
	default:
		return ErrForbidden
	}
	lc, err := models.GetLaunchConfig(ctx, s.Q(), wj.ID)
	if err != nil {
		return err
	}
	if lc == nil {
		return Detail(http.StatusForbidden, "Workflow Job was launched with unknown prompts.")
	}
	if !c.HasRole(role) {
		return ErrForbidden
	}
	p := lc.Prompts()
	if (wj.CreatedByID == nil || *wj.CreatedByID != c.User.ID) && varsAreEncrypted(p.ExtraVars) {
		return Detail(http.StatusForbidden, "Job was launched with secret prompts provided by another user.")
	}
	// JobLaunchConfigAccess.can_add with the run's config: use of its
	// inventory, credentials and instance groups, sight of its EE and
	// labels.
	if !s.launchConfigAllowed(c, nil, &acceptedPrompts{JobPrompts: *p}) {
		return Detail(http.StatusForbidden, "Job was launched with prompts you lack access to.")
	}
	// has_unprompted: a prompt the template no longer asks for is not
	// relaunched. Variables a corrected run keeps count as accepted
	// while the template still allows overwriting them.
	switch {
	case wj.WorkflowJobTemplateID != nil:
		t, err := models.GetWorkflowJobTemplate(ctx, s.Q(), *wj.WorkflowJobTemplateID)
		if err != nil || wfjtHasUnprompted(t, p, t.AllowOverwriteFlowVarsOnRelaunch) {
			return Detail(http.StatusForbidden, "Job was launched with prompts no longer accepted.")
		}
	case wj.JobTemplateID != nil:
		t, err := models.GetJobTemplate(ctx, s.Q(), *wj.JobTemplateID)
		if err != nil || s.configHasPrompts(t, p, lc, true) {
			return Detail(http.StatusForbidden, "Job was launched with prompts no longer accepted.")
		}
	}
	return nil
}

// wfjtHasUnprompted is has_unprompted for a workflow job template: a
// prompt in the run's config the template does not ask for now.
func wfjtHasUnprompted(t *models.WorkflowJobTemplate, p *models.JobPrompts, ignoreVariables bool) bool {
	asks := map[string]bool{"inventory": t.AskInventoryOnLaunch, "limit": t.AskLimitOnLaunch, "scm_branch": t.AskSCMBranchOnLaunch,
		"labels": t.AskLabelsOnLaunch, "job_tags": t.AskTagsOnLaunch, "skip_tags": t.AskSkipTagsOnLaunch}
	if p.InventoryID != nil && !asks["inventory"] {
		return true
	}
	if len(p.Labels) > 0 && !asks["labels"] {
		return true
	}
	if len(p.Credentials) > 0 || len(p.InstanceGroups) > 0 || p.ExecutionEnvironment != nil {
		return true
	}
	for k := range p.CharPrompts() {
		if !asks[k] {
			return true
		}
	}
	if len(p.ExtraVars) > 0 && !ignoreVariables && !t.AskVariablesOnLaunch {
		survey := map[string]bool{}
		if t.SurveyEnabled {
			for _, e := range t.SurveyElements() {
				if v, ok := e["variable"].(string); ok {
					survey[v] = true
				}
			}
		}
		for k := range p.ExtraVars {
			if !survey[k] {
				return true
			}
		}
	}
	return false
}

func (s *Server) workflowJobRelaunch(w http.ResponseWriter, r *http.Request) error {
	u, wj, err := workflowJobObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	ctx := r.Context()
	c := s.NewSerCtx(r, true)
	if wj.IsSlicedJob && wj.JobTemplateID != nil {
		var prevent bool
		if err := s.Q().QueryRow(ctx, `SELECT prevent_relaunch FROM main_jobtemplate WHERE unifiedjobtemplate_ptr_id = $1`, *wj.JobTemplateID).Scan(&prevent); err != nil {
			return err
		}
		if prevent {
			return Detail(http.StatusForbidden, "Relaunch is disabled on the job template of this sliced job.")
		}
	}
	if err := s.workflowJobCanRelaunch(ctx, c, wj); err != nil {
		return err
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	nodesArg, _ := body.Get("nodes")
	fromFailed := nodesArg == "failed"
	extraVars, err := s.relaunchExtraVars(ctx, body, wj, fromFailed)
	if err != nil {
		return err
	}
	forced, reason, err := s.forcedSuccessNodes(ctx, body, wj, fromFailed)
	if err != nil {
		return err
	}
	if wj.IsSlicedJob {
		if fromFailed {
			return parseErr("Cannot relaunch a sliced workflow job from failed nodes.")
		}
		if wj.JobTemplateID == nil {
			return parseErr("Cannot relaunch slice workflow job orphaned from job template.")
		}
		jt, err := models.GetJobTemplate(ctx, s.Q(), *wj.JobTemplateID)
		if err != nil {
			return err
		}
		var kind string
		if wj.InventoryID != nil {
			if err := s.Q().QueryRow(ctx, `SELECT kind FROM main_inventory WHERE id = $1`, *wj.InventoryID).Scan(&kind); err != nil {
				return err
			}
		}
		var nodeCount int64
		if err := s.Q().QueryRow(ctx, `SELECT count(*) FROM main_workflowjobnode WHERE workflow_job_id = $1`, wj.ID).Scan(&nodeCount); err != nil {
			return err
		}
		if kind != "federated" && (wj.InventoryID == nil || s.effectiveSliceCount(ctx, jt, wj.InventoryID, jt.JobSliceCount) != nodeCount) {
			return parseErr("Cannot relaunch sliced workflow job after slice count has changed.")
		}
	}
	if fromFailed {
		var anyFailed bool
		if err := s.Q().QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM main_workflowjobnode n JOIN main_unifiedjob j ON j.id = n.job_id WHERE n.workflow_job_id = $1 AND j.status IN ('failed', 'error', 'canceled'))`, wj.ID).Scan(&anyFailed); err != nil {
			return err
		}
		if !anyFailed {
			var missing bool
			if err := s.Q().QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM main_workflowjobnode WHERE workflow_job_id = $1 AND do_not_run = false AND job_id IS NULL AND unified_job_template_id IS NULL)`, wj.ID).Scan(&missing); err != nil {
				return err
			}
			if missing {
				return parseErr("Cannot relaunch from failed nodes: this workflow failed because a node has no job template, which relaunching cannot recover.")
			}
			return parseErr("This workflow job has no failed nodes to relaunch from.")
		}
	}
	var newJob *models.WorkflowJob
	switch {
	case wj.IsSlicedJob && wj.JobTemplateID != nil:
		newJob, err = s.relaunchSlicedWorkflow(ctx, u.ID, wj)
	case wj.UnifiedJobTemplateID != nil && wj.WorkflowJobTemplateID != nil:
		newJob, err = s.relaunchFromTemplate(ctx, u.ID, wj)
	default:
		newJob, err = s.relaunchOrphanWorkflow(ctx, u.ID, wj, fromFailed)
	}
	if err != nil {
		return err
	}
	if fromFailed && wj.WorkflowJobTemplateID != nil && wj.UnifiedJobTemplateID != nil {
		if err := s.markPriorSucceeded(ctx, wj, newJob, forced, u.ID, reason); err != nil {
			return err
		}
	}
	if len(extraVars) > 0 {
		if err := s.applyRelaunchExtraVars(ctx, newJob, extraVars); err != nil {
			return err
		}
		if newJob, err = models.GetWorkflowJob(ctx, s.Q(), newJob.ID); err != nil {
			return err
		}
	}
	s.Notify(ctx, fmt.Sprintf(`{"type":"workflow_job","id":%d}`, newJob.ID))
	results, err := s.serializeWorkflowJobs(c, []*models.WorkflowJob{newJob}, true)
	if err != nil {
		return err
	}
	w.Header().Set("Location", URLFor("workflow_jobs", newJob.ID))
	WriteJSON(w, http.StatusCreated, results[0])
	return nil
}

// relaunchFromTemplate rebuilds the run from its template with the prompts
// it was launched with (copy_unified_job via create_unified_job).
func (s *Server) relaunchFromTemplate(ctx context.Context, userID int64, wj *models.WorkflowJob) (*models.WorkflowJob, error) {
	t, err := models.GetWorkflowJobTemplate(ctx, s.Q(), *wj.WorkflowJobTemplateID)
	if err != nil {
		return nil, err
	}
	lc, err := models.GetLaunchConfig(ctx, s.Q(), wj.ID)
	if err != nil {
		return nil, err
	}
	acc := &workflowAccepted{Ignored: NewOMap()}
	if lc != nil {
		p := lc.Prompts()
		acc.InventoryID, acc.Limit, acc.SCMBranch, acc.JobTags, acc.SkipTags = p.InventoryID, p.Limit, p.SCMBranch, p.JobTags, p.SkipTags
		if len(p.ExtraVars) > 0 {
			acc.ExtraVars, acc.HasExtraVars = p.ExtraVars, true
		}
		acc.Labels = p.Labels
	}
	return s.CreateWorkflowJobFromTemplate(ctx, &userID, t, acc, "relaunch", nil)
}

// relaunchSlicedWorkflow relaunches the job template of a sliced run.
func (s *Server) relaunchSlicedWorkflow(ctx context.Context, userID int64, wj *models.WorkflowJob) (*models.WorkflowJob, error) {
	t, err := models.GetJobTemplate(ctx, s.Q(), *wj.JobTemplateID)
	if err != nil {
		return nil, err
	}
	lc, err := models.GetLaunchConfig(ctx, s.Q(), wj.ID)
	if err != nil {
		return nil, err
	}
	prompts := &models.JobPrompts{}
	if lc != nil {
		prompts = lc.Prompts()
	}
	acc := &acceptedPrompts{JobPrompts: *prompts, HasExtraVars: len(prompts.ExtraVars) > 0, Ignored: NewOMap()}
	tcreds, err := models.TemplateCredentials(ctx, s.Q(), []int64{t.ID})
	if err != nil {
		return nil, err
	}
	launchCreds := tcreds[t.ID]
	if len(acc.Credentials) > 0 {
		prompted, err := models.LoadCredentialBriefs(ctx, s.Q(), acc.Credentials)
		if err != nil {
			return nil, err
		}
		launchCreds = mergeCredentials(launchCreds, prompted)
	}
	outcome, err := s.createJobFromTemplate(ctx, &userID, t, acc, launchCreds, map[string]string{}, "relaunch", nil, spawnPrevent{})
	if err != nil {
		return nil, err
	}
	if outcome.WorkflowJob == nil {
		return nil, parseErr("Cannot relaunch sliced workflow job after slice count has changed.")
	}
	return models.GetWorkflowJob(ctx, s.Q(), outcome.WorkflowJob.ID)
}

// relaunchOrphanWorkflow copies a run whose template is gone, nodes
// included (copy_model_by_class and copy_nodes_from_original).
func (s *Server) relaunchOrphanWorkflow(ctx context.Context, userID int64, wj *models.WorkflowJob, fromFailed bool) (*models.WorkflowJob, error) {
	n := *wj
	n.ID = 0
	n.LaunchType = "relaunch"
	n.Status = "pending"
	n.CreatedByID, n.ModifiedByID = &userID, &userID
	n.Started, n.Finished, n.CanceledOn = nil, nil, nil
	n.StartArgs = ""
	labels, err := models.ScanIDs(ctx, s.Q(), `SELECT label_id FROM main_unifiedjob_labels WHERE unifiedjob_id = $1 ORDER BY id`, wj.ID)
	if err != nil {
		return nil, err
	}
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if err := models.InsertWorkflowJob(ctx, tx, &n, s.CT, nil, nil, labels, nil, nil, nil); err != nil {
			return err
		}
		idMap, err := copyJobNodes(ctx, tx, wj.ID, n.ID)
		if err != nil {
			return err
		}
		if fromFailed {
			return carryForwardByID(ctx, tx, idMap, nil, userID, "")
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return models.GetWorkflowJob(ctx, s.Q(), n.ID)
}

// copyJobNodes copies a workflow job's nodes and edges to another workflow job.
func copyJobNodes(ctx context.Context, tx pgx.Tx, from, to int64) (map[int64]int64, error) {
	ids, err := models.ScanIDs(ctx, tx, `SELECT id FROM main_workflowjobnode WHERE workflow_job_id = $1 ORDER BY id`, from)
	if err != nil {
		return nil, err
	}
	idMap := map[int64]int64{}
	for _, old := range ids {
		var id int64
		if err := tx.QueryRow(ctx, `INSERT INTO main_workflowjobnode (created, modified, job_id, unified_job_template_id, workflow_job_id, inventory_id, ancestor_artifacts, extra_data, do_not_run,
			all_parents_must_converge, identifier, execution_environment_id, char_prompts, survey_passwords, prior_run_elapsed, prior_run_succeeded, max_retries, retry_attempts, forced_success,
			forced_success_by_id, forced_success_job_id, forced_success_reason)
			SELECT now(), now(), NULL, unified_job_template_id, $2, inventory_id, '{}', extra_data, false, all_parents_must_converge, identifier, execution_environment_id, char_prompts,
			survey_passwords, NULL, false, max_retries, 0, false, NULL, NULL, '' FROM main_workflowjobnode WHERE id = $1 RETURNING id`, old, to).Scan(&id); err != nil {
			return nil, err
		}
		idMap[old] = id
		for _, sql := range []string{
			`INSERT INTO main_workflowjobnode_credentials (workflowjobnode_id, credential_id) SELECT $2, credential_id FROM main_workflowjobnode_credentials WHERE workflowjobnode_id = $1 ORDER BY id`,
			`INSERT INTO main_workflowjobnode_labels (workflowjobnode_id, label_id) SELECT $2, label_id FROM main_workflowjobnode_labels WHERE workflowjobnode_id = $1 ORDER BY id`,
			`INSERT INTO main_workflowjobnodebaseinstancegroupmembership (position, instancegroup_id, workflowjobnode_id) SELECT position, instancegroup_id, $2 FROM main_workflowjobnodebaseinstancegroupmembership WHERE workflowjobnode_id = $1 ORDER BY position`,
		} {
			if _, err := tx.Exec(ctx, sql, old, id); err != nil {
				return nil, err
			}
		}
	}
	return idMap, copyNodeEdges(ctx, tx, models.JobNodeTables, models.JobNodeTables, idMap)
}

// carriedState is what a relaunch carries forward for one original node
// (_carried_forward_node_state).
type carriedState struct {
	Elapsed          *float64
	Artifacts        map[string]any
	Forced           bool
	ForcedReason     string
	ForcedBy, ForJob *int64
}

func nodeCarriedState(ctx context.Context, q pgx.Tx, oldID int64, forced map[int64]bool, userID int64, reason string) (*carriedState, error) {
	var prior, forcedSuccess bool
	var priorElapsed *float64
	var artifacts, forcedReason string
	var forcedBy, forcedJob, jobID *int64
	var jobStatus *string
	var jobElapsed *float64
	var workflowJobID *int64
	if err := q.QueryRow(ctx, `SELECT n.prior_run_succeeded, n.prior_run_elapsed, COALESCE(n.ancestor_artifacts, '{}'), n.forced_success, COALESCE(n.forced_success_reason, ''), n.forced_success_by_id,
		n.forced_success_job_id, n.job_id, j.status, j.elapsed, n.workflow_job_id
		FROM main_workflowjobnode n LEFT JOIN main_unifiedjob j ON j.id = n.job_id WHERE n.id = $1`, oldID).Scan(&prior, &priorElapsed, &artifacts, &forcedSuccess, &forcedReason,
		&forcedBy, &forcedJob, &jobID, &jobStatus, &jobElapsed, &workflowJobID); err != nil {
		return nil, err
	}
	aa := map[string]any{}
	_ = json.Unmarshal([]byte(artifacts), &aa)
	if prior {
		st := &carriedState{Elapsed: priorElapsed, Artifacts: aa}
		if forcedSuccess {
			st.Forced, st.ForcedReason, st.ForcedBy, st.ForJob = true, forcedReason, forcedBy, forcedJob
		}
		return st, nil
	}
	if jobID != nil && jobStatus != nil && (*jobStatus == "successful" || forced[oldID]) {
		// get_effective_artifacts(parents_set={workflow job}): a nested or
		// sliced workflow carries the merged artifacts of its inner jobs.
		parents := map[int64]bool{}
		if workflowJobID != nil {
			parents[*workflowJobID] = true
		}
		ja, err := models.EffectiveArtifacts(ctx, q, *jobID, parents)
		if err != nil {
			return nil, err
		}
		for k, v := range ja {
			aa[k] = v
		}
		st := &carriedState{Elapsed: jobElapsed, Artifacts: aa}
		if *jobStatus != "successful" {
			st.Forced, st.ForcedReason, st.ForcedBy, st.ForJob = true, reason, &userID, jobID
		}
		return st, nil
	}
	return nil, nil
}

func applyCarriedState(ctx context.Context, tx pgx.Tx, newID int64, st *carriedState) error {
	b, _ := json.Marshal(st.Artifacts)
	_, err := tx.Exec(ctx, `UPDATE main_workflowjobnode SET prior_run_succeeded = true, prior_run_elapsed = $2, ancestor_artifacts = $3, forced_success = $4, forced_success_reason = $5,
		forced_success_by_id = $6, forced_success_job_id = $7, modified = now() WHERE id = $1`, newID, st.Elapsed, string(b), st.Forced, st.ForcedReason, st.ForcedBy, st.ForJob)
	return err
}

// carryForwardByID marks copied nodes whose original succeeded.
func carryForwardByID(ctx context.Context, tx pgx.Tx, idMap map[int64]int64, forced map[int64]bool, userID int64, reason string) error {
	for old, nu := range idMap {
		st, err := nodeCarriedState(ctx, tx, old, forced, userID, reason)
		if err != nil {
			return err
		}
		if st != nil {
			if err := applyCarriedState(ctx, tx, nu, st); err != nil {
				return err
			}
		}
	}
	return nil
}

// markPriorSucceeded maps the new run's nodes (rebuilt from the template)
// to the original run's by identifier and carries the succeeded ones forward.
func (s *Server) markPriorSucceeded(ctx context.Context, orig, nu *models.WorkflowJob, forced map[int64]bool, userID int64, reason string) error {
	return s.DB.Tx(ctx, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `SELECT o.id, n.id FROM main_workflowjobnode o JOIN main_workflowjobnode n ON n.identifier = o.identifier AND n.workflow_job_id = $2 WHERE o.workflow_job_id = $1 AND o.identifier <> ''`, orig.ID, nu.ID)
		if err != nil {
			return err
		}
		idMap := map[int64]int64{}
		for rows.Next() {
			var a, b int64
			if err := rows.Scan(&a, &b); err != nil {
				rows.Close()
				return err
			}
			idMap[a] = b
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return err
		}
		return carryForwardByID(ctx, tx, idMap, forced, userID, reason)
	})
}

// relaunchExtraVars reads the variables a relaunch from failed nodes may
// overwrite (_relaunch_extra_vars).
func (s *Server) relaunchExtraVars(ctx context.Context, body *OMap, wj *models.WorkflowJob, fromFailed bool) (map[string]any, error) {
	raw, ok := body.Get("extra_vars")
	if !ok {
		return nil, nil
	}
	var vars map[string]any
	switch v := raw.(type) {
	case *OMap:
		vars = plainValue(v).(map[string]any)
	case string:
		m, err := ParseVars(v)
		if err != nil {
			return nil, parseErr(err.Error())
		}
		if refusesCiphertext(auth.UserFrom(ctx), m) {
			return nil, parseErr(encryptedValueMsg)
		}
		vars = m
	default:
		// parse_yaml_or_json(silent_failure=False) on a value that is not
		// a string: json.loads and yaml.safe_load both refuse it.
		tn := pyTypeName(v)
		return nil, parseErr(fmt.Sprintf("Cannot parse as JSON (error: the JSON object must be str, bytes or bytearray, not %s) or YAML (error: '%s' object has no attribute 'read').", tn, tn))
	}
	if len(vars) == 0 {
		return nil, nil
	}
	if !fromFailed {
		return nil, parseErr("Variables can only be overwritten when relaunching from failed nodes.")
	}
	if !wj.AllowOverwriteFlowVarsOnRelaunch {
		return nil, parseErr("This workflow job does not allow overwriting variables on relaunch. Enable allow_overwrite_flow_vars_on_relaunch on its workflow job template; runs started after that carry the setting.")
	}
	passwordKeys := s.relaunchPasswordVariables(ctx, wj)
	var errs []string
	reserved := map[string]bool{}
	for k, v := range vars {
		if v == "$encrypted$" && !passwordKeys[k] {
			reserved[k] = true
			errs = append(errs, fmt.Sprintf(`"$encrypted$" is a reserved keyword, may not be used for %s.`, k))
		}
	}
	if wj.WorkflowJobTemplateID != nil {
		if t, err := models.GetWorkflowJobTemplate(ctx, s.Q(), *wj.WorkflowJobTemplateID); err == nil && t.SurveyEnabled {
			for _, e := range t.SurveyElements() {
				key, _ := e["variable"].(string)
				v, present := vars[key]
				if !present || reserved[key] {
					continue
				}
				if typ, _ := e["type"].(string); typ == "password" && v == "$encrypted$" {
					continue
				}
				errs = append(errs, surveyElementValidation(e, vars, true)...)
			}
		}
	}
	if len(errs) > 0 {
		// ParseError with a dict detail: the dict is the body.
		return nil, &APIError{Status: http.StatusBadRequest, Body: map[string]any{"variables_needed_to_start": errs}}
	}
	return vars, nil
}

func (s *Server) relaunchPasswordVariables(ctx context.Context, wj *models.WorkflowJob) map[string]bool {
	keys := map[string]bool{}
	sp := map[string]any{}
	_ = json.Unmarshal(wj.SurveyPasswords, &sp)
	for k := range sp {
		keys[k] = true
	}
	if wj.WorkflowJobTemplateID != nil {
		if t, err := models.GetWorkflowJobTemplate(ctx, s.Q(), *wj.WorkflowJobTemplateID); err == nil {
			for _, k := range surveyPasswordVariables(asSurveyTemplate(t)) {
				keys[k] = true
			}
		}
	}
	return keys
}

// applyRelaunchExtraVars overwrites the new run's variables and launch
// config with the relaunch variables, encrypting password answers.
func (s *Server) applyRelaunchExtraVars(ctx context.Context, wj *models.WorkflowJob, vars map[string]any) error {
	passwordKeys := s.relaunchPasswordVariables(ctx, wj)
	overrides := map[string]any{}
	masked := map[string]any{}
	for k, v := range vars {
		if v == "$encrypted$" && passwordKeys[k] {
			continue
		}
		if passwordKeys[k] {
			if sv, ok := v.(string); ok && sv != "" && !strings.HasPrefix(sv, "$encrypted$") {
				enc, err := s.encryptSurveyDefault(sv)
				if err != nil {
					return err
				}
				v = enc
			}
			masked[k] = "$encrypted$"
		}
		overrides[k] = v
	}
	if len(overrides) == 0 {
		return nil
	}
	merged, _ := ParseVars(wj.ExtraVars)
	if merged == nil {
		merged = map[string]any{}
	}
	for k, v := range overrides {
		merged[k] = v
	}
	sp := map[string]any{}
	_ = json.Unmarshal(wj.SurveyPasswords, &sp)
	for k, v := range masked {
		sp[k] = v
	}
	mb, _ := json.Marshal(merged)
	sb, _ := json.Marshal(sp)
	return s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `UPDATE main_workflowjob SET extra_vars = $2, survey_passwords = $3::jsonb WHERE unifiedjob_ptr_id = $1`, wj.ID, string(mb), string(sb)); err != nil {
			return err
		}
		var extra, pw string
		if err := tx.QueryRow(ctx, `SELECT COALESCE(extra_data, '{}'), COALESCE(survey_passwords::text, '{}') FROM main_joblaunchconfig WHERE job_id = $1`, wj.ID).Scan(&extra, &pw); err != nil {
			if db.IsNoRows(err) {
				return nil
			}
			return err
		}
		cfgExtra, _ := ParseVars(extra)
		if cfgExtra == nil {
			cfgExtra = map[string]any{}
		}
		for k, v := range overrides {
			cfgExtra[k] = v
		}
		cfgPW := map[string]any{}
		_ = json.Unmarshal([]byte(pw), &cfgPW)
		for k, v := range masked {
			cfgPW[k] = v
		}
		eb, _ := json.Marshal(cfgExtra)
		pb, _ := json.Marshal(cfgPW)
		_, err := tx.Exec(ctx, `UPDATE main_joblaunchconfig SET extra_data = $2, survey_passwords = $3::jsonb WHERE job_id = $1`, wj.ID, string(eb), string(pb))
		return err
	})
}

// forcedSuccessNodes reads which failed nodes the relaunch forces as
// successful, and why (_forced_success_nodes and forceable_failed_nodes).
func (s *Server) forcedSuccessNodes(ctx context.Context, body *OMap, wj *models.WorkflowJob, fromFailed bool) (map[int64]bool, string, error) {
	raw, _ := body.Get("force_success_nodes")
	list, isList := raw.([]any)
	if raw == nil || (isList && len(list) == 0) {
		if r, _ := body.Get("force_success_reason"); r != nil && r != "" {
			return nil, "", parseErr("force_success_reason was given without any force_success_nodes.")
		}
		return nil, "", nil
	}
	if !fromFailed {
		return nil, "", parseErr("Nodes can only be forced as successful when relaunching from failed nodes.")
	}
	allow := wj.AllowForceNodeSuccessOnRelaunch
	if wj.WorkflowJobTemplateID != nil {
		if t, err := models.GetWorkflowJobTemplate(ctx, s.Q(), *wj.WorkflowJobTemplateID); err == nil {
			allow = t.AllowForceNodeSuccessOnRelaunch
		}
	}
	if !allow {
		return nil, "", parseErr("This workflow job does not allow forcing nodes as successful. Enable allow_force_node_success_on_relaunch on its workflow job template.")
	}
	var ids []int64
	if !isList {
		return nil, "", parseErr("force_success_nodes must be a list of workflow job node ids.")
	}
	seen := map[int64]bool{}
	for _, v := range list {
		n, ok := v.(json.Number)
		if !ok {
			return nil, "", parseErr("force_success_nodes must be a list of workflow job node ids.")
		}
		id, err := n.Int64()
		if err != nil {
			return nil, "", parseErr("force_success_nodes must be a list of workflow job node ids.")
		}
		if !seen[id] {
			seen[id] = true
			ids = append(ids, id)
		}
	}
	rv, _ := body.Get("force_success_reason")
	reason, _ := rv.(string)
	if strings.TrimSpace(reason) == "" {
		return nil, "", parseErr("A force_success_reason is required to force nodes as successful.")
	}
	var templateIDs map[string]bool
	if wj.WorkflowJobTemplateID != nil && wj.UnifiedJobTemplateID != nil {
		templateIDs = map[string]bool{}
		rows, err := s.Q().Query(ctx, `SELECT identifier FROM main_workflowjobtemplatenode WHERE workflow_job_template_id = $1`, *wj.WorkflowJobTemplateID)
		if err != nil {
			return nil, "", err
		}
		for rows.Next() {
			var ident string
			if err := rows.Scan(&ident); err != nil {
				rows.Close()
				return nil, "", err
			}
			templateIDs[ident] = true
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return nil, "", err
		}
	}
	for _, id := range ids {
		var ident string
		var jobStatus, jobModel *string
		var retries, maxRetries int64
		var ujt *int64
		err := s.Q().QueryRow(ctx, `SELECT n.identifier, j.status, (SELECT ct.model FROM django_content_type ct WHERE ct.id = j.polymorphic_ctype_id), n.retry_attempts, n.max_retries, n.unified_job_template_id
			FROM main_workflowjobnode n LEFT JOIN main_unifiedjob j ON j.id = n.job_id WHERE n.id = $1 AND n.workflow_job_id = $2`, id, wj.ID).Scan(&ident, &jobStatus, &jobModel, &retries, &maxRetries, &ujt)
		if err != nil {
			return nil, "", parseErr(fmt.Sprintf("Node %d is not part of this workflow job.", id))
		}
		failed := jobStatus != nil && (*jobStatus == "failed" || *jobStatus == "error" || *jobStatus == "canceled")
		retryPending := jobStatus != nil && (*jobStatus == "failed" || *jobStatus == "error") && ujt != nil && retries < maxRetries && (jobModel == nil || *jobModel != "workflowapproval")
		if !failed || retryPending {
			return nil, "", parseErr(fmt.Sprintf("Node %d did not fail in this workflow job, so there is nothing to force.", id))
		}
		if jobModel != nil && *jobModel == "workflowapproval" {
			return nil, "", parseErr(fmt.Sprintf("Node %d is an approval, and approvals cannot be forced as successful.", id))
		}
		if templateIDs != nil && (ident == "" || !templateIDs[ident]) {
			return nil, "", parseErr(fmt.Sprintf("Node %d is no longer in the workflow job template, or its identifier changed since this run, so the relaunch cannot carry it forward.", id))
		}
	}
	out := map[int64]bool{}
	for _, id := range ids {
		out[id] = true
	}
	return out, strings.TrimSpace(reason), nil
}
