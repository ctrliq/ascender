package netbox

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

// Most of these are about what a failure looks like in the job output. A
// sync that cannot read /api/status/ is finished, and the operator needs
// the one line that says why: wrong URL, rejected token, or NetBox not
// answering.

type reply struct {
	status  int
	body    string
	headers map[string]string
}

// fakeNetBox answers each request with the next queued reply, repeating
// the last one, and records what was asked.
type fakeNetBox struct {
	mu       sync.Mutex
	replies  []reply
	requests []*http.Request
	srv      *httptest.Server
}

func newFakeNetBox(t *testing.T, replies ...reply) *fakeNetBox {
	t.Helper()
	f := &fakeNetBox{replies: replies}
	f.srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		f.mu.Lock()
		f.requests = append(f.requests, r.Clone(context.Background()))
		n := len(f.requests)
		f.mu.Unlock()
		rep := f.replies[min(n, len(f.replies))-1]
		for k, v := range rep.headers {
			w.Header().Set(k, v)
		}
		status := rep.status
		if status == 0 {
			status = 200
		}
		w.WriteHeader(status)
		_, _ = w.Write([]byte(rep.body))
	}))
	t.Cleanup(f.srv.Close)
	return f
}

func (f *fakeNetBox) calls() []*http.Request {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]*http.Request(nil), f.requests...)
}

// client is a client for the fake with one attempt per request and no
// real sleeping; slept records the backoffs asked for.
func (f *fakeNetBox) client(t *testing.T, retries int, slept *[]time.Duration) *Client {
	t.Helper()
	c, err := NewClient(f.srv.URL, "t", true)
	if err != nil {
		t.Fatal(err)
	}
	c.retries = retries
	c.sleep = func(_ context.Context, d time.Duration) error {
		if slept != nil {
			*slept = append(*slept, d)
		}
		return nil
	}
	return c
}

func page(results, next string) reply {
	body := `{"results": [` + results + `]`
	if next != "" {
		body += `, "next": "` + next + `"`
	}
	return reply{body: body + `}`}
}

const status475 = `{"netbox-version": "4.7.5"}`

var ctx = context.Background()

// --- version ---------------------------------------------------------------------------

func TestVersionIsReadFromStatus(t *testing.T) {
	c := newFakeNetBox(t, reply{body: status475}).client(t, 1, nil)
	v, err := c.Version(ctx)
	if err != nil || v != "4.7.5" {
		t.Fatalf("%q, %v", v, err)
	}
	if major, minor, ok := versionTuple(v); !ok || major != 4 || minor != 7 {
		t.Fatalf("%d.%d %v", major, minor, ok)
	}
}

func TestVersionIsReadOnce(t *testing.T) {
	f := newFakeNetBox(t, reply{body: status475})
	c := f.client(t, 1, nil)
	_, _ = c.Version(ctx)
	_, _ = c.Version(ctx)
	if _, err := c.RequireSupportedVersion(ctx); err != nil {
		t.Fatal(err)
	}
	if n := len(f.calls()); n != 1 {
		t.Fatalf("%d requests", n)
	}
}

func TestARejectedTokenSurfacesRatherThanBeingSwallowed(t *testing.T) {
	c := newFakeNetBox(t, reply{status: 403}).client(t, 1, nil)
	_, err := c.Version(ctx)
	if !isAuthError(err) || !strings.Contains(err.Error(), "rejected the credentials") {
		t.Fatalf("%v", err)
	}
}

func TestAnUnreachableNetBoxSurfacesRatherThanBeingSwallowed(t *testing.T) {
	f := newFakeNetBox(t, reply{body: status475})
	c := f.client(t, 1, nil)
	f.srv.Close()
	_, err := c.Version(ctx)
	if err == nil || !strings.Contains(err.Error(), "Could not reach NetBox") {
		t.Fatalf("%v", err)
	}
}

func TestRequireSupportedVersionStopsOnAnOldRelease(t *testing.T) {
	c := newFakeNetBox(t, reply{body: `{"netbox-version": "4.5.9"}`}).client(t, 1, nil)
	_, err := c.RequireSupportedVersion(ctx)
	if err == nil || !strings.Contains(err.Error(), "4.5.9 is too old") || !strings.Contains(err.Error(), "4.6 or newer") {
		t.Fatalf("%v", err)
	}
}

