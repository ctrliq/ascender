package sso

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"errors"
	"math/big"
	"net"
	"strings"
	"testing"
	"time"
)

// testCA makes a CA and a server certificate for 127.0.0.1 it signed.
func testCA(t *testing.T) (caPEM string, ca *x509.Certificate, leaf tls.Certificate) {
	t.Helper()
	caKey, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	caTmpl := &x509.Certificate{SerialNumber: big.NewInt(1), Subject: pkix.Name{CommonName: "zz test CA"}, NotBefore: time.Now().Add(-time.Hour), NotAfter: time.Now().Add(time.Hour),
		IsCA: true, BasicConstraintsValid: true, KeyUsage: x509.KeyUsageCertSign}
	caDER, err := x509.CreateCertificate(rand.Reader, caTmpl, caTmpl, &caKey.PublicKey, caKey)
	if err != nil {
		t.Fatal(err)
	}
	ca, _ = x509.ParseCertificate(caDER)
	key, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	tmpl := &x509.Certificate{SerialNumber: big.NewInt(2), Subject: pkix.Name{CommonName: "zz ldap"}, NotBefore: time.Now().Add(-time.Hour), NotAfter: time.Now().Add(time.Hour),
		IPAddresses: []net.IP{net.ParseIP("127.0.0.1")}, ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth}}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, ca, &key.PublicKey, caKey)
	if err != nil {
		t.Fatal(err)
	}
	caPEM = string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: caDER}))
	return caPEM, ca, tls.Certificate{Certificate: [][]byte{der, caDER}, PrivateKey: key}
}

// tlsListener accepts TLS connections and completes their handshakes, as
// the start of an ldaps:// session.
func tlsListener(t *testing.T, cert tls.Certificate) string {
	t.Helper()
	ln, err := tls.Listen("tcp", "127.0.0.1:0", &tls.Config{Certificates: []tls.Certificate{cert}})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { ln.Close() })
	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			go func() {
				_ = c.(*tls.Conn).Handshake()
				buf := make([]byte, 1)
				_, _ = c.Read(buf)
				c.Close()
			}()
		}
	}()
	return ln.Addr().String()
}

func TestFetchLDAPServerCertificates(t *testing.T) {
	caPEM, ca, leaf := testCA(t)
	addr := tlsListener(t, leaf)
	res, err := FetchLDAPServerCertificates("ldaps://127.0.0.1:1 ldaps://"+addr, 2*time.Second)
	if err != nil {
		t.Fatal(err)
	}
	if res.Address != addr || len(res.Chain) != 2 || res.LeafOnly() {
		t.Fatalf("got %s with %d certificates", res.Address, len(res.Chain))
	}
	if res.VerifyError == nil {
		t.Error("a private CA was accepted by the system trust store")
	}
	if res.TrustPEM() != caPEM {
		t.Errorf("TrustPEM is not the CA:\n%s", res.TrustPEM())
	}
	if fp := CertFingerprint(ca); len(fp) != 95 || strings.ToUpper(fp) != fp {
		t.Errorf("fingerprint %q", fp)
	}

	if _, err := FetchLDAPServerCertificates("https://"+addr, time.Second); err != ErrLDAPNoTLS {
		t.Errorf("https:// gave %v", err)
	}
	if _, err := FetchLDAPServerCertificates("ldaps://127.0.0.1:1", time.Second); err == nil {
		t.Error("a closed port gave no error")
	}
}

func TestLDAPCACertTrusted(t *testing.T) {
	caPEM, _, leaf := testCA(t)
	addr := tlsListener(t, leaf)
	dial := func(c *LDAPConfig) error {
		c.ServerURI, c.Options = "ldaps://"+addr, map[string]any{"OPT_NETWORK_TIMEOUT": 2}
		conn, _, err := c.dialURI()
		if err == nil {
			conn.Close()
		}
		return err
	}
	if err := dial(&LDAPConfig{}); err == nil || !strings.Contains(err.Error(), "unknown authority") {
		t.Errorf("without CA_CERT: %v", err)
	}
	if err := dial(&LDAPConfig{CACert: caPEM}); err != nil {
		t.Errorf("with CA_CERT: %v", err)
	}
	if err := dial(&LDAPConfig{CACert: "not a certificate"}); err == nil {
		t.Error("a CA_CERT without certificates was accepted")
	}
}

func TestLDAPTestBindStages(t *testing.T) {
	caPEM, _, leaf := testCA(t)
	addr := tlsListener(t, leaf)
	opts := map[string]any{"OPT_NETWORK_TIMEOUT": 2}
	_, err := (&LDAPConfig{ServerURI: "ldaps://" + addr, Options: opts}).TestBind()
	var te *LDAPTestError
	var unknown x509.UnknownAuthorityError
	if !errors.As(err, &te) || te.Stage != LDAPTestConnect || !errors.As(err, &unknown) {
		t.Errorf("untrusted server: %#v", err)
	}
	// Trusted, but the listener is no LDAP server: the bind fails.
	_, err = (&LDAPConfig{ServerURI: "ldaps://" + addr, CACert: caPEM, BindDN: "cn=zz", BindPassword: "zz", Options: opts}).TestBind()
	if !errors.As(err, &te) || te.Stage != LDAPTestBind {
		t.Errorf("bind against a TLS listener: %#v", err)
	}
}
