import pytest

from django.http import HttpResponse
from django.middleware.clickjacking import XFrameOptionsMiddleware
from django.middleware.security import SecurityMiddleware
from django.test import RequestFactory


def response_through_the_header_middleware():
    """Run a plain response through the two middlewares that set the headers.

    The functional fixtures call views through APIRequestFactory, which skips
    middleware entirely, and the test database is built without migrations so a
    real request through the stack trips MigrationRanCheckMiddleware. Driving
    the middleware directly tests what the settings actually produce.
    """
    request = RequestFactory().get('/api/')
    inner = SecurityMiddleware(lambda r: HttpResponse('ok'))
    return XFrameOptionsMiddleware(inner)(request)


@pytest.mark.parametrize(
    "header, value",
    [
        ("X-Content-Type-Options", "nosniff"),
        ("Referrer-Policy", "same-origin"),
        ("Cross-Origin-Opener-Policy", "same-origin"),
        ("X-Frame-Options", "DENY"),
    ],
)
def test_responses_carry_the_security_headers(header, value):
    """These come from the application, not from whatever proxy sits in front of it."""
    assert response_through_the_header_middleware().headers[header] == value


def test_hsts_is_left_to_the_proxy():
    """Django only emits HSTS on a request it believes is HTTPS.

    Behind a TLS terminating proxy it sees HTTP unless SECURE_PROXY_SSL_HEADER
    is set, so emitting it here would be inert exactly where it matters.
    """
    assert 'Strict-Transport-Security' not in response_through_the_header_middleware().headers
