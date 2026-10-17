import pytest
from unittest import mock

from django.test.utils import override_settings

from ascender.main.credential_plugins import hashivault


def test_azure_cloud_name_choices():
    from ascender.main.credential_plugins import azure_kv

    assert len(azure_kv.CLOUD_NAMES) > 0
    assert azure_kv.DEFAULT_CLOUD_NAME in azure_kv.CLOUD_NAMES
    cloud_field = next((f for f in azure_kv.azure_keyvault_inputs['fields'] if f['id'] == 'cloud_name'), None)
    assert cloud_field is not None, 'cloud_name field missing from azure_keyvault_inputs'
    assert cloud_field['choices'] == azure_kv.CLOUD_NAMES
    assert cloud_field['default'] == azure_kv.DEFAULT_CLOUD_NAME


@pytest.mark.parametrize(
    'cloud_name, expected_authority',
    [
        (None, 'login.microsoftonline.com'),
        ('AzureCloud', 'login.microsoftonline.com'),
        ('AzureUSGovernment', 'login.microsoftonline.us'),
        ('AzureChinaCloud', 'login.chinacloudapi.cn'),
        ('AzureGermanCloud', 'login.microsoftonline.de'),
    ],
)
def test_azure_backend_authority(cloud_name, expected_authority):
    from ascender.main.credential_plugins import azure_kv

    kwargs = {'tenant': 't', 'client': 'c', 'secret': 's', 'url': 'https://example.vault.azure.net', 'secret_field': 'foo'}
    if cloud_name is not None:
        kwargs['cloud_name'] = cloud_name
    # the SDK is imported inside the backend, so the patch has to land on the
    # module it is imported from rather than on azure_kv
    with mock.patch('azure.identity.ClientSecretCredential') as csc, mock.patch('azure.keyvault.secrets.SecretClient'):
        azure_kv.azure_keyvault_backend(**kwargs)
    assert csc.call_args.kwargs['authority'] == expected_authority


def test_azure_authority_hosts_match_the_sdk():
    """azure_kv spells the authority hosts out so it need not import the SDK.

    They are constants rather than a moving target, but if Microsoft ever
    changes one this is where it should fail.
    """
    from azure.identity import AzureAuthorityHosts

    from ascender.main.credential_plugins import azure_kv

    assert azure_kv.AUTHORITY_HOSTS['AzureChinaCloud'] == AzureAuthorityHosts.AZURE_CHINA
    assert azure_kv.AUTHORITY_HOSTS['AzureCloud'] == AzureAuthorityHosts.AZURE_PUBLIC_CLOUD
    assert azure_kv.AUTHORITY_HOSTS['AzureUSGovernment'] == AzureAuthorityHosts.AZURE_GOVERNMENT


AWS_SM_METADATA = {'region_name': 'us-west-2', 'secret_name': 'some/secret'}
AWS_ACCESS_KEY, AWS_SECRET_KEY = 'AKIAIOSFODNN7EXAMPLE', 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'


def test_aws_secretsmanager_keys_are_optional():
    from ascender.main.credential_plugins import aws_secretsmanager

    inputs = aws_secretsmanager.secrets_manager_inputs
    assert inputs['required'] == ['region_name', 'secret_name']
    assert [field['default'] for field in inputs['fields']] == ['', '']


AWS_SM_KEYLESS = {'absent': {}, 'empty': {'aws_access_key': '', 'aws_secret_key': ''}}


def aws_secretsmanager_lookup(allow_default_credentials, **keys):
    """Run the backend with boto3's Session mocked, and return that mock."""
    from ascender.main.credential_plugins import aws_secretsmanager

    # boto3 is imported inside the backend, so patch it where it is imported from
    with override_settings(AWS_SECRETS_MANAGER_ALLOW_DEFAULT_CREDENTIALS=allow_default_credentials), mock.patch('boto3.session.Session') as session:
        session.return_value.client.return_value.get_secret_value.return_value = {'SecretString': 'sentinel'}
        assert aws_secretsmanager.aws_secretsmanager_backend(**AWS_SM_METADATA, **keys) == 'sentinel'
    return session


