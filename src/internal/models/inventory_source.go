package models

import (
	"context"
	"encoding/json"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/db"
)

// InventorySource is a main_inventorysource row with its unified job
// template parent.
type InventorySource struct {
	ID                     int64
	Created                time.Time
	Modified               time.Time
	Name                   string
	Description            string
	LastJobFailed          bool
	LastJobRun             *time.Time
	NextJobRun             *time.Time
	Status                 string
	CreatedByID            *int64
	ModifiedByID           *int64
	CurrentJobID           *int64
	LastJobID              *int64
	NextScheduleID         *int64
	OrganizationID         *int64
	ExecutionEnvironmentID *int64

	Source                    string
	SourcePath                string
	SourceVars                string
	Overwrite                 bool
	OverwriteVars             bool
	UpdateOnLaunch            bool
	UpdateCacheTimeout        int64
	InventoryID               *int64
	Timeout                   int64
	SourceProjectID           *int64
	Verbosity                 int64
	EnabledValue              string
	EnabledVar                string
	HostFilter                string
	SCMBranch                 string
	Limit                     string
	ManagedInventoryVariables json.RawMessage
}

// InventorySourceColumns selects with aliases ujt and src.
const InventorySourceColumns = `ujt.id, ujt.created, ujt.modified, ujt.name, ujt.description, ujt.last_job_failed, ujt.last_job_run, ujt.next_job_run, ujt.status,
	ujt.created_by_id, ujt.modified_by_id, ujt.current_job_id, ujt.last_job_id, ujt.next_schedule_id, ujt.organization_id, ujt.execution_environment_id,
	src.source, src.source_path, src.source_vars, src.overwrite, src.overwrite_vars, src.update_on_launch, src.update_cache_timeout, src.inventory_id, src.timeout,
	src.source_project_id, src.verbosity, src.enabled_value, src.enabled_var, src.host_filter, src.scm_branch, src."limit", src.managed_inventory_variables`

// InventorySourceFrom is the FROM clause matching InventorySourceColumns.
const InventorySourceFrom = `main_inventorysource src JOIN main_unifiedjobtemplate ujt ON ujt.id = src.unifiedjobtemplate_ptr_id`

// ScanInventorySource reads a row produced with InventorySourceColumns.
func ScanInventorySource(r pgx.Row) (*InventorySource, error) {
	s := &InventorySource{}
	err := r.Scan(&s.ID, &s.Created, &s.Modified, &s.Name, &s.Description, &s.LastJobFailed, &s.LastJobRun, &s.NextJobRun, &s.Status,
		&s.CreatedByID, &s.ModifiedByID, &s.CurrentJobID, &s.LastJobID, &s.NextScheduleID, &s.OrganizationID, &s.ExecutionEnvironmentID,
		&s.Source, &s.SourcePath, &s.SourceVars, &s.Overwrite, &s.OverwriteVars, &s.UpdateOnLaunch, &s.UpdateCacheTimeout, &s.InventoryID, &s.Timeout,
		&s.SourceProjectID, &s.Verbosity, &s.EnabledValue, &s.EnabledVar, &s.HostFilter, &s.SCMBranch, &s.Limit, &s.ManagedInventoryVariables)
	if err != nil {
		return nil, err
	}
	return s, nil
}

// GetInventorySource loads one source.
func GetInventorySource(ctx context.Context, q db.Querier, id int64) (*InventorySource, error) {
	return ScanInventorySource(q.QueryRow(ctx, `SELECT `+InventorySourceColumns+` FROM `+InventorySourceFrom+` WHERE ujt.id = $1`, id))
}

