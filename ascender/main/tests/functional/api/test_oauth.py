import base64
import json
from datetime import timedelta

import pytest

from django.db import connection
from django.test.utils import override_settings
from django.utils.timezone import now
from django.utils.encoding import smart_str, smart_bytes

from ascender.main.utils.encryption import decrypt_value, get_encryption_key
from ascender.api.versioning import reverse, drf_reverse
from ascender.main.models import ActivityStream
from ascender.main.models.oauth import OAuth2Application as Application, OAuth2AccessToken as AccessToken
from ascender.main.request_context import impersonate
from ascender.main.tests.functional import immediate_on_commit
from ascender.sso.models import UserEnterpriseAuth
from ascender.main.models.oauth import OAuth2RefreshToken


@pytest.mark.django_db
def test_personal_access_token_creation(oauth_application, post, alice):
    url = drf_reverse('api:oauth_authorization_root_view') + 'token/'
    resp = post(
        url,
        data='grant_type=password&username=alice&password=alice&scope=read',
        content_type='application/x-www-form-urlencoded',
        HTTP_AUTHORIZATION='Basic ' + smart_str(base64.b64encode(smart_bytes(':'.join([oauth_application.client_id, oauth_application.client_secret])))),
    )
    resp_json = smart_str(resp._container[0])
    assert 'access_token' in resp_json
    assert 'scope' in resp_json
    assert 'refresh_token' in resp_json


@pytest.mark.django_db
@pytest.mark.parametrize('allow_oauth, status', [(True, 201), (False, 403)])
def test_token_creation_disabled_for_external_accounts(oauth_application, post, alice, allow_oauth, status):
    UserEnterpriseAuth(user=alice, provider='saml').save()
    url = drf_reverse('api:oauth_authorization_root_view') + 'token/'

    with override_settings(ALLOW_OAUTH2_FOR_EXTERNAL_USERS=allow_oauth):
        resp = post(
            url,
            data='grant_type=password&username=alice&password=alice&scope=read',
            content_type='application/x-www-form-urlencoded',
            HTTP_AUTHORIZATION='Basic ' + smart_str(base64.b64encode(smart_bytes(':'.join([oauth_application.client_id, oauth_application.client_secret])))),
            status=status,
        )
        if allow_oauth:
            assert AccessToken.objects.count() == 1
        else:
            assert 'OAuth2 Tokens cannot be created by users associated with an external authentication provider' in smart_str(resp.content)  # noqa
            assert AccessToken.objects.count() == 0


@pytest.mark.django_db
def test_existing_token_enabled_for_external_accounts(oauth_application, get, post, admin):
    UserEnterpriseAuth(user=admin, provider='saml').save()
    url = drf_reverse('api:oauth_authorization_root_view') + 'token/'
    with override_settings(ALLOW_OAUTH2_FOR_EXTERNAL_USERS=True):
        resp = post(
            url,
            data='grant_type=password&username=admin&password=admin&scope=read',
            content_type='application/x-www-form-urlencoded',
            HTTP_AUTHORIZATION='Basic ' + smart_str(base64.b64encode(smart_bytes(':'.join([oauth_application.client_id, oauth_application.client_secret])))),
            status=201,
        )
        token = json.loads(resp.content)['access_token']
        assert AccessToken.objects.count() == 1

        with immediate_on_commit():
            resp = get(drf_reverse('api:user_me_list', kwargs={'version': 'v2'}), HTTP_AUTHORIZATION='Bearer ' + token, status=200)
            assert json.loads(resp.content)['results'][0]['username'] == 'admin'

    with override_settings(ALLOW_OAUTH2_FOR_EXTERNAL_USER=False):
        with immediate_on_commit():
            resp = get(drf_reverse('api:user_me_list', kwargs={'version': 'v2'}), HTTP_AUTHORIZATION='Bearer ' + token, status=200)
            assert json.loads(resp.content)['results'][0]['username'] == 'admin'


@pytest.mark.django_db
def test_pat_creation_no_default_scope(oauth_application, post, admin):
    # tests that the default scope is overriden
    url = reverse('api:o_auth2_token_list')
    response = post(
        url,
        {
            'description': 'test token',
            'scope': 'read',
            'application': oauth_application.pk,
        },
        admin,
    )
    assert response.data['scope'] == 'read'


