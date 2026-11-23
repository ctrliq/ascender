package api

import (
	"context"
	"sync"
)

// A read memo remembers lookups that a read-only request repeats, such as
// which organizations the viewer administers, which every row of a list
// asks again. It lives for one GET or HEAD (a UI page and the API calls it
// makes in-process share it); a request that writes never sees one, so no
// answer can predate a change the request itself made.
type readMemo struct {
	mu sync.Mutex
	m  map[string]any
}

type readMemoKey struct{}

// WithReadMemo gives a read-only request a memo, keeping any it already
// has.
func WithReadMemo(ctx context.Context) context.Context {
	if m, _ := ctx.Value(readMemoKey{}).(*readMemo); m != nil {
		return ctx
	}
	return context.WithValue(ctx, readMemoKey{}, &readMemo{m: map[string]any{}})
}

// withoutReadMemo hides any memo from a request that may write, and
// empties it: a page that writes through the API in-process and then reads
// again must not be answered from before the write.
func withoutReadMemo(ctx context.Context) context.Context {
	m, _ := ctx.Value(readMemoKey{}).(*readMemo)
	if m == nil {
		return ctx
	}
	m.mu.Lock()
	m.m = map[string]any{}
	m.mu.Unlock()
	return context.WithValue(ctx, readMemoKey{}, (*readMemo)(nil))
}

// memoized returns the remembered value for key, loading it once. Without
// a memo it just loads. Loads run outside the lock; two concurrent loads of
// one key both run and the first stored wins.
func memoized[T any](ctx context.Context, key string, load func() T) T {
	m, _ := ctx.Value(readMemoKey{}).(*readMemo)
	if m == nil {
		return load()
	}
	m.mu.Lock()
	v, ok := m.m[key]
	m.mu.Unlock()
	if ok {
		return v.(T)
	}
	t := load()
	m.mu.Lock()
	if prev, ok := m.m[key]; ok {
		t = prev.(T)
	} else {
		m.m[key] = t
	}
	m.mu.Unlock()
	return t
}

// remember stores a value loaded in a batch for later memoized calls.
func remember(ctx context.Context, key string, v any) {
	if m, _ := ctx.Value(readMemoKey{}).(*readMemo); m != nil {
		m.mu.Lock()
		if _, ok := m.m[key]; !ok {
			m.m[key] = v
		}
		m.mu.Unlock()
	}
}

// hasReadMemo reports whether ctx belongs to a read-only request.
func hasReadMemo(ctx context.Context) bool {
	m, _ := ctx.Value(readMemoKey{}).(*readMemo)
	return m != nil
}

// eventHostBrief is the host block of an event's summary_fields.
type eventHostBrief struct{ name, description string }

// eventHost reads an event's host, once per read-only request; nil when
// the host is gone.
func (s *Server) eventHost(ctx context.Context, id int64) *eventHostBrief {
	return memoized(ctx, "eventHost/"+itoa(id), func() *eventHostBrief {
		var h eventHostBrief
		if err := s.Q().QueryRow(ctx, `SELECT name, description FROM main_host WHERE id = $1`, id).Scan(&h.name, &h.description); err != nil {
			return nil
		}
		return &h
	})
}

// preloadEventHosts reads the hosts of a page of events in one statement
// for eventHost.
func (s *Server) preloadEventHosts(ctx context.Context, ids []int64) {
	if !hasReadMemo(ctx) || len(ids) == 0 {
		return
	}
	rows, err := s.Q().Query(ctx, `SELECT id, name, description FROM main_host WHERE id = ANY($1)`, ids)
	if err != nil {
		return
	}
	defer rows.Close()
	found := map[int64]*eventHostBrief{}
	for rows.Next() {
		var id int64
		var h eventHostBrief
		if rows.Scan(&id, &h.name, &h.description) != nil {
			return
		}
		found[id] = &h
	}
	if rows.Err() != nil {
		return
	}
	for _, id := range ids {
		remember(ctx, "eventHost/"+itoa(id), found[id])
	}
}
