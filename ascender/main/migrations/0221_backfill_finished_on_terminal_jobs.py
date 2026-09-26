from django.db import migrations
from django.db.models import F


TERMINAL_STATUSES = ('successful', 'failed', 'error', 'canceled')


def backfill_finished(apps, schema_editor):
    """Give every terminal-state job a `finished` time.

    Between PR #343 and PR #1020, UnifiedJob.save() skipped stamping
    `finished` on jobs that never started: jobs canceled while pending, or
    failed by the task manager before launch. The jobs list orders by
    `-finished`, and NULLs sort first there, so those rows stayed pinned to
    the top of the list. `modified` was last written by the save that moved
    the job into its terminal state, so it is the closest record of when
    that happened. `started` is deliberately left NULL: it is what says the
    job never ran.
    """
    UnifiedJob = apps.get_model('main', 'UnifiedJob')
    # .update() bypasses auto_now, so `modified` itself is left untouched.
    UnifiedJob.objects.filter(status__in=TERMINAL_STATUSES, finished__isnull=True).update(finished=F('modified'))


class Migration(migrations.Migration):
    dependencies = [
        ('main', '0220_workflow_allow_overwrite_flow_vars_on_relaunch'),
    ]

    operations = [
        migrations.RunPython(backfill_finished, migrations.RunPython.noop),
    ]
