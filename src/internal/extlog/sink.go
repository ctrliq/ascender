package extlog

import (
	"bufio"
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

// The outputs: what the old rsyslog actions did with a queued record.
// omhttp posted it, omfwd wrote it to a TCP stream (one record per line,
// with keepalive probes) or a UDP datagram, and omrelp sent it in a RELP
// session that acknowledges each record. Every output keeps its
// connection between records; a failure is retried, except a record the
// aggregator refused, which omhttp wrote to its error file and dropped.

// sink delivers one record at a time.
type sink interface {
	send(ctx context.Context, msg []byte) error
	close()
}

// refusedError is a record the aggregator answered and refused: retrying
// it would never succeed, so it is dropped.
type refusedError struct{ err error }

func (e *refusedError) Error() string { return e.err.Error() }

// KeepAlive is LOG_AGGREGATOR_TCP_KEEPALIVE and its timings.
type KeepAlive struct {
	Enabled        bool
	Time, Interval time.Duration
	Probes         int
}

// transport is what decides how records travel; a change replaces the
// output.
type transport struct {
	Protocol, Host, Type, Username, Password string
	Port                                     int64
	VerifyCert                               bool
	Timeout                                  time.Duration
	KeepAlive                                KeepAlive
	ErrorFile                                string
}

func (d Destination) transport() transport {
	return transport{Protocol: d.Config.Protocol, Host: d.Config.Host, Type: d.Config.Type, Username: d.Config.Username, Password: d.Config.Password,
		Port: d.Config.Port, VerifyCert: d.Config.VerifyCert, Timeout: d.Config.Timeout, KeepAlive: d.KeepAlive, ErrorFile: d.ErrorFile}
}

func (t transport) timeout() time.Duration {
	if t.Timeout <= 0 {
		return 5 * time.Second
	}
	return t.Timeout
}

func newSink(t transport, cfg Config, logf func(string, ...any)) (sink, error) {
	switch {
	case strings.HasPrefix(t.Protocol, "http"):
		u, err := cfg.HTTPTarget()
		if err != nil {
			return nil, err
		}
		tr := &http.Transport{Proxy: http.ProxyFromEnvironment, TLSClientConfig: &tls.Config{InsecureSkipVerify: !t.VerifyCert}, MaxIdleConnsPerHost: 2}
		return &httpSink{t: t, url: u.String(), client: &http.Client{Transport: tr, Timeout: t.timeout()}}, nil
	case t.Protocol == "tcp" || t.Protocol == "udp":
		if t.Host == "" || t.Port == 0 {
			return nil, errors.New("no host or port")
		}
		return &streamSink{t: t, addr: net.JoinHostPort(t.Host, strconv.FormatInt(t.Port, 10)), logf: logf}, nil
	case t.Protocol == "relp":
		if t.Host == "" || t.Port == 0 {
			return nil, errors.New("no host or port")
		}
		return &relpSink{t: t, addr: net.JoinHostPort(t.Host, strconv.FormatInt(t.Port, 10))}, nil
	}
	return nil, fmt.Errorf("unsupported protocol %q", t.Protocol)
}

// httpSink is omhttp: one POST per record, with the Splunk or Ledger
// authorization header or basic authentication.
type httpSink struct {
	t      transport
	url    string
	client *http.Client
	errMu  sync.Mutex
}

func (s *httpSink) send(ctx context.Context, msg []byte) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.url, bytes.NewReader(msg))
	if err != nil {
		return &refusedError{err}
	}
	req.Header.Set("Content-Type", "application/json; charset=utf-8")
	setAuth(req, s.t)
	resp, err := s.client.Do(req)
	if err != nil {
		return err
	}
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<16))
	resp.Body.Close()
	switch {
	case resp.StatusCode < 300:
		return nil
	case resp.StatusCode >= 500 || resp.StatusCode == http.StatusTooManyRequests:
		return fmt.Errorf("%s answered %s", s.url, resp.Status)
	}
	// omhttp's errorfile: the request and the answer, one JSON per line.
	s.writeError(msg, resp.StatusCode, body)
	return &refusedError{fmt.Errorf("%s answered %s", s.url, resp.Status)}
}

