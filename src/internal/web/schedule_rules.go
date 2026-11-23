package web

import (
	"fmt"
	"net/http"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/ctrliq/ascender/internal/rrule"
)

// The schedule form's model: the old UI edited a schedule as a set of
// repeat frequencies, each with its own options, and turned them into an
// rrule on save (buildRuleSet / parseRuleObj). The same shapes drive the
// detail page's frequency summary.

// scheduleFrequencies lists the frequencies in the order the form shows them.
var scheduleFrequencies = []string{"minute", "hour", "day", "week", "month", "year"}

var frequencyLabels = map[string]string{"minute": "Minute", "hour": "Hour", "day": "Day", "week": "Week", "month": "Month", "year": "Year"}

var frequencyRRule = map[string]string{"minute": "MINUTELY", "hour": "HOURLY", "day": "DAILY", "week": "WEEKLY", "month": "MONTHLY", "year": "YEARLY"}

var frequencyOrder = map[string]int{"minute": 1, "hour": 2, "day": 3, "week": 4, "month": 5, "year": 6}

// weekdayCodes are the rrule day codes in the order the form lists them.
var weekdayCodes = []string{"SU", "MO", "TU", "WE", "TH", "FR", "SA"}

var weekdayLabels = map[string]string{"SU": "Sunday", "MO": "Monday", "TU": "Tuesday", "WE": "Wednesday", "TH": "Thursday", "FR": "Friday", "SA": "Saturday"}

var weekdayShort = map[string]string{"SU": "Sun", "MO": "Mon", "TU": "Tue", "WE": "Wed", "TH": "Thu", "FR": "Fri", "SA": "Sat"}

// python weekday numbers (0 = Monday) to codes
var weekdayByNumber = []string{"MO", "TU", "WE", "TH", "FR", "SA", "SU"}

// runOnDays are the "The <nth> <day>" choices of the monthly and yearly rules.
var runOnDays = [][2]string{{"sunday", "Sunday"}, {"monday", "Monday"}, {"tuesday", "Tuesday"}, {"wednesday", "Wednesday"}, {"thursday", "Thursday"}, {"friday", "Friday"}, {"saturday", "Saturday"}, {"day", "Day"}, {"weekday", "Weekday"}, {"weekendDay", "Weekend day"}}

var runOnDayCodes = map[string][]string{
	"sunday": {"SU"}, "monday": {"MO"}, "tuesday": {"TU"}, "wednesday": {"WE"}, "thursday": {"TH"}, "friday": {"FR"}, "saturday": {"SA"},
	"day": {"MO", "TU", "WE", "TH", "FR", "SA", "SU"}, "weekday": {"MO", "TU", "WE", "TH", "FR"}, "weekendDay": {"SA", "SU"},
}

var runOnDayDetailLabels = map[string]string{"sunday": "Sunday", "monday": "Monday", "tuesday": "Tuesday", "wednesday": "Wednesday", "thursday": "Thursday", "friday": "Friday", "saturday": "Saturday", "day": "day", "weekday": "weekday", "weekendDay": "weekend day"}

var occurrenceChoices = [][2]string{{"1", "First"}, {"2", "Second"}, {"3", "Third"}, {"4", "Fourth"}, {"5", "Fifth"}, {"-1", "Last"}}

var ordinalWords = map[string]string{"1": "first", "2": "second", "3": "third", "4": "fourth", "5": "fifth", "-1": "last"}

var monthChoices = [][2]string{{"1", "January"}, {"2", "February"}, {"3", "March"}, {"4", "April"}, {"5", "May"}, {"6", "June"}, {"7", "July"}, {"8", "August"}, {"9", "September"}, {"10", "October"}, {"11", "November"}, {"12", "December"}}

func monthName(n string) string {
	for _, m := range monthChoices {
		if m[0] == n {
			return m[1]
		}
	}
	return n
}

// freqOptions are one frequency's settings, as the form fields hold them.
type freqOptions struct {
	Interval           string
	End                string // never, after, onDate
	Occurrences        string
	EndDate            string
	EndTime            string
	DaysOfWeek         []string // weekly: rrule day codes
	RunOn              string   // monthly and yearly: day or the
	RunOnDayNumber     string
	RunOnTheOccurrence string
	RunOnTheDay        string
	RunOnTheMonth      string
	RunOnDayMonth      string
}