@pytest.mark.django_db  # the setting is read for real: no database row, so its registered default
@pytest.mark.parametrize('keys', AWS_SM_KEYLESS.values(), ids=AWS_SM_KEYLESS.keys())
def test_aws_secretsmanager_keyless_lookup_is_refused_by_default(keys):
    """Without the setting, a lookup without keys never reaches boto3, so it cannot run as the controller's identity."""
    from ascender.main.credential_plugins import aws_secretsmanager

    with mock.patch('boto3.session.Session') as session:
        with pytest.raises(aws_secretsmanager.DefaultCredentialsNotAllowed, match='AWS_SECRETS_MANAGER_ALLOW_DEFAULT_CREDENTIALS is off'):
            aws_secretsmanager.aws_secretsmanager_backend(**AWS_SM_METADATA, **keys)
    session.assert_not_called()


@pytest.mark.django_db  # override_settings reads the setting back on exit
@pytest.mark.parametrize('keys', AWS_SM_KEYLESS.values(), ids=AWS_SM_KEYLESS.keys())
def test_aws_secretsmanager_keyless_lookup_uses_the_default_chain_when_allowed(keys):
    """With the setting on, absent or empty keys reach boto3 as None, so its default credential chain (IRSA, instance role) applies."""
    from ascender.main.credential_plugins import aws_secretsmanager

    session = aws_secretsmanager_lookup(True, **keys)
    client_kwargs = session.return_value.client.call_args.kwargs
    assert client_kwargs['aws_access_key_id'] is None
    assert client_kwargs['aws_secret_access_key'] is None
    # the chain ends at the instance metadata service: botocore is held to one 1 s attempt per request
    botocore_session = session.call_args.kwargs['botocore_session']
    assert botocore_session.get_config_variable('metadata_service_timeout') == aws_secretsmanager.METADATA_SERVICE_TIMEOUT == 1
    assert botocore_session.get_config_variable('metadata_service_num_attempts') == aws_secretsmanager.METADATA_SERVICE_NUM_ATTEMPTS == 1


@pytest.mark.django_db  # override_settings reads the setting back on exit
def test_aws_secretsmanager_metadata_limits_override_the_environment(monkeypatch):
    """AWS_METADATA_SERVICE_* on the controller cannot lengthen how long a lookup with no identity to find holds a worker."""
    monkeypatch.setenv('AWS_METADATA_SERVICE_TIMEOUT', '5')
    monkeypatch.setenv('AWS_METADATA_SERVICE_NUM_ATTEMPTS', '4')
    botocore_session = aws_secretsmanager_lookup(True).call_args.kwargs['botocore_session']
    assert botocore_session.get_config_variable('metadata_service_timeout') == 1
    assert botocore_session.get_config_variable('metadata_service_num_attempts') == 1


@pytest.mark.django_db  # override_settings reads the setting back on exit
@pytest.mark.parametrize('allow_default_credentials', [False, True], ids=['off', 'on'])
def test_aws_secretsmanager_supplied_keys_ignore_the_setting(allow_default_credentials):
    session = aws_secretsmanager_lookup(allow_default_credentials, aws_access_key=AWS_ACCESS_KEY, aws_secret_key=AWS_SECRET_KEY)
    client_kwargs = session.return_value.client.call_args.kwargs
    assert client_kwargs['aws_access_key_id'] == AWS_ACCESS_KEY
    assert client_kwargs['aws_secret_access_key'] == AWS_SECRET_KEY


@pytest.mark.django_db  # override_settings reads the setting back on exit
@pytest.mark.parametrize('allow_default_credentials', [False, True], ids=['off', 'on'])
@pytest.mark.parametrize(
    'keys, missing',
    [({'aws_access_key': AWS_ACCESS_KEY}, 'aws_secret_access_key'), ({'aws_access_key': '', 'aws_secret_key': AWS_SECRET_KEY}, 'aws_access_key_id')],
    ids=['access-key-only', 'secret-key-only'],
)
def test_aws_secretsmanager_one_key_never_reaches_the_chain(keys, missing, allow_default_credentials):
    """One key alone is a misconfiguration, not a request for the controller's identity: real botocore refuses it
    before it would consult the default chain, whatever the setting says."""
    import botocore.session
    from botocore.exceptions import PartialCredentialsError

    from ascender.main.credential_plugins import aws_secretsmanager

    with (
        override_settings(AWS_SECRETS_MANAGER_ALLOW_DEFAULT_CREDENTIALS=allow_default_credentials),
        mock.patch.object(botocore.session.Session, 'get_credentials') as get_credentials,
    ):
        with pytest.raises(PartialCredentialsError, match=missing):
            aws_secretsmanager.aws_secretsmanager_backend(**AWS_SM_METADATA, **keys)
    get_credentials.assert_not_called()


