# Copyright (c) 2026 Ascender
# All Rights Reserved.
"""
Workload identity: a short lived JWT the platform signs for a job, which an
external system that trusts the platform as an OIDC issuer (HashiCorp Vault's
jwt auth method, a cloud's workload identity federation) can accept in place of
a stored secret.

The claims describe the job and are read from the database, never from
anything the user or the playbook supplies, so a system that binds access to a
claim can rely on it. The names follow Ansible Automation Platform's, with the
`aap_controller_` prefix replaced by `ascender_`, so a Vault role written for
one is easy to carry over to the other.

Tokens are signed here, in the process that runs the job, and only for the job
it is running: there is no API that hands out a token for an arbitrary set of
claims. The one exception is the credential test, which signs for a job
template the user can launch.
"""

import contextlib
import contextvars
import hashlib
import logging
import uuid
from datetime import datetime, timezone

import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from django.db import transaction
from jwt.algorithms import RSAAlgorithm

from ascender.main import constants
from ascender.main.utils.common import getattr_dne
from ascender.main.utils.pglock import advisory_lock
from ascender.settings.typed import settings

logger = logging.getLogger('ascender.main.utils.workload_identity')

__all__ = [
    'WorkloadIdentityError',
    'AutomationJobScope',
    'issuer',
    'build_jwks',
    'claims_for_unified_job',
    'claims_for_job_template',
    'sign_token',
    'workload_identity_for',
    'token_for_current_workload',
    'rotate_signing_key',
]

ALGORITHM = 'RS256'

# Added to every lifetime so a token is not rejected for a clock that is a
# little ahead of ours (RFC 7519, section 4.1.4 leaves room for it).
CLOCK_SKEW_SECONDS = 60

# The id of the field a credential plugin declares to be handed a token. It is
# marked internal: the API hides it and nobody can store a value in it.
TOKEN_FIELD = 'workload_identity_token'


class WorkloadIdentityError(Exception):
    pass


class AutomationJobScope:
    """The claims a job's token carries, and how its subject is built."""

    name = 'ascender_automation_job'

    CLAIM_JOB_ID = 'ascender_job_id'
    CLAIM_JOB_NAME = 'ascender_job_name'
    CLAIM_JOB_TYPE = 'ascender_job_type'
    CLAIM_LAUNCH_TYPE = 'ascender_launch_type'
    CLAIM_PLAYBOOK_NAME = 'ascender_playbook_name'
    CLAIM_LAUNCHED_BY_NAME = 'ascender_launched_by_name'
    CLAIM_LAUNCHED_BY_ID = 'ascender_launched_by_id'
    CLAIM_ORGANIZATION_NAME = 'ascender_organization_name'
    CLAIM_ORGANIZATION_ID = 'ascender_organization_id'
    CLAIM_INVENTORY_NAME = 'ascender_inventory_name'
    CLAIM_INVENTORY_ID = 'ascender_inventory_id'
    CLAIM_EXECUTION_ENVIRONMENT_NAME = 'ascender_execution_environment_name'
    CLAIM_EXECUTION_ENVIRONMENT_ID = 'ascender_execution_environment_id'
    CLAIM_PROJECT_NAME = 'ascender_project_name'
    CLAIM_PROJECT_ID = 'ascender_project_id'
    CLAIM_JOB_TEMPLATE_NAME = 'ascender_job_template_name'
    CLAIM_JOB_TEMPLATE_ID = 'ascender_job_template_id'
    CLAIM_UNIFIED_JOB_TEMPLATE_NAME = 'ascender_unified_job_template_name'
    CLAIM_UNIFIED_JOB_TEMPLATE_ID = 'ascender_unified_job_template_id'
    CLAIM_INSTANCE_GROUP_NAME = 'ascender_instance_group_name'
    CLAIM_INSTANCE_GROUP_ID = 'ascender_instance_group_id'

    # The claims the subject is made of, in order, and the label each takes in it.
    SUBJECT_PARTS = (
        (CLAIM_ORGANIZATION_NAME, 'organization'),
        (CLAIM_JOB_TEMPLATE_NAME, 'job_template'),
    )

    @classmethod
    def list_claims(cls):
        return sorted(getattr(cls, attr) for attr in dir(cls) if attr.startswith('CLAIM_'))

    @classmethod
    def subject(cls, claims):
        """
        workload_type:ascender_automation_job:organization:<name>:job_template:<name>

        A part whose claim is missing is still written, empty, so the subject
        always has the same shape and a glob in a Vault role matches it the
        same way every time.
        """
        parts = [f'workload_type:{cls.name}']
        parts.extend(f'{label}:{claims.get(claim, "")}' for claim, label in cls.SUBJECT_PARTS)
        return ':'.join(parts)


