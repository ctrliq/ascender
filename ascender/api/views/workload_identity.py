# Copyright (c) 2026 Ascender
# All Rights Reserved.
"""
The two documents an external system reads to trust the platform as the
issuer of workload identity tokens: the OpenID discovery document and the keys
that verify a token's signature. Both are public by design, so they skip
authentication, and both are plain JSON, which is what an OIDC client asks for.
"""

from django.http import JsonResponse
from django.views.decorators.http import require_GET

from ascender.main.utils import workload_identity
from ascender.settings.typed import settings


def _unavailable():
    if not settings.WORKLOAD_IDENTITY_ENABLED:
        return JsonResponse({'detail': 'Workload identity is not enabled.'}, status=404)
    try:
        workload_identity.issuer()
    except workload_identity.WorkloadIdentityError as exc:
        return JsonResponse({'detail': str(exc)}, status=404)
    return None


@require_GET
def openid_configuration(request):
    if response := _unavailable():
        return response
    issuer = workload_identity.issuer()
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


@require_GET
def jwks(request):
    if response := _unavailable():
        return response
    return JsonResponse(workload_identity.build_jwks())
