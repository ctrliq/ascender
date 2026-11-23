package api

import (
	"encoding/json"
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/activity"
	"github.com/ctrliq/ascender/internal/auth"
	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/models"
)

func hostSpec() ListSpec {
	return ListSpec{Model: "Host", From: "main_host h", Columns: models.HostListColumns, PK: "h.id", Fields: hostFields, DefaultOrder: []string{"name"}}
}

func init() {
	resourceRegistrars = append(resourceRegistrars, (*Server).registerHosts)
}

func (s *Server) registerHosts(mux *http.ServeMux) {
	s.route(mux, "/api/v2/hosts/{$}", methodMap{"GET": s.hostList, "POST": s.hostCreate}, s.optionsFor("hosts"))
	s.route(mux, "/api/v2/hosts/{id}/{$}", methodMap{"GET": s.hostDetail, "PUT": s.hostUpdate, "PATCH": s.hostUpdate, "DELETE": s.hostDelete}, s.optionsFor("hosts"))
	s.route(mux, "/api/v2/hosts/{id}/variable_data/{$}", methodMap{"GET": s.hostVariableData, "PUT": s.hostVariableData, "PATCH": s.hostVariableData}, nil)
	s.route(mux, "/api/v2/hosts/{id}/groups/{$}", methodMap{"GET": s.hostGroups, "POST": s.hostGroupsAttach}, s.optionsFor("groups"))
	s.route(mux, "/api/v2/hosts/{id}/all_groups/{$}", methodMap{"GET": s.hostAllGroups}, s.optionsFor("groups"))
	s.route(mux, "/api/v2/hosts/{id}/ansible_facts/{$}", methodMap{"GET": s.hostAnsibleFacts}, nil)
}

// hostList is HostList: host_filter narrows it with the smart inventory
// filter syntax, and a filter that does not parse is a 400 with the error.
func (s *Server) hostList(w http.ResponseWriter, r *http.Request) error {
	if hf := r.URL.Query().Get("host_filter"); hf != "" {
		n, err := smartQuery(hf)
		if err != nil {
			return &APIError{Status: http.StatusBadRequest, Body: map[string]any{"error": err.Error()}}
		}
		return s.hostListWith(w, r, func(q *Query) {
			clause, err := smartFilterSQL(q, hostFields, n)
			if err != nil {
				q.And("FALSE")
				return
			}
			q.And(clause)
		})
	}
	return s.hostListWith(w, r, nil)
}

// inventoryHosts serves /inventories/{id}/hosts/, applying the smart host
// filter for smart inventories. InventoryHostsList set
// filter_read_permission = False: the parent's hosts are listed whatever
// the user may read of their inventories, which matters for a smart
// inventory, whose hosts are in others.
func (s *Server) inventoryHosts(w http.ResponseWriter, r *http.Request) error {
	_, v, err := inventoryObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	if v.Kind == "federated" {
		// A federated inventory lists the hosts of its input inventories
		// that the user can see.
		return s.hostListWith(w, r, func(q *Query) { q.And(federatedInputs("h.inventory_id", q, v.ID)) })
	}
	spec := hostSpec()
	if v.Kind == "smart" && v.HostFilter != nil && *v.HostFilter != "" {
		n, err := parseSmartFilter(*v.HostFilter)
		if err != nil {
			return BadRequest(err.Error())
		}
		// One host per name (HostManager's distinct('name')), of those
		// the filter and the request's own filters select.
		spec.DistinctOn = "h.name"
		return s.hostListSpec(w, r, spec, func(q *Query) {
			clause, err := smartFilterSQL(q, hostFields, n)
			if err != nil {
				q.And("FALSE")
				return
			}
			q.And(clause)
			if v.OrganizationID != nil {
				q.AddJoin("LEFT JOIN main_inventory hi ON hi.id = h.inventory_id")
				q.And("hi.organization_id = " + q.Arg(*v.OrganizationID))
			}
		})
	}
	return s.hostListSpec(w, r, spec, func(q *Query) { q.And("h.inventory_id = " + q.Arg(v.ID)) })
}

