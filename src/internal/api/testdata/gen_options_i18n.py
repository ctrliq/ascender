"""Regenerate ../locale/options/<lang>.json: how the old API translated its
OPTIONS documents.

The Go API serves OPTIONS from documents captured in English
(metadata/*.json, metadata/settings/*.json). The old API built them per
request, and the labels, help texts, choice names, setting categories and
units the serializers marked with gettext_lazy came out in the request's
language, while others (most labels: model field verbose names that were
never marked) stayed English. This script asks the old API for each
document in English and in each language and records, per language, what
each English text became:

  label, help_text, choice, category, unit, name
      English -> translation, for the outcome most documents agree on;
  line
      the same for lines of the views' descriptions (Markdown rendered
      with the model's verbose names, which were translated);
  paths
      route -> {"<method>.<field>.<attr>": text} where a document differs
      from that (a text translated in one place and not in another), and
      {"line:<English line>": text} for description lines.

A route is the request path with its numeric segments as {id}. The views'
descriptions also repeat their fields' help texts ("* `name`: <help>
(string)", HTML-escaped) and choice names ("    - `run`: Run"); the Go
side swaps those in from the field translations, so only the other
description lines that change are stored.

The documents are found by crawling the old API from /api/v2/: every list,
the first object of each and the related resources it links to, and every
settings category. Only GET and OPTIONS requests are made. Run it from
src/internal/api with the old API's address and an administrator's
credentials:

  ASCENDER_OLD_API=http://127.0.0.1:8013 ASCENDER_OLD_AUTH=<user>:<password> \\
    python3 testdata/gen_options_i18n.py
"""
import base64
import collections
import concurrent.futures
import html
import json
import os
import re
import sys
import urllib.request
import urllib.error

BASE = os.environ.get('ASCENDER_OLD_API', 'http://127.0.0.1:8013')
AUTH = os.environ['ASCENDER_OLD_AUTH']
LANGS = ['ar', 'es', 'fr', 'hi', 'ja', 'ko', 'nl', 'zh']
ATTRS = ['label', 'help_text', 'category', 'unit']
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'locale', 'options')


def request(method, path, lang='en-us'):
    req = urllib.request.Request(BASE + path, method=method)
    req.add_header('Authorization', 'Basic ' + base64.b64encode(AUTH.encode()).decode())
    req.add_header('Accept', 'application/json')
    req.add_header('Accept-Language', lang)
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return json.loads(resp.read().decode('utf-8'))
    except (urllib.error.HTTPError, ValueError):
        return None


def route(path):
    return re.sub(r'/\d+/', '/{id}/', path)


def crawl():
    paths = {}

    def add(p):
        if isinstance(p, str) and p.startswith('/api/') and p.endswith('/') and '?' not in p:
            paths.setdefault(route(p), p)

    for p in ['/api/', '/api/v2/', '/api/o/']:
        add(p)
    root = request('GET', '/api/v2/') or {}
    lists = [p for p in root.values() if isinstance(p, str)]
    for p in lists:
        add(p)

    def first(p):
        data = request('GET', p + '?page_size=1')
        if isinstance(data, dict) and data.get('results'):
            return data['results'][0]
        return None

    with concurrent.futures.ThreadPoolExecutor(6) as ex:
        for obj in ex.map(first, lists):
            if not isinstance(obj, dict):
                continue
            add(obj.get('url'))
            for v in (obj.get('related') or {}).values():
                for u in (v if isinstance(v, list) else [v]):
                    add(u)
    settings = request('GET', '/api/v2/settings/') or {}
    for s in settings.get('results', []):
        add(s.get('url'))
    return paths


def walk_field(prefix, e, t, rec):
    if not isinstance(e, dict) or not isinstance(t, dict):
        return
    for attr in ATTRS:
        if isinstance(e.get(attr), str) and isinstance(t.get(attr), str):
            rec(attr, prefix + '.' + attr, e[attr], t[attr])
    ec, tc = e.get('choices'), t.get('choices')
    if isinstance(ec, list) and isinstance(tc, list):
        tv = {json.dumps(c[0]): c[1] for c in tc if isinstance(c, list) and len(c) == 2}
        for c in ec:
            if isinstance(c, list) and len(c) == 2 and isinstance(c[1], str) and isinstance(tv.get(json.dumps(c[0])), str):
                rec('choice', prefix + '.choice.' + str(c[0]), c[1], tv[json.dumps(c[0])])
    if 'child' in e:
        walk_field(prefix + '.child', e.get('child'), t.get('child'), rec)
    if isinstance(e.get('children'), dict) and isinstance(t.get('children'), dict):
        for k, v in e['children'].items():
            walk_field(prefix + '.children.' + k, v, t['children'].get(k), rec)


