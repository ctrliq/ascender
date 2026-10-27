"""TLS settings for the TCP and RELP external logging actions: who may set them, what is accepted, and the test endpoint."""

import base64
import socket
import ssl
import tempfile
import threading

import pytest

from cryptography.hazmat.primitives.serialization import Encoding

from ascender.api.versioning import reverse
from ascender.conf.models import Setting
from ascender.main.tests.functional.api.test_settings import _mock_logging_defaults
from ascender.main.tests.tls_pki import make_ca, make_leaf

KEYS = ['LOG_AGGREGATOR_TLS', 'LOG_AGGREGATOR_TLS_CA_CERTIFICATE', 'LOG_AGGREGATOR_TLS_CLIENT_CERTIFICATE', 'LOG_AGGREGATOR_TLS_CLIENT_KEY']


@pytest.fixture(scope='module')
def pki():
    ca = make_ca()
    return dict(
        ca=ca,
        other_ca=make_ca('Some Other CA'),
        client=make_leaf(ca, ['ascender-client']),
        other_client=make_leaf(ca, ['someone-else']),
        expired=make_leaf(ca, ['ascender-client'], days=(-30, -1)),
        not_yet_valid=make_leaf(ca, ['ascender-client'], days=(1, 30)),
        expired_ca=make_ca('Expired CA', days=(-30, -1)),
    )


@pytest.fixture
def url():
    return reverse('api:setting_singleton_detail', kwargs={'category_slug': 'logging'})


def _client(pki):
    return {'LOG_AGGREGATOR_TLS_CLIENT_CERTIFICATE': pki['client'].pem, 'LOG_AGGREGATOR_TLS_CLIENT_KEY': pki['client'].key_pem}


@pytest.mark.django_db
def test_tls_settings_round_trip(get, patch, admin, url, pki):
    patch(url, user=admin, data={'LOG_AGGREGATOR_TLS': True, 'LOG_AGGREGATOR_TLS_CA_CERTIFICATE': pki['ca'].pem, **_client(pki)}, expect=200)
    data = get(url, user=admin, expect=200).data
    assert data['LOG_AGGREGATOR_TLS'] is True
    # stored as given, less the surrounding whitespace every CharField setting trims
    assert data['LOG_AGGREGATOR_TLS_CA_CERTIFICATE'] == pki['ca'].pem.strip()
    assert data['LOG_AGGREGATOR_TLS_CLIENT_CERTIFICATE'] == pki['client'].pem.strip()
    # the API never returns the key, and the database holds it encrypted
    assert data['LOG_AGGREGATOR_TLS_CLIENT_KEY'] == '$encrypted$'
    stored = Setting.objects.get(key='LOG_AGGREGATOR_TLS_CLIENT_KEY').value
    assert stored.startswith('$encrypted$') and 'PRIVATE KEY' not in stored

    from django.conf import settings

    assert settings.LOG_AGGREGATOR_TLS_CLIENT_KEY == pki['client'].key_pem.strip()


@pytest.mark.django_db
def test_only_a_system_administrator_writes_tls_settings(get, patch, system_auditor, alice, url, pki):
    patch(url, user=system_auditor, data=_client(pki), expect=403)
    patch(url, user=alice, data=_client(pki), expect=403)
    get(url, user=alice, expect=403)
    assert not Setting.objects.filter(key__in=KEYS).exists()


@pytest.mark.django_db
def test_an_auditor_reads_the_key_as_encrypted(get, patch, admin, system_auditor, url, pki):
    patch(url, user=admin, data=_client(pki), expect=200)
    data = get(url, user=system_auditor, expect=200).data
    assert data['LOG_AGGREGATOR_TLS_CLIENT_KEY'] == '$encrypted$'


@pytest.mark.django_db
@pytest.mark.parametrize(
    'field, value',
    [
        ('LOG_AGGREGATOR_TLS_CA_CERTIFICATE', 'not a certificate'),
        ('LOG_AGGREGATOR_TLS_CLIENT_CERTIFICATE', 'not a certificate'),
        # framed and base64, but not X.509: the PEM-only check used to let this through
        ('LOG_AGGREGATOR_TLS_CA_CERTIFICATE', '-----BEGIN CERTIFICATE-----\n' + base64.b64encode(b'not der at all').decode() + '\n-----END CERTIFICATE-----'),
        ('LOG_AGGREGATOR_TLS_CLIENT_KEY', 'not a key'),
    ],
)
def test_malformed_pem_is_rejected(patch, admin, url, field, value):
    response = patch(url, user=admin, data={field: value}, expect=400)
    assert field in response.data
    assert not Setting.objects.filter(key=field).exists()


