from django.db import migrations

from awx.main.models import CredentialType
from awx.main.utils.common import set_current_apps


def setup_tower_managed_defaults(apps, schema_editor):
    set_current_apps(apps)
    CredentialType.setup_tower_managed_defaults(apps)


class Migration(migrations.Migration):
    dependencies = [
        ('main', '0187_hop_nodes'),
    ]

    operations = [
        migrations.RunPython(setup_tower_managed_defaults),
    ]
