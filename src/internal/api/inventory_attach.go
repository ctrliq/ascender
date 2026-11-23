package api

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/activity"
	"github.com/ctrliq/ascender/internal/auth"
	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/models"
)

// The inventory tree's sub-lists (a group's hosts and children, a host's
// groups, an inventory's hosts and groups) are SubListCreateAttachDetach
// views in the old API (generics.py): a body with "disassociate" detaches,
// one with an id attaches that object, and one without creates the object
// and attaches it. The steps, and the order their errors come in, are:
// the id's type, the object's existence (get_object_or_400), the access
// check (can_attach / can_unattach), the relation's own validation, then
// the write. The whole request ran in one transaction (ATOMIC_REQUESTS).

// Group_hosts and Group_parents are the m2m through models the activity
// stream names as the relationship.
const (
	groupHostsRel   = "ascender.main.models.inventory.Group_hosts"
	groupParentsRel = "ascender.main.models.inventory.Group_parents"
)

// subAttachID is attach_validate and unattach_validate: the id of the
// object to attach or detach, 0 for an attach that creates one. A falsy id
// means "none"; any other value must be an integer (Python's bool is one:
// true is 1).
func subAttachID(body *OMap, detach bool) (int64, *APIError) {
	raw, _ := body.Get("id")
	if !pyTruthy(raw) {
		if detach {
			return 0, &APIError{Status: http.StatusBadRequest, Body: map[string]any{"msg": `"id" is required to disassociate`}}
		}
		return 0, nil
	}
	if b, ok := raw.(bool); ok && b {
		return 1, nil
	}
	id, ok := integerOf(raw)
	if !ok {
		return 0, &APIError{Status: http.StatusBadRequest, Body: map[string]any{"msg": `"id" field must be an integer.`}}
	}
	return id, nil
}

// notFound400 is get_object_or_400's error.
func notFound400(model string) *APIError {
	return BadRequest(model + " matching query does not exist.")
}

// pyIntOf is get_pk_from_dict: int() of the value, 0 when Python's int()
// would have raised.
func pyIntOf(v any) int64 {
	switch t := v.(type) {
	case bool:
		if t {
			return 1
		}
	case json.Number:
		if n, err := t.Int64(); err == nil {
			return n
		}
		if f, err := t.Float64(); err == nil && !math.IsInf(f, 0) {
			return int64(f)
		}
	case string:
		if n, err := strconv.ParseInt(strings.TrimSpace(t), 10, 64); err == nil {
			return n
		}
	}
	return 0
}

// inventoryMoved is the PermissionDenied of HostAccess/GroupAccess
// .can_change, which can_unattach called with the request's data: the
// body may not name another inventory.
func inventoryMoved(body *OMap, inventoryID int64, model string) error {
	raw, _ := body.Get("inventory")
	if pk := pyIntOf(raw); pk != 0 && pk != inventoryID {
		return Detail(http.StatusForbidden, fmt.Sprintf("Unable to change inventory on a %s.", model))
	}
	return nil
}

// assocChanges is the changes activity_stream_associate recorded for an
// m2m add or remove, in the signal's key order.
func assocChanges(op, rel, obj1 string, id1 int64, obj2 string, id2 int64) *OMap {
	return NewOMap().Set("object1", obj1).Set("object1_pk", id1).Set("object2", obj2).Set("object2_pk", id2).Set("action", op).Set("relationship", rel)
}

// recordAssociation writes the entry activity_stream_associate wrote for
// an m2m add or remove: object1 is the side whose manager was used. actor
// is nil for a change no user made.
func (s *Server) recordAssociation(ctx context.Context, q db.Querier, actor *int64, op, rel, obj1 string, id1 int64, obj2 string, id2 int64) error {
	e := activity.Entry{Operation: op, Object1: obj1, Object2: obj2, Relationship: rel, ChangesValue: assocChanges(op, rel, obj1, id1, obj2, id2), ActorID: actor, Links: map[string]int64{obj1: id1}}
	if obj1 == obj2 {
		e.MoreLinks = []activity.Link{{Model: obj2, ID: id2}}
	} else {
		e.Links[obj2] = id2
	}
	return s.Activity.Record(ctx, q, e)
}

