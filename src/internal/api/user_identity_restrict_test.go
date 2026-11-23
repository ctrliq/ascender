package api

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"testing"
)

// With RESTRICT_USER_IDENTITY_TO_SUPERUSERS, only a superuser sets a new
// user's email or changes a username or an email, the viewer's own
// included; other fields, and unchanged values, stay editable.
func TestRestrictUserIdentityToSuperusers(t *testing.T) {
	d := newDBServer(t, "zz-identity-restrict-test")
	ctx := context.Background()
	self := fmt.Sprintf("/api/v2/users/%d/", d.user.ID)
	d.user.IsSuperuser = false
	// Editing the user gives it a profile, which goes before the user.
	t.Cleanup(func() { _, _ = d.Q().Exec(ctx, `DELETE FROM main_profile WHERE user_id = $1`, d.user.ID) })

	st, body := d.do("PATCH", self, map[string]any{"email": "zz-before@example.com"})
	d.expect(st, body, http.StatusOK, "")

	file := filepath.Join(t.TempDir(), "settings.json")
	if err := os.WriteFile(file, []byte(`{"RESTRICT_USER_IDENTITY_TO_SUPERUSERS": true}`), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := d.Settings.LoadFile(file); err != nil {
		t.Fatal(err)
	}
	st, body = d.do("PATCH", self, map[string]any{"email": "zz-after@example.com"})
	d.expect(st, body, http.StatusBadRequest, `{"email":["Only a superuser can change the email of a user."]}`)
	// Renaming (an organization administrator's, here checked on the
	// validator: a user may not rename itself anyway).
	f := NewForm(NewOMap().Set("username", "zz-identity-renamed"), true)
	v := &userWrite{Username: d.user.Username, Email: "zz-before@example.com"}
	d.userFromForm(ctx, f, v, d.user, d.user)
	if got := f.Errs["username"]; len(got) != 1 || got[0] != "Only a superuser can change the username of a user." {
		t.Errorf("rename: %v", f.Errs)
	}
	st, body = d.do("PATCH", self, map[string]any{"email": "zz-before@example.com", "first_name": "Zz"})
	d.expect(st, body, http.StatusOK, "")

	// A new user: the username is anyone's to choose, the email is not.
	f = NewForm(NewOMap().Set("username", "zz-identity-new").Set("email", "zz-new@example.com"), false)
	v = &userWrite{}
	d.userFromForm(ctx, f, v, nil, d.user)
	if got := f.Errs["email"]; len(got) != 1 || got[0] != "Only a superuser can set the email of a user." || f.Errs.Has("username") {
		t.Errorf("new user: %v", f.Errs)
	}

	d.user.IsSuperuser = true
	st, body = d.do("PATCH", self, map[string]any{"email": "zz-after@example.com"})
	d.expect(st, body, http.StatusOK, "")
}
