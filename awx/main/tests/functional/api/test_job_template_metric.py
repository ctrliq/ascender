import pytest

from awx.api.versioning import reverse
from awx.main.models.jobs import JobTemplateMetric
from awx.main.tasks.job_template_metrics import update_job_template_metric, record_job_template_metric_status


@pytest.mark.django_db
class TestJobTemplateMetricAPI:
    """Test JobTemplateMetric API endpoints"""

    def test_list_endpoint_exists(self, get, admin_user, job_template_factory):
        """Test that the list endpoint is accessible"""
        url = reverse('api:job_template_metric_list')
        response = get(url, user=admin_user)
        assert response.status_code == 200

    def test_list_endpoint_returns_metrics(self, get, admin_user, job_template_factory):
        """Test that list endpoint returns JobTemplateMetric objects"""
        # Create metrics
        objects = job_template_factory('test-template-1', organization='org1', persisted=True)
        jt1 = objects.job_template
        update_job_template_metric(jt1.id, jt1.name)

        objects = job_template_factory('test-template-2', organization='org2', persisted=True)
        jt2 = objects.job_template
        update_job_template_metric(jt2.id, jt2.name)

        url = reverse('api:job_template_metric_list')
        response = get(url, user=admin_user)

        assert response.status_code == 200
        assert response.data['count'] >= 2

    def test_detail_endpoint_exists(self, get, admin_user, job_template_factory):
        """Test that the detail endpoint is accessible"""
        objects = job_template_factory('test-template', organization='org1', persisted=True)
        jt = objects.job_template
        update_job_template_metric(jt.id, jt.name)

        url = reverse('api:job_template_metric_detail', kwargs={'pk': jt.id})
        response = get(url, user=admin_user)
        assert response.status_code == 200

    def test_detail_endpoint_returns_metric_data(self, get, admin_user, job_template_factory):
        """Test that detail endpoint returns correct metric data"""
        objects = job_template_factory('test-template', organization='org1', persisted=True)
        jt = objects.job_template
        # First job - successful
        update_job_template_metric(jt.id, jt.name)
        record_job_template_metric_status(jt.id, 'successful', elapsed_seconds=10)
        # Second job - failed
        update_job_template_metric(jt.id, jt.name)
        record_job_template_metric_status(jt.id, 'failed', elapsed_seconds=5)

        url = reverse('api:job_template_metric_detail', kwargs={'pk': jt.id})
        response = get(url, user=admin_user)

        assert response.status_code == 200
        assert response.data['name'] == 'test-template'
        assert response.data['total_jobs'] == 2
        assert response.data['successful_jobs'] == 1
        assert response.data['successful_seconds'] == 10
        assert response.data['failed_jobs'] == 1
        assert response.data['failed_seconds'] == 5

    def test_list_endpoint_ordered_by_name(self, get, admin_user, job_template_factory):
        """Test that list endpoint returns metrics ordered by name"""
        # Create metrics in non-alphabetical order
        for i, name in enumerate(['zebra', 'apple', 'middle']):
            objects = job_template_factory(f'{name}-template', organization=f'org{i}', persisted=True)
            jt = objects.job_template
            update_job_template_metric(jt.id, jt.name)

        url = reverse('api:job_template_metric_list')
        response = get(url, user=admin_user)

        assert response.status_code == 200
        names = [m['name'] for m in response.data['results']]
        # Should be ordered by name
        assert names == sorted(names)

    def test_serializer_includes_all_fields(self, get, admin_user, job_template_factory):
        """Test that serializer includes all expected fields"""
        objects = job_template_factory('test-template', organization='org1', persisted=True)
        jt = objects.job_template
        update_job_template_metric(jt.id, jt.name)

        url = reverse('api:job_template_metric_detail', kwargs={'pk': jt.id})
        response = get(url, user=admin_user)

        assert response.status_code == 200
        expected_fields = [
            'name',
            'url',
            'id',
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

    def test_non_admin_cannot_access_list(self, get, alice, job_template_factory):
        """Test that non-admin users cannot access the list endpoint"""
        objects = job_template_factory('test-template', organization='org1', persisted=True)
        jt = objects.job_template
        update_job_template_metric(jt.id, jt.name)

        url = reverse('api:job_template_metric_list')
        response = get(url, user=alice)
        assert response.status_code == 403

    def test_non_admin_cannot_access_detail(self, get, alice, job_template_factory):
        """Test that non-admin users cannot access the detail endpoint"""
        objects = job_template_factory('test-template', organization='org1', persisted=True)
        jt = objects.job_template
        update_job_template_metric(jt.id, jt.name)

        url = reverse('api:job_template_metric_detail', kwargs={'pk': jt.id})
        response = get(url, user=alice)
        assert response.status_code == 403

    def test_pagination_works(self, get, admin_user, job_template_factory):
        """Test that pagination works correctly on list endpoint"""
        # Create multiple metrics
        for i in range(5):
            objects = job_template_factory(f'template-{i}', organization=f'org{i}', persisted=True)
            jt = objects.job_template
            update_job_template_metric(jt.id, jt.name)

        url = reverse('api:job_template_metric_list')
        response = get(url, user=admin_user, QUERY_STRING='page_size=2')

        assert response.status_code == 200
        assert len(response.data['results']) <= 2
        assert 'next' in response.data or response.data['next'] is None

    def test_metric_url_field(self, get, admin_user, job_template_factory):
        """Test that URL field is correctly generated"""
        objects = job_template_factory('test-template', organization='org1', persisted=True)
        jt = objects.job_template
        update_job_template_metric(jt.id, jt.name)

        url = reverse('api:job_template_metric_detail', kwargs={'pk': jt.id})
        response = get(url, user=admin_user)

        assert response.status_code == 200
        assert response.data['url'].endswith(url)

    def test_id_field_matches_job_template_id(self, get, admin_user, job_template_factory):
        """Test that metric ID matches the job template ID"""
        objects = job_template_factory('test-template', organization='org1', persisted=True)
        jt = objects.job_template
        update_job_template_metric(jt.id, jt.name)

        url = reverse('api:job_template_metric_detail', kwargs={'pk': jt.id})
        response = get(url, user=admin_user)

        assert response.status_code == 200
        assert response.data['id'] == jt.id
