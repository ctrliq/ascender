"""TLS for the TCP (omfwd) and RELP (omrelp) external logging actions."""

import base64
import os
import shutil
import stat
import subprocess

import pytest

from cryptography import x509
from cryptography.hazmat.primitives.serialization import Encoding
from django.conf import settings

from ascender.main.utils import external_logging
from ascender.main.utils.external_logging import construct_rsyslog_conf_template, write_tls_files
from ascender.main.tests.functional.api.test_settings import _mock_logging_defaults
from ascender.main.tests.tls_pki import make_ca, make_leaf

_ca = make_ca()
_client = make_leaf(_ca, ['ascender-client'])
_other_client = make_leaf(_ca, ['someone-else'])
CA = _ca.pem
CERTIFICATE = _client.pem
KEY = _client.key_pem


def _settings(protocol='tcp', tls=True, verify=True, ca='', certificate='', key='', host='logs.example.com', enabled=True):
    mock_settings, _ = _mock_logging_defaults()
    setattr(mock_settings, 'LOGGING', getattr(settings, 'LOGGING'))
    setattr(mock_settings, 'LOG_AGGREGATOR_ENABLED', enabled)
    setattr(mock_settings, 'LOG_AGGREGATOR_TYPE', 'other')
    setattr(mock_settings, 'LOG_AGGREGATOR_HOST', host)
    setattr(mock_settings, 'LOG_AGGREGATOR_PORT', 6514)
    setattr(mock_settings, 'LOG_AGGREGATOR_PROTOCOL', protocol)
    setattr(mock_settings, 'LOG_AGGREGATOR_TLS', tls)
    setattr(mock_settings, 'LOG_AGGREGATOR_VERIFY_CERT', verify)
    setattr(mock_settings, 'LOG_AGGREGATOR_TLS_CA_CERTIFICATE', ca)
    setattr(mock_settings, 'LOG_AGGREGATOR_TLS_CLIENT_CERTIFICATE', certificate)
    setattr(mock_settings, 'LOG_AGGREGATOR_TLS_CLIENT_KEY', key)
    return mock_settings


def _action(mock_settings):
    lines = construct_rsyslog_conf_template(mock_settings).split('\n')
    actions = [line for line in lines if line.startswith('action(')]
    assert len(actions) == 1
    return lines, actions[0]


OMFWD_CLIENT = 'StreamDriver.CertFile="/var/lib/ascender/rsyslog/tls/client.pem" StreamDriver.KeyFile="/var/lib/ascender/rsyslog/tls/client.key"'
OMRELP_CLIENT = 'tls.myCert="/var/lib/ascender/rsyslog/tls/client.pem" tls.myPrivKey="/var/lib/ascender/rsyslog/tls/client.key"'
OMRELP_CIPHERS = 'tls.tlscfgcmd="CipherString=PROFILE=SYSTEM:!aNULL:!eNULL"'


@pytest.mark.parametrize(
    'verify, ca, client, expected, not_expected',
    [
        # verification on, system trust store: the certificate must chain to a system CA and name the host
        (
            True,
            False,
            False,
            'StreamDriver="ossl" StreamDriverMode="1" StreamDriver.CAFile="/etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem" '
            'StreamDriverAuthMode="x509/name" StreamDriverPermittedPeers="logs.example.com"',
            ['StreamDriver.CertFile', 'StreamDriverAuthMode="anon"'],
        ),
        # a configured CA replaces the system trust store
        (True, True, False, 'StreamDriver.CAFile="/var/lib/ascender/rsyslog/tls/ca.pem" StreamDriverAuthMode="x509/name"', ['tls-ca-bundle.pem']),
        # verification off: encrypted, but neither the chain nor the name is checked
        (False, False, False, 'StreamDriverAuthMode="anon"', ['x509/name', 'StreamDriverPermittedPeers']),
        # mutual TLS
        (True, False, True, 'StreamDriverPermittedPeers="logs.example.com" ' + OMFWD_CLIENT, []),
    ],
)
def test_omfwd_tls(verify, ca, client, expected, not_expected):
    mock_settings = _settings('tcp', verify=verify, ca=CA if ca else '', certificate=CERTIFICATE if client else '', key=KEY if client else '')
    _, action = _action(mock_settings)
    assert action.startswith('action(type="omfwd" target="logs.example.com" port="6514" protocol="tcp" ')
    assert expected in action
    for text in not_expected:
        assert text not in action
    # TLS sits beside the keepalives and before the queue, and leaves both alone
    assert action.index('KeepAlive="on"') < action.index('StreamDriver="ossl"') < action.index('queue.spoolDirectory=')


