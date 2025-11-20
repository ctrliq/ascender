from django.db import migrations, models, connection

from ._sqlite_helper import dbawaremigrations


def migrate_event_data(apps, schema_editor):
    # see: https://github.com/ansible/awx/issues/9039
    #
    # the goal of this function is -- for each job event table -- to:
    # - create a parent partition table
    # - .. with a single partition
    # - .. that includes all existing job events
    #
    # the new main_jobevent_parent table should have a new
    # denormalized column, job_created, this is used as a
    # basis for partitioning job event rows
    #
    # The initial partion will be a unique case. After
    # the migration is completed, awx should create
    # new partitions on an hourly basis, as needed.
    # All events for a given job should be placed in
    # a partition based on the job's _created time_.

    for tblname in ('main_jobevent', 'main_inventoryupdateevent', 'main_projectupdateevent', 'main_adhoccommandevent', 'main_systemjobevent'):
        with connection.cursor() as cursor:
            # mark existing table as _unpartitioned_*
            # we will drop this table after its data
            # has been moved over
            cursor.execute(f'ALTER TABLE {tblname} RENAME TO _unpartitioned_{tblname}')

            # create a copy of the table that we will use as a reference for schema
            # otherwise, the schema changes we would make on the old jobevents table
            # (namely, dropping the primary key constraint) would cause the migration
            # to suffer a serious performance degradation
            cursor.execute(f'CREATE TABLE tmp_{tblname} (LIKE _unpartitioned_{tblname} INCLUDING ALL)')

            # drop primary key constraint; in a partioned table
            # constraints must include the partition key itself
            # TODO: do more generic search for pkey constraints
            # instead of hardcoding this one that applies to main_jobevent
            cursor.execute(f'ALTER TABLE tmp_{tblname} DROP CONSTRAINT tmp_{tblname}_pkey')

            # create parent table
            cursor.execute(
                f'CREATE TABLE {tblname} '
                f'(LIKE tmp_{tblname} INCLUDING ALL, job_created TIMESTAMP WITH TIME ZONE NOT NULL) '
                f'PARTITION BY RANGE(job_created);'
            )

            cursor.execute(f'DROP TABLE tmp_{tblname}')

            # recreate primary key constraint
            cursor.execute(f'ALTER TABLE ONLY {tblname} ADD CONSTRAINT {tblname}_pkey_new PRIMARY KEY (id, job_created);')

    with connection.cursor() as cursor:
        """
        Big int migration introduced the brin index main_jobevent_job_id_brin_idx index. For upgardes, we drop the index, new installs do nothing.
        I have seen the second index in my dev environment. I can not find where in the code it was created. Drop it just in case
        """
        cursor.execute('DROP INDEX IF EXISTS main_jobevent_job_id_brin_idx')
        cursor.execute('DROP INDEX IF EXISTS main_jobevent_job_id_idx')


def migrate_event_data_sqlite(apps, schema_editor):
    return None


class FakeAddField(migrations.AddField):
    def database_forwards(self, *args):
        # this is intentionally left blank, because we're
        # going to accomplish the migration with some custom raw SQL
        pass