// HasDay reports whether a weekday is ticked.
func (o *freqOptions) HasDay(code string) bool {
	for _, d := range o.DaysOfWeek {
		if d == code {
			return true
		}
	}
	return false
}

// scheduleValues is the whole form.
type scheduleValues struct {
	Name               string
	Description        string
	StartDate          string
	StartTime          string
	Timezone           string
	Frequency          []string
	FrequencyOptions   map[string]*freqOptions
	ExceptionFrequency []string
	ExceptionOptions   map[string]*freqOptions
	DaysToKeep         string
	PromptValues       string // JSON the prompt wizard collected
	Unsupported        bool   // the rrule holds rules the form cannot show
}

func (v *scheduleValues) Has(freq string) bool {
	for _, f := range v.Frequency {
		if f == freq {
			return true
		}
	}
	return false
}

func (v *scheduleValues) HasException(freq string) bool {
	for _, f := range v.ExceptionFrequency {
		if f == freq {
			return true
		}
	}
	return false
}

// quarterHour rounds up to the next quarter hour, as the form's defaults did.
func quarterHour(now time.Time) time.Time {
	q := 15 * time.Minute
	t := now.Truncate(q)
	if t.Before(now) {
		t = t.Add(q)
	}
	return t
}

func defaultFreqOptions(now time.Time) *freqOptions {
	q := quarterHour(now)
	return &freqOptions{Interval: "1", End: "never", Occurrences: "1", EndDate: q.AddDate(0, 0, 1).Format("2006-01-02"), EndTime: q.Format("3:04 PM"),
		RunOn: "day", RunOnTheOccurrence: "1", RunOnTheDay: "sunday", RunOnDayNumber: "1", RunOnTheMonth: "1", RunOnDayMonth: "1"}
}

// newScheduleValues is a blank form starting at the next quarter hour.
func newScheduleValues(now time.Time) *scheduleValues {
	q := quarterHour(now)
	v := &scheduleValues{StartDate: q.Format("2006-01-02"), StartTime: q.Format("3:04 PM"), Timezone: now.Location().String(), FrequencyOptions: map[string]*freqOptions{}, ExceptionOptions: map[string]*freqOptions{}}
	for _, f := range scheduleFrequencies {
		v.FrequencyOptions[f] = defaultFreqOptions(now)
		v.ExceptionOptions[f] = defaultFreqOptions(now)
	}
	if v.Timezone == "Local" {
		v.Timezone = "UTC"
	}
	return v
}

// scheduleValuesFromAPI reads a schedule into the form (parseRuleObj).
func scheduleValuesFromAPI(s map[string]any, now time.Time) *scheduleValues {
	v := newScheduleValues(now)
	v.Name = str(s["name"])
	v.Description = str(s["description"])
	v.Timezone = str(s["timezone"])
	loc, err := time.LoadLocation(v.Timezone)
	if err != nil || v.Timezone == "" {
		loc = time.UTC
	}
	if t, err := time.Parse(time.RFC3339Nano, str(s["dtstart"])); err == nil {
		lt := t.In(loc)
		v.StartDate = lt.Format("2006-01-02")
		v.StartTime = lt.Format("3:04 PM")
	}
	set, err := rrule.ParseSet(str(s["rrule"]))
	if err != nil {
		v.Unsupported = true
		return v
	}
	for _, r := range set.Rules {
		f, o := optionsFromRule(r, loc, now)
		if v.Has(f) {
			v.Unsupported = true
			continue
		}
		v.Frequency = append(v.Frequency, f)
		v.FrequencyOptions[f] = o
	}
	for _, r := range set.ExRules {
		f, o := optionsFromRule(r, loc, now)
		if v.HasException(f) {
			v.Unsupported = true
			continue
		}
		v.ExceptionFrequency = append(v.ExceptionFrequency, f)
		v.ExceptionOptions[f] = o
	}
	sortFrequencies(v.Frequency)
	sortFrequencies(v.ExceptionFrequency)
	// a single occurrence is the "none" frequency
	if len(v.Frequency) == 1 && v.Frequency[0] == "minute" {
		if o := v.FrequencyOptions["minute"]; o.End == "after" && o.Occurrences == "1" {
			v.Frequency = nil
			v.FrequencyOptions["minute"] = defaultFreqOptions(now)
		}
	}
	return v
}

