import pytest

from awx.main.models.jobs import JobTemplate, Job
from awx.main.models import Inventory, CredentialType, Credential, Project
from awx.main.models.workflow import WorkflowJobTemplate, WorkflowJobTemplateNode, WorkflowJob, WorkflowJobNode, WorkflowApproval, merge_stats_artifacts
from unittest import mock


@pytest.fixture
def credential():
    ssh_type = CredentialType.defaults['ssh']()
    return Credential(id=43, name='example-cred', credential_type=ssh_type, inputs={'username': 'asdf', 'password': 'asdf'})


class TestWorkflowJobInheritNodesMixin:
    class TestCreateWorkflowJobNodes:
        @pytest.fixture
        def job_templates(self):
            return [JobTemplate() for i in range(0, 10)]

        @pytest.fixture
        def job_template_nodes(self, job_templates):
            return [WorkflowJobTemplateNode(unified_job_template=job_templates[i]) for i in range(0, 10)]

        def test__create_workflow_job_nodes(self, mocker, job_template_nodes):
            workflow_job_node_create = mocker.patch('awx.main.models.WorkflowJobTemplateNode.create_workflow_job_node')

            workflow_job = WorkflowJob()
            workflow_job._create_workflow_nodes(job_template_nodes)

            for job_template_node in job_template_nodes:
                workflow_job_node_create.assert_any_call(workflow_job=workflow_job)

    class TestMapWorkflowJobNodes:
        @pytest.fixture
        def job_template_nodes(self):
            return [WorkflowJobTemplateNode(id=i) for i in range(0, 20)]

        @pytest.fixture
        def job_nodes(self):
            return [WorkflowJobNode(id=i) for i in range(100, 120)]

        def test__map_workflow_job_nodes(self, job_template_nodes, job_nodes, mocker):
            mixin = WorkflowJob()
            wj_node = WorkflowJobNode()
            mocker.patch('awx.main.models.workflow.WorkflowJobTemplateNode.create_workflow_job_node', return_value=wj_node)

            node_ids_map = mixin._create_workflow_nodes(job_template_nodes, user=None)
            assert len(node_ids_map) == len(job_template_nodes)

            for i, job_template_node in enumerate(job_template_nodes):
                assert node_ids_map[job_template_node.id] == wj_node

    class TestInheritRelationship:
        @pytest.fixture
        def job_template_nodes(self, mocker):
            nodes = [mocker.MagicMock(id=i, pk=i) for i in range(0, 10)]

            for i in range(0, 9):
                nodes[i].success_nodes = mocker.MagicMock(all=mocker.MagicMock(return_value=[mocker.MagicMock(id=i + 1, pk=i + 1)]))
                nodes[i].always_nodes = mocker.MagicMock(all=mocker.MagicMock(return_value=[]))
                nodes[i].failure_nodes = mocker.MagicMock(all=mocker.MagicMock(return_value=[]))
                nodes[i].condition_links_from = mocker.MagicMock(all=mocker.MagicMock(return_value=[]))
                new_wj_node = mocker.MagicMock(success_nodes=mocker.MagicMock())
                nodes[i].create_workflow_job_node = mocker.MagicMock(return_value=new_wj_node)

            return nodes

        @pytest.fixture
        def job_nodes(self, mocker):
            nodes = [mocker.MagicMock(id=i) for i in range(100, 110)]
            return nodes

        @pytest.fixture
        def job_nodes_dict(self, job_nodes):
            _map = {}
            for n in job_nodes:
                _map[n.id] = n
            return _map

        def test__inherit_relationship(self, mocker, job_template_nodes, job_nodes, job_nodes_dict):
            wj = WorkflowJob()

            node_ids_map = wj._create_workflow_nodes(job_template_nodes)
            wj._inherit_node_relationships(job_template_nodes, node_ids_map)

            for i in range(0, 8):
                node_ids_map[i].success_nodes.add.assert_any_call(node_ids_map[i + 1])


