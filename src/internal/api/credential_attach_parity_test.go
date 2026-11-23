package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"slices"
	"testing"
)

// assocEntry is an activity stream row as activity_stream_associate wrote
// it, with the objects it links.
type assocEntry struct {
	Operation, Object1, Object2, Relationship string
	Changes                                   map[string]any
	Links                                     []string
}

func (e assocEntry) String() string {
	return fmt.Sprintf("%s %s-%s %s %v %v", e.Operation, e.Object1, e.Object2, e.Relationship, e.Changes, e.Links)
}

// activitySince lists the activity stream entries after id, oldest first,
// each with the link tables naming it ("credential=5").
func activitySince(t *testing.T, d *dbServer, after int64) []assocEntry {
	t.Helper()
	ctx := context.Background()
	rows, err := d.Q().Query(ctx, `SELECT id, operation, object1, object2, object_relationship_type, changes FROM main_activitystream WHERE id > $1 ORDER BY id`, after)
	if err != nil {
		t.Fatal(err)
	}
	var ids []int64
	var out []assocEntry
	for rows.Next() {
		var id int64
		var e assocEntry
		var changes string
		if err := rows.Scan(&id, &e.Operation, &e.Object1, &e.Object2, &e.Relationship, &changes); err != nil {
			t.Fatal(err)
		}
		_ = json.Unmarshal([]byte(changes), &e.Changes)
		ids = append(ids, id)
		out = append(out, e)
	}
	rows.Close()
	links := map[string]string{"job_template": "jobtemplate_id", "credential": "credential_id", "schedule": "schedule_id",
		"workflow_job_template_node": "workflowjobtemplatenode_id", "label": "label_id", "instance_group": "instancegroup_id", "unified_job_template": "unifiedjobtemplate_id"}
	names := make([]string, 0, len(links))
	for k := range links {
		names = append(names, k)
	}
	slices.Sort(names)
	for i, id := range ids {
		for _, model := range names {
			var obj int64
			if err := d.Q().QueryRow(ctx, `SELECT `+links[model]+` FROM main_activitystream_`+model+` WHERE activitystream_id = $1`, id).Scan(&obj); err == nil {
				out[i].Links = append(out[i].Links, fmt.Sprintf("%s=%d", model, obj))
			}
		}
	}
	return out
}

func lastActivityID(t *testing.T, d *dbServer) int64 {
	t.Helper()
	var id int64
	if err := d.Q().QueryRow(context.Background(), `SELECT COALESCE(max(id), 0) FROM main_activitystream`).Scan(&id); err != nil {
		t.Fatal(err)
	}
	return id
}

// wantAssoc checks an entry against what activity_stream_associate wrote
// for obj1.<rel>.add(obj2) or remove(obj2).
func wantAssoc(t *testing.T, got assocEntry, op, rel, obj1 string, id1 int64, obj2 string, id2 int64) {
	t.Helper()
	want := assocEntry{Operation: op, Object1: obj1, Object2: obj2, Relationship: rel,
		Changes: map[string]any{"object1": obj1, "object1_pk": float64(id1), "object2": obj2, "object2_pk": float64(id2), "action": op, "relationship": rel}}
	want.Links = []string{fmt.Sprintf("%s=%d", obj1, id1), fmt.Sprintf("%s=%d", obj2, id2)}
	slices.Sort(want.Links)
	if got.String() != want.String() {
		t.Errorf("entry\ngot  %s\nwant %s", got, want)
	}
}

func scratchOrg(t *testing.T, d *dbServer, name string) int64 {
	t.Helper()
	st, body := d.do("POST", "/api/v2/organizations/", map[string]any{"name": name})
	d.expect(st, body, http.StatusCreated, "")
	return d.id(body)
}

