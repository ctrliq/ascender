"""Regenerate render316.json: what Jinja2 3.1.6's ImmutableSandboxedEnvironment
renders for each template below (or the exception it raises), with the
context given as JSON and the undefined class named.

Run it with the old image's Python, without network access, from the
repository root:

    docker run --rm --network none -v "$PWD/src/internal/jinja/testdata:/t:ro" \
        --entrypoint /var/lib/ascender/venv/ascender/bin/python \
        ghcr.io/ctrliq/ascender_devel:main -I /t/gen_render.py > src/internal/jinja/testdata/render316.json
"""

import json
import re
import sys
import warnings

import jinja2
from jinja2 import ChainableUndefined, StrictUndefined, Undefined, sandbox

warnings.simplefilter('ignore')


class DescriptiveUndefined(StrictUndefined):
    __repr__ = __str__ = StrictUndefined._fail_with_undefined_error

    def __init__(self, *args, **kwargs):
        super(DescriptiveUndefined, self).__init__(*args, **kwargs)
        self._undefined_hint = self._undefined_name


MODES = {'default': Undefined, 'strict': StrictUndefined, 'chainable': ChainableUndefined, 'descriptive': DescriptiveUndefined}

JOB = {
    'id': 42, 'name': 'Stub JobTemplate', 'status': 'successful', 'failed': False, 'elapsed': 0.403018, 'hosts': ['host1', 'host2'],
    'limit': '', 'extra_vars': '{"a": 1}', 'url': '/api/v2/jobs/42/',
    'summary_fields': {'inventory': {'id': 17, 'name': 'Stub Inventory', 'total_hosts': 1},
                       'created_by': {'username': 'admin', 'id': 1}, 'labels': {'count': 0, 'results': []}},
    'host_status_counts': {'ok': 5, 'changed': 3, 'failures': 0},
}
CTX = {
    'job': JOB, 'url': 'https://towerhost/#/jobs/playbook/1010', 'job_friendly_name': 'Job',
    'n': 7, 'f': 2.5, 'neg': -3, 'zero': 0, 's': 'Hello World', 'html': '<b>"x" & \'y\'</b>', 'empty': '', 'none': None,
    'yes': True, 'no': False, 'items': [3, 1, 2], 'words': ['banana', 'Apple', 'cherry', 'apple'], 'nested': [[1, 2], [3, 4]],
    'd': {'b': 2, 'a': 1, 'c': 3}, 'users': [{'name': 'ann', 'age': 30, 'role': 'admin'}, {'name': 'Bob', 'age': 25, 'role': 'user'},
                                              {'name': 'cid', 'age': 35, 'role': 'admin'}, {'name': 'dee', 'role': 'user'}],
    'big': 12345678901234567890, 'uni': 'straße ÉCOLE ﬁ', 'multiline': 'line one\nline two\n\nline four',
    'tree': [{'name': 'a', 'children': [{'name': 'a1', 'children': []}, {'name': 'a2', 'children': [{'name': 'a2x', 'children': []}]}]},
             {'name': 'b', 'children': []}],
    'mixed': [1, 'a', None], 'key_items': {'items': 'value', 'keys': 'k'}, 'num_str': '42', 'float_str': '3.75',
}

T = []


def case(src, ctx=None, modes=('default',)):
    for m in modes:
        T.append((src, CTX if ctx is None else ctx, m))


ALL = ('default', 'strict', 'chainable', 'descriptive')

