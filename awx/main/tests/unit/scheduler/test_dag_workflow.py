import pytest
import uuid
import os

from django.utils.translation import gettext_lazy as _
from django.utils.encoding import smart_str

from awx.main.scheduler.dag_workflow import WorkflowDAG
from awx.main.models.workflow import evaluate_artifact_condition


class Job:
    def __init__(self, status='successful'):
        self.status = status


class JobWithArtifacts(Job):
    def __init__(self, status='successful', artifacts=None):
        super(JobWithArtifacts, self).__init__(status=status)
        self.artifacts = artifacts or {}

    def get_effective_artifacts(self, **kwargs):
        return dict(self.artifacts)


class WorkflowNode(object):
    def __init__(self, id=None, job=None, do_not_run=False, unified_job_template=None, prior_run_succeeded=False, max_retries=0, retry_attempts=0):
        self.id = id if id is not None else uuid.uuid4()
        self.job = job
        self.do_not_run = do_not_run
        self.prior_run_succeeded = prior_run_succeeded
        self.unified_job_template = unified_job_template
        self.all_parents_must_converge = False
        self.max_retries = max_retries
        self.retry_attempts = retry_attempts

    # the three methods below mirror WorkflowJobNode
    def retry_pending(self):
        return bool(self.job and self.job.status in ('failed', 'error') and self.unified_job_template is not None and self.retry_attempts < self.max_retries)

    def job_finished(self):
        return bool(self.job and self.job.status in ('successful', 'failed', 'error', 'canceled') and not self.retry_pending())

    def finally_failed(self):
        return bool(self.job and self.job.status in ('failed', 'error', 'canceled') and not self.retry_pending())


@pytest.fixture
def wf_node_generator(mocker):
    pytest.count = 0

    def fn(**kwargs):
        wfn = WorkflowNode(id=pytest.count, unified_job_template=object(), **kwargs)
        pytest.count += 1
        return wfn

    return fn


@pytest.fixture
def workflow_dag_1(wf_node_generator):
    g = WorkflowDAG()
    nodes = [wf_node_generator() for i in range(4)]
    for n in nodes:
        g.add_node(n)

    r'''
            0
           /\
        S /  \
         /    \
         1    |
         |    |
       F |    | S
         |    |
         3    |
          \   |
         F \  |
            \/
             2
    '''
    g.add_edge(nodes[0], nodes[1], "success_nodes")
    g.add_edge(nodes[0], nodes[2], "success_nodes")
    g.add_edge(nodes[1], nodes[3], "failure_nodes")
    g.add_edge(nodes[3], nodes[2], "failure_nodes")
    return (g, nodes)


class TestWorkflowDAG:
    @pytest.fixture
    def workflow_dag_root_children(self, wf_node_generator):
        g = WorkflowDAG()
        wf_root_nodes = [wf_node_generator() for i in range(0, 10)]
        wf_leaf_nodes = [wf_node_generator() for i in range(0, 10)]

        for n in wf_root_nodes + wf_leaf_nodes:
            g.add_node(n)

        '''
        Pair up a root node with a single child via an edge

        R1  R2 ... Rx
        |   |      |
        |   |      |
        C1  C2     Cx
        '''
        for i, n in enumerate(wf_leaf_nodes):
            g.add_edge(wf_root_nodes[i], n, 'label')
        return (g, wf_root_nodes, wf_leaf_nodes)

    def test_get_root_nodes(self, workflow_dag_root_children):
        g, wf_root_nodes, ignore = workflow_dag_root_children
        assert set([n.id for n in wf_root_nodes]) == set([n['node_object'].id for n in g.get_root_nodes()])


class TestDNR:
    def test_mark_dnr_nodes(self, workflow_dag_1):
        g, nodes = workflow_dag_1

        r'''
                0
               /\
            S /  \
             /    \
             1    |
             |    |
           F |    | S
             |    |
             3    |
              \   |
             F \  |
                \/
                2
        '''
        nodes[0].job = Job(status='successful')
        do_not_run_nodes = g.mark_dnr_nodes()
        assert 0 == len(do_not_run_nodes)

        r'''
                0
               /\
            S /  \
             /    \
            S1    |
             |    |
           F |    | S
             |    |
         DNR 3    |
              \   |
             F \  |
                \/
                2
        '''
        nodes[1].job = Job(status='successful')
        do_not_run_nodes = g.mark_dnr_nodes()
        assert 1 == len(do_not_run_nodes)
        assert nodes[3] == do_not_run_nodes[0]


