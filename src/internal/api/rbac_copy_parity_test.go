package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/auth"
	"github.com/ctrliq/ascender/internal/models"
	"github.com/ctrliq/ascender/internal/rbac"
)

// grantTo makes user a direct member of the role the query selects for id.
func grantTo(t *testing.T, d *dbServer, userID int64, sql string, id int64) int64 {
	t.Helper()
	ctx := context.Background()
	var role int64
	if err := d.Q().QueryRow(ctx, sql, id).Scan(&role); err != nil {
		t.Fatal(err)
	}
	if err := rbac.AddMember(ctx, d.Q(), role, userID); err != nil {
		t.Fatal(err)
	}
	return role
}

// zzPlainUser inserts a user that is not a superuser.
func zzPlainUser(t *testing.T, d *dbServer, name string) *auth.User {
	t.Helper()
	ctx := context.Background()
	var id int64
	if err := d.Q().QueryRow(ctx, `INSERT INTO auth_user (password, is_superuser, username, first_name, last_name, email, is_staff, is_active, date_joined)
		VALUES ('!', false, $1, '', '', '', false, true, now()) RETURNING id`, name).Scan(&id); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = d.Q().Exec(ctx, `DELETE FROM main_rbac_roles_members WHERE user_id = $1`, id)
		_, _ = d.Q().Exec(ctx, `DELETE FROM main_profile WHERE user_id = $1`, id)
		_, _ = d.Q().Exec(ctx, `DELETE FROM auth_user WHERE id = $1`, id)
	})
	u, err := auth.UserByID(ctx, d.Q(), id)
	if err != nil {
		t.Fatal(err)
	}
	return u
}

// as runs fn with the requests made as u.
func as(d *dbServer, u *auth.User, fn func()) {
	saved := d.user
	d.user = u
	defer func() { d.user = saved }()
	fn()
}

// On a new inventory Ad Hoc grants Use (and so Read), as the old
// ImplicitRoleField parents had it, and Use's implicit parents are Ad Hoc.
func TestInventoryAdhocRoleGrantsUse(t *testing.T) {
	d, _ := newScratchServer(t, "zz-inv-adhoc-use")
	inv, _ := scratchInventory(t, d, "zz-inv-adhoc-use", nil)
	u := zzPlainUser(t, d, "zz-inv-adhoc-user")
	ctx := context.Background()
	adhoc := grantTo(t, d, u.ID, `SELECT adhoc_role_id FROM main_inventory WHERE id = $1`, inv)
	for field, want := range map[string]bool{"adhoc_role": true, "use_role": true, "read_role": true, "update_role": false, "admin_role": false} {
		if got, err := rbac.UserHasRoleOn(ctx, d.Q(), u.ID, d.CT.ID("main.inventory"), inv, field); err != nil || got != want {
			t.Errorf("%s: %v %v, want %v", field, got, err, want)
		}
	}
	var implicit string
	if err := d.Q().QueryRow(ctx, `SELECT r.implicit_parents FROM main_rbac_roles r JOIN main_inventory i ON i.use_role_id = r.id WHERE i.id = $1`, inv).Scan(&implicit); err != nil {
		t.Fatal(err)
	}
	if implicit != fmt.Sprintf("[%d]", adhoc) {
		t.Errorf("use_role implicit_parents %s, want [%d]", implicit, adhoc)
	}
}

