import time
import uuid
from unittest import mock

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from django.core.cache import cache as django_cache
from django.test import RequestFactory
from rest_framework.exceptions import AuthenticationFailed

from awx.dab.jwt_consumer.awx.auth import AwxJWTAuthentication
from awx.dab.jwt_consumer.common.auth import JWTCommonAuth
from awx.dab.jwt_consumer.common.exceptions import InvalidTokenException
from awx.dab.resource_registry.models import Resource

# Coverage for the vendored awx.dab.jwt_consumer auth path (formerly covered
# by django-ansible-base's own test suite). AwxJWTAuthentication authenticates
# gateway-issued JWTs and syncs the old AWX Role model from gateway claims.

SERVICE_ID = str(uuid.uuid4())


@pytest.fixture(scope='module')
def rsa_keypair():
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.TraditionalOpenSSL,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()
    public_pem = (
        private_key.public_key()
        .public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        .decode()
    )
    return private_pem, public_pem


@pytest.fixture(autouse=True)
def jwt_key_settings(settings, rsa_keypair):
    # JWTCache stores the decryption key, user data, and claims hashes in the
    # django cache; clear it so tests cannot leak state into each other.
    django_cache.clear()
    settings.ANSIBLE_BASE_JWT_KEY = rsa_keypair[1]
    yield
    django_cache.clear()


def build_token(private_pem, ansible_id=None, username='jwt-user', claims_hash='initial-hash', is_superuser=False, **overrides):
    payload = {
        'version': '1',
        'iss': 'ansible-issuer',
        'aud': 'ansible-services',
        'exp': int(time.time()) + 600,
        'sub': str(ansible_id or uuid.uuid4()),
        'service_id': SERVICE_ID,
        'claims_hash': claims_hash,
        'user_data': {
            'username': username,
            'first_name': 'Jay',
            'last_name': 'Doubleyou-Tee',
            'email': f'{username}@example.com',
            'is_superuser': is_superuser,
        },
    }
    payload.update(overrides)
    return jwt.encode(payload, private_pem, algorithm='RS256')


def authenticate(token):
    request = RequestFactory().get('/api/v2/me/', HTTP_X_DAB_JW_TOKEN=token)
    return AwxJWTAuthentication().authenticate(request)


def claims_for(org_roles=(), team_roles=()):
    """Build a gateway claims payload granting roles over orgs/teams."""
    objects = {'organization': [], 'team': []}
    object_roles = {}
    for role_name, org in org_roles:
        idx = len(objects['organization'])
        objects['organization'].append({'ansible_id': str(Resource.get_resource_for_object(org).ansible_id), 'name': org.name})
        object_roles.setdefault(role_name, {'content_type': 'organization', 'objects': []})['objects'].append(idx)
    for role_name, team in team_roles:
        idx = len(objects['team'])
        objects['team'].append({'ansible_id': str(Resource.get_resource_for_object(team).ansible_id), 'name': team.name})
        object_roles.setdefault(role_name, {'content_type': 'team', 'objects': []})['objects'].append(idx)
    return {'objects': objects, 'object_roles': object_roles, 'global_roles': []}


@pytest.mark.django_db
def test_jwt_missing_header_is_not_authenticated():
    request = RequestFactory().get('/api/v2/me/')
    assert AwxJWTAuthentication().authenticate(request) is None


@pytest.mark.django_db
def test_jwt_creates_user_and_resource(rsa_keypair):
    ansible_id = str(uuid.uuid4())
    token = build_token(rsa_keypair[0], ansible_id=ansible_id, username='new-jwt-user')
    with mock.patch.object(JWTCommonAuth, '_fetch_jwt_claims_from_gateway', return_value=claims_for()):
        user, _ = authenticate(token)
    assert user.username == 'new-jwt-user'
    assert user.first_name == 'Jay'
    assert user.email == 'new-jwt-user@example.com'
    assert not user.is_superuser
    assert str(Resource.get_resource_for_object(user).ansible_id) == ansible_id


