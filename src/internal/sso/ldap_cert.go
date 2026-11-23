package sso

import (
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"encoding/pem"
	"errors"
	"fmt"
	"net"
	"net/url"
	"strings"
	"time"

	"github.com/go-ldap/ldap/v3"
)

// What an LDAP server presents when TLS starts, read without checking it
// so that an administrator can choose to trust it (AUTH_LDAP_CA_CERT).

// LDAPServerCertificates is one server's certificate chain.
type LDAPServerCertificates struct {
	// Address is the host:port that answered.
	Address string
	// Chain is what the server sent, its own certificate first.
	Chain []*x509.Certificate
	// VerifyError is why the system's trust store does not accept the
	// chain for the host; nil when it does.
	VerifyError error
}

// ErrLDAPNoTLS is a server URI that cannot carry TLS.
var ErrLDAPNoTLS = errors.New("only ldap:// and ldaps:// servers present certificates")

// FetchLDAPServerCertificates reads the chain of the first server of uri
// (an AUTH_LDAP_SERVER_URI) that answers: ldaps:// servers when they
// connect, ldap:// servers after Start TLS, which is the only way they
// use a certificate.
func FetchLDAPServerCertificates(uri string, timeout time.Duration) (*LDAPServerCertificates, error) {
	var lastErr error
	for _, one := range uriSep.Split(strings.TrimSpace(uri), -1) {
		if one == "" {
			continue
		}
		res, err := fetchOne(one, timeout)
		if err == nil {
			return res, nil
		}
		if errors.Is(err, ErrLDAPNoTLS) {
			return nil, err
		}
		lastErr = err
	}
	if lastErr == nil {
		lastErr = errors.New("no server URI")
	}
	return nil, lastErr
}

func fetchOne(uri string, timeout time.Duration) (*LDAPServerCertificates, error) {
	u, err := url.Parse(uri)
	if err != nil || u.Host == "" {
		return nil, fmt.Errorf("invalid server URI %q", uri)
	}
	scheme := strings.ToLower(u.Scheme)
	if scheme != "ldap" && scheme != "ldaps" {
		return nil, ErrLDAPNoTLS
	}
	host, port := u.Hostname(), u.Port()
	if port == "" {
		port = map[string]string{"ldap": "389", "ldaps": "636"}[scheme]
	}
	// Nothing is trusted here: the chain is only read, and no bind or
	// search is sent over the connection.
	conf := &tls.Config{ServerName: host, InsecureSkipVerify: true} //nolint:gosec // the chain is shown for the administrator to judge
	type result struct {
		state tls.ConnectionState
		err   error
	}
	done := make(chan result, 1)
	// connected carries the connection (or is closed without one) before
	// done is sent, so whoever reads done can close it.
	connected := make(chan *ldap.Conn, 1)
	go func() {
		c, err := ldap.DialURL(scheme+"://"+net.JoinHostPort(host, port), ldap.DialWithDialer(&net.Dialer{Timeout: timeout}), ldap.DialWithTLSConfig(conf))
		if err != nil {
			close(connected)
			done <- result{err: err}
			return
		}
		connected <- c
		close(connected)
		c.SetTimeout(timeout)
		if scheme == "ldap" {
			if err := c.StartTLS(conf); err != nil {
				done <- result{err: err}
				return
			}
		}
		st, ok := c.TLSConnectionState()
		if !ok {
			done <- result{err: errors.New("the server did not start TLS")}
			return
		}
		done <- result{state: st}
	}()
	closeConn := func() {
		if c, ok := <-connected; ok {
			c.Close()
		}
	}
	timer := time.NewTimer(timeout)
	defer timer.Stop()
	var r result
	select {
	case r = <-done:
		closeConn()
	case <-timer.C:
		// Closing ends a handshake still waiting on the server.
		go closeConn()
		r = result{err: fmt.Errorf("no TLS handshake with %s within %s", net.JoinHostPort(host, port), timeout)}
	}
	if r.err != nil {
		return nil, r.err
	}
	if len(r.state.PeerCertificates) == 0 {
		return nil, errors.New("the server sent no certificate")
	}
	res := &LDAPServerCertificates{Address: net.JoinHostPort(host, port), Chain: r.state.PeerCertificates}
	opts := x509.VerifyOptions{DNSName: host, Intermediates: x509.NewCertPool()}
	for _, c := range res.Chain[1:] {
		opts.Intermediates.AddCert(c)
	}
	if _, err := res.Chain[0].Verify(opts); err != nil {
		res.VerifyError = err
	}
	return res, nil
}

// TrustPEM is what to trust for the server: the certificate authorities it
// sent, or its own certificate when it sent nothing else.
func (r *LDAPServerCertificates) TrustPEM() string {
	certs := r.Chain
	if len(certs) > 1 {
		certs = certs[1:]
	}
	var b strings.Builder
	for _, c := range certs {
		_ = pem.Encode(&b, &pem.Block{Type: "CERTIFICATE", Bytes: c.Raw})
	}
	return b.String()
}

