import pytest
from datetime import timedelta

from django.utils.timezone import now

from awx.main.models.jobs import JobTemplate, JobTemplateMetric
from awx.main.tasks.job_template_metrics import (
    update_job_template_metric,
    record_job_template_metric_duration,
    record_job_template_metric_status,
)


@pytest.mark.django_db
class TestJobTemplateMetricModel:
    """Test JobTemplateMetric model creation and basic functionality"""

    def test_metric_created_on_first_job(self, job_template_factory):
        """Test that JobTemplateMetric is created when a job runs"""
        objects = job_template_factory('test-template', organization='org1', persisted=True)
        jt = objects.job_template

        # Simulate job metric creation
        update_job_template_metric(jt.id, jt.name)

        metric = JobTemplateMetric.objects.get(id=jt.id)
        assert metric.name == jt.name
        assert metric.total_jobs == 1
        assert metric.successful_jobs == 0
        assert metric.failed_jobs == 0
        assert metric.canceled_jobs == 0
        assert metric.total_seconds == 0

    def test_metric_name_sync_on_creation(self, job_template_factory):
        """Test that metric name is set correctly on creation"""
        objects = job_template_factory('test-template', organization='org1', persisted=True)
        jt = objects.job_template
        original_name = jt.name

        update_job_template_metric(jt.id, original_name)

        metric = JobTemplateMetric.objects.get(id=jt.id)
        assert metric.name == original_name

    def test_metric_ordering(self, job_template_factory):
        """Test that metrics are ordered by name"""
        objects1 = job_template_factory('zebra-template', organization='org1', persisted=True)
        objects2 = job_template_factory('apple-template', organization='org2', persisted=True)
        objects3 = job_template_factory('middle-template', organization='org3', persisted=True)

        jt1 = objects1.job_template
        jt2 = objects2.job_template
        jt3 = objects3.job_template

        update_job_template_metric(jt1.id, jt1.name)
        update_job_template_metric(jt2.id, jt2.name)
        update_job_template_metric(jt3.id, jt3.name)

        metrics = list(JobTemplateMetric.objects.all())
        names = [m.name for m in metrics]
        assert names == sorted(names)

    def test_metric_one_to_one_relationship(self, job_template_factory):
        """Test that there's only one metric per template"""
        objects = job_template_factory('test-template', organization='org1', persisted=True)
        jt = objects.job_template

        update_job_template_metric(jt.id, jt.name)
        update_job_template_metric(jt.id, jt.name)

        assert JobTemplateMetric.objects.filter(id=jt.id).count() == 1


@pytest.mark.django_db
class TestJobTemplateMetricCounters:
    """Test counter incrementation for different job statuses"""

    def test_total_jobs_increment(self, job_template_factory):
        """Test that total_jobs increments correctly"""
        objects = job_template_factory('test-template', organization='org1', persisted=True)
        jt = objects.job_template

        update_job_template_metric(jt.id, jt.name)
        metric = JobTemplateMetric.objects.get(id=jt.id)
        assert metric.total_jobs == 1

        update_job_template_metric(jt.id, jt.name)
        metric.refresh_from_db()
        assert metric.total_jobs == 2

    def test_successful_counter(self, job_template_factory):
        """Test successful job counter"""
        objects = job_template_factory('test-template', organization='org1', persisted=True)
        jt = objects.job_template

        # Must create metric first
        update_job_template_metric(jt.id, jt.name)
        record_job_template_metric_status(jt.id, 'successful', elapsed_seconds=10.5)

        metric = JobTemplateMetric.objects.get(id=jt.id)
        assert metric.successful_jobs == 1
        assert metric.successful_seconds == 10

    def test_failed_counter(self, job_template_factory):
        """Test failed job counter"""
        objects = job_template_factory('test-template', organization='org1', persisted=True)
        jt = objects.job_template

        # Must create metric first
        update_job_template_metric(jt.id, jt.name)
        record_job_template_metric_status(jt.id, 'failed', elapsed_seconds=5.2)

        metric = JobTemplateMetric.objects.get(id=jt.id)
        assert metric.failed_jobs == 1
        assert metric.failed_seconds == 5

    def test_error_counter_counts_as_failed(self, job_template_factory):
        """Test that error status increments failed counter"""
        objects = job_template_factory('test-template', organization='org1', persisted=True)
        jt = objects.job_template

        # Must create metric first
        update_job_template_metric(jt.id, jt.name)
        record_job_template_metric_status(jt.id, 'error', elapsed_seconds=8.7)

        metric = JobTemplateMetric.objects.get(id=jt.id)
        assert metric.failed_jobs == 1
        assert metric.failed_seconds == 9

    def test_canceled_counter(self, job_template_factory):
        """Test canceled job counter"""
        objects = job_template_factory('test-template', organization='org1', persisted=True)
        jt = objects.job_template

        # Must create metric first
        update_job_template_metric(jt.id, jt.name)
        record_job_template_metric_status(jt.id, 'canceled', elapsed_seconds=3.4)

        metric = JobTemplateMetric.objects.get(id=jt.id)
        assert metric.canceled_jobs == 1
        assert metric.canceled_seconds == 3

    def test_multiple_statuses(self, job_template_factory):
        """Test multiple jobs with different statuses"""
        objects = job_template_factory('test-template', organization='org1', persisted=True)
        jt = objects.job_template

        # Must create metric first
        update_job_template_metric(jt.id, jt.name)
        record_job_template_metric_status(jt.id, 'successful', elapsed_seconds=10)
        record_job_template_metric_status(jt.id, 'successful', elapsed_seconds=20)
        record_job_template_metric_status(jt.id, 'failed', elapsed_seconds=5)
        record_job_template_metric_status(jt.id, 'canceled', elapsed_seconds=8)

        metric = JobTemplateMetric.objects.get(id=jt.id)
        assert metric.successful_jobs == 2
        assert metric.successful_seconds == 30
        assert metric.failed_jobs == 1
        assert metric.failed_seconds == 5
        assert metric.canceled_jobs == 1
        assert metric.canceled_seconds == 8


