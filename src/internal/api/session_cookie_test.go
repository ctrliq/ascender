package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/ctrliq/ascender/internal/auth"
)

// Every authenticated request sends the session cookie again, to last as
// long as the session it has just extended, and reports that as the
// Session-Timeout the UI counts down: a cookie set only at login ended the
// session SESSION_COOKIE_AGE after logging in however busy the user was.
func TestSessionCookieFollowsIdleTimeout(t *testing.T) {
	d := newDBServer(t, "zz-session-cookie")
	ctx := context.Background()
	sess, err := auth.CreateSessionData(ctx, d.DB.Pool, d.user.ID, time.Hour, map[string]any{auth.SessionHashKey: auth.SessionAuthHash(d.Cfg.SecretKey, d.user)})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { auth.DeleteSession(ctx, d.DB.Pool, sess.Key) })
	life := int(d.sessionLifetime(httptest.NewRequest("GET", "/", nil)) / time.Second)

	get := func() (cookieAge, timeout int) {
		t.Helper()
		r := httptest.NewRequest("GET", "/api/v2/me/", nil)
		r.AddCookie(&http.Cookie{Name: d.Cfg.SessionCookieName, Value: sess.Key})
		w := httptest.NewRecorder()
		d.Routes().ServeHTTP(w, r)
		if w.Code != http.StatusOK {
			t.Fatalf("me: %d %s", w.Code, w.Body.String())
		}
		for _, c := range w.Result().Cookies() {
			if c.Name == d.Cfg.SessionCookieName {
				if c.Value != sess.Key {
					t.Fatalf("cookie value %q, want the session key", c.Value)
				}
				cookieAge = c.MaxAge
			}
		}
		timeout, _ = strconv.Atoi(w.Header().Get("Session-Timeout"))
		return cookieAge, timeout
	}
	setExpiry := func(in time.Duration) {
		t.Helper()
		if _, err := d.DB.Pool.Exec(ctx, `UPDATE django_session SET expire_date = $2 WHERE session_key = $1`, sess.Key, time.Now().Add(in)); err != nil {
			t.Fatal(err)
		}
	}

	// Most of the session gone: the request extends it to the full
	// timeout, and the cookie and the countdown say so.
	setExpiry(time.Duration(life/3) * time.Second)
	age, timeout := get()
	if age < life-1 || age > life || timeout != age {
		t.Fatalf("after extending: cookie Max-Age %d, Session-Timeout %d, want %d", age, timeout, life)
	}
	// Saved a moment ago (within the slack): not written again, and both
	// report what is left rather than the full timeout, so the UI's
	// warning comes before the session really ends.
	setExpiry(time.Duration(life)*time.Second - 5*time.Second)
	age, timeout = get()
	if age < life-6 || age > life-4 || timeout != age {
		t.Fatalf("within the slack: cookie Max-Age %d, Session-Timeout %d, want about %d", age, timeout, life-5)
	}
}
