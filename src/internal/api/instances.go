package api

import (
	"context"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/activity"
	"github.com/ctrliq/ascender/internal/auth"
	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/models"
)

// Instances: InstanceList/Detail and their jobs, instance_groups,
// health_check, peers, receptor_addresses and install_bundle views, the
// receptor address views and the mesh visualizer, with InstanceAccess and
// InstanceSerializer's rules.

type instance struct {
	ID                 int64
	UUID               string
	Hostname           string
	Created, Modified  time.Time
	LastSeen           *time.Time
	HealthCheckStarted *time.Time
	LastHealthCheck    *time.Time
	Errors             string
	CapacityAdjustment string
	Version            string
	Capacity           int64
	CPU                string
	Memory             int64
	CPUCapacity        int64
	MemCapacity        int64
	Enabled            bool
	ManagedByPolicy    bool
	NodeType           string
	NodeState          string
	Managed            bool
	IPAddress          string
	Consumed           int64
	JobsRunning        int64
	JobsTotal          int64
	ListenerPort       *int64
	PeersFromControl   bool
	Protocol           string
	Peers              []int64
	ReversePeers       []int64
}

const instanceColumns = `i.id, i.uuid, i.hostname, i.created, i.modified, i.last_seen, i.health_check_started, i.last_health_check, i.errors, i.capacity_adjustment::text, i.version, i.capacity, i.cpu::text, i.memory, i.cpu_capacity, i.mem_capacity, i.enabled, i.managed_by_policy, i.node_type, i.node_state, i.managed, i.ip_address,
	(CASE WHEN i.node_type IN ('hybrid', 'execution') THEN COALESCE((SELECT sum(uj.task_impact) FROM main_unifiedjob uj WHERE uj.execution_node = i.hostname AND uj.status IN ('running', 'waiting')), 0) ELSE 0 END)
	+ (CASE WHEN i.node_type IN ('hybrid', 'control') THEN ` + "1" + ` * (SELECT count(*) FROM main_unifiedjob uj WHERE uj.controller_node = i.hostname AND uj.status IN ('running', 'waiting')) ELSE 0 END),
	(SELECT count(*) FROM main_unifiedjob uj WHERE uj.execution_node = i.hostname AND uj.status IN ('running', 'waiting')),
	0,
	(SELECT ra.port FROM main_receptoraddress ra WHERE ra.instance_id = i.id AND ra.canonical ORDER BY ra.id LIMIT 1),
	COALESCE((SELECT ra.peers_from_control_nodes FROM main_receptoraddress ra WHERE ra.instance_id = i.id AND ra.canonical ORDER BY ra.id LIMIT 1), false),
	COALESCE((SELECT ra.protocol FROM main_receptoraddress ra WHERE ra.instance_id = i.id AND ra.canonical ORDER BY ra.id LIMIT 1), ''),
	COALESCE((SELECT array_agg(l.target_id ORDER BY l.target_id) FROM main_instancelink l WHERE l.source_id = i.id), '{}'),
	COALESCE((SELECT array_agg(src.id ORDER BY src.hostname) FROM main_instancelink l JOIN main_instance src ON src.id = l.source_id JOIN main_receptoraddress ra ON ra.id = l.target_id WHERE ra.instance_id = i.id), '{}')`

func scanInstance(rows pgx.Row) (*instance, error) {
	i := &instance{}
	var port *int32
	err := rows.Scan(&i.ID, &i.UUID, &i.Hostname, &i.Created, &i.Modified, &i.LastSeen, &i.HealthCheckStarted, &i.LastHealthCheck, &i.Errors, &i.CapacityAdjustment, &i.Version, &i.Capacity, &i.CPU, &i.Memory, &i.CPUCapacity, &i.MemCapacity, &i.Enabled, &i.ManagedByPolicy, &i.NodeType, &i.NodeState, &i.Managed, &i.IPAddress,
		&i.Consumed, &i.JobsRunning, &i.JobsTotal, &port, &i.PeersFromControl, &i.Protocol, &i.Peers, &i.ReversePeers)
	if port != nil {
		p := int64(*port)
		i.ListenerPort = &p
	}
	return i, err
}

func instanceFieldSet(a string) *FieldSet {
	return &FieldSet{Model: "Instance", Fields: map[string]Field{
		"id": {SQL: a + ".id", Kind: KindInt}, "uuid": {SQL: a + ".uuid"}, "hostname": {SQL: a + ".hostname"}, "created": {SQL: a + ".created", Kind: KindDateTime}, "modified": {SQL: a + ".modified", Kind: KindDateTime},
		"last_seen": {SQL: a + ".last_seen", Kind: KindDateTime}, "health_check_started": {SQL: a + ".health_check_started", Kind: KindDateTime}, "last_health_check": {SQL: a + ".last_health_check", Kind: KindDateTime},
		"errors": {SQL: a + ".errors"}, "version": {SQL: a + ".version"}, "capacity": {SQL: a + ".capacity", Kind: KindInt}, "memory": {SQL: a + ".memory", Kind: KindInt},
		"cpu_capacity": {SQL: a + ".cpu_capacity", Kind: KindInt}, "mem_capacity": {SQL: a + ".mem_capacity", Kind: KindInt}, "enabled": {SQL: a + ".enabled", Kind: KindBool},
		"managed_by_policy": {SQL: a + ".managed_by_policy", Kind: KindBool}, "node_type": {SQL: a + ".node_type"}, "node_state": {SQL: a + ".node_state"}, "managed": {SQL: a + ".managed", Kind: KindBool},
		"ip_address": {SQL: a + ".ip_address"},
	}, SearchFields: []string{"hostname"}}
}

var instanceFields *FieldSet

func receptorAddressFieldSet(a string) *FieldSet {
	return &FieldSet{Model: "ReceptorAddress", Fields: map[string]Field{
		"id": {SQL: a + ".id", Kind: KindInt}, "address": {SQL: a + ".address"}, "port": {SQL: a + ".port", Kind: KindInt}, "websocket_path": {SQL: a + ".websocket_path"},
		"protocol": {SQL: a + ".protocol"}, "is_internal": {SQL: a + ".is_internal", Kind: KindBool}, "canonical": {SQL: a + ".canonical", Kind: KindBool},
		"peers_from_control_nodes": {SQL: a + ".peers_from_control_nodes", Kind: KindBool}, "instance": {SQL: a + ".instance_id", Kind: KindFK},
	}, SearchFields: []string{"address"}}
}

