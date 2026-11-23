package api

import (
	"context"
	"testing"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/models"
)

// RemoveLostInstance decides again, under the row's lock, whether the node
// is lost: one that checked in after the caller looked, and one that has
// only just registered, stay.
func TestRemoveLostInstance(t *testing.T) {
	d := newDBServer(t, "zz-remove-lost-test")
	ctx := context.Background()
	register := func(hostname string) int64 {
		var id int64
		err := d.DB.Tx(ctx, func(tx pgx.Tx) error {
			reg, err := models.RegisterInstance(ctx, tx, hostname, "control")
			id = reg.ID
			return err
		})
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { _, _ = d.DB.Pool.Exec(ctx, `DELETE FROM main_instance WHERE id = $1`, id) })
		return id
	}
	exists := func(id int64) (ok bool) {
		_ = d.DB.Pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM main_instance WHERE id = $1)`, id).Scan(&ok)
		return ok
	}

	// Registered a moment ago, never seen: a pod that is starting.
	starting := register("zz-remove-lost-starting")
	if removed, err := d.RemoveLostInstance(ctx, starting); err != nil || removed || !exists(starting) {
		t.Fatalf("a node that just registered: removed %v, err %v", removed, err)
	}
	// Seen within the lost period: it checked in after the caller's list.
	alive := register("zz-remove-lost-alive")
	if _, err := d.DB.Pool.Exec(ctx, `UPDATE main_instance SET last_seen = now() - interval '30 seconds', created = now() - interval '1 day' WHERE id = $1`, alive); err != nil {
		t.Fatal(err)
	}
	if removed, err := d.RemoveLostInstance(ctx, alive); err != nil || removed || !exists(alive) {
		t.Fatalf("a node that checked in: removed %v, err %v", removed, err)
	}
	// Not seen for longer than the lost period goes, and so does one that
	// registered that long ago and never checked in.
	for name, set := range map[string]string{
		"zz-remove-lost-gone":       `last_seen = now() - interval '10 minutes'`,
		"zz-remove-lost-never-seen": `last_seen = NULL, created = now() - interval '10 minutes'`,
	} {
		id := register(name)
		if _, err := d.DB.Pool.Exec(ctx, `UPDATE main_instance SET `+set+` WHERE id = $1`, id); err != nil {
			t.Fatal(err)
		}
		if removed, err := d.RemoveLostInstance(ctx, id); err != nil || !removed || exists(id) {
			t.Fatalf("%s: removed %v, err %v", name, removed, err)
		}
	}
	// One that is already gone is nothing to remove.
	if removed, err := d.RemoveLostInstance(ctx, starting+1_000_000); err != nil || removed {
		t.Fatalf("a missing node: removed %v, err %v", removed, err)
	}
}
