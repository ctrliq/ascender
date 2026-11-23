package tasks

import "testing"

// A custom credential type may inject a secret under any name; the worker
// reports the real environment, and only the run's own safe environment
// knows which values a credential put there.
func TestMergeWorkerEnvKeepsInjectedValuesHidden(t *testing.T) {
	worker := buildSafeEnv(map[string]string{"GITHUB_PAT": "ghp_real", "SVC_PWD": "hunter2", "X_AUTH": "s3cret", "ANSIBLE_FORCE_COLOR": "True", "RUNNER_ONLY": "1"})
	run := map[string]string{"GITHUB_PAT": hiddenPassword, "SVC_PWD": hiddenPassword, "X_AUTH": hiddenPassword, "ANSIBLE_FORCE_COLOR": "True"}
	got := mergeWorkerEnv(worker, run)
	for _, k := range []string{"GITHUB_PAT", "SVC_PWD", "X_AUTH"} {
		if got[k] != hiddenPassword {
			t.Errorf("%s = %q", k, got[k])
		}
	}
	if got["RUNNER_ONLY"] != "1" || got["ANSIBLE_FORCE_COLOR"] != "True" {
		t.Errorf("worker-only or plain values lost: %v", got)
	}
}
