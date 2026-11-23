package db

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"
)

func TestBaselineLevel(t *testing.T) {
	level := BaselineLevel()
	apps := map[string]string{}
	for _, m := range level {
		if _, dup := apps[m.App]; dup {
			t.Errorf("app %s is in the level twice", m.App)
		}
		apps[m.App] = m.Name
	}
	if apps["main"] != "0233_job_monitor_lease" {
		t.Errorf("main is at %q", apps["main"])
	}
	// The dump is sent to the server as it is: nothing in it may be psql's.
	for i, line := range strings.Split(baselineSQL, "\n") {
		if strings.HasPrefix(line, `\`) {
			t.Fatalf("baseline.sql line %d is a psql command: %s", i+1, line)
		}
	}
	// It records the level it is at, which is what the check reads.
	for _, m := range level {
		if !strings.Contains(baselineSQL, fmt.Sprintf("'%s', '%s'", m.App, m.Name)) {
			t.Errorf("baseline.sql does not record %s", m)
		}
	}
	// What belongs to one installation is not carried in the dump.
	for _, s := range []string{"INSERT INTO public.conf_setting", "INSERT INTO public.dab_resource_registry_serviceid", "INSERT INTO public.auth_user"} {
		if strings.Contains(baselineSQL, s) {
			t.Errorf("baseline.sql carries rows it should not: %s", s)
		}
	}
}

// scratchDatabase creates an empty database beside the test database and
// returns a pool on it; the test is skipped where that is not allowed.
func scratchDatabase(t *testing.T) *DB {
	t.Helper()
	base := os.Getenv("ASCENDER_TEST_DATABASE_URL")
	if base == "" {
		t.Skip("ASCENDER_TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	admin, err := Open(ctx, base)
	if err != nil {
		t.Fatal(err)
	}
	name := fmt.Sprintf("zz_baseline_test_%d", time.Now().UnixNano())
	if _, err := admin.Pool.Exec(ctx, `CREATE DATABASE `+name); err != nil {
		admin.Close()
		t.Skipf("cannot create a scratch database: %v", err)
	}
	u, err := url.Parse(base)
	if err != nil {
		t.Fatal(err)
	}
	u.Path = "/" + name
	d, err := Open(ctx, u.String())
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
	return d
}

func TestEnsureSchema(t *testing.T) {
	d := scratchDatabase(t)
	ctx := context.Background()
	log := slog.New(slog.NewTextHandler(io.Discard, nil))

	created, err := d.EnsureSchema(ctx, log)
	if err != nil || !created {
		t.Fatalf("an empty database: created %v, err %v", created, err)
	}
	// The session the dump ran in is gone: the pool's connections still
	// find the tables without naming the schema.
	var tables, credentialTypes, singletons, permissions int
	var installUUID string
	if err := d.Pool.QueryRow(ctx, `SELECT (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')),
		(SELECT count(*) FROM main_credentialtype WHERE managed), (SELECT count(*) FROM main_rbac_roles WHERE singleton_name IS NOT NULL),
		(SELECT count(*) FROM auth_permission), (SELECT value #>> '{}' FROM conf_setting WHERE key = 'INSTALL_UUID')`).
		Scan(&tables, &credentialTypes, &singletons, &permissions, &installUUID); err != nil {
		t.Fatal(err)
	}
	if tables < 170 || credentialTypes < 30 || singletons != 2 || permissions == 0 || len(installUUID) != 36 {
		t.Errorf("after the baseline: %d tables, %d managed credential types, %d singleton roles, %d permissions, INSTALL_UUID %q",
			tables, credentialTypes, singletons, permissions, installUUID)
	}
	// Sequences are where the rows left them: the next content type does
	// not collide with one of the baseline's.
	if _, err := d.Pool.Exec(ctx, `INSERT INTO django_content_type (app_label, model) VALUES ('zz', 'zz')`); err != nil {
		t.Errorf("insert after the baseline: %v", err)
	}

	// A second process finds the schema there and at the level.
	if created, err := d.EnsureSchema(ctx, log); err != nil || created {
		t.Fatalf("a database with the schema: created %v, err %v", created, err)
	}
	if _, err := d.Migrate(ctx, log, true); err != nil {
		t.Fatalf("this application's migrations on the baseline: %v", err)
	}

	// A database the Django application stopped migrating earlier is refused,
	// by the migration it lacks.
	if _, err := d.Pool.Exec(ctx, `DELETE FROM django_migrations WHERE app = 'main' AND name = '0233_job_monitor_lease'`); err != nil {
		t.Fatal(err)
	}
	_, err = d.EnsureSchema(ctx, log)
	var below *BelowLevelError
	if !errors.As(err, &below) || len(below.Missing) != 1 || below.Missing[0].String() != "main.0233_job_monitor_lease" {
		t.Fatalf("a database below the level: %v", err)
	}
}

func TestEnsureSchemaRefusesAForeignDatabase(t *testing.T) {
	d := scratchDatabase(t)
	ctx := context.Background()
	if _, err := d.Pool.Exec(ctx, `CREATE TABLE something (id integer)`); err != nil {
		t.Fatal(err)
	}
	created, err := d.EnsureSchema(ctx, slog.New(slog.NewTextHandler(io.Discard, nil)))
	if !errors.Is(err, ErrForeignSchema) || created {
		t.Fatalf("created %v, err %v", created, err)
	}
	var n int
	if err := d.Pool.QueryRow(ctx, `SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r'`).Scan(&n); err != nil || n != 1 {
		t.Fatalf("tables after the refusal: %d, %v", n, err)
	}
}