AWS_SM_CALLER_ARN = 'arn:aws:sts::123456789012:assumed-role/ascender-controller/i-0123456789abcdef0'


def aws_secretsmanager_failure(allow_default_credentials, failure, at='get_secret_value', **keys):
    """Run the backend with boto3's Session mocked to fail like AWS does, either when the client is created (where
    container credential providers fetch credentials) or in get_secret_value, and return the exception raised."""
    from ascender.main.credential_plugins import aws_secretsmanager

    with override_settings(AWS_SECRETS_MANAGER_ALLOW_DEFAULT_CREDENTIALS=allow_default_credentials), mock.patch('boto3.session.Session') as session:
        if at == 'client':
            session.return_value.client.side_effect = failure
        else:
            session.return_value.client.return_value.get_secret_value.side_effect = failure
        with pytest.raises(Exception) as excinfo:
            aws_secretsmanager.aws_secretsmanager_backend(**AWS_SM_METADATA, **keys)
    return excinfo.value


def aws_denied(operation='GetSecretValue'):
    from botocore.exceptions import ClientError

    return ClientError(
        {'Error': {'Code': 'AccessDeniedException', 'Message': f'User: {AWS_SM_CALLER_ARN} is not authorized to perform: {operation}'}}, operation
    )


def aws_credential_endpoint_failure():
    from botocore.exceptions import CredentialRetrievalError

    return CredentialRetrievalError(provider='container-role', error_msg=f'Received non 200 response (403) from container metadata: {AWS_SM_CALLER_ARN}')


def assert_no_caller_identity(exc):
    import traceback

    from ascender.main.credential_plugins import aws_secretsmanager

    assert isinstance(exc, aws_secretsmanager.DefaultCredentialsLookupError)
    formatted = ''.join(traceback.format_exception(exc))
    assert AWS_SM_CALLER_ARN not in formatted
    assert '123456789012' not in formatted
    assert AWS_SM_METADATA['secret_name'] not in str(exc)


@pytest.mark.django_db  # override_settings reads the setting back on exit
@pytest.mark.parametrize('keys', AWS_SM_KEYLESS.values(), ids=AWS_SM_KEYLESS.keys())
@pytest.mark.parametrize(
    'failure, at, detail',
    [
        (aws_denied, 'get_secret_value', 'AccessDeniedException from GetSecretValue'),
        (lambda: aws_denied('AssumeRoleWithWebIdentity'), 'get_secret_value', 'AccessDeniedException from AssumeRoleWithWebIdentity'),
        (aws_credential_endpoint_failure, 'client', 'CredentialRetrievalError'),
    ],
    ids=['secretsmanager-denied', 'sts-denied', 'credential-endpoint'],
)
def test_aws_secretsmanager_keyless_error_hides_the_controller_identity(keys, failure, at, detail):
    """A job stores and logs the full traceback of a failed lookup, and any user who can read the job sees it, so a
    lookup made with the controller's identity must carry neither AWS's nor botocore's error text, which can name that
    identity, wherever it fails; the error code and operation still say where to look."""
    exc = aws_secretsmanager_failure(True, failure(), at=at, **keys)
    assert_no_caller_identity(exc)
    assert detail in str(exc)