// Answering without a version is not the same as not answering.
func TestRequireSupportedVersionAllowsANetBoxThatReportsNone(t *testing.T) {
	var warned []string
	c := newFakeNetBox(t, reply{body: `{}`}).client(t, 1, nil)
	c.Logf = func(f string, a ...any) { warned = append(warned, f) }
	v, err := c.RequireSupportedVersion(ctx)
	if err != nil || v != "" {
		t.Fatalf("%q, %v", v, err)
	}
	if _, _, ok := versionTuple(""); ok {
		t.Fatal("empty version parsed")
	}
	if len(warned) != 1 {
		t.Fatalf("warnings: %v", warned)
	}
}

func TestRequireSupportedVersionAllowsACurrentRelease(t *testing.T) {
	c := newFakeNetBox(t, reply{body: status475}).client(t, 1, nil)
	if v, err := c.RequireSupportedVersion(ctx); err != nil || v != "4.7.5" {
		t.Fatalf("%q, %v", v, err)
	}
}

// --- URL handling ------------------------------------------------------------------

func TestURLIsNormalised(t *testing.T) {
	for given, want := range map[string]string{
		"https://netbox.example":  "https://netbox.example/",
		"https://netbox.example/": "https://netbox.example/",
		"netbox.example":          "https://netbox.example/",
		"http://netbox:8080":      "http://netbox:8080/",
		"https://host/netbox/":    "https://host/netbox/",
	} {
		c, err := NewClient(given, "", true)
		if err != nil {
			t.Fatalf("%s: %v", given, err)
		}
		if c.BaseURL() != want {
			t.Errorf("%s: got %s, want %s", given, c.BaseURL(), want)
		}
	}
}

func TestASubpathInstallKeepsItsPrefix(t *testing.T) {
	c, _ := NewClient("https://host/netbox", "", true)
	u, err := c.resolve("/api/status/")
	if err != nil || u.String() != "https://host/netbox/api/status/" {
		t.Fatalf("%v %v", u, err)
	}
}

func TestBadURLsAreRejected(t *testing.T) {
	for _, bad := range []string{"", "   ", "ftp://netbox.example", "https://"} {
		if _, err := NewClient(bad, "", true); err == nil {
			t.Errorf("%q accepted", bad)
		}
	}
}

// --- retries ------------------------------------------------------------------------

func TestServerErrorsAreRetried(t *testing.T) {
	f := newFakeNetBox(t, reply{status: 503}, reply{body: status475})
	var slept []time.Duration
	c := f.client(t, 2, &slept)
	if v, err := c.Version(ctx); err != nil || v != "4.7.5" {
		t.Fatalf("%q, %v", v, err)
	}
	if n := len(f.calls()); n != 2 {
		t.Fatalf("%d requests", n)
	}
	if len(slept) != 1 || slept[0] != time.Second {
		t.Fatalf("slept %v", slept)
	}
}

func TestARejectedTokenIsNotRetried(t *testing.T) {
	f := newFakeNetBox(t, reply{status: 403})
	if _, err := f.client(t, 3, nil).Version(ctx); !isAuthError(err) {
		t.Fatalf("%v", err)
	}
	if n := len(f.calls()); n != 1 {
		t.Fatalf("%d requests", n)
	}
}

func TestAClientErrorIsNotRetried(t *testing.T) {
	f := newFakeNetBox(t, reply{status: 400, body: `{"detail": "bad filter"}`})
	_, err := f.client(t, 3, nil).Get(ctx, "/api/dcim/devices/", nil)
	if err == nil || !strings.Contains(err.Error(), "HTTP 400") || !strings.Contains(err.Error(), "bad filter") {
		t.Fatalf("%v", err)
	}
	if n := len(f.calls()); n != 1 {
		t.Fatalf("%d requests", n)
	}
}

func TestAServerErrorOnTheLastAttemptIsReported(t *testing.T) {
	f := newFakeNetBox(t, reply{status: 502})
	_, err := f.client(t, 2, nil).Version(ctx)
	if err == nil || !strings.Contains(err.Error(), "HTTP 502") || !strings.Contains(err.Error(), "after 2 attempts") {
		t.Fatalf("%v", err)
	}
}

