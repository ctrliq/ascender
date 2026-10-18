# Copyright (c) 2026 Ascender
# All Rights Reserved.
"""
The two documents an external system reads to trust the platform as the
issuer of workload identity tokens: the OpenID discovery document and the keys
that verify a token's signature. Both are public by design, so they skip
authentication, and both are plain JSON, which is what an OIDC client asks for.
"""

from django.http import JsonResponse
from django.views.decorators.http import require_safe

from ascender.main.utils import workload_identity
from ascender.settings.typed import settings


def _issuer():
    """The issuer, or the 404 to answer with while there is none."""
    if not settings.WORKLOAD_IDENTITY_ENABLED:
        return None, JsonResponse({'detail': 'Workload identity is not enabled.'}, status=404)
    try:
        return workload_identity.issuer(), None
    except workload_identity.WorkloadIdentityError as exc:
        return None, JsonResponse({'detail': str(exc)}, status=404)


@require_safe
def openid_configuration(request):
    issuer, unavailable = _issuer()
    if unavailable:
        return unavailable
    return JsonResponse(
        {
            'issuer': issuer,
            'jwks_uri': f'{issuer}/.well-known/jwks.json',
            'response_types_supported': ['id_token'],
            'subject_types_supported': ['public'],
            'id_token_signing_alg_values_supported': [workload_identity.ALGORITHM],
            'scopes_supported': [workload_identity.AutomationJobScope.name],
            'claims_supported': ['iss', 'sub', 'aud', 'iat', 'nbf', 'exp', 'jti'] + workload_identity.AutomationJobScope.list_claims(),
        }
    )


@require_safe
def jwks(request):
    _, unavailable = _issuer()
    if unavailable:
        return unavailable
    response = JsonResponse(workload_identity.build_jwks())
    # public, and read by every relying party: let them and any proxy keep it
    # a few minutes, short enough for a rotated key to show up quickly
    response['Cache-Control'] = 'public, max-age=300'
    return response
