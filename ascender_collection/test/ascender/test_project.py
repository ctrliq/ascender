from __future__ import absolute_import, division, print_function

__metaclass__ = type

import pytest

from awx.main.models import Project


@pytest.mark.django_db
def test_create_project(run_module, admin_user, organization, silence_warning):
    result = run_module(
        'project',
        dict(name='foo', organization=organization.name, scm_type='git', scm_url='https://foo.invalid', wait=False, scm_update_cache_timeout=5),
        admin_user,
    )
    silence_warning.assert_called_once_with('scm_update_cache_timeout will be ignored since scm_update_on_launch was not set to true')

    assert result.pop('changed', None), result

    proj = Project.objects.get(name='foo')
    assert proj.scm_url == 'https://foo.invalid'
    assert proj.organization == organization

    result.pop('invocation')
    assert result == {'name': 'foo', 'id': proj.id}


@pytest.mark.django_db
def test_create_manual_project(run_module, admin_user, organization, mocker):
    mocker.patch('awx.main.models.projects.Project.get_local_path_choices', return_value=['foo_folder/'])
    result = run_module(
        'project',
        dict(name='foo', organization=organization.name, scm_type='manual', local_path='foo_folder/', wait=False),
        admin_user,
    )
    assert result.pop('changed', None), result

    proj = Project.objects.get(name='foo')
    assert proj.local_path == 'foo_folder/'
    assert proj.organization == organization

    result.pop('invocation')
    assert result == {'name': 'foo', 'id': proj.id}


@pytest.mark.django_db
def test_create_project_copy_from(run_module, admin_user, organization, silence_warning):
    '''Test the copy_from functionality'''
    result = run_module(
        'project',
        dict(name='foo', organization=organization.name, scm_type='git', scm_url='https://foo.invalid', wait=False, scm_update_cache_timeout=5),
        admin_user,
    )
    assert result.pop('changed', None), result
    proj_name = 'bar'
    result = run_module(
        'project',
        dict(name=proj_name, copy_from='foo', scm_type='git', wait=False),
        admin_user,
    )
    assert result.pop('changed', None), result
    result = run_module(
        'project',
        dict(name=proj_name, copy_from='foo', scm_type='git', wait=False),
        admin_user,
    )
    silence_warning.assert_called_with("A project with the name {0} already exists.".format(proj_name))


def test_existing_update_is_waited_on_with_interval(collection_import, mocker):
    """A project that already has an update in progress (e.g. the automatic
    update on create) must be waited on through wait_on_url so that interval and
    timeout are honored, instead of polling the update endpoint in a tight loop
    with no delay. Regression test for the busy-poll in ansible/awx#12850.
    """
    project = collection_import('plugins.modules.project')

    module = mocker.Mock()
    module.params = {'update_project': False, 'wait': True, 'timeout': 30, 'interval': 5}
    module.json_output = {}
    module.get_item_name.return_value = 'foo'
    module.wait_on_url.return_value = {'json': {'scm_revision': 'newrev'}}

    last_request = {'scm_revision': 'oldrev', 'summary_fields': {'current_update': {'id': 42}}}

    project.wait_for_project_update(module, last_request)

    module.wait_on_url.assert_called_once_with(
        url='/project_updates/42/',
        object_name='foo',
        object_type='Project Update',
        timeout=30,
        interval=5,
    )
    # The fix must not fall back to busy-polling the update endpoint
    module.get_endpoint.assert_not_called()
    # The SCM revision moved, so the task is reported as changed
    assert module.json_output['changed'] is True


def test_existing_update_unchanged_revision_is_not_changed(collection_import, mocker):
    """If the in-progress update does not move the SCM revision, report not changed."""
    project = collection_import('plugins.modules.project')

    module = mocker.Mock()
    module.params = {'update_project': False, 'wait': True, 'timeout': 30, 'interval': 2}
    module.json_output = {}
    module.get_item_name.return_value = 'foo'
    module.wait_on_url.return_value = {'json': {'scm_revision': 'samerev'}}

    last_request = {'scm_revision': 'samerev', 'summary_fields': {'current_update': {'id': 7}}}

    project.wait_for_project_update(module, last_request)

    assert module.json_output['changed'] is False


def test_existing_update_not_waited_on_when_wait_false(collection_import, mocker):
    """With wait=False the module must not block on an in-progress update."""
    project = collection_import('plugins.modules.project')

    module = mocker.Mock()
    module.params = {'update_project': False, 'wait': False, 'timeout': 30, 'interval': 2}
    module.json_output = {}

    last_request = {'scm_revision': 'oldrev', 'summary_fields': {'current_update': {'id': 1}}}

    project.wait_for_project_update(module, last_request)

    module.wait_on_url.assert_not_called()
    module.get_endpoint.assert_not_called()