// POST credential_types/N/credentials/ is CredentialTypeCredentialList's
// create: CredentialSerializer with no parent key, so the type is the
// body's (required, and not the URL's), user and team are not fields, no
// owner is needed by the serializer, and can_add decides: a superuser may
// leave the organization out; anyone else needs admin of it. Only a
// non-superuser's request looks the URL's type up.
func TestCredentialTypeCredentialCreate(t *testing.T) {
	d, _ := newScratchServer(t, "zz-ctype-cred-create")
	org := scratchOrg(t, d, "zz-ctype-org")
	machine, vault := zzType(t, d, "ssh"), zzType(t, d, "vault")
	path := fmt.Sprintf("/api/v2/credential_types/%d/credentials/", machine)

	st, body := d.do("POST", path, map[string]any{"name": "zz-ctype-none"})
	d.expect(st, body, http.StatusBadRequest, `{"credential_type":["This field is required."]}`)

	// The body's type wins over the URL's.
	st, body = d.do("POST", path, map[string]any{"name": "zz-ctype-vault", "credential_type": vault, "organization": org})
	d.expect(st, body, http.StatusCreated, "")
	var cr struct {
		ID             int64 `json:"id"`
		CredentialType int64 `json:"credential_type"`
		Organization   any   `json:"organization"`
		SummaryFields  struct {
			Owners []any `json:"owners"`
		} `json:"summary_fields"`
	}
	_ = json.Unmarshal([]byte(body), &cr)
	if cr.CredentialType != vault {
		t.Errorf("credential_type %d, want the body's %d", cr.CredentialType, vault)
	}

	// No owner: a superuser's credential may have none, and user is not
	// a field.
	st, body = d.do("POST", path, map[string]any{"name": "zz-ctype-noowner", "credential_type": machine, "user": d.user.ID, "team": 12345})
	d.expect(st, body, http.StatusCreated, "")
	cr.Organization, cr.SummaryFields.Owners = "x", nil
	_ = json.Unmarshal([]byte(body), &cr)
	if cr.Organization != nil || len(cr.SummaryFields.Owners) != 0 {
		t.Errorf("owners of a credential made without one: %s", body)
	}
	if _, ok := jsonKeys(body)["user"]; ok {
		t.Errorf("user in the answer: %s", body)
	}

	// The superuser skips the permission check that looks the parent up.
	st, body = d.do("POST", "/api/v2/credential_types/987654/credentials/", map[string]any{"name": "zz-ctype-noparent", "credential_type": machine})
	d.expect(st, body, http.StatusCreated, "")

	d.user.IsSuperuser = false
	defer func() { d.user.IsSuperuser = true }()
	st, body = d.do("POST", "/api/v2/credential_types/987654/credentials/", map[string]any{"name": "zz-ctype-x", "credential_type": machine, "organization": org})
	d.expect(st, body, http.StatusNotFound, "")
	st, body = d.do("POST", path, map[string]any{"name": "zz-ctype-mine", "credential_type": machine, "user": d.user.ID})
	d.expect(st, body, http.StatusForbidden, "")
	st, body = d.do("POST", path, map[string]any{"name": "zz-ctype-org", "credential_type": machine, "organization": org})
	d.expect(st, body, http.StatusForbidden, "")
	d.user.IsSuperuser = true
	var credAdmin int64
	if err := d.Q().QueryRow(context.Background(), `SELECT credential_admin_role_id FROM main_organization WHERE id = $1`, org).Scan(&credAdmin); err != nil {
		t.Fatal(err)
	}
	st, body = d.do("POST", fmt.Sprintf("/api/v2/users/%d/roles/", d.user.ID), map[string]any{"id": credAdmin})
	d.expect(st, body, http.StatusNoContent, "")
	d.user.IsSuperuser = false
	st, body = d.do("POST", path, map[string]any{"name": "zz-ctype-org", "credential_type": machine, "organization": org})
	d.expect(st, body, http.StatusCreated, "")
}

func jsonKeys(body string) map[string]any {
	var m map[string]any
	_ = json.Unmarshal([]byte(body), &m)
	return m
}

// The OPTIONS documents of the two sub-lists describe CredentialSerializer
// (the old views'): no user or team.
func TestCredentialSubListOptionsHaveNoOwnerFields(t *testing.T) {
	d, _ := newScratchServer(t, "zz-cred-sublist-options")
	jt := zzJobTemplate(t, d, "zz-cred-options-jt")
	for path, name := range map[string]string{
		fmt.Sprintf("/api/v2/job_templates/%d/credentials/", jt.ID): "Job Template Credentials List",
		"/api/v2/credential_types/1/credentials/":                   "Credential Type Credential List",
	} {
		st, body := d.do("OPTIONS", path, nil)
		var doc struct {
			Name    string                    `json:"name"`
			Actions map[string]map[string]any `json:"actions"`
		}
		if err := json.Unmarshal([]byte(body), &doc); st != http.StatusOK || err != nil || doc.Name != name {
			t.Fatalf("OPTIONS %s: %d %.200s", path, st, body)
		}
		post := doc.Actions["POST"]
		if post == nil || post["credential_type"] == nil || post["user"] != nil || post["team"] != nil {
			t.Errorf("OPTIONS %s POST: %v", path, post)
		}
	}
}

