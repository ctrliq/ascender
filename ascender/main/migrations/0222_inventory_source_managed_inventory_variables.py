from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('main', '0221_matrix_notification_type'),
    ]

    operations = [
        migrations.AddField(
            model_name='inventorysource',
            name='managed_inventory_variables',
            field=models.JSONField(
                blank=True,
                default=dict,
                editable=False,
                help_text='Inventory variable names written by the last sync of this source, mapped to a hash of the value written.',
            ),
        ),
    ]
