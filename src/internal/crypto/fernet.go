package crypto

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/sha512"
	"encoding/base64"
	"encoding/binary"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"
)

// EncryptedPrefix marks encrypted values in the database.
const EncryptedPrefix = "$encrypted$"

// EncryptionKey derives the 64-byte Fernet256 key the old application used:
// urlsafe_b64(sha512(SECRET_KEY + str(pk) + field_name)). The first 32 bytes
// sign, the last 32 encrypt.
func EncryptionKey(secretKey, fieldName string, pk *int64) []byte {
	h := sha512.New()
	h.Write([]byte(secretKey))
	if pk != nil {
		h.Write([]byte(strconv.FormatInt(*pk, 10)))
	}
	h.Write([]byte(fieldName))
	return h.Sum(nil)
}

// IsEncrypted reports whether the value carries the $encrypted$ prefix.
func IsEncrypted(value string) bool {
	return strings.HasPrefix(value, EncryptedPrefix) && len(value) > len(EncryptedPrefix)
}

// EncryptField encrypts value as the old encrypt_field did:
// "$encrypted$UTF8$AESCBC$" + base64(fernet256 token). Empty values and
// already-encrypted values are returned unchanged, as is "ASK" when ask is
// true.
func EncryptField(secretKey, fieldName string, pk *int64, value string, ask bool) (string, error) {
	if value == "" || IsEncrypted(value) || (ask && value == "ASK") {
		return value, nil
	}
	key := EncryptionKey(secretKey, fieldName, pk)
	token, err := fernet256Encrypt(key, []byte(value))
	if err != nil {
		return "", err
	}
	// Fernet.encrypt returned the url-safe base64 token text, which the old
	// code base64-encoded once more before storing it.
	fernetText := base64.URLEncoding.EncodeToString(token)
	return "$encrypted$UTF8$AESCBC$" + base64.StdEncoding.EncodeToString([]byte(fernetText)), nil
}

// DecryptField reverses EncryptField. Values without the prefix are returned
// unchanged, which is how the old decrypt_field behaved.
func DecryptField(secretKey, fieldName string, pk *int64, value string) (string, error) {
	if !IsEncrypted(value) {
		return value, nil
	}
	key := EncryptionKey(secretKey, fieldName, pk)
	return DecryptValue(key, value)
}

// DecryptValue decrypts with an already-derived key.
func DecryptValue(key []byte, value string) (string, error) {
	raw := strings.TrimPrefix(value, EncryptedPrefix)
	raw = strings.TrimPrefix(raw, "UTF8$")
	algo, b64, ok := strings.Cut(raw, "$")
	if !ok {
		return "", errors.New("malformed encrypted value")
	}
	if algo != "AESCBC" {
		return "", fmt.Errorf("unsupported algorithm: %s", algo)
	}
	fernetText, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		return "", fmt.Errorf("decode encrypted value: %w", err)
	}
	token, err := base64.URLEncoding.DecodeString(string(fernetText))
	if err != nil {
		return "", fmt.Errorf("decode fernet token: %w", err)
	}
	plain, err := fernet256Decrypt(key, token)
	if err != nil {
		return "", err
	}
	return string(plain), nil
}

// fernet256Encrypt builds a Fernet token (version 0x80, timestamp, IV,
// AES-256-CBC ciphertext, HMAC-SHA256) using the 64-byte key split as the
// old Fernet256 class did.
func fernet256Encrypt(key, plaintext []byte) ([]byte, error) {
	if len(key) != 64 {
		return nil, errors.New("fernet256 key must be 64 bytes")
	}
	signingKey, encKey := key[:32], key[32:]
	block, err := aes.NewCipher(encKey)
	if err != nil {
		return nil, err
	}
	iv := make([]byte, aes.BlockSize)
	if _, err := rand.Read(iv); err != nil {
		return nil, err
	}
	padded := pkcs7Pad(plaintext, aes.BlockSize)
	ct := make([]byte, len(padded))
	cipher.NewCBCEncrypter(block, iv).CryptBlocks(ct, padded)

	buf := make([]byte, 0, 1+8+16+len(ct)+32)
	buf = append(buf, 0x80)
	ts := make([]byte, 8)
	binary.BigEndian.PutUint64(ts, uint64(time.Now().Unix()))
	buf = append(buf, ts...)
	buf = append(buf, iv...)
	buf = append(buf, ct...)
	mac := hmac.New(sha256.New, signingKey)
	mac.Write(buf)
	buf = append(buf, mac.Sum(nil)...)
	return buf, nil
}

func fernet256Decrypt(key, token []byte) ([]byte, error) {
	if len(key) != 64 {
		return nil, errors.New("fernet256 key must be 64 bytes")
	}
	signingKey, encKey := key[:32], key[32:]
	if len(token) < 1+8+16+32 || token[0] != 0x80 {
		return nil, errors.New("invalid fernet token")
	}
	body, sig := token[:len(token)-32], token[len(token)-32:]
	mac := hmac.New(sha256.New, signingKey)
	mac.Write(body)
	if !hmac.Equal(mac.Sum(nil), sig) {
		return nil, errors.New("invalid fernet token signature; check SECRET_KEY")
	}
	iv := body[9:25]
	ct := body[25:]
	if len(ct)%aes.BlockSize != 0 || len(ct) == 0 {
		return nil, errors.New("invalid fernet ciphertext length")
	}
	block, err := aes.NewCipher(encKey)
	if err != nil {
		return nil, err
	}
	plain := make([]byte, len(ct))
	cipher.NewCBCDecrypter(block, iv).CryptBlocks(plain, ct)
	return pkcs7Unpad(plain, aes.BlockSize)
}

func pkcs7Pad(b []byte, size int) []byte {
	n := size - len(b)%size
	return append(b, bytes.Repeat([]byte{byte(n)}, n)...)
}

func pkcs7Unpad(b []byte, size int) ([]byte, error) {
	if len(b) == 0 {
		return nil, errors.New("empty padded data")
	}
	n := int(b[len(b)-1])
	if n == 0 || n > size || n > len(b) {
		return nil, errors.New("invalid padding")
	}
	for _, c := range b[len(b)-n:] {
		if int(c) != n {
			return nil, errors.New("invalid padding")
		}
	}
	return b[:len(b)-n], nil
}

// Seal encrypts and signs value with a key derived from secretKey and
// purpose, as a URL-safe token (a Fernet256 token, unpadded). Open reverses
// it, refusing a token older than maxAge or made for another purpose.
func Seal(secretKey, purpose, value string) (string, error) {
	tok, err := fernet256Encrypt(EncryptionKey(secretKey, purpose, nil), []byte(value))
	if err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(tok), nil
}

// Open is Seal's reverse.
func Open(secretKey, purpose, token string, maxAge time.Duration) (string, error) {
	raw, err := base64.RawURLEncoding.DecodeString(token)
	if err != nil {
		return "", err
	}
	plain, err := fernet256Decrypt(EncryptionKey(secretKey, purpose, nil), raw)
	if err != nil {
		return "", err
	}
	made := time.Unix(int64(binary.BigEndian.Uint64(raw[1:9])), 0)
	if time.Since(made) > maxAge {
		return "", errors.New("token expired")
	}
	return string(plain), nil
}
