import os

import pytest

from django.conf import settings

import awx
from awx.api.serializers import SUPPORTED_UI_LOCALES

AWX_ROOT = os.path.dirname(os.path.abspath(awx.__file__))
BACKEND_CATALOG_DIR = os.path.join(AWX_ROOT, 'locale')
UI_BUNDLE_DIR = os.path.join(AWX_ROOT, 'ui', 'src', 'locales')

# 'en' is declared without a backend catalog on purpose: the UI ships its bundle
# under that code, and a request that resolves to 'en' falls through to the
# source strings, which are already English.
LANGUAGES_WITHOUT_CATALOG = {'en'}


def _subdirectories(path):
    # __pycache__ (and any other tooling artifact) can appear next to the
    # locale directories when the tree has been imported by python first.
    return {name for name in os.listdir(path) if os.path.isdir(os.path.join(path, name)) and not name.startswith(('_', '.'))}


def test_languages_match_the_backend_catalogs():
    """Every LANGUAGES code except 'en' must have a catalog we actually ship."""
    declared = {code for code, _label in settings.LANGUAGES}
    assert declared - LANGUAGES_WITHOUT_CATALOG == _subdirectories(BACKEND_CATALOG_DIR)


def test_default_language_has_a_catalog():
    assert settings.LANGUAGE_CODE in _subdirectories(BACKEND_CATALOG_DIR)


@pytest.mark.skipif(not os.path.isdir(UI_BUNDLE_DIR), reason='UI sources are not present in this layout')
def test_supported_ui_locales_match_the_ui_bundles():
    """preferred_language is validated against the locales the UI can load, which
    is a different set from LANGUAGES: the UI names its English bundle 'en' while
    the backend catalog is 'en-us'."""
    assert SUPPORTED_UI_LOCALES - {''} == _subdirectories(UI_BUNDLE_DIR)
