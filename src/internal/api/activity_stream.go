package api

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/auth"
	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/models"
)

// activityRow is a main_activitystream row.
type activityRow struct {
	ID           int64
	ActorID      *int64
	Operation    string
	Timestamp    time.Time
	Changes      string
	DeletedActor *string
	ActionNode   string
	RelType      string
	Object1      string
	Object2      string
	Setting      *string
}

const activityColumns = `act.id, act.actor_id, act.operation, act."timestamp", act.changes, act.deleted_actor::text, act.action_node, act.object_relationship_type, act.object1, act.object2, act.setting::text`

func scanActivity(rows pgx.Rows) (any, error) {
	a := &activityRow{}
	err := rows.Scan(&a.ID, &a.ActorID, &a.Operation, &a.Timestamp, &a.Changes, &a.DeletedActor, &a.ActionNode, &a.RelType, &a.Object1, &a.Object2, &a.Setting)
	return a, err
}

// activityLink describes one of ActivityStream's many-to-many fields that
// ActivityStreamSerializer summarized, in the order of the serializer's
// field list (SUMMARIZABLE_FK_FIELDS with its additions; where a name
// appeared twice the later fields won and the first position stayed).
type activityLink struct {
	key  string // the m2m field, which is also the object1/object2 name
	col  string // main_activitystream_<key>.<col>
	from string // the target, aliased x, with the joins the columns need
	cols string // summary columns; "_"-prefixed ones are not output
	// order is the target model's Meta.ordering, which related managers used.
	order string
	coll  string // API collection of the related URLs
	// parent names the object _summarize_parent_ujt added; its columns are
	// "p.<field>" plus "_pkey" (the summary key) and "_pcoll".
	parent bool
}

