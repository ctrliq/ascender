package api

import (
	"context"
	"fmt"
	"net/http"
	"testing"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/models"
)

// An inventory's object admin may not change a smart inventory's
// host_filter (which reaches every host of the organization) or move the
// inventory out of its organization; both take inventory_admin on the
// organizations involved, as InventoryAccess.can_admin required.
func TestInventoryAdminCannotWidenOrMove(t *testing.T) {
	d := newDBServer(t, "zz-inventory-admin-moves")
	ctx := context.Background()
	t.Cleanup(func() {
		if _, err := d.Q().Exec(ctx, `DELETE FROM main_rbac_roles_members WHERE user_id = $1`, d.user.ID); err != nil {
			t.Errorf("remove role memberships: %v", err)
		}
	})
	org := func(name string) int64 {
		st, resp := d.do("POST", "/api/v2/organizations/", map[string]any{"name": name})
		d.expect(st, resp, http.StatusCreated, "")
		id := d.id(resp)
		t.Cleanup(func() {
			d.user.IsSuperuser = true
			if st, resp := d.do("DELETE", fmt.Sprintf("/api/v2/organizations/%d/", id), nil); st != http.StatusNoContent {
				t.Errorf("delete organization: %d %s", st, resp)
			}
		})
		return id
	}
	inventory := func(body map[string]any) int64 {
		st, resp := d.do("POST", "/api/v2/inventories/", body)
		d.expect(st, resp, http.StatusCreated, "")
		id := d.id(resp)
		t.Cleanup(func() {
			if err := d.DB.Tx(ctx, func(tx pgx.Tx) error { return models.DeleteInventory(ctx, tx, id, d.CT, d.Cascade) }); err != nil {
				t.Errorf("delete inventory: %v", err)
			}
		})
		return id
	}
	grant := func(sql string, id int64) {
		var role int64
		if err := d.Q().QueryRow(ctx, sql, id).Scan(&role); err != nil {
			t.Fatal(err)
		}
		d.user.IsSuperuser = true
		st, resp := d.do("POST", fmt.Sprintf("/api/v2/users/%d/roles/", d.user.ID), map[string]any{"id": role})
		d.expect(st, resp, http.StatusNoContent, "")
		d.user.IsSuperuser = false
	}
	orgA, orgB := org("zz-inventory-admin-moves-a"), org("zz-inventory-admin-moves-b")
	smart := inventory(map[string]any{"name": "zz-inventory-admin-moves-smart", "organization": orgA, "kind": "smart", "host_filter": "name=zz-nothing"})
	plain := inventory(map[string]any{"name": "zz-inventory-admin-moves-plain", "organization": orgA})
	grant(`SELECT admin_role_id FROM main_inventory WHERE id = $1`, smart)
	grant(`SELECT admin_role_id FROM main_inventory WHERE id = $1`, plain)

	forbidden := `{"detail":"You do not have permission to perform this action."}`
	st, resp := d.do("PATCH", fmt.Sprintf("/api/v2/inventories/%d/", smart), map[string]any{"host_filter": "name__icontains=a"})
	d.expect(st, resp, http.StatusForbidden, forbidden)
	st, resp = d.do("PATCH", fmt.Sprintf("/api/v2/inventories/%d/", smart), map[string]any{"description": "zz", "host_filter": "name=zz-nothing"})
	d.expect(st, resp, http.StatusOK, "")
	st, resp = d.do("PATCH", fmt.Sprintf("/api/v2/inventories/%d/", plain), map[string]any{"organization": orgB})
	d.expect(st, resp, http.StatusForbidden, forbidden)
	// inventory_admin of the destination alone is not enough: the
	// inventory would leave its organization's admins.
	grant(`SELECT inventory_admin_role_id FROM main_organization WHERE id = $1`, orgB)
	st, resp = d.do("PATCH", fmt.Sprintf("/api/v2/inventories/%d/", plain), map[string]any{"organization": orgB})
	d.expect(st, resp, http.StatusForbidden, forbidden)
	grant(`SELECT inventory_admin_role_id FROM main_organization WHERE id = $1`, orgA)
	st, resp = d.do("PATCH", fmt.Sprintf("/api/v2/inventories/%d/", plain), map[string]any{"organization": orgB})
	d.expect(st, resp, http.StatusOK, "")
	st, resp = d.do("PATCH", fmt.Sprintf("/api/v2/inventories/%d/", smart), map[string]any{"host_filter": "name__icontains=a"})
	d.expect(st, resp, http.StatusOK, "")
}
