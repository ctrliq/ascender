package api

import (
	"context"
	"strings"
	"testing"
)

// A notification never connects to a cloud metadata service, whatever host
// its admin names.
func TestNotificationsRefuseMetadataAddresses(t *testing.T) {
	ctx := context.Background()
	for _, u := range []string{"http://169.254.169.254/latest/meta-data/", "http://100.100.100.200/", "http://168.63.129.16/"} {
		conf := NewOMap().Set("url", u).Set("http_method", "POST").Set("disable_ssl_verification", false)
		_, err := sendWebhook(ctx, conf, &outMessage{Body: NewOMap(), To: []string{u}})
		if err == nil || !strings.Contains(err.Error(), "refusing") {
			t.Errorf("webhook to %s: %v", u, err)
		}
	}
	conf := NewOMap().Set("host", "169.254.169.254").Set("port", float64(25)).Set("username", "").Set("password", "").
		Set("use_tls", false).Set("use_ssl", false).Set("sender", "a@example.com").Set("recipients", []any{"b@example.com"}).Set("timeout", float64(5))
	if _, err := sendEmail(ctx, conf, &outMessage{Subject: "s", Body: "b", From: "a@example.com", To: []string{"b@example.com"}}); err == nil || !strings.Contains(err.Error(), "refusing") {
		t.Errorf("email to the metadata address: %v", err)
	}
}
