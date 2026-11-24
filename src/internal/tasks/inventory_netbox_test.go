package tasks

import (
	"encoding/json"
	"testing"

	"github.com/ctrliq/ascender/internal/models"
)

// netboxCred is a credential of the managed NetBox type, its fields and
// injectors taken from the registry as a run would load them.
func netboxCred(t *testing.T, g *injectRig, inputs map[string]any) *credentialData {
	t.Helper()
	m, ok := models.ManagedCredentialTypes["netbox"]
	if !ok {
		t.Fatal("no managed netbox credential type")
	}
	var in models.CredentialTypeInputs
	if err := json.Unmarshal(m.Inputs, &in); err != nil {
		t.Fatal(err)
	}
	c := g.cred(in.Fields, string(m.Injectors), inputs)
	c.Namespace = "netbox"
	c.Managed = true
	return c
}

// The netbox source runs netbox.netbox.nb_inventory with the endpoint and
// token in the environment (the credential type's injectors) and the
// credential's Verify SSL as validate_certs, unless the source variables
// set it.
func TestNetBoxInventorySource(t *testing.T) {
	g := newInjectRig(t)
	inj := sourceInjectors["netbox"]
	if !cloudProvidersRun["netbox"] {
		t.Fatal("netbox is not a cloud provider: its credential would not be its cloud credential")
	}
	if got := inj.filename(nil); got != "nb_inventory.yml" {
		t.Errorf("filename = %q, want nb_inventory.yml (verify_file demands it)", got)
	}

	cred := netboxCred(t, g, map[string]any{"host": "https://netbox.example.org", "token": "0123456789abcdef", "verify_ssl": false})
	r := &invUpdateRun{iu: &models.InventoryUpdate{ID: 7, Source: "netbox"}}
	r.pdd = g.pdd
	ci := &credInjector{pdd: g.pdd, logf: func(string, ...any) {}}
	env, err := r.pluginEnv(ci, inj, cred, map[string]any{})
	if err != nil {
		t.Fatal(err)
	}
	for k, want := range map[string]string{"NETBOX_API": "https://netbox.example.org", "NETBOX_TOKEN": "0123456789abcdef", "INVENTORY_UPDATE_ID": "7"} {
		if env[k] != want {
			t.Errorf("env[%s] = %q, want %q", k, env[k], want)
		}
	}

	file := r.inventoryAsDict(inj, cred, map[string]any{"group_by": []any{"sites"}}, env)
	if file["plugin"] != "netbox.netbox.nb_inventory" {
		t.Errorf("plugin = %v", file["plugin"])
	}
	if file["validate_certs"] != false {
		t.Errorf("validate_certs = %v, want the credential's false", file["validate_certs"])
	}
	if _, ok := file["token"]; ok {
		t.Error("the token is written into the inventory file; it belongs in the environment")
	}

	// The source variables win over the credential.
	file = r.inventoryAsDict(inj, cred, map[string]any{"validate_certs": true}, env)
	if file["validate_certs"] != true {
		t.Errorf("validate_certs = %v, want the source variables' true", file["validate_certs"])
	}
	// A credential without the field verifies.
	plain := netboxCred(t, g, map[string]any{"host": "https://netbox.example.org"})
	if file = r.inventoryAsDict(inj, plain, map[string]any{}, env); file["validate_certs"] != true {
		t.Errorf("validate_certs = %v, want true by default", file["validate_certs"])
	}

	if s := sourceImportSettings["netbox"]; s.enabledVar != "status.value" || s.enabledValue != "active" {
		t.Errorf("import settings = %+v, want enabled when status.value is active", s)
	}
}
