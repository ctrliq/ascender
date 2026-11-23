// Package rrule iterates iCalendar recurrence rules the way python-dateutil
// did for the old application's schedules: the same defaults, the same
// BYxxx handling, the same ordering, and rule sets with EXRULE exclusions.
// Occurrences carry the zone of DTSTART.
package rrule

import (
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"
)

// Freq is the recurrence frequency, numbered as dateutil numbers them.
type Freq int

const (
	Yearly Freq = iota
	Monthly
	Weekly
	Daily
	Hourly
	Minutely
	Secondly
)

var freqNames = map[string]Freq{"YEARLY": Yearly, "MONTHLY": Monthly, "WEEKLY": Weekly, "DAILY": Daily, "HOURLY": Hourly, "MINUTELY": Minutely, "SECONDLY": Secondly}

// Weekday is a BYDAY entry: Day is 0 (Monday) to 6 (Sunday) and N the
// optional ordinal (+1MO, -1FR), 0 when absent.
type Weekday struct {
	Day int
	N   int
}

var weekdayNames = map[string]int{"MO": 0, "TU": 1, "WE": 2, "TH": 3, "FR": 4, "SA": 5, "SU": 6}

// Rule is one RRULE or EXRULE with its DTSTART.
type Rule struct {
	Freq       Freq
	Interval   int
	Count      int
	HasCount   bool
	Until      time.Time
	HasUntil   bool
	DTStart    time.Time
	start      wall // DTSTART's wall clock, which may not exist (DST gap)
	WKST       int
	ByMonth    []int
	ByMonthDay []int
	ByYearDay  []int
	ByWeekNo   []int
	ByWeekday  []Weekday
	ByHour     []int
	ByMinute   []int
	BySecond   []int
	BySetPos   []int
	// ByEaster are day offsets from Western Easter Sunday (dateutil's
	// BYEASTER extension).
	ByEaster []int
	// Text is the rule as given, without the RRULE:/EXRULE: prefix.
	Text string

	// derived, as rrule.__init__ computed them
	bymonth     []int
	bymonthday  []int
	bynmonthday []int
	byyearday   []int
	byweekno    []int
	byweekday   map[int]bool
	bynweekday  [][2]int
	byhour      map[int]bool
	byminute    map[int]bool
	bysecond    map[int]bool
	bysetpos    []int
	byeaster    []int
	timeset     []tod
	loc         *time.Location
}

type tod struct{ h, m, s int }

// newRule finalises a parsed rule (rrule.__init__).
func newRule(r *Rule) (*Rule, error) {
	if r.Interval == 0 {
		r.Interval = 1
	}
	r.loc = r.DTStart.Location()
	for _, p := range r.BySetPos {
		if p == 0 || p < -366 || p > 366 {
			return nil, fmt.Errorf("bysetpos must be between 1 and 366, or between -366 and -1")
		}
	}
	r.bysetpos = append([]int(nil), r.BySetPos...)
	if r.start.y == 0 {
		r.start = wallOf(r.DTStart)
	}
	dt := r.start
	byMonth, byMonthDay, byWeekday := r.ByMonth, r.ByMonthDay, r.ByWeekday
	hasByWeekday := r.ByWeekday != nil
	if r.ByEaster != nil {
		r.byeaster = sortedCopyInts(r.ByEaster)
	}
	if len(r.ByWeekNo) == 0 && len(r.ByYearDay) == 0 && len(byMonthDay) == 0 && !hasByWeekday && r.ByEaster == nil {
		switch r.Freq {
		case Yearly:
			if len(byMonth) == 0 {
				byMonth = []int{int(dt.Month())}
			}
			byMonthDay = []int{dt.Day()}
		case Monthly:
			byMonthDay = []int{dt.Day()}
		case Weekly:
			byWeekday = []Weekday{{Day: int(dt.Weekday()+6) % 7}}
			hasByWeekday = true
		}
	}
	r.bymonth = sortedUnique(byMonth)
	r.byyearday = sortedUnique(r.ByYearDay)
	for _, d := range byMonthDay {
		if d > 0 {
			r.bymonthday = append(r.bymonthday, d)
		} else {
			r.bynmonthday = append(r.bynmonthday, d)
		}
	}
	r.bymonthday = sortedUnique(r.bymonthday)
	r.bynmonthday = sortedUnique(r.bynmonthday)
	r.byweekno = sortedUnique(r.ByWeekNo)
	if hasByWeekday {
		r.byweekday = map[int]bool{}
		for _, w := range byWeekday {
			if w.N == 0 || r.Freq > Monthly {
				r.byweekday[w.Day] = true
			} else {
				r.bynweekday = append(r.bynweekday, [2]int{w.Day, w.N})
			}
		}
		if len(r.byweekday) == 0 {
			r.byweekday = nil
		}
	}
	var err error
	if r.ByHour == nil {
		if r.Freq < Hourly {
			r.byhour = map[int]bool{dt.Hour(): true}
		}
	} else if r.Freq == Hourly {
		if r.byhour, err = constructBySet(dt.Hour(), r.ByHour, 24, r.Interval); err != nil {
			return nil, err
		}
	} else {
		r.byhour = toSet(r.ByHour)
	}
	if r.ByMinute == nil {
		if r.Freq < Minutely {
			r.byminute = map[int]bool{dt.Minute(): true}
		}
	} else if r.Freq == Minutely {
		if r.byminute, err = constructBySet(dt.Minute(), r.ByMinute, 60, r.Interval); err != nil {
			return nil, err
		}
	} else {
		r.byminute = toSet(r.ByMinute)
	}
	if r.BySecond == nil {
		if r.Freq < Secondly {
			r.bysecond = map[int]bool{dt.Second(): true}
		}
	} else if r.Freq == Secondly {
		if r.bysecond, err = constructBySet(dt.Second(), r.BySecond, 60, r.Interval); err != nil {
			return nil, err
		}
	} else {
		r.bysecond = toSet(r.BySecond)
	}
	if r.Freq < Hourly {
		for _, h := range sortedKeys(r.byhour) {
			for _, m := range sortedKeys(r.byminute) {
				for _, s := range sortedKeys(r.bysecond) {
					r.timeset = append(r.timeset, tod{h, m, s})
				}
			}
		}
		sort.Slice(r.timeset, func(i, j int) bool { return r.timeset[i].less(r.timeset[j]) })
	}
	return r, nil
}