var activityLinks = []activityLink{
	{key: "organization", col: "organization_id", from: "main_organization x", cols: `x.id AS id, x.name AS name, x.description AS description`, order: "x.name", coll: "organizations"},
	{key: "user", col: "user_id", from: "auth_user x", cols: `x.id AS id, x.username AS username, x.first_name AS first_name, x.last_name AS last_name`, order: "l.id", coll: "users"},
	{key: "team", col: "team_id", from: "main_team x LEFT JOIN main_organization xo ON xo.id = x.organization_id", cols: `x.id AS id, x.name AS name, x.description AS description`, order: "xo.name, x.name", coll: "teams"},
	{key: "inventory", col: "inventory_id", from: "main_inventory x", cols: `x.id AS id, x.name AS name, x.description AS description, x.has_active_failures AS has_active_failures, x.total_hosts AS total_hosts,
		x.hosts_with_active_failures AS hosts_with_active_failures, x.total_groups AS total_groups, x.has_inventory_sources AS has_inventory_sources, x.total_inventory_sources AS total_inventory_sources,
		x.inventory_sources_with_failures AS inventory_sources_with_failures, x.organization_id AS organization_id, x.kind AS kind`, order: "x.name", coll: "inventories"},
	{key: "host", col: "host_id", from: "main_host x", cols: `x.id AS id, x.name AS name, x.description AS description`, order: "x.name", coll: "hosts"},
	{key: "group", col: "group_id", from: "main_group x", cols: `x.id AS id, x.name AS name, x.description AS description, x.inventory_id AS inventory_id`, order: "x.name", coll: "groups"},
	{key: "execution_environment", col: "executionenvironment_id", from: "main_executionenvironment x", cols: `x.id AS id, x.name AS name, x.description AS description, x.image AS image`, order: "x.created DESC", coll: "execution_environments"},
	{key: "project", col: "project_id", from: "main_project xp JOIN main_unifiedjobtemplate x ON x.id = xp.unifiedjobtemplate_ptr_id", cols: `x.id AS id, x.name AS name, x.description AS description, x.status AS status, xp.scm_type AS scm_type, xp.allow_override AS allow_override`, order: "x.id", coll: "projects"},
	{key: "project_update", col: "projectupdate_id", from: "main_projectupdate xp JOIN main_unifiedjob x ON x.id = xp.unifiedjob_ptr_id", cols: `x.id AS id, x.name AS name, x.description AS description, x.status AS status, x.failed AS failed`, order: "x.id", coll: "project_updates"},
	{key: "credential", col: "credential_id", from: "main_credential x JOIN main_credentialtype xt ON xt.id = x.credential_type_id", cols: `x.id AS id, x.name AS name, x.description AS description, xt.namespace AS kind,
		xt.kind = 'cloud' AS cloud, xt.kind = 'kubernetes' AS kubernetes, x.credential_type_id AS credential_type_id`, order: "x.name", coll: "credentials"},
	{key: "job", col: "job_id", from: `main_job xj JOIN main_unifiedjob x ON x.id = xj.unifiedjob_ptr_id
		LEFT JOIN main_jobtemplate pjt ON pjt.unifiedjobtemplate_ptr_id = xj.job_template_id LEFT JOIN main_unifiedjobtemplate p ON p.id = pjt.unifiedjobtemplate_ptr_id`,
		cols: `x.id AS id, x.name AS name, x.description AS description, x.status AS status, x.failed AS failed, x.started AS started, x.elapsed::float8 AS elapsed, x.canceled_on AS canceled_on,
		CASE WHEN p.id IS NOT NULL THEN 'job_template' END AS _pkey, 'job_templates' AS _pcoll, p.id AS "p.id", p.name AS "p.name", p.description AS "p.description", pjt.prevent_relaunch AS "p.prevent_relaunch"`,
		order: "x.id", coll: "jobs", parent: true},
	{key: "job_template", col: "jobtemplate_id", from: "main_jobtemplate xj JOIN main_unifiedjobtemplate x ON x.id = xj.unifiedjobtemplate_ptr_id", cols: `x.id AS id, x.name AS name, x.description AS description, xj.prevent_relaunch AS prevent_relaunch`, order: "x.name", coll: "job_templates"},
	{key: "workflow_job_template", col: "workflowjobtemplate_id", from: "main_workflowjobtemplate xw JOIN main_unifiedjobtemplate x ON x.id = xw.unifiedjobtemplate_ptr_id", cols: `x.id AS id, x.name AS name, x.description AS description, xw.allow_force_node_success_on_relaunch AS allow_force_node_success_on_relaunch`, order: "x.name", coll: "workflow_job_templates"},
	{key: "workflow_job", col: "workflowjob_id", from: "main_workflowjob xw JOIN main_unifiedjob x ON x.id = xw.unifiedjob_ptr_id", cols: `x.id AS id, x.name AS name, x.description AS description`, order: "x.id", coll: "workflow_jobs"},
	// WorkflowApprovalTemplate.workflow_job_template: the workflow of its
	// first node.
	{key: "workflow_approval_template", col: "workflowapprovaltemplate_id", from: `main_workflowapprovaltemplate xt JOIN main_unifiedjobtemplate x ON x.id = xt.unifiedjobtemplate_ptr_id
		LEFT JOIN LATERAL (SELECT n.workflow_job_template_id FROM main_workflowjobtemplatenode n WHERE n.unified_job_template_id = x.id ORDER BY n.id LIMIT 1) fn ON true
		LEFT JOIN main_workflowjobtemplate pw ON pw.unifiedjobtemplate_ptr_id = fn.workflow_job_template_id LEFT JOIN main_unifiedjobtemplate p ON p.id = pw.unifiedjobtemplate_ptr_id`,
		cols: `x.id AS id, x.name AS name, x.description AS description, xt.timeout AS timeout,
		CASE WHEN p.id IS NOT NULL THEN 'workflow_job_template' END AS _pkey, 'workflow_job_templates' AS _pcoll, p.id AS "p.id", p.name AS "p.name", p.description AS "p.description", pw.allow_force_node_success_on_relaunch AS "p.allow_force_node_success_on_relaunch"`,
		order: "x.name", coll: "workflow_approval_templates", parent: true},
	// The serializer listed workflow_approval twice; the second fields
	// (id, name, unified_job_id, which approvals do not have) won.
	{key: "workflow_approval", col: "workflowapproval_id", from: `main_workflowapproval xa JOIN main_unifiedjob x ON x.id = xa.unifiedjob_ptr_id
		LEFT JOIN main_workflowjobnode pn ON pn.job_id = x.id LEFT JOIN main_unifiedjob p ON p.id = pn.workflow_job_id`,
		cols:  `x.id AS id, x.name AS name, CASE WHEN p.id IS NOT NULL THEN 'workflow_job' END AS _pkey, 'workflow_jobs' AS _pcoll, p.id AS "p.id", p.name AS "p.name", p.description AS "p.description"`,
		order: "x.created DESC", coll: "workflow_approvals", parent: true},
	{key: "schedule", col: "schedule_id", from: `main_schedule x LEFT JOIN main_unifiedjobtemplate p ON p.id = x.unified_job_template_id LEFT JOIN django_content_type pct ON pct.id = p.polymorphic_ctype_id
		LEFT JOIN main_inventorysource pis ON pis.unifiedjobtemplate_ptr_id = p.id`,
		cols: `x.id AS id, x.name AS name, x.description AS description, x.next_run AS next_run, ` + ujtTypeSQL("pct.model") + ` AS _pkey, ` + ujtCollSQL("pct.model") + ` AS _pcoll,
		p.id AS "p.id", p.name AS "p.name", p.description AS "p.description", pis.inventory_id AS "p.inventory_id"`,
		order: "x.next_run DESC NULLS LAST, x.id", coll: "schedules", parent: true},
	{key: "unified_job_template", col: "unifiedjobtemplate_id", from: "main_unifiedjobtemplate x LEFT JOIN django_content_type xct ON xct.id = x.polymorphic_ctype_id",
		cols: `x.id AS id, x.name AS name, x.description AS description, ` + ujtCollSQL("xct.model") + ` AS _coll`, order: "x.name", coll: ""},
	{key: "inventory_source", col: "inventorysource_id", from: "main_inventorysource xs JOIN main_unifiedjobtemplate x ON x.id = xs.unifiedjobtemplate_ptr_id",
		cols: `x.id AS id, x.name AS name, xs.source AS source, x.last_job_run AS last_updated, x.status AS status, xs.inventory_id AS inventory_id`, order: "xs.inventory_id, x.name", coll: "inventory_sources"},
	{key: "role", col: "role_id", from: "main_rbac_roles x", cols: `x.id AS id, x.role_field AS role_field`, order: "x.content_type_id, x.object_id", coll: "roles"},
	{key: "notification_template", col: "notificationtemplate_id", from: "main_notificationtemplate x", cols: `x.id AS id, x.name AS name, x.description AS description`, order: "x.name", coll: "notification_templates"},
	{key: "instance_group", col: "instancegroup_id", from: "main_instancegroup x", cols: `x.id AS id, x.name AS name, x.is_container_group AS is_container_group`, order: "x.id", coll: "instance_groups"},
	{key: "credential_type", col: "credentialtype_id", from: "main_credentialtype x", cols: `x.id AS id, x.name AS name, x.description AS description, x.kind AS kind, x.managed AS managed`, order: "x.kind, x.name", coll: "credential_types"},
	{key: "workflow_job_template_node", col: "workflowjobtemplatenode_id", from: `main_workflowjobtemplatenode x LEFT JOIN main_workflowjobtemplate pw ON pw.unifiedjobtemplate_ptr_id = x.workflow_job_template_id
		LEFT JOIN main_unifiedjobtemplate p ON p.id = pw.unifiedjobtemplate_ptr_id`,
		cols: `x.id AS id, x.unified_job_template_id AS unified_job_template_id, CASE WHEN p.id IS NOT NULL THEN 'workflow_job_template' END AS _pkey, 'workflow_job_templates' AS _pcoll,
		p.id AS "p.id", p.name AS "p.name", p.description AS "p.description", pw.allow_force_node_success_on_relaunch AS "p.allow_force_node_success_on_relaunch"`,
		order: "x.id", coll: "workflow_job_template_nodes", parent: true},
	{key: "label", col: "label_id", from: "main_label x LEFT JOIN main_organization xo ON xo.id = x.organization_id", cols: `x.id AS id, x.name AS name, x.organization_id AS organization_id`, order: "xo.name, x.name", coll: "labels"},
	{key: "notification", col: "notification_id", from: "main_notification x", cols: `x.id AS id, x.status AS status, x.notification_type AS notification_type, x.notification_template_id AS notification_template_id`, order: "x.id", coll: "notifications"},
	{key: "o_auth2_access_token", col: "oauth2accesstoken_id", from: "main_oauth2accesstoken x", cols: `x.id AS id, x.user_id AS user_id, x.description AS description, x.application_id AS application_id, x.scope AS scope`, order: "x.id", coll: "tokens"},
	{key: "o_auth2_application", col: "oauth2application_id", from: "main_oauth2application x LEFT JOIN main_organization xo ON xo.id = x.organization_id", cols: `x.id AS id, x.name AS name, x.description AS description`, order: "xo.name, x.name", coll: "applications"},
	{key: "ad_hoc_command", col: "adhoccommand_id", from: "main_adhoccommand xa JOIN main_unifiedjob x ON x.id = xa.unifiedjob_ptr_id", cols: `x.id AS id, x.name AS name, x.status AS status, xa."limit" AS "limit"`, order: "x.id", coll: "ad_hoc_commands"},
	{key: "instance", col: "instance_id", from: "main_instance x", cols: `x.id AS id, x.hostname AS hostname`, order: "x.hostname", coll: "instances"},
}