func (s *Server) hostListWith(w http.ResponseWriter, r *http.Request, extra func(q *Query)) error {
	spec := hostSpec()
	spec.Access = s.hostAccess
	return s.hostListSpec(w, r, spec, extra)
}

// hostListSpec lists hosts by spec, with its access restriction if any.
func (s *Server) hostListSpec(w http.ResponseWriter, r *http.Request, spec ListSpec, extra func(q *Query)) error {
	hosts, count, page, err := runListOf(s, r, spec, extra, models.ScanHost)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, false)
	results, err := s.serializeHosts(c, hosts)
	if err != nil {
		return err
	}
	WriteJSON(w, 200, Paginate(r, page, count, results))
	return nil
}

func (s *Server) serializeHosts(c *SerCtx, hosts []*models.Host) ([]any, error) {
	var userIDs, invIDs, hostIDs []int64
	for _, h := range hosts {
		userIDs = append(userIDs, uniqueIDs(h.CreatedByID, h.ModifiedByID)...)
		invIDs = append(invIDs, h.InventoryID)
		hostIDs = append(hostIDs, h.ID)
	}
	if err := c.PreloadUsers(userIDs); err != nil {
		return nil, err
	}
	invs, err := models.LoadInventorySummaries(c.Ctx(), c.Q(), invIDs)
	if err != nil {
		return nil, err
	}
	// Hosts of constructed inventories carry their summaries on constructed_host_id.
	var plain, constructed []int64
	for _, h := range hosts {
		if invs[h.InventoryID].Kind == "constructed" {
			constructed = append(constructed, h.ID)
		} else {
			plain = append(plain, h.ID)
		}
	}
	latest, err := models.LoadLatestHostSummaries(c.Ctx(), c.Q(), plain, false)
	if err != nil {
		return nil, err
	}
	if len(constructed) > 0 {
		lc, err := models.LoadLatestHostSummaries(c.Ctx(), c.Q(), constructed, true)
		if err != nil {
			return nil, err
		}
		for k, v := range lc {
			latest[k] = v
		}
	}
	recent, err := models.LoadRecentJobs(c.Ctx(), c.Q(), plain, false)
	if err != nil {
		return nil, err
	}
	if len(constructed) > 0 {
		rc, err := models.LoadRecentJobs(c.Ctx(), c.Q(), constructed, true)
		if err != nil {
			return nil, err
		}
		for k, v := range rc {
			recent[k] = v
		}
	}
	groups, groupCounts, err := models.HostGroups(c.Ctx(), c.Q(), hostIDs)
	if err != nil {
		return nil, err
	}
	hasSources := map[int64]bool{}
	if len(hostIDs) > 0 {
		rows, err := c.Q().Query(c.Ctx(), `SELECT DISTINCT host_id FROM main_host_inventory_sources WHERE host_id = ANY($1)`, hostIDs)
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			var id int64
			if err := rows.Scan(&id); err != nil {
				rows.Close()
				return nil, err
			}
			hasSources[id] = true
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return nil, err
		}
	}
	out := make([]any, 0, len(hosts))
	for _, h := range hosts {
		inv := invs[h.InventoryID]
		li, hasLatest := latest[h.ID]
		out = append(out, s.serializeHost(c, h, inv, li, hasLatest, recent[h.ID], groups[h.ID], groupCounts[h.ID], hasSources[h.ID]))
	}
	return out, nil
}

func inventorySummaryMap(inv models.InventorySummary) *OMap {
	return NewOMap().Set("id", inv.ID).Set("name", inv.Name).Set("description", inv.Description).Set("has_active_failures", inv.HasActiveFailures).Set("total_hosts", inv.TotalHosts).Set("hosts_with_active_failures", inv.HostsWithActiveFailures).Set("total_groups", inv.TotalGroups).Set("has_inventory_sources", inv.HasInventorySources).Set("total_inventory_sources", inv.TotalInventorySources).Set("inventory_sources_with_failures", inv.InventorySourcesWithFailures).Set("organization_id", models.NullableID(inv.OrganizationID)).Set("kind", inv.Kind)
}

