"""
The rsyslog configuration the platform writes for shipping logs elsewhere.

Worth knowing before anyone moves this onto a Python logging handler, which
the roadmap asks about. What rsyslog is doing here is not formatting, it is
durability: a disk backed queue in queue.spoolDirectory that survives a
restart, fsynced every thousand messages, bounded at a gigabyte and 131,072
messages, with back pressure at 75% and graded discarding at 90% that drops
debug before it drops a warning, and retries that never give up on an
aggregator that is down.

Five settings a user can see are promises about exactly that:
LOG_AGGREGATOR_ACTION_QUEUE_SIZE, LOG_AGGREGATOR_ACTION_MAX_DISK_USAGE_GB,
LOG_AGGREGATOR_MAX_DISK_USAGE_PATH, LOG_AGGREGATOR_ACTION_QUEUE_DISCARD_SEVERITY
and LOG_AGGREGATOR_RSYSLOGD_ERROR_LOG_FILE.
A handler that posts to the aggregator from the web process would have to
provide all of it, or those settings stop meaning anything and logs are lost
quietly on a restart.

Each guarantee is asserted on its own in
ascender/main/tests/unit/utils/test_external_logging_durability.py, so a change
that weakens one says which one.
"""

import glob
import logging
import os
import re
import shutil
import tempfile
import urllib.parse as urlparse

from ascender.settings.typed import settings

from ascender.main.utils.reload import supervisor_service_command
from ascender.main.validators import load_x509_certificates, logging_tls_errors
from ascender.main.dispatch.publish import task

logger = logging.getLogger('ascender.main.utils.external_logging')

# Where the external log queue spools when the setting does not name somewhere
# usable. One definition because it is the same path in two places, and because
# the filesystem rename moved it there in #985.
DEFAULT_SPOOL_DIRECTORY = '/var/lib/ascender'

# The name rsyslog gives the queue files it writes inside the spool directory.
# Unlike the template name a few lines down, this one is a filename on disk, so
# an upgrade does not carry the old queue over: rsyslog reads back the queue
# named here and nothing else. The old name stays defined so the upgrade can
# see what it left behind and say so.
ACTION_QUEUE_FILENAME = 'ascender-external-logger-action-queue'
LEGACY_ACTION_QUEUE_FILENAME = 'awx-external-logger-action-queue'

# Operator drop-ins, read by the generated config as the image's static rsyslog.conf
# reads them. The image creates the directory; optional, so an empty one is fine.
CONF_D_DIRECTORY = '/var/lib/ascender/rsyslog/conf.d'
CONF_D_INCLUDE = f'include(file="{CONF_D_DIRECTORY}/*.conf" mode="optional")'

# TLS material for the TCP and RELP actions. The settings hold PEM text and rsyslog wants files, so the
# configurer writes them beside rsyslog.conf, in a directory only the rsyslog user can enter: the key has
# no passphrase, because rsyslog has no setting for one.
TLS_DIRECTORY = '/var/lib/ascender/rsyslog/tls'
TLS_CA_FILE = f'{TLS_DIRECTORY}/ca.pem'
TLS_CLIENT_CERTIFICATE_FILE = f'{TLS_DIRECTORY}/client.pem'
TLS_CLIENT_KEY_FILE = f'{TLS_DIRECTORY}/client.key'
# The system trust store of the image's base (Rocky Linux 9), the bundle update-ca-trust maintains.
SYSTEM_CA_BUNDLE = '/etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem'
# Starts the comment line a generated config carries when it ships nothing because the TLS settings can't be used
# safely; the logging test endpoint looks for it.
STOPPED_MARKER = '# ascender: external logging stopped:'
RSYSLOG_CONF = '/var/lib/ascender/rsyslog/rsyslog.conf'
# OpenSSL cipher list for omrelp: the system crypto policy (PROFILE=SYSTEM on Rocky), never anonymous or null suites.
TLS_RELP_CIPHERS = 'CipherString=PROFILE=SYSTEM:!aNULL:!eNULL'

