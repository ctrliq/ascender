from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('main', '0195_remove_custom_virtualenv'),
    ]

    operations = [
        migrations.AddField(
            model_name='profile',
            name='language',
            field=models.CharField(blank=True, default='', max_length=8),
        ),
    ]
