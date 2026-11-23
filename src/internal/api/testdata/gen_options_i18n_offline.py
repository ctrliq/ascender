"""Add to ../locale/options/<lang>.json the translations of the route
OPTIONS documents that gen_options_i18n.py's capture left untranslated:
those generated offline from the old views rather than captured from the
old API, and those its crawl of the old API did not translate.

gen_options_i18n.py records, per language, what the old API's documents
said: per kind of text (label, help_text, choice, category, unit, name,
line) the usual translation of each English text, and per route the places
that differ from it. A route document it did not see gets nothing from
that capture but what the per-kind maps happen to hold. This script builds
the documents again from the old views, in English and with each language
activated (Django's translation.override, as LocaleMiddleware did for
Accept-Language), without a database or network, and merges what each
English text became:

  - a text the per-kind map already translates the same way: nothing;
  - a text the per-kind map translates differently (or that this document
    left English where the map translates it): a per-route override,
    "<method>.<field>.<attr>" (or "line:<English line>" for a description
    line), as the capture writes them;
  - a text the map does not have: a per-kind entry when no document but
    those being merged has the same text of the same kind (so no captured
    document's rendering changes), else a per-route override.

Description lines are compared as gen_options_i18n.py compares them:
lines the Go side's help text and choice swaps explain are left out. Only
texts whose offline English equals the committed document's English at the
same place are used; the others are reported.

Run it from the repository root with the cached old image, without network
access. Nothing reads the database: permission checks pass, get_object is
a blank object of the view's model, the pod spec default is empty and the
organization counts are left out (none of them is translated text):

  docker run --rm --network none -e PYTHONDONTWRITEBYTECODE=1 \\
      -e PYTHONPATH=/ascender_devel -w /ascender_devel \\
      -v /root/ascender:/ascender_devel:ro -v "$PWD/src/internal/api:/a" \\
      --entrypoint /var/lib/ascender/venv/ascender/bin/python \\
      ghcr.io/ctrliq/ascender_devel:main -I /a/testdata/gen_options_i18n_offline.py

then `make fmt-json`. With route document names as arguments (for example
hosts__id__job_events) it does those instead of ROUTES. With --check it
writes nothing and reports, for every given route document, the places
where the Go rendering (per-kind maps and overrides as they stand) would
differ from the old views' translation; --check --all checks every
document in metadata/routes/.
"""
import collections
import glob
import html
import json
import os
import re
import sys

API = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
ROUTES_DIR = os.path.join(API, 'metadata', 'routes')
LOCALE = os.path.join(API, 'locale', 'options')
LANGS = ['ar', 'es', 'fr', 'hi', 'ja', 'ko', 'nl', 'zh']
ATTRS = ['label', 'help_text', 'category', 'unit']

# The route documents the capture left untranslated, as --check --all
# finds them: those generated offline (commits 8c53d96 and 1a386ab), whose
# texts the per-kind maps already cover, and documents the crawl did not
# translate (OAuth applications and tokens, the bulk actions, external
# credential tests, a role's parents and children).
ROUTES = [
    'applications__id',
    'applications__id__activity_stream',
    'applications__id__tokens',
    'bulk__host_create',
    'bulk__host_delete',
    'bulk__job_launch',
    'credential_types__id__test',
    'credentials__id__test',
    'groups__id__inventory_sources',
    'groups__id__job_events',
    'groups__id__job_host_summaries',
    'hosts__id__inventory_sources',
    'hosts__id__job_events',
    'hosts__id__job_host_summaries',
    'hosts__id__smart_inventories',
    'roles__id__children',
    'roles__id__parents',
    'tokens__id',
    'tokens__id__activity_stream',
    'users__id__applications',
]


def route_url(name):
    """The route (as i18n_options.go's optionsRoute names it) and a request
    path for a document name."""
    if name == 'v2root':
        return '/api/v2/', '/api/v2/'
    if name == 'api':
        return '/api/', '/api/'
    segs = name.split('__')
    route = '/api/v2/' + '/'.join('{id}' if s == 'id' else s for s in segs) + '/'
    return route, route.replace('{id}', '1')


