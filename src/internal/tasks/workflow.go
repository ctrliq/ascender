package tasks

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/ctrliq/ascender/internal/api"
	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/models"
	"github.com/jackc/pgx/v5"
)

// The workflow manager: a port of scheduler/dag_workflow.py and the
// WorkflowManager of scheduler/task_manager.py. For every running
// workflow job it marks the nodes that will never run, spawns the jobs of
// the nodes whose parents finished, and finishes the workflow when every
// node is settled.

// terminalStatuses are the statuses a job does not leave.
var terminalStatuses = map[string]bool{"successful": true, "failed": true, "error": true, "canceled": true}

type wfCondition struct {
	trigger, artifactKey, operator, expectedValue string
}

type wfNode struct {
	ID                     int64
	JobID                  *int64
	UJTID                  *int64
	UJTType                string // jobtemplate, project, ...
	InventoryID            *int64
	ExecutionEnvironmentID *int64
	AncestorArtifacts      map[string]any
	ExtraData              string
	DoNotRun               bool
	AllParentsMustConverge bool
	PriorRunSucceeded      bool
	Identifier             string
	CharPrompts            map[string]any
	SurveyPasswords        map[string]any
	MaxRetries             int64
	RetryAttempts          int64
	Credentials            []int64
	Labels                 []int64
	InstanceGroups         []int64

	JobStatus    string
	JobArtifacts map[string]any

	parents    []*wfNode
	success    []*wfNode
	failure    []*wfNode
	always     []*wfNode
	condition  []*wfNode
	conditions map[int64]wfCondition // child id -> edge condition
}

func (n *wfNode) retryPending() bool {
	// approvals are human decisions and are never retried automatically
	return n.JobID != nil && (n.JobStatus == "failed" || n.JobStatus == "error") && n.RetryAttempts < n.MaxRetries && n.UJTID != nil && n.UJTType != "workflowapprovaltemplate"
}

func (n *wfNode) jobFinished() bool {
	return n.JobID != nil && terminalStatuses[n.JobStatus] && !n.retryPending()
}

func (n *wfNode) finallyFailed() bool {
	return n.JobID != nil && (n.JobStatus == "failed" || n.JobStatus == "error" || n.JobStatus == "canceled") && !n.retryPending()
}

type wfDAG struct {
	nodes []*wfNode
	byID  map[int64]*wfNode
}

