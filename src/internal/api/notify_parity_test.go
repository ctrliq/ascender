package api

import (
	"bufio"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/ctrliq/ascender/internal/auth"
	"github.com/ctrliq/ascender/internal/config"
)

func ntBody(t *testing.T, js string) *OMap {
	t.Helper()
	v, err := decodeOrdered(js)
	if err != nil {
		t.Fatal(err)
	}
	return v.(*OMap)
}

// The optional settings each backend's constructor took are kept with the
// template; keys no backend of the type reads are not.
func TestNotificationOptionalSettingsKept(t *testing.T) {
	s := &Server{}
	ctx := auth.WithUser(context.Background(), &auth.User{ID: 2})
	for _, tc := range []struct {
		typ, config string
		kept        []string
	}{
		{"slack", `{"token": "t", "channels": ["#a"], "hex_color": "#ff0000"}`, []string{"hex_color"}},
		{"grafana", `{"grafana_url": "https://g.example.com", "grafana_key": "k", "dashboardId": "3", "panelId": "", "annotation_tags": ["a"],
			"grafana_no_verify_ssl": true, "isRegion": false}`, []string{"dashboardId", "panelId", "annotation_tags", "grafana_no_verify_ssl", "isRegion"}},
		{"mattermost", `{"mattermost_url": "https://m.example.com/hooks/x", "mattermost_no_verify_ssl": false, "mattermost_channel": "ops",
			"mattermost_username": "bot", "mattermost_icon_url": "https://m.example.com/i.png"}`, []string{"mattermost_channel", "mattermost_username", "mattermost_icon_url"}},
		{"rocketchat", `{"rocketchat_url": "https://r.example.com/hooks/x", "rocketchat_no_verify_ssl": false, "rocketchat_username": "bot",
			"rocketchat_icon_url": "https://r.example.com/i.png"}`, []string{"rocketchat_username", "rocketchat_icon_url"}},
	} {
		// A stray key and another type's optional key beside them.
		cfg := strings.TrimSuffix(tc.config, "}") + `, "url": "https://attacker.example/", "ssl_keyfile": "/etc/ascender/SECRET_KEY", "fail_silently": true`
		if tc.typ != "slack" {
			cfg += `, "hex_color": "#000"`
		}
		cfg += "}"
		out, err := s.validateNotificationTemplate(ctx, ntBody(t, `{"name": "n", "notification_type": "`+tc.typ+`", "notification_configuration": `+cfg+`}`), true, nil)
		if err != nil {
			t.Fatalf("%s: %v", tc.typ, err)
		}
		for _, k := range tc.kept {
			if !out.Config.Has(k) {
				t.Errorf("%s: %s dropped", tc.typ, k)
			}
		}
		for _, k := range []string{"url", "ssl_keyfile", "fail_silently"} {
			if out.Config.Has(k) {
				t.Errorf("%s: kept %s", tc.typ, k)
			}
		}
		if tc.typ != "slack" && out.Config.Has("hex_color") {
			t.Errorf("%s: kept Slack's hex_color", tc.typ)
		}
	}

	// Changing the type takes a new configuration: the old type's optional
	// settings do not come along, and the new one's are kept.
	grafana := &notificationTemplate{ID: 3, Name: "g", NotificationType: "grafana", Configuration: json.RawMessage(`{"grafana_url": "https://g.example.com",
		"grafana_key": "$encrypted$UTF8$AESCBC$QUJD", "dashboardId": "3", "panelId": "4"}`)}
	out, err := s.validateNotificationTemplate(ctx, ntBody(t, `{"notification_type": "slack", "notification_configuration": {"token": "t", "channels": ["#a"],
		"dashboardId": "3", "hex_color": "#abc"}}`), true, grafana)
	if err != nil {
		t.Fatal(err)
	}
	if out.Config.Has("dashboardId") || !out.Config.Has("hex_color") {
		t.Errorf("type change kept %v", out.Config.Keys())
	}

	// A Grafana template saved before its optional settings were kept has
	// no grafana_no_verify_ssl: sending it again as false is no change of
	// destination for the stored key; turning verification off is.
	_, err = s.validateNotificationTemplate(ctx, ntBody(t, `{"notification_configuration": {"grafana_url": "https://g.example.com", "grafana_key": "$encrypted$",
		"dashboardId": "3", "panelId": "4", "grafana_no_verify_ssl": false}}`), true, grafana)
	if err != nil {
		t.Errorf("unchanged destination refused: %v", err)
	}
	_, err = s.validateNotificationTemplate(ctx, ntBody(t, `{"notification_configuration": {"grafana_url": "https://g.example.com", "grafana_key": "$encrypted$",
		"grafana_no_verify_ssl": true}}`), true, grafana)
	if err == nil || !strings.Contains(err.Error(), "Re-enter grafana_key") {
		t.Errorf("verification turned off: %v", err)
	}

	// Errors of the configuration as a whole go under NON_FIELD_ERRORS_KEY.
	_, err = s.validateNotificationTemplate(ctx, ntBody(t, `{"name": "n", "notification_type": "slack", "notification_configuration": {"token": "t"}}`), true, nil)
	if ae, ok := err.(*APIError); !ok || !strings.Contains(fmt.Sprint(ae.Body), "__all__") {
		t.Errorf("missing channels: %v", err)
	}
}

