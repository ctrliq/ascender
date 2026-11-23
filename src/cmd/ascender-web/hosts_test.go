package main

import "testing"

func TestHostAllowed(t *testing.T) {
	p := []string{"ascender.example.com", ".corp.test", "10.0.0.5"}
	for host, want := range map[string]bool{
		"ascender.example.com": true, "ASCENDER.example.com:443": true, "corp.test": true, "a.b.corp.test:8080": true,
		"10.0.0.5:8070": true, "evil.com": false, "ascender.example.com.evil.com": false, "xcorp.test": false,
	} {
		if got := hostAllowed(host, p); got != want {
			t.Errorf("%s: %v, want %v", host, got, want)
		}
	}
	if !hostAllowed("anything", []string{"*"}) {
		t.Error("* refused")
	}
}
