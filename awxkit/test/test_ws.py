# -*- coding: utf-8 -*-
from collections import namedtuple

from unittest.mock import patch
import pytest

from awxkit.ws import WSClient

ParseResult = namedtuple("ParseResult", ["port", "hostname", "secure"])


def test_explicit_hostname():
    client = WSClient("token", "some-hostname", 556, False)
    assert client.port == 556
    assert client.hostname == "some-hostname"
    assert client._use_ssl == False
    assert client.token == "token"


def test_websocket_suffix():
    client = WSClient("token", "hostname", 566, ws_suffix='my-websocket/')
    assert client.suffix == 'my-websocket/'


@pytest.mark.parametrize(
    'url, result',
    [
        ['https://somename:123', ParseResult(123, "somename", True)],
        ['http://othername:456', ParseResult(456, "othername", False)],
        ['http://othername', ParseResult(80, "othername", False)],
        ['https://othername', ParseResult(443, "othername", True)],
    ],
)
def test_urlparsing(url, result):
    with patch("awxkit.ws.config") as mock_config:
        mock_config.base_url = url

        client = WSClient("token")
        assert client.port == result.port
        assert client.hostname == result.hostname
        assert client._use_ssl == result.secure


def test_callbacks_follow_websocket_client_1x_convention(caplog):
    """websocket-client 1.x always invokes WebSocketApp callbacks with the app
    as the first argument; these calls mirror exactly how run_forever fires
    them and fail if the signatures regress to the 0.x style."""
    client = WSClient("token", "hostname", 566, False)
    app = client.ws

    client._on_open(app)
    assert client._ws_connected_flag.is_set()

    client._on_message(app, '{"group_name": "jobs", "status": "successful"}')
    assert client._recv(wait=True, timeout=1) == {"group_name": "jobs", "status": "successful"}

    import logging

    with caplog.at_level(logging.INFO, logger="awxkit.ws"):
        client._on_error(app, Exception("boom"))
    assert "boom" in caplog.text

    client._on_close(app, 1000, "normal closure")
    assert client._ws_closed


def test_unsubscribe_ack_sets_event():
    client = WSClient("token", "hostname", 566, False)
    client._on_message(client.ws, '{"groups_current": {}}')
    assert client._pending_unsubscribe.is_set()

