# Copyright (c) 2026 Ascender
# All Rights Reserved.
"""
Workflows: templates, the nodes in them, the jobs they run and the
approvals they wait on.

Lifted out of ascender/api/serializers.py, which had grown to 6,558 lines and
136 classes. Nothing here changed on the way across.
"""

from datetime import timedelta
from django.db.models import prefetch_related_objects
from django.db.models.manager import BaseManager
from django.utils.translation import gettext_lazy as _
from rest_framework import serializers
from ascender.main.access import WorkflowApprovalAccess, WorkflowJobAccess, get_user_capabilities
from ascender.main.models import (
    Inventory,
    JobTemplate,
    Label,
    UnifiedJob,
    WorkflowApproval,
    WorkflowApprovalTemplate,
    WorkflowApprovalVote,
    WorkflowJob,
    WorkflowJobNode,
    WorkflowJobTemplate,
    WorkflowJobTemplateNode,
)
from ascender.main.utils import getattrd
from ascender.main.validators import vars_validate_or_raise
from ascender.api.fields import VerbatimField
from ascender.api.serializers.base import (
    BaseSerializer,
    LaunchConfigurationBaseSerializer,
    UnifiedJobListSerializer,
    UnifiedJobSerializer,
    UnifiedJobTemplateSerializer,
)
from ascender.api.serializers.job import (
    JobTemplateMixin,
)
from ascender.api.serializers.label import (
    LabelsListMixin,
)


class WorkflowJobTemplateSerializer(JobTemplateMixin, LabelsListMixin, UnifiedJobTemplateSerializer):
    show_capabilities = ['start', 'schedule', 'edit', 'copy', 'delete']
    capabilities_prefetch = ['admin', 'execute', {'copy': 'organization.workflow_admin'}]
    limit = serializers.CharField(allow_blank=True, allow_null=True, required=False, default=None)
    scm_branch = serializers.CharField(allow_blank=True, allow_null=True, required=False, default=None, max_length=1024)

    skip_tags = serializers.CharField(allow_blank=True, allow_null=True, required=False, default=None)
    job_tags = serializers.CharField(allow_blank=True, allow_null=True, required=False, default=None)
    webhook_key = serializers.CharField(
        write_only=True,
        required=False,
        allow_blank=True,
        max_length=64,
        help_text=_('Shared secret that the webhook service will use to sign requests. Leave blank to generate a new one when the webhook service is set.'),
    )

    class Meta:
        model = WorkflowJobTemplate
        fields = (
            '*',
            'extra_vars',
            'organization',
            'survey_enabled',
            'allow_simultaneous',
            'allow_overwrite_flow_vars_on_relaunch',
            'ask_variables_on_launch',
            'inventory',
            'limit',
            'scm_branch',
            'ask_inventory_on_launch',
            'ask_scm_branch_on_launch',
            'ask_limit_on_launch',
            'webhook_service',
            'webhook_credential',
            'webhook_key',
            '-execution_environment',
            'ask_labels_on_launch',
            'ask_skip_tags_on_launch',
            'ask_tags_on_launch',
            'skip_tags',
            'job_tags',
        )

    def get_related(self, obj):
        res = super(WorkflowJobTemplateSerializer, self).get_related(obj)
        res.update(
            workflow_jobs=self.reverse('api:workflow_job_template_jobs_list', kwargs={'pk': obj.pk}),
            schedules=self.reverse('api:workflow_job_template_schedules_list', kwargs={'pk': obj.pk}),
            launch=self.reverse('api:workflow_job_template_launch', kwargs={'pk': obj.pk}),
            webhook_key=self.reverse('api:webhook_key', kwargs={'model_kwarg': 'workflow_job_templates', 'pk': obj.pk}),
            webhook_receiver=(
                self.reverse('api:webhook_receiver_{}'.format(obj.webhook_service), kwargs={'model_kwarg': 'workflow_job_templates', 'pk': obj.pk})
                if obj.webhook_service
                else ''
            ),
            workflow_nodes=self.reverse('api:workflow_job_template_workflow_nodes_list', kwargs={'pk': obj.pk}),
            labels=self.reverse('api:workflow_job_template_label_list', kwargs={'pk': obj.pk}),
            activity_stream=self.reverse('api:workflow_job_template_activity_stream_list', kwargs={'pk': obj.pk}),
            notification_templates_started=self.reverse('api:workflow_job_template_notification_templates_started_list', kwargs={'pk': obj.pk}),
            notification_templates_success=self.reverse('api:workflow_job_template_notification_templates_success_list', kwargs={'pk': obj.pk}),
            notification_templates_error=self.reverse('api:workflow_job_template_notification_templates_error_list', kwargs={'pk': obj.pk}),
            notification_templates_approvals=self.reverse('api:workflow_job_template_notification_templates_approvals_list', kwargs={'pk': obj.pk}),
            access_list=self.reverse('api:workflow_job_template_access_list', kwargs={'pk': obj.pk}),
            object_roles=self.reverse('api:workflow_job_template_object_roles_list', kwargs={'pk': obj.pk}),
            survey_spec=self.reverse('api:workflow_job_template_survey_spec', kwargs={'pk': obj.pk}),
            copy=self.reverse('api:workflow_job_template_copy', kwargs={'pk': obj.pk}),
        )
        res.pop('execution_environment', None)  # EEs aren't meaningful for workflows
        if obj.organization:
            res['organization'] = self.reverse('api:organization_detail', kwargs={'pk': obj.organization.pk})
        if obj.webhook_credential_id:
            res['webhook_credential'] = self.reverse('api:credential_detail', kwargs={'pk': obj.webhook_credential_id})
        if obj.inventory_id:
            res['inventory'] = self.reverse('api:inventory_detail', kwargs={'pk': obj.inventory_id})
        return res

    def validate_extra_vars(self, value):
        return vars_validate_or_raise(value)

    def validate(self, attrs):
        attrs = super(WorkflowJobTemplateSerializer, self).validate(attrs)

        # process char_prompts, these are not direct fields on the model
        mock_obj = self.Meta.model()
        for field_name in ('scm_branch', 'limit', 'skip_tags', 'job_tags'):
            if field_name in attrs:
                setattr(mock_obj, field_name, attrs[field_name])
                attrs.pop(field_name)

        # Model `.save` needs the container dict, not the pseudo fields
        if mock_obj.char_prompts:
            attrs['char_prompts'] = mock_obj.char_prompts

        return attrs


