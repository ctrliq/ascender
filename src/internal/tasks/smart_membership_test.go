package tasks

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"strings"
	"testing"
	"time"

	"github.com/ctrliq/ascender/internal/config"
	"github.com/ctrliq/ascender/internal/models"
	"github.com/ctrliq/ascender/internal/settings"
)

// A job on a smart inventory replaces its cached membership with the hosts
// its filter selects now: one host per name (the lowest id), disabled ones
// included, only from inventories of its organization; stale rows go and
// another inventory's rows stay. Nothing changes the second time. No
// unified job is made.
func TestUpdateSmartMemberships(t *testing.T) {
	database := claimScratchDB(t)
	ctx := context.Background()
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	org := insertRow(t, database, "main_organization", map[string]any{"name": "zz-smart-org"})
	otherOrg := insertRow(t, database, "main_organization", map[string]any{"name": "zz-smart-other-org"})
	inventory := func(name string, orgID int64, kind, filter string) int64 {
		set := map[string]any{"name": name, "organization_id": orgID, "kind": kind, "variables": ""}
		if filter != "" {
			set["host_filter"] = filter
		}
		return insertRow(t, database, "main_inventory", set)
	}
	host := func(inv int64, name string, enabled bool) int64 {
		return insertRow(t, database, "main_host", map[string]any{"name": name, "inventory_id": inv, "enabled": enabled, "ansible_facts": "{}", "variables": ""})
	}
	a := inventory("zz-a", org, "", "")
	b := inventory("zz-b", org, "", "")
	foreign := inventory("zz-foreign", otherOrg, "", "")
	webA := host(a, "zz-web", true)
	host(b, "zz-web", true) // same name, higher id: not a member
	dbB := host(b, "zz-db", false)
	host(foreign, "zz-db2", true)
	other := host(a, "zz-other", true)
	smart := inventory("zz-smart", org, "smart", "name__startswith=zz-")
	smart2 := inventory("zz-smart2", org, "smart", "name=zz-other")
	// A stale row of this inventory, and one of another smart inventory.
	stale := host(foreign, "zz-stale", true)
	insertRow(t, database, "main_smartinventorymembership", map[string]any{"inventory_id": smart, "host_id": stale})
	insertRow(t, database, "main_smartinventorymembership", map[string]any{"inventory_id": smart2, "host_id": other})

	members := func(inv int64) string {
		var ids []int64
		rows, err := database.Pool.Query(ctx, `SELECT host_id FROM main_smartinventorymembership WHERE inventory_id = $1 ORDER BY host_id`, inv)
		if err != nil {
			t.Fatal(err)
		}
		defer rows.Close()
		for rows.Next() {
			var id int64
			if err := rows.Scan(&id); err != nil {
				t.Fatal(err)
			}
			ids = append(ids, id)
		}
		return fmt.Sprint(ids)
	}
	inv, err := models.GetInventory(ctx, database.Pool, smart)
	if err != nil {
		t.Fatal(err)
	}
	changed, err := updateSmartMemberships(ctx, database, log, inv)
	if err != nil || !changed {
		t.Fatalf("first update: %v %v", changed, err)
	}
	if got, want := members(smart), fmt.Sprint([]int64{webA, dbB, other}); got != want {
		t.Errorf("members %s, want %s", got, want)
	}
	if got, want := members(smart2), fmt.Sprint([]int64{other}); got != want {
		t.Errorf("another inventory's members %s, want %s", got, want)
	}
	changed, err = updateSmartMemberships(ctx, database, log, inv)
	if err != nil || changed {
		t.Errorf("second update: %v %v", changed, err)
	}
	// A host that stops matching leaves.
	if _, err := database.Pool.Exec(ctx, `UPDATE main_host SET name = 'yy-other' WHERE id = $1`, other); err != nil {
		t.Fatal(err)
	}
	if changed, err := updateSmartMemberships(ctx, database, log, inv); err != nil || !changed {
		t.Fatalf("after rename: %v %v", changed, err)
	}
	if got, want := members(smart), fmt.Sprint([]int64{webA, dbB}); got != want {
		t.Errorf("members after rename %s, want %s", got, want)
	}
}

// The run records the membership where pre_run_hook did: after the
// inventory, project and execution environment checks, before the private
// data directory (here missing, which ends the run) and the playbook. A job
// refused by the checks records nothing, and an ad hoc command never does.
// The job is a struct only: no unified job row is made.
func TestJobRunRecordsSmartMembership(t *testing.T) {
	database := claimScratchDB(t)
	ctx := context.Background()
	cts, err := models.LoadContentTypes(ctx, database.Pool)
	if err != nil {
		t.Fatal(err)
	}
	registry, err := settings.LoadRegistry()
	if err != nil {
		t.Fatal(err)
	}
	insertRow(t, database, "conf_setting", map[string]any{"key": "ASCENDER_ISOLATION_BASE_PATH", "value": `"/nonexistent/zz-isolation"`})
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	d := &Dispatcher{Cfg: &config.Config{}, DB: database, CT: cts, Log: log, Settings: settings.NewStore(database, registry, "zz")}
	org := insertRow(t, database, "main_organization", map[string]any{"name": "zz-run-org"})
	src := insertRow(t, database, "main_inventory", map[string]any{"name": "zz-run-src", "organization_id": org, "kind": "", "variables": ""})
	h := insertRow(t, database, "main_host", map[string]any{"name": "zz-run-h", "inventory_id": src, "enabled": true, "ansible_facts": "{}", "variables": ""})
	smartID := insertRow(t, database, "main_inventory", map[string]any{"name": "zz-run-smart", "organization_id": org, "kind": "smart", "host_filter": "name=zz-run-h", "variables": ""})
	smart, err := models.GetInventory(ctx, database.Pool, smartID)
	if err != nil {
		t.Fatal(err)
	}
	count := func() int {
		var n int
		if err := database.Pool.QueryRow(ctx, `SELECT count(*) FROM main_smartinventorymembership WHERE inventory_id = $1 AND host_id = $2`, smartID, h).Scan(&n); err != nil {
			t.Fatal(err)
		}
		return n
	}
	run := func(project *models.Project, adHoc *models.AdHocCommand) (string, error) {
		r := &jobRun{baseRun: baseRun{d: d, ctx: ctx, id: 999999, logKey: "job", ee: &models.ExecutionEnvironment{}},
			job: &models.Job{UnifiedJob: models.UnifiedJob{ID: 999999, Created: time.Now()}}, inventory: smart, project: project, adHoc: adHoc}
		return r.execute(ctx)
	}

	if st, err := run(nil, nil); st != "failed" || err != nil || count() != 0 {
		t.Fatalf("without a project: %s %v, %d rows", st, err, count())
	}
	if st, err := run(nil, &models.AdHocCommand{}); st != "error" || count() != 0 {
		t.Fatalf("ad hoc command: %s %v, %d rows", st, err, count())
	}
	st, err := run(&models.Project{}, nil)
	if st != "error" || err == nil || !strings.Contains(err.Error(), "ASCENDER_ISOLATION_BASE_PATH") {
		t.Fatalf("run: %s %v", st, err)
	}
	if count() != 1 {
		t.Errorf("membership not recorded")
	}
}