@pytest.mark.parametrize(
    'verify, ca, expected, not_expected',
    [
        (
            True,
            False,
            'tls="on" tls.caCert="/etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem" '
            + OMRELP_CIPHERS
            + ' tls.authMode="name" tls.permittedPeer=["logs.example.com"] '
            + OMRELP_CLIENT,
            [],
        ),
        (True, True, 'tls.caCert="/var/lib/ascender/rsyslog/tls/ca.pem"', ['tls-ca-bundle.pem']),
        # verification off drops the name check; librelp still checks the chain against tls.caCert, as it has no
        # option to skip that
        (
            False,
            '',
            'tls="on" tls.caCert="/etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem" ' + OMRELP_CIPHERS + ' ' + OMRELP_CLIENT,
            ['tls.authMode', 'tls.permittedPeer'],
        ),
    ],
)
def test_omrelp_tls(verify, ca, expected, not_expected):
    # validation requires a client certificate for RELP over TLS, so every case here has one
    mock_settings = _settings('relp', verify=verify, ca=CA if ca else '', certificate=CERTIFICATE, key=KEY)
    lines, action = _action(mock_settings)
    assert 'module(load="omrelp" tls.tlslib="openssl")' in lines
    assert 'module(load="omrelp")' not in lines
    assert action.startswith('action(type="omrelp" target="logs.example.com" port="6514" ')
    assert expected in action
    for text in not_expected:
        assert text not in action
    assert action.index('tls="on"') < action.index('queue.spoolDirectory=')


@pytest.mark.parametrize('protocol', ['tcp', 'relp'])
def test_tls_off_leaves_the_action_as_it_was(protocol):
    # the default, and what every installation has today: no TLS parameter at all, whatever else is set
    lines, action = _action(_settings(protocol, tls=False, ca=CA, certificate=CERTIFICATE, key=KEY))
    for text in ('StreamDriver', 'tls="on"', 'tls.', '/rsyslog/tls/'):
        assert text not in action
    assert 'module(load="omrelp" tls.tlslib="openssl")' not in lines


def test_tls_is_ignored_for_udp():
    _, action = _action(_settings('udp', ca=CA, certificate=CERTIFICATE, key=KEY))
    assert 'protocol="udp"' in action
    assert 'StreamDriver' not in action


def test_tls_is_ignored_for_https():
    # HTTPS takes TLS from the URL scheme and LOG_AGGREGATOR_VERIFY_CERT, as before
    _, action = _action(_settings('https', ca=CA, certificate=CERTIFICATE, key=KEY, host='https://logs.example.com'))
    assert 'usehttps="on" allowunsignedcerts="off" skipverifyhost="off"' in action
    assert 'StreamDriver' not in action and 'tls.' not in action


@pytest.mark.parametrize('half', ['certificate', 'key'])
@pytest.mark.parametrize('protocol', ['tcp', 'relp'])
def test_a_client_certificate_needs_both_halves(protocol, half):
    # validation rejects a lone half, and the generator never names a file write_tls_files would not write
    _, action = _action(_settings(protocol, certificate=CERTIFICATE if half == 'certificate' else '', key=KEY if half == 'key' else ''))
    assert 'client.pem' not in action and 'client.key' not in action


