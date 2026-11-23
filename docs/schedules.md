## Scheduled Jobs

Ascender allows jobs to run on a schedule (with optional recurrence rules) via
an `HTTP POST` to a variety of API endpoints:

    HTTP POST

    https://ascender.example.org/api/v2/job_templates/N/schedules/
    https://ascender.example.org/api/v2/projects/N/schedules/
    https://ascender.example.org/api/v2/inventory_sources/N/schedules/
    https://ascender.example.org/api/v2/system_job_templates/N/schedules/
    https://ascender.example.org/api/v2/workflow_job_templates/N/schedules/

    {
        "name": "My Schedule Name",
        "rrule": "DTSTART:20300115T120000Z RRULE:FREQ=DAILY;INTERVAL=1;COUNT=7",
        "extra_data": {}
    }

...where `rrule` is a valid
[RFC5545](https://www.rfc-editor.org/rfc/rfc5545.txt) RRULE string and within Ascender [RRULE Limitations](#rrule-limitations).
The specific example above would run a job every day - for seven consecutive days - starting
on January 15th, 2030 at noon (UTC). A schedule can also be created with a
`POST` to `/api/v2/schedules/` naming its `unified_job_template`.

A project schedule needs a source control project (`Manual Project cannot
have a schedule set.`), and an inventory source schedule a cloud, project
(`scm`) or constructed source (`Inventory Source must be a cloud resource.`). Schedule names
are unique per template.

The API is in `src/internal/api/schedules.go` (reading) and
`src/internal/api/schedule_write.go` (writing, the preview and the scheduler
pass); recurrence rules are evaluated by `src/internal/rrule`, a port of the
parts of python-dateutil's `rrule`, `rruleset` and `rrulestr` the previous
implementation relied on, so that a rule yields the same occurrences.

For more examples see [Complex RRULE Examples](#complex-rrule-examples).

## Specifying Timezones

`DTSTART` values provided to Ascender _must_ provide timezone information (they may
not be naive dates).

For UTC dates, `DTSTART` values should be denoted with the `Z` suffix:

    DTSTART:20300115T120000Z

Local timezones can be specified using the `TZID=` parameter:

    DTSTART;TZID=America/New_York:20300115T120000

A naive `DTSTART` is refused (`DTSTART cannot be a naive datetime.  Specify
;TZINFO= or YYYYMMDDTHHMMSSZZ.`), and so is an unknown zone (`rrule parsing
failed validation: A valid TZID must be provided (e.g., America/New_York)`).
Zones are looked up in the IANA time zone database (the system's, or the
copy built into the Ascender binaries). The list of zone names Ascender
offers can be found at:

    HTTP GET /api/v2/schedules/zoneinfo/

    {
        "zones": [
            "Africa/Abidjan",
            "Africa/Accra",
            "Africa/Addis_Ababa",
            ...
        ],
        "links": {
            "America/Antigua": "America/Anguilla",
            ...
        }
    }

`links` maps alternative zone names to the zone they stand for. A schedule's
`timezone` field shows the zone of its `DTSTART` (`UTC` for a `Z` time), and
`until` the `UNTIL` of its rule in that zone, or an empty string.

Occurrences follow the wall clock of the `DTSTART` zone across daylight
saving time changes. An occurrence whose wall-clock time does not exist on a
given day (such as 2:30 when the clocks jump from 2:00 to 3:00) is skipped.

## UNTIL and Timezones

RFC5545 specifies that:

> Furthermore, if the "DTSTART" property is specified as a date with local
> time, then the UNTIL rule part MUST also be specified as a date with local
> time. If the "DTSTART" property is specified as a date with UTC time or
> a date with local time and time zone reference, then the UNTIL rule part
> MUST be specified as a date with UTC time.

Since `DTSTART` always has a zone, `UNTIL` should be given in UTC. An `UNTIL`
without the `Z` suffix is accepted and read as a wall-clock time in the
`DTSTART` zone, and the schedule stores the rule with that `UNTIL` converted
to UTC.

For example:

    DTSTART:20180601T120000Z RRULE:FREQ=DAILY;INTERVAL=1;UNTIL=20180606T170000Z
    DTSTART;TZID=America/New_York:20180601T120000 RRULE:FREQ=DAILY;INTERVAL=1;UNTIL=20180606T170000Z

are stored as given, while

    DTSTART;TZID=America/New_York:20180601T120000 RRULE:FREQ=DAILY;INTERVAL=1;UNTIL=20180606T170000

is stored as

    DTSTART;TZID=America/New_York:20180601T120000 RRULE:FREQ=DAILY;INTERVAL=1;UNTIL=20180606T210000Z

## Previewing Schedules

Ascender provides an endpoint for previewing the future dates and times for
a specified `RRULE`. A list of the next _ten_ occurrences will be returned in
local and UTC time (occurrences that fall in a daylight saving time gap are
left out):

    POST https://ascender.example.org/api/v2/schedules/preview/
    {
        "rrule": "DTSTART;TZID=America/New_York:20300115T120000 RRULE:FREQ=DAILY;INTERVAL=1;COUNT=7"
    }

    Content-Type: application/json
    {
        "local": [
            "2030-01-15T12:00:00-05:00",
            "2030-01-16T12:00:00-05:00",
            "2030-01-17T12:00:00-05:00",
            "2030-01-18T12:00:00-05:00",
            "2030-01-19T12:00:00-05:00",
            "2030-01-20T12:00:00-05:00",
            "2030-01-21T12:00:00-05:00"
        ],
        "utc": [
            "2030-01-15T17:00:00Z",
            "2030-01-16T17:00:00Z",
            "2030-01-17T17:00:00Z",
            "2030-01-18T17:00:00Z",
            "2030-01-19T17:00:00Z",
            "2030-01-20T17:00:00Z",
            "2030-01-21T17:00:00Z"
        ]
    }

The preview applies the same validation as saving a schedule.

## RRULE Limitations

Ascender implements the following constraints on top of the `RFC5545` specification
(`validateRRule` in `src/internal/api/schedule_write.go`), with the error
listed under `rrule`:

- The rrule must have a `DTSTART` (`Valid DTSTART required in rrule. Value should start with: DTSTART:YYYYMMDDTHHMMSSZ`)
- At least one `RRULE` entry must be in the rrule (`One or more rule required in rrule.`)
- Strings with more than a single `DTSTART:` component are prohibited (`Multiple DTSTART is not supported.`)
- The use of `RDATE` or `EXDATE` is prohibited (`RDATE not allowed in rrule.`, `EXDATE not allowed in rrule.`)
- For any of the rules in the rrule:
  - `INTERVAL` must be included (`INTERVAL required in rrule: <rule>`)
  - The use of `FREQ=SECONDLY` is prohibited (`SECONDLY is not supported: <rule>`)
  - The usage of a `BYDAY` with a prefixed number is prohibited (`BYDAY with numeric prefix not supported: <rule>`)
  - The usage of both `COUNT` and `UNTIL` in the same rule is prohibited (`RRULE may not contain both COUNT and UNTIL: <rule>`)
  - The use of `COUNT=` with a value over 999 is prohibited (`COUNT > 999 is unsupported: <rule>`)

Several `RRULE` entries may be combined, and `EXRULE` entries remove the
occurrences they match. `BYSETPOS`, `BYMONTH`, `BYMONTHDAY`, `BYYEARDAY`,
`BYWEEKNO`, `BYDAY`, `BYHOUR`, `BYMINUTE`, `BYSECOND` and `WKST` are
supported, and so is python-dateutil's `BYEASTER` extension: a list of day
offsets from Western Easter Sunday (`BYEASTER=0` is Easter Sunday,
`BYEASTER=-2` Good Friday), which leaves out the default `BYMONTH` and
`BYMONTHDAY` a yearly rule would otherwise take from `DTSTART`. As in
dateutil, an offset is applied to a mask of the year plus one week, so an
offset that reaches before the start of that mask wraps around to its end
(`BYEASTER=-100` lands in late December). An offset outside -452 to 257,
which made dateutil fail in some year when the schedule was saved, is
refused (`rrule parsing failed validation: list assignment index out of
range`). A rule that cannot be parsed, or holds an out-of-range value, is
refused with `rrule parsing failed validation: <reason>`.

Time zones follow the Go time zone database, including its rules after
2037; python-dateutil kept the last offset it had a transition for, so
occurrences after 2037 in a zone with daylight saving time can differ by an
hour from what the old application computed.

## Implementation Details

When a schedule is saved, its rrule is parsed, and the following are saved
in the database:

- `main_schedule.rrule` - the `RRULE` string provided by the user, with a naive `UNTIL` converted to UTC
- `main_schedule.dtstart` - the _first_ occurrence (coerced to UTC)
- `main_schedule.dtend` - the _last_ occurrence (coerced to UTC), or null when the rule has no end
- `main_schedule.next_run` - the _next_ occurrence after now (coerced to UTC), or null when there is none or the schedule is disabled

The template's `next_schedule` and `next_job_run` point at its enabled
schedule with the latest next run. A minutely or hourly rule without `COUNT`
whose first occurrence is more than a week old is evaluated from a week ago,
so that computing its next run stays cheap.

Every 30 seconds one `ascender-task` process, holding the scheduler's
advisory lock, runs the scheduler pass (`SchedulerPass`; see
[Background Tasks](./tasks.md#schedules)). The pass remembers when it last
ran (`main_ascenderschedulestate`). When `DISABLE_ALL_SCHEDULES` is set, a
pass only records its time. Otherwise, on each pass:

1. The enabled schedules whose
   `next_run` is before the previous pass (they fell behind, for example
   while no task process was running) get their `next_run` recomputed, and
   are not launched for the occurrences they missed.
2. Every enabled schedule whose `next_run` falls between the previous pass
   and now gets its `next_run` moved to the next occurrence, and its
   template is launched with `launch_type` `scheduled`, the schedule's
   prompts (see [Prompts on schedules](#prompts-on-schedules)), and the
   job's `schedule` set.

Some launches are skipped, with a log message:

* a project or inventory source whose last update is more recent than its
  cache timeout (`scm_update_cache_timeout`, `update_cache_timeout`);
* an inventory source that cannot be updated;
* a job template that already has `SCHEDULE_MAX_JOBS` (default 10) jobs,
  or a workflow job template that already has that many workflow jobs,
  pending, waiting or running ("Job template <name> could not be started
  because there are more than <n> other jobs from that template waiting to
  run", and the same for a "Workflow Job template").

A job template's job that needs credential passwords is created as `failed`,
with a finish time and the explanation "Scheduled job could not start
because it                     was not in the right state or required manual
credentials" (21 spaces before "was", as the old text had them).

When a task process starts, it recomputes every schedule's computed fields,
except the next runs that came due since a scheduler pass less than five
minutes before, which it leaves for the next pass to launch.

## Prompts on schedules

A schedule is a saved launch configuration: it can hold `inventory`,
`execution_environment`, `scm_branch`, `job_type`, `job_tags`, `skip_tags`,
`limit`, `diff_mode`, `verbosity`, `forks`, `job_slice_count`, `timeout` and
`extra_data`, and the sub-lists `credentials`, `labels` and
`instance_groups`, as far as its template prompts for them. They are checked
when the schedule is saved, and applied when it launches; what the template
no longer accepts by then is left out and logged. A system job template's
schedule takes `days`, `older_than` and `granularity` in `extra_data`, which
become the system job's variables. See
[Launch-time Configurations / Prompting](./prompting.md#saved-launch-time-configurations).

Creating a schedule takes the right to start its template (execute on a job
template or workflow job template, update on a project or on an inventory
source's inventory) and use of the inventory it prompts for. Changing it takes
admin on the template, or being the schedule's creator with the right to start
the template. Only the prompt fields an update sends are checked again (all
of them when it names `unified_job_template`, which a `PUT` must), so a
schedule can be renamed, disabled or enabled without its prompts being
checked; a `PUT` resets the char prompts it leaves out to `null`.

## Complex RRULE Examples

Every day except for April 30th:

    DTSTART;TZID=US/Eastern:20230428T170000 RRULE:INTERVAL=1;FREQ=DAILY EXRULE:INTERVAL=1;FREQ=DAILY;BYMONTH=4;BYMONTHDAY=30

Every 5 minutes but not on Mondays from 5-7pm:

    DTSTART;TZID=America/New_York:20220418T164500 RRULE:INTERVAL=5;FREQ=MINUTELY EXRULE:FREQ=MINUTELY;INTERVAL=5;BYDAY=MO;BYHOUR=17,18

Every 15 minutes Monday to Friday from 10:01am to 6:02pm (inclusive):

    DTSTART;TZID=America/New_York:20220417T100100 RRULE:INTERVAL=15;FREQ=MINUTELY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=10,11,12,13,14,15,16,17,18 EXRULE:INTERVAL=15;FREQ=MINUTELY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=18;BYMINUTE=3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,34,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59

Any Saturday whose month day is between 12 and 18:

    DTSTART:20191219T130551Z RRULE:FREQ=MONTHLY;INTERVAL=1;BYDAY=SA;BYMONTHDAY=12,13,14,15,16,17,18

Every Monday and Friday:

    DTSTART:20300115T120000Z RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=FR

The first Monday of every month:

    DTSTART:20300115T120000Z RRULE:FREQ=MONTHLY;INTERVAL=1;BYDAY=MO;BYSETPOS=1
