package netbox

import (
	"encoding/json"
	"strings"
	"testing"
)

// The transform takes NetBox API objects and returns the inventory, with
// no database and no network, so these are plain function tests against
// payloads shaped like the ones NetBox 4.6+ returns.

func ip(address, dnsName string) map[string]any {
	return map[string]any{"id": 1, "address": address, "dns_name": dnsName, "family": map[string]any{"value": 4, "label": "IPv4"}}
}

// device is a device as NetBox serialises one, trimmed to the fields read
// here. Note what the nested site does and does not carry: NetBox gives a
// device the brief site representation, which stops at the slug. No
// region, no site group, no time zone. That omission is what
// BuildSiteLookup exists for.
func device(overrides map[string]any) map[string]any {
	obj := map[string]any{
		"id": 7, "name": "syd-db-01", "display": "syd-db-01",
		"status":         map[string]any{"value": "active", "label": "Active"},
		"site":           map[string]any{"id": 1, "name": "Sydney HQ", "slug": "sydney-hq"},
		"rack":           map[string]any{"id": 2, "name": "SYD-R02"},
		"role":           map[string]any{"id": 5, "name": "Database Server", "slug": "database-server"},
		"device_type":    map[string]any{"id": 2, "model": "PowerEdge R650", "slug": "poweredge-r650", "manufacturer": map[string]any{"id": 1, "name": "Dell", "slug": "dell"}},
		"platform":       map[string]any{"id": 1, "name": "Rocky Linux 9", "slug": "rocky-linux-9"},
		"tags":           []any{map[string]any{"id": 3, "name": "PCI Scope", "slug": "pci-scope"}},
		"primary_ip4":    ip("10.20.10.31/32", "syd-db-01.sol1.net"),
		"oob_ip":         ip("10.20.20.31/32", "syd-db-01-drac.sol1.net"),
		"config_context": map[string]any{}, "local_context_data": nil, "custom_fields": map[string]any{},
		"serial": "ABC123",
	}
	for k, v := range overrides {
		obj[k] = v
	}
	return obj
}

var (
	testSites      = []map[string]any{{"id": 1, "name": "Sydney HQ", "slug": "sydney-hq", "region": map[string]any{"id": 2}, "group": map[string]any{"id": 9}, "time_zone": "Australia/Sydney", "facility": "Level 3"}}
	testRegions    = []map[string]any{{"id": 1, "slug": "apac", "parent": nil}, {"id": 2, "slug": "australia", "parent": map[string]any{"id": 1}}}
	testSiteGroups = []map[string]any{{"id": 9, "slug": "corporate", "parent": nil}}
)

func sites() SiteLookup { return BuildSiteLookup(testSites, testRegions, testSiteGroups) }

func defaults() Config { return ParseConfig(nil) }

func hostvars(t *testing.T, obj map[string]any, kind string, cfg Config, s SiteLookup) *Object {
	t.Helper()
	return BuildHostvars(obj, kind, cfg, s)
}

// --- fields= -----------------------------------------------------------------------

func TestAPIFieldsAsksOnlyForWhatTheTransformReads(t *testing.T) {
	fields := strings.Split(APIFields(defaults()), ",")
	set := toSet(fields)
	for _, want := range []string{"config_context", "local_context_data", "oob_ip"} {
		if !set[want] {
			t.Errorf("%s missing from %v", want, fields)
		}
	}
	// The *_count aggregates cost a subquery each and nothing here reads them.
	for _, f := range fields {
		if strings.HasSuffix(f, "_count") {
			t.Errorf("%s asked for", f)
		}
	}
}

func TestAPIFieldsDropsConfigContextWhenItIsTurnedOff(t *testing.T) {
	cfg := ParseConfig(map[string]any{"config_context": false})
	if toSet(strings.Split(APIFields(cfg), ","))["config_context"] {
		t.Fatal("config_context still requested")
	}
}

func TestAPIFieldsIsEmptyWhenTheWholeObjectWasAskedFor(t *testing.T) {
	if got := APIFields(ParseConfig(map[string]any{"include_raw": true})); got != "" {
		t.Fatalf("got %q", got)
	}
}

// --- site lookup ---------------------------------------------------------------------

func TestSiteLookupWalksTheRegionTreeNearestFirst(t *testing.T) {
	s := sites()["1"]
	equalStrings(t, s.regions, []string{"australia", "apac"})
	equalStrings(t, s.siteGroups, []string{"corporate"})
	jsonEq(t, s.timeZone, "Australia/Sydney")
	jsonEq(t, s.facility, "Level 3")
}

