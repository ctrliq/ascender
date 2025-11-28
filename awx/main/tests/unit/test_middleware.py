import pytest
from unittest.mock import Mock, MagicMock
from django.contrib.auth.models import User
from django.http import HttpRequest, HttpResponse

from awx.main.middleware import (
    ThreadLocalMiddleware,
    get_current_request,
    get_current_user,
    impersonate,
    current_user_getter,
    _thread_locals,
)


@pytest.fixture
def cleanup_thread_locals():
    """Ensure thread-local storage and signal handlers are clean before and after each test."""
    # Clean up thread-locals before test
    if hasattr(_thread_locals, 'request'):
        del _thread_locals.request
    if hasattr(_thread_locals, 'impersonate_user'):
        del _thread_locals.impersonate_user
    
    # Disconnect all signal handlers to ensure clean state
    # Save receivers for restoration
    saved_receivers = current_user_getter.receivers[:]
    current_user_getter.receivers = []
    
    yield
    
    # Clean up thread-locals after test
    if hasattr(_thread_locals, 'request'):
        del _thread_locals.request
    if hasattr(_thread_locals, 'impersonate_user'):
        del _thread_locals.impersonate_user
    
    # Restore original signal handlers
    current_user_getter.receivers = saved_receivers


@pytest.fixture
def mock_request():
    """Create a mock request with a user."""
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
    
    def test_middleware_stores_request(self, cleanup_thread_locals, mock_request):
        """Test that middleware stores the request in thread-local storage."""
        def get_response(request):
            # Verify request is stored during request processing
            assert get_current_request() is request
            return HttpResponse()
        
        middleware = ThreadLocalMiddleware(get_response)
        middleware(mock_request)
    
    def test_middleware_cleans_up_request(self, cleanup_thread_locals, mock_request):
        """Test that middleware cleans up request after response."""
        def get_response(request):
            return HttpResponse()
        
        middleware = ThreadLocalMiddleware(get_response)
        middleware(mock_request)
        
        # Request should be cleaned up
        assert get_current_request() is None
    
    def test_middleware_cleans_up_on_exception(self, cleanup_thread_locals, mock_request):
        """Test that middleware cleans up even when get_response raises an exception."""
        def get_response(request):
            raise ValueError("Test exception")
        
        middleware = ThreadLocalMiddleware(get_response)
        
        with pytest.raises(ValueError, match="Test exception"):
            middleware(mock_request)
        
        # Request should still be cleaned up
        assert get_current_request() is None
    
    def test_middleware_cleans_up_impersonation(self, cleanup_thread_locals, mock_request, mock_user):
        """Test that middleware cleans up impersonation state."""
        def get_response(request):
            # Set impersonation during request (simulating leaked state)
            _thread_locals.impersonate_user = mock_user
            return HttpResponse()
        
        middleware = ThreadLocalMiddleware(get_response)
        middleware(mock_request)
        
        # Impersonation should be cleaned up
        assert not hasattr(_thread_locals, 'impersonate_user')
    
    def test_middleware_cleans_up_impersonation_on_exception(self, cleanup_thread_locals, mock_request, mock_user):
        """Test that middleware cleans up impersonation even on exception."""
        def get_response(request):
            _thread_locals.impersonate_user = mock_user
            raise RuntimeError("Test error")
        
        middleware = ThreadLocalMiddleware(get_response)
        
        with pytest.raises(RuntimeError, match="Test error"):
            middleware(mock_request)
        
        # Both request and impersonation should be cleaned up
        assert get_current_request() is None
        assert not hasattr(_thread_locals, 'impersonate_user')


class TestGetCurrentRequest:
    """Tests for get_current_request function."""
    
    def test_returns_none_when_no_request(self, cleanup_thread_locals):
        """Test that get_current_request returns None when no request is set."""
        assert get_current_request() is None
    
    def test_returns_stored_request(self, cleanup_thread_locals, mock_request):
        """Test that get_current_request returns the stored request."""
        _thread_locals.request = mock_request
        assert get_current_request() is mock_request