CHOICE_LINE = re.compile(r'^(    - `[^`]*`: )(.*)$')


def django_escape(t):
    # Django's escape(): & < > " ' as &amp; &lt; &gt; &quot; &#x27;.
    return html.escape(t, quote=True)


def capfirst(t):
    return t[:1].upper() + t[1:]


def explained(en_line, tr_line, helps, choices):
    """Whether the Go side's help text and choice swaps give tr_line."""
    line = en_line
    for f, (e, t) in helps.items():
        line = line.replace('`%s`: %s (' % (f, django_escape(capfirst(e))), '`%s`: %s (' % (f, django_escape(capfirst(t))))
    m = CHOICE_LINE.match(line)
    if m and m.group(2) in choices:
        line = m.group(1) + choices[m.group(2)]
    return line == tr_line


def description_lines(en, tr):
    """The (English, translated) description lines, but for those the swaps
    explain: unchanged lines too, since a line translated in one view may
    not be in another."""
    ed, td = en.get('description'), tr.get('description')
    if not isinstance(ed, str) or not isinstance(td, str):
        return []
    helps, choices = {}, {}
    for m, fields in (en.get('actions') or {}).items():
        tf = (tr.get('actions') or {}).get(m) or {}
        for f, e in (fields or {}).items():
            t = tf.get(f) or {}
            if isinstance(e.get('help_text'), str) and isinstance(t.get('help_text'), str):
                helps[f] = (e['help_text'], t['help_text'])
            tv = {json.dumps(c[0]): c[1] for c in t.get('choices') or [] if isinstance(c, list) and len(c) == 2}
            for c in e.get('choices') or []:
                if isinstance(c, list) and len(c) == 2 and isinstance(c[1], str) and isinstance(tv.get(json.dumps(c[0])), str):
                    choices.setdefault(c[1], tv[json.dumps(c[0])])
    el, tl = ed.split('\n'), td.split('\n')
    if len(el) != len(tl):
        print('description lines differ in number: %r' % el[0], file=sys.stderr)
        return []
    return [(e, t) for e, t in zip(el, tl) if e == t or not explained(e, t, helps, choices)]


def main():
    paths = crawl()
    print('%d documents' % len(paths), file=sys.stderr)
    # occ[lang][kind][english] = [(route, path, translation)]
    occ = {l: collections.defaultdict(lambda: collections.defaultdict(list)) for l in LANGS}

    def fetch(item):
        r, p = item
        en = request('OPTIONS', p)
        if not isinstance(en, dict):
            return r, None, {}
        return r, en, {l: request('OPTIONS', p, l) for l in LANGS}

    with concurrent.futures.ThreadPoolExecutor(6) as ex:
        for r, en, docs in ex.map(fetch, sorted(paths.items())):
            if en is None:
                continue
            for lang, tr in docs.items():
                if not isinstance(tr, dict):
                    continue

                def rec(kind, path, e, t, lang=lang, r=r):
                    occ[lang][kind][e].append((r, path, t))

                if isinstance(en.get('name'), str) and isinstance(tr.get('name'), str):
                    rec('name', 'name', en['name'], tr['name'])
                for e, t in description_lines(en, tr):
                    rec('line', 'line:' + e, e, t)
                for m, fields in (en.get('actions') or {}).items():
                    tf = (tr.get('actions') or {}).get(m) or {}
                    if isinstance(fields, dict):
                        for f, e in fields.items():
                            walk_field(m + '.' + f, e, tf.get(f), rec)
    os.makedirs(OUT, exist_ok=True)
    for lang in LANGS:
        out = {}
        paths_out = collections.defaultdict(dict)
        for kind, texts in occ[lang].items():
            for e, uses in texts.items():
                outcomes = collections.Counter(t for _, _, t in uses)
                if set(outcomes) == {e}:
                    continue
                # The outcome most documents agree on, a translation over
                # English when they tie; the others are the exceptions.
                best = max(outcomes, key=lambda t: (outcomes[t], t != e))
                if best != e:
                    out.setdefault(kind, {})[e] = best
                for r, path, t in uses:
                    if t != best:
                        paths_out[r][path] = t
        out['paths'] = {r: dict(sorted(v.items())) for r, v in sorted(paths_out.items())}
        for kind in list(out):
            out[kind] = dict(sorted(out[kind].items()))
        with open(os.path.join(OUT, lang + '.json'), 'w', encoding='utf-8') as f:
            json.dump(out, f, ensure_ascii=False, indent=0, sort_keys=True)
            f.write('\n')
        print('%s: %s, %d routes with exceptions' % (lang, ', '.join('%d %s' % (len(v), k) for k, v in sorted(out.items()) if k != 'paths'), len(out['paths'])), file=sys.stderr)


if __name__ == '__main__':
    main()
