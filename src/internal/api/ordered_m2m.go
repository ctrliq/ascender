package api

import (
	"context"
	"net/http"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/auth"
)

// Through models of the ordered many-to-many fields, as the activity
// stream names them (sender.__module__ + "." + sender.__name__).
const (
	ujtInstanceGroupRel       = "ascender.main.models.ha.UnifiedJobTemplateInstanceGroupMembership"
	inventoryInstanceGroupRel = "ascender.main.models.ha.InventoryInstanceGroupMembership"
	scheduleInstanceGroupRel  = "ascender.main.models.ha.ScheduleInstanceGroupMembership"
	nodeInstanceGroupRel      = "ascender.main.models.ha.WorkflowJobTemplateNodeBaseInstanceGroupMembership"
	orgInstanceGroupRel       = "ascender.main.models.ha.OrganizationInstanceGroupMembership"
	orgGalaxyRel              = "ascender.main.models.organization.OrganizationGalaxyCredentialMembership"
	inputInventoriesRel       = "ascender.main.models.inventory.InventoryConstructedInventoryMembership"
)

// orderedLink is one row of an OrderedManyToManyField's through table:
// from the owner (the model the field is on) to a member.
type orderedLink struct {
	Table, OwnerCol, MemberCol string
	Owner, Member              int64
	// Object1 and Object2 are the owner's and member's models in the
	// activity entry and Relationship the through model. Object1 "" records
	// none: the signal skipped inventory sources.
	Object1, Object2, Relationship string
}

// changeOrderedLink adds the member (unless it is one already: attach
// checked relationship.all() before add()) or removes it, then renumbers
// the owner's positions 0..n-1 in row order, as _update_m2m_position did
// after every add() and remove(). The activity entry is the signal's: an
// add records the member it added, a remove the member it was given,
// whether it was one or not.
func (s *Server) changeOrderedLink(ctx context.Context, u *auth.User, m orderedLink, detach bool) error {
	return s.DB.Tx(ctx, func(tx pgx.Tx) error {
		op := "associate"
		if detach {
			op = "disassociate"
			if _, err := tx.Exec(ctx, `DELETE FROM `+m.Table+` WHERE `+m.OwnerCol+` = $1 AND `+m.MemberCol+` = $2`, m.Owner, m.Member); err != nil {
				return err
			}
		} else {
			tag, err := tx.Exec(ctx, `INSERT INTO `+m.Table+` (position, `+m.MemberCol+`, `+m.OwnerCol+`) SELECT NULL, $2, $1
				WHERE NOT EXISTS (SELECT 1 FROM `+m.Table+` WHERE `+m.OwnerCol+` = $1 AND `+m.MemberCol+` = $2)`, m.Owner, m.Member)
			if err != nil || tag.RowsAffected() == 0 {
				return err
			}
		}
		if _, err := tx.Exec(ctx, `UPDATE `+m.Table+` t SET position = n.rn FROM (SELECT id, row_number() OVER (ORDER BY id) - 1 AS rn FROM `+m.Table+` WHERE `+m.OwnerCol+` = $1) n
			WHERE t.id = n.id AND t.position IS DISTINCT FROM n.rn`, m.Owner); err != nil {
			return err
		}
		if m.Object1 == "" {
			return nil
		}
		return s.recordAssociation(ctx, tx, &u.ID, op, m.Relationship, m.Object1, m.Owner, m.Object2, m.Member)
	})
}

// orderedInstanceGroups lists an owner's instance groups through an
// ordered membership table, in position order as the field's manager
// sorted them (then by order). filtered keeps the reader's restriction to
// groups they may see, the views' filter_read_permission.
func (s *Server) orderedInstanceGroups(w http.ResponseWriter, r *http.Request, table, ownerCol string, owner int64, filtered bool, order ...string) error {
	spec := s.instanceGroupSpec()
	if !filtered {
		spec.Access = nil
	}
	// The membership join names the owner itself: a filter through a
	// to-many relation selects ids in a subquery and reads the rows from
	// spec.From again, where a member of several owners would otherwise
	// come once per owner, in another owner's position.
	spec.From = "main_instancegroup g JOIN " + table + " m ON m.instancegroup_id = g.id AND m." + ownerCol + " = " + itoa(owner)
	spec.Fields = instanceGroupFields.With(map[string]Field{"position": {SQL: "m.position", Kind: KindInt}})
	spec.DefaultOrder = append([]string{"position"}, order...)
	return s.instanceGroupListWith(w, r, spec, nil)
}

// instanceGroupLink is the POST of an ordered instance-group sub-list:
// {"id"} attaches the group at the end, with "disassociate" it detaches
// it. may reports whether the user may attach or detach the group.
func (s *Server) instanceGroupLink(w http.ResponseWriter, r *http.Request, u *auth.User, link orderedLink, may func(g *instanceGroup) bool) error {
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	detach := isDetach(body)
	gid, aerr := attachID(body, "Instance Group", detach)
	if aerr != nil {
		return aerr
	}
	g, err := s.loadInstanceGroup(r, gid)
	if err != nil {
		return err
	}
	if g == nil {
		return BadRequest("InstanceGroup matching query does not exist.")
	}
	if !may(g) {
		return ErrForbidden
	}
	link.Member, link.MemberCol, link.Object2 = g.ID, "instancegroup_id", "instance_group"
	if err := s.changeOrderedLink(r.Context(), u, link, detach); err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}
