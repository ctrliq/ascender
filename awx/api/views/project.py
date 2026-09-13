# Copyright (c) 2026 Ascender
# All Rights Reserved.
"""
The project endpoints, and the updates that sync one from its source control.

Lifted out of awx/api/views/__init__.py, which had grown to 3,448 lines and
228 classes with no order to them. Nothing here changed on the way across.
"""

from collections import OrderedDict
from django.conf import settings
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.contrib.contenttypes.models import ContentType
from django.utils.translation import gettext_lazy as _
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework import status
from awx.api.generics import (
    CopyAPIView,
    GenericCancelView,
    ListAPIView,
    ListCreateAPIView,
    ResourceAccessList,
    RetrieveAPIView,
    RetrieveDestroyAPIView,
    RetrieveUpdateDestroyAPIView,
    SubListAPIView,
    SubListCreateAPIView,
)
from awx.main import models
from awx.api.permissions import ProjectUpdatePermission
from awx.api import serializers
from awx.api.views.mixin import RelatedJobsPreventDeleteMixin, UnifiedJobDeletionMixin
from awx.api.pagination import UnifiedJobEventPagination

# the shared bases these views are built on, which stay where they are
from awx.api.views import (
    ProjectNotificationTemplatesAnyList,
    UnifiedJobStdout,
)


class ProjectList(ListCreateAPIView):
    model = models.Project
    serializer_class = serializers.ProjectSerializer


class ProjectDetail(RelatedJobsPreventDeleteMixin, RetrieveUpdateDestroyAPIView):
    model = models.Project
    serializer_class = serializers.ProjectSerializer


class ProjectPlaybooks(RetrieveAPIView):
    model = models.Project
    serializer_class = serializers.ProjectPlaybooksSerializer


class ProjectInventories(RetrieveAPIView):
    model = models.Project
    serializer_class = serializers.ProjectInventoriesSerializer


class ProjectTeamsList(ListAPIView):
    model = models.Team
    serializer_class = serializers.TeamSerializer

    def get_queryset(self):
        p = get_object_or_404(models.Project, pk=self.kwargs['pk'])
        if not self.request.user.can_access(models.Project, 'read', p):
            raise PermissionDenied()
        project_ct = ContentType.objects.get_for_model(models.Project)
        team_ct = ContentType.objects.get_for_model(self.model)
        all_roles = models.Role.objects.filter(Q(descendents__content_type=project_ct) & Q(descendents__object_id=p.pk), content_type=team_ct)
        return self.model.accessible_objects(self.request.user, 'read_role').filter(pk__in=[t.content_object.pk for t in all_roles])


class ProjectSchedulesList(SubListCreateAPIView):
    name = _("Project Schedules")

    model = models.Schedule
    serializer_class = serializers.ScheduleSerializer
    parent_model = models.Project
    relationship = 'schedules'
    parent_key = 'unified_job_template'


class ProjectScmInventorySources(SubListAPIView):
    name = _("Project SCM Inventory Sources")
    model = models.InventorySource
    serializer_class = serializers.InventorySourceSerializer
    parent_model = models.Project
    relationship = 'scm_inventory_sources'
    parent_key = 'source_project'


class ProjectActivityStreamList(SubListAPIView):
    model = models.ActivityStream
    serializer_class = serializers.ActivityStreamSerializer
    parent_model = models.Project
    relationship = 'activitystream_set'
    search_fields = ('changes',)

    def get_queryset(self):
        parent = self.get_parent_object()
        self.check_parent_access(parent)
        qs = self.request.user.get_queryset(self.model)
        if parent is None:
            return qs
        elif parent.credential is None:
            return qs.filter(project=parent)
        return qs.filter(Q(project=parent) | Q(credential=parent.credential))


class ProjectNotificationTemplatesStartedList(ProjectNotificationTemplatesAnyList):
    relationship = 'notification_templates_started'