func init() {
	instanceFields = instanceFieldSet("i")
	instanceFields.Fields["rampart_groups"] = Field{SQL: "irg.instancegroup_id", Kind: KindFK, Rel: &Relation{Alias: "irgg", Join: "LEFT JOIN main_instancegroup_instances irg ON irg.instance_id = i.id LEFT JOIN main_instancegroup irgg ON irgg.id = irg.instancegroup_id", Target: func() *FieldSet { return instanceGroupFieldSet("irgg") }, Many: true}}
	instanceFields.Fields["receptor_addresses"] = Field{SQL: "ira.id", Kind: KindFK, Rel: &Relation{Alias: "ira", Join: "LEFT JOIN main_receptoraddress ira ON ira.instance_id = i.id", Target: func() *FieldSet { return receptorAddressFieldSet("ira") }, Many: true}}
	instanceFields.Fields["peers"] = Field{SQL: "ipl.target_id", Kind: KindFK, Rel: &Relation{Alias: "ipa", Join: "LEFT JOIN main_instancelink ipl ON ipl.source_id = i.id LEFT JOIN main_receptoraddress ipa ON ipa.id = ipl.target_id", Target: func() *FieldSet { return receptorAddressFieldSet("ipa") }, Many: true}}
	instanceFields.Fields["remote_container_groups"] = Field{SQL: "ircg.id", Kind: KindFK, Rel: &Relation{Alias: "ircg", Join: "LEFT JOIN main_instancegroup ircg ON ircg.mesh_node_id = i.id", Target: func() *FieldSet { return instanceGroupFieldSet("ircg") }, Many: true}}
	resourceRegistrars = append(resourceRegistrars, func(s *Server, mux *http.ServeMux) {
		opts := s.optionsFiltered("instances", s.instanceOptionsAllow)
		s.route(mux, "/api/v2/instances/{$}", methodMap{"GET": s.instanceList, "POST": s.instanceCreate}, opts)
		s.route(mux, "/api/v2/instances/{id}/{$}", methodMap{"GET": s.instanceDetail, "PUT": s.instanceUpdate, "PATCH": s.instanceUpdate}, opts)
		s.route(mux, "/api/v2/instances/{id}/jobs/{$}", methodMap{"GET": s.instanceJobs}, s.optionsFor("unified_jobs"))
		s.route(mux, "/api/v2/instances/{id}/instance_groups/{$}", methodMap{"GET": s.instanceInstanceGroups, "POST": s.instanceInstanceGroupsAttach}, s.optionsFor("instance_groups"))
		s.route(mux, "/api/v2/instances/{id}/health_check/{$}", methodMap{"GET": s.instanceHealthCheck, "POST": s.instanceHealthCheckRun}, s.optionsFiltered("instances", s.adminOrAuditorPost))
		s.route(mux, "/api/v2/instances/{id}/peers/{$}", methodMap{"GET": s.instancePeers}, s.optionsFor("receptor_addresses"))
		s.route(mux, "/api/v2/instances/{id}/receptor_addresses/{$}", methodMap{"GET": s.instanceReceptorAddresses}, s.optionsFor("receptor_addresses"))
		s.route(mux, "/api/v2/instances/{id}/install_bundle/{$}", methodMap{"GET": s.instanceInstallBundle}, s.optionsFor("instances"))
		s.route(mux, "/api/v2/receptor_addresses/{$}", methodMap{"GET": s.receptorAddressList}, s.optionsFor("receptor_addresses"))
		s.route(mux, "/api/v2/receptor_addresses/{id}/{$}", methodMap{"GET": s.receptorAddressDetail}, s.optionsFor("receptor_addresses"))
		s.route(mux, "/api/v2/mesh_visualizer/{$}", methodMap{"GET": s.meshVisualizer}, s.optionsExact("mesh_visualizer"))
	})
}

// instanceAccess is InstanceAccess.filtered_queryset: instances in groups
// the user can read.
func (s *Server) instanceAccess(q *Query, u *auth.User) {
	q.And("i.id IN (SELECT gi.instance_id FROM main_instancegroup_instances gi WHERE gi.instancegroup_id IN (" + accessibleSQL(q, u.ID, s.CT.ID("main.instancegroup"), "read_role") + "))")
}