class WorkflowJobTemplateWithSpecSerializer(WorkflowJobTemplateSerializer):
    """
    Used for activity stream entries.
    """

    class Meta:
        model = WorkflowJobTemplate
        fields = ('*', 'survey_spec')


class WorkflowJobSerializer(LabelsListMixin, UnifiedJobSerializer):
    limit = serializers.CharField(allow_blank=True, allow_null=True, required=False, default=None)
    scm_branch = serializers.CharField(allow_blank=True, allow_null=True, required=False, default=None, max_length=1024)

    skip_tags = serializers.CharField(allow_blank=True, allow_null=True, required=False, default=None)
    job_tags = serializers.CharField(allow_blank=True, allow_null=True, required=False, default=None)

    class Meta:
        model = WorkflowJob
        fields = (
            '*',
            'workflow_job_template',
            'extra_vars',
            'allow_simultaneous',
            'allow_overwrite_flow_vars_on_relaunch',
            'job_template',
            'is_sliced_job',
            '-execution_environment',
            '-execution_node',
            '-event_processing_finished',
            '-controller_node',
            'inventory',
            'limit',
            'scm_branch',
            'webhook_service',
            'webhook_credential',
            'webhook_guid',
            'skip_tags',
            'job_tags',
        )

    def get_related(self, obj):
        res = super(WorkflowJobSerializer, self).get_related(obj)
        res.pop('execution_environment', None)  # EEs aren't meaningful for workflows
        if obj.workflow_job_template:
            res['workflow_job_template'] = self.reverse('api:workflow_job_template_detail', kwargs={'pk': obj.workflow_job_template.pk})
            res['notifications'] = self.reverse('api:workflow_job_notifications_list', kwargs={'pk': obj.pk})
        if obj.job_template_id:
            res['job_template'] = self.reverse('api:job_template_detail', kwargs={'pk': obj.job_template_id})
        res['workflow_nodes'] = self.reverse('api:workflow_job_workflow_nodes_list', kwargs={'pk': obj.pk})
        res['labels'] = self.reverse('api:workflow_job_label_list', kwargs={'pk': obj.pk})
        res['activity_stream'] = self.reverse('api:workflow_job_activity_stream_list', kwargs={'pk': obj.pk})
        res['relaunch'] = self.reverse('api:workflow_job_relaunch', kwargs={'pk': obj.pk})
        if obj.can_cancel or True:
            res['cancel'] = self.reverse('api:workflow_job_cancel', kwargs={'pk': obj.pk})
        return res

    def to_representation(self, obj):
        ret = super(WorkflowJobSerializer, self).to_representation(obj)
        if obj is None:
            return ret
        if 'extra_vars' in ret:
            ret['extra_vars'] = obj.display_extra_vars()
        return ret


