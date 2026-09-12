# Copyright (c) 2026 Ascender
# All Rights Reserved.
"""
The views behind every workflow endpoint: templates, their nodes, the jobs
they run, and the approvals a workflow waits on.

Lifted out of awx/api/views/__init__.py, which had grown to 4,780 lines and
303 classes with no order to them. Nothing here changed on the way across.
"""

from awx.api import serializers
from awx.api.generics import (
    CopyAPIView,
    GenericAPIView,
    GenericCancelView,
    ListAPIView,
    ListCreateAPIView,
    ResourceAccessList,
    RetrieveAPIView,
    RetrieveDestroyAPIView,
    RetrieveUpdateDestroyAPIView,
    SubListAPIView,
    SubListAttachDetachAPIView,
    SubListCreateAPIView,
    SubListCreateAttachDetachAPIView,
)
from awx.api.permissions import WorkflowApprovalPermission
from awx.api.views.labels import LabelSubListCreateAttachDetachView
from awx.api.views.mixin import RelatedJobsPreventDeleteMixin, UnifiedJobDeletionMixin
from awx.main import models
from awx.main.scheduler.dag_workflow import WorkflowDAG
from awx.main.utils import ScheduleWorkflowManager, getattrd
from collections import OrderedDict
from django.contrib.contenttypes.models import ContentType
from django.db.models import Q
from django.db.models.fields.related import ForeignKey, ManyToManyField
from django.utils.translation import gettext_lazy as _
from rest_framework import status
from rest_framework.exceptions import ParseError, PermissionDenied
from rest_framework.response import Response
import functools
import json
import logging
import sys

from awx.main.utils import camelcase_to_underscore
from rest_framework.views import APIView

# the shared bases these views are built on, which stay where they are
from awx.api.views import (
    EnforceParentRelationshipMixin,
    JobLabelList,
    JobTemplateLabelList,
    JobTemplateSurveySpec,
    LaunchConfigCredentialsBase,
)

logger = logging.getLogger('awx.api.views.workflow')


def _approval_vote_comment(request):
    # request.data may be a dict, QueryDict or other mapping depending on the parser
    data = request.data
    if hasattr(data, 'get'):
        comment = data.get('comment', '')
        if isinstance(comment, str):
            return comment
    return ''


class WorkflowJobTemplateSurveySpec(JobTemplateSurveySpec):
    model = models.WorkflowJobTemplate


class WorkflowJobNodeList(ListAPIView):
    model = models.WorkflowJobNode
    serializer_class = serializers.WorkflowJobNodeListSerializer
    search_fields = ('unified_job_template__name', 'unified_job_template__description')


class WorkflowJobNodeDetail(RetrieveAPIView):
    model = models.WorkflowJobNode
    serializer_class = serializers.WorkflowJobNodeDetailSerializer


class WorkflowJobNodeCredentialsList(SubListAPIView):
    model = models.Credential
    serializer_class = serializers.CredentialSerializer
    parent_model = models.WorkflowJobNode
    relationship = 'credentials'


class WorkflowJobNodeLabelsList(SubListAPIView):
    model = models.Label
    serializer_class = serializers.LabelSerializer
    parent_model = models.WorkflowJobNode
    relationship = 'labels'


class WorkflowJobNodeInstanceGroupsList(SubListAttachDetachAPIView):
    model = models.InstanceGroup
    serializer_class = serializers.InstanceGroupSerializer
    parent_model = models.WorkflowJobNode
    relationship = 'instance_groups'


class WorkflowJobTemplateNodeList(ListCreateAPIView):
    model = models.WorkflowJobTemplateNode
    serializer_class = serializers.WorkflowJobTemplateNodeSerializer
    search_fields = ('unified_job_template__name', 'unified_job_template__description')


class WorkflowJobTemplateNodeDetail(RetrieveUpdateDestroyAPIView):
    model = models.WorkflowJobTemplateNode
    serializer_class = serializers.WorkflowJobTemplateNodeDetailSerializer


