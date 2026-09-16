from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('main', '0217_drop_host_metric_licence_columns'),
    ]

    operations = [
        migrations.AddField(
            model_name='profile',
            name='theme',
            field=models.CharField(blank=True, default='', max_length=32),
        ),
    ]
