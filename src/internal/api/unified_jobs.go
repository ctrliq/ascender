package api

import (
	"fmt"
	"net/http"
	"regexp"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/auth"
	"github.com/ctrliq/ascender/internal/models"
)

// The unified lists mix every template or job type in one page, each row
// rendered by its own serializer, as the polymorphic serializers did.

func init() {
	resourceRegistrars = append(resourceRegistrars, func(s *Server, mux *http.ServeMux) {
		s.route(mux, "/api/v2/unified_job_templates/{$}", methodMap{"GET": s.unifiedJobTemplateList}, s.optionsFor("unified_job_templates"))
		s.route(mux, "/api/v2/unified_jobs/{$}", methodMap{"GET": s.unifiedJobList}, s.optionsFor("unified_jobs"))
		s.route(mux, "/api/v2/system_job_templates/{$}", methodMap{"GET": s.systemJobTemplateList}, nil)
		s.route(mux, "/api/v2/system_job_templates/{id}/{$}", methodMap{"GET": s.systemJobTemplateDetail}, nil)
	})
}

var unifiedJobTemplateListFields = &FieldSet{
	Model: "UnifiedJobTemplate",
	Fields: map[string]Field{
		"id": {SQL: "ujt.id", Kind: KindInt}, "name": {SQL: "ujt.name"}, "description": {SQL: "ujt.description"},
		"created": {SQL: "ujt.created", Kind: KindDateTime}, "modified": {SQL: "ujt.modified", Kind: KindDateTime},
		"last_job_failed": {SQL: "ujt.last_job_failed", Kind: KindBool}, "last_job_run": {SQL: "ujt.last_job_run", Kind: KindDateTime},
		"next_job_run": {SQL: "ujt.next_job_run", Kind: KindDateTime}, "status": {SQL: "ujt.status"},
		"organization":          {SQL: "ujt.organization_id", Kind: KindFK, Rel: &Relation{Alias: "o", Join: "LEFT JOIN main_organization o ON o.id = ujt.organization_id", Target: func() *FieldSet { return organizationFields }}},
		"execution_environment": {SQL: "ujt.execution_environment_id", Kind: KindFK},
		"created_by":            {SQL: "ujt.created_by_id", Kind: KindFK, Rel: &Relation{Alias: "cb", Join: "LEFT JOIN auth_user cb ON cb.id = ujt.created_by_id", Target: func() *FieldSet { return userFieldsAlias("cb") }}},
		"modified_by":           {SQL: "ujt.modified_by_id", Kind: KindFK, Rel: &Relation{Alias: "mb", Join: "LEFT JOIN auth_user mb ON mb.id = ujt.modified_by_id", Target: func() *FieldSet { return userFieldsAlias("mb") }}},
		"last_job":              {SQL: "ujt.last_job_id", Kind: KindFK, Rel: &Relation{Alias: "lj", Join: "LEFT JOIN main_unifiedjob lj ON lj.id = ujt.last_job_id", Target: func() *FieldSet { return unifiedJobFieldsAlias("lj") }}},
		"current_job":           {SQL: "ujt.current_job_id", Kind: KindFK, Rel: &Relation{Alias: "cj", Join: "LEFT JOIN main_unifiedjob cj ON cj.id = ujt.current_job_id", Target: func() *FieldSet { return unifiedJobFieldsAlias("cj") }}},
		"polymorphic_ctype":     {SQL: "ujt.polymorphic_ctype_id", Kind: KindFK, Rel: &Relation{Alias: "pct", Join: "LEFT JOIN django_content_type pct ON pct.id = ujt.polymorphic_ctype_id", Target: func() *FieldSet { return contentTypeFields("pct") }}},
		"type":                  {SQL: "(SELECT ct.model FROM django_content_type ct WHERE ct.id = ujt.polymorphic_ctype_id)", Kind: KindType},
		"jobtemplate":           {SQL: "ujt.id", Kind: KindFK, Rel: &Relation{Alias: "pjt", Join: "LEFT JOIN main_jobtemplate pjt ON pjt.unifiedjobtemplate_ptr_id = ujt.id", Target: func() *FieldSet { return jobTemplateFieldsAlias("ujt", "pjt") }}},
		"project":               {SQL: "ujt.id", Kind: KindFK, Rel: &Relation{Alias: "ppr", Join: "LEFT JOIN main_project ppr ON ppr.unifiedjobtemplate_ptr_id = ujt.id", Target: func() *FieldSet { return projectFieldsAlias("ujt", "ppr") }}},
		"workflowjobtemplate":   {SQL: "ujt.id", Kind: KindFK, Rel: &Relation{Alias: "pwt", Join: "LEFT JOIN main_workflowjobtemplate pwt ON pwt.unifiedjobtemplate_ptr_id = ujt.id", Target: func() *FieldSet { return workflowJobTemplateFieldsAlias("ujt", "pwt") }}},
		"labels":                {SQL: "utl.label_id", Kind: KindFK, Rel: &Relation{Alias: "utl", Join: "LEFT JOIN main_unifiedjobtemplate_labels utl ON utl.unifiedjobtemplate_id = ujt.id LEFT JOIN main_label utlabel ON utlabel.id = utl.label_id", Target: func() *FieldSet { return labelFieldSet("utlabel") }, Many: true}},
	},
	SearchFields: []string{"description", "name", "jobtemplate__playbook"},
}