// capture is an HTTP sink that records the requests it gets.
type capture struct {
	mu   sync.Mutex
	reqs []capturedReq
	srv  *httptest.Server
}

type capturedReq struct {
	path   string
	header http.Header
	body   string
}

func newCapture(t *testing.T, handler func(w http.ResponseWriter, r *http.Request)) *capture {
	c := &capture{}
	c.srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		c.mu.Lock()
		c.reqs = append(c.reqs, capturedReq{r.RequestURI, r.Header.Clone(), string(b)})
		c.mu.Unlock()
		if handler != nil {
			handler(w, r)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	t.Cleanup(c.srv.Close)
	return c
}

func (c *capture) got() []capturedReq {
	c.mu.Lock()
	defer c.mu.Unlock()
	return append([]capturedReq(nil), c.reqs...)
}

// What the UI saves for Grafana, Mattermost and Rocket.Chat reaches the
// service: before, the optional settings were dropped on save and every
// Grafana send failed on the missing dashboardId.
func TestNotificationOptionalSettingsSent(t *testing.T) {
	sink := newCapture(t, nil)
	s := &Server{Cfg: &config.Config{Version: "t"}}
	ctx := auth.WithUser(context.Background(), &auth.User{ID: 2, IsSuperuser: true})
	send := func(typ, cfg string) {
		t.Helper()
		out, err := s.validateNotificationTemplate(ctx, ntBody(t, `{"name": "n", "notification_type": "`+typ+`", "notification_configuration": `+cfg+`}`), true, nil)
		if err != nil {
			t.Fatal(err)
		}
		raw, _ := appendJSON(nil, out.Config)
		nt := &notificationTemplate{ID: 1, NotificationType: typ, Configuration: raw}
		if n, err := s.sendNotification(ctx, nt, "subject", `{"started": "2026-01-02T03:04:05.000000+00:00", "finished": null}`); err != nil || n != 1 {
			t.Fatalf("%s: %d, %v", typ, n, err)
		}
	}
	send("grafana", `{"grafana_url": "`+sink.srv.URL+`", "grafana_key": "k", "dashboardId": "3", "panelId": "", "annotation_tags": ["a", "b"],
		"grafana_no_verify_ssl": false, "isRegion": false}`)
	send("mattermost", `{"mattermost_url": "`+sink.srv.URL+`/mm", "mattermost_no_verify_ssl": false, "mattermost_channel": "ops", "mattermost_username": "bot",
		"mattermost_icon_url": "https://example.com/i.png"}`)
	send("rocketchat", `{"rocketchat_url": "`+sink.srv.URL+`/rc", "rocketchat_no_verify_ssl": false, "rocketchat_username": "bot",
		"rocketchat_icon_url": "https://example.com/i.png"}`)
	reqs := sink.got()
	if len(reqs) != 3 {
		t.Fatalf("requests: %+v", reqs)
	}
	ms := time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC).UnixMilli()
	want := []string{
		fmt.Sprintf(`{"time": %d, "timeEnd": %d, "isRegion": false`, ms, ms) + `, "dashboardId": 3, "tags": ["a", "b"], "text": "subject"}`,
		`{"icon_url": "https://example.com/i.png", "channel": "ops", "username": "bot", "text": "subject"}`,
		`{"text": "subject", "icon_url": "https://example.com/i.png", "username": "bot"}`,
	}
	for i, r := range reqs {
		if r.body != want[i] {
			t.Errorf("request %d (%s): %s, want %s", i, r.path, r.body, want[i])
		}
	}
	if reqs[0].path != "/api/annotations" || reqs[0].header.Get("Authorization") != "Bearer k" {
		t.Errorf("grafana request: %s %v", reqs[0].path, reqs[0].header)
	}
}