@pytest.mark.django_db
def test_pat_creation_no_scope(oauth_application, post, admin):
    url = reverse('api:o_auth2_token_list')
    response = post(
        url,
        {
            'description': 'test token',
            'application': oauth_application.pk,
        },
        admin,
    )
    assert response.data['scope'] == 'write'


@pytest.mark.django_db
def test_oauth2_application_create(admin, organization, post):
    response = post(
        reverse('api:o_auth2_application_list'),
        {
            'name': 'test app',
            'organization': organization.pk,
            'client_type': 'confidential',
            'authorization_grant_type': 'password',
        },
        admin,
        expect=201,
    )
    assert 'modified' in response.data
    assert 'updated' not in response.data
    created_app = Application.objects.get(client_id=response.data['client_id'])
    assert created_app.name == 'test app'
    assert created_app.skip_authorization is False
    assert created_app.redirect_uris == ''
    assert created_app.client_type == 'confidential'
    assert created_app.authorization_grant_type == 'password'
    assert created_app.organization == organization


@pytest.mark.django_db
def test_oauth2_validator(admin, oauth_application, post):
    post(
        reverse('api:o_auth2_application_list'),
        {
            'name': 'Write App Token',
            'application': oauth_application.pk,
            'scope': 'Write',
        },
        admin,
        expect=400,
    )


@pytest.mark.django_db
def test_oauth_application_update(oauth_application, organization, patch, admin, alice):
    patch(
        reverse('api:o_auth2_application_detail', kwargs={'pk': oauth_application.pk}),
        {
            'name': 'Test app with immutable grant type and user',
            'organization': organization.pk,
            'redirect_uris': 'http://localhost/api/',
            'authorization_grant_type': 'password',
            'skip_authorization': True,
        },
        admin,
        expect=200,
    )
    updated_app = Application.objects.get(client_id=oauth_application.client_id)
    assert updated_app.name == 'Test app with immutable grant type and user'
    assert updated_app.redirect_uris == 'http://localhost/api/'
    assert updated_app.skip_authorization is True
    assert updated_app.authorization_grant_type == 'password'
    assert updated_app.organization == organization


@pytest.mark.django_db
def test_oauth_application_encryption(admin, organization, post):
    response = post(
        reverse('api:o_auth2_application_list'),
        {
            'name': 'test app',
            'organization': organization.pk,
            'client_type': 'confidential',
            'authorization_grant_type': 'password',
        },
        admin,
        expect=201,
    )
    pk = response.data.get('id')
    secret = response.data.get('client_secret')
    with connection.cursor() as cursor:
        encrypted = cursor.execute('SELECT client_secret FROM main_oauth2application WHERE id={}'.format(pk)).fetchone()[0]
        assert encrypted.startswith('$encrypted$')
        assert decrypt_value(get_encryption_key('value', pk=None), encrypted) == secret


@pytest.mark.django_db
def test_oauth_token_create(oauth_application, get, post, admin):
    response = post(reverse('api:o_auth2_application_token_list', kwargs={'pk': oauth_application.pk}), {'scope': 'read'}, admin, expect=201)
    assert 'modified' in response.data and response.data['modified'] is not None
    assert 'updated' not in response.data
    token = AccessToken.objects.get(token=response.data['token'])
    refresh_token = OAuth2RefreshToken.objects.get(token=response.data['refresh_token'])
    assert token.application == oauth_application
    assert refresh_token.application == oauth_application
    assert token.user == admin
    assert refresh_token.user == admin
    assert refresh_token.access_token == token
    assert token.scope == 'read'
    response = get(reverse('api:o_auth2_application_token_list', kwargs={'pk': oauth_application.pk}), admin, expect=200)
    assert response.data['count'] == 1
    response = get(reverse('api:o_auth2_application_detail', kwargs={'pk': oauth_application.pk}), admin, expect=200)
    assert response.data['summary_fields']['tokens']['count'] == 1
    assert response.data['summary_fields']['tokens']['results'][0] == {'id': token.pk, 'scope': token.scope, 'token': '************'}

    response = post(reverse('api:o_auth2_token_list'), {'scope': 'read', 'application': oauth_application.pk}, admin, expect=201)
    assert response.data['refresh_token']
    response = post(
        reverse('api:user_authorized_token_list', kwargs={'pk': admin.pk}), {'scope': 'read', 'application': oauth_application.pk}, admin, expect=201
    )
    assert response.data['refresh_token']
    response = post(reverse('api:application_o_auth2_token_list', kwargs={'pk': oauth_application.pk}), {'scope': 'read'}, admin, expect=201)
    assert response.data['refresh_token']


