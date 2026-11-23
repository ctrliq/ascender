package tasks

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/ctrliq/ascender/internal/models"
)

// injectRig runs injectCredential for a credential of a custom type with
// the given fields, injectors (JSON, in their stored order) and inputs.
type injectRig struct {
	t    *testing.T
	pdd  string
	logs []string
}

func newInjectRig(t *testing.T) *injectRig {
	pdd := t.TempDir()
	if err := os.MkdirAll(filepath.Join(pdd, "env"), 0o700); err != nil {
		t.Fatal(err)
	}
	return &injectRig{t: t, pdd: pdd}
}

func (g *injectRig) cred(fields []models.CredentialField, injectors string, inputs map[string]any) *credentialData {
	g.t.Helper()
	c := &credentialData{ID: 1, typeIn: models.CredentialTypeInputs{Fields: fields}, inputs: map[string]any{}, stored: map[string]bool{}, dynamic: map[string]bool{}, injectorsRaw: json.RawMessage(injectors)}
	if err := json.Unmarshal([]byte(injectors), &c.injectors); err != nil {
		g.t.Fatal(err)
	}
	for k, v := range inputs {
		c.inputs[k] = v
		c.stored[k] = true
	}
	return c
}

func (g *injectRig) inject(c *credentialData, env map[string]string) (map[string]string, map[string]string, []string, error) {
	if env == nil {
		env = map[string]string{}
	}
	safe := map[string]string{}
	var args []string
	ci := &credInjector{pdd: g.pdd, logf: func(msg string, _ ...any) { g.logs = append(g.logs, msg) }}
	err := ci.injectCredential(c, env, safe, &args)
	return env, safe, args, err
}

// readContainerFile reads the file a /runner path names.
func (g *injectRig) readContainerFile(p string) string {
	g.t.Helper()
	rel, ok := strings.CutPrefix(p, "/runner/")
	if !ok {
		g.t.Fatalf("not a container path: %q", p)
	}
	b, err := os.ReadFile(filepath.Join(g.pdd, rel))
	if err != nil {
		g.t.Fatal(err)
	}
	return string(b)
}

// C1: the injectors are Jinja, filters and statements included, rendered
// against the inputs and, for the stored environment, the masked inputs.
func TestInjectorsRenderJinja(t *testing.T) {
	g := newInjectRig(t)
	fields := []models.CredentialField{{ID: "user", Type: "string"}, {ID: "pass", Type: "string", Secret: true}, {ID: "debug", Type: "boolean"}, {ID: "region", Type: "string"}}
	injectors := `{"file": {"template": "[auth]\nuser={{ user | upper }}\n{% if debug %}debug=1\n{% endif %}"},
		"env": {"MY_USER": "{{ user | default('nobody') }}-{{ region | default('none', true) }}", "MY_PASS": "{{ pass }}", "MY_CFG": "{{ tower.filename }}", "MY_CFG2": "{{ ascender.filename }}",
			"MY_DEBUG": "{{ debug }}", "MY_JOIN": "{{ [user, 'x'] | join(',') }}"},
		"extra_vars": {"{{ user }}_var": "{{ pass | length }}", "nested": {"list": ["{{ user }}", "{% if debug %}on{% else %}off{% endif %}"]}}}`
	c := g.cred(fields, injectors, map[string]any{"user": "alice", "pass": "s3cret", "debug": true, "region": ""})
	env, safe, args, err := g.inject(c, nil)
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]string{"MY_USER": "alice-none", "MY_PASS": "s3cret", "MY_DEBUG": "True", "MY_JOIN": "alice,x"}
	for k, v := range want {
		if env[k] != v {
			t.Errorf("env %s = %q, want %q", k, env[k], v)
		}
	}
	if safe["MY_PASS"] != hiddenPassword || safe["MY_USER"] != "alice-none" {
		t.Errorf("safe env: %v", safe)
	}
	if env["MY_CFG"] == "" || env["MY_CFG"] != env["MY_CFG2"] || safe["MY_CFG"] != env["MY_CFG"] {
		t.Fatalf("filename: %q %q %q", env["MY_CFG"], env["MY_CFG2"], safe["MY_CFG"])
	}
	if got := g.readContainerFile(env["MY_CFG"]); got != "[auth]\nuser=ALICE\ndebug=1\n" {
		t.Errorf("file: %q", got)
	}
	if len(args) != 2 || args[0] != "-e" {
		t.Fatalf("args: %v", args)
	}
	ev := g.readContainerFile(strings.TrimPrefix(args[1], "@"))
	// (PyYAML wrote the list items without the indent; the YAML reads the
	// same.)
	wantEV := "!unsafe 'alice_var': !unsafe '6'\n!unsafe 'nested':\n  !unsafe 'list':\n    - !unsafe 'alice'\n    - !unsafe 'on'\n"
	if ev != wantEV {
		t.Errorf("extra vars:\n%s\nwant:\n%s", ev, wantEV)
	}
}