// LeafOnly reports whether the server sent its own certificate alone, which
// must then be trusted itself (and replaced when it is renewed).
func (r *LDAPServerCertificates) LeafOnly() bool { return len(r.Chain) == 1 }

// CertFingerprint is a certificate's SHA-256 fingerprint, colon separated
// as openssl prints it.
func CertFingerprint(c *x509.Certificate) string {
	sum := sha256.Sum256(c.Raw)
	parts := make([]string, len(sum))
	for i, b := range sum {
		parts[i] = fmt.Sprintf("%02X", b)
	}
	return strings.Join(parts, ":")
}

// LDAPBindResult is what TestBind found.
type LDAPBindResult struct {
	// ServerURI is the server of AUTH_LDAP_SERVER_URI that answered.
	ServerURI string
	// TLS is how the connection is protected: "ldaps", "start_tls" or
	// "none".
	TLS string
	// BindDN is who the server accepted, "" for an anonymous bind.
	BindDN string
	// WhoAmI is the server's answer to the Who am I? operation, when it
	// gives one.
	WhoAmI string
}

// LDAPTestStage says how far TestBind got when it failed.
type LDAPTestStage string

const (
	LDAPTestConnect      LDAPTestStage = "connect"
	LDAPTestBind         LDAPTestStage = "bind"
	LDAPTestSearch       LDAPTestStage = "search"
	LDAPTestUserBind     LDAPTestStage = "user_bind"
	LDAPTestRequireGroup LDAPTestStage = "require_group"
	LDAPTestDenyGroup    LDAPTestStage = "deny_group"
)

// LDAPTrace is how far a login got, for the settings form's test login.
// Its methods do nothing on a nil trace, which is every real login.
type LDAPTrace struct {
	// ServerURI is the server that answered.
	ServerURI string
	// DNFrom is USER_DN_TEMPLATE or USER_SEARCH.
	DNFrom string
	// DN is the user's DN, once known.
	DN string
	// Matches is how many entries USER_SEARCH found.
	Matches int
	// SearchErrors are the user searches that failed (and were skipped,
	// as django-auth-ldap skipped them).
	SearchErrors []string
	// Stage is where the login stopped ("" when it got through) and
	// Reason why, when it was refused rather than failed.
	Stage  LDAPTestStage
	Reason string
	// When a group requirement refused the login: the user's memberOf
	// values as the directory gives them, and the groups GROUP_SEARCH and
	// GROUP_TYPE find (or why they could not be read).
	MemberOf    []string
	Groups      []string
	GroupsError string
}

func (t *LDAPTrace) set(f func(*LDAPTrace)) {
	if t != nil {
		f(t)
	}
}

func (t *LDAPTrace) stop(stage LDAPTestStage, reason string) {
	if t != nil {
		t.Stage, t.Reason = stage, reason
	}
}

// LDAPTestError is a TestBind failure and its stage.
type LDAPTestError struct {
	Stage LDAPTestStage
	Err   error
}

func (e *LDAPTestError) Error() string { return e.Err.Error() }
func (e *LDAPTestError) Unwrap() error { return e.Err }

// TestBind connects as a login would (the same servers, TLS and trusted
// certificates) and binds as AUTH_LDAP_BIND_DN, anonymously when the DN
// and password are empty. Nothing is searched.
func (c *LDAPConfig) TestBind() (*LDAPBindResult, error) {
	conn, uri, err := c.dialURI()
	if err != nil {
		return nil, &LDAPTestError{LDAPTestConnect, err}
	}
	defer conn.Close()
	res := &LDAPBindResult{ServerURI: uri, TLS: "none"}
	if _, ok := conn.TLSConnectionState(); ok {
		res.TLS = "start_tls"
		if strings.HasPrefix(strings.ToLower(uri), "ldaps:") {
			res.TLS = "ldaps"
		}
	}
	u := &LDAPUser{cfg: c, conn: conn}
	if err := u.bindService(); err != nil {
		return nil, &LDAPTestError{LDAPTestBind, err}
	}
	res.BindDN = c.BindDN
	if w, err := conn.WhoAmI(nil); err == nil {
		res.WhoAmI = w.AuthzID
	}
	return res, nil
}

// traceGroups records, for a test login a group requirement refused, the
// memberOf values the directory gives for the user and the groups the
// group settings find. Real logins (no trace) skip the extra search.
func (u *LDAPUser) traceGroups() {
	t := u.cfg.Trace
	if t == nil {
		return
	}
	t.MemberOf, _ = u.Attrs.Get("memberOf")
	groups, err := u.GroupDNs()
	if err != nil {
		t.GroupsError = err.Error()
		return
	}
	t.Groups = groups
}
