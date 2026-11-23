package api

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	"github.com/ctrliq/ascender/internal/models"
)

// /credentials/N/test/ takes only the type's declared metadata fields, so
// metadata can never replace an input. That holds only while no external
// type declares a metadata field named like one of its inputs.
func TestExternalMetadataNeverNamesAnInput(t *testing.T) {
	n := 0
	for ns, m := range models.ManagedCredentialTypes {
		if m.Kind != "external" {
			continue
		}
		n++
		ct := &models.CredentialType{Inputs: m.Inputs}
		in := ct.ParsedInputs()
		if len(in.Metadata) == 0 {
			t.Errorf("%s: an external type with no metadata fields", ns)
		}
		for _, f := range in.Metadata {
			if in.Field(f.ID) != nil {
				t.Errorf("%s: metadata field %q is also an input", ns, f.ID)
			}
		}
	}
	if n == 0 {
		t.Fatal("no managed external credential types")
	}
}

// A user who may only use an external credential cannot redirect its test
// through metadata: the stored secret never leaves for a url of theirs.
func TestCredentialTestRefusesUndeclaredMetadata(t *testing.T) {
	d := newDBServer(t, "zz-credential-test-metadata")
	ctx := context.Background()
	// The roles granted below go before the harness removes the user.
	t.Cleanup(func() {
		if _, err := d.Q().Exec(ctx, `DELETE FROM main_rbac_roles_members WHERE user_id = $1`, d.user.ID); err != nil {
			t.Errorf("remove role memberships: %v", err)
		}
	})
	var org, vault int64
	if err := d.Q().QueryRow(ctx, `SELECT id FROM main_organization ORDER BY id LIMIT 1`).Scan(&org); err != nil {
		t.Skip("no organization")
	}
	if err := d.Q().QueryRow(ctx, `SELECT id FROM main_credentialtype WHERE namespace = 'hashivault_kv' AND managed`).Scan(&vault); err != nil {
		t.Skip("no HashiCorp Vault credential type")
	}
	var toVault, toAttacker atomic.Int32
	stored := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		toVault.Add(1)
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"data":{"data":{"password":"s3cret"}}}`)
	}))
	defer stored.Close()
	attacker := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		toAttacker.Add(1)
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"data":{"data":{"password":"x"}}}`)
	}))
	defer attacker.Close()

	st, resp := d.do("POST", "/api/v2/credentials/", map[string]any{"name": "zz-credential-test-metadata", "credential_type": vault, "organization": org,
		"inputs": map[string]any{"url": stored.URL, "token": "zz-stored-token", "api_version": "v2"}})
	d.expect(st, resp, http.StatusCreated, "")
	cred := d.id(resp)
	t.Cleanup(func() {
		d.user.IsSuperuser = true
		if st, resp := d.do("DELETE", fmt.Sprintf("/api/v2/credentials/%d/", cred), nil); st != http.StatusNoContent {
			t.Errorf("delete credential: %d %s", st, resp)
		}
	})
	// A member of the organization with use of its credential, nothing more.
	var memberRole, useRole int64
	if err := d.Q().QueryRow(ctx, `SELECT member_role_id FROM main_organization WHERE id = $1`, org).Scan(&memberRole); err != nil {
		t.Fatal(err)
	}
	if err := d.Q().QueryRow(ctx, `SELECT use_role_id FROM main_credential WHERE id = $1`, cred).Scan(&useRole); err != nil {
		t.Fatal(err)
	}
	for _, role := range []int64{memberRole, useRole} {
		st, resp = d.do("POST", fmt.Sprintf("/api/v2/users/%d/roles/", d.user.ID), map[string]any{"id": role})
		d.expect(st, resp, http.StatusNoContent, "")
	}

	d.user.IsSuperuser = false
	path := fmt.Sprintf("/api/v2/credentials/%d/test/", cred)
	for _, extra := range []map[string]any{
		{"url": attacker.URL},
		{"url": attacker.URL, "token": "x"},
		{"cacert": "x"},
		{"namespace": "x"},
	} {
		meta := map[string]any{"secret_path": "/kv/zz", "secret_key": "password"}
		for k, v := range extra {
			meta[k] = v
		}
		st, resp := d.do("POST", path, map[string]any{"metadata": meta})
		if st != http.StatusBadRequest {
			t.Errorf("metadata %v: got %d %s, want 400", extra, st, resp)
		}
	}
	if n := toAttacker.Load(); n != 0 {
		t.Fatalf("the attacker's server got %d requests", n)
	}
	// The declared metadata still tests against the stored url.
	st, resp = d.do("POST", path, map[string]any{"metadata": map[string]any{"secret_path": "/kv/zz", "secret_key": "password"}})
	d.expect(st, resp, http.StatusAccepted, "")
	if toVault.Load() == 0 {
		t.Error("the test never reached the credential's own url")
	}
}
