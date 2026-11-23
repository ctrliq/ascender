package netbox

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/ctrliq/ascender/internal/netguard"
)

const (
	// DefaultPageSize is the objects fetched per page. NetBox caps a page
	// at MAX_PAGE_SIZE, 1000 by default, and silently clamps a larger ask.
	DefaultPageSize = 500
	// DefaultTimeout bounds one request, headers and body.
	DefaultTimeout = 60 * time.Second
	// DefaultRetries is how many times an idempotent GET is tried on a
	// connection error, a 429 or a 5xx.
	DefaultRetries = 3
	// MaxBackoff is the longest a retry waits, including when NetBox asks
	// for longer. A 429 from nginx or Cloudflare carries values like 3600,
	// and this wait holds the inventory update with nothing in its output.
	MaxBackoff = 30 * time.Second
	// ChangelogPath is the object change log (under /api/extras/ before
	// NetBox 4.0).
	ChangelogPath = "/api/core/object-changes/"

	userAgent = "ascender-netbox-integration"
	// maxBody bounds a response. The API schema is about 15 MB on NetBox
	// 4.7; nothing else comes close.
	maxBody = 64 << 20
)

// MinimumVersion is the oldest NetBox this integration targets.
var MinimumVersion = [2]int{4, 6}

// Error is a failure talking to NetBox, worded for the operator reading a
// failed inventory update: which URL, which status, what to change.
type Error struct{ Msg string }

func (e *Error) Error() string { return e.Msg }

// AuthError is an Error for rejected credentials (HTTP 401 or 403). It is
// never retried, because retrying would not change the answer.
type AuthError struct{ Msg string }

func (e *AuthError) Error() string { return e.Msg }

func errorf(format string, args ...any) error { return &Error{Msg: fmt.Sprintf(format, args...)} }

// API is what the filter check and the changelog gate need of a client.
// Client implements it; tests use fakes.
type API interface {
	// BaseURL is the normalised NetBox URL, with a trailing slash.
	BaseURL() string
	// Version is the NetBox version from /api/status/, "" when NetBox
	// answers without one.
	Version(ctx context.Context) (string, error)
	// Get fetches one JSON object.
	Get(ctx context.Context, path string, params url.Values) (map[string]any, error)
	// Paginate fetches every result of a list endpoint.
	Paginate(ctx context.Context, path string, params url.Values) ([]map[string]any, error)
}

// Client talks to one NetBox over its REST API.
type Client struct {
	base      *url.URL
	token     string
	http      *http.Client
	transport *http.Transport
	retries   int
	// Logf receives the warnings an operator should see in the job output:
	// a retry, a pagination link pointing elsewhere, an unreadable
	// version. Nil discards them.
	Logf func(format string, args ...any)

	version *string
	sleep   func(context.Context, time.Duration) error
}

// NewClient makes a client for the NetBox at rawURL, the credential's host
// field: a scheme is assumed https when missing, a path keeps a NetBox
// served under a prefix, and nothing after the path is kept. token is sent
// as "Authorization: Token ..." when set; verifySSL false accepts any
// certificate.
func NewClient(rawURL, token string, verifySSL bool) (*Client, error) {
	if strings.TrimSpace(rawURL) == "" {
		return nil, errorf("A NetBox URL is required.")
	}
	raw := strings.TrimSpace(rawURL)
	if !strings.Contains(raw, "://") {
		raw = "https://" + raw
	}
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" {
		return nil, errorf("NetBox URL %q could not be read.", rawURL)
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return nil, errorf("NetBox URL must be http or https, got %q.", rawURL)
	}
	base := &url.URL{Scheme: u.Scheme, Host: u.Host, Path: strings.TrimRight(u.Path, "/") + "/"}
	c := &Client{base: base, token: token, retries: DefaultRetries, sleep: sleepContext}
	c.transport, c.http = newHTTPClient(verifySSL, DefaultTimeout)
	return c, nil
}