// The System Administrator role's members are the superusers, from
// either side and both ways (sync_rbac_to_superuser_status and
// sync_superuser_status_to_rbac).
func TestSystemAdministratorRoleSyncsSuperuser(t *testing.T) {
	d, _ := newScratchServer(t, "zz-sysadmin-sync")
	ctx := context.Background()
	x := zzPlainUser(t, d, "zz-sysadmin-sync-x")
	sa, err := rbac.SingletonRoleID(ctx, d.Q(), rbac.SystemAdministrator)
	if err != nil {
		t.Fatal(err)
	}
	state := func() (super, member bool) {
		t.Helper()
		if err := d.Q().QueryRow(ctx, `SELECT is_superuser, EXISTS (SELECT 1 FROM main_rbac_roles_members WHERE role_id = $2 AND user_id = $1) FROM auth_user WHERE id = $1`, x.ID, sa).Scan(&super, &member); err != nil {
			t.Fatal(err)
		}
		return
	}
	expectState := func(step string, super, member bool) {
		t.Helper()
		if s, m := state(); s != super || m != member {
			t.Errorf("%s: is_superuser %v member %v, want %v %v", step, s, m, super, member)
		}
	}
	roleUsers := fmt.Sprintf("/api/v2/roles/%d/users/", sa)
	userRoles := fmt.Sprintf("/api/v2/users/%d/roles/", x.ID)

	// From the role's side: no activity entry at all.
	mark := lastActivityID(t, d)
	st, body := d.do("POST", roleUsers, map[string]any{"id": x.ID})
	d.expect(st, body, http.StatusNoContent, "")
	expectState("role side add", true, true)
	st, body = d.do("POST", roleUsers, map[string]any{"id": x.ID, "disassociate": true})
	d.expect(st, body, http.StatusNoContent, "")
	expectState("role side remove", false, false)
	if got := activitySince(t, d, mark); len(got) != 0 {
		t.Errorf("role side entries: %v", got)
	}

	// From the user's side: the association, then the user's update.
	mark = lastActivityID(t, d)
	st, body = d.do("POST", userRoles, map[string]any{"id": sa})
	d.expect(st, body, http.StatusNoContent, "")
	expectState("user side add", true, true)
	got := activitySince(t, d, mark)
	if len(got) != 2 {
		t.Fatalf("user side add entries: %v", got)
	}
	// (activitySince does not read the user and role link tables.)
	wantAssoc(t, assocEntry{Operation: got[0].Operation, Object1: got[0].Object1, Object2: got[0].Object2, Relationship: got[0].Relationship, Changes: got[0].Changes,
		Links: []string{fmt.Sprintf("role=%d", sa), fmt.Sprintf("user=%d", x.ID)}}, "associate", "ascender.main.models.rbac.Role_members", "user", x.ID, "role", sa)
	if got[1].Operation != "update" || got[1].Object1 != "user" || fmt.Sprint(got[1].Changes) != "map[is_superuser:[false true]]" {
		t.Errorf("user side add update entry: %v", got[1])
	}
	mark = lastActivityID(t, d)
	st, body = d.do("POST", userRoles, map[string]any{"id": sa, "disassociate": true})
	d.expect(st, body, http.StatusNoContent, "")
	expectState("user side remove", false, false)
	got = activitySince(t, d, mark)
	if len(got) != 2 || got[0].Operation != "disassociate" || fmt.Sprint(got[1].Changes) != "map[is_superuser:[true false]]" {
		t.Errorf("user side remove entries: %v", got)
	}

	// remove() of a superuser who is not a member still clears the flag.
	if _, err := d.Q().Exec(ctx, `UPDATE auth_user SET is_superuser = true WHERE id = $1`, x.ID); err != nil {
		t.Fatal(err)
	}
	st, body = d.do("POST", roleUsers, map[string]any{"id": x.ID, "disassociate": true})
	d.expect(st, body, http.StatusNoContent, "")
	expectState("remove of a non-member", false, false)

	// Saving the user syncs the role to is_superuser, changed or not.
	st, body = d.do("PATCH", fmt.Sprintf("/api/v2/users/%d/", x.ID), map[string]any{"is_superuser": true})
	d.expect(st, body, http.StatusOK, "")
	expectState("is_superuser set", true, true)
	if _, err := d.Q().Exec(ctx, `DELETE FROM main_rbac_roles_members WHERE role_id = $1 AND user_id = $2`, sa, x.ID); err != nil {
		t.Fatal(err)
	}
	st, body = d.do("PATCH", fmt.Sprintf("/api/v2/users/%d/", x.ID), map[string]any{"first_name": "Zz"})
	d.expect(st, body, http.StatusOK, "")
	expectState("other field saved", true, true)
	st, body = d.do("PATCH", fmt.Sprintf("/api/v2/users/%d/", x.ID), map[string]any{"is_superuser": false})
	d.expect(st, body, http.StatusOK, "")
	expectState("is_superuser cleared", false, false)
}