// linkGroupHost adds a host to a group unless it is a member already, and
// records the association when it was added (Django's add() signals only
// the ids it adds).
func (s *Server) linkGroupHost(ctx context.Context, tx pgx.Tx, u *auth.User, groupID, hostID int64, fromHost bool) error {
	tag, err := tx.Exec(ctx, `INSERT INTO main_group_hosts (group_id, host_id) SELECT $1, $2 WHERE NOT EXISTS (SELECT 1 FROM main_group_hosts WHERE group_id = $1 AND host_id = $2)`, groupID, hostID)
	if err != nil || tag.RowsAffected() == 0 {
		return err
	}
	if fromHost {
		return s.recordAssociation(ctx, tx, &u.ID, "associate", groupHostsRel, "host", hostID, "group", groupID)
	}
	return s.recordAssociation(ctx, tx, &u.ID, "associate", groupHostsRel, "group", groupID, "host", hostID)
}

// unlinkGroupHost removes a host from a group. remove() signals every id
// it was given, a member or not, so the entry is always written.
func (s *Server) unlinkGroupHost(ctx context.Context, tx pgx.Tx, u *auth.User, groupID, hostID int64, fromHost bool) error {
	if _, err := tx.Exec(ctx, `DELETE FROM main_group_hosts WHERE group_id = $1 AND host_id = $2`, groupID, hostID); err != nil {
		return err
	}
	if fromHost {
		return s.recordAssociation(ctx, tx, &u.ID, "disassociate", groupHostsRel, "host", hostID, "group", groupID)
	}
	return s.recordAssociation(ctx, tx, &u.ID, "disassociate", groupHostsRel, "group", groupID, "host", hostID)
}

// linkGroupChild makes child a child of parent (Group.children.add).
func (s *Server) linkGroupChild(ctx context.Context, tx pgx.Tx, u *auth.User, parentID, childID int64) error {
	tag, err := tx.Exec(ctx, `INSERT INTO main_group_parents (from_group_id, to_group_id) SELECT $1, $2 WHERE NOT EXISTS (SELECT 1 FROM main_group_parents WHERE from_group_id = $1 AND to_group_id = $2)`, childID, parentID)
	if err != nil || tag.RowsAffected() == 0 {
		return err
	}
	return s.recordAssociation(ctx, tx, &u.ID, "associate", groupParentsRel, "group", parentID, "group", childID)
}

