package db

import (
	"context"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"sort"
	"strings"
	"time"
)

// The schema's starting point.
//
// The tables are the ones the Django application's migrations created, and
// this application does not run those migrations. It carries their result
// instead: baseline/baseline.sql is the schema, and the rows the migrations
// themselves wrote, of a database migrated to the last of them
// (main.0233_job_monitor_lease), and baseline/level.json names that level,
// the last migration of each Django app. baseline/generate.sh made both from
// the old application.
//
//   - An empty database gets the baseline, in one transaction.
//   - A database the Django application migrated must have reached the
//     level: it records what it applied in django_migrations, which the
//     baseline carries too, so the same check covers both. One that has not
//     is refused, to be brought there by the last release of the Django
//     application, the only thing that can.
//
// Every change to the schema after the level is a migration of this
// application's own (migrations/*.sql).

//go:embed baseline/baseline.sql
var baselineSQL string

//go:embed baseline/level.json
var baselineLevelJSON []byte

// firstRunSQL is what a new database gets besides the dump: the rows that
// belong to one installation (its INSTALL_UUID), and the ones the Django
// application created on first use rather than in a migration.
//
//go:embed baseline/first_run.sql
var firstRunSQL string

// AppliedMigration is a row of django_migrations.
type AppliedMigration struct {
	App  string `json:"app"`
	Name string `json:"name"`
}

func (m AppliedMigration) String() string { return m.App + "." + m.Name }

// BaselineLevel is the level of the baseline: for each Django app, the
// last migration a database must have applied.
func BaselineLevel() []AppliedMigration {
	var level []AppliedMigration
	if err := json.Unmarshal(baselineLevelJSON, &level); err != nil {
		// Compiled in: a bad file is a build defect.
		panic("db: baseline/level.json: " + err.Error())
	}
	return level
}

// BelowLevelError is a database the Django application has not migrated as
// far as this application needs.
type BelowLevelError struct {
	Missing []AppliedMigration
}

func (e *BelowLevelError) Error() string {
	names := make([]string, len(e.Missing))
	for i, m := range e.Missing {
		names[i] = m.String()
	}
	return fmt.Sprintf("the database has not been migrated far enough for this version: it lacks %s. "+
		"Upgrade it with the last release of the Python application first (its migrations end at these), then start this version again",
		strings.Join(names, ", "))
}

// ErrForeignSchema is a database that holds tables but no record of
// Django's migrations: not empty, and not this application's.
var ErrForeignSchema = errors.New("the database is not empty and has no django_migrations table: it is not an Ascender database, and the schema will not be created over what is there")

// baselineLockKey is the advisory lock under which the schema is created,
// so that processes starting together on an empty database create it once.
// It is not the migrations' key: a process holding that one may be
// building an index CONCURRENTLY, which waits for every open statement,
// and a second process waiting on the same key here would deadlock it.
const baselineLockKey int64 = 0x6173632d62617365 // "asc-base"

// EnsureSchema makes sure the database is one this application can work
// against, before anything reads it: an empty database is given the
// baseline, and any other is checked against the baseline's level. It
// reports whether it created the schema.
func (d *DB) EnsureSchema(ctx context.Context, log *slog.Logger) (bool, error) {
	// A connection of its own, closed afterwards: the baseline is a dump,
	// and runs with the session settings a dump sets.
	pooled, err := d.Pool.Acquire(ctx)
	if err != nil {
		return false, err
	}
	conn := pooled.Hijack()
	defer func() {
		cctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = conn.Close(cctx)
	}()
	// Polled rather than blocking in pg_advisory_lock, as Migrate does: a
	// statement left waiting holds a snapshot a concurrent index build
	// would wait for.
	for {
		var got bool
		if err := conn.QueryRow(ctx, `SELECT pg_try_advisory_lock($1)`, baselineLockKey).Scan(&got); err != nil {
			return false, err
		}
		if got {
			break
		}
		select {
		case <-ctx.Done():
			return false, ctx.Err()
		case <-time.After(time.Second):
		}
	}
	// Closing the connection releases the lock too; this is for the log.
	defer func() { _, _ = conn.Exec(context.Background(), `SELECT pg_advisory_unlock($1)`, baselineLockKey) }()

	var hasMigrations bool
	var tables int
	if err := conn.QueryRow(ctx, `SELECT to_regclass('public.django_migrations') IS NOT NULL,
		(SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p'))`).
		Scan(&hasMigrations, &tables); err != nil {
		return false, err
	}
	created := false
	switch {
	case hasMigrations:
	case tables > 0:
		return false, ErrForeignSchema
	default:
		log.Info("schema: the database is empty; creating the schema", "level", levelSummary(BaselineLevel()))
		started := time.Now()
		pg := conn.PgConn()
		if _, err := pg.Exec(ctx, "BEGIN").ReadAll(); err != nil {
			return false, err
		}
		for _, sql := range []string{baselineSQL, firstRunSQL} {
			if _, err := pg.Exec(ctx, sql).ReadAll(); err != nil {
				_, _ = pg.Exec(context.Background(), "ROLLBACK").ReadAll()
				return false, fmt.Errorf("create schema: %w", err)
			}
		}
		if _, err := pg.Exec(ctx, "COMMIT").ReadAll(); err != nil {
			return false, fmt.Errorf("create schema: %w", err)
		}
		created = true
		log.Info("schema: created", "took", time.Since(started).Round(time.Millisecond).String())
	}

	rows, err := conn.Query(ctx, `SELECT app, name FROM public.django_migrations`)
	if err != nil {
		return created, err
	}
	applied := map[AppliedMigration]bool{}
	for rows.Next() {
		var m AppliedMigration
		if err := rows.Scan(&m.App, &m.Name); err != nil {
			rows.Close()
			return created, err
		}
		applied[m] = true
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return created, err
	}
	var missing []AppliedMigration
	for _, m := range BaselineLevel() {
		if !applied[m] {
			missing = append(missing, m)
		}
	}
	if len(missing) > 0 {
		return created, &BelowLevelError{Missing: missing}
	}
	return created, nil
}

// levelSummary names the level by its application migration.
func levelSummary(level []AppliedMigration) string {
	names := make([]string, 0, len(level))
	for _, m := range level {
		if m.App == "main" {
			return m.String()
		}
		names = append(names, m.String())
	}
	sort.Strings(names)
	return strings.Join(names, ", ")
}
