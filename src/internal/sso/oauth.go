package sso

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/tls"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"
)

// The OAuth2 machinery python-social-auth 5.1.0 gave every backend.

// UserAgent is what social-auth sent.
const UserAgent = "social-auth-5.1.0"

// Error is a social_core exception: its class and its str().
type Error struct {
	Class string
	Msg   string
}

func (e *Error) Error() string { return e.Msg }

func authErr(class, format string, args ...any) *Error {
	return &Error{Class: class, Msg: fmt.Sprintf(format, args...)}
}

// AuthCanceled renders "Authentication process canceled[: msg]".
func AuthCanceled(msg string) *Error {
	if msg == "" {
		return authErr("AuthCanceled", "Authentication process canceled")
	}
	return authErr("AuthCanceled", "Authentication process canceled: %s", msg)
}

// AuthFailed renders "Authentication failed: msg".
func AuthFailed(msg string) *Error {
	if msg == "access_denied" {
		return authErr("AuthFailed", "Authentication process was canceled")
	}
	return authErr("AuthFailed", "Authentication failed: %s", msg)
}

// AuthMissingParameter renders "Missing needed parameter p".
func AuthMissingParameter(p string) *Error {
	return authErr("AuthMissingParameter", "Missing needed parameter %s", p)
}

// AuthInvalidParameter renders "Invalid value for parameter p".
func AuthInvalidParameter(p string) *Error {
	return authErr("AuthInvalidParameter", "Invalid value for parameter %s", p)
}

// AuthTokenError renders "Token error: msg".
func AuthTokenError(msg string) *Error { return authErr("AuthTokenError", "Token error: %s", msg) }

// AuthForbidden is "Your credentials aren't allowed".
func AuthForbidden() *Error { return authErr("AuthForbidden", "Your credentials aren't allowed") }

// The other fixed exceptions.
var (
	ErrStateMissing   = authErr("AuthStateMissing", "Session value state missing.")
	ErrStateForbidden = authErr("AuthStateForbidden", "Wrong state parameter given.")
	ErrUnreachable    = authErr("AuthUnreachableProvider", "The authentication provider could not be reached")
	ErrAlreadyInUse   = authErr("AuthAlreadyAssociated", "This account is already in use.")
)

// HTTPError is requests' HTTPError: a status the code did not map.
type HTTPError struct {
	Status int
	URL    string
	Body   string
}

func (e *HTTPError) Error() string {
	kind := "Client"
	if e.Status >= 500 {
		kind = "Server"
	}
	return fmt.Sprintf("%d %s Error: %s for url: %s", e.Status, kind, http.StatusText(e.Status), e.URL)
}

// Client makes the provider calls: a 5 second timeout, TLS verified unless
// told otherwise, redirects followed.
type Client struct {
	HTTP *http.Client
}

// NewClient returns a client; verify false turns certificate checks off.
func NewClient(verify bool) *Client {
	tr := http.DefaultTransport.(*http.Transport).Clone()
	tr.DialContext = (&net.Dialer{Timeout: 5 * time.Second}).DialContext
	tr.ResponseHeaderTimeout = 5 * time.Second
	if !verify {
		tr.TLSClientConfig = &tls.Config{InsecureSkipVerify: true}
	}
	return &Client{HTTP: &http.Client{Transport: tr, Timeout: 30 * time.Second}}
}

