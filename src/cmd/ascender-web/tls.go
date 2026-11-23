package main

import (
	"crypto/tls"
	"os"
	"sync"
	"time"
)

// keyPairLoader serves the certificate in two files and loads it again when
// either file has changed since.
type keyPairLoader struct {
	certFile, keyFile string

	mu       sync.Mutex
	cert     *tls.Certificate
	certTime time.Time
	keyTime  time.Time
}

func (l *keyPairLoader) get(*tls.ClientHelloInfo) (*tls.Certificate, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	ci, cerr := os.Stat(l.certFile)
	ki, kerr := os.Stat(l.keyFile)
	if l.cert != nil && (cerr != nil || kerr != nil || (ci.ModTime().Equal(l.certTime) && ki.ModTime().Equal(l.keyTime))) {
		// Unchanged, or being replaced right now: the one in hand serves.
		return l.cert, nil
	}
	cert, err := tls.LoadX509KeyPair(l.certFile, l.keyFile)
	if err != nil {
		if l.cert != nil {
			// A certificate and key caught mid-renewal do not match yet.
			return l.cert, nil
		}
		return nil, err
	}
	l.cert = &cert
	if cerr == nil && kerr == nil {
		l.certTime, l.keyTime = ci.ModTime(), ki.ModTime()
	}
	return l.cert, nil
}
