import copy
import logging
import os
import pathlib
import time
from urllib.parse import urljoin

from .plugin import CredentialPlugin, CertFiles, raise_for_status

import requests
from django.utils.translation import gettext_lazy as _

logger = logging.getLogger('ascender.main.credential_plugins.hashivault')

base_inputs = {
    'fields': [
        {
            'id': 'url',
            'label': _('Server URL'),
            'type': 'string',
            'format': 'url',
            'help_text': _('The URL to the HashiCorp Vault'),
        },
        {
            'id': 'token',
            'label': _('Token'),
            'type': 'string',
            'secret': True,
            'help_text': _('The access token used to authenticate to the Vault server'),
        },
        {
            'id': 'cacert',
            'label': _('CA Certificate'),
            'type': 'string',
            'multiline': True,
            'help_text': _('The CA certificate used to verify the SSL certificate of the Vault server'),
        },
        {'id': 'role_id', 'label': _('AppRole role_id'), 'type': 'string', 'multiline': False, 'help_text': _('The Role ID for AppRole Authentication')},
        {
            'id': 'secret_id',
            'label': _('AppRole secret_id'),
            'type': 'string',
            'multiline': False,
            'secret': True,
            'help_text': _('The Secret ID for AppRole Authentication'),
        },
        {
            'id': 'client_cert_public',
            'label': _('Client Certificate'),
            'type': 'string',
            'multiline': True,
            'help_text': _(
                'The PEM-encoded client certificate used for TLS client authentication. This should include the certificate and any intermediate certififcates.'
            ),
        },
        {
            'id': 'client_cert_private',
            'label': _('Client Certificate Key'),
            'type': 'string',
            'multiline': True,
            'secret': True,
            'help_text': _('The certificate private key used for TLS client authentication.'),
        },
        {
            'id': 'client_cert_role',
            'label': _('TLS Authentication Role'),
            'type': 'string',
            'multiline': False,
            'help_text': _(
                'The role configured in Hashicorp Vault for TLS client authentication.'
                ' If not provided, Hashicorp Vault may assign roles based on the certificate used.'
            ),
        },
        {
            'id': 'namespace',
            'label': _('Namespace name (Vault Enterprise only)'),
            'type': 'string',
            'multiline': False,
            'help_text': _('Name of the namespace to use when authenticate and retrieve secrets'),
        },
        {
            'id': 'kubernetes_role',
            'label': _('Kubernetes role'),
            'type': 'string',
            'multiline': False,
            'help_text': _(
                'The Role for Kubernetes Authentication.'
                ' This is the named role, configured in Vault server, for AWX pod auth policies.'
                ' see https://www.vaultproject.io/docs/auth/kubernetes#configuration'
            ),
        },
        {
            'id': 'username',
            'label': _('Username'),
            'type': 'string',
            'secret': False,
            'help_text': _('Username for user authentication.'),
        },
        {
            'id': 'password',
            'label': _('Password'),
            'type': 'string',
            'secret': True,
            'help_text': _('Password for user authentication.'),
        },
        {
            'id': 'default_auth_path',
            'label': _('Path to Auth'),
            'type': 'string',
            'multiline': False,
            'default': 'approle',
            'help_text': _('The Authentication path to use if one isn\'t provided in the metadata when linking to an input field. Defaults to \'approle\''),
        },
    ],
    'metadata': [
        {
            'id': 'secret_path',
            'label': _('Path to Secret'),
            'type': 'string',
            'help_text': _(
                (
                    'The path to the secret stored in the secret backend e.g, /some/secret/. It is recommended'
                    ' that you use the secret backend field to identify the storage backend and to use this field'
                    ' for locating a specific secret within that store. However, if you prefer to fully identify'
                    ' both the secret backend and one of its secrets using only this field, join their locations'
                    ' into a single path without any additional separators, e.g, /location/of/backend/some/secret.'
                )
            ),
        },
        {
            'id': 'auth_path',
            'label': _('Path to Auth'),
            'type': 'string',
            'multiline': False,
            'help_text': _('The path where the Authentication method is mounted e.g, approle'),
        },
    ],
    'required': ['url', 'secret_path'],
}

