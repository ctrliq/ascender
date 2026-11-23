package api

import (
	"net/http"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/activity"
	"github.com/ctrliq/ascender/internal/auth"
	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/models"
)

func groupSpec() ListSpec {
	return ListSpec{Model: "Group", From: "main_group g", Columns: models.GroupColumns, PK: "g.id", Fields: groupFields, DefaultOrder: []string{"name"}}
}

func init() {
	resourceRegistrars = append(resourceRegistrars, (*Server).registerGroups)
}

func (s *Server) registerGroups(mux *http.ServeMux) {
	s.route(mux, "/api/v2/groups/{$}", methodMap{"GET": s.groupList, "POST": s.groupCreate}, s.optionsFor("groups"))
	s.route(mux, "/api/v2/groups/{id}/{$}", methodMap{"GET": s.groupDetail, "PUT": s.groupUpdate, "PATCH": s.groupUpdate, "DELETE": s.groupDelete}, s.optionsFor("groups"))
	s.route(mux, "/api/v2/groups/{id}/variable_data/{$}", methodMap{"GET": s.groupVariableData, "PUT": s.groupVariableData, "PATCH": s.groupVariableData}, nil)
	s.route(mux, "/api/v2/groups/{id}/hosts/{$}", methodMap{"GET": s.groupHosts, "POST": s.groupHostsAttach}, s.optionsFor("hosts"))
	s.route(mux, "/api/v2/groups/{id}/all_hosts/{$}", methodMap{"GET": s.groupAllHosts}, s.optionsFor("hosts"))
	s.route(mux, "/api/v2/groups/{id}/children/{$}", methodMap{"GET": s.groupChildren, "POST": s.groupChildrenAttach}, s.optionsFor("groups"))
	s.route(mux, "/api/v2/groups/{id}/potential_children/{$}", methodMap{"GET": s.groupPotentialChildren}, s.optionsFor("groups"))
}

func (s *Server) groupList(w http.ResponseWriter, r *http.Request) error {
	return s.groupListWith(w, r, nil)
}

func (s *Server) inventoryGroups(w http.ResponseWriter, r *http.Request) error {
	_, v, err := inventoryObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	if v.Kind == "federated" {
		return s.groupListWith(w, r, func(q *Query) { q.And(federatedInputs("g.inventory_id", q, v.ID)) })
	}
	return s.groupListWith(w, r, func(q *Query) { q.And("g.inventory_id = " + q.Arg(v.ID)) })
}

// federatedInputs limits an inventory column to a federated inventory's
// input inventories.
func federatedInputs(col string, q *Query, id int64) string {
	return col + " IN (SELECT m.input_inventory_id FROM main_inventoryconstructedinventorymembership m WHERE m.constructed_inventory_id = " + q.Arg(id) + ")"
}

func (s *Server) inventoryRootGroups(w http.ResponseWriter, r *http.Request) error {
	_, v, err := inventoryObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	return s.groupListWith(w, r, func(q *Query) {
		// A federated inventory's root groups are those of its inputs:
		// groups with no parent within their own inventory.
		if v.Kind == "federated" {
			q.And(federatedInputs("g.inventory_id", q, v.ID))
		} else {
			q.And("g.inventory_id = " + q.Arg(v.ID))
		}
		q.And("NOT EXISTS (SELECT 1 FROM main_group_parents gp WHERE gp.from_group_id = g.id)")
	})
}

func (s *Server) groupListWith(w http.ResponseWriter, r *http.Request, extra func(q *Query)) error {
	spec := groupSpec()
	spec.Access = s.groupAccess
	groups, count, page, err := runListOf(s, r, spec, extra, models.ScanGroup)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, false)
	results, err := s.serializeGroups(c, groups)
	if err != nil {
		return err
	}
	WriteJSON(w, 200, Paginate(r, page, count, results))
	return nil
}

