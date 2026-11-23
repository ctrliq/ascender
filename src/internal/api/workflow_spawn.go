package api

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/ctrliq/ascender/internal/crypto"
	"github.com/ctrliq/ascender/internal/models"
)

// WorkflowNodeSpec is what the task runner knows about a workflow job node
// when it spawns the node's job.
type WorkflowNodeSpec struct {
	ID                     int64
	InventoryID            *int64
	ExecutionEnvironmentID *int64
	ExtraData              map[string]any
	CharPrompts            map[string]any
	SurveyPasswords        map[string]any
	Credentials            []int64
	Labels                 []int64
	InstanceGroups         []int64
	// AncestorArtifacts are the merged artifacts of the node's parents,
	// already saved on the node.
	AncestorArtifacts map[string]any
	IsRoot            bool
	// NodeCount is the number of nodes in the workflow (the slice count of
	// a sliced run).
	NodeCount int64
}

// SpawnResult identifies the unified job a node spawned.
type SpawnResult struct {
	ID   int64
	Type string // job or workflow_job
	// Failed: the job could not start and was failed on the spot.
	Failed bool
}

// SpawnWorkflowNodeJob creates the job a workflow node runs from a job
// template, combining the node's prompts with the workflow job's the way
// WorkflowJobNode.get_job_kwargs did, then creating the job with the
// template's launch rules (create_unified_job).
func (s *Server) SpawnWorkflowNodeJob(ctx context.Context, wj *models.WorkflowJob, t *models.JobTemplate, node *WorkflowNodeSpec) (*SpawnResult, error) {
	nodeP := &models.JobPrompts{InventoryID: node.InventoryID, ExecutionEnvironment: node.ExecutionEnvironmentID, Credentials: node.Credentials, Labels: node.Labels, InstanceGroups: node.InstanceGroups}
	applyCharPrompts(nodeP, node.CharPrompts)
	if len(node.ExtraData) > 0 {
		nodeP.ExtraVars = node.ExtraData
	}
	if len(node.SurveyPasswords) > 0 {
		nodeP.SurveyPasswords = node.SurveyPasswords
	}
	wjP, err := s.workflowJobPrompts(ctx, wj)
	if err != nil {
		return nil, err
	}
	// The workflow's extra vars and survey passwords bypass the template's
	// prompting rules for job template nodes (a historical special case).
	wjSpecialVars := wjP.ExtraVars
	wjSpecialPasswords := wjP.SurveyPasswords
	wjP.ExtraVars, wjP.SurveyPasswords = nil, nil
	// Credentials combine by unique hash, the workflow's winning.
	if len(wjP.Credentials) > 0 && len(nodeP.Credentials) > 0 {
		nodeBriefs, err := models.LoadCredentialBriefs(ctx, s.Q(), nodeP.Credentials)
		if err != nil {
			return nil, err
		}
		wjBriefs, err := models.LoadCredentialBriefs(ctx, s.Q(), wjP.Credentials)
		if err != nil {
			return nil, err
		}
		wjP.Credentials = credentialIDs(mergeCredentials(nodeBriefs, wjBriefs))
	}
	merged := overlayPrompts(nodeP, wjP)
	req := launchRequestFromPrompts(merged)
	tcredsMap, err := models.TemplateCredentials(ctx, s.Q(), []int64{t.ID})
	if err != nil {
		return nil, err
	}
	tcreds := tcredsMap[t.ID]
	errs := newLaunchErrors()
	acc := s.acceptPrompts(ctx, t, req, tcreds, errs, false)
	if errs.m.Len() > 0 {
		b, _ := json.Marshal(errs.m)
		s.Log.InfoContext(ctx, "workflow node prompts not fully accepted", "template", t.ID, "node", node.ID, "errors", string(b))
	}
	// Ancestor artifacts always feed the job's variables; the workflow's
	// own variables come last.
	extra := map[string]any{}
	for k, v := range acc.ExtraVars {
		extra[k] = v
	}
	for k, v := range node.AncestorArtifacts {
		if k != "_ansible_no_log" {
			extra[k] = v
		}
	}
	for k, v := range wjSpecialVars {
		extra[k] = v
	}
	if len(extra) > 0 {
		acc.ExtraVars = extra
		acc.HasExtraVars = true
	}
	passwordDict := map[string]any{}
	for k, v := range merged.SurveyPasswords {
		passwordDict[k] = v
	}
	if _, noLog := node.AncestorArtifacts["_ansible_no_log"]; noLog {
		for k := range node.AncestorArtifacts {
			if k != "_ansible_no_log" {
				passwordDict[k] = "$encrypted$"
			}
		}
	}
	for k, v := range wjSpecialPasswords {
		passwordDict[k] = v
	}
	launchCreds := tcreds
	if len(acc.Credentials) > 0 {
		prompted, err := models.LoadCredentialBriefs(ctx, s.Q(), acc.Credentials)
		if err != nil {
			return nil, err
		}
		launchCreds = mergeCredentials(tcreds, prompted)
	}
	_, isSlice := node.AncestorArtifacts["job_slice"]
	isSlice = isSlice && node.IsRoot
	sourceInventory, isFederated := node.AncestorArtifacts["source_inventory_id"]
	isFederated = isFederated && node.IsRoot
	eager := func(jb *models.Job) {
		if isSlice {
			jb.AllowSimultaneous = true
			jb.JobSliceNumber = int64(toFloat(node.AncestorArtifacts["job_slice"]))
			jb.JobSliceCount = node.NodeCount
		}
		if isFederated {
			// Each node of a federated run targets one source inventory,
			// set on the job as an eager field (get_job_kwargs): the
			// launch itself still sees the federated inventory, which has
			// no hosts of its own, so the job is not sliced again; with
			// _prevent_federation it is not federated again either.
			inv := int64(toFloat(sourceInventory))
			jb.InventoryID = &inv
			jb.AllowSimultaneous = true
		}
		if len(passwordDict) > 0 {
			cur := map[string]any{}
			if len(jb.SurveyPasswords) > 0 {
				_ = json.Unmarshal(jb.SurveyPasswords, &cur)
			}
			for k, v := range passwordDict {
				cur[k] = v
			}
			b, _ := json.Marshal(cur)
			jb.SurveyPasswords = b
		}
	}
	passwords := s.workflowStartPasswords(wj)
	outcome, err := s.createJobFromTemplate(ctx, wj.CreatedByID, t, acc, launchCreds, passwords, "workflow", eager, spawnPrevent{slicing: isSlice, federation: isFederated})
	if err != nil {
		return nil, err
	}
	if outcome.WorkflowJob != nil {
		return &SpawnResult{ID: outcome.WorkflowJob.ID, Type: "workflow_job"}, nil
	}
	return &SpawnResult{ID: outcome.Job.ID, Type: "job", Failed: outcome.CannotStart != ""}, nil
}

