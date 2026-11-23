package api

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/activity"
	"github.com/ctrliq/ascender/internal/auth"
	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/models"
)

// Workflow nodes: the nodes of workflow job templates (editable, linked
// by success/failure/always/condition edges) and the read-only nodes of
// workflow jobs (WorkflowJobTemplateNodeSerializer, WorkflowJobNodeSerializer
// and the views around them).

var nodeEdgeKinds = []string{"success_nodes", "failure_nodes", "always_nodes", "condition_nodes"}

func nodeFieldSet(job bool) *FieldSet {
	fs := &FieldSet{Model: "WorkflowJobTemplateNode", Fields: map[string]Field{
		"id": {SQL: "n.id", Kind: KindInt}, "created": {SQL: "n.created", Kind: KindDateTime}, "modified": {SQL: "n.modified", Kind: KindDateTime},
		"unified_job_template":      {SQL: "n.unified_job_template_id", Kind: KindFK, Rel: &Relation{Alias: "nujt", Join: "LEFT JOIN main_unifiedjobtemplate nujt ON nujt.id = n.unified_job_template_id", Target: func() *FieldSet { return unifiedJobTemplateFieldsAlias("nujt") }}},
		"inventory":                 {SQL: "n.inventory_id", Kind: KindFK},
		"execution_environment":     {SQL: "n.execution_environment_id", Kind: KindFK},
		"identifier":                {SQL: "n.identifier"},
		"all_parents_must_converge": {SQL: "n.all_parents_must_converge", Kind: KindBool},
		"max_retries":               {SQL: "n.max_retries", Kind: KindInt},
		"extra_data":                {SQL: "n.extra_data", NoFilter: true},
	}, SearchFields: []string{"unified_job_template__name", "unified_job_template__description"}}
	if job {
		fs.Model = "WorkflowJobNode"
		fs.Fields["workflow_job"] = Field{SQL: "n.workflow_job_id", Kind: KindFK}
		fs.Fields["job"] = Field{SQL: "n.job_id", Kind: KindFK}
		fs.Fields["do_not_run"] = Field{SQL: "n.do_not_run", Kind: KindBool}
		fs.Fields["prior_run_succeeded"] = Field{SQL: "n.prior_run_succeeded", Kind: KindBool}
		fs.Fields["forced_success"] = Field{SQL: "n.forced_success", Kind: KindBool}
		fs.Fields["retry_attempts"] = Field{SQL: "n.retry_attempts", Kind: KindInt}
	} else {
		fs.Fields["workflow_job_template"] = Field{SQL: "n.workflow_job_template_id", Kind: KindFK}
	}
	return fs
}

func (s *Server) registerWorkflowNodes(mux *http.ServeMux) {
	s.route(mux, "/api/v2/workflow_job_template_nodes/{$}", methodMap{"GET": s.templateNodeList, "POST": s.templateNodeCreate}, s.optionsFor("workflow_job_template_nodes"))
	s.route(mux, "/api/v2/workflow_job_template_nodes/{id}/{$}", methodMap{"GET": s.templateNodeDetail, "PUT": s.templateNodeUpdate, "PATCH": s.templateNodeUpdate, "DELETE": s.templateNodeDelete}, s.optionsFor("workflow_job_template_nodes"))
	for _, kind := range nodeEdgeKinds {
		kind := kind
		opts := "workflow_job_template_node_children"
		if kind == "condition_nodes" {
			opts = "workflow_job_template_node_condition_nodes"
		}
		s.route(mux, "/api/v2/workflow_job_template_nodes/{id}/"+kind+"/{$}", methodMap{
			"GET":  func(w http.ResponseWriter, r *http.Request) error { return s.templateNodeChildren(w, r, kind) },
			"POST": func(w http.ResponseWriter, r *http.Request) error { return s.templateNodeChildrenPost(w, r, kind) },
		}, s.optionsExact(opts))
		s.route(mux, "/api/v2/workflow_job_nodes/{id}/"+kind+"/{$}", methodMap{"GET": func(w http.ResponseWriter, r *http.Request) error { return s.jobNodeChildren(w, r, kind) }}, s.optionsFor("workflow_job_nodes"))
	}
	s.route(mux, "/api/v2/workflow_job_template_nodes/{id}/credentials/{$}", methodMap{"GET": s.templateNodeCredentials, "POST": s.templateNodeCredentialsAttach}, s.optionsFor("credentials"))
	s.route(mux, "/api/v2/workflow_job_template_nodes/{id}/labels/{$}", methodMap{"GET": s.templateNodeLabels, "POST": s.templateNodeLabelsAttach}, nil)
	s.route(mux, "/api/v2/workflow_job_template_nodes/{id}/instance_groups/{$}", methodMap{"GET": s.templateNodeInstanceGroups, "POST": s.templateNodeInstanceGroupsAttach}, nil)
	s.route(mux, "/api/v2/workflow_job_template_nodes/{id}/create_approval_template/{$}", methodMap{"GET": s.createApprovalTemplateView, "POST": s.createApprovalTemplate}, s.optionsExact("workflow_job_template_node_create_approval"))
	s.route(mux, "/api/v2/workflow_job_templates/{id}/workflow_nodes/{$}", methodMap{"GET": s.workflowJobTemplateWorkflowNodes, "POST": s.workflowJobTemplateWorkflowNodeCreate}, s.optionsExact("workflow_job_template_workflow_nodes"))
	s.route(mux, "/api/v2/workflow_job_nodes/{$}", methodMap{"GET": s.jobNodeList}, s.optionsFor("workflow_job_nodes"))
	s.route(mux, "/api/v2/workflow_job_nodes/{id}/{$}", methodMap{"GET": s.jobNodeDetail}, s.optionsFor("workflow_job_nodes"))
	s.route(mux, "/api/v2/workflow_job_nodes/{id}/credentials/{$}", methodMap{"GET": s.jobNodeCredentials}, s.optionsFor("credentials"))
	s.route(mux, "/api/v2/workflow_job_nodes/{id}/labels/{$}", methodMap{"GET": s.jobNodeLabels}, nil)
	s.route(mux, "/api/v2/workflow_job_nodes/{id}/instance_groups/{$}", methodMap{"GET": s.jobNodeInstanceGroups}, nil)
}

// --- access ------------------------------------------------------------------

func (s *Server) templateNodeAccess(q *Query, u *auth.User) {
	s.AccessibleFilter(q, u, "n.workflow_job_template_id", "main.workflowjobtemplate", "read_role")
}

