package netbox

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"sort"
	"strconv"
	"strings"
)

// The incremental gate decides whether a sync has anything to fetch.
//
// The inventory importer performs a full reconcile: with overwrite set it
// deletes every host and group in the database that is absent from the
// payload. A partial payload built from changelog deltas would therefore
// delete everything that did not change, so nothing here builds deltas. It
// answers one question before the expensive work starts, whether anything
// relevant has changed at all, and lets the run skip the device and
// virtual machine fetch when the answer is no.
//
// NetBox's object-change ids are a plain auto-increment sequence, so the
// position of the last sync is a single integer. Ids are used rather than
// timestamps because a change committed at T but not visible until after
// a query for T would be lost permanently from a time window, and never
// from an id watermark.
//
// Every uncertainty resolves towards fetching. A missing position, a pruned
// changelog, an unrecognised object type, a failed previous run and the
// skip ceiling all produce a full fetch, because a needless fetch costs
// time while a needless skip leaves the inventory wrong and the job green.

const (
	// ObjectTypesPath lists every object type this NetBox has.
	ObjectTypesPath = "/api/core/object-types/"
	// DefaultMaxSkips is the full fetch forced after this many consecutive
	// skips, bounding how stale an inventory can get from a change the
	// changelog never recorded: a direct database write, a bulk load
	// outside the request path, or a restore.
	DefaultMaxSkips = 24
)

// SyncState is the bookkeeping kept on the inventory source
// (source_sync_state): the changelog position and skip streak of the
// incremental gate, and the webhook burst waiting to settle. The JSON keys
// are the ones the old application wrote.
type SyncState struct {
	ChangelogID *int64 `json:"changelog_id,omitempty"`
	Skips       int    `json:"skips,omitempty"`
	NetBoxURL   string `json:"netbox_url,omitempty"`
	Webhook     *Burst `json:"webhook,omitempty"`
}

// ParseSyncState reads the column; empty or null is the zero state.
func ParseSyncState(raw []byte) (SyncState, error) {
	var s SyncState
	if len(strings.TrimSpace(string(raw))) == 0 || string(raw) == "null" {
		return s, nil
	}
	if err := json.Unmarshal(raw, &s); err != nil {
		return s, fmt.Errorf("source_sync_state: %w", err)
	}
	return s, nil
}

// Decision is whether to fetch, why, and the position to record afterwards.
type Decision struct {
	Fetch     bool
	Reason    string
	Watermark *int64
}

var objectTypes = &namesCache{}

// asInt64 reads a NetBox id or count, whatever the decoder made of it.
func asInt64(v any) (int64, bool) {
	switch x := v.(type) {
	case json.Number:
		n, err := x.Int64()
		return n, err == nil
	case float64:
		return int64(x), true
	case int:
		return int64(x), true
	case int64:
		return x, true
	case string:
		n, err := strconv.ParseInt(x, 10, 64)
		return n, err == nil
	}
	return 0, false
}

// edgeChangeID is the first change id in one direction, or nil when there
// are none.
func edgeChangeID(ctx context.Context, api API, ordering string) (*int64, error) {
	payload, err := api.Get(ctx, ChangelogPath, url.Values{"limit": {"1"}, "ordering": {ordering}, "fields": {"id"}})
	if err != nil {
		return nil, err
	}
	results, _ := payload["results"].([]any)
	if len(results) == 0 {
		return nil, nil
	}
	first, _ := results[0].(map[string]any)
	if id, ok := asInt64(first["id"]); ok {
		return &id, nil
	}
	return nil, nil
}

// LatestChangeID is the newest change id, nil for an empty changelog.
func LatestChangeID(ctx context.Context, api API) (*int64, error) {
	return edgeChangeID(ctx, api, "-id")
}

// OldestChangeID is the oldest change id still held, nil for an empty one.
func OldestChangeID(ctx context.Context, api API) (*int64, error) {
	return edgeChangeID(ctx, api, "id")
}

// knownObjectTypes is every object type this NetBox has, as app_label.model.
func knownObjectTypes(ctx context.Context, api API) (map[string]bool, error) {
	key, err := cacheKey(ctx, api, "object-types", "")
	if err != nil {
		return nil, err
	}
	if cached, ok := objectTypes.get(key); ok {
		return toSet(cached), nil
	}
	rows, err := api.Paginate(ctx, ObjectTypesPath, url.Values{"fields": {"app_label,model"}})
	if err != nil {
		return nil, err
	}
	types := map[string]bool{}
	for _, t := range rows {
		if truthy(t["app_label"]) && truthy(t["model"]) {
			types[str(t["app_label"])+"."+str(t["model"])] = true
		}
	}
	if len(types) > 0 {
		objectTypes.set(key, sortedSet(types))
	}
	return types, nil
}

// WatchTypes is the object types to watch, or nil to watch everything.
// changelog_watch_all is the escape hatch for an operator who would rather
// fetch on any change at all than trust a curated list.
func WatchTypes(cfg Config) []string {
	if cfg.ChangelogWatchAll {
		return nil
	}
	return append([]string(nil), WatchedObjectTypes...)
}

