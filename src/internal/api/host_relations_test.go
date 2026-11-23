package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/ctrliq/ascender/internal/auth"
)

// listBody is the part of a paginated response the tests read.
type listBody struct {
	Count   int `json:"count"`
	Results []struct {
		ID        int64          `json:"id"`
		Name      string         `json:"name"`
		Job       int64          `json:"job"`
		Host      *int64         `json:"host"`
		Variables string         `json:"variables"`
		Related   map[string]any `json:"related"`
	} `json:"results"`
}

func (d *dbServer) list(path string) listBody {
	d.t.Helper()
	st, body := d.do("GET", path, nil)
	if st != http.StatusOK {
		d.t.Fatalf("GET %s: %d %s", path, st, body)
	}
	var l listBody
	if err := json.Unmarshal([]byte(body), &l); err != nil {
		d.t.Fatalf("GET %s: %v", path, err)
	}
	return l
}

func (l listBody) names() string {
	var out []string
	for _, r := range l.Results {
		out = append(out, r.Name)
	}
	return strings.Join(out, ",")
}

func (l listBody) ids() []int64 {
	var out []int64
	for _, r := range l.Results {
		out = append(out, r.ID)
	}
	return out
}

// A smart inventory has one host per name, the lowest id of those its
// filter (and the request's filters) select, in its hosts list, its count
// and its script; search= and <rel>__search= in the filter are expanded
// and single quotes are part of a value. Its hosts list is not limited to
// what the user may read (filter_read_permission = False).
func TestSmartInventoryHostsDistinct(t *testing.T) {
	d, _ := newScratchServer(t, "zz-smart-distinct-test")
	ctx := context.Background()
	invA, org := scratchInventory(t, d, "zz-smart-a", nil)
	st, body := d.do("POST", "/api/v2/inventories/", map[string]any{"name": "zz-smart-b", "organization": org})
	d.expect(st, body, http.StatusCreated, "")
	invB := d.id(body)
	webA := scratchHost(t, d, invA, "zz-web")
	webB := scratchHost(t, d, invB, "zz-web")
	dbB := scratchHost(t, d, invB, "zz-db")
	for id, vars := range map[int64]string{webA: `{"from": "a"}`, webB: `{"from": "b"}`} {
		st, body := d.do("PATCH", fmt.Sprintf("/api/v2/hosts/%d/", id), map[string]any{"variables": vars})
		d.expect(st, body, http.StatusOK, "")
	}
	smart := func(name, filter string) int64 {
		st, body := d.do("POST", "/api/v2/inventories/", map[string]any{"name": name, "organization": org, "kind": "smart", "host_filter": filter})
		d.expect(st, body, http.StatusCreated, "")
		return d.id(body)
	}
	s := smart("zz-smart", "name__startswith=zz-")
	hosts := fmt.Sprintf("/api/v2/inventories/%d/hosts/", s)

	l := d.list(hosts)
	if l.Count != 2 || l.names() != "zz-db,zz-web" || l.Results[1].ID != webA {
		t.Errorf("smart hosts: %+v", l)
	}
	if l := d.list(hosts + "?order_by=-name"); l.names() != "zz-web,zz-db" || l.Results[0].ID != webA {
		t.Errorf("ordered: %+v", l)
	}
	if l := d.list(hosts + "?page_size=1&page=2"); l.Count != 2 || l.names() != "zz-web" {
		t.Errorf("paged: %+v", l)
	}
	// The request's filters choose among the same-named hosts first.
	if _, err := d.Q().Exec(ctx, `UPDATE main_host SET enabled = false WHERE id = $1`, webB); err != nil {
		t.Fatal(err)
	}
	if l := d.list(hosts + "?enabled=false"); l.Count != 1 || l.Results[0].ID != webB {
		t.Errorf("enabled=false: %+v", l)
	}
	if _, err := d.Q().Exec(ctx, `UPDATE main_host SET enabled = true WHERE id = $1`, webB); err != nil {
		t.Fatal(err)
	}

	// The script (and a job's hosts) the same way.
	st, body = d.do("GET", fmt.Sprintf("/api/v2/inventories/%d/script/?hostvars=1", s), nil)
	d.expect(st, body, http.StatusOK, "")
	var script struct {
		All struct {
			Hosts []string `json:"hosts"`
		} `json:"all"`
		Meta struct {
			Hostvars map[string]map[string]any `json:"hostvars"`
		} `json:"_meta"`
	}
	if err := json.Unmarshal([]byte(body), &script); err != nil {
		t.Fatal(err)
	}
	if strings.Join(script.All.Hosts, ",") != "zz-db,zz-web" || script.Meta.Hostvars["zz-web"]["from"] != "a" {
		t.Errorf("script: %s", body)
	}

	// search= and <rel>__search= in the filter.
	if l := d.list(fmt.Sprintf("/api/v2/inventories/%d/hosts/", smart("zz-smart-search", "search=zz-we"))); l.Count != 1 || l.Results[0].ID != webA {
		t.Errorf("search=: %+v", l)
	}
	if l := d.list(fmt.Sprintf("/api/v2/inventories/%d/hosts/", smart("zz-smart-invsearch", "inventory__search=smart-b"))); l.Count != 2 || l.names() != "zz-db,zz-web" || l.Results[1].ID != webB {
		t.Errorf("inventory__search=: %+v", l)
	}
	if l := d.list("/api/v2/hosts/?host_filter=" + urlQueryEscape("search=zz-we or inventory__search=smart-b")); l.Count != 3 {
		t.Errorf("host_filter search: %+v", l)
	}
	if l := d.list(fmt.Sprintf("/api/v2/inventories/%d/hosts/", smart("zz-smart-quote", "name='zz-web'"))); l.Count != 0 {
		t.Errorf("single quotes: %+v", l)
	}
	st, body = d.do("GET", "/api/v2/hosts/?host_filter="+urlQueryEscape("group__search=x"), nil)
	d.expect(st, body, http.StatusBadRequest, `{"error":"Cannot resolve keyword 'group' into field. Choices are: `+hostFieldChoices+`"}`)
	st, body = d.do("POST", "/api/v2/inventories/", map[string]any{"name": "zz-smart-bad", "organization": org, "kind": "smart", "host_filter": "groups__search=x"})
	d.expect(st, body, http.StatusBadRequest, `{"host_filter":["Invalid query groups__search=x"]}`)

	// A user who reads the smart inventory alone sees its hosts.
	var readRole int64
	if err := d.Q().QueryRow(ctx, `SELECT read_role_id FROM main_inventory WHERE id = $1`, s).Scan(&readRole); err != nil {
		t.Fatal(err)
	}
	if _, err := d.Q().Exec(ctx, `INSERT INTO main_rbac_roles_members (role_id, user_id) VALUES ($1, $2)`, readRole, d.user.ID); err != nil {
		t.Fatal(err)
	}
	d.user.IsSuperuser = false
	if l := d.list(hosts); l.Count != 2 || l.names() != "zz-db,zz-web" {
		t.Errorf("as a reader of the smart inventory: %+v", l)
	}
	if l := d.list("/api/v2/hosts/"); l.Count != 0 {
		t.Errorf("as a reader of the smart inventory, /hosts/: %+v", l)
	}
	d.user.IsSuperuser = true
	_ = dbB
}

