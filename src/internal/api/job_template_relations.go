package api

import (
	"context"
	"fmt"
	"net/http"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/activity"
	"github.com/ctrliq/ascender/internal/auth"
	"github.com/ctrliq/ascender/internal/crypto"
	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/models"
)

// encryptSurveyDefault encrypts a survey password default as encrypt_value
// did: the "value" field key with no primary key.
func (s *Server) encryptSurveyDefault(value string) (string, error) {
	return crypto.EncryptField(s.Cfg.SecretKey, "value", nil, value, false)
}

// decryptSurveyDefault reverses encryptSurveyDefault.
func (s *Server) decryptSurveyDefault(value string) (string, error) {
	return crypto.DecryptField(s.Cfg.SecretKey, "value", nil, value)
}

// --- credentials -------------------------------------------------------------

func (s *Server) jobTemplateCredentials(w http.ResponseWriter, r *http.Request) error {
	_, t, err := jobTemplateObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	// filter_read_permission = False: every credential of a readable
	// template is listed.
	spec := s.credentialSpec()
	spec.Access = nil
	spec.DefaultOrder = []string{"id"}
	spec.RoleLevel = "main.credential"
	creds, count, page, err := runListOf(s, r, spec, func(q *Query) {
		q.AddJoin("JOIN main_unifiedjobtemplate_credentials tcl ON tcl.credential_id = c.id")
		q.And("tcl.unifiedjobtemplate_id = " + q.Arg(t.ID))
	}, models.ScanCredential)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, false)
	results, err := s.serializeCredentials(c, creds)
	if err != nil {
		return err
	}
	WriteJSON(w, 200, Paginate(r, page, count, results))
	return nil
}

// validCredentialKinds are the credential kinds a job may run with.
var validCredentialKinds = map[string]bool{"ssh": true, "vault": true, "cloud": true, "net": true, "kubernetes": true}

// jobTemplateCredentialsAttach is JobTemplateCredentialsList's POST, a
// SubListCreateAttachDetachAPIView: detach, attach by id, or, with no id,
// create the credential and attach it.
func (s *Server) jobTemplateCredentialsAttach(w http.ResponseWriter, r *http.Request) error {
	u, t, err := jobTemplateObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	detach := isDetach(body)
	if raw, _ := body.Get("id"); !detach && !pyTruthy(raw) {
		return s.jobTemplateCredentialCreate(w, r, u, t, body)
	}
	cid, aerr := attachID(body, "Credential", detach)
	if aerr != nil {
		return aerr
	}
	briefs, err := models.LoadCredentialBriefs(r.Context(), s.Q(), []int64{cid})
	if err != nil {
		return err
	}
	if len(briefs) == 0 {
		return BadRequest("Credential matching query does not exist.")
	}
	sub := briefs[0]
	c := s.NewSerCtx(r, true)
	if !c.HasRole(t.AdminRoleID) {
		return ErrForbidden
	}
	ctx := r.Context()
	if detach {
		if err := s.unlinkTemplateCredential(ctx, u, t.ID, sub.ID); err != nil {
			return err
		}
		w.WriteHeader(http.StatusNoContent)
		return nil
	}
	if !c.HasRoleOn("main.credential", sub.ID, "use_role") {
		return ErrForbidden
	}
	invalid, err := s.jobTemplateCredentialRelation(ctx, t, sub)
	if err != nil {
		return err
	}
	if invalid != nil {
		return invalid
	}
	if err := s.linkTemplateCredential(ctx, u, t.ID, sub.ID); err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// Through models of the credential many-to-many fields, as the activity
// stream names them (sender.__module__ + "." + sender.__name__).
const (
	ujtCredentialsRel      = "ascender.main.models.unified_jobs.UnifiedJobTemplate_credentials"
	scheduleCredentialsRel = "ascender.main.models.schedules.Schedule_credentials"
	nodeCredentialsRel     = "ascender.main.models.workflow.WorkflowJobTemplateNode_credentials"
)

// linkTemplateCredential attaches a credential to a job template and
// records the "associate" entry activity_stream_associate wrote for
// JobTemplate.credentials.add().
func (s *Server) linkTemplateCredential(ctx context.Context, u *auth.User, templateID, credentialID int64) error {
	return s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `INSERT INTO main_unifiedjobtemplate_credentials (unifiedjobtemplate_id, credential_id) VALUES ($1, $2)`, templateID, credentialID); err != nil {
			return err
		}
		return s.recordAssociation(ctx, tx, &u.ID, "associate", ujtCredentialsRel, "job_template", templateID, "credential", credentialID)
	})
}