func (s *Server) instanceReadable(ctx context.Context, u *auth.User, id int64) bool {
	if u.IsSuperuser || u.IsSystemAuditor {
		return true
	}
	q := NewQuery()
	var ok bool
	_ = db.Tolerant(s.Q()).QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM main_instancegroup_instances gi WHERE gi.instance_id = `+q.Arg(id)+` AND gi.instancegroup_id IN (`+accessibleSQL(q, u.ID, s.CT.ID("main.instancegroup"), "read_role")+`))`, q.Args...).Scan(&ok)
	return ok
}

func (s *Server) instanceSpec() ListSpec {
	return ListSpec{Model: "Instance", From: "main_instance i", Columns: instanceColumns, PK: "i.id", Fields: instanceFields, DefaultOrder: []string{"id"}, Access: s.instanceAccess}
}

func (s *Server) instanceList(w http.ResponseWriter, r *http.Request) error {
	return s.instanceListWith(w, r, s.instanceSpec(), nil)
}

func (s *Server) instanceListWith(w http.ResponseWriter, r *http.Request, spec ListSpec, extra func(q *Query)) error {
	insts, count, page, err := runListOf(s, r, spec, extra, scanInstance)
	if err != nil {
		return err
	}
	if err := s.loadJobsTotal(r.Context(), insts); err != nil {
		return err
	}
	c := s.NewSerCtx(r, false)
	results := make([]any, 0, len(insts))
	for _, i := range insts {
		results = append(results, s.serializeInstance(c, i))
	}
	WriteJSON(w, 200, Paginate(r, page, count, results))
	return nil
}

func (s *Server) loadInstanceCtx(ctx context.Context, id int64) (*instance, error) {
	rows, err := s.Q().Query(ctx, `SELECT `+instanceColumns+` FROM main_instance i WHERE i.id = $1`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	if !rows.Next() {
		return nil, rows.Err()
	}
	v, err := scanInstance(rows)
	if err != nil {
		return nil, err
	}
	rows.Close()
	if err := s.loadJobsTotal(ctx, []*instance{v}); err != nil {
		return nil, err
	}
	return v, nil
}

// loadJobsTotal sets jobs_total, every job that ran on each instance, in
// one pass over the jobs for all of them: there is no index on
// execution_node, so a count per instance read the table once apiece.
func (s *Server) loadJobsTotal(ctx context.Context, insts []*instance) error {
	if len(insts) == 0 {
		return nil
	}
	byHost := map[string][]*instance{}
	hosts := make([]string, 0, len(insts))
	for _, i := range insts {
		if byHost[i.Hostname] == nil {
			hosts = append(hosts, i.Hostname)
		}
		byHost[i.Hostname] = append(byHost[i.Hostname], i)
	}
	rows, err := s.Q().Query(ctx, `SELECT execution_node, count(*) FROM main_unifiedjob WHERE execution_node = ANY($1) GROUP BY execution_node`, hosts)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var host string
		var n int64
		if err := rows.Scan(&host, &n); err != nil {
			return err
		}
		for _, i := range byHost[host] {
			i.JobsTotal = n
		}
	}
	return rows.Err()
}

// instanceFromPath reads the instance in the URL, for its detail and
// sub-lists: 404 when missing, 403 when the user may not read it.
func (s *Server) instanceFromPath(r *http.Request, u *auth.User) (*instance, error) {
	id, err := PathID(r)
	if err != nil {
		return nil, NotFoundFor("Instance")
	}
	i, err := s.loadInstanceCtx(r.Context(), id)
	if err != nil {
		return nil, err
	}
	if i == nil {
		return nil, NotFoundFor("Instance")
	}
	if !s.instanceReadable(r.Context(), u, i.ID) {
		return nil, ErrForbidden
	}
	return i, nil
}

func (s *Server) instanceDetail(w http.ResponseWriter, r *http.Request) error {
	u, err := RequireUser(r)
	if err != nil {
		return err
	}
	i, err := s.instanceFromPath(r, u)
	if err != nil {
		return err
	}
	WriteJSON(w, 200, s.serializeInstance(s.NewSerCtx(r, true), i))
	return nil
}

func (s *Server) serializeInstance(c *SerCtx, i *instance) *OMap {
	related := NewOMap()
	if c.Detail {
		related.Set("named_url", "/api/v2/instances/"+namedURLEscape(i.Hostname)+"/")
	}
	related.Set("receptor_addresses", SubURL("instances", i.ID, "receptor_addresses")).Set("jobs", SubURL("instances", i.ID, "jobs"))
	related.Set("peers", SubURL("instances", i.ID, "peers")).Set("instance_groups", SubURL("instances", i.ID, "instance_groups"))
	if (i.NodeType == "execution" || i.NodeType == "hop") && !i.Managed {
		related.Set("install_bundle", SubURL("instances", i.ID, "install_bundle"))
	}
	if c.User != nil && (c.User.IsSuperuser || c.User.IsSystemAuditor) && i.NodeType == "execution" {
		related.Set("health_check", SubURL("instances", i.ID, "health_check"))
	}
	summary := NewOMap()
	if c.WantSummary("user_capabilities") && !c.NoCaps {
		// InstanceAccess.can_change answered False for everyone.
		summary.Set("user_capabilities", NewOMap().Set("edit", false))
	}
	if c.IsDetailView || c.Detail {
		summary.Set("links", s.instanceLinks(c.Ctx(), "l.source_id = $1", i.ID))
	}
	pending := i.HealthCheckStarted != nil && (i.LastHealthCheck == nil || i.HealthCheckStarted.After(*i.LastHealthCheck))
	remaining := fixedFloat(0)
	if i.Capacity != 0 && i.Consumed < i.Capacity {
		remaining = percentRemaining(i.Capacity, i.Consumed)
	}
	peers := i.Peers
	if peers == nil {
		peers = []int64{}
	}
	reverse := i.ReversePeers
	if reverse == nil {
		reverse = []int64{}
	}
	o := NewOMap().Set("id", i.ID).Set("hostname", i.Hostname).Set("type", "instance").Set("url", URLFor("instances", i.ID)).Set("related", related).Set("summary_fields", summary)
	o.Set("uuid", i.UUID).Set("created", models.FormatTime(i.Created)).Set("modified", models.FormatTime(i.Modified)).Set("last_seen", models.FormatTimePtr(i.LastSeen))
	o.Set("health_check_started", models.FormatTimePtr(i.HealthCheckStarted)).Set("health_check_pending", pending).Set("last_health_check", models.FormatTimePtr(i.LastHealthCheck))
	o.Set("errors", i.Errors).Set("capacity_adjustment", i.CapacityAdjustment).Set("version", i.Version).Set("capacity", i.Capacity).Set("consumed_capacity", i.Consumed)
	o.Set("percent_capacity_remaining", remaining).Set("jobs_running", i.JobsRunning).Set("jobs_total", i.JobsTotal).Set("cpu", i.CPU).Set("memory", i.Memory)
	o.Set("cpu_capacity", i.CPUCapacity).Set("mem_capacity", i.MemCapacity).Set("enabled", i.Enabled).Set("managed_by_policy", i.ManagedByPolicy).Set("node_type", i.NodeType)
	o.Set("node_state", i.NodeState).Set("managed", i.Managed).Set("ip_address", i.IPAddress).Set("peers", peers).Set("reverse_peers", reverse)
	o.Set("listener_port", models.NullableID(i.ListenerPort)).Set("peers_from_control_nodes", i.PeersFromControl).Set("protocol", i.Protocol)
	return o
}

// fullAddress is ReceptorAddress.get_full_address.
func fullAddress(address string, port *int64, protocol, wsPath string) string {
	scheme, path, p := "", "", ""
	if protocol == "ws" {
		scheme = "wss://"
		if wsPath != "" {
			path = "/" + wsPath
		}
	}
	if port != nil && *port != 0 {
		p = ":" + strconv.FormatInt(*port, 10)
	}
	return scheme + address + p + path
}

// instanceLinks is InstanceLinkSerializer over the links a condition on
// main_instancelink (aliased l) selects.
func (s *Server) instanceLinks(ctx context.Context, cond string, args ...any) []any {
	out := []any{}
	rows, err := s.Q().Query(ctx, `SELECT l.id, l.source_id, src.hostname, l.target_id, tgt.hostname, ra.address, ra.port, ra.protocol, ra.websocket_path, l.link_state
		FROM main_instancelink l JOIN main_instance src ON src.id = l.source_id JOIN main_receptoraddress ra ON ra.id = l.target_id JOIN main_instance tgt ON tgt.id = ra.instance_id
		WHERE `+cond+` ORDER BY l.id`, args...)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var id, srcID, targetID int64
		var src, tgt, addr, proto, ws, state string
		var port *int32
		if err := rows.Scan(&id, &srcID, &src, &targetID, &tgt, &addr, &port, &proto, &ws, &state); err != nil {
			return out
		}
		var p *int64
		if port != nil {
			v := int64(*port)
			p = &v
		}
		related := NewOMap().Set("source_instance", URLFor("instances", srcID)).Set("target_address", URLFor("receptor_addresses", targetID))
		out = append(out, NewOMap().Set("id", id).Set("related", related).Set("source", src).Set("target", tgt).Set("target_full_address", fullAddress(addr, p, proto, ws)).Set("link_state", state))
	}
	s.logRowsErr(ctx, "instanceLinks", rows)
	return out
}

// --- access -----------------------------------------------------------------

// instanceOptionsAllow: superusers add instances (the view's
// always_allow_superuser let them change one too; can_change refused
// everyone else).
func (s *Server) instanceOptionsAllow(r *http.Request, u *auth.User, method string) bool {
	return u.CanWrite() && u.IsSuperuser
}

// adminOrAuditorPost is IsSystemAdminOrAuditor for the POST action.
func (s *Server) adminOrAuditorPost(r *http.Request, u *auth.User, method string) bool {
	return u.IsSuperuser
}

func (s *Server) isK8s(ctx context.Context) bool { return s.Settings.Bool(ctx, "IS_K8S") }

// --- create and update ------------------------------------------------------

var (
	localhostRe = regexp.MustCompile(`(?i)^localhost$|^127(?:\.[0-9]+){0,2}\.[0-9]+$|^(?:0*\:)*?:?0*1$`)
	// HostnameRegexValidator: a hostname, an IPv4 address or an IPv6 address.
	hostnameRe = regexp.MustCompile(`^(?:(?:[a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9\-_]*[a-zA-Z0-9])\.)*(?:[A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9\-_]*[A-Za-z0-9])$`)
)

var instanceNodeTypes = [][2]string{{"control", "Control plane node"}, {"execution", "Execution plane node"}, {"hybrid", "Controller and execution"}, {"hop", "Message-passing node, no execution capability"}}
var instanceNodeStates = [][2]string{{"provisioning", "Provisioning"}, {"provision-fail", "Provisioning Failure"}, {"installed", "Installed"}, {"ready", "Ready"}, {"unavailable", "Unavailable"}, {"deprovisioning", "De-provisioning"}, {"deprovision-fail", "De-provisioning Failure"}}

// decimalField is DRF's DecimalField(max_digits, decimal_places,
// min_value): it returns the quantized text.
func decimalField(f *Form, key string, current string, maxDigits, places int, min *float64) string {
	raw, ok := f.Raw(key)
	if !ok {
		return current
	}
	var text string
	switch t := raw.(type) {
	case json.Number:
		text = t.String()
	case string:
		text = strings.TrimSpace(t)
	case nil:
		f.Errs.Add(key, "This field may not be null.")
		return current
	default:
		f.Errs.Add(key, "A valid number is required.")
		return current
	}
	r, ok := new(big.Rat).SetString(text)
	if !ok || text == "" {
		f.Errs.Add(key, "A valid number is required.")
		return current
	}
	// Digits as Decimal(text).as_tuple() counted them.
	mant := strings.TrimLeft(text, "+-")
	exp := 0
	if i := strings.IndexAny(mant, "eE"); i >= 0 {
		exp, _ = strconv.Atoi(mant[i+1:])
		mant = mant[:i]
	}
	intPart, fracPart := mant, ""
	if i := strings.IndexByte(mant, '.'); i >= 0 {
		intPart, fracPart = mant[:i], mant[i+1:]
	}
	digits := strings.TrimLeft(intPart+fracPart, "0")
	exponent := exp - len(fracPart)
	var total, decimals int
	if exponent >= 0 {
		total, decimals = len(digits)+exponent, 0
	} else {
		total = len(digits)
		if -exponent > total {
			total = -exponent
		}
		decimals = -exponent
	}
	whole := total - decimals
	switch {
	case total > maxDigits:
		f.Errs.Add(key, fmt.Sprintf("Ensure that there are no more than %d digits in total.", maxDigits))
		return current
	case decimals > places:
		f.Errs.Add(key, fmt.Sprintf("Ensure that there are no more than %d decimal places.", places))
		return current
	case whole > maxDigits-places:
		f.Errs.Add(key, fmt.Sprintf("Ensure that there are no more than %d digits before the decimal point.", maxDigits-places))
		return current
	}
	if min != nil {
		if fv, _ := r.Float64(); fv < *min {
			f.Errs.Add(key, fmt.Sprintf("Ensure this value is greater than or equal to %s.", strconv.FormatFloat(*min, 'f', -1, 64)))
			return current
		}
	}
	return r.FloatString(places)
}

func (s *Server) instanceCreate(w http.ResponseWriter, r *http.Request) error {
	u, err := RequireWrite(r)
	if err != nil {
		return err
	}
	if !u.IsSuperuser {
		return ErrForbidden
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	ctx := r.Context()
	f := NewForm(body, false)
	i := &instance{NodeType: "execution", NodeState: "installed", CapacityAdjustment: "1.00", Enabled: true, ManagedByPolicy: true}
	s.instanceFromForm(ctx, f, i, nil)
	if err := f.Err(); err != nil {
		return err
	}
	// validate(): only a Kubernetes or OpenShift install adds instances
	// (IS_K8S), after the field validation as the old one did.
	if !s.isK8s(ctx) {
		return FieldErrors{"__all__": {"Can only create instances on Kubernetes or OpenShift."}}.Err()
	}
	if i.PeersFromControl && i.ListenerPort == nil {
		return FieldErrors{"__all__": {"Cannot enable peers_from_control_nodes if listener_port is not set."}}.Err()
	}
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if err := tx.QueryRow(ctx, `INSERT INTO main_instance (uuid, hostname, created, modified, capacity, version, capacity_adjustment, cpu, memory, cpu_capacity, mem_capacity,
				enabled, managed_by_policy, ip_address, node_type, errors, node_state, managed)
			VALUES ('00000000-0000-0000-0000-000000000000', $1, now(), now(), 0, '', $2::numeric, 0, 0, 0, 0, $3, $4, '', $5, '', $6, false) RETURNING id, created, modified`,
			i.Hostname, i.CapacityAdjustment, i.Enabled, i.ManagedByPolicy, i.NodeType, i.NodeState).Scan(&i.ID, &i.Created, &i.Modified); err != nil {
			return err
		}
		// create_or_update: a listener port makes the canonical receptor
		// address.
		if i.ListenerPort != nil {
			if _, err := tx.Exec(ctx, `INSERT INTO main_receptoraddress (address, port, websocket_path, protocol, is_internal, canonical, peers_from_control_nodes, instance_id) VALUES ($2, $3, '', 'tcp', false, true, $4, $1)`,
				i.ID, i.Hostname, *i.ListenerPort, i.PeersFromControl); err != nil {
				return err
			}
		}
		for _, t := range i.Peers {
			if _, err := tx.Exec(ctx, `INSERT INTO main_instancelink (source_id, target_id, link_state) VALUES ($1, $2, 'adding')`, i.ID, t); err != nil {
				return err
			}
		}
		return s.Activity.Record(ctx, tx, activity.Entry{Operation: "create", Object1: "instance", Changes: instanceChanges(i), ActorID: &u.ID, Links: map[string]int64{"instance": i.ID}})
	})
	if err != nil {
		return err
	}
	s.schedulePolicy()
	fresh, err := s.loadInstanceCtx(ctx, i.ID)
	if err != nil {
		return err
	}
	w.Header().Set("Location", URLFor("instances", i.ID))
	WriteJSON(w, http.StatusCreated, s.serializeInstance(s.NewSerCtx(r, true), fresh))
	return nil
}

// instanceFromForm validates InstanceSerializer's writable fields onto i;
// existing is the stored instance for updates.
func (s *Server) instanceFromForm(ctx context.Context, f *Form, i *instance, existing *instance) {
	k8s := s.isK8s(ctx)
	if f.Has("hostname") || !f.Partial {
		h := f.String("hostname", true, 250, i.Hostname)
		if f.Has("hostname") && !f.Errs.Has("hostname") {
			var taken bool
			var exclude int64
			if existing != nil {
				exclude = existing.ID
			}
			_ = db.Tolerant(s.Q()).QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM main_instance WHERE hostname = $1 AND id <> $2)`, h, exclude).Scan(&taken)
			switch {
			case taken:
				f.Errs.Add("hostname", "instance with this hostname already exists.")
			case localhostRe.MatchString(h):
				f.Errs.Add("hostname", "hostname cannot be localhost or 127.0.0.1")
			case !hostnameRe.MatchString(h):
				f.Errs.Add("hostname", "Enter a valid value.")
			case existing != nil && existing.Hostname != h:
				f.Errs.Add("hostname", "Cannot change hostname.")
			default:
				i.Hostname = h
			}
		}
	}
	zero := 0.0
	i.CapacityAdjustment = decimalField(f, "capacity_adjustment", i.CapacityAdjustment, 3, 2, &zero)
	i.Enabled = f.Bool("enabled", i.Enabled)
	i.ManagedByPolicy = f.Bool("managed_by_policy", i.ManagedByPolicy)
	if f.Has("node_type") {
		v := f.Choice("node_type", i.NodeType, instanceNodeTypes, false)
		if !f.Errs.Has("node_type") {
			switch {
			case existing == nil && v != "hop" && v != "execution":
				f.Errs.Add("node_type", "Can only create execution or hop nodes.")
			case existing != nil && existing.NodeType != v:
				f.Errs.Add("node_type", "Cannot change node type.")
			default:
				i.NodeType = v
			}
		}
	}
	if f.Has("node_state") {
		v := f.Choice("node_state", i.NodeState, instanceNodeStates, false)
		if !f.Errs.Has("node_state") {
			msg := ""
			if existing != nil {
				if v != existing.NodeState {
					// Beyond the old rules, an instance the heartbeat lost
					// may be deprovisioned on any platform and whatever its
					// type, so that it can be removed.
					lost := models.LostAndUnavailable(existing.NodeState, existing.LastSeen, existing.NodeType, time.Now())
					switch {
					case !k8s && !lost:
						msg = "Can only change the state on Kubernetes or OpenShift."
					case v != "deprovisioning":
						msg = "Can only change instances to the 'deprovisioning' state."
					case existing.Managed && !lost:
						msg = "Cannot deprovision managed nodes."
					default:
						var groups []string
						_ = db.Tolerant(s.Q()).QueryRow(ctx, `SELECT COALESCE(array_agg(name ORDER BY name), '{}') FROM main_instancegroup WHERE mesh_node_id = $1`, existing.ID).Scan(&groups)
						if len(groups) > 0 {
							msg = fmt.Sprintf("Cannot deprovision a node that runs the pods of these container groups: %s.", strings.Join(groups, ", "))
						}
					}
				}
			} else if v != "" && v != "installed" {
				msg = "Can only create instances in the 'installed' state."
			}
			if msg != "" {
				f.Errs.Add("node_state", msg)
			} else {
				i.NodeState = v
			}
		}
	}
	if raw, ok := f.Raw("peers"); ok {
		ids, msg := s.peerIDs(ctx, raw)
		if msg == "" {
			msg = s.validatePeers(ctx, ids, existing, k8s)
		}
		if msg != "" {
			f.Errs.Add("peers", msg)
		} else {
			i.Peers = ids
		}
	}
	if raw, ok := f.Raw("listener_port"); ok {
		var port *int64
		if raw != nil {
			v := f.Int("listener_port", 0, nil, nil)
			port = &v
		}
		if !f.Errs.Has("listener_port") {
			if existing != nil {
				cur := existing.ListenerPort
				switch {
				case port != nil && *port != 0 && cur != nil && *cur != *port:
					f.Errs.Add("listener_port", "Cannot change listener port.")
				case existing.Managed && !sameIntPtr(port, cur):
					f.Errs.Add("listener_port", "Cannot change listener port for managed nodes.")
				}
			}
			if !f.Errs.Has("listener_port") {
				i.ListenerPort = port
			}
		}
	}
	if f.Has("peers_from_control_nodes") {
		v := f.Bool("peers_from_control_nodes", i.PeersFromControl)
		if !f.Errs.Has("peers_from_control_nodes") {
			if existing != nil && existing.Managed && existing.PeersFromControl != v {
				f.Errs.Add("peers_from_control_nodes", "Cannot change peers_from_control_nodes for managed nodes.")
			} else {
				i.PeersFromControl = v
			}
		}
	}
	if len(f.Errs) > 0 {
		return
	}
	if f.Has("peers_from_control_nodes") && i.PeersFromControl {
		raw, sent := f.Raw("listener_port")
		if (sent && raw == nil) || (!sent && (existing == nil || existing.ListenerPort == nil)) {
			f.Errs.Add("__all__", "Cannot enable peers_from_control_nodes if listener_port is not set.")
		}
	}
}