# ---- output and literals
for src in ['{{ n }}', '{{ f }}', '{{ neg }}', '{{ s }}', '{{ none }}', '{{ yes }} {{ no }}', '{{ items }}', '{{ d }}', '{{ nested }}',
            '{{ users[0] }}', '{{ big }}', '{{ big * big }}', '{{ 2 ** 64 }}', '{{ 1.0 }} {{ 1e16 }} {{ 1e15 }} {{ 0.1 + 0.2 }} {{ 1e-5 }} {{ 100.0 / 3 }}',
            '{{ (1, 2) }} {{ (1,) }} {{ () }}', "{{ 'it\\'s' }} {{ ['a', \"b'c\"] }} {{ {'k': none, 1: 2.0} }}", '{{ [] }} {{ {} }}',
            '{{ uni }}', '{{ html }}', '{{ multiline }}', '{{ "\\u00e9\\U0001F600" }}', '{{ 10 ** 5000 }}', '{{ (10 ** 4299) | string | length }}',
            '{{ -0.0 }} {{ 1e308 * 10 }} {{ -(1e308 * 10) }}', '{{ 3 / 0 }}', '{{ 3 // 0 }}', '{{ 3 % 0 }}', '{{ 3.5 // 2 }} {{ -7 // 2 }} {{ -7 % 3 }} {{ 7 % -3 }} {{ -7.5 % 2 }}',
            '{{ 2 ** -1 }} {{ 0 ** -1 }}', '{{ (-8) ** 0.5 }}', '{{ 10 ** 400 > 1 }}', '{{ 1 + "a" }}', '{{ "a" + 1 }}', '{{ [1] + (2,) }}', '{{ "ab" * 3 }} {{ 3 * [0] }}',
            '{{ "a" * 2.0 }}', '{{ "a" - "b" }}', '{{ -"a" }}', '{{ none + 1 }}', '{{ d + d }}', '{{ 1 < "a" }}', '{{ items < [3, 2] }}', '{{ none < none }}',
            '{{ 1 == 1.0 }} {{ "a" == "a" }} {{ [1, 2] == [1, 2] }} {{ (1,) == [1] }} {{ d == {"a": 1, "b": 2, "c": 3} }}',
            '{{ 1 < 2 < 3 }} {{ 3 > 2 > 2 }} {{ 1 != 2 }}', '{{ "a" in "cat" }} {{ 2 in items }} {{ "a" in d }} {{ 5 not in items }}',
            '{{ 1 in "a" }}', '{{ "a" in 5 }}', '{{ not none }} {{ not items }} {{ none or "x" }} {{ 0 and 1 }} {{ "" or 0 or [] }}',
            '{{ s ~ n ~ none ~ yes }}', '{{ n if yes else 0 }} {{ n if no }}x', '{{ "x" if none }}', '{{ +n }} {{ -f }} {{ +yes }} {{ -yes }}',
            '{{ 7 // 2.0 }} {{ 7 / 2 }} {{ 6 / 3 }} {{ 2 ** 0.5 }}', '{{ 1_000 + 0x10 + 0o7 + 0b11 }}', '{{ 1e400 }}']:
    case(src)

# ---- undefined handling
for src in ['{{ missing }}', '{{ missing.attr }}', '{{ missing["k"] }}', '{{ missing + 1 }}', '{{ missing ~ "x" }}', '{% if missing %}y{% else %}n{% endif %}',
            '{% for x in missing %}{{ x }}{% else %}empty{% endfor %}', '{{ missing | length }}', '{{ missing is defined }} {{ missing is undefined }}',
            '{{ missing | default("dflt") }}', '{{ d.nope }}', '{{ d["nope"] }}', '{{ items[10] }}', '{{ items.nope }}', '{{ s.nope }}', '{{ job.nope.deeper }}',
            '{{ job.summary_fields.inventory.nope }}', '{{ missing == missing }}', '{{ missing == 1 }}', '{{ missing() }}', '{{ missing.method() }}',
            '{{ [missing] }}', '{{ missing | upper }}', '{{ missing | int }}', '{{ missing | list }}', '{{ missing in items }}', '{{ 1 in missing }}',
            '{{ missing | tojson }}', '{{ missing | e }}', '{{ missing[0:1] }}', '{{ "%s" % missing }}', '{{ missing | string }}', '{{ items[missing] }}',
            '{{ missing < 1 }}', '{{ -missing }}', '{{ missing is none }}', '{{ missing | default(none) is none }}', '{{ none.attr }}', '{{ n.attr }}',
            '{{ "{}".format(missing) }}', '{{ missing | join(",") }}', '{{ missing | first }}', '{{ missing | sum }}', '{{ missing|pprint }}']:
    case(src, modes=ALL)

