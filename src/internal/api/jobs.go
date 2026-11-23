package api

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"html"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/auth"
	"github.com/ctrliq/ascender/internal/crypto"
	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/models"
	"github.com/ctrliq/ascender/internal/redact"
)

func jobFieldsAlias(uj, j string) *FieldSet {
	return &FieldSet{
		Model: "Job",
		Fields: map[string]Field{
			"id": {SQL: uj + ".id", Kind: KindInt}, "name": {SQL: uj + ".name"}, "description": {SQL: uj + ".description"},
			"created": {SQL: uj + ".created", Kind: KindDateTime}, "modified": {SQL: uj + ".modified", Kind: KindDateTime},
			"launch_type": {SQL: uj + ".launch_type"}, "status": {SQL: uj + ".status"}, "failed": {SQL: uj + ".failed", Kind: KindBool},
			"started": {SQL: uj + ".started", Kind: KindDateTime}, "finished": {SQL: uj + ".finished", Kind: KindDateTime},
			"canceled_on": {SQL: uj + ".canceled_on", Kind: KindDateTime}, "elapsed": {SQL: uj + ".elapsed", Kind: KindInt},
			"job_explanation": {SQL: uj + ".job_explanation"}, "execution_node": {SQL: uj + ".execution_node"}, "controller_node": {SQL: uj + ".controller_node"},
			"work_unit_id": {SQL: uj + ".work_unit_id"}, "job_args": {SQL: uj + ".job_args", NoFilter: true}, "job_env": {SQL: uj + ".job_env", NoFilter: true},
			"job_cwd": {SQL: uj + ".job_cwd", NoFilter: true}, "result_traceback": {SQL: uj + ".result_traceback", NoFilter: true},
			"dependencies_processed": {SQL: uj + ".dependencies_processed", Kind: KindBool}, "host_status_counts": {SQL: uj + ".host_status_counts", Kind: KindJSON},
			"job_type": {SQL: j + ".job_type"}, "playbook": {SQL: j + ".playbook"}, "scm_branch": {SQL: j + ".scm_branch"}, "forks": {SQL: j + ".forks", Kind: KindInt},
			"limit": {SQL: j + `."limit"`}, "job_slice_pinned_hosts": {SQL: j + ".job_slice_pinned_hosts"}, "verbosity": {SQL: j + ".verbosity", Kind: KindInt},
			"extra_vars": {SQL: j + ".extra_vars", NoFilter: true}, "job_tags": {SQL: j + ".job_tags"}, "force_handlers": {SQL: j + ".force_handlers", Kind: KindBool},
			"skip_tags": {SQL: j + ".skip_tags"}, "start_at_task": {SQL: j + ".start_at_task"}, "timeout": {SQL: j + ".timeout", Kind: KindInt},
			"use_fact_cache": {SQL: j + ".use_fact_cache", Kind: KindBool}, "allow_simultaneous": {SQL: j + ".allow_simultaneous", Kind: KindBool},
			"scm_revision": {SQL: j + ".scm_revision"}, "diff_mode": {SQL: j + ".diff_mode", Kind: KindBool}, "job_slice_number": {SQL: j + ".job_slice_number", Kind: KindInt},
			"job_slice_count": {SQL: j + ".job_slice_count", Kind: KindInt}, "webhook_service": {SQL: j + ".webhook_service"}, "webhook_guid": {SQL: j + ".webhook_guid"},
			"artifacts":             {SQL: j + ".artifacts", NoFilter: true},
			"inventory":             {SQL: j + ".inventory_id", Kind: KindFK, Rel: &Relation{Alias: "jinv", Join: "LEFT JOIN main_inventory jinv ON jinv.id = " + j + ".inventory_id", Target: func() *FieldSet { return inventoryFieldsAlias("jinv") }}},
			"project":               {SQL: j + ".project_id", Kind: KindFK, Rel: &Relation{Alias: "pp", Join: "LEFT JOIN main_project pp ON pp.unifiedjobtemplate_ptr_id = " + j + ".project_id LEFT JOIN main_unifiedjobtemplate pujt ON pujt.id = pp.unifiedjobtemplate_ptr_id", Target: func() *FieldSet { return projectFieldsAlias("pujt", "pp") }}},
			"job_template":          {SQL: j + ".job_template_id", Kind: KindFK, Rel: &Relation{Alias: "jtjt", Join: "LEFT JOIN main_jobtemplate jtjt ON jtjt.unifiedjobtemplate_ptr_id = " + j + ".job_template_id LEFT JOIN main_unifiedjobtemplate jtujt ON jtujt.id = jtjt.unifiedjobtemplate_ptr_id", Target: func() *FieldSet { return jobTemplateFieldsAlias("jtujt", "jtjt") }}},
			"unified_job_template":  {SQL: uj + ".unified_job_template_id", Kind: KindFK, Rel: &Relation{Alias: "ujt2", Join: "LEFT JOIN main_unifiedjobtemplate ujt2 ON ujt2.id = " + uj + ".unified_job_template_id", Target: func() *FieldSet { return unifiedJobTemplateFieldsAlias("ujt2") }}},
			"organization":          {SQL: uj + ".organization_id", Kind: KindFK, Rel: &Relation{Alias: "o", Join: "LEFT JOIN main_organization o ON o.id = " + uj + ".organization_id", Target: func() *FieldSet { return organizationFields }}},
			"execution_environment": {SQL: uj + ".execution_environment_id", Kind: KindFK, Rel: &Relation{Alias: "ee", Join: "LEFT JOIN main_executionenvironment ee ON ee.id = " + uj + ".execution_environment_id", Target: func() *FieldSet { return executionEnvironmentFields }}},
			"instance_group":        {SQL: uj + ".instance_group_id", Kind: KindFK, Rel: &Relation{Alias: "jig", Join: "LEFT JOIN main_instancegroup jig ON jig.id = " + uj + ".instance_group_id", Target: func() *FieldSet { return instanceGroupFieldsAlias("jig") }}},
			"created_by":            {SQL: uj + ".created_by_id", Kind: KindFK, Rel: &Relation{Alias: "cb", Join: "LEFT JOIN auth_user cb ON cb.id = " + uj + ".created_by_id", Target: func() *FieldSet { return userFieldsAlias("cb") }}},
			"modified_by":           {SQL: uj + ".modified_by_id", Kind: KindFK, Rel: &Relation{Alias: "mb", Join: "LEFT JOIN auth_user mb ON mb.id = " + uj + ".modified_by_id", Target: func() *FieldSet { return userFieldsAlias("mb") }}},
			"schedule":              {SQL: uj + ".schedule_id", Kind: KindFK},
			"project_update":        {SQL: j + ".project_update_id", Kind: KindFK},
			"webhook_credential":    {SQL: j + ".webhook_credential_id", Kind: KindFK},
			"labels":                {SQL: "jl.label_id", Kind: KindFK, Rel: &Relation{Alias: "jl", Join: "LEFT JOIN main_unifiedjob_labels jl ON jl.unifiedjob_id = " + uj + ".id LEFT JOIN main_label jlabel ON jlabel.id = jl.label_id", Target: func() *FieldSet { return labelFieldSet("jlabel") }, Many: true}},
			"credentials":           {SQL: "jc.credential_id", Kind: KindFK, Rel: &Relation{Alias: "jc", Join: "LEFT JOIN main_unifiedjob_credentials jc ON jc.unifiedjob_id = " + uj + ".id LEFT JOIN main_credential jcred ON jcred.id = jc.credential_id", Target: func() *FieldSet { return credentialFieldsAlias("jcred") }, Many: true}},
			// Job.hosts: the hosts of its host summaries (the host Jobs tab).
			"hosts":             {SQL: j + "jhs.host_id", Kind: KindFK, Rel: &Relation{Alias: j + "jhs", Join: "LEFT JOIN main_jobhostsummary " + j + "jhs ON " + j + "jhs.job_id = " + j + ".unifiedjob_ptr_id LEFT JOIN main_host " + j + "jhost ON " + j + "jhost.id = " + j + "jhs.host_id", Target: func() *FieldSet { return hostFieldSet(j + "jhost") }, Many: true}},
			"polymorphic_ctype": {SQL: uj + ".polymorphic_ctype_id", Kind: KindFK},
		},
		SearchFields: []string{"description", "name"},
	}
}

// unifiedJobTemplateFieldsAlias is the generic template surface reached
// from a job's unified_job_template.
func unifiedJobTemplateFieldsAlias(a string) *FieldSet {
	return &FieldSet{Model: "UnifiedJobTemplate", Fields: map[string]Field{
		"id": {SQL: a + ".id", Kind: KindInt}, "name": {SQL: a + ".name"}, "description": {SQL: a + ".description"},
		"status": {SQL: a + ".status"}, "created": {SQL: a + ".created", Kind: KindDateTime}, "modified": {SQL: a + ".modified", Kind: KindDateTime},
		"last_job_run": {SQL: a + ".last_job_run", Kind: KindDateTime}, "last_job_failed": {SQL: a + ".last_job_failed", Kind: KindBool},
		"next_job_run": {SQL: a + ".next_job_run", Kind: KindDateTime}, "organization": {SQL: a + ".organization_id", Kind: KindFK},
		"polymorphic_ctype": {SQL: a + ".polymorphic_ctype_id", Kind: KindFK},
	}, SearchFields: []string{"name", "description"}}
}

func instanceGroupFieldsAlias(a string) *FieldSet {
	return &FieldSet{Model: "InstanceGroup", Fields: map[string]Field{
		"id": {SQL: a + ".id", Kind: KindInt}, "name": {SQL: a + ".name"}, "is_container_group": {SQL: a + ".is_container_group", Kind: KindBool},
		"created": {SQL: a + ".created", Kind: KindDateTime}, "modified": {SQL: a + ".modified", Kind: KindDateTime},
	}, SearchFields: []string{"name"}}
}

var jobFields *FieldSet

func jobSpec() ListSpec {
	return ListSpec{Model: "Job", From: models.JobFrom, Columns: models.JobColumns, PK: "uj.id", Fields: jobFields, DefaultOrder: []string{"id"}}
}

func init() {
	jobFields = jobFieldsAlias("uj", "j")
	resourceRegistrars = append(resourceRegistrars, (*Server).registerJobs)
}

func (s *Server) registerJobs(mux *http.ServeMux) {
	s.route(mux, "/api/v2/jobs/{$}", methodMap{"GET": s.jobList}, s.optionsFor("jobs"))
	s.route(mux, "/api/v2/jobs/{id}/{$}", methodMap{"GET": s.jobDetail, "DELETE": s.jobDelete}, s.optionsFor("jobs"))
	s.route(mux, "/api/v2/jobs/{id}/job_events/{$}", methodMap{"GET": s.jobEvents}, s.optionsFor("job_events"))
	s.route(mux, "/api/v2/jobs/{id}/job_events/children_summary/{$}", methodMap{"GET": s.jobEventsChildrenSummary}, nil)
	s.route(mux, "/api/v2/jobs/{id}/job_host_summaries/{$}", methodMap{"GET": s.jobHostSummaries}, nil)
	s.route(mux, "/api/v2/jobs/{id}/stdout/{$}", methodMap{"GET": s.jobStdoutView}, nil)
	s.route(mux, "/api/v2/jobs/{id}/cancel/{$}", methodMap{"GET": s.jobCancelView, "POST": s.jobCancel}, nil)
	s.route(mux, "/api/v2/jobs/{id}/relaunch/{$}", methodMap{"GET": s.jobRelaunchView, "POST": s.jobRelaunch}, nil)
	s.route(mux, "/api/v2/jobs/{id}/create_schedule/{$}", methodMap{"GET": s.jobCreateScheduleView, "POST": s.jobCreateSchedulePost}, s.optionsFor("jobs"))
	s.route(mux, "/api/v2/jobs/{id}/credentials/{$}", methodMap{"GET": s.jobCredentials}, s.optionsFor("credentials"))
	s.route(mux, "/api/v2/jobs/{id}/labels/{$}", methodMap{"GET": s.jobLabels}, s.optionsFor("labels"))
	s.route(mux, "/api/v2/job_events/{id}/{$}", methodMap{"GET": s.jobEventDetail}, s.optionsFor("job_events"))
	s.route(mux, "/api/v2/job_events/{id}/children/{$}", methodMap{"GET": s.jobEventChildren}, s.optionsFor("job_events"))
	s.route(mux, "/api/v2/job_host_summaries/{id}/{$}", methodMap{"GET": s.jobHostSummaryDetail}, nil)
}

