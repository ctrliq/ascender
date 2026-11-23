package netbox

import (
	"context"
	"fmt"
	"net/url"
	"sort"
	"strings"
)

// Sync runs one inventory update against NetBox, without the database.
// The task process supplies the client, the parsed source variables and
// the source's state, writes what it logs into the job output, imports the
// inventory and stores the state that comes back.

const (
	// siteLookupFields are the fields of a site a device's own payload
	// never carries.
	siteLookupFields = "id,name,slug,region,group,time_zone,facility"
	// treeLookupFields: regions and site groups are trees, so the parent is
	// needed to walk them.
	treeLookupFields = "id,name,slug,parent"
)

// Result is what one run produced.
type Result struct {
	// Inventory is the inventory to import, nil when the run was skipped.
	Inventory *Inventory
	// Skipped is set when the incremental gate found nothing to fetch.
	Skipped bool
	// Decision is the gate's answer, for incremental sources.
	Decision *Decision
	// Next is the incremental bookkeeping to merge into the source's state,
	// for incremental sources; see SyncState.Merge.
	Next *SyncState
}

// Sync fetches from NetBox and builds the inventory. out receives the
// progress lines an operator reads in the job output; previousFailed is
// whether the source's last update did not succeed. An error is one line
// for that output, not a traceback.
func Sync(ctx context.Context, client *Client, cfg Config, state SyncState, previousFailed bool, out func(format string, args ...any)) (*Result, error) {
	if out == nil {
		out = func(string, ...any) {}
	}
	client.Logf = out
	out("Connecting to NetBox at %s", client.BaseURL())
	version, err := client.RequireSupportedVersion(ctx)
	if err != nil {
		return nil, err
	}
	if version == "" {
		version = "unknown"
	}
	out("NetBox version %s", version)

	// Filters are checked before the incremental gate, not after. A source
	// whose filters are wrong would otherwise keep skipping and reporting
	// success, and only reveal the mistake whenever something in NetBox
	// happens to change. The schema behind the check is cached per NetBox
	// version, so this costs a set lookup.
	deviceFilters := filtersFor(cfg, cfg.DeviceFilters)
	vmFilters := filtersFor(cfg, cfg.VMFilters)
	if err := ValidateFilters(ctx, client, DevicePath, deviceFilters, "device"); err != nil {
		return nil, err
	}
	if err := ValidateFilters(ctx, client, VMPath, vmFilters, "virtual machine"); err != nil {
		return nil, err
	}

	res := &Result{}
	if cfg.Incremental {
		d, err := Decide(ctx, client, state, cfg, previousFailed)
		if err != nil {
			return nil, err
		}
		out("Incremental check: %s", d.Reason)
		res.Decision = &d
		next := NextState(client, d, state.Skips)
		res.Next = &next
		if !d.Fetch {
			res.Skipped = true
			out("Skipped the fetch, the inventory already matches NetBox (%d skipped run(s) in a row).", next.Skips)
			return res, nil
		}
	}

	sites, err := siteLookup(ctx, client, out)
	if err != nil {
		return nil, err
	}
	devices, err := fetchObjects(ctx, client, DevicePath, "devices", cfg, deviceFilters, out)
	if err != nil {
		return nil, err
	}
	vms, err := fetchObjects(ctx, client, VMPath, "virtual machines", cfg, vmFilters, out)
	if err != nil {
		return nil, err
	}
	res.Inventory = BuildInventory(devices, vms, cfg, sites, out)
	out("Built %d host(s) in %d group(s)", res.Inventory.Hosts(), res.Inventory.Groups())
	return res, nil
}

// filtersFor is the shared filters with one endpoint's own on top.
// Sending a filter to the endpoint that lacks it either fails the request
// outright or, worse, is ignored and returns everything, so each endpoint
// gets its own set and `filters` stays for the names that apply to both.
func filtersFor(cfg Config, own map[string]any) map[string]any {
	filters := map[string]any{}
	for _, candidate := range []map[string]any{cfg.Filters, own} {
		for k, v := range candidate {
			filters[k] = v
		}
	}
	if cfg.ExcludeOffline {
		if _, ok := filters["status"]; !ok {
			filters["status"] = "active"
		}
	}
	return filters
}

// filterParams turns filters into query parameters; a list value repeats
// the parameter, as requests did.
func filterParams(filters map[string]any) url.Values {
	params := url.Values{}
	for k, v := range filters {
		if list, ok := v.([]any); ok {
			for _, item := range list {
				params.Add(k, str(item))
			}
			continue
		}
		params.Add(k, str(v))
	}
	return params
}

// siteLookup fetches what a device's nested site representation leaves
// out: three small list requests covering the whole estate, however many
// hosts it holds.
func siteLookup(ctx context.Context, client *Client, out func(string, ...any)) (SiteLookup, error) {
	sites, err := client.Paginate(ctx, "/api/dcim/sites/", url.Values{"fields": {siteLookupFields}})
	if err != nil {
		return nil, err
	}
	regions, err := client.Paginate(ctx, "/api/dcim/regions/", url.Values{"fields": {treeLookupFields}})
	if err != nil {
		return nil, err
	}
	groups, err := client.Paginate(ctx, "/api/dcim/site-groups/", url.Values{"fields": {treeLookupFields}})
	if err != nil {
		return nil, err
	}
	out("Fetched %d site(s), %d region(s), %d site group(s)", len(sites), len(regions), len(groups))
	return BuildSiteLookup(sites, regions, groups), nil
}

// fetchObjects pulls one object type, asking only for the fields the
// transform reads.
func fetchObjects(ctx context.Context, client *Client, path, label string, cfg Config, filters map[string]any, out func(string, ...any)) ([]map[string]any, error) {
	params := filterParams(filters)
	if fields := APIFields(cfg); fields != "" {
		params.Set("fields", fields)
	}
	if len(filters) > 0 {
		var parts []string
		for _, k := range sortedKeys(filters) {
			parts = append(parts, fmt.Sprintf("%s=%s", k, str(filters[k])))
		}
		sort.Strings(parts)
		out("Filtering %s by %s", label, strings.Join(parts, ", "))
	}
	objects, err := client.Paginate(ctx, path, params)
	if err != nil {
		return nil, err
	}
	out("Fetched %d %s", len(objects), label)
	return objects, nil
}