func TestSiteLookupSurvivesACycle(t *testing.T) {
	regions := []map[string]any{{"id": 1, "slug": "a", "parent": map[string]any{"id": 2}}, {"id": 2, "slug": "b", "parent": map[string]any{"id": 1}}}
	lookup := BuildSiteLookup([]map[string]any{{"id": 1, "slug": "s", "region": map[string]any{"id": 1}}}, regions, nil)
	equalStrings(t, lookup["1"].regions, []string{"a", "b"})
}

func TestRegionGroupsChainParentToChildWithTheSiteUnderneath(t *testing.T) {
	inv := BuildInventory([]map[string]any{device(nil)}, nil, defaults(), sites(), nil)
	equalStrings(t, inv.Group("region_apac").Children, []string{"region_australia"})
	equalStrings(t, inv.Group("region_australia").Children, []string{"site_sydney_hq"})
	equalStrings(t, inv.Group("site_sydney_hq").Hosts, []string{"syd-db-01"})
	equalStrings(t, inv.Group("regions").Children, []string{"region_apac"})
}

// The device payload alone cannot produce them, which is the bug this fixes.
func TestNoRegionGroupsWithoutTheLookup(t *testing.T) {
	inv := BuildInventory([]map[string]any{device(nil)}, nil, defaults(), nil, nil)
	for _, g := range inv.GroupNames() {
		if strings.HasPrefix(g, "region") {
			t.Errorf("group %s made without a site lookup", g)
		}
	}
}

func TestSiteAttributesLandAsHostVars(t *testing.T) {
	hv := hostvars(t, device(nil), "devices", defaults(), sites())
	jsonEq(t, mustGet(t, hv, "netbox_regions"), []string{"australia", "apac"})
	jsonEq(t, mustGet(t, hv, "netbox_site_groups"), []string{"corporate"})
	jsonEq(t, mustGet(t, hv, "netbox_site_time_zone"), "Australia/Sydney")
	jsonEq(t, mustGet(t, hv, "netbox_site_facility"), "Level 3")
}

// --- config context and local context -------------------------------------------

func TestConfigContextMergesToTheTopLevelByDefault(t *testing.T) {
	hv := hostvars(t, device(map[string]any{"config_context": map[string]any{"cis_profile": "level2"}}), "devices", defaults(), nil)
	jsonEq(t, mustGet(t, hv, "cis_profile"), "level2")
	jsonEq(t, mustGet(t, hv, "netbox_config_context"), map[string]any{"cis_profile": "level2"})
}

func TestConfigContextCanBeKeptNamespaced(t *testing.T) {
	cfg := ParseConfig(map[string]any{"merge_config_context": false})
	hv := hostvars(t, device(map[string]any{"config_context": map[string]any{"cis_profile": "level2"}}), "devices", cfg, nil)
	if hv.Has("cis_profile") {
		t.Fatal("cis_profile merged")
	}
	jsonEq(t, mustGet(t, hv, "netbox_config_context"), map[string]any{"cis_profile": "level2"})
}

// NetBox has already merged it into config_context at the highest weight,
// so the raw blob is the only thing that says which values were set here.
func TestLocalContextDataIsKeptSeparately(t *testing.T) {
	local := map[string]any{"cis_profile": "level1"}
	hv := hostvars(t, device(map[string]any{"local_context_data": local, "config_context": map[string]any{"cis_profile": "level1"}}), "devices", defaults(), nil)
	jsonEq(t, mustGet(t, hv, "netbox_local_context_data"), local)
	jsonEq(t, mustGet(t, hv, "cis_profile"), "level1")
}

func TestNoLocalContextVarWhenThereIsNone(t *testing.T) {
	if hostvars(t, device(nil), "devices", defaults(), nil).Has("netbox_local_context_data") {
		t.Fatal("netbox_local_context_data set without data")
	}
}

// --- ansible_host precedence -------------------------------------------------------

func TestConfigContextAnsibleHostBeatsThePrimaryIP(t *testing.T) {
	hv := hostvars(t, device(map[string]any{"config_context": map[string]any{"ansible_host": "10.20.20.31"}}), "devices", defaults(), nil)
	jsonEq(t, mustGet(t, hv, "ansible_host"), "10.20.20.31")
}