func (s *Server) jobNodeAccess(q *Query, u *auth.User) {
	q.And("n.workflow_job_id IN (SELECT wj.unifiedjob_ptr_id FROM main_workflowjob wj JOIN main_unifiedjob uj ON uj.id = wj.unifiedjob_ptr_id WHERE wj.workflow_job_template_id IN (" +
		accessibleSQL(q, u.ID, s.CT.ID("main.workflowjobtemplate"), "read_role") + ") OR wj.job_template_id IN (" + accessibleSQL(q, u.ID, s.CT.ID("main.jobtemplate"), "read_role") +
		`) OR uj.organization_id IN (SELECT o.id FROM main_organization o JOIN main_rbac_roles_members m ON m.role_id = o.admin_role_id WHERE m.user_id = ` + q.Arg(u.ID) + "))")
}

// nodeIn is a workflow node with the workflow (template or job) it
// belongs to.
type nodeIn[W any] struct {
	n  *models.WorkflowNode
	wf W
}

// templateNodeObj is a workflow template node, readable through its
// workflow job template.
var templateNodeObj = &pathObject[nodeIn[*models.WorkflowJobTemplate]]{
	model: "WorkflowJobTemplateNode",
	get: func(ctx context.Context, q db.Querier, id int64) (nodeIn[*models.WorkflowJobTemplate], error) {
		n, err := models.GetTemplateNode(ctx, q, id)
		if err != nil {
			return nodeIn[*models.WorkflowJobTemplate]{}, err
		}
		t, err := models.GetWorkflowJobTemplate(ctx, q, n.WorkflowID)
		return nodeIn[*models.WorkflowJobTemplate]{n, t}, err
	},
	readable: func(c *SerCtx, v nodeIn[*models.WorkflowJobTemplate]) bool { return c.HasRole(v.wf.ReadRoleID) },
}

// jobNodeObj is a workflow job node, readable through its workflow job.
var jobNodeObj = &pathObject[nodeIn[*models.WorkflowJob]]{
	model: "WorkflowJobNode",
	get: func(ctx context.Context, q db.Querier, id int64) (nodeIn[*models.WorkflowJob], error) {
		n, err := models.GetJobNode(ctx, q, id)
		if err != nil {
			return nodeIn[*models.WorkflowJob]{}, err
		}
		wj, err := models.GetWorkflowJob(ctx, q, n.WorkflowID)
		return nodeIn[*models.WorkflowJob]{n, wj}, err
	},
	readable: func(c *SerCtx, v nodeIn[*models.WorkflowJob]) bool { return workflowJobObj.readable(c, v.wf) },
}

// --- lists -------------------------------------------------------------------

func (s *Server) templateNodeListWith(w http.ResponseWriter, r *http.Request, extra func(q *Query)) error {
	spec := ListSpec{Model: "WorkflowJobTemplateNode", From: "main_workflowjobtemplatenode n", Columns: models.TemplateNodeColumns, PK: "n.id", Fields: nodeFieldSet(false), DefaultOrder: []string{"id"}, Access: s.templateNodeAccess}
	nodes, count, page, err := runListOf(s, r, spec, extra, models.ScanTemplateNode)
	if err != nil {
		return err
	}
	results, err := s.serializeWorkflowNodes(s.NewSerCtx(r, false), nodes, false)
	if err != nil {
		return err
	}
	WriteJSON(w, 200, Paginate(r, page, count, results))
	return nil
}

func (s *Server) jobNodeListWith(w http.ResponseWriter, r *http.Request, extra func(q *Query)) error {
	spec := ListSpec{Model: "WorkflowJobNode", From: "main_workflowjobnode n", Columns: models.JobNodeColumns, PK: "n.id", Fields: nodeFieldSet(true), DefaultOrder: []string{"id"}, Access: s.jobNodeAccess}
	nodes, count, page, err := runListOf(s, r, spec, extra, models.ScanJobNode)
	if err != nil {
		return err
	}
	results, err := s.serializeWorkflowNodes(s.NewSerCtx(r, false), nodes, true)
	if err != nil {
		return err
	}
	WriteJSON(w, 200, Paginate(r, page, count, results))
	return nil
}

func (s *Server) templateNodeList(w http.ResponseWriter, r *http.Request) error {
	if _, err := RequireUser(r); err != nil {
		return err
	}
	return s.templateNodeListWith(w, r, nil)
}

func (s *Server) jobNodeList(w http.ResponseWriter, r *http.Request) error {
	if _, err := RequireUser(r); err != nil {
		return err
	}
	return s.jobNodeListWith(w, r, nil)
}

func (s *Server) workflowJobTemplateWorkflowNodes(w http.ResponseWriter, r *http.Request) error {
	_, t, err := workflowJobTemplateObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	return s.templateNodeListWith(w, r, func(q *Query) { q.And("n.workflow_job_template_id = " + q.Arg(t.ID)) })
}

// workflowJobNodes lists a workflow job's nodes (WorkflowJobWorkflowNodesList).
func (s *Server) workflowJobNodes(w http.ResponseWriter, r *http.Request) error {
	_, wj, err := workflowJobObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	return s.jobNodeListWith(w, r, func(q *Query) { q.And("n.workflow_job_id = " + q.Arg(wj.ID)) })
}

func (s *Server) templateNodeDetail(w http.ResponseWriter, r *http.Request) error {
	_, nt, err := templateNodeObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	n := nt.n
	results, err := s.serializeWorkflowNodes(s.NewSerCtx(r, true), []*models.WorkflowNode{n}, false)
	if err != nil {
		return err
	}
	WriteJSON(w, 200, results[0])
	return nil
}

func (s *Server) jobNodeDetail(w http.ResponseWriter, r *http.Request) error {
	_, nt, err := jobNodeObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	n := nt.n
	results, err := s.serializeWorkflowNodes(s.NewSerCtx(r, true), []*models.WorkflowNode{n}, true)
	if err != nil {
		return err
	}
	WriteJSON(w, 200, results[0])
	return nil
}

func edgeTable(t models.NodeTables, kind string) string {
	return t.LinkPrefix + kind
}

func (s *Server) templateNodeChildren(w http.ResponseWriter, r *http.Request, kind string) error {
	_, nt, err := templateNodeObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	n := nt.n
	return s.templateNodeListWith(w, r, func(q *Query) { q.And(nodeChildClause(q, models.TemplateNodeTables, kind, n.ID)) })
}

func (s *Server) jobNodeChildren(w http.ResponseWriter, r *http.Request, kind string) error {
	_, nt, err := jobNodeObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	n := nt.n
	return s.jobNodeListWith(w, r, func(q *Query) { q.And(nodeChildClause(q, models.JobNodeTables, kind, n.ID)) })
}

