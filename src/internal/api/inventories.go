package api

import (
	"context"
	"fmt"
	"net/http"
	"sort"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/activity"
	"github.com/ctrliq/ascender/internal/auth"
	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/models"
)

// inventoryFieldsAlias are the fields a relation to an inventory filters
// on, under alias a.
func inventoryFieldsAlias(a string) *FieldSet {
	return &FieldSet{Model: "Inventory", Fields: map[string]Field{
		"id": {SQL: a + ".id", Kind: KindInt}, "name": {SQL: a + ".name"}, "description": {SQL: a + ".description"},
		"kind": {SQL: a + ".kind"}, "organization": {SQL: a + ".organization_id", Kind: KindFK},
		"created": {SQL: a + ".created", Kind: KindDateTime}, "modified": {SQL: a + ".modified", Kind: KindDateTime},
	}, SearchFields: []string{"name", "description"}}
}

func inventoryFieldSet(a string) *FieldSet {
	return &FieldSet{
		Model: "Inventory",
		Fields: map[string]Field{
			"id": {SQL: a + ".id", Kind: KindInt}, "name": {SQL: a + ".name"}, "description": {SQL: a + ".description"},
			"created": {SQL: a + ".created", Kind: KindDateTime}, "modified": {SQL: a + ".modified", Kind: KindDateTime},
			"variables": {SQL: a + ".variables"}, "kind": {SQL: a + ".kind"}, "host_filter": {SQL: a + ".host_filter"},
			"has_active_failures": {SQL: a + ".has_active_failures", Kind: KindBool}, "total_hosts": {SQL: a + ".total_hosts", Kind: KindInt},
			"hosts_with_active_failures": {SQL: a + ".hosts_with_active_failures", Kind: KindInt}, "total_groups": {SQL: a + ".total_groups", Kind: KindInt},
			"has_inventory_sources": {SQL: a + ".has_inventory_sources", Kind: KindBool}, "total_inventory_sources": {SQL: a + ".total_inventory_sources", Kind: KindInt},
			"inventory_sources_with_failures": {SQL: a + ".inventory_sources_with_failures", Kind: KindInt}, "pending_deletion": {SQL: a + ".pending_deletion", Kind: KindBool},
			"prevent_instance_group_fallback": {SQL: a + ".prevent_instance_group_fallback", Kind: KindBool}, "allow_deletes_while_in_use": {SQL: a + ".allow_deletes_while_in_use", Kind: KindBool},
			"allow_jobs_while_syncing": {SQL: a + ".allow_jobs_while_syncing", Kind: KindBool},
			"organization":             {SQL: a + ".organization_id", Kind: KindFK, Rel: &Relation{Alias: "o", Join: "LEFT JOIN main_organization o ON o.id = " + a + ".organization_id", Target: func() *FieldSet { return organizationFields }}},
			"created_by":               {SQL: a + ".created_by_id", Kind: KindFK, Rel: &Relation{Alias: "cb", Join: "LEFT JOIN auth_user cb ON cb.id = " + a + ".created_by_id", Target: func() *FieldSet { return userFieldsAlias("cb") }}},
			"modified_by":              {SQL: a + ".modified_by_id", Kind: KindFK, Rel: &Relation{Alias: "mb", Join: "LEFT JOIN auth_user mb ON mb.id = " + a + ".modified_by_id", Target: func() *FieldSet { return userFieldsAlias("mb") }}},
			"hosts":                    {SQL: "ih.id", Kind: KindFK, Rel: &Relation{Alias: "ih", Join: "LEFT JOIN main_host ih ON ih.inventory_id = " + a + ".id", Many: true, Target: func() *FieldSet { return hostFieldSet("ih") }}},
			"groups":                   {SQL: "ig.id", Kind: KindFK, Rel: &Relation{Alias: "ig", Join: "LEFT JOIN main_group ig ON ig.inventory_id = " + a + ".id", Many: true, Target: func() *FieldSet { return groupFieldSet("ig") }}},
			"inventory_sources":        {SQL: "isrc.unifiedjobtemplate_ptr_id", Kind: KindFK, Rel: &Relation{Alias: "isrc", Join: "LEFT JOIN main_inventorysource isrc ON isrc.inventory_id = " + a + ".id LEFT JOIN main_unifiedjobtemplate isujt ON isujt.id = isrc.unifiedjobtemplate_ptr_id", Many: true, Target: func() *FieldSet { return inventorySourceFieldSet("isujt", "isrc") }}},
			"labels":                   {SQL: "il.id", Kind: KindFK, Rel: &Relation{Alias: "il", Join: "LEFT JOIN main_inventory_labels ill ON ill.inventory_id = " + a + ".id LEFT JOIN main_label il ON il.id = ill.label_id", Many: true, Target: func() *FieldSet { return labelFieldSet("il") }}},
		},
		SearchFields: []string{"name", "description"},
	}
}

func labelFieldSet(a string) *FieldSet {
	return &FieldSet{Model: "Label", Fields: map[string]Field{
		"id": {SQL: a + ".id", Kind: KindInt}, "name": {SQL: a + ".name"}, "description": {SQL: a + ".description"},
		"organization": {SQL: a + ".organization_id", Kind: KindFK}, "created": {SQL: a + ".created", Kind: KindDateTime}, "modified": {SQL: a + ".modified", Kind: KindDateTime},
	}, SearchFields: []string{"name", "description"}}
}

