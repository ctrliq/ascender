package api

import (
	"context"
	"testing"
)

func TestReadMemo(t *testing.T) {
	loads := 0
	load := func() int { loads++; return loads }
	// Without a memo every call loads.
	ctx := context.Background()
	if memoized(ctx, "k", load) != 1 || memoized(ctx, "k", load) != 2 {
		t.Fatal("no memo should load every time")
	}
	ctx = WithReadMemo(ctx)
	if WithReadMemo(ctx) != ctx {
		t.Fatal("nested read requests share the memo")
	}
	a := memoized(ctx, "k", load)
	if b := memoized(ctx, "k", load); a != b {
		t.Fatalf("memoized twice: %d then %d", a, b)
	}
	remember(ctx, "pre", 7)
	if v := memoized(ctx, "pre", load); v != 7 {
		t.Fatalf("remembered value not used: %d", v)
	}
	// A write hides the memo from itself and empties it for later reads.
	w := withoutReadMemo(ctx)
	if hasReadMemo(w) {
		t.Fatal("write request sees the memo")
	}
	if v := memoized(ctx, "k", load); v == a {
		t.Fatal("memo survived a write")
	}
}