# run-rsyslogd sets it at every rsyslogd start: off when a conf.d drop-in already loads impstats,
# which rsyslog refuses to load twice (#1098).
QUEUE_STATS_ENABLED = 'config.enabled=`echo $ASCENDER_QUEUE_STATS`'


def warn_about_abandoned_spool(spool_directory):
    """Log the queue files left under the previous name, if there are any.

    The disk queue only holds records when the in memory queue fills, which
    means the aggregator was unreachable. So these files exist only on an
    upgrade that happened while external logging was already failing, and what
    they hold is records the platform accepted and never delivered. Nothing
    reads them now and nothing deletes them, so the one thing that makes them
    recoverable is knowing they are there.
    """
    leftovers = sorted(glob.glob(os.path.join(spool_directory, f'{LEGACY_ACTION_QUEUE_FILENAME}*')))
    if not leftovers:
        return
    logger.warning(
        'External log records spooled under the previous queue name are still in %s and will not be sent: %s. '
        'The queue is now named %s. Deliver those files or remove them.',
        spool_directory,
        ', '.join(os.path.basename(path) for path in leftovers),
        ACTION_QUEUE_FILENAME,
    )


def tls_in_use(settings=settings):
    """Whether the generated action uses TLS: the setting applies to TCP and RELP; HTTPS takes it from the URL."""
    return bool(
        getattr(settings, 'LOG_AGGREGATOR_ENABLED', False)
        and getattr(settings, 'LOG_AGGREGATOR_TLS', False)
        and getattr(settings, 'LOG_AGGREGATOR_PROTOCOL', '') in ('tcp', 'relp')
    )