@pytest.fixture
def workflow_job_unit():
    return WorkflowJob(name='workflow', status='new')


@pytest.fixture
def workflow_job_template_unit():
    return WorkflowJobTemplate.objects.create(name='workflow')


@pytest.fixture
def jt_ask(job_template_factory):
    # note: factory sets ask_xxxx_on_launch to true for inventory & credential
    jt = job_template_factory(name='example-jt', persisted=False).job_template
    jt.ask_variables_on_launch = True
    jt.ask_job_type_on_launch = True
    jt.ask_skip_tags_on_launch = True
    jt.ask_limit_on_launch = True
    jt.ask_tags_on_launch = True
    jt.ask_verbosity_on_launch = True
    return jt


@pytest.fixture
def project_unit():
    return Project(name='example-proj')


example_prompts = dict(job_type='check', job_tags='quack', limit='duck', skip_tags='oink')


@pytest.fixture
def job_node_no_prompts(workflow_job_unit, jt_ask):
    return WorkflowJobNode(workflow_job=workflow_job_unit, unified_job_template=jt_ask)


@pytest.fixture
def job_node_with_prompts(job_node_no_prompts, mocker):
    job_node_no_prompts.char_prompts = example_prompts
    job_node_no_prompts.inventory = Inventory(name='example-inv', id=45)
    job_node_no_prompts.inventory_id = 45
    return job_node_no_prompts


@pytest.fixture
def wfjt_node_no_prompts(workflow_job_template_unit, jt_ask):
    node = WorkflowJobTemplateNode(workflow_job_template=workflow_job_template_unit, unified_job_template=jt_ask)
    return node


@pytest.fixture
def wfjt_node_with_prompts(wfjt_node_no_prompts, mocker):
    wfjt_node_no_prompts.char_prompts = example_prompts
    wfjt_node_no_prompts.inventory = Inventory(name='example-inv')
    return wfjt_node_no_prompts


def test_node_getter_and_setters():
    node = WorkflowJobTemplateNode()
    node.job_type = 'check'
    assert node.char_prompts['job_type'] == 'check'
    assert node.job_type == 'check'


class TestNodeMaxRetries:
    def node(self, max_retries=0):
        wfj = WorkflowJob(name='workflow', status='running')
        # a template id must be present for a retry to be spawnable
        return WorkflowJobNode(workflow_job=wfj, max_retries=max_retries, unified_job_template_id=1)

    def test_default_is_no_retries(self):
        assert self.node().max_retries == 0

    def test_retry_pending_for_failed_job_with_retries_left(self):
        node = self.node(max_retries=1)
        node.job = Job(status='failed')
        assert node.retry_pending() is True

    def test_retry_pending_false_when_exhausted(self):
        node = self.node(max_retries=1)
        node.job = Job(status='failed')
        node.retry_attempts = 1
        assert node.retry_pending() is False

    def test_retry_pending_false_without_job_or_on_success(self):
        node = self.node(max_retries=1)
        assert node.retry_pending() is False
        node.job = Job(status='successful')
        assert node.retry_pending() is False

    def test_canceled_job_is_never_retried(self):
        node = self.node(max_retries=1)
        node.job = Job(status='canceled')
        assert node.retry_pending() is False

    def test_approvals_are_never_retried(self):
        node = self.node(max_retries=1)
        node.job = WorkflowApproval(status='failed')
        assert node.retry_pending() is False

    def test_deleted_template_disqualifies_retry(self):
        # a retry can never spawn without a template; treating it as pending
        # would leave the workflow running forever
        node = self.node(max_retries=1)
        node.unified_job_template_id = None
        node.job = Job(status='failed')
        assert node.retry_pending() is False

    def test_job_finished_and_finally_failed_track_retries(self):
        node = self.node(max_retries=1)
        node.job = Job(status='failed')
        assert node.job_finished() is False
        assert node.finally_failed() is False
        node.retry_attempts = 1
        assert node.job_finished() is True
        assert node.finally_failed() is True
        node.job = Job(status='successful')
        assert node.job_finished() is True
        assert node.finally_failed() is False


