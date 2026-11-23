package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/activity"
	"github.com/ctrliq/ascender/internal/auth"
	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/models"
)

// Instance groups: InstanceGroupList/Detail, their jobs and instances
// sub-lists, with InstanceGroupAccess, InstanceGroupSerializer's
// validation and the capacity figures the task manager models computed.

// instanceGroup is a main_instancegroup row.
type instanceGroup struct {
	ID                       int64
	Name                     string
	Created                  time.Time
	Modified                 time.Time
	PolicyInstanceList       []string
	PolicyInstanceMinimum    int64
	PolicyInstancePercentage int64
	CredentialID             *int64
	PodSpecOverride          string
	IsContainerGroup         bool
	MaxConcurrentJobs        int64
	MaxForks                 int64
	AdminRoleID              *int64
	ReadRoleID               *int64
	UseRoleID                *int64
	MeshNodeID               *int64
	JobsTotal                int64
}

const instanceGroupColumns = `g.id, g.name, g.created, g.modified, g.policy_instance_list, g.policy_instance_minimum, g.policy_instance_percentage, g.credential_id, g.pod_spec_override, g.is_container_group, g.max_concurrent_jobs, g.max_forks, g.admin_role_id, g.read_role_id, g.use_role_id, g.mesh_node_id,
	(SELECT count(*) FROM main_unifiedjob uj WHERE uj.instance_group_id = g.id)`

func scanInstanceGroup(rows pgx.Rows) (any, error) {
	g := &instanceGroup{}
	var policy []byte
	if err := rows.Scan(&g.ID, &g.Name, &g.Created, &g.Modified, &policy, &g.PolicyInstanceMinimum, &g.PolicyInstancePercentage, &g.CredentialID, &g.PodSpecOverride, &g.IsContainerGroup, &g.MaxConcurrentJobs, &g.MaxForks, &g.AdminRoleID, &g.ReadRoleID, &g.UseRoleID, &g.MeshNodeID, &g.JobsTotal); err != nil {
		return nil, err
	}
	g.PolicyInstanceList = []string{}
	if len(policy) > 0 {
		_ = json.Unmarshal(policy, &g.PolicyInstanceList)
	}
	return g, nil
}

var instanceGroupFields *FieldSet

func instanceGroupFieldSet(a string) *FieldSet {
	return &FieldSet{Model: "InstanceGroup", Fields: map[string]Field{
		"id": {SQL: a + ".id", Kind: KindInt}, "name": {SQL: a + ".name"}, "created": {SQL: a + ".created", Kind: KindDateTime}, "modified": {SQL: a + ".modified", Kind: KindDateTime},
		"is_container_group": {SQL: a + ".is_container_group", Kind: KindBool}, "max_concurrent_jobs": {SQL: a + ".max_concurrent_jobs", Kind: KindInt}, "max_forks": {SQL: a + ".max_forks", Kind: KindInt},
		"policy_instance_percentage": {SQL: a + ".policy_instance_percentage", Kind: KindInt}, "policy_instance_minimum": {SQL: a + ".policy_instance_minimum", Kind: KindInt},
		"credential": {SQL: a + ".credential_id", Kind: KindFK}, "mesh_node": {SQL: a + ".mesh_node_id", Kind: KindFK},
	}, SearchFields: []string{"name"}}
}

func init() {
	instanceGroupFields = instanceGroupFieldSet("g")
	instanceGroupFields.Fields["instances"] = Field{SQL: "igi.instance_id", Kind: KindFK, Rel: &Relation{Alias: "igin", Join: "LEFT JOIN main_instancegroup_instances igi ON igi.instancegroup_id = g.id LEFT JOIN main_instance igin ON igin.id = igi.instance_id", Target: func() *FieldSet { return instanceFieldSet("igin") }, Many: true}}
	resourceRegistrars = append(resourceRegistrars, func(s *Server, mux *http.ServeMux) {
		// The instance_groups many-to-many of organizations, inventories and
		// templates, which the delete confirmation counts through. Added
		// here, after every file's init has built its field set.
		igRel := func(field, alias, join string) Field {
			return Field{SQL: alias + "m.instancegroup_id", Kind: KindFK, Rel: &Relation{Alias: alias, Join: join, Target: func() *FieldSet { return instanceGroupFieldSet(alias) }, Many: true}}
		}
		organizationFields.Fields["instance_groups"] = igRel("instance_groups", "oig", "LEFT JOIN main_organizationinstancegroupmembership oigm ON oigm.organization_id = o.id LEFT JOIN main_instancegroup oig ON oig.id = oigm.instancegroup_id")
		inventoryFields.Fields["instance_groups"] = igRel("instance_groups", "iig", "LEFT JOIN main_inventoryinstancegroupmembership iigm ON iigm.inventory_id = i.id LEFT JOIN main_instancegroup iig ON iig.id = iigm.instancegroup_id")
		unifiedJobTemplateListFields.Fields["instance_groups"] = igRel("instance_groups", "uig", "LEFT JOIN main_unifiedjobtemplateinstancegroupmembership uigm ON uigm.unifiedjobtemplate_id = ujt.id LEFT JOIN main_instancegroup uig ON uig.id = uigm.instancegroup_id")
		opts := s.optionsFiltered("instance_groups", s.instanceGroupOptionsAllow)
		s.route(mux, "/api/v2/instance_groups/{$}", methodMap{"GET": s.instanceGroupList, "POST": s.instanceGroupCreate}, opts)
		s.route(mux, "/api/v2/instance_groups/{id}/{$}", methodMap{"GET": s.instanceGroupDetail, "PUT": s.instanceGroupUpdate, "PATCH": s.instanceGroupUpdate, "DELETE": s.instanceGroupDelete}, opts)
		s.route(mux, "/api/v2/instance_groups/{id}/jobs/{$}", methodMap{"GET": s.instanceGroupJobs}, s.optionsFor("unified_jobs"))
		s.route(mux, "/api/v2/instance_groups/{id}/instances/{$}", methodMap{"GET": s.instanceGroupInstances, "POST": s.instanceGroupInstancesAttach}, s.optionsFor("instances"))
	})
}