func hostFieldSet(a string) *FieldSet {
	return &FieldSet{
		Model: "Host",
		Fields: map[string]Field{
			"id": {SQL: a + ".id", Kind: KindInt}, "name": {SQL: a + ".name"}, "description": {SQL: a + ".description"},
			"created": {SQL: a + ".created", Kind: KindDateTime}, "modified": {SQL: a + ".modified", Kind: KindDateTime},
			"enabled": {SQL: a + ".enabled", Kind: KindBool}, "instance_id": {SQL: a + ".instance_id"}, "variables": {SQL: a + ".variables"},
			"ansible_facts": {SQL: a + ".ansible_facts", Kind: KindJSON}, "ansible_facts_modified": {SQL: a + ".ansible_facts_modified", Kind: KindDateTime},
			"inventory":   {SQL: a + ".inventory_id", Kind: KindFK, Rel: &Relation{Alias: a + "i", Join: "LEFT JOIN main_inventory " + a + "i ON " + a + "i.id = " + a + ".inventory_id", Target: func() *FieldSet { return inventoryFieldSet(a + "i") }}},
			"created_by":  {SQL: a + ".created_by_id", Kind: KindFK, Rel: &Relation{Alias: a + "cb", Join: "LEFT JOIN auth_user " + a + "cb ON " + a + "cb.id = " + a + ".created_by_id", Target: func() *FieldSet { return userFieldsAlias(a + "cb") }}},
			"modified_by": {SQL: a + ".modified_by_id", Kind: KindFK, Rel: &Relation{Alias: a + "mb", Join: "LEFT JOIN auth_user " + a + "mb ON " + a + "mb.id = " + a + ".modified_by_id", Target: func() *FieldSet { return userFieldsAlias(a + "mb") }}},
			"groups":      {SQL: a + "g.id", Kind: KindFK, Rel: &Relation{Alias: a + "g", Join: "LEFT JOIN main_group_hosts " + a + "gh ON " + a + "gh.host_id = " + a + ".id LEFT JOIN main_group " + a + "g ON " + a + "g.id = " + a + "gh.group_id", Many: true, Target: func() *FieldSet { return groupFieldSet(a + "g") }}},
			"inventory_sources": {SQL: a + "s.inventorysource_id", Kind: KindFK, Rel: &Relation{Alias: a + "s", Join: "LEFT JOIN main_host_inventory_sources " + a + "s ON " + a + "s.host_id = " + a + ".id", Many: true, Target: func() *FieldSet {
				return &FieldSet{Model: "InventorySource", Fields: map[string]Field{"id": {SQL: a + "s.inventorysource_id", Kind: KindInt}}}
			}}},
			"last_job": {SQL: "(SELECT s.job_id FROM main_jobhostsummary s WHERE s.host_id = " + a + ".id ORDER BY s.id DESC LIMIT 1)", Kind: KindFK},
			"last_job_host_summary": {SQL: "(SELECT s.id FROM main_jobhostsummary s WHERE s.host_id = " + a + ".id ORDER BY s.id DESC LIMIT 1)", Kind: KindFK, Rel: &Relation{Alias: a + "ls", Join: "LEFT JOIN main_jobhostsummary " + a + "ls ON " + a + "ls.id = (SELECT s.id FROM main_jobhostsummary s WHERE s.host_id = " + a + ".id ORDER BY s.id DESC LIMIT 1)", Target: func() *FieldSet {
				return &FieldSet{Model: "JobHostSummary", Fields: map[string]Field{"id": {SQL: a + "ls.id", Kind: KindInt}, "failed": {SQL: a + "ls.failed", Kind: KindBool}, "changed": {SQL: a + "ls.changed", Kind: KindInt}, "ok": {SQL: a + "ls.ok", Kind: KindInt}}}
			}}},
		},
		SearchFields: []string{"name", "description"},
	}
}

func groupFieldSet(a string) *FieldSet {
	return &FieldSet{
		Model: "Group",
		Fields: map[string]Field{
			"id": {SQL: a + ".id", Kind: KindInt}, "name": {SQL: a + ".name"}, "description": {SQL: a + ".description"},
			"created": {SQL: a + ".created", Kind: KindDateTime}, "modified": {SQL: a + ".modified", Kind: KindDateTime}, "variables": {SQL: a + ".variables"},
			"inventory":   {SQL: a + ".inventory_id", Kind: KindFK, Rel: &Relation{Alias: a + "i", Join: "LEFT JOIN main_inventory " + a + "i ON " + a + "i.id = " + a + ".inventory_id", Target: func() *FieldSet { return inventoryFieldSet(a + "i") }}},
			"created_by":  {SQL: a + ".created_by_id", Kind: KindFK, Rel: &Relation{Alias: a + "cb", Join: "LEFT JOIN auth_user " + a + "cb ON " + a + "cb.id = " + a + ".created_by_id", Target: func() *FieldSet { return userFieldsAlias(a + "cb") }}},
			"modified_by": {SQL: a + ".modified_by_id", Kind: KindFK, Rel: &Relation{Alias: a + "mb", Join: "LEFT JOIN auth_user " + a + "mb ON " + a + "mb.id = " + a + ".modified_by_id", Target: func() *FieldSet { return userFieldsAlias(a + "mb") }}},
			"hosts":       {SQL: a + "h.id", Kind: KindFK, Rel: &Relation{Alias: a + "h", Join: "LEFT JOIN main_group_hosts " + a + "gh ON " + a + "gh.group_id = " + a + ".id LEFT JOIN main_host " + a + "h ON " + a + "h.id = " + a + "gh.host_id", Many: true, Target: func() *FieldSet { return hostFieldSet(a + "h") }}},
			"parents": {SQL: a + "pg.to_group_id", Kind: KindFK, Rel: &Relation{Alias: a + "pg", Join: "LEFT JOIN main_group_parents " + a + "pg ON " + a + "pg.from_group_id = " + a + ".id", Many: true, Target: func() *FieldSet {
				return &FieldSet{Model: "Group", Fields: map[string]Field{"id": {SQL: a + "pg.to_group_id", Kind: KindInt}}}
			}}},
			"children": {SQL: a + "cg.from_group_id", Kind: KindFK, Rel: &Relation{Alias: a + "cg", Join: "LEFT JOIN main_group_parents " + a + "cg ON " + a + "cg.to_group_id = " + a + ".id", Many: true, Target: func() *FieldSet {
				return &FieldSet{Model: "Group", Fields: map[string]Field{"id": {SQL: a + "cg.from_group_id", Kind: KindInt}}}
			}}},
		},
		SearchFields: []string{"name", "description"},
	}
}

var inventoryFields, hostFields, groupFields *FieldSet

func init() {
	inventoryFields = inventoryFieldSet("i")
	hostFields = hostFieldSet("h")
	groupFields = groupFieldSet("g")
	resourceRegistrars = append(resourceRegistrars, (*Server).registerInventories)
}

func inventorySpec() ListSpec {
	return ListSpec{Model: "Inventory", From: "main_inventory i", Columns: models.InventoryColumns, PK: "i.id", Fields: inventoryFields, DefaultOrder: []string{"name"}}
}