func sortFrequencies(fs []string) {
	sort.SliceStable(fs, func(i, j int) bool { return frequencyOrder[fs[i]] < frequencyOrder[fs[j]] })
}

func joinInts(ns []int) string {
	parts := make([]string, len(ns))
	for i, n := range ns {
		parts[i] = strconv.Itoa(n)
	}
	return strings.Join(parts, ",")
}

// optionsFromRule reads one rule's settings (parseRuleObj.parseRule).
func optionsFromRule(r *rrule.Rule, loc *time.Location, now time.Time) (string, *freqOptions) {
	o := defaultFreqOptions(now)
	if r.HasUntil {
		o.End = "onDate"
		lt := r.Until.In(loc)
		o.EndDate = lt.Format("2006-01-02")
		o.EndTime = lt.Format("3:04 PM")
	} else if r.HasCount {
		o.End = "after"
		o.Occurrences = strconv.Itoa(r.Count)
	}
	if r.Interval > 0 {
		o.Interval = strconv.Itoa(r.Interval)
	}
	var freq string
	switch r.Freq {
	case rrule.Minutely:
		freq = "minute"
	case rrule.Hourly:
		freq = "hour"
	case rrule.Daily:
		freq = "day"
	case rrule.Weekly:
		freq = "week"
		for _, w := range r.ByWeekday {
			if w.Day >= 0 && w.Day < 7 {
				o.DaysOfWeek = append(o.DaysOfWeek, weekdayByNumber[w.Day])
			}
		}
	case rrule.Monthly:
		freq = "month"
		if len(r.ByMonthDay) > 0 {
			o.RunOnDayNumber = joinInts(r.ByMonthDay)
		}
		if len(r.BySetPos) > 0 {
			o.RunOn = "the"
			o.RunOnTheOccurrence = joinInts(r.BySetPos)
			o.RunOnTheDay = runOnTheDay(r.ByWeekday)
		}
	default:
		freq = "year"
		if len(r.ByMonthDay) > 0 {
			o.RunOnDayNumber = joinInts(r.ByMonthDay)
			if len(r.ByMonth) > 0 {
				o.RunOnDayMonth = joinInts(r.ByMonth)
			}
		}
		if len(r.BySetPos) > 0 {
			o.RunOn = "the"
			o.RunOnTheOccurrence = joinInts(r.BySetPos)
			o.RunOnTheDay = runOnTheDay(r.ByWeekday)
			if len(r.ByMonth) > 0 {
				o.RunOnTheMonth = joinInts(r.ByMonth)
			}
		}
	}
	return freq, o
}

// runOnTheDay names a BYDAY set the way the form offers it.
func runOnTheDay(days []rrule.Weekday) string {
	has := map[int]bool{}
	for _, d := range days {
		has[d.Day] = true
	}
	all := func(ns ...int) bool {
		for _, n := range ns {
			if !has[n] {
				return false
			}
		}
		return true
	}
	switch {
	case all(0, 1, 2, 3, 4, 5, 6):
		return "day"
	case all(0, 1, 2, 3, 4):
		return "weekday"
	case all(5, 6):
		return "weekendDay"
	}
	for i, name := range []string{"monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"} {
		if has[i] {
			return name
		}
	}
	return ""
}

// --- reading the posted form -------------------------------------------------

