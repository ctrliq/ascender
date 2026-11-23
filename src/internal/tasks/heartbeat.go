package tasks

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/models"
	"github.com/ctrliq/ascender/internal/receptor"
)

// The cluster heartbeat and the health checks (main/tasks/system.py:
// cluster_node_heartbeat, inspect_execution_and_hop_nodes,
// execution_node_health_check): this node checks itself every heartbeat
// period, reads the mesh from the local receptor node to keep the
// execution and hop nodes' last_seen, health checks the execution nodes
// that need one, and marks nodes that stopped checking in as lost.

// receptorConfig is read_receptor_config, or nil when this node has no
// receptor.
func (d *Dispatcher) receptorConfig() (*receptor.Config, error) {
	rc, err := receptor.ReadConfig(d.Cfg.ReceptorConfig, d.Cfg.ReceptorSocket)
	if err != nil {
		return nil, err
	}
	rc.Logf = func(msg string) { d.Log.Warn(msg) }
	return rc, nil
}

// runHeartbeat runs cluster_node_heartbeat every heartbeat period.
func (d *Dispatcher) runHeartbeat(ctx context.Context) {
	t := time.NewTicker(models.ClusterNodeHeartbeatPeriod * time.Second)
	defer t.Stop()
	for {
		d.safely("cluster node heartbeat", func() { d.clusterNodeHeartbeat(ctx) })
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
	}
}

// clusterNodeHeartbeat is cluster_node_heartbeat. This node's own health
// check (its last_seen) comes first, ahead of reading the mesh: a slow or
// wedged receptor must not keep this node from checking in, or its peers
// would take it for lost and reap its jobs.
func (d *Dispatcher) clusterNodeHeartbeat(ctx context.Context) {
	now := time.Now()
	list, err := models.InstancesForHeartbeat(ctx, d.DB.Pool)
	if err != nil {
		d.Log.ErrorContext(ctx, "heartbeat", "err", err)
		return
	}
	var me *models.InstanceHealth
	for _, i := range list {
		if i.Hostname == d.Cfg.ClusterHostID {
			me = i
		}
	}
	rejoined := false
	if me != nil {
		startup := me.IsLost(now)
		prior := me.LastSeen
		if err := d.localHealthCheck(ctx, me); err != nil {
			d.Log.ErrorContext(ctx, "local health check", "err", err)
		}
		switch {
		case startup && me.Capacity != 0:
			d.Log.WarnContext(ctx, fmt.Sprintf("Rejoining the cluster as instance %s. Prior last_seen %v", me.Hostname, prior))
			rejoined = true
		case prior == nil:
			d.Log.WarnContext(ctx, fmt.Sprintf("Instance does not have recorded last_seen, updating to %v", now))
		case now.Sub(*prior) > (models.ClusterNodeHeartbeatPeriod+2)*time.Second:
			d.Log.WarnContext(ctx, fmt.Sprintf("Heartbeat skew - interval=%.4f, expected=%d", now.Sub(*prior).Seconds(), models.ClusterNodeHeartbeatPeriod))
		}
	} else if d.Settings.Bool(ctx, "ASCENDER_AUTO_DEPROVISION_INSTANCES") {
		// Where lost nodes are removed, a node that was only out of reach
		// for a while finds its own record gone: it registers again, as
		// the old heartbeat did, rather than run on without one.
		if err := d.provisionInstance(ctx); err != nil {
			d.Log.ErrorContext(ctx, "register instance again", "instance", d.Cfg.ClusterHostID, "err", err)
		} else {
			d.Log.WarnContext(ctx, fmt.Sprintf("Recreated instance record %s after unexpected removal", d.Cfg.ClusterHostID))
			if fresh, err := models.InstancesForHeartbeat(ctx, d.DB.Pool); err == nil {
				list = fresh
				for _, i := range list {
					if i.Hostname == d.Cfg.ClusterHostID {
						me = i
					}
				}
			}
			if me != nil {
				if err := d.localHealthCheck(ctx, me); err != nil {
					d.Log.ErrorContext(ctx, "local health check", "err", err)
				}
			}
		}
	} else {
		d.Log.ErrorContext(ctx, fmt.Sprintf("Cluster Host Not Found: %s", d.Cfg.ClusterHostID))
	}
	d.safely("inspect execution and hop nodes", func() { d.inspectExecutionAndHopNodes(ctx, list) })
	if rejoined {
		return
	}
	var lost []*models.InstanceHealth
	for _, i := range list {
		if i != me && i.IsLost(now) {
			lost = append(lost, i)
		}
	}
	for _, i := range lost {
		explanation := "Job reaped due to instance shutdown"
		d.reapInstance(ctx, i.Hostname, explanation)
		if d.API != nil && i.NodeType == "control" && d.Settings.Bool(ctx, "ASCENDER_AUTO_DEPROVISION_INSTANCES") {
			removed, err := d.API.RemoveLostInstance(ctx, i.ID)
			if err != nil {
				d.Log.ErrorContext(ctx, "deprovision lost instance", "instance", i.Hostname, "err", err)
			} else if removed {
				d.Log.InfoContext(ctx, fmt.Sprintf("Host %s Automatically Deprovisioned.", i.Hostname))
			}
			continue
		}
		if i.NodeState == "ready" {
			if err := i.MarkOffline(ctx, d.DB.Pool, false, "Another cluster node has determined this instance to be unresponsive"); err != nil {
				d.Log.ErrorContext(ctx, "mark lost", "instance", i.Hostname, "err", err)
				continue
			}
			d.Log.ErrorContext(ctx, fmt.Sprintf("Host %s last checked in at %v, marked as lost.", i.Hostname, i.LastSeen))
		}
	}
	if me != nil {
		d.reapOrphans(ctx, me.NodeType, now)
	}
}