class WorkflowJobListSerializer(WorkflowJobSerializer, UnifiedJobListSerializer):
    class Meta:
        fields = ('*', '-execution_environment', '-execution_node', '-controller_node')


class WorkflowJobCancelSerializer(WorkflowJobSerializer):
    can_cancel = serializers.BooleanField(read_only=True)

    class Meta:
        fields = ('can_cancel',)


class WorkflowApprovalViewSerializer(UnifiedJobSerializer):
    class Meta:
        model = WorkflowApproval
        fields = []


# ----------------------------------------------------------------------------
# Workflow approvals
# ----------------------------------------------------------------------------

# Context keys under which a page of approvals carries its permission answers,
# computed once for the page by WorkflowApprovalPageSerializer.
APPROVE_OR_DENY_ANSWERS = 'workflow_approval_approve_or_deny_answers'
CANCEL_WORKFLOW_ANSWERS = 'workflow_approval_cancel_workflow_answers'


def waiting_workflow_job(approval):
    """
    The workflow job an approval waits in, if it waits in one.

    Only an approval a workflow spawned waits in a workflow job, and it reaches
    that job through the workflow job node that ran it. Either link can be
    missing, a node that no longer exists or one with no workflow job, and both
    read as the approval waiting in nothing, which is what the two callers want.

    Args:
        approval: The workflow approval to look from.

    Returns:
        WorkflowJob or None: The workflow job, or None when the approval was
            not spawned by a workflow or the link to its job no longer exists.
    """
    if not approval.spawned_by_workflow:
        return None
    try:
        return approval.unified_job_node.workflow_job
    except UnifiedJob.unified_job_node.RelatedObjectDoesNotExist:
        return None


