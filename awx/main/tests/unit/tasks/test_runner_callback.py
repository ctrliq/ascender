from unittest import mock

from awx.main.tasks.callback import RunnerCallback, build_stats_artifacts
from awx.main.constants import ANSIBLE_RUNNER_NEEDS_UPDATE_MESSAGE

from django.test import override_settings
from django.utils.translation import gettext_lazy as _


def test_delay_update(mock_me):
    rc = RunnerCallback()
    rc.delay_update(foo='bar')
    assert rc.extra_update_fields == {'foo': 'bar'}
    rc.delay_update(foo='foobar')
    assert rc.extra_update_fields == {'foo': 'foobar'}
    rc.delay_update(bar='foo')
    assert rc.get_delayed_update_fields() == {'foo': 'foobar', 'bar': 'foo', 'emitted_events': 0}


def test_delay_update_skip_if_set(mock_me):
    rc = RunnerCallback()
    rc.delay_update(foo='bar', skip_if_already_set=True)
    assert rc.extra_update_fields == {'foo': 'bar'}
    rc.delay_update(foo='foobar', skip_if_already_set=True)
    assert rc.extra_update_fields == {'foo': 'bar'}


def test_delay_update_failure_fields(mock_me):
    rc = RunnerCallback()
    rc.delay_update(job_explanation='1')
    rc.delay_update(job_explanation=_('2'))
    assert rc.extra_update_fields == {'job_explanation': '1\n2'}
    rc.delay_update(result_traceback='1')
    rc.delay_update(result_traceback=_('2'))
    rc.delay_update(result_traceback=_('3'), skip_if_already_set=True)
    assert rc.extra_update_fields == {'job_explanation': '1\n2', 'result_traceback': '1\n2'}


def test_duplicate_updates(mock_me):
    rc = RunnerCallback()
    rc.delay_update(job_explanation='really long summary...')
    rc.delay_update(job_explanation='really long summary...')
    rc.delay_update(job_explanation='really long summary...')
    assert rc.extra_update_fields == {'job_explanation': 'really long summary...'}


def test_special_ansible_runner_message(mock_me):
    rc = RunnerCallback()
    rc.delay_update(result_traceback='Traceback:\ngot an unexpected keyword argument\nFile: foo.py')
    rc.delay_update(result_traceback='Traceback:\ngot an unexpected keyword argument\nFile: bar.py')
    assert rc.get_delayed_update_fields().get('result_traceback') == (
        'Traceback:\ngot an unexpected keyword argument\nFile: foo.py\n'
        'Traceback:\ngot an unexpected keyword argument\nFile: bar.py\n'
        f'{ANSIBLE_RUNNER_NEEDS_UPDATE_MESSAGE}'
    )


STATS_EVENT_DATA = {
    'changed': {'h1': 2, 'h3': 0},
    'ok': {'h1': 3, 'h2': 1, 'h3': 2},
    'failures': {'h2': 1},
    'dark': {'h4': 1},
    'processed': {'h1': 1, 'h2': 1, 'h3': 1, 'h4': 1},
    'skipped': {},
}


def _job_callback(extra_vars=None):
    rc = RunnerCallback()
    rc.dispatcher = mock.Mock()
    rc.instance = mock.Mock(
        id=1,
        extra_vars_dict=extra_vars or {},
        log_format='job 1',
        event_class=mock.Mock(JOB_REFERENCE='job_id', WRAPUP_EVENT='playbook_on_stats'),
        spec_set=['id', 'extra_vars_dict', 'log_format', 'event_class'],
    )
    return rc


def test_build_stats_artifacts():
    assert build_stats_artifacts(STATS_EVENT_DATA, 100) == {
        'ascender_stats_changed': True,
        'ascender_stats_failed': True,
        'ascender_stats_hosts_truncated': False,
        'ascender_stats_changed_hosts': ['h1'],
        'ascender_stats_non_changed_hosts': ['h2', 'h3', 'h4'],
        'ascender_stats_failed_hosts': ['h2', 'h4'],
        'ascender_stats_non_failed_hosts': ['h1', 'h3'],
    }


def test_build_stats_artifacts_nothing_changed_or_failed():
    assert build_stats_artifacts({'ok': {'h1': 1}, 'processed': {'h1': 1}}, 100) == {
        'ascender_stats_changed': False,
        'ascender_stats_failed': False,
        'ascender_stats_hosts_truncated': False,
        'ascender_stats_changed_hosts': [],
        'ascender_stats_non_changed_hosts': ['h1'],
        'ascender_stats_failed_hosts': [],
        'ascender_stats_non_failed_hosts': ['h1'],
    }


