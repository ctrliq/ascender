import asyncio
import threading

from unittest.mock import Mock

import pytest

from django.contrib.auth.models import User
from django.http import HttpRequest, HttpResponse

from awx.main.middleware import ThreadLocalMiddleware
from awx.main.request_context import (
    get_current_request,
    get_current_user,
    impersonate,
    set_current_request,
    end_request_context,
    _impersonated_user,
)


@pytest.fixture
def mock_request():
    """Create a mock request with a session-authenticated user."""
    request = Mock(spec=HttpRequest)
    request.user = Mock(spec=User)
    request.user.username = 'test_user'
    return request


@pytest.fixture
def mock_user():
    """Create a mock user."""
    user = Mock(spec=User)
    user.username = 'mock_user'
    return user


class TestThreadLocalMiddleware:
    """Tests for ThreadLocalMiddleware."""

    def test_middleware_stores_request(self, mock_request):
        def get_response(request):
            # Verify request is visible during request processing
            assert get_current_request() is request
            return HttpResponse()

        middleware = ThreadLocalMiddleware(get_response)
        middleware(mock_request)

    def test_middleware_cleans_up_request(self, mock_request):
        middleware = ThreadLocalMiddleware(lambda request: HttpResponse())
        middleware(mock_request)

        assert get_current_request() is None

    def test_middleware_cleans_up_on_exception(self, mock_request):
        def get_response(request):
            raise ValueError("Test exception")

        middleware = ThreadLocalMiddleware(get_response)

        with pytest.raises(ValueError, match="Test exception"):
            middleware(mock_request)

        assert get_current_request() is None

    def test_middleware_cleans_up_leaked_impersonation(self, mock_request, mock_user):
        def get_response(request):
            # Improper usage: setting impersonation without the context manager
            _impersonated_user.set(mock_user)
            return HttpResponse()

        middleware = ThreadLocalMiddleware(get_response)
        middleware(mock_request)

        # The leaked impersonation must not bleed into the next request
        assert get_current_user() is None

    def test_middleware_cleans_up_leaked_impersonation_on_exception(self, mock_request, mock_user):
        def get_response(request):
            _impersonated_user.set(mock_user)
            raise RuntimeError("Test error")

        middleware = ThreadLocalMiddleware(get_response)

        with pytest.raises(RuntimeError, match="Test error"):
            middleware(mock_request)

        assert get_current_request() is None
        assert get_current_user() is None

    def test_async_middleware(self, mock_request):
        async def get_response(request):
            assert get_current_request() is request
            return HttpResponse()

        middleware = ThreadLocalMiddleware(get_response)
        asyncio.run(middleware(mock_request))

        assert get_current_request() is None


class TestGetCurrentRequest:
    """Tests for get_current_request function."""

    def test_returns_none_when_no_request(self):
        assert get_current_request() is None

    def test_returns_stored_request(self, mock_request):
        token = set_current_request(mock_request)
        try:
            assert get_current_request() is mock_request
        finally:
            end_request_context(token)
        assert get_current_request() is None

    def test_request_does_not_leak_to_other_threads(self, mock_request):
        token = set_current_request(mock_request)
        seen = []
        try:
            thread = threading.Thread(target=lambda: seen.append(get_current_request()))
            thread.start()
            thread.join()
        finally:
            end_request_context(token)
        assert seen == [None]