// queueNames are DEFAULT_EXECUTION_QUEUE_NAME and
// DEFAULT_CONTROL_PLANE_QUEUE_NAME, the groups the installer made.
func (s *Server) queueNames(ctx context.Context) (string, string) {
	return models.QueueNames(s.Settings.String(ctx, "DEFAULT_EXECUTION_QUEUE_NAME"), s.Settings.String(ctx, "DEFAULT_CONTROL_PLANE_QUEUE_NAME"))
}

// GlobalInstanceGroupNames are the groups a task with no preferred groups
// of its own runs in (UnifiedJob.global_instance_groups).
func (s *Server) GlobalInstanceGroupNames(ctx context.Context) []string {
	e, c := s.queueNames(ctx)
	return models.GlobalInstanceGroupNames(e, c, s.Settings.Bool(ctx, "IS_K8S"))
}

func (s *Server) instanceGroupProtected(ctx context.Context, name string) bool {
	e, c := s.queueNames(ctx)
	return name == e || name == c
}

func (s *Server) instanceGroupList(w http.ResponseWriter, r *http.Request) error {
	return s.instanceGroupListWith(w, r, s.instanceGroupSpec(), nil)
}

// instanceGroupObj is an instance group, readable through its read role.
var instanceGroupObj = &pathObject[*instanceGroup]{
	model: "InstanceGroup",
	get: func(ctx context.Context, q db.Querier, id int64) (*instanceGroup, error) {
		return scanFirst[*instanceGroup](ctx, q, `SELECT `+instanceGroupColumns+` FROM main_instancegroup g WHERE g.id = $1`, []any{id}, scanInstanceGroup)
	},
	readable: func(c *SerCtx, g *instanceGroup) bool { return c.S.userHasRoleID(c.Ctx(), c.User.ID, g.ReadRoleID) },
}

func (s *Server) userHasRoleID(ctx context.Context, userID int64, roleID *int64) bool {
	return roleID != nil && s.userHasRole(ctx, userID, *roleID)
}

func (s *Server) instanceGroupDetail(w http.ResponseWriter, r *http.Request) error {
	_, g, err := instanceGroupObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	caps, err := s.instanceGroupCapacities(r.Context(), nil)
	if err != nil {
		return err
	}
	WriteJSON(w, 200, s.serializeInstanceGroup(c, g, caps))
	return nil
}

func (s *Server) instanceGroupAccess(q *Query, u *auth.User) {
	q.And("g.id IN (" + accessibleSQL(q, u.ID, s.CT.ID("main.instancegroup"), "read_role") + ")")
}

// instanceGroupListWith serves a list of instance groups, optionally
// narrowed by extra. The capacity figures cover the page's groups and the
// running jobs placed in them, as the list serializer's task manager
// models did.
func (s *Server) instanceGroupListWith(w http.ResponseWriter, r *http.Request, spec ListSpec, extra func(q *Query)) error {
	rows, count, page, err := s.RunList(r, spec, extra, scanInstanceGroup)
	if err != nil {
		return err
	}
	ids := make([]int64, 0, len(rows))
	for _, row := range rows {
		ids = append(ids, row.(*instanceGroup).ID)
	}
	caps, err := s.instanceGroupCapacities(r.Context(), ids)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, false)
	results := make([]any, 0, len(rows))
	for _, row := range rows {
		results = append(results, s.serializeInstanceGroup(c, row.(*instanceGroup), caps))
	}
	WriteJSON(w, 200, Paginate(r, page, count, results))
	return nil
}

func (s *Server) instanceGroupSpec() ListSpec {
	// RoleLevel: role_level applied to any list whose model has roles,
	// instance groups' use_role among them.
	return ListSpec{Model: "InstanceGroup", From: "main_instancegroup g", Columns: instanceGroupColumns, PK: "g.id", Fields: instanceGroupFields, DefaultOrder: []string{"id"}, Access: s.instanceGroupAccess, RoleLevel: "main.instancegroup"}
}

// loadInstanceGroup reads one instance group by id.
func (s *Server) loadInstanceGroup(r *http.Request, id int64) (*instanceGroup, error) {
	return s.loadInstanceGroupCtx(r.Context(), id)
}

func (s *Server) loadInstanceGroupCtx(ctx context.Context, id int64) (*instanceGroup, error) {
	g, err := instanceGroupObj.get(ctx, s.Q(), id)
	if db.IsNoRows(err) {
		return nil, nil
	}
	return g, err
}

// --- capacity ---------------------------------------------------------------

// igCapacity holds the figures InstanceGroupSerializer took from the task
// manager models.
type igCapacity struct {
	Capacity, Consumed, JobsRunning, Instances int64
}

// controlNodeTaskImpact is ASCENDER_CONTROL_NODE_TASK_IMPACT.
const controlNodeTaskImpact = 1

