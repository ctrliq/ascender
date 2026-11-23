package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/models"
)

// zzVaultServer is a HashiCorp Vault key/value store (API v2) on loopback
// with one secret per path under the kv mount; every other path is a 404.
// It counts the reads it answered.
func zzVaultServer(t *testing.T, secrets map[string]map[string]string) (*httptest.Server, *atomic.Int32) {
	t.Helper()
	var hits atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		data, ok := secrets[strings.TrimPrefix(r.URL.Path, "/v1/kv/data/")]
		if !ok {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"data": map[string]any{"data": data}})
	}))
	t.Cleanup(srv.Close)
	return srv, &hits
}

// zzType is the id of a managed credential type, or skips the test.
func zzType(t *testing.T, d *dbServer, namespace string) int64 {
	t.Helper()
	var id int64
	if err := d.Q().QueryRow(context.Background(), `SELECT id FROM main_credentialtype WHERE namespace = $1 AND managed`, namespace).Scan(&id); err != nil {
		t.Skipf("no %s credential type", namespace)
	}
	return id
}

// zzOrg is the first organization, or skips the test.
func zzOrg(t *testing.T, d *dbServer) int64 {
	t.Helper()
	var id int64
	if err := d.Q().QueryRow(context.Background(), `SELECT id FROM main_organization ORDER BY id LIMIT 1`).Scan(&id); err != nil {
		t.Skip("no organization")
	}
	return id
}

// zzCredential creates a credential through the API as the test user and
// deletes it (through the API, so the activity stream entry is the test's
// too) when the test ends.
func zzCredential(t *testing.T, d *dbServer, body map[string]any) int64 {
	t.Helper()
	st, resp := d.do("POST", "/api/v2/credentials/", body)
	d.expect(st, resp, http.StatusCreated, "")
	id := d.id(resp)
	zzDeleteCredentialAtEnd(t, d, id)
	return id
}

func zzDeleteCredentialAtEnd(t *testing.T, d *dbServer, id int64) {
	t.Cleanup(func() {
		was := d.user.IsSuperuser
		d.user.IsSuperuser = true
		defer func() { d.user.IsSuperuser = was }()
		if st, resp := d.do("DELETE", fmt.Sprintf("/api/v2/credentials/%d/", id), nil); st != http.StatusNoContent && st != http.StatusNotFound {
			t.Errorf("delete credential %d: %d %s", id, st, resp)
		}
	})
}

// zzJobTemplate inserts a bare job template (no project or inventory, so
// nothing can be launched from it) and deletes it when the test ends.
func zzJobTemplate(t *testing.T, d *dbServer, name string) *models.JobTemplate {
	t.Helper()
	ctx := context.Background()
	jt := &models.JobTemplate{Name: name, JobType: "run", JobSliceCount: 1, ExtraVars: ""}
	err := d.DB.Tx(ctx, func(tx pgx.Tx) error {
		return models.InsertJobTemplate(ctx, tx, jt, d.CT, d.Roles, func(int64) *models.Organization { return nil }, func(int64) *int64 { return nil })
	})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := d.DB.Tx(ctx, func(tx pgx.Tx) error { return models.DeleteJobTemplate(ctx, tx, jt, d.CT, d.Cascade) }); err != nil {
			t.Errorf("delete job template: %v", err)
		}
	})
	return jt
}

// C3: the test of a saved credential takes job_template_id in its metadata,
// the template the UI sends for a credential that logs in as the job, while
// every other undeclared key is still refused.
func TestCredentialTestTakesJobTemplateID(t *testing.T) {
	d := newDBServer(t, "zz-credential-test-jtid")
	org := zzOrg(t, d)
	kv, oidc := zzType(t, d, "hashivault_kv"), zzType(t, d, "hashivault_kv_oidc")
	vault, hits := zzVaultServer(t, map[string]map[string]string{"zz": {"password": "s3cret"}})

	plain := zzCredential(t, d, map[string]any{"name": "zz-credential-test-jtid-kv", "credential_type": kv, "organization": org,
		"inputs": map[string]any{"url": vault.URL, "token": "zz-token", "api_version": "v2"}})
	asJob := zzCredential(t, d, map[string]any{"name": "zz-credential-test-jtid-oidc", "credential_type": oidc, "organization": org,
		"inputs": map[string]any{"url": vault.URL, "api_version": "v2", "default_auth_path": "jwt", "jwt_role": "zz-role"}})
	var missing int64
	if err := d.Q().QueryRow(context.Background(), `SELECT COALESCE(max(id), 0) + 1000 FROM main_unifiedjobtemplate`).Scan(&missing); err != nil {
		t.Fatal(err)
	}
	meta := func(extra map[string]any) map[string]any {
		m := map[string]any{"secret_path": "/kv/zz", "secret_key": "password"}
		for k, v := range extra {
			m[k] = v
		}
		return map[string]any{"metadata": m}
	}

	// A type that does not log in as the job drops it, as the old view
	// did (a template left over from a credential picked before).
	st, resp := d.do("POST", fmt.Sprintf("/api/v2/credentials/%d/test/", plain), meta(map[string]any{"job_template_id": missing}))
	d.expect(st, resp, http.StatusAccepted, "{}")
	if hits.Load() == 0 {
		t.Error("the lookup never ran")
	}

	// One that does uses it: the template is looked for, and the user
	// cannot launch one that is not there.
	for _, path := range []string{fmt.Sprintf("/api/v2/credentials/%d/test/", asJob), fmt.Sprintf("/api/v2/credential_types/%d/test/", oidc)} {
		body := meta(map[string]any{"job_template_id": missing})
		if strings.Contains(path, "credential_types") {
			body["inputs"] = map[string]any{"url": vault.URL, "api_version": "v2", "default_auth_path": "jwt", "jwt_role": "zz-role"}
		}
		st, resp = d.do("POST", path, body)
		d.expect(st, resp, http.StatusForbidden, fmt.Sprintf(`{"detail":"You cannot launch job template %d."}`, missing))
		delete(body["metadata"].(map[string]any), "job_template_id")
		st, resp = d.do("POST", path, body)
		d.expect(st, resp, http.StatusBadRequest, `{"inputs":"Pick the job template to test this credential as."}`)
	}

	// Any other key the type does not declare is still refused.
	for _, cred := range []int64{plain, asJob} {
		st, resp = d.do("POST", fmt.Sprintf("/api/v2/credentials/%d/test/", cred), meta(map[string]any{"job_template_id": missing, "url": "http://127.0.0.1:1"}))
		d.expect(st, resp, http.StatusBadRequest, `{"metadata":["Additional properties are not allowed ('url' was unexpected)"]}`)
	}
}

