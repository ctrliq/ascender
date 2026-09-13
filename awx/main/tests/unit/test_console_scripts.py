# -*- coding: utf-8 -*-
"""Which command names the package installs, and that both mean the same thing.

`ascender-manage` is the name the product has. `awx-manage` is the name the
installers, the operator and people's own scripts call, and renaming it without
leaving it behind breaks all three on the first upgrade.

So both are declared, and this says so, because an entry point is the kind of
thing a tidy-up removes without noticing what calls it.
"""

import pathlib
import tomllib

import pytest

PYPROJECT = pathlib.Path(__file__).parents[4] / 'pyproject.toml'


@pytest.fixture(scope='module')
def scripts():
    with PYPROJECT.open('rb') as handle:
        return tomllib.load(handle)['project']['scripts']


def test_the_product_name_is_installed(scripts):
    assert 'ascender-manage' in scripts


def test_the_old_name_is_still_installed(scripts):
    # The installers call this one by name. It goes when they have all moved,
    # and not before.
    assert 'awx-manage' in scripts


def test_both_names_run_the_same_thing(scripts):
    assert scripts['ascender-manage'] == scripts['awx-manage']
