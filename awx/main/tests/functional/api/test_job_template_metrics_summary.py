import pytest

from awx.api.versioning import reverse
from awx.main.models.jobs import JobTemplateMetricsSummary
from awx.main.tasks.job_template_metrics import (
    update_job_template_metric,
    record_job_template_metric_duration,
    record_job_template_metric_status,
)


@pytest.mark.django_db
class TestJobTemplateMetricsSummaryAPI:
    """Test JobTemplateMetricsSummary API endpoint"""

    def test_summary_endpoint_exists(self, get, admin_user):
        """Test that the summary endpoint is accessible"""
        url = reverse('api:job_template_metrics_summary_view')
        response = get(url, user=admin_user)
        if response.status_code != 200:
            print(f"\n\nDEBUG: response.status_code = {response.status_code}")
            print(f"DEBUG: response.data = {response.data}\n\n")
        assert response.status_code == 200

    def test_summary_returns_aggregated_data(self, get, admin_user, job_template_factory):
        """Test that summary endpoint returns aggregated data from all templates"""
        # Create first template with jobs
        objects1 = job_template_factory('template-1', organization='org1', persisted=True)
        jt1 = objects1.job_template
        update_job_template_metric(jt1.id, jt1.name)
        record_job_template_metric_status(jt1.id, 'successful', elapsed_seconds=10)
        
        # Create second template with jobs
        objects2 = job_template_factory('template-2', organization='org2', persisted=True)
        jt2 = objects2.job_template
        update_job_template_metric(jt2.id, jt2.name)
        record_job_template_metric_status(jt2.id, 'successful', elapsed_seconds=20)
        update_job_template_metric(jt2.id, jt2.name)
        record_job_template_metric_status(jt2.id, 'failed', elapsed_seconds=5)
        
        # Get summary
        url = reverse('api:job_template_metrics_summary_view')
        response = get(url, user=admin_user)
        
        assert response.status_code == 200
        # Response should be a dictionary, not a list
        assert isinstance(response.data, dict)
        assert response.data['total_jobs'] == 3  # 1 + 1 + 1
        assert response.data['successful_jobs'] == 2  # 1 + 1
        assert response.data['successful_seconds'] == 30  # 10 + 20
        assert response.data['failed_jobs'] == 1
        assert response.data['failed_seconds'] == 5

    def test_summary_includes_all_fields(self, get, admin_user):
        """Test that summary serializer includes all expected fields"""
        from django.utils.timezone import now
        summary, created = JobTemplateMetricsSummary.objects.get_or_create(
            id=1,
            defaults={
                'first_job': now(),
                'last_job': now(),
            }
        )
        
        url = reverse('api:job_template_metrics_summary_view')
        response = get(url, user=admin_user)

        assert response.status_code == 200
        assert isinstance(response.data, dict)
        expected_fields = [
            'first_job',
            'last_job',
            'total_jobs',
            'total_seconds',
            'successful_jobs',
            'successful_seconds',
            'failed_jobs',
            'failed_seconds',
            'canceled_jobs',
            'canceled_seconds',
        ]
        for field in expected_fields:
            assert field in response.data
        # ID and URL should not be exposed
        assert 'id' not in response.data
        assert 'url' not in response.data

    def test_non_admin_cannot_access_summary(self, get, alice):
        """Test that non-admin users cannot access the summary endpoint"""
        url = reverse('api:job_template_metrics_summary_view')
        response = get(url, user=alice)
        assert response.status_code == 403

    def test_summary_tracking_multiple_templates(self, get, admin_user, job_template_factory):
        """Test that summary tracks metrics from multiple templates"""
        # Create multiple templates
        for i in range(3):
            objects = job_template_factory(f'template-{i}', organization=f'org{i}', persisted=True)
            jt = objects.job_template
            # Run 2 jobs per template
            update_job_template_metric(jt.id, jt.name)
            record_job_template_metric_duration(jt.id, 5)
            record_job_template_metric_status(jt.id, 'successful', elapsed_seconds=5)
            update_job_template_metric(jt.id, jt.name)
            record_job_template_metric_duration(jt.id, 3)
            record_job_template_metric_status(jt.id, 'failed', elapsed_seconds=3)
        
        url = reverse('api:job_template_metrics_summary_view')
        response = get(url, user=admin_user)
        
        assert response.status_code == 200
        assert isinstance(response.data, dict)
        # 3 templates * 2 jobs each = 6 total
        assert response.data['total_jobs'] == 6
        # 3 successful
        assert response.data['successful_jobs'] == 3
        # 3 failed
        assert response.data['failed_jobs'] == 3
        # 3 * 5 + 3 * 3 = 24
        assert response.data['total_seconds'] == 24

    def test_summary_singleton_behavior(self, get, admin_user, job_template_factory):
        """Test that there is only one summary record"""
        # Create multiple templates
        objects1 = job_template_factory('template-1', organization='org1', persisted=True)
        jt1 = objects1.job_template
        update_job_template_metric(jt1.id, jt1.name)
        
        objects2 = job_template_factory('template-2', organization='org2', persisted=True)
        jt2 = objects2.job_template
        update_job_template_metric(jt2.id, jt2.name)
        
        # Should only have one summary record
        summaries = JobTemplateMetricsSummary.objects.all()
        assert summaries.count() == 1
        assert summaries[0].total_jobs == 2
        
        # Response should be a simple dict, not paginated
        url = reverse('api:job_template_metrics_summary_view')
        response = get(url, user=admin_user)
        
        assert response.status_code == 200
        assert isinstance(response.data, dict)
        assert response.data['total_jobs'] == 2

