from azure.keyvault.secrets import SecretClient
from azure.identity import AzureAuthorityHosts, ClientSecretCredential

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
AUTHORITY_HOSTS = {
    'AzureChinaCloud': AzureAuthorityHosts.AZURE_CHINA,
    'AzureGermanCloud': 'login.microsoftonline.de',
    DEFAULT_CLOUD_NAME: AzureAuthorityHosts.AZURE_PUBLIC_CLOUD,
    'AzureUSGovernment': AzureAuthorityHosts.AZURE_GOVERNMENT,
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
        {'id': 'client', 'label': _('Client ID'), 'type': 'string'},
        {
            'id': 'secret',
            'label': _('Client Secret'),
            'type': 'string',
            'secret': True,
        },
        {'id': 'tenant', 'label': _('Tenant ID'), 'type': 'string'},
        {
            'id': 'cloud_name',
            'label': _('Cloud Environment'),
            'help_text': _('Specify which azure cloud environment to use.'),
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
    'required': ['url', 'client', 'secret', 'tenant', 'secret_field'],
}


def azure_keyvault_backend(**kwargs):
    csc = ClientSecretCredential(
        tenant_id=kwargs['tenant'],
        client_id=kwargs['client'],
        client_secret=kwargs['secret'],
        authority=AUTHORITY_HOSTS.get(kwargs.get('cloud_name', DEFAULT_CLOUD_NAME), AzureAuthorityHosts.AZURE_PUBLIC_CLOUD),
    )
    kv = SecretClient(credential=csc, vault_url=kwargs['url'])
    return kv.get_secret(name=kwargs['secret_field'], version=kwargs.get('secret_version', '')).value


azure_keyvault_plugin = CredentialPlugin('Microsoft Azure Key Vault', inputs=azure_keyvault_inputs, backend=azure_keyvault_backend)