def _rsyslogd_check(tmp_path, mock_settings):
    """rsyslogd -N1 on the generated config, with its TLS files written by write_tls_files under tmp_path."""
    if not shutil.which('rsyslogd'):
        pytest.skip('rsyslogd is not installed')
    # omrelp's check opens the files the action names, so they are written first, by the configurer's own writer
    write_tls_files(mock_settings, directory=str(tmp_path / 'tls'))
    conf = construct_rsyslog_conf_template(mock_settings)
    conf = conf.replace(external_logging.TLS_DIRECTORY, str(tmp_path / 'tls')).replace(external_logging.CONF_D_DIRECTORY, str(tmp_path / 'conf.d'))
    conf = conf.replace('workDirectory="/var/lib/ascender/rsyslog"', f'workDirectory="{tmp_path}"')
    conf = conf.replace('queue.spoolDirectory="/var/lib/ascender"', f'queue.spoolDirectory="{tmp_path}"')
    path = tmp_path / 'rsyslog.conf'
    path.write_text(conf + '\n')
    return conf, subprocess.run(['rsyslogd', '-N1', '-f', str(path)], capture_output=True, text=True)


@pytest.mark.parametrize('host', ['logs\\', 'logs"x', 'logs\\"x', '"logs'])
@pytest.mark.parametrize('protocol', ['tcp', 'relp'])
def test_the_target_and_permitted_peer_are_escaped(tmp_path, protocol, host):
    # a backslash or quote in the host can't end the quoted string early; rsyslogd still reads a valid config
    # a CA of its own, so omrelp's check doesn't depend on where this system keeps its trust store
    mock_settings = _settings(protocol, host=host, ca=CA, certificate=CERTIFICATE, key=KEY)
    escaped = host.replace('\\', '\\\\').replace('"', '\\"')
    _, action = _action(mock_settings)
    assert f'target="{escaped}"' in action
    assert (f'StreamDriverPermittedPeers="{escaped}"' if protocol == 'tcp' else f'tls.permittedPeer=["{escaped}"]') in action
    _, result = _rsyslogd_check(tmp_path, mock_settings)
    assert result.returncode == 0, result.stdout + result.stderr


def _modes(directory):
    return {name: stat.S_IMODE(os.stat(directory / name).st_mode) for name in sorted(os.listdir(directory))}


def test_write_tls_files(tmp_path):
    directory = tmp_path / 'tls'
    stale = write_tls_files(_settings('tcp', ca=CA, certificate=CERTIFICATE, key=KEY), directory=str(directory))
    assert stale == []
    assert stat.S_IMODE(os.stat(directory).st_mode) == 0o700
    assert _modes(directory) == {'ca.pem': 0o644, 'client.key': 0o600, 'client.pem': 0o644}
    assert (directory / 'client.key').read_text() == KEY.strip() + '\n'
    assert (directory / 'ca.pem').read_text().strip() == CA.strip()


def test_write_tls_files_writes_standard_pem(tmp_path):
    # validation accepts a certificate as bare base64, as SAML's settings do; rsyslog needs it framed
    directory = tmp_path / 'tls'
    bare = base64.b64encode(_ca.certificate.public_bytes(Encoding.DER)).decode()
    write_tls_files(_settings('tcp', ca=bare), directory=str(directory))
    written = (directory / 'ca.pem').read_text()
    assert written.startswith('-----BEGIN CERTIFICATE-----\n')
    assert x509.load_pem_x509_certificates(written.encode())[0] == _ca.certificate


def test_write_tls_files_keeps_a_chain_in_order(tmp_path):
    directory = tmp_path / 'tls'
    chain = CERTIFICATE + CA
    write_tls_files(_settings('tcp', certificate=chain, key=KEY), directory=str(directory))
    certificates = x509.load_pem_x509_certificates((directory / 'client.pem').read_bytes())
    assert certificates == [_client.certificate, _ca.certificate]


def test_write_tls_files_tightens_an_existing_directory(tmp_path):
    directory = tmp_path / 'tls'
    directory.mkdir(mode=0o755)
    write_tls_files(_settings('relp', certificate=CERTIFICATE, key=KEY), directory=str(directory))
    assert stat.S_IMODE(os.stat(directory).st_mode) == 0o700
    assert _modes(directory) == {'client.key': 0o600, 'client.pem': 0o644}


