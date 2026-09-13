# Copyright (c) 2026 Ctrl IQ, Inc.
# All Rights Reserved.
"""
Where the logs go, which is half of one process per container.

AWX_LOGGING_MODE decides it: 'file' writes to /var/log/tower, which is what a
VM install wants, and 'stdout' lets the container runtime collect them. The
images set stdout, and these hold the settings to that so a handler added later
cannot quietly start writing a file nobody reads inside a container.
"""

import importlib
import os
import sys

import pytest


def build_logging(mode):
    """Load the settings under one AWX_LOGGING_MODE and hand back its LOGGING."""
    before = os.environ.get('AWX_LOGGING_MODE')
    os.environ['AWX_LOGGING_MODE'] = mode
    try:
        module = importlib.import_module('awx.settings.defaults')
        importlib.reload(module)
        return module.LOGGING
    finally:
        if before is None:
            os.environ.pop('AWX_LOGGING_MODE', None)
        else:
            os.environ['AWX_LOGGING_MODE'] = before
        importlib.reload(sys.modules['awx.settings.defaults'])


def test_the_container_mode_writes_no_files():
    logging_config = build_logging('stdout')

    writing = {name: handler['filename'] for name, handler in logging_config['handlers'].items() if handler.get('filename')}

    assert writing == {}, 'these still write a file under stdout logging: {}'.format(writing)


def test_the_vm_mode_still_writes_them():
    # The other half of the same switch: a VM install has somewhere to put logs
    # and no runtime collecting stdout, so this must keep working.
    logging_config = build_logging('file')

    writing = [name for name, handler in logging_config['handlers'].items() if handler.get('filename')]

    assert len(writing) >= 9, 'file logging should still write the per process logs, got {}'.format(writing)


def test_the_console_is_open_in_the_container_and_gated_on_a_vm():
    # Under file logging the console is gated behind debug, so a VM does not get
    # every line twice. Under stdout it is the only way out, so it must not be.
    container = build_logging('stdout')['handlers']['console']
    vm = build_logging('file')['handlers']['console']

    assert 'require_debug_true_or_test' not in container['filters']
    assert 'require_debug_true_or_test' in vm['filters']


def test_the_mode_is_checked_rather_than_assumed():
    with pytest.raises(Exception, match="AWX_LOGGING_MODE must be 'file' or 'stdout'"):
        build_logging('syslog')
