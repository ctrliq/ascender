# Copyright (c) 2026 Ascender
# All Rights Reserved.
"""Importing the platform under the Ascender name.

The package on disk is still `awx/`. `ascender` makes every module in it
reachable under the product's name, so the installers, ascender-collection and
third party credential plugins can stop saying `awx.` before the directory is
renamed rather than on the same day.

What makes this worth testing is the failure it avoids. If `ascender.main.models`
were imported as a second module object rather than aliased to the first, there
would be two copies of every Django model, and the app registry would refuse the
second. These pin that one module answers to both names.
"""

import subprocess
import sys
import textwrap

import pytest


def run_in_a_fresh_interpreter(source):
    """Imports are cached for the life of a process, so cold starts need one each."""
    result = subprocess.run(
        [sys.executable, '-c', textwrap.dedent(source)],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr
    return result.stdout.strip()


def test_a_module_is_the_same_object_under_either_name():
    assert (
        run_in_a_fresh_interpreter(
            """
            import awx.main.utils.common
            import ascender.main.utils.common
            print(ascender.main.utils.common is awx.main.utils.common)
            """
        )
        == 'True'
    )


def test_the_ascender_name_works_without_awx_being_imported_first():
    """The order the alias is most likely to be used in, and the one that breaks
    if the finder is registered too late to catch the first submodule.
    """
    assert (
        run_in_a_fresh_interpreter(
            """
            from ascender.main.utils.common import get_object_or_400
            import awx.main.utils.common
            print(get_object_or_400 is awx.main.utils.common.get_object_or_400)
            """
        )
        == 'True'
    )


def test_the_package_itself_is_the_awx_package():
    assert run_in_a_fresh_interpreter('import ascender, awx; print(ascender is awx)') == 'True'


def test_no_module_is_ever_loaded_twice():
    """The duplicate this exists to prevent, checked across everything an import
    of the models pulls in, which is most of the platform.
    """
    assert (
        run_in_a_fresh_interpreter(
            """
            import sys
            import ascender.main.utils.common
            aliased = [name for name in sys.modules if name.startswith('ascender.')]
            print(bool(aliased) and all(sys.modules[name] is sys.modules['awx' + name[len('ascender'):]] for name in aliased))
            """
        )
        == 'True'
    )


def test_something_that_does_not_exist_still_raises():
    """Aliasing everything under a prefix is easy to get wrong in the direction
    of answering for names that were never there.
    """
    assert (
        run_in_a_fresh_interpreter(
            """
            try:
                import ascender.no_such_module
            except ModuleNotFoundError as e:
                print('awx.no_such_module' in str(e) or 'no_such_module' in str(e))
            """
        )
        == 'True'
    )


@pytest.mark.parametrize('name', ['awx', 'ascender'])
def test_the_credential_plugin_entry_points_resolve_under_either_name(name):
    """Third party plugins name a module path in their own metadata, and this is
    what lets one written against either prefix load."""
    assert (
        run_in_a_fresh_interpreter(
            f"""
            from {name}.main.credential_plugins.conjur import conjur_plugin
            print(conjur_plugin is not None)
            """
        )
        == 'True'
    )
