"""Generate BYEASTER test vectors with python-dateutil, the library the old
application used, so the Go port can be checked against it (the same
fields as vectors.json, plus Easter Sunday for a range of years). Run with
the old image's virtualenv, without network:

  docker run --rm --network none -v $PWD:/w:ro \\
    --entrypoint /var/lib/ascender/venv/ascender/bin/python \\
    ghcr.io/ctrliq/ascender_devel:main /w/gen_easter.py > easter.json
"""
import datetime, json, re, sys
import dateutil.rrule, dateutil.parser
from dateutil.tz import tzutc, datetime_exists

UTC_TIMEZONES = {x: tzutc() for x in dateutil.parser.parserinfo().UTCZONE}
REF = datetime.datetime(2026, 11, 11, 12, 0, 0, tzinfo=tzutc())

cases = [
    "DTSTART;TZID=America/New_York:20261001T100000 RRULE:FREQ=YEARLY;INTERVAL=1;BYEASTER=0",
    "DTSTART;TZID=America/New_York:20261001T100000 RRULE:FREQ=YEARLY;INTERVAL=1;BYEASTER=-2",
    "DTSTART;TZID=America/New_York:20261001T100000 RRULE:FREQ=YEARLY;INTERVAL=1;BYEASTER=1,-46,60",
    "DTSTART;TZID=America/New_York:20261001T100000 RRULE:FREQ=YEARLY;INTERVAL=1;BYEASTER=0;COUNT=5",
    "DTSTART;TZID=America/New_York:20261001T100000 RRULE:FREQ=YEARLY;INTERVAL=2;BYEASTER=0;UNTIL=20361231T000000Z",
    "DTSTART;TZID=America/New_York:20261001T100000 RRULE:FREQ=YEARLY;INTERVAL=1;BYEASTER=-100",
    "DTSTART;TZID=America/New_York:20261001T100000 RRULE:FREQ=YEARLY;INTERVAL=1;BYEASTER=200",
    "DTSTART;TZID=America/New_York:20261001T100000 RRULE:FREQ=YEARLY;INTERVAL=1;BYEASTER=-452",
    "DTSTART;TZID=America/New_York:20261001T100000 RRULE:FREQ=YEARLY;INTERVAL=1;BYEASTER=257",
    "DTSTART;TZID=UTC:20261001T100000 RRULE:FREQ=YEARLY;INTERVAL=1;BYEASTER=0;BYMONTH=4",
    "DTSTART;TZID=America/New_York:20261001T100000 RRULE:FREQ=YEARLY;INTERVAL=1;BYEASTER=-3,-2,-1,0;BYSETPOS=-1",
    "DTSTART;TZID=Europe/Berlin:20261001T100000 RRULE:FREQ=MONTHLY;INTERVAL=1;BYEASTER=0",
    "DTSTART;TZID=Europe/Berlin:20261001T100000 RRULE:FREQ=WEEKLY;INTERVAL=1;BYEASTER=0,1",
    "DTSTART;TZID=UTC:20261001T100000 RRULE:FREQ=DAILY;INTERVAL=1;BYEASTER=0;BYHOUR=9,15;BYMINUTE=0",
    "DTSTART:20261001T100000Z RRULE:FREQ=HOURLY;INTERVAL=6;BYEASTER=0",
    "DTSTART;TZID=America/New_York:20261001T100000 RRULE:FREQ=DAILY;INTERVAL=1 EXRULE:FREQ=YEARLY;INTERVAL=1;BYEASTER=0",
]


def coerce_naive_until(rrule):
    start_date_match = re.search(r'DTSTART[^\s]+', rrule)
    start_date_rule = start_date_match.group(0)
    rules = re.split(r'\s+', rrule)
    for index in range(0, len(rules)):
        rule = rules[index]
        if 'until=' in rule.lower():
            match_until = re.match(r".*?(?P<until>UNTIL\=[0-9]+T[0-9]+)(?P<utcflag>Z?)", rule, re.IGNORECASE)
            if match_until is None:
                continue
            if not len(match_until.group('utcflag')):
                naive_until = match_until.group('until')
                temp_rule = "{} {}".format(start_date_rule, rule.replace(naive_until, naive_until + 'Z'))
                if rule.lower().startswith('ex'):
                    temp_rule = "{} {}".format(temp_rule, 'RRULE:FREQ=MINUTELY;INTERVAL=1;UNTIL=20380601T170000Z')
                local_tz = dateutil.rrule.rrulestr(temp_rule, tzinfos=UTC_TIMEZONES, forceset=True)._rrule[0]._dtstart.tzinfo
                localized_until = datetime.datetime.strptime(re.sub('^UNTIL=', '', naive_until, flags=re.IGNORECASE), "%Y%m%dT%H%M%S").replace(tzinfo=local_tz)
                utc_until = 'UNTIL=' + localized_until.astimezone(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
                rules[index] = rule.replace(naive_until, utc_until)
    return " ".join(rules)


def rrulestr(rrule, fast_forward=True):
    rrule = coerce_naive_until(rrule)
    x = dateutil.rrule.rrulestr(rrule, tzinfos=UTC_TIMEZONES, forceset=True)
    if fast_forward:
        try:
            first_event = x[0]
            if (REF - first_event).days > 7:
                for rule in x._rrule:
                    if rule._freq in [dateutil.rrule.MINUTELY, dateutil.rrule.HOURLY] and not rule._count:
                        new_start = (REF - datetime.timedelta(days=7)).strftime('%Y%m%d')
                        new_rrule = re.sub('(DTSTART[^:]*):[^T]+T', r'\1:{0}T'.format(new_start), rrule)
                        return rrulestr(new_rrule, fast_forward=False)
        except IndexError:
            pass
    return x


def iso(d):
    return d.isoformat()


out = []
for c in cases:
    rs = rrulestr(c)
    coerced = coerce_naive_until(c)
    # preview: 10 existing events after REF, local and utc
    local, utc = [], []
    for ev in rs.xafter(REF, count=20):
        if len(local) >= 10:
            break
        if not datetime_exists(ev):
            continue
        local.append(iso(ev))
        utc.append(iso(ev.astimezone(datetime.timezone.utc)))
    # next_run as update_computed_fields computed it
    nr = rs.after(REF)
    if nr is not None and not datetime_exists(nr):
        nr = rs.after(nr)
    try:
        dtstart = iso(rs[0].astimezone(datetime.timezone.utc))
    except IndexError:
        dtstart = None
    dtend = None
    if all(r._until or r._count for r in rs._rrule):
        try:
            dtend = iso(rs[-1].astimezone(datetime.timezone.utc))
        except IndexError:
            dtend = None
    out.append({'rrule': c, 'coerced': coerced, 'local': local, 'utc': utc, 'next_run': iso(nr.astimezone(datetime.timezone.utc)) if nr else None, 'dtstart': dtstart, 'dtend': dtend})
import dateutil.easter
easter = {str(y): dateutil.easter.easter(y).isoformat() for y in range(1583, 3001)}
json.dump({'vectors': out, 'easter': easter}, sys.stdout, indent=1)
