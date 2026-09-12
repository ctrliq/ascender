from django.db import migrations

from awx.conf.migrations import _rename_setting


def rename_tower_url_base(apps, schema_editor):
    _rename_setting.rename_setting(apps, schema_editor, old_key='TOWER_URL_BASE', new_key='ASCENDER_URL_BASE')


class Migration(migrations.Migration):
    dependencies = [('conf', '0010_change_to_JSONField')]

    operations = [migrations.RunPython(rename_tower_url_base, migrations.RunPython.noop)]