hashi_kv_inputs = copy.deepcopy(base_inputs)
hashi_kv_inputs['fields'].append(
    {
        'id': 'api_version',
        'label': _('API Version'),
        'choices': ['v1', 'v2'],
        'help_text': _('API v1 is for static key/value lookups.  API v2 is for versioned key/value lookups.'),
        'default': 'v1',
    }
)
hashi_kv_inputs['metadata'] = (
    [
        {
            'id': 'secret_backend',
            'label': _('Name of Secret Backend'),
            'type': 'string',
            'help_text': _('The name of the kv secret backend (if left empty, the first segment of the secret path will be used).'),
        }
    ]
    + hashi_kv_inputs['metadata']
    + [
        {
            'id': 'secret_key',
            'label': _('Key Name'),
            'type': 'string',
            'help_text': _('The name of the key to look up in the secret.'),
        },
        {
            'id': 'secret_version',
            'label': _('Secret Version (v2 only)'),
            'type': 'string',
            'help_text': _('Used to specify a specific secret version (if left empty, the latest version will be used).'),
        },
    ]
)
hashi_kv_inputs['required'].extend(['api_version', 'secret_key'])

hashi_ssh_inputs = copy.deepcopy(base_inputs)
hashi_ssh_inputs['metadata'] = (
    [
        {
            'id': 'public_key',
            'label': _('Unsigned Public Key'),
            'type': 'string',
            'multiline': True,
        }
    ]
    + hashi_ssh_inputs['metadata']
    + [
        {'id': 'role', 'label': _('Role Name'), 'type': 'string', 'help_text': _('The name of the role used to sign.')},
        {
            'id': 'valid_principals',
            'label': _('Valid Principals'),
            'type': 'string',
            'help_text': _('Valid principals (either usernames or hostnames) that the certificate should be signed for.'),
        },
    ]
)
hashi_ssh_inputs['required'].extend(['public_key', 'role'])


# The OIDC variants log in as the job, with a token the platform signs for it,
# so they keep none of the stored secrets the types above take. They are new
# types rather than another way into the old ones so that those keep working
# exactly as they did.
def _field(inputs, field_id):
    return copy.deepcopy(next(field for field in inputs['fields'] if field['id'] == field_id))


def _metadata(inputs, field_id):
    return copy.deepcopy(next(field for field in inputs['metadata'] if field['id'] == field_id))


oidc_fields = [
    {
        'id': 'default_auth_path',
        'label': _('Path to Auth'),
        'type': 'string',
        'multiline': False,
        'default': 'jwt',
        'help_text': _(
            "The path the JWT authentication method is mounted at, if one isn't provided in the metadata when linking to an input field. Defaults to 'jwt'."
        ),
    },
    {
        'id': 'jwt_role',
        'label': _('JWT Role'),
        'type': 'string',
        'multiline': False,
        'help_text': _(
            'The name of the role configured in the JWT authentication method of Vault. '
            'It decides which jobs may log in, by the claims of their token, and with which policies.'
        ),
    },
    {
        'id': 'workload_identity_token',
        'label': _('Workload Identity Token'),
        'type': 'string',
        'secret': True,
        'internal': True,
        'help_text': _('Signed by the platform for each job that uses this credential.'),
    },
]

oidc_auth_path_metadata = {
    'id': 'auth_path',
    'label': _('Path to Auth'),
    'type': 'string',
    'multiline': False,
    'help_text': _('The path where the JWT authentication method is mounted, e.g. jwt'),
}

