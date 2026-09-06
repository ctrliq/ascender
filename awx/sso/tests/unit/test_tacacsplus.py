from unittest import mock
import pytest


def test_empty_host_fails_auth(tacacsplus_backend):
    with mock.patch('awx.sso.backends.django_settings') as settings:
        settings.TACACSPLUS_HOST = ''
        ret_user = tacacsplus_backend.authenticate(None, u"user", u"pass")
        assert ret_user is None


def test_client_raises_exception(tacacsplus_backend):
    client = mock.MagicMock()
    client.authenticate.side_effect = Exception("foo")
    with mock.patch('awx.sso.backends.django_settings') as settings, mock.patch('awx.sso.backends.logger') as logger, mock.patch(
        'awx.sso.backends.TACACSClient', return_value=client
    ):
        settings.TACACSPLUS_HOST = 'localhost'
        settings.TACACSPLUS_AUTH_PROTOCOL = 'ascii'
        ret_user = tacacsplus_backend.authenticate(None, u"user", u"pass")
        assert ret_user is None
        logger.exception.assert_called_once_with("TACACS+ Authentication Error: foo")


def test_client_return_invalid_fails_auth(tacacsplus_backend):
    auth = mock.MagicMock()
    auth.valid = False
    client = mock.MagicMock()
    client.authenticate.return_value = auth
    with mock.patch('awx.sso.backends.django_settings') as settings, mock.patch('awx.sso.backends.TACACSClient', return_value=client):
        settings.TACACSPLUS_HOST = 'localhost'
        settings.TACACSPLUS_AUTH_PROTOCOL = 'ascii'
        ret_user = tacacsplus_backend.authenticate(None, u"user", u"pass")
        assert ret_user is None


def test_client_return_valid_passes_auth(tacacsplus_backend):
    auth = mock.MagicMock()
    auth.valid = True
    client = mock.MagicMock()
    client.authenticate.return_value = auth
    user = mock.MagicMock()
    user.has_usable_password = mock.MagicMock(return_value=False)
    with mock.patch('awx.sso.backends.django_settings') as settings, mock.patch('awx.sso.backends.TACACSClient', return_value=client), mock.patch(
        'awx.sso.backends._get_or_set_enterprise_user', return_value=user
    ):
        settings.TACACSPLUS_HOST = 'localhost'
        settings.TACACSPLUS_AUTH_PROTOCOL = 'ascii'
        ret_user = tacacsplus_backend.authenticate(None, u"user", u"pass")
        assert ret_user == user


@pytest.mark.parametrize(
    "client_ip_header,client_ip_header_value,expected_client_ip",
    [('HTTP_X_FORWARDED_FOR', '12.34.56.78, 23.45.67.89', '12.34.56.78'), ('REMOTE_ADDR', '12.34.56.78', '12.34.56.78')],
)
def test_remote_addr_is_passed_to_client_if_available_and_setting_enabled(tacacsplus_backend, client_ip_header, client_ip_header_value, expected_client_ip):
    auth = mock.MagicMock()
    auth.valid = True
    client = mock.MagicMock()
    client.authenticate.return_value = auth
    user = mock.MagicMock()
    user.has_usable_password = mock.MagicMock(return_value=False)
    request = mock.MagicMock()
    request.META = {
        client_ip_header: client_ip_header_value,
    }
    with mock.patch('awx.sso.backends.django_settings') as settings, mock.patch('awx.sso.backends.TACACSClient', return_value=client), mock.patch(
        'awx.sso.backends._get_or_set_enterprise_user', return_value=user
    ):
        settings.TACACSPLUS_HOST = 'localhost'
        settings.TACACSPLUS_AUTH_PROTOCOL = 'ascii'
        settings.TACACSPLUS_REM_ADDR = True
        tacacsplus_backend.authenticate(request, u"user", u"pass")

        client.authenticate.assert_called_once_with('user', 'pass', authen_type=1, rem_addr=expected_client_ip)


