package api

import (
	"context"

	"github.com/ctrliq/ascender/internal/activity"
	"github.com/ctrliq/ascender/internal/auth"
	"github.com/ctrliq/ascender/internal/models"
	"github.com/jackc/pgx/v5"
)

var (
	zero64 = int64(0)
	two64  = int64(2)
)

// constructedSourceForm reads CONSTRUCTED_INVENTORY_SOURCE_EDITABLE_FIELDS
// (source_vars, update_cache_timeout, limit, verbosity) from a constructed
// inventory's body. A null counts as not provided, as pop_inv_src_data did.
// The returned function sets the provided values on the auto-created source
// and reports whether it changed anything.
func constructedSourceForm(f *Form) func(*models.InventorySource) bool {
	var sets []func(*models.InventorySource)
	present := func(key string) bool {
		raw, ok := f.Raw(key)
		return ok && raw != nil
	}
	if present("source_vars") {
		v := f.String("source_vars", false, 0, "")
		sets = append(sets, func(src *models.InventorySource) { src.SourceVars = v })
	}
	if present("update_cache_timeout") {
		v := f.Int("update_cache_timeout", 0, &zero64, nil)
		sets = append(sets, func(src *models.InventorySource) { src.UpdateCacheTimeout = v })
	}
	if present("limit") {
		v := f.String("limit", false, 0, "")
		sets = append(sets, func(src *models.InventorySource) { src.Limit = v })
	}
	if present("verbosity") {
		v := f.Int("verbosity", 0, &zero64, &two64)
		sets = append(sets, func(src *models.InventorySource) { src.Verbosity = v })
	}
	return func(src *models.InventorySource) bool {
		for _, set := range sets {
			set(src)
		}
		return len(sets) > 0
	}
}

// applyConstructedSource writes the constructed fields to the inventory's
// first source (apply_inv_src_data) and records the source change.
func (s *Server) applyConstructedSource(ctx context.Context, tx pgx.Tx, u *auth.User, inventoryID int64, apply func(*models.InventorySource) bool) error {
	if apply == nil {
		return nil
	}
	var id int64
	if err := tx.QueryRow(ctx, `SELECT unifiedjobtemplate_ptr_id FROM main_inventorysource WHERE inventory_id = $1 ORDER BY unifiedjobtemplate_ptr_id LIMIT 1`, inventoryID).Scan(&id); err != nil {
		if err == pgx.ErrNoRows {
			return nil
		}
		return err
	}
	src, err := models.GetInventorySource(ctx, tx, id)
	if err != nil {
		return err
	}
	before := s.inventorySourceChanges(src)
	if !apply(src) {
		return nil
	}
	if err := models.UpdateInventorySource(ctx, tx, src); err != nil {
		return err
	}
	changes := diffChanges(before, s.inventorySourceChanges(src))
	if len(changes) == 0 {
		return nil
	}
	return s.Activity.Record(ctx, tx, activity.Entry{Operation: "update", Object1: "inventory_source", Changes: changes, ActorID: &u.ID, Links: map[string]int64{"inventory_source": src.ID, "unified_job_template": src.ID}})
}
