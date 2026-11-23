package netbox

import (
	"encoding/json"
	"strings"
	"testing"
)

// Every case here is about one asymmetry: a needless fetch costs time,
// while a needless skip leaves the inventory wrong and the job green. So
// the tests assert that each uncertainty resolves towards fetching.

func changelogAPI(changes ...map[string]any) *fakeAPI {
	f := newFakeAPI()
	f.changes = changes
	return f
}

func positioned(id int64, url string) SyncState {
	return SyncState{ChangelogID: &id, NetBoxURL: url}
}

func decide(t *testing.T, f *fakeAPI, state SyncState, cfg Config, previousFailed bool) Decision {
	t.Helper()
	resetCaches()
	d, err := Decide(ctx, f, state, cfg, previousFailed, "")
	if err != nil {
		t.Fatal(err)
	}
	return d
}

func wantWatermark(t *testing.T, d Decision, want int64) {
	t.Helper()
	if d.Watermark == nil || *d.Watermark != want {
		t.Fatalf("watermark %v, want %d (%s)", d.Watermark, want, d.Reason)
	}
}

// --- the watch list -------------------------------------------------------------------

func TestWatchAllDropsTheFilter(t *testing.T) {
	if WatchTypes(ParseConfig(map[string]any{"changelog_watch_all": true})) != nil {
		t.Fatal("filter kept")
	}
	equalStrings(t, WatchTypes(defaults()), WatchedObjectTypes)
}

// --- skipping ---------------------------------------------------------------------------

func TestSkipsWhenNothingChangedAtAll(t *testing.T) {
	f := changelogAPI(change(10, "dcim.device"))
	d := decide(t, f, positioned(10, f.base), defaults(), false)
	if d.Fetch {
		t.Fatal(d.Reason)
	}
	wantWatermark(t, d, 10)
}

func TestSkipsWhenTheChangesDoNotTouchTheInventory(t *testing.T) {
	f := changelogAPI(change(10, "dcim.device"), change(11, "circuits.circuit"))
	d := decide(t, f, positioned(10, f.base), defaults(), false)
	if d.Fetch {
		t.Fatal(d.Reason)
	}
	// The position still moves, so the same irrelevant change is not reconsidered.
	wantWatermark(t, d, 11)
}

// --- fetching ---------------------------------------------------------------------------

func TestFetchesOnARelevantChange(t *testing.T) {
	f := changelogAPI(change(10, "dcim.device"), change(11, "extras.configcontext"))
	d := decide(t, f, positioned(10, f.base), defaults(), false)
	if !d.Fetch {
		t.Fatal(d.Reason)
	}
	wantWatermark(t, d, 11)
}

// It records one entry against the config context and none against the
// devices whose host vars just changed.
func TestAConfigContextEditIsNotMissed(t *testing.T) {
	f := changelogAPI(change(10, "dcim.device"), change(11, "extras.configcontext"))
	if !decide(t, f, positioned(10, f.base), defaults(), false).Fetch {
		t.Fatal("skipped")
	}
}

func TestFetchesWithoutARecordedPosition(t *testing.T) {
	d := decide(t, changelogAPI(change(10, "dcim.device")), SyncState{}, defaults(), false)
	if !d.Fetch {
		t.Fatal(d.Reason)
	}
	wantWatermark(t, d, 10)
}

func TestFetchesWhenTheChangelogIsEmpty(t *testing.T) {
	d := decide(t, changelogAPI(), positioned(10, ""), defaults(), false)
	if !d.Fetch || d.Watermark != nil {
		t.Fatalf("%+v", d)
	}
}

// Its position was recorded before its import ran, so trusting it would
// skip past work that never landed.
func TestFetchesAfterAFailedRun(t *testing.T) {
	f := changelogAPI(change(10, "dcim.device"))
	if !decide(t, f, positioned(10, f.base), defaults(), true).Fetch {
		t.Fatal("skipped")
	}
}

func TestFetchesWhenTheNetBoxURLChanged(t *testing.T) {
	f := changelogAPI(change(10, "dcim.device"))
	if !decide(t, f, positioned(10, "https://other.example/"), defaults(), false).Fetch {
		t.Fatal("skipped")
	}
}

