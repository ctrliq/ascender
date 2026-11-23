"""Regenerate ../locale/messages.json: which of the old API's messages it
translated at run time, read from the old source with Python's ast.

The Go API writes its messages in English and translates error bodies as
they are written (translateBody). A plain message is looked up whole; a
formatted one ("No more than %(max_keys)d private keys are allowed, ...")
is recognized by its msgid's shape and the translation is filled with the
same values. That is only right where the old code translated the msgid
and formatted the translation (_('...') % x, _('...').format(x),
ValidationError(_('...'), params=...), DRF's self.fail()): where it
formatted first (_('...' % x), _(f'...')), gettext looked up a string no
catalog has and the message stayed English, and where the text was never
passed to gettext it stayed English too. Plain gettext() run at import
time (a module-level _('...') with `from django.utils.translation import
gettext as _`) gave English as well.

This script walks the old application's source (and the libraries whose
messages the API passed on: Django REST framework, Django's validators,
fields and forms, django-oauth-toolkit) and writes:

  formatted     msgids with placeholders that were translated before
                being filled in, with their style ("percent" or "brace")
                and, for ngettext, the plural msgid and the count's
                placeholder (a msgid no catalog has stays English, but
                still claims the texts of its shape);
  untranslated  msgids the old application's own code only used without
                translating them (or translated at import time), which
                must stay English even though a catalog has them;
  english       texts the old code left English that a formatted msgid
                would otherwise claim: exact strings, and English-only
                formats ({"id", "style"}) such as f-strings and
                '...' % x outside gettext;
  exact         English -> {language: text} for the uniqueness messages
                Django put together from translated and untranslated
                pieces (a model's verbose name, its fields', and "and"),
                computed by Django itself in each language.

Messages used both ways are listed on stdout for review. Run it in a
throwaway container of the old image with the old source mounted, from
src/internal/api:

  docker run --rm --network none \\
    -v $OLD_SOURCE:/ascender_devel:ro -v $PWD:/w -v $PWD/../i18n:/i18n:ro \\
    -v <any file>:/etc/ascender/SECRET_KEY:ro \\
    --entrypoint /var/lib/ascender/venv/ascender/bin/python \\
    ghcr.io/ctrliq/ascender_devel:main /w/testdata/gen_api_messages.py
"""
import ast
import glob
import json
import os
import re

SITE = glob.glob('/var/lib/ascender/venv/ascender/lib/python3*/site-packages')[0]
OWN = '/ascender_devel/ascender'
LIBS = [
    'rest_framework',
    'django/core',
    'django/forms',
    'django/db/models',
    'django/contrib/auth',
    'django/contrib/contenttypes',
    'django/http',
    'django/shortcuts.py',
    'oauth2_provider',
]
CATALOG = json.load(open('/i18n/locales/ja/api.json', encoding='utf-8'))

LAZY = {'gettext_lazy', 'ugettext_lazy', 'ngettext_lazy', 'ungettext_lazy', 'pgettext_lazy', 'npgettext_lazy'}
EAGER = {'gettext', 'ugettext', 'ngettext', 'ungettext', 'pgettext', 'npgettext'}
PLURAL = {'ngettext', 'ungettext', 'ngettext_lazy', 'ungettext_lazy'}
CONTEXT = {'pgettext', 'pgettext_lazy'}

# The placeholders of each style, as internal/i18n tokenizes them.
PCT = re.compile(r'%(?:\(([^)]*)\))?[-#0 +]*(?:\*|\d+)?(?:\.(?:\*|\d+))?[hlL]?([diouxXeEfFgGcrsa%])')


def tokens(msg, style):
    """(is_placeholder, text, conv) pieces of a message, %% and {{ undone."""
    out = []
    if style == 'percent':
        pos = 0
        for m in PCT.finditer(msg):
            out.append((False, msg[pos:m.start()], ''))
            pos = m.end()
            if m.group(2) == '%':
                out.append((False, '%', ''))
            else:
                out.append((True, m.group(0), m.group(2)))
        out.append((False, msg[pos:], ''))
    else:
        i, lit = 0, ''
        while i < len(msg):
            c = msg[i]
            if c in '{}' and i + 1 < len(msg) and msg[i + 1] == c:
                lit += c
                i += 2
                continue
            if c != '{':
                lit += c
                i += 1
                continue
            end = msg.find('}', i)
            if end < 0:
                lit += msg[i:]
                break
            out.append((False, lit, ''))
            lit = ''
            out.append((True, msg[i:end + 1], 's'))
            i = end + 1
        out.append((False, lit, ''))
    merged = []
    for t in out:
        if not t[0] and merged and not merged[-1][0]:
            merged[-1] = (False, merged[-1][1] + t[1], '')
        elif t[0] or t[1]:
            merged.append(t)
    return merged


def placeholders(msg, style):
    return [t for t in tokens(msg, style) if t[0]]


def literal(msg, style):
    return ''.join(t[1] for t in tokens(msg, style) if not t[0])


def guess_style(msgid):
    return 'percent' if placeholders(msgid, 'percent') else 'brace'


