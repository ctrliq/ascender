package api

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"

	"errors"
	"github.com/ctrliq/ascender/internal/activity"
	"github.com/ctrliq/ascender/internal/auth"
	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/models"
)

// Workflow approvals, their templates and the votes cast on them
// (WorkflowApprovalSerializer, WorkflowApprovalTemplateSerializer,
// WorkflowApprovalVoteSerializer and their views).

func (s *Server) registerWorkflowApprovals(mux *http.ServeMux) {
	s.route(mux, "/api/v2/workflow_approvals/{$}", methodMap{"GET": s.approvalList}, s.optionsFor("workflow_approvals"))
	s.route(mux, "/api/v2/workflow_approvals/{id}/{$}", methodMap{"GET": s.approvalDetail, "DELETE": s.approvalDelete}, s.optionsFor("workflow_approvals"))
	s.route(mux, "/api/v2/workflow_approvals/{id}/approve/{$}", methodMap{"GET": s.approvalVoteView, "POST": func(w http.ResponseWriter, r *http.Request) error { return s.approvalVote(w, r, "approve") }}, nil)
	s.route(mux, "/api/v2/workflow_approvals/{id}/deny/{$}", methodMap{"GET": s.approvalVoteView, "POST": func(w http.ResponseWriter, r *http.Request) error { return s.approvalVote(w, r, "deny") }}, nil)
	s.route(mux, "/api/v2/workflow_approvals/{id}/votes/{$}", methodMap{"GET": s.approvalVotes}, s.optionsFor("workflow_approval_votes"))
	s.route(mux, "/api/v2/workflow_approval_templates/{id}/{$}", methodMap{"GET": s.approvalTemplateDetail, "PUT": s.approvalTemplateUpdate, "PATCH": s.approvalTemplateUpdate, "DELETE": s.approvalTemplateDelete}, s.optionsExact("workflow_approval_templates"))
	s.route(mux, "/api/v2/workflow_approval_templates/{id}/approvals/{$}", methodMap{"GET": s.approvalTemplateApprovals}, s.optionsFor("workflow_approvals"))
	s.route(mux, "/api/v2/workflow_approval_votes/{$}", methodMap{"GET": s.voteList}, s.optionsFor("workflow_approval_votes"))
	s.route(mux, "/api/v2/workflow_approval_votes/{id}/{$}", methodMap{"GET": s.voteDetail}, s.optionsFor("workflow_approval_votes"))
}

// approval is a workflow approval with what its serializer reads.
type approval struct {
	models.UnifiedJob
	TemplateID         *int64
	Timeout            int64
	Expires            *time.Time
	TimedOut           bool
	RequiredApprovals  int64
	OnTimeout          string
	ApprovedByID       *int64
	ContextMessage     string
	WorkflowJobID      *int64
	WorkflowJobName    string
	WorkflowJobDesc    string
	WFJTID             *int64
	WFJTName, WFJTDesc string
	WFJTAllowForce     bool
	WFJTApprovalRole   *int64
}

const approvalColumns = models.UnifiedJobColumns + `, a.workflow_approval_template_id, a.timeout, a.expires, a.timed_out, a.required_approvals, a.on_timeout, a.approved_or_denied_by_id,
	a.context_message, wn.workflow_job_id, COALESCE(wju.name, ''), COALESCE(wju.description, ''), wfj.workflow_job_template_id, COALESCE(wft.name, ''), COALESCE(wft.description, ''),
	COALESCE(wf.allow_force_node_success_on_relaunch, false), wf.approval_role_id`

const approvalFrom = `main_workflowapproval a JOIN main_unifiedjob uj ON uj.id = a.unifiedjob_ptr_id
	LEFT JOIN main_workflowjobnode wn ON wn.job_id = uj.id
	LEFT JOIN main_unifiedjob wju ON wju.id = wn.workflow_job_id
	LEFT JOIN main_workflowjob wfj ON wfj.unifiedjob_ptr_id = wn.workflow_job_id
	LEFT JOIN main_unifiedjobtemplate wft ON wft.id = wfj.workflow_job_template_id
	LEFT JOIN main_workflowjobtemplate wf ON wf.unifiedjobtemplate_ptr_id = wfj.workflow_job_template_id`