// JobTemplateCredentialsList.is_valid_relation compares the unique hash
// with every attached credential, the one given included: attaching one
// the template has already is a 400. Attach and detach write the
// "associate" and "disassociate" entries of JobTemplate.credentials; a
// detach writes one whether the credential was attached or not, and a
// create-and-attach writes the credential's "create" entry, then the
// "associate".
func TestJobTemplateCredentialReattachAndActivity(t *testing.T) {
	d, _ := newScratchServer(t, "zz-jt-cred-reattach")
	org := scratchOrg(t, d, "zz-jt-cred-org")
	machine := zzType(t, d, "ssh")
	jt := zzJobTemplate(t, d, "zz-jt-cred-reattach")
	path := fmt.Sprintf("/api/v2/job_templates/%d/credentials/", jt.ID)
	cred := zzCredential(t, d, map[string]any{"name": "zz-jt-cred-m", "credential_type": machine, "organization": org})

	since := lastActivityID(t, d)
	st, body := d.do("POST", path, map[string]any{"id": cred})
	d.expect(st, body, http.StatusNoContent, "")
	st, body = d.do("POST", path, map[string]any{"id": cred})
	d.expect(st, body, http.StatusBadRequest, `{"error":"Cannot assign multiple Machine credentials."}`)
	st, body = d.do("POST", path, map[string]any{"id": cred, "associate": true})
	d.expect(st, body, http.StatusBadRequest, `{"error":"Cannot assign multiple Machine credentials."}`)
	st, body = d.do("POST", path, map[string]any{"id": cred, "disassociate": true})
	d.expect(st, body, http.StatusNoContent, "")
	st, body = d.do("POST", path, map[string]any{"id": cred, "disassociate": true})
	d.expect(st, body, http.StatusNoContent, "")
	got := activitySince(t, d, since)
	if len(got) != 3 {
		t.Fatalf("entries: %v", got)
	}
	wantAssoc(t, got[0], "associate", ujtCredentialsRel, "job_template", jt.ID, "credential", cred)
	wantAssoc(t, got[1], "disassociate", ujtCredentialsRel, "job_template", jt.ID, "credential", cred)
	wantAssoc(t, got[2], "disassociate", ujtCredentialsRel, "job_template", jt.ID, "credential", cred)

	since = lastActivityID(t, d)
	st, body = d.do("POST", path, map[string]any{"name": "zz-jt-cred-new", "credential_type": machine, "organization": org})
	d.expect(st, body, http.StatusCreated, "")
	created := d.id(body)
	zzDeleteCredentialAtEnd(t, d, created)
	got = activitySince(t, d, since)
	if len(got) != 2 || got[0].Operation != "create" || got[0].Object1 != "credential" {
		t.Fatalf("entries: %v", got)
	}
	wantAssoc(t, got[1], "associate", ujtCredentialsRel, "job_template", jt.ID, "credential", created)
}

// LaunchConfigCredentialsBase: a schedule's or workflow node's credential
// already in its configuration is refused (the hash check includes it),
// attach and detach write the entries of Schedule.credentials and
// WorkflowJobTemplateNode.credentials, and a node with no template says
// so.
func TestLaunchConfigCredentialAttachActivity(t *testing.T) {
	d, database := newScratchServer(t, "zz-lc-cred-attach")
	ctx := context.Background()
	org := scratchOrg(t, d, "zz-lc-cred-org")
	machine := zzType(t, d, "ssh")
	jt := zzJobTemplate(t, d, "zz-lc-cred-jt")
	if _, err := d.Q().Exec(ctx, `UPDATE main_jobtemplate SET ask_credential_on_launch = true WHERE unifiedjobtemplate_ptr_id = $1`, jt.ID); err != nil {
		t.Fatal(err)
	}
	cred := zzCredential(t, d, map[string]any{"name": "zz-lc-cred-m", "credential_type": machine, "organization": org})
	sched := scratchInsert(t, database, "main_schedule", map[string]any{"name": "zz-lc-sched", "unified_job_template_id": jt.ID, "rrule": "DTSTART:20300101T000000Z RRULE:FREQ=MONTHLY;INTERVAL=1"})
	st, body := d.do("POST", "/api/v2/workflow_job_templates/", map[string]any{"name": "zz-lc-wf", "organization": org})
	d.expect(st, body, http.StatusCreated, "")
	wf := d.id(body)
	node := scratchInsert(t, database, "main_workflowjobtemplatenode", map[string]any{"workflow_job_template_id": wf, "unified_job_template_id": jt.ID, "identifier": "zz-n1"})
	empty := scratchInsert(t, database, "main_workflowjobtemplatenode", map[string]any{"workflow_job_template_id": wf, "identifier": "zz-n2"})

	for _, c := range []struct {
		path, obj1, rel string
		id              int64
	}{
		{fmt.Sprintf("/api/v2/schedules/%d/credentials/", sched), "schedule", scheduleCredentialsRel, sched},
		{fmt.Sprintf("/api/v2/workflow_job_template_nodes/%d/credentials/", node), "workflow_job_template_node", nodeCredentialsRel, node},
	} {
		since := lastActivityID(t, d)
		st, body := d.do("POST", c.path, map[string]any{"id": cred})
		d.expect(st, body, http.StatusNoContent, "")
		st, body = d.do("POST", c.path, map[string]any{"id": cred})
		d.expect(st, body, http.StatusBadRequest, `{"msg":"This launch configuration already provides a Machine credential."}`)
		st, body = d.do("POST", c.path, map[string]any{"id": cred, "disassociate": true})
		d.expect(st, body, http.StatusNoContent, "")
		got := activitySince(t, d, since)
		if len(got) != 2 {
			t.Fatalf("%s entries: %v", c.obj1, got)
		}
		wantAssoc(t, got[0], "associate", c.rel, c.obj1, c.id, "credential", cred)
		wantAssoc(t, got[1], "disassociate", c.rel, c.obj1, c.id, "credential", cred)
	}
	st, body = d.do("POST", fmt.Sprintf("/api/v2/workflow_job_template_nodes/%d/credentials/", empty), map[string]any{"id": cred})
	d.expect(st, body, http.StatusBadRequest, `{"msg":"Cannot assign credential when related template is null."}`)
}

