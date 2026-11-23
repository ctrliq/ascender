package api

import (
	"encoding/json"
	"net/http/httptest"
	"testing"

	"github.com/ctrliq/ascender/internal/settings"
)

// The registered default is the placeholder the "not set" checks compare
// against, never an address from the machine the registry was captured on.
func TestURLBaseRegistryDefault(t *testing.T) {
	reg, err := settings.LoadRegistry()
	if err != nil {
		t.Fatal(err)
	}
	f, ok := reg.Field("ASCENDER_URL_BASE")
	if !ok {
		t.Fatal("ASCENDER_URL_BASE is not registered")
	}
	if got := f.DefaultValue(); got != urlBasePlaceholder {
		t.Fatalf("default = %v, want %q", got, urlBasePlaceholder)
	}
}

// Every captured document shows the placeholder, and OPTIONS shows it as
// the address the request was made to.
func TestFillURLBaseDefault(t *testing.T) {
	for _, name := range []string{"settings/all", "settings/system", "settings_logging_test"} {
		b, err := metadataFS.ReadFile("metadata/" + name + ".json")
		if err != nil {
			t.Fatal(err)
		}
		var doc OMap
		if err := json.Unmarshal(b, &doc); err != nil {
			t.Fatal(err)
		}
		r := httptest.NewRequest("OPTIONS", "/api/v2/"+name+"/", nil)
		r.Host = "ascender.example.com"
		r.Header.Set("X-Forwarded-Proto", "https")
		if got := urlBaseDefault(t, &doc); got != urlBasePlaceholder {
			t.Fatalf("%s: captured default = %q, want %q", name, got, urlBasePlaceholder)
		}
		fillURLBaseDefault(&doc, r)
		if got := urlBaseDefault(t, &doc); got != "https://ascender.example.com" {
			t.Fatalf("%s: filled default = %q", name, got)
		}
	}
}

func urlBaseDefault(t *testing.T, doc *OMap) string {
	t.Helper()
	actions, _ := doc.Get("actions")
	am, _ := actions.(*OMap)
	if am == nil {
		t.Fatal("no actions")
	}
	for _, method := range am.Keys() {
		v, _ := am.Get(method)
		fields, _ := v.(*OMap)
		if fields == nil {
			continue
		}
		if f, ok := fields.Get("ASCENDER_URL_BASE"); ok {
			if fm, ok := f.(*OMap); ok {
				d, _ := fm.Get("default")
				s, _ := d.(string)
				return s
			}
		}
	}
	t.Fatal("ASCENDER_URL_BASE not in document")
	return ""
}
