package tasks

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/ctrliq/ascender/internal/config"
)

// A credential read from the database renders its type's injectors in
// the order the jsonb column gives them (shorter keys first, not sorted),
// as the old code iterated the dict psycopg decoded, and knows which
// inputs it holds itself. No unified job is made.
func TestInjectorsFromTheDatabase(t *testing.T) {
	database := claimScratchDB(t)
	ctx := context.Background()
	ctID := insertRow(t, database, "main_credentialtype", map[string]any{"name": "zz-custom", "kind": "cloud", "managed": false,
		"inputs":    `{"fields": [{"id": "token", "type": "string", "label": "Token", "secret": true}, {"id": "flag", "type": "boolean", "label": "Flag"}]}`,
		"injectors": `{"env": {"ZZ_TOKEN": "{{ token | lower }}", "ZZ_FLAG": "{{ flag }}"}, "extra_vars": {"zz_long_name": "{{ token }}", "zz_b": "b", "zz_aa": "{% if flag %}y{% else %}n{% endif %}"}}`})
	credID := insertRow(t, database, "main_credential", map[string]any{"name": "zz-cred", "credential_type_id": ctID, "managed": false,
		"inputs": `{"token": "ABC"}`})
	d := &Dispatcher{DB: database, Cfg: &config.Config{}}
	creds, err := d.loadCredentials(ctx, []int64{credID})
	if err != nil {
		t.Fatal(err)
	}
	c := creds[0]
	if !c.storedInput("token") || c.storedInput("flag") {
		t.Errorf("stored: %v", c.stored)
	}
	pdd := t.TempDir()
	if err := os.MkdirAll(filepath.Join(pdd, "env"), 0o700); err != nil {
		t.Fatal(err)
	}
	env, safe := map[string]string{}, map[string]string{}
	var args []string
	ci := &credInjector{d: d, ctx: ctx, pdd: pdd, logf: func(string, ...any) {}}
	if err := ci.injectCredential(c, env, safe, &args); err != nil {
		t.Fatal(err)
	}
	if env["ZZ_TOKEN"] != "abc" || safe["ZZ_TOKEN"] != "**********" || env["ZZ_FLAG"] != "False" {
		t.Errorf("env %v safe %v", env, safe)
	}
	if len(args) != 2 {
		t.Fatalf("args: %v", args)
	}
	b, err := os.ReadFile(filepath.Join(pdd, strings.TrimPrefix(args[1], "@/runner/")))
	if err != nil {
		t.Fatal(err)
	}
	want := "!unsafe 'zz_b': !unsafe 'b'\n!unsafe 'zz_aa': !unsafe 'n'\n!unsafe 'zz_long_name': !unsafe 'ABC'\n"
	if string(b) != want {
		t.Errorf("extra vars:\n%s\nwant:\n%s", b, want)
	}
}