@pytest.mark.django_db
def test_oauth_token_update(oauth_application, post, patch, admin):
    response = post(reverse('api:o_auth2_application_token_list', kwargs={'pk': oauth_application.pk}), {'scope': 'read'}, admin, expect=201)
    token = AccessToken.objects.get(token=response.data['token'])
    patch(reverse('api:o_auth2_token_detail', kwargs={'pk': token.pk}), {'scope': 'write'}, admin, expect=200)
    token = AccessToken.objects.get(token=token.token)
    assert token.scope == 'write'


@pytest.mark.django_db
def test_oauth_token_delete(oauth_application, post, delete, get, admin):
    response = post(reverse('api:o_auth2_application_token_list', kwargs={'pk': oauth_application.pk}), {'scope': 'read'}, admin, expect=201)
    token = AccessToken.objects.get(token=response.data['token'])
    delete(reverse('api:o_auth2_token_detail', kwargs={'pk': token.pk}), admin, expect=204)
    assert AccessToken.objects.count() == 0
    assert OAuth2RefreshToken.objects.count() == 1
    response = get(reverse('api:o_auth2_application_token_list', kwargs={'pk': oauth_application.pk}), admin, expect=200)
    assert response.data['count'] == 0
    response = get(reverse('api:o_auth2_application_detail', kwargs={'pk': oauth_application.pk}), admin, expect=200)
    assert response.data['summary_fields']['tokens']['count'] == 0


@pytest.mark.django_db
def test_oauth_application_delete(oauth_application, post, delete, admin):
    post(reverse('api:o_auth2_application_token_list', kwargs={'pk': oauth_application.pk}), {'scope': 'read'}, admin, expect=201)
    delete(reverse('api:o_auth2_application_detail', kwargs={'pk': oauth_application.pk}), admin, expect=204)
    assert Application.objects.filter(client_id=oauth_application.client_id).count() == 0
    assert OAuth2RefreshToken.objects.filter(application=oauth_application).count() == 0
    assert AccessToken.objects.filter(application=oauth_application).count() == 0


@pytest.mark.django_db
def test_oauth_list_user_tokens(oauth_application, post, get, admin, alice):
    for user in (admin, alice):
        url = reverse('api:o_auth2_token_list', kwargs={'pk': user.pk})
        post(url, {'scope': 'read'}, user, expect=201)
        response = get(url, admin, expect=200)
        assert response.data['count'] == 1


@pytest.mark.django_db
def test_refresh_accesstoken(oauth_application, post, get, delete, admin):
    response = post(reverse('api:o_auth2_application_token_list', kwargs={'pk': oauth_application.pk}), {'scope': 'read'}, admin, expect=201)
    assert AccessToken.objects.count() == 1
    assert OAuth2RefreshToken.objects.count() == 1
    token = AccessToken.objects.get(token=response.data['token'])
    refresh_token = OAuth2RefreshToken.objects.get(token=response.data['refresh_token'])

    refresh_url = drf_reverse('api:oauth_authorization_root_view') + 'token/'
    response = post(
        refresh_url,
        data='grant_type=refresh_token&refresh_token=' + refresh_token.token,
        content_type='application/x-www-form-urlencoded',
        HTTP_AUTHORIZATION='Basic ' + smart_str(base64.b64encode(smart_bytes(':'.join([oauth_application.client_id, oauth_application.client_secret])))),
    )
    assert OAuth2RefreshToken.objects.filter(token=refresh_token.token).exists()
    original_refresh_token = OAuth2RefreshToken.objects.get(token=refresh_token.token)
    assert token not in AccessToken.objects.all()
    assert AccessToken.objects.count() == 1
    # the same OAuth2RefreshToken remains but is marked revoked
    assert OAuth2RefreshToken.objects.count() == 2
    new_token = json.loads(response._container[0])['access_token']
    new_refresh_token = json.loads(response._container[0])['refresh_token']
    assert AccessToken.objects.filter(token=new_token).count() == 1
    # checks that RefreshTokens are rotated (new OAuth2RefreshToken issued)
    assert OAuth2RefreshToken.objects.filter(token=new_refresh_token).count() == 1
    assert original_refresh_token.revoked  # is not None