// Disassociating a user who is not a member records the entry all the
// same: remove() signalled every id it was given.
func TestRoleMemberRemoveOfNonMemberRecords(t *testing.T) {
	d, _ := newScratchServer(t, "zz-role-remove-nonmember")
	inv, _ := scratchInventory(t, d, "zz-role-remove-nonmember", nil)
	x := zzPlainUser(t, d, "zz-role-remove-nonmember-x")
	var role int64
	if err := d.Q().QueryRow(context.Background(), `SELECT use_role_id FROM main_inventory WHERE id = $1`, inv).Scan(&role); err != nil {
		t.Fatal(err)
	}
	mark := lastActivityID(t, d)
	st, body := d.do("POST", fmt.Sprintf("/api/v2/roles/%d/users/", role), map[string]any{"id": x.ID, "disassociate": true})
	d.expect(st, body, http.StatusNoContent, "")
	got := activitySince(t, d, mark)
	if len(got) != 1 || got[0].Operation != "disassociate" || got[0].Object1 != "inventory" || got[0].Object2 != "user" {
		t.Errorf("entries: %v", got)
	}
}

func TestNamedURLHelpers(t *testing.T) {
	if got := namedURLEscape("a+b;c/[d]"); got != "a[+]b%3Bc%2F%5Bd%5D" {
		t.Errorf("escape: %s", got)
	}
	for in, want := range map[string]bool{"7": true, "007": true, "0": false, "000": false, "": false, "7a": false, "٣": true, "٠": false, "+7": false} {
		if got := pyPositiveDigits(in); got != want {
			t.Errorf("pyPositiveDigits(%q) = %v", in, got)
		}
	}
	for in, want := range map[string]bool{"7": true, " 7 ": true, "-7": true, "+0": true, "1_000": true, "1__0": false, "_1": false, "1_": false, "": false, "a": false, "٣": true, "7.0": false} {
		if got := pyIntParses(in); got != want {
			t.Errorf("pyIntParses(%q) = %v", in, got)
		}
	}
	for in, want := range map[string]string{"a%2Bb": "a+b", "a%20b": "a b", "%zz": "%zz", "%e2%82%ac": "€", "%e2%82": "\ufffd", "%e2%28%a1": "\ufffd(\ufffd", "%ff%41": "\ufffdA", "50%": "50%", "x%4": "x%4", "é%41": "éA"} {
		if got := pyUnquote(in); got != want {
			t.Errorf("pyUnquote(%q) = %q, want %q", in, got, want)
		}
	}
	kw, ok := parseNamedURL("organizations", "a[+]b")
	if !ok || kw["name"] != "a+b" {
		t.Errorf("parse a[+]b: %v %v", kw, ok)
	}
	if _, ok := parseNamedURL("organizations", "007"); ok {
		t.Error("007 parsed as a name")
	}
	if kw, ok := parseNamedURL("organizations", "000"); !ok || kw["name"] != "000" {
		t.Errorf("000: %v %v", kw, ok)
	}
}

// A name with + resolves through the named_url the API shows; a pk with
// leading zeros is a pk; a refusal through a named URL is a 404; the old
// job template name is unquoted.
func TestNamedURLParity(t *testing.T) {
	d, _ := newScratchServer(t, "zz-named-url-parity")
	org := scratchOrg(t, d, "zz-named+url")
	st, body := d.do("GET", fmt.Sprintf("/api/v2/organizations/%d/", org), nil)
	d.expect(st, body, http.StatusOK, "")
	var o struct {
		Related struct {
			NamedURL string `json:"named_url"`
		} `json:"related"`
	}
	_ = json.Unmarshal([]byte(body), &o)
	if o.Related.NamedURL != "/api/v2/organizations/zz-named[+]url/" {
		t.Fatalf("named_url %q", o.Related.NamedURL)
	}
	for _, path := range []string{o.Related.NamedURL, "/api/v2/organizations/zz-named%5B%2B%5Durl/"} {
		st, body = d.do("GET", path, nil)
		d.expect(st, body, http.StatusOK, "")
		if d.id(body) != org {
			t.Errorf("%s: %s", path, body)
		}
	}

	// "00<id>" is the pk, even with an organization of that name.
	padded := fmt.Sprintf("00%d", org)
	other := scratchOrg(t, d, padded)
	st, body = d.do("GET", "/api/v2/organizations/"+padded+"/", nil)
	d.expect(st, body, http.StatusOK, "")
	if d.id(body) != org {
		t.Errorf("leading zeros: got %d, want %d", d.id(body), org)
	}
	_ = other
	zeros := scratchOrg(t, d, "000")
	st, body = d.do("GET", "/api/v2/organizations/000/", nil)
	d.expect(st, body, http.StatusOK, "")
	if d.id(body) != zeros {
		t.Errorf("000: got %s", body)
	}

	// A user who may not change it: 403 by id, 404 by name.
	u := zzPlainUser(t, d, "zz-named-url-parity-member")
	grantTo(t, d, u.ID, `SELECT member_role_id FROM main_organization WHERE id = $1`, org)
	as(d, u, func() {
		st, body := d.do("PATCH", fmt.Sprintf("/api/v2/organizations/%d/", org), map[string]any{"description": "zz"})
		d.expect(st, body, http.StatusForbidden, `{"detail":"You do not have permission to perform this action."}`)
		r := httptest.NewRequest("PATCH", "/api/v2/organizations/zz-named[+]url/", strings.NewReader(`{"description": "zz"}`))
		r.Header.Set("Content-Type", "application/json")
		r = r.WithContext(auth.WithUser(r.Context(), d.user))
		w := httptest.NewRecorder()
		d.Routes().ServeHTTP(w, r)
		if w.Code != http.StatusNotFound || w.Body.String() != `{"detail":"Not found."}` || w.Header().Get("Allow") != "" {
			t.Errorf("by name: %d %s Allow=%q", w.Code, w.Body.String(), w.Header().Get("Allow"))
		}
	})

	// The job template name before named URLs is unquoted.
	jt := zzJobTemplate(t, d, "zz named jt")
	st, body = d.do("GET", "/api/v2/job_templates/zz%2520named%2520jt/", nil)
	d.expect(st, body, http.StatusOK, "")
	if d.id(body) != jt.ID {
		t.Errorf("job template by quoted name: %s", body)
	}
}

