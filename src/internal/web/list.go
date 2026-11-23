package web

// Helpers shared by the list screens.

import (
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"github.com/ctrliq/ascender/internal/api"
)

// searchLabels labels each search column's key for its filter chips with
// the column's name, plus the extra keys given as key, label pairs: the
// chips of filters set elsewhere (a dashboard link, a tab's own filter).
func searchLabels(columns []map[string]string, extra ...string) map[string]string {
	out := make(map[string]string, len(columns)+len(extra)/2)
	for _, c := range columns {
		out[c["key"]] = c["name"]
	}
	for i := 0; i+1 < len(extra); i += 2 {
		out[extra[i]] = extra[i+1]
	}
	return out
}

// listPage runs a list request against the API and fills the page with the
// results and the toolbar state the list templates share.
func (u *UI) listPage(r *http.Request, p *page, ns, apiPath string, defaults url.Values, labels map[string]string) error {
	params := listParams(r.URL.Query(), ns, defaults)
	if params.Get("page_size") == "" {
		params.Set("page_size", "20")
	}
	res, err := u.apiCall(r, "GET", apiPath+"?"+params.Encode(), nil)
	if err != nil {
		return err
	}
	if res.Status != 200 {
		return fmt.Errorf("api %d: %s", res.Status, res.Raw)
	}
	pageNum, _ := strconv.Atoi(params.Get("page"))
	if pageNum < 1 {
		pageNum = 1
	}
	size, _ := strconv.Atoi(params.Get("page_size"))
	p.Data["results"] = res.Data["results"]
	p.Data["raw"] = res.Raw
	p.Data["count"] = num(res.Data["count"])
	p.Data["pagination"] = paginate(num(res.Data["count"]), pageNum, size)
	p.Data["order_by"] = params.Get("order_by")
	p.Data["filters"] = activeFilters(r.URL.Query(), ns, labels)
	p.Data["ns"] = ns
	// The toolbar's Advanced search reads the searchable keys from the
	// list's OPTIONS.
	p.Data["listAPI"] = apiPath
	return nil
}

// listResults returns the results of a list response, or nil.
func (u *UI) listResults(r *http.Request, path string) []any {
	res, err := u.apiCall(r, "GET", path, nil)
	if err != nil || res.Status != 200 {
		return nil
	}
	out, _ := res.Data["results"].([]any)
	return out
}

// listAll returns every result of a list, following its pages, and
// whether all of them were read.
func (u *UI) listAll(r *http.Request, path string) ([]any, int, bool) {
	sep := "?"
	if strings.Contains(path, "?") {
		sep = "&"
	}
	next := path + sep + "page_size=200"
	var out []any
	for pages := 0; next != "" && pages < 1000; pages++ {
		res, err := u.apiCall(r, "GET", next, nil)
		if err != nil {
			return nil, http.StatusInternalServerError, false
		}
		if res.Status != http.StatusOK {
			return nil, res.Status, false
		}
		page, _ := res.Data["results"].([]any)
		out = append(out, page...)
		next = str(res.Data["next"])
	}
	if out == nil {
		out = []any{}
	}
	return out, http.StatusOK, true
}

// listParams converts the page's query string into the API query string.
// The old UI namespaced its parameters ("project.name__icontains"); both
// the namespaced and plain forms are accepted.
func listParams(q url.Values, ns string, defaults url.Values) url.Values {
	out := url.Values{}
	for k, v := range defaults {
		out[k] = v
	}
	for k, vals := range q {
		key := k
		if i := strings.Index(k, "."); i > 0 {
			if k[:i] != ns {
				continue
			}
			key = k[i+1:]
		} else if uiParams[k] {
			continue
		}
		out[key] = vals
	}
	return out
}

// uiParams are the page's own parameters, never a list's filter:
// ?pseudolocalization=true marks the translated text (locale).
var uiParams = map[string]bool{"pseudolocalization": true}

// pagination describes the current page for the templates.
type pagination struct {
	// WidthChars sizes the page input to the page count's digits, as
	// Pagination did.
	WidthChars int
	Count      int
	Page       int
	PageSize   int
	Pages      int
	First      int
	Last       int
}