@pytest.mark.django_db
class TestWorkflowJobCreate:
    def test_create_no_prompts(self, wfjt_node_no_prompts, workflow_job_unit, mocker):
        mock_create = mocker.MagicMock()
        with mocker.patch('awx.main.models.WorkflowJobNode.objects.create', mock_create):
            wfjt_node_no_prompts.create_workflow_job_node(workflow_job=workflow_job_unit)
            mock_create.assert_called_once_with(
                all_parents_must_converge=False,
                max_retries=0,
                extra_data={},
                survey_passwords={},
                char_prompts=wfjt_node_no_prompts.char_prompts,
                inventory=None,
                unified_job_template=wfjt_node_no_prompts.unified_job_template,
                workflow_job=workflow_job_unit,
                identifier=mocker.ANY,
                execution_environment=None,
            )

    def test_create_with_prompts(self, wfjt_node_with_prompts, workflow_job_unit, credential, mocker):
        mock_create = mocker.MagicMock()
        with mocker.patch('awx.main.models.WorkflowJobNode.objects.create', mock_create):
            wfjt_node_with_prompts.create_workflow_job_node(workflow_job=workflow_job_unit)
            mock_create.assert_called_once_with(
                all_parents_must_converge=False,
                max_retries=0,
                extra_data={},
                survey_passwords={},
                char_prompts=wfjt_node_with_prompts.char_prompts,
                inventory=wfjt_node_with_prompts.inventory,
                unified_job_template=wfjt_node_with_prompts.unified_job_template,
                workflow_job=workflow_job_unit,
                identifier=mocker.ANY,
                execution_environment=None,
            )


@pytest.mark.django_db
@mock.patch('awx.main.models.workflow.WorkflowNodeBase.get_parent_nodes', lambda self: [])
class TestWorkflowJobNodeJobKWARGS:
    """
    Tests for building the keyword arguments that go into creating and
    launching a new job that corresponds to a workflow node.
    """

    kwargs_base = {'_eager_fields': {'launch_type': 'workflow'}}

    def test_null_kwargs(self, job_node_no_prompts):
        assert job_node_no_prompts.get_job_kwargs() == self.kwargs_base

    def test_inherit_workflow_job_and_node_extra_vars(self, job_node_no_prompts):
        job_node_no_prompts.extra_data = {"b": 98}
        workflow_job = job_node_no_prompts.workflow_job
        workflow_job.extra_vars = '{"a": 84}'
        assert job_node_no_prompts.get_job_kwargs() == dict(extra_vars={'a': 84, 'b': 98}, **self.kwargs_base)

    def test_char_prompts_and_res_node_prompts(self, job_node_with_prompts):
        # TBD: properly handle multicred credential assignment
        expect_kwargs = dict(inventory=job_node_with_prompts.inventory, **example_prompts)
        expect_kwargs.update(self.kwargs_base)
        assert job_node_with_prompts.get_job_kwargs() == expect_kwargs

    def test_reject_some_node_prompts(self, job_node_with_prompts):
        # TBD: properly handle multicred credential assignment
        job_node_with_prompts.unified_job_template.ask_inventory_on_launch = False
        job_node_with_prompts.unified_job_template.ask_job_type_on_launch = False
        expect_kwargs = dict(inventory=job_node_with_prompts.inventory, **example_prompts)
        expect_kwargs.update(self.kwargs_base)
        expect_kwargs.pop('inventory')
        expect_kwargs.pop('job_type')
        assert job_node_with_prompts.get_job_kwargs() == expect_kwargs

    def test_no_accepted_project_node_prompts(self, job_node_no_prompts, project_unit):
        job_node_no_prompts.unified_job_template = project_unit
        assert job_node_no_prompts.get_job_kwargs() == self.kwargs_base

    def test_extra_vars_node_prompts(self, wfjt_node_no_prompts):
        wfjt_node_no_prompts.extra_vars = {'foo': 'bar'}
        assert wfjt_node_no_prompts.prompts_dict() == {'extra_vars': {'foo': 'bar'}}

    def test_string_extra_vars_node_prompts(self, wfjt_node_no_prompts):
        wfjt_node_no_prompts.extra_vars = '{"foo": "bar"}'
        assert wfjt_node_no_prompts.prompts_dict() == {'extra_vars': {'foo': 'bar'}}


