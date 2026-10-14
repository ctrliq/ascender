import os
import pathlib
import shutil
import subprocess
import types

import pytest

from django.conf import settings

from ascender.main.utils import external_logging
from ascender.main.utils.external_logging import construct_rsyslog_conf_template
from ascender.main.tests.functional.api.test_settings import _mock_logging_defaults

'''
# Example User Data
data_logstash = {
    "LOG_AGGREGATOR_TYPE": "logstash",
    "LOG_AGGREGATOR_HOST": "localhost",
    "LOG_AGGREGATOR_PORT": 8080,
    "LOG_AGGREGATOR_PROTOCOL": "tcp",
    "LOG_AGGREGATOR_USERNAME": "logger",
    "LOG_AGGREGATOR_PASSWORD": "mcstash"
}

data_netcat = {
    "LOG_AGGREGATOR_TYPE": "other",
    "LOG_AGGREGATOR_HOST": "localhost",
    "LOG_AGGREGATOR_PORT": 9000,
    "LOG_AGGREGATOR_PROTOCOL": "udp",
}

data_loggly = {
    "LOG_AGGREGATOR_TYPE": "loggly",
    "LOG_AGGREGATOR_HOST": "http://logs-01.loggly.com/inputs/1fd38090-2af1-4e1e-8d80-492899da0f71/tag/http/",
    "LOG_AGGREGATOR_PORT": 8080,
    "LOG_AGGREGATOR_PROTOCOL": "https"
}
'''


