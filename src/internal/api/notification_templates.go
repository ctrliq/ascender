package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/activity"
	"github.com/ctrliq/ascender/internal/auth"
	"github.com/ctrliq/ascender/internal/crypto"
	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/models"
)

// Notification templates (NotificationTemplateList/Detail/Test/Copy and the
// notifications sent from them), the organization and project notification
// relations, and the notifications of each kind of job.

type notificationTemplate struct {
	ID                int64
	Created, Modified time.Time
	Name, Description string
	NotificationType  string
	Configuration     json.RawMessage
	CreatedByID       *int64
	ModifiedByID      *int64
	OrganizationID    *int64
	Messages          json.RawMessage
}

const notificationTemplateColumns = `nt.id, nt.created, nt.modified, nt.name, nt.description, nt.notification_type, nt.notification_configuration, nt.created_by_id, nt.modified_by_id, nt.organization_id, nt.messages`

func scanNotificationTemplate(rows pgx.Rows) (any, error) {
	n := &notificationTemplate{}
	if err := rows.Scan(&n.ID, &n.Created, &n.Modified, &n.Name, &n.Description, &n.NotificationType, &n.Configuration, &n.CreatedByID, &n.ModifiedByID, &n.OrganizationID, &n.Messages); err != nil {
		return nil, err
	}
	return n, nil
}

var notificationTemplateFields = &FieldSet{
	Model: "NotificationTemplate",
	Fields: map[string]Field{
		"id": {SQL: "nt.id", Kind: KindInt}, "name": {SQL: "nt.name"}, "description": {SQL: "nt.description"},
		"created": {SQL: "nt.created", Kind: KindDateTime}, "modified": {SQL: "nt.modified", Kind: KindDateTime},
		"notification_type": {SQL: "nt.notification_type"},
		"organization":      {SQL: "nt.organization_id", Kind: KindFK, Rel: &Relation{Alias: "o", Join: "LEFT JOIN main_organization o ON o.id = nt.organization_id", Target: func() *FieldSet { return organizationFields }}},
		"created_by":        {SQL: "nt.created_by_id", Kind: KindFK, Rel: &Relation{Alias: "cb", Join: "LEFT JOIN auth_user cb ON cb.id = nt.created_by_id", Target: func() *FieldSet { return userFieldsAlias("cb") }}},
		"modified_by":       {SQL: "nt.modified_by_id", Kind: KindFK, Rel: &Relation{Alias: "mb", Join: "LEFT JOIN auth_user mb ON mb.id = nt.modified_by_id", Target: func() *FieldSet { return userFieldsAlias("mb") }}},
	},
	SearchFields: []string{"description", "name", "notification_type"},
}

type notification struct {
	ID                 int64
	Created, Modified  time.Time
	Status, Error      string
	Sent               int
	NotificationType   string
	Recipients         string
	Subject            string
	TemplateID         int64
	Body               json.RawMessage
	TemplateName, Desc string
}

const notificationColumns = `n.id, n.created, n.modified, n.status, n.error, n.notifications_sent, n.notification_type, n.recipients, n.subject, n.notification_template_id, n.body, ntt.name, ntt.description`

func scanNotification(rows pgx.Rows) (any, error) {
	n := &notification{}
	if err := rows.Scan(&n.ID, &n.Created, &n.Modified, &n.Status, &n.Error, &n.Sent, &n.NotificationType, &n.Recipients, &n.Subject, &n.TemplateID, &n.Body, &n.TemplateName, &n.Desc); err != nil {
		return nil, err
	}
	return n, nil
}

var notificationFields = &FieldSet{
	Model: "Notification",
	Fields: map[string]Field{
		"id": {SQL: "n.id", Kind: KindInt}, "created": {SQL: "n.created", Kind: KindDateTime}, "modified": {SQL: "n.modified", Kind: KindDateTime},
		"status": {SQL: "n.status"}, "error": {SQL: "n.error"}, "notifications_sent": {SQL: "n.notifications_sent", Kind: KindInt},
		"notification_type": {SQL: "n.notification_type"}, "recipients": {SQL: "n.recipients"}, "subject": {SQL: "n.subject"}, "body": {SQL: "n.body::text"},
		"notification_template": {SQL: "n.notification_template_id", Kind: KindFK, Rel: &Relation{Alias: "ntt", Join: "", Target: func() *FieldSet { return notificationTemplateFieldsAlias("ntt") }}},
	},
	SearchFields: []string{"body", "notification_type", "subject"},
}

func notificationTemplateFieldsAlias(alias string) *FieldSet {
	return &FieldSet{Model: "NotificationTemplate", Fields: map[string]Field{
		"id": {SQL: alias + ".id", Kind: KindInt}, "name": {SQL: alias + ".name"}, "description": {SQL: alias + ".description"},
		"notification_type": {SQL: alias + ".notification_type"}, "organization": {SQL: alias + ".organization_id", Kind: KindInt},
	}}
}

var notificationJobCollections = map[string]string{"jobs": "Job", "project_updates": "ProjectUpdate", "inventory_updates": "InventoryUpdate",
	"workflow_jobs": "WorkflowJob", "system_jobs": "SystemJob", "ad_hoc_commands": "AdHocCommand"}

// notificationJobTables names each job collection's table.
var notificationJobTables = map[string]string{"Job": "main_job", "ProjectUpdate": "main_projectupdate", "InventoryUpdate": "main_inventoryupdate",
	"WorkflowJob": "main_workflowjob", "SystemJob": "main_systemjob", "AdHocCommand": "main_adhoccommand"}

func init() {
	resourceRegistrars = append(resourceRegistrars, func(s *Server, mux *http.ServeMux) {
		s.route(mux, "/api/v2/notification_templates/{$}", methodMap{"GET": s.notificationTemplateList, "POST": s.notificationTemplateCreate},
			s.optionsFiltered("notification_templates", s.ntOptionsAllow))
		s.route(mux, "/api/v2/notification_templates/{id}/{$}", methodMap{"GET": s.notificationTemplateDetail, "PUT": s.notificationTemplateUpdate,
			"PATCH": s.notificationTemplateUpdate, "DELETE": s.notificationTemplateDelete}, s.optionsFiltered("notification_templates", s.ntOptionsAllow))
		s.route(mux, "/api/v2/notification_templates/{id}/test/{$}", methodMap{"POST": s.notificationTemplateTest}, s.optionsFor("notification_templates"))
		s.route(mux, "/api/v2/notification_templates/{id}/copy/{$}", methodMap{"GET": s.notificationTemplateCanCopy, "POST": s.notificationTemplateCopy}, s.optionsFor("notification_templates"))
		s.route(mux, "/api/v2/notification_templates/{id}/notifications/{$}", methodMap{"GET": s.notificationTemplateNotifications}, s.optionsFor("notifications"))
		s.route(mux, "/api/v2/notifications/{$}", methodMap{"GET": s.notificationList}, s.optionsFor("notifications"))
		s.route(mux, "/api/v2/notifications/{id}/{$}", methodMap{"GET": s.notificationDetail}, s.optionsFor("notifications"))
		s.route(mux, "/api/v2/organizations/{id}/notification_templates/{$}", methodMap{"GET": s.orgNotificationTemplates, "POST": s.orgNotificationTemplateCreate},
			s.optionsFiltered("notification_templates", s.ntOptionsAllow))
		for _, kind := range []string{"started", "success", "error", "approvals", "changed"} {
			kind := kind
			s.route(mux, "/api/v2/organizations/{id}/notification_templates_"+kind+"/{$}", methodMap{
				"GET": func(w http.ResponseWriter, r *http.Request) error {
					return s.ntRelationList(w, r, "organization", kind)
				},
				"POST": func(w http.ResponseWriter, r *http.Request) error {
					return s.ntRelationAttach(w, r, "organization", kind)
				},
			}, s.optionsFor("notification_templates"))
		}
		for _, kind := range []string{"started", "success", "error"} {
			kind := kind
			s.route(mux, "/api/v2/projects/{id}/notification_templates_"+kind+"/{$}", methodMap{
				"GET":  func(w http.ResponseWriter, r *http.Request) error { return s.ntRelationList(w, r, "project", kind) },
				"POST": func(w http.ResponseWriter, r *http.Request) error { return s.ntRelationAttach(w, r, "project", kind) },
			}, s.optionsFor("notification_templates"))
		}
		for coll, model := range notificationJobCollections {
			coll, model := coll, model
			s.route(mux, "/api/v2/"+coll+"/{id}/notifications/{$}", methodMap{"GET": func(w http.ResponseWriter, r *http.Request) error {
				return s.jobNotifications(w, r, model)
			}}, s.optionsFor("notifications"))
		}
	})
}

