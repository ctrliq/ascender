// Package crypto implements the two secrets schemes the old application left
// in the database: Django's PBKDF2 password hashes in auth_user, and the
// AES-256-CBC "Fernet256" field encryption for credential inputs and
// encrypted settings. Both are reproduced exactly so existing rows verify and
// decrypt, and rows the Go application writes can be read by the old one.
package crypto

import (
	"crypto/hmac"
	"crypto/pbkdf2"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"strconv"
	"strings"
)

// DjangoPBKDF2Iterations is PBKDF2PasswordHasher.iterations in Django 6.1,
// the old application's: new hashes get it, and older ones verify.
const DjangoPBKDF2Iterations = 1_500_000

// passwordIterations is the iteration count of a pbkdf2_sha256 hash, or 0.
func passwordIterations(encoded string) int {
	parts := strings.SplitN(encoded, "$", 4)
	if len(parts) != 4 || parts[0] != "pbkdf2_sha256" {
		return 0
	}
	n, err := strconv.Atoi(parts[1])
	if err != nil || n <= 0 {
		return 0
	}
	return n
}

// PasswordNeedsUpdate is the hasher's must_update: a hash made with another
// iteration count is replaced at the next successful login.
func PasswordNeedsUpdate(encoded string) bool {
	return passwordIterations(encoded) != DjangoPBKDF2Iterations
}

// HardenRuntime is the hasher's harden_runtime: after checking a hash made
// with fewer iterations than new ones get, run the difference, so a login
// takes as long whichever hash an account holds (and as long as the dummy
// a missing user is checked against).
func HardenRuntime(password, encoded string) {
	if extra := DjangoPBKDF2Iterations - passwordIterations(encoded); extra > 0 && extra < DjangoPBKDF2Iterations {
		_, _ = pbkdf2.Key(sha256.New, password, []byte("harden"), extra, 32)
	}
}

// CheckPassword verifies a plaintext against a Django "pbkdf2_sha256$..."
// hash. Unknown algorithms fail closed.
func CheckPassword(password, encoded string) bool {
	parts := strings.SplitN(encoded, "$", 4)
	if len(parts) != 4 || parts[0] != "pbkdf2_sha256" {
		return false
	}
	iter, err := strconv.Atoi(parts[1])
	if err != nil || iter <= 0 {
		return false
	}
	salt := parts[2]
	want, err := base64.StdEncoding.DecodeString(parts[3])
	if err != nil {
		return false
	}
	got, err := pbkdf2.Key(sha256.New, password, []byte(salt), iter, len(want))
	if err != nil {
		return false
	}
	return hmac.Equal(got, want)
}

// MakePassword produces a Django-compatible pbkdf2_sha256 hash.
func MakePassword(password string) (string, error) {
	saltBytes := make([]byte, 16)
	if _, err := rand.Read(saltBytes); err != nil {
		return "", err
	}
	// Django uses 22 characters from [a-zA-Z0-9]; base64 raw without padding
	// of 16 bytes is 22 characters, which is close enough and still a salt.
	salt := strings.NewReplacer("+", "a", "/", "b").Replace(base64.RawStdEncoding.EncodeToString(saltBytes))
	key, err := pbkdf2.Key(sha256.New, password, []byte(salt), DjangoPBKDF2Iterations, 32)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("pbkdf2_sha256$%d$%s$%s", DjangoPBKDF2Iterations, salt, base64.StdEncoding.EncodeToString(key)), nil
}

// IsUsablePassword reports whether the stored hash can ever verify. Django
// marks unusable passwords with a leading "!".
func IsUsablePassword(encoded string) bool {
	return encoded != "" && !strings.HasPrefix(encoded, "!")
}

// ErrNotEncrypted is returned when a value lacks the $encrypted$ prefix.
var ErrNotEncrypted = errors.New("value is not encrypted")
