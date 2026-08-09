import pytest

from django.urls import reverse


@pytest.mark.django_db
@pytest.mark.parametrize('view_name', ['debug', 'task_manager', 'dependency_manager', 'workflow_manager'])
def test_debug_endpoints_require_superuser(get, admin_user, alice, view_name):
    """The /api/debug/ views trigger the schedulers and must not be anonymous.

    They previously used AllowAny, so an unauthenticated request could run the
    task/dependency/workflow managers.
    """
    url = reverse(f'api:{view_name}')

    # unauthenticated is rejected (was 200 under AllowAny)
    get(url, user=None, expect=401)
    # an authenticated non-superuser is forbidden
    get(url, user=alice, expect=403)
    # a superuser is permitted
    response = get(url, user=admin_user)
    assert response.status_code not in (401, 403)