// SetProxy replaces how a request's proxy is chosen, which defaults to the
// process environment (HTTP_PROXY, HTTPS_PROXY, NO_PROXY). The task process
// passes the proxy ASCENDER_TASK_ENV sets. The metadata check on the target
// stays in place either way.
func (c *Client) SetProxy(proxy func(*http.Request) (*url.URL, error)) {
	c.transport.Proxy = guardedProxy(proxy)
}

// newHTTPClient is the transport of an outbound request a credential admin
// aims: no cloud metadata address, directly or through a proxy (netguard),
// the proxy from the environment as the old requests-based client used
// (HTTP_PROXY, HTTPS_PROXY, NO_PROXY, set through ASCENDER_TASK_ENV), and no
// redirects followed. A redirect is the other way the far end chooses the
// next address, so the caller is told where it pointed and puts that in
// the credential instead.
func newHTTPClient(verifySSL bool, timeout time.Duration) (*http.Transport, *http.Client) {
	tr := http.DefaultTransport.(*http.Transport).Clone()
	tr.TLSClientConfig = &tls.Config{InsecureSkipVerify: !verifySSL} //nolint:gosec // the credential's verify_ssl, off by choice
	tr.Proxy = guardedProxy(http.ProxyFromEnvironment)
	tr.DialContext = netguard.Dialer(timeout).DialContext
	return tr, &http.Client{Transport: tr, Timeout: timeout, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
}

// guardedProxy is a proxy chooser with the metadata check on the target:
// through a proxy the dial guard only ever sees the proxy's address.
func guardedProxy(proxy func(*http.Request) (*url.URL, error)) func(*http.Request) (*url.URL, error) {
	return func(r *http.Request) (*url.URL, error) {
		p, err := proxy(r)
		if err != nil || p == nil {
			return p, err
		}
		if err := netguard.CheckHost(r.Context(), r.URL.Hostname()); err != nil {
			return nil, err
		}
		return p, nil
	}
}

func sleepContext(ctx context.Context, d time.Duration) error {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-t.C:
		return nil
	}
}

// BaseURL is the normalised URL, with a trailing slash.
func (c *Client) BaseURL() string { return c.base.String() }

func (c *Client) logf(format string, args ...any) {
	if c.Logf != nil {
		c.Logf(format, args...)
	}
}

// resolve joins a path, which may carry a query, onto the base URL.
func (c *Client) resolve(path string) (*url.URL, error) {
	ref, err := url.Parse(strings.TrimLeft(path, "/"))
	if err != nil {
		return nil, errorf("NetBox path %q could not be read.", path)
	}
	return c.base.ResolveReference(ref), nil
}

// origin is (scheme, lowercase host, port) with the default port filled in,
// so https://host and https://host:443 compare equal.
func origin(u *url.URL) (string, string, string) {
	port := u.Port()
	if port == "" {
		switch u.Scheme {
		case "http":
			port = "80"
		case "https":
			port = "443"
		}
	}
	return u.Scheme, strings.ToLower(u.Hostname()), port
}

// pinToBase puts a URL NetBox handed back onto the NetBox this client was
// configured for.
//
// NetBox builds the absolute `next` link of a paginated list from the
// incoming request's Host header, so it is not trustworthy twice over. A
// NetBox behind a proxy that does not set X-Forwarded-Host names its own
// internal origin, which would send the API token to a different address
// than the credential named. And a host that is not NetBox at all can put
// anything it likes there, which on the control plane means any address
// the control plane can reach. Either way the only part worth keeping is
// the path and query, which carry the pagination offset and the filters.
// The origin comes from the credential.
//
// The path is kept whole when it already starts with the base path (a
// NetBox under a prefix names the prefix in `next`) and resolved under the
// base otherwise (a proxy that strips the prefix leaves it out).
func (c *Client) pinToBase(next string) string {
	target, err := url.Parse(next)
	if err != nil {
		return next
	}
	if target.Scheme == "" && target.Host == "" {
		return next
	}
	ts, th, tp := origin(target)
	bs, bh, bp := origin(c.base)
	if ts != bs || th != bh || tp != bp {
		c.logf("NetBox returned a pagination link to %s://%s, which is not the %s this source is configured for. Continuing against the configured address.", target.Scheme, target.Host, c.base.Host)
	}
	p := target.Path
	if c.base.Path != "/" && strings.HasPrefix(p, c.base.Path) {
		p = strings.TrimPrefix(p, c.base.Path)
	}
	p = "/" + strings.TrimLeft(p, "/")
	if target.RawQuery != "" {
		p += "?" + target.RawQuery
	}
	return p
}

