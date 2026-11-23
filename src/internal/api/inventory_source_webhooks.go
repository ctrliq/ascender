package api

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha512"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/models"
	"github.com/ctrliq/ascender/internal/netbox"
)

// NetBox event rules post to an inventory source. The delivery never
// launches anything and never carries data into the inventory: it folds
// into the source's pending burst (netbox.Burst), and the task process's
// scheduler pass launches one sync per source once the burst has settled,
// and only when the source has no update already in flight.
//
// NetBox fires one webhook per changed object, not per request: one bulk
// PATCH of twelve devices through a single API call produced twelve POSTs
// of about 6 KB each when measured, so an estate-wide change produces
// hundreds. A sync per webhook would queue hundreds of inventory updates,
// and nothing in the scheduler would collapse them. Applying the one
// changed object would be worse: the importer is a full reconcile, and it
// would delete every host the payload did not mention.

// inventorySourceWebhookChoices are the webhook services an inventory
// source accepts. NetBox is the only one, so the inherited list is
// narrowed rather than offering NetBox on job templates and projects.
var inventorySourceWebhookChoices = [][2]string{{"", "---------"}, {"netbox", "NetBox"}}

// inventorySourceWebhookKey reads (GET) or rotates (POST) the source's
// webhook key, for the inventory's admins.
func (s *Server) inventorySourceWebhookKey(w http.ResponseWriter, r *http.Request) error {
	u, src, err := inventorySourceObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	if !u.IsSuperuser && !s.inventorySourceCanAdmin(c, src) {
		return ErrForbidden
	}
	if r.Method == http.MethodPost {
		if _, err := RequireWrite(r); err != nil {
			return err
		}
		src.WebhookKey = newWebhookKey()
		if _, err := s.Q().Exec(r.Context(), `UPDATE main_inventorysource SET webhook_key = $2 WHERE unifiedjobtemplate_ptr_id = $1`, src.ID, src.WebhookKey); err != nil {
			return err
		}
		WriteJSON(w, http.StatusCreated, NewOMap().Set("webhook_key", src.WebhookKey))
		return nil
	}
	WriteJSON(w, 200, NewOMap().Set("webhook_key", src.WebhookKey))
	return nil
}

// inventorySourceWebhookReceive is the NetBox receiver,
// /api/v2/inventory_sources/{id}/netbox/. NetBox signs the raw body with
// HMAC-SHA512 under the webhook's secret and sends the hex digest in
// X-Hook-Signature. The secret is optional on NetBox's side, so a request
// without a signature is refused rather than trusted: the signature is the
// only credential this endpoint has.
func (s *Server) inventorySourceWebhookReceive(w http.ResponseWriter, r *http.Request) error {
	body, err := io.ReadAll(io.LimitReader(r.Body, 32<<20))
	if err != nil {
		return err
	}
	id, err := PathID(r)
	if err != nil {
		return ErrForbidden
	}
	ctx := r.Context()
	var key, sourceVars string
	if err := s.Q().QueryRow(ctx, `SELECT webhook_key, source_vars FROM main_inventorysource WHERE unifiedjobtemplate_ptr_id = $1 AND source = 'netbox' AND webhook_service = 'netbox' AND webhook_key <> ''`, id).Scan(&key, &sourceVars); err != nil {
		if db.IsNoRows(err) {
			return ErrForbidden
		}
		return err
	}
	if !netboxSignatureValid(key, body, r.Header.Get("X-Hook-Signature")) {
		return ErrForbidden
	}
	var data map[string]any
	if len(bytes.TrimSpace(body)) > 0 {
		dec := json.NewDecoder(bytes.NewReader(body))
		dec.UseNumber()
		if err := dec.Decode(&data); err != nil {
			return BadRequest("JSON parse error - " + err.Error())
		}
	}
	objectType, _ := data["object_type"].(string)
	vars, _ := ParseVars(sourceVars)
	cfg := netbox.ParseConfig(vars)
	// Nothing in the payload is used beyond its object type and the change
	// ids, and the type is checked against the same watch list the
	// incremental gate uses, so push and poll cannot disagree about what
	// matters.
	if !netbox.IsWatched(objectType, cfg) {
		return webhookMessage(w, http.StatusOK, "Webhook ignored, that object type does not affect this inventory.")
	}
	var changeIDs []int64
	if list, ok := data["object_change_ids"].([]any); ok {
		for _, v := range list {
			if n, ok := v.(json.Number); ok {
				if i, err := n.Int64(); err == nil {
					changeIDs = append(changeIDs, i)
				}
			}
		}
	}
	events := 0
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		// Under the source's row lock: deliveries from a bulk edit arrive
		// concurrently, and two landing together would otherwise each write
		// a burst built from the state they read before the other.
		return models.UpdateInventorySourceSyncState(ctx, tx, id, func(stored json.RawMessage) (json.RawMessage, error) {
			state, err := netbox.ParseSyncState(stored)
			if err != nil {
				state = netbox.SyncState{}
			}
			if state.Webhook == nil {
				state.Webhook = &netbox.Burst{}
			}
			state.Webhook.Record(time.Now(), objectType, changeIDs)
			events = state.Webhook.Events
			return json.Marshal(state)
		})
	})
	if err != nil {
		return err
	}
	WriteJSON(w, http.StatusAccepted, NewOMap().Set("message", "Webhook accepted, a sync will run once the changes settle.").Set("pending_events", events))
	return nil
}

