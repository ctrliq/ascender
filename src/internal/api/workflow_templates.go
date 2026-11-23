package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/activity"
	"github.com/ctrliq/ascender/internal/auth"
	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/models"
)

// Workflow job templates: create, update, delete, copy, survey, webhook key,
// launch and the notification and label sub-lists
// (WorkflowJobTemplateSerializer and the views around it).

func (s *Server) registerWorkflowTemplateWrites(mux *http.ServeMux) {
	s.route(mux, "/api/v2/workflow_job_templates/{id}/launch/{$}", methodMap{"GET": s.workflowJobTemplateLaunchView, "POST": s.workflowJobTemplateLaunch}, s.optionsExact("workflow_job_template_launch"))
	s.route(mux, "/api/v2/workflow_job_templates/{id}/copy/{$}", methodMap{"GET": s.workflowJobTemplateCopyView, "POST": s.workflowJobTemplateCopy}, s.optionsExact("workflow_job_template_copy"))
	s.route(mux, "/api/v2/workflow_job_templates/{id}/survey_spec/{$}", methodMap{"GET": s.workflowJobTemplateSurveySpec, "POST": s.workflowJobTemplateSurveySpecSave, "DELETE": s.workflowJobTemplateSurveySpecDelete}, s.optionsExact("workflow_job_template_survey_spec"))
	s.route(mux, "/api/v2/workflow_job_templates/{id}/webhook_key/{$}", methodMap{"GET": s.workflowJobTemplateWebhookKey, "POST": s.workflowJobTemplateWebhookKey}, nil)
	for _, kind := range []string{"started", "success", "error", "approvals"} {
		kind := kind
		s.route(mux, "/api/v2/workflow_job_templates/{id}/notification_templates_"+kind+"/{$}", methodMap{"GET": func(w http.ResponseWriter, r *http.Request) error {
			return s.workflowJobTemplateNotificationTemplates(w, r, kind)
		}, "POST": func(w http.ResponseWriter, r *http.Request) error {
			return s.workflowJobTemplateNotificationTemplatesAttach(w, r, kind)
		}}, s.optionsFor("notification_templates"))
	}
}

var wfjtCharPromptFields = []string{"limit", "scm_branch", "skip_tags", "job_tags"}

// workflowJobTemplateFromForm reads the serializer's fields into t.
func (s *Server) workflowJobTemplateFromForm(r *http.Request, f *Form, t *models.WorkflowJobTemplate) {
	initialService, initialKey := t.WebhookService, t.WebhookKey
	t.Name = f.String("name", true, 512, t.Name)
	t.Description = f.String("description", false, 0, t.Description)
	if f.Has("extra_vars") {
		ev := f.String("extra_vars", false, 0, t.ExtraVars)
		if err := ValidateVars(ev); err != nil {
			f.Errs.Add("extra_vars", err.Error())
		} else if m, _ := ParseVars(ev); refusesCiphertext(auth.UserFrom(r.Context()), m) {
			f.Errs.Add("extra_vars", encryptedValueMsg)
		} else {
			t.ExtraVars = ev
		}
	}
	if id, set := f.ID("organization", t.OrganizationID, false, s.existsIn(r.Context(), "main_organization")); set {
		t.OrganizationID = id
	}
	t.SurveyEnabled = f.Bool("survey_enabled", t.SurveyEnabled)
	t.AllowSimultaneous = f.Bool("allow_simultaneous", t.AllowSimultaneous)
	t.AllowOverwriteFlowVarsOnRelaunch = f.Bool("allow_overwrite_flow_vars_on_relaunch", t.AllowOverwriteFlowVarsOnRelaunch)
	t.AllowForceNodeSuccessOnRelaunch = f.Bool("allow_force_node_success_on_relaunch", t.AllowForceNodeSuccessOnRelaunch)
	t.AskVariablesOnLaunch = f.Bool("ask_variables_on_launch", t.AskVariablesOnLaunch)
	if id, set := f.ID("inventory", t.InventoryID, false, s.existsIn(r.Context(), "main_inventory")); set {
		t.InventoryID = id
	}
	t.AskInventoryOnLaunch = f.Bool("ask_inventory_on_launch", t.AskInventoryOnLaunch)
	t.AskSCMBranchOnLaunch = f.Bool("ask_scm_branch_on_launch", t.AskSCMBranchOnLaunch)
	t.AskLimitOnLaunch = f.Bool("ask_limit_on_launch", t.AskLimitOnLaunch)
	t.WebhookService = f.Choice("webhook_service", t.WebhookService, webhookServiceChoices, false)
	if id, set := f.ID("webhook_credential", t.WebhookCredentialID, false, s.credentialChoiceOK(r.Context(), t.WebhookCredentialID)); set {
		t.WebhookCredentialID = id
	}
	if f.Has("webhook_key") {
		t.WebhookKey = f.String("webhook_key", false, 64, t.WebhookKey)
	}
	t.AskLabelsOnLaunch = f.Bool("ask_labels_on_launch", t.AskLabelsOnLaunch)
	t.AskSkipTagsOnLaunch = f.Bool("ask_skip_tags_on_launch", t.AskSkipTagsOnLaunch)
	t.AskTagsOnLaunch = f.Bool("ask_tags_on_launch", t.AskTagsOnLaunch)
	// The four prompt fields live in char_prompts. The serializer collected
	// them on a fresh object, so a request naming any of them replaces the
	// stored set with the non-null values it sent (defaults of None apply on
	// create and full update).
	given := map[string]any{}
	named := false
	for _, k := range wfjtCharPromptFields {
		if !f.Has(k) {
			if !f.Partial {
				named = true
			}
			continue
		}
		named = true
		raw, _ := f.Body.Get(k)
		if raw == nil {
			continue
		}
		maxLen := 0
		if k == "scm_branch" {
			maxLen = 1024
		}
		v := f.String(k, false, maxLen, "")
		given[k] = v
	}
	if named && len(given) > 0 {
		b, _ := json.Marshal(given)
		t.CharPrompts = b
	}
	if len(f.Errs) > 0 {
		return
	}
	// JobTemplateMixin.validate
	if f.Has("webhook_key") && t.WebhookKey != "" && t.WebhookService == "" {
		f.Errs.Add("webhook_key", "Cannot set a webhook key without a webhook service.")
		return
	}
	if t.WebhookCredentialID != nil {
		var kind, namespace string
		_ = db.Tolerant(s.Q()).QueryRow(r.Context(), `SELECT ct.kind, ct.namespace FROM main_credential c JOIN main_credentialtype ct ON ct.id = c.credential_type_id WHERE c.id = $1`, *t.WebhookCredentialID).Scan(&kind, &namespace)
		if kind != "token" {
			f.Errs.Add("webhook_credential", "Must be a Personal Access Token.")
			return
		}
		if t.WebhookService == "" || namespace != t.WebhookService+"_token" {
			f.Errs.Add("webhook_credential", "Must match the selected webhook service.")
			return
		}
	}
	t.WebhookKey = webhookKeyOnSave(t.ID == 0, initialService, initialKey, t.WebhookService, t.WebhookKey)
}

