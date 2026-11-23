package netbox

import (
	"sort"
	"time"
)

// NetBox event rules trigger syncs, without drowning in them.
//
// NetBox fires one webhook per changed object, not per request. A single
// bulk edit of twelve devices through one API call produced twelve POSTs
// of about 6 KB each when measured, so an estate-wide change produces
// hundreds. Launching a sync per webhook would queue hundreds of inventory
// updates, and nothing in the scheduler would collapse them.
//
// So a webhook never launches anything and never carries data into the
// inventory. It folds into the source's pending Burst, and the task
// process's periodic pass launches at most one sync per source once the
// burst has settled, and only when that source has no update already in
// flight. The receiver, the row lock and the launch live in the api and
// tasks packages; this file is the rules.

// DefaultDebounceSeconds is how long after the last webhook of a burst to
// wait before syncing. Bounded below by the period of the pass that drains
// the queue, so the real latency is this plus up to one tick.
const DefaultDebounceSeconds = 15

// IsWatched is whether a change to this NetBox object type can alter the
// inventory. The same watch list the incremental gate uses, so push and
// poll cannot disagree about what matters.
func IsWatched(objectType string, cfg Config) bool {
	if cfg.ChangelogWatchAll {
		return true
	}
	for _, t := range WatchedObjectTypes {
		if t == objectType {
			return true
		}
	}
	return false
}

// Burst is the webhooks a source has received and not yet synced for, kept
// under "webhook" in its SyncState.
type Burst struct {
	DirtySince  string   `json:"dirty_since,omitempty"`
	LastEventAt string   `json:"last_event_at,omitempty"`
	Events      int      `json:"events"`
	ChangeID    *int64   `json:"change_id,omitempty"`
	ObjectTypes []string `json:"object_types"`
}

// Record folds one webhook into the burst: the first and latest arrival,
// the count, the highest object change id seen and the object types.
func (b *Burst) Record(now time.Time, objectType string, changeIDs []int64) {
	stamp := now.UTC().Format(time.RFC3339Nano)
	if b.DirtySince == "" {
		b.DirtySince = stamp
	}
	b.LastEventAt = stamp
	b.Events++
	for _, id := range changeIDs {
		if b.ChangeID == nil || id > *b.ChangeID {
			v := id
			b.ChangeID = &v
		}
	}
	if b.ObjectTypes == nil {
		b.ObjectTypes = []string{}
	}
	if objectType != "" && !contains(b.ObjectTypes, objectType) {
		b.ObjectTypes = append(b.ObjectTypes, objectType)
		sort.Strings(b.ObjectTypes)
	}
}

// Settled is whether the burst has been quiet for the debounce window.
// Unreadable state still syncs rather than wedging the source.
func (b *Burst) Settled(now time.Time, cfg Config) bool {
	last, err := time.Parse(time.RFC3339Nano, b.LastEventAt)
	if err != nil {
		return true
	}
	return now.Sub(last) >= time.Duration(cfg.WebhookDebounceSeconds)*time.Second
}
