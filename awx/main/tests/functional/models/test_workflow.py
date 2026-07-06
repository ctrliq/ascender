# Python
import pytest
from unittest import mock
import json

# AWX
from awx.main.models.workflow import (
    WorkflowJob,
    WorkflowJobNode,
    WorkflowJobTemplateNode,
    WorkflowJobTemplate,
    WorkflowJobTemplateNodeConditionLink,
)
from awx.main.models.jobs import JobTemplate, Job
from awx.main.models.projects import ProjectUpdate
from awx.main.models.credential import Credential, CredentialType
from awx.main.models.label import Label
from awx.main.models.ha import InstanceGroup
from awx.main.scheduler.dag_workflow import WorkflowDAG
from awx.api.versioning import reverse
from awx.api.views import WorkflowJobTemplateNodeSuccessNodesList

# Django
from django.test import TransactionTestCase
from django.core.exceptions import ValidationError
from django.utils.timezone import now


class TestWorkflowDAGFunctional(TransactionTestCase):
    def workflow_job(self, states=['new', 'new', 'new', 'new', 'new']):
        """
        Workflow topology:
               node[0]
                /\
              s/  \f
              /    \
           node[1] node[3]
             /       \
           s/         \f
           /           \
        node[2]       node[4]
        """
        wfj = WorkflowJob.objects.create()
        jt = JobTemplate.objects.create(name='test-jt')
        nodes = [WorkflowJobNode.objects.create(workflow_job=wfj, unified_job_template=jt) for i in range(0, 5)]
        for node, state in zip(nodes, states):
            if state:
                node.job = jt.create_job()
                node.job.status = state
                node.job.save()
                node.save()
        nodes[0].success_nodes.add(nodes[1])
        nodes[1].success_nodes.add(nodes[2])
        nodes[0].failure_nodes.add(nodes[3])
        nodes[3].failure_nodes.add(nodes[4])
        return wfj

    def test_build_WFJT_dag(self):
        """
        Test that building the graph uses 5 queries
         1 to get the nodes
         4 to get the related success, failure, always, and condition connections
        """
        dag = WorkflowDAG()
        wfj = self.workflow_job()
        with self.assertNumQueries(5):
            dag._init_graph(wfj)

    def test_workflow_done(self):
        wfj = self.workflow_job(states=['failed', None, None, 'successful', None])
        dag = WorkflowDAG(workflow_job=wfj)
        assert 3 == len(dag.mark_dnr_nodes())
        is_done = dag.is_workflow_done()
        has_failed, reason = dag.has_workflow_failed()
        self.assertTrue(is_done)
        self.assertFalse(has_failed)
        assert reason is None

        # verify that relaunched WFJ fails if a JT leaf is deleted
        for jt in JobTemplate.objects.all():
            jt.delete()
        relaunched = wfj.create_relaunch_workflow_job()
        dag = WorkflowDAG(workflow_job=relaunched)
        dag.mark_dnr_nodes()
        is_done = dag.is_workflow_done()
        has_failed, reason = dag.has_workflow_failed()
        self.assertTrue(is_done)
        self.assertTrue(has_failed)
        assert "Workflow job node {} related unified job template missing".format(wfj.workflow_nodes.all()[0].id)

    def test_workflow_fails_for_no_error_handler(self):
        wfj = self.workflow_job(states=['successful', 'failed', None, None, None])
        dag = WorkflowDAG(workflow_job=wfj)
        dag.mark_dnr_nodes()
        is_done = dag.is_workflow_done()
        has_failed = dag.has_workflow_failed()
        self.assertTrue(is_done)
        self.assertTrue(has_failed)

    def test_workflow_fails_leaf(self):
        wfj = self.workflow_job(states=['successful', 'successful', 'failed', None, None])
        dag = WorkflowDAG(workflow_job=wfj)
        dag.mark_dnr_nodes()
        is_done = dag.is_workflow_done()
        has_failed = dag.has_workflow_failed()
        self.assertTrue(is_done)
        self.assertTrue(has_failed)

    def test_workflow_not_finished(self):
        wfj = self.workflow_job(states=['new', None, None, None, None])
        dag = WorkflowDAG(workflow_job=wfj)
        dag.mark_dnr_nodes()
        is_done = dag.is_workflow_done()
        has_failed, reason = dag.has_workflow_failed()
        self.assertFalse(is_done)
        self.assertFalse(has_failed)
        assert reason is None

    def test_relaunch_from_failed_carries_succeeded_nodes(self):
        # node[0] succeeded, node[1] failed (success path), rest never ran.
        wfj = self.workflow_job(states=['successful', 'failed', None, None, None])
        relaunched = wfj.create_relaunch_workflow_job(from_failed=True)

        nodes = list(relaunched.workflow_nodes.all())
        carried = [n for n in nodes if n.prior_run_succeeded]
        # exactly the one originally-successful node is carried forward
        assert len(carried) == 1
        root = carried[0]
        # a carried-forward node spawns no job of its own
        assert root.job is None
        assert root.success_nodes.count() == 1
        failed_node = root.success_nodes.first()
        assert failed_node.prior_run_succeeded is False
        assert failed_node.job is None

        dag = WorkflowDAG(workflow_job=relaunched)
        dag.mark_dnr_nodes()
        to_run = dag.bfs_nodes_to_run()
        # the previously-failed node is ready to run again...
        assert failed_node in to_run
        # ...but the carried (already-successful) node is not re-run
        assert root not in to_run
        # and the workflow is not considered done while the failed node is pending
        assert dag.is_workflow_done() is False

    def test_relaunch_full_does_not_carry_nodes(self):
        # a normal (full) relaunch must not mark anything as prior_run_succeeded
        wfj = self.workflow_job(states=['successful', 'failed', None, None, None])
        relaunched = wfj.create_relaunch_workflow_job()
        assert not any(n.prior_run_succeeded for n in relaunched.workflow_nodes.all())

    def test_relaunch_from_failed_twice_keeps_carrying_nodes(self):
        # Relaunching a job that was ITSELF a relaunch-from-failed must keep
        # carrying the already-succeeded node forward. That node has no job of
        # its own (only prior_run_succeeded set), so detecting carry-forward by
        # job status alone misses it and the whole workflow re-runs from the top.
        wfj = self.workflow_job(states=['successful', 'failed', None, None, None])
        succ = wfj.workflow_nodes.get(job__status='successful')
        succ.job.elapsed = 12.5
        succ.job.save()

        relaunch1 = wfj.create_relaunch_workflow_job(from_failed=True)
        carried1 = relaunch1.workflow_nodes.get(prior_run_succeeded=True)
        assert carried1.job is None
        assert carried1.prior_run_elapsed == 12.5

        # Make relaunch1 look like a completed-with-failure run: its previously
        # failed node (the carried node's success child) fails again.
        failed1 = carried1.success_nodes.first()
        failed1.job = failed1.unified_job_template.create_job()
        failed1.job.status = 'failed'
        failed1.job.save()
        failed1.save()

        relaunch2 = relaunch1.create_relaunch_workflow_job(from_failed=True)
        carried2 = relaunch2.workflow_nodes.filter(prior_run_succeeded=True)
        # the originally-successful node is still carried, with its elapsed intact
        assert carried2.count() == 1
        assert carried2.first().job is None
        assert carried2.first().prior_run_elapsed == 12.5

        dag = WorkflowDAG(workflow_job=relaunch2)
        dag.mark_dnr_nodes()
        to_run = dag.bfs_nodes_to_run()
        # the carried node is not re-run; its failed child is ready to run again
        assert carried2.first() not in to_run
        assert carried2.first().success_nodes.first() in to_run

    def test_relaunch_from_failed_carries_set_stats_artifacts(self):
        # A carried node spawns no job, so the set_stats artifacts it produced
        # must be preserved on the new node, otherwise downstream re-run nodes
        # (which read a parent's artifacts from ancestor_artifacts) lose them.
        wfj = self.workflow_job(states=['successful', 'failed', None, None, None])
        root = wfj.workflow_nodes.get(job__status='successful')
        root.job.artifacts = {'build_id': '42'}
        root.job.save()

        relaunched = wfj.create_relaunch_workflow_job(from_failed=True)
        carried = relaunched.workflow_nodes.get(prior_run_succeeded=True)
        # the carried root's set_stats output is captured on the new node
        assert carried.ancestor_artifacts == {'build_id': '42'}

        # and the re-run child inherits it when it builds its job kwargs
        child = carried.success_nodes.first()
        child.get_job_kwargs()
        child.refresh_from_db()
        assert child.ancestor_artifacts.get('build_id') == '42'

    def test_template_path_carries_set_stats_artifacts(self):
        # The WFJT relaunch path maps nodes by identifier. Regression: it must read
        # the concrete polymorphic Job's set_stats artifacts, not the base
        # UnifiedJob's (a select_related('job') there silently dropped them).
        jt = JobTemplate.objects.create(name='art-jt')
        original = WorkflowJob.objects.create()
        onode = WorkflowJobNode.objects.create(workflow_job=original, unified_job_template=jt, identifier='n1')
        onode.job = jt.create_job()
        onode.job.status = 'successful'
        onode.job.artifacts = {'carried_var': 'x'}
        onode.job.save()
        onode.save()

        new = WorkflowJob.objects.create()
        nnode = WorkflowJobNode.objects.create(workflow_job=new, unified_job_template=jt, identifier='n1')
        new.mark_prior_succeeded_nodes_from(original=original)
        nnode.refresh_from_db()
        assert nnode.prior_run_succeeded is True
        assert nnode.ancestor_artifacts == {'carried_var': 'x'}

    def test_relaunch_from_failed_reevaluates_branches(self):
        # The prior run had the root fail, so its failure branch ran and its
        # success branch was do-not-run. On relaunch the root re-runs; the
        # do_not_run decision must be recomputed fresh, not inherited, so that
        # if the root now succeeds the success branch runs and the (previously
        # live) failure branch is pruned.
        wfj = self.workflow_job(states=['failed', None, None, 'failed', 'failed'])
        relaunched = wfj.create_relaunch_workflow_job(from_failed=True)
        # nothing carried, and no node starts out do_not_run
        assert not any(n.prior_run_succeeded for n in relaunched.workflow_nodes.all())
        assert not any(n.do_not_run for n in relaunched.workflow_nodes.all())

        root = next(n for n in relaunched.workflow_nodes.all() if not n.get_parent_nodes())
        success_child = root.success_nodes.first()
        failure_child = root.failure_nodes.first()

        # simulate the re-run root now SUCCEEDING (it failed in the prior run)
        root.job = root.unified_job_template.create_job()
        root.job.status = 'successful'
        root.job.save()
        root.save()

        dag = WorkflowDAG(workflow_job=relaunched)
        dnr_pks = {n.id for n in dag.mark_dnr_nodes()}
        # the failure branch is pruned now that the root succeeded...
        assert failure_child.id in dnr_pks
        # ...and the success branch is not
        assert success_child.id not in dnr_pks
        assert success_child in dag.bfs_nodes_to_run()

    def test_relaunch_from_failed_convergence_with_carried_parent(self):
        # diamond: root -s-> a, root -s-> b ; a,b -s-> conv (all_parents_converge).
        # prior run: root and a succeeded, b failed, conv never ran.
        wfj = WorkflowJob.objects.create()
        jt = JobTemplate.objects.create(name='conv-jt')
        root, node_a, node_b, conv = [WorkflowJobNode.objects.create(workflow_job=wfj, unified_job_template=jt) for _ in range(4)]
        root.success_nodes.add(node_a, node_b)
        node_a.success_nodes.add(conv)
        node_b.success_nodes.add(conv)
        conv.all_parents_must_converge = True
        conv.save()
        for node, state in [(root, 'successful'), (node_a, 'successful'), (node_b, 'failed')]:
            node.job = jt.create_job()
            node.job.status = state
            node.job.save()
            node.save()

        relaunched = wfj.create_relaunch_workflow_job(from_failed=True)
        # root and a (both succeeded) are carried; b re-runs, conv waits
        assert relaunched.workflow_nodes.filter(prior_run_succeeded=True).count() == 2
        new_conv = relaunched.workflow_nodes.get(all_parents_must_converge=True)
        new_b = relaunched.workflow_nodes.get(prior_run_succeeded=False, all_parents_must_converge=False)

        dag = WorkflowDAG(workflow_job=relaunched)
        dag.mark_dnr_nodes()
        to_run = dag.bfs_nodes_to_run()
        # b is ready to re-run; conv must wait until b finishes (a is carried-success)
        assert new_b in to_run
        assert new_conv not in to_run
        assert dag.is_workflow_done() is False

        # once b succeeds, conv converges (carried a + freshly-successful b)
        new_b.job = jt.create_job()
        new_b.job.status = 'successful'
        new_b.job.save()
        new_b.save()
        dag = WorkflowDAG(workflow_job=relaunched)
        dag.mark_dnr_nodes()
        assert new_conv in dag.bfs_nodes_to_run()

    def test_relaunch_from_failed_prunes_carried_node_on_abandoned_branch(self):
        # root FAILED --failure--> handler SUCCEEDED --success--> leaf FAILED.
        # Relaunch carries handler; on re-run root now SUCCEEDS, so root's whole
        # failure branch (handler + leaf) must be pruned. If the carried handler
        # were exempt from do_not_run, leaf would never run and the workflow would
        # hang (never marked done).
        wfj = WorkflowJob.objects.create()
        jt = JobTemplate.objects.create(name='abandon-jt')
        root, handler, leaf = [WorkflowJobNode.objects.create(workflow_job=wfj, unified_job_template=jt) for _ in range(3)]
        root.failure_nodes.add(handler)
        handler.success_nodes.add(leaf)
        for node, state in [(root, 'failed'), (handler, 'successful'), (leaf, 'failed')]:
            node.job = jt.create_job()
            node.job.status = state
            node.job.save()
            node.save()

        relaunched = wfj.create_relaunch_workflow_job(from_failed=True)
        new_root = next(n for n in relaunched.workflow_nodes.all() if not n.get_parent_nodes())
        new_handler = relaunched.workflow_nodes.get(prior_run_succeeded=True)
        new_leaf = new_handler.success_nodes.first()

        # the re-run root now succeeds (it failed in the prior run)
        new_root.job = jt.create_job()
        new_root.job.status = 'successful'
        new_root.job.save()
        new_root.save()

        dag = WorkflowDAG(workflow_job=relaunched)
        dnr = {n.id for n in dag.mark_dnr_nodes()}
        # the carried handler and its leaf are on root's now-untaken failure path
        assert new_handler.id in dnr
        assert new_leaf.id in dnr
        # so nothing remains to run and the workflow completes (no hang)
        assert dag.bfs_nodes_to_run() == []
        assert dag.is_workflow_done() is True

    def test_relaunch_from_failed_does_not_prune_always_carried_node(self):
        # root FAILED, root --always--> mid SUCCEEDED, mid --success--> leaf FAILED.
        # Relaunch carries mid; on re-run root now SUCCEEDS. The always edge is
        # taken regardless of root's outcome, so mid must stay reached (NOT pruned)
        # and its previously-failed leaf must re-run. Guards the DNR fix against
        # over-pruning carried nodes on always paths.
        wfj = WorkflowJob.objects.create()
        jt = JobTemplate.objects.create(name='always-jt')
        root, mid, leaf = [WorkflowJobNode.objects.create(workflow_job=wfj, unified_job_template=jt) for _ in range(3)]
        root.always_nodes.add(mid)
        mid.success_nodes.add(leaf)
        for node, state in [(root, 'failed'), (mid, 'successful'), (leaf, 'failed')]:
            node.job = jt.create_job()
            node.job.status = state
            node.job.save()
            node.save()

        relaunched = wfj.create_relaunch_workflow_job(from_failed=True)
        new_root = next(n for n in relaunched.workflow_nodes.all() if not n.get_parent_nodes())
        new_mid = relaunched.workflow_nodes.get(prior_run_succeeded=True)
        new_leaf = new_mid.success_nodes.first()
        new_root.job = jt.create_job()
        new_root.job.status = 'successful'
        new_root.job.save()
        new_root.save()

        dag = WorkflowDAG(workflow_job=relaunched)
        dnr = {n.id for n in dag.mark_dnr_nodes()}
        # reached via the always edge regardless of root's outcome -> not pruned
        assert new_mid.id not in dnr
        assert new_leaf in dag.bfs_nodes_to_run()

    def test_carried_node_with_deleted_template_does_not_fail_workflow(self):
        # a carried (already-succeeded) node whose template was deleted between
        # runs must not be classified as a failed node. Use separate templates so
        # deleting the carried node's does not also null the re-run node's.
        wfj = WorkflowJob.objects.create()
        jt_carried = JobTemplate.objects.create(name='carried-jt')
        jt_rerun = JobTemplate.objects.create(name='rerun-jt')
        node0 = WorkflowJobNode.objects.create(workflow_job=wfj, unified_job_template=jt_carried)
        node1 = WorkflowJobNode.objects.create(workflow_job=wfj, unified_job_template=jt_rerun)
        node0.success_nodes.add(node1)
        node0.job = jt_carried.create_job()
        node0.job.status = 'successful'
        node0.job.save()
        node0.save()
        node1.job = jt_rerun.create_job()
        node1.job.status = 'failed'
        node1.job.save()
        node1.save()

        relaunched = wfj.create_relaunch_workflow_job(from_failed=True)
        carried = relaunched.workflow_nodes.get(prior_run_succeeded=True)
        jt_carried.delete()
        carried.refresh_from_db()
        assert carried.unified_job_template is None

        dag = WorkflowDAG(workflow_job=relaunched)
        dag.mark_dnr_nodes()
        failed, _reason = dag.has_workflow_failed()
        assert failed is False

    def test_relaunch_from_failed_preserves_extra_vars(self):
        # launch-time variables on the workflow survive the relaunch
        wfj = self.workflow_job(states=['successful', 'failed', None, None, None])
        wfj.extra_vars = '{"my_var": "carried-value"}'
        wfj.save()
        relaunched = wfj.create_relaunch_workflow_job(from_failed=True)
        assert relaunched.extra_vars == '{"my_var": "carried-value"}'

    def test_relaunch_from_failed_reruns_canceled_node(self):
        # a node canceled in the prior run (status 'canceled') is treated like a
        # failure: it re-runs while the successful node is carried forward
        wfj = self.workflow_job(states=['successful', 'canceled', None, None, None])
        relaunched = wfj.create_relaunch_workflow_job(from_failed=True)
        carried = [n for n in relaunched.workflow_nodes.all() if n.prior_run_succeeded]
        assert len(carried) == 1
        canceled_node = carried[0].success_nodes.first()
        assert canceled_node.prior_run_succeeded is False
        assert canceled_node.job is None

        dag = WorkflowDAG(workflow_job=relaunched)
        dag.mark_dnr_nodes()
        assert canceled_node in dag.bfs_nodes_to_run()