// role_level applies to every list whose model has roles, for superusers
// through their roles too, and is refused elsewhere.
func TestRoleLevelEveryRoleModel(t *testing.T) {
	d, _ := newScratchServer(t, "zz-role-level")
	org := scratchOrg(t, d, "zz-role-level-org")
	ctx := context.Background()
	var teams [2]int64
	for i := range teams {
		st, body := d.do("POST", "/api/v2/teams/", map[string]any{"name": fmt.Sprintf("zz-role-level-team-%d", i), "organization": org})
		d.expect(st, body, http.StatusCreated, "")
		teams[i] = d.id(body)
	}
	u := zzPlainUser(t, d, "zz-role-level-user")
	grantTo(t, d, u.ID, `SELECT admin_role_id FROM main_team WHERE id = $1`, teams[1])
	grantTo(t, d, u.ID, `SELECT member_role_id FROM main_organization WHERE id = $1`, org)
	ids := func(body string) []int64 {
		var v struct {
			Count   int `json:"count"`
			Results []struct {
				ID int64 `json:"id"`
			} `json:"results"`
		}
		if err := json.Unmarshal([]byte(body), &v); err != nil {
			t.Fatalf("%v: %s", err, body)
		}
		out := []int64{}
		for _, r := range v.Results {
			out = append(out, r.ID)
		}
		return out
	}
	as(d, u, func() {
		st, body := d.do("GET", "/api/v2/teams/?role_level=admin_role", nil)
		d.expect(st, body, http.StatusOK, "")
		if got := ids(body); fmt.Sprint(got) != fmt.Sprint([]int64{teams[1]}) {
			t.Errorf("teams admin_role: %v", got)
		}
		st, body = d.do("GET", fmt.Sprintf("/api/v2/organizations/%d/teams/?role_level=admin_role", org), nil)
		d.expect(st, body, http.StatusOK, "")
		if got := ids(body); fmt.Sprint(got) != fmt.Sprint([]int64{teams[1]}) {
			t.Errorf("organization teams admin_role: %v", got)
		}
		st, body = d.do("GET", "/api/v2/organizations/?role_level=member_role", nil)
		d.expect(st, body, http.StatusOK, "")
		if got := ids(body); fmt.Sprint(got) != fmt.Sprint([]int64{org}) {
			t.Errorf("organizations member_role: %v", got)
		}
		// Present but empty: no role has an empty field.
		st, body = d.do("GET", "/api/v2/organizations/?role_level=", nil)
		d.expect(st, body, http.StatusOK, "")
		if got := ids(body); len(got) != 0 {
			t.Errorf("organizations role_level empty: %v", got)
		}
	})
	refused := `{"detail":"Cannot apply role_level filter to this list because its model does not use roles for access control."}`
	for _, path := range []string{"/api/v2/users/?role_level=admin_role", "/api/v2/inventory_sources/?role_level=admin_role", "/api/v2/hosts/?role_level=admin_role"} {
		st, body := d.do("GET", path, nil)
		d.expect(st, body, http.StatusBadRequest, refused)
	}
	// A superuser holds what the System Administrator role is an ancestor
	// of, and nothing more.
	sa, err := rbac.SingletonRoleID(ctx, d.Q(), rbac.SystemAdministrator)
	if err != nil {
		t.Fatal(err)
	}
	st, body := d.do("GET", "/api/v2/teams/?role_level=admin_role", nil)
	d.expect(st, body, http.StatusOK, "")
	if got := ids(body); len(got) != 0 {
		t.Errorf("superuser outside the System Administrator role: %v", got)
	}
	if err := rbac.AddMember(ctx, d.Q(), sa, d.user.ID); err != nil {
		t.Fatal(err)
	}
	st, body = d.do("GET", "/api/v2/teams/?role_level=admin_role", nil)
	d.expect(st, body, http.StatusOK, "")
	if got := ids(body); len(got) != 2 {
		t.Errorf("superuser in the System Administrator role: %v", got)
	}
}

