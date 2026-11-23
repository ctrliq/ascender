package tasks

import (
	"slices"
	"strings"
	"testing"
)

func TestEnvFile(t *testing.T) {
	got, err := envFile(map[string]string{"B": "two words", "A_1": "x=y", "_C": ""})
	if err != nil {
		t.Fatal(err)
	}
	if want := "A_1=x=y\nB=two words\n_C=\n"; string(got) != want {
		t.Errorf("envFile = %q, want %q", got, want)
	}
}

// A value or name that would add a line to env.list refuses the run: a
// bare name on its own line copies that variable from the client's
// environment (the task process's database password) into the container.
func TestEnvFileRefusesLineInjection(t *testing.T) {
	for name, env := range map[string]map[string]string{
		"newline in value":          {"AWS_ACCESS_KEY_ID": "x\nASCENDER_DB_PASSWORD\nASCENDER_*"},
		"carriage return in value":  {"V": "x\rY"},
		"NUL in value":              {"V": "x\x00y"},
		"newline in name":           {"A\nASCENDER_DB_PASSWORD": "x"},
		"name with a glob":          {"ASCENDER_*": "x"},
		"name starting with digit":  {"1A": "x"},
		"name with a space":         {"A B": "x"},
		"empty name":                {"": "x"},
		"name with an equals sign":  {"A=B": "x"},
		"name starting with a hash": {"#A": "x"},
	} {
		out, err := envFile(env)
		if err == nil {
			t.Errorf("%s: envFile accepted it: %q", name, out)
			continue
		}
		for _, v := range env {
			if v != "x" && strings.Contains(err.Error(), v) {
				t.Errorf("%s: the error shows the value: %v", name, err)
			}
		}
	}
}

func TestRuntimeClientEnvDropsSecrets(t *testing.T) {
	t.Setenv("ASCENDER_DB_PASSWORD", "hunter2")
	t.Setenv("ASCENDER_DATABASE_URL", "postgres://u:hunter2@db/x")
	t.Setenv("ASCENDER_SECRET_KEY", "k")
	t.Setenv("PGPASSWORD", "hunter2")
	t.Setenv("XDG_RUNTIME_DIR", "/run/user/1000")
	t.Setenv("CONTAINERS_CONF", "/etc/containers/containers.conf")
	env := runtimeClientEnv()
	for _, kv := range env {
		if strings.Contains(kv, "hunter2") || strings.HasPrefix(kv, "ASCENDER_") {
			t.Errorf("runtime client environment keeps %q", kv)
		}
	}
	for _, want := range []string{"XDG_RUNTIME_DIR=/run/user/1000", "CONTAINERS_CONF=/etc/containers/containers.conf"} {
		if !slices.Contains(env, want) {
			t.Errorf("runtime client environment lost %q", want)
		}
	}
}