class TestAllWorkflowNodes:
    # test workflow convergence is functioning as expected
    @pytest.fixture
    def simple_all_convergence(self, wf_node_generator):
        g = WorkflowDAG()
        nodes = [wf_node_generator() for i in range(4)]
        for n in nodes:
            g.add_node(n)

            r'''
                0
               /\
            S /  \ S
             /    \
            1      2
             \    /
            F \  / S
               \/
                3

            '''
        g.add_edge(nodes[0], nodes[1], "success_nodes")
        g.add_edge(nodes[0], nodes[2], "success_nodes")
        g.add_edge(nodes[1], nodes[3], "failure_nodes")
        g.add_edge(nodes[2], nodes[3], "success_nodes")
        nodes[3].all_parents_must_converge = True
        nodes[0].job = Job(status='successful')
        nodes[1].job = Job(status='failed')
        nodes[2].job = Job(status='successful')
        return (g, nodes)

    def test_simple_all_convergence(self, simple_all_convergence):
        g, nodes = simple_all_convergence
        dnr_nodes = g.mark_dnr_nodes()
        assert 0 == len(dnr_nodes), "no nodes should be marked DNR"

        nodes_to_run = g.bfs_nodes_to_run()
        assert 1 == len(nodes_to_run), "Node 3, and only node 3, should be chosen to run"
        assert nodes[3] == nodes_to_run[0], "Only node 3 should be chosen to run"

    @pytest.fixture
    def workflow_all_converge_1(self, wf_node_generator):
        g = WorkflowDAG()
        nodes = [wf_node_generator() for i in range(3)]
        for n in nodes:
            g.add_node(n)
        r'''
               0
               |\ F
               | \
              S|  1
               | /
               |/ A
               2
        '''
        g.add_edge(nodes[0], nodes[1], "failure_nodes")
        g.add_edge(nodes[0], nodes[2], "success_nodes")
        g.add_edge(nodes[1], nodes[2], "always_nodes")
        nodes[2].all_parents_must_converge = True
        nodes[0].job = Job(status='successful')
        return (g, nodes)

    def test_all_converge_edge_case_1(self, workflow_all_converge_1):
        g, nodes = workflow_all_converge_1
        dnr_nodes = g.mark_dnr_nodes()
        assert 2 == len(dnr_nodes), "node[1] and node[2] should be marked DNR"
        assert nodes[1] == dnr_nodes[0], "Node 1 should be marked DNR"
        assert nodes[2] == dnr_nodes[1], "Node 2 should be marked DNR"

        nodes_to_run = g.bfs_nodes_to_run()
        assert 0 == len(nodes_to_run), "No nodes should be chosen to run"

    @pytest.fixture
    def workflow_all_converge_2(self, wf_node_generator):
        """The ordering of _1 and this test, _2, is _slightly_ different.
        The hope is that topological sorting results in 2 being processed before 3
        and/or 3 before 2.
        """
        g = WorkflowDAG()
        nodes = [wf_node_generator() for i in range(3)]
        for n in nodes:
            g.add_node(n)
        r'''
               0
               |\ S
               | \
              F|  1
               | /
               |/ A
               2
        '''
        g.add_edge(nodes[0], nodes[1], "success_nodes")
        g.add_edge(nodes[0], nodes[2], "failure_nodes")
        g.add_edge(nodes[1], nodes[2], "always_nodes")
        nodes[2].all_parents_must_converge = True
        nodes[0].job = Job(status='successful')
        return (g, nodes)

    def test_all_converge_edge_case_2(self, workflow_all_converge_2):
        g, nodes = workflow_all_converge_2
        dnr_nodes = g.mark_dnr_nodes()
        assert 1 == len(dnr_nodes), "1 and only 1 node should be marked DNR"
        assert nodes[2] == dnr_nodes[0], "Node 3 should be marked DNR"

        nodes_to_run = g.bfs_nodes_to_run()
        assert 1 == len(nodes_to_run), "Node 2, and only node 2, should be chosen to run"
        assert nodes[1] == nodes_to_run[0], "Only node 2 should be chosen to run"

    @pytest.fixture
    def workflow_all_converge_will_run(self, wf_node_generator):
        g = WorkflowDAG()
        nodes = [wf_node_generator() for i in range(4)]
        for n in nodes:
            g.add_node(n)
        r'''
               0    1    2
              S \ F |   / S
                 \  |  /
                  \ | /
                   \|/
                    |
                    3
        '''
        g.add_edge(nodes[0], nodes[3], "success_nodes")
        g.add_edge(nodes[1], nodes[3], "failure_nodes")
        g.add_edge(nodes[2], nodes[3], "success_nodes")
        nodes[3].all_parents_must_converge = True

        nodes[0].job = Job(status='successful')
        nodes[1].job = Job(status='failed')
        nodes[2].job = Job(status='running')
        return (g, nodes)

    def test_workflow_all_converge_will_run(self, workflow_all_converge_will_run):
        g, nodes = workflow_all_converge_will_run
        dnr_nodes = g.mark_dnr_nodes()
        assert 0 == len(dnr_nodes), "No nodes should get marked DNR"

        nodes_to_run = g.bfs_nodes_to_run()
        assert 0 == len(nodes_to_run), "No nodes should run yet"

        nodes[2].job.status = 'successful'
        nodes_to_run = g.bfs_nodes_to_run()
        assert 1 == len(nodes_to_run), "1 and only 1 node should want to run"
        assert nodes[3] == nodes_to_run[0], "Convergence node should be chosen to run"

    @pytest.fixture
    def workflow_all_converge_dnr(self, wf_node_generator):
        g = WorkflowDAG()
        nodes = [wf_node_generator() for i in range(4)]
        for n in nodes:
            g.add_node(n)
        r'''
               0    1    2
              S \ F |   / F
                 \  |  /
                  \ | /
                   \|/
                    |
                    3
        '''
        g.add_edge(nodes[0], nodes[3], "success_nodes")
        g.add_edge(nodes[1], nodes[3], "failure_nodes")
        g.add_edge(nodes[2], nodes[3], "failure_nodes")
        nodes[3].all_parents_must_converge = True

        nodes[0].job = Job(status='successful')
        nodes[1].job = Job(status='running')
        nodes[2].job = Job(status='failed')
        return (g, nodes)

    def test_workflow_all_converge_while_parent_runs(self, workflow_all_converge_dnr):
        g, nodes = workflow_all_converge_dnr
        dnr_nodes = g.mark_dnr_nodes()
        assert 0 == len(dnr_nodes), "No nodes should get marked DNR"

        nodes_to_run = g.bfs_nodes_to_run()
        assert 0 == len(nodes_to_run), "No nodes should run yet"

    def test_workflow_all_converge_with_incorrect_parent(self, workflow_all_converge_dnr):
        # Another tick of the scheduler
        g, nodes = workflow_all_converge_dnr
        nodes[1].job.status = 'successful'
        dnr_nodes = g.mark_dnr_nodes()
        assert 1 == len(dnr_nodes), "1 and only 1 node should be marked DNR"
        assert nodes[3] == dnr_nodes[0], "Convergence node should be marked DNR"

        nodes_to_run = g.bfs_nodes_to_run()
        assert 0 == len(nodes_to_run), "Convergence node should NOT be chosen to run because it is DNR"

    def test_workflow_all_converge_runs(self, workflow_all_converge_dnr):
        # Trick the scheduler again to make sure the convergence node acutally runs
        g, nodes = workflow_all_converge_dnr
        nodes[1].job.status = 'failed'
        dnr_nodes = g.mark_dnr_nodes()
        assert 0 == len(dnr_nodes), "No nodes should be marked DNR"

        nodes_to_run = g.bfs_nodes_to_run()
        assert 1 == len(nodes_to_run), "Convergence node should be chosen to run"

    @pytest.fixture
    def workflow_all_converge_deep_dnr_tree(self, wf_node_generator):
        g = WorkflowDAG()
        nodes = [wf_node_generator() for i in range(7)]
        for n in nodes:
            g.add_node(n)
        r'''
               0    1    2
                \   |   /
               S \ S|  / F
                  \ | /
                   \|/
                    |
                    3
                   /\
                S /  \ S
                 /    \
               4|      | 5
                 \    /
                S \  / S
                   \/
                    6
        '''
        g.add_edge(nodes[0], nodes[3], "success_nodes")
        g.add_edge(nodes[1], nodes[3], "success_nodes")
        g.add_edge(nodes[2], nodes[3], "failure_nodes")
        g.add_edge(nodes[3], nodes[4], "success_nodes")
        g.add_edge(nodes[3], nodes[5], "success_nodes")
        g.add_edge(nodes[4], nodes[6], "success_nodes")
        g.add_edge(nodes[5], nodes[6], "success_nodes")
        nodes[3].all_parents_must_converge = True
        nodes[4].all_parents_must_converge = True
        nodes[5].all_parents_must_converge = True
        nodes[6].all_parents_must_converge = True

        nodes[0].job = Job(status='successful')
        nodes[1].job = Job(status='successful')
        nodes[2].job = Job(status='successful')
        return (g, nodes)

    def test_workflow_all_converge_deep_dnr_tree(self, workflow_all_converge_deep_dnr_tree):
        g, nodes = workflow_all_converge_deep_dnr_tree
        dnr_nodes = g.mark_dnr_nodes()

        assert 4 == len(dnr_nodes), "All nodes w/ no jobs should be marked DNR"
        assert nodes[3] in dnr_nodes
        assert nodes[4] in dnr_nodes
        assert nodes[5] in dnr_nodes
        assert nodes[6] in dnr_nodes

        nodes_to_run = g.bfs_nodes_to_run()
        assert 0 == len(nodes_to_run), "All non-run nodes should be DNR and NOT candidates to run"