def construct_rsyslog_conf_template(settings=settings, tls_error=None):
    """The rsyslog.conf for the external logging settings.

    tls_error, or a problem logging_tls_errors finds in the TLS settings, replaces the shipping action with one that
    ships nothing, under a STOPPED_MARKER comment: a TLS action rsyslog can't run safely is never written.
    """
    tmpl = ''
    parts = []
    enabled = getattr(settings, 'LOG_AGGREGATOR_ENABLED')
    host = getattr(settings, 'LOG_AGGREGATOR_HOST', '')
    port = getattr(settings, 'LOG_AGGREGATOR_PORT', '')
    protocol = getattr(settings, 'LOG_AGGREGATOR_PROTOCOL', '')
    timeout = getattr(settings, 'LOG_AGGREGATOR_TCP_TIMEOUT', 5)
    keepalive = getattr(settings, 'LOG_AGGREGATOR_TCP_KEEPALIVE', True)
    keepalive_time = getattr(settings, 'LOG_AGGREGATOR_TCP_KEEPALIVE_TIME', 120)
    keepalive_interval = getattr(settings, 'LOG_AGGREGATOR_TCP_KEEPALIVE_INTERVAL', 30)
    keepalive_probes = getattr(settings, 'LOG_AGGREGATOR_TCP_KEEPALIVE_PROBES', 3)
    action_queue_size = getattr(settings, 'LOG_AGGREGATOR_ACTION_QUEUE_SIZE', 131072)
    max_disk_space_action_queue = getattr(settings, 'LOG_AGGREGATOR_ACTION_MAX_DISK_USAGE_GB', 1)
    discard_severity = getattr(settings, 'LOG_AGGREGATOR_ACTION_QUEUE_DISCARD_SEVERITY', 5)
    spool_directory = getattr(settings, 'LOG_AGGREGATOR_MAX_DISK_USAGE_PATH', DEFAULT_SPOOL_DIRECTORY).rstrip('/')
    error_log_file = getattr(settings, 'LOG_AGGREGATOR_RSYSLOGD_ERROR_LOG_FILE', '')
    stats_interval = getattr(settings, 'LOG_AGGREGATOR_ACTION_QUEUE_STATS_INTERVAL', 0)
    tls = tls_in_use(settings)
    verify_cert = getattr(settings, 'LOG_AGGREGATOR_VERIFY_CERT', True)
    ca_file = TLS_CA_FILE if getattr(settings, 'LOG_AGGREGATOR_TLS_CA_CERTIFICATE', '') else SYSTEM_CA_BUNDLE
    client_certificate = bool(getattr(settings, 'LOG_AGGREGATOR_TLS_CLIENT_CERTIFICATE', '') and getattr(settings, 'LOG_AGGREGATOR_TLS_CLIENT_KEY', ''))

    # Has to happen before queue.spoolDirectory is written below. The fallback used
    # to sit after it, where it changed a variable nothing read again, so a setting
    # naming a directory rsyslog cannot write produced a config naming that same
    # directory. rsyslog then has nowhere to spool and the disk queue, which is the
    # whole point of these options, stops surviving a restart without saying so.
    #
    # A directory, writable and searchable: rsyslog creates its queue files inside
    # this path, so W_OK alone is not enough. W_OK is true of a plain file, and a
    # directory with the write bit but not the execute bit cannot be entered.
    if not (os.path.isdir(spool_directory) and os.access(spool_directory, os.W_OK | os.X_OK)):
        logger.warning('Cannot spool external logs in %s, using %s instead.', spool_directory, DEFAULT_SPOOL_DIRECTORY)
        spool_directory = DEFAULT_SPOOL_DIRECTORY

    warn_about_abandoned_spool(spool_directory)

    queue_options = [
        f'queue.spoolDirectory="{spool_directory}"',
        f'queue.filename="{ACTION_QUEUE_FILENAME}"',
        f'queue.maxDiskSpace="{max_disk_space_action_queue}g"',  # overall disk space for all queue files
        'queue.maxFileSize="100m"',  # individual file size
        'queue.type="LinkedList"',
        'queue.saveOnShutdown="on"',
        'queue.syncqueuefiles="on"',  # (f)sync when checkpoint occurs
        'queue.checkpointInterval="1000"',  # Update disk queue every 1000 messages
        f'queue.size="{action_queue_size}"',  # max number of messages in queue
        f'queue.highwaterMark="{int(action_queue_size * 0.75)}"',  # 75% of queue.size
        f'queue.discardMark="{int(action_queue_size * 0.9)}"',  # 90% of queue.size
        # Messages whose severity number is >= this value are discarded once queue.discardMark is
        # reached. 5 discards notice, info and debug; 8 is rsyslog's own default and turns that off.
        # A full queue drops any message that waits queue.timeoutEnqueue (2 s) for room, whatever this says.
        f'queue.discardSeverity="{discard_severity}"',
    ]

    # Probes an idle connection rather than discovering it is dead on the next write. Firewalls and
    # load balancers discard idle flows without notifying either end -- an AWS Network Load Balancer
    # does so after 350 seconds -- and the operating system default of two hours is far longer than
    # that, so the first messages sent after a quiet period go into a dead socket and are lost. omfwd
    # applies these only when the transport is TCP.
    keepalive_options = [
        'KeepAlive="on"',
        f'KeepAlive.Time="{keepalive_time}"',
        f'KeepAlive.Interval="{keepalive_interval}"',
        f'KeepAlive.Probes="{keepalive_probes}"',
    ]

    max_bytes = settings.MAX_EVENT_RES_DATA
    if settings.LOG_AGGREGATOR_RSYSLOGD_DEBUG:
        parts.append('$DebugLevel 2')
    parts.extend(
        [
            f'global (maxMessageSize="{max_bytes}" workDirectory="/var/lib/ascender/rsyslog")',
            CONF_D_INCLUDE,
            'module(load="imptcp")',
            'input(type="imptcp" Path="' + settings.LOGGING['handlers']['external_logger']['address'] + '" unlink="on")',
            'template(name="ascender" type="string" string="%rawmsg-after-pri%")',
        ]
    )
    # rsyslog already counts what the action queue discards (discarded.nf, discarded.full);
    # impstats reports it, to rsyslogd's stdout, which is the container log. Its own ruleset
    # keeps the statistics out of the external action, which sits in the default ruleset, and
    # a Direct queue keeps them off the main queue: a full action queue blocks the main queue's
    # worker for queue.timeoutEnqueue per message, which would hold the statistics back exactly
    # when they matter.
    if enabled and stats_interval > 0:
        parts.extend(
            [
                f'module(load="impstats" interval="{stats_interval}" format="json" resetCounters="off" ruleset="ascender_queue_stats" {QUEUE_STATS_ENABLED})',
                f'ruleset(name="ascender_queue_stats" queue.type="Direct" {QUEUE_STATS_ENABLED}) {{ action(type="omfile" file="/dev/stdout") }}',
            ]
        )

    def escape_quotes(x):
        # RainerScript string constants take backslash escapes, so a trailing backslash would otherwise escape the
        # closing quote and let the rest of the value run into the config.
        return x.replace('\\', '\\\\').replace('"', '\\"')

    if not enabled:
        parts.append('action(type="omfile" file="/dev/null")')  # rsyslog needs *at least* one valid action to start
        tmpl = '\n'.join(parts)
        return tmpl

    if tls:
        problems = [tls_error] if tls_error else logging_tls_errors(lambda name: getattr(settings, name, None), check_validity=False)
        if problems:
            reason = ' '.join(' '.join(problems).split())
            logger.error('External logging is stopped: %s', reason)
            parts.extend([f'{STOPPED_MARKER} {reason}', 'action(type="omfile" file="/dev/null")'])
            return '\n'.join(parts)

    if protocol.startswith('http'):
        # urlparse requires '//' to be provided if scheme is not specified
        original_parsed = urlparse.urlsplit(host)
        if (not original_parsed.scheme and not host.startswith('//')) or original_parsed.hostname is None:
            host = 'https://%s' % (host)
        parsed = urlparse.urlsplit(host)

        host = escape_quotes(parsed.hostname)
        try:
            if parsed.port:
                port = parsed.port
        except ValueError:
            # getattr: a port stored before the 1-65535 bound fails validation on read and is then unset
            port = getattr(settings, 'LOG_AGGREGATOR_PORT', '')

        # https://github.com/rsyslog/rsyslog-doc/blob/master/source/configuration/modules/omhttp.rst
        ssl = 'on' if parsed.scheme == 'https' else 'off'
        skip_verify = 'off' if settings.LOG_AGGREGATOR_VERIFY_CERT else 'on'
        allow_unsigned = 'off' if settings.LOG_AGGREGATOR_VERIFY_CERT else 'on'
        if not port:
            port = 443 if parsed.scheme == 'https' else 80

        params = [
            'type="omhttp"',
            f'server="{host}"',
            f'serverport="{port}"',
            f'usehttps="{ssl}"',
            f'allowunsignedcerts="{allow_unsigned}"',
            f'skipverifyhost="{skip_verify}"',
            'action.resumeRetryCount="-1"',
            'template="ascender"',
            f'action.resumeInterval="{timeout}"',
        ] + queue_options
        if error_log_file:
            params.append(f'errorfile="{error_log_file}"')
        if parsed.path:
            path = urlparse.quote(parsed.path[1:], safe='/=')
            if parsed.query:
                path = f'{path}?{urlparse.quote(parsed.query)}'
            params.append(f'restpath="{path}"')
        username = escape_quotes(getattr(settings, 'LOG_AGGREGATOR_USERNAME', ''))
        password = escape_quotes(getattr(settings, 'LOG_AGGREGATOR_PASSWORD', ''))
        if getattr(settings, 'LOG_AGGREGATOR_TYPE', None) == 'splunk':
            # splunk has a weird authorization header <shrug>
            if password:
                # from omhttp docs:
                # https://www.rsyslog.com/doc/v8-stable/configuration/modules/omhttp.html
                # > Currently only a single additional header/key pair is
                # > configurable, further development is needed to support
                # > arbitrary header key/value lists.
                params.append('httpheaderkey="Authorization"')
                params.append(f'httpheadervalue="Splunk {password}"')
        if getattr(settings, 'LOG_AGGREGATOR_TYPE', None) == 'ledger':
            if password:
                params.append('httpheaderkey="Authorization"')
                params.append(f'httpheadervalue="Ledger {password}"')
        elif username:
            params.append(f'uid="{username}"')
            if password:
                # you can only have a basic auth password if there's a username
                params.append(f'pwd="{password}"')
        params = ' '.join(params)
        parts.extend(['module(load="omhttp")', f'action({params})'])
    elif protocol == 'relp' and host and port:
        # RELP acknowledges each message at the application layer and retransmits anything the
        # aggregator did not confirm. omfwd over plain TCP cannot: rsyslog reconnects after a reset
        # but does not resend, so whatever the dead connection had already accepted is lost.
        #
        # Requires the rsyslog-relp package, which supplies omrelp.so.
        params = [
            'type="omrelp"',
            f'target="{escape_quotes(host)}"',
            f'port="{port}"',
            'action.resumeRetryCount="-1"',
            f'action.resumeInterval="{timeout}"',
            'template="ascender"',
        ]
        module = 'module(load="omrelp")'
        if tls:
            # librelp checks tls.permittedPeer only when it presents a client certificate itself, so validation
            # requires one for RELP over TLS. With verification off it still checks the chain: it has no option to
            # skip that. OpenSSL rather than librelp's default GnuTLS, to match omfwd's ossl driver below; with
            # OpenSSL, tls.tlscfgcmd sets the cipher list (tls.prioritystring is GnuTLS only), keeping the
            # system crypto policy and ruling out unauthenticated suites.
            module = 'module(load="omrelp" tls.tlslib="openssl")'
            params += ['tls="on"', f'tls.caCert="{ca_file}"', f'tls.tlscfgcmd="{TLS_RELP_CIPHERS}"']
            if verify_cert:
                params += ['tls.authMode="name"', f'tls.permittedPeer=["{escape_quotes(host)}"]']
            if client_certificate:
                params += [f'tls.myCert="{TLS_CLIENT_CERTIFICATE_FILE}"', f'tls.myPrivKey="{TLS_CLIENT_KEY_FILE}"']
        params = ' '.join(params + queue_options)
        parts.extend([module, f'action({params})'])
    elif protocol and host and port:
        params = [
            'type="omfwd"',
            f'target="{escape_quotes(host)}"',
            f'port="{port}"',
            f'protocol="{protocol}"',
            'action.resumeRetryCount="-1"',
            f'action.resumeInterval="{timeout}"',
            'template="ascender"',
        ]
        if protocol == 'tcp' and keepalive:
            params += keepalive_options
        if tls:
            # Requires the rsyslog-openssl package, which supplies lmnsd_ossl.so. x509/name checks the chain
            # against the CA file and the certificate's names against the permitted peer; anon checks neither.
            params += ['StreamDriver="ossl"', 'StreamDriverMode="1"', f'StreamDriver.CAFile="{ca_file}"']
            if verify_cert:
                params += ['StreamDriverAuthMode="x509/name"', f'StreamDriverPermittedPeers="{escape_quotes(host)}"']
            else:
                params.append('StreamDriverAuthMode="anon"')
            if client_certificate:
                params += [f'StreamDriver.CertFile="{TLS_CLIENT_CERTIFICATE_FILE}"', f'StreamDriver.KeyFile="{TLS_CLIENT_KEY_FILE}"']
        params += queue_options
        params = ' '.join(params)
        parts.append(f'action({params})')

    else:
        parts.append('action(type="omfile" file="/dev/null")')  # rsyslog needs *at least* one valid action to start
    tmpl = '\n'.join(parts)
    return tmpl