// loadDAG reads a workflow job's nodes, edges and the state of their jobs.
func (d *Dispatcher) loadDAG(ctx context.Context, wjID int64) (*wfDAG, error) {
	q := d.DB.Pool
	rows, err := q.Query(ctx, `SELECT n.id, n.job_id, n.unified_job_template_id, COALESCE(ct.model, ''), n.inventory_id, n.execution_environment_id, n.ancestor_artifacts, n.extra_data,
		n.do_not_run, n.all_parents_must_converge, n.prior_run_succeeded, n.identifier, n.char_prompts, n.survey_passwords, n.max_retries, n.retry_attempts
		FROM main_workflowjobnode n LEFT JOIN main_unifiedjobtemplate ujt ON ujt.id = n.unified_job_template_id LEFT JOIN django_content_type ct ON ct.id = ujt.polymorphic_ctype_id
		WHERE n.workflow_job_id = $1 ORDER BY n.id`, wjID)
	if err != nil {
		return nil, err
	}
	dag := &wfDAG{byID: map[int64]*wfNode{}}
	for rows.Next() {
		n := &wfNode{conditions: map[int64]wfCondition{}}
		var aa, cp, sp []byte
		if err := rows.Scan(&n.ID, &n.JobID, &n.UJTID, &n.UJTType, &n.InventoryID, &n.ExecutionEnvironmentID, &aa, &n.ExtraData, &n.DoNotRun, &n.AllParentsMustConverge, &n.PriorRunSucceeded, &n.Identifier, &cp, &sp, &n.MaxRetries, &n.RetryAttempts); err != nil {
			rows.Close()
			return nil, err
		}
		n.AncestorArtifacts = map[string]any{}
		_ = json.Unmarshal(aa, &n.AncestorArtifacts)
		_ = json.Unmarshal(cp, &n.CharPrompts)
		_ = json.Unmarshal(sp, &n.SurveyPasswords)
		dag.nodes = append(dag.nodes, n)
		dag.byID[n.ID] = n
	}
	rows.Close()
	for _, e := range []struct {
		table string
		dst   func(n *wfNode) *[]*wfNode
	}{
		{"main_workflowjobnode_success_nodes", func(n *wfNode) *[]*wfNode { return &n.success }},
		{"main_workflowjobnode_failure_nodes", func(n *wfNode) *[]*wfNode { return &n.failure }},
		{"main_workflowjobnode_always_nodes", func(n *wfNode) *[]*wfNode { return &n.always }},
	} {
		rows, err := q.Query(ctx, `SELECT l.from_workflowjobnode_id, l.to_workflowjobnode_id FROM `+e.table+` l JOIN main_workflowjobnode n ON n.id = l.from_workflowjobnode_id WHERE n.workflow_job_id = $1 ORDER BY l.id`, wjID)
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			var from, to int64
			if err := rows.Scan(&from, &to); err != nil {
				rows.Close()
				return nil, err
			}
			if p, c := dag.byID[from], dag.byID[to]; p != nil && c != nil {
				*e.dst(p) = append(*e.dst(p), c)
				c.parents = append(c.parents, p)
			}
		}
		rows.Close()
	}
	rows, err = q.Query(ctx, `SELECT l.from_node_id, l.to_node_id, l.trigger, l.artifact_key, l.operator, l.expected_value FROM main_workflowjobnodeconditionlink l JOIN main_workflowjobnode n ON n.id = l.from_node_id WHERE n.workflow_job_id = $1 ORDER BY l.id`, wjID)
	if err == nil {
		for rows.Next() {
			var from, to int64
			var c wfCondition
			if err := rows.Scan(&from, &to, &c.trigger, &c.artifactKey, &c.operator, &c.expectedValue); err != nil {
				break
			}
			if c.trigger == "" {
				c.trigger = "success"
			}
			if c.operator == "" {
				c.operator = "eq"
			}
			if p, ch := dag.byID[from], dag.byID[to]; p != nil && ch != nil {
				p.condition = append(p.condition, ch)
				p.conditions[ch.ID] = c
				ch.parents = append(ch.parents, p)
			}
		}
		rows.Close()
	}
	var jobIDs []int64
	for _, n := range dag.nodes {
		if n.JobID != nil {
			jobIDs = append(jobIDs, *n.JobID)
		}
	}
	if len(jobIDs) > 0 {
		type jobRow struct {
			status, model string
			artifacts     *string
		}
		jobs := map[int64]jobRow{}
		rows, err := q.Query(ctx, `SELECT u.id, u.status, ct.model, (SELECT artifacts::text FROM main_job WHERE unifiedjob_ptr_id = u.id) FROM main_unifiedjob u
			JOIN django_content_type ct ON ct.id = u.polymorphic_ctype_id WHERE u.id = ANY($1)`, jobIDs)
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			var id int64
			var j jobRow
			if err := rows.Scan(&id, &j.status, &j.model, &j.artifacts); err != nil {
				rows.Close()
				return nil, err
			}
			jobs[id] = j
		}
		rows.Close()
		for _, n := range dag.nodes {
			if n.JobID == nil {
				continue
			}
			j := jobs[*n.JobID]
			n.JobStatus = j.status
			if j.model == "workflowjob" && !terminalStatuses[j.status] {
				// Only a finished parent passes artifacts on; a running
				// nested or sliced workflow is not expanded yet.
				continue
			}
			// get_effective_artifacts(parents_set={workflow job}): a
			// nested or sliced workflow passes on the merged artifacts
			// of its inner jobs.
			a, err := models.EffectiveArtifactsOf(ctx, q, *n.JobID, j.model, j.artifacts, map[int64]bool{wjID: true})
			if err != nil {
				return nil, err
			}
			n.JobArtifacts = a
		}
	}
	// Prompted relations of the nodes.
	for _, n := range dag.nodes {
		n.Credentials, _ = models.ScanIDs(ctx, q, `SELECT credential_id FROM main_workflowjobnode_credentials WHERE workflowjobnode_id = $1 ORDER BY id`, n.ID)
		n.Labels, _ = models.ScanIDs(ctx, q, `SELECT label_id FROM main_workflowjobnode_labels WHERE workflowjobnode_id = $1 ORDER BY id`, n.ID)
		n.InstanceGroups, _ = models.ScanIDs(ctx, q, `SELECT instancegroup_id FROM main_workflowjobnodebaseinstancegroupmembership WHERE workflowjobnode_id = $1 ORDER BY position`, n.ID)
	}
	return dag, nil
}

