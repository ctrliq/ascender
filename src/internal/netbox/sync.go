package netbox

import (
	"encoding/json"
	"regexp"
	"sort"
	"strings"
	"unicode"
)

// This file is the transform: NetBox devices and virtual machines in, the
// structure ansible-inventory --list prints out:
//
//	{
//	    "_meta": {"hostvars": {"<host>": {...}}},
//	    "<group>": {"hosts": [...], "vars": {}, "children": [...]},
//	}
//
// Keeping that contract means the importer's host and group
// reconciliation, overwrite handling and host filters all apply unchanged.
// Nothing here talks to NetBox; Client does that, and Sync decides what to
// ask for.

var (
	// baseFields are copied onto every host as-is, under netbox_.
	baseFields = []string{"id", "name", "display", "status", "description", "comments", "url"}
	// hardwareFields are present on devices only.
	hardwareFields = []string{"serial", "asset_tag", "position"}
	// vmFields are present on virtual machines only.
	vmFields = []string{"vcpus", "memory", "disk"}
)

// keyPrefix is a related object turned into both a host variable and a
// group: the object key on the payload, and the prefix of the variable and
// the group name.
type keyPrefix struct{ key, prefix string }

// groupable are the related objects grouped on directly off the payload.
var groupable = []keyPrefix{{"site", "site"}, {"location", "location"}, {"rack", "rack"}, {"tenant", "tenant"},
	{"platform", "platform"}, {"cluster", "cluster"}, {"device_type", "device_type"}}

// siteHierarchies are the nested trees resolved from the site lookup: the
// lookup key, and the group and variable prefix.
var siteHierarchies = []keyPrefix{{"regions", "region"}, {"site_groups", "site_group"}}

// groupableObjectTypes is the NetBox object type behind each groupable key,
// for the changelog watch list. It lives beside groupable because an
// incremental sync that does not watch an object type never notices a
// change to it, and the inventory goes stale with every job still reporting
// success. A test asserts these keys match groupable exactly, so adding a
// grouping without naming its object type fails the build rather than the
// inventory.
var groupableObjectTypes = map[string]string{
	"site": "dcim.site", "location": "dcim.location", "rack": "dcim.rack", "tenant": "tenancy.tenant",
	"platform": "dcim.platform", "cluster": "virtualization.cluster", "device_type": "dcim.devicetype",
}

// siteHierarchyObjectTypes likewise, for the trees the site lookup resolves.
var siteHierarchyObjectTypes = map[string]string{"regions": "dcim.region", "site_groups": "dcim.sitegroup"}

// WatchedObjectTypes is every NetBox object type whose change can alter
// this inventory, sorted.
//
// Most of these never appear in a device's own changelog entries, which is
// the trap. Renaming a site, editing a config context or changing an IP's
// DNS name each record one entry against that object and nothing against
// the hundreds of devices whose host variables or groups just moved. A
// watch list covering only devices and virtual machines would report
// "nothing changed" and stay stale.
var WatchedObjectTypes = func() []string {
	set := map[string]bool{
		"dcim.device": true, "virtualization.virtualmachine": true,
		// role and manufacturer are grouped on but are not groupable keys:
		// the transform digs them out rather than reading them off the
		// object.
		"dcim.devicerole": true, "dcim.manufacturer": true,
		// Config context and tags change host variables and groups from
		// outside the object entirely.
		"extras.configcontext": true, "extras.tag": true,
		// Adding or removing a custom field changes every host's variables
		// though no device record is touched.
		"extras.customfield": true,
		// ansible_host, the out-of-band address and, under use_fqdn, the
		// host name itself all come from an IP address record.
		"ipam.ipaddress": true,
	}
	for _, t := range groupableObjectTypes {
		set[t] = true
	}
	for _, t := range siteHierarchyObjectTypes {
		set[t] = true
	}
	out := make([]string, 0, len(set))
	for t := range set {
		out = append(out, t)
	}
	sort.Strings(out)
	return out
}()