func (s *Server) workflowJobTemplateNameTaken(ctx context.Context, name string, org *int64, excludeID int64) (bool, error) {
	var ok bool
	if err := s.Q().QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM main_unifiedjobtemplate u JOIN main_workflowjobtemplate t ON t.unifiedjobtemplate_ptr_id = u.id
		WHERE u.name = $1 AND u.organization_id IS NOT DISTINCT FROM $2 AND u.id <> $3)`, name, org, excludeID).Scan(&ok); err != nil {
		return false, err
	}
	return ok, nil
}

func (s *Server) workflowJobTemplateChanges(ctx context.Context, q db.Querier, t *models.WorkflowJobTemplate) map[string]any {
	ch := map[string]any{
		"name": t.Name, "description": t.Description, "extra_vars": t.ExtraVars, "id": t.ID,
		"organization":       s.nameRefCtx(ctx, q, `SELECT name FROM main_organization WHERE id = $1`, t.OrganizationID),
		"inventory":          s.nameRefCtx(ctx, q, `SELECT name FROM main_inventory WHERE id = $1`, t.InventoryID),
		"webhook_credential": s.nameRefCtx(ctx, q, `SELECT name FROM main_credential WHERE id = $1`, t.WebhookCredentialID),
		"survey_enabled":     t.SurveyEnabled, "allow_simultaneous": t.AllowSimultaneous, "ask_variables_on_launch": t.AskVariablesOnLaunch,
		"ask_inventory_on_launch": t.AskInventoryOnLaunch, "ask_scm_branch_on_launch": t.AskSCMBranchOnLaunch, "ask_limit_on_launch": t.AskLimitOnLaunch,
		"webhook_service": t.WebhookService, "ask_labels_on_launch": t.AskLabelsOnLaunch, "ask_skip_tags_on_launch": t.AskSkipTagsOnLaunch,
		"ask_tags_on_launch": t.AskTagsOnLaunch, "allow_overwrite_flow_vars_on_relaunch": t.AllowOverwriteFlowVarsOnRelaunch,
		"allow_force_node_success_on_relaunch": t.AllowForceNodeSuccessOnRelaunch, "char_prompts": string(t.CharPrompts),
	}
	return ch
}

// workflowJobTemplateAddAllowed is WorkflowJobTemplateAccess.can_add.
func (s *Server) workflowJobTemplateAddAllowed(c *SerCtx, t *models.WorkflowJobTemplate) bool {
	if c.User.IsSuperuser {
		return true
	}
	if t.OrganizationID == nil || !c.HasRoleOn("main.organization", *t.OrganizationID, "workflow_admin_role") {
		return false
	}
	if t.InventoryID != nil && !c.HasRoleOn("main.inventory", *t.InventoryID, "use_role") {
		return false
	}
	// check_related('execution_environment', role_field='read_role').
	return t.ExecutionEnvironmentID == nil || s.eeReadable(c, *t.ExecutionEnvironmentID)
}

func (s *Server) workflowJobTemplateCreate(w http.ResponseWriter, r *http.Request) error {
	u, err := RequireWrite(r)
	if err != nil {
		return err
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	f := NewForm(body, false)
	t := &models.WorkflowJobTemplate{CreatedByID: &u.ID, ModifiedByID: &u.ID, SurveySpec: json.RawMessage("{}"), CharPrompts: json.RawMessage("{}")}
	s.workflowJobTemplateFromForm(r, f, t)
	if err := f.Err(); err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	if !s.workflowJobTemplateAddAllowed(c, t) {
		return ErrForbidden
	}
	ctx := r.Context()
	if v, err := s.workflowJobTemplateNameTaken(ctx, t.Name, t.OrganizationID, 0); err != nil {
		return err
	} else if v {
		return FieldErrors{"__all__": {"WorkflowJobTemplate with this (name, organization) combination already exists."}}.Err()
	}
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if err := models.InsertWorkflowJobTemplate(ctx, tx, t, s.CT, s.Roles, s.orgLookup(r, tx)); err != nil {
			return err
		}
		return s.Activity.Record(ctx, tx, activity.Entry{Operation: "create", Object1: "workflow_job_template", Changes: s.workflowJobTemplateChanges(ctx, tx, t), ActorID: &u.ID, Links: map[string]int64{"workflow_job_template": t.ID, "unified_job_template": t.ID}})
	})
	if err != nil {
		return err
	}
	results, err := s.serializeWorkflowJobTemplates(c, []*models.WorkflowJobTemplate{t})
	if err != nil {
		return err
	}
	w.Header().Set("Location", URLFor("workflow_job_templates", t.ID))
	WriteJSON(w, http.StatusCreated, results[0])
	return nil
}

func (s *Server) workflowJobTemplateUpdate(w http.ResponseWriter, r *http.Request) error {
	_, t, err := workflowJobTemplateObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	u := c.User
	if !u.IsSuperuser && !c.HasRole(t.AdminRoleID) {
		return ErrForbidden
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	ctx := r.Context()
	before := *t
	beforeChanges := s.workflowJobTemplateChanges(ctx, s.Q(), t)
	f := NewForm(body, r.Method == http.MethodPatch)
	s.workflowJobTemplateFromForm(r, f, t)
	if err := f.Err(); err != nil {
		return err
	}
	same := func(a, b *int64) bool { return (a == nil && b == nil) || (a != nil && b != nil && *a == *b) }
	if !u.IsSuperuser {
		// check_related(obj=...): workflow admin of the organization it
		// leaves as well as the one it joins.
		if !same(before.OrganizationID, t.OrganizationID) && (t.OrganizationID == nil || !c.HasRoleOn("main.organization", *t.OrganizationID, "workflow_admin_role") ||
			(before.OrganizationID != nil && !c.HasRoleOn("main.organization", *before.OrganizationID, "workflow_admin_role"))) {
			return ErrForbidden
		}
		if !same(before.InventoryID, t.InventoryID) && t.InventoryID != nil && !c.HasRoleOn("main.inventory", *t.InventoryID, "use_role") {
			return ErrForbidden
		}
	}
	if v, err := s.workflowJobTemplateNameTaken(ctx, t.Name, t.OrganizationID, t.ID); err != nil {
		return err
	} else if v {
		return FieldErrors{"__all__": {"WorkflowJobTemplate with this (name, organization) combination already exists."}}.Err()
	}
	t.ModifiedByID = &u.ID
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if err := models.UpdateWorkflowJobTemplate(ctx, tx, t, s.orgLookup(r, tx), !same(before.OrganizationID, t.OrganizationID)); err != nil {
			return err
		}
		changes := diffChanges(beforeChanges, s.workflowJobTemplateChanges(ctx, tx, t))
		if len(changes) == 0 {
			return nil
		}
		return s.Activity.Record(ctx, tx, activity.Entry{Operation: "update", Object1: "workflow_job_template", Changes: changes, ActorID: &u.ID, Links: map[string]int64{"workflow_job_template": t.ID, "unified_job_template": t.ID}})
	})
	if err != nil {
		return err
	}
	results, err := s.serializeWorkflowJobTemplates(c, []*models.WorkflowJobTemplate{t})
	if err != nil {
		return err
	}
	WriteJSON(w, 200, results[0])
	return nil
}

func (s *Server) workflowJobTemplateDelete(w http.ResponseWriter, r *http.Request) error {
	_, t, err := workflowJobTemplateObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	u := c.User
	if !u.IsSuperuser && !c.HasRole(t.AdminRoleID) {
		return ErrForbidden
	}
	ctx := r.Context()
	// RelatedJobsPreventDeleteMixin
	if err := s.checkRelatedActiveJobs(ctx, workflowTemplateJobsCond, t.ID); err != nil {
		return err
	}
	changes := s.workflowJobTemplateChanges(ctx, s.Q(), t)
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if err := s.Activity.Record(ctx, tx, activity.Entry{Operation: "delete", Object1: "workflow_job_template", Changes: changes, ActorID: &u.ID}); err != nil {
			return err
		}
		return models.DeleteWorkflowJobTemplate(ctx, tx, t, s.CT, s.Cascade)
	})
	if err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func (s *Server) workflowJobTemplateLabelsAttach(w http.ResponseWriter, r *http.Request) error {
	_, t, err := workflowJobTemplateObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	return s.labelsAttach(w, r, c, func() bool { return c.HasRole(t.AdminRoleID) }, workflowJobTemplateLabels, t.ID, "workflow job template")
}

// --- notification templates ------------------------------------------------------

func (s *Server) workflowJobTemplateNotificationTemplates(w http.ResponseWriter, r *http.Request, kind string) error {
	_, t, err := workflowJobTemplateObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	return s.ntLinkList(w, r, ntLinkFor("workflow_job_template", kind), t.ID)
}

func (s *Server) workflowJobTemplateNotificationTemplatesAttach(w http.ResponseWriter, r *http.Request, kind string) error {
	u, t, err := workflowJobTemplateObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	return s.ntLinkAttach(w, r, u, ntLinkFor("workflow_job_template", kind), t.ID, func(orgID *int64) bool {
		return orgID != nil && c.HasRoleOn("main.organization", *orgID, "notification_admin_role")
	})
}

// --- webhook key, survey ------------------------------------------------------------

func (s *Server) workflowJobTemplateWebhookKey(w http.ResponseWriter, r *http.Request) error {
	_, t, err := workflowJobTemplateObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	if !c.User.IsSuperuser && !c.HasRole(t.AdminRoleID) {
		return ErrForbidden
	}
	if r.Method == http.MethodPost {
		if _, err := RequireWrite(r); err != nil {
			return err
		}
		t.WebhookKey = newWebhookKey()
		if _, err := s.Q().Exec(r.Context(), `UPDATE main_workflowjobtemplate SET webhook_key = $2 WHERE unifiedjobtemplate_ptr_id = $1`, t.ID, t.WebhookKey); err != nil {
			return err
		}
		WriteJSON(w, http.StatusCreated, NewOMap().Set("webhook_key", t.WebhookKey))
		return nil
	}
	WriteJSON(w, 200, NewOMap().Set("webhook_key", t.WebhookKey))
	return nil
}

func (s *Server) workflowJobTemplateSurveySpec(w http.ResponseWriter, r *http.Request) error {
	_, t, err := workflowJobTemplateObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	spec := NewOMap()
	if err := spec.UnmarshalJSON(t.SurveySpec); err != nil || spec.Len() == 0 {
		WriteJSON(w, 200, map[string]any{})
		return nil
	}
	if items, ok := spec.Get("spec"); ok {
		if list, ok := items.([]any); ok {
			for _, it := range list {
				if m, ok := it.(*OMap); ok {
					if tv, _ := m.Get("type"); tv == "password" {
						if d, ok := m.Get("default"); ok && d != nil && d != "" {
							m.Set("default", "$encrypted$")
						}
					}
				}
			}
		}
	}
	WriteJSON(w, 200, spec)
	return nil
}

func (s *Server) workflowJobTemplateSurveySpecSave(w http.ResponseWriter, r *http.Request) error {
	_, t, err := workflowJobTemplateObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	if !c.User.IsSuperuser && !c.HasRole(t.AdminRoleID) {
		return ErrForbidden
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	if err := s.validateSurveySpec(body, t.SurveySpecMap()); err != nil {
		return err
	}
	raw, err := json.Marshal(body)
	if err != nil {
		return err
	}
	if err := models.UpdateWorkflowJobTemplateSurvey(r.Context(), s.Q(), t.ID, raw); err != nil {
		return err
	}
	WriteJSON(w, 200, nil)
	return nil
}

func (s *Server) workflowJobTemplateSurveySpecDelete(w http.ResponseWriter, r *http.Request) error {
	_, t, err := workflowJobTemplateObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	if !c.User.IsSuperuser && !c.HasRole(t.AdminRoleID) {
		return ErrForbidden
	}
	if err := models.UpdateWorkflowJobTemplateSurvey(r.Context(), s.Q(), t.ID, json.RawMessage("{}")); err != nil {
		return err
	}
	WriteJSON(w, 200, nil)
	return nil
}

// --- copy ------------------------------------------------------------------------------

// workflowCopyCheck is WorkflowJobTemplateAccess.can_copy with its
// messages: the copier needs workflow admin on the organization, and nodes
// pointing at resources they cannot use are listed.
func (s *Server) workflowCopyCheck(ctx context.Context, c *SerCtx, t *models.WorkflowJobTemplate) (bool, map[string][]string, error) {
	ok := c.User.IsSuperuser || (t.OrganizationID != nil && c.HasRoleOn("main.organization", *t.OrganizationID, "workflow_admin_role"))
	msgs := map[string][]string{}
	rows, err := s.Q().Query(ctx, `SELECT n.id, n.unified_job_template_id, n.inventory_id, COALESCE(i.name, '') FROM main_workflowjobtemplatenode n LEFT JOIN main_inventory i ON i.id = n.inventory_id WHERE n.workflow_job_template_id = $1 ORDER BY n.id`, t.ID)
	if err != nil {
		return false, nil, err
	}
	type nodeRef struct {
		id       int64
		ujt, inv *int64
		invName  string
	}
	var nodes []nodeRef
	for rows.Next() {
		var n nodeRef
		if err := rows.Scan(&n.id, &n.ujt, &n.inv, &n.invName); err != nil {
			rows.Close()
			return false, nil, err
		}
		nodes = append(nodes, n)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return false, nil, err
	}
	for _, n := range nodes {
		if n.inv != nil && !c.HasRoleOn("main.inventory", *n.inv, "use_role") {
			msgs["inventories_unable_to_copy"] = append(msgs["inventories_unable_to_copy"], n.invName)
		}
		credRows, err := s.Q().Query(ctx, `SELECT c.id, c.name FROM main_workflowjobtemplatenode_credentials nc JOIN main_credential c ON c.id = nc.credential_id WHERE nc.workflowjobtemplatenode_id = $1 ORDER BY nc.id`, n.id)
		if err != nil {
			return false, nil, err
		}
		for credRows.Next() {
			var cid int64
			var name string
			if err := credRows.Scan(&cid, &name); err != nil {
				credRows.Close()
				return false, nil, err
			}
			if !c.HasRoleOn("main.credential", cid, "use_role") {
				msgs["credentials_unable_to_copy"] = append(msgs["credentials_unable_to_copy"], name)
			}
		}
		credRows.Close()
		if err := credRows.Err(); err != nil {
			return false, nil, err
		}
		if n.ujt != nil && !s.canStartTemplate(ctx, s.Q(), c, *n.ujt) {
			name := colOf[string](ctx, s.Q(), "main_unifiedjobtemplate", "name", *n.ujt)
			msgs["templates_unable_to_copy"] = append(msgs["templates_unable_to_copy"], name)
		}
	}
	return ok, msgs, nil
}

// canStartTemplate is the 'start' check on any unified job template.
// q is the caller's transaction when there is one.
func (s *Server) canStartTemplate(ctx context.Context, q db.Querier, c *SerCtx, id int64) bool {
	if c.User.IsSuperuser {
		return true
	}
	t, err := s.loadScheduleTemplateQ(ctx, q, id)
	if err != nil {
		return false
	}
	switch t.Model {
	case "workflowapprovaltemplate":
		a, err := models.GetWorkflowApprovalTemplate(ctx, q, id)
		return err == nil && a.WorkflowJobTemplateExecuteRoleID != nil && c.HasRole(a.WorkflowJobTemplateExecuteRoleID)
	case "systemjobtemplate":
		return false
	}
	return s.scheduleCanStart(c, t)
}

func (s *Server) workflowJobTemplateCopyView(w http.ResponseWriter, r *http.Request) error {
	_, t, err := workflowJobTemplateObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	ok, msgs, err := s.workflowCopyCheck(r.Context(), c, t)
	if err != nil {
		return err
	}
	all := func() []string {
		if ok {
			return []string{}
		}
		return []string{"all"}
	}
	o := NewOMap().Set("can_copy", ok).Set("can_copy_without_user_input", ok).Set("templates_unable_to_copy", all()).Set("credentials_unable_to_copy", all()).Set("inventories_unable_to_copy", all())
	if ok && len(msgs) > 0 {
		o.Set("can_copy_without_user_input", false)
		for _, k := range []string{"templates_unable_to_copy", "credentials_unable_to_copy", "inventories_unable_to_copy"} {
			if v, has := msgs[k]; has {
				o.Set(k, v)
			}
		}
	}
	WriteJSON(w, 200, o)
	return nil
}

func (s *Server) workflowJobTemplateCopy(w http.ResponseWriter, r *http.Request) error {
	_, t, err := workflowJobTemplateObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	ctx := r.Context()
	ok, _, err := s.workflowCopyCheck(ctx, c, t)
	if err != nil {
		return err
	}
	if !ok || !s.workflowJobTemplateAddAllowed(c, t) {
		return ErrForbidden
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	name, err := copyName(body, t.Name)
	if err != nil {
		return err
	}
	u := c.User
	n := *t
	n.Name = name
	n.CreatedByID, n.ModifiedByID = &u.ID, &u.ID
	// webhook_key is discarded at copy, and WebhookTemplateMixin.save gave
	// a new template with a service a key of its own.
	n.WebhookKey = ""
	if n.WebhookService != "" {
		n.WebhookKey = newWebhookKey()
	}
	// The copier becomes the copy's admin, may read and rotate its webhook
	// key and so sign a delivery naming any status URL, where the webhook
	// credential's token is then posted: it goes with the copy only for a
	// user who may use it, as setting it on a template requires. (The old
	// application copied it unconditionally.)
	if n.WebhookCredentialID != nil && !u.IsSuperuser && !c.HasRoleOn("main.credential", *n.WebhookCredentialID, "use_role") {
		n.WebhookCredentialID = nil
	}
	n.LastJobID, n.CurrentJobID, n.NextScheduleID = nil, nil, nil
	n.LastJobRun, n.NextJobRun = nil, nil
	n.LastJobFailed = false
	n.Status = "never updated"
	n.AdminRoleID, n.ExecuteRoleID, n.ReadRoleID, n.ApprovalRoleID = nil, nil, nil, nil
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if err := models.InsertWorkflowJobTemplate(ctx, tx, &n, s.CT, s.Roles, s.orgLookup(r, tx)); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO main_unifiedjobtemplate_labels (unifiedjobtemplate_id, label_id) SELECT $2, label_id FROM main_unifiedjobtemplate_labels WHERE unifiedjobtemplate_id = $1 ORDER BY id`, t.ID, n.ID); err != nil {
			return err
		}
		if err := s.copyWorkflowNodes(ctx, tx, c.InTx(tx), t.ID, n.ID); err != nil {
			return err
		}
		if err := s.Activity.Record(ctx, tx, activity.Entry{Operation: "create", Object1: "workflow_job_template", Changes: s.workflowJobTemplateChanges(ctx, tx, &n), ActorID: &u.ID, Links: map[string]int64{"workflow_job_template": n.ID, "unified_job_template": n.ID}}); err != nil {
			return err
		}
		return s.addAdminMember(ctx, tx, u, *n.AdminRoleID, u.ID)
	})
	if err != nil {
		return err
	}
	results, err := s.serializeWorkflowJobTemplates(c, []*models.WorkflowJobTemplate{&n})
	if err != nil {
		return err
	}
	w.Header().Set("Location", URLFor("workflow_job_templates", n.ID))
	WriteJSON(w, http.StatusCreated, results[0])
	return nil
}