func (s *Server) hostNamedURL(c *SerCtx, h *models.Host, inv models.InventorySummary) string {
	org := ""
	if o := c.OrgSummary(inv.OrganizationID); o != nil {
		n, _ := o.Get("name")
		org, _ = n.(string)
	}
	return "/api/v2/hosts/" + namedURLEscape(h.Name) + "++" + namedURLEscape(inv.Name) + "++" + namedURLEscape(org) + "/"
}

func (s *Server) serializeHost(c *SerCtx, h *models.Host, inv models.InventorySummary, li models.HostJobInfo, hasLatest bool, recent []models.RecentJob, groups []models.NameSummary, groupCount int64, hasSources bool) *OMap {
	related := NewOMap()
	if c.Detail {
		related.Set("named_url", s.hostNamedURL(c, h, inv))
	}
	setURL(related, "created_by", "users", h.CreatedByID)
	setURL(related, "modified_by", "users", h.ModifiedByID)
	for _, sub := range []string{"variable_data", "groups", "all_groups", "job_events", "job_host_summaries", "activity_stream", "inventory_sources", "smart_inventories", "ad_hoc_commands", "ad_hoc_command_events", "ansible_facts"} {
		related.Set(sub, SubURL("hosts", h.ID, sub))
	}
	if inv.Kind == "constructed" {
		if orig, err := strconv.ParseInt(h.InstanceID, 10, 64); err == nil {
			related.Set("original_host", URLFor("hosts", orig))
			related.Set("ansible_facts", SubURL("hosts", orig, "ansible_facts"))
		}
	}
	related.Set("inventory", URLFor("inventories", h.InventoryID))
	if hasLatest {
		related.Set("last_job_host_summary", URLFor("job_host_summaries", li.SummaryID))
		setURL(related, "last_job", "jobs", li.JobID)
	}
	summary := NewOMap()
	if c.WantSummary("inventory") {
		summary.Set("inventory", inventorySummaryMap(inv))
	}
	c.putSummary(summary, "created_by", c.UserSummary, h.CreatedByID)
	c.putSummary(summary, "modified_by", c.UserSummary, h.ModifiedByID)
	if c.WantSummary("user_capabilities") {
		edit := c.HasRoleOn("main.inventory", h.InventoryID, "admin_role")
		summary.Set("user_capabilities", Caps("edit", edit, "delete", edit))
	}
	if hasLatest {
		if c.WantSummary("last_job_host_summary") {
			summary.Set("last_job_host_summary", NewOMap().Set("id", li.SummaryID).Set("failed", li.Failed))
		}
		if c.WantSummary("last_job") && li.JobID != nil {
			lj := NewOMap().Set("id", *li.JobID).Set("name", li.JobName).Set("description", li.JobDescription)
			if li.JobFinished != nil {
				lj.Set("finished", models.FormatTime(*li.JobFinished))
			}
			lj.Set("status", li.JobStatus).Set("failed", li.JobFailed)
			if li.JobCanceledOn != nil {
				lj.Set("canceled_on", models.FormatTime(*li.JobCanceledOn))
			}
			if li.JobTemplateID != nil {
				lj.Set("job_template_id", *li.JobTemplateID).Set("job_template_name", li.JobTemplateName)
			}
			summary.Set("last_job", lj)
		}
	}
	if c.WantSummary("groups") {
		gl := make([]any, 0, len(groups))
		for _, g := range groups {
			gl = append(gl, NewOMap().Set("id", g.ID).Set("name", g.Name))
		}
		summary.Set("groups", NewOMap().Set("count", groupCount).Set("results", gl))
	}
	if c.WantSummary("recent_jobs") {
		rl := make([]any, 0, len(recent))
		for _, rj := range recent {
			rl = append(rl, NewOMap().Set("id", rj.ID).Set("name", rj.Name).Set("type", rj.Type).Set("status", rj.Status).Set("finished", models.FormatTimePtr(rj.Finished)))
		}
		summary.Set("recent_jobs", rl)
	}
	o := Base(NewOMap(), h.ID, "host", URLFor("hosts", h.ID), related, summary, h.Created, h.Modified, h.Name, h.Description)
	o.Set("inventory", h.InventoryID).Set("enabled", h.Enabled).Set("instance_id", h.InstanceID).Set("variables", h.Variables)
	o.Set("has_active_failures", hasLatest && li.Failed).Set("has_inventory_sources", hasSources)
	if hasLatest && li.JobID != nil {
		o.Set("last_job", *li.JobID)
	} else {
		o.Set("last_job", nil)
	}
	if hasLatest {
		o.Set("last_job_host_summary", li.SummaryID)
	} else {
		o.Set("last_job_host_summary", nil)
	}
	o.Set("ansible_facts_modified", models.FormatTimePtr(h.AnsibleFactsModified))
	return o
}

