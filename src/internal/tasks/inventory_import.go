package tasks

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode/utf16"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/api"
	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/models"
	"github.com/ctrliq/ascender/internal/pyre"
	"github.com/ctrliq/ascender/internal/pyyaml"
)

// This file is the port of the inventory_import management command's
// perform_update (main/management/commands/inventory_import.py) and of
// main/utils/mem_inventory.py: the JSON ansible-inventory printed is read
// into an in-memory inventory and merged into the database.

// Log levels of the import logger, as Python's logging numbered them.
const (
	logDebug   = 10
	logInfo    = 20
	logWarning = 30
	logError   = 40
)

var levelNames = map[int]string{logDebug: "DEBUG", logInfo: "INFO", logWarning: "WARNING", logError: "ERROR"}

type importLogger func(level int, format string, args ...any)

// --- in-memory inventory -----------------------------------------------------------

type memHost struct {
	name       string
	vars       *api.OMap
	instanceID string
}

type memGroup struct {
	name     string
	children []*memGroup
	hosts    []*memHost
	vars     *api.OMap
	parents  []*memGroup
}

func (g *memGroup) addChild(c *memGroup, log importLogger) {
	log(logDebug, "Adding child group %s to parent %s", c.name, g.name)
	found := false
	for _, x := range g.children {
		if x == c {
			found = true
		}
	}
	if !found {
		g.children = append(g.children, c)
	}
	for _, p := range c.parents {
		if p == g {
			return
		}
	}
	c.parents = append(c.parents, g)
}

func (g *memGroup) addHost(h *memHost, log importLogger) {
	log(logDebug, "Adding host %s to group %s", h.name, g.name)
	for _, x := range g.hosts {
		if x == h {
			return
		}
	}
	g.hosts = append(g.hosts, h)
}

type memInventory struct {
	all        *memGroup
	hosts      map[string]*memHost
	hostOrder  []string
	groups     map[string]*memGroup
	groupOrder []string
	groupRe    *pyre.Regexp
	hostRe     *pyre.Regexp
	log        importLogger
}

var ipv6PortRe = regexp.MustCompile(`^\[([A-Fa-f0-9:]{3,})\]:(\d+?)$`)

// reMatch is the filter's re.match: a match anchored at the start, with
// Python's semantics; no filter lets everything through.
func reMatch(re *pyre.Regexp, s string) bool {
	return re == nil || re.Match(s)
}

func newMemInventory(groupRe, hostRe *pyre.Regexp, log importLogger) *memInventory {
	inv := &memInventory{hosts: map[string]*memHost{}, groups: map[string]*memGroup{}, groupRe: groupRe, hostRe: hostRe, log: log}
	inv.all = &memGroup{name: "all", vars: api.NewOMap()}
	log(logDebug, "Loaded group: %s", "all")
	return inv
}

func (inv *memInventory) getHost(name string) *memHost {
	hostName := name
	var port *int64
	if m := ipv6PortRe.FindStringSubmatch(name); m != nil {
		hostName = m[1]
		if n, err := strconv.ParseInt(m[2], 10, 64); err == nil {
			port = &n
		}
	} else if strings.Count(name, ":") == 1 {
		parts := strings.SplitN(name, ":", 2)
		hostName = parts[0]
		if n, err := strconv.ParseInt(parts[1], 10, 64); err == nil {
			port = &n
		} else {
			inv.log(logWarning, "Invalid port \"%s\" for host \"%s\"", parts[1], hostName)
		}
	}
	if !reMatch(inv.hostRe, hostName) {
		inv.log(logDebug, "Filtering host %s", hostName)
		return nil
	}
	if h, ok := inv.hosts[hostName]; ok {
		return h
	}
	h := &memHost{name: hostName, vars: api.NewOMap()}
	if port != nil {
		h.vars.Set("ansible_port", json.Number(strconv.FormatInt(*port, 10)))
	}
	inv.log(logDebug, "Loaded host: %s", hostName)
	inv.hosts[hostName] = h
	inv.hostOrder = append(inv.hostOrder, hostName)
	return h
}

func (inv *memInventory) getGroup(name string, child bool) *memGroup {
	if name == "all" || name == "ungrouped" {
		return inv.all
	}
	if !reMatch(inv.groupRe, name) {
		inv.log(logDebug, "Filtering group %s", name)
		return nil
	}
	if g, ok := inv.groups[name]; ok {
		return g
	}
	g := &memGroup{name: name, vars: api.NewOMap()}
	inv.log(logDebug, "Loaded group: %s", name)
	inv.groups[name] = g
	inv.groupOrder = append(inv.groupOrder, name)
	if !child {
		inv.all.addChild(g, inv.log)
	}
	return g
}

// deleteEmptyGroups is MemInventory.delete_empty_groups.
func (inv *memInventory) deleteEmptyGroups() {
	for _, name := range append([]string(nil), inv.groupOrder...) {
		g := inv.groups[name]
		if len(g.children) == 0 && len(g.hosts) == 0 && g.vars.Len() == 0 {
			inv.log(logDebug, "Removing empty group %s", name)
			for _, p := range g.parents {
				for i, c := range p.children {
					if c == g {
						p.children = append(p.children[:i], p.children[i+1:]...)
						break
					}
				}
			}
			delete(inv.groups, name)
			for i, n := range inv.groupOrder {
				if n == name {
					inv.groupOrder = append(inv.groupOrder[:i], inv.groupOrder[i+1:]...)
					break
				}
			}
		}
	}
}

func typeName(v any) string {
	switch v.(type) {
	case *api.OMap:
		return "<class 'dict'>"
	case []any:
		return "<class 'list'>"
	case string:
		return "<class 'str'>"
	case json.Number:
		return "<class 'int'>"
	case bool:
		return "<class 'bool'>"
	case nil:
		return "<class 'NoneType'>"
	}
	return fmt.Sprintf("%T", v)
}

func mergeOMap(dst, src *api.OMap) {
	for _, k := range src.Keys() {
		v, _ := src.Get(k)
		dst.Set(k, v)
	}
}

