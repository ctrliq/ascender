package tasks

import (
	"context"
	"encoding/json"
	"github.com/ctrliq/ascender/internal/models"
	"time"
)

// The task manager's capacity rules (TaskManagerInstances,
// TaskManagerInstanceGroups and process_pending_tasks): a task needs a
// control instance with room for its control cost, then the first
// preferred instance group with room (max_concurrent_jobs, max_forks)
// and, in a group of instances, an instance with room for the task's
// impact or an idle one. Waiting and running tasks consume capacity on
// their execution and controller nodes. This task process controls work
// on its own node only, and executes it there or, through its receptor,
// on execution nodes of the mesh, so those are the instances it fits
// tasks to.

// controlTaskImpact is ASCENDER_CONTROL_NODE_TASK_IMPACT.
const controlTaskImpact = 1

// queueNames are DEFAULT_EXECUTION_QUEUE_NAME and
// DEFAULT_CONTROL_PLANE_QUEUE_NAME, their defaults when unset.
func (d *Dispatcher) queueNames(ctx context.Context) (execQueue, controlQueue string) {
	return models.QueueNames(d.Settings.String(ctx, "DEFAULT_EXECUTION_QUEUE_NAME"), d.Settings.String(ctx, "DEFAULT_CONTROL_PLANE_QUEUE_NAME"))
}

// needsCapacityExplanation is task_needs_capacity's job explanation.
const needsCapacityExplanation = "This job is not ready to start because there is not enough available capacity."

type tmInstance struct {
	hostname, nodeType string
	capacity, consumed int64
	jobs               int64
	// reachable: this task runner can run work there (its own node, or
	// an execution node over the mesh).
	reachable bool
}

func (i *tmInstance) remaining() int64 {
	if r := i.capacity - i.consumed; r > 0 {
		return r
	}
	return 0
}

type tmGroup struct {
	id                int64
	name              string
	containerGroup    bool
	maxJobs, maxForks int64
	instances         []*tmInstance
	cgJobs, cgForks   int64
	meshNode          bool
	meshReady         bool
	meshHost          string
	// meshReachable: this runner has a receptor to reach the mesh node by.
	meshReachable bool
}

func (g *tmGroup) jobsRunning() int64 {
	if g.containerGroup {
		return g.cgJobs
	}
	var n int64
	for _, i := range g.instances {
		n += i.jobs
	}
	return n
}

func (g *tmGroup) consumedCapacity() int64 {
	if g.containerGroup {
		return g.cgForks
	}
	var n int64
	for _, i := range g.instances {
		n += i.consumed
	}
	return n
}

// hasRemainingCapacity is TaskManagerInstanceGroup.has_remaining_capacity:
// the group's job and fork limits (0 for none), and a mesh node that must
// be up.
func (g *tmGroup) hasRemainingCapacity(impact, jobImpact int64) bool {
	if g.meshNode && !g.meshReady {
		return false
	}
	if g.maxJobs > 0 && g.maxJobs-g.jobsRunning()-jobImpact < 0 {
		return false
	}
	if g.maxForks > 0 && g.maxForks-g.consumedCapacity()-impact < 0 {
		return false
	}
	return true
}

type taskManagerState struct {
	instances map[string]*tmInstance
	groups    map[int64]*tmGroup
	byName    map[string]*tmGroup
}

