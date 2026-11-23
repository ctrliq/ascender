package api

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha512"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/models"
	"github.com/ctrliq/ascender/internal/netbox"
)

// What matters here is what happens to a burst of webhooks: that they
// fold into one pending record, that one sync starts for the whole burst,
// and that a source with an update already in flight is left alone rather
// than having a second queued behind the first.

// postNetBoxWebhook posts a NetBox delivery anonymously, signed with key
// when one is given.
func postNetBoxWebhook(d *dbServer, srcID int64, key string, payload map[string]any) (int, string) {
	d.t.Helper()
	body, _ := json.Marshal(payload)
	r := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/v2/inventory_sources/%d/netbox/", srcID), bytes.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	if key != "" {
		mac := hmac.New(sha512.New, []byte(key))
		mac.Write(body)
		r.Header.Set("X-Hook-Signature", hex.EncodeToString(mac.Sum(nil)))
	}
	w := httptest.NewRecorder()
	d.Routes().ServeHTTP(w, r)
	return w.Code, w.Body.String()
}

func syncState(t *testing.T, d *dbServer, srcID int64) netbox.SyncState {
	t.Helper()
	var raw []byte
	if err := d.Q().QueryRow(context.Background(), `SELECT source_sync_state FROM main_inventorysource WHERE unifiedjobtemplate_ptr_id = $1`, srcID).Scan(&raw); err != nil {
		t.Fatal(err)
	}
	st, err := netbox.ParseSyncState(raw)
	if err != nil {
		t.Fatal(err)
	}
	return st
}

