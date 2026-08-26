from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('main', '0208_alter_job_skip_tags_alter_jobtemplate_skip_tags'),
    ]

    operations = [
        migrations.AddField(
            model_name='jobtemplate',
            name='notification_templates_changed',
            field=models.ManyToManyField(blank=True, related_name='%(class)s_notification_templates_for_changed', to='main.notificationtemplate'),
        ),
        migrations.AddField(
            model_name='organization',
            name='notification_templates_changed',
            field=models.ManyToManyField(blank=True, related_name='%(class)s_notification_templates_for_changed', to='main.notificationtemplate'),
        ),
    ]
