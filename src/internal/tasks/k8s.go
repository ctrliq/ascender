package tasks

import (
	"bufio"
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha1"
	"crypto/tls"
	"crypto/x509"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"
)

// kubeClient talks to a container group's cluster: with the group's
// "OpenShift or Kubernetes API Bearer Token" credential, or in-cluster
// with the pod's service account when the group has none
// (kubernetes-runtime-auth and kubernetes-incluster-auth).
type kubeClient struct {
	host  *url.URL
	token string
	tls   *tls.Config
	http  *http.Client
}

const inClusterDir = "/var/run/secrets/kubernetes.io/serviceaccount"

func newKubeClient(cred *credentialData) (*kubeClient, error) {
	tlsConf := &tls.Config{MinVersion: tls.VersionTLS12}
	var host, token string
	if cred != nil {
		host, token = strings.TrimRight(cred.get("host"), "/"), cred.get("bearer_token")
		// apply_tls_verification: off, the CA given, or the system trust store.
		if !cred.getBool("verify_ssl") {
			tlsConf.InsecureSkipVerify = true
		} else if ca := cred.get("ssl_ca_cert"); ca != "" {
			pool := x509.NewCertPool()
			if !pool.AppendCertsFromPEM([]byte(ca)) {
				return nil, errors.New("the credential's certificate authority data could not be read")
			}
			tlsConf.RootCAs = pool
		}
	} else {
		h, p := os.Getenv("KUBERNETES_SERVICE_HOST"), os.Getenv("KUBERNETES_SERVICE_PORT")
		if h == "" {
			return nil, errors.New("the container group has no credential and this is not running in a cluster")
		}
		host = "https://" + net.JoinHostPort(h, p)
		b, err := os.ReadFile(inClusterDir + "/token")
		if err != nil {
			return nil, err
		}
		token = strings.TrimSpace(string(b))
		if ca, err := os.ReadFile(inClusterDir + "/ca.crt"); err == nil {
			pool := x509.NewCertPool()
			pool.AppendCertsFromPEM(ca)
			tlsConf.RootCAs = pool
		}
	}
	u, err := url.Parse(host)
	if err != nil || u.Host == "" {
		return nil, fmt.Errorf("invalid cluster host %q", host)
	}
	// Container group API traffic is not proxied
	// (ASCENDER_CONTAINER_GROUP_K8S_API_USE_PROXY defaults to off).
	// A client is made per job and per pod sweep (each minute per group):
	// idle connections time out, and close drops them when the caller is
	// done, so transports and their connections do not pile up.
	tr := &http.Transport{TLSClientConfig: tlsConf, Proxy: nil, ForceAttemptHTTP2: false, TLSHandshakeTimeout: 15 * time.Second, IdleConnTimeout: 90 * time.Second}
	return &kubeClient{host: u, token: token, tls: tlsConf, http: &http.Client{Transport: tr, Timeout: 60 * time.Second}}, nil
}

// close drops the client's idle connections; a later request opens new ones.
func (k *kubeClient) close() { k.http.CloseIdleConnections() }

// kubeError is an API failure with its status.
type kubeError struct {
	Status  int
	Message string
}

func (e *kubeError) Error() string { return fmt.Sprintf("%d: %s", e.Status, e.Message) }

// do sends a JSON request and decodes a JSON answer into out.
func (k *kubeClient) do(ctx context.Context, method, path string, body, out any) error {
	var rd io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return err
		}
		rd = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, k.host.String()+path, rd)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+k.token)
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := k.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(io.LimitReader(resp.Body, 16<<20))
	if resp.StatusCode >= 300 {
		var st struct {
			Message string `json:"message"`
		}
		_ = json.Unmarshal(b, &st)
		if st.Message == "" {
			st.Message = strings.TrimSpace(string(b))
		}
		return &kubeError{resp.StatusCode, st.Message}
	}
	if out != nil && len(b) > 0 {
		return json.Unmarshal(b, out)
	}
	return nil
}