func urlQueryEscape(s string) string {
	r := strings.NewReplacer(" ", "%20", "=", "%3D", "'", "%27")
	return r.Replace(s)
}

// The host sub-lists the old API had and the Go one advertised without
// routes: job_events, job_host_summaries, inventory_sources and
// smart_inventories, with the old views' ordering, access and OPTIONS.
func TestHostRelatedLists(t *testing.T) {
	d, database := newScratchServer(t, "zz-host-relations-test")
	ctx := context.Background()
	inv, org := scratchInventory(t, d, "zz-hostrel", nil)
	h := scratchHost(t, d, inv, "zz-h")
	h2 := scratchHost(t, d, inv, "zz-h2")
	done := time.Now().Add(-time.Hour)
	j1 := scratchJob(t, d, database, "job", inv, "successful", &done, 3)
	j2 := scratchJob(t, d, database, "job", inv, "failed", &done, 1)
	var events []int64
	for i, e := range []struct{ job, host int64 }{{j1, h}, {j1, h2}, {j2, h}, {j1, h}} {
		events = append(events, scratchEvent(t, d, database, "main_jobevent", "job_id", e.job, map[string]any{"host_id": e.host, "host_name": "zz", "event": "runner_on_ok", "counter": i + 1, "event_data": "{}"}))
	}
	var sums []int64
	for _, s := range []struct{ job, host int64 }{{j1, h}, {j1, h2}, {j2, h}} {
		sums = append(sums, scratchInsert(t, database, "main_jobhostsummary", map[string]any{"job_id": s.job, "host_id": s.host, "host_name": fmt.Sprint("zz-h", s.host)}))
	}

	st, body := d.do("GET", fmt.Sprintf("/api/v2/hosts/%d/", h), nil)
	d.expect(st, body, http.StatusOK, "")

	l := d.list(fmt.Sprintf("/api/v2/hosts/%d/job_events/", h))
	if fmt.Sprint(l.ids()) != fmt.Sprint([]int64{events[0], events[2], events[3]}) || l.Results[1].Job != j2 {
		t.Errorf("job_events: %+v", l)
	}
	if l := d.list(fmt.Sprintf("/api/v2/hosts/%d/job_events/?job=%d", h, j2)); l.Count != 1 {
		t.Errorf("job_events?job=: %+v", l)
	}
	r := httptest.NewRequest("GET", fmt.Sprintf("/api/v2/hosts/%d/job_events/", h), nil)
	r = r.WithContext(auth.WithUser(r.Context(), d.user))
	w := httptest.NewRecorder()
	d.Routes().ServeHTTP(w, r)
	if w.Header().Get("X-UI-Max-Events") == "" {
		t.Error("job_events: no X-UI-Max-Events")
	}
	l = d.list(fmt.Sprintf("/api/v2/hosts/%d/job_host_summaries/", h))
	if fmt.Sprint(l.ids()) != fmt.Sprint([]int64{sums[2], sums[0]}) || l.Results[0].Job != j2 {
		t.Errorf("job_host_summaries: %+v", l)
	}

	// A constructed inventory's host has its summaries as constructed_host.
	st, body = d.do("POST", "/api/v2/constructed_inventories/", map[string]any{"name": "zz-hostrel-constructed", "organization": org})
	d.expect(st, body, http.StatusCreated, "")
	ch := scratchInsert(t, database, "main_host", map[string]any{"name": "zz-h", "inventory_id": d.id(body), "enabled": true, "ansible_facts": "{}", "instance_id": fmt.Sprint(h)})
	cs := scratchInsert(t, database, "main_jobhostsummary", map[string]any{"job_id": j2, "host_id": h2, "constructed_host_id": ch, "host_name": "zz-constructed"})
	if l := d.list(fmt.Sprintf("/api/v2/hosts/%d/job_host_summaries/", ch)); fmt.Sprint(l.ids()) != fmt.Sprint([]int64{cs}) {
		t.Errorf("constructed host summaries: %+v", l)
	}

	// Sources the host came from, smart inventories holding it.
	ujt := scratchInsert(t, database, "main_unifiedjobtemplate", map[string]any{"polymorphic_ctype_id": d.CT.ID("main.inventorysource"), "name": "zz-hostrel-src", "status": "never updated"})
	scratchInsert(t, database, "main_inventorysource", map[string]any{"unifiedjobtemplate_ptr_id": ujt, "inventory_id": inv, "source": "ec2"})
	scratchInsert(t, database, "main_host_inventory_sources", map[string]any{"host_id": h, "inventorysource_id": ujt})
	if l := d.list(fmt.Sprintf("/api/v2/hosts/%d/inventory_sources/", h)); fmt.Sprint(l.ids()) != fmt.Sprint([]int64{ujt}) {
		t.Errorf("inventory_sources: %+v", l)
	}
	if l := d.list(fmt.Sprintf("/api/v2/hosts/%d/inventory_sources/", h2)); l.Count != 0 {
		t.Errorf("inventory_sources of another host: %+v", l)
	}
	st, body = d.do("POST", "/api/v2/inventories/", map[string]any{"name": "zz-hostrel-smart", "organization": org, "kind": "smart", "host_filter": "name=zz-h"})
	d.expect(st, body, http.StatusCreated, "")
	smart := d.id(body)
	scratchInsert(t, database, "main_smartinventorymembership", map[string]any{"host_id": h, "inventory_id": smart})
	if l := d.list(fmt.Sprintf("/api/v2/hosts/%d/smart_inventories/", h)); fmt.Sprint(l.ids()) != fmt.Sprint([]int64{smart}) {
		t.Errorf("smart_inventories: %+v", l)
	}

	// OPTIONS: the old views' documents.
	for sub, name := range map[string]string{"job_events": "Job Events List", "job_host_summaries": "Job Host Summaries List", "inventory_sources": "Host Inventory Sources List", "smart_inventories": "Host Smart Inventories List"} {
		st, body := d.do("OPTIONS", fmt.Sprintf("/api/v2/hosts/%d/%s/", h, sub), nil)
		var doc struct {
			Name    string                    `json:"name"`
			Actions map[string]map[string]any `json:"actions"`
		}
		if err := json.Unmarshal([]byte(body), &doc); st != http.StatusOK || err != nil || doc.Name != name || len(doc.Actions) != 1 || doc.Actions["GET"] == nil {
			t.Errorf("OPTIONS %s: %d %.200s", sub, st, body)
		}
	}

	// A reader of the host's inventory: the sources and events, not the
	// smart inventory it cannot read.
	var readRole int64
	if err := d.Q().QueryRow(ctx, `SELECT read_role_id FROM main_inventory WHERE id = $1`, inv).Scan(&readRole); err != nil {
		t.Fatal(err)
	}
	if _, err := d.Q().Exec(ctx, `INSERT INTO main_rbac_roles_members (role_id, user_id) VALUES ($1, $2)`, readRole, d.user.ID); err != nil {
		t.Fatal(err)
	}
	d.user.IsSuperuser = false
	if l := d.list(fmt.Sprintf("/api/v2/hosts/%d/smart_inventories/", h)); l.Count != 0 {
		t.Errorf("smart_inventories as a reader: %+v", l)
	}
	if l := d.list(fmt.Sprintf("/api/v2/hosts/%d/inventory_sources/", h)); l.Count != 1 {
		t.Errorf("inventory_sources as a reader: %+v", l)
	}
	if l := d.list(fmt.Sprintf("/api/v2/hosts/%d/job_events/", h)); l.Count != 3 {
		t.Errorf("job_events as a reader: %+v", l)
	}
	if l := d.list(fmt.Sprintf("/api/v2/hosts/%d/job_host_summaries/", h)); l.Count != 2 {
		t.Errorf("job_host_summaries as a reader: %+v", l)
	}
	d.user.IsSuperuser = true
}

