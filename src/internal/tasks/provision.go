package tasks

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/activity"
	"github.com/ctrliq/ascender/internal/api"
	"github.com/ctrliq/ascender/internal/models"
)

// provisionRetryInterval is how long provision waits between attempts.
var provisionRetryInterval = 10 * time.Second

// checkNodeType refuses a node type the task process cannot run.
func checkNodeType(nodeType string) error {
	if nodeType != "hybrid" && nodeType != "control" {
		return fmt.Errorf("ASCENDER_NODE_TYPE %q: the task process runs a hybrid or control node", nodeType)
	}
	return nil
}

// provision registers this node before the dispatcher starts any work:
// without its row the node has no capacity, no groups and no heartbeat.
// The old task container ran provision_instance first and did not start
// when it failed. A node type it cannot run is returned, as the
// configuration error it is; any other failure (the database restarting,
// say) is retried until it succeeds or ctx ends (nil then).
func (d *Dispatcher) provision(ctx context.Context) error {
	if err := checkNodeType(d.Cfg.NodeType); err != nil {
		return err
	}
	for {
		err := d.provisionInstance(ctx)
		if err == nil {
			return nil
		}
		if ctx.Err() != nil {
			return nil
		}
		d.Log.ErrorContext(ctx, "provision instance; retrying", "instance", d.Cfg.ClusterHostID, "err", err)
		select {
		case <-ctx.Done():
			return nil
		case <-time.After(provisionRetryInterval):
		}
	}
}

// provisionInstance is what the old task container ran before its
// dispatcher (launch_awx_task.sh, bootstrap_development.sh):
// provision_instance --hostname=<CLUSTER_HOST_ID> --node_type=<type>. It
// registers this node in main_instance, and the node is placed in the
// instance groups by the membership policies (controlplane and default
// take every hybrid node), reapplied on every start as dispatch_startup
// did. The heartbeat then health checks it to ready and gives it capacity.
func (d *Dispatcher) provisionInstance(ctx context.Context) error {
	nodeType := d.Cfg.NodeType
	var reg models.RegisteredInstance
	err := d.DB.Tx(ctx, func(tx pgx.Tx) error {
		var err error
		if reg, err = models.RegisterInstance(ctx, tx, d.Cfg.ClusterHostID, nodeType); err != nil {
			return err
		}
		if !reg.Created || d.API == nil {
			return nil
		}
		// The Instance post_save activity entry, with no user.
		return d.API.Activity.Record(ctx, tx, activity.Entry{Operation: "create", Object1: "instance", Links: map[string]int64{"instance": reg.ID},
			Changes: map[string]any{"hostname": d.Cfg.ClusterHostID, "capacity_adjustment": "1.00", "enabled": true, "managed_by_policy": true,
				"node_type": nodeType, "node_state": "installed", "id": reg.ID}})
	})
	if err != nil {
		return err
	}
	if reg.Created {
		d.Log.InfoContext(ctx, fmt.Sprintf("Successfully registered instance %s", d.Cfg.ClusterHostID))
	} else {
		d.Log.InfoContext(ctx, fmt.Sprintf("Instance already registered %s", d.Cfg.ClusterHostID))
	}
	// On Kubernetes provision_instance also registered the two queues a
	// deployment starts with: the control plane's group, and the default
	// group as a container group, whose pods run the jobs.
	if d.API != nil && d.Settings.Bool(ctx, "IS_K8S") {
		if err := d.registerDefaultQueues(ctx); err != nil {
			return err
		}
	}
	// Elsewhere the old installer ran register_queue for the same two
	// groups, the default one an ordinary group of the hybrid and execution
	// nodes. A new installation gets them from its first task process, so
	// that jobs have somewhere to run; once any group exists they are left
	// to the administrator (register_queue, or the API).
	if d.API != nil && !d.Settings.Bool(ctx, "IS_K8S") {
		if err := d.registerFirstQueues(ctx); err != nil {
			return err
		}
	}

	// dispatch_startup reapplies the policies every time the dispatcher
	// starts, not only when on_instance_saved sees a new instance, so a
	// node registered by a start that failed or stopped before this point
	// still gets its group memberships.
	_, controlQueue := d.queueNames(ctx)
	return d.DB.Tx(ctx, func(tx pgx.Tx) error { return models.ApplyClusterMembershipPolicies(ctx, tx, controlQueue) })
}

// registerFirstQueues registers DEFAULT_CONTROL_PLANE_QUEUE_NAME and
// DEFAULT_EXECUTION_QUEUE_NAME, each taking every instance its policy
// allows, in a database that has no instance group yet.
func (d *Dispatcher) registerFirstQueues(ctx context.Context) error {
	var exists bool
	if err := d.DB.Pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM main_instancegroup)`).Scan(&exists); err != nil {
		return err
	}
	if exists {
		return nil
	}
	execQueue, controlQueue := d.queueNames(ctx)
	for _, name := range []string{controlQueue, execQueue} {
		created, _, err := d.API.RegisterQueue(ctx, api.QueueRegistration{Name: name, InstancePercent: 100})
		if err != nil {
			return fmt.Errorf("register instance group %s: %w", name, err)
		}
		if created {
			d.Log.InfoContext(ctx, fmt.Sprintf("Creating instance group %s", name))
		}
	}
	return nil
}

// registerDefaultQueues is the RegisterQueue pair of provision_instance:
// DEFAULT_CONTROL_PLANE_QUEUE_NAME taking every control node, and
// DEFAULT_EXECUTION_QUEUE_NAME as a container group with the pod spec
// override and limits the deployment's settings give it.
func (d *Dispatcher) registerDefaultQueues(ctx context.Context) error {
	execQueue, controlQueue := d.queueNames(ctx)
	for _, q := range []api.QueueRegistration{
		{Name: controlQueue, InstancePercent: 100},
		{Name: execQueue, InstancePercent: 100, IsContainerGroup: true,
			PodSpecOverride:   d.Settings.String(ctx, "DEFAULT_EXECUTION_QUEUE_POD_SPEC_OVERRIDE"),
			MaxForks:          d.Settings.Int(ctx, "DEFAULT_EXECUTION_QUEUE_MAX_FORKS"),
			MaxConcurrentJobs: d.Settings.Int(ctx, "DEFAULT_EXECUTION_QUEUE_MAX_CONCURRENT_JOBS")},
	} {
		created, changed, err := d.API.RegisterQueue(ctx, q)
		if err != nil {
			return fmt.Errorf("register instance group %s: %w", q.Name, err)
		}
		switch {
		case created:
			d.Log.InfoContext(ctx, fmt.Sprintf("Creating instance group %s", q.Name))
		case changed:
			d.Log.InfoContext(ctx, fmt.Sprintf("Instance Group %s updated", q.Name))
		default:
			d.Log.InfoContext(ctx, fmt.Sprintf("Instance Group already registered %s", q.Name))
		}
	}
	return nil
}
