// Package netbox builds an inventory from the NetBox REST API for the
// netbox inventory source. The task process calls it on the control plane:
// no ansible-inventory, no netbox.netbox collection, no execution
// environment. What it returns is the JSON ansible-inventory --list would
// have printed, so the importer in internal/tasks handles the hosts and
// groups the same way for this source as for every other.
//
// REST rather than GraphQL: NetBox 4.0 swapped Graphene for Strawberry,
// which changed the filter syntax and renamed fields. NetBox 4.6 is the
// floor; older releases have REST performance problems, and holding that
// line keeps compatibility shims for moved endpoints and renamed fields
// out of the client (the changelog moved to /api/core/ in 4.0, device_role
// became role).
//
// The pieces: Client talks to NetBox; BuildInventory turns its objects into
// hosts and groups; ValidateFilters checks a source's filters against the
// API schema before anything is fetched; Decide asks the changelog whether a
// run has anything to fetch; Burst is a webhook burst waiting to settle; and
// Sync runs one inventory update end to end, without touching the database.
package netbox

import (
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"
)

// Config is an inventory source's source_vars as this package reads them.
// Every setting is optional; the defaults are the zero values except where
// ParseConfig says otherwise. docs/inventory/netbox_inventory.md lists them.
type Config struct {
	// Filters are query parameters sent with both the device and the
	// virtual machine request; DeviceFilters and VMFilters apply to one
	// each, on top of Filters. The two endpoints do not accept the same
	// names (NetBox 4.7 publishes 369 for one and 224 for the other).
	Filters, DeviceFilters, VMFilters map[string]any
	// ExcludeOffline adds status=active, dropping non-active objects
	// instead of importing them disabled.
	ExcludeOffline bool
	// ConfigContext requests config context at all (on by default). It is
	// the expensive half of listing devices in NetBox.
	ConfigContext bool
	// MergeConfigContext merges the rendered context flat into the host
	// variables (on by default), so a play reads cis_profile rather than
	// netbox_config_context.cis_profile.
	MergeConfigContext bool
	// FlattenCustomFields also merges custom fields flat.
	FlattenCustomFields bool
	// GroupByStatus and GroupByTag create status_* and tag_* groups (both
	// on by default).
	GroupByStatus, GroupByTag bool
	// OOBIPAsPrimaryIP prefers the out-of-band address for ansible_host.
	OOBIPAsPrimaryIP bool
	// UseFQDN names hosts by the primary IP's DNS name where there is one.
	UseFQDN bool
	// IncludeRaw keeps the whole NetBox object as netbox_raw.
	IncludeRaw bool
	// Incremental skips a sync when the NetBox changelog shows nothing
	// relevant changed; IncrementalMaxSkips forces a full sync after that
	// many skips in a row (24 by default, 0 for no ceiling);
	// ChangelogWatchAll treats any change as relevant.
	Incremental         bool
	IncrementalMaxSkips int
	ChangelogWatchAll   bool
	// WebhookDebounceSeconds is the quiet period after the last webhook of
	// a burst before a sync is launched (15 by default).
	WebhookDebounceSeconds int
}

// ParseConfig reads the source variables the way the old command read its
// dict: Python truthiness for the flags, int() with a fallback to the
// default for the numbers, and a dict or nothing for the filters.
func ParseConfig(vars map[string]any) Config {
	cfg := Config{ConfigContext: true, MergeConfigContext: true, GroupByStatus: true, GroupByTag: true,
		IncrementalMaxSkips: DefaultMaxSkips, WebhookDebounceSeconds: DefaultDebounceSeconds}
	flag := func(key string, def bool) bool {
		v, ok := vars[key]
		if !ok {
			return def
		}
		return truthy(v)
	}
	cfg.Filters = dictOpt(vars, "filters")
	cfg.DeviceFilters = dictOpt(vars, "device_filters")
	cfg.VMFilters = dictOpt(vars, "vm_filters")
	cfg.ExcludeOffline = flag("exclude_offline", false)
	cfg.ConfigContext = flag("config_context", true)
	cfg.MergeConfigContext = flag("merge_config_context", true)
	cfg.FlattenCustomFields = flag("flatten_custom_fields", false)
	cfg.GroupByStatus = flag("group_by_status", true)
	cfg.GroupByTag = flag("group_by_tag", true)
	cfg.OOBIPAsPrimaryIP = flag("oob_ip_as_primary_ip", false)
	cfg.UseFQDN = flag("use_fqdn", false)
	cfg.IncludeRaw = flag("include_raw", false)
	cfg.Incremental = flag("incremental", false)
	cfg.ChangelogWatchAll = flag("changelog_watch_all", false)
	if v, ok := vars["incremental_max_skips"]; ok {
		if n, ok := pyInt(v); ok {
			cfg.IncrementalMaxSkips = n
		}
	}
	if v, ok := vars["webhook_debounce_seconds"]; ok {
		if n, ok := pyInt(v); ok {
			cfg.WebhookDebounceSeconds = max(0, n)
		}
	}
	return cfg
}