func scanApproval(rows pgx.Row) (*approval, error) {
	a := &approval{}
	j := &a.UnifiedJob
	err := rows.Scan(&j.ID, &j.Created, &j.Modified, &j.Name, &j.Description, &j.LaunchType, &j.CancelFlag, &j.Status, &j.Failed, &j.Started, &j.Finished, &j.Elapsed,
		&j.JobArgs, &j.JobCwd, &j.JobExplanation, &j.StartArgs, &j.ResultTraceback, &j.CeleryTaskID,
		&j.CreatedByID, &j.ModifiedByID, &j.PolymorphicCtypeID, &j.ScheduleID, &j.UnifiedJobTemplateID, &j.ExecutionNode, &j.InstanceGroupID,
		&j.EmittedEvents, &j.ControllerNode, &j.CanceledOn, &j.DependenciesProcessed, &j.OrganizationID, &j.ExecutionEnvironmentID,
		&j.InstalledCollections, &j.AnsibleVersion, &j.WorkUnitID, &j.HostStatusCounts, &j.TaskImpact, &j.JobEnv,
		&a.TemplateID, &a.Timeout, &a.Expires, &a.TimedOut, &a.RequiredApprovals, &a.OnTimeout, &a.ApprovedByID, &a.ContextMessage,
		&a.WorkflowJobID, &a.WorkflowJobName, &a.WorkflowJobDesc, &a.WFJTID, &a.WFJTName, &a.WFJTDesc, &a.WFJTAllowForce, &a.WFJTApprovalRole)
	return a, err
}

var approvalFields = func() *FieldSet {
	fs := unifiedJobListFields.With(map[string]Field{
		"timeout": {SQL: "a.timeout", Kind: KindInt}, "timed_out": {SQL: "a.timed_out", Kind: KindBool}, "expires": {SQL: "a.expires", Kind: KindDateTime},
		"required_approvals": {SQL: "a.required_approvals", Kind: KindInt}, "on_timeout": {SQL: "a.on_timeout"},
		"workflow_approval_template": {SQL: "a.workflow_approval_template_id", Kind: KindFK}, "approved_or_denied_by": {SQL: "a.approved_or_denied_by_id", Kind: KindFK},
	})
	fs.Model, fs.SearchFields = "WorkflowApproval", []string{"description", "name"}
	return fs
}()

func (s *Server) approvalAccess(q *Query, u *auth.User) {
	q.And("wfj.workflow_job_template_id IN (" + accessibleSQL(q, u.ID, s.CT.ID("main.workflowjobtemplate"), "read_role") + ")")
}

func (s *Server) approvalListWith(w http.ResponseWriter, r *http.Request, extra func(q *Query)) error {
	if _, err := RequireUser(r); err != nil {
		return err
	}
	spec := ListSpec{Model: "WorkflowApproval", From: approvalFrom, Columns: approvalColumns, PK: "uj.id", Fields: approvalFields, DefaultOrder: []string{"id"}, Access: s.approvalAccess}
	list, count, page, err := runListOf(s, r, spec, extra, scanApproval)
	if err != nil {
		return err
	}
	results, err := s.serializeApprovals(s.NewSerCtx(r, false), list, false)
	if err != nil {
		return err
	}
	WriteJSON(w, 200, Paginate(r, page, count, results))
	return nil
}

func (s *Server) approvalList(w http.ResponseWriter, r *http.Request) error {
	return s.approvalListWith(w, r, nil)
}

func (s *Server) loadApprovalFor(r *http.Request, id int64) (*approval, *SerCtx, error) {
	u, err := RequireUser(r)
	if err != nil {
		return nil, nil, err
	}
	a, err := scanApproval(s.Q().QueryRow(r.Context(), `SELECT `+approvalColumns+` FROM `+approvalFrom+` WHERE uj.id = $1`, id))
	if err != nil {
		if db.IsNoRows(err) {
			return nil, nil, NotFoundFor("WorkflowApproval")
		}
		return nil, nil, err
	}
	c := s.NewSerCtx(r, true)
	if !u.IsSuperuser && !u.IsSystemAuditor && (a.WFJTID == nil || !c.HasRoleOn("main.workflowjobtemplate", *a.WFJTID, "read_role")) {
		return nil, nil, ErrForbidden
	}
	return a, c, nil
}

func (s *Server) approvalFromPath(r *http.Request) (*approval, *SerCtx, error) {
	id, err := PathID(r)
	if err != nil {
		return nil, nil, NotFoundFor("WorkflowApproval")
	}
	return s.loadApprovalFor(r, id)
}

func (s *Server) approvalDetail(w http.ResponseWriter, r *http.Request) error {
	a, c, err := s.approvalFromPath(r)
	if err != nil {
		return err
	}
	results, err := s.serializeApprovals(c, []*approval{a}, true)
	if err != nil {
		return err
	}
	WriteJSON(w, 200, results[0])
	return nil
}

// approvalCanVote is WorkflowApprovalAccess.can_approve_or_deny.
func (s *Server) approvalCanVote(c *SerCtx, a *approval) bool {
	return c.User.IsSuperuser || (a.WFJTApprovalRole != nil && c.HasRole(a.WFJTApprovalRole))
}

type voteRow struct {
	ID                                  int64
	Created                             time.Time
	ApprovalID, UserID                  *int64
	Vote, Comment, ApprovalName         string
	WorkflowJobID                       *int64
	WorkflowJobName, UserName           string
	ApprovalTimeout                     *int64
	ApprovalStatus, ApprovalDescription string
	ApprovalTitle                       string
	ApprovalExists                      bool
}

