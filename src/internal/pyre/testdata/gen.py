"""Regenerate python314.json: Python 3.14's verdict on each pattern of the
corpus below (re.compile's error message, or the result of re.match).

Run it with the old image's Python, without network access, from the
repository root:

    docker run --rm --network none -v "$PWD/src/internal/pyre/testdata:/t:ro" \
        --entrypoint /var/lib/ascender/venv/ascender/bin/python \
        ghcr.io/ctrliq/ascender_devel:main -I /t/gen.py > src/internal/pyre/testdata/python314.json
"""

import json
import re
import sys
import warnings

warnings.simplefilter('ignore')

I, M, S, X, A = re.I, re.M, re.S, re.X, re.A

COMPILE = [
    # well formed
    'abc', 'a|b|c', '(a)(b)', '(?P<name>x)(?P=name)', '(?:a)', '(?i)abc', '(?i:a)b', '(?-i:a)', '(?x) a b # comment\n c',
    '[a-z]', '[^a-z]', '[]]', '[^]]', '[a-]', '[-a]', r'[\d\w\s]', r'[\D]', r'\x41', r'\u0041', r'\U0001F600', r'\N{EM DASH}',
    r'\N{em dash}', r'\N{HANGUL SYLLABLE GAG}', r'\N{CJK UNIFIED IDEOGRAPH-4E00}', r'\0', r'\01', r'\012', r'\141',
    '(a)\\1', '(a)(b)(c)(d)(e)(f)(g)(h)(i)(j)\\10', 'a{2}', 'a{2,}', 'a{,3}', 'a{2,3}', 'a{}', 'a{', 'a{x}', 'a{2', 'a{2,3',
    'a*?', 'a+?', 'a??', 'a*+', 'a++', 'a?+', 'a{2,3}+', '(?>ab)', '(?=a)', '(?!a)', '(?<=ab)', '(?<!ab)', '(?<=a|b)',
    '(a)?(?(1)b|c)', '(?P<n>a)?(?(n)b)', '(?#comment)a', '{', '}', ']', '(?=a)*', 'x{0}', '^$', r'\A\Z\z\b\B',
    '(?a)\\w', '(?u)\\w', '(?s).', '(?m)^', '(?a:\\w)', '(?im-sx:a)', '\\\\', '(?P<a1_é>x)', '\t', '[\\]]', '(?<!)', '(?!)',
    '(?i)(?m)a', '(?x)  (?i)a',
    # errors
    '(', ')', 'a)', '(a', '((a)', '[', '[a', '[^', '[a-', '[z-a]', r'[\d-z]', r'[a-\d]', r'[\w-]', '*', '+a', '?', 'a**', 'a*{2}',
    '{2}', '^*', '\\', 'a\\', r'\q', r'\x4', r'\x', r'\u12', r'\U0011FFFF', r'\U1234567', r'\N', r'\N{', r'\N{}', r'\N{NO SUCH NAME}',
    r'[\q]', r'[\8]', r'[\A]', r'\8', r'\1', r'(a)\2', r'(a\1)', r'\400', r'[\400]', '(?', '(?P', '(?Px)', '(?P<', '(?P<>a)',
    '(?P<1a>x)', '(?P<a', '(?P<a>x)(?P<a>y)', '(?P=', '(?P=a)', '(?P=1)', '(?P<a>(?P=a))', '(?<', '(?<x)', '(?z)', '(?#abc',
    '(?=a', '(?<=a*)', '(?<=a|bc)', '(?<!a+)', '(?<=a{1,2})', '(?<=(a)\\1)', '(a)(?<=\\1)', '(?<=(?P<x>a)(?P=x))',
    '(?(', '(?()', '(?(1', '(?(0)a)', '(?(a)b)', '(?(1)a|b|c)', '(?(2)a)', '(a)(?(9)b)', '(?(1a)b)', '(?(1)a', '(?(1)a)(b)',
    '(?i', '(?i-', '(?i-:a)', '(?-', '(?-:a)', '(?i-i:a)', '(?L)a', '(?au)a', '(?-a:b)', '(?iz)', '(?i!)', '(?-z:a)', '(?-i!',
    'a(?i)b', '(a)(?i)', 'a|(?i)b', '(?:(?i)a)', '(?x)a(?i)', 'a{3,2}', 'a{4294967295}', 'a{1,4294967295}', 'a{99999999999}',
    '(?a)(?u)a', 'abc\n(', 'ab\ncd\nef)', 'x\n\\', '(?P<a>x)\n(?P<a>y)', '[\n',
]