def write_tls_files(settings=settings, directory=TLS_DIRECTORY):
    """Write the TLS material the generated config names, and return the files it no longer names.

    Each file is replaced atomically, so rsyslog never reads half of one. The key is written 0600 inside a 0700
    directory. The caller removes the returned files once rsyslogd has restarted on the new config, so the key is
    on disk only while a config uses it, and the running rsyslogd never loses a file it may still open on reconnect.
    """
    enabled = tls_in_use(settings)
    certificate = getattr(settings, 'LOG_AGGREGATOR_TLS_CLIENT_CERTIFICATE', '')
    key = getattr(settings, 'LOG_AGGREGATOR_TLS_CLIENT_KEY', '')
    ca = getattr(settings, 'LOG_AGGREGATOR_TLS_CA_CERTIFICATE', '')
    wanted = {
        # Certificates are re-encoded from the parsed X.509, so rsyslog gets standard PEM whatever framing was saved.
        os.path.basename(TLS_CA_FILE): (normalized_certificates(ca) if enabled and ca else '', 0o644),
        os.path.basename(TLS_CLIENT_CERTIFICATE_FILE): (normalized_certificates(certificate) if enabled and certificate and key else '', 0o644),
        os.path.basename(TLS_CLIENT_KEY_FILE): (key if certificate and key else '', 0o600),
    }
    os.makedirs(directory, mode=0o700, exist_ok=True)
    os.chmod(directory, 0o700)
    stale = []
    for name, (content, mode) in wanted.items():
        path = os.path.join(directory, name)
        if not (enabled and content):
            if os.path.lexists(path):
                stale.append(path)
            continue
        fd, temp = tempfile.mkstemp(dir=directory, prefix=f'.{name}-')
        try:
            with os.fdopen(fd, 'w') as f:  # owns the descriptor from here, so it is closed whatever fails next
                os.fchmod(f.fileno(), mode)
                f.write(content.strip() + '\n')
            os.replace(temp, path)
        except BaseException:
            os.unlink(temp)
            raise
    return stale


