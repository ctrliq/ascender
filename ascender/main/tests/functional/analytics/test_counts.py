import pytest

from ascender.main import models
from ascender.main.analytics import collectors


@pytest.mark.django_db
def test_empty():
    counts = collectors.counts(None)
    # The live connection count depends on what else holds a connection to this
    # test database, so assert it is present rather than pinning a value.
    assert counts.pop("database_connections") >= 1
    assert counts == {
        "active_user_sessions": 0,
        "active_anonymous_sessions": 0,
        "active_sessions": 0,
        "active_host_count": 0,
        "credential": 0,
        "host": 0,
        "inventory": 0,
        "inventories": {"normal": 0, "smart": 0},
        "job_template": 0,
        "notification_template": 0,
        "organization": 0,
        "project": 0,
        "running_jobs": 0,
        "schedule": 0,
        "team": 0,
        "user": 0,
        "workflow_job_template": 0,
        "unified_job": 0,
        "pending_jobs": 0,
    }


@pytest.mark.django_db
def test_database_counts(organization_factory, job_template_factory, workflow_job_template_factory):
    objs = organization_factory("org", superusers=["admin"])
    jt = job_template_factory(
        "test",
        organization=objs.organization,
        inventory="test_inv",
        project="test_project",
        credential="test_cred",
    )
    workflow_job_template_factory("test")
    models.Team(organization=objs.organization).save()
    models.Host(inventory=jt.inventory).save()
    models.Schedule(
        rrule="DTSTART;TZID=America/New_York:20300504T150000",
        unified_job_template=jt.job_template,
    ).save()

    counts = collectors.counts(None)
    for key in (
        "organization",
        "team",
        "user",
        "inventory",
        "credential",
        "project",
        "job_template",
        "workflow_job_template",
        "host",
        "schedule",
    ):
        assert counts[key] == 1
