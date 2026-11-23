package api

import (
	"bytes"
	"context"
	"fmt"
	"log/slog"
	"regexp"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/crypto"
	"github.com/ctrliq/ascender/internal/models"
)

// createsuperuser and update_password against a real database: the
// administrator is created once, with the password given and its system
// role, and the password changes only when it differs.
func TestCreateSuperuserAndUpdatePassword(t *testing.T) {
	d := newDBServer(t, "zz-manage-commands-test")
	ctx := context.Background()
	const name = "zz-manage-superuser"
	userID := func() (id int64) {
		_ = d.DB.Pool.QueryRow(ctx, `SELECT id FROM auth_user WHERE username = $1`, name).Scan(&id)
		return id
	}
	t.Cleanup(func() {
		if id := userID(); id != 0 {
			d.do("DELETE", fmt.Sprintf("/api/v2/users/%d/", id), nil)
		}
	})

	created, lines, err := d.CreateSuperuser(ctx, name, "zz@example.com", "first-password", false)
	if err != nil || !created || len(lines) != 1 || lines[0] != "Superuser created successfully." {
		t.Fatalf("createsuperuser: created %v, lines %v, err %v", created, lines, err)
	}
	var hash, email string
	var super, inRole bool
	if err := d.DB.Pool.QueryRow(ctx, `SELECT u.password, u.email, u.is_superuser, EXISTS (SELECT 1 FROM main_rbac_roles_members m
		JOIN main_rbac_roles r ON r.id = m.role_id WHERE m.user_id = u.id AND r.singleton_name = 'system_administrator') FROM auth_user u WHERE u.username = $1`, name).
		Scan(&hash, &email, &super, &inRole); err != nil {
		t.Fatal(err)
	}
	if !crypto.CheckPassword("first-password", hash) || email != "zz@example.com" || !super || !inRole {
		t.Fatalf("created user: email %q, superuser %v, in the system role %v, password matches %v", email, super, inRole, crypto.CheckPassword("first-password", hash))
	}

	// A second run is an error, as Django's was, unless it was asked to
	// leave an existing user alone; either way the user is untouched.
	if _, _, err := d.CreateSuperuser(ctx, name, "", "other", false); !IsCommandError(err) {
		t.Fatalf("createsuperuser over an existing user: %v", err)
	}
	created, lines, err = d.CreateSuperuser(ctx, name, "", "other", true)
	if err != nil || created || len(lines) != 1 {
		t.Fatalf("createsuperuser --if-missing: created %v, lines %v, err %v", created, lines, err)
	}
	var after string
	_ = d.DB.Pool.QueryRow(ctx, `SELECT password FROM auth_user WHERE username = $1`, name).Scan(&after)
	if after != hash {
		t.Fatal("an existing user's password was changed")
	}

	if lines, err := d.UpdatePassword(ctx, name, "first-password"); err != nil || len(lines) != 1 || lines[0] != "Password not updated" {
		t.Fatalf("update_password with the same password: %v, %v", lines, err)
	}
	if lines, err := d.UpdatePassword(ctx, name, "second-password"); err != nil || len(lines) != 1 || lines[0] != "Password updated" {
		t.Fatalf("update_password: %v, %v", lines, err)
	}
	_ = d.DB.Pool.QueryRow(ctx, `SELECT password FROM auth_user WHERE username = $1`, name).Scan(&after)
	if !crypto.CheckPassword("second-password", after) {
		t.Fatal("the new password does not verify")
	}
	if _, err := d.UpdatePassword(ctx, "zz-no-such-user", "x"); !IsCommandError(err) {
		t.Fatalf("update_password for a missing user: %v", err)
	}
}

