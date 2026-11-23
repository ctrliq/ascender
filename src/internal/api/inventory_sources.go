package api

import (
	"net/http"

	"github.com/ctrliq/ascender/internal/auth"
	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/models"
)

func inventorySourceFieldSet(ujt, src string) *FieldSet {
	return &FieldSet{
		Model: "InventorySource",
		Fields: map[string]Field{
			"id": {SQL: ujt + ".id", Kind: KindInt}, "name": {SQL: ujt + ".name"}, "description": {SQL: ujt + ".description"},
			"created": {SQL: ujt + ".created", Kind: KindDateTime}, "modified": {SQL: ujt + ".modified", Kind: KindDateTime},
			"last_job_failed": {SQL: ujt + ".last_job_failed", Kind: KindBool}, "last_job_run": {SQL: ujt + ".last_job_run", Kind: KindDateTime},
			"next_job_run": {SQL: ujt + ".next_job_run", Kind: KindDateTime}, "status": {SQL: ujt + ".status"},
			"source": {SQL: src + ".source"}, "source_path": {SQL: src + ".source_path"}, "source_vars": {SQL: src + ".source_vars"},
			"overwrite": {SQL: src + ".overwrite", Kind: KindBool}, "overwrite_vars": {SQL: src + ".overwrite_vars", Kind: KindBool},
			"update_on_launch": {SQL: src + ".update_on_launch", Kind: KindBool}, "update_cache_timeout": {SQL: src + ".update_cache_timeout", Kind: KindInt},
			"timeout": {SQL: src + ".timeout", Kind: KindInt}, "verbosity": {SQL: src + ".verbosity", Kind: KindInt}, "enabled_var": {SQL: src + ".enabled_var"},
			"enabled_value": {SQL: src + ".enabled_value"}, "host_filter": {SQL: src + ".host_filter"}, "scm_branch": {SQL: src + ".scm_branch"}, "limit": {SQL: src + `."limit"`},
			"inventory":             {SQL: src + ".inventory_id", Kind: KindFK, Rel: &Relation{Alias: src + "i", Join: "LEFT JOIN main_inventory " + src + "i ON " + src + "i.id = " + src + ".inventory_id", Target: func() *FieldSet { return inventoryFieldSet(src + "i") }}},
			"source_project":        {SQL: src + ".source_project_id", Kind: KindFK},
			"created_by":            {SQL: ujt + ".created_by_id", Kind: KindFK, Rel: &Relation{Alias: src + "cb", Join: "LEFT JOIN auth_user " + src + "cb ON " + src + "cb.id = " + ujt + ".created_by_id", Target: func() *FieldSet { return userFieldsAlias(src + "cb") }}},
			"modified_by":           {SQL: ujt + ".modified_by_id", Kind: KindFK, Rel: &Relation{Alias: src + "mb", Join: "LEFT JOIN auth_user " + src + "mb ON " + src + "mb.id = " + ujt + ".modified_by_id", Target: func() *FieldSet { return userFieldsAlias(src + "mb") }}},
			"organization":          {SQL: ujt + ".organization_id", Kind: KindFK},
			"execution_environment": {SQL: ujt + ".execution_environment_id", Kind: KindFK},
			"credentials":           {SQL: src + "c.credential_id", Kind: KindFK, Rel: &Relation{Alias: src + "c", Join: "LEFT JOIN main_unifiedjobtemplate_credentials " + src + "c ON " + src + "c.unifiedjobtemplate_id = " + ujt + ".id LEFT JOIN main_credential " + src + "cred ON " + src + "cred.id = " + src + "c.credential_id", Target: func() *FieldSet { return credentialFieldsAlias(src + "cred") }, Many: true}},
			"last_job":              {SQL: ujt + ".last_job_id", Kind: KindFK},
			"current_job":           {SQL: ujt + ".current_job_id", Kind: KindFK},
		},
		SearchFields: []string{"name", "description"},
	}
}

var inventorySourceFields *FieldSet

