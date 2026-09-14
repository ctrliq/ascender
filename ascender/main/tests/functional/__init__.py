from django.db import connection
from django.db.models.signals import post_migrate
from django.apps import apps
from unittest import mock

import contextlib


def app_post_migration(sender, app_config, **kwargs):
    # pytest-django runs with --nomigrations, so the schema is built from the
    # models and anything a migration added outside them is absent. Introspection
    # goes through connection.introspection rather than sqlite_master, which the
    # suite needs now that it runs on PostgreSQL.
    cur = connection.cursor()
    cols = [c.name for c in connection.introspection.get_table_description(cur, 'main_unifiedjob')]
    if 'result_stdout_text' not in cols:
        cur.execute('ALTER TABLE main_unifiedjob ADD COLUMN result_stdout_text TEXT')

    # we also need to make sure that the `_unpartitioned_<event>` tables are present.
    # these tables represent old job event tables that were renamed / preserved during a
    # migration which introduces partitioned event tables
    # https://github.com/ansible/awx/issues/9039
    existing_tables = set(connection.introspection.table_names(cur))
    for tblname in ('main_jobevent', 'main_inventoryupdateevent', 'main_projectupdateevent', 'main_adhoccommandevent', 'main_systemjobevent'):
        if f'_unpartitioned_{tblname}' in existing_tables:
            continue
        if tblname == 'main_adhoccommandevent':
            unique_columns = """host_name character varying(1024) NOT NULL,
                event character varying(100) NOT NULL,
                failed boolean NOT NULL,
                changed boolean NOT NULL,
                host_id integer,
                ad_hoc_command_id integer NOT NULL
                """
        elif tblname == 'main_inventoryupdateevent':
            unique_columns = "inventory_update_id integer NOT NULL"
        elif tblname == 'main_jobevent':
            unique_columns = """event character varying(100) NOT NULL,
                failed boolean NOT NULL,
                changed boolean NOT NULL,
                host_name character varying(1024) NOT NULL,
                play character varying(1024) NOT NULL,
                role character varying(1024) NOT NULL,
                task character varying(1024) NOT NULL,
                host_id integer,
                job_id integer NOT NULL,
                playbook character varying(1024) NOT NULL
                """
        elif tblname == 'main_projectupdateevent':
            unique_columns = """event character varying(100) NOT NULL,
                failed boolean NOT NULL,
                changed boolean NOT NULL,
                playbook character varying(1024) NOT NULL,
                play character varying(1024) NOT NULL,
                role character varying(1024) NOT NULL,
                task character varying(1024) NOT NULL,
                project_update_id integer NOT NULL
                """
        elif tblname == 'main_systemjobevent':
            unique_columns = "system_job_id integer NOT NULL"

        cur.execute(f"""CREATE TABLE _unpartitioned_{tblname} (
            id bigint NOT NULL,
            created timestamp with time zone NOT NULL,
            modified timestamp with time zone NOT NULL,
            event_data text NOT NULL,
            counter integer NOT NULL,
            end_line integer NOT NULL,
            start_line integer NOT NULL,
            stdout text NOT NULL,
            uuid character varying(1024) NOT NULL,
            verbosity integer NOT NULL,
            {unique_columns});
        """)


# Connected for every backend: the hook is idempotent, skipping whatever already
# exists, so it is a no-op against a schema built by real migrations.
post_migrate.connect(app_post_migration, sender=apps.get_app_config('main'))


@contextlib.contextmanager
def immediate_on_commit():
    """
    Context manager executing transaction.on_commit() hooks immediately as
    if the connection was in auto-commit mode.
    """

    def on_commit(func):
        func()

    with mock.patch('django.db.connection.on_commit', side_effect=on_commit) as patch:
        yield patch
