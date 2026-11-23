package tasks

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

// A pod the cluster refuses for the namespace's resource quota sends the
// job back to pending, as the old _handle_work_error did, unless the job
// cannot run again; then it fails with the cluster's message.
func TestPodQuotaRequeues(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusForbidden)
		_, _ = io.WriteString(w, `{"kind":"Status","status":"Failure","reason":"Forbidden","code":403,
			"message":"pods \"automation-job-1-abcde\" is forbidden: exceeded quota: compute, requested: limits.cpu=2, used: limits.cpu=4, limited: limits.cpu=4"}`)
	}))
	defer srv.Close()
	u, _ := url.Parse(srv.URL)
	d := &Dispatcher{Log: slog.New(slog.NewTextHandler(io.Discard, nil))}

	for _, c := range []struct {
		name       string
		canRequeue bool
		outcome    readOutcome
	}{
		{"re-queued", true, readRequeue},
		{"cannot run again", false, readDone},
	} {
		hold := &monitorHold{d: d, jobID: 1, canRequeue: c.canRequeue}
		p := &podRun{d: d, ctx: context.Background(), hold: hold, jobID: 1,
			kube: &kubeClient{host: u, token: "t", http: &http.Client{Transport: http.DefaultTransport}},
			spec: map[string]any{"metadata": map[string]any{"name": "automation-job-1-abcde"}},
			ns:   "ascender", name: "automation-job-1-abcde", pdd: t.TempDir(), ident: "1",
			log: func(string, ...any) {}}
		res, err := p.run(context.Background())
		if err != nil {
			t.Fatalf("%s: %v", c.name, err)
		}
		if hold.outcome != c.outcome {
			t.Errorf("%s: outcome %v, want %v", c.name, hold.outcome, c.outcome)
		}
		if c.canRequeue {
			if !hold.abandoned() || !strings.Contains(hold.reason, "resource quota") || res.Explanation != "" {
				t.Errorf("%s: abandoned %v, reason %q, explanation %q", c.name, hold.abandoned(), hold.reason, res.Explanation)
			}
		} else if res.Status != "error" || !strings.Contains(res.Explanation, "Error creating pod: ") || !strings.Contains(res.Explanation, "exceeded quota") {
			t.Errorf("%s: status %q, explanation %q", c.name, res.Status, res.Explanation)
		}
	}

	// Any other refusal fails the job as before.
	hold := &monitorHold{d: d, jobID: 1, canRequeue: true}
	if hold.requeueForQuota(`403: pods "x" is forbidden: User "system:serviceaccount:ascender:example" cannot create resource "pods"`) || hold.outcome != readDone {
		t.Error("a refusal that is not the quota re-queued the job")
	}
}