@pytest.mark.django_db
class TestWorkflowDNR:
    @pytest.fixture
    def workflow_job_fn(self):
        def fn(states=['new', 'new', 'new', 'new', 'new', 'new']):
            r"""
            Workflow topology:
                   node[0]
                    /   |
                  s     f
                  /     |
               node[1] node[3]
                 /      |
                s       f
               /        |
            node[2]    node[4]
               \        |
                s       f
                 \      |
                  node[5]
            """
            wfj = WorkflowJob.objects.create()
            jt = JobTemplate.objects.create(name='test-jt')
            nodes = [WorkflowJobNode.objects.create(workflow_job=wfj, unified_job_template=jt) for i in range(0, 6)]
            for node, state in zip(nodes, states):
                if state:
                    node.job = jt.create_job()
                    node.job.status = state
                    node.job.save()
                    node.save()
            nodes[0].success_nodes.add(nodes[1])
            nodes[1].success_nodes.add(nodes[2])
            nodes[0].failure_nodes.add(nodes[3])
            nodes[3].failure_nodes.add(nodes[4])
            nodes[2].success_nodes.add(nodes[5])
            nodes[4].failure_nodes.add(nodes[5])
            return wfj, nodes

        return fn

    def test_workflow_dnr_because_parent(self, workflow_job_fn):
        wfj, nodes = workflow_job_fn(
            states=[
                'successful',
                None,
                None,
                None,
                None,
                None,
            ]
        )
        dag = WorkflowDAG(workflow_job=wfj)
        workflow_nodes = dag.mark_dnr_nodes()
        assert 2 == len(workflow_nodes)
        assert nodes[3] in workflow_nodes
        assert nodes[4] in workflow_nodes


