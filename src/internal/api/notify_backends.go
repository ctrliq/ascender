package api

import (
	"bufio"
	"bytes"
	"context"
	"crypto/rand"
	"crypto/tls"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net"
	"net/http"
	"net/smtp"
	"net/url"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode/utf16"

	"github.com/ctrliq/ascender/internal/netguard"
)

// The notification backends (ascender/main/notifications/*), each sending
// what the Python backend sent to the same service.

type outMessage struct {
	Subject   string
	Body      any
	From      string
	To        []string
	UserAgent string
}

func confStr(c *OMap, k string) string {
	v, ok := c.Get(k)
	if !ok || v == nil {
		return ""
	}
	return pyStr(v)
}

func confBool(c *OMap, k string, def bool) bool {
	v, ok := c.Get(k)
	if !ok {
		return def
	}
	return jsTruthy(v)
}

// jsTruthy is Python truthiness of a JSON value.
func jsTruthy(v any) bool {
	switch t := v.(type) {
	case nil:
		return false
	case bool:
		return t
	case string:
		return t != ""
	case json.Number:
		f, _ := t.Float64()
		return f != 0
	case []any:
		return len(t) > 0
	case *OMap:
		return t.Len() > 0
	}
	return true
}

func bodyText(b any) string {
	switch t := b.(type) {
	case string:
		return t
	case nil:
		return ""
	}
	return pyRepr(b)
}

// pyJSONDumps is json.dumps with the default separators.
func pyJSONDumps(v any, ensureASCII bool) []byte {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(v)
	in := bytes.TrimRight(buf.Bytes(), "\n")
	out := make([]byte, 0, len(in)+len(in)/8)
	inString, escaped := false, false
	for _, r := range string(in) {
		switch {
		case inString:
			switch {
			case escaped:
				escaped = false
				out = append(out, string(r)...)
			case r == '\\':
				escaped = true
				out = append(out, '\\')
			case r == '"':
				inString = false
				out = append(out, '"')
			case r > 0x7e && ensureASCII:
				for _, u := range utf16.Encode([]rune{r}) {
					out = append(out, fmt.Sprintf("\\u%04x", u)...)
				}
			default:
				out = append(out, string(r)...)
			}
		case r == '"':
			inString = true
			out = append(out, '"')
		case r == ',':
			out = append(out, ", "...)
		case r == ':':
			out = append(out, ": "...)
		default:
			out = append(out, string(r)...)
		}
	}
	return out
}

// notifyTimeoutKey carries a send's ASCENDER_NOTIFICATION_REQUEST_TIMEOUT.
type notifyTimeoutKey struct{}

// withNotifyTimeout sets the timeout the backends' connections use.
func withNotifyTimeout(ctx context.Context, d time.Duration) context.Context {
	return context.WithValue(ctx, notifyTimeoutKey{}, d)
}

// notifyTimeout is ASCENDER_NOTIFICATION_REQUEST_TIMEOUT for the send, 30
// seconds unless set.
func notifyTimeout(ctx context.Context) time.Duration {
	if d, ok := ctx.Value(notifyTimeoutKey{}).(time.Duration); ok && d > 0 {
		return d
	}
	return defaultNotificationRequestTimeout
}

// opTimeoutConn gives each read and each write on the connection its own
// deadline, as a socket timeout did: requests' timeout=N is N seconds to
// connect and N seconds for each read, not N for the whole request.
type opTimeoutConn struct {
	net.Conn
	timeout time.Duration
}

func (c *opTimeoutConn) Read(b []byte) (int, error) {
	_ = c.Conn.SetReadDeadline(time.Now().Add(c.timeout))
	return c.Conn.Read(b)
}

func (c *opTimeoutConn) Write(b []byte) (int, error) {
	_ = c.Conn.SetWriteDeadline(time.Now().Add(c.timeout))
	return c.Conn.Write(b)
}

// notifyProxyEnv picks a request's proxy from the environment, as
// requests did (HTTP_PROXY, HTTPS_PROXY, NO_PROXY); tests replace it.
var notifyProxyEnv = http.ProxyFromEnvironment

// notifyProxy is notifyProxyEnv with the metadata check on the target:
// through a proxy the dial guard only ever sees the proxy's address.
func notifyProxy(r *http.Request) (*url.URL, error) {
	p, err := notifyProxyEnv(r)
	if err != nil || p == nil {
		return p, err
	}
	if err := netguard.CheckHost(r.Context(), r.URL.Hostname()); err != nil {
		return nil, err
	}
	return p, nil
}

