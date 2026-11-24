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

// The source composes each host's NetBox identity into netbox_instance_id,
// the variable the importer matches hosts by, unless the source variables
// set it themselves.
func TestNetBoxInstanceID(t *testing.T) {
	g := newInjectRig(t)
	inj := sourceInjectors["netbox"]
	cred := netboxCred(t, g, map[string]any{"host": "https://NetBox.example.org:8443/netbox/", "token": "0123456789abcdef"})
	r := &invUpdateRun{iu: &models.InventoryUpdate{ID: 7, Source: "netbox"}}
	r.pdd = g.pdd
	env := map[string]string{}
	want := "('vm:' if is_virtual else 'device:') ~ id ~ '@netbox.example.org:8443/netbox'"
	composed := func(file map[string]any) map[string]any {
		t.Helper()
		m, ok := file["compose"].(map[string]any)
		if !ok {
			t.Fatalf("compose = %#v, want a map", file["compose"])
		}
		return m
	}

	file := r.inventoryAsDict(inj, cred, map[string]any{}, env)
	if got := composed(file)[netboxInstanceIDVar]; got != want {
		t.Errorf("%s = %v, want %s", netboxInstanceIDVar, got, want)
	}

	// Other composed variables are kept, and the source's own expression wins.
	vars := map[string]any{"compose": map[string]any{"rack_name": "rack.name"}}
	file = r.inventoryAsDict(inj, cred, vars, env)
	if m := composed(file); m["rack_name"] != "rack.name" || m[netboxInstanceIDVar] != want {
		t.Errorf("compose = %v, want rack_name kept and %s added", m, netboxInstanceIDVar)
	}
	if _, ok := vars["compose"].(map[string]any)[netboxInstanceIDVar]; ok {
		t.Error("the source variables were changed")
	}
	file = r.inventoryAsDict(inj, cred, map[string]any{"compose": map[string]any{netboxInstanceIDVar: "serial"}}, env)
	if got := composed(file)[netboxInstanceIDVar]; got != "serial" {
		t.Errorf("%s = %v, want the source's serial", netboxInstanceIDVar, got)
	}
	// A compose the plugin will reject is left alone.
	if file = r.inventoryAsDict(inj, cred, map[string]any{"compose": "id"}, env); file["compose"] != "id" {
		t.Errorf("compose = %v, want the string left for the plugin", file["compose"])
	}
	// api_endpoint in the source variables is the NetBox the plugin reads,
	// so it names the NetBox instead of the credential's URL.
	file = r.inventoryAsDict(inj, cred, map[string]any{"api_endpoint": "http://Other.example.org/"}, env)
	if got := composed(file)[netboxInstanceIDVar]; got != "('vm:' if is_virtual else 'device:') ~ id ~ '@other.example.org'" {
		t.Errorf("%s = %v, want the source's api_endpoint", netboxInstanceIDVar, got)
	}
	// A credential whose URL has no host still gets the type and id.
	plain := netboxCred(t, g, map[string]any{"host": "netbox"})
	file = r.inventoryAsDict(inj, plain, map[string]any{}, env)
	if got := composed(file)[netboxInstanceIDVar]; got != "('vm:' if is_virtual else 'device:') ~ id" {
		t.Errorf("%s = %v, want no NetBox suffix", netboxInstanceIDVar, got)
	}

	if s := sourceImportSettings["netbox"]; s.instanceIDVar != netboxInstanceIDVar {
		t.Errorf("instance id var = %q, want %s", s.instanceIDVar, netboxInstanceIDVar)
	}
}