// The changelog records what changed in NetBox and nothing about the
// source: new filters, a different grouping option, another credential or
// overwrite turned on all leave it silent, and would otherwise leave the
// inventory as the old settings built it, with the job green.
func TestFetchesWhenTheSourceSettingsChanged(t *testing.T) {
	f := changelogAPI(change(10, "dcim.device"))
	state := positioned(10, f.base)
	state.Fingerprint = Fingerprint("filters: {site: syd}", "token-1")
	resetCaches()
	d, err := Decide(ctx, f, state, defaults(), false, Fingerprint("filters: {site: syd}", "token-2"))
	if err != nil {
		t.Fatal(err)
	}
	if !d.Fetch || !strings.Contains(d.Reason, "settings or credential changed") {
		t.Fatalf("%+v", d)
	}
	wantWatermark(t, d, 10)
	// The same settings skip as before.
	resetCaches()
	d, err = Decide(ctx, f, state, defaults(), false, Fingerprint("filters: {site: syd}", "token-1"))
	if err != nil {
		t.Fatal(err)
	}
	if d.Fetch {
		t.Fatal(d.Reason)
	}
}

// A position recorded by an older release has no fingerprint; that is not
// a change of settings, and the next run records one.
func TestAPositionWithoutAFingerprintIsNotAChange(t *testing.T) {
	f := changelogAPI(change(10, "dcim.device"))
	resetCaches()
	d, err := Decide(ctx, f, positioned(10, f.base), defaults(), false, Fingerprint("anything"))
	if err != nil {
		t.Fatal(err)
	}
	if d.Fetch {
		t.Fatal(d.Reason)
	}
}

func TestFingerprintTellsItsPartsApart(t *testing.T) {
	a, b := Fingerprint("x", "y"), Fingerprint("x", "z")
	if a == b || a != Fingerprint("x", "y") || len(a) != 16 {
		t.Fatalf("%s %s", a, b)
	}
	// Part boundaries count: "xy","" is not "x","y".
	if Fingerprint("xy", "") == Fingerprint("x", "y") {
		t.Fatal("boundaries lost")
	}
}

// A NetBox restored from a backup, or replaced, hands out change ids from
// below the recorded position. Treating that as "nothing since" would
// ignore every change until the sequence climbed past the position, which
// with no skip ceiling is never.
func TestFetchesWhenTheChangelogWentBackwards(t *testing.T) {
	f := changelogAPI(change(80, "dcim.device"))
	d := decide(t, f, positioned(100, f.base), defaults(), false)
	if !d.Fetch || !strings.Contains(d.Reason, "went backwards") {
		t.Fatalf("%+v", d)
	}
	// The position is reset to what this changelog holds.
	wantWatermark(t, d, 80)
}

// Retention defaults to 90 days, so a quiet source's position can outlive
// the entries it would need to read.
func TestFetchesWhenThePositionHasBeenPruned(t *testing.T) {
	f := changelogAPI(change(500, "dcim.device"), change(501, "dcim.device"))
	d := decide(t, f, positioned(10, f.base), defaults(), false)
	if !d.Fetch || !strings.Contains(d.Reason, "pruned") {
		t.Fatalf("%+v", d)
	}
}

func TestAnAdjacentOldestEntryIsNotAGap(t *testing.T) {
	f := changelogAPI(change(11, "dcim.site"))
	d := decide(t, f, positioned(10, f.base), defaults(), false)
	if !d.Fetch || strings.Contains(d.Reason, "pruned") {
		t.Fatalf("%+v", d)
	}
}

func TestFetchesAtTheSkipCeiling(t *testing.T) {
	f := changelogAPI(change(10, "dcim.device"))
	state := positioned(10, f.base)
	state.Skips = DefaultMaxSkips
	d := decide(t, f, state, defaults(), false)
	if !d.Fetch || !strings.Contains(d.Reason, "ceiling") {
		t.Fatalf("%+v", d)
	}
}

func TestTheCeilingIsConfigurable(t *testing.T) {
	f := changelogAPI(change(10, "dcim.device"))
	state := positioned(10, f.base)
	state.Skips = 3
	if !decide(t, f, state, ParseConfig(map[string]any{"incremental_max_skips": 3}), false).Fetch {
		t.Fatal("skipped at the ceiling")
	}
	if decide(t, f, state, ParseConfig(map[string]any{"incremental_max_skips": 4}), false).Fetch {
		t.Fatal("fetched below the ceiling")
	}
	if decide(t, f, state, ParseConfig(map[string]any{"incremental_max_skips": 0}), false).Fetch {
		t.Fatal("fetched with no ceiling")
	}
}

func TestANonsenseCeilingFallsBackToTheDefault(t *testing.T) {
	f := changelogAPI(change(10, "dcim.device"))
	state := positioned(10, f.base)
	state.Skips = 1
	if decide(t, f, state, ParseConfig(map[string]any{"incremental_max_skips": "often"}), false).Fetch {
		t.Fatal("fetched")
	}
}

