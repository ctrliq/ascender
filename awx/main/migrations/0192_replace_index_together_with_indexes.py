# -*- coding: utf-8 -*-
# Migration to ensure Django 5.2 compatibility
# This migration handles the transition from index_together to models.Index

from django.db import migrations, connection


def smart_index_transition(apps, schema_editor):
    """
    Intelligently handle index creation based on which version of the migrations ran.
    
    Three scenarios:
    1. Existing DB with old migrations (index_together): Indexes exist in DB
    2. New install with new migrations (AddIndex): Indexes created by migrations 0144, etc.
    3. Existing DB upgrading: May have indexes from index_together
    
    This function ensures indexes exist regardless of the path taken.
    """
    
    with connection.cursor() as cursor:
        # Check if the indexes already exist with our expected names
        cursor.execute("""
            SELECT 1 FROM pg_indexes 
            WHERE indexname = 'jobevent_job_counter_idx'
        """)
        index_exists = cursor.fetchone() is not None
        
        # Only create indexes if they definitely don't exist
        if not index_exists:
            # Indexes don't exist - this is likely impossible on existing DBs
            # because index_together would have created them (with auto-generated names)
            # But for new installs where migrations might be faked, create them
            
            indexes_to_create = [
                ('main_adhoccommandevent', 'ad_hoc_command_id', 'job_created', 'event', 'adhoccmdevent_adhoc_event_idx'),
                ('main_adhoccommandevent', 'ad_hoc_command_id', 'job_created', 'counter', 'adhoccmdevent_adhoc_cntr_idx'),
                ('main_adhoccommandevent', 'ad_hoc_command_id', 'job_created', 'uuid', 'adhoccmdevent_adhoc_uuid_idx'),
                ('main_jobevent', 'job_id', 'job_created', 'counter', 'jobevent_job_counter_idx'),
                ('main_jobevent', 'job_id', 'job_created', 'uuid', 'jobevent_job_uuid_idx'),
                ('main_jobevent', 'job_id', 'job_created', 'event', 'jobevent_job_event_idx'),
                ('main_jobevent', 'job_id', 'job_created', 'parent_uuid', 'jobevent_job_parent_uuid_idx'),
                ('main_inventoryupdateevent', 'inventory_update_id', 'job_created', 'counter', 'invupdevent_inv_counter_idx'),
                ('main_inventoryupdateevent', 'inventory_update_id', 'job_created', 'uuid', 'invupdevent_inv_uuid_idx'),
                ('main_projectupdateevent', 'project_update_id', 'job_created', 'uuid', 'projupdevent_proj_uuid_idx'),
                ('main_projectupdateevent', 'project_update_id', 'job_created', 'event', 'projupdevent_proj_event_idx'),
                ('main_projectupdateevent', 'project_update_id', 'job_created', 'counter', 'projupdevent_proj_counter_idx'),
                ('main_systemjobevent', 'system_job_id', 'job_created', 'uuid', 'sysjobevent_sysjob_uuid_idx'),
                ('main_systemjobevent', 'system_job_id', 'job_created', 'counter', 'sysjobevent_sysjob_cntr_idx'),
            ]
            
            for table, field1, field2, field3, idx_name in indexes_to_create:
                # Use string formatting instead of psycopg2.sql to avoid import dependency
                query = f'CREATE INDEX IF NOT EXISTS "{idx_name}" ON "{table}" ("{field1}", "{field2}", "{field3}")'
                cursor.execute(query)


class Migration(migrations.Migration):
    """
    This migration ensures Django 5.2 compatibility by handling index_together removal.
    
    It handles three scenarios:
    1. Existing DBs that ran OLD migrations (with index_together):
       - Clears index_together from migration state
       - Indexes already exist in DB (created by index_together)
       - No duplicate creation
       
    2. New installs that run NEW migrations (with AddIndex):
       - migrations 0144, etc. create indexes via AddIndex
       - This migration clears index_together (no-op)
       - No duplicate creation
       
    3. Edge cases (faked migrations, etc.):
       - Checks if indexes exist before creating
       - Creates only if missing
    
    The key: We updated old migrations to use AddIndex, so new installs work.
    But existing DBs that already ran those migrations won't re-run the AddIndex
    operations, so we need to ensure their migration state is compatible with Django 5.2.
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
        
        # Ensure indexes exist (for edge cases where they might not)
        # This is typically a no-op because:
        # - Old DBs: indexes created by index_together
        # - New DBs: indexes created by AddIndex in migration 0144
        migrations.RunPython(
            code=smart_index_transition,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
