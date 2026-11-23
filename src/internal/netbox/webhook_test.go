package netbox

import (
	"testing"
	"time"
)

// The measured behaviour these exist to contain: one bulk PATCH of twelve
// devices through a single NetBox API call produced twelve webhooks. The
// rules here are what stop that becoming twelve inventory updates.

func burst(now time.Time, secondsAgo int) *Burst {
	moment := now.Add(-time.Duration(secondsAgo) * time.Second).UTC().Format(time.RFC3339Nano)
	return &Burst{DirtySince: moment, LastEventAt: moment, Events: 1}
}

// --- which events matter --------------------------------------------------------------

// One list, so the push and poll paths cannot disagree about what counts.
func TestWatchedTypesAreTheOnesTheIncrementalGateUses(t *testing.T) {
	for _, ty := range WatchedObjectTypes {
		if !IsWatched(ty, defaults()) {
			t.Errorf("%s not watched", ty)
		}
	}
}

func TestAnUnrelatedObjectTypeIsIgnored(t *testing.T) {
	if IsWatched("ipam.prefix", defaults()) || IsWatched("circuits.circuit", defaults()) {
		t.Fatal("unrelated type watched")
	}
}

func TestWatchAllAcceptsAnything(t *testing.T) {
	if !IsWatched("ipam.prefix", ParseConfig(map[string]any{"changelog_watch_all": true})) {
		t.Fatal("ignored under watch all")
	}
}

// --- the debounce window ----------------------------------------------------------------

func TestTheWindowIsReadFromTheSourceVariables(t *testing.T) {
	if defaults().WebhookDebounceSeconds != DefaultDebounceSeconds {
		t.Fatal("default")
	}
	if ParseConfig(map[string]any{"webhook_debounce_seconds": 45}).WebhookDebounceSeconds != 45 {
		t.Fatal("45")
	}
	if ParseConfig(map[string]any{"webhook_debounce_seconds": "soon"}).WebhookDebounceSeconds != DefaultDebounceSeconds {
		t.Fatal("nonsense")
	}
	if ParseConfig(map[string]any{"webhook_debounce_seconds": -5}).WebhookDebounceSeconds != 0 {
		t.Fatal("negative")
	}
}

func TestABurstIsActedOnOnlyOnceItGoesQuiet(t *testing.T) {
	now := time.Now()
	for age, settled := range map[int]bool{0: false, DefaultDebounceSeconds - 1: false, DefaultDebounceSeconds: true, 600: true} {
		if got := burst(now, age).Settled(now, defaults()); got != settled {
			t.Errorf("age %d: settled %v", age, got)
		}
	}
}

// A long bulk edit keeps extending the burst rather than syncing partway
// through it.
func TestALaterWebhookPushesTheWindowOut(t *testing.T) {
	now := time.Now()
	b := burst(now, 600)
	b.LastEventAt = now.UTC().Format(time.RFC3339Nano)
	if b.Settled(now, defaults()) {
		t.Fatal("settled")
	}
}

func TestUnreadableStateSyncsRatherThanWedgingTheSource(t *testing.T) {
	now := time.Now()
	if !(&Burst{LastEventAt: "not a time"}).Settled(now, defaults()) || !(&Burst{}).Settled(now, defaults()) {
		t.Fatal("wedged")
	}
}

// The old application wrote Python isoformat stamps; they still parse.
func TestAStampFromTheOldApplicationParses(t *testing.T) {
	b := &Burst{LastEventAt: "2026-11-18T03:00:05.123456+00:00"}
	if !b.Settled(time.Date(2026, 11, 18, 3, 0, 30, 0, time.UTC), defaults()) {
		t.Fatal("not settled")
	}
	if b.Settled(time.Date(2026, 11, 18, 3, 0, 10, 0, time.UTC), defaults()) {
		t.Fatal("settled early")
	}
}

func TestRecordFoldsAWebhookIntoTheBurst(t *testing.T) {
	now := time.Date(2026, 11, 23, 10, 0, 0, 0, time.UTC)
	b := &Burst{}
	b.Record(now, "dcim.device", []int64{5, 9})
	b.Record(now.Add(2*time.Second), "dcim.site", []int64{7})
	b.Record(now.Add(3*time.Second), "dcim.device", nil)
	if b.Events != 3 || b.DirtySince != "2026-11-23T10:00:00Z" || b.LastEventAt != "2026-11-23T10:00:03Z" {
		t.Fatalf("%+v", b)
	}
	if b.ChangeID == nil || *b.ChangeID != 9 {
		t.Fatalf("change id %v", b.ChangeID)
	}
	equalStrings(t, b.ObjectTypes, []string{"dcim.device", "dcim.site"})
}
