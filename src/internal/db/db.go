// Package db owns the PostgreSQL connection pool and the small helpers the
// rest of the application uses to run queries against the schema the old
// Django application created. No ORM: the SQL is written by hand against the
// existing tables, so a database the old application used upgrades in place.
package db

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"log/slog"
	"strings"
)

// DB wraps the pool.
type DB struct {
	Pool *pgxpool.Pool
}

// Open connects and verifies the connection.
func Open(ctx context.Context, url string) (*DB, error) {
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		return nil, fmt.Errorf("parse database url: %w", err)
	}
	maxConns, err := envInt("ASCENDER_DB_MAX_CONNS", 20)
	if err != nil {
		return nil, err
	}
	cfg.MaxConns = int32(maxConns)
	cfg.MinConns = 2
	// ASCENDER_DB_STATEMENT_TIMEOUT (seconds; unset, the default, for none)
	// bounds each statement on the server: for the web process, where a
	// request's filters (a __regex) decide the work. Migrations lift it for
	// their own session.
	timeout, err := envInt("ASCENDER_DB_STATEMENT_TIMEOUT", 0)
	if err != nil {
		return nil, err
	}
	if timeout > 0 {
		cfg.ConnConfig.RuntimeParams["statement_timeout"] = fmt.Sprintf("%ds", timeout)
	}
	cfg.ConnConfig.Tracer = tracer{}
	cfg.MaxConnLifetime = time.Hour
	cfg.MaxConnIdleTime = 10 * time.Minute
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("connect: %w", err)
	}
	pctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	if err := pool.Ping(pctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping: %w", err)
	}
	return &DB{Pool: pool}, nil
}

// envInt reads a positive integer from the environment; a malformed value
// is an error naming the variable rather than a silent default.
func envInt(key string, def int) (int, error) {
	v := os.Getenv(key)
	if v == "" {
		return def, nil
	}
	n, err := strconv.Atoi(v)
	if err != nil || n <= 0 {
		return 0, fmt.Errorf("%s=%q: not a positive integer", key, v)
	}
	return n, nil
}

// Close releases the pool.
func (d *DB) Close() { d.Pool.Close() }

// Querier is satisfied by both the pool and a transaction so query code can
// run inside or outside a transaction without knowing which.
type Querier interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// Tx runs fn inside a transaction, committing when it returns nil. The
// transaction is rolled back on an error and on a panic, which would
// otherwise leave the connection checked out and idle in transaction.
// AfterCommit hooks registered on tx run once it commits.
func (d *DB) Tx(ctx context.Context, fn func(tx pgx.Tx) error) error {
	tx, err := Begin(ctx, d.Pool)
	if err != nil {
		return err
	}
	// A no-op after Commit; uncancelled so a dropped request still rolls back.
	defer func() { _ = tx.Rollback(context.WithoutCancel(ctx)) }()
	if err := fn(tx); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// IsNoRows reports whether err is pgx.ErrNoRows.
func IsNoRows(err error) bool { return errors.Is(err, pgx.ErrNoRows) }

// IsUndefinedTable reports a missing table (42P01): one an Ascender
// migration creates, before that migration has run.
func IsUndefinedTable(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "42P01"
}

// IsUniqueViolation reports whether err is a unique constraint failure.
func IsUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}

// Collect reads every row with fn, which scans one row into a T.
func Collect[T any](rows pgx.Rows, fn func(pgx.Rows) (T, error)) ([]T, error) {
	defer rows.Close()
	var out []T
	for rows.Next() {
		v, err := fn(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

// Exists reports whether query, a SELECT, returns a row. Unlike a bare
// QueryRow(...).Scan whose error is dropped, a failed query is an error,
// not "no".
func Exists(ctx context.Context, q Querier, query string, args ...any) (bool, error) {
	var ok bool
	err := q.QueryRow(ctx, `SELECT EXISTS (`+query+`)`, args...).Scan(&ok)
	return ok, err
}

// ScanOne scans the single row of query into dest, reporting false
// without an error when there is no row.
func ScanOne(ctx context.Context, q Querier, query string, args []any, dest ...any) (bool, error) {
	err := q.QueryRow(ctx, query, args...).Scan(dest...)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	return err == nil, err
}

// Tolerant wraps q for single-row lookups whose callers carry on without
// the row (a display value, an existence check that fails closed) and so
// drop Scan's error: "no row" stays silent, any other failure is logged
// rather than lost.
func Tolerant(q Querier) Querier { return tolerant{q} }

type tolerant struct{ Querier }

func (t tolerant) QueryRow(ctx context.Context, sql string, args ...any) pgx.Row {
	return tolerantRow{t.Querier.QueryRow(ctx, sql, args...), sql}
}

type tolerantRow struct {
	pgx.Row
	sql string
}

func (r tolerantRow) Scan(dest ...any) error {
	err := r.Row.Scan(dest...)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) && !errors.Is(err, context.Canceled) {
		slog.Error("lookup failed", "err", err, "sql", firstLine(r.sql))
	}
	return err
}

// firstLine shortens a statement for a log record.
func firstLine(sql string) string {
	if i := strings.IndexByte(sql, '\n'); i >= 0 {
		sql = sql[:i]
	}
	if len(sql) > 200 {
		sql = sql[:200]
	}
	return sql
}