hashi_kv_oidc_inputs = {
    'fields': [_field(hashi_kv_inputs, 'url'), _field(hashi_kv_inputs, 'api_version'), _field(hashi_kv_inputs, 'cacert')]
    + copy.deepcopy(oidc_fields[:2])
    + [_field(hashi_kv_inputs, 'namespace'), copy.deepcopy(oidc_fields[2])],
    'metadata': [
        _metadata(hashi_kv_inputs, 'secret_backend'),
        _metadata(hashi_kv_inputs, 'secret_path'),
        copy.deepcopy(oidc_auth_path_metadata),
        _metadata(hashi_kv_inputs, 'secret_key'),
        _metadata(hashi_kv_inputs, 'secret_version'),
    ],
    'required': ['url', 'api_version', 'default_auth_path', 'jwt_role', 'secret_path', 'secret_key'],
}

hashi_ssh_oidc_inputs = {
    'fields': [_field(hashi_ssh_inputs, 'url'), _field(hashi_ssh_inputs, 'cacert')]
    + copy.deepcopy(oidc_fields[:2])
    + [_field(hashi_ssh_inputs, 'namespace'), copy.deepcopy(oidc_fields[2])],
    'metadata': [
        _metadata(hashi_ssh_inputs, 'public_key'),
        _metadata(hashi_ssh_inputs, 'secret_path'),
        copy.deepcopy(oidc_auth_path_metadata),
        _metadata(hashi_ssh_inputs, 'role'),
        _metadata(hashi_ssh_inputs, 'valid_principals'),
    ],
    'required': ['url', 'default_auth_path', 'jwt_role', 'secret_path', 'public_key', 'role'],
}


def handle_auth(**kwargs):
    token = None
    if kwargs.get('token'):
        token = kwargs['token']
    elif kwargs.get('username') and kwargs.get('password'):
        token = method_auth(**kwargs, auth_param=userpass_auth(**kwargs))
    elif kwargs.get('role_id') and kwargs.get('secret_id'):
        token = method_auth(**kwargs, auth_param=approle_auth(**kwargs))
    elif kwargs.get('kubernetes_role'):
        token = method_auth(**kwargs, auth_param=kubernetes_auth(**kwargs))
    elif kwargs.get('client_cert_public') and kwargs.get('client_cert_private'):
        token = method_auth(**kwargs, auth_param=client_cert_auth(**kwargs))
    else:
        raise Exception('Token, Username/Password, AppRole, Kubernetes, or TLS authentication parameters must be set')
    return token


def userpass_auth(**kwargs):
    return {'username': kwargs['username'], 'password': kwargs['password']}


def approle_auth(**kwargs):
    return {'role_id': kwargs['role_id'], 'secret_id': kwargs['secret_id']}


def kubernetes_auth(**kwargs):
    jwt_file = pathlib.Path('/var/run/secrets/kubernetes.io/serviceaccount/token')
    with jwt_file.open('r') as jwt_fo:
        jwt = jwt_fo.read().rstrip()
    return {'role': kwargs['kubernetes_role'], 'jwt': jwt}


def client_cert_auth(**kwargs):
    return {'name': kwargs.get('client_cert_role')}


def workload_identity_auth(**kwargs):
    # A JWT the platform signed for the job, which Vault's jwt auth method
    # checks against the platform's published keys
    return {'role': kwargs.get('jwt_role'), 'jwt': kwargs['workload_identity_token']}


def revoke_self(token, **kwargs):
    """
    Give back a Vault token as soon as the lookup is done with it. Best effort:
    a batch token cannot be revoked and runs out on its own, and a lookup that
    already has its secret should not fail over this.
    """
    url = urljoin(kwargs['url'], 'v1/auth/token/revoke-self')
    headers = {'X-Vault-Token': token}
    if kwargs.get('namespace'):
        headers['X-Vault-Namespace'] = kwargs['namespace']
    try:
        with CertFiles(kwargs.get('cacert', None)) as cert:
            requests.post(url, headers=headers, verify=cert, timeout=30).raise_for_status()
    except Exception as exc:
        logger.debug('Could not revoke the Vault token of a workload identity lookup: %s', exc)