func sameIntPtr(a, b *int64) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	return *a == *b
}

// peerIDs reads the peers list of receptor address keys.
func (s *Server) peerIDs(ctx context.Context, raw any) ([]int64, string) {
	items, ok := raw.([]any)
	if !ok {
		return nil, fmt.Sprintf("Expected a list of items but got type \"%s\".", pyTypeName(raw))
	}
	out := []int64{}
	for _, it := range items {
		id, ok := integerOf(it)
		if !ok {
			return nil, "Incorrect type. Expected pk value, received " + pyTypeName(it) + "."
		}
		if !s.existsIn(ctx, "main_receptoraddress")(id) {
			return nil, fmt.Sprintf("Invalid pk \"%d\" - object does not exist.", id)
		}
		out = append(out, id)
	}
	return out, ""
}

// validatePeers is InstanceSerializer.validate_peers.
func (s *Server) validatePeers(ctx context.Context, ids []int64, existing *instance, k8s bool) string {
	seen := map[int64]bool{}
	for _, id := range ids {
		owner := colOf[int64](ctx, s.Q(), "main_receptoraddress", "instance_id", id)
		if seen[owner] {
			return "Cannot peer to the same instance more than once."
		}
		seen[owner] = true
	}
	if existing == nil {
		return ""
	}
	want := map[int64]bool{}
	for _, id := range ids {
		want[id] = true
	}
	changed := len(want) != len(existing.Peers)
	for _, id := range existing.Peers {
		if !want[id] {
			changed = true
		}
	}
	if !k8s && changed {
		return "Cannot change peers."
	}
	if existing.Managed && changed {
		return "Setting peers manually for managed nodes is not allowed."
	}
	for id := range want {
		owner := colOf[int64](ctx, s.Q(), "main_receptoraddress", "instance_id", id)
		if owner == existing.ID {
			return "Instance cannot peer to its own address."
		}
	}
	for id := range want {
		var host string
		var already bool
		_ = db.Tolerant(s.Q()).QueryRow(ctx, `SELECT i.hostname, EXISTS (SELECT 1 FROM main_instancelink l JOIN main_receptoraddress mine ON mine.id = l.target_id WHERE l.source_id = i.id AND mine.instance_id = $2)
			FROM main_receptoraddress ra JOIN main_instance i ON i.id = ra.instance_id WHERE ra.id = $1`, id, existing.ID).Scan(&host, &already)
		if already {
			return fmt.Sprintf("Instance %s is already peered to this instance.", host)
		}
	}
	return ""
}

