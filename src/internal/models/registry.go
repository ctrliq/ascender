package models

import (
	"context"
	"crypto/rand"
	"fmt"

	"github.com/ctrliq/ascender/internal/db"
)

// The DAB resource registry mirrors organizations, users and teams with a
// stable ansible_id so other services can refer to them. The old application
// kept it up to date from model signals; these helpers do the same.

func newUUID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}

// RegisterResource adds a registry row for an object; typeName is
// "shared.organization", "shared.user" or "shared.team".
func RegisterResource(ctx context.Context, q db.Querier, typeName string, objectID int64, name string) error {
	// The resource row refers to Django's content type; the resource type
	// row maps the shared type name to it.
	var ctID int64
	err := q.QueryRow(ctx, `SELECT content_type_id FROM dab_resource_registry_resourcetype WHERE name = $1`, typeName).Scan(&ctID)
	if err != nil {
		if db.IsNoRows(err) {
			return nil // registry not initialised; nothing to mirror
		}
		return err
	}
	var serviceID string
	if err := q.QueryRow(ctx, `SELECT id::text FROM dab_resource_registry_serviceid LIMIT 1`).Scan(&serviceID); err != nil {
		if db.IsNoRows(err) {
			return nil
		}
		return err
	}
	_, err = q.Exec(ctx, `INSERT INTO dab_resource_registry_resource (object_id, service_id, ansible_id, name, content_type_id, is_partially_migrated)
		VALUES ($1, $2::uuid, $3::uuid, $4, $5, false)`, fmt.Sprint(objectID), serviceID, newUUID(), name, ctID)
	return err
}

// RenameResource keeps the registry name in step.
func RenameResource(ctx context.Context, q db.Querier, typeName string, objectID int64, name string) error {
	_, err := q.Exec(ctx, `UPDATE dab_resource_registry_resource SET name = $3 WHERE object_id = $1 AND content_type_id = (SELECT content_type_id FROM dab_resource_registry_resourcetype WHERE name = $2)`, fmt.Sprint(objectID), typeName, name)
	return err
}

// UnregisterResource removes the registry row.
func UnregisterResource(ctx context.Context, q db.Querier, typeName string, objectID int64) error {
	_, err := q.Exec(ctx, `DELETE FROM dab_resource_registry_resource WHERE object_id = $1 AND content_type_id = (SELECT content_type_id FROM dab_resource_registry_resourcetype WHERE name = $2)`, fmt.Sprint(objectID), typeName)
	return err
}