# Test reconfigure logging settings function
# name this whatever you want
@pytest.mark.parametrize(
    'enabled, log_type, host, port, protocol, errorfile, expected_config',
    [
        (
            True,
            'loggly',
            'http://logs-01.loggly.com/inputs/1fd38090-2af1-4e1e-8d80-492899da0f71/tag/http/',
            None,
            'https',
            '/var/log/ascender/rsyslog.err',
            '\n'.join(
                [
                    'template(name="ascender" type="string" string="%rawmsg-after-pri%")\nmodule(load="omhttp")',
                    'action(type="omhttp" server="logs-01.loggly.com" serverport="80" usehttps="off" allowunsignedcerts="off" skipverifyhost="off" action.resumeRetryCount="-1" template="ascender" action.resumeInterval="5" queue.spoolDirectory="/var/lib/ascender" queue.filename="ascender-external-logger-action-queue" queue.maxDiskSpace="1g" queue.maxFileSize="100m" queue.type="LinkedList" queue.saveOnShutdown="on" queue.syncqueuefiles="on" queue.checkpointInterval="1000" queue.size="131072" queue.highwaterMark="98304" queue.discardMark="117964" queue.discardSeverity="5" errorfile="/var/log/ascender/rsyslog.err" restpath="inputs/1fd38090-2af1-4e1e-8d80-492899da0f71/tag/http/")',  # noqa
                ]
            ),
        ),
        (
            True,  # localhost w/ custom UDP port
            'other',
            'localhost',
            9000,
            'udp',
            '',  # empty errorfile
            '\n'.join(
                [
                    'template(name="ascender" type="string" string="%rawmsg-after-pri%")',
                    'action(type="omfwd" target="localhost" port="9000" protocol="udp" action.resumeRetryCount="-1" action.resumeInterval="5" template="ascender" queue.spoolDirectory="/var/lib/ascender" queue.filename="ascender-external-logger-action-queue" queue.maxDiskSpace="1g" queue.maxFileSize="100m" queue.type="LinkedList" queue.saveOnShutdown="on" queue.syncqueuefiles="on" queue.checkpointInterval="1000" queue.size="131072" queue.highwaterMark="98304" queue.discardMark="117964" queue.discardSeverity="5")',  # noqa
                ]
            ),
        ),
        (
            True,  # localhost w/ custom TCP port
            'other',
            'localhost',
            9000,
            'tcp',
            '/var/log/ascender/rsyslog.err',
            '\n'.join(
                [
                    'template(name="ascender" type="string" string="%rawmsg-after-pri%")',
                    'action(type="omfwd" target="localhost" port="9000" protocol="tcp" action.resumeRetryCount="-1" action.resumeInterval="5" template="ascender" KeepAlive="on" KeepAlive.Time="120" KeepAlive.Interval="30" KeepAlive.Probes="3" queue.spoolDirectory="/var/lib/ascender" queue.filename="ascender-external-logger-action-queue" queue.maxDiskSpace="1g" queue.maxFileSize="100m" queue.type="LinkedList" queue.saveOnShutdown="on" queue.syncqueuefiles="on" queue.checkpointInterval="1000" queue.size="131072" queue.highwaterMark="98304" queue.discardMark="117964" queue.discardSeverity="5")',  # noqa
                ]
            ),
        ),
        (
            True,  # localhost w/ RELP, which has no protocol parameter of its own
            'other',
            'localhost',
            20514,
            'relp',
            '',  # empty errorfile
            '\n'.join(
                [
                    'template(name="ascender" type="string" string="%rawmsg-after-pri%")\nmodule(load="omrelp")',
                    'action(type="omrelp" target="localhost" port="20514" action.resumeRetryCount="-1" action.resumeInterval="5" template="ascender" queue.spoolDirectory="/var/lib/ascender" queue.filename="ascender-external-logger-action-queue" queue.maxDiskSpace="1g" queue.maxFileSize="100m" queue.type="LinkedList" queue.saveOnShutdown="on" queue.syncqueuefiles="on" queue.checkpointInterval="1000" queue.size="131072" queue.highwaterMark="98304" queue.discardMark="117964" queue.discardSeverity="5")',  # noqa
                ]
            ),
        ),
        (
            True,  # https, default port 443
            'splunk',
            'https://yoursplunk/services/collector/event',
            None,
            None,
            '/var/log/ascender/rsyslog.err',
            '\n'.join(
                [
                    'template(name="ascender" type="string" string="%rawmsg-after-pri%")\nmodule(load="omhttp")',
                    'action(type="omhttp" server="yoursplunk" serverport="443" usehttps="on" allowunsignedcerts="off" skipverifyhost="off" action.resumeRetryCount="-1" template="ascender" action.resumeInterval="5" queue.spoolDirectory="/var/lib/ascender" queue.filename="ascender-external-logger-action-queue" queue.maxDiskSpace="1g" queue.maxFileSize="100m" queue.type="LinkedList" queue.saveOnShutdown="on" queue.syncqueuefiles="on" queue.checkpointInterval="1000" queue.size="131072" queue.highwaterMark="98304" queue.discardMark="117964" queue.discardSeverity="5" errorfile="/var/log/ascender/rsyslog.err" restpath="services/collector/event")',  # noqa
                ]
            ),
        ),
        (
            True,  # http, default port 80
            'splunk',
            'http://yoursplunk/services/collector/event',
            None,
            None,
            '/var/log/ascender/rsyslog.err',
            '\n'.join(
                [
                    'template(name="ascender" type="string" string="%rawmsg-after-pri%")\nmodule(load="omhttp")',
                    'action(type="omhttp" server="yoursplunk" serverport="80" usehttps="off" allowunsignedcerts="off" skipverifyhost="off" action.resumeRetryCount="-1" template="ascender" action.resumeInterval="5" queue.spoolDirectory="/var/lib/ascender" queue.filename="ascender-external-logger-action-queue" queue.maxDiskSpace="1g" queue.maxFileSize="100m" queue.type="LinkedList" queue.saveOnShutdown="on" queue.syncqueuefiles="on" queue.checkpointInterval="1000" queue.size="131072" queue.highwaterMark="98304" queue.discardMark="117964" queue.discardSeverity="5" errorfile="/var/log/ascender/rsyslog.err" restpath="services/collector/event")',  # noqa
                ]
            ),
        ),
        (
            True,  # https, custom port in URL string
            'splunk',
            'https://yoursplunk:8088/services/collector/event',
            None,
            None,
            '/var/log/ascender/rsyslog.err',
            '\n'.join(
                [
                    'template(name="ascender" type="string" string="%rawmsg-after-pri%")\nmodule(load="omhttp")',
                    'action(type="omhttp" server="yoursplunk" serverport="8088" usehttps="on" allowunsignedcerts="off" skipverifyhost="off" action.resumeRetryCount="-1" template="ascender" action.resumeInterval="5" queue.spoolDirectory="/var/lib/ascender" queue.filename="ascender-external-logger-action-queue" queue.maxDiskSpace="1g" queue.maxFileSize="100m" queue.type="LinkedList" queue.saveOnShutdown="on" queue.syncqueuefiles="on" queue.checkpointInterval="1000" queue.size="131072" queue.highwaterMark="98304" queue.discardMark="117964" queue.discardSeverity="5" errorfile="/var/log/ascender/rsyslog.err" restpath="services/collector/event")',  # noqa
                ]
            ),
        ),
        (
            True,  # https, custom port explicitly specified
            'splunk',
            'https://yoursplunk/services/collector/event',
            8088,
            None,
            '/var/log/ascender/rsyslog.err',
            '\n'.join(
                [
                    'template(name="ascender" type="string" string="%rawmsg-after-pri%")\nmodule(load="omhttp")',
                    'action(type="omhttp" server="yoursplunk" serverport="8088" usehttps="on" allowunsignedcerts="off" skipverifyhost="off" action.resumeRetryCount="-1" template="ascender" action.resumeInterval="5" queue.spoolDirectory="/var/lib/ascender" queue.filename="ascender-external-logger-action-queue" queue.maxDiskSpace="1g" queue.maxFileSize="100m" queue.type="LinkedList" queue.saveOnShutdown="on" queue.syncqueuefiles="on" queue.checkpointInterval="1000" queue.size="131072" queue.highwaterMark="98304" queue.discardMark="117964" queue.discardSeverity="5" errorfile="/var/log/ascender/rsyslog.err" restpath="services/collector/event")',  # noqa
                ]
            ),
        ),
        (
            True,  # no scheme specified in URL, default to https, respect custom port
            'splunk',
            'yoursplunk.org/services/collector/event',
            8088,
            'https',
            '/var/log/ascender/rsyslog.err',
            '\n'.join(
                [
                    'template(name="ascender" type="string" string="%rawmsg-after-pri%")\nmodule(load="omhttp")',
                    'action(type="omhttp" server="yoursplunk.org" serverport="8088" usehttps="on" allowunsignedcerts="off" skipverifyhost="off" action.resumeRetryCount="-1" template="ascender" action.resumeInterval="5" queue.spoolDirectory="/var/lib/ascender" queue.filename="ascender-external-logger-action-queue" queue.maxDiskSpace="1g" queue.maxFileSize="100m" queue.type="LinkedList" queue.saveOnShutdown="on" queue.syncqueuefiles="on" queue.checkpointInterval="1000" queue.size="131072" queue.highwaterMark="98304" queue.discardMark="117964" queue.discardSeverity="5" errorfile="/var/log/ascender/rsyslog.err" restpath="services/collector/event")',  # noqa
                ]
            ),
        ),
        (
            True,  # respect custom http-only port
            'splunk',
            'http://yoursplunk.org/services/collector/event',
            8088,
            None,
            '/var/log/ascender/rsyslog.err',
            '\n'.join(
                [
                    'template(name="ascender" type="string" string="%rawmsg-after-pri%")\nmodule(load="omhttp")',
                    'action(type="omhttp" server="yoursplunk.org" serverport="8088" usehttps="off" allowunsignedcerts="off" skipverifyhost="off" action.resumeRetryCount="-1" template="ascender" action.resumeInterval="5" queue.spoolDirectory="/var/lib/ascender" queue.filename="ascender-external-logger-action-queue" queue.maxDiskSpace="1g" queue.maxFileSize="100m" queue.type="LinkedList" queue.saveOnShutdown="on" queue.syncqueuefiles="on" queue.checkpointInterval="1000" queue.size="131072" queue.highwaterMark="98304" queue.discardMark="117964" queue.discardSeverity="5" errorfile="/var/log/ascender/rsyslog.err" restpath="services/collector/event")',  # noqa
                ]
            ),
        ),
        (
            True,  # valid sumologic config
            'sumologic',
            'https://endpoint5.collection.us2.sumologic.com/receiver/v1/http/ZaVnC4dhaV0qoiETY0MrM3wwLoDgO1jFgjOxE6-39qokkj3LGtOroZ8wNaN2M6DtgYrJZsmSi4-36_Up5TbbN_8hosYonLKHSSOSKY845LuLZBCBwStrHQ==',  # noqa
            None,
            'https',
            '/var/log/ascender/rsyslog.err',
            '\n'.join(
                [
                    'template(name="ascender" type="string" string="%rawmsg-after-pri%")\nmodule(load="omhttp")',
                    'action(type="omhttp" server="endpoint5.collection.us2.sumologic.com" serverport="443" usehttps="on" allowunsignedcerts="off" skipverifyhost="off" action.resumeRetryCount="-1" template="ascender" action.resumeInterval="5" queue.spoolDirectory="/var/lib/ascender" queue.filename="ascender-external-logger-action-queue" queue.maxDiskSpace="1g" queue.maxFileSize="100m" queue.type="LinkedList" queue.saveOnShutdown="on" queue.syncqueuefiles="on" queue.checkpointInterval="1000" queue.size="131072" queue.highwaterMark="98304" queue.discardMark="117964" queue.discardSeverity="5" errorfile="/var/log/ascender/rsyslog.err" restpath="receiver/v1/http/ZaVnC4dhaV0qoiETY0MrM3wwLoDgO1jFgjOxE6-39qokkj3LGtOroZ8wNaN2M6DtgYrJZsmSi4-36_Up5TbbN_8hosYonLKHSSOSKY845LuLZBCBwStrHQ==")',  # noqa
                ]
            ),
        ),
    ],
)
def test_rsyslog_conf_template(enabled, log_type, host, port, protocol, errorfile, expected_config):
    mock_settings, _ = _mock_logging_defaults()

    # Set test settings
    logging_defaults = getattr(settings, 'LOGGING')
    setattr(mock_settings, 'LOGGING', logging_defaults)
    setattr(mock_settings, 'LOGGING["handlers"]["external_logger"]["address"]', '/var/run/ascender-rsyslog/rsyslog.sock')
    setattr(mock_settings, 'LOG_AGGREGATOR_ENABLED', enabled)
    setattr(mock_settings, 'LOG_AGGREGATOR_TYPE', log_type)
    setattr(mock_settings, 'LOG_AGGREGATOR_HOST', host)
    setattr(mock_settings, 'LOG_AGGREGATOR_RSYSLOGD_ERROR_LOG_FILE', errorfile)
    if port:
        setattr(mock_settings, 'LOG_AGGREGATOR_PORT', port)
    if protocol:
        setattr(mock_settings, 'LOG_AGGREGATOR_PROTOCOL', protocol)

    # create rsyslog conf template
    tmpl = construct_rsyslog_conf_template(mock_settings)

    # check validity of created template
    assert expected_config in tmpl