// instanceChanges is model_to_dict over the serializer's writable model
// fields.
func instanceChanges(i *instance) map[string]any {
	return map[string]any{"hostname": i.Hostname, "capacity_adjustment": i.CapacityAdjustment, "enabled": i.Enabled, "managed_by_policy": i.ManagedByPolicy,
		"node_type": i.NodeType, "node_state": i.NodeState, "id": i.ID}
}

// capacityValue is Instance.set_capacity_value.
func capacityValue(i *instance) int64 {
	if !i.Enabled || i.NodeType == "hop" {
		return 0
	}
	lo, hi := i.MemCapacity, i.CPUCapacity
	if lo > hi {
		lo, hi = hi, lo
	}
	adj, ok := new(big.Rat).SetString(i.CapacityAdjustment)
	if !ok {
		adj = big.NewRat(1, 1)
	}
	v := new(big.Rat).Mul(big.NewRat(hi-lo, 1), adj)
	v.Add(v, big.NewRat(lo, 1))
	n := new(big.Int).Quo(v.Num(), v.Denom())
	return n.Int64()
}

func (s *Server) instanceUpdate(w http.ResponseWriter, r *http.Request) error {
	u, err := RequireWrite(r)
	if err != nil {
		return err
	}
	cur, err := s.instanceFromPath(r, u)
	if err != nil {
		return err
	}
	if !u.IsSuperuser {
		return ErrForbidden
	}
	ctx := r.Context()
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	// update_raw_data dropped node_type, hostname and ip_address from the
	// browsable form only; the API still validated them.
	existing := *cur
	i := &existing
	f := NewForm(body, r.Method == http.MethodPatch)
	s.instanceFromForm(ctx, f, i, cur)
	if err := f.Err(); err != nil {
		return err
	}
	before := instanceChanges(cur)
	policyChanged := cur.ManagedByPolicy != i.ManagedByPolicy || cur.Hostname != i.Hostname || cur.CapacityAdjustment != i.CapacityAdjustment
	_, portSent := f.Raw("listener_port")
	_, pfcSent := f.Raw("peers_from_control_nodes")
	_, peersSent := f.Raw("peers")
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if changes := diffChanges(before, instanceChanges(i)); len(changes) > 0 {
			if err := s.Activity.Record(ctx, tx, activity.Entry{Operation: "update", Object1: "instance", Changes: changes, ActorID: &u.ID, Links: map[string]int64{"instance": i.ID}}); err != nil {
				return err
			}
		}
		if err := tx.QueryRow(ctx, `UPDATE main_instance SET hostname = $2, capacity_adjustment = $3::numeric, enabled = $4, managed_by_policy = $5, node_type = $6, node_state = $7, modified = now() WHERE id = $1 RETURNING modified`,
			i.ID, i.Hostname, i.CapacityAdjustment, i.Enabled, i.ManagedByPolicy, i.NodeType, i.NodeState).Scan(&i.Modified); err != nil {
			return err
		}
		if peersSent {
			if _, err := tx.Exec(ctx, `DELETE FROM main_instancelink WHERE source_id = $1 AND NOT (target_id = ANY($2))`, i.ID, i.Peers); err != nil {
				return err
			}
			for _, t := range i.Peers {
				if _, err := tx.Exec(ctx, `INSERT INTO main_instancelink (source_id, target_id, link_state) SELECT $1, $2, 'adding' WHERE NOT EXISTS (SELECT 1 FROM main_instancelink WHERE source_id = $1 AND target_id = $2)`, i.ID, t); err != nil {
					return err
				}
			}
		}
		// create_or_update: the canonical receptor address follows
		// listener_port and peers_from_control_nodes.
		if portSent && i.ListenerPort == nil {
			if _, err := tx.Exec(ctx, `DELETE FROM main_receptoraddress WHERE instance_id = $1 AND address = $2`, i.ID, i.Hostname); err != nil {
				return err
			}
		}
		var canonicalPort *int32
		_ = db.Tolerant(tx).QueryRow(ctx, `SELECT port FROM main_receptoraddress WHERE instance_id = $1 AND canonical ORDER BY id LIMIT 1`, i.ID).Scan(&canonicalPort)
		if (portSent && i.ListenerPort != nil) || canonicalPort != nil {
			sets := []string{}
			args := []any{i.ID, i.Hostname}
			if portSent && i.ListenerPort != nil {
				args = append(args, *i.ListenerPort)
				sets = append(sets, fmt.Sprintf("port = $%d", len(args)))
			}
			if pfcSent {
				args = append(args, i.PeersFromControl)
				sets = append(sets, fmt.Sprintf("peers_from_control_nodes = $%d", len(args)))
			}
			if len(sets) > 0 {
				sets = append(sets, "canonical = true")
				tag, err := tx.Exec(ctx, `UPDATE main_receptoraddress SET `+strings.Join(sets, ", ")+` WHERE instance_id = $1 AND address = $2`, args...)
				if err != nil {
					return err
				}
				if tag.RowsAffected() == 0 {
					port := int64(27199)
					if portSent && i.ListenerPort != nil {
						port = *i.ListenerPort
					}
					if _, err := tx.Exec(ctx, `INSERT INTO main_receptoraddress (address, port, websocket_path, protocol, is_internal, canonical, peers_from_control_nodes, instance_id) VALUES ($2, $3, '', 'tcp', false, true, $4, $1)`,
						i.ID, i.Hostname, port, pfcSent && i.PeersFromControl); err != nil {
						return err
					}
				}
			}
		}
		// InstanceDetail.update: the capacity follows the adjustment.
		if c := capacityValue(i); c != cur.Capacity {
			if _, err := tx.Exec(ctx, `UPDATE main_instance SET capacity = $2 WHERE id = $1`, i.ID, c); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return err
	}
	if policyChanged {
		s.schedulePolicy()
	}
	// on_instance_saved: a hop or execution node being deprovisioned has
	// its links taken down; the task process removes it once no job runs
	// on it (remove_deprovisioned_node). A lost node can be deprovisioned
	// off Kubernetes too, so this no longer depends on the platform.
	if i.NodeState == "deprovisioning" && cur.NodeState != "deprovisioning" && (i.NodeType == "hop" || i.NodeType == "execution") {
		if _, err := s.Q().Exec(ctx, `UPDATE main_instancelink SET link_state = 'removing' WHERE source_id = $1 OR target_id IN (SELECT id FROM main_receptoraddress WHERE instance_id = $1)`, i.ID); err != nil {
			return err
		}
	}
	fresh, err := s.loadInstanceCtx(ctx, i.ID)
	if err != nil {
		return err
	}
	WriteJSON(w, 200, s.serializeInstance(s.NewSerCtx(r, true), fresh))
	return nil
}

