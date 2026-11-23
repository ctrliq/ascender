package api

import (
	"context"
	"fmt"
	"net/http"
	"testing"
)

// scratchInventory makes an organization and an inventory in it through
// the API and returns the inventory's id and the organization's.
func scratchInventory(t *testing.T, d *dbServer, name string, extra map[string]any) (inv, org int64) {
	t.Helper()
	st, body := d.do("POST", "/api/v2/organizations/", map[string]any{"name": "zz-org-" + name})
	if st != http.StatusCreated {
		// Shared by the inventories of one test.
		var id int64
		if err := d.Q().QueryRow(context.Background(), `SELECT id FROM main_organization WHERE name = $1`, "zz-org-"+name).Scan(&id); err != nil {
			t.Fatalf("organization: %d %s", st, body)
		}
		org = id
	} else {
		org = d.id(body)
	}
	req := map[string]any{"name": name, "organization": org}
	for k, v := range extra {
		req[k] = v
	}
	st, body = d.do("POST", "/api/v2/inventories/", req)
	d.expect(st, body, http.StatusCreated, "")
	return d.id(body), org
}

func scratchHost(t *testing.T, d *dbServer, inv int64, name string) int64 {
	t.Helper()
	st, body := d.do("POST", "/api/v2/hosts/", map[string]any{"name": name, "inventory": inv})
	d.expect(st, body, http.StatusCreated, "")
	return d.id(body)
}

// HostDetail.delete with RelatedJobsPreventDeleteMixin: the inventory's
// jobs, inventory updates and ad hoc commands keep its hosts unless
// allow_deletes_while_in_use is set; a job that finished in the last
// minute without all its events saved is a 403; a pending deletion and a
// constructed inventory are refused first.
func TestHostDeleteRelatedJobs(t *testing.T) {
	d, database := newScratchServer(t, "zz-host-delete-test")
	ctx := context.Background()
	inv, org := scratchInventory(t, d, "zz-hostdel", nil)
	h1 := scratchHost(t, d, inv, "zz-h1")

	job := scratchJob(t, d, database, "job", inv, "running", nil, 0)
	upd := scratchJob(t, d, database, "inventoryupdate", inv, "pending", nil, 0)
	adhoc := scratchJob(t, d, database, "adhoccommand", inv, "waiting", nil, 0)
	st, body := d.do("DELETE", fmt.Sprintf("/api/v2/hosts/%d/", h1), nil)
	d.expect(st, body, http.StatusConflict, fmt.Sprintf(`{"error":"Resource is being used by running jobs.","active_jobs":[{"id":%d,"type":"job"},{"id":%d,"type":"inventory_update"},{"id":%d,"type":"ad_hoc_command"}]}`, job, upd, adhoc))

	// allow_deletes_while_in_use: deleted while they run.
	st, body = d.do("PATCH", fmt.Sprintf("/api/v2/inventories/%d/", inv), map[string]any{"allow_deletes_while_in_use": true})
	d.expect(st, body, http.StatusOK, "")
	st, body = d.do("DELETE", fmt.Sprintf("/api/v2/hosts/%d/", h1), nil)
	d.expect(st, body, http.StatusNoContent, "")

	// Finished a moment ago with events still to save: a 403, unless
	// the flag is set (the old view skipped the whole check).
	h2 := scratchHost(t, d, inv, "zz-h2")
	if _, err := d.Q().Exec(ctx, `UPDATE main_unifiedjob SET status = 'successful', finished = now() WHERE id = ANY($1)`, []int64{job, upd, adhoc}); err != nil {
		t.Fatal(err)
	}
	if _, err := d.Q().Exec(ctx, `UPDATE main_unifiedjob SET emitted_events = 3 WHERE id = $1`, upd); err != nil {
		t.Fatal(err)
	}
	st, body = d.do("PATCH", fmt.Sprintf("/api/v2/inventories/%d/", inv), map[string]any{"allow_deletes_while_in_use": false})
	d.expect(st, body, http.StatusOK, "")
	st, body = d.do("DELETE", fmt.Sprintf("/api/v2/hosts/%d/", h2), nil)
	d.expect(st, body, http.StatusForbidden, fmt.Sprintf(`{"detail":"Related job inventory_update %d (successful) is still processing events."}`, upd))
	// More than a minute ago, it no longer counts.
	if _, err := d.Q().Exec(ctx, `UPDATE main_unifiedjob SET finished = now() - interval '2 minutes' WHERE id = $1`, upd); err != nil {
		t.Fatal(err)
	}
	st, body = d.do("DELETE", fmt.Sprintf("/api/v2/hosts/%d/", h2), nil)
	d.expect(st, body, http.StatusNoContent, "")

	// An inventory being deleted, then a constructed inventory.
	h3 := scratchHost(t, d, inv, "zz-h3")
	if _, err := d.Q().Exec(ctx, `UPDATE main_inventory SET pending_deletion = true WHERE id = $1`, inv); err != nil {
		t.Fatal(err)
	}
	st, body = d.do("DELETE", fmt.Sprintf("/api/v2/hosts/%d/", h3), nil)
	d.expect(st, body, http.StatusBadRequest, `{"error":"The inventory for this host is already being deleted."}`)
	st, body = d.do("POST", "/api/v2/constructed_inventories/", map[string]any{"name": "zz-constructed", "organization": org})
	d.expect(st, body, http.StatusCreated, "")
	ch := scratchInsert(t, database, "main_host", map[string]any{"name": "zz-ch", "inventory_id": d.id(body), "enabled": true, "ansible_facts": "{}"})
	st, body = d.do("DELETE", fmt.Sprintf("/api/v2/hosts/%d/", ch), nil)
	d.expect(st, body, http.StatusBadRequest, `{"error":"Delete constructed inventory hosts from input inventory."}`)

	// Groups had no such check (GroupDetail.destroy replaced
	// perform_destroy), and neither did the bulk host delete.
	st, body = d.do("POST", "/api/v2/groups/", map[string]any{"name": "zz-g", "inventory": inv})
	d.expect(st, body, http.StatusCreated, "")
	group := d.id(body)
	if _, err := d.Q().Exec(ctx, `UPDATE main_inventory SET pending_deletion = false WHERE id = $1`, inv); err != nil {
		t.Fatal(err)
	}
	if _, err := d.Q().Exec(ctx, `UPDATE main_unifiedjob SET status = 'running', finished = NULL WHERE id = $1`, job); err != nil {
		t.Fatal(err)
	}
	st, body = d.do("DELETE", fmt.Sprintf("/api/v2/groups/%d/", group), nil)
	d.expect(st, body, http.StatusNoContent, "")
	st, body = d.do("POST", "/api/v2/bulk/host_delete/", map[string]any{"hosts": []int64{h3}})
	d.expect(st, body, http.StatusCreated, fmt.Sprintf(`{"hosts":{"%d":"The host zz-h3 was deleted"}}`, h3))
}