func contentTypeFields(a string) *FieldSet {
	return &FieldSet{Model: "ContentType", Fields: map[string]Field{
		"id": {SQL: a + ".id", Kind: KindInt}, "model": {SQL: a + ".model"}, "app_label": {SQL: a + ".app_label"},
	}, SearchFields: []string{"model"}}
}

// unifiedJobTemplateAccess: every template type the user can read.
func (s *Server) unifiedJobTemplateAccess(q *Query, u *auth.User) {
	q.And("(ujt.id IN (" + accessibleSQL(q, u.ID, s.CT.ID("main.jobtemplate"), "read_role") + ") OR ujt.id IN (" + accessibleSQL(q, u.ID, s.CT.ID("main.project"), "read_role") +
		") OR ujt.id IN (" + accessibleSQL(q, u.ID, s.CT.ID("main.workflowjobtemplate"), "read_role") +
		") OR ujt.id IN (SELECT src.unifiedjobtemplate_ptr_id FROM main_inventorysource src WHERE src.inventory_id IN (" + accessibleSQL(q, u.ID, s.CT.ID("main.inventory"), "read_role") + ")))")
}

type ujtRow struct {
	id, ct int64
}

func (s *Server) unifiedJobTemplateList(w http.ResponseWriter, r *http.Request) error {
	return s.unifiedJobTemplateListWith(w, r, nil)
}

// unifiedJobTemplateListWith lists unified job templates with an extra
// restriction (a sub-list's parent).
func (s *Server) unifiedJobTemplateListWith(w http.ResponseWriter, r *http.Request, extra func(q *Query)) error {
	spec := ListSpec{Model: "UnifiedJobTemplate", From: "main_unifiedjobtemplate ujt", Columns: "ujt.id, ujt.polymorphic_ctype_id", PK: "ujt.id", Fields: unifiedJobTemplateListFields, DefaultOrder: []string{"name"}, Access: s.unifiedJobTemplateAccess}
	// Approval templates belong to workflow nodes and were never listed.
	approvalCT := s.CT.ID("main.workflowapprovaltemplate")
	rows, count, page, err := s.RunList(r, spec, func(q *Query) {
		q.And("ujt.polymorphic_ctype_id <> " + q.Arg(approvalCT))
		if extra != nil {
			extra(q)
		}
	}, func(rows pgx.Rows) (any, error) {
		var row ujtRow
		err := rows.Scan(&row.id, &row.ct)
		return row, err
	})
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, false)
	// Load each type in a batch, then emit in page order.
	byType := map[string][]int64{}
	var order []ujtRow
	for _, row := range rows {
		v := row.(ujtRow)
		model := s.CT.Model(v.ct)
		byType[model] = append(byType[model], v.id)
		order = append(order, v)
	}
	rendered := map[int64]any{}
	for model, ids := range byType {
		var items []any
		switch model {
		case "main.jobtemplate":
			var jts []*models.JobTemplate
			if err := s.collect(c, `SELECT `+models.JobTemplateColumns+` FROM `+models.JobTemplateFrom+` WHERE ujt.id = ANY($1)`, ids, func(rows pgx.Rows) error {
				t, err := models.ScanJobTemplate(rows)
				jts = append(jts, t)
				return err
			}); err != nil {
				return err
			}
			if items, err = s.serializeJobTemplates(c, jts); err != nil {
				return err
			}
		case "main.project":
			var ps []*models.Project
			if err := s.collect(c, `SELECT `+models.ProjectColumns+` FROM `+models.ProjectFrom+` WHERE ujt.id = ANY($1)`, ids, func(rows pgx.Rows) error {
				p, err := models.ScanProject(rows)
				ps = append(ps, p)
				return err
			}); err != nil {
				return err
			}
			if items, err = s.serializeProjects(c, ps); err != nil {
				return err
			}
		case "main.inventorysource":
			var srcs []*models.InventorySource
			if err := s.collect(c, `SELECT `+models.InventorySourceColumns+` FROM `+models.InventorySourceFrom+` WHERE ujt.id = ANY($1)`, ids, func(rows pgx.Rows) error {
				src, err := models.ScanInventorySource(rows)
				srcs = append(srcs, src)
				return err
			}); err != nil {
				return err
			}
			if items, err = s.serializeInventorySources(c, srcs); err != nil {
				return err
			}
		case "main.workflowjobtemplate":
			var ts []*models.WorkflowJobTemplate
			if err := s.collect(c, `SELECT `+models.WorkflowJobTemplateColumns+` FROM `+models.WorkflowJobTemplateFrom+` WHERE ujt.id = ANY($1)`, ids, func(rows pgx.Rows) error {
				t, err := models.ScanWorkflowJobTemplate(rows)
				ts = append(ts, t)
				return err
			}); err != nil {
				return err
			}
			if items, err = s.serializeWorkflowJobTemplates(c, ts); err != nil {
				return err
			}
		default:
			items, err = s.serializeGenericTemplates(c, ids, model)
			if err != nil {
				return err
			}
		}
		for _, it := range items {
			if o, ok := it.(*OMap); ok {
				if id, ok := o.Get("id"); ok {
					if n, ok := id.(int64); ok {
						rendered[n] = o
					}
				}
			}
		}
	}
	results := make([]any, 0, len(order))
	for _, row := range order {
		if o, ok := rendered[row.id]; ok {
			results = append(results, o)
		}
	}
	WriteJSON(w, 200, Paginate(r, page, count, results))
	return nil
}

