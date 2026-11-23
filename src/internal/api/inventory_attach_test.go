package api

import (
	"context"
	"fmt"
	"net/http"
	"testing"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/models"
)

func TestSubAttachID(t *testing.T) {
	for _, c := range []struct {
		body   string
		detach bool
		id     int64
		msg    string
	}{
		{`{}`, false, 0, ""},
		{`{"id": 0}`, false, 0, ""},
		{`{"id": ""}`, false, 0, ""},
		{`{"id": 7}`, false, 7, ""},
		{`{"id": true}`, false, 1, ""},
		{`{"id": "7"}`, false, 0, `"id" field must be an integer.`},
		{`{"id": 7.5}`, false, 0, `"id" field must be an integer.`},
		{`{"id": 7.0}`, false, 0, `"id" field must be an integer.`},
		{`{"disassociate": true}`, true, 0, `"id" is required to disassociate`},
		{`{"id": 0, "disassociate": true}`, true, 0, `"id" is required to disassociate`},
		{`{"id": "x", "disassociate": true}`, true, 0, `"id" field must be an integer.`},
		{`{"id": 3, "disassociate": true}`, true, 3, ""},
	} {
		body := NewOMap()
		if err := body.UnmarshalJSON([]byte(c.body)); err != nil {
			t.Fatal(err)
		}
		id, aerr := subAttachID(body, c.detach)
		msg := ""
		if aerr != nil {
			msg = aerr.Body.(map[string]any)["msg"].(string)
		}
		if id != c.id || msg != c.msg {
			t.Errorf("%s: got %d %q, want %d %q", c.body, id, msg, c.id, c.msg)
		}
	}
}