# ---- sandbox
for src in ["{{ ''.__class__ }}", "{{ ''.__class__.__mro__ }}", '{{ items.append(4) }}{{ items }}', '{{ items.append }}', '{{ d.update({"z": 1}) }}',
            '{{ d.pop("a") }}', '{{ d.clear }}', '{{ items.pop() }}', '{{ items.sort() }}', '{{ d._private }}', '{{ key_items.items }}', '{{ key_items["items"] }}',
            '{{ key_items.keys() | list }}', '{{ d.items() }}', '{{ d.keys() }} {{ d.values() }}', '{{ d.get("a") }} {{ d.get("z") }} {{ d.get("z", 9) }}',
            '{{ d.copy() }}', '{{ items.index(2) }} {{ items.count(3) }}', '{{ items.copy() }}', '{{ (1, 2, 1).count(1) }}', '{{ range(5) }} {{ range(2, 10, 3) }}',
            '{{ range(5) | list }} {{ range(10, 0, -3) | list }}', '{{ range(100001) }}', '{{ range(0, 200001, 2) | length }}', '{{ range(1, 2, 0) }}', '{{ range() }}',
            '{{ range("a") }}', '{{ "{0} {x}".format(1, x=2) }}', '{{ "{0.__class__}".format("a") }}', '{{ "{a.b}".format(a=d) }}', '{{ "{a[b]}".format(a=d) }}',
            '{{ "{}".format(d.__class__) }}', '{{ "{x}".format_map({"x": 5}) }}', '{{ "{:>8.2f}|{:<5}|{:^7}|{:,}|{:x}|{:08.3e}".format(3.14159, "ab", "mid", 1234567, 255, 12345.678) }}',
            '{{ "{!r} {!s}".format("a", "b") }}', '{{ "{}{}".format(1) }}', '{{ "{0}{}".format(1, 2) }}', '{{ "{".format() }}', '{{ "{:d}".format("x") }}',
            '{{ dict(a=1, b=2) }}', '{{ dict([("x", 1)]) }}', '{{ dict }}', '{{ range }}', '{{ cycler }}', '{{ namespace }}', '{{ self }}', '{{ lipsum is callable }}',
            '{{ s.upper }}', '{{ s.format }}', '{{ n.real }} {{ n.imag }} {{ f.is_integer() }} {{ 4.0.is_integer() }} {{ n.bit_length() }}',
            '{{ dict.mro() }}', '{{ items.__len__() }}', '{{ d.items.__self__ }}']:
    case(src)

