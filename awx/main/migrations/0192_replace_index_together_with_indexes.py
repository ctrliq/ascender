# -*- coding: utf-8 -*-
# Migration to ensure Django 5.2 compatibility
# This migration handles the transition from index_together to models.Index

from django.db import migrations, models, connection


def rename_indexes_if_needed(apps, schema_editor):
    """
    Safely rename indexes from long names to short names.
    Only renames if the old name exists and new name doesn't.
    """
    with connection.cursor() as cursor:
        # Define renames: (table, old_name, new_name)
        renames = [
            ('main_adhoccommandevent', 'main_adhoccommandevent_adhoc_event_idx', 'adhoccmdevent_adhoc_event_idx'),
            ('main_adhoccommandevent', 'main_adhoccommandevent_adhoc_uuid_idx', 'adhoccmdevent_adhoc_uuid_idx'),
            ('main_adhoccommandevent', 'main_adhoccommandevent_adhoc_counter_idx', 'adhoccmdevent_adhoc_cntr_idx'),
            ('main_inventoryupdateevent', 'main_inventoryupdateevent_inv_uuid_idx', 'invupdevent_inv_uuid_idx'),
            ('main_inventoryupdateevent', 'main_inventoryupdateevent_inv_counter_idx', 'invupdevent_inv_counter_idx'),
            ('main_jobevent', 'main_jobevent_job_event_idx', 'jobevent_job_event_idx'),
            ('main_jobevent', 'main_jobevent_job_uuid_idx', 'jobevent_job_uuid_idx'),
            ('main_jobevent', 'main_jobevent_job_parent_uuid_idx', 'jobevent_job_parent_uuid_idx'),
            ('main_jobevent', 'main_jobevent_job_counter_idx', 'jobevent_job_counter_idx'),
            ('main_projectupdateevent', 'main_projectupdateevent_proj_event_idx', 'projupdevent_proj_event_idx'),
            ('main_projectupdateevent', 'main_projectupdateevent_proj_uuid_idx', 'projupdevent_proj_uuid_idx'),
            ('main_projectupdateevent', 'main_projectupdateevent_proj_counter_idx', 'projupdevent_proj_counter_idx'),
            ('main_systemjobevent', 'main_systemjobevent_sysjob_uuid_idx', 'sysjobevent_sysjob_uuid_idx'),
            ('main_systemjobevent', 'main_systemjobevent_sysjob_counter_idx', 'sysjobevent_sysjob_cntr_idx'),
        ]
        
        for table, old_name, new_name in renames:
            # Check if new name already exists
            cursor.execute("SELECT 1 FROM pg_indexes WHERE tablename = %s AND indexname = %s", [table, new_name])
            if cursor.fetchone():
                continue  # Already has new name, skip
            
            # Check if old name exists
            cursor.execute("SELECT 1 FROM pg_indexes WHERE tablename = %s AND indexname = %s", [table, old_name])
            if cursor.fetchone():
                # Rename it
                cursor.execute(f'ALTER INDEX "{old_name}" RENAME TO "{new_name}"')


