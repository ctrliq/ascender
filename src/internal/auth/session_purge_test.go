package auth

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// PurgeExpiredSessions and CreateSessionData against a real database
// (ASCENDER_TEST_DATABASE_URL): a session is created with its membership,
// and an expired one goes with its membership while a live one stays.
func TestPurgeExpiredSessions(t *testing.T) {
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
		VALUES ('!', false, 'zz-session-purge', '', '', '', false, true, now()) RETURNING id`).Scan(&uid); err != nil {
		t.Fatal(err)
	}
	defer func() {
		_ = DeleteUserSessions(ctx, pool, uid)
		_, _ = pool.Exec(ctx, `DELETE FROM auth_user WHERE id = $1`, uid)
	}()
	old, err := CreateSessionData(ctx, pool, uid, -time.Minute, nil)
	if err != nil {
		t.Fatal(err)
	}
	live, err := CreateSessionData(ctx, pool, uid, time.Hour, nil)
	if err != nil {
		t.Fatal(err)
	}
	count := func(key string) (sessions, members int) {
		if err := pool.QueryRow(ctx, `SELECT (SELECT count(*) FROM django_session WHERE session_key = $1), (SELECT count(*) FROM main_usersessionmembership WHERE session_id = $1)`, key).Scan(&sessions, &members); err != nil {
			t.Fatal(err)
		}
		return
	}
	if s, m := count(old.Key); s != 1 || m != 1 {
		t.Fatalf("created session: %d rows, %d memberships", s, m)
	}
	if err := PurgeExpiredSessions(ctx, pool); err != nil {
		t.Fatal(err)
	}
	if s, m := count(old.Key); s != 0 || m != 0 {
		t.Errorf("expired session left: %d rows, %d memberships", s, m)
	}
	if s, m := count(live.Key); s != 1 || m != 1 {
		t.Errorf("live session: %d rows, %d memberships", s, m)
	}
}