func scheduleValuesFromPost(r *http.Request, now time.Time) *scheduleValues {
	f := r.PostForm
	v := newScheduleValues(now)
	v.Name = strings.TrimSpace(f.Get("name"))
	v.Description = f.Get("description")
	v.StartDate = strings.TrimSpace(f.Get("startDate"))
	v.StartTime = strings.TrimSpace(f.Get("startTime"))
	v.Timezone = f.Get("timezone")
	v.DaysToKeep = strings.TrimSpace(f.Get("daysToKeep"))
	v.PromptValues = f.Get("prompt_values")
	for _, freq := range f["frequency"] {
		if frequencyOrder[freq] > 0 && !v.Has(freq) {
			v.Frequency = append(v.Frequency, freq)
		}
	}
	for _, freq := range f["exceptionFrequency"] {
		if frequencyOrder[freq] > 0 && !v.HasException(freq) {
			v.ExceptionFrequency = append(v.ExceptionFrequency, freq)
		}
	}
	sortFrequencies(v.Frequency)
	sortFrequencies(v.ExceptionFrequency)
	read := func(prefix string, o *freqOptions) {
		get := func(k string) string { return strings.TrimSpace(f.Get(prefix + "." + k)) }
		if s := get("interval"); s != "" || f.Has(prefix+".interval") {
			o.Interval = s
		}
		if s := get("end"); s != "" {
			o.End = s
		}
		if f.Has(prefix + ".occurrences") {
			o.Occurrences = get("occurrences")
		}
		if f.Has(prefix + ".endDate") {
			o.EndDate = get("endDate")
		}
		if f.Has(prefix + ".endTime") {
			o.EndTime = get("endTime")
		}
		if days, ok := f[prefix+".daysOfWeek"]; ok {
			o.DaysOfWeek = nil
			for _, d := range days {
				if weekdayLabels[d] != "" {
					o.DaysOfWeek = append(o.DaysOfWeek, d)
				}
			}
		} else if strings.HasSuffix(prefix, ".week") {
			o.DaysOfWeek = nil
		}
		if s := get("runOn"); s != "" {
			o.RunOn = s
		}
		for k, dst := range map[string]*string{"runOnDayNumber": &o.RunOnDayNumber, "runOnTheOccurrence": &o.RunOnTheOccurrence, "runOnTheDay": &o.RunOnTheDay, "runOnTheMonth": &o.RunOnTheMonth, "runOnDayMonth": &o.RunOnDayMonth} {
			if f.Has(prefix + "." + k) {
				*dst = get(k)
			}
		}
	}
	for _, freq := range scheduleFrequencies {
		read("frequencyOptions."+freq, v.FrequencyOptions[freq])
		read("exceptionOptions."+freq, v.ExceptionOptions[freq])
	}
	return v
}

// --- validation -------------------------------------------------------------

var (
	dateRe = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)
	timeRe = regexp.MustCompile(`^(\d\d?):([0-5])(\d)\s*([AaPp][Mm])?$`)
)

// parseClock reads the form's date and time ("2026-11-11", "9:45 AM") as a
// wall clock in a zone.
func parseClock(date, clock string, loc *time.Location) (time.Time, bool) {
	if !dateRe.MatchString(date) || !timeRe.MatchString(clock) {
		return time.Time{}, false
	}
	var t time.Time
	var err error
	for _, layout := range []string{"2006-01-02 3:04 PM", "2006-01-02 3:04PM", "2006-01-02 15:04", "2006-01-02 03:04 PM"} {
		t, err = time.ParseInLocation(layout, date+" "+strings.ToUpper(clock), time.UTC)
		if err == nil {
			break
		}
	}
	if err != nil {
		return time.Time{}, false
	}
	return rrule.LocalTime(loc, t.Year(), int(t.Month()), t.Day(), t.Hour(), t.Minute(), 0), true
}