// waitingGracePeriod is how long a waiting task of this node may sit
// before the local reaper fails it: JOB_WAITING_GRACE_PERIOD plus
// TASK_MANAGER_TIMEOUT (60 + 300 seconds), as reap_waiting's default.
const waitingGracePeriod = 360 * time.Second

// orphanedExplanation is reap_job's default explanation.
const orphanedExplanation = "Task was marked as running but was not present in the job queue, so it has been marked as failed."

// reapOrphans is the heartbeat's local reaper (reaper.reap and
// reap_waiting for this instance, excluding the tasks it runs): a task
// this node controls that is running (started before this heartbeat) or
// waiting (untouched for the grace period) but that no goroutine here is
// running was left behind by an error path (its "running" write or its
// final write failed) and would otherwise stay so until the next restart.
// As in reap, a running job with a monitor lease is left to the job
// monitor sweep.
func (d *Dispatcher) reapOrphans(ctx context.Context, nodeType string, ref time.Time) {
	active := d.runningIDs()
	host := d.Cfg.ClusterHostID
	leased := ""
	if d.monitorOn {
		noLease := `NOT EXISTS (SELECT 1 FROM main_jobmonitorlease l WHERE l.unified_job_id = uj.id)`
		if nodeType == "control" || nodeType == "hybrid" {
			leased = ` AND ` + noLease
		} else {
			leased = ` AND (` + noLease + ` OR uj.controller_node <> $1)`
		}
	}
	rows, err := d.DB.Pool.Query(ctx, `SELECT uj.id, uj.status FROM main_unifiedjob uj WHERE uj.polymorphic_ctype_id <> $2 AND NOT (uj.id = ANY($3)) AND (
		(uj.status = 'running' AND (uj.execution_node = $1 OR uj.controller_node = $1) AND uj.started <= $4`+leased+`)
		OR (uj.status = 'waiting' AND uj.controller_node = $1 AND uj.modified <= $5)) ORDER BY uj.id`,
		host, d.CT.ID("main.workflowjob"), active, ref, ref.Add(-waitingGracePeriod))
	if err != nil {
		if ctx.Err() == nil {
			d.Log.ErrorContext(ctx, "local reaper", "err", err)
		}
		return
	}
	type orphan struct {
		id     int64
		status string
	}
	var found []orphan
	for rows.Next() {
		var o orphan
		if rows.Scan(&o.id, &o.status) == nil {
			found = append(found, o)
		}
	}
	rows.Close()
	for _, o := range found {
		// Checked again: the task may have started here since the list
		// of active ones was taken.
		if d.isRunning(o.id) {
			continue
		}
		if err := d.reapJob(ctx, o.id, orphanedExplanation); err != nil {
			if !db.IsNoRows(err) {
				d.Log.ErrorContext(ctx, "reap job", "id", o.id, "err", err)
			}
			continue
		}
		d.Log.ErrorContext(ctx, fmt.Sprintf("unified job %d is no longer %s; reaping", o.id, o.status))
	}
}

