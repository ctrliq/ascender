import asyncio
import os
import re

import pytest

from django.contrib.auth.models import AnonymousUser

from channels.routing import ProtocolTypeRouter
from channels.testing.websocket import WebsocketCommunicator

from django.test import AsyncRequestFactory

import ascender
from ascender.main.consumers import WebsocketSecretAuthHelper
from ascender.main.middleware import URLModificationMiddleware


@pytest.fixture
def application():
    # code in routing hits the db on import because .. settings cache
    from ascender.main.routing import application_func

    yield application_func(ProtocolTypeRouter)


@pytest.fixture
def websocket_server_generator(application):
    def fn(endpoint):
        return WebsocketCommunicator(application, endpoint)

    return fn


@pytest.mark.asyncio
@pytest.mark.django_db
class TestWebsocketRelay:
    @pytest.fixture
    def websocket_relay_secret_generator(self, settings):
        def fn(secret, set_broadcast_websocket_secret=False):
            secret_backup = settings.BROADCAST_WEBSOCKET_SECRET
            settings.BROADCAST_WEBSOCKET_SECRET = secret
            secret_value = WebsocketSecretAuthHelper.construct_secret()
            if set_broadcast_websocket_secret is False:
                settings.BROADCAST_WEBSOCKET_SECRET = secret_backup
            return secret_value

        return fn

    @pytest.fixture
    def websocket_relay_secret(self, settings, websocket_relay_secret_generator):
        return websocket_relay_secret_generator('foobar', set_broadcast_websocket_secret=True)

    async def test_authorized(self, websocket_server_generator, websocket_relay_secret):
        server = websocket_server_generator('/websocket/relay/')

        # Set headers in the correct format: list of tuples with byte keys and values
        server.scope['headers'] = [(b'secret', websocket_relay_secret.encode('utf-8'))]

        # Add explicit timeout to prevent hanging
        try:
            connected, _ = await asyncio.wait_for(server.connect(), timeout=10.0)
            assert connected is True
        except asyncio.TimeoutError:
            pytest.fail("WebSocket connection timed out after 10 seconds")

    async def test_not_authorized(self, websocket_server_generator):
        server = websocket_server_generator('/websocket/relay/')

        try:
            connected, _ = await asyncio.wait_for(server.connect(), timeout=10.0)
            assert connected is False, "Connection to the relay websocket without auth. We expected the client to be denied."
        except asyncio.TimeoutError:
            pytest.fail("WebSocket connection timed out after 10 seconds")

    async def test_wrong_secret(self, websocket_server_generator, websocket_relay_secret_generator):
        server = websocket_server_generator('/websocket/relay/')

        wrong_secret = websocket_relay_secret_generator('wrongsecret', set_broadcast_websocket_secret=False)
        server.scope['headers'] = [(b'secret', wrong_secret.encode('utf-8'))]

        try:
            connected, _ = await asyncio.wait_for(server.connect(), timeout=10.0)
            assert connected is False
        except asyncio.TimeoutError:
            pytest.fail("WebSocket connection timed out after 10 seconds")


@pytest.mark.asyncio
@pytest.mark.django_db
class TestWebsocketEventConsumer:
    async def test_unauthorized_anonymous(self, websocket_server_generator):
        server = websocket_server_generator('/websocket/')

        server.scope['user'] = AnonymousUser()

        try:
            connected, _ = await asyncio.wait_for(server.connect(), timeout=10.0)
            assert connected is False, "Anonymous user should NOT be allowed to login."
        except asyncio.TimeoutError:
            pytest.fail("WebSocket connection timed out after 10 seconds")

    @pytest.mark.skip(reason="Ran out of coding time.")
    async def test_authorized(self, websocket_server_generator, application, admin):
        server = websocket_server_generator('/websocket/')

        """
        I ran out of time. Here is what I was thinking ...
        Inject a valid session into the cookies in the header

        server.scope['headers'] = (
            (b'cookie', ...),
        )
        """
        connected, _ = await server.connect()
        assert connected is True, "User should be allowed in via cookies auth via a session key in the cookies"


@pytest.mark.django_db
def test_the_application_answers_http_as_well_as_websockets(application):
    # Channels 2 supplied an http application when the mapping left it out.
    # Channels 4 raises "No application configured for scope type 'http'", so
    # without one the ASGI application serves websockets only and a second
    # server has to exist for the API.
    assert set(application.application_mapping) == {'http', 'websocket'}


@pytest.mark.django_db
def test_the_named_url_middleware_works_on_an_asgi_request(mocker):
    # This is the line that used to end the request under an ASGI server:
    # ASGIRequest carries META and no environ, so writing the rewrite marker to
    # environ raised AttributeError before the response was ever built.
    request = AsyncRequestFactory().get('/api/v2/job_templates/some-name/')
    assert not hasattr(request, 'environ'), 'AsyncRequestFactory should build an ASGIRequest'
    middleware = URLModificationMiddleware(lambda r: None)
    mocker.patch.object(URLModificationMiddleware, '_convert_named_url', return_value='/api/v2/job_templates/42/')

    middleware.process_request(request)

    assert request.META['ascender.named_url_rewritten'] == '/api/v2/job_templates/some-name/'
    assert request.path_info == '/api/v2/job_templates/42/'


def test_no_view_reads_the_wsgi_environ():
    # request.environ exists on WSGIRequest and not on ASGIRequest, while
    # request.META is the same dict under WSGI and is built from the scope under
    # ASGI. Reading environ is what made the API 500 behind an ASGI server, so
    # this keeps it from coming back.
    package = os.path.dirname(os.path.abspath(ascender.__file__))
    offenders = []
    for dirpath, dirnames, filenames in os.walk(package):
        if 'tests' in dirpath.split(os.sep) or 'node_modules' in dirpath:
            continue
        for name in filenames:
            if not name.endswith('.py'):
                continue
            path = os.path.join(dirpath, name)
            for lineno, line in enumerate(open(path, encoding='utf-8'), 1):
                if re.search(r'(?<!os)\.environ\b', line) and 'os.environ' not in line:
                    offenders.append('{}:{}: {}'.format(os.path.relpath(path, package), lineno, line.strip()))
    assert offenders == [], 'use request.META, which works under both servers:\n' + '\n'.join(offenders)
