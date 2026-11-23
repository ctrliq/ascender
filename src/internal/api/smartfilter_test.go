package api

import (
	"fmt"
	"strings"
	"testing"
)

// The host filter grammar and ansible_facts containment, against what the
// old SmartFilter answered for the same filters.
func TestSmartQueryGrammar(t *testing.T) {
	cases := []struct{ filter, err string }{
		{`name__icontains=Demo`, ""},
		{`name="Demo-Rocky9-1" or (name=fa and enabled=true)`, ""},
		{`name=""`, ""},
		{`groups__name=Rocky9`, ""},
		{`ansible_facts__ansible_all_ipv4_addresses[]=10.0.0.1`, ""},
		{`not name=x`, "Invalid query not name=x"},
		{`name=x AND name=y`, "Invalid query name=x AND name=y"},
		{`nosuchfield=1`, "Invalid query nosuchfield=1"},
		{`name=a and`, "Invalid query name=a and"},
		{`host_filter=ansible_facts__a=b`, "Invalid query host_filter=ansible_facts__a=b"},
		{`name=`, "list index out of range"},
		{`name=(x)`, "list index out of range"},
		// _expand_search, and the errors other than ParseException that
		// building the filter raised, as the old code answered them.
		{`search=web`, ""},
		{`search=x or inventory__search=y`, ""},
		{`inventory__name__search=x`, ""},
		{`search="a b"`, ""},
		{`groups__search=x`, "Invalid query groups__search=x"},
		{`nosuch__search=x`, "Invalid query nosuch__search=x"},
		{`name__search=x`, "Invalid query name__search=x"},
		{`role__search=x`, "Invalid query role__search=x"},
		{`ActivityStream__search=x`, "Invalid query ActivityStream__search=x"},
		{`last_job__search=x`, "Invalid query last_job__search=x"},
		{`searchx=1`, "Invalid query searchx=1"},
		{`search__icontains=x`, "Invalid query search__icontains=x"},
		{`group__search=x`, "Cannot resolve keyword 'group' into field. Choices are: " + hostFieldChoices},
		{`HOST__search=x`, "Cannot resolve keyword 'HOST' into field. Choices are: " + hostFieldChoices},
		{`activitystream__search=x`, "Unsupported lookup 'search' for ForeignKey or join on the field not permitted."},
		{`search=null`, "Cannot use None as a query value"},
		{`inventory__search=null`, "Cannot use None as a query value"},
		{`name__icontains=null`, "Cannot use None as a query value"},
		{`name__isnull=null`, "Cannot use None as a query value"},
		{`name__in=null`, "'NoneType' object is not iterable"},
		{`name__in=5`, "'int' object is not iterable"},
		{`name__in=1.5`, "'float' object is not iterable"},
		{`name__in=true`, "'bool' object is not iterable"},
		{`search=null and nosuch=1`, "Cannot use None as a query value"},
		{`nosuch=1 and search=null`, "Invalid query nosuch=1 and search=null"},
		// Single quotes are ordinary characters.
		{`name='web'`, ""},
		{`name='a`, ""},
		{`name='a b'`, "Invalid query name='a b'"},
		{`'name'=x`, "Invalid query 'name'=x"},
	}
	for _, c := range cases {
		_, err := smartQuery(c.filter)
		got := ""
		if err != nil {
			got = err.Error()
		}
		if got != c.err {
			t.Errorf("%q: got %q, want %q", c.filter, got, c.err)
		}
	}
	if err := validateHostFilter(`ansible_facts__ansible_distribution__icontains=rock`); err == nil || err.Error() != "ansible_facts does not support searching with __icontains" {
		t.Errorf("facts lookup: %v", err)
	}
}

