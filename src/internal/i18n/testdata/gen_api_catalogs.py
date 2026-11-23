"""Regenerate locales/<lang>/api.json: the old API's messages, exactly as
Django resolved them at run time.

The old API translated with Django's merged catalogs: Ascender's own
(ascender/locale), then each installed app's (Django REST framework, Django
itself, oauth2_provider, social_django, ...), in Django's precedence order.
This script activates each language in the old application and writes what
gettext would return, so the Go API answers with the same text.

Run it in a throwaway container of the old image with the old source
mounted read-only, from src/internal/i18n:

  docker run --rm --network none \
    -v $OLD_SOURCE:/ascender_devel:ro -v $PWD:/w \
    -v <any file>:/etc/ascender/SECRET_KEY:ro \
    --entrypoint /var/lib/ascender/venv/ascender/bin/python \
    ghcr.io/ctrliq/ascender_devel:main /w/testdata/gen_api_catalogs.py

A message is a key with its translation; a plural message's value is
{"forms": [...], "plural": "<gettext plural expression>"}, the expression
picking the form for n. The development-only debug toolbar is left out.
"""
import json
import os
import sys

sys.path.insert(0, '/ascender_devel')
os.environ['DJANGO_SETTINGS_MODULE'] = 'ascender.settings.development'
import ascender.settings.development as dev  # noqa: E402

dev.INSTALLED_APPS = [a for a in dev.INSTALLED_APPS if a != 'debug_toolbar']

import django  # noqa: E402

django.setup()
from django.utils import translation  # noqa: E402

LANGS = ['ar', 'es', 'fr', 'hi', 'ja', 'ko', 'nl', 'zh']

# The plural rules the catalogs use, as gettext expressions, so the Go side
# evaluates the same rule (i18n.pluralForm knows each of these).
RULES = {
    '0': lambda n: 0,
    'n != 1': lambda n: int(n != 1),
    'n > 1': lambda n: int(n > 1),
    'n == 1 ? 0 : n != 0 && n % 1000000 == 0 ? 1 : 2':
        lambda n: 0 if n == 1 else 1 if n != 0 and n % 1000000 == 0 else 2,
    '(n == 0 || n == 1) ? 0 : n != 0 && n % 1000000 == 0 ? 1 : 2':
        lambda n: 0 if n in (0, 1) else 1 if n != 0 and n % 1000000 == 0 else 2,
    'n==0 ? 0 : n==1 ? 1 : n==2 ? 2 : n%100>=3 && n%100<=10 ? 3 : n%100>=11 && n%100<=99 ? 4 : 5':
        lambda n: 0 if n == 0 else 1 if n == 1 else 2 if n == 2 else 3 if 3 <= n % 100 <= 10 else 4 if 11 <= n % 100 <= 99 else 5,
}


def rule_of(func):
    sig = [func(n) for n in range(0, 2000001, 997)] + [func(n) for n in range(0, 1201)] + [func(1000000), func(2000000)]
    for expr, f in RULES.items():
        if sig == [f(n) for n in range(0, 2000001, 997)] + [f(n) for n in range(0, 1201)] + [f(1000000), f(2000000)]:
            return expr
    raise SystemExit('unknown plural rule: %r' % sig[:30])


def write(path, catalog):
    lines = ['  %s: %s' % (json.dumps(k, ensure_ascii=False), json.dumps(catalog[k], ensure_ascii=False)) for k in sorted(catalog)]
    with open(path, 'w', encoding='utf-8') as f:
        f.write('{\n' + ',\n'.join(lines) + '\n}\n')


for lang in LANGS:
    translation.activate(lang)
    trans = translation.trans_real._active.value
    tc = trans._catalog
    catalogs = getattr(tc, '_catalogs', [tc])
    plurals = getattr(tc, '_plurals', [trans.plural] * len(catalogs))
    out, plural_src = {}, {}
    # Earlier catalogs take precedence, as TranslationCatalog.__getitem__.
    for cat, func in zip(catalogs, plurals):
        for key, value in cat.items():
            if isinstance(key, tuple):
                msgid, i = key
                if plural_src.setdefault(msgid, id(cat)) != id(cat):
                    continue
                entry = out.setdefault(msgid, {'forms': {}, 'plural': rule_of(func)})
                entry['forms'][i] = value
            elif key and key not in out:
                out[key] = value
    for msgid in plural_src:
        forms = out[msgid]['forms']
        out[msgid]['forms'] = [forms[i] for i in sorted(forms)]
    dest = '/w/locales/%s/api.json' % lang
    write(dest, out)
    print('%s: %d messages (%d plural)' % (dest, len(out), len(plural_src)))
