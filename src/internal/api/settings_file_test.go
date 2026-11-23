package api

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/ctrliq/ascender/internal/settings"
)

// A setting of the deployment's file gets the validation a PUT of it would:
// what passes stays the file's, read-only for the API; what fails goes back
// to being the database's.
func TestCheckFileSettings(t *testing.T) {
	reg, err := settings.LoadRegistry()
	if err != nil {
		t.Fatal(err)
	}
	store := settings.NewStore(nil, reg, "")
	path := filepath.Join(t.TempDir(), "settings.json")
	if err := os.WriteFile(path, []byte(`{
		"IS_K8S": true,
		"SESSION_COOKIE_AGE": 30,
		"SESSIONS_PER_USER": 5,
		"REMOTE_HOST_HEADERS": ["HTTP_X_FORWARDED_FOR", "REMOTE_ADDR"],
		"ASCENDER_TASK_ENV": {"HTTPS_PROXY": "http://proxy:3128"},
		"DEFAULT_JOB_TIMEOUT": -1
	}`), 0o600); err != nil {
		t.Fatal(err)
	}
	if problems, err := store.LoadFile(path); err != nil || len(problems) != 0 {
		t.Fatalf("LoadFile: %v, %v", problems, err)
	}
	s := &Server{Settings: store}
	ctx := context.Background()
	problems := s.CheckFileSettings(ctx)
	got := map[string]string{}
	for _, p := range problems {
		got[p.Key] = p.Reason
	}
	// SESSION_COOKIE_AGE has a minimum of a minute, DEFAULT_JOB_TIMEOUT of zero.
	for _, key := range []string{"SESSION_COOKIE_AGE", "DEFAULT_JOB_TIMEOUT"} {
		if !strings.Contains(got[key], "greater than or equal to") {
			t.Errorf("%s: problem %q", key, got[key])
		}
		if store.DefinedInFile(key) {
			t.Errorf("%s is still the file's", key)
		}
		if f, _ := reg.Field(key); f.ReadOnly || f.DefinedInFile {
			t.Errorf("%s is still read-only", key)
		}
	}
	if len(problems) != 2 {
		t.Errorf("problems = %v", problems)
	}
	if !store.Bool(ctx, "IS_K8S") {
		t.Error("IS_K8S was dropped")
	}
	if n := store.Int(ctx, "SESSIONS_PER_USER"); n != 5 {
		t.Errorf("SESSIONS_PER_USER = %d", n)
	}
	if l := store.List(ctx, "REMOTE_HOST_HEADERS"); len(l) != 2 || l[0] != "HTTP_X_FORWARDED_FOR" {
		t.Errorf("REMOTE_HOST_HEADERS = %v", l)
	}
	v, _ := store.Get(ctx, "ASCENDER_TASK_ENV")
	if m, ok := v.(map[string]any); !ok || m["HTTPS_PROXY"] != "http://proxy:3128" {
		t.Errorf("ASCENDER_TASK_ENV = %#v", v)
	}
	if f, _ := reg.Field("SESSIONS_PER_USER"); !f.ReadOnly || !f.DefinedInFile {
		t.Error("SESSIONS_PER_USER is not read-only")
	}
}