@pytest.mark.django_db
class TestWorkflowJob:
    @pytest.fixture
    def workflow_job(self, workflow_job_template_factory):
        wfjt = workflow_job_template_factory('blah').workflow_job_template
        wfj = WorkflowJob.objects.create(workflow_job_template=wfjt)

        nodes = [WorkflowJobTemplateNode.objects.create(workflow_job_template=wfjt) for i in range(0, 5)]

        nodes[0].success_nodes.add(nodes[1])
        nodes[1].success_nodes.add(nodes[2])

        nodes[0].failure_nodes.add(nodes[3])
        nodes[3].failure_nodes.add(nodes[4])

        return wfj

    def test_inherit_job_template_workflow_nodes(self, mocker, workflow_job):
        workflow_job.copy_nodes_from_original(original=workflow_job.workflow_job_template)

        nodes = WorkflowJob.objects.get(id=workflow_job.id).workflow_job_nodes.all().order_by('created')
        assert nodes[0].success_nodes.filter(id=nodes[1].id).exists()
        assert nodes[1].success_nodes.filter(id=nodes[2].id).exists()
        assert nodes[0].failure_nodes.filter(id=nodes[3].id).exists()
        assert nodes[3].failure_nodes.filter(id=nodes[4].id).exists()

    def test_inherit_job_template_workflow_condition_links(self, workflow_job):
        wfjt = workflow_job.workflow_job_template
        template_nodes = list(wfjt.workflow_job_template_nodes.all().order_by('created'))
        WorkflowJobTemplateNodeConditionLink.objects.create(
            from_node=template_nodes[1], to_node=template_nodes[4], trigger='failure', artifact_key='environment', operator='eq', expected_value='production'
        )

        workflow_job.copy_nodes_from_original(original=wfjt)

        nodes = WorkflowJob.objects.get(id=workflow_job.id).workflow_job_nodes.all().order_by('created')
        assert nodes[1].condition_nodes.filter(id=nodes[4].id).exists()
        link = nodes[1].condition_links_from.get()
        assert link.to_node_id == nodes[4].id
        assert link.trigger == 'failure'
        assert link.artifact_key == 'environment'
        assert link.operator == 'eq'
        assert link.expected_value == 'production'
        # condition parents are included in artifact propagation
        assert nodes[1] in list(nodes[4].get_parent_nodes())

    def test_inherit_ancestor_artifacts_from_job(self, job_template, mocker):
        """
        Assure that nodes along the line of execution inherit artifacts
        from both jobs ran, and from the accumulation of old jobs
        """
        # Related resources
        wfj = WorkflowJob.objects.create(name='test-wf-job')
        job = Job.objects.create(name='test-job', artifacts={'b': 43})
        # Workflow job nodes
        job_node = WorkflowJobNode.objects.create(workflow_job=wfj, job=job, ancestor_artifacts={'a': 42})
        queued_node = WorkflowJobNode.objects.create(workflow_job=wfj, unified_job_template=job_template)
        # Connect old job -> new job
        mocker.patch.object(queued_node, 'get_parent_nodes', lambda: [job_node])
        assert queued_node.get_job_kwargs()['extra_vars'] == {'a': 42, 'b': 43}
        assert queued_node.ancestor_artifacts == {'a': 42, 'b': 43}

    def test_inherit_ancestor_artifacts_from_project_update(self, project, job_template, mocker):
        """
        Test that the existence of a project update (no artifacts) does
        not break the flow of ancestor_artifacts
        """
        # Related resources
        wfj = WorkflowJob.objects.create(name='test-wf-job')
        update = ProjectUpdate.objects.create(name='test-update', project=project)
        # Workflow job nodes
        project_node = WorkflowJobNode.objects.create(workflow_job=wfj, job=update, ancestor_artifacts={'a': 42, 'b': 43})
        queued_node = WorkflowJobNode.objects.create(workflow_job=wfj, unified_job_template=job_template)
        # Connect project update -> new job
        mocker.patch.object(queued_node, 'get_parent_nodes', lambda: [project_node])
        assert queued_node.get_job_kwargs()['extra_vars'] == {'a': 42, 'b': 43}
        assert queued_node.ancestor_artifacts == {'a': 42, 'b': 43}

    def test_combine_prompts_WFJT_to_node(self, project, inventory, organization):
        """
        Test that complex prompts like variables, credentials, labels, etc
        are properly combined from the workflow-level with the node-level
        """
        jt = JobTemplate.objects.create(
            project=project,
            inventory=inventory,
            ask_variables_on_launch=True,
            ask_credential_on_launch=True,
            ask_instance_groups_on_launch=True,
            ask_labels_on_launch=True,
            ask_limit_on_launch=True,
        )
        wj = WorkflowJob.objects.create(name='test-wf-job', extra_vars='{}')

        common_ig = InstanceGroup.objects.create(name='common')
        common_ct = CredentialType.objects.create(name='common')

        node = WorkflowJobNode.objects.create(workflow_job=wj, unified_job_template=jt, extra_vars={'node_key': 'node_val'})
        node.limit = 'node_limit'
        node.save()
        node_cred_unique = Credential.objects.create(credential_type=CredentialType.objects.create(name='node'))
        node_cred_conflicting = Credential.objects.create(credential_type=common_ct)
        node.credentials.add(node_cred_unique, node_cred_conflicting)
        node_labels = [Label.objects.create(name='node1', organization=organization), Label.objects.create(name='node2', organization=organization)]
        node.labels.add(*node_labels)
        node_igs = [common_ig, InstanceGroup.objects.create(name='node')]
        for ig in node_igs:
            node.instance_groups.add(ig)

        # assertions for where node has prompts but workflow job does not
        data = node.get_job_kwargs()
        assert data['extra_vars'] == {'node_key': 'node_val'}
        assert set(data['credentials']) == set([node_cred_conflicting, node_cred_unique])
        assert data['instance_groups'] == node_igs
        assert set(data['labels']) == set(node_labels)
        assert data['limit'] == 'node_limit'

        # add prompts to the WorkflowJob
        wj.limit = 'wj_limit'
        wj.extra_vars = {'wj_key': 'wj_val'}
        wj.save()
        wj_cred_unique = Credential.objects.create(credential_type=CredentialType.objects.create(name='wj'))
        wj_cred_conflicting = Credential.objects.create(credential_type=common_ct)
        wj.credentials.add(wj_cred_unique, wj_cred_conflicting)
        wj.labels.add(Label.objects.create(name='wj1', organization=organization), Label.objects.create(name='wj2', organization=organization))
        wj_igs = [InstanceGroup.objects.create(name='wj'), common_ig]
        for ig in wj_igs:
            wj.instance_groups.add(ig)

        # assertions for behavior where node and workflow jobs have prompts
        data = node.get_job_kwargs()
        assert data['extra_vars'] == {'node_key': 'node_val', 'wj_key': 'wj_val'}
        assert set(data['credentials']) == set([wj_cred_unique, wj_cred_conflicting, node_cred_unique])
        assert data['instance_groups'] == wj_igs
        assert set(data['labels']) == set(node_labels)  # as exception, WFJT labels not applied
        assert data['limit'] == 'wj_limit'