@pytest.mark.parametrize(
    'protocol, keepalive, expected, not_expected',
    [
        # the idle-flow case the keepalives exist for; non-default values, so a misspelled or ignored setting fails
        ('tcp', True, 'KeepAlive="on" KeepAlive.Time="7200" KeepAlive.Interval="75" KeepAlive.Probes="9"', None),
        # opt out and the action is what it was before the setting existed
        ('tcp', False, 'template="ascender" queue.spoolDirectory="/var/lib/ascender"', 'KeepAlive'),
        # UDP has no connection to keep alive, so the parameters are never emitted for it
        ('udp', True, 'template="ascender" queue.spoolDirectory="/var/lib/ascender"', 'KeepAlive'),
    ],
)
def test_rsyslog_conf_tcp_keepalive(protocol, keepalive, expected, not_expected):
    mock_settings, _ = _mock_logging_defaults()

    logging_defaults = getattr(settings, 'LOGGING')
    setattr(mock_settings, 'LOGGING', logging_defaults)
    setattr(mock_settings, 'LOG_AGGREGATOR_ENABLED', True)
    setattr(mock_settings, 'LOG_AGGREGATOR_TYPE', 'other')
    setattr(mock_settings, 'LOG_AGGREGATOR_HOST', 'localhost')
    setattr(mock_settings, 'LOG_AGGREGATOR_PORT', 9000)
    setattr(mock_settings, 'LOG_AGGREGATOR_PROTOCOL', protocol)
    setattr(mock_settings, 'LOG_AGGREGATOR_TCP_KEEPALIVE', keepalive)
    setattr(mock_settings, 'LOG_AGGREGATOR_TCP_KEEPALIVE_TIME', 7200)
    setattr(mock_settings, 'LOG_AGGREGATOR_TCP_KEEPALIVE_INTERVAL', 75)
    setattr(mock_settings, 'LOG_AGGREGATOR_TCP_KEEPALIVE_PROBES', 9)

    tmpl = construct_rsyslog_conf_template(mock_settings)
    assert expected in tmpl
    if not_expected:
        assert not_expected not in tmpl


