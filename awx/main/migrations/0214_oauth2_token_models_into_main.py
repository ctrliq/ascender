import hashlib

from django.db import migrations


def create_tables_and_move_rows(apps, schema_editor):
    """Build the two token tables on databases that predate them, and move the rows.

    The models themselves are declared back in 0025, so by the time this runs
    Django's state already has them. What differs is the database: an install
    created before the swap has oauth2_provider_refreshtoken and
    oauth2_provider_idtoken instead, holding whatever tokens are live, and the
    access token's two foreign keys still point at those tables.

    A fresh install has none of that. 0025 created the new tables and pointed the
    foreign keys at them, so every step below finds nothing to do and this
    migration is a no-op.
    """
    connection = schema_editor.connection

    def table_columns(table):
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT column_name FROM information_schema.columns
                WHERE table_schema = current_schema() AND table_name = %s
                """,
                [table],
            )
            return {row[0] for row in cursor.fetchall()}

    with connection.cursor() as cursor:
        cursor.execute("""
            SELECT table_name FROM information_schema.tables
            WHERE table_schema = current_schema()
              AND table_name IN (
                'main_oauth2refreshtoken', 'main_oauth2idtoken',
                'oauth2_provider_refreshtoken', 'oauth2_provider_idtoken'
              )
            """)
        present = {row[0] for row in cursor.fetchall()}

    # Fresh install: 0025 already created both tables and nothing needs moving.
    if 'oauth2_provider_refreshtoken' not in present and 'oauth2_provider_idtoken' not in present:
        return

    for model_name, old_table in (('OAuth2IDToken', 'oauth2_provider_idtoken'), ('OAuth2RefreshToken', 'oauth2_provider_refreshtoken')):
        model = apps.get_model('main', model_name)
        new_table = model._meta.db_table
        if new_table not in present:
            schema_editor.create_model(model)
        if old_table not in present:
            continue

        # Copy on the intersection of the columns. The old table can be short of
        # several, because django-oauth-toolkit keeps adding fields to its
        # refresh token and those migrations operate on a model that is swapped
        # out by the time this runs, so Django skips them and the columns never
        # appear on the old table. Anything required and absent is filled from
        # the field's own default rather than chased one release at a time.
        old_columns = table_columns(old_table)
        new_columns = table_columns(new_table)
        shared = sorted(old_columns & new_columns)
        if not shared:
            continue

        defaults = {}
        for field in model._meta.local_fields:
            if field.column in shared or field.column not in new_columns or field.null:
                continue
            defaults[field.column] = field.get_default()

        columns = ', '.join('"%s"' % name for name in shared + sorted(defaults))
        placeholders = ', '.join(['%s'] * len(defaults))
        select = ', '.join('"%s"' % name for name in shared)
        if placeholders:
            select = f'{select}, {placeholders}'
        params = [defaults[name] for name in sorted(defaults)]

        with connection.cursor() as cursor:
            cursor.execute(f'INSERT INTO "{new_table}" ({columns}) SELECT {select} FROM "{old_table}"', params)  # noqa: S608
            cursor.execute(f"""SELECT setval(pg_get_serial_sequence('"{new_table}"', 'id'), COALESCE((SELECT MAX(id) FROM "{new_table}"), 1))""")

            # token_checksum has no meaningful default: it is a sha256 of the raw
            # token, and the unique constraint is on (token_checksum, revoked), so
            # every row filled from the default would collide. Compute it the way
            # DOT's own backfill and RefreshToken.token_checksum do. pgcrypto is
            # not guaranteed to be installed, so this is done in Python.
            if 'token_checksum' in defaults:
                cursor.execute(f'SELECT id, token FROM "{new_table}"')  # noqa: S608
                for row_id, token in cursor.fetchall():
                    checksum = hashlib.sha256((token or '').encode('utf-8')).hexdigest()
                    cursor.execute(f'UPDATE "{new_table}" SET token_checksum = %s WHERE id = %s', [checksum, row_id])  # noqa: S608


def repoint_access_token_foreign_keys(apps, schema_editor):
    """Move main_oauth2accesstoken's two foreign keys onto the new tables.

    Django emits nothing for this. Both fields are declared against the swappable
    setting, so from its point of view the field never changed and no AlterField
    is generated, while the constraint in the database still names the
    oauth2_provider table. The constraints are therefore rebuilt by hand, and the
    old tables dropped once nothing references them.
    """
    connection = schema_editor.connection
    moves = (
        ('source_refresh_token_id', 'oauth2_provider_refreshtoken', 'main_oauth2refreshtoken'),
        ('id_token_id', 'oauth2_provider_idtoken', 'main_oauth2idtoken'),
    )

    for column, old_table, new_table in moves:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT tc.constraint_name
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                  ON tc.constraint_name = kcu.constraint_name
                 AND tc.table_schema = kcu.table_schema
                JOIN information_schema.constraint_column_usage ccu
                  ON tc.constraint_name = ccu.constraint_name
                 AND tc.table_schema = ccu.table_schema
                WHERE tc.constraint_type = 'FOREIGN KEY'
                  AND tc.table_schema = current_schema()
                  AND tc.table_name = 'main_oauth2accesstoken'
                  AND kcu.column_name = %s
                  AND ccu.table_name = %s
                """,
                [column, old_table],
            )
            stale = [row[0] for row in cursor.fetchall()]
            for name in stale:
                cursor.execute(f'ALTER TABLE "main_oauth2accesstoken" DROP CONSTRAINT "{name}"')
            if stale:
                cursor.execute(
                    f'ALTER TABLE "main_oauth2accesstoken" ADD CONSTRAINT "{column}_refs_{new_table}" '
                    f'FOREIGN KEY ("{column}") REFERENCES "{new_table}" ("id") DEFERRABLE INITIALLY DEFERRED'
                )
            cursor.execute(f'DROP TABLE IF EXISTS "{old_table}" CASCADE')


class Migration(migrations.Migration):
    """Carry existing databases over to the token models declared in 0025.

    Nothing here touches migration state: 0025 owns that. This migration only
    reconciles the database an older install actually has with the one those
    models describe, and does nothing at all on a fresh install.
    """

    dependencies = [
        ('main', '0213_oauth2accesstoken_resource_and_more'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunPython(create_tables_and_move_rows, migrations.RunPython.noop),
                migrations.RunPython(repoint_access_token_foreign_keys, migrations.RunPython.noop),
            ],
            state_operations=[],
        ),
    ]
