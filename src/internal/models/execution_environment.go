package models

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/db"
)

// ExecutionEnvironment is a main_executionenvironment row.
type ExecutionEnvironment struct {
	ID             int64
	Created        time.Time
	Modified       time.Time
	Name           string
	Description    string
	Image          string
	Managed        bool
	CreatedByID    *int64
	ModifiedByID   *int64
	CredentialID   *int64
	OrganizationID *int64
	Pull           string
}

// EESummary is the {id,name,description,image} block.
type EESummary struct {
	ID          int64
	Name        string
	Description string
	Image       string
}

// ExecutionEnvironmentColumns selects with alias "ee".
const ExecutionEnvironmentColumns = `ee.id, ee.created, ee.modified, ee.name, ee.description, ee.image, ee.managed, ee.created_by_id, ee.modified_by_id, ee.credential_id, ee.organization_id, ee.pull`

// ScanExecutionEnvironment reads a row produced with ExecutionEnvironmentColumns.
func ScanExecutionEnvironment(r pgx.Row) (*ExecutionEnvironment, error) {
	e := &ExecutionEnvironment{}
	err := r.Scan(&e.ID, &e.Created, &e.Modified, &e.Name, &e.Description, &e.Image, &e.Managed, &e.CreatedByID, &e.ModifiedByID, &e.CredentialID, &e.OrganizationID, &e.Pull)
	if err != nil {
		return nil, err
	}
	return e, nil
}

// GetExecutionEnvironment loads one row.
func GetExecutionEnvironment(ctx context.Context, q db.Querier, id int64) (*ExecutionEnvironment, error) {
	return ScanExecutionEnvironment(q.QueryRow(ctx, `SELECT `+ExecutionEnvironmentColumns+` FROM main_executionenvironment ee WHERE ee.id = $1`, id))
}

// LoadEESummaries returns summaries for ids.
func LoadEESummaries(ctx context.Context, q db.Querier, ids []int64) (map[int64]EESummary, error) {
	out := map[int64]EESummary{}
	if len(ids) == 0 {
		return out, nil
	}
	rows, err := q.Query(ctx, `SELECT id, name, description, image FROM main_executionenvironment WHERE id = ANY($1)`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var s EESummary
		if err := rows.Scan(&s.ID, &s.Name, &s.Description, &s.Image); err != nil {
			return nil, err
		}
		out[s.ID] = s
	}
	return out, rows.Err()
}

// InsertExecutionEnvironment inserts e, setting ID, Created and Modified.
func InsertExecutionEnvironment(ctx context.Context, tx pgx.Tx, e *ExecutionEnvironment) error {
	return tx.QueryRow(ctx, `INSERT INTO main_executionenvironment (created, modified, description, name, image, managed, created_by_id, modified_by_id, credential_id, organization_id, pull)
		VALUES (now(), now(), $1, $2, $3, false, $4, $5, $6, $7, $8) RETURNING id, created, modified`,
		e.Description, e.Name, e.Image, e.CreatedByID, e.ModifiedByID, e.CredentialID, e.OrganizationID, e.Pull).Scan(&e.ID, &e.Created, &e.Modified)
}

// UpdateExecutionEnvironment saves the editable fields of e.
func UpdateExecutionEnvironment(ctx context.Context, tx pgx.Tx, e *ExecutionEnvironment) error {
	return tx.QueryRow(ctx, `UPDATE main_executionenvironment SET modified = now(), description = $2, name = $3, image = $4, modified_by_id = $5, credential_id = $6, organization_id = $7, pull = $8
		WHERE id = $1 RETURNING modified`, e.ID, e.Description, e.Name, e.Image, e.ModifiedByID, e.CredentialID, e.OrganizationID, e.Pull).Scan(&e.Modified)
}

// DefaultExecutionEnvironmentID is the last step of
// get_default_execution_environment, after the DEFAULT_EXECUTION_ENVIRONMENT
// setting: the newest global unmanaged execution environment whose image
// is one of images (GLOBAL_JOB_EXECUTION_ENVIRONMENTS), else the newest
// global unmanaged one (the model's ordering, -created). nil when there is
// none.
func DefaultExecutionEnvironmentID(ctx context.Context, q db.Querier, images []string) *int64 {
	var id int64
	if len(images) > 0 {
		if err := q.QueryRow(ctx, `SELECT id FROM main_executionenvironment WHERE organization_id IS NULL AND managed = false AND image = ANY($1)
			ORDER BY created DESC, id DESC LIMIT 1`, images).Scan(&id); err == nil {
			return &id
		}
	}
	if err := q.QueryRow(ctx, `SELECT id FROM main_executionenvironment WHERE organization_id IS NULL AND managed = false ORDER BY created DESC, id DESC LIMIT 1`).Scan(&id); err == nil {
		return &id
	}
	return nil
}

// ControlPlaneExecutionEnvironmentID is
// get_control_plane_execution_environment: the newest global managed
// execution environment, which project updates and constructed inventory
// updates run in. nil when there is none.
func ControlPlaneExecutionEnvironmentID(ctx context.Context, q db.Querier) *int64 {
	var id int64
	if err := q.QueryRow(ctx, `SELECT id FROM main_executionenvironment WHERE organization_id IS NULL AND managed = true ORDER BY created DESC, id DESC LIMIT 1`).Scan(&id); err == nil {
		return &id
	}
	return nil
}