def test_remote_addr_is_completely_ignored_in_client_call_if_setting_is_disabled(tacacsplus_backend):
    auth = mock.MagicMock()
    auth.valid = True
    client = mock.MagicMock()
    client.authenticate.return_value = auth
    user = mock.MagicMock()
    user.has_usable_password = mock.MagicMock(return_value=False)
    request = mock.MagicMock()
    request.META = {}
    with mock.patch('awx.sso.backends.django_settings') as settings, mock.patch('awx.sso.backends.TACACSClient', return_value=client), mock.patch(
        'awx.sso.backends._get_or_set_enterprise_user', return_value=user
    ):
        settings.TACACSPLUS_HOST = 'localhost'
        settings.TACACSPLUS_AUTH_PROTOCOL = 'ascii'
        settings.TACACSPLUS_REM_ADDR = False
        tacacsplus_backend.authenticate(request, u"user", u"pass")

        client.authenticate.assert_called_once_with('user', 'pass', authen_type=1)


def test_remote_addr_is_completely_ignored_in_client_call_if_unavailable_and_setting_enabled(tacacsplus_backend):
    auth = mock.MagicMock()
    auth.valid = True
    client = mock.MagicMock()
    client.authenticate.return_value = auth
    user = mock.MagicMock()
    user.has_usable_password = mock.MagicMock(return_value=False)
    request = mock.MagicMock()
    request.META = {}
    with mock.patch('awx.sso.backends.django_settings') as settings, mock.patch('awx.sso.backends.TACACSClient', return_value=client), mock.patch(
        'awx.sso.backends._get_or_set_enterprise_user', return_value=user
    ):
        settings.TACACSPLUS_HOST = 'localhost'
        settings.TACACSPLUS_AUTH_PROTOCOL = 'ascii'
        settings.TACACSPLUS_REM_ADDR = True
        tacacsplus_backend.authenticate(request, u"user", u"pass")

        client.authenticate.assert_called_once_with('user', 'pass', authen_type=1)


def test_backend_binds_the_names_the_installed_tacacs_plus_actually_exports():
    """Bind the backend's TACACS+ names against the real package, not a mock.

    Every other test in this module patches the client, so none of them notices
    when the package moves a name. The backend used to read both names off the
    top-level ``tacacs_plus`` package, which worked on 1.0 and stopped working
    on 2.x, where ``__init__.py`` is empty and the names live in
    ``tacacs_plus.client`` and ``tacacs_plus.flags``. That lookup raises
    ``AttributeError`` inside ``authenticate``, where the broad ``except``
    turns it into a logged error and a ``None`` return, so the only visible
    symptom is that TACACS+ logins stop working.

    Asserting against the installed package means a future layout change fails
    here rather than at somebody's login prompt.
    """
    from tacacs_plus.client import TACACSClient as installed_client
    from tacacs_plus.flags import TAC_PLUS_AUTHEN_TYPES as installed_types

    from awx.sso import backends

    assert backends.TACACSClient is installed_client
    assert backends.TAC_PLUS_AUTHEN_TYPES is installed_types

    # awx/sso/conf.py offers exactly these two for TACACSPLUS_AUTH_PROTOCOL, and
    # authenticate() indexes the dict with whichever one is set.
    for protocol in ('ascii', 'pap'):
        assert protocol in installed_types


def test_installed_tacacs_client_accepts_the_arguments_the_backend_passes():
    """Construct the real client the way the backend does.

    The socket is opened lazily, so building the object touches no network. It
    does check that the constructor still takes the host, port, secret and
    timeout that ``authenticate`` hands it positionally and by keyword.
    """
    from tacacs_plus.client import TACACSClient

    client = TACACSClient('localhost', 49, 'secret', timeout=5)

    assert client.host == 'localhost'
    assert client.port == 49
    assert client.timeout == 5