def test_get_ask_mapping_integrity():
    assert list(WorkflowJobTemplate.get_ask_mapping().keys()) == [
        'inventory',
        'limit',
        'scm_branch',
        'labels',
        'job_tags',
        'skip_tags',
        'extra_vars',
    ]


class TestMergeStatsArtifacts:
    """merge_stats_artifacts combines the automatic ascender_stats_* keys across
    sibling jobs (slices, nested workflow nodes, converging parents) instead of
    letting the last finished job overwrite the others."""

    def test_plain_keys_keep_update_semantics(self):
        dest = {'custom': 1, 'other': 'a'}
        merge_stats_artifacts(dest, {'custom': 2})
        assert dest == {'custom': 2, 'other': 'a'}

    def test_booleans_are_ored_across_jobs(self):
        # slice 1 failed a host, slice 2 was clean and finished last
        dest = {'ascender_stats_changed': True, 'ascender_stats_failed': True, 'ascender_stats_hosts_truncated': False}
        merge_stats_artifacts(dest, {'ascender_stats_changed': False, 'ascender_stats_failed': False, 'ascender_stats_hosts_truncated': False})
        assert dest['ascender_stats_changed'] is True
        assert dest['ascender_stats_failed'] is True
        assert dest['ascender_stats_hosts_truncated'] is False

    def test_host_lists_are_unioned(self):
        dest = {
            'ascender_stats_changed_hosts': ['h1'],
            'ascender_stats_non_changed_hosts': ['h2'],
            'ascender_stats_failed_hosts': [],
            'ascender_stats_non_failed_hosts': ['h1', 'h2'],
        }
        src = {
            'ascender_stats_changed_hosts': ['h2', 'h3'],
            'ascender_stats_non_changed_hosts': ['h1'],
            'ascender_stats_failed_hosts': ['h3'],
            'ascender_stats_non_failed_hosts': ['h1', 'h2'],
        }
        merge_stats_artifacts(dest, src)
        # a host that changed (or failed) in any job stays in the positive list
        assert dest['ascender_stats_changed_hosts'] == ['h1', 'h2', 'h3']
        assert dest['ascender_stats_non_changed_hosts'] == []
        assert dest['ascender_stats_failed_hosts'] == ['h3']
        assert dest['ascender_stats_non_failed_hosts'] == ['h1', 'h2']

    def test_truncation_drops_lists(self):
        dest = {
            'ascender_stats_hosts_truncated': False,
            'ascender_stats_changed_hosts': ['h1'],
            'ascender_stats_non_changed_hosts': [],
        }
        merge_stats_artifacts(dest, {'ascender_stats_hosts_truncated': True})
        assert dest['ascender_stats_hosts_truncated'] is True
        assert 'ascender_stats_changed_hosts' not in dest
        assert 'ascender_stats_non_changed_hosts' not in dest

    def test_one_sided_keys_are_preserved(self):
        # a sibling without stats (feature disabled, non-playbook job) must not
        # erase what another sibling reported
        dest = {'ascender_stats_failed': True, 'ascender_stats_failed_hosts': ['h1'], 'ascender_stats_non_failed_hosts': []}
        merge_stats_artifacts(dest, {'some_set_stats_key': 'x'})
        assert dest['ascender_stats_failed'] is True
        assert dest['ascender_stats_failed_hosts'] == ['h1']
        assert dest['some_set_stats_key'] == 'x'
