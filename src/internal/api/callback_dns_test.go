package api

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// fakeDNS answers from a table and counts lookups per name.
type fakeDNS struct {
	mu      sync.Mutex
	answers map[string][]string
	calls   map[string]int
	block   chan struct{} // when set, lookups wait for it to close
}

var errNoHost = errors.New("no such host")

func (f *fakeDNS) lookup(ctx context.Context, name string) ([]string, error) {
	f.mu.Lock()
	f.calls[name]++
	a, ok := f.answers[name]
	block := f.block
	f.mu.Unlock()
	if block != nil {
		select {
		case <-block:
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}
	if !ok {
		return nil, errNoHost
	}
	return a, nil
}

func (f *fakeDNS) count(name string) int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.calls[name]
}

func newFakeCache(answers map[string][]string) (*dnsCache, *fakeDNS, *time.Time) {
	f := &fakeDNS{answers: answers, calls: map[string]int{}}
	c := newDNSCache(f.lookup, f.lookup)
	now := time.Unix(1_000_000, 0)
	c.now = func() time.Time { return now }
	return c, f, &now
}

func TestDNSCacheTTLs(t *testing.T) {
	c, f, now := newFakeCache(map[string][]string{"web1": {"10.0.0.1"}})
	ctx := context.Background()

	for range 3 {
		if a, err := c.Host(ctx, "web1"); err != nil || !slices.Equal(a, []string{"10.0.0.1"}) {
			t.Fatalf("Host(web1) = %v, %v", a, err)
		}
		if _, err := c.Host(ctx, "gone"); !errors.Is(err, errNoHost) {
			t.Fatalf("Host(gone) err = %v", err)
		}
	}
	if f.count("web1") != 1 || f.count("gone") != 1 {
		t.Fatalf("lookups web1=%d gone=%d, want 1 each", f.count("web1"), f.count("gone"))
	}

	// Past the negative TTL only the failure is looked up again.
	*now = now.Add(dnsNegativeTTL)
	c.Host(ctx, "web1")
	c.Host(ctx, "gone")
	if f.count("web1") != 1 || f.count("gone") != 2 {
		t.Fatalf("after negative TTL: web1=%d gone=%d, want 1, 2", f.count("web1"), f.count("gone"))
	}

	// Past the positive TTL the answer is looked up again.
	*now = now.Add(dnsPositiveTTL)
	c.Host(ctx, "web1")
	if f.count("web1") != 2 {
		t.Fatalf("after positive TTL: web1=%d, want 2", f.count("web1"))
	}

	// Reverse and forward lookups of the same string are separate.
	c.Addr(ctx, "web1")
	if f.count("web1") != 3 {
		t.Fatalf("Addr(web1) shared Host's entry")
	}
}

func TestDNSCacheSharesInflightLookup(t *testing.T) {
	c, f, _ := newFakeCache(map[string][]string{"web1": {"10.0.0.1"}})
	f.block = make(chan struct{})
	var wg sync.WaitGroup
	for range 20 {
		wg.Go(func() {
			if a, err := c.Host(context.Background(), "web1"); err != nil || len(a) != 1 {
				t.Errorf("Host(web1) = %v, %v", a, err)
			}
		})
	}
	// Let every caller reach the wait before the lookup answers.
	time.Sleep(50 * time.Millisecond)
	close(f.block)
	wg.Wait()
	if n := f.count("web1"); n != 1 {
		t.Fatalf("20 concurrent callers made %d lookups, want 1", n)
	}
}

func TestDNSCacheCallerGivesUpLookupFinishes(t *testing.T) {
	c, f, _ := newFakeCache(map[string][]string{"web1": {"10.0.0.1"}})
	f.block = make(chan struct{})
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()
	if _, err := c.Host(ctx, "web1"); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("err = %v, want deadline exceeded", err)
	}
	close(f.block)
	// The detached lookup completes and its answer is cached for the retry.
	deadline := time.Now().Add(2 * time.Second)
	for {
		c.mu.Lock()
		_, ok := c.entries[dnsKey{name: "web1"}]
		c.mu.Unlock()
		if ok {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("abandoned lookup was never cached")
		}
		time.Sleep(5 * time.Millisecond)
	}
	if a, err := c.Host(context.Background(), "web1"); err != nil || len(a) != 1 || f.count("web1") != 1 {
		t.Fatalf("retry = %v, %v after %d lookups", a, err, f.count("web1"))
	}
}

