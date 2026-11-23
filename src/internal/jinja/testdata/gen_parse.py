"""Regenerate parse316.json: Jinja2 3.1.6's parse tree (repr) of each
template below, or the error parsing or compiling it raised.

Run it with the old image's Python, without network access, from the
repository root:

    docker run --rm --network none -v "$PWD/src/internal/jinja/testdata:/t:ro" \
        --entrypoint /var/lib/ascender/venv/ascender/bin/python \
        ghcr.io/ctrliq/ascender_devel:main -I /t/gen_parse.py > src/internal/jinja/testdata/parse316.json
"""

import json
import sys
import warnings

import jinja2
from jinja2 import sandbox

warnings.simplefilter('ignore')

TEMPLATES = [
    # data, whitespace control, comments, raw
    '', 'hello', 'a\nb\n', 'a\r\nb\rc', 'line\n\n', '{{ x }}', '  {{- x -}}  ', '{{ x }}\n', 'a {#- c -#} b', 'a {# c #}',
    'a {#+ c +#} b', '{# multi\nline #}x', '{#', 'x {#', '{# unterminated', '{% raw %}{{ x }}{% endraw %}', '{%- raw -%} a {%- endraw -%} b',
    '{% raw %}x', '{%raw%}{%endraw%}', 'a {%+ if x %}b{% endif %}', 'a\n  {%- if x -%}\n b \n{%- endif %}', '{{x}}{{y}}', '{{ x -}}\n\n{{ y }}',
    # literals
    '{{ 1 }}', '{{ 0 }}', '{{ 00 }}', '{{ 0_0 }}', '{{ 1_000 }}', '{{ 0b101 }}', '{{ 0o17 }}', '{{ 0x1F }}', '{{ 0XfF }}', '{{ 0b }}',
    '{{ 1.5 }}', '{{ 1e3 }}', '{{ 1.5e-3 }}', '{{ 1_0.2_5 }}', '{{ 1E+2 }}', '{{ .5 }}', '{{ 1. }}', '{{ 1.e5 }}', '{{ 12345678901234567890123 }}',
    '{{ 1e400 }}', '{{ 0.1 }}', '{{ 1e16 }}', '{{ 1e15 }}', '{{ 1e-5 }}', '{{ x.1 }}', '{{ x.1.2 }}', '{{ x[1.5] }}',
    "{{ 'a' }}", '{{ "b" }}', "{{ 'a' 'b' \"c\" }}", r"{{ 'a\nb\tc\\d\'e' }}", r"{{ '\x41é\U0001F600' }}", r"{{ '\N{EM DASH}' }}",
    r"{{ '\101\0' }}", r"{{ '\d\q' }}", r"{{ '\x4' }}", r"{{ '\u12' }}", r"{{ '\U12345678' }}", r"{{ '\N{NOPE}' }}", r"{{ '\N' }}",
    "{{ 'é' }}", r"{{ '\é' }}", "{{ 'line\nbreak' }}", "{{ 'unterminated }}", "{{ \"it's\" }}", '{{ true }} {{ False }} {{ none }} {{ None }}',
    '{{ [1, 2,] }}', '{{ [] }}', '{{ {} }}', "{{ {'a': 1, 'b': [2]} }}", '{{ (1, 2) }}', '{{ () }}', '{{ (1,) }}', '{{ 1, 2 }}', '{{ (1) }}',
    # expressions
    '{{ a + b - c }}', '{{ a * b / c // d % e }}', '{{ a ** b ** c }}', '{{ -a ** 2 }}', '{{ +a }}', '{{ not a }}', '{{ not not a }}',
    '{{ a and b or c }}', '{{ a or b and c }}', '{{ a ~ b ~ c }}', '{{ a + b ~ c * d }}', '{{ a == b != c < d <= e > f >= g }}',
    '{{ a in b }}', '{{ a not in b }}', '{{ not a in b }}', '{{ a if b }}', '{{ a if b else c }}', '{{ a if b else c if d else e }}',
    '{{ a.b.c }}', '{{ a["b"][0] }}', '{{ a[1:2] }}', '{{ a[:2] }}', '{{ a[1:] }}', '{{ a[::2] }}', '{{ a[:] }}', '{{ a[1:2:3] }}',
    '{{ a[1, 2] }}', '{{ a[] }}', '{{ a[:,1] }}', '{{ f() }}', '{{ f(1, 2) }}', '{{ f(a=1) }}', '{{ f(1, b=2, *c, **d) }}', '{{ f(*a) }}',
    '{{ f(**a) }}', '{{ f(1,) }}', '{{ f(a=1, 2) }}', '{{ f(*a, b) }}', '{{ f(**a, b=1) }}', '{{ f(**a, *b) }}', '{{ a.b(c)[d].e() }}',
    '{{ x|upper }}', '{{ x | default("y") | upper }}', '{{ x|join(",") }}', '{{ x|f.g }}', '{{ x|truncate(5, killwords=true) }}',
    '{{ -x|abs }}', '{{ x is defined }}', '{{ x is not none }}', '{{ x is divisibleby 3 }}', '{{ x is divisibleby(3) }}', '{{ x is sameas y.z }}',
    '{{ x is a.b }}', '{{ x is defined and y }}', '{{ x is defined or y }}', '{{ x is defined else y }}', '{{ x is in [1] }}',
    '{{ x is is y }}', '{{ x is upper|lower }}', '{{ x|lower is upper }}', '{{ (x|f)(1) }}', '{{ x|f(1)(2) }}', '{{ "%s"|format(x) }}',
    '{{ a.0 }}', '{{ a."b" }}', '{{ a. }}', '{{ a | }}', '{{ a is }}', '{{ a if }}', '{{ a if b else }}', '{{ x[ }}', '{{ x( }}',
    # statements
    '{% if a %}x{% endif %}', '{% if a %}x{% elif b %}y{% elif c %}z{% else %}w{% endif %}', '{% if a, b %}{% endif %}', '{% if a: %}x{% endif %}',
    '{% for x in y %}{{ x }}{% endfor %}', '{% for x in y %}a{% else %}b{% endfor %}', '{% for k, v in d.items() %}{% endfor %}',
    '{% for x in y if x > 1 %}{% endfor %}', '{% for x in y recursive %}{{ loop(x) }}{% endfor %}', '{% for (a, b) in c %}{% endfor %}',
    '{% for x in a, b %}{% endfor %}', '{% for x in y if a if b else c %}{% endfor %}', '{% for x in y if z recursive %}{% endfor %}',
    '{% set x = 1 %}', '{% set x, y = 1, 2 %}', '{% set ns.attr = 1 %}', '{% set x %}body{% endset %}', '{% set x | upper %}b{% endset %}',
    '{% set x = y | f %}', '{% set (a, b) = c %}', '{% set a.b = 1 %}', '{% set 1 = 2 %}', '{% set true = 1 %}', '{% set f() = 1 %}',
    '{% set [a] = b %}', '{% set a, (b, c) = d %}', '{% set x %}', '{% macro m(a, b=1) %}{{ a }}{% endmacro %}', '{% macro m() %}{% endmacro %}',
    '{% macro m(a=1, b) %}{% endmacro %}', '{% macro m(a.b) %}{% endmacro %}', '{% macro m %}{% endmacro %}', '{% macro m(a,) %}{% endmacro %}',
    '{% call m() %}x{% endcall %}', '{% call(a, b) m(1) %}{{ a }}{% endcall %}', '{% call m %}x{% endcall %}', '{% filter upper %}x{% endfilter %}',
    '{% filter f(1)|g %}x{% endfilter %}', '{% with %}x{% endwith %}', '{% with a = 1, b = 2 %}{{ a }}{% endwith %}', '{% with a = 1 b = 2 %}{% endwith %}',
    '{% autoescape true %}{{ x }}{% endautoescape %}', '{% block b %}x{% endblock %}', '{% block b %}x{% endblock b %}', '{% block b scoped %}{% endblock %}',
    '{% block b required %} {% endblock %}', '{% block b required %}x{% endblock %}', '{% block a-b %}{% endblock %}', '{% extends "base.html" %}',
    '{% include "x" %}', '{% include "x" ignore missing %}', '{% include "x" without context %}', '{% include "x" ignore missing with context %}',
    '{% import "x" as y %}', '{% import "x" as y with context %}', '{% from "x" import a, b as c %}', '{% from "x" import a with context %}',
    '{% from "x" import _a %}', '{% from "x" import %}', '{% from "x" import a, %}', '{% from "x" import a as %}', '{% print a, b %}', '{% print %}',
    # syntax errors
    '{{', '{{ foo', '{{ foo }', '{{ foo }}}', '{% foo %}', '{% if x %}', '{% if x %}{% endfor %}', '{% for x in y %}{% endif %}', '{% endif %}',
    '{% if x %}{% for y in z %}{% endif %}', '{% %}', '{% 1 %}', '{{ 1 + }}', '{{ ) }}', '{{ (1 }}', '{{ [1 }}', '{{ {1: 2 }}', '{{ x] }}',
    '{{ (] }}', '{{ x $ y }}', '{{ x ! y }}', '{{ x\n$ }}', '{{ é }}', '{{ x·y }}', '{{ ٣abc }}', '{{ a b }}', '{% if %}{% endif %}',
    '{% for in y %}{% endfor %}', '{% for x y %}{% endfor %}', '{% else %}', '{% if x %}{% else %}{% else %}{% endif %}', '{% block %}',
    '{% endblock %}', '{% call x() %}', '{% macro %}', '{{ x }} {% if %}', '{% set %}', '{% with x %}{% endwith %}', '{% for x in y %}{% else %}',
    '{% if x %}\n{{ y\n', 'x\n\n{{ 1 + }}', '{% raw %}', '{{ x }}{# ', '{% if x -%}', '{%- endif %}', '{{ 1 +\n 2 }}', '{{ "a" "b }}',
    '{{ x|1 }}', '{{ x is 1 }}', '{{ x.(1) }}', '{{ a[1:2:3:4] }}', '{% filter %}{% endfilter %}', '{% extends %}', '{% import "x" %}',
    # compile errors
    '{% block a %}{% endblock %}{% block a %}{% endblock %}', '{% block a %}{% block a %}{% endblock %}{% endblock %}', '{% if x %}{% extends "a" %}{% endif %}',
    '{% for x in y %}{% extends "a" %}{% endfor %}', '{% block b %}{% extends "a" %}{% endblock %}', '{% for loop in y %}{% endfor %}',
    '{% for x in y %}{% set loop = 1 %}{% endfor %}', '{% for x, loop in y %}{% endfor %}', '{% set loop = 1 %}', '{{ x|nope }}', '{{ x is nope }}',
    '{% if x|nope %}{% endif %}', '{% if x %}{{ y|nope }}{% endif %}', '{{ a if b|nope else c }}', '{% if x %}{% for y in z %}{{ y|nope }}{% endfor %}{% endif %}',
    '{{ x|nope1|nope2 }}', '{{ x|nope(y|nope2) }}', '{% macro m(caller) %}{{ caller() }}{% endmacro %}', '{% macro m(caller=1) %}{{ caller() }}{% endmacro %}',
    '{% macro m(caller) %}x{% endmacro %}', '{% macro m(caller, b=1) %}{{ caller }}{% endmacro %}', '{% call(caller) m() %}{{ caller }}{% endcall %}',
    '{% block b %}{{ x|nope }}{% endblock %}{{ y|nope2 }}', '{% set x %}{{ y|nope }}{% endset %}', '{% filter nope %}x{% endfilter %}',
    '{% for x in y|nope %}{% endfor %}', '{% for x in y if x|nope %}{% endfor %}', '{% with a = x|nope %}{% endwith %}', '{{ x is defined(y|nope) }}',
]

env = sandbox.ImmutableSandboxedEnvironment()
out = {'jinja2': jinja2.__version__, 'templates': []}
for src in TEMPLATES:
    rec = {'source': src}
    try:
        rec['parse'] = repr(env.parse(src))
    except Exception as e:
        rec['parse'] = None
    try:
        env.from_string(src)
        rec['error'] = None
    except Exception as e:
        rec['error'] = {'type': type(e).__name__, 'message': str(e)}
    out['templates'].append(rec)
json.dump(out, sys.stdout, ensure_ascii=False, indent=1)
sys.stdout.write('\n')