@pytest.mark.django_db
class TestWorkflowJobTemplate:
    @pytest.fixture
    def wfjt(self, workflow_job_template_factory, organization):
        wfjt = workflow_job_template_factory('test', organization=organization).workflow_job_template
        wfjt.organization = organization
        nodes = [WorkflowJobTemplateNode.objects.create(workflow_job_template=wfjt) for i in range(0, 3)]
        nodes[0].success_nodes.add(nodes[1])
        nodes[1].failure_nodes.add(nodes[2])
        return wfjt

    def test_node_parentage(self, wfjt):
        # test success parent
        wfjt_node = wfjt.workflow_job_template_nodes.all()[1]
        parent_qs = wfjt_node.get_parent_nodes()
        assert len(parent_qs) == 1
        assert parent_qs[0] == wfjt.workflow_job_template_nodes.all()[0]
        # test failure parent
        wfjt_node = wfjt.workflow_job_template_nodes.all()[2]
        parent_qs = wfjt_node.get_parent_nodes()
        assert len(parent_qs) == 1
        assert parent_qs[0] == wfjt.workflow_job_template_nodes.all()[1]

    def test_topology_validator(self, wfjt):
        test_view = WorkflowJobTemplateNodeSuccessNodesList()
        nodes = wfjt.workflow_job_template_nodes.all()
        # test cycle validation
        assert test_view.is_valid_relation(nodes[2], nodes[0]) == {'Error': 'Cycle detected.'}

    def test_always_success_failure_creation(self, wfjt, admin, get):
        wfjt_node = wfjt.workflow_job_template_nodes.all()[1]
        node = WorkflowJobTemplateNode.objects.create(workflow_job_template=wfjt)
        wfjt_node.always_nodes.add(node)
        assert len(node.get_parent_nodes()) == 1
        url = reverse('api:workflow_job_template_node_list') + str(wfjt_node.id) + '/'
        resp = get(url, admin)
        assert node.id in resp.data['always_nodes']

    def test_wfjt_unique_together_with_org(self, organization):
        wfjt1 = WorkflowJobTemplate(name='foo', organization=organization)
        wfjt1.save()
        wfjt2 = WorkflowJobTemplate(name='foo', organization=organization)
        with pytest.raises(ValidationError):
            wfjt2.validate_unique()
        wfjt2 = WorkflowJobTemplate(name='foo', organization=None)
        wfjt2.validate_unique()


