package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/auth"
)

// Once local logins are disabled, a local-only user's session ends and
// their tokens stop working (DisableLocalAuthMiddleware and the
// disable_local_auth signal). The setting comes from this test server's
// own settings file, so no other process sees it.
func TestDisableLocalAuthEndsSessionsAndTokens(t *testing.T) {
	d := newDBServer(t, "zz-disable-local-auth")
	ctx := context.Background()
	sess, err := auth.CreateSessionData(ctx, d.Q(), d.user.ID, time.Hour, map[string]any{})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = auth.DeleteSession(ctx, d.Q(), sess.Key) })
	st, resp := d.do("POST", fmt.Sprintf("/api/v2/users/%d/personal_tokens/", d.user.ID), map[string]any{"scope": "read"})
	d.expect(st, resp, http.StatusCreated, "")
	var tok struct {
		ID    int64  `json:"id"`
		Token string `json:"token"`
	}
	if err := json.Unmarshal([]byte(resp), &tok); err != nil || tok.Token == "" {
		t.Fatalf("token: %v %s", err, resp)
	}
	t.Cleanup(func() {
		// The cascade removes the token's activity links with it.
		if err := d.DB.Tx(ctx, func(tx pgx.Tx) error {
			return d.Cascade.Delete(ctx, tx, "main_oauth2accesstoken", "id", []int64{tok.ID})
		}); err != nil {
			t.Errorf("delete token: %v", err)
		}
	})

	authAs := func(set func(*http.Request)) *auth.User {
		t.Helper()
		r := httptest.NewRequest("GET", "/api/v2/me/", nil)
		set(r)
		u, err := d.Authenticate(httptest.NewRecorder(), r)
		if err != nil {
			t.Fatal(err)
		}
		return u
	}
	withSession := func(r *http.Request) { r.AddCookie(&http.Cookie{Name: d.Cfg.SessionCookieName, Value: sess.Key}) }
	withToken := func(r *http.Request) { r.Header.Set("Authorization", "Bearer "+tok.Token) }
	if u := authAs(withSession); u == nil || u.ID != d.user.ID {
		t.Fatalf("session before: %v", u)
	}
	if u := authAs(withToken); u == nil || u.ID != d.user.ID {
		t.Fatalf("token before: %v", u)
	}

	file := filepath.Join(t.TempDir(), "settings.json")
	if err := os.WriteFile(file, []byte(`{"DISABLE_LOCAL_AUTH": true}`), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := d.Settings.LoadFile(file); err != nil {
		t.Fatal(err)
	}
	if u := authAs(withToken); u != nil {
		t.Errorf("token still authenticates %s", u.Username)
	}
	if u := authAs(withSession); u != nil {
		t.Errorf("session still authenticates %s", u.Username)
	}
	if _, err := auth.GetSession(ctx, d.Q(), sess.Key); err == nil {
		t.Error("the session was not deleted")
	}
}
