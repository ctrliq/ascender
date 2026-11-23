package api

import (
	"context"
	"runtime/debug"
	"sync"
	"time"
)

// background tracks the work a request leaves running after it answers
// (notifications, webhook statuses, instance group policies), so that
// shutdown can let it finish before the pool closes under it.
type background struct {
	mu     sync.Mutex
	wg     sync.WaitGroup
	ctx    context.Context
	cancel context.CancelFunc
	closed bool
}

// Background runs fn in its own goroutine with a context that outlives the
// request and ends at shutdown (StopBackground). After shutdown has begun
// fn does not run.
func (s *Server) Background(fn func(ctx context.Context)) {
	b := &s.bg
	b.mu.Lock()
	if b.closed {
		b.mu.Unlock()
		s.Log.Warn("background work dropped: shutting down")
		return
	}
	if b.ctx == nil {
		b.ctx, b.cancel = context.WithCancel(context.Background())
	}
	ctx := b.ctx
	b.wg.Add(1)
	b.mu.Unlock()
	go func() {
		defer b.wg.Done()
		defer func() {
			if p := recover(); p != nil {
				s.Log.Error("background work panicked", "panic", p, "stack", string(debug.Stack()))
			}
		}()
		fn(ctx)
	}()
}

// StopBackground refuses new background work and waits up to grace for
// the running work to finish; then it cancels what is left and waits a
// moment for it to return. It reports whether everything finished.
func (s *Server) StopBackground(grace time.Duration) bool {
	b := &s.bg
	b.mu.Lock()
	b.closed = true
	cancel := b.cancel
	b.mu.Unlock()
	done := make(chan struct{})
	go func() { b.wg.Wait(); close(done) }()
	select {
	case <-done:
		return true
	case <-time.After(grace):
	}
	if cancel != nil {
		cancel()
	}
	select {
	case <-done:
		return true
	case <-time.After(2 * time.Second):
		return false
	}
}
