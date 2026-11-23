package tasks

import (
	"context"
	"io"
	"log/slog"
	"testing"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/activity"
	"github.com/ctrliq/ascender/internal/api"
	"github.com/ctrliq/ascender/internal/config"
	"github.com/ctrliq/ascender/internal/models"
	"github.com/ctrliq/ascender/internal/settings"
)

// Outside Kubernetes the first task process of a new installation creates
// the controlplane and default groups and joins both as a hybrid node; a
// group the administrator deletes later is not created again.
func TestProvisionFirstQueues(t *testing.T) {
	database := claimScratchDB(t)
	ctx := context.Background()
	cts, err := models.LoadContentTypes(ctx, database.Pool)
	if err != nil {
		t.Fatal(err)
	}
	cascader, err := models.LoadCascader(ctx, database.Pool)
	if err != nil {
		t.Fatal(err)
	}
	registry, err := settings.LoadRegistry()
	if err != nil {
		t.Fatal(err)
	}
	store := settings.NewStore(database, registry, "zz")
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	cfg := &config.Config{ClusterHostID: "zz-first", NodeType: "hybrid", Version: "test"}
	srv := &api.Server{Cfg: cfg, DB: database, Settings: store, CT: cts, Roles: models.RoleFactory{CT: cts}, Cascade: cascader, Activity: activity.New("zz-first"), Log: log}
	d := &Dispatcher{Cfg: cfg, DB: database, CT: cts, Log: log, Settings: store, API: srv}

	groups := func() map[string]bool {
		t.Helper()
		rows, err := database.Pool.Query(ctx, `SELECT g.name, EXISTS (SELECT 1 FROM main_instancegroup_instances gi JOIN main_instance i ON i.id = gi.instance_id
			WHERE gi.instancegroup_id = g.id AND i.hostname = 'zz-first') FROM main_instancegroup g`)
		if err != nil {
			t.Fatal(err)
		}
		defer rows.Close()
		got := map[string]bool{}
		for rows.Next() {
			var name string
			var member bool
			if err := rows.Scan(&name, &member); err != nil {
				t.Fatal(err)
			}
			got[name] = member
		}
		return got
	}

	if err := d.provisionInstance(ctx); err != nil {
		t.Fatal(err)
	}
	if got := groups(); len(got) != 2 || !got["controlplane"] || !got["default"] {
		t.Fatalf("after the first start: groups and membership %v", got)
	}
	var container bool
	if err := database.Pool.QueryRow(ctx, `SELECT is_container_group FROM main_instancegroup WHERE name = 'default'`).Scan(&container); err != nil || container {
		t.Errorf("default is a container group (%v)", err)
	}

	var defaultID int64
	if err := database.Pool.QueryRow(ctx, `SELECT id FROM main_instancegroup WHERE name = 'default'`).Scan(&defaultID); err != nil {
		t.Fatal(err)
	}
	if err := database.Tx(ctx, func(tx pgx.Tx) error { return cascader.Delete(ctx, tx, "main_instancegroup", "id", []int64{defaultID}) }); err != nil {
		t.Fatal(err)
	}
	if err := d.provisionInstance(ctx); err != nil {
		t.Fatal(err)
	}
	if got := groups(); len(got) != 1 || !got["controlplane"] {
		t.Errorf("after a later start: groups and membership %v", got)
	}
}