// ujtTypeSQL names a unified job template's type from its content type
// model, as get_type_for_model did.
func ujtTypeSQL(model string) string {
	return `CASE ` + model + ` WHEN 'jobtemplate' THEN 'job_template' WHEN 'workflowjobtemplate' THEN 'workflow_job_template' WHEN 'project' THEN 'project'
		WHEN 'inventorysource' THEN 'inventory_source' WHEN 'systemjobtemplate' THEN 'system_job_template' WHEN 'workflowapprovaltemplate' THEN 'workflow_approval_template' END`
}

func ujtCollSQL(model string) string {
	return `CASE ` + model + ` WHEN 'jobtemplate' THEN 'job_templates' WHEN 'workflowjobtemplate' THEN 'workflow_job_templates' WHEN 'project' THEN 'projects'
		WHEN 'inventorysource' THEN 'inventory_sources' WHEN 'systemjobtemplate' THEN 'system_job_templates' WHEN 'workflowapprovaltemplate' THEN 'workflow_approval_templates' END`
}

var activityFields *FieldSet

func activityFieldSet() *FieldSet {
	fs := &FieldSet{Model: "ActivityStream", Fields: map[string]Field{
		"id":                       {SQL: "act.id", Kind: KindInt},
		"operation":                {SQL: "act.operation"},
		"timestamp":                {SQL: `act."timestamp"`, Kind: KindDateTime},
		"changes":                  {SQL: "act.changes"},
		"object1":                  {SQL: "act.object1"},
		"object2":                  {SQL: "act.object2"},
		"object_relationship_type": {SQL: "act.object_relationship_type"},
		"action_node":              {SQL: "act.action_node"},
		"actor":                    {SQL: "act.actor_id", Kind: KindFK, Rel: &Relation{Alias: "aact", Join: "LEFT JOIN auth_user aact ON aact.id = act.actor_id", Target: func() *FieldSet { return userFieldsAlias("aact") }}},
	}, SearchFields: []string{"changes"}}
	for _, l := range activityLinks {
		l := l
		lk, al := "lk_"+l.key, "al_"+l.key
		join := "LEFT JOIN main_activitystream_" + l.key + " " + lk + " ON " + lk + ".activitystream_id = act.id"
		var target func() *FieldSet
		switch {
		case l.key == "user":
			join += " LEFT JOIN auth_user " + al + " ON " + al + ".id = " + lk + "." + l.col
			target = func() *FieldSet { return userFieldsAlias(al) }
		case strings.Contains(l.from, "main_unifiedjobtemplate x "):
			join += " LEFT JOIN main_unifiedjobtemplate " + al + " ON " + al + ".id = " + lk + "." + l.col
			target = func() *FieldSet { return namedFieldsAlias(al, l.key) }
		case strings.Contains(l.from, "main_unifiedjob x "):
			join += " LEFT JOIN main_unifiedjob " + al + " ON " + al + ".id = " + lk + "." + l.col
			target = func() *FieldSet { return namedFieldsAlias(al, l.key) }
		default:
			table := strings.Fields(l.from)[0]
			join += " LEFT JOIN " + table + " " + al + " ON " + al + ".id = " + lk + "." + l.col
			named := strings.Contains(l.cols, "x.name AS name")
			target = func() *FieldSet {
				if named {
					return namedFieldsAlias(al, l.key)
				}
				return &FieldSet{Model: l.key, Fields: map[string]Field{"id": {SQL: al + ".id", Kind: KindInt}}}
			}
		}
		fs.Fields[l.key] = Field{SQL: lk + "." + l.col, Kind: KindFK, Rel: &Relation{Alias: al, Join: join, Many: true, Target: target}}
	}
	return fs
}

