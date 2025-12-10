import pytest
import asyncio

from django.contrib.auth.models import AnonymousUser

from channels.routing import ProtocolTypeRouter
from channels.testing.websocket import WebsocketCommunicator


from awx.main.consumers import WebsocketSecretAuthHelper


@pytest.fixture
def application():
    # code in routing hits the db on import because .. settings cache
    from awx.main.routing import application_func

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
        server.scope['headers'] = [
            (b'secret', websocket_relay_secret.encode('utf-8'))
        ]
        
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
        server.scope['headers'] = [
            (b'secret', wrong_secret.encode('utf-8'))
        ]
        
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