// NetBox behind a rate limiter answers 429 with values like 3600.
func TestRetryAfterCannotParkTheJobBeyondTheBackoffCeiling(t *testing.T) {
	f := newFakeNetBox(t, reply{status: 429, headers: map[string]string{"Retry-After": "3600"}}, reply{body: status475})
	var slept []time.Duration
	if v, err := f.client(t, 2, &slept).Version(ctx); err != nil || v != "4.7.5" {
		t.Fatalf("%q, %v", v, err)
	}
	if len(slept) != 1 || slept[0] != 30*time.Second {
		t.Fatalf("slept %v", slept)
	}
}

// --- headers --------------------------------------------------------------------------

func TestTheTokenIsSentWhenThereIsOne(t *testing.T) {
	f := newFakeNetBox(t, reply{body: `{}`})
	_, _ = f.client(t, 1, nil).Get(ctx, "/api/status/", nil)
	r := f.calls()[0]
	if r.Header.Get("Authorization") != "Token t" || r.Header.Get("Accept") != "application/json" {
		t.Fatalf("%v", r.Header)
	}
}

func TestNoAuthorizationHeaderWithoutAToken(t *testing.T) {
	f := newFakeNetBox(t, reply{body: `{}`})
	c, _ := NewClient(f.srv.URL, "", true)
	_, _ = c.Get(ctx, "/api/status/", nil)
	if h := f.calls()[0].Header.Get("Authorization"); h != "" {
		t.Fatalf("%q", h)
	}
}

// --- following what NetBox hands back ---------------------------------------------
//
// `next` and a redirect Location are both chosen by whatever answered the
// last request. Followed as given they let that host move this client to
// any address it likes, which matters more than usual because the fetch
// runs on the control plane rather than inside an execution environment.

func ids(objects []map[string]any) []string {
	out := make([]string, len(objects))
	for i, o := range objects {
		out[i] = idKey(o["id"])
	}
	return out
}

func TestPaginationFollowsNextOnTheSameHost(t *testing.T) {
	f := newFakeNetBox(t)
	f.replies = []reply{page(`{"id": 1}`, f.srv.URL+"/api/dcim/devices/?offset=1"), page(`{"id": 2}`, "")}
	objects, err := f.client(t, 1, nil).Paginate(ctx, "/api/dcim/devices/", nil)
	if err != nil {
		t.Fatal(err)
	}
	equalStrings(t, ids(objects), []string{"1", "2"})
	calls := f.calls()
	if calls[0].URL.Query().Get("limit") != "500" {
		t.Fatalf("first request %s", calls[0].URL)
	}
	if calls[1].URL.RequestURI() != "/api/dcim/devices/?offset=1" {
		t.Fatalf("second request %s", calls[1].URL.RequestURI())
	}
}

// https://host and https://host:443 are the same origin.
func TestANextWithThePortSpelledOutIsTheSameOrigin(t *testing.T) {
	c, _ := NewClient("https://netbox.example", "", true)
	var warned []string
	c.Logf = func(f string, a ...any) { warned = append(warned, f) }
	if got := c.pinToBase("https://netbox.example:443/api/dcim/devices/?offset=1"); got != "/api/dcim/devices/?offset=1" {
		t.Fatalf("%q", got)
	}
	if len(warned) != 0 {
		t.Fatalf("warned: %v", warned)
	}
}