// dictToMemData is dict_to_mem_data.
func dictToMemData(data *api.OMap, inv *memInventory) {
	var meta *api.OMap
	if m, ok := data.Get("_meta"); ok {
		meta, _ = m.(*api.OMap)
		data.Delete("_meta")
	}
	for _, k := range data.Keys() {
		v, _ := data.Get(k)
		group := inv.getGroup(k, false)
		if group == nil {
			continue
		}
		switch t := v.(type) {
		case *api.OMap:
			hostsVal, _ := t.Get("hosts")
			switch hs := hostsVal.(type) {
			case *api.OMap:
				for _, hk := range hs.Keys() {
					hv, _ := hs.Get(hk)
					host := inv.getHost(hk)
					if host == nil {
						continue
					}
					if hm, ok := hv.(*api.OMap); ok {
						mergeOMap(host.vars, hm)
					} else {
						inv.log(logWarning, "Expected dict of vars for host \"%s\", got %s instead", hk, typeName(hv))
					}
					group.addHost(host, inv.log)
				}
			case []any:
				for _, h := range hs {
					host := inv.getHost(fmt.Sprint(h))
					if host == nil {
						continue
					}
					group.addHost(host, inv.log)
				}
			case nil:
			default:
				inv.log(logWarning, "Expected dict or list of \"hosts\" for group \"%s\", got %s instead", k, typeName(hostsVal))
			}
			varsVal, ok := t.Get("vars")
			if ok {
				if vm, isMap := varsVal.(*api.OMap); isMap {
					mergeOMap(group.vars, vm)
				} else {
					inv.log(logWarning, "Expected dict of vars for group \"%s\", got %s instead", k, typeName(varsVal))
				}
			}
			childrenVal, ok := t.Get("children")
			if ok {
				if cl, isList := childrenVal.([]any); isList {
					for _, c := range cl {
						cname := fmt.Sprint(c)
						child := inv.getGroup(cname, true)
						if child != nil && cname != "ungrouped" && child != inv.all {
							group.addChild(child, inv.log)
						}
					}
				} else {
					inv.log(logWarning, "Expected list of children for group \"%s\", got %s instead", k, typeName(childrenVal))
				}
			}
		case []any:
			for _, h := range t {
				host := inv.getHost(fmt.Sprint(h))
				if host == nil {
					continue
				}
				group.addHost(host, inv.log)
			}
		default:
			inv.log(logWarning, "")
			inv.log(logWarning, "Expected dict or list for group \"%s\", got %s instead", k, typeName(v))
		}
		if k != "all" && k != "ungrouped" {
			inv.all.addChild(group, inv.log)
		}
	}
	if meta != nil {
		hv, _ := meta.Get("hostvars")
		hostvars, _ := hv.(*api.OMap)
		for _, name := range inv.hostOrder {
			if hostvars == nil {
				break
			}
			mv, ok := hostvars.Get(name)
			if !ok {
				continue
			}
			if m, isMap := mv.(*api.OMap); isMap {
				mergeOMap(inv.hosts[name].vars, m)
			} else {
				inv.log(logWarning, "Expected dict of vars for host \"%s\", got %s instead", name, typeName(mv))
			}
		}
	}
}

// --- python-compatible JSON ----------------------------------------------------------

// pyDumps is json.dumps with its defaults (", "/": " separators,
// ensure_ascii); sortKeys is sort_keys=True.
func pyDumps(v any, sortKeys bool) string {
	var b strings.Builder
	pyDump(&b, v, sortKeys)
	return b.String()
}

