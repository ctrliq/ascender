package api

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/ctrliq/ascender/internal/auth"
)

// A notification admin cannot move a stored secret to another destination
// by changing the type without a configuration, by parking keys of
// another type beside it, or by turning TLS verification off.
func TestNotificationSecretsStayWithTheirDestination(t *testing.T) {
	s := &Server{}
	ctx := auth.WithUser(context.Background(), &auth.User{ID: 2})
	email := &notificationTemplate{ID: 1, Name: "n", NotificationType: "email", Configuration: json.RawMessage(`{"host": "smtp.example.com", "port": 25,
		"username": "u", "password": "$encrypted$UTF8$AESCBC$QUJD", "use_tls": false, "use_ssl": false, "sender": "a@example.com",
		"recipients": ["b@example.com"], "timeout": 30}`)}
	body := func(js string) *OMap {
		t.Helper()
		v, err := decodeOrdered(js)
		if err != nil {
			t.Fatal(err)
		}
		return v.(*OMap)
	}
	// The type alone.
	if _, err := s.validateNotificationTemplate(ctx, body(`{"notification_type": "webhook"}`), true, email); err == nil || !strings.Contains(err.Error(), "notification_configuration") {
		t.Errorf("type change without configuration: %v", err)
	}
	// Another type's keys beside the kept password are dropped.
	out, err := s.validateNotificationTemplate(ctx, body(`{"notification_configuration": {"host": "smtp.example.com", "port": 25, "username": "u",
		"password": "$encrypted$", "use_tls": false, "use_ssl": false, "sender": "a@example.com", "recipients": ["b@example.com"], "timeout": 30,
		"url": "https://attacker.example/", "http_method": "POST", "headers": {}}}`), true, email)
	if err != nil {
		t.Fatal(err)
	}
	for _, k := range []string{"url", "http_method", "headers"} {
		if out.Config.Has(k) {
			t.Errorf("kept %q", k)
		}
	}
	if v, _ := out.Config.Get("password"); v != "$encrypted$UTF8$AESCBC$QUJD" {
		t.Errorf("password not kept: %v", v)
	}
	// Matrix: turning verification off is a change of destination.
	matrix := &notificationTemplate{ID: 2, Name: "m", NotificationType: "matrix", Configuration: json.RawMessage(`{"homeserver_url": "https://matrix.example.com",
		"access_token": "$encrypted$UTF8$AESCBC$QUJD", "rooms": ["!r:example.com"], "use_html": true, "disable_ssl_verification": false}`)}
	_, err = s.validateNotificationTemplate(ctx, body(`{"notification_configuration": {"homeserver_url": "https://matrix.example.com",
		"access_token": "$encrypted$", "rooms": ["!r:example.com"], "use_html": true, "disable_ssl_verification": true}}`), true, matrix)
	if err == nil || !strings.Contains(err.Error(), "Re-enter access_token") {
		t.Errorf("matrix verification off: %v", err)
	}
	// Whatever is stored, encrypted values read $encrypted$.
	legacy := &notificationTemplate{NotificationType: "webhook", Configuration: json.RawMessage(`{"url": "https://x.example", "password": "$encrypted$UTF8$AESCBC$QUJD", "stale": "$encrypted$UTF8$AESCBC$REVG"}`)}
	for _, k := range []string{"password", "stale"} {
		if v, _ := displayNotificationConfiguration(legacy).Get(k); v != "$encrypted$" {
			t.Errorf("display %s = %v", k, v)
		}
	}
}