// copyWorkflowNodes deep-copies a template's nodes and edges into another
// template, leaving out the resources the user cannot use
// (deep_copy_permission_check_func). Approval nodes get their own copy of
// the approval template.
func (s *Server) copyWorkflowNodes(ctx context.Context, tx pgx.Tx, c *SerCtx, from, to int64) error {
	rows, err := tx.Query(ctx, `SELECT `+models.TemplateNodeColumns+` FROM main_workflowjobtemplatenode n WHERE n.workflow_job_template_id = $1 ORDER BY n.id`, from)
	if err != nil {
		return err
	}
	var nodes []*models.WorkflowNode
	for rows.Next() {
		n, err := models.ScanTemplateNode(rows)
		if err != nil {
			rows.Close()
			return err
		}
		nodes = append(nodes, n)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	idMap := map[int64]int64{}
	for _, old := range nodes {
		n := *old
		n.WorkflowID = to
		if n.InventoryID != nil && !c.HasRoleOn("main.inventory", *n.InventoryID, "use_role") {
			n.InventoryID = nil
		}
		if n.UnifiedJobTemplateID != nil {
			var model string
			if err := tx.QueryRow(ctx, `SELECT ct.model FROM main_unifiedjobtemplate u JOIN django_content_type ct ON ct.id = u.polymorphic_ctype_id WHERE u.id = $1`, *n.UnifiedJobTemplateID).Scan(&model); err != nil {
				return err
			}
			if model == "workflowapprovaltemplate" {
				a, err := models.GetWorkflowApprovalTemplate(ctx, tx, *n.UnifiedJobTemplateID)
				if err != nil {
					return err
				}
				cp := &models.WorkflowApprovalTemplate{Name: a.Name, Description: a.Description, Timeout: a.Timeout, RequiredApprovals: a.RequiredApprovals, OnTimeout: a.OnTimeout, ContextTemplate: a.ContextTemplate,
					CreatedByID: &c.User.ID, ModifiedByID: &c.User.ID}
				if err := models.InsertWorkflowApprovalTemplate(ctx, tx, cp, s.CT); err != nil {
					return err
				}
				n.UnifiedJobTemplateID = &cp.ID
			} else if !s.canStartTemplate(ctx, tx, c, *n.UnifiedJobTemplateID) {
				n.UnifiedJobTemplateID = nil
			}
		}
		if err := models.InsertTemplateNode(ctx, tx, &n); err != nil {
			return err
		}
		idMap[old.ID] = n.ID
		if _, err := tx.Exec(ctx, `INSERT INTO main_workflowjobtemplatenode_credentials (workflowjobtemplatenode_id, credential_id) SELECT $2, credential_id FROM main_workflowjobtemplatenode_credentials WHERE workflowjobtemplatenode_id = $1 ORDER BY id`, old.ID, n.ID); err != nil {
			return err
		}
		if !c.User.IsSuperuser {
			creds, err := models.ScanIDs(ctx, tx, `SELECT credential_id FROM main_workflowjobtemplatenode_credentials WHERE workflowjobtemplatenode_id = $1`, n.ID)
			if err != nil {
				return err
			}
			for _, cid := range creds {
				if !c.HasRoleOn("main.credential", cid, "use_role") {
					if _, err := tx.Exec(ctx, `DELETE FROM main_workflowjobtemplatenode_credentials WHERE workflowjobtemplatenode_id = $1 AND credential_id = $2`, n.ID, cid); err != nil {
						return err
					}
				}
			}
		}
		if _, err := tx.Exec(ctx, `INSERT INTO main_workflowjobtemplatenode_labels (workflowjobtemplatenode_id, label_id) SELECT $2, label_id FROM main_workflowjobtemplatenode_labels WHERE workflowjobtemplatenode_id = $1 ORDER BY id`, old.ID, n.ID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO main_workflowjobtemplatenodebaseinstancegroupmembership (position, instancegroup_id, workflowjobtemplatenode_id) SELECT position, instancegroup_id, $2 FROM main_workflowjobtemplatenodebaseinstancegroupmembership WHERE workflowjobtemplatenode_id = $1 ORDER BY position`, old.ID, n.ID); err != nil {
			return err
		}
	}
	return copyNodeEdges(ctx, tx, models.TemplateNodeTables, models.TemplateNodeTables, idMap)
}

// copyNodeEdges copies the edges among the nodes of idMap from one node
// family's tables to another's.
func copyNodeEdges(ctx context.Context, tx pgx.Tx, src, dst models.NodeTables, idMap map[int64]int64) error {
	ids := make([]int64, 0, len(idMap))
	for k := range idMap {
		ids = append(ids, k)
	}
	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })
	for _, kind := range []string{"success", "failure", "always"} {
		rows, err := tx.Query(ctx, `SELECT from_`+src.LinkCol+`_id, to_`+src.LinkCol+`_id FROM `+src.LinkPrefix+kind+`_nodes WHERE from_`+src.LinkCol+`_id = ANY($1) ORDER BY id`, ids)
		if err != nil {
			return err
		}
		var pairs [][2]int64
		for rows.Next() {
			var a, b int64
			if err := rows.Scan(&a, &b); err != nil {
				rows.Close()
				return err
			}
			pairs = append(pairs, [2]int64{a, b})
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return err
		}
		for _, p := range pairs {
			to, ok := idMap[p[1]]
			if !ok {
				continue
			}
			if _, err := tx.Exec(ctx, `INSERT INTO `+dst.LinkPrefix+kind+`_nodes (from_`+dst.LinkCol+`_id, to_`+dst.LinkCol+`_id) VALUES ($1, $2)`, idMap[p[0]], to); err != nil {
				return err
			}
		}
	}
	rows, err := tx.Query(ctx, `SELECT from_node_id, to_node_id, trigger, artifact_key, operator, expected_value FROM `+src.Condition+` WHERE from_node_id = ANY($1) ORDER BY id`, ids)
	if err != nil {
		return err
	}
	type cond struct {
		from, to          int64
		trig, key, op, ev string
	}
	var conds []cond
	for rows.Next() {
		var c cond
		if err := rows.Scan(&c.from, &c.to, &c.trig, &c.key, &c.op, &c.ev); err != nil {
			rows.Close()
			return err
		}
		conds = append(conds, c)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	for _, c := range conds {
		to, ok := idMap[c.to]
		if !ok {
			continue
		}
		if _, err := tx.Exec(ctx, `INSERT INTO `+dst.Condition+` (from_node_id, to_node_id, trigger, artifact_key, operator, expected_value) VALUES ($1, $2, $3, $4, $5, $6)`, idMap[c.from], to, c.trig, c.key, c.op, c.ev); err != nil {
			return err
		}
	}
	return nil
}

// --- launch ----------------------------------------------------------------------------

// asSurveyTemplate presents a workflow job template to the survey and
// variable helpers written for job templates; they only read the survey,
// variables and their prompt flag.
func asSurveyTemplate(t *models.WorkflowJobTemplate) *models.JobTemplate {
	return &models.JobTemplate{ID: t.ID, Name: t.Name, ExtraVars: t.ExtraVars, SurveyEnabled: t.SurveyEnabled, SurveySpec: t.SurveySpec, AskVariablesOnLaunch: t.AskVariablesOnLaunch}
}

// wfjtVariablesNeeded lists required survey questions without a default.
func wfjtVariablesNeeded(t *models.WorkflowJobTemplate) []string {
	return variablesNeededToStart(asSurveyTemplate(t))
}

func (s *Server) loadWorkflowTemplateForStart(r *http.Request) (*models.WorkflowJobTemplate, *SerCtx, error) {
	_, t, err := workflowJobTemplateObj.fromPath(s, r, false)
	if err != nil {
		return nil, nil, err
	}
	c := s.NewSerCtx(r, true)
	if !c.User.IsSuperuser && !c.HasRole(t.ExecuteRoleID) {
		return nil, nil, ErrForbidden
	}
	return t, c, nil
}

// nodeTemplatesMissing lists nodes without a template.
func (s *Server) nodeTemplatesMissing(ctx context.Context, wfjtID int64) []any {
	ids, _ := models.ScanIDs(ctx, s.Q(), `SELECT id FROM main_workflowjobtemplatenode WHERE workflow_job_template_id = $1 AND unified_job_template_id IS NULL ORDER BY id`, wfjtID)
	return idsAny(ids)
}

// nodePromptsRejected lists nodes whose prompts their job template would
// refuse (node_prompts_rejected).
func (s *Server) nodePromptsRejected(ctx context.Context, wfjtID int64) []any {
	rows, err := s.Q().Query(ctx, `SELECT `+models.TemplateNodeColumns+` FROM main_workflowjobtemplatenode n WHERE n.workflow_job_template_id = $1 AND n.unified_job_template_id IS NOT NULL ORDER BY n.id`, wfjtID)
	if err != nil {
		return []any{}
	}
	var nodes []*models.WorkflowNode
	for rows.Next() {
		if n, err := models.ScanTemplateNode(rows); err == nil {
			nodes = append(nodes, n)
		}
	}
	rows.Close()
	s.logRowsErr(ctx, "nodePromptsRejected", rows)
	out := []any{}
	for _, n := range nodes {
		if errs := s.nodePromptErrors(ctx, n, models.TemplateNodeTables); errs != nil && !errs.empty() {
			out = append(out, n.ID)
		}
	}
	return out
}

// nodePromptErrors applies the node's template's prompt rules to the
// node's saved prompts, ignoring missing required survey answers.
func (s *Server) nodePromptErrors(ctx context.Context, n *models.WorkflowNode, tables models.NodeTables) *launchErrors {
	if n.UnifiedJobTemplateID == nil {
		return nil
	}
	t, err := s.loadScheduleTemplate(ctx, *n.UnifiedJobTemplateID)
	if err != nil {
		return nil
	}
	p := &models.JobPrompts{InventoryID: n.InventoryID, ExecutionEnvironment: n.ExecutionEnvironmentID}
	applyCharPrompts(p, n.CharPrompts)
	if extra, err := ParseVars(n.ExtraData); err == nil && len(extra) > 0 {
		p.ExtraVars = extra
	}
	p.Credentials, _ = models.ScanIDs(ctx, s.Q(), `SELECT credential_id FROM `+tables.Credentials+` WHERE `+tables.NodeCol+` = $1 ORDER BY id`, n.ID)
	p.Labels, _ = models.ScanIDs(ctx, s.Q(), `SELECT label_id FROM `+tables.Labels+` WHERE `+tables.NodeCol+` = $1 ORDER BY id`, n.ID)
	p.InstanceGroups, _ = models.ScanIDs(ctx, s.Q(), `SELECT instancegroup_id FROM `+tables.IGs+` WHERE `+tables.NodeCol+` = $1 ORDER BY position`, n.ID)
	req := launchRequestFromPrompts(p)
	errs := newLaunchErrors()
	switch t.Model {
	case "jobtemplate":
		tcreds, err := models.TemplateCredentials(ctx, s.Q(), []int64{t.ID})
		if err != nil {
			return nil
		}
		s.acceptPrompts(ctx, t.JT, req, tcreds[t.ID], errs, true)
		errs.m.Delete("variables_needed_to_start")
	case "workflowjobtemplate":
		s.acceptWorkflowLaunchPrompts(ctx, t.WFT, req, errs, true)
		errs.m.Delete("variables_needed_to_start")
	default:
		// templates that prompt for nothing: every saved prompt is refused
		for k, v := range n.CharPrompts {
			if v != nil {
				errs.add(k, "Field is not configured to prompt on launch.")
			}
		}
		if n.InventoryID != nil {
			errs.add("inventory", "Field is not configured to prompt on launch.")
		}
		if len(req.ExtraVars) > 0 && t.Model != "systemjobtemplate" {
			errs.add("extra_vars", "Variables are not allowed on launch.")
		}
	}
	return errs
}

func (s *Server) workflowJobTemplateLaunchView(w http.ResponseWriter, r *http.Request) error {
	t, _, err := s.loadWorkflowTemplateForStart(r)
	if err != nil {
		return err
	}
	ctx := r.Context()
	vars := wfjtVariablesNeeded(t)
	o := NewOMap()
	o.Set("ask_inventory_on_launch", t.AskInventoryOnLaunch).Set("ask_limit_on_launch", t.AskLimitOnLaunch).Set("ask_scm_branch_on_launch", t.AskSCMBranchOnLaunch)
	o.Set("can_start_without_user_input", len(vars) == 0)
	defaults := NewOMap()
	inv := NewOMap().Set("name", nil).Set("id", nil)
	if t.InventoryID != nil {
		var name string
		if err := s.Q().QueryRow(ctx, `SELECT name FROM main_inventory WHERE id = $1`, *t.InventoryID).Scan(&name); err == nil {
			inv = NewOMap().Set("name", name).Set("id", *t.InventoryID)
		}
	}
	chars := t.CharPromptsMap()
	defaults.Set("inventory", inv).Set("limit", nullableString(chars, "limit")).Set("scm_branch", nullableString(chars, "scm_branch"))
	labels, err := models.TemplateLabels(ctx, s.Q(), []int64{t.ID})
	if err != nil {
		return err
	}
	if len(labels[t.ID]) > 0 {
		list := make([]any, 0, len(labels[t.ID]))
		for _, l := range labels[t.ID] {
			list = append(list, NewOMap().Set("id", l.ID).Set("name", l.Name))
		}
		defaults.Set("labels", list)
	}
	defaults.Set("job_tags", nullableString(chars, "job_tags")).Set("skip_tags", nullableString(chars, "skip_tags")).Set("extra_vars", t.ExtraVars)
	o.Set("defaults", defaults)
	_, hasSpec := t.SurveySpecMap()["spec"]
	o.Set("survey_enabled", t.SurveyEnabled && hasSpec)
	o.Set("variables_needed_to_start", vars)
	o.Set("node_templates_missing", s.nodeTemplatesMissing(ctx, t.ID))
	o.Set("node_prompts_rejected", s.nodePromptsRejected(ctx, t.ID))
	o.Set("workflow_job_template_data", NewOMap().Set("name", t.Name).Set("id", t.ID).Set("description", t.Description))
	o.Set("ask_variables_on_launch", t.AskVariablesOnLaunch).Set("ask_labels_on_launch", t.AskLabelsOnLaunch).Set("ask_skip_tags_on_launch", t.AskSkipTagsOnLaunch).Set("ask_tags_on_launch", t.AskTagsOnLaunch)
	WriteJSON(w, 200, o)
	return nil
}

// workflowAccepted is what a workflow launch accepted.
type workflowAccepted struct {
	ExtraVars    map[string]any
	HasExtraVars bool
	InventoryID  *int64
	Limit        *string
	SCMBranch    *string
	JobTags      *string
	SkipTags     *string
	Labels       []int64
	HasLabels    bool
	Ignored      *OMap
}

// acceptWorkflowLaunchPrompts is WorkflowJobTemplate._accept_or_ignore_job_kwargs.
func (s *Server) acceptWorkflowLaunchPrompts(ctx context.Context, t *models.WorkflowJobTemplate, req *launchRequest, errs *launchErrors, strict bool) *workflowAccepted {
	acc := &workflowAccepted{Ignored: NewOMap()}
	st := asSurveyTemplate(t)
	data := req.ExtraVars
	if data == nil {
		data = map[string]any{}
	}
	accepted, rejected, surveyErrs := s.acceptVariables(st, data, strict)
	if len(surveyErrs) > 0 {
		errs.set("variables_needed_to_start", surveyErrs)
	}
	if len(accepted) > 0 {
		acc.ExtraVars, acc.HasExtraVars = accepted, true
	}
	if len(rejected) > 0 {
		acc.Ignored.Set("extra_vars", rejected)
		if strict {
			keys := make([]string, 0, len(rejected))
			for k := range rejected {
				keys = append(keys, k)
			}
			sort.Strings(keys)
			errs.add("extra_vars", fmt.Sprintf("Variables %s are not allowed on launch. Check the Prompt on Launch setting on the Workflow Job Template to include Extra Variables.", strings.Join(keys, ", ")))
		}
	}
	reject := func(field string, value any) {
		acc.Ignored.Set(field, value)
		if strict {
			errs.add(field, "Field is not configured to prompt on launch.")
		}
	}
	chars := t.CharPromptsMap()
	if req.Inventory != nil {
		switch {
		case t.InventoryID != nil && *t.InventoryID == *req.Inventory:
		case t.AskInventoryOnLaunch:
			acc.InventoryID = req.Inventory
		default:
			reject("inventory", *req.Inventory)
		}
	}
	str := func(field string, v *string, ask bool, dst **string) {
		if v == nil {
			return
		}
		if cur, ok := chars[field].(string); ok && cur == *v {
			return
		}
		if ask {
			*dst = v
			return
		}
		reject(field, *v)
	}
	str("limit", req.Limit, t.AskLimitOnLaunch, &acc.Limit)
	str("scm_branch", req.SCMBranch, t.AskSCMBranchOnLaunch, &acc.SCMBranch)
	str("job_tags", req.JobTags, t.AskTagsOnLaunch, &acc.JobTags)
	str("skip_tags", req.SkipTags, t.AskSkipTagsOnLaunch, &acc.SkipTags)
	if req.HasLabels {
		current, _ := models.TemplateLabels(ctx, s.Q(), []int64{t.ID})
		var have []int64
		for _, l := range current[t.ID] {
			have = append(have, l.ID)
		}
		if !sameIDList(sortedCopy(have), sortedCopy(req.Labels)) {
			if t.AskLabelsOnLaunch {
				acc.Labels, acc.HasLabels = req.Labels, true
			} else {
				reject("labels", idsAny(req.Labels))
			}
		}
	}
	return acc
}

func (s *Server) workflowJobTemplateLaunch(w http.ResponseWriter, r *http.Request) error {
	if _, err := RequireWrite(r); err != nil {
		return err
	}
	t, c, err := s.loadWorkflowTemplateForStart(r)
	if err != nil {
		return err
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	req, err := s.parseLaunchRequest(r, body)
	if err != nil {
		return err
	}
	ctx := r.Context()
	errs := newLaunchErrors()
	acc := s.acceptWorkflowLaunchPrompts(ctx, t, req, errs, true)
	pendingDeletion := func(id *int64) (bool, error) {
		var pd bool
		if id == nil {
			return false, nil
		}
		_, err := db.ScanOne(ctx, s.Q(), `SELECT pending_deletion FROM main_inventory WHERE id = $1`, []any{*id}, &pd)
		return pd, err
	}
	if pd, err := pendingDeletion(t.InventoryID); err != nil {
		return err
	} else if pd {
		errs.add("inventory", "The inventory associated with this Workflow is being deleted.")
	} else if pd, err := pendingDeletion(acc.InventoryID); err != nil {
		return err
	} else if pd {
		errs.add("inventory", "The provided inventory is being deleted.")
	}
	if !errs.empty() {
		return errs.err()
	}
	if !c.User.IsSuperuser {
		if acc.InventoryID != nil && !c.HasRoleOn("main.inventory", *acc.InventoryID, "use_role") {
			return ErrForbidden
		}
		for _, l := range acc.Labels {
			var org *int64
			if err := s.Q().QueryRow(ctx, `SELECT organization_id FROM main_label WHERE id = $1`, l).Scan(&org); err != nil || org == nil || !c.HasRoleOn("main.organization", *org, "read_role") {
				return ErrForbidden
			}
		}
	}
	wj, err := s.CreateWorkflowJobFromTemplate(ctx, &c.User.ID, t, acc, "manual", nil)
	if err != nil {
		return err
	}
	results, err := s.serializeWorkflowJobs(c, []*models.WorkflowJob{wj}, true)
	if err != nil {
		return err
	}
	o := NewOMap().Set("workflow_job", wj.ID).Set("ignored_fields", acc.Ignored)
	if m, ok := results[0].(*OMap); ok {
		for _, k := range m.Keys() {
			v, _ := m.Get(k)
			o.Set(k, v)
		}
	}
	w.Header().Set("Location", URLFor("workflow_jobs", wj.ID))
	WriteJSON(w, http.StatusCreated, o)
	return nil
}

// CreateWorkflowJobFromTemplate builds a workflow job from its template and
// accepted prompts, copies the nodes and starts it (create_unified_job,
// copy_nodes_from_original and signal_start). eager sets fields before
// the insert, as _eager_fields did.
func (s *Server) CreateWorkflowJobFromTemplate(ctx context.Context, actorID *int64, t *models.WorkflowJobTemplate, acc *workflowAccepted, launchType string, eager func(wj *models.WorkflowJob)) (*models.WorkflowJob, error) {
	st := asSurveyTemplate(t)
	runtimeVars := map[string]any{}
	for k, v := range acc.ExtraVars {
		runtimeVars[k] = v
	}
	passwordVars := surveyPasswordVariables(st)
	for _, pv := range passwordVars {
		if v, ok := runtimeVars[pv]; ok {
			if sv, ok := v.(string); ok && sv != "" && sv != "$encrypted$" && !strings.HasPrefix(sv, "$encrypted$") {
				enc, err := s.encryptSurveyDefault(sv)
				if err != nil {
					return nil, err
				}
				runtimeVars[pv] = enc
			}
		}
	}
	merged := s.mergedExtraVars(st, runtimeVars)
	mergedJSON, err := json.Marshal(merged)
	if err != nil {
		return nil, err
	}
	surveyPasswords := map[string]any{}
	for _, pv := range passwordVars {
		surveyPasswords[pv] = "$encrypted$"
	}
	chars := t.CharPromptsMap()
	set := func(k string, v *string) {
		if v != nil {
			chars[k] = *v
		}
	}
	set("limit", acc.Limit)
	set("scm_branch", acc.SCMBranch)
	set("job_tags", acc.JobTags)
	set("skip_tags", acc.SkipTags)
	charsJSON, _ := json.Marshal(chars)
	pwJSON, _ := json.Marshal(surveyPasswords)
	wj := &models.WorkflowJob{ExtraVars: string(mergedJSON), WorkflowJobTemplateID: &t.ID, AllowSimultaneous: t.AllowSimultaneous, InventoryID: t.InventoryID,
		CharPrompts: charsJSON, SurveyPasswords: pwJSON, AllowOverwriteFlowVarsOnRelaunch: t.AllowOverwriteFlowVarsOnRelaunch, AllowForceNodeSuccessOnRelaunch: t.AllowForceNodeSuccessOnRelaunch}
	if acc.InventoryID != nil {
		wj.InventoryID = acc.InventoryID
	}
	wj.Name, wj.Description = t.Name, t.Description
	wj.OrganizationID = t.OrganizationID
	wj.UnifiedJobTemplateID = &t.ID
	wj.LaunchType = launchType
	wj.CreatedByID, wj.ModifiedByID = actorID, actorID
	wj.Status = "pending"
	if eager != nil {
		eager(wj)
	}
	// labels: the template's plus the prompted ones (labels are additive)
	tl, err := models.TemplateLabels(ctx, s.Q(), []int64{t.ID})
	if err != nil {
		return nil, err
	}
	var labels []int64
	have := map[int64]bool{}
	for _, l := range tl[t.ID] {
		labels = append(labels, l.ID)
		have[l.ID] = true
	}
	for _, l := range acc.Labels {
		if !have[l] {
			labels = append(labels, l)
			have[l] = true
		}
	}
	cfg := &models.JobPrompts{InventoryID: acc.InventoryID, Limit: acc.Limit, SCMBranch: acc.SCMBranch, JobTags: acc.JobTags, SkipTags: acc.SkipTags}
	if acc.HasExtraVars {
		cfg.ExtraVars = runtimeVars
	}
	if len(surveyPasswords) > 0 {
		cfg.SurveyPasswords = surveyPasswords
	}
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if err := models.InsertWorkflowJob(ctx, tx, wj, s.CT, nil, nil, labels, cfg, nil, acc.Labels); err != nil {
			return err
		}
		if err := s.copyTemplateNodesToJob(ctx, tx, t.ID, wj.ID); err != nil {
			return err
		}
		return s.Activity.Record(ctx, tx, activity.Entry{Operation: "create", Object1: "workflow_job", Changes: map[string]any{"name": wj.Name, "id": wj.ID, "status": wj.Status, "launch_type": wj.LaunchType}, ActorID: actorID, Links: map[string]int64{"workflow_job": wj.ID, "unified_job": wj.ID}})
	})
	if err != nil {
		return nil, err
	}
	s.Notify(ctx, fmt.Sprintf(`{"type":"workflow_job","id":%d}`, wj.ID))
	return models.GetWorkflowJob(ctx, s.Q(), wj.ID)
}

// copyTemplateNodesToJob creates the workflow job's nodes from the
// template's (create_workflow_job_node) with their edges.
func (s *Server) copyTemplateNodesToJob(ctx context.Context, tx pgx.Tx, wfjtID, wjID int64) error {
	rows, err := tx.Query(ctx, `SELECT `+models.TemplateNodeColumns+` FROM main_workflowjobtemplatenode n WHERE n.workflow_job_template_id = $1 ORDER BY n.id`, wfjtID)
	if err != nil {
		return err
	}
	var nodes []*models.WorkflowNode
	for rows.Next() {
		n, err := models.ScanTemplateNode(rows)
		if err != nil {
			rows.Close()
			return err
		}
		nodes = append(nodes, n)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	idMap := map[int64]int64{}
	for _, n := range nodes {
		extra := n.ExtraData
		if extra == "" {
			extra = "{}"
		}
		var id int64
		if err := tx.QueryRow(ctx, `INSERT INTO main_workflowjobnode (created, modified, job_id, unified_job_template_id, workflow_job_id, inventory_id, ancestor_artifacts, extra_data, do_not_run,
			all_parents_must_converge, identifier, execution_environment_id, char_prompts, survey_passwords, prior_run_elapsed, prior_run_succeeded, max_retries, retry_attempts, forced_success,
			forced_success_by_id, forced_success_job_id, forced_success_reason)
			VALUES (now(), now(), NULL, $1, $2, $3, '{}', $4, false, $5, $6, $7, $8::jsonb, $9::jsonb, NULL, false, $10, 0, false, NULL, NULL, '') RETURNING id`,
			n.UnifiedJobTemplateID, wjID, n.InventoryID, extra, n.AllParentsMustConverge, n.Identifier, n.ExecutionEnvironmentID,
			mustJSON(n.CharPrompts), mustJSON(n.SurveyPasswords), n.MaxRetries).Scan(&id); err != nil {
			return err
		}
		idMap[n.ID] = id
		for _, sql := range []string{
			`INSERT INTO main_workflowjobnode_credentials (workflowjobnode_id, credential_id) SELECT $2, credential_id FROM main_workflowjobtemplatenode_credentials WHERE workflowjobtemplatenode_id = $1 ORDER BY id`,
			`INSERT INTO main_workflowjobnode_labels (workflowjobnode_id, label_id) SELECT $2, label_id FROM main_workflowjobtemplatenode_labels WHERE workflowjobtemplatenode_id = $1 ORDER BY id`,
			`INSERT INTO main_workflowjobnodebaseinstancegroupmembership (position, instancegroup_id, workflowjobnode_id) SELECT position, instancegroup_id, $2 FROM main_workflowjobtemplatenodebaseinstancegroupmembership WHERE workflowjobtemplatenode_id = $1 ORDER BY position`,
		} {
			if _, err := tx.Exec(ctx, sql, n.ID, id); err != nil {
				return err
			}
		}
	}
	return copyNodeEdges(ctx, tx, models.TemplateNodeTables, models.JobNodeTables, idMap)
}

func mustJSON(v any) string {
	if v == nil {
		return "{}"
	}
	b, err := json.Marshal(v)
	if err != nil {
		return "{}"
	}
	return string(b)
}
