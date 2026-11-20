from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('main', '0233_job_monitor_lease'),
    ]

    operations = [
        migrations.AddField(
            model_name='inventory',
            name='variables_from_sources_only',
            field=models.BooleanField(
                default=False,
                help_text='If enabled, each sync of an inventory source removes the inventory variables that no source of this inventory provides, including variables added by hand or left over from older syncs. Nothing is removed until every source of the inventory has synced at least once.',
            ),
        ),
        migrations.AddField(
            model_name='inventorysource',
            name='managed_inventory_variables_recorded',
            field=models.BooleanField(
                default=False,
                editable=False,
                help_text='Whether a sync of this source has recorded managed_inventory_variables.',
            ),
        ),
    ]