// jobAccess mirrors JobAccess.filtered_queryset: jobs of readable
// templates, plus every job of an organization the user administers or
// audits directly.
func (s *Server) jobAccess(q *Query, u *auth.User) {
	q.And("(j.job_template_id IN (" + accessibleSQL(q, u.ID, s.CT.ID("main.jobtemplate"), "read_role") + `) OR uj.organization_id IN (
		SELECT o.id FROM main_organization o JOIN main_rbac_roles_members m ON m.role_id IN (o.admin_role_id, o.auditor_role_id) WHERE m.user_id = ` + q.Arg(u.ID) + "))")
}

func (s *Server) jobList(w http.ResponseWriter, r *http.Request) error {
	return s.jobListWith(w, r, nil)
}

func (s *Server) jobListWith(w http.ResponseWriter, r *http.Request, extra func(q *Query)) error {
	spec := jobSpec()
	spec.Access = s.jobAccess
	jobs, count, page, err := runListOf(s, r, spec, extra, models.ScanJob)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, false)
	results, err := s.serializeJobs(c, jobs, "list")
	if err != nil {
		return err
	}
	WriteJSON(w, 200, Paginate(r, page, count, results))
	return nil
}

// templateBrief is the job_template / unified_job_template block.
type templateBrief struct {
	ID              int64
	Name            string
	Description     string
	PreventRelaunch bool
	Type            string
	IsJobTemplate   bool
}

func (s *Server) loadTemplateBriefs(c *SerCtx, ids []int64) (map[int64]templateBrief, error) {
	out := map[int64]templateBrief{}
	if len(ids) == 0 {
		return out, nil
	}
	rows, err := c.S.Q().Query(c.Ctx(), `SELECT u.id, u.name, u.description, u.polymorphic_ctype_id, jt.prevent_relaunch, jt.unifiedjobtemplate_ptr_id IS NOT NULL
		FROM main_unifiedjobtemplate u LEFT JOIN main_jobtemplate jt ON jt.unifiedjobtemplate_ptr_id = u.id WHERE u.id = ANY($1)`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var b templateBrief
		var ct int64
		var prevent *bool
		if err := rows.Scan(&b.ID, &b.Name, &b.Description, &ct, &prevent, &b.IsJobTemplate); err != nil {
			return nil, err
		}
		if prevent != nil {
			b.PreventRelaunch = *prevent
		}
		b.Type = unifiedJobTypeForTemplate(c.S.CT, ct)
		out[b.ID] = b
	}
	return out, rows.Err()
}

// unifiedJobTypeForTemplate maps a template content type to the job type it
// spawns.
func unifiedJobTypeForTemplate(cts *models.ContentTypes, ct int64) string {
	switch cts.Model(ct) {
	case "main.jobtemplate":
		return "job"
	case "main.project":
		return "project_update"
	case "main.inventorysource":
		return "inventory_update"
	case "main.systemjobtemplate":
		return "system_job"
	case "main.workflowjobtemplate":
		return "workflow_job"
	case "main.workflowapprovaltemplate":
		return "workflow_approval"
	}
	return ""
}

// jobContext carries the batch-loaded relations of a page of jobs.
type jobContext struct {
	invs      map[int64]models.InventorySummary
	projects  map[int64]projectBrief
	templates map[int64]templateBrief
	igs       map[int64]models.InstanceGroupBrief
	labels    map[int64][]models.NameSummary
	creds     map[int64][]models.CredentialBrief
	wfJobs    map[int64]int64
	briefs    map[int64]models.UnifiedJobBrief
	schedules map[int64]scheduleBrief
	// ancestors maps workflow-launched jobs of the page to their
	// ancestor job (preloadAncestors); jobs missing from it are resolved
	// one at a time.
	ancestors map[int64]int64
}

// preloadAncestors resolves the ancestor jobs of the page's
// workflow-launched jobs, and their briefs, in two statements.
func (s *Server) preloadAncestors(c *SerCtx, ctx *jobContext, jobs []*models.UnifiedJob) error {
	var ids []int64
	for _, jb := range jobs {
		if jb.LaunchType == "workflow" {
			ids = append(ids, jb.ID)
		}
	}
	if len(ids) == 0 {
		return nil
	}
	anc, err := models.AncestorJobIDs(c.Ctx(), s.Q(), ids)
	if err != nil {
		return err
	}
	ctx.ancestors = anc
	if ctx.briefs == nil {
		ctx.briefs = map[int64]models.UnifiedJobBrief{}
	}
	var need []int64
	for id, a := range anc {
		if _, ok := ctx.briefs[a]; !ok && a != id {
			need = append(need, a)
		}
	}
	briefs, err := models.LoadUnifiedJobBriefs(c.Ctx(), s.Q(), s.CT, need)
	if err != nil {
		return err
	}
	for id, b := range briefs {
		ctx.briefs[id] = b
	}
	return nil
}

type scheduleBrief struct {
	ID          int64
	Name        string
	Description string
	NextRun     *time.Time
}

func (s *Server) loadScheduleBriefs(c *SerCtx, ids []int64) (map[int64]scheduleBrief, error) {
	out := map[int64]scheduleBrief{}
	if len(ids) == 0 {
		return out, nil
	}
	rows, err := c.S.Q().Query(c.Ctx(), `SELECT id, name, description, next_run FROM main_schedule WHERE id = ANY($1)`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var b scheduleBrief
		if err := rows.Scan(&b.ID, &b.Name, &b.Description, &b.NextRun); err != nil {
			return nil, err
		}
		out[b.ID] = b
	}
	return out, rows.Err()
}

// instanceGroupBrief is what job summaries say about an instance group.
type instanceGroupBrief struct {
	ID        int64
	Name      string
	Container bool
}

func (s *Server) loadInstanceGroupBriefs(c *SerCtx, ids []int64) (map[int64]instanceGroupBrief, error) {
	out := map[int64]instanceGroupBrief{}
	if len(ids) == 0 {
		return out, nil
	}
	rows, err := c.S.Q().Query(c.Ctx(), `SELECT id, name, is_container_group FROM main_instancegroup WHERE id = ANY($1)`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var b instanceGroupBrief
		if err := rows.Scan(&b.ID, &b.Name, &b.Container); err != nil {
			return nil, err
		}
		out[b.ID] = b
	}
	return out, rows.Err()
}

