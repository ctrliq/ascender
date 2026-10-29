# Copyright (c) 2026 Ctrl IQ, Inc.
# All Rights Reserved.

from django.db import migrations, models

#: What the two dropped backends recorded against a user, and the settings
#: they were configured with.
DROPPED_PROVIDERS = ['radius', 'tacacs+']
DROPPED_SETTINGS = [
    'RADIUS_SERVER',
    'RADIUS_PORT',
    'RADIUS_SECRET',
    'TACACSPLUS_HOST',
    'TACACSPLUS_PORT',
    'TACACSPLUS_SECRET',
    'TACACSPLUS_SESSION_TIMEOUT',
    'TACACSPLUS_AUTH_PROTOCOL',
    'TACACSPLUS_REM_ADDR',
]


def forwards(apps, schema_editor):
    """
    Clear what the two backends left behind.

    The association rows say a user signs in through a backend that no longer
    exists; the settings rows configure servers nothing reads any more. The
    users themselves are left alone: an administrator can give one a password
    and it becomes an ordinary account.

    This step is irreversible. The reverse is a no-op: migrating back past it
    does not restore the deleted association rows or settings, which would
    have to come from a backup.

    Args:
        apps: The historical app registry of the migration state.
        schema_editor: The schema editor running the migration, unused.
    """
    UserEnterpriseAuth = apps.get_model('sso', 'UserEnterpriseAuth')
    UserEnterpriseAuth.objects.filter(provider__in=DROPPED_PROVIDERS).delete()

    Setting = apps.get_model('conf', 'Setting')
    Setting.objects.filter(key__in=DROPPED_SETTINGS).delete()


class Migration(migrations.Migration):
    """
    Drop the RADIUS and TACACS+ backends' data and their provider choices.

    Migrating backwards runs, but only the provider choices come back. The
    data step reverses as a no-op, so the RADIUS and TACACS+ associations and
    settings deleted on the way forward stay deleted.
    """

    dependencies = [
        ('sso', '0003_convert_saml_string_to_list'),
        ('conf', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(forwards, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='userenterpriseauth',
            name='provider',
            field=models.CharField(max_length=32, choices=[('saml', 'SAML')]),
        ),
    ]
