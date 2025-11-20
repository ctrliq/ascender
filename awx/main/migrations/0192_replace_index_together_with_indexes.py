# -*- coding: utf-8 -*-
# Migration to ensure Django 5.2 compatibility
# This migration handles the transition from index_together to models.Index

from django.db import migrations


class Migration(migrations.Migration):
    """
    This migration ensures Django 5.2 compatibility by handling index_together removal.
    
    It clears index_together from migration state for databases that ran old versions
    of migrations that used index_together (which is deprecated in Django 5.2).
    
    The actual indexes already exist in the database (created by either index_together
    or migration 0144's AddIndex operations). Migration 0193 will handle renaming them
    to shorter names that comply with the 30-character limit.
    """

    dependencies = [
        ('main', '0191a_add_depot_credential'),
    ]

    operations = [
        # Clear index_together from migration state
        # This is needed for DBs that ran the OLD versions of migrations
        # that used index_together
        migrations.AlterIndexTogether(
            name='adhoccommandevent',
            index_together=None,
        ),
        migrations.AlterIndexTogether(
            name='jobevent',
            index_together=None,
        ),
        migrations.AlterIndexTogether(
            name='inventoryupdateevent',
            index_together=None,
        ),
        migrations.AlterIndexTogether(
            name='projectupdateevent',
            index_together=None,
        ),
        migrations.AlterIndexTogether(
            name='systemjobevent',
            index_together=None,
        ),
    ]
