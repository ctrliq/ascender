package api

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/ctrliq/ascender/internal/auth"
	"github.com/ctrliq/ascender/internal/models"
)

// C5: POST job_templates/N/credentials/ without an id creates the
// credential as POST /credentials/ does, with CredentialSerializer's
// fields, and attaches it under the attach rules; one the template cannot
// take is deleted again.
func TestJobTemplateCredentialCreate(t *testing.T) {
	d := newDBServer(t, "zz-jt-credential-create")
	ctx := context.Background()
	org := zzOrg(t, d)
	machine, scm := zzType(t, d, "ssh"), zzType(t, d, "scm")
	jt := zzJobTemplate(t, d, "zz-jt-credential-create")
	path := fmt.Sprintf("/api/v2/job_templates/%d/credentials/", jt.ID)
	// Whatever the test creates goes, should it fail half way.
	t.Cleanup(func() {
		ids, err := models.ScanIDs(ctx, d.Q(), `SELECT id FROM main_credential WHERE name LIKE 'zz-jt-credential-create%'`)
		if err != nil {
			t.Error(err)
		}
		for _, id := range ids {
			zzDeleteNow(t, d, id)
		}
	})
	exists := func(name string) bool {
		ok, err := dbExistsQ(d.Q(), `SELECT 1 FROM main_credential WHERE name = $1`, name)
		if err != nil {
			t.Fatal(err)
		}
		return ok
	}
	post := func(body map[string]any) (int, string, http.Header) {
		b, _ := json.Marshal(body)
		r := httptest.NewRequest("POST", path, bytes.NewReader(b))
		r.Header.Set("Content-Type", "application/json")
		r = r.WithContext(auth.WithUser(r.Context(), d.user))
		w := httptest.NewRecorder()
		d.Routes().ServeHTTP(w, r)
		return w.Code, w.Body.String(), w.Header()
	}

	// No id: created, 201 with the credential as POST /credentials/ shows
	// it, and attached.
	st, resp, hdr := post(map[string]any{"name": "zz-jt-credential-create-machine", "credential_type": machine, "organization": org, "inputs": map[string]any{"username": "zz"}})
	d.expect(st, resp, http.StatusCreated, "")
	id := d.id(resp)
	if want := fmt.Sprintf("/api/v2/credentials/%d/", id); hdr.Get("Location") != want {
		t.Errorf("Location %q, want %q", hdr.Get("Location"), want)
	}
	st, detail := d.do("GET", fmt.Sprintf("/api/v2/credentials/%d/", id), nil)
	d.expect(st, detail, http.StatusOK, "")
	var created, shown map[string]any
	_ = json.Unmarshal([]byte(resp), &created)
	_ = json.Unmarshal([]byte(detail), &shown)
	for _, k := range []string{"id", "type", "url", "name", "organization", "credential_type", "inputs", "kind"} {
		if fmt.Sprint(created[k]) != fmt.Sprint(shown[k]) {
			t.Errorf("%s: created %v, detail %v", k, created[k], shown[k])
		}
	}
	attached, err := dbExistsQ(d.Q(), `SELECT 1 FROM main_unifiedjobtemplate_credentials WHERE unifiedjobtemplate_id = $1 AND credential_id = $2`, jt.ID, id)
	if err != nil || !attached {
		t.Errorf("not attached (%v)", err)
	}
	if ok, _ := dbExistsQ(d.Q(), `SELECT 1 FROM main_activitystream_credential a JOIN main_activitystream s ON s.id = a.activitystream_id WHERE a.credential_id = $1 AND s.operation = 'create'`, id); !ok {
		t.Error("no activity stream entry for the create")
	}

	// The serializer's validation answers as for POST /credentials/.
	st, resp, _ = post(map[string]any{"credential_type": machine, "organization": org})
	d.expect(st, resp, http.StatusBadRequest, `{"name":["This field is required."]}`)

	// A second Machine credential is created, refused and deleted again.
	st, resp, _ = post(map[string]any{"name": "zz-jt-credential-create-machine2", "credential_type": machine, "organization": org})
	d.expect(st, resp, http.StatusBadRequest, `{"error":"Cannot assign multiple Machine credentials."}`)
	if exists("zz-jt-credential-create-machine2") {
		t.Error("the refused credential was kept")
	}
	// So is a kind a job does not run with.
	st, resp, _ = post(map[string]any{"name": "zz-jt-credential-create-scm", "credential_type": scm, "organization": org})
	d.expect(st, resp, http.StatusBadRequest, "{\"error\":\"Cannot assign a Credential of kind `scm`.\"}")
	if exists("zz-jt-credential-create-scm") {
		t.Error("the refused credential was kept")
	}

	// CredentialSerializer has no user or team field and needs no owner:
	// a superuser's credential may have none ...
	st, resp, _ = post(map[string]any{"id": nil, "name": "zz-jt-credential-create-net", "credential_type": zzType(t, d, "net"), "user": d.user.ID})
	d.expect(st, resp, http.StatusCreated, "")
	var net struct {
		Organization  any `json:"organization"`
		SummaryFields struct {
			Owners []any `json:"owners"`
		} `json:"summary_fields"`
	}
	_ = json.Unmarshal([]byte(resp), &net)
	if net.Organization != nil || len(net.SummaryFields.Owners) != 0 {
		t.Errorf("owners of a credential made without one: %s", resp)
	}
	// ... while anyone else needs the organization's admin
	// (CredentialAccess.can_add), and then admin of the template and use
	// of the credential to attach it (can_attach), checked after the
	// create as the old view did.
	t.Cleanup(func() {
		if _, err := d.Q().Exec(ctx, `DELETE FROM main_rbac_roles_members WHERE user_id = $1`, d.user.ID); err != nil {
			t.Errorf("remove role memberships: %v", err)
		}
	})
	var credAdmin int64
	if err := d.Q().QueryRow(ctx, `SELECT credential_admin_role_id FROM main_organization WHERE id = $1`, org).Scan(&credAdmin); err != nil {
		t.Fatal(err)
	}
	grant := func(role int64) {
		t.Helper()
		st, resp := d.do("POST", fmt.Sprintf("/api/v2/users/%d/roles/", d.user.ID), map[string]any{"id": role})
		d.expect(st, resp, http.StatusNoContent, "")
	}
	grant(*jt.ReadRoleID)
	aws := zzType(t, d, "aws")
	d.user.IsSuperuser = false
	st, resp, _ = post(map[string]any{"name": "zz-jt-credential-create-aws", "credential_type": aws, "user": d.user.ID})
	d.expect(st, resp, http.StatusForbidden, "")
	if exists("zz-jt-credential-create-aws") {
		t.Error("a credential was created without permission")
	}
	d.user.IsSuperuser = true
	grant(credAdmin)
	d.user.IsSuperuser = false
	st, resp, _ = post(map[string]any{"name": "zz-jt-credential-create-aws", "credential_type": aws, "organization": org})
	d.expect(st, resp, http.StatusForbidden, "")
	if !exists("zz-jt-credential-create-aws") {
		t.Error("the credential was not created before the attach was refused")
	}
	d.user.IsSuperuser = true
	grant(*jt.AdminRoleID)
	d.user.IsSuperuser = false
	st, resp, _ = post(map[string]any{"name": "zz-jt-credential-create-aws2", "credential_type": aws, "organization": org})
	d.user.IsSuperuser = true
	d.expect(st, resp, http.StatusCreated, "")

	// With an id it is an attach, as before.
	st, resp, _ = post(map[string]any{"id": "x"})
	d.expect(st, resp, http.StatusBadRequest, `{"msg":"\"id\" field must be an integer."}`)
}

// zzDeleteNow deletes a credential through the API as a superuser.
func zzDeleteNow(t *testing.T, d *dbServer, id int64) {
	was := d.user.IsSuperuser
	d.user.IsSuperuser = true
	defer func() { d.user.IsSuperuser = was }()
	if st, resp := d.do("DELETE", fmt.Sprintf("/api/v2/credentials/%d/", id), nil); st != http.StatusNoContent && st != http.StatusNotFound {
		t.Errorf("delete credential %d: %d %s", id, st, resp)
	}
}