func (s *Server) registerInventories(mux *http.ServeMux) {
	s.route(mux, "/api/v2/inventories/{$}", methodMap{"GET": s.inventoryList, "POST": s.inventoryCreate}, s.optionsFor("inventories"))
	s.route(mux, "/api/v2/inventories/{id}/{$}", methodMap{"GET": s.inventoryDetail, "PUT": s.inventoryUpdate, "PATCH": s.inventoryUpdate, "DELETE": s.inventoryDelete}, s.optionsFor("inventories"))
	s.route(mux, "/api/v2/inventories/{id}/variable_data/{$}", methodMap{"GET": s.inventoryVariableData, "PUT": s.inventoryVariableData, "PATCH": s.inventoryVariableData}, nil)
	s.route(mux, "/api/v2/inventories/{id}/script/{$}", methodMap{"GET": s.inventoryScript}, nil)
	s.route(mux, "/api/v2/inventories/{id}/tree/{$}", methodMap{"GET": s.inventoryTree}, nil)
	s.route(mux, "/api/v2/inventories/{id}/hosts/{$}", methodMap{"GET": s.inventoryHosts, "POST": s.inventoryHostsPost}, s.optionsFor("hosts"))
	s.route(mux, "/api/v2/inventories/{id}/groups/{$}", methodMap{"GET": s.inventoryGroups, "POST": s.inventoryGroupsPost}, s.optionsFor("groups"))
	s.route(mux, "/api/v2/inventories/{id}/root_groups/{$}", methodMap{"GET": s.inventoryRootGroups, "POST": s.inventoryGroupsPost}, s.optionsFor("groups"))
	s.route(mux, "/api/v2/inventories/{id}/inventory_sources/{$}", methodMap{"GET": s.inventoryInventorySources, "POST": s.inventorySourceCreate}, s.optionsFor("inventory_sources"))
	s.route(mux, "/api/v2/inventories/{id}/labels/{$}", methodMap{"GET": s.inventoryLabels, "POST": s.inventoryLabelsAttach}, nil)
	s.route(mux, "/api/v2/inventories/{id}/instance_groups/{$}", methodMap{"GET": s.inventoryInstanceGroups, "POST": s.inventoryInstanceGroupsAttach}, nil)
	s.route(mux, "/api/v2/inventories/{id}/object_roles/{$}", methodMap{"GET": s.objectRolesRoute("main.inventory", inventoryObj.parentCheck(s))}, nil)
	s.route(mux, "/api/v2/inventories/{id}/input_inventories/{$}", methodMap{"GET": s.inventoryInputInventories, "POST": s.inventoryInputInventoriesAttach}, nil)
	s.route(mux, "/api/v2/constructed_inventories/{$}", methodMap{"GET": s.constructedInventoryList, "POST": s.constructedInventoryCreate}, s.optionsFor("constructed_inventories"))
	s.route(mux, "/api/v2/constructed_inventories/{id}/{$}", methodMap{"GET": s.constructedInventoryDetail, "PUT": s.constructedInventoryUpdate, "PATCH": s.constructedInventoryUpdate, "DELETE": s.constructedInventoryDelete}, s.optionsFor("constructed_inventories"))
	s.route(mux, "/api/v2/federated_inventories/{$}", methodMap{"GET": s.federatedInventoryList, "POST": s.federatedInventoryCreate}, s.optionsFor("federated_inventories"))
	s.route(mux, "/api/v2/federated_inventories/{id}/{$}", methodMap{"GET": s.federatedInventoryDetail, "PUT": s.federatedInventoryUpdate, "PATCH": s.federatedInventoryUpdate, "DELETE": s.federatedInventoryDelete}, s.optionsFor("federated_inventories"))
	s.route(mux, "/api/v2/organizations/{id}/inventories/{$}", methodMap{"GET": s.organizationInventories, "POST": s.inventoryCreate}, s.optionsFor("inventories"))
}

func (s *Server) inventoryAccess(q *Query, u *auth.User) {
	s.AccessibleFilter(q, u, "i.id", "main.inventory", "read_role")
}

// hostAccess: hosts of inventories the user can read.
func (s *Server) hostAccess(q *Query, u *auth.User) {
	q.And("h.inventory_id IN (" + accessibleSQL(q, u.ID, s.CT.ID("main.inventory"), "read_role") + ")")
}

func (s *Server) groupAccess(q *Query, u *auth.User) {
	q.And("g.inventory_id IN (" + accessibleSQL(q, u.ID, s.CT.ID("main.inventory"), "read_role") + ")")
}

func (s *Server) inventoryList(w http.ResponseWriter, r *http.Request) error {
	return s.inventoryListWith(w, r, nil, viewInventories)
}

func (s *Server) constructedInventoryList(w http.ResponseWriter, r *http.Request) error {
	return s.inventoryListWith(w, r, func(q *Query) { q.And("i.kind = 'constructed'") }, viewConstructed)
}

func (s *Server) federatedInventoryList(w http.ResponseWriter, r *http.Request) error {
	return s.inventoryListWith(w, r, func(q *Query) { q.And("i.kind = 'federated'") }, viewFederated)
}

// invView is the endpoint an inventory is served through, which picks the
// serializer: InventorySerializer, ConstructedInventorySerializer (the
// auto-created source's fields, no host_filter) or
// FederatedInventorySerializer (no host_filter or instance group fallback).
type invView string

const (
	viewInventories invView = ""
	viewConstructed invView = "constructed"
	viewFederated   invView = "federated"
)

func (v invView) collection() string {
	switch v {
	case viewConstructed:
		return "constructed_inventories"
	case viewFederated:
		return "federated_inventories"
	}
	return "inventories"
}

func (s *Server) organizationInventories(w http.ResponseWriter, r *http.Request) error {
	_, o, err := organizationObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	return s.inventoryListWith(w, r, func(q *Query) { q.And("i.organization_id = " + q.Arg(o.ID)) }, viewInventories)
}

func (s *Server) inventoryListWith(w http.ResponseWriter, r *http.Request, extra func(q *Query), view invView) error {
	return s.inventoryListSpec(w, r, inventorySpec(), extra, view)
}

// inventoryListSpec is inventoryListWith over a list spec of the caller's.
func (s *Server) inventoryListSpec(w http.ResponseWriter, r *http.Request, spec ListSpec, extra func(q *Query), view invView) error {
	spec.Access = s.inventoryAccess
	spec.RoleLevel = "main.inventory"
	invs, count, page, err := runListOf(s, r, spec, extra, models.ScanInventory)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, false)
	results, err := s.serializeInventories(c, invs, view)
	if err != nil {
		return err
	}
	WriteJSON(w, 200, Paginate(r, page, count, results))
	return nil
}

func (s *Server) serializeInventories(c *SerCtx, invs []*models.Inventory, view invView) ([]any, error) {
	var userIDs, orgIDs, invIDs []int64
	for _, v := range invs {
		userIDs = append(userIDs, uniqueIDs(v.CreatedByID, v.ModifiedByID)...)
		orgIDs = append(orgIDs, uniqueIDs(v.OrganizationID)...)
		invIDs = append(invIDs, v.ID)
	}
	if err := c.PreloadUsers(userIDs); err != nil {
		return nil, err
	}
	if err := c.PreloadOrgs(orgIDs); err != nil {
		return nil, err
	}
	labels := map[int64][]models.NameSummary{}
	if len(invIDs) > 0 {
		rows, err := c.S.Q().Query(c.Ctx(), `SELECT il.inventory_id, l.id, l.name FROM main_inventory_labels il JOIN main_label l ON l.id = il.label_id WHERE il.inventory_id = ANY($1) ORDER BY l.id`, invIDs)
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			var inv int64
			var l models.NameSummary
			if err := rows.Scan(&inv, &l.ID, &l.Name); err != nil {
				rows.Close()
				return nil, err
			}
			labels[inv] = append(labels[inv], l)
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return nil, err
		}
	}
	// The constructed view carries the settings of the inventory's first
	// source (inventory_sources.first(), by name), whatever its kind.
	srcs := map[int64]*models.InventorySource{}
	if view == viewConstructed {
		for _, v := range invs {
			src, err := models.ScanInventorySource(c.S.Q().QueryRow(c.Ctx(), `SELECT `+models.InventorySourceColumns+` FROM `+models.InventorySourceFrom+` WHERE src.inventory_id = $1 ORDER BY ujt.name, ujt.id LIMIT 1`, v.ID))
			if err == nil {
				srcs[v.ID] = src
			}
		}
	}
	out := make([]any, 0, len(invs))
	for _, v := range invs {
		out = append(out, s.serializeInventory(c, v, labels[v.ID], view, srcs[v.ID]))
	}
	return out, nil
}