func TestDNSCacheBounded(t *testing.T) {
	c, f, now := newFakeCache(nil)
	c.maxEntries = 3
	ctx := context.Background()
	for i := range 5 {
		c.Addr(ctx, fmt.Sprintf("10.0.0.%d", i))
	}
	if len(c.entries) != 3 {
		t.Fatalf("cache holds %d entries, want 3", len(c.entries))
	}
	// An uncached name is still answered, just looked up each time.
	c.Addr(ctx, "10.0.0.4")
	if f.count("10.0.0.4") != 2 {
		t.Fatalf("10.0.0.4 looked up %d times, want 2", f.count("10.0.0.4"))
	}
	// Once the entries expire, a full cache makes room.
	*now = now.Add(dnsNegativeTTL + time.Second)
	c.Addr(ctx, "10.0.0.9")
	if _, ok := c.entries[dnsKey{ptr: true, name: "10.0.0.9"}]; !ok || len(c.entries) != 1 {
		t.Fatalf("after expiry: %d entries, 10.0.0.9 cached=%v", len(c.entries), ok)
	}
}

func TestMatchByDNS(t *testing.T) {
	c, f, _ := newFakeCache(map[string][]string{
		"web1":     {"10.0.0.1", "fd00::1"},
		"web2":     {"10.0.0.2"},
		"web3":     {"10.0.0.1"},
		"10.0.0.1": {"10.0.0.1"},
	})
	remote := map[string]bool{"10.0.0.1": true, "caller.example.com": true}
	got := matchByDNS(context.Background(), c, []string{"web1", "web2", "gone", "10.0.0.1", "", "web3"}, remote)
	if !slices.Equal(got, []string{"web1", "web3"}) {
		t.Fatalf("matched %v, want [web1 web3]", got)
	}
	if f.count("10.0.0.1") != 0 || f.count("") != 0 {
		t.Fatal("IP literal or empty name was looked up")
	}
}

func TestMatchByDNSParallelAndBounded(t *testing.T) {
	var names []string
	answers := map[string][]string{}
	for i := range 100 {
		n := fmt.Sprintf("host%03d", i)
		names = append(names, n)
		answers[n] = []string{"192.0.2.1"}
	}
	f := &fakeDNS{answers: answers, calls: map[string]int{}}
	var active, peak atomic.Int32
	slow := func(ctx context.Context, name string) ([]string, error) {
		n := active.Add(1)
		defer active.Add(-1)
		for {
			p := peak.Load()
			if n <= p || peak.CompareAndSwap(p, n) {
				break
			}
		}
		time.Sleep(20 * time.Millisecond)
		return f.lookup(ctx, name)
	}
	c := newDNSCache(slow, slow)

	start := time.Now()
	got := matchByDNS(context.Background(), c, names, map[string]bool{"192.0.2.1": true})
	elapsed := time.Since(start)
	if len(got) != 100 {
		t.Fatalf("matched %d names, want 100", len(got))
	}
	if p := peak.Load(); p < 2 || p > callbackLookupWorkers {
		t.Fatalf("peak concurrent lookups %d, want 2..%d", p, callbackLookupWorkers)
	}
	// Sequential would take 2s.
	if elapsed > time.Second {
		t.Fatalf("100 lookups took %v", elapsed)
	}
}

func TestMatchByDNSStopsAtDeadline(t *testing.T) {
	var names []string
	for i := range 1000 {
		names = append(names, fmt.Sprintf("host%04d", i))
	}
	c, f, _ := newFakeCache(nil)
	f.block = make(chan struct{}) // DNS never answers
	defer close(f.block)
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()
	start := time.Now()
	if got := matchByDNS(ctx, c, names, map[string]bool{"192.0.2.1": true}); len(got) != 0 {
		t.Fatalf("matched %v", got)
	}
	if elapsed := time.Since(start); elapsed > time.Second {
		t.Fatalf("returned after %v, want about 50ms", elapsed)
	}
	f.mu.Lock()
	started := len(f.calls)
	f.mu.Unlock()
	if started > callbackLookupWorkers {
		t.Fatalf("%d lookups started against a dead resolver, want at most %d", started, callbackLookupWorkers)
	}
}