# ---- string methods
for src in ['{{ s.upper() }} {{ s.lower() }} {{ s.title() }} {{ s.capitalize() }} {{ s.swapcase() }}', '{{ uni.upper() }} {{ uni.lower() }} {{ uni.title() }} {{ uni.casefold() }}',
            '{{ s.split() }} {{ s.split("o") }} {{ s.split("o", 1) }} {{ "a,b,,c".split(",") }} {{ "  a  b  ".split() }} {{ "a b c".rsplit(" ", 1) }}',
            '{{ s.replace("o", "0") }} {{ s.replace("o", "0", 1) }} {{ s.startswith("He") }} {{ s.endswith(("x", "ld")) }} {{ s.find("o") }} {{ s.rfind("o") }} {{ s.find("z") }}',
            '{{ s.index("z") }}', '{{ s.count("l") }} {{ "  x  ".strip() }}|{{ "xxaxx".strip("x") }}|{{ "  x".lstrip() }}|{{ "x  ".rstrip() }}|',
            '{{ s.center(21, "*") }}|{{ s.ljust(15, ".") }}|{{ s.rjust(15) }}|{{ "42".zfill(5) }}|{{ "-42".zfill(5) }}', '{{ ",".join(["a", "b"]) }} {{ "-".join("abc") }}',
            '{{ ",".join([1, 2]) }}', '{{ s.partition(" ") }} {{ s.rpartition("o") }} {{ multiline.splitlines() }}', '{{ "abc".isalpha() }} {{ "12".isdigit() }} {{ "ab12".isalnum() }} {{ "  ".isspace() }} {{ "Ab".istitle() }} {{ "ab".islower() }} {{ "AB".isupper() }}',
            '{{ "prefix_x".removeprefix("prefix_") }} {{ "x.txt".removesuffix(".txt") }} {{ "a\\tb".expandtabs(4) }}', '{{ s[0] }} {{ s[-1] }} {{ s[1:5] }} {{ s[::-1] }} {{ s[::2] }} {{ s[100:] }}|',
            '{{ items[1:] }} {{ items[:-1] }} {{ items[::-1] }} {{ (1, 2, 3)[1:] }} {{ range(10)[2:8:2] }}', '{{ s[100] }}', '{{ n[0] }}', '{{ s["x"] }}', '{{ d[0:1] }}',
            '{{ items[1:2:0] }}', '{{ "%s and %s" % ("a", "b") }} {{ "%d%%" % 50 }} {{ "%05.1f" % 3.14159 }} {{ "%-5s|" % "ab" }} {{ "%x %X %o" % (255, 255, 8) }}',
            '{{ "%(a)s-%(b)d" % {"a": "x", "b": 3} }} {{ "%r" % "q" }} {{ "%e" % 12345.678 }} {{ "%g %g %g" % (0.0001, 1e20, 123.456) }} {{ "%c" % 65 }} {{ "%+d" % 5 }}',
            '{{ "%s" % (1, 2) }}', '{{ "%s %s" % (1,) }}', '{{ "%d" % "x" }}', '{{ "%z" % 1 }}', '{{ "%s" % [1, 2] }}', '{{ "%s" % d }}', '{{ "%(a)s" % 1 }}']:
    case(src)