// groupHostsAttach is GroupHostsList's POST.
func (s *Server) groupHostsAttach(w http.ResponseWriter, r *http.Request) error {
	u, g, err := groupObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	ctx := r.Context()
	detach := isDetach(body)
	hid, aerr := subAttachID(body, detach)
	if aerr != nil {
		return aerr
	}
	if hid == 0 {
		// GroupHostsList.create: the group's inventory; a host of that
		// name already there, given no variables, is attached instead.
		body.Set("inventory", fmt.Sprint(g.InventoryID))
		name := ""
		if v, ok := body.Get("name"); ok {
			name = pyStr(v)
		}
		vars, hasVars := body.Get("variables")
		if !hasVars || vars == "" || vars == "{}" || vars == "---" {
			found, err := db.ScanOne(ctx, s.Q(), `SELECT id FROM main_host WHERE inventory_id = $1 AND name = $2 ORDER BY id LIMIT 1`, []any{g.InventoryID, name}, &hid)
			if err != nil {
				return err
			}
			if !found {
				hid = 0
			}
		}
		if hid == 0 {
			h, out, err := s.newHost(r, u, body, func(tx pgx.Tx, h *models.Host) error {
				return s.linkGroupHost(ctx, tx, u, g.ID, h.ID, false)
			})
			if err != nil {
				return err
			}
			w.Header().Set("Location", URLFor("hosts", h.ID))
			WriteJSON(w, http.StatusCreated, out)
			return nil
		}
	}
	h, err := models.GetHost(ctx, s.Q(), hid)
	if err != nil {
		if db.IsNoRows(err) {
			return notFound400("Host")
		}
		return err
	}
	c := s.NewSerCtx(r, true)
	if detach {
		// GroupAccess.can_unattach is can_change(group, data).
		if err := inventoryMoved(body, g.InventoryID, "group"); err != nil {
			return err
		}
		if !c.HasRoleOn("main.inventory", g.InventoryID, "admin_role") {
			return ErrForbidden
		}
		err = s.DB.Tx(ctx, func(tx pgx.Tx) error { return s.unlinkGroupHost(ctx, tx, u, g.ID, h.ID, false) })
	} else {
		// GroupAccess.can_attach: change the group, read the host, and
		// both in one inventory.
		if !c.HasRoleOn("main.inventory", g.InventoryID, "admin_role") || !c.HasRoleOn("main.inventory", h.InventoryID, "read_role") {
			return ErrForbidden
		}
		if h.InventoryID != g.InventoryID {
			return BadRequest("Cannot associate two items from different inventories.")
		}
		err = s.DB.Tx(ctx, func(tx pgx.Tx) error { return s.linkGroupHost(ctx, tx, u, g.ID, h.ID, false) })
	}
	if err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// hostGroupsAttach is HostGroupsList's POST.
func (s *Server) hostGroupsAttach(w http.ResponseWriter, r *http.Request) error {
	u, h, err := hostObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	ctx := r.Context()
	detach := isDetach(body)
	gid, aerr := subAttachID(body, detach)
	if aerr != nil {
		return aerr
	}
	if gid == 0 {
		// HostGroupsList.create: a new group in the host's inventory.
		body.Set("inventory", fmt.Sprint(h.InventoryID))
		g, out, err := s.newGroup(r, u, body, func(tx pgx.Tx, g *models.Group) error {
			return s.linkGroupHost(ctx, tx, u, g.ID, h.ID, true)
		})
		if err != nil {
			return err
		}
		w.Header().Set("Location", URLFor("groups", g.ID))
		WriteJSON(w, http.StatusCreated, out)
		return nil
	}
	g, err := models.GetGroup(ctx, s.Q(), gid)
	if err != nil {
		if db.IsNoRows(err) {
			return notFound400("Group")
		}
		return err
	}
	c := s.NewSerCtx(r, true)
	if detach {
		if err := inventoryMoved(body, h.InventoryID, "host"); err != nil {
			return err
		}
		if !c.HasRoleOn("main.inventory", h.InventoryID, "admin_role") {
			return ErrForbidden
		}
		err = s.DB.Tx(ctx, func(tx pgx.Tx) error { return s.unlinkGroupHost(ctx, tx, u, g.ID, h.ID, true) })
	} else {
		if !c.HasRoleOn("main.inventory", h.InventoryID, "admin_role") || !c.HasRoleOn("main.inventory", g.InventoryID, "read_role") {
			return ErrForbidden
		}
		if g.InventoryID != h.InventoryID {
			return BadRequest("Cannot associate two items from different inventories.")
		}
		err = s.DB.Tx(ctx, func(tx pgx.Tx) error { return s.linkGroupHost(ctx, tx, u, g.ID, h.ID, true) })
	}
	if err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// groupChildrenAttach is GroupChildrenList's POST.
func (s *Server) groupChildrenAttach(w http.ResponseWriter, r *http.Request) error {
	u, g, err := groupObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	ctx := r.Context()
	c := s.NewSerCtx(r, true)
	detach := isDetach(body)
	if raw, _ := body.Get("id"); detach && raw == nil {
		// GroupChildrenList.unattach with no id deletes the group itself
		// (GroupAccess.can_delete), its children and hosts unlinked.
		if !c.HasRoleOn("main.inventory", g.InventoryID, "admin_role") {
			return ErrForbidden
		}
		if err := s.deleteGroupAlone(ctx, u, g); err != nil {
			return err
		}
		w.WriteHeader(http.StatusNoContent)
		return nil
	}
	cid, aerr := subAttachID(body, detach)
	if aerr != nil {
		return aerr
	}
	if cid == 0 {
		// EnforceParentRelationshipMixin: the new group is in the
		// parent's inventory.
		body.Set("inventory", fmt.Sprint(g.InventoryID))
		child, out, err := s.newGroup(r, u, body, func(tx pgx.Tx, child *models.Group) error {
			return s.linkGroupChild(ctx, tx, u, g.ID, child.ID)
		})
		if err != nil {
			return err
		}
		w.Header().Set("Location", URLFor("groups", child.ID))
		WriteJSON(w, http.StatusCreated, out)
		return nil
	}
	child, err := models.GetGroup(ctx, s.Q(), cid)
	if err != nil {
		if db.IsNoRows(err) {
			return notFound400("Group")
		}
		return err
	}
	if detach {
		if err := inventoryMoved(body, g.InventoryID, "group"); err != nil {
			return err
		}
		if !c.HasRoleOn("main.inventory", g.InventoryID, "admin_role") {
			return ErrForbidden
		}
		err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
			if _, err := tx.Exec(ctx, `DELETE FROM main_group_parents WHERE from_group_id = $1 AND to_group_id = $2`, child.ID, g.ID); err != nil {
				return err
			}
			return s.recordAssociation(ctx, tx, &u.ID, "disassociate", groupParentsRel, "group", g.ID, "group", child.ID)
		})
	} else {
		if !c.HasRoleOn("main.inventory", g.InventoryID, "admin_role") || !c.HasRoleOn("main.inventory", child.InventoryID, "read_role") {
			return ErrForbidden
		}
		if child.InventoryID != g.InventoryID {
			return BadRequest("Cannot associate two items from different inventories.")
		}
		err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
			// is_valid_relation: the group and its ancestors may not meet
			// the child and its descendants, which is the child being the
			// group or one of its ancestors.
			cyc := child.ID == g.ID
			if !cyc {
				var err error
				cyc, err = db.Exists(ctx, tx, `WITH RECURSIVE up AS (SELECT gp.to_group_id AS id FROM main_group_parents gp WHERE gp.from_group_id = $1
					UNION SELECT gp.to_group_id FROM main_group_parents gp JOIN up ON gp.from_group_id = up.id) SELECT 1 FROM up WHERE id = $2`, g.ID, child.ID)
				if err != nil {
					return err
				}
			}
			if cyc {
				return &APIError{Status: http.StatusBadRequest, Body: map[string]any{"error": "Cyclical Group association."}}
			}
			return s.linkGroupChild(ctx, tx, u, g.ID, child.ID)
		})
	}
	if err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// deleteGroupAlone deletes one group, unlinking (not deleting) its