func namedFieldsAlias(a, model string) *FieldSet {
	return &FieldSet{Model: model, Fields: map[string]Field{
		"id": {SQL: a + ".id", Kind: KindInt}, "name": {SQL: a + ".name"}, "description": {SQL: a + ".description"},
	}, SearchFields: []string{"name", "description"}}
}

type activitySubRoute struct {
	coll string
	load func(s *Server, r *http.Request, u *auth.User, id int64) error
	// where restricts the entries to the parent; it may use the parent id.
	where func(s *Server, q *Query, id int64) string
	// noAccess skips ActivityStreamAccess (filter_read_permission = False).
	noAccess bool
}

func linkedTo(key string) func(s *Server, q *Query, id int64) string {
	var col string
	for _, l := range activityLinks {
		if l.key == key {
			col = l.col
		}
	}
	if col == "" {
		// inventory_update and the other links the serializer never summarized
		col = strings.ReplaceAll(key, "_", "") + "_id"
	}
	return func(s *Server, q *Query, id int64) string {
		return "act.id IN (SELECT activitystream_id FROM main_activitystream_" + key + " WHERE " + col + " = " + q.Arg(id) + ")"
	}
}

func linkedIn(key, sub string) string {
	var col string
	for _, l := range activityLinks {
		if l.key == key {
			col = l.col
		}
	}
	return "act.id IN (SELECT activitystream_id FROM main_activitystream_" + key + " WHERE " + col + " IN (" + sub + "))"
}

func readableVia(table, idCol, column, ctKey, display string) func(s *Server, r *http.Request, u *auth.User, id int64) error {
	return func(s *Server, r *http.Request, u *auth.User, id int64) error {
		var parent *int64
		if err := s.Q().QueryRow(r.Context(), `SELECT `+column+` FROM `+table+` WHERE `+idCol+` = $1`, id).Scan(&parent); err != nil {
			return NotFoundFor(display)
		}
		if u.IsSuperuser || u.IsSystemAuditor || (parent != nil && s.userHasRoleOn(r.Context(), u.ID, ctKey, *parent, "read_role")) {
			return nil
		}
		return ErrForbidden
	}
}

func (s *Server) loadAs(f func(r *http.Request, u *auth.User, id int64) error) func(s *Server, r *http.Request, u *auth.User, id int64) error {
	return func(_ *Server, r *http.Request, u *auth.User, id int64) error { return f(r, u, id) }
}

// readableJob is JobAccess/WorkflowJobAccess.can_read: the template's
// readers and the organization's administrators and auditors.
func readableJob(table, tmplCol, ctKey, display string) func(s *Server, r *http.Request, u *auth.User, id int64) error {
	return func(s *Server, r *http.Request, u *auth.User, id int64) error {
		var tmpl, org *int64
		err := s.Q().QueryRow(r.Context(), `SELECT t.`+tmplCol+`, uj.organization_id FROM `+table+` t JOIN main_unifiedjob uj ON uj.id = t.unifiedjob_ptr_id WHERE t.unifiedjob_ptr_id = $1`, id).Scan(&tmpl, &org)
		if err != nil {
			return NotFoundFor(display)
		}
		if u.IsSuperuser || u.IsSystemAuditor || (tmpl != nil && s.userHasRoleOn(r.Context(), u.ID, ctKey, *tmpl, "read_role")) {
			return nil
		}
		if org != nil {
			var ok bool
			_ = db.Tolerant(s.Q()).QueryRow(r.Context(), `SELECT EXISTS (SELECT 1 FROM main_organization o JOIN main_rbac_roles_members m ON m.role_id IN (o.admin_role_id, o.auditor_role_id) WHERE o.id = $1 AND m.user_id = $2)`, *org, u.ID).Scan(&ok)
			if ok {
				return nil
			}
		}
		return ErrForbidden
	}
}