// Through a proxy the dial guard only sees the proxy, so the target is
// checked before the request is handed over.
func TestNotificationProxyRefusesMetadataTargets(t *testing.T) {
	proxied := newCapture(t, nil)
	pu, _ := url.Parse(proxied.srv.URL)
	old := notifyProxyEnv
	notifyProxyEnv = func(*http.Request) (*url.URL, error) { return pu, nil }
	defer func() { notifyProxyEnv = old }()
	ctx := context.Background()
	for _, u := range []string{"http://169.254.169.254/latest/meta-data/", "http://100.100.100.200/"} {
		conf := NewOMap().Set("http_method", "POST").Set("disable_ssl_verification", false)
		_, err := sendWebhook(ctx, conf, &outMessage{Body: NewOMap(), To: []string{u}})
		if err == nil || !strings.Contains(err.Error(), "refusing") {
			t.Errorf("webhook to %s through a proxy: %v", u, err)
		}
	}
	if n := len(proxied.got()); n != 0 {
		t.Errorf("the proxy was asked %d times", n)
	}
	// An ordinary target goes through the proxy.
	conf := NewOMap().Set("http_method", "POST").Set("disable_ssl_verification", false)
	if n, err := sendWebhook(ctx, conf, &outMessage{Body: NewOMap(), To: []string{"http://example.invalid/hook"}}); err != nil || n != 1 {
		t.Errorf("webhook through the proxy: %d, %v", n, err)
	}
	if r := proxied.got(); len(r) != 1 || r[0].path != "http://example.invalid/hook" {
		t.Errorf("proxied requests: %+v", r)
	}
}

// The request timeout is per connect and per read, as requests' was: a
// server that answers within it each time is waited for even when the
// whole exchange takes longer, and one that goes quiet longer fails.
func TestNotificationTimeoutPerRead(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()
	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			go func(c net.Conn) {
				defer c.Close()
				buf := make([]byte, 4096)
				_, _ = c.Read(buf)
				// Paused for longer than the whole-request budget in sum,
				// never longer than the timeout at once.
				for _, part := range []string{"HTTP/1.1 200 OK\r\n", "Content-Length: 2\r\n", "\r\n", "ok"} {
					time.Sleep(300 * time.Millisecond)
					if _, err := c.Write([]byte(part)); err != nil {
						return
					}
				}
			}(c)
		}
	}()
	conf := NewOMap().Set("http_method", "POST").Set("disable_ssl_verification", false)
	m := &outMessage{Body: NewOMap(), To: []string{"http://" + ln.Addr().String() + "/"}}
	ctx := withNotifyTimeout(context.Background(), 500*time.Millisecond)
	if n, err := sendWebhook(ctx, conf, m); err != nil || n != 1 {
		t.Errorf("slow but steady server: %d, %v", n, err)
	}
	ctx = withNotifyTimeout(context.Background(), 200*time.Millisecond)
	if _, err := sendWebhook(ctx, conf, m); err == nil {
		t.Error("a server quiet for longer than the timeout did not fail the send")
	}
}

