from django.test import RequestFactory
from social_core.exceptions import AuthCanceled

from ascender.sso.middleware import SocialAuthMiddleware
from ascender.sso.social_base_pipeline import ExternalLoginCollision

ATTACKER_TEXT = 'Your account is locked. Call IT at 555-0100 with your password'


class FakeStrategy:
    def request_data(self):
        return {}

    def session_get(self, name, default=None):
        return default

    def setting(self, name, default=None, **kwargs):
        if name == 'LOGIN_ERROR_URL':
            return '/sso/error/'
        return default


def make_middleware():
    return SocialAuthMiddleware(lambda request: None)


def make_request(error_description=ATTACKER_TEXT):
    request = RequestFactory().get('/sso/complete/oidc/', {'error_description': error_description})
    request.social_strategy = FakeStrategy()
    request.backend = type('Backend', (), {'name': 'oidc'})()
    # A different last backend puts the middleware on the branch that reads
    # error_description from the request.
    request.session = {'social_auth_last_backend': 'github'}
    return request


def test_collision_message_is_shown():
    message = make_middleware().get_display_message(make_request(), ExternalLoginCollision(None, 'Sign-in could not be completed.', 'abc123'))
    assert 'request ID abc123' in message


def test_provider_text_is_not_shown():
    message = make_middleware().get_display_message(make_request(), AuthCanceled(None))
    assert message == 'Sign-in could not be completed. Please try again.'
    assert '555-0100' not in message


def test_provider_error_description_is_not_stored_on_the_session():
    request = make_request()
    make_middleware().process_exception(request, AuthCanceled(None))
    _, message = request.session['social_auth_error']
    assert message == 'Sign-in could not be completed. Please try again.'
    assert '555-0100' not in message


def test_collision_message_is_stored_on_the_session():
    request = make_request()
    make_middleware().process_exception(request, ExternalLoginCollision(None, 'Sign-in could not be completed.', 'abc123'))
    _, message = request.session['social_auth_error']
    assert 'request ID abc123' in message