func (s *Server) activitySubRoutes() []activitySubRoute {
	return []activitySubRoute{
		{coll: "organizations", load: s.loadAs(organizationObj.parentCheck(s)), where: linkedTo("organization")},
		{coll: "users", load: s.loadAs(userObj.parentCheck(s)), where: func(s *Server, q *Query, id int64) string {
			return "(act.actor_id = " + q.Arg(id) + " OR " + linkedTo("user")(s, q, id) + ")"
		}},
		{coll: "teams", load: s.loadAs(teamObj.parentCheck(s)), where: func(s *Server, q *Query, id int64) string {
			// the team, and the projects and credentials its members can read
			readable := func(ct string) string {
				return `SELECT a.object_id FROM main_rbac_role_ancestors a JOIN main_team t ON t.member_role_id = a.ancestor_id WHERE t.id = ` + q.Arg(id) +
					` AND a.content_type_id = ` + q.Arg(s.CT.ID(ct)) + ` AND a.role_field = 'read_role'`
			}
			return "(" + linkedTo("team")(s, q, id) + " OR " + linkedIn("project", readable("main.project")) + " OR " + linkedIn("credential", readable("main.credential")) + ")"
		}},
		{coll: "projects", load: s.loadAs(projectObj.parentCheck(s)), where: func(s *Server, q *Query, id int64) string {
			return "(" + linkedTo("project")(s, q, id) + " OR " + linkedIn("credential", "SELECT credential_id FROM main_project WHERE unifiedjobtemplate_ptr_id = "+q.Arg(id)) + ")"
		}},
		{coll: "inventories", load: s.loadAs(inventoryObj.parentCheck(s)), where: func(s *Server, q *Query, id int64) string {
			arg := q.Arg(id)
			return "(" + linkedTo("inventory")(s, q, id) + " OR " + linkedIn("host", "SELECT id FROM main_host WHERE inventory_id = "+arg) + " OR " + linkedIn("group", "SELECT id FROM main_group WHERE inventory_id = "+arg) + ")"
		}},
		{coll: "hosts", load: readableVia("main_host", "id", "inventory_id", "main.inventory", "Host"), where: func(s *Server, q *Query, id int64) string {
			return "(" + linkedTo("host")(s, q, id) + " OR " + linkedIn("inventory", "SELECT inventory_id FROM main_host WHERE id = "+q.Arg(id)) + ")"
		}},
		{coll: "groups", load: readableVia("main_group", "id", "inventory_id", "main.inventory", "Group"), where: func(s *Server, q *Query, id int64) string {
			return "(" + linkedTo("group")(s, q, id) + " OR " + linkedIn("host", "SELECT host_id FROM main_group_hosts WHERE group_id = "+q.Arg(id)) + ")"
		}},
		{coll: "inventory_sources", load: readableVia("main_inventorysource", "unifiedjobtemplate_ptr_id", "inventory_id", "main.inventory", "InventorySource"), where: linkedTo("inventory_source")},
		{coll: "credentials", load: s.loadAs(credentialObj.parentCheck(s)), where: linkedTo("credential")},
		{coll: "credential_types", load: func(s *Server, r *http.Request, u *auth.User, id int64) error {
			if !s.existsIn(r.Context(), "main_credentialtype")(id) {
				return NotFoundFor("CredentialType")
			}
			return nil
		}, where: linkedTo("credential_type")},
		{coll: "job_templates", load: s.loadAs(jobTemplateObj.parentCheck(s)), where: linkedTo("job_template")},
		{coll: "workflow_job_templates", load: s.loadAs(workflowJobTemplateObj.parentCheck(s)), where: func(s *Server, q *Query, id int64) string {
			return "(" + linkedTo("workflow_job_template")(s, q, id) + " OR " + linkedIn("workflow_job_template_node", "SELECT id FROM main_workflowjobtemplatenode WHERE workflow_job_template_id = "+q.Arg(id)) + ")"
		}},
		{coll: "jobs", load: readableJob("main_job", "job_template_id", "main.jobtemplate", "Job"), where: linkedTo("job")},
		{coll: "ad_hoc_commands", load: readableVia("main_adhoccommand", "unifiedjob_ptr_id", "inventory_id", "main.inventory", "AdHocCommand"), where: linkedTo("ad_hoc_command")},
		{coll: "workflow_jobs", load: readableJob("main_workflowjob", "workflow_job_template_id", "main.workflowjobtemplate", "WorkflowJob"), where: linkedTo("workflow_job")},
		{coll: "execution_environments", load: func(s *Server, r *http.Request, u *auth.User, id int64) error {
			var org *int64
			if err := s.Q().QueryRow(r.Context(), `SELECT organization_id FROM main_executionenvironment WHERE id = $1`, id).Scan(&org); err != nil {
				return NotFoundFor("ExecutionEnvironment")
			}
			if u.IsSuperuser || u.IsSystemAuditor || org == nil || s.userHasRoleOn(r.Context(), u.ID, "main.organization", *org, "read_role") {
				return nil
			}
			return ErrForbidden
		}, where: linkedTo("execution_environment"), noAccess: true},
		{coll: "applications", load: s.loadAs(appObj.parentCheck(s)), where: linkedTo("o_auth2_application")},
		{coll: "tokens", load: func(s *Server, r *http.Request, u *auth.User, id int64) error {
			t, err := models.LoadOAuth2AccessToken(r.Context(), s.Q(), id)
			if err != nil {
				return err
			}
			if t == nil {
				return NotFoundFor("OAuth2AccessToken")
			}
			if !s.canReadToken(r.Context(), u, t) {
				return ErrForbidden
			}
			return nil
		}, where: linkedTo("o_auth2_access_token")},
	}
}