func dictOpt(vars map[string]any, key string) map[string]any {
	if m, ok := vars[key].(map[string]any); ok {
		return m
	}
	return nil
}

// truthy is Python's bool(): nil, false, zero, the empty string and empty
// containers are false, everything else true. The old transform tested its
// inputs this way, and NetBox payloads carry nulls, empty strings and
// empty objects in the places that matters.
func truthy(v any) bool {
	switch x := v.(type) {
	case nil:
		return false
	case bool:
		return x
	case string:
		return x != ""
	case json.Number:
		f, err := x.Float64()
		return err != nil || f != 0
	case float64:
		return x != 0
	case float32:
		return x != 0
	case int:
		return x != 0
	case int64:
		return x != 0
	case int32:
		return x != 0
	case map[string]any:
		return len(x) > 0
	case []any:
		return len(x) > 0
	case []string:
		return len(x) > 0
	}
	return true
}

// pyInt is Python's int() on a setting: whole numbers, numeric strings and
// bools convert; anything else (including a float with a fraction, which
// int() would truncate but which nobody writes for a count) does not.
func pyInt(v any) (int, bool) {
	switch x := v.(type) {
	case int:
		return x, true
	case int64:
		return int(x), true
	case int32:
		return int(x), true
	case bool:
		if x {
			return 1, true
		}
		return 0, true
	case float64:
		if x != math.Trunc(x) || math.IsInf(x, 0) || math.IsNaN(x) {
			return int(x), true
		}
		return int(x), true
	case json.Number:
		if n, err := x.Int64(); err == nil {
			return int(n), true
		}
		if f, err := x.Float64(); err == nil {
			return int(f), true
		}
	case string:
		if n, err := strconv.Atoi(strings.TrimSpace(x)); err == nil {
			return n, true
		}
	}
	return 0, false
}

// idKey is the string of a NetBox id, whatever the decoder made of the
// number, so ids from different payloads can be compared and used as map
// keys. Nil and missing ids are "".
func idKey(v any) string {
	switch x := v.(type) {
	case nil:
		return ""
	case json.Number:
		return x.String()
	case float64:
		return strconv.FormatFloat(x, 'f', -1, 64)
	case string:
		return x
	}
	return fmt.Sprint(v)
}

// str is Python's str() for the values this package turns into names and
// query parameters.
func str(v any) string {
	switch x := v.(type) {
	case nil:
		return ""
	case string:
		return x
	case json.Number:
		return x.String()
	case float64:
		return strconv.FormatFloat(x, 'f', -1, 64)
	case bool:
		if x {
			return "True"
		}
		return "False"
	}
	return fmt.Sprint(v)
}

// Object is an insertion-ordered JSON object. Host variables and the
// inventory itself are written in the order the old transform built them,
// which keeps the job output and any diff of it readable.
type Object struct {
	keys []string
	vals map[string]any
}

// NewObject creates an empty object.
func NewObject() *Object { return &Object{vals: map[string]any{}} }

// Set adds or replaces a key, keeping its position on replace.
func (o *Object) Set(k string, v any) {
	if _, ok := o.vals[k]; !ok {
		o.keys = append(o.keys, k)
	}
	o.vals[k] = v
}

// SetDefault sets a key only when it is absent (dict.setdefault).
func (o *Object) SetDefault(k string, v any) {
	if _, ok := o.vals[k]; !ok {
		o.Set(k, v)
	}
}

// Get returns a value.
func (o *Object) Get(k string) (any, bool) {
	v, ok := o.vals[k]
	return v, ok
}

// Has reports presence.
func (o *Object) Has(k string) bool { _, ok := o.vals[k]; return ok }

// Keys returns the keys in order.
func (o *Object) Keys() []string { return append([]string(nil), o.keys...) }

// Len returns the number of keys.
func (o *Object) Len() int { return len(o.keys) }

// MarshalJSON writes the keys in insertion order.
func (o *Object) MarshalJSON() ([]byte, error) {
	b := []byte{'{'}
	for i, k := range o.keys {
		if i > 0 {
			b = append(b, ',')
		}
		kb, err := json.Marshal(k)
		if err != nil {
			return nil, err
		}
		vb, err := json.Marshal(o.vals[k])
		if err != nil {
			return nil, err
		}
		b = append(b, kb...)
		b = append(b, ':')
		b = append(b, vb...)
	}
	return append(b, '}'), nil
}

// sortedKeys returns a map's keys in order, for deterministic output where
// the old code iterated a dict in payload order.
func sortedKeys(m map[string]any) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}