class TestIsWorkflowDone:
    @pytest.fixture
    def workflow_dag_2(self, workflow_dag_1):
        g, nodes = workflow_dag_1
        r'''
               S0
               /\
            S /  \
             /    \
            S1    |
             |    |
           F |    | S
             |    |
         DNR 3    |
              \   |
             F \  |
                \/
               W2
        '''
        nodes[0].job = Job(status='successful')
        g.mark_dnr_nodes()
        nodes[1].job = Job(status='successful')
        g.mark_dnr_nodes()
        nodes[2].job = Job(status='waiting')
        return (g, nodes)

    @pytest.fixture
    def workflow_dag_failed(self, workflow_dag_1):
        g, nodes = workflow_dag_1
        r'''
               S0
               /\
            S /  \
             /    \
            S1    |
             |    |
           F |    | S
             |    |
         DNR 3    |
              \   |
             F \  |
                \/
               F2
        '''
        nodes[0].job = Job(status='successful')
        g.mark_dnr_nodes()
        nodes[1].job = Job(status='successful')
        g.mark_dnr_nodes()
        nodes[2].job = Job(status='failed')
        return (g, nodes)

    @pytest.fixture
    def workflow_dag_canceled(self, wf_node_generator):
        g = WorkflowDAG()
        nodes = [wf_node_generator() for i in range(1)]
        for n in nodes:
            g.add_node(n)
        r'''
               F0
        '''
        nodes[0].job = Job(status='canceled')
        return (g, nodes)

    @pytest.fixture
    def workflow_dag_failure(self, workflow_dag_canceled):
        g, nodes = workflow_dag_canceled
        nodes[0].job.status = 'failed'
        return (g, nodes)

    def test_done(self, workflow_dag_2):
        g = workflow_dag_2[0]

        assert g.is_workflow_done() is False

    def test_workflow_done_and_failed(self, workflow_dag_failed):
        g, nodes = workflow_dag_failed

        assert g.is_workflow_done() is True
        assert g.has_workflow_failed() == (
            True,
            smart_str(
                _(
                    "No error handling path for workflow job node(s) [({},{})]. Workflow job node(s)"
                    " missing unified job template and error handling path []."
                ).format(nodes[2].id, nodes[2].job.status)
            ),
        )

    def test_is_workflow_done_no_unified_job_tempalte_end(self, workflow_dag_failed):
        g, nodes = workflow_dag_failed

        nodes[2].unified_job_template = None

        assert g.is_workflow_done() is True
        assert g.has_workflow_failed() == (
            True,
            smart_str(
                _(
                    "No error handling path for workflow job node(s) []. Workflow job node(s) missing" " unified job template and error handling path [{}]."
                ).format(nodes[2].id)
            ),
        )

    def test_is_workflow_done_no_unified_job_tempalte_begin(self, workflow_dag_1):
        g, nodes = workflow_dag_1

        nodes[0].unified_job_template = None
        g.mark_dnr_nodes()

        assert g.is_workflow_done() is True
        assert g.has_workflow_failed() == (
            True,
            smart_str(
                _(
                    "No error handling path for workflow job node(s) []. Workflow job node(s) missing" " unified job template and error handling path [{}]."
                ).format(nodes[0].id)
            ),
        )

    def test_canceled_should_fail(self, workflow_dag_canceled):
        g, nodes = workflow_dag_canceled

        assert g.has_workflow_failed() == (
            True,
            smart_str(
                _(
                    "No error handling path for workflow job node(s) [({},{})]. Workflow job node(s)"
                    " missing unified job template and error handling path []."
                ).format(nodes[0].id, nodes[0].job.status)
            ),
        )

    def test_failure_should_fail(self, workflow_dag_failure):
        g, nodes = workflow_dag_failure

        assert g.has_workflow_failed() == (
            True,
            smart_str(
                _(
                    "No error handling path for workflow job node(s) [({},{})]. Workflow job node(s)"
                    " missing unified job template and error handling path []."
                ).format(nodes[0].id, nodes[0].job.status)
            ),
        )