// ---------------------------------------------------------------- access

// notificationTemplateAccess is NotificationTemplateAccess.filtered_queryset:
// templates of organizations the user is a notification admin or an
// auditor of.
func (s *Server) notificationTemplateAccess(q *Query, u *auth.User) {
	ct := s.CT.ID("main.organization")
	q.And("(nt.organization_id IN (" + accessibleSQL(q, u.ID, ct, "notification_admin_role") + ") OR nt.organization_id IN (" + accessibleSQL(q, u.ID, ct, "auditor_role") + "))")
}

func (s *Server) isNotificationAdmin(c *SerCtx, orgID *int64) bool {
	if c.User != nil && c.User.IsSuperuser {
		return true
	}
	return orgID != nil && c.HasRoleOn("main.organization", *orgID, "notification_admin_role")
}

func (s *Server) ntOptionsAllow(r *http.Request, u *auth.User, method string) bool {
	if u.IsSuperuser {
		return true
	}
	c := s.NewSerCtx(r, true)
	if method == "PUT" {
		n, err := s.loadNotificationTemplate(r.Context(), r)
		return err == nil && s.isNotificationAdmin(c, n.OrganizationID)
	}
	var n int
	_ = db.Tolerant(s.Q()).QueryRow(r.Context(), `SELECT count(*) FROM main_rbac_role_ancestors a JOIN main_rbac_roles_members m ON m.role_id = a.ancestor_id
		WHERE m.user_id = $1 AND a.content_type_id = $2 AND a.role_field = 'notification_admin_role'`, u.ID, s.CT.ID("main.organization")).Scan(&n)
	return n > 0
}

func (s *Server) loadNotificationTemplate(ctx context.Context, r *http.Request) (*notificationTemplate, error) {
	id, err := PathID(r)
	if err != nil {
		return nil, NotFoundFor("NotificationTemplate")
	}
	return s.notificationTemplateByID(ctx, id)
}

func (s *Server) notificationTemplateByID(ctx context.Context, id int64) (*notificationTemplate, error) {
	rows, err := s.Q().Query(ctx, `SELECT `+notificationTemplateColumns+` FROM main_notificationtemplate nt WHERE nt.id = $1`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	if !rows.Next() {
		return nil, NotFoundFor("NotificationTemplate")
	}
	v, err := scanNotificationTemplate(rows)
	if err != nil {
		return nil, err
	}
	return v.(*notificationTemplate), nil
}

// loadVisibleNotificationTemplate is get_object with the read check: 404
// when missing, 403 when the user may not read it.
func (s *Server) loadVisibleNotificationTemplate(r *http.Request) (*notificationTemplate, *SerCtx, error) {
	u, err := RequireUser(r)
	if err != nil {
		return nil, nil, err
	}
	n, err := s.loadNotificationTemplate(r.Context(), r)
	if err != nil {
		return nil, nil, err
	}
	c := s.NewSerCtx(r, true)
	if !u.IsSuperuser && !u.IsSystemAuditor && (n.OrganizationID == nil || !(c.HasRoleOn("main.organization", *n.OrganizationID, "notification_admin_role") || c.HasRoleOn("main.organization", *n.OrganizationID, "auditor_role"))) {
		return nil, nil, ErrForbidden
	}
	return n, c, nil
}

// ---------------------------------------------------------------- list and detail

func (s *Server) notificationTemplateList(w http.ResponseWriter, r *http.Request) error {
	return s.notificationTemplateListWith(w, r, nil)
}

func (s *Server) notificationTemplateListWith(w http.ResponseWriter, r *http.Request, extra func(q *Query)) error {
	spec := ListSpec{Model: "NotificationTemplate", From: "main_notificationtemplate nt", Columns: notificationTemplateColumns, PK: "nt.id", Fields: notificationTemplateFields, DefaultOrder: []string{"name"}, Access: s.notificationTemplateAccess}
	rows, count, page, err := s.RunList(r, spec, extra, scanNotificationTemplate)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, false)
	results := make([]any, 0, len(rows))
	for _, row := range rows {
		results = append(results, s.serializeNotificationTemplate(c, row.(*notificationTemplate)))
	}
	WriteJSON(w, 200, Paginate(r, page, count, results))
	return nil
}

func (s *Server) notificationTemplateDetail(w http.ResponseWriter, r *http.Request) error {
	n, c, err := s.loadVisibleNotificationTemplate(r)
	if err != nil {
		return err
	}
	WriteJSON(w, 200, s.serializeNotificationTemplate(c, n))
	return nil
}

func (s *Server) serializeNotificationTemplate(c *SerCtx, n *notificationTemplate) *OMap {
	related := NewOMap()
	orgName := ""
	if n.OrganizationID != nil {
		_ = db.Tolerant(s.Q()).QueryRow(c.Ctx(), `SELECT name FROM main_organization WHERE id = $1`, *n.OrganizationID).Scan(&orgName)
	}
	if c.Detail {
		related.Set("named_url", "/api/v2/notification_templates/"+namedURLEscape(n.Name)+"++"+namedURLEscape(orgName)+"/")
	}
	setURL(related, "created_by", "users", n.CreatedByID)
	setURL(related, "modified_by", "users", n.ModifiedByID)
	related.Set("test", SubURL("notification_templates", n.ID, "test")).Set("notifications", SubURL("notification_templates", n.ID, "notifications")).Set("copy", SubURL("notification_templates", n.ID, "copy"))
	setURL(related, "organization", "organizations", n.OrganizationID)
	summary := NewOMap()
	c.putSummary(summary, "organization", c.OrgSummary, n.OrganizationID)
	c.putSummary(summary, "created_by", c.UserSummary, n.CreatedByID)
	c.putSummary(summary, "modified_by", c.UserSummary, n.ModifiedByID)
	if c.WantSummary("user_capabilities") {
		edit := s.isNotificationAdmin(c, n.OrganizationID)
		if c.User != nil && !c.User.IsSuperuser && n.OrganizationID == nil {
			edit = false
		}
		// copy: CopyAPIView's can_copy is can_add with the object's
		// organization, which is notification admin there.
		summary.Set("user_capabilities", Caps("edit", edit, "delete", edit, "copy", edit))
	}
	if c.WantSummary("recent_notifications") {
		recent := []any{}
		rows, err := s.Q().Query(c.Ctx(), `SELECT id, status, created, COALESCE(error, '') FROM main_notification WHERE notification_template_id = $1 ORDER BY created DESC LIMIT 5`, n.ID)
		if err == nil {
			for rows.Next() {
				var id int64
				var status, errText string
				var created time.Time
				if err := rows.Scan(&id, &status, &created, &errText); err == nil {
					recent = append(recent, NewOMap().Set("id", id).Set("status", status).Set("created", models.FormatTime(created)).Set("error", errText))
				}
			}
			rows.Close()
			s.logRowsErr(c.Ctx(), "serializeNotificationTemplate", rows)
		}
		summary.Set("recent_notifications", recent)
	}
	o := Base(NewOMap(), n.ID, "notification_template", URLFor("notification_templates", n.ID), related, summary, n.Created, n.Modified, n.Name, n.Description)
	o.Set("organization", models.NullableID(n.OrganizationID)).Set("notification_type", n.NotificationType)
	o.Set("notification_configuration", displayNotificationConfiguration(n))
	if len(n.Messages) == 0 || string(n.Messages) == "null" {
		o.Set("messages", nil)
	} else {
		v, err := decodeOrdered(string(n.Messages))
		if err != nil {
			v = nil
		}
		o.Set("messages", v)
	}
	return o
}

