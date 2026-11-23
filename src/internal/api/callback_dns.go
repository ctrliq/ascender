package api

import (
	"context"
	"net"
	"sync"
	"time"
)

// The provisioning callback's DNS lookups. A request that doesn't name
// exactly one inventory host resolves every host in the inventory, so a
// machine that isn't in the inventory and keeps calling back would repeat
// that sweep on every request. Lookups go through a small process-wide
// cache: answers are kept for a minute, failures (no such host, and a
// server that timed out or refused) for 30 seconds, concurrent requests
// for the same name share one lookup, and at most dnsMaxInFlight lookups
// run at once across the whole server.
//
// The resolver doesn't report record TTLs, so these are fixed: short
// enough that a provisioned host whose record was just created or changed
// is seen within a retry or two, which matters more here than saving
// queries (the usual resolver in front of us caches by TTL anyway).

const (
	dnsPositiveTTL   = time.Minute
	dnsNegativeTTL   = 30 * time.Second
	dnsLookupTimeout = 15 * time.Second
	dnsMaxEntries    = 100000
	dnsMaxInFlight   = 64
	// callbackLookupWorkers is how many of one request's names resolve
	// at once.
	callbackLookupWorkers = 16
)

var callbackDNS = newDNSCache(net.DefaultResolver.LookupHost, net.DefaultResolver.LookupAddr)

type dnsLookupFunc func(ctx context.Context, name string) ([]string, error)

type dnsCache struct {
	lookupHost dnsLookupFunc
	lookupAddr dnsLookupFunc
	now        func() time.Time

	posTTL, negTTL, timeout time.Duration
	maxEntries              int
	sem                     chan struct{}

	mu        sync.Mutex
	entries   map[dnsKey]dnsEntry
	inflight  map[dnsKey]*dnsCall
	lastSweep time.Time
}

type dnsKey struct {
	ptr  bool // a reverse lookup of an address
	name string
}

type dnsEntry struct {
	vals    []string
	err     error
	expires time.Time
}

type dnsCall struct {
	done chan struct{}
	vals []string
	err  error
}

func newDNSCache(host, addr dnsLookupFunc) *dnsCache {
	return &dnsCache{
		lookupHost: host,
		lookupAddr: addr,
		now:        time.Now,
		posTTL:     dnsPositiveTTL,
		negTTL:     dnsNegativeTTL,
		timeout:    dnsLookupTimeout,
		maxEntries: dnsMaxEntries,
		sem:        make(chan struct{}, dnsMaxInFlight),
		entries:    map[dnsKey]dnsEntry{},
		inflight:   map[dnsKey]*dnsCall{},
	}
}

// Host is LookupHost: the addresses name resolves to. The slice is shared
// with the cache; callers must not modify it.
func (c *dnsCache) Host(ctx context.Context, name string) ([]string, error) {
	return c.get(ctx, dnsKey{name: name})
}

// Addr is LookupAddr: the names an address resolves back to. The slice is
// shared with the cache; callers must not modify it.
func (c *dnsCache) Addr(ctx context.Context, addr string) ([]string, error) {
	return c.get(ctx, dnsKey{ptr: true, name: addr})
}

// get answers from the cache, or joins (or starts) the lookup for k. The
// lookup itself runs detached from ctx, so one a request stops waiting
// for still finishes and is cached for the client's retry.
func (c *dnsCache) get(ctx context.Context, k dnsKey) ([]string, error) {
	c.mu.Lock()
	if e, ok := c.entries[k]; ok && c.now().Before(e.expires) {
		c.mu.Unlock()
		return e.vals, e.err
	}
	call, ok := c.inflight[k]
	if !ok {
		// Don't start a lookup nobody is waiting for.
		if err := ctx.Err(); err != nil {
			c.mu.Unlock()
			return nil, err
		}
		call = &dnsCall{done: make(chan struct{})}
		c.inflight[k] = call
		go c.resolve(k, call)
	}
	c.mu.Unlock()
	select {
	case <-call.done:
		return call.vals, call.err
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

func (c *dnsCache) resolve(k dnsKey, call *dnsCall) {
	c.sem <- struct{}{}
	ctx, cancel := context.WithTimeout(context.Background(), c.timeout)
	if k.ptr {
		call.vals, call.err = c.lookupAddr(ctx, k.name)
	} else {
		call.vals, call.err = c.lookupHost(ctx, k.name)
	}
	cancel()
	<-c.sem
	ttl := c.posTTL
	if call.err != nil {
		ttl = c.negTTL
	}
	c.mu.Lock()
	delete(c.inflight, k)
	c.store(k, dnsEntry{vals: call.vals, err: call.err, expires: c.now().Add(ttl)})
	c.mu.Unlock()
	close(call.done)
}

// store keeps e under k (c.mu held). Expired entries are dropped once per
// positive TTL, or when the cache is full (at most once a second); a full
// cache of live entries takes no more, so names from request headers
// can't grow it without bound.
func (c *dnsCache) store(k dnsKey, e dnsEntry) {
	now := c.now()
	full := len(c.entries) >= c.maxEntries
	if since := now.Sub(c.lastSweep); since >= c.posTTL || (full && since >= time.Second) {
		c.lastSweep = now
		for k2, e2 := range c.entries {
			if !now.Before(e2.expires) {
				delete(c.entries, k2)
			}
		}
	}
	if _, ok := c.entries[k]; !ok && len(c.entries) >= c.maxEntries {
		return
	}
	c.entries[k] = e
}

// matchByDNS is find_matching_hosts' forward-lookup pass: the names (in
// the order given) that resolve to an address in remote, other than the
// name itself. Names resolve callbackLookupWorkers at a time until ctx is
// done; a name that is itself an IP address only ever resolves to itself,
// so it is skipped.
func matchByDNS(ctx context.Context, c *dnsCache, names []string, remote map[string]bool) []string {
	var todo []string
	for _, name := range names {
		if name != "" && net.ParseIP(name) == nil {
			todo = append(todo, name)
		}
	}
	matched := make([]bool, len(todo))
	idx := make(chan int)
	var wg sync.WaitGroup
	for range min(callbackLookupWorkers, len(todo)) {
		wg.Go(func() {
			for i := range idx {
				addrs, err := c.Host(ctx, todo[i])
				if err != nil {
					continue
				}
				for _, a := range addrs {
					if a != todo[i] && remote[a] {
						matched[i] = true
						break
					}
				}
			}
		})
	}
feed:
	for i := range todo {
		select {
		case idx <- i:
		case <-ctx.Done():
			break feed
		}
	}
	close(idx)
	wg.Wait()
	var out []string
	for i, ok := range matched {
		if ok {
			out = append(out, todo[i])
		}
	}
	return out
}