func init() {
	activityFields = activityFieldSet()
	resourceRegistrars = append(resourceRegistrars, func(s *Server, mux *http.ServeMux) {
		s.route(mux, "/api/v2/activity_stream/{$}", methodMap{"GET": s.activityList}, s.optionsFor("activity_stream"))
		s.route(mux, "/api/v2/activity_stream/{id}/{$}", methodMap{"GET": s.activityDetail}, s.optionsFor("activity_stream"))
		for _, sub := range s.activitySubRoutes() {
			sub := sub
			s.route(mux, "/api/v2/"+sub.coll+"/{id}/activity_stream/{$}", methodMap{"GET": s.activitySubList(sub)}, s.optionsFor("activity_stream"))
		}
	})
}

// activityAccessClause is ActivityStreamAccess.filtered_queryset: entries
// that name an object the user may see.
func (s *Server) activityAccessClause(q *Query, u *auth.User) string {
	uid := q.Arg(u.ID)
	acc := func(ct, role string) string { return accessibleSQL(q, u.ID, s.CT.ID(ct), role) }
	inv := acc("main.inventory", "read_role")
	aud := "SELECT o.id FROM main_organization o WHERE o.id IN (" + acc("main.organization", "admin_role") + ") OR o.id IN (" + acc("main.organization", "auditor_role") + ")"
	proj := acc("main.project", "read_role")
	jt := acc("main.jobtemplate", "read_role")
	wf := acc("main.workflowjobtemplate", "read_role")
	parts := []string{
		linkedIn("user", uid),
		linkedIn("ad_hoc_command", "SELECT unifiedjob_ptr_id FROM main_adhoccommand WHERE inventory_id IN ("+inv+")"),
		linkedIn("inventory", inv),
		linkedIn("host", "SELECT id FROM main_host WHERE inventory_id IN ("+inv+")"),
		linkedIn("group", "SELECT id FROM main_group WHERE inventory_id IN ("+inv+")"),
		linkedIn("inventory_source", "SELECT unifiedjobtemplate_ptr_id FROM main_inventorysource WHERE inventory_id IN ("+inv+")"),
		"act.id IN (SELECT activitystream_id FROM main_activitystream_inventory_update WHERE inventoryupdate_id IN (SELECT iu.unifiedjob_ptr_id FROM main_inventoryupdate iu JOIN main_inventorysource src ON src.unifiedjobtemplate_ptr_id = iu.inventory_source_id WHERE src.inventory_id IN (" + inv + ")))",
		linkedIn("credential", acc("main.credential", "read_role")),
		"(EXISTS (" + aud + ") AND (" + strings.Join([]string{
			linkedIn("user", "SELECT m.user_id FROM main_rbac_roles_members m JOIN main_organization o ON o.member_role_id = m.role_id WHERE o.id IN ("+aud+")"),
			linkedIn("organization", aud),
			linkedIn("notification_template", "SELECT id FROM main_notificationtemplate WHERE organization_id IN ("+aud+")"),
			linkedIn("notification", "SELECT n.id FROM main_notification n JOIN main_notificationtemplate nt ON nt.id = n.notification_template_id WHERE nt.organization_id IN ("+aud+")"),
			linkedIn("label", "SELECT id FROM main_label WHERE organization_id IN ("+aud+")"),
			linkedIn("role", "SELECT ra.descendent_id FROM main_rbac_role_ancestors ra WHERE ra.ancestor_id IN (SELECT m.role_id FROM main_rbac_roles_members m WHERE m.user_id = "+uid+")"),
		}, " OR ") + "))",
		linkedIn("project", proj),
		linkedIn("project_update", "SELECT unifiedjob_ptr_id FROM main_projectupdate WHERE project_id IN ("+proj+")"),
		linkedIn("job_template", jt),
		linkedIn("job", "SELECT unifiedjob_ptr_id FROM main_job WHERE job_template_id IN ("+jt+")"),
		linkedIn("workflow_job_template", wf),
		linkedIn("workflow_job_template_node", "SELECT id FROM main_workflowjobtemplatenode WHERE workflow_job_template_id IN ("+wf+")"),
		linkedIn("workflow_job", "SELECT unifiedjob_ptr_id FROM main_workflowjob WHERE workflow_job_template_id IN ("+wf+")"),
		linkedIn("team", acc("main.team", "read_role")),
		linkedIn("o_auth2_application", "SELECT app.id FROM main_oauth2application app WHERE "+s.appVisibleClause(q, u)),
		linkedIn("o_auth2_access_token", "SELECT tok.id FROM main_oauth2accesstoken tok WHERE "+s.tokenVisibleClause(q, u)),
	}
	return "(" + strings.Join(parts, " OR ") + ")"
}

func (s *Server) activitySpec(filterAccess bool) ListSpec {
	spec := ListSpec{Model: "ActivityStream", From: "main_activitystream act", Columns: activityColumns, PK: "act.id", Fields: activityFields, DefaultOrder: []string{"id"}}
	if filterAccess {
		spec.Access = func(q *Query, u *auth.User) { q.And(s.activityAccessClause(q, u)) }
	}
	return spec
}

func (s *Server) writeActivityList(w http.ResponseWriter, r *http.Request, spec ListSpec, extra func(q *Query)) error {
	rows, count, page, err := s.RunList(r, spec, extra, scanActivity)
	if err != nil {
		return err
	}
	list := make([]*activityRow, 0, len(rows))
	for _, row := range rows {
		list = append(list, row.(*activityRow))
	}
	results, err := s.serializeActivities(s.NewSerCtx(r, false), list)
	if err != nil {
		return err
	}
	WriteJSON(w, 200, Paginate(r, page, count, results))
	return nil
}