@pytest.mark.django_db  # override_settings reads the setting back on exit
@pytest.mark.parametrize('failure, at', [(aws_denied, 'get_secret_value'), (aws_credential_endpoint_failure, 'client')], ids=['denied', 'credential-endpoint'])
def test_aws_secretsmanager_supplied_keys_keep_the_aws_error(failure, at):
    """With the user's own keys, the error is about the user's identity, so it passes through unchanged for debugging."""
    original = failure()
    exc = aws_secretsmanager_failure(False, original, at=at, aws_access_key=AWS_ACCESS_KEY, aws_secret_key=AWS_SECRET_KEY)
    assert exc is original


def test_hashivault_approle_auth():
    kwargs = {
        'role_id': 'the_role_id',
        'secret_id': 'the_secret_id',
    }
    expected_res = {
        'role_id': 'the_role_id',
        'secret_id': 'the_secret_id',
    }
    res = hashivault.approle_auth(**kwargs)
    assert res == expected_res


def test_hashivault_kubernetes_auth():
    kwargs = {
        'kubernetes_role': 'the_kubernetes_role',
    }
    expected_res = {
        'role': 'the_kubernetes_role',
        'jwt': 'the_jwt',
    }
    with mock.patch('pathlib.Path') as path_mock:
        mock.mock_open(path_mock.return_value.open, read_data='the_jwt')
        res = hashivault.kubernetes_auth(**kwargs)
        path_mock.assert_called_with('/var/run/secrets/kubernetes.io/serviceaccount/token')
        assert res == expected_res


def test_hashivault_client_cert_auth_explicit_role():
    kwargs = {
        'client_cert_role': 'test-cert-1',
    }
    expected_res = {
        'name': 'test-cert-1',
    }
    res = hashivault.client_cert_auth(**kwargs)
    assert res == expected_res


def test_hashivault_client_cert_auth_no_role():
    kwargs = {}
    expected_res = {
        'name': None,
    }
    res = hashivault.client_cert_auth(**kwargs)
    assert res == expected_res


def test_hashivault_userpass_auth():
    kwargs = {'username': 'the_username', 'password': 'the_password'}
    expected_res = {'username': 'the_username', 'password': 'the_password'}
    res = hashivault.userpass_auth(**kwargs)
    assert res == expected_res


def test_hashivault_handle_auth_token():
    kwargs = {
        'token': 'the_token',
    }
    token = hashivault.handle_auth(**kwargs)
    assert token == kwargs['token']


def test_hashivault_handle_auth_approle():
    kwargs = {
        'role_id': 'the_role_id',
        'secret_id': 'the_secret_id',
    }
    with mock.patch.object(hashivault, 'method_auth') as method_mock:
        method_mock.return_value = 'the_token'
        token = hashivault.handle_auth(**kwargs)
        method_mock.assert_called_with(**kwargs, auth_param=kwargs)
        assert token == 'the_token'


def test_hashivault_handle_auth_kubernetes():
    kwargs = {
        'kubernetes_role': 'the_kubernetes_role',
    }
    with mock.patch.object(hashivault, 'method_auth') as method_mock:
        with mock.patch('pathlib.Path') as path_mock:
            mock.mock_open(path_mock.return_value.open, read_data='the_jwt')
            method_mock.return_value = 'the_token'
            token = hashivault.handle_auth(**kwargs)
            method_mock.assert_called_with(**kwargs, auth_param={'role': 'the_kubernetes_role', 'jwt': 'the_jwt'})
            assert token == 'the_token'


def test_hashivault_handle_auth_client_cert():
    kwargs = {
        'client_cert_public': "foo",
        'client_cert_private': "bar",
        'client_cert_role': 'test-cert-1',
    }
    auth_params = {
        'name': 'test-cert-1',
    }
    with mock.patch.object(hashivault, 'method_auth') as method_mock:
        method_mock.return_value = 'the_token'
        token = hashivault.handle_auth(**kwargs)
        method_mock.assert_called_with(**kwargs, auth_param=auth_params)
        assert token == 'the_token'


def test_hashivault_handle_auth_not_enough_args():
    with pytest.raises(Exception):
        hashivault.handle_auth()


