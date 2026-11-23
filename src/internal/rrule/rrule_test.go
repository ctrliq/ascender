package rrule

import (
	"encoding/json"
	"os"
	"strconv"
	"testing"
	"time"
)

// The vectors were produced by python-dateutil (the old application's
// library) with scratchpad/rrule_vectors.py: for every rule the coerced
// text, the first ten existing occurrences after the reference time (local
// and UTC), and next_run/dtstart/dtend as the schedule model computed them.
type vector struct {
	RRule   string   `json:"rrule"`
	Coerced string   `json:"coerced"`
	Local   []string `json:"local"`
	UTC     []string `json:"utc"`
	NextRun *string  `json:"next_run"`
	DTStart *string  `json:"dtstart"`
	DTEnd   *string  `json:"dtend"`
}

var ref = time.Date(2026, 11, 11, 12, 0, 0, 0, time.UTC)

func pyISO(t time.Time) string { return t.Format("2006-01-02T15:04:05-07:00") }

func TestVectors(t *testing.T) {
	raw, err := os.ReadFile("testdata/vectors.json")
	if err != nil {
		t.Fatal(err)
	}
	var vectors []vector
	if err := json.Unmarshal(raw, &vectors); err != nil {
		t.Fatal(err)
	}
	checkVectors(t, vectors)
}

// TestEasterVectors checks BYEASTER against python-dateutil
// (testdata/gen_easter.py), Easter Sunday included.
func TestEasterVectors(t *testing.T) {
	raw, err := os.ReadFile("testdata/easter.json")
	if err != nil {
		t.Fatal(err)
	}
	var data struct {
		Vectors []vector          `json:"vectors"`
		Easter  map[string]string `json:"easter"`
	}
	if err := json.Unmarshal(raw, &data); err != nil {
		t.Fatal(err)
	}
	if len(data.Easter) == 0 || len(data.Vectors) == 0 {
		t.Fatal("no vectors")
	}
	for year, want := range data.Easter {
		y, _ := strconv.Atoi(year)
		ey, em, ed := Easter(y)
		if got := time.Date(ey, em, ed, 0, 0, 0, 0, time.UTC).Format("2006-01-02"); got != want {
			t.Errorf("easter %d: got %s want %s", y, got, want)
		}
	}
	checkVectors(t, data.Vectors)
}

// An offset that dateutil's mask could not hold in some year (IndexError
// when the schedule was saved) is refused.
func TestEasterOffsetRange(t *testing.T) {
	for _, off := range []string{"258", "-453", "1000"} {
		_, _, err := ParseSchedule("DTSTART:20261001T100000Z RRULE:FREQ=YEARLY;INTERVAL=1;BYEASTER="+off, ref)
		if err == nil || err.Error() != "list assignment index out of range" {
			t.Errorf("BYEASTER=%s: got %v", off, err)
		}
	}
	if _, _, err := ParseSchedule("DTSTART:20261001T100000Z RRULE:FREQ=YEARLY;INTERVAL=1;BYEASTER=x", ref); err == nil || err.Error() != "invalid 'BYEASTER': X" {
		t.Errorf("BYEASTER=x: got %v", err)
	}
}

func checkVectors(t *testing.T, vectors []vector) {
	for _, v := range vectors {
		t.Run(v.RRule, func(t *testing.T) {
			set, coerced, err := ParseSchedule(v.RRule, ref)
			if err != nil {
				t.Fatalf("parse: %v", err)
			}
			if coerced != v.Coerced {
				t.Errorf("coerced: got %q want %q", coerced, v.Coerced)
			}
			var local, utc []string
			for _, o := range set.XAfter(ref, 20) {
				if len(local) >= 10 {
					break
				}
				if !o.Exists {
					continue
				}
				local = append(local, pyISO(o.Time))
				utc = append(utc, pyISO(o.Time.UTC()))
			}
			if !equalStrings(local, v.Local) {
				t.Errorf("local: got %v want %v", local, v.Local)
			}
			if !equalStrings(utc, v.UTC) {
				t.Errorf("utc: got %v want %v", utc, v.UTC)
			}
			var next *string
			if o, ok := set.After(ref, false); ok {
				if !o.Exists {
					o, ok = set.After(o.Time, false)
				}
				if ok {
					s := pyISO(o.Time.UTC())
					next = &s
				}
			}
			if !equalPtr(next, v.NextRun) {
				t.Errorf("next_run: got %v want %v", deref(next), deref(v.NextRun))
			}
			var start *string
			if o, ok := set.First(); ok {
				s := pyISO(o.Time.UTC())
				start = &s
			}
			if !equalPtr(start, v.DTStart) {
				t.Errorf("dtstart: got %v want %v", deref(start), deref(v.DTStart))
			}
			var end *string
			if o, ok := set.Last(); ok {
				s := pyISO(o.Time.UTC())
				end = &s
			}
			if !equalPtr(end, v.DTEnd) {
				t.Errorf("dtend: got %v want %v", deref(end), deref(v.DTEnd))
			}
		})
	}
}

func equalStrings(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func equalPtr(a, b *string) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	return *a == *b
}

func deref(s *string) string {
	if s == nil {
		return "<nil>"
	}
	return *s
}

func TestErrors(t *testing.T) {
	cases := map[string]string{
		"DTSTART:20261001T100000 RRULE:FREQ=DAILY;INTERVAL=1":                          "A valid TZID must be provided (e.g., America/New_York)",
		"RRULE:FREQ=DAILY;INTERVAL=1":                                                  "'NoneType' object has no attribute 'group'",
		"DTSTART:20261001T100000Z RRULE:FREQ=DAILY;INTERVAL=1;BOGUS=1":                 "unknown parameter 'BOGUS'",
		"DTSTART:20261001T100000Z RRULE:FREQ=WEIRDLY;INTERVAL=1":                       "invalid 'FREQ': WEIRDLY",
		"DTSTART;TZID=Mars/Olympus:20261001T100000 RRULE:FREQ=DAILY;INTERVAL=1":        "A valid TZID must be provided (e.g., America/New_York)",
		"DTSTART:20261001T100000Z RRULE:FREQ=DAILY;INTERVAL=1 EXDATE:20261002T100000Z": "EXDATE is not supported",
	}
	for text, want := range cases {
		_, _, err := ParseSchedule(text, ref)
		if err == nil || err.Error() != want {
			t.Errorf("%s: got %v want %q", text, err, want)
		}
	}
}
