package web

import (
	"strings"
	"testing"
)

func TestSanitizeLoginInfo(t *testing.T) {
	for _, bad := range []string{
		`<img/src/onerror=alert(1)>`, "<img src=x\tonerror=alert(1)>", `<a href="jav&#x61;script:alert(1)">x</a>`,
		`<meta http-equiv=refresh content="0;url=//evil">`, `<form action=//evil><input name=password></form>`,
		`<script>alert(1)</script>`, `<base href=//evil>`, `<svg onload=alert(1)>`, `<iframe src=//evil>`,
	} {
		got := strings.ToLower(sanitizeLoginInfo(bad))
		for _, s := range []string{"onerror", "onload", "javascript", "<meta", "<form", "<input", "<script", "<base", "<iframe", "<svg"} {
			if strings.Contains(got, s) {
				t.Errorf("%q kept %q: %q", bad, s, got)
			}
		}
	}
	if got := sanitizeLoginInfo(`<p>Welcome to <b>Ascender</b>. <a href="https://example.com/help">Help</a></p>`); !strings.Contains(got, "<b>Ascender</b>") || !strings.Contains(got, `href="https://example.com/help"`) {
		t.Errorf("simple markup lost: %q", got)
	}
}
