# Python
import pytest
from unittest import mock

# Django
from django.contrib.auth.models import User

# Ascender
from ascender.sso.backends import _get_or_set_enterprise_user
from ascender.sso.models import UserEnterpriseAuth


@pytest.mark.django_db
def test_fetch_user_if_exist(existing_tacacsplus_user):
    with mock.patch('ascender.sso.backends.logger') as mocked_logger:
        new_user = _get_or_set_enterprise_user("foo", "password", "tacacs+")
        mocked_logger.debug.assert_not_called()
        mocked_logger.warning.assert_not_called()
        assert new_user == existing_tacacsplus_user


@pytest.mark.django_db
def test_create_user_if_not_exist(existing_tacacsplus_user):
    with mock.patch('ascender.sso.backends.logger') as mocked_logger:
        new_user = _get_or_set_enterprise_user("bar", "password", "tacacs+")
        mocked_logger.debug.assert_called_once_with('Created enterprise user bar via TACACS+ backend.')
        assert new_user != existing_tacacsplus_user


@pytest.mark.django_db
def test_created_user_has_no_usable_password():
    new_user = _get_or_set_enterprise_user("bar", "password", "tacacs+")
    assert not new_user.has_usable_password()


@pytest.mark.django_db
def test_non_enterprise_user_does_not_get_pass(existing_normal_user):
    with mock.patch('ascender.sso.backends.logger') as mocked_logger:
        new_user = _get_or_set_enterprise_user("alice", "password", "tacacs+")
        mocked_logger.warning.assert_called_once_with('Enterprise user alice already defined in Tower.')
        assert new_user is None


@pytest.mark.django_db
def test_radius_does_not_adopt_local_user_without_password():
    """A local user with no usable password, such as a token-only account, is not a RADIUS user."""
    local_user = User.objects.create(username="svc", is_superuser=True)
    local_user.set_unusable_password()
    local_user.save()
    with mock.patch('ascender.sso.backends.logger') as mocked_logger:
        assert _get_or_set_enterprise_user("svc", "password", "radius") is None
        mocked_logger.warning.assert_called_once_with('Enterprise user svc already defined in Tower.')
    assert not UserEnterpriseAuth.objects.filter(user=local_user).exists()


@pytest.mark.django_db
def test_radius_user_with_enterprise_auth_logs_in():
    radius_user = User.objects.create(username="bob")
    radius_user.set_unusable_password()
    radius_user.save()
    UserEnterpriseAuth.objects.create(user=radius_user, provider='radius')
    assert _get_or_set_enterprise_user("bob", "password", "radius") == radius_user
