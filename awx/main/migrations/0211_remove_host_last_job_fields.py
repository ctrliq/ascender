from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ('main', '0210_notification_templates_changed'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='host',
            name='last_job',
        ),
        migrations.RemoveField(
            model_name='host',
            name='last_job_host_summary',
        ),
    ]
