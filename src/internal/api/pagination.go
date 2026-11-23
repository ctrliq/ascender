package api

import (
	"net/http"
	"net/url"
	"strconv"
)

// MaxPageSize mirrors settings.MAX_PAGE_SIZE.
const MaxPageSize = 200

// DefaultPageSize mirrors REST_FRAMEWORK PAGE_SIZE.
const DefaultPageSize = 25

// Page describes the slice a list request asked for.
type Page struct {
	Number        int
	Size          int
	CountDisabled bool
}

// ParsePage reads page, page_size and count_disabled.
func ParsePage(r *http.Request) (Page, error) {
	q := r.URL.Query()
	p := Page{Number: 1, Size: DefaultPageSize}
	if v := q.Get("page"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 {
			return p, Detail(http.StatusNotFound, "Invalid page.")
		}
		p.Number = n
	}
	if v := q.Get("page_size"); v != "" {
		n, err := strconv.Atoi(v)
		if err == nil && n > 0 {
			if n > MaxPageSize {
				n = MaxPageSize
			}
			p.Size = n
		}
	}
	_, p.CountDisabled = q["count_disabled"]
	return p, nil
}

// Offset is the SQL offset for the page.
func (p Page) Offset() int { return (p.Number - 1) * p.Size }

// ListResponse is the {count, next, previous, results} envelope.
type ListResponse struct {
	Count    int     `json:"count"`
	Next     *string `json:"next"`
	Previous *string `json:"previous"`
	Results  []any   `json:"results"`
}

func pageLink(r *http.Request, p Page, n int) *string {
	u := *r.URL
	q := u.Query()
	q.Set("page", strconv.Itoa(n))
	if q.Get("page_size") != "" {
		if ps, err := strconv.Atoi(q.Get("page_size")); err == nil && ps > MaxPageSize {
			q.Set("page_size", strconv.Itoa(MaxPageSize))
		}
	}
	u.RawQuery = encodeQuery(q)
	s := u.Path + "?" + u.RawQuery
	return &s
}

// encodeQuery keeps parameters in a stable order; DRF preserved the
// request order but Go's url.Values sorts keys, which is acceptable.
func encodeQuery(q url.Values) string { return q.Encode() }

// Paginate builds the envelope for results already sliced to the page.
func Paginate(r *http.Request, p Page, count int, results []any) any {
	if results == nil {
		results = []any{}
	}
	if p.CountDisabled {
		return map[string]any{"results": results}
	}
	resp := ListResponse{Count: count, Results: results}
	if p.Offset()+len(results) < count {
		resp.Next = pageLink(r, p, p.Number+1)
	}
	if p.Number > 1 {
		resp.Previous = pageLink(r, p, p.Number-1)
	}
	return resp
}

// InvalidPage is what DRF returned past the last page.
func InvalidPage() *APIError { return Detail(http.StatusNotFound, "Invalid page.") }