@pytest.mark.parametrize(
    'change',
    [
        dict(tls=False),  # TLS turned off
        dict(protocol='udp'),  # a protocol TLS does not apply to
        dict(protocol='https'),
        dict(enabled=False),  # external logging turned off
        dict(key=''),  # the key cleared: the certificate alone is not used either
    ],
)
def test_write_tls_files_returns_what_the_config_no_longer_uses(tmp_path, change):
    directory = tmp_path / 'tls'
    write_tls_files(_settings('tcp', ca=CA, certificate=CERTIFICATE, key=KEY), directory=str(directory))
    after = dict(protocol='tcp', ca=CA, certificate=CERTIFICATE, key=KEY)
    after.update(change)
    stale = write_tls_files(_settings(**after), directory=str(directory))
    expected = {'client.key', 'client.pem'} if 'key' in change else {'ca.pem', 'client.key', 'client.pem'}
    assert {os.path.basename(path) for path in stale} == expected
    # still on disk: the caller removes them after rsyslogd has restarted on a config that no longer names them
    assert all(os.path.exists(path) for path in stale)


def test_write_tls_files_leaves_no_temporary_files(tmp_path):
    directory = tmp_path / 'tls'
    other = make_leaf(_ca, ['ascender-client'])
    for client in (_client, other):
        write_tls_files(_settings('tcp', certificate=client.pem, key=client.key_pem), directory=str(directory))
    assert sorted(os.listdir(directory)) == ['client.key', 'client.pem']
    assert (directory / 'client.key').read_text() == other.key_pem.strip() + '\n'


@pytest.mark.skipif(not os.path.isdir('/proc/self/fd'), reason='needs /proc to count open descriptors')
def test_write_tls_files_closes_the_descriptor_when_chmod_fails(tmp_path, monkeypatch):
    directory = tmp_path / 'tls'
    before = len(os.listdir('/proc/self/fd'))

    def refuse(*args):
        raise PermissionError('fchmod refused')

    monkeypatch.setattr(external_logging.os, 'fchmod', refuse)
    with pytest.raises(PermissionError):
        write_tls_files(_settings('tcp', certificate=CERTIFICATE, key=KEY), directory=str(directory))
    monkeypatch.undo()
    assert len(os.listdir('/proc/self/fd')) == before
    assert os.listdir(directory) == []  # the temporary file is gone too


def _reconfigure(monkeypatch, tmp_path, mock_settings, tls_directory=None):
    """Run reconfigure_rsyslog on mock_settings, writing rsyslog.conf (and TLS files) under tmp_path."""
    restarts = []
    tls_directory = tls_directory or tmp_path / 'tls'
    monkeypatch.setattr(external_logging, 'settings', mock_settings)
    monkeypatch.setattr(external_logging, 'TLS_DIRECTORY', str(tls_directory))
    real_write, real_existing = external_logging.write_tls_files, external_logging.existing_tls_files
    monkeypatch.setattr(external_logging, 'existing_tls_files', lambda: real_existing(str(tls_directory)))
    if external_logging.write_tls_files is real_write:
        monkeypatch.setattr(external_logging, 'write_tls_files', lambda settings: real_write(settings, directory=str(tls_directory)))
    _redirect_config(monkeypatch, tmp_path)
    monkeypatch.setattr(external_logging, 'supervisor_service_command', lambda **kwargs: restarts.append(kwargs))
    external_logging.reconfigure_rsyslog()
    return (tmp_path / 'rsyslog.conf').read_text(), restarts


def test_reconfigure_removes_stale_files_after_the_restart(tmp_path, monkeypatch):
    stale = tmp_path / 'client.key'
    stale.write_text(KEY)
    seen = {}
    monkeypatch.setattr(external_logging, 'write_tls_files', lambda settings: [str(stale)])
    monkeypatch.setattr(external_logging, 'construct_rsyslog_conf_template', lambda *args, **kwargs: 'action(type="omfile" file="/dev/null")')
    monkeypatch.setattr(external_logging, 'settings', _settings('tcp', certificate=CERTIFICATE, key=KEY))
    _redirect_config(monkeypatch, tmp_path)
    monkeypatch.setattr(external_logging, 'supervisor_service_command', lambda **kwargs: seen.setdefault('at_restart', stale.exists()))
    external_logging.reconfigure_rsyslog()
    assert seen == {'at_restart': True}
    assert not stale.exists()
    assert (tmp_path / 'rsyslog.conf').read_text() == 'action(type="omfile" file="/dev/null")\n'