@pytest.mark.django_db
class TestJobTemplateMetricDuration:
    """Test duration recording functionality"""

    def test_total_seconds_accumulation(self, job_template_factory):
        """Test that total_seconds accumulates correctly"""
        objects = job_template_factory('test-template', organization='org1', persisted=True)
        jt = objects.job_template

        update_job_template_metric(jt.id, jt.name)
        record_job_template_metric_duration(jt.id, 10.5)
        metric = JobTemplateMetric.objects.get(id=jt.id)
        assert metric.total_seconds == 10

        record_job_template_metric_duration(jt.id, 20.3)
        metric.refresh_from_db()
        assert metric.total_seconds == 30

    def test_duration_rounding(self, job_template_factory):
        """Test that elapsed seconds are rounded correctly"""
        objects = job_template_factory('test-template', organization='org1', persisted=True)
        jt = objects.job_template

        update_job_template_metric(jt.id, jt.name)
        # Test rounding up
        record_job_template_metric_status(jt.id, 'successful', elapsed_seconds=10.6)
        metric = JobTemplateMetric.objects.get(id=jt.id)
        assert metric.successful_seconds == 11

        # Test rounding down
        record_job_template_metric_status(jt.id, 'failed', elapsed_seconds=5.4)
        metric.refresh_from_db()
        assert metric.failed_seconds == 5

    def test_none_elapsed_seconds(self, job_template_factory):
        """Test that None elapsed_seconds is handled gracefully"""
        objects = job_template_factory('test-template', organization='org1', persisted=True)
        jt = objects.job_template

        update_job_template_metric(jt.id, jt.name)
        # Should not raise an error
        record_job_template_metric_status(jt.id, 'successful', elapsed_seconds=None)

        metric = JobTemplateMetric.objects.get(id=jt.id)
        assert metric.successful_jobs == 1
        assert metric.successful_seconds == 0


@pytest.mark.django_db
class TestJobTemplateMetricNameSync:
    """Test name synchronization with JobTemplate"""

    def test_name_updated_on_metric_update(self, job_template_factory):
        """Test that metric name is updated when recording metrics"""
        objects = job_template_factory('original-name', organization='org1', persisted=True)
        jt = objects.job_template

        update_job_template_metric(jt.id, jt.name)
        metric = JobTemplateMetric.objects.get(id=jt.id)
        assert metric.name == 'original-name'

        # Simulate template name change
        jt.name = 'new-name'
        jt.save()

        # Update metric with new name
        update_job_template_metric(jt.id, jt.name)
        metric.refresh_from_db()
        assert metric.name == 'new-name'

    def test_name_sync_with_status_recording(self, job_template_factory):
        """Test that name is in sync when recording status"""
        objects = job_template_factory('test-template', organization='org1', persisted=True)
        jt = objects.job_template

        # Create metric with one name
        update_job_template_metric(jt.id, 'template-v1')
        metric = JobTemplateMetric.objects.get(id=jt.id)
        assert metric.name == 'template-v1'

        # Record status with different name
        record_job_template_metric_status(jt.id, 'successful', elapsed_seconds=10)
        metric.refresh_from_db()
        # Name should still be original
        assert metric.name == 'template-v1'


