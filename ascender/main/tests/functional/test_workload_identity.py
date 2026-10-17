import json
import os
from unittest import mock
from unittest.mock import PropertyMock

import jwt
import pytest
from django.test.utils import override_settings

from ascender.api.versioning import reverse
from ascender.main.models import Credential, CredentialInputSource, CredentialType, WorkloadIdentityKey
from ascender.main.models.credential import build_safe_env
from ascender.main.utils import workload_identity

BASE_URL = 'https://ascender.example.com'
ISSUER = f'{BASE_URL}/api/o'
VAULT = 'https://vault.example.com:8200'

enabled = override_settings(WORKLOAD_IDENTITY_ENABLED=True, ASCENDER_URL_BASE=BASE_URL, WORKLOAD_IDENTITY_DEFAULT_TTL=300)

OIDC_TYPE_INPUTS = {
    'fields': [
        {'id': 'url', 'label': 'Server URL', 'type': 'string'},
        {'id': 'jwt_role', 'label': 'JWT Role', 'type': 'string'},
        {'id': 'workload_identity_token', 'label': 'Workload Identity Token', 'type': 'string', 'secret': True, 'internal': True},
    ],
    'metadata': [{'id': 'secret_key', 'label': 'Key', 'type': 'string'}],
    'required': ['url', 'jwt_role', 'secret_key'],
}


def verify(token, audience=VAULT):
    """Check a token the way Vault would: against the published keys."""
    kid = jwt.get_unverified_header(token)['kid']
    jwk = next(key for key in workload_identity.build_jwks()['keys'] if key['kid'] == kid)
    return jwt.decode(token, jwt.PyJWK(jwk).key, algorithms=['RS256'], audience=audience, issuer=ISSUER)


@pytest.fixture
def oidc_plugin():
    """An external type that asks for a token, with a plugin that records what it is handed."""
    calls = []

    class Plugin:
        def backend(self, **kwargs):
            calls.append(kwargs)
            return 'the-secret'

    with mock.patch('ascender.main.models.credential.CredentialType.plugin', new_callable=PropertyMock) as plugin:
        plugin.return_value = Plugin()
        credential_type = CredentialType.objects.create(kind='external', managed=True, name='Vault OIDC', inputs=OIDC_TYPE_INPUTS)
        yield credential_type, calls


@pytest.fixture
def input_sources():
    """The test session turns input sources off for every credential; these tests need them back."""
    with mock.patch.object(Credential, 'dynamic_input_fields', new=property(lambda self: [source.input_field_name for source in self.input_sources.all()])):
        yield


@pytest.fixture
def oidc_credential(oidc_plugin):
    return Credential.objects.create(credential_type=oidc_plugin[0], name='vault-oidc', inputs={'url': VAULT, 'jwt_role': 'infra'})


class TestSubject:
    def test_shape(self):
        claims = {'ascender_organization_name': 'infra', 'ascender_job_template_name': 'patch'}
        assert workload_identity.AutomationJobScope.subject(claims) == 'workload_type:ascender_automation_job:organization:infra:job_template:patch'

    def test_missing_parts_stay_in_place(self):
        assert workload_identity.AutomationJobScope.subject({}) == 'workload_type:ascender_automation_job:organization::job_template:'


