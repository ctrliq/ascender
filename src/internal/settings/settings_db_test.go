package settings

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/ctrliq/ascender/internal/db"
)

// With two conf_setting rows for a key, the cache keeps the first by id,
// as Lookup, Write and the old SettingsWrapper do (ASCENDER_TEST_DATABASE_URL;
// the key is not a setting, and its rows are removed).
func TestReloadFirstRowWins(t *testing.T) {
	url := os.Getenv("ASCENDER_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("ASCENDER_TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	d, err := db.Open(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer d.Close()
	const key = "ZZ_TEST_DUPLICATE_KEY"
	defer func() { _, _ = d.Pool.Exec(ctx, `DELETE FROM conf_setting WHERE key = $1`, key) }()
	for _, v := range []string{`"first"`, `"second"`} {
		if _, err := d.Pool.Exec(ctx, `INSERT INTO conf_setting (created, modified, key, value, user_id) VALUES (now(), now(), $1, $2::jsonb, NULL)`, key, v); err != nil {
			t.Fatal(err)
		}
	}
	reg, err := LoadRegistry()
	if err != nil {
		t.Fatal(err)
	}
	s := NewStore(d, reg, "zz")
	if err := s.Reload(ctx); err != nil {
		t.Fatal(err)
	}
	s.mu.RLock()
	got := s.values[key]
	s.mu.RUnlock()
	if got != "first" {
		t.Errorf("cached %v, want the first row's value", got)
	}
}

// A conf_setting row for a setting the registry no longer has (here
// ASCENDER_REQUEST_PROFILE, which the Go application dropped) loads
// without error and is ignored: Get reports no such setting, and it is
// not among the changed keys (ASCENDER_TEST_DATABASE_URL; the row is
// removed).
func TestReloadIgnoresDroppedSetting(t *testing.T) {
	d := openTestDB(t)
	ctx := context.Background()
	const key = "ASCENDER_REQUEST_PROFILE"
	defer func() { _, _ = d.Pool.Exec(ctx, `DELETE FROM conf_setting WHERE key = $1`, key) }()
	if _, err := d.Pool.Exec(ctx, `INSERT INTO conf_setting (created, modified, key, value, user_id) VALUES (now(), now(), $1, 'true'::jsonb, NULL)`, key); err != nil {
		t.Fatal(err)
	}
	reg, err := LoadRegistry()
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := reg.Field(key); ok {
		t.Fatalf("%s is still in the registry", key)
	}
	s := NewStore(d, reg, "zz")
	if err := s.Reload(ctx); err != nil {
		t.Fatal(err)
	}
	if v, ok := s.Get(ctx, key); ok {
		t.Errorf("Get(%s) = %v, want no such setting", key, v)
	}
	for _, k := range s.ChangedKeys(ctx) {
		if k == key {
			t.Errorf("%s listed as changed", key)
		}
	}
}

func openTestDB(t *testing.T) *db.DB {
	t.Helper()
	url := os.Getenv("ASCENDER_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("ASCENDER_TEST_DATABASE_URL not set")
	}
	d, err := db.Open(context.Background(), url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(d.Close)
	return d
}

// waitListening waits for a store's listener to hold its connection.
func waitListening(t *testing.T, s *Store) {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	for !s.listening.Load() {
		if time.Now().After(deadline) {
			t.Fatal("listener did not start")
		}
		time.Sleep(5 * time.Millisecond)
	}
}

// A setting written through one store (one process) is seen by the
// writer as soon as the write returns, and by a second store on the same
// database (another process, its own pool) through the notification, long
// before its periodic reload; so is a delete. A write that rolls back
// tells nobody.
func TestChangePropagatesToOtherStores(t *testing.T) {
	d1, d2 := openTestDB(t), openTestDB(t)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	const key = "CUSTOM_LOGIN_INFO"
	clean := func() { _, _ = d1.Pool.Exec(context.Background(), `DELETE FROM conf_setting WHERE key = $1`, key) }
	clean()
	t.Cleanup(clean)
	reg1, _ := LoadRegistry()
	reg2, _ := LoadRegistry()
	s1, s2 := NewStore(d1, reg1, "zz"), NewStore(d2, reg2, "zz")
	for _, s := range []*Store{s1, s2} {
		// Only a notification can refresh within the test.
		s.ttl = time.Hour
		if err := s.Reload(ctx); err != nil {
			t.Fatal(err)
		}
	}
	changes := make(chan struct{}, 16)
	s2.OnChange(func() { changes <- struct{}{} })
	go s2.Listen(ctx)
	waitListening(t, s2)

	seen := func(s *Store, want string) time.Duration {
		t.Helper()
		start := time.Now()
		for s.String(ctx, key) != want {
			if time.Since(start) > 5*time.Second {
				t.Fatalf("second store still has %q, want %q", s.String(ctx, key), want)
			}
			time.Sleep(time.Millisecond)
		}
		return time.Since(start)
	}
	for i, v := range []string{"zz first", "zz second"} {
		if err := s1.Set(ctx, key, v); err != nil {
			t.Fatal(err)
		}
		if got := s1.String(ctx, key); got != v {
			t.Fatalf("write %d: the writer reads %q right after writing %q", i, got, v)
		}
		if el := seen(s2, v); el > 2*time.Second {
			t.Errorf("write %d reached the second store after %s", i, el)
		}
	}
	if err := s1.Delete(ctx, key); err != nil {
		t.Fatal(err)
	}
	if got := s1.String(ctx, key); got != "" {
		t.Fatalf("the writer reads %q after the delete", got)
	}
	seen(s2, "")
	if s2.IsOverridden(ctx, key) {
		t.Error("deleted setting still overridden in the second store")
	}

	// A write in a transaction that rolls back.
	for len(changes) > 0 {
		<-changes
	}
	tx, err := d1.Pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := s1.Write(ctx, tx, key, "zz rolled back"); err != nil {
		t.Fatal(err)
	}
	_ = tx.Rollback(ctx)
	select {
	case <-changes:
		t.Error("a rolled back write reloaded the second store")
	case <-time.After(300 * time.Millisecond):
	}
	if got := s2.String(ctx, key); got != "" {
		t.Errorf("second store reads %q", got)
	}
}

// A reload that started before the one the cache holds is not applied:
// a slow background reload cannot bring back a value a write's own reload
// replaced.
func TestOlderReloadNotApplied(t *testing.T) {
	d := openTestDB(t)
	ctx := context.Background()
	const key = "CUSTOM_LOGIN_INFO"
	clean := func() { _, _ = d.Pool.Exec(ctx, `DELETE FROM conf_setting WHERE key = $1`, key) }
	clean()
	t.Cleanup(clean)
	reg, _ := LoadRegistry()
	s := NewStore(d, reg, "zz")
	if err := s.Set(ctx, key, "zz new"); err != nil {
		t.Fatal(err)
	}
	// Pretend a later reload was applied already, then let an earlier one
	// finish after it with what it read (the row is gone now).
	clean()
	s.mu.Lock()
	s.appliedSeq = s.reloadSeq + 10
	s.mu.Unlock()
	if err := s.Reload(ctx); err != nil {
		t.Fatal(err)
	}
	if got := s.String(ctx, key); got != "zz new" {
		t.Errorf("an older reload replaced the cache: %q", got)
	}
}
