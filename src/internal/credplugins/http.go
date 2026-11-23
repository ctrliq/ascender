package credplugins

import (
	"bytes"
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/ctrliq/ascender/internal/netguard"
)

// maxBody caps what a lookup reads from a server.
const maxBody = 16 << 20

// Test hooks: a dialer that routes every host to a test server, and the
// roots its TLS certificate chains to.
var (
	testDial    func(ctx context.Context, network, addr string) (net.Conn, error)
	testRootCAs *x509.CertPool
)

// httpOpts are the requests keyword arguments a call was made with.
type httpOpts struct {
	// cacert is the PEM text CertFiles wrote out for verify=: the only
	// CAs trusted. Empty leaves verify at its default (the task
	// environment's REQUESTS_CA_BUNDLE, or the system roots).
	cacert string
	// insecure is verify=False.
	insecure bool
	// certPEM and keyPEM are the client certificate (cert=).
	certPEM, keyPEM string
	// connectTimeout and readTimeout are timeout=; zero waits as long as
	// the connection does.
	connectTimeout, readTimeout time.Duration
	// noRedirects is allow_redirects=False.
	noRedirects bool
	// retries is HTTPAdapter(max_retries=n): connection failures are
	// tried again this many times.
	retries int
}

func timeouts(connect, read float64) httpOpts {
	return httpOpts{connectTimeout: secs(connect), readTimeout: secs(read)}
}

func secs(f float64) time.Duration { return time.Duration(f * float64(time.Second)) }

// session is a requests session.
type session struct {
	env    Env
	o      httpOpts
	hc     *http.Client
	header http.Header
}

func newSession(env Env, o httpOpts) (*session, error) {
	tc := &tls.Config{MinVersion: tls.VersionTLS12}
	switch {
	case o.insecure:
		tc.InsecureSkipVerify = true
	case o.cacert != "":
		pool := x509.NewCertPool()
		if !pool.AppendCertsFromPEM([]byte(o.cacert)) {
			return nil, exc("SSLError", "[X509: NO_CERTIFICATE_OR_CRL_FOUND] no certificate or crl found")
		}
		tc.RootCAs = pool
	default:
		// merge_environment_settings: verify=True takes the bundle
		// named in the environment.
		for _, k := range []string{"REQUESTS_CA_BUNDLE", "CURL_CA_BUNDLE"} {
			if path := env.getenv(k); path != "" {
				pem, err := os.ReadFile(path)
				if err != nil {
					return nil, exc("OSError", "Could not find a suitable TLS CA certificate bundle, invalid path: %s", path)
				}
				pool := x509.NewCertPool()
				pool.AppendCertsFromPEM(pem)
				tc.RootCAs = pool
				break
			}
		}
		if tc.RootCAs == nil && testRootCAs != nil {
			tc.RootCAs = testRootCAs
		}
	}
	if o.certPEM != "" {
		key := o.keyPEM
		if key == "" {
			key = o.certPEM
		}
		pair, err := tls.X509KeyPair([]byte(o.certPEM), []byte(key))
		if err != nil {
			return nil, exc("SSLError", "[SSL] PEM lib")
		}
		tc.Certificates = []tls.Certificate{pair}
	}
	// Link-local addresses (169.254.169.254, the cloud metadata services)
	// are never dialed: a lookup's URL is whatever a credential names,
	// and its answer can come back in an error. Checked on the address
	// actually dialed, so a name resolving there is refused too.
	dialer := netguard.Dialer(o.connectTimeout)
	dial := dialer.DialContext
	if testDial != nil {
		dial = testDial
	}
	// Through a proxy the dial guard sees only the proxy's address, so
	// the target is checked before the request goes to it.
	proxy := func(r *http.Request) (*url.URL, error) {
		p, err := env.proxy(r)
		if err != nil || p == nil {
			return p, err
		}
		if err := netguard.CheckHost(r.Context(), r.URL.Hostname()); err != nil {
			return nil, err
		}
		return p, nil
	}
	tr := &http.Transport{
		Proxy:                 proxy,
		DialContext:           dial,
		TLSClientConfig:       tc,
		TLSHandshakeTimeout:   o.connectTimeout,
		ResponseHeaderTimeout: o.readTimeout,
		DisableKeepAlives:     true,
	}
	hc := &http.Client{Transport: tr}
	if o.noRedirects {
		hc.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	} else {
		hc.CheckRedirect = func(req *http.Request, via []*http.Request) error {
			if len(via) > 30 {
				return errTooManyRedirects
			}
			// A redirect to another host does not take the lookup's
			// headers (X-Vault-Token, an API key) with it, nor its body:
			// a 307 or 308 would resend a Vault login or a Conjur API
			// key there, so that redirect is not followed and its
			// response is the answer.
			if req.URL.Host != via[0].URL.Host {
				if req.Response != nil && (req.Response.StatusCode == http.StatusTemporaryRedirect || req.Response.StatusCode == http.StatusPermanentRedirect) && req.ContentLength != 0 {
					return http.ErrUseLastResponse
				}
				for k := range req.Header {
					switch http.CanonicalHeaderKey(k) {
					case "Accept", "Accept-Encoding", "User-Agent", "Content-Type":
					default:
						req.Header.Del(k)
					}
				}
			}
			return nil
		}
	}
	return &session{env: env, o: o, hc: hc, header: http.Header{}}, nil
}

