package db

import (
	"crypto/sha256"
	"encoding/binary"
)

// AdvisoryLockKey is django_pg_utils' key for a lock name: the first eight
// bytes of its SHA-256 as a signed big-endian integer, the keys the old
// application's advisory_lock took its locks under. Session and
// transaction advisory locks on one key block each other.
func AdvisoryLockKey(name string) int64 {
	sum := sha256.Sum256([]byte(name))
	return int64(binary.BigEndian.Uint64(sum[:8]))
}