def _certificate_names(certificate):
    """The certificate's DNS subjectAltNames, IP subjectAltNames and subject common names."""
    from cryptography import x509
    from cryptography.x509.oid import NameOID

    try:
        alternative_names = certificate.extensions.get_extension_for_class(x509.SubjectAlternativeName).value
        dns, ips = alternative_names.get_values_for_type(x509.DNSName), alternative_names.get_values_for_type(x509.IPAddress)
    except x509.ExtensionNotFound:
        dns, ips = [], []
    return dns, ips, [attribute.value for attribute in certificate.subject.get_attributes_for_oid(NameOID.COMMON_NAME)]


def _x509_check_host(pattern, host):
    """One certificate name against the host, as OpenSSL's X509_check_host does by default: case-insensitive, and a
    wildcard only at the start or end of the leftmost label, with two labels after it."""
    pattern, host = pattern.lower(), host.lower()
    if '*' not in pattern:
        return pattern == host
    labels, host_labels = pattern.split('.'), host.split('.')
    if '*' in '.'.join(labels[1:]) or labels[0].count('*') != 1 or '' in labels or len(labels) < 3 or len(labels) != len(host_labels):
        return False
    prefix, suffix = labels[0].split('*')
    first = host_labels[0]
    if (prefix and suffix) or labels[0].startswith('xn--') or (first.startswith('xn--') and (prefix or suffix)):
        return False  # OpenSSL allows no wildcard mid-label, nor inside IDNA A-labels
    if labels[1:] != host_labels[1:] or len(first) < len(prefix) + len(suffix) or not (first.startswith(prefix) and first.endswith(suffix)):
        return False
    # what the wildcard stands for, as in OpenSSL's wildcard_match: letters, digits and hyphens, at least one of them
    # when the wildcard is the whole label, or a literal '*'
    covered = first[len(prefix) : len(first) - len(suffix)]
    return covered == '*' or re.fullmatch(r'[a-z0-9-]+' if labels[0] == '*' else r'[a-z0-9-]*', covered) is not None


