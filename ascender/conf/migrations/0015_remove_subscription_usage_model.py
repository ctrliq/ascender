from django.db import migrations


def remove_subscription_usage_model(apps, schema_editor):
    """Its only effect was hiding Host Metrics behind a subscription concept."""
    Setting = apps.get_model('conf', 'Setting')
    Setting.objects.filter(key='SUBSCRIPTION_USAGE_MODEL').delete()


class Migration(migrations.Migration):
    dependencies = [('conf', '0014_remove_subscription_settings')]

    operations = [migrations.RunPython(remove_subscription_usage_model, migrations.RunPython.noop)]
