import pytest

from awx.main.models import ActivityStream, Inventory, JobTemplate, Schedule

# Django's own Model.save signature is save(..., update_fields=None), so a caller
# that forwards update_fields explicitly hands these save methods None rather
# than leaving the key out. Each of them has to treat that as a full save.


@pytest.mark.django_db
def test_smart_inventory_save_accepts_update_fields_none(organization):
    inventory = Inventory.objects.create(name='smart-inv', organization=organization, kind='smart', host_filter='name=somehost')
    inventory.description = 'changed'

    inventory.save(update_fields=None)

    inventory.refresh_from_db()
    assert inventory.description == 'changed'


@pytest.mark.django_db
def test_schedule_save_accepts_update_fields_none(inventory, project):
    job_template = JobTemplate.objects.create(name='test-jt', inventory=inventory, project=project)
    schedule = Schedule.objects.create(name='test-sch', rrule='DTSTART:20300112T210000Z RRULE:FREQ=DAILY;INTERVAL=1', unified_job_template=job_template)
    # a different start moves the computed fields, which is the branch that reads update_fields
    schedule.rrule = 'DTSTART:20310112T210000Z RRULE:FREQ=DAILY;INTERVAL=1'

    schedule.save(update_fields=None)

    schedule.refresh_from_db()
    assert schedule.dtstart.year == 2031


@pytest.mark.django_db
def test_project_update_save_accepts_update_fields_none(project):
    project_update = project.create_unified_job()
    job_tags = project_update.job_tags

    project_update.save(update_fields=None)

    project_update.refresh_from_db()
    assert project_update.job_tags == job_tags


@pytest.mark.django_db
def test_activity_stream_save_accepts_update_fields_none(admin_user):
    entry = ActivityStream.objects.create(operation='create', object1='organization', actor=admin_user)

    entry.save(update_fields=None)

    entry.refresh_from_db()
    assert entry.deleted_actor['username'] == admin_user.username