func (s *Server) inventoryNamedURL(c *SerCtx, v *models.Inventory, view invView) string {
	org := ""
	if o := c.OrgSummary(v.OrganizationID); o != nil {
		n, _ := o.Get("name")
		org, _ = n.(string)
	}
	return "/api/v2/" + view.collection() + "/" + namedURLEscape(v.Name) + "++" + namedURLEscape(org) + "/"
}

func (s *Server) serializeInventory(c *SerCtx, v *models.Inventory, labels []models.NameSummary, view invView, src *models.InventorySource) *OMap {
	constructed := view == viewConstructed
	related := NewOMap()
	if c.Detail {
		related.Set("named_url", s.inventoryNamedURL(c, v, view))
	}
	setURL(related, "created_by", "users", v.CreatedByID)
	setURL(related, "modified_by", "users", v.ModifiedByID)
	for _, sub := range []string{"hosts", "variable_data", "script", "activity_stream", "job_templates", "ad_hoc_commands", "access_list", "object_roles", "instance_groups", "copy", "labels"} {
		related.Set(sub, SubURL("inventories", v.ID, sub))
	}
	if v.Kind == "" || v.Kind == "constructed" {
		for _, sub := range []string{"groups", "root_groups", "update_inventory_sources", "inventory_sources", "tree"} {
			related.Set(sub, SubURL("inventories", v.ID, sub))
		}
	}
	setURL(related, "organization", "organizations", v.OrganizationID)
	if v.Kind == "constructed" {
		related.Set("input_inventories", SubURL("inventories", v.ID, "input_inventories"))
		related.Set("constructed_url", URLFor("constructed_inventories", v.ID))
	}
	if v.Kind == "federated" {
		related.Set("input_inventories", SubURL("inventories", v.ID, "input_inventories"))
		related.Set("federated_url", URLFor("federated_inventories", v.ID))
	}
	summary := NewOMap()
	c.putSummary(summary, "organization", c.OrgSummary, v.OrganizationID)
	c.putSummary(summary, "created_by", c.UserSummary, v.CreatedByID)
	c.putSummary(summary, "modified_by", c.UserSummary, v.ModifiedByID)
	if c.WantSummary("object_roles") {
		summary.Set("object_roles", c.RolesSummary("inventory", models.InventoryRoleFields, v.RoleID))
	}
	if c.WantSummary("user_capabilities") {
		edit := c.HasRole(v.AdminRoleID)
		adhoc := c.HasRole(v.AdhocRoleID)
		copyOK := false
		if c.User != nil && c.User.IsSuperuser {
			copyOK = true
		} else if v.OrganizationID != nil {
			copyOK = c.HasRoleOn("main.organization", *v.OrganizationID, "inventory_admin_role")
		}
		summary.Set("user_capabilities", Caps("edit", edit, "delete", edit, "copy", copyOK, "adhoc", adhoc))
	}
	if c.WantSummary("labels") {
		lr := make([]any, 0, len(labels))
		for _, l := range labels {
			lr = append(lr, NewOMap().Set("id", l.ID).Set("name", l.Name))
		}
		summary.Set("labels", NewOMap().Set("count", len(labels)).Set("results", lr))
	}
	url := URLFor(view.collection(), v.ID)
	o := Base(NewOMap(), v.ID, "inventory", url, related, summary, v.Created, v.Modified, v.Name, v.Description)
	o.Set("organization", models.NullableID(v.OrganizationID)).Set("kind", v.Kind)
	if view == viewInventories {
		if v.HostFilter == nil {
			o.Set("host_filter", nil)
		} else {
			o.Set("host_filter", *v.HostFilter)
		}
	}
	o.Set("variables", v.Variables).Set("has_active_failures", v.HasActiveFailures).Set("total_hosts", v.TotalHosts)
	o.Set("hosts_with_active_failures", v.HostsWithActiveFailures).Set("total_groups", v.TotalGroups).Set("has_inventory_sources", v.HasInventorySources)
	o.Set("total_inventory_sources", v.TotalInventorySources).Set("inventory_sources_with_failures", v.InventorySourcesWithFailures)
	o.Set("pending_deletion", v.PendingDeletion)
	if view != viewFederated {
		o.Set("prevent_instance_group_fallback", v.PreventInstanceGroupFallback)
	}
	o.Set("allow_deletes_while_in_use", v.AllowDeletesWhileInUse).Set("allow_jobs_while_syncing", v.AllowJobsWhileSyncing)
	if constructed {
		// No source: the fields' attribute lookups failed and they were null.
		if src != nil {
			o.Set("source_vars", src.SourceVars).Set("update_cache_timeout", src.UpdateCacheTimeout).Set("limit", src.Limit).Set("verbosity", src.Verbosity)
		} else {
			o.Set("source_vars", nil).Set("update_cache_timeout", nil).Set("limit", nil).Set("verbosity", nil)
		}
	}
	return o
}

// inventoryObj is an inventory.
var inventoryObj = &pathObject[*models.Inventory]{
	model:    "Inventory",
	get:      models.GetInventory,
	readable: func(c *SerCtx, v *models.Inventory) bool { return c.HasRole(v.ReadRoleID) },
}

func (s *Server) inventoryDetail(w http.ResponseWriter, r *http.Request) error {
	return s.inventoryDetailWith(w, r, viewInventories)
}

func (s *Server) constructedInventoryDetail(w http.ResponseWriter, r *http.Request) error {
	return s.inventoryDetailWith(w, r, viewConstructed)
}

func (s *Server) federatedInventoryDetail(w http.ResponseWriter, r *http.Request) error {
	return s.inventoryDetailWith(w, r, viewFederated)
}