func (s *Server) serializeGroups(c *SerCtx, groups []*models.Group) ([]any, error) {
	var userIDs, invIDs []int64
	for _, g := range groups {
		userIDs = append(userIDs, uniqueIDs(g.CreatedByID, g.ModifiedByID)...)
		invIDs = append(invIDs, g.InventoryID)
	}
	if err := c.PreloadUsers(userIDs); err != nil {
		return nil, err
	}
	invs, err := models.LoadInventorySummaries(c.Ctx(), c.Q(), invIDs)
	if err != nil {
		return nil, err
	}
	out := make([]any, 0, len(groups))
	for _, g := range groups {
		out = append(out, s.serializeGroup(c, g, invs[g.InventoryID]))
	}
	return out, nil
}

func (s *Server) serializeGroup(c *SerCtx, g *models.Group, inv models.InventorySummary) *OMap {
	related := NewOMap()
	if c.Detail {
		org := ""
		if o := c.OrgSummary(inv.OrganizationID); o != nil {
			n, _ := o.Get("name")
			org, _ = n.(string)
		}
		related.Set("named_url", "/api/v2/groups/"+namedURLEscape(g.Name)+"++"+namedURLEscape(inv.Name)+"++"+namedURLEscape(org)+"/")
	}
	setURL(related, "created_by", "users", g.CreatedByID)
	setURL(related, "modified_by", "users", g.ModifiedByID)
	for _, sub := range []string{"variable_data", "hosts", "potential_children", "children", "all_hosts", "job_events", "job_host_summaries", "activity_stream", "inventory_sources", "ad_hoc_commands"} {
		related.Set(sub, SubURL("groups", g.ID, sub))
	}
	related.Set("inventory", URLFor("inventories", g.InventoryID))
	summary := NewOMap()
	if c.WantSummary("inventory") {
		summary.Set("inventory", inventorySummaryMap(inv))
	}
	c.putSummary(summary, "created_by", c.UserSummary, g.CreatedByID)
	c.putSummary(summary, "modified_by", c.UserSummary, g.ModifiedByID)
	if c.WantSummary("user_capabilities") {
		edit := c.HasRoleOn("main.inventory", g.InventoryID, "admin_role")
		summary.Set("user_capabilities", Caps("edit", edit, "delete", edit, "copy", edit))
	}
	o := Base(NewOMap(), g.ID, "group", URLFor("groups", g.ID), related, summary, g.Created, g.Modified, g.Name, g.Description)
	o.Set("inventory", g.InventoryID).Set("variables", g.Variables)
	return o
}

// groupObj is a group, read through its inventory.
var groupObj = &pathObject[*models.Group]{
	model: "Group",
	get:   models.GetGroup,
	readable: func(c *SerCtx, v *models.Group) bool {
		return c.HasRoleOn("main.inventory", v.InventoryID, "read_role")
	},
}

func (s *Server) groupDetail(w http.ResponseWriter, r *http.Request) error {
	_, g, err := groupObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	results, err := s.serializeGroups(c, []*models.Group{g})
	if err != nil {
		return err
	}
	WriteJSON(w, 200, results[0])
	return nil
}

func (s *Server) groupFromForm(r *http.Request, f *Form, g *models.Group, isNew bool) {
	g.Name = f.String("name", true, 512, g.Name)
	if g.Name == "all" || g.Name == "_meta" {
		f.Errs.Add("name", "Invalid group name.")
	}
	g.Description = f.String("description", false, 0, g.Description)
	if isNew {
		if id, set := f.ID("inventory", nil, true, s.existsIn(r.Context(), "main_inventory")); set && id != nil {
			g.InventoryID = *id
		}
	}
	if f.Has("variables") {
		vars := f.String("variables", false, 0, g.Variables)
		if err := ValidateVars(vars); err != nil {
			f.Errs.Add("variables", err.Error())
		} else {
			g.Variables = vars
		}
	}
}