@pytest.mark.parametrize('mock_settings', [_settings('tcp', tls=False), _settings('udp'), _settings('tcp', enabled=False)], ids=['tls-off', 'udp', 'disabled'])
def test_reconfigure_without_tls_never_touches_the_tls_directory(tmp_path, monkeypatch, mock_settings):
    # what every installation that doesn't use TLS does: no directory created, the config as before
    def unexpected(settings):
        raise AssertionError('write_tls_files called without TLS in use')

    monkeypatch.setattr(external_logging, 'write_tls_files', unexpected)
    conf, restarts = _reconfigure(monkeypatch, tmp_path, mock_settings)
    assert not (tmp_path / 'tls').exists()
    assert conf == construct_rsyslog_conf_template(mock_settings) + '\n'
    assert external_logging.STOPPED_MARKER not in conf
    assert restarts == [dict(command='restart', service='rsyslogd')]


def test_reconfigure_without_tls_removes_files_an_earlier_config_left(tmp_path, monkeypatch):
    directory = tmp_path / 'tls'
    write_tls_files(_settings('tcp', ca=CA, certificate=CERTIFICATE, key=KEY), directory=str(directory))
    _reconfigure(monkeypatch, tmp_path, _settings('tcp', tls=False))
    assert os.listdir(directory) == []


def test_reconfigure_stops_shipping_when_the_tls_files_cannot_be_written(tmp_path, monkeypatch):
    # run_rsyslog_configurer calls reconfigure_rsyslog at startup: an exception would crash-loop the container,
    # and a config without the TLS material would send in the clear, so it writes a config that ships nothing
    directory = tmp_path / 'tls'
    write_tls_files(_settings('tcp', ca=CA, certificate=CERTIFICATE, key=KEY), directory=str(directory))  # an earlier run's

    def broken(settings):
        raise PermissionError('read-only file system')

    errors = []
    monkeypatch.setattr(external_logging, 'write_tls_files', broken)
    monkeypatch.setattr(external_logging.logger, 'error', lambda message, *args: errors.append(message % args))
    conf, restarts = _reconfigure(monkeypatch, tmp_path, _settings('tcp', certificate=CERTIFICATE, key=KEY))
    assert conf.rstrip().endswith('action(type="omfile" file="/dev/null")')
    assert 'omfwd' not in conf
    assert external_logging.STOPPED_MARKER + ' its TLS files could not be written to' in conf
    assert restarts == [dict(command='restart', service='rsyslogd')]
    assert errors and errors[0].startswith('External logging is stopped: its TLS files could not be written to')
    assert os.listdir(directory) == []  # the earlier run's key is gone too
    assert external_logging.stopped_reason(str(tmp_path / 'rsyslog.conf')).startswith('its TLS files could not be written to')


def test_construct_errors_are_not_swallowed(tmp_path, monkeypatch):
    # only the TLS file writing is guarded; anything else still raises, as it did before
    def broken(*args, **kwargs):
        raise RuntimeError('generator bug')

    monkeypatch.setattr(external_logging, 'construct_rsyslog_conf_template', broken)
    with pytest.raises(RuntimeError):
        _reconfigure(monkeypatch, tmp_path, _settings('tcp', tls=False))


@pytest.mark.parametrize(
    'change, reason',
    [
        (dict(protocol='relp', certificate='', key=''), 'RELP over TLS needs'),  # e.g. saved through /settings/changed/
        (dict(key=_other_client.key_pem), 'does not match'),
        (dict(certificate=CERTIFICATE, key=''), 'must be set together'),
        (dict(host='logs.example.com,evil.example.com'), 'must not contain commas or whitespace'),
    ],
)
def test_the_generator_refuses_unsafe_tls_settings(tmp_path, monkeypatch, change, reason):
    # validation stops these on the logging form; the generator still never writes such an action
    values = dict(protocol='tcp', ca=CA, certificate=CERTIFICATE, key=KEY)
    values.update(change)
    mock_settings = _settings(**values)
    errors = []
    monkeypatch.setattr(external_logging.logger, 'error', lambda message, *args: errors.append(message % args))
    lines, action = _action(mock_settings)
    marker = [line for line in lines if line.startswith(external_logging.STOPPED_MARKER)]
    assert len(marker) == 1 and reason in marker[0]
    assert action == 'action(type="omfile" file="/dev/null")'
    assert errors and reason in errors[0]
    conf, _ = _reconfigure(monkeypatch, tmp_path, mock_settings)
    assert not [name for name in os.listdir(tmp_path / 'tls') if name == 'client.key']  # removed with the rest