const voteColumns = `v.id, v.created, v.workflow_approval_id, v.user_id, v.vote, v.comment, v.workflow_approval_name, v.workflow_job_id, v.workflow_job_name, v.user_name,
	wa.timeout, COALESCE(au.status, ''), COALESCE(au.description, ''), COALESCE(au.name, ''), au.id IS NOT NULL`

const voteFrom = `main_workflowapprovalvote v LEFT JOIN main_workflowapproval wa ON wa.unifiedjob_ptr_id = v.workflow_approval_id LEFT JOIN main_unifiedjob au ON au.id = v.workflow_approval_id`

func scanVote(r pgx.Row) (*voteRow, error) {
	v := &voteRow{}
	err := r.Scan(&v.ID, &v.Created, &v.ApprovalID, &v.UserID, &v.Vote, &v.Comment, &v.ApprovalName, &v.WorkflowJobID, &v.WorkflowJobName, &v.UserName,
		&v.ApprovalTimeout, &v.ApprovalStatus, &v.ApprovalDescription, &v.ApprovalTitle, &v.ApprovalExists)
	return v, err
}

// approvalVotesFor loads the votes of a set of approvals.
func (s *Server) approvalVotesFor(ctx context.Context, ids []int64) (map[int64][]*voteRow, error) {
	out := map[int64][]*voteRow{}
	if len(ids) == 0 {
		return out, nil
	}
	rows, err := s.Q().Query(ctx, `SELECT `+voteColumns+` FROM `+voteFrom+` WHERE v.workflow_approval_id = ANY($1) ORDER BY v.created DESC`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		v, err := scanVote(rows)
		if err != nil {
			return nil, err
		}
		out[*v.ApprovalID] = append(out[*v.ApprovalID], v)
	}
	return out, rows.Err()
}

// approvalsReceived counts the distinct approvers (approvals_received).
func approvalsReceived(votes []*voteRow) int {
	seen := map[string]bool{}
	for _, v := range votes {
		if v.Vote != "approve" {
			continue
		}
		key := "n:" + v.UserName
		if v.UserID != nil {
			key = fmt.Sprintf("u:%d", *v.UserID)
		}
		seen[key] = true
	}
	return len(seen)
}