func (s *Server) activityList(w http.ResponseWriter, r *http.Request) error {
	spec := s.activitySpec(true)
	// ActivityStreamPagination counted the whole table for the unfiltered
	// listing, whatever the user may see.
	spec.UnfilteredCountSQL = `SELECT count(*) FROM main_activitystream`
	return s.writeActivityList(w, r, spec, nil)
}

func (s *Server) activitySubList(sub activitySubRoute) HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) error {
		u, err := RequireUser(r)
		if err != nil {
			return err
		}
		id, err := PathID(r)
		if err != nil {
			return ErrNotFound
		}
		if err := sub.load(s, r, u, id); err != nil {
			return err
		}
		return s.writeActivityList(w, r, s.activitySpec(!sub.noAccess), func(q *Query) { q.And(sub.where(s, q, id)) })
	}
}

func (s *Server) activityDetail(w http.ResponseWriter, r *http.Request) error {
	u, err := RequireUser(r)
	if err != nil {
		return err
	}
	id, err := PathID(r)
	if err != nil {
		return NotFoundFor("ActivityStream")
	}
	q := NewQuery()
	where := "act.id = " + q.Arg(id)
	if !u.IsSuperuser && !u.IsSystemAuditor {
		where += " AND " + s.activityAccessClause(q, u)
	}
	rows, err := s.Q().Query(r.Context(), `SELECT `+activityColumns+` FROM main_activitystream act WHERE `+where, q.Args...)
	if err != nil {
		return err
	}
	var row *activityRow
	if rows.Next() {
		v, err := scanActivity(rows)
		if err != nil {
			rows.Close()
			return err
		}
		row = v.(*activityRow)
	}
	rows.Close()
	if row == nil {
		return NotFoundFor("ActivityStream")
	}
	out, err := s.serializeActivities(s.NewSerCtx(r, true), []*activityRow{row})
	if err != nil {
		return err
	}
	WriteJSON(w, 200, out[0])
	return nil
}

// activityItem is one summarized related object.
type activityItem struct {
	id      int64
	summary *OMap
	coll    string
	pkey    string
	pcoll   string
	parent  *OMap
	parentI int64
}

// loadActivityLinks loads one link type's summaries for a page of entries.
func (s *Server) loadActivityLinks(ctx context.Context, l activityLink, ids []int64) (map[int64][]activityItem, error) {
	return s.loadActivityLinksQ(ctx, s.Q(), l, ids)
}

