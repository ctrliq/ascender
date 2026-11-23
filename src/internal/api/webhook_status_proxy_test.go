package api

import (
	"net/http"
	"net/url"
	"testing"
)

// Through a proxy the webhook status post checks its target before the
// proxy is used: a metadata address is refused, an ordinary one goes to
// the proxy, and without a proxy nothing changes.
func TestWebhookStatusProxyChecksTarget(t *testing.T) {
	pu, _ := url.Parse("http://proxy.example.invalid:3128")
	proxy := webhookStatusProxy(func(*http.Request) (*url.URL, error) { return pu, nil })
	for _, target := range []string{"http://169.254.169.254/latest/meta-data/", "http://100.100.100.200/"} {
		r, _ := http.NewRequest("POST", target, nil)
		if p, err := proxy(r); err == nil {
			t.Errorf("%s went to proxy %v", target, p)
		}
	}
	r, _ := http.NewRequest("POST", "http://forge.example.invalid/api/statuses/abc", nil)
	if p, err := proxy(r); err != nil || p != pu {
		t.Errorf("an ordinary target: %v, %v", p, err)
	}
	none := webhookStatusProxy(func(*http.Request) (*url.URL, error) { return nil, nil })
	if p, err := none(r); err != nil || p != nil {
		t.Errorf("no proxy: %v, %v", p, err)
	}
	if p, err := webhookStatusProxy(nil)(r); err != nil || p != nil {
		t.Errorf("nil proxy func: %v, %v", p, err)
	}
}