// inventoryDetailWith serves an inventory through one of its endpoints.
// The old detail views did not filter by kind: any inventory reads through
// any of them, with that endpoint's serializer.
func (s *Server) inventoryDetailWith(w http.ResponseWriter, r *http.Request, view invView) error {
	_, v, err := inventoryObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	results, err := s.serializeInventories(c, []*models.Inventory{v}, view)
	if err != nil {
		return err
	}
	WriteJSON(w, 200, results[0])
	return nil
}

var inventoryKindChoices = [][2]string{{"", "Hosts have a direct link to this inventory."}, {"smart", "Hosts for inventory generated using the host_filter property."}, {"constructed", "Parse list of source inventories with the constructed inventory plugin."}, {"federated", "Hosts are imported from other inventories."}}

func (s *Server) inventoryFromForm(r *http.Request, f *Form, v *models.Inventory, isNew bool) {
	v.Name = f.String("name", true, 512, v.Name)
	v.Description = f.String("description", false, 0, v.Description)
	if id, set := f.ID("organization", v.OrganizationID, true, s.existsIn(r.Context(), "main_organization")); set {
		v.OrganizationID = id
	}
	// kind is writable through InventorySerializer (the constructed and
	// federated views drop it from the body); on an update the view has
	// refused any other kind but an empty one, which turns the inventory
	// into a regular one.
	if raw, ok := f.Raw("kind"); ok && raw == nil {
		f.Errs.Add("kind", "This field may not be null.")
	} else {
		v.Kind = f.Choice("kind", v.Kind, inventoryKindChoices, false)
	}
	if f.Has("host_filter") {
		raw, _ := f.Raw("host_filter")
		if raw == nil {
			v.HostFilter = nil
		} else {
			hf := f.String("host_filter", false, 0, "")
			if hf == "" {
				v.HostFilter = nil
			} else {
				if err := validateHostFilter(hf); err != nil {
					f.Errs.Add("host_filter", err.Error())
				}
				v.HostFilter = &hf
			}
		}
	}
	if f.Has("variables") {
		vars := f.String("variables", false, 0, v.Variables)
		if err := ValidateVars(vars); err != nil {
			f.Errs.Add("variables", err.Error())
		} else {
			v.Variables = vars
		}
	}
	v.PreventInstanceGroupFallback = f.Bool("prevent_instance_group_fallback", v.PreventInstanceGroupFallback)
	v.AllowDeletesWhileInUse = f.Bool("allow_deletes_while_in_use", v.AllowDeletesWhileInUse)
	v.AllowJobsWhileSyncing = f.Bool("allow_jobs_while_syncing", v.AllowJobsWhileSyncing)
	if v.Kind == "smart" && (v.HostFilter == nil || *v.HostFilter == "") {
		f.Errs.Add("host_filter", "Smart inventories must specify host_filter")
	}
}

func (s *Server) inventoryNameTaken(r *http.Request, name string, org *int64, excludeID int64) (bool, error) {
	var ok bool
	if org == nil {
		if err := s.Q().QueryRow(r.Context(), `SELECT EXISTS (SELECT 1 FROM main_inventory WHERE name = $1 AND organization_id IS NULL AND id <> $2)`, name, excludeID).Scan(&ok); err != nil {
			return false, err
		}
	} else {
		if err := s.Q().QueryRow(r.Context(), `SELECT EXISTS (SELECT 1 FROM main_inventory WHERE name = $1 AND organization_id = $2 AND id <> $3)`, name, *org, excludeID).Scan(&ok); err != nil {
			return false, err
		}
	}
	return ok, nil
}

func (s *Server) inventoryChanges(c *SerCtx, v *models.Inventory) map[string]any {
	var org any
	if v.OrganizationID != nil {
		if o := c.OrgSummary(v.OrganizationID); o != nil {
			n, _ := o.Get("name")
			org = activity.Ref(fmt.Sprint(n), *v.OrganizationID)
		}
	}
	var hf any
	if v.HostFilter != nil {
		hf = *v.HostFilter
	}
	return map[string]any{"name": v.Name, "description": v.Description, "organization": org, "kind": v.Kind, "host_filter": hf, "variables": v.Variables,
		"prevent_instance_group_fallback": v.PreventInstanceGroupFallback, "allow_deletes_while_in_use": v.AllowDeletesWhileInUse, "allow_jobs_while_syncing": v.AllowJobsWhileSyncing, "id": v.ID}
}

func (s *Server) inventoryCreate(w http.ResponseWriter, r *http.Request) error {
	return s.inventoryCreateWith(w, r, viewInventories)
}

func (s *Server) constructedInventoryCreate(w http.ResponseWriter, r *http.Request) error {
	return s.inventoryCreateWith(w, r, viewConstructed)
}

func (s *Server) federatedInventoryCreate(w http.ResponseWriter, r *http.Request) error {
	return s.inventoryCreateWith(w, r, viewFederated)
}

// viewBody drops what a view's serializer has no field for and fixes the
// kind it creates.
func viewBody(body *OMap, view invView, create bool) {
	switch view {
	case viewConstructed:
		body.Delete("host_filter")
	case viewFederated:
		body.Delete("host_filter")
		body.Delete("prevent_instance_group_fallback")
	default:
		return
	}
	body.Delete("kind")
	if create {
		body.Set("kind", string(view))
	}
}

// inventoryCreateWith creates an inventory; through constructed_inventories
// the kind is fixed, host_filter is not a field, and the source fields go to
// the auto-created source (ConstructedInventorySerializer.create).
func (s *Server) inventoryCreateWith(w http.ResponseWriter, r *http.Request, view invView) error {
	constructed := view == viewConstructed
	u, err := RequireWrite(r)
	if err != nil {
		return err
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	viewBody(body, view, true)
	if r.PathValue("id") != "" {
		id, err := PathID(r)
		if err != nil {
			return NotFoundFor("Organization")
		}
		if _, err := organizationObj.load(s, r, u, id); err != nil {
			return err
		}
		body.Set("organization", fmt.Sprint(id))
	}
	f := NewForm(body, false)
	v := &models.Inventory{CreatedByID: &u.ID, ModifiedByID: &u.ID, Variables: ""}
	s.inventoryFromForm(r, f, v, true)
	var srcData func(*models.InventorySource) bool
	if constructed {
		srcData = constructedSourceForm(f)
	}
	if err := f.Err(); err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	if !u.IsSuperuser && (v.OrganizationID == nil || !c.HasRoleOn("main.organization", *v.OrganizationID, "inventory_admin_role")) {
		return ErrForbidden
	}
	if v, err := s.inventoryNameTaken(r, v.Name, v.OrganizationID, 0); err != nil {
		return err
	} else if v {
		return FieldErrors{"__all__": {"Inventory with this (name, organization) combination already exists."}}.Err()
	}
	ctx := r.Context()
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if err := models.InsertInventory(ctx, tx, v, s.CT, s.Roles, s.orgLookup(r, tx)); err != nil {
			return err
		}
		// Inventory._enforce_constructed_source
		if v.Kind == "constructed" {
			if _, err := models.EnsureConstructedSource(ctx, tx, v, s.CT); err != nil {
				return err
			}
			if err := s.applyConstructedSource(ctx, tx, u, v.ID, srcData); err != nil {
				return err
			}
		}
		return s.Activity.Record(ctx, tx, activity.Entry{Operation: "create", Object1: "inventory", Changes: s.inventoryChanges(c.InTx(tx), v), ActorID: &u.ID, Links: map[string]int64{"inventory": v.ID}})
	})
	if err != nil {
		return err
	}
	results, err := s.serializeInventories(c, []*models.Inventory{v}, view)
	if err != nil {
		return err
	}
	w.Header().Set("Location", URLFor(view.collection(), v.ID))
	WriteJSON(w, http.StatusCreated, results[0])
	return nil
}

