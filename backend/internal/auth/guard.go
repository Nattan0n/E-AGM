package auth

import (
	"sync"
	"time"
)

// FailGuard counts failures per key and locks the key out for a while once the limit is hit.
// In-memory and per process; good enough to stop online guessing on a single instance.
type FailGuard struct {
	mu     sync.Mutex
	m      map[string]*failEntry
	Max    int
	Window time.Duration
	Lock   time.Duration
}

type failEntry struct {
	n     int
	first time.Time
	until time.Time
}

func NewFailGuard(max int, window, lock time.Duration) *FailGuard {
	return &FailGuard{m: map[string]*failEntry{}, Max: max, Window: window, Lock: lock}
}

// Allowed reports whether key may try again.
func (g *FailGuard) Allowed(key string) bool {
	g.mu.Lock()
	defer g.mu.Unlock()
	e := g.m[key]
	return e == nil || !time.Now().Before(e.until)
}

// Fail records a failed attempt.
func (g *FailGuard) Fail(key string) {
	g.mu.Lock()
	defer g.mu.Unlock()
	now := time.Now()
	if len(g.m) > 10000 {
		for k, e := range g.m {
			if now.After(e.until) && now.Sub(e.first) > g.Window {
				delete(g.m, k)
			}
		}
	}
	e := g.m[key]
	if e == nil || now.Sub(e.first) > g.Window {
		e = &failEntry{first: now}
		g.m[key] = e
	}
	e.n++
	if e.n >= g.Max {
		e.until = now.Add(g.Lock)
		e.n = 0
		e.first = now
	}
}

// Reset clears the failures for key (after a success).
func (g *FailGuard) Reset(key string) {
	g.mu.Lock()
	delete(g.m, key)
	g.mu.Unlock()
}
