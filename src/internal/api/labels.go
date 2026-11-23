package api

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/activity"
	"github.com/ctrliq/ascender/internal/auth"
)

// label is a main_label row.
type label struct {
	ID             int64
	Created        time.Time
	Modified       time.Time
	Name           string
	Description    string
	CreatedByID    *int64
	ModifiedByID   *int64
	OrganizationID int64
}

// labelOwner is a model's labels field: its through table, the table's
// column for the owner, and how the activity stream names the owner and
// the through model.
type labelOwner struct {
	Table, OwnerCol, Object1, Relationship string
}

var (
	jobTemplateLabels         = labelOwner{"main_unifiedjobtemplate_labels", "unifiedjobtemplate_id", "job_template", "ascender.main.models.unified_jobs.UnifiedJobTemplate_labels"}
	workflowJobTemplateLabels = labelOwner{"main_unifiedjobtemplate_labels", "unifiedjobtemplate_id", "workflow_job_template", "ascender.main.models.unified_jobs.UnifiedJobTemplate_labels"}
	inventoryLabels           = labelOwner{"main_inventory_labels", "inventory_id", "inventory", "ascender.main.models.inventory.Inventory_labels"}
	scheduleLabels            = labelOwner{"main_schedule_labels", "schedule_id", "schedule", "ascender.main.models.schedules.Schedule_labels"}
	templateNodeLabels        = labelOwner{"main_workflowjobtemplatenode_labels", "workflowjobtemplatenode_id", "workflow_job_template_node", "ascender.main.models.workflow.WorkflowJobTemplateNode_labels"}
)

// labelChanges is model_to_dict for a label: LabelSerializer's writable
// fields, which leave out the description.
func labelChanges(c *SerCtx, l *label) map[string]any {
	var org any
	if o := c.OrgSummary(&l.OrganizationID); o != nil {
		n, _ := o.Get("name")
		org = activity.Ref(fmt.Sprint(n), l.OrganizationID)
	}
	return map[string]any{"name": l.Name, "organization": org, "id": l.ID}
}

// deleteDetachedLabel removes a label no resource references any more, as
// Label.is_detached() decided, recording the delete.
func (s *Server) deleteDetachedLabel(ctx context.Context, tx pgx.Tx, c *SerCtx, id int64) error {
	rows, err := tx.Query(ctx, `SELECT `+labelColumns+` FROM main_label l WHERE l.id = $1
		AND NOT EXISTS (SELECT 1 FROM main_inventory_labels WHERE label_id = l.id) AND NOT EXISTS (SELECT 1 FROM main_unifiedjob_labels WHERE label_id = l.id)
		AND NOT EXISTS (SELECT 1 FROM main_unifiedjobtemplate_labels WHERE label_id = l.id) AND NOT EXISTS (SELECT 1 FROM main_schedule_labels WHERE label_id = l.id)
		AND NOT EXISTS (SELECT 1 FROM main_workflowjobtemplatenode_labels WHERE label_id = l.id) AND NOT EXISTS (SELECT 1 FROM main_workflowjobnode_labels WHERE label_id = l.id)`, id)
	if err != nil {
		return err
	}
	var l *label
	if rows.Next() {
		v, err := scanLabel(rows)
		if err != nil {
			rows.Close()
			return err
		}
		l = v.(*label)
	}
	rows.Close()
	if err := rows.Err(); err != nil || l == nil {
		return err
	}
	if err := s.Activity.Record(ctx, tx, activity.Entry{Operation: "delete", Object1: "label", Changes: labelChanges(c, l), ActorID: &c.User.ID}); err != nil {
		return err
	}
	return s.Cascade.Delete(ctx, tx, "main_label", "id", []int64{id})
}

var labelFields *FieldSet