// The email timeout is smtplib's: 0 and negative values fail the send with
// its messages.
func TestEmailTimeoutValues(t *testing.T) {
	for _, tc := range []struct {
		timeout float64
		want    string
	}{{0, "Non-blocking socket (timeout=0) is not supported"}, {-1, "Timeout value out of range"}} {
		conf := NewOMap().Set("host", "127.0.0.1").Set("port", json.Number("9")).Set("timeout", json.Number(fmt.Sprint(tc.timeout)))
		if _, err := sendEmail(context.Background(), conf, &outMessage{From: "a@example.com", To: []string{"b@example.com"}}); err == nil || err.Error() != tc.want {
			t.Errorf("timeout %v: %v", tc.timeout, err)
		}
	}
}

// A redirect is followed as the old backend followed it, with its error
// messages; a Location urlparse could not read ends the send.
func TestWebhookRedirects(t *testing.T) {
	ctx := context.Background()
	conf := func() *OMap {
		return NewOMap().Set("http_method", "POST").Set("disable_ssl_verification", false).Set("username", "u").Set("password", "p").
			Set("headers", NewOMap().Set("X-Secret", "s"))
	}
	b64 := func(s string) string { return base64.StdEncoding.EncodeToString([]byte(s)) }
	// To an invalid URL: not followed.
	sink := newCapture(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Location", "http://[::1/next")
		w.WriteHeader(http.StatusMovedPermanently)
	})
	_, err := sendWebhook(ctx, conf(), &outMessage{Body: NewOMap(), To: []string{sink.srv.URL + "/a"}})
	want := fmt.Sprintf("Webhook notification received redirect to an invalid URL %s from %s", b64("http://[::1/next"), b64(sink.srv.URL+"/a"))
	if err == nil || err.Error() != want {
		t.Errorf("invalid redirect: %v, want %s", err, want)
	}
	if n := len(sink.got()); n != 1 {
		t.Errorf("invalid redirect followed: %d requests", n)
	}
	// A port out of range is invalid too.
	sink = newCapture(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Location", "http://127.0.0.1:99999/")
		w.WriteHeader(http.StatusTemporaryRedirect)
	})
	if _, err := sendWebhook(ctx, conf(), &outMessage{Body: NewOMap(), To: []string{sink.srv.URL}}); err == nil || !strings.Contains(err.Error(), "redirect to an invalid URL") {
		t.Errorf("port out of range: %v", err)
	}
	// To nowhere.
	sink = newCapture(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Zz", "1")
		w.WriteHeader(http.StatusMovedPermanently)
	})
	_, err = sendWebhook(ctx, conf(), &outMessage{Body: NewOMap(), To: []string{sink.srv.URL}})
	if err == nil || !strings.HasPrefix(err.Error(), "Webhook notification received redirect to a blank URL from "+b64(sink.srv.URL)+". Response headers={") ||
		!strings.Contains(err.Error(), "'X-Zz': '1'") {
		t.Errorf("blank redirect: %v", err)
	}
	// Around in circles.
	var loop *capture
	loop = newCapture(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Location", loop.srv.URL+"/again")
		w.WriteHeader(http.StatusTemporaryRedirect)
	})
	_, err = sendWebhook(ctx, conf(), &outMessage{Body: NewOMap(), To: []string{loop.srv.URL}})
	if want := "Webhook notification max number of retries [5] exceeded. Failed to send webhook notification to " + b64(loop.srv.URL+"/again"); err == nil || err.Error() != want {
		t.Errorf("redirect loop: %v", err)
	}
	// A relative Location is taken as it is, which requests could not send.
	sink = newCapture(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Location", "/next")
		w.WriteHeader(http.StatusTemporaryRedirect)
	})
	if _, err := sendWebhook(ctx, conf(), &outMessage{Body: NewOMap(), To: []string{sink.srv.URL}}); err == nil ||
		err.Error() != "Invalid URL '/next': No scheme supplied. Perhaps you meant https:///next?" {
		t.Errorf("relative redirect: %v", err)
	}
	// To another origin: without the credentials and the template's headers.
	final := newCapture(t, nil)
	sink = newCapture(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Location", strings.Replace(final.srv.URL, "127.0.0.1", "localhost", 1)+"/landed")
		w.WriteHeader(http.StatusTemporaryRedirect)
	})
	if n, err := sendWebhook(ctx, conf(), &outMessage{Body: NewOMap(), To: []string{sink.srv.URL}}); err != nil || n != 1 {
		t.Fatalf("cross-origin redirect: %d, %v", n, err)
	}
	if r := final.got(); len(r) != 1 || r[0].header.Get("Authorization") != "" || r[0].header.Get("X-Secret") != "" {
		t.Errorf("cross-origin redirect carried credentials: %+v", r)
	}
	if r := sink.got(); len(r) != 1 || r[0].header.Get("Authorization") == "" || r[0].header.Get("X-Secret") != "s" {
		t.Errorf("first request without credentials: %+v", r)
	}
}