class TestBFSNodesToRun:
    @pytest.fixture
    def workflow_dag_canceled(self, wf_node_generator):
        g = WorkflowDAG()
        nodes = [wf_node_generator() for i in range(4)]
        for n in nodes:
            g.add_node(n)
        r'''
               C0
              / | \
           F / A|  \ S
            /   |   \
           1    2    3
        '''
        g.add_edge(nodes[0], nodes[1], "failure_nodes")
        g.add_edge(nodes[0], nodes[2], "always_nodes")
        g.add_edge(nodes[0], nodes[3], "success_nodes")
        nodes[0].job = Job(status='canceled')
        return (g, nodes)

    def test_cancel_still_runs_children(self, workflow_dag_canceled):
        g, nodes = workflow_dag_canceled
        g.mark_dnr_nodes()

        assert set([nodes[1], nodes[2]]) == set(g.bfs_nodes_to_run())


class TestEvaluateArtifactCondition:
    def test_eq_string(self):
        assert evaluate_artifact_condition({'environment': 'production'}, 'environment', 'eq', 'production') is True
        assert evaluate_artifact_condition({'environment': 'staging'}, 'environment', 'eq', 'production') is False

    def test_eq_json_typed_values(self):
        assert evaluate_artifact_condition({'count': 3}, 'count', 'eq', '3') is True
        assert evaluate_artifact_condition({'enabled': True}, 'enabled', 'eq', 'true') is True
        assert evaluate_artifact_condition({'enabled': False}, 'enabled', 'eq', 'true') is False

    def test_ne(self):
        assert evaluate_artifact_condition({'environment': 'staging'}, 'environment', 'ne', 'production') is True
        assert evaluate_artifact_condition({'environment': 'production'}, 'environment', 'ne', 'production') is False

    def test_missing_key_never_matches(self):
        assert evaluate_artifact_condition({}, 'environment', 'eq', 'production') is False
        assert evaluate_artifact_condition({}, 'environment', 'ne', 'production') is False

    def test_bool_and_int_do_not_cross_match(self):
        assert evaluate_artifact_condition({'flag': True}, 'flag', 'eq', '1') is False
        assert evaluate_artifact_condition({'count': 1}, 'count', 'eq', 'true') is False
        assert evaluate_artifact_condition({'flag': False}, 'flag', 'eq', '0') is False
        assert evaluate_artifact_condition({'count': 0}, 'count', 'ne', 'false') is True


