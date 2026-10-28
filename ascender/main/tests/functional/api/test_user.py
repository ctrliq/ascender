from datetime import datetime, timezone
from unittest import mock

import pytest

from django.contrib.sessions.middleware import SessionMiddleware
from django.test.utils import override_settings

from ascender.main.models import User
from ascender.api.versioning import reverse
from ascender.sso.backends import RADIUSBackend

#
# user creation
#

EXAMPLE_USER_DATA = {"username": "affable", "first_name": "a", "last_name": "a", "email": "a@a.com", "is_superuser": False, "password": "r$TyKiOCb#ED"}


@pytest.mark.django_db
def test_user_create(post, admin):
    response = post(reverse('api:user_list'), EXAMPLE_USER_DATA, admin, middleware=SessionMiddleware(mock.Mock()))
    assert response.status_code == 201
    assert not response.data['is_superuser']
    assert not response.data['is_system_auditor']


@pytest.mark.django_db
@pytest.mark.parametrize("password", [None, ""])
def test_user_create_without_password(post, admin, password):
    """A user created without a password gets an unusable one, for token-only accounts."""
    user_attrs = {k: v for k, v in EXAMPLE_USER_DATA.items() if k != "password"}
    if password is not None:
        user_attrs["password"] = password
    response = post(reverse('api:user_list'), user_attrs, admin, middleware=SessionMiddleware(mock.Mock()))
    assert response.status_code == 201
    assert not User.objects.get(username=user_attrs["username"]).has_usable_password()


@pytest.mark.django_db
@override_settings(LOCAL_PASSWORD_MIN_LENGTH=12)
def test_user_create_without_password_ignores_complexity_settings(post, admin):
    """The local password rules govern a password that is set; they don't require one."""
    user_attrs = {k: v for k, v in EXAMPLE_USER_DATA.items() if k != "password"}
    response = post(reverse('api:user_list'), user_attrs, admin, middleware=SessionMiddleware(mock.Mock()))
    assert response.status_code == 201
    assert not User.objects.get(username=user_attrs["username"]).has_usable_password()


@pytest.mark.django_db
@override_settings(RADIUS_SERVER='radius.example.org')
def test_user_created_without_password_is_not_a_radius_user(post, admin):
    """A RADIUS principal with the same username must not take over a password-less local account."""
    user_attrs = {k: v for k, v in EXAMPLE_USER_DATA.items() if k != "password"}
    user_attrs["is_superuser"] = True
    response = post(reverse('api:user_list'), user_attrs, admin, middleware=SessionMiddleware(mock.Mock()))
    assert response.status_code == 201
    with mock.patch.object(RADIUSBackend, '_radius_auth', return_value=([], False, False)):
        assert RADIUSBackend().authenticate(None, user_attrs["username"], "radius-password") is None
        # The stubbed reply does log in a username that has no local account.
        assert RADIUSBackend().authenticate(None, "radius-only", "radius-password").username == "radius-only"


@pytest.mark.django_db
def test_fail_double_create_user(post, admin):
    response = post(reverse('api:user_list'), EXAMPLE_USER_DATA, admin, middleware=SessionMiddleware(mock.Mock()))
    assert response.status_code == 201

    response = post(reverse('api:user_list'), EXAMPLE_USER_DATA, admin, middleware=SessionMiddleware(mock.Mock()))
    assert response.status_code == 400


@pytest.mark.django_db
def test_creating_user_retains_session(post, admin):
    '''
    Creating a new user should not refresh a new session id for the current user.
    '''
    with mock.patch('ascender.api.serializers.user.update_session_auth_hash') as update_session_auth_hash:
        response = post(reverse('api:user_list'), EXAMPLE_USER_DATA, admin)
        assert response.status_code == 201
        assert not update_session_auth_hash.called


@pytest.mark.django_db
def test_blank_password_is_accepted_and_leaves_the_password_alone(patch, admin, alice):
    '''
    '' is the field's own default and _update_password reads it as no change,
    so sending it explicitly has to be accepted rather than rejected as blank.
    '''
    original = User.objects.get(pk=alice.pk).password

    patch(reverse('api:user_detail', kwargs={'pk': alice.pk}), {'password': ''}, admin, expect=200)

    assert User.objects.get(pk=alice.pk).password == original


@pytest.mark.django_db
def test_updating_own_password_refreshes_session(patch, admin):
    '''
    Updating your own password should refresh the session id.
    '''
    with mock.patch('ascender.api.serializers.user.update_session_auth_hash') as update_session_auth_hash:
        patch(reverse('api:user_detail', kwargs={'pk': admin.pk}), {'password': 'newpassword'}, admin, middleware=SessionMiddleware(mock.Mock()))
        assert update_session_auth_hash.called


@pytest.mark.django_db
def test_create_delete_create_user(post, delete, admin):
    response = post(reverse('api:user_list'), EXAMPLE_USER_DATA, admin, middleware=SessionMiddleware(mock.Mock()))
    assert response.status_code == 201

    response = delete(reverse('api:user_detail', kwargs={'pk': response.data['id']}), admin, middleware=SessionMiddleware(mock.Mock()))
    assert response.status_code == 204

    response = post(reverse('api:user_list'), EXAMPLE_USER_DATA, admin, middleware=SessionMiddleware(mock.Mock()))
    print(response.data)
    assert response.status_code == 201


@pytest.mark.django_db
def test_user_cannot_update_last_login(patch, admin):
    assert admin.last_login is None
    patch(reverse('api:user_detail', kwargs={'pk': admin.pk}), {'last_login': '2020-03-13T16:39:47.303016Z'}, admin, middleware=SessionMiddleware(mock.Mock()))
    assert User.objects.get(pk=admin.pk).last_login is None


