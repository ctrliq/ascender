package main

import (
	"context"
	"fmt"
	"io"
	"log"
	"log/slog"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/models"
)

// perfScratchDB is an empty *_perf database with the baseline schema, made
// beside ASCENDER_SCRATCH_DATABASE_URL (or ASCENDER_TEST_DATABASE_URL) and
// dropped when the test ends.
func perfScratchDB(t *testing.T) *db.DB {
	t.Helper()
	base := os.Getenv("ASCENDER_SCRATCH_DATABASE_URL")
	if base == "" {
		base = os.Getenv("ASCENDER_TEST_DATABASE_URL")
	}
	if base == "" {
		t.Skip("neither ASCENDER_SCRATCH_DATABASE_URL nor ASCENDER_TEST_DATABASE_URL is set")
	}
	ctx := context.Background()
	admin, err := db.Open(ctx, base)
	if err != nil {
		t.Fatal(err)
	}
	name := fmt.Sprintf("zz_perfseed_test_%d_perf", time.Now().UnixNano())
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

// insertZero inserts a row with the given columns, the other required
// ones zero, and returns its id when the table has one.
func insertZero(t *testing.T, d *db.DB, table string, set map[string]any) int64 {
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
		case "timestamptz":
			cols[col] = time.Now()
		case "jsonb":
			cols[col] = "{}"
		default:
			cols[col] = ""
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
	if _, ok := set["unifiedjobtemplate_ptr_id"]; ok {
		if _, err := d.Pool.Exec(ctx, q, args...); err != nil {
			t.Fatalf("insert into %s: %v", table, err)
		}
		return 0
	}
	var id int64
	if err := d.Pool.QueryRow(ctx, q+` RETURNING id`, args...).Scan(&id); err != nil {
		t.Fatalf("insert into %s: %v", table, err)
	}
	return id
}

// seedTemplates adds n perf job templates, bare rows.
func seedTemplates(t *testing.T, d *db.DB, cts *models.ContentTypes, n int) {
	t.Helper()
	for i := 1; i <= n; i++ {
		id := insertZero(t, d, "main_unifiedjobtemplate", map[string]any{"name": fmt.Sprintf("zz-perf-jt-01-%03d", i),
			"polymorphic_ctype_id": cts.ID("main.jobtemplate"), "status": "never updated"})
		insertZero(t, d, "main_jobtemplate", map[string]any{"unifiedjobtemplate_ptr_id": id, "playbook": "site.yml"})
	}
}

func countJobs(t *testing.T, d *db.DB) int {
	t.Helper()
	var n int
	if err := d.Pool.QueryRow(context.Background(), `SELECT count(*) FROM main_job j JOIN main_unifiedjob u ON u.id = j.unifiedjob_ptr_id WHERE u.name LIKE 'zz-perf-jt-%'`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

// The jobs seeder tops up to its target, as the other seeders skip what
// is there: a first run adds the target, a second nothing, and a run
// after jobs went missing only those. The events step logs its end once.
func TestTopUpJobs(t *testing.T) {
	d := perfScratchDB(t)
	ctx := context.Background()
	cts, err := models.LoadContentTypes(ctx, d.Pool)
	if err != nil {
		t.Fatal(err)
	}
	// The seeded jobs are created by user 1, as on the copies it runs on.
	insertZero(t, d, "auth_user", map[string]any{"id": 1, "username": "zz-perf-admin"})
	seedTemplates(t, d, cts, 3)
	log.SetOutput(io.Discard)
	defer log.SetOutput(os.Stderr)
	must := func(err error) {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
	}
	dones := map[string]int{}
	step := func(name string) func() { return func() { dones[name]++ } }

	if added := topUpJobs(ctx, d, cts, 10, must, step); added != 10 || countJobs(t, d) != 10 {
		t.Fatalf("first run added %d, %d jobs; want 10", added, countJobs(t, d))
	}
	// Spread over the templates: 4, 3 and 3.
	var most int
	must(d.Pool.QueryRow(ctx, `SELECT max(n) FROM (SELECT count(*) AS n FROM main_unifiedjob WHERE name LIKE 'zz-perf-jt-%' GROUP BY unified_job_template_id) c`).Scan(&most))
	if most != 4 {
		t.Errorf("most jobs of one template %d, want 4", most)
	}
	if added := topUpJobs(ctx, d, cts, 10, must, step); added != 0 || countJobs(t, d) != 10 {
		t.Errorf("second run added %d, %d jobs; want 0, 10", added, countJobs(t, d))
	}
	_, err = d.Pool.Exec(ctx, `UPDATE main_unifiedjobtemplate SET last_job_id = NULL`)
	must(err)
	_, err = d.Pool.Exec(ctx, `DELETE FROM main_job WHERE unifiedjob_ptr_id IN (SELECT id FROM main_unifiedjob WHERE name LIKE 'zz-perf-jt-%' ORDER BY id LIMIT 4)`)
	must(err)
	_, err = d.Pool.Exec(ctx, `DELETE FROM main_unifiedjob u WHERE name LIKE 'zz-perf-jt-%' AND NOT EXISTS (SELECT 1 FROM main_job j WHERE j.unifiedjob_ptr_id = u.id)`)
	must(err)
	if added := topUpJobs(ctx, d, cts, 10, must, step); added != 4 || countJobs(t, d) != 10 {
		t.Errorf("top-up added %d, %d jobs; want 4, 10", added, countJobs(t, d))
	}
	if dones["jobs"] != 2 {
		t.Errorf("jobs step ended %d times, want 2", dones["jobs"])
	}

	seedEvents(ctx, d, must, step)
	if dones["events"] != 1 {
		t.Errorf("events step ended %d times, want 1", dones["events"])
	}
	var events int
	must(d.Pool.QueryRow(ctx, `SELECT count(*) FROM main_jobevent WHERE task LIKE 'task %'`).Scan(&events))
	if events != 10*eventsPerJob {
		t.Errorf("%d events, want %d", events, 10*eventsPerJob)
	}
}