def test_stopped_reason(tmp_path):
    path = tmp_path / 'rsyslog.conf'
    path.write_text('global()\n' + external_logging.STOPPED_MARKER + ' because\naction(type="omfile" file="/dev/null")\n')
    assert external_logging.stopped_reason(str(path)) == 'because'
    path.write_text(construct_rsyslog_conf_template(_settings('tcp', tls=False)) + '\n')
    assert external_logging.stopped_reason(str(path)) is None
    assert external_logging.stopped_reason(str(tmp_path / 'missing')) is None


def _redirect_config(monkeypatch, tmp_path):
    move = shutil.move
    monkeypatch.setattr(external_logging.tempfile, 'TemporaryDirectory', lambda **kwargs: _TemporaryDirectory(tmp_path))
    monkeypatch.setattr(external_logging.shutil, 'move', lambda src, dst: move(src, tmp_path / 'rsyslog.conf'))


class _TemporaryDirectory:
    def __init__(self, parent):
        self.path = parent / 'conf-temp'

    def __enter__(self):
        self.path.mkdir()
        return str(self.path)

    def __exit__(self, *exc):
        shutil.rmtree(self.path, ignore_errors=True)


@pytest.mark.parametrize(
    'protocol, verify, client',
    # every combination validation allows: RELP over TLS always has a client certificate
    [('tcp', True, False), ('tcp', False, False), ('tcp', True, True), ('tcp', False, True), ('relp', True, True), ('relp', False, True)],
)
def test_generated_tls_config_passes_rsyslogd_check(tmp_path, protocol, verify, client):
    # the parameter names are checked by rsyslogd itself, as the logging test endpoint does
    mock_settings = _settings(protocol, verify=verify, ca=CA, certificate=CERTIFICATE if client else '', key=KEY if client else '')
    _, result = _rsyslogd_check(tmp_path, mock_settings)
    assert result.returncode == 0, result.stdout + result.stderr


_names = dict(
    exact=make_leaf(_ca, ['receiver.lab.test']),
    wildcard=make_leaf(_ca, ['*.lab.test']),
    upper=make_leaf(_ca, ['Receiver.lab.test']),
    ip_only=make_leaf(_ca, ['10.89.77.10'], common_name='aggregator'),
    ip_only_cn_ip=make_leaf(_ca, ['10.89.77.10']),
)


@pytest.mark.parametrize(
    'certificate, host, tcp, relp',
    # measured against rsyslog 8.2510 (omfwd, ossl) and librelp 1.10 on Rocky Linux 9; see the PR's parity table
    [
        ('exact', 'receiver.lab.test', True, True),
        ('exact', 'other.lab.test', False, False),
        ('wildcard', 'receiver.lab.test', True, False),  # librelp has no wildcard matching on the certificate side
        ('wildcard', 'a.receiver.lab.test', False, False),  # a wildcard covers one label
        ('wildcard', 'lab.test', False, False),
        ('upper', 'receiver.lab.test', True, False),  # X509_check_host ignores case; librelp's strcmp does not
        ('ip_only', '10.89.77.10', True, False),  # omfwd matches an IP subjectAltName; librelp doesn't read them
        ('ip_only_cn_ip', '10.89.77.10', True, True),  # librelp still matches the common name
    ],
)
def test_peer_name_matches(certificate, host, tcp, relp):
    leaf = _names[certificate].certificate
    assert external_logging.peer_name_matches(leaf, host, 'tcp') is tcp
    assert external_logging.peer_name_matches(leaf, host, 'relp') is relp