// hostObj is a host, read through its inventory.
var hostObj = &pathObject[*models.Host]{
	model:    "Host",
	get:      models.GetHost,
	readable: func(c *SerCtx, v *models.Host) bool { return c.HasRoleOn("main.inventory", v.InventoryID, "read_role") },
}

func (s *Server) hostDetail(w http.ResponseWriter, r *http.Request) error {
	_, h, err := hostObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	results, err := s.serializeHosts(c, []*models.Host{h})
	if err != nil {
		return err
	}
	WriteJSON(w, 200, results[0])
	return nil
}

var hostPortRe = regexp.MustCompile(`^(.+):(\d+)$`)

func (s *Server) hostFromForm(r *http.Request, f *Form, h *models.Host, isNew bool) {
	h.Name = f.String("name", true, 512, h.Name)
	h.Description = f.String("description", false, 0, h.Description)
	if isNew {
		if id, set := f.ID("inventory", nil, true, s.existsIn(r.Context(), "main_inventory")); set && id != nil {
			h.InventoryID = *id
		}
	}
	h.Enabled = f.Bool("enabled", h.Enabled)
	h.InstanceID = f.String("instance_id", false, 1024, h.InstanceID)
	if f.Has("variables") {
		vars := f.String("variables", false, 0, h.Variables)
		if err := ValidateVars(vars); err != nil {
			f.Errs.Add("variables", err.Error())
		} else {
			h.Variables = vars
		}
	}
	// "host:port" becomes the host with ansible_ssh_port in its variables.
	if m := hostPortRe.FindStringSubmatch(h.Name); m != nil && !strings.Contains(m[1], ":") {
		h.Name = m[1]
		vars, err := ParseVars(h.Variables)
		if err != nil || vars == nil {
			vars = map[string]any{}
		}
		port, _ := strconv.Atoi(m[2])
		vars["ansible_ssh_port"] = port
		b, _ := json.Marshal(vars)
		h.Variables = string(b)
	}
}

func (s *Server) hostChanges(h *models.Host, invName string) map[string]any {
	return map[string]any{"name": h.Name, "description": h.Description, "inventory": activity.Ref(invName, h.InventoryID), "enabled": h.Enabled, "instance_id": h.InstanceID, "variables": h.Variables, "id": h.ID}
}

