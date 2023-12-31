# -*- coding: utf-8 -*-
# Generated by Django 1.11.20 on 2019-05-06 13:48
from __future__ import unicode_literals

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ('main', '0072_v350_deprecate_fields'),
    ]

    operations = [
        migrations.CreateModel(
            name='InventoryInstanceGroupMembership',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('position', models.PositiveIntegerField(default=None, null=True, db_index=True)),
                ('instancegroup', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='main.InstanceGroup')),
                ('inventory', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='main.Inventory')),
            ],
        ),
        migrations.CreateModel(
            name='OrganizationInstanceGroupMembership',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('position', models.PositiveIntegerField(default=None, null=True, db_index=True)),
                ('instancegroup', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='main.InstanceGroup')),
                ('organization', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='main.Organization')),
            ],
        ),
        migrations.CreateModel(
            name='UnifiedJobTemplateInstanceGroupMembership',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('position', models.PositiveIntegerField(default=None, null=True, db_index=True)),
                ('instancegroup', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='main.InstanceGroup')),
                ('unifiedjobtemplate', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='main.UnifiedJobTemplate')),
            ],
        ),
    ]