// loadTaskManagerState reads the ready instances, the groups and what the
// waiting and running tasks (but the one being placed) consume.
func (d *Dispatcher) loadTaskManagerState(ctx context.Context, exclude int64) (*taskManagerState, error) {
	st := &taskManagerState{instances: map[string]*tmInstance{}, groups: map[int64]*tmGroup{}, byName: map[string]*tmGroup{}}
	mesh := d.meshAvailable()
	rows, err := d.DB.Pool.Query(ctx, `SELECT hostname, node_type, capacity FROM main_instance WHERE hostname IS NOT NULL AND node_state = 'ready' AND enabled AND node_type <> 'hop'`)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		i := &tmInstance{}
		if err := rows.Scan(&i.hostname, &i.nodeType, &i.capacity); err != nil {
			rows.Close()
			return nil, err
		}
		i.reachable = i.hostname == d.Cfg.ClusterHostID || (mesh && i.nodeType == "execution")
		st.instances[i.hostname] = i
	}
	rows.Close()
	rows, err = d.DB.Pool.Query(ctx, `SELECT g.id, g.name, g.is_container_group, g.max_concurrent_jobs, g.max_forks, g.mesh_node_id IS NOT NULL,
		COALESCE(m.enabled AND m.node_state = 'ready', false), COALESCE(m.hostname, ''),
		COALESCE((SELECT array_agg(i.hostname) FROM main_instancegroup_instances gi JOIN main_instance i ON i.id = gi.instance_id WHERE gi.instancegroup_id = g.id), '{}')
		FROM main_instancegroup g LEFT JOIN main_instance m ON m.id = g.mesh_node_id`)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		g := &tmGroup{}
		var hosts []string
		if err := rows.Scan(&g.id, &g.name, &g.containerGroup, &g.maxJobs, &g.maxForks, &g.meshNode, &g.meshReady, &g.meshHost, &hosts); err != nil {
			rows.Close()
			return nil, err
		}
		if !g.containerGroup {
			g.meshNode, g.meshHost = false, ""
		}
		g.meshReachable = mesh
		for _, h := range hosts {
			if i, ok := st.instances[h]; ok {
				g.instances = append(g.instances, i)
			}
		}
		st.groups[g.id] = g
		st.byName[g.name] = g
	}
	rows.Close()
	rows, err = d.DB.Pool.Query(ctx, `SELECT COALESCE(execution_node, ''), COALESCE(controller_node, ''), task_impact, instance_group_id FROM main_unifiedjob
		WHERE status IN ('waiting', 'running') AND id <> $1 AND polymorphic_ctype_id <> $2`, exclude, d.CT.ID("main.workflowjob"))
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var exec, ctrl string
		var impact int64
		var ig *int64
		if err := rows.Scan(&exec, &ctrl, &impact, &ig); err != nil {
			rows.Close()
			return nil, err
		}
		if ig != nil {
			if g := st.groups[*ig]; g != nil && g.containerGroup {
				g.cgJobs++
				g.cgForks += impact
			}
		}
		// TaskManagerInstances.consume_capacity
		e, c := st.instances[exec], st.instances[ctrl]
		if e != nil && (e.nodeType == "hybrid" || e.nodeType == "execution") {
			e.consumed += impact
			e.jobs++
		}
		if c != nil && (c.nodeType == "hybrid" || c.nodeType == "control") {
			c.consumed += controlTaskImpact
			if c != e {
				c.jobs++
			}
		}
	}
	rows.Close()
	return st, rows.Err()
}

// fit is fit_task_to_most_remaining_capacity_instance over the instances
// this runner reaches: the one left with the most room (the fewer jobs on
// a tie).
func (d *Dispatcher) fit(g *tmGroup, impact int64, capacityType string, hybridControlCost bool) *tmInstance {
	if g == nil {
		return nil
	}
	var best *tmInstance
	var most int64 = -1
	for _, i := range g.instances {
		if !i.reachable || (i.nodeType != capacityType && i.nodeType != "hybrid") {
			continue
		}
		left := i.remaining() - impact
		if hybridControlCost && i.nodeType == "hybrid" {
			left -= controlTaskImpact
		}
		if left >= 0 && (best == nil || left > most || (left == most && i.jobs < best.jobs)) {
			best, most = i, left
		}
	}
	return best
}

// largestIdle is find_largest_idle_instance over the instances this
// runner reaches: an instance running nothing takes a task bigger than
// its capacity.
func (d *Dispatcher) largestIdle(g *tmGroup, capacityType string) *tmInstance {
	var largest *tmInstance
	for _, i := range g.instances {
		if !i.reachable || (i.nodeType != capacityType && i.nodeType != "hybrid") || i.capacity <= 0 {
			continue
		}
		if i.jobs == 0 || i.remaining() == i.capacity {
			if largest == nil || i.capacity > largest.capacity {
				largest = i
			}
		}
	}
	return largest
}