// apiFieldList is every field the transform reads, for the API's fields=
// parameter. NetBox silently drops a name an endpoint does not have, so one
// superset serves both devices and virtual machines. The full device
// serializer is roughly twice this, most of the difference being *_count
// aggregates that cost a subquery each and that nothing here reads.
var apiFieldList = func() []string {
	fields := append([]string{}, baseFields...)
	fields = append(fields, hardwareFields...)
	fields = append(fields, vmFields...)
	for _, g := range groupable {
		fields = append(fields, g.key)
	}
	return append(fields, "role", "tags", "custom_fields", "local_context_data", "oob_ip", "primary_ip", "primary_ip4", "primary_ip6")
}()

// configContextField is requested separately because rendering it is the
// expensive half of a device list, so it is only asked for when something
// is going to read it. (The netbox.netbox plugin's ?exclude=config_context
// stopped working in NetBox 4.6; ?fields= and ?omit= are what work.)
const configContextField = "config_context"

// APIFields is the fields= value for a device or virtual machine list
// request, or "" when the whole object is wanted (include_raw), the one
// case where trimming the response would lose something asked for.
func APIFields(cfg Config) string {
	if cfg.IncludeRaw {
		return ""
	}
	fields := append([]string{}, apiFieldList...)
	if cfg.ConfigContext {
		fields = append(fields, configContextField)
	}
	sort.Strings(fields)
	return strings.Join(fields, ",")
}

var unsafeGroupChars = regexp.MustCompile(`[^A-Za-z0-9_]+`)

// GroupName builds an Ansible-safe group name from its parts, skipping nil
// and empty ones. Ansible group names allow letters, digits and
// underscores, so anything else collapses to an underscore; the result is
// lowercased, and a leading digit is prefixed because a group may not
// start with one. "" when nothing is left.
func GroupName(parts ...any) string {
	var kept []string
	for _, p := range parts {
		if p == nil {
			continue
		}
		s := str(p)
		if s == "" {
			continue
		}
		kept = append(kept, s)
	}
	name := unsafeGroupChars.ReplaceAllString(strings.Join(kept, "_"), "_")
	name = strings.ToLower(strings.Trim(name, "_"))
	if name == "" {
		return ""
	}
	if unicode.IsDigit(rune(name[0])) {
		name = "_" + name
	}
	return name
}

// nestedName is the human-readable name of a nested NetBox object. NetBox
// is not uniform here: most objects have name, device types carry model
// instead, and choice fields such as status are {value, label}.
func nestedName(v any) any {
	m, ok := v.(map[string]any)
	if !ok {
		return v
	}
	for _, k := range []string{"name", "model", "label", "display", "slug", "value"} {
		if x := m[k]; truthy(x) {
			return x
		}
	}
	return nil
}

// nestedSlug is the stable machine-readable key, which groups are built
// from.
func nestedSlug(v any) any {
	m, ok := v.(map[string]any)
	if !ok {
		return v
	}
	for _, k := range []string{"slug", "value", "name", "model", "display"} {
		if x := m[k]; truthy(x) {
			return x
		}
	}
	return nil
}

// manufacturer digs the manufacturer out of device_type, where NetBox
// nests it rather than exposing it on the device.
func manufacturer(obj map[string]any) any {
	if dt, ok := obj["device_type"].(map[string]any); ok {
		return dt["manufacturer"]
	}
	return nil
}

// ipOnly is "10.0.0.5/24" -> "10.0.0.5". NetBox always stores the mask.
func ipOnly(cidr any) string {
	if !truthy(cidr) {
		return ""
	}
	return strings.SplitN(str(cidr), "/", 2)[0]
}

// addressOf is the bare address of a nested NetBox IP object.
func addressOf(v any) string {
	if m, ok := v.(map[string]any); ok {
		return ipOnly(m["address"])
	}
	return ""
}

// siteInfo is what a device's nested site representation leaves out. The
// time zone and facility become host variables rather than groups: grouping
// by time zone inflates the group count without helping anyone target a
// play.
type siteInfo struct {
	slug       any
	regions    []string
	siteGroups []string
	timeZone   any
	facility   any
}

// SiteLookup is BuildSiteLookup's result, keyed by site id.
type SiteLookup map[string]*siteInfo

