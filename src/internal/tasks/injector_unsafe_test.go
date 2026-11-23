package tasks

import (
	"os"
	"path/filepath"
	"testing"
)

// A custom type's extra_vars injector is written as safe_dump wrote it:
// the credential's values arrive tagged !unsafe, so Ansible never
// templates what a credential owner typed.
func TestInjectorExtraVarsAreUnsafe(t *testing.T) {
	pdd := t.TempDir()
	if err := os.MkdirAll(filepath.Join(pdd, "env"), 0o700); err != nil {
		t.Fatal(err)
	}
	ci := &credInjector{pdd: pdd, logf: func(string, ...any) {}}
	c := &credentialData{
		inputs:    map[string]any{"token": "{{ lookup('pipe', 'id') }}"},
		injectors: map[string]any{"extra_vars": map[string]any{"api_token": "{{ token }}", "nested": map[string]any{"t": "{{ token }}"}}},
	}
	var args []string
	if err := ci.injectCredential(c, map[string]string{}, map[string]string{}, &args); err != nil {
		t.Fatal(err)
	}
	if len(args) != 2 || args[0] != "-e" {
		t.Fatalf("args: %v", args)
	}
	entries, _ := os.ReadDir(filepath.Join(pdd, "env"))
	if len(entries) != 1 {
		t.Fatalf("env files: %v", entries)
	}
	b, err := os.ReadFile(filepath.Join(pdd, "env", entries[0].Name()))
	if err != nil {
		t.Fatal(err)
	}
	want := "!unsafe 'api_token': !unsafe '{{ lookup(''pipe'', ''id'') }}'\n!unsafe 'nested':\n  !unsafe 't': !unsafe '{{ lookup(''pipe'', ''id'') }}'\n"
	if string(b) != want {
		t.Fatalf("extra vars file:\n%s\nwant:\n%s", b, want)
	}
}