// isRunning reports whether this process runs a task.
func (d *Dispatcher) isRunning(id int64) bool {
	d.mu.Lock()
	defer d.mu.Unlock()
	_, ok := d.running[id]
	return ok
}

// localHealthCheck is Instance.local_health_check.
func (d *Dispatcher) localHealthCheck(ctx context.Context, me *models.InstanceHealth) error {
	version := d.Cfg.Version
	return me.SaveHealthData(ctx, d.DB.Pool, models.HealthData{Version: &version, CPU: models.LocalCPUCount(), Memory: models.LocalMemBytes(), UpdateLastSeen: true},
		d.Settings.Bool(ctx, "IS_K8S"))
}

// reapInstance is reaper.reap and reap_waiting for a lost node: its
// running jobs, and the waiting ones it controls, fail.
func (d *Dispatcher) reapInstance(ctx context.Context, hostname, explanation string) {
	// A job holding a monitor lease is left to the sweep when the lost node
	// is a control or hybrid node: it was reading the job, and the lease
	// lapses. One whose work is on a lost execution or hop node is reaped
	// as before, unless the lost node controlled it.
	leased := ""
	if d.monitorOn {
		var nodeType string
		_ = d.DB.Pool.QueryRow(ctx, `SELECT node_type FROM main_instance WHERE hostname = $1`, hostname).Scan(&nodeType)
		noLease := `NOT EXISTS (SELECT 1 FROM main_jobmonitorlease l WHERE l.unified_job_id = main_unifiedjob.id)`
		if nodeType == "control" || nodeType == "hybrid" {
			leased = ` AND ` + noLease
		} else {
			leased = ` AND (` + noLease + ` OR controller_node <> $1)`
		}
	}
	rows, err := d.DB.Pool.Query(ctx, `SELECT id FROM main_unifiedjob WHERE polymorphic_ctype_id <> $2 AND
		((status = 'running' AND (execution_node = $1 OR controller_node = $1)`+leased+`) OR (status = 'waiting' AND controller_node = $1))`, hostname, d.CT.ID("main.workflowjob"))
	if err != nil {
		d.Log.ErrorContext(ctx, "reap lost instance", "instance", hostname, "err", err)
		return
	}
	var ids []int64
	for rows.Next() {
		var id int64
		if rows.Scan(&id) == nil {
			ids = append(ids, id)
		}
	}
	rows.Close()
	for _, id := range ids {
		if err := d.reapJob(ctx, id, explanation); err != nil {
			d.Log.ErrorContext(ctx, "reap job", "id", id, "err", err)
		}
	}
}

// inspectNodesLockID is the lock inspect_execution_and_hop_nodes took, so
// only one control node, old or new, inspects the mesh at a time.
var inspectNodesLockID = db.AdvisoryLockKey("inspect_execution_and_hop_nodes_lock")