// ancestry is the slugs from a node up to the root of its tree, nearest
// first. NetBox nests regions and site groups, and a device sees neither,
// so the chain is walked here from the lookup tables. The seen set guards
// against a cycle that should not exist but would otherwise hang the sync.
func ancestry(startID string, lookup map[string]map[string]any) []string {
	var chain []string
	seen := map[string]bool{}
	id := startID
	for id != "" && !seen[id] {
		seen[id] = true
		node, ok := lookup[id]
		if !ok {
			break
		}
		slug := node["slug"]
		if !truthy(slug) {
			slug = node["name"]
		}
		if truthy(slug) {
			chain = append(chain, str(slug))
		}
		id = ""
		if parent, ok := node["parent"].(map[string]any); ok {
			id = idKey(parent["id"])
		}
	}
	return chain
}

func byID(objects []map[string]any) map[string]map[string]any {
	out := map[string]map[string]any{}
	for _, o := range objects {
		if id := idKey(o["id"]); id != "" {
			out[id] = o
		}
	}
	return out
}

// BuildSiteLookup resolves what a device's nested site representation
// leaves out. A device carries only the brief form of its site: id, url,
// display, name, slug and description. Region, site group, time zone and
// facility are not in it at any page size, so grouping by region off the
// device payload alone silently produces nothing. One small list request
// per object type fills them in for the whole estate.
func BuildSiteLookup(sites, regions, siteGroups []map[string]any) SiteLookup {
	regionLookup := byID(regions)
	groupLookup := byID(siteGroups)
	lookup := SiteLookup{}
	for _, site := range sites {
		id := idKey(site["id"])
		if id == "" {
			continue
		}
		info := &siteInfo{slug: site["slug"]}
		if !truthy(info.slug) {
			info.slug = site["name"]
		}
		if region, ok := site["region"].(map[string]any); ok {
			info.regions = ancestry(idKey(region["id"]), regionLookup)
		}
		if group, ok := site["group"].(map[string]any); ok {
			info.siteGroups = ancestry(idKey(group["id"]), groupLookup)
		}
		if truthy(site["time_zone"]) {
			info.timeZone = site["time_zone"]
		}
		if truthy(site["facility"]) {
			info.facility = site["facility"]
		}
		lookup[id] = info
	}
	return lookup
}

// siteExtras is the lookup entry for this object's site, or nil.
func siteExtras(obj map[string]any, sites SiteLookup) *siteInfo {
	if sites == nil {
		return nil
	}
	site, ok := obj["site"].(map[string]any)
	if !ok {
		return nil
	}
	return sites[idKey(site["id"])]
}

func (s *siteInfo) chain(key string) []string {
	if s == nil {
		return nil
	}
	if key == "regions" {
		return s.regions
	}
	return s.siteGroups
}

// HostNameFor is the NetBox field that names the host: the object name,
// or with use_fqdn the primary IP's DNS name when NetBox has one, which is
// usually what connects. "" for an object with no name.
//
// display is not a fallback. NetBox allows a device to have no name and
// renders one from its hardware instead, as "Arista DCS-7050SX3-48YC8
// (2013)". That is a label for the NetBox UI, not an address: it names the
// model and the primary key, and it changes if the device is re-typed. An
// object with no name is skipped by the caller rather than imported under
// one of those.
func HostNameFor(obj map[string]any, cfg Config) string {
	if cfg.UseFQDN {
		for _, key := range []string{"primary_ip", "primary_ip4", "primary_ip6"} {
			if ip, ok := obj[key].(map[string]any); ok && truthy(ip["dns_name"]) {
				return str(ip["dns_name"])
			}
		}
	}
	if truthy(obj["name"]) {
		return str(obj["name"])
	}
	return ""
}

// ansibleHostFor is the address Ansible should connect to, from the
// object's own fields: the primary IP, v4 before v6, then "" so Ansible
// falls back to resolving the inventory hostname. Config context and the
// out-of-band address are applied by the caller, which owns the
// precedence.
func ansibleHostFor(obj map[string]any) string {
	for _, key := range []string{"primary_ip4", "primary_ip", "primary_ip6"} {
		if addr := addressOf(obj[key]); addr != "" {
			return addr
		}
	}
	return ""
}