// The path and query survive; the origin never does.
func TestANextPointingElsewhereIsPulledBackToTheConfiguredHost(t *testing.T) {
	for _, next := range []string{
		"http://169.254.169.254/latest/meta-data/iam/security-credentials/",
		"http://127.0.0.1:6379/",
		"http://10.0.0.5:8080/internal/",
		"https://attacker.example/api/dcim/devices/",
		"https://netbox.example.evil.test/api/dcim/devices/",
		"http://netbox.example/api/dcim/devices/",       // scheme downgrade
		"https://netbox.example:8443/api/dcim/devices/", // different port
	} {
		f := newFakeNetBox(t, page(`{"id": 1}`, next), page(`{"id": 2}`, ""))
		var warned []string
		c := f.client(t, 1, nil)
		c.Logf = func(format string, a ...any) { warned = append(warned, format) }
		objects, err := c.Paginate(ctx, "/api/dcim/devices/", nil)
		if err != nil {
			t.Fatalf("%s: %v", next, err)
		}
		equalStrings(t, ids(objects), []string{"1", "2"})
		calls := f.calls()
		if len(calls) != 2 {
			t.Fatalf("%s: %d requests", next, len(calls))
		}
		second := calls[1].URL.RequestURI()
		for _, hostile := range []string{"169.254.169.254", "127.0.0.1", "10.0.0.5", "attacker.example", "evil.test", ":8443"} {
			if strings.Contains(second, hostile) {
				t.Errorf("%s: second request %s", next, second)
			}
		}
		if len(warned) != 1 || !strings.Contains(warned[0], "pagination link") {
			t.Errorf("%s: warnings %v", next, warned)
		}
	}
}

// A NetBox behind a proxy with no X-Forwarded-Host names itself in `next`.
func TestTheInternalOriginOfAProxiedNetBoxIsCorrected(t *testing.T) {
	f := newFakeNetBox(t, page(`{"id": 1}`, "http://netbox:8080/api/dcim/devices/?limit=500&offset=500"), page(`{"id": 2}`, ""))
	objects, err := f.client(t, 1, nil).Paginate(ctx, "/api/dcim/devices/", nil)
	if err != nil {
		t.Fatal(err)
	}
	equalStrings(t, ids(objects), []string{"1", "2"})
	if got := f.calls()[1].URL.RequestURI(); got != "/api/dcim/devices/?limit=500&offset=500" {
		t.Fatalf("%s", got)
	}
}

// A NetBox under a prefix names the prefix in `next`; a proxy that strips
// it leaves it out. Both land on the configured base.
func TestASubpathInstallsNextIsNotDoubled(t *testing.T) {
	c, _ := NewClient("https://host/netbox/", "", true)
	for _, next := range []string{"https://host/netbox/api/dcim/devices/?offset=5", "http://internal:8080/api/dcim/devices/?offset=5"} {
		u, err := c.resolve(c.pinToBase(next))
		if err != nil || u.String() != "https://host/netbox/api/dcim/devices/?offset=5" {
			t.Fatalf("%s -> %v %v", next, u, err)
		}
	}
}

func TestARedirectIsRefusedRatherThanFollowed(t *testing.T) {
	f := newFakeNetBox(t, reply{status: 302, headers: map[string]string{"Location": "http://169.254.169.254/"}})
	_, err := f.client(t, 1, nil).Get(ctx, "/api/status/", nil)
	if err == nil || !strings.Contains(err.Error(), "redirected") || !strings.Contains(err.Error(), "http://169.254.169.254/") {
		t.Fatalf("%v", err)
	}
	// one request, not two: the redirect was never followed
	if n := len(f.calls()); n != 1 {
		t.Fatalf("%d requests", n)
	}
}

func TestADetailEndpointComesBackAsOneObject(t *testing.T) {
	f := newFakeNetBox(t, reply{body: `{"id": 9, "name": "x"}`})
	objects, err := f.client(t, 1, nil).Paginate(ctx, "/api/dcim/devices/9/", nil)
	if err != nil || len(objects) != 1 || idKey(objects[0]["id"]) != "9" {
		t.Fatalf("%v %v", objects, err)
	}
}

func TestSomethingOtherThanJSONIsAnError(t *testing.T) {
	f := newFakeNetBox(t, reply{body: `<html>login</html>`})
	_, err := f.client(t, 1, nil).Version(ctx)
	if err == nil || !strings.Contains(err.Error(), "other than a JSON object") {
		t.Fatalf("%v", err)
	}
}

func TestACancelledContextStopsTheRetries(t *testing.T) {
	f := newFakeNetBox(t, reply{status: 503})
	c := f.client(t, 3, nil)
	cctx, cancel := context.WithCancel(context.Background())
	c.sleep = func(ctx context.Context, _ time.Duration) error { cancel(); return ctx.Err() }
	if _, err := c.Version(cctx); err == nil {
		t.Fatal("no error")
	}
	if n := len(f.calls()); n != 1 {
		t.Fatalf("%d requests", n)
	}
}
