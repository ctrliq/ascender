# Copyright (c) 2026 Ascender
# All Rights Reserved.
"""
Drop job event partitions older than a retention window, and leave the jobs.

The only story the platform had for the largest table in the database was
cleanup_jobs, which drops an event partition when the last job pointing at it
is deleted. That ties how long output is kept to how long jobs are kept, and
the two are not the same question: a year of job history is cheap, a year of
every line those jobs printed is not.

This command answers the second question on its own. It is off unless asked:
no window is configured by default, so nothing here runs on a deployment that
does not want it.
"""

import datetime
import gzip
import logging
import os
import re
import tempfile

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import connection
from django.utils.timezone import now

from awx.main.management.commands.cleanup_jobs import partition_name_dt
from awx.main.models import AdHocCommand, InventoryUpdate, Job, ProjectUpdate, SystemJob
from awx.main.utils.common import unified_job_class_to_event_table_name

#: every job type that writes events into a partitioned table
EVENT_JOB_CLASSES = (Job, SystemJob, ProjectUpdate, InventoryUpdate, AdHocCommand)

#: how many bytes to move out of the database at a time while archiving. The
#: rows never all exist in this process at once, which is the point.
ARCHIVE_CHUNK = 1 << 20

#: what a partition this command is willing to drop is called. The names come
#: out of the catalogue and go back into DROP TABLE, which cannot take a bound
#: parameter, so they are checked rather than trusted.
PARTITION_NAME = re.compile(r'^main_[a-z]+event_\d{8}_\d{2}$')


def partitions_to_drop(names, cutoff):
    """
    Which of these partitions hold events older than the cutoff.

    A name this cannot read an hour out of is left alone, which covers the
    _unpartitioned tables that predate partitioning and anything a person has
    attached to the parent by hand.
    """
    dropping = []
    for name in names:
        if not PARTITION_NAME.match(name):
            continue
        when = partition_name_dt(name)
        if when is None:
            continue
        # the hour a partition covers is its name, and it holds the hour after
        # it as well, so a partition is only past the window once its end is
        if when + datetime.timedelta(hours=1) <= cutoff:
            dropping.append(name)
    return sorted(dropping)


def archive_partition(cursor, name, directory):
    """
    Write one partition out as gzipped CSV, and return the path it landed at.

    The rows go straight from PostgreSQL to the file through COPY, the same way
    result_stdout_raw_handle() reads stdout, so a partition of any size costs
    this process a buffer rather than its contents.

    The file is written under a temporary name and moved into place at the end,
    so a half-written archive is never mistaken for a complete one, and the
    directory is fsynced so the rename survives a crash. The caller drops the
    partition only if this returns.

    Args:
        cursor: an open database cursor.
        name (str): the partition to archive, already checked against
            PARTITION_NAME.
        directory (str): where to write it.

    Returns:
        str: the path written.
    """
    os.makedirs(directory, exist_ok=True)
    final = os.path.join(directory, '{}.csv.gz'.format(name))
    fd, temporary = tempfile.mkstemp(prefix='.{}.'.format(name), suffix='.partial', dir=directory)
    try:
        with os.fdopen(fd, 'wb') as raw, gzip.GzipFile(filename='', mode='wb', fileobj=raw, mtime=0) as out:
            with cursor.copy('COPY {} TO STDOUT WITH (FORMAT csv, HEADER)'.format(name)) as copy:
                while data := copy.read():
                    out.write(bytes(data))
            out.flush()
            raw.flush()
            os.fsync(raw.fileno())
        os.replace(temporary, final)
    except BaseException:
        # a partition with no complete archive must keep its rows
        if os.path.exists(temporary):
            os.unlink(temporary)
        raise
    # the rename itself has to reach the disk before the DROP does
    directory_fd = os.open(directory, os.O_RDONLY)
    try:
        os.fsync(directory_fd)
    finally:
        os.close(directory_fd)
    return final


class Command(BaseCommand):
    help = 'Drop job event partitions older than the retention window, keeping the jobs themselves.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--days',
            dest='days',
            type=int,
            default=None,
            help='How many days of job events to keep. Defaults to JOB_EVENT_RETENTION_DAYS.',
        )
        parser.add_argument(
            '--archive-dir',
            dest='archive_dir',
            default=None,
            help='Write each partition out as gzipped CSV here before dropping it. Defaults to JOB_EVENT_ARCHIVE_DIR.',
        )
        parser.add_argument(
            '--dry-run',
            dest='dry_run',
            action='store_true',
            default=False,
            help='Say what would be dropped and drop nothing.',
        )

    def handle(self, *args, **options):
        self.logger = logging.getLogger('awx.main.commands.cleanup_job_events')
        days = options['days']
        if days is None:
            days = getattr(settings, 'JOB_EVENT_RETENTION_DAYS', 0) or 0
        if days <= 0:
            raise CommandError('No retention window. Pass --days, or set JOB_EVENT_RETENTION_DAYS to the number of days of job events to keep.')

        archive_dir = options['archive_dir']
        if archive_dir is None:
            archive_dir = getattr(settings, 'JOB_EVENT_ARCHIVE_DIR', None)

        cutoff = now() - datetime.timedelta(days=days)
        dry_run = options['dry_run']
        total = 0
        archived = 0

        for job_class in EVENT_JOB_CLASSES:
            table = unified_job_class_to_event_table_name(job_class)
            dropping = partitions_to_drop(self.list_partitions(table), cutoff)
            if not dropping:
                self.logger.debug(f'{table}: nothing older than {cutoff}')
                continue

            total += len(dropping)
            if dry_run:
                where = f' to {archive_dir}' if archive_dir else ''
                verb = 'archive and drop' if archive_dir else 'drop'
                self.logger.info(f'{table}: would {verb} {len(dropping)} partition(s){where}, {dropping[0]} to {dropping[-1]}')
                continue

            if archive_dir:
                # a partition whose archive fails keeps its rows, so the window
                # is never the only copy that existed
                kept = []
                with connection.cursor() as cursor:
                    for name in dropping:
                        try:
                            path = archive_partition(cursor, name, archive_dir)
                        except Exception as exc:
                            self.logger.error(f'{name}: not archived, so not dropped: {exc}')
                            kept.append(name)
                            continue
                        archived += 1
                        self.logger.info(f'{name}: archived to {path}')
                dropping = [name for name in dropping if name not in kept]
                total -= len(kept)
                if not dropping:
                    continue

            self.logger.info(f'{table}: dropping {len(dropping)} partition(s), {dropping[0]} to {dropping[-1]}')
            with connection.cursor() as cursor:
                cursor.execute('DROP TABLE {}'.format(','.join(dropping)))

        verb = 'would be dropped' if dry_run else 'dropped'
        note = f', {archived} archived to {archive_dir}' if archived else ''
        self.logger.info(f'{total} partition(s) {verb}{note}, keeping {days} day(s) of job events')

    def list_partitions(self, table):
        """The partitions attached to one event table, by name."""
        with connection.cursor() as cursor:
            cursor.execute(
                'SELECT inhrelid::regclass::text FROM pg_catalog.pg_inherits WHERE inhparent = %s::regclass',
                [table],
            )
            return [row[0] for row in cursor.fetchall()]