// collect runs a batch query and feeds each row to fn.
func (s *Server) collect(c *SerCtx, sql string, ids []int64, fn func(rows pgx.Rows) error) error {
	rows, err := s.Q().Query(c.Ctx(), sql, ids)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		if err := fn(rows); err != nil {
			return err
		}
	}
	return rows.Err()
}

// serializeGenericTemplates renders the template types without a dedicated
// serializer (system job templates) with the unified template fields.
func (s *Server) serializeGenericTemplates(c *SerCtx, ids []int64, model string) ([]any, error) {
	typ := "unified_job_template"
	coll := "unified_job_templates"
	if model == "main.systemjobtemplate" {
		typ, coll = "system_job_template", "system_job_templates"
	}
	var out []any
	err := s.collect(c, `SELECT ujt.id, ujt.created, ujt.modified, ujt.name, ujt.description, ujt.last_job_failed, ujt.last_job_run, ujt.next_job_run, ujt.status, ujt.execution_environment_id, ujt.last_job_id, ujt.created_by_id, ujt.modified_by_id, ujt.next_schedule_id,
		COALESCE((SELECT job_type FROM main_systemjobtemplate WHERE unifiedjobtemplate_ptr_id = ujt.id), '') FROM main_unifiedjobtemplate ujt WHERE ujt.id = ANY($1) ORDER BY ujt.name, ujt.id`, ids, func(rows pgx.Rows) error {
		var t models.JobTemplate
		var jobType string
		if err := rows.Scan(&t.ID, &t.Created, &t.Modified, &t.Name, &t.Description, &t.LastJobFailed, &t.LastJobRun, &t.NextJobRun, &t.Status, &t.ExecutionEnvironmentID, &t.LastJobID, &t.CreatedByID, &t.ModifiedByID, &t.NextScheduleID, &jobType); err != nil {
			return err
		}
		related := NewOMap()
		if t.LastJobID != nil {
			if j, ok := c.Job(t.LastJobID); ok {
				related.Set("last_job", models.JobDetailURL(j.Type, j.ID))
			}
		}
		setURL(related, "next_schedule", "schedules", t.NextScheduleID)
		if typ == "system_job_template" {
			related.Set("jobs", SubURL(coll, t.ID, "jobs")).Set("schedules", SubURL(coll, t.ID, "schedules")).Set("launch", SubURL(coll, t.ID, "launch"))
			for _, k := range []string{"started", "success", "error"} {
				related.Set("notification_templates_"+k, SubURL(coll, t.ID, "notification_templates_"+k))
			}
		}
		summary := NewOMap()
		c.putSummary(summary, "last_job", c.LastJobSummary, t.LastJobID)
		c.putSummary(summary, "last_update", c.UpdateSummary, t.LastJobID)
		o := Base(NewOMap(), t.ID, typ, URLFor(coll, t.ID), related, summary, t.Created, t.Modified, t.Name, t.Description)
		o.Set("last_job_run", models.FormatTimePtr(t.LastJobRun)).Set("last_job_failed", t.LastJobFailed).Set("next_job_run", models.FormatTimePtr(t.NextJobRun)).Set("status", t.Status)
		o.Set("execution_environment", models.NullableID(t.ExecutionEnvironmentID))
		if typ == "system_job_template" {
			o.Set("job_type", jobType)
		}
		out = append(out, o)
		return nil
	})
	return out, err
}

// --- unified jobs ------------------------------------------------------------