// An organization admin with use of an instance group attaches and
// detaches it; without use, or without admin, it is refused.
func TestOrganizationInstanceGroupsByOrgAdmin(t *testing.T) {
	d, _ := newScratchServer(t, "zz-org-ig")
	org := scratchOrg(t, d, "zz-org-ig")
	st, body := d.do("POST", "/api/v2/instance_groups/", map[string]any{"name": "zz-org-ig-group"})
	d.expect(st, body, http.StatusCreated, "")
	ig := d.id(body)
	u := zzPlainUser(t, d, "zz-org-ig-admin")
	path := fmt.Sprintf("/api/v2/organizations/%d/instance_groups/", org)
	forbidden := `{"detail":"You do not have permission to perform this action."}`
	grantTo(t, d, u.ID, `SELECT admin_role_id FROM main_organization WHERE id = $1`, org)
	as(d, u, func() {
		st, body := d.do("POST", path, map[string]any{"id": ig})
		d.expect(st, body, http.StatusForbidden, forbidden)
	})
	grantTo(t, d, u.ID, `SELECT use_role_id FROM main_instancegroup WHERE id = $1`, ig)
	as(d, u, func() {
		st, body := d.do("POST", path, map[string]any{"id": ig})
		d.expect(st, body, http.StatusNoContent, "")
		st, body = d.do("POST", path, map[string]any{"id": ig, "disassociate": true})
		d.expect(st, body, http.StatusNoContent, "")
	})
	v := zzPlainUser(t, d, "zz-org-ig-user")
	grantTo(t, d, v.ID, `SELECT use_role_id FROM main_instancegroup WHERE id = $1`, ig)
	grantTo(t, d, v.ID, `SELECT member_role_id FROM main_organization WHERE id = $1`, org)
	as(d, v, func() {
		st, body := d.do("POST", path, map[string]any{"id": ig})
		d.expect(st, body, http.StatusForbidden, forbidden)
	})
}

// An organization admin who can read a Galaxy credential attaches it,
// without use of it, as the old BaseAccess.can_attach allowed.
func TestOrganizationGalaxyCredentialByReader(t *testing.T) {
	d, _ := newScratchServer(t, "zz-org-galaxy")
	org := scratchOrg(t, d, "zz-org-galaxy")
	galaxy := zzType(t, d, "galaxy_api_token")
	cred := zzCredential(t, d, map[string]any{"name": "zz-org-galaxy-cred", "credential_type": galaxy, "organization": org, "inputs": map[string]any{"url": "https://galaxy.example.com/"}})
	u := zzPlainUser(t, d, "zz-org-galaxy-admin")
	grantTo(t, d, u.ID, `SELECT admin_role_id FROM main_organization WHERE id = $1`, org)
	path := fmt.Sprintf("/api/v2/organizations/%d/galaxy_credentials/", org)
	other := scratchOrg(t, d, "zz-org-galaxy-other")
	hidden := zzCredential(t, d, map[string]any{"name": "zz-org-galaxy-hidden", "credential_type": galaxy, "organization": other, "inputs": map[string]any{"url": "https://galaxy.example.com/"}})
	as(d, u, func() {
		st, body := d.do("POST", path, map[string]any{"id": hidden})
		d.expect(st, body, http.StatusForbidden, `{"detail":"You do not have permission to perform this action."}`)
	})
	grantTo(t, d, u.ID, `SELECT read_role_id FROM main_credential WHERE id = $1`, cred)
	as(d, u, func() {
		st, body := d.do("POST", path, map[string]any{"id": cred})
		d.expect(st, body, http.StatusNoContent, "")
		st, body = d.do("POST", path, map[string]any{"id": cred, "disassociate": true})
		d.expect(st, body, http.StatusNoContent, "")
	})
}

