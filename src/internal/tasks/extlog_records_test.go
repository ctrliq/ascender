package tasks

import (
	"testing"
	"time"

	"github.com/ctrliq/ascender/internal/extlog"
	"github.com/ctrliq/ascender/internal/models"
)

// The job_events data is what reformat_data_for_log produced for an
// unsaved event (the expected strings come from the old code): event_data
// in its stored key order, numbers as written, the guid taken out.
func TestEventRecordData(t *testing.T) {
	created := time.Date(2026, 11, 15, 5, 0, 1, 123456000, time.UTC)
	jc := time.Date(2026, 11, 15, 4, 59, 0, 500000000, time.UTC)
	e := &models.JobEvent{Event: "playbook_on_task_start", EventData: map[string]any{"task": "t1", "is_conditional": false}, UUID: "u-1", Playbook: "p.yml",
		Play: "Play A", Task: "t1", Counter: 3, Stdout: "TASK [t1]", StartLine: 2, EndLine: 4, Created: created, JobID: 7, ParentUUID: "pu-1", JobCreated: jc}
	got, _ := extlog.Ordered(eventRecordData(e, `{"task": "t1", "is_conditional": false, "n": 1.50, "guid": "g1"}`, "job", nil)).MarshalJSON()
	want := `{"guid": "g1", "id": null, "event": "playbook_on_task_start", "event_data": {"task": "t1", "is_conditional": false, "n": 1.50}, "failed": false, "changed": false, "uuid": "u-1", "playbook": "p.yml", "play": "Play A", "role": "", "task": "t1", "counter": 3, "stdout": "TASK [t1]", "verbosity": 0, "start_line": 2, "end_line": 4, "created": "2026-11-15T05:00:01.123Z", "modified": null, "job": 7, "host": null, "host_name": "", "parent_uuid": "pu-1", "job_created": "2026-11-15T04:59:00.500Z", "event_display": "Task Started (t1)"}`
	if string(got) != want {
		t.Errorf("job event\n%s\nwant\n%s", got, want)
	}
	host := int64(4)
	a := &models.JobEvent{Event: "runner_on_ok", EventData: map[string]any{"res": map[string]any{"changed": true}}, UUID: "u-2", Counter: 1, Stdout: "ok", EndLine: 1,
		Created: created, JobID: 9, HostID: &host, HostName: "h1", JobCreated: jc, Changed: true}
	got, _ = extlog.Ordered(eventRecordData(a, `{"res": {"changed": true}, "guid": null}`, "adhoc", nil)).MarshalJSON()
	want = `{"id": null, "event_data": {"res": {"changed": true}}, "uuid": "u-2", "counter": 1, "stdout": "ok", "verbosity": 0, "start_line": 0, "end_line": 1, "created": "2026-11-15T05:00:01.123Z", "modified": null, "event": "runner_on_ok", "failed": false, "changed": true, "ad_hoc_command": 9, "host": 4, "host_name": "h1", "job_created": "2026-11-15T04:59:00.500Z", "event_display": "Host OK"}`
	if string(got) != want {
		t.Errorf("ad hoc event\n%s\nwant\n%s", got, want)
	}
	wf := int64(11)
	e.EventData = map[string]any{"guid": "abc", "task": "t1"}
	d := eventRecordData(e, "", "projectupdate", &wf)
	if d[0].Key != "guid" || d[0].Value != "abc" || d[len(d)-1].Key != "workflow_job_id" {
		t.Errorf("guid and workflow job: %v", d)
	}
	if _, has := e.EventData["guid"]; !has {
		t.Error("the stored event lost its guid")
	}
}

func TestPyISOFormat(t *testing.T) {
	if s := pyISOFormat(time.Date(2026, 11, 15, 5, 0, 1, 123456789, time.UTC)); s != "2026-11-15T05:00:01.123456+00:00" {
		t.Error(s)
	}
	if s := pyISOFormat(time.Date(2026, 11, 15, 5, 0, 1, 0, time.FixedZone("x", 3600))); s != "2026-11-15T04:00:01+00:00" {
		t.Error(s)
	}
}
