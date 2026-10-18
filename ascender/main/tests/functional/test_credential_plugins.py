import pytest
from unittest import mock
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

    def test_says_why_vault_turned_the_job_down(self):
        response = mock.Mock(status_code=400)
        response.json.return_value = {'errors': ['error validating claims: claim "sub" does not match any associated bound claim values']}
        rejected = hashivault.requests.exceptions.HTTPError('400 Client Error', response=response)
        with mock.patch.object(hashivault, 'method_auth', side_effect=rejected):
            with pytest.raises(hashivault.requests.exceptions.HTTPError) as exc:
                hashivault.with_workload_identity_login(mock.Mock())(**self.kwargs)
        assert str(exc.value) == (
            'Vault turned down the workload identity login with role infra: HTTP 400, '
            'error validating claims: claim "sub" does not match any associated bound claim values'
        )
        assert exc.value.response is response

    def test_auth_path_defaults_to_jwt(self):
        # a credential made through the api has no default_auth_path stored
        kwargs = {k: v for k, v in self.kwargs.items() if k != 'default_auth_path'}
        with mock.patch.object(hashivault, 'revoke_self'), mock.patch('requests.Session.post') as post:
            post.return_value.json.return_value = {'auth': {'client_token': 'vault-token'}}
            hashivault.with_workload_identity_login(mock.Mock())(**kwargs)
        assert post.call_args.args == ('https://vault.example.com:8200/v1/auth/jwt/login',)

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