// Multi-file injectors: each file is written in the stored order, and a
// later template sees the paths of the files written before it.
func TestInjectorFilesInOrder(t *testing.T) {
	g := newInjectRig(t)
	fields := []models.CredentialField{{ID: "key", Type: "string"}}
	injectors := `{"file": {"template.key": "{{ key }}", "template.cfg": "key_file={{ tower.filename.key }} missing={{ tower.filename.nope }}"},
		"env": {"KEY_FILE": "{{ ascender.filename.key }}", "CFG_FILE": "{{ ascender.filename.cfg }}"}}`
	c := g.cred(fields, injectors, map[string]any{"key": "abc"})
	env, _, args, err := g.inject(c, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(args) != 0 {
		t.Errorf("args: %v", args)
	}
	if got := g.readContainerFile(env["KEY_FILE"]); got != "abc" {
		t.Errorf("key file: %q", got)
	}
	if got := g.readContainerFile(env["CFG_FILE"]); got != "key_file="+env["KEY_FILE"]+" missing=" {
		t.Errorf("cfg file: %q (key file %s)", got, env["KEY_FILE"])
	}
}

// A template error fails the job with the exception's traceback, as the
// exception inject_credential let through did.
func TestInjectorTemplateErrorsFailTheJob(t *testing.T) {
	cases := map[string]string{
		`{"env": {"X": "{{ missing.attr }}"}}`:         "jinja2.exceptions.UndefinedError: 'missing' is undefined",
		`{"env": {"X": "{{ user }"}}`:                  "jinja2.exceptions.TemplateSyntaxError: unexpected '}'",
		`{"file": {"template": "{{ 1 / 0 }}"}}`:        "ZeroDivisionError: division by zero",
		`{"extra_vars": {"x": ["{{ user }}", 5]}}`:     "TypeError: Can't compile non template nodes",
		`{"env": {"X": "{{ ''.__class__.__mro__ }}"}}`: "jinja2.exceptions.SecurityError: access to attribute '__class__' of 'str' object is unsafe.",
		`{"env": {"X": "{{ tower.filename.a }}"}}`:     "jinja2.exceptions.UndefinedError: 'ascender.main.models.credential.ReservedNamespace object' has no attribute 'filename'",
	}
	for injectors, want := range cases {
		g := newInjectRig(t)
		c := g.cred([]models.CredentialField{{ID: "user", Type: "string"}}, injectors, map[string]any{"user": "u"})
		_, _, _, err := g.inject(c, nil)
		var ie *injectorError
		if !errors.As(err, &ie) {
			t.Errorf("%s: %v, want an injector error", injectors, err)
			continue
		}
		lines := strings.Split(strings.TrimRight(ie.traceback, "\n"), "\n")
		if !strings.HasPrefix(ie.traceback, "Traceback (most recent call last):\n") || lines[len(lines)-1] != want {
			t.Errorf("%s: traceback %q, want last line %q", injectors, ie.traceback, want)
		}
	}
}

// C2: the env injectors may set anything but Ansible's variables and
// ENV_BLOCKLIST; ASCENDER_* and AWX_* are allowed.
func TestInjectorEnvVarRule(t *testing.T) {
	g := newInjectRig(t)
	injectors := `{"env": {"ASCENDER_HOST": "{{ host }}", "ASCENDER_VERIFY_SSL": "{{ verify_ssl }}", "AWX_OTHER": "o", "MY_VAR": "m",
		"ANSIBLE_CONFIG": "bad", "PATH": "bad", "AWX_HOST": "bad", "JOB_ID": "bad", "INVENTORY_UPDATE_ID": "bad"}}`
	c := g.cred([]models.CredentialField{{ID: "host", Type: "string"}, {ID: "verify_ssl", Type: "boolean"}}, injectors, map[string]any{"host": "https://a.example"})
	env, safe, _, err := g.inject(c, nil)
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]string{"ASCENDER_HOST": "https://a.example", "ASCENDER_VERIFY_SSL": "False", "AWX_OTHER": "o", "MY_VAR": "m"}
	if fmt.Sprint(env) != fmt.Sprint(want) || fmt.Sprint(safe) != fmt.Sprint(want) {
		t.Errorf("env %v\nsafe %v\nwant %v", env, safe, want)
	}
	wantLogs := []string{
		"Ignoring prohibited env var ANSIBLE_CONFIG, reason: ['Environment variable ANSIBLE_CONFIG may affect Ansible configuration so its use is not allowed in credentials.']",
		"Ignoring prohibited env var AWX_HOST, reason: ['Environment variable AWX_HOST is not allowed to be used in credentials.']",
		"Ignoring prohibited env var INVENTORY_UPDATE_ID, reason: ['Environment variable INVENTORY_UPDATE_ID is not allowed to be used in credentials.']",
		"Ignoring prohibited env var JOB_ID, reason: ['Environment variable JOB_ID is not allowed to be used in credentials.']",
		"Ignoring prohibited env var PATH, reason: ['Environment variable PATH is not allowed to be used in credentials.']",
	}
	if strings.Join(g.logs, "\n") != strings.Join(wantLogs, "\n") {
		t.Errorf("logs:\n%s", strings.Join(g.logs, "\n"))
	}
}