def setup_django():
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'ascender.settings.development')
    import logging

    import django

    django.setup()
    # Without a database the settings wrapper warns at every read.
    logging.disable(logging.WARNING)


def serializer_context(view):
    """The view's get_serializer_context, or where it reads the database
    (organization counts), the nearest base class's that does not."""
    from django.db import DatabaseError

    def ctx():
        for klass in type(view).__mro__:
            f = klass.__dict__.get('get_serializer_context')
            if f is None:
                continue
            try:
                return f(view)
            except DatabaseError:
                continue
        return {}

    return ctx


def build(name, langs):
    """The old view's OPTIONS metadata for a document name, per language."""
    from django.contrib.auth.models import User
    from django.urls import resolve

    import ascender.api.metadata

    # The pod spec default reads the execution environments; it is no text.
    ascender.api.metadata.get_default_pod_spec = lambda: {}
    from django.utils import translation
    from rest_framework.test import APIRequestFactory
    from rest_framework.utils.encoders import JSONEncoder

    _, url = route_url(name)
    match = resolve(url)
    view_cls = getattr(match.func, 'view_class', None) or getattr(match.func, 'cls', None)
    if view_cls is None:
        raise RuntimeError('no view class for %s' % url)
    user = User(id=1, username='admin', is_superuser=True)
    out = {}
    for lang in langs:
        with translation.override(lang):
            req = APIRequestFactory().options(url, HTTP_ACCEPT='application/json')
            req.user = user
            view = view_cls()
            view.args = ()
            view.kwargs = dict(match.kwargs)
            view.format_kwarg = None
            view.headers = {}
            drf_req = view.initialize_request(req)
            drf_req._user = user
            drf_req._request.user = user
            view.request = drf_req
            # No database: every check passes and the object is a blank one
            # of the view's model.
            view.check_permissions = lambda request: None
            model = getattr(view, 'model', None)
            if model is not None and hasattr(view, 'get_object'):
                view.get_object = lambda model=model: model()
            if hasattr(view, 'get_serializer_context'):
                view.get_serializer_context = serializer_context(view)
            md = view.metadata_class().determine_metadata(drf_req, view)
            out[lang] = json.loads(json.dumps(md, cls=JSONEncoder))
    return out


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


def capfirst(t):
    return t[:1].upper() + t[1:]


def explained(en_line, tr_line, helps, choices):
    line = en_line
    for f, (e, t) in helps.items():
        line = line.replace('`%s`: %s (' % (f, html.escape(capfirst(e))), '`%s`: %s (' % (f, html.escape(capfirst(t))))
    m = CHOICE_LINE.match(line)
    if m and m.group(2) in choices:
        line = m.group(1) + choices[m.group(2)]
    return line == tr_line


def swaps(en, tr):
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
    return helps, choices


def description_lines(en, tr):
    ed, td = en.get('description'), tr.get('description')
    if not isinstance(ed, str) or not isinstance(td, str):
        return []
    helps, choices = swaps(en, tr)
    el, tl = ed.split('\n'), td.split('\n')
    if len(el) != len(tl):
        return []
    return [(e, t) for e, t in zip(el, tl) if e == t or not explained(e, t, helps, choices)]


def occurrences(en, tr):
    """(kind, path, English, translation) of every translatable text."""
    out = []

    def rec(kind, path, e, t):
        out.append((kind, path, e, t))

    if isinstance(en.get('name'), str) and isinstance(tr.get('name'), str):
        rec('name', 'name', en['name'], tr['name'])
    for e, t in description_lines(en, tr):
        rec('line', 'line:' + e, e, t)
    for m, fields in (en.get('actions') or {}).items():
        tf = (tr.get('actions') or {}).get(m) or {}
        if isinstance(fields, dict):
            for f, e in fields.items():
                walk_field(m + '.' + f, e, tf.get(f), rec)
    return out


def texts(doc):
    """{(kind, path): English} of a committed document."""
    out = {}
    blank = {k: v for k, v in doc.items()}
    for kind, path, e, _ in occurrences(blank, blank):
        out[(kind, path)] = e
    # Every description line, not only those occurrences() keeps.
    for line in (doc.get('description') or '').split('\n'):
        out[('line', 'line:' + line)] = line
    return out


