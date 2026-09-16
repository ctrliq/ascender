# Copyright (c) 2026 Ascender
# All Rights Reserved.
"""
Every middleware in the chain can be asked to handle an async request.

Django runs the whole chain synchronously the moment one middleware says it
cannot do otherwise: it wraps everything below that point, the view included,
in sync_to_async, which is a thread hop per request. One sync only middleware
near the top therefore costs as much as twenty.

Nothing in the platform serves ASGI yet, so this buys nothing today. What it
does is keep the chain ready, and make a new sync only middleware a decision
somebody takes on purpose rather than by leaving an attribute off a class.
"""

import asyncio

import pytest
from django.conf import settings
from django.utils.module_loading import import_string


def middleware_classes():
    return [(path, import_string(path)) for path in settings.MIDDLEWARE]


@pytest.mark.parametrize('path,cls', middleware_classes(), ids=lambda v: v if isinstance(v, str) else '')
def test_every_middleware_is_async_capable(path, cls):
    assert getattr(cls, 'async_capable', False), (
        f'{path} is sync only, so Django runs every middleware after it, and the view, '
        'through sync_to_async. Set async_capable and give it an __acall__, or say here why it cannot.'
    )


@pytest.mark.parametrize('path,cls', middleware_classes(), ids=lambda v: v if isinstance(v, str) else '')
def test_every_middleware_still_handles_a_sync_request(path, cls):
    """Async capable must not mean async only: Django still calls the chain synchronously."""
    assert getattr(cls, 'sync_capable', True), f'{path} is async only, and the sync path still runs it'


def test_the_traceback_middleware_adapts_to_the_response_it_is_given():
    from ascender.dab.lib.middleware.logging.log_request import LogTracebackMiddleware

    sync = LogTracebackMiddleware(lambda request: 'sync response')
    assert not asyncio.iscoroutinefunction(sync)
    assert sync('a request') == 'sync response'
    assert LogTracebackMiddleware.transactions == {}

    async def get_response(request):
        return 'async response'

    a_sync = LogTracebackMiddleware(get_response)
    assert asyncio.iscoroutinefunction(a_sync)
    assert asyncio.run(a_sync('a request')) == 'async response'
    assert LogTracebackMiddleware.transactions == {}


def test_a_request_in_flight_is_visible_to_the_signal_handler():
    from ascender.dab.lib.middleware.logging.log_request import LogTracebackMiddleware

    seen = {}

    async def get_response(request):
        seen.update(LogTracebackMiddleware.transactions)
        return 'done'

    asyncio.run(LogTracebackMiddleware(get_response)('the request'))

    assert list(seen.values()) == ['the request']
    assert LogTracebackMiddleware.transactions == {}
