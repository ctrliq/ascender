package tasks

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"net/url"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/ctrliq/ascender/internal/config"
	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/models"
	"github.com/ctrliq/ascender/internal/settings"
)

// claimScratchDB is an empty database beside ASCENDER_TEST_DATABASE_URL
// with the baseline schema loaded: no task process watches it, so the
// pending tasks the tests make are never run.
func claimScratchDB(t *testing.T) *db.DB {
	t.Helper()
	base := os.Getenv("ASCENDER_TEST_DATABASE_URL")
	if base == "" {
		t.Skip("ASCENDER_TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	admin, err := db.Open(ctx, base)
	if err != nil {
		t.Fatal(err)
	}
	name := fmt.Sprintf("zz_claim_test_%d", time.Now().UnixNano())
	if _, err := admin.Pool.Exec(ctx, `CREATE DATABASE `+name); err != nil {
		admin.Close()
		t.Skipf("cannot create a scratch database: %v", err)
	}
	u, err := url.Parse(base)
	if err != nil {
		t.Fatal(err)
	}
	u.Path = "/" + name
	d, err := db.Open(ctx, u.String())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		d.Close()
		if _, err := admin.Pool.Exec(ctx, `DROP DATABASE `+name+` WITH (FORCE)`); err != nil {
			t.Errorf("drop %s: %v", name, err)
		}
		admin.Close()
	})
	if _, err := d.EnsureSchema(ctx, slog.New(slog.NewTextHandler(io.Discard, nil))); err != nil {
		t.Fatal(err)
	}
	return d
}