// Without credentials of its own, a webhook sends those in its URL, as
// requests did.
func TestWebhookURLCredentials(t *testing.T) {
	sink := newCapture(t, nil)
	u := strings.Replace(sink.srv.URL, "http://", "http://zz:s%40cret@", 1)
	conf := NewOMap().Set("http_method", "POST").Set("disable_ssl_verification", false).Set("username", "").Set("password", "")
	if n, err := sendWebhook(context.Background(), conf, &outMessage{Body: NewOMap(), To: []string{u}}); err != nil || n != 1 {
		t.Fatalf("send: %d, %v", n, err)
	}
	want := "Basic " + base64.StdEncoding.EncodeToString([]byte("zz:s@cret"))
	if r := sink.got(); len(r) != 1 || r[0].header.Get("Authorization") != want {
		t.Errorf("requests: %+v", r)
	}
}

func TestPySplitlines(t *testing.T) {
	for in, want := range map[string]string{
		"":               "",
		"a":              "a",
		"a\n":            "a",
		"a\r\nb":         "a|b",
		"a\rb\n\nc":      "a|b||c",
		"a\vb\fc\x1cd":   "a|b|c|d",
		"a\u2028b\u0085": "a|b",
	} {
		if got := strings.Join(pySplitlines(in), "|"); got != want {
			t.Errorf("%q: %q, want %q", in, got, want)
		}
	}
}

// A target listed twice gets the message once, as the old backend
// collected its targets in a dict.
func TestIRCTargetsOnce(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()
	got := make(chan []string, 1)
	go func() {
		conn, err := ln.Accept()
		if err != nil {
			got <- nil
			return
		}
		defer conn.Close()
		_ = conn.SetDeadline(time.Now().Add(10 * time.Second))
		rd := bufio.NewReader(conn)
		var privmsg []string
		for {
			l, err := rd.ReadString('\n')
			if err != nil {
				break
			}
			l = strings.TrimRight(l, "\r\n")
			switch {
			case strings.HasPrefix(l, "USER "):
				_, _ = conn.Write([]byte(":srv 001 zz-bot :welcome\r\n"))
			case strings.HasPrefix(l, "JOIN "):
				_, _ = conn.Write([]byte(":srv 366 zz-bot " + l[5:] + " :End of /NAMES list.\r\n"))
			case strings.HasPrefix(l, "PRIVMSG "):
				privmsg = append(privmsg, l)
			case strings.HasPrefix(l, "QUIT"):
				got <- privmsg
				return
			}
		}
		got <- privmsg
	}()
	host, port, _ := net.SplitHostPort(ln.Addr().String())
	conf := NewOMap().Set("server", host).Set("port", port).Set("nickname", "zz-bot")
	m := &outMessage{Subject: "done\n", To: []string{"zz-user", "#zz", "zz-user"}}
	if n, err := sendIRC(context.Background(), conf, m); err != nil || n != 2 {
		t.Fatalf("sendIRC = %d, %v", n, err)
	}
	if lines := <-got; strings.Join(lines, "|") != "PRIVMSG zz-user :done|PRIVMSG #zz :done" {
		t.Errorf("PRIVMSG lines = %q", lines)
	}
}