@pytest.mark.django_db
class TestWorkflowJobTemplatePrompts:
    """These are tests for prompts that live on the workflow job template model
    not the node, prompts apply for entire workflow
    """

    @pytest.fixture
    def wfjt_prompts(self):
        return WorkflowJobTemplate.objects.create(
            ask_variables_on_launch=True,
            ask_inventory_on_launch=True,
            ask_tags_on_launch=True,
            ask_labels_on_launch=True,
            ask_limit_on_launch=True,
            ask_scm_branch_on_launch=True,
            ask_skip_tags_on_launch=True,
        )

    @pytest.fixture
    def prompts_data(self, inventory):
        return dict(
            inventory=inventory,
            extra_vars={'foo': 'bar'},
            limit='webservers',
            scm_branch='release-3.3',
            job_tags='foo',
            skip_tags='bar',
        )

    def test_apply_workflow_job_prompts(self, workflow_job_template, wfjt_prompts, prompts_data, inventory):
        # null or empty fields used
        workflow_job = workflow_job_template.create_unified_job()
        assert workflow_job.limit is None
        assert workflow_job.inventory is None
        assert workflow_job.scm_branch is None
        assert workflow_job.job_tags is None
        assert workflow_job.skip_tags is None
        assert len(workflow_job.labels.all()) is 0

        # fields from prompts used
        workflow_job = workflow_job_template.create_unified_job(**prompts_data)
        assert json.loads(workflow_job.extra_vars) == {'foo': 'bar'}
        assert workflow_job.limit == 'webservers'
        assert workflow_job.inventory == inventory
        assert workflow_job.scm_branch == 'release-3.3'
        assert workflow_job.job_tags == 'foo'
        assert workflow_job.skip_tags == 'bar'

        # non-null fields from WFJT used
        workflow_job_template.inventory = inventory
        workflow_job_template.limit = 'fooo'
        workflow_job_template.scm_branch = 'bar'
        workflow_job_template.job_tags = 'baz'
        workflow_job_template.skip_tags = 'dinosaur'
        workflow_job = workflow_job_template.create_unified_job()
        assert workflow_job.limit == 'fooo'
        assert workflow_job.inventory == inventory
        assert workflow_job.scm_branch == 'bar'
        assert workflow_job.job_tags == 'baz'
        assert workflow_job.skip_tags == 'dinosaur'

    @pytest.mark.django_db
    def test_process_workflow_job_prompts(self, inventory, workflow_job_template, wfjt_prompts, prompts_data):
        accepted, rejected, errors = workflow_job_template._accept_or_ignore_job_kwargs(**prompts_data)
        assert accepted == {}
        assert rejected == prompts_data
        assert errors
        accepted, rejected, errors = wfjt_prompts._accept_or_ignore_job_kwargs(**prompts_data)
        assert accepted == prompts_data
        assert rejected == {}
        assert not errors

    @pytest.mark.django_db
    def test_set_all_the_prompts(self, post, organization, inventory, org_admin):
        r = post(
            url=reverse('api:workflow_job_template_list'),
            data=dict(
                name='My new workflow',
                organization=organization.id,
                inventory=inventory.id,
                limit='foooo',
                ask_limit_on_launch=True,
                scm_branch='bar',
                ask_scm_branch_on_launch=True,
                job_tags='foo',
                skip_tags='bar',
            ),
            user=org_admin,
            expect=201,
        )
        wfjt = WorkflowJobTemplate.objects.get(id=r.data['id'])
        assert wfjt.char_prompts == {
            'limit': 'foooo',
            'scm_branch': 'bar',
            'job_tags': 'foo',
            'skip_tags': 'bar',
        }
        assert wfjt.ask_scm_branch_on_launch is True
        assert wfjt.ask_limit_on_launch is True

        launch_url = r.data['related']['launch']
        with mock.patch('awx.main.queue.CallbackQueueDispatcher.dispatch', lambda self, obj: None):
            r = post(url=launch_url, data=dict(scm_branch='prompt_branch', limit='prompt_limit'), user=org_admin, expect=201)
        assert r.data['limit'] == 'prompt_limit'
        assert r.data['scm_branch'] == 'prompt_branch'

    @pytest.mark.django_db
    def test_set_all_ask_for_prompts_false_from_post(self, post, organization, inventory, org_admin):
        '''
        Tests default behaviour and values of ask_for_* fields on WFJT via POST
        '''
        r = post(
            url=reverse('api:workflow_job_template_list'),
            data=dict(
                name='workflow that tests ask_for prompts',
                organization=organization.id,
                inventory=inventory.id,
                job_tags='',
                skip_tags='',
            ),
            user=org_admin,
            expect=201,
        )
        wfjt = WorkflowJobTemplate.objects.get(id=r.data['id'])

        assert wfjt.ask_inventory_on_launch is False
        assert wfjt.ask_labels_on_launch is False
        assert wfjt.ask_limit_on_launch is False
        assert wfjt.ask_scm_branch_on_launch is False
        assert wfjt.ask_skip_tags_on_launch is False
        assert wfjt.ask_tags_on_launch is False
        assert wfjt.ask_variables_on_launch is False

    @pytest.mark.django_db
    def test_set_all_ask_for_prompts_true_from_post(self, post, organization, inventory, org_admin):
        '''
        Tests behaviour and values of ask_for_* fields on WFJT via POST
        '''
        r = post(
            url=reverse('api:workflow_job_template_list'),
            data=dict(
                name='workflow that tests ask_for prompts',
                organization=organization.id,
                inventory=inventory.id,
                job_tags='',
                skip_tags='',
                ask_inventory_on_launch=True,
                ask_labels_on_launch=True,
                ask_limit_on_launch=True,
                ask_scm_branch_on_launch=True,
                ask_skip_tags_on_launch=True,
                ask_tags_on_launch=True,
                ask_variables_on_launch=True,
            ),
            user=org_admin,
            expect=201,
        )
        wfjt = WorkflowJobTemplate.objects.get(id=r.data['id'])

        assert wfjt.ask_inventory_on_launch is True
        assert wfjt.ask_labels_on_launch is True
        assert wfjt.ask_limit_on_launch is True
        assert wfjt.ask_scm_branch_on_launch is True
        assert wfjt.ask_skip_tags_on_launch is True
        assert wfjt.ask_tags_on_launch is True
        assert wfjt.ask_variables_on_launch is True