// RemoveDeprovisionedInstances is remove_deprovisioned_node for every node
// being deprovisioned that no job runs, waits on or is controlled by any
// more: the node goes, with its links and addresses, and the cluster
// policy is recomputed. Only a hop or execution node on Kubernetes is
// deprovisioned while it is up; any other was deprovisioned because the
// heartbeat lost it, and if it has checked in since, it is not removed
// but made unavailable again, for its next health check to make ready.
func (s *Server) RemoveDeprovisionedInstances(ctx context.Context) error {
	k8s := s.isK8s(ctx)
	rows, err := s.Q().Query(ctx, `SELECT i.id FROM main_instance i WHERE i.node_state = 'deprovisioning'
		AND NOT EXISTS (SELECT 1 FROM main_unifiedjob uj WHERE (uj.execution_node = i.hostname OR uj.controller_node = i.hostname) AND uj.status IN ('running', 'waiting')) ORDER BY i.id`)
	if err != nil {
		return err
	}
	var ids []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return err
		}
		ids = append(ids, id)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	for _, id := range ids {
		i, err := s.loadInstanceCtx(ctx, id)
		if err != nil || i == nil {
			continue
		}
		upOnK8s := k8s && (i.NodeType == "hop" || i.NodeType == "execution")
		if !upOnK8s && !models.InstanceLost(i.LastSeen, i.NodeType, time.Now()) {
			if _, err := s.Q().Exec(ctx, `UPDATE main_instance SET node_state = 'unavailable' WHERE id = $1 AND node_state = 'deprovisioning'`, id); err != nil {
				return err
			}
			s.Log.InfoContext(ctx, "deprovisioned instance checked in again; left in place", "hostname", i.Hostname)
			continue
		}
		err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
			if err := s.Activity.Record(ctx, tx, activity.Entry{Operation: "delete", Object1: "instance", Changes: instanceChanges(i)}); err != nil {
				return err
			}
			return s.Cascade.Delete(ctx, tx, "main_instance", "id", []int64{id})
		})
		if err != nil {
			return err
		}
		s.Log.InfoContext(ctx, "removed deprovisioned instance", "hostname", i.Hostname)
	}
	if len(ids) > 0 {
		s.schedulePolicy()
	}
	return nil
}