// zzCopySetup is an organization with an inventory and an SCM project,
// inserted without an update, for copy tests.
func zzCopySetup(t *testing.T, d *dbServer, name string) (org, inv int64, p *models.Project) {
	t.Helper()
	ctx := context.Background()
	inv, org = scratchInventory(t, d, name, nil)
	p = &models.Project{Name: name, SCMType: "git", SCMURL: "https://example.com/zz.git", OrganizationID: &org, SCMRevision: "abc123",
		PlaybookFiles: []string{"site.yml"}, InventoryFiles: []string{"hosts"}, WebhookService: "github", WebhookKey: "zz-old-key", ReuseRequirements: true}
	r := httptest.NewRequest("GET", "/", nil)
	if err := d.DB.Tx(ctx, func(tx pgx.Tx) error { return models.InsertProject(ctx, tx, p, d.CT, d.Roles, d.orgLookup(r, tx)) }); err != nil {
		t.Fatal(err)
	}
	return org, inv, p
}

func webhookKeyOf(t *testing.T, d *dbServer, path string) string {
	t.Helper()
	st, body := d.do("GET", path, nil)
	d.expect(st, body, http.StatusOK, "")
	var v struct {
		Key string `json:"webhook_key"`
	}
	_ = json.Unmarshal([]byte(body), &v)
	return v.Key
}

// A project copy gets a webhook key of its own and none of what updates
// set.
func TestProjectCopyParity(t *testing.T) {
	d, _ := newScratchServer(t, "zz-project-copy")
	_, _, p := zzCopySetup(t, d, "zz-project-copy")
	st, body := d.do("POST", fmt.Sprintf("/api/v2/projects/%d/copy/", p.ID), map[string]any{"name": "zz-project-copy-2"})
	d.expect(st, body, http.StatusCreated, "")
	n := d.id(body)
	var v struct {
		SCMRevision string `json:"scm_revision"`
		Webhook     string `json:"webhook_service"`
	}
	_ = json.Unmarshal([]byte(body), &v)
	if v.SCMRevision != "" || v.Webhook != "github" {
		t.Errorf("copy: %s", body)
	}
	var rev, pb, invFiles string
	if err := d.Q().QueryRow(context.Background(), `SELECT scm_revision, playbook_files::text, inventory_files::text FROM main_project WHERE unifiedjobtemplate_ptr_id = $1`, n).Scan(&rev, &pb, &invFiles); err != nil {
		t.Fatal(err)
	}
	if rev != "" || pb != "[]" || invFiles != "[]" {
		t.Errorf("stored copy: %q %s %s", rev, pb, invFiles)
	}
	key := webhookKeyOf(t, d, fmt.Sprintf("/api/v2/projects/%d/webhook_key/", n))
	if len(key) != 50 || key == "zz-old-key" {
		t.Errorf("copy webhook key %q", key)
	}
}