func (s *Server) inventoryUpdate(w http.ResponseWriter, r *http.Request) error {
	return s.inventoryUpdateWith(w, r, viewInventories)
}

func (s *Server) constructedInventoryUpdate(w http.ResponseWriter, r *http.Request) error {
	return s.inventoryUpdateWith(w, r, viewConstructed)
}

func (s *Server) federatedInventoryUpdate(w http.ResponseWriter, r *http.Request) error {
	return s.inventoryUpdateWith(w, r, viewFederated)
}

func (s *Server) inventoryUpdateWith(w http.ResponseWriter, r *http.Request, view invView) error {
	constructed := view == viewConstructed
	u, v, err := inventoryObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	// Writes through the constructed and federated endpoints stay with
	// their own kind (the old views would edit any inventory).
	if view != viewInventories && v.Kind != string(view) {
		return NotFoundFor("Inventory")
	}
	c := s.NewSerCtx(r, true)
	if !c.HasRole(v.AdminRoleID) {
		return ErrForbidden
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	// InventoryDetail.update: a kind other than the inventory's is a 405
	// (an empty one is not, and goes to the serializer, which writes it).
	if kind, ok := body.Get("kind"); ok && pyTruthy(kind) {
		if ks, isStr := kind.(string); !isStr || ks != v.Kind {
			return &APIError{Status: http.StatusMethodNotAllowed, Body: NewOMap().Set("error", `You cannot turn a regular inventory into a "smart", "constructed", or "federated" inventory.`)}
		}
	}
	before := s.inventoryChanges(c, v)
	prevOrg := v.OrganizationID
	prevHostFilter := ""
	if v.HostFilter != nil {
		prevHostFilter = *v.HostFilter
	}
	viewBody(body, view, false)
	f := NewForm(body, r.Method == http.MethodPatch)
	s.inventoryFromForm(r, f, v, false)
	var srcData func(*models.InventorySource) bool
	if constructed {
		srcData = constructedSourceForm(f)
	}
	if err := f.Err(); err != nil {
		return err
	}
	orgChanged := (prevOrg == nil) != (v.OrganizationID == nil) || (prevOrg != nil && v.OrganizationID != nil && *prevOrg != *v.OrganizationID)
	orgAdmin := func(org *int64) bool {
		return org != nil && c.HasRoleOn("main.organization", *org, "inventory_admin_role")
	}
	// InventoryAccess.can_admin: moving an inventory takes inventory_admin
	// on the organization it leaves as well as the one it joins
	// (check_related with obj), or an object admin could take it away from
	// its organization's admins.
	if orgChanged && !u.IsSuperuser && (!orgAdmin(v.OrganizationID) || (prevOrg != nil && !orgAdmin(prevOrg))) {
		return ErrForbidden
	}
	// A smart inventory's hosts are whatever its host_filter matches in the
	// organization, variables included: changing it takes inventory_admin
	// on the organization, not admin of the inventory alone.
	hostFilter := ""
	if v.HostFilter != nil {
		hostFilter = *v.HostFilter
	}
	if hostFilter != prevHostFilter && !u.IsSuperuser && !orgAdmin(v.OrganizationID) {
		return ErrForbidden
	}
	if v, err := s.inventoryNameTaken(r, v.Name, v.OrganizationID, v.ID); err != nil {
		return err
	} else if v {
		return FieldErrors{"__all__": {"Inventory with this (name, organization) combination already exists."}}.Err()
	}
	v.ModifiedByID = &u.ID
	ctx := r.Context()
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if err := models.UpdateInventory(ctx, tx, v, s.orgLookup(r, tx), orgChanged); err != nil {
			return err
		}
		if err := s.applyConstructedSource(ctx, tx, u, v.ID, srcData); err != nil {
			return err
		}
		changes := diffChanges(before, s.inventoryChanges(c.InTx(tx), v))
		if len(changes) == 0 {
			return nil
		}
		return s.Activity.Record(ctx, tx, activity.Entry{Operation: "update", Object1: "inventory", Changes: changes, ActorID: &u.ID, Links: map[string]int64{"inventory": v.ID}})
	})
	if err != nil {
		return err
	}
	results, err := s.serializeInventories(c, []*models.Inventory{v}, view)
	if err != nil {
		return err
	}
	WriteJSON(w, 200, results[0])
	return nil
}

func (s *Server) federatedInventoryDelete(w http.ResponseWriter, r *http.Request) error {
	_, v, err := inventoryObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	if v.Kind != "federated" {
		return NotFoundFor("Inventory")
	}
	return s.inventoryDelete(w, r)
}

func (s *Server) constructedInventoryDelete(w http.ResponseWriter, r *http.Request) error {
	_, v, err := inventoryObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	if v.Kind != "constructed" {
		return NotFoundFor("Inventory")
	}
	return s.inventoryDelete(w, r)
}

func (s *Server) inventoryDelete(w http.ResponseWriter, r *http.Request) error {
	u, v, err := inventoryObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	if !c.HasRole(v.AdminRoleID) {
		return ErrForbidden
	}
	ctx := r.Context()
	// InventoryDetail.destroy: the related jobs check (jobs, inventory
	// updates and ad hoc commands; allow_deletes_while_in_use is for
	// hosts only), then schedule_deletion's refusal of a second deletion.
	if err := s.checkRelatedActiveJobs(ctx, inventoryJobsCond, v.ID); err != nil {
		return err
	}
	if v.PendingDeletion {
		return &APIError{Status: http.StatusBadRequest, Body: NewOMap().Set("error", "Inventory is already pending deletion.")}
	}
	// schedule_deletion's pending_deletion, then the deletion task's deleted.
	s.EmitInventoryStatus(ctx, v.ID, "pending_deletion")
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if err := s.Activity.Record(ctx, tx, activity.Entry{Operation: "delete", Object1: "inventory", Changes: s.inventoryChanges(c.InTx(tx), v), ActorID: &u.ID}); err != nil {
			return err
		}
		return models.DeleteInventory(ctx, tx, v.ID, s.CT, s.Cascade)
	})
	if err != nil {
		return err
	}
	s.EmitInventoryStatus(ctx, v.ID, "deleted")
	// The old view scheduled the deletion and answered 202; this one is
	// already done but keeps the status clients expect.
	w.WriteHeader(http.StatusAccepted)
	return nil
}

