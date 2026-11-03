# ascender.main.utils.reload
from ascender.main.utils import reload


def test_produce_supervisor_command(mocker):
    communicate_mock = mocker.MagicMock(return_value=('Everything is fine', ''))
    mock_process = mocker.MagicMock()
    mock_process.communicate = communicate_mock
    Popen_mock = mocker.MagicMock(return_value=mock_process)
    mocker.patch.object(reload.subprocess, 'Popen', Popen_mock)
    reload.supervisor_service_command("restart")
    reload.subprocess.Popen.assert_called_once_with(
        [
            'supervisorctl',
            'restart',
            'ascender-processes:*',
        ],
        stderr=-1,
        stdin=-1,
        stdout=-1,
    )


def _supervisorctl(mocker, returncode, stderr=''):
    process = mocker.MagicMock(returncode=returncode)
    process.communicate.return_value = ('out', stderr)
    mocker.patch.object(reload.subprocess, 'Popen', mocker.MagicMock(return_value=process))


def test_supervisor_service_command_reports_success(mocker):
    _supervisorctl(mocker, 0)
    assert reload.supervisor_service_command('restart', service='rsyslogd') is True


def test_supervisor_service_command_reports_a_failed_command(mocker):
    _supervisorctl(mocker, 7, 'ERROR (no such process)')
    assert reload.supervisor_service_command('restart', service='rsyslogd') is False
    _supervisorctl(mocker, 0, 'stderr output alone is a failure too')
    assert reload.supervisor_service_command('restart', service='rsyslogd') is False


def test_supervisor_service_command_does_not_know_the_outcome_when_not_waiting(mocker):
    _supervisorctl(mocker, 0)
    assert reload.supervisor_service_command('stop', communicate=False) is None
