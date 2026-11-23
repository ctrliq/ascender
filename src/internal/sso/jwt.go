package sso

import (
	"context"
	"crypto"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/sha512"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"hash"
	"math/big"
	"strconv"
	"strings"
	"sync"
	"time"
)

// JWTs as PyJWT 2.15 read them, for the RSA keys identity providers sign
// ID tokens with.

// JWT is a token split into its parts.
type JWT struct {
	Raw          string
	Header       map[string]any
	Claims       map[string]any
	SigningInput string
	Signature    []byte
}

func b64url(s string) ([]byte, error) {
	s = strings.TrimRight(s, "=")
	return base64.RawURLEncoding.DecodeString(s)
}

// ParseJWT decodes a token without verifying it.
func ParseJWT(token string) (*JWT, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return nil, errors.New("Not enough segments")
	}
	hb, err := b64url(parts[0])
	if err != nil {
		return nil, errors.New("Invalid header padding")
	}
	t := &JWT{Raw: token, SigningInput: parts[0] + "." + parts[1]}
	if v, err := DecodeJSON(hb); err != nil {
		return nil, fmt.Errorf("Invalid header string: %v", err)
	} else if m, ok := v.(map[string]any); ok {
		t.Header = m
	} else {
		return nil, errors.New("Invalid header string: must be a json object")
	}
	pb, err := b64url(parts[1])
	if err != nil {
		return nil, errors.New("Invalid payload padding")
	}
	if v, err := DecodeJSON(pb); err != nil {
		return nil, fmt.Errorf("Invalid payload string: %v", err)
	} else if m, ok := v.(map[string]any); ok {
		t.Claims = m
	} else {
		return nil, errors.New("Invalid payload string: must be a json object")
	}
	if t.Signature, err = b64url(parts[2]); err != nil {
		return nil, errors.New("Invalid crypto padding")
	}
	return t, nil
}

// JWK is one key of a key set.
type JWK map[string]any

// rsaKey is the key as an RSA public key.
func (k JWK) rsaKey() (*rsa.PublicKey, error) {
	if str(k, "kty") != "RSA" {
		return nil, fmt.Errorf("Unable to find an algorithm for key: %v", k["kty"])
	}
	nb, err := b64url(str(k, "n"))
	if err != nil || len(nb) == 0 {
		return nil, errors.New("Invalid key: n")
	}
	eb, err := b64url(str(k, "e"))
	if err != nil || len(eb) == 0 {
		return nil, errors.New("Invalid key: e")
	}
	e := new(big.Int).SetBytes(eb)
	if !e.IsInt64() || e.Int64() > 1<<31 {
		return nil, errors.New("Invalid key: e")
	}
	return &rsa.PublicKey{N: new(big.Int).SetBytes(nb), E: int(e.Int64())}, nil
}

func hashFor(alg string) (crypto.Hash, func() hash.Hash, bool) {
	switch alg {
	case "RS256":
		return crypto.SHA256, sha256.New, true
	case "RS384":
		return crypto.SHA384, sha512.New384, true
	case "RS512":
		return crypto.SHA512, sha512.New, true
	}
	return 0, nil, false
}

// Verify checks the signature with the key under alg.
func (t *JWT) Verify(k JWK, alg string) bool {
	pub, err := k.rsaKey()
	if err != nil {
		return false
	}
	h, newHash, ok := hashFor(alg)
	if !ok {
		return false
	}
	d := newHash()
	d.Write([]byte(t.SigningInput))
	return rsa.VerifyPKCS1v15(pub, h, d.Sum(nil), t.Signature) == nil
}

// ClaimChecks are jwt.decode's audience, issuer and leeway.
type ClaimChecks struct {
	Audience string
	Issuer   string
	Leeway   float64
	Now      time.Time
}

// pyInt is int(value) for a claim.
func pyInt(v any) (float64, bool) {
	switch t := v.(type) {
	case json.Number:
		if i, err := t.Int64(); err == nil {
			return float64(i), true
		}
		if f, err := t.Float64(); err == nil {
			return float64(int64(f)), true
		}
	case float64:
		return float64(int64(t)), true
	case string:
		if i, err := strconv.ParseInt(strings.TrimSpace(t), 10, 64); err == nil {
			return float64(i), true
		}
	case bool:
		if t {
			return 1, true
		}
		return 0, true
	}
	return 0, false
}

// Decode is jwt.decode(token, key, algorithms=["RS256"], audience,
// issuer, leeway): the PyJWT checks in its order and with its messages.
func (t *JWT) Decode(k JWK, c ClaimChecks) error {
	alg := str(t.Header, "alg")
	if alg != "RS256" {
		return errors.New("The specified alg value is not allowed")
	}
	if !t.Verify(k, "RS256") {
		return errors.New("Signature verification failed")
	}
	return t.ValidateClaims(c)
}