# ---- filters
for src in ['{{ neg | abs }} {{ -2.5 | abs }}', '{{ "a" | abs }}', '{{ users[0] | attr("name") }}|{{ d | attr("items") }}|{{ d | attr("a") }}|',
            '{{ items | batch(2) | list }} {{ items | batch(2, "x") | list }}', '{{ s | capitalize }} {{ s | center(15) }}|', '{{ items | count }} {{ s | length }} {{ d | length }}',
            '{{ none | d("x") }} {{ empty | default("e", true) }} {{ 0 | default(5) }}', '{{ d | dictsort }} {{ d | dictsort(reverse=true) }} {{ d | dictsort(by="value") }}',
            '{{ {"B": 1, "a": 2} | dictsort }} {{ {"B": 1, "a": 2} | dictsort(true) }}', '{{ d | dictsort(by="x") }}', '{{ html | e }} {{ html | escape }} {{ html | forceescape }}',
            '{{ 1 | filesizeformat }} {{ 999 | filesizeformat }} {{ 1000 | filesizeformat }} {{ 123456789 | filesizeformat }} {{ 1048576 | filesizeformat(true) }} {{ 10**30 | filesizeformat }}',
            '{{ "x" | filesizeformat }}', '{{ items | first }} {{ s | first }} {{ [] | first }}', '{{ num_str | float }} {{ "x" | float }} {{ "x" | float(1.5) }} {{ 3 | float }} {{ "1e3" | float }}',
            '{{ "%s-%s" | format(1, 2) }} {{ "%(a)s" | format(a=5) }}', '{{ "%s" | format(1, a=2) }}', '{{ users | groupby("role") }}',
            '{% for g in users | groupby("role") %}{{ g.grouper }}:{{ g.list | map(attribute="name") | join(",") }};{% endfor %}',
            '{% for role, people in users | groupby("role") %}{{ role }}={{ people | length }} {% endfor %}', '{{ users | groupby("age", default=0) | map(attribute="grouper") | list }}',
            '{{ multiline | indent }}|{{ multiline | indent(2, true) }}|{{ multiline | indent("> ", blank=true) }}', '{{ num_str | int }} {{ "x" | int }} {{ "x" | int(7) }} {{ float_str | int }} {{ "0x1f" | int(base=16) }} {{ 3.9 | int }} {{ "1_000" | int }} {{ " 12 " | int }}',
            '{{ items | join }} {{ items | join(", ") }} {{ users | join(",", attribute="name") }}', '{{ items | last }} {{ s | last }} {{ [] | last }}', '{{ (x for x in items) }}',
            '{{ s | list }} {{ d | list }} {{ "" | list }}', '{{ s | lower }} {{ s | upper }} {{ s | title }} {{ "hello-world foo(bar) x" | title }}', '{{ d | items | list }}',
            '{{ items | map("string") | list }} {{ users | map(attribute="name") | list }} {{ users | map(attribute="age", default=0) | list }} {{ words | map("upper") | join(",") }}',
            '{{ items | map("nope") | list }}', '{{ items | map }}', '{{ items | map() | list }}', '{{ items | max }} {{ items | min }} {{ words | max }} {{ words | min(case_sensitive=true) }} {{ users | max(attribute="name") }} {{ [] | max }}',
            '{{ d | pprint }} {{ items | pprint }} {{ s | pprint }}', '{{ users | pprint }}', '{{ items | reject("odd") | list }} {{ items | select("odd") | list }} {{ [0, 1, none, "", "a"] | select | list }}',
            '{{ users | selectattr("role", "equalto", "admin") | map(attribute="name") | list }} {{ users | rejectattr("age") | list }}', '{{ items | select("nope") | list }}',
            '{{ s | replace("World", "There") }} {{ "aaa" | replace("a", "b", 2) }}', '{{ items | reverse | list }} {{ s | reverse }} {{ items | reverse }}', '{{ d | reverse | list }}',
            '{{ 2.5 | round }} {{ 3.5 | round }} {{ 2.675 | round(2) }} {{ 3.14159 | round(2, "floor") }} {{ 3.14159 | round(1, "ceil") }} {{ 5 | round }} {{ 1234 | round(-2) }}',
            '{{ 1 | round(method="x") }}', '{{ "x" | round }}', '{{ html | safe }}', '{{ items | slice(2) | list }} {{ range(10) | slice(3, "x") | list }}',
            '{{ items | sort }} {{ words | sort }} {{ words | sort(case_sensitive=true) }} {{ words | sort(reverse=true) }} {{ users | sort(attribute="age") | map(attribute="name") | list }}',
            '{{ users | sort(attribute="role,name") | map(attribute="name") | list }}', '{{ mixed | sort }}', '{{ n | string }} {{ none | string }}', '{{ "<p>a  <b>b</b>\n c</p> &amp; <!-- x -->d" | striptags }}',
            '{{ items | sum }} {{ users | sum(attribute="age", start=1) }} {{ [[1], [2]] | sum(start=[]) }}', '{{ words | sum }}', '{{ "  x  " | trim }}|{{ "--x--" | trim("-") }}',
            '{{ "Hello beautiful world" | truncate(10) }}|{{ "Hello beautiful world" | truncate(10, true) }}|{{ "Hello beautiful world" | truncate(18, false, "!") }}|{{ "short" | truncate(3) }}',
            '{{ "abc" | truncate(2) }}', '{{ words | unique | list }} {{ words | unique(case_sensitive=true) | list }} {{ users | unique(attribute="role") | map(attribute="name") | list }}',
            '{{ "a b&c" | urlencode }} {{ d | urlencode }} {{ [("a b", 1)] | urlencode }} {{ "é/x" | urlencode }}', '{{ "visit https://example.com/x?a=1, or www.test.org." | urlize }}',
            '{{ "mail me@example.com (http://a.co)" | urlize(nofollow=true, target="_blank") }}', '{{ "long https://example.com/very/long/path here" | urlize(15) }}',
            '{{ "one two  three" | wordcount }} {{ uni | wordcount }}', '{{ "The quick brown fox jumps over the lazy dog" | wordwrap(10) }}', '{{ "a-very-long-hyphenated-word in text" | wordwrap(8) }}',
            '{{ "Loooooooooooooong word" | wordwrap(5, false) }}', '{{ {"class": "a b", "id": none, "data": "<x>"} | xmlattr }}', '{{ {"bad key": 1} | xmlattr }}',
            '{{ d | tojson }} {{ users | tojson }} {{ html | tojson }} {{ none | tojson }} {{ "é😀" | tojson }} {{ [1.0, 1e100, (1, 2)] | tojson }}', '{{ d | tojson(2) }}',
            '{{ {1: 2, "a": 3} | tojson }}', '{{ {(1, 2): 3} | tojson }}', '{{ items | random in items }}', '{{ items | upper(1) }}', '{{ s | truncate(1, 2, 3, 4, 5, 6) }}',
            '{{ s | replace("a") }}', '{{ s | center(width=5, x=1) }}', '{{ s | length(1) }}', '{{ items | join(d="-") }}', '{{ items | nope }}', '{% if s %}{{ s | nope }}{% endif %}']:
    case(src)