func TestPrimaryIPIsUsedWhenConfigContextSaysNothing(t *testing.T) {
	jsonEq(t, mustGet(t, hostvars(t, device(nil), "devices", defaults(), nil), "ansible_host"), "10.20.10.31")
}

func TestOOBIPAsPrimaryIPBeatsThePrimaryIP(t *testing.T) {
	hv := hostvars(t, device(nil), "devices", ParseConfig(map[string]any{"oob_ip_as_primary_ip": true}), nil)
	jsonEq(t, mustGet(t, hv, "ansible_host"), "10.20.20.31")
}

func TestConfigContextStillBeatsTheOOBAddress(t *testing.T) {
	hv := hostvars(t, device(map[string]any{"config_context": map[string]any{"ansible_host": "192.0.2.9"}}), "devices", ParseConfig(map[string]any{"oob_ip_as_primary_ip": true}), nil)
	jsonEq(t, mustGet(t, hv, "ansible_host"), "192.0.2.9")
}

func TestMergingOffLeavesThePrimaryIPInPlace(t *testing.T) {
	hv := hostvars(t, device(map[string]any{"config_context": map[string]any{"ansible_host": "192.0.2.9"}}), "devices", ParseConfig(map[string]any{"merge_config_context": false}), nil)
	jsonEq(t, mustGet(t, hv, "ansible_host"), "10.20.10.31")
}

func TestNoAnsibleHostWithoutAnAddress(t *testing.T) {
	if hostvars(t, device(map[string]any{"primary_ip4": nil, "oob_ip": nil}), "devices", defaults(), nil).Has("ansible_host") {
		t.Fatal("ansible_host set without an address")
	}
}

// --- identity and grouping -----------------------------------------------------------

func TestInstanceIDIsQualifiedBecauseDeviceAndVMIDsCollide(t *testing.T) {
	jsonEq(t, mustGet(t, hostvars(t, device(nil), "devices", defaults(), nil), "netbox_instance_id"), "devices:7")
	jsonEq(t, mustGet(t, hostvars(t, device(nil), "virtual_machines", defaults(), nil), "netbox_instance_id"), "virtual_machines:7")
}

func TestInstanceIDKeepsTheIDADecoderProduced(t *testing.T) {
	jsonEq(t, mustGet(t, hostvars(t, device(map[string]any{"id": json.Number("2013")}), "devices", defaults(), nil), "netbox_instance_id"), "devices:2013")
	jsonEq(t, mustGet(t, hostvars(t, device(map[string]any{"id": float64(2013)}), "devices", defaults(), nil), "netbox_instance_id"), "devices:2013")
}

func TestManufacturerIsDugOutOfTheDeviceType(t *testing.T) {
	jsonEq(t, mustGet(t, hostvars(t, device(nil), "devices", defaults(), nil), "netbox_manufacturer"), "Dell")
	if !hasLink(GroupsFor(device(nil), "devices", defaults(), nil), "manufacturer_dell", "manufacturers") {
		t.Fatal("manufacturer group missing")
	}
}

func TestARackWithoutASlugFallsBackToItsName(t *testing.T) {
	if !hasLink(GroupsFor(device(nil), "devices", defaults(), nil), "rack_syd_r02", "racks") {
		t.Fatal("rack group missing")
	}
}

func TestGroupNamesAreMadeAnsibleSafe(t *testing.T) {
	if got := GroupName("site", "melbourne dc!"); got != "site_melbourne_dc" {
		t.Errorf("got %q", got)
	}
	if got := GroupName("10g"); got != "_10g" {
		t.Errorf("got %q", got)
	}
	if got := GroupName(nil, ""); got != "" {
		t.Errorf("got %q", got)
	}
}

// An unnamed device displays as its model and pk, which is not an address.
func TestAnUnnamedDeviceIsSkippedRatherThanNamedAfterItsDisplay(t *testing.T) {
	unnamed := map[string]any{"id": 2013, "name": nil, "display": "Arista DCS-7050SX3-48YC8 (2013)", "status": map[string]any{"value": "active"}}
	named := map[string]any{"id": 8, "name": "dc1-db-01", "display": "dc1-db-01", "status": map[string]any{"value": "active"}}
	var warned []string
	inv := BuildInventory([]map[string]any{unnamed, named}, nil, defaults(), nil, func(f string, a ...any) { warned = append(warned, f) })
	equalStrings(t, inv.hostvars.Keys(), []string{"dc1-db-01"})
	if len(warned) != 1 || !strings.Contains(warned[0], "unnamed") {
		t.Fatalf("warnings: %v", warned)
	}
}

