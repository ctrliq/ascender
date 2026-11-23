package api

import (
	"context"
	"fmt"
	"net/http"
	"testing"
)

// Changing an input source checks the roles on the credentials the change
// links, as the serializer reads them: an id the raw-data check would read
// one way ("09" as octal) and the serializer another must not let a user
// point an input source at someone else's credential.
func TestInputSourceUpdateChecksValidatedCredentials(t *testing.T) {
	d := newDBServer(t, "zz-input-source-rbac-test")
	ctx := context.Background()
	var org, vault, machine int64
	if err := d.Q().QueryRow(ctx, `SELECT id FROM main_organization ORDER BY id LIMIT 1`).Scan(&org); err != nil {
		t.Skip("no organization")
	}
	if err := d.Q().QueryRow(ctx, `SELECT id FROM main_credentialtype WHERE namespace = 'hashivault_kv' AND managed`).Scan(&vault); err != nil {
		t.Skip("no HashiCorp Vault credential type")
	}
	if err := d.Q().QueryRow(ctx, `SELECT id FROM main_credentialtype WHERE namespace = 'ssh' AND managed`).Scan(&machine); err != nil {
		t.Skip("no Machine credential type")
	}
	create := func(name string, ct int64, inputs map[string]any, owner map[string]any) int64 {
		t.Helper()
		body := map[string]any{"name": name, "credential_type": ct, "inputs": inputs}
		for k, v := range owner {
			body[k] = v
		}
		st, resp := d.do("POST", "/api/v2/credentials/", body)
		d.expect(st, resp, http.StatusCreated, "")
		id := d.id(resp)
		t.Cleanup(func() {
			d.user.IsSuperuser = true
			if st, resp := d.do("DELETE", fmt.Sprintf("/api/v2/credentials/%d/", id), nil); st != http.StatusNoContent {
				t.Errorf("delete credential %d: %d %s", id, st, resp)
			}
		})
		return id
	}
	vaultInputs := map[string]any{"url": "https://vault.invalid", "token": "zz-token", "api_version": "v2"}
	mine := map[string]any{"user": d.user.ID}
	// The test user's own: a lookup source and a target.
	ownSource := create("zz-input-source-own-vault", vault, vaultInputs, mine)
	ownTarget := create("zz-input-source-own-machine", machine, map[string]any{"username": "zz"}, mine)
	// Someone else's: organization credentials the test user holds no role on.
	theirs := map[string]any{"organization": org}
	victimSource := create("zz-input-source-victim-vault", vault, vaultInputs, theirs)
	victimTarget := create("zz-input-source-victim-machine", machine, map[string]any{"username": "zz"}, theirs)

	st, resp := d.do("POST", "/api/v2/credential_input_sources/", map[string]any{
		"source_credential": ownSource, "target_credential": ownTarget, "input_field_name": "password",
		"metadata": map[string]any{"secret_path": "/kv/zz", "secret_key": "password"},
	})
	d.expect(st, resp, http.StatusCreated, "")
	src := d.id(resp)
	path := fmt.Sprintf("/api/v2/credential_input_sources/%d/", src)

	d.user.IsSuperuser = false
	forbidden := `{"detail":"You do not have permission to perform this action."}`
	for _, body := range []map[string]any{
		{"source_credential": fmt.Sprintf("0%d", victimSource)},
		{"source_credential": fmt.Sprintf(" %d ", victimSource)},
		{"source_credential": victimSource},
		{"target_credential": fmt.Sprintf("0%d", victimTarget)},
		{"target_credential": victimTarget},
	} {
		st, resp := d.do("PATCH", path, body)
		if st != http.StatusForbidden || resp != forbidden {
			t.Errorf("PATCH %v: got %d %s, want 403", body, st, resp)
		}
	}
	var gotSource, gotTarget int64
	if err := d.Q().QueryRow(ctx, `SELECT source_credential_id, target_credential_id FROM main_credentialinputsource WHERE id = $1`, src).Scan(&gotSource, &gotTarget); err != nil {
		t.Fatal(err)
	}
	if gotSource != ownSource || gotTarget != ownTarget {
		t.Errorf("input source now links %d -> %d, want %d -> %d", gotSource, gotTarget, ownSource, ownTarget)
	}
	// Its own credentials, however spelled, still work.
	st, resp = d.do("PATCH", path, map[string]any{"source_credential": fmt.Sprintf("0%d", ownSource), "description": "zz"})
	d.expect(st, resp, http.StatusOK, "")
}
