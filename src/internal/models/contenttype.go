// Package models holds the Go representations of the old application's
// database rows and the queries that load and store them. Each file covers
// one area of the schema. Field names follow the API field names where the
// two differ from the column names.
package models

import (
	"context"
	"fmt"
	"sync"

	"github.com/ctrliq/ascender/internal/db"
)

// ContentTypes maps Django model names (lower case, no underscores, as
// stored in django_content_type) to their ids. The RBAC tables and the
// polymorphic unified job tables refer to models by these ids, so they are
// loaded once at startup rather than hard coded.
type ContentTypes struct {
	mu    sync.RWMutex
	byKey map[string]int64
	byID  map[int64]string
}

// LoadContentTypes reads django_content_type.
func LoadContentTypes(ctx context.Context, q db.Querier) (*ContentTypes, error) {
	rows, err := q.Query(ctx, `SELECT id, app_label, model FROM django_content_type`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	ct := &ContentTypes{byKey: map[string]int64{}, byID: map[int64]string{}}
	for rows.Next() {
		var id int64
		var app, model string
		if err := rows.Scan(&id, &app, &model); err != nil {
			return nil, err
		}
		ct.byKey[app+"."+model] = id
		ct.byID[id] = app + "." + model
	}
	return ct, rows.Err()
}

// ID returns the content type id for "app.model", panicking when the model
// is unknown because that is a programming error, not a runtime condition.
func (c *ContentTypes) ID(key string) int64 {
	c.mu.RLock()
	defer c.mu.RUnlock()
	id, ok := c.byKey[key]
	if !ok {
		panic(fmt.Sprintf("unknown content type %q", key))
	}
	return id
}

// Lookup returns the id and whether it exists.
func (c *ContentTypes) Lookup(key string) (int64, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	id, ok := c.byKey[key]
	return id, ok
}

// Model returns "app.model" for an id.
func (c *ContentTypes) Model(id int64) string {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.byID[id]
}