// nodeArtifacts are what a finished parent passes on: its own ancestor
// artifacts plus what its job produced with set_stats.
func (dag *wfDAG) nodeArtifacts(n *wfNode) map[string]any {
	out := map[string]any{}
	for k, v := range n.AncestorArtifacts {
		out[k] = v
	}
	for k, v := range n.JobArtifacts {
		out[k] = v
	}
	return out
}

// edgeConditionPasses: a conditional edge fires when its trigger matches
// the parent's outcome and the artifact condition holds.
func (dag *wfDAG) edgeConditionPasses(parent, child *wfNode, outcome string) bool {
	c, ok := parent.conditions[child.ID]
	if !ok {
		return false
	}
	if c.trigger != outcome && c.trigger != "always" {
		return false
	}
	return evaluateArtifactCondition(dag.nodeArtifacts(parent), c.artifactKey, c.operator, c.expectedValue)
}

// evaluateArtifactCondition compares an artifact with the expected value,
// read as JSON first and as text otherwise; a missing key never matches.
func evaluateArtifactCondition(artifacts map[string]any, key, operator, expected string) bool {
	value, ok := artifacts[key]
	if !ok {
		return false
	}
	matches := false
	var exp any
	if json.Unmarshal([]byte(expected), &exp) == nil {
		_, vb := value.(bool)
		_, eb := exp.(bool)
		if vb == eb {
			a, _ := json.Marshal(value)
			b, _ := json.Marshal(exp)
			matches = string(a) == string(b)
		}
	}
	if !matches {
		matches = pyStr(value) == expected
	}
	if operator == "ne" {
		return !matches
	}
	return matches
}

func (dag *wfDAG) passingConditionChildren(n *wfNode, outcome string) []*wfNode {
	var out []*wfNode
	for _, c := range n.condition {
		if dag.edgeConditionPasses(n, c, outcome) {
			out = append(out, c)
		}
	}
	return out
}

func (dag *wfDAG) relevantParentsFinished(n *wfNode) bool {
	for _, p := range n.parents {
		switch {
		case p.DoNotRun, p.PriorRunSucceeded, p.UJTID == nil:
			continue
		case p.JobID == nil:
			return false
		case !p.jobFinished():
			return false
		}
	}
	return true
}

func containsNode(l []*wfNode, n *wfNode) bool {
	for _, x := range l {
		if x == n {
			return true
		}
	}
	return false
}

func (dag *wfDAG) allParentsMetConvergence(n *wfNode) bool {
	for _, p := range n.parents {
		status := ""
		if p.jobFinished() && (p.JobStatus == "successful" || p.JobStatus == "failed") {
			if p.JobStatus == "successful" {
				status = "success"
			} else {
				status = "failure"
			}
		} else if p.PriorRunSucceeded {
			status = "success"
		}
		if status == "" {
			continue
		}
		if status == "success" && containsNode(p.success, n) {
			continue
		}
		if status == "failure" && containsNode(p.failure, n) {
			continue
		}
		if containsNode(p.always, n) {
			continue
		}
		if dag.edgeConditionPasses(p, n, status) {
			continue
		}
		return false
	}
	return true
}

func (dag *wfDAG) rootNodes() []*wfNode {
	var out []*wfNode
	for _, n := range dag.nodes {
		if len(n.parents) == 0 {
			out = append(out, n)
		}
	}
	return out
}