// SpawnWorkflowNodeSystemJob creates the system job of a node that runs a
// system job template. The template asks for nothing, so neither the
// node's prompts nor the workflow's reach it: get_job_kwargs gave it only
// the eager fields (launched by the workflow, created by its creator).
func (s *Server) SpawnWorkflowNodeSystemJob(ctx context.Context, wj *models.WorkflowJob, templateID int64) (int64, error) {
	t, err := s.loadSystemJobTemplate(ctx, templateID)
	if err != nil {
		return 0, err
	}
	return s.CreateSystemJob(ctx, t, wj.CreatedByID, "workflow", nil, nil)
}

// workflowJobPrompts is WorkflowJob.prompts_dict: a sliced run keeps its
// launch prompts in the launch config, a workflow template run on the job.
func (s *Server) workflowJobPrompts(ctx context.Context, wj *models.WorkflowJob) (*models.JobPrompts, error) {
	if wj.JobTemplateID != nil {
		lc, err := models.GetLaunchConfig(ctx, s.Q(), wj.ID)
		if err != nil {
			return nil, err
		}
		if lc == nil {
			return &models.JobPrompts{}, nil
		}
		return lc.Prompts(), nil
	}
	p := &models.JobPrompts{InventoryID: wj.InventoryID}
	applyCharPrompts(p, wj.CharPromptsMap())
	if vars, err := ParseVars(wj.ExtraVars); err == nil && len(vars) > 0 {
		p.ExtraVars = vars
	}
	var sp map[string]any
	if len(wj.SurveyPasswords) > 0 && json.Unmarshal(wj.SurveyPasswords, &sp) == nil && len(sp) > 0 {
		p.SurveyPasswords = sp
	}
	var err error
	if p.Credentials, err = models.ScanIDs(ctx, s.Q(), `SELECT credential_id FROM main_unifiedjob_credentials WHERE unifiedjob_id = $1 ORDER BY id`, wj.ID); err != nil {
		return nil, err
	}
	// Workflow labels and job labels are treated separately: they do not
	// propagate from the workflow job to the jobs in it (prompts_dict pops
	// them; a sliced job's launch config above keeps its labels).
	return p, nil
}

