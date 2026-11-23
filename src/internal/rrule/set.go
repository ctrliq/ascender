package rrule

import (
	"fmt"
	"regexp"
	"strings"
	"time"
)

// SetIterator merges the rules of a set in time order, dropping the dates
// its exclusion rules produce (rruleset._iter).
type SetIterator struct {
	rules   []*cursor
	exrules []*cursor
	last    *time.Time
}

type cursor struct {
	it  *Iterator
	cur Occurrence
	ok  bool
}

func newCursor(r *Rule) *cursor {
	c := &cursor{it: r.Iter()}
	c.advance()
	return c
}

func (c *cursor) advance() { c.cur, c.ok = c.it.Next() }

// Iter starts iterating the set from its DTSTART.
func (s *Set) Iter() *SetIterator {
	si := &SetIterator{}
	for _, r := range s.Rules {
		if c := newCursor(r); c.ok {
			si.rules = append(si.rules, c)
		}
	}
	for _, r := range s.ExRules {
		if c := newCursor(r); c.ok {
			si.exrules = append(si.exrules, c)
		}
	}
	return si
}

func earliest(cs []*cursor) int {
	best := -1
	for i, c := range cs {
		if !c.ok {
			continue
		}
		if best < 0 || c.cur.Time.Before(cs[best].cur.Time) {
			best = i
		}
	}
	return best
}

// Next returns the next occurrence of the set.
func (si *SetIterator) Next() (Occurrence, bool) {
	for {
		i := earliest(si.rules)
		if i < 0 {
			return Occurrence{}, false
		}
		c := si.rules[i]
		o := c.cur
		c.advance()
		if si.last != nil && si.last.Equal(o.Time) {
			continue // the same date from another rule
		}
		// drop exclusion dates before this one, then check equality
		excluded := false
		for {
			j := earliest(si.exrules)
			if j < 0 {
				break
			}
			ex := si.exrules[j]
			if ex.cur.Time.Before(o.Time) {
				ex.advance()
				continue
			}
			if ex.cur.Time.Equal(o.Time) {
				excluded = true
			}
			break
		}
		t := o.Time
		si.last = &t
		if excluded {
			continue
		}
		return o, true
	}
}

// After returns the first occurrence after t (or at t when inc).
func (s *Set) After(t time.Time, inc bool) (Occurrence, bool) {
	it := s.Iter()
	for {
		o, ok := it.Next()
		if !ok {
			return Occurrence{}, false
		}
		if o.Time.After(t) || (inc && o.Time.Equal(t)) {
			return o, true
		}
	}
}

// XAfter returns up to count occurrences after t.
func (s *Set) XAfter(t time.Time, count int) []Occurrence {
	var out []Occurrence
	it := s.Iter()
	for len(out) < count {
		o, ok := it.Next()
		if !ok {
			break
		}
		if o.Time.After(t) {
			out = append(out, o)
		}
	}
	return out
}

// First is the first occurrence of the set.
func (s *Set) First() (Occurrence, bool) {
	return s.Iter().Next()
}

// IsFinite reports whether every rule has a COUNT or UNTIL, so the set has
// a last occurrence.
func (s *Set) IsFinite() bool {
	for _, r := range s.Rules {
		if !r.HasCount && !r.HasUntil {
			return false
		}
	}
	return true
}

// maxOccurrences bounds the walk to the last occurrence of a finite set.
const maxOccurrences = 1000000

// Last is the last occurrence of a finite set.
func (s *Set) Last() (Occurrence, bool) {
	if !s.IsFinite() {
		return Occurrence{}, false
	}
	it := s.Iter()
	var last Occurrence
	found := false
	for n := 0; n < maxOccurrences; n++ {
		o, ok := it.Next()
		if !ok {
			break
		}
		last, found = o, true
	}
	return last, found
}

// --- the schedule model's helpers (main/models/schedules.py) ---------------

var (
	dtstartRe   = regexp.MustCompile(`DTSTART[^\s]+`)
	untilRe     = regexp.MustCompile(`(?i).*?(UNTIL=[0-9]+T[0-9]+)(Z?)`)
	dtstartTZRe = regexp.MustCompile(`(?i)DTSTART;TZID=([^:]+):`)
	ffStartRe   = regexp.MustCompile(`(DTSTART[^:]*):[^T]+T`)
)

// CoerceNaiveUntil rewrites UNTIL values without a Z as the UTC equivalent
// of that wall clock time in the DTSTART zone (Schedule.coerce_naive_until).
func CoerceNaiveUntil(text string) (string, error) {
	start := dtstartRe.FindString(text)
	if start == "" {
		// the old model's regex match failed and its .group() raised this
		return "", fmt.Errorf("'NoneType' object has no attribute 'group'")
	}
	rules := strings.Fields(text)
	for i, rule := range rules {
		if !strings.Contains(strings.ToLower(rule), "until=") {
			continue
		}
		m := untilRe.FindStringSubmatch(rule)
		if m == nil || m[2] != "" {
			continue
		}
		naive := m[1]
		// the zone comes from DTSTART; a Z copy parses for its location
		tzid := "UTC"
		if tm := dtstartTZRe.FindStringSubmatch(start); tm != nil {
			tzid = tm[1]
		}
		if _, err := time.LoadLocation(tzid); err != nil {
			continue // the parser reports the zone
		}
		stamp := naive[len("UNTIL="):]
		local, err := parseDateTime(stamp, tzid)
		if err != nil {
			return "", err
		}
		utc := "UNTIL=" + local.UTC().Format("20060102T150405Z")
		rules[i] = strings.Replace(rule, naive, utc, 1)
	}
	return strings.Join(rules, " "), nil
}

// ParseSchedule parses a schedule's rrule the way Schedule.rrulestr did:
// naive UNTILs are coerced, a TZID is required, and a minutely or hourly
// rule without COUNT whose first occurrence is more than a week old is
// restarted a week before now so iterating it stays cheap. The returned
// text is the rrule after coercion.
func ParseSchedule(text string, now time.Time) (*Set, string, error) {
	coerced, err := CoerceNaiveUntil(text)
	if err != nil {
		return nil, "", err
	}
	set, err := ParseSet(coerced)
	if err != nil {
		return nil, "", err
	}
	if first, ok := set.First(); ok {
		if int(now.Sub(first.Time).Hours()/24) > 7 {
			for _, r := range set.Rules {
				if (r.Freq == Minutely || r.Freq == Hourly) && !r.HasCount {
					newStart := now.Add(-7 * 24 * time.Hour).UTC().Format("20060102")
					rewritten := ffStartRe.ReplaceAllString(coerced, "${1}:"+newStart+"T")
					set2, err := ParseSet(rewritten)
					if err != nil {
						return nil, "", err
					}
					return set2, coerced, nil
				}
			}
		}
	}
	return set, coerced, nil
}

// Timezone is the zone name of DTSTART as the API reported it: the TZID,
// or UTC.
func Timezone(text string) string {
	if m := dtstartTZRe.FindStringSubmatch(text); m != nil {
		if m[1] == "UTC" {
			return "UTC"
		}
		return m[1]
	}
	return "UTC"
}

// Until is the UNTIL of the first rule that has one, shown in DTSTART's
// zone without an offset, or "".
func (s *Set) Until() string {
	for _, r := range s.Rules {
		if r.HasUntil {
			return r.Until.In(s.DTStart.Location()).Format("2006-01-02T15:04:05")
		}
	}
	return ""
}
