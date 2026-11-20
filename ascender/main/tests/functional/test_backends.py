import pytest

from ascender.main.backends import AscenderModelBackend, AWXModelBackend


@pytest.mark.django_db
def test_old_backend_name_loads_sessions_but_does_not_authenticate(user):
    """Both names are listed in AUTHENTICATION_BACKENDS, and django tries each.

    The old one is there only so sessions recorded under it still load. Were it
    to authenticate as well, every failed local login would be tried twice.
    """
    alice = user('alice', False)  # the fixture's password is the username

    assert AscenderModelBackend().authenticate(None, username='alice', password='alice') == alice
    assert AWXModelBackend().authenticate(None, username='alice', password='alice') is None
    assert AWXModelBackend().get_user(alice.pk) == alice


@pytest.mark.django_db
def test_session_recorded_under_the_old_backend_name_still_loads(user, rf):
    """A session opened before the rename records the old path, and still loads.

    django refuses a session whose recorded backend is not listed in
    AUTHENTICATION_BACKENDS, so this holds only while the alias stays listed.
    """
    from django.contrib.auth import BACKEND_SESSION_KEY, HASH_SESSION_KEY, SESSION_KEY, get_user
    from django.contrib.sessions.backends.db import SessionStore

    alice = user('alice', False)
    request = rf.get('/')
    request.session = SessionStore()
    request.session[SESSION_KEY] = str(alice.pk)
    request.session[BACKEND_SESSION_KEY] = 'ascender.main.backends.AWXModelBackend'
    request.session[HASH_SESSION_KEY] = alice.get_session_auth_hash()

    assert get_user(request) == alice