// The managed "CIQ Ascender Automation Platform" type keeps its
// ASCENDER_* variables.
func TestInjectorManagedAscenderType(t *testing.T) {
	m, ok := models.ManagedCredentialTypes["ascender"]
	if !ok {
		t.Fatal("no managed ascender type")
	}
	g := newInjectRig(t)
	var in models.CredentialTypeInputs
	if err := json.Unmarshal(m.Inputs, &in); err != nil {
		t.Fatal(err)
	}
	c := g.cred(in.Fields, string(m.Injectors), map[string]any{"host": "https://a.example", "username": "admin", "password": "pw", "verify_ssl": true})
	c.Managed = true
	env, safe, _, err := g.inject(c, nil)
	if err != nil {
		t.Fatal(err)
	}
	for _, k := range []string{"ASCENDER_HOST", "ASCENDER_USERNAME", "ASCENDER_PASSWORD", "ASCENDER_VERIFY_SSL"} {
		if _, ok := env[k]; !ok {
			t.Errorf("%s missing: %v", k, env)
		}
	}
	if env["ASCENDER_PASSWORD"] != "pw" || safe["ASCENDER_PASSWORD"] != hiddenPassword {
		t.Errorf("password: %q / %q", env["ASCENDER_PASSWORD"], safe["ASCENDER_PASSWORD"])
	}
}

// C6: an inventory update (INVENTORY_UPDATE_ID in the environment) gets
// no extra vars from a custom type; its env and files still apply.
func TestInjectorNoExtraVarsForInventoryUpdates(t *testing.T) {
	g := newInjectRig(t)
	c := g.cred([]models.CredentialField{{ID: "token", Type: "string"}}, `{"env": {"TOKEN": "{{ token }}"}, "extra_vars": {"token": "{{ token }}"}}`, map[string]any{"token": "t"})
	env, _, args, err := g.inject(c, map[string]string{"INVENTORY_UPDATE_ID": "12"})
	if err != nil {
		t.Fatal(err)
	}
	if len(args) != 0 || env["TOKEN"] != "t" {
		t.Errorf("args %v env %v", args, env)
	}
	// Not even rendered: a broken extra var does not fail the update.
	c = g.cred(nil, `{"extra_vars": {"x": "{{ missing.attr }}"}}`, nil)
	if _, _, args, err := g.inject(c, map[string]string{"INVENTORY_UPDATE_ID": "12"}); err != nil || len(args) != 0 {
		t.Errorf("args %v err %v", args, err)
	}
	// A job gets them.
	c = g.cred([]models.CredentialField{{ID: "token", Type: "string"}}, `{"extra_vars": {"token": "{{ token }}"}}`, map[string]any{"token": "t"})
	if _, _, args, err := g.inject(c, nil); err != nil || len(args) != 2 {
		t.Errorf("args %v err %v", args, err)
	}
}