// instanceGroupCapacities is TaskManagerModels.init_with_consumed_capacity
// for the serializer: instances that are ready, enabled and not hop nodes
// carry capacity; running and waiting jobs consume it on their execution
// node (and the control impact on their controller), and container groups
// count their own jobs and forks. groupIDs narrows the groups and the jobs
// considered (a list page); nil means all of them (a detail view).
func (s *Server) instanceGroupCapacities(ctx context.Context, groupIDs []int64) (map[int64]igCapacity, error) {
	type tmInstance struct {
		nodeType                    string
		capacity, consumed, running int64
	}
	instances := map[string]*tmInstance{}
	rows, err := s.Q().Query(ctx, `SELECT hostname, node_type, capacity FROM main_instance WHERE node_state = 'ready' AND enabled AND node_type <> 'hop'`)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var h string
		i := &tmInstance{}
		if err := rows.Scan(&h, &i.nodeType, &i.capacity); err != nil {
			rows.Close()
			return nil, err
		}
		instances[h] = i
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	type tmGroup struct {
		container   bool
		maxForks    int64
		members     []*tmInstance
		jobs, forks int64
	}
	groups := map[int64]*tmGroup{}
	where, args := "", []any{}
	if groupIDs != nil {
		where, args = " WHERE g.id = ANY($1)", []any{groupIDs}
	}
	rows, err = s.Q().Query(ctx, `SELECT g.id, g.is_container_group, g.max_forks, COALESCE((SELECT array_agg(i.hostname ORDER BY i.hostname) FROM main_instancegroup_instances gi JOIN main_instance i ON i.id = gi.instance_id WHERE gi.instancegroup_id = g.id), '{}') FROM main_instancegroup g`+where, args...)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var id int64
		var hosts []string
		g := &tmGroup{}
		if err := rows.Scan(&id, &g.container, &g.maxForks, &hosts); err != nil {
			rows.Close()
			return nil, err
		}
		for _, h := range hosts {
			if i, ok := instances[h]; ok {
				g.members = append(g.members, i)
			}
		}
		groups[id] = g
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	where = ""
	if groupIDs != nil {
		where = " AND instance_group_id = ANY($1)"
	}
	rows, err = s.Q().Query(ctx, `SELECT task_impact, controller_node, execution_node, instance_group_id FROM main_unifiedjob WHERE status IN ('running', 'waiting')`+where, args...)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var impact int64
		var controller, execution string
		var igID *int64
		if err := rows.Scan(&impact, &controller, &execution, &igID); err != nil {
			rows.Close()
			return nil, err
		}
		exec := instances[execution]
		ctrl := instances[controller]
		if exec != nil && (exec.nodeType == "hybrid" || exec.nodeType == "execution") {
			exec.consumed += impact
			exec.running++
		}
		if ctrl != nil && (ctrl.nodeType == "hybrid" || ctrl.nodeType == "control") {
			ctrl.consumed += controlNodeTaskImpact
			if ctrl != exec {
				ctrl.running++
			}
		}
		if igID != nil {
			if g, ok := groups[*igID]; ok && g.container {
				g.jobs++
				g.forks += impact
			}
		}
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	out := map[int64]igCapacity{}
	for id, g := range groups {
		c := igCapacity{Instances: int64(len(g.members))}
		if g.container {
			c.Capacity, c.Consumed, c.JobsRunning = g.maxForks, g.forks, g.jobs
		} else {
			for _, i := range g.members {
				c.Capacity += i.capacity
				c.Consumed += i.consumed
				c.JobsRunning += i.running
			}
		}
		out[id] = c
	}
	return out, nil
}

// fixedFloat renders with at least one decimal, as Python's float repr does.
type fixedFloat float64

func (f fixedFloat) MarshalJSON() ([]byte, error) {
	s := strconv.FormatFloat(float64(f), 'f', -1, 64)
	for _, c := range s {
		if c == '.' || c == 'e' {
			return []byte(s), nil
		}
	}
	return []byte(s + ".0"), nil
}

// percentRemaining is float("{0:.2f}".format(...)).
func percentRemaining(capacity, consumed int64) fixedFloat {
	if capacity == 0 {
		return 0
	}
	v := float64(capacity-consumed) / float64(capacity) * 100
	v, _ = strconv.ParseFloat(strconv.FormatFloat(v, 'f', 2, 64), 64)
	return fixedFloat(v)
}

var instanceGroupRoleFields = []string{"admin_role", "use_role", "read_role"}