@pytest.mark.parametrize(
    'discard_severity, expected',
    [
        (None, 'queue.discardSeverity="5"'),  # registered default, unchanged from before the setting existed
        (8, 'queue.discardSeverity="8"'),  # rsyslog's own default: discard nothing
        (0, 'queue.discardSeverity="0"'),  # discard anything, including EMERGENCY
        (3, 'queue.discardSeverity="3"'),  # neither the default nor a bound, so a hardcoded value fails
    ],
)
def test_rsyslog_conf_discard_severity(discard_severity, expected):
    mock_settings, _ = _mock_logging_defaults()

    logging_defaults = getattr(settings, 'LOGGING')
    setattr(mock_settings, 'LOGGING', logging_defaults)
    setattr(mock_settings, 'LOG_AGGREGATOR_ENABLED', True)
    setattr(mock_settings, 'LOG_AGGREGATOR_TYPE', 'other')
    setattr(mock_settings, 'LOG_AGGREGATOR_HOST', 'localhost')
    setattr(mock_settings, 'LOG_AGGREGATOR_PORT', 9000)
    setattr(mock_settings, 'LOG_AGGREGATOR_PROTOCOL', 'tcp')
    if discard_severity is not None:
        setattr(mock_settings, 'LOG_AGGREGATOR_ACTION_QUEUE_DISCARD_SEVERITY', discard_severity)

    tmpl = construct_rsyslog_conf_template(mock_settings)
    assert expected in tmpl


