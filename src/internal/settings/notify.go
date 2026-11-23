package settings

import (
	"context"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5"
)

// Channel is the LISTEN/NOTIFY channel a settings write is announced on.
// The old application cleared the shared cache when a setting was saved
// and every process read it again; here every process holds a listener
// on this channel and reloads its own cache when told.
const Channel = "ascender_settings"

// notify announces a write to the other processes. NOTIFY is
// transactional: PostgreSQL delivers it when tx commits, and drops it when
// tx rolls back, so a listener never reloads before the write is visible
// and never for one that did not happen. The payload is the store's token,
// which its own listener skips (the writer reloads itself).
func (s *Store) notify(ctx context.Context, tx pgxTx) error {
	_, err := tx.Exec(ctx, `SELECT pg_notify($1, $2)`, Channel, s.token)
	return err
}

// Listen holds a connection of its own, outside the pool, listening on
// Channel, and reloads the cache whenever another process announces a
// write, until ctx ends. Each time it (re)connects it reloads too, for
// writes announced while it was not listening; the reload every ttl stays
// the fallback for anything else missed.
func (s *Store) Listen(ctx context.Context) {
	backoff := time.Second
	for ctx.Err() == nil {
		err := s.listenOnce(ctx)
		// A connection that came up starts the backoff over: only
		// repeated failures to connect wait longer.
		if s.listening.Swap(false) {
			backoff = time.Second
		}
		if ctx.Err() != nil {
			return
		}
		slog.WarnContext(ctx, "settings: change listener disconnected; reconnecting (settings still reload every "+s.ttl.String()+")", "err", err)
		select {
		case <-ctx.Done():
			return
		case <-time.After(backoff):
		}
		if backoff < 30*time.Second {
			backoff *= 2
		}
	}
}

func (s *Store) listenOnce(ctx context.Context) error {
	cfg := s.db.Pool.Config().ConnConfig.Copy()
	conn, err := pgx.ConnectConfig(ctx, cfg)
	if err != nil {
		return err
	}
	defer func() {
		cctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = conn.Close(cctx)
	}()
	if _, err := conn.Exec(ctx, "LISTEN "+Channel); err != nil {
		return err
	}
	s.listening.Store(true)
	// Whatever changed while nobody listened.
	if err := s.Reload(ctx); err != nil && ctx.Err() == nil {
		slog.ErrorContext(ctx, "settings: reload failed", "err", err)
	}
	for {
		n, err := conn.WaitForNotification(ctx)
		if err != nil {
			return err
		}
		if n.Payload == s.token {
			continue
		}
		if err := s.Reload(ctx); err != nil && ctx.Err() == nil {
			// Reload cleared loadedAt: the next read tries again.
			slog.ErrorContext(ctx, "settings: reload after a change failed", "err", err)
		}
	}
}