// The group and host sub-lists against a real database: attach, create,
// detach, the cycle check and the error bodies of SubListCreateAttachDetach.
func TestInventoryTreeAttach(t *testing.T) {
	d := newDBServer(t, "zz-attach-test")
	ctx := context.Background()
	var org int64
	if err := d.Q().QueryRow(ctx, `SELECT id FROM main_organization ORDER BY id LIMIT 1`).Scan(&org); err != nil {
		t.Skip("no organization")
	}
	st, body := d.do("POST", "/api/v2/inventories/", map[string]any{"name": "zz-attach-test", "organization": org})
	d.expect(st, body, http.StatusCreated, "")
	inv := d.id(body)
	t.Cleanup(func() {
		err := d.DB.Tx(ctx, func(tx pgx.Tx) error { return models.DeleteInventory(ctx, tx, inv, d.CT, d.Cascade) })
		if err != nil {
			t.Errorf("delete inventory: %v", err)
		}
	})
	inGroup := func(table, a, b string, x, y int64) bool {
		ok, err := d.dbExists(fmt.Sprintf(`SELECT 1 FROM %s WHERE %s = $1 AND %s = $2`, table, a, b), x, y)
		if err != nil {
			t.Fatal(err)
		}
		return ok
	}

	st, body = d.do("POST", fmt.Sprintf("/api/v2/inventories/%d/groups/", inv), map[string]any{"name": "zz-a"})
	d.expect(st, body, http.StatusCreated, "")
	a := d.id(body)
	st, body = d.do("POST", fmt.Sprintf("/api/v2/groups/%d/children/", a), map[string]any{"name": "zz-b"})
	d.expect(st, body, http.StatusCreated, "")
	b := d.id(body)
	if !inGroup("main_group_parents", "from_group_id", "to_group_id", b, a) {
		t.Fatal("new child not linked")
	}
	cyc := `{"error":"Cyclical Group association."}`
	st, body = d.do("POST", fmt.Sprintf("/api/v2/groups/%d/children/", b), map[string]any{"id": a})
	d.expect(st, body, http.StatusBadRequest, cyc)
	st, body = d.do("POST", fmt.Sprintf("/api/v2/groups/%d/children/", a), map[string]any{"id": a})
	d.expect(st, body, http.StatusBadRequest, cyc)

	hosts := fmt.Sprintf("/api/v2/groups/%d/hosts/", a)
	st, body = d.do("POST", hosts, map[string]any{"id": "5"})
	d.expect(st, body, http.StatusBadRequest, `{"msg":"\"id\" field must be an integer."}`)
	st, body = d.do("POST", hosts, map[string]any{"id": 2147483000})
	d.expect(st, body, http.StatusBadRequest, `{"detail":"Host matching query does not exist."}`)
	st, body = d.do("POST", hosts, map[string]any{"name": "zz-h1"})
	d.expect(st, body, http.StatusCreated, "")
	h1 := d.id(body)
	if !inGroup("main_group_hosts", "group_id", "host_id", a, h1) {
		t.Fatal("new host not linked")
	}
	// A host of that name, given no variables, is attached, not created.
	st, body = d.do("POST", fmt.Sprintf("/api/v2/groups/%d/hosts/", b), map[string]any{"name": "zz-h1"})
	d.expect(st, body, http.StatusNoContent, "")
	if !inGroup("main_group_hosts", "group_id", "host_id", b, h1) {
		t.Fatal("existing host not attached")
	}
	want := fmt.Sprintf(`{"object1": "group", "object1_pk": %d, "object2": "host", "object2_pk": %d, "action": "associate", "relationship": "ascender.main.models.inventory.Group_hosts"}`, a, h1)
	if ok, err := d.dbExists(`SELECT 1 FROM main_activitystream s JOIN main_activitystream_group g ON g.activitystream_id = s.id AND g.group_id = $2
		JOIN main_activitystream_host h ON h.activitystream_id = s.id AND h.host_id = $3 WHERE s.operation = 'associate' AND s.changes = $1`, want, a, h1); err != nil || !ok {
		t.Errorf("no activity entry %s (%v)", want, err)
	}
	child := fmt.Sprintf(`{"object1": "group", "object1_pk": %d, "object2": "group", "object2_pk": %d, "action": "associate", "relationship": "ascender.main.models.inventory.Group_parents"}`, a, b)
	if ok, err := d.dbExists(`SELECT 1 FROM main_activitystream s WHERE s.changes = $1 AND (SELECT count(*) FROM main_activitystream_group g WHERE g.activitystream_id = s.id) = 2`, child); err != nil || !ok {
		t.Errorf("no activity entry %s linking both groups (%v)", child, err)
	}

	// A host's groups: create one linked to the host, detach another.
	st, body = d.do("POST", fmt.Sprintf("/api/v2/hosts/%d/groups/", h1), map[string]any{"name": "zz-c"})
	d.expect(st, body, http.StatusCreated, "")
	c := d.id(body)
	if !inGroup("main_group_hosts", "group_id", "host_id", c, h1) {
		t.Fatal("new group not linked to the host")
	}
	st, body = d.do("POST", fmt.Sprintf("/api/v2/hosts/%d/groups/", h1), map[string]any{"id": a, "disassociate": true, "inventory": inv + 1})
	d.expect(st, body, http.StatusForbidden, `{"detail":"Unable to change inventory on a host."}`)
	st, body = d.do("POST", fmt.Sprintf("/api/v2/hosts/%d/groups/", h1), map[string]any{"id": a, "disassociate": true})
	d.expect(st, body, http.StatusNoContent, "")
	if inGroup("main_group_hosts", "group_id", "host_id", a, h1) {
		t.Fatal("host not detached")
	}

	// A children POST with "disassociate" and no id deletes the group.
	st, body = d.do("POST", fmt.Sprintf("/api/v2/groups/%d/children/", b), map[string]any{"disassociate": true})
	d.expect(st, body, http.StatusNoContent, "")
	if ok, _ := d.dbExists(`SELECT 1 FROM main_group WHERE id = $1`, b); ok {
		t.Fatal("group not deleted")
	}
	if ok, _ := d.dbExists(`SELECT 1 FROM main_host WHERE id = $1`, h1); !ok {
		t.Fatal("the deleted group's host went with it")
	}
}

func (d *dbServer) dbExists(sql string, args ...any) (bool, error) {
	return dbExistsQ(d.Q(), sql, args...)
}