@pytest.mark.django_db
def test_errors_do_not_repeat_the_submitted_key(patch, admin, url, pki):
    # validate_pem quotes the first 100 characters of input it can't read; for a key that is the secret itself
    damaged = pki['client'].key_pem.replace('-----END PRIVATE KEY-----', '-----END PRIVATE KAY-----')
    response = patch(url, user=admin, data={'LOG_AGGREGATOR_TLS_CLIENT_KEY': damaged, 'LOG_AGGREGATOR_TLS_CLIENT_CERTIFICATE': pki['client'].pem}, expect=400)
    body = str(response.data)
    assert 'LOG_AGGREGATOR_TLS_CLIENT_KEY' in response.data
    for line in damaged.splitlines()[1:-1]:
        assert line not in body


@pytest.mark.django_db
def test_a_bare_base64_ca_is_accepted(get, patch, admin, url, pki):
    # validate_certificate has always accepted a certificate without its BEGIN/END lines; it still is, and the
    # configurer writes it framed (unit tests)
    bare = base64.b64encode(pki['ca'].certificate.public_bytes(Encoding.DER)).decode()
    patch(url, user=admin, data={'LOG_AGGREGATOR_TLS_CA_CERTIFICATE': bare}, expect=200)


@pytest.mark.django_db
def test_a_key_in_a_certificate_field_is_rejected(patch, admin, url, pki):
    response = patch(url, user=admin, data={'LOG_AGGREGATOR_TLS_CA_CERTIFICATE': pki['client'].key_pem}, expect=400)
    assert 'LOG_AGGREGATOR_TLS_CA_CERTIFICATE' in response.data


TLS_ON = {
    'LOG_AGGREGATOR_ENABLED': True,
    'LOG_AGGREGATOR_TYPE': 'other',
    'LOG_AGGREGATOR_HOST': 'logs.example.com',
    'LOG_AGGREGATOR_PROTOCOL': 'tcp',
    'LOG_AGGREGATOR_TLS': True,
}


@pytest.mark.django_db
@pytest.mark.parametrize('which', ['expired', 'not_yet_valid'])
def test_a_client_certificate_outside_its_validity_is_rejected_while_tls_is_in_use(patch, admin, url, pki, which):
    leaf = pki[which]
    data = {'LOG_AGGREGATOR_TLS_CLIENT_CERTIFICATE': leaf.pem, 'LOG_AGGREGATOR_TLS_CLIENT_KEY': leaf.key_pem}
    response = patch(url, user=admin, data={**TLS_ON, **data}, expect=400)
    assert 'is not valid now' in str(response.data)


@pytest.mark.django_db
def test_an_expired_ca_is_rejected_while_tls_is_in_use(patch, admin, url, pki):
    bundle = pki['ca'].pem + pki['expired_ca'].pem  # one good certificate does not carry an expired one
    response = patch(url, user=admin, data={**TLS_ON, 'LOG_AGGREGATOR_TLS_CA_CERTIFICATE': bundle}, expect=400)
    assert 'Expired CA' in str(response.data)


@pytest.mark.django_db
def test_an_expired_certificate_does_not_block_unrelated_saves(patch, admin, url, pki):
    # the dates matter only while TLS is in use: saving it with TLS off works, and so does turning logging off
    leaf = pki['expired']
    certificates = {
        'LOG_AGGREGATOR_TLS_CA_CERTIFICATE': pki['expired_ca'].pem,
        'LOG_AGGREGATOR_TLS_CLIENT_CERTIFICATE': leaf.pem,
        'LOG_AGGREGATOR_TLS_CLIENT_KEY': leaf.key_pem,
    }
    patch(url, user=admin, data=certificates, expect=200)
    patch(url, user=admin, data={**TLS_ON, 'LOG_AGGREGATOR_TLS': False}, expect=200)
    patch(url, user=admin, data={'LOG_AGGREGATOR_ENABLED': False, 'LOG_AGGREGATOR_TLS': True}, expect=200)
    response = patch(url, user=admin, data={'LOG_AGGREGATOR_ENABLED': True}, expect=400)  # this would put them in use
    assert 'is not valid now' in str(response.data)