// BuildHostvars flattens one NetBox device or virtual machine into Ansible
// host variables. kind is "devices" or "virtual_machines"; instance is
// Client.Instance, the NetBox the object came from, or "" when there is
// only ever one.
func BuildHostvars(obj map[string]any, kind, instance string, cfg Config, sites SiteLookup) *Object {
	hv := NewObject()
	hv.Set("netbox_object_type", kind)

	// Devices and virtual machines are separate tables with separate
	// primary key sequences, so their ids overlap: device 5 and VM 5 both
	// exist. The id alone is therefore unusable as the inventory instance
	// id, and this qualified form is what the import's instance id variable
	// points at. It is stable across renames, which is the point of an
	// instance id. The NetBox is named too, because the importer matches
	// instance ids across the whole inventory, not per source: two NetBox
	// installs both have a device 7, and without the name the second
	// source's device 7 would take over the first's host.
	if obj["id"] != nil {
		id := kind + ":" + idKey(obj["id"])
		if instance != "" {
			id += "@" + instance
		}
		hv.Set("netbox_instance_id", id)
	}
	for _, field := range baseFields {
		if v, ok := obj[field]; ok {
			if field == "status" {
				v = nestedSlug(v)
			}
			hv.Set("netbox_"+field, v)
		}
	}
	for _, g := range groupable {
		if v := obj[g.key]; truthy(v) {
			hv.Set("netbox_"+g.prefix, nestedName(v))
		}
	}
	if role := obj["role"]; truthy(role) {
		hv.Set("netbox_role", nestedName(role))
	}
	if m := manufacturer(obj); truthy(m) {
		hv.Set("netbox_manufacturer", nestedName(m))
	}
	if tags := tagSlugs(obj); len(tags) > 0 {
		hv.Set("netbox_tags", tags)
	}

	extras := siteExtras(obj, sites)
	for _, h := range siteHierarchies {
		if chain := extras.chain(h.key); len(chain) > 0 {
			hv.Set("netbox_"+h.key, chain)
		}
	}
	if extras != nil {
		if extras.timeZone != nil {
			hv.Set("netbox_site_time_zone", extras.timeZone)
		}
		if extras.facility != nil {
			hv.Set("netbox_site_facility", extras.facility)
		}
	}

	// Custom fields are the main extension point operators use, so they
	// are surfaced namespaced and, on request, at the top level too.
	if custom, ok := obj["custom_fields"].(map[string]any); ok && len(custom) > 0 {
		hv.Set("netbox_custom_fields", custom)
		if cfg.FlattenCustomFields {
			for _, k := range sortedKeys(custom) {
				hv.SetDefault(k, custom[k])
			}
		}
	}

	// Config context is NetBox's own mechanism for shipping config data,
	// and the closest thing it has to host variables, so it lands at the
	// top level unless that is turned off.
	if context, ok := obj["config_context"].(map[string]any); ok && len(context) > 0 {
		hv.Set("netbox_config_context", context)
		if cfg.MergeConfigContext {
			for _, k := range sortedKeys(context) {
				hv.SetDefault(k, context[k])
			}
		}
	}

	// NetBox merges local context data into the rendered config context at
	// the highest precedence, so these values have already arrived
	// flattened above. The raw blob is kept because the merged form cannot
	// answer which values were set on this host and which it inherited from
	// a site or a role.
	if local, ok := obj["local_context_data"].(map[string]any); ok && len(local) > 0 {
		hv.Set("netbox_local_context_data", local)
	}

	for _, field := range append(append([]string{}, hardwareFields...), vmFields...) {
		if v, ok := obj[field]; ok && v != nil && v != "" {
			hv.Set("netbox_"+field, v)
		}
	}

	// Out-of-band address: the iDRAC, iLO or BMC. NetBox models it as a
	// first-class field on the device, and it is what a Redfish or racadm
	// play has to target, so it is surfaced rather than leaving the caller
	// to dig through interfaces.
	oob := addressOf(obj["oob_ip"])
	if oob != "" {
		hv.Set("netbox_oob_ip", oob)
	}
	if v6 := addressOf(obj["primary_ip6"]); v6 != "" {
		hv.Set("netbox_primary_ip6", v6)
	}

	// Connection address, in order:
	//   1. ansible_host from config context, when merging is on
	//   2. the out-of-band address, when the source asks for it
	//   3. primary IPv4, then any primary, then IPv6
	//
	// Both steps below only fill an absent key, so an ansible_host merged
	// from config context wins. That merge has already resolved NetBox's
	// own precedence, weight ordering followed by the local override,
	// which makes it the most specific answer NetBox has rather than a
	// site-wide default. It also keeps ansible_host consistent with
	// ansible_user, ansible_port and every other ansible_* key, all of
	// which arrive the same way because nothing else here assigns them.
	if oob != "" && cfg.OOBIPAsPrimaryIP {
		hv.SetDefault("ansible_host", oob)
	}
	if addr := ansibleHostFor(obj); addr != "" {
		hv.SetDefault("ansible_host", addr)
	}

	if cfg.IncludeRaw {
		hv.Set("netbox_raw", obj)
	}
	return hv
}

