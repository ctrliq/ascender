# Copyright (c) 2026 Ascender
# All Rights Reserved.
"""Settings read from the environment, under either name.

A handful of settings are read from the environment rather than from a settings
file, so the alias table in production.py cannot reach them: that table runs
after the settings modules have loaded, and two of these decide which settings
file loads at all.

The Ascender name wins, the AWX one still answers, and the AWX one is what the
image, the installers and anyone's own start script pass today. They move when
it suits them rather than on the day of this change.
"""

import os

ASCENDER = 'ASCENDER_'
FORMER = 'AWX_'


def environment_setting(suffix, default=None):
    """The `ASCENDER_<suffix>` variable if set, else `AWX_<suffix>`, else `default`.

    A name that is set but empty wins over the later one, matching what a plain
    `os.environ.get(name, other)` chain did: exporting an empty value is how a
    deployment says "not this", and treating it as unset would ignore that.
    """
    for prefix in (ASCENDER, FORMER):
        name = prefix + suffix
        if name in os.environ:
            return os.environ[name]
    return default