class WorkflowApprovalPageSerializer(serializers.ListSerializer):
    """
    Serializes a page of approvals with its permission checks done once.

    can_approve_or_deny and can_cancel_workflow each ask role questions about
    every approval, several queries a row for anyone but a superuser. Before
    the rows are serialized this asks the access classes for the whole page at
    once and leaves the answers in the serializer context, where the row
    methods pick them up. A row the access classes did not answer is checked
    on its own, as it would be without this.

    BaseSerializer already prefetches user_capabilities for a page through
    capabilities_prefetch, but that mechanism can only express "the user holds
    this role on the row or a related row", and neither answer here fits it:
    approving reads votes and quorum, and canceling asks about another object.
    """

    # What every row of a page reads besides its own columns: its template for
    # the related links and summary fields, and the node, workflow job and
    # workflow template behind can_approve_or_deny and can_cancel_workflow.
    PAGE_PREFETCH = ('workflow_approval_template', 'unified_job_node__workflow_job__unified_job_template')

    @staticmethod
    def prefetch_page(approvals):
        """
        Load what the rows of a page read, a few queries for the whole page.

        This lives here rather than in WorkflowApprovalAccess.prefetch_related
        because that queryset also serves the detail, approve and deny views,
        which read one approval and would pay for every prefetch up front.

        An approval's unified_job_template and workflow_approval_template are
        two foreign keys to the same row, the second one typed, and the base
        manager of UnifiedJobTemplate is polymorphic, so reading the first
        yields the same WorkflowApprovalTemplate the second holds. It is read
        once, through workflow_approval_template, and handed to the other.

        Args:
            approvals: The approvals of the page, as a list. They are changed
                in place: the related objects land in their caches.
        """
        prefetch_related_objects(approvals, *WorkflowApprovalPageSerializer.PAGE_PREFETCH)
        unified_job_template = WorkflowApproval.unified_job_template.field
        for approval in approvals:
            if unified_job_template.is_cached(approval) or approval.unified_job_template_id is None:
                continue
            template = approval.workflow_approval_template
            if template is not None and template.pk == approval.unified_job_template_id:
                unified_job_template.set_cached_value(approval, template)

    def to_representation(self, data):
        """
        Answer the page's permission checks, then serialize its rows.

        Args:
            data: The approvals of the page, as a list, queryset or manager.

        Returns:
            list: One serialized approval per row, as ListSerializer gives.
        """
        iterable = data.all() if isinstance(data, BaseManager) else data
        approvals = list(iterable)
        self.prefetch_page(approvals)
        request = self.context.get('request', None)
        if request is not None:
            # Step 1: can_approve_or_deny, keyed by approval.
            self.context[APPROVE_OR_DENY_ANSWERS] = WorkflowApprovalAccess(request.user).can_approve_or_deny_many(approvals)
            # Step 2: the cancel capability of the workflow jobs the approvals
            # wait in, keyed by workflow job. Only approvals a workflow spawned
            # are asked about, as get_can_cancel_workflow only asks for those.
            workflow_jobs = {}
            for approval in approvals:
                workflow_job = waiting_workflow_job(approval)
                if workflow_job is not None:
                    workflow_jobs[workflow_job.pk] = workflow_job
            self.context[CANCEL_WORKFLOW_ANSWERS] = WorkflowJobAccess(request.user).get_cancel_capabilities(workflow_jobs.values())
        return super().to_representation(approvals)