func (s *Server) serializeInstanceGroup(c *SerCtx, g *instanceGroup, caps map[int64]igCapacity) *OMap {
	related := NewOMap()
	if c.Detail {
		related.Set("named_url", "/api/v2/instance_groups/"+namedURLEscape(g.Name)+"/")
	}
	related.Set("jobs", URLFor("instance_groups", g.ID)+"jobs/").Set("instances", URLFor("instance_groups", g.ID)+"instances/")
	related.Set("access_list", URLFor("instance_groups", g.ID)+"access_list/").Set("object_roles", URLFor("instance_groups", g.ID)+"object_roles/")
	setURL(related, "credential", "credentials", g.CredentialID)
	setURL(related, "mesh_node", "instances", g.MeshNodeID)
	roleID := func(f string) *int64 {
		switch f {
		case "admin_role":
			return g.AdminRoleID
		case "use_role":
			return g.UseRoleID
		case "read_role":
			return g.ReadRoleID
		}
		return nil
	}
	summary := NewOMap()
	if c.WantSummary("credential") && g.CredentialID != nil {
		if cs := c.CredentialSummary(g.CredentialID); cs != nil {
			summary.Set("credential", cs)
		}
	}
	if c.WantSummary("mesh_node") && g.MeshNodeID != nil {
		var host, state string
		if err := s.Q().QueryRow(c.Ctx(), `SELECT hostname, node_state FROM main_instance WHERE id = $1`, *g.MeshNodeID).Scan(&host, &state); err == nil {
			summary.Set("mesh_node", NewOMap().Set("id", *g.MeshNodeID).Set("hostname", host).Set("node_state", state))
		}
	}
	if c.WantSummary("object_roles") {
		summary.Set("object_roles", c.RolesSummary("instance group", instanceGroupRoleFields, roleID))
	}
	if c.WantSummary("user_capabilities") && !c.NoCaps {
		protected := s.instanceGroupProtected(c.Ctx(), g.Name)
		write := c.User != nil && c.User.CanWrite()
		summary.Set("user_capabilities", NewOMap().Set("edit", write && c.HasRole(g.AdminRoleID)).Set("delete", write && c.User.IsSuperuser && !protected))
	}
	cp := caps[g.ID]
	o := NewOMap().Set("id", g.ID).Set("type", "instance_group").Set("url", URLFor("instance_groups", g.ID)).Set("related", related)
	o.Set("name", g.Name).Set("created", models.FormatTime(g.Created)).Set("modified", models.FormatTime(g.Modified))
	o.Set("capacity", cp.Capacity).Set("consumed_capacity", cp.Consumed).Set("percent_capacity_remaining", percentRemaining(cp.Capacity, cp.Consumed)).Set("jobs_running", cp.JobsRunning)
	o.Set("max_concurrent_jobs", g.MaxConcurrentJobs).Set("max_forks", g.MaxForks).Set("jobs_total", g.JobsTotal).Set("instances", cp.Instances)
	o.Set("is_container_group", g.IsContainerGroup).Set("credential", models.NullableID(g.CredentialID)).Set("mesh_node", models.NullableID(g.MeshNodeID))
	o.Set("policy_instance_percentage", g.PolicyInstancePercentage).Set("policy_instance_minimum", g.PolicyInstanceMinimum).Set("policy_instance_list", g.PolicyInstanceList)
	o.Set("pod_spec_override", g.PodSpecOverride).Set("summary_fields", summary)
	return o
}

// --- access -----------------------------------------------------------------

// instanceGroupOptionsAllow: only superusers add groups; PUT is for those
// who administer the group.
func (s *Server) instanceGroupOptionsAllow(r *http.Request, u *auth.User, method string) bool {
	if !u.CanWrite() {
		return false
	}
	if method == "POST" {
		return u.IsSuperuser
	}
	_, g, err := instanceGroupObj.fromPath(s, r, false)
	return err == nil && (u.IsSuperuser || s.userHasRoleID(r.Context(), u.ID, g.AdminRoleID))
}

// pkFromData is get_pk_from_dict.
func pkFromData(body *OMap, key string) *int64 {
	raw, ok := body.Get(key)
	if !ok || raw == nil {
		return nil
	}
	if m, ok := raw.(*OMap); ok {
		raw, _ = m.Get("id")
	}
	switch t := raw.(type) {
	case json.Number:
		if n, err := t.Int64(); err == nil {
			return &n
		}
		if f, err := t.Float64(); err == nil {
			n := int64(f)
			return &n
		}
	case string:
		// int(), as get_pk_from_dict took it: surrounding space allowed.
		if n, err := strconv.ParseInt(strings.TrimSpace(t), 10, 64); err == nil {
			return &n
		}
	case bool:
		n := int64(0)
		if t {
			n = 1
		}
		return &n
	}
	return nil
}

// instanceGroupCanChange is InstanceGroupAccess.can_change: only a
// superuser may point a group at a different mesh node.
func (s *Server) instanceGroupCanChange(ctx context.Context, u *auth.User, g *instanceGroup, body *OMap) bool {
	if u.IsSuperuser {
		return true
	}
	if body != nil && body.Has("mesh_node") {
		pk := pkFromData(body, "mesh_node")
		if (pk == nil) != (g.MeshNodeID == nil) || (pk != nil && *pk != *g.MeshNodeID) {
			return false
		}
	}
	return s.userHasRoleID(ctx, u.ID, g.AdminRoleID)
}

// --- validation -------------------------------------------------------------

func intPtr(v int64) *int64 { return &v }