// request performs one GET with the retry policy: connection errors, 429
// and 5xx are retried with a backoff, 401 and 403 fail at once as
// AuthError, a redirect is refused, and any other 4xx fails with the start
// of the body. The response must be a JSON object.
func (c *Client) request(ctx context.Context, path string, params url.Values) (map[string]any, error) {
	u, err := c.resolve(path)
	if err != nil {
		return nil, err
	}
	if len(params) > 0 {
		q := u.Query()
		for k, vs := range params {
			q.Del(k)
			for _, v := range vs {
				q.Add(k, v)
			}
		}
		u.RawQuery = q.Encode()
	}
	var lastErr error
	for attempt := 1; attempt <= c.retries; attempt++ {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
		if err != nil {
			return nil, errorf("NetBox request for %s could not be built: %v", path, err)
		}
		req.Header.Set("Accept", "application/json")
		req.Header.Set("User-Agent", userAgent)
		if c.token != "" {
			req.Header.Set("Authorization", "Token "+c.token)
		}
		resp, err := c.http.Do(req)
		if err != nil {
			if ctx.Err() != nil {
				return nil, ctx.Err()
			}
			lastErr = err
			if attempt == c.retries {
				break
			}
			if err := c.backoff(ctx, attempt, "connection error", nil); err != nil {
				return nil, err
			}
			continue
		}
		body, readErr := io.ReadAll(io.LimitReader(resp.Body, maxBody))
		_ = resp.Body.Close()
		code := resp.StatusCode
		switch {
		case code == http.StatusUnauthorized || code == http.StatusForbidden:
			return nil, &AuthError{Msg: fmt.Sprintf("NetBox rejected the credentials for GET %s (HTTP %d).", path, code)}
		case code == http.StatusTooManyRequests || code >= 500:
			if attempt == c.retries {
				return nil, errorf("NetBox returned HTTP %d for GET %s after %d attempts.", code, path, attempt)
			}
			if err := c.backoff(ctx, attempt, fmt.Sprintf("HTTP %d", code), resp); err != nil {
				return nil, err
			}
			continue
		case code >= 300 && code < 400:
			location := resp.Header.Get("Location")
			if location == "" {
				location = "an unnamed location"
			}
			return nil, errorf("NetBox redirected GET %s to %s. Set the credential URL to the address NetBox actually serves.", path, location)
		case code >= 400:
			text := string(body)
			if len(text) > 500 {
				text = text[:500]
			}
			return nil, errorf("NetBox returned HTTP %d for GET %s: %s", code, path, text)
		}
		if readErr != nil {
			return nil, errorf("Reading the NetBox response for GET %s failed: %v", path, readErr)
		}
		var out map[string]any
		dec := json.NewDecoder(strings.NewReader(string(body)))
		dec.UseNumber()
		if err := dec.Decode(&out); err != nil {
			return nil, errorf("NetBox returned something other than a JSON object for GET %s: %v", path, err)
		}
		return out, nil
	}
	return nil, errorf("Could not reach NetBox at %s after %d attempts: %v", u.String(), c.retries, lastErr)
}

// backoff waits before a retry: 1s, 2s, 4s... up to MaxBackoff, or
// Retry-After when NetBox sent one, under the same ceiling.
func (c *Client) backoff(ctx context.Context, attempt int, reason string, resp *http.Response) error {
	delay := time.Duration(1<<(attempt-1)) * time.Second
	if delay > MaxBackoff {
		delay = MaxBackoff
	}
	if resp != nil {
		if n, err := strconv.Atoi(strings.TrimSpace(resp.Header.Get("Retry-After"))); err == nil {
			asked := min(time.Duration(n)*time.Second, MaxBackoff)
			if asked > delay {
				delay = asked
			}
		}
	}
	c.logf("NetBox request failed (%s), retrying in %ds", reason, int(delay/time.Second))
	return c.sleep(ctx, delay)
}

