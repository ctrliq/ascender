package api

import (
	"context"
	"net/http"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/auth"
	"github.com/ctrliq/ascender/internal/db"
)

// pathObject describes the object a route names by its {id}: the model
// class whose name the old 404s carried (get_object_or_404 said "No
// JobTemplate matches the given query."), how to read the row, and who
// may read it.
type pathObject[T any] struct {
	// model is the Django model class name.
	model string
	// get reads the row; a missing row is db.IsNoRows.
	get func(ctx context.Context, q db.Querier, id int64) (T, error)
	// readable reports whether c's user, neither a superuser nor a
	// system auditor, may read v.
	readable func(c *SerCtx, v T) bool
}

// notFound is the 404 for the object.
func (o *pathObject[T]) notFound() *APIError { return NotFoundFor(o.model) }

// load reads object id for u: 404 when it does not exist, 403 when u may
// not read it. DRF's get_object found the row, and ModelAccessPermission's
// object check (or a sub-list's check_parent_access) refused it.
func (o *pathObject[T]) load(s *Server, r *http.Request, u *auth.User, id int64) (T, error) {
	var zero T
	v, err := o.get(r.Context(), s.Q(), id)
	if err != nil {
		if db.IsNoRows(err) {
			return zero, o.notFound()
		}
		return zero, err
	}
	if !u.IsSuperuser && !u.IsSystemAuditor && !o.readable(s.NewSerCtx(r, true), v) {
		return zero, ErrForbidden
	}
	return v, nil
}

// fromPath is the preamble of a route on one object: the user (one whose
// token may write, for a write), then the object the {id} names.
func (o *pathObject[T]) fromPath(s *Server, r *http.Request, write bool) (*auth.User, T, error) {
	var zero T
	u, err := requireUser(r, write)
	if err != nil {
		return nil, zero, err
	}
	id, err := PathID(r)
	if err != nil {
		return nil, zero, o.notFound()
	}
	v, err := o.load(s, r, u, id)
	if err != nil {
		return nil, zero, err
	}
	return u, v, nil
}

// found turns a loader's (nil, nil) for a missing row into pgx.ErrNoRows.
func found[T any](v *T, err error) (*T, error) {
	if err == nil && v == nil {
		return nil, pgx.ErrNoRows
	}
	return v, err
}

// scanFirst reads the first row of query with scan; a missing row is
// pgx.ErrNoRows.
func scanFirst[T any](ctx context.Context, q db.Querier, query string, args []any, scan func(pgx.Rows) (any, error)) (T, error) {
	var zero T
	rows, err := q.Query(ctx, query, args...)
	if err != nil {
		return zero, err
	}
	defer rows.Close()
	if !rows.Next() {
		if err := rows.Err(); err != nil {
			return zero, err
		}
		return zero, pgx.ErrNoRows
	}
	v, err := scan(rows)
	if err != nil {
		return zero, err
	}
	return v.(T), nil
}

// parentCheck is the parent check of a sub-list given the parent's id:
// 404 when it does not exist, 403 when the user may not read it.
func (o *pathObject[T]) parentCheck(s *Server) func(r *http.Request, u *auth.User, id int64) error {
	return func(r *http.Request, u *auth.User, id int64) error {
		_, err := o.load(s, r, u, id)
		return err
	}
}

// existsBy is the validator of a form field naming a row of table by
// pkCol: whether the row exists. A validator has no error to return, so a
// failed lookup fails closed and is logged (db.Tolerant).
func (s *Server) existsBy(ctx context.Context, table, pkCol string) func(int64) bool {
	return func(id int64) bool {
		ok, err := db.Exists(ctx, db.Tolerant(s.Q()), `SELECT 1 FROM `+table+` WHERE `+pkCol+` = $1`, id)
		return err == nil && ok
	}
}

// existsIn is existsBy on the id column.
func (s *Server) existsIn(ctx context.Context, table string) func(int64) bool {
	return s.existsBy(ctx, table, "id")
}

// colOf reads one column of table's row id, for display: the zero value
// when there is no such row, a failed lookup logged (db.Tolerant).
func colOf[T any](ctx context.Context, q db.Querier, table, col string, id int64) T {
	var v T
	_ = db.Tolerant(q).QueryRow(ctx, `SELECT `+col+` FROM `+table+` WHERE id = $1`, id).Scan(&v)
	return v
}

// requireUser is RequireWrite for a write, else RequireUser.
func requireUser(r *http.Request, write bool) (*auth.User, error) {
	if write {
		return RequireWrite(r)
	}
	return RequireUser(r)
}
