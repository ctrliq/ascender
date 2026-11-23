package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"testing"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/models"
)

// The activity entries of label changes against a real database: create
// and update on /labels/, and associate, disassociate and the delete of a
// detached label on a labels sub-list, as the Label registration and the
// labels m2m signals wrote them.
func TestLabelActivity(t *testing.T) {
	d := newDBServer(t, "zz-label-activity-test")
	ctx := context.Background()
	var org int64
	var orgName string
	if err := d.Q().QueryRow(ctx, `SELECT id, name FROM main_organization ORDER BY id LIMIT 1`).Scan(&org, &orgName); err != nil {
		t.Skip("no organization")
	}
	orgRef := fmt.Sprintf("%s-%d", orgName, org)
	st, body := d.do("POST", "/api/v2/inventories/", map[string]any{"name": "zz-label-activity-test", "organization": org})
	d.expect(st, body, http.StatusCreated, "")
	inv := d.id(body)
	var labels []int64
	t.Cleanup(func() {
		err := d.DB.Tx(ctx, func(tx pgx.Tx) error {
			if err := models.DeleteInventory(ctx, tx, inv, d.CT, d.Cascade); err != nil {
				return err
			}
			return d.Cascade.Delete(ctx, tx, "main_label", "id", labels)
		})
		if err != nil {
			t.Errorf("cleanup: %v", err)
		}
	})
	type entry struct {
		Operation, Object1, Object2, Relationship string
		Changes                                   map[string]any
	}
	var seen int
	newEntries := func() []entry {
		t.Helper()
		d.mu.Lock()
		ids := d.activity[seen:]
		seen = len(d.activity)
		d.mu.Unlock()
		var out []entry
		for _, id := range ids {
			var e entry
			var changes string
			if err := d.Q().QueryRow(ctx, `SELECT operation, object1, object2, object_relationship_type, changes FROM main_activitystream WHERE id = $1`, id).
				Scan(&e.Operation, &e.Object1, &e.Object2, &e.Relationship, &changes); err != nil {
				t.Fatal(err)
			}
			if err := json.Unmarshal([]byte(changes), &e.Changes); err != nil {
				t.Fatal(err)
			}
			out = append(out, e)
		}
		return out
	}
	check := func(what string, got []entry, want ...string) {
		t.Helper()
		var g []string
		for _, e := range got {
			g = append(g, fmt.Sprintf("%s %s %s %s", e.Operation, e.Object1, e.Object2, e.Relationship))
		}
		if fmt.Sprint(g) != fmt.Sprint(want) {
			t.Fatalf("%s: got entries %q, want %q", what, g, want)
		}
	}
	newEntries()

	st, body = d.do("POST", "/api/v2/labels/", map[string]any{"name": "zz-label-activity-a", "organization": org})
	d.expect(st, body, http.StatusCreated, "")
	a := d.id(body)
	labels = append(labels, a)
	got := newEntries()
	check("create", got, "create label  ")
	if want := map[string]any{"name": "zz-label-activity-a", "organization": orgRef, "id": float64(a)}; fmt.Sprint(got[0].Changes) != fmt.Sprint(want) {
		t.Errorf("create changes %v, want %v", got[0].Changes, want)
	}

	st, body = d.do("PATCH", fmt.Sprintf("/api/v2/labels/%d/", a), map[string]any{"name": "zz-label-activity-b"})
	d.expect(st, body, http.StatusOK, "")
	got = newEntries()
	check("update", got, "update label  ")
	if want := map[string]any{"name": []any{"zz-label-activity-a", "zz-label-activity-b"}}; fmt.Sprint(got[0].Changes) != fmt.Sprint(want) {
		t.Errorf("update changes %v, want %v", got[0].Changes, want)
	}
	st, body = d.do("PATCH", fmt.Sprintf("/api/v2/labels/%d/", a), map[string]any{"description": "not recorded"})
	d.expect(st, body, http.StatusOK, "")
	check("description update", newEntries())

	const rel = "ascender.main.models.inventory.Inventory_labels"
	sub := fmt.Sprintf("/api/v2/inventories/%d/labels/", inv)
	st, body = d.do("POST", sub, map[string]any{"id": a})
	d.expect(st, body, http.StatusNoContent, "")
	check("associate", newEntries(), "associate inventory label "+rel)
	st, body = d.do("POST", sub, map[string]any{"id": a})
	d.expect(st, body, http.StatusNoContent, "")
	check("associate again", newEntries())

	st, body = d.do("POST", sub, map[string]any{"name": "zz-label-activity-c", "organization": org})
	d.expect(st, body, http.StatusCreated, "")
	c := d.id(body)
	labels = append(labels, c)
	check("create on sub-list", newEntries(), "create label  ", "associate inventory label "+rel)

	st, body = d.do("POST", sub, map[string]any{"id": c, "disassociate": true})
	d.expect(st, body, http.StatusNoContent, "")
	got = newEntries()
	check("disassociate", got, "disassociate inventory label "+rel, "delete label  ")
	if want := map[string]any{"name": "zz-label-activity-c", "organization": orgRef, "id": float64(c)}; fmt.Sprint(got[1].Changes) != fmt.Sprint(want) {
		t.Errorf("delete changes %v, want %v", got[1].Changes, want)
	}
	if ok, err := d.dbExists(`SELECT 1 FROM main_label WHERE id = $1`, c); err != nil || ok {
		t.Fatalf("detached label still exists (%v)", err)
	}
}