func (s *Server) serializeApprovals(c *SerCtx, list []*approval, detail bool) ([]any, error) {
	ctx := c.Ctx()
	var ids, userIDs, tmplIDs, wfIDs []int64
	for _, a := range list {
		ids = append(ids, a.ID)
		userIDs = append(userIDs, uniqueIDs(a.CreatedByID, a.ModifiedByID, a.ApprovedByID)...)
		tmplIDs = append(tmplIDs, uniqueIDs(a.UnifiedJobTemplateID)...)
		wfIDs = append(wfIDs, uniqueIDs(a.WorkflowJobID)...)
	}
	if err := c.PreloadUsers(userIDs); err != nil {
		return nil, err
	}
	templates, err := s.loadTemplateBriefs(c, tmplIDs)
	if err != nil {
		return nil, err
	}
	timeouts := map[int64]int64{}
	if len(tmplIDs) > 0 {
		rows, err := s.Q().Query(ctx, `SELECT unifiedjobtemplate_ptr_id, timeout FROM main_workflowapprovaltemplate WHERE unifiedjobtemplate_ptr_id = ANY($1)`, tmplIDs)
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			var id, t int64
			if err := rows.Scan(&id, &t); err != nil {
				rows.Close()
				return nil, err
			}
			timeouts[id] = t
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return nil, err
		}
	}
	briefs, err := models.LoadUnifiedJobBriefs(ctx, s.Q(), s.CT, wfIDs)
	if err != nil {
		return nil, err
	}
	votes, err := s.approvalVotesFor(ctx, ids)
	if err != nil {
		return nil, err
	}
	jctx := &jobContext{briefs: map[int64]models.UnifiedJobBrief{}, schedules: map[int64]scheduleBrief{}}
	for id, b := range briefs {
		jctx.briefs[id] = b
	}
	out := make([]any, 0, len(list))
	for _, a := range list {
		related := NewOMap()
		setURL(related, "created_by", "users", a.CreatedByID)
		setURL(related, "modified_by", "users", a.ModifiedByID)
		setURL(related, "unified_job_template", "workflow_approval_templates", a.UnifiedJobTemplateID)
		setURL(related, "schedule", "schedules", a.ScheduleID)
		setURL(related, "source_workflow_job", "workflow_jobs", a.WorkflowJobID)
		setURL(related, "execution_environment", "execution_environments", a.ExecutionEnvironmentID)
		setURL(related, "workflow_approval_template", "workflow_approval_templates", a.TemplateID)
		related.Set("approve", SubURL("workflow_approvals", a.ID, "approve")).Set("deny", SubURL("workflow_approvals", a.ID, "deny")).Set("votes", SubURL("workflow_approvals", a.ID, "votes"))
		setURL(related, "approved_or_denied_by", "users", a.ApprovedByID)

		summary := NewOMap()
		if a.WFJTID != nil {
			summary.Set("workflow_job_template", NewOMap().Set("id", *a.WFJTID).Set("name", a.WFJTName).Set("description", a.WFJTDesc).Set("allow_force_node_success_on_relaunch", a.WFJTAllowForce))
		}
		if a.WorkflowJobID != nil {
			summary.Set("workflow_job", NewOMap().Set("id", *a.WorkflowJobID).Set("name", a.WorkflowJobName).Set("description", a.WorkflowJobDesc))
		}
		if a.UnifiedJobTemplateID != nil {
			if tb, ok := templates[*a.UnifiedJobTemplateID]; ok {
				if a.TemplateID != nil && *a.TemplateID == tb.ID {
					summary.Set("workflow_approval_template", NewOMap().Set("id", tb.ID).Set("name", tb.Name).Set("description", tb.Description).Set("timeout", timeouts[tb.ID]))
				}
				summary.Set("unified_job_template", NewOMap().Set("id", tb.ID).Set("name", tb.Name).Set("description", tb.Description).Set("unified_job_type", tb.Type))
			}
		}
		if u := c.UserSummary(a.ApprovedByID); u != nil {
			summary.Set("approved_or_denied_by", u)
		}
		if u := c.UserSummary(a.CreatedByID); u != nil {
			summary.Set("created_by", u)
		}
		if u := c.UserSummary(a.ModifiedByID); u != nil {
			summary.Set("modified_by", u)
		}
		summary.Set("user_capabilities", Caps("delete", c.User.IsSuperuser, "start", true))
		if a.LaunchType == "workflow" {
			src := NewOMap()
			if a.WorkflowJobID != nil {
				if b, ok := briefs[*a.WorkflowJobID]; ok {
					src.Set("id", b.ID).Set("name", b.Name).Set("description", b.Description).Set("status", b.Status).Set("failed", b.Failed)
					if b.Started != nil {
						src.Set("started", models.FormatTime(*b.Started))
					}
					src.Set("elapsed", b.Elapsed)
					if b.CanceledOn != nil {
						src.Set("canceled_on", models.FormatTime(*b.CanceledOn))
					}
				}
			}
			summary.Set("source_workflow_job", src)
		}
		ancestor, err := s.ancestorBrief(c, &a.UnifiedJob, jctx)
		if err != nil {
			return nil, err
		}
		if c.IsDetailView && ancestor.ID != a.ID {
			summary.Set("ancestor_job", NewOMap().Set("id", ancestor.ID).Set("name", ancestor.Name).Set("type", ancestor.Type).Set("url", models.JobDetailURL(ancestor.Type, ancestor.ID)))
		}

		o := Base(NewOMap(), a.ID, "workflow_approval", URLFor("workflow_approvals", a.ID), related, summary, a.Created, a.Modified, a.Name, a.Description)
		o.Set("unified_job_template", models.NullableID(a.UnifiedJobTemplateID)).Set("launch_type", a.LaunchType).Set("status", a.Status)
		o.Set("execution_environment", models.NullableID(a.ExecutionEnvironmentID)).Set("failed", a.Failed)
		o.Set("started", models.FormatTimePtr(a.Started)).Set("finished", models.FormatTimePtr(a.Finished)).Set("canceled_on", models.FormatTimePtr(a.CanceledOn))
		o.Set("elapsed", elapsedNow(&a.UnifiedJob))
		if detail {
			o.Set("job_args", a.JobArgs).Set("job_cwd", a.JobCwd).Set("job_env", map[string]any{})
		}
		o.Set("job_explanation", c.Loc().Gettext(a.JobExplanation))
		if detail {
			o.Set("result_traceback", a.ResultTraceback).Set("event_processing_finished", true)
		}
		o.Set("launched_by", s.launchedBy(c, ancestor, jctx)).Set("work_unit_id", nullIfEmpty(a.WorkUnitID))
		o.Set("can_approve_or_deny", s.approvalCanVote(c, a) && a.Status == "pending")
		var exp any
		if a.Status == "pending" && a.Timeout != 0 {
			exp = models.FormatTime(a.Created.Add(time.Duration(a.Timeout) * time.Second))
		}
		o.Set("approval_expiration", exp).Set("timed_out", a.TimedOut)
		if detail {
			o.Set("context_message", a.ContextMessage)
		}
		voted := false
		for _, v := range votes[a.ID] {
			if v.UserID != nil && *v.UserID == c.User.ID {
				voted = true
			}
		}
		o.Set("required_approvals", a.RequiredApprovals).Set("approvals_received", approvalsReceived(votes[a.ID])).Set("on_timeout", a.OnTimeout).Set("user_has_voted", voted)
		out = append(out, o)
	}
	return out, nil
}