STATS_ENABLED = 'config.enabled=`echo $ASCENDER_QUEUE_STATS`'
STATS_MODULE = 'module(load="impstats" interval="{}" format="json" resetCounters="off" ruleset="ascender_queue_stats" ' + STATS_ENABLED + ')'
STATS_RULESET = 'ruleset(name="ascender_queue_stats" queue.type="Direct" ' + STATS_ENABLED + ') { action(type="omfile" file="/dev/stdout") }'
RUN_RSYSLOGD = pathlib.Path(__file__).parents[5] / 'tools' / 'scripts' / 'run-rsyslogd'


def _rsyslog_conf(enabled, stats_interval):
    mock_settings, _ = _mock_logging_defaults()

    logging_defaults = getattr(settings, 'LOGGING')
    setattr(mock_settings, 'LOGGING', logging_defaults)
    setattr(mock_settings, 'LOG_AGGREGATOR_ENABLED', enabled)
    setattr(mock_settings, 'LOG_AGGREGATOR_TYPE', 'other')
    setattr(mock_settings, 'LOG_AGGREGATOR_HOST', 'localhost')
    setattr(mock_settings, 'LOG_AGGREGATOR_PORT', 9000)
    setattr(mock_settings, 'LOG_AGGREGATOR_PROTOCOL', 'tcp')
    if stats_interval is not None:
        setattr(mock_settings, 'LOG_AGGREGATOR_ACTION_QUEUE_STATS_INTERVAL', stats_interval)

    return construct_rsyslog_conf_template(mock_settings)