@pytest.mark.django_db
class TestSigning:
    def test_needs_the_feature_on(self):
        with override_settings(WORKLOAD_IDENTITY_ENABLED=False, ASCENDER_URL_BASE=BASE_URL):
            with pytest.raises(workload_identity.WorkloadIdentityError, match='not enabled'):
                workload_identity.sign_token({}, VAULT)

    def test_needs_a_base_url(self):
        with override_settings(WORKLOAD_IDENTITY_ENABLED=True, ASCENDER_URL_BASE='https://ascenderhost'):
            with pytest.raises(workload_identity.WorkloadIdentityError, match='Base URL'):
                workload_identity.sign_token({}, VAULT)

    def test_needs_an_audience(self):
        with enabled:
            with pytest.raises(workload_identity.WorkloadIdentityError, match='audience'):
                workload_identity.sign_token({}, '')

    @enabled
    def test_verifies_against_the_published_keys(self):
        claims = {'ascender_organization_name': 'infra', 'ascender_job_template_name': 'patch', 'ascender_job_id': 7}
        payload = verify(workload_identity.sign_token(claims, VAULT))
        assert payload['ascender_job_id'] == 7
        assert payload['sub'] == 'workload_type:ascender_automation_job:organization:infra:job_template:patch'
        assert payload['iss'] == ISSUER
        assert payload['aud'] == VAULT
        assert payload['jti']

    @enabled
    def test_registered_claims_cannot_be_overridden(self):
        payload = verify(workload_identity.sign_token({'iss': 'https://evil', 'sub': 'admin', 'aud': 'other'}, VAULT))
        assert payload['iss'] == ISSUER
        assert payload['sub'].startswith('workload_type:ascender_automation_job:')

    @enabled
    def test_lifetime(self):
        payload = verify(workload_identity.sign_token({}, VAULT))
        assert payload['exp'] - payload['iat'] == 300 + workload_identity.CLOCK_SKEW_SECONDS
        payload = verify(workload_identity.sign_token({}, VAULT, ttl_seconds=3600))
        assert payload['exp'] - payload['iat'] == 3600 + workload_identity.CLOCK_SKEW_SECONDS

    @enabled
    def test_one_key_is_made_and_reused(self):
        first = jwt.get_unverified_header(workload_identity.sign_token({}, VAULT))['kid']
        second = jwt.get_unverified_header(workload_identity.sign_token({}, VAULT))['kid']
        assert first == second
        assert WorkloadIdentityKey.objects.count() == 1

    @enabled
    def test_private_key_is_stored_encrypted(self):
        workload_identity.sign_token({}, VAULT)
        key = WorkloadIdentityKey.objects.get()
        assert 'PRIVATE KEY' not in key.private_key
        assert key.get_private_key().startswith('-----BEGIN PRIVATE KEY-----')

    @enabled
    def test_rotation_keeps_the_previous_key_published(self):
        before = workload_identity.sign_token({}, VAULT)
        new, dropped = workload_identity.rotate_signing_key()
        assert dropped == []
        assert jwt.get_unverified_header(workload_identity.sign_token({}, VAULT))['kid'] == new.kid
        # signed by the key just rotated out, still valid
        verify(before)

        _, dropped = workload_identity.rotate_signing_key()
        assert dropped == [jwt.get_unverified_header(before)['kid']]
        assert WorkloadIdentityKey.objects.count() == 2
        with pytest.raises(StopIteration):
            verify(before)


@pytest.mark.django_db
class TestClaims:
    def test_job(self, job_factory, admin):
        job = job_factory()
        job.job_template.name = 'patch'
        job.job_template.save()
        claims = workload_identity.claims_for_unified_job(job)
        scope = workload_identity.AutomationJobScope
        assert claims[scope.CLAIM_JOB_ID] == job.id
        assert claims[scope.CLAIM_LAUNCH_TYPE] == 'manual'
        assert claims[scope.CLAIM_ORGANIZATION_NAME] == job.organization.name
        assert claims[scope.CLAIM_JOB_TEMPLATE_ID] == job.job_template.id
        assert claims[scope.CLAIM_PROJECT_NAME] == job.project.name
        assert claims[scope.CLAIM_INVENTORY_NAME] == job.inventory.name
        assert claims[scope.CLAIM_PLAYBOOK_NAME] == 'helloworld.yml'
        assert claims[scope.CLAIM_JOB_TYPE] == 'run'
        assert claims[scope.CLAIM_LAUNCHED_BY_NAME] == admin.username
        assert set(claims) <= set(scope.list_claims())

    def test_missing_relations_are_left_out(self, job_template, admin):
        job = job_template.create_unified_job(_eager_fields={'created_by': admin})
        claims = workload_identity.claims_for_unified_job(job)
        assert workload_identity.AutomationJobScope.CLAIM_INVENTORY_NAME not in claims
        assert None not in claims.values()

    def test_job_template(self, jt_linked):
        claims = workload_identity.claims_for_job_template(jt_linked)
        assert claims['ascender_job_template_id'] == jt_linked.id
        assert claims['ascender_organization_id'] == jt_linked.organization.id
        assert claims['ascender_project_id'] == jt_linked.project.id
        assert 'ascender_job_id' not in claims