// A job template copy gets a webhook key of its own; can_add takes read
// on the execution environment; can_copy_related's refusal has its own
// message.
func TestJobTemplateCopyParity(t *testing.T) {
	d, _ := newScratchServer(t, "zz-jt-copy")
	ctx := context.Background()
	org, inv, p := zzCopySetup(t, d, "zz-jt-copy")
	ssh := zzType(t, d, "ssh")
	cred := zzCredential(t, d, map[string]any{"name": "zz-jt-copy-machine", "credential_type": ssh, "organization": org, "inputs": map[string]any{"username": "zz"}})
	otherOrg := scratchOrg(t, d, "zz-jt-copy-other")
	st, body := d.do("POST", "/api/v2/execution_environments/", map[string]any{"name": "zz-jt-copy-ee", "image": "quay.io/zz/ee:latest", "organization": otherOrg})
	d.expect(st, body, http.StatusCreated, "")
	ee := d.id(body)
	jt := &models.JobTemplate{Name: "zz-jt-copy", JobType: "run", JobSliceCount: 1, Playbook: "site.yml", ProjectID: &p.ID, InventoryID: &inv, OrganizationID: &org,
		WebhookService: "github", WebhookKey: "zz-old-key"}
	r := httptest.NewRequest("GET", "/", nil)
	if err := d.DB.Tx(ctx, func(tx pgx.Tx) error {
		if err := models.InsertJobTemplate(ctx, tx, jt, d.CT, d.Roles, d.orgLookup(r, tx), d.inventoryOrgLookup(r, tx)); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `INSERT INTO main_unifiedjobtemplate_credentials (unifiedjobtemplate_id, credential_id) VALUES ($1, $2)`, jt.ID, cred)
		return err
	}); err != nil {
		t.Fatal(err)
	}
	copyPath := fmt.Sprintf("/api/v2/job_templates/%d/copy/", jt.ID)
	st, body = d.do("POST", copyPath, map[string]any{"name": "zz-jt-copy-2"})
	d.expect(st, body, http.StatusCreated, "")
	key := webhookKeyOf(t, d, fmt.Sprintf("/api/v2/job_templates/%d/webhook_key/", d.id(body)))
	if len(key) != 50 || key == "zz-old-key" {
		t.Errorf("copy webhook key %q", key)
	}

	u := zzPlainUser(t, d, "zz-jt-copy-user")
	grantTo(t, d, u.ID, `SELECT read_role_id FROM main_jobtemplate WHERE unifiedjobtemplate_ptr_id = $1`, jt.ID)
	grantTo(t, d, u.ID, `SELECT use_role_id FROM main_project WHERE unifiedjobtemplate_ptr_id = $1`, p.ID)
	grantTo(t, d, u.ID, `SELECT use_role_id FROM main_inventory WHERE id = $1`, inv)
	canCopy := func() string {
		st, body := d.do("GET", copyPath, nil)
		d.expect(st, body, http.StatusOK, "")
		return body
	}
	as(d, u, func() {
		if got := canCopy(); got != `{"can_copy":false}` {
			t.Errorf("without the credential: %s", got)
		}
		st, body := d.do("POST", copyPath, map[string]any{"name": "zz-jt-copy-3"})
		d.expect(st, body, http.StatusForbidden, `{"detail":"Insufficient access to Job Template credentials."}`)
	})
	grantTo(t, d, u.ID, `SELECT use_role_id FROM main_credential WHERE id = $1`, cred)
	if _, err := d.Q().Exec(ctx, `UPDATE main_unifiedjobtemplate SET execution_environment_id = $2 WHERE id = $1`, jt.ID, ee); err != nil {
		t.Fatal(err)
	}
	as(d, u, func() {
		if got := canCopy(); got != `{"can_copy":false}` {
			t.Errorf("with an unreadable execution environment: %s", got)
		}
		st, body := d.do("POST", copyPath, map[string]any{"name": "zz-jt-copy-4"})
		d.expect(st, body, http.StatusForbidden, `{"detail":"You do not have permission to perform this action."}`)
	})
	grantTo(t, d, u.ID, `SELECT read_role_id FROM main_organization WHERE id = $1`, otherOrg)
	as(d, u, func() {
		if got := canCopy(); got != `{"can_copy":true}` {
			t.Errorf("with every access: %s", got)
		}
	})
}

// A signature validation credential may be of any kind, as the old
// serializer took it.
func TestSignatureValidationCredentialAnyKind(t *testing.T) {
	d, _ := newScratchServer(t, "zz-sigval")
	org, _, p := zzCopySetup(t, d, "zz-sigval")
	cred := zzCredential(t, d, map[string]any{"name": "zz-sigval-machine", "credential_type": zzType(t, d, "ssh"), "organization": org, "inputs": map[string]any{"username": "zz"}})
	st, body := d.do("PATCH", fmt.Sprintf("/api/v2/projects/%d/", p.ID), map[string]any{"signature_validation_credential": cred})
	d.expect(st, body, http.StatusOK, "")
	var v struct {
		SVC int64 `json:"signature_validation_credential"`
	}
	_ = json.Unmarshal([]byte(body), &v)
	if v.SVC != cred {
		t.Errorf("signature_validation_credential: %s", body)
	}
}