// loadActivityLinksQ is loadActivityLinks through q (a transaction that
// has not committed the entry yet).
func (s *Server) loadActivityLinksQ(ctx context.Context, q db.Querier, l activityLink, ids []int64) (map[int64][]activityItem, error) {
	rows, err := q.Query(ctx, `SELECT l.activitystream_id AS _act, `+l.cols+` FROM main_activitystream_`+l.key+` l JOIN `+l.from+` ON x.id = l.`+l.col+
		` WHERE l.activitystream_id = ANY($1) ORDER BY l.activitystream_id, `+l.order, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[int64][]activityItem{}
	fds := rows.FieldDescriptions()
	for rows.Next() {
		vals, err := rows.Values()
		if err != nil {
			return nil, err
		}
		it := activityItem{summary: NewOMap(), coll: l.coll}
		var act int64
		parent := NewOMap()
		for i, fd := range fds {
			name, v := fd.Name, vals[i]
			switch {
			case name == "_act":
				act = toInt64(v)
			case name == "_pkey":
				it.pkey, _ = v.(string)
			case name == "_pcoll":
				it.pcoll, _ = v.(string)
			case name == "_coll":
				it.coll, _ = v.(string)
			case strings.HasPrefix(name, "p."):
				if v != nil {
					parent.Set(strings.TrimPrefix(name, "p."), activityValue(v))
				}
			default:
				if name == "id" {
					it.id = toInt64(v)
				}
				if v != nil {
					it.summary.Set(name, activityValue(v))
				}
			}
		}
		if it.pkey != "" {
			it.parent = parent
			if pid, ok := parent.Get("id"); ok {
				it.parentI = toInt64(pid)
			}
		}
		out[act] = append(out[act], it)
	}
	return out, rows.Err()
}

func toInt64(v any) int64 {
	switch n := v.(type) {
	case int64:
		return n
	case int32:
		return int64(n)
	case int16:
		return int64(n)
	case int:
		return int64(n)
	}
	return 0
}

// activityValue renders a column the way the old JSON encoder did.
func activityValue(v any) any {
	switch t := v.(type) {
	case time.Time:
		return models.FormatTime(t)
	case int32:
		return int64(t)
	case int16:
		return int64(t)
	}
	return v
}

// DecodeOrdered decodes JSON text keeping object key order (objects
// become *OMap).
func DecodeOrdered(text string) (any, error) { return decodeOrdered(text) }

// decodeOrdered decodes JSON text keeping object key order.
func decodeOrdered(text string) (any, error) {
	dec := json.NewDecoder(bytes.NewReader([]byte(text)))
	dec.UseNumber()
	var v any
	if err := decodeValue(dec, &v); err != nil {
		return nil, err
	}
	if dec.More() {
		return nil, &json.SyntaxError{}
	}
	return v, nil
}

var camelRe1 = regexp.MustCompile(`(.)([A-Z][a-z]+)`)
var camelRe2 = regexp.MustCompile(`([a-z0-9])([A-Z])`)

// camelToUnderscore is camelcase_to_underscore.
func camelToUnderscore(s string) string {
	s = camelRe1.ReplaceAllString(s, "${1}_${2}")
	return strings.ToLower(camelRe2.ReplaceAllString(s, "${1}_${2}"))
}

// activityObjectAssociation and activityObjectType are the serializer's
// readings of object_relationship_type.
func activityObjectAssociation(rel string) string {
	if rel == "" {
		return ""
	}
	if strings.HasSuffix(rel, "_role") {
		return "role"
	}
	parts := strings.Split(rel, ".")
	last := strings.SplitN(parts[len(parts)-1], "_", 2)
	if len(last) < 2 {
		return ""
	}
	return last[1]
}

func activityObjectType(rel string) string {
	if !strings.HasSuffix(rel, "_role") {
		// The non-role branch passed a list to camelcase_to_underscore,
		// which raised; the error was logged and "" returned.
		return ""
	}
	parts := strings.Split(rel, ".")
	if len(parts) < 2 {
		return ""
	}
	return camelToUnderscore(parts[len(parts)-2])
}

// serializeActivities is ActivityStreamSerializer for a page of entries.
func (s *Server) serializeActivities(c *SerCtx, list []*activityRow) ([]any, error) {
	ctx := c.Ctx()
	// Which link types each entry summarizes: those named object1 or
	// object2, and role when a user is involved.
	need := map[string][]int64{}
	for _, a := range list {
		for _, l := range activityLinks {
			if l.key == a.Object1 || l.key == a.Object2 || (l.key == "role" && (a.Object1 == "user" || a.Object2 == "user")) {
				need[l.key] = append(need[l.key], a.ID)
			}
		}
	}
	loaded := map[string]map[int64][]activityItem{}
	for _, l := range activityLinks {
		ids := need[l.key]
		if len(ids) == 0 {
			continue
		}
		m, err := s.loadActivityLinks(ctx, l, ids)
		if err != nil {
			return nil, err
		}
		loaded[l.key] = m
	}
	var actorIDs []int64
	for _, a := range list {
		if a.ActorID != nil {
			actorIDs = append(actorIDs, *a.ActorID)
		}
	}
	if len(actorIDs) > 0 {
		if err := c.PreloadUsers(actorIDs); err != nil {
			return nil, err
		}
	}
	out := make([]any, 0, len(list))
	for _, a := range list {
		related, summary := activityRelatedSummary(a, loaded, c.UserSummary)
		var changes any = NewOMap()
		// Survey password ciphertext never leaves in an entry, whoever wrote
		// it: entries the old application stored are masked here too.
		if v, err := decodeOrdered(maskCiphertext(a.Changes)); err == nil {
			changes = v
		}
		o := NewOMap().Set("id", a.ID).Set("type", "activity_stream").Set("url", URLFor("activity_stream", a.ID)).Set("related", related).Set("summary_fields", summary)
		o.Set("timestamp", models.FormatTime(a.Timestamp)).Set("operation", a.Operation).Set("changes", changes)
		o.Set("object1", a.Object1).Set("object2", a.Object2).Set("object_association", activityObjectAssociation(a.RelType))
		o.Set("action_node", a.ActionNode).Set("object_type", activityObjectType(a.RelType))
		out = append(out, o)
	}
	return out, nil
}

// activityRelatedSummary is the entry's related links and summary_fields
// from its loaded links and its actor.
func activityRelatedSummary(a *activityRow, loaded map[string]map[int64][]activityItem, userSummary func(*int64) *OMap) (*OMap, *OMap) {
	related := NewOMap()
	summary := NewOMap()
	setURL(related, "actor", "users", a.ActorID)
	for _, l := range activityLinks {
		items := loaded[l.key][a.ID]
		if len(items) == 0 {
			continue
		}
		urls := []any{}
		seen := map[int64]bool{}
		list := []any{}
		summary.Set(l.key, list)
		related.Set(l.key, urls)
		for _, it := range items {
			if !seen[it.id] {
				seen[it.id] = true
				if it.coll != "" {
					urls = append(urls, URLFor(it.coll, it.id))
				}
			}
			if l.key == "schedule" && it.pcoll != "" && it.parentI != 0 {
				related.Set("unified_job_template", URLFor(it.pcoll, it.parentI))
			}
			if it.pkey != "" && it.parent != nil {
				summary.Set(it.pkey, []any{it.parent})
			}
			list = append(list, it.summary)
			summary.Set(l.key, list)
		}
		related.Set(l.key, urls)
	}
	if a.ActorID != nil {
		if u := userSummary(a.ActorID); u != nil {
			summary.Set("actor", u)
		}
	} else if a.DeletedActor != nil && *a.DeletedActor != "null" {
		if v, err := decodeOrdered(*a.DeletedActor); err == nil {
			if m, ok := v.(*OMap); ok {
				m.Set("id", nil)
				summary.Set("actor", m)
			}
		}
	}
	var setting *OMap
	if a.Setting != nil {
		if v, err := decodeOrdered(*a.Setting); err == nil {
			if m, ok := v.(*OMap); ok && m.Len() > 0 {
				setting = m
			}
		}
	}
	if setting != nil {
		if cat, ok := setting.Get("category"); ok && cat != nil && cat != "" {
			related.Set("setting", "/api/v2/settings/"+str(cat)+"/")
		}
		summary.Set("setting", []any{setting})
	}
	return related, summary
}
