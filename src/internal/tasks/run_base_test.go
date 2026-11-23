package tasks

import (
	"reflect"
	"testing"
)

func TestRunnerOutcome(t *testing.T) {
	flag := func(set bool) func() bool { return func() bool { return set } }
	cases := []struct {
		in        string
		cancelled bool
		status    string
		msg       string
	}{
		{"successful", false, "successful", ""},
		{"failed", false, "failed", ""},
		{"timeout", false, "failed", "Job terminated due to timeout"},
		{"error", false, "error", "Job terminated due to error"},
		{"canceled", true, "canceled", ""},
		{"canceled", false, "failed", "Task was canceled due to receiving a shutdown signal."},
	}
	for _, c := range cases {
		status, msg := runnerOutcome(c.in, flag(c.cancelled))
		if status != c.status || msg != c.msg {
			t.Errorf("runnerOutcome(%q, cancel flag %v) = %q, %q; want %q, %q", c.in, c.cancelled, status, msg, c.status, c.msg)
		}
	}
	// The cancel flag is only read for a cancel.
	runnerOutcome("timeout", func() bool { t.Fatal("cancel flag read for a timeout"); return false })
}

func TestFailedAndTemplateStatus(t *testing.T) {
	for status, failed := range map[string]bool{"successful": false, "failed": true, "error": true, "canceled": true} {
		if failedStatus(status) != failed {
			t.Errorf("failedStatus(%q) = %v", status, !failed)
		}
		want := "successful"
		if failed {
			want = "failed"
		}
		if got := templateJobStatus(failedStatus(status)); got != want {
			t.Errorf("templateJobStatus for %q = %q, want %q", status, got, want)
		}
	}
}

func TestAddRunnerEnv(t *testing.T) {
	// A job under podman with the fact cache and an extra callback path.
	env := map[string]string{"ANSIBLE_HOST_KEY_CHECKING": "True", "ANSIBLE_CALLBACK_PLUGINS": "/plugins"}
	addRunnerEnv(env, "podman", "42", true, true)
	want := map[string]string{
		"ANSIBLE_HOST_KEY_CHECKING":       "True",
		"ANSIBLE_CALLBACK_PLUGINS":        "/plugins:/runner/artifacts/42/callback",
		"ANSIBLE_STDOUT_CALLBACK":         "awx_display",
		"ANSIBLE_UNSAFE_WRITES":           "1",
		"AWX_ISOLATED_DATA_DIR":           "/runner/artifacts/42",
		"ANSIBLE_CACHE_PLUGIN_CONNECTION": "/runner/artifacts/42/fact_cache",
		"ANSIBLE_CACHE_PLUGIN":            "jsonfile",
		"ANSIBLE_RETRY_FILES_ENABLED":     "False",
		"RUNNER_OMIT_EVENTS":              "False",
		"RUNNER_ONLY_FAILED_EVENTS":       "False",
	}
	if !reflect.DeepEqual(env, want) {
		t.Errorf("podman job env:\n got %v\nwant %v", env, want)
	}

	// An inventory update under docker whose callback could not be
	// installed: no callback variables, no unsafe writes, no fact cache.
	env = map[string]string{}
	addRunnerEnv(env, "docker", "7", false, false)
	want = map[string]string{
		"AWX_ISOLATED_DATA_DIR":       "/runner/artifacts/7",
		"ANSIBLE_RETRY_FILES_ENABLED": "False",
		"ANSIBLE_HOST_KEY_CHECKING":   "False",
		"RUNNER_OMIT_EVENTS":          "False",
		"RUNNER_ONLY_FAILED_EVENTS":   "False",
	}
	if !reflect.DeepEqual(env, want) {
		t.Errorf("docker inventory update env:\n got %v\nwant %v", env, want)
	}
}

func TestTimeoutFrom(t *testing.T) {
	r := &baseRun{d: &Dispatcher{}}
	if got := r.timeoutFrom("DEFAULT_JOB_TIMEOUT", -1); got != 0 {
		t.Errorf("negative timeout = %d, want 0 (none)", got)
	}
	if got := r.timeoutFrom("DEFAULT_JOB_TIMEOUT", 30); got != 30 {
		t.Errorf("own timeout = %d, want 30", got)
	}
}

func TestBaseRunExplain(t *testing.T) {
	r := &baseRun{}
	r.explain("one")
	r.explain("")
	r.explain("one")
	r.explain("two")
	if r.explanation != "one\ntwo" {
		t.Errorf("explanation %q", r.explanation)
	}
	if got := r.takeExplanation(); got != "one\ntwo" || r.explanation != "" {
		t.Errorf("takeExplanation = %q, left %q", got, r.explanation)
	}
	r.pdd, r.id = "/pdd", 9
	if got := r.artifactDir(); got != "/pdd/artifacts/9" {
		t.Errorf("artifactDir = %q", got)
	}
	if r.owner() != "" || r.worker() {
		t.Errorf("a run with no hold, group or node: owner %q, worker %v", r.owner(), r.worker())
	}
}
