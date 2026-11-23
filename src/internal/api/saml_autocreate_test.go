package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"testing"

	"github.com/ctrliq/ascender/internal/sso"
)

// loadTestSettingsFile gives the test server's own settings file these
// values: no other process sees them, and they shadow whatever the
// database holds.
func loadTestSettingsFile(t *testing.T, d *dbServer, values map[string]any) {
	t.Helper()
	b, err := json.Marshal(values)
	if err != nil {
		t.Fatal(err)
	}
	file := filepath.Join(t.TempDir(), "settings.json")
	if err := os.WriteFile(file, b, 0o600); err != nil {
		t.Fatal(err)
	}
	problems, err := d.Settings.LoadFile(file)
	if err != nil || len(problems) != 0 {
		t.Fatalf("settings file: %v %v", problems, err)
	}
}

// SAML_AUTO_CREATE_OBJECTS off creates no organization or team the maps
// name (create_org_and_teams with can_create False); the maps still apply
// to what exists. On (the default), both are created and the user joins.
func TestSAMLAutoCreateObjects(t *testing.T) {
	d := newDBServer(t, "zz-saml-autocreate")
	ctx := context.Background()
	const org, team = "zz-saml-autocreate-org", "zz-saml-autocreate-team"
	// The API's delete takes the organization's teams and roles with it.
	t.Cleanup(func() {
		var id int64
		if err := d.Q().QueryRow(ctx, `SELECT id FROM main_organization WHERE name = $1`, org).Scan(&id); err != nil {
			return
		}
		if st, body := d.do("DELETE", fmt.Sprintf("/api/v2/organizations/%d/", id), nil); st != http.StatusNoContent {
			t.Errorf("cleanup: %d %s", st, body)
		}
	})
	maps := func(autoCreate, teamMember bool) map[string]any {
		return map[string]any{
			"SAML_AUTO_CREATE_OBJECTS":           autoCreate,
			"SOCIAL_AUTH_SAML_ORGANIZATION_MAP":  map[string]any{org: map[string]any{"users": true}},
			"SOCIAL_AUTH_SAML_TEAM_MAP":          map[string]any{team: map[string]any{"organization": org, "users": teamMember}},
			"SOCIAL_AUTH_SAML_ORGANIZATION_ATTR": map[string]any{"remove": false, "remove_admins": false, "remove_auditors": false},
			"SOCIAL_AUTH_SAML_TEAM_ATTR":         map[string]any{},
		}
	}
	// The file makes its settings read-only; later values replace its own.
	loadTestSettingsFile(t, d, maps(false, true))
	settings := func(autoCreate, teamMember bool) {
		t.Helper()
		for k, v := range maps(autoCreate, teamMember) {
			b, _ := json.Marshal(v)
			if err := d.Settings.SetFile(k, b); err != nil {
				t.Fatal(err)
			}
		}
	}
	populate := func() {
		t.Helper()
		p := &socialPipeline{s: d.Server, ctx: ctx, name: sso.SAML, user: d.user, saml: &samlLogin{attributes: map[string]any{}}}
		if err := p.samlPopulateUser(); err != nil {
			t.Fatal(err)
		}
	}
	exists := func(sql string, args ...any) bool {
		t.Helper()
		ok, err := dbExistsQ(d.Q(), sql, args...)
		if err != nil {
			t.Fatal(err)
		}
		return ok
	}
	orgExists := func() bool { return exists(`SELECT 1 FROM main_organization WHERE name = $1`, org) }
	teamExists := func() bool {
		return exists(`SELECT 1 FROM main_team t JOIN main_organization o ON o.id = t.organization_id WHERE o.name = $1 AND t.name = $2`, org, team)
	}

	populate()
	if orgExists() || teamExists() {
		t.Fatal("created an organization or team with SAML_AUTO_CREATE_OBJECTS off")
	}

	settings(true, true)
	populate()
	if !orgExists() || !teamExists() {
		t.Fatal("no organization and team with SAML_AUTO_CREATE_OBJECTS on")
	}
	member := func(table, where string, args ...any) bool {
		return exists(`SELECT 1 FROM main_rbac_roles_members m JOIN `+table+` x ON x.member_role_id = m.role_id WHERE m.user_id = $1 AND `+where, args...)
	}
	if !member("main_organization", "x.name = $2", d.user.ID, org) || !member("main_team", "x.name = $2", d.user.ID, team) {
		t.Fatal("the user did not join the created organization and team")
	}

	// Off again, the maps still apply to what now exists: removing the
	// user from the team is reconciled although nothing is created.
	settings(false, false)
	populate()
	if member("main_team", "x.name = $2", d.user.ID, team) {
		t.Fatal("the team map was not applied with SAML_AUTO_CREATE_OBJECTS off")
	}
}
