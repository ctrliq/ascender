from django.db import migrations

from awx.conf.migrations import _rename_setting

# The AWX_ prefix on a setting is the product's former name. Each one keeps its
# stored value under the new key, so a deployment that changed any of these
# through the API finds them changed still.
RENAMED = [
    'ANSIBLE_CALLBACK_PLUGINS',
    'CLEANUP_PATHS',
    'COLLECTIONS_ENABLED',
    'ISOLATION_BASE_PATH',
    'ISOLATION_SHOW_PATHS',
    'MOUNT_ISOLATED_PATHS_ON_K8S',
    'REQUEST_PROFILE',
    'ROLES_ENABLED',
    'RUNNER_KEEPALIVE_SECONDS',
    'SHOW_PLAYBOOK_LINKS',
    'TASK_ENV',
]


def rename_awx_prefixed_settings(apps, schema_editor):
    for suffix in RENAMED:
        _rename_setting.rename_setting(apps, schema_editor, old_key=f'AWX_{suffix}', new_key=f'ASCENDER_{suffix}')


class Migration(migrations.Migration):
    dependencies = [('conf', '0011_rename_tower_url_base')]

    operations = [migrations.RunPython(rename_awx_prefixed_settings, migrations.RunPython.noop)]
