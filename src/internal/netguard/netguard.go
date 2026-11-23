// Package netguard keeps connections that users aim (a credential lookup's
// URL, a notification's host, a webhook's status URL) away from the cloud
// metadata services, which hand out the instance's own credentials to
// anything on the host that asks.
package netguard

import (
	"context"
	"fmt"
	"net"
	"syscall"
	"time"
)

// metadataAddrs are metadata services outside the link-local ranges.
var metadataAddrs = []net.IP{
	net.ParseIP("fd00:ec2::254"),   // AWS, IPv6
	net.ParseIP("100.100.100.200"), // Alibaba Cloud
	net.ParseIP("192.0.0.192"),     // Oracle Cloud
	net.ParseIP("168.63.129.16"),   // Azure wireserver
}

// Refused reports why ip may not be dialed, or "" when it may: link-local
// addresses (169.254.169.254 serves AWS, GCP, Azure and OpenStack metadata,
// 169.254.170.2 ECS task credentials) and the metadata addresses above.
// Loopback and private ranges stay allowed: a local mail relay or an
// internal Vault are ordinary destinations.
func Refused(ip net.IP) string {
	if ip == nil {
		return ""
	}
	if ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() {
		return "link-local"
	}
	for _, m := range metadataAddrs {
		if ip.Equal(m) {
			return "cloud metadata"
		}
	}
	return ""
}

// Control is a net.Dialer Control that refuses what Refused names. It runs
// on the address actually dialed, after name resolution, so a name that
// resolves (or rebinds) to a metadata address is refused too.
func Control(_, address string, _ syscall.RawConn) error {
	host, _, err := net.SplitHostPort(address)
	if err != nil {
		return err
	}
	if why := Refused(net.ParseIP(host)); why != "" {
		return fmt.Errorf("refusing to connect to %s address %s", why, host)
	}
	return nil
}

// Dialer is a net.Dialer with Control and the given connect timeout.
func Dialer(timeout time.Duration) *net.Dialer {
	return &net.Dialer{Timeout: timeout, KeepAlive: 30 * time.Second, Control: Control}
}

// CheckHost refuses a host whose address Refused names, resolving a name
// here. It is for a connection that goes through a proxy, where Control
// only ever sees the proxy's address: the target is checked before the
// request is handed over. A name that does not resolve here is left to
// the proxy, which may know names this host does not.
func CheckHost(ctx context.Context, host string) error {
	if ip := net.ParseIP(host); ip != nil {
		if why := Refused(ip); why != "" {
			return fmt.Errorf("refusing to connect to %s address %s", why, host)
		}
		return nil
	}
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	addrs, err := net.DefaultResolver.LookupIPAddr(ctx, host)
	if err != nil {
		return nil
	}
	for _, a := range addrs {
		if why := Refused(a.IP); why != "" {
			return fmt.Errorf("refusing to connect to %s (%s address %s)", host, why, a.IP)
		}
	}
	return nil
}
