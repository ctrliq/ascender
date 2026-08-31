from django.db import migrations


def cleanup_dab_rbac_leftovers(apps, schema_editor):
    """Remove leftovers of the django-ansible-base RBAC app.

    Before django-ansible-base was vendored (awx/dab), its settings logic
    auto-injected the 'ansible_base.rbac' app (label 'dab_rbac') into
    INSTALLED_APPS whenever jwt_consumer was installed, so existing databases
    carry its applied migrations and empty tables. The app was never used by
    AWX (which has its own Role model) and is not vendored, so drop what it
    left behind. Fresh installs have none of it; everything here is a no-op
    for them.
    """
    connection = schema_editor.connection
    quote = connection.ops.quote_name

    existing = set(connection.introspection.table_names())
    dab_rbac_tables = sorted(t for t in existing if t.startswith('dab_rbac_'))
    for table in dab_rbac_tables:
        if connection.vendor == 'postgresql':
            schema_editor.execute('DROP TABLE IF EXISTS %s CASCADE' % quote(table))
        else:
            schema_editor.execute('DROP TABLE IF EXISTS %s' % quote(table))

    # Deleting the content types cascades to any auth_permission rows for them.
    ContentType = apps.get_model('contenttypes', 'ContentType')
    ContentType.objects.filter(app_label='dab_rbac').delete()

    with connection.cursor() as cursor:
        cursor.execute("DELETE FROM django_migrations WHERE app = 'dab_rbac'")


class Migration(migrations.Migration):

    dependencies = [
        ('main', '0208_alter_job_skip_tags_alter_jobtemplate_skip_tags'),
    ]

    operations = [
        migrations.RunPython(cleanup_dab_rbac_leftovers, migrations.RunPython.noop),
    ]