@pytest.mark.django_db
class TestCurrentWorkload:
    def test_only_inside_a_running_job(self):
        with enabled:
            with pytest.raises(workload_identity.WorkloadIdentityError, match='running job'):
                workload_identity.token_for_current_workload(VAULT)

    @enabled
    def test_one_token_per_audience(self, job_factory):
        with workload_identity.workload_identity_for(job_factory(), ttl_seconds=600):
            first = workload_identity.token_for_current_workload(VAULT)
            assert workload_identity.token_for_current_workload(VAULT) == first
            other = workload_identity.token_for_current_workload('sts.amazonaws.com')
        assert verify(other, audience='sts.amazonaws.com')['jti'] != verify(first)['jti']
        assert verify(first)['exp'] - verify(first)['iat'] == 600 + workload_identity.CLOCK_SKEW_SECONDS

    @enabled
    def test_input_source_is_handed_a_token_for_the_job(self, job_factory, oidc_plugin, oidc_credential, credentialtype_ssh, input_sources):
        _, calls = oidc_plugin
        machine = Credential.objects.create(credential_type=credentialtype_ssh, name='linux-root', inputs={'username': 'root'})
        CredentialInputSource.objects.create(
            target_credential=machine, source_credential=oidc_credential, input_field_name='password', metadata={'secret_key': 'password'}
        )
        job = job_factory()
        with workload_identity.workload_identity_for(job):
            assert machine.get_input('password') == 'the-secret'
        payload = verify(calls[0]['workload_identity_token'])
        assert payload['ascender_job_id'] == job.id
        assert calls[0]['jwt_role'] == 'infra'

    @enabled
    def test_input_source_outside_a_job_fails(self, oidc_credential, credentialtype_ssh, input_sources):
        machine = Credential.objects.create(credential_type=credentialtype_ssh, name='linux-root', inputs={'username': 'root'})
        CredentialInputSource.objects.create(
            target_credential=machine, source_credential=oidc_credential, input_field_name='password', metadata={'secret_key': 'password'}
        )
        with pytest.raises(workload_identity.WorkloadIdentityError):
            machine.get_input('password')


@pytest.mark.django_db
class TestInjectedToken:
    @enabled
    def test_file_and_env(self, job_factory, tmp_path):
        os.mkdir(tmp_path / 'env')
        credential_type = CredentialType.defaults['oidc_workload_identity']()
        credential_type.save()
        credential = Credential.objects.create(credential_type=credential_type, name='aws', inputs={'audience': 'sts.amazonaws.com'})
        env, safe_env = {}, {}
        with workload_identity.workload_identity_for(job_factory()):
            credential.credential_type.inject_credential(credential, env, safe_env, [], str(tmp_path))
        token = env['ASCENDER_WORKLOAD_IDENTITY_TOKEN']
        assert verify(token, audience='sts.amazonaws.com')['aud'] == 'sts.amazonaws.com'
        assert env['ASCENDER_WORKLOAD_IDENTITY_TOKEN_FILE'].startswith('/runner/env/')
        written = tmp_path / 'env' / os.path.basename(env['ASCENDER_WORKLOAD_IDENTITY_TOKEN_FILE'])
        assert written.read_text() == token
        assert oct(written.stat().st_mode)[-3:] == '600'
        # never stored with the job
        assert token not in build_safe_env(env).values()
        assert token not in safe_env.values()