class WorkflowJobTemplateNodeCredentialsList(LaunchConfigCredentialsBase):
    parent_model = models.WorkflowJobTemplateNode


class WorkflowJobTemplateNodeLabelsList(LabelSubListCreateAttachDetachView):
    parent_model = models.WorkflowJobTemplateNode


class WorkflowJobTemplateNodeInstanceGroupsList(SubListAttachDetachAPIView):
    model = models.InstanceGroup
    serializer_class = serializers.InstanceGroupSerializer
    parent_model = models.WorkflowJobTemplateNode
    relationship = 'instance_groups'


class WorkflowJobTemplateNodeChildrenBaseList(EnforceParentRelationshipMixin, SubListCreateAttachDetachAPIView):
    model = models.WorkflowJobTemplateNode
    serializer_class = serializers.WorkflowJobTemplateNodeSerializer
    always_allow_superuser = True
    parent_model = models.WorkflowJobTemplateNode
    relationship = ''
    enforce_parent_relationship = 'workflow_job_template'
    search_fields = ('unified_job_template__name', 'unified_job_template__description')
    filter_read_permission = False

    def is_valid_relation(self, parent, sub, created=False):
        if created:
            return None

        if parent.id == sub.id:
            return {"Error": _("Cycle detected.")}

        '''
        Look for parent->child connection in all relationships except the relationship that is
        attempting to be added; because it's ok to re-add the relationship
        '''
        relationships = ['success_nodes', 'failure_nodes', 'always_nodes', 'condition_nodes']
        relationships.remove(self.relationship)
        qs = functools.reduce(lambda x, y: x | y, (Q(**{'{}__in'.format(r): [sub.id]}) for r in relationships))

        if models.WorkflowJobTemplateNode.objects.filter(Q(pk=parent.id) & qs).exists():
            return {"Error": _("Relationship not allowed.")}

        parent_node_type_relationship = getattr(parent, self.relationship)
        parent_node_type_relationship.add(sub)

        graph = WorkflowDAG(parent.workflow_job_template)
        if graph.has_cycle():
            parent_node_type_relationship.remove(sub)
            return {"Error": _("Cycle detected.")}
        parent_node_type_relationship.remove(sub)
        return None


