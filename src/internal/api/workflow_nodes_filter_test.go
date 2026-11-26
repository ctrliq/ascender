package api

import (
	"net/url"
	"strings"
	"testing"
)

// A workflow job node's job is a relation, as WorkflowJobNode.job was in
// Django: the relaunch dialog that forces failed nodes as successful
// lists them with job__status__in.
func TestJobNodeFilterThroughJob(t *testing.T) {
	q := NewQuery()
	params := url.Values{"job__status__in": {"failed,error,canceled"}}
	if err := ApplyFilters(q, nodeFieldSet(true), params, nil); err != nil {
		t.Fatalf("job__status__in: %v", err)
	}
	if sql := q.JoinSQL() + q.WhereSQL(); !strings.Contains(sql, "LEFT JOIN main_unifiedjob nj ON nj.id = n.job_id") || !strings.Contains(sql, "nj.status") {
		t.Fatalf("unexpected SQL: %s", sql)
	}
	// The foreign key itself still filters without a join.
	q = NewQuery()
	if err := ApplyFilters(q, nodeFieldSet(true), url.Values{"job": {"5"}}, nil); err != nil {
		t.Fatalf("job: %v", err)
	}
	if len(q.Joins) != 0 || !strings.Contains(q.WhereSQL(), "n.job_id") {
		t.Fatalf("unexpected SQL: %s%s", q.JoinSQL(), q.WhereSQL())
	}
}
