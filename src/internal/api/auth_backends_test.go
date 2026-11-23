package api

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

// AUTHENTICATION_BACKENDS lists an Azure family backend whose secret a
// federated token stands in for, as its login accepts it.
func TestAuthenticationBackendsClientAssertion(t *testing.T) {
	d := newDBServer(t, "zz-auth-backends-test")
	ctx := context.Background()
	dir := t.TempDir()
	file := filepath.Join(dir, "settings.json")
	load := func(body string) {
		t.Helper()
		if err := os.WriteFile(file, []byte(body), 0o600); err != nil {
			t.Fatal(err)
		}
		if _, err := d.Settings.LoadFile(file); err != nil {
			t.Fatal(err)
		}
	}
	listed := func() bool {
		for _, b := range d.authenticationBackends(ctx) {
			if b == "ascender.sso.entra.EntraIDOAuth2" {
				return true
			}
		}
		return false
	}
	load(`{"SOCIAL_AUTH_ENTRA_ID_KEY": "zz-client", "SOCIAL_AUTH_ENTRA_ID_SECRET": "", "SOCIAL_AUTH_ENTRA_ID_TENANT_ID": "zz-tenant"}`)
	t.Setenv("OAUTH2_FEDERATED_TOKEN_FILE", "")
	t.Setenv("AZURE_FEDERATED_TOKEN_FILE", "")
	if listed() {
		t.Error("AUTHENTICATION_BACKENDS lists Entra ID without a secret or a federated token")
	}
	if d.backendEnabled(ctx, "entra-id") {
		t.Error("the Entra ID login is enabled without a secret or a federated token")
	}
	token := filepath.Join(dir, "token")
	if err := os.WriteFile(token, []byte("zz"), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("AZURE_FEDERATED_TOKEN_FILE", token)
	if !listed() {
		t.Error("not listed with a federated token")
	}
	if listed() != d.backendEnabled(ctx, "entra-id") {
		t.Error("AUTHENTICATION_BACKENDS and the login disagree")
	}
}