func init() {
	labelFields = labelFieldSet("l")
	// The Labels screen asked for unifiedjobtemplate_labels__search= (labels
	// some template uses) and searched by organization name.
	labelFields.Fields["unifiedjobtemplate_labels"] = Field{SQL: "lujl.unifiedjobtemplate_id", Kind: KindFK, Rel: &Relation{Alias: "lujt", Join: "LEFT JOIN main_unifiedjobtemplate_labels lujl ON lujl.label_id = l.id LEFT JOIN main_unifiedjobtemplate lujt ON lujt.id = lujl.unifiedjobtemplate_id", Many: true, Target: func() *FieldSet {
		return &FieldSet{Model: "UnifiedJobTemplate", Fields: map[string]Field{"id": {SQL: "lujt.id", Kind: KindInt}, "name": {SQL: "lujt.name"}, "description": {SQL: "lujt.description"}}, SearchFields: []string{"name", "description"}}
	}}}
	labelFields.Fields["organization"] = Field{SQL: "l.organization_id", Kind: KindFK, Rel: &Relation{Alias: "lorg", Join: "LEFT JOIN main_organization lorg ON lorg.id = l.organization_id", Target: func() *FieldSet {
		return &FieldSet{Model: "Organization", Fields: map[string]Field{"id": {SQL: "lorg.id", Kind: KindInt}, "name": {SQL: "lorg.name"}, "description": {SQL: "lorg.description"}}, SearchFields: []string{"name", "description"}}
	}}}
	resourceRegistrars = append(resourceRegistrars, func(s *Server, mux *http.ServeMux) {
		s.route(mux, "/api/v2/labels/{$}", methodMap{"GET": s.labelList, "POST": s.labelCreate}, s.optionsFor("labels"))
		s.route(mux, "/api/v2/labels/{id}/{$}", methodMap{"GET": s.labelDetail, "PUT": s.labelUpdate, "PATCH": s.labelUpdate}, s.optionsFor("labels"))
	})
}

func (s *Server) labelAccess(q *Query, u *auth.User) {
	q.And("l.organization_id IN (" + accessibleSQL(q, u.ID, s.CT.ID("main.organization"), "read_role") + ")")
}

func scanLabel(rows pgx.Rows) (any, error) {
	l := &label{}
	err := rows.Scan(&l.ID, &l.Created, &l.Modified, &l.Name, &l.Description, &l.CreatedByID, &l.ModifiedByID, &l.OrganizationID)
	return l, err
}

const labelColumns = `l.id, l.created, l.modified, l.name, l.description, l.created_by_id, l.modified_by_id, l.organization_id`

func (s *Server) labelList(w http.ResponseWriter, r *http.Request) error {
	return s.labelListWith(w, r, nil)
}

func (s *Server) labelListWith(w http.ResponseWriter, r *http.Request, extra func(q *Query)) error {
	spec := ListSpec{Model: "Label", From: "main_label l", Columns: labelColumns, PK: "l.id", Fields: labelFields, DefaultOrder: []string{"name"}, Access: s.labelAccess}
	rows, count, page, err := s.RunList(r, spec, extra, scanLabel)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, false)
	results := make([]any, 0, len(rows))
	for _, row := range rows {
		results = append(results, s.serializeLabel(c, row.(*label)))
	}
	WriteJSON(w, 200, Paginate(r, page, count, results))
	return nil
}

func (s *Server) labelDetail(w http.ResponseWriter, r *http.Request) error {
	u, err := RequireUser(r)
	if err != nil {
		return err
	}
	id, err := PathID(r)
	if err != nil {
		return NotFoundFor("Label")
	}
	rows, err := s.Q().Query(r.Context(), `SELECT `+labelColumns+` FROM main_label l WHERE l.id = $1`, id)
	if err != nil {
		return err
	}
	defer rows.Close()
	if !rows.Next() {
		return NotFoundFor("Label")
	}
	v, err := scanLabel(rows)
	if err != nil {
		return err
	}
	l := v.(*label)
	c := s.NewSerCtx(r, true)
	if !u.IsSuperuser && !u.IsSystemAuditor && !c.HasRoleOn("main.organization", l.OrganizationID, "read_role") {
		return ErrForbidden
	}
	WriteJSON(w, 200, s.serializeLabel(c, l))
	return nil
}

func (s *Server) serializeLabel(c *SerCtx, l *label) *OMap {
	related := NewOMap()
	if c.Detail {
		org := ""
		if o := c.OrgSummary(&l.OrganizationID); o != nil {
			v, _ := o.Get("name")
			org, _ = v.(string)
		}
		related.Set("named_url", "/api/v2/labels/"+namedURLEscape(l.Name)+"++"+namedURLEscape(org)+"/")
	}
	setURL(related, "created_by", "users", l.CreatedByID)
	setURL(related, "modified_by", "users", l.ModifiedByID)
	related.Set("organization", URLFor("organizations", l.OrganizationID))
	summary := NewOMap()
	c.putSummary(summary, "organization", c.OrgSummary, &l.OrganizationID)
	c.putSummary(summary, "created_by", c.UserSummary, l.CreatedByID)
	c.putSummary(summary, "modified_by", c.UserSummary, l.ModifiedByID)
	o := Base(NewOMap(), l.ID, "label", URLFor("labels", l.ID), related, summary, l.Created, l.Modified, l.Name, l.Description)
	o.Delete("description")
	o.Set("organization", l.OrganizationID)
	return o
}