class TestGetCurrentUser:
    """Tests for get_current_user function."""
    
    def test_returns_none_when_no_context(self, cleanup_thread_locals):
        """Test that get_current_user returns None when no request or impersonation."""
        assert get_current_user() is None
    
    def test_returns_impersonated_user(self, cleanup_thread_locals, mock_request, mock_user):
        """Test that impersonated user takes precedence."""
        _thread_locals.request = mock_request
        _thread_locals.impersonate_user = mock_user
        
        assert get_current_user() is mock_user
    
    def test_returns_request_user_when_no_impersonation(self, cleanup_thread_locals, mock_request):
        """Test that request.user is returned when no impersonation."""
        _thread_locals.request = mock_request
        
        assert get_current_user() is mock_request.user
    
    def test_returns_none_when_request_has_no_user(self, cleanup_thread_locals):
        """Test that None is returned when request has no user attribute."""
        request = Mock(spec=HttpRequest)
        del request.user  # Remove user attribute
        _thread_locals.request = request
        
        assert get_current_user() is None
    
    def test_signal_handler_integration(self, cleanup_thread_locals, mock_user):
        """Test that signal handlers can provide custom user."""
        def custom_user_getter(sender, **kwargs):
            return (mock_user, 100)  # (user, priority)
        
        current_user_getter.connect(custom_user_getter)
        try:
            assert get_current_user() is mock_user
        finally:
            current_user_getter.disconnect(custom_user_getter)
    
    def test_signal_handler_with_none_response(self, cleanup_thread_locals, mock_request):
        """Test that signal handlers returning None don't interfere."""
        def returns_none(sender, **kwargs):
            return None
        
        _thread_locals.request = mock_request
        current_user_getter.connect(returns_none)
        try:
            # Should fall back to request.user
            assert get_current_user() is mock_request.user
        finally:
            current_user_getter.disconnect(returns_none)
    
    def test_signal_handler_with_invalid_response(self, cleanup_thread_locals, mock_request):
        """Test that invalid signal responses are ignored."""
        def returns_invalid(sender, **kwargs):
            return "invalid"  # Not a tuple
        
        _thread_locals.request = mock_request
        current_user_getter.connect(returns_invalid)
        try:
            # Should fall back to request.user
            assert get_current_user() is mock_request.user
        finally:
            current_user_getter.disconnect(returns_invalid)
    
    def test_signal_handler_tuple_with_none_user(self, cleanup_thread_locals, mock_request):
        """Test that signal handler can return (None, priority) to indicate no user."""
        def returns_none_tuple(sender, **kwargs):
            return (None, 50)
        
        _thread_locals.request = mock_request
        current_user_getter.connect(returns_none_tuple)
        try:
            # Should fall back to request.user since signal returned None user
            assert get_current_user() is mock_request.user
        finally:
            current_user_getter.disconnect(returns_none_tuple)
    
    def test_signal_handler_priority(self, cleanup_thread_locals, mock_user):
        """Test that multiple signal handlers work correctly."""
        user1 = Mock(spec=User)
        user1.username = 'user1'
        user2 = Mock(spec=User)
        user2.username = 'user2'
        
        def handler1(sender, **kwargs):
            return (user1, 100)
        
        def handler2(sender, **kwargs):
            return (user2, 200)
        
        current_user_getter.connect(handler1)
        current_user_getter.connect(handler2)
        try:
            # First non-None user is returned (order depends on connection order)
            user = get_current_user()
            assert user in [user1, user2]
        finally:
            current_user_getter.disconnect(handler1)
            current_user_getter.disconnect(handler2)