// workflowStartPasswords are the credential passwords given when the
// workflow was launched, passed on to the jobs it spawns.
func (s *Server) workflowStartPasswords(wj *models.WorkflowJob) map[string]string {
	out := map[string]string{}
	if wj.StartArgs == "" {
		return out
	}
	pk := wj.ID
	dec, err := crypto.DecryptField(s.Cfg.SecretKey, "start_args", &pk, wj.StartArgs)
	if err != nil {
		return out
	}
	var m map[string]any
	if json.Unmarshal([]byte(dec), &m) == nil {
		for k, v := range m {
			if sv, ok := v.(string); ok {
				out[k] = sv
			}
		}
	}
	return out
}

// applyCharPrompts reads the scalar prompts of a char_prompts object.
func applyCharPrompts(p *models.JobPrompts, cp map[string]any) {
	str := func(k string) *string {
		if v, ok := cp[k]; ok && v != nil {
			s := fmt.Sprint(v)
			return &s
		}
		return nil
	}
	num := func(k string) *int64 {
		if v, ok := cp[k]; ok && v != nil {
			n := int64(toFloat(v))
			return &n
		}
		return nil
	}
	if v := str("limit"); v != nil {
		p.Limit = v
	}
	if v := str("scm_branch"); v != nil {
		p.SCMBranch = v
	}
	if v := str("job_tags"); v != nil {
		p.JobTags = v
	}
	if v := str("skip_tags"); v != nil {
		p.SkipTags = v
	}
	if v := str("job_type"); v != nil {
		p.JobType = v
	}
	if v := num("verbosity"); v != nil {
		p.Verbosity = v
	}
	if v := num("forks"); v != nil {
		p.Forks = v
	}
	if v := num("job_slice_count"); v != nil {
		p.JobSliceCount = v
	}
	if v := num("timeout"); v != nil {
		p.Timeout = v
	}
	if v, ok := cp["diff_mode"]; ok && v != nil {
		b, _ := v.(bool)
		p.DiffMode = &b
	}
}

func toFloat(v any) float64 {
	switch t := v.(type) {
	case float64:
		return t
	case int64:
		return float64(t)
	case int:
		return float64(t)
	case json.Number:
		f, _ := t.Float64()
		return f
	}
	return 0
}

// overlayPrompts applies the prompts of over on top of base, field by
// field (dict.update on prompts_dict).
func overlayPrompts(base, over *models.JobPrompts) *models.JobPrompts {
	out := *base
	if over.InventoryID != nil {
		out.InventoryID = over.InventoryID
	}
	if over.SCMBranch != nil {
		out.SCMBranch = over.SCMBranch
	}
	if over.Limit != nil {
		out.Limit = over.Limit
	}
	if over.JobTags != nil {
		out.JobTags = over.JobTags
	}
	if over.SkipTags != nil {
		out.SkipTags = over.SkipTags
	}
	if over.JobType != nil {
		out.JobType = over.JobType
	}
	if over.Verbosity != nil {
		out.Verbosity = over.Verbosity
	}
	if over.DiffMode != nil {
		out.DiffMode = over.DiffMode
	}
	if over.Forks != nil {
		out.Forks = over.Forks
	}
	if over.JobSliceCount != nil {
		out.JobSliceCount = over.JobSliceCount
	}
	if over.Timeout != nil {
		out.Timeout = over.Timeout
	}
	if over.ExecutionEnvironment != nil {
		out.ExecutionEnvironment = over.ExecutionEnvironment
	}
	if len(over.Credentials) > 0 {
		out.Credentials = over.Credentials
	}
	if len(over.Labels) > 0 {
		out.Labels = over.Labels
	}
	if len(over.InstanceGroups) > 0 {
		out.InstanceGroups = over.InstanceGroups
	}
	if len(over.ExtraVars) > 0 {
		out.ExtraVars = over.ExtraVars
	}
	if len(over.SurveyPasswords) > 0 {
		out.SurveyPasswords = over.SurveyPasswords
	}
	return &out
}