// Every related link of a host, a group and each kind of inventory names
// a route.
func TestRelatedLinksRouted(t *testing.T) {
	d, database := newScratchServer(t, "zz-related-links-test")
	inv, org := scratchInventory(t, d, "zz-links", nil)
	h := scratchHost(t, d, inv, "zz-h")
	st, body := d.do("POST", "/api/v2/groups/", map[string]any{"name": "zz-g", "inventory": inv})
	d.expect(st, body, http.StatusCreated, "")
	g := d.id(body)
	smart, _ := scratchInventory(t, d, "zz-links-smart", map[string]any{"kind": "smart", "host_filter": "name=zz-h"})
	st, body = d.do("POST", "/api/v2/constructed_inventories/", map[string]any{"name": "zz-links-constructed", "organization": org})
	d.expect(st, body, http.StatusCreated, "")
	constructed := d.id(body)
	ch := scratchInsert(t, database, "main_host", map[string]any{"name": "zz-h", "inventory_id": constructed, "enabled": true, "ansible_facts": "{}", "instance_id": fmt.Sprint(h)})
	st, body = d.do("POST", "/api/v2/federated_inventories/", map[string]any{"name": "zz-links-federated", "organization": org})
	d.expect(st, body, http.StatusCreated, "")
	federated := d.id(body)

	missing := map[string]bool{}
	for _, obj := range []string{
		fmt.Sprintf("/api/v2/hosts/%d/", h), fmt.Sprintf("/api/v2/hosts/%d/", ch), fmt.Sprintf("/api/v2/groups/%d/", g),
		fmt.Sprintf("/api/v2/inventories/%d/", inv), fmt.Sprintf("/api/v2/inventories/%d/", smart),
		fmt.Sprintf("/api/v2/inventories/%d/", constructed), fmt.Sprintf("/api/v2/inventories/%d/", federated),
	} {
		st, body := d.do("GET", obj, nil)
		d.expect(st, body, http.StatusOK, "")
		var v struct {
			Related map[string]any `json:"related"`
		}
		if err := json.Unmarshal([]byte(body), &v); err != nil {
			t.Fatal(err)
		}
		for _, link := range v.Related {
			u, ok := link.(string)
			if !ok {
				continue
			}
			if st, _ := d.do("GET", u, nil); st == http.StatusNotFound {
				missing[strings.NewReplacer(fmt.Sprint(g), "{id}").Replace(u)] = true
			}
		}
	}
	var got []string
	for u := range missing {
		got = append(got, u)
	}
	sort.Strings(got)
	if len(got) > 0 {
		t.Errorf("related links without a route: %v", got)
	}
}