// ChangesSince is how many changes above watermark touch the given object
// types (all of them when types is nil). Only the count is read: NetBox
// returns it alongside the first page, so one request with a page size of
// one answers the question.
func ChangesSince(ctx context.Context, api API, watermark int64, types []string) (int64, error) {
	params := url.Values{"id__gt": {strconv.FormatInt(watermark, 10)}, "limit": {"1"}, "fields": {"id"}}
	for _, t := range types {
		// Repeated, which is how NetBox takes a multiple-choice filter.
		params.Add("changed_object_type", t)
	}
	payload, err := api.Get(ctx, ChangelogPath, params)
	if err != nil {
		return 0, err
	}
	count, _ := asInt64(payload["count"])
	return count, nil
}

// Decide is whether this run should fetch from NetBox, and the position to
// record afterwards. state is the bookkeeping the last run of this source
// left behind; previousFailed is whether that run did not succeed, in which
// case its position cannot be trusted: it was recorded before the import
// ran, so trusting it would skip past work that never landed.
func Decide(ctx context.Context, api API, state SyncState, cfg Config, previousFailed bool) (Decision, error) {
	fetch := func(reason string, watermark *int64) Decision {
		return Decision{Fetch: true, Reason: reason, Watermark: watermark}
	}

	// Read the position before fetching anything, never after. A change
	// landing while the fetch runs then has an id above this watermark and
	// is picked up by the next run, where reading afterwards would swallow
	// it.
	latest, err := LatestChangeID(ctx, api)
	if err != nil {
		return Decision{}, err
	}
	if latest == nil {
		return fetch("the NetBox changelog is empty, so it cannot say what changed", nil), nil
	}
	if previousFailed {
		return fetch("the previous sync of this source did not succeed", latest), nil
	}
	if state.ChangelogID == nil {
		return fetch("this source has no recorded changelog position yet", latest), nil
	}
	watermark := *state.ChangelogID
	if state.NetBoxURL != "" && state.NetBoxURL != api.BaseURL() {
		return fetch("the NetBox URL changed since the last sync", latest), nil
	}
	if cfg.IncrementalMaxSkips > 0 && state.Skips >= cfg.IncrementalMaxSkips {
		return fetch(fmt.Sprintf("the ceiling of %d skipped runs in a row was reached", cfg.IncrementalMaxSkips), latest), nil
	}

	oldest, err := OldestChangeID(ctx, api)
	if err != nil {
		return Decision{}, err
	}
	// Ids are not gapless, because a rolled back transaction still consumes
	// one, so this can report a gap that was never a real change. That
	// costs one unnecessary fetch, which is the direction to be wrong in.
	if oldest == nil || *oldest > watermark+1 {
		return fetch(fmt.Sprintf("changelog entries after position %d have been pruned, so the gap cannot be read", watermark), latest), nil
	}
	if *latest <= watermark {
		return Decision{Fetch: false, Reason: fmt.Sprintf("no NetBox changes at all since position %d", watermark), Watermark: &watermark}, nil
	}

	types := WatchTypes(cfg)
	if len(types) > 0 {
		known, err := knownObjectTypes(ctx, api)
		if err != nil {
			return Decision{}, err
		}
		var unknown []string
		for _, t := range types {
			if !known[t] {
				unknown = append(unknown, t)
			}
		}
		if len(unknown) > 0 {
			sort.Strings(unknown)
			return fetch(fmt.Sprintf("this NetBox has no object type %s, so the watch list cannot be trusted", strings.Join(unknown, ", ")), latest), nil
		}
	}
	count, err := ChangesSince(ctx, api, watermark, types)
	if err != nil {
		return Decision{}, err
	}
	if count == 0 {
		return Decision{Fetch: false, Reason: fmt.Sprintf("none of the %d NetBox changes since position %d affect this inventory", *latest-watermark, watermark), Watermark: latest}, nil
	}
	return fetch(fmt.Sprintf("%d NetBox change(s) since position %d affect this inventory", count, watermark), latest), nil
}

// NextState is the incremental bookkeeping to store after this run, to be
// merged into the source's state (the webhook burst in it is left alone).
// A skipped run carries the streak forward so the ceiling can be reached; a
// run that fetched resets it.
func NextState(api API, d Decision, previousSkips int) SyncState {
	skips := 0
	if !d.Fetch {
		skips = previousSkips + 1
	}
	return SyncState{ChangelogID: d.Watermark, Skips: skips, NetBoxURL: api.BaseURL()}
}

// Merge applies the incremental fields of next onto s, keeping the webhook
// burst, the way the old command merged into the column under the row
// lock.
func (s SyncState) Merge(next SyncState) SyncState {
	s.ChangelogID = next.ChangelogID
	s.Skips = next.Skips
	s.NetBoxURL = next.NetBoxURL
	return s
}
