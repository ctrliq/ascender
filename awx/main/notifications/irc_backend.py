# Copyright (c) 2016 Ansible, Inc.
# All Rights Reserved.

"""IRC notification backend.

Speaks enough of RFC 2812 to register, join and send, which is all a
notification needs, so the dependency is the standard library rather than a
client library and the fifteen packages behind it.
"""

import logging
import socket
import ssl
import time

from django.utils.encoding import smart_str
from django.utils.translation import gettext_lazy as _

from awx.main.notifications.base import AWXBaseEmailBackend
from awx.main.notifications.custom_notification_base import CustomNotificationBase

logger = logging.getLogger('awx.main.notifications.irc_backend')

# A line is at most 512 bytes including the trailing CRLF (RFC 2812 section 2.3).
MAX_LINE_LENGTH = 510
# The whole send, registration included, is given the same budget the previous
# implementation gave it.
SEND_TIMEOUT = 60
# Channel names begin with one of these (RFC 2812 section 1.3).
CHANNEL_PREFIXES = ('#', '&', '+', '!')


class IrcBackend(AWXBaseEmailBackend, CustomNotificationBase):
    init_parameters = {
        "server": {"label": "IRC Server Address", "type": "string"},
        "port": {"label": "IRC Server Port", "type": "int"},
        "nickname": {"label": "IRC Nick", "type": "string"},
        "password": {"label": "IRC Server Password", "type": "password"},
        "use_ssl": {"label": "SSL Connection", "type": "bool"},
        "targets": {"label": "Destination Channels or Users", "type": "list"},
    }
    recipient_parameter = "targets"
    sender_parameter = None

    def __init__(self, server, port, nickname, password, use_ssl, fail_silently=False, **kwargs):
        # Django 6.1 deprecated BaseEmailBackend.fail_silently: a subclass that
        # supports it owns the attribute instead of passing it up.
        super(IrcBackend, self).__init__()
        self.fail_silently = fail_silently
        self.server = server
        self.port = port
        self.nickname = nickname
        self.password = password if password != "" else None
        self.use_ssl = use_ssl
        self.connection = None
        self._buffer = b''

    def open(self):
        if self.connection is not None:
            return False
        try:
            self.connection = socket.create_connection((self.server, int(self.port)), timeout=SEND_TIMEOUT)
            if self.use_ssl:
                context = ssl.create_default_context()
                self.connection = context.wrap_socket(self.connection, server_hostname=self.server)
            self._register()
        except (OSError, ssl.SSLError) as e:
            self.connection = None
            logger.error(smart_str(_("Exception connecting to irc server: {}").format(e)))
            if not self.fail_silently:
                raise
            return False
        return True

    def close(self):
        if self.connection is None:
            return
        try:
            self._send_line('QUIT')
        except OSError:
            pass
        finally:
            try:
                self.connection.close()
            except OSError:
                pass
            self.connection = None
            self._buffer = b''

    def _send_line(self, line):
        payload = line.encode('utf-8', errors='replace')[:MAX_LINE_LENGTH]
        self.connection.sendall(payload + b'\r\n')

    def _read_line(self, deadline):
        """Return the next line from the server, or None once the deadline passes.

        PING is answered here rather than by the caller, since a server that
        gets no PONG during registration drops the connection.
        """
        while True:
            if b'\r\n' in self._buffer:
                line, self._buffer = self._buffer.split(b'\r\n', 1)
                text = line.decode('utf-8', errors='replace')
                if text.startswith('PING'):
                    self._send_line('PONG' + text[4:])
                    continue
                return text
            remaining = deadline - time.time()
            if remaining <= 0:
                return None
            self.connection.settimeout(remaining)
            try:
                chunk = self.connection.recv(4096)
            except (TimeoutError, socket.timeout):
                return None
            if not chunk:
                return None
            self._buffer += chunk

    def _register(self):
        """Send the registration handshake and wait for the welcome reply."""
        if self.password:
            self._send_line('PASS {}'.format(self.password))
        self._send_line('NICK {}'.format(self.nickname))
        self._send_line('USER {0} 0 * :{0}'.format(self.nickname))
        deadline = time.time() + SEND_TIMEOUT
        while True:
            line = self._read_line(deadline)
            if line is None:
                raise OSError('timed out waiting for the irc server to accept the connection')
            parts = line.split()
            if len(parts) > 1 and parts[1] == '001':  # RPL_WELCOME
                return
            if len(parts) > 1 and parts[1].startswith('4'):  # 4xx replies are errors
                raise OSError(line)

    def _join(self, channel, deadline):
        """Join a channel and wait for the server to confirm it."""
        self._send_line('JOIN {}'.format(channel))
        while True:
            line = self._read_line(deadline)
            if line is None:
                return False
            parts = line.split()
            if len(parts) > 1 and parts[1] in ('366', 'JOIN'):  # end of names, or the join echoed back
                return True
            if len(parts) > 1 and parts[1].startswith('4'):
                logger.error(smart_str(_("Could not join {}: {}").format(channel, line)))
                return False

    def send_messages(self, messages):
        if self.connection is None and not self.open():
            return 0
        targets = {}
        for m in messages:
            for r in m.recipients():
                targets.setdefault(r, []).append(m)
        deadline = time.time() + SEND_TIMEOUT
        sent = 0
        try:
            for target, target_messages in targets.items():
                if target.startswith(CHANNEL_PREFIXES) and not self._join(target, deadline):
                    continue
                for m in target_messages:
                    for line in smart_str(m.subject).splitlines() or ['']:
                        self._send_line('PRIVMSG {} :{}'.format(target, line))
                sent += 1
        except OSError as e:
            logger.error(smart_str(_("Exception sending to irc server: {}").format(e)))
            if not self.fail_silently:
                raise
        finally:
            self.close()
        return sent