var unifiedJobListFields = &FieldSet{
	Model: "UnifiedJob",
	Fields: map[string]Field{
		"id": {SQL: "uj.id", Kind: KindInt}, "name": {SQL: "uj.name"}, "description": {SQL: "uj.description"},
		"created": {SQL: "uj.created", Kind: KindDateTime}, "modified": {SQL: "uj.modified", Kind: KindDateTime},
		"launch_type": {SQL: "uj.launch_type"}, "status": {SQL: "uj.status"}, "failed": {SQL: "uj.failed", Kind: KindBool},
		"started": {SQL: "uj.started", Kind: KindDateTime}, "finished": {SQL: "uj.finished", Kind: KindDateTime},
		"canceled_on": {SQL: "uj.canceled_on", Kind: KindDateTime}, "elapsed": {SQL: "uj.elapsed", Kind: KindInt},
		"job_explanation": {SQL: "uj.job_explanation"}, "execution_node": {SQL: "uj.execution_node"}, "controller_node": {SQL: "uj.controller_node"},
		"work_unit_id": {SQL: "uj.work_unit_id"}, "dependencies_processed": {SQL: "uj.dependencies_processed", Kind: KindBool},
		"organization":          {SQL: "uj.organization_id", Kind: KindFK, Rel: &Relation{Alias: "o", Join: "LEFT JOIN main_organization o ON o.id = uj.organization_id", Target: func() *FieldSet { return organizationFields }}},
		"execution_environment": {SQL: "uj.execution_environment_id", Kind: KindFK},
		"unified_job_template":  {SQL: "uj.unified_job_template_id", Kind: KindFK, Rel: &Relation{Alias: "ujt2", Join: "LEFT JOIN main_unifiedjobtemplate ujt2 ON ujt2.id = uj.unified_job_template_id", Target: func() *FieldSet { return unifiedJobTemplateFieldsAlias("ujt2") }}},
		"created_by":            {SQL: "uj.created_by_id", Kind: KindFK, Rel: &Relation{Alias: "cb", Join: "LEFT JOIN auth_user cb ON cb.id = uj.created_by_id", Target: func() *FieldSet { return userFieldsAlias("cb") }}},
		"modified_by":           {SQL: "uj.modified_by_id", Kind: KindFK, Rel: &Relation{Alias: "mb", Join: "LEFT JOIN auth_user mb ON mb.id = uj.modified_by_id", Target: func() *FieldSet { return userFieldsAlias("mb") }}},
		"instance_group":        {SQL: "uj.instance_group_id", Kind: KindFK, Rel: &Relation{Alias: "jig", Join: "LEFT JOIN main_instancegroup jig ON jig.id = uj.instance_group_id", Target: func() *FieldSet { return instanceGroupFieldsAlias("jig") }}},
		"schedule":              {SQL: "uj.schedule_id", Kind: KindFK},
		"polymorphic_ctype":     {SQL: "uj.polymorphic_ctype_id", Kind: KindFK, Rel: &Relation{Alias: "pct", Join: "LEFT JOIN django_content_type pct ON pct.id = uj.polymorphic_ctype_id", Target: func() *FieldSet { return contentTypeFields("pct") }}},
		"type":                  {SQL: "(SELECT ct.model FROM django_content_type ct WHERE ct.id = uj.polymorphic_ctype_id)", Kind: KindType},
		"job":                   {SQL: "uj.id", Kind: KindFK, Rel: &Relation{Alias: "pj", Join: "LEFT JOIN main_job pj ON pj.unifiedjob_ptr_id = uj.id", Target: func() *FieldSet { return jobFieldsAlias("uj", "pj") }}},
		"projectupdate":         {SQL: "uj.id", Kind: KindFK, Rel: &Relation{Alias: "ppu", Join: "LEFT JOIN main_projectupdate ppu ON ppu.unifiedjob_ptr_id = uj.id", Target: func() *FieldSet { return projectUpdateFieldsAlias("uj", "ppu") }}},
		"workflowjob":           {SQL: "uj.id", Kind: KindFK, Rel: &Relation{Alias: "pwj", Join: "LEFT JOIN main_workflowjob pwj ON pwj.unifiedjob_ptr_id = uj.id", Target: func() *FieldSet { return workflowJobFieldsAlias("uj", "pwj") }}},
		// The old polymorphic model also answered to workflow_job, which the
		// workflow template Jobs tab filters on.
		"workflow_job": {SQL: "uj.id", Kind: KindFK, Rel: &Relation{Alias: "pwj", Join: "LEFT JOIN main_workflowjob pwj ON pwj.unifiedjob_ptr_id = uj.id", Target: func() *FieldSet { return workflowJobFieldsAlias("uj", "pwj") }}},
		// The other child models' one-to-one relations, which the inventory
		// Jobs tab filters on.
		"adhoccommand":    {SQL: "uj.id", Kind: KindFK, Rel: &Relation{Alias: "pah", Join: "LEFT JOIN main_adhoccommand pah ON pah.unifiedjob_ptr_id = uj.id", Target: func() *FieldSet { return adHocFieldsAlias("uj", "pah") }}},
		"inventoryupdate": {SQL: "uj.id", Kind: KindFK, Rel: &Relation{Alias: "piu", Join: "LEFT JOIN main_inventoryupdate piu ON piu.unifiedjob_ptr_id = uj.id", Target: func() *FieldSet { return inventoryUpdateFieldsAlias("uj", "piu") }}},
		"systemjob":       {SQL: "uj.id", Kind: KindFK, Rel: &Relation{Alias: "psj", Join: "LEFT JOIN main_systemjob psj ON psj.unifiedjob_ptr_id = uj.id", Target: func() *FieldSet { return systemJobFieldsAlias("uj", "psj") }}},
		"labels":          {SQL: "ujl.label_id", Kind: KindFK, Rel: &Relation{Alias: "ujl", Join: "LEFT JOIN main_unifiedjob_labels ujl ON ujl.unifiedjob_id = uj.id LEFT JOIN main_label ujlabel ON ujlabel.id = ujl.label_id", Target: func() *FieldSet { return labelFieldSet("ujlabel") }, Many: true}},
	},
	SearchFields: []string{"description", "name", "job__playbook"},
}

