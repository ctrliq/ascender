from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('main', '0224_instancegroup_mesh_node'),
    ]

    operations = [
        migrations.AddField(
            model_name='jobtemplate',
            name='prevent_relaunch',
            field=models.BooleanField(
                default=False,
                help_text=(
                    'If enabled, jobs launched from this job template cannot be relaunched, by anyone. '
                    'The template itself can still be launched. Checked at relaunch time, so turning it off '
                    'makes earlier jobs relaunchable again.'
                ),
            ),
        ),
        migrations.AddField(
            model_name='job',
            name='prevent_relaunch',
            field=models.BooleanField(
                default=False,
                editable=False,
                help_text='Set when the job template was deleted while it prevented relaunch, so the orphaned job stays protected.',
            ),
        ),
    ]
