# Generated by Django 2.2.8 on 2020-01-15 18:01

from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ('main', '0104_v370_cleanup_old_scan_jts'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='jobevent',
            name='parent',
        ),
        migrations.RemoveField(
            model_name='jobevent',
            name='hosts',
        ),
    ]