// Get fetches one JSON object.
func (c *Client) Get(ctx context.Context, path string, params url.Values) (map[string]any, error) {
	return c.request(ctx, path, params)
}

// Paginate fetches every result of a list endpoint across NetBox's offset
// pagination. The `next` link's path and query are followed, so the offset
// and the filters stay applied, but the origin always comes from the
// credential (pinToBase). A detail endpoint, which has no results list, is
// returned as its one object.
func (c *Client) Paginate(ctx context.Context, path string, params url.Values) ([]map[string]any, error) {
	q := url.Values{}
	for k, v := range params {
		q[k] = v
	}
	if q.Get("limit") == "" {
		q.Set("limit", strconv.Itoa(DefaultPageSize))
	}
	var out []map[string]any
	next := path
	for next != "" {
		payload, err := c.request(ctx, next, q)
		if err != nil {
			return nil, err
		}
		results, ok := payload["results"].([]any)
		if !ok {
			if payload["results"] == nil {
				return []map[string]any{payload}, nil
			}
			return nil, errorf("NetBox returned an unexpected results list for GET %s.", path)
		}
		for _, r := range results {
			if m, ok := r.(map[string]any); ok {
				out = append(out, m)
			}
		}
		next = ""
		if s, ok := payload["next"].(string); ok && s != "" {
			next = c.pinToBase(s)
		}
		// `next` carries its own query string; sending the parameters again
		// would duplicate limit and offset.
		q = nil
	}
	return out, nil
}

// Version is the NetBox version string from /api/status/, read once. A
// failure reading it is not something to carry on from: the URL is wrong,
// the token is wrong or NetBox is not up, and every request after it would
// fail the same way, so the error is returned for the job output rather
// than swallowed. A NetBox that answers without a version is a different
// case and gives "".
func (c *Client) Version(ctx context.Context) (string, error) {
	if c.version != nil {
		return *c.version, nil
	}
	status, err := c.Get(ctx, "/api/status/", nil)
	if err != nil {
		return "", err
	}
	v := ""
	if x, ok := status["netbox-version"]; ok && x != nil {
		v = str(x)
	}
	c.version = &v
	return v, nil
}

// versionTuple is (major, minor) of a version string, or ok false when the
// first two components are not numbers.
func versionTuple(v string) (major, minor int, ok bool) {
	parts := strings.Split(v, ".")
	if len(parts) > 2 {
		parts = parts[:2]
	}
	nums := make([]int, 0, 2)
	for _, p := range parts {
		n, err := strconv.Atoi(p)
		if err != nil {
			return 0, 0, false
		}
		nums = append(nums, n)
	}
	if len(nums) == 0 {
		return 0, 0, false
	}
	if len(nums) == 1 {
		return nums[0], 0, true
	}
	return nums[0], nums[1], true
}

// RequireSupportedVersion fails early and clearly on a NetBox older than
// MinimumVersion, and returns the version. A NetBox that reports no
// version is let through with a warning.
func (c *Client) RequireSupportedVersion(ctx context.Context) (string, error) {
	v, err := c.Version(ctx)
	if err != nil {
		return "", err
	}
	major, minor, ok := versionTuple(v)
	if ok && (major < MinimumVersion[0] || (major == MinimumVersion[0] && minor < MinimumVersion[1])) {
		return "", errorf("NetBox %s is too old for this integration, which needs %d.%d or newer.", v, MinimumVersion[0], MinimumVersion[1])
	}
	if !ok {
		c.logf("Could not determine the NetBox version; continuing and assuming %d.%d or newer.", MinimumVersion[0], MinimumVersion[1])
	}
	return v, nil
}