// igFromForm validates InstanceGroupSerializer's fields onto g. existing
// is the stored group for updates. It returns the attrs the object-level
// validate() looked at.
func (s *Server) igFromForm(ctx context.Context, f *Form, g *instanceGroup, existing *instanceGroup) {
	execQueue, controlQueue := s.queueNames(ctx)
	protected := existing != nil && (existing.Name == execQueue || existing.Name == controlQueue)
	containerNow := existing != nil && existing.IsContainerGroup
	name := f.String("name", true, 250, g.Name)
	if f.Has("name") && !f.Errs.Has("name") {
		var taken bool
		var exclude int64
		if existing != nil {
			exclude = existing.ID
		}
		_ = db.Tolerant(s.Q()).QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM main_instancegroup WHERE name = $1 AND id <> $2)`, name, exclude).Scan(&taken)
		switch {
		case taken:
			f.Errs.Add("name", "Instance group with this Name already exists.")
		case existing != nil && existing.Name == execQueue && name != execQueue:
			f.Errs.Add("name", execQueue+" instance group name may not be changed.")
		case existing != nil && existing.Name == controlQueue && name != controlQueue:
			f.Errs.Add("name", controlQueue+" instance group name may not be changed.")
		default:
			g.Name = name
		}
	}
	g.MaxConcurrentJobs = f.Int("max_concurrent_jobs", g.MaxConcurrentJobs, intPtr(0), nil)
	g.MaxForks = f.Int("max_forks", g.MaxForks, intPtr(0), nil)
	if f.Has("is_container_group") {
		v := f.Bool("is_container_group", g.IsContainerGroup)
		if !f.Errs.Has("is_container_group") {
			if protected && v != existing.IsContainerGroup {
				f.Errs.Add("is_container_group", existing.Name+" instance group is_container_group may not be changed.")
			} else {
				g.IsContainerGroup = v
			}
		}
	}
	// The cluster login runs every pod the group starts.
	if id, set := f.ID("credential", g.CredentialID, false, s.credentialChoiceOK(ctx, g.CredentialID)); set {
		if id != nil {
			var kind string
			_ = db.Tolerant(s.Q()).QueryRow(ctx, `SELECT ct.kind FROM main_credential c JOIN main_credentialtype ct ON ct.id = c.credential_type_id WHERE c.id = $1`, *id).Scan(&kind)
			if kind != "kubernetes" {
				f.Errs.Add("credential", "Only Kubernetes credentials can be associated with an Instance Group")
			}
		}
		if !f.Errs.Has("credential") {
			g.CredentialID = id
		}
	}
	if id, set := f.ID("mesh_node", g.MeshNodeID, false, s.existsIn(ctx, "main_instance")); set {
		if id != nil {
			var nodeType, state string
			_ = db.Tolerant(s.Q()).QueryRow(ctx, `SELECT node_type, node_state FROM main_instance WHERE id = $1`, *id).Scan(&nodeType, &state)
			if nodeType != "hop" {
				f.Errs.Add("mesh_node", "Only hop nodes can run the pods of a container group.")
			} else if state == "deprovisioning" || state == "deprovision-fail" {
				f.Errs.Add("mesh_node", "Cannot run the pods of a container group on a node that is being deprovisioned.")
			}
		}
		if !f.Errs.Has("mesh_node") {
			g.MeshNodeID = id
		}
	}
	if f.Has("policy_instance_percentage") {
		v := f.Int("policy_instance_percentage", g.PolicyInstancePercentage, intPtr(0), intPtr(100))
		if !f.Errs.Has("policy_instance_percentage") {
			switch {
			case protected && v != existing.PolicyInstancePercentage:
				f.Errs.Add("policy_instance_percentage", existing.Name+" instance group policy_instance_percentage may not be changed from the initial value set by the installer.")
			case v != 0 && containerNow:
				f.Errs.Add("policy_instance_percentage", "Containerized instances may not be managed via the API")
			default:
				g.PolicyInstancePercentage = v
			}
		}
	} else if !f.Partial {
		g.PolicyInstancePercentage = 0
	}
	if f.Has("policy_instance_minimum") {
		v := f.Int("policy_instance_minimum", g.PolicyInstanceMinimum, intPtr(0), nil)
		if !f.Errs.Has("policy_instance_minimum") {
			if v != 0 && containerNow {
				f.Errs.Add("policy_instance_minimum", "Containerized instances may not be managed via the API")
			} else {
				g.PolicyInstanceMinimum = v
			}
		}
	} else if !f.Partial {
		g.PolicyInstanceMinimum = 0
	}
	if raw, ok := f.Raw("policy_instance_list"); ok {
		list, err := stringList(raw)
		if err != "" {
			f.Errs.Add("policy_instance_list", err)
		} else {
			msg := ""
			if protected && !sameStrings(list, existing.PolicyInstanceList) {
				msg = existing.Name + " instance group policy_instance_list may not be changed."
			}
			for i, h := range list {
				if msg != "" {
					break
				}
				for _, o := range list[i+1:] {
					if o == h {
						msg = fmt.Sprintf("Duplicate entry %s.", h)
					}
				}
				if msg == "" {
					var ok bool
					_ = db.Tolerant(s.Q()).QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM main_instance WHERE hostname = $1)`, h).Scan(&ok)
					if !ok {
						msg = fmt.Sprintf("%s is not a valid hostname of an existing instance.", h)
					}
				}
			}
			if msg == "" && len(list) > 0 && containerNow {
				msg = "Containerized instances may not be managed via the API"
			}
			if msg != "" {
				f.Errs.Add("policy_instance_list", msg)
			} else {
				g.PolicyInstanceList = list
			}
		}
	}
	g.PodSpecOverride = f.String("pod_spec_override", false, 0, g.PodSpecOverride)
	if len(f.Errs) > 0 {
		return
	}
	// validate(): a credential needs is_container_group in the same request.
	if raw, ok := f.Raw("credential"); ok && raw != nil && g.CredentialID != nil {
		sent := false
		if v, ok := f.Raw("is_container_group"); ok {
			sent, _ = drfBool(v)
		}
		if !sent {
			f.Errs.Add("is_container_group", "is_container_group must be True when associating a credential to an Instance Group")
			return
		}
	}
	if g.MeshNodeID != nil {
		if !g.IsContainerGroup {
			f.Errs.Add("mesh_node", "Only container groups can run their pods on a mesh node.")
		} else if g.CredentialID != nil {
			f.Errs.Add("mesh_node", "A container group behind a mesh node uses that node's service account and cannot have a credential.")
		}
	}
}

// stringList is ListField(child=CharField()).
func stringList(raw any) ([]string, string) {
	items, ok := raw.([]any)
	if !ok {
		return nil, fmt.Sprintf("Expected a list of items but got type \"%s\".", pyTypeName(raw))
	}
	out := make([]string, 0, len(items))
	for _, it := range items {
		switch t := it.(type) {
		case string:
			out = append(out, t)
		case json.Number:
			out = append(out, t.String())
		case bool:
			if t {
				out = append(out, "True")
			} else {
				out = append(out, "False")
			}
		default:
			return nil, "Not a valid string."
		}
	}
	return out, ""
}