class WorkflowApprovalSerializer(UnifiedJobSerializer):
    can_approve_or_deny = serializers.SerializerMethodField()
    can_cancel_workflow = serializers.SerializerMethodField()
    approval_expiration = serializers.SerializerMethodField()
    timed_out = serializers.ReadOnlyField()
    approvals_received = serializers.SerializerMethodField()
    user_has_voted = serializers.SerializerMethodField()

    # An approval is stopped by approving or denying it, or by canceling the
    # workflow job it waits in (reported as can_cancel_workflow). It has no
    # cancel endpoint of its own, so the inherited 'cancel' capability would
    # offer an action no request could carry out.
    show_capabilities = ['start', 'delete']

    class Meta:
        model = WorkflowApproval
        list_serializer_class = WorkflowApprovalPageSerializer
        fields = (
            '*',
            '-controller_node',
            '-execution_node',
            'can_approve_or_deny',
            'can_cancel_workflow',
            'approval_expiration',
            'timed_out',
            'context_message',
            'required_approvals',
            'approvals_received',
            'on_timeout',
            'user_has_voted',
        )

    def get_approval_expiration(self, obj):
        if obj.status != 'pending' or obj.timeout == 0:
            return None
        return obj.created + timedelta(seconds=obj.timeout)

    def get_can_approve_or_deny(self, obj):
        """
        Whether the user may approve or deny this approval now.

        On a page of approvals the access check was answered for the whole
        page up front (see WorkflowApprovalPageSerializer); an approval it left
        unanswered, or one serialized on its own, is checked here.

        Args:
            obj: The workflow approval being serialized.

        Returns:
            bool: True when the approval is pending and the user may decide it.
        """
        request = self.context.get('request', None)
        answers = self.context.get(APPROVE_OR_DENY_ANSWERS) or {}
        if obj.pk in answers:
            allowed = answers[obj.pk]
        else:
            allowed = request.user.can_access(WorkflowApproval, 'approve_or_deny', obj)
        return allowed is True and obj.status == 'pending'

    def get_can_cancel_workflow(self, obj):
        """
        Whether the user may cancel the workflow job this approval waits in.

        Canceling the workflow is a right on the workflow job, its creator or an
        admin of its template, not the approver role, so it is reported apart
        from can_approve_or_deny.

        Args:
            obj: The workflow approval being serialized.

        Returns:
            bool: True when a cancel request for the workflow job would be accepted.
        """
        request = self.context.get('request', None)
        if request is None:
            return False
        workflow_job = waiting_workflow_job(obj)
        if workflow_job is None:
            return False
        # On a page of approvals the capability was answered for every
        # workflow job up front; one left unanswered is checked on its own.
        answers = self.context.get(CANCEL_WORKFLOW_ANSWERS) or {}
        if workflow_job.pk in answers:
            return answers[workflow_job.pk]
        return bool(get_user_capabilities(request.user, workflow_job, method_list=['cancel']).get('cancel'))

    def get_approvals_received(self, obj):
        return obj.approvals_received()

    def get_user_has_voted(self, obj):
        request = self.context.get('request', None)
        if request is None:
            return False
        return obj.has_vote_from(request.user)

    def get_related(self, obj):
        res = super(WorkflowApprovalSerializer, self).get_related(obj)

        if obj.workflow_approval_template:
            res['workflow_approval_template'] = self.reverse('api:workflow_approval_template_detail', kwargs={'pk': obj.workflow_approval_template.pk})
        res['approve'] = self.reverse('api:workflow_approval_approve', kwargs={'pk': obj.pk})
        res['deny'] = self.reverse('api:workflow_approval_deny', kwargs={'pk': obj.pk})
        res['votes'] = self.reverse('api:workflow_approval_votes_list', kwargs={'pk': obj.pk})
        if obj.approved_or_denied_by:
            res['approved_or_denied_by'] = self.reverse('api:user_detail', kwargs={'pk': obj.approved_or_denied_by.pk})
        return res


class WorkflowApprovalActivityStreamSerializer(WorkflowApprovalSerializer):
    """
    timed_out and status are usually read-only fields
    However, when we generate an activity stream record, we *want* to record
    these types of changes.  This serializer allows us to do so.
    """

    status = serializers.ChoiceField(choices=JobTemplate.JOB_TEMPLATE_STATUS_CHOICES)
    timed_out = serializers.BooleanField()


class WorkflowApprovalListSerializer(WorkflowApprovalSerializer, UnifiedJobListSerializer):
    class Meta:
        list_serializer_class = WorkflowApprovalPageSerializer
        fields = (
            '*',
            '-controller_node',
            '-execution_node',
            'can_approve_or_deny',
            'can_cancel_workflow',
            'approval_expiration',
            'timed_out',
            '-context_message',
        )

    def get_field_names(self, declared_fields, info):
        field_names = super(WorkflowApprovalListSerializer, self).get_field_names(declared_fields, info)
        # keep the potentially large rendered context out of list payloads,
        # the detail view is the one that shows it
        return tuple(x for x in field_names if x != 'context_message')


class WorkflowApprovalTemplateSerializer(UnifiedJobTemplateSerializer):
    class Meta:
        model = WorkflowApprovalTemplate
        fields = ('*', 'timeout', 'name', 'context_template', 'required_approvals', 'on_timeout')

    def get_related(self, obj):
        res = super(WorkflowApprovalTemplateSerializer, self).get_related(obj)
        if 'last_job' in res:
            del res['last_job']

        res.update(jobs=self.reverse('api:workflow_approval_template_jobs_list', kwargs={'pk': obj.pk}))
        return res


