package db

import (
	"context"
	"errors"
	"os"
	"testing"

	"github.com/jackc/pgx/v5"
)

// AfterCommit hooks run once the transaction commits, never when it rolls
// back; a hook registered in a savepoint waits for the outer commit; with
// the pool there is nothing to wait for.
func TestAfterCommit(t *testing.T) {
	url := os.Getenv("ASCENDER_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("ASCENDER_TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	d, err := Open(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer d.Close()
	var ran []string
	err = d.Tx(ctx, func(tx pgx.Tx) error {
		AfterCommit(tx, func() { ran = append(ran, "outer") })
		sp, err := tx.Begin(ctx)
		if err != nil {
			return err
		}
		AfterCommit(sp, func() { ran = append(ran, "savepoint") })
		if err := sp.Commit(ctx); err != nil {
			return err
		}
		if len(ran) != 0 {
			t.Errorf("ran before the commit: %v", ran)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(ran) != 2 || ran[0] != "outer" || ran[1] != "savepoint" {
		t.Errorf("after commit: %v", ran)
	}
	ran = nil
	err = d.Tx(ctx, func(tx pgx.Tx) error {
		AfterCommit(tx, func() { ran = append(ran, "rolled back") })
		return errors.New("zz")
	})
	if err == nil || len(ran) != 0 {
		t.Errorf("rollback: %v %v", err, ran)
	}
	AfterCommit(d.Pool, func() { ran = append(ran, "pool") })
	if len(ran) != 1 {
		t.Errorf("pool: %v", ran)
	}
	// A connection's next transaction does not inherit hooks.
	ran = nil
	tx, err := Begin(ctx, d.Pool)
	if err != nil {
		t.Fatal(err)
	}
	AfterCommit(tx, func() { ran = append(ran, "first") })
	_ = tx.Rollback(ctx)
	_ = d.Tx(ctx, func(tx pgx.Tx) error { return nil })
	if len(ran) != 0 {
		t.Errorf("hooks leaked: %v", ran)
	}
}
