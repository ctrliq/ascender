from .plugin import CredentialPlugin

from django.utils.translation import gettext_lazy as _

# Cloud environment names as previously provided by msrestazure.azure_cloud
# (https://github.com/Azure/msrestazure-for-python/blob/master/msrestazure/azure_cloud.py).
# msrestazure is EOL (and pulled in the abandoned adal package); the AAD
# authority hosts now come from azure.identity. Microsoft Cloud Germany closed
# in 2021 - its literal host is kept (instead of the deprecated
# AzureAuthorityHosts.AZURE_GERMANY constant, which warns on access) so
# existing credentials keep validating.
DEFAULT_CLOUD_NAME = 'AzureCloud'
# These are the literal values of the AzureAuthorityHosts constants. They are
# spelled out so the module does not import azure.identity just to build this
# dict, the way the German host already was; test_credential_plugins asserts
# they still match what the SDK defines.
AUTHORITY_HOSTS = {
    'AzureChinaCloud': 'login.chinacloudapi.cn',
    'AzureGermanCloud': 'login.microsoftonline.de',
    DEFAULT_CLOUD_NAME: 'login.microsoftonline.com',
    'AzureUSGovernment': 'login.microsoftonline.us',
}
CLOUD_NAMES = sorted(AUTHORITY_HOSTS)


azure_keyvault_inputs = {
    'fields': [
        {
            'id': 'url',
            'label': _('Vault URL (DNS Name)'),
            'type': 'string',
            'format': 'url',
        },
        {
            'id': 'client',
            'label': _('Client ID'),
            'type': 'string',
            'help_text': _(
                'Required with a Client Secret. Without one, the client ID of the user-assigned managed identity '
                'or workload identity to use; leave blank to use the default identity of the environment.'
            ),
        },
        {
            'id': 'secret',
            'label': _('Client Secret'),
            'type': 'string',
            'secret': True,
            'help_text': _('Leave blank to authenticate with Azure Workload Identity or Managed Identity.'),
        },
        {
            'id': 'tenant',
            'label': _('Tenant ID'),
            'type': 'string',
            'help_text': _('Required with a Client Secret. Not used with Workload Identity or Managed Identity, which take the tenant from the environment.'),
        },
        {
            'id': 'cloud_name',
            'label': _('Cloud Environment'),
            'help_text': _(
                'Specify which azure cloud environment to use. Applies to Client Secret authentication; '
                'Workload Identity and Managed Identity take it from the environment.'
            ),
            'choices': CLOUD_NAMES,
            'default': DEFAULT_CLOUD_NAME,
        },
    ],
    'metadata': [
        {
            'id': 'secret_field',
            'label': _('Secret Name'),
            'type': 'string',
            'help_text': _('The name of the secret to look up.'),
        },
        {
            'id': 'secret_version',
            'label': _('Secret Version'),
            'type': 'string',
            'help_text': _('Used to specify a specific secret version (if left empty, the latest version will be used).'),
        },
    ],
    # client and tenant are required with a client secret; that is checked in
    # the backend, since a credential without a secret uses a managed identity
    'required': ['url', 'secret_field'],
}


def azure_keyvault_backend(**kwargs):
    # imported here rather than at module scope: every process that touches the
    # credential models loads every plugin through its entry point, so a module
    # level import makes each of them pay for the SDK whether or not an Azure
    # credential is ever used
    if kwargs.get('secret'):
        from azure.identity import AzureAuthorityHosts, ClientSecretCredential
        from azure.keyvault.secrets import SecretClient

        missing = [label for field, label in (('client', 'Client ID'), ('tenant', 'Tenant ID')) if not kwargs.get(field)]
        if missing:
            raise ValueError(f'{" and ".join(missing)} must be set when a Client Secret is provided.')
        csc = ClientSecretCredential(
            tenant_id=kwargs['tenant'],
            client_id=kwargs['client'],
            client_secret=kwargs['secret'],
            authority=AUTHORITY_HOSTS.get(kwargs.get('cloud_name', DEFAULT_CLOUD_NAME), AzureAuthorityHosts.AZURE_PUBLIC_CLOUD),
        )
        kv = SecretClient(credential=csc, vault_url=kwargs['url'])
        return kv.get_secret(name=kwargs['secret_field'], version=kwargs.get('secret_version', '')).value

    return _managed_identity_lookup(**kwargs)


def _managed_identity_lookup(**kwargs):
    from azure.core.exceptions import ClientAuthenticationError, HttpResponseError
    from azure.identity import CredentialUnavailableError, ManagedIdentityCredential
    from azure.keyvault.secrets import SecretClient

    # An explicit client ID selects the identity. Without one, azure-identity
    # uses AZURE_CLIENT_ID under Workload Identity, which may belong to another
    # application (for example the SSO app registration), or the system-assigned
    # identity elsewhere.
    client_id = kwargs.get('client') or None
    identity = f'identity {client_id}' if client_id else 'the default identity of the environment'
    try:
        credential = ManagedIdentityCredential(client_id=client_id)
    except ValueError as e:
        # raised when Workload Identity is configured but no client ID is known
        raise RuntimeError(f'Workload Identity needs a Client ID: {e}') from e

    kv = SecretClient(credential=credential, vault_url=kwargs['url'])
    try:
        return kv.get_secret(name=kwargs['secret_field'], version=kwargs.get('secret_version', '')).value
    except CredentialUnavailableError as e:
        raise RuntimeError(
            'No Workload Identity or Managed Identity is available here. '
            'Provide a Client ID, Client Secret and Tenant ID, or run with an Azure identity configured.'
        ) from e
    except ClientAuthenticationError as e:
        raise RuntimeError(f'Could not authenticate to Azure Key Vault as {identity}: {e.message}') from e
    except HttpResponseError as e:
        if e.status_code == 403:
            raise RuntimeError(
                f'Azure Key Vault denied access to {identity}. Grant it access to the secret, or set the Client ID of an identity that has it.'
            ) from e
        raise


azure_keyvault_plugin = CredentialPlugin('Microsoft Azure Key Vault', inputs=azure_keyvault_inputs, backend=azure_keyvault_backend)