// A content type NetBox does not have is filtered silently, returning no
// changes, so the watch list would quietly stop covering it.
func TestFetchesWhenAWatchedObjectTypeIsUnknownToThisNetBox(t *testing.T) {
	var known []string
	for _, ty := range WatchedObjectTypes {
		if ty != "extras.configcontext" {
			known = append(known, ty)
		}
	}
	f := changelogAPI(change(10, "dcim.device"), change(11, "circuits.circuit"))
	f.objectTypes = known
	d := decide(t, f, positioned(10, f.base), defaults(), false)
	if !d.Fetch || !strings.Contains(d.Reason, "extras.configcontext") {
		t.Fatalf("%+v", d)
	}
}

// --- bookkeeping ------------------------------------------------------------------------

func TestASkipExtendsTheStreakAndAFetchResetsIt(t *testing.T) {
	f := newFakeAPI()
	ten := int64(10)
	if NextState(f, Decision{Fetch: false, Watermark: &ten}, 3, "").Skips != 4 {
		t.Fatal("skip did not extend the streak")
	}
	if NextState(f, Decision{Fetch: true, Watermark: &ten}, 3, "").Skips != 0 {
		t.Fatal("fetch did not reset the streak")
	}
}

func TestTheStateRecordsTheURLAndSettingsItCameFrom(t *testing.T) {
	f := newFakeAPI()
	ten := int64(10)
	next := NextState(f, Decision{Fetch: true, Watermark: &ten}, 0, "abc")
	if next.NetBoxURL != f.base {
		t.Fatal("url not recorded")
	}
	if next.Fingerprint != "abc" {
		t.Fatal("fingerprint not recorded")
	}
	merged := SyncState{Fingerprint: "old", Webhook: &Burst{Events: 1}}.Merge(next)
	if merged.Fingerprint != "abc" || merged.Webhook == nil || merged.Webhook.Events != 1 {
		t.Fatalf("%+v", merged)
	}
}

func TestTheCountQueryAsksForOneRowAndFiltersByType(t *testing.T) {
	f := changelogAPI(change(11, "dcim.site"))
	if _, err := ChangesSince(ctx, f, 10, []string{"dcim.site", "dcim.device"}); err != nil {
		t.Fatal(err)
	}
	last := f.requests[len(f.requests)-1]
	if last.params.Get("limit") != "1" || last.params.Get("id__gt") != "10" {
		t.Fatalf("%v", last.params)
	}
	equalStrings(t, last.params["changed_object_type"], []string{"dcim.site", "dcim.device"})
}

func TestMergeKeepsTheWebhookBurst(t *testing.T) {
	ten, twelve := int64(10), int64(12)
	current := SyncState{ChangelogID: &ten, Skips: 2, NetBoxURL: "a", Webhook: &Burst{Events: 3}}
	merged := current.Merge(SyncState{ChangelogID: &twelve, Skips: 0, NetBoxURL: "b"})
	if *merged.ChangelogID != 12 || merged.Skips != 0 || merged.NetBoxURL != "b" || merged.Webhook == nil || merged.Webhook.Events != 3 {
		t.Fatalf("%+v", merged)
	}
}

func TestSyncStateRoundTripsTheOldApplicationsKeys(t *testing.T) {
	raw := `{"changelog_id": 2162, "skips": 1, "netbox_url": "http://netbox:8080/", "webhook": {"dirty_since": "2026-11-18T03:00:00+00:00", "last_event_at": "2026-11-18T03:00:05+00:00", "events": 12, "change_id": 2170, "object_types": ["dcim.device"]}}`
	s, err := ParseSyncState([]byte(raw))
	if err != nil {
		t.Fatal(err)
	}
	if *s.ChangelogID != 2162 || s.Skips != 1 || s.Webhook.Events != 12 || *s.Webhook.ChangeID != 2170 {
		t.Fatalf("%+v", s)
	}
	out, _ := json.Marshal(s)
	for _, key := range []string{`"changelog_id":2162`, `"netbox_url":"http://netbox:8080/"`, `"object_types":["dcim.device"]`} {
		if !strings.Contains(string(out), key) {
			t.Fatalf("%s missing from %s", key, out)
		}
	}
	for _, empty := range []string{"", "null", "{}"} {
		if s, err := ParseSyncState([]byte(empty)); err != nil || s.ChangelogID != nil || s.Webhook != nil {
			t.Fatalf("%q: %+v %v", empty, s, err)
		}
	}
}