// Do sends a request with the User-Agent, returning the body; a status of
// 400 or more is an *HTTPError, a failed connection "Connection error".
func (c *Client) Do(ctx context.Context, method, u string, headers map[string]string, body io.Reader) (int, []byte, error) {
	req, err := http.NewRequestWithContext(ctx, method, u, body)
	if err != nil {
		return 0, nil, err
	}
	req.Header.Set("User-Agent", UserAgent)
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := c.HTTP.Do(req)
	if err != nil {
		var ue *url.Error
		if errors.As(err, &ue) && ue.Timeout() {
			return 0, nil, fmt.Errorf("read timed out: %w", err)
		}
		return 0, nil, authErr("AuthConnectionError", "Connection error: %v", err)
	}
	defer resp.Body.Close()
	b, err := io.ReadAll(io.LimitReader(resp.Body, 16<<20))
	if err != nil {
		return resp.StatusCode, nil, err
	}
	if resp.StatusCode >= 400 {
		return resp.StatusCode, b, &HTTPError{Status: resp.StatusCode, URL: u, Body: string(b)}
	}
	return resp.StatusCode, b, nil
}

// GetJSON is get_json.
func (c *Client) GetJSON(ctx context.Context, u string, headers map[string]string) (any, error) {
	_, b, err := c.Do(ctx, http.MethodGet, u, headers, nil)
	if err != nil {
		return nil, err
	}
	return DecodeJSON(b)
}

// DecodeJSON decodes keeping numbers exact.
func DecodeJSON(b []byte) (any, error) {
	dec := json.NewDecoder(bytes.NewReader(b))
	dec.UseNumber()
	var v any
	if err := dec.Decode(&v); err != nil {
		return nil, fmt.Errorf("Expecting value: %v", err)
	}
	return v, nil
}

// HTTPStatusError is handle_http_errors: 400 canceled, 401/403 forbidden,
// 503 unreachable, anything else as it was.
func HTTPStatusError(err error) error {
	var he *HTTPError
	if !errors.As(err, &he) {
		return err
	}
	switch he.Status {
	case 400:
		return AuthCanceled("")
	case 401, 403:
		return AuthForbidden()
	case 503:
		return ErrUnreachable
	}
	return err
}

// Param is one query or form parameter, kept in order.
type Param struct{ Key, Value string }

// Params is an ordered parameter list with dict.update semantics.
type Params []Param

// Set replaces key in place or appends it.
func (p *Params) Set(k, v string) {
	for i := range *p {
		if (*p)[i].Key == k {
			(*p)[i].Value = v
			return
		}
	}
	*p = append(*p, Param{k, v})
}

// Get is the value of k.
func (p Params) Get(k string) (string, bool) {
	for _, x := range p {
		if x.Key == k {
			return x.Value, true
		}
	}
	return "", false
}

// quotePlus is urllib's quote_plus with no safe characters.
func quotePlus(s string) string {
	return strings.ReplaceAll(url.QueryEscape(s), "%7E", "~")
}

// Encode is urlencode.
func (p Params) Encode() string {
	parts := make([]string, len(p))
	for i, x := range p {
		parts[i] = quotePlus(x.Key) + "=" + quotePlus(x.Value)
	}
	return strings.Join(parts, "&")
}

// parseQS is parse_qs keeping the first value of each key and dropping
// blank ones, in order.
func parseQS(q string) Params {
	var out Params
	for _, part := range strings.FieldsFunc(q, func(r rune) bool { return r == '&' || r == ';' }) {
		k, v, _ := strings.Cut(part, "=")
		k, _ = url.QueryUnescape(strings.ReplaceAll(k, "+", " "))
		v, _ = url.QueryUnescape(strings.ReplaceAll(v, "+", " "))
		if v == "" {
			continue
		}
		if _, seen := out.Get(k); !seen {
			out = append(out, Param{k, v})
		}
	}
	return out
}

// pyUnquote is urllib.parse.unquote: %XX decoded, + left alone.
func pyUnquote(s string) string {
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		if s[i] == '%' && i+2 < len(s) && isHex(s[i+1]) && isHex(s[i+2]) {
			var v byte
			fmt.Sscanf(s[i+1:i+3], "%02x", &v)
			b.WriteByte(v)
			i += 2
			continue
		}
		b.WriteByte(s[i])
	}
	return b.String()
}

func isHex(c byte) bool {
	return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')
}

