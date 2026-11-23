package db

import (
	"context"
	"sync"

	"github.com/jackc/pgx/v5"
)

// Work to do once a transaction commits, as Django's
// transaction.on_commit: the old application sent its activity stream log
// records that way, so a change that rolled back sent none.

// commitHooks maps a connection to the hooks of the transaction running
// on it. A transaction is known by its connection because a savepoint
// (tx.Begin) runs on the connection of the transaction it is part of, and
// hooks registered in a savepoint wait for the outer commit.
var commitHooks = struct {
	sync.Mutex
	m map[*pgx.Conn]*hookList
}{m: map[*pgx.Conn]*hookList{}}

type hookList struct{ fns []func() }

// Begin starts a transaction on b (the pool, or a connection taken from
// it) whose AfterCommit hooks run when it commits. Tx uses it; a caller
// that commits by hand uses it too.
func Begin(ctx context.Context, b interface {
	Begin(context.Context) (pgx.Tx, error)
}) (pgx.Tx, error) {
	tx, err := b.Begin(ctx)
	if err != nil {
		return nil, err
	}
	t := &trackedTx{Tx: tx, conn: tx.Conn(), hooks: &hookList{}}
	commitHooks.Lock()
	commitHooks.m[t.conn] = t.hooks
	commitHooks.Unlock()
	return t, nil
}

type trackedTx struct {
	pgx.Tx
	conn  *pgx.Conn
	hooks *hookList
	done  bool
}

// take forgets the transaction's hooks and returns them. The connection
// may serve another transaction once this one ends; only this one's list
// is removed.
func (t *trackedTx) take() []func() {
	if t.done {
		return nil
	}
	t.done = true
	commitHooks.Lock()
	defer commitHooks.Unlock()
	if commitHooks.m[t.conn] == t.hooks {
		delete(commitHooks.m, t.conn)
	}
	return t.hooks.fns
}

func (t *trackedTx) Commit(ctx context.Context) error {
	err := t.Tx.Commit(ctx)
	fns := t.take()
	if err != nil {
		return err
	}
	for _, fn := range fns {
		fn()
	}
	return nil
}

func (t *trackedTx) Rollback(ctx context.Context) error {
	t.take()
	return t.Tx.Rollback(ctx)
}

// AfterCommit runs fn once the transaction q belongs to commits, and
// never if it rolls back. Outside a transaction started by Begin or Tx (q
// is the pool, or a connection in autocommit) fn runs at once: there is
// nothing to wait for.
func AfterCommit(q Querier, fn func()) {
	if c, ok := q.(interface{ Conn() *pgx.Conn }); ok {
		commitHooks.Lock()
		h := commitHooks.m[c.Conn()]
		if h != nil {
			h.fns = append(h.fns, fn)
		}
		commitHooks.Unlock()
		if h != nil {
			return
		}
	}
	fn()
}
