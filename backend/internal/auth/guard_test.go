package auth

import (
	"testing"
	"time"
)

func TestFailGuardLocksAfterMax(t *testing.T) {
	g := NewFailGuard(3, time.Minute, time.Minute)
	for i := 0; i < 2; i++ {
		g.Fail("k")
		if !g.Allowed("k") {
			t.Fatalf("locked too early after %d failures", i+1)
		}
	}
	g.Fail("k")
	if g.Allowed("k") {
		t.Fatal("should be locked after 3 failures")
	}
	if !g.Allowed("other") {
		t.Fatal("other keys must be unaffected")
	}
}

func TestFailGuardReset(t *testing.T) {
	g := NewFailGuard(2, time.Minute, time.Minute)
	g.Fail("k")
	g.Fail("k")
	g.Reset("k")
	if !g.Allowed("k") {
		t.Fatal("reset should unlock")
	}
}

func TestFailGuardUnlocksAfterLockTime(t *testing.T) {
	g := NewFailGuard(1, time.Minute, 10*time.Millisecond)
	g.Fail("k")
	time.Sleep(20 * time.Millisecond)
	if !g.Allowed("k") {
		t.Fatal("lock should expire")
	}
}
