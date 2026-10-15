import pytest

from ascender.main.models import ProjectUpdate
from ascender.main.tasks.jobs import RunProjectUpdate


def _update(project, launch_type, status='successful', job_tags='update_git,install_roles,install_collections'):
    return ProjectUpdate.objects.create(project=project, launch_type=launch_type, status=status, job_tags=job_tags)


@pytest.mark.django_db
def test_requirements_generation_is_the_latest_successful_refresh(project):
    assert RunProjectUpdate.current_requirements_generation(project) == 0

    refresh = _update(project, 'manual')
    _update(project, 'dependency')  # reuses, does not refresh
    _update(project, 'scheduled', status='failed')
    _update(project, 'manual', job_tags='update_git')  # no install
    assert RunProjectUpdate.current_requirements_generation(project) == refresh.pk

    scheduled = _update(project, 'scheduled')
    assert RunProjectUpdate.current_requirements_generation(project) == scheduled.pk


@pytest.mark.django_db
def test_requirements_generation_of_an_update(project):
    refresh = _update(project, 'manual')
    running_refresh = _update(project, 'relaunch', status='running')
    dependency = _update(project, 'dependency', status='running')

    # a refresh keys by itself, anything else by the latest successful refresh
    assert RunProjectUpdate.current_requirements_generation(project, running_refresh) == running_refresh.pk
    assert RunProjectUpdate.current_requirements_generation(project, dependency) == refresh.pk