// serializeJobs renders jobs in one of three shapes: "list" (the stripped
// list serializer, unified fields first), "full" (JobSerializer, job options
// first) and "detail" (full plus host and playbook counts).
func (s *Server) serializeJobs(c *SerCtx, jobs []*models.Job, mode string) ([]any, error) {
	var userIDs, orgIDs, eeIDs, invIDs, projIDs, tmplIDs, igIDs, ids, wfIDs, ujIDs, schedIDs []int64
	for _, jb := range jobs {
		ids = append(ids, jb.ID)
		userIDs = append(userIDs, uniqueIDs(jb.CreatedByID, jb.ModifiedByID)...)
		orgIDs = append(orgIDs, uniqueIDs(jb.OrganizationID)...)
		eeIDs = append(eeIDs, uniqueIDs(jb.ExecutionEnvironmentID)...)
		invIDs = append(invIDs, uniqueIDs(jb.InventoryID)...)
		projIDs = append(projIDs, uniqueIDs(jb.ProjectID)...)
		tmplIDs = append(tmplIDs, uniqueIDs(jb.JobTemplateID, jb.UnifiedJobTemplateID)...)
		igIDs = append(igIDs, uniqueIDs(jb.InstanceGroupID)...)
		ujIDs = append(ujIDs, uniqueIDs(jb.ProjectUpdateID)...)
		schedIDs = append(schedIDs, uniqueIDs(jb.ScheduleID)...)
		if jb.LaunchType == "workflow" {
			wfIDs = append(wfIDs, jb.ID)
		}
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
	ctx := &jobContext{}
	var err error
	if ctx.invs, err = models.LoadInventorySummaries(c.Ctx(), c.S.Q(), invIDs); err != nil {
		return nil, err
	}
	if ctx.projects, err = s.loadProjectBriefs(c, projIDs); err != nil {
		return nil, err
	}
	if ctx.templates, err = s.loadTemplateBriefs(c, tmplIDs); err != nil {
		return nil, err
	}
	if ctx.igs, err = models.LoadInstanceGroupBriefs(c.Ctx(), c.S.Q(), igIDs); err != nil {
		return nil, err
	}
	if ctx.labels, err = models.JobLabels(c.Ctx(), c.S.Q(), ids); err != nil {
		return nil, err
	}
	if ctx.creds, err = models.JobCredentials(c.Ctx(), c.S.Q(), ids); err != nil {
		return nil, err
	}
	if ctx.wfJobs, err = models.WorkflowJobIDForJob(c.Ctx(), c.S.Q(), wfIDs); err != nil {
		return nil, err
	}
	for _, wf := range ctx.wfJobs {
		ujIDs = append(ujIDs, wf)
	}
	if ctx.briefs, err = models.LoadUnifiedJobBriefs(c.Ctx(), c.S.Q(), c.S.CT, ujIDs); err != nil {
		return nil, err
	}
	if ctx.schedules, err = s.loadScheduleBriefs(c, schedIDs); err != nil {
		return nil, err
	}
	ujs := make([]*models.UnifiedJob, len(jobs))
	for i, jb := range jobs {
		ujs[i] = &jb.UnifiedJob
	}
	if err := s.preloadAncestors(c, ctx, ujs); err != nil {
		return nil, err
	}
	out := make([]any, 0, len(jobs))
	for _, jb := range jobs {
		o, err := s.serializeJob(c, jb, ctx, mode)
		if err != nil {
			return nil, err
		}
		out = append(out, o)
	}
	return out, nil
}

// launchedBy renders the launched_by block from the ancestor job.
func (s *Server) launchedBy(c *SerCtx, ancestor models.UnifiedJobBrief, ctx *jobContext) *OMap {
	if ancestor.LaunchType == "dependency" {
		return NewOMap().Set("id", nil).Set("name", "Generated by AWX").Set("type", "Dependency").Set("url", nil)
	}
	switch ancestor.LaunchType {
	case "manual", "relaunch":
		if u := c.UserSummary(ancestor.CreatedByID); u != nil {
			name, _ := u.Get("username")
			return NewOMap().Set("id", *ancestor.CreatedByID).Set("name", name).Set("type", "user").Set("url", URLFor("users", *ancestor.CreatedByID))
		}
	case "scheduled":
		if ancestor.ScheduleID != nil {
			if sb, ok := ctx.schedules[*ancestor.ScheduleID]; ok {
				return NewOMap().Set("id", sb.ID).Set("name", sb.Name).Set("type", "schedule").Set("url", URLFor("schedules", sb.ID))
			}
			var name string
			if err := s.Q().QueryRow(c.Ctx(), `SELECT name FROM main_schedule WHERE id = $1`, *ancestor.ScheduleID).Scan(&name); err == nil {
				return NewOMap().Set("id", *ancestor.ScheduleID).Set("name", name).Set("type", "schedule").Set("url", URLFor("schedules", *ancestor.ScheduleID))
			}
		}
	case "sync":
		// The ancestor's project: a project update's (or a job's).
		var id int64
		var name string
		if err := s.Q().QueryRow(c.Ctx(), `SELECT p.id, p.name FROM main_unifiedjob uj LEFT JOIN main_projectupdate pu ON pu.unifiedjob_ptr_id = uj.id LEFT JOIN main_job j ON j.unifiedjob_ptr_id = uj.id
			JOIN main_unifiedjobtemplate p ON p.id = COALESCE(pu.project_id, j.project_id) WHERE uj.id = $1`, ancestor.ID).Scan(&id, &name); err == nil {
			return NewOMap().Set("id", id).Set("name", name).Set("type", "project").Set("url", URLFor("projects", id))
		}
	case "scm":
		// An inventory update's inventory.
		// get_absolute_url() without a request: always the inventory view.
		var id int64
		var name string
		if err := s.Q().QueryRow(c.Ctx(), `SELECT v.id, v.name FROM main_inventoryupdate iu JOIN main_inventory v ON v.id = iu.inventory_id WHERE iu.unifiedjob_ptr_id = $1`, ancestor.ID).Scan(&id, &name); err == nil {
			return NewOMap().Set("id", id).Set("name", name).Set("type", "inventory").Set("url", URLFor("inventories", id))
		}
	case "webhook":
		if ancestor.TemplateID != nil {
			var name string
			var ct int64
			if err := s.Q().QueryRow(c.Ctx(), `SELECT name, polymorphic_ctype_id FROM main_unifiedjobtemplate WHERE id = $1`, *ancestor.TemplateID).Scan(&name, &ct); err == nil {
				typ := strings.TrimPrefix(s.CT.Model(ct), "main.")
				coll := "job_templates"
				if typ == "workflowjobtemplate" {
					typ = "workflow_job_template"
					coll = "workflow_job_templates"
				} else {
					typ = "job_template"
				}
				return NewOMap().Set("id", *ancestor.TemplateID).Set("name", name).Set("type", typ).Set("url", URLFor(coll, *ancestor.TemplateID))
			}
		}
	}
	return NewOMap()
}

// ancestorBrief resolves the ancestor of a job (itself unless spawned by a
// workflow).
func (s *Server) ancestorBrief(c *SerCtx, jb *models.UnifiedJob, ctx *jobContext) (models.UnifiedJobBrief, error) {
	self := models.UnifiedJobBrief{ID: jb.ID, Name: jb.Name, Description: jb.Description, Status: jb.Status, Failed: jb.Failed, Started: jb.Started, Finished: jb.Finished,
		Elapsed: jb.Elapsed, CanceledOn: jb.CanceledOn, LaunchType: jb.LaunchType, CreatedByID: jb.CreatedByID, ScheduleID: jb.ScheduleID, TemplateID: jb.UnifiedJobTemplateID, Type: models.JobTypeForContentType(s.CT, jb.PolymorphicCtypeID)}
	if jb.LaunchType != "workflow" {
		return self, nil
	}
	id, ok := ctx.ancestors[jb.ID]
	if !ok {
		var err error
		if id, err = models.AncestorJobID(c.Ctx(), s.Q(), jb.ID, jb.LaunchType); err != nil {
			return self, err
		}
	}
	if id == jb.ID {
		return self, nil
	}
	if b, ok := ctx.briefs[id]; ok {
		return b, nil
	}
	briefs, err := models.LoadUnifiedJobBriefs(c.Ctx(), s.Q(), s.CT, []int64{id})
	if err != nil {
		return self, err
	}
	if b, ok := briefs[id]; ok {
		ctx.briefs[id] = b
		return b, nil
	}
	return self, nil
}

// rawJSON decodes a stored JSON value keeping object key order (which is
// the jsonb order the old API showed); def is used for empty and null.
func rawJSON(raw json.RawMessage, def any) any {
	t := strings.TrimSpace(string(raw))
	if t == "" || t == "null" {
		return def
	}
	if strings.HasPrefix(t, "{") {
		o := NewOMap()
		if err := o.UnmarshalJSON([]byte(t)); err == nil {
			return o
		}
	}
	var v any
	if err := json.Unmarshal([]byte(t), &v); err != nil || v == nil {
		return def
	}
	return v
}

func (s *Server) serializeJob(c *SerCtx, jb *models.Job, ctx *jobContext, mode string) (*OMap, error) {
	detail := mode == "detail"
	full := mode != "list"
	related := NewOMap()
	setURL(related, "created_by", "users", jb.CreatedByID)
	setURL(related, "modified_by", "users", jb.ModifiedByID)
	related.Set("labels", SubURL("jobs", jb.ID, "labels"))
	setURL(related, "inventory", "inventories", jb.InventoryID)
	setURL(related, "project", "projects", jb.ProjectID)
	setURL(related, "organization", "organizations", jb.OrganizationID)
	related.Set("credentials", SubURL("jobs", jb.ID, "credentials"))
	if jb.UnifiedJobTemplateID != nil {
		if tb, ok := ctx.templates[*jb.UnifiedJobTemplateID]; ok {
			related.Set("unified_job_template", templateDetailURL(tb))
		}
	}
	setURL(related, "schedule", "schedules", jb.ScheduleID)
	related.Set("stdout", SubURL("jobs", jb.ID, "stdout"))
	wfID, spawned := ctx.wfJobs[jb.ID]
	if spawned {
		related.Set("source_workflow_job", URLFor("workflow_jobs", wfID))
	}
	setURL(related, "execution_environment", "execution_environments", jb.ExecutionEnvironmentID)
	related.Set("job_events", SubURL("jobs", jb.ID, "job_events"))
	related.Set("job_host_summaries", SubURL("jobs", jb.ID, "job_host_summaries"))
	related.Set("activity_stream", SubURL("jobs", jb.ID, "activity_stream"))
	related.Set("notifications", SubURL("jobs", jb.ID, "notifications"))
	related.Set("create_schedule", SubURL("jobs", jb.ID, "create_schedule"))
	setURL(related, "job_template", "job_templates", jb.JobTemplateID)
	related.Set("cancel", SubURL("jobs", jb.ID, "cancel"))
	setURL(related, "project_update", "project_updates", jb.ProjectUpdateID)
	related.Set("relaunch", SubURL("jobs", jb.ID, "relaunch"))

	summary := NewOMap()
	c.putSummary(summary, "organization", c.OrgSummary, jb.OrganizationID)
	if c.WantSummary("inventory") && jb.InventoryID != nil {
		if inv, ok := ctx.invs[*jb.InventoryID]; ok {
			summary.Set("inventory", inventorySummaryMap(inv))
		}
	}
	c.putSummary(summary, "execution_environment", c.EESummary, jb.ExecutionEnvironmentID)
	if c.WantSummary("project") && jb.ProjectID != nil {
		if p, ok := ctx.projects[*jb.ProjectID]; ok {
			summary.Set("project", projectBriefMap(p))
		}
	}
	if c.WantSummary("project_update") && jb.ProjectUpdateID != nil {
		if b, ok := ctx.briefs[*jb.ProjectUpdateID]; ok {
			summary.Set("project_update", NewOMap().Set("id", b.ID).Set("name", b.Name).Set("description", b.Description).Set("status", b.Status).Set("failed", b.Failed))
		}
	}
	if c.WantSummary("job_template") && jb.JobTemplateID != nil {
		if tb, ok := ctx.templates[*jb.JobTemplateID]; ok {
			summary.Set("job_template", NewOMap().Set("id", tb.ID).Set("name", tb.Name).Set("description", tb.Description).Set("prevent_relaunch", tb.PreventRelaunch))
		}
	}
	if c.WantSummary("schedule") && jb.ScheduleID != nil {
		if sb, ok := ctx.schedules[*jb.ScheduleID]; ok {
			summary.Set("schedule", NewOMap().Set("id", sb.ID).Set("name", sb.Name).Set("description", sb.Description).Set("next_run", models.FormatTimePtr(sb.NextRun)))
		}
	}
	if c.WantSummary("unified_job_template") && jb.UnifiedJobTemplateID != nil {
		if tb, ok := ctx.templates[*jb.UnifiedJobTemplateID]; ok {
			summary.Set("unified_job_template", NewOMap().Set("id", tb.ID).Set("name", tb.Name).Set("description", tb.Description).Set("unified_job_type", tb.Type))
		}
	}
	if c.WantSummary("instance_group") && jb.InstanceGroupID != nil {
		if ig, ok := ctx.igs[*jb.InstanceGroupID]; ok {
			summary.Set("instance_group", NewOMap().Set("id", ig.ID).Set("name", ig.Name).Set("is_container_group", ig.IsContainerGroup))
		}
	}
	c.putSummary(summary, "created_by", c.UserSummary, jb.CreatedByID)
	c.putSummary(summary, "modified_by", c.UserSummary, jb.ModifiedByID)
	if c.WantSummary("user_capabilities") {
		summary.Set("user_capabilities", s.jobCapabilities(c, jb, ctx))
	}
	if c.WantSummary("labels") {
		summary.Set("labels", labelsSummary(ctx.labels[jb.ID]))
	}
	if c.WantSummary("source_workflow_job") && jb.LaunchType == "workflow" {
		src := NewOMap()
		if spawned {
			if b, ok := ctx.briefs[wfID]; ok {
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
	ancestor, err := s.ancestorBrief(c, &jb.UnifiedJob, ctx)
	if err != nil {
		return nil, err
	}
	if c.IsDetailView && c.WantSummary("ancestor_job") && ancestor.ID != jb.ID {
		summary.Set("ancestor_job", NewOMap().Set("id", ancestor.ID).Set("name", ancestor.Name).Set("type", ancestor.Type).Set("url", models.JobDetailURL(ancestor.Type, ancestor.ID)))
	}
	if c.WantSummary("credentials") {
		summary.Set("credentials", credentialsSummary(ctx.creds[jb.ID]))
	}

	o := Base(NewOMap(), jb.ID, "job", URLFor("jobs", jb.ID), related, summary, jb.Created, jb.Modified, jb.Name, jb.Description)
	options := func() {
		o.Set("job_type", jb.JobType).Set("inventory", models.NullableID(jb.InventoryID)).Set("project", models.NullableID(jb.ProjectID))
		playbook := jb.Playbook
		if jb.ProjectID == nil {
			playbook = ""
		}
		o.Set("playbook", playbook).Set("scm_branch", jb.SCMBranch).Set("forks", jb.Forks).Set("limit", jb.Limit).Set("job_slice_pinned_hosts", jb.JobSlicePinnedHosts)
		o.Set("verbosity", jb.Verbosity)
		if full || includes(c.R, "extra_vars") {
			o.Set("extra_vars", displayExtraVars(jb))
		}
		o.Set("job_tags", jb.JobTags).Set("force_handlers", jb.ForceHandlers).Set("skip_tags", jb.SkipTags).Set("start_at_task", jb.StartAtTask)
		o.Set("timeout", jb.Timeout).Set("use_fact_cache", jb.UseFactCache).Set("organization", models.NullableID(jb.OrganizationID))
	}
	if full {
		options()
	}
	o.Set("unified_job_template", models.NullableID(jb.UnifiedJobTemplateID)).Set("launch_type", jb.LaunchType).Set("status", jb.Status)
	o.Set("execution_environment", models.NullableID(jb.ExecutionEnvironmentID)).Set("failed", jb.Failed)
	o.Set("started", models.FormatTimePtr(jb.Started)).Set("finished", models.FormatTimePtr(jb.Finished)).Set("canceled_on", models.FormatTimePtr(jb.CanceledOn))
	o.Set("elapsed", elapsedNow(&jb.UnifiedJob))
	if full {
		o.Set("job_args", jb.JobArgs).Set("job_cwd", jb.JobCwd).Set("job_env", rawJSON(jb.JobEnv, map[string]any{}))
	}
	o.Set("job_explanation", c.Loc().Gettext(jb.JobExplanation)).Set("execution_node", jb.ExecutionNode).Set("controller_node", jb.ControllerNode)
	if full {
		o.Set("result_traceback", jb.ResultTraceback)
		o.Set("event_processing_finished", s.eventProcessingFinished(c, &jb.UnifiedJob, "main_jobevent", "job_id"))
	}
	o.Set("launched_by", s.launchedBy(c, ancestor, ctx)).Set("work_unit_id", nullIfEmpty(jb.WorkUnitID))
	if !full {
		options()
	}
	o.Set("job_template", models.NullableID(jb.JobTemplateID)).Set("passwords_needed_to_start", passwordsNeeded(ctx.creds[jb.ID]))
	o.Set("allow_simultaneous", jb.AllowSimultaneous)
	if full || includes(c.R, "artifacts") {
		o.Set("artifacts", displayArtifacts(jb))
	}
	o.Set("scm_revision", jb.SCMRevision).Set("instance_group", models.NullableID(jb.InstanceGroupID)).Set("diff_mode", jb.DiffMode)
	o.Set("job_slice_number", jb.JobSliceNumber).Set("job_slice_count", jb.JobSliceCount).Set("webhook_service", jb.WebhookService)
	o.Set("webhook_credential", models.NullableID(jb.WebhookCredentialID)).Set("webhook_guid", jb.WebhookGUID)
	if detail {
		o.Set("host_status_counts", rawJSON(jb.HostStatusCounts, nil))
		var plays, tasks int64
		_ = db.Tolerant(s.Q()).QueryRow(c.Ctx(), `SELECT count(*) FILTER (WHERE event = 'playbook_on_play_start'), count(*) FILTER (WHERE event = 'playbook_on_task_start') FROM main_jobevent WHERE job_id = $1 AND job_created = $2`, jb.ID, jb.Created).Scan(&plays, &tasks)
		o.Set("playbook_counts", NewOMap().Set("play_count", plays).Set("task_count", tasks))
	}
	return o, nil
}

// includes reports whether ?include= named a stripped list field.
func includes(r *http.Request, field string) bool {
	for _, n := range strings.Split(r.URL.Query().Get("include"), ",") {
		if strings.TrimSpace(n) == field {
			return true
		}
	}
	return false
}

func templateDetailURL(tb templateBrief) string {
	switch tb.Type {
	case "job":
		return URLFor("job_templates", tb.ID)
	case "project_update":
		return URLFor("projects", tb.ID)
	case "inventory_update":
		return URLFor("inventory_sources", tb.ID)
	case "system_job":
		return URLFor("system_job_templates", tb.ID)
	case "workflow_job":
		return URLFor("workflow_job_templates", tb.ID)
	case "workflow_approval":
		return URLFor("workflow_approval_templates", tb.ID)
	}
	return URLFor("unified_job_templates", tb.ID)
}

// displayExtraVars hides survey password answers.
func displayExtraVars(jb *models.Job) string {
	passwords := jb.SurveyPasswordsMap()
	if len(passwords) == 0 {
		return jb.ExtraVars
	}
	vars, err := ParseVars(jb.ExtraVars)
	if err != nil {
		return jb.ExtraVars
	}
	for k, v := range passwords {
		if _, ok := vars[k]; ok {
			vars[k] = v
		}
	}
	b, _ := json.Marshal(vars)
	return string(b)
}

// displayArtifacts hides artifacts marked no_log.
func displayArtifacts(jb *models.Job) any {
	var v map[string]any
	if jb.Artifacts != "" {
		if err := json.Unmarshal([]byte(jb.Artifacts), &v); err != nil {
			return map[string]any{}
		}
	}
	if v == nil {
		v = map[string]any{}
	}
	if nolog, _ := v["_ansible_no_log"].(bool); nolog {
		return "$hidden due to Ansible no_log flag$"
	}
	o := NewOMap()
	_ = o.UnmarshalJSON([]byte(jb.Artifacts))
	if o.Len() == 0 {
		return map[string]any{}
	}
	return o
}

// eventProcessingFinished reports whether every emitted event was saved.
func (s *Server) eventProcessingFinished(c *SerCtx, jb *models.UnifiedJob, table, column string) bool {
	if models.ActiveStatuses[jb.Status] {
		return false
	}
	var n int64
	if err := s.Q().QueryRow(c.Ctx(), `SELECT count(*) FROM `+table+` WHERE `+column+` = $1 AND job_created = $2`, jb.ID, jb.Created).Scan(&n); err != nil {
		return false
	}
	return n == jb.EmittedEvents
}

func (s *Server) jobCapabilities(c *SerCtx, jb *models.Job, ctx *jobContext) *OMap {
	canDelete := c.User != nil && c.User.IsSuperuser
	if !canDelete && jb.OrganizationID != nil {
		canDelete = c.HasRoleOn("main.organization", *jb.OrganizationID, "admin_role")
	}
	start := true
	prevented := jb.PreventRelaunch
	if jb.JobTemplateID != nil {
		if tb, ok := ctx.templates[*jb.JobTemplateID]; ok {
			prevented = tb.PreventRelaunch
		}
		start = c.HasRoleOn("main.jobtemplate", *jb.JobTemplateID, "execute_role")
	}
	if prevented {
		start = false
	}
	return Caps("delete", canDelete, "start", start)
}

// jobObj is a job: readable through its job template, or by an admin or
// auditor of its organization.
var jobObj = &pathObject[*models.Job]{
	model: "Job",
	get:   models.GetJob,
	readable: func(c *SerCtx, v *models.Job) bool {
		return (v.JobTemplateID != nil && c.HasRoleOn("main.jobtemplate", *v.JobTemplateID, "read_role")) || orgAdminOrAuditor(c, v.OrganizationID)
	},
}

// orgAdminOrAuditor reports whether c's user is an admin or auditor of
// organization id, directly: how a job without a readable template is read.
func orgAdminOrAuditor(c *SerCtx, id *int64) bool {
	if id == nil {
		return false
	}
	var direct bool
	_ = db.Tolerant(c.Q()).QueryRow(c.Ctx(), `SELECT EXISTS (SELECT 1 FROM main_organization o JOIN main_rbac_roles_members m ON m.role_id IN (o.admin_role_id, o.auditor_role_id) WHERE o.id = $1 AND m.user_id = $2)`, *id, c.User.ID).Scan(&direct)
	return direct
}

func (s *Server) jobDetail(w http.ResponseWriter, r *http.Request) error {
	_, jb, err := jobObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	results, err := s.serializeJobs(c, []*models.Job{jb}, "detail")
	if err != nil {
		return err
	}
	WriteJSON(w, 200, results[0])
	return nil
}

func (s *Server) jobDelete(w http.ResponseWriter, r *http.Request) error {
	u, jb, err := jobObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	if !u.IsSuperuser && (jb.OrganizationID == nil || !c.HasRoleOn("main.organization", *jb.OrganizationID, "admin_role")) {
		return ErrForbidden
	}
	ctx := r.Context()
	if err := s.checkUnifiedJobDelete(ctx, jb.ID, "main_jobevent", "job_id"); err != nil {
		return err
	}
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `DELETE FROM main_jobevent WHERE job_id = $1 AND job_created = $2`, jb.ID, jb.Created); err != nil {
			return err
		}
		return s.Cascade.Delete(ctx, tx, "main_unifiedjob", "id", []int64{jb.ID})
	})
	if err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// checkUnifiedJobDelete is UnifiedJobDeletionMixin.destroy after its access
// check: a job of a node (current or a retried attempt) of a running
// workflow, an active job other than a new one, and a job finished less
// than a minute ago whose events are still coming in (eventTable names its
// event table; "" for a kind without events) are refused.
func (s *Server) checkUnifiedJobDelete(ctx context.Context, id int64, eventTable, eventColumn string) error {
	var wfActive bool
	if err := s.Q().QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM main_workflowjobnode n JOIN main_unifiedjob w ON w.id = n.workflow_job_id
			WHERE n.job_id = $1 AND w.status IN ('new','pending','waiting','running'))
		OR EXISTS (SELECT 1 FROM main_workflowjobnode_retried_jobs r JOIN main_workflowjobnode n ON n.id = r.workflowjobnode_id JOIN main_unifiedjob w ON w.id = n.workflow_job_id
			WHERE r.unifiedjob_id = $1 AND w.status IN ('new','pending','waiting','running'))`, id).Scan(&wfActive); err != nil {
		return err
	}
	if wfActive {
		return Detail(http.StatusForbidden, "Cannot delete job resource when associated workflow job is running.")
	}
	var uj models.UnifiedJob
	if err := s.Q().QueryRow(ctx, `SELECT id, status, finished, created, emitted_events FROM main_unifiedjob WHERE id = $1`, id).Scan(&uj.ID, &uj.Status, &uj.Finished, &uj.Created, &uj.EmittedEvents); err != nil {
		return err
	}
	// Still allow deletion of new status, because these can be manually created.
	if models.ActiveStatuses[uj.Status] && uj.Status != "new" {
		return Detail(http.StatusForbidden, "Cannot delete running job resource.")
	}
	if eventTable == "" || uj.Finished == nil || time.Since(*uj.Finished) >= time.Minute {
		// No events, or no finish time, or finished over a minute ago
		// (events probably lost): the job may go.
		return nil
	}
	// event_processing_finished: never while active (only a new job gets
	// here), otherwise when every emitted event is saved.
	processed := false
	if !models.ActiveStatuses[uj.Status] {
		var n int64
		if err := s.Q().QueryRow(ctx, `SELECT count(*) FROM `+eventTable+` WHERE `+eventColumn+` = $1 AND job_created = $2`, uj.ID, uj.Created).Scan(&n); err != nil {
			return err
		}
		processed = n == uj.EmittedEvents
	}
	if !processed {
		return &APIError{Status: http.StatusBadRequest, Body: map[string]any{"error": "Job has not finished processing events."}}
	}
	return nil
}

// --- sub-lists ---------------------------------------------------------------

func (s *Server) jobCredentials(w http.ResponseWriter, r *http.Request) error {
	_, jb, err := jobObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	return s.credentialListWith(w, r, func(q *Query) {
		q.AddJoin("JOIN main_unifiedjob_credentials jcl ON jcl.credential_id = c.id")
		q.And("jcl.unifiedjob_id = " + q.Arg(jb.ID))
	})
}

func (s *Server) jobLabels(w http.ResponseWriter, r *http.Request) error {
	_, jb, err := jobObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	return s.labelListWith(w, r, func(q *Query) {
		q.AddJoin("JOIN main_unifiedjob_labels jll ON jll.label_id = l.id")
		q.And("jll.unifiedjob_id = " + q.Arg(jb.ID))
	})
}

// --- events ------------------------------------------------------------------

var jobEventFields = &FieldSet{
	Model: "JobEvent",
	Fields: map[string]Field{
		"id": {SQL: "e.id", Kind: KindInt}, "event": {SQL: "e.event"}, "counter": {SQL: "e.counter", Kind: KindInt}, "stdout": {SQL: "e.stdout"},
		"failed": {SQL: "e.failed", Kind: KindBool}, "changed": {SQL: "e.changed", Kind: KindBool}, "uuid": {SQL: "e.uuid"}, "parent_uuid": {SQL: "e.parent_uuid"},
		"playbook": {SQL: "e.playbook"}, "play": {SQL: "e.play"}, "task": {SQL: "e.task"}, "role": {SQL: "e.role"}, "verbosity": {SQL: "e.verbosity", Kind: KindInt},
		"start_line": {SQL: "e.start_line", Kind: KindInt}, "end_line": {SQL: "e.end_line", Kind: KindInt}, "created": {SQL: "e.created", Kind: KindDateTime},
		"modified": {SQL: "e.modified", Kind: KindDateTime}, "job": {SQL: "e.job_id", Kind: KindFK}, "host": {SQL: "e.host_id", Kind: KindFK}, "host_name": {SQL: "e.host_name"},
		"event_data": {SQL: "e.event_data", Kind: KindJSON}, "job_created": {SQL: "e.job_created", Kind: KindDateTime},
	},
	SearchFields: []string{"stdout"},
}

const jobEventColumns = eventColumns + `, e.job_id, e.host_id, e.host_name, e.parent_uuid`

// eventDataOut renders an event's event_data as the old JSONBlob field
// did, json.loads of the stored text: keys in the stored order (a Go map
// would sort them) and numbers as written.
func eventDataOut(e *models.JobEvent) any {
	if strings.TrimSpace(e.EventDataText) != "" {
		if v, err := decodeOrdered(e.EventDataText); err == nil {
			if o, ok := v.(*OMap); ok {
				return o
			}
		}
	}
	return e.EventData
}

// redactURIsOrdered is redact.URIsIn for decoded values that keep their
// key order.
func redactURIsOrdered(v any) any {
	switch t := v.(type) {
	case *OMap:
		out := NewOMap()
		for _, k := range t.Keys() {
			x, _ := t.Get(k)
			out.Set(redact.URIs(k), redactURIsOrdered(x))
		}
		return out
	case []any:
		out := make([]any, len(t))
		for i, x := range t {
			out[i] = redactURIsOrdered(x)
		}
		return out
	}
	return redact.URIsIn(v)
}

func scanJobEvent(rows pgx.Rows) (any, error) {
	e := &models.JobEvent{}
	var data string
	var jobID *int64
	if err := rows.Scan(&e.ID, &e.Created, &e.Modified, &e.Event, &data, &e.Failed, &e.Changed, &e.UUID, &e.Playbook, &e.Play, &e.Role, &e.Task, &e.Counter, &e.Stdout, &e.Verbosity, &e.StartLine, &e.EndLine, &jobID, &e.HostID, &e.HostName, &e.ParentUUID); err != nil {
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

// truncateStdout shortens stdout for list views, keeping colour escapes
// balanced, as truncate_stdout did.
func truncateStdout(stdout string, size int) string {
	if size <= 0 || len([]rune(stdout)) <= size {
		return stdout
	}
	runes := []rune(stdout)
	out := string(runes[:size-1]) + "…"
	set, reset := 0, 0
	for _, m := range ansiSGRRe.FindAllString(out, -1) {
		if m == "\x1b[0m" {
			reset++
		} else {
			set++
		}
	}
	return out + strings.Repeat("\x1b[0m", max(0, set-reset))
}

func (s *Server) jobEventsListWith(w http.ResponseWriter, r *http.Request, jb *models.Job, extra func(q *Query), defaultOrder []string) error {
	spec := ListSpec{Model: "JobEvent", From: "main_jobevent e", Columns: jobEventColumns, PK: "e.id", Fields: jobEventFields, DefaultOrder: defaultOrder}
	limitMode := false
	if limit := r.URL.Query().Get("limit"); limit != "" {
		limitMode = true
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
	rows, count, page, err := s.RunList(r, spec, extra, scanJobEvent)
	if err != nil {
		return err
	}
	noTruncate := r.URL.Query().Get("no_truncate") != "" || r.PathValue("id") == ""
	maxBytes := int(s.Settings.Int(r.Context(), "EVENT_STDOUT_MAX_BYTES_DISPLAY"))
	if maxBytes == 0 {
		maxBytes = 1024
	}
	var hostIDs []int64
	for _, row := range rows {
		if e := row.(*models.JobEvent); e.HostID != nil {
			hostIDs = append(hostIDs, *e.HostID)
		}
	}
	s.preloadEventHosts(r.Context(), hostIDs)
	results := make([]any, 0, len(rows))
	for _, row := range rows {
		e := row.(*models.JobEvent)
		results = append(results, s.serializeJobEvent(r.Context(), e, jb, !noTruncate, maxBytes))
	}
	w.Header().Set("X-UI-Max-Events", strconv.FormatInt(s.Settings.Int(r.Context(), "MAX_UI_JOB_EVENTS"), 10))
	if limitMode {
		WriteJSON(w, 200, NewOMap().Set("results", results))
		return nil
	}
	WriteJSON(w, 200, Paginate(r, page, count, results))
	return nil
}

func (s *Server) jobEvents(w http.ResponseWriter, r *http.Request) error {
	_, jb, err := jobObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	return s.jobEventsListWith(w, r, jb, func(q *Query) { q.And("e.job_id = " + q.Arg(jb.ID) + " AND e.job_created = " + q.Arg(jb.Created)) }, []string{"start_line"})
}

func (s *Server) serializeJobEvent(ctx context.Context, e *models.JobEvent, jb *models.Job, truncate bool, maxBytes int) *OMap {
	o := NewOMap()
	o.Set("id", e.ID).Set("type", "job_event").Set("url", URLFor("job_events", e.ID))
	related := NewOMap().Set("job", URLFor("jobs", jb.ID)).Set("children", SubURL("job_events", e.ID, "children"))
	setURL(related, "host", "hosts", e.HostID)
	o.Set("related", related)
	summary := NewOMap()
	job := NewOMap().Set("id", jb.ID).Set("name", jb.Name).Set("description", jb.Description).Set("status", jb.Status).Set("failed", jb.Failed)
	if jb.Started != nil {
		job.Set("started", models.FormatTime(*jb.Started))
	}
	job.Set("elapsed", elapsedNow(&jb.UnifiedJob)).Set("type", "job")
	if jb.CanceledOn != nil {
		job.Set("canceled_on", models.FormatTime(*jb.CanceledOn))
	}
	if jb.JobTemplateID != nil {
		// The same for every event of the job: read once per request.
		name := memoized(ctx, "ujtName/"+itoa(*jb.JobTemplateID), func() *string {
			var name string
			if err := s.Q().QueryRow(ctx, `SELECT name FROM main_unifiedjobtemplate WHERE id = $1`, *jb.JobTemplateID).Scan(&name); err != nil {
				return nil
			}
			return &name
		})
		if name != nil {
			job.Set("job_template_id", *jb.JobTemplateID).Set("job_template_name", *name)
		}
	}
	summary.Set("job", job)
	if e.HostID != nil {
		if h := s.eventHost(ctx, *e.HostID); h != nil {
			summary.Set("host", NewOMap().Set("id", *e.HostID).Set("name", h.name).Set("description", h.description))
		}
	}
	summary.Set("role", NewOMap())
	o.Set("summary_fields", summary)
	o.Set("created", models.FormatTime(e.Created)).Set("modified", models.FormatTime(e.Modified))
	o.Set("job", jb.ID).Set("event", e.Event).Set("counter", e.Counter).Set("event_display", EventDisplayIn(locCtx(ctx), e.Event, e.Play, e.Task, e.Role, e.EventData))
	o.Set("event_data", eventDataOut(e))
	lvl := 0
	if t, ok := eventTypes[e.Event]; ok {
		lvl = t.Level
	}
	o.Set("event_level", lvl).Set("failed", e.Failed).Set("changed", e.Changed).Set("uuid", e.UUID).Set("parent_uuid", e.ParentUUID)
	o.Set("host", models.NullableID(e.HostID)).Set("host_name", e.HostName).Set("playbook", e.Playbook).Set("play", e.Play).Set("task", e.Task).Set("role", e.Role)
	stdout := e.Stdout
	if truncate && !strings.HasPrefix(e.Event, "playbook_on") {
		stdout = truncateStdout(stdout, maxBytes)
	}
	o.Set("stdout", stdout).Set("start_line", e.StartLine).Set("end_line", e.EndLine).Set("verbosity", e.Verbosity)
	return o
}

// ansiSGRRe matches colour escape sequences.
var ansiSGRRe = regexp.MustCompile(`\x1b\[[0-9;]*m`)

func base64Std(s string) string { return base64.StdEncoding.EncodeToString([]byte(s)) }

// jobEventIn is a job event with its job.
type jobEventIn struct {
	e   *models.JobEvent
	job *models.Job
}

// jobEventObj is a job event, readable through its job.
var jobEventObj = &pathObject[jobEventIn]{
	model: "JobEvent",
	get: func(ctx context.Context, q db.Querier, id int64) (jobEventIn, error) {
		e, err := scanFirst[*models.JobEvent](ctx, q, `SELECT `+jobEventColumns+` FROM main_jobevent e WHERE e.id = $1`, []any{id}, scanJobEvent)
		if err != nil {
			return jobEventIn{}, err
		}
		jb, err := models.GetJob(ctx, q, e.JobID)
		return jobEventIn{e, jb}, err
	},
	readable: func(c *SerCtx, v jobEventIn) bool { return jobObj.readable(c, v.job) },
}

func (s *Server) jobEventDetail(w http.ResponseWriter, r *http.Request) error {
	_, ev, err := jobEventObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	e, jb := ev.e, ev.job
	WriteJSON(w, 200, s.serializeJobEvent(r.Context(), e, jb, false, 0))
	return nil
}

func (s *Server) jobEventChildren(w http.ResponseWriter, r *http.Request) error {
	_, ev, err := jobEventObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	e, jb := ev.e, ev.job
	return s.jobEventsListWith(w, r, jb, func(q *Query) {
		q.And("e.job_id = " + q.Arg(jb.ID) + " AND e.job_created = " + q.Arg(jb.Created))
		q.And("e.parent_uuid = " + q.Arg(e.UUID))
	}, []string{"id"})
}

var metaEvents = map[string]bool{"debug": true, "verbose": true, "warning": true, "error": true, "system_warning": true, "deprecated": true}

// jobEventsChildrenSummary reproduces JobJobEventsChildrenSummary: for each
// event with children, its row number and total descendant count, plus the
// parent assigned to each meta event.
func (s *Server) jobEventsChildrenSummary(w http.ResponseWriter, r *http.Request) error {
	_, jb, err := jobObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	resp := NewOMap().Set("children_summary", NewOMap()).Set("meta_event_nested_uuid", NewOMap()).Set("event_processing_finished", false).Set("is_tree", true)
	c := s.NewSerCtx(r, true)
	if !s.eventProcessingFinished(c, &jb.UnifiedJob, "main_jobevent", "job_id") {
		WriteJSON(w, 200, resp)
		return nil
	}
	resp.Set("event_processing_finished", true)
	type ev struct {
		counter    int64
		uuid       string
		parentUUID string
		event      string
	}
	rows, err := s.Q().Query(r.Context(), `SELECT counter, uuid, parent_uuid, event FROM main_jobevent WHERE job_id = $1 AND job_created = $2 ORDER BY counter`, jb.ID, jb.Created)
	if err != nil {
		return err
	}
	var events []ev
	for rows.Next() {
		var e ev
		if err := rows.Scan(&e.counter, &e.uuid, &e.parentUUID, &e.event); err != nil {
			rows.Close()
			return err
		}
		events = append(events, e)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	if len(events) == 0 {
		WriteJSON(w, 200, resp)
		return nil
	}
	type tally struct{ row, children int }
	tallies := map[int64]*tally{}
	uuidCounter := map[string]int64{}
	uuidParent := map[string]string{}
	for _, e := range events {
		tallies[e.counter] = &tally{}
		uuidCounter[e.uuid] = e.counter
		uuidParent[e.uuid] = e.parentUUID
	}
	metaNested := NewOMap()
	levelFor := func(event string) int {
		if t, ok := eventTypes[event]; ok {
			return t.Level
		}
		return 0
	}
	levelCurrent := []string{"", "", "", ""}
	prevNonMeta := events[0]
	for i, e := range events {
		if !metaEvents[e.event] {
			prevNonMeta = e
		}
		if e.uuid == "" {
			continue
		}
		if !metaEvents[e.event] {
			level := levelFor(e.event)
			levelCurrent[level] = e.uuid
			for u := level + 1; u < len(levelCurrent); u++ {
				levelCurrent[u] = ""
			}
		}
		puuid := e.parentUUID
		if puuid != "" {
			found := false
			for _, lc := range levelCurrent {
				if lc == puuid {
					found = true
				}
			}
			if !found {
				resp.Set("is_tree", false)
				WriteJSON(w, 200, resp)
				return nil
			}
		}
		if metaEvents[e.event] {
			levelBefore := levelFor(prevNonMeta.event)
			next := events[len(events)-1]
			for z := i; z < len(events); z++ {
				if !metaEvents[events[z].event] {
					next = events[z]
					break
				}
			}
			levelAfter := levelFor(next.event)
			if levelAfter != 0 && levelAfter > levelBefore {
				puuid = next.parentUUID
			} else {
				puuid = prevNonMeta.parentUUID
			}
			if puuid != "" {
				metaNested.Set(strconv.FormatInt(e.counter, 10), puuid)
			}
		}
		tallies[e.counter].row = i
		if puuid == "" {
			continue
		}
		for _, ctr := range eventAncestors(puuid, uuidCounter, uuidParent) {
			tallies[ctr].children++
		}
	}
	summary := NewOMap()
	for _, e := range events {
		t := tallies[e.counter]
		if t.children != 0 {
			summary.Set(strconv.FormatInt(e.counter, 10), NewOMap().Set("rowNumber", t.row).Set("numChildren", t.children))
		}
	}
	resp.Set("children_summary", summary).Set("meta_event_nested_uuid", metaNested)
	WriteJSON(w, 200, resp)
	return nil
}

// eventAncestors is the counters of the events up the parent_uuid chain
// from puuid, nearest first, stopping at an event the job does not have.
// Event uuids come from the job's output, so a playbook or execution
// environment can write a cycle (an event its own parent): the walk takes
// at most one step per event, where the old view's loop never ended.
func eventAncestors(puuid string, uuidCounter map[string]int64, uuidParent map[string]string) []int64 {
	var out []int64
	for steps := 0; puuid != "" && steps <= len(uuidParent); steps++ {
		ctr, ok := uuidCounter[puuid]
		if !ok {
			break
		}
		out = append(out, ctr)
		puuid = uuidParent[puuid]
	}
	return out
}

// --- host summaries ----------------------------------------------------------

var jobHostSummaryFields = &FieldSet{
	Model: "JobHostSummary",
	Fields: map[string]Field{
		"id": {SQL: "hs.id", Kind: KindInt}, "created": {SQL: "hs.created", Kind: KindDateTime}, "modified": {SQL: "hs.modified", Kind: KindDateTime},
		"host_name": {SQL: "hs.host_name"}, "changed": {SQL: "hs.changed", Kind: KindInt}, "dark": {SQL: "hs.dark", Kind: KindInt}, "failures": {SQL: "hs.failures", Kind: KindInt},
		"ok": {SQL: "hs.ok", Kind: KindInt}, "processed": {SQL: "hs.processed", Kind: KindInt}, "skipped": {SQL: "hs.skipped", Kind: KindInt}, "failed": {SQL: "hs.failed", Kind: KindBool},
		"ignored": {SQL: "hs.ignored", Kind: KindInt}, "rescued": {SQL: "hs.rescued", Kind: KindInt}, "host": {SQL: "hs.host_id", Kind: KindFK}, "job": {SQL: "hs.job_id", Kind: KindFK},
		"constructed_host": {SQL: "hs.constructed_host_id", Kind: KindFK},
	},
	SearchFields: []string{"host_name"},
}

func (s *Server) jobHostSummaries(w http.ResponseWriter, r *http.Request) error {
	_, jb, err := jobObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	spec := ListSpec{Model: "JobHostSummary", From: "main_jobhostsummary hs", Columns: models.JobHostSummaryColumns, PK: "hs.id", Fields: jobHostSummaryFields, DefaultOrder: []string{"-id"}}
	summaries, count, page, err := runListOf(s, r, spec, func(q *Query) { q.And("hs.job_id = " + q.Arg(jb.ID)) }, models.ScanJobHostSummary)
	if err != nil {
		return err
	}
	results := make([]any, 0, len(summaries))
	for _, hs := range summaries {
		results = append(results, s.serializeJobHostSummary(r, hs, jb))
	}
	WriteJSON(w, 200, Paginate(r, page, count, results))
	return nil
}

func (s *Server) jobHostSummaryDetail(w http.ResponseWriter, r *http.Request) error {
	u, err := RequireUser(r)
	if err != nil {
		return err
	}
	id, err := PathID(r)
	if err != nil {
		return NotFoundFor("JobHostSummary")
	}
	hs, err := models.ScanJobHostSummary(s.Q().QueryRow(r.Context(), `SELECT `+models.JobHostSummaryColumns+` FROM main_jobhostsummary hs WHERE hs.id = $1`, id))
	if err != nil {
		if db.IsNoRows(err) {
			return NotFoundFor("JobHostSummary")
		}
		return err
	}
	// Readable with its job.
	jb, err := jobObj.load(s, r, u, hs.JobID)
	if err != nil {
		return err
	}
	WriteJSON(w, 200, s.serializeJobHostSummary(r, hs, jb))
	return nil
}

func (s *Server) serializeJobHostSummary(r *http.Request, hs *models.JobHostSummary, jb *models.Job) *OMap {
	o := NewOMap()
	o.Set("id", hs.ID).Set("type", "job_host_summary").Set("url", URLFor("job_host_summaries", hs.ID))
	related := NewOMap().Set("job", URLFor("jobs", jb.ID))
	setURL(related, "host", "hosts", hs.HostID)
	o.Set("related", related)
	summary := NewOMap()
	if hs.HostID != nil {
		var name, desc string
		if err := s.Q().QueryRow(r.Context(), `SELECT name, description FROM main_host WHERE id = $1`, *hs.HostID).Scan(&name, &desc); err == nil {
			summary.Set("host", NewOMap().Set("id", *hs.HostID).Set("name", name).Set("description", desc))
		}
	}
	if hs.ConstructedHostID != nil {
		var name, desc string
		if err := s.Q().QueryRow(r.Context(), `SELECT name, description FROM main_host WHERE id = $1`, *hs.ConstructedHostID).Scan(&name, &desc); err == nil {
			summary.Set("constructed_host", NewOMap().Set("id", *hs.ConstructedHostID).Set("name", name).Set("description", desc))
		}
	}
	job := NewOMap().Set("id", jb.ID).Set("name", jb.Name).Set("description", jb.Description).Set("status", jb.Status).Set("failed", jb.Failed)
	if jb.Started != nil {
		job.Set("started", models.FormatTime(*jb.Started))
	}
	job.Set("elapsed", elapsedNow(&jb.UnifiedJob)).Set("type", "job")
	if jb.CanceledOn != nil {
		job.Set("canceled_on", models.FormatTime(*jb.CanceledOn))
	}
	if jb.JobTemplateID != nil {
		var name string
		if err := s.Q().QueryRow(r.Context(), `SELECT name FROM main_unifiedjobtemplate WHERE id = $1`, *jb.JobTemplateID).Scan(&name); err == nil {
			job.Set("job_template_id", *jb.JobTemplateID).Set("job_template_name", name)
		}
	}
	summary.Set("job", job)
	o.Set("summary_fields", summary)
	o.Set("created", models.FormatTime(hs.Created)).Set("modified", models.FormatTime(hs.Modified))
	o.Set("job", jb.ID).Set("host", models.NullableID(hs.HostID)).Set("constructed_host", models.NullableID(hs.ConstructedHostID)).Set("host_name", hs.HostName)
	o.Set("changed", hs.Changed).Set("dark", hs.Dark).Set("failures", hs.Failures).Set("ok", hs.OK).Set("processed", hs.Processed).Set("skipped", hs.Skipped)
	o.Set("failed", hs.Failed).Set("ignored", hs.Ignored).Set("rescued", hs.Rescued)
	return o
}

// --- stdout ------------------------------------------------------------------

func (s *Server) jobStdoutView(w http.ResponseWriter, r *http.Request) error {
	_, jb, err := jobObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	return s.unifiedJobStdout(w, r, "main_jobevent", "job_id", jb.ID, jb.Created, "job")
}

// unifiedJobStdout serves collected stdout in the old formats: json (a line
// range plus content), ansi, txt, the download variants, and an html page.
func (s *Server) unifiedJobStdout(w http.ResponseWriter, r *http.Request, table, column string, id int64, created time.Time, typeName string) error {
	// The renderers in order (api, html, txt, ansi, json, downloads): a
	// request without ?format= gets the one its Accept header picks.
	format := r.URL.Query().Get("format")
	if format == "" {
		i := negotiate(r.Header.Get("Accept"), stdoutMediaTypes)
		if i < 0 {
			return &APIError{Status: http.StatusNotAcceptable, Body: NewOMap().Set("detail", "Could not satisfy the request Accept header.")}
		}
		format = stdoutFormats[i]
	}
	ctx := r.Context()
	// Downloads stream, whatever the size (result_stdout_raw_handle with
	// enforce_max_bytes=False).
	if format == "txt_download" || format == "ansi_download" {
		suffix := ""
		if format == "ansi_download" {
			suffix = ".ansi"
		}
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s_%d%s.txt\"", typeName, id, suffix))
		return s.streamJobStdout(ctx, w, table, column, id, created, format == "txt_download")
	}
	// Every other format builds the output in memory: past
	// STDOUT_MAX_BYTES_DISPLAY it is not read at all (StdoutMaxBytesExceeded).
	switch format {
	case "json", "api", "html", "ansi", "txt":
		maxBytes := s.Settings.Int(ctx, "STDOUT_MAX_BYTES_DISPLAY")
		if maxBytes == 0 {
			maxBytes = 1048576
		}
		var total int64
		if err := s.Q().QueryRow(ctx, fmt.Sprintf(`SELECT COALESCE(sum(length(stdout)), 0) FROM %s WHERE %s = $1 AND job_created = $2`, table, column), id, created).Scan(&total); err != nil {
			return err
		}
		if total > maxBytes {
			msg := fmt.Sprintf("Standard Output too large to display (%d bytes), only download supported for sizes over %d bytes.", total, maxBytes)
			switch format {
			case "json":
				WriteJSON(w, 200, NewOMap().Set("range", NewOMap().Set("start", 0).Set("end", 1).Set("absolute_end", 1)).Set("content", msg))
			case "html":
				w.Header().Set("Content-Type", "text/html; charset=utf-8")
				_, _ = w.Write([]byte(html.EscapeString(msg)))
			case "api":
				w.Header().Set(browsableInternalHTML, "1")
				w.Header().Set("Content-Type", "text/plain; charset=utf-8")
				_, _ = w.Write([]byte(html.EscapeString(msg)))
			default:
				w.Header().Set("Content-Type", "text/plain; charset=utf-8")
				_, _ = w.Write([]byte(msg))
			}
			return nil
		}
	}
	content, _, err := s.jobStdout(r, table, column, id, created)
	if err != nil {
		return err
	}
	switch format {
	case "json", "api", "html":
		lines := strings.SplitAfter(content, "\n")
		if len(lines) > 0 && lines[len(lines)-1] == "" {
			lines = lines[:len(lines)-1]
		}
		absoluteEnd := len(lines)
		start, _ := strconv.Atoi(r.URL.Query().Get("start_line"))
		end := absoluteEnd
		if v := r.URL.Query().Get("end_line"); v != "" {
			if n, err := strconv.Atoi(v); err == nil {
				end = n
			}
		}
		startActual, endActual := start, end
		if start < 0 {
			startActual = absoluteEnd + start
			if startActual < 0 {
				startActual = 0
			}
			endActual = absoluteEnd
		} else if end > absoluteEnd {
			endActual = absoluteEnd
		}
		if startActual > absoluteEnd {
			startActual = absoluteEnd
		}
		if endActual < startActual {
			endActual = startActual
		}
		body := strings.Join(lines[startActual:endActual], "")
		if format != "json" {
			darkVal := r.URL.Query().Get("dark")
			dark := darkVal != "" && strings.ContainsRune("1tTyY", rune(darkVal[0]))
			contentOnly := format == "api"
			darkBG := (contentOnly && dark) || (!contentOnly && (dark || darkVal == ""))
			page := stdoutHTML(body, stdoutViewNames[table], darkBG, contentOnly)
			if contentOnly {
				// The browsable API shows the fragment as the content of
				// the plain text renderer.
				w.Header().Set(browsableInternalHTML, "1")
				w.Header().Set("Content-Type", "text/plain; charset=utf-8")
			} else {
				w.Header().Set("Content-Type", "text/html; charset=utf-8")
			}
			_, _ = w.Write([]byte(page))
			return nil
		}
		if r.URL.Query().Get("content_encoding") == "base64" {
			body = base64Std(body)
		}
		WriteJSON(w, 200, NewOMap().Set("range", NewOMap().Set("start", startActual).Set("end", endActual).Set("absolute_end", absoluteEnd)).Set("content", body))
	case "ansi", "txt":
		if format == "txt" {
			content = stripANSI(content)
		}
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		_, _ = w.Write([]byte(content))
	default:
		return ErrNotFound
	}
	return nil
}

// --- cancel ------------------------------------------------------------------

func (s *Server) jobCancelView(w http.ResponseWriter, r *http.Request) error {
	_, jb, err := jobObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	WriteJSON(w, 200, NewOMap().Set("can_cancel", models.ActiveStatuses[jb.Status]))
	return nil
}

// jobCanCancel mirrors JobAccess.can_cancel.
func (s *Server) jobCanCancel(c *SerCtx, jb *models.Job) bool {
	if !models.ActiveStatuses[jb.Status] {
		return false
	}
	if c.User.IsSuperuser {
		return true
	}
	if jb.CreatedByID != nil && *jb.CreatedByID == c.User.ID {
		return true
	}
	if jb.JobTemplateID != nil {
		return c.HasRoleOn("main.jobtemplate", *jb.JobTemplateID, "admin_role")
	}
	if jb.OrganizationID != nil {
		return c.HasRoleOn("main.organization", *jb.OrganizationID, "job_template_admin_role")
	}
	return false
}

// cancelUnifiedJob marks a job canceled: pending jobs finish at once, running
// ones are flagged for the task process.
func (s *Server) cancelUnifiedJob(r *http.Request, j *models.UnifiedJob) error {
	return s.cancelJob(r, j.ID, j.Status, j.UnifiedJobTemplateID)
}

// cancelJob is UnifiedJob.cancel for any kind of job. Both paths blank
// start_args, which holds the launch's encrypted passwords. A job that
// has not started (new, pending, waiting: no process holds it yet) is
// canceled at once, with its template's last job; a running one is
// flagged and the task process told, which ends it and records the
// status. A job that started after status was read is flagged instead.
func (s *Server) cancelJob(r *http.Request, id int64, status string, ujtID *int64) error {
	ctx := r.Context()
	var canceledNow bool
	err := s.DB.Tx(ctx, func(tx pgx.Tx) error {
		canceledNow = false
		if status == "pending" || status == "new" || status == "waiting" {
			tag, err := tx.Exec(ctx, `UPDATE main_unifiedjob SET status = 'canceled', failed = true, cancel_flag = true, start_args = '', canceled_on = now(), finished = now(), modified = now() WHERE id = $1 AND status IN ('new','pending','waiting')`, id)
			if err != nil {
				return err
			}
			if tag.RowsAffected() > 0 {
				canceledNow = true
				if ujtID != nil {
					_, err = tx.Exec(ctx, `UPDATE main_unifiedjobtemplate SET current_job_id = NULL, last_job_id = $2, last_job_run = now(), last_job_failed = true, status = 'canceled', modified = now() WHERE id = $1 AND current_job_id = $2`, *ujtID, id)
				}
				return err
			}
		}
		_, err := tx.Exec(ctx, `UPDATE main_unifiedjob SET cancel_flag = true, start_args = '', modified = now() WHERE id = $1`, id)
		return err
	})
	if err != nil {
		return err
	}
	if canceledNow {
		s.Background(func(ctx context.Context) { s.SendWebhookStatus(ctx, id, "canceled") })
		s.EmitJobStatus(ctx, id, "canceled")
		return nil
	}
	s.NotifyDispatcher(r, fmt.Sprintf(`{"type":"cancel","id":%d}`, id))
	return nil
}

func (s *Server) jobCancel(w http.ResponseWriter, r *http.Request) error {
	_, jb, err := jobObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	if !models.ActiveStatuses[jb.Status] {
		return MethodNotAllowed(r.Method)
	}
	if !s.jobCanCancel(c, jb) {
		return ErrForbidden
	}
	if err := s.cancelUnifiedJob(r, &jb.UnifiedJob); err != nil {
		return err
	}
	w.WriteHeader(http.StatusAccepted)
	return nil
}

// --- relaunch ----------------------------------------------------------------

// retryHostNames lists the hosts of a job's summaries for a retry status.
func (s *Server) retryHostNames(r *http.Request, jb *models.Job, status string) ([]string, error) {
	where := ""
	switch status {
	case "all":
	case "failed":
		where = " AND hs.failed"
	case "ok", "changed":
		where = " AND hs." + status + " > 0"
	case "unreachable":
		where = " AND hs.dark > 0"
	default:
		return nil, BadRequest(fmt.Sprintf("%s is not a valid status option.", status))
	}
	rows, err := s.Q().Query(r.Context(), `SELECT h.name FROM main_jobhostsummary hs JOIN main_host h ON h.id = hs.host_id WHERE hs.job_id = $1`+where+` ORDER BY h.name`, jb.ID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var n string
		if err := rows.Scan(&n); err != nil {
			return nil, err
		}
		out = append(out, n)
	}
	return out, rows.Err()
}

func (s *Server) jobRelaunchView(w http.ResponseWriter, r *http.Request) error {
	_, jb, err := jobObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	if jb.JobTemplateID != nil && !c.HasRoleOn("main.jobtemplate", *jb.JobTemplateID, "execute_role") {
		return ErrForbidden
	}
	creds, err := models.JobCredentials(r.Context(), s.Q(), []int64{jb.ID})
	if err != nil {
		return err
	}
	o := NewOMap().Set("passwords_needed_to_start", passwordsNeeded(creds[jb.ID]))
	if models.ActiveStatuses[jb.Status] {
		o.Set("retry_counts", "Relaunch by host status not available until job finishes running.")
	} else {
		var all, failed int64
		_ = db.Tolerant(s.Q()).QueryRow(r.Context(), `SELECT count(*), count(*) FILTER (WHERE failed) FROM main_jobhostsummary WHERE job_id = $1 AND host_id IS NOT NULL`, jb.ID).Scan(&all, &failed)
		o.Set("retry_counts", NewOMap().Set("all", all).Set("failed", failed))
	}
	WriteJSON(w, 200, o)
	return nil
}

// jobCanStart mirrors JobAccess.can_start for a relaunch, returning the
// permission message the old view reported.
func (s *Server) jobCanStart(c *SerCtx, jb *models.Job, cfg *models.LaunchConfig, t *models.JobTemplate) error {
	if c.User.IsSuperuser {
		return nil
	}
	if t != nil && !c.HasRole(t.ExecuteRoleID) {
		return ErrForbidden
	}
	if cfg != nil && t != nil {
		prompts := cfg.Prompts()
		if !s.configHasPrompts(t, prompts, cfg, false) {
			return nil
		}
		if (jb.CreatedByID == nil || *jb.CreatedByID != c.User.ID) && varsAreEncrypted(cfg.ExtraData) {
			return Detail(http.StatusForbidden, "Job was launched with secret prompts provided by another user.")
		}
		if !s.configHasPrompts(t, prompts, cfg, true) {
			acc := &acceptedPrompts{JobPrompts: *prompts}
			if s.launchConfigAllowed(c, t, acc) {
				return nil
			}
		}
	}
	if jb.OrganizationID != nil && c.HasRoleOn("main.organization", *jb.OrganizationID, "execute_role") {
		return nil
	}
	if t == nil && jb.OrganizationID == nil {
		return Detail(http.StatusForbidden, "Job has been orphaned from its job template and organization.")
	}
	if t != nil && cfg != nil {
		return Detail(http.StatusForbidden, "Job was launched with prompted fields you do not have access to.")
	}
	if t != nil && cfg == nil {
		return Detail(http.StatusForbidden, "Job was launched with unknown prompted fields. Organization admin permissions required.")
	}
	return ErrForbidden
}

// configHasPrompts reproduces JobLaunchConfig._has_user_prompts.
func (s *Server) configHasPrompts(t *models.JobTemplate, p *models.JobPrompts, cfg *models.LaunchConfig, onlyUnprompted bool) bool {
	present := map[string]bool{}
	if p.InventoryID != nil {
		present["inventory"] = true
	}
	for k := range p.CharPrompts() {
		present[k] = true
	}
	if len(p.ExtraVars) > 0 {
		present["extra_vars"] = true
	}
	if p.ExecutionEnvironment != nil {
		present["execution_environment"] = true
	}
	if len(p.Credentials) > 0 {
		present["credentials"] = true
	}
	if len(p.Labels) > 0 {
		present["labels"] = true
	}
	if len(p.InstanceGroups) > 0 {
		present["instance_groups"] = true
	}
	skipVars := false
	if t.SurveyEnabled && !t.AskVariablesOnLaunch {
		skipVars = true
		surveyVars := map[string]bool{}
		for _, e := range t.SurveyElements() {
			if v, ok := e["variable"].(string); ok {
				surveyVars[v] = true
			}
		}
		extraKeys := 0
		for k := range p.ExtraVars {
			if !surveyVars[k] {
				extraKeys++
			}
		}
		if (len(p.ExtraVars) > 0 && !onlyUnprompted) || extraKeys > 0 {
			return true
		}
	}
	for _, m := range askMapping {
		field, flag := m[0], m[1]
		if field == "extra_vars" && skipVars {
			continue
		}
		if present[field] && !(askFlag(t, flag) && onlyUnprompted) {
			return true
		}
	}
	return false
}

func varsAreEncrypted(vars map[string]any) bool {
	for _, v := range vars {
		if sv, ok := v.(string); ok && crypto.IsEncrypted(sv) {
			return true
		}
	}
	return false
}

func (s *Server) jobRelaunch(w http.ResponseWriter, r *http.Request) error {
	u, jb, err := jobObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	if s.relaunchPrevented(r, jb) {
		return Detail(http.StatusForbidden, "Relaunch is disabled on the job template of this job.")
	}
	var t *models.JobTemplate
	if jb.JobTemplateID != nil {
		if t, err = models.GetJobTemplate(r.Context(), s.Q(), *jb.JobTemplateID); err != nil {
			if !db.IsNoRows(err) {
				return err
			}
			t = nil
		}
	}
	cfg, err := models.GetLaunchConfig(r.Context(), s.Q(), jb.ID)
	if err != nil {
		return err
	}
	if err := s.jobCanStart(c, jb, cfg, t); err != nil {
		return err
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	f := NewForm(body, true)
	hosts := "all"
	// hosts allows null, which keeps the job's limit like "all".
	if raw, ok := body.Get("hosts"); ok && raw != nil {
		hosts = f.Choice("hosts", "all", [][2]string{{"all", "No change to job limit"}, {"failed", "All failed and unreachable hosts"}}, false)
	}
	// credential_passwords is required (the view defaults it to {}) and
	// may not be null.
	if raw, ok := body.Get("credential_passwords"); ok && raw == nil {
		f.Errs.Add("credential_passwords", "This field may not be null.")
	}
	if err := f.Err(); err != nil {
		return err
	}
	creds, err := models.JobCredentials(r.Context(), s.Q(), []int64{jb.ID})
	if err != nil {
		return err
	}
	needed := passwordsNeeded(creds[jb.ID])
	passwords := map[string]string{}
	if raw, ok := body.Get("credential_passwords"); ok {
		if m, ok := raw.(*OMap); ok {
			for _, k := range m.Keys() {
				if v, _ := m.Get(k); v != nil {
					passwords[k] = fmt.Sprint(v)
				}
			}
		}
	}
	for _, p := range needed {
		if v, ok := body.Get(p); ok && v != nil {
			passwords[p] = fmt.Sprint(v)
		}
	}
	var missing []string
	for _, p := range needed {
		if passwords[p] == "" {
			missing = append(missing, p)
		}
	}
	if len(missing) > 0 {
		return FieldErrors{"credential_passwords": {fmt.Sprintf("Missing passwords needed to start: %s", strings.Join(missing, ", "))}}.Err()
	}
	if jb.ProjectID == nil {
		return &APIError{Status: http.StatusBadRequest, Body: map[string]any{"errors": []string{"Job Template Project is missing or undefined."}}}
	}
	if jb.InventoryID == nil {
		return &APIError{Status: http.StatusBadRequest, Body: map[string]any{"errors": []string{"Job Template Inventory is missing or undefined."}}}
	}
	var pending bool
	if err := s.Q().QueryRow(r.Context(), `SELECT pending_deletion FROM main_inventory WHERE id = $1`, *jb.InventoryID).Scan(&pending); err != nil || pending {
		return &APIError{Status: http.StatusBadRequest, Body: map[string]any{"errors": []string{"Job Template Inventory is missing or undefined."}}}
	}
	var limit *string
	if hosts != "all" {
		if models.ActiveStatuses[jb.Status] {
			return &APIError{Status: http.StatusBadRequest, Body: map[string]any{"hosts": fmt.Sprintf("Wait until job finishes before retrying on %s hosts.", hosts)}}
		}
		var hasStats bool
		_ = db.Tolerant(s.Q()).QueryRow(r.Context(), `SELECT EXISTS (SELECT 1 FROM main_jobevent WHERE job_id = $1 AND job_created = $2 AND event = 'playbook_on_stats')`, jb.ID, jb.Created).Scan(&hasStats)
		if !hasStats {
			return &APIError{Status: http.StatusBadRequest, Body: map[string]any{"hosts": fmt.Sprintf("Cannot retry on %s hosts, playbook stats not available.", hosts)}}
		}
		names, err := s.retryHostNames(r, jb, hosts)
		if err != nil {
			return err
		}
		if len(names) == 0 {
			return &APIError{Status: http.StatusBadRequest, Body: map[string]any{"hosts": fmt.Sprintf("Cannot relaunch because previous job had 0 %s hosts.", hosts)}}
		}
		joined := strings.Join(names, ",")
		limit = &joined
	}
	var outcome *launchOutcome
	if t != nil && cfg != nil {
		prompts := cfg.Prompts()
		if limit != nil {
			prompts.Limit = limit
		}
		acc := &acceptedPrompts{JobPrompts: *prompts, HasExtraVars: len(prompts.ExtraVars) > 0, Ignored: NewOMap()}
		tcreds, err := models.TemplateCredentials(r.Context(), s.Q(), []int64{t.ID})
		if err != nil {
			return err
		}
		launchCreds := tcreds[t.ID]
		if len(acc.Credentials) > 0 {
			prompted, err := models.LoadCredentialBriefs(r.Context(), s.Q(), acc.Credentials)
			if err != nil {
				return err
			}
			launchCreds = mergeCredentials(launchCreds, prompted)
		}
		eager := func(n *models.Job) {
			n.InventoryID = jb.InventoryID
			n.JobSliceNumber = jb.JobSliceNumber
			n.JobSliceCount = jb.JobSliceCount
		}
		outcome, err = s.createJobFromTemplate(r.Context(), &u.ID, t, acc, launchCreds, passwords, "relaunch", eager, spawnPrevent{slicing: true, federation: true})
		if err != nil {
			return err
		}
	} else {
		n, err := s.copyJob(r, u, jb, limit, passwords)
		if err != nil {
			return err
		}
		outcome = &launchOutcome{Job: n, Ignored: NewOMap()}
	}
	results, err := s.serializeJobs(c, []*models.Job{outcome.Job}, "full")
	if err != nil {
		return err
	}
	data := results[0].(*OMap)
	data.Set("job", outcome.Job.ID)
	w.Header().Set("Location", URLFor("jobs", outcome.Job.ID))
	WriteJSON(w, http.StatusCreated, data)
	return nil
}

// copyJob relaunches a job whose template or launch config is gone by
// copying its own fields and relations.
func (s *Server) copyJob(r *http.Request, u *auth.User, jb *models.Job, limit *string, passwords map[string]string) (*models.Job, error) {
	ctx := r.Context()
	n := *jb
	n.ID = 0
	n.Status = "pending"
	n.LaunchType = "relaunch"
	n.CreatedByID = &u.ID
	n.ModifiedByID = nil
	n.ScheduleID = nil
	n.Started, n.Finished, n.CanceledOn = nil, nil, nil
	n.Elapsed = 0
	n.JobArgs, n.JobCwd, n.JobExplanation, n.ResultTraceback, n.CeleryTaskID, n.ExecutionNode, n.ControllerNode, n.WorkUnitID = "", "", "", "", "", "", "", ""
	n.EmittedEvents = 0
	n.Failed = false
	n.CancelFlag = false
	n.InstanceGroupID = nil
	n.HostStatusCounts = nil
	n.JobEnv = nil
	n.Artifacts = "{}"
	n.SCMRevision = ""
	n.ProjectUpdateID = nil
	if limit != nil {
		n.Limit = *limit
	}
	igs, err := models.PreferredInstanceGroups(ctx, s.Q(), jb.JobTemplateID, jb.InventoryID, jb.OrganizationID, s.GlobalInstanceGroupNames(ctx))
	if err != nil {
		return nil, err
	}
	n.PreferredInstanceGroups = igs
	credIDs, err := models.ScanIDs(ctx, s.Q(), `SELECT credential_id FROM main_unifiedjob_credentials WHERE unifiedjob_id = $1 ORDER BY id`, jb.ID)
	if err != nil {
		return nil, err
	}
	labelIDs, err := models.ScanIDs(ctx, s.Q(), `SELECT label_id FROM main_unifiedjob_labels WHERE unifiedjob_id = $1 ORDER BY id`, jb.ID)
	if err != nil {
		return nil, err
	}
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if err := models.InsertJob(ctx, tx, &n, s.CT, credIDs, labelIDs, nil, nil, nil); err != nil {
			return err
		}
		startArgs, _ := json.Marshal(passwords)
		enc, err := crypto.EncryptField(s.Cfg.SecretKey, "start_args", &n.ID, string(startArgs), false)
		if err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `UPDATE main_unifiedjob SET start_args = $2 WHERE id = $1`, n.ID, enc)
		return err
	})
	if err != nil {
		return nil, err
	}
	s.NotifyDispatcher(r, fmt.Sprintf(`{"type":"job","id":%d}`, n.ID))
	return &n, nil
}

// --- create schedule ---------------------------------------------------------

func (s *Server) jobCreateScheduleView(w http.ResponseWriter, r *http.Request) error {
	_, jb, err := jobObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	if jb.JobTemplateID != nil && !c.HasRoleOn("main.jobtemplate", *jb.JobTemplateID, "execute_role") {
		return ErrForbidden
	}
	creds, err := models.JobCredentials(r.Context(), s.Q(), []int64{jb.ID})
	if err != nil {
		return err
	}
	cfg, err := models.GetLaunchConfig(r.Context(), s.Q(), jb.ID)
	if err != nil {
		return err
	}
	canSchedule := len(passwordsNeeded(creds[jb.ID])) == 0 && jb.InventoryID != nil && cfg != nil && jb.UnifiedJobTemplateID != nil
	o := NewOMap().Set("can_schedule", canSchedule)
	if cfg == nil {
		o.Set("prompts", NewOMap().Set("all", "Unknown, job may have been run before launch configurations were saved."))
		WriteJSON(w, 200, o)
		return nil
	}
	prompts := NewOMap()
	p := cfg.Prompts()
	for _, m := range askMapping {
		switch m[0] {
		case "inventory":
			if p.InventoryID != nil {
				invs, _ := models.LoadInventorySummaries(r.Context(), s.Q(), []int64{*p.InventoryID})
				if inv, ok := invs[*p.InventoryID]; ok {
					prompts.Set("inventory", inventorySummaryMap(inv))
				}
			}
		case "credentials":
			if len(p.Credentials) > 0 {
				briefs, _ := models.LoadCredentialBriefs(r.Context(), s.Q(), p.Credentials)
				list := make([]any, 0, len(briefs))
				for _, b := range briefs {
					list = append(list, NewOMap().Set("id", b.ID).Set("name", b.Name).Set("description", b.Description).Set("kind", b.Kind).Set("cloud", b.Cloud).Set("kubernetes", b.TypeKind == "kubernetes").Set("credential_type_id", b.CredentialTypeID))
				}
				prompts.Set("credentials", list)
			}
		case "instance_groups":
			if len(p.InstanceGroups) > 0 {
				igs, _ := models.LoadInstanceGroupBriefs(r.Context(), s.Q(), p.InstanceGroups)
				list := make([]any, 0, len(p.InstanceGroups))
				for _, id := range p.InstanceGroups {
					if ig, ok := igs[id]; ok {
						list = append(list, NewOMap().Set("id", ig.ID).Set("name", ig.Name).Set("is_container_group", ig.IsContainerGroup))
					}
				}
				prompts.Set("instance_groups", list)
			}
		case "labels":
			if len(p.Labels) > 0 {
				rows, err := s.Q().Query(r.Context(), `SELECT id, name FROM main_label WHERE id = ANY($1) ORDER BY name`, p.Labels)
				if err == nil {
					var labels []models.NameSummary
					for rows.Next() {
						var l models.NameSummary
						if err := rows.Scan(&l.ID, &l.Name); err != nil {
							s.Log.ErrorContext(r.Context(), "reading labels", "err", err)
							break
						}
						labels = append(labels, l)
					}
					rows.Close()
					s.logRowsErr(r.Context(), "jobCreateScheduleView", rows)
					prompts.Set("labels", labelsSummary(labels))
				}
			}
		case "extra_vars":
			if len(p.ExtraVars) > 0 {
				vars := map[string]any{}
				for k, v := range p.ExtraVars {
					vars[k] = v
				}
				for k, v := range cfg.SurveyPasswords {
					if _, ok := vars[k]; ok {
						vars[k] = v
					}
				}
				prompts.Set("extra_vars", vars)
			}
		case "execution_environment":
			if p.ExecutionEnvironment != nil {
				if e := c.EESummary(p.ExecutionEnvironment); e != nil {
					prompts.Set("execution_environment", e)
				}
			}
		default:
			if v, ok := cfg.CharPrompts[m[0]]; ok && v != nil {
				prompts.Set(m[0], v)
			}
		}
	}
	o.Set("prompts", prompts)
	WriteJSON(w, 200, o)
	return nil
}