// children and hosts: Django's delete() of the row, as opposed to the
// group detail's delete_recursive.
func (s *Server) deleteGroupAlone(ctx context.Context, u *auth.User, g *models.Group) error {
	invName, err := s.inventoryName(ctx, g.InventoryID)
	if err != nil {
		return err
	}
	return s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if err := s.Activity.Record(ctx, tx, activity.Entry{Operation: "delete", Object1: "group", Changes: s.groupChanges(g, invName), ActorID: &u.ID, Links: map[string]int64{"inventory": g.InventoryID}}); err != nil {
			return err
		}
		return models.DeleteGroup(ctx, tx, g, s.Cascade)
	})
}

// inventoryName is an inventory's name for an activity stream reference
// ("" when it is gone).
func (s *Server) inventoryName(ctx context.Context, id int64) (string, error) {
	var name string
	if _, err := db.ScanOne(ctx, s.Q(), `SELECT name FROM main_inventory WHERE id = $1`, []any{id}, &name); err != nil {
		return "", err
	}
	return name, nil
}

// inventoryMember is what inventoryMemberPost needs of hosts or groups.
type inventoryMember struct {
	model string // "Host" or "Group"
	// create makes one from the body (inventory set) and answers 201.
	create func(w http.ResponseWriter, r *http.Request, u *auth.User, body *OMap) error
	// load returns the member's inventory and what deletes it.
	load func(ctx context.Context, id int64) (int64, func(ctx context.Context, u *auth.User) error, error)
}