// RemoveLostInstance deletes a node the heartbeat lost, as
// cluster_node_heartbeat did for a control node where instances are
// deprovisioned automatically (ASCENDER_AUTO_DEPROVISION_INSTANCES, on
// Kubernetes): a pod that is gone does not come back under its name, and
// its row would otherwise stay listed for ever.
//
// The caller decided from a list read earlier, so the node is looked at
// again here, with its row locked against its own heartbeat: one that has
// checked in since is left alone, and so is one that registered less than
// the lost period ago and has not had the time to check in at all (a pod
// starting while another node's heartbeat runs). It reports whether the
// node was removed.
func (s *Server) RemoveLostInstance(ctx context.Context, id int64) (bool, error) {
	i, err := s.loadInstanceCtx(ctx, id)
	if err != nil || i == nil {
		return false, err
	}
	removed := false
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		removed = false
		var lastSeen *time.Time
		var created time.Time
		var nodeType string
		if err := tx.QueryRow(ctx, `SELECT last_seen, created, node_type FROM main_instance WHERE id = $1 FOR UPDATE`, id).Scan(&lastSeen, &created, &nodeType); err != nil {
			if db.IsNoRows(err) {
				return nil
			}
			return err
		}
		now := time.Now()
		if !models.InstanceLost(lastSeen, nodeType, now) {
			return nil
		}
		if lastSeen == nil && !models.InstanceLost(&created, nodeType, now) {
			return nil
		}
		if err := s.Activity.Record(ctx, tx, activity.Entry{Operation: "delete", Object1: "instance", Changes: instanceChanges(i)}); err != nil {
			return err
		}
		removed = true
		return s.Cascade.Delete(ctx, tx, "main_instance", "id", []int64{id})
	})
	if err != nil || !removed {
		return false, err
	}
	s.schedulePolicy()
	return true, nil
}

// --- sub-lists --------------------------------------------------------------

func (s *Server) instanceJobs(w http.ResponseWriter, r *http.Request) error {
	u, err := RequireUser(r)
	if err != nil {
		return err
	}
	i, err := s.instanceFromPath(r, u)
	if err != nil {
		return err
	}
	return s.unifiedJobListWith(w, r, func(q *Query) { q.And("uj.execution_node = " + q.Arg(i.Hostname)) })
}

func (s *Server) instanceInstanceGroups(w http.ResponseWriter, r *http.Request) error {
	u, err := RequireUser(r)
	if err != nil {
		return err
	}
	i, err := s.instanceFromPath(r, u)
	if err != nil {
		return err
	}
	return s.instanceGroupListWith(w, r, s.instanceGroupSpec(), func(q *Query) {
		q.And("g.id IN (SELECT gi.instancegroup_id FROM main_instancegroup_instances gi WHERE gi.instance_id = " + q.Arg(i.ID) + ")")
	})
}