def committed_texts():
    """{(kind, English): set of document names} over every committed
    metadata document."""
    seen = collections.defaultdict(set)
    for path in glob.glob(os.path.join(API, 'metadata', '**', '*.json'), recursive=True):
        try:
            with open(path, encoding='utf-8') as f:
                doc = json.load(f)
        except (ValueError, OSError):
            continue
        if not isinstance(doc, dict):
            continue
        name = os.path.relpath(path, os.path.join(API, 'metadata'))[:-5]
        if name.startswith('routes/'):
            name = name[len('routes/'):]
        for (kind, _), e in texts(doc).items():
            seen[(kind, e)].add(name)
    return seen


def load_catalog(lang):
    with open(os.path.join(LOCALE, lang + '.json'), encoding='utf-8') as f:
        return json.load(f)


def go_text(cat, route, path, kind, e):
    """What the Go side renders for a text (i18n_options.go's text)."""
    p = cat.get('paths', {}).get(route, {})
    if path in p:
        return p[path]
    return cat.get(kind, {}).get(e, e)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    check = '--check' in sys.argv
    if '--all' in sys.argv:
        args = sorted(os.path.basename(p)[:-5] for p in glob.glob(os.path.join(ROUTES_DIR, '*.json')))
    names = args or ROUTES
    setup_django()
    cats = {lang: load_catalog(lang) for lang in LANGS}
    # occ[lang][(kind, English)] = [(route, path, translation)]
    occ = {lang: collections.defaultdict(list) for lang in LANGS}
    problems = 0
    for name in names:
        route, _ = route_url(name)
        with open(os.path.join(ROUTES_DIR, name + '.json'), encoding='utf-8') as f:
            want = texts(json.load(f))
        try:
            docs = build(name, ['en-us'] + LANGS)
        except Exception as exc:  # noqa: BLE001 - report and go on
            print('%s: cannot build: %s: %s' % (name, type(exc).__name__, exc), file=sys.stderr)
            problems += 1
            continue
        mismatched = set()
        for lang in LANGS:
            for kind, path, e, t in occurrences(docs['en-us'], docs[lang]):
                if want.get((kind, path)) != e:
                    mismatched.add(path)
                    continue
                if check:
                    have = go_text(cats[lang], route, path, kind, e)
                    if have != t:
                        print('%s %s %s: Go %r, old %r' % (name, lang, path, have, t))
                        problems += 1
                    continue
                occ[lang][(kind, e)].append((route, path, t))
        for path in sorted(mismatched):
            if not path.startswith('line:'):
                print('%s: %s differs from the committed English; skipped' % (name, path), file=sys.stderr)
    if check:
        print('%d differences' % problems, file=sys.stderr)
        sys.exit(1 if problems else 0)
    seen = committed_texts()
    merged = set(names)
    for lang in LANGS:
        cat = cats[lang]
        paths = cat.setdefault('paths', {})
        for (kind, e), uses in occ[lang].items():
            shared = cat.get(kind, {}).get(e)
            if shared is None and seen[(kind, e)] <= merged:
                # Only these documents have the text: the outcome most of
                # them agree on, a translation over English when they tie,
                # as gen_options_i18n.py chooses.
                outcomes = collections.Counter(t for _, _, t in uses)
                best = max(outcomes, key=lambda t: (outcomes[t], t != e))
                if best != e:
                    cat.setdefault(kind, {})[e] = shared = best
            for r, path, t in uses:
                if t != (e if shared is None else shared):
                    paths.setdefault(r, {})[path] = t
                else:
                    paths.get(r, {}).pop(path, None)
        cat['paths'] = {r: dict(sorted(v.items())) for r, v in sorted(paths.items()) if v}
        for kind in list(cat):
            cat[kind] = dict(sorted(cat[kind].items()))
        with open(os.path.join(LOCALE, lang + '.json'), 'w', encoding='utf-8') as f:
            json.dump(cat, f, ensure_ascii=False, indent=4, sort_keys=True)
            f.write('\n')
    print('%d documents merged' % len(names), file=sys.stderr)


if __name__ == '__main__':
    main()
