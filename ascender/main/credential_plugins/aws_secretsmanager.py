from .plugin import CredentialPlugin

from ascender.settings.typed import settings
from django.utils.translation import gettext_lazy as _

KEYS_HELP_TEXT = _(
    'Leave both keys empty to use the AWS identity of the Ascender controller instead. '
    'That is refused unless a system administrator has enabled AWS_SECRETS_MANAGER_ALLOW_DEFAULT_CREDENTIALS.'
)

secrets_manager_inputs = {
    'fields': [
        {
            'id': 'aws_access_key',
            'label': _('AWS Access Key'),
            'type': 'string',
            'default': '',
            'help_text': KEYS_HELP_TEXT,
        },
        {
            'id': 'aws_secret_key',
            'label': _('AWS Secret Key'),
            'type': 'string',
            'secret': True,
            'default': '',
            'help_text': KEYS_HELP_TEXT,
        },
    ],
    'metadata': [
        {
            'id': 'region_name',
            'label': _('AWS Secrets Manager Region'),
            'type': 'string',
            'help_text': _('Region which the secrets manager is located'),
        },
        {
            'id': 'secret_name',
            'label': _('AWS Secret Name'),
            'type': 'string',
        },
    ],
    'required': ['region_name', 'secret_name'],
}

# botocore's own defaults, pinned so that AWS_METADATA_SERVICE_* in the controller's environment or a
# config file cannot stretch how long a lookup on a controller with no AWS identity holds an API worker.
# These cover the EC2 instance metadata service only; botocore's container credential provider (ECS, EKS
# Pod Identity) has fixed timeouts of its own
METADATA_SERVICE_TIMEOUT = 1
METADATA_SERVICE_NUM_ATTEMPTS = 1


class DefaultCredentialsNotAllowed(Exception):
    """A lookup without keys while AWS_SECRETS_MANAGER_ALLOW_DEFAULT_CREDENTIALS is off."""


class DefaultCredentialsLookupError(Exception):
    """AWS refused a lookup made with the controller's identity; carries no AWS error text."""


def aws_secretsmanager_backend(**kwargs):
    secret_name = kwargs['secret_name']
    region_name = kwargs['region_name']
    # unset keys become None so that botocore falls back to its default credential
    # chain (environment, web identity token/IRSA, container or instance metadata);
    # an empty string would be sent as the key and rejected by AWS
    if (aws_secret_access_key := kwargs.get('aws_secret_key', '')) == '':
        aws_secret_access_key = None
    if (aws_access_key_id := kwargs.get('aws_access_key', '')) == '':
        aws_access_key_id = None
    # the chain runs as the controller's own identity, which a lookup that any user can create must not
    # borrow unless an administrator allowed it; checked here so every caller of the backend is covered.
    # Only one key is not this case: botocore raises PartialCredentialsError for it and never uses the chain
    if aws_access_key_id is None and aws_secret_access_key is None and not settings.AWS_SECRETS_MANAGER_ALLOW_DEFAULT_CREDENTIALS:
        raise DefaultCredentialsNotAllowed(
            'AWS Access Key and AWS Secret Key are empty and AWS_SECRETS_MANAGER_ALLOW_DEFAULT_CREDENTIALS is off, '
            "so this lookup may not use the controller's AWS identity. Supply both keys, or have a system administrator enable the setting."
        )

    # imported here rather than at module scope: every process that touches the
    # credential models loads every plugin through its entry point, so a module
    # level import makes each of them pay for the SDK whether or not an AWS
    # credential is ever used
    import boto3
    import botocore.session
    from botocore.exceptions import BotoCoreError, ClientError

    try:
        botocore_session = botocore.session.get_session()
        botocore_session.set_config_variable('metadata_service_timeout', METADATA_SERVICE_TIMEOUT)
        botocore_session.set_config_variable('metadata_service_num_attempts', METADATA_SERVICE_NUM_ATTEMPTS)
        session = boto3.session.Session(botocore_session=botocore_session)
        # inside the try: container credential providers (ECS, EKS Pod Identity) fetch credentials here
        client = session.client(
            service_name='secretsmanager', region_name=region_name, aws_secret_access_key=aws_secret_access_key, aws_access_key_id=aws_access_key_id
        )
        get_secret_value_response = client.get_secret_value(SecretId=secret_name)
    except (ClientError, BotoCoreError) as e:
        if aws_access_key_id is not None or aws_secret_access_key is not None:
            raise
        # With the controller's identity, AWS and botocore error text can name it (AccessDenied: "User:
        # arn:aws:sts::<account>:assumed-role/...", or a credential endpoint's response body), and job tracebacks
        # and logs are readable by users. Keep only the error code and operation; "from None" keeps the original
        # exception out of the traceback
        if isinstance(e, ClientError):
            detail = f"{e.response.get('Error', {}).get('Code', 'ClientError')} from {e.operation_name}"
        else:
            detail = type(e).__name__
        raise DefaultCredentialsLookupError(f"AWS Secrets Manager lookup with the controller's AWS identity failed: {detail}") from None
    # Secrets Manager decrypts the secret value using the associated KMS CMK
    # Depending on whether the secret was a string or binary, only one of these fields will be populated
    if 'SecretString' in get_secret_value_response:
        secret = get_secret_value_response['SecretString']

    else:
        secret = get_secret_value_response['SecretBinary']

    return secret


aws_secretmanager_plugin = CredentialPlugin('AWS Secrets Manager lookup', inputs=secrets_manager_inputs, backend=aws_secretsmanager_backend)
