package models

import (
	"context"
	"errors"
	"testing"
)

// A vault id an input source fills is the lookup's value in the unique
// hash, as Credential.unique_hash had it through has_input and get_input;
// the lookup runs once per brief, only when the hash is asked for.
func TestUniqueHashLooksUpVaultID(t *testing.T) {
	calls := 0
	lookup := func(_ context.Context, credID int64, field string) (string, error) {
		calls++
		if field != "vault_id" {
			t.Errorf("looked up %q", field)
		}
		switch credID {
		case 1:
			return "dev", nil
		case 2:
			return "", nil
		}
		return "", errors.New("lookup failed")
	}
	ctx := WithInputLookup(context.Background(), lookup)
	brief := func(id int64, stored string, sourced bool) CredentialBrief {
		b := CredentialBrief{ID: id, TypeKind: "vault", CredentialTypeID: 3, TypeName: "Vault", Inputs: []byte(`{"vault_id": "` + stored + `"}`)}
		if sourced {
			fn, _ := ctx.Value(inputLookupKey{}).(InputLookup)
			b.vaultIDSource = &dynamicInput{ctx: ctx, lookup: fn, credID: id, field: "vault_id"}
		}
		return b
	}

	looked := brief(1, "", true)
	if calls != 0 {
		t.Fatal("the lookup ran before the hash was asked for")
	}
	if h, d := looked.UniqueHash(), looked.UniqueHashDisplay(); h != "3_dev" || d != "Vault (id=dev)" {
		t.Errorf("looked-up vault id: %q %q", h, d)
	}
	// The same as a stored vault id of that value.
	if h := brief(4, "dev", false).UniqueHash(); h != looked.UniqueHash() {
		t.Errorf("stored dev hashes as %q, looked-up dev as %q", h, looked.UniqueHash())
	}
	_ = looked.UniqueHash()
	if calls != 1 {
		t.Errorf("the lookup ran %d times for one brief", calls)
	}
	// has_input is true for a looked-up field whatever its value.
	if h, d := brief(2, "", true).UniqueHash(), brief(2, "", true).UniqueHashDisplay(); h != "3_" || d != "Vault (id=)" {
		t.Errorf("looked-up empty vault id: %q %q", h, d)
	}
	// A stored empty vault id is no vault id.
	if h, d := brief(5, "", false).UniqueHash(), brief(5, "", false).UniqueHashDisplay(); h != "3" || d != "Vault" {
		t.Errorf("no vault id: %q %q", h, d)
	}
	// A lookup that fails tells the credential apart from every other.
	a, b := brief(6, "", true), brief(7, "", true)
	if a.UniqueHash() == b.UniqueHash() || a.UniqueHash() == "3" || a.UniqueHashDisplay() != "Vault" {
		t.Errorf("failed lookups: %q %q %q", a.UniqueHash(), b.UniqueHash(), a.UniqueHashDisplay())
	}
	// So does one that cannot run where the brief was loaded.
	c := brief(8, "", false)
	c.vaultIDSource = &dynamicInput{ctx: context.Background(), credID: 8, field: "vault_id"}
	if c.UniqueHash() == "3" || c.UniqueHash() == a.UniqueHash() {
		t.Errorf("no lookup: %q", c.UniqueHash())
	}
	// Only vault credentials have a vault id.
	m := CredentialBrief{ID: 9, TypeKind: "ssh", CredentialTypeID: 1, TypeName: "Machine", Inputs: []byte(`{"vault_id": "dev"}`)}
	if m.UniqueHash() != "1" || m.UniqueHashDisplay() != "Machine" {
		t.Errorf("machine: %q %q", m.UniqueHash(), m.UniqueHashDisplay())
	}
}