class TestConditionNodes:
    @pytest.fixture
    def condition_dag(self, wf_node_generator):
        g = WorkflowDAG()
        nodes = [wf_node_generator() for i in range(4)]
        for n in nodes:
            g.add_node(n)
        r'''
                    0
                   /|\
        C(env==   / | \
         prod)   /  |  \ F
                /   |   \
               1    2    3
                    |
                    C(env==staging)
        '''
        g.add_edge(nodes[0], nodes[1], "condition_nodes")
        g.edge_conditions[(nodes[0].id, nodes[1].id)] = ('success', 'environment', 'eq', 'production')
        g.add_edge(nodes[0], nodes[2], "condition_nodes")
        g.edge_conditions[(nodes[0].id, nodes[2].id)] = ('success', 'environment', 'eq', 'staging')
        g.add_edge(nodes[0], nodes[3], "failure_nodes")
        return (g, nodes)

    def test_matching_condition_path_runs(self, condition_dag):
        g, nodes = condition_dag
        nodes[0].job = JobWithArtifacts(status='successful', artifacts={'environment': 'production'})

        nodes_to_run = g.bfs_nodes_to_run()
        assert [nodes[1]] == nodes_to_run

        dnr_nodes = g.mark_dnr_nodes()
        assert set([nodes[2], nodes[3]]) == set(dnr_nodes)

    def test_no_matching_condition_no_children_run(self, condition_dag):
        g, nodes = condition_dag
        nodes[0].job = JobWithArtifacts(status='successful', artifacts={'environment': 'development'})

        assert [] == g.bfs_nodes_to_run()
        dnr_nodes = g.mark_dnr_nodes()
        assert set([nodes[1], nodes[2], nodes[3]]) == set(dnr_nodes)
        assert g.is_workflow_done() is True
        assert g.has_workflow_failed() == (False, None)

    def test_missing_artifact_no_children_run(self, condition_dag):
        g, nodes = condition_dag
        nodes[0].job = JobWithArtifacts(status='successful', artifacts={})

        assert [] == g.bfs_nodes_to_run()
        dnr_nodes = g.mark_dnr_nodes()
        assert set([nodes[1], nodes[2], nodes[3]]) == set(dnr_nodes)

    def test_failed_parent_does_not_traverse_condition_paths(self, condition_dag):
        g, nodes = condition_dag
        nodes[0].job = JobWithArtifacts(status='failed', artifacts={'environment': 'production'})

        assert [nodes[3]] == g.bfs_nodes_to_run()
        dnr_nodes = g.mark_dnr_nodes()
        assert set([nodes[1], nodes[2]]) == set(dnr_nodes)

    def test_ancestor_artifacts_are_considered(self, condition_dag):
        g, nodes = condition_dag
        nodes[0].job = JobWithArtifacts(status='successful', artifacts={})
        nodes[0].ancestor_artifacts = {'environment': 'staging'}

        assert [nodes[2]] == g.bfs_nodes_to_run()

    def test_own_job_artifacts_win_over_ancestor(self, condition_dag):
        g, nodes = condition_dag
        nodes[0].job = JobWithArtifacts(status='successful', artifacts={'environment': 'production'})
        nodes[0].ancestor_artifacts = {'environment': 'staging'}

        assert [nodes[1]] == g.bfs_nodes_to_run()

    def test_prior_run_succeeded_parent_uses_ancestor_artifacts(self, condition_dag):
        g, nodes = condition_dag
        nodes[0].prior_run_succeeded = True
        nodes[0].ancestor_artifacts = {'environment': 'production'}

        assert [nodes[1]] == g.bfs_nodes_to_run()
        dnr_nodes = g.mark_dnr_nodes()
        assert set([nodes[2], nodes[3]]) == set(dnr_nodes)

    @pytest.fixture
    def condition_convergence_dag(self, wf_node_generator):
        g = WorkflowDAG()
        nodes = [wf_node_generator() for i in range(3)]
        for n in nodes:
            g.add_node(n)
        r'''
               0         1
                \       /
        C(go==  \      / S
         yes)    \    /
                  \  /
                   2  (ALL convergence)
        '''
        g.add_edge(nodes[0], nodes[2], "condition_nodes")
        g.edge_conditions[(nodes[0].id, nodes[2].id)] = ('success', 'go', 'eq', 'yes')
        g.add_edge(nodes[1], nodes[2], "success_nodes")
        nodes[2].all_parents_must_converge = True
        return (g, nodes)

    def test_all_convergence_with_passing_condition(self, condition_convergence_dag):
        g, nodes = condition_convergence_dag
        nodes[0].job = JobWithArtifacts(status='successful', artifacts={'go': 'yes'})
        nodes[1].job = Job(status='successful')

        dnr_nodes = g.mark_dnr_nodes()
        assert 0 == len(dnr_nodes)
        assert [nodes[2]] == g.bfs_nodes_to_run()

    def test_all_convergence_with_failing_condition(self, condition_convergence_dag):
        g, nodes = condition_convergence_dag
        nodes[0].job = JobWithArtifacts(status='successful', artifacts={'go': 'no'})
        nodes[1].job = Job(status='successful')

        dnr_nodes = g.mark_dnr_nodes()
        assert [nodes[2]] == dnr_nodes
        assert [] == g.bfs_nodes_to_run()

    @pytest.fixture
    def condition_trigger_dag(self, wf_node_generator):
        g = WorkflowDAG()
        nodes = [wf_node_generator() for i in range(4)]
        for n in nodes:
            g.add_node(n)
        r'''
                       0
                      /|\
            C(fail,  / | \  C(always,
             err==  /  |  \  env==prod)
             disk) /   |   \
                  1    2    3
                       |
                       C(success, env==prod)
        '''
        g.add_edge(nodes[0], nodes[1], "condition_nodes")
        g.edge_conditions[(nodes[0].id, nodes[1].id)] = ('failure', 'error_kind', 'eq', 'disk')
        g.add_edge(nodes[0], nodes[2], "condition_nodes")
        g.edge_conditions[(nodes[0].id, nodes[2].id)] = ('success', 'environment', 'eq', 'production')
        g.add_edge(nodes[0], nodes[3], "condition_nodes")
        g.edge_conditions[(nodes[0].id, nodes[3].id)] = ('always', 'environment', 'eq', 'production')
        return (g, nodes)

    def test_failure_trigger_runs_only_on_failed_parent(self, condition_trigger_dag):
        g, nodes = condition_trigger_dag
        nodes[0].job = JobWithArtifacts(status='failed', artifacts={'error_kind': 'disk', 'environment': 'production'})

        nodes_to_run = g.bfs_nodes_to_run()
        # failure-trigger passes; always-trigger passes; success-trigger must not
        assert set([nodes[1], nodes[3]]) == set(nodes_to_run)
        dnr_nodes = g.mark_dnr_nodes()
        assert [nodes[2]] == dnr_nodes

    def test_success_outcome_skips_failure_trigger(self, condition_trigger_dag):
        g, nodes = condition_trigger_dag
        nodes[0].job = JobWithArtifacts(status='successful', artifacts={'error_kind': 'disk', 'environment': 'production'})

        nodes_to_run = g.bfs_nodes_to_run()
        assert set([nodes[2], nodes[3]]) == set(nodes_to_run)
        dnr_nodes = g.mark_dnr_nodes()
        assert [nodes[1]] == dnr_nodes

    def test_passing_failure_condition_counts_as_error_handling_path(self, condition_trigger_dag):
        g, nodes = condition_trigger_dag
        nodes[0].job = JobWithArtifacts(status='failed', artifacts={'error_kind': 'disk'})

        # the failure-trigger condition passes, so its child will actually run
        # and the workflow is not marked failed
        g.mark_dnr_nodes()
        assert g.has_workflow_failed() == (False, None)

    def test_non_passing_failure_condition_is_not_an_error_handling_path(self, condition_trigger_dag):
        g, nodes = condition_trigger_dag
        nodes[0].job = JobWithArtifacts(status='failed', artifacts={})

        # no condition passes, so nothing will handle the failure: the workflow
        # must be marked failed, same as a failed node with no failure/always edge
        g.mark_dnr_nodes()
        failed, message = g.has_workflow_failed()
        assert failed is True

    def test_deleted_ujt_parent_traverses_passing_failure_condition(self, condition_trigger_dag):
        g, nodes = condition_trigger_dag
        # parent never ran (deleted unified job template) and is treated as a
        # failure; condition edges are evaluated against its ancestor artifacts
        nodes[0].unified_job_template = None
        nodes[0].ancestor_artifacts = {'error_kind': 'disk'}

        nodes_to_run = g.bfs_nodes_to_run()
        assert nodes[1] in nodes_to_run
        dnr_nodes = g.mark_dnr_nodes()
        assert nodes[1] not in dnr_nodes
        assert g.has_workflow_failed() == (False, None)


