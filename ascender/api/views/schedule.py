# Copyright (c) 2026 Ascender
# All Rights Reserved.
"""
Schedules: what runs later, and the preview of when it will.

Lifted out of ascender/api/views/__init__.py, which had grown to 1,287 lines and
60 classes with no order to them. Nothing here changed on the way across.
"""

import dateutil
from django.utils.timezone import now
from django.utils.translation import gettext_lazy as _
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from datetime import timezone as dt_timezone
from ascender.api.generics import (
    APIView,
    GenericAPIView,
    ListCreateAPIView,
    RetrieveUpdateDestroyAPIView,
    SubListAPIView,
    SubListAttachDetachAPIView,
)
from ascender.api.views.labels import LabelSubListCreateAttachDetachView
from ascender.main import models
from ascender.api import serializers

# the shared bases these views are built on, which stay where they are
from ascender.api.views import (
    LaunchConfigCredentialsBase,
)


class ScheduleList(ListCreateAPIView):
    name = _("Schedules")
    model = models.Schedule
    serializer_class = serializers.ScheduleSerializer
    ordering = ('id',)


class ScheduleDetail(RetrieveUpdateDestroyAPIView):
    model = models.Schedule
    serializer_class = serializers.ScheduleSerializer


class SchedulePreview(GenericAPIView):
    model = models.Schedule
    name = _('Schedule Recurrence Rule Preview')
    serializer_class = serializers.SchedulePreviewSerializer
    permission_classes = (IsAuthenticated,)

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        if serializer.is_valid():
            next_stamp = now()
            schedule = []
            gen = models.Schedule.rrulestr(serializer.validated_data['rrule']).xafter(next_stamp, count=20)

            # loop across the entire generator and grab the first 10 events
            for event in gen:
                if len(schedule) >= 10:
                    break
                if not dateutil.tz.datetime_exists(event):
                    # skip imaginary dates, like 2:30 on DST boundaries
                    continue
                schedule.append(event)

            return Response({'local': schedule, 'utc': [s.astimezone(dt_timezone.utc) for s in schedule]})
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ScheduleZoneInfo(APIView):
    swagger_topic = 'System Configuration'

    def get(self, request):
        return Response({'zones': models.Schedule.get_zoneinfo(), 'links': models.Schedule.get_zoneinfo_links()})


class ScheduleCredentialsList(LaunchConfigCredentialsBase):
    parent_model = models.Schedule


class ScheduleLabelsList(LabelSubListCreateAttachDetachView):
    parent_model = models.Schedule


class ScheduleInstanceGroupList(SubListAttachDetachAPIView):
    model = models.InstanceGroup
    serializer_class = serializers.InstanceGroupSerializer
    parent_model = models.Schedule
    relationship = 'instance_groups'


class ScheduleUnifiedJobsList(SubListAPIView):
    model = models.UnifiedJob
    serializer_class = serializers.UnifiedJobListSerializer
    parent_model = models.Schedule
    relationship = 'unifiedjob_set'
    name = _('Schedule Jobs List')
