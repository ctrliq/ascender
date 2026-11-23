package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"

	"github.com/jackc/pgx/v5/pgconn"

	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/models"
)

// attachID reads the "id" of an attach/detach request the way
// SubListAttachDetachAPIView did: a missing id is reported with the model
// name, a non-integer one with DRF's wording.
func attachID(body *OMap, modelTitle string, detach bool) (int64, *APIError) {
	raw, _ := body.Get("id")
	if raw == nil {
		if detach {
			return 0, &APIError{Status: http.StatusBadRequest, Body: map[string]any{"msg": `"id" is required to disassociate`}}
		}
		return 0, &APIError{Status: http.StatusBadRequest, Body: map[string]any{"msg": fmt.Sprintf("%s 'id' field is missing.", modelTitle)}}
	}
	id, ok := integerOf(raw)
	if !ok {
		return 0, &APIError{Status: http.StatusBadRequest, Body: map[string]any{"msg": `"id" field must be an integer.`}}
	}
	if id == 0 && !detach {
		return 0, &APIError{Status: http.StatusBadRequest, Body: map[string]any{"msg": fmt.Sprintf("%s 'id' field is missing.", modelTitle)}}
	}
	return id, nil
}

// integerOf returns the integer a decoded JSON value holds; strings and
// fractions are not integers, as DRF's isinstance(sub_id, int) decided.
func integerOf(v any) (int64, bool) {
	switch t := v.(type) {
	case float64:
		if t == float64(int64(t)) {
			return int64(t), true
		}
	case json.Number:
		if n, err := t.Int64(); err == nil {
			return n, true
		}
	case int64:
		return t, true
	case int:
		return int64(t), true
	}
	return 0, false
}

func isDetach(body *OMap) bool { return body.Has("disassociate") }

// inventoryInstanceGroups lists an inventory's instance groups in their
// configured order.
func (s *Server) inventoryInstanceGroups(w http.ResponseWriter, r *http.Request) error {
	_, v, err := inventoryObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	return s.orderedInstanceGroups(w, r, "main_inventoryinstancegroupmembership", "inventory_id", v.ID, true)
}

// inventoryInstanceGroupsAttach associates or disassociates an instance group.
func (s *Server) inventoryInstanceGroupsAttach(w http.ResponseWriter, r *http.Request) error {
	u, v, err := inventoryObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	return s.instanceGroupLink(w, r, u, orderedLink{Table: "main_inventoryinstancegroupmembership", OwnerCol: "inventory_id", Owner: v.ID, Object1: "inventory", Relationship: inventoryInstanceGroupRel},
		func(g *instanceGroup) bool { return c.HasRole(g.UseRoleID) && c.HasRole(v.AdminRoleID) })
}

func (s *Server) inventoryLabelsAttach(w http.ResponseWriter, r *http.Request) error {
	_, v, err := inventoryObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	return s.labelsAttach(w, r, c, func() bool { return c.HasRole(v.AdminRoleID) }, inventoryLabels, v.ID, "inventory")
}

// inventoryInputInventoriesAttach associates or disassociates a source
// inventory of a constructed or federated inventory.
func (s *Server) inventoryInputInventoriesAttach(w http.ResponseWriter, r *http.Request) error {
	u, v, err := inventoryObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	detach := isDetach(body)
	sid, aerr := attachID(body, "Inventory", detach)
	if aerr != nil {
		return aerr
	}
	sub, err := models.GetInventory(r.Context(), s.Q(), sid)
	if err != nil {
		if db.IsNoRows(err) {
			return BadRequest("Inventory matching query does not exist.")
		}
		return err
	}
	c := s.NewSerCtx(r, true)
	if !c.HasRole(v.AdminRoleID) || !c.HasRole(sub.ReadRoleID) {
		return ErrForbidden
	}
	// The input's hosts become targets of every job run on this
	// inventory: attaching one takes use of it, not only sight of it.
	if !detach && !c.HasRole(sub.UseRoleID) {
		return ErrForbidden
	}
	if detach {
		// is_valid_relation is the attach's alone.
	} else if v.Kind == "federated" {
		if sub.Kind != "" {
			return &APIError{Status: http.StatusBadRequest, Body: map[string]any{"error": "Federated inventories only accept plain inventories as input inventories."}}
		}
	} else if sub.Kind == "constructed" || sub.Kind == "federated" {
		return &APIError{Status: http.StatusBadRequest, Body: map[string]any{"error": "You cannot add a constructed or federated inventory as a source inventory."}}
	}
	err = s.changeOrderedLink(r.Context(), u, orderedLink{Table: "main_inventoryconstructedinventorymembership", OwnerCol: "constructed_inventory_id", MemberCol: "input_inventory_id",
		Owner: v.ID, Member: sub.ID, Object1: "inventory", Object2: "inventory", Relationship: inputInventoriesRel}, detach)
	if err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// isUniqueViolation reports a unique constraint error from PostgreSQL.
func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}
