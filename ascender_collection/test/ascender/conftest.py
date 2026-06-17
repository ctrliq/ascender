from __future__ import absolute_import, division, print_function

__metaclass__ = type

import io
import os
import json
import datetime
import importlib
from contextlib import redirect_stdout, suppress
from unittest import mock
import logging

from requests.models import Response, PreparedRequest

import pytest


from awx.main.tests.functional.conftest import _request
from awx.main.tests.functional.conftest import credentialtype_scm, credentialtype_ssh  # noqa: F401; pylint: disable=unused-variable
from awx.main.models import (
    Organization,
    Project,
    Inventory,
    JobTemplate,
    Credential,
    CredentialType,
    ExecutionEnvironment,
    UnifiedJob,
    WorkflowJobTemplate,
    NotificationTemplate,
    Schedule,
)

from django.db import transaction


HAS_TOWER_CLI = False
HAS_AWX_KIT = False
logger = logging.getLogger('awx.main.tests')


@pytest.fixture(autouse=True)
def awxkit_path_set(monkeypatch):
    """Monkey patch sys.path, insert awxkit source code so that
    the package does not need to be installed.
    """
    base_folder = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir, os.pardir, os.pardir, 'awxkit'))
    monkeypatch.syspath_prepend(base_folder)


@pytest.fixture(autouse=True)
def import_awxkit():
    global HAS_TOWER_CLI
    global HAS_AWX_KIT
    try:
        import tower_cli  # noqa
        HAS_TOWER_CLI = True
    except ImportError:
        HAS_TOWER_CLI = False

    try:
        import awxkit  # noqa
        HAS_AWX_KIT = True
    except ImportError:
        HAS_AWX_KIT = False


def sanitize_dict(din):
    """Sanitize Django response data to purge it of internal types
    so it may be used to cast a requests response object
    """
    if isinstance(din, (int, str, type(None), bool)):
        return din  # native JSON types, no problem
    elif isinstance(din, datetime.datetime):
        return din.isoformat()
    elif isinstance(din, list):
        for i in range(len(din)):
            din[i] = sanitize_dict(din[i])
        return din
    elif isinstance(din, dict):
        for k in din.copy().keys():
            din[k] = sanitize_dict(din[k])
        return din
    else:
        return str(din)  # translation proxies often not string but stringlike


@pytest.fixture(autouse=True)
def collection_path_set(monkeypatch):
    """Monkey patch sys.path, insert the root of the collection folder
    so that content can be imported without being fully packaged
    """
    base_folder = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir, os.pardir))
    monkeypatch.syspath_prepend(base_folder)


@pytest.fixture
def collection_import():
    """These tests run assuming that the ascender_collection folder is inserted
    into the PATH before-hand by collection_path_set.
    But all imports internally to the collection
    go through this fixture so that can be changed if needed.
    For instance, we could switch to fully-qualified import paths.
    """

    def rf(path):
        return importlib.import_module(path)

    return rf