// validateScheduleValues returns the form's errors by field, with the old
// form's wording.
func validateScheduleValues(v *scheduleValues, hasDaysToKeep bool) map[string][]string {
	errs := map[string][]string{}
	add := func(k, msg string) { errs[k] = append(errs[k], msg) }
	if v.Name == "" {
		add("name", "This field must not be blank")
	}
	switch {
	case v.StartDate == "":
		add("startDate", "This field must not be blank")
	case !dateRe.MatchString(v.StartDate):
		add("startDate", "Invalid date format")
	}
	switch {
	case v.StartTime == "":
		add("startTime", "This field must not be blank")
	case !timeRe.MatchString(v.StartTime):
		add("startTime", "Invalid time format")
	}
	loc, err := time.LoadLocation(v.Timezone)
	if v.Timezone == "" || err != nil {
		add("timezone", "Select a value for this field")
		loc = time.UTC
	}
	if hasDaysToKeep && v.DaysToKeep == "" {
		add("daysToKeep", "This field must not be blank")
	}
	start, startOK := parseClock(v.StartDate, v.StartTime, loc)
	check := func(prefix, freq string, o *freqOptions) {
		n, err := strconv.Atoi(o.Interval)
		switch {
		case o.Interval == "":
			add(prefix+".interval", "Select a value for this field")
		case err != nil:
			add(prefix+".interval", "This field must be an integer")
		case n < 1:
			add(prefix+".interval", "This field must be greater than 0")
		}
		if freq == "week" && len(o.DaysOfWeek) == 0 {
			add(prefix+".daysOfWeek", "Select a value for this field")
		}
		if freq == "month" || freq == "year" {
			if o.RunOn == "" {
				add(prefix+".runOn", "Select a value for this field")
			} else if o.RunOn == "day" {
				if d, err := strconv.Atoi(o.RunOnDayNumber); err != nil || d < 1 || d > 31 {
					add(prefix+".runOn", "Please select a day number between 1 and 31.")
				}
			}
		}
		switch o.End {
		case "never":
		case "after":
			if n, err := strconv.Atoi(o.Occurrences); err != nil || n < 1 {
				add(prefix+".occurrences", "Please enter a number of occurrences.")
			}
		case "onDate":
			if !dateRe.MatchString(o.EndDate) {
				add(prefix+".endDate", "Invalid date format")
			}
			if !timeRe.MatchString(o.EndTime) {
				add(prefix+".endTime", "Invalid time format")
			}
			end, endOK := parseClock(o.EndDate, o.EndTime, loc)
			if startOK && endOK {
				if !end.After(start) {
					add(prefix+".endDate", "Please select an end date/time that comes after the start date/time.")
				}
				minDays := map[string]int{"week": 7, "month": 31, "year": 365}[freq]
				if minDays > 0 && !strings.HasPrefix(prefix, "exception") {
					span := int(end.Sub(start).Hours() / 24)
					if span < minDays && len(errs[prefix+".interval"]) == 0 {
						text := dtstartLine(start, v.Timezone) + " RRULE:" + ruleString(freq, o, loc)
						if set, err := rrule.ParseSet(text); err == nil {
							if _, ok := set.First(); !ok {
								add("startDate", "Selected date range must have at least 1 schedule occurrence.")
								add(prefix+".endDate", "Selected date range must have at least 1 schedule occurrence.")
							}
						}
					}
				}
			}
		default:
			add(prefix+".end", "Select a value for this field")
		}
	}
	for _, freq := range v.Frequency {
		check("frequencyOptions."+freq, freq, v.FrequencyOptions[freq])
	}
	for _, freq := range v.ExceptionFrequency {
		check("exceptionOptions."+freq, freq, v.ExceptionOptions[freq])
	}
	if len(errs) == 0 && len(v.ExceptionFrequency) > 0 && !scheduleHasInstances(v, start, loc) {
		add("exceptionFrequency", "This schedule has no occurrences due to the selected exceptions.")
	}
	return errs
}

// scheduleHasInstances checks the rule set yields something within the
// longest frequency's span, as the form did before saving exceptions.
func scheduleHasInstances(v *scheduleValues, start time.Time, loc *time.Location) bool {
	rangeDays := 1
	for _, freq := range v.Frequency {
		if d := map[string]int{"week": 7, "month": 31, "year": 365}[freq]; d > rangeDays {
			rangeDays = d
		}
	}
	text, err := buildRRule(v)
	if err != nil {
		return true
	}
	set, err := rrule.ParseSet(text)
	if err != nil {
		return true
	}
	o, ok := set.After(start.Add(-time.Second), true)
	return ok && !o.Time.After(start.AddDate(0, 0, rangeDays))
}

// --- building the rrule -------------------------------------------------------

// dtstartLine renders DTSTART the way the rrule library did: a Z time for
// UTC, otherwise the wall clock with its TZID.
func dtstartLine(start time.Time, tz string) string {
	if tz == "" || strings.EqualFold(tz, "UTC") {
		return "DTSTART:" + start.UTC().Format("20060102T150405Z")
	}
	return "DTSTART;TZID=" + tz + ":" + start.Format("20060102T150405")
}

