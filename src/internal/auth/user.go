// Package auth authenticates requests the way the old API did: a session
// cookie, HTTP Basic, or an OAuth2 bearer token, in that order. It also owns
// the session table, the CSRF cookie, and the login/logout endpoints the UI
// and API clients post to.
package auth

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/db"
)

// User is an auth_user row plus the derived facts request handling needs.
type User struct {
	ID          int64
	Username    string
	FirstName   string
	LastName    string
	Email       string
	IsSuperuser bool
	IsStaff     bool
	IsActive    bool
	LastLogin   *time.Time
	DateJoined  time.Time
	password    string

	// IsSystemAuditor is membership of the system_auditor singleton role.
	IsSystemAuditor bool

	// AuthMethod is "session", "basic" or "token".
	AuthMethod string
	// OAuthScopes is set for token authentication ("read", "write").
	OAuthScopes []string
	// SessionKey is set for session authentication.
	SessionKey string
}

// PasswordHash exposes the stored hash for verification only.
func (u *User) PasswordHash() string { return u.password }

// CanWrite reports whether a token-authenticated user holds the write scope.
// Session and basic authenticated users always can.
func (u *User) CanWrite() bool {
	if u == nil {
		return false
	}
	if u.AuthMethod != "token" {
		return true
	}
	for _, s := range u.OAuthScopes {
		if s == "write" {
			return true
		}
	}
	return false
}

const userColumns = `u.id, u.username, u.first_name, u.last_name, u.email, u.is_superuser, u.is_staff, u.is_active, u.last_login, u.date_joined, u.password,
	EXISTS (SELECT 1 FROM main_rbac_roles_members m JOIN main_rbac_roles r ON r.id = m.role_id WHERE m.user_id = u.id AND r.singleton_name = 'system_auditor') AS is_system_auditor`

func scanUser(row pgx.Row) (*User, error) {
	u := &User{}
	err := row.Scan(&u.ID, &u.Username, &u.FirstName, &u.LastName, &u.Email, &u.IsSuperuser, &u.IsStaff, &u.IsActive, &u.LastLogin, &u.DateJoined, &u.password, &u.IsSystemAuditor)
	if err != nil {
		return nil, err
	}
	return u, nil
}

// UserColumns is the select list ScanUser reads (auth_user aliased "u").
const UserColumns = userColumns

// ScanUser reads one row selected with UserColumns.
func ScanUser(row pgx.Row) (*User, error) { return scanUser(row) }

// UserByID loads a user; db.IsNoRows(err) when absent.
func UserByID(ctx context.Context, q db.Querier, id int64) (*User, error) {
	return scanUser(q.QueryRow(ctx, `SELECT `+userColumns+` FROM auth_user u WHERE u.id = $1`, id))
}

// UserByUsername loads a user by name; db.IsNoRows(err) when absent.
func UserByUsername(ctx context.Context, q db.Querier, username string) (*User, error) {
	return scanUser(q.QueryRow(ctx, `SELECT `+userColumns+` FROM auth_user u WHERE u.username = $1`, username))
}

// TouchLastLogin records a successful login.
func TouchLastLogin(ctx context.Context, q db.Querier, id int64) error {
	_, err := q.Exec(ctx, `UPDATE auth_user SET last_login = now() WHERE id = $1`, id)
	return err
}

type ctxKey int

const userKey ctxKey = 1

// WithUser stores the authenticated user on the context.
func WithUser(ctx context.Context, u *User) context.Context {
	return context.WithValue(ctx, userKey, u)
}

// UserFrom returns the authenticated user, or nil for anonymous requests.
func UserFrom(ctx context.Context) *User {
	u, _ := ctx.Value(userKey).(*User)
	return u
}