@pytest.mark.django_db
def test_workflow_ancestors(organization):
    # Spawn order of templates grandparent -> parent -> child
    # create child WFJT and workflow job
    child = WorkflowJobTemplate.objects.create(organization=organization, name='child')
    child_job = WorkflowJob.objects.create(workflow_job_template=child, launch_type='workflow')
    # create parent WFJT and workflow job, and link it up
    parent = WorkflowJobTemplate.objects.create(organization=organization, name='parent')
    parent_job = WorkflowJob.objects.create(workflow_job_template=parent, launch_type='workflow')
    WorkflowJobNode.objects.create(workflow_job=parent_job, unified_job_template=child, job=child_job)
    # create grandparent WFJT and workflow job and link it up
    grandparent = WorkflowJobTemplate.objects.create(organization=organization, name='grandparent')
    grandparent_job = WorkflowJob.objects.create(workflow_job_template=grandparent, launch_type='schedule')
    WorkflowJobNode.objects.create(workflow_job=grandparent_job, unified_job_template=parent, job=parent_job)
    # ancestors method gives a list of WFJT ids
    assert child_job.get_ancestor_workflows() == [parent, grandparent]


@pytest.mark.django_db
def test_workflow_ancestors_recursion_prevention(organization):
    # This is toxic database data, this tests that it doesn't create an infinite loop
    wfjt = WorkflowJobTemplate.objects.create(organization=organization, name='child')
    wfj = WorkflowJob.objects.create(workflow_job_template=wfjt, launch_type='workflow')
    WorkflowJobNode.objects.create(workflow_job=wfj, unified_job_template=wfjt, job=wfj)  # well, this is a problem
    # mostly, we just care that this assertion finishes in finite time
    assert wfj.get_ancestor_workflows() == []


