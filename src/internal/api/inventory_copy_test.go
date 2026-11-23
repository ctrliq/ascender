package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/models"
)

// POST /inventories/{id}/copy/ against a real database: the copy's fields,
// instance groups, hosts, groups and their links, the creator's admin
// role, the activity entries, and the response, which counts no hosts yet.
func TestInventoryCopy(t *testing.T) {
	d := newDBServer(t, "zz-inventory-copy-test")
	ctx := context.Background()
	var org int64
	if err := d.Q().QueryRow(ctx, `SELECT id FROM main_organization ORDER BY id LIMIT 1`).Scan(&org); err != nil {
		t.Skip("no organization")
	}
	igs, err := models.ScanIDs(ctx, d.Q(), `SELECT id FROM main_instancegroup ORDER BY id LIMIT 2`)
	if err != nil {
		t.Fatal(err)
	}
	var invs []int64
	t.Cleanup(func() {
		err := d.DB.Tx(ctx, func(tx pgx.Tx) error {
			for _, id := range invs {
				if err := models.DeleteInventory(ctx, tx, id, d.CT, d.Cascade); err != nil {
					return err
				}
			}
			return nil
		})
		if err != nil {
			t.Errorf("cleanup: %v", err)
		}
	})
	st, body := d.do("POST", "/api/v2/inventories/", map[string]any{"name": "zz-inventory-copy-test", "organization": org, "description": "d", "variables": "a: 1", "allow_jobs_while_syncing": true})
	d.expect(st, body, http.StatusCreated, "")
	src := d.id(body)
	invs = append(invs, src)
	for i := len(igs) - 1; i >= 0; i-- {
		st, body = d.do("POST", fmt.Sprintf("/api/v2/inventories/%d/instance_groups/", src), map[string]any{"id": igs[i]})
		d.expect(st, body, http.StatusNoContent, "")
	}
	post := func(path string, v map[string]any) int64 {
		t.Helper()
		st, body := d.do("POST", path, v)
		d.expect(st, body, http.StatusCreated, "")
		return d.id(body)
	}
	h1 := post(fmt.Sprintf("/api/v2/inventories/%d/hosts/", src), map[string]any{"name": "zz-h1", "variables": "x: 1", "enabled": false, "instance_id": "i-1"})
	post(fmt.Sprintf("/api/v2/inventories/%d/hosts/", src), map[string]any{"name": "zz-h2"})
	g1 := post(fmt.Sprintf("/api/v2/inventories/%d/groups/", src), map[string]any{"name": "zz-g1", "variables": "y: 2"})
	g2 := post(fmt.Sprintf("/api/v2/groups/%d/children/", g1), map[string]any{"name": "zz-g2"})
	st, body = d.do("POST", fmt.Sprintf("/api/v2/groups/%d/hosts/", g2), map[string]any{"id": h1})
	d.expect(st, body, http.StatusNoContent, "")
	if _, err := d.Q().Exec(ctx, `UPDATE main_host SET ansible_facts = '{"f": 1}' WHERE id = $1`, h1); err != nil {
		t.Fatal(err)
	}

	copyURL := fmt.Sprintf("/api/v2/inventories/%d/copy/", src)
	st, body = d.do("GET", copyURL, nil)
	d.expect(st, body, http.StatusOK, `{"can_copy":true}`)
	st, body = d.do("POST", copyURL, map[string]any{"name": "zz-inventory-copy-test"})
	d.expect(st, body, http.StatusBadRequest, `{"__all__":["The original object is already named zz-inventory-copy-test, a copy from it cannot have the same name."]}`)

	d.mu.Lock()
	seen := len(d.activity)
	d.mu.Unlock()
	st, body = d.do("POST", copyURL, map[string]any{"name": "zz-inventory-copy-test 2"})
	d.expect(st, body, http.StatusCreated, "")
	dst := d.id(body)
	invs = append(invs, dst)
	var resp struct {
		Name, Description, Variables string
		TotalHosts                   int64 `json:"total_hosts"`
		AllowJobsWhileSyncing        bool  `json:"allow_jobs_while_syncing"`
	}
	if err := json.Unmarshal([]byte(body), &resp); err != nil {
		t.Fatal(err)
	}
	if resp.Name != "zz-inventory-copy-test 2" || resp.Description != "d" || resp.Variables != "a: 1" || !resp.AllowJobsWhileSyncing || resp.TotalHosts != 0 {
		t.Errorf("response %s", body)
	}
	st, body = d.do("POST", copyURL, map[string]any{"name": "zz-inventory-copy-test 2"})
	d.expect(st, body, http.StatusBadRequest, `{"__all__":["Inventory with this (name, organization) combination already exists."]}`)

	rows := func(sql string, args ...any) string {
		t.Helper()
		rs, err := d.Q().Query(ctx, sql, args...)
		if err != nil {
			t.Fatal(err)
		}
		defer rs.Close()
		var out []string
		for rs.Next() {
			v, err := rs.Values()
			if err != nil {
				t.Fatal(err)
			}
			parts := make([]string, len(v))
			for i, x := range v {
				parts[i] = fmt.Sprint(x)
			}
			out = append(out, strings.Join(parts, "|"))
		}
		return fmt.Sprint(out)
	}
	igWant := rows(`SELECT position, instancegroup_id FROM main_inventoryinstancegroupmembership WHERE inventory_id = $1 ORDER BY position`, src)
	if got := rows(`SELECT position, instancegroup_id FROM main_inventoryinstancegroupmembership WHERE inventory_id = $1 ORDER BY position`, dst); got != igWant {
		t.Errorf("instance groups %s, want %s", got, igWant)
	}
	uid := d.user.ID
	hostQ := `SELECT name, description, enabled, instance_id, variables, ansible_facts::text, created_by_id = $2, modified_by_id IS NULL FROM main_host WHERE inventory_id = $1 ORDER BY name`
	if got, want := rows(hostQ, dst, uid), fmt.Sprint([]string{"zz-h1||false|i-1|x: 1|{}|true|true", "zz-h2||true|||{}|true|true"}); got != want {
		t.Errorf("hosts %s, want %s", got, want)
	}
	if got, want := rows(`SELECT name, variables FROM main_group WHERE inventory_id = $1 ORDER BY name`, dst), fmt.Sprint([]string{"zz-g1|y: 2", "zz-g2|"}); got != want {
		t.Errorf("groups %s, want %s", got, want)
	}
	if got, want := rows(`SELECT f.name, t.name FROM main_group_parents p JOIN main_group f ON f.id = p.from_group_id JOIN main_group t ON t.id = p.to_group_id WHERE f.inventory_id = $1`, dst), fmt.Sprint([]string{"zz-g2|zz-g1"}); got != want {
		t.Errorf("group parents %s, want %s", got, want)
	}
	if got, want := rows(`SELECT g.name, h.name FROM main_group_hosts gh JOIN main_group g ON g.id = gh.group_id JOIN main_host h ON h.id = gh.host_id WHERE g.inventory_id = $1 AND h.inventory_id = $1`, dst), fmt.Sprint([]string{"zz-g2|zz-h1"}); got != want {
		t.Errorf("group hosts %s, want %s", got, want)
	}
	if got := rows(`SELECT total_hosts, total_groups FROM main_inventory WHERE id = $1`, dst); got != fmt.Sprint([]string{"2|2"}) {
		t.Errorf("computed fields %s", got)
	}
	if ok, err := d.dbExists(`SELECT 1 FROM main_rbac_roles_members m JOIN main_inventory i ON i.admin_role_id = m.role_id WHERE i.id = $1 AND m.user_id = $2`, dst, uid); err != nil || !ok {
		t.Errorf("creator is not admin of the copy (%v)", err)
	}
	d.mu.Lock()
	ids := d.activity[seen:]
	d.mu.Unlock()
	var got []string
	for _, id := range ids {
		var op, o1, o2, rel string
		if err := d.Q().QueryRow(ctx, `SELECT operation, object1, object2, object_relationship_type FROM main_activitystream WHERE id = $1`, id).Scan(&op, &o1, &o2, &rel); err != nil {
			t.Fatal(err)
		}
		got = append(got, fmt.Sprintf("%s %s %s %s", op, o1, o2, rel))
	}
	if want := []string{"create inventory  ", "associate inventory user ascender.main.models.inventory.Inventory.admin_role"}; fmt.Sprint(got) != fmt.Sprint(want) {
		t.Errorf("activity %q, want %q", got, want)
	}
}