def _queue_stats_lines(enabled, stats_interval):
    lines = _rsyslog_conf(enabled, stats_interval).split('\n')
    return [line for line in lines if 'impstats' in line or 'ascender_queue_stats' in line]


@pytest.mark.parametrize(
    'enabled, stats_interval, expected_interval',
    [
        (True, None, None),  # registered default (0): no impstats, configuration unchanged
        (True, 0, None),
        (True, 60, 60),
        (True, 1, 1),
        (True, 2147483647, 2147483647),  # the largest impstats can hold
        (False, 60, None),  # no external action, so no queue to report on
    ],
)
def test_rsyslog_conf_queue_stats(enabled, stats_interval, expected_interval):
    stats = _queue_stats_lines(enabled, stats_interval)
    assert stats == ([] if expected_interval is None else [STATS_MODULE.format(expected_interval), STATS_RULESET])


IMPSTATS_DROP_IN = 'module(load="impstats" interval="5" log.syslog="off" log.file="/tmp/impstats.log")'  # cigamit's, #1098


@pytest.fixture
def rsyslog(tmp_path):
    """The generated config at tmp_path/rsyslog.conf, its drop-ins in tmp_path/conf.d, and run-rsyslogd -N1 on them."""
    if not shutil.which('rsyslogd'):
        pytest.skip('rsyslogd is not installed')
    conf, conf_d = tmp_path / 'rsyslog.conf', tmp_path / 'conf.d'
    conf_d.mkdir()

    def generate(stats_interval=60):
        conf.write_text(_rsyslog_conf(True, stats_interval).replace(external_logging.CONF_D_DIRECTORY, str(conf_d)) + '\n')

    def drop_in(name, body):
        path = conf_d / name
        path.parent.mkdir(exist_ok=True)
        path.write_text(body.replace('{conf_d}', str(conf_d)) + '\n')

    def start():
        env = dict(os.environ, ASCENDER_RSYSLOG_CONF=str(conf))
        return subprocess.run(['bash', str(RUN_RSYSLOGD), '-N1'], env=env, capture_output=True, text=True)

    return types.SimpleNamespace(conf_d=conf_d, generate=generate, drop_in=drop_in, start=start)


@pytest.mark.parametrize(
    'drop_ins',
    [
        {},
        {'impstats.conf': '# ' + IMPSTATS_DROP_IN},
        {'impstats.conf.disabled': IMPSTATS_DROP_IN},  # outside the include's *.conf
        {'other.conf': 'module(load="omprog")'},
    ],
)
def test_run_rsyslogd_keeps_queue_stats_on_without_an_impstats_drop_in(rsyslog, drop_ins):
    rsyslog.generate()
    for name, body in drop_ins.items():
        rsyslog.drop_in(name, body)

    result = rsyslog.start()

    assert result.returncode == 0, result.stdout + result.stderr
    assert 'is ignored' not in result.stdout