COMPILE_FLAGS = [
    ('(?i)a', I), ('a', X), ('a b', X), ('a # c', X), ('(?-x: a )', X), ('(?x: a )', 0), ('\\w', A), ('(?u)a', A), ('(?L)a', 0),
]

MATCH = [
    ('abc', 0, ['abc', 'abcd', 'xabc', 'ab', 'ABC']),
    ('abc', I, ['ABC', 'aBc', 'ab']),
    (r'\w+$', 0, ['abc', 'abc\n', 'abc\n\n', 'ab c', 'é', 'Ⅻ', '٣', '_', 'a\u0301']),
    (r'\w', A, ['a', 'é', '_', '5', '٣']),
    (r'(?a)\w', 0, ['é', 'e']),
    (r'(?a:\w)\w', 0, ['éé', 'eé', 'ee']),
    (r'\d', 0, ['5', '٣', 'Ⅻ', '²', 'a']),
    (r'\d', A, ['5', '٣']),
    (r'\s', 0, [' ', '\t', '\n', '\x0b', '\x0c', '\r', '\x1c', '\x1d', '\x1e', '\x1f', '\x85', '\xa0', '\u1680', '\u2000', '\u200b', '\u2028', '\u202f', '\u205f', '\u3000', '\ufeff', 'a']),
    (r'\s', A, [' ', '\x1c', '\xa0', '\x0b']),
    (r'[\S]', 0, ['a', ' ', '\x1c']),
    (r'[^\s]', 0, ['a', ' ', '\x1c']),
    (r'[a\W]', 0, ['a', 'b', '!', ' ', 'é']),
    (r'[^a\W]', 0, ['a', 'b', '!', 'é', '\n']),
    (r'[^\d\s]', 0, ['a', '1', ' ', '٣']),
    (r'\D\S\W', 0, ['a!!', '1!!', 'aa!', 'a a']),
    (r'[^a]', 0, ['b', 'a', '\n']),
    (r'.', 0, ['a', '\n']),
    (r'.', S, ['a', '\n']),
    (r'(?s:.)', 0, ['\n']),
    (r'a$', 0, ['a', 'a\n', 'a\n\n', 'ab']),
    (r'a$', M, ['a\nb', 'ab']),
    (r'a\Z', 0, ['a', 'a\n']),
    (r'a\z', 0, ['a', 'a\n']),
    (r'.*^b', M, ['a\nb', 'ab']),
    (r'.*^b', 0, ['a\nb']),
    (r'\Aa', 0, ['a', 'ba']),
    (r'a\b', 0, ['a', 'a ', 'ab', 'aé', 'a!']),
    (r'a\B', 0, ['a', 'ab', 'a ']),
    (r'\B', 0, ['', 'a']),
    (r'\b', 0, ['', 'a', ' ']),
    (r'a\b', A, ['aé', 'ab']),
    (r'(a)\1', 0, ['aa', 'ab']),
    (r'(a)\1', I, ['aA']),
    (r'(?P<x>ab)(?P=x)', 0, ['abab', 'abba']),
    (r'(a)?(?(1)b|c)', 0, ['ab', 'c', 'ac', 'b']),
    (r'(?P<n>a)?(?(n)b)x', 0, ['abx', 'x', 'ax']),
    (r'(?<=a)b', 0, ['b', 'ab']),
    (r'.(?<=a)b', 0, ['ab', 'cb']),
    (r'.(?<!a)b', 0, ['ab', 'cb']),
    (r'a(?=b)', 0, ['ab', 'ac']),
    (r'a(?!b)', 0, ['ab', 'ac']),
    (r'(?>a+)a', 0, ['aaa', 'a']),
    (r'a++a', 0, ['aaa']),
    (r'a*+b', 0, ['aab', 'b', 'aa']),
    (r'a{2,3}+a', 0, ['aaa', 'aaaa']),
    (r'a{2}$', 0, ['aa', 'aaa', 'a']),
    (r'a{2,}$', 0, ['aaaa', 'a']),
    (r'a{,2}$', 0, ['', 'aa', 'aaa']),
    (r'a{2,3}$', 0, ['aa', 'aaa', 'aaaa']),
    (r'a{}', 0, ['a{}', 'a']),
    (r'a{x}', 0, ['a{x}']),
    (r'a{2', 0, ['a{2']),
    (r'a*?$', 0, ['aaa']),
    (r'x{0}y', 0, ['y', 'xy']),
    (r'a|b|c$', 0, ['a', 'b', 'c', 'cc', 'ax']),
    (r'(?:ab|a)c', 0, ['ac', 'abc']),
    (r'(?i)straße', 0, ['STRASSE', 'STRAßE', 'Straße']),
    (r'(?i)k', 0, ['K', '\u212a']),
    (r'(?i)[a-z]+$', 0, ['ABC', 'aBc']),
    (r'(?i:a)b', 0, ['Ab', 'AB']),
    (r'(?-i:a)b', I, ['aB', 'AB']),
    (r'(?x) a b # comment', 0, ['ab', 'a b']),
    (r'(?x) a\ b [ ]c', 0, ['a b c', 'ab c']),
    (r'(?x:a b)c d', 0, ['abc d', 'abcd']),
    (r'a b', X, ['ab']),
    (r'(?m)^b', 0, ['a\nb', 'b']),
    (r'\x41\u0042\U00000043\N{EM DASH}', 0, ['ABC—']),
    (r'\0\01\012\141', 0, ['\x00\x01\na']),
    (r'[\x41-\x43]+$', 0, ['ABC', 'ABD']),
    (r'[\]]', 0, [']']),
    (r'[]a]+$', 0, [']a]']),
    (r'[a-]+$', 0, ['a-', 'b']),
    (r'[\^]', 0, ['^']),
    (r'[\\]', 0, ['\\']),
    (r'\.\*\+\?\(\)\[\]\{\}\|\$\^', 0, ['.*+?()[]{}|$^']),
    (r'#', 0, ['#']),
    (r' ', 0, [' ']),
    (r'[ #]', 0, [' ', '#']),
    (r'😀+$', 0, ['😀😀', 'x']),
    (r'[😀-😂]', 0, ['😁', 'a']),
    (r'(?<!)a', 0, ['a']),
    (r'(?!)|a', 0, ['a']),
    (r'(?=a)*b', 0, ['b']),
    (r'.*@example\.com$', I, ['jane@EXAMPLE.com', 'jane@example.org']),
    (r'^(?!admin).*$', 0, ['admin', 'jane', 'xadmin']),
    (r'(ab)*\1', 0, ['abab', 'ab']),
    (r'(a)|b\1', 0, ['b', 'a']),
    (r'(?:(a)|b)\1', 0, ['b', 'aa']),
    (r'(a*)+$', 0, ['aaa', '']),
    (r'(a|)+b', 0, ['aab', 'b']),
    (r'', 0, ['', 'a']),
    (r'a|', 0, ['', 'b']),
]


def verdict(pattern, flags):
    try:
        re.compile(pattern, flags)
        return {'error': None, 'type': None}
    except re.error as e:
        return {'error': str(e), 'type': 'error'}
    except (OverflowError, ValueError) as e:
        return {'error': str(e), 'type': type(e).__name__}


out = {'python': sys.version.split()[0], 'compile': [], 'match': []}
for p in COMPILE:
    out['compile'].append(dict(pattern=p, flags=0, **verdict(p, 0)))
for p, f in COMPILE_FLAGS:
    out['compile'].append(dict(pattern=p, flags=int(f), **verdict(p, f)))
for p, f, strings in MATCH:
    for s in strings:
        out['match'].append({'pattern': p, 'flags': int(f), 's': s, 'match': re.match(p, s, f) is not None})
json.dump(out, sys.stdout, ensure_ascii=False, indent=1)
sys.stdout.write('\n')