// instanceInstanceGroupsAttach is InstanceInstanceGroupsList's POST: a
// SubListCreateAttachDetachAPIView over rampart_groups with
// InstanceGroupMembershipMixin.
func (s *Server) instanceInstanceGroupsAttach(w http.ResponseWriter, r *http.Request) error {
	u, err := RequireWrite(r)
	if err != nil {
		return err
	}
	inst, err := s.instanceFromPath(r, u)
	if err != nil {
		return err
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	ctx := r.Context()
	detach := isDetach(body)
	if detach {
		raw, _ := body.Get("id")
		if raw == nil || raw == false || raw == "" || raw == json.Number("0") {
			return &APIError{Status: http.StatusBadRequest, Body: map[string]any{"msg": `"id" is required to disassociate`}}
		}
	}
	raw, _ := body.Get("id")
	if raw != nil && raw != false && raw != "" && raw != json.Number("0") {
		if _, ok := integerOf(raw); !ok {
			return &APIError{Status: http.StatusBadRequest, Body: map[string]any{"msg": `"id" field must be an integer.`}}
		}
	}
	gid, hasID := integerOf(raw)
	if !hasID || gid == 0 {
		// No id: create the group, attach it, and fail as the mixin did,
		// which looked the new group up by the request's (absent) id; the
		// request's transaction was rolled back.
		if !u.IsSuperuser {
			return ErrForbidden
		}
		g := &instanceGroup{PolicyInstanceList: []string{}}
		f := NewForm(body, false)
		s.igFromForm(ctx, f, g, nil)
		if err := f.Err(); err != nil {
			return err
		}
		_, controlQueue := s.queueNames(ctx)
		if msg := membershipError(inst, g, controlQueue, false); msg != "" {
			return &APIError{Status: http.StatusBadRequest, Body: map[string]any{"msg": msg}}
		}
		return BadRequest("InstanceGroup matching query does not exist.")
	}
	g, err := s.loadInstanceGroupCtx(ctx, gid)
	if err != nil {
		return err
	}
	if g == nil {
		return BadRequest("InstanceGroup matching query does not exist.")
	}
	// InstanceAccess.can_attach / can_unattach: superusers only.
	if !u.IsSuperuser {
		return ErrForbidden
	}
	_, controlQueue := s.queueNames(ctx)
	if msg := membershipError(inst, g, controlQueue, detach); msg != "" {
		return &APIError{Status: http.StatusBadRequest, Body: map[string]any{"msg": msg}}
	}
	if err := s.changeMembership(ctx, u, g, inst, detach, "instance"); err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// instanceHealthCheckObject is InstanceHealthCheck.get_object: only
// execution nodes, for system administrators and auditors.
func (s *Server) instanceHealthCheckObject(r *http.Request, u *auth.User) (*instance, error) {
	if !u.IsSuperuser && !(u.IsSystemAuditor && r.Method == http.MethodGet) {
		return nil, ErrForbidden
	}
	id, err := PathID(r)
	if err != nil {
		return nil, NotFoundFor("Instance")
	}
	i, err := s.loadInstanceCtx(r.Context(), id)
	if err != nil {
		return nil, err
	}
	if i == nil || i.NodeType != "execution" {
		return nil, NotFoundFor("Instance")
	}
	return i, nil
}

func (s *Server) instanceHealthCheck(w http.ResponseWriter, r *http.Request) error {
	u, err := RequireUser(r)
	if err != nil {
		return err
	}
	i, err := s.instanceHealthCheckObject(r, u)
	if err != nil {
		return err
	}
	o := NewOMap().Set("uuid", i.UUID).Set("hostname", i.Hostname).Set("ip_address", i.IPAddress).Set("version", i.Version).Set("last_health_check", models.FormatTimePtr(i.LastHealthCheck))
	o.Set("errors", i.Errors).Set("cpu", i.CPU).Set("memory", i.Memory).Set("cpu_capacity", i.CPUCapacity).Set("mem_capacity", i.MemCapacity).Set("capacity", i.Capacity)
	WriteJSON(w, 200, o)
	return nil
}

// instanceHealthCheckRun starts a health check: the start time is
// recorded and the task process checks the node over the receptor mesh
// (execution_node_health_check).
func (s *Server) instanceHealthCheckRun(w http.ResponseWriter, r *http.Request) error {
	u, err := RequireWrite(r)
	if err != nil {
		return err
	}
	i, err := s.instanceHealthCheckObject(r, u)
	if err != nil {
		return err
	}
	if i.HealthCheckStarted != nil && (i.LastHealthCheck == nil || i.HealthCheckStarted.After(*i.LastHealthCheck)) {
		WriteJSON(w, 200, NewOMap().Set("msg", fmt.Sprintf("Health check was already in progress for %s.", i.Hostname)))
		return nil
	}
	if _, err := s.Q().Exec(r.Context(), `UPDATE main_instance SET health_check_started = now() WHERE id = $1`, i.ID); err != nil {
		return err
	}
	s.Notify(r.Context(), fmt.Sprintf(`{"type":"health_check","id":%d}`, i.ID))
	WriteJSON(w, 200, NewOMap().Set("msg", fmt.Sprintf("Health check is running for %s.", i.Hostname)))
	return nil
}

func (s *Server) instanceInstallBundle(w http.ResponseWriter, r *http.Request) error {
	u, err := RequireUser(r)
	if err != nil {
		return err
	}
	// Every download signs a fresh receptor certificate and key with the
	// mesh CA: a node identity, not something to read. The old view let a
	// system auditor have one too; only a superuser may.
	if !u.IsSuperuser {
		return ErrForbidden
	}
	id, err := PathID(r)
	if err != nil {
		return NotFoundFor("Instance")
	}
	i, err := s.loadInstanceCtx(r.Context(), id)
	if err != nil {
		return err
	}
	if i == nil {
		return NotFoundFor("Instance")
	}
	if i.NodeType != "execution" && i.NodeType != "hop" {
		return &APIError{Status: http.StatusBadRequest, Body: map[string]any{"msg": "Install bundle can only be generated for execution or hop nodes."}}
	}
	// The mesh CA and the work signing key live with receptor
	// (ASCENDER_RECEPTOR_DIR); without them the old view failed too.
	data, err := s.writeInstallBundle(r.Context(), i)
	if err != nil {
		return err
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Content-Disposition", "attachment; filename="+i.Hostname+"_install_bundle.tar.gz")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
	return nil
}

// --- receptor addresses -----------------------------------------------------

type receptorAddress struct {
	ID                    int64
	Address               string
	Port                  *int64
	WebsocketPath         string
	Protocol              string
	IsInternal, Canonical bool
	PeersFromControl      bool
	InstanceID            int64
}

const receptorAddressColumns = `ra.id, ra.address, ra.port, ra.websocket_path, ra.protocol, ra.is_internal, ra.canonical, ra.peers_from_control_nodes, ra.instance_id`

func scanReceptorAddress(rows pgx.Rows) (any, error) {
	a := &receptorAddress{}
	var port *int32
	err := rows.Scan(&a.ID, &a.Address, &port, &a.WebsocketPath, &a.Protocol, &a.IsInternal, &a.Canonical, &a.PeersFromControl, &a.InstanceID)
	if port != nil {
		p := int64(*port)
		a.Port = &p
	}
	return a, err
}

func serializeReceptorAddress(a *receptorAddress) *OMap {
	return NewOMap().Set("id", a.ID).Set("url", URLFor("receptor_addresses", a.ID)).Set("address", a.Address).Set("port", models.NullableID(a.Port)).Set("protocol", a.Protocol).Set("websocket_path", a.WebsocketPath).
		Set("is_internal", a.IsInternal).Set("canonical", a.Canonical).Set("instance", a.InstanceID).Set("peers_from_control_nodes", a.PeersFromControl).Set("full_address", fullAddress(a.Address, a.Port, a.Protocol, a.WebsocketPath))
}

// receptorAddressAccess: addresses of instances the user can see.
func (s *Server) receptorAddressAccess(q *Query, u *auth.User) {
	q.And("ra.instance_id IN (SELECT gi.instance_id FROM main_instancegroup_instances gi WHERE gi.instancegroup_id IN (" + accessibleSQL(q, u.ID, s.CT.ID("main.instancegroup"), "read_role") + "))")
}

func (s *Server) receptorAddressListWith(w http.ResponseWriter, r *http.Request, extra func(q *Query)) error {
	spec := ListSpec{Model: "ReceptorAddress", From: "main_receptoraddress ra", Columns: receptorAddressColumns, PK: "ra.id", Fields: receptorAddressFieldSet("ra"), DefaultOrder: []string{"id"}, Access: s.receptorAddressAccess}
	rows, count, page, err := s.RunList(r, spec, extra, scanReceptorAddress)
	if err != nil {
		return err
	}
	results := make([]any, 0, len(rows))
	for _, row := range rows {
		results = append(results, serializeReceptorAddress(row.(*receptorAddress)))
	}
	WriteJSON(w, 200, Paginate(r, page, count, results))
	return nil
}

func (s *Server) receptorAddressList(w http.ResponseWriter, r *http.Request) error {
	return s.receptorAddressListWith(w, r, nil)
}

func (s *Server) receptorAddressDetail(w http.ResponseWriter, r *http.Request) error {
	u, err := RequireUser(r)
	if err != nil {
		return err
	}
	id, err := PathID(r)
	if err != nil {
		return NotFoundFor("ReceptorAddress")
	}
	rows, err := s.Q().Query(r.Context(), `SELECT `+receptorAddressColumns+` FROM main_receptoraddress ra WHERE ra.id = $1`, id)
	if err != nil {
		return err
	}
	var a *receptorAddress
	if rows.Next() {
		v, err := scanReceptorAddress(rows)
		if err != nil {
			rows.Close()
			return err
		}
		a = v.(*receptorAddress)
	}
	rows.Close()
	if a == nil {
		return NotFoundFor("ReceptorAddress")
	}
	if !s.instanceReadable(r.Context(), u, a.InstanceID) {
		return ErrForbidden
	}
	WriteJSON(w, 200, serializeReceptorAddress(a))
	return nil
}

func (s *Server) instancePeers(w http.ResponseWriter, r *http.Request) error {
	u, err := RequireUser(r)
	if err != nil {
		return err
	}
	i, err := s.instanceFromPath(r, u)
	if err != nil {
		return err
	}
	return s.receptorAddressListWith(w, r, func(q *Query) {
		q.And("ra.id IN (SELECT l.target_id FROM main_instancelink l WHERE l.source_id = " + q.Arg(i.ID) + ")")
	})
}

func (s *Server) instanceReceptorAddresses(w http.ResponseWriter, r *http.Request) error {
	u, err := RequireUser(r)
	if err != nil {
		return err
	}
	i, err := s.instanceFromPath(r, u)
	if err != nil {
		return err
	}
	return s.receptorAddressListWith(w, r, func(q *Query) { q.And("ra.instance_id = " + q.Arg(i.ID)) })
}

// --- mesh visualizer --------------------------------------------------------

func (s *Server) meshVisualizer(w http.ResponseWriter, r *http.Request) error {
	u, err := RequireUser(r)
	if err != nil {
		return err
	}
	if !u.IsSuperuser && !u.IsSystemAuditor {
		return ErrForbidden
	}
	ctx := r.Context()
	nodes := []any{}
	rows, err := s.Q().Query(ctx, `SELECT id, hostname, node_type, node_state, enabled FROM main_instance ORDER BY hostname`)
	if err != nil {
		return err
	}
	for rows.Next() {
		var id int64
		var host, typ, state string
		var enabled bool
		if err := rows.Scan(&id, &host, &typ, &state, &enabled); err != nil {
			rows.Close()
			return err
		}
		nodes = append(nodes, NewOMap().Set("id", id).Set("hostname", host).Set("node_type", typ).Set("node_state", state).Set("enabled", enabled))
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	WriteJSON(w, 200, NewOMap().Set("nodes", nodes).Set("links", s.instanceLinks(ctx, "true")))
	return nil
}
