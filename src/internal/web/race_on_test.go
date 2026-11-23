//go:build race

package web

// raceEnabled scales the timing checks: the race detector runs code
// several times slower.
const raceEnabled = true