func (s *Server) groupChanges(g *models.Group, invName string) map[string]any {
	return map[string]any{"name": g.Name, "description": g.Description, "inventory": activity.Ref(invName, g.InventoryID), "variables": g.Variables, "id": g.ID}
}

func (s *Server) groupCreate(w http.ResponseWriter, r *http.Request) error {
	u, err := RequireWrite(r)
	if err != nil {
		return err
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	g, out, err := s.newGroup(r, u, body, nil)
	if err != nil {
		return err
	}
	w.Header().Set("Location", URLFor("groups", g.ID))
	WriteJSON(w, http.StatusCreated, out)
	return nil
}

// newGroup is the group create (GroupSerializer's validation and
// GroupAccess.can_add) of body, which names the inventory; then is as in
// newHost.
func (s *Server) newGroup(r *http.Request, u *auth.User, body *OMap, then func(tx pgx.Tx, g *models.Group) error) (*models.Group, any, error) {
	f := NewForm(body, false)
	g := &models.Group{CreatedByID: &u.ID, ModifiedByID: &u.ID}
	s.groupFromForm(r, f, g, true)
	if err := f.Err(); err != nil {
		return nil, nil, err
	}
	inv, err := inventoryObj.load(s, r, u, g.InventoryID)
	if err != nil {
		return nil, nil, err
	}
	if inv.Kind == "constructed" || inv.Kind == "smart" {
		return nil, nil, Detail(http.StatusBadRequest, "Cannot create Group for Smart or Constructed Inventories")
	}
	c := s.NewSerCtx(r, true)
	if !c.HasRole(inv.AdminRoleID) {
		return nil, nil, ErrForbidden
	}
	ctx := r.Context()
	if taken, err := db.Exists(ctx, s.Q(), `SELECT 1 FROM main_host WHERE name = $1 AND inventory_id = $2`, g.Name, g.InventoryID); err != nil {
		return nil, nil, err
	} else if taken {
		return nil, nil, FieldErrors{"__all__": {"A Host with that name already exists."}}.Err()
	}
	if taken, err := db.Exists(ctx, s.Q(), `SELECT 1 FROM main_group WHERE name = $1 AND inventory_id = $2`, g.Name, g.InventoryID); err != nil {
		return nil, nil, err
	} else if taken {
		return nil, nil, FieldErrors{"__all__": {"Group with this (name, inventory) combination already exists."}}.Err()
	}
	var out any
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if err := models.InsertGroup(ctx, tx, g); err != nil {
			return err
		}
		if err := s.Activity.Record(ctx, tx, activity.Entry{Operation: "create", Object1: "group", Changes: s.groupChanges(g, inv.Name), ActorID: &u.ID, Links: map[string]int64{"group": g.ID, "inventory": inv.ID}}); err != nil {
			return err
		}
		results, err := s.serializeGroups(c.InTx(tx), []*models.Group{g})
		if err != nil {
			return err
		}
		out = results[0]
		if then != nil {
			return then(tx, g)
		}
		return nil
	})
	if err != nil {
		return nil, nil, err
	}
	return g, out, nil
}

func (s *Server) groupUpdate(w http.ResponseWriter, r *http.Request) error {
	u, g, err := groupObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	if !c.HasRoleOn("main.inventory", g.InventoryID, "admin_role") {
		return ErrForbidden
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	invName := colOf[string](r.Context(), s.Q(), "main_inventory", "name", g.InventoryID)
	before := s.groupChanges(g, invName)
	f := NewForm(body, r.Method == http.MethodPatch)
	s.groupFromForm(r, f, g, false)
	if err := f.Err(); err != nil {
		return err
	}
	var exists bool
	_ = db.Tolerant(s.Q()).QueryRow(r.Context(), `SELECT EXISTS (SELECT 1 FROM main_group WHERE name = $1 AND inventory_id = $2 AND id <> $3)`, g.Name, g.InventoryID, g.ID).Scan(&exists)
	if exists {
		return FieldErrors{"__all__": {"Group with this (name, inventory) combination already exists."}}.Err()
	}
	g.ModifiedByID = &u.ID
	ctx := r.Context()
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if err := models.UpdateGroup(ctx, tx, g); err != nil {
			return err
		}
		changes := diffChanges(before, s.groupChanges(g, invName))
		if len(changes) == 0 {
			return nil
		}
		return s.Activity.Record(ctx, tx, activity.Entry{Operation: "update", Object1: "group", Changes: changes, ActorID: &u.ID, Links: map[string]int64{"group": g.ID, "inventory": g.InventoryID}})
	})
	if err != nil {
		return err
	}
	results, err := s.serializeGroups(c, []*models.Group{g})
	if err != nil {
		return err
	}
	WriteJSON(w, 200, results[0])
	return nil
}