func nodeChildClause(q *Query, t models.NodeTables, kind string, parent int64) string {
	if kind == "condition_nodes" {
		return "n.id IN (SELECT to_node_id FROM " + t.Condition + " WHERE from_node_id = " + q.Arg(parent) + ")"
	}
	return "n.id IN (SELECT to_" + t.LinkCol + "_id FROM " + edgeTable(t, kind) + " WHERE from_" + t.LinkCol + "_id = " + q.Arg(parent) + ")"
}

// --- serializer -----------------------------------------------------------------

// displayNodeExtraData hides survey password answers (display_extra_vars).
func displayNodeExtraData(n *models.WorkflowNode) any {
	extra := NewOMap()
	_ = extra.UnmarshalJSON([]byte(n.ExtraData))
	if len(n.SurveyPasswords) > 0 {
		for k := range n.SurveyPasswords {
			if extra.Has(k) {
				extra.Set(k, "$encrypted$")
			}
		}
	}
	return extra
}

func (s *Server) serializeWorkflowNodes(c *SerCtx, nodes []*models.WorkflowNode, job bool) ([]any, error) {
	ctx := c.Ctx()
	tables := models.TemplateNodeTables
	if job {
		tables = models.JobNodeTables
	}
	var ids, ujtIDs, invIDs, eeIDs, jobIDs, wfIDs, userIDs []int64
	for _, n := range nodes {
		ids = append(ids, n.ID)
		ujtIDs = append(ujtIDs, uniqueIDs(n.UnifiedJobTemplateID)...)
		invIDs = append(invIDs, uniqueIDs(n.InventoryID)...)
		eeIDs = append(eeIDs, uniqueIDs(n.ExecutionEnvironmentID)...)
		jobIDs = append(jobIDs, uniqueIDs(n.JobID, n.ForcedSuccessJobID)...)
		userIDs = append(userIDs, uniqueIDs(n.ForcedSuccessByID)...)
		wfIDs = append(wfIDs, n.WorkflowID)
	}
	edges, err := models.LoadNodeEdges(ctx, s.Q(), tables, ids)
	if err != nil {
		return nil, err
	}
	templates, err := s.loadTemplateBriefs(c, ujtIDs)
	if err != nil {
		return nil, err
	}
	invs, err := models.LoadInventorySummaries(ctx, s.Q(), invIDs)
	if err != nil {
		return nil, err
	}
	if err := c.PreloadEEs(eeIDs); err != nil {
		return nil, err
	}
	if err := c.PreloadUsers(userIDs); err != nil {
		return nil, err
	}
	type approvalExtra struct {
		Timeout, Required int64
		OnTimeout, Ctx    string
	}
	approvals := map[int64]approvalExtra{}
	if len(ujtIDs) > 0 {
		rows, err := s.Q().Query(ctx, `SELECT unifiedjobtemplate_ptr_id, timeout, required_approvals, on_timeout, context_template FROM main_workflowapprovaltemplate WHERE unifiedjobtemplate_ptr_id = ANY($1)`, ujtIDs)
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			var id int64
			var a approvalExtra
			if err := rows.Scan(&id, &a.Timeout, &a.Required, &a.OnTimeout, &a.Ctx); err != nil {
				rows.Close()
				return nil, err
			}
			approvals[id] = a
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return nil, err
		}
	}
	briefs, err := models.LoadUnifiedJobBriefs(ctx, s.Q(), s.CT, jobIDs)
	if err != nil {
		return nil, err
	}
	timedOut := map[int64]bool{}
	if len(jobIDs) > 0 {
		rows, err := s.Q().Query(ctx, `SELECT unifiedjob_ptr_id, timed_out FROM main_workflowapproval WHERE unifiedjob_ptr_id = ANY($1)`, jobIDs)
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			var id int64
			var to bool
			if err := rows.Scan(&id, &to); err != nil {
				rows.Close()
				return nil, err
			}
			timedOut[id] = to
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return nil, err
		}
	}
	// the workflow each node belongs to
	type wfBrief struct {
		Name, Description, Org string
		AllowForce             bool
	}
	wfs := map[int64]wfBrief{}
	if len(wfIDs) > 0 {
		var sql string
		if job {
			sql = `SELECT u.id, u.name, u.description, '', false FROM main_unifiedjob u WHERE u.id = ANY($1)`
		} else {
			sql = `SELECT u.id, u.name, u.description, COALESCE(o.name, ''), w.allow_force_node_success_on_relaunch FROM main_unifiedjobtemplate u JOIN main_workflowjobtemplate w ON w.unifiedjobtemplate_ptr_id = u.id LEFT JOIN main_organization o ON o.id = u.organization_id WHERE u.id = ANY($1)`
		}
		rows, err := s.Q().Query(ctx, sql, wfIDs)
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			var id int64
			var b wfBrief
			if err := rows.Scan(&id, &b.Name, &b.Description, &b.Org, &b.AllowForce); err != nil {
				rows.Close()
				return nil, err
			}
			wfs[id] = b
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return nil, err
		}
	}
	retried := map[int64][]int64{}
	if job && len(ids) > 0 {
		rows, err := s.Q().Query(ctx, `SELECT workflowjobnode_id, unifiedjob_id FROM main_workflowjobnode_retried_jobs WHERE workflowjobnode_id = ANY($1) ORDER BY unifiedjob_id`, ids)
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			var nid, jid int64
			if err := rows.Scan(&nid, &jid); err != nil {
				rows.Close()
				return nil, err
			}
			retried[nid] = append(retried[nid], jid)
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return nil, err
		}
	}
	coll := "workflow_job_template_nodes"
	typ := "workflow_job_template_node"
	if job {
		coll, typ = "workflow_job_nodes", "workflow_job_node"
	}
	out := make([]any, 0, len(nodes))
	for _, n := range nodes {
		wf := wfs[n.WorkflowID]
		related := NewOMap()
		if c.Detail && !job {
			related.Set("named_url", "/api/v2/workflow_job_template_nodes/"+namedURLEscape(n.Identifier)+"++"+namedURLEscape(wf.Name)+"++"+namedURLEscape(wf.Org)+"/")
		}
		setURL(related, "inventory", "inventories", n.InventoryID)
		setURL(related, "execution_environment", "execution_environments", n.ExecutionEnvironmentID)
		related.Set("labels", SubURL(coll, n.ID, "labels")).Set("credentials", SubURL(coll, n.ID, "credentials")).Set("instance_groups", SubURL(coll, n.ID, "instance_groups"))
		if !job {
			related.Set("create_approval_template", SubURL(coll, n.ID, "create_approval_template"))
		}
		for _, kind := range nodeEdgeKinds {
			related.Set(kind, SubURL(coll, n.ID, kind))
		}
		var tb templateBrief
		hasTemplate := false
		if n.UnifiedJobTemplateID != nil {
			tb, hasTemplate = templates[*n.UnifiedJobTemplateID]
			if hasTemplate {
				related.Set("unified_job_template", templateDetailURL(tb))
			}
		}
		var jb models.UnifiedJobBrief
		hasJob := false
		if n.JobID != nil {
			jb, hasJob = briefs[*n.JobID]
			if hasJob {
				related.Set("job", models.JobDetailURL(jb.Type, jb.ID))
			}
		}
		if job {
			related.Set("workflow_job", URLFor("workflow_jobs", n.WorkflowID))
		} else {
			related.Set("workflow_job_template", URLFor("workflow_job_templates", n.WorkflowID))
		}

		summary := NewOMap()
		if n.InventoryID != nil {
			if inv, ok := invs[*n.InventoryID]; ok {
				summary.Set("inventory", inventorySummaryMap(inv))
			}
		}
		if e := c.EESummary(n.ExecutionEnvironmentID); e != nil {
			summary.Set("execution_environment", e)
		}
		if hasJob {
			js := NewOMap().Set("id", jb.ID).Set("name", jb.Name).Set("description", jb.Description).Set("status", jb.Status).Set("failed", jb.Failed)
			if jb.Started != nil {
				js.Set("started", models.FormatTime(*jb.Started))
			}
			js.Set("elapsed", jb.Elapsed).Set("type", jb.Type)
			if jb.CanceledOn != nil {
				js.Set("canceled_on", models.FormatTime(*jb.CanceledOn))
			}
			if jb.Type == "workflow_approval" {
				js.Set("timed_out", timedOut[jb.ID])
			}
			summary.Set("job", js)
		}
		if job {
			summary.Set("workflow_job", NewOMap().Set("id", n.WorkflowID).Set("name", wf.Name).Set("description", wf.Description))
		} else {
			summary.Set("workflow_job_template", NewOMap().Set("id", n.WorkflowID).Set("name", wf.Name).Set("description", wf.Description).Set("allow_force_node_success_on_relaunch", wf.AllowForce))
		}
		if hasTemplate {
			ts := NewOMap().Set("id", tb.ID).Set("name", tb.Name).Set("description", tb.Description).Set("unified_job_type", tb.Type)
			if a, ok := approvals[tb.ID]; ok && !job {
				ts.Set("timeout", a.Timeout).Set("required_approvals", a.Required).Set("on_timeout", a.OnTimeout).Set("context_template", a.Ctx)
			}
			summary.Set("unified_job_template", ts)
		}
		if job {
			if u := c.UserSummary(n.ForcedSuccessByID); u != nil {
				summary.Set("forced_success_by", u)
			}
			if n.ForcedSuccessJobID != nil {
				if fb, ok := briefs[*n.ForcedSuccessJobID]; ok {
					summary.Set("forced_success_job", NewOMap().Set("id", fb.ID).Set("name", fb.Name).Set("description", fb.Description).Set("status", fb.Status).Set("failed", fb.Failed).Set("elapsed", fb.Elapsed).Set("type", fb.Type))
				}
			}
		}

		o := NewOMap().Set("id", n.ID).Set("type", typ).Set("url", URLFor(coll, n.ID)).Set("related", related).Set("summary_fields", summary)
		o.Set("created", models.FormatTime(n.Created)).Set("modified", models.FormatTime(n.Modified))
		o.Set("extra_data", displayNodeExtraData(n)).Set("inventory", models.NullableID(n.InventoryID))
		for _, k := range []string{"scm_branch", "job_type", "job_tags", "skip_tags", "limit", "diff_mode", "verbosity"} {
			o.Set(k, nullableString(n.CharPrompts, k))
		}
		o.Set("execution_environment", models.NullableID(n.ExecutionEnvironmentID))
		for _, k := range []string{"forks", "job_slice_count", "timeout"} {
			o.Set(k, nullableString(n.CharPrompts, k))
		}
		if job {
			o.Set("job", models.NullableID(n.JobID)).Set("workflow_job", n.WorkflowID)
		} else {
			o.Set("workflow_job_template", n.WorkflowID)
		}
		o.Set("unified_job_template", models.NullableID(n.UnifiedJobTemplateID))
		e := edges[n.ID]
		conds := make([]any, 0, len(e.Conditions))
		for _, cd := range e.Conditions {
			conds = append(conds, NewOMap().Set("id", cd.To).Set("trigger", cd.Trigger).Set("artifact_key", cd.ArtifactKey).Set("operator", cd.Operator).Set("expected_value", cd.Expected))
		}
		o.Set("success_nodes", idList(e.Success)).Set("failure_nodes", idList(e.Failure)).Set("always_nodes", idList(e.Always)).Set("condition_nodes", idList(e.Condition)).Set("condition_edges", conds)
		o.Set("all_parents_must_converge", n.AllParentsMustConverge)
		if job {
			o.Set("do_not_run", n.DoNotRun).Set("prior_run_succeeded", n.PriorRunSucceeded).Set("prior_run_elapsed", n.PriorRunElapsed)
			o.Set("forced_success", n.ForcedSuccess).Set("forced_success_reason", n.ForcedSuccessReason)
			o.Set("forced_success_by", models.NullableID(n.ForcedSuccessByID)).Set("forced_success_job", models.NullableID(n.ForcedSuccessJobID))
			o.Set("max_retries", n.MaxRetries).Set("retry_attempts", n.RetryAttempts).Set("retried_jobs", idList(retried[n.ID]))
		} else {
			o.Set("max_retries", n.MaxRetries)
		}
		o.Set("identifier", n.Identifier)
		out = append(out, o)
	}
	return out, nil
}