def test_build_stats_artifacts_truncates_host_lists():
    stats_artifacts = build_stats_artifacts(STATS_EVENT_DATA, 3)
    assert stats_artifacts == {
        'ascender_stats_changed': True,
        'ascender_stats_failed': True,
        'ascender_stats_hosts_truncated': True,
    }


def test_get_stats_artifacts_enabled_by_default(mock_me):
    rc = _job_callback()
    assert rc.get_stats_artifacts(STATS_EVENT_DATA)['ascender_stats_changed'] is True


def test_get_stats_artifacts_disabled_by_extra_var(mock_me):
    for value in (False, 'false', 'no', '0'):
        rc = _job_callback(extra_vars={'ASCENDER_AUTO_STATS_ENABLED': value})
        assert rc.get_stats_artifacts(STATS_EVENT_DATA) == {}


@override_settings(ASCENDER_AUTO_STATS_ENABLED=False)
def test_get_stats_artifacts_disabled_by_setting(mock_me):
    assert _job_callback().get_stats_artifacts(STATS_EVENT_DATA) == {}
    # a per-job extra var re-enables the feature over the global setting
    rc = _job_callback(extra_vars={'ASCENDER_AUTO_STATS_ENABLED': 'true'})
    assert rc.get_stats_artifacts(STATS_EVENT_DATA)['ascender_stats_changed'] is True


def test_get_stats_artifacts_max_hosts_extra_var(mock_me):
    rc = _job_callback(extra_vars={'ASCENDER_AUTO_STATS_MAX_HOSTS': '3'})
    assert rc.get_stats_artifacts(STATS_EVENT_DATA)['ascender_stats_hosts_truncated'] is True
    rc = _job_callback(extra_vars={'ASCENDER_AUTO_STATS_MAX_HOSTS': 'not-a-number'})
    assert rc.get_stats_artifacts(STATS_EVENT_DATA)['ascender_stats_hosts_truncated'] is False


def test_get_stats_artifacts_negative_max_hosts_extra_var(mock_me):
    # the setting is validated with min_value=0 but the extra_vars override is not;
    # a negative value must fall back to the setting instead of truncating everything
    for value in (-1, '-1'):
        rc = _job_callback(extra_vars={'ASCENDER_AUTO_STATS_MAX_HOSTS': value})
        assert rc.get_stats_artifacts(STATS_EVENT_DATA)['ascender_stats_hosts_truncated'] is False


@override_settings(ASCENDER_AUTO_STATS_MAX_HOSTS=0)
def test_get_stats_artifacts_max_hosts_zero_omits_lists(mock_me):
    stats_artifacts = _job_callback().get_stats_artifacts(STATS_EVENT_DATA)
    assert stats_artifacts['ascender_stats_hosts_truncated'] is True
    assert 'ascender_stats_changed_hosts' not in stats_artifacts


def _stats_event(artifact_data=None):
    event_data = dict(STATS_EVENT_DATA)
    if artifact_data is not None:
        event_data['artifact_data'] = artifact_data
    return {'event': 'playbook_on_stats', 'start_line': 0, 'end_line': 0, 'event_data': event_data}


def test_event_handler_merges_stats_artifacts(mock_me):
    rc = _job_callback()
    rc.event_handler(_stats_event(artifact_data={'my_stat': 'foo', 'ascender_stats_changed': 'from_set_stats'}))
    artifacts = rc.extra_update_fields['artifacts']
    # set_stats data provided by the playbook wins over the automatic keys
    assert artifacts['ascender_stats_changed'] == 'from_set_stats'
    assert artifacts['my_stat'] == 'foo'
    assert artifacts['ascender_stats_failed_hosts'] == ['h2', 'h4']


def test_event_handler_stats_artifacts_without_set_stats(mock_me):
    rc = _job_callback()
    rc.event_handler(_stats_event())
    assert rc.extra_update_fields['artifacts']['ascender_stats_changed'] is True


def test_event_handler_no_stats_artifacts_for_non_job(mock_me):
    rc = _job_callback()
    rc.instance.event_class.JOB_REFERENCE = 'ad_hoc_command_id'
    rc.event_handler(_stats_event(artifact_data={'my_stat': 'foo'}))
    assert rc.extra_update_fields['artifacts'] == {'my_stat': 'foo'}


def test_event_handler_disabled_leaves_artifacts_untouched(mock_me):
    rc = _job_callback(extra_vars={'ASCENDER_AUTO_STATS_ENABLED': False})
    rc.event_handler(_stats_event())
    assert 'artifacts' not in rc.extra_update_fields
