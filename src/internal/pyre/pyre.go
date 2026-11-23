// Package pyre compiles and matches Python regular expressions as the old
// application's Python 3.14 did. The pattern is parsed by a port of
// CPython's re parser, so a bad pattern is refused with re.error's exact
// message, and matched by regexp2 with Python's semantics written out.
package pyre

import (
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/dlclark/regexp2"
)

// Flags are re's flag values.
type Flags int

const (
	IgnoreCase Flags = 2
	Locale     Flags = 4
	Multiline  Flags = 8
	DotAll     Flags = 16
	Unicode    Flags = 32
	Verbose    Flags = 64
	ASCII      Flags = 256
)

// FlagsFrom reads the "i" and "m" letters the SSO maps keep after a
// "/pattern/".
func FlagsFrom(s string) Flags {
	var f Flags
	if strings.Contains(s, "i") {
		f |= IgnoreCase
	}
	if strings.Contains(s, "m") {
		f |= Multiline
	}
	return f
}

// Error is re.error (re.PatternError). Pos is -1 when the error has no
// position.
type Error struct {
	Msg     string
	Pattern string
	Pos     int
}

// Error is str() of the exception: the message, then the position, and the
// line and column when the pattern spans lines.
func (e *Error) Error() string {
	if e.Pos < 0 {
		return e.Msg
	}
	msg := fmt.Sprintf("%s at position %d", e.Msg, e.Pos)
	if strings.ContainsRune(e.Pattern, '\n') {
		runes := []rune(e.Pattern)
		line, last := 1, -1
		for i, r := range runes[:min(e.Pos, len(runes))] {
			if r == '\n' {
				line, last = line+1, i
			}
		}
		msg = fmt.Sprintf("%s (line %d, column %d)", msg, line, e.Pos-last)
	}
	return msg
}

// OverflowError and ValueError are the other exceptions re.compile raises
// for a pattern (a repeat count past MAXREPEAT, incompatible flags).
type OverflowError struct{ Msg string }

func (e *OverflowError) Error() string { return e.Msg }

type ValueError struct{ Msg string }

func (e *ValueError) Error() string { return e.Msg }

// Regexp is a compiled pattern.
type Regexp struct {
	re     *regexp2.Regexp
	groups int
}

// MatchTimeout bounds one match: Python had no limit, so a pattern that
// backtracks without end hung the login; here it fails to match instead.
var MatchTimeout = time.Second

// Compile is re.compile(pattern, flags), for Match.
func Compile(pattern string, flags Flags) (*Regexp, error) {
	return compile(pattern, flags, true)
}

// CompileSearch is re.compile(pattern, flags), for Split.
func CompileSearch(pattern string, flags Flags) (*Regexp, error) {
	return compile(pattern, flags, false)
}

// MustCompileSearch is CompileSearch for a known good pattern.
func MustCompileSearch(pattern string, flags Flags) *Regexp {
	re, err := CompileSearch(pattern, flags)
	if err != nil {
		panic(err)
	}
	return re
}

func compile(pattern string, flags Flags, anchored bool) (*Regexp, error) {
	p, err := parse(pattern, flags)
	if err != nil {
		return nil, err
	}
	f := p.state.flags
	opts := regexp2.None
	if f&IgnoreCase != 0 {
		opts |= regexp2.IgnoreCase
	}
	if f&Multiline != 0 {
		opts |= regexp2.Multiline
	}
	if f&DotAll != 0 {
		opts |= regexp2.Singleline
	}
	body := translate(p, f&ASCII != 0)
	if anchored {
		// re.match: anchored at the start only.
		body = `\A(?:` + body + `)`
	}
	re, err := regexp2.Compile(body, opts)
	if err != nil {
		return nil, fmt.Errorf("pyre: translating %q: %w", pattern, err)
	}
	re.MatchTimeout = MatchTimeout
	return &Regexp{re: re, groups: p.state.groups() - 1}, nil
}

// Split is re.split(pattern, s): the text between matches, with each
// match's groups ("" for a group that did not take part).
func (r *Regexp) Split(s string) []string {
	runes := []rune(s)
	var out []string
	last := 0
	m, err := r.re.FindRunesMatch(runes)
	for err == nil && m != nil {
		out = append(out, string(runes[last:m.Index]))
		for g := 1; g <= r.groups; g++ {
			grp := m.GroupByName(fmt.Sprintf("g%d", g))
			if grp != nil && len(grp.Captures) > 0 {
				out = append(out, grp.String())
			} else {
				out = append(out, "")
			}
		}
		last = m.Index + m.Length
		m, err = r.re.FindNextMatch(m)
	}
	return append(out, string(runes[last:]))
}

// FindAll is re.findall's match count and texts for a pattern without
// groups.
func (r *Regexp) FindAll(s string) []string {
	var out []string
	m, err := r.re.FindStringMatch(s)
	for err == nil && m != nil {
		out = append(out, m.String())
		m, err = r.re.FindNextMatch(m)
	}
	return out
}

// Match is re.match(pattern, s) is not None.
func (r *Regexp) Match(s string) bool {
	ok, err := r.re.MatchString(s)
	return err == nil && ok
}

var (
	cacheMu sync.Mutex
	cache   = map[cacheKey]cached{}
)

type cacheKey struct {
	pattern string
	flags   Flags
}

type cached struct {
	re  *Regexp
	err error
}

// MatchString is re.match(pattern, s, flags) for a pattern compiled once and
// cached; a pattern that does not compile matches nothing.
func MatchString(pattern string, flags Flags, s string) bool {
	key := cacheKey{pattern, flags}
	cacheMu.Lock()
	c, ok := cache[key]
	if !ok {
		re, err := Compile(pattern, flags)
		c = cached{re, err}
		if len(cache) > 1000 {
			cache = map[cacheKey]cached{}
		}
		cache[key] = c
	}
	cacheMu.Unlock()
	return c.err == nil && c.re.Match(s)
}

// Check is re.compile's verdict on a pattern without building a matcher:
// nil, or the *Error, *OverflowError or *ValueError Python raised.
func Check(pattern string, flags Flags) error {
	_, err := parse(pattern, flags)
	return err
}
