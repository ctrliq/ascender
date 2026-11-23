package api

import (
	"bytes"
	"context"
	"strings"
	"testing"
	"time"
)

// A streamed download is byte for byte the output the other formats build
// in memory: events in start_line order, CRLF turned into LF, empty events
// left out, ANSI escapes kept or stripped, and a project update's clone
// URLs with their credentials redacted. The jobs and events are made in a
// scratch database, so the test never depends on what a database holds.
func TestStreamedStdoutMatchesBuilt(t *testing.T) {
	d, database := newScratchServer(t, "zz-stdout-stream")
	ctx := context.Background()
	inv := scratchInsert(t, database, "main_inventory", map[string]any{"name": "zz-stdout-inv", "kind": "", "host_filter": "", "variables": ""})
	job := scratchJob(t, d, database, "job", inv, "successful", nil, 0)
	for _, e := range []struct {
		line   int
		stdout string
	}{
		{2, "\x1b[0;32mok: [web1]\x1b[0m\r\nchanged: [web2]"},
		{0, "PLAY [all] ****"},
		{1, ""},
		{3, "PLAY RECAP"},
	} {
		scratchEvent(t, d, database, "main_jobevent", "job_id", job, map[string]any{"event": "runner_on_ok", "uuid": "zz-" + e.stdout, "counter": e.line + 1, "start_line": e.line, "end_line": e.line + 1, "stdout": e.stdout, "event_data": "{}"})
	}

	project := scratchInsert(t, database, "main_unifiedjobtemplate", map[string]any{"polymorphic_ctype_id": d.CT.ID("main.project"), "name": "zz-stdout-project", "status": "never updated"})
	scratchInsert(t, database, "main_project", map[string]any{"unifiedjobtemplate_ptr_id": project})
	update := scratchInsert(t, database, "main_unifiedjob", map[string]any{"polymorphic_ctype_id": d.CT.ID("main.projectupdate"), "status": "successful", "name": "zz-stdout-update", "launch_type": "manual", "unified_job_template_id": project})
	scratchInsert(t, database, "main_projectupdate", map[string]any{"unifiedjob_ptr_id": update, "project_id": project, "job_type": "check"})
	scratchEvent(t, d, database, "main_projectupdateevent", "project_update_id", update, map[string]any{"event": "runner_on_ok", "uuid": "zz-pu-1", "counter": 1, "start_line": 0, "end_line": 1, "stdout": "cloning https://zz-user:zz-secret@git.example.invalid/org/repo.git", "event_data": "{}"})

	for _, tc := range []struct {
		events, column string
		id             int64
		want           string
	}{
		{"main_jobevent", "job_id", job, "PLAY [all] ****\n\x1b[0;32mok: [web1]\x1b[0m\nchanged: [web2]\nPLAY RECAP\n"},
		{"main_projectupdateevent", "project_update_id", update, ""},
	} {
		created := colOf[time.Time](ctx, d.Q(), "main_unifiedjob", "created", tc.id)
		built, _, err := d.jobStdoutCtx(ctx, tc.events, tc.column, tc.id, created)
		if err != nil {
			t.Fatal(err)
		}
		if tc.want != "" && built != tc.want {
			t.Errorf("%s built %q, want %q", tc.events, built, tc.want)
		}
		if strings.Contains(built, "zz-secret") || built == "" {
			t.Errorf("%s built %q", tc.events, built)
		}
		for _, strip := range []bool{false, true} {
			var buf bytes.Buffer
			if err := d.streamJobStdout(ctx, &buf, tc.events, tc.column, tc.id, created, strip); err != nil {
				t.Fatal(err)
			}
			want := built
			if strip {
				want = stripANSI(built)
				if strings.Contains(want, "\x1b") {
					t.Errorf("%s: stripped output keeps escapes: %q", tc.events, want)
				}
			}
			if buf.String() != want {
				t.Errorf("%s strip=%v: streamed %q, built %q", tc.events, strip, buf.String(), want)
			}
		}
	}
}
