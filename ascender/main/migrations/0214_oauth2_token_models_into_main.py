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

        # token_checksum is the exception to filling from a default. It is a
        # sha256 of the raw token and the unique key is (token_checksum,
        # revoked), so a shared default collides as soon as two rows carry the
        # same revoked timestamp, which is exactly what DOT's revoke_family()
        # produces: it stamps a whole family in one update. So it is computed in
        # the INSERT itself rather than backfilled afterwards, leaving no window
        # where two rows hold the same placeholder. sha256() is core PostgreSQL,
        # available since 11, so this needs no pgcrypto, and it agrees with
        # hashlib.sha256 and with DOT's own backfill.
        computed = {}
        if 'token_checksum' in defaults and 'token' in shared:
            del defaults['token_checksum']
            computed['token_checksum'] = """encode(sha256(convert_to("token", 'UTF8')), 'hex')"""

        insert_columns = shared + sorted(defaults) + sorted(computed)
        columns = ', '.join('"%s"' % name for name in insert_columns)
        select_parts = ['"%s"' % name for name in shared]
        select_parts += ['%s'] * len(defaults)
        select_parts += [computed[name] for name in sorted(computed)]
        params = [defaults[name] for name in sorted(defaults)]

        with connection.cursor() as cursor:
            cursor.execute(
                f'INSERT INTO "{new_table}" ({columns}) SELECT {", ".join(select_parts)} FROM "{old_table}"',  # noqa: S608
                params,
            )
            cursor.execute(f"""SELECT setval(pg_get_serial_sequence('"{new_table}"', 'id'), COALESCE((SELECT MAX(id) FROM "{new_table}"), 1))""")


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
