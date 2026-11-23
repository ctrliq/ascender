package tasks

import (
	"context"
	"log/slog"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/api"
	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/models"
)

// updateSmartMemberships is update_smart_memberships_for_inventory, which
// RunJob.pre_run_hook called for a job on a smart inventory: the hosts the
// inventory's filter selects now replace its cached membership
// (main_smartinventorymembership, which /api/v2/hosts/N/smart_inventories/
// reads). The current and new sets are read outside a transaction; the
// removals and additions, if any, are made in one, additions ignoring a
// row another job added meanwhile (bulk_create(ignore_conflicts=True)).
// It reports whether anything changed.
func updateSmartMemberships(ctx context.Context, pool *db.DB, log *slog.Logger, inv *models.Inventory) (bool, error) {
	rows, err := pool.Pool.Query(ctx, `SELECT host_id FROM main_smartinventorymembership WHERE inventory_id = $1`, inv.ID)
	if err != nil {
		return false, err
	}
	currentIDs, err := pgx.CollectRows(rows, pgx.RowTo[int64])
	if err != nil {
		return false, err
	}
	newIDs, err := api.InventoryHostIDs(ctx, pool.Pool, inv)
	if err != nil {
		return false, err
	}
	current := map[int64]bool{}
	for _, id := range currentIDs {
		current[id] = true
	}
	fresh := map[int64]bool{}
	var additions []int64
	for _, id := range newIDs {
		fresh[id] = true
		if !current[id] {
			additions = append(additions, id)
		}
	}
	var removals []int64
	for _, id := range currentIDs {
		if !fresh[id] {
			removals = append(removals, id)
		}
	}
	if len(additions) == 0 && len(removals) == 0 {
		return false, nil
	}
	err = pool.Tx(ctx, func(tx pgx.Tx) error {
		if len(removals) > 0 {
			if _, err := tx.Exec(ctx, `DELETE FROM main_smartinventorymembership WHERE inventory_id = $1 AND host_id = ANY($2)`, inv.ID, removals); err != nil {
				return err
			}
		}
		if len(additions) > 0 {
			if _, err := tx.Exec(ctx, `INSERT INTO main_smartinventorymembership (inventory_id, host_id) SELECT $1, unnest($2::integer[]) ON CONFLICT DO NOTHING`, inv.ID, additions); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return false, err
	}
	log.Debug("smart host membership cached", "inventory", inv.ID, "additions", len(additions), "removals", len(removals), "total", len(newIDs))
	return true, nil
}
