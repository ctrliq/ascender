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

from awx.conf import settings_registry


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
