# -*- coding: utf-8 -*-
# Generated by Django 1.11.11 on 2018-04-02 19:18
from __future__ import unicode_literals

from django.db import migrations

from awx.main.migrations import ActivityStreamDisabledMigration
from awx.main.migrations._rbac import delete_all_user_roles, rebuild_role_hierarchy
from awx.main.migrations import _migration_utils as migration_utils


class Migration(ActivityStreamDisabledMigration):
    dependencies = [
        ('main', '0033_v330_oauth_help_text'),
    ]

    operations = [
        migrations.RunPython(migration_utils.set_current_apps_for_migrations),
        migrations.RunPython(delete_all_user_roles),
        migrations.RunPython(rebuild_role_hierarchy),
    ]