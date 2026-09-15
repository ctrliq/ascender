# Copyright (c) 2026 Ascender
# All Rights Reserved.
"""Settings the platform reads from the environment rather than a settings file.

Four of them, and the alias table in production.py cannot reach any: it runs
after the settings modules have loaded, and two of these decide which settings
file loads at all. So they are read under both names directly.

The AWX names are what the image, the three installers and anyone's own start
script pass today, which is why they keep answering rather than being given a
release to move in.
"""

import pytest

from ascender.settings.environment import environment_setting


@pytest.fixture
def clean_env(monkeypatch):
    for prefix in ('ASCENDER_', 'AWX_'):
        monkeypatch.delenv(prefix + 'LOGGING_MODE', raising=False)
    return monkeypatch


def test_the_ascender_name_is_read(clean_env):
    clean_env.setenv('ASCENDER_LOGGING_MODE', 'stdout')

    assert environment_setting('LOGGING_MODE', 'file') == 'stdout'


def test_the_awx_name_is_still_read(clean_env):
    """What the image and the installers pass today."""
    clean_env.setenv('AWX_LOGGING_MODE', 'stdout')

    assert environment_setting('LOGGING_MODE', 'file') == 'stdout'


def test_the_ascender_name_wins(clean_env):
    clean_env.setenv('AWX_LOGGING_MODE', 'stdout')
    clean_env.setenv('ASCENDER_LOGGING_MODE', 'file')

    assert environment_setting('LOGGING_MODE', 'file') == 'file'


def test_neither_set_falls_back(clean_env):
    assert environment_setting('LOGGING_MODE', 'file') == 'file'


def test_a_name_that_is_set_but_empty_still_wins(clean_env):
    """Exporting an empty value is how a deployment says "not this", and
    treating it as unset would quietly ignore that.
    """
    clean_env.setenv('ASCENDER_LOGGING_MODE', '')

    assert environment_setting('LOGGING_MODE', 'file') == ''


@pytest.mark.parametrize('suffix', ['SETTINGS_FILE', 'SETTINGS_DIR', 'LOGGING_MODE', 'WEB_PROCESS'])
def test_every_environment_setting_is_read_through_the_helper(suffix):
    """A direct os.environ.get for one of these would answer to one name only,
    which is the bug this file exists to keep out.
    """
    import pathlib

    settings_dir = pathlib.Path(environment_setting.__module__.replace('.', '/')).parent
    sources = ' '.join(p.read_text() for p in pathlib.Path(settings_dir).glob('*.py') if p.name != 'environment.py')

    assert f"'AWX_{suffix}'" not in sources, f'AWX_{suffix} is read directly rather than through environment_setting'