func (s *Server) hostCreate(w http.ResponseWriter, r *http.Request) error {
	u, err := RequireWrite(r)
	if err != nil {
		return err
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	h, out, err := s.newHost(r, u, body, nil)
	if err != nil {
		return err
	}
	w.Header().Set("Location", URLFor("hosts", h.ID))
	WriteJSON(w, http.StatusCreated, out)
	return nil
}

// newHost is the host create (HostSerializer's validation and
// HostAccess.can_add) of body, which names the inventory. then, when set,
// runs in the same transaction once the host is inserted and serialized:
// a sub-list's create serialized the new host before attaching it.
func (s *Server) newHost(r *http.Request, u *auth.User, body *OMap, then func(tx pgx.Tx, h *models.Host) error) (*models.Host, any, error) {
	f := NewForm(body, false)
	h := &models.Host{CreatedByID: &u.ID, ModifiedByID: &u.ID, Enabled: true, Variables: ""}
	s.hostFromForm(r, f, h, true)
	if err := f.Err(); err != nil {
		return nil, nil, err
	}
	inv, err := inventoryObj.load(s, r, u, h.InventoryID)
	if err != nil {
		return nil, nil, err
	}
	if inv.Kind != "" {
		return nil, nil, Detail(http.StatusBadRequest, "Cannot create Host for Smart, Constructed, or Federated Inventories")
	}
	c := s.NewSerCtx(r, true)
	if !c.HasRole(inv.AdminRoleID) {
		return nil, nil, ErrForbidden
	}
	ctx := r.Context()
	if taken, err := db.Exists(ctx, s.Q(), `SELECT 1 FROM main_group WHERE name = $1 AND inventory_id = $2`, h.Name, h.InventoryID); err != nil {
		return nil, nil, err
	} else if taken {
		return nil, nil, FieldErrors{"__all__": {"A Group with that name already exists."}}.Err()
	}
	if taken, err := db.Exists(ctx, s.Q(), `SELECT 1 FROM main_host WHERE name = $1 AND inventory_id = $2`, h.Name, h.InventoryID); err != nil {
		return nil, nil, err
	} else if taken {
		return nil, nil, FieldErrors{"__all__": {"Host with this (name, inventory) combination already exists."}}.Err()
	}
	var out any
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if err := models.InsertHost(ctx, tx, h); err != nil {
			return err
		}
		if err := s.Activity.Record(ctx, tx, activity.Entry{Operation: "create", Object1: "host", Changes: s.hostChanges(h, inv.Name), ActorID: &u.ID, Links: map[string]int64{"host": h.ID, "inventory": inv.ID}}); err != nil {
			return err
		}
		results, err := s.serializeHosts(c.InTx(tx), []*models.Host{h})
		if err != nil {
			return err
		}
		out = results[0]
		if then != nil {
			return then(tx, h)
		}
		return nil
	})
	if err != nil {
		return nil, nil, err
	}
	return h, out, nil
}

func (s *Server) hostUpdate(w http.ResponseWriter, r *http.Request) error {
	u, h, err := hostObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	if !c.HasRoleOn("main.inventory", h.InventoryID, "admin_role") {
		return ErrForbidden
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	invName := colOf[string](r.Context(), s.Q(), "main_inventory", "name", h.InventoryID)
	before := s.hostChanges(h, invName)
	f := NewForm(body, r.Method == http.MethodPatch)
	s.hostFromForm(r, f, h, false)
	if err := f.Err(); err != nil {
		return err
	}
	var exists bool
	_ = db.Tolerant(s.Q()).QueryRow(r.Context(), `SELECT EXISTS (SELECT 1 FROM main_host WHERE name = $1 AND inventory_id = $2 AND id <> $3)`, h.Name, h.InventoryID, h.ID).Scan(&exists)
	if exists {
		return FieldErrors{"__all__": {"Host with this (name, inventory) combination already exists."}}.Err()
	}
	_ = db.Tolerant(s.Q()).QueryRow(r.Context(), `SELECT EXISTS (SELECT 1 FROM main_group WHERE name = $1 AND inventory_id = $2)`, h.Name, h.InventoryID).Scan(&exists)
	if exists {
		return FieldErrors{"__all__": {"A Group with that name already exists."}}.Err()
	}
	h.ModifiedByID = &u.ID
	ctx := r.Context()
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if err := models.UpdateHost(ctx, tx, h); err != nil {
			return err
		}
		changes := diffChanges(before, s.hostChanges(h, invName))
		if len(changes) == 0 {
			return nil
		}
		return s.Activity.Record(ctx, tx, activity.Entry{Operation: "update", Object1: "host", Changes: changes, ActorID: &u.ID, Links: map[string]int64{"host": h.ID, "inventory": h.InventoryID}})
	})
	if err != nil {
		return err
	}
	results, err := s.serializeHosts(c, []*models.Host{h})
	if err != nil {
		return err
	}
	WriteJSON(w, 200, results[0])
	return nil
}