var errTooManyRedirects = errors.New("Exceeded 30 redirects.")

// proxy is requests' proxy selection from the environment: the scheme's
// proxy, or all_proxy, unless no_proxy names the host.
func (e Env) proxy(r *http.Request) (*url.URL, error) {
	get := func(name string) string {
		if v := e.getenv(strings.ToLower(name)); v != "" {
			return v
		}
		return e.getenv(strings.ToUpper(name))
	}
	p := get(r.URL.Scheme + "_proxy")
	if p == "" {
		p = get("all_proxy")
	}
	if p == "" || bypassProxy(r.URL, get("no_proxy")) {
		return nil, nil
	}
	if !strings.Contains(p, "://") {
		p = "http://" + p
	}
	return url.Parse(p)
}

// bypassProxy is should_bypass_proxies.
func bypassProxy(u *url.URL, noProxy string) bool {
	host := u.Hostname()
	hostPort := host
	if u.Port() != "" {
		hostPort += ":" + u.Port()
	}
	ip := net.ParseIP(host)
	for _, entry := range strings.Split(strings.ReplaceAll(noProxy, " ", ""), ",") {
		switch {
		case entry == "":
		case entry == "*":
			return true
		case ip != nil && ip.To4() != nil:
			if _, n, err := net.ParseCIDR(entry); err == nil {
				if n.Contains(ip) {
					return true
				}
			} else if host == entry {
				return true
			}
		default:
			name := strings.TrimPrefix(entry, ".")
			if strings.HasSuffix(host, entry) || strings.HasSuffix(hostPort, entry) || host == name || strings.HasSuffix(host, "."+name) {
				return true
			}
		}
	}
	return false
}

// response is what a lookup read back.
type response struct {
	status int
	reason string
	url    string
	header http.Header
	body   []byte
}

// do sends one request. body is sent as given; a map or slice is sent as
// JSON (json=), url.Values as a form (data=).
func (s *session) do(ctx context.Context, method, rawURL string, header http.Header, body any) (*response, error) {
	u, err := prepareURL(rawURL)
	if err != nil {
		return nil, err
	}
	var payload []byte
	contentType := ""
	switch b := body.(type) {
	case nil:
	case []byte:
		payload = b
	case string:
		payload = []byte(b)
	case url.Values:
		payload = []byte(b.Encode())
		contentType = "application/x-www-form-urlencoded"
	default:
		if payload, err = json.Marshal(b); err != nil {
			return nil, exc("TypeError", "%v", err)
		}
		contentType = "application/json"
	}
	for attempt := 0; ; attempt++ {
		var rd io.Reader
		if body != nil {
			rd = bytes.NewReader(payload)
		}
		req, err := http.NewRequestWithContext(ctx, method, u.String(), rd)
		if err != nil {
			return nil, exc("InvalidURL", "%v", err)
		}
		for k, v := range s.header {
			req.Header[k] = v
		}
		if contentType != "" {
			req.Header.Set("Content-Type", contentType)
		}
		for k, v := range header {
			req.Header[k] = v
		}
		req.Header.Set("Accept", firstNonEmpty(req.Header.Get("Accept"), "*/*"))
		resp, err := s.hc.Do(req)
		if err != nil {
			if ctx.Err() != nil {
				return nil, ctx.Err()
			}
			if attempt < s.o.retries && isConnectFailure(err) {
				continue
			}
			return nil, s.transportError(err, u)
		}
		b, err := io.ReadAll(io.LimitReader(resp.Body, maxBody))
		resp.Body.Close()
		if err != nil {
			if ctx.Err() != nil {
				return nil, ctx.Err()
			}
			return nil, &Exception{Class: "ChunkedEncodingError", Msg: err.Error()}
		}
		reason := strings.TrimSpace(strings.TrimPrefix(resp.Status, strconv.Itoa(resp.StatusCode)))
		return &response{status: resp.StatusCode, reason: reason, url: resp.Request.URL.String(), header: resp.Header, body: b}, nil
	}
}

