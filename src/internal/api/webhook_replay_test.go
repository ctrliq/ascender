package api

import (
	"testing"
	"time"
)

func TestWebhookBodyReplay(t *testing.T) {
	c := &webhookBodyCache{seen: map[[32]byte]time.Time{}}
	body := []byte(`{"ref":"refs/heads/main"}`)
	if !c.firstUse("job_templates", 7, "github", body) {
		t.Fatal("first delivery refused")
	}
	if c.firstUse("job_templates", 7, "github", body) {
		t.Fatal("replayed body accepted")
	}
	if !c.firstUse("job_templates", 8, "github", body) || !c.firstUse("job_templates", 7, "github", []byte(`{"ref":"x"}`)) {
		t.Fatal("other template or body refused")
	}
}
