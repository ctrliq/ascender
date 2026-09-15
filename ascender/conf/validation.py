# Copyright (c) 2026 Ctrl IQ, Inc.
# All Rights Reserved.
"""
Checking the settings registry against itself.

Every registered setting declares the kind of value it accepts, as a field, and
carries a default. Nothing asked whether the two agree. A default that its own
field rejects is not a startup error: it surfaces when somebody reads that
setting through the API, which is a long way from the line that caused it.
"""

from rest_framework.fields import empty

from ascender.conf import settings_registry


def invalid_setting_defaults():
    """
    Run every registered setting's default through the field it is registered
    with, and return one message per setting whose own field refuses it.

    Settings whose field declares ``depends_on`` are left out: those fields judge
    a value against what sibling settings hold at the time, so their default is
    only meaningful together with the rest of the configuration rather than on
    its own.

    Returns:
        list[str]: a message per disagreement, empty when every default is
            acceptable to its field.
    """
    problems = []
    for setting in sorted(settings_registry.get_registered_settings()):
        try:
            field = settings_registry.get_setting_field(setting)
        except Exception as exc:
            problems.append('{}: could not build its field: {}: {}'.format(setting, type(exc).__name__, exc))
            continue

        if getattr(field, 'depends_on', None):
            # This field judges a value against what other settings currently
            # hold, so its default is only right or wrong alongside them.
            # AUTH_LDAP_GROUP_TYPE_PARAMS is the example: its keys have to be
            # arguments of whatever class AUTH_LDAP_GROUP_TYPE names.
            continue

        default = getattr(field, 'default', empty)
        if callable(default):
            # A callable default is resolved per read, so check what it produces.
            try:
                default = default()
            except Exception as exc:
                problems.append('{}: its callable default raised {}: {}'.format(setting, type(exc).__name__, exc))
                continue
        if default is empty or default is None:
            # No default to disagree with. None is how a setting says "unset".
            continue

        try:
            field.run_validation(default)
        except Exception as exc:
            problems.append('{}: {} refuses its own default {!r}: {}'.format(setting, type(field).__name__, default, exc))
    return problems


def unresolvable_settings(package_root):
    """
    Which settings the code reads by name that resolve to nothing.

    A ``settings.SOME_NAME`` that no settings file defines and no registration
    carries raises AttributeError the first time that line runs, which is the
    same shape of fault as a view calling a method its model does not have.
    Nothing checked for it, so nothing caught it.

    Args:
        package_root (str): the directory holding the ``awx`` package contents.

    Returns:
        dict[str, list[str]]: setting name to the ``path:line`` sites reading
            it, for the ones that resolve to nothing. Empty when all of them do.
    """
    import ast
    import os

    from django.conf import settings as django_settings

    read = {}
    for dirpath, dirnames, filenames in os.walk(package_root):
        parts = dirpath.split(os.sep)
        if 'tests' in parts or 'migrations' in parts or 'node_modules' in parts or 'ui' in parts:
            continue
        for name in filenames:
            if not name.endswith('.py'):
                continue
            path = os.path.join(dirpath, name)
            try:
                tree = ast.parse(open(path, encoding='utf-8').read())
            except SyntaxError:
                continue
            for node in ast.walk(tree):
                if not isinstance(node, ast.Attribute):
                    continue
                if not (isinstance(node.value, ast.Name) and node.value.id == 'settings'):
                    continue
                if node.attr.isupper() and isinstance(node.ctx, ast.Load):
                    read.setdefault(node.attr, []).append('{}:{}'.format(os.path.relpath(path, package_root), node.lineno))

    missing = {}
    for name, sites in read.items():
        if name in settings_registry.get_registered_settings():
            continue
        if hasattr(django_settings, name):
            continue
        missing[name] = sorted(sites)
    return missing