@pytest.mark.django_db
def test_refresh_token_expiration_is_respected(oauth_application, post, get, delete, admin):
    response = post(reverse('api:o_auth2_application_token_list', kwargs={'pk': oauth_application.pk}), {'scope': 'read'}, admin, expect=201)
    assert AccessToken.objects.count() == 1
    assert OAuth2RefreshToken.objects.count() == 1
    refresh_token = OAuth2RefreshToken.objects.get(token=response.data['refresh_token'])
    refresh_url = drf_reverse('api:oauth_authorization_root_view') + 'token/'
    short_lived = {'ACCESS_TOKEN_EXPIRE_SECONDS': 1, 'AUTHORIZATION_CODE_EXPIRE_SECONDS': 1, 'REFRESH_TOKEN_EXPIRE_SECONDS': 1}
    # Age the token instead of waiting out its lifetime. TokenView checks
    # created + REFRESH_TOKEN_EXPIRE_SECONDS < now(), so sleeping exactly the
    # lifetime left the result resting on how long the request itself took.
    # An UPDATE rather than save(), because created is auto_now_add.
    OAuth2RefreshToken.objects.filter(pk=refresh_token.pk).update(created=now() - timedelta(seconds=60))
    with override_settings(OAUTH2_PROVIDER=short_lived):
        response = post(
            refresh_url,
            data='grant_type=refresh_token&refresh_token=' + refresh_token.token,
            content_type='application/x-www-form-urlencoded',
            HTTP_AUTHORIZATION='Basic ' + smart_str(base64.b64encode(smart_bytes(':'.join([oauth_application.client_id, oauth_application.client_secret])))),
        )
    assert response.status_code == 403
    assert b'The refresh token has expired.' in response.content
    assert OAuth2RefreshToken.objects.filter(token=refresh_token.token).exists()
    assert AccessToken.objects.count() == 1
    assert OAuth2RefreshToken.objects.count() == 1


@pytest.mark.django_db
def test_revoke_access_then_refreshtoken(oauth_application, post, get, delete, admin):
    response = post(reverse('api:o_auth2_application_token_list', kwargs={'pk': oauth_application.pk}), {'scope': 'read'}, admin, expect=201)
    token = AccessToken.objects.get(token=response.data['token'])
    refresh_token = OAuth2RefreshToken.objects.get(token=response.data['refresh_token'])
    assert AccessToken.objects.count() == 1
    assert OAuth2RefreshToken.objects.count() == 1

    token.revoke()
    assert AccessToken.objects.count() == 0
    assert OAuth2RefreshToken.objects.count() == 1
    assert not refresh_token.revoked

    refresh_token.revoke()
    assert AccessToken.objects.count() == 0
    assert OAuth2RefreshToken.objects.count() == 1


@pytest.mark.django_db
def test_revoke_refreshtoken(oauth_application, post, get, delete, admin):
    response = post(reverse('api:o_auth2_application_token_list', kwargs={'pk': oauth_application.pk}), {'scope': 'read'}, admin, expect=201)
    refresh_token = OAuth2RefreshToken.objects.get(token=response.data['refresh_token'])
    assert AccessToken.objects.count() == 1
    assert OAuth2RefreshToken.objects.count() == 1

    refresh_token.revoke()
    assert AccessToken.objects.count() == 0
    # the same OAuth2RefreshToken is recycled
    new_refresh_token = OAuth2RefreshToken.objects.all().first()
    assert refresh_token == new_refresh_token
    assert new_refresh_token.revoked