@pytest.mark.django_db
class TestCombinedArtifacts:
    @pytest.fixture
    def wfj_artifacts(self, job_template, organization):
        wfjt = WorkflowJobTemplate.objects.create(organization=organization, name='has_artifacts')
        wfj = WorkflowJob.objects.create(workflow_job_template=wfjt, launch_type='workflow')
        job = job_template.create_unified_job(_eager_fields=dict(artifacts={'foooo': 'bar'}, status='successful', finished=now()))
        WorkflowJobNode.objects.create(workflow_job=wfj, unified_job_template=job_template, job=job)
        return wfj

    def test_multiple_types(self, project, wfj_artifacts):
        project_update = project.create_unified_job()
        WorkflowJobNode.objects.create(workflow_job=wfj_artifacts, unified_job_template=project, job=project_update)

        assert wfj_artifacts.get_effective_artifacts() == {'foooo': 'bar'}

    def test_precedence_based_on_time(self, wfj_artifacts, job_template):
        later_job = job_template.create_unified_job(
            _eager_fields=dict(artifacts={'foooo': 'zoo'}, status='successful', finished=now())  # finished later, should win
        )
        WorkflowJobNode.objects.create(workflow_job=wfj_artifacts, unified_job_template=job_template, job=later_job)

        assert wfj_artifacts.get_effective_artifacts() == {'foooo': 'zoo'}

    def test_bad_data_with_artifacts(self, organization):
        # This is toxic database data, this tests that it doesn't create an infinite loop
        wfjt = WorkflowJobTemplate.objects.create(organization=organization, name='child')
        wfj = WorkflowJob.objects.create(workflow_job_template=wfjt, launch_type='workflow')
        WorkflowJobNode.objects.create(workflow_job=wfj, unified_job_template=wfjt, job=wfj)
        job = Job.objects.create(artifacts={'foo': 'bar'}, status='successful')
        WorkflowJobNode.objects.create(workflow_job=wfj, job=job)
        # mostly, we just care that this assertion finishes in finite time
        assert wfj.get_effective_artifacts() == {'foo': 'bar'}