func (s *Server) groupDelete(w http.ResponseWriter, r *http.Request) error {
	u, g, err := groupObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	if !c.HasRoleOn("main.inventory", g.InventoryID, "admin_role") {
		return ErrForbidden
	}
	invName := colOf[string](r.Context(), s.Q(), "main_inventory", "name", g.InventoryID)
	ctx := r.Context()
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if err := s.Activity.Record(ctx, tx, activity.Entry{Operation: "delete", Object1: "group", Changes: s.groupChanges(g, invName), ActorID: &u.ID, Links: map[string]int64{"inventory": g.InventoryID}}); err != nil {
			return err
		}
		return models.DeleteGroupRecursive(ctx, tx, g, s.Cascade)
	})
	if err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func (s *Server) groupVariableData(w http.ResponseWriter, r *http.Request) error {
	u, g, err := groupObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	return s.variableData(w, r, g.Variables, u.CanWrite() && c.HasRoleOn("main.inventory", g.InventoryID, "admin_role"), func(vars string) error {
		_, err := s.Q().Exec(r.Context(), `UPDATE main_group SET variables = $2, modified = now(), modified_by_id = $3 WHERE id = $1`, g.ID, vars, u.ID)
		return err
	})
}

func (s *Server) groupHosts(w http.ResponseWriter, r *http.Request) error {
	_, g, err := groupObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	return s.hostListWith(w, r, func(q *Query) {
		q.AddJoin("JOIN main_group_hosts ghh ON ghh.host_id = h.id")
		q.And("ghh.group_id = " + q.Arg(g.ID))
	})
}

func (s *Server) groupAllHosts(w http.ResponseWriter, r *http.Request) error {
	_, g, err := groupObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	return s.hostListWith(w, r, func(q *Query) {
		q.And("h.id IN " + groupAllHostsIn(q, g))
	})
}

func (s *Server) groupChildren(w http.ResponseWriter, r *http.Request) error {
	_, g, err := groupObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	return s.groupListWith(w, r, func(q *Query) {
		q.AddJoin("JOIN main_group_parents gcp ON gcp.from_group_id = g.id")
		q.And("gcp.to_group_id = " + q.Arg(g.ID))
	})
}

// groupPotentialChildren lists groups of the inventory that are neither the
// group itself nor one of its ancestors or descendants.
func (s *Server) groupPotentialChildren(w http.ResponseWriter, r *http.Request) error {
	_, g, err := groupObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	return s.groupListWith(w, r, func(q *Query) {
		q.And("g.inventory_id = " + q.Arg(g.InventoryID))
		gid := q.Arg(g.ID)
		q.And("g.id <> " + gid)
		q.And(`g.id NOT IN (WITH RECURSIVE up AS (SELECT gp.to_group_id AS id FROM main_group_parents gp WHERE gp.from_group_id = ` + gid + ` UNION SELECT gp.to_group_id FROM main_group_parents gp JOIN up ON gp.from_group_id = up.id) SELECT id FROM up)`)
		q.And(`g.id NOT IN (SELECT gp.from_group_id FROM main_group_parents gp WHERE gp.to_group_id = ` + gid + `)`)
	})
}