class Migration(migrations.Migration):
    dependencies = [
        ('main', '0143_hostmetric'),
    ]

    operations = [
        dbawaremigrations.RunPython(migrate_event_data, sqlite_code=migrate_event_data_sqlite),
        FakeAddField(
            model_name='jobevent',
            name='job_created',
            field=models.DateTimeField(null=True, editable=False),
        ),
        FakeAddField(
            model_name='inventoryupdateevent',
            name='job_created',
            field=models.DateTimeField(null=True, editable=False),
        ),
        FakeAddField(
            model_name='projectupdateevent',
            name='job_created',
            field=models.DateTimeField(null=True, editable=False),
        ),
        FakeAddField(
            model_name='adhoccommandevent',
            name='job_created',
            field=models.DateTimeField(null=True, editable=False),
        ),
        FakeAddField(
            model_name='systemjobevent',
            name='job_created',
            field=models.DateTimeField(null=True, editable=False),
        ),
        migrations.CreateModel(
            name='UnpartitionedAdHocCommandEvent',
            fields=[],
            options={
                'proxy': True,
                'indexes': [],
                'constraints': [],
            },
            bases=('main.adhoccommandevent',),
        ),
        migrations.CreateModel(
            name='UnpartitionedInventoryUpdateEvent',
            fields=[],
            options={
                'proxy': True,
                'indexes': [],
                'constraints': [],
            },
            bases=('main.inventoryupdateevent',),
        ),
        migrations.CreateModel(
            name='UnpartitionedJobEvent',
            fields=[],
            options={
                'proxy': True,
                'indexes': [],
                'constraints': [],
            },
            bases=('main.jobevent',),
        ),
        migrations.CreateModel(
            name='UnpartitionedProjectUpdateEvent',
            fields=[],
            options={
                'proxy': True,
                'indexes': [],
                'constraints': [],
            },
            bases=('main.projectupdateevent',),
        ),
        migrations.CreateModel(
            name='UnpartitionedSystemJobEvent',
            fields=[],
            options={
                'proxy': True,
                'indexes': [],
                'constraints': [],
            },
            bases=('main.systemjobevent',),
        ),
        migrations.AlterField(
            model_name='adhoccommandevent',
            name='ad_hoc_command',
            field=models.ForeignKey(
                db_index=False, editable=False, on_delete=models.deletion.DO_NOTHING, related_name='ad_hoc_command_events', to='main.AdHocCommand'
            ),
        ),
        migrations.AlterField(
            model_name='adhoccommandevent',
            name='created',
            field=models.DateTimeField(default=None, editable=False, null=True),
        ),
        migrations.AlterField(
            model_name='adhoccommandevent',
            name='modified',
            field=models.DateTimeField(db_index=True, default=None, editable=False),
        ),
        migrations.AlterField(
            model_name='inventoryupdateevent',
            name='created',
            field=models.DateTimeField(default=None, editable=False, null=True),
        ),
        migrations.AlterField(
            model_name='inventoryupdateevent',
            name='inventory_update',
            field=models.ForeignKey(
                db_index=False, editable=False, on_delete=models.deletion.DO_NOTHING, related_name='inventory_update_events', to='main.InventoryUpdate'
            ),
        ),
        migrations.AlterField(
            model_name='inventoryupdateevent',
            name='modified',
            field=models.DateTimeField(db_index=True, default=None, editable=False),
        ),
        migrations.AlterField(
            model_name='jobevent',
            name='created',
            field=models.DateTimeField(default=None, editable=False, null=True),
        ),
        migrations.AlterField(
            model_name='jobevent',
            name='job',
            field=models.ForeignKey(db_index=False, editable=False, null=True, on_delete=models.deletion.DO_NOTHING, related_name='job_events', to='main.Job'),
        ),
        migrations.AlterField(
            model_name='jobevent',
            name='modified',
            field=models.DateTimeField(db_index=True, default=None, editable=False),
        ),
        migrations.AlterField(
            model_name='projectupdateevent',
            name='created',
            field=models.DateTimeField(default=None, editable=False, null=True),
        ),
        migrations.AlterField(
            model_name='projectupdateevent',
            name='modified',
            field=models.DateTimeField(db_index=True, default=None, editable=False),
        ),
        migrations.AlterField(
            model_name='projectupdateevent',
            name='project_update',
            field=models.ForeignKey(
                db_index=False, editable=False, on_delete=models.deletion.DO_NOTHING, related_name='project_update_events', to='main.ProjectUpdate'
            ),
        ),
        migrations.AlterField(
            model_name='systemjobevent',
            name='created',
            field=models.DateTimeField(default=None, editable=False, null=True),
        ),
        migrations.AlterField(
            model_name='systemjobevent',
            name='modified',
            field=models.DateTimeField(db_index=True, default=None, editable=False),
        ),
        migrations.AlterField(
            model_name='systemjobevent',
            name='system_job',
            field=models.ForeignKey(
                db_index=False, editable=False, on_delete=models.deletion.DO_NOTHING, related_name='system_job_events', to='main.SystemJob'
            ),
        ),
        # Replace old indexes with new partitioned indexes
        # AdHocCommandEvent indexes
        migrations.AddIndex(
            model_name='adhoccommandevent',
            index=models.Index(fields=['ad_hoc_command', 'job_created', 'event'], name='main_adhoccommandevent_adhoc_event_idx'),
        ),
        migrations.AddIndex(
            model_name='adhoccommandevent',
            index=models.Index(fields=['ad_hoc_command', 'job_created', 'counter'], name='main_adhoccommandevent_adhoc_counter_idx'),
        ),
        migrations.AddIndex(
            model_name='adhoccommandevent',
            index=models.Index(fields=['ad_hoc_command', 'job_created', 'uuid'], name='main_adhoccommandevent_adhoc_uuid_idx'),
        ),
        # InventoryUpdateEvent indexes
        migrations.AddIndex(
            model_name='inventoryupdateevent',
            index=models.Index(fields=['inventory_update', 'job_created', 'counter'], name='main_inventoryupdateevent_inv_counter_idx'),
        ),
        migrations.AddIndex(
            model_name='inventoryupdateevent',
            index=models.Index(fields=['inventory_update', 'job_created', 'uuid'], name='main_inventoryupdateevent_inv_uuid_idx'),
        ),
        # JobEvent indexes
        migrations.AddIndex(
            model_name='jobevent',
            index=models.Index(fields=['job', 'job_created', 'counter'], name='main_jobevent_job_counter_idx'),
        ),
        migrations.AddIndex(
            model_name='jobevent',
            index=models.Index(fields=['job', 'job_created', 'uuid'], name='main_jobevent_job_uuid_idx'),
        ),
        migrations.AddIndex(
            model_name='jobevent',
            index=models.Index(fields=['job', 'job_created', 'event'], name='main_jobevent_job_event_idx'),
        ),
        migrations.AddIndex(
            model_name='jobevent',
            index=models.Index(fields=['job', 'job_created', 'parent_uuid'], name='main_jobevent_job_parent_uuid_idx'),
        ),
        # ProjectUpdateEvent indexes
        migrations.AddIndex(
            model_name='projectupdateevent',
            index=models.Index(fields=['project_update', 'job_created', 'uuid'], name='main_projectupdateevent_proj_uuid_idx'),
        ),
        migrations.AddIndex(
            model_name='projectupdateevent',
            index=models.Index(fields=['project_update', 'job_created', 'event'], name='main_projectupdateevent_proj_event_idx'),
        ),
        migrations.AddIndex(
            model_name='projectupdateevent',
            index=models.Index(fields=['project_update', 'job_created', 'counter'], name='main_projectupdateevent_proj_counter_idx'),
        ),
        # SystemJobEvent indexes
        migrations.AddIndex(
            model_name='systemjobevent',
            index=models.Index(fields=['system_job', 'job_created', 'uuid'], name='main_systemjobevent_sysjob_uuid_idx'),
        ),
        migrations.AddIndex(
            model_name='systemjobevent',
            index=models.Index(fields=['system_job', 'job_created', 'counter'], name='main_systemjobevent_sysjob_counter_idx'),
        ),
    ]
