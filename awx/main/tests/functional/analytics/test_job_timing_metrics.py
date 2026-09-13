# -*- coding: utf-8 -*-
"""What the job timing gauges say, and what they say when nothing has run.

A job that takes nine minutes and should take two is either queued or slow, and
those are different problems. Nothing distinguished them before these, because
what the endpoint counted was jobs rather than time.
"""

import datetime

import pytest
from django.utils import timezone

from awx.main.analytics.metrics import job_timing
from awx.main.models import Job


def a_job(created_ago, waited, ran):
    """A finished job that waited `waited` and then ran `ran` seconds."""
    created = timezone.now() - datetime.timedelta(minutes=created_ago)
    started = created + datetime.timedelta(seconds=waited)
    return Job.objects.create(
        status='successful',
        created=created,
        started=started,
        finished=started + datetime.timedelta(seconds=ran),
        elapsed=ran,
    )


@pytest.mark.django_db
def test_the_wait_is_the_gap_between_submitted_and_started():
    a_job(created_ago=1, waited=30, ran=5)

    timing = job_timing()

    assert timing['jobs'] == 1
    assert timing['wait_average'] == datetime.timedelta(seconds=30)
    assert timing['wait_longest'] == datetime.timedelta(seconds=30)
    assert float(timing['run_average']) == 5.0


@pytest.mark.django_db
def test_the_longest_wait_is_not_the_average():
    # The one that matters is the outlier: an average of two minutes hides a
    # job that sat for an hour, and the hour is what somebody is asking about.
    a_job(created_ago=2, waited=1, ran=10)
    a_job(created_ago=2, waited=3599, ran=10)

    timing = job_timing()

    assert timing['wait_longest'] == datetime.timedelta(seconds=3599)
    assert timing['wait_average'] == datetime.timedelta(seconds=1800)


@pytest.mark.django_db
def test_a_job_outside_the_window_is_not_counted():
    # The window is what keeps this cheap: the jobs table only grows, and the
    # aggregate runs on every scrape.
    a_job(created_ago=120, waited=30, ran=5)

    assert job_timing(window_minutes=15)['jobs'] == 0
    assert job_timing(window_minutes=240)['jobs'] == 1


@pytest.mark.django_db
def test_a_job_that_never_started_is_not_a_wait_of_zero():
    # Still queued, so it has no wait yet. Counting it as zero would say the
    # opposite of what is happening.
    Job.objects.create(status='pending', created=timezone.now())

    assert job_timing()['jobs'] == 0