// variableData serves and updates a variables field as a JSON object.
func (s *Server) variableData(w http.ResponseWriter, r *http.Request, current string, canEdit bool, save func(string) error) error {
	if r.Method == http.MethodGet {
		m, err := ParseVars(current)
		if err != nil {
			m = map[string]any{}
		}
		WriteJSON(w, 200, m)
		return nil
	}
	if !canEdit {
		return ErrForbidden
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	// The body is the variables document itself, stored as
	// BaseVariableDataSerializer stored it: json.dumps(data), with Python's
	// separators and escapes (HTML characters as they are).
	b, err := activity.PyJSON(body)
	if err != nil {
		return err
	}
	raw := string(b)
	if err := ValidateVars(raw); err != nil {
		return FieldErrors{"variables": {err.Error()}}.Err()
	}
	if err := save(raw); err != nil {
		return err
	}
	m, _ := ParseVars(raw)
	WriteJSON(w, 200, m)
	return nil
}

func (s *Server) inventoryVariableData(w http.ResponseWriter, r *http.Request) error {
	u, v, err := inventoryObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	return s.variableData(w, r, v.Variables, u.CanWrite() && c.HasRole(v.AdminRoleID), func(vars string) error {
		_, err := s.Q().Exec(r.Context(), `UPDATE main_inventory SET variables = $2, modified = now(), modified_by_id = $3 WHERE id = $1`, v.ID, vars, u.ID)
		return err
	})
}

// inventoryScript renders the dynamic inventory script output.
func (s *Server) inventoryScript(w http.ResponseWriter, r *http.Request) error {
	_, v, err := inventoryObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	q := r.URL.Query()
	hosts, err := InventoryHostRows(r.Context(), s.Q(), v, q.Get("all") != "")
	if err != nil {
		return err
	}
	out, _, err := InventoryScriptData(r.Context(), s.Q(), v, hosts, q.Get("hostvars") != "", q.Get("towervars") != "")
	if err != nil {
		return err
	}
	WriteJSON(w, 200, out)
	return nil
}

// InventoryScriptData builds the dynamic inventory of hosts the way
// Inventory.get_script_data did, and returns the host name to id map the
// task runner attributes events with. towervars adds the remote_host_* and
// remote_tower_* variables.
func InventoryScriptData(ctx context.Context, q db.Querier, v *models.Inventory, hosts []*models.Host, hostvars, towervars bool) (*OMap, map[string]int64, error) {
	out := NewOMap()
	allGroup := NewOMap()
	hostNames := map[int64]string{}
	hostMap := map[string]int64{}
	for _, h := range hosts {
		hostNames[h.ID] = h.Name
		hostMap[h.Name] = h.ID
	}
	if vars, err := ParseVars(v.Variables); err == nil && len(vars) > 0 {
		allGroup.Set("vars", vars)
	}
	if v.Kind == "smart" {
		names := make([]string, 0, len(hosts))
		for _, h := range hosts {
			names = append(names, h.Name)
		}
		allGroup.Set("hosts", names)
		out.Set("all", allGroup)
	} else {
		grouped := map[int64]bool{}
		type grp struct {
			id       int64
			name     string
			vars     string
			hosts    []string
			children []string
		}
		var groups []*grp
		byID := map[int64]*grp{}
		rows, err := q.Query(ctx, `SELECT id, name, variables FROM main_group WHERE inventory_id = $1 ORDER BY name`, v.ID)
		if err != nil {
			return nil, nil, err
		}
		for rows.Next() {
			g := &grp{}
			if err := rows.Scan(&g.id, &g.name, &g.vars); err != nil {
				rows.Close()
				return nil, nil, err
			}
			groups = append(groups, g)
			byID[g.id] = g
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return nil, nil, err
		}
		ghRows, err := q.Query(ctx, `SELECT gh.group_id, gh.host_id FROM main_group_hosts gh JOIN main_group g ON g.id = gh.group_id WHERE g.inventory_id = $1`, v.ID)
		if err != nil {
			return nil, nil, err
		}
		for ghRows.Next() {
			var gid, hid int64
			if err := ghRows.Scan(&gid, &hid); err != nil {
				ghRows.Close()
				return nil, nil, err
			}
			if name, ok := hostNames[hid]; ok {
				if g, ok := byID[gid]; ok {
					g.hosts = append(g.hosts, name)
					grouped[hid] = true
				}
			}
		}
		ghRows.Close()
		if err := ghRows.Err(); err != nil {
			return nil, nil, err
		}
		childRows, err := q.Query(ctx, `SELECT gp.to_group_id, gp.from_group_id FROM main_group_parents gp JOIN main_group g ON g.id = gp.to_group_id WHERE g.inventory_id = $1`, v.ID)
		if err != nil {
			return nil, nil, err
		}
		isChild := map[int64]bool{}
		for childRows.Next() {
			var parent, child int64
			if err := childRows.Scan(&parent, &child); err != nil {
				childRows.Close()
				return nil, nil, err
			}
			if p, ok := byID[parent]; ok {
				if c, ok := byID[child]; ok {
					p.children = append(p.children, c.name)
					isChild[child] = true
				}
			}
		}
		childRows.Close()
		if err := childRows.Err(); err != nil {
			return nil, nil, err
		}
		var ungrouped []string
		for _, h := range hosts {
			if !grouped[h.ID] {
				ungrouped = append(ungrouped, h.Name)
			}
		}
		if ungrouped == nil {
			ungrouped = []string{}
		}
		allGroup.Set("hosts", ungrouped)
		var roots []string
		for _, g := range groups {
			if !isChild[g.id] {
				roots = append(roots, g.name)
			}
		}
		if roots == nil {
			roots = []string{}
		}
		allGroup.Set("children", roots)
		out.Set("all", allGroup)
		for _, g := range groups {
			o := NewOMap()
			sort.Strings(g.hosts)
			if g.hosts == nil {
				g.hosts = []string{}
			}
			o.Set("hosts", g.hosts)
			if len(g.children) > 0 {
				sort.Strings(g.children)
				o.Set("children", g.children)
			}
			if vars, err := ParseVars(g.vars); err == nil && len(vars) > 0 {
				o.Set("vars", vars)
			}
			out.Set(g.name, o)
		}
	}
	if hostvars {
		hv := NewOMap()
		for _, h := range hosts {
			vars, err := ParseVars(h.Variables)
			if err != nil || vars == nil {
				vars = map[string]any{}
			}
			if towervars {
				for _, prefix := range []string{"host", "tower"} {
					vars["remote_"+prefix+"_enabled"] = fmt.Sprint(h.Enabled)
					vars["remote_"+prefix+"_id"] = h.ID
				}
			}
			hv.Set(h.Name, vars)
		}
		out.Set("_meta", NewOMap().Set("hostvars", hv))
	}
	return out, hostMap, nil
}

// InventoryHostRows lists the hosts of an inventory in name order,
// honouring smart host filters; disabled hosts are included on request.
// A smart inventory has one host per name, the lowest id of those its
// filter matches (HostManager's order_by('name', 'pk').distinct('name')):
// same-named hosts of different inventories are one host in it.
func InventoryHostRows(ctx context.Context, db db.Querier, v *models.Inventory, includeDisabled bool) ([]*models.Host, error) {
	sql, args, err := inventoryHostsSQL(v, models.HostColumns, includeDisabled)
	if err != nil {
		return nil, err
	}
	rows, err := db.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*models.Host
	for rows.Next() {
		h, err := models.ScanHost(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, h)
	}
	return out, rows.Err()
}

// inventoryHostsSQL selects columns of the hosts InventoryHostRows lists.
func inventoryHostsSQL(v *models.Inventory, columns string, includeDisabled bool) (string, []any, error) {
	q := NewQuery()
	smart := v.Kind == "smart" && v.HostFilter != nil && *v.HostFilter != ""
	if smart {
		n, err := parseSmartFilter(*v.HostFilter)
		if err != nil {
			return "", nil, BadRequest(err.Error())
		}
		clause, err := smartFilterSQL(q, hostFields, n)
		if err != nil {
			return "", nil, err
		}
		q.And(clause)
		if v.OrganizationID != nil {
			q.And("hi.organization_id = " + q.Arg(*v.OrganizationID))
			q.AddJoin("LEFT JOIN main_inventory hi ON hi.id = h.inventory_id")
		}
	} else {
		q.And("h.inventory_id = " + q.Arg(v.ID))
	}
	if !includeDisabled {
		q.And("h.enabled")
	}
	if smart {
		return "SELECT DISTINCT ON (h.name) " + columns + " FROM main_host h" + q.JoinSQL() + q.WhereSQL() + " ORDER BY h.name, h.id", q.Args, nil
	}
	return "SELECT " + columns + " FROM main_host h" + q.JoinSQL() + q.WhereSQL() + " ORDER BY h.name", q.Args, nil
}

// InventoryHostIDs is the ids of the hosts of an inventory, disabled ones
// included (inventory.hosts.values_list('id')), in InventoryHostRows'
// order: for a smart inventory, those its host filter selects.
func InventoryHostIDs(ctx context.Context, db db.Querier, v *models.Inventory) ([]int64, error) {
	sql, args, err := inventoryHostsSQL(v, "h.id", true)
	if err != nil {
		return nil, err
	}
	rows, err := db.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowTo[int64])
}