// tagSlugs is each tag's slug, or its name without one.
func tagSlugs(obj map[string]any) []any {
	tags, ok := obj["tags"].([]any)
	if !ok {
		return nil
	}
	var out []any
	for _, t := range tags {
		m, ok := t.(map[string]any)
		if !ok {
			continue
		}
		if truthy(m["slug"]) {
			out = append(out, m["slug"])
		} else {
			out = append(out, m["name"])
		}
	}
	return out
}

// groupLink is a group an object belongs to, and the parent group that
// holds it ("" for none).
type groupLink struct{ name, parent string }

// GroupsFor is every group this object belongs to, each with its parent.
func GroupsFor(obj map[string]any, kind string, cfg Config, sites SiteLookup) []groupLink {
	var groups []groupLink
	add := func(name, parent string) {
		if name != "" {
			groups = append(groups, groupLink{name, parent})
		}
	}
	add(GroupName(kind), "") // devices, virtual_machines

	for _, g := range groupable {
		if v := obj[g.key]; truthy(v) {
			add(GroupName(g.prefix, nestedSlug(v)), GroupName(g.prefix+"s"))
		}
	}
	if role := obj["role"]; truthy(role) {
		add(GroupName("role", nestedSlug(role)), GroupName("roles"))
	}
	if m := manufacturer(obj); truthy(m) {
		add(GroupName("manufacturer", nestedSlug(m)), GroupName("manufacturers"))
	}
	if status := nestedSlug(obj["status"]); truthy(status) && cfg.GroupByStatus {
		add(GroupName("status", status), GroupName("statuses"))
	}
	if cfg.GroupByTag {
		if tags, ok := obj["tags"].([]any); ok {
			for _, t := range tags {
				add(GroupName("tag", nestedSlug(t)), GroupName("tags"))
			}
		}
	}

	// Regions and site groups sit above the host and nest within
	// themselves, so they are chained parent to parent with the site
	// hanging off the innermost one. The host joins each level, and
	// BuildInventory then clears the hosts from any group that gained a
	// child, leaving a tree rather than a pile.
	extras := siteExtras(obj, sites)
	siteGroup := ""
	if site, ok := obj["site"].(map[string]any); ok {
		siteGroup = GroupName("site", nestedSlug(site))
	}
	for _, h := range siteHierarchies {
		var names []string
		for _, slug := range extras.chain(h.key) {
			if name := GroupName(h.prefix, slug); name != "" {
				names = append(names, name)
			}
		}
		for i, name := range names {
			parent := GroupName(h.prefix + "s")
			if i+1 < len(names) {
				parent = names[i+1]
			}
			add(name, parent)
		}
		if len(names) > 0 && siteGroup != "" {
			groups = append(groups, groupLink{siteGroup, names[0]})
		}
	}
	return groups
}

// Group is one inventory group. Its vars are always empty: everything
// this source knows is a host variable.
type Group struct {
	Hosts    []string
	Children []string
}

// Inventory is the ansible-inventory structure BuildInventory assembles.
type Inventory struct {
	hostvars   *Object // host name -> *Object
	groupOrder []string
	groups     map[string]*Group
}

// Hosts is the number of hosts.
func (inv *Inventory) Hosts() int { return inv.hostvars.Len() }

// Groups is the number of groups, all included.
func (inv *Inventory) Groups() int { return len(inv.groupOrder) }

// Hostvars is one host's variables, or nil.
func (inv *Inventory) Hostvars(host string) *Object {
	if v, ok := inv.hostvars.Get(host); ok {
		return v.(*Object)
	}
	return nil
}