// unlinkTemplateCredential detaches a credential from a job template.
// remove() signals every id it was given, attached or not, so the
// "disassociate" entry is always written.
func (s *Server) unlinkTemplateCredential(ctx context.Context, u *auth.User, templateID, credentialID int64) error {
	return s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `DELETE FROM main_unifiedjobtemplate_credentials WHERE unifiedjobtemplate_id = $1 AND credential_id = $2`, templateID, credentialID); err != nil {
			return err
		}
		return s.recordAssociation(ctx, tx, &u.ID, "disassociate", ujtCredentialsRel, "job_template", templateID, "credential", credentialID)
	})
}

// jobTemplateCredentialRelation is JobTemplateCredentialsList's
// is_valid_relation: the 400 that refuses sub (one credential per unique
// hash, and only the kinds a job runs with). The hash is compared with
// every credential attached, sub itself included, so attaching a
// credential the template has already is refused as a second one of its
// type.
func (s *Server) jobTemplateCredentialRelation(ctx context.Context, t *models.JobTemplate, sub models.CredentialBrief) (*APIError, error) {
	existing, err := models.TemplateCredentials(ctx, s.Q(), []int64{t.ID})
	if err != nil {
		return nil, err
	}
	for _, cur := range existing[t.ID] {
		if cur.UniqueHash() == sub.UniqueHash() {
			return &APIError{Status: http.StatusBadRequest, Body: map[string]any{"error": fmt.Sprintf("Cannot assign multiple %s credentials.", sub.UniqueHashDisplay())}}, nil
		}
	}
	if !validCredentialKinds[sub.TypeKind] {
		return &APIError{Status: http.StatusBadRequest, Body: map[string]any{"error": fmt.Sprintf("Cannot assign a Credential of kind `%s`.", sub.TypeKind)}}, nil
	}
	return nil, nil
}

// jobTemplateCredentialCreate is SubListCreateAttachDetachAPIView.attach
// without an id: the credential is created as POST /credentials/ would
// (with CredentialSerializer's fields), then attached under the attach
// rules. A credential the template cannot take is deleted again; one the
// user may not attach stays, as it did, created but not attached. The
// answer is the create's: 201, the credential and its Location.
func (s *Server) jobTemplateCredentialCreate(w http.ResponseWriter, r *http.Request, u *auth.User, t *models.JobTemplate, body *OMap) error {
	cr, result, err := s.createCredential(r, u, body, credentialsOfJobTemplate)
	if err != nil {
		return err
	}
	ctx := r.Context()
	// can_attach, skipping the read check of the credential just made.
	c := s.NewSerCtx(r, true)
	if !c.HasRole(t.AdminRoleID) || !c.HasRoleOn("main.credential", cr.ID, "use_role") {
		return ErrForbidden
	}
	briefs, err := models.LoadCredentialBriefs(ctx, s.Q(), []int64{cr.ID})
	if err != nil {
		return err
	}
	if len(briefs) == 0 {
		return BadRequest("Credential matching query does not exist.")
	}
	invalid, err := s.jobTemplateCredentialRelation(ctx, t, briefs[0])
	if err != nil {
		return err
	}
	if invalid != nil {
		ct, err := models.GetCredentialType(ctx, s.Q(), cr.CredentialTypeID)
		if err != nil {
			return err
		}
		if err := s.deleteCredential(c, u, cr, ct); err != nil {
			return err
		}
		return invalid
	}
	// The credential's "create" entry was written with it; the attach
	// adds its "associate" entry.
	if err := s.linkTemplateCredential(ctx, u, t.ID, cr.ID); err != nil {
		return err
	}
	w.Header().Set("Location", URLFor("credentials", cr.ID))
	WriteJSON(w, http.StatusCreated, result)
	return nil
}

// --- labels ------------------------------------------------------------------

func (s *Server) jobTemplateLabels(w http.ResponseWriter, r *http.Request) error {
	_, t, err := jobTemplateObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	return s.labelListWith(w, r, func(q *Query) {
		q.AddJoin("JOIN main_unifiedjobtemplate_labels tll ON tll.label_id = l.id")
		q.And("tll.unifiedjobtemplate_id = " + q.Arg(t.ID))
	})
}

