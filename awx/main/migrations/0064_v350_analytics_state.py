# -*- coding: utf-8 -*-
# Generated by Django 1.11.16 on 2019-01-28 14:27
from __future__ import unicode_literals

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('main', '0063_v350_org_host_limits'),
    ]

    operations = [
        migrations.CreateModel(
            name='TowerAnalyticsState',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('last_run', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'abstract': False,
            },
        ),
    ]