// insertRow inserts a row with the given columns, filling the other
// required ones with zero values, and returns its id (0 for a table
// without one).
func insertRow(t *testing.T, d *db.DB, table string, set map[string]any) int64 {
	t.Helper()
	ctx := context.Background()
	rows, err := d.Pool.Query(ctx, `SELECT column_name, udt_name FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = $1 AND is_nullable = 'NO' AND column_default IS NULL AND is_identity = 'NO'`, table)
	if err != nil {
		t.Fatal(err)
	}
	cols := map[string]any{}
	for rows.Next() {
		var col, typ string
		if err := rows.Scan(&col, &typ); err != nil {
			t.Fatal(err)
		}
		switch typ {
		case "int2", "int4", "int8", "numeric":
			cols[col] = 0
		case "bool":
			cols[col] = false
		case "text", "varchar":
			cols[col] = ""
		case "timestamptz":
			cols[col] = time.Now()
		case "jsonb":
			cols[col] = "{}"
		default:
			t.Fatalf("%s.%s: no zero value for %s", table, col, typ)
		}
	}
	rows.Close()
	for k, v := range set {
		cols[k] = v
	}
	var names, params []string
	var args []any
	for k, v := range cols {
		args = append(args, v)
		names = append(names, `"`+k+`"`)
		params = append(params, fmt.Sprintf("$%d", len(args)))
	}
	q := `INSERT INTO ` + table + ` (` + strings.Join(names, ", ") + `) VALUES (` + strings.Join(params, ", ") + `)`
	var hasID bool
	if err := d.Pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = 'id')`, table).Scan(&hasID); err != nil {
		t.Fatal(err)
	}
	var id int64
	if hasID {
		err = d.Pool.QueryRow(ctx, q+` RETURNING id`, args...).Scan(&id)
	} else {
		_, err = d.Pool.Exec(ctx, q, args...)
	}
	if err != nil {
		t.Fatalf("insert into %s: %v", table, err)
	}
	return id
}

// claimRig is two task processes, on nodes zz-a and zz-b, sharing a
// scratch database whose control plane holds both nodes.
type claimRig struct {
	db *db.DB
	ct *models.ContentTypes
	d  []*Dispatcher
}

func newClaimRig(t *testing.T) *claimRig {
	t.Helper()
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
	r := &claimRig{db: database, ct: cts}
	cp := insertRow(t, database, "main_instancegroup", map[string]any{"name": "controlplane", "policy_instance_list": "[]"})
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	noReceptor := t.TempDir() + "/receptor.conf"
	for _, host := range []string{"zz-a", "zz-b"} {
		inst := insertRow(t, database, "main_instance", map[string]any{"hostname": host, "uuid": host, "capacity": 1000,
			"node_type": "hybrid", "node_state": "ready", "enabled": true, "version": "test"})
		insertRow(t, database, "main_instancegroup_instances", map[string]any{"instancegroup_id": cp, "instance_id": inst})
		cfg := &config.Config{ClusterHostID: host, ReceptorConfig: noReceptor, ReceptorSocket: noReceptor + ".sock"}
		r.d = append(r.d, &Dispatcher{Cfg: cfg, DB: database, CT: cts, Log: log, Settings: settings.NewStore(database, registry, "zz")})
	}
	return r
}

// pending adds a pending task of the content type, of the template when
// ujt is not 0, preferring the given instance groups.
func (r *claimRig) pending(t *testing.T, ctype string, ujt int64, groups string) int64 {
	t.Helper()
	set := map[string]any{"name": "zz-claim", "status": "pending", "launch_type": "manual", "task_impact": 1,
		"polymorphic_ctype_id": r.ct.ID(ctype), "preferred_instance_groups_cache": groups, "created": time.Now()}
	if ujt != 0 {
		set["unified_job_template_id"] = ujt
	}
	id := insertRow(t, r.db, "main_unifiedjob", set)
	switch ctype {
	case "main.systemjob":
		insertRow(t, r.db, "main_systemjob", map[string]any{"unifiedjob_ptr_id": id, "job_type": "cleanup_jobs"})
	case "main.job":
		insertRow(t, r.db, "main_job", map[string]any{"unifiedjob_ptr_id": id, "job_type": "run", "forks": 1})
	}
	return id
}

// race has both task processes claim at once, each until nothing is
// left for it, and reports how many tasks ended up waiting.
func (r *claimRig) race(t *testing.T, ids []int64) int {
	t.Helper()
	ctx := context.Background()
	if _, err := r.db.Pool.Exec(ctx, `UPDATE main_unifiedjob SET status = 'pending', instance_group_id = NULL, execution_node = '', controller_node = '' WHERE id = ANY($1)`, ids); err != nil {
		t.Fatal(err)
	}
	var start, done sync.WaitGroup
	start.Add(1)
	for _, d := range r.d {
		done.Add(1)
		go func(d *Dispatcher) {
			defer done.Done()
			start.Wait()
			skip := []int64{} // as claimNext: nil would be SQL NULL
			for {
				id, _, outcome := d.claimLocked(ctx, skip)
				if outcome == claimNone {
					return
				}
				if outcome == claimNoRoom {
					skip = append(skip, id)
				}
			}
		}(d)
	}
	start.Done()
	done.Wait()
	var waiting int
	if err := r.db.Pool.QueryRow(ctx, `SELECT count(*) FROM main_unifiedjob WHERE id = ANY($1) AND status = 'waiting'`, ids).Scan(&waiting); err != nil {
		t.Fatal(err)
	}
	return waiting
}

// Two task processes never start two tasks of one template that does
// not allow simultaneous runs.
func TestClaimTemplateBlockingAcrossProcesses(t *testing.T) {
	r := newClaimRig(t)
	ujt := insertRow(t, r.db, "main_unifiedjobtemplate", map[string]any{"name": "zz-claim", "status": "never updated",
		"polymorphic_ctype_id": r.ct.ID("main.systemjobtemplate")})
	var ids []int64
	for range 8 {
		ids = append(ids, r.pending(t, "main.systemjob", ujt, "[]"))
	}
	for round := range 50 {
		if n := r.race(t, ids); n != 1 {
			t.Fatalf("round %d: %d tasks of one template waiting, want 1", round, n)
		}
	}
}

// Two task processes never fill a container group past its
// max_concurrent_jobs.
func TestClaimGroupCapacityAcrossProcesses(t *testing.T) {
	r := newClaimRig(t)
	cg := insertRow(t, r.db, "main_instancegroup", map[string]any{"name": "zz-claim-cg", "policy_instance_list": "[]",
		"is_container_group": true, "max_concurrent_jobs": 1})
	var ids []int64
	for range 8 {
		ids = append(ids, r.pending(t, "main.job", 0, fmt.Sprintf("[%d]", cg)))
	}
	for round := range 50 {
		if n := r.race(t, ids); n != 1 {
			t.Fatalf("round %d: %d jobs placed in a group of one, want 1", round, n)
		}
	}
}
