package api

import (
	"context"
	"fmt"
	"net/http"
	"testing"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/models"
)

// An object that exists but that the user may not read answers 403, on its
// detail and on the views under it, as ModelAccessPermission's object and
// parent checks did after get_object; one that does not exist answers 404.
func TestUnreadableObjectIsForbidden(t *testing.T) {
	d := newDBServer(t, "zz-unreadable-test")
	ctx := context.Background()
	var org int64
	if err := d.Q().QueryRow(ctx, `SELECT id FROM main_organization ORDER BY id LIMIT 1`).Scan(&org); err != nil {
		t.Skip("no organization")
	}
	st, body := d.do("POST", "/api/v2/inventories/", map[string]any{"name": "zz-unreadable-test", "organization": org})
	d.expect(st, body, http.StatusCreated, "")
	inv := d.id(body)
	t.Cleanup(func() {
		err := d.DB.Tx(ctx, func(tx pgx.Tx) error { return models.DeleteInventory(ctx, tx, inv, d.CT, d.Cascade) })
		if err != nil {
			t.Errorf("delete inventory: %v", err)
		}
	})
	var role int64
	if err := d.Q().QueryRow(ctx, `SELECT admin_role_id FROM main_inventory WHERE id = $1`, inv).Scan(&role); err != nil {
		t.Fatal(err)
	}

	// The test user, no longer a superuser, holds no role at all.
	d.user.IsSuperuser = false
	forbidden := `{"detail":"You do not have permission to perform this action."}`
	for _, c := range []struct {
		method, path string
		status       int
		body         string
	}{
		{"GET", fmt.Sprintf("/api/v2/inventories/%d/", inv), http.StatusForbidden, forbidden},
		{"PATCH", fmt.Sprintf("/api/v2/inventories/%d/", inv), http.StatusForbidden, forbidden},
		{"DELETE", fmt.Sprintf("/api/v2/inventories/%d/", inv), http.StatusForbidden, forbidden},
		{"GET", fmt.Sprintf("/api/v2/inventories/%d/hosts/", inv), http.StatusForbidden, forbidden},
		{"GET", fmt.Sprintf("/api/v2/inventories/%d/copy/", inv), http.StatusForbidden, forbidden},
		{"GET", fmt.Sprintf("/api/v2/organizations/%d/", org), http.StatusForbidden, forbidden},
		{"GET", fmt.Sprintf("/api/v2/roles/%d/", role), http.StatusForbidden, forbidden},
		{"GET", fmt.Sprintf("/api/v2/roles/%d/parents/", role), http.StatusForbidden, forbidden},
		{"GET", "/api/v2/inventories/999999999/", http.StatusNotFound, `{"detail":"No Inventory matches the given query."}`},
		{"GET", "/api/v2/roles/999999999/", http.StatusNotFound, ""},
	} {
		var b any
		if c.method != "GET" && c.method != "DELETE" {
			b = map[string]any{}
		}
		st, body := d.do(c.method, c.path, b)
		if st != c.status || (c.body != "" && body != c.body) {
			t.Errorf("%s %s: got %d %s, want %d %s", c.method, c.path, st, body, c.status, c.body)
		}
	}
}