@pytest.mark.django_db
@pytest.mark.parametrize('host', ['logs.example.com,evil.example.com', 'logs example.com'])
def test_a_host_rsyslog_would_split_is_rejected_with_tls(patch, admin, url, host):
    # StreamDriverPermittedPeers is split on commas
    response = patch(url, user=admin, data={**TLS_ON, 'LOG_AGGREGATOR_HOST': host}, expect=400)
    assert 'must not contain commas or whitespace' in str(response.data)


@pytest.mark.django_db
def test_the_changed_view_applies_the_tls_checks(patch, admin, url, pki):
    # /settings/changed/ has no category validator of its own; the TLS checks still run for a logging change there
    changed = reverse('api:setting_singleton_detail', kwargs={'category_slug': 'changed'})
    patch(url, user=admin, data={'LOG_AGGREGATOR_PROTOCOL': 'relp', 'LOG_AGGREGATOR_TLS': True, **_client(pki)}, expect=200)
    response = patch(changed, user=admin, data={'LOG_AGGREGATOR_TLS_CLIENT_CERTIFICATE': '', 'LOG_AGGREGATOR_TLS_CLIENT_KEY': ''}, expect=400)
    assert 'RELP over TLS needs' in str(response.data)
    response = patch(changed, user=admin, data={'LOG_AGGREGATOR_TLS_CLIENT_KEY': pki['other_client'].key_pem}, expect=400)
    assert 'does not match' in str(response.data)
    # and an unrelated change there is unaffected
    patch(changed, user=admin, data={'ACTIVITY_STREAM_ENABLED': False}, expect=200)


@pytest.mark.django_db
def test_an_encrypted_key_is_rejected(patch, admin, url, pki):
    # rsyslog has no setting for a passphrase, so it could never load this key
    data = {'LOG_AGGREGATOR_TLS_CLIENT_CERTIFICATE': pki['client'].pem, 'LOG_AGGREGATOR_TLS_CLIENT_KEY': pki['client'].encrypted_key_pem}
    response = patch(url, user=admin, data=data, expect=400)
    assert 'must not be encrypted' in str(response.data['LOG_AGGREGATOR_TLS_CLIENT_KEY'])
    assert not Setting.objects.filter(key__in=KEYS).exists()


@pytest.mark.django_db
@pytest.mark.parametrize('half', ['LOG_AGGREGATOR_TLS_CLIENT_CERTIFICATE', 'LOG_AGGREGATOR_TLS_CLIENT_KEY'])
def test_a_client_certificate_and_key_are_set_together(patch, admin, url, pki, half):
    response = patch(url, user=admin, data={half: _client(pki)[half]}, expect=400)
    assert 'must be set together' in str(response.data)
    assert not Setting.objects.filter(key=half).exists()


@pytest.mark.django_db
def test_a_key_that_does_not_match_the_certificate_is_rejected(patch, admin, url, pki):
    data = {'LOG_AGGREGATOR_TLS_CLIENT_CERTIFICATE': pki['client'].pem, 'LOG_AGGREGATOR_TLS_CLIENT_KEY': pki['other_client'].key_pem}
    response = patch(url, user=admin, data=data, expect=400)
    assert 'does not match' in str(response.data)


@pytest.mark.django_db
def test_a_chain_matches_on_its_first_certificate(patch, admin, url, pki):
    data = {'LOG_AGGREGATOR_TLS_CLIENT_CERTIFICATE': pki['client'].pem + pki['ca'].pem, 'LOG_AGGREGATOR_TLS_CLIENT_KEY': pki['client'].key_pem}
    patch(url, user=admin, data=data, expect=200)


@pytest.mark.django_db
def test_relp_over_tls_requires_a_client_certificate(patch, admin, url, pki):
    # without one, librelp never checks that the aggregator's certificate names LOG_AGGREGATOR_HOST
    response = patch(url, user=admin, data={'LOG_AGGREGATOR_PROTOCOL': 'relp', 'LOG_AGGREGATOR_TLS': True}, expect=400)
    assert 'RELP over TLS needs' in str(response.data)
    patch(url, user=admin, data={'LOG_AGGREGATOR_PROTOCOL': 'relp', 'LOG_AGGREGATOR_TLS': True, **_client(pki)}, expect=200)
    # and once set, it can't be cleared while RELP over TLS is configured
    response = patch(url, user=admin, data={'LOG_AGGREGATOR_TLS_CLIENT_CERTIFICATE': '', 'LOG_AGGREGATOR_TLS_CLIENT_KEY': ''}, expect=400)
    assert 'RELP over TLS needs' in str(response.data)


