package netbox

import (
	"context"
	"fmt"
	"net/url"
	"sort"
	"strings"
	"sync"
	"time"
)

// Filter names are checked against the NetBox API schema before use.
//
// NetBox silently ignores a query parameter it does not recognise. A
// request for ?rack=SYD-R02 on an endpoint whose filter is actually rack_id
// returns HTTP 200 and every device in the estate, so a typo in a source's
// filters widens its scope instead of narrowing it and the job still goes
// green. That is the failure mode worth spending a request to avoid: an
// inventory source that quietly syncs more than it was told to is worse
// than one that stops and says why.
//
// The OpenAPI schema is the only place NetBox publishes the real filter
// names. It is large, around 15 MB on NetBox 4.7, so the extracted names
// are cached against the NetBox version they came from, and the fetch only
// happens for a source that actually sets filters.

const (
	// SchemaPath is the OpenAPI schema; NetBox serves it as YAML by
	// default, so JSON is asked for.
	SchemaPath = "/api/schema/"
	// DevicePath and VMPath are the two host endpoints.
	DevicePath = "/api/dcim/devices/"
	VMPath     = "/api/virtualization/virtual-machines/"

	// customFieldPrefix: custom field filters are generated per deployment
	// and are not in the schema, so anything in that namespace is taken on
	// trust.
	customFieldPrefix = "cf_"
	// cacheTTL: filter names and object types change only with the NetBox
	// version, which is part of the key.
	cacheTTL = 24 * time.Hour
)

// namesCache caches a sorted name list per key for cacheTTL. One instance
// holds the filter names, another the object types.
type namesCache struct {
	mu      sync.Mutex
	entries map[string]namesEntry
}

type namesEntry struct {
	names   []string
	expires time.Time
}

func (c *namesCache) get(key string) ([]string, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	e, ok := c.entries[key]
	if !ok || time.Now().After(e.expires) {
		return nil, false
	}
	return e.names, true
}

func (c *namesCache) set(key string, names []string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.entries == nil {
		c.entries = map[string]namesEntry{}
	}
	c.entries[key] = namesEntry{names: names, expires: time.Now().Add(cacheTTL)}
}

func (c *namesCache) reset() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.entries = nil
}

var filterNames = &namesCache{}

// cacheKey names a NetBox and its version, with what is cached.
func cacheKey(ctx context.Context, api API, what, path string) (string, error) {
	v, err := api.Version(ctx)
	if err != nil {
		return "", err
	}
	if v == "" {
		v = "unknown"
	}
	return what + ":" + api.BaseURL() + ":" + v + ":" + path, nil
}

// namesFromSchema pulls the GET query parameter names for one endpoint out
// of the schema. Paths are matched by suffix because a NetBox served under
// a sub-path prefixes every key in the document with it.
func namesFromSchema(schema map[string]any, path string) map[string]bool {
	paths, _ := schema["paths"].(map[string]any)
	for key, spec := range paths {
		if key != path && !strings.HasSuffix(key, path) {
			continue
		}
		names := map[string]bool{}
		if s, ok := spec.(map[string]any); ok {
			if get, ok := s["get"].(map[string]any); ok {
				if params, ok := get["parameters"].([]any); ok {
					for _, p := range params {
						if m, ok := p.(map[string]any); ok && truthy(m["name"]) {
							names[str(m["name"])] = true
						}
					}
				}
			}
		}
		return names
	}
	return map[string]bool{}
}

// allowedFilterNames is every filter name NetBox accepts on this endpoint.
func allowedFilterNames(ctx context.Context, api API, path string) (map[string]bool, error) {
	key, err := cacheKey(ctx, api, "filters", path)
	if err != nil {
		return nil, err
	}
	if cached, ok := filterNames.get(key); ok {
		return toSet(cached), nil
	}
	schema, err := api.Get(ctx, SchemaPath, url.Values{"format": {"json"}})
	if err != nil {
		return nil, err
	}
	names := namesFromSchema(schema, path)
	if len(names) > 0 {
		filterNames.set(key, sortedSet(names))
	}
	return names, nil
}

func toSet(list []string) map[string]bool {
	set := make(map[string]bool, len(list))
	for _, s := range list {
		set[s] = true
	}
	return set
}

func sortedSet(set map[string]bool) []string {
	out := make([]string, 0, len(set))
	for s := range set {
		out = append(out, s)
	}
	sort.Strings(out)
	return out
}

