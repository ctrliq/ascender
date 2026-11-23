package db

import "testing"

// The keys django_pg_utils.locks.resolve_lock_id gave, from the old image.
func TestAdvisoryLockKey(t *testing.T) {
	for name, want := range map[string]int64{
		"cluster_policy_lock":       -8960390604963387910,
		"instance_registration_foo": -5390775619601314039,
	} {
		if got := AdvisoryLockKey(name); got != want {
			t.Errorf("%s: got %d, want %d", name, got, want)
		}
	}
}
