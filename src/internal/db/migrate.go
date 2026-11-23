package db

import (
	"context"
	"embed"
	"fmt"
	"io/fs"
	"log/slog"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// The schema belongs to the old Django application and its migrations; the
// Go code does not change it. What it may add are supplemental objects the
// old application neither needs nor notices, indexes above all, kept in
// migrations/ and recorded in ascender_migrations. Each migration:
//
//   - is additive: the application works, if more slowly, before it runs;
//   - is idempotent (IF NOT EXISTS), since its statements run outside a
//     transaction (CREATE INDEX CONCURRENTLY cannot run in one) and a
//     migration interrupted part-way runs again from the start;
//   - names its objects ascender_*, so they never meet Django's.
//
// A file whose first line is "-- ascender: optional" may fail (pg_trgm
// cannot be created everywhere): it is logged, not recorded, retried at the
// next start, and does not hold back the migrations after it.

//go:embed migrations/*.sql
var migrationFS embed.FS

// Migration is one file of migrations/.
type Migration struct {
	Name       string
	Optional   bool
	Statements []string
}

// migrationLockKey is the advisory lock that lets one process at a time
// migrate ("ascender" in ASCII).
const migrationLockKey int64 = 0x617363656e646572

// Migrations returns the embedded migrations in name order.
func Migrations() ([]Migration, error) {
	names, err := fs.Glob(migrationFS, "migrations/*.sql")
	if err != nil {
		return nil, err
	}
	sort.Strings(names)
	out := make([]Migration, 0, len(names))
	for _, n := range names {
		b, err := migrationFS.ReadFile(n)
		if err != nil {
			return nil, err
		}
		text := string(b)
		m := Migration{Name: strings.TrimSuffix(strings.TrimPrefix(n, "migrations/"), ".sql")}
		m.Optional = strings.HasPrefix(text, "-- ascender: optional")
		m.Statements = splitStatements(text)
		if len(m.Statements) == 0 {
			return nil, fmt.Errorf("migration %s has no statements", m.Name)
		}
		out = append(out, m)
	}
	return out, nil
}

// splitStatements drops comment lines and splits at semicolons ending a
// line, except inside a $$-quoted body (a DO block's), which ends with the
// line that closes it. The files are ours: no semicolons ending a line
// inside strings, and no $$ but the ones quoting a body.
func splitStatements(text string) []string {
	var out []string
	var cur []string
	inBody := false
	for _, line := range strings.Split(text, "\n") {
		t := strings.TrimSpace(line)
		if t == "" || strings.HasPrefix(t, "--") {
			continue
		}
		cur = append(cur, line)
		if strings.Count(t, "$$")%2 == 1 {
			inBody = !inBody
		}
		if !inBody && strings.HasSuffix(t, ";") {
			stmt := strings.TrimSuffix(strings.TrimSpace(strings.Join(cur, "\n")), ";")
			out = append(out, stmt)
			cur = nil
		}
	}
	if s := strings.TrimSpace(strings.Join(cur, "\n")); s != "" {
		out = append(out, s)
	}
	return out
}

// Applied returns the migrations already recorded, with when they ran.
func (d *DB) Applied(ctx context.Context) (map[string]time.Time, error) {
	if err := ensureMigrationTable(ctx, d.Pool); err != nil {
		return nil, err
	}
	rows, err := d.Pool.Query(ctx, `SELECT name, applied FROM ascender_migrations`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]time.Time{}
	for rows.Next() {
		var n string
		var t time.Time
		if err := rows.Scan(&n, &t); err != nil {
			return nil, err
		}
		out[n] = t
	}
	return out, rows.Err()
}

// ensureMigrationTable creates ascender_migrations, which records the
// migrations applied.
func ensureMigrationTable(ctx context.Context, db Querier) error {
	_, err := db.Exec(ctx, `CREATE TABLE IF NOT EXISTS ascender_migrations (name varchar(255) PRIMARY KEY, applied timestamptz NOT NULL)`)
	return err
}

// Migrate applies the pending migrations. With wait it waits for another
// process that is migrating; without, it leaves the work to that process
// and returns. It returns the names it applied.
func (d *DB) Migrate(ctx context.Context, log *slog.Logger, wait bool) ([]string, error) {
	all, err := Migrations()
	if err != nil {
		return nil, err
	}
	conn, err := d.Pool.Acquire(ctx)
	if err != nil {
		return nil, err
	}
	defer conn.Release()
	// Waiting polls rather than blocking in pg_advisory_lock: CREATE INDEX
	// CONCURRENTLY in the session holding the lock waits for every running
	// statement to finish, a blocked lock request included, which deadlocks.
	for logged := false; ; {
		var got bool
		if err := conn.QueryRow(ctx, `SELECT pg_try_advisory_lock($1)`, migrationLockKey).Scan(&got); err != nil {
			return nil, err
		}
		if got {
			break
		}
		if !wait {
			log.Info("schema migrations: another process is applying them")
			return nil, nil
		}
		if !logged {
			log.Info("schema migrations: waiting for another process applying them")
			logged = true
		}
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(2 * time.Second):
		}
	}
	// The lock and the settings belong to the session: undo both before
	// the connection goes back to the pool.
	defer func() {
		bg := context.Background()
		_, _ = conn.Exec(bg, `RESET statement_timeout`)
		_, _ = conn.Exec(bg, `SELECT pg_advisory_unlock($1)`, migrationLockKey)
	}()
	// Building an index on a large table takes as long as it takes.
	if _, err := conn.Exec(ctx, `SET statement_timeout = 0`); err != nil {
		return nil, err
	}
	if err := ensureMigrationTable(ctx, conn); err != nil {
		return nil, err
	}
	done := map[string]bool{}
	rows, err := conn.Query(ctx, `SELECT name FROM ascender_migrations`)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var n string
		if err := rows.Scan(&n); err != nil {
			rows.Close()
			return nil, err
		}
		done[n] = true
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	var applied []string
	for _, m := range all {
		if done[m.Name] {
			continue
		}
		start := time.Now()
		log.Info("schema migration: applying", "migration", m.Name)
		if err := applyMigration(ctx, conn, m); err != nil {
			if m.Optional && ctx.Err() == nil {
				log.Warn("schema migration: optional migration failed; retried at the next start", "migration", m.Name, "err", err)
				continue
			}
			return applied, fmt.Errorf("migration %s: %w", m.Name, err)
		}
		if _, err := conn.Exec(ctx, `INSERT INTO ascender_migrations (name, applied) VALUES ($1, now()) ON CONFLICT (name) DO NOTHING`, m.Name); err != nil {
			return applied, err
		}
		log.Info("schema migration: applied", "migration", m.Name, "took", time.Since(start).Round(time.Millisecond))
		applied = append(applied, m.Name)
	}
	return applied, nil
}