// unifiedJobAccess: jobs of readable templates and administered
// organizations, project updates of readable projects, inventory updates
// of readable inventories, workflow jobs of readable workflow templates.
func (s *Server) unifiedJobAccess(q *Query, u *auth.User) {
	orgs := `SELECT o.id FROM main_organization o JOIN main_rbac_roles_members m ON m.role_id IN (o.admin_role_id, o.auditor_role_id) WHERE m.user_id = ` + q.Arg(u.ID)
	q.And("(uj.id IN (SELECT j.unifiedjob_ptr_id FROM main_job j WHERE j.job_template_id IN (" + accessibleSQL(q, u.ID, s.CT.ID("main.jobtemplate"), "read_role") + "))" +
		" OR uj.id IN (SELECT pu.unifiedjob_ptr_id FROM main_projectupdate pu WHERE pu.project_id IN (" + accessibleSQL(q, u.ID, s.CT.ID("main.project"), "read_role") + "))" +
		" OR uj.id IN (SELECT iu.unifiedjob_ptr_id FROM main_inventoryupdate iu JOIN main_inventorysource src ON src.unifiedjobtemplate_ptr_id = iu.inventory_source_id WHERE src.inventory_id IN (" + accessibleSQL(q, u.ID, s.CT.ID("main.inventory"), "read_role") + "))" +
		" OR uj.id IN (SELECT wj.unifiedjob_ptr_id FROM main_workflowjob wj WHERE wj.workflow_job_template_id IN (" + accessibleSQL(q, u.ID, s.CT.ID("main.workflowjobtemplate"), "read_role") + ") OR wj.job_template_id IN (" + accessibleSQL(q, u.ID, s.CT.ID("main.jobtemplate"), "read_role") + "))" +
		" OR uj.id IN (SELECT ah.unifiedjob_ptr_id FROM main_adhoccommand ah WHERE ah.inventory_id IN (" + accessibleSQL(q, u.ID, s.CT.ID("main.inventory"), "read_role") + "))" +
		" OR uj.organization_id IN (" + orgs + "))")
}

func (s *Server) unifiedJobList(w http.ResponseWriter, r *http.Request) error {
	return s.unifiedJobListWith(w, r, nil)
}

// unifiedJobListWith lists unified jobs of every type with an extra filter.
func (s *Server) unifiedJobListWith(w http.ResponseWriter, r *http.Request, extra func(q *Query)) error {
	spec := ListSpec{Model: "UnifiedJob", From: "main_unifiedjob uj", Columns: "uj.id, uj.polymorphic_ctype_id", PK: "uj.id", Fields: unifiedJobListFields, DefaultOrder: []string{"id"}, Access: s.unifiedJobAccess}
	// UnifiedJobAccess left workflow approvals out of every unified job
	// list (workflowapproval__isnull=True), for superusers too.
	approvalCT := s.CT.ID("main.workflowapproval")
	base := func(q *Query) {
		q.And("uj.polymorphic_ctype_id <> " + q.Arg(approvalCT))
		if extra != nil {
			extra(q)
		}
	}
	rows, count, page, err := s.RunList(r, spec, base, func(rows pgx.Rows) (any, error) {
		var row ujtRow
		err := rows.Scan(&row.id, &row.ct)
		return row, err
	})
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, false)
	byType := map[string][]int64{}
	var order []ujtRow
	for _, row := range rows {
		v := row.(ujtRow)
		model := s.CT.Model(v.ct)
		byType[model] = append(byType[model], v.id)
		order = append(order, v)
	}
	rendered := map[int64]any{}
	for model, ids := range byType {
		var items []any
		switch model {
		case "main.job":
			var jobs []*models.Job
			if err := s.collect(c, `SELECT `+models.JobColumns+` FROM `+models.JobFrom+` WHERE uj.id = ANY($1)`, ids, func(rows pgx.Rows) error {
				jb, err := models.ScanJob(rows)
				jobs = append(jobs, jb)
				return err
			}); err != nil {
				return err
			}
			if items, err = s.serializeJobs(c, jobs, "list"); err != nil {
				return err
			}
		case "main.projectupdate":
			var ups []*models.ProjectUpdate
			if err := s.collect(c, `SELECT `+models.ProjectUpdateColumns+` FROM `+models.ProjectUpdateFrom+` WHERE uj.id = ANY($1)`, ids, func(rows pgx.Rows) error {
				pu, err := models.ScanProjectUpdate(rows)
				ups = append(ups, pu)
				return err
			}); err != nil {
				return err
			}
			if items, err = s.serializeProjectUpdates(c, ups, false); err != nil {
				return err
			}
		case "main.inventoryupdate":
			var ups []*models.InventoryUpdate
			if err := s.collect(c, `SELECT `+models.InventoryUpdateColumns+` FROM `+models.InventoryUpdateFrom+` WHERE uj.id = ANY($1)`, ids, func(rows pgx.Rows) error {
				iu, err := models.ScanInventoryUpdate(rows)
				ups = append(ups, iu)
				return err
			}); err != nil {
				return err
			}
			if items, err = s.serializeInventoryUpdates(c, ups, false); err != nil {
				return err
			}
		case "main.workflowjob":
			var ws []*models.WorkflowJob
			if err := s.collect(c, `SELECT `+models.WorkflowJobColumns+` FROM `+models.WorkflowJobFrom+` WHERE uj.id = ANY($1)`, ids, func(rows pgx.Rows) error {
				wj, err := models.ScanWorkflowJob(rows)
				ws = append(ws, wj)
				return err
			}); err != nil {
				return err
			}
			if items, err = s.serializeWorkflowJobs(c, ws, false); err != nil {
				return err
			}
		case "main.adhoccommand":
			if items, err = s.serializeAdHocCommands(c, ids, false); err != nil {
				return err
			}
		default:
			items, err = s.serializeGenericJobs(c, ids)
			if err != nil {
				return err
			}
		}
		for _, it := range items {
			if o, ok := it.(*OMap); ok {
				if id, ok := o.Get("id"); ok {
					if n, ok := id.(int64); ok {
						rendered[n] = o
					}
				}
			}
		}
	}
	results := make([]any, 0, len(order))
	for _, row := range order {
		if o, ok := rendered[row.id]; ok {
			results = append(results, o)
		}
	}
	WriteJSON(w, 200, Paginate(r, page, count, results))
	return nil
}

