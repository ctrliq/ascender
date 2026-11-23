package api

import (
	"context"
	"net/http"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/activity"
	"github.com/ctrliq/ascender/internal/models"
)

func init() {
	resourceRegistrars = append(resourceRegistrars, func(s *Server, mux *http.ServeMux) {
		s.route(mux, "/api/v2/inventories/{id}/copy/{$}", methodMap{"GET": s.inventoryCanCopy, "POST": s.inventoryCopy}, nil)
	})
}

// canCopyInventory is InventoryAccess.can_add with the copy's data: the
// user may add inventories to its organization. can_copy_related is
// BaseAccess's, always true.
func (s *Server) canCopyInventory(c *SerCtx, v *models.Inventory) bool {
	if c.User.IsSuperuser {
		return true
	}
	return v.OrganizationID != nil && c.HasRoleOn("main.organization", *v.OrganizationID, "inventory_admin_role")
}

// inventoryCanCopy is InventoryCopy's GET.
func (s *Server) inventoryCanCopy(w http.ResponseWriter, r *http.Request) error {
	_, v, err := inventoryObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	WriteJSON(w, http.StatusOK, NewOMap().Set("can_copy", s.canCopyInventory(s.NewSerCtx(r, true), v)))
	return nil
}

// inventoryCopy is InventoryCopy's POST. The copy takes InventorySerializer's
// writable fields and the instance groups, and the creator gets admin on it.
// The old view then copied the hosts and groups in a task
// (deep_copy_model_obj), with the activity stream off, and answered before
// it ran; here they are copied in the same transaction, and the response
// still shows the copy as the view created it, with no hosts or groups
// counted yet.
func (s *Server) inventoryCopy(w http.ResponseWriter, r *http.Request) error {
	u, v, err := inventoryObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	if !s.canCopyInventory(c, v) {
		return ErrForbidden
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	name, err := copyName(body, v.Name)
	if err != nil {
		return err
	}
	if taken, err := s.inventoryNameTaken(r, name, v.OrganizationID, 0); err != nil {
		return err
	} else if taken {
		return FieldErrors{"__all__": {"Inventory with this (name, organization) combination already exists."}}.Err()
	}
	n := &models.Inventory{Name: name, Description: v.Description, Variables: v.Variables, OrganizationID: v.OrganizationID, HostFilter: v.HostFilter, Kind: v.Kind,
		PreventInstanceGroupFallback: v.PreventInstanceGroupFallback, AllowDeletesWhileInUse: v.AllowDeletesWhileInUse, AllowJobsWhileSyncing: v.AllowJobsWhileSyncing,
		CreatedByID: &u.ID, ModifiedByID: &u.ID}
	ctx := r.Context()
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if err := models.InsertInventory(ctx, tx, n, s.CT, s.Roles, s.orgLookup(r, tx)); err != nil {
			return err
		}
		// Inventory._enforce_constructed_source
		if n.Kind == "constructed" {
			if _, err := models.EnsureConstructedSource(ctx, tx, n, s.CT); err != nil {
				return err
			}
		}
		if err := s.Activity.Record(ctx, tx, activity.Entry{Operation: "create", Object1: "inventory", Changes: s.inventoryChanges(c.InTx(tx), n), ActorID: &u.ID, Links: map[string]int64{"inventory": n.ID}}); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO main_inventoryinstancegroupmembership (position, instancegroup_id, inventory_id)
			SELECT row_number() OVER (ORDER BY position, id) - 1, instancegroup_id, $2 FROM main_inventoryinstancegroupmembership WHERE inventory_id = $1 ORDER BY position, id`, v.ID, n.ID); err != nil {
			return err
		}
		if err := s.addAdminMember(ctx, tx, u, *n.AdminRoleID, u.ID); err != nil {
			return err
		}
		if err := copyInventoryTree(ctx, tx, v.ID, n.ID, u.ID); err != nil {
			return err
		}
		return models.UpdateInventoryComputedFields(ctx, tx, n.ID)
	})
	if err != nil {
		return err
	}
	results, err := s.serializeInventories(c, []*models.Inventory{n}, viewInventories)
	if err != nil {
		return err
	}
	w.Header().Set("Location", URLFor("inventories", n.ID))
	WriteJSON(w, http.StatusCreated, results[0])
	return nil
}

// copyInventoryTree is deep_copy_model_obj for an inventory: each host and
// group is copied with its FIELDS_TO_PRESERVE_AT_COPY (no facts, no last
// job), created by the user and, as the task had no request user, modified
// by no one; _reconstruct_relationships then links the copies as the
// originals were linked: group hosts, and group parents and children. The
// copies' ids are drawn from the sequences first, in the originals' order,
// so each original maps to its copy.
func copyInventoryTree(ctx context.Context, tx pgx.Tx, from, to, userID int64) error {
	steps := []struct {
		sql  string
		args []any
	}{
		{`CREATE TEMP TABLE inventory_copy_hosts (old_id integer PRIMARY KEY, new_id integer NOT NULL) ON COMMIT DROP`, nil},
		{`CREATE TEMP TABLE inventory_copy_groups (old_id integer PRIMARY KEY, new_id integer NOT NULL) ON COMMIT DROP`, nil},
		{`INSERT INTO inventory_copy_hosts SELECT id, nextval(pg_get_serial_sequence('main_host', 'id')) FROM (SELECT id FROM main_host WHERE inventory_id = $1 ORDER BY id) h`, []any{from}},
		{`INSERT INTO inventory_copy_groups SELECT id, nextval(pg_get_serial_sequence('main_group', 'id')) FROM (SELECT id FROM main_group WHERE inventory_id = $1 ORDER BY id) g`, []any{from}},
		{`INSERT INTO main_host (id, created, modified, description, name, enabled, instance_id, variables, created_by_id, modified_by_id, inventory_id, ansible_facts, ansible_facts_modified)
			SELECT m.new_id, now(), now(), h.description, h.name, h.enabled, h.instance_id, h.variables, $2, NULL, $1, '{}'::jsonb, NULL
			FROM main_host h JOIN inventory_copy_hosts m ON m.old_id = h.id ORDER BY h.id`, []any{to, userID}},
		{`INSERT INTO main_group (id, created, modified, description, name, variables, created_by_id, modified_by_id, inventory_id)
			SELECT m.new_id, now(), now(), g.description, g.name, g.variables, $2, NULL, $1
			FROM main_group g JOIN inventory_copy_groups m ON m.old_id = g.id ORDER BY g.id`, []any{to, userID}},
		{`INSERT INTO main_group_hosts (group_id, host_id) SELECT g.new_id, h.new_id FROM main_group_hosts gh
			JOIN inventory_copy_groups g ON g.old_id = gh.group_id JOIN inventory_copy_hosts h ON h.old_id = gh.host_id ORDER BY gh.id`, nil},
		{`INSERT INTO main_group_parents (from_group_id, to_group_id) SELECT f.new_id, t.new_id FROM main_group_parents gp
			JOIN inventory_copy_groups f ON f.old_id = gp.from_group_id JOIN inventory_copy_groups t ON t.old_id = gp.to_group_id ORDER BY gp.id`, nil},
	}
	for _, st := range steps {
		if _, err := tx.Exec(ctx, st.sql, st.args...); err != nil {
			return err
		}
	}
	return nil
}