def with_workload_identity_login(backend):
    """
    Log in to Vault with the job's token, run `backend` with the Vault token
    that comes back, and revoke it afterwards.
    """

    def wrapper(**kwargs):
        if not kwargs.get('workload_identity_token'):
            raise ValueError('No workload identity token was issued for this lookup')
        # The form fills in the default, but a credential made through the
        # api or a collection only has what was sent
        if not kwargs.get('default_auth_path'):
            kwargs = dict(kwargs, default_auth_path='jwt')
        try:
            token = method_auth(**kwargs, auth_param=workload_identity_auth(**kwargs))
        except requests.exceptions.HTTPError as exc:
            # Vault says why it turned the job down (a bound claim, the
            # audience, an unknown role); keep that rather than a bare 400
            try:
                reason = '; '.join(str(error) for error in exc.response.json().get('errors', []))
            except (ValueError, AttributeError, TypeError):
                # not the JSON Vault answers with
                reason = ''
            message = 'Vault turned down the workload identity login with role {}: HTTP {}'.format(kwargs.get('jwt_role'), exc.response.status_code)
            raise requests.exceptions.HTTPError(f'{message}, {reason}' if reason else message, response=exc.response) from exc
        try:
            return backend(**dict(kwargs, token=token))
        finally:
            revoke_self(token, **kwargs)

    return wrapper


def method_auth(**kwargs):
    # get auth method specific params
    request_kwargs = {'json': kwargs['auth_param'], 'timeout': 30}

    # we first try to use the 'auth_path' from the metadata
    # if not found we try to fetch the 'default_auth_path' from inputs
    auth_path = kwargs.get('auth_path') or kwargs['default_auth_path']

    url = urljoin(kwargs['url'], 'v1')
    cacert = kwargs.get('cacert', None)

    sess = requests.Session()
    sess.mount(url, requests.adapters.HTTPAdapter(max_retries=5))

    # Namespace support
    if kwargs.get('namespace'):
        sess.headers['X-Vault-Namespace'] = kwargs['namespace']
    request_url = '/'.join([url, 'auth', auth_path, 'login']).rstrip('/')
    if kwargs['auth_param'].get('username'):
        request_url = request_url + '/' + (kwargs['username'])
    with CertFiles(cacert) as cert:
        request_kwargs['verify'] = cert
        # TLS client certificate support
        if kwargs.get('client_cert_public') and kwargs.get('client_cert_private'):
            # Add client cert to requests Session before making call
            with CertFiles(kwargs['client_cert_public'], key=kwargs['client_cert_private']) as client_cert:
                sess.cert = client_cert
                resp = sess.post(request_url, **request_kwargs)
        else:
            # Make call without client certificate
            resp = sess.post(request_url, **request_kwargs)
    resp.raise_for_status()
    token = resp.json()['auth']['client_token']
    return token