func TestTwoUnnamedDevicesDoNotCollideBecauseNeitherIsImported(t *testing.T) {
	a := map[string]any{"id": 1, "name": nil, "display": "Model (1)"}
	b := map[string]any{"id": 2, "name": "", "display": "Model (2)"}
	inv := BuildInventory([]map[string]any{a, b}, nil, defaults(), nil, nil)
	if inv.Hosts() != 0 {
		t.Fatalf("%d hosts imported", inv.Hosts())
	}
}

func TestADuplicateHostNameKeepsTheFirst(t *testing.T) {
	first := device(map[string]any{"id": 1, "serial": "first"})
	second := device(map[string]any{"id": 2, "serial": "second"})
	inv := BuildInventory([]map[string]any{first, second}, nil, defaults(), nil, nil)
	jsonEq(t, mustGet(t, inv.Hostvars("syd-db-01"), "netbox_serial"), "first")
}

// --- the whole thing -----------------------------------------------------------------

func TestInventoryHasTheShapeAnsibleInventoryPrints(t *testing.T) {
	vm := map[string]any{"id": 7, "name": "syd-web-01", "status": map[string]any{"value": "offline", "label": "Offline"},
		"cluster": map[string]any{"id": 1, "name": "syd-vmw-prod"}, "vcpus": 4, "memory": 8192, "disk": 40, "tags": []any{}}
	inv := BuildInventory([]map[string]any{device(nil)}, []map[string]any{vm}, defaults(), sites(), nil)
	raw, err := json.Marshal(inv)
	if err != nil {
		t.Fatal(err)
	}
	s := string(raw)
	if !strings.HasPrefix(s, `{"_meta":{"hostvars":{"syd-db-01":{"netbox_object_type":"devices","netbox_instance_id":"devices:7",`) {
		t.Fatalf("starts %s", s[:120])
	}
	if !strings.HasSuffix(s, `"all":{"hosts":["syd-db-01","syd-web-01"],"vars":{},"children":[]}}`) {
		t.Fatalf("ends %s", s[len(s)-120:])
	}
	// Both hosts, their kinds, and the parents holding children rather than hosts.
	if inv.Hosts() != 2 {
		t.Fatalf("%d hosts", inv.Hosts())
	}
	equalStrings(t, inv.Group("devices").Hosts, []string{"syd-db-01"})
	equalStrings(t, inv.Group("virtual_machines").Hosts, []string{"syd-web-01"})
	equalStrings(t, inv.Group("statuses").Hosts, []string{})
	equalStrings(t, inv.Group("statuses").Children, []string{"status_active", "status_offline"})
	equalStrings(t, inv.Group("sites").Children, []string{"site_sydney_hq"})
	hv := inv.Hostvars("syd-web-01")
	jsonEq(t, mustGet(t, hv, "netbox_status"), "offline")
	jsonEq(t, mustGet(t, hv, "netbox_vcpus"), 4)
	jsonEq(t, mustGet(t, hv, "netbox_cluster"), "syd-vmw-prod")
	if hv.Has("netbox_tags") || hv.Has("ansible_host") {
		t.Fatalf("unexpected keys in %v", hv.Keys())
	}
	// Decodes back as the importer reads it.
	var back map[string]any
	if err := json.Unmarshal(raw, &back); err != nil {
		t.Fatal(err)
	}
}

func TestStatusAndTagGroupsCanBeTurnedOff(t *testing.T) {
	cfg := ParseConfig(map[string]any{"group_by_status": false, "group_by_tag": false})
	for _, l := range GroupsFor(device(nil), "devices", cfg, nil) {
		if strings.HasPrefix(l.name, "status") || strings.HasPrefix(l.name, "tag") {
			t.Errorf("group %s made with grouping off", l.name)
		}
	}
}

func TestCustomFieldsAreNamespacedAndOptionallyFlat(t *testing.T) {
	obj := device(map[string]any{"custom_fields": map[string]any{"backup_tier": "gold"}})
	hv := hostvars(t, obj, "devices", defaults(), nil)
	jsonEq(t, mustGet(t, hv, "netbox_custom_fields"), map[string]any{"backup_tier": "gold"})
	if hv.Has("backup_tier") {
		t.Fatal("flattened without being asked")
	}
	hv = hostvars(t, obj, "devices", ParseConfig(map[string]any{"flatten_custom_fields": true}), nil)
	jsonEq(t, mustGet(t, hv, "backup_tier"), "gold")
}