func TestNetBoxWebhooksFoldIntoOneSync(t *testing.T) {
	d := newDBServer(t, "zz-netbox-webhook-test")
	ctx := context.Background()
	var credType int64
	if err := d.Q().QueryRow(ctx, `SELECT id FROM main_credentialtype WHERE namespace = 'netbox' AND managed`).Scan(&credType); err != nil {
		t.Skip("no netbox credential type")
	}
	st, body := d.do("POST", "/api/v2/organizations/", map[string]any{"name": "zz-netbox-webhook-test"})
	d.expect(st, body, http.StatusCreated, "")
	org := d.id(body)
	var cred, inv int64
	t.Cleanup(func() {
		err := d.DB.Tx(ctx, func(tx pgx.Tx) error {
			if inv != 0 {
				if err := models.DeleteInventory(ctx, tx, inv, d.CT, d.Cascade); err != nil {
					return err
				}
			}
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
	st, body = d.do("POST", "/api/v2/credentials/", map[string]any{"name": "zz-netbox-webhook-test", "credential_type": credType, "organization": org,
		"inputs": map[string]any{"host": "http://netbox.example", "token": "zz", "verify_ssl": true}})
	d.expect(st, body, http.StatusCreated, "")
	cred = d.id(body)
	st, body = d.do("POST", "/api/v2/inventories/", map[string]any{"name": "zz-netbox-webhook-test", "organization": org})
	d.expect(st, body, http.StatusCreated, "")
	inv = d.id(body)

	// A webhook service on a source that cannot act on it is refused.
	st, body = d.do("POST", "/api/v2/inventory_sources/", map[string]any{"name": "zz-ec2", "source": "ec2", "inventory": inv, "webhook_service": "netbox"})
	if st != http.StatusBadRequest {
		t.Fatalf("ec2 source with a netbox webhook: %d %s", st, body)
	}
	st, body = d.do("POST", "/api/v2/inventory_sources/", map[string]any{"name": "zz-netbox", "source": "netbox", "inventory": inv, "credential": cred, "webhook_service": "netbox"})
	d.expect(st, body, http.StatusCreated, "")
	src := d.id(body)
	var created map[string]any
	_ = json.Unmarshal([]byte(body), &created)
	if created["webhook_service"] != "netbox" {
		t.Fatalf("webhook_service %v", created["webhook_service"])
	}
	related := created["related"].(map[string]any)
	if related["webhook_receiver"] != fmt.Sprintf("/api/v2/inventory_sources/%d/netbox/", src) {
		t.Fatalf("webhook_receiver %v", related["webhook_receiver"])
	}
	// The key was generated on save and is readable by the inventory's admin.
	st, body = d.do("GET", fmt.Sprintf("/api/v2/inventory_sources/%d/webhook_key/", src), nil)
	d.expect(st, body, http.StatusOK, "")
	var keyResp struct {
		Key string `json:"webhook_key"`
	}
	_ = json.Unmarshal([]byte(body), &keyResp)
	if len(keyResp.Key) != 50 {
		t.Fatalf("webhook key %q", keyResp.Key)
	}
	key := keyResp.Key

	// The signature is the endpoint's only credential.
	if st, body := postNetBoxWebhook(d, src, "", map[string]any{"object_type": "dcim.device"}); st != http.StatusForbidden {
		t.Fatalf("unsigned: %d %s", st, body)
	}
	if st, body := postNetBoxWebhook(d, src, "wrong", map[string]any{"object_type": "dcim.device"}); st != http.StatusForbidden {
		t.Fatalf("badly signed: %d %s", st, body)
	}
	// An object type that cannot change the inventory is acknowledged and dropped.
	if st, body := postNetBoxWebhook(d, src, key, map[string]any{"object_type": "circuits.circuit", "object_change_ids": []int{1}}); st != http.StatusOK {
		t.Fatalf("unwatched: %d %s", st, body)
	}
	if syncState(t, d, src).Webhook != nil {
		t.Fatal("an unwatched type recorded a burst")
	}
	// Twelve deliveries, as a bulk edit of twelve devices produces, fold
	// into one burst that remembers the highest change id and every type.
	for i := 0; i < 12; i++ {
		st, body := postNetBoxWebhook(d, src, key, map[string]any{"event": "updated", "object_type": "dcim.device", "object_change_ids": []int{400 + i}})
		if st != http.StatusAccepted {
			t.Fatalf("delivery %d: %d %s", i, st, body)
		}
	}
	if st, body := postNetBoxWebhook(d, src, key, map[string]any{"event": "updated", "object_type": "extras.configcontext", "object_change_ids": []int{300}}); st != http.StatusAccepted {
		t.Fatalf("config context delivery: %d %s", st, body)
	}
	state := syncState(t, d, src)
	if state.Webhook == nil || state.Webhook.Events != 13 || state.Webhook.ChangeID == nil || *state.Webhook.ChangeID != 411 {
		t.Fatalf("burst %+v", state.Webhook)
	}
	if fmt.Sprint(state.Webhook.ObjectTypes) != "[dcim.device extras.configcontext]" {
		t.Fatalf("object types %v", state.Webhook.ObjectTypes)
	}

	// Not settled yet: nothing launches and the burst stays.
	launched, err := d.LaunchSettledNetBoxSyncs(ctx, time.Now())
	if err != nil || len(launched) != 0 {
		t.Fatalf("unsettled: %v %v", launched, err)
	}
	// An update already in flight defers the launch and keeps the burst.
	srcRow, err := models.GetInventorySource(ctx, d.Q(), src)
	if err != nil {
		t.Fatal(err)
	}
	manual, err := d.CreateInventoryUpdate(ctx, srcRow, nil, "manual", nil)
	if err != nil {
		t.Fatal(err)
	}
	later := time.Now().Add(10 * time.Minute)
	launched, err = d.LaunchSettledNetBoxSyncs(ctx, later)
	if err != nil || len(launched) != 0 {
		t.Fatalf("in flight: %v %v", launched, err)
	}
	if syncState(t, d, src).Webhook == nil {
		t.Fatal("burst dropped while deferred")
	}
	if _, err := d.Q().Exec(ctx, `UPDATE main_unifiedjob SET status = 'successful', finished = now() WHERE id = $1`, manual.ID); err != nil {
		t.Fatal(err)
	}
	// The incremental position shares the column and must survive the clear.
	if err := d.DB.Tx(ctx, func(tx pgx.Tx) error {
		return models.UpdateInventorySourceSyncState(ctx, tx, src, func(stored json.RawMessage) (json.RawMessage, error) {
			st, _ := netbox.ParseSyncState(stored)
			pos := int64(209)
			st.ChangelogID, st.Skips = &pos, 3
			return json.Marshal(st)
		})
	}); err != nil {
		t.Fatal(err)
	}
	// Settled, nothing in flight: one sync for the whole burst.
	launched, err = d.LaunchSettledNetBoxSyncs(ctx, later)
	if err != nil || len(launched) != 1 {
		t.Fatalf("settled: %v %v", launched, err)
	}
	var launchType string
	if err := d.Q().QueryRow(ctx, `SELECT launch_type FROM main_unifiedjob WHERE id = $1`, launched[0]).Scan(&launchType); err != nil || launchType != "webhook" {
		t.Fatalf("launch type %q %v", launchType, err)
	}
	state = syncState(t, d, src)
	if state.Webhook != nil || state.ChangelogID == nil || *state.ChangelogID != 209 || state.Skips != 3 {
		t.Fatalf("state after launch %+v", state)
	}
	// Nothing more to launch, and no second update.
	if launched, err = d.LaunchSettledNetBoxSyncs(ctx, later); err != nil || len(launched) != 0 {
		t.Fatalf("again: %v %v", launched, err)
	}
	var updates int
	if err := d.Q().QueryRow(ctx, `SELECT count(*) FROM main_inventoryupdate WHERE inventory_source_id = $1`, src).Scan(&updates); err != nil || updates != 2 {
		t.Fatalf("%d updates, %v", updates, err)
	}
	// Rotating the key invalidates the old one.
	st, body = d.do("POST", fmt.Sprintf("/api/v2/inventory_sources/%d/webhook_key/", src), nil)
	d.expect(st, body, http.StatusCreated, "")
	if st, body := postNetBoxWebhook(d, src, key, map[string]any{"object_type": "dcim.device"}); st != http.StatusForbidden {
		t.Fatalf("old key still accepted: %d %s", st, body)
	}
	// Clearing the service clears the key.
	st, body = d.do("PATCH", fmt.Sprintf("/api/v2/inventory_sources/%d/", src), map[string]any{"webhook_service": ""})
	d.expect(st, body, http.StatusOK, "")
	var after models.InventorySource
	if err := d.Q().QueryRow(ctx, `SELECT webhook_service, webhook_key FROM main_inventorysource WHERE unifiedjobtemplate_ptr_id = $1`, src).Scan(&after.WebhookService, &after.WebhookKey); err != nil {
		t.Fatal(err)
	}
	if after.WebhookService != "" || after.WebhookKey != "" {
		t.Fatalf("after clearing: %q %q", after.WebhookService, after.WebhookKey)
	}
}

func TestNetBoxSignatureCheck(t *testing.T) {
	body := []byte(`{"event": "updated"}`)
	mac := hmac.New(sha512.New, []byte("secret"))
	mac.Write(body)
	sig := hex.EncodeToString(mac.Sum(nil))
	if !netboxSignatureValid("secret", body, sig) || !netboxSignatureValid("secret", body, " "+sig+"\n") {
		t.Fatal("a valid signature refused")
	}
	for _, bad := range []string{"", "sha512=" + sig, sig[:len(sig)-2], hex.EncodeToString(bytes.Repeat([]byte{0}, 64))} {
		if netboxSignatureValid("secret", body, bad) {
			t.Fatalf("%q accepted", bad)
		}
	}
	if netboxSignatureValid("", body, sig) {
		t.Fatal("an empty key accepted")
	}
}
