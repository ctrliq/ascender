from django.db import migrations
from django.db.models import F
from django.db.models.functions import Coalesce


TERMINAL_STATUSES = ('successful', 'failed', 'error', 'canceled')


def backfill_finished(apps, schema_editor):
    """Give every terminal-state job a `finished` time.

    Between PR #343 and PR #1020, UnifiedJob.save() skipped stamping
    `finished` on jobs that never started: jobs canceled while pending, or
    failed by the task manager before launch. The jobs list orders by
    `-finished`, and NULLs sort first there, so those rows stayed pinned to
    the top of the list. `started` is deliberately left NULL: it is what
    says the job never ran.

    Canceled rows get `canceled_on`, which cancel() persists on the same
    save that flips the status, so it is the exact transition time. Failed
    and error rows have no persisted transition time at all: the paths that
    fail a job before launch save with update_fields, and
    CreatedModifiedModel.save() does not write `modified` on such saves, so
    `modified` still holds the last full save, usually the job's creation.
    That is a lower bound on the real failure time and the closest value the
    database holds. Erring early puts the job near where it was created in
    the list, rather than at the top on upgrade day.
    """
    UnifiedJob = apps.get_model('main', 'UnifiedJob')
    # .update() bypasses auto_now, so `modified` itself is left untouched.
    UnifiedJob.objects.filter(status__in=TERMINAL_STATUSES, finished__isnull=True).update(finished=Coalesce(F('canceled_on'), F('modified')))


class Migration(migrations.Migration):
    dependencies = [
        ('main', '0220_workflow_allow_overwrite_flow_vars_on_relaunch'),
    ]

    operations = [
        migrations.RunPython(backfill_finished, migrations.RunPython.noop),
    ]