class TestNodeRetry:
    @pytest.fixture
    def workflow_dag_retry(self, wf_node_generator):
        g = WorkflowDAG()
        nodes = [wf_node_generator() for i in range(3)]
        for n in nodes:
            g.add_node(n)
        r'''
               0
               |\ F
               | \
              S|  1
               |
               2
        '''
        g.add_edge(nodes[0], nodes[1], "failure_nodes")
        g.add_edge(nodes[0], nodes[2], "success_nodes")
        return (g, nodes)

    def test_failed_node_with_retries_left_is_respawned(self, workflow_dag_retry):
        g, nodes = workflow_dag_retry
        nodes[0].max_retries = 2
        nodes[0].job = Job(status='failed')

        assert g.mark_dnr_nodes() == [], "children must stay undecided while a retry is pending"
        assert g.bfs_nodes_to_run() == [nodes[0]], "the failed node itself should be respawned"
        assert g.is_workflow_done() is False
        has_failed, reason = g.has_workflow_failed()
        assert has_failed is False
        assert reason is None

    def test_exhausted_retries_follow_failure_path(self, workflow_dag_retry):
        g, nodes = workflow_dag_retry
        nodes[0].max_retries = 2
        nodes[0].retry_attempts = 2
        nodes[0].job = Job(status='failed')

        dnr_nodes = g.mark_dnr_nodes()
        assert dnr_nodes == [nodes[2]], "success child should be marked DNR once retries are exhausted"
        assert g.bfs_nodes_to_run() == [nodes[1]], "failure child should run once retries are exhausted"

    def test_retry_after_success_never_pending(self, workflow_dag_retry):
        g, nodes = workflow_dag_retry
        nodes[0].max_retries = 2
        nodes[0].job = Job(status='successful')

        dnr_nodes = g.mark_dnr_nodes()
        assert dnr_nodes == [nodes[1]]
        assert g.bfs_nodes_to_run() == [nodes[2]]

    def test_canceled_job_is_not_retried(self, workflow_dag_retry):
        g, nodes = workflow_dag_retry
        nodes[0].max_retries = 2
        nodes[0].job = Job(status='canceled')

        dnr_nodes = g.mark_dnr_nodes()
        assert dnr_nodes == [nodes[2]]
        assert g.bfs_nodes_to_run() == [nodes[1]], "canceled node should follow its failure path, not retry"

    def test_error_job_is_retried(self, workflow_dag_retry):
        g, nodes = workflow_dag_retry
        nodes[0].max_retries = 1
        nodes[0].job = Job(status='error')

        assert g.bfs_nodes_to_run() == [nodes[0]]
        assert g.is_workflow_done() is False

    def test_retry_pending_leaf_does_not_fail_workflow(self, wf_node_generator):
        g = WorkflowDAG()
        node = wf_node_generator(max_retries=1)
        g.add_node(node)
        node.job = Job(status='failed')

        assert g.is_workflow_done() is False
        has_failed, reason = g.has_workflow_failed()
        assert has_failed is False

        node.retry_attempts = 1
        assert g.is_workflow_done() is True
        has_failed, reason = g.has_workflow_failed()
        assert has_failed is True

    def test_retry_pending_parent_blocks_convergence(self, wf_node_generator):
        g = WorkflowDAG()
        nodes = [wf_node_generator() for i in range(3)]
        for n in nodes:
            g.add_node(n)
        r'''
               0    1
              S \  / S
                 \/
                 2
        '''
        g.add_edge(nodes[0], nodes[2], "success_nodes")
        g.add_edge(nodes[1], nodes[2], "success_nodes")
        nodes[2].all_parents_must_converge = True
        nodes[0].job = Job(status='successful')
        nodes[1].max_retries = 1
        nodes[1].job = Job(status='failed')

        assert g.mark_dnr_nodes() == [], "convergence child undecided while parent retry is pending"
        assert g.bfs_nodes_to_run() == [nodes[1]], "only the retried parent should spawn"

        # retry succeeded: convergence node runs
        nodes[1].retry_attempts = 1
        nodes[1].job = Job(status='successful')
        assert g.mark_dnr_nodes() == []
        assert g.bfs_nodes_to_run() == [nodes[2]]