@pytest.mark.django_db
class TestInternalField:
    def test_hidden_from_the_type(self, get, admin, oidc_plugin):
        response = get(reverse('api:credential_type_detail', kwargs={'pk': oidc_plugin[0].pk}), admin)
        assert 'workload_identity_token' not in [f['id'] for f in response.data['inputs']['fields']]

    def test_cannot_be_stored(self, post, admin, oidc_plugin):
        response = post(
            reverse('api:credential_list'),
            {
                'name': 'x',
                'credential_type': oidc_plugin[0].pk,
                'user': admin.pk,
                'inputs': {'url': VAULT, 'jwt_role': 'r', 'workload_identity_token': 'forged'},
            },
            admin,
        )
        assert response.status_code == 400


@pytest.mark.django_db
class TestDiscovery:
    def test_off_by_default(self, get):
        assert get('/api/o/.well-known/openid-configuration').status_code == 404
        assert get('/api/o/.well-known/jwks.json').status_code == 404

    @enabled
    def test_openid_configuration(self, get):
        for path in ('/api/o/.well-known/openid-configuration', '/api/o/.well-known/openid-configuration/'):
            response = get(path)
            assert response.status_code == 200
            document = json.loads(response.content)
            assert document['issuer'] == ISSUER
            assert document['jwks_uri'] == f'{ISSUER}/.well-known/jwks.json'
            assert 'ascender_job_template_name' in document['claims_supported']

    @enabled
    def test_jwks(self, get):
        response = get('/api/o/.well-known/jwks.json')
        assert response.status_code == 200
        (key,) = json.loads(response.content)['keys']
        assert key['kty'] == 'RSA' and key['alg'] == 'RS256' and key['use'] == 'sig'
        assert 'd' not in key


@pytest.mark.django_db
class TestCredentialTest:
    def url(self, credential):
        return reverse('api:credential_external_test', kwargs={'pk': credential.pk})

    @enabled
    def test_needs_a_job_template(self, post, admin, oidc_credential):
        response = post(self.url(oidc_credential), {'metadata': {'secret_key': 'password'}}, admin)
        assert response.status_code == 400
        assert 'job template' in response.data['inputs']

    @enabled
    def test_signs_for_the_job_template(self, post, admin, oidc_plugin, oidc_credential, jt_linked):
        _, calls = oidc_plugin
        response = post(
            self.url(oidc_credential),
            {'inputs': {'workload_identity_token': 'forged'}, 'metadata': {'secret_key': 'password', 'job_template_id': jt_linked.pk}},
            admin,
        )
        assert response.status_code == 202
        sent = response.data['details']['sent_jwt_payload']
        assert sent['ascender_job_template_id'] == jt_linked.pk
        assert sent['aud'] == VAULT
        assert verify(calls[0]['workload_identity_token'])['ascender_job_template_id'] == jt_linked.pk
        assert 'job_template_id' not in calls[0]

    @enabled
    def test_needs_permission_to_launch_the_template(self, post, alice, oidc_credential, jt_linked):
        oidc_credential.use_role.members.add(alice)
        response = post(self.url(oidc_credential), {'metadata': {'secret_key': 'password', 'job_template_id': jt_linked.pk}}, alice)
        assert response.status_code == 403

    @enabled
    def test_type_test(self, post, admin, oidc_plugin, jt_linked):
        credential_type, calls = oidc_plugin
        response = post(
            reverse('api:credential_type_external_test', kwargs={'pk': credential_type.pk}),
            {'inputs': {'url': VAULT, 'jwt_role': 'infra'}, 'metadata': {'secret_key': 'password', 'job_template_id': jt_linked.pk}},
            admin,
        )
        assert response.status_code == 202
        assert verify(calls[0]['workload_identity_token'])['ascender_job_template_name'] == jt_linked.name