def issuer():
    """
    The `iss` of every token, which is also the discovery URL an external
    system is configured with. It has to be the same string in both places,
    so it comes from the Base URL setting rather than from whatever host a
    request happened to arrive on.
    """
    base = (settings.ASCENDER_URL_BASE or '').rstrip('/')
    if not base or base == constants.ASCENDER_URL_BASE_PLACEHOLDER.rstrip('/'):
        raise WorkloadIdentityError('Workload identity needs the Base URL of the service (ASCENDER_URL_BASE) to be set, since it is the token issuer.')
    return f'{base}/api/o'


def _generate_private_key_pem():
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    return key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()


def _key_id(private_pem):
    """A stable id for a key: the hash of its public half."""
    public_key = serialization.load_pem_private_key(private_pem.encode(), password=None).public_key()
    der = public_key.public_bytes(encoding=serialization.Encoding.DER, format=serialization.PublicFormat.SubjectPublicKeyInfo)
    return hashlib.sha256(der).hexdigest()[:32]


def _create_key():
    from ascender.main.models import WorkloadIdentityKey

    pem = _generate_private_key_pem()
    key = WorkloadIdentityKey(kid=_key_id(pem))
    key.set_private_key(pem)
    key.save()
    logger.info('Created workload identity signing key %s', key.kid)
    return key


def _signing_key():
    """
    The newest key, making the first one if there is none. Every node signs
    with the same key, so it lives in the database, and the lock stops two of
    them from each making one on a fresh install.
    """
    from ascender.main.models import WorkloadIdentityKey

    key = WorkloadIdentityKey.objects.order_by('-created', '-pk').first()
    if key is None:
        with transaction.atomic(), advisory_lock('workload_identity_signing_key'):
            key = WorkloadIdentityKey.objects.order_by('-created', '-pk').first() or _create_key()
    return key


def rotate_signing_key(keep=1):
    """
    Start signing with a new key. The `keep` newest of the old ones stay
    published so the tokens they signed still validate; older ones are dropped.
    Returns the new key and the ids of the ones dropped.
    """
    from ascender.main.models import WorkloadIdentityKey

    with transaction.atomic(), advisory_lock('workload_identity_signing_key'):
        old = list(WorkloadIdentityKey.objects.order_by('-created', '-pk'))
        new = _create_key()
        dropped = [key.kid for key in old[keep:]]
        WorkloadIdentityKey.objects.filter(kid__in=dropped).delete()
    return new, dropped


def build_jwks():
    from ascender.main.models import WorkloadIdentityKey

    _signing_key()
    keys = []
    for key in WorkloadIdentityKey.objects.order_by('-created', '-pk'):
        public_key = serialization.load_pem_private_key(key.get_private_key().encode(), password=None).public_key()
        jwk = RSAAlgorithm.to_jwk(public_key, as_dict=True)
        jwk.update({'kid': key.kid, 'use': 'sig', 'alg': ALGORITHM})
        keys.append(jwk)
    return {'keys': keys}


def claims_for_unified_job(unified_job):
    """The claims of a job that is about to run. A claim with no value is left out."""
    scope = AutomationJobScope
    claims = {
        scope.CLAIM_JOB_ID: unified_job.id,
        scope.CLAIM_JOB_NAME: unified_job.name,
        scope.CLAIM_LAUNCH_TYPE: unified_job.launch_type,
    }

    if organization := getattr_dne(unified_job, 'organization'):
        claims[scope.CLAIM_ORGANIZATION_NAME] = organization.name
        claims[scope.CLAIM_ORGANIZATION_ID] = organization.id

    if ujt := getattr_dne(unified_job, 'unified_job_template'):
        claims[scope.CLAIM_UNIFIED_JOB_TEMPLATE_NAME] = ujt.name
        claims[scope.CLAIM_UNIFIED_JOB_TEMPLATE_ID] = ujt.id

    if instance_group := getattr_dne(unified_job, 'instance_group'):
        claims[scope.CLAIM_INSTANCE_GROUP_NAME] = instance_group.name
        claims[scope.CLAIM_INSTANCE_GROUP_ID] = instance_group.id

    # Not every kind of job has these
    if inventory := getattr_dne(unified_job, 'inventory', None):
        claims[scope.CLAIM_INVENTORY_NAME] = inventory.name
        claims[scope.CLAIM_INVENTORY_ID] = inventory.id

    if execution_environment := getattr_dne(unified_job, 'execution_environment', None):
        claims[scope.CLAIM_EXECUTION_ENVIRONMENT_NAME] = execution_environment.name
        claims[scope.CLAIM_EXECUTION_ENVIRONMENT_ID] = execution_environment.id

    if project := getattr_dne(unified_job, 'project', None):
        claims[scope.CLAIM_PROJECT_NAME] = project.name
        claims[scope.CLAIM_PROJECT_ID] = project.id

    if job_template := getattr_dne(unified_job, 'job_template', None):
        claims[scope.CLAIM_JOB_TEMPLATE_NAME] = job_template.name
        claims[scope.CLAIM_JOB_TEMPLATE_ID] = job_template.id

    if getattr(unified_job, 'playbook', None):
        claims[scope.CLAIM_PLAYBOOK_NAME] = unified_job.playbook

    if getattr(unified_job, 'job_type', None):
        claims[scope.CLAIM_JOB_TYPE] = unified_job.job_type

    launched_by = unified_job.launched_by
    if launched_by.get('name') is not None:
        claims[scope.CLAIM_LAUNCHED_BY_NAME] = launched_by['name']
    if launched_by.get('id') is not None:
        claims[scope.CLAIM_LAUNCHED_BY_ID] = launched_by['id']

    return claims