func (t tod) less(o tod) bool {
	if t.h != o.h {
		return t.h < o.h
	}
	if t.m != o.m {
		return t.m < o.m
	}
	return t.s < o.s
}

func sortedUnique(l []int) []int {
	if len(l) == 0 {
		return nil
	}
	m := map[int]bool{}
	for _, v := range l {
		m[v] = true
	}
	return sortedKeys(m)
}

func sortedKeys(m map[int]bool) []int {
	out := make([]int, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Ints(out)
	return out
}

func toSet(l []int) map[int]bool {
	m := map[int]bool{}
	for _, v := range l {
		m[v] = true
	}
	return m
}

func gcd(a, b int) int {
	for b != 0 {
		a, b = b, a%b
	}
	if a < 0 {
		return -a
	}
	return a
}

// constructBySet keeps the BYxxx values reachable from start by interval
// steps (rrule.__construct_byset).
func constructBySet(start int, byxxx []int, base, interval int) (map[int]bool, error) {
	cset := map[int]bool{}
	for _, num := range byxxx {
		g := gcd(interval, base)
		if g == 1 || pyMod(num-start, g) == 0 {
			cset[num] = true
		}
	}
	if len(cset) == 0 {
		return nil, fmt.Errorf("Invalid rrule byxxx generates an empty set.")
	}
	return cset, nil
}

// pyDivmod is Python's divmod for ints (floor division).
func pyDivmod(a, b int) (int, int) {
	q := a / b
	m := a % b
	if m != 0 && (m < 0) != (b < 0) {
		q--
		m += b
	}
	return q, m
}

func pyMod(a, b int) int {
	_, m := pyDivmod(a, b)
	return m
}

// --- parsing ---------------------------------------------------------------

// Set is a DTSTART with its RRULEs and EXRULEs (dateutil's rruleset).
type Set struct {
	DTStart time.Time
	Rules   []*Rule
	ExRules []*Rule
}

// ParseSet reads "DTSTART[;TZID=zone]:... RRULE:... [EXRULE:...]" with
// the parts separated by whitespace, as rrulestr(forceset=True) did.
func ParseSet(text string) (*Set, error) {
	parts := strings.Fields(text)
	if len(parts) == 0 {
		return nil, fmt.Errorf("empty string")
	}
	var dtstart time.Time
	var start wall
	hasStart := false
	var rules, exrules []string
	for _, line := range parts {
		name, value, ok := strings.Cut(line, ":")
		if !ok {
			name, value = "RRULE", line
		}
		params := strings.Split(name, ";")
		switch strings.ToUpper(params[0]) {
		case "DTSTART":
			tzid := ""
			for _, p := range params[1:] {
				k, v, _ := strings.Cut(p, "=")
				if strings.EqualFold(k, "TZID") {
					tzid = v
				}
			}
			w, loc, err := parseWall(value, tzid)
			if err != nil {
				return nil, err
			}
			dtstart, start, hasStart = w.in(loc), w, true
			if loc == naiveLocation {
				dtstart = dtstart.In(naiveLocation)
			}
		case "RRULE":
			rules = append(rules, value)
		case "EXRULE":
			exrules = append(exrules, value)
		case "RDATE", "EXDATE":
			return nil, fmt.Errorf("%s is not supported", strings.ToUpper(params[0]))
		default:
			return nil, fmt.Errorf("unsupported property: %s", params[0])
		}
	}
	if !hasStart || dtstart.Location() == nil {
		// dateutil started such rules from a naive "now"
		return nil, fmt.Errorf("A valid TZID must be provided (e.g., America/New_York)")
	}
	set := &Set{DTStart: dtstart}
	for _, text := range rules {
		r, err := parseRule(text, dtstart, start)
		if err != nil {
			return nil, err
		}
		set.Rules = append(set.Rules, r)
	}
	for _, text := range exrules {
		r, err := parseRule(text, dtstart, start)
		if err != nil {
			return nil, err
		}
		set.ExRules = append(set.ExRules, r)
	}
	return set, nil
}

// naiveLocation marks a DTSTART without zone, which the schedules reject.
var naiveLocation = time.FixedZone("naive", 0)

// wall is a wall clock reading. DTSTART keeps one apart from its instant
// because dateutil iterates from the hour as written even when that time
// does not exist in the zone (a DST gap), which time.Time cannot hold.
type wall struct{ y, mo, d, h, mi, s int }

func wallOf(t time.Time) wall {
	return wall{t.Year(), int(t.Month()), t.Day(), t.Hour(), t.Minute(), t.Second()}
}

func (w wall) Year() int             { return w.y }
func (w wall) Month() time.Month     { return time.Month(w.mo) }
func (w wall) Day() int              { return w.d }
func (w wall) Hour() int             { return w.h }
func (w wall) Minute() int           { return w.mi }
func (w wall) Second() int           { return w.s }
func (w wall) date() time.Time       { return time.Date(w.y, time.Month(w.mo), w.d, 0, 0, 0, 0, time.UTC) }
func (w wall) Weekday() time.Weekday { return w.date().Weekday() }

// in is the instant of the wall clock in a zone, resolved the way
// dateutil's tzfile did: a time in a DST gap takes the offset after the
// transition, an ambiguous time the offset before it (fold=0). Go's
// time.Date makes no such promise, so the transition is located here.
func (w wall) in(loc *time.Location) time.Time {
	if loc == time.UTC || loc == naiveLocation {
		return time.Date(w.y, time.Month(w.mo), w.d, w.h, w.mi, w.s, 0, loc)
	}
	naive := time.Date(w.y, time.Month(w.mo), w.d, w.h, w.mi, w.s, 0, time.UTC)
	lo, hi := naive.Add(-24*time.Hour), naive.Add(24*time.Hour)
	_, offPre := lo.In(loc).Zone()
	_, offPost := hi.In(loc).Zone()
	if offPre == offPost {
		return time.Date(w.y, time.Month(w.mo), w.d, w.h, w.mi, w.s, 0, loc)
	}
	// bisect the transition: hi becomes the first instant with the new offset
	for hi.Sub(lo) > time.Second {
		mid := lo.Add(hi.Sub(lo) / 2)
		if _, off := mid.In(loc).Zone(); off == offPre {
			lo = mid
		} else {
			hi = mid
		}
	}
	transition := hi.Add(time.Duration(offPre) * time.Second) // as a pre-transition wall clock
	off := offPre
	if !naive.Before(transition) {
		off = offPost
	}
	return naive.Add(-time.Duration(off) * time.Second).In(loc)
}

// LocalTime is the instant of a wall clock reading in a zone, resolved the
// way dateutil did for times in a DST gap or an ambiguous hour.
func LocalTime(loc *time.Location, year, month, day, hour, minute, second int) time.Time {
	return wall{year, month, day, hour, minute, second}.in(loc)
}

// parseWall reads YYYYMMDDTHHMMSS[Z] or YYYYMMDD with its zone: the TZID,
// UTC for a Z value, or the naive marker.
func parseWall(value, tzid string) (wall, *time.Location, error) {
	value = strings.TrimSpace(value)
	utc := strings.HasSuffix(strings.ToUpper(value), "Z")
	value = strings.TrimSuffix(strings.TrimSuffix(value, "Z"), "z")
	var w wall
	switch len(value) {
	case 15:
		if value[8] != 'T' && value[8] != 't' {
			return w, nil, fmt.Errorf("invalid datetime: %s", value)
		}
		n, err := fmt.Sscanf(value, "%4d%2d%2dT%2d%2d%2d", &w.y, &w.mo, &w.d, &w.h, &w.mi, &w.s)
		if err != nil || n != 6 {
			return w, nil, fmt.Errorf("invalid datetime: %s", value)
		}
	case 8:
		n, err := fmt.Sscanf(value, "%4d%2d%2d", &w.y, &w.mo, &w.d)
		if err != nil || n != 3 {
			return w, nil, fmt.Errorf("invalid datetime: %s", value)
		}
	default:
		return w, nil, fmt.Errorf("invalid datetime: %s", value)
	}
	if w.mo < 1 || w.mo > 12 || w.d < 1 || w.d > 31 || w.h > 23 || w.mi > 59 || w.s > 59 {
		return w, nil, fmt.Errorf("invalid datetime: %s", value)
	}
	loc := naiveLocation
	if tzid != "" {
		// an unknown TZID left the time naive in dateutil (tz.gettz gave None)
		if l, err := time.LoadLocation(tzid); err == nil {
			loc = l
		}
	} else if utc {
		loc = time.UTC
	}
	return w, loc, nil
}

// parseDateTime reads YYYYMMDDTHHMMSS[Z] or YYYYMMDD. A Z value under a
// TZID is reinterpreted in that zone, like dateutil's replace(tzinfo=).
func parseDateTime(value, tzid string) (time.Time, error) {
	w, loc, err := parseWall(value, tzid)
	if err != nil {
		return time.Time{}, err
	}
	t := w.in(loc)
	if loc == naiveLocation {
		return t.In(naiveLocation), nil
	}
	return t, nil
}

// IsNaive reports whether a parsed time had no zone.
func IsNaive(t time.Time) bool { return t.Location() == naiveLocation }

// parseRule reads the KEY=VALUE pairs of one RRULE (rrulestr's
// _parse_rfc_rrule), with dateutil's error wording.
func parseRule(text string, dtstart time.Time, start wall) (*Rule, error) {
	if IsNaive(dtstart) {
		return nil, fmt.Errorf("A valid TZID must be provided (e.g., America/New_York)")
	}
	r := &Rule{DTStart: dtstart.Truncate(time.Second), start: start, Text: text, Interval: 1}
	freqSet := false
	for _, pair := range strings.Split(text, ";") {
		if pair == "" {
			continue
		}
		name, value, ok := strings.Cut(pair, "=")
		if !ok {
			return nil, fmt.Errorf("invalid rule part: %s", pair)
		}
		name = strings.ToUpper(name)
		value = strings.ToUpper(value)
		invalid := func() error { return fmt.Errorf("invalid '%s': %s", name, value) }
		switch name {
		case "FREQ":
			f, ok := freqNames[value]
			if !ok {
				return nil, invalid()
			}
			r.Freq = f
			freqSet = true
		case "INTERVAL":
			// A positive integer (RFC 5545): zero or less would walk the
			// calendar backwards, or not at all, without end.
			n, err := strconv.Atoi(value)
			if err != nil || n < 1 {
				return nil, invalid()
			}
			r.Interval = n
		case "COUNT":
			n, err := strconv.Atoi(value)
			if err != nil {
				return nil, invalid()
			}
			r.Count, r.HasCount = n, true
		case "UNTIL":
			t, err := parseDateTime(value, "")
			if err != nil {
				return nil, invalid()
			}
			if IsNaive(t) {
				return nil, fmt.Errorf("RRULE UNTIL values must be specified in UTC when DTSTART is timezone-aware")
			}
			r.Until, r.HasUntil = t, true
		case "WKST":
			d, ok := weekdayNames[value]
			if !ok {
				n, err := strconv.Atoi(value)
				if err != nil || n < 0 || n > 6 {
					return nil, invalid()
				}
				d = n
			}
			r.WKST = d
		case "BYSETPOS", "BYMONTH", "BYMONTHDAY", "BYYEARDAY", "BYWEEKNO", "BYHOUR", "BYMINUTE", "BYSECOND":
			var nums []int
			for _, v := range strings.Split(value, ",") {
				n, err := strconv.Atoi(v)
				if err != nil || !byValueInRange(name, n) {
					return nil, invalid()
				}
				nums = append(nums, n)
			}
			switch name {
			case "BYSETPOS":
				r.BySetPos = nums
			case "BYMONTH":
				r.ByMonth = nums
			case "BYMONTHDAY":
				r.ByMonthDay = nums
			case "BYYEARDAY":
				r.ByYearDay = nums
			case "BYWEEKNO":
				r.ByWeekNo = nums
			case "BYHOUR":
				r.ByHour = nums
			case "BYMINUTE":
				r.ByMinute = nums
			case "BYSECOND":
				r.BySecond = nums
			}
		case "BYDAY", "BYWEEKDAY":
			r.ByWeekday = []Weekday{}
			for _, wday := range strings.Split(value, ",") {
				if wday == "" {
					return nil, fmt.Errorf("Invalid (empty) BYDAY specification.")
				}
				i := 0
				for i < len(wday) && strings.ContainsRune("+-0123456789", rune(wday[i])) {
					i++
				}
				n := 0
				if i > 0 {
					// The nth weekday of a year (MONTHLY: of a month): at
					// most 53 either way.
					v, err := strconv.Atoi(wday[:i])
					if err != nil || v < -53 || v > 53 {
						return nil, invalid()
					}
					n = v
				}
				d, ok := weekdayNames[wday[i:]]
				if !ok {
					return nil, invalid()
				}
				r.ByWeekday = append(r.ByWeekday, Weekday{Day: d, N: n})
			}
		case "BYEASTER":
			// _handle_int_list: any integers. dateutil indexed its easter
			// mask (the year plus a week) with Easter's day of the year
			// plus the offset, so an offset that can land outside it in
			// some year raised IndexError while the schedule was saved;
			// such an offset is refused here instead (with Python's
			// message), and the ones that wrap around (negative indexes)
			// behave as they did.
			var nums []int
			for _, v := range strings.Split(value, ",") {
				n, err := strconv.Atoi(v)
				if err != nil {
					return nil, invalid()
				}
				if n < minEasterOffset || n > maxEasterOffset {
					return nil, fmt.Errorf("list assignment index out of range")
				}
				nums = append(nums, n)
			}
			r.ByEaster = nums
		default:
			return nil, fmt.Errorf("unknown parameter '%s'", name)
		}
	}
	if !freqSet {
		return nil, fmt.Errorf("invalid rule: FREQ required")
	}
	return newRule(r)
}

// byValueInRange is RFC 5545's range for a BYxxx value. BYSETPOS is
// checked by newRule, with dateutil's message.
func byValueInRange(name string, n int) bool {
	nonzero := func(lim int) bool { return n != 0 && n >= -lim && n <= lim }
	switch name {
	case "BYMONTH":
		return n >= 1 && n <= 12
	case "BYMONTHDAY":
		return nonzero(31)
	case "BYYEARDAY":
		return nonzero(366)
	case "BYWEEKNO":
		return nonzero(53)
	case "BYHOUR":
		return n >= 0 && n <= 23
	case "BYMINUTE", "BYSECOND":
		return n >= 0 && n <= 59
	}
	return true
}

// --- iteration --------------------------------------------------------------

// A rule that never matches would step period by period to the year 9999:
// hours of CPU for an hourly or minutely rule, in the web process (schedule
// preview and validation) or the scheduler. dateutil had the same walk, but
// Python's workers had time limits. An iterator stops (Truncated) after
// maxIdleSteps periods in a row that yield nothing, far more than any real
// rule's gap (a leap day across a skipped century leap year is under 3,000
// daily periods), and after maxSteps periods in all, which still covers a
// rule firing every minute since nineteen years before the time it is
// asked about.
const (
	maxIdleSteps = 100_000
	maxSteps     = 10_000_000
)

// Occurrence is one date the rule yields. Exists is false for a wall clock
// time that does not exist in the zone (the skipped hour of a DST change);
// Time is then the normalised instant.
type Occurrence struct {
	Time   time.Time
	Exists bool
}

// iterInfo is dateutil's _iterinfo: the masks of the current year/month.
type iterInfo struct {
	r           *Rule
	lastyear    int
	lastmonth   int
	yearlen     int
	nextyearlen int
	yearordinal int // days since the epoch of January 1st
	yearweekday int
	mmask       []int
	mdaymask    []int
	nmdaymask   []int
	wdaymask    []int
	mrange      []int
	wnomask     []int
	nwdaymask   []int
	eastermask  []int
}

// The BYEASTER offsets that stay inside the easter mask in every year:
// Easter falls on day index 80 (March 22nd) to 115 (April 25th in a leap
// year) and the mask has yearlen+7 entries, indexed from either end.
const (
	minEasterOffset = -452
	maxEasterOffset = 257
)

// Easter is Western Easter Sunday of a year, as dateutil.easter.easter
// computed it (EASTER_WESTERN, the Gregorian method).
func Easter(y int) (int, time.Month, int) {
	g := y % 19
	c := y / 100
	h := (c - c/4 - (8*c+13)/25 + 19*g + 15) % 30
	i := h - (h/28)*(1-(h/28)*(29/(h+1))*((21-g)/11))
	j := (y + y/4 + i + 2 - c + c/4) % 7
	p := i - j
	d := 1 + (p+27+(p+6)/40)%31
	m := 3 + (p+26)/30
	return y, time.Month(m), d
}

func sortedCopyInts(l []int) []int {
	out := append([]int(nil), l...)
	sort.Ints(out)
	return out
}

var (
	m365mask, m366mask         []int
	mday365mask, mday366mask   []int
	nmday365mask, nmday366mask []int
	m365range                  = []int{0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365}
	m366range                  = []int{0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335, 366}
	wdaymask                   []int
)

func init() {
	days365 := []int{31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31}
	days366 := []int{31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31}
	build := func(days []int) (mmask, mday, nmday []int) {
		for m, n := range days {
			for d := 1; d <= n; d++ {
				mmask = append(mmask, m+1)
				mday = append(mday, d)
				nmday = append(nmday, d-n-1)
			}
		}
		for d := 1; d <= 7; d++ {
			mmask = append(mmask, 1)
			mday = append(mday, d)
			nmday = append(nmday, d-32)
		}
		return
	}
	m365mask, mday365mask, nmday365mask = build(days365)
	m366mask, mday366mask, nmday366mask = build(days366)
	for i := 0; i < 55; i++ {
		wdaymask = append(wdaymask, 0, 1, 2, 3, 4, 5, 6)
	}
}

func isLeap(y int) bool { return y%4 == 0 && (y%100 != 0 || y%400 == 0) }

// ordinal is the day count of a date, like date.toordinal.
func ordinal(y int, m time.Month, d int) int {
	return int(time.Date(y, m, d, 0, 0, 0, 0, time.UTC).Unix()/86400) + 719163
}

func pyWeekday(t time.Time) int { return (int(t.Weekday()) + 6) % 7 }

func (ii *iterInfo) rebuild(year, month int) {
	r := ii.r
	if year != ii.lastyear {
		ii.yearlen = 365
		if isLeap(year) {
			ii.yearlen = 366
		}
		ii.nextyearlen = 365
		if isLeap(year + 1) {
			ii.nextyearlen = 366
		}
		first := time.Date(year, 1, 1, 0, 0, 0, 0, time.UTC)
		ii.yearordinal = ordinal(year, 1, 1)
		ii.yearweekday = pyWeekday(first)
		if ii.yearlen == 365 {
			ii.mmask, ii.mdaymask, ii.nmdaymask, ii.mrange = m365mask, mday365mask, nmday365mask, m365range
		} else {
			ii.mmask, ii.mdaymask, ii.nmdaymask, ii.mrange = m366mask, mday366mask, nmday366mask, m366range
		}
		ii.wdaymask = wdaymask[ii.yearweekday:]
		if len(r.byweekno) == 0 {
			ii.wnomask = nil
		} else {
			ii.wnomask = make([]int, ii.yearlen+7)
			no1wkst := pyMod(7-ii.yearweekday+r.WKST, 7)
			firstwkst := no1wkst
			var wyearlen int
			if no1wkst >= 4 {
				no1wkst = 0
				wyearlen = ii.yearlen + pyMod(ii.yearweekday-r.WKST, 7)
			} else {
				wyearlen = ii.yearlen - no1wkst
			}
			div, mod := pyDivmod(wyearlen, 7)
			numweeks := div + mod/4
			for _, n := range r.byweekno {
				if n < 0 {
					n += numweeks + 1
				}
				if !(0 < n && n <= numweeks) {
					continue
				}
				var i int
				if n > 1 {
					i = no1wkst + (n-1)*7
					if no1wkst != firstwkst {
						i -= 7 - firstwkst
					}
				} else {
					i = no1wkst
				}
				for j := 0; j < 7; j++ {
					ii.wnomask[i] = 1
					i++
					if ii.wdaymask[i] == r.WKST {
						break
					}
				}
			}
			if containsInt(r.byweekno, 1) {
				i := no1wkst + numweeks*7
				if no1wkst != firstwkst {
					i -= 7 - firstwkst
				}
				if i < ii.yearlen {
					for j := 0; j < 7; j++ {
						ii.wnomask[i] = 1
						i++
						if ii.wdaymask[i] == r.WKST {
							break
						}
					}
				}
			}
			if no1wkst != 0 {
				var lnumweeks int
				if !containsInt(r.byweekno, -1) {
					lyearweekday := pyWeekday(time.Date(year-1, 1, 1, 0, 0, 0, 0, time.UTC))
					lno1wkst := pyMod(7-lyearweekday+r.WKST, 7)
					lyearlen := 365
					if isLeap(year - 1) {
						lyearlen = 366
					}
					if lno1wkst >= 4 {
						lno1wkst = 0
						lnumweeks = 52 + pyMod(lyearlen+pyMod(lyearweekday-r.WKST, 7), 7)/4
					} else {
						lnumweeks = 52 + pyMod(ii.yearlen-no1wkst, 7)/4
					}
				} else {
					lnumweeks = -1
				}
				if containsInt(r.byweekno, lnumweeks) {
					for i := 0; i < no1wkst; i++ {
						ii.wnomask[i] = 1
					}
				}
			}
		}
	}
	if len(r.bynweekday) > 0 && (month != ii.lastmonth || year != ii.lastyear) {
		var ranges [][2]int
		if r.Freq == Yearly {
			if len(r.bymonth) > 0 {
				for _, m := range r.bymonth {
					ranges = append(ranges, [2]int{ii.mrange[m-1], ii.mrange[m]})
				}
			} else {
				ranges = [][2]int{{0, ii.yearlen}}
			}
		} else if r.Freq == Monthly {
			ranges = [][2]int{{ii.mrange[month-1], ii.mrange[month]}}
		}
		if len(ranges) > 0 {
			ii.nwdaymask = make([]int, ii.yearlen)
			for _, rg := range ranges {
				first, last := rg[0], rg[1]-1
				for _, wn := range r.bynweekday {
					wday, n := wn[0], wn[1]
					var i int
					if n < 0 {
						i = last + (n+1)*7
						i -= pyMod(ii.wdaymask[i]-wday, 7)
					} else {
						i = first + (n-1)*7
						i += pyMod(7-ii.wdaymask[i]+wday, 7)
					}
					if first <= i && i <= last {
						ii.nwdaymask[i] = 1
					}
				}
			}
		}
	}
	if len(r.byeaster) > 0 {
		ii.eastermask = make([]int, ii.yearlen+7)
		ey, em, ed := Easter(year)
		eyday := ordinal(ey, em, ed) - ii.yearordinal
		for _, offset := range r.byeaster {
			i := eyday + offset
			if i < 0 {
				// Python's negative index counts from the end.
				i += len(ii.eastermask)
			}
			if i >= 0 && i < len(ii.eastermask) {
				ii.eastermask[i] = 1
			}
		}
	}
	ii.lastyear = year
	ii.lastmonth = month
}

func containsInt(l []int, v int) bool {
	for _, x := range l {
		if x == v {
			return true
		}
	}
	return false
}

// day sets: a slice of day indexes (or -1 for none) and the active range.
func (ii *iterInfo) ydayset() ([]int, int, int) {
	set := make([]int, ii.yearlen)
	for i := range set {
		set[i] = i
	}
	return set, 0, ii.yearlen
}

func (ii *iterInfo) mdayset(month int) ([]int, int, int) {
	set := make([]int, ii.yearlen)
	for i := range set {
		set[i] = -1
	}
	start, end := ii.mrange[month-1], ii.mrange[month]
	for i := start; i < end; i++ {
		set[i] = i
	}
	return set, start, end
}

func (ii *iterInfo) wdayset(year, month, day int) ([]int, int, int) {
	set := make([]int, ii.yearlen+7)
	for i := range set {
		set[i] = -1
	}
	i := ordinal(year, time.Month(month), day) - ii.yearordinal
	start := i
	for j := 0; j < 7; j++ {
		set[i] = i
		i++
		if ii.wdaymask[i] == ii.r.WKST {
			break
		}
	}
	return set, start, i
}

func (ii *iterInfo) ddayset(year, month, day int) ([]int, int, int) {
	set := make([]int, ii.yearlen+7)
	for i := range set {
		set[i] = -1
	}
	i := ordinal(year, time.Month(month), day) - ii.yearordinal
	set[i] = i
	return set, i, i + 1
}

func (ii *iterInfo) htimeset(hour int) []tod {
	var set []tod
	for _, m := range sortedKeys(ii.r.byminute) {
		for _, s := range sortedKeys(ii.r.bysecond) {
			set = append(set, tod{hour, m, s})
		}
	}
	return set
}

func (ii *iterInfo) mtimeset(hour, minute int) []tod {
	var set []tod
	for _, s := range sortedKeys(ii.r.bysecond) {
		set = append(set, tod{hour, minute, s})
	}
	return set
}

// Iterator yields the occurrences of one rule in order.
type Iterator struct {
	r       *Rule
	ii      *iterInfo
	year    int
	month   int
	day     int
	hour    int
	minute  int
	second  int
	weekday int
	timeset []tod
	count   int
	done    bool
	pending []Occurrence
	// steps and idle count the periods walked, and those since the last
	// occurrence; Truncated is set when either limit ended the walk.
	steps, idle int
	Truncated   bool
}

// Iter starts iterating the rule from its DTSTART.
func (r *Rule) Iter() *Iterator {
	dt := r.start
	if dt.y == 0 {
		dt = wallOf(r.DTStart)
	}
	it := &Iterator{r: r, ii: &iterInfo{r: r, lastyear: -1, lastmonth: -1}, year: dt.Year(), month: int(dt.Month()), day: dt.Day(), hour: dt.Hour(), minute: dt.Minute(), second: dt.Second(), weekday: pyWeekday(dt.date()), count: r.Count}
	it.ii.rebuild(it.year, it.month)
	if r.Freq < Hourly {
		it.timeset = r.timeset
	} else {
		if (r.Freq >= Hourly && r.byhour != nil && !r.byhour[it.hour]) || (r.Freq >= Minutely && r.byminute != nil && !r.byminute[it.minute]) || (r.Freq >= Secondly && r.bysecond != nil && !r.bysecond[it.second]) {
			it.timeset = nil
		} else {
			it.timeset = it.gettimeset()
		}
	}
	return it
}

func (it *Iterator) gettimeset() []tod {
	switch it.r.Freq {
	case Hourly:
		return it.ii.htimeset(it.hour)
	case Minutely:
		return it.ii.mtimeset(it.hour, it.minute)
	default:
		return []tod{{it.hour, it.minute, it.second}}
	}
}

// Next returns the next occurrence, or false when the rule is exhausted.
func (it *Iterator) Next() (Occurrence, bool) {
	for {
		if len(it.pending) > 0 {
			o := it.pending[0]
			it.pending = it.pending[1:]
			return o, true
		}
		if it.done {
			return Occurrence{}, false
		}
		it.steps++
		it.idle++
		if it.steps > maxSteps || it.idle > maxIdleSteps {
			it.done, it.Truncated = true, true
			continue
		}
		it.step()
		if len(it.pending) > 0 {
			it.idle = 0
		}
	}
}

func (it *Iterator) makeTime(dayIndex int, t tod) Occurrence {
	date := time.Date(it.year, 1, 1, 0, 0, 0, 0, time.UTC).AddDate(0, 0, dayIndex)
	o := wall{date.Year(), int(date.Month()), date.Day(), t.h, t.m, t.s}.in(it.r.loc)
	exists := o.Hour() == t.h && o.Minute() == t.m && o.Day() == date.Day()
	return Occurrence{Time: o, Exists: exists}
}

// emit records an occurrence, applying UNTIL, DTSTART and COUNT. It
// returns false when iteration must stop.
func (it *Iterator) emit(o Occurrence) bool {
	r := it.r
	if r.HasUntil && o.Time.After(r.Until) {
		it.done = true
		return false
	}
	if !o.Time.Before(r.DTStart) {
		if r.HasCount {
			it.count--
			if it.count < 0 {
				it.done = true
				return false
			}
		}
		it.pending = append(it.pending, o)
	}
	return true
}

// step runs one period of the rule (one loop of rrule._iter).
func (it *Iterator) step() {
	r, ii := it.r, it.ii
	var dayset []int
	var start, end int
	switch r.Freq {
	case Yearly:
		dayset, start, end = ii.ydayset()
	case Monthly:
		dayset, start, end = ii.mdayset(it.month)
	case Weekly:
		dayset, start, end = ii.wdayset(it.year, it.month, it.day)
	default:
		dayset, start, end = ii.ddayset(it.year, it.month, it.day)
	}
	filtered := false
	for idx := start; idx < end; idx++ {
		i := dayset[idx]
		if i < 0 {
			continue
		}
		drop := false
		switch {
		case len(r.bymonth) > 0 && !containsInt(r.bymonth, ii.mmask[i]):
			drop = true
		case len(r.byweekno) > 0 && ii.wnomask[i] == 0:
			drop = true
		case r.byweekday != nil && !r.byweekday[ii.wdaymask[i]]:
			drop = true
		case ii.nwdaymask != nil && ii.nwdaymask[i] == 0:
			drop = true
		case len(r.byeaster) > 0 && ii.eastermask[i] == 0:
			drop = true
		case (len(r.bymonthday) > 0 || len(r.bynmonthday) > 0) && !containsInt(r.bymonthday, ii.mdaymask[i]) && !containsInt(r.bynmonthday, ii.nmdaymask[i]):
			drop = true
		case len(r.byyearday) > 0 && ((i < ii.yearlen && !containsInt(r.byyearday, i+1) && !containsInt(r.byyearday, -ii.yearlen+i)) ||
			(i >= ii.yearlen && !containsInt(r.byyearday, i+1-ii.yearlen) && !containsInt(r.byyearday, -ii.nextyearlen+i-ii.yearlen))):
			drop = true
		}
		if drop {
			dayset[idx] = -1
			filtered = true
		}
	}
	timeset := it.timeset
	if len(r.bysetpos) > 0 && len(timeset) > 0 {
		var valid []int
		for idx := start; idx < end; idx++ {
			if dayset[idx] >= 0 {
				valid = append(valid, dayset[idx])
			}
		}
		var poslist []Occurrence
		for _, pos := range r.bysetpos {
			var daypos, timepos int
			if pos < 0 {
				daypos, timepos = pyDivmod(pos, len(timeset))
			} else {
				daypos, timepos = pyDivmod(pos-1, len(timeset))
			}
			if daypos < 0 {
				daypos += len(valid)
			}
			if daypos < 0 || daypos >= len(valid) {
				continue
			}
			o := it.makeTime(valid[daypos], timeset[timepos])
			dup := false
			for _, p := range poslist {
				if p.Time.Equal(o.Time) {
					dup = true
					break
				}
			}
			if !dup {
				poslist = append(poslist, o)
			}
		}
		sort.Slice(poslist, func(a, b int) bool { return poslist[a].Time.Before(poslist[b].Time) })
		for _, o := range poslist {
			if !it.emit(o) {
				return
			}
		}
	} else {
		for idx := start; idx < end; idx++ {
			i := dayset[idx]
			if i < 0 {
				continue
			}
			for _, t := range timeset {
				if !it.emit(it.makeTime(i, t)) {
					return
				}
			}
		}
	}
	// advance by the frequency and interval
	fixday := false
	switch r.Freq {
	case Yearly:
		it.year += r.Interval
		if it.year > 9999 {
			it.done = true
			return
		}
		ii.rebuild(it.year, it.month)
	case Monthly:
		it.month += r.Interval
		if it.month > 12 {
			div, mod := pyDivmod(it.month, 12)
			it.month = mod
			it.year += div
			if it.month == 0 {
				it.month = 12
				it.year--
			}
			if it.year > 9999 {
				it.done = true
				return
			}
		}
		ii.rebuild(it.year, it.month)
	case Weekly:
		if r.WKST > it.weekday {
			it.day += -(it.weekday + 1 + (6 - r.WKST)) + r.Interval*7
		} else {
			it.day += -(it.weekday - r.WKST) + r.Interval*7
		}
		it.weekday = r.WKST
		fixday = true
	case Daily:
		it.day += r.Interval
		fixday = true
	case Hourly:
		if filtered {
			it.hour += ((23 - it.hour) / r.Interval) * r.Interval
		}
		var ndays int
		if r.ByHour != nil {
			ndays, it.hour = it.modDistance(it.hour, r.byhour, 24)
		} else {
			ndays, it.hour = pyDivmod(it.hour+r.Interval, 24)
		}
		if ndays != 0 {
			it.day += ndays
			fixday = true
		}
		it.timeset = it.gettimeset()
	case Minutely:
		if filtered {
			it.minute += ((1439 - (it.hour*60 + it.minute)) / r.Interval) * r.Interval
		}
		valid := false
		repRate := 24 * 60
		for j := 0; j < repRate/gcd(r.Interval, repRate); j++ {
			var nhours int
			if r.ByMinute != nil {
				nhours, it.minute = it.modDistance(it.minute, r.byminute, 60)
			} else {
				nhours, it.minute = pyDivmod(it.minute+r.Interval, 60)
			}
			if nhours != 0 {
				var ndays int
				ndays, it.hour = pyDivmod(it.hour+nhours, 24)
				if ndays != 0 {
					it.day += ndays
					fixday = true
				}
			}
			if r.byhour == nil || r.byhour[it.hour] {
				valid = true
				break
			}
		}
		if !valid {
			it.done = true
			return
		}
		it.timeset = it.gettimeset()
	case Secondly:
		if filtered {
			it.second += ((86399 - (it.hour*3600 + it.minute*60 + it.second)) / r.Interval) * r.Interval
		}
		valid := false
		repRate := 24 * 3600
		for j := 0; j < repRate/gcd(r.Interval, repRate); j++ {
			var nminutes int
			if r.BySecond != nil {
				nminutes, it.second = it.modDistance(it.second, r.bysecond, 60)
			} else {
				nminutes, it.second = pyDivmod(it.second+r.Interval, 60)
			}
			if nminutes != 0 {
				var nhours int
				nhours, it.minute = pyDivmod(it.minute+nminutes, 60)
				if nhours != 0 {
					var ndays int
					ndays, it.hour = pyDivmod(it.hour+nhours, 24)
					if ndays != 0 {
						it.day += ndays
						fixday = true
					}
				}
			}
			if (r.byhour == nil || r.byhour[it.hour]) && (r.byminute == nil || r.byminute[it.minute]) && (r.bysecond == nil || r.bysecond[it.second]) {
				valid = true
				break
			}
		}
		if !valid {
			it.done = true
			return
		}
		it.timeset = it.gettimeset()
	}
	if fixday && it.day > 28 {
		daysinmonth := daysIn(it.year, it.month)
		if it.day > daysinmonth {
			for it.day > daysinmonth {
				it.day -= daysinmonth
				it.month++
				if it.month == 13 {
					it.month = 1
					it.year++
					if it.year > 9999 {
						it.done = true
						return
					}
				}
				daysinmonth = daysIn(it.year, it.month)
			}
			ii.rebuild(it.year, it.month)
		}
	}
}

func daysIn(year, month int) int {
	return time.Date(year, time.Month(month)+1, 0, 0, 0, 0, 0, time.UTC).Day()
}

// modDistance steps value by the interval until it lands in byxxx,
// returning how many wraps of base that took (rrule.__mod_distance).
func (it *Iterator) modDistance(value int, byxxx map[int]bool, base int) (int, int) {
	accumulator := 0
	for i := 1; i <= base; i++ {
		var div int
		div, value = pyDivmod(value+it.r.Interval, base)
		accumulator += div
		if byxxx[value] {
			return accumulator, value
		}
	}
	return accumulator, value
}