func TestSmartFactsContains(t *testing.T) {
	cases := []struct {
		key  string
		node smartNode
		want string
	}{
		{"ansible_facts__ansible_distribution", smartNode{value: "Rocky"}, `{"ansible_distribution":"Rocky"}`},
		{"ansible_facts__ansible_distribution__exact", smartNode{value: "Rocky"}, `{"ansible_distribution":"Rocky"}`},
		{"ansible_facts__ansible_distribution__icontains", smartNode{value: "rock"}, `{"ansible_distribution":{"icontains":"rock"}}`},
		{"ansible_facts__major", smartNode{value: "9"}, `{"major":9}`},
		{"ansible_facts__major", smartNode{value: "9", quoted: true}, `{"major":"9"}`},
		{"ansible_facts__ok", smartNode{value: "true"}, `{"ok":true}`},
		{"ansible_facts__none", smartNode{value: "null"}, `{"none":null}`},
		{"ansible_facts__ips[]", smartNode{value: "10.0.0.1"}, `{"ips":["10.0.0.1"]}`},
		{"ansible_facts__mounts[]__device", smartNode{value: "/dev/sda"}, `{"mounts":[{"device":"/dev/sda"}]}`},
	}
	for _, c := range cases {
		n := c.node
		b, err := smartFactsContains(c.key, smartFactValue(&n))
		if err != nil || strings.TrimSpace(string(b)) != c.want {
			t.Errorf("%s=%s: got %s (%v), want %s", c.key, c.node.value, b, err, c.want)
		}
	}
}

// The SQL of terms whose values the old code typed or expanded, against
// the queries Django built for them (in the old image).
func TestSmartFilterTermSQL(t *testing.T) {
	cases := []struct {
		filter, where string
		args          []any
	}{
		{`search=web`, `(UPPER(h.description) LIKE UPPER($1) ESCAPE '\' OR UPPER(h.name) LIKE UPPER($2) ESCAPE '\')`, []any{"%web%", "%web%"}},
		{`search=+05`, `(UPPER(h.description) LIKE UPPER($1) ESCAPE '\' OR UPPER(h.name) LIKE UPPER($2) ESCAPE '\')`, []any{"%5%", "%5%"}},
		{`search=true`, `(UPPER(h.description) LIKE UPPER($1) ESCAPE '\' OR UPPER(h.name) LIKE UPPER($2) ESCAPE '\')`, []any{"%True%", "%True%"}},
		{`search="null"`, `(UPPER(h.description) LIKE UPPER($1) ESCAPE '\' OR UPPER(h.name) LIKE UPPER($2) ESCAPE '\')`, []any{"%null%", "%null%"}},
		{`inventory__search=1.50`, `(UPPER(hi.description) LIKE UPPER($1) ESCAPE '\' OR UPPER(hi.name) LIKE UPPER($2) ESCAPE '\')`, []any{"%1.5%", "%1.5%"}},
		{`name='web'`, `h.name = $1`, []any{"'web'"}},
		{`name=007`, `h.name = $1`, []any{"7"}},
		{`name=-0`, `h.name = $1`, []any{"0"}},
		{`name=10.0`, `h.name = $1`, []any{"10.0"}},
		{`name=123456789012345678.0`, `h.name = $1`, []any{"1.2345678901234568e+17"}},
		{`name=99999999999999999999`, `h.name = $1`, []any{"99999999999999999999"}},
		{`name=true`, `h.name = $1`, []any{"True"}},
		{`name="true"`, `h.name = $1`, []any{"true"}},
		{`name="null"`, `h.name = $1`, []any{"null"}},
		{`name=null`, `h.name IS NULL`, nil},
		{`name__iexact=null`, `h.name IS NULL`, nil},
		{`enabled=null`, `h.enabled IS NULL`, nil},
		{`enabled=true`, `h.enabled = $1`, []any{true}},
	}
	for _, c := range cases {
		n, err := smartQuery(c.filter)
		if err != nil {
			t.Errorf("%s: %v", c.filter, err)
			continue
		}
		q := NewQuery()
		where, err := smartFilterSQL(q, hostFields, n)
		if err != nil {
			t.Errorf("%s: %v", c.filter, err)
			continue
		}
		if where != c.where || fmt.Sprint(q.Args) != fmt.Sprint(c.args) {
			t.Errorf("%s: got %s %v, want %s %v", c.filter, where, q.Args, c.where, c.args)
		}
	}
	// inventory__search reaches the inventory through the host's relation.
	n, _ := smartQuery(`inventory__search=prod`)
	q := NewQuery()
	if _, err := smartFilterSQL(q, hostFields, n); err != nil || !strings.Contains(q.JoinSQL(), "main_inventory hi ON hi.id = h.inventory_id") {
		t.Errorf("inventory__search joins: %q (%v)", q.JoinSQL(), err)
	}
}