// nodesToRun walks the graph from the roots following the outcome edges
// of finished nodes and collects the nodes ready to spawn.
func (dag *wfDAG) nodesToRun() []*wfNode {
	nodes := dag.rootNodes()
	var found []*wfNode
	visited := map[int64]bool{}
	for i := 0; i < len(nodes); i++ {
		n := nodes[i]
		if visited[n.ID] {
			continue
		}
		visited[n.ID] = true
		switch {
		case n.DoNotRun:
			continue
		case n.PriorRunSucceeded:
			nodes = append(nodes, n.success...)
			nodes = append(nodes, n.always...)
			nodes = append(nodes, dag.passingConditionChildren(n, "success")...)
		case n.JobID != nil:
			switch {
			case n.retryPending():
				found = append(found, n)
			case n.JobStatus == "failed" || n.JobStatus == "error" || n.JobStatus == "canceled":
				nodes = append(nodes, n.failure...)
				nodes = append(nodes, n.always...)
				nodes = append(nodes, dag.passingConditionChildren(n, "failure")...)
			case n.JobStatus == "successful":
				nodes = append(nodes, n.success...)
				nodes = append(nodes, n.always...)
				nodes = append(nodes, dag.passingConditionChildren(n, "success")...)
			}
		case n.UJTID == nil:
			nodes = append(nodes, n.failure...)
			nodes = append(nodes, n.always...)
			nodes = append(nodes, dag.passingConditionChildren(n, "failure")...)
		default:
			if !n.AllParentsMustConverge && dag.relevantParentsFinished(n) {
				found = append(found, n)
			} else if n.AllParentsMustConverge && dag.relevantParentsFinished(n) && dag.allParentsMetConvergence(n) {
				found = append(found, n)
			}
		}
	}
	return found
}

func (dag *wfDAG) isDone() bool {
	for _, n := range dag.nodes {
		if !n.DoNotRun && !n.PriorRunSucceeded && n.JobID == nil && n.UJTID != nil {
			return false
		}
		if n.JobID != nil && !n.jobFinished() {
			return false
		}
	}
	return true
}

// hasFailed reports failed nodes without an error handling path.
func (dag *wfDAG) hasFailed() (bool, string) {
	var failedPaths, noTemplate []string
	for _, n := range dag.nodes {
		failedNode := (!n.DoNotRun && !n.PriorRunSucceeded && n.UJTID == nil) || n.finallyFailed()
		if !failedNode {
			continue
		}
		if len(n.failure)+len(n.always)+len(dag.passingConditionChildren(n, "failure")) == 0 {
			if n.UJTID == nil {
				noTemplate = append(noTemplate, fmt.Sprint(n.ID))
			} else {
				failedPaths = append(failedPaths, fmt.Sprintf("(%d,%s)", n.ID, n.JobStatus))
			}
		}
	}
	if len(failedPaths)+len(noTemplate) == 0 {
		return false, ""
	}
	return true, fmt.Sprintf("No error handling path for workflow job node(s) [%s]. Workflow job node(s) missing unified job template and error handling path [%s].", strings.Join(failedPaths, ","), strings.Join(noTemplate, ","))
}

func (dag *wfDAG) allNodesDNRDecided(parents []*wfNode) bool {
	for _, p := range parents {
		if !p.DoNotRun && !p.PriorRunSucceeded && (p.JobID == nil || p.retryPending()) && p.UJTID != nil {
			return false
		}
	}
	return true
}

func (dag *wfDAG) shouldMarkDNR(n *wfNode) bool {
	for _, p := range n.parents {
		switch {
		case p.DoNotRun:
		case p.PriorRunSucceeded:
			if containsNode(p.success, n) || containsNode(p.always, n) || dag.edgeConditionPasses(p, n, "success") {
				return false
			}
		case p.JobID != nil:
			switch {
			case p.retryPending():
				return false
			case p.JobStatus == "successful":
				if containsNode(p.success, n) || containsNode(p.always, n) || dag.edgeConditionPasses(p, n, "success") {
					return false
				}
			case p.JobStatus == "failed" || p.JobStatus == "error" || p.JobStatus == "canceled":
				if containsNode(p.failure, n) || containsNode(p.always, n) || dag.edgeConditionPasses(p, n, "failure") {
					return false
				}
			default:
				return false
			}
		case !p.DoNotRun && p.UJTID == nil:
			if containsNode(p.failure, n) || containsNode(p.always, n) || dag.edgeConditionPasses(p, n, "failure") {
				return false
			}
		default:
			return false
		}
	}
	return true
}

