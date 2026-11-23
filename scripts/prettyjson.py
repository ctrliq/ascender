#!/usr/bin/env python3
"""Pretty-print JSON files in place, in the layout the API metadata uses.

    python3 scripts/prettyjson.py [--check] PATH...

(make fmt-json runs it over src/internal/api.)

Each PATH is a file or a directory (searched for *.json). The layout:
4-space indent, key order kept, objects one key per line, lists one item
per line, except that a list of plain values (strings, numbers, booleans,
null) that is itself an item of a list (a choice's [value, label] pair) stays
on one line when that line fits in 120 columns, {} and [] for empty containers, non-ASCII characters kept as
they are, and numbers written exactly as in the input. A file's trailing
newline (or its absence) is kept.

--check changes nothing and lists the files that are not in this layout
(exit status 1 when there are any).
"""
import json
import os
import sys


class Number(str):
    """A number's text as the input had it, so 1.0 stays 1.0 and 1e3 1e3."""


class Pairs(list):
    """An object, as the (key, value) pairs object_pairs_hook gives: key
    order kept, and told apart from a list."""


def load(text):
    return json.loads(text, object_pairs_hook=Pairs, parse_float=Number, parse_int=Number,
                      parse_constant=Number)


def scalar(v):
    return not isinstance(v, (list, Pairs))


# WIDTH is the longest line a list of plain values is kept on.
WIDTH = 120


def dump(v, indent=0, lead=0, in_list=False):
    """v laid out at indent levels; lead is how many characters of its line
    come before it (the indent and any "key": ), in_list whether it is an
    item of a list."""
    pad = ' ' * 4 * indent
    inner = ' ' * 4 * (indent + 1)
    if isinstance(v, Pairs):
        if not v:
            return '{}'
        items = []
        for k, x in v:
            key = '%s%s: ' % (inner, json.dumps(k, ensure_ascii=False))
            items.append(key + dump(x, indent + 1, len(key)))
        return '{\n' + ',\n'.join(items) + '\n' + pad + '}'
    if isinstance(v, list):
        if not v:
            return '[]'
        if in_list and all(scalar(x) for x in v):
            line = '[' + ', '.join(dump(x) for x in v) + ']'
            if lead + len(line) + 1 <= WIDTH:
                return line
        return '[\n' + ',\n'.join(inner + dump(x, indent + 1, len(inner), True) for x in v) + '\n' + pad + ']'
    if isinstance(v, Number):
        return str(v)
    return json.dumps(v, ensure_ascii=False)


def pretty(text):
    out = dump(load(text))
    return out + '\n' if text.endswith('\n') else out


def files(paths):
    for p in paths:
        if os.path.isdir(p):
            for root, dirs, names in os.walk(p):
                dirs.sort()
                for n in sorted(names):
                    if n.endswith('.json'):
                        yield os.path.join(root, n)
        else:
            yield p


def main(argv):
    check = '--check' in argv
    paths = [a for a in argv if a != '--check']
    if not paths:
        print(__doc__.strip(), file=sys.stderr)
        return 2
    changed = []
    for f in files(paths):
        with open(f, encoding='utf-8') as fh:
            text = fh.read()
        new = pretty(text)
        if json.loads(new) != json.loads(text):
            raise SystemExit('%s: the reformatted JSON differs in content' % f)
        if new != text:
            changed.append(f)
            if not check:
                with open(f, 'w', encoding='utf-8') as fh:
                    fh.write(new)
    for f in changed:
        print(f)
    if check and changed:
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
