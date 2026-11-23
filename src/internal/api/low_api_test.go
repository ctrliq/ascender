package api

import (
	"strings"
	"testing"
)

// Bulk launch prompts are typed as a launch's are: out-of-choice or
// negative values are field errors, not values for the job.
func TestBulkNodePromptsAreValidated(t *testing.T) {
	node := func(js string) any {
		v, err := decodeOrdered(js)
		if err != nil {
			t.Fatal(err)
		}
		return v
	}
	nodes, errs := parseBulkNodes([]any{node(`{"unified_job_template": 1, "job_type": "x", "forks": -1, "verbosity": 9, "diff_mode": "maybe"}`)})
	if errs == nil {
		t.Fatalf("no errors; nodes %+v", nodes)
	}
	ev, _ := errs.Get("0")
	e, _ := ev.(*OMap)
	for _, k := range []string{"job_type", "forks", "verbosity", "diff_mode"} {
		if e == nil || !e.Has(k) {
			t.Errorf("no error for %s: %v", k, errs)
		}
	}
	nodes, errs = parseBulkNodes([]any{node(`{"unified_job_template": 1, "job_type": "check", "forks": 5, "verbosity": 2, "diff_mode": true, "limit": "web"}`)})
	if errs != nil || len(nodes) != 1 {
		t.Fatalf("valid prompts refused: %v", errs)
	}
	c := nodes[0].chars
	if c["job_type"] != "check" || c["forks"] != int64(5) || c["verbosity"] != int64(2) || c["diff_mode"] != true || c["limit"] != "web" {
		t.Errorf("chars %#v", c)
	}
}

// A survey variable must be a variable name.
func TestSurveyVariableNames(t *testing.T) {
	s := &Server{}
	spec := func(variable string) *OMap {
		v, err := decodeOrdered(`{"name": "s", "description": "", "spec": [{"type": "text", "question_name": "q", "variable": "` + variable + `", "required": false}]}`)
		if err != nil {
			t.Fatal(err)
		}
		return v.(*OMap)
	}
	for _, bad := range []string{`a\"><img src=x>`, "1abc", "has space", "dash-ed", ""} {
		if err := s.validateSurveySpec(spec(bad), nil); err == nil || !strings.Contains(err.Error(), "variable") {
			t.Errorf("%q: %v", bad, err)
		}
	}
	for _, good := range []string{"abc", "_x1", "ABC_def"} {
		if err := s.validateSurveySpec(spec(good), nil); err != nil {
			t.Errorf("%q: %v", good, err)
		}
	}
}