@pytest.mark.skip(reason="Run manually to re-generate doc images")
class TestDocsExample:
    @pytest.fixture
    def complex_dag(self, wf_node_generator):
        g = WorkflowDAG()
        nodes = [wf_node_generator() for i in range(10)]
        for n in nodes:
            g.add_node(n)

        g.add_edge(nodes[0], nodes[1], "failure_nodes")
        g.add_edge(nodes[0], nodes[2], "success_nodes")
        g.add_edge(nodes[0], nodes[3], "always_nodes")
        g.add_edge(nodes[1], nodes[4], "success_nodes")
        g.add_edge(nodes[1], nodes[5], "failure_nodes")

        g.add_edge(nodes[2], nodes[6], "failure_nodes")
        g.add_edge(nodes[3], nodes[6], "success_nodes")
        g.add_edge(nodes[4], nodes[6], "always_nodes")

        g.add_edge(nodes[6], nodes[7], "always_nodes")
        g.add_edge(nodes[6], nodes[8], "success_nodes")
        g.add_edge(nodes[6], nodes[9], "failure_nodes")

        return (g, nodes)

    def test_dnr_step(self, complex_dag):
        g, nodes = complex_dag
        base_dir = '/awx_devel'

        g.generate_graphviz_plot(file_name=os.path.join(base_dir, "workflow_step0.gv"))
        nodes[0].job = Job(status='successful')
        g.mark_dnr_nodes()
        g.generate_graphviz_plot(file_name=os.path.join(base_dir, "workflow_step1.gv"))
        nodes[2].job = Job(status='successful')
        nodes[3].job = Job(status='successful')
        g.mark_dnr_nodes()
        g.generate_graphviz_plot(file_name=os.path.join(base_dir, "workflow_step2.gv"))
        nodes[6].job = Job(status='failed')
        g.mark_dnr_nodes()
        g.generate_graphviz_plot(file_name=os.path.join(base_dir, "workflow_step3.gv"))
        nodes[7].job = Job(status='successful')
        nodes[9].job = Job(status='successful')
        g.mark_dnr_nodes()
        g.generate_graphviz_plot(file_name=os.path.join(base_dir, "workflow_step4.gv"))