class WorkflowApprovalVoteSerializer(BaseSerializer):
    class Meta:
        model = WorkflowApprovalVote
        fields = (
            '*',
            '-name',
            '-description',
            '-modified',
            'workflow_approval',
            'user',
            'vote',
            'comment',
            'workflow_approval_name',
            'workflow_job_id',
            'workflow_job_name',
            'user_name',
        )

    def get_related(self, obj):
        res = super(WorkflowApprovalVoteSerializer, self).get_related(obj)
        if obj.workflow_approval_id:
            res['workflow_approval'] = self.reverse('api:workflow_approval_detail', kwargs={'pk': obj.workflow_approval_id})
        if obj.user_id:
            res['user'] = self.reverse('api:user_detail', kwargs={'pk': obj.user_id})
        return res


def _workflow_node_condition_edges(obj):
    return [
        {
            'id': link.to_node_id,
            'trigger': link.trigger,
            'artifact_key': link.artifact_key,
            'operator': link.operator,
            'expected_value': link.expected_value,
        }
        for link in obj.condition_links_from.all()
    ]


class WorkflowJobTemplateNodeSerializer(LaunchConfigurationBaseSerializer):
    success_nodes = serializers.PrimaryKeyRelatedField(many=True, read_only=True)
    failure_nodes = serializers.PrimaryKeyRelatedField(many=True, read_only=True)
    always_nodes = serializers.PrimaryKeyRelatedField(many=True, read_only=True)
    condition_nodes = serializers.PrimaryKeyRelatedField(many=True, read_only=True)
    condition_edges = serializers.SerializerMethodField(
        help_text=_('List of condition data for each conditional edge originating from this node; id is the target node.')
    )
    exclude_errors = ('required',)  # required variables may be provided by WFJT or on launch

    class Meta:
        model = WorkflowJobTemplateNode
        fields = (
            '*',
            'workflow_job_template',
            '-name',
            '-description',
            'id',
            'url',
            'related',
            'unified_job_template',
            'success_nodes',
            'failure_nodes',
            'always_nodes',
            'condition_nodes',
            'condition_edges',
            'all_parents_must_converge',
            'max_retries',
            'identifier',
        )

    def get_condition_edges(self, obj):
        return _workflow_node_condition_edges(obj)

    def get_related(self, obj):
        res = super(WorkflowJobTemplateNodeSerializer, self).get_related(obj)
        res['create_approval_template'] = self.reverse('api:workflow_job_template_node_create_approval', kwargs={'pk': obj.pk})
        res['success_nodes'] = self.reverse('api:workflow_job_template_node_success_nodes_list', kwargs={'pk': obj.pk})
        res['failure_nodes'] = self.reverse('api:workflow_job_template_node_failure_nodes_list', kwargs={'pk': obj.pk})
        res['always_nodes'] = self.reverse('api:workflow_job_template_node_always_nodes_list', kwargs={'pk': obj.pk})
        res['condition_nodes'] = self.reverse('api:workflow_job_template_node_condition_nodes_list', kwargs={'pk': obj.pk})
        if obj.unified_job_template:
            res['unified_job_template'] = obj.unified_job_template.get_absolute_url(self.context.get('request'))
        try:
            res['workflow_job_template'] = self.reverse('api:workflow_job_template_detail', kwargs={'pk': obj.workflow_job_template.pk})
        except WorkflowJobTemplate.DoesNotExist:
            pass
        return res

    def build_relational_field(self, field_name, relation_info):
        field_class, field_kwargs = super(WorkflowJobTemplateNodeSerializer, self).build_relational_field(field_name, relation_info)
        # workflow_job_template is read-only unless creating a new node.
        if self.instance and field_name == 'workflow_job_template':
            field_kwargs['read_only'] = True
            field_kwargs.pop('queryset', None)
        return field_class, field_kwargs

    def get_summary_fields(self, obj):
        summary_fields = super(WorkflowJobTemplateNodeSerializer, self).get_summary_fields(obj)
        if isinstance(obj.unified_job_template, WorkflowApprovalTemplate):
            summary_fields['unified_job_template']['timeout'] = obj.unified_job_template.timeout
            summary_fields['unified_job_template']['required_approvals'] = obj.unified_job_template.required_approvals
            summary_fields['unified_job_template']['on_timeout'] = obj.unified_job_template.on_timeout
            summary_fields['unified_job_template']['context_template'] = obj.unified_job_template.context_template
        return summary_fields


