package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"testing"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/models"
)

// PUT on variable_data stores json.dumps(data): Python's separators,
// non-ASCII escaped, and <, > and & as they are.
func TestVariableDataStoredAsJSONDumps(t *testing.T) {
	d := newDBServer(t, "zz-variable-data-test")
	ctx := context.Background()
	var org int64
	if err := d.Q().QueryRow(ctx, `SELECT id FROM main_organization ORDER BY id LIMIT 1`).Scan(&org); err != nil {
		t.Skip("no organization")
	}
	st, body := d.do("POST", "/api/v2/inventories/", map[string]any{"name": "zz-variable-data-test", "organization": org})
	d.expect(st, body, http.StatusCreated, "")
	inv := d.id(body)
	t.Cleanup(func() {
		_ = d.DB.Tx(ctx, func(tx pgx.Tx) error { return models.DeleteInventory(ctx, tx, inv, d.CT, d.Cascade) })
	})
	// Keys in sorted order, the order the test request writes them.
	vars := map[string]any{"a": "<b>&é", "k": []any{1, map[string]any{"x": nil}}, "n": json.Number("1.0")}
	st, body = d.do("PUT", fmt.Sprintf("/api/v2/inventories/%d/variable_data/", inv), vars)
	d.expect(st, body, http.StatusOK, "")
	var stored string
	if err := d.Q().QueryRow(ctx, `SELECT variables FROM main_inventory WHERE id = $1`, inv).Scan(&stored); err != nil {
		t.Fatal(err)
	}
	// json.dumps({"a": "<b>&é", "k": [1, {"x": None}], "n": 1.0})
	if want := `{"a": "<b>&` + `\u00e9", "k": [1, {"x": null}], "n": 1.0}`; stored != want {
		t.Errorf("stored %s, want %s", stored, want)
	}
}
