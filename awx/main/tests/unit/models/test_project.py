import pytest
import json
from awx.main.models import (
    Project,
    ProjectUpdate,
)
from django.core.exceptions import ValidationError


def test_clean_credential_insights():
    proj = Project(name="myproj", credential=None, scm_type='insights')
    with pytest.raises(ValidationError) as e:
        proj.clean_credential()

    assert json.dumps(str(e.value)) == json.dumps(str([u'Insights Credential is required for an Insights Project.']))


def test_cache_id_prefers_scm_revision():
    proj = Project(name="myproj", scm_type='git', scm_revision='34dbdd6bcbb99ee9ccb90a30ec0d7de17c9d0b3a')
    proj.last_job_id = 42
    assert proj.cache_id == '34dbdd6bcbb99ee9ccb90a30ec0d7de17c9d0b3a'


def test_cache_id_falls_back_to_last_job_id():
    proj = Project(name="myproj", scm_revision='')
    proj.last_job_id = 42
    assert proj.cache_id == '42'


def test_project_update_cache_id_uses_project_cache_for_check_jobs():
    proj = Project(name="myproj", scm_type='git', scm_branch='main', scm_revision='34dbdd6bcbb99ee9ccb90a30ec0d7de17c9d0b3a')
    pu = ProjectUpdate(project=proj, job_type='check', scm_branch='main')
    assert pu.cache_id == proj.cache_id


def test_project_update_cache_id_branch_override_bypasses_cache():
    proj = Project(name="myproj", scm_type='git', scm_branch='main', scm_revision='34dbdd6bcbb99ee9ccb90a30ec0d7de17c9d0b3a')
    pu = ProjectUpdate(project=proj, job_type='run', scm_branch='other-branch')
    pu.id = 7
    assert pu.cache_id == '7'