# ---- tests
for src in ['{{ n is odd }} {{ n is even }} {{ n is divisibleby 7 }} {{ n is divisibleby(2) }}', '{{ none is none }} {{ yes is boolean }} {{ no is false }} {{ yes is true }} {{ 1 is true }}',
            '{{ n is integer }} {{ f is float }} {{ yes is integer }} {{ n is number }} {{ s is string }} {{ d is mapping }} {{ items is sequence }} {{ s is sequence }} {{ n is sequence }}',
            '{{ items is iterable }} {{ n is iterable }} {{ s is lower }} {{ "ab" is lower }} {{ "AB" is upper }} {{ html | e is escaped }} {{ s is escaped }}',
            '{{ s is callable }} {{ s.upper is callable }} {{ range is callable }} {{ 2 is in items }} {{ "upper" is filter }} {{ "odd" is test }} {{ "nope" is filter }}',
            '{{ n is eq 7 }} {{ n is == 7 }} {{ n is ne 7 }} {{ n is gt 3 }} {{ n is ge 7 }} {{ n is lt 3 }} {{ n is le 7 }} {{ n is greaterthan 1 }} {{ n is lessthan 1 }} {{ n is equalto 7 }}',
            '{{ none is sameas none }} {{ items is sameas items }} {{ n is sameas 7 }}', '{{ "a" is odd }}', '{{ n is nope }}', '{{ n is divisibleby }}', '{{ n is divisibleby 0 }}',
            '{{ users | selectattr("name", "lower") | map(attribute="name") | list }}']:
    case(src)

