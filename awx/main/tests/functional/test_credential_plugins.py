import pytest
from unittest import mock
from awx.main.credential_plugins import hashivault


def test_azure_cloud_name_choices():
    from awx.main.credential_plugins import azure_kv

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
    from awx.main.credential_plugins import azure_kv

    kwargs = {'tenant': 't', 'client': 'c', 'secret': 's', 'url': 'https://example.vault.azure.net', 'secret_field': 'foo'}
    if cloud_name is not None:
        kwargs['cloud_name'] = cloud_name
    with mock.patch.object(azure_kv, 'ClientSecretCredential') as csc, mock.patch.object(azure_kv, 'SecretClient'):
        azure_kv.azure_keyvault_backend(**kwargs)
    assert csc.call_args.kwargs['authority'] == expected_authority


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


class TestDelineaImports:
    """
    These module have a try-except for ImportError which will allow using the older library
    but we do not want the awx_devel image to have the older library,
    so these tests are designed to fail if these wind up using the fallback import
    """

    def test_dsv_import(self):
        from awx.main.credential_plugins.dsv import SecretsVault  # noqa

        # assert this module as opposed to older thycotic.secrets.vault
        assert SecretsVault.__module__ == 'delinea.secrets.vault'

    def test_tss_import(self):
        from awx.main.credential_plugins.tss import DomainPasswordGrantAuthorizer, PasswordGrantAuthorizer, SecretServer, ServerSecret  # noqa

        for cls in (DomainPasswordGrantAuthorizer, PasswordGrantAuthorizer, SecretServer, ServerSecret):
            # assert this module as opposed to older thycotic.secrets.server
            assert cls.__module__ == 'delinea.secrets.server'