// ruleString renders one frequency's RRULE body (buildRuleObj), keeping the
// option order the old form produced.
func ruleString(freq string, o *freqOptions, loc *time.Location) string {
	parts := []string{"INTERVAL=" + o.Interval, "FREQ=" + frequencyRRule[freq]}
	days := func(name string) string { return strings.Join(runOnDayCodes[name], ",") }
	switch freq {
	case "week":
		if len(o.DaysOfWeek) > 0 {
			parts = append(parts, "BYDAY="+strings.Join(o.DaysOfWeek, ","))
		}
	case "month":
		if o.RunOn == "day" {
			parts = append(parts, "BYMONTHDAY="+o.RunOnDayNumber)
		} else if o.RunOn == "the" {
			parts = append(parts, "BYSETPOS="+o.RunOnTheOccurrence, "BYDAY="+days(o.RunOnTheDay))
		}
	case "year":
		if o.RunOn == "day" {
			parts = append(parts, "BYMONTH="+o.RunOnDayMonth, "BYMONTHDAY="+o.RunOnDayNumber)
		} else if o.RunOn == "the" {
			parts = append(parts, "BYSETPOS="+o.RunOnTheOccurrence, "BYDAY="+days(o.RunOnTheDay), "BYMONTH="+o.RunOnTheMonth)
		}
	}
	switch o.End {
	case "after":
		parts = append(parts, "COUNT="+o.Occurrences)
	case "onDate":
		if end, ok := parseClock(o.EndDate, o.EndTime, loc); ok {
			parts = append(parts, "UNTIL="+end.UTC().Format("20060102T150405Z"))
		}
	}
	return strings.Join(parts, ";")
}

// buildRRule renders the form as the rrule the API stores (buildRuleSet).
func buildRRule(v *scheduleValues) (string, error) {
	loc, err := time.LoadLocation(v.Timezone)
	if err != nil {
		return "", fmt.Errorf("unknown time zone %q", v.Timezone)
	}
	start, ok := parseClock(v.StartDate, v.StartTime, loc)
	if !ok {
		return "", fmt.Errorf("invalid start date or time")
	}
	lines := []string{dtstartLine(start, v.Timezone)}
	if len(v.Frequency) == 0 {
		lines = append(lines, "RRULE:INTERVAL=1;COUNT=1;FREQ=MINUTELY")
	}
	for _, freq := range scheduleFrequencies {
		if v.Has(freq) {
			lines = append(lines, "RRULE:"+ruleString(freq, v.FrequencyOptions[freq], loc))
		}
	}
	for _, freq := range scheduleFrequencies {
		if v.HasException(freq) {
			lines = append(lines, "EXRULE:"+ruleString(freq, v.ExceptionOptions[freq], loc))
		}
	}
	return strings.Join(lines, " "), nil
}

// --- the detail page's frequency summary ---------------------------------------

// freqDetail is one frequency as the detail page describes it.
type freqDetail struct {
	Key      string
	Label    string
	Prefix   string // data-cy prefix
	RunEvery string
	OnDays   string
	RunOn    string
	End      string
	Skip     bool
}

// tr translates a message: a *i18n.Locale's T, or the identity in tests.
type tr func(msgid string, args ...any) string

// ordinalDay is "The first Monday" (with "of January" when a month is
// given), in the old FrequencyDetails' messages. The catalogs' ordinal
// messages carry no other case, so a language whose ordinal category for
// the number has none falls back to the English wording.
func ordinalDay(T tr, occurrence, day, month string) string {
	en := "The " + ordinalWords[occurrence] + " " + runOnDayDetailLabels[day]
	if month != "" {
		en += " of " + monthName(month)
	}
	dayLabel := T(runOnDayDetailLabels[day])
	var out string
	switch {
	case occurrence == "-1" && month == "":
		out = T("The last {dayOfWeek}", "dayOfWeek", dayLabel)
	case occurrence == "-1":
		out = T("The last {weekday} of {month}", "weekday", dayLabel, "month", T(monthName(month)))
	case month == "":
		out = T("{0, selectordinal, one {The first {dayOfWeek}} two {The second {dayOfWeek}} =3 {The third {dayOfWeek}} =4 {The fourth {dayOfWeek}} =5 {The fifth {dayOfWeek}}}", "0", occurrence, "dayOfWeek", dayLabel)
	default:
		out = T("{0, selectordinal, one {The first {weekday} of {month}} two {The second {weekday} of {month}} =3 {The third {weekday} of {month}} =4 {The fourth {weekday} of {month}} =5 {The fifth {weekday} of {month}}}", "0", occurrence, "weekday", dayLabel, "month", T(monthName(month)))
	}
	if strings.TrimSpace(out) == "" {
		return en
	}
	return out
}