class TestGetCurrentUser:
    """Tests for get_current_user function."""

    def test_returns_none_when_no_context(self):
        assert get_current_user() is None

    def test_impersonation_wins_over_request(self, mock_request, mock_user):
        token = set_current_request(mock_request)
        try:
            with impersonate(mock_user):
                assert get_current_user() is mock_user
        finally:
            end_request_context(token)

    def test_returns_drf_user_when_authenticated(self, mock_request, mock_user):
        mock_request.drf_request_user = mock_user
        token = set_current_request(mock_request)
        try:
            assert get_current_user() is mock_user
        finally:
            end_request_context(token)

    def test_falls_back_to_session_user_when_drf_auth_failed(self, mock_request):
        # APIView.initialize_request sets drf_request_user to None when DRF
        # authentication raised; the session user still applies.
        mock_request.drf_request_user = None
        token = set_current_request(mock_request)
        try:
            assert get_current_user() is mock_request.user
        finally:
            end_request_context(token)

    def test_returns_none_for_non_drf_request(self, mock_request):
        # No DRF view ran, so drf_request_user was never set: no attribution.
        token = set_current_request(mock_request)
        try:
            assert get_current_user() is None
        finally:
            end_request_context(token)

    def test_returns_none_when_drf_user_is_false(self, mock_request):
        # drf_request_user is False when the DRF request had no user attribute.
        mock_request.drf_request_user = False
        token = set_current_request(mock_request)
        try:
            assert get_current_user() is None
        finally:
            end_request_context(token)


class TestImpersonate:
    """Tests for impersonate context manager."""

    def test_impersonate_sets_user(self, mock_user):
        with impersonate(mock_user):
            assert get_current_user() is mock_user

    def test_impersonate_yields_user(self, mock_user):
        with impersonate(mock_user) as user:
            assert user is mock_user

    def test_impersonate_cleans_up(self, mock_user):
        with impersonate(mock_user):
            pass

        assert get_current_user() is None

    def test_impersonate_cleans_up_on_exception(self, mock_user):
        with pytest.raises(ValueError, match="Test error"):
            with impersonate(mock_user):
                raise ValueError("Test error")

        assert get_current_user() is None

    def test_nested_impersonation(self):
        user1 = Mock(spec=User)
        user2 = Mock(spec=User)

        with impersonate(user1):
            assert get_current_user() is user1

            with impersonate(user2):
                assert get_current_user() is user2

            # Should restore to user1
            assert get_current_user() is user1

        assert get_current_user() is None

    def test_impersonate_none_makes_current_user_none(self, mock_request, mock_user):
        # impersonate(None) means "the current user is None" -- it overrides
        # any request-derived user, so saves inside carry no attribution.
        mock_request.drf_request_user = mock_user
        token = set_current_request(mock_request)
        try:
            assert get_current_user() is mock_user
            with impersonate(None):
                assert get_current_user() is None
            assert get_current_user() is mock_user
        finally:
            end_request_context(token)

    def test_nested_impersonate_none(self):
        user1 = Mock(spec=User)

        with impersonate(user1):
            assert get_current_user() is user1

            with impersonate(None):
                assert get_current_user() is None

            # Should restore to user1
            assert get_current_user() is user1

    def test_multiple_sequential_impersonations(self):
        for _ in range(3):
            user = Mock(spec=User)
            with impersonate(user):
                assert get_current_user() is user
            assert get_current_user() is None


class TestIntegration:
    """Integration tests for middleware and impersonation together."""

    def test_middleware_with_impersonation_context_manager(self, mock_request, mock_user):
        def get_response(request):
            with impersonate(mock_user):
                assert get_current_user() is mock_user

            # After the block, back to request-derived attribution (none here,
            # since no DRF view has stashed drf_request_user)
            assert get_current_user() is None
            return HttpResponse()

        middleware = ThreadLocalMiddleware(get_response)
        middleware(mock_request)

        assert get_current_request() is None
        assert get_current_user() is None

    def test_context_survives_thread_hop_via_asgiref(self, mock_request, mock_user):
        # sync_to_async(thread_sensitive=False) runs the body in a worker
        # thread; contextvars must propagate (thread-locals would not).
        from asgiref.sync import async_to_sync, sync_to_async

        mock_request.drf_request_user = mock_user
        token = set_current_request(mock_request)
        try:

            @async_to_sync
            async def run():
                return await sync_to_async(get_current_user, thread_sensitive=False)()

            assert run() is mock_user
        finally:
            end_request_context(token)
