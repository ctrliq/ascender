package api

import (
	"fmt"
	"net/http"
	"strings"
	"testing"
)

// The bulk serializers' field errors, as the old serializers gave them
// (DRF 3.18 with NON_FIELD_ERRORS_KEY = "__all__"): null where a field
// may not be null, the 100,000-element cap on every list, a list
// serializer's own errors under "__all__", and the errors of a list's
// items by index.
func TestBulkFieldErrors(t *testing.T) {
	d, _ := newScratchServer(t, "zz-bulk-fields-test")
	launch := func(body string, want string) {
		t.Helper()
		v, err := decodeOrdered(body)
		if err != nil {
			t.Fatal(err)
		}
		st, got := d.do("POST", "/api/v2/bulk/job_launch/", v)
		d.expect(st, got, http.StatusBadRequest, want)
	}
	const job = `"jobs": [{"unified_job_template": 1}]`
	for _, k := range []string{"name", "description", "extra_vars", "inventory", "limit", "scm_branch", "skip_tags", "job_tags"} {
		launch(`{"`+k+`": null, `+job+`}`, `{"`+k+`":["This field may not be null."]}`)
	}
	launch(`{"jobs": null}`, `{"jobs":["This field may not be null."]}`)
	launch(`{}`, `{"jobs":["This field is required."]}`)
	launch(`{"jobs": "x"}`, `{"jobs":{"__all__":["Expected a list of items but got type \"str\"."]}}`)
	launch(`{"jobs": []}`, `{"jobs":{"__all__":["This list may not be empty."]}}`)
	launch(`{"jobs": [1]}`, `{"jobs":{"0":{"__all__":["Invalid data. Expected a dictionary, but got int."]}}}`)
	for _, k := range []string{"extra_data", "inventory", "execution_environment", "unified_job_template", "credentials", "labels", "instance_groups"} {
		node := `{"unified_job_template": 1, "` + k + `": null}`
		if k == "unified_job_template" {
			node = `{"unified_job_template": null}`
		}
		launch(`{"name": null, "jobs": [`+node+`]}`, `{"name":["This field may not be null."],"jobs":{"0":{"`+k+`":["This field may not be null."]}}}`)
	}
	// These node fields may be null.
	for _, k := range []string{"identifier", "scm_branch", "job_type", "forks", "verbosity", "diff_mode", "all_parents_must_converge", "limit"} {
		launch(`{"name": null, "jobs": [{"unified_job_template": 1, "`+k+`": null}]}`, `{"name":["This field may not be null."]}`)
	}
	// Only the nodes with errors, by index.
	launch(`{"jobs": [{"unified_job_template": 1}, {"unified_job_template": "x"}]}`, `{"jobs":{"1":{"unified_job_template":["A valid integer is required."]}}}`)
	launch(`{"jobs": [{"unified_job_template": 1, "credentials": [null, 1.5, true, "3", 0]}]}`,
		`{"jobs":{"0":{"credentials":{"0":["This field may not be null."],"1":["A valid integer is required."],"2":["A valid integer is required."],"4":["Ensure this value is greater than or equal to 1."]}}}}`)
	launch(`{"jobs": [{"unified_job_template": 1, "credentials": "x"}]}`, `{"jobs":{"0":{"credentials":["Expected a list of items but got type \"str\"."]}}}`)
	// The node's errors in its serializer's field order.
	launch(`{"jobs": [{"unified_job_template": 0, "forks": -1, "inventory": "x", "extra_data": null}]}`,
		`{"jobs":{"0":{"extra_data":["This field may not be null."],"inventory":["A valid integer is required."],"forks":["Ensure this value is greater than or equal to 0."],"unified_job_template":["Ensure this value is greater than or equal to 1."]}}}`)
	launch(`{`+job+`, "name": "  ", "description": " ", "limit": true, "scm_branch": "`+strings.Repeat("x", 1025)+`", "skip_tags": 5, "job_tags": ["a"], "inventory": "abc", "organization": "abc"}`,
		`{"description":["This field may not be blank."],"organization":["Incorrect type. Expected pk value, received str."],"inventory":["Incorrect type. Expected pk value, received str."],"limit":["Not a valid string."],"scm_branch":["Ensure this field has no more than 1024 characters."],"job_tags":["Not a valid string."]}`)
	// The list cap, before the items are looked at.
	jobs := strings.TrimSuffix(strings.Repeat(`{"unified_job_template": null},`, bulkListMax+1), ",")
	launch(`{"jobs": [`+jobs+`]}`, `{"jobs":{"__all__":["Ensure this field has no more than 100000 elements."]}}`)
	// A template that does not exist: the old view failed with a 500.
	launch(`{"jobs": [{"unified_job_template": 999999}]}`, `{"__all__":["Unified Job Templates {999999} not found or you don't have permissions to access it"]}`)

	del := func(body, want string) {
		t.Helper()
		v, err := decodeOrdered(body)
		if err != nil {
			t.Fatal(err)
		}
		st, got := d.do("POST", "/api/v2/bulk/host_delete/", v)
		d.expect(st, got, http.StatusBadRequest, want)
	}
	del(`{"hosts": null}`, `{"hosts":["This field may not be null."]}`)
	del(`{"hosts": [`+strings.TrimSuffix(strings.Repeat("1,", bulkListMax+1), ",")+`]}`, `{"hosts":["Ensure this field has no more than 100000 elements."]}`)
	// An id that is not a number: the old filter failed with a 500.
	del(`{"hosts": ["abc"]}`, `{"hosts":["Field 'id' expected a number but got 'abc'."]}`)
	del(`{"hosts": [{"a": 1}]}`, `{"hosts":["Field 'id' expected a number but got {'a': 1}."]}`)

	create := func(body, want string) {
		t.Helper()
		v, err := decodeOrdered(body)
		if err != nil {
			t.Fatal(err)
		}
		st, got := d.do("POST", "/api/v2/bulk/host_create/", v)
		d.expect(st, got, http.StatusBadRequest, want)
	}
	create(`{"inventory": null, "hosts": null}`, `{"inventory":["This field may not be null."],"hosts":["This field may not be null."]}`)
	create(`{"inventory": null, "hosts": [{"name": "a"}, 1]}`, `{"inventory":["This field may not be null."],"hosts":{"1":{"__all__":["Invalid data. Expected a dictionary, but got int."]}}}`)
	var hosts []string
	for i := 0; i <= bulkListMax; i++ {
		hosts = append(hosts, fmt.Sprintf(`{"name": "h%d"}`, i))
	}
	create(`{"inventory": null, "hosts": [`+strings.Join(hosts, ",")+`]}`, `{"inventory":["This field may not be null."],"hosts":["Ensure this field has no more than 100000 elements."]}`)
	inv, _ := scratchInventory(t, d, "zz-bulk-fields", map[string]any{"kind": "smart", "host_filter": "name=x"})
	create(fmt.Sprintf(`{"inventory": %d, "hosts": [{"name": "a"}]}`, inv), `{"__all__":["Hosts can only be created in manual inventories (not smart or constructed types)."]}`)
}
