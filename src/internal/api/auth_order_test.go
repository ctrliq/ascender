package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/auth"
)

// A request carrying both a bearer token and a session cookie acts as the
// token, with its scope, as DRF's authentication classes ran (OAuth2
// before the session); an unknown token falls through to the session.
func TestBearerTokenBeforeSession(t *testing.T) {
	d := newDBServer(t, "zz-auth-order-test")
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
		if err := d.DB.Tx(ctx, func(tx pgx.Tx) error {
			return d.Cascade.Delete(ctx, tx, "main_oauth2accesstoken", "id", []int64{tok.ID})
		}); err != nil {
			t.Errorf("delete token: %v", err)
		}
	})
	authWith := func(token string) *auth.User {
		t.Helper()
		r := httptest.NewRequest("GET", "/api/v2/me/", nil)
		r.AddCookie(&http.Cookie{Name: d.Cfg.SessionCookieName, Value: sess.Key})
		r.Header.Set("Authorization", "Bearer "+token)
		u, err := d.Authenticate(httptest.NewRecorder(), r)
		if err != nil {
			t.Fatal(err)
		}
		return u
	}
	u := authWith(tok.Token)
	if u == nil || u.AuthMethod != "token" || len(u.OAuthScopes) != 1 || u.OAuthScopes[0] != "read" {
		t.Errorf("token and session: %+v", u)
	}
	if u := authWith("zz-no-such-token"); u == nil || u.AuthMethod != "session" {
		t.Errorf("unknown token and session: %+v", u)
	}
}