// JobCreateSchedule added the configuration's credentials, labels and
// instance groups to the new schedule one by one, each add writing its
// "associate" entry after the schedule's "create" entry.
func TestJobCreateScheduleAssociations(t *testing.T) {
	d, database := newScratchServer(t, "zz-job-create-sched")
	ctx := context.Background()
	org := scratchOrg(t, d, "zz-jcs-org")
	inv, _ := scratchInventory(t, d, "zz-jcs-inv", nil)
	machine := zzType(t, d, "ssh")
	jt := zzJobTemplate(t, d, "zz-jcs-jt")
	if _, err := d.Q().Exec(ctx, `UPDATE main_jobtemplate SET ask_credential_on_launch = true, ask_labels_on_launch = true, ask_instance_groups_on_launch = true, inventory_id = $2 WHERE unifiedjobtemplate_ptr_id = $1`, jt.ID, inv); err != nil {
		t.Fatal(err)
	}
	cred := zzCredential(t, d, map[string]any{"name": "zz-jcs-m", "credential_type": machine, "organization": org})
	st, body := d.do("POST", "/api/v2/labels/", map[string]any{"name": "zz-jcs-label", "organization": org})
	d.expect(st, body, http.StatusCreated, "")
	label := d.id(body)
	st, body = d.do("POST", "/api/v2/instance_groups/", map[string]any{"name": "zz-jcs-ig"})
	d.expect(st, body, http.StatusCreated, "")
	ig := d.id(body)
	job := scratchJob(t, d, database, "job", inv, "successful", nil, 0)
	if _, err := d.Q().Exec(ctx, `UPDATE main_unifiedjob SET unified_job_template_id = $2 WHERE id = $1`, job, jt.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := d.Q().Exec(ctx, `UPDATE main_job SET job_template_id = $2 WHERE unifiedjob_ptr_id = $1`, job, jt.ID); err != nil {
		t.Fatal(err)
	}
	cfg := scratchInsert(t, database, "main_joblaunchconfig", map[string]any{"job_id": job})
	scratchInsert(t, database, "main_joblaunchconfig_credentials", map[string]any{"joblaunchconfig_id": cfg, "credential_id": cred})
	scratchInsert(t, database, "main_joblaunchconfig_labels", map[string]any{"joblaunchconfig_id": cfg, "label_id": label})
	scratchInsert(t, database, "main_joblaunchconfiginstancegroupmembership", map[string]any{"joblaunchconfig_id": cfg, "instancegroup_id": ig, "position": 0})

	since := lastActivityID(t, d)
	st, body = d.do("POST", fmt.Sprintf("/api/v2/jobs/%d/create_schedule/", job), nil)
	d.expect(st, body, http.StatusCreated, "")
	sched := d.id(body)
	got := activitySince(t, d, since)
	if len(got) != 4 || got[0].Operation != "create" || got[0].Object1 != "schedule" {
		t.Fatalf("entries: %v", got)
	}
	wantAssoc(t, got[1], "associate", scheduleCredentialsRel, "schedule", sched, "credential", cred)
	wantAssoc(t, got[2], "associate", scheduleLabels.Relationship, "schedule", sched, "label", label)
	wantAssoc(t, got[3], "associate", scheduleInstanceGroupRel, "schedule", sched, "instance_group", ig)
}
