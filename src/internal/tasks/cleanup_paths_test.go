package tasks

import (
	"os"
	"path/filepath"
	"sort"
	"testing"
	"time"
)

// The sweep removes the job folders of either prefix older than the
// grace period, except those of active tasks (whose ids are matched
// whole: task 12 does not protect task 112's folder) and anything that is
// not a job folder.
func TestSweepJobFolders(t *testing.T) {
	base := t.TempDir()
	old := time.Now().Add(-2 * time.Hour)
	mk := func(name string, mod time.Time) {
		p := filepath.Join(base, name)
		if err := os.MkdirAll(filepath.Join(p, "env"), 0o700); err != nil {
			t.Fatal(err)
		}
		_ = os.WriteFile(filepath.Join(p, "env", "ssh_key"), []byte("secret"), 0o600)
		if err := os.Chtimes(p, mod, mod); err != nil {
			t.Fatal(err)
		}
	}
	mk("ascender_39125_1971269069", old) // crashed: swept
	mk("awx_7_abc", old)                 // former prefix: swept
	mk("ascender_112_x", old)            // not protected by task 12
	mk("ascender_12_y", old)             // active
	mk("awx_12_z", old)                  // active, former prefix
	mk("ascender_50_new", time.Now())    // within the grace period
	mk("other_1_dir", old)               // not a job folder
	removed, errs := sweepJobFolders(base, []int64{12}, time.Now().Add(-cleanupGracePeriod))
	if len(errs) > 0 {
		t.Fatal(errs)
	}
	for i := range removed {
		removed[i] = filepath.Base(removed[i])
	}
	sort.Strings(removed)
	want := []string{"ascender_112_x", "ascender_39125_1971269069", "awx_7_abc"}
	if len(removed) != len(want) {
		t.Fatalf("removed %v, want %v", removed, want)
	}
	for i := range want {
		if removed[i] != want[i] {
			t.Fatalf("removed %v, want %v", removed, want)
		}
	}
	left, _ := os.ReadDir(base)
	if len(left) != 4 {
		t.Errorf("%d entries left, want 4", len(left))
	}
}

// A project's lock entry goes once nobody holds or waits for it.
func TestLockProjectPrunes(t *testing.T) {
	d := &Dispatcher{}
	unlock := d.lockProject(5)
	done := make(chan struct{})
	go func() {
		u := d.lockProject(5)
		u()
		close(done)
	}()
	time.Sleep(20 * time.Millisecond)
	unlock()
	unlock() // a second call is harmless
	<-done
	d.projectMu.Lock()
	n := len(d.projectLocks)
	d.projectMu.Unlock()
	if n != 0 {
		t.Errorf("%d project locks left", n)
	}
}