// The group sub-lists of the old group views: job_events and
// job_host_summaries over Group.all_hosts (the hosts of the group and the
// groups below it, within its inventory; constructed_host for a
// constructed inventory's group) and inventory_sources over the sources
// that made the group, with the old views' ordering, access and OPTIONS.
func TestGroupRelatedLists(t *testing.T) {
	d, database := newScratchServer(t, "zz-group-relations-test")
	ctx := context.Background()
	inv, org := scratchInventory(t, d, "zz-grouprel", nil)
	other, _ := scratchInventory(t, d, "zz-grouprel-other", nil)
	h1 := scratchHost(t, d, inv, "zz-h1")
	h2 := scratchHost(t, d, inv, "zz-h2")
	h3 := scratchHost(t, d, inv, "zz-h3")
	stray := scratchHost(t, d, other, "zz-stray")
	group := func(name string) int64 {
		st, body := d.do("POST", "/api/v2/groups/", map[string]any{"name": name, "inventory": inv})
		d.expect(st, body, http.StatusCreated, "")
		return d.id(body)
	}
	top, child, grandchild, sibling := group("zz-top"), group("zz-child"), group("zz-grandchild"), group("zz-sibling")
	for _, l := range [][2]int64{{child, top}, {grandchild, child}} {
		scratchInsert(t, database, "main_group_parents", map[string]any{"from_group_id": l[0], "to_group_id": l[1]})
	}
	for _, m := range [][2]int64{{top, h1}, {grandchild, h2}, {sibling, h3}, {child, h1}} {
		scratchInsert(t, database, "main_group_hosts", map[string]any{"group_id": m[0], "host_id": m[1]})
	}
	// A host of another inventory linked to the group is not one of its
	// hosts (get_group_hosts_map kept the inventory's own).
	scratchInsert(t, database, "main_group_hosts", map[string]any{"group_id": child, "host_id": stray})

	done := time.Now().Add(-time.Hour)
	j1 := scratchJob(t, d, database, "job", inv, "successful", &done, 4)
	j2 := scratchJob(t, d, database, "job", inv, "failed", &done, 1)
	var events []int64
	for i, e := range []struct{ job, host int64 }{{j1, h1}, {j1, h3}, {j2, h2}, {j1, stray}, {j1, h2}} {
		events = append(events, scratchEvent(t, d, database, "main_jobevent", "job_id", e.job, map[string]any{"host_id": e.host, "host_name": "zz", "event": "runner_on_ok", "counter": i + 1, "event_data": "{}", "stdout": fmt.Sprint("zz-out-", i)}))
	}
	var sums []int64
	for _, s := range []struct{ job, host int64 }{{j1, h1}, {j1, h3}, {j2, h2}, {j2, stray}} {
		sums = append(sums, scratchInsert(t, database, "main_jobhostsummary", map[string]any{"job_id": s.job, "host_id": s.host, "host_name": fmt.Sprint("zz-h", s.host)}))
	}

	l := d.list(fmt.Sprintf("/api/v2/groups/%d/job_events/", top))
	if fmt.Sprint(l.ids()) != fmt.Sprint([]int64{events[0], events[2], events[4]}) || l.Results[1].Job != j2 {
		t.Errorf("job_events: %+v", l)
	}
	if l := d.list(fmt.Sprintf("/api/v2/groups/%d/job_events/?job=%d", top, j1)); l.Count != 2 {
		t.Errorf("job_events?job=: %+v", l)
	}
	if l := d.list(fmt.Sprintf("/api/v2/groups/%d/job_events/?search=zz-out-4", top)); fmt.Sprint(l.ids()) != fmt.Sprint([]int64{events[4]}) {
		t.Errorf("job_events?search=: %+v", l)
	}
	if l := d.list(fmt.Sprintf("/api/v2/groups/%d/job_events/", grandchild)); fmt.Sprint(l.ids()) != fmt.Sprint([]int64{events[2], events[4]}) {
		t.Errorf("grandchild job_events: %+v", l)
	}
	r := httptest.NewRequest("GET", fmt.Sprintf("/api/v2/groups/%d/job_events/", top), nil)
	r = r.WithContext(auth.WithUser(r.Context(), d.user))
	w := httptest.NewRecorder()
	d.Routes().ServeHTTP(w, r)
	if w.Code != http.StatusOK || w.Header().Get("X-UI-Max-Events") == "" {
		t.Errorf("job_events: %d, X-UI-Max-Events %q", w.Code, w.Header().Get("X-UI-Max-Events"))
	}
	l = d.list(fmt.Sprintf("/api/v2/groups/%d/job_host_summaries/", top))
	if fmt.Sprint(l.ids()) != fmt.Sprint([]int64{sums[2], sums[0]}) || l.Results[0].Job != j2 {
		t.Errorf("job_host_summaries: %+v", l)
	}
	if l := d.list(fmt.Sprintf("/api/v2/groups/%d/job_host_summaries/", sibling)); fmt.Sprint(l.ids()) != fmt.Sprint([]int64{sums[1]}) {
		t.Errorf("sibling job_host_summaries: %+v", l)
	}

	// A constructed inventory's group has its summaries as constructed_host.
	st, body := d.do("POST", "/api/v2/constructed_inventories/", map[string]any{"name": "zz-grouprel-constructed", "organization": org})
	d.expect(st, body, http.StatusCreated, "")
	constructed := d.id(body)
	ch := scratchInsert(t, database, "main_host", map[string]any{"name": "zz-h1", "inventory_id": constructed, "enabled": true, "ansible_facts": "{}", "instance_id": fmt.Sprint(h1)})
	cg := scratchInsert(t, database, "main_group", map[string]any{"name": "zz-cgroup", "inventory_id": constructed, "variables": ""})
	scratchInsert(t, database, "main_group_hosts", map[string]any{"group_id": cg, "host_id": ch})
	cs := scratchInsert(t, database, "main_jobhostsummary", map[string]any{"job_id": j2, "host_id": h1, "constructed_host_id": ch, "host_name": "zz-constructed"})
	if l := d.list(fmt.Sprintf("/api/v2/groups/%d/job_host_summaries/", cg)); fmt.Sprint(l.ids()) != fmt.Sprint([]int64{cs}) {
		t.Errorf("constructed group summaries: %+v", l)
	}

	// The sources that made the group.
	ujt := scratchInsert(t, database, "main_unifiedjobtemplate", map[string]any{"polymorphic_ctype_id": d.CT.ID("main.inventorysource"), "name": "zz-grouprel-src", "status": "never updated"})
	scratchInsert(t, database, "main_inventorysource", map[string]any{"unifiedjobtemplate_ptr_id": ujt, "inventory_id": inv, "source": "ec2"})
	scratchInsert(t, database, "main_group_inventory_sources", map[string]any{"group_id": child, "inventorysource_id": ujt})
	if l := d.list(fmt.Sprintf("/api/v2/groups/%d/inventory_sources/", child)); fmt.Sprint(l.ids()) != fmt.Sprint([]int64{ujt}) {
		t.Errorf("inventory_sources: %+v", l)
	}
	if l := d.list(fmt.Sprintf("/api/v2/groups/%d/inventory_sources/", top)); l.Count != 0 {
		t.Errorf("inventory_sources of another group: %+v", l)
	}
	// all_hosts is the same Group.all_hosts.
	if l := d.list(fmt.Sprintf("/api/v2/groups/%d/all_hosts/", top)); l.names() != "zz-h1,zz-h2" {
		t.Errorf("all_hosts: %+v", l)
	}

	// OPTIONS: the old views' documents.
	for sub, name := range map[string]string{"job_events": "Job Events List", "job_host_summaries": "Job Host Summaries List", "inventory_sources": "Group Inventory Sources List"} {
		st, body := d.do("OPTIONS", fmt.Sprintf("/api/v2/groups/%d/%s/", top, sub), nil)
		var doc struct {
			Name        string                    `json:"name"`
			Description string                    `json:"description"`
			Actions     map[string]map[string]any `json:"actions"`
		}
		if err := json.Unmarshal([]byte(body), &doc); st != http.StatusOK || err != nil || doc.Name != name || len(doc.Actions) != 1 || doc.Actions["GET"] == nil || !strings.Contains(doc.Description, "for a Group:") {
			t.Errorf("OPTIONS %s: %d %.200s", sub, st, body)
		}
	}

	// Someone who cannot read the inventory gets a 403; a reader sees the
	// events, the summaries and the sources.
	d.user.IsSuperuser = false
	for _, sub := range []string{"job_events", "job_host_summaries", "inventory_sources"} {
		if st, body := d.do("GET", fmt.Sprintf("/api/v2/groups/%d/%s/", top, sub), nil); st != http.StatusForbidden && st != http.StatusNotFound {
			t.Errorf("%s as a stranger: %d %s", sub, st, body)
		}
	}
	var readRole int64
	if err := d.Q().QueryRow(ctx, `SELECT read_role_id FROM main_inventory WHERE id = $1`, inv).Scan(&readRole); err != nil {
		t.Fatal(err)
	}
	if _, err := d.Q().Exec(ctx, `INSERT INTO main_rbac_roles_members (role_id, user_id) VALUES ($1, $2)`, readRole, d.user.ID); err != nil {
		t.Fatal(err)
	}
	if l := d.list(fmt.Sprintf("/api/v2/groups/%d/job_events/", top)); l.Count != 3 {
		t.Errorf("job_events as a reader: %+v", l)
	}
	// With the summary of the constructed host's source host, h1.
	if l := d.list(fmt.Sprintf("/api/v2/groups/%d/job_host_summaries/", top)); l.Count != 3 {
		t.Errorf("job_host_summaries as a reader: %+v", l)
	}
	if l := d.list(fmt.Sprintf("/api/v2/groups/%d/inventory_sources/", child)); l.Count != 1 {
		t.Errorf("inventory_sources as a reader: %+v", l)
	}
	d.user.IsSuperuser = true
}