// ValidateFilters fails unless every filter name is one NetBox will
// actually apply on path. label names the object type ("device", "virtual
// machine") for the message, so an operator reading a failed job knows
// which half of the source to fix.
func ValidateFilters(ctx context.Context, api API, path string, filters map[string]any, label string) error {
	if len(filters) == 0 {
		return nil
	}
	allowed, err := allowedFilterNames(ctx, api, path)
	if err != nil {
		return errorf("Could not read the NetBox API schema to check the %s filters: %v NetBox ignores a filter name it does not recognise and returns every object, so this sync stops rather than silently widening its own scope. Remove the filters if you meant to sync everything.", label, err)
	}
	if len(allowed) == 0 {
		return errorf("The NetBox API schema lists no filters for %s, so the %s filters cannot be checked. NetBox ignores an unrecognised filter name and returns every object, so this sync stops rather than risk syncing more than it was asked to.", path, label)
	}
	var problems []string
	for _, name := range sortedKeys(filters) {
		if allowed[name] || strings.HasPrefix(name, customFieldPrefix) {
			continue
		}
		problem := fmt.Sprintf("'%s'", name)
		if close := closeMatches(name, sortedSet(allowed), 3, 0.6); len(close) > 0 {
			quoted := make([]string, len(close))
			for i, c := range close {
				quoted[i] = "'" + c + "'"
			}
			problem += fmt.Sprintf(" (did you mean %s?)", strings.Join(quoted, " or "))
		}
		problems = append(problems, problem)
	}
	if len(problems) > 0 {
		return errorf("NetBox has no %s filter named %s. It would ignore it and return every object, so this sync stopped instead. Device and virtual machine filters are not the same set: put one that applies to only one of them in device_filters or vm_filters rather than in filters.", label, strings.Join(problems, "; "))
	}
	return nil
}

// closeMatches is difflib.get_close_matches: the n best candidates whose
// similarity to word reaches cutoff, best first.
func closeMatches(word string, candidates []string, n int, cutoff float64) []string {
	type scored struct {
		score float64
		s     string
	}
	var hits []scored
	for _, c := range candidates {
		if r := similarity(c, word); r >= cutoff {
			hits = append(hits, scored{r, c})
		}
	}
	// heapq.nlargest orders by (score, string), both descending.
	sort.Slice(hits, func(i, j int) bool {
		if hits[i].score != hits[j].score {
			return hits[i].score > hits[j].score
		}
		return hits[i].s > hits[j].s
	})
	if len(hits) > n {
		hits = hits[:n]
	}
	out := make([]string, len(hits))
	for i, h := range hits {
		out[i] = h.s
	}
	return out
}

// similarity is SequenceMatcher.ratio(): twice the characters in matching
// blocks over the total length, the blocks found by taking the longest
// common substring and recursing on either side of it (Ratcliff and
// Obershelp).
func similarity(a, b string) float64 {
	ra, rb := []rune(a), []rune(b)
	if len(ra)+len(rb) == 0 {
		return 1
	}
	return 2 * float64(matchingBlocks(ra, rb)) / float64(len(ra)+len(rb))
}

func matchingBlocks(a, b []rune) int {
	if len(a) == 0 || len(b) == 0 {
		return 0
	}
	ai, bj, size := longestMatch(a, b)
	if size == 0 {
		return 0
	}
	return size + matchingBlocks(a[:ai], b[:bj]) + matchingBlocks(a[ai+size:], b[bj+size:])
}

// longestMatch is the longest common substring: its start in a, in b, and
// its length. Ties go to the earliest in a, then in b, as find_longest_match
// does.
func longestMatch(a, b []rune) (int, int, int) {
	bestI, bestJ, best := 0, 0, 0
	prev := make([]int, len(b)+1)
	cur := make([]int, len(b)+1)
	for i := 1; i <= len(a); i++ {
		for j := 1; j <= len(b); j++ {
			if a[i-1] == b[j-1] {
				cur[j] = prev[j-1] + 1
				if cur[j] > best {
					best = cur[j]
					bestI, bestJ = i-best, j-best
				}
			} else {
				cur[j] = 0
			}
		}
		prev, cur = cur, prev
		for j := range cur {
			cur[j] = 0
		}
	}
	return bestI, bestJ, best
}
