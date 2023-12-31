# -*- coding: utf-8 -*-
# Generated by Django 1.11.20 on 2019-06-14 15:08
from __future__ import unicode_literals

import awx.main.fields
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('main', '0082_v360_webhook_http_method'),
    ]

    operations = [
        # Add fields for user-provided project refspec
        migrations.AddField(
            model_name='project',
            name='scm_refspec',
            field=models.CharField(
                blank=True, default='', help_text='For git projects, an additional refspec to fetch.', max_length=1024, verbose_name='SCM refspec'
            ),
        ),
        migrations.AddField(
            model_name='projectupdate',
            name='scm_refspec',
            field=models.CharField(
                blank=True, default='', help_text='For git projects, an additional refspec to fetch.', max_length=1024, verbose_name='SCM refspec'
            ),
        ),
        # Add fields for job specification of project branch
        migrations.AddField(
            model_name='job',
            name='scm_branch',
            field=models.CharField(
                blank=True,
                default='',
                help_text='Branch to use in job run. Project default used if blank. Only allowed if project allow_override field is set to true.',
                max_length=1024,
            ),
        ),
        migrations.AddField(
            model_name='jobtemplate',
            name='ask_scm_branch_on_launch',
            field=awx.main.fields.AskForField(blank=True, default=False),
        ),
        migrations.AddField(
            model_name='jobtemplate',
            name='scm_branch',
            field=models.CharField(
                blank=True,
                default='',
                help_text='Branch to use in job run. Project default used if blank. Only allowed if project allow_override field is set to true.',
                max_length=1024,
            ),
        ),
        migrations.AddField(
            model_name='project',
            name='allow_override',
            field=models.BooleanField(default=False, help_text='Allow changing the SCM branch or revision in a job template that uses this project.'),
        ),
        # Fix typo in help_text
        migrations.AlterField(
            model_name='project',
            name='scm_update_cache_timeout',
            field=models.PositiveIntegerField(
                blank=True,
                default=0,
                help_text='The number of seconds after the last project update ran that a new project update will be launched as a job dependency.',
            ),
        ),
        # Start tracking the fetched revision on project update model
        migrations.AddField(
            model_name='projectupdate',
            name='scm_revision',
            field=models.CharField(
                blank=True,
                default='',
                editable=False,
                help_text='The SCM Revision discovered by this update for the given project and branch.',
                max_length=1024,
                verbose_name='SCM Revision',
            ),
        ),
    ]