class ProjectNotificationTemplatesErrorList(ProjectNotificationTemplatesAnyList):
    relationship = 'notification_templates_error'


class ProjectNotificationTemplatesSuccessList(ProjectNotificationTemplatesAnyList):
    relationship = 'notification_templates_success'


class ProjectUpdatesList(SubListAPIView):
    model = models.ProjectUpdate
    serializer_class = serializers.ProjectUpdateListSerializer
    parent_model = models.Project
    relationship = 'project_updates'


class ProjectUpdateView(RetrieveAPIView):
    model = models.Project
    serializer_class = serializers.ProjectUpdateViewSerializer
    permission_classes = (ProjectUpdatePermission,)

    def post(self, request, *args, **kwargs):
        obj = self.get_object()
        if obj.can_update:
            project_update = obj.update()
            if not project_update:
                return Response({}, status=status.HTTP_400_BAD_REQUEST)
            else:
                data = OrderedDict()
                data['project_update'] = project_update.id
                data.update(serializers.ProjectUpdateSerializer(project_update, context=self.get_serializer_context()).to_representation(project_update))
                headers = {'Location': project_update.get_absolute_url(request=request)}
                return Response(data, headers=headers, status=status.HTTP_202_ACCEPTED)
        else:
            return self.http_method_not_allowed(request, *args, **kwargs)


class ProjectUpdateList(ListAPIView):
    model = models.ProjectUpdate
    serializer_class = serializers.ProjectUpdateListSerializer


class ProjectUpdateDetail(UnifiedJobDeletionMixin, RetrieveDestroyAPIView):
    model = models.ProjectUpdate
    serializer_class = serializers.ProjectUpdateDetailSerializer


class ProjectUpdateEventsList(SubListAPIView):
    model = models.ProjectUpdateEvent
    serializer_class = serializers.ProjectUpdateEventSerializer
    parent_model = models.ProjectUpdate
    relationship = 'project_update_events'
    name = _('Project Update Events List')
    search_fields = ('stdout',)
    pagination_class = UnifiedJobEventPagination

    def finalize_response(self, request, response, *args, **kwargs):
        response['X-UI-Max-Events'] = settings.MAX_UI_JOB_EVENTS
        return super(ProjectUpdateEventsList, self).finalize_response(request, response, *args, **kwargs)

    def get_queryset(self):
        pu = self.get_parent_object()
        self.check_parent_access(pu)
        return pu.get_event_queryset()


class ProjectUpdateCancel(GenericCancelView):
    model = models.ProjectUpdate
    serializer_class = serializers.ProjectUpdateCancelSerializer


class ProjectUpdateNotificationsList(SubListAPIView):
    model = models.Notification
    serializer_class = serializers.NotificationSerializer
    parent_model = models.ProjectUpdate
    relationship = 'notifications'
    search_fields = ('subject', 'notification_type', 'body')


class ProjectUpdateScmInventoryUpdates(SubListAPIView):
    name = _("Project Update SCM Inventory Updates")
    model = models.InventoryUpdate
    serializer_class = serializers.InventoryUpdateListSerializer
    parent_model = models.ProjectUpdate
    relationship = 'scm_inventory_updates'
    parent_key = 'source_project_update'


class ProjectAccessList(ResourceAccessList):
    model = models.User  # needs to be User for AccessLists's
    parent_model = models.Project


class ProjectObjectRolesList(SubListAPIView):
    model = models.Role
    serializer_class = serializers.RoleSerializer
    parent_model = models.Project
    search_fields = ('role_field', 'content_type__model')

    def get_queryset(self):
        po = self.get_parent_object()
        content_type = ContentType.objects.get_for_model(self.parent_model)
        return models.Role.objects.filter(content_type=content_type, object_id=po.pk)


class ProjectCopy(CopyAPIView):
    model = models.Project
    copy_return_serializer_class = serializers.ProjectSerializer


class ProjectUpdateStdout(UnifiedJobStdout):
    model = models.ProjectUpdate
