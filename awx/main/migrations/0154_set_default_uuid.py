# Generated by Django 2.2.20 on 2021-09-01 22:53

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('main', '0153_instance_last_seen'),
    ]

    operations = [
        migrations.AlterField(
            model_name='instance',
            name='uuid',
            field=models.CharField(default='00000000-0000-0000-0000-000000000000', max_length=40),
        ),
    ]