// topological orders nodes so parents come before children.
func (dag *wfDAG) topological() []*wfNode {
	var out []*wfNode
	state := map[int64]int{}
	var visit func(n *wfNode)
	visit = func(n *wfNode) {
		if state[n.ID] != 0 {
			return
		}
		state[n.ID] = 1
		for _, p := range n.parents {
			visit(p)
		}
		state[n.ID] = 2
		out = append(out, n)
	}
	for _, n := range dag.nodes {
		visit(n)
	}
	return out
}

// markDNR marks the nodes that can no longer run (mark_dnr_nodes).
func (dag *wfDAG) markDNR() []*wfNode {
	roots := dag.rootNodes()
	var marked []*wfNode
	for _, n := range dag.topological() {
		if n.DoNotRun || n.JobID != nil || containsNode(roots, n) {
			continue
		}
		if n.AllParentsMustConverge {
			anyDNR := false
			for _, p := range n.parents {
				if p.DoNotRun {
					anyDNR = true
				}
			}
			if anyDNR || !dag.allParentsMetConvergence(n) {
				n.DoNotRun = true
				marked = append(marked, n)
			}
		} else if dag.allNodesDNRDecided(n.parents) && dag.shouldMarkDNR(n) {
			n.DoNotRun = true
			marked = append(marked, n)
		}
	}
	return marked
}

// processWorkflows advances every pending or running workflow job.
func (d *Dispatcher) processWorkflows(ctx context.Context) {
	if d.API == nil {
		return
	}
	d.wfMu.Lock()
	defer d.wfMu.Unlock()
	// The in-process mutex covers this process; the advisory lock the old
	// WorkflowManager took covers the other task processes, old and new.
	// Whoever holds it does the pass; the others skip it.
	d.withAdvisoryLock(ctx, workflowLockID, "workflow manager", func() {
		d.safely("workflow approval timeouts", func() { d.timeoutApprovals(ctx) })
		ids, err := models.ScanIDs(ctx, d.DB.Pool, `SELECT id FROM main_unifiedjob WHERE polymorphic_ctype_id = $1 AND status IN ('pending', 'running') ORDER BY id`, d.CT.ID("main.workflowjob"))
		if err != nil {
			d.Log.ErrorContext(ctx, "workflow jobs", "err", err)
			return
		}
		for _, id := range ids {
			d.safely(fmt.Sprintf("workflow job %d", id), func() {
				if err := d.processWorkflow(ctx, id); err != nil {
					d.Log.ErrorContext(ctx, "workflow job", "id", id, "err", err)
				}
			})
		}
	})
}