def test_x509_check_host_rules():
    check = external_logging._x509_check_host
    assert check('*.lab.test', 'RECEIVER.lab.test')
    assert not check('*.test', 'lab.test')  # needs two labels after the wildcard
    assert not check('a.*.test', 'a.lab.test')  # only in the leftmost label
    assert not check('r*r.lab.test', 'rer.lab.test')  # only at the start or end of the label
    assert not check('logs.lab.test', 'logs.lab.test.')  # no trailing-dot folding
    assert check('rec*.lab.test', 'receiver.lab.test') and check('*er.lab.test', 'er.lab.test')  # partial wildcards
    assert not check('*.lab.test', '.lab.test')  # a whole-label wildcard stands for at least one character
    assert not check('*.lab.test', 'a_b.lab.test')  # letters, digits and hyphens only
    assert check('*.lab.test', 'xn--bcher-kva.lab.test') and not check('x*.lab.test', 'xn--bcher-kva.lab.test')
    assert not check('xn--*.lab.test', 'xn--bcher-kva.lab.test')  # never inside an IDNA label


class _SilentListener:
    """Accepts TCP connections and never speaks TLS: an aggregator that has hung."""

    def __init__(self):
        import socket

        self.sock = socket.socket()
        self.sock.bind(('127.0.0.1', 0))
        self.sock.listen(5)
        self.port = self.sock.getsockname()[1]


def test_the_probe_gives_up_at_its_deadline(monkeypatch):
    import tempfile
    import time

    listener = _SilentListener()
    try:
        mock_settings = _settings('tcp', host='127.0.0.1', ca=CA, certificate=CERTIFICATE, key=KEY)
        mock_settings.LOG_AGGREGATOR_PORT = listener.port
        start = time.monotonic()
        error = external_logging.tls_handshake_error(mock_settings, deadline=2)
        assert time.monotonic() - start < 4
        assert error.startswith(f'TLS handshake with 127.0.0.1:{listener.port} failed:')
        # the key's temporary copy was removed as soon as it was loaded
        assert not [name for name in os.listdir(tempfile.gettempdir()) if name.startswith('ascender-logging-tls-')]
    finally:
        listener.sock.close()


def test_the_probe_deadline_covers_the_name_lookup(monkeypatch):
    import socket
    import time

    def slow(*args, **kwargs):
        time.sleep(5)
        raise socket.gaierror('too late')

    monkeypatch.setattr(socket, 'getaddrinfo', slow)
    start = time.monotonic()
    error = external_logging.tls_handshake_error(_settings('tcp', host='slow.example.com', ca=CA), deadline=1)
    assert time.monotonic() - start < 3
    assert 'looking up slow.example.com took longer than 1 seconds' in error


def test_omhttp_credentials_with_a_backslash_are_escaped():
    # escape_quotes now doubles a backslash before escaping a quote (main left it single, so a trailing one escaped
    # the closing quote); the same escaping passes rsyslogd -N1 in test_the_target_and_permitted_peer_are_escaped
    mock_settings = _settings('https', tls=False)
    mock_settings.LOG_AGGREGATOR_USERNAME, mock_settings.LOG_AGGREGATOR_PASSWORD = 'dom\\user', 'p\\"w\\'
    conf = construct_rsyslog_conf_template(mock_settings)
    assert 'uid="dom\\\\user"' in conf and 'pwd="p\\\\\\"w\\\\"' in conf


def test_the_generator_refuses_a_certificate_it_cannot_load():
    # an unknown public key algorithm raises UnsupportedAlgorithm, which must stop shipping, not crash the generator
    der = _client.certificate.public_bytes(Encoding.DER).replace(bytes.fromhex('06072a8648ce3d0201'), bytes.fromhex('06072a8648ce3d0263'))
    certificate = x509.load_der_x509_certificate(der).public_bytes(Encoding.PEM).decode()
    conf = construct_rsyslog_conf_template(_settings('relp', certificate=certificate, key=_client.key_pem))
    assert external_logging.STOPPED_MARKER in conf and 'omrelp' not in conf
