import pytest

from ascender.api.versioning import reverse


@pytest.mark.django_db
def test_ui_defaults_reach_users_who_cannot_read_ui_settings(get, patch, admin, rando):
    """The UI defaults are for everyone, so /config/ carries them to non-admins.

    /api/v2/settings/ui/ is where they are edited, and an ordinary user is
    refused there, which used to leave the UI with no defaults at all for the
    very users they were meant for.
    """
    get(reverse('api:setting_singleton_detail', kwargs={'category_slug': 'ui'}), user=rando, expect=403)

    patch(
        reverse('api:setting_singleton_detail', kwargs={'category_slug': 'ui'}),
        user=admin,
        data={
            'DEFAULT_UI_THEME': 'custom',
            'DEFAULT_UI_LANGUAGE': 'fr',
            'MAX_UI_EDITOR_ROWS': 20,
            'CUSTOM_THEME': 'html[data-theme="custom"] body { color: red; }',
            'CUSTOM_THEME_NAME': 'Red',
        },
        expect=200,
    )

    data = get(reverse('api:api_v2_config_view'), user=rando, expect=200).data
    assert data['default_ui_theme'] == 'custom'
    assert data['default_ui_language'] == 'fr'
    assert data['max_ui_editor_rows'] == 20
    assert data['custom_theme'] == 'html[data-theme="custom"] body { color: red; }'
    assert data['custom_theme_name'] == 'Red'


@pytest.mark.django_db
def test_ui_defaults_in_config_before_anything_is_saved(get, rando):
    data = get(reverse('api:api_v2_config_view'), user=rando, expect=200).data
    assert data['default_ui_theme'] == 'default'
    assert data['default_ui_language'] == ''
    assert data['max_ui_editor_rows'] == 50
    assert data['custom_theme'] == ''
    assert data['custom_theme_name'] == ''
