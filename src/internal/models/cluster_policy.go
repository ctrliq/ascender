package models

import (
	"context"
	"encoding/json"
	"sort"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/db"
)

// ApplyClusterMembershipPolicies is apply_cluster_membership_policies: it
// recomputes which instances belong to each instance group from the
// groups' policy_instance_list, policy_instance_minimum and
// policy_instance_percentage, and applies the difference. Control nodes
// never join an execution group and execution nodes never join the control
// plane group; hop nodes join none. Container groups are skipped. The old
// task ran with the activity stream disabled, so nothing is recorded.
func ApplyClusterMembershipPolicies(ctx context.Context, tx pgx.Tx, controlPlane string) error {
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock($1)`, db.AdvisoryLockKey("cluster_policy_lock")); err != nil {
		return err
	}
	type inst struct {
		id           int64
		hostname     string
		nodeType     string
		managedByPol bool
		groups       []int64
	}
	type group struct {
		id        int64
		name      string
		container bool
		list      []string
		minimum   int
		percent   int
		instances []int64
		prior     []int64
	}
	rows, err := tx.Query(ctx, `SELECT id, hostname, node_type, managed_by_policy FROM main_instance WHERE node_type <> 'hop' ORDER BY id`)
	if err != nil {
		return err
	}
	var all []*inst
	byHost := map[string]*inst{}
	for rows.Next() {
		i := &inst{}
		if err := rows.Scan(&i.id, &i.hostname, &i.nodeType, &i.managedByPol); err != nil {
			rows.Close()
			return err
		}
		all = append(all, i)
		byHost[i.hostname] = i
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	rows, err = tx.Query(ctx, `SELECT g.id, g.name, g.is_container_group, g.policy_instance_list, g.policy_instance_minimum, g.policy_instance_percentage,
		COALESCE((SELECT array_agg(gi.instance_id ORDER BY gi.id) FROM main_instancegroup_instances gi WHERE gi.instancegroup_id = g.id), '{}')
		FROM main_instancegroup g ORDER BY g.id`)
	if err != nil {
		return err
	}
	var groups []*group
	for rows.Next() {
		g := &group{}
		var list []byte
		if err := rows.Scan(&g.id, &g.name, &g.container, &list, &g.minimum, &g.percent, &g.prior); err != nil {
			rows.Close()
			return err
		}
		_ = json.Unmarshal(list, &g.list)
		groups = append(groups, g)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	exclude := func(g *group) string {
		if g.name == controlPlane {
			return "execution"
		}
		return "control"
	}
	contains := func(ids []int64, id int64) bool {
		for _, v := range ids {
			if v == id {
				return true
			}
		}
		return false
	}
	// The policy list first: manually managed memberships.
	for _, g := range groups {
		g.instances = []int64{}
		for _, h := range g.list {
			i, ok := byHost[h]
			if !ok || i.nodeType == exclude(g) {
				continue
			}
			g.instances = append(g.instances, i.id)
		}
	}
	var nodes []*inst
	for _, i := range all {
		if i.managedByPol {
			nodes = append(nodes, i)
		}
	}
	// sorted() evaluated its keys once, before the loop changed them.
	byFewestInstances := func() []*group {
		out := append([]*group(nil), groups...)
		sort.SliceStable(out, func(a, b int) bool { return len(out[a].instances) < len(out[b].instances) })
		return out
	}
	byFewestGroups := func() []*inst {
		out := append([]*inst(nil), nodes...)
		sort.SliceStable(out, func(a, b int) bool { return len(out[a].groups) < len(out[b].groups) })
		return out
	}
	// Minimums next: a concrete lower bound.
	for _, g := range byFewestInstances() {
		ex := exclude(g)
		for _, i := range byFewestGroups() {
			if i.nodeType == ex {
				continue
			}
			if len(g.instances) >= g.minimum {
				break
			}
			if contains(g.instances, i.id) {
				continue
			}
			g.instances = append(g.instances, i.id)
			i.groups = append(i.groups, g.id)
		}
	}
	// Percentages last.
	for _, g := range byFewestInstances() {
		ex := exclude(g)
		pool := 0
		for _, i := range nodes {
			if i.nodeType != ex {
				pool++
			}
		}
		if pool == 0 {
			continue
		}
		for _, i := range byFewestGroups() {
			if i.nodeType == ex {
				continue
			}
			if contains(g.instances, i.id) {
				continue
			}
			if 100*float64(len(g.instances))/float64(pool) >= float64(g.percent) {
				break
			}
			g.instances = append(g.instances, i.id)
			i.groups = append(i.groups, g.id)
		}
	}
	for _, g := range groups {
		if g.container {
			continue
		}
		for _, id := range g.instances {
			if !contains(g.prior, id) {
				if _, err := tx.Exec(ctx, `INSERT INTO main_instancegroup_instances (instancegroup_id, instance_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, g.id, id); err != nil {
					return err
				}
			}
		}
		for _, id := range g.prior {
			if !contains(g.instances, id) {
				if _, err := tx.Exec(ctx, `DELETE FROM main_instancegroup_instances WHERE instancegroup_id = $1 AND instance_id = $2`, g.id, id); err != nil {
					return err
				}
			}
		}
	}
	return nil
}
