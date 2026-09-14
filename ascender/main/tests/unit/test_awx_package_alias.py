# Copyright (c) 2026 Ascender
# All Rights Reserved.
"""Importing the platform under the name it used to have.

The package is `ascender/` now, and `awx` makes every module in it reachable
under the old name. Four things outside this repository name `awx` directly:
the `awx.credential_plugins` entry points, both installers' `awx.main` imports,
and ascender-collection's test imports. None of them can be renamed from here
in the same commit.

The dispatcher is the reason the alias cannot wait for those to move. Task
names travel as strings, and a worker resolves one by importing the path it was
sent, so a message queued before an upgrade and read after it names
`awx.main.tasks.system.delete_inventory` and has to resolve.

What makes this worth testing is the failure it avoids. If `awx.main.models`
were imported as a second module object rather than aliased to the first, there
would be two copies of every Django model and the app registry would refuse the
second.
"""

import subprocess
import sys
import textwrap

import pytest


def run_in_a_fresh_interpreter(source):
    """Imports are cached for the life of a process, so cold starts need one each."""
    result = subprocess.run([sys.executable, '-c', textwrap.dedent(source)], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    return result.stdout.strip()


def test_a_module_is_the_same_object_under_either_name():
    assert (
        run_in_a_fresh_interpreter(
            """
            import ascender.main.utils.common
            import awx.main.utils.common
            print(awx.main.utils.common is ascender.main.utils.common)
            """
        )
        == 'True'
    )


def test_the_old_name_works_without_the_new_one_being_imported_first():
    """The order everything outside this repository uses today, and the one that
    breaks if the finder is registered too late to catch the first submodule.
    """
    assert (
        run_in_a_fresh_interpreter(
            """
            from awx.main.utils.common import get_object_or_400
            import ascender.main.utils.common
            print(get_object_or_400 is ascender.main.utils.common.get_object_or_400)
            """
        )
        == 'True'
    )


def test_the_package_itself_is_the_ascender_package():
    assert run_in_a_fresh_interpreter('import awx, ascender; print(awx is ascender)') == 'True'


def test_no_module_is_ever_loaded_twice():
    assert (
        run_in_a_fresh_interpreter(
            """
            import sys
            import awx.main.utils.common
            aliased = [name for name in sys.modules if name.startswith('awx.')]
            print(bool(aliased) and all(sys.modules[name] is sys.modules['ascender' + name[len('awx'):]] for name in aliased))
            """
        )
        == 'True'
    )


def test_something_that_does_not_exist_still_raises():
    assert (
        run_in_a_fresh_interpreter(
            """
            try:
                import awx.no_such_module
            except ModuleNotFoundError as e:
                print('no_such_module' in str(e))
            """
        )
        == 'True'
    )


@pytest.mark.parametrize('name', ['ascender', 'awx'])
def test_the_credential_plugin_entry_points_resolve_under_either_name(name):
    """Third party plugins name a module path in their own metadata, which this
    repository cannot rewrite."""
    assert (
        run_in_a_fresh_interpreter(
            f"""
            from {name}.main.credential_plugins.conjur import conjur_plugin
            print(conjur_plugin is not None)
            """
        )
        == 'True'
    )


def test_a_dispatcher_task_path_resolves_under_the_old_name():
    """Task names travel as strings and a worker imports the path it was sent,
    so a message queued before an upgrade still has to resolve after it.
    """
    assert (
        run_in_a_fresh_interpreter(
            """
            import importlib, os, django
            os.environ['DJANGO_SETTINGS_MODULE'] = 'ascender.main.tests.settings_for_test'
            django.setup()
            module = importlib.import_module('awx.main.tasks.system')
            print(hasattr(module, 'delete_inventory'))
            """
        )
        == 'True'
    )
