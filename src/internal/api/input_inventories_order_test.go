package api

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/models"
)

// A constructed inventory's input inventories list in the order they were
// given (input_inventories is an OrderedManyToManyField), not by name, so
// a form reads back the precedence it saved.
func TestInputInventoriesListInPositionOrder(t *testing.T) {
	d := newDBServer(t, "zz-input-order-test")
	ctx := context.Background()
	var org int64
	if err := d.Q().QueryRow(ctx, `SELECT id FROM main_organization ORDER BY id LIMIT 1`).Scan(&org); err != nil {
		t.Skip("no organization")
	}
	var made []int64
	t.Cleanup(func() {
		err := d.DB.Tx(ctx, func(tx pgx.Tx) error {
			for i := len(made) - 1; i >= 0; i-- {
				if err := models.DeleteInventory(ctx, tx, made[i], d.CT, d.Cascade); err != nil {
					return err
				}
			}
			return nil
		})
		if err != nil {
			t.Errorf("cleanup: %v", err)
		}
	})
	create := func(path, name string) int64 {
		st, body := d.do("POST", path, map[string]any{"name": name, "organization": org})
		d.expect(st, body, http.StatusCreated, "")
		id := d.id(body)
		made = append(made, id)
		return id
	}
	z := create("/api/v2/inventories/", "zz-input-order-z")
	a := create("/api/v2/inventories/", "zz-input-order-a")
	ci := create("/api/v2/constructed_inventories/", "zz-input-order-constructed")
	sub := "/api/v2/inventories/" + itoa(ci) + "/input_inventories/"
	for _, id := range []int64{z, a} {
		st, body := d.do("POST", sub, map[string]any{"id": id})
		d.expect(st, body, http.StatusNoContent, "")
	}
	names := func(path string) []string {
		st, body := d.do("GET", path, nil)
		d.expect(st, body, http.StatusOK, "")
		var v struct {
			Results []struct {
				Name string `json:"name"`
			} `json:"results"`
		}
		if err := json.Unmarshal([]byte(body), &v); err != nil {
			t.Fatal(err)
		}
		out := []string{}
		for _, r := range v.Results {
			out = append(out, r.Name)
		}
		return out
	}
	if got := names(sub); len(got) != 2 || got[0] != "zz-input-order-z" || got[1] != "zz-input-order-a" {
		t.Fatalf("default order %v, want the order given", got)
	}
	// An order_by of the caller's still applies.
	if got := names(sub + "?order_by=name"); len(got) != 2 || got[0] != "zz-input-order-a" {
		t.Fatalf("order_by=name gave %v", got)
	}
	// A filter through a to-many relation (the list then selects by id)
	// still lists only this inventory's memberships: z is an input of a
	// second constructed inventory too, and must come once.
	st, body := d.do("POST", "/api/v2/hosts/", map[string]any{"name": "zz-input-order-host", "inventory": z})
	d.expect(st, body, http.StatusCreated, "")
	host := d.id(body)
	ci2 := create("/api/v2/constructed_inventories/", "zz-input-order-constructed-2")
	st, body = d.do("POST", "/api/v2/inventories/"+itoa(ci2)+"/input_inventories/", map[string]any{"id": a})
	d.expect(st, body, http.StatusNoContent, "")
	st, body = d.do("POST", "/api/v2/inventories/"+itoa(ci2)+"/input_inventories/", map[string]any{"id": z})
	d.expect(st, body, http.StatusNoContent, "")
	if got := names(sub + "?hosts__id=" + itoa(host)); len(got) != 1 || got[0] != "zz-input-order-z" {
		t.Fatalf("hosts__id filter gave %v, want [zz-input-order-z]", got)
	}
}