func firstNonEmpty(a, b string) string {
	if a != "" {
		return a
	}
	return b
}

// isConnectFailure reports a failure to connect, which urllib3 retried.
func isConnectFailure(err error) bool {
	var op *net.OpError
	if errors.As(err, &op) && op.Op == "dial" {
		return true
	}
	var dns *net.DNSError
	return errors.As(err, &dns)
}

// transportError names a failed request by the requests exception it
// raised.
func (s *session) transportError(err error, u *url.URL) error {
	switch {
	case errors.Is(err, errTooManyRedirects):
		return &Exception{Class: "TooManyRedirects", Msg: errTooManyRedirects.Error()}
	case isTLSError(err):
		return &Exception{Class: "SSLError", Msg: err.Error()}
	}
	var op *net.OpError
	if errors.As(err, &op) {
		switch {
		case op.Op == "proxyconnect":
			return &Exception{Class: "ProxyError", Msg: err.Error()}
		case op.Op == "dial" && op.Timeout() && s.o.connectTimeout > 0:
			reason := fmt.Sprintf("Connection to %s timed out. (connect timeout=%s)", u.Hostname(), strconv.FormatFloat(s.o.connectTimeout.Seconds(), 'g', -1, 64))
			return &Exception{Class: "ConnectTimeout", Msg: reason, Reason: reason}
		case op.Op == "dial":
			return &Exception{Class: "ConnectionError", Msg: err.Error()}
		}
	}
	var dns *net.DNSError
	if errors.As(err, &dns) {
		return &Exception{Class: "ConnectionError", Msg: err.Error()}
	}
	var ne net.Error
	if errors.As(err, &ne) && ne.Timeout() {
		return &Exception{Class: "ReadTimeout", Msg: err.Error()}
	}
	return &Exception{Class: "ConnectionError", Msg: err.Error()}
}

func isTLSError(err error) bool {
	var cv *tls.CertificateVerificationError
	var ua x509.UnknownAuthorityError
	var hn x509.HostnameError
	var ci x509.CertificateInvalidError
	var rh tls.RecordHeaderError
	var al tls.AlertError
	return errors.As(err, &cv) || errors.As(err, &ua) || errors.As(err, &hn) || errors.As(err, &ci) || errors.As(err, &rh) || errors.As(err, &al)
}

// raiseForStatus is Response.raise_for_status.
func (r *response) raiseForStatus() error {
	kind := ""
	switch {
	case r.status >= 400 && r.status < 500:
		kind = "Client"
	case r.status >= 500 && r.status < 600:
		kind = "Server"
	default:
		return nil
	}
	return &HTTPError{StatusCode: r.status, Msg: fmt.Sprintf("%d %s Error: %s for url: %s", r.status, kind, r.reason, r.url), body: r.body}
}

// pluginRaiseForStatus is plugin.raise_for_status: a redirect the lookup
// did not follow fails too.
func (r *response) pluginRaiseForStatus() error {
	if err := r.raiseForStatus(); err != nil {
		return err
	}
	if r.status >= 300 {
		return &HTTPError{StatusCode: r.status, body: r.body}
	}
	return nil
}

// json is Response.json().
func (r *response) json() (any, error) { return decodeJSON(r.body) }

// text is Response.text.
func (r *response) text() string { return string(r.body) }

// decodeJSON is json.loads, keeping numbers as written.
func decodeJSON(b []byte) (any, error) {
	d := json.NewDecoder(bytes.NewReader(b))
	d.UseNumber()
	var v any
	if err := d.Decode(&v); err != nil {
		return nil, &Exception{Class: "JSONDecodeError", Msg: "Expecting value: line 1 column 1 (char 0)"}
	}
	if d.More() {
		return nil, &Exception{Class: "JSONDecodeError", Msg: "Extra data"}
	}
	return v, nil
}
