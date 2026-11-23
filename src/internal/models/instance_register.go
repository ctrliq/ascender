package models

import (
	"context"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/db"
)

// RegisteredInstance is what RegisterInstance did.
type RegisteredInstance struct {
	ID       int64
	Created  bool
	Changed  bool
	NodeType string
}

// RegisterInstance is InstanceManager.register as provision_instance called
// it when a control plane container started: under a lock per hostname, an
// existing row goes back to installed (the health check makes it ready)
// with the node type given; a missing one is created with the old
// defaults: installed, no capacity yet, managed, enabled and placed by
// policy.
func RegisterInstance(ctx context.Context, tx pgx.Tx, hostname, nodeType string) (RegisteredInstance, error) {
	r := RegisteredInstance{NodeType: nodeType}
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock($1)`, db.AdvisoryLockKey("instance_registration_"+hostname)); err != nil {
		return r, err
	}
	var curType, curIP, curState string
	err := tx.QueryRow(ctx, `SELECT id, node_type, ip_address, node_state FROM main_instance WHERE hostname = $1 ORDER BY id LIMIT 1`, hostname).Scan(&r.ID, &curType, &curIP, &curState)
	switch {
	case err == nil:
		// node_state is always among the fields saved, so the old code
		// always reported a change.
		r.Changed = true
		_, err = tx.Exec(ctx, `UPDATE main_instance SET node_state = 'installed', node_type = $2, ip_address = '' WHERE id = $1`, r.ID, nodeType)
		return r, err
	case err != pgx.ErrNoRows:
		return r, err
	}
	err = tx.QueryRow(ctx, `INSERT INTO main_instance (uuid, hostname, created, modified, capacity, version, capacity_adjustment, cpu, memory, cpu_capacity, mem_capacity,
			enabled, managed_by_policy, ip_address, node_type, errors, node_state, managed)
		VALUES (gen_random_uuid()::text, $1, now(), now(), 0, '', 1.0, 0, 0, 0, 0, true, true, '', $2, '', 'installed', true) RETURNING id`, hostname, nodeType).Scan(&r.ID)
	r.Created, r.Changed = err == nil, err == nil
	return r, err
}