// inventoryMemberPost is InventoryHostsList's and InventoryGroupsList's
// POST. The relation is the member's own inventory key (parent_key), so a
// detach deletes the member (for a group, its children and hosts stay in
// the inventory, unlinked: the UI's "Promote Child Groups and Hosts").
// Federated inventories refuse both.
func (s *Server) inventoryMemberPost(w http.ResponseWriter, r *http.Request, m inventoryMember) error {
	u, inv, err := inventoryObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	if inv.Kind == "federated" {
		return &APIError{Status: http.StatusBadRequest, Body: map[string]any{"error": fmt.Sprintf("Cannot create or associate %ss directly to a federated inventory.", strings.ToLower(m.model))}}
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	detach := isDetach(body)
	mid, aerr := subAttachID(body, detach)
	if aerr != nil {
		return aerr
	}
	if mid == 0 {
		body.Set("inventory", fmt.Sprint(inv.ID))
		return m.create(w, r, u, body)
	}
	ctx := r.Context()
	memberInv, del, err := m.load(ctx, mid)
	if err != nil {
		if db.IsNoRows(err) {
			return notFound400(m.model)
		}
		return err
	}
	c := s.NewSerCtx(r, true)
	// The old check was a change on this inventory and a read of the
	// member; one of another inventory also needs that inventory's admin
	// here.
	if !c.HasRole(inv.AdminRoleID) || !c.HasRoleOn("main.inventory", memberInv, "admin_role") {
		return ErrForbidden
	}
	if !detach {
		// relationship.add() would move the member without its links.
		if memberInv != inv.ID {
			return BadRequest("Cannot associate two items from different inventories.")
		}
		w.WriteHeader(http.StatusNoContent)
		return nil
	}
	// A detach through this inventory's list deletes only this
	// inventory's members, whatever else the user may admin.
	if memberInv != inv.ID {
		return BadRequest("Cannot disassociate an item from a different inventory.")
	}
	if err := del(ctx, u); err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func (s *Server) inventoryHostsPost(w http.ResponseWriter, r *http.Request) error {
	return s.inventoryMemberPost(w, r, inventoryMember{
		model: "Host",
		create: func(w http.ResponseWriter, r *http.Request, u *auth.User, body *OMap) error {
			h, out, err := s.newHost(r, u, body, nil)
			if err != nil {
				return err
			}
			w.Header().Set("Location", URLFor("hosts", h.ID))
			WriteJSON(w, http.StatusCreated, out)
			return nil
		},
		load: func(ctx context.Context, id int64) (int64, func(context.Context, *auth.User) error, error) {
			h, err := models.GetHost(ctx, s.Q(), id)
			if err != nil {
				return 0, nil, err
			}
			return h.InventoryID, func(ctx context.Context, u *auth.User) error { return s.deleteHostAlone(ctx, u, h) }, nil
		},
	})
}

func (s *Server) inventoryGroupsPost(w http.ResponseWriter, r *http.Request) error {
	return s.inventoryMemberPost(w, r, inventoryMember{
		model: "Group",
		create: func(w http.ResponseWriter, r *http.Request, u *auth.User, body *OMap) error {
			g, out, err := s.newGroup(r, u, body, nil)
			if err != nil {
				return err
			}
			w.Header().Set("Location", URLFor("groups", g.ID))
			WriteJSON(w, http.StatusCreated, out)
			return nil
		},
		load: func(ctx context.Context, id int64) (int64, func(context.Context, *auth.User) error, error) {
			g, err := models.GetGroup(ctx, s.Q(), id)
			if err != nil {
				return 0, nil, err
			}
			return g.InventoryID, func(ctx context.Context, u *auth.User) error { return s.deleteGroupAlone(ctx, u, g) }, nil
		},
	})
}

// deleteHostAlone deletes one host, recording it.
func (s *Server) deleteHostAlone(ctx context.Context, u *auth.User, h *models.Host) error {
	invName, err := s.inventoryName(ctx, h.InventoryID)
	if err != nil {
		return err
	}
	return s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if err := s.Activity.Record(ctx, tx, activity.Entry{Operation: "delete", Object1: "host", Changes: s.hostChanges(h, invName), ActorID: &u.ID, Links: map[string]int64{"inventory": h.InventoryID}}); err != nil {
			return err
		}
		return models.DeleteHost(ctx, tx, h, s.Cascade)
	})
}