func init() {
	inventorySourceFields = inventorySourceFieldSet("ujt", "src")
	resourceRegistrars = append(resourceRegistrars, func(s *Server, mux *http.ServeMux) {
		s.route(mux, "/api/v2/inventory_sources/{$}", methodMap{"GET": s.inventorySourceList, "POST": s.inventorySourceCreate}, s.optionsFor("inventory_sources"))
		s.route(mux, "/api/v2/inventory_sources/{id}/{$}", methodMap{"GET": s.inventorySourceDetail, "PUT": s.inventorySourceUpdate, "PATCH": s.inventorySourceUpdate, "DELETE": s.inventorySourceDelete}, s.optionsFor("inventory_sources"))
	})
}

func (s *Server) inventorySourceAccess(q *Query, u *auth.User) {
	q.And("src.inventory_id IN (" + accessibleSQL(q, u.ID, s.CT.ID("main.inventory"), "read_role") + ")")
}

func (s *Server) inventorySourceList(w http.ResponseWriter, r *http.Request) error {
	return s.inventorySourceListWith(w, r, nil)
}

func (s *Server) inventoryInventorySources(w http.ResponseWriter, r *http.Request) error {
	_, v, err := inventoryObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	return s.inventorySourceListWith(w, r, func(q *Query) { q.And("src.inventory_id = " + q.Arg(v.ID)) })
}

func (s *Server) inventorySourceListWith(w http.ResponseWriter, r *http.Request, extra func(q *Query)) error {
	spec := ListSpec{Model: "InventorySource", From: models.InventorySourceFrom, Columns: models.InventorySourceColumns, PK: "ujt.id", Fields: inventorySourceFields, DefaultOrder: []string{"name", "id"}, Access: s.inventorySourceAccess}
	srcs, count, page, err := runListOf(s, r, spec, extra, models.ScanInventorySource)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, false)
	results, err := s.serializeInventorySources(c, srcs)
	if err != nil {
		return err
	}
	WriteJSON(w, 200, Paginate(r, page, count, results))
	return nil
}

func (s *Server) inventorySourceDetail(w http.ResponseWriter, r *http.Request) error {
	_, src, err := inventorySourceObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	results, err := s.serializeInventorySources(s.NewSerCtx(r, true), []*models.InventorySource{src})
	if err != nil {
		return err
	}
	WriteJSON(w, 200, results[0])
	return nil
}

func (s *Server) serializeInventorySources(c *SerCtx, srcs []*models.InventorySource) ([]any, error) {
	var userIDs, orgIDs, invIDs, jobIDs, eeIDs []int64
	for _, src := range srcs {
		userIDs = append(userIDs, uniqueIDs(src.CreatedByID, src.ModifiedByID)...)
		orgIDs = append(orgIDs, uniqueIDs(src.OrganizationID)...)
		invIDs = append(invIDs, uniqueIDs(src.InventoryID)...)
		jobIDs = append(jobIDs, uniqueIDs(src.LastJobID, src.CurrentJobID)...)
		eeIDs = append(eeIDs, uniqueIDs(src.ExecutionEnvironmentID)...)
	}
	if err := c.PreloadUsers(userIDs); err != nil {
		return nil, err
	}
	if err := c.PreloadOrgs(orgIDs); err != nil {
		return nil, err
	}
	if err := c.PreloadJobs(jobIDs); err != nil {
		return nil, err
	}
	if err := c.PreloadEEs(eeIDs); err != nil {
		return nil, err
	}
	invs, err := models.LoadInventorySummaries(c.Ctx(), c.S.Q(), invIDs)
	if err != nil {
		return nil, err
	}
	out := make([]any, 0, len(srcs))
	for _, src := range srcs {
		out = append(out, s.serializeInventorySource(c, src, invs))
	}
	return out, nil
}