// displayNotificationConfiguration masks the backend's parameters whose
// stored value is encrypted.
func displayNotificationConfiguration(n *notificationTemplate) *OMap {
	conf := NewOMap()
	if v, err := decodeOrdered(string(n.Configuration)); err == nil {
		if m, ok := v.(*OMap); ok {
			conf = m
		}
	}
	// Every stored encrypted value reads $encrypted$, the type's password
	// parameters and any key left over from another type alike.
	for _, k := range conf.Keys() {
		if v, _ := conf.Get(k); strings.HasPrefix(pyStr(v), "$encrypted$") {
			conf.Set(k, "$encrypted$")
		}
	}
	return conf
}

// ---------------------------------------------------------------- validation

// ntForm is what a create or update validated: the model's fields.
type ntForm struct {
	Name, Description string
	OrganizationID    *int64
	Type              string
	Config            *OMap // nil when not given
	Messages          any   // *OMap, nil (null), or ntUnset
	MessagesGiven     bool
}

// validateNotificationTemplate runs the serializer: field validation,
// validate_messages, the (organization, name) uniqueness and validate().
func (s *Server) validateNotificationTemplate(ctx context.Context, body *OMap, partial bool, cur *notificationTemplate) (*ntForm, error) {
	f := NewForm(body, partial)
	out := &ntForm{}
	if cur != nil {
		out.Name, out.Description, out.OrganizationID, out.Type = cur.Name, cur.Description, cur.OrganizationID, cur.NotificationType
	}
	out.Name = f.String("name", true, 512, out.Name)
	out.Description = f.String("description", false, 0, out.Description)
	orgExists := s.existsIn(ctx, "main_organization")
	if org, given := f.ID("organization", out.OrganizationID, true, orgExists); given || partial {
		out.OrganizationID = org
	}
	out.Type = f.Choice("notification_type", out.Type, notificationTypeChoices, true)
	if v, ok := body.Get("notification_configuration"); ok {
		switch t := v.(type) {
		case *OMap:
			out.Config = t
		case nil:
			f.Errs.Add("notification_configuration", "This field may not be null.")
		default:
			// JSONField takes any JSON; validate() then fails on the
			// missing keys of a non-object.
			out.Config = NewOMap()
		}
	}
	if v, ok := body.Get("messages"); ok {
		out.MessagesGiven = true
		out.Messages = v
		typ := out.Type
		if cur != nil && !body.Has("notification_type") {
			typ = cur.NotificationType
		}
		if errs, err := s.validateNotificationMessages(ctx, v, typ); err != nil {
			return nil, err
		} else if len(errs) > 0 {
			f.Errs[`messages`] = errs
		}
	}
	if err := f.Err(); err != nil {
		return nil, err
	}
	// UniqueTogetherValidator (organization, name).
	if out.OrganizationID != nil {
		var taken bool
		var self int64
		if cur != nil {
			self = cur.ID
		}
		_ = db.Tolerant(s.Q()).QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM main_notificationtemplate WHERE organization_id = $1 AND name = $2 AND id <> $3)`, *out.OrganizationID, out.Name, self).Scan(&taken)
		if taken {
			return nil, FieldErrors{nonFieldKey: {"The fields organization, name must make a unique set."}}.Err()
		}
	}
	// validate(): the configuration against the backend's parameters.
	if out.Config == nil {
		// The stored configuration belongs to the old type: kept under a
		// new one, its password would go wherever the new type sends
		// (an email password as a webhook's basic auth) without the
		// re-entry a changed destination needs.
		if cur != nil && out.Type != cur.NotificationType {
			return nil, FieldErrors{"notification_configuration": {"This field is required when notification_type changes."}}.Err()
		}
		return out, nil
	}
	t := notificationType(out.Type)
	if t == nil {
		return nil, FieldErrors{nonFieldKey: {"Missing required fields for Notification Configuration: notification_type"}}.Err()
	}
	var missing, errs []string
	var incorrect [][2]string
	var forward []string
	for _, p := range t.Params {
		v, ok := out.Config.Get(p.Key)
		if !ok {
			if p.HasDefault {
				out.Config.Set(p.Key, p.Default)
				v = p.Default
			} else {
				missing = append(missing, p.Key)
				continue
			}
		}
		if !ntTypeMatches(p.Type, v) {
			incorrect = append(incorrect, [2]string{p.Key, p.Type})
			continue
		}
		if p.Type == "list" {
			if l, _ := v.([]any); len(l) < 1 {
				errs = append(errs, fmt.Sprintf("No values specified for field '%s'", p.Key))
				continue
			}
		}
		if p.Type == "password" && v == "$encrypted$" && cur != nil {
			forward = append(forward, p.Key)
		}
		if p.Key == "http_method" {
			if m := strings.ToLower(v.(string)); m != "put" && m != "post" {
				errs = append(errs, "HTTP method must be either 'POST' or 'PUT'.")
			}
		}
		if p.Key == "homeserver_url" {
			u := strings.ToLower(strings.TrimSpace(v.(string)))
			if !strings.HasPrefix(u, "http://") && !strings.HasPrefix(u, "https://") {
				errs = append(errs, "Homeserver URL must start with 'http://' or 'https://'.")
			}
		}
	}
	if len(missing) > 0 {
		errs = append(errs, fmt.Sprintf("Missing required fields for Notification Configuration: %s.", pyListRepr(missing)))
	}
	for _, x := range incorrect {
		errs = append(errs, fmt.Sprintf("Configuration field '%s' incorrect type, expected %s.", x[0], x[1]))
	}
	if len(errs) > 0 {
		return nil, FieldErrors{nonFieldKey: errs}.Err()
	}
	// Only what the type's backend reads is kept: its parameters and the
	// optional settings its constructor took (Slack's color, Grafana's
	// dashboard and panel, a Mattermost channel). Any other key (a url
	// beside an email server's settings) would be stored, and read by the
	// type the template is changed to next, with the stored password
	// beside it. The old serializer kept every key; no backend read one
	// outside its own list (Django's SMTP backend aside, whose
	// ssl_keyfile and ssl_certfile would name files on this server).
	known := map[string]bool{}
	for _, p := range t.Params {
		known[p.Key] = true
	}
	for _, k := range t.Optional {
		known[k] = true
	}
	for _, k := range out.Config.Keys() {
		if !known[k] {
			out.Config.Delete(k)
		}
	}
	if len(forward) > 0 {
		old := NewOMap()
		if v, err := decodeOrdered(string(cur.Configuration)); err == nil {
			if m, ok := v.(*OMap); ok {
				old = m
			}
		}
		// A kept secret goes on to wherever the template now sends. A
		// notification admin who did not enter it may not send it
		// somewhere else (another type, host or URL, or without TLS):
		// the secret has to be entered again with such a change.
		if u := auth.UserFrom(ctx); u == nil || !u.IsSuperuser {
			if moved := ntEndpointChanged(cur.NotificationType, out.Type, old, out.Config); moved != "" {
				fe := FieldErrors{}
				for _, k := range forward {
					fe["notification_configuration"] = append(fe["notification_configuration"], fmt.Sprintf("Re-enter %s: it cannot be kept when %s changes.", k, moved))
				}
				return nil, fe.Err()
			}
		}
		for _, k := range forward {
			v, _ := old.Get(k)
			out.Config.Set(k, v)
		}
	}
	return out, nil
}

// ntEndpointFields are, per notification type, the settings that decide
// where a stored secret is sent and how. Types whose secrets only go to
// one fixed service (Slack, Twilio, PagerDuty) have none.
var ntEndpointFields = map[string][]string{
	"email":   {"host", "port", "use_tls", "use_ssl"},
	"webhook": {"url", "disable_ssl_verification"},
	"grafana": {"grafana_url", "grafana_no_verify_ssl"},
	"irc":     {"server", "port", "use_ssl"},
	"matrix":  {"homeserver_url", "disable_ssl_verification"},
}

// ntEndpointFlags are the endpoint settings that are switches.
var ntEndpointFlags = map[string]bool{"use_tls": true, "use_ssl": true, "disable_ssl_verification": true, "grafana_no_verify_ssl": true}

// ntEndpointChanged names what changed about where the template sends its
// secrets, or returns "" when nothing did.
func ntEndpointChanged(oldType, newType string, old, cur *OMap) string {
	if oldType != newType {
		return "notification_type"
	}
	for _, k := range ntEndpointFields[newType] {
		a, _ := old.Get(k)
		b, _ := cur.Get(k)
		if ntEndpointFlags[k] {
			// An optional flag left out is off, as the backend read it.
			if jsTruthy(a) != jsTruthy(b) {
				return k
			}
			continue
		}
		ja, _ := json.Marshal(a)
		jb, _ := json.Marshal(b)
		if string(ja) != string(jb) {
			return k
		}
	}
	return ""
}

// ntTypeMatches is the serializer's type_map check: the exact Python type.
func ntTypeMatches(typ string, v any) bool {
	switch typ {
	case "string", "password":
		_, ok := v.(string)
		return ok
	case "int":
		n, ok := v.(json.Number)
		if !ok {
			if i, isInt := v.(int); isInt {
				_ = i
				return true
			}
			return false
		}
		return !strings.ContainsAny(n.String(), ".eE")
	case "bool":
		_, ok := v.(bool)
		return ok
	case "list":
		_, ok := v.([]any)
		return ok
	case "object":
		_, ok := v.(*OMap)
		return ok
	}
	return false
}

func pyListRepr(items []string) string {
	parts := make([]string, len(items))
	for i, s := range items {
		parts[i] = "'" + strings.ReplaceAll(s, "'", "\\'") + "'"
	}
	return "[" + strings.Join(parts, ", ") + "]"
}

// validateNotificationMessages is validate_messages.
func (s *Server) validateNotificationMessages(ctx context.Context, messages any, typ string) ([]string, error) {
	if messages == nil {
		return nil, nil
	}
	var errs, collected []string
	checkMessages := func(event string, m *OMap) {
		for _, mt := range m.Keys() {
			if mt != "message" && mt != "body" {
				errs = append(errs, fmt.Sprintf("Message type '%s' invalid, must be either 'message' or 'body'", mt))
				continue
			}
			v, _ := m.Get(mt)
			if v == nil {
				continue
			}
			str, ok := v.(string)
			if !ok {
				errs = append(errs, fmt.Sprintf("Expected string for '%s', found <class '%s'>, ", mt, pyTypeName(v)))
				continue
			}
			if mt == "message" && strings.Contains(str, "\n") {
				errs = append(errs, fmt.Sprintf("Messages cannot contain newlines (found newline in %s event)", event))
				continue
			}
			collected = append(collected, str)
		}
	}
	root, ok := messages.(*OMap)
	if !ok {
		errs = append(errs, fmt.Sprintf("Expected dict for 'messages' field, found <class '%s'>", pyTypeName(messages)))
	} else {
		for _, event := range root.Keys() {
			if event != "started" && event != "success" && event != "error" && event != "changed" && event != "workflow_approval" {
				errs = append(errs, fmt.Sprintf("Event '%s' invalid, must be one of 'started', 'success', 'error', 'changed', or 'workflow_approval'", event))
				continue
			}
			ev, _ := root.Get(event)
			if ev == nil {
				continue
			}
			em, ok := ev.(*OMap)
			if !ok {
				errs = append(errs, fmt.Sprintf("Expected dict for event '%s', found <class '%s'>", event, pyTypeName(ev)))
				continue
			}
			if event == "workflow_approval" {
				for _, sub := range em.Keys() {
					if sub != "running" && sub != "approved" && sub != "timed_out" && sub != "denied" {
						errs = append(errs, fmt.Sprintf("Workflow Approval event '%s' invalid, must be one of 'running', 'approved', 'timed_out', or 'denied'", sub))
						continue
					}
					sv, _ := em.Get(sub)
					if sv == nil {
						continue
					}
					sm, ok := sv.(*OMap)
					if !ok {
						errs = append(errs, fmt.Sprintf("Expected dict for workflow approval event '%s', found <class '%s'>", sub, pyTypeName(sv)))
						continue
					}
					checkMessages(event, sm)
				}
			} else {
				checkMessages(event, em)
			}
		}
	}
	var bodies [][2]string
	if typ == "webhook" && root != nil {
		for _, event := range root.Keys() {
			ev, _ := root.Get(event)
			em, ok := ev.(*OMap)
			if !ok || em.Len() == 0 {
				continue
			}
			if b, ok := em.Get("body"); ok {
				if bs, ok := b.(string); ok && bs != "" {
					bodies = append(bodies, [2]string{event, bs})
				}
			}
		}
	}
	if len(collected) > 0 || len(bodies) > 0 {
		more, err := s.jinjaValidate(ctx, collected, bodies)
		if err != nil {
			return nil, err
		}
		errs = append(errs, more...)
	}
	return errs, nil
}

// ---------------------------------------------------------------- create, update, delete

func (s *Server) ntCanAdd(c *SerCtx, u *auth.User, body *OMap) error {
	if u.IsSuperuser {
		return nil
	}
	// check_related('organization', mandatory=True) on the raw data.
	v, ok := body.Get("organization")
	if !ok || v == nil {
		return ErrForbidden
	}
	var id int64
	switch t := v.(type) {
	case json.Number:
		n, err := t.Int64()
		if err != nil {
			return ErrForbidden
		}
		id = n
	default:
		return ErrForbidden
	}
	if !c.HasRoleOn("main.organization", id, "notification_admin_role") {
		return ErrForbidden
	}
	return nil
}

func (s *Server) notificationTemplateCreate(w http.ResponseWriter, r *http.Request) error {
	return s.notificationTemplateCreateWith(w, r, nil)
}

func (s *Server) notificationTemplateCreateWith(w http.ResponseWriter, r *http.Request, orgID *int64) error {
	u, err := RequireWrite(r)
	if err != nil {
		return err
	}
	ctx := r.Context()
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	if orgID != nil {
		// A sub-list create sets the parent.
		body.Set("organization", json.Number(fmt.Sprint(*orgID)))
	}
	c := s.NewSerCtx(r, true)
	if err := s.ntCanAdd(c, u, body); err != nil {
		return err
	}
	form, err := s.validateNotificationTemplate(ctx, body, false, nil)
	if err != nil {
		return err
	}
	var msgs any = ntDefaultMessagesValue()
	if form.MessagesGiven {
		msgs = form.Messages
	}
	conf := form.Config
	if conf == nil {
		conf = NewOMap()
	}
	n := &notificationTemplate{}
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		// NotificationTemplate.save: the first save holds the passwords
		// back, the second (with a primary key) encrypts them.
		t := notificationType(form.Type)
		first := ntCopyConfig(conf)
		var secrets []string
		for _, p := range t.Params {
			if p.Type != "password" {
				continue
			}
			v, _ := conf.Get(p.Key)
			if sv, ok := v.(string); ok && !strings.HasPrefix(sv, "$encrypted$") {
				first.Set(p.Key, "")
				secrets = append(secrets, p.Key)
			}
		}
		cb, _ := json.Marshal(first)
		mb, _ := json.Marshal(msgs)
		if err := tx.QueryRow(ctx, `INSERT INTO main_notificationtemplate (created, modified, name, description, notification_type, notification_configuration, created_by_id, modified_by_id, organization_id, messages)
			VALUES (now(), now(), $1, $2, $3, $4::jsonb, $5, $5, $6, $7::jsonb) RETURNING id`, form.Name, form.Description, form.Type, string(cb), u.ID, form.OrganizationID, string(mb)).Scan(&n.ID); err != nil {
			return err
		}
		if err := s.Activity.Record(ctx, tx, activity.Entry{Operation: "create", Object1: "notification_template", Changes: s.ntChanges(ctx, tx, form.Name, form.Description, form.OrganizationID, form.Type, first, msgs, n.ID), ActorID: &u.ID, Links: map[string]int64{"notification_template": n.ID}}); err != nil {
			return err
		}
		if len(secrets) == 0 {
			return nil
		}
		final := ntCopyConfig(first)
		changed := false
		for _, k := range secrets {
			v, _ := conf.Get(k)
			enc, err := crypto.EncryptField(s.Cfg.SecretKey, "notification_configuration", &n.ID, v.(string), false)
			if err != nil {
				return err
			}
			final.Set(k, enc)
			if enc != "" {
				changed = true
			}
		}
		fb, _ := json.Marshal(final)
		if _, err := tx.Exec(ctx, `UPDATE main_notificationtemplate SET notification_configuration = $2::jsonb, modified = now() WHERE id = $1`, n.ID, string(fb)); err != nil {
			return err
		}
		if changed {
			return s.Activity.Record(ctx, tx, activity.Entry{Operation: "update", Object1: "notification_template",
				Changes: map[string]any{"notification_configuration": []any{ntConfigText(first), ntConfigText(ntMaskConfig(final))}}, ActorID: &u.ID, Links: map[string]int64{"notification_template": n.ID}})
		}
		return nil
	})
	if err != nil {
		return err
	}
	n, err = s.notificationTemplateByID(ctx, n.ID)
	if err != nil {
		return err
	}
	w.Header().Set("Location", URLFor("notification_templates", n.ID))
	WriteJSON(w, http.StatusCreated, s.serializeNotificationTemplate(c, n))
	return nil
}

// ntDefaultMessagesValue is the model's default_messages().
func ntDefaultMessagesValue() *OMap {
	return NewOMap().Set("started", nil).Set("success", nil).Set("error", nil).Set("changed", nil).Set("workflow_approval", nil)
}

func ntCopyConfig(m *OMap) *OMap {
	out := NewOMap()
	for _, k := range m.Keys() {
		v, _ := m.Get(k)
		out.Set(k, v)
	}
	return out
}

func ntMaskConfig(m *OMap) *OMap {
	out := ntCopyConfig(m)
	for _, k := range out.Keys() {
		v, _ := out.Get(k)
		if sv, ok := v.(string); ok && strings.HasPrefix(sv, "$encrypted$") {
			out.Set(k, "$encrypted$")
		}
	}
	return out
}

// ntConfigText is a JSON value as the activity stream wrote it.
func ntConfigText(v any) string {
	b, err := activity.PyJSON(v)
	if err != nil {
		return ""
	}
	return string(b)
}

func (s *Server) ntChanges(ctx context.Context, q db.Querier, name, desc string, orgID *int64, typ string, conf *OMap, msgs any, id int64) map[string]any {
	org := s.orgRef(ctx, q, orgID)
	return map[string]any{"name": name, "description": desc, "organization": org, "notification_type": typ,
		"notification_configuration": ntConfigText(ntMaskConfig(conf)), "messages": ntConfigText(msgs), "id": id}
}

func (s *Server) notificationTemplateUpdate(w http.ResponseWriter, r *http.Request) error {
	u, err := RequireWrite(r)
	if err != nil {
		return err
	}
	ctx := r.Context()
	cur, c, err := s.loadVisibleNotificationTemplate(r)
	if err != nil {
		return err
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	if !u.IsSuperuser {
		// can_change: an orphan only for superusers; admin of the current
		// organization and of a new one.
		if cur.OrganizationID == nil || !c.HasRoleOn("main.organization", *cur.OrganizationID, "notification_admin_role") {
			return ErrForbidden
		}
	}
	partial := r.Method == http.MethodPatch
	form, err := s.validateNotificationTemplate(ctx, body, partial, cur)
	if err != nil {
		return err
	}
	// The organization it ends up in, however the request spelled it
	// (7, "7", a form field): admin there too, and only a superuser
	// leaves a template without one.
	if !u.IsSuperuser && !sameID(cur.OrganizationID, form.OrganizationID) {
		if form.OrganizationID == nil || !c.HasRoleOn("main.organization", *form.OrganizationID, "notification_admin_role") {
			return ErrForbidden
		}
	}
	oldConf := NewOMap()
	if v, err := decodeOrdered(string(cur.Configuration)); err == nil {
		if m, ok := v.(*OMap); ok {
			oldConf = m
		}
	}
	conf := oldConf
	if form.Config != nil {
		conf = ntCopyConfig(form.Config)
	}
	var oldMsgs any
	if len(cur.Messages) > 0 && string(cur.Messages) != "null" {
		oldMsgs, _ = decodeOrdered(string(cur.Messages))
	}
	msgs := oldMsgs
	if form.MessagesGiven {
		msgs = ntMergeMessages(oldMsgs, form.Messages)
	}
	// save(): encrypt the passwords that are not encrypted yet.
	if t := notificationType(form.Type); t != nil {
		for _, p := range t.Params {
			if p.Type != "password" {
				continue
			}
			v, ok := conf.Get(p.Key)
			if !ok {
				continue
			}
			sv, _ := v.(string)
			if strings.HasPrefix(sv, "$encrypted$") {
				continue
			}
			enc, err := crypto.EncryptField(s.Cfg.SecretKey, "notification_configuration", &cur.ID, sv, false)
			if err != nil {
				return err
			}
			conf.Set(p.Key, enc)
		}
	}
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		cb, _ := json.Marshal(conf)
		mb, _ := json.Marshal(msgs)
		if _, err := tx.Exec(ctx, `UPDATE main_notificationtemplate SET name = $2, description = $3, organization_id = $4, notification_type = $5, notification_configuration = $6::jsonb,
			messages = $7::jsonb, modified = now(), modified_by_id = $8 WHERE id = $1`, cur.ID, form.Name, form.Description, form.OrganizationID, form.Type, string(cb), string(mb), u.ID); err != nil {
			return err
		}
		changes := map[string]any{}
		if form.Name != cur.Name {
			changes["name"] = []any{cur.Name, form.Name}
		}
		if form.Description != cur.Description {
			changes["description"] = []any{cur.Description, form.Description}
		}
		if !sameID(form.OrganizationID, cur.OrganizationID) {
			changes["organization"] = []any{s.orgRef(ctx, tx, cur.OrganizationID), s.orgRef(ctx, tx, form.OrganizationID)}
		}
		if form.Type != cur.NotificationType {
			changes["notification_type"] = []any{cur.NotificationType, form.Type}
		}
		if a, b := ntConfigText(ntMaskConfig(oldConf)), ntConfigText(ntMaskConfig(conf)); !jsonEqualText(cur.Configuration, cb) {
			changes["notification_configuration"] = []any{a, b}
		}
		if !jsonEqualText(cur.Messages, mb) {
			changes["messages"] = []any{ntConfigText(oldMsgs), ntConfigText(msgs)}
		}
		if len(changes) == 0 {
			return nil
		}
		return s.Activity.Record(ctx, tx, activity.Entry{Operation: "update", Object1: "notification_template", Changes: changes, ActorID: &u.ID, Links: map[string]int64{"notification_template": cur.ID}})
	})
	if err != nil {
		return err
	}
	n, err := s.notificationTemplateByID(ctx, cur.ID)
	if err != nil {
		return err
	}
	WriteJSON(w, 200, s.serializeNotificationTemplate(c, n))
	return nil
}

func sameID(a, b *int64) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	return *a == *b
}

func (s *Server) orgRef(ctx context.Context, q db.Querier, id *int64) any {
	return s.nameRefCtx(ctx, q, `SELECT name FROM main_organization WHERE id = $1`, id)
}

// jsonEqualText compares two JSON documents by value.
func jsonEqualText(a, b []byte) bool {
	var x, y any
	if json.Unmarshal(a, &x) != nil || json.Unmarshal(b, &y) != nil {
		return string(a) == string(b)
	}
	xb, _ := json.Marshal(x)
	yb, _ := json.Marshal(y)
	return string(xb) == string(yb)
}

// ntMergeMessages is NotificationTemplate.save's merge: events and message
// types the new messages leave out keep their old values.
func ntMergeMessages(oldV, newV any) any {
	oldM, ok1 := oldV.(*OMap)
	newM, ok2 := newV.(*OMap)
	if !ok1 || !ok2 || oldM == nil || newM == nil {
		return newV
	}
	empty := func(v any) bool {
		if v == nil {
			return true
		}
		m, ok := v.(*OMap)
		return ok && m.Len() == 0
	}
	merge := func(oldEv, newEv *OMap, event string) {
		nv, _ := newEv.Get(event)
		ov, _ := oldEv.Get(event)
		if empty(nv) || empty(ov) {
			return
		}
		nm, ok1 := nv.(*OMap)
		om, ok2 := ov.(*OMap)
		if !ok1 || !ok2 {
			return
		}
		for _, mt := range []string{"message", "body"} {
			if !nm.Has(mt) {
				if v, _ := om.Get(mt); v != nil && v != "" {
					nm.Set(mt, v)
				}
			}
		}
	}
	for _, event := range []string{"started", "success", "error", "workflow_approval"} {
		nv, _ := newM.Get(event)
		ov, _ := oldM.Get(event)
		if empty(nv) && !empty(ov) {
			newM.Set(event, ov)
			continue
		}
		if event == "workflow_approval" && !empty(ov) {
			if !newM.Has("workflow_approval") || nv == nil {
				newM.Set("workflow_approval", NewOMap())
			}
			nwa, _ := newM.Get("workflow_approval")
			nwm, ok := nwa.(*OMap)
			owm, ok2 := ov.(*OMap)
			if ok && ok2 {
				for _, sub := range []string{"running", "approved", "timed_out", "denied"} {
					sn, _ := nwm.Get(sub)
					so, _ := owm.Get(sub)
					if empty(sn) && !empty(so) {
						nwm.Set(sub, so)
						continue
					}
					if owm.Len() > 0 {
						merge(owm, nwm, sub)
					}
				}
			}
		} else {
			merge(oldM, newM, event)
		}
		if !newM.Has(event) {
			newM.Set(event, nil)
		}
	}
	return newM
}

func (s *Server) notificationTemplateDelete(w http.ResponseWriter, r *http.Request) error {
	u, err := RequireWrite(r)
	if err != nil {
		return err
	}
	ctx := r.Context()
	n, c, err := s.loadVisibleNotificationTemplate(r)
	if err != nil {
		return err
	}
	if !u.IsSuperuser && (n.OrganizationID == nil || !c.HasRoleOn("main.organization", *n.OrganizationID, "notification_admin_role")) {
		// NotificationTemplateDetail.delete answered a user who may see
		// the template but not delete it with an empty 404.
		writeEmpty(w, http.StatusNotFound)
		return nil
	}
	var pending bool
	if err := s.Q().QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM main_notification WHERE notification_template_id = $1 AND status = 'pending' AND created > now() - interval '8 hours')`, n.ID).Scan(&pending); err != nil {
		return err
	}
	if pending {
		return &APIError{Status: http.StatusMethodNotAllowed, Body: map[string]any{"error": "Delete not allowed while there are pending notifications"}}
	}
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		conf := NewOMap()
		if v, err := decodeOrdered(string(n.Configuration)); err == nil {
			if m, ok := v.(*OMap); ok {
				conf = m
			}
		}
		var msgs any
		if len(n.Messages) > 0 {
			msgs, _ = decodeOrdered(string(n.Messages))
		}
		if err := s.Activity.Record(ctx, tx, activity.Entry{Operation: "delete", Object1: "notification_template", Changes: s.ntChanges(ctx, tx, n.Name, n.Description, n.OrganizationID, n.NotificationType, conf, msgs, n.ID), ActorID: &u.ID}); err != nil {
			return err
		}
		for _, q := range []string{
			`DELETE FROM main_unifiedjob_notifications WHERE notification_id IN (SELECT id FROM main_notification WHERE notification_template_id = $1)`,
			`DELETE FROM main_activitystream_notification WHERE notification_id IN (SELECT id FROM main_notification WHERE notification_template_id = $1)`,
			`DELETE FROM main_notification WHERE notification_template_id = $1`,
			`DELETE FROM main_activitystream_notification_template WHERE notificationtemplate_id = $1`,
			`DELETE FROM main_unifiedjobtemplate_notification_templates_started WHERE notificationtemplate_id = $1`,
			`DELETE FROM main_unifiedjobtemplate_notification_templates_success WHERE notificationtemplate_id = $1`,
			`DELETE FROM main_unifiedjobtemplate_notification_templates_error WHERE notificationtemplate_id = $1`,
			`DELETE FROM main_jobtemplate_notification_templates_changed WHERE notificationtemplate_id = $1`,
			`DELETE FROM main_workflowjobtemplate_notification_templates_approvals WHERE notificationtemplate_id = $1`,
			`DELETE FROM main_organization_notification_templates_started WHERE notificationtemplate_id = $1`,
			`DELETE FROM main_organization_notification_templates_success WHERE notificationtemplate_id = $1`,
			`DELETE FROM main_organization_notification_templates_error WHERE notificationtemplate_id = $1`,
			`DELETE FROM main_organization_notification_templates_approvals WHERE notificationtemplate_id = $1`,
			`DELETE FROM main_organization_notification_templates_changed WHERE notificationtemplate_id = $1`,
			`DELETE FROM main_notificationtemplate WHERE id = $1`,
		} {
			if _, err := tx.Exec(ctx, q, n.ID); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// ---------------------------------------------------------------- copy and test

func (s *Server) notificationTemplateCanCopy(w http.ResponseWriter, r *http.Request) error {
	n, c, err := s.loadVisibleNotificationTemplate(r)
	if err != nil {
		return err
	}
	WriteJSON(w, 200, NewOMap().Set("can_copy", c.User.CanWrite() && s.isNotificationAdmin(c, n.OrganizationID)))
	return nil
}

func (s *Server) notificationTemplateCopy(w http.ResponseWriter, r *http.Request) error {
	u, err := RequireWrite(r)
	if err != nil {
		return err
	}
	ctx := r.Context()
	n, c, err := s.loadVisibleNotificationTemplate(r)
	if err != nil {
		return err
	}
	if !s.isNotificationAdmin(c, n.OrganizationID) {
		return ErrForbidden
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	name, err := copyName(body, n.Name)
	if err != nil {
		return err
	}
	// CopyAPIView decrypts the secrets so the copy encrypts them under its
	// own primary key.
	conf := displayNotificationConfiguration(&notificationTemplate{NotificationType: n.NotificationType, Configuration: n.Configuration})
	raw := NewOMap()
	if v, err := decodeOrdered(string(n.Configuration)); err == nil {
		if m, ok := v.(*OMap); ok {
			raw = m
		}
	}
	for _, k := range conf.Keys() {
		v, _ := raw.Get(k)
		if sv, ok := v.(string); ok && strings.HasPrefix(sv, "$encrypted$") {
			plain, err := crypto.DecryptField(s.Cfg.SecretKey, "notification_configuration", &n.ID, sv)
			if err == nil {
				conf.Set(k, plain)
			}
		} else {
			conf.Set(k, v)
		}
	}
	var msgs any
	if len(n.Messages) > 0 && string(n.Messages) != "null" {
		msgs, _ = decodeOrdered(string(n.Messages))
	}
	nb := NewOMap().Set("name", name).Set("description", n.Description).Set("notification_type", n.NotificationType).Set("notification_configuration", conf).Set("messages", msgs)
	if n.OrganizationID != nil {
		nb.Set("organization", json.Number(fmt.Sprint(*n.OrganizationID)))
	}
	enc, _ := json.Marshal(nb)
	r2 := r.Clone(ctx)
	r2.Body = ioNopCloser(enc)
	r2.ContentLength = int64(len(enc))
	_ = u
	return s.notificationTemplateCreate(w, r2)
}

// notificationTemplateTest sends the template's test message.
func (s *Server) notificationTemplateTest(w http.ResponseWriter, r *http.Request) error {
	u, err := RequireWrite(r)
	if err != nil {
		return err
	}
	ctx := r.Context()
	n, c, err := s.loadVisibleNotificationTemplate(r)
	if err != nil {
		return err
	}
	if !u.IsSuperuser && (n.OrganizationID == nil || !c.HasRoleOn("main.organization", *n.OrganizationID, "notification_admin_role")) {
		return ErrForbidden
	}
	base := s.Settings.String(ctx, "ASCENDER_URL_BASE")
	msg := fmt.Sprintf("Notification Test %d %s", n.ID, base)
	var body any
	switch n.NotificationType {
	case "email", "pagerduty", "matrix":
		body = fmt.Sprintf("Test Notification %d %s", n.ID, base)
	case "webhook", "grafana":
		body = fmt.Sprintf(`{"body": "Test Notification %d %s"}`, n.ID, base)
	default:
		body = NewOMap().Set("body", fmt.Sprintf("Test Notification %d %s", n.ID, base))
	}
	id, err := s.generateNotification(ctx, n, msg, body)
	if err != nil {
		return err
	}
	s.Background(func(ctx context.Context) { s.SendNotifications(ctx, []int64{id}, nil) })
	rows, err := s.Q().Query(ctx, `SELECT `+notificationColumns+` FROM main_notification n JOIN main_notificationtemplate ntt ON ntt.id = n.notification_template_id WHERE n.id = $1`, id)
	if err != nil {
		return err
	}
	defer rows.Close()
	if !rows.Next() {
		return ErrNotFound
	}
	v, err := scanNotification(rows)
	if err != nil {
		return err
	}
	out := NewOMap().Set("notification", id)
	ser := serializeNotification(v.(*notification))
	for _, k := range ser.Keys() {
		x, _ := ser.Get(k)
		out.Set(k, x)
	}
	w.Header().Set("Location", URLFor("notifications", id))
	WriteJSON(w, http.StatusAccepted, out)
	return nil
}

// generateNotification is NotificationTemplate.generate_notification.
func (s *Server) generateNotification(ctx context.Context, n *notificationTemplate, subject string, body any) (int64, error) {
	recipients := "None"
	if t := notificationType(n.NotificationType); t != nil {
		if v, err := decodeOrdered(string(n.Configuration)); err == nil {
			if m, ok := v.(*OMap); ok {
				if rv, ok := m.Get(t.Recipient); ok {
					recipients = pyRepr(rv)
					if sv, ok := rv.(string); ok {
						recipients = sv
					}
				}
			}
		}
	}
	bb, _ := json.Marshal(body)
	var id int64
	err := s.Q().QueryRow(ctx, `INSERT INTO main_notification (created, modified, status, error, notifications_sent, notification_type, recipients, subject, notification_template_id, body)
		VALUES (now(), now(), 'pending', '', 0, $1, $2, $3, $4, $5::jsonb) RETURNING id`, n.NotificationType, recipients, subject, n.ID, string(bb)).Scan(&id)
	return id, err
}

// ---------------------------------------------------------------- notifications

func (s *Server) notificationAccess(q *Query, u *auth.User) {
	ct := s.CT.ID("main.organization")
	q.And("(ntt.organization_id IN (" + accessibleSQL(q, u.ID, ct, "notification_admin_role") + ") OR ntt.organization_id IN (" + accessibleSQL(q, u.ID, ct, "auditor_role") + "))")
}

func (s *Server) notificationListWith(w http.ResponseWriter, r *http.Request, extra func(q *Query)) error {
	spec := ListSpec{Model: "Notification", From: "main_notification n JOIN main_notificationtemplate ntt ON ntt.id = n.notification_template_id", Columns: notificationColumns, PK: "n.id",
		Fields: notificationFields, DefaultOrder: []string{"id"}, Access: s.notificationAccess}
	rows, count, page, err := s.RunList(r, spec, extra, scanNotification)
	if err != nil {
		return err
	}
	results := make([]any, 0, len(rows))
	for _, row := range rows {
		results = append(results, serializeNotification(row.(*notification)))
	}
	WriteJSON(w, 200, Paginate(r, page, count, results))
	return nil
}

func (s *Server) notificationList(w http.ResponseWriter, r *http.Request) error {
	return s.notificationListWith(w, r, nil)
}

func (s *Server) notificationTemplateNotifications(w http.ResponseWriter, r *http.Request) error {
	n, _, err := s.loadVisibleNotificationTemplate(r)
	if err != nil {
		return err
	}
	return s.notificationListWith(w, r, func(q *Query) { q.And("n.notification_template_id = " + q.Arg(n.ID)) })
}

func (s *Server) notificationDetail(w http.ResponseWriter, r *http.Request) error {
	u, err := RequireUser(r)
	if err != nil {
		return err
	}
	id, err := PathID(r)
	if err != nil {
		return NotFoundFor("Notification")
	}
	rows, err := s.Q().Query(r.Context(), `SELECT `+notificationColumns+` FROM main_notification n JOIN main_notificationtemplate ntt ON ntt.id = n.notification_template_id WHERE n.id = $1`, id)
	if err != nil {
		return err
	}
	defer rows.Close()
	if !rows.Next() {
		return NotFoundFor("Notification")
	}
	v, err := scanNotification(rows)
	if err != nil {
		return err
	}
	rows.Close()
	n := v.(*notification)
	if !u.IsSuperuser && !u.IsSystemAuditor {
		orgID := colOf[*int64](r.Context(), s.Q(), "main_notificationtemplate", "organization_id", n.TemplateID)
		c := s.NewSerCtx(r, true)
		if orgID == nil || !(c.HasRoleOn("main.organization", *orgID, "notification_admin_role") || c.HasRoleOn("main.organization", *orgID, "auditor_role")) {
			return ErrForbidden
		}
	}
	WriteJSON(w, 200, serializeNotification(n))
	return nil
}

// serializeNotification is NotificationSerializer.
func serializeNotification(n *notification) *OMap {
	related := NewOMap().Set("notification_template", URLFor("notification_templates", n.TemplateID))
	summary := NewOMap().Set("notification_template", NewOMap().Set("id", n.TemplateID).Set("name", n.TemplateName).Set("description", n.Desc))
	o := NewOMap().Set("id", n.ID).Set("type", "notification").Set("url", URLFor("notifications", n.ID)).Set("related", related).Set("summary_fields", summary).
		Set("created", models.FormatTime(n.Created)).Set("modified", models.FormatTime(n.Modified)).
		Set("notification_template", n.TemplateID).Set("error", n.Error).Set("status", n.Status).Set("notifications_sent", n.Sent).
		Set("notification_type", n.NotificationType).Set("recipients", n.Recipients)
	if n.NotificationType != "webhook" {
		o.Set("subject", n.Subject)
	}
	if n.NotificationType == "email" || n.NotificationType == "webhook" || n.NotificationType == "pagerduty" || n.NotificationType == "matrix" {
		var body any
		if v, err := decodeOrdered(string(n.Body)); err == nil {
			body = v
		}
		if n.NotificationType == "webhook" || n.NotificationType == "pagerduty" {
			switch t := body.(type) {
			case *OMap:
				if b, ok := t.Get("body"); ok {
					body = b
				}
			case string:
				if pv, err := decodeOrdered(t); err == nil {
					if pm, ok := pv.(*OMap); ok {
						body = pm
					}
				}
			}
		}
		o.Set("body", body)
	}
	return o
}

// jobNotifications is the notifications/ sub-list of a job.
func (s *Server) jobNotifications(w http.ResponseWriter, r *http.Request, model string) error {
	u, err := RequireUser(r)
	if err != nil {
		return err
	}
	id, err := PathID(r)
	if err != nil {
		return NotFoundFor(model)
	}
	var exists bool
	_ = db.Tolerant(s.Q()).QueryRow(r.Context(), `SELECT EXISTS (SELECT 1 FROM `+notificationJobTables[model]+` WHERE unifiedjob_ptr_id = $1)`, id).Scan(&exists)
	if !exists {
		return NotFoundFor(model)
	}
	if !s.canReadUnifiedJob(r, u, id) {
		return ErrForbidden
	}
	return s.notificationListWith(w, r, func(q *Query) {
		q.And("n.id IN (SELECT notification_id FROM main_unifiedjob_notifications WHERE unifiedjob_id = " + q.Arg(id) + ")")
	})
}

// canReadUnifiedJob reports whether the job is in the user's unified jobs.
func (s *Server) canReadUnifiedJob(r *http.Request, u *auth.User, id int64) bool {
	if u.IsSuperuser || u.IsSystemAuditor {
		return true
	}
	res := httptestGet(s, r, fmt.Sprintf("/api/v2/unified_jobs/?id=%d", id))
	if res == nil {
		return false
	}
	var page struct {
		Count int `json:"count"`
	}
	_ = json.Unmarshal(res, &page)
	return page.Count > 0
}

// ---------------------------------------------------------------- organization and project relations

func (s *Server) orgForNotifications(r *http.Request) (int64, *SerCtx, error) {
	_, o, err := organizationObj.fromPath(s, r, false)
	if err != nil {
		return 0, nil, err
	}
	return o.ID, s.NewSerCtx(r, true), nil
}

func (s *Server) orgNotificationTemplates(w http.ResponseWriter, r *http.Request) error {
	id, _, err := s.orgForNotifications(r)
	if err != nil {
		return err
	}
	return s.notificationTemplateListWith(w, r, func(q *Query) { q.And("nt.organization_id = " + q.Arg(id)) })
}

func (s *Server) orgNotificationTemplateCreate(w http.ResponseWriter, r *http.Request) error {
	id, _, err := s.orgForNotifications(r)
	if err != nil {
		return err
	}
	return s.notificationTemplateCreateWith(w, r, &id)
}

// ntLink is an owner's notification_templates_<kind> relation: the link
// table and owner column, and the activity entry's object1 and through
// model (sender.__module__ + "." + sender.__name__). Object1 "" records no
// entry: the signal skipped inventory sources and system job templates.
type ntLink struct {
	Table, OwnerCol, Object1, Relationship string
}

// ntLinkFor is the relation of an owner model ("organization", "project",
// "job_template", "workflow_job_template", "inventory_source",
// "system_job_template").
func ntLinkFor(owner, kind string) ntLink {
	switch {
	case owner == "organization":
		return ntLink{"main_organization_notification_templates_" + kind, "organization_id", owner, "ascender.main.models.organization.Organization_notification_templates_" + kind}
	case owner == "job_template" && kind == "changed":
		return ntLink{"main_jobtemplate_notification_templates_changed", "jobtemplate_id", owner, "ascender.main.models.jobs.JobTemplate_notification_templates_changed"}
	case owner == "workflow_job_template" && kind == "approvals":
		return ntLink{"main_workflowjobtemplate_notification_templates_approvals", "workflowjobtemplate_id", owner, "ascender.main.models.workflow.WorkflowJobTemplate_notification_templates_approvals"}
	case owner == "inventory_source", owner == "system_job_template":
		owner = ""
	}
	return ntLink{"main_unifiedjobtemplate_notification_templates_" + kind, "unifiedjobtemplate_id", owner, "ascender.main.models.unified_jobs.UnifiedJobTemplate_notification_templates_" + kind}
}

// ntLinkList lists the notification templates the relation links to owner.
func (s *Server) ntLinkList(w http.ResponseWriter, r *http.Request, l ntLink, owner int64) error {
	return s.notificationTemplateListWith(w, r, func(q *Query) {
		q.And("nt.id IN (SELECT notificationtemplate_id FROM " + l.Table + " WHERE " + l.OwnerCol + " = " + q.Arg(owner) + ")")
	})
}

// ntLinkAttach associates ({"id": n}) or disassociates a notification
// template. may reports whether a user other than a superuser may, given
// the template's organization (NotificationAttachMixin). An attach records
// the association it adds; a detach records the one it was given, linked
// or not, as remove() signalled it.
func (s *Server) ntLinkAttach(w http.ResponseWriter, r *http.Request, u *auth.User, l ntLink, owner int64, may func(orgID *int64) bool) error {
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	detach := isDetach(body)
	nid, aerr := attachID(body, "Notification Template", detach)
	if aerr != nil {
		return aerr
	}
	ctx := r.Context()
	var orgID *int64
	if ok, err := db.ScanOne(ctx, s.Q(), `SELECT organization_id FROM main_notificationtemplate WHERE id = $1`, []any{nid}, &orgID); err != nil {
		return err
	} else if !ok {
		return BadRequest("Notification Template matching query does not exist.")
	}
	if !u.IsSuperuser && !may(orgID) {
		return ErrForbidden
	}
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		op := "associate"
		if detach {
			op = "disassociate"
			if _, err := tx.Exec(ctx, `DELETE FROM `+l.Table+` WHERE `+l.OwnerCol+` = $1 AND notificationtemplate_id = $2`, owner, nid); err != nil {
				return err
			}
		} else {
			tag, err := tx.Exec(ctx, `INSERT INTO `+l.Table+` (`+l.OwnerCol+`, notificationtemplate_id) SELECT $1, $2
				WHERE NOT EXISTS (SELECT 1 FROM `+l.Table+` WHERE `+l.OwnerCol+` = $1 AND notificationtemplate_id = $2)`, owner, nid)
			if err != nil || tag.RowsAffected() == 0 {
				return err
			}
		}
		if l.Object1 == "" {
			return nil
		}
		return s.recordAssociation(ctx, tx, &u.ID, op, l.Relationship, l.Object1, owner, "notification_template", nid)
	})
	if err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func (s *Server) ntRelationOwner(r *http.Request, owner string) (int64, *SerCtx, error) {
	if owner == "organization" {
		return s.orgForNotifications(r)
	}
	if owner == "system_job_template" {
		u, err := RequireUser(r)
		if err != nil {
			return 0, nil, err
		}
		t, err := s.systemJobTemplateFromPath(r, u)
		if err != nil {
			return 0, nil, err
		}
		return t.ID, s.NewSerCtx(r, true), nil
	}
	_, p, err := projectObj.fromPath(s, r, false)
	if err != nil {
		return 0, nil, err
	}
	return p.ID, s.NewSerCtx(r, true), nil
}

func (s *Server) ntRelationList(w http.ResponseWriter, r *http.Request, owner, kind string) error {
	id, _, err := s.ntRelationOwner(r, owner)
	if err != nil {
		return err
	}
	return s.ntLinkList(w, r, ntLinkFor(owner, kind), id)
}

// ntRelationAttach is the attach of an organization's, project's or
// system job template's relation: the user must also administer the
// owner (only superusers, a system job template's).
func (s *Server) ntRelationAttach(w http.ResponseWriter, r *http.Request, owner, kind string) error {
	u, err := RequireWrite(r)
	if err != nil {
		return err
	}
	id, c, err := s.ntRelationOwner(r, owner)
	if err != nil {
		return err
	}
	return s.ntLinkAttach(w, r, u, ntLinkFor(owner, kind), id, func(orgID *int64) bool {
		var ownerAdmin bool
		switch owner {
		case "organization":
			ownerAdmin = c.HasRoleOn("main.organization", id, "admin_role")
		case "project":
			ownerAdmin = c.HasRoleOn("main.project", id, "admin_role")
		}
		return ownerAdmin && orgID != nil && c.HasRoleOn("main.organization", *orgID, "notification_admin_role")
	})
}