// nativeInventoryUpdate is whether a task is an inventory update of a
// source the task process fetches itself (models.NativeInventorySources).
// It takes control capacity, like a project update: it needs no execution
// node, and waiting on one when the execution group is full would hold up
// a fetch the control plane can do now.
func (d *Dispatcher) nativeInventoryUpdate(ctx context.Context, id, ctype int64) bool {
	if ctype != d.CT.ID("main.inventoryupdate") {
		return false
	}
	var source string
	if err := d.DB.Pool.QueryRow(ctx, `SELECT source FROM main_inventoryupdate WHERE unifiedjob_ptr_id = $1`, id).Scan(&source); err != nil {
		return false
	}
	return models.NativeInventorySources[source]
}

// placeTask chooses where a claimed task runs and records the instance
// group, execution node and controller node, as start_task did. false
// leaves the task pending.
func (d *Dispatcher) placeTask(ctx context.Context, id, ctype int64) (bool, error) {
	var raw []byte
	var impact int64
	var created time.Time
	var explanation string
	if err := d.DB.Pool.QueryRow(ctx, `SELECT preferred_instance_groups_cache, task_impact, created, job_explanation FROM main_unifiedjob WHERE id = $1`, id).Scan(&raw, &impact, &created, &explanation); err != nil {
		return false, err
	}
	st, err := d.loadTaskManagerState(ctx, id)
	if err != nil {
		return false, err
	}
	capacityType := "execution"
	if ctype == d.CT.ID("main.projectupdate") || ctype == d.CT.ID("main.systemjob") || d.nativeInventoryUpdate(ctx, id, ctype) {
		capacityType = "control"
	}
	needsCapacity := func() (bool, error) {
		d.Log.DebugContext(ctx, "task couldn't be scheduled, waiting for next cycle", "id", id)
		if explanation != needsCapacityExplanation && created.Before(time.Now().Add(-30*time.Second)) {
			_, err := d.DB.Pool.Exec(ctx, `UPDATE main_unifiedjob SET job_explanation = $2 WHERE id = $1`, id, needsCapacityExplanation)
			return false, err
		}
		return false, nil
	}
	start := func(g *tmGroup, exec, ctrl string) (bool, error) {
		var igID *int64
		if g != nil {
			igID = &g.id
		}
		// The task id the job is dispatched under: the fence of its monitor
		// lease and its final write.
		_, err := d.DB.Pool.Exec(ctx, `UPDATE main_unifiedjob SET instance_group_id = $2, execution_node = $3, controller_node = $4, celery_task_id = $5 WHERE id = $1`, id, igID, exec, ctrl, newUUID())
		if err == nil {
			d.lifecycle(ctx, id, "controller_node_chosen")
			if exec != "" {
				d.lifecycle(ctx, id, "execution_node_chosen")
			}
		}
		return err == nil, err
	}
	controlImpact := int64(controlTaskImpact)
	if capacityType == "control" {
		controlImpact += impact
	}
	execName, cpName := d.queueNames(ctx)
	controlPlane := st.byName[cpName]
	control := d.fit(controlPlane, controlImpact, "control", false)
	if control == nil {
		return needsCapacity()
	}
	if capacityType == "control" {
		if !controlPlane.hasRemainingCapacity(controlTaskImpact, 0) {
			return false, nil
		}
		return start(controlPlane, control.hostname, control.hostname)
	}
	var ids []int64
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &ids)
	}
	if len(ids) == 0 {
		// A task saved without the cache (an old row) falls back to the
		// execution queue rather than waiting for ever.
		if g := st.byName[execName]; g != nil {
			ids = []int64{g.id}
		}
	}
	for _, igID := range ids {
		g := st.groups[igID]
		if g == nil || !g.hasRemainingCapacity(impact, 1) {
			continue
		}
		if g.containerGroup {
			if g.meshNode {
				if !g.meshReachable {
					// No receptor here to send the pod to the mesh node with.
					continue
				}
				// The pod runs behind this node, so it is where the job
				// executes; lost node handling sees the job there.
				return start(g, g.meshHost, control.hostname)
			}
			return start(g, "", control.hostname)
		}
		exec := d.fit(g, impact, "execution", true)
		if exec == nil {
			exec = d.largestIdle(g, "execution")
		}
		if exec == nil {
			continue
		}
		ctrl := control.hostname
		if exec.nodeType == "hybrid" {
			ctrl = exec.hostname
		}
		return start(g, exec.hostname, ctrl)
	}
	return needsCapacity()
}