@pytest.fixture
def run_module(request, collection_import):
    def rf(module_name, module_params, request_user):
        def new_request(self, method, url, **kwargs):
            kwargs_copy = kwargs.copy()
            if 'data' in kwargs:
                if isinstance(kwargs['data'], dict):
                    kwargs_copy['data'] = kwargs['data']
                elif kwargs['data'] is None:
                    pass
                elif isinstance(kwargs['data'], str):
                    kwargs_copy['data'] = json.loads(kwargs['data'])
                else:
                    raise RuntimeError('Expected data to be dict or str, got {0}, data: {1}'.format(type(kwargs['data']), kwargs['data']))
            if 'params' in kwargs and method == 'GET':
                # query params for GET are handled a bit differently by
                # tower-cli and python requests as opposed to REST framework APIRequestFactory
                if not kwargs_copy.get('data'):
                    kwargs_copy['data'] = {}
                if isinstance(kwargs['params'], dict):
                    kwargs_copy['data'].update(kwargs['params'])
                elif isinstance(kwargs['params'], list):
                    for k, v in kwargs['params']:
                        kwargs_copy['data'][k] = v

            # make request
            with transaction.atomic():
                rf = _request(method.lower())
                django_response = rf(url, user=request_user, expect=None, **kwargs_copy)

            # requests library response object is different from the Django response, but they are the same concept
            # this converts the Django response object into a requests response object for consumption
            resp = Response()
            py_data = django_response.data
            sanitize_dict(py_data)
            resp._content = bytes(json.dumps(django_response.data), encoding='utf8')
            resp.status_code = django_response.status_code
            resp.headers = dict(django_response.headers)

            if request.config.getoption('verbose') > 0:
                logger.info('%s %s by %s, code:%s', method, '/api/' + url.split('/api/')[1], request_user.username, resp.status_code)

            resp.request = PreparedRequest()
            resp.request.prepare(method=method, url=url)
            return resp

        def new_open(self, method, url, **kwargs):
            r = new_request(self, method, url, **kwargs)
            m = mock.MagicMock(read=mock.MagicMock(return_value=r._content), status=r.status_code, getheader=mock.MagicMock(side_effect=r.headers.get))
            return m

        stdout_buffer = io.StringIO()
        # Requies specific PYTHONPATH, see docs
        # Note that a proper Ansiballz explosion of the modules will have an import path like:
        # ansible_collections.ctrliq.ascender.plugins.modules.{}
        # We should consider supporting that in the future
        resource_module = collection_import('plugins.modules.{0}'.format(module_name))

        if not isinstance(module_params, dict):
            raise RuntimeError('Module params must be dict, got {0}'.format(type(module_params)))

        # Ansible params can be passed as an invocation argument or over stdin
        # this short circuits within the AnsibleModule interface
        def mock_load_params(self):
            self.params = module_params
            # Normally AnsibleModule._load_params() sets these module globals.
            # We bypass _load_params, so set them ourselves: _PARSED_MODULE_ARGS
            # is read by exit_json/fail_json, and _ANSIBLE_PROFILE selects the
            # module->controller result encoder (ansible-core >= 2.19 picks the
            # "module_<profile>_m2c" serialization profile; without it the name
            # resolves to "module_None_m2c" which does not exist).
            from ansible.module_utils import basic

            # _ansible_inject_invocation makes exit_json/fail_json echo the
            # 'invocation' block (module_args). ansible-core historically always
            # did this; since 2.21 it is opt-in via this flag, and the module
            # result assertions here expect the invocation block to be present.
            basic._PARSED_MODULE_ARGS = dict(module_params, _ansible_inject_invocation=True)
            if getattr(basic, '_ANSIBLE_PROFILE', 'set') is None:
                basic._ANSIBLE_PROFILE = 'legacy'

        if getattr(resource_module, 'ControllerAWXKitModule', None):
            resource_class = resource_module.ControllerAWXKitModule
        elif getattr(resource_module, 'ControllerAPIModule', None):
            resource_class = resource_module.ControllerAPIModule
        else:
            raise RuntimeError("The module has neither a ControllerAWXKitModule or a ControllerAPIModule")

        # The collection-vs-server version compatibility check warns whenever the
        # source _COLLECTION_VERSION placeholder ("0.0.1-devel") does not match the
        # connected server version, which would pollute the warning-count
        # assertions in the module tests. That check has dedicated coverage in
        # test_module_utils.py, so suppress it for the general module invocations.
        if hasattr(resource_class, 'version_checked'):
            version_check_patch = mock.patch.object(resource_class, 'version_checked', True)
        else:
            version_check_patch = suppress()

        with version_check_patch, mock.patch.object(resource_class, '_load_params', new=mock_load_params):
            # Call the test utility (like a mock server) instead of issuing HTTP requests
            with mock.patch('ansible.module_utils.urls.Request.open', new=new_open):
                if HAS_TOWER_CLI:
                    tower_cli_mgr = mock.patch('tower_cli.api.Session.request', new=new_request)
                elif HAS_AWX_KIT:
                    tower_cli_mgr = mock.patch('awxkit.api.client.requests.Session.request', new=new_request)
                else:
                    tower_cli_mgr = suppress()
                with tower_cli_mgr:
                    try:
                        # Ansible modules return data to the mothership over stdout
                        with redirect_stdout(stdout_buffer):
                            resource_module.main()
                    except SystemExit:
                        pass  # A system exit indicates successful execution
                    except Exception:
                        # dump the stdout back to console for debugging
                        print(stdout_buffer.getvalue())
                        raise

        module_stdout = stdout_buffer.getvalue().strip()
        try:
            result = json.loads(module_stdout)
        except Exception as e:
            raise Exception('Module did not write valid JSON, error: {0}, stdout:\n{1}'.format(str(e), module_stdout)) from e
        # A module exception should never be a test expectation
        if 'exception' in result:
            if "ModuleNotFoundError: No module named 'tower_cli'" in result['exception']:
                pytest.skip('The tower-cli library is needed to run this test, module no longer supported.')
            raise Exception('Module encountered error:\n{0}'.format(result['exception']))
        return result

    return rf