func (s *Server) hostDelete(w http.ResponseWriter, r *http.Request) error {
	u, h, err := hostObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	if !c.HasRoleOn("main.inventory", h.InventoryID, "admin_role") {
		return ErrForbidden
	}
	ctx := r.Context()
	// HostDetail.delete, then RelatedJobsPreventDeleteMixin's check of the
	// inventory's jobs, which allow_deletes_while_in_use skipped.
	var invName, kind string
	var pending, allowDeletes bool
	if err := s.Q().QueryRow(ctx, `SELECT name, kind, pending_deletion, allow_deletes_while_in_use FROM main_inventory WHERE id = $1`, h.InventoryID).Scan(&invName, &kind, &pending, &allowDeletes); err != nil {
		return err
	}
	if pending {
		return &APIError{Status: http.StatusBadRequest, Body: NewOMap().Set("error", "The inventory for this host is already being deleted.")}
	}
	if kind == "constructed" {
		return &APIError{Status: http.StatusBadRequest, Body: NewOMap().Set("error", "Delete constructed inventory hosts from input inventory.")}
	}
	if allowDeletes {
		if active, err := s.activeJobsWhere(ctx, inventoryJobsCond, h.InventoryID); err == nil && len(active) > 0 {
			s.Log.InfoContext(r.Context(), "deleting a host of an inventory in use, allowed by allow_deletes_while_in_use", "host", h.ID, "inventory", h.InventoryID, "active_jobs", len(active))
		}
	} else if err := s.checkRelatedActiveJobs(ctx, inventoryJobsCond, h.InventoryID); err != nil {
		return err
	}
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if err := s.Activity.Record(ctx, tx, activity.Entry{Operation: "delete", Object1: "host", Changes: s.hostChanges(h, invName), ActorID: &u.ID, Links: map[string]int64{"inventory": h.InventoryID}}); err != nil {
			return err
		}
		return models.DeleteHost(ctx, tx, h, s.Cascade)
	})
	if err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func (s *Server) hostVariableData(w http.ResponseWriter, r *http.Request) error {
	u, h, err := hostObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	return s.variableData(w, r, h.Variables, u.CanWrite() && c.HasRoleOn("main.inventory", h.InventoryID, "admin_role"), func(vars string) error {
		_, err := s.Q().Exec(r.Context(), `UPDATE main_host SET variables = $2, modified = now(), modified_by_id = $3 WHERE id = $1`, h.ID, vars, u.ID)
		return err
	})
}

func (s *Server) hostAnsibleFacts(w http.ResponseWriter, r *http.Request) error {
	_, h, err := hostObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	// In the jsonb's key order, with its numbers as written.
	WriteJSON(w, 200, rawJSON(h.AnsibleFacts, map[string]any{}))
	return nil
}

func (s *Server) hostGroups(w http.ResponseWriter, r *http.Request) error {
	_, h, err := hostObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	return s.groupListWith(w, r, func(q *Query) {
		q.AddJoin("JOIN main_group_hosts hgh ON hgh.group_id = g.id")
		q.And("hgh.host_id = " + q.Arg(h.ID))
	})
}

// hostAllGroups lists the host's groups and all of their ancestors.
func (s *Server) hostAllGroups(w http.ResponseWriter, r *http.Request) error {
	_, h, err := hostObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	return s.groupListWith(w, r, func(q *Query) {
		q.And(`g.id IN (WITH RECURSIVE up AS (SELECT group_id AS id FROM main_group_hosts WHERE host_id = ` + q.Arg(h.ID) + ` UNION SELECT gp.to_group_id FROM main_group_parents gp JOIN up ON gp.from_group_id = up.id) SELECT id FROM up)`)
	})
}