// frequencyDetails describes each selected frequency (FrequencyDetails).
func frequencyDetails(T tr, freqs []string, opts map[string]*freqOptions, tz string, exception bool) []freqDetail {
	loc, err := time.LoadLocation(tz)
	if err != nil || tz == "" {
		loc = time.UTC
	}
	var out []freqDetail
	for _, f := range freqs {
		o := opts[f]
		if o == nil {
			continue
		}
		d := freqDetail{Key: f, Label: T(frequencyLabels[f]), Skip: exception}
		d.Prefix = "frequency-" + f
		if exception {
			d.Prefix = "exception-" + f
		}
		d.RunEvery = T("{interval, plural, one {# "+f+"} other {# "+f+"s}}", "interval", o.Interval)
		if f == "week" {
			days := append([]string(nil), o.DaysOfWeek...)
			sort.SliceStable(days, func(i, j int) bool { return weekdaySort(days[i]) < weekdaySort(days[j]) })
			names := make([]string, 0, len(days))
			for _, c := range days {
				names = append(names, T(weekdayLabels[c]))
			}
			d.OnDays = strings.Join(names, ", ")
		}
		switch f {
		case "month":
			if o.RunOn == "day" {
				d.RunOn = T("Day {0}", "0", o.RunOnDayNumber)
			} else {
				d.RunOn = ordinalDay(T, o.RunOnTheOccurrence, o.RunOnTheDay, "")
			}
		case "year":
			if o.RunOn == "day" {
				d.RunOn = T(monthName(o.RunOnDayMonth)) + " " + o.RunOnDayNumber
			} else {
				d.RunOn = ordinalDay(T, o.RunOnTheOccurrence, o.RunOnTheDay, o.RunOnTheMonth)
			}
		}
		switch o.End {
		case "after":
			d.End = T("{numOccurrences, plural, one {After # occurrence} other {After # occurrences}}", "numOccurrences", o.Occurrences)
		case "onDate":
			if end, ok := parseClock(o.EndDate, o.EndTime, loc); ok {
				d.End = formatInZone(end.Format(time.RFC3339), tz)
			} else {
				d.End = o.EndDate + " " + o.EndTime
			}
		default:
			d.End = T("Never")
		}
		out = append(out, d)
	}
	return out
}

// weekdaySort puts Sunday first, as the detail did.
func weekdaySort(code string) int {
	for i, c := range weekdayCodes {
		if c == code {
			return i
		}
	}
	return 7
}

// formatInZone renders an API timestamp the way the old UI did for a
// schedule: in its zone, as "11/17/2026, 5:37:50 AM".
func formatInZone(iso, tz string) string {
	if iso == "" {
		return ""
	}
	t, err := time.Parse(time.RFC3339Nano, iso)
	if err != nil {
		return iso
	}
	loc := time.UTC
	if tz != "" {
		if l, err := time.LoadLocation(tz); err == nil {
			loc = l
		}
	}
	return t.In(loc).Format("1/2/2006, 3:04:05 PM")
}

// repeatFrequencyLabel joins the frequency names, or says the schedule runs once.
func repeatFrequencyLabel(T tr, freqs []string) string {
	if len(freqs) == 0 {
		return T("None (Run Once)")
	}
	names := make([]string, len(freqs))
	for i, f := range freqs {
		names[i] = T(frequencyLabels[f])
	}
	return strings.Join(names, ", ")
}
