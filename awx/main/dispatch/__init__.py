"""
The task dispatcher, which is ours to keep rather than ours by accident.

Where it came from. This is AWX's dispatcher as it stood at the 24.0.0 sync in
March 2024, the last one this fork took. AWX has since pulled the same code out
into a package of its own, dispatcherd, first released in March 2025, so the
upstream of these modules no longer lives in AWX at all.

What that package is now. Around 5,800 lines across 26 modules against the
1,800 here, and the difference is nearly all generalisation: the connection to
PostgreSQL is a broker behind an interface, with a socket broker beside it; the
producers that decide when work runs are separate objects; settings come from
its own config layer rather than Django's; and it ships a testing package with
in memory and error only brokers.

What is here instead. The same job, wired straight to this application: the
queue name is CLUSTER_HOST_ID, the pool and the reaper read our Instance and
UnifiedJob models, and the settings are Django settings. None of that is a
missing feature, it is the shape you get when the code has exactly one caller.

Adopting dispatcherd would mean writing our Django specific pieces as its
brokers and producers and letting it own the loop. That is a real project, and
until somebody chooses it, this copy is a deliberate fork rather than a
forgotten one: fixes and features here are ours to write, and worth checking
against dispatcherd first, since it has had two years of them.
"""

import os
import psycopg

from contextlib import contextmanager

from awx.settings.application_name import get_application_name

from django.conf import settings
from django.db import connection as pg_connection


def get_local_queuename():
    return settings.CLUSTER_HOST_ID


def get_task_queuename():
    if os.getenv('AWX_COMPONENT') != 'web':
        return settings.CLUSTER_HOST_ID

    from awx.main.models.ha import Instance

    random_task_instance = (
        Instance.objects.filter(
            node_type__in=(Instance.Types.CONTROL, Instance.Types.HYBRID),
            node_state=Instance.States.READY,
            enabled=True,
        )
        .only('hostname')
        .order_by('?')
        .first()
    )

    if random_task_instance is None:
        raise ValueError('No task instances are READY and Enabled.')

    return random_task_instance.hostname


class PubSub(object):
    def __init__(self, conn, select_timeout=None):
        self.conn = conn
        if select_timeout is None:
            self.select_timeout = 5
        else:
            self.select_timeout = select_timeout

    def listen(self, channel):
        with self.conn.cursor() as cur:
            cur.execute('LISTEN "%s";' % channel)

    def unlisten(self, channel):
        with self.conn.cursor() as cur:
            cur.execute('UNLISTEN "%s";' % channel)

    def notify(self, channel, payload):
        with self.conn.cursor() as cur:
            cur.execute('SELECT pg_notify(%s, %s);', (channel, payload))

    def events(self, yield_timeouts=False):
        if not self.conn.autocommit:
            raise RuntimeError('Listening for events can only be done in autocommit mode')

        while True:
            got_events = False
            # notifies() first drains the connection's notification backlog
            # (notifications psycopg consumed while other queries ran, which
            # a socket select would never wake for), then waits up to timeout
            # for more; stop_after=1 returns after the first new batch so
            # select_timeout, which callers adjust in-loop, is re-read
            # between batches
            for notification in self.conn.notifies(timeout=self.select_timeout, stop_after=1):
                got_events = True
                yield notification
            if yield_timeouts and not got_events:
                yield None

    def close(self):
        self.conn.close()


def create_listener_connection():
    conf = settings.DATABASES['default'].copy()
    conf['OPTIONS'] = conf.get('OPTIONS', {}).copy()
    # Modify the application name to distinguish from other connections the process might use
    conf['OPTIONS']['application_name'] = get_application_name(settings.CLUSTER_HOST_ID, function='listener')

    # Apply overrides specifically for the listener connection
    for k, v in settings.LISTENER_DATABASES.get('default', {}).items():
        conf[k] = v
    for k, v in settings.LISTENER_DATABASES.get('default', {}).get('OPTIONS', {}).items():
        conf['OPTIONS'][k] = v

    # Allow password-less authentication
    if 'PASSWORD' in conf:
        conf['OPTIONS']['password'] = conf.pop('PASSWORD')

    connection_data = f"dbname={conf['NAME']} host={conf['HOST']} user={conf['USER']} port={conf['PORT']}"
    return psycopg.connect(connection_data, autocommit=True, **conf['OPTIONS'])


@contextmanager
def pg_bus_conn(new_connection=False, select_timeout=None):
    '''
    Any listeners probably want to establish a new database connection,
    separate from the Django connection used for queries, because that will prevent
    losing connection to the channel whenever a .close() happens.

    Any publishers probably want to use the existing connection
    so that messages follow postgres transaction rules
    https://www.postgresql.org/docs/current/sql-notify.html
    '''

    if new_connection:
        conn = create_listener_connection()
    else:
        if pg_connection.connection is None:
            pg_connection.connect()
        if pg_connection.connection is None:
            raise RuntimeError('Unexpectedly could not connect to postgres for pg_notify actions')
        conn = pg_connection.connection

    pubsub = PubSub(conn, select_timeout=select_timeout)
    yield pubsub
    if new_connection:
        conn.close()