def peer_name_matches(certificate, host, protocol):
    """Whether rsyslog would accept the aggregator's certificate for host.

    tcp (omfwd's ossl driver, as measured against rsyslog 8.2510): DNS subjectAltNames, or the common name when there
    are none, with X509_check_host's case-insensitive wildcard rules; an IP address host also matches an IP
    subjectAltName. relp (librelp 1.10): tls.permittedPeer is compared to each DNS subjectAltName and common name as
    an exact, case-sensitive string, so wildcard and IP-only certificates don't match.
    """
    import ipaddress

    dns, ips, common_names = _certificate_names(certificate)
    if protocol == 'relp':
        return host in dns or host in common_names
    try:
        if ipaddress.ip_address(host) in ips:
            return True
    except ValueError:
        pass
    return any(_x509_check_host(name, host) for name in (dns or common_names))


def tls_handshake_error(settings=settings, deadline=10):
    """Open the TLS session rsyslog would, with the same CA, client certificate and checks. None if it succeeds.

    Like rsyslog it sends no SNI, and it checks the name itself the way the generated action does (peer_name_matches).
    The whole probe, name lookup included, finishes within deadline seconds. The client key is copied to a private
    temporary file only for the moment it takes to load it. The error never includes certificate or key material.
    """
    import concurrent.futures
    import socket
    import ssl
    import time

    from cryptography import x509

    host = getattr(settings, 'LOG_AGGREGATOR_HOST', '')
    port = int(getattr(settings, 'LOG_AGGREGATOR_PORT', 0))
    protocol = getattr(settings, 'LOG_AGGREGATOR_PROTOCOL', '')
    verify = getattr(settings, 'LOG_AGGREGATOR_VERIFY_CERT', True)
    ca = getattr(settings, 'LOG_AGGREGATOR_TLS_CA_CERTIFICATE', '')
    certificate = getattr(settings, 'LOG_AGGREGATOR_TLS_CLIENT_CERTIFICATE', '')
    key = getattr(settings, 'LOG_AGGREGATOR_TLS_CLIENT_KEY', '')
    end = time.monotonic() + deadline

    def remaining():
        left = end - time.monotonic()
        if left <= 0:
            raise TimeoutError(f'no answer within {deadline} seconds')
        return left

    context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    context.check_hostname = False  # the name is checked below, the way rsyslog does
    # omfwd's anon mode checks nothing; librelp always checks the chain
    context.verify_mode = ssl.CERT_REQUIRED if verify or protocol == 'relp' else ssl.CERT_NONE
    try:
        if ca:
            context.load_verify_locations(cadata=normalized_certificates(ca))
        elif os.path.exists(SYSTEM_CA_BUNDLE):
            context.load_verify_locations(cafile=SYSTEM_CA_BUNDLE)
        else:
            context.load_default_certs()
        if certificate and key:
            with tempfile.TemporaryDirectory(prefix='ascender-logging-tls-') as directory:
                os.chmod(directory, 0o700)
                paths = os.path.join(directory, 'client.pem'), os.path.join(directory, 'client.key')
                for path, content in zip(paths, (normalized_certificates(certificate), key.strip() + '\n')):
                    with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'w') as f:
                        f.write(content)
                context.load_cert_chain(*paths)
        # getaddrinfo can't be given a timeout, so it runs in a worker the deadline doesn't wait for
        pool = concurrent.futures.ThreadPoolExecutor(max_workers=1)
        try:
            addresses = pool.submit(socket.getaddrinfo, host, port, type=socket.SOCK_STREAM).result(timeout=remaining())
        except concurrent.futures.TimeoutError:
            raise TimeoutError(f'looking up {host} took longer than {deadline} seconds')
        finally:
            pool.shutdown(wait=False)
        error = None
        for family, kind, proto, _, address in addresses:
            sock = None
            try:  # an address family the host can't use (IPv6 disabled, say) falls through to the next address
                sock = socket.socket(family, kind, proto)
                sock.settimeout(remaining())
                sock.connect(address)
                break
            except OSError as exc:
                if sock is not None:
                    sock.close()
                error = exc
        else:
            raise error or OSError(f'{host} has no address')
        with sock:
            # no SNI (server_hostname=None), as rsyslog sends none
            session = context.wrap_socket(sock, server_hostname=None, do_handshake_on_connect=False)
            with session:
                session.settimeout(remaining())
                session.do_handshake()
                peer = session.getpeercert(binary_form=True)
                # Under TLS 1.3 the server judges the client certificate after the client's side of the handshake
                # is done, so a refusal arrives as an alert on the first read. An aggregator that accepts sends
                # nothing, and the read times out.
                # rsyslog's imtcp, for one, closes the session after its own client-certificate or permitted-peer
                # check; that, or an unclean close (suppress_ragged_eofs makes both read as b''), is a refusal.
                session.settimeout(min(0.5, remaining()))
                try:
                    if session.recv(1) == b'':
                        raise ConnectionError('the aggregator closed the connection right after the handshake')
                except TimeoutError:
                    pass
        if verify and not (peer and peer_name_matches(x509.load_der_x509_certificate(peer), host, protocol)):
            raise ssl.SSLCertVerificationError(f"the aggregator's certificate does not name {host} the way {protocol} checks it")
    except (OSError, ValueError) as exc:  # ssl.SSLError and TimeoutError are OSErrors
        return f'TLS handshake with {host}:{port} failed: {exc}'
    return None


