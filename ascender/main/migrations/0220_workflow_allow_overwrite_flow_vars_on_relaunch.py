from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('main', '0219_source_project_update_set_null'),
    ]

    operations = [
        migrations.AddField(
            model_name='workflowjob',
            name='allow_overwrite_flow_vars_on_relaunch',
            field=models.BooleanField(
                default=False,
                help_text='Allow a relaunch from failed nodes to be given variables that overwrite the ones carried over from the original run.',
            ),
        ),
        migrations.AddField(
            model_name='workflowjobtemplate',
            name='allow_overwrite_flow_vars_on_relaunch',
            field=models.BooleanField(
                default=False,
                help_text='Allow a relaunch from failed nodes to be given variables that overwrite the ones carried over from the original run.',
            ),
        ),
    ]