@pytest.mark.django_db
@pytest.mark.parametrize(
    'data', [{'LOG_AGGREGATOR_PROTOCOL': 'tcp', 'LOG_AGGREGATOR_TLS': True}, {'LOG_AGGREGATOR_PROTOCOL': 'relp', 'LOG_AGGREGATOR_TLS': False}]
)
def test_a_client_certificate_is_optional_otherwise(patch, admin, url, data):
    patch(url, user=admin, data=data, expect=200)


@pytest.mark.django_db
def test_the_stored_key_stands_in_for_the_encrypted_placeholder(get, patch, put, admin, url, pki):
    patch(url, user=admin, data=_client(pki), expect=200)

    # the UI sends back what it read: the key as $encrypted$, which leaves the stored key in place
    data = dict(get(url, user=admin, expect=200).data)
    data['LOG_AGGREGATOR_TLS'] = True
    put(url, user=admin, data=data, expect=200)
    from django.conf import settings

    assert settings.LOG_AGGREGATOR_TLS_CLIENT_KEY == pki['client'].key_pem.strip()

    # the pairing check uses the stored key, so a certificate for another key is still refused
    data = {'LOG_AGGREGATOR_TLS_CLIENT_CERTIFICATE': pki['other_client'].pem, 'LOG_AGGREGATOR_TLS_CLIENT_KEY': '$encrypted$'}
    response = patch(url, user=admin, data=data, expect=400)
    assert 'does not match' in str(response.data)


@pytest.mark.django_db
def test_clearing_the_client_certificate_and_key_together(get, patch, admin, url, pki):
    patch(url, user=admin, data=_client(pki), expect=200)
    patch(url, user=admin, data={'LOG_AGGREGATOR_TLS_CLIENT_CERTIFICATE': '', 'LOG_AGGREGATOR_TLS_CLIENT_KEY': ''}, expect=200)
    data = get(url, user=admin, expect=200).data
    assert data['LOG_AGGREGATOR_TLS_CLIENT_CERTIFICATE'] == '' and data['LOG_AGGREGATOR_TLS_CLIENT_KEY'] == ''


@pytest.mark.django_db
def test_tls_settings_listed_after_revert(patch, delete, admin, url):
    # run_rsyslog_configurer clears the cached LOG_AGGREGATOR_* values it finds in dir(settings), which lists
    # database rows and file defaults only; without a file default a reverted setting would keep its cached value
    from django.conf import settings

    patch(url, user=admin, data={'LOG_AGGREGATOR_TLS': True}, expect=200)
    delete(url, user=admin, expect=204)
    assert not Setting.objects.filter(key__in=KEYS).exists()
    listed = dir(settings)
    assert [key for key in KEYS if key not in listed] == []
    assert settings.LOG_AGGREGATOR_TLS is False


class _TLSListener:
    """A TLS server on 127.0.0.1 that completes one handshake per connection, optionally requiring a client certificate."""

    def __init__(self, ca, leaf, require_client_ca=None, require_sni=False, close_after_handshake=False):
        self.close_after_handshake = close_after_handshake
        self.context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        if require_sni:
            # an aggregator behind SNI-based routing: rsyslog sends no SNI, so it can't reach one
            self.context.sni_callback = lambda sock, name, context: ssl.ALERT_DESCRIPTION_UNRECOGNIZED_NAME if name is None else None
        with tempfile.NamedTemporaryFile('w', suffix='.pem') as certfile, tempfile.NamedTemporaryFile('w', suffix='.key') as keyfile:
            certfile.write(leaf.pem)
            keyfile.write(leaf.key_pem)
            certfile.flush()
            keyfile.flush()
            self.context.load_cert_chain(certfile.name, keyfile.name)
        if require_client_ca:
            self.context.verify_mode = ssl.CERT_REQUIRED
            self.context.load_verify_locations(cadata=require_client_ca.pem)
        self.sock = socket.socket()
        self.sock.bind(('127.0.0.1', 0))
        self.sock.listen(5)
        self.port = self.sock.getsockname()[1]
        threading.Thread(target=self._serve, daemon=True).start()

    def _serve(self):
        while True:
            try:
                connection, _ = self.sock.accept()
            except OSError:
                return
            threading.Thread(target=self._session, args=(connection,), daemon=True).start()

    def _session(self, connection):
        # an aggregator that accepts keeps the session open; close_after_handshake mimics one that drops it after
        # its own client-certificate or permitted-peer check, as rsyslog's imtcp does
        try:
            with self.context.wrap_socket(connection, server_side=True) as session:
                session.settimeout(5)
                while not self.close_after_handshake and session.recv(1024):
                    pass
        except (ssl.SSLError, OSError):
            pass

    def close(self):
        self.sock.close()