def regex_of(msg, style):
    parts = []
    for ph, text, conv in tokens(msg, style):
        if not ph:
            parts.append(re.escape(text))
        elif conv in 'di':
            parts.append(r'(-?\d+)')
        else:
            parts.append('(.*?)')
    return re.compile('(?s)^' + ''.join(parts) + '$')


def sample(msg, style):
    """A text of this format, each placeholder filled in."""
    return ''.join(('1' if conv in 'di' else 'X') if ph else text for ph, text, conv in tokens(msg, style))


def fstring(node):
    """An f-string as a str.format message."""
    out = ''
    for v in node.values:
        if isinstance(v, ast.Constant) and isinstance(v.value, str):
            out += v.value.replace('{', '{{').replace('}', '}}')
        else:
            out += '{}'
    return out


class Visitor(ast.NodeVisitor):
    def __init__(self):
        self.funcs = {}  # local name -> gettext function
        self.depth = 0  # function nesting
        self.parents = []
        # (msgid, kind, style, plural): kind T (translated at run time),
        # U (formatted before translation, or translated at import time),
        # L (a string never passed to gettext), F (an f-string).
        self.uses = []

    def visit_ImportFrom(self, node):
        if node.module == 'django.utils.translation':
            for a in node.names:
                self.funcs[a.asname or a.name] = a.name
        self.generic_visit(node)

    def visit_FunctionDef(self, node):
        self.depth += 1
        self.generic_visit(node)
        self.depth -= 1

    visit_AsyncFunctionDef = visit_FunctionDef
    visit_Lambda = visit_FunctionDef

    def generic_visit(self, node):
        self.parents.append(node)
        super().generic_visit(node)
        self.parents.pop()

    def func_of(self, call):
        f = call.func
        if isinstance(f, ast.Name):
            return self.funcs.get(f.id)
        if isinstance(f, ast.Attribute) and isinstance(f.value, ast.Name) and f.value.id == 'translation':
            return f.attr
        return None

    def visit_JoinedStr(self, node):
        self.uses.append((fstring(node), 'F', 'brace', None))
        self.generic_visit(node)

    def visit_Call(self, node):
        fn = self.func_of(node)
        if fn in LAZY or fn in EAGER:
            args = node.args[1:] if fn in CONTEXT else node.args
            parent = self.parents[-1] if self.parents else None
            style = None
            if isinstance(parent, ast.BinOp) and isinstance(parent.op, ast.Mod) and parent.left is node:
                style = 'percent'
            elif isinstance(parent, ast.Attribute) and parent.attr == 'format':
                style = 'brace'
            if args and isinstance(args[0], ast.Constant) and isinstance(args[0].value, str):
                msgid = args[0].value
                if fn in CONTEXT and isinstance(node.args[0], ast.Constant):
                    msgid = node.args[0].value + '\x04' + msgid
                runtime = fn in LAZY or self.depth > 0
                plural = None
                if fn in PLURAL and len(args) > 1 and isinstance(args[1], ast.Constant):
                    plural = args[1].value
                self.uses.append((msgid, 'T' if runtime else 'U', style, plural))
            elif args:
                # Formatted before translation: the constant inside is a
                # msgid whose filled-in text no catalog has.
                for sub in ast.walk(args[0]):
                    if isinstance(sub, ast.Constant) and isinstance(sub.value, str):
                        self.uses.append((sub.value, 'U', None, None))
        self.generic_visit(node)

    def visit_Constant(self, node):
        if isinstance(node.value, str):
            parent = self.parents[-1] if self.parents else None
            if not (isinstance(parent, ast.Call) and self.func_of(parent)):
                # Not passed to gettext here (a dict key, a plain string).
                style = 'percent' if isinstance(parent, ast.BinOp) and isinstance(parent.op, ast.Mod) and parent.left is node else None
                if isinstance(parent, ast.Attribute) and parent.attr == 'format':
                    style = 'brace'
                self.uses.append((node.value, 'L', style, None))


def scan(root, skip=()):
    out = []
    files = [root] if root.endswith('.py') else glob.glob(root + '/**/*.py', recursive=True)
    for path in files:
        rel = path[len(root):]
        if any(s in rel for s in skip):
            continue
        try:
            tree = ast.parse(open(path, encoding='utf-8').read())
        except (SyntaxError, UnicodeDecodeError):
            continue
        v = Visitor()
        v.visit(tree)
        out.extend((u, path) for u in v.uses)
    return out


SKIP = ('/tests/', '/migrations/', '/ui/')
formatted = {}
review = []


def add_formatted(msgid, style, plural):
    style = style or guess_style(msgid)
    phs = placeholders(msgid, style)
    if not phs:
        return
    # A message that is nothing but placeholders says nothing to match.
    if len(literal(msgid, style).strip()) < 4:
        return
    entry = {'id': msgid, 'style': style}
    if plural:
        entry['plural'] = plural
        counts = [t for t in phs if t[2] in 'di'] or phs
        m = re.match(r'%\(([^)]*)\)', counts[0][1])
        entry['n'] = m.group(1) if m else '#0'
    prev = formatted.get(msgid)
    if prev and prev['style'] != style:
        review.append('%r formatted as both %s and %s' % (msgid, prev['style'], style))
    formatted.setdefault(msgid, entry)