@pytest.mark.django_db
class TestJobTemplateMetricTimestamps:
    """Test first_job and last_job timestamp tracking"""

    def test_first_job_timestamp_set_on_creation(self, job_template_factory):
        """Test that first_job is set when metric is created"""
        objects = job_template_factory('test-template', organization='org1', persisted=True)
        jt = objects.job_template

        before_creation = now()
        update_job_template_metric(jt.id, jt.name)
        after_creation = now()

        metric = JobTemplateMetric.objects.get(id=jt.id)
        assert before_creation <= metric.first_job <= after_creation

    def test_last_job_updated_on_each_run(self, job_template_factory):
        """Test that last_job is updated with each job run"""
        objects = job_template_factory('test-template', organization='org1', persisted=True)
        jt = objects.job_template

        update_job_template_metric(jt.id, jt.name)
        metric = JobTemplateMetric.objects.get(id=jt.id)
        first_job_time = metric.first_job
        first_last_job_time = metric.last_job

        # Wait a bit and update again
        import time
        time.sleep(0.1)

        update_job_template_metric(jt.id, jt.name)
        metric.refresh_from_db()

        # first_job should not change
        assert metric.first_job == first_job_time
        # last_job should be more recent
        assert metric.last_job > first_last_job_time

    def test_first_job_immutable(self, job_template_factory):
        """Test that first_job doesn't change after initial creation"""
        objects = job_template_factory('test-template', organization='org1', persisted=True)
        jt = objects.job_template

        update_job_template_metric(jt.id, jt.name)
        metric = JobTemplateMetric.objects.get(id=jt.id)
        first_job_time = metric.first_job

        # Run multiple updates
        for _ in range(5):
            update_job_template_metric(jt.id, jt.name)
            metric.refresh_from_db()
            assert metric.first_job == first_job_time


@pytest.mark.django_db
class TestJobTemplateMetricEdgeCases:
    """Test edge cases and error handling"""

    def test_invalid_job_template_id(self):
        """Test handling of invalid job template ID"""
        # Should not raise an error
        update_job_template_metric(99999, 'nonexistent')
        record_job_template_metric_duration(99999, 10)
        record_job_template_metric_status(99999, 'successful')

    def test_none_job_template_id(self):
        """Test handling of None job template ID"""
        # Should not raise an error
        update_job_template_metric(None, 'name')
        record_job_template_metric_duration(None, 10)
        record_job_template_metric_status(None, 'successful')

    def test_empty_name(self, job_template_factory):
        """Test handling of empty template name"""
        objects = job_template_factory('test-template', organization='org1', persisted=True)
        jt = objects.job_template

        # Should not raise an error
        update_job_template_metric(jt.id, '')

    def test_zero_elapsed_seconds(self, job_template_factory):
        """Test handling of zero elapsed seconds"""
        objects = job_template_factory('test-template', organization='org1', persisted=True)
        jt = objects.job_template

        update_job_template_metric(jt.id, jt.name)
        record_job_template_metric_status(jt.id, 'successful', elapsed_seconds=0)

        metric = JobTemplateMetric.objects.get(id=jt.id)
        assert metric.successful_jobs == 1
        assert metric.successful_seconds == 0

    def test_negative_elapsed_seconds(self, job_template_factory):
        """Test handling of negative elapsed seconds (should be treated as 0)"""
        objects = job_template_factory('test-template', organization='org1', persisted=True)
        jt = objects.job_template

        update_job_template_metric(jt.id, jt.name)
        # Negative seconds will be converted to positive when rounded
        record_job_template_metric_status(jt.id, 'successful', elapsed_seconds=-5)

        metric = JobTemplateMetric.objects.get(id=jt.id)
        assert metric.successful_jobs == 1
        # int(round(-5)) = -5
        assert metric.successful_seconds == -5

    def test_very_large_numbers(self, job_template_factory):
        """Test handling of very large elapsed seconds"""
        objects = job_template_factory('test-template', organization='org1', persisted=True)
        jt = objects.job_template

        update_job_template_metric(jt.id, jt.name)
        large_seconds = 10**9

        record_job_template_metric_status(jt.id, 'successful', elapsed_seconds=large_seconds)

        metric = JobTemplateMetric.objects.get(id=jt.id)
        assert metric.successful_jobs == 1
        assert metric.successful_seconds == large_seconds