func sameStrings(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

// igChanges is model_to_dict with the serializer's writable fields.
// q is the writer's transaction when there is one.
func (s *Server) igChanges(ctx context.Context, q db.Querier, g *instanceGroup) map[string]any {
	var mesh any
	cred := s.nameRefCtx(ctx, q, `SELECT name FROM main_credential WHERE id = $1`, g.CredentialID)
	if g.MeshNodeID != nil {
		var host string
		if err := q.QueryRow(ctx, `SELECT hostname FROM main_instance WHERE id = $1`, *g.MeshNodeID).Scan(&host); err != nil && !db.IsNoRows(err) {
			s.Log.ErrorContext(ctx, "activity stream name lookup", "instance", *g.MeshNodeID, "err", err)
		}
		mesh = host
	}
	list, _ := activity.PyJSON(g.PolicyInstanceList)
	return map[string]any{"name": g.Name, "max_concurrent_jobs": g.MaxConcurrentJobs, "max_forks": g.MaxForks, "is_container_group": g.IsContainerGroup,
		"credential": cred, "mesh_node": mesh, "policy_instance_percentage": g.PolicyInstancePercentage, "policy_instance_minimum": g.PolicyInstanceMinimum,
		"policy_instance_list": string(list), "pod_spec_override": g.PodSpecOverride, "id": g.ID}
}

// schedulePolicy is schedule_policy_task: the membership policies are
// applied after the request's transaction, in the background as the old
// dispatcher did.
func (s *Server) schedulePolicy() {
	s.Background(func(ctx context.Context) {
		ctx, cancel := context.WithTimeout(ctx, time.Minute)
		defer cancel()
		_, controlQueue := s.queueNames(ctx)
		if err := s.DB.Tx(ctx, func(tx pgx.Tx) error { return models.ApplyClusterMembershipPolicies(ctx, tx, controlQueue) }); err != nil {
			s.Log.ErrorContext(ctx, "cluster membership policies", "err", err)
		}
	})
}

// --- create, update, delete -------------------------------------------------

func (s *Server) insertInstanceGroup(ctx context.Context, tx pgx.Tx, g *instanceGroup) error {
	list, _ := json.Marshal(g.PolicyInstanceList)
	err := tx.QueryRow(ctx, `INSERT INTO main_instancegroup (name, created, modified, policy_instance_list, policy_instance_minimum, policy_instance_percentage, credential_id, pod_spec_override, is_container_group, max_concurrent_jobs, max_forks, mesh_node_id)
		VALUES ($1, now(), now(), $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id, created, modified`,
		g.Name, list, g.PolicyInstanceMinimum, g.PolicyInstancePercentage, g.CredentialID, g.PodSpecOverride, g.IsContainerGroup, g.MaxConcurrentJobs, g.MaxForks, g.MeshNodeID).Scan(&g.ID, &g.Created, &g.Modified)
	if err != nil {
		return err
	}
	roles, err := models.RoleFactory{CT: s.CT}.CreateRoles(ctx, tx, "instancegroup", s.CT.ID("main.instancegroup"), g.ID, instanceGroupRoleFields, nil)
	if err != nil {
		return err
	}
	a, us, rd := roles["admin_role"], roles["use_role"], roles["read_role"]
	g.AdminRoleID, g.UseRoleID, g.ReadRoleID = &a, &us, &rd
	_, err = tx.Exec(ctx, `UPDATE main_instancegroup SET admin_role_id = $2, use_role_id = $3, read_role_id = $4 WHERE id = $1`, g.ID, g.AdminRoleID, g.UseRoleID, g.ReadRoleID)
	return err
}

// createInstanceGroup validates and inserts a group, as the list's POST
// and an instance's instance_groups POST without an id did.
func (s *Server) createInstanceGroup(r *http.Request, u *auth.User, body *OMap) (*instanceGroup, error) {
	if !u.IsSuperuser {
		return nil, ErrForbidden
	}
	ctx := r.Context()
	g := &instanceGroup{PolicyInstanceList: []string{}}
	f := NewForm(body, false)
	s.igFromForm(ctx, f, g, nil)
	if err := f.Err(); err != nil {
		return nil, err
	}
	err := s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if err := s.insertInstanceGroup(ctx, tx, g); err != nil {
			return err
		}
		return s.Activity.Record(ctx, tx, activity.Entry{Operation: "create", Object1: "instance_group", Changes: s.igChanges(ctx, tx, g), ActorID: &u.ID, Links: map[string]int64{"instance_group": g.ID}})
	})
	if err != nil {
		return nil, err
	}
	return g, nil
}

