"""Regenerate api_language.json: the language the old API chose for a
request, from its django_language cookie and Accept-Language header.

The old API ran Django's LocaleMiddleware, which activated
get_language_from_request(request) and answered with that language in
Content-Language. This script asks the old application's Django the same
question for each case below, so i18n.RequestLanguage is checked against
the real thing. Run it like gen_api_catalogs.py, from src/internal/i18n:

  docker run --rm --network none \
    -v $OLD_SOURCE:/ascender_devel:ro -v $PWD:/w \
    -v <any file>:/etc/ascender/SECRET_KEY:ro \
    --entrypoint /var/lib/ascender/venv/ascender/bin/python \
    ghcr.io/ctrliq/ascender_devel:main /w/testdata/gen_api_language.py
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
from django.http import HttpResponse  # noqa: E402
from django.middleware.locale import LocaleMiddleware  # noqa: E402
from django.test import RequestFactory  # noqa: E402
from django.utils import translation  # noqa: E402

ACCEPTS = [
    None, '', '*', 'ja', 'JA', 'ja-JP', 'ja-jp,ja;q=0.9,en;q=0.8', 'zh-CN,zh;q=0.9', 'zh-TW', 'zh-Hant',
    'zh-hans-cn', 'zh-HK,en;q=0.5', 'de,ja;q=0.5', 'de', 'de-DE,fr;q=0.1', 'en-GB', 'en-US', 'en-us', 'en',
    'en-AU,ja;q=0.9', 'fr-CA', 'fr-FR,fr;q=0.9', 'es-419', 'es-MX,es;q=0.9', 'ko-KR', 'nl-BE', 'hi-IN', 'ar-SA',
    'ar-EG,ar;q=0.9,en-US;q=0.8', 'pt-BR', 'pt-BR,pt;q=0.9,es;q=0.8', 'ja;q=0.1,ko;q=0.2', 'ko;q=0.5,ja;q=0.5',
    'ja;q=0', 'ja;q=0.0,ko', 'ja;q=1.0', 'ja;q=1.5', 'ja;q=0.5555', 'ja ; q=0.5 , ko', '*,ja', 'ja,*',
    'de,*,ja', 'x-pig-latin', 'i-klingon,ja', 'ja_JP', 'ja-JP-u-ca-japanese', 'ja-', 'ja,,ko', ',ja', 'ja;',
    'ja;q=', 'en-us;q=0.8,ja;q=0.9', 'sr-Latn,ja', 'zh', 'ZH-CN', 'zh-SG', 'zh-mo', 'nl,en;q=0.5',
    'abcdefghi,ja', 'ja-abcdefghi', 'ja-123', 'fr;q=0.8, es;q=0.9 ,ja;q=0.85', 'de;q=0.9,hi',
    'ja,' + 'x' * 600, 'ja-' + 'x' * 600, 'a' * 499 + ',ja', 'ko,' + 'a' * 495 + ',ja',
]
COOKIES = [
    None, 'ko', 'ja', 'KO', 'zh-cn', 'zh-Hans', 'zh_CN', 'en', 'en-us', 'en-US', 'en-gb', 'de', 'fr-ca', '',
    'ja-JP', 'x' * 600, 'ar', 'hi',
]


def lang_of(cookie, accept):
    kwargs = {}
    if accept is not None:
        kwargs['HTTP_ACCEPT_LANGUAGE'] = accept
    req = RequestFactory().get('/api/v2/', **kwargs)
    if cookie is not None:
        req.COOKIES['django_language'] = cookie
    mw = LocaleMiddleware(lambda r: HttpResponse())
    resp = mw(req)
    translation.deactivate()
    return resp.headers['Content-Language']


cases = []
for accept in ACCEPTS:
    cases.append({'cookie': None, 'accept': accept, 'lang': lang_of(None, accept)})
for cookie in COOKIES[1:]:
    for accept in (None, 'ja', 'de'):
        cases.append({'cookie': cookie, 'accept': accept, 'lang': lang_of(cookie, accept)})
with open('/w/testdata/api_language.json', 'w') as f:
    json.dump(cases, f, indent=1)
    f.write('\n')
print(len(cases), 'cases')
