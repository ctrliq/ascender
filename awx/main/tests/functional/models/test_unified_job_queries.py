# Copyright (c) 2026 Ascender
# All Rights Reserved.
"""
What listing unified jobs costs, and that the cost does not grow with the page.

A job is a row in main_unifiedjob plus a row in its own table, and reading a
mixed page means one query for the base rows and one more for each job type
present. That is the cost of the shape, and it is the cost the roadmap item
about flattening UnifiedJob is really about.

These tests pin the property that makes flattening unnecessary: the query count
is bounded by how many job types are on the page, never by how many rows. An
N+1 introduced into this path fails here rather than on somebody's instance.
"""

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from awx.main.models import Job, ProjectUpdate, SystemJob, UnifiedJob


def count_queries(fn):
    with CaptureQueriesContext(connection) as captured:
        fn()
    return len(captured.captured_queries)


def read_page(size):
    """Read a page the way the list endpoint does, touching every row."""
    return [job.name for job in UnifiedJob.objects.all().order_by('id')[:size]]


@pytest.fixture
def mixed_jobs(job_template, project, system_job_template, admin):
    """Thirty jobs across three types, ten of each."""
    made = []
    for i in range(10):
        made.append(job_template.create_unified_job(_eager_fields={'status': 'successful'}))
        made.append(project.create_unified_job(_eager_fields={'status': 'successful'}))
        made.append(system_job_template.create_unified_job(_eager_fields={'status': 'successful'}))
    return made


@pytest.mark.django_db
def test_the_page_costs_one_query_per_job_type_on_it(mixed_jobs):
    # warm the content type cache, which a long running process has warm and a
    # fresh one pays for once
    read_page(30)

    queries = count_queries(lambda: read_page(30))

    # one for the base rows, one each for Job, ProjectUpdate and SystemJob
    assert queries == 4


@pytest.mark.django_db
def test_doubling_the_page_does_not_change_the_query_count(mixed_jobs):
    read_page(30)

    small = count_queries(lambda: read_page(15))
    large = count_queries(lambda: read_page(30))

    assert small == large, 'listing unified jobs has become O(rows), which is an N+1'


@pytest.mark.django_db
def test_a_page_of_one_type_costs_two_queries(mixed_jobs):
    read_page(30)

    queries = count_queries(lambda: list(UnifiedJob.objects.filter(job__isnull=False).order_by('id')[:10]))

    # the base rows, and Job
    assert queries == 2


@pytest.mark.django_db
def test_every_row_comes_back_as_its_real_class(mixed_jobs):
    kinds = {type(job) for job in UnifiedJob.objects.all().order_by('id')[:30]}

    assert kinds == {Job, ProjectUpdate, SystemJob}


@pytest.mark.django_db
def test_asking_for_the_base_rows_alone_is_one_query(mixed_jobs):
    read_page(30)

    queries = count_queries(lambda: [j.name for j in UnifiedJob.objects.non_polymorphic().order_by('id')[:30]])

    # what the shape costs is the difference between this and the four above
    assert queries == 1
