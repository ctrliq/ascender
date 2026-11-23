package crypto

import (
	"encoding/base64"
	"testing"
	"time"
)

func TestSealOpen(t *testing.T) {
	tok, err := Seal("secret", "saml_relay_state", "sessionkey123")
	if err != nil {
		t.Fatal(err)
	}
	if v, err := Open("secret", "saml_relay_state", tok, time.Hour); err != nil || v != "sessionkey123" {
		t.Fatalf("open: %q %v", v, err)
	}
	if _, err := Open("secret", "other_purpose", tok, time.Hour); err == nil {
		t.Error("opened for another purpose")
	}
	if _, err := Open("other", "saml_relay_state", tok, time.Hour); err == nil {
		t.Error("opened with another key")
	}
	if _, err := Open("secret", "saml_relay_state", tok, -time.Second); err == nil {
		t.Error("expired token opened")
	}
	// Flip a bit of the HMAC's last byte, which always changes the token.
	raw, err := base64.RawURLEncoding.DecodeString(tok)
	if err != nil {
		t.Fatal(err)
	}
	raw[len(raw)-1] ^= 1
	if _, err := Open("secret", "saml_relay_state", base64.RawURLEncoding.EncodeToString(raw), time.Hour); err == nil {
		t.Error("tampered token opened")
	}
}
