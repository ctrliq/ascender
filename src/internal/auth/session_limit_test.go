package auth

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/ctrliq/ascender/internal/db"
	"github.com/jackc/pgx/v5/pgxpool"
)

// CreateSession is CreateSessionData without session data.
func CreateSession(ctx context.Context, q db.Querier, userID int64, lifetime time.Duration) (*Session, error) {
	return CreateSessionData(ctx, q, userID, lifetime, nil)
}

// DeleteUserSessions logs a user out everywhere.
func DeleteUserSessions(ctx context.Context, q db.Querier, userID int64) error {
	return DeleteUserSessionsExcept(ctx, q, userID, "")
}

// ExpireSessionsOverLimit against a real database (ASCENDER_TEST_DATABASE_URL,
// skipped without it): a throwaway user with four sessions keeps its two
// newest. The user and its sessions are removed afterwards.
func TestExpireSessionsOverLimit(t *testing.T) {
	url := os.Getenv("ASCENDER_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("ASCENDER_TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	var uid int64
	if err := pool.QueryRow(ctx, `INSERT INTO auth_user (password, is_superuser, username, first_name, last_name, email, is_staff, is_active, date_joined)
		VALUES ('!', false, 'zz-session-limit', '', '', '', false, true, now()) RETURNING id`).Scan(&uid); err != nil {
		t.Fatal(err)
	}
	defer func() {
		var keys []string
		rows, _ := pool.Query(ctx, `SELECT session_id FROM main_usersessionmembership WHERE user_id = $1`, uid)
		for rows != nil && rows.Next() {
			var k string
			_ = rows.Scan(&k)
			keys = append(keys, k)
		}
		if rows != nil {
			rows.Close()
		}
		_, _ = pool.Exec(ctx, `DELETE FROM main_usersessionmembership WHERE user_id = $1`, uid)
		_, _ = pool.Exec(ctx, `DELETE FROM django_session WHERE session_key = ANY($1)`, keys)
		_, _ = pool.Exec(ctx, `DELETE FROM auth_user WHERE id = $1`, uid)
	}()
	var keys []string
	for i := 0; i < 4; i++ {
		s, err := CreateSession(ctx, pool, uid, time.Hour)
		if err != nil {
			t.Fatal(err)
		}
		keys = append(keys, s.Key)
		time.Sleep(20 * time.Millisecond)
	}
	if n, err := ExpireSessionsOverLimit(ctx, pool, uid, -1); err != nil || n != 0 {
		t.Fatalf("no limit: %d %v", n, err)
	}
	n, err := ExpireSessionsOverLimit(ctx, pool, uid, 2)
	if err != nil || n != 2 {
		t.Fatalf("limit 2: expired %d %v", n, err)
	}
	for i, k := range keys {
		_, err := GetSession(ctx, pool, k)
		if alive := err == nil; alive != (i >= 2) {
			t.Errorf("session %d alive=%v", i, alive)
		}
	}
	// Outside a transaction, everywhere-but-here leaves only the kept one.
	if err := DeleteUserSessionsExcept(ctx, pool, uid, keys[3]); err != nil {
		t.Fatal(err)
	}
	if _, err := GetSession(ctx, pool, keys[2]); err == nil {
		t.Error("session 2 survived")
	}
	if _, err := GetSession(ctx, pool, keys[3]); err != nil {
		t.Error("kept session gone")
	}
	if err := DeleteUserSessions(ctx, pool, uid); err != nil {
		t.Fatal(err)
	}
	if _, err := GetSession(ctx, pool, keys[3]); err == nil {
		t.Error("session 3 survived")
	}
}
