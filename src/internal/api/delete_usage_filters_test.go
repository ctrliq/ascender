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

// The filters the old UI's delete warnings (relatedResourceDeleteRequests)
// use on a credential, which the old API accepted through the models'
// fields: credentials on projects and inventory sources (the unified job
// template's many-to-many) and credential on execution environments.
func TestDeleteUsageCredentialFilters(t *testing.T) {
	d := newDBServer(t, "zz-delete-usage-filters-test")
	ctx := context.Background()
	st, body := d.do("POST", "/api/v2/organizations/", map[string]any{"name": "zz-delete-usage-filters-test"})
	d.expect(st, body, http.StatusCreated, "")
	org := d.id(body)
	var cred, ee int64
	t.Cleanup(func() {
		err := d.DB.Tx(ctx, func(tx pgx.Tx) error {
			if ee != 0 {
				if err := d.Cascade.Delete(ctx, tx, "main_executionenvironment", "id", []int64{ee}); err != nil {
					return err
				}
			}
			if cred != 0 {
				if err := models.DeleteCredential(ctx, tx, cred, d.CT, d.Cascade); err != nil {
					return err
				}
			}
			return models.DeleteOrganization(ctx, tx, org, d.CT, d.Cascade)
		})
		if err != nil {
			t.Errorf("cleanup: %v", err)
		}
	})
	var registry int64
	if err := d.Q().QueryRow(ctx, `SELECT id FROM main_credentialtype WHERE namespace = 'registry' AND managed`).Scan(&registry); err != nil {
		t.Skip("no registry credential type")
	}
	st, body = d.do("POST", "/api/v2/credentials/", map[string]any{"name": "zz-delete-usage-filters-test", "credential_type": registry, "organization": org,
		"inputs": map[string]any{"host": "quay.io", "username": "zz", "password": "zz"}})
	d.expect(st, body, http.StatusCreated, "")
	cred = d.id(body)
	st, body = d.do("POST", "/api/v2/execution_environments/", map[string]any{"name": "zz-delete-usage-filters-test", "image": "quay.io/zz/ee:latest", "credential": cred, "organization": org})
	d.expect(st, body, http.StatusCreated, "")
	ee = d.id(body)

	for path, want := range map[string]int{
		fmt.Sprintf("/api/v2/execution_environments/?credential=%d", cred):                                 1,
		fmt.Sprintf("/api/v2/execution_environments/?credential__name=%s", "zz-delete-usage-filters-test"): 1,
		fmt.Sprintf("/api/v2/projects/?credentials=%d", cred):                                              0,
		fmt.Sprintf("/api/v2/inventory_sources/?credentials__id=%d", cred):                                 0,
		fmt.Sprintf("/api/v2/inventories/?inventory_sources__credentials=%d", cred):                        0,
	} {
		st, body := d.do("GET", path, nil)
		var list struct {
			Count int `json:"count"`
		}
		if st != http.StatusOK || json.Unmarshal([]byte(body), &list) != nil || list.Count != want {
			t.Errorf("%s: %d %s, want count %d", path, st, body, want)
		}
	}
}