// --- create / update / delete ------------------------------------------------------

// wfjtAdmin is WorkflowJobTemplateNodeAccess.wfjt_admin.
func (s *Server) wfjtAdmin(c *SerCtx, t *models.WorkflowJobTemplate) bool {
	return c.User.IsSuperuser || c.HasRole(t.AdminRoleID)
}

func nodeChanges(n *models.WorkflowNode) map[string]any {
	return map[string]any{"id": n.ID, "identifier": n.Identifier, "workflow_job_template": n.WorkflowID, "unified_job_template": n.UnifiedJobTemplateID,
		"all_parents_must_converge": n.AllParentsMustConverge, "max_retries": n.MaxRetries, "char_prompts": n.CharPrompts, "extra_data": maskCiphertext(n.ExtraData)}
}

// templateNodeSave creates (existing nil) or updates a template node from
// the request body; wfjtID forces the parent template (sub-lists).
func (s *Server) templateNodeSave(r *http.Request, existing *models.WorkflowNode, wfjtID *int64) (*models.WorkflowNode, *models.WorkflowJobTemplate, error) {
	return s.templateNodeSaveThen(r, existing, wfjtID, nil)
}

// templateNodeSaveThen is templateNodeSave with then run in its
// transaction after the node is written: a node created on a parent's
// sub-list is linked in the same transaction (ATOMIC_REQUESTS).
func (s *Server) templateNodeSaveThen(r *http.Request, existing *models.WorkflowNode, wfjtID *int64, then func(tx pgx.Tx, n *models.WorkflowNode) error) (*models.WorkflowNode, *models.WorkflowJobTemplate, error) {
	u, err := RequireWrite(r)
	if err != nil {
		return nil, nil, err
	}
	body, err := ReadBody(r)
	if err != nil {
		return nil, nil, err
	}
	ctx := r.Context()
	partial := r.Method == http.MethodPatch
	f := NewForm(body, partial)
	c := s.NewSerCtx(r, true)
	n := &models.WorkflowNode{CharPrompts: map[string]any{}, SurveyPasswords: map[string]any{}, ExtraData: "{}"}
	if existing != nil {
		cp := *existing
		n = &cp
		n.CharPrompts = map[string]any{}
		for k, v := range existing.CharPrompts {
			n.CharPrompts[k] = v
		}
	}
	var t *models.WorkflowJobTemplate
	if existing != nil {
		t, err = models.GetWorkflowJobTemplate(ctx, s.Q(), existing.WorkflowID)
		if err != nil {
			return nil, nil, err
		}
	} else {
		if wfjtID != nil {
			body.Set("workflow_job_template", json.Number(itoa(*wfjtID)))
		}
		id, _ := f.ID("workflow_job_template", nil, true, func(id int64) bool {
			wt, err := models.GetWorkflowJobTemplate(ctx, s.Q(), id)
			if err != nil {
				return false
			}
			t = wt
			return true
		})
		if id != nil && t != nil {
			n.WorkflowID = *id
		}
	}
	ujtGiven := f.Has("unified_job_template")
	if id, set := f.ID("unified_job_template", n.UnifiedJobTemplateID, false, s.existsIn(ctx, "main_unifiedjobtemplate")); set {
		n.UnifiedJobTemplateID = id
	}
	if f.Has("identifier") {
		v := f.String("identifier", false, 512, n.Identifier)
		if strings.TrimSpace(v) == "" {
			f.Errs.Add("identifier", "This field may not be blank.")
		} else {
			n.Identifier = v
		}
	}
	n.AllParentsMustConverge = f.Bool("all_parents_must_converge", n.AllParentsMustConverge)
	zero, hundred := int64(0), int64(100)
	n.MaxRetries = f.Int("max_retries", n.MaxRetries, &zero, &hundred)
	in := &scheduleInput{fields: map[string]bool{}, prompts: map[string]any{}, req: &launchRequest{}}
	for _, k := range body.Keys() {
		in.fields[k] = true
	}
	inv, ee := n.InventoryID, n.ExecutionEnvironmentID
	s.launchConfigFromForm(ctx, f, in, &inv, &ee)
	if err := f.Err(); err != nil {
		return nil, nil, err
	}
	if t == nil {
		return nil, nil, FieldErrors{"workflow_job_template": {"This field is required."}}.Err()
	}
	if !s.wfjtAdmin(c, t) {
		return nil, nil, ErrForbidden
	}
	if n.UnifiedJobTemplateID != nil && (ujtGiven || existing == nil) && !s.canStartTemplate(ctx, s.Q(), c, *n.UnifiedJobTemplateID) {
		return nil, nil, ErrForbidden
	}
	if existing != nil && existing.UnifiedJobTemplateID != nil && !s.canStartTemplate(ctx, s.Q(), c, *existing.UnifiedJobTemplateID) {
		return nil, nil, ErrForbidden
	}
	if n.UnifiedJobTemplateID != nil {
		// prompts only make sense against a template
		n.InventoryID, n.ExecutionEnvironmentID = inv, ee
		if !c.User.IsSuperuser {
			if in.fields["inventory"] && inv != nil && !c.HasRoleOn("main.inventory", *inv, "use_role") {
				return nil, nil, ErrForbidden
			}
			if in.fields["execution_environment"] && ee != nil && !s.eeReadable(c, *ee) {
				return nil, nil, ErrForbidden
			}
		}
		tmpl, err := s.loadScheduleTemplate(ctx, *n.UnifiedJobTemplateID)
		if err != nil {
			return nil, nil, err
		}
		in.applyCharDefaults(partial)
		in.applyPrompts(n.CharPrompts)
		mock := &launchConfigMock{dbExtra: map[string]any{}, surveyPasswords: n.SurveyPasswords}
		if existing != nil {
			if mock, err = s.storedLaunchConfig(ctx, launchConfigTables{"main_workflowjobtemplatenode_credentials", "main_workflowjobtemplatenode_labels",
				"main_workflowjobtemplatenodebaseinstancegroupmembership", "workflowjobtemplatenode_id"}, existing.ID, existing.ExtraData, existing.SurveyPasswords); err != nil {
				return nil, nil, err
			}
		}
		mock.chars, mock.inventory, mock.ee = n.CharPrompts, n.InventoryID, n.ExecutionEnvironmentID
		// unified_job_template in the request re-validates the whole
		// configuration (exclude_errors = ('required',)).
		res, err := s.validateLaunchConfig(ctx, tmpl, in, mock, ujtGiven, true)
		if err != nil {
			return nil, nil, err
		}
		if res.surveyPasswords != nil {
			n.SurveyPasswords = res.surveyPasswords
		}
		if res.extra != nil {
			b, _ := json.Marshal(res.extra)
			n.ExtraData = string(b)
		}
	}
	var taken bool
	if n.Identifier != "" {
		_ = db.Tolerant(s.Q()).QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM main_workflowjobtemplatenode WHERE workflow_job_template_id = $1 AND identifier = $2 AND id <> $3)`, n.WorkflowID, n.Identifier, n.ID).Scan(&taken)
	}
	if taken {
		return nil, nil, FieldErrors{"__all__": {"The fields identifier, workflow_job_template must make a unique set."}}.Err()
	}
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		op := "update"
		var oldApproval *int64
		if existing == nil {
			op = "create"
			if err := models.InsertTemplateNode(ctx, tx, n); err != nil {
				return err
			}
		} else {
			oldApproval = existing.UnifiedJobTemplateID
			if err := models.UpdateTemplateNode(ctx, tx, n); err != nil {
				return err
			}
		}
		if oldApproval != nil && (n.UnifiedJobTemplateID == nil || *oldApproval != *n.UnifiedJobTemplateID) {
			if err := s.deleteIfOrphanApproval(ctx, tx, *oldApproval); err != nil {
				return err
			}
		}
		if err := s.Activity.Record(ctx, tx, activity.Entry{Operation: op, Object1: "workflow_job_template_node", Changes: nodeChanges(n), ActorID: &u.ID, Links: map[string]int64{"workflow_job_template_node": n.ID}}); err != nil {
			return err
		}
		if then != nil {
			return then(tx, n)
		}
		return nil
	})
	if err != nil {
		return nil, nil, err
	}
	return n, t, nil
}

func (s *Server) deleteIfOrphanApproval(ctx context.Context, tx pgx.Tx, id int64) error {
	if isApproval, err := db.Exists(ctx, tx, `SELECT 1 FROM main_workflowapprovaltemplate WHERE unifiedjobtemplate_ptr_id = $1`, id); err != nil || !isApproval {
		return err
	}
	return models.DeleteOrphanApprovalTemplates(ctx, tx, s.Cascade, []int64{id})
}

func (s *Server) writeNode(w http.ResponseWriter, r *http.Request, n *models.WorkflowNode, status int) error {
	results, err := s.serializeWorkflowNodes(s.NewSerCtx(r, true), []*models.WorkflowNode{n}, false)
	if err != nil {
		return err
	}
	if status == http.StatusCreated {
		w.Header().Set("Location", URLFor("workflow_job_template_nodes", n.ID))
	}
	WriteJSON(w, status, results[0])
	return nil
}

func (s *Server) templateNodeCreate(w http.ResponseWriter, r *http.Request) error {
	n, _, err := s.templateNodeSave(r, nil, nil)
	if err != nil {
		return err
	}
	return s.writeNode(w, r, n, http.StatusCreated)
}

func (s *Server) workflowJobTemplateWorkflowNodeCreate(w http.ResponseWriter, r *http.Request) error {
	_, t, err := workflowJobTemplateObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	n, _, err := s.templateNodeSave(r, nil, &t.ID)
	if err != nil {
		return err
	}
	return s.writeNode(w, r, n, http.StatusCreated)
}

func (s *Server) templateNodeUpdate(w http.ResponseWriter, r *http.Request) error {
	_, nt, err := templateNodeObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	existing := nt.n
	n, _, err := s.templateNodeSave(r, existing, nil)
	if err != nil {
		return err
	}
	return s.writeNode(w, r, n, 200)
}

func (s *Server) templateNodeDelete(w http.ResponseWriter, r *http.Request) error {
	u, nt, err := templateNodeObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	n, t := nt.n, nt.wf
	c := s.NewSerCtx(r, true)
	if !s.wfjtAdmin(c, t) {
		return ErrForbidden
	}
	ctx := r.Context()
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if err := s.Activity.Record(ctx, tx, activity.Entry{Operation: "delete", Object1: "workflow_job_template_node", Changes: nodeChanges(n), ActorID: &u.ID}); err != nil {
			return err
		}
		if err := s.Cascade.Delete(ctx, tx, "main_workflowjobtemplatenode", "id", []int64{n.ID}); err != nil {
			return err
		}
		if n.UnifiedJobTemplateID != nil {
			return s.deleteIfOrphanApproval(ctx, tx, *n.UnifiedJobTemplateID)
		}
		return nil
	})
	if err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// --- edges -----------------------------------------------------------------------

// templateNodeChildrenPost creates a child node, or attaches or detaches
// an existing one, on one of a node's edge lists
// (WorkflowJobTemplateNodeChildrenBaseList).
func (s *Server) templateNodeChildrenPost(w http.ResponseWriter, r *http.Request, kind string) error {
	_, nt, err := templateNodeObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	parent, t := nt.n, nt.wf
	c := s.NewSerCtx(r, true)
	ctx := r.Context()
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	// the body is read again by templateNodeSave when a node is created
	raw, _ := json.Marshal(body)
	condition := conditionData(body)
	if !body.Has("id") {
		// sub-list create: the new node joins the parent's template
		if !s.wfjtAdmin(c, t) {
			return ErrForbidden
		}
		if kind == "condition_nodes" {
			if err := validateCondition(condition); err != nil {
				return err
			}
		}
		r2 := r.Clone(ctx)
		r2.Body = ioNopCloser(raw)
		r2.Method = http.MethodPost
		n, _, err := s.templateNodeSaveThen(r2, nil, &t.ID, func(tx pgx.Tx, n *models.WorkflowNode) error {
			return s.linkNodes(ctx, tx, kind, parent.ID, n.ID, condition)
		})
		if err != nil {
			return err
		}
		return s.writeNode(w, r, n, http.StatusCreated)
	}
	detach := isDetach(body)
	subID, aerr := attachID(body, "Workflow Job Template Node", detach)
	if aerr != nil {
		return aerr
	}
	sub, err := models.GetTemplateNode(ctx, s.Q(), subID)
	if err != nil {
		if db.IsNoRows(err) {
			return BadRequest("WorkflowJobTemplateNode matching query does not exist.")
		}
		return err
	}
	if !s.wfjtAdmin(c, t) {
		return ErrForbidden
	}
	if detach {
		if kind == "condition_nodes" {
			_, err = s.Q().Exec(ctx, `DELETE FROM main_workflowjobtemplatenodeconditionlink WHERE from_node_id = $1 AND to_node_id = $2`, parent.ID, sub.ID)
		} else {
			_, err = s.Q().Exec(ctx, `DELETE FROM main_workflowjobtemplatenode_`+kind+` WHERE from_workflowjobtemplatenode_id = $1 AND to_workflowjobtemplatenode_id = $2`, parent.ID, sub.ID)
		}
		if err != nil {
			return err
		}
		w.WriteHeader(http.StatusNoContent)
		return nil
	}
	if sub.WorkflowID != parent.WorkflowID {
		return ErrForbidden
	}
	if kind == "condition_nodes" {
		if err := validateCondition(condition); err != nil {
			return err
		}
	}
	if parent.ID == sub.ID {
		return &APIError{Status: http.StatusBadRequest, Body: map[string]any{"Error": "Cycle detected."}}
	}
	edges, err := models.LoadNodeEdges(ctx, s.Q(), models.TemplateNodeTables, []int64{parent.ID})
	if err != nil {
		return err
	}
	pe := edges[parent.ID]
	others := map[string][]int64{"success_nodes": pe.Success, "failure_nodes": pe.Failure, "always_nodes": pe.Always, "condition_nodes": pe.Condition}
	for k, list := range others {
		if k == kind {
			continue
		}
		for _, x := range list {
			if x == sub.ID {
				return &APIError{Status: http.StatusBadRequest, Body: map[string]any{"Error": "Relationship not allowed."}}
			}
		}
	}
	cyclic, err := s.templateEdgeMakesCycle(ctx, parent.WorkflowID, parent.ID, sub.ID)
	if err != nil {
		return err
	}
	if cyclic {
		return &APIError{Status: http.StatusBadRequest, Body: map[string]any{"Error": "Cycle detected."}}
	}
	if err := s.DB.Tx(ctx, func(tx pgx.Tx) error { return s.linkNodes(ctx, tx, kind, parent.ID, sub.ID, condition) }); err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

type edgeCondition struct {
	Trigger, ArtifactKey, Operator, Expected string
	keyOK                                    bool
}

// conditionData reads the condition fields of a conditional link
// (_condition_data): non-string expected values are stored as JSON.
func conditionData(body *OMap) edgeCondition {
	c := edgeCondition{Trigger: "success", Operator: "eq"}
	if v, ok := body.Get("trigger"); ok {
		if sv, ok := v.(string); ok && sv != "" {
			c.Trigger = sv
		}
	}
	if v, ok := body.Get("operator"); ok {
		if sv, ok := v.(string); ok && sv != "" {
			c.Operator = sv
		}
	}
	if v, ok := body.Get("artifact_key"); ok {
		if sv, ok := v.(string); ok {
			c.ArtifactKey, c.keyOK = sv, sv != ""
		}
	}
	if v, ok := body.Get("expected_value"); ok && v != nil {
		if sv, ok := v.(string); ok {
			c.Expected = sv
		} else {
			b, _ := json.Marshal(plainValue(v))
			c.Expected = string(b)
		}
	} else if ok && v == nil {
		c.Expected = "null"
	}
	return c
}

func validateCondition(c edgeCondition) error {
	if !c.keyOK {
		return FieldErrors{"artifact_key": {"A non-empty artifact_key is required for a conditional link."}}.Err()
	}
	if c.Operator != "eq" && c.Operator != "ne" {
		return FieldErrors{"operator": {"Invalid operator. Valid choices are: eq, ne."}}.Err()
	}
	if c.Trigger != "success" && c.Trigger != "failure" && c.Trigger != "always" {
		return FieldErrors{"trigger": {"Invalid trigger. Valid choices are: success, failure, always."}}.Err()
	}
	return nil
}

// linkNodes adds an edge; re-posting a conditional edge updates its condition.
func (s *Server) linkNodes(ctx context.Context, q db.Querier, kind string, from, to int64, c edgeCondition) error {
	if kind == "condition_nodes" {
		tag, err := q.Exec(ctx, `UPDATE main_workflowjobtemplatenodeconditionlink SET trigger = $3, artifact_key = $4, operator = $5, expected_value = $6 WHERE from_node_id = $1 AND to_node_id = $2`,
			from, to, c.Trigger, c.ArtifactKey, c.Operator, c.Expected)
		if err != nil {
			return err
		}
		if tag.RowsAffected() > 0 {
			return nil
		}
		_, err = q.Exec(ctx, `INSERT INTO main_workflowjobtemplatenodeconditionlink (from_node_id, to_node_id, trigger, artifact_key, operator, expected_value) VALUES ($1, $2, $3, $4, $5, $6)`,
			from, to, c.Trigger, c.ArtifactKey, c.Operator, c.Expected)
		return err
	}
	_, err := q.Exec(ctx, `INSERT INTO main_workflowjobtemplatenode_`+kind+` (from_workflowjobtemplatenode_id, to_workflowjobtemplatenode_id)
		SELECT $1, $2 WHERE NOT EXISTS (SELECT 1 FROM main_workflowjobtemplatenode_`+kind+` WHERE from_workflowjobtemplatenode_id = $1 AND to_workflowjobtemplatenode_id = $2)`, from, to)
	return err
}

// templateEdgeMakesCycle reports whether adding from->to creates a cycle
// in the template's graph (WorkflowDAG.has_cycle).
func (s *Server) templateEdgeMakesCycle(ctx context.Context, wfjtID, from, to int64) (bool, error) {
	ids, err := models.ScanIDs(ctx, s.Q(), `SELECT id FROM main_workflowjobtemplatenode WHERE workflow_job_template_id = $1`, wfjtID)
	if err != nil {
		return false, err
	}
	edges, err := models.LoadNodeEdges(ctx, s.Q(), models.TemplateNodeTables, ids)
	if err != nil {
		return false, err
	}
	children := map[int64][]int64{}
	for id, e := range edges {
		children[id] = append(append(append(append([]int64{}, e.Success...), e.Failure...), e.Always...), e.Condition...)
	}
	children[from] = append(children[from], to)
	// a cycle exists when "from" is reachable from "to"
	seen := map[int64]bool{}
	stack := []int64{to}
	for len(stack) > 0 {
		n := stack[len(stack)-1]
		stack = stack[:len(stack)-1]
		if n == from {
			return true, nil
		}
		if seen[n] {
			continue
		}
		seen[n] = true
		stack = append(stack, children[n]...)
	}
	return false, nil
}

// --- credentials, labels, instance groups -------------------------------------------

func (s *Server) nodeCredentialsList(w http.ResponseWriter, r *http.Request, tables models.NodeTables, nodeID int64) error {
	spec := s.credentialSpec()
	// Only the credentials the user may read, as the old
	// LaunchConfigCredentialsBase and WorkflowJobNodeCredentialsList showed
	// (filter_read_permission stayed on there).
	spec.DefaultOrder = []string{"id"}
	creds, count, page, err := runListOf(s, r, spec, func(q *Query) {
		q.AddJoin("JOIN " + tables.Credentials + " ncl ON ncl.credential_id = c.id")
		q.And("ncl." + tables.NodeCol + " = " + q.Arg(nodeID))
	}, models.ScanCredential)
	if err != nil {
		return err
	}
	results, err := s.serializeCredentials(s.NewSerCtx(r, false), creds)
	if err != nil {
		return err
	}
	WriteJSON(w, 200, Paginate(r, page, count, results))
	return nil
}

func (s *Server) nodeInstanceGroupsList(w http.ResponseWriter, r *http.Request, tables models.NodeTables, nodeID int64) error {
	return s.orderedInstanceGroups(w, r, tables.IGs, tables.NodeCol, nodeID, true)
}

func (s *Server) templateNodeCredentials(w http.ResponseWriter, r *http.Request) error {
	_, nt, err := templateNodeObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	n := nt.n
	return s.nodeCredentialsList(w, r, models.TemplateNodeTables, n.ID)
}

func (s *Server) templateNodeLabels(w http.ResponseWriter, r *http.Request) error {
	_, nt, err := templateNodeObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	n := nt.n
	return s.labelListWith(w, r, func(q *Query) {
		q.AddJoin("JOIN main_workflowjobtemplatenode_labels nll ON nll.label_id = l.id")
		q.And("nll.workflowjobtemplatenode_id = " + q.Arg(n.ID))
	})
}

func (s *Server) templateNodeInstanceGroups(w http.ResponseWriter, r *http.Request) error {
	_, nt, err := templateNodeObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	n := nt.n
	return s.nodeInstanceGroupsList(w, r, models.TemplateNodeTables, n.ID)
}

// templateNodeCredentialsAttach follows the saved launch configuration
// rules (LaunchConfigCredentialsBase), as schedules do.
func (s *Server) templateNodeCredentialsAttach(w http.ResponseWriter, r *http.Request) error {
	_, nt, err := templateNodeObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	n, t := nt.n, nt.wf
	c := s.NewSerCtx(r, true)
	// WorkflowJobTemplateNodeAccess.can_attach: admin of the workflow and
	// able to start the node's template (ujt_execute), as saving the node
	// requires.
	if !s.wfjtAdmin(c, t) || (n.UnifiedJobTemplateID != nil && !s.canStartTemplate(r.Context(), s.Q(), c, *n.UnifiedJobTemplateID)) {
		return ErrForbidden
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	return s.launchConfigCredentialAttach(w, r, c, body, n.UnifiedJobTemplateID, launchConfigCredentials{"main_workflowjobtemplatenode_credentials", "workflowjobtemplatenode_id", "workflow_job_template_node", nodeCredentialsRel}, n.ID)
}

func (s *Server) templateNodeLabelsAttach(w http.ResponseWriter, r *http.Request) error {
	_, nt, err := templateNodeObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	return s.labelsAttach(w, r, c, func() bool { return s.wfjtAdmin(c, nt.wf) }, templateNodeLabels, nt.n.ID, "workflow job template node")
}

func (s *Server) templateNodeInstanceGroupsAttach(w http.ResponseWriter, r *http.Request) error {
	u, nt, err := templateNodeObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	if !s.wfjtAdmin(c, nt.wf) {
		return ErrForbidden
	}
	return s.instanceGroupLink(w, r, u, orderedLink{Table: "main_workflowjobtemplatenodebaseinstancegroupmembership", OwnerCol: "workflowjobtemplatenode_id", Owner: nt.n.ID,
		Object1: "workflow_job_template_node", Relationship: nodeInstanceGroupRel}, func(g *instanceGroup) bool { return u.IsSuperuser || c.HasRole(g.UseRoleID) })
}

func (s *Server) jobNodeCredentials(w http.ResponseWriter, r *http.Request) error {
	_, nt, err := jobNodeObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	n := nt.n
	return s.nodeCredentialsList(w, r, models.JobNodeTables, n.ID)
}

func (s *Server) jobNodeLabels(w http.ResponseWriter, r *http.Request) error {
	_, nt, err := jobNodeObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	n := nt.n
	return s.labelListWith(w, r, func(q *Query) {
		q.AddJoin("JOIN main_workflowjobnode_labels nll ON nll.label_id = l.id")
		q.And("nll.workflowjobnode_id = " + q.Arg(n.ID))
	})
}

func (s *Server) jobNodeInstanceGroups(w http.ResponseWriter, r *http.Request) error {
	_, nt, err := jobNodeObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	n := nt.n
	return s.nodeInstanceGroupsList(w, r, models.JobNodeTables, n.ID)
}

// --- approval templates on nodes ---------------------------------------------------

func (s *Server) createApprovalTemplateView(w http.ResponseWriter, r *http.Request) error {
	if _, _, err := templateNodeObj.fromPath(s, r, false); err != nil {
		return err
	}
	WriteJSON(w, 200, map[string]any{})
	return nil
}

var onTimeoutChoices = [][2]string{{"", "---------"}, {"deny", "Deny"}, {"approve", "Approve"}}

// approvalTemplateFromForm reads WorkflowApprovalTemplate fields.
func approvalTemplateFromForm(f *Form, a *models.WorkflowApprovalTemplate) {
	a.Name = f.String("name", true, 512, a.Name)
	a.Description = f.String("description", false, 0, a.Description)
	minInt, maxInt := int64(-2147483648), int64(2147483647)
	a.Timeout = f.Int("timeout", a.Timeout, &minInt, &maxInt)
	zero := int64(0)
	a.RequiredApprovals = f.Int("required_approvals", a.RequiredApprovals, &zero, &maxInt)
	a.OnTimeout = f.Choice("on_timeout", a.OnTimeout, onTimeoutChoices, false)
	a.ContextTemplate = f.String("context_template", false, 0, a.ContextTemplate)
}

// createApprovalTemplate makes the node an approval node
// (WorkflowJobTemplateNodeCreateApproval).
func (s *Server) createApprovalTemplate(w http.ResponseWriter, r *http.Request) error {
	_, nt, err := templateNodeObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	n, t := nt.n, nt.wf
	c := s.NewSerCtx(r, true)
	if !s.wfjtAdmin(c, t) {
		return ErrForbidden
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	f := NewForm(body, false)
	a := &models.WorkflowApprovalTemplate{RequiredApprovals: 1, OnTimeout: "deny", CreatedByID: &c.User.ID, ModifiedByID: &c.User.ID}
	approvalTemplateFromForm(f, a)
	if err := f.Err(); err != nil {
		return err
	}
	ctx := r.Context()
	old := n.UnifiedJobTemplateID
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if err := models.InsertWorkflowApprovalTemplate(ctx, tx, a, s.CT); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE main_workflowjobtemplatenode SET unified_job_template_id = $2, modified = now() WHERE id = $1`, n.ID, a.ID); err != nil {
			return err
		}
		if old != nil {
			if err := s.deleteIfOrphanApproval(ctx, tx, *old); err != nil {
				return err
			}
		}
		return s.Activity.Record(ctx, tx, activity.Entry{Operation: "create", Object1: "workflow_approval_template", Changes: map[string]any{"name": a.Name, "description": a.Description, "timeout": a.Timeout, "id": a.ID},
			ActorID: &c.User.ID, Links: map[string]int64{"workflow_approval_template": a.ID, "unified_job_template": a.ID}})
	})
	if err != nil {
		return err
	}
	full, err := models.GetWorkflowApprovalTemplate(ctx, s.Q(), a.ID)
	if err != nil {
		return err
	}
	o, err := s.serializeApprovalTemplate(c, full)
	if err != nil {
		return err
	}
	WriteJSON(w, http.StatusCreated, o)
	return nil
}
