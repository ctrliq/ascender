package api

import (
	"testing"
	"time"
)

func TestSAMLAssertionReplay(t *testing.T) {
	c := &samlAssertionCache{seen: map[string]int64{}}
	until := time.Now().Unix() + 60
	if !c.firstUse("_a1", until) || c.firstUse("_a1", until) {
		t.Fatal("replay accepted")
	}
	if !c.firstUse("_a2", until) {
		t.Fatal("new assertion refused")
	}
	if !c.firstUse("_old", time.Now().Unix()-1) || !c.firstUse("_old", until) {
		t.Fatal("expired entry still blocks")
	}
}