@pytest.fixture
def survey_spec():
    return {
        "spec": [{"index": 0, "question_name": "my question?", "default": "mydef", "variable": "myvar", "type": "text", "required": False}],
        "description": "test",
        "name": "test",
    }


@pytest.fixture
def organization():
    return Organization.objects.create(name='Default')


@pytest.fixture
def project(organization):
    return Project.objects.create(
        name="test-proj",
        description="test-proj-desc",
        organization=organization,
        playbook_files=['helloworld.yml'],
        local_path='_92__test_proj',
        scm_revision='1234567890123456789012345678901234567890',
        scm_url='localhost',
        scm_type='git',
    )


@pytest.fixture
def inventory(organization):
    return Inventory.objects.create(name='test-inv', organization=organization)


@pytest.fixture
def job_template(project, inventory):
    return JobTemplate.objects.create(name='test-jt', project=project, inventory=inventory, playbook='helloworld.yml')


@pytest.fixture
def machine_credential(credentialtype_ssh, organization):  # noqa: F811
    return Credential.objects.create(credential_type=credentialtype_ssh, name='machine-cred', inputs={'username': 'test_user', 'password': 'pas4word'})


@pytest.fixture
def vault_credential(organization):
    ct = CredentialType.defaults['vault']()
    ct.save()
    return Credential.objects.create(credential_type=ct, name='vault-cred', inputs={'vault_id': 'foo', 'vault_password': 'pas4word'})


@pytest.fixture
def kube_credential():
    ct = CredentialType.defaults['kubernetes_bearer_token']()
    ct.save()
    return Credential.objects.create(credential_type=ct, name='kube-cred', inputs={'host': 'my.cluster', 'bearer_token': 'my-token', 'verify_ssl': False})


@pytest.fixture
def silence_deprecation():
    """The deprecation warnings are stored in a global variable
    they will create cross-test interference. Use this to turn them off.
    """
    with mock.patch('ansible.module_utils.basic.AnsibleModule.deprecate') as this_mock:
        yield this_mock


@pytest.fixture(autouse=True)
def silence_warning():
    """Warnings use global variable, same as deprecations."""
    with mock.patch('ansible.module_utils.basic.AnsibleModule.warn') as this_mock:
        yield this_mock


@pytest.fixture
def execution_environment():
    return ExecutionEnvironment.objects.create(name="test-ee", description="test-ee", managed=False)


@pytest.fixture(scope='session', autouse=True)
def mock_has_unpartitioned_events():
    # has_unpartitioned_events determines if there are any events still
    # left in the old, unpartitioned job events table. In order to work,
    # this method looks up when the partition migration occurred. When
    # Django's unit tests run, however, there will be no record of the migration.
    # We mock this out to circumvent the migration query.
    with mock.patch.object(UnifiedJob, 'has_unpartitioned_events', new=False) as _fixture:
        yield _fixture


@pytest.fixture
def workflow_job_template(organization, inventory):
    return WorkflowJobTemplate.objects.create(name='test-workflow_job_template', organization=organization, inventory=inventory)


@pytest.fixture
def notification_template(organization):
    return NotificationTemplate.objects.create(
        name='test-notification_template',
        organization=organization,
        notification_type="webhook",
        notification_configuration=dict(
            url="http://localhost",
            username="",
            password="",
            headers={
                "Test": "Header",
            },
        ),
    )


@pytest.fixture
def scm_credential(credentialtype_scm, organization):  # noqa: F811
    return Credential.objects.create(
        credential_type=credentialtype_scm, name='scm-cred', inputs={'username': 'optimus', 'password': 'prime'}, organization=organization
    )


@pytest.fixture
def rrule():
    return 'DTSTART:20151117T050000Z RRULE:FREQ=DAILY;INTERVAL=1;COUNT=1'


@pytest.fixture
def schedule(job_template, rrule):
    return Schedule.objects.create(unified_job_template=job_template, name='test-sched', rrule=rrule)