// setAuth is what the old config gave omhttp: Ledger's header for ledger;
// for every other type basic authentication with the username, if there
// is one (uid, and pwd if there is a password), and for splunk with a
// password its own Authorization header, which curl sends instead of the
// basic one.
func setAuth(req *http.Request, t transport) {
	if t.Type == "ledger" {
		if t.Password != "" {
			req.Header.Set("Authorization", "Ledger "+t.Password)
		}
		return
	}
	if t.Username != "" {
		req.SetBasicAuth(t.Username, t.Password)
	}
	if t.Type == "splunk" && t.Password != "" {
		req.Header.Set("Authorization", "Splunk "+t.Password)
	}
}

func (s *httpSink) writeError(msg []byte, status int, body []byte) {
	if s.t.ErrorFile == "" {
		return
	}
	line, _ := json.Marshal(map[string]any{
		"request":  map[string]any{"url": s.url, "postdata": string(msg)},
		"response": map[string]any{"status": status, "message": string(body)},
	})
	s.errMu.Lock()
	defer s.errMu.Unlock()
	f, err := os.OpenFile(s.t.ErrorFile, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o640)
	if err != nil {
		return
	}
	defer f.Close()
	f.Write(append(line, '\n'))
}

func (s *httpSink) close() { s.client.CloseIdleConnections() }

// streamSink is omfwd: a TCP stream of LF-framed records, probed with
// keepalives so a connection a firewall dropped while idle is noticed, or
// UDP datagrams.
type streamSink struct {
	t    transport
	addr string
	conn net.Conn
	logf func(string, ...any)
}

// maxUDPMessage is the most a UDP datagram carries (65535 bytes less the
// IPv4 and UDP headers), at which omfwd cut a longer message.
const maxUDPMessage = 65507

func (s *streamSink) dial(ctx context.Context) error {
	d := net.Dialer{Timeout: s.t.timeout()}
	if s.t.Protocol == "tcp" {
		if s.t.KeepAlive.Enabled {
			d.KeepAliveConfig = net.KeepAliveConfig{Enable: true, Idle: s.t.KeepAlive.Time, Interval: s.t.KeepAlive.Interval, Count: s.t.KeepAlive.Probes}
		} else {
			d.KeepAlive = -1
		}
	}
	c, err := d.DialContext(ctx, s.t.Protocol, s.addr)
	if err != nil {
		return err
	}
	s.conn = c
	return nil
}

func (s *streamSink) send(ctx context.Context, msg []byte) error {
	if s.conn == nil {
		if err := s.dial(ctx); err != nil {
			return err
		}
	}
	_ = s.conn.SetWriteDeadline(time.Now().Add(s.t.timeout()))
	if s.t.Protocol == "udp" {
		return s.sendDatagram(msg)
	}
	out := append(append(make([]byte, 0, len(msg)+1), msg...), '\n')
	if _, err := s.conn.Write(out); err != nil {
		s.close()
		return err
	}
	return nil
}

// sendDatagram is omfwd's UDP send: a message longer than a datagram can
// be is cut to maxUDPMessage bytes and sent, with rsyslog's error; one
// the system still finds too long is cut by another 1024 bytes and tried
// again. A record that cannot be sent even at 512 bytes is refused, not
// retried for ever.
func (s *streamSink) sendDatagram(msg []byte) error {
	if len(msg) > maxUDPMessage {
		s.log("omfwd/udp: message is %d bytes long, but UDP can send at most %d bytes (by RFC limit) - truncating message", len(msg), maxUDPMessage)
		msg = msg[:maxUDPMessage]
	}
	for {
		_, err := s.conn.Write(msg)
		if err == nil {
			return nil
		}
		if !errors.Is(err, syscall.EMSGSIZE) {
			s.close()
			return err
		}
		if len(msg) <= 512 {
			return &refusedError{err}
		}
		n := 512
		if len(msg) > 1024 {
			n = len(msg) - 1024
		}
		s.log("omfwd/udp: send failed due to message being too large for this system. Message size was %d bytes. Truncating to %d bytes and retrying.", len(msg), n)
		msg = msg[:n]
	}
}