// Group is one group, or nil.
func (inv *Inventory) Group(name string) *Group { return inv.groups[name] }

// GroupNames are the groups in order.
func (inv *Inventory) GroupNames() []string { return append([]string(nil), inv.groupOrder...) }

func (inv *Inventory) ensure(name string) *Group {
	g, ok := inv.groups[name]
	if !ok {
		g = &Group{Hosts: []string{}, Children: []string{}}
		inv.groups[name] = g
		inv.groupOrder = append(inv.groupOrder, name)
	}
	return g
}

// MarshalJSON writes the structure ansible-inventory --list prints: _meta
// first, then the groups in the order they were made, "all" last.
func (inv *Inventory) MarshalJSON() ([]byte, error) {
	out := NewObject()
	meta := NewObject()
	meta.Set("hostvars", inv.hostvars)
	out.Set("_meta", meta)
	for _, name := range inv.groupOrder {
		g := inv.groups[name]
		entry := NewObject()
		entry.Set("hosts", g.Hosts)
		entry.Set("vars", map[string]any{})
		entry.Set("children", g.Children)
		out.Set(name, entry)
	}
	return json.Marshal(out)
}

// BuildInventory assembles the full inventory from NetBox devices and
// virtual machines. instance names the NetBox they came from, as for
// BuildHostvars. sites is BuildSiteLookup's result, or nil. warn receives
// the objects left out and why; nil discards them.
func BuildInventory(devices, virtualMachines []map[string]any, instance string, cfg Config, sites SiteLookup, warn func(format string, args ...any)) *Inventory {
	if warn == nil {
		warn = func(string, ...any) {}
	}
	inv := &Inventory{hostvars: NewObject(), groups: map[string]*Group{}}
	var all []string
	parents := NewObject() // parent -> map[string]bool of children, in first-seen order

	for _, batch := range []struct {
		kind    string
		objects []map[string]any
	}{{"devices", devices}, {"virtual_machines", virtualMachines}} {
		for _, obj := range batch.objects {
			name := HostNameFor(obj, cfg)
			if name == "" {
				warn("Skipping unnamed NetBox %s id=%s, which Ansible has no way to address", batch.kind, idKey(obj["id"]))
				continue
			}
			if inv.hostvars.Has(name) {
				warn("Duplicate host name %q from NetBox %s id=%s, keeping the first", name, batch.kind, idKey(obj["id"]))
				continue
			}
			inv.hostvars.Set(name, BuildHostvars(obj, batch.kind, instance, cfg, sites))
			all = append(all, name)
			for _, link := range GroupsFor(obj, batch.kind, cfg, sites) {
				g := inv.ensure(link.name)
				g.Hosts = append(g.Hosts, name)
				if link.parent != "" {
					children, ok := parents.Get(link.parent)
					if !ok {
						children = map[string]bool{}
						parents.Set(link.parent, children)
					}
					children.(map[string]bool)[link.name] = true
				}
			}
		}
	}

	for _, parent := range parents.Keys() {
		children, _ := parents.Get(parent)
		entry := inv.ensure(parent)
		names := make([]string, 0, len(children.(map[string]bool)))
		for child := range children.(map[string]bool) {
			names = append(names, child)
		}
		sort.Strings(names)
		for _, child := range names {
			if child != parent && !contains(entry.Children, child) {
				entry.Children = append(entry.Children, child)
			}
		}
		// A grouping parent holds its children, not the hosts directly.
		entry.Hosts = []string{}
	}

	// De-duplicate while keeping a stable order, which keeps the job output
	// and any diffing of it readable.
	for _, name := range inv.groupOrder {
		inv.groups[name].Hosts = uniqueSorted(inv.groups[name].Hosts)
	}
	allGroup := inv.ensure("all")
	allGroup.Hosts = uniqueSorted(all)
	return inv
}

func contains(list []string, s string) bool {
	for _, x := range list {
		if x == s {
			return true
		}
	}
	return false
}

func uniqueSorted(list []string) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(list))
	for _, s := range list {
		if !seen[s] {
			seen[s] = true
			out = append(out, s)
		}
	}
	sort.Strings(out)
	return out
}
