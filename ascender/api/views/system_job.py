# Copyright (c) 2026 Ascender
# All Rights Reserved.
"""
System jobs: the management tasks the platform runs on itself, and their templates.

Lifted out of awx/api/views/__init__.py, which had grown to 1,732 lines and
94 classes with no order to them. Nothing here changed on the way across.
"""

from collections import OrderedDict
from django.conf import settings
from django.utils.translation import gettext_lazy as _
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework import status
from ascender.api.generics import (
    GenericCancelView,
    GenericAPIView,
    ListAPIView,
    RetrieveAPIView,
    RetrieveDestroyAPIView,
    SubListAPIView,
    SubListCreateAPIView,
)
from ascender.main import models
from ascender.api import serializers
from ascender.api.views.mixin import UnifiedJobDeletionMixin
from ascender.api.pagination import UnifiedJobEventPagination

# the shared bases these views are built on, which stay where they are
from ascender.api.views import (
    SystemJobTemplateNotificationTemplatesAnyList,
)


class SystemJobEventsList(SubListAPIView):
    model = models.SystemJobEvent
    serializer_class = serializers.SystemJobEventSerializer
    parent_model = models.SystemJob
    relationship = 'system_job_events'
    name = _('System Job Events List')
    search_fields = ('stdout',)
    pagination_class = UnifiedJobEventPagination

    def finalize_response(self, request, response, *args, **kwargs):
        response['X-UI-Max-Events'] = settings.MAX_UI_JOB_EVENTS
        return super(SystemJobEventsList, self).finalize_response(request, response, *args, **kwargs)

    def get_queryset(self):
        job = self.get_parent_object()
        self.check_parent_access(job)
        return job.get_event_queryset()


class SystemJobTemplateList(ListAPIView):
    model = models.SystemJobTemplate
    serializer_class = serializers.SystemJobTemplateSerializer

    def get(self, request, *args, **kwargs):
        if not request.user.is_superuser and not request.user.is_system_auditor:
            raise PermissionDenied(_("Superuser privileges needed."))
        return super(SystemJobTemplateList, self).get(request, *args, **kwargs)


class SystemJobTemplateDetail(RetrieveAPIView):
    model = models.SystemJobTemplate
    serializer_class = serializers.SystemJobTemplateSerializer


class SystemJobTemplateLaunch(GenericAPIView):
    model = models.SystemJobTemplate
    obj_permission_type = 'start'
    serializer_class = serializers.EmptySerializer

    def get(self, request, *args, **kwargs):
        return Response({})

    def post(self, request, *args, **kwargs):
        obj = self.get_object()

        new_job = obj.create_unified_job(extra_vars=request.data.get('extra_vars', {}))
        new_job.signal_start()
        data = OrderedDict()
        data['system_job'] = new_job.id
        data.update(serializers.SystemJobSerializer(new_job, context=self.get_serializer_context()).to_representation(new_job))
        headers = {'Location': new_job.get_absolute_url(request)}
        return Response(data, status=status.HTTP_201_CREATED, headers=headers)


class SystemJobTemplateSchedulesList(SubListCreateAPIView):
    name = _("System Job Template Schedules")

    model = models.Schedule
    serializer_class = serializers.ScheduleSerializer
    parent_model = models.SystemJobTemplate
    relationship = 'schedules'
    parent_key = 'unified_job_template'


class SystemJobTemplateJobsList(SubListAPIView):
    model = models.SystemJob
    serializer_class = serializers.SystemJobListSerializer
    parent_model = models.SystemJobTemplate
    relationship = 'jobs'
    parent_key = 'system_job_template'


class SystemJobTemplateNotificationTemplatesStartedList(SystemJobTemplateNotificationTemplatesAnyList):
    relationship = 'notification_templates_started'


class SystemJobTemplateNotificationTemplatesErrorList(SystemJobTemplateNotificationTemplatesAnyList):
    relationship = 'notification_templates_error'


class SystemJobTemplateNotificationTemplatesSuccessList(SystemJobTemplateNotificationTemplatesAnyList):
    relationship = 'notification_templates_success'


class SystemJobList(ListAPIView):
    model = models.SystemJob
    serializer_class = serializers.SystemJobListSerializer

    def get(self, request, *args, **kwargs):
        if not request.user.is_superuser and not request.user.is_system_auditor:
            raise PermissionDenied(_("Superuser privileges needed."))
        return super(SystemJobList, self).get(request, *args, **kwargs)


class SystemJobDetail(UnifiedJobDeletionMixin, RetrieveDestroyAPIView):
    model = models.SystemJob
    serializer_class = serializers.SystemJobSerializer


class SystemJobCancel(GenericCancelView):
    model = models.SystemJob
    serializer_class = serializers.SystemJobCancelSerializer


class SystemJobNotificationsList(SubListAPIView):
    model = models.Notification
    serializer_class = serializers.NotificationSerializer
    parent_model = models.SystemJob
    relationship = 'notifications'
    search_fields = ('subject', 'notification_type', 'body')