func (s *streamSink) log(format string, args ...any) {
	if s.logf != nil {
		s.logf(format, args...)
	}
}

func (s *streamSink) close() {
	if s.conn != nil {
		s.conn.Close()
		s.conn = nil
	}
}

// relpSink is omrelp: a RELP session in which every record is
// acknowledged, and one that is not is sent again.
type relpSink struct {
	t    transport
	addr string
	conn net.Conn
	r    *bufio.Reader
	txnr int
}

func (s *relpSink) command(cmd string, data []byte) error {
	s.txnr++
	if s.txnr > 999999999 {
		s.txnr = 1
	}
	var b bytes.Buffer
	fmt.Fprintf(&b, "%d %s %d", s.txnr, cmd, len(data))
	if len(data) > 0 {
		b.WriteByte(' ')
		b.Write(data)
	}
	b.WriteByte('\n')
	_ = s.conn.SetDeadline(time.Now().Add(s.t.timeout()))
	if _, err := s.conn.Write(b.Bytes()); err != nil {
		return err
	}
	return readRELPAnswer(s.r, s.txnr)
}

// maxRELPAnswer bounds the data of a server's answer: a "200 OK" or an
// error text. RELP allows nine length digits, but the length comes from
// the server, and sizing a buffer from it unchecked let a broken or hostile
// log server panic (negative) or exhaust memory (huge) in the shipper.
const maxRELPAnswer = 64 << 10

// readRELPAnswer reads "<txnr> rsp <len> <code> <text>\n".
func readRELPAnswer(r *bufio.Reader, txnr int) error {
	hdr, err := readRELPToken(r)
	if err != nil {
		return err
	}
	if hdr != strconv.Itoa(txnr) {
		return fmt.Errorf("relp: unexpected transaction %q", hdr)
	}
	if cmd, err := readRELPToken(r); err != nil || cmd != "rsp" {
		return fmt.Errorf("relp: unexpected answer %q", cmd)
	}
	ls, err := readRELPToken(r)
	if err != nil {
		return err
	}
	n, err := strconv.Atoi(ls)
	if err != nil {
		return err
	}
	if n < 0 || n > maxRELPAnswer {
		return fmt.Errorf("relp: answer length %d out of range", n)
	}
	data := make([]byte, n+1)
	if _, err := io.ReadFull(r, data); err != nil {
		return err
	}
	if !bytes.HasPrefix(data, []byte("200")) {
		return fmt.Errorf("relp: %s", strings.TrimSpace(string(data)))
	}
	return nil
}

// readRELPToken reads one space-terminated header field, of at most the
// nine digits RELP allows plus a little, so a server that never sends the
// space cannot grow the buffer without end.
func readRELPToken(r *bufio.Reader) (string, error) {
	var b []byte
	for {
		c, err := r.ReadByte()
		if err != nil {
			return "", err
		}
		if c == ' ' {
			return strings.TrimSpace(string(b)), nil
		}
		if len(b) >= 32 {
			return "", fmt.Errorf("relp: header field too long %q", b)
		}
		b = append(b, c)
	}
}

func (s *relpSink) send(ctx context.Context, msg []byte) error {
	if s.conn == nil {
		d := net.Dialer{Timeout: s.t.timeout()}
		c, err := d.DialContext(ctx, "tcp", s.addr)
		if err != nil {
			return err
		}
		s.conn, s.r, s.txnr = c, bufio.NewReader(c), 0
		if err := s.command("open", []byte("relp_version=0\nrelp_software=ascender\ncommands=syslog")); err != nil {
			s.close()
			return err
		}
	}
	if err := s.command("syslog", msg); err != nil {
		s.close()
		return err
	}
	return nil
}

func (s *relpSink) close() {
	if s.conn != nil {
		s.txnr++
		_ = s.conn.SetDeadline(time.Now().Add(time.Second))
		fmt.Fprintf(s.conn, "%d close 0\n", s.txnr)
		s.conn.Close()
		s.conn = nil
	}
}
