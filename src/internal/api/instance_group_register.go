package api

import (
	"context"
	"encoding/json"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/activity"
	"github.com/ctrliq/ascender/internal/db"
)

// QueueRegistration is what RegisterQueue is given: an instance group and
// the policy it should have.
type QueueRegistration struct {
	Name              string
	InstancePercent   int64
	InstanceMinimum   int64
	IsContainerGroup  bool
	PodSpecOverride   string
	MaxForks          int64
	MaxConcurrentJobs int64
	// Hostnames are instances added to the group and to its policy
	// instance list (register_queue --hostnames); none is removed.
	Hostnames []string
}

// queueRegistered is what registerQueue did.
type queueRegistered struct {
	created, changed bool
	// added are the instances given in Hostnames, in the order found.
	added []string
	// notFound is register_queue's InstanceNotFound message: a hostname
	// that is no instance, or a hop node. The group is still registered,
	// and no instance is added.
	notFound string
}

// RegisterQueue is the old RegisterQueue.register (register_queue, and
// provision_instance on Kubernetes): the group is created when it is
// missing and its policy brought to what is asked. As there, a group is
// made a container group but never unmade one, and the pod spec override
// and the limits are only written when given.
func (s *Server) RegisterQueue(ctx context.Context, q QueueRegistration) (created, changed bool, err error) {
	r, err := s.registerQueue(ctx, q)
	return r.created, r.changed, err
}

func (s *Server) registerQueue(ctx context.Context, q QueueRegistration) (r queueRegistered, err error) {
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		r = queueRegistered{}
		created, changed := false, false
		defer func() { r.created, r.changed = created, r.changed || changed }()
		if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock($1)`, db.AdvisoryLockKey("cluster_policy_lock")); err != nil {
			return err
		}
		g, err := scanFirst[*instanceGroup](ctx, tx, `SELECT `+instanceGroupColumns+` FROM main_instancegroup g WHERE g.name = $1 ORDER BY g.id LIMIT 1`, []any{q.Name}, scanInstanceGroup)
		if err != nil && !db.IsNoRows(err) {
			return err
		}
		if g == nil {
			created = true
			g = &instanceGroup{Name: q.Name, PolicyInstanceList: []string{}}
			if err := s.insertInstanceGroup(ctx, tx, g); err != nil {
				return err
			}
			if err := s.Activity.Record(ctx, tx, activity.Entry{Operation: "create", Object1: "instance_group", Changes: s.igChanges(ctx, tx, g), Links: map[string]int64{"instance_group": g.ID}}); err != nil {
				return err
			}
		}
		before := s.igChanges(ctx, tx, g)
		if g.PolicyInstancePercentage != q.InstancePercent {
			g.PolicyInstancePercentage, changed = q.InstancePercent, true
		}
		if g.PolicyInstanceMinimum != q.InstanceMinimum {
			g.PolicyInstanceMinimum, changed = q.InstanceMinimum, true
		}
		if q.IsContainerGroup && !g.IsContainerGroup {
			g.IsContainerGroup, changed = true, true
		}
		if q.PodSpecOverride != "" && g.PodSpecOverride != q.PodSpecOverride {
			g.PodSpecOverride, changed = q.PodSpecOverride, true
		}
		if q.MaxForks != 0 && g.MaxForks != q.MaxForks {
			g.MaxForks, changed = q.MaxForks, true
		}
		if q.MaxConcurrentJobs != 0 && g.MaxConcurrentJobs != q.MaxConcurrentJobs {
			g.MaxConcurrentJobs, changed = q.MaxConcurrentJobs, true
		}
		if changed {
			list, _ := json.Marshal(g.PolicyInstanceList)
			if _, err := tx.Exec(ctx, `UPDATE main_instancegroup SET modified = now(), policy_instance_list = $2, policy_instance_minimum = $3, policy_instance_percentage = $4,
			is_container_group = $5, pod_spec_override = $6, max_forks = $7, max_concurrent_jobs = $8 WHERE id = $1`,
				g.ID, list, g.PolicyInstanceMinimum, g.PolicyInstancePercentage, g.IsContainerGroup, g.PodSpecOverride, g.MaxForks, g.MaxConcurrentJobs); err != nil {
				return err
			}
			if changes := diffChanges(before, s.igChanges(ctx, tx, g)); len(changes) > 0 {
				if err := s.Activity.Record(ctx, tx, activity.Entry{Operation: "update", Object1: "instance_group", Changes: changes, Links: map[string]int64{"instance_group": g.ID}}); err != nil {
					return err
				}
			}
		}
		return s.addQueueInstances(ctx, tx, g, q.Hostnames, &r)
	})
	return r, err
}

// addQueueInstances is RegisterQueue.add_instances_to_group: each hostname
// must be an instance that can run jobs (not a hop node), or none is
// added. The instances join the group, and the names not yet in its policy
// instance list are appended to it.
func (s *Server) addQueueInstances(ctx context.Context, tx pgx.Tx, g *instanceGroup, hostnames []string, r *queueRegistered) error {
	seen := map[string]bool{}
	var names []string
	for _, h := range hostnames {
		if h = strings.TrimSpace(h); h != "" && !seen[h] {
			seen[h] = true
			names = append(names, h)
		}
	}
	ids := make([]int64, 0, len(names))
	for _, h := range names {
		var id int64
		err := tx.QueryRow(ctx, `SELECT id FROM main_instance WHERE hostname = $1 AND node_type <> 'hop' ORDER BY id LIMIT 1`, h).Scan(&id)
		if db.IsNoRows(err) {
			r.notFound = "Instance does not exist or cannot run jobs: " + h
			return nil
		}
		if err != nil {
			return err
		}
		ids = append(ids, id)
	}
	for i, id := range ids {
		if _, err := tx.Exec(ctx, `INSERT INTO main_instancegroup_instances (instancegroup_id, instance_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, g.ID, id); err != nil {
			return err
		}
		r.added = append(r.added, names[i])
	}
	inList := map[string]bool{}
	for _, h := range g.PolicyInstanceList {
		inList[h] = true
	}
	var extra []string
	for _, h := range names {
		if !inList[h] {
			extra = append(extra, h)
		}
	}
	if len(extra) == 0 {
		return nil
	}
	before := s.igChanges(ctx, tx, g)
	g.PolicyInstanceList = append(g.PolicyInstanceList, extra...)
	list, _ := json.Marshal(g.PolicyInstanceList)
	if _, err := tx.Exec(ctx, `UPDATE main_instancegroup SET modified = now(), policy_instance_list = $2 WHERE id = $1`, g.ID, list); err != nil {
		return err
	}
	r.changed = true
	if changes := diffChanges(before, s.igChanges(ctx, tx, g)); len(changes) > 0 {
		return s.Activity.Record(ctx, tx, activity.Entry{Operation: "update", Object1: "instance_group", Changes: changes, Links: map[string]int64{"instance_group": g.ID}})
	}
	return nil
}