// httpClient is a notification's HTTP client. A notification admin chooses
// where it connects, so it never reaches a cloud metadata address
// (netguard), directly or through a proxy. Connecting and each read take
// at most the send's timeout. It is made per send and not kept, so it
// keeps no idle connections either.
func httpClient(ctx context.Context, verify bool) *http.Client {
	timeout := notifyTimeout(ctx)
	tr := http.DefaultTransport.(*http.Transport).Clone()
	tr.TLSClientConfig = &tls.Config{InsecureSkipVerify: !verify}
	tr.Proxy = notifyProxy
	dialer := netguard.Dialer(timeout)
	tr.DialContext = func(ctx context.Context, network, addr string) (net.Conn, error) {
		c, err := dialer.DialContext(ctx, network, addr)
		if err != nil {
			return nil, err
		}
		return &opTimeoutConn{Conn: c, timeout: timeout}, nil
	}
	tr.TLSHandshakeTimeout = 0
	tr.DisableKeepAlives = true
	return &http.Client{Transport: tr, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
}

// raiseForStatus is requests' Response.raise_for_status message.
func raiseForStatus(resp *http.Response, u string) error {
	if resp.StatusCode < 400 {
		return nil
	}
	reason := http.StatusText(resp.StatusCode)
	kind := "Client Error"
	if resp.StatusCode >= 500 {
		kind = "Server Error"
	}
	return fmt.Errorf("%d %s: %s for url: %s", resp.StatusCode, kind, reason, u)
}

func doRequest(ctx context.Context, client *http.Client, method, u string, body []byte, headers map[string]string) (*http.Response, []byte, error) {
	req, err := http.NewRequestWithContext(ctx, method, u, bytes.NewReader(body))
	if err != nil {
		return nil, nil, err
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, nil, err
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	return resp, b, nil
}

func clientHeaders(m *outMessage) map[string]string {
	return map[string]string{"Content-Type": "application/json", "User-Agent": m.UserAgent}
}

// ---------------------------------------------------------------- email

// sendEmail is Django's SMTP EmailBackend with the template's connection
// settings.
// readIRCLine reads one server line, at most 64 KiB (IRC's are 512 bytes;
// a server that sends no newline must not grow it without end).
func readIRCLine(rd *bufio.Reader) (string, error) {
	var line []byte
	for {
		frag, err := rd.ReadSlice('\n')
		line = append(line, frag...)
		if len(line) > 64<<10 {
			return "", errors.New("IRC line too long")
		}
		if err == bufio.ErrBufferFull {
			continue
		}
		return string(line), err
	}
}

// maxEmailTimeout bounds an email template's timeout, in seconds.
const maxEmailTimeout = 300

func sendEmail(ctx context.Context, conf *OMap, m *outMessage) (int, error) {
	host := confStr(conf, "host")
	port := confStr(conf, "port")
	// smtplib's socket timeout: each connect, read and write may take it.
	timeout := 30 * time.Second
	if t := confStr(conf, "timeout"); t != "" {
		if n, err := strconv.Atoi(t); err == nil {
			switch {
			case n == 0:
				return 0, errors.New("Non-blocking socket (timeout=0) is not supported")
			case n < 0:
				return 0, errors.New("Timeout value out of range")
			}
			// A notification admin sets it: bounded, so one server that
			// never answers cannot hold a connection and the goroutine
			// sending the job's notifications for days.
			timeout = time.Duration(min(n, maxEmailTimeout)) * time.Second
		}
	}
	useTLS, useSSL := confBool(conf, "use_tls", false), confBool(conf, "use_ssl", false)
	if useTLS && useSSL {
		return 0, errors.New("EMAIL_USE_TLS/EMAIL_USE_SSL are mutually exclusive, so only set one of those settings to True.")
	}
	addr := net.JoinHostPort(host, port)
	dialer := &net.Dialer{Timeout: timeout, Control: netguard.Control}
	var conn net.Conn
	var err error
	if useSSL {
		conn, err = tls.DialWithDialer(dialer, "tcp", addr, &tls.Config{ServerName: host})
	} else {
		conn, err = dialer.DialContext(ctx, "tcp", addr)
	}
	if err != nil {
		return 0, err
	}
	conn = &opTimeoutConn{Conn: conn, timeout: timeout}
	c, err := smtp.NewClient(conn, host)
	if err != nil {
		conn.Close()
		return 0, err
	}
	defer c.Close()
	hostname, _ := os.Hostname()
	if hostname == "" {
		hostname = "localhost"
	}
	if err := c.Hello(hostname); err != nil {
		return 0, err
	}
	if useTLS {
		if err := c.StartTLS(&tls.Config{ServerName: host}); err != nil {
			return 0, err
		}
	}
	user, pass := confStr(conf, "username"), confStr(conf, "password")
	if user != "" && pass != "" {
		if ok, mechs := c.Extension("AUTH"); ok {
			var a smtp.Auth
			switch {
			case strings.Contains(mechs, "CRAM-MD5"):
				a = smtp.CRAMMD5Auth(user, pass)
			case strings.Contains(mechs, "PLAIN"):
				a = plainAuth{user, pass}
			case strings.Contains(mechs, "LOGIN"):
				a = &loginAuth{user: user, pass: pass}
			default:
				return 0, errors.New("No suitable authentication method found.")
			}
			if err := c.Auth(a); err != nil {
				return 0, err
			}
		} else {
			return 0, errors.New("SMTP AUTH extension not supported by server.")
		}
	}
	msg := buildEmail(m, hostname)
	if err := c.Mail(m.From); err != nil {
		return 0, err
	}
	for _, r := range m.To {
		if err := c.Rcpt(r); err != nil {
			return 0, err
		}
	}
	wc, err := c.Data()
	if err != nil {
		return 0, err
	}
	if _, err := wc.Write(msg); err != nil {
		return 0, err
	}
	if err := wc.Close(); err != nil {
		return 0, err
	}
	_ = c.Quit()
	return 1, nil
}

// plainAuth is smtplib's AUTH PLAIN, which it used on any connection.
type plainAuth struct{ user, pass string }

func (a plainAuth) Start(*smtp.ServerInfo) (string, []byte, error) {
	return "PLAIN", []byte("\x00" + a.user + "\x00" + a.pass), nil
}
func (a plainAuth) Next([]byte, bool) ([]byte, error) { return nil, nil }

type loginAuth struct {
	user, pass string
	step       int
}

func (a *loginAuth) Start(*smtp.ServerInfo) (string, []byte, error) { return "LOGIN", nil, nil }
func (a *loginAuth) Next(_ []byte, more bool) ([]byte, error) {
	if !more {
		return nil, nil
	}
	a.step++
	if a.step == 1 {
		return []byte(a.user), nil
	}
	return []byte(a.pass), nil
}

// buildEmail writes the message as Django's EmailMessage did: plain text in
// UTF-8.
func buildEmail(m *outMessage, hostname string) []byte {
	var b bytes.Buffer
	body := bodyText(m.Body)
	ascii := true
	for _, r := range body {
		if r > 0x7e {
			ascii = false
			break
		}
	}
	b.WriteString("Content-Type: text/plain; charset=\"utf-8\"\r\n")
	b.WriteString("MIME-Version: 1.0\r\n")
	if ascii {
		b.WriteString("Content-Transfer-Encoding: 7bit\r\n")
	} else {
		b.WriteString("Content-Transfer-Encoding: 8bit\r\n")
	}
	b.WriteString("Subject: " + mime.QEncoding.Encode("utf-8", m.Subject) + "\r\n")
	b.WriteString("From: " + m.From + "\r\n")
	b.WriteString("To: " + strings.Join(m.To, ", ") + "\r\n")
	b.WriteString("Date: " + time.Now().UTC().Format("Mon, 02 Jan 2006 15:04:05 -0000") + "\r\n")
	rb := make([]byte, 8)
	_, _ = rand.Read(rb)
	b.WriteString(fmt.Sprintf("Message-ID: <%d.%s@%s>\r\n", time.Now().UnixNano(), hex.EncodeToString(rb), hostname))
	b.WriteString("\r\n")
	b.WriteString(strings.ReplaceAll(strings.ReplaceAll(body, "\r\n", "\n"), "\n", "\r\n"))
	return b.Bytes()
}

// ---------------------------------------------------------------- chat and paging services

// sendSlack posts each channel's message with chat.postMessage.
func sendSlack(ctx context.Context, conf *OMap, m *outMessage) (int, error) {
	token := confStr(conf, "token")
	color := ""
	if hc := confStr(conf, "hex_color"); strings.HasPrefix(hc, "#") && (len(hc) == 4 || len(hc) == 7) {
		color = hc
	}
	client := httpClient(ctx, true)
	sent := 0
	for _, r := range m.To {
		r = strings.TrimPrefix(r, "#")
		channel, thread := r, ""
		if strings.Contains(r, ",") {
			parts := strings.SplitN(r, ",", 2)
			channel, thread = parts[0], parts[1]
		}
		payload := NewOMap().Set("channel", channel)
		if thread != "" {
			payload.Set("thread_ts", thread)
		}
		payload.Set("as_user", true)
		if color != "" {
			payload.Set("attachments", []any{NewOMap().Set("color", color).Set("text", m.Subject)})
		} else {
			payload.Set("text", m.Subject)
		}
		body, _ := json.Marshal(payload)
		const u = "https://slack.com/api/chat.postMessage"
		resp, rb, err := doRequest(ctx, client, "POST", u, body, map[string]string{"Content-Type": "application/json;charset=utf-8", "Authorization": "Bearer " + token})
		if err != nil {
			return sent, err
		}
		var res any
		res, _ = decodeOrdered(string(rb))
		rm, _ := res.(*OMap)
		ok := false
		if rm != nil {
			v, _ := rm.Get("ok")
			ok, _ = v.(bool)
		}
		if resp.StatusCode != 200 || !ok {
			return sent, fmt.Errorf("The request to the Slack API failed. (url: %s)\nThe server responded with: %s", u, pyRepr(res))
		}
		sent++
	}
	return sent, nil
}

func sendTwilio(ctx context.Context, conf *OMap, m *outMessage) (int, error) {
	sid, token := confStr(conf, "account_sid"), confStr(conf, "account_token")
	u := fmt.Sprintf("https://api.twilio.com/2010-04-01/Accounts/%s/Messages.json", sid)
	client := httpClient(ctx, true)
	sent := 0
	var failure error
	for _, dest := range m.To {
		form := url.Values{"To": {dest}, "From": {m.From}, "Body": {m.Subject}}
		req, err := http.NewRequestWithContext(ctx, "POST", u, strings.NewReader(form.Encode()))
		if err != nil {
			return sent, err
		}
		for k, v := range clientHeaders(m) {
			req.Header.Set(k, v)
		}
		req.SetBasicAuth(sid, token)
		resp, err := client.Do(req)
		if err == nil {
			resp.Body.Close()
			err = raiseForStatus(resp, u)
		}
		if err != nil {
			if failure == nil {
				failure = err
			}
			continue
		}
		sent++
	}
	if failure != nil {
		return sent, failure
	}
	return sent, nil
}

func sendPagerDuty(ctx context.Context, conf *OMap, m *outMessage) (int, error) {
	const u = "https://events.pagerduty.com/generic/2010-04-15/create_event.json"
	key := ""
	if len(m.To) > 0 {
		key = m.To[0]
	}
	payload := NewOMap().Set("service_key", key).Set("event_type", "trigger").Set("description", m.Subject).Set("details", m.Body).Set("client", m.From)
	resp, _, err := doRequest(ctx, httpClient(ctx, true), "POST", u, pyJSONDumps(payload, true), clientHeaders(m))
	if err != nil {
		return 0, err
	}
	if err := raiseForStatus(resp, u); err != nil {
		return 0, err
	}
	return 1, nil
}

func sendGrafana(ctx context.Context, conf *OMap, m *outMessage) (int, error) {
	intOrNone := func(k string) (any, error) {
		v, ok := conf.Get(k)
		if !ok || v == nil {
			return nil, errors.New("int() argument must be a string, a bytes-like object or a real number, not 'NoneType'")
		}
		s := pyStr(v)
		if s == "" {
			return nil, nil
		}
		n, err := strconv.Atoi(strings.TrimSpace(s))
		if err != nil {
			return nil, fmt.Errorf("invalid literal for int() with base 10: '%s'", s)
		}
		return n, nil
	}
	dash, err := intOrNone("dashboardId")
	if err != nil {
		return 0, err
	}
	panel, err := intOrNone("panelId")
	if err != nil {
		return 0, err
	}
	data := NewOMap()
	body, _ := m.Body.(*OMap)
	if body != nil && body.Has("started") {
		parse := func(k string) (int64, bool) {
			v, _ := body.Get(k)
			sv, _ := v.(string)
			t, err := time.Parse(time.RFC3339Nano, sv)
			if err != nil {
				return 0, false
			}
			return t.UnixMilli(), true
		}
		st, ok := parse("started")
		if !ok {
			sv, _ := body.Get("started")
			fv, _ := body.Get("finished")
			return 0, fmt.Errorf("Error converting time %v and/or timeEnd %v to int.", sv, fv)
		}
		data.Set("time", st).Set("timeEnd", st)
		if fv, _ := body.Get("finished"); jsTruthy(fv) {
			if fe, ok := parse("finished"); ok {
				data.Set("timeEnd", fe)
			}
		}
	}
	data.Set("isRegion", confBool(conf, "isRegion", true))
	if dash != nil {
		data.Set("dashboardId", dash)
	}
	if panel != nil {
		data.Set("panelId", panel)
	}
	if tags, ok := conf.Get("annotation_tags"); ok && jsTruthy(tags) {
		data.Set("tags", tags)
	}
	data.Set("text", m.Subject)
	target := ""
	if len(m.To) > 0 {
		target = m.To[0]
	}
	resp, _, err := doRequest(ctx, httpClient(ctx, !confBool(conf, "grafana_no_verify_ssl", false)), "POST", target+"/api/annotations", pyJSONDumps(data, true),
		map[string]string{"Authorization": "Bearer " + confStr(conf, "grafana_key"), "Content-Type": "application/json"})
	if err != nil {
		return 0, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return 0, fmt.Errorf("Error sending notification grafana: %d", resp.StatusCode)
	}
	return 1, nil
}

// sendWebhook posts or puts the body, following up to five redirects and
// dropping the credentials when a redirect changes origin.
func sendWebhook(ctx context.Context, conf *OMap, m *outMessage) (int, error) {
	method := strings.ToUpper(confStr(conf, "http_method"))
	if method != "POST" && method != "PUT" {
		return 0, errors.New("HTTP method must be either 'POST' or 'PUT'.")
	}
	user, pass := confStr(conf, "username"), confStr(conf, "password")
	body := m.Body
	if !jsTruthy(body) {
		body = NewOMap()
	}
	data := pyJSONDumps(body, false)
	headers := clientHeaders(m)
	if h, ok := conf.Get("headers"); ok {
		if hm, ok := h.(*OMap); ok {
			for _, k := range hm.Keys() {
				v, _ := hm.Get(k)
				headers[k] = pyStr(v)
			}
		}
	}
	target := ""
	if len(m.To) > 0 {
		target = m.To[0]
	}
	orig, origOK := pyURLOrigin(target)
	client := httpClient(ctx, !confBool(conf, "disable_ssl_verification", false))
	auth := user != "" || pass != ""
	logSafe := func(u string) string { return base64.StdEncoding.EncodeToString([]byte(u)) }
	var resp *http.Response
	var errText string
	ok := false
	for i := 0; i < webhookMaxRetries; i++ {
		if err := requestsURLError(target); err != nil {
			return 0, err
		}
		req, err := http.NewRequestWithContext(ctx, method, target, bytes.NewReader(data))
		if err != nil {
			return 0, err
		}
		for k, v := range headers {
			req.Header.Set(k, v)
		}
		if auth {
			req.SetBasicAuth(user, pass)
		} else if ui := req.URL.User; ui != nil {
			// Without credentials of its own, requests took the URL's.
			if p, _ := ui.Password(); ui.Username() != "" || p != "" {
				req.SetBasicAuth(ui.Username(), p)
			}
		}
		// The transport alone: the client would refuse a redirect whose
		// Location it cannot parse before this loop could report it.
		resp, err = client.Transport.RoundTrip(req)
		if err != nil {
			return 0, &url.Error{Op: method[:1] + strings.ToLower(method[1:]), URL: target, Err: err}
		}
		resp.Body.Close()
		if resp.StatusCode != 301 && resp.StatusCode != 307 {
			ok = true
			break
		}
		// The Location is taken as it is, as the old backend took it: a
		// relative one fails as a URL without a scheme.
		next, has := resp.Header["Location"]
		if !has || len(next) == 0 {
			errText = fmt.Sprintf("Webhook notification received redirect to a blank URL from %s. Response headers=%s", logSafe(target), pyHeadersRepr(resp.Header))
			ok = true
			break
		}
		from := target
		target = next[0]
		ro, roOK := pyURLOrigin(target)
		if !roOK {
			errText = fmt.Sprintf("Webhook notification received redirect to an invalid URL %s from %s", logSafe(target), logSafe(from))
			ok = true
			break
		}
		if !origOK || ro != orig {
			// Another origin gets neither the credentials nor the
			// template's headers.
			auth = false
			headers = clientHeaders(m)
		}
	}
	if !ok {
		errText = fmt.Sprintf("Webhook notification max number of retries [%d] exceeded. Failed to send webhook notification to %s", webhookMaxRetries, logSafe(target))
	}
	if resp != nil && resp.StatusCode >= 400 {
		errText = fmt.Sprintf("Error sending webhook notification: %d", resp.StatusCode)
	}
	if errText != "" {
		return 0, errors.New(errText)
	}
	if resp != nil && resp.StatusCode >= 200 && resp.StatusCode < 299 {
		return 1, nil
	}
	return 0, nil
}

// webhookMaxRetries is WebhookBackend.MAX_RETRIES: the redirects followed.
const webhookMaxRetries = 5

// pyURLOrigin is the webhook backend's _origin: urlparse's scheme
// (lowercased), hostname and port (the scheme's default when absent),
// and false where urlparse raised ValueError (an unclosed IPv6 bracket,
// a port that is not a number from 0 to 65535).
func pyURLOrigin(raw string) (string, bool) {
	scheme, rest := "", raw
	if i := strings.Index(raw, ":"); i > 0 {
		cand := raw[:i]
		valid := true
		for j, c := range cand {
			if !(c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || j > 0 && (c >= '0' && c <= '9' || c == '+' || c == '-' || c == '.')) {
				valid = false
				break
			}
		}
		if valid {
			scheme, rest = strings.ToLower(cand), raw[i+1:]
		}
	}
	netloc := ""
	if strings.HasPrefix(rest, "//") {
		netloc = rest[2:]
		if i := strings.IndexAny(netloc, "/?#"); i >= 0 {
			netloc = netloc[:i]
		}
	}
	if strings.Contains(netloc, "[") != strings.Contains(netloc, "]") {
		return "", false
	}
	hostport := netloc
	if i := strings.LastIndex(hostport, "@"); i >= 0 {
		hostport = hostport[i+1:]
	}
	host, port := hostport, ""
	if strings.HasPrefix(hostport, "[") {
		if i := strings.Index(hostport, "]"); i >= 0 {
			host = hostport[1:i]
			if after := hostport[i+1:]; strings.HasPrefix(after, ":") {
				port = after[1:]
			}
		}
	} else if i := strings.LastIndex(hostport, ":"); i >= 0 {
		host, port = hostport[:i], hostport[i+1:]
	}
	host = strings.ToLower(host)
	if port == "" {
		port = map[string]string{"http": "80", "https": "443"}[scheme]
	} else {
		for _, c := range port {
			if c < '0' || c > '9' {
				return "", false
			}
		}
		n, err := strconv.Atoi(port)
		if err != nil || n > 65535 {
			return "", false
		}
		port = strconv.Itoa(n)
	}
	return scheme + "|" + host + "|" + port, true
}

// requestsURLError is what requests raised before connecting to a URL it
// cannot send to (PreparedRequest.prepare_url, Session.get_adapter): one
// without a scheme or a host, or of a scheme it has no adapter for. A
// redirect's Location reaches it as the server sent it.
func requestsURLError(u string) error {
	lower := strings.ToLower(u)
	noAdapter := fmt.Errorf("No connection adapters were found for %s", pyRepr(u))
	if strings.Contains(u, ":") && !strings.HasPrefix(lower, "http") {
		return noAdapter
	}
	scheme, rest, found := strings.Cut(u, ":")
	if !found || scheme == "" || strings.ContainsAny(scheme, "/?#") {
		return fmt.Errorf("Invalid URL %s: No scheme supplied. Perhaps you meant https://%s?", pyRepr(u), u)
	}
	host := ""
	if strings.HasPrefix(rest, "//") {
		host = rest[2:]
		if i := strings.IndexAny(host, "/?#"); i >= 0 {
			host = host[:i]
		}
		if i := strings.LastIndex(host, "@"); i >= 0 {
			host = host[i+1:]
		}
		if !strings.HasPrefix(host, "[") {
			host, _, _ = strings.Cut(host, ":")
		}
	}
	if host == "" {
		return fmt.Errorf("Invalid URL %s: No host supplied", pyRepr(u))
	}
	if !strings.HasPrefix(lower, "http://") && !strings.HasPrefix(lower, "https://") {
		return noAdapter
	}
	return nil
}

// pyHeadersRepr is a requests response's headers as Python printed them:
// a dict repr, multiple values of a header joined with ", ". Go keeps the
// names canonicalized and unordered, so they are sorted here.
func pyHeadersRepr(h http.Header) string {
	keys := make([]string, 0, len(h))
	for k := range h {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	parts := make([]string, len(keys))
	for i, k := range keys {
		parts[i] = pyRepr(k) + ": " + pyRepr(strings.Join(h[k], ", "))
	}
	return "{" + strings.Join(parts, ", ") + "}"
}

func sendMattermost(ctx context.Context, conf *OMap, m *outMessage) (int, error) {
	payload := NewOMap()
	for _, kv := range [][2]string{{"mattermost_icon_url", "icon_url"}, {"mattermost_channel", "channel"}, {"mattermost_username", "username"}} {
		if v, ok := conf.Get(kv[0]); ok && v != nil {
			payload.Set(kv[1], strings.TrimSpace(pyStr(v)))
		}
	}
	payload.Set("text", m.Subject)
	target := ""
	if len(m.To) > 0 {
		target = m.To[0]
	}
	resp, _, err := doRequest(ctx, httpClient(ctx, !confBool(conf, "mattermost_no_verify_ssl", false)), "POST", target, pyJSONDumps(payload, true), map[string]string{"Content-Type": "application/json"})
	if err != nil {
		return 0, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return 0, fmt.Errorf("Error sending notification mattermost: %d", resp.StatusCode)
	}
	return 1, nil
}

func sendRocketChat(ctx context.Context, conf *OMap, m *outMessage) (int, error) {
	payload := NewOMap().Set("text", m.Subject)
	for _, kv := range [][2]string{{"rocketchat_icon_url", "icon_url"}, {"rocketchat_username", "username"}} {
		if v, ok := conf.Get(kv[0]); ok && v != nil {
			payload.Set(kv[1], strings.TrimSpace(pyStr(v)))
		}
	}
	target := ""
	if len(m.To) > 0 {
		target = m.To[0]
	}
	resp, _, err := doRequest(ctx, httpClient(ctx, !confBool(conf, "rocketchat_no_verify_ssl", false)), "POST", target, pyJSONDumps(payload, true), clientHeaders(m))
	if err != nil {
		return 0, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return 0, fmt.Errorf("Error sending notification rocket.chat: %d", resp.StatusCode)
	}
	return 1, nil
}

// ---------------------------------------------------------------- IRC

// sendIRC registers, joins each channel and sends the message, as the
// standard-library IRC backend did.
func sendIRC(ctx context.Context, conf *OMap, m *outMessage) (int, error) {
	const sendTimeout = 60 * time.Second
	server, port, nick := confStr(conf, "server"), confStr(conf, "port"), confStr(conf, "nickname")
	pass := confStr(conf, "password")
	addr := net.JoinHostPort(server, port)
	dialer := &net.Dialer{Timeout: sendTimeout, Control: netguard.Control}
	var conn net.Conn
	var err error
	if confBool(conf, "use_ssl", false) {
		conn, err = tls.DialWithDialer(dialer, "tcp", addr, &tls.Config{ServerName: server})
	} else {
		conn, err = dialer.DialContext(ctx, "tcp", addr)
	}
	if err != nil {
		return 0, err
	}
	defer conn.Close()
	rd := bufio.NewReader(conn)
	// A line carries no CR, LF or NUL: a lone \r in rendered job data
	// would end the PRIVMSG on most servers and start a command of its
	// own, sent as the bot.
	ircUnsafe := strings.NewReplacer("\r", "", "\n", "", "\x00", "")
	send := func(line string) error {
		b := []byte(ircUnsafe.Replace(line))
		if len(b) > 510 {
			b = b[:510]
		}
		_, err := conn.Write(append(b, '\r', '\n'))
		return err
	}
	deadline := time.Now().Add(sendTimeout)
	readLine := func() (string, bool) {
		for {
			_ = conn.SetReadDeadline(deadline)
			line, err := readIRCLine(rd)
			if err != nil {
				return "", false
			}
			line = strings.TrimRight(line, "\r\n")
			if strings.HasPrefix(line, "PING") {
				_ = send("PONG" + line[4:])
				continue
			}
			return line, true
		}
	}
	if pass != "" {
		_ = send("PASS " + pass)
	}
	_ = send("NICK " + nick)
	_ = send(fmt.Sprintf("USER %s 0 * :%s", nick, nick))
	for {
		line, ok := readLine()
		if !ok {
			return 0, errors.New("timed out waiting for the irc server to accept the connection")
		}
		parts := strings.Fields(line)
		if len(parts) > 1 && parts[1] == "001" {
			break
		}
		if len(parts) > 1 && strings.HasPrefix(parts[1], "4") {
			return 0, errors.New(line)
		}
	}
	deadline = time.Now().Add(sendTimeout)
	sent := 0
	// Each target once, in the order first listed.
	var targets []string
	seen := map[string]bool{}
	for _, t := range m.To {
		if !seen[t] {
			seen[t] = true
			targets = append(targets, t)
		}
	}
	for _, target := range targets {
		if strings.ContainsAny(target[:min(1, len(target))], "#&+!") {
			_ = send("JOIN " + target)
			joined := false
			for {
				line, ok := readLine()
				if !ok {
					break
				}
				parts := strings.Fields(line)
				if len(parts) > 1 && (parts[1] == "366" || parts[1] == "JOIN") {
					joined = true
					break
				}
				if len(parts) > 1 && strings.HasPrefix(parts[1], "4") {
					break
				}
			}
			if !joined {
				continue
			}
		}
		lines := pySplitlines(m.Subject)
		if len(lines) == 0 {
			lines = []string{""}
		}
		for _, l := range lines {
			if err := send(fmt.Sprintf("PRIVMSG %s :%s", target, l)); err != nil {
				return sent, err
			}
		}
		sent++
	}
	_ = send("QUIT")
	return sent, nil
}

// pySplitlines is str.splitlines(): lines split on every line boundary
// Python knows (\n, \r, \r\n, \v, \f, \x1c-\x1e, \x85, U+2028, U+2029),
// with no empty line after a final boundary.
func pySplitlines(s string) []string {
	var lines []string
	rs := []rune(s)
	var cur []rune
	for i := 0; i < len(rs); i++ {
		switch r := rs[i]; r {
		case '\n', '\v', '\f', 0x1c, 0x1d, 0x1e, 0x85, 0x2028, 0x2029:
			lines = append(lines, string(cur))
			cur = cur[:0]
		case '\r':
			lines = append(lines, string(cur))
			cur = cur[:0]
			if i+1 < len(rs) && rs[i+1] == '\n' {
				i++
			}
		default:
			cur = append(cur, r)
		}
	}
	if len(cur) > 0 {
		lines = append(lines, string(cur))
	}
	return lines
}

// ---------------------------------------------------------------- Matrix

func sendMatrix(ctx context.Context, conf *OMap, m *outMessage) (int, error) {
	base := strings.TrimRight(strings.TrimSpace(confStr(conf, "homeserver_url")), "/")
	token := confStr(conf, "access_token")
	client := httpClient(ctx, !confBool(conf, "disable_ssl_verification", false))
	request := func(method, path string, body []byte) (*http.Response, []byte, error) {
		h := clientHeaders(m)
		h["Authorization"] = "Bearer " + token
		var resp *http.Response
		var rb []byte
		var err error
		for attempt := 1; attempt <= 3; attempt++ {
			resp, rb, err = doRequest(ctx, client, method, base+"/_matrix/client/v3"+path, body, h)
			if err != nil || resp.StatusCode != 429 || attempt == 3 {
				return resp, rb, err
			}
			wait := 1.0
			if v, err := decodeOrdered(string(rb)); err == nil {
				if mm, ok := v.(*OMap); ok {
					if ms, ok := mm.Get("retry_after_ms"); ok {
						if n, ok := ms.(json.Number); ok {
							f, _ := n.Float64()
							wait = f / 1000
						}
					}
				}
			}
			if wait > 10 {
				wait = 10
			}
			time.Sleep(time.Duration(wait * float64(time.Second)))
		}
		return resp, rb, err
	}
	describe := func(what string, resp *http.Response, rb []byte) error {
		msg := fmt.Sprintf("Error %s via Matrix: %d", what, resp.StatusCode)
		if v, err := decodeOrdered(string(rb)); err == nil {
			if mm, ok := v.(*OMap); ok {
				var parts []string
				for _, k := range []string{"errcode", "error"} {
					if x, ok := mm.Get(k); ok && jsTruthy(x) {
						parts = append(parts, pyStr(x))
					}
				}
				if len(parts) > 0 {
					msg += " (" + strings.Join(parts, " ") + ")"
				}
			}
		}
		return errors.New(msg)
	}
	content := NewOMap().Set("msgtype", "m.text").Set("body", m.Subject)
	if confBool(conf, "use_html", true) {
		if bt := bodyText(m.Body); bt != "" {
			content.Set("format", "org.matrix.custom.html").Set("formatted_body", bt)
		}
	}
	payload := pyJSONDumps(content, true)
	resolved := map[string]string{}
	sent := 0
	for _, room := range m.To {
		id, ok := resolved[room]
		if !ok {
			r := strings.TrimSpace(room)
			if strings.HasPrefix(r, "#") {
				resp, rb, err := request("GET", "/directory/room/"+pyQuote(r), nil)
				if err != nil {
					return sent, err
				}
				if resp.StatusCode < 200 || resp.StatusCode >= 300 {
					return sent, describe("resolving room alias "+r, resp, rb)
				}
				v, _ := decodeOrdered(string(rb))
				mm, _ := v.(*OMap)
				rid := ""
				if mm != nil {
					x, _ := mm.Get("room_id")
					rid, _ = x.(string)
				}
				if rid == "" {
					return sent, fmt.Errorf("Error resolving room alias %s via Matrix: no room_id in the response", r)
				}
				id = rid
			} else {
				id = r
			}
			resolved[room] = id
		}
		txn := make([]byte, 16)
		_, _ = rand.Read(txn)
		resp, rb, err := request("PUT", "/rooms/"+pyQuote(id)+"/send/m.room.message/"+hex.EncodeToString(txn), payload)
		if err != nil {
			return sent, err
		}
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			return sent, describe("sending notification to room "+room, resp, rb)
		}
		sent++
	}
	return sent, nil
}

// pyQuote is urllib.parse.quote(s, safe=”): everything but the unreserved
// characters percent-encoded.
func pyQuote(s string) string {
	var b strings.Builder
	for _, c := range []byte(s) {
		if c >= 'A' && c <= 'Z' || c >= 'a' && c <= 'z' || c >= '0' && c <= '9' || c == '_' || c == '.' || c == '-' || c == '~' {
			b.WriteByte(c)
		} else {
			fmt.Fprintf(&b, "%%%02X", c)
		}
	}
	return b.String()
}