// C7: the namespace holds every input and looked up value as it is: a
// dict or list a lookup gave renders as Python shows it, an empty one is
// left out, and a value with no length (a number, None) fails the job
// with the TypeError len() raised.
func TestInjectorLookupValues(t *testing.T) {
	g := newInjectRig(t)
	fields := []models.CredentialField{{ID: "doc", Type: "string"}, {ID: "items", Type: "string", Secret: true}, {ID: "empty", Type: "string"}, {ID: "flag", Type: "boolean"}}
	injectors := `{"env": {"DOC": "{{ doc }}", "DOC_A": "{{ doc.a }}", "ITEMS": "{{ items | join('+') }}", "EMPTY": "{{ empty | default('unset') }}", "FLAG": "{{ flag }}"}}`
	c := g.cred(fields, injectors, nil)
	for k, v := range map[string]any{"doc": map[string]any{"a": "x", "b": []any{true, nil}}, "items": []any{"p", "q"}, "empty": map[string]any{}, "flag": true} {
		c.inputs[k] = v
		c.dynamic[k] = true
	}
	env, safe, _, err := g.inject(c, nil)
	if err != nil {
		t.Fatal(err)
	}
	// flag: a boolean field missing from the stored inputs is False,
	// whatever a lookup gave it.
	want := map[string]string{"DOC": "{'a': 'x', 'b': [True, None]}", "DOC_A": "x", "ITEMS": "p+q", "EMPTY": "unset", "FLAG": "False"}
	for k, v := range want {
		if env[k] != v {
			t.Errorf("env %s = %q, want %q", k, env[k], v)
		}
	}
	if safe["ITEMS"] != "*+*+*+*+*+*+*+*+*+*" || safe["DOC"] != want["DOC"] {
		t.Errorf("safe env: %v", safe)
	}

	for v, typ := range map[any]string{float64(5): "int", 1.5: "float", nil: "NoneType", json.Number("7"): "int"} {
		c := g.cred([]models.CredentialField{{ID: "n", Type: "string"}}, `{"env": {"N": "{{ n }}"}}`, nil)
		c.inputs["n"] = v
		c.dynamic["n"] = true
		_, _, _, err := g.inject(c, nil)
		var ie *injectorError
		if !errors.As(err, &ie) || !strings.HasSuffix(ie.traceback, fmt.Sprintf("TypeError: object of type '%s' has no len()\n", typ)) {
			t.Errorf("%#v: %v", v, err)
		}
	}
}

// The extra vars' top level is written in the injectors' stored order,
// as safe_dump wrote each entry of the rendered dict in turn.
func TestInjectorExtraVarsOrder(t *testing.T) {
	g := newInjectRig(t)
	c := g.cred([]models.CredentialField{{ID: "a", Type: "string"}}, `{"extra_vars": {"zeta": "1", "alpha": {"y": "{{ a }}", "b": "2"}, "{{ a }}": "k", "mid": "x"}}`, map[string]any{"a": "mid"})
	_, _, args, err := g.inject(c, nil)
	if err != nil {
		t.Fatal(err)
	}
	got := g.readContainerFile(strings.TrimPrefix(args[1], "@"))
	want := "!unsafe 'zeta': !unsafe '1'\n!unsafe 'alpha':\n  !unsafe 'b': !unsafe '2'\n  !unsafe 'y': !unsafe 'mid'\n!unsafe 'mid': !unsafe 'x'\n"
	if got != want {
		t.Errorf("extra vars:\n%s\nwant:\n%s", got, want)
	}
}

// Only ascender and tower are reserved (RESERVED_NAMESPACE_NAMES): a
// field may be called awx.
func TestInjectorReservedNames(t *testing.T) {
	g := newInjectRig(t)
	c := g.cred([]models.CredentialField{{ID: "awx", Type: "string"}}, `{"env": {"A": "{{ awx }}", "T": "{{ tower.filename }}|{{ ascender }}"}}`, map[string]any{"awx": "v"})
	env, _, _, err := g.inject(c, nil)
	if err != nil {
		t.Fatal(err)
	}
	if env["A"] != "v" || env["T"] != "|<ascender.main.models.credential.CredentialType.inject_credential.<locals>.ReservedNamespace object at 0x7f0000000000>" {
		t.Errorf("env: %v", env)
	}
}