func pyDump(b *strings.Builder, v any, sortKeys bool) {
	switch t := v.(type) {
	case nil:
		b.WriteString("null")
	case bool:
		if t {
			b.WriteString("true")
		} else {
			b.WriteString("false")
		}
	case json.Number:
		b.WriteString(t.String())
	case float64:
		if t == math.Trunc(t) && math.Abs(t) < 1e16 {
			b.WriteString(strconv.FormatFloat(t, 'f', 1, 64))
		} else {
			b.WriteString(strconv.FormatFloat(t, 'g', -1, 64))
		}
	case int, int64:
		fmt.Fprint(b, t)
	case string:
		pyString(b, t)
	case []any:
		b.WriteByte('[')
		for i, x := range t {
			if i > 0 {
				b.WriteString(", ")
			}
			pyDump(b, x, sortKeys)
		}
		b.WriteByte(']')
	case *api.OMap:
		keys := t.Keys()
		if sortKeys {
			sort.Strings(keys)
		}
		b.WriteByte('{')
		for i, k := range keys {
			if i > 0 {
				b.WriteString(", ")
			}
			pyString(b, k)
			b.WriteString(": ")
			val, _ := t.Get(k)
			pyDump(b, val, sortKeys)
		}
		b.WriteByte('}')
	case map[string]any:
		keys := make([]string, 0, len(t))
		for k := range t {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		o := api.NewOMap()
		for _, k := range keys {
			o.Set(k, t[k])
		}
		pyDump(b, o, sortKeys)
	default:
		pyString(b, fmt.Sprint(t))
	}
}

func pyString(b *strings.Builder, s string) {
	b.WriteByte('"')
	for _, r := range s {
		switch r {
		case '"':
			b.WriteString(`\"`)
		case '\\':
			b.WriteString(`\\`)
		case '\n':
			b.WriteString(`\n`)
		case '\r':
			b.WriteString(`\r`)
		case '\t':
			b.WriteString(`\t`)
		case '\b':
			b.WriteString(`\b`)
		case '\f':
			b.WriteString(`\f`)
		default:
			switch {
			case r < 0x20 || (r >= 0x7f && r <= 0xffff):
				fmt.Fprintf(b, `\u%04x`, r)
			case r > 0xffff:
				r1, r2 := utf16.EncodeRune(r)
				fmt.Fprintf(b, `\u%04x\u%04x`, r1, r2)
			default:
				b.WriteRune(r)
			}
		}
	}
	b.WriteByte('"')
}

// parseVarsOrdered is variables_dict: YAML or JSON text as an ordered map.
func parseVarsOrdered(s string) *api.OMap {
	out := api.NewOMap()
	if strings.TrimSpace(s) == "" {
		return out
	}
	o := api.NewOMap()
	if err := json.Unmarshal([]byte(s), o); err == nil {
		return o
	}
	v, err := pyyaml.Load(s)
	if err != nil {
		return out
	}
	if m, ok := omapFromYAML(v).(*api.OMap); ok {
		return m
	}
	return out
}

// omapFromYAML turns pyyaml's mappings into OMaps, keys in document order.
func omapFromYAML(v any) any {
	switch t := v.(type) {
	case *pyyaml.Map:
		o := api.NewOMap()
		for i, k := range t.Keys {
			o.Set(k, omapFromYAML(t.Vals[i]))
		}
		return o
	case []any:
		l := make([]any, len(t))
		for i, x := range t {
			l[i] = omapFromYAML(x)
		}
		return l
	}
	return v
}

// canonical renders a value for comparisons (dict equality ignores order).
func canonical(v any) string { return pyDumps(v, true) }

// pyTruthy is Python truthiness of a decoded JSON value.
func pyTruthy(v any) bool {
	switch t := v.(type) {
	case nil:
		return false
	case bool:
		return t
	case json.Number:
		f, err := t.Float64()
		return err != nil || f != 0
	case string:
		return t != ""
	case []any:
		return len(t) > 0
	case *api.OMap:
		return t.Len() > 0
	}
	return true
}

// pyStr is str() of a decoded JSON value.
func pyStrValue(v any) string {
	switch t := v.(type) {
	case nil:
		return "None"
	case bool:
		if t {
			return "True"
		}
		return "False"
	case json.Number:
		return t.String()
	case string:
		return t
	case *api.OMap:
		var b strings.Builder
		b.WriteByte('{')
		for i, k := range t.Keys() {
			if i > 0 {
				b.WriteString(", ")
			}
			val, _ := t.Get(k)
			b.WriteString("'" + k + "': " + pyReprValue(val))
		}
		b.WriteByte('}')
		return b.String()
	case []any:
		parts := make([]string, len(t))
		for i, x := range t {
			parts[i] = pyReprValue(x)
		}
		return "[" + strings.Join(parts, ", ") + "]"
	}
	return fmt.Sprint(v)
}

func pyReprValue(v any) string {
	if s, ok := v.(string); ok {
		return "'" + strings.ReplaceAll(s, "'", `\'`) + "'"
	}
	return pyStrValue(v)
}

// unsafeLiteral is ansible.unsafe_literal: the value of an ansible-core
// 2.19 {"__ansible_unsafe": ...} wrapper.
func unsafeLiteral(v any) any {
	if m, ok := v.(*api.OMap); ok && m.Len() == 1 {
		if inner, ok := m.Get("__ansible_unsafe"); ok {
			return inner
		}
	}
	return v
}

// --- the import ---------------------------------------------------------------------

// importOptions are the perform_update options.
type importOptions struct {
	overwrite, overwriteVars bool
	enabledVar, enabledValue string
	enabledValueSet          bool
	hostFilter               string
	excludeEmptyGroups       bool
	instanceIDVar            string
}

// sourceImportSettings are the <SOURCE>_ENABLED_VAR, _ENABLED_VALUE,
// _EXCLUDE_EMPTY_GROUPS and _INSTANCE_ID_VAR settings.
var sourceImportSettings = map[string]struct {
	enabledVar, enabledValue string
	excludeEmpty             bool
	instanceIDVar            string
}{
	"ec2":         {"ec2_state", "running", true, "instance_id"},
	"vmware":      {"guest.gueststate", "running", true, "config.instanceUuid, config.instanceuuid"},
	"gce":         {"status", "running", true, "gce_id"},
	"azure_rm":    {"powerstate", "running", true, "id"},
	"openstack":   {"status", "ACTIVE", true, "openstack.id"},
	"rhv":         {"status", "up", true, "id"},
	"ascender":    {"remote_tower_enabled", "true", true, "remote_tower_id"},
	"satellite6":  {"foreman_enabled,foreman.enabled", "True", true, "foreman_id,foreman.id"},
	"terraform":   {"", "", true, "id"},
	"netbox":      {"status.value", "active", true, ""},
	"custom":      {"", "", false, ""},
	"scm":         {"", "", false, ""},
	"constructed": {"", "", false, "remote_tower_id"},
}

type inventoryImporter struct {
	ctx       context.Context
	tx        pgx.Tx
	log       importLogger
	opts      importOptions
	inventory *models.Inventory
	sourceID  int64
	inv       *memInventory

	dbInstanceIDMap map[string]int64
	existingHostPKs map[int64]bool
}

// instanceID is _get_instance_id.
func (im *inventoryImporter) instanceID(vars *api.OMap) string {
	var id any = ""
	if im.opts.instanceIDVar == "" {
		return ""
	}
	for _, single := range strings.Split(im.opts.instanceIDVar, ",") {
		var from any = vars
		for _, key := range strings.Split(strings.TrimSpace(single), ".") {
			m, ok := from.(*api.OMap)
			if !ok {
				id = ""
				break
			}
			v, ok := m.Get(key)
			if !ok {
				v = ""
			}
			id = v
			from = v
		}
		id = unsafeLiteral(id)
		if pyTruthy(id) {
			break
		}
	}
	return pyStrValue(id)
}

// enabled is _get_enabled: nil when there is no answer.
func (im *inventoryImporter) enabled(vars *api.OMap) *bool {
	if im.opts.enabledVar == "" {
		return nil
	}
	var from any = vars
	var val any
	found := true
	for _, key := range strings.Split(im.opts.enabledVar, ".") {
		m, ok := from.(*api.OMap)
		if !ok {
			found = false
			break
		}
		v, ok := m.Get(key)
		if !ok {
			found = false
			break
		}
		val = v
		from = v
	}
	if !found {
		return nil
	}
	val = unsafeLiteral(val)
	var b bool
	if im.opts.enabledValueSet {
		b = strings.EqualFold(im.opts.enabledValue, pyStrValue(val))
	} else {
		b = pyTruthy(val)
	}
	return &b
}

func (im *inventoryImporter) sourceHostIDs() (map[int64]bool, error) {
	ids, err := models.ScanIDs(im.ctx, im.tx, `SELECT host_id FROM main_host_inventory_sources WHERE inventorysource_id = $1`, im.sourceID)
	if err != nil {
		return nil, err
	}
	out := map[int64]bool{}
	for _, id := range ids {
		out[id] = true
	}
	return out, nil
}

type dbHost struct {
	id         int64
	name       string
	instanceID string
	variables  string
	enabled    bool
}

func (im *inventoryImporter) loadHosts(where string, args ...any) ([]dbHost, error) {
	rows, err := im.tx.Query(im.ctx, `SELECT id, name, instance_id, variables, enabled FROM main_host WHERE inventory_id = $1 AND `+where+` ORDER BY id`, append([]any{im.inventory.ID}, args...)...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []dbHost
	for rows.Next() {
		var h dbHost
		if err := rows.Scan(&h.id, &h.name, &h.instanceID, &h.variables, &h.enabled); err != nil {
			return nil, err
		}
		out = append(out, h)
	}
	return out, rows.Err()
}

// buildDBInstanceIDMap is _build_db_instance_id_map.
func (im *inventoryImporter) buildDBInstanceIDMap() error {
	im.dbInstanceIDMap = map[string]int64{}
	if im.opts.instanceIDVar == "" {
		return nil
	}
	parts := strings.Split(im.opts.instanceIDVar, ",")
	for i := len(parts) - 1; i >= 0; i-- {
		first := strings.Split(strings.TrimSpace(parts[i]), ".")[0]
		hosts, err := im.loadHosts(`id IN (SELECT host_id FROM main_host_inventory_sources WHERE inventorysource_id = $2) AND (instance_id = '' OR instance_id LIKE '{''__ansible_unsafe'': %') AND variables LIKE '%' || $3 || '%'`, im.sourceID, first)
		if err != nil {
			return err
		}
		for _, h := range hosts {
			id := im.instanceID(parseVarsOrdered(h.variables))
			if id == "" {
				continue
			}
			im.dbInstanceIDMap[id] = h.id
		}
	}
	return nil
}

// buildMemInstanceIDMap is _build_mem_instance_id_map.
func (im *inventoryImporter) buildMemInstanceIDMap() {
	if im.opts.instanceIDVar == "" {
		return
	}
	for _, name := range im.inv.hostOrder {
		h := im.inv.hosts[name]
		id := im.instanceID(h.vars)
		if id == "" {
			im.log(logWarning, "Host \"%s\" has no \"%s\" variable(s)", h.name, im.opts.instanceIDVar)
			continue
		}
		h.instanceID = id
	}
}

// buildPKMemHostMap is _build_pk_mem_host_map: database host id to the
// in-memory host it corresponds to, in matching order.
func (im *inventoryImporter) buildPKMemHostMap() (map[int64]string, []int64, error) {
	pkByName := map[string]int64{}
	var order []int64
	updated := map[int64]bool{}
	byID := map[int64]*memHost{}
	byInstance := map[string]*memHost{}
	for _, name := range im.inv.hostOrder {
		h := im.inv.hosts[name]
		id := im.instanceID(h.vars)
		if pk, ok := im.dbInstanceIDMap[id]; ok {
			byID[pk] = h
		} else if id != "" {
			byInstance[id] = h
		}
	}
	add := func(name string, pk int64) {
		if _, ok := pkByName[name]; !ok {
			pkByName[name] = pk
		}
		updated[pk] = true
		order = append(order, pk)
	}
	var pks []int64
	for pk := range byID {
		pks = append(pks, pk)
	}
	sort.Slice(pks, func(i, j int) bool { return pks[i] < pks[j] })
	if len(pks) > 0 {
		hosts, err := im.loadHosts(`id = ANY($2)`, pks)
		if err != nil {
			return nil, nil, err
		}
		for _, h := range hosts {
			if updated[h.id] {
				continue
			}
			add(byID[h.id].name, h.id)
		}
	}
	var ids []string
	for id := range byInstance {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	if len(ids) > 0 {
		hosts, err := im.loadHosts(`instance_id = ANY($2)`, ids)
		if err != nil {
			return nil, nil, err
		}
		for _, h := range hosts {
			if updated[h.id] {
				continue
			}
			add(byInstance[h.instanceID].name, h.id)
		}
	}
	names := append([]string(nil), im.inv.hostOrder...)
	sort.Strings(names)
	if len(names) > 0 {
		hosts, err := im.loadHosts(`name = ANY($2)`, names)
		if err != nil {
			return nil, nil, err
		}
		for _, h := range hosts {
			if updated[h.id] {
				continue
			}
			add(h.name, h.id)
		}
	}
	pkMem := map[int64]string{}
	var pkOrder []int64
	for _, pk := range order {
		for name, p := range pkByName {
			if p == pk {
				if _, seen := pkMem[pk]; !seen {
					pkMem[pk] = name
					pkOrder = append(pkOrder, pk)
				}
			}
		}
	}
	return pkMem, pkOrder, nil
}

func (im *inventoryImporter) deleteHosts(pkMem map[int64]string, cascade *models.Cascader) error {
	ids, err := models.ScanIDs(im.ctx, im.tx, `SELECT host_id FROM main_host_inventory_sources WHERE inventorysource_id = $1 ORDER BY host_id`, im.sourceID)
	if err != nil {
		return err
	}
	var del []int64
	for _, id := range ids {
		if _, keep := pkMem[id]; !keep {
			del = append(del, id)
		}
	}
	if len(del) == 0 {
		return nil
	}
	names := map[int64]string{}
	rows, err := im.tx.Query(im.ctx, `SELECT id, name FROM main_host WHERE id = ANY($1)`, del)
	if err == nil {
		for rows.Next() {
			var id int64
			var n string
			if rows.Scan(&id, &n) == nil {
				names[id] = n
			}
		}
		rows.Close()
	}
	if _, err := im.tx.Exec(im.ctx, `DELETE FROM main_group_hosts WHERE host_id = ANY($1)`, del); err != nil {
		return err
	}
	if err := cascade.Delete(im.ctx, im.tx, "main_host", "id", del); err != nil {
		return err
	}
	for _, id := range del {
		im.log(logDebug, "Deleted host \"%s\"", names[id])
	}
	return nil
}

func (im *inventoryImporter) deleteGroups(cascade *models.Cascader) error {
	rows, err := im.tx.Query(im.ctx, `SELECT g.id, g.name FROM main_group g JOIN main_group_inventory_sources gs ON gs.group_id = g.id WHERE gs.inventorysource_id = $1 ORDER BY g.id`, im.sourceID)
	if err != nil {
		return err
	}
	type gr struct {
		id   int64
		name string
	}
	var del []gr
	for rows.Next() {
		var g gr
		if err := rows.Scan(&g.id, &g.name); err != nil {
			rows.Close()
			return err
		}
		if _, keep := im.inv.groups[g.name]; !keep {
			del = append(del, g)
		}
	}
	rows.Close()
	for _, g := range del {
		if _, err := im.tx.Exec(im.ctx, `DELETE FROM main_group_hosts WHERE group_id = $1`, g.id); err != nil {
			return err
		}
		if _, err := im.tx.Exec(im.ctx, `DELETE FROM main_group_parents WHERE from_group_id = $1 OR to_group_id = $1`, g.id); err != nil {
			return err
		}
		if err := cascade.Delete(im.ctx, im.tx, "main_group", "id", []int64{g.id}); err != nil {
			return err
		}
		im.log(logDebug, "Group \"%s\" deleted", g.name)
	}
	return nil
}

// deleteGroupChildrenAndHosts is _delete_group_children_and_hosts.
func (im *inventoryImporter) deleteGroupChildrenAndHosts() error {
	rows, err := im.tx.Query(im.ctx, `SELECT g.id, g.name FROM main_group g JOIN main_group_inventory_sources gs ON gs.group_id = g.id WHERE gs.inventorysource_id = $1 ORDER BY g.id`, im.sourceID)
	if err != nil {
		return err
	}
	type gr struct {
		id   int64
		name string
	}
	var groups []gr
	for rows.Next() {
		var g gr
		if err := rows.Scan(&g.id, &g.name); err != nil {
			rows.Close()
			return err
		}
		groups = append(groups, g)
	}
	rows.Close()
	for _, g := range groups {
		mem := im.inv.groups[g.name]
		if mem == nil {
			continue
		}
		// child groups
		crow, err := im.tx.Query(im.ctx, `SELECT c.id, c.name FROM main_group c JOIN main_group_parents p ON p.from_group_id = c.id WHERE p.to_group_id = $1`, g.id)
		if err != nil {
			return err
		}
		childByName := map[string]int64{}
		for crow.Next() {
			var id int64
			var n string
			if crow.Scan(&id, &n) == nil {
				childByName[n] = id
			}
		}
		crow.Close()
		for _, c := range mem.children {
			delete(childByName, c.name)
		}
		for name := range childByName {
			if _, managed := im.inv.groups[name]; !managed {
				delete(childByName, name)
			}
		}
		for name, cid := range childByName {
			if _, err := im.tx.Exec(im.ctx, `DELETE FROM main_group_parents WHERE from_group_id = $1 AND to_group_id = $2`, cid, g.id); err != nil {
				return err
			}
			im.log(logDebug, "Group \"%s\" removed from group \"%s\"", name, g.name)
		}
		// host memberships
		hrow, err := im.tx.Query(im.ctx, `SELECT h.id, h.name, h.instance_id FROM main_host h JOIN main_group_hosts gh ON gh.host_id = h.id WHERE gh.group_id = $1`, g.id)
		if err != nil {
			return err
		}
		type hh struct {
			name, instanceID string
		}
		dbHosts := map[int64]hh{}
		for hrow.Next() {
			var id int64
			var n, iid string
			if hrow.Scan(&id, &n, &iid) == nil {
				dbHosts[id] = hh{n, iid}
			}
		}
		hrow.Close()
		memNames, memIDs := map[string]bool{}, map[string]bool{}
		for _, h := range mem.hosts {
			if h.instanceID == "" {
				memNames[h.name] = true
			} else {
				memIDs[h.instanceID] = true
			}
		}
		keepByDB := map[int64]bool{}
		for id, pk := range im.dbInstanceIDMap {
			if memIDs[id] {
				keepByDB[pk] = true
			}
		}
		for id, h := range dbHosts {
			if !im.existingHostPKs[id] {
				continue
			}
			if memNames[h.name] || (h.instanceID != "" && memIDs[h.instanceID]) || keepByDB[id] {
				continue
			}
			if _, err := im.tx.Exec(im.ctx, `DELETE FROM main_group_hosts WHERE group_id = $1 AND host_id = $2`, g.id, id); err != nil {
				return err
			}
			im.log(logDebug, "Host \"%s\" removed from group \"%s\"", h.name, g.name)
		}
	}
	return nil
}

func hashVariable(v any) string {
	sum := sha256.Sum256([]byte(pyDumps(v, true)))
	return hex.EncodeToString(sum[:])[:16]
}

// updateInventory is _update_inventory: the "all" group's variables go to
// the inventory, removing what this source wrote before and no longer
// provides when overwrite_vars is set.
func (im *inventoryImporter) updateInventory() error {
	source := im.inv.all.vars
	var varsText string
	if err := im.tx.QueryRow(im.ctx, `SELECT variables FROM main_inventory WHERE id = $1`, im.inventory.ID).Scan(&varsText); err != nil {
		return err
	}
	original := parseVarsOrdered(varsText)
	var prevRaw []byte
	_ = im.tx.QueryRow(im.ctx, `SELECT managed_inventory_variables FROM main_inventorysource WHERE unifiedjobtemplate_ptr_id = $1`, im.sourceID).Scan(&prevRaw)
	previous := api.NewOMap()
	if len(prevRaw) > 0 {
		_ = json.Unmarshal(prevRaw, previous)
	}
	var dbVars *api.OMap
	var overwriteSourceVars bool
	_ = im.tx.QueryRow(im.ctx, `SELECT overwrite_vars FROM main_inventorysource WHERE unifiedjobtemplate_ptr_id = $1`, im.sourceID).Scan(&overwriteSourceVars)
	if im.inventory.Kind == "constructed" && overwriteSourceVars {
		dbVars = source
	} else {
		dbVars = api.NewOMap()
		mergeOMap(dbVars, original)
		if im.opts.overwriteVars {
			if err := im.removeStaleInventoryVariables(dbVars, source, previous); err != nil {
				return err
			}
		}
		mergeOMap(dbVars, source)
	}
	if canonical(dbVars) != canonical(original) {
		if _, err := im.tx.Exec(im.ctx, `UPDATE main_inventory SET variables = $2 WHERE id = $1`, im.inventory.ID, pyDumps(dbVars, false)); err != nil {
			return err
		}
		im.log(logDebug, "Inventory variables updated from \"all\" group")
	} else {
		im.log(logDebug, "Inventory variables unmodified")
	}
	managed := api.NewOMap()
	for _, k := range source.Keys() {
		v, _ := source.Get(k)
		managed.Set(k, hashVariable(v))
	}
	if canonical(managed) != canonical(previous) {
		b, _ := managed.MarshalJSON()
		if _, err := im.tx.Exec(im.ctx, `UPDATE main_inventorysource SET managed_inventory_variables = $2::jsonb WHERE unifiedjobtemplate_ptr_id = $1`, im.sourceID, string(b)); err != nil {
			return err
		}
	}
	return nil
}

func (im *inventoryImporter) removeStaleInventoryVariables(dbVars, source, previous *api.OMap) error {
	var removed []string
	for _, k := range previous.Keys() {
		if !source.Has(k) && dbVars.Has(k) {
			removed = append(removed, k)
		}
	}
	if len(removed) == 0 {
		return nil
	}
	claimed := map[string]bool{}
	rows, err := im.tx.Query(im.ctx, `SELECT managed_inventory_variables FROM main_inventorysource WHERE inventory_id = $1 AND unifiedjobtemplate_ptr_id <> $2 AND managed_inventory_variables ?| $3`, im.inventory.ID, im.sourceID, removed)
	if err != nil {
		return err
	}
	for rows.Next() {
		var raw []byte
		if rows.Scan(&raw) == nil {
			var m map[string]any
			if json.Unmarshal(raw, &m) == nil {
				for k := range m {
					claimed[k] = true
				}
			}
		}
	}
	rows.Close()
	for _, k := range removed {
		prev, _ := previous.Get(k)
		cur, _ := dbVars.Get(k)
		switch {
		case claimed[k]:
			im.log(logDebug, "Inventory variable \"%s\" kept, another inventory source provides it", k)
		case hashVariable(cur) != fmt.Sprint(prev):
			im.log(logDebug, "Inventory variable \"%s\" kept, it was changed after the last sync", k)
		default:
			dbVars.Delete(k)
			im.log(logDebug, "Inventory variable \"%s\" removed, no longer provided by the source", k)
		}
	}
	return nil
}

func (im *inventoryImporter) linkSourceGroup(groupID int64) error {
	_, err := im.tx.Exec(im.ctx, `INSERT INTO main_group_inventory_sources (group_id, inventorysource_id) SELECT $1, $2 WHERE NOT EXISTS (SELECT 1 FROM main_group_inventory_sources WHERE group_id = $1 AND inventorysource_id = $2)`, groupID, im.sourceID)
	return err
}

func (im *inventoryImporter) linkSourceHost(hostID int64) error {
	_, err := im.tx.Exec(im.ctx, `INSERT INTO main_host_inventory_sources (host_id, inventorysource_id) SELECT $1, $2 WHERE NOT EXISTS (SELECT 1 FROM main_host_inventory_sources WHERE host_id = $1 AND inventorysource_id = $2)`, hostID, im.sourceID)
	return err
}

// createUpdateGroups is _create_update_groups.
func (im *inventoryImporter) createUpdateGroups() error {
	names := append([]string(nil), im.inv.groupOrder...)
	sort.Strings(names)
	existing := map[string]bool{}
	if len(names) > 0 {
		rows, err := im.tx.Query(im.ctx, `SELECT id, name, variables FROM main_group WHERE inventory_id = $1 AND name = ANY($2) ORDER BY id`, im.inventory.ID, names)
		if err != nil {
			return err
		}
		type gr struct {
			id         int64
			name, vars string
		}
		var groups []gr
		for rows.Next() {
			var g gr
			if err := rows.Scan(&g.id, &g.name, &g.vars); err != nil {
				rows.Close()
				return err
			}
			groups = append(groups, g)
		}
		rows.Close()
		for _, g := range groups {
			mem := im.inv.groups[g.name]
			current := parseVarsOrdered(g.vars)
			var dbVars *api.OMap
			if im.opts.overwriteVars {
				dbVars = mem.vars
			} else {
				dbVars = api.NewOMap()
				mergeOMap(dbVars, current)
				mergeOMap(dbVars, mem.vars)
			}
			if canonical(dbVars) != canonical(current) {
				if _, err := im.tx.Exec(im.ctx, `UPDATE main_group SET variables = $2, modified = now() WHERE id = $1`, g.id, pyDumps(dbVars, false)); err != nil {
					return err
				}
				if im.opts.overwriteVars {
					im.log(logDebug, "Group \"%s\" variables replaced", g.name)
				} else {
					im.log(logDebug, "Group \"%s\" variables updated", g.name)
				}
			} else {
				im.log(logDebug, "Group \"%s\" variables unmodified", g.name)
			}
			existing[g.name] = true
			if err := im.linkSourceGroup(g.id); err != nil {
				return err
			}
		}
	}
	for _, name := range names {
		if existing[name] {
			continue
		}
		mem := im.inv.groups[name]
		desc := "imported"
		if v, ok := mem.vars.Get("_awx_description"); ok {
			desc = pyStrValue(v)
			mem.vars.Delete("_awx_description")
		}
		var id int64
		if err := im.tx.QueryRow(im.ctx, `INSERT INTO main_group (created, modified, description, name, variables, created_by_id, inventory_id, modified_by_id)
			VALUES (now(), now(), $1, $2, $3, NULL, $4, NULL)
			ON CONFLICT (name, inventory_id) DO UPDATE SET description = EXCLUDED.description, variables = EXCLUDED.variables, modified = now() RETURNING id`,
			desc, name, pyDumps(mem.vars, false), im.inventory.ID).Scan(&id); err != nil {
			return err
		}
		im.log(logDebug, "Group \"%s\" added", name)
		if err := im.linkSourceGroup(id); err != nil {
			return err
		}
	}
	return nil
}

// stripConstructedVars drops the remote_* variables constructed hosts must
// not carry.
func (im *inventoryImporter) stripConstructedVars(vars *api.OMap) {
	if im.inventory.Kind != "constructed" {
		return
	}
	for _, prefix := range []string{"host", "tower"} {
		vars.Delete("remote_" + prefix + "_enabled")
		vars.Delete("remote_" + prefix + "_id")
	}
}

var jinjaMarkersRe = regexp.MustCompile(`\{\{|\{%|\{#`)

// createUpdateHosts is _create_update_hosts.
func (im *inventoryImporter) createUpdateHosts(pkMem map[int64]string) error {
	updatedNames := map[string]bool{}
	var pks []int64
	for pk := range pkMem {
		pks = append(pks, pk)
	}
	sort.Slice(pks, func(i, j int) bool { return pks[i] < pks[j] })
	if len(pks) > 0 {
		hosts, err := im.loadHosts(`id = ANY($2)`, pks)
		if err != nil {
			return err
		}
		for _, h := range hosts {
			mem := im.inv.hosts[pkMem[h.id]]
			if err := im.updateDBHost(h, mem); err != nil {
				return err
			}
			updatedNames[mem.name] = true
		}
	}
	var create []string
	for _, name := range im.inv.hostOrder {
		if !updatedNames[name] {
			create = append(create, name)
		}
	}
	sort.Strings(create)
	for _, name := range create {
		mem := im.inv.hosts[name]
		vars := mem.vars
		desc := "imported"
		if v, ok := vars.Get("_awx_description"); ok {
			desc = pyStrValue(v)
			vars.Delete("_awx_description")
		}
		en := im.enabled(vars)
		enabled := true
		if en != nil {
			enabled = *en
		}
		instanceID := ""
		if im.opts.instanceIDVar != "" {
			instanceID = im.instanceID(vars)
		}
		im.stripConstructedVars(vars)
		if jinjaMarkersRe.MatchString(name) {
			return fmt.Errorf("Inline Jinja variables are not allowed.: %s", name)
		}
		var id int64
		if err := im.tx.QueryRow(im.ctx, `INSERT INTO main_host (created, modified, description, name, enabled, instance_id, variables, created_by_id, inventory_id, modified_by_id, ansible_facts, ansible_facts_modified)
			VALUES (now(), now(), $1, $2, $3, $4, $5, NULL, $6, NULL, '{}'::jsonb, NULL)
			ON CONFLICT (name, inventory_id) DO UPDATE SET description = EXCLUDED.description, enabled = EXCLUDED.enabled, instance_id = EXCLUDED.instance_id, variables = EXCLUDED.variables, modified = now()
			RETURNING id`, desc, name, enabled, instanceID, pyDumps(vars, false), im.inventory.ID).Scan(&id); err != nil {
			return err
		}
		if en != nil && !*en {
			im.log(logDebug, "Host \"%s\" added (disabled)", name)
		} else {
			im.log(logDebug, "Host \"%s\" added", name)
		}
		if err := im.linkSourceHost(id); err != nil {
			return err
		}
	}
	return nil
}

// updateDBHost is _update_db_host_from_mem_host.
func (im *inventoryImporter) updateDBHost(h dbHost, mem *memHost) error {
	current := parseVarsOrdered(h.variables)
	memVars := mem.vars
	var sets []string
	args := []any{h.id}
	instanceID := im.instanceID(memVars)
	oldInstance := h.instanceID
	instanceChanged := instanceID != h.instanceID
	if instanceChanged {
		args = append(args, instanceID)
		sets = append(sets, fmt.Sprintf("instance_id = $%d", len(args)))
	}
	im.stripConstructedVars(memVars)
	var dbVars *api.OMap
	if im.opts.overwriteVars {
		dbVars = memVars
	} else {
		dbVars = api.NewOMap()
		mergeOMap(dbVars, current)
		mergeOMap(dbVars, memVars)
	}
	varsChanged := canonical(dbVars) != canonical(current)
	if varsChanged {
		args = append(args, pyDumps(dbVars, false))
		sets = append(sets, fmt.Sprintf("variables = $%d", len(args)))
	}
	en := im.enabled(memVars)
	enabledChanged := en != nil && *en != h.enabled
	if enabledChanged {
		args = append(args, *en)
		sets = append(sets, fmt.Sprintf("enabled = $%d", len(args)))
	}
	nameChanged := mem.name != h.name
	if nameChanged {
		args = append(args, mem.name)
		sets = append(sets, fmt.Sprintf("name = $%d", len(args)))
	}
	if len(sets) > 0 {
		if _, err := im.tx.Exec(im.ctx, `UPDATE main_host SET `+strings.Join(sets, ", ")+`, modified = now() WHERE id = $1`, args...); err != nil {
			return err
		}
	}
	if nameChanged {
		im.log(logDebug, "Host renamed from \"%s\" to \"%s\"", h.name, mem.name)
	}
	if instanceChanged {
		if oldInstance != "" {
			im.log(logDebug, "Host \"%s\" instance_id updated", mem.name)
		} else {
			im.log(logDebug, "Host \"%s\" instance_id added", mem.name)
		}
	}
	if varsChanged {
		if im.opts.overwriteVars {
			im.log(logDebug, "Host \"%s\" variables replaced", mem.name)
		} else {
			im.log(logDebug, "Host \"%s\" variables updated", mem.name)
		}
	} else {
		im.log(logDebug, "Host \"%s\" variables unmodified", mem.name)
	}
	if enabledChanged {
		if *en {
			im.log(logDebug, "Host \"%s\" is now enabled", mem.name)
		} else {
			im.log(logDebug, "Host \"%s\" is now disabled", mem.name)
		}
	}
	return im.linkSourceHost(h.id)
}

func (im *inventoryImporter) groupIDs(names []string) (map[string]int64, error) {
	out := map[string]int64{}
	if len(names) == 0 {
		return out, nil
	}
	rows, err := im.tx.Query(im.ctx, `SELECT id, name FROM main_group WHERE inventory_id = $1 AND name = ANY($2)`, im.inventory.ID, names)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id int64
		var n string
		if err := rows.Scan(&id, &n); err != nil {
			return nil, err
		}
		out[n] = id
	}
	return out, rows.Err()
}

// createUpdateGroupChildren is _create_update_group_children.
func (im *inventoryImporter) createUpdateGroupChildren() error {
	var names []string
	for _, n := range im.inv.groupOrder {
		if len(im.inv.groups[n].children) > 0 {
			names = append(names, n)
		}
	}
	sort.Strings(names)
	ids, err := im.groupIDs(im.inv.groupOrder)
	if err != nil {
		return err
	}
	for _, name := range names {
		parent, ok := ids[name]
		if !ok {
			continue
		}
		var children []string
		for _, c := range im.inv.groups[name].children {
			children = append(children, c.name)
		}
		sort.Strings(children)
		for _, cname := range children {
			child, ok := ids[cname]
			if !ok {
				continue
			}
			var exists bool
			if err := im.tx.QueryRow(im.ctx, `SELECT EXISTS (SELECT 1 FROM main_group_parents WHERE from_group_id = $1 AND to_group_id = $2)`, child, parent).Scan(&exists); err != nil {
				return err
			}
			if exists {
				im.log(logDebug, "Group \"%s\" already child of group \"%s\"", cname, name)
				continue
			}
			if _, err := im.tx.Exec(im.ctx, `INSERT INTO main_group_parents (from_group_id, to_group_id) VALUES ($1, $2)`, child, parent); err != nil {
				return err
			}
			im.log(logDebug, "Group \"%s\" added as child of \"%s\"", cname, name)
		}
	}
	return nil
}

// createUpdateGroupHosts is _create_update_group_hosts.
func (im *inventoryImporter) createUpdateGroupHosts() error {
	var names []string
	for _, n := range im.inv.groupOrder {
		if len(im.inv.groups[n].hosts) > 0 {
			names = append(names, n)
		}
	}
	sort.Strings(names)
	ids, err := im.groupIDs(names)
	if err != nil {
		return err
	}
	for _, name := range names {
		gid, ok := ids[name]
		if !ok {
			continue
		}
		var hostNames, instanceIDs []string
		for _, h := range im.inv.groups[name].hosts {
			if h.instanceID == "" {
				hostNames = append(hostNames, h.name)
			} else {
				instanceIDs = append(instanceIDs, h.instanceID)
			}
		}
		sort.Strings(hostNames)
		sort.Strings(instanceIDs)
		var hosts []dbHost
		if len(hostNames) > 0 {
			hs, err := im.loadHosts(`name = ANY($2)`, hostNames)
			if err != nil {
				return err
			}
			hosts = append(hosts, hs...)
		}
		if len(instanceIDs) > 0 {
			hs, err := im.loadHosts(`instance_id = ANY($2)`, instanceIDs)
			if err != nil {
				return err
			}
			hosts = append(hosts, hs...)
		}
		for _, h := range hosts {
			var exists bool
			if err := im.tx.QueryRow(im.ctx, `SELECT EXISTS (SELECT 1 FROM main_group_hosts WHERE group_id = $1 AND host_id = $2)`, gid, h.id).Scan(&exists); err != nil {
				return err
			}
			if exists {
				im.log(logDebug, "Host \"%s\" already in group \"%s\"", h.name, name)
				continue
			}
			if _, err := im.tx.Exec(im.ctx, `INSERT INTO main_group_hosts (group_id, host_id) VALUES ($1, $2)`, gid, h.id); err != nil {
				return err
			}
			im.log(logDebug, "Host \"%s\" added to group \"%s\"", h.name, name)
		}
	}
	return nil
}

// relinkOrphanedJobHostSummaries is _relink_orphaned_job_host_summaries.
func (im *inventoryImporter) relinkOrphanedJobHostSummaries() error {
	col := "host_id"
	if im.inventory.Kind == "constructed" {
		col = "constructed_host_id"
	}
	rows, err := im.tx.Query(im.ctx, `SELECT DISTINCT s.host_name, h.id FROM main_jobhostsummary s JOIN main_job j ON j.unifiedjob_ptr_id = s.job_id
		JOIN main_host h ON h.inventory_id = j.inventory_id AND h.name = s.host_name
		WHERE j.inventory_id = $1 AND s.`+col+` IS NULL ORDER BY s.host_name`, im.inventory.ID)
	if err != nil {
		return err
	}
	type pair struct {
		name string
		id   int64
	}
	var pairs []pair
	for rows.Next() {
		var p pair
		if rows.Scan(&p.name, &p.id) == nil {
			pairs = append(pairs, p)
		}
	}
	rows.Close()
	for _, p := range pairs {
		tag, err := im.tx.Exec(im.ctx, `UPDATE main_jobhostsummary SET `+col+` = $3 WHERE host_name = $2 AND `+col+` IS NULL AND job_id IN (SELECT unifiedjob_ptr_id FROM main_job WHERE inventory_id = $1)`, im.inventory.ID, p.name, p.id)
		if err != nil {
			return err
		}
		if n := tag.RowsAffected(); n > 0 {
			im.log(logInfo, "Re-linked %d orphaned job host summaries for host \"%s\"", n, p.name)
		}
	}
	return nil
}

// importFilters are perform_update's group and host filters: Python
// regular expressions (re.compile, then re.match on each name), "^.+$"
// when unset, so a name that is empty or holds a line break is filtered
// either way. A pattern re refuses is a CommandError; the other exceptions
// re.compile raises (a repeat count too large, incompatible flags) were not
// caught and failed the import with their own message.
func importFilters(opts importOptions) (groupRe, hostRe *pyre.Regexp, err error) {
	compile := func(pattern, option string) (*pyre.Regexp, error) {
		if pattern == "" {
			pattern = `^.+$`
		}
		re, err := pyre.Compile(pattern, 0)
		if err != nil {
			if _, ok := err.(*pyre.Error); ok {
				return nil, fmt.Errorf("invalid regular expression for %s", option)
			}
			return nil, err
		}
		return re, nil
	}
	if groupRe, err = compile("", "--group-filter"); err != nil {
		return nil, nil, err
	}
	if hostRe, err = compile(opts.hostFilter, "--host-filter"); err != nil {
		return nil, nil, err
	}
	return groupRe, hostRe, nil
}

// performUpdate is Command.perform_update: the output of ansible-inventory
// merged into the database in one transaction.
func (d *Dispatcher) performUpdate(ctx context.Context, opts importOptions, raw []byte, iu *models.InventoryUpdate, inventory *models.Inventory, sourceName string, log importLogger) error {
	begin := time.Now()
	groupRe, hostRe, err := importFilters(opts)
	if err != nil {
		return err
	}
	data := api.NewOMap()
	if err := json.Unmarshal(raw, data); err != nil {
		return fmt.Errorf("Failed to load JSON from output: %w", err)
	}
	conn, err := d.DB.Pool.Acquire(ctx)
	if err != nil {
		return err
	}
	defer conn.Release()
	lock := db.AdvisoryLockKey(fmt.Sprintf("inventory_%d_perform_update", inventory.ID))
	if _, err := conn.Exec(ctx, `SELECT pg_advisory_lock($1)`, lock); err != nil {
		return err
	}
	defer func() { _, _ = conn.Exec(context.Background(), `SELECT pg_advisory_unlock($1)`, lock) }()

	log(logInfo, "Processing JSON output...")
	mem := newMemInventory(groupRe, hostRe, log)
	dictToMemData(data, mem)
	log(logInfo, "Loaded %d groups, %d hosts", len(mem.groups), len(mem.hosts))
	if opts.excludeEmptyGroups {
		mem.deleteEmptyGroups()
	}
	// db.Begin: the activity stream log records wait for the commit.
	tx, err := db.Begin(ctx, conn)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(context.Background()) }()
	im := &inventoryImporter{ctx: ctx, tx: tx, log: log, opts: opts, inventory: inventory, inv: mem}
	if iu.InventorySourceID != nil {
		im.sourceID = *iu.InventorySourceID
	}
	if im.existingHostPKs, err = im.sourceHostIDs(); err != nil {
		return err
	}
	if err := im.buildDBInstanceIDMap(); err != nil {
		return err
	}
	im.buildMemInstanceIDMap()
	pkMem, _, err := im.buildPKMemHostMap()
	if err != nil {
		return err
	}
	if opts.overwrite {
		if err := im.deleteHosts(pkMem, d.API.Cascade); err != nil {
			return err
		}
		if err := im.deleteGroups(d.API.Cascade); err != nil {
			return err
		}
		if err := im.deleteGroupChildrenAndHosts(); err != nil {
			return err
		}
	}
	for _, step := range []func() error{im.updateInventory, im.createUpdateGroups, func() error { return im.createUpdateHosts(pkMem) },
		im.createUpdateGroupChildren, im.createUpdateGroupHosts, im.relinkOrphanedJobHostSummaries} {
		if err := step(); err != nil {
			return err
		}
	}
	if err := models.UpdateInventoryComputedFields(ctx, tx, inventory.ID); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}
	log(logInfo, "Inventory import completed for %s in %0.1fs", sourceName, time.Since(begin).Seconds())
	return nil
}

var _ = bytes.NewReader
