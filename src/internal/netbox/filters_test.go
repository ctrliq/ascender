package netbox

import (
	"strings"
	"testing"
)

// The behaviour being guarded is NetBox's: it answers HTTP 200 and returns
// every object when a query parameter is not one of its filters. A source
// whose filters are misspelled therefore syncs the whole estate and
// reports success, so these tests are mostly about making sure the sync
// stops instead.

var (
	deviceParams = []string{"name", "site", "status", "rack_id", "cluster_id", "cluster_group", "tag"}
	vmParams     = []string{"name", "site", "status", "cluster", "cluster_id"}
)

func schemaWith(paths map[string][]string) map[string]any {
	out := map[string]any{}
	for path, names := range paths {
		params := make([]any, 0, len(names))
		for _, n := range names {
			params = append(params, map[string]any{"name": n})
		}
		out[path] = map[string]any{"get": map[string]any{"parameters": params}}
	}
	return map[string]any{"paths": out}
}

func schemaAPI() *fakeAPI {
	f := newFakeAPI()
	f.schema = schemaWith(map[string][]string{DevicePath: deviceParams, VMPath: vmParams})
	return f
}

func filters(kv ...string) map[string]any {
	out := map[string]any{}
	for i := 0; i+1 < len(kv); i += 2 {
		out[kv[i]] = kv[i+1]
	}
	return out
}

func TestARealFilterPasses(t *testing.T) {
	resetCaches()
	if err := ValidateFilters(ctx, schemaAPI(), DevicePath, filters("site", "sydney-hq", "status", "active"), "device"); err != nil {
		t.Fatal(err)
	}
}

func TestNoFiltersMeansNoSchemaFetch(t *testing.T) {
	resetCaches()
	f := schemaAPI()
	if err := ValidateFilters(ctx, f, DevicePath, nil, "device"); err != nil {
		t.Fatal(err)
	}
	if f.calls != 0 {
		t.Fatalf("%d calls", f.calls)
	}
}

func TestAnUnknownFilterStopsTheSync(t *testing.T) {
	resetCaches()
	err := ValidateFilters(ctx, schemaAPI(), DevicePath, filters("totally_made_up", "yes"), "device")
	if err == nil || !strings.Contains(err.Error(), "totally_made_up") {
		t.Fatalf("%v", err)
	}
}

// `rack` is the natural guess and `rack_id` is the real one.
func TestANearMissIsSuggested(t *testing.T) {
	resetCaches()
	err := ValidateFilters(ctx, schemaAPI(), DevicePath, filters("rack", "SYD-R02"), "device")
	if err == nil || !strings.Contains(err.Error(), "did you mean 'rack_id'") {
		t.Fatalf("%v", err)
	}
}

// `cluster` is a virtual machine filter and not a device one, which is why
// a single shared filter set cannot be correct for both.
func TestTheTwoEndpointsHaveDifferentFilters(t *testing.T) {
	resetCaches()
	if err := ValidateFilters(ctx, schemaAPI(), VMPath, filters("cluster", "syd-vmw-prod"), "virtual machine"); err != nil {
		t.Fatal(err)
	}
	if err := ValidateFilters(ctx, schemaAPI(), DevicePath, filters("cluster", "syd-vmw-prod"), "device"); err == nil {
		t.Fatal("cluster accepted on devices")
	}
}

// They are generated per deployment and never appear in the schema.
func TestCustomFieldFiltersAreTakenOnTrust(t *testing.T) {
	resetCaches()
	if err := ValidateFilters(ctx, schemaAPI(), DevicePath, filters("cf_backup_tier", "gold"), "device"); err != nil {
		t.Fatal(err)
	}
}

func TestTheSchemaIsFetchedOncePerVersion(t *testing.T) {
	resetCaches()
	f := schemaAPI()
	for i := 0; i < 2; i++ {
		if _, err := allowedFilterNames(ctx, f, DevicePath); err != nil {
			t.Fatal(err)
		}
	}
	if f.calls != 1 {
		t.Fatalf("%d calls", f.calls)
	}
	// Another version is another key.
	f.version = "4.8.0"
	if _, err := allowedFilterNames(ctx, f, DevicePath); err != nil {
		t.Fatal(err)
	}
	if f.calls != 2 {
		t.Fatalf("%d calls", f.calls)
	}
}

func TestASubPathDeploymentStillMatches(t *testing.T) {
	resetCaches()
	f := newFakeAPI()
	f.schema = schemaWith(map[string][]string{"/netbox" + DevicePath: {"site"}})
	if err := ValidateFilters(ctx, f, DevicePath, filters("site", "sydney-hq"), "device"); err != nil {
		t.Fatal(err)
	}
}

func TestAnUnreadableSchemaStopsTheSyncRatherThanGuessing(t *testing.T) {
	resetCaches()
	f := newFakeAPI()
	f.getErr = errorf("boom")
	err := ValidateFilters(ctx, f, DevicePath, filters("site", "sydney-hq"), "device")
	if err == nil || !strings.Contains(err.Error(), "widening") || !strings.Contains(err.Error(), "boom") {
		t.Fatalf("%v", err)
	}
}

func TestAnEmptySchemaStopsTheSyncToo(t *testing.T) {
	resetCaches()
	f := newFakeAPI()
	f.schema = map[string]any{"paths": map[string]any{}}
	if err := ValidateFilters(ctx, f, DevicePath, filters("site", "x"), "device"); err == nil {
		t.Fatal("no error")
	}
}

func TestCloseMatchesBehaveLikeDifflib(t *testing.T) {
	got := closeMatches("rack", []string{"rack_id", "rack_group", "name", "tag", "track"}, 3, 0.6)
	if len(got) == 0 || got[0] != "track" && got[0] != "rack_id" {
		t.Fatalf("%v", got)
	}
	if r := similarity("rack", "rack_id"); r < 0.7 || r > 0.73 {
		t.Fatalf("ratio %v", r)
	}
	if r := similarity("abc", "abc"); r != 1 {
		t.Fatalf("ratio %v", r)
	}
	if r := similarity("abc", "xyz"); r != 0 {
		t.Fatalf("ratio %v", r)
	}
	if got := closeMatches("zzzz", []string{"rack_id"}, 3, 0.6); len(got) != 0 {
		t.Fatalf("%v", got)
	}
}
