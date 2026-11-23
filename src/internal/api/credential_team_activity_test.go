package api

import (
	"context"
	"fmt"
	"net/http"
	"testing"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/models"
)

// The activity entries of a credential created with a team owner, against
// a real database. The old CredentialSerializerCreate.create added the
// team's admin and member roles as parents of the credential's admin and
// use roles once the credential was saved, and rbac_activity_stream wrote
// an associate entry for each. The expected entries are what the old app
// wrote (run through its API in a throwaway database): the credential is
// object1, the team object2 with the team role's pk in the changes, under
// the team role's relationship, linked to the credential, the team and
// that role.
func TestCredentialTeamOwnerActivity(t *testing.T) {
	d := newDBServer(t, "zz-cred-team-activity-test")
	ctx := context.Background()
	st, body := d.do("POST", "/api/v2/organizations/", map[string]any{"name": "zz-cred-team-activity-test"})
	d.expect(st, body, http.StatusCreated, "")
	org := d.id(body)
	var cred int64
	t.Cleanup(func() {
		err := d.DB.Tx(ctx, func(tx pgx.Tx) error {
			if cred != 0 {
				if err := models.DeleteCredential(ctx, tx, cred, d.CT, d.Cascade); err != nil {
					return err
				}
			}
			return models.DeleteOrganization(ctx, tx, org, d.CT, d.Cascade)
		})
		if err != nil {
			t.Errorf("cleanup: %v", err)
		}
	})
	st, body = d.do("POST", "/api/v2/teams/", map[string]any{"name": "zz-cred-team-activity-test", "organization": org})
	d.expect(st, body, http.StatusCreated, "")
	team := d.id(body)
	var adminRole, memberRole, ssh int64
	if err := d.Q().QueryRow(ctx, `SELECT admin_role_id, member_role_id FROM main_team WHERE id = $1`, team).Scan(&adminRole, &memberRole); err != nil {
		t.Fatal(err)
	}
	if err := d.Q().QueryRow(ctx, `SELECT id FROM main_credentialtype WHERE namespace = 'ssh' AND managed`).Scan(&ssh); err != nil {
		t.Skip("no Machine credential type")
	}

	d.mu.Lock()
	seen := len(d.activity)
	d.mu.Unlock()
	st, body = d.do("POST", "/api/v2/credentials/", map[string]any{"name": "zz-cred-team-activity-test", "credential_type": ssh, "team": team, "inputs": map[string]any{"username": "zz"}})
	d.expect(st, body, http.StatusCreated, "")
	cred = d.id(body)
	d.mu.Lock()
	ids := append([]int64(nil), d.activity[seen:]...)
	d.mu.Unlock()

	links := func(table, col string, id int64) string {
		t.Helper()
		ids, err := models.ScanIDs(ctx, d.Q(), `SELECT `+col+` FROM main_activitystream_`+table+` WHERE activitystream_id = $1 ORDER BY 1`, id)
		if err != nil {
			t.Fatal(err)
		}
		return fmt.Sprint(ids)
	}
	var got []string
	for _, id := range ids {
		var op, o1, o2, rel, changes string
		var actor *int64
		if err := d.Q().QueryRow(ctx, `SELECT operation, object1, object2, object_relationship_type, changes, actor_id FROM main_activitystream WHERE id = $1`, id).
			Scan(&op, &o1, &o2, &rel, &changes, &actor); err != nil {
			t.Fatal(err)
		}
		if op == "create" {
			changes = "(create)"
		}
		got = append(got, fmt.Sprintf("%s %s/%s %q %s actor=%v credential=%s team=%s role=%s user=%s organization=%s",
			op, o1, o2, rel, changes, actor != nil && *actor == d.user.ID,
			links("credential", "credential_id", id), links("team", "team_id", id), links("role", "role_id", id), links("user", "user_id", id), links("organization", "organization_id", id)))
	}
	assoc := func(field string, role int64) string {
		return fmt.Sprintf(`associate credential/team "ascender.main.models.organization.Team.%s" {"object1": "credential", "object1_pk": %d, "object2": "team", "object2_pk": %d, "action": "associate", "relationship": "ascender.main.models.rbac.Role_parents"} actor=true credential=[%d] team=[%d] role=[%d] user=[] organization=[]`,
			field, cred, role, cred, team, role)
	}
	want := []string{
		fmt.Sprintf(`create credential/ "" (create) actor=true credential=[%d] team=[] role=[] user=[] organization=[]`, cred),
		assoc("admin_role", adminRole),
		assoc("member_role", memberRole),
	}
	if len(got) != len(want) {
		t.Fatalf("got %d entries, want %d:\n%s", len(got), len(want), fmt.Sprint(got))
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("entry %d:\n got %s\nwant %s", i, got[i], want[i])
		}
	}
}