// inventoryTree renders root groups with nested children.
func (s *Server) inventoryTree(w http.ResponseWriter, r *http.Request) error {
	_, v, err := inventoryObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	ctx := r.Context()
	rows, err := s.Q().Query(ctx, `SELECT `+models.GroupColumns+` FROM main_group g WHERE g.inventory_id = $1 ORDER BY g.name`, v.ID)
	if err != nil {
		return err
	}
	var groups []*models.Group
	for rows.Next() {
		g, err := models.ScanGroup(rows)
		if err != nil {
			rows.Close()
			return err
		}
		groups = append(groups, g)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	children := map[int64][]int64{}
	isChild := map[int64]bool{}
	crow, err := s.Q().Query(ctx, `SELECT gp.to_group_id, gp.from_group_id FROM main_group_parents gp JOIN main_group g ON g.id = gp.to_group_id WHERE g.inventory_id = $1`, v.ID)
	if err != nil {
		return err
	}
	for crow.Next() {
		var p, c int64
		if err := crow.Scan(&p, &c); err != nil {
			crow.Close()
			return err
		}
		children[p] = append(children[p], c)
		isChild[c] = true
	}
	crow.Close()
	if err := crow.Err(); err != nil {
		return err
	}
	byID := map[int64]*models.Group{}
	for _, g := range groups {
		byID[g.ID] = g
	}
	c := s.NewSerCtx(r, false)
	c.NoCaps = true
	serialized, err := s.serializeGroups(c, groups)
	if err != nil {
		return err
	}
	byIDSer := map[int64]*OMap{}
	for i, g := range groups {
		byIDSer[g.ID] = serialized[i].(*OMap)
	}
	var build func(id int64, seen map[int64]bool) *OMap
	build = func(id int64, seen map[int64]bool) *OMap {
		o := byIDSer[id]
		var kids []any
		for _, cid := range children[id] {
			if seen[cid] {
				continue
			}
			seen[cid] = true
			if child := build(cid, seen); child != nil {
				kids = append(kids, child)
			}
		}
		if kids == nil {
			kids = []any{}
		}
		o.Set("children", kids)
		return o
	}
	out := []any{}
	for _, g := range groups {
		if !isChild[g.ID] {
			out = append(out, build(g.ID, map[int64]bool{g.ID: true}))
		}
	}
	WriteJSON(w, 200, out)
	return nil
}

func (s *Server) inventoryLabels(w http.ResponseWriter, r *http.Request) error {
	_, v, err := inventoryObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	return s.labelListWith(w, r, func(q *Query) {
		q.AddJoin("JOIN main_inventory_labels ill ON ill.label_id = l.id")
		q.And("ill.inventory_id = " + q.Arg(v.ID))
	})
}

func (s *Server) inventoryInputInventories(w http.ResponseWriter, r *http.Request) error {
	_, v, err := inventoryObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	// input_inventories is an OrderedManyToManyField: the related manager
	// sorted by the membership's position, and the view set no ordering
	// of its own, so the list comes in the order the inputs were given.
	spec := inventorySpec()
	// The membership join names the owner itself: a filter through a
	// to-many relation selects ids in a subquery and reads the rows from
	// spec.From again, where a member of several owners would otherwise
	// come once per owner, in another owner's position.
	spec.From = "main_inventory i JOIN main_inventoryconstructedinventorymembership icm ON icm.input_inventory_id = i.id AND icm.constructed_inventory_id = " + itoa(v.ID)
	spec.Fields = inventoryFields.With(map[string]Field{"position": {SQL: "icm.position", Kind: KindInt}})
	spec.DefaultOrder = []string{"position"}
	return s.inventoryListSpec(w, r, spec, nil, viewInventories)
}
