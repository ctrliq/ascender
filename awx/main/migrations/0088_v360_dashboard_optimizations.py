# Generated by Django 2.2.4 on 2019-09-10 21:30

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('main', '0087_v360_update_credential_injector_help_text'),
    ]

    operations = [
        migrations.AlterField(
            model_name='unifiedjob',
            name='finished',
            field=models.DateTimeField(db_index=True, default=None, editable=False, help_text='The date and time the job finished execution.', null=True),
        ),
        migrations.AlterField(
            model_name='unifiedjob',
            name='launch_type',
            field=models.CharField(
                choices=[
                    ('manual', 'Manual'),
                    ('relaunch', 'Relaunch'),
                    ('callback', 'Callback'),
                    ('scheduled', 'Scheduled'),
                    ('dependency', 'Dependency'),
                    ('workflow', 'Workflow'),
                    ('sync', 'Sync'),
                    ('scm', 'SCM Update'),
                ],
                db_index=True,
                default='manual',
                editable=False,
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name='unifiedjob',
            name='created',
            field=models.DateTimeField(db_index=True, default=None, editable=False),
        ),
    ]