// InventoryDetail.destroy: the same related jobs check, whatever
// allow_deletes_while_in_use says, then schedule_deletion's refusal of an
// inventory already being deleted.
func TestInventoryDeleteRelatedJobs(t *testing.T) {
	d, database := newScratchServer(t, "zz-inventory-delete-test")
	ctx := context.Background()
	inv, _ := scratchInventory(t, d, "zz-invdel", map[string]any{"allow_deletes_while_in_use": true})
	adhoc := scratchJob(t, d, database, "adhoccommand", inv, "running", nil, 0)
	upd := scratchJob(t, d, database, "inventoryupdate", inv, "new", nil, 0)
	st, body := d.do("DELETE", fmt.Sprintf("/api/v2/inventories/%d/", inv), nil)
	d.expect(st, body, http.StatusConflict, fmt.Sprintf(`{"error":"Resource is being used by running jobs.","active_jobs":[{"id":%d,"type":"ad_hoc_command"},{"id":%d,"type":"inventory_update"}]}`, adhoc, upd))

	if _, err := d.Q().Exec(ctx, `UPDATE main_unifiedjob SET status = 'failed', finished = now() WHERE id = ANY($1)`, []int64{adhoc, upd}); err != nil {
		t.Fatal(err)
	}
	if _, err := d.Q().Exec(ctx, `UPDATE main_unifiedjob SET emitted_events = 1 WHERE id = $1`, adhoc); err != nil {
		t.Fatal(err)
	}
	st, body = d.do("DELETE", fmt.Sprintf("/api/v2/inventories/%d/", inv), nil)
	d.expect(st, body, http.StatusForbidden, fmt.Sprintf(`{"detail":"Related job ad_hoc_command %d (failed) is still processing events."}`, adhoc))
	// The event arrives: processing is finished.
	scratchEvent(t, d, database, "main_adhoccommandevent", "ad_hoc_command_id", adhoc, map[string]any{"event": "runner_on_ok", "counter": 1})

	if _, err := d.Q().Exec(ctx, `UPDATE main_inventory SET pending_deletion = true WHERE id = $1`, inv); err != nil {
		t.Fatal(err)
	}
	st, body = d.do("DELETE", fmt.Sprintf("/api/v2/inventories/%d/", inv), nil)
	d.expect(st, body, http.StatusBadRequest, `{"error":"Inventory is already pending deletion."}`)
	if _, err := d.Q().Exec(ctx, `UPDATE main_inventory SET pending_deletion = false WHERE id = $1`, inv); err != nil {
		t.Fatal(err)
	}
	st, body = d.do("DELETE", fmt.Sprintf("/api/v2/inventories/%d/", inv), nil)
	d.expect(st, body, http.StatusAccepted, "")
}