// ValidateClaims is PyJWT's _validate_claims.
func (t *JWT) ValidateClaims(c ClaimChecks) error {
	now := float64(c.Now.UnixNano()) / 1e9
	if c.Now.IsZero() {
		now = float64(time.Now().UnixNano()) / 1e9
	}
	p := t.Claims
	if v, ok := p["iat"]; ok {
		iat, ok := pyInt(v)
		if !ok {
			return errors.New("Issued At claim (iat) must be an integer.")
		}
		if iat > now+c.Leeway {
			return errors.New("The token is not yet valid (iat)")
		}
	}
	if v, ok := p["nbf"]; ok {
		nbf, ok := pyInt(v)
		if !ok {
			return errors.New("Not Before claim (nbf) must be an integer.")
		}
		if nbf > now+c.Leeway {
			return errors.New("The token is not yet valid (nbf)")
		}
	}
	if v, ok := p["exp"]; ok {
		exp, ok := pyInt(v)
		if !ok {
			return errors.New("Expiration Time claim (exp) must be an integer.")
		}
		if exp <= now-c.Leeway {
			return &ExpiredError{}
		}
	}
	if c.Issuer != "" {
		v, ok := p["iss"]
		if !ok {
			return errors.New(`Token is missing the "iss" claim`)
		}
		if s, _ := v.(string); s != c.Issuer {
			return errors.New("Invalid issuer")
		}
	}
	if c.Audience != "" {
		v, ok := p["aud"]
		if !ok {
			return &AudienceError{Msg: `Token is missing the "aud" claim`, Missing: true}
		}
		var auds []string
		switch a := v.(type) {
		case string:
			auds = []string{a}
		case []any:
			for _, x := range a {
				s, ok := x.(string)
				if !ok {
					return &AudienceError{Msg: "Invalid claim format in token"}
				}
				auds = append(auds, s)
			}
		default:
			return &AudienceError{Msg: "Invalid claim format in token"}
		}
		found := false
		for _, a := range auds {
			if a == c.Audience {
				found = true
			}
		}
		if !found {
			return &AudienceError{Msg: "Audience doesn't match"}
		}
	}
	if v, ok := p["sub"]; ok {
		if _, isStr := v.(string); !isStr {
			return errors.New("Subject must be a string")
		}
	}
	if v, ok := p["jti"]; ok {
		if _, isStr := v.(string); !isStr {
			return errors.New("JWT ID must be a string")
		}
	}
	return nil
}

// ExpiredError is ExpiredSignatureError.
type ExpiredError struct{}

func (*ExpiredError) Error() string { return "Signature has expired" }

// AudienceError is InvalidAudienceError (MissingRequiredClaimError for a
// missing aud).
type AudienceError struct {
	Msg     string
	Missing bool
}

func (e *AudienceError) Error() string { return e.Msg }

// Keys and discovery documents, cached a day per URL. A failed refresh
// serves the previous answer; an empty one is never kept.

type cached struct {
	at  time.Time
	val any
}

// Cache is the @cache(ttl) decorator.
type Cache struct {
	mu  sync.Mutex
	ttl time.Duration
	m   map[string]cached
}

// NewCache makes a cache with the given lifetime.
func NewCache(ttl time.Duration) *Cache { return &Cache{ttl: ttl, m: map[string]cached{}} }

// Get returns the cached value of key, fetching it when missing or old.
func (c *Cache) Get(key string, fetch func() (any, error)) (any, error) {
	c.mu.Lock()
	e, ok := c.m[key]
	c.mu.Unlock()
	if ok && time.Since(e.at) < c.ttl && truthy(e.val) {
		return e.val, nil
	}
	v, err := fetch()
	if err != nil {
		if ok && e.val != nil {
			return e.val, nil
		}
		return nil, err
	}
	if truthy(v) {
		c.mu.Lock()
		c.m[key] = cached{at: time.Now(), val: v}
		c.mu.Unlock()
	}
	return v, nil
}

// Invalidate forgets key.
func (c *Cache) Invalidate(key string) {
	c.mu.Lock()
	delete(c.m, key)
	c.mu.Unlock()
}

var (
	discoveryCache = NewCache(24 * time.Hour)
	jwksCache      = NewCache(24 * time.Hour)
)

// Discovery fetches an OpenID configuration document.
func Discovery(ctx context.Context, c *Client, u string) (map[string]any, error) {
	v, err := discoveryCache.Get(u, func() (any, error) {
		v, err := c.GetJSON(ctx, u, nil)
		if err != nil {
			return nil, err
		}
		m, _ := v.(map[string]any)
		return m, nil
	})
	if err != nil {
		return nil, err
	}
	m, _ := v.(map[string]any)
	if m == nil {
		m = map[string]any{}
	}
	return m, nil
}

// JWKS fetches a key set's keys; refresh forgets the cached copy first.
func JWKS(ctx context.Context, c *Client, u string, refresh bool) (any, error) {
	if refresh {
		jwksCache.Invalidate(u)
	}
	return jwksCache.Get(u, func() (any, error) {
		v, err := c.GetJSON(ctx, u, nil)
		if err != nil {
			return nil, err
		}
		m, _ := v.(map[string]any)
		if m == nil {
			return nil, nil
		}
		return m["keys"], nil
	})
}

// keysOf is the key set's list of keys.
func keysOf(v any) []JWK {
	l, _ := v.([]any)
	out := make([]JWK, 0, len(l))
	for _, x := range l {
		if m, ok := x.(map[string]any); ok {
			out = append(out, JWK(m))
		}
	}
	return out
}