class TestImpersonate:
    """Tests for impersonate context manager."""
    
    def test_impersonate_sets_user(self, cleanup_thread_locals, mock_user):
        """Test that impersonate sets the user."""
        with impersonate(mock_user):
            assert get_current_user() is mock_user
    
    def test_impersonate_cleans_up(self, cleanup_thread_locals, mock_user):
        """Test that impersonate cleans up after context."""
        with impersonate(mock_user):
            pass
        
        assert not hasattr(_thread_locals, 'impersonate_user')
        assert get_current_user() is None
    
    def test_impersonate_cleans_up_on_exception(self, cleanup_thread_locals, mock_user):
        """Test that impersonate cleans up even on exception."""
        with pytest.raises(ValueError, match="Test error"):
            with impersonate(mock_user):
                raise ValueError("Test error")
        
        assert not hasattr(_thread_locals, 'impersonate_user')
    
    def test_nested_impersonation(self, cleanup_thread_locals):
        """Test that nested impersonation works correctly."""
        user1 = Mock(spec=User)
        user1.username = 'user1'
        user2 = Mock(spec=User)
        user2.username = 'user2'
        
        with impersonate(user1):
            assert get_current_user() is user1
            
            with impersonate(user2):
                assert get_current_user() is user2
            
            # Should restore to user1
            assert get_current_user() is user1
        
        # Should be fully cleaned up
        assert not hasattr(_thread_locals, 'impersonate_user')
    
    def test_impersonate_none_clears_impersonation(self, cleanup_thread_locals, mock_user):
        """Test that impersonate(None) explicitly clears impersonation."""
        _thread_locals.impersonate_user = mock_user
        
        with impersonate(None):
            assert not hasattr(_thread_locals, 'impersonate_user')
            assert get_current_user() is None
        
        # Should restore previous state (which was mock_user)
        assert get_current_user() is mock_user
    
    def test_impersonate_none_when_no_previous_state(self, cleanup_thread_locals):
        """Test that impersonate(None) works when there's no previous impersonation."""
        with impersonate(None):
            assert not hasattr(_thread_locals, 'impersonate_user')
        
        # Should remain clean
        assert not hasattr(_thread_locals, 'impersonate_user')
    
    def test_nested_impersonate_none(self, cleanup_thread_locals):
        """Test nested impersonate(None) calls."""
        user1 = Mock(spec=User)
        user1.username = 'user1'
        
        with impersonate(user1):
            assert get_current_user() is user1
            
            with impersonate(None):
                assert not hasattr(_thread_locals, 'impersonate_user')
                assert get_current_user() is None
            
            # Should restore to user1
            assert get_current_user() is user1
    
    def test_impersonate_with_request_user(self, cleanup_thread_locals, mock_request, mock_user):
        """Test that impersonation takes precedence over request.user."""
        _thread_locals.request = mock_request
        
        # Without impersonation, should get request.user
        assert get_current_user() is mock_request.user
        
        # With impersonation, should get impersonated user
        with impersonate(mock_user):
            assert get_current_user() is mock_user
        
        # After impersonation, should get request.user again
        assert get_current_user() is mock_request.user
    
    def test_multiple_sequential_impersonations(self, cleanup_thread_locals):
        """Test multiple sequential impersonation contexts."""
        user1 = Mock(spec=User)
        user1.username = 'user1'
        user2 = Mock(spec=User)
        user2.username = 'user2'
        user3 = Mock(spec=User)
        user3.username = 'user3'
        
        with impersonate(user1):
            assert get_current_user() is user1
        
        assert get_current_user() is None
        
        with impersonate(user2):
            assert get_current_user() is user2
        
        assert get_current_user() is None
        
        with impersonate(user3):
            assert get_current_user() is user3
        
        assert get_current_user() is None


class TestIntegration:
    """Integration tests for middleware and impersonation together."""
    
    def test_middleware_with_impersonation_context_manager(self, cleanup_thread_locals, mock_request, mock_user):
        """Test that middleware works correctly with proper impersonation usage."""
        def get_response(request):
            # Proper usage: impersonate with context manager
            with impersonate(mock_user):
                assert get_current_user() is mock_user
            
            # After context, should fall back to request.user
            assert get_current_user() is request.user
            return HttpResponse()
        
        middleware = ThreadLocalMiddleware(get_response)
        middleware(mock_request)
        
        # Everything should be cleaned up
        assert get_current_request() is None
        assert not hasattr(_thread_locals, 'impersonate_user')
    
    def test_middleware_cleans_up_leaked_impersonation(self, cleanup_thread_locals, mock_request, mock_user):
        """Test that middleware cleans up impersonation that wasn't properly cleaned."""
        def get_response(request):
            # Improper usage: manually setting impersonation without cleanup
            _thread_locals.impersonate_user = mock_user
            return HttpResponse()
        
        middleware = ThreadLocalMiddleware(get_response)
        middleware(mock_request)
        
        # Middleware should have cleaned up the leaked impersonation
        assert not hasattr(_thread_locals, 'impersonate_user')
    
    def test_middleware_preserves_exception_during_impersonation(self, cleanup_thread_locals, mock_request, mock_user):
        """Test that exceptions during impersonation are preserved and cleanup still happens."""
        def get_response(request):
            with impersonate(mock_user):
                raise RuntimeError("Error during impersonation")
        
        middleware = ThreadLocalMiddleware(get_response)
        
        with pytest.raises(RuntimeError, match="Error during impersonation"):
            middleware(mock_request)
        
        # Everything should be cleaned up
        assert get_current_request() is None
        assert not hasattr(_thread_locals, 'impersonate_user')
    
    def test_signal_handler_with_middleware(self, cleanup_thread_locals, mock_request, mock_user):
        """Test signal handlers work correctly with middleware."""
        def custom_getter(sender, **kwargs):
            return (mock_user, 100)
        
        current_user_getter.connect(custom_getter)
        try:
            def get_response(request):
                # Signal should provide the user
                assert get_current_user() is mock_user
                return HttpResponse()
            
            middleware = ThreadLocalMiddleware(get_response)
            middleware(mock_request)
            
            # Cleanup should still happen
            assert get_current_request() is None
        finally:
            current_user_getter.disconnect(custom_getter)
