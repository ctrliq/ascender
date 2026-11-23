package netguard

import (
	"context"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestControl(t *testing.T) {
	for _, addr := range []string{"169.254.169.254:80", "169.254.170.2:80", "[fe80::1]:80", "[fd00:ec2::254]:80",
		"100.100.100.200:80", "192.0.0.192:80", "168.63.129.16:80", "[::ffff:169.254.169.254]:80"} {
		if err := Control("tcp", addr, nil); err == nil {
			t.Errorf("%s: allowed", addr)
		}
	}
	for _, addr := range []string{"127.0.0.1:25", "10.0.0.5:8200", "192.168.1.10:443", "[::1]:25", "93.184.215.14:443"} {
		if err := Control("tcp", addr, nil); err != nil {
			t.Errorf("%s: %v", addr, err)
		}
	}
}

// The check applies to the address dialed: a name resolving to a
// metadata address is refused, an ordinary one is not.
func TestDialerChecksResolvedAddress(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	defer srv.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	d := Dialer(2 * time.Second)
	conn, err := d.DialContext(ctx, "tcp", strings.TrimPrefix(srv.URL, "http://"))
	if err != nil {
		t.Fatalf("loopback: %v", err)
	}
	conn.Close()
	if _, err := d.DialContext(ctx, "tcp", net.JoinHostPort("169.254.169.254", "80")); err == nil || !strings.Contains(err.Error(), "refusing") {
		t.Errorf("metadata dial: %v", err)
	}
}