func (s *Server) jobTemplateLabelsAttach(w http.ResponseWriter, r *http.Request) error {
	_, t, err := jobTemplateObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	return s.labelsAttach(w, r, c, func() bool { return c.HasRole(t.AdminRoleID) }, jobTemplateLabels, t.ID, "job template")
}

// labelsAttach handles POST on a resource's labels sub-list: {"id"}
// attaches an existing label, {"name", "organization"} creates (or reuses)
// one, and {"id", "disassociate": true} removes it, deleting labels nothing
// uses any more. may is the resource permission, checked once the body
// has parsed (LabelSubListCreateAttachDetachView read request.data before
// the attach checked access).
func (s *Server) labelsAttach(w http.ResponseWriter, r *http.Request, c *SerCtx, may func() bool, o labelOwner, ownerID int64, verbose string) error {
	table, ownerColumn := o.Table, o.OwnerCol
	u := c.User
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	if !may() {
		return ErrForbidden
	}
	ctx := r.Context()
	if isDetach(body) {
		lid, aerr := attachID(body, "Label", true)
		if aerr != nil {
			return aerr
		}
		if exists, err := db.Exists(ctx, s.Q(), `SELECT 1 FROM main_label WHERE id = $1`, lid); err != nil {
			return err
		} else if !exists {
			return BadRequest("Label matching query does not exist.")
		}
		return s.DB.Tx(ctx, func(tx pgx.Tx) error {
			if _, err := tx.Exec(ctx, `DELETE FROM `+table+` WHERE `+ownerColumn+` = $1 AND label_id = $2`, ownerID, lid); err != nil {
				return err
			}
			if err := s.recordAssociation(ctx, tx, &u.ID, "disassociate", o.Relationship, o.Object1, ownerID, "label", lid); err != nil {
				return err
			}
			if err := s.deleteDetachedLabel(ctx, tx, c.InTx(tx), lid); err != nil {
				return err
			}
			w.WriteHeader(http.StatusNoContent)
			return nil
		})
	}
	if !body.Has("id") && body.Has("name") && body.Has("organization") {
		name, _ := body.Get("name")
		org, _ := body.Get("organization")
		var existing int64
		orgID, _ := integerOf(org)
		if err := s.Q().QueryRow(ctx, `SELECT id FROM main_label WHERE name = $1 AND organization_id = $2`, fmt.Sprint(name), orgID).Scan(&existing); err == nil {
			body.Delete("name")
			body.Delete("organization")
			body.Set("id", float64(existing))
		}
	}
	var n int
	if err := s.Q().QueryRow(ctx, `SELECT count(*) FROM `+table+` WHERE `+ownerColumn+` = $1`, ownerID).Scan(&n); err != nil {
		return err
	}
	if n > 100 {
		return &APIError{Status: http.StatusBadRequest, Body: map[string]any{"msg": fmt.Sprintf("Maximum number of labels for %s reached.", verbose)}}
	}
	if raw, _ := body.Get("id"); raw != nil {
		lid, aerr := attachID(body, "Label", false)
		if aerr != nil {
			return aerr
		}
		var orgID int64
		if err := s.Q().QueryRow(ctx, `SELECT organization_id FROM main_label WHERE id = $1`, lid).Scan(&orgID); err != nil {
			return BadRequest("Label matching query does not exist.")
		}
		if !u.IsSuperuser && !c.HasRoleOn("main.organization", orgID, "read_role") {
			return ErrForbidden
		}
		err := s.DB.Tx(ctx, func(tx pgx.Tx) error {
			tag, err := tx.Exec(ctx, `INSERT INTO `+table+` (`+ownerColumn+`, label_id) SELECT $1, $2 WHERE NOT EXISTS (SELECT 1 FROM `+table+` WHERE `+ownerColumn+` = $1 AND label_id = $2)`, ownerID, lid)
			if err != nil || tag.RowsAffected() == 0 {
				return err
			}
			return s.recordAssociation(ctx, tx, &u.ID, "associate", o.Relationship, o.Object1, ownerID, "label", lid)
		})
		if err != nil {
			return err
		}
		w.WriteHeader(http.StatusNoContent)
		return nil
	}
	f := NewForm(body, false)
	name := f.String("name", true, 512, "")
	description := f.String("description", false, 0, "")
	orgID, _ := f.ID("organization", nil, true, s.existsIn(r.Context(), "main_organization"))
	if err := f.Err(); err != nil {
		return err
	}
	if !u.IsSuperuser && !c.HasRoleOn("main.organization", *orgID, "member_role") {
		return ErrForbidden
	}
	var created *label
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		var lid int64
		if err := tx.QueryRow(ctx, `INSERT INTO main_label (created, modified, description, name, created_by_id, modified_by_id, organization_id) VALUES (now(), now(), $1, $2, $3, $3, $4) RETURNING id`, description, name, u.ID, *orgID).Scan(&lid); err != nil {
			if isUniqueViolation(err) {
				return FieldErrors{"__all__": {"Label with this Name and Organization already exists."}}.Err()
			}
			return err
		}
		rows, err := tx.Query(ctx, `SELECT `+labelColumns+` FROM main_label l WHERE l.id = $1`, lid)
		if err != nil {
			return err
		}
		if rows.Next() {
			lv, err := scanLabel(rows)
			if err != nil {
				rows.Close()
				return err
			}
			created = lv.(*label)
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return err
		}
		if err := s.Activity.Record(ctx, tx, activity.Entry{Operation: "create", Object1: "label", Changes: labelChanges(c.InTx(tx), created), ActorID: &u.ID, Links: map[string]int64{"label": lid}}); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO `+table+` (`+ownerColumn+`, label_id) VALUES ($1, $2)`, ownerID, lid); err != nil {
			return err
		}
		return s.recordAssociation(ctx, tx, &u.ID, "associate", o.Relationship, o.Object1, ownerID, "label", lid)
	})
	if err != nil {
		return err
	}
	w.Header().Set("Location", URLFor("labels", created.ID))
	WriteJSON(w, http.StatusCreated, s.serializeLabel(s.NewSerCtx(r, true), created))
	return nil
}

// --- instance groups ---------------------------------------------------------

func (s *Server) jobTemplateInstanceGroups(w http.ResponseWriter, r *http.Request) error {
	_, t, err := jobTemplateObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	return s.orderedInstanceGroups(w, r, "main_unifiedjobtemplateinstancegroupmembership", "unifiedjobtemplate_id", t.ID, false)
}

func (s *Server) jobTemplateInstanceGroupsAttach(w http.ResponseWriter, r *http.Request) error {
	u, t, err := jobTemplateObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	return s.instanceGroupLink(w, r, u, orderedLink{Table: "main_unifiedjobtemplateinstancegroupmembership", OwnerCol: "unifiedjobtemplate_id", Owner: t.ID, Object1: "job_template", Relationship: ujtInstanceGroupRel},
		func(g *instanceGroup) bool {
			return u.IsSuperuser || (t.OrganizationID != nil && c.HasRole(g.UseRoleID) && c.HasRole(t.AdminRoleID))
		})
}

// --- jobs, schedules, notifications ------------------------------------------

func (s *Server) jobTemplateJobs(w http.ResponseWriter, r *http.Request) error {
	_, t, err := jobTemplateObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	return s.jobListWith(w, r, func(q *Query) { q.And("j.job_template_id = " + q.Arg(t.ID)) })
}

func (s *Server) jobTemplateSliceWorkflowJobs(w http.ResponseWriter, r *http.Request) error {
	_, t, err := jobTemplateObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	return s.workflowJobListWith(w, r, func(q *Query) { q.And("wj.job_template_id = " + q.Arg(t.ID)) })
}

func (s *Server) jobTemplateSchedules(w http.ResponseWriter, r *http.Request) error {
	_, t, err := jobTemplateObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	return s.scheduleListWith(w, r, func(q *Query) { q.And("sc.unified_job_template_id = " + q.Arg(t.ID)) })
}

func (s *Server) jobTemplateNotificationTemplates(w http.ResponseWriter, r *http.Request, kind string) error {
	_, t, err := jobTemplateObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	return s.ntLinkList(w, r, ntLinkFor("job_template", kind), t.ID)
}

// jobTemplateNotificationTemplatesAttach: NotificationAttachMixin allows it
// to users who can change the notification template (notification_admin_role
// on its organization) and read the job template, which fromPath checked.
func (s *Server) jobTemplateNotificationTemplatesAttach(w http.ResponseWriter, r *http.Request, kind string) error {
	u, t, err := jobTemplateObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	return s.ntLinkAttach(w, r, u, ntLinkFor("job_template", kind), t.ID, func(orgID *int64) bool {
		return orgID != nil && c.HasRoleOn("main.organization", *orgID, "notification_admin_role")
	})
}