func paginate(count, pageNum, size int) pagination {
	if size <= 0 {
		size = 20
	}
	pages := (count + size - 1) / size
	if pages < 1 {
		pages = 1
	}
	first := (pageNum-1)*size + 1
	last := pageNum * size
	if last > count {
		last = count
	}
	if count == 0 {
		first = 0
	}
	width := len(strconv.Itoa(pages))
	if width < 2 {
		width = 2
	}
	return pagination{WidthChars: width, Count: count, Page: pageNum, PageSize: size, Pages: pages, First: first, Last: last}
}

// activeFilters renders the search chips: every non-paging parameter.
type filterChip struct {
	Key, Label, Value, RemoveQuery string
	// Display is the label of the value when its search key has options
	// (getLabelFromValue), an English message the template translates.
	Display string
}

var pagingKeys = map[string]bool{"page": true, "page_size": true, "order_by": true}

// maxFilterChips is the most filters a list shows as chips.
const maxFilterChips = 50

func activeFilters(q url.Values, ns string, labels map[string]string) []filterChip {
	var out []filterChip
	keys := make([]string, 0, len(q))
	for k := range q {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		vals := q[k]
		key := k
		if i := strings.Index(k, "."); i > 0 {
			// Another list's parameter: listParams drops it too.
			if k[:i] != ns {
				continue
			}
			key = k[i+1:]
		}
		if pagingKeys[key] || (key == k && uiParams[k]) {
			continue
		}
		for vi, v := range vals {
			// Each chip's remove link copies the query: past maxFilterChips
			// a long query string would cost the square of its length.
			if len(out) >= maxFilterChips {
				return out
			}
			// Removing a chip drops that value only, as onRemove did.
			c := url.Values{}
			for kk, vv := range q {
				if kk != k {
					c[kk] = vv
				}
			}
			rest := append(append([]string{}, vals[:vi]...), vals[vi+1:]...)
			if len(rest) > 0 {
				c[k] = rest
			}
			label := labels[key]
			if label == "" {
				label = api.Title(strings.ReplaceAll(strings.Split(key, "__")[0], "_", " "))
			}
			rq := ""
			if len(c) > 0 {
				rq = "?" + c.Encode()
			}
			out = append(out, filterChip{Key: key, Label: label, Value: v, RemoveQuery: rq})
		}
	}
	return out
}

// filterGroup is one ToolbarFilter's chips: getChipsByKey grouped them by
// query key and labelled the group "<column name> (<key>)", or with the
// bare key when no search column has it. Name is that column's name, an
// English message search_toolbar translates.
type filterGroup struct {
	Key, Label, Name string
	Chips            []filterChip
}

var chipDateSuffix = regexp.MustCompile(`__(gte?|lte?)$`)

// chipGroups orders the chip groups as Search rendered them: the search
// columns' keys first, in column order, then the other keys.
func chipGroups(filters any, searchKeys any) []filterGroup {
	chips, _ := filters.([]filterChip)
	if len(chips) == 0 {
		return nil
	}
	var columns []map[string]string
	switch t := searchKeys.(type) {
	case []map[string]string:
		columns = t
	}
	byKey := map[string]*filterGroup{}
	options := map[string]string{}
	var order []string
	for _, c := range chips {
		g, ok := byKey[c.Key]
		if !ok {
			g = &filterGroup{Key: c.Key, Label: c.Key}
			base := chipDateSuffix.ReplaceAllString(c.Key, "")
			for _, col := range columns {
				if col["key"] == c.Key || col["key"] == base {
					g.Label = col["name"] + " (" + c.Key + ")"
					g.Name = col["name"]
					if col["key"] == c.Key {
						options[c.Key] = col["options"]
					}
					break
				}
			}
			byKey[c.Key] = g
			order = append(order, c.Key)
		}
		if list := options[c.Key]; list != "" {
			c.Display = searchOptionLabel(list, c.Value)
		}
		g.Chips = append(g.Chips, c)
	}
	out := make([]filterGroup, 0, len(order))
	seen := map[string]bool{}
	for _, col := range columns {
		if g, ok := byKey[col["key"]]; ok && !seen[col["key"]] {
			out = append(out, *g)
			seen[col["key"]] = true
		}
	}
	for _, k := range order {
		if !seen[k] {
			out = append(out, *byKey[k])
			seen[k] = true
		}
	}
	return out
}