// InventoryDetail.update: a kind other than the inventory's own is a 405;
// an empty kind goes to the serializer, which writes it.
func TestInventoryKindChange(t *testing.T) {
	d, _ := newScratchServer(t, "zz-inventory-kind-test")
	inv, org := scratchInventory(t, d, "zz-kind", nil)
	path := fmt.Sprintf("/api/v2/inventories/%d/", inv)
	const refused = `{"error":"You cannot turn a regular inventory into a \"smart\", \"constructed\", or \"federated\" inventory."}`
	for _, kind := range []any{"smart", "constructed", "federated", "bogus", 1, true, []any{"x"}} {
		st, body := d.do("PATCH", path, map[string]any{"kind": kind})
		d.expect(st, body, http.StatusMethodNotAllowed, refused)
		st, body = d.do("PUT", path, map[string]any{"name": "zz-kind", "organization": org, "kind": kind})
		d.expect(st, body, http.StatusMethodNotAllowed, refused)
	}
	// Falsy kinds are not refused: the serializer validates them.
	st, body := d.do("PATCH", path, map[string]any{"kind": 0})
	d.expect(st, body, http.StatusBadRequest, `{"kind":["\"0\" is not a valid choice."]}`)
	st, body = d.do("PATCH", path, map[string]any{"kind": ""})
	d.expect(st, body, http.StatusOK, "")
	st, body = d.do("PATCH", path, map[string]any{"kind": nil})
	d.expect(st, body, http.StatusBadRequest, `{"kind":["This field may not be null."]}`)
	st, body = d.do("PATCH", path, map[string]any{"kind": false})
	d.expect(st, body, http.StatusBadRequest, `{"kind":["\"False\" is not a valid choice."]}`)

	// Any change of kind, not only from a regular inventory; the same
	// kind passes; an empty one makes a smart inventory a regular one.
	smart, _ := scratchInventory(t, d, "zz-kind-smart", map[string]any{"kind": "smart", "host_filter": "name=zz-none"})
	spath := fmt.Sprintf("/api/v2/inventories/%d/", smart)
	st, body = d.do("PATCH", spath, map[string]any{"kind": "constructed"})
	d.expect(st, body, http.StatusMethodNotAllowed, refused)
	st, body = d.do("PATCH", spath, map[string]any{"kind": "smart", "description": "zz"})
	d.expect(st, body, http.StatusOK, "")
	st, body = d.do("PATCH", spath, map[string]any{"kind": ""})
	d.expect(st, body, http.StatusOK, "")
	if k := colOf[string](context.Background(), d.Q(), "main_inventory", "kind", smart); k != "" {
		t.Errorf("kind after PATCH kind='': %q", k)
	}

	// Through the constructed endpoint too, before its serializer drops
	// the field.
	st, body = d.do("POST", "/api/v2/constructed_inventories/", map[string]any{"name": "zz-kind-constructed", "organization": org})
	d.expect(st, body, http.StatusCreated, "")
	cpath := fmt.Sprintf("/api/v2/constructed_inventories/%d/", d.id(body))
	st, body = d.do("PATCH", cpath, map[string]any{"kind": "smart"})
	d.expect(st, body, http.StatusMethodNotAllowed, refused)
	st, body = d.do("PATCH", cpath, map[string]any{"kind": "constructed"})
	d.expect(st, body, http.StatusOK, "")
}
