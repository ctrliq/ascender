# Copyright (c) 2026 Ascender
# All Rights Reserved.
"""Which entry point group a credential plugin has to register under.

`awx.credential_plugins` is a published name. A plugin in someone else's
package declares itself under it, and nothing in this repository can rewrite
that, so the group cannot be renamed the way a setting or a command can. What
it can do is answer to both names, which is what these tests pin.
"""

import pathlib
import tomllib
from importlib.metadata import EntryPoint

import pytest

from ascender.main.models.credential import CREDENTIAL_PLUGIN_GROUPS, load_credential_plugins

PYPROJECT = pathlib.Path(__file__).resolve().parents[5] / 'pyproject.toml'


def declared_groups():
    return tomllib.loads(PYPROJECT.read_text())['project']['entry-points']


def test_both_groups_declare_the_same_plugins():
    """Two lists of the same ten plugins drift the moment one is edited alone,
    and the symptom is a plugin that loads for some installations and not
    others depending on which group the caller happened to read.
    """
    groups = declared_groups()
    assert groups['ascender.credential_plugins'] == groups['awx.credential_plugins']


def test_the_declared_groups_are_the_ones_that_get_read():
    groups = declared_groups()
    for group in CREDENTIAL_PLUGIN_GROUPS:
        assert group in groups, f'{group} is read at import but declared by nothing'


@pytest.fixture
def fake_entry_points(mocker):
    """Stand in for importlib.metadata.entry_points, per group."""
    registry = {}

    def _entry_points(group):
        return registry.get(group, [])

    mocker.patch('ascender.main.models.credential.entry_points', side_effect=_entry_points)
    return registry


def _point(name, value):
    return EntryPoint(name=name, value=value, group='ignored')


def test_a_plugin_registered_only_under_the_awx_group_is_still_found(fake_entry_points):
    """The whole reason the old group stays: a third party plugin built against
    it keeps working without its author republishing anything.
    """
    fake_entry_points['awx.credential_plugins'] = [_point('third_party', 'awx.main.credential_plugins.conjur:conjur_plugin')]

    plugins = load_credential_plugins()

    assert 'third_party' in plugins


def test_the_ascender_group_wins_a_name_collision(fake_entry_points):
    fake_entry_points['ascender.credential_plugins'] = [_point('conjur', 'awx.main.credential_plugins.conjur:conjur_plugin')]
    fake_entry_points['awx.credential_plugins'] = [_point('conjur', 'awx.main.credential_plugins.aim:aim_plugin')]

    plugins = load_credential_plugins()

    from ascender.main.credential_plugins.conjur import conjur_plugin

    assert plugins['conjur'] is conjur_plugin


def test_a_plugin_that_will_not_import_does_not_take_the_others_with_it(fake_entry_points):
    fake_entry_points['ascender.credential_plugins'] = [
        _point('broken', 'no.such.module:nothing'),
        _point('conjur', 'awx.main.credential_plugins.conjur:conjur_plugin'),
    ]

    plugins = load_credential_plugins()

    assert 'broken' not in plugins
    assert 'conjur' in plugins
