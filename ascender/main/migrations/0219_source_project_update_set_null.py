import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('main', '0218_profile_theme'),
    ]

    operations = [
        migrations.AlterField(
            model_name='inventoryupdate',
            name='source_project_update',
            field=models.ForeignKey(
                blank=True,
                default=None,
                help_text='Inventory files from this Project Update were used for the inventory update.',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='scm_inventory_updates',
                to='main.projectupdate',
            ),
        ),
    ]