var concurrentIndexRe = regexp.MustCompile(`(?i)^CREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY\s+IF\s+NOT\s+EXISTS\s+(\w+)`)

func applyMigration(ctx context.Context, conn *pgxpool.Conn, m Migration) error {
	for _, stmt := range m.Statements {
		// An interrupted CREATE INDEX CONCURRENTLY leaves an invalid index
		// behind, which IF NOT EXISTS would then accept: drop it first.
		if sm := concurrentIndexRe.FindStringSubmatch(stmt); sm != nil {
			var invalid bool
			err := conn.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
				WHERE c.relname = $1 AND c.relnamespace = 'public'::regnamespace AND NOT i.indisvalid)`, sm[1]).Scan(&invalid)
			if err != nil {
				return err
			}
			if invalid {
				if _, err := conn.Exec(ctx, `DROP INDEX CONCURRENTLY IF EXISTS `+sm[1]); err != nil {
					return err
				}
			}
		}
		if _, err := conn.Exec(ctx, stmt); err != nil {
			return err
		}
	}
	return nil
}

// MigrateInBackground applies pending migrations without holding up the
// caller, logging the outcome. Migrations only add, so the process serves
// while they run.
func (d *DB) MigrateInBackground(ctx context.Context, log *slog.Logger) {
	go func() {
		if _, err := d.Migrate(ctx, log, false); err != nil && ctx.Err() == nil {
			log.Error("schema migrations", "err", err)
		}
	}()
}