# ---- statements
for src in ['{% for x in items %}{{ loop.index }}/{{ loop.length }}:{{ x }}{{ "," if not loop.last }}{% endfor %}',
            '{% for x in items %}{{ loop.index0 }}{{ loop.revindex }}{{ loop.revindex0 }}{{ loop.first }}{{ loop.last }} {% endfor %}',
            '{% for x in items %}{{ loop.previtem }}|{{ loop.nextitem }};{% endfor %}', '{% for x in items %}{{ loop.cycle("a", "b") }}{% endfor %}',
            '{% for x in [1, 1, 2, 2, 1] %}{% if loop.changed(x) %}{{ x }}{% endif %}{% endfor %}', '{% for x in items %}{{ loop }}{% endfor %}',
            '{% for k, v in d.items() %}{{ k }}={{ v }};{% endfor %}', '{% for k, v in d | dictsort %}{{ k }}={{ v }};{% endfor %}', '{% for a, b in nested %}{{ a + b }} {% endfor %}',
            '{% for a, b in items %}{% endfor %}', '{% for a, b in [(1, 2, 3)] %}{% endfor %}', '{% for a in 5 %}{% endfor %}', '{% for x in items if x > 1 %}{{ x }}{{ loop.length }}{% endfor %}',
            '{% for x in [] %}a{% else %}none{% endfor %}', '{% for x in items if x > 5 %}a{% else %}filtered{% endfor %}', '{% for x in s %}{{ x }}.{% endfor %}',
            '{% for x in d %}{{ x }}{% endfor %}', '{% for x in range(3) %}{% for y in range(2) %}{{ x }}{{ y }}{{ loop.depth }} {% endfor %}{% endfor %}',
            '{% for node in tree recursive %}{{ node.name }}[{{ loop.depth }}]{% if node.children %}({{ loop(node.children) }}){% endif %}{% endfor %}',
            '{% for x in items %}{{ loop(items) }}{% endfor %}', '{% set total = 0 %}{% for x in items %}{% set total = total + x %}{% endfor %}{{ total }}',
            '{% set ns = namespace(total=0) %}{% for x in items %}{% set ns.total = ns.total + x %}{% endfor %}{{ ns.total }} {{ ns }}', '{% set x = 5 %}{% set x.y = 1 %}',
            '{% set ns = namespace() %}{{ ns.nope }}|{{ ns.items }}', '{% for x in items %}{% set y = x %}{% endfor %}{{ y }}', '{{ x }}{% set x = 1 %}{{ x }}',
            '{% set x, y = 1, 2 %}{{ x }}{{ y }}', '{% set x, y = [1] %}', '{% set a, b = "xy" %}{{ b }}{{ a }}', '{% set s %}captured {{ n }}{% endset %}[{{ s }}]',
            '{% set s | upper %}captured{% endset %}{{ s }}', '{% if n > 5 %}big{% elif n > 2 %}mid{% else %}small{% endif %}', '{% if items %}{% set z = 1 %}{% endif %}{{ z }}',
            '{% macro greet(name, greeting="Hello") %}{{ greeting }}, {{ name }}!{% endmacro %}{{ greet("Ann") }} {{ greet("Bob", "Hi") }} {{ greet(name="Cy") }}',
            '{% macro m(a) %}{{ a }}{% endmacro %}{{ m() }}|', '{% macro m(a) %}{{ a }}{% endmacro %}{{ m(1, 2) }}', '{% macro m(a) %}{{ a }}{% endmacro %}{{ m(b=1) }}',
            '{% macro m() %}{{ varargs }}{{ kwargs }}{% endmacro %}{{ m(1, 2, x=3) }}', '{% macro m(a, b=a) %}{{ b }}{% endmacro %}{{ m(4) }}', '{% macro m() %}x{% endmacro %}{{ m }}',
            '{% macro m(n) %}{% if n > 0 %}{{ n }}{{ m(n - 1) }}{% endif %}{% endmacro %}{{ m(3) }}', '{% macro m() %}{{ caller() }}{% endmacro %}{% call m() %}inside{% endcall %}',
            '{% macro m() %}{{ caller(5) }}{% endmacro %}{% call(x) m() %}got {{ x }}{% endcall %}', '{% macro m() %}{{ caller() }}{% endmacro %}{{ m() }}',
            '{% macro m() %}{{ x }}{% endmacro %}{% set x = 1 %}{{ m() }}{% set x = 2 %}{{ m() }}', '{% macro m() %}{{ x }}{% endmacro %}{{ m() }}{% set x = 3 %}',
            '{% macro m() %}{{ n }}{% endmacro %}{{ m() }}', '{{ m.name }}{% macro m(a, b) %}{% endmacro %}{{ m.arguments }}', '{% filter upper %}hello {{ s }}{% endfilter %}',
            '{% filter length %}abc{% endfilter %}', '{% with a = 1, b = n %}{{ a + b }}{% endwith %}{{ a }}', '{% with a = 1 %}{% with b = a + 1 %}{{ b }}{% endwith %}{% endwith %}',
            '{% block b %}block {{ n }}{% endblock %} after', '{% block b %}{{ x }}{% endblock %}{% set x = 1 %}', '{% set x = 1 %}{% block b %}{{ x }}{% endblock %}',
            '{% for i in items %}{% block b %}{{ i }}{% endblock %}{% endfor %}', '{% for i in items %}{% block b scoped %}{{ i }}{% endblock %}{% endfor %}',
            '{% block a %}A{% endblock %}{{ self.a() }}', '{% block a %}{{ super() }}{% endblock %}', '{% block r required %}{% endblock %}', '{% extends "x.html" %}', '{% include "x.html" %}',
            '{% include "x" ignore missing %}', '{% include [] %}', '{% import "x" as y %}', '{% from "x" import y %}', '{% autoescape true %}{{ html }} {{ html | safe }} {{ s ~ html }}{% endautoescape %} {{ html }}',
            '{% autoescape true %}{% set v %}<i>{% endset %}{{ v }}{{ v | length }}{% endautoescape %}', '{% autoescape true %}{{ items | join("<") }}{% endautoescape %}',
            '{% autoescape yes %}{{ "<x>" }}{% endautoescape %}', '{% raw %}{{ not parsed }}{% endraw %}', 'a {# comment #} b', '{%- if yes -%}  trimmed  {%- endif -%}',
            '{% set c = cycler("odd", "even") %}{{ c.next() }}{{ c.next() }}{{ c.next() }}{{ c.current }}', '{% set j = joiner("|") %}{{ j() }}a{{ j() }}b{{ j() }}c',
            '{{ lipsum(1, false, 5, 6) | wordcount }}', '{% for x in items %}{{ x }}{% endfor %}{{ x }}', '{% set x = 1 %}{% for i in [1] %}{% set x = 2 %}{{ x }}{% endfor %}{{ x }}',
            '{% for x in items %}{% if loop.first %}{% set f = x %}{% endif %}{% endfor %}{{ f }}', '{{ caller }}', '{{ loop }}', '{% for x in items %}{{ loop.cycle() }}{% endfor %}',
            '{% for x in (y for y in items) %}{% endfor %}', '{% autoescape yes %}{{ "<a>" ~ "<b>" }}|{{ s ~ "<" }}|{{ ("<",) }}{% endautoescape %}',
            '{% autoescape no %}{{ "<x>" }}{% autoescape yes %}{{ "<y>" }}{% endautoescape %}{% endautoescape %}', '{% macro m() %}{{ "<m>" }}{% endmacro %}{% autoescape true %}{{ m() }}{% endautoescape %}',
            '{% set x %}a{% endset %}{% filter upper %}{{ x }}{% endfilter %}', '{{ "%s" % none }} {{ "%s" % (none,) }}', '{% for a, b in d %}{% endfor %}', '{{ items | sort(attribute="nope") }}']:
    case(src)

