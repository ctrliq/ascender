package auth

import (
	"crypto/rand"
	"crypto/subtle"
	"fmt"
	"net/http"
	"net/url"
	"slices"
	"strings"
	"sync/atomic"
)

// CSRFCookieName is the old CSRF_COOKIE_NAME; the server sets it from its
// configuration at startup.
var CSRFCookieName = "csrftoken"

// CSRFHeaderName is what the UI client and the old Django middleware agreed
// on.
const (
	CSRFHeaderName = "X-CSRFToken"
	CSRFFormField  = "csrfmiddlewaretoken"
	csrfTokenLen   = 32
)

const csrfAlphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

// NewCSRFToken returns a 32-character token from Django's alphabet.
func NewCSRFToken() string {
	b := make([]byte, csrfTokenLen)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	for i := range b {
		b[i] = csrfAlphabet[int(b[i])%len(csrfAlphabet)]
	}
	return string(b)
}

func validCSRFToken(t string) bool {
	if len(t) != csrfTokenLen && len(t) != 2*csrfTokenLen {
		return false
	}
	for i := 0; i < len(t); i++ {
		c := t[i]
		if !((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9')) {
			return false
		}
	}
	return true
}

// EnsureCSRFCookie guarantees the response carries a csrftoken cookie and
// returns the token in force for this request.
func EnsureCSRFCookie(w http.ResponseWriter, r *http.Request, secure bool) string {
	if c, err := r.Cookie(CSRFCookieName); err == nil && validCSRFToken(c.Value) {
		return c.Value
	}
	tok := NewCSRFToken()
	http.SetCookie(w, &http.Cookie{Name: CSRFCookieName, Value: tok, Path: "/", SameSite: http.SameSiteLaxMode, Secure: secure, MaxAge: 31449600})
	return tok
}

// originPolicy is the cross-origin check and the extra origins it trusts
// (CSRF_TRUSTED_ORIGINS).
type originPolicy struct {
	check   *http.CrossOriginProtection
	trusted []string
}

var origins atomic.Pointer[originPolicy]

func init() { _ = SetTrustedOrigins(nil) }

// SetTrustedOrigins sets the origins, besides the server's own, that may
// send state-changing requests with a session ("https://ui.example.com"):
// a UI served from another host, as CSRF_TRUSTED_ORIGINS allowed.
func SetTrustedOrigins(list []string) error {
	p := &originPolicy{check: http.NewCrossOriginProtection()}
	for _, o := range list {
		o = strings.TrimRight(strings.TrimSpace(o), "/")
		if o == "" {
			continue
		}
		if err := p.check.AddTrustedOrigin(o); err != nil {
			return fmt.Errorf("trusted origin %q: %w", o, err)
		}
		p.trusted = append(p.trusted, o)
	}
	origins.Store(p)
	return nil
}

// CSRFError checks an unsafe request that was authenticated by a session
// cookie and returns why it fails, or "" when it passes. The browser
// must not have sent it from another site (Sec-Fetch-Site, else Origin
// against the host, as Django's origin check did), and the token in the
// header or form field must match the cookie. Matching the cookie alone
// is not enough: a sibling subdomain can set the cookie. Requests
// authenticated by Basic or token auth are exempt, as in DRF.
func CSRFError(r *http.Request) string {
	if err := origins.Load().check.Check(r); err != nil {
		return fmt.Sprintf("Origin checking failed - %s does not match any trusted origins.", originOf(r))
	}
	c, err := r.Cookie(CSRFCookieName)
	if err != nil || !validCSRFToken(c.Value) {
		return "CSRF token missing or incorrect."
	}
	tok := r.Header.Get(CSRFHeaderName)
	if tok == "" {
		tok = r.PostFormValue(CSRFFormField)
	}
	if !validCSRFToken(tok) {
		return "CSRF token missing or incorrect."
	}
	// Django masks tokens to 64 chars; the UI echoes the cookie, so a plain
	// comparison is what matters here.
	if subtle.ConstantTimeCompare([]byte(tok), []byte(c.Value)) != 1 {
		return "CSRF token missing or incorrect."
	}
	return ""
}

// CSRFOK reports whether CSRFError passes.
func CSRFOK(r *http.Request) bool { return CSRFError(r) == "" }

// SameOriginOK is the origin half of the check for a request that is safe
// by method but acts with the session anyway: a WebSocket's handshake.
// Browsers always send Origin on one, and a page on another site must not
// open it with the user's cookies.
func SameOriginOK(r *http.Request) bool {
	switch r.Header.Get("Sec-Fetch-Site") {
	case "", "same-origin", "none":
	default:
		return slices.Contains(origins.Load().trusted, originOf(r))
	}
	o := r.Header.Get("Origin")
	if o == "" {
		return true
	}
	u, err := url.Parse(o)
	if err == nil && u.Host == r.Host {
		return true
	}
	return slices.Contains(origins.Load().trusted, originOf(r))
}

func originOf(r *http.Request) string {
	if o := r.Header.Get("Origin"); o != "" {
		return o
	}
	return "null"
}

// RotateCSRFCookie is rotate_token: every login gets a new CSRF secret,
// so a token planted or seen before the login is worthless after it.
func RotateCSRFCookie(w http.ResponseWriter, secure bool) {
	http.SetCookie(w, &http.Cookie{Name: CSRFCookieName, Value: NewCSRFToken(), Path: "/", SameSite: http.SameSiteLaxMode, Secure: secure, MaxAge: 31449600})
}
