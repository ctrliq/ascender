package rrule

import (
	"strings"
	"testing"
	"time"
)

// Values a rule cannot hold are refused when it is parsed: negative or zero
// intervals walked the calendar without end, and out-of-range numbers
// indexed past the iterator's masks.
func TestParseRefusesOutOfRangeValues(t *testing.T) {
	now := time.Date(2026, 11, 21, 0, 0, 0, 0, time.UTC)
	for _, rule := range []string{
		"FREQ=YEARLY;INTERVAL=-3", "FREQ=DAILY;INTERVAL=-1", "FREQ=MONTHLY;INTERVAL=-5", "FREQ=DAILY;INTERVAL=0",
		"FREQ=WEEKLY;INTERVAL=1;WKST=-99999", "FREQ=WEEKLY;INTERVAL=1;WKST=7",
		"FREQ=MONTHLY;INTERVAL=1;BYDAY=+99MO", "FREQ=YEARLY;INTERVAL=1;BYDAY=-99999MO",
		"FREQ=YEARLY;INTERVAL=1;BYMONTH=13", "FREQ=YEARLY;INTERVAL=1;BYMONTH=0",
		"FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=32", "FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=0", "FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=-32",
		"FREQ=YEARLY;INTERVAL=1;BYYEARDAY=367", "FREQ=YEARLY;INTERVAL=1;BYWEEKNO=54",
		"FREQ=DAILY;INTERVAL=1;BYHOUR=24", "FREQ=HOURLY;INTERVAL=1;BYMINUTE=60", "FREQ=MINUTELY;INTERVAL=1;BYSECOND=-1",
	} {
		text := "DTSTART:20300101T000000Z RRULE:" + rule
		if _, _, err := ParseSchedule(text, now); err == nil {
			t.Errorf("%s: parsed", rule)
		}
	}
}

// A rule that parses but never yields stops after maxIdleSteps periods
// instead of walking to the year 9999.
func TestNeverMatchingRulesStopQuickly(t *testing.T) {
	now := time.Date(2026, 11, 21, 0, 0, 0, 0, time.UTC)
	for _, rule := range []string{
		"FREQ=MINUTELY;INTERVAL=1;BYSETPOS=2",
		"FREQ=HOURLY;INTERVAL=1;BYSETPOS=2",
		"FREQ=SECONDLY;INTERVAL=1;BYSETPOS=2",
		"FREQ=DAILY;INTERVAL=1;BYMONTH=2;BYMONTHDAY=30",
		"FREQ=HOURLY;INTERVAL=1;BYMONTH=2;BYMONTHDAY=30",
		"FREQ=YEARLY;INTERVAL=1;BYMONTH=4;BYMONTHDAY=31",
	} {
		start := time.Now()
		set, _, err := ParseSchedule("DTSTART:20300101T000000Z RRULE:"+rule, now)
		if err != nil {
			t.Errorf("%s: %v", rule, err)
			continue
		}
		if got := set.XAfter(now, 20); len(got) != 0 {
			t.Errorf("%s: %d occurrences", rule, len(got))
		}
		set.Last()
		if took := time.Since(start); took > 5*time.Second {
			t.Errorf("%s: took %v", rule, took)
		}
	}
}

// Rules with long gaps between occurrences are untouched by the idle limit.
func TestSparseRulesStillYield(t *testing.T) {
	now := time.Date(2026, 11, 21, 0, 0, 0, 0, time.UTC)
	for rule, want := range map[string]string{
		// Leap days, across 2100, which has none.
		"FREQ=DAILY;INTERVAL=1;BYMONTH=2;BYMONTHDAY=29;COUNT=21":           "2108-02-29",
		"FREQ=YEARLY;INTERVAL=1;BYMONTH=2;BYMONTHDAY=29;COUNT=21":          "2108-02-29",
		"FREQ=HOURLY;INTERVAL=1;BYMONTH=2;BYMONTHDAY=29;BYHOUR=3;COUNT=21": "2108-02-29",
		// Friday the 13th of February.
		"FREQ=YEARLY;INTERVAL=1;BYMONTH=2;BYMONTHDAY=13;BYDAY=FR;COUNT=4": "2043-02-13",
	} {
		set, _, err := ParseSchedule("DTSTART:20240101T030000Z RRULE:"+rule, now)
		if err != nil {
			t.Errorf("%s: %v", rule, err)
			continue
		}
		last, ok := set.Last()
		if !ok || !strings.HasPrefix(last.Time.UTC().Format("2006-01-02"), want) {
			t.Errorf("%s: last %v %v, want %s", rule, last.Time, ok, want)
		}
	}
}

// A frequent rule that started long ago still finds its next run.
func TestFrequentRuleFromLongAgo(t *testing.T) {
	now := time.Date(2026, 11, 21, 0, 2, 30, 0, time.UTC)
	set, _, err := ParseSchedule("DTSTART:20200101T000000Z RRULE:FREQ=MINUTELY;INTERVAL=5", now)
	if err != nil {
		t.Fatal(err)
	}
	o, ok := set.After(now, false)
	if want := time.Date(2026, 11, 21, 0, 5, 0, 0, time.UTC); !ok || !o.Time.Equal(want) {
		t.Errorf("next = %v %v, want %v", o.Time, ok, want)
	}
}