@pytest.mark.parametrize(
    'drop_ins',
    [
        {'impstats.conf': IMPSTATS_DROP_IN},
        {'impstats.conf': '$ModLoad impstats'},
        # nested, which only rsyslog's own parser follows
        {'outer.conf': 'include(file="{conf_d}/nested/*.conf")', 'nested/impstats.conf': IMPSTATS_DROP_IN},
    ],
)
def test_run_rsyslogd_defers_to_an_impstats_drop_in(rsyslog, drop_ins):
    # rsyslog refuses a second impstats load, so the drop-in's stands and ours is off for this start.
    rsyslog.generate()
    for name, body in drop_ins.items():
        rsyslog.drop_in(name, body)

    result = rsyslog.start()

    assert result.returncode == 0, result.stdout + result.stderr
    assert 'LOG_AGGREGATOR_ACTION_QUEUE_STATS_INTERVAL is ignored' in result.stdout
    assert "module 'impstats' already in this config" in result.stdout


def test_run_rsyslogd_decides_at_each_start_not_when_the_config_was_generated(rsyslog):
    # #1098 review: a drop-in added or removed after the config was written must not leave the two disagreeing.
    rsyslog.generate()
    rsyslog.drop_in('impstats.conf', IMPSTATS_DROP_IN)
    added = rsyslog.start()
    (rsyslog.conf_d / 'impstats.conf').unlink()
    removed = rsyslog.start()

    assert added.returncode == 0, added.stdout + added.stderr
    assert 'is ignored' in added.stdout
    assert removed.returncode == 0, removed.stdout + removed.stderr
    assert 'is ignored' not in removed.stdout


def test_run_rsyslogd_with_queue_stats_off_leaves_an_impstats_drop_in_alone(rsyslog):
    rsyslog.generate(stats_interval=0)
    rsyslog.drop_in('impstats.conf', IMPSTATS_DROP_IN)

    result = rsyslog.start()

    assert result.returncode == 0, result.stdout + result.stderr
    assert result.stdout == ''


def test_run_rsyslogd_leaves_other_errors_to_rsyslogd(rsyslog):
    # Broken in its own right, the config fails with the statistics off too: they stay on and rsyslogd reports it.
    rsyslog.generate()
    rsyslog.drop_in('broken.conf', 'action(type="omfile"')

    result = rsyslog.start()

    assert result.returncode != 0
    assert 'is ignored' not in result.stdout


def test_rsyslog_conf_relp_uses_the_configured_port_and_timeout():
    mock_settings, _ = _mock_logging_defaults()

    logging_defaults = getattr(settings, 'LOGGING')
    setattr(mock_settings, 'LOGGING', logging_defaults)
    setattr(mock_settings, 'LOG_AGGREGATOR_ENABLED', True)
    setattr(mock_settings, 'LOG_AGGREGATOR_TYPE', 'other')
    setattr(mock_settings, 'LOG_AGGREGATOR_HOST', 'relp.example.com')
    setattr(mock_settings, 'LOG_AGGREGATOR_PORT', 2514)
    setattr(mock_settings, 'LOG_AGGREGATOR_PROTOCOL', 'relp')
    setattr(mock_settings, 'LOG_AGGREGATOR_TCP_TIMEOUT', 11)

    lines = construct_rsyslog_conf_template(mock_settings).split('\n')
    actions = [line for line in lines if line.startswith('action(')]
    assert lines.count('module(load="omrelp")') == 1
    assert len(actions) == 1
    assert lines.index('module(load="omrelp")') < lines.index(actions[0])
    assert actions[0].startswith('action(type="omrelp" target="relp.example.com" port="2514" ')
    assert 'action.resumeInterval="11"' in actions[0]
    assert 'protocol=' not in actions[0]  # omfwd's parameter; omrelp has none


@pytest.mark.parametrize('port', [None, ''])
def test_rsyslog_conf_relp_without_a_port_sends_nowhere(port):
    mock_settings, _ = _mock_logging_defaults()

    setattr(mock_settings, 'LOGGING', getattr(settings, 'LOGGING'))
    setattr(mock_settings, 'LOG_AGGREGATOR_ENABLED', True)
    setattr(mock_settings, 'LOG_AGGREGATOR_TYPE', 'other')
    setattr(mock_settings, 'LOG_AGGREGATOR_HOST', 'relp.example.com')
    setattr(mock_settings, 'LOG_AGGREGATOR_PORT', port)
    setattr(mock_settings, 'LOG_AGGREGATOR_PROTOCOL', 'relp')

    tmpl = construct_rsyslog_conf_template(mock_settings)
    assert 'omrelp' not in tmpl
    assert tmpl.endswith('action(type="omfile" file="/dev/null")')


