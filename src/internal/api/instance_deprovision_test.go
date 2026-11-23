package api

import (
	"context"
	"fmt"
	"net/http"
	"testing"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/models"
)

// A control node the heartbeat lost may be deprovisioned on any platform,
// though it is managed, and the task process then deletes it; one that
// checks in again before then goes back to unavailable instead.
func TestDeprovisionLostInstance(t *testing.T) {
	d := newDBServer(t, "zz-deprovision-test")
	ctx := context.Background()
	if d.isK8s(ctx) {
		t.Skip("IS_K8S is on")
	}
	register := func(host, state, seen string) int64 {
		t.Helper()
		var id int64
		err := d.DB.Tx(ctx, func(tx pgx.Tx) error {
			r, err := models.RegisterInstance(ctx, tx, host, "control")
			if err != nil {
				return err
			}
			id = r.ID
			_, err = tx.Exec(ctx, `UPDATE main_instance SET node_state = $2, last_seen = now() - $3::interval WHERE id = $1`, id, state, seen)
			return err
		})
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() {
			_ = d.DB.Tx(ctx, func(tx pgx.Tx) error { return d.Cascade.Delete(ctx, tx, "main_instance", "id", []int64{id}) })
		})
		return id
	}
	lost := register("zz-deprovision-lost", "unavailable", "1 hour")
	ready := register("zz-deprovision-ready", "ready", "0 seconds")
	back := register("zz-deprovision-back", "deprovisioning", "0 seconds")

	st, body := d.do("PATCH", fmt.Sprintf("/api/v2/instances/%d/", ready), map[string]any{"node_state": "deprovisioning"})
	d.expect(st, body, http.StatusBadRequest, `{"node_state":["Can only change the state on Kubernetes or OpenShift."]}`)
	st, body = d.do("PATCH", fmt.Sprintf("/api/v2/instances/%d/", lost), map[string]any{"node_state": "deprovisioning"})
	d.expect(st, body, http.StatusOK, "")
	st, body = d.do("PATCH", fmt.Sprintf("/api/v2/instances/%d/", ready), map[string]any{"node_state": "unavailable"})
	d.expect(st, body, http.StatusBadRequest, "")

	if err := d.RemoveDeprovisionedInstances(ctx); err != nil {
		t.Fatal(err)
	}
	if ok, err := d.dbExists(`SELECT 1 FROM main_instance WHERE id = $1`, lost); err != nil || ok {
		t.Errorf("the lost instance was not removed (%v)", err)
	}
	var state string
	if err := d.Q().QueryRow(ctx, `SELECT node_state FROM main_instance WHERE id = $1`, back).Scan(&state); err != nil || state != "unavailable" {
		t.Errorf("the instance that checked in again: %q, %v; want it kept, unavailable", state, err)
	}
}