def normalized_certificates(text):
    """PEM text re-encoded from the parsed X.509 certificates, in the order given."""
    from cryptography.hazmat.primitives.serialization import Encoding

    return ''.join(certificate.public_bytes(Encoding.PEM).decode() for certificate in load_x509_certificates(text))


def existing_tls_files(directory=TLS_DIRECTORY):
    """The TLS files currently on disk, without creating the directory: nothing happens when TLS was never used."""
    names = (TLS_CA_FILE, TLS_CLIENT_CERTIFICATE_FILE, TLS_CLIENT_KEY_FILE)
    return [path for path in (os.path.join(directory, os.path.basename(name)) for name in names) if os.path.lexists(path)]


def stopped_reason(path=RSYSLOG_CONF):
    """Why the current rsyslog.conf ships nothing, if the generator stopped external logging; None otherwise."""
    try:
        with open(path) as f:
            for line in f:
                if line.startswith(STOPPED_MARKER):
                    return line[len(STOPPED_MARKER) :].strip()
    except OSError:
        pass
    return None


@task(queue='rsyslog_configurer')
def reconfigure_rsyslog():
    tls_error = None
    if tls_in_use(settings):
        try:
            stale_tls_files = write_tls_files(settings)
        except Exception as exc:
            # run_rsyslog_configurer calls this at startup, so raising would crash-loop the container, and sending
            # without the configured TLS material is not an option: the generator writes a config that ships nothing
            tls_error = f'its TLS files could not be written to {TLS_DIRECTORY}: {type(exc).__name__}: {exc}'
    tmpl = construct_rsyslog_conf_template(settings, tls_error=tls_error)
    if tls_error or not tls_in_use(settings) or STOPPED_MARKER in tmpl:
        # nothing the new config uses: remove whatever an earlier one left, the key included
        stale_tls_files = existing_tls_files()
    # Write config to a temp file then move it to preserve atomicity
    with tempfile.TemporaryDirectory(dir='/var/lib/ascender/rsyslog/', prefix='rsyslog-conf-') as temp_dir:
        path = temp_dir + '/rsyslog.conf.temp'
        with open(path, 'w') as f:
            os.chmod(path, 0o640)
            f.write(tmpl + '\n')
        shutil.move(path, '/var/lib/ascender/rsyslog/rsyslog.conf')
    supervisor_service_command(command='restart', service='rsyslogd')
    for path in stale_tls_files:
        if os.path.lexists(path):
            os.unlink(path)