@pytest.mark.django_db
def test_rotated_refresh_token_cannot_be_reused(oauth_application, post, admin):
    """A refresh grant rotates: the superseded token is kept with a revoked
    timestamp rather than deleted, so presenting it again has to be refused."""
    response = post(reverse('api:o_auth2_application_token_list', kwargs={'pk': oauth_application.pk}), {'scope': 'read'}, admin, expect=201)
    refresh_token = OAuth2RefreshToken.objects.get(token=response.data['refresh_token'])
    refresh_url = drf_reverse('api:oauth_authorization_root_view') + 'token/'
    auth = 'Basic ' + smart_str(base64.b64encode(smart_bytes(':'.join([oauth_application.client_id, oauth_application.client_secret]))))

    first = post(
        refresh_url,
        data='grant_type=refresh_token&refresh_token=' + refresh_token.token,
        content_type='application/x-www-form-urlencoded',
        HTTP_AUTHORIZATION=auth,
    )
    assert first.status_code == 200
    superseded = OAuth2RefreshToken.objects.get(token=refresh_token.token)
    assert superseded.revoked is not None
    assert AccessToken.objects.count() == 1

    replay = post(
        refresh_url,
        data='grant_type=refresh_token&refresh_token=' + refresh_token.token,
        content_type='application/x-www-form-urlencoded',
        HTTP_AUTHORIZATION=auth,
    )
    assert replay.status_code == 400
    assert json.loads(replay.content)['error'] == 'invalid_grant'
    assert AccessToken.objects.count() == 1


@pytest.mark.django_db
def test_token_values_are_not_rendered_by_str(oauth_application, post, admin):
    """django-oauth-toolkit 3.4 stopped putting the secret in __str__, which
    reaches admin breadcrumbs, tracebacks and log output. Nothing in awx relies
    on the old behaviour, and this keeps it that way."""
    response = post(reverse('api:o_auth2_application_token_list', kwargs={'pk': oauth_application.pk}), {'scope': 'read'}, admin, expect=201)
    access_token = AccessToken.objects.get(token=response.data['token'])
    refresh_token = OAuth2RefreshToken.objects.get(token=response.data['refresh_token'])

    for obj in (access_token, refresh_token):
        assert obj.token not in str(obj)
        assert obj.token not in repr(obj)


@pytest.mark.django_db
def test_superuser_issues_personal_token_for_another_user(post, get, admin, alice):
    response = post(reverse('api:user_personal_token_list', kwargs={'pk': alice.pk}), {'description': 'ci', 'scope': 'read'}, admin, expect=201)
    token = AccessToken.objects.get(token=response.data['token'])
    assert token.user == alice
    assert token.application is None
    assert response.data['user'] == alice.pk
    with immediate_on_commit():
        resp = get(drf_reverse('api:user_me_list', kwargs={'version': 'v2'}), HTTP_AUTHORIZATION='Bearer ' + token.token, status=200)
    assert json.loads(resp.content)['results'][0]['username'] == 'alice'


@pytest.mark.django_db
@pytest.mark.parametrize('requester', ['alice', 'org_admin', 'system_auditor'])
def test_personal_token_for_another_user_needs_superuser(post, request, org_member, requester):
    # org_admin may change org_member (UserAccess), but personal tokens stay owner-or-superuser (OAuth2TokenAccess)
    user = request.getfixturevalue(requester)
    post(reverse('api:user_personal_token_list', kwargs={'pk': org_member.pk}), {'scope': 'read'}, user, expect=403)
    assert AccessToken.objects.count() == 0


@pytest.mark.django_db
def test_personal_token_for_missing_user(post, admin):
    post(reverse('api:user_personal_token_list', kwargs={'pk': 9999}), {'scope': 'read'}, admin, expect=404)
    assert AccessToken.objects.count() == 0


@pytest.mark.django_db
def test_personal_token_for_another_external_user(post, admin, alice):
    # the external-account check applies to the owner, not to the superuser issuing it
    UserEnterpriseAuth(user=alice, provider='saml').save()
    with override_settings(ALLOW_OAUTH2_FOR_EXTERNAL_USERS=False):
        response = post(reverse('api:user_personal_token_list', kwargs={'pk': alice.pk}), {'scope': 'read'}, admin, expect=403)
    assert 'external authentication provider' in str(response.data['detail'])
    assert AccessToken.objects.count() == 0


@pytest.mark.django_db
def test_personal_token_for_another_inactive_user(post, admin, alice):
    alice.is_active = False
    alice.save()
    response = post(reverse('api:user_personal_token_list', kwargs={'pk': alice.pk}), {'scope': 'read'}, admin, expect=400)
    assert 'inactive user' in str(response.data)
    assert AccessToken.objects.count() == 0


