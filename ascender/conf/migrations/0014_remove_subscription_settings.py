from django.db import migrations


# Settings whose register() call is gone, so nothing reads these rows any more.
# Leaving them behind would keep a Red Hat username and password sitting in the
# database with no screen to clear them from.
REMOVED_KEYS = [
    'AUTOMATION_ANALYTICS_GATHER_INTERVAL',
    'AUTOMATION_ANALYTICS_LAST_ENTRIES',
    'AUTOMATION_ANALYTICS_LAST_GATHER',
    'AUTOMATION_ANALYTICS_URL',
    'INSIGHTS_TRACKING_STATE',
    'REDHAT_PASSWORD',
    'REDHAT_USERNAME',
    'SUBSCRIPTIONS_PASSWORD',
    'SUBSCRIPTIONS_USERNAME',
]


def remove_subscription_settings(apps, schema_editor):
    Setting = apps.get_model('conf', 'Setting')
    Setting.objects.filter(key__in=REMOVED_KEYS).delete()


class Migration(migrations.Migration):
    dependencies = [('conf', '0013_rename_log_aggregator_tower_uuid')]

    operations = [migrations.RunPython(remove_subscription_settings, migrations.RunPython.noop)]