// EnsureAdmin: a new database gets the administrator with a generated
// password, logged once, or with ADMIN_PASSWORD, not logged; another
// process's account is left alone; and ADMIN_PASSWORD is applied at each
// start without rehashing a password the account already has. A new
// database also gets the preload data and the default execution
// environments.
func TestEnsureAdmin(t *testing.T) {
	d := newDBServer(t, "zz-ensure-admin-test")
	ctx := context.Background()
	const name = "zz-ensure-admin"
	saved := adminUsername
	adminUsername = name
	hash := func() (h string) {
		_ = d.DB.Pool.QueryRow(ctx, `SELECT password FROM auth_user WHERE username = $1`, name).Scan(&h)
		return h
	}
	remove := func() {
		var id int64
		if d.DB.Pool.QueryRow(ctx, `SELECT id FROM auth_user WHERE username = $1`, name).Scan(&id) == nil {
			d.do("DELETE", fmt.Sprintf("/api/v2/users/%d/", id), nil)
		}
	}
	remove()
	t.Cleanup(func() { remove(); adminUsername = saved })
	var out bytes.Buffer
	console := slog.New(slog.NewTextHandler(&out, nil))

	// Neither a new database nor a password: nothing.
	if err := d.EnsureAdmin(ctx, false, "", console); err != nil || hash() != "" || out.Len() != 0 {
		t.Fatalf("no-op: err %v, hash %q, log %q", err, hash(), out.String())
	}

	// A new database without a password: a generated one, logged, and the
	// preload data (the Default organization and the managed Ansible
	// Galaxy credential) where there was none.
	galaxyID := func() (id int64) {
		_ = d.DB.Pool.QueryRow(ctx, `SELECT id FROM main_credential WHERE name = 'Ansible Galaxy' AND managed`).Scan(&id)
		return id
	}
	defaultID := func() (id int64) {
		_ = d.DB.Pool.QueryRow(ctx, `SELECT id FROM main_organization WHERE name = 'Default'`).Scan(&id)
		return id
	}
	hadOrg, hadGalaxy := defaultID(), galaxyID()
	hadEEs := map[string]bool{}
	for _, name := range []string{"Control Plane Execution Environment", "Ascender EE (latest)"} {
		var exists bool
		_ = d.DB.Pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM main_executionenvironment WHERE name = $1)`, name).Scan(&exists)
		hadEEs[name] = exists
	}
	if err := d.EnsureAdmin(ctx, true, "", console); err != nil {
		t.Fatal(err)
	}
	if hadGalaxy == 0 {
		if id := galaxyID(); id != 0 {
			t.Cleanup(func() {
				_ = d.DB.Tx(ctx, func(tx pgx.Tx) error { return models.DeleteCredential(ctx, tx, id, d.CT, d.Cascade) })
			})
		}
	}
	if hadOrg == 0 {
		if id := defaultID(); id != 0 {
			t.Cleanup(func() { d.do("DELETE", fmt.Sprintf("/api/v2/organizations/%d/", id), nil) })
		}
	}
	var orgs, linked bool
	_ = d.DB.Pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM main_organization), EXISTS (SELECT 1 FROM main_organizationgalaxycredentialmembership m
		JOIN main_credential c ON c.id = m.credential_id WHERE c.name = 'Ansible Galaxy' AND c.managed)`).Scan(&orgs, &linked)
	if !orgs || (hadOrg == 0 && !linked) {
		t.Fatalf("preload data: an organization %v, the Galaxy credential linked %v; log %q", orgs, linked, out.String())
	}
	// The default execution environments, created pulling only when the
	// image is missing; the control plane's is managed and not deletable.
	for _, name := range []string{"Control Plane Execution Environment", "Ascender EE (latest)"} {
		var id int64
		var image, pull string
		var managed bool
		if err := d.DB.Pool.QueryRow(ctx, `SELECT id, image, pull, managed FROM main_executionenvironment WHERE name = $1 ORDER BY id LIMIT 1`, name).Scan(&id, &image, &pull, &managed); err != nil {
			t.Fatalf("%s: %v", name, err)
		}
		if !hadEEs[name] {
			t.Cleanup(func() {
				_ = d.DB.Tx(ctx, func(tx pgx.Tx) error {
					return d.Cascade.Delete(ctx, tx, "main_executionenvironment", "id", []int64{id})
				})
			})
			if image != "ghcr.io/ctrliq/ascender-ee:latest" || pull != "missing" || managed != (name == "Control Plane Execution Environment") {
				t.Fatalf("%s: image %q, pull %q, managed %v", name, image, pull, managed)
			}
		}
		if managed {
			if code, body := d.do("DELETE", fmt.Sprintf("/api/v2/execution_environments/%d/", id), nil); code != 403 {
				t.Fatalf("deleting the control plane execution environment: %d %s", code, body)
			}
		}
	}
	if id := galaxyID(); id != 0 {
		// Managed: not deletable through the API.
		if code, body := d.do("DELETE", fmt.Sprintf("/api/v2/credentials/%d/", id), nil); code != 403 {
			t.Fatalf("deleting the managed Galaxy credential: %d %s", code, body)
		}
	}
	m := regexp.MustCompile(`password=(\S+)`).FindStringSubmatch(out.String())
	if m == nil || !crypto.CheckPassword(m[1], hash()) {
		t.Fatalf("generated password not logged or not the account's: %q", out.String())
	}
	var super bool
	_ = d.DB.Pool.QueryRow(ctx, `SELECT is_superuser FROM auth_user WHERE username = $1`, name).Scan(&super)
	if !super {
		t.Fatal("the administrator is not a superuser")
	}

	// A second process on the same new database leaves it alone.
	first := hash()
	out.Reset()
	if err := d.EnsureAdmin(ctx, true, "", console); err != nil || hash() != first || out.Len() != 0 {
		t.Fatalf("second creator: err %v, changed %v, log %q", err, hash() != first, out.String())
	}

	// ADMIN_PASSWORD at a later start: applied, then left as it is.
	if err := d.EnsureAdmin(ctx, false, "from-the-file", console); err != nil || !crypto.CheckPassword("from-the-file", hash()) {
		t.Fatalf("password from the file: err %v", err)
	}
	if strings.Contains(out.String(), "from-the-file") {
		t.Fatalf("the password from the file was logged: %q", out.String())
	}
	set := hash()
	if err := d.EnsureAdmin(ctx, false, "from-the-file", console); err != nil || hash() != set {
		t.Fatalf("an unchanged password was rehashed: err %v", err)
	}

	// A new database with ADMIN_PASSWORD: created with it, not logged.
	remove()
	out.Reset()
	if err := d.EnsureAdmin(ctx, true, "given-password", console); err != nil || !crypto.CheckPassword("given-password", hash()) {
		t.Fatalf("new database with a password: err %v", err)
	}
	if strings.Contains(out.String(), "given-password") || !strings.Contains(out.String(), "created") {
		t.Fatalf("log: %q", out.String())
	}
}
