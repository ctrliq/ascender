package settings

import (
	"context"
	"strings"
	"testing"
)

func TestLoadFile(t *testing.T) {
	reg, err := LoadRegistry()
	if err != nil {
		t.Fatal(err)
	}
	s := NewStore(nil, reg, "")
	problems, err := s.loadFile("test.json", []byte(`{
		"IS_K8S": true,
		"DISABLE_ALL_SCHEDULES": true,
		"SESSION_COOKIE_AGE": 3600,
		"AUTH_LDAP_BIND_PASSWORD": "s3cret",
		"ASCENDER_TASK_ENV": {"B": "2", "A": "1"},
		"REMOTE_HOST_HEADERS": ["HTTP_X_FORWARDED_FOR"],
		"MAX_FORKS": "many",
		"SESSIONS_PER_USER": 1.5,
		"INSTALL_UUID": "x",
		"STATIC_ROOT": "/var/lib/ascender/public/static",
		"CUSTOM_LOGIN_INFO": null
	}`))
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	if !s.Bool(ctx, "IS_K8S") || !s.Bool(ctx, "DISABLE_ALL_SCHEDULES") {
		t.Error("the file-only booleans were not taken")
	}
	if got := s.Int(ctx, "SESSION_COOKIE_AGE"); got != 3600 {
		t.Errorf("SESSION_COOKIE_AGE = %d", got)
	}
	if got := s.String(ctx, "AUTH_LDAP_BIND_PASSWORD"); got != "s3cret" {
		t.Errorf("AUTH_LDAP_BIND_PASSWORD = %q", got)
	}
	if got := s.List(ctx, "REMOTE_HOST_HEADERS"); len(got) != 1 || got[0] != "HTTP_X_FORWARDED_FOR" {
		t.Errorf("REMOTE_HOST_HEADERS = %v", got)
	}
	// A dictionary keeps the order it was written in.
	if raw, ok := s.Raw(ctx, "ASCENDER_TASK_ENV"); !ok || string(raw) != `{"B": "2", "A": "1"}` {
		t.Errorf("ASCENDER_TASK_ENV raw = %s, %v", raw, ok)
	}
	// A null is a value: the file's, not the default.
	if v, ok := s.Get(ctx, "CUSTOM_LOGIN_INFO"); !ok || v != nil {
		t.Errorf("CUSTOM_LOGIN_INFO = %v, %v", v, ok)
	}
	// What the file gives is read-only for the API, as a setting a settings
	// file defined was; what it does not give is not.
	for key, want := range map[string]bool{"SESSION_COOKIE_AGE": true, "AUTH_LDAP_BIND_PASSWORD": true, "MAX_FORKS": false, "SESSIONS_PER_USER": false} {
		f, _ := reg.Field(key)
		if f.ReadOnly != want || f.DefinedInFile != want || s.DefinedInFile(key) != want {
			t.Errorf("%s: read_only %v, defined_in_file %v, in file %v; want %v", key, f.ReadOnly, f.DefinedInFile, s.DefinedInFile(key), want)
		}
	}
	// A setting that was read-only already says nothing about files.
	if f, _ := reg.Field("IS_K8S"); f.DefinedInFile {
		t.Error("IS_K8S reports defined_in_file")
	}
	got := map[string]string{}
	for _, p := range problems {
		got[p.Key] = p.Reason
	}
	for key, want := range map[string]string{
		"MAX_FORKS":         "expected integer, got string",
		"SESSIONS_PER_USER": "expected integer, got number",
		"INSTALL_UUID":      "worked out by the application",
		"STATIC_ROOT":       "not a setting this application reads",
	} {
		if !strings.Contains(got[key], want) {
			t.Errorf("%s: problem %q, want %q", key, got[key], want)
		}
	}
	if len(problems) != 4 {
		t.Errorf("problems = %v", problems)
	}
}

func TestLoadFileRejectsWhatIsNotAnObject(t *testing.T) {
	reg, err := LoadRegistry()
	if err != nil {
		t.Fatal(err)
	}
	for _, doc := range []string{`[]`, `"IS_K8S"`, `{"IS_K8S": true} {"IS_K8S": false}`, `{"IS_K8S": tru`, ``} {
		if _, err := NewStore(nil, reg, "").loadFile("test.json", []byte(doc)); err == nil {
			t.Errorf("%q was taken", doc)
		}
	}
}