func (s *Server) serializeInventorySource(c *SerCtx, src *models.InventorySource, invs map[int64]models.InventorySummary) *OMap {
	related := NewOMap()
	if c.Detail {
		// <source>++<inventory>++<organization>
		inv, org := "", ""
		if src.InventoryID != nil {
			if summary, ok := invs[*src.InventoryID]; ok {
				inv = summary.Name
				if o := c.OrgSummary(summary.OrganizationID); o != nil {
					n, _ := o.Get("name")
					org, _ = n.(string)
				}
			}
		}
		related.Set("named_url", "/api/v2/inventory_sources/"+namedURLEscape(src.Name)+"++"+namedURLEscape(inv)+"++"+namedURLEscape(org)+"/")
	}
	setURL(related, "created_by", "users", src.CreatedByID)
	setURL(related, "modified_by", "users", src.ModifiedByID)
	var firstCred *int64
	_ = db.Tolerant(c.S.Q()).QueryRow(c.Ctx(), `SELECT credential_id FROM main_unifiedjobtemplate_credentials WHERE unifiedjobtemplate_id = $1 ORDER BY id LIMIT 1`, src.ID).Scan(&firstCred)
	setURL(related, "credential", "credentials", firstCred)
	setURL(related, "current_job", "inventory_updates", src.CurrentJobID)
	setURL(related, "last_job", "inventory_updates", src.LastJobID)
	setURL(related, "next_schedule", "schedules", src.NextScheduleID)
	setURL(related, "execution_environment", "execution_environments", src.ExecutionEnvironmentID)
	for _, sub := range []string{"update", "inventory_updates", "schedules", "activity_stream", "hosts", "groups", "instance_groups", "notification_templates_started", "notification_templates_success", "notification_templates_error"} {
		related.Set(sub, SubURL("inventory_sources", src.ID, sub))
	}
	setURL(related, "inventory", "inventories", src.InventoryID)
	setURL(related, "source_project", "projects", src.SourceProjectID)
	setURL(related, "current_update", "inventory_updates", src.CurrentJobID)
	if src.LastJobID != nil {
		related.Set("last_update", URLFor("inventory_updates", *src.LastJobID))
	} else {
		related.Set("credentials", SubURL("inventory_sources", src.ID, "credentials"))
	}

	summary := NewOMap()
	c.putSummary(summary, "organization", c.OrgSummary, src.OrganizationID)
	if c.WantSummary("inventory") && src.InventoryID != nil {
		if inv, ok := invs[*src.InventoryID]; ok {
			summary.Set("inventory", inventorySummaryMap(inv))
		}
	}
	c.putSummary(summary, "execution_environment", c.EESummary, src.ExecutionEnvironmentID)
	if c.WantSummary("source_project") && src.SourceProjectID != nil {
		if p, err := models.GetProject(c.Ctx(), c.S.Q(), *src.SourceProjectID); err == nil {
			summary.Set("source_project", NewOMap().Set("id", p.ID).Set("name", p.Name).Set("description", p.Description).Set("status", p.Status).Set("scm_type", p.SCMType).Set("allow_override", p.AllowOverride))
		}
	}
	if c.WantSummary("credential") && firstCred != nil {
		if cr := c.CredentialSummary(firstCred); cr != nil {
			cr.Delete("kubernetes")
			cr.Set("cloud", true)
			summary.Set("credential", cr)
		}
	}
	if c.WantSummary("last_job") {
		if j, ok := c.Job(src.LastJobID); ok {
			summary.Set("last_job", NewOMap().Set("id", j.ID).Set("name", j.Name).Set("description", j.Description).Set("finished", models.FormatTimePtr(j.Finished)).Set("status", j.Status).Set("failed", j.Failed).Set("license_error", false))
		}
	}
	if c.WantSummary("last_update") {
		if j, ok := c.Job(src.LastJobID); ok {
			summary.Set("last_update", NewOMap().Set("id", j.ID).Set("name", j.Name).Set("description", j.Description).Set("status", j.Status).Set("failed", j.Failed).Set("license_error", false))
		}
	}
	if c.WantSummary("current_update") {
		if j, ok := c.Job(src.CurrentJobID); ok {
			summary.Set("current_update", NewOMap().Set("id", j.ID).Set("name", j.Name).Set("description", j.Description).Set("status", j.Status).Set("failed", j.Failed).Set("license_error", false))
		}
	}
	c.putSummary(summary, "created_by", c.UserSummary, src.CreatedByID)
	c.putSummary(summary, "modified_by", c.UserSummary, src.ModifiedByID)
	if c.WantSummary("user_capabilities") {
		edit, start := false, false
		if src.InventoryID != nil {
			edit = c.HasRoleOn("main.inventory", *src.InventoryID, "admin_role")
			start = c.HasRoleOn("main.inventory", *src.InventoryID, "update_role")
		}
		summary.Set("user_capabilities", Caps("edit", edit, "delete", edit, "start", start, "schedule", start))
	}
	if c.WantSummary("credentials") {
		creds := []any{}
		rows, err := c.S.Q().Query(c.Ctx(), `SELECT c.id, c.name, c.description, COALESCE(ct.namespace, ct.kind), ct.kind, ct.id FROM main_unifiedjobtemplate_credentials uc JOIN main_credential c ON c.id = uc.credential_id JOIN main_credentialtype ct ON ct.id = c.credential_type_id WHERE uc.unifiedjobtemplate_id = $1 ORDER BY c.id`, src.ID)
		if err == nil {
			for rows.Next() {
				var id, ctID int64
				var name, desc, kind, typeKind string
				if rows.Scan(&id, &name, &desc, &kind, &typeKind, &ctID) == nil {
					creds = append(creds, NewOMap().Set("id", id).Set("name", name).Set("description", desc).Set("kind", kind).Set("cloud", typeKind == "cloud").Set("credential_type_id", ctID))
				}
			}
			rows.Close()
			s.logRowsErr(c.Ctx(), "serializeInventorySource", rows)
		}
		summary.Set("credentials", creds)
	}
	if c.IsDetailView && c.WantSummary("resolved_environment") {
		// InventorySource.resolve_execution_environment, as an update of
		// the source resolves it.
		kind := ""
		if src.InventoryID != nil {
			_ = c.S.Q().QueryRow(c.Ctx(), `SELECT kind FROM main_inventory WHERE id = $1`, *src.InventoryID).Scan(&kind)
		}
		resolved := c.S.ResolveSourceEnvironment(c.Ctx(), src, kind)
		if e := c.EESummary(resolved); e != nil {
			summary.Set("resolved_environment", e)
		}
	}
	o := Base(NewOMap(), src.ID, "inventory_source", URLFor("inventory_sources", src.ID), related, summary, src.Created, src.Modified, src.Name, src.Description)
	o.Set("source", src.Source).Set("source_path", src.SourcePath).Set("source_vars", src.SourceVars).Set("scm_branch", src.SCMBranch)
	o.Set("credential", models.NullableID(firstCred)).Set("enabled_var", src.EnabledVar).Set("enabled_value", src.EnabledValue).Set("host_filter", src.HostFilter)
	o.Set("overwrite", src.Overwrite).Set("overwrite_vars", src.OverwriteVars).Set("timeout", src.Timeout).Set("verbosity", src.Verbosity).Set("limit", src.Limit)
	o.Set("last_job_run", models.FormatTimePtr(src.LastJobRun)).Set("last_job_failed", src.LastJobFailed).Set("next_job_run", models.FormatTimePtr(src.NextJobRun)).Set("status", src.Status)
	o.Set("execution_environment", models.NullableID(src.ExecutionEnvironmentID)).Set("inventory", models.NullableID(src.InventoryID))
	o.Set("update_on_launch", src.UpdateOnLaunch).Set("update_cache_timeout", src.UpdateCacheTimeout).Set("source_project", models.NullableID(src.SourceProjectID))
	o.Set("last_update_failed", src.LastJobFailed).Set("last_updated", models.FormatTimePtr(src.LastJobRun))
	return o
}