// inspectExecutionAndHopNodes is inspect_execution_and_hop_nodes: one
// task process at a time reads the mesh.
func (d *Dispatcher) inspectExecutionAndHopNodes(ctx context.Context, list []*models.InstanceHealth) {
	rc, err := d.receptorConfig()
	if err != nil {
		return // no receptor on this node
	}
	conn, err := d.DB.Pool.Acquire(ctx)
	if err != nil {
		return
	}
	defer conn.Release()
	var acquired bool
	if err := conn.QueryRow(ctx, `SELECT pg_try_advisory_lock($1)`, inspectNodesLockID).Scan(&acquired); err != nil || !acquired {
		return
	}
	defer func() {
		_, _ = conn.Exec(context.Background(), `SELECT pg_advisory_unlock($1)`, inspectNodesLockID)
	}()
	st, err := rc.Status()
	if err != nil {
		d.Log.WarnContext(ctx, "receptor status", "err", err)
		return
	}
	d.inspectEstablishedConnections(ctx, st)
	lookup := map[string]*models.InstanceHealth{}
	for _, i := range list {
		lookup[i.Hostname] = i
	}
	now := time.Now()
	for _, ad := range st.Advertisements {
		inst, ok := lookup[ad.NodeID]
		if !ok {
			d.Log.WarnContext(ctx, "Unrecognized node advertising on mesh: "+ad.NodeID)
			continue
		}
		if inst.NodeType == "control" || inst.NodeType == "hybrid" {
			continue
		}
		seen, err := parseReceptorTime(ad.Time)
		if err != nil {
			continue
		}
		if inst.LastSeen != nil && !inst.LastSeen.Before(seen) {
			continue
		}
		if err := inst.SetLastSeen(ctx, d.DB.Pool, seen); err != nil {
			d.Log.ErrorContext(ctx, "last seen", "instance", inst.Hostname, "err", err)
			continue
		}
		if inst.NodeType == "hop" {
			if inst.NodeState == "unavailable" || inst.NodeState == "installed" {
				d.Log.WarnContext(ctx, fmt.Sprintf("Hop node %s, has rejoined the receptor mesh", inst.Hostname))
				_ = inst.SaveHealthData(ctx, d.DB.Pool, models.HealthData{CPU: inst.CPU, Memory: inst.Memory}, d.Settings.Bool(ctx, "IS_K8S"))
			}
			continue
		}
		switch {
		case inst.NodeState == "unavailable" || inst.NodeState == "installed":
			d.Log.WarnContext(ctx, "Execution node attempting to rejoin as instance "+inst.Hostname+".")
			d.startHealthCheck(ctx, inst.Hostname)
		case inst.Capacity == 0 && inst.Enabled:
			if inst.LastHealthCheck == nil || now.Sub(*inst.LastHealthCheck) >= models.ExecutionNodeRemediationChecks*time.Second {
				d.Log.DebugContext(ctx, "Restarting health check for execution node "+inst.Hostname+" with known errors.")
				d.startHealthCheck(ctx, inst.Hostname)
			}
		}
	}
}

// parseReceptorTime reads an advertisement's time (Go's RFC 3339 with
// nanoseconds and the node's zone).
func parseReceptorTime(s string) (time.Time, error) {
	for _, layout := range []string{time.RFC3339Nano, "2006-01-02T15:04:05.999999999Z07:00", "2006-01-02 15:04:05.999999999 -0700 MST"} {
		if t, err := time.Parse(layout, s); err == nil {
			return t, nil
		}
	}
	return time.Time{}, fmt.Errorf("unparsable receptor time %q", s)
}

// inspectEstablishedConnections is inspect_established_receptor_connections:
// links being added become established once the mesh shows them.
func (d *Dispatcher) inspectEstablishedConnections(ctx context.Context, st *receptor.Status) {
	rows, err := d.DB.Pool.Query(ctx, `SELECT l.id, s.hostname, t.hostname FROM main_instancelink l
		JOIN main_instance s ON s.id = l.source_id JOIN main_receptoraddress a ON a.id = l.target_id JOIN main_instance t ON t.id = a.instance_id
		WHERE l.link_state = 'adding'`)
	if err != nil {
		return
	}
	var ids []int64
	for rows.Next() {
		var id int64
		var src, dst string
		if rows.Scan(&id, &src, &dst) != nil {
			continue
		}
		if _, ok := st.KnownConnectionCosts[src][dst]; ok {
			ids = append(ids, id)
		}
	}
	rows.Close()
	if len(ids) > 0 {
		_, _ = d.DB.Pool.Exec(ctx, `UPDATE main_instancelink SET link_state = 'established' WHERE id = ANY($1)`, ids)
	}
}

