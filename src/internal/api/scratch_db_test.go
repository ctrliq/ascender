package api

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/models"
)

// newScratchServer is newDBServer against an empty database with the
// baseline schema, made beside ASCENDER_SCRATCH_DATABASE_URL (or, without
// it, ASCENDER_TEST_DATABASE_URL) and dropped when the test ends. No task
// process watches it, so tests may make pending and running jobs there.
func newScratchServer(t *testing.T, username string) (*dbServer, *db.DB) {
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
	name := fmt.Sprintf("zz_api_scratch_%d", time.Now().UnixNano())
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
	t.Setenv("ASCENDER_TEST_DATABASE_URL", u.String())
	srv := newDBServer(t, username)
	// Before newDBServer's cleanup removes the user: what the test made
	// refers to it, and goes with the database anyway.
	t.Cleanup(func() {
		if _, err := d.Pool.Exec(ctx, `TRUNCATE main_organization, main_inventory, main_unifiedjobtemplate, main_unifiedjob, main_label CASCADE`); err != nil {
			t.Errorf("truncate: %v", err)
		}
		if _, err := d.Pool.Exec(ctx, `DELETE FROM main_rbac_roles_members WHERE user_id = $1`, srv.user.ID); err != nil {
			t.Errorf("role members: %v", err)
		}
	})
	return srv, d
}

// scratchInsert inserts a row with the given columns, filling the other
// required ones with zero values, and returns its id (0 for a table
// without one).
func scratchInsert(t *testing.T, d *db.DB, table string, set map[string]any) int64 {
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
		case "int2", "int4", "int8", "numeric", "float8":
			cols[col] = 0
		case "bool":
			cols[col] = false
		case "text", "varchar":
			cols[col] = ""
		case "timestamptz":
			cols[col] = time.Now()
		case "jsonb":
			cols[col] = "{}"
		case "uuid":
			cols[col] = "00000000-0000-0000-0000-000000000000"
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

// scratchEvent inserts an event of a scratch job into the event table
// (with its partition) for the job's creation time.
func scratchEvent(t *testing.T, d *dbServer, database *db.DB, table, column string, jobID int64, set map[string]any) int64 {
	t.Helper()
	ctx := context.Background()
	created := colOf[time.Time](ctx, d.Q(), "main_unifiedjob", "created", jobID)
	if err := models.EnsureEventPartition(ctx, d.Q(), table, created); err != nil {
		t.Fatal(err)
	}
	row := map[string]any{column: jobID, "job_created": created, "created": time.Now(), "modified": time.Now()}
	for k, v := range set {
		row[k] = v
	}
	return scratchInsert(t, database, table, row)
}

// scratchJob inserts a unified job of the given kind ("job",
// "inventoryupdate", "adhoccommand") against the inventory, with the
// status, finish time and emitted event count given, and returns its id.
func scratchJob(t *testing.T, d *dbServer, database *db.DB, kind string, inventoryID int64, status string, finished *time.Time, emitted int) int64 {
	t.Helper()
	ujSet := map[string]any{"polymorphic_ctype_id": d.CT.ID("main." + kind), "status": status, "emitted_events": emitted, "name": "zz-" + kind, "launch_type": "manual"}
	if finished != nil {
		ujSet["finished"] = *finished
	}
	id := scratchInsert(t, database, "main_unifiedjob", ujSet)
	switch kind {
	case "job":
		scratchInsert(t, database, "main_job", map[string]any{"unifiedjob_ptr_id": id, "inventory_id": inventoryID, "job_type": "run"})
	case "adhoccommand":
		scratchInsert(t, database, "main_adhoccommand", map[string]any{"unifiedjob_ptr_id": id, "inventory_id": inventoryID, "job_type": "run", "module_name": "ping"})
	case "inventoryupdate":
		ujt := scratchInsert(t, database, "main_unifiedjobtemplate", map[string]any{"polymorphic_ctype_id": d.CT.ID("main.inventorysource"), "name": fmt.Sprintf("zz-src-%d", id), "status": "never updated"})
		scratchInsert(t, database, "main_inventorysource", map[string]any{"unifiedjobtemplate_ptr_id": ujt, "inventory_id": inventoryID, "source": "ec2"})
		scratchInsert(t, database, "main_inventoryupdate", map[string]any{"unifiedjob_ptr_id": id, "inventory_id": inventoryID, "inventory_source_id": ujt, "source": "ec2"})
	default:
		t.Fatalf("no job kind %s", kind)
	}
	return id
}