// startWorkflowJob moves a pending workflow job to running, unless it is
// blocked as the task manager's workflow_job_blocked_by blocked it: a
// workflow job that does not allow simultaneous runs waits while another
// job of its template is waiting or running. A sliced job's template is a
// job template, so a job of that template blocks it too. processWorkflows
// takes pending workflow jobs in id order, so the oldest starts first.
// Starting drops the explanation of why it waited (pre_start).
func startWorkflowJob(ctx context.Context, q db.Querier, id int64) (bool, error) {
	tag, err := q.Exec(ctx, `UPDATE main_unifiedjob uj SET status = 'running', started = now(), job_explanation = '', modified = now() WHERE uj.id = $1 AND uj.status = 'pending'
		AND NOT EXISTS (SELECT 1 FROM main_workflowjob w JOIN main_unifiedjob o ON o.unified_job_template_id = uj.unified_job_template_id AND o.id <> uj.id
			WHERE w.unifiedjob_ptr_id = uj.id AND w.allow_simultaneous = false AND o.status IN ('waiting', 'running'))`, id)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

func (d *Dispatcher) processWorkflow(ctx context.Context, id int64) error {
	q := d.DB.Pool
	wj, err := models.GetWorkflowJob(ctx, q, id)
	if err != nil {
		return err
	}
	if wj.Status == "pending" {
		started, err := startWorkflowJob(ctx, q, id)
		if err != nil {
			return err
		}
		if !started {
			// Blocked, or no longer pending (canceled meanwhile): the
			// next pass looks again.
			return explainBlockedWorkflow(ctx, q, id, d.CT.ID("main.workflowjob"))
		}
		d.notify(id, "running")
		if wj.UnifiedJobTemplateID != nil {
			d.templateRunning(ctx, q, *wj.UnifiedJobTemplateID, id)
		}
		wj.Status = "running"
		d.Log.InfoContext(ctx, "workflow job starting", "id", id)
	}
	dag, err := d.loadDAG(ctx, id)
	if err != nil {
		return err
	}
	if wj.CancelFlag {
		_, _ = q.Exec(ctx, `UPDATE main_workflowjobnode SET do_not_run = true, modified = now() WHERE workflow_job_id = $1 AND do_not_run = false AND job_id IS NULL`, id)
		if d.cancelNodeJobs(ctx, dag) {
			return d.finishWorkflow(ctx, wj, "canceled", "")
		}
		return nil
	}
	for _, n := range dag.markDNR() {
		_, _ = q.Exec(ctx, `UPDATE main_workflowjobnode SET do_not_run = true, modified = now() WHERE id = $1`, n.ID)
	}
	if dag.isDone() {
		failed, reason := dag.hasFailed()
		status := "successful"
		explanation := ""
		if failed {
			status = "failed"
			explanation = "No error handling paths found, marking workflow as failed"
			d.Log.InfoContext(ctx, "workflow job failed", "id", id, "reason", reason)
		}
		return d.finishWorkflow(ctx, wj, status, explanation)
	}
	for _, n := range dag.nodesToRun() {
		if n.UJTID == nil {
			continue
		}
		if err := d.spawnNode(ctx, wj, dag, n); err != nil {
			d.Log.ErrorContext(ctx, "workflow node", "workflow_job", id, "node", n.ID, "err", err)
			return d.finishWorkflow(ctx, wj, "failed", err.Error())
		}
	}
	return nil
}

// cancelNodeJobs cancels the jobs of a workflow being cancelled and
// reports whether all of them have concluded.
func (d *Dispatcher) cancelNodeJobs(ctx context.Context, dag *wfDAG) bool {
	finished := true
	for _, n := range dag.nodes {
		if n.JobID == nil || terminalStatuses[n.JobStatus] {
			continue
		}
		finished = false
		switch n.JobStatus {
		case "new", "pending":
			_, _ = d.DB.Pool.Exec(ctx, `UPDATE main_unifiedjob SET status = 'canceled', cancel_flag = true, failed = true, finished = now(), canceled_on = now(), start_args = '', modified = now() WHERE id = $1 AND status IN ('new', 'pending')`, *n.JobID)
		default:
			_, _ = d.DB.Pool.Exec(ctx, `UPDATE main_unifiedjob SET cancel_flag = true, modified = now() WHERE id = $1`, *n.JobID)
			d.cancelEverywhere(ctx, *n.JobID)
		}
	}
	return finished
}

// finishWorkflow stores the final status of a workflow job and updates
// its template, as the job's save and _update_parent_instance did.
func (d *Dispatcher) finishWorkflow(ctx context.Context, wj *models.WorkflowJob, status, explanation string) error {
	finished := time.Now()
	failed := status != "successful"
	var canceledOn *time.Time
	if status == "canceled" {
		canceledOn = &finished
	}
	d.Log.InfoContext(ctx, "workflow job finished", "id", wj.ID, "status", status)
	defer func() { d.notify(wj.ID, status) }()
	return d.DB.Tx(ctx, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `UPDATE main_unifiedjob SET status = $2, failed = $3, finished = $4, elapsed = EXTRACT(EPOCH FROM ($4 - COALESCE(started, created))), job_explanation = $5, canceled_on = $6, start_args = '', modified = now() WHERE id = $1`,
			wj.ID, status, failed, finished, explanation, canceledOn); err != nil {
			return err
		}
		if wj.UnifiedJobTemplateID != nil {
			return d.templateFinished(ctx, tx, *wj.UnifiedJobTemplateID, templateJobStatus(failed), wj.ID, failed, finished)
		}
		return nil
	})
}

