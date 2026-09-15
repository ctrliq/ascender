from django.db import migrations

from ascender.conf.migrations import _rename_setting


def rename_log_aggregator_tower_uuid(apps, schema_editor):
    _rename_setting.rename_setting(apps, schema_editor, old_key='LOG_AGGREGATOR_TOWER_UUID', new_key='LOG_AGGREGATOR_ASCENDER_UUID')


class Migration(migrations.Migration):
    dependencies = [('conf', '0012_rename_awx_prefixed_settings')]

    operations = [migrations.RunPython(rename_log_aggregator_tower_uuid, migrations.RunPython.noop)]
