from django.utils.translation import gettext_lazy as _
from django.utils.encoding import smart_str

# Python
from awx.main.models import (
    WorkflowJobTemplateNode,
    WorkflowJobNode,
)
from awx.main.models.workflow import evaluate_artifact_condition

# AWX
from awx.main.scheduler.dag_simple import SimpleDAG


class WorkflowDAG(SimpleDAG):
    def __init__(self, workflow_job=None):
        super(WorkflowDAG, self).__init__()
        # (from_node_id, to_node_id) -> (trigger, artifact_key, operator, expected_value)
        self.edge_conditions = dict()
        self._artifacts_cache = dict()
        if workflow_job:
            self._init_graph(workflow_job)

    def _init_graph(self, workflow_job_or_jt):
        if hasattr(workflow_job_or_jt, 'workflow_job_template_nodes'):
            vals = ['from_workflowjobtemplatenode_id', 'to_workflowjobtemplatenode_id']
            filters = {'from_workflowjobtemplatenode__workflow_job_template_id': workflow_job_or_jt.id}
            workflow_nodes = workflow_job_or_jt.workflow_job_template_nodes
            success_nodes = WorkflowJobTemplateNode.success_nodes.through.objects.filter(**filters).values_list(*vals)
            failure_nodes = WorkflowJobTemplateNode.failure_nodes.through.objects.filter(**filters).values_list(*vals)
            always_nodes = WorkflowJobTemplateNode.always_nodes.through.objects.filter(**filters).values_list(*vals)
            condition_links = WorkflowJobTemplateNode.condition_nodes.through.objects.filter(
                from_node__workflow_job_template_id=workflow_job_or_jt.id
            ).values_list('from_node_id', 'to_node_id', 'trigger', 'artifact_key', 'operator', 'expected_value')
        elif hasattr(workflow_job_or_jt, 'workflow_job_nodes'):
            vals = ['from_workflowjobnode_id', 'to_workflowjobnode_id']
            filters = {'from_workflowjobnode__workflow_job_id': workflow_job_or_jt.id}
            workflow_nodes = workflow_job_or_jt.workflow_job_nodes
            success_nodes = WorkflowJobNode.success_nodes.through.objects.filter(**filters).values_list(*vals)
            failure_nodes = WorkflowJobNode.failure_nodes.through.objects.filter(**filters).values_list(*vals)
            always_nodes = WorkflowJobNode.always_nodes.through.objects.filter(**filters).values_list(*vals)
            condition_links = WorkflowJobNode.condition_nodes.through.objects.filter(from_node__workflow_job_id=workflow_job_or_jt.id).values_list(
                'from_node_id', 'to_node_id', 'trigger', 'artifact_key', 'operator', 'expected_value'
            )
        else:
            raise RuntimeError("Unexpected object {} {}".format(type(workflow_job_or_jt), workflow_job_or_jt))

        wfn_by_id = dict()

        for workflow_node in workflow_nodes.all():
            wfn_by_id[workflow_node.id] = workflow_node
            self.add_node(workflow_node)

        for edge in success_nodes:
            self.add_edge(wfn_by_id[edge[0]], wfn_by_id[edge[1]], 'success_nodes')
        for edge in failure_nodes:
            self.add_edge(wfn_by_id[edge[0]], wfn_by_id[edge[1]], 'failure_nodes')
        for edge in always_nodes:
            self.add_edge(wfn_by_id[edge[0]], wfn_by_id[edge[1]], 'always_nodes')
        for from_id, to_id, trigger, artifact_key, operator, expected_value in condition_links:
            self.add_edge(wfn_by_id[from_id], wfn_by_id[to_id], 'condition_nodes')
            self.edge_conditions[(from_id, to_id)] = (trigger or 'success', artifact_key, operator or 'eq', expected_value)

    def _get_node_artifacts(self, obj):
        """Artifacts visible on a finished parent node: its accumulated
        ancestor_artifacts plus whatever its own job produced via set_stats.
        Mirrors what WorkflowJobNode.get_job_kwargs passes downstream."""
        if obj.id in self._artifacts_cache:
            return self._artifacts_cache[obj.id]
        artifacts = dict(getattr(obj, 'ancestor_artifacts', None) or {})
        job = getattr(obj, 'job', None)
        if job:
            artifacts.update(job.get_effective_artifacts(parents_set=set([getattr(obj, 'workflow_job_id', None)])))
        self._artifacts_cache[obj.id] = artifacts
        return artifacts

    def _edge_condition_passes(self, parent_obj, child_obj, outcome):
        """outcome is the parent's terminal state ('success' or 'failure'); the
        edge only fires when its trigger matches that outcome (or is 'always')
        AND the artifact condition holds."""
        condition = self.edge_conditions.get((parent_obj.id, child_obj.id))
        if condition is None:
            return False
        trigger, artifact_key, operator, expected_value = condition
        if trigger not in (outcome, 'always'):
            return False
        return evaluate_artifact_condition(self._get_node_artifacts(parent_obj), artifact_key, operator, expected_value)

    def _passing_condition_children(self, obj, outcome):
        return [child for child in self.get_children(obj, 'condition_nodes') if self._edge_condition_passes(obj, child['node_object'], outcome)]

    def _are_relevant_parents_finished(self, node):
        obj = node['node_object']
        parent_nodes = [p['node_object'] for p in self.get_parents(obj)]
        for p in parent_nodes:
            if p.do_not_run is True:
                continue
            # carried forward from a relaunch-from-failed: already finished (successful)
            elif p.prior_run_succeeded:
                continue
            elif p.unified_job_template is None:
                continue
            # do_not_run is False, node might still run a job and thus blocks children
            elif not p.job:
                return False
            # Node decidedly got a job; check if job is done. A failed job with
            # automatic retries left is not done, a new attempt will be spawned.
            elif p.job and not p.job_finished():
                return False
        return True

    def _all_parents_met_convergence_criteria(self, node):
        # This function takes any node and checks that all it's parents have met their criteria to run the child.
        # This returns a boolean and is really only useful if the node is an ALL convergence node and is
        # intended to be used in conjuction with the node property `all_parents_must_converge`
        obj = node['node_object']
        parent_nodes = [p['node_object'] for p in self.get_parents(obj)]
        for p in parent_nodes:
            status = None
            # node has a status; a failed job with automatic retries left has
            # no final status yet
            if p.job_finished() and p.job.status in ["successful", "failed"]:
                if p.job and p.job.status == "successful":
                    status = "success_nodes"
                elif p.job and p.job.status == "failed":
                    status = "failure_nodes"
            # carried forward from a relaunch-from-failed counts as a successful parent
            elif p.prior_run_succeeded:
                status = "success_nodes"
            if status is not None:
                # check that the nodes status matches either a pathway of the same status or is an always path.
                if p in [node['node_object'] for node in self.get_parents(obj, status)]:
                    continue
                if p in [node['node_object'] for node in self.get_parents(obj, "always_nodes")]:
                    continue
                # a parent connected by a condition edge meets the criteria only if the
                # edge trigger covers the parent's outcome and the condition holds
                outcome = "success" if status == "success_nodes" else "failure"
                if self._edge_condition_passes(p, obj, outcome):
                    continue
                return False
        return True

    def bfs_nodes_to_run(self):
        nodes = self.get_root_nodes()
        nodes_found = []
        node_ids_visited = set()
        for index, n in enumerate(nodes):
            obj = n['node_object']
            if obj.id in node_ids_visited:
                continue
            node_ids_visited.add(obj.id)
            if obj.do_not_run is True:
                continue
            # carried forward from a relaunch-from-failed: do not run, but traverse
            # its success/always paths as though the job had succeeded
            elif obj.prior_run_succeeded:
                nodes.extend(
                    self.get_children(obj, 'success_nodes') + self.get_children(obj, 'always_nodes') + self._passing_condition_children(obj, 'success')
                )
            elif obj.job:
                # a failed job with automatic retries left is respawned instead
                # of following its failure paths
                if obj.retry_pending():
                    nodes_found.append(n)
                elif obj.job.status in ['failed', 'error', 'canceled']:
                    nodes.extend(
                        self.get_children(obj, 'failure_nodes') + self.get_children(obj, 'always_nodes') + self._passing_condition_children(obj, 'failure')
                    )
                elif obj.job.status == 'successful':
                    nodes.extend(
                        self.get_children(obj, 'success_nodes') + self.get_children(obj, 'always_nodes') + self._passing_condition_children(obj, 'success')
                    )
            elif obj.unified_job_template is None:
                nodes.extend(
                    self.get_children(obj, 'failure_nodes') + self.get_children(obj, 'always_nodes') + self._passing_condition_children(obj, 'failure')
                )
            else:
                # This catches root nodes or ANY convergence nodes
                if not obj.all_parents_must_converge and self._are_relevant_parents_finished(n):
                    nodes_found.append(n)
                # This catches ALL convergence nodes
                elif obj.all_parents_must_converge and self._are_relevant_parents_finished(n):
                    if self._all_parents_met_convergence_criteria(n):
                        nodes_found.append(n)

        return [n['node_object'] for n in nodes_found]

    def cancel_node_jobs(self):
        cancel_finished = True
        for n in self.nodes:
            obj = n['node_object']
            job = obj.job

            if not job:
                continue
            elif job.can_cancel:
                cancel_finished = False
                job.cancel()
        return cancel_finished

    def is_workflow_done(self):
        for node in self.nodes:
            obj = node['node_object']
            if obj.do_not_run is False and not obj.prior_run_succeeded and not obj.job and obj.unified_job_template:
                return False
            elif obj.job and not obj.job_finished():
                return False
        return True

    def has_workflow_failed(self):
        failed_nodes = []
        res = False
        failed_path_nodes_id_status = []
        failed_unified_job_template_node_ids = []

        for node in self.nodes:
            obj = node['node_object']
            if obj.do_not_run is False and not obj.prior_run_succeeded and obj.unified_job_template is None:
                failed_nodes.append(node)
            elif obj.finally_failed():
                failed_nodes.append(node)

        for node in failed_nodes:
            obj = node['node_object']
            # condition edges only count as an error handling path if they will
            # actually fire for this failed parent (trigger covers the failure AND
            # the artifact condition holds); the parent is terminal here so its
            # artifacts are final
            if (
                len(self.get_children(obj, 'failure_nodes'))
                + len(self.get_children(obj, 'always_nodes'))
                + len(self._passing_condition_children(obj, 'failure'))
            ) == 0:
                if obj.unified_job_template is None:
                    res = True
                    failed_unified_job_template_node_ids.append(str(obj.id))
                else:
                    res = True
                    failed_path_nodes_id_status.append((str(obj.id), obj.job.status))

        if res is True:
            s = _(
                "No error handling path for workflow job node(s) [{node_status}]. Workflow job "
                "node(s) missing unified job template and error handling path [{no_ufjt}]."
            )
            parms = {
                'node_status': '',
                'no_ufjt': '',
            }
            if len(failed_path_nodes_id_status) > 0:
                parms['node_status'] = ",".join(["({},{})".format(id, status) for id, status in failed_path_nodes_id_status])
            if len(failed_unified_job_template_node_ids) > 0:
                parms['no_ufjt'] = ",".join(failed_unified_job_template_node_ids)
            return True, smart_str(s.format(**parms))
        return False, None

    r'''
    Determine if all nodes have been decided on being marked do_not_run.
    Nodes that are do_not_run False may become do_not_run True in the future.
    We know a do_not_run False node will NOT be marked do_not_run True if there
    is a job run for that node.

    :param workflow_nodes:     list of workflow_nodes

    Return a boolean
    '''

    def _are_all_nodes_dnr_decided(self, workflow_nodes):
        for n in workflow_nodes:
            if n.do_not_run is False and not n.prior_run_succeeded and (not n.job or n.retry_pending()) and n.unified_job_template:
                return False
        return True

    r'''
    Determine if a node (1) is ready to be marked do_not_run and (2) should
    be marked do_not_run.

    :param node:             SimpleDAG internal node
    :param parent_nodes:     list of workflow_nodes

    Return a boolean
    '''

    def _should_mark_node_dnr(self, node, parent_nodes):
        for p in parent_nodes:
            if p.do_not_run is True:
                pass
            # carried forward from a relaunch-from-failed counts as a successful parent
            elif p.prior_run_succeeded:
                if node in (self.get_children(p, 'success_nodes') + self.get_children(p, 'always_nodes')) or self._edge_condition_passes(
                    p, node['node_object'], 'success'
                ):
                    return False
            elif p.job:
                # a failed job with automatic retries left is not decided yet
                if p.retry_pending():
                    return False
                elif p.job.status == 'successful':
                    if node in (self.get_children(p, 'success_nodes') + self.get_children(p, 'always_nodes')) or self._edge_condition_passes(
                        p, node['node_object'], 'success'
                    ):
                        return False
                elif p.job.status in ['failed', 'error', 'canceled']:
                    if node in (self.get_children(p, 'failure_nodes') + self.get_children(p, 'always_nodes')) or self._edge_condition_passes(
                        p, node['node_object'], 'failure'
                    ):
                        return False
                else:
                    return False
            elif not p.do_not_run and p.unified_job_template is None:
                if node in (self.get_children(p, 'failure_nodes') + self.get_children(p, 'always_nodes')) or self._edge_condition_passes(
                    p, node['node_object'], 'failure'
                ):
                    return False
            else:
                return False
        return True

    r'''
    determine if the current node is a convergence node by checking if all the
    parents are finished then checking to see if all parents meet the needed
    path criteria to run the convergence child.
    (i.e. parent must fail, parent must succeed, etc. to proceed)

    Return a list object
    '''

    def mark_dnr_nodes(self):
        root_nodes = self.get_root_nodes()
        nodes_marked_do_not_run = []

        for node in self.sort_nodes_topological():
            obj = node['node_object']
            parent_nodes = [p['node_object'] for p in self.get_parents(obj)]
            # A carried-forward node (prior_run_succeeded) is NOT exempt from DNR:
            # if the branch that reached it is no longer taken in this run (e.g. a
            # re-run parent now succeeds instead of failing), it and its subtree
            # must still be marked do_not_run or the workflow never completes.
            if not obj.do_not_run and not obj.job and node not in root_nodes:
                if obj.all_parents_must_converge:
                    if any(p.do_not_run for p in parent_nodes) or not self._all_parents_met_convergence_criteria(node):
                        obj.do_not_run = True
                        nodes_marked_do_not_run.append(node)
                else:
                    if self._are_all_nodes_dnr_decided(parent_nodes):
                        if self._should_mark_node_dnr(node, parent_nodes):
                            obj.do_not_run = True
                            nodes_marked_do_not_run.append(node)

        return [n['node_object'] for n in nodes_marked_do_not_run]