@pytest.mark.django_db
def test_user_verify_attribute_created(admin, get):
    assert admin.created == admin.date_joined
    resp = get(reverse('api:user_detail', kwargs={'pk': admin.pk}), admin)
    assert resp.data['created'] == admin.date_joined

    # Use current time as reference - admin user should be created recently
    past = datetime(2020, 1, 1, tzinfo=timezone.utc).isoformat()
    future = datetime(2030, 1, 1, tzinfo=timezone.utc).isoformat()

    # Test that admin user is created after 2020 (should find 1)
    resp = get(reverse('api:user_list') + f'?created__gt={past}', admin)
    if 'count' in resp.data:
        assert resp.data['count'] >= 1
    else:
        results = resp.data.get('results', resp.data)
        if isinstance(results, list):
            assert len(results) >= 1
        else:
            assert (1 if results else 0) >= 1

    # Test that admin user is created before 2030 (should find 1)
    resp = get(reverse('api:user_list') + f'?created__lt={future}', admin)
    if 'count' in resp.data:
        assert resp.data['count'] >= 1
    else:
        results = resp.data.get('results', resp.data)
        if isinstance(results, list):
            assert len(results) >= 1
        else:
            assert (1 if results else 0) >= 1


@pytest.fixture
def identity_restricted(settings):
    settings.RESTRICT_USER_IDENTITY_TO_SUPERUSERS = True


@pytest.fixture
def member(alice, organization):
    organization.member_role.members.add(alice)
    return alice


def _create_in_org(post, organization, acting_user, **data):
    data = dict({'username': 'newbie', 'password': 'Passw0rd!x1'}, **data)
    return post(reverse('api:organization_users_list', kwargs={'pk': organization.pk}), data, acting_user, expect=None)


@pytest.mark.django_db
def test_org_admin_can_set_email_and_rename_when_identity_is_unrestricted(post, patch, org_admin, member, organization):
    assert _create_in_org(post, organization, org_admin, email='new@example.com').status_code == 201

    patch(reverse('api:user_detail', kwargs={'pk': member.pk}), {'username': 'renamed', 'email': 'renamed@example.com'}, org_admin, expect=200)

    member.refresh_from_db()
    assert (member.username, member.email) == ('renamed', 'renamed@example.com')


@pytest.mark.django_db
def test_org_admin_can_create_a_user_without_email_when_identity_is_restricted(post, org_admin, organization, identity_restricted):
    response = _create_in_org(post, organization, org_admin)

    assert response.status_code == 201
    assert User.objects.get(username='newbie').email == ''


@pytest.mark.django_db
def test_org_admin_cannot_create_a_user_with_email_when_identity_is_restricted(post, org_admin, organization, identity_restricted):
    response = _create_in_org(post, organization, org_admin, email='new@example.com')

    assert response.status_code == 400
    assert 'email' in response.data
    assert not User.objects.filter(username='newbie').exists()


@pytest.mark.django_db
def test_superuser_can_create_a_user_with_email_when_identity_is_restricted(post, admin, identity_restricted):
    post(reverse('api:user_list'), dict(EXAMPLE_USER_DATA, email='new@example.com'), admin, expect=201)

    assert User.objects.get(username=EXAMPLE_USER_DATA['username']).email == 'new@example.com'


@pytest.mark.django_db
@pytest.mark.parametrize('data', [{'username': 'renamed'}, {'email': 'renamed@example.com'}])
def test_org_admin_cannot_change_username_or_email_when_identity_is_restricted(patch, org_admin, member, identity_restricted, data):
    response = patch(reverse('api:user_detail', kwargs={'pk': member.pk}), data, org_admin, expect=400)

    assert set(response.data) == set(data)
    member.refresh_from_db()
    assert (member.username, member.email) == ('alice', '')


@pytest.mark.django_db
def test_org_admin_can_edit_other_fields_when_identity_is_restricted(patch, org_admin, member, identity_restricted):
    # The edit form submits the unchanged identity fields with the others.
    patch(
        reverse('api:user_detail', kwargs={'pk': member.pk}),
        {'first_name': 'Alicia', 'username': 'alice', 'email': ''},
        org_admin,
        expect=200,
    )

    assert User.objects.get(pk=member.pk).first_name == 'Alicia'


@pytest.mark.django_db
def test_user_cannot_change_own_email_when_identity_is_restricted(patch, alice, identity_restricted):
    # Changing their own username is refused for ordinary users whatever the setting.
    patch(reverse('api:user_detail', kwargs={'pk': alice.pk}), {'email': 'renamed@example.com'}, alice, expect=400)

    alice.refresh_from_db()
    assert alice.email == ''


@pytest.mark.django_db
def test_user_can_still_change_own_name_when_identity_is_restricted(patch, alice, identity_restricted):
    patch(reverse('api:user_detail', kwargs={'pk': alice.pk}), {'first_name': 'Alicia'}, alice, expect=200)

    assert User.objects.get(pk=alice.pk).first_name == 'Alicia'


@pytest.mark.django_db
def test_superuser_can_change_username_and_email_when_identity_is_restricted(patch, admin, alice, identity_restricted):
    patch(reverse('api:user_detail', kwargs={'pk': alice.pk}), {'username': 'renamed', 'email': 'renamed@example.com'}, admin, expect=200)

    alice.refresh_from_db()
    assert (alice.username, alice.email) == ('renamed', 'renamed@example.com')