@pytest.mark.django_db
def test_jwt_reauth_returns_same_user(rsa_keypair):
    ansible_id = str(uuid.uuid4())
    token = build_token(rsa_keypair[0], ansible_id=ansible_id)
    with mock.patch.object(JWTCommonAuth, '_fetch_jwt_claims_from_gateway', return_value=claims_for()):
        first, _ = authenticate(token)
        second, _ = authenticate(token)
    assert first.pk == second.pk


@pytest.mark.django_db
def test_jwt_expired_token_rejected(rsa_keypair):
    token = build_token(rsa_keypair[0], exp=int(time.time()) - 10)
    # Expired tokens get the non-standard 498 Invalid Token response rather
    # than a plain 401 so the gateway can distinguish expiry from rejection.
    with pytest.raises(InvalidTokenException):
        authenticate(token)


@pytest.mark.django_db
def test_jwt_wrong_audience_rejected(rsa_keypair):
    token = build_token(rsa_keypair[0], aud='someone-else')
    with pytest.raises(AuthenticationFailed):
        authenticate(token)


@pytest.mark.django_db
def test_jwt_wrong_key_rejected(rsa_keypair):
    other_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    other_pem = other_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.TraditionalOpenSSL,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()
    token = build_token(other_pem)
    with pytest.raises(AuthenticationFailed):
        authenticate(token)


@pytest.mark.django_db
def test_jwt_claims_sync_old_rbac(rsa_keypair, organization, team):
    """Gateway claims grant old-RBAC role memberships."""
    ansible_id = str(uuid.uuid4())
    token = build_token(rsa_keypair[0], ansible_id=ansible_id)
    claims = claims_for(org_roles=[('Organization Admin', organization)], team_roles=[('Team Member', team)])
    with mock.patch.object(JWTCommonAuth, '_fetch_jwt_claims_from_gateway', return_value=claims) as fetch:
        user, _ = authenticate(token)
    assert fetch.call_count == 1
    assert user in organization.admin_role.members.all()
    assert user in team.member_role.members.all()


@pytest.mark.django_db
def test_jwt_claims_hash_cached_skips_refetch(rsa_keypair, organization):
    ansible_id = str(uuid.uuid4())
    token = build_token(rsa_keypair[0], ansible_id=ansible_id, claims_hash='hash-one')
    claims = claims_for(org_roles=[('Organization Admin', organization)])
    with mock.patch.object(JWTCommonAuth, '_fetch_jwt_claims_from_gateway', return_value=claims) as fetch:
        authenticate(token)
        authenticate(token)
    assert fetch.call_count == 1


@pytest.mark.django_db
def test_jwt_stale_roles_removed_on_new_claims(rsa_keypair, organization, team):
    """A later JWT whose claims dropped a role revokes the old membership."""
    ansible_id = str(uuid.uuid4())

    token = build_token(rsa_keypair[0], ansible_id=ansible_id, claims_hash='hash-one')
    claims = claims_for(org_roles=[('Organization Admin', organization)], team_roles=[('Team Member', team)])
    with mock.patch.object(JWTCommonAuth, '_fetch_jwt_claims_from_gateway', return_value=claims):
        user, _ = authenticate(token)
    assert user in organization.admin_role.members.all()

    token = build_token(rsa_keypair[0], ansible_id=ansible_id, claims_hash='hash-two')
    claims = claims_for(team_roles=[('Team Member', team)])
    with mock.patch.object(JWTCommonAuth, '_fetch_jwt_claims_from_gateway', return_value=claims):
        user, _ = authenticate(token)
    assert user not in organization.admin_role.members.all()
    assert user in team.member_role.members.all()


@pytest.mark.django_db
def test_jwt_locally_granted_roles_survive_claims_sync(rsa_keypair, organization, team, bob):
    """Claims sync only manages the JWT-managed role fields for the JWT user;
    other users and locally-granted roles are untouched."""
    organization.admin_role.members.add(bob)
    ansible_id = str(uuid.uuid4())
    token = build_token(rsa_keypair[0], ansible_id=ansible_id)
    claims = claims_for(team_roles=[('Team Member', team)])
    with mock.patch.object(JWTCommonAuth, '_fetch_jwt_claims_from_gateway', return_value=claims):
        authenticate(token)
    assert bob in organization.admin_role.members.all()