// errNodeTaken: the node got a job from someone else while this spawn ran.
var errNodeTaken = errors.New("workflow node already has a job")

// withdrawJob cancels a job spawned for a node that turned out to have
// one; one already claimed somewhere is canceled through its cancel flag.
func (d *Dispatcher) withdrawJob(ctx context.Context, id int64) {
	const explanation = "Canceled: its workflow node was given another job."
	tag, err := d.DB.Pool.Exec(ctx, `UPDATE main_unifiedjob SET status = 'canceled', cancel_flag = true, failed = true, finished = now(), canceled_on = now(), start_args = '',
		job_explanation = $2, modified = now() WHERE id = $1 AND status IN ('new', 'pending')`, id, explanation)
	if err == nil && tag.RowsAffected() > 0 {
		return
	}
	_, _ = d.DB.Pool.Exec(ctx, `UPDATE main_unifiedjob SET cancel_flag = true, modified = now() WHERE id = $1 AND status IN ('waiting', 'running')`, id)
	d.cancelEverywhere(ctx, id)
}

// spawnNode creates the job of a node that is ready to run.
func (d *Dispatcher) spawnNode(ctx context.Context, wj *models.WorkflowJob, dag *wfDAG, n *wfNode) error {
	q := d.DB.Pool
	// Ancestor artifacts: merged from the parents (merge_stats_artifacts).
	aa := map[string]any{}
	for _, p := range n.parents {
		models.MergeStatsArtifacts(aa, dag.nodeArtifacts(p))
	}
	if len(aa) > 0 && len(n.parents) > 0 {
		b, _ := json.Marshal(aa)
		if _, err := q.Exec(ctx, `UPDATE main_workflowjobnode SET ancestor_artifacts = $2, modified = now() WHERE id = $1`, n.ID, string(b)); err != nil {
			return err
		}
		n.AncestorArtifacts = aa
	}
	isRetry := n.JobID != nil
	superseded := n.JobID
	var newID int64
	// cannotStart: the job was failed without starting (missing resources,
	// recursion, prompted passwords); retrying cannot help.
	cannotStart := false
	switch n.UJTType {
	case "jobtemplate":
		t, err := models.GetJobTemplate(ctx, q, *n.UJTID)
		if err != nil {
			return fmt.Errorf("node %d: job template %d: %w", n.ID, *n.UJTID, err)
		}
		spec := &api.WorkflowNodeSpec{ID: n.ID, InventoryID: n.InventoryID, ExecutionEnvironmentID: n.ExecutionEnvironmentID, CharPrompts: n.CharPrompts, SurveyPasswords: n.SurveyPasswords,
			Credentials: n.Credentials, Labels: n.Labels, InstanceGroups: n.InstanceGroups, AncestorArtifacts: n.AncestorArtifacts, IsRoot: len(n.parents) == 0, NodeCount: int64(len(dag.nodes))}
		if n.ExtraData != "" {
			spec.ExtraData, _ = parseVars(n.ExtraData)
		}
		// The node's and the workflow's credentials combine by unique
		// hash, which looks up a vault id an input source fills.
		res, err := d.API.SpawnWorkflowNodeJob(d.API.WithInputLookups(ctx), wj, t, spec)
		if err != nil {
			return fmt.Errorf("node %d: %w", n.ID, err)
		}
		newID = res.ID
		cannotStart = res.Failed
		d.Log.InfoContext(ctx, "workflow node spawned", "workflow_job", wj.ID, "node", n.ID, res.Type, res.ID)
	case "project":
		p, err := models.GetProject(ctx, q, *n.UJTID)
		if err != nil {
			return fmt.Errorf("node %d: project %d: %w", n.ID, *n.UJTID, err)
		}
		pu := models.NewProjectUpdate(p, "workflow", wj.CreatedByID, "check")
		if err := d.DB.Tx(ctx, func(tx pgx.Tx) error { return models.InsertProjectUpdate(ctx, tx, pu, d.CT) }); err != nil {
			return err
		}
		newID = pu.ID
		d.Log.InfoContext(ctx, "workflow node spawned", "workflow_job", wj.ID, "node", n.ID, "project_update", pu.ID)
	case "inventorysource":
		src, err := models.GetInventorySource(ctx, q, *n.UJTID)
		if err != nil {
			return fmt.Errorf("node %d: inventory source %d: %w", n.ID, *n.UJTID, err)
		}
		iu, err := d.API.CreateInventoryUpdate(ctx, src, wj.CreatedByID, "workflow", nil)
		if err != nil {
			return err
		}
		newID = iu.ID
		d.Log.InfoContext(ctx, "workflow node spawned", "workflow_job", wj.ID, "node", n.ID, "inventory_update", iu.ID)
	case "workflowjobtemplate":
		id, refused, err := d.spawnNestedWorkflow(ctx, wj, dag, n)
		if err != nil {
			return fmt.Errorf("node %d: %w", n.ID, err)
		}
		newID, cannotStart = id, refused
		d.Log.InfoContext(ctx, "workflow node spawned", "workflow_job", wj.ID, "node", n.ID, "workflow_job", id)
	case "systemjobtemplate":
		id, err := d.API.SpawnWorkflowNodeSystemJob(ctx, wj, *n.UJTID)
		if err != nil {
			return fmt.Errorf("node %d: system job template %d: %w", n.ID, *n.UJTID, err)
		}
		newID = id
		d.Log.InfoContext(ctx, "workflow node spawned", "workflow_job", wj.ID, "node", n.ID, "system_job", id)
	case "workflowapprovaltemplate":
		id, err := d.spawnApproval(ctx, wj, n)
		if err != nil {
			return err
		}
		newID = id
		d.Log.InfoContext(ctx, "workflow node spawned", "workflow_job", wj.ID, "node", n.ID, "workflow_approval", id)
	default:
		return fmt.Errorf("workflow node %d uses a %s, which this task runner cannot run yet", n.ID, n.UJTType)
	}
	err := d.DB.Tx(ctx, func(tx pgx.Tx) error {
		if isRetry {
			tag, err := tx.Exec(ctx, `UPDATE main_workflowjobnode SET job_id = $2, retry_attempts = retry_attempts + 1, modified = now() WHERE id = $1 AND job_id = $3`, n.ID, newID, *superseded)
			if err != nil {
				return err
			}
			if tag.RowsAffected() == 0 {
				return errNodeTaken
			}
			_, err = tx.Exec(ctx, `INSERT INTO main_workflowjobnode_retried_jobs (workflowjobnode_id, unifiedjob_id) VALUES ($1, $2)`, n.ID, *superseded)
			return err
		}
		tag, err := tx.Exec(ctx, `UPDATE main_workflowjobnode SET job_id = $2, modified = now() WHERE id = $1 AND job_id IS NULL`, n.ID, newID)
		if err == nil && tag.RowsAffected() == 0 {
			return errNodeTaken
		}
		return err
	})
	if errors.Is(err, errNodeTaken) {
		// Another task manager linked a job to the node first (one that does
		// not take the workflow lock): the job made here is withdrawn
		// rather than run twice.
		d.Log.WarnContext(ctx, fmt.Sprintf("workflow node %d already has a job; canceling the duplicate %d", n.ID, newID))
		d.withdrawJob(ctx, newID)
		return nil
	}
	if err == nil && cannotStart {
		_, _ = d.DB.Pool.Exec(ctx, `UPDATE main_workflowjobnode SET retry_attempts = GREATEST(retry_attempts, max_retries) WHERE id = $1`, n.ID)
		// websocket_emit_status and send_notification_templates('failed').
		d.notify(newID, "failed")
	}
	if err == nil && n.UJTType == "workflowapprovaltemplate" && d.API != nil {
		// signal_start: the approval node needs review, now that the node
		// leads to it.
		d.background(func(ctx context.Context) { d.API.SendApprovalNotifications(ctx, newID, "running") })
	}
	return err
}