@pytest.fixture
def listeners(pki):
    ca = pki['ca']
    made = dict(
        good=_TLSListener(ca, make_leaf(ca, ['localhost'])),
        wrong_name=_TLSListener(ca, make_leaf(ca, ['elsewhere.example.com'])),
        other_ca=_TLSListener(pki['other_ca'], make_leaf(pki['other_ca'], ['localhost'])),
        client_required=_TLSListener(ca, make_leaf(ca, ['localhost']), require_client_ca=ca),
        sni_required=_TLSListener(ca, make_leaf(ca, ['localhost']), require_sni=True),
        ip_only=_TLSListener(ca, make_leaf(ca, ['127.0.0.1'], common_name='aggregator')),
        closes=_TLSListener(ca, make_leaf(ca, ['localhost']), close_after_handshake=True),
    )
    yield made
    for listener in made.values():
        listener.close()


@pytest.mark.django_db
@pytest.mark.parametrize(
    'protocol, listener, verify, client, expect',
    [
        ('tcp', 'good', True, False, 202),
        ('tcp', 'wrong_name', True, False, 400),
        ('tcp', 'other_ca', True, False, 400),
        ('tcp', 'other_ca', False, False, 202),  # verification off over TCP checks nothing, as omfwd's anon mode
        ('tcp', 'client_required', True, False, 400),
        ('tcp', 'client_required', True, True, 202),
        ('relp', 'good', True, True, 202),
        ('relp', 'wrong_name', True, True, 400),
        ('relp', 'wrong_name', False, True, 202),  # off drops the name check
        ('relp', 'other_ca', False, True, 400),  # but librelp still checks the chain
        ('relp', 'client_required', True, True, 202),
        ('tcp', 'sni_required', True, False, 400),  # the probe sends no SNI, as rsyslog sends none
        ('relp', 'sni_required', True, True, 400),
        ('tcp', 'ip_only', True, False, 202),  # host 127.0.0.1 below: omfwd matches an IP subjectAltName
        ('relp', 'ip_only', True, True, 400),  # librelp compares DNS names and the common name only
        ('tcp', 'closes', True, False, 400),  # a session dropped right after the handshake is a refusal
        ('relp', 'closes', True, True, 400),
    ],
)
def test_the_logging_test_endpoint_does_a_tls_handshake(put, post, admin, url, pki, listeners, protocol, listener, verify, client, expect):
    # a TLS listener accepts the plain TCP connect the endpoint used to make, whatever the TLS session would do
    _, data = _mock_logging_defaults()
    data.update(
        LOG_AGGREGATOR_ENABLED=True,
        LOG_AGGREGATOR_TYPE='other',
        LOG_AGGREGATOR_HOST='127.0.0.1' if listener == 'ip_only' else 'localhost',
        LOG_AGGREGATOR_PORT=listeners[listener].port,
        LOG_AGGREGATOR_PROTOCOL=protocol,
        LOG_AGGREGATOR_TLS=True,
        LOG_AGGREGATOR_VERIFY_CERT=verify,
        LOG_AGGREGATOR_TLS_CA_CERTIFICATE=pki['ca'].pem,
    )
    if client:
        data.update(_client(pki))
    put(url, data=data, user=admin, expect=200)
    response = post(reverse('api:setting_logging_test'), {}, user=admin, expect=expect)
    if expect == 400:
        assert response.data['error'].startswith(f'TLS handshake with {data["LOG_AGGREGATOR_HOST"]}:{listeners[listener].port} failed:')
        assert 'PRIVATE KEY' not in response.data['error']