func (s *Server) approvalDelete(w http.ResponseWriter, r *http.Request) error {
	if _, err := RequireWrite(r); err != nil {
		return err
	}
	a, c, err := s.approvalFromPath(r)
	if err != nil {
		return err
	}
	if !c.User.IsSuperuser {
		return ErrForbidden
	}
	if err := s.checkUnifiedJobDelete(r.Context(), a.ID, "", ""); err != nil {
		return err
	}
	ctx := r.Context()
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		return s.Cascade.Delete(ctx, tx, "main_unifiedjob", "id", []int64{a.ID})
	})
	if err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func (s *Server) approvalVoteView(w http.ResponseWriter, r *http.Request) error {
	a, _, err := s.approvalFromPath(r)
	if err != nil {
		return err
	}
	WriteJSON(w, 200, NewOMap().Set("job_explanation", Tr(r, a.JobExplanation)))
	return nil
}

// approvalVote records an approve or deny vote (WorkflowApproval.approve
// and deny): a deny decides at once; approvals decide when enough
// distinct users approved.
func (s *Server) approvalVote(w http.ResponseWriter, r *http.Request, vote string) error {
	if _, err := RequireWrite(r); err != nil {
		return err
	}
	a, c, err := s.approvalFromPath(r)
	if err != nil {
		return err
	}
	if !s.approvalCanVote(c, a) {
		return Detail(http.StatusForbidden, "User does not have permission to approve or deny this workflow.")
	}
	decided := &APIError{Status: http.StatusBadRequest, Body: map[string]any{"error": "This workflow step has already been approved or denied."}}
	alreadyVoted := &APIError{Status: http.StatusBadRequest, Body: map[string]any{"error": "You have already voted on this workflow step."}}
	if a.Status != "pending" {
		return decided
	}
	ctx := r.Context()
	comment := ""
	if body, err := ReadBody(r); err == nil {
		if v, ok := body.Get("comment"); ok {
			comment, _ = v.(string)
		}
	}
	status := ""
	// The status and vote checks are repeated under a row lock: two votes
	// (or a vote and the task process's timeout) racing past the checks
	// above would otherwise both decide, the later overwriting the first.
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		var cur string
		if err := tx.QueryRow(ctx, `SELECT status FROM main_unifiedjob WHERE id = $1 FOR UPDATE`, a.ID).Scan(&cur); err != nil {
			return err
		}
		if cur != "pending" {
			return decided
		}
		var voted bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM main_workflowapprovalvote WHERE workflow_approval_id = $1 AND user_id = $2)`, a.ID, c.User.ID).Scan(&voted); err != nil {
			return err
		}
		if voted {
			return alreadyVoted
		}
		if _, err := tx.Exec(ctx, `INSERT INTO main_workflowapprovalvote (created, modified, vote, comment, workflow_approval_name, workflow_job_id, workflow_job_name, user_name, user_id, workflow_approval_id)
			VALUES (now(), now(), $1, $2, $3, $4, $5, $6, $7, $8)`, vote, comment, a.Name, a.WorkflowJobID, a.WorkflowJobName, c.User.Username, c.User.ID, a.ID); err != nil {
			if db.IsUniqueViolation(err) {
				return alreadyVoted
			}
			return err
		}
		status = ""
		if vote == "deny" {
			status = "failed"
		} else {
			votes, err := s.approvalVotesForTx(ctx, tx, a.ID)
			if err != nil {
				return err
			}
			if int64(approvalsReceived(votes)) >= a.RequiredApprovals {
				status = "successful"
			}
		}
		if status == "" {
			return nil
		}
		err := FinishApproval(ctx, tx, a.ID, a.UnifiedJobTemplateID, status, &c.User.ID, "", false)
		if errors.Is(err, ErrApprovalDecided) {
			return decided
		}
		return err
	})
	if err != nil {
		return err
	}
	s.Notify(ctx, fmt.Sprintf(`{"type":"workflow_approval","id":%d}`, a.ID))
	switch status {
	case "successful":
		s.Background(func(ctx context.Context) { s.SendApprovalNotifications(ctx, a.ID, "approved") })
	case "failed":
		s.Background(func(ctx context.Context) { s.SendApprovalNotifications(ctx, a.ID, "denied") })
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func (s *Server) approvalVotesForTx(ctx context.Context, tx pgx.Tx, id int64) ([]*voteRow, error) {
	rows, err := tx.Query(ctx, `SELECT `+voteColumns+` FROM `+voteFrom+` WHERE v.workflow_approval_id = $1 ORDER BY v.created DESC`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*voteRow
	for rows.Next() {
		v, err := scanVote(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

// ErrApprovalDecided is FinishApproval's answer for an approval that is no
// longer pending: a vote or the timeout decided it first.
var ErrApprovalDecided = errors.New("workflow approval already decided")

// FinishApproval stores an approval's outcome and its template's last-job
// fields, as the model's save did; the task process uses it for timeouts.
// Only a pending approval is decided; otherwise nothing changes and the
// error is ErrApprovalDecided.
func FinishApproval(ctx context.Context, q pgx.Tx, id int64, templateID *int64, status string, by *int64, explanation string, timedOut bool) error {
	failed := status != "successful"
	tag, err := q.Exec(ctx, `UPDATE main_unifiedjob SET status = $2, failed = $3, finished = now(), elapsed = EXTRACT(EPOCH FROM (now() - COALESCE(started, created))),
		job_explanation = CASE WHEN $4 = '' THEN job_explanation ELSE $4 END, modified = now() WHERE id = $1 AND status = 'pending'`, id, status, failed, explanation)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrApprovalDecided
	}
	if _, err := q.Exec(ctx, `UPDATE main_workflowapproval SET approved_or_denied_by_id = COALESCE($2, approved_or_denied_by_id), timed_out = timed_out OR $3 WHERE unifiedjob_ptr_id = $1`, id, by, timedOut); err != nil {
		return err
	}
	if templateID != nil {
		if _, err := q.Exec(ctx, `UPDATE main_unifiedjobtemplate SET status = $2, last_job_id = $3, last_job_failed = $4, last_job_run = now(),
			current_job_id = CASE WHEN current_job_id = $3 THEN NULL ELSE current_job_id END WHERE id = $1`, *templateID, status, id, failed); err != nil {
			return err
		}
	}
	return nil
}

// --- votes ----------------------------------------------------------------------------

var voteFields = &FieldSet{Model: "WorkflowApprovalVote", Fields: map[string]Field{
	"id": {SQL: "v.id", Kind: KindInt}, "created": {SQL: "v.created", Kind: KindDateTime}, "vote": {SQL: "v.vote"}, "comment": {SQL: "v.comment"},
	"workflow_approval": {SQL: "v.workflow_approval_id", Kind: KindFK}, "user": {SQL: "v.user_id", Kind: KindFK},
	"workflow_approval_name": {SQL: "v.workflow_approval_name"}, "workflow_job_id": {SQL: "v.workflow_job_id", Kind: KindInt},
	"workflow_job_name": {SQL: "v.workflow_job_name"}, "user_name": {SQL: "v.user_name"},
}, SearchFields: []string{"workflow_approval_name", "workflow_job_name", "user_name", "comment"}}

func (s *Server) voteAccess(q *Query, u *auth.User) {
	q.And(`v.workflow_approval_id IN (SELECT n.job_id FROM main_workflowjobnode n JOIN main_workflowjob wj ON wj.unifiedjob_ptr_id = n.workflow_job_id WHERE wj.workflow_job_template_id IN (` +
		accessibleSQL(q, u.ID, s.CT.ID("main.workflowjobtemplate"), "read_role") + "))")
}

func (s *Server) voteListWith(w http.ResponseWriter, r *http.Request, extra func(q *Query)) error {
	if _, err := RequireUser(r); err != nil {
		return err
	}
	spec := ListSpec{Model: "WorkflowApprovalVote", From: voteFrom, Columns: voteColumns, PK: "v.id", Fields: voteFields, DefaultOrder: []string{"-created"}, Access: s.voteAccess}
	rows, count, page, err := s.RunList(r, spec, extra, func(rows pgx.Rows) (any, error) { return scanVote(rows) })
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, false)
	var userIDs []int64
	for _, row := range rows {
		userIDs = append(userIDs, uniqueIDs(row.(*voteRow).UserID)...)
	}
	if err := c.PreloadUsers(userIDs); err != nil {
		return err
	}
	results := make([]any, 0, len(rows))
	for _, row := range rows {
		results = append(results, s.serializeVote(c, row.(*voteRow)))
	}
	WriteJSON(w, 200, Paginate(r, page, count, results))
	return nil
}

func (s *Server) serializeVote(c *SerCtx, v *voteRow) *OMap {
	related := NewOMap()
	setURL(related, "workflow_approval", "workflow_approvals", v.ApprovalID)
	setURL(related, "user", "users", v.UserID)
	summary := NewOMap()
	if u := c.UserSummary(v.UserID); u != nil {
		summary.Set("user", u)
	}
	if v.ApprovalID != nil && v.ApprovalExists {
		summary.Set("workflow_approval", NewOMap().Set("id", *v.ApprovalID).Set("name", v.ApprovalTitle).Set("description", v.ApprovalDescription).Set("timeout", v.ApprovalTimeout).Set("status", v.ApprovalStatus))
	}
	o := NewOMap().Set("id", v.ID).Set("type", "workflow_approval_vote").Set("url", URLFor("workflow_approval_votes", v.ID)).Set("related", related).Set("summary_fields", summary)
	o.Set("created", models.FormatTime(v.Created)).Set("workflow_approval", models.NullableID(v.ApprovalID)).Set("user", models.NullableID(v.UserID))
	o.Set("vote", v.Vote).Set("comment", v.Comment).Set("workflow_approval_name", v.ApprovalName).Set("workflow_job_id", models.NullableID(v.WorkflowJobID))
	o.Set("workflow_job_name", v.WorkflowJobName).Set("user_name", v.UserName)
	return o
}

func (s *Server) voteList(w http.ResponseWriter, r *http.Request) error {
	return s.voteListWith(w, r, nil)
}

func (s *Server) voteDetail(w http.ResponseWriter, r *http.Request) error {
	u, err := RequireUser(r)
	if err != nil {
		return err
	}
	id, err := PathID(r)
	if err != nil {
		return NotFoundFor("WorkflowApprovalVote")
	}
	v, err := scanVote(s.Q().QueryRow(r.Context(), `SELECT `+voteColumns+` FROM `+voteFrom+` WHERE v.id = $1`, id))
	if err != nil {
		if db.IsNoRows(err) {
			return NotFoundFor("WorkflowApprovalVote")
		}
		return err
	}
	// The vote is readable with its approval; 403 otherwise.
	if !u.IsSuperuser && !u.IsSystemAuditor {
		if v.ApprovalID == nil {
			return ErrForbidden
		}
		if _, _, err := s.loadApprovalFor(r, *v.ApprovalID); err != nil {
			var apiErr *APIError
			if errors.As(err, &apiErr) {
				return ErrForbidden
			}
			return err
		}
	}
	c := s.NewSerCtx(r, true)
	if err := c.PreloadUsers(uniqueIDs(v.UserID)); err != nil {
		return err
	}
	WriteJSON(w, 200, s.serializeVote(c, v))
	return nil
}

func (s *Server) approvalVotes(w http.ResponseWriter, r *http.Request) error {
	a, _, err := s.approvalFromPath(r)
	if err != nil {
		return err
	}
	return s.voteListWith(w, r, func(q *Query) { q.And("v.workflow_approval_id = " + q.Arg(a.ID)) })
}

// --- approval templates -------------------------------------------------------------------

func (s *Server) loadApprovalTemplateFor(r *http.Request) (*models.WorkflowApprovalTemplate, *SerCtx, error) {
	u, err := RequireUser(r)
	if err != nil {
		return nil, nil, err
	}
	id, err := PathID(r)
	if err != nil {
		return nil, nil, NotFoundFor("WorkflowApprovalTemplate")
	}
	a, err := models.GetWorkflowApprovalTemplate(r.Context(), s.Q(), id)
	if err != nil {
		if db.IsNoRows(err) {
			return nil, nil, NotFoundFor("WorkflowApprovalTemplate")
		}
		return nil, nil, err
	}
	c := s.NewSerCtx(r, true)
	if !u.IsSuperuser && !u.IsSystemAuditor && !c.HasRole(a.WorkflowJobTemplateReadRoleID) {
		return nil, nil, ErrForbidden
	}
	return a, c, nil
}

func (s *Server) serializeApprovalTemplate(c *SerCtx, a *models.WorkflowApprovalTemplate) (*OMap, error) {
	if err := c.PreloadUsers(uniqueIDs(a.CreatedByID, a.ModifiedByID)); err != nil {
		return nil, err
	}
	if err := c.PreloadJobs(uniqueIDs(a.LastJobID, a.CurrentJobID)); err != nil {
		return nil, err
	}
	related := NewOMap()
	setURL(related, "created_by", "users", a.CreatedByID)
	setURL(related, "modified_by", "users", a.ModifiedByID)
	setURL(related, "current_job", "workflow_approvals", a.CurrentJobID)
	setURL(related, "next_schedule", "schedules", a.NextScheduleID)
	related.Set("jobs", SubURL("workflow_approval_templates", a.ID, "approvals"))
	summary := NewOMap()
	if a.WorkflowJobTemplateID != nil {
		summary.Set("workflow_job_template", NewOMap().Set("id", *a.WorkflowJobTemplateID).Set("name", a.WorkflowJobTemplateName).Set("description", a.WorkflowJobTemplateDescription).Set("allow_force_node_success_on_relaunch", a.WorkflowJobTemplateAllowForceSucces))
	}
	if j := c.LastJobSummary(a.LastJobID); j != nil {
		summary.Set("last_job", j)
	}
	if j := c.UpdateSummary(a.LastJobID); j != nil {
		summary.Set("last_update", j)
	}
	if j := c.UpdateSummary(a.CurrentJobID); j != nil {
		summary.Set("current_update", j)
	}
	if u := c.UserSummary(a.CreatedByID); u != nil {
		summary.Set("created_by", u)
	}
	if u := c.UserSummary(a.ModifiedByID); u != nil {
		summary.Set("modified_by", u)
	}
	if c.IsDetailView {
		resolved := a.ExecutionEnvID
		if resolved == nil {
			resolved = s.DefaultExecutionEnvironmentID(c.Ctx())
		}
		if resolved != nil {
			if err := c.PreloadEEs([]int64{*resolved}); err == nil {
				if e := c.EESummary(resolved); e != nil {
					summary.Set("resolved_environment", e)
				}
			}
		}
	}
	o := Base(NewOMap(), a.ID, "workflow_approval_template", URLFor("workflow_approval_templates", a.ID), related, summary, a.Created, a.Modified, a.Name, a.Description)
	o.Set("last_job_run", models.FormatTimePtr(a.LastJobRun)).Set("last_job_failed", a.LastJobFailed).Set("next_job_run", models.FormatTimePtr(a.NextJobRun)).Set("status", a.Status)
	o.Set("execution_environment", models.NullableID(a.ExecutionEnvID)).Set("timeout", a.Timeout).Set("context_template", a.ContextTemplate)
	o.Set("required_approvals", a.RequiredApprovals).Set("on_timeout", a.OnTimeout)
	return o, nil
}

func (s *Server) approvalTemplateDetail(w http.ResponseWriter, r *http.Request) error {
	a, c, err := s.loadApprovalTemplateFor(r)
	if err != nil {
		return err
	}
	o, err := s.serializeApprovalTemplate(c, a)
	if err != nil {
		return err
	}
	WriteJSON(w, 200, o)
	return nil
}

// approvalTemplateCanChange: changing an approval template needs change
// access to its workflow job template.
func (s *Server) approvalTemplateCanChange(c *SerCtx, a *models.WorkflowApprovalTemplate) bool {
	return c.User.IsSuperuser || (a.WorkflowJobTemplateAdminRoleID != nil && c.HasRole(a.WorkflowJobTemplateAdminRoleID))
}

func (s *Server) approvalTemplateUpdate(w http.ResponseWriter, r *http.Request) error {
	if _, err := RequireWrite(r); err != nil {
		return err
	}
	a, c, err := s.loadApprovalTemplateFor(r)
	if err != nil {
		return err
	}
	if !s.approvalTemplateCanChange(c, a) {
		return ErrForbidden
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	f := NewForm(body, r.Method == http.MethodPatch)
	before := map[string]any{"name": a.Name, "description": a.Description, "timeout": a.Timeout, "required_approvals": a.RequiredApprovals, "on_timeout": a.OnTimeout, "context_template": a.ContextTemplate}
	approvalTemplateFromForm(f, a)
	if err := f.Err(); err != nil {
		return err
	}
	a.ModifiedByID = &c.User.ID
	ctx := r.Context()
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if err := models.UpdateWorkflowApprovalTemplate(ctx, tx, a); err != nil {
			return err
		}
		after := map[string]any{"name": a.Name, "description": a.Description, "timeout": a.Timeout, "required_approvals": a.RequiredApprovals, "on_timeout": a.OnTimeout, "context_template": a.ContextTemplate}
		changes := diffChanges(before, after)
		if len(changes) == 0 {
			return nil
		}
		return s.Activity.Record(ctx, tx, activity.Entry{Operation: "update", Object1: "workflow_approval_template", Changes: changes, ActorID: &c.User.ID, Links: map[string]int64{"workflow_approval_template": a.ID, "unified_job_template": a.ID}})
	})
	if err != nil {
		return err
	}
	o, err := s.serializeApprovalTemplate(c, a)
	if err != nil {
		return err
	}
	WriteJSON(w, 200, o)
	return nil
}

func (s *Server) approvalTemplateDelete(w http.ResponseWriter, r *http.Request) error {
	if _, err := RequireWrite(r); err != nil {
		return err
	}
	a, c, err := s.loadApprovalTemplateFor(r)
	if err != nil {
		return err
	}
	if !s.approvalTemplateCanChange(c, a) {
		return ErrForbidden
	}
	ctx := r.Context()
	// RelatedJobsPreventDeleteMixin
	if err := s.checkRelatedActiveJobs(ctx, templateJobsCond, a.ID); err != nil {
		return err
	}
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if err := s.Activity.Record(ctx, tx, activity.Entry{Operation: "delete", Object1: "workflow_approval_template", Changes: map[string]any{"name": a.Name, "id": a.ID}, ActorID: &c.User.ID}); err != nil {
			return err
		}
		return s.Cascade.Delete(ctx, tx, "main_unifiedjobtemplate", "id", []int64{a.ID})
	})
	if err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func (s *Server) approvalTemplateApprovals(w http.ResponseWriter, r *http.Request) error {
	a, _, err := s.loadApprovalTemplateFor(r)
	if err != nil {
		return err
	}
	return s.approvalListWith(w, r, func(q *Query) { q.And("a.workflow_approval_template_id = " + q.Arg(a.ID)) })
}