@pytest.mark.parametrize(
    'protocol, host, expected',
    [
        ('https', 'https://logs.example.com:99999', 'serverport="443"'),  # invalid URL port, then the scheme default
        ('https', 'logs.example.com', 'serverport="443"'),
        ('tcp', 'logs.example.com', 'action(type="omfile" file="/dev/null")'),
        ('relp', 'logs.example.com', 'action(type="omfile" file="/dev/null")'),
    ],
)
def test_rsyslog_conf_port_that_fails_validation_on_read(protocol, host, expected):
    # an out-of-range port stored before the bound existed makes settings raise AttributeError for it
    mock_settings, _ = _mock_logging_defaults()

    setattr(mock_settings, 'LOGGING', getattr(settings, 'LOGGING'))
    setattr(mock_settings, 'LOG_AGGREGATOR_ENABLED', True)
    setattr(mock_settings, 'LOG_AGGREGATOR_TYPE', 'other')
    setattr(mock_settings, 'LOG_AGGREGATOR_HOST', host)
    setattr(mock_settings, 'LOG_AGGREGATOR_PROTOCOL', protocol)
    delattr(mock_settings, 'LOG_AGGREGATOR_PORT')

    assert expected in construct_rsyslog_conf_template(mock_settings)


def test_splunk_auth():
    mock_settings, _ = _mock_logging_defaults()
    # Set test settings
    logging_defaults = getattr(settings, 'LOGGING')
    setattr(mock_settings, 'LOGGING', logging_defaults)
    setattr(mock_settings, 'LOG_AGGREGATOR_ENABLED', True)
    setattr(mock_settings, 'LOG_AGGREGATOR_TYPE', 'splunk')
    setattr(mock_settings, 'LOG_AGGREGATOR_HOST', 'example.org')
    setattr(mock_settings, 'LOG_AGGREGATOR_PASSWORD', 'SECRET-TOKEN')

    tmpl = construct_rsyslog_conf_template(mock_settings)
    assert 'httpheaderkey="Authorization" httpheadervalue="Splunk SECRET-TOKEN"' in tmpl


@pytest.mark.parametrize(
    'enabled, protocol, host, port',
    [
        (False, None, None, None),  # external logging off: the /dev/null action
        (True, 'tcp', 'localhost', 9000),  # omfwd
        (True, 'https', 'logs.example.org', None),  # omhttp
    ],
)
def test_rsyslog_conf_includes_conf_d(enabled, protocol, host, port):
    # The generated file replaces the image's static rsyslog.conf, which includes conf.d/;
    # the drop-ins have to keep being read, ahead of the inputs and the shipping action.
    mock_settings, _ = _mock_logging_defaults()
    setattr(mock_settings, 'LOGGING', getattr(settings, 'LOGGING'))
    setattr(mock_settings, 'LOG_AGGREGATOR_ENABLED', enabled)
    setattr(mock_settings, 'LOG_AGGREGATOR_TYPE', 'other')
    if host:
        setattr(mock_settings, 'LOG_AGGREGATOR_HOST', host)
    if port:
        setattr(mock_settings, 'LOG_AGGREGATOR_PORT', port)
    if protocol:
        setattr(mock_settings, 'LOG_AGGREGATOR_PROTOCOL', protocol)

    lines = construct_rsyslog_conf_template(mock_settings).splitlines()

    include = 'include(file="/var/lib/ascender/rsyslog/conf.d/*.conf" mode="optional")'
    assert include in lines
    assert lines.index(include) == next(i for i, line in enumerate(lines) if line.startswith('global')) + 1
    assert lines.index(include) < lines.index('module(load="imptcp")')