// kubeStream is an attach session over a websocket in the channel.k8s.io
// framing: every message starts with its channel (0 stdin, 1 stdout,
// 2 stderr, 3 errors).
type kubeStream struct {
	conn     net.Conn
	br       *bufio.Reader
	protocol string
	wmu      sync.Mutex
	stdout   *io.PipeWriter
	Stdout   *io.PipeReader
	// stderr and errOut are written by readLoop while the job goroutine
	// may read them, so they are guarded.
	mu        sync.Mutex
	stderr    bytes.Buffer
	errOut    bytes.Buffer
	done      chan struct{}
	closeOnce sync.Once
}

// attach opens stdin, stdout and stderr of a pod's container.
func (k *kubeClient) attach(ctx context.Context, ns, pod, container string) (*kubeStream, error) {
	q := url.Values{"container": {container}, "stdin": {"true"}, "stdout": {"true"}, "stderr": {"true"}}
	path := fmt.Sprintf("/api/v1/namespaces/%s/pods/%s/attach?%s", url.PathEscape(ns), url.PathEscape(pod), q.Encode())
	addr := k.host.Host
	if k.host.Port() == "" {
		if k.host.Scheme == "https" {
			addr += ":443"
		} else {
			addr += ":80"
		}
	}
	d := &net.Dialer{Timeout: 15 * time.Second}
	var conn net.Conn
	var err error
	if k.host.Scheme == "https" {
		cfg := k.tls.Clone()
		cfg.NextProtos = []string{"http/1.1"}
		if cfg.ServerName == "" {
			cfg.ServerName = k.host.Hostname()
		}
		conn, err = (&tls.Dialer{NetDialer: d, Config: cfg}).DialContext(ctx, "tcp", addr)
	} else {
		conn, err = d.DialContext(ctx, "tcp", addr)
	}
	if err != nil {
		return nil, err
	}
	keyRaw := make([]byte, 16)
	_, _ = rand.Read(keyRaw)
	key := base64.StdEncoding.EncodeToString(keyRaw)
	req := "GET " + path + " HTTP/1.1\r\nHost: " + k.host.Host + "\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: " + key +
		"\r\nSec-WebSocket-Protocol: v5.channel.k8s.io, v4.channel.k8s.io\r\nAuthorization: Bearer " + k.token + "\r\n\r\n"
	_ = conn.SetDeadline(time.Now().Add(30 * time.Second))
	if _, err := conn.Write([]byte(req)); err != nil {
		conn.Close()
		return nil, err
	}
	br := bufio.NewReader(conn)
	resp, err := http.ReadResponse(br, nil)
	if err != nil {
		conn.Close()
		return nil, err
	}
	if resp.StatusCode != http.StatusSwitchingProtocols {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		conn.Close()
		return nil, &kubeError{resp.StatusCode, strings.TrimSpace(string(b))}
	}
	sum := sha1.Sum([]byte(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"))
	if resp.Header.Get("Sec-WebSocket-Accept") != base64.StdEncoding.EncodeToString(sum[:]) {
		conn.Close()
		return nil, errors.New("attach: bad websocket accept key")
	}
	_ = conn.SetDeadline(time.Time{})
	pr, pw := io.Pipe()
	s := &kubeStream{conn: conn, br: br, protocol: resp.Header.Get("Sec-WebSocket-Protocol"), stdout: pw, Stdout: pr, done: make(chan struct{})}
	go s.readLoop()
	return s, nil
}

// writeFrame sends one masked client frame.
func (s *kubeStream) writeFrame(op byte, payload []byte) error {
	s.wmu.Lock()
	defer s.wmu.Unlock()
	_ = s.conn.SetWriteDeadline(time.Now().Add(60 * time.Second))
	return s.writeFrameLocked(op, payload)
}

func (s *kubeStream) writeFrameLocked(op byte, payload []byte) error {
	n := len(payload)
	hdr := []byte{0x80 | op}
	switch {
	case n < 126:
		hdr = append(hdr, 0x80|byte(n))
	case n <= 0xffff:
		hdr = append(hdr, 0x80|126, byte(n>>8), byte(n))
	default:
		b := make([]byte, 8)
		binary.BigEndian.PutUint64(b, uint64(n))
		hdr = append(append(hdr, 0x80|127), b...)
	}
	mask := make([]byte, 4)
	_, _ = rand.Read(mask)
	hdr = append(hdr, mask...)
	masked := make([]byte, n)
	for i := range payload {
		masked[i] = payload[i] ^ mask[i%4]
	}
	_, err := s.conn.Write(append(hdr, masked...))
	return err
}

// WriteStdin sends data on channel 0 in pieces.
func (s *kubeStream) WriteStdin(b []byte) error {
	for len(b) > 0 {
		n := min(len(b), 32*1024)
		if err := s.writeFrame(0x2, append([]byte{0}, b[:n]...)); err != nil {
			return err
		}
		b = b[n:]
	}
	return nil
}

// CloseStdin half-closes stdin where the protocol can (v5's close
// channel); v4 has no way to, and the worker stops reading at its eof
// line anyway.
func (s *kubeStream) CloseStdin() {
	if s.protocol == "v5.channel.k8s.io" {
		_ = s.writeFrame(0x2, []byte{255, 0})
	}
}

func (s *kubeStream) readLoop() {
	defer close(s.done)
	var msg []byte
	for {
		h := make([]byte, 2)
		if _, err := io.ReadFull(s.br, h); err != nil {
			s.stdout.CloseWithError(err)
			return
		}
		fin, op := h[0]&0x80 != 0, h[0]&0x0f
		n := uint64(h[1] & 0x7f)
		switch n {
		case 126:
			b := make([]byte, 2)
			if _, err := io.ReadFull(s.br, b); err != nil {
				s.stdout.CloseWithError(err)
				return
			}
			n = uint64(binary.BigEndian.Uint16(b))
		case 127:
			b := make([]byte, 8)
			if _, err := io.ReadFull(s.br, b); err != nil {
				s.stdout.CloseWithError(err)
				return
			}
			n = binary.BigEndian.Uint64(b)
		}
		if n > 64<<20 {
			s.stdout.CloseWithError(errors.New("attach: frame too large"))
			return
		}
		payload := make([]byte, n)
		if _, err := io.ReadFull(s.br, payload); err != nil {
			s.stdout.CloseWithError(err)
			return
		}
		switch op {
		case 0x8:
			s.stdout.Close()
			return
		case 0x9:
			_ = s.writeFrame(0xA, payload)
			continue
		case 0xA:
			continue
		case 0x0:
			msg = append(msg, payload...)
		default:
			msg = payload
		}
		if !fin || len(msg) == 0 {
			continue
		}
		ch, data := msg[0], msg[1:]
		msg = nil
		switch ch {
		case 1:
			if len(data) > 0 {
				if _, err := s.stdout.Write(data); err != nil {
					return
				}
			}
		case 2:
			s.mu.Lock()
			if s.stderr.Len() < 64*1024 {
				s.stderr.Write(data)
			}
			s.mu.Unlock()
		case 3:
			s.mu.Lock()
			if s.errOut.Len() < 64*1024 {
				s.errOut.Write(data)
			}
			s.mu.Unlock()
		}
	}
}

// Stderr is what the container wrote to stderr so far (the first 64 KiB).
func (s *kubeStream) Stderr() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.stderr.String()
}

// Close ends the session; it may be called more than once. readLoop can
// be blocked writing stdout into the pipe when the reader has already
// given up (a non-JSON line, a bad artifact zip): closing the read side
// fails that write, so readLoop returns and Close does not wait forever
// (which left the job running, its slot taken and its pod in place).
func (s *kubeStream) Close() {
	s.closeOnce.Do(func() {
		// The close frame is a courtesy: skip it when a stdin write holds
		// the connection (it may be what is stuck).
		if s.wmu.TryLock() {
			_ = s.conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
			_ = s.writeFrameLocked(0x8, []byte{0x03, 0xe8})
			s.wmu.Unlock()
		}
		s.conn.Close()
		s.Stdout.CloseWithError(io.ErrClosedPipe)
	})
	<-s.done
}
