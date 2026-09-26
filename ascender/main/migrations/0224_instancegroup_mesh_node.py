import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('main', '0223_backfill_finished_on_terminal_jobs'),
    ]

    operations = [
        migrations.AddField(
            model_name='instancegroup',
            name='mesh_node',
            field=models.ForeignKey(
                blank=True,
                default=None,
                help_text="Hop node of the receptor mesh that runs this container group's pods. Leave empty to use this cluster's API.",
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='remote_container_groups',
                to='main.instance',
            ),
        ),
    ]