// labelFromForm validates a label body.
func (s *Server) labelFromForm(r *http.Request, f *Form, l *label) {
	l.Name = f.String("name", true, 512, l.Name)
	l.Description = f.String("description", false, 0, l.Description)
	cur := &l.OrganizationID
	if l.OrganizationID == 0 {
		cur = nil
	}
	if id, set := f.ID("organization", cur, true, s.existsIn(r.Context(), "main_organization")); set && id != nil {
		l.OrganizationID = *id
	}
}

func (s *Server) labelCreate(w http.ResponseWriter, r *http.Request) error {
	u, err := RequireWrite(r)
	if err != nil {
		return err
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	f := NewForm(body, false)
	l := &label{CreatedByID: &u.ID, ModifiedByID: &u.ID}
	s.labelFromForm(r, f, l)
	if err := f.Err(); err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	if !u.IsSuperuser && !c.HasRoleOn("main.organization", l.OrganizationID, "member_role") {
		return ErrForbidden
	}
	ctx := r.Context()
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		err := tx.QueryRow(ctx, `INSERT INTO main_label (created, modified, description, name, created_by_id, modified_by_id, organization_id) VALUES (now(), now(), $1, $2, $3, $3, $4) RETURNING id, created, modified`,
			l.Description, l.Name, u.ID, l.OrganizationID).Scan(&l.ID, &l.Created, &l.Modified)
		if err != nil {
			if isUniqueViolation(err) {
				return FieldErrors{"__all__": {"Label with this Name and Organization already exists."}}.Err()
			}
			return err
		}
		return s.Activity.Record(ctx, tx, activity.Entry{Operation: "create", Object1: "label", Changes: labelChanges(c.InTx(tx), l), ActorID: &u.ID, Links: map[string]int64{"label": l.ID}})
	})
	if err != nil {
		return err
	}
	w.Header().Set("Location", URLFor("labels", l.ID))
	WriteJSON(w, http.StatusCreated, s.serializeLabel(c, l))
	return nil
}

func (s *Server) labelUpdate(w http.ResponseWriter, r *http.Request) error {
	u, err := RequireWrite(r)
	if err != nil {
		return err
	}
	id, err := PathID(r)
	if err != nil {
		return NotFoundFor("Label")
	}
	rows, err := s.Q().Query(r.Context(), `SELECT `+labelColumns+` FROM main_label l WHERE l.id = $1`, id)
	if err != nil {
		return err
	}
	if !rows.Next() {
		rows.Close()
		return NotFoundFor("Label")
	}
	v, err := scanLabel(rows)
	rows.Close()
	if err != nil {
		return err
	}
	l := v.(*label)
	c := s.NewSerCtx(r, true)
	if !u.IsSuperuser && !c.HasRoleOn("main.organization", l.OrganizationID, "admin_role") {
		return ErrForbidden
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	prevOrg := l.OrganizationID
	before := labelChanges(c, l)
	f := NewForm(body, r.Method == http.MethodPatch)
	s.labelFromForm(r, f, l)
	if err := f.Err(); err != nil {
		return err
	}
	// can_change's can_add(data): a label moves only into an
	// organization the user is a member of.
	if !u.IsSuperuser && l.OrganizationID != prevOrg && !c.HasRoleOn("main.organization", l.OrganizationID, "member_role") {
		return ErrForbidden
	}
	l.ModifiedByID = &u.ID
	ctx := r.Context()
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		err := tx.QueryRow(ctx, `UPDATE main_label SET modified = now(), description = $2, name = $3, modified_by_id = $4, organization_id = $5 WHERE id = $1 RETURNING modified`,
			l.ID, l.Description, l.Name, u.ID, l.OrganizationID).Scan(&l.Modified)
		if err != nil {
			if isUniqueViolation(err) {
				return FieldErrors{"__all__": {"Label with this Name and Organization already exists."}}.Err()
			}
			return err
		}
		changes := diffChanges(before, labelChanges(c.InTx(tx), l))
		if len(changes) == 0 {
			return nil
		}
		return s.Activity.Record(ctx, tx, activity.Entry{Operation: "update", Object1: "label", Changes: changes, ActorID: &u.ID, Links: map[string]int64{"label": l.ID}})
	})
	if err != nil {
		return err
	}
	WriteJSON(w, 200, s.serializeLabel(c, l))
	return nil
}
