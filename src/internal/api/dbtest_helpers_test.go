package api

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http/httptest"
	"os"
	"sync"
	"testing"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/activity"
	"github.com/ctrliq/ascender/internal/auth"
	"github.com/ctrliq/ascender/internal/config"
	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/models"
	"github.com/ctrliq/ascender/internal/settings"
)

// dbServer is a Server against ASCENDER_TEST_DATABASE_URL (the test is
// skipped without it), acting as a throwaway zz superuser. The activity
// stream entries it writes and the user are removed when the test ends;
// the test removes its own objects.
type dbServer struct {
	*Server
	t    *testing.T
	user *auth.User

	mu       sync.Mutex
	activity []int64
}

func newDBServer(t *testing.T, username string) *dbServer {
	t.Helper()
	url := os.Getenv("ASCENDER_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("ASCENDER_TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	database, err := db.Open(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	cts, err := models.LoadContentTypes(ctx, database.Pool)
	if err != nil {
		t.Fatal(err)
	}
	cascader, err := models.LoadCascader(ctx, database.Pool)
	if err != nil {
		t.Fatal(err)
	}
	registry, err := settings.LoadRegistry()
	if err != nil {
		t.Fatal(err)
	}
	cfg := &config.Config{SecretKey: "zz-test-secret", ClusterHostID: "zz-test", SessionCookieName: "zz_sessionid", Version: "test"}
	d := &dbServer{t: t}
	d.Server = &Server{Cfg: cfg, DB: database, Settings: settings.NewStore(database, registry, cfg.SecretKey), CT: cts,
		Roles: models.RoleFactory{CT: cts}, Cascade: cascader, Activity: activity.New("zz-test"), Log: slog.Default()}
	d.Activity.Written = func(_ context.Context, _ db.Querier, id int64, _ activity.Entry) {
		d.mu.Lock()
		d.activity = append(d.activity, id)
		d.mu.Unlock()
	}
	var uid int64
	if err := database.Pool.QueryRow(ctx, `INSERT INTO auth_user (password, is_superuser, username, first_name, last_name, email, is_staff, is_active, date_joined)
		VALUES ('!', true, $1, '', '', '', false, true, now()) RETURNING id`, username).Scan(&uid); err != nil {
		t.Fatal(err)
	}
	if d.user, err = auth.UserByID(ctx, database.Pool, uid); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		d.StopBackground(0)
		err := database.Tx(ctx, func(tx pgx.Tx) error {
			d.mu.Lock()
			ids := d.activity
			d.mu.Unlock()
			if err := cascader.Delete(ctx, tx, "main_activitystream", "id", ids); err != nil {
				return err
			}
			// Saving the (superuser) test user syncs it into the System
			// Administrator role, as the old post_save did.
			if _, err := tx.Exec(ctx, `DELETE FROM main_rbac_roles_members WHERE user_id = $1`, uid); err != nil {
				return err
			}
			_, err := tx.Exec(ctx, `DELETE FROM auth_user WHERE id = $1`, uid)
			return err
		})
		if err != nil {
			t.Errorf("cleanup: %v", err)
		}
		database.Close()
	})
	return d
}

// do sends a JSON request as the test user and returns the status and the
// body.
func (d *dbServer) do(method, path string, body any) (int, string) {
	d.t.Helper()
	var rd io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			d.t.Fatal(err)
		}
		rd = bytes.NewReader(b)
	}
	r := httptest.NewRequest(method, path, rd)
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("Accept", "application/json")
	r = r.WithContext(auth.WithUser(r.Context(), d.user))
	w := httptest.NewRecorder()
	d.Routes().ServeHTTP(w, r)
	return w.Code, w.Body.String()
}

// id reads the "id" of a JSON object response.
func (d *dbServer) id(body string) int64 {
	d.t.Helper()
	var v struct {
		ID int64 `json:"id"`
	}
	if err := json.Unmarshal([]byte(body), &v); err != nil || v.ID == 0 {
		d.t.Fatalf("no id in %s", body)
	}
	return v.ID
}

// expect checks a response's status and, when want is not empty, its body.
func (d *dbServer) expect(status int, body string, wantStatus int, want string) {
	d.t.Helper()
	if status != wantStatus || (want != "" && body != want) {
		d.t.Fatalf("got %d %s, want %d %s", status, body, wantStatus, want)
	}
}

func dbExistsQ(q db.Querier, sql string, args ...any) (bool, error) {
	return db.Exists(context.Background(), q, sql, args...)
}
