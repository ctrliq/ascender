from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('main', '0209_cleanup_dab_rbac_leftovers'),
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