var healthChecks sync.Map

// startHealthCheck runs execution_node_health_check in the background,
// one at a time per node.
func (d *Dispatcher) startHealthCheck(ctx context.Context, hostname string) {
	if _, running := healthChecks.LoadOrStore(hostname, true); running {
		return
	}
	go func() {
		defer healthChecks.Delete(hostname)
		d.safely("health check of "+hostname, func() { d.executionNodeHealthCheck(ctx, hostname) })
	}()
}

// healthCheckByID starts the check the API asked for.
func (d *Dispatcher) healthCheckByID(ctx context.Context, id int64) {
	var hostname string
	if err := d.DB.Pool.QueryRow(ctx, `SELECT hostname FROM main_instance WHERE id = $1`, id).Scan(&hostname); err != nil {
		return
	}
	d.startHealthCheck(ctx, hostname)
}

// executionNodeHealthCheck is execution_node_health_check: worker_info over
// the mesh, saved as the node's health data.
func (d *Dispatcher) executionNodeHealthCheck(ctx context.Context, node string) map[string]any {
	if node == "" {
		d.Log.WarnContext(ctx, "Remote health check incorrectly called with blank string")
		return nil
	}
	inst, err := models.InstanceHealthByHostname(ctx, d.DB.Pool, node)
	if err != nil {
		d.Log.WarnContext(ctx, fmt.Sprintf("Instance record for %s missing, could not check capacity.", node))
		return nil
	}
	if inst.NodeType != "execution" {
		d.Log.WarnContext(ctx, fmt.Sprintf("Execution node health check ran against %s node %s", inst.NodeType, inst.Hostname))
		return nil
	}
	if inst.NodeState != "ready" && inst.NodeState != "unavailable" && inst.NodeState != "installed" {
		d.Log.WarnContext(ctx, fmt.Sprintf("Execution node health check ran against node %s in state %s", inst.Hostname, inst.NodeState))
		return nil
	}
	var data map[string]any
	if rc, err := d.receptorConfig(); err != nil {
		data = map[string]any{"errors": []string{err.Error()}, "transmit_timing": 0.0}
	} else {
		data = rc.WorkerInfo(ctx, node, d.Settings.Bool(ctx, "RECEPTOR_RELEASE_WORK"))
	}
	errs, _ := data["errors"].([]string)
	version := "ansible-runner-" + stringOr(orDefault(data["runner_version"], "???"))
	var uuid *string
	if u, ok := data["uuid"].(string); ok {
		uuid = &u
	}
	prior := inst.Capacity
	h := models.HealthData{Version: &version, CPU: toFloat(data["cpu_count"]), Memory: toInt(data["mem_in_bytes"]), UUID: uuid, Errors: strings.Join(errs, "\n")}
	if err := inst.SaveHealthData(ctx, d.DB.Pool, h, d.Settings.Bool(ctx, "IS_K8S")); err != nil {
		d.Log.ErrorContext(ctx, "save health data", "instance", node, "err", err)
		return data
	}
	if len(errs) > 0 {
		if prior != 0 {
			d.Log.WarnContext(ctx, fmt.Sprintf("Health check marking execution node %s as lost, errors:\n%s", node, h.Errors))
		} else {
			d.Log.InfoContext(ctx, fmt.Sprintf("Failed to find capacity of new or lost execution node %s, errors:\n%s", node, h.Errors))
		}
	} else {
		b, _ := json.MarshalIndent(data, "", "  ")
		d.Log.InfoContext(ctx, fmt.Sprintf("Set capacity of execution node %s to %d, worker info data:\n%s", node, inst.Capacity, b))
	}
	return data
}

func orDefault(v, def any) any {
	if v == nil {
		return def
	}
	return v
}

func toFloat(v any) float64 {
	switch t := v.(type) {
	case int:
		return float64(t)
	case int64:
		return float64(t)
	case float64:
		return t
	case uint64:
		return float64(t)
	}
	return 0
}