// InsertInventorySource creates the unified job template row and the
// source row. The organization follows the inventory's (InventorySource.save).
func InsertInventorySource(ctx context.Context, tx pgx.Tx, s *InventorySource, cts *ContentTypes) error {
	if s.Status == "" {
		s.Status = "never updated"
	}
	if s.InventoryID != nil && s.OrganizationID == nil {
		if err := tx.QueryRow(ctx, `SELECT organization_id FROM main_inventory WHERE id = $1 FOR UPDATE`, *s.InventoryID).Scan(&s.OrganizationID); err != nil {
			return err
		}
	}
	if len(s.ManagedInventoryVariables) == 0 {
		s.ManagedInventoryVariables = json.RawMessage("{}")
	}
	err := tx.QueryRow(ctx, `INSERT INTO main_unifiedjobtemplate (created, modified, description, name, old_pk, last_job_failed, last_job_run, next_job_run, status,
		created_by_id, current_job_id, last_job_id, modified_by_id, next_schedule_id, polymorphic_ctype_id, organization_id, execution_environment_id)
		VALUES (now(), now(), $1, $2, NULL, false, NULL, NULL, $3, $4, NULL, NULL, $5, NULL, $6, $7, $8) RETURNING id, created, modified`,
		s.Description, s.Name, s.Status, s.CreatedByID, s.ModifiedByID, cts.ID("main.inventorysource"), s.OrganizationID, s.ExecutionEnvironmentID).Scan(&s.ID, &s.Created, &s.Modified)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `INSERT INTO main_inventorysource (unifiedjobtemplate_ptr_id, source, source_path, source_vars, overwrite, overwrite_vars, update_on_launch, update_cache_timeout,
		inventory_id, timeout, source_project_id, verbosity, enabled_value, enabled_var, host_filter, scm_branch, "limit", managed_inventory_variables)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18::jsonb)`,
		s.ID, s.Source, s.SourcePath, s.SourceVars, s.Overwrite, s.OverwriteVars, s.UpdateOnLaunch, s.UpdateCacheTimeout,
		s.InventoryID, s.Timeout, s.SourceProjectID, s.Verbosity, s.EnabledValue, s.EnabledVar, s.HostFilter, s.SCMBranch, s.Limit, string(s.ManagedInventoryVariables))
	return err
}

// UpdateInventorySource writes the editable columns of both tables.
func UpdateInventorySource(ctx context.Context, tx pgx.Tx, s *InventorySource) error {
	err := tx.QueryRow(ctx, `UPDATE main_unifiedjobtemplate SET modified = now(), description = $2, name = $3, modified_by_id = $4, execution_environment_id = $5 WHERE id = $1 RETURNING modified`,
		s.ID, s.Description, s.Name, s.ModifiedByID, s.ExecutionEnvironmentID).Scan(&s.Modified)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `UPDATE main_inventorysource SET source = $2, source_path = $3, source_vars = $4, overwrite = $5, overwrite_vars = $6, update_on_launch = $7,
		update_cache_timeout = $8, timeout = $9, source_project_id = $10, verbosity = $11, enabled_value = $12, enabled_var = $13, host_filter = $14, scm_branch = $15, "limit" = $16
		WHERE unifiedjobtemplate_ptr_id = $1`,
		s.ID, s.Source, s.SourcePath, s.SourceVars, s.Overwrite, s.OverwriteVars, s.UpdateOnLaunch, s.UpdateCacheTimeout,
		s.Timeout, s.SourceProjectID, s.Verbosity, s.EnabledValue, s.EnabledVar, s.HostFilter, s.SCMBranch, s.Limit)
	return err
}

// ConstructedSourceName is the name the auto-created source of a
// constructed inventory gets (Inventory._enforce_constructed_source).
func ConstructedSourceName(inventoryName string) string {
	n := "Auto-created source for: " + inventoryName
	if r := []rune(n); len(r) > 512 {
		n = string(r[:512])
	}
	return n
}

// EnsureConstructedSource creates the one inventory source a constructed
// inventory always has, when it has none.
func EnsureConstructedSource(ctx context.Context, tx pgx.Tx, inv *Inventory, cts *ContentTypes) (*InventorySource, error) {
	var exists bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM main_inventorysource WHERE inventory_id = $1)`, inv.ID).Scan(&exists); err != nil || exists {
		return nil, err
	}
	src := &InventorySource{Name: ConstructedSourceName(inv.Name), Source: "constructed", Overwrite: true, OverwriteVars: true, UpdateOnLaunch: true,
		InventoryID: &inv.ID, OrganizationID: inv.OrganizationID, Verbosity: 1}
	return src, InsertInventorySource(ctx, tx, src, cts)
}
