package models

import (
	"context"
	"os"
	"slices"
	"strings"
	"testing"

	"github.com/ctrliq/ascender/internal/db"
)

// A job template's read_role has two organization auditor parents (its own
// organization's and its inventory's). Changing either key replaces only
// what that key's rules now name, and leaves every other parent, a team
// granted the template's roles among them. Everything runs in one
// transaction that is rolled back.
func TestRelinkParentRoleReplacesOrganizationParents(t *testing.T) {
	url := os.Getenv("ASCENDER_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("ASCENDER_TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	database, err := db.Open(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	cts, err := LoadContentTypes(ctx, database.Pool)
	if err != nil {
		t.Fatal(err)
	}
	tx, err := database.Pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	f := RoleFactory{CT: cts}

	// Object ids far above any real one; the transaction never commits.
	const base = 2_000_000_000
	orgs := map[string]map[string]int64{}
	for i, name := range []string{"A", "B", "C", "D"} {
		roles, err := f.CreateRoles(ctx, tx, "organization", cts.ID("main.organization"), base+int64(i), OrganizationRoleFields, nil)
		if err != nil {
			t.Fatal(err)
		}
		orgs[name] = roles
	}
	jtOrg, invOrg := "A", "B"
	lookup := func(spec string) *int64 {
		org := jtOrg
		if rest, ok := strings.CutPrefix(spec, "inventory.organization."); ok {
			org, spec = invOrg, rest
		} else {
			spec = strings.TrimPrefix(spec, "organization.")
		}
		id, ok := orgs[org][spec]
		if !ok {
			return nil
		}
		return &id
	}
	jt, err := f.CreateRoles(ctx, tx, "jobtemplate", cts.ID("main.jobtemplate"), base, JobTemplateRoleFields, lookup)
	if err != nil {
		t.Fatal(err)
	}
	team, err := f.CreateRoles(ctx, tx, "team", cts.ID("main.team"), base, []string{"member_role"}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `INSERT INTO main_rbac_roles_parents (from_role_id, to_role_id) VALUES ($1, $2)`, jt["execute_role"], team["member_role"]); err != nil {
		t.Fatal(err)
	}
	parents := func(role int64) []int64 {
		t.Helper()
		ids, err := ScanIDs(ctx, tx, `SELECT to_role_id FROM main_rbac_roles_parents WHERE from_role_id = $1`, role)
		if err != nil {
			t.Fatal(err)
		}
		return ids
	}
	ancestors := func(role int64) []int64 {
		t.Helper()
		ids, err := ScanIDs(ctx, tx, `SELECT ancestor_id FROM main_rbac_role_ancestors WHERE descendent_id = $1`, role)
		if err != nil {
			t.Fatal(err)
		}
		return ids
	}
	expect := func(step string, role int64, want, notWant []int64) {
		t.Helper()
		p, a := parents(role), ancestors(role)
		for _, id := range want {
			if !slices.Contains(p, id) || !slices.Contains(a, id) {
				t.Errorf("%s: role %d lacks %d (parents %v)", step, role, id, p)
			}
		}
		for _, id := range notWant {
			if slices.Contains(p, id) || slices.Contains(a, id) {
				t.Errorf("%s: role %d keeps %d (parents %v)", step, role, id, p)
			}
		}
	}
	expect("created", jt["read_role"], []int64{orgs["A"]["auditor_role"], orgs["B"]["auditor_role"]}, nil)

	// The inventory moves from organization B to C.
	invOrg = "C"
	if err := RelinkParentRole(ctx, tx, "jobtemplate", jt, "inventory", lookup); err != nil {
		t.Fatal(err)
	}
	expect("inventory moved", jt["read_role"], []int64{orgs["A"]["auditor_role"], orgs["C"]["auditor_role"]}, []int64{orgs["B"]["auditor_role"]})

	// The template moves from organization A to D; the inventory's stays.
	jtOrg = "D"
	if err := RelinkParentRole(ctx, tx, "jobtemplate", jt, "organization", lookup); err != nil {
		t.Fatal(err)
	}
	expect("template moved", jt["read_role"], []int64{orgs["D"]["auditor_role"], orgs["C"]["auditor_role"]}, []int64{orgs["A"]["auditor_role"]})
	expect("template moved", jt["admin_role"], []int64{orgs["D"]["job_template_admin_role"]}, []int64{orgs["A"]["job_template_admin_role"]})
	expect("template moved", jt["execute_role"], []int64{orgs["D"]["execute_role"], team["member_role"]}, []int64{orgs["A"]["execute_role"]})
}