def claims_for_job_template(job_template):
    """
    The claims a job from this template would carry, as far as they are known
    before it runs. Used by the credential test, so that a Vault role bound to a
    template can be tried out without launching it.
    """
    scope = AutomationJobScope
    claims = {
        scope.CLAIM_JOB_TEMPLATE_NAME: job_template.name,
        scope.CLAIM_JOB_TEMPLATE_ID: job_template.id,
        scope.CLAIM_UNIFIED_JOB_TEMPLATE_NAME: job_template.name,
        scope.CLAIM_UNIFIED_JOB_TEMPLATE_ID: job_template.id,
        scope.CLAIM_JOB_TYPE: job_template.job_type,
    }
    if job_template.playbook:
        claims[scope.CLAIM_PLAYBOOK_NAME] = job_template.playbook
    for related, name_claim, id_claim in (
        ('organization', scope.CLAIM_ORGANIZATION_NAME, scope.CLAIM_ORGANIZATION_ID),
        ('project', scope.CLAIM_PROJECT_NAME, scope.CLAIM_PROJECT_ID),
        ('inventory', scope.CLAIM_INVENTORY_NAME, scope.CLAIM_INVENTORY_ID),
        ('execution_environment', scope.CLAIM_EXECUTION_ENVIRONMENT_NAME, scope.CLAIM_EXECUTION_ENVIRONMENT_ID),
    ):
        if obj := getattr_dne(job_template, related):
            claims[name_claim] = obj.name
            claims[id_claim] = obj.id
    return claims


def sign_token(claims, audience, ttl_seconds=None):
    """
    Sign `claims` for `audience`. The registered claims (iss, sub, aud, iat,
    exp, jti) are always set here and win over anything of the same name.
    """
    if not settings.WORKLOAD_IDENTITY_ENABLED:
        raise WorkloadIdentityError('Workload identity is not enabled. An administrator can turn it on in the system settings.')
    if not audience:
        raise WorkloadIdentityError('A workload identity token needs an audience.')

    lifetime = (ttl_seconds or settings.WORKLOAD_IDENTITY_DEFAULT_TTL) + CLOCK_SKEW_SECONDS
    issued_at = int(datetime.now(tz=timezone.utc).timestamp())
    registered = {
        'iss': issuer(),
        'sub': AutomationJobScope.subject(claims),
        'aud': audience,
        'iat': issued_at,
        'nbf': issued_at - CLOCK_SKEW_SECONDS,
        'exp': issued_at + lifetime,
        'jti': str(uuid.uuid4()),
    }
    key = _signing_key()
    token = jwt.encode({**claims, **registered}, key.get_private_key(), algorithm=ALGORITHM, headers={'kid': key.kid})
    logger.info(
        'Issued workload identity token jti=%s sub=%s aud=%s exp=%s kid=%s',
        registered['jti'],
        registered['sub'],
        audience,
        registered['exp'],
        key.kid,
    )
    return token


class _Workload:
    def __init__(self, unified_job, ttl_seconds):
        self.unified_job = unified_job
        self.ttl_seconds = ttl_seconds
        self.claims = None
        self.tokens = {}


_current_workload = contextvars.ContextVar('workload_identity_current_workload', default=None)


@contextlib.contextmanager
def workload_identity_for(unified_job, ttl_seconds=None):
    """
    Mark `unified_job` as the job this context runs, so that any credential
    resolved inside it can be handed a token for it, however the credential
    was fetched.
    """
    state = _Workload(unified_job, ttl_seconds)
    reset_token = _current_workload.set(state)
    try:
        yield state
    finally:
        _current_workload.reset(reset_token)


def token_for_current_workload(audience):
    """
    A token for the job this context runs. One is signed per audience and
    reused for the rest of the run, so a credential with several fields looked
    up from the same Vault logs in with the same token.
    """
    state = _current_workload.get()
    if state is None:
        raise WorkloadIdentityError('A workload identity token can only be issued for a running job.')
    if audience not in state.tokens:
        if state.claims is None:
            state.claims = claims_for_unified_job(state.unified_job)
        state.tokens[audience] = sign_token(state.claims, audience, state.ttl_seconds)
    return state.tokens[audience]