// netboxSignatureValid checks NetBox's X-Hook-Signature: the hex HMAC-SHA512
// of the body under the webhook's secret.
func netboxSignatureValid(key string, body []byte, header string) bool {
	if key == "" || header == "" {
		return false
	}
	mac := hmac.New(sha512.New, []byte(key))
	mac.Write(body)
	want := hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(want), []byte(strings.ToLower(strings.TrimSpace(header))))
}

// LaunchSettledNetBoxSyncs starts one update for each netbox inventory
// source whose webhook burst has been quiet for its debounce window, as of
// now, and returns the updates started. The task process calls it from its
// scheduler pass. A source with an update already pending or running is
// left dirty and reconsidered next pass rather than having a second update
// queued behind the first: that update may have started before the change
// landed, so the burst is not cleared until a sync is launched for it. For
// the same reason only the burst this pass looked at is cleared: a
// delivery that lands between the look and the clear stays recorded, and
// the next pass launches again once the update just started has finished.
func (s *Server) LaunchSettledNetBoxSyncs(ctx context.Context, now time.Time) ([]int64, error) {
	type candidate struct {
		id    int64
		vars  string
		state []byte
	}
	rows, err := s.Q().Query(ctx, `SELECT ujt.id, src.source_vars, src.source_sync_state FROM main_inventorysource src JOIN main_unifiedjobtemplate ujt ON ujt.id = src.unifiedjobtemplate_ptr_id
		WHERE src.source = 'netbox' AND src.source_sync_state ? 'webhook' ORDER BY ujt.id`)
	if err != nil {
		return nil, err
	}
	var candidates []candidate
	for rows.Next() {
		var c candidate
		if err := rows.Scan(&c.id, &c.vars, &c.state); err != nil {
			rows.Close()
			return nil, err
		}
		candidates = append(candidates, c)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	var launched []int64
	for _, c := range candidates {
		state, err := netbox.ParseSyncState(c.state)
		if err != nil || state.Webhook == nil {
			continue
		}
		vars, _ := ParseVars(c.vars)
		if !state.Webhook.Settled(now, netbox.ParseConfig(vars)) {
			continue
		}
		var inFlight bool
		if err := s.Q().QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM main_inventoryupdate iu JOIN main_unifiedjob uj ON uj.id = iu.unifiedjob_ptr_id
			WHERE iu.inventory_source_id = $1 AND uj.status IN ('new', 'pending', 'waiting', 'running'))`, c.id).Scan(&inFlight); err != nil {
			return launched, err
		}
		if inFlight {
			s.Log.DebugContext(ctx, "netbox webhook sync deferred, an update is already in flight", "inventory_source", c.id)
			continue
		}
		src, err := models.GetInventorySource(ctx, s.Q(), c.id)
		if err != nil {
			s.Log.ErrorContext(ctx, "netbox webhook sync", "inventory_source", c.id, "err", err)
			continue
		}
		iu, err := s.CreateInventoryUpdate(ctx, src, nil, "webhook", nil)
		if err != nil {
			s.Log.ErrorContext(ctx, "could not start a webhook triggered sync", "inventory_source", c.id, "err", err)
			continue
		}
		// The burst is dropped once a sync is launched for it, and nothing
		// else in the state (the changelog position) is touched. A burst
		// that grew since it was read is left: the sync just launched may
		// have fetched before the change behind the new delivery landed.
		err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
			return models.UpdateInventorySourceSyncState(ctx, tx, c.id, func(stored json.RawMessage) (json.RawMessage, error) {
				st, err := netbox.ParseSyncState(stored)
				if err != nil || !st.Webhook.Same(state.Webhook) {
					return stored, nil
				}
				st.Webhook = nil
				return json.Marshal(st)
			})
		})
		if err != nil {
			s.Log.ErrorContext(ctx, "clearing the webhook burst", "inventory_source", c.id, "err", err)
		}
		s.Log.InfoContext(ctx, "started an inventory update from NetBox webhooks", "inventory_update", iu.ID, "inventory_source", c.id, "webhooks", state.Webhook.Events)
		launched = append(launched, iu.ID)
	}
	return launched, nil
}