// C4 and C8: a vault id an input source fills is looked up for the unique
// hash, so vault credentials with different looked-up ids are not
// duplicates; and a lookup that fails names the credential whose field it
// is.
func TestLookedUpVaultIDUniqueHash(t *testing.T) {
	d := newDBServer(t, "zz-looked-up-vault-id")
	ctx := context.Background()
	org := zzOrg(t, d)
	kv, vaultType := zzType(t, d, "hashivault_kv"), zzType(t, d, "vault")
	vault, hits := zzVaultServer(t, map[string]map[string]string{"dev": {"vault_id": "dev"}, "prod": {"vault_id": "prod"}})

	lookup := zzCredential(t, d, map[string]any{"name": "zz-looked-up-vault-id-source", "credential_type": kv, "organization": org,
		"inputs": map[string]any{"url": vault.URL, "token": "zz-token", "api_version": "v2"}})
	vaultCred := func(name, path string) int64 {
		id := zzCredential(t, d, map[string]any{"name": name, "credential_type": vaultType, "organization": org, "inputs": map[string]any{"vault_password": "zz"}})
		st, resp := d.do("POST", fmt.Sprintf("/api/v2/credentials/%d/input_sources/", id), map[string]any{"source_credential": lookup, "input_field_name": "vault_id",
			"metadata": map[string]any{"secret_path": "/kv/" + path, "secret_key": "vault_id"}})
		d.expect(st, resp, http.StatusCreated, "")
		return id
	}
	dev := vaultCred("zz-looked-up-vault-id-dev", "dev")
	prod := vaultCred("zz-looked-up-vault-id-prod", "prod")
	dev2 := vaultCred("zz-looked-up-vault-id-dev2", "dev")
	broken := vaultCred("zz-looked-up-vault-id-broken", "missing")
	jt := zzJobTemplate(t, d, "zz-looked-up-vault-id")
	attach := func(id int64) (int, string) {
		return d.do("POST", fmt.Sprintf("/api/v2/job_templates/%d/credentials/", jt.ID), map[string]any{"associate": true, "id": id})
	}

	hits.Store(0)
	st, resp := attach(dev)
	d.expect(st, resp, http.StatusNoContent, "")
	// Before the fix both hashed as the bare type and were refused.
	st, resp = attach(prod)
	d.expect(st, resp, http.StatusNoContent, "")
	st, resp = attach(dev2)
	d.expect(st, resp, http.StatusBadRequest, `{"error":"Cannot assign multiple Vault (id=dev) credentials."}`)
	if hits.Load() == 0 {
		t.Error("attaching never looked the vault ids up")
	}
	// A lookup that fails makes the credential conflict with none.
	st, resp = attach(broken)
	d.expect(st, resp, http.StatusNoContent, "")

	// Showing the template's credentials runs no lookup.
	hits.Store(0)
	st, resp = d.do("GET", fmt.Sprintf("/api/v2/job_templates/%d/", jt.ID), nil)
	d.expect(st, resp, http.StatusOK, "")
	if n := hits.Load(); n != 0 {
		t.Errorf("the template's detail ran %d lookups", n)
	}

	// Launch-time credentials replace the template's by the same hash.
	lctx := d.WithInputLookups(ctx)
	tcreds, err := models.TemplateCredentials(lctx, d.Q(), []int64{jt.ID})
	if err != nil {
		t.Fatal(err)
	}
	prompted, err := models.LoadCredentialBriefs(lctx, d.Q(), []int64{dev2})
	if err != nil {
		t.Fatal(err)
	}
	merged := credentialIDs(mergeCredentials(tcreds[jt.ID], prompted))
	if want := []int64{dev2, prod, broken}; fmt.Sprint(merged) != fmt.Sprint(want) {
		t.Errorf("launch credentials %v, want %v", merged, want)
	}

	// The lookup that fails names the vault credential and its field, not
	// the lookup credential.
	_, err = d.DynamicInputs(ctx, broken)
	var le *LookupError
	if !errors.As(err, &le) {
		t.Fatalf("lookup error: %v", err)
	}
	if want := "Traceback (most recent call last):\n  Looking up vault_id of credential zz-looked-up-vault-id-broken\n"; !strings.HasPrefix(le.Error(), want) {
		t.Errorf("traceback %q, want it to start %q", le.Error(), want)
	}
}