func TestUseFQDNNamesTheHostAfterTheDNSName(t *testing.T) {
	if got := HostNameFor(device(nil), ParseConfig(map[string]any{"use_fqdn": true})); got != "syd-db-01.sol1.net" {
		t.Fatalf("got %q", got)
	}
	if got := HostNameFor(device(nil), defaults()); got != "syd-db-01" {
		t.Fatalf("got %q", got)
	}
}

// --- the watch list ------------------------------------------------------------------

// Adding a grouping without an object type would make an incremental sync
// blind to changes in it, so this fails the build instead of the inventory.
func TestEveryGroupableKeyNamesAnObjectType(t *testing.T) {
	for _, g := range groupable {
		if groupableObjectTypes[g.key] == "" {
			t.Errorf("%s has no object type", g.key)
		}
	}
	if len(groupableObjectTypes) != len(groupable) {
		t.Fatalf("%d object types for %d groupings", len(groupableObjectTypes), len(groupable))
	}
	for _, h := range siteHierarchies {
		if siteHierarchyObjectTypes[h.key] == "" {
			t.Errorf("%s has no object type", h.key)
		}
	}
	if len(siteHierarchyObjectTypes) != len(siteHierarchies) {
		t.Fatalf("%d object types for %d hierarchies", len(siteHierarchyObjectTypes), len(siteHierarchies))
	}
}

// These never appear in a device's own changelog entries, which is the trap
// an incremental sync falls into.
func TestTheWatchListCoversWhatChangesAnInventoryFromOutsideTheHost(t *testing.T) {
	set := toSet(WatchedObjectTypes)
	for _, want := range []string{"extras.configcontext", "extras.tag", "extras.customfield", "ipam.ipaddress", "dcim.site", "dcim.region"} {
		if !set[want] {
			t.Errorf("%s not watched", want)
		}
	}
	if len(WatchedObjectTypes) != 17 {
		t.Fatalf("%d watched types: %v", len(WatchedObjectTypes), WatchedObjectTypes)
	}
}

// --- source variables ------------------------------------------------------------------

func TestParseConfigReadsTheSettingsAsTheOldCommandDid(t *testing.T) {
	cfg := ParseConfig(map[string]any{
		"filters": map[string]any{"tag": "ansible-managed"}, "device_filters": "not a dict",
		"incremental": "yes", "incremental_max_skips": "3", "webhook_debounce_seconds": -5, "config_context": 0,
	})
	jsonEq(t, cfg.Filters, map[string]any{"tag": "ansible-managed"})
	if cfg.DeviceFilters != nil || !cfg.Incremental || cfg.IncrementalMaxSkips != 3 || cfg.WebhookDebounceSeconds != 0 || cfg.ConfigContext {
		t.Fatalf("%+v", cfg)
	}
	def := ParseConfig(map[string]any{"incremental_max_skips": "often", "webhook_debounce_seconds": "soon"})
	if def.IncrementalMaxSkips != DefaultMaxSkips || def.WebhookDebounceSeconds != DefaultDebounceSeconds {
		t.Fatalf("%+v", def)
	}
	if !def.MergeConfigContext || !def.GroupByStatus || !def.GroupByTag || !def.ConfigContext {
		t.Fatalf("defaults off: %+v", def)
	}
}

func TestFiltersForLayersTheEndpointsOwnOverTheShared(t *testing.T) {
	cfg := ParseConfig(map[string]any{"filters": map[string]any{"tag": "x", "status": "planned"}, "vm_filters": map[string]any{"cluster": "c1", "tag": "y"}, "exclude_offline": true})
	jsonEq(t, filtersFor(cfg, cfg.VMFilters), map[string]any{"tag": "y", "status": "planned", "cluster": "c1"})
	jsonEq(t, filtersFor(cfg, cfg.DeviceFilters), map[string]any{"tag": "x", "status": "planned"})
	plain := ParseConfig(map[string]any{"exclude_offline": true})
	jsonEq(t, filtersFor(plain, nil), map[string]any{"status": "active"})
	params := filterParams(map[string]any{"tag": []any{"a", "b"}, "rack_id": 12})
	equalStrings(t, params["tag"], []string{"a", "b"})
	equalStrings(t, params["rack_id"], []string{"12"})
}