class Migration(migrations.Migration):
    """
    This migration ensures Django 5.2 compatibility by:
    1. Clearing deprecated index_together from migration state
    2. Renaming indexes to comply with 30-character limit
    3. Removing obsolete indexes
    """

    dependencies = [
        ('main', '0191a_add_depot_credential'),
    ]

    operations = [
        # Clear index_together from migration state (deprecated in Django 5.2)
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
        
        # Rename indexes to short names (for 30-char limit)
        migrations.RunPython(
            code=rename_indexes_if_needed,
            reverse_code=migrations.RunPython.noop,
        ),
        
        # Remove obsolete indexes
        migrations.RemoveIndex(model_name='adhoccommandevent', name='main_adhoccommandevent_adhoc_event_old_idx'),
        migrations.RemoveIndex(model_name='adhoccommandevent', name='main_adhoccommandevent_adhoc_uuid_old_idx'),
        migrations.RemoveIndex(model_name='adhoccommandevent', name='main_adhoccommandevent_adhoc_endline_idx'),
        migrations.RemoveIndex(model_name='adhoccommandevent', name='main_adhoccommandevent_adhoc_startln_idx'),
        migrations.RemoveIndex(model_name='inventoryupdateevent', name='main_invupdateevent_inv_startline_idx'),
        migrations.RemoveIndex(model_name='inventoryupdateevent', name='main_invupdateevent_inv_uuid_old_idx'),
        migrations.RemoveIndex(model_name='inventoryupdateevent', name='main_invupdateevent_inv_endline_idx'),
        migrations.RemoveIndex(model_name='jobevent', name='main_jobevent_job_event_old_idx'),
        migrations.RemoveIndex(model_name='jobevent', name='main_jobevent_job_parent_uuid_old_idx'),
        migrations.RemoveIndex(model_name='jobevent', name='main_jobevent_job_start_line_idx'),
        migrations.RemoveIndex(model_name='jobevent', name='main_jobevent_job_uuid_old_idx'),
        migrations.RemoveIndex(model_name='jobevent', name='main_jobevent_job_end_line_idx'),
        migrations.RemoveIndex(model_name='projectupdateevent', name='main_projupdateevent_proj_event_old_idx'),
        migrations.RemoveIndex(model_name='projectupdateevent', name='main_projupdateevent_proj_endline_idx'),
        migrations.RemoveIndex(model_name='projectupdateevent', name='main_projupdateevent_proj_startline_idx'),
        migrations.RemoveIndex(model_name='projectupdateevent', name='main_projupdateevent_proj_uuid_old_idx'),
        migrations.RemoveIndex(model_name='role', name='main_role_content_type_object_id_idx'),
        migrations.RemoveIndex(model_name='roleancestorentry', name='main_roleancestorentry_anc_ct_oid_idx'),
        migrations.RemoveIndex(model_name='roleancestorentry', name='main_roleancestorentry_anc_ct_rf_idx'),
        migrations.RemoveIndex(model_name='roleancestorentry', name='main_roleancestorentry_anc_desc_idx'),
        migrations.RemoveIndex(model_name='systemjobevent', name='main_systemjobevent_sysjob_endline_idx'),
        migrations.RemoveIndex(model_name='systemjobevent', name='main_systemjobevent_sysjob_uuid_old_idx'),
        migrations.RemoveIndex(model_name='systemjobevent', name='main_systemjobevent_sysjob_startline_idx'),
        
        # Remove auto-generated Django index names
        migrations.RemoveIndex(model_name='adhoccommandevent', name='main_adhocc_ad_hoc__1e4d24_idx'),
        migrations.RemoveIndex(model_name='adhoccommandevent', name='main_adhocc_ad_hoc__e72142_idx'),
        migrations.RemoveIndex(model_name='adhoccommandevent', name='main_adhocc_ad_hoc__a57777_idx'),
        migrations.RemoveIndex(model_name='inventoryupdateevent', name='main_invent_invento_f72b21_idx'),
        migrations.RemoveIndex(model_name='inventoryupdateevent', name='main_invent_invento_364dcb_idx'),
        migrations.RemoveIndex(model_name='jobevent', name='main_jobeve_job_id_40a56d_idx'),
        migrations.RemoveIndex(model_name='jobevent', name='main_jobeve_job_id_3c4a4a_idx'),
        migrations.RemoveIndex(model_name='jobevent', name='main_jobeve_job_id_51c382_idx'),
        migrations.RemoveIndex(model_name='jobevent', name='main_jobeve_job_id_0ddc6b_idx'),
        migrations.RemoveIndex(model_name='projectupdateevent', name='main_projec_project_449bbd_idx'),
        migrations.RemoveIndex(model_name='projectupdateevent', name='main_projec_project_69559a_idx'),
        migrations.RemoveIndex(model_name='projectupdateevent', name='main_projec_project_c44b7c_idx'),
        migrations.RemoveIndex(model_name='systemjobevent', name='main_system_system__e39825_idx'),
        migrations.RemoveIndex(model_name='systemjobevent', name='main_system_system__73537a_idx'),
        
        # Update Django's migration state to reflect the renamed indexes
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.RenameIndex(model_name='adhoccommandevent', new_name='adhoccmdevent_adhoc_event_idx', old_name='main_adhoccommandevent_adhoc_event_idx'),
                migrations.RenameIndex(model_name='adhoccommandevent', new_name='adhoccmdevent_adhoc_uuid_idx', old_name='main_adhoccommandevent_adhoc_uuid_idx'),
                migrations.RenameIndex(model_name='adhoccommandevent', new_name='adhoccmdevent_adhoc_cntr_idx', old_name='main_adhoccommandevent_adhoc_counter_idx'),
                migrations.RenameIndex(model_name='inventoryupdateevent', new_name='invupdevent_inv_uuid_idx', old_name='main_inventoryupdateevent_inv_uuid_idx'),
                migrations.RenameIndex(model_name='inventoryupdateevent', new_name='invupdevent_inv_counter_idx', old_name='main_inventoryupdateevent_inv_counter_idx'),
                migrations.RenameIndex(model_name='jobevent', new_name='jobevent_job_event_idx', old_name='main_jobevent_job_event_idx'),
                migrations.RenameIndex(model_name='jobevent', new_name='jobevent_job_uuid_idx', old_name='main_jobevent_job_uuid_idx'),
                migrations.RenameIndex(model_name='jobevent', new_name='jobevent_job_parent_uuid_idx', old_name='main_jobevent_job_parent_uuid_idx'),
                migrations.RenameIndex(model_name='jobevent', new_name='jobevent_job_counter_idx', old_name='main_jobevent_job_counter_idx'),
                migrations.RenameIndex(model_name='projectupdateevent', new_name='projupdevent_proj_event_idx', old_name='main_projectupdateevent_proj_event_idx'),
                migrations.RenameIndex(model_name='projectupdateevent', new_name='projupdevent_proj_uuid_idx', old_name='main_projectupdateevent_proj_uuid_idx'),
                migrations.RenameIndex(model_name='projectupdateevent', new_name='projupdevent_proj_counter_idx', old_name='main_projectupdateevent_proj_counter_idx'),
                migrations.RenameIndex(model_name='systemjobevent', new_name='sysjobevent_sysjob_uuid_idx', old_name='main_systemjobevent_sysjob_uuid_idx'),
                migrations.RenameIndex(model_name='systemjobevent', new_name='sysjobevent_sysjob_cntr_idx', old_name='main_systemjobevent_sysjob_counter_idx'),
            ],
            database_operations=[],
        ),
        
        # Alter fields
        migrations.AlterField(
            model_name='instance',
            name='peers',
            field=models.ManyToManyField(related_name='peers_from', through='main.InstanceLink', through_fields=('source', 'target'), to='main.receptoraddress'),
        ),
        migrations.AlterField(
            model_name='job',
            name='hosts',
            field=models.ManyToManyField(editable=False, related_name='jobs', through='main.JobHostSummary', through_fields=('job', 'host'), to='main.host'),
        ),
        migrations.AlterField(
            model_name='role',
            name='ancestors',
            field=models.ManyToManyField(related_name='descendents', through='main.RoleAncestorEntry', through_fields=('descendent', 'ancestor'), to='main.role'),
        ),
    ]