class TestHashivaultOIDC:
    kwargs = {
        'url': 'https://vault.example.com:8200',
        'default_auth_path': 'jwt',
        'jwt_role': 'infra',
        'workload_identity_token': 'the.jwt',
        'api_version': 'v2',
        'secret_path': '/secret/linux/root',
        'secret_key': 'password',
    }

    def test_no_stored_secrets(self):
        for inputs in (hashivault.hashi_kv_oidc_inputs, hashivault.hashi_ssh_oidc_inputs):
            ids = [field['id'] for field in inputs['fields']]
            for stored in ('token', 'role_id', 'secret_id', 'username', 'password', 'client_cert_private', 'kubernetes_role'):
                assert stored not in ids
            token_field = next(field for field in inputs['fields'] if field['id'] == 'workload_identity_token')
            assert token_field['internal'] is True and token_field['secret'] is True
            assert 'jwt_role' in inputs['required']

    def test_old_types_are_untouched(self):
        ids = [field['id'] for field in hashivault.hashi_kv_inputs['fields']]
        assert 'workload_identity_token' not in ids and 'jwt_role' not in ids

    def test_logs_in_as_the_job_reads_and_revokes(self):
        with mock.patch.object(hashivault, 'method_auth', return_value='vault-token') as login, mock.patch.object(hashivault, 'revoke_self') as revoke:
            backend = mock.Mock(return_value='S3cr3to!')
            assert hashivault.with_workload_identity_login(backend)(**self.kwargs) == 'S3cr3to!'
        assert login.call_args.kwargs['auth_param'] == {'role': 'infra', 'jwt': 'the.jwt'}
        assert backend.call_args.kwargs['token'] == 'vault-token'
        assert revoke.call_args.args == ('vault-token',)

    def test_revokes_when_the_lookup_fails(self):
        with mock.patch.object(hashivault, 'method_auth', return_value='vault-token'), mock.patch.object(hashivault, 'revoke_self') as revoke:
            with pytest.raises(RuntimeError):
                hashivault.with_workload_identity_login(mock.Mock(side_effect=RuntimeError('password is not present')))(**self.kwargs)
        revoke.assert_called_once()

    def test_needs_a_token(self):
        with pytest.raises(Exception, match='workload identity token'):
            hashivault.with_workload_identity_login(mock.Mock())(**dict(self.kwargs, workload_identity_token=None))

    @pytest.mark.django_db
    def test_revoke_failure_is_swallowed(self):
        with mock.patch('requests.post', side_effect=Exception('batch tokens cannot be revoked')):
            hashivault.revoke_self('vault-token', **self.kwargs)

    def test_revoke_request(self):
        with mock.patch('requests.post') as post:
            hashivault.revoke_self('vault-token', **dict(self.kwargs, namespace='team'))
        assert post.call_args.args == ('https://vault.example.com:8200/v1/auth/token/revoke-self',)
        assert post.call_args.kwargs['headers'] == {'X-Vault-Token': 'vault-token', 'X-Vault-Namespace': 'team'}

    def test_auth_path_from_metadata_wins(self):
        with mock.patch.object(hashivault, 'revoke_self'), mock.patch('requests.Session.post') as post:
            post.return_value.json.return_value = {'auth': {'client_token': 'vault-token'}}
            hashivault.with_workload_identity_login(mock.Mock())(**dict(self.kwargs, auth_path='jwt-ascender'))
        assert post.call_args.args == ('https://vault.example.com:8200/v1/auth/jwt-ascender/login',)


class TestDelineaImports:
    """
    These module have a try-except for ImportError which will allow using the older library
    but we do not want the awx_devel image to have the older library,
    so these tests are designed to fail if these wind up using the fallback import
    """

    def test_dsv_import(self):
        from ascender.main.credential_plugins.dsv import SecretsVault  # noqa

        # assert this module as opposed to older thycotic.secrets.vault
        assert SecretsVault.__module__ == 'delinea.secrets.vault'

    def test_tss_import(self):
        from ascender.main.credential_plugins.tss import DomainPasswordGrantAuthorizer, PasswordGrantAuthorizer, SecretServer, ServerSecret  # noqa

        for cls in (DomainPasswordGrantAuthorizer, PasswordGrantAuthorizer, SecretServer, ServerSecret):
            # assert this module as opposed to older thycotic.secrets.server
            assert cls.__module__ == 'delinea.secrets.server'
