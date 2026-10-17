import os

import pytest

from django.conf import settings

import ascender
from ascender.api.serializers import SUPPORTED_UI_LOCALES

AWX_ROOT = os.path.dirname(os.path.abspath(ascender.__file__))
BACKEND_CATALOG_DIR = os.path.join(AWX_ROOT, 'locale')
UI_BUNDLE_DIR = os.path.join(AWX_ROOT, 'ui', 'src', 'locales')
UI_THEME_DIR = os.path.join(AWX_ROOT, 'ui', 'src', 'themes')

# A theme an administrator uploads through CUSTOM_THEME, which is selectable
# without a stylesheet of its own in the tree.
THEMES_WITHOUT_A_STYLESHEET = {'custom'}

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


def _registered_choices(setting):
    from ascender.conf import settings_registry

    return set(settings_registry.get_setting_field(setting).choices)


@pytest.mark.skipif(not os.path.isdir(UI_THEME_DIR), reason='UI sources are not present in this layout')
def test_default_ui_theme_choices_match_the_bundled_stylesheets():
    """DEFAULT_UI_THEME is a hand written list, and the themes it names are
    stylesheets bundled by the UI build. Nothing connects the two at runtime: a
    theme added to one and not the other is either missing from the setting or
    offered and then not found, and neither fails until somebody picks it."""
    bundled = {name[: -len('.css')] for name in os.listdir(UI_THEME_DIR) if name.endswith('.css')}
    assert _registered_choices('DEFAULT_UI_THEME') - THEMES_WITHOUT_A_STYLESHEET == bundled


def test_default_ui_language_choices_match_the_supported_locales():
    """The same for DEFAULT_UI_LANGUAGE, against the locales preferred_language
    is already validated against, which the test above ties to the UI bundles."""
    assert _registered_choices('DEFAULT_UI_LANGUAGE') == SUPPORTED_UI_LOCALES