// URLAddParameters is url_add_parameters: the URL's own query (first
// values, blanks dropped) updated with params, then, for the backends
// without REDIRECT_STATE, percent-decoded whole.
func URLAddParameters(u string, params Params, unquote bool) string {
	base, query, hasQ := strings.Cut(u, "?")
	frag := ""
	if hasQ {
		query, frag, _ = strings.Cut(query, "#")
	} else {
		base, frag, _ = strings.Cut(base, "#")
	}
	merged := parseQS(query)
	for _, p := range params {
		merged.Set(p.Key, p.Value)
	}
	q := merged.Encode()
	if unquote {
		q = pyUnquote(q)
	}
	out := base
	if q != "" {
		out += "?" + q
	}
	if frag != "" {
		out += "#" + frag
	}
	return out
}

const randomChars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

// RandomString is get_random_string(n) over [a-zA-Z0-9].
func RandomString(n int) string {
	b := make([]byte, n)
	max := big.NewInt(int64(len(randomChars)))
	for i := range b {
		x, _ := rand.Int(rand.Reader, max)
		b[i] = randomChars[x.Int64()]
	}
	return string(b)
}

// ProcessError is process_error over the callback or token data.
func ProcessError(get func(string) (string, bool)) error {
	if e, ok := get("error"); ok && e != "" {
		desc, _ := get("error_description")
		if strings.Contains(e, "denied") || strings.Contains(e, "cancelled") {
			return AuthCanceled(desc)
		}
		if desc == "" {
			desc = e
		}
		return AuthFailed(desc)
	}
	if d, ok := get("denied"); ok {
		return AuthCanceled(d)
	}
	return nil
}

// mapGetter reads a decoded JSON object as process_error does.
func mapGetter(m map[string]any) func(string) (string, bool) {
	return func(k string) (string, bool) {
		v, ok := m[k]
		if !ok {
			return "", false
		}
		if v == nil {
			return "", true
		}
		return PyStr(v), true
	}
}

// TokenRequest is the authorization code exchange.
type TokenRequest struct {
	URL    string
	Form   Params
	Basic  *[2]string
	Client *Client
}

// Exchange posts the form and returns the token JSON, with the error
// mapping of request_access_token and handle_http_errors.
func (t *TokenRequest) Exchange(ctx context.Context) (map[string]any, error) {
	headers := map[string]string{"Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json"}
	if t.Basic != nil {
		// requests' HTTPBasicAuth: the id and secret as they are.
		headers["Authorization"] = "Basic " + base64.StdEncoding.EncodeToString([]byte(t.Basic[0]+":"+t.Basic[1]))
	}
	_, b, err := t.Client.Do(ctx, http.MethodPost, t.URL, headers, strings.NewReader(t.Form.Encode()))
	if err != nil {
		var he *HTTPError
		if errors.As(err, &he) && he.Status == 401 {
			return nil, AuthTokenError("Invalid key/secret, perhaps expired")
		}
		return nil, HTTPStatusError(err)
	}
	v, err := DecodeJSON(b)
	if err != nil {
		return nil, err
	}
	m, ok := v.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("token response is not an object")
	}
	if err := ProcessError(mapGetter(m)); err != nil {
		return nil, err
	}
	return m, nil
}

// GetUserNames is BaseAuth.get_user_names.
func GetUserNames(fullname, first, last string) (string, string, string) {
	if fullname != "" && first == "" && last == "" {
		if f, l, ok := strings.Cut(fullname, " "); ok {
			first, last = f, l
		} else {
			first = fullname
		}
	}
	if fullname == "" {
		fullname = first + " " + last
	}
	return strings.TrimSpace(fullname), strings.TrimSpace(first), strings.TrimSpace(last)
}

// str is the string value of a claim, "" when absent or not a string.
func str(m map[string]any, k string) string {
	s, _ := m[k].(string)
	return s
}

// sortedKeys of a map.
func sortedKeys(m map[string]any) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}