func (s *Server) instanceGroupCreate(w http.ResponseWriter, r *http.Request) error {
	u, err := RequireWrite(r)
	if err != nil {
		return err
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	g, err := s.createInstanceGroup(r, u, body)
	if err != nil {
		return err
	}
	caps, err := s.instanceGroupCapacities(r.Context(), nil)
	if err != nil {
		return err
	}
	w.Header().Set("Location", URLFor("instance_groups", g.ID))
	WriteJSON(w, http.StatusCreated, s.serializeInstanceGroup(s.NewSerCtx(r, true), g, caps))
	if !g.IsContainerGroup {
		s.schedulePolicy()
	}
	return nil
}

func (s *Server) instanceGroupUpdate(w http.ResponseWriter, r *http.Request) error {
	u, g, err := instanceGroupObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	ctx := r.Context()
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	if !s.instanceGroupCanChange(ctx, u, g, body) {
		return ErrForbidden
	}
	existing := *g
	existing.PolicyInstanceList = append([]string(nil), g.PolicyInstanceList...)
	before := s.igChanges(ctx, s.Q(), g)
	f := NewForm(body, r.Method == http.MethodPatch)
	s.igFromForm(ctx, f, g, &existing)
	if err := f.Err(); err != nil {
		return err
	}
	// The pod spec decides what every job pod of the group may do on the
	// cluster (host mounts, privilege, its service account): the
	// superuser's to change, as creating the group is.
	if !u.IsSuperuser && g.PodSpecOverride != existing.PodSpecOverride {
		return Detail(http.StatusForbidden, "Only a system administrator can change pod_spec_override.")
	}
	// InstanceGroupAccess.can_change on the validated value: the raw-body
	// check above could read the id differently from the form (" 5").
	if !u.IsSuperuser && !sameID(g.MeshNodeID, existing.MeshNodeID) {
		return ErrForbidden
	}
	policyChanged := !sameStrings(existing.PolicyInstanceList, g.PolicyInstanceList) || existing.PolicyInstanceMinimum != g.PolicyInstanceMinimum || existing.PolicyInstancePercentage != g.PolicyInstancePercentage
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		list, _ := json.Marshal(g.PolicyInstanceList)
		if err := tx.QueryRow(ctx, `UPDATE main_instancegroup SET name = $2, modified = now(), policy_instance_list = $3, policy_instance_minimum = $4, policy_instance_percentage = $5, credential_id = $6, pod_spec_override = $7, is_container_group = $8, max_concurrent_jobs = $9, max_forks = $10, mesh_node_id = $11 WHERE id = $1 RETURNING modified`,
			g.ID, g.Name, list, g.PolicyInstanceMinimum, g.PolicyInstancePercentage, g.CredentialID, g.PodSpecOverride, g.IsContainerGroup, g.MaxConcurrentJobs, g.MaxForks, g.MeshNodeID).Scan(&g.Modified); err != nil {
			return err
		}
		changes := diffChanges(before, s.igChanges(ctx, tx, g))
		if len(changes) == 0 {
			return nil
		}
		return s.Activity.Record(ctx, tx, activity.Entry{Operation: "update", Object1: "instance_group", Changes: changes, ActorID: &u.ID, Links: map[string]int64{"instance_group": g.ID}})
	})
	if err != nil {
		return err
	}
	if policyChanged && !g.IsContainerGroup {
		s.schedulePolicy()
	} else if !policyChanged && g.IsContainerGroup {
		// on_instance_group_saved reset the saved object's policy fields
		// in memory, which is what the response showed.
		g.PolicyInstanceList, g.PolicyInstanceMinimum, g.PolicyInstancePercentage = []string{}, 0, 0
	}
	caps, err := s.instanceGroupCapacities(ctx, nil)
	if err != nil {
		return err
	}
	WriteJSON(w, 200, s.serializeInstanceGroup(s.NewSerCtx(r, true), g, caps))
	return nil
}