def kv_backend(**kwargs):
    token = handle_auth(**kwargs)
    url = kwargs['url']
    secret_path = kwargs['secret_path']
    secret_backend = kwargs.get('secret_backend', None)
    secret_key = kwargs.get('secret_key', None)
    cacert = kwargs.get('cacert', None)
    api_version = kwargs['api_version']

    request_kwargs = {
        'timeout': 30,
        'allow_redirects': False,
    }

    sess = requests.Session()
    sess.mount(url, requests.adapters.HTTPAdapter(max_retries=5))
    sess.headers['Authorization'] = 'Bearer {}'.format(token)
    # Compatibility header for older installs of Hashicorp Vault
    sess.headers['X-Vault-Token'] = token
    if kwargs.get('namespace'):
        sess.headers['X-Vault-Namespace'] = kwargs['namespace']

    if api_version == 'v2':
        if kwargs.get('secret_version'):
            request_kwargs['params'] = {'version': kwargs['secret_version']}
        if secret_backend:
            path_segments = [secret_backend, 'data', secret_path]
        else:
            try:
                mount_point, *path = pathlib.Path(secret_path.lstrip(os.sep)).parts
                '/'.join(path)
            except Exception:
                mount_point, path = secret_path, []
            # https://www.vaultproject.io/api/secret/kv/kv-v2.html#read-secret-version
            path_segments = [mount_point, 'data'] + path
    else:
        if secret_backend:
            path_segments = [secret_backend, secret_path]
        else:
            path_segments = [secret_path]

    request_url = urljoin(url, '/'.join(['v1'] + path_segments)).rstrip('/')
    with CertFiles(cacert) as cert:
        request_kwargs['verify'] = cert
        request_retries = 0
        while request_retries < 5:
            response = sess.get(request_url, **request_kwargs)
            # https://developer.hashicorp.com/vault/docs/enterprise/consistency
            if response.status_code == 412:
                request_retries += 1
                time.sleep(1)
            else:
                break
    raise_for_status(response)

    json = response.json()
    if api_version == 'v2':
        json = json['data']

    if secret_key:
        try:
            if (secret_key != 'data') and (secret_key not in json['data']) and ('data' in json['data']):
                return json['data']['data'][secret_key]
            return json['data'][secret_key]
        except KeyError:
            raise RuntimeError('{} is not present at {}'.format(secret_key, secret_path))
    return json['data']


def ssh_backend(**kwargs):
    token = handle_auth(**kwargs)
    url = urljoin(kwargs['url'], 'v1')
    secret_path = kwargs['secret_path']
    role = kwargs['role']
    cacert = kwargs.get('cacert', None)

    request_kwargs = {
        'timeout': 30,
        'allow_redirects': False,
    }

    request_kwargs['json'] = {'public_key': kwargs['public_key']}
    if kwargs.get('valid_principals'):
        request_kwargs['json']['valid_principals'] = kwargs['valid_principals']

    sess = requests.Session()
    sess.mount(url, requests.adapters.HTTPAdapter(max_retries=5))
    sess.headers['Authorization'] = 'Bearer {}'.format(token)
    if kwargs.get('namespace'):
        sess.headers['X-Vault-Namespace'] = kwargs['namespace']
    # Compatability header for older installs of Hashicorp Vault
    sess.headers['X-Vault-Token'] = token
    # https://www.vaultproject.io/api/secret/ssh/index.html#sign-ssh-key
    request_url = '/'.join([url, secret_path, 'sign', role]).rstrip('/')

    with CertFiles(cacert) as cert:
        request_kwargs['verify'] = cert
        request_retries = 0
        while request_retries < 5:
            resp = sess.post(request_url, **request_kwargs)
            # https://developer.hashicorp.com/vault/docs/enterprise/consistency
            if resp.status_code == 412:
                request_retries += 1
                time.sleep(1)
            else:
                break
    raise_for_status(resp)
    return resp.json()['data']['signed_key']


hashivault_kv_plugin = CredentialPlugin('HashiCorp Vault Secret Lookup', inputs=hashi_kv_inputs, backend=kv_backend)

hashivault_ssh_plugin = CredentialPlugin('HashiCorp Vault Signed SSH', inputs=hashi_ssh_inputs, backend=ssh_backend)

hashivault_kv_oidc_plugin = CredentialPlugin(
    'HashiCorp Vault Secret Lookup (OIDC)', inputs=hashi_kv_oidc_inputs, backend=with_workload_identity_login(kv_backend)
)

hashivault_ssh_oidc_plugin = CredentialPlugin(
    'HashiCorp Vault Signed SSH (OIDC)', inputs=hashi_ssh_oidc_inputs, backend=with_workload_identity_login(ssh_backend)
)
