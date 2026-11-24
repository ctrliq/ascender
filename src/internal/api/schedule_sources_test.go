package api

import "testing"

// Every cloud provider's source can be scheduled, as CLOUD_INVENTORY_SOURCES
// was CLOUD_PROVIDERS and scm; the ascender source once could not, the list
// having been written out by hand without it.
func TestScheduledInventorySources(t *testing.T) {
	for source := range cloudProviders {
		if !cloudInventorySources[source] {
			t.Errorf("a %s source cannot be scheduled", source)
		}
	}
	for _, source := range []string{"ascender", "netbox", "scm", "constructed"} {
		if !cloudInventorySources[source] {
			t.Errorf("a %s source cannot be scheduled", source)
		}
	}
	if cloudInventorySources["file"] {
		t.Error("a file source can be scheduled")
	}
}
