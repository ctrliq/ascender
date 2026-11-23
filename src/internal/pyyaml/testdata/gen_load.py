"""Regenerate pyyaml.json: what yaml.safe_load and then json.dumps made of
each document of the corpus below, as parse_yaml_or_json used them.

Run it with the old image's Python, without network access, from the
repository root:

    docker run --rm --network none -v "$PWD/src/internal/pyyaml/testdata:/t:ro" \
        --entrypoint /var/lib/ascender/venv/ascender/bin/python \
        ghcr.io/ctrliq/ascender_devel:main -I /t/gen_load.py > src/internal/pyyaml/testdata/pyyaml.json
"""

import json
import sys

import yaml

CORPUS = [
    # booleans: YAML 1.1's words, but not y and n
    'a: yes', 'a: Yes', 'a: YES', 'a: no', 'a: No', 'a: NO', 'a: on', 'a: On', 'a: ON', 'a: off', 'a: Off', 'a: OFF',
    'a: true', 'a: True', 'a: TRUE', 'a: false', 'a: False', 'a: FALSE', 'a: y', 'a: n', 'a: Y', 'a: N', 'a: yEs', 'a: tRUE',
    'a: "no"', "a: 'yes'", 'a: !!str no', 'a: !!bool "yes"', 'a: !!bool off',
    # nulls
    'a: ~', 'a: null', 'a: Null', 'a: NULL', 'a:', 'a: nULL', 'a: !!null ""', 'a: ""',
    # integers
    'a: 0', 'a: -0', 'a: +5', 'a: 012', 'a: 08', 'a: 0b101', 'a: -0b1_01', 'a: 0x1F', 'a: 0x1f_ff', 'a: 1_000', 'a: 1:20',
    'a: -1:20:30', 'a: 190:20:30', 'a: 12345678901234567890123', 'a: 0o12', 'a: 1__0', 'a: !!int "42"', 'a: !!int 0x10',
    # floats
    'a: 1.5', 'a: 1.', 'a: .5', 'a: -.5', 'a: 1.0', 'a: 1.50', 'a: 1e3', 'a: 1.0e3', 'a: 1.0e+3', 'a: 1.0E-3', 'a: 6.8523015e+5',
    'a: 685.230_15e+03', 'a: 190:20:30.15', 'a: .inf', 'a: -.Inf', 'a: .NAN', 'a: 1e+16', 'a: 12345678901234567.0', 'a: 0.0001',
    'a: 0.00001', 'a: 123456789.123456789', 'a: 1_0.5', 'a: !!float 3', 'a: !!float "2.5"',
    # strings that look like something else in YAML 1.2 or not at all
    'a: 1.2.3', 'a: 0x', 'a: 1:', 'a: 08:30', 'a: 12:60', 'a: 2001-12-14x', 'a: +inf', 'a: .Inf.', 'a: =', 'a: <<', 'a: "<<"',
    'a: hello world', 'a: "multi\\nline"', 'a: |\n  block\n  text\n', 'a: >\n  folded\n  text\n', 'a: !!str', 'a: ! 12',
    # dates
    'a: 2001-12-14', 'a: 2001-12-14t21:59:43.10-05:00', 'a: 2001-12-14 21:59:43.10 -5', 'a: 2001-1-4 1:59:43', 'a: "2001-12-14"',
    # documents
    '', '---', '--- \n', '...', '# only a comment', 'a: 1\n---\nb: 2', 'a: 1\n---\n', '---\na: 1\n...\n', '--- a\n--- b',
    'just a string', '[1, 2]', '- a\n- b', '42', '{}', 'a: 1\n...',
    # keys
    '80: http', '1: a\ntrue: b\n1.0: c', 'null: x', '~: x', '1.5: x', 'true: x\nfalse: y', '.inf: x', '? [1, 2]\n: x',
    '? {a: 1}\n: x', '"1": a\n1: b', '0x10: a\n16: b', '2001-12-14: x', 'yes: no', 'on: off', '"yes": y',
    # duplicates and merges
    'a: 1\na: 2', 'a: 1\nb: 2\na: 3', 'base: &b {x: 1, y: 2}\nc:\n  <<: *b\n  y: 3', 'b1: &b1 {x: 1}\nb2: &b2 {x: 2, z: 2}\nc:\n  <<: [*b1, *b2]\n  w: 0',
    'c:\n  <<: {a: 1}\n  <<: {a: 2, b: 2}', 'c:\n  <<: 5', 'c:\n  <<: [5]', 'a: &x [1, 2]\nb: *x', 'c: {<<: {a: 1}, a: 0}',
    'x: &x\n  y: *x', 'x: &x\n  - *x', 'c:\n  "<<": {a: 1}',
    # tags and collections
    'a: !!binary aGVsbG8=', 'a: !!set {x, y}', 'a: !!omap [{x: 1}, {y: 2}]', 'a: !!pairs [{x: 1}, {x: 2}]', 'a: !custom 1',
    'a: !!python/object:os.system x', 'a: !!map {b: 1}', 'a: !!seq [1]', 'a: [1, [2, {b: c}]]', 'a: {b: {c: {d: [true, no]}}}',
    # extra vars as users write them
    'feature: no\nretries: 3\nratio: 0.5\nname: web\nports: [80, 443]\nenv: {DEBUG: off}',
    '---\nansible_become: yes\nansible_port: 022\nversion: 1.10\ntag: "1.10"\n',
    # syntax errors
    'a: [1, 2', 'a: b: c', '\ta: 1', 'a: "unterminated', '- a\nb: c', 'a: *missing',
]


def run(src):
    try:
        value = yaml.safe_load(src)
    except yaml.YAMLError as e:
        return {'src': src, 'error': 'yaml'}
    except Exception as e:
        return {'src': src, 'error': type(e).__name__}
    try:
        return {'src': src, 'json': json.dumps(value, ensure_ascii=False, separators=(',', ':'))}
    except (ValueError, TypeError) as e:
        return {'src': src, 'error': 'json', 'msg': str(e)}


json.dump({'pyyaml': yaml.__version__, 'cases': [run(s) for s in CORPUS]}, sys.stdout, indent=1, ensure_ascii=False)
sys.stdout.write('\n')