class WorkflowJobNodeSerializer(LaunchConfigurationBaseSerializer):
    success_nodes = serializers.PrimaryKeyRelatedField(many=True, read_only=True)
    failure_nodes = serializers.PrimaryKeyRelatedField(many=True, read_only=True)
    always_nodes = serializers.PrimaryKeyRelatedField(many=True, read_only=True)
    condition_nodes = serializers.PrimaryKeyRelatedField(many=True, read_only=True)
    condition_edges = serializers.SerializerMethodField(
        help_text=_('List of condition data for each conditional edge originating from this node; id is the target node.')
    )
    retried_jobs = serializers.PrimaryKeyRelatedField(many=True, read_only=True)

    class Meta:
        model = WorkflowJobNode
        fields = (
            '*',
            'job',
            'workflow_job',
            '-name',
            '-description',
            'id',
            'url',
            'related',
            'unified_job_template',
            'success_nodes',
            'failure_nodes',
            'always_nodes',
            'condition_nodes',
            'condition_edges',
            'all_parents_must_converge',
            'do_not_run',
            'prior_run_succeeded',
            'prior_run_elapsed',
            'max_retries',
            'retry_attempts',
            'retried_jobs',
            'identifier',
        )

    def get_condition_edges(self, obj):
        return _workflow_node_condition_edges(obj)

    def get_related(self, obj):
        res = super(WorkflowJobNodeSerializer, self).get_related(obj)
        res['success_nodes'] = self.reverse('api:workflow_job_node_success_nodes_list', kwargs={'pk': obj.pk})
        res['failure_nodes'] = self.reverse('api:workflow_job_node_failure_nodes_list', kwargs={'pk': obj.pk})
        res['always_nodes'] = self.reverse('api:workflow_job_node_always_nodes_list', kwargs={'pk': obj.pk})
        res['condition_nodes'] = self.reverse('api:workflow_job_node_condition_nodes_list', kwargs={'pk': obj.pk})
        if obj.unified_job_template:
            res['unified_job_template'] = obj.unified_job_template.get_absolute_url(self.context.get('request'))
        if obj.job:
            res['job'] = obj.job.get_absolute_url(self.context.get('request'))
        if obj.workflow_job:
            res['workflow_job'] = self.reverse('api:workflow_job_detail', kwargs={'pk': obj.workflow_job.pk})
        return res

    def get_summary_fields(self, obj):
        summary_fields = super(WorkflowJobNodeSerializer, self).get_summary_fields(obj)
        if isinstance(obj.job, WorkflowApproval):
            summary_fields['job']['timed_out'] = obj.job.timed_out
        return summary_fields


class WorkflowJobNodeListSerializer(WorkflowJobNodeSerializer):
    pass


class WorkflowJobNodeDetailSerializer(WorkflowJobNodeSerializer):
    pass


class WorkflowJobTemplateNodeDetailSerializer(WorkflowJobTemplateNodeSerializer):
    """
    Influence the api browser sample data to not include workflow_job_template
    when editing a WorkflowNode.

    Note: I was not able to accomplish this through the use of extra_kwargs.
    Maybe something to do with workflow_job_template being a relational field?
    """

    def build_relational_field(self, field_name, relation_info):
        field_class, field_kwargs = super(WorkflowJobTemplateNodeDetailSerializer, self).build_relational_field(field_name, relation_info)
        if self.instance and field_name == 'workflow_job_template':
            field_kwargs['read_only'] = True
            field_kwargs.pop('queryset', None)
        return field_class, field_kwargs


class WorkflowJobTemplateNodeCreateApprovalSerializer(BaseSerializer):
    class Meta:
        model = WorkflowApprovalTemplate
        fields = ('timeout', 'name', 'description', 'context_template', 'required_approvals', 'on_timeout')

    def to_representation(self, obj):
        return {}