func (s *Server) instanceGroupDelete(w http.ResponseWriter, r *http.Request) error {
	u, g, err := instanceGroupObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	ctx := r.Context()
	// InstanceGroupDetail set always_allow_superuser = False: the installer's
	// groups cannot be deleted by anyone.
	if !u.IsSuperuser || s.instanceGroupProtected(ctx, g.Name) {
		return ErrForbidden
	}
	// RelatedJobsPreventDeleteMixin
	if err := s.checkRelatedActiveJobs(ctx, instanceGroupJobsCond, g.ID); err != nil {
		return err
	}
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if err := s.Activity.Record(ctx, tx, activity.Entry{Operation: "delete", Object1: "instance_group", Changes: s.igChanges(ctx, tx, g), ActorID: &u.ID}); err != nil {
			return err
		}
		return s.Cascade.Delete(ctx, tx, "main_instancegroup", "id", []int64{g.ID})
	})
	if err != nil {
		return err
	}
	if !g.IsContainerGroup {
		s.schedulePolicy()
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// activeJobsWhere lists the new, pending, waiting and running jobs a
// condition on main_unifiedjob selects, as get_active_jobs did.
func (s *Server) activeJobsWhere(ctx context.Context, cond string, args ...any) ([]any, error) {
	rows, err := s.Q().Query(ctx, `SELECT id, polymorphic_ctype_id FROM main_unifiedjob WHERE `+cond+` AND status IN ('new', 'pending', 'waiting', 'running') ORDER BY id`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []any{}
	for rows.Next() {
		var id, ct int64
		if err := rows.Scan(&id, &ct); err != nil {
			return nil, err
		}
		out = append(out, NewOMap().Set("id", id).Set("type", models.JobTypeForContentType(s.CT, ct)))
	}
	return out, rows.Err()
}

// --- sub-lists --------------------------------------------------------------

func (s *Server) instanceGroupJobs(w http.ResponseWriter, r *http.Request) error {
	_, g, err := instanceGroupObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	return s.unifiedJobListWith(w, r, func(q *Query) { q.And("uj.instance_group_id = " + q.Arg(g.ID)) })
}

func (s *Server) instanceGroupInstances(w http.ResponseWriter, r *http.Request) error {
	_, g, err := instanceGroupObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	// The sub-list kept the model's ordering (hostname); the top-level
	// list ordered by id.
	spec := s.instanceSpec()
	spec.DefaultOrder = []string{"hostname"}
	return s.instanceListWith(w, r, spec, func(q *Query) {
		q.And("i.id IN (SELECT gi.instance_id FROM main_instancegroup_instances gi WHERE gi.instancegroup_id = " + q.Arg(g.ID) + ")")
	})
}

// instanceGroupInstancesAttach is InstanceGroupInstanceList's POST:
// SubListAttachDetachAPIView with InstanceGroupMembershipMixin.
func (s *Server) instanceGroupInstancesAttach(w http.ResponseWriter, r *http.Request) error {
	u, g, err := instanceGroupObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	if raw, _ := body.Get("id"); raw == nil || raw == false || raw == "" || raw == json.Number("0") {
		return &APIError{Status: http.StatusBadRequest, Body: map[string]any{"msg": "Instance 'id' field is missing."}}
	}
	detach := isDetach(body)
	sid, aerr := attachID(body, "Instance", detach)
	if aerr != nil {
		return aerr
	}
	ctx := r.Context()
	inst, err := s.loadInstanceCtx(ctx, sid)
	if err != nil {
		return err
	}
	if inst == nil {
		return BadRequest("Instance matching query does not exist.")
	}
	if !s.instanceGroupCanChange(ctx, u, g, body) || (!detach && !s.instanceReadable(ctx, u, inst.ID)) {
		return ErrForbidden
	}
	_, controlQueue := s.queueNames(ctx)
	if msg := membershipError(inst, g, controlQueue, detach); msg != "" {
		return &APIError{Status: http.StatusBadRequest, Body: map[string]any{"msg": msg}}
	}
	if err := s.changeMembership(ctx, u, g, inst, detach, "instance_group"); err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// membershipError is is_valid_relation and is_valid_removal of the
// membership views (both directions use the same rules).
func membershipError(inst *instance, g *instanceGroup, controlQueue string, removal bool) string {
	switch inst.NodeType {
	case "control":
		return fmt.Sprintf("Cannot change instance group membership of control-only node: %s.", inst.Hostname)
	case "hop":
		return fmt.Sprintf("Cannot change instance group membership of hop node : %s.", inst.Hostname)
	}
	if removal && inst.NodeType == "hybrid" && g.Name == controlQueue {
		return fmt.Sprintf("Cannot disassociate hybrid node %s from %s.", inst.Hostname, g.Name)
	}
	return ""
}

// changeMembership adds or removes an instance, recording the association
// from the side the request came from, then keeps the group's
// policy_instance_list in step as InstanceGroupMembershipMixin did and
// reapplies the policies.
func (s *Server) changeMembership(ctx context.Context, u *auth.User, g *instanceGroup, inst *instance, detach bool, from string) error {
	listChanged := false
	err := s.DB.Tx(ctx, func(tx pgx.Tx) error {
		var member bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM main_instancegroup_instances WHERE instancegroup_id = $1 AND instance_id = $2)`, g.ID, inst.ID).Scan(&member); err != nil {
			return err
		}
		action := "associate"
		if detach {
			action = "disassociate"
		}
		if member == detach {
			if detach {
				if _, err := tx.Exec(ctx, `DELETE FROM main_instancegroup_instances WHERE instancegroup_id = $1 AND instance_id = $2`, g.ID, inst.ID); err != nil {
					return err
				}
			} else if _, err := tx.Exec(ctx, `INSERT INTO main_instancegroup_instances (instancegroup_id, instance_id) VALUES ($1, $2)`, g.ID, inst.ID); err != nil {
				return err
			}
			o1, id1, o2, id2 := "instance_group", g.ID, "instance", inst.ID
			if from == "instance" {
				o1, id1, o2, id2 = "instance", inst.ID, "instance_group", g.ID
			}
			if err := s.recordAssociation(ctx, tx, &u.ID, action, "ascender.main.models.ha.InstanceGroup_instances", o1, id1, o2, id2); err != nil {
				return err
			}
		}
		// The mixin re-read the group for update and kept the hostname in
		// (or out of) its policy list.
		var raw []byte
		if err := tx.QueryRow(ctx, `SELECT policy_instance_list FROM main_instancegroup WHERE id = $1 FOR UPDATE`, g.ID).Scan(&raw); err != nil {
			return err
		}
		list := []string{}
		_ = json.Unmarshal(raw, &list)
		before := append([]string(nil), list...)
		idx := -1
		for i, h := range list {
			if h == inst.Hostname {
				idx = i
				break
			}
		}
		switch {
		case !detach && idx < 0:
			list = append(list, inst.Hostname)
		case detach && idx >= 0:
			list = append(list[:idx], list[idx+1:]...)
		default:
			return nil
		}
		listChanged = true
		nb, _ := json.Marshal(list)
		if _, err := tx.Exec(ctx, `UPDATE main_instancegroup SET policy_instance_list = $2 WHERE id = $1`, g.ID, nb); err != nil {
			return err
		}
		ob, _ := activity.PyJSON(before)
		lb, _ := activity.PyJSON(list)
		return s.Activity.Record(ctx, tx, activity.Entry{Operation: "update", Object1: "instance_group", ActorID: &u.ID,
			Changes: map[string]any{"policy_instance_list": []any{string(ob), string(lb)}}, Links: map[string]int64{"instance_group": g.ID}})
	})
	if err != nil {
		return err
	}
	// Saving the group's new policy list scheduled the policy task through
	// on_instance_group_saved (not for container groups); a removal
	// scheduled it regardless.
	if detach || (listChanged && !g.IsContainerGroup) {
		s.schedulePolicy()
	}
	return nil
}
