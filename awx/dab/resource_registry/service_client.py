"""
Base client for services to communicate with Gateway using service token authentication.

This module provides a base client class that handles JWT-based service authentication
and common request patterns for communicating with Gateway endpoints.
"""

import logging
import time
from typing import Optional

import requests

from awx.dab.resource_registry.resource_server import get_service_token

logger = logging.getLogger('awx.dab.resource_registry.service_client')


class BaseServiceClient:
    """
    Base client for Ansible services to interact with Gateway APIs using service token authentication.

    This class provides common functionality for:
    - Auto-refreshing JWT service tokens
    - Making authenticated HTTP requests with X-ANSIBLE-SERVICE-AUTH header
    - Error handling and logging

    Subclasses should implement specific API methods for their use case.
    """

    header_name = "X-ANSIBLE-SERVICE-AUTH"
    _jwt_timeout = None
    _jwt = None

    def __init__(
        self,
        base_url: str,
        verify_https: bool = True,
        raise_if_bad_request: bool = False,
        jwt_user_id: Optional[str] = None,
        jwt_expiration: int = 60,
        timeout: int = 30,
    ):
        """
        Initialize the base service client.

        Args:
            base_url: Base URL for the API endpoint (e.g., "https://gateway.example.com/api/v1/")
            verify_https: Whether to verify SSL certificates
            raise_if_bad_request: Whether to raise an exception on non-2xx responses
            jwt_user_id: Ansible ID of the user to make the request as (optional)
            jwt_expiration: Number of seconds that the JWT token is valid (default: 60)
            timeout: Request timeout in seconds (default: 30)
        """
        if jwt_user_id is not None:
            jwt_user_id = str(jwt_user_id)

        # Ensure base_url ends with /
        self.base_url = base_url.rstrip('/') + '/'
        self.verify_https = verify_https
        self.raise_if_bad_request = raise_if_bad_request
        self.jwt_user_id = jwt_user_id
        self.jwt_expiration = jwt_expiration
        self.timeout = timeout
        self._jwt = None
        self._jwt_timeout = None

    def refresh_jwt(self) -> None:
        """
        Refresh the service token.

        Generates a new service token with the configured expiration.
        Includes a 2-second buffer to prevent token expiration during HTTP requests.
        """
        # Add a 2-second buffer to prevent the service token from expiring during the HTTP request that uses it.
        self._jwt_timeout = time.time() + (self.jwt_expiration - 2)
        self._jwt = get_service_token(self.jwt_user_id, expiration=self.jwt_expiration)
        logger.debug("Service token refreshed successfully.")

    @property
    def jwt(self) -> str:
        """
        Get the current service token, refreshing if expired.

        Returns:
            str: The current valid JWT service token
        """
        if self._jwt is None or self._jwt_timeout is None or time.time() >= self._jwt_timeout:
            self.refresh_jwt()
        return self._jwt

    @property
    def requests_auth_kwargs(self) -> dict:
        """
        Get authentication headers for requests.

        Returns:
            dict: Dictionary containing headers with X-ANSIBLE-SERVICE-AUTH
        """
        return {"headers": {self.header_name: self.jwt}}

    def _make_request(
        self,
        method: str,
        path: str,
        data: Optional[dict] = None,
        params: Optional[dict] = None,
        stream: bool = False,
    ) -> requests.Response:
        """
        Make an authenticated HTTP request to the API.

        Args:
            method: HTTP method (GET, POST, PUT, PATCH, DELETE)
            path: API path relative to base_url
            data: Request body data (will be sent as JSON)
            params: URL query parameters
            stream: Whether to stream the response

        Returns:
            requests.Response: The HTTP response object

        Raises:
            requests.exceptions.HTTPError: If raise_if_bad_request is True and request fails
        """
        url = self.base_url + path.lstrip("/")
        logger.info(f"Making {method} request to {url}.")

        kwargs = {
            **self.requests_auth_kwargs,
            "method": method,
            "url": url,
            "verify": self.verify_https,
        }

        if hasattr(self, 'timeout'):
            kwargs["timeout"] = self.timeout

        if data is not None:
            kwargs["json"] = data
        if params:
            kwargs["params"] = params
        if stream:
            kwargs["stream"] = stream

        resp = requests.request(**kwargs)
        logger.debug(f"Response status code from {url}: {resp.status_code}")

        if self.raise_if_bad_request:
            try:
                resp.raise_for_status()
            except requests.exceptions.HTTPError as e:
                content = resp.text

                # Re-raise with more context
                raise requests.exceptions.HTTPError(f"{e}\nResponse content: {content}", response=resp) from None
        return resp