# ---- notification-like templates, every undefined class
for src in ['{{ job_friendly_name }} #{{ job.id }} \'{{ job.name }}\' {{ job.status }}: {{ url }}', '{{ job.summary_fields.inventory.name }} {{ job.hosts }} {{ job.host_status_counts }}',
            '{{ job.summary_fields.created_by.username }} {{ job.summary_fields.labels }}', '{{ job.extra_vars }} {{ job.elapsed }} {{ job.failed }} {{ job.limit }}|',
            '{% if job.failed %}FAILED{% else %}ok{% endif %} {{ job.host_status_counts.ok + job.host_status_counts.changed }}', '{{ job.nope }}', '{{ job.summary_fields.nope.name }}',
            '{{ job | tojson }}', '{{ job.summary_fields | pprint }}', '{% for h in job.hosts %}- {{ h }}\n{% endfor %}']:
    case(src, modes=ALL)


def norm(s):
    return re.sub(r' at 0x[0-9a-f]+', ' at 0x?', s)


out = {'jinja2': jinja2.__version__, 'cases': []}
for src, ctx, mode in T:
    env = sandbox.ImmutableSandboxedEnvironment(undefined=MODES[mode])
    rec = {'source': src, 'context': ctx is CTX and 'CTX' or ctx, 'mode': mode}
    try:
        rec['output'] = norm(env.from_string(src).render(ctx))
        rec['error'] = None
    except Exception as e:
        rec['output'] = None
        rec['error'] = {'type': type(e).__name__, 'message': norm(str(e))}
    out['cases'].append(rec)
out['contexts'] = {'CTX': CTX}
json.dump(out, sys.stdout, ensure_ascii=False, indent=1)
sys.stdout.write('\n')
