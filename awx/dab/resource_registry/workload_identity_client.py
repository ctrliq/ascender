"""Workload Identity API Client.

This client provides functionality to request workload identity tokens
from the Gateway workload identity endpoint with service token authentication.
"""

import logging
from typing import NamedTuple

import requests
from rest_framework.exceptions import APIException
from rest_framework.status import HTTP_401_UNAUTHORIZED

from awx.dab.resource_registry.resource_server import get_resource_server_config
from awx.dab.resource_registry.service_client import BaseServiceClient

logger = logging.getLogger("awx.dab.resource_registry.workload_identity_client")


class WorkloadIdentityTokenRequest(NamedTuple):
    """Request body for workload identity token endpoint."""

    claims: dict
    """Dictionary containing workload details (e.g., job ID, name)."""

    scope: str
    """Token custom scopes string (e.g., 'aap_controller_automation_job')."""

    audience: str
    """Audience for the token - the external service that will validate it."""

    workload_ttl_seconds: int | None = None
    """Optional workload-specific TTL override in seconds.

    If > 0, the Gateway uses this as the base TTL instead of the platform default.
    Pass None or omit to use the platform fallback (jwt_default_ttl_seconds).
    Note: 0 is invalid — Gateway serializer rejects it (min_value=1); use None or omit.
    """


class WorkloadIdentityTokenResponse(NamedTuple):
    """Response from workload identity token endpoint."""

    jwt: str
    """The JWT access token signed by the Gateway and containing the workload identity claims."""


class TokenRequestError(APIException):
    """Raised when token request fails."""

    status_code = HTTP_401_UNAUTHORIZED
    default_detail = "Failed to obtain workload identity token."
    default_code = "token_request_failed"


def get_workload_identity_client(**kwargs) -> 'WorkloadIdentityClient':
    """
    Get a WorkloadIdentityClient configured from resource server settings.

    This factory function creates a client using the RESOURCE_SERVER configuration,
    similar to get_resource_server_client() in rest_client.py.

    Args:
        **kwargs: Additional arguments passed to WorkloadIdentityClient

    Returns:
        WorkloadIdentityClient: Configured client instance

    Example:
        >>> client = get_workload_identity_client(jwt_user_id=1)
        >>> response = client.request_workload_jwt(
        ...     claims={"id": 2, "name": "my-example-job"},
        ...     scope="aap_controller_automation_job",
        ...     audience="https://vault.example.com"
        ... )
    """
    config = get_resource_server_config()

    return WorkloadIdentityClient(
        base_url=config["URL"],
        verify_https=config["VALIDATE_HTTPS"],
        **kwargs,
    )


class WorkloadIdentityClient(BaseServiceClient):
    """
    Client for requesting workload identity tokens from Gateway.

    This client authenticates using service tokens via the X-ANSIBLE-SERVICE-AUTH
    header and makes POST requests to the workload identity tokens endpoint.

    Example:
        >>> client = WorkloadIdentityClient(
        ...     base_url="https://gateway.example.com",
        ...     jwt_user_id=1,
        ...     jwt_expiration=60
        ... )
        >>> response = client.request_workload_jwt(
        ...     claims={"id": 2, "name": "my-example-job"},
        ...     scope="aap_controller_automation_job",
        ...     audience="https://vault.example.com"
        ... )
        >>> print(response.jwt)
    """

    def __init__(
        self,
        base_url: str,
        jwt_user_id=None,
        jwt_expiration=60,
        verify_https: bool = True,
        raise_if_bad_request: bool = True,
        timeout: int = 30,
    ):
        """
        Initialize the workload identity client.

        Args:
            base_url: Base URL of the gateway service (e.g., "https://gateway.example.com")
            jwt_user_id: User ID to include in service token (optional)
            jwt_expiration: Service token expiration time in seconds (default: 60)
            verify_https: Whether to verify HTTPS certificates (default: True)
            raise_if_bad_request: Whether to raise exceptions on HTTP errors (default: True)
            timeout: Request timeout in seconds (default: 30)
        """
        if jwt_user_id is not None:
            jwt_user_id = str(jwt_user_id)

        super().__init__(
            base_url=base_url,
            verify_https=verify_https,
            raise_if_bad_request=raise_if_bad_request,
            jwt_user_id=jwt_user_id,
            jwt_expiration=jwt_expiration,
            timeout=timeout,
        )

    def request_workload_jwt(
        self,
        claims: dict,
        scope: str,
        audience: str,
        workload_ttl_seconds: int | None = None,
    ) -> WorkloadIdentityTokenResponse:
        """
        Request a workload identity token.

        Makes a POST request to /api/gateway/v1/workload_identity_tokens/
        with the specified claims, scope, and audience.

        Args:
            claims: Dictionary containing workload details (e.g., job ID, name)
            scope: Token custom scopes string (e.g., 'aap_controller_automation_job')
            audience: Audience for the token - the external service that will validate it
            workload_ttl_seconds: Optional TTL override in seconds. If > 0, the Gateway
                uses this as the base TTL instead of the platform default (jwt_default_ttl_seconds).
                Pass None or omit to use the platform fallback. Note: 0 is invalid (Gateway rejects it).

        Returns:
            WorkloadIdentityTokenResponse: Token response with JWT

        Raises:
            ValueError: If workload_ttl_seconds is 0 or negative
            TokenRequestError: If the request fails

        Example:
            >>> response = client.request_workload_jwt(
            ...     claims={"id": 2, "name": "my-example-job"},
            ...     scope="aap_controller_automation_job",
            ...     audience="https://vault.example.com",
            ...     workload_ttl_seconds=3600,
            ... )
        """
        if workload_ttl_seconds is not None and workload_ttl_seconds < 1:
            raise ValueError(f"workload_ttl_seconds must be None (platform fallback) or >= 1, got {workload_ttl_seconds}")
        data = {
            "claims": claims,
            "scope": scope,
            "audience": audience,
        }
        if workload_ttl_seconds is not None and workload_ttl_seconds > 0:
            data["workload_ttl_seconds"] = workload_ttl_seconds

        logger.info(f"Requesting workload identity token with scope: {scope}")
        logger.debug(f"Claims: {claims}")

        try:
            response = self._make_request(
                method="POST",
                path="/api/gateway/v1/workload_identity_tokens/",
                data=data,
            )
        except requests.exceptions.RequestException as e:
            logger.error(f"Request failed: {e}")
            raise TokenRequestError(f"Request failed: {e}") from e

        try:
            response_data = response.json()
        except (requests.exceptions.JSONDecodeError, ValueError) as e:
            logger.error(f"Failed to parse JSON response: {e}")
            raise TokenRequestError(f"Failed to parse response: {e}") from e

        if "jwt" not in response_data:
            logger.error("Response missing 'jwt' field")
            raise TokenRequestError("Response missing 'jwt' field")

        jwt_token = response_data["jwt"]
        logger.debug("Successfully received workload identity token")

        return WorkloadIdentityTokenResponse(jwt=jwt_token)