// launchRequestFromPrompts turns prompts into the request the launch
// acceptance works on.
func launchRequestFromPrompts(p *models.JobPrompts) *launchRequest {
	req := &launchRequest{Inventory: p.InventoryID, SCMBranch: p.SCMBranch, Limit: p.Limit, JobTags: p.JobTags, SkipTags: p.SkipTags, JobType: p.JobType,
		Verbosity: p.Verbosity, DiffMode: p.DiffMode, Forks: p.Forks, JobSliceCount: p.JobSliceCount, Timeout: p.Timeout, ExecutionEnv: p.ExecutionEnvironment}
	if len(p.Credentials) > 0 {
		req.Credentials, req.HasCredentials = p.Credentials, true
	}
	if len(p.Labels) > 0 {
		req.Labels, req.HasLabels = p.Labels, true
	}
	if len(p.InstanceGroups) > 0 {
		req.InstanceGroups, req.HasInstanceGroups = p.InstanceGroups, true
	}
	if len(p.ExtraVars) > 0 {
		req.ExtraVars, req.HasExtraVars = p.ExtraVars, true
	}
	return req
}

// SpawnWorkflowNodeWorkflow creates the workflow job a node runs from a
// workflow job template (a workflow inside a workflow). The node's prompts
// and the parent run's combine as get_job_kwargs did: the variables merge
// and then pass the template's prompting rules, and ancestor artifacts are
// added afterwards.
func (s *Server) SpawnWorkflowNodeWorkflow(ctx context.Context, wj *models.WorkflowJob, t *models.WorkflowJobTemplate, node *WorkflowNodeSpec) (*models.WorkflowJob, error) {
	nodeP := &models.JobPrompts{InventoryID: node.InventoryID}
	applyCharPrompts(nodeP, node.CharPrompts)
	if len(node.ExtraData) > 0 {
		nodeP.ExtraVars = node.ExtraData
	}
	wjP, err := s.workflowJobPrompts(ctx, wj)
	if err != nil {
		return nil, err
	}
	vars := map[string]any{}
	for k, v := range nodeP.ExtraVars {
		vars[k] = v
	}
	for k, v := range wjP.ExtraVars {
		vars[k] = v
	}
	merged := overlayPrompts(nodeP, wjP)
	merged.ExtraVars = vars
	req := launchRequestFromPrompts(merged)
	errs := newLaunchErrors()
	acc := s.acceptWorkflowLaunchPrompts(ctx, t, req, errs, false)
	if errs.m.Len() > 0 {
		b, _ := json.Marshal(errs.m)
		s.Log.InfoContext(ctx, "workflow node prompts not fully accepted", "template", t.ID, "node", node.ID, "errors", string(b))
	}
	extra := map[string]any{}
	for k, v := range acc.ExtraVars {
		extra[k] = v
	}
	for k, v := range node.AncestorArtifacts {
		if k != "_ansible_no_log" {
			extra[k] = v
		}
	}
	if len(extra) > 0 {
		acc.ExtraVars, acc.HasExtraVars = extra, true
	}
	return s.CreateWorkflowJobFromTemplate(ctx, wj.CreatedByID, t, acc, "workflow", nil)
}

// WorkflowAncestorTemplates lists the workflow job templates above a
// workflow job, nearest first (WorkflowJob.get_ancestor_workflows).
func (s *Server) WorkflowAncestorTemplates(ctx context.Context, wjID int64) ([]int64, []string, error) {
	var ids []int64
	var names []string
	seen := map[int64]bool{wjID: true}
	cur := wjID
	for {
		var tmpl *int64
		var name string
		if err := s.Q().QueryRow(ctx, `SELECT w.workflow_job_template_id, COALESCE(u.name, '') FROM main_workflowjob w LEFT JOIN main_unifiedjobtemplate u ON u.id = w.workflow_job_template_id WHERE w.unifiedjob_ptr_id = $1`, cur).Scan(&tmpl, &name); err != nil {
			return ids, names, nil
		}
		if tmpl == nil {
			return ids, names, nil
		}
		ids = append(ids, *tmpl)
		names = append(names, fmt.Sprintf("%s-%d", name, *tmpl))
		var parent int64
		if err := s.Q().QueryRow(ctx, `SELECT workflow_job_id FROM main_workflowjobnode WHERE job_id = $1 AND workflow_job_id IS NOT NULL`, cur).Scan(&parent); err != nil {
			return ids, names, nil
		}
		if seen[parent] {
			s.Log.ErrorContext(ctx, "Cycles detected in the workflow jobs graph, this is not normal and suggests task manager degeneracy.")
			return ids, names, nil
		}
		seen[parent] = true
		cur = parent
	}
}