@pytest.mark.django_db
def test_the_logging_test_endpoint_reports_a_stopped_configuration(put, post, admin, url, monkeypatch):
    # the configurer wrote a config that ships nothing; the test must not report success
    import ascender.conf.views

    monkeypatch.setattr(ascender.conf.views, 'stopped_reason', lambda: 'its TLS files could not be written')
    _, data = _mock_logging_defaults()
    data.update(LOG_AGGREGATOR_ENABLED=True, LOG_AGGREGATOR_TYPE='other', LOG_AGGREGATOR_HOST='https://localhost')
    put(url, data=data, user=admin, expect=200)
    response = post(reverse('api:setting_logging_test'), {}, user=admin, expect=400)
    assert response.data['error'] == 'External logging is stopped: its TLS files could not be written'


def _unsupported_key_certificate(leaf):
    """leaf's certificate with its public key algorithm OID changed to one no library knows (signature left broken)."""
    from cryptography import x509 as _x509

    der = leaf.certificate.public_bytes(Encoding.DER)
    ec_public_key = bytes.fromhex('06072a8648ce3d0201')  # OID 1.2.840.10045.2.1
    assert der.count(ec_public_key) == 1
    changed = der.replace(ec_public_key, bytes.fromhex('06072a8648ce3d0263'))
    return _x509.load_der_x509_certificate(changed).public_bytes(Encoding.PEM).decode()


@pytest.mark.django_db
def test_a_certificate_with_an_unsupported_key_algorithm_is_rejected_not_a_500(patch, admin, url, pki):
    data = {'LOG_AGGREGATOR_TLS_CLIENT_CERTIFICATE': _unsupported_key_certificate(pki['client']), 'LOG_AGGREGATOR_TLS_CLIENT_KEY': pki['client'].key_pem}
    response = patch(url, user=admin, data=data, expect=400)
    assert 'cannot be loaded' in str(response.data)


def _store_bypassing_validation(**values):
    """Write settings rows directly, as a path that skips validation could, and drop the cached values."""
    from django.conf import settings
    from django.core.cache import cache

    for key, value in values.items():
        Setting.objects.update_or_create(key=key, user=None, defaults=dict(value=value))
    cache.clear()
    getattr(settings, '_ascender_conf_memoizedcache', {}).clear()


@pytest.mark.django_db
def test_an_expired_stored_certificate_does_not_block_other_screens(get, patch, put, admin, url, pki):
    # the UI saves the LDAP, UI and Misc screens through /settings/all/, which runs every category's validator
    leaf = pki['expired']
    patch(url, user=admin, data={'LOG_AGGREGATOR_TLS_CLIENT_CERTIFICATE': leaf.pem, 'LOG_AGGREGATOR_TLS_CLIENT_KEY': leaf.key_pem}, expect=200)
    _store_bypassing_validation(**{k: v for k, v in TLS_ON.items()})  # now in use, with an expired certificate
    every = reverse('api:setting_singleton_detail', kwargs={'category_slug': 'all'})
    patch(every, user=admin, data={'AUTH_LDAP_BIND_DN': 'cn=ascender,dc=example,dc=com'}, expect=200)
    # re-sending what is stored changes nothing, so nothing is refused for the stored state
    changed = reverse('api:setting_singleton_detail', kwargs={'category_slug': 'changed'})
    put(changed, user=admin, data=dict(get(changed, user=admin, expect=200).data), expect=200)
    put(url, user=admin, data=dict(get(url, user=admin, expect=200).data), expect=200)
    # a logging change that doesn't put a certificate into use isn't held up either
    patch(url, user=admin, data={'LOG_AGGREGATOR_LEVEL': 'ERROR'}, expect=200)
    # one that does is: turning TLS off and on again
    patch(url, user=admin, data={'LOG_AGGREGATOR_TLS': False}, expect=200)
    response = patch(url, user=admin, data={'LOG_AGGREGATOR_TLS': True}, expect=400)
    assert 'is not valid now' in str(response.data)


@pytest.mark.django_db
def test_an_expired_ca_is_ignored_for_tcp_without_verification(patch, admin, url, pki):
    # omfwd's anon mode never reads the CA
    patch(url, user=admin, data={**TLS_ON, 'LOG_AGGREGATOR_VERIFY_CERT': False, 'LOG_AGGREGATOR_TLS_CA_CERTIFICATE': pki['expired_ca'].pem}, expect=200)
    response = patch(url, user=admin, data={'LOG_AGGREGATOR_VERIFY_CERT': True}, expect=400)
    assert 'Expired CA' in str(response.data)