// serializeGenericJobs renders job types without a dedicated serializer
// (inventory updates, system jobs, ad hoc commands) with the unified job
// list fields.
func (s *Server) serializeGenericJobs(c *SerCtx, ids []int64) ([]any, error) {
	var jobs []*models.UnifiedJob
	if err := s.collect(c, `SELECT `+models.UnifiedJobColumns+` FROM main_unifiedjob uj WHERE uj.id = ANY($1)`, ids, func(rows pgx.Rows) error {
		j, err := models.ScanUnifiedJob(rows)
		jobs = append(jobs, j)
		return err
	}); err != nil {
		return nil, err
	}
	var userIDs, orgIDs, eeIDs, tmplIDs, schedIDs, igIDs []int64
	for _, j := range jobs {
		userIDs = append(userIDs, uniqueIDs(j.CreatedByID, j.ModifiedByID)...)
		orgIDs = append(orgIDs, uniqueIDs(j.OrganizationID)...)
		eeIDs = append(eeIDs, uniqueIDs(j.ExecutionEnvironmentID)...)
		tmplIDs = append(tmplIDs, uniqueIDs(j.UnifiedJobTemplateID)...)
		schedIDs = append(schedIDs, uniqueIDs(j.ScheduleID)...)
		igIDs = append(igIDs, uniqueIDs(j.InstanceGroupID)...)
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
	templates, err := s.loadTemplateBriefs(c, tmplIDs)
	if err != nil {
		return nil, err
	}
	schedules, err := s.loadScheduleBriefs(c, schedIDs)
	if err != nil {
		return nil, err
	}
	igs, err := s.loadInstanceGroupBriefs(c, igIDs)
	if err != nil {
		return nil, err
	}
	ctx := &jobContext{templates: templates, briefs: map[int64]models.UnifiedJobBrief{}, schedules: schedules}
	if err := s.preloadAncestors(c, ctx, jobs); err != nil {
		return nil, err
	}
	systemJobs, err := s.loadSystemJobInfo(c, jobs)
	if err != nil {
		return nil, err
	}
	out := make([]any, 0, len(jobs))
	for _, j := range jobs {
		typ := models.JobTypeForContentType(s.CT, j.PolymorphicCtypeID)
		sys, isSystem := systemJobs[j.ID]
		related := NewOMap()
		setURL(related, "created_by", "users", j.CreatedByID)
		setURL(related, "modified_by", "users", j.ModifiedByID)
		if j.UnifiedJobTemplateID != nil {
			if tb, ok := templates[*j.UnifiedJobTemplateID]; ok {
				related.Set("unified_job_template", templateDetailURL(tb))
			}
		}
		setURL(related, "schedule", "schedules", j.ScheduleID)
		if typ == "inventory_update" || typ == "ad_hoc_command" {
			related.Set("stdout", models.JobDetailURL(typ, j.ID)+"stdout/")
		}
		setURL(related, "execution_environment", "execution_environments", j.ExecutionEnvironmentID)
		if isSystem && sys.TemplateID != nil {
			related.Set("system_job_template", URLFor("system_job_templates", *sys.TemplateID))
			related.Set("notifications", models.JobDetailURL(typ, j.ID)+"notifications/")
		}
		related.Set("cancel", models.JobDetailURL(typ, j.ID)+"cancel/")
		if isSystem {
			related.Set("events", models.JobDetailURL(typ, j.ID)+"events/")
		}
		summary := NewOMap()
		c.putSummary(summary, "organization", c.OrgSummary, j.OrganizationID)
		c.putSummary(summary, "execution_environment", c.EESummary, j.ExecutionEnvironmentID)
		if c.WantSummary("schedule") && j.ScheduleID != nil {
			if sb, ok := schedules[*j.ScheduleID]; ok {
				summary.Set("schedule", NewOMap().Set("id", sb.ID).Set("name", sb.Name).Set("description", sb.Description).Set("next_run", models.FormatTimePtr(sb.NextRun)))
			}
		}
		if c.WantSummary("unified_job_template") && j.UnifiedJobTemplateID != nil {
			if tb, ok := templates[*j.UnifiedJobTemplateID]; ok {
				summary.Set("unified_job_template", NewOMap().Set("id", tb.ID).Set("name", tb.Name).Set("description", tb.Description).Set("unified_job_type", tb.Type))
			}
		}
		if c.WantSummary("instance_group") && j.InstanceGroupID != nil {
			if ig, ok := igs[*j.InstanceGroupID]; ok {
				summary.Set("instance_group", NewOMap().Set("id", ig.ID).Set("name", ig.Name).Set("is_container_group", ig.Container))
			}
		}
		c.putSummary(summary, "created_by", c.UserSummary, j.CreatedByID)
		if c.WantSummary("user_capabilities") {
			// system jobs are never relaunched (SystemJobAccess.can_start)
			summary.Set("user_capabilities", Caps("delete", c.User != nil && c.User.IsSuperuser, "start", c.User != nil && c.User.IsSuperuser && !isSystem))
		}
		ancestor, err := s.ancestorBrief(c, j, ctx)
		if err != nil {
			return nil, err
		}
		o := Base(NewOMap(), j.ID, typ, models.JobDetailURL(typ, j.ID), related, summary, j.Created, j.Modified, j.Name, j.Description)
		o.Set("unified_job_template", models.NullableID(j.UnifiedJobTemplateID)).Set("launch_type", j.LaunchType).Set("status", j.Status)
		o.Set("execution_environment", models.NullableID(j.ExecutionEnvironmentID)).Set("failed", j.Failed)
		o.Set("started", models.FormatTimePtr(j.Started)).Set("finished", models.FormatTimePtr(j.Finished)).Set("canceled_on", models.FormatTimePtr(j.CanceledOn))
		o.Set("elapsed", elapsedNow(j)).Set("job_explanation", c.Loc().Gettext(j.JobExplanation)).Set("execution_node", j.ExecutionNode)
		if !isSystem {
			o.Set("controller_node", j.ControllerNode)
		}
		o.Set("launched_by", s.launchedBy(c, ancestor, ctx)).Set("work_unit_id", nullIfEmpty(j.WorkUnitID))
		if isSystem {
			o.Set("system_job_template", models.NullableID(sys.TemplateID)).Set("job_type", sys.JobType).Set("result_stdout", sys.Stdout)
		}
		out = append(out, o)
	}
	return out, nil
}

// systemJobTemplateList serves the management job templates, which only
// superusers and auditors may see.
func (s *Server) systemJobTemplateList(w http.ResponseWriter, r *http.Request) error {
	u, err := RequireUser(r)
	if err != nil {
		return err
	}
	if !u.IsSuperuser && !u.IsSystemAuditor {
		page, err := ParsePage(r)
		if err != nil {
			return err
		}
		WriteJSON(w, 200, Paginate(r, page, 0, []any{}))
		return nil
	}
	spec := ListSpec{Model: "SystemJobTemplate", From: "main_unifiedjobtemplate ujt JOIN main_systemjobtemplate st ON st.unifiedjobtemplate_ptr_id = ujt.id",
		Columns: "ujt.id", PK: "ujt.id", Fields: systemJobTemplateFields, DefaultOrder: []string{"name", "id"}}
	rows, count, page, err := s.RunList(r, spec, nil, func(rows pgx.Rows) (any, error) {
		var id int64
		err := rows.Scan(&id)
		return id, err
	})
	if err != nil {
		return err
	}
	ids := make([]int64, len(rows))
	for i, row := range rows {
		ids[i] = row.(int64)
	}
	items, err := s.serializeGenericTemplates(s.NewSerCtx(r, false), ids, "main.systemjobtemplate")
	if err != nil {
		return err
	}
	// serializeGenericTemplates orders by name; keep the list's order.
	byID := map[int64]any{}
	for _, it := range items {
		if m, ok := it.(*OMap); ok {
			v, _ := m.Get("id")
			if id, ok := v.(int64); ok {
				byID[id] = it
			}
		}
	}
	ordered := make([]any, 0, len(ids))
	for _, id := range ids {
		if it, ok := byID[id]; ok {
			ordered = append(ordered, it)
		}
	}
	if len(ordered) != len(items) {
		ordered = items
	}
	WriteJSON(w, 200, Paginate(r, page, count, ordered))
	return nil
}

var systemJobTemplateFields = &FieldSet{
	Model: "SystemJobTemplate",
	Fields: map[string]Field{
		"id": {SQL: "ujt.id", Kind: KindInt}, "name": {SQL: "ujt.name"}, "description": {SQL: "ujt.description"},
		"job_type": {SQL: "st.job_type"}, "created": {SQL: "ujt.created", Kind: KindDateTime}, "modified": {SQL: "ujt.modified", Kind: KindDateTime},
	},
	SearchFields: []string{"description", "name"},
}

func (s *Server) systemJobTemplateDetail(w http.ResponseWriter, r *http.Request) error {
	u, err := RequireUser(r)
	if err != nil {
		return err
	}
	t, err := s.systemJobTemplateFromPath(r, u)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	items, err := s.serializeGenericTemplates(c, []int64{t.ID}, "main.systemjobtemplate")
	if err != nil {
		return err
	}
	if len(items) == 0 {
		return NotFoundFor("SystemJobTemplate")
	}
	WriteJSON(w, 200, items[0])
	return nil
}

// systemJobInfo is what the system job serializer adds to a unified job.
type systemJobInfo struct {
	TemplateID *int64
	JobType    string
	Stdout     string
}

var (
	stdoutEventDataRe = regexp.MustCompile(`\x1b\[K(?:[A-Za-z0-9+/=]+\x1b\[\d+D)+\x1b\[K`)
	stdoutColorRe     = regexp.MustCompile(`\x1b[^m]*m`)
)

// loadSystemJobInfo reads the system job rows of a page of unified jobs
// with their stdout (SystemJobSerializer.get_result_stdout): the legacy
// text column or the events, with the event data and colour escapes
// removed, or a notice when it is too large to show.
func (s *Server) loadSystemJobInfo(c *SerCtx, jobs []*models.UnifiedJob) (map[int64]systemJobInfo, error) {
	out := map[int64]systemJobInfo{}
	var ids []int64
	for _, j := range jobs {
		if models.JobTypeForContentType(s.CT, j.PolymorphicCtypeID) == "system_job" {
			ids = append(ids, j.ID)
		}
	}
	if len(ids) == 0 {
		return out, nil
	}
	ctx := c.Ctx()
	rows, err := s.Q().Query(ctx, `SELECT sj.unifiedjob_ptr_id, sj.system_job_template_id, sj.job_type, uj.result_stdout_text FROM main_systemjob sj JOIN main_unifiedjob uj ON uj.id = sj.unifiedjob_ptr_id WHERE sj.unifiedjob_ptr_id = ANY($1)`, ids)
	if err != nil {
		return nil, err
	}
	legacy := map[int64]string{}
	for rows.Next() {
		var id int64
		var info systemJobInfo
		var text *string
		if err := rows.Scan(&id, &info.TemplateID, &info.JobType, &text); err != nil {
			rows.Close()
			return nil, err
		}
		if text != nil {
			legacy[id] = *text
		}
		out[id] = info
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	maxBytes := s.Settings.Int(ctx, "STDOUT_MAX_BYTES_DISPLAY")
	if maxBytes == 0 {
		maxBytes = 1048576
	}
	tooLarge := func(total int64) string {
		return fmt.Sprintf("Standard Output too large to display (%d bytes), only download supported for sizes over %d bytes.", total, maxBytes)
	}
	// The event-backed stdout of every job on the page: sizes, then the
	// text of those small enough to show, two statements in all.
	created := map[int64]time.Time{}
	for _, j := range jobs {
		created[j.ID] = j.Created
	}
	var evIDs []int64
	var evCreated []time.Time
	for id := range out {
		if legacy[id] == "" {
			evIDs = append(evIDs, id)
			evCreated = append(evCreated, created[id])
		}
	}
	totals := map[int64]int64{}
	eventText := map[int64]string{}
	if len(evIDs) > 0 {
		rows, err := s.Q().Query(ctx, `SELECT system_job_id, COALESCE(SUM(LENGTH(stdout)), 0) FROM main_systemjobevent WHERE system_job_id = ANY($1) AND job_created = ANY($2) GROUP BY system_job_id`, evIDs, evCreated)
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			var id, n int64
			if err := rows.Scan(&id, &n); err != nil {
				rows.Close()
				return nil, err
			}
			totals[id] = n
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return nil, err
		}
		var small []int64
		var smallCreated []time.Time
		for i, id := range evIDs {
			if totals[id] <= maxBytes {
				small = append(small, id)
				smallCreated = append(smallCreated, evCreated[i])
			}
		}
		if eventText, err = s.jobStdoutBatch(ctx, "main_systemjobevent", "system_job_id", small, smallCreated); err != nil {
			return nil, err
		}
	}
	for id, info := range out {
		var content string
		if text := legacy[id]; text != "" {
			if int64(len(text)) > maxBytes {
				info.Stdout = tooLarge(int64(len(text)))
				out[id] = info
				continue
			}
			content = text
		} else {
			if total := totals[id]; total > maxBytes {
				info.Stdout = tooLarge(total)
				out[id] = info
				continue
			}
			content = eventText[id]
		}
		content = stdoutEventDataRe.ReplaceAllString(content, "")
		info.Stdout = stdoutColorRe.ReplaceAllString(content, "")
		out[id] = info
	}
	return out, nil
}

// adHocFieldsAlias are an ad hoc command's fields under the given aliases.
func adHocFieldsAlias(uj, a string) *FieldSet {
	f := unifiedJobFieldsAlias(uj).Fields
	for k, col := range map[string]string{"job_type": "job_type", "limit": `"limit"`, "module_name": "module_name", "module_args": "module_args"} {
		f[k] = Field{SQL: a + "." + col}
	}
	f["forks"] = Field{SQL: a + ".forks", Kind: KindInt}
	f["verbosity"] = Field{SQL: a + ".verbosity", Kind: KindInt}
	f["become_enabled"] = Field{SQL: a + ".become_enabled", Kind: KindBool}
	f["diff_mode"] = Field{SQL: a + ".diff_mode", Kind: KindBool}
	f["inventory"] = Field{SQL: a + ".inventory_id", Kind: KindFK, Rel: &Relation{Alias: a + "inv", Join: "LEFT JOIN main_inventory " + a + "inv ON " + a + "inv.id = " + a + ".inventory_id", Target: func() *FieldSet { return inventoryFieldSet(a + "inv") }}}
	f["credential"] = Field{SQL: a + ".credential_id", Kind: KindFK}
	return &FieldSet{Model: "AdHocCommand", Fields: f, SearchFields: []string{"description", "name"}}
}

// systemJobFieldsAlias are a system job's fields under the given aliases.
func systemJobFieldsAlias(uj, sj string) *FieldSet {
	f := unifiedJobFieldsAlias(uj).Fields
	f["job_type"] = Field{SQL: sj + ".job_type"}
	f["extra_vars"] = Field{SQL: sj + ".extra_vars", NoFilter: true}
	f["system_job_template"] = Field{SQL: sj + ".system_job_template_id", Kind: KindFK}
	return &FieldSet{Model: "SystemJob", Fields: f, SearchFields: []string{"description", "name"}}
}