lib_msgids = set()
for lib in LIBS:
    for (msgid, kind, style, plural), path in scan(os.path.join(SITE, lib), SKIP):
        if kind == 'T':
            lib_msgids.add(msgid)
            add_formatted(msgid, style, plural)

own = {}
own_style = {}
for (msgid, kind, style, plural), path in scan(OWN, SKIP):
    own.setdefault(msgid, {'T': set(), 'U': set(), 'L': set(), 'F': set()})[kind].add(path[len(OWN) + 1:])
    if style:
        own_style.setdefault(msgid, style)
    if kind == 'T':
        add_formatted(msgid, style, plural)

for m, k in sorted(own.items()):
    if k['T'] and k['U'] and m in CATALOG:
        review.append('%r translated in %s, not in %s' % (m, sorted(k['T']), sorted(k['U'])))

untranslated = sorted(m for m, k in own.items() if not k['T'] and (k['U'] or k['L']) and m in CATALOG and m not in formatted and m not in lib_msgids)

# Texts the formatted msgids would claim although the old code left them
# English: its plain strings and English-only formats, and its translated
# plain msgids that no catalog has.
templates = [(regex_of(e['id'], e['style']), len(literal(e['id'], e['style'])), e['id']) for e in formatted.values()]
for e in formatted.values():
    if 'plural' in e:
        templates.append((regex_of(e['plural'], e['style']), len(literal(e['plural'], e['style'])), e['id']))


def claimed(text, longer_than=-1):
    for rx, lit, msgid in templates:
        if lit > longer_than and rx.match(text) and msgid != text:
            return msgid
    return None


english_exact, english_formats = set(), {}
for m, k in own.items():
    if len(m) < 6 or m in formatted:
        continue
    english_only = not k['T'] and (k['U'] or k['L'] or k['F'])
    untranslated_msgid = k['T'] and m not in CATALOG and not placeholders(m, guess_style(m))
    if not (english_only or untranslated_msgid):
        continue
    style = own_style.get(m) or ('brace' if k['F'] else guess_style(m))
    if english_only and placeholders(m, style) and len(literal(m, style).strip()) >= 4:
        # An English-only format: it must win over the msgids that would
        # claim its texts, so only shorter ones are of concern.
        if claimed(sample(m, style)):
            english_formats[m] = style
    elif m not in CATALOG and claimed(m):
        english_exact.add(m)

# The uniqueness messages the Go API answers with: model.full_clean's
# unique_error_message, and DRF's unique field validator (whose message
# is the model field's, filled in when the serializer is built).
UNIQUE = [
    ('main.Organization', ('name',)),
    ('main.ExecutionEnvironment', ('name',)),
    ('main.InstanceGroup', ('name',)),
    ('main.Label', ('name', 'organization')),
    ('main.Team', ('organization', 'name')),
    ('main.OAuth2Application', ('name', 'organization')),
    ('main.CredentialInputSource', ('target_credential', 'input_field_name')),
]
DRF_UNIQUE = [('main.Instance', 'hostname')]
LANGS = ['ar', 'es', 'fr', 'hi', 'ja', 'ko', 'nl', 'zh']


def unique_messages():
    import sys
    sys.path.insert(0, '/ascender_devel')
    os.environ['DJANGO_SETTINGS_MODULE'] = 'ascender.settings.development'
    import ascender.settings.development as dev

    dev.INSTALLED_APPS = [a for a in dev.INSTALLED_APPS if a != 'debug_toolbar']
    import django

    django.setup()
    from django.apps import apps
    from django.utils import translation
    from rest_framework.utils.field_mapping import get_unique_error_message

    def texts():
        out = []
        for name, fields in UNIQUE:
            model = apps.get_model(name)
            e = model().unique_error_message(model, fields)
            out.append(str(e.message % e.params))
        for name, field in DRF_UNIQUE:
            out.append(str(get_unique_error_message(apps.get_model(name)._meta.get_field(field))))
        return out

    translation.activate('en-us')
    english = texts()
    exact = {e: {} for e in english}
    for lang in LANGS:
        translation.activate(lang)
        for e, t in zip(english, texts()):
            if t != e:
                exact[e][lang] = t
    translation.deactivate()
    return exact


out = {
    'exact': unique_messages(),
    'formatted': [formatted[k] for k in sorted(formatted)],
    'untranslated': untranslated,
    'english': sorted(english_exact) + [{'id': k, 'style': v} for k, v in sorted(english_formats.items())],
}
with open('/w/locale/messages.json', 'w', encoding='utf-8') as f:
    json.dump(out, f, ensure_ascii=False, indent=1, sort_keys=True)
    f.write('\n')
print('%d formatted, %d untranslated, %d english texts, %d english formats' % (len(out['formatted']), len(untranslated), len(english_exact), len(english_formats)))
for r in review:
    print('review:', r)
