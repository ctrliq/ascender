package models

import (
	"context"
	"os"
	"testing"

	"github.com/ctrliq/ascender/internal/db"
)

// Deleting a project removes its updates and SCM inventory sources whole:
// their main_unifiedjob and main_unifiedjobtemplate rows go with the child
// rows. Runs on an existing project in a transaction that is rolled back.
func TestDeleteProjectLeavesNoParentRows(t *testing.T) {
	url := os.Getenv("ASCENDER_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("ASCENDER_TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	database, err := db.Open(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	cts, err := LoadContentTypes(ctx, database.Pool)
	if err != nil {
		t.Fatal(err)
	}
	cascader, err := LoadCascader(ctx, database.Pool)
	if err != nil {
		t.Fatal(err)
	}
	var project int64
	if err := database.Pool.QueryRow(ctx, `SELECT project_id FROM main_projectupdate GROUP BY project_id ORDER BY count(*) DESC LIMIT 1`).Scan(&project); err != nil {
		t.Skip("no project with updates")
	}
	tx, err := database.Pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	updates, err := ScanIDs(ctx, tx, `SELECT unifiedjob_ptr_id FROM main_projectupdate WHERE project_id = $1`, project)
	if err != nil {
		t.Fatal(err)
	}
	sources, err := ScanIDs(ctx, tx, `SELECT unifiedjobtemplate_ptr_id FROM main_inventorysource WHERE source_project_id = $1`, project)
	if err != nil {
		t.Fatal(err)
	}
	if err := DeleteProject(ctx, tx, project, cts, cascader); err != nil {
		t.Fatal(err)
	}
	var orphanJobs, orphanTemplates int
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM main_unifiedjob WHERE id = ANY($1)`, updates).Scan(&orphanJobs); err != nil {
		t.Fatal(err)
	}
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM main_unifiedjobtemplate WHERE id = ANY($1) OR id = $2`, sources, project).Scan(&orphanTemplates); err != nil {
		t.Fatal(err)
	}
	if orphanJobs != 0 || orphanTemplates != 0 {
		t.Errorf("project %d (%d updates, %d sources): %d main_unifiedjob and %d main_unifiedjobtemplate rows left", project, len(updates), len(sources), orphanJobs, orphanTemplates)
	}
	t.Logf("project %d: %d updates, %d SCM sources removed whole", project, len(updates), len(sources))
}
