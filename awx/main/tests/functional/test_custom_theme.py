import pytest

from awx.conf import settings_registry


@pytest.fixture
def custom_theme_field():
    return settings_registry.get_setting_field('CUSTOM_THEME')


@pytest.mark.parametrize(
    'css',
    [
        pytest.param('html[data-theme="custom"] { --pf-t--color: #fff; }', id='plain_css'),
        pytest.param('@font-face { src: url(../../public/static/fonts/Inter.woff2) format("woff2"); }', id='relative_url'),
        pytest.param('a { background: url(data:image/png;base64,iVBORw0KGgo=); }', id='data_uri'),
        pytest.param('', id='empty_clears_the_theme'),
    ],
)
def test_accepts_a_self_contained_stylesheet(custom_theme_field, css):
    """Anything that stays inside the deployment is allowed through untouched."""
    assert custom_theme_field.to_internal_value(css) == css


@pytest.mark.parametrize(
    'css, expected',
    [
        pytest.param('@import url("https://example.invalid/theme.css");', 'may not use @import', id='import_https'),
        pytest.param('@IMPORT "other.css";', 'may not use @import', id='import_is_case_insensitive'),
        pytest.param('a { background: url(https://example.invalid/x.png); }', 'may not reference remote URLs', id='https_url'),
        pytest.param('a { background: url(http://example.invalid/x.png); }', 'may not reference remote URLs', id='http_url'),
        pytest.param('a { background: url(//example.invalid/x.png); }', 'may not reference remote URLs', id='protocol_relative_url'),
        pytest.param("a { background: url('https://example.invalid/x.png'); }", 'may not reference remote URLs', id='quoted_remote_url'),
        pytest.param('a { background: url( "https://example.invalid/x.png" ); }', 'may not reference remote URLs', id='spaced_remote_url'),
    ],
)
def test_rejects_anything_that_reaches_the_network(custom_theme_field, css, expected):
    """A theme must not turn every page load into a request to somebody else.

    @import fetches a second stylesheet from wherever it points, and a remote
    url() leaks the viewer's address and headers to that host while fetching a
    font or an image. Neither is blocked because it is dangerous to the server:
    the value is written by an administrator. They are blocked because they move
    the real content somewhere this validation never sees, and because they tell
    a third party who is looking at the page.
    """
    from rest_framework.serializers import ValidationError

    with pytest.raises(ValidationError) as exc:
        custom_theme_field.to_internal_value(css)
    assert expected in str(exc.value)


def test_rejects_a_stylesheet_larger_than_the_cap(custom_theme_field):
    """The largest shipped theme is about 60 KB, so 5 MB is a runaway paste."""
    from rest_framework.serializers import ValidationError

    with pytest.raises(ValidationError) as exc:
        custom_theme_field.to_internal_value('a{}' + 'x' * (5 * 1024 * 1024))
    assert 'larger than' in str(exc.value)


def test_a_theme_name_is_a_plain_string():
    """The name is only ever rendered as text in the theme list."""
    field = settings_registry.get_setting_field('CUSTOM_THEME_NAME')
    assert field.to_internal_value('Solarized') == 'Solarized'
    assert field.to_internal_value('') == ''