class WorkflowJobLaunchSerializer(BaseSerializer):
    can_start_without_user_input = serializers.BooleanField(read_only=True)
    defaults = serializers.SerializerMethodField()
    variables_needed_to_start = serializers.ReadOnlyField()
    survey_enabled = serializers.SerializerMethodField()
    extra_vars = VerbatimField(required=False, write_only=True)
    inventory = serializers.PrimaryKeyRelatedField(queryset=Inventory.objects.all(), required=False, write_only=True)
    limit = serializers.CharField(required=False, write_only=True, allow_blank=True)
    scm_branch = serializers.CharField(required=False, write_only=True, allow_blank=True, max_length=1024)
    workflow_job_template_data = serializers.SerializerMethodField()

    labels = serializers.PrimaryKeyRelatedField(many=True, queryset=Label.objects.all(), required=False, write_only=True)
    skip_tags = serializers.CharField(required=False, write_only=True, allow_blank=True)
    job_tags = serializers.CharField(required=False, write_only=True, allow_blank=True)

    class Meta:
        model = WorkflowJobTemplate
        fields = (
            'ask_inventory_on_launch',
            'ask_limit_on_launch',
            'ask_scm_branch_on_launch',
            'can_start_without_user_input',
            'defaults',
            'extra_vars',
            'inventory',
            'limit',
            'scm_branch',
            'survey_enabled',
            'variables_needed_to_start',
            'node_templates_missing',
            'node_prompts_rejected',
            'workflow_job_template_data',
            'survey_enabled',
            'ask_variables_on_launch',
            'ask_labels_on_launch',
            'labels',
            'ask_skip_tags_on_launch',
            'ask_tags_on_launch',
            'skip_tags',
            'job_tags',
        )
        read_only_fields = (
            'ask_inventory_on_launch',
            'ask_variables_on_launch',
            'ask_skip_tags_on_launch',
            'ask_labels_on_launch',
            'ask_limit_on_launch',
            'ask_scm_branch_on_launch',
            'ask_tags_on_launch',
        )

    def get_survey_enabled(self, obj):
        if obj:
            return obj.survey_enabled and 'spec' in obj.survey_spec
        return False

    def get_defaults(self, obj):
        defaults_dict = {}
        for field_name in WorkflowJobTemplate.get_ask_mapping().keys():
            if field_name == 'inventory':
                defaults_dict[field_name] = dict(name=getattrd(obj, '%s.name' % field_name, None), id=getattrd(obj, '%s.pk' % field_name, None))
            elif field_name == 'labels':
                for label in obj.labels.all():
                    label_dict = {"id": label.id, "name": label.name}
                    defaults_dict.setdefault(field_name, []).append(label_dict)
            else:
                defaults_dict[field_name] = getattr(obj, field_name)
        return defaults_dict

    def get_workflow_job_template_data(self, obj):
        return dict(name=obj.name, id=obj.id, description=obj.description)

    def validate(self, attrs):
        template = self.instance

        accepted, rejected, errors = template._accept_or_ignore_job_kwargs(**attrs)
        self._ignored_fields = rejected

        if template.inventory and template.inventory.pending_deletion is True:
            errors['inventory'] = _("The inventory associated with this Workflow is being deleted.")
        elif 'inventory' in accepted and accepted['inventory'].pending_deletion:
            errors['inventory'] = _("The provided inventory is being deleted.")

        if errors:
            raise serializers.ValidationError(errors)

        WFJT_extra_vars = template.extra_vars
        WFJT_inventory = template.inventory
        WFJT_limit = template.limit
        WFJT_scm_branch = template.scm_branch

        super(WorkflowJobLaunchSerializer, self).validate(attrs)
        template.extra_vars = WFJT_extra_vars
        template.inventory = WFJT_inventory
        template.limit = WFJT_limit
        template.scm_branch = WFJT_scm_branch

        return accepted
