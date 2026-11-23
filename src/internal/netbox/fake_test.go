package netbox

import (
	"context"
	"encoding/json"
	"errors"
	"net/url"
	"reflect"
	"sort"
	"strconv"
	"strings"
	"testing"
)

// fakeAPI serves a schema, a changelog and an object type list the way
// NetBox serves them, for the filter and changelog tests.
type fakeAPI struct {
	base, version string
	schema        map[string]any
	getErr        error
	calls         int
	requests      []fakeRequest
	// changes are {"id": n, "changed_object_type": s} rows.
	changes []map[string]any
	// objectTypes nil serves every watched type.
	objectTypes []string
}

type fakeRequest struct {
	path   string
	params url.Values
}

func newFakeAPI() *fakeAPI {
	return &fakeAPI{base: "https://netbox.example/", version: "4.7.5"}
}

func (f *fakeAPI) BaseURL() string                         { return f.base }
func (f *fakeAPI) Version(context.Context) (string, error) { return f.version, nil }

func (f *fakeAPI) Get(_ context.Context, path string, params url.Values) (map[string]any, error) {
	f.calls++
	f.requests = append(f.requests, fakeRequest{path, params})
	if f.getErr != nil {
		return nil, f.getErr
	}
	switch path {
	case SchemaPath:
		return f.schema, nil
	case ChangelogPath:
		rows := f.changes
		if gt := params.Get("id__gt"); gt != "" {
			n, _ := strconv.Atoi(gt)
			var kept []map[string]any
			for _, r := range rows {
				if r["id"].(int) > n {
					kept = append(kept, r)
				}
			}
			rows = kept
		}
		if wanted := params["changed_object_type"]; len(wanted) > 0 {
			var kept []map[string]any
			for _, r := range rows {
				for _, w := range wanted {
					if r["changed_object_type"] == w {
						kept = append(kept, r)
						break
					}
				}
			}
			rows = kept
		}
		rows = append([]map[string]any(nil), rows...)
		desc := params.Get("ordering") == "-id"
		sort.Slice(rows, func(i, j int) bool {
			if desc {
				return rows[i]["id"].(int) > rows[j]["id"].(int)
			}
			return rows[i]["id"].(int) < rows[j]["id"].(int)
		})
		limit := 50
		if l := params.Get("limit"); l != "" {
			limit, _ = strconv.Atoi(l)
		}
		results := make([]any, 0, len(rows))
		for i, r := range rows {
			if i >= limit {
				break
			}
			results = append(results, r)
		}
		return map[string]any{"count": len(rows), "results": results}, nil
	}
	return nil, errorf("unexpected GET %s", path)
}

func (f *fakeAPI) Paginate(_ context.Context, path string, _ url.Values) ([]map[string]any, error) {
	if path != ObjectTypesPath {
		return nil, errorf("unexpected list %s", path)
	}
	names := f.objectTypes
	if names == nil {
		names = WatchedObjectTypes
	}
	var out []map[string]any
	for _, n := range names {
		parts := strings.SplitN(n, ".", 2)
		out = append(out, map[string]any{"app_label": parts[0], "model": parts[1]})
	}
	return out, nil
}

func change(id int, objectType string) map[string]any {
	return map[string]any{"id": id, "changed_object_type": objectType}
}

func (c *namesCache) reset() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.entries = nil
}

// resetCaches clears the per-process caches between tests.
func resetCaches() {
	filterNames.reset()
	objectTypes.reset()
}

// isAuthError reports whether err is NetBox rejecting the credentials.
func isAuthError(err error) bool {
	var ae *AuthError
	return errors.As(err, &ae)
}

// jsonEq compares two values by their JSON, so a []any from a payload and
// a []string from a test read as equal.
func jsonEq(t *testing.T, got, want any) {
	t.Helper()
	g, err := json.Marshal(got)
	if err != nil {
		t.Fatalf("marshal got: %v", err)
	}
	w, err := json.Marshal(want)
	if err != nil {
		t.Fatalf("marshal want: %v", err)
	}
	if string(g) != string(w) {
		t.Fatalf("got %s, want %s", g, w)
	}
}

func mustGet(t *testing.T, o *Object, key string) any {
	t.Helper()
	v, ok := o.Get(key)
	if !ok {
		t.Fatalf("%s missing from %v", key, o.Keys())
	}
	return v
}

func hasLink(links []groupLink, name, parent string) bool {
	for _, l := range links {
		if l.name == name && l.parent == parent {
			return true
		}
	}
	return false
}

func equalStrings(t *testing.T, got, want []string) {
	t.Helper()
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
}