@pytest.mark.django_db
@pytest.mark.parametrize('ldap_dn, status', [('', 400), ('cn=alice,dc=example,dc=org', 201)])
def test_personal_token_for_another_user_with_local_auth_disabled(post, admin, alice, ldap_dn, status):
    alice.profile.ldap_dn = ldap_dn
    alice.profile.save()
    with override_settings(DISABLE_LOCAL_AUTH=True):
        response = post(reverse('api:user_personal_token_list', kwargs={'pk': alice.pk}), {'scope': 'read'}, admin, expect=status)
    if status == 400:
        assert 'local authentication is disabled' in str(response.data)
    assert AccessToken.objects.filter(user=alice).count() == (1 if status == 201 else 0)


@pytest.mark.django_db
@pytest.mark.parametrize('requester', ['admin', 'alice'])
def test_personal_token_for_self(post, request, requester):
    user = request.getfixturevalue(requester)
    for url in (reverse('api:user_personal_token_list', kwargs={'pk': user.pk}), reverse('api:o_auth2_token_list')):
        response = post(url, {'scope': 'read'}, user, expect=201)
        token = AccessToken.objects.get(token=response.data['token'])
        assert token.user == user
        assert token.application is None


@pytest.mark.django_db
def test_other_token_sub_urls_still_issue_to_the_requester(post, admin, org_admin, org_member, organization):
    # users/<id>/tokens/ and authorized_tokens/ share the permission check, but keep issuing to the requester
    app = Application.objects.create(name='app', client_type='confidential', authorization_grant_type='password', organization=organization)
    urls = [
        (reverse('api:o_auth2_token_list', kwargs={'pk': org_member.pk}), {'scope': 'read'}),
        (reverse('api:user_authorized_token_list', kwargs={'pk': org_member.pk}), {'scope': 'read', 'application': app.pk}),
    ]
    for url, data in urls:
        post(url, data, org_admin, expect=403)
        response = post(url, data, admin, expect=201)
        assert AccessToken.objects.get(token=response.data['token']).user == admin
    assert not AccessToken.objects.filter(user=org_member).exists()


@pytest.mark.django_db
def test_personal_token_list_is_the_url_users(oauth_application, post, get, admin, alice, bob, system_auditor):
    for user in (admin, alice):
        post(reverse('api:user_personal_token_list', kwargs={'pk': user.pk}), {'scope': 'read'}, user, expect=201)
    # an application token is not a personal one
    post(reverse('api:o_auth2_application_token_list', kwargs={'pk': oauth_application.pk}), {'scope': 'read'}, admin, expect=201)

    def owners(owner, requester):
        response = get(reverse('api:user_personal_token_list', kwargs={'pk': owner.pk}), requester, expect=200)
        return [t['user'] for t in response.data['results']]

    assert owners(alice, admin) == [alice.pk]
    assert owners(alice, alice) == [alice.pk]
    assert owners(alice, system_auditor) == [alice.pk]
    assert owners(admin, admin) == [admin.pk]
    # alice can see the admin user, but not the admin's tokens
    assert owners(admin, alice) == []
    # bob can't see alice at all
    get(reverse('api:user_personal_token_list', kwargs={'pk': alice.pk}), bob, expect=403)


@pytest.mark.django_db
def test_personal_token_for_another_user_activity_stream(post, get, admin, alice, settings):
    settings.ACTIVITY_STREAM_ENABLED = True
    # the request middleware sets the actor in production; the test client calls the view directly
    with impersonate(admin):
        response = post(reverse('api:user_personal_token_list', kwargs={'pk': alice.pk}), {'scope': 'read'}, admin, expect=201)
        own = post(reverse('api:user_personal_token_list', kwargs={'pk': admin.pk}), {'scope': 'read'}, admin, expect=201)

    entry = ActivityStream.objects.get(operation='create', o_auth2_access_token__token=response.data['token'])
    assert entry.actor == admin
    assert json.loads(entry.changes)['user'] == 'alice ({})'.format(alice.pk)
    assert list(entry.user.all()) == [alice]
    alice_stream = get(reverse('api:user_activity_stream_list', kwargs={'pk': alice.pk}), admin, expect=200)
    assert entry.pk in [e['id'] for e in alice_stream.data['results']]

    # a token the actor issues for themselves records nothing extra
    own_entry = ActivityStream.objects.get(operation='create', o_auth2_access_token__token=own.data['token'])
    assert own_entry.actor == admin
    assert 'user' not in json.loads(own_entry.changes)
    assert not own_entry.user.exists()