class WorkflowJobTemplateNodeCreateApproval(RetrieveAPIView):
    model = models.WorkflowJobTemplateNode
    serializer_class = serializers.WorkflowJobTemplateNodeCreateApprovalSerializer
    permission_classes = []

    def post(self, request, *args, **kwargs):
        obj = self.get_object()
        serializer = self.get_serializer(instance=obj, data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        approval_template = obj.create_approval_template(**serializer.validated_data)
        data = serializers.WorkflowApprovalTemplateSerializer(approval_template, context=self.get_serializer_context()).data
        return Response(data, status=status.HTTP_201_CREATED)

    def check_permissions(self, request):
        if not request.user.is_authenticated:
            raise PermissionDenied()
        obj = self.get_object().workflow_job_template
        if request.method == 'POST':
            if not request.user.can_access(models.WorkflowJobTemplate, 'change', obj, request.data):
                self.permission_denied(request)
        else:
            if not request.user.can_access(models.WorkflowJobTemplate, 'read', obj):
                self.permission_denied(request)


class WorkflowJobTemplateNodeSuccessNodesList(WorkflowJobTemplateNodeChildrenBaseList):
    relationship = 'success_nodes'


class WorkflowJobTemplateNodeFailureNodesList(WorkflowJobTemplateNodeChildrenBaseList):
    relationship = 'failure_nodes'


class WorkflowJobTemplateNodeAlwaysNodesList(WorkflowJobTemplateNodeChildrenBaseList):
    relationship = 'always_nodes'


class WorkflowJobTemplateNodeConditionNodesList(WorkflowJobTemplateNodeChildrenBaseList):
    relationship = 'condition_nodes'

    def _condition_data(self, data):
        expected_value = data.get('expected_value', '')
        if not isinstance(expected_value, str):
            expected_value = json.dumps(expected_value)
        return {
            'trigger': data.get('trigger') or 'success',
            'artifact_key': data.get('artifact_key', ''),
            'operator': data.get('operator') or 'eq',
            'expected_value': expected_value,
        }

    def is_valid_relation(self, parent, sub, created=False):
        condition = self._condition_data(self.request.data)
        if not condition['artifact_key'] or not isinstance(condition['artifact_key'], str):
            return {'artifact_key': [_('A non-empty artifact_key is required for a conditional link.')]}
        valid_operators = [choice[0] for choice in models.WorkflowJobTemplateNodeConditionLink.OPERATOR_CHOICES]
        if condition['operator'] not in valid_operators:
            return {'operator': [_('Invalid operator. Valid choices are: {}.').format(', '.join(valid_operators))]}
        valid_triggers = [choice[0] for choice in models.WorkflowJobTemplateNodeConditionLink.TRIGGER_CHOICES]
        if condition['trigger'] not in valid_triggers:
            return {'trigger': [_('Invalid trigger. Valid choices are: {}.').format(', '.join(valid_triggers))]}
        return super(WorkflowJobTemplateNodeConditionNodesList, self).is_valid_relation(parent, sub, created=created)

    def attach(self, request, *args, **kwargs):
        response = super(WorkflowJobTemplateNodeConditionNodesList, self).attach(request, *args, **kwargs)
        if response.status_code in (status.HTTP_201_CREATED, status.HTTP_204_NO_CONTENT):
            # the plain m2m add() created the link with default (empty) condition
            # values; fill in the requested condition. Re-posting an existing link
            # updates its condition.
            sub_id = request.data.get('id', None)
            if sub_id is None and response.data:
                sub_id = response.data.get('id', None)
            if sub_id is not None:
                parent = self.get_parent_object()
                models.WorkflowJobTemplateNodeConditionLink.objects.filter(from_node=parent, to_node_id=sub_id).update(**self._condition_data(request.data))
        return response


class WorkflowJobNodeChildrenBaseList(SubListAPIView):
    model = models.WorkflowJobNode
    serializer_class = serializers.WorkflowJobNodeListSerializer
    parent_model = models.WorkflowJobNode
    relationship = ''
    search_fields = ('unified_job_template__name', 'unified_job_template__description')
    filter_read_permission = False


class WorkflowJobNodeSuccessNodesList(WorkflowJobNodeChildrenBaseList):
    relationship = 'success_nodes'


class WorkflowJobNodeFailureNodesList(WorkflowJobNodeChildrenBaseList):
    relationship = 'failure_nodes'


class WorkflowJobNodeAlwaysNodesList(WorkflowJobNodeChildrenBaseList):
    relationship = 'always_nodes'


class WorkflowJobNodeConditionNodesList(WorkflowJobNodeChildrenBaseList):
    relationship = 'condition_nodes'


class WorkflowJobTemplateList(ListCreateAPIView):
    model = models.WorkflowJobTemplate
    serializer_class = serializers.WorkflowJobTemplateSerializer
    always_allow_superuser = False


class WorkflowJobTemplateDetail(RelatedJobsPreventDeleteMixin, RetrieveUpdateDestroyAPIView):
    model = models.WorkflowJobTemplate
    serializer_class = serializers.WorkflowJobTemplateSerializer
    always_allow_superuser = False


class WorkflowJobTemplateCopy(CopyAPIView):
    model = models.WorkflowJobTemplate
    copy_return_serializer_class = serializers.WorkflowJobTemplateSerializer

    def get(self, request, *args, **kwargs):
        obj = self.get_object()
        if not request.user.can_access(obj.__class__, 'read', obj):
            raise PermissionDenied()
        can_copy, messages = request.user.can_access_with_errors(self.model, 'copy', obj)
        data = OrderedDict(
            [
                ('can_copy', can_copy),
                ('can_copy_without_user_input', can_copy),
                ('templates_unable_to_copy', [] if can_copy else ['all']),
                ('credentials_unable_to_copy', [] if can_copy else ['all']),
                ('inventories_unable_to_copy', [] if can_copy else ['all']),
            ]
        )
        if messages and can_copy:
            data['can_copy_without_user_input'] = False
            data.update(messages)
        return Response(data)

    def _build_create_dict(self, obj):
        """Special processing of fields managed by char_prompts"""
        r = super(WorkflowJobTemplateCopy, self)._build_create_dict(obj)
        field_names = set(f.name for f in obj._meta.get_fields())
        for field_name, ask_field_name in obj.get_ask_mapping().items():
            if field_name in r and field_name not in field_names:
                r.setdefault('char_prompts', {})
                r['char_prompts'][field_name] = r.pop(field_name)
        return r

    @staticmethod
    def deep_copy_permission_check_func(user, new_objs):
        for obj in new_objs:
            for field_name in obj._get_workflow_job_field_names():
                item = getattr(obj, field_name, None)
                if item is None:
                    continue
                elif field_name in ['inventory']:
                    if not user.can_access(item.__class__, 'use', item):
                        setattr(obj, field_name, None)
                elif field_name in ['unified_job_template']:
                    if not user.can_access(item.__class__, 'start', item, validate_license=False):
                        setattr(obj, field_name, None)
                elif field_name in ['credentials']:
                    for cred in item.all():
                        if not user.can_access(cred.__class__, 'use', cred):
                            logger.debug('Deep copy: removing {} from relationship due to permissions'.format(cred))
                            item.remove(cred.pk)
            obj.save()


class WorkflowJobTemplateLabelList(JobTemplateLabelList):
    parent_model = models.WorkflowJobTemplate


class WorkflowJobTemplateLaunch(RetrieveAPIView):
    model = models.WorkflowJobTemplate
    obj_permission_type = 'start'
    serializer_class = serializers.WorkflowJobLaunchSerializer
    always_allow_superuser = False

    def update_raw_data(self, data):
        try:
            obj = self.get_object()
        except PermissionDenied:
            return data
        extra_vars = data.pop('extra_vars', None) or {}
        if obj:
            for v in obj.variables_needed_to_start:
                extra_vars.setdefault(v, '')
            if extra_vars:
                data['extra_vars'] = extra_vars
            modified_ask_mapping = models.WorkflowJobTemplate.get_ask_mapping()
            modified_ask_mapping.pop('extra_vars')

            for field, ask_field_name in modified_ask_mapping.items():
                if not getattr(obj, ask_field_name):
                    data.pop(field, None)
                elif isinstance(getattr(obj.__class__, field).field, ForeignKey):
                    data[field] = getattrd(obj, "%s.%s" % (field, 'id'), None)
                elif isinstance(getattr(obj.__class__, field).field, ManyToManyField):
                    data[field] = [item.id for item in getattr(obj, field).all()]
                else:
                    data[field] = getattr(obj, field)

        return data

    def post(self, request, *args, **kwargs):
        obj = self.get_object()

        if 'inventory_id' in request.data:
            request.data['inventory'] = request.data['inventory_id']

        serializer = self.serializer_class(instance=obj, data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        if not request.user.can_access(models.JobLaunchConfig, 'add', serializer.validated_data, template=obj):
            raise PermissionDenied()

        new_job = obj.create_unified_job(**serializer.validated_data)
        new_job.signal_start()

        data = OrderedDict()
        data['workflow_job'] = new_job.id
        data['ignored_fields'] = serializer._ignored_fields
        data.update(serializers.WorkflowJobSerializer(new_job, context=self.get_serializer_context()).to_representation(new_job))
        headers = {'Location': new_job.get_absolute_url(request)}
        return Response(data, status=status.HTTP_201_CREATED, headers=headers)


class WorkflowJobRelaunch(GenericAPIView):
    model = models.WorkflowJob
    obj_permission_type = 'start'
    serializer_class = serializers.EmptySerializer

    def check_object_permissions(self, request, obj):
        if request.method == 'POST' and obj:
            relaunch_perm, messages = request.user.can_access_with_errors(self.model, 'start', obj)
            if not relaunch_perm and 'workflow_job_template' in messages:
                self.permission_denied(request, message=messages['workflow_job_template'])
        return super(WorkflowJobRelaunch, self).check_object_permissions(request, obj)

    def get(self, request, *args, **kwargs):
        return Response({})

    def post(self, request, *args, **kwargs):
        obj = self.get_object()
        from_failed = request.data.get('nodes') == 'failed'
        if obj.is_sliced_job:
            if from_failed:
                raise ParseError(_('Cannot relaunch a sliced workflow job from failed nodes.'))
            jt = obj.job_template
            if not jt:
                raise ParseError(_('Cannot relaunch slice workflow job orphaned from job template.'))
            elif getattr(obj.inventory, 'kind', None) != 'federated' and (
                not obj.inventory or jt.get_effective_slice_ct({'inventory': obj.inventory}) != obj.workflow_nodes.count()
            ):
                raise ParseError(_('Cannot relaunch sliced workflow job after slice count has changed.'))
        if from_failed:
            if not obj.workflow_nodes.filter(job__status__in=['failed', 'error', 'canceled']).exists():
                # A workflow can be in a failed state with no failed job node if a
                # reached node's template was deleted; relaunching cannot fix that,
                # so reject with an accurate message rather than "no failed nodes".
                if obj.workflow_nodes.filter(do_not_run=False, job__isnull=True, unified_job_template__isnull=True).exists():
                    raise ParseError(
                        _('Cannot relaunch from failed nodes: this workflow failed because a node has no job template, which relaunching cannot recover.')
                    )
                raise ParseError(_('This workflow job has no failed nodes to relaunch from.'))
        new_workflow_job = obj.create_relaunch_workflow_job(from_failed=from_failed)
        new_workflow_job.signal_start()

        data = serializers.WorkflowJobSerializer(new_workflow_job, context=self.get_serializer_context()).data
        headers = {'Location': new_workflow_job.get_absolute_url(request=request)}
        return Response(data, status=status.HTTP_201_CREATED, headers=headers)


class WorkflowJobTemplateWorkflowNodesList(SubListCreateAPIView):
    model = models.WorkflowJobTemplateNode
    serializer_class = serializers.WorkflowJobTemplateNodeSerializer
    parent_model = models.WorkflowJobTemplate
    relationship = 'workflow_job_template_nodes'
    parent_key = 'workflow_job_template'
    search_fields = ('unified_job_template__name', 'unified_job_template__description')
    ordering = ('id',)  # assure ordering by id for consistency
    filter_read_permission = False


class WorkflowJobTemplateJobsList(SubListAPIView):
    model = models.WorkflowJob
    serializer_class = serializers.WorkflowJobListSerializer
    parent_model = models.WorkflowJobTemplate
    relationship = 'workflow_jobs'
    parent_key = 'workflow_job_template'


class WorkflowJobTemplateSchedulesList(SubListCreateAPIView):
    name = _("Workflow Job Template Schedules")

    model = models.Schedule
    serializer_class = serializers.ScheduleSerializer
    parent_model = models.WorkflowJobTemplate
    relationship = 'schedules'
    parent_key = 'unified_job_template'


class WorkflowJobTemplateNotificationTemplatesAnyList(SubListCreateAttachDetachAPIView):
    model = models.NotificationTemplate
    serializer_class = serializers.NotificationTemplateSerializer
    parent_model = models.WorkflowJobTemplate


class WorkflowJobTemplateNotificationTemplatesStartedList(WorkflowJobTemplateNotificationTemplatesAnyList):
    relationship = 'notification_templates_started'


class WorkflowJobTemplateNotificationTemplatesErrorList(WorkflowJobTemplateNotificationTemplatesAnyList):
    relationship = 'notification_templates_error'


class WorkflowJobTemplateNotificationTemplatesSuccessList(WorkflowJobTemplateNotificationTemplatesAnyList):
    relationship = 'notification_templates_success'


class WorkflowJobTemplateNotificationTemplatesApprovalList(WorkflowJobTemplateNotificationTemplatesAnyList):
    relationship = 'notification_templates_approvals'


class WorkflowJobTemplateAccessList(ResourceAccessList):
    model = models.User  # needs to be User for AccessLists's
    parent_model = models.WorkflowJobTemplate


class WorkflowJobTemplateObjectRolesList(SubListAPIView):
    model = models.Role
    serializer_class = serializers.RoleSerializer
    parent_model = models.WorkflowJobTemplate
    search_fields = ('role_field', 'content_type__model')

    def get_queryset(self):
        po = self.get_parent_object()
        content_type = ContentType.objects.get_for_model(self.parent_model)
        return models.Role.objects.filter(content_type=content_type, object_id=po.pk)


class WorkflowJobTemplateActivityStreamList(SubListAPIView):
    model = models.ActivityStream
    serializer_class = serializers.ActivityStreamSerializer
    parent_model = models.WorkflowJobTemplate
    relationship = 'activitystream_set'
    search_fields = ('changes',)

    def get_queryset(self):
        parent = self.get_parent_object()
        self.check_parent_access(parent)
        qs = self.request.user.get_queryset(self.model)
        return qs.filter(Q(workflow_job_template=parent) | Q(workflow_job_template_node__workflow_job_template=parent)).distinct()


class WorkflowJobList(ListAPIView):
    model = models.WorkflowJob
    serializer_class = serializers.WorkflowJobListSerializer


class WorkflowJobDetail(UnifiedJobDeletionMixin, RetrieveDestroyAPIView):
    model = models.WorkflowJob
    serializer_class = serializers.WorkflowJobSerializer


class WorkflowJobWorkflowNodesList(SubListAPIView):
    model = models.WorkflowJobNode
    serializer_class = serializers.WorkflowJobNodeListSerializer
    always_allow_superuser = True
    parent_model = models.WorkflowJob
    relationship = 'workflow_job_nodes'
    parent_key = 'workflow_job'
    search_fields = ('unified_job_template__name', 'unified_job_template__description')
    ordering = ('id',)  # assure ordering by id for consistency
    filter_read_permission = False


class WorkflowJobCancel(GenericCancelView):
    model = models.WorkflowJob
    serializer_class = serializers.WorkflowJobCancelSerializer

    def post(self, request, *args, **kwargs):
        r = super().post(request, *args, **kwargs)
        ScheduleWorkflowManager().schedule()
        return r


class WorkflowJobNotificationsList(SubListAPIView):
    model = models.Notification
    serializer_class = serializers.NotificationSerializer
    parent_model = models.WorkflowJob
    relationship = 'notifications'
    search_fields = ('subject', 'notification_type', 'body')

    def get_sublist_queryset(self, parent):
        return self.model.objects.filter(
            Q(unifiedjob_notifications=parent)
            | Q(unifiedjob_notifications__unified_job_node__workflow_job=parent, unifiedjob_notifications__workflowapproval__isnull=False)
        ).distinct()


class WorkflowJobActivityStreamList(SubListAPIView):
    model = models.ActivityStream
    serializer_class = serializers.ActivityStreamSerializer
    parent_model = models.WorkflowJob
    relationship = 'activitystream_set'
    search_fields = ('changes',)


class WorkflowJobLabelList(JobLabelList):
    parent_model = models.WorkflowJob


class WorkflowApprovalTemplateDetail(RelatedJobsPreventDeleteMixin, RetrieveUpdateDestroyAPIView):
    model = models.WorkflowApprovalTemplate
    serializer_class = serializers.WorkflowApprovalTemplateSerializer


class WorkflowApprovalTemplateJobsList(SubListAPIView):
    model = models.WorkflowApproval
    serializer_class = serializers.WorkflowApprovalListSerializer
    parent_model = models.WorkflowApprovalTemplate
    relationship = 'approvals'
    parent_key = 'workflow_approval_template'


class WorkflowApprovalList(ListAPIView):
    model = models.WorkflowApproval
    serializer_class = serializers.WorkflowApprovalListSerializer

    def get(self, request, *args, **kwargs):
        return super(WorkflowApprovalList, self).get(request, *args, **kwargs)


class WorkflowApprovalDetail(UnifiedJobDeletionMixin, RetrieveDestroyAPIView):
    model = models.WorkflowApproval
    serializer_class = serializers.WorkflowApprovalSerializer


class WorkflowApprovalApprove(RetrieveAPIView):
    model = models.WorkflowApproval
    serializer_class = serializers.WorkflowApprovalViewSerializer
    permission_classes = (WorkflowApprovalPermission,)

    def post(self, request, *args, **kwargs):
        obj = self.get_object()
        if not request.user.can_access(models.WorkflowApproval, 'approve_or_deny', obj):
            raise PermissionDenied(detail=_("User does not have permission to approve or deny this workflow."))
        if obj.status != 'pending':
            return Response({"error": _("This workflow step has already been approved or denied.")}, status=status.HTTP_400_BAD_REQUEST)
        if obj.has_vote_from(request.user):
            return Response({"error": _("You have already voted on this workflow step.")}, status=status.HTTP_400_BAD_REQUEST)
        obj.approve(request, comment=_approval_vote_comment(request))
        return Response(status=status.HTTP_204_NO_CONTENT)


class WorkflowApprovalDeny(RetrieveAPIView):
    model = models.WorkflowApproval
    serializer_class = serializers.WorkflowApprovalViewSerializer
    permission_classes = (WorkflowApprovalPermission,)

    def post(self, request, *args, **kwargs):
        obj = self.get_object()
        if not request.user.can_access(models.WorkflowApproval, 'approve_or_deny', obj):
            raise PermissionDenied(detail=_("User does not have permission to approve or deny this workflow."))
        if obj.status != 'pending':
            return Response({"error": _("This workflow step has already been approved or denied.")}, status=status.HTTP_400_BAD_REQUEST)
        if obj.has_vote_from(request.user):
            return Response({"error": _("You have already voted on this workflow step.")}, status=status.HTTP_400_BAD_REQUEST)
        obj.deny(request, comment=_approval_vote_comment(request))
        return Response(status=status.HTTP_204_NO_CONTENT)


class WorkflowApprovalVotesList(SubListAPIView):
    model = models.WorkflowApprovalVote
    serializer_class = serializers.WorkflowApprovalVoteSerializer
    parent_model = models.WorkflowApproval
    relationship = 'votes'
    parent_key = 'workflow_approval'
    search_fields = ('workflow_approval_name', 'workflow_job_name', 'user_name', 'comment')


class WorkflowApprovalVoteList(ListAPIView):
    model = models.WorkflowApprovalVote
    serializer_class = serializers.WorkflowApprovalVoteSerializer
    search_fields = ('workflow_approval_name', 'workflow_job_name', 'user_name', 'comment')


class WorkflowApprovalVoteDetail(RetrieveAPIView):
    model = models.WorkflowApprovalVote
    serializer_class = serializers.WorkflowApprovalVoteSerializer


# The same lowercase_with_underscore view functions awx/api/views/__init__.py
# makes for the classes it still holds, so moving these out takes nothing away.
this_module = sys.modules[__name__]
for attr, value in list(locals().items()):
    if isinstance(value, type) and issubclass(value, APIView):
        name = camelcase_to_underscore(attr)
        view = value.as_view()
        setattr(this_module, name, view)